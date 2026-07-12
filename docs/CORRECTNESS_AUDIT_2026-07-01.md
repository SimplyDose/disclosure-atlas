# COMPUTATIONAL-CORRECTNESS AUDIT — Disclosure Atlas

**Date:** 2026-07-01 · **Scope:** every class of value a research study would consume · **Method:** 10 independent reviewer sub-agents, each re-deriving values from the RAW source (`data/processed/atlas.duckdb`, `data/embeddings/embeddings.npy`) and comparing digit-for-digit against the tool's actual code path (JS run in Node v24; Python/numpy/scipy recompute). Every discrepancy was adversarially re-verified by two further skeptics (recompute lens + spec/unit lens). Confirmed issues were independently reproduced a third time by the orchestrator. **Cost: $0** (no API/generation; local recompute only). No secrets printed.

---

## BOTTOM LINE

**The tool's computed values are trustworthy for empirical research** — with **two documented caveats** and **one data-property warning** a researcher MUST know. Across the audit, **every arithmetic/statistical value the tool reports was reproduced exactly**: Beneish M + 8 components, Dechow F + 7 inputs, Pearson/Spearman matrices, Table 1 descriptives, the going-concern cohort, the panel export cells, and all cross-view consistency. **Zero arithmetic bugs were found.** The two confirmed defects are **not wrong math** — they are a *precision* limitation (drift export) and a *unit-of-observation* collision (75 of 23,592 company-years). Neither was "fixed" in code because neither is a computation bug and both fixes would alter shipped values/functionality (the maintainer must decide); instead they are quantified below with exact scope and a researcher workaround.

| Domain | Verdict | Note |
|---|---|---|
| Beneish M-Score (+8 comps) | ✅ VERIFIED | 0 mismatches / 31,391 company-years; AMD FY2022 M=−1.1365, AQI=2.9933 exact |
| Dechow F-Score (+7 inputs) | ✅ VERIFIED | 0 mismatches / 11,717 scored years; F/prob/inputs exact |
| Correlation matrix (Pearson + Spearman) | ✅ VERIFIED | matches scipy to 6 dp, both metrics, pairwise & listwise; NA never zeroed |
| Table 1 (N/mean/median/SD/quartiles) | ✅ VERIFIED | matches numpy (ddof=1, linear pctile) to 3.6e-12; correct dedup |
| Going-concern cohort | ✅ VERIFIED | 8,914 footnotes / 1,408 CIKs / 4,291 company-years; set-identical raw↔bundle |
| Panel export | ✅ VERIFIED cells · ⚠️ 75-row unit collision | 23,592 rows, 40 cols, 0 cell mismatches, no row cap; **see Caveat B** |
| Disclosure-change / drift | ✅ VERIFIED logic · ⚠️ int8 precision | pairing/years/CSV correct; **see Caveat A** |
| Internal consistency (cross-view) | ✅ VERIFIED | M-Score byte-identical across all views; dist == public (SHA-256) |
| Build lineage (duckdb→bundle) | ✅ VERIFIED | 0 fabricated rows; NULL preserved; all counts reconcile |
| Corpus coverage figures | ✅ VERIFIED | 161,469 footnotes, 0 orphans; by_type & enforced reconcile |

---

## ⚠️ CAVEAT A (medium) — Drift `change_cosine_distance` is trustworthy only to ~2 decimals

**What's correct:** the drift pipeline's *logic* is verified — the year index is the true period-of-report fiscal year (not filing year), the "principal excerpt" is a deterministic longest-word-count pick, consecutive-available-year pairing spans gaps honestly (both endpoint years always shown), and the CSV emits exactly the cosine distance the UI shows with correct `year_from < year_to` ordering (confirmed by running the real `changes.js` `dot()` in Node).

**The caveat:** all displayed/exported distances are computed from **int8-quantized embeddings** (`embeddings.bin` = `round(vec × 127)`, verified bit-exact over all 161,469×384 values), **not** the full-precision `embeddings.npy`. Versus full precision, distance error is **median 0.0022, mean 0.0026, p95 0.0063, max 0.0140** (orchestrator-reproduced on random pairs; agent got median 0.0021/max 0.0140 on the 52,083 real drift events). Consequence:

- **98%** of exported 4-decimal `change_cosine_distance` values differ from ground truth at the 4th decimal; **86%** at the 3rd; **~25%** at the 2nd.
- **Noise floor ≈ 0.015:** near-identical disclosures (true distance ≈ 0) are exported as up to ~0.014. Worst case: Kennametal rev-rec FY2024→FY2025, true = 0.000039, exported = 0.014012 (~360×).
- **Rankings are preserved** (Spearman 0.998, top-10 identical, top-250 overlap 238/250) — the "largest shifts" view is reliable; only the *magnitude precision* and the *small-distance tail* are not.
- Not annualized: 9.1% of events span a >1-year gap (up to 18 yr) and are single un-normalized distances.

**Researcher rule:** treat exported `change_cosine_distance` as reliable to **~2 decimals**; do **not** treat values below ~0.015 as real linguistic change; use it for *ranking/ordering*, not for precise magnitude or thresholding. (The source comment in `paste.js` calling this "negligible cosine error" understates it at 4-decimal precision — a maintainer doc fix, not a data fix.)

