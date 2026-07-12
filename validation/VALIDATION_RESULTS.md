# VALIDATION_RESULTS.md — Disclosure Atlas Phase 3 (honest record)

Governed by VALIDATION_PLAN.md. **Result: the hard gate FAILS.** The central claim is not
supported by the data. This file records every test and cut honestly — weak/null signal is
surfaced, not dressed up (per the VALIDATION_PLAN honesty guardrails).

Corpus under test: 3,088 footnotes (rev_rec 2,332 / going_concern 756), 192 enforced + 283
matched-clean companies, bge-small-en-v1.5 embeddings (384-d, L2-normalized). Matched on SIC + era.

## The claim we needed to earn
"SEC-sanctioned companies disclosed (revenue-recognition / going-concern) in measurably similar
ways, surfaceable by semantic similarity — including pulling a clean company into a problem cluster."

## Test 1 — Separation (enforced↔enforced vs enforced↔clean)
| Cut | rev_rec | going_concern |
|---|---|---|
| Global (vs all clean) | diff −0.0039, **d=−0.095** | diff −0.0019, **d=−0.040** |
| **SIC-matched (correct design)** | diff +0.0002, **d=+0.004**, pct_closer 0.504 | diff −0.0036, **d=−0.060**, pct_closer 0.518 |
| High-confidence enforced only | d=−0.066 | d=−0.039 |
| Company-level (mean-pooled) | d=+0.122 (weak) | d=−0.095 |

**Verdict: FAIL.** Properly matched on industry, enforced footnotes are no more similar to each
other than to clean peers — separation is at chance (50.4%). Per-SIC pockets showed large Cohen's d
but those were small-n / paired-low-variance artifacts; the n-weighted matched effect is ~0.

## Test 2 — Retrieval (enforced enrichment in top-k, semantic vs TF-IDF keyword vs base rate)
| type | p@10 semantic | keyword | base rate | lift |
|---|---|---|---|---|
| rev_rec | 0.489 | 0.486 | 0.477 | 1.03× |
| going_concern | 0.395 | 0.356 | 0.398 | 0.99× |

**Verdict: FAIL (trivial).** Semantic retrieval barely exceeds the base rate (lift ≈1.0) and is
statistically indistinguishable from the keyword baseline. No meaningful enforced enrichment.

## Test 3 — Headline (clean company inside an enforced cluster)
Candidates exist mechanically (e.g. AMREP↔Hain Celestial cos 0.976), but with no real cohort
cluster structure (Tests 1–2 null), a clean footnote's enforced neighbors merely reflect the ~48%
enforced base rate. **No defensible headline example** — featuring one would be cherry-picked noise.

## Test 4 — Semantic beats keyword
Mechanically PASSES: e.g. Blue Coat Systems → Allin Corp (rev_rec), cosine 0.854, lexical Jaccard
0.16, keyword rank 631. The semantic engine genuinely finds concept matches keyword search misses.
**But** this only shows the engine works as a semantic search tool — it does **not** demonstrate any
enforcement signal.

## Decisive supervised check — can ANY model find the signal? (StratifiedGroupKFold by company)
| type | full-corpus AUC | conduct-window AUC (release−5y..−1y) |
|---|---|---|
| rev_rec | **0.506 ± 0.030** (chance) | 0.521 ± 0.061 |
| going_concern | **0.609 ± 0.090** (weak) | 0.563 ± 0.077 |

A grouped-CV classifier cannot distinguish enforced from clean revenue-recognition footnotes at all
(AUC≈0.51). Going-concern carries a weak, high-variance signal (AUC≈0.61) — real but far below a
"companies measurably cluster" bar, and it is a faint classification direction, not a tight cluster
(its similarity-separation is still negative).

## Why (interpretation, for the writeup)
Revenue-recognition and going-concern *policy footnotes* are heavily standardized (ASC 606 templates;
boilerplate going-concern language). Semantic embeddings of boilerplate capture topic/industry, which
matched negatives share by construction — so there is little room for an enforcement fingerprint.
This is consistent with the accounting-fraud-linguistics literature, where signal lives in MD&A tone,
hedging, and omissions rather than in the standardized accounting-policy notes.

## Independent reviewer verification (adversarial)
A separate reviewer agent independently reproduced the result with its own code: cohort labels 0/3,088
mismatches vs the enforcement table; embeddings 3,088×384, unit-normalized, row-aligned (DB = meta =
embeddings = 3,088, confirmed). Leakage-free grouped CV (0 companies shared across any train/test fold)
gives rev_rec AUC 0.506±0.030 (also 0.499 at C=10, 0.497 LinearSVC → not underfitting); going_concern
0.604. **Positive control:** classifying footnote_type on the same embeddings gives AUC 1.000 — the
pipeline is healthy and carries strong learnable structure, so the enforcement null is specific to
enforcement, not a broken embedding. Reviewer verdict: **the null is real and correctly concluded.**

