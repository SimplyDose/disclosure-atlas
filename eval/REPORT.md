# Evaluation Report — Disclosure Atlas

**Date:** 2026-07-05 · **Harness:** `/eval` (add-only; no existing file touched; DB opened
read-only) · **Command:** `.venv/bin/python eval/run_eval.py` · **Result: 43 / 43 tests
pass, 0 failed, 0 skipped.**

| Suite | Passed | Failed | Skipped |
|---|---|---|---|
| Null-finding verification | 11 | 0 | 0 |
| Financial pillar (Beneish M / Dechow F) | 21 | 0 | 0 |
| Footnote search sanity | 11 | 0 | 0 |

---

## 1. The null finding: it reproduces, exactly

The headline claim — *disclosure-language embeddings do not separate SEC-enforced from
clean companies; every footnote type's Cohen's d is below the 0.2 effect-size bar* — was
re-derived with **independently written code** (fresh block-matrix implementation; nothing
imported from `validation/aaer_backtest.py`) from the raw artifacts
(`data/embeddings/embeddings.npy`, 161,469 × 384, verified L2-normalized and row-aligned
with its metadata).

Re-derived vs published (VALIDATION_RESULTS.md Chapter F / `validation/results.json`):

| type | re-derived d | published d | match |
|---|---|---|---|
| rev_rec | −0.117 | −0.117 | ✅ exact |
| going_concern | +0.153 | +0.153 | ✅ exact |
| related_party | −0.253 | −0.253 | ✅ exact |
| cam | +0.112 | +0.112 | ✅ exact |
| mda | −0.057 | −0.057 | ✅ exact |
| risk_factors | +0.015 | +0.015 | ✅ exact |

Every mean-diff and n also matches. **No type crosses d ≥ 0.2; three are negative;
going-concern is the largest positive tendency (+0.153) and stays below the bar — exactly
as written up.** The reported non-separation holds when re-run.

**Positive control passed:** on the same embeddings, footnote *type* classifies at macro
OVR AUC **0.953** (6-way accuracy 0.788, company-grouped holdout) — the pipeline carries
strong learnable structure, so the enforcement null is specific to enforcement, not an
artifact of broken embeddings.

**Cleaned going-concern cohort reproduces digit-exact.** Running the exact SQL from
`docs/STUDY_COHORT_GC_CLEANED.md` §2 against `atlas.duckdb` (read-only): 8,914 raw GC
footnotes → **4,614** cleaned footnotes, **924** companies, **2,643** company-years,
**8** collapsed-key exclusions, **2,635** final company-years — all five documented counts
match exactly.

### ⚠️ One flagged observation (surfaced loudly, as required)

The study's *decisive supervised check* (rev_rec AUC 0.506 ± 0.030, going_concern
0.609 ± 0.090) was measured on the **retired v1 corpus** (3,088 footnotes, 283 hand-matched
clean companies). Those embeddings no longer exist in the repo, so **those exact figures are
not reproducible from current artifacts** — this part of the study is unverifiable as
published.

As an extension, the harness ran the same probe design (company-grouped 5-fold CV logistic
regression) on the **current 161k corpus** and found *more* linear-classifier signal than
the v1 figures:

| type | unmatched AUC | matched (2-digit SIC + era) AUC | v1 published |
|---|---|---|---|
| rev_rec | 0.684 ± 0.053 | 0.686 ± 0.076 | 0.506 ± 0.030 |
| going_concern | 0.640 ± 0.052 | 0.650 ± 0.042 | 0.609 ± 0.090 |

Crude industry/era matching does **not** explain the elevated rev_rec number. What this
does and doesn't mean:

