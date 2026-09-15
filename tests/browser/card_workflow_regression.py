"""Browser checks for local-source cutting and agent-supplied card imports."""

import json
import os
from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("EVIDEX_API_URL", "http://127.0.0.1:3000")


def run():
    api_calls = []
    cite_should_fail = {"value": False}
    os.makedirs(".smoke-output", exist_ok=True)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 390, "height": 844})
        context.add_init_script(
            """
            localStorage.setItem('evidex_onboarding_completed', 'true');
            localStorage.setItem('evidex_whatsnew_custom_export_v1', 'true');
            localStorage.setItem('customOrderTutorialCompleted', 'true');
            localStorage.removeItem('cardsMemory');
            """
        )
        page = context.new_page()
        page.set_default_timeout(5_000)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))

        def handle_api(route, request):
            api_calls.append({"url": request.url, "body": request.post_data_json or {}})
            if request.url.endswith("/api/cite"):
                if cite_should_fail["value"]:
                    route.fulfill(
                        status=502,
                        content_type="application/json",
                        body='{"error":{"code":"source_fetch_failed","message":"Could not fetch source"}}',
                    )
                    return
                route.fulfill(
                    status=200,
                    content_type="application/json",
                    body=json.dumps(
                        {
                            "status": "success",
                            "cite": "Local Source, 2026",
                            "content": "A <HL>strong result</HL>\n<script>window.__evidexXss = true</script>",
                            "evaluation": {
                                "score": 5,
                                "credibility": {"score": 8, "reasoning": "fixture"},
                                "support": {"score": 8, "reasoning": "fixture"},
                                "contradictions": {"score": 1, "reasoning": "fixture"},
                            },
                        }
                    ),
                )
            else:
                route.fulfill(status=500, content_type="application/json", body='{"error":"unexpected request"}')

        page.route("**/api/**", handle_api)
        page.goto(BASE_URL, wait_until="domcontentloaded")
        page.wait_for_function("window.cardCutterApp && window.editingPanel")

        # A pasted source is sufficient; it is sent directly to /api/cite and
        # must not take the free-form extraction path.
        page.locator("#source-text-details summary").click()
        page.locator("#source-text-input").fill("A strong result from the full article source.")
        page.locator("#claim-input").fill("Local sources work")
        page.locator("#cut-button").click()
        page.locator(".group-card:not(:has(.mini-loading))").wait_for()

        cite_calls = [call for call in api_calls if call["url"].endswith("/api/cite")]
        extract_calls = [call for call in api_calls if call["url"].endswith("/api/extract-evidence")]
        assert len(cite_calls) == 1, f"Expected one cite call, got {cite_calls}"
        assert cite_calls[0]["body"]["sourceText"] == "A strong result from the full article source."
        assert cite_calls[0]["body"].get("link", "") == ""
        assert not extract_calls, f"Pasted source used extraction endpoint: {extract_calls}"
        assert page.locator("#source-text-input").input_value() == ""

        content = page.locator(".group-card .group-content").first
        assert content.locator(".highlight").count() == 1
        assert content.locator("br").count() == 1
        assert content.locator("script").count() == 0
        assert "<script>window.__evidexXss = true</script>" in content.inner_text()
        assert page.evaluate("window.__evidexXss") is None

        # A failed remote fetch keeps the form values and opens the local-text
        # fallback so the user can recover without re-entering the claim.
        page.evaluate("document.querySelector('#source-text-details').open = false")
        page.locator("#url-input").fill("https://example.com/restricted")
        page.locator("#claim-input").fill("Keep this claim")
        cite_should_fail["value"] = True
        page.locator("#cut-button").click()
        page.locator(".toast-message", has_text="Paste the article text").wait_for()
        assert page.locator("#source-text-details").evaluate("element => element.open") is True
        assert page.locator("#url-input").input_value() == "https://example.com/restricted"
        assert page.locator("#claim-input").input_value() == "Keep this claim"
        cite_should_fail["value"] = False

        # An agent-supplied completed card is imported locally with Markdown
        # bold converted to canonical highlights and no model/API request.
        calls_before_import = len(api_calls)
        page.evaluate(
            """
            async () => window.cardCutterApp.importMultipleEvidence([{
              tagline: 'Agent card',
              link: 'javascript:alert(1)',
              cite: 'Agent, 2026',
              markdownContent: 'Alpha **beta**\\n<em>literal markup</em>'
            }])
            """
        )
        assert len(api_calls) == calls_before_import, "Completed card import unexpectedly called an API"
        stored = page.evaluate("window.cardCutterApp.cards.find(card => card.tagline === 'Agent card')")
        assert stored["cite"] == "Agent, 2026"
        assert stored["link"] == ""
        assert stored["content"] == "Alpha <HL>beta</HL>\n<em>literal markup</em>"
        agent_card = page.locator(".group-card", has_text="Agent, 2026")
        assert agent_card.locator(".highlight").inner_text() == "beta"
        assert agent_card.locator("em").count() == 0
        assert "<em>literal markup</em>" in agent_card.locator(".group-content").inner_text()

        # Drive the real selection toolbar. A mixed selection becomes fully
        # highlighted; selecting an already-highlighted subsection removes only
        # that subsection while retaining both surrounding content and markup.
        agent_content = agent_card.locator(".group-content")
        agent_content.dispatch_event("click")
        agent_content.dispatch_event("click")
        assert agent_card.locator('.card-editing-panel').count() == 1

        def select_agent_text(start, end):
            page.evaluate(
                """
                ({selector, start, end}) => {
                  const root = document.querySelector(selector);
                  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
                  let position = 0, startPoint, endPoint, node;
                  while ((node = walker.nextNode())) {
                    const nodeEnd = position + node.length;
                    if (!startPoint && start >= position && start <= nodeEnd) startPoint = [node, start - position];
                    if (!endPoint && end >= position && end <= nodeEnd) endPoint = [node, end - position];
                    position = nodeEnd;
                    if (startPoint && endPoint) break;
                  }
                  const range = document.createRange();
                  range.setStart(...startPoint);
                  range.setEnd(...endPoint);
                  const selection = getSelection();
                  selection.removeAllRanges();
                  selection.addRange(range);
                }
                """,
                {"selector": f'.group-card[data-card-id="{stored["id"]}"] .group-content', "start": start, "end": end},
            )

        toggle = page.locator(f'.highlight-toggle[data-card-id="{stored["id"]}"]')
        select_agent_text(0, 10)
        toggle.dispatch_event("mousedown")
        toggle.dispatch_event("click")
        assert page.evaluate(
            "id => window.cardCutterApp.cards.find(card => card.id === id).content", stored["id"]
        ).startswith("<HL>Alpha beta</HL>")
        select_agent_text(6, 10)
        toggle.dispatch_event("mousedown")
        toggle.dispatch_event("click")
        assert page.evaluate(
            "id => window.cardCutterApp.cards.find(card => card.id === id).content", stored["id"]
        ).startswith("<HL>Alpha </HL>beta")

        # In-flight imports update by stable card ID. Reordering the array while
        # a response is pending must not overwrite whichever card lands at the
        # old numeric index.
        page.evaluate(
            """
            () => {
              window.__realFetch = window.fetch;
              window.fetch = (url, options) => {
                if (!String(url).endsWith('/api/cite')) return window.__realFetch(url, options);
                return new Promise(resolve => {
                  window.__finishDelayedCite = () => resolve(new Response(JSON.stringify({
                    cite: 'Delayed Source, 2026',
                    content: 'A <HL>delayed result</HL>',
                    evaluation: {score: 5, credibility: {}, support: {}, contradictions: {}}
                  }), {status: 200, headers: {'content-type': 'application/json'}}));
                });
              };
              window.__delayedImport = window.cardCutterApp.importMultipleEvidence([{
                tagline: 'Delayed card', link: 'https://example.com/delayed'
              }]);
            }
            """
        )
        page.wait_for_function("window.__finishDelayedCite && window.cardCutterApp.cards.some(card => card.tagline === 'Delayed card' && card.pending)")
        page.evaluate("window.cardCutterApp.cards.reverse(); window.cardCutterApp.renderCuts(); window.__finishDelayedCite()")
        page.evaluate("window.__delayedImport")
        page.evaluate("window.fetch = window.__realFetch")
        delayed = page.evaluate("window.cardCutterApp.cards.find(card => card.tagline === 'Delayed card')")
        assert delayed["cite"] == "Delayed Source, 2026"
        assert delayed["content"] == "A <HL>delayed result</HL>"
        assert page.evaluate(
            "id => window.cardCutterApp.cards.find(card => card.id === id).cite", stored["id"]
        ) == "Agent, 2026"

        page.wait_for_timeout(700)
        mobile_layout = page.evaluate(
            """
            () => {
              const cuts = document.querySelector('#cuts-panel').getBoundingClientRect();
              const input = document.querySelector('.input-card').getBoundingClientRect();
              return {
                viewport: innerWidth,
                scrollWidth: document.documentElement.scrollWidth,
                cuts: {left: cuts.left, right: cuts.right, width: cuts.width, bottom: cuts.bottom},
                input: {left: input.left, right: input.right, width: input.width, top: input.top}
              };
            }
            """
        )
        assert mobile_layout["scrollWidth"] <= mobile_layout["viewport"] + 1, mobile_layout
        assert mobile_layout["cuts"]["width"] >= 350, mobile_layout
        assert mobile_layout["input"]["width"] >= 350, mobile_layout
        assert mobile_layout["cuts"]["right"] <= mobile_layout["viewport"] + 1, mobile_layout
        assert mobile_layout["input"]["right"] <= mobile_layout["viewport"] + 1, mobile_layout
        assert mobile_layout["cuts"]["bottom"] <= mobile_layout["input"]["top"] + 1, mobile_layout

        page.set_viewport_size({"width": 1280, "height": 900})
        page.wait_for_timeout(100)
        desktop_layout = page.evaluate(
            """
            () => {
              const cuts = document.querySelector('#cuts-panel').getBoundingClientRect();
              const input = document.querySelector('.input-card').getBoundingClientRect();
              return {
                viewport: innerWidth,
                scrollWidth: document.documentElement.scrollWidth,
                cuts: {left: cuts.left, right: cuts.right, width: cuts.width, top: cuts.top},
                input: {left: input.left, right: input.right, width: input.width, top: input.top}
              };
            }
            """
        )
        assert desktop_layout["scrollWidth"] <= desktop_layout["viewport"] + 1, desktop_layout
        assert desktop_layout["input"]["width"] > desktop_layout["cuts"]["width"] > 300, desktop_layout
        assert abs(desktop_layout["input"]["top"] - desktop_layout["cuts"]["top"]) < 10, desktop_layout
        assert desktop_layout["input"]["right"] < desktop_layout["cuts"]["left"], desktop_layout

        assert page.evaluate("window.cardCutterApp.isValidUrl('javascript:alert(1)')") is False
        assert page.evaluate("window.cardCutterApp.isValidUrl('https://example.com/a')") is True
        assert not errors, f"Browser page errors: {errors}"
        page.set_viewport_size({"width": 390, "height": 844})
        page.screenshot(path=".smoke-output/card-workflow-mobile.png", full_page=True)
        browser.close()


if __name__ == "__main__":
    run()
    print("card workflow: PASS")