## Gate decision
Tests 1 and 2 FAIL; Test 3 has no defensible example; only Test 4 (engine-works) and a weak
going-concern classification signal survive. **The VALIDATION_PLAN hard gate does NOT pass.**
Per the build sequence, Phases 4–6 (explanations, frontend, deploy) are NOT started. Escalated to
BLOCKERS.md for a direction decision. Reproduce with: `validation/aaer_backtest.py`,
`validation/narrow_experiments.py`.

---

# CHAPTER B — Re-validation at scale (6 footnote types, 94,455 footnotes) · 2026-06-26

**Result: the negative result holds, and now across four additional section types.** Expanding the
corpus ~30× (3,088 → 94,455 footnotes) and adding four new disclosure types — **related-party
transactions, critical audit matters (CAMs), MD&A, and risk factors** — did **not** reveal an
enforcement signal in disclosure language. The open question we posed honestly ("does narrative
text like MD&A / risk factors carry signal where boilerplate policy notes didn't?") is answered:
**no, not measurably.** No type clears the separation threshold; retrieval enrichment is small and
generally does not beat a keyword baseline; the "clean-in-enforced-cluster" candidates are explained
by industry co-membership, not by any fraud fingerprint.

This reinforces the v1 finding at much larger scale and is reported straight — weak/null is not
dressed up. The instrument remains a **comparative disclosure semantic-search tool**, not an
enforcement predictor. No new type earns an enforcement claim; all stay descriptive/comparative.

Corpus under test: 94,455 footnotes (rev_rec 22,922 / going_concern 6,266 / related_party 13,397 /
cam 4,971 / mda 15,679 / risk_factors 31,220) over 1,804 companies; 6,427 enforced-cohort vs 88,028
clean footnotes; bge-small-en-v1.5 (384-d, L2-normalized). Validation computed with lazy
similarity rows (no N×N matrix). Source: `validation/results.json`.

## Test 1 — Separation (enforced↔enforced vs enforced↔clean, per type)
Positive Cohen's d = enforced disclosures resemble *other enforced* disclosures more than they
resemble clean ones (an enforcement "fingerprint"). Threshold for a small-but-real effect: **d ≥ 0.2.**

| type | intra-enf | enf→clean | mean diff | **Cohen's d** | % enf closer to enf | n_enforced | reading |
|---|---|---|---|---|---|---|---|
| revenue recognition | 0.6715 | 0.6759 | −0.0044 | **−0.102** | 28.3% | 1,867 | no signal (slightly negative) |
| going concern | 0.7641 | 0.7569 | +0.0071 | **+0.151** | 78.8% | 491 | weak tendency, **below 0.2** |
| related-party | 0.6114 | 0.6200 | −0.0085 | **−0.250** | 29.4% | 741 | no signal (most negative) |
| CAMs | 0.7432 | 0.7387 | +0.0045 | **+0.178** | 74.2% | 190 | weak, below 0.2, small n |
| MD&A | 0.6078 | 0.6090 | −0.0013 | **−0.038** | 35.7% | 1,164 | no signal |
| risk factors | 0.5914 | 0.5906 | +0.0008 | **+0.023** | 57.5% | 1,974 | no signal (≈ zero) |

**No type reaches d ≥ 0.2.** The narrative types we hoped might carry signal are flat: MD&A
d = −0.038, risk factors d = +0.023 — essentially zero separation. The only weak *positive*
tendencies are going-concern (0.151) and CAMs (0.178), both below threshold, and CAMs on a small
enforced sample (190). Related-party is the most negative (−0.250): enforced related-party
disclosures are, if anything, *more heterogeneous* than clean ones — the opposite of a fingerprint.

## Test 2 — Retrieval (top-k enforced enrichment: semantic vs keyword vs base rate)
`semantic_lift` = semantic precision@10 ÷ enforced base rate. The honest comparison is **semantic
vs keyword** (does meaning beat words at surfacing enforced peers?) and whether precision is usable.

| type | p@10 semantic | p@10 keyword | base rate | lift | semantic beats keyword? |
|---|---|---|---|---|---|
| revenue recognition | 0.116 | 0.131 | 0.081 | 1.43× | **no** (keyword higher) |
| going concern | 0.080 | 0.069 | 0.078 | 1.02× | yes, but ≈ base rate |
| related-party | 0.076 | 0.087 | 0.055 | 1.37× | **no** (keyword higher) |
| CAMs | 0.057 | 0.041 | 0.038 | 1.50× | yes (small absolute numbers) |
| MD&A | 0.059 | 0.055 | 0.074 | **0.79×** | lift **below 1** (worse than random) |
| risk factors | 0.073 | 0.074 | 0.063 | 1.15× | tied |

Enforced footnotes are modestly over-represented among nearest neighbors for most types (lift
~1.0–1.5), but: (a) **semantic rarely beats keyword** — keyword is higher for rev-rec and
related-party, tied for risk factors, higher for semantic only on CAMs and (barely) going concern;
(b) **precision is low** — even the best case (rev-rec 11.6%) means ~9 of 10 nearest neighbors are
clean; (c) **MD&A lift is 0.79× — below random**; (d) recall is near-zero (0.001–0.013) throughout.
This is a faint industry/topic enrichment, **not a usable enforcement signal.**

## Test 3 — "Clean-in-enforced-cluster" candidates are industry artifacts, not fingerprints
The mechanism finds clean footnotes whose top-15 neighbors are ≥80% enforced. Every top candidate
is explained by **industry co-membership**, not by resemblance to wrongdoing:
- **Patrick Industries (clean) ↔ Thor Industries (enforced)**, cos 0.92 — both RV-industry; the
  matched text is literally "North American RV industry wholesale shipments."
- **Universal Corp (clean) ↔ Pyxus International (enforced)**, cos 0.89 — both leaf-tobacco; the
  clean excerpt says outright *"Our principal competitor is Pyxus International."*

These are **direct competitors / same-industry peers**. A clean company landing near an enforced one
because they're in the same business is expected and says nothing about its disclosures resembling
fraud. Surfacing such a pair as a "finding" would be misleading; it must be framed as industry
similarity. (This is the same caveat as v1, now concrete at scale.)

## Test 4 — Semantic beats keyword (engine capability, not enforcement)
Huron Consulting → Ocean Power Technologies (rev-rec): cosine 0.85, lexical Jaccard 0.20, keyword
rank 5,087. The engine retrieves a same-concept match that keyword search buries — confirming the
**semantic-search engine works**. This validates the *tool*, not any enforcement claim.

## Bottom line (honest)
- **Disclosure language does not separate enforced from matched-clean companies** — confirmed at 30×
  scale and extended to related-party, CAMs, MD&A, and risk factors. The richer narrative sections
  did **not** rescue the hypothesis.
- Weak positive separation tendencies exist only for going-concern (d 0.15) and CAMs (d 0.18), both
  below the 0.2 effect-size bar; everything else is ~0 or negative.
- Retrieval enrichment is small, frequently loses to a keyword baseline, and is low-precision.
- "Enforced clusters" that pull in clean companies are industry-peer effects, not fraud fingerprints.
- What IS validated: the semantic engine retrieves concept-level matches keyword search misses.
- **Product stance unchanged:** a comparative disclosure semantic-search instrument with descriptive
  readability/complexity lenses. Enforcement history stays **context**, never a prediction. The four
  new types are descriptive/comparative only — none informs an enforcement claim. Resemblance-only
  language throughout; the null result stays surfaced.

---

## Chapter F re-validation — 161,469 footnotes / 3,253 companies (corpus expansion)

Re-ran `validation/aaer_backtest.py` after expanding the company universe (2,750 → 4,800; corpus
94,455 → **161,469 footnotes**, 1,804 → **3,253 yielding companies**). The enforcement ground truth is
unchanged (214 AAER companies); the expansion added a larger, more diverse **clean** comparison set —
exactly the condition under which a real signal should become *easier* to detect. **Report whatever is
true:** it did not.

**Test 1 — separation (enforced↔enforced vs enforced↔clean), Cohen's d per type:**

| type | d | mean_diff | n_enforced |
|---|---|---|---|
| rev_rec | **−0.117** | −0.0051 | 1,687 |
| going_concern | **+0.153** | +0.0073 | 447 |
| related_party | **−0.253** | −0.0086 | 702 |
| cam | **+0.112** | +0.0030 | 184 |
| mda | **−0.057** | −0.0020 | 940 |
| risk_factors | **+0.015** | +0.0005 | 1,612 |

All |d| < 0.26; three are negative (enforced companies are *no more* similar to each other than to
clean peers), and the largest positive (going_concern +0.15) is still **below the 0.2 effect-size bar**.
**The replicated null holds — and is now confirmed at ~1.7× the corpus with a substantially larger,
more varied clean set.** going_concern remains the only faint positive tendency, as before; nothing
crosses into a real effect.

**Test 2 — retrieval:** semantic enrichment is small and frequently below the keyword baseline / base
rate (per-type p@k lifts ≈ 0.8–1.6, semantic not consistently ≥ keyword). Low precision; no enforcement
retrieval signal.

**Test 4 — semantic beats keyword (the tool's validated capability, unchanged):** PASS — the semantic
top-1 match (cos 0.877, lexical Jaccard 0.16) ranks **8,982nd** by keyword overlap, i.e. the engine
still finds concept-level matches keyword search misses.

**Bottom line:** the expansion does not change the honest conclusion. Disclosure language does **not**
separate SEC-enforced from clean companies, now across 161k footnotes / 3,253 companies and all six
types. The instrument remains a comparative disclosure **semantic-search** tool with descriptive
readability/complexity/distinctiveness lenses and published, caveated financial screens; enforcement
history stays descriptive **context**, never a prediction. The null stays surfaced.
