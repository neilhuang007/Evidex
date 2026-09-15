"""Browser regression checks for tutorial lifecycle and replay behavior."""

import os
from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("EVIDEX_API_URL", "http://127.0.0.1:3000")


def is_visible(page, selector):
    return page.locator(selector).evaluate(
        "el => getComputedStyle(el).display !== 'none' && "
        "getComputedStyle(el).visibility !== 'hidden' && "
        "Number(getComputedStyle(el).opacity || 1) > 0"
    )


def reload_ready(page):
    page.reload(wait_until="domcontentloaded")
    page.wait_for_timeout(150)


def run():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        page.set_default_timeout(5_000)
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))

        page.goto(BASE_URL, wait_until="domcontentloaded")
        page.wait_for_function("window.cardCutterApp && window.onboarding && window.whatsNewTutorial")

        # Reproduce the first-card transition without making an API call. This is
        # the production path that currently schedules onboarding.
        page.evaluate("window.cardCutterApp.switchToSplitLayout(false)")
        page.locator("#onboarding-overlay.show").wait_for()

        page.locator("#skip-btn").click()
        page.wait_for_timeout(100)
        assert not is_visible(page, "#onboarding-overlay"), (
            "Skip should close first-time onboarding"
        )

        # Finishing the first tutorial before the independent What's New timer
        # fires must not open a second unsolicited tutorial in the same startup.
        page.wait_for_timeout(2_200)
        assert not is_visible(page, "#whatsnew-overlay"), (
            "A second tutorial opened automatically in the same startup"
        )

        # The next startup may show the unseen versioned What's New tutorial.
        reload_ready(page)
        page.locator("#whatsnew-overlay.show").wait_for()
        assert not is_visible(page, "#onboarding-overlay"), (
            "Completed onboarding repeated on a later startup"
        )
        page.locator("#whatsnew-skip-btn").click()

        reload_ready(page)
        page.wait_for_timeout(2_700)
        assert not is_visible(page, "#onboarding-overlay"), (
            "Onboarding repeated after completion"
        )
        assert not is_visible(page, "#whatsnew-overlay"), (
            "What's New repeated after dismissal"
        )

        # Explicit replay is opt-in and a single click should open one tutorial.
        page.evaluate("window.onboarding.start({force: true})")
        page.wait_for_timeout(100)
        assert is_visible(page, "#onboarding-overlay"), (
            "Explicit tutorial replay did not open onboarding"
        )
        assert not is_visible(page, "#whatsnew-overlay"), (
            "Explicit tutorial replay opened two overlays"
        )
        page.locator("#skip-btn").click()

        # What's New has its own explicit replay and must also remain dismissed.
        assert page.locator("#whatsnew-trigger").count() == 1, (
            "What's New replay control disappeared after dismissal"
        )
        page.evaluate("document.querySelector('#whatsnew-trigger').click()")
        page.wait_for_timeout(100)
        assert is_visible(page, "#whatsnew-overlay"), (
            "Explicit What's New replay did not open"
        )
        page.locator("#whatsnew-skip-btn").click()
        reload_ready(page)
        assert not is_visible(page, "#whatsnew-overlay"), (
            "Dismissed What's New repeated after reload"
        )

        # Repeated init calls are harmless, and closing the custom-order modal
        # cancels its delayed contextual tutorial.
        page.evaluate("window.onboarding.init(); window.onboarding.init(); window.whatsNewTutorial.init()")
        page.wait_for_timeout(650)
        assert not is_visible(page, "#onboarding-overlay")
        page.evaluate("window.cardCutterApp.openCustomOrderModal()")
        page.wait_for_timeout(50)
        page.locator("#close-modal").click()
        page.wait_for_timeout(500)
        assert page.locator("#custom-order-modal .tutorial-overlay").count() == 0, (
            "Custom-order tutorial appeared after its modal was closed"
        )

        assert not errors, f"Browser page errors: {errors}"
        browser.close()


if __name__ == "__main__":
    run()
    print("onboarding lifecycle: PASS")
