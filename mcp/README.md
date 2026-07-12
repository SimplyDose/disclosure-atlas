# Disclosure Atlas — MCP Server (local)

A **read-only, stateless** [MCP](https://modelcontextprotocol.io) server that exposes Disclosure
Atlas's existing computed data (the DuckDB + JSON/Parquet bundle) as six tools an AI assistant can
call. **Local build only** — not deployed to any public host; public hosting is a deliberate,
separate step that has not been taken.

- No new ingestion, no live SEC/EDGAR calls, no Claude/Anthropic API calls inside the server.
- Query embedding is local (`fastembed` bge-small-en-v1.5, ONNX, CPU — $0), mirroring the website's encoder.
- Holds only public research data. **No secrets**; never reads `.env` or any credential.
- **Honesty travels with the data:** every tool returning scores / change / multi-measure data carries
  the descriptive-only, cited-screens, cannot-re-validate, replicated-null, no-risk-score framing
  *inside its response payload* (`mcp/honesty.py`). The MCP is not a way to strip caveats off numbers.

## Tools

| Tool | Purpose |
| --- | --- |
| `export_panel` (priority) | Phase-3 analysis-ready company-year PANEL for a cohort + codebook + citation + sample-selection. Missing = NA, never zero. |
| `get_company_profile` | Both pillars for one company: disclosure (complexity + distinctiveness per footnote), financial (M/F history + components), enforcement context, nearest neighbors. |
| `search_disclosures` | Semantic similarity over footnotes (local query embedding); BM25 keyword baseline noted. |
| `get_financial_scores` | Beneish M (+8) and Dechow F (+components) for a company or cohort, with cited-screens framing + limitations + cannot-re-validate caveat in the payload. |
| `find_disclosure_changes` | Ranked largest year-over-year disclosure-language changes (descriptive); not-a-red-flag caveat in the payload. |
| `query_cohort_stats` | Aggregate descriptive stats across both pillars for a cohort (counts, complexity/distinctiveness/score distributions, language-cohesion descriptor). |

## Run (stdio)

```bash
# from the repo root, using the project venv (deps already installed)
.venv/bin/python mcp/server.py
```

Wire into a local MCP client (e.g. Claude Desktop `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "disclosure-atlas": {
      "command": "/absolute/path/to/disclosure-atlas/.venv/bin/python",
      "args": ["/absolute/path/to/disclosure-atlas/mcp/server.py"]
    }
  }
}
```

## Verify

```bash
.venv/bin/python mcp/test_harness.py   # in-process: known values, counts vs bundle, honesty, no secrets, limits
```

Known-value anchors: AMD (CIK 0000002488) FY2022 Beneish M = −1.14, AQI = 2.9933, flag = 1;
`export_panel` company-year/company counts equal an independent recomputation of the site's cohort path.

## Identifier crosswalk (joins to Compustat/CRSP/WRDS)

Every payload that carries companies carries the resolvable identifiers as clean fields — zero-padded
10-digit **CIK** (universal join key), ticker, company_name, sic_code, sic_industry — so results join to
existing databases with no manual matching. Licensed identifiers (`gvkey`, `cusip`, `permno`) ship as
**honest-empty fields (never fabricated)**; map them from CIK in your own WRDS/Compustat/CRSP
environment. `export_panel` includes `identifiers_note` + structured `join_guidance`
(CIK→GVKEY/PERMNO/CUSIP recipes + point-in-time caveat); `get_company_profile`, `get_financial_scores`,
`search_disclosures`, and `find_disclosure_changes` all carry `identifiers_note`.

## Data sources (read-only)

`app/public/data/{nodes,scores,neighbors,excerpts,tickers,aaer,manifest}.json` + `embeddings.bin`
(int8, 94455×384) as the canonical computed bundle (identical to the site), and
`data/processed/atlas.duckdb` (opened read-only) for enforcement detail / financials / raw text.
