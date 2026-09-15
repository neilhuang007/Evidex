# DeepSeek card interface trial

Date: 2026-09-15
Model: `deepseek-flash` (V4.1 Flash)
Mode: non-thinking, JSON output, one attempt, maximum 1,000 output tokens
Calls: 8 total (4 fixtures × 2 interfaces)

## Result

Markdown bold is the simpler and more reliable authoring interface. Agents should submit or generate `**bold spans**`; Evidex should validate the unmarked quote against the source and derive character offsets and legacy `<HL>` tags itself.

| Interface | Exact grounded quote | Structurally valid highlight | Highlight selects intended text | Avg. latency | Total prompt tokens | Total completion tokens |
|---|---:|---:|---:|---:|---:|---:|
| Markdown bold | 4/4 | 4/4 | 4/4 | 1,047 ms | 652 | 199 |
| Character offsets | 4/4 | 4/4 | 0/4 | 1,254 ms | 752 | 248 |

The offset ranges were integers, ordered, non-overlapping, and within each quote, so shallow schema validation passed. They were still positioned incorrectly in every fixture. Examples of the actual substrings selected by returned offsets include:

- repeated-word fixture: `ds fell ` and `y 18 perce`
- negation fixture: ` declin`, `oduction`, ` output i`, and ` increase`
- qualification fixture: several ranges began or ended inside words, including `average`, `math scores improved on`, and `gained 9 percentil`

Markdown was also about 17% faster in this small trial, with 13% fewer prompt tokens and 20% fewer completion tokens. Both interfaces preserved the exact contiguous source quote in all cases. Markdown correctly preserved the important negation (`did not find a decline in production`) and qualification (`only among students who attended at least 80 percent of sessions`).

## Fixtures

The four synthetic fixtures covered repeated phrases, multi-sentence context, negation, and a conditional/qualified claim. The executable trial is [deepseek-interface-trial.mjs](./deepseek-interface-trial.mjs). It reads credentials from the environment and never prints them.

## Decision

Keep one compact Markdown prompt in `config/prompts/card_cutter.json`. Do not ask a model to count character offsets. Return server-derived `plainText`, `markdownContent`, canonical `<HL>` content, and validated highlight offsets so clients can use whichever representation is convenient without duplicating parsing logic.
