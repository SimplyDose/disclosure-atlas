# Research results

The working paper studies two language measures: Gunning Fog readability and cosine
distance from a same-industry, same-disclosure-type embedding centroid. Financial
measures are the published Beneish M-Score and Dechow F-Score, computed from reported
SEC XBRL inputs.

## Primary going-concern cohort

The archived sample contains **4,186 company-years from 1,373 companies**, fiscal years
2010–2026. It is defined by extracted going-concern language, not an independently
verified panel of auditor opinion classifications. The keys are in
[`paper/gc_cohort_2010_2026.csv`](../paper/gc_cohort_2010_2026.csv).

| Pair | Complete observations | Spearman rho |
|---|---:|---:|
| Readability / Beneish | 1,120 | 0.0218 |
| Readability / Dechow | 1,323 | 0.0269 |
| Distinctiveness / Beneish | 1,120 | 0.0598 |
| Distinctiveness / Dechow | 1,323 | -0.0281 |

The [runnable example](../examples/README.md) rebuilds and checks these values from the
included bundle. Missing scores reduce the pairwise sample to 26.8% or 31.6% of the
primary cohort. These estimates describe those observations and two language measures.

The paper's 460-test screen applies Bonferroni and Benjamini–Hochberg corrections across
the eligible family. Three nested distinctiveness/TATA associations survive FDR; one
survives Bonferroni. No surviving association involves either composite financial score.
The screen is exploratory; the paper also reports firm-median bootstrap analysis.
Small estimates and adjusted non-significance do not establish equivalence or identify
standardized disclosure templates as a causal explanation.

## What the analysis record establishes

The application records the cohort, specification, full eligible test family and a
SHA-256 hash before a screen computes its results. That is a local analysis record.
The browser's clock and local storage do not provide external study preregistration.
The multiple-testing adjustments cover the specified family in that run.

## Corpus-level evaluation

The dated [July 5 evaluation](../eval/REPORT.md) re-derived the similarity-separation
statistics for the 161,469-excerpt corpus. No disclosure type reached the study's
positive clustering threshold, Cohen's d >= 0.2. Related-party d was -0.253, an
opposite-direction difference. A directional threshold is distinct from a claim that
every absolute effect is below 0.2.

In that record, a company-grouped type-classification control reached AUC **0.953**.
Matched current-corpus enforcement classifier probes reached **0.686 ± 0.076** for
revenue recognition and **0.650 ± 0.042** for going concern. These are different tests
from the positive similarity-clustering question. Historical v1 AUCs of 0.506 and 0.609
belong to a retired sample and should not be applied to the current corpus.

## Code and checks

| Result or behavior | Primary code / record |
|---|---|
| Cohort and four principal correlations | [`examples/going_concern.py`](../examples/going_concern.py) |
| Table and full-family calculations | [`paper/final_tables.py`](../paper/final_tables.py) |
| Figures and firm-median bootstrap | [`paper/make_figures.py`](../paper/make_figures.py) |
| Production financial formulas | [`ingestion/compute_scores.py`](../ingestion/compute_scores.py) |
| Hand-calculated formula fixtures | [`eval/test_financial_scores.py`](../eval/test_financial_scores.py) |
| Original corpus evaluation and coverage | [`eval/REPORT.md`](../eval/REPORT.md) |

Formula fixtures, an independently implemented calculation and external replication
answer different verification questions. The dated reports specify which checks were
performed; upstream extraction quality and XBRL mapping are separate validation tasks.
The original working paper and historical reports are preserved.

## October 25 family replay

`paper/final_tables.py --screen-json` replays the archived family using tracked data,
without modifying the archived cohort. It enumerates 8,772 candidates across 258
subgroups: 460 eligible tests and 8,312 exclusions under the original rule.
The [complete output](../examples/expected_screen_results.json) records every eligible
row and adjusted value. The surviving rows are all distinctiveness × Beneish TATA:

| Subgroup | N | Spearman rho | Raw p | BH q | Bonferroni p |
|---|---:|---:|---:|---:|---:|
| full cohort | 1120 | 0.118949 | 6.59246299e-05 | 0.0303253298 | 0.0303253298 |
| no enforcement history | 1062 | 0.113157 | 0.00021976433 | 0.0460715167 | 0.101091592 |
| 2020-2024 | 539 | 0.155121 | 0.000300466413 | 0.0460715167 | 0.13821455 |

These are nested exploratory tests. Their corrections cover this reported family,
not additional screens or specification choices. The Dechow/Beneish score-to-score
comparison is outside this family and is not assigned an adjusted significance claim.

## Separately labeled singleton sensitivity

The archived builder assigned zero distinctiveness to singleton peer groups. A new
sensitivity excludes only those 35 going-concern excerpts before company-year means,
retaining genuine zeros from groups with comparison peers. It leaves the original
cohort keys, financial scores, Fog values and archived estimates unchanged.

| Pair after singleton exclusion | Complete pairs | Spearman rho | Raw p |
|---|---:|---:|---:|
| fog / m | 1120 | 0.021755 | 0.467019482 |
| fog / f | 1323 | 0.026940 | 0.327515946 |
| dst / m | 1100 | 0.069281 | 0.0215659855 |
| dst / f | 1308 | -0.027937 | 0.3126774 |

The sensitivity still has 460 eligible tests: three BH survivors and two Bonferroni
survivors, all nested distinctiveness/TATA rows. No composite-score association
survives correction. Full values are in
[expected_singleton_sensitivity.json](../examples/expected_singleton_sensitivity.json).
This is a robustness calculation, not independent confirmation; pooled peer
composition and financial-input mapping remain the same.

## Measurement and reproduction scope

The [dated research note](../paper/RESEARCH_NOTE_2026-10-25.md) describes singleton
placeholders, full-snapshot peer construction, fiscal-period alignment and XBRL input
fallbacks. The archived bundle and the historical replay retain the published metric.
They do not constitute an original-filing information set. The higher-precision
subset is 2,635 company-years / 921 companies across all available years, or
2,572 / 896 inside 2010–2026.

| Paper item | Executable evidence available |
|---|---|
| Four principal correlations | `examples/going_concern.py`; tracked-input replay |
| 460-test family and adjusted values | `paper/final_tables.py --screen-json` |
| Company-year rank-sum table | `paper/final_tables.py`; original inputs as documented |
| Four figures and company-median intervals | `paper/make_figures.py`; writes figure outputs when run |
| Higher-precision subset | Original read-only DuckDB inputs and documented SQL |
| Firm-level Wilcoxon statement | No executable reproduction located |
| TATA-specific interval claim | No executable reproduction located |
| Historical R cross-check | Historical log only; no executable R check located |

Company-median bootstrapping resamples company medians; it is not a cluster bootstrap
of company-year rows. The archived PDF remains unchanged and should be read together
with the dated note rather than as a claim that every statistic is reproducible.
