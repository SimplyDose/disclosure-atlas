# Reproducibility

The repository offers three entry points, from a compact example to the original-data
research evaluation. Commands below run locally and do not ingest new SEC filings.

## 1. Reproduce the paper's primary correlations

Use Python 3.12+ and the pinned example environment:

```sh
python3 -m venv .venv-example
.venv-example/bin/python -m pip install -r examples/requirements.txt
.venv-example/bin/python examples/going_concern.py
.venv-example/bin/python -m unittest discover -s eval -p test_research_example.py -v
```

This path needs only repository files. It uses the existing panel builder, applies the
paper's fiscal-year and collapsed-key rules, checks the archived cohort, and calculates
the four principal Spearman correlations. The expected result is **4,186 company-years,
1,373 companies**, with **1,120 Beneish** and **1,323 Dechow** complete pairs.
The output includes the exact input SHA-256 hashes and software versions.

See [the example](../examples/README.md) for the calculation and expected output.
This reproduces the Table 2 language/financial-score pairs from the shipped derived
bundle. The 460-test family and original extraction are separate stages below.

### Full-family replay and singleton sensitivity

The minimal example environment also supports these read-only calculations:

```sh
.venv-example/bin/python paper/final_tables.py --screen-json
.venv-example/bin/python paper/final_tables.py --screen-json --exclude-singleton-distinctiveness
.venv-example/bin/python -m unittest discover -s eval -p test_screen_reproduction.py -v
```

Both commands print JSON without rewriting the reference archive. The first replays
the historical 460-test family. The second excludes only singleton distinctiveness
observations and is explicitly a separate sensitivity. Full expected outputs are
tracked under `examples/`; [RESULTS.md](RESULTS.md) records their adjusted values.

## 2. Check the financial formulas and frontend

The small formula environment uses Python 3.14.5:

```sh
python3.14 -m venv .venv-offline
.venv-offline/bin/python -m pip install -r eval/requirements-offline.txt
.venv-offline/bin/python eval/run_eval.py --offline
.venv-offline/bin/python -m unittest discover -s eval -p test_offline_runner.py -v
```

These checks import the production formulas and compare them with hand-calculated
answers and edge cases. They do not open the research database or load an embedding model.

The frontend's score/ranking regression tests use Node.js 24:

```sh
cd app
npm ci
npm test
npm run build
```

The [offline workflow](../.github/workflows/offline-checks.yml) runs these small checks
and the shipped-data example. Workflow results identify the exact checked commit.

## 3. Original-data research environment

For the full evaluator, paper figures and local MCP server, use Python 3.14.5:

```sh
python3.14 -m venv .venv
.venv/bin/python -m pip install -r requirements-research.txt
```

The paper and research evaluation use different named samples:

| Analysis | Sample and input |
|---|---|
| Primary paper cohort | 4,186 company-years / 1,373 companies; archived in `paper/gc_cohort_2010_2026.csv` |
| Higher-precision text subset | 2,635 company-years / 921 companies after collapsed-key exclusions; 2,572 / 896 within the paper's 2010–2026 window |
| Current-corpus separation evaluation | 161,469 float embeddings and corresponding metadata |
| Historical v1 classifier | A retired corpus; its exact inputs are not included here |

The full evaluator additionally reads these local archival files:

```text
data/processed/atlas.duckdb
data/embeddings/embeddings.npy
data/embeddings/meta.json
data/embeddings/index_meta.json
```

They are excluded from Git. They must come from the corresponding original research
snapshot, not a newly downloaded or silently substituted corpus. Query-search checks
also require the cached `BAAI/bge-small-en-v1.5` ONNX model. The example in section 1
works without these archival inputs.

With those inputs available:

```sh
HF_HUB_OFFLINE=1 .venv/bin/python eval/run_eval.py
HF_HUB_OFFLINE=1 .venv/bin/python mcp/test_harness.py
.venv/bin/python paper/make_figures.py
```

The evaluator writes `eval/measurements.json`; the figure command regenerates the
tracked paper figures. `paper/final_tables.py` prints the tables and screen results,
checking rebuilt cohort keys against the archived CSV without rewriting it.
Run these commands in a separate working copy when preserving the original outputs.

## Results and verification records

[RESULTS.md](RESULTS.md) maps the current paper results to the available code and
distinguishes the primary cohort, higher-precision subset and historical classifier.
[The July evaluation report](../eval/REPORT.md) is a dated record, including its original
coverage and unresolved analyses. Fresh checks belong to a new dated record rather
than replacing the historical report.

The [October 25 local verification](../eval/VERIFICATION_2026-10-25.md) records the
score/ranking regression checks, research-example checks, full evaluation and browser review.

## Data and provenance

The included application bundle contains derived excerpts, identifiers, financial
components, quantized embeddings and generated comparison notes. Source identifiers
and filing links point back to SEC EDGAR. The feature encoder is the pretrained
`BAAI/bge-small-en-v1.5`; the browser uses its ONNX conversion. Seventeen featured pairs
have precomputed explanatory text. The [paper's contribution statement](../paper/disclosure_atlas_paper.pdf)
records how the research and implementation were produced.

MIT applies to the project software. Source filings, model artifacts and third-party
materials retain their respective provenance and terms. The existing code/data license
has not been changed by this documentation pass.