- It does **not** overturn the similarity-separation null (that is measured directly above
  and reproduces exactly), and AUC ~0.65–0.69 with ~9-in-10-clean neighborhoods is still
  far from a usable enforcement predictor — the product stance ("context, never a
  prediction") remains correct.
- It **does** mean the sentence "a grouped-CV classifier cannot distinguish enforced from
  clean revenue-recognition footnotes at all (AUC≈0.51)" is true of the v1 matched cohort
  only, and should not be quoted as a property of the current 161k corpus. On the current
  corpus a weak-to-moderate linear direction exists (plausibly residual cohort composition:
  finer-than-SIC2 industry mix, company size/filer style, era detail — the harness's
  matching is much cruder than v1's hand-matched negatives, so this is not a confirmed
  contradiction, but it is a real gap worth re-running with proper matching before citing
  the v1 AUC numbers).

## 2. Financial pillar: formulas compute correctly

- **Beneish M-Score:** a steady-state fixture (all eight indices exactly 1, TATA 0) returns
  the hand-computable M = −2.480; a growth fixture with every index hand-derived in the test
  comments (DSRI 1.5, GMI 0.8, AQI 1.2, SGI 2.0, TATA 0.08) returns M = −0.7785 and is
  flagged at the published −1.78 threshold. Edge cases behave as documented: missing core
  inputs, zero prior receivables (DSRI), non-positive sales/assets, and zero prior leverage
  (LVGI) all *refuse to score with a recorded reason* rather than fabricate; missing
  depreciation/SG&A fall back to the documented neutral-index convention; the
  net-income-for-continuing-ops fallback is flagged in components; extreme inputs stay finite.
- **Dechow F-Score (Model 1):** steady-state fixture returns the hand-computable
  pred = −6.6067 (only the soft-assets term survives; prob ≈ 0.00135, F ≈ 0.365); the equity/
  debt-issuance dummy shifts pred by exactly its 1.029 coefficient; missing t−2 and zero
  prior cash sales refuse with reasons; missing inventory is correctly treated as 0 rather
  than refused; the sign-stable logistic does not overflow at extreme accruals.
- **Pipeline cross-check:** 25 stored `accounting_scores` rows (deterministic md5 sample)
  recompute **exactly** (4 decimals) from the raw `financials` table — 25/25 Beneish,
  22/22 Dechow (3 rows had no stored Dechow, consistent with its t−2 requirement) — plus
  the AMD FY2022 known value (−1.14).

## 3. Footnote search: retrieval is sane

Real production path (`mcp/server.py::search_disclosures`, local bge-small embedding +
cosine over the shipped int8 bundle, 161k footnotes):

- "substantial doubt … going concern" → **10/10** top-10 are going_concern, top cosine 0.956.
- ASC-606 revenue query → **10/10** revenue_recognition, top cosine 0.902.
- related-party payments query → **10/10** related_party, top cosine 0.831.
- risk-factor boilerplate query → 6/10 risk_factors (rest adjacent MD&A-style text), 0.867.
- Type filter fully respected; `top_k` honored; results strictly rank-ordered; all fields
  populated.
- Empty and whitespace-only queries raise a clean `ValueError`; a garbage query
  ("zzqx vlurp snorfblat …") returns gracefully with visibly lower similarity (0.631 vs
  0.916 for a relevant query); an unknown footnote type produces an informative error.

## 4. Honest list: weak, unverifiable, or surprising

1. **Unverifiable — v1 supervised AUCs.** The v1 corpus (3,088 footnotes) and its
   hand-matched clean cohort are not in the repo; AUC 0.506/0.609 and the reviewer's
   "AUC 1.000 positive control" cannot be re-run as published. The current-corpus analogues
   are reported above (probe AUCs higher; positive control 0.953 — consistent in spirit).
2. **Surprising — elevated classifier signal at 161k** (§1 flag). Worth a proper matched
   re-run before ever quoting "AUC ≈ chance" for the current corpus.
3. **Weak by design — retrieval/headline tests of the study.** Test 2 (p@k enrichment) and
   Test 3 (clean-in-enforced clusters) were not independently re-derived here (they need the
   TF-IDF baseline and neighbor machinery; the stored `results.json` values were taken as-is).
   The centerpiece separation result *was* fully re-derived.
4. **Unverified upstream:** filing→text extraction fidelity, the XBRL→financials tag
   mapping, and going-concern label *recall* (the study itself flags all three as out of
   scope; nothing in this harness contradicts them, but nothing verifies them either).
   The GC cohort precision figure (~90%+ cleaned) rests on the study's 10-excerpt manual
   sample — too small to independently confirm without new hand-labeling, which this
   harness does not fake.
5. **Minor:** the study's Beneish/Dechow implementations use documented conventions
   (neutral DEPI/SGAI when inputs are missing, inventory-absent-means-zero) that differ
   from refusing outright; they are honest and flagged in components, but users comparing
   against other implementations should know scores can be computed on partially-missing
   inputs in exactly these two places.

**Bottom line:** the credibility centerpiece survives independent re-derivation — the
non-separation (all |d| < 0.26, none ≥ 0.2 positive) is real in the shipped data, the
cleaned cohort counts are digit-exact, the financial formulas are correct against hand
computation and against 25 stored rows, and retrieval behaves sanely on relevant, filtered,
and garbage input. The one caveat worth acting on is the retired-v1-corpus AUC claim, which
should be re-stated as corpus-specific or re-run with proper matching on the current corpus.
