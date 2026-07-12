# CHAPTER D — Structured-Financials Coverage & Sanity Report

Data + computation only (no UI). $0 (public SEC XBRL + published formulas). Machine-readable
copy: `validation/chapter_d_coverage.json`. Models + citations: Beneish (1999); Dechow, Ge, Larson & Sloan (2011), Model 1 — formulas are restated in the app's methods bundle.

## Ingestion (SEC `companyfacts` XBRL, joined on CIK to the existing 2,750-company universe)

| | count |
|---|---|
| universe companies | 2,750 |
| with XBRL companyfacts (fetched) | **2,222** |
| absent (no companyfacts — pre-XBRL / delisted / foreign) | **528** |
| (of fetched: had a us-gaap facts block) | 1,986 |
| transient fetch failures needing retry | 0 |
| companies with ≥1 assembled annual statement | **1,687** |
| company-years assembled (`financials`) | **17,541** |

XBRL is mandatory only from ~2009, so older/delisted filers legitimately have no companyfacts —
they get **no financials and no scores** (never fabricated).

## Score coverage (`accounting_scores`, keyed CIK + fiscal_year)

| | count | of candidates |
|---|---|---|
| candidate company-years (have a prior year) | 15,790 | — |
| **Beneish M-Score** computed | **6,252** | 39.6% |
| **Dechow F-Score** computed | **5,782** | 36.6% |
| neither model (insufficient inputs) | 7,873 | 49.9% |

Top reasons for no score (honest, recorded per row): **missing core balance/income inputs**
(~9,300 each) — dominated by **financial-sector firms** (banks/insurers) that report **no COGS**
(Beneish needs gross margin) and **unclassified balance sheets** (no current assets/liabilities,
which both models require). These models are **not designed** for those firms; excluding them is
correct, not a gap to paper over. Dechow also needs **t−2** (avg-assets ROA / prior cash sales):
723 company-years are scored by Beneish but not Dechow for lack of a third consecutive year.

## Distribution sanity (matches the models' documented behavior)

- **Beneish M:** median **−2.56** (q25 −2.91, q75 −2.22). Beneish (1999) reports a normal-firm
  median near **−2.5** — ours matches. **13.4%** exceed the **−1.78** threshold, consistent with the
  model's **known high false-positive rate** on general populations.
- **Dechow F:** median **0.59** (q75 1.17); **29.0%** exceed **1.0** (i.e. above the unconditional
  misstatement rate). Consistent with F-Score by construction.
- **Reproducibility:** stored M-Scores recompute exactly from the stored components + the cited
  formula (e.g. Abbott FY2008 stored −2.6804, recomputed −2.6805).

## Spot-checks (named, against expectations)

XBRL line items validate against known figures — Abbott FY2018 revenue **$30.58B**, AMD FY2018
**$6.47B** / FY2022 **$23.60B** with assets **$67.58B** (post-Xilinx). Recent large-cap scores sit
in the normal range (Apple FY2025 M −2.03, F 1.30; Microsoft M −2.36, F 1.15; Abbott M −2.40;
AMD M −2.73) — none flagged.

**Honest illustration of a KNOWN LIMITATION (false positive from M&A):** AMD **FY2022 is flagged**
(M = **−1.14**, above the −1.78 threshold) — driven by **AQI = 2.99** and elevated SGI in the
components, i.e. the balance-sheet jump from the **Xilinx acquisition** (assets $8.96B→$67.58B), not
manipulation. This is exactly why the model is a **screen, not a verdict**, and why we always show
the **component breakdown** — the driver is visible.

## Honest caveats carried into the next (UI) chapter

1. **Era mismatch — we cannot re-validate the models on our cohort.** XBRL begins ~2009; most of our
   enforced cohort's AAERs (median release **2013**, many pre-2009) **predate** their XBRL-scorable
   years (enforced scored years: min 2009, median **2016**). Only 59 enforced firms (412 firm-years)
   have any score, and just 187 of those fall before the AAER release. So our **data** cannot
   demonstrate (or refute) that these models separate enforced firms — and at the median it does not
   (enforced M −2.63 vs clean −2.56). **The models' validity rests on the published literature**
   (Beneish 1999; Dechow et al. 2011), which we present as such — named, cited, with components and
   limitations — **never as our own risk score**. This is consistent with, not contradicted by, the
   disclosure-language null: language doesn't separate enforced firms in our data, and our
   XBRL-era financials can't re-run the financial-model validation either; we therefore lean on the
   peer-reviewed evidence and show the models' outputs honestly.
2. **Degenerate outliers exist and must be display-capped in the UI.** Tiny-denominator micro-caps
   produce absurd values (|M|>10 in 208/6,252; F>20 in 64/5,782 — e.g. Ideanomics FY2013 M≈9,387).
   They are **real formula outputs**, stored **with components** (auditable), not dropped — but the UI
   must clamp/annotate them and never headline a raw extreme value.
3. Both are **screens over reported financials**, sample/era-dependent, weak for financial firms and
   no-COGS/no-inventory businesses, with material false-positive rates. Always shown as the output of
   a **named, cited academic model**, with components + limitations; the reader judges.

## Status

Data foundation complete and reviewer-verified. **No UI this chapter** (next chapter). Scores +
components stored in `accounting_scores`; line items in `financials`; both keyed CIK + fiscal_year,
joined to the corpus via `companies.cik`. The footnote / embedding / findings data is untouched.