## ⚠️ CAVEAT B (medium) — 75 of 23,592 panel company-years merge two fiscal years (52/53-week filers)

**What's correct:** every *cell* of the panel export is exact (0 mismatches over 23,592 rows × 40 cols vs independent recompute + raw duckdb), missing-as-NA is correct everywhere (empty, never 0; real 0 preserved distinct from NA), and there is **no row cap** — CSV emits 23,592 data rows, XLSX 23,593 `<row>` (header + data). The streaming export handles the full corpus.

**The caveat:** the company-year key is `pfy = calendar-year of period_of_report`. For 52/53-week fiscal filers whose fiscal-year-end floats across the Dec/Jan boundary, two economically distinct 10-Ks fall in the same calendar year and **collapse into one panel row**. Orchestrator-reproduced independently: **exactly 75 of 23,592 rows (0.32%), across 63 companies, all 75 merging two distinct 10-K filings** whose filing dates are a full year apart. In those rows:

- `n_footnotes` **double-counts** (both filings' footnotes summed);
- `gunning_fog` / `distinctiveness` are **blended across two fiscal years**;
- `filing_date` and `accession` reflect **only the earlier filing** — so `filing_date` understates the point-in-time date by a full year for content from the later 10-K. This **breaks the export's documented look-ahead / point-in-time guarantee** for those 75 rows;
- the financial-screen columns (Beneish/Dechow) join to **only one** of the two conflated fiscal years.

Example: CIK 0000031791 (Revvity), key `…|2017` merges acc `…17-000003` (period 2017-01-01, filed 2017-02-28, 10 footnotes) with acc `…18-000004` (period 2017-12-31, filed 2018-02-27, 8 footnotes) → one row `n_footnotes=18`, `filing_date=2017-02-28`.

**Researcher rule:** the exact list of all 75 affected `(cik, panel_fiscal_year)` keys is in **`docs/AUDIT_2026-07-01_collapsed_company_years.csv`**. For a point-in-time-sensitive study, **exclude or manually split these 75 company-years** (the true fiscal split is recoverable from the per-footnote `fd` field / raw `period_of_report`). The other 23,517 rows (99.68%) are one-filing-per-row and unaffected. The proper fix is upstream (derive fiscal year from fiscal identity, not `int(period_of_report[:4])`) and is parked in `BLOCKERS.md`.

## ⚠️ DATA-PROPERTY WARNING (not a bug, but study-critical) — degenerate Beneish/Dechow outliers

The Beneish M and Dechow F formulas produce **genuine extreme outliers** from near-zero denominators (e.g. M up to ~1,918,411; ratio components |M|>10). These are correct formula outputs and are intentionally retained (finite → not filtered). They **dominate any mean/SD/Pearson**: e.g. Table 1 Beneish-M mean ≈ 217.9, SD ≈ 20,472; and Pearson(M, DSRI) = 0.999996 while Spearman = 0.349. **This will invalidate any mean- or Pearson-based result unless handled.**

**Researcher rule:** for the financial screens, **use median/IQR and Spearman**, or winsorize/trim the near-zero-denominator company-years. This affects both pillars' financial block and is a property of the published formulas, not a defect in the tool.

---

## Minor / cosmetic (no action needed)

- **Near-threshold M rounding:** `scores.json` rounds `m` to 2 dp, so ~10–12 company-years straddling the −1.78 cutoff display as `−1.78` on both sides. The authoritative flag `mf` is stored from full-precision `beneish_flag` and is **always correct** — threshold on `mf`, not on the rounded `m`.
- **Documented Beneish approximations** (`neutral_depi`, `neutral_sgai`, `income_cont_ops_fallback_net`) are honestly flagged per company-year in the `mc` JSON; exclude those component-years if strict Beneish inputs are required.
- **Unit difference by design:** `gunning_fog`/`distinctiveness` are footnote-level in the company-profile CSV but company-year means in the panel export — not interchangeable variables.
- **Insufficient inputs → NULL** everywhere (never fabricated, never zero-filled): 18,700 Beneish and the corresponding Dechow company-years are NULL with a recorded reason.

## What this audit did NOT cover (honest boundary)

- The **upstream XBRL→`financials` tag extraction** (whether `revenue`/`cogs`/`receivables` map to the correct GAAP tags). A wrong input tag would yield a *self-consistent but wrong* M/F. The audit verified arithmetic from the `financials` table forward, not the tag mapping into it.
- The **footnote_type CLASSIFICATION** from raw 10-K text (whether a note is correctly labeled `going_concern` etc.) — set identity raw↔bundle was verified, but not the upstream NLP labeling.
- Full recompute of all 161,469 `fog`/`dst` values (spot-checked exact on samples; lineage & counts exhaustive).
- Live browser DOM rendering (verified via the deterministic source functions + Node, not screen-scrape).

---

## Verdict

**Trustworthy for empirical research.** Use `mf`/`f` and the panel cells as exact. Apply the three rules: (A) drift distance = ranking-grade, ~2-decimal magnitude; (B) exclude/split the 75 collapsed company-years listed in the CSV; (C) prefer median/IQR + Spearman for the financial screens (outliers). No computed value requires a code fix; the two structural improvements are logged for the maintainer.
