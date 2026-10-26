# Reproduce a result from the paper

This example rebuilds the primary going-concern company-year panel and recomputes
four correlations between disclosure language and financial scores. It uses the
same panel construction as the application, compares every company-year key and
enforcement indicator against the archived paper cohort, and checks the published
counts and coefficients.

## Run

From the repository root, with Python 3.12 or later:

```sh
python3 -m venv .venv-example
.venv-example/bin/python -m pip install -r examples/requirements.txt
.venv-example/bin/python examples/going_concern.py
```

After dependency installation, the example runs entirely offline using files in
this repository. It needs no SEC account, API key, DuckDB database or model download.
The JSON report prints to stdout. To save it to a **new** file:

```sh
.venv-example/bin/python examples/going_concern.py --output /tmp/atlas-going-concern.json
```

An existing output file is left untouched. The source data and paper files are
read-only. Paths are resolved relative to the script, so it also runs from another
directory.

## Expected result

The primary cohort contains **4,186 company-years from 1,373 companies**, covering
fiscal years 2010–2026. Financial-score coverage determines the pairwise sample:

| Disclosure measure | Financial score | Complete pairs | Spearman rho |
|---|---|---:|---:|
| Gunning Fog | Beneish M-Score | 1,120 | 0.0218 |
| Gunning Fog | Dechow F-Score | 1,323 | 0.0269 |
| Distinctiveness | Beneish M-Score | 1,120 | 0.0598 |
| Distinctiveness | Dechow F-Score | 1,323 | -0.0281 |

An [example JSON report](expected_results.json) is included for comparison.
The report includes full-precision coefficients, raw two-sided p-values, package
versions, SHA-256 hashes of the analysis inputs, and `"checks": "PASS"`. A count,
cohort-key or coefficient mismatch exits with a nonzero status. Missing values are
excluded separately for each pair; they are never converted to zero.

These are Table 2 results from the versioned derived bundle. The paper's 460-test
screen applies its own multiple-testing corrections. Raw extraction, embedding
construction and that broader screen belong to the [full research workflow](../docs/REPRODUCIBILITY.md).

## Read the code

Start with [`build_result()`](going_concern.py). It follows five steps:

1. Use the existing [`build_panel()`](../mcp/cohort.py) to aggregate going-concern excerpts by company and fiscal year.
2. Restrict to 2010–2026 and apply the documented collapsed-year exclusions.
3. Match the rebuilt cohort to [`gc_cohort_2010_2026.csv`](../paper/gc_cohort_2010_2026.csv).
4. Calculate pairwise-complete Spearman correlations with SciPy.
5. Check known answers and return a reproducible JSON record.

The statistical test compares ranks rather than assuming a linear relationship.
The same company's observations can appear in multiple years; this example
reproduces the paper's company-year table, not its separate firm-level robustness
analysis.

## Test

```sh
.venv-example/bin/python -m unittest discover -s eval -p test_research_example.py -v
```

Tests cover the shipped cohort and coefficients, a hand-calculated negative rank
correlation, pairwise missingness, duplicate/malformed archived keys, invalid
statistical inputs, connection blocking and output-file preservation.

## Replay the full reported family

The same minimal environment can replay the paper's 460-test screen from tracked
inputs, without a database or rewriting archived files:

```sh
.venv-example/bin/python paper/final_tables.py --screen-json
.venv-example/bin/python paper/final_tables.py --screen-json --exclude-singleton-distinctiveness
.venv-example/bin/python -m unittest discover -s eval -p test_screen_reproduction.py -v
```

The first command retains the published derived values and prints the complete
family as JSON. The second explicitly excludes singleton-group distinctiveness
observations before averaging; it is a separate sensitivity, not a replacement for
the paper. Compare the [archived replay](expected_screen_results.json) and
[singleton sensitivity](expected_singleton_sensitivity.json). The dated
[research note](../paper/RESEARCH_NOTE_2026-10-25.md) explains the interpretation.
