# VALIDATION_PLAN.md — Disclosure Atlas

**The project is only credible if this passes.** Do not build the demo narrative on an unvalidated index.

---

## The claim we must earn

"Companies that the SEC later sanctioned for accounting issues disclosed in measurably similar ways, and our engine can surface that resemblance — including pulling a currently-clean company into a known-problem cluster."

If that's not true in the data, we find out **before** building the hero, not after.

## Ground truth

- **Positives:** companies with SEC AAERs. Capture the 10-K(s) from the period *before* the enforcement action.
- **Negatives:** a **matched clean set** — similar size, same SIC industries, same era, no enforcement history. Matching matters; an unmatched clean set makes the result look stronger than it is (industry alone could drive clustering).

## Tests (run by `validation/aaer_backtest.py`)

### Test 1 — Separation
Are enforced footnotes nearer to other enforced footnotes than to matched clean ones?
- Metric: mean intra-enforced cosine similarity vs mean enforced-to-clean similarity.
- Pass: enforced-enforced meaningfully higher (effect size recorded, not just a p-value).

### Test 2 — Retrieval (held-out)
Hold out a subset of enforced companies. From the remaining enforced neighbors, can we retrieve the held-out ones?
- Metric: precision@k / recall@k for enforced retrieval at k = 10, 25, 50.
- Pass: retrieval beats a random/keyword baseline by a defined margin.

### Test 3 — The headline example
Identify ≥1 currently-clean company whose disclosure lands inside an enforced cluster, with a *plausible, explainable* reason (not noise).
- This is the demo's emotional core. It must be **real and defensible**, never cherry-picked noise.
- Record why it's plausible; if we can't justify it to an auditor, we don't feature it.

### Test 4 — Semantic-beats-keyword
At least one query where keyword search fails (different words, same concept) and semantic search succeeds.
- Document both result sets side by side as proof.

## Honesty guardrails

- Report **effect sizes and baselines**, not cherry-picked wins.
- If clustering is weak, **say so** and narrow the footnote type / universe until a real signal exists — do not dress up noise.
- Distinguish "disclosure resembles enforced peers" from "company is committing fraud." The tool shows the former only.
- Matched negatives, held-out positives — no leakage between build and test.

## Gate

Build phases 4–6 (explanations, frontend, deploy) **do not start** until Tests 1, 2, and 4 pass and Test 3 has at least one defensible example. This is a hard gate in the build sequence.
