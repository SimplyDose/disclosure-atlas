# Disclosure Atlas — Evaluation Harness (`/eval`)

Known-answer financial tests, retrieval checks and corpus-level research evaluation.
For a small result that runs using repository files alone, start with the
[going-concern example](../examples/README.md). The [reproduction guide](../docs/REPRODUCIBILITY.md)
maps the primary paper cohort, higher-precision subset and original-data inputs.

Database connections are read-only. Full evaluation writes `eval/measurements.json`;
the offline formula selection writes no measurements. Historical results are preserved
in [REPORT.md](REPORT.md), dated July 5, 2026.

## Run it

### Offline financial checks

From the repository root, use Python 3.14.5 and the pinned minimal environment:

```bash
python3.14 -m venv .venv-offline
.venv-offline/bin/python -m pip install -r eval/requirements-offline.txt
.venv-offline/bin/python eval/run_eval.py --offline
```

This selects only the Beneish and Dechow known-answer/edge-case classes (19 tests at
introduction), importing the actual production formulas. DuckDB is needed at import
time, but no database, dataset, embedding model, credential or network call is used by
these tests, and no measurements are written. Installation requires package-registry
access. Exit 0 means this selection passed; nonzero means failure. This is the same
check used by `.github/workflows/offline-checks.yml`.

The workflow also runs `.venv-offline/bin/python -m unittest discover -s eval -p test_offline_runner.py -v`.
This uses a disposable source-only fixture, blocks database and network connections,
and proves an intentionally wrong expected answer produces exit 1. The original
fixtures remain unchanged.

This selection does not replace stored-score comparisons, search checks, empirical
replication, frontend QA or the MCP harness. Use the complete project environment below
for those; `requirements-offline.txt` intentionally does not install their dependencies.

### Full and fast research evaluation

```bash
.venv/bin/python eval/run_eval.py           # everything (~1–3 min incl. model/bundle load)
.venv/bin/python eval/run_eval.py --fast    # skip the supervised AUC probes (slowest part)
```

Exit code 0 = all tests pass. Measured numbers land in `eval/measurements.json`.
Plain-English results and caveats: **`eval/REPORT.md`**.

Framework: Python stdlib `unittest`. Install the full research environment with
`.venv/bin/python -m pip install -r requirements-research.txt` from the repository root. The footnote-search suite
needs the bge-small-en-v1.5 ONNX model in the local HuggingFace cache; the first-ever run
downloads it (~130 MB), after which everything is offline.

## What is tested

### 1. Null-finding verification — `test_null_finding.py` (11 tests)

Independently re-derives the study's core result from the underlying artifacts
(`data/embeddings/embeddings.npy` + `meta.json`, 161,469 footnotes; `atlas.duckdb`
read-only). The derivation code is written fresh (block-GEMM cosine means) and does **not**
import or call `validation/aaer_backtest.py`.

- **Corpus integrity** — embeddings/meta/index row alignment (200 sampled ids), L2
  normalization, documented per-type enforced/clean counts.
- **Separation re-derivation** — per-type Cohen's d between enforced↔enforced (other-company)
  and enforced→clean cosine similarity; compared against both `validation/results.json` and
  the numbers published in `VALIDATION_RESULTS.md` (Chapter F), tolerance 0.01.
- **The null itself** — asserts no footnote type reaches the study's own d ≥ 0.2 effect-size
  bar; asserts going-concern is the largest positive tendency yet stays below the bar.
- **Positive control** — footnote *type* must be highly separable on the same embeddings
  (logistic regression, company-grouped holdout, macro OVR AUC > 0.9); otherwise the
  enforcement null would just mean broken embeddings.
- **Supervised probe (extension, not replication)** — company-grouped 5-fold CV logistic
  regression, enforced vs clean, for rev_rec and going_concern, both unmatched and matched
  to the enforced cohort's 2-digit-SIC/era pool. Asserts no *strong* signal (AUC < 0.75).
  NOTE: the study's published AUCs (0.506 / 0.609) were measured on the retired v1 corpus,
  whose embeddings no longer exist in the repo — see REPORT.md for what we found instead.
- **Cleaned GC cohort counts** — re-runs the exact SQL from
  `docs/STUDY_COHORT_GC_CLEANED.md` §2 against `atlas.duckdb` and checks all five
  documented counts digit-exact (4,614 footnotes / 924 CIKs / 2,643 company-years /
  8 collapsed-key overlaps / 2,635 final).

### 2. Financial pillar — `test_financial_scores.py` (21 tests)

Tests the production `beneish()` and `dechow()` functions imported from
`ingestion/compute_scores.py`:

- **Hand-verifiable fixtures** — a steady-state company where every Beneish index is
  exactly 1 (M = −2.480, arithmetic in comments) and a growth case with every index computed
  by hand (M = −0.7785, flagged); a Dechow steady state where only the soft-assets term
  survives (pred = −6.6067) and the issuance dummy adds exactly its 1.029 coefficient.
- **Edge cases** — missing core fields, zero prior receivables (DSRI), non-positive
  sales/assets, zero prior leverage (LVGI), zero prior cash sales, missing t−2, extreme
  values (finiteness / logistic overflow), documented neutral-DEPI/SGAI and
  net-income-fallback conventions, missing inventory treated as 0 (not a refusal).
- **Stored-score cross-check** — recomputes a deterministic sample of 25 stored
  `accounting_scores` rows from raw `financials` rows and requires 4-decimal agreement,
  plus the AMD FY2022 known value (−1.14) also pinned by `mcp/test_harness.py`.

### 3. Footnote search — `test_footnote_search.py` (11 tests)

Exercises the real production path (`mcp/server.py::search_disclosures`, the same
in-process function the MCP server exposes; query embedded locally, cosine over the shipped
int8 bundle):

- **Relevance** — four representative queries (going-concern doubt, ASC-606 revenue,
  related-party payments, risk factors); the matching type must dominate the unfiltered
  top-10 and top cosine must be high.
- **Behavior** — type filters respected, `top_k` honored, results rank-ordered, all response
  fields present and non-empty.
- **Degenerate input** — empty/whitespace queries raise `ValueError` (no crash); a garbage
  query returns results gracefully and scores clearly below a relevant query; an unknown
  footnote type fails with an informative error.

## Files

| File | Role |
|---|---|
| `run_eval.py` | single-command runner, per-suite + overall summary, non-zero exit on failure |
| `eval_common.py` | shared paths, read-only DB helper, measurement recorder |
| `test_null_finding.py` | null-finding verification (the centerpiece) |
| `test_financial_scores.py` | Beneish / Dechow formula + edge-case + stored-score tests |
| `test_footnote_search.py` | retrieval sanity tests |
| `measurements.json` | machine-readable numbers measured on the last run |
| `REPORT.md` | plain-English summary: what passed, what the null check found, honest caveats |
