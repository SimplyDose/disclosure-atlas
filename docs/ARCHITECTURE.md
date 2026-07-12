# ARCHITECTURE.md — Disclosure Atlas

---

## Shape of the system

Disclosure Atlas is a **build-time-heavy, runtime-light** system. All expensive work (fetching, extraction, embedding, projection, explanation generation, validation) happens once at build time on the build machine / the pipeline. The deployed product is a **static site with baked-in data** served from a CDN. There is no live backend doing per-request work in v1.

```
  BUILD TIME (local / pipeline)                     RUNTIME (user's browser)
  ─────────────────────────────                     ────────────────────────
  SEC EDGAR APIs ─┐
                  ├─► fetch_filings.py                 static site (Vercel CDN)
  AAER sources ───┘        │                                  │
                           ▼                            ┌──────┴───────┐
                   extract_footnotes.py                 │ React/Vite   │
                           │                            │  app         │
                           ▼                            │              │
                    DuckDB (structured)                 │  bge-small   │ ◄─ in-browser
                           │                            │  (search)    │    $0
                           ▼                            │              │
                    build_index.py ──► embeddings ─────►│  vector idx  │
                           │           + UMAP ─────────►│  projection  │
                           ▼                            │              │
                    generate_explanations.py (Claude)──►│  static      │
                           │                            │  findings    │
                           ▼                            └──────────────┘
                    aaer_backtest.py (validation)
                           │
                           ▼
                    packed data files (parquet/json/binary) ──► shipped with app
```

## Components

### Ingestion (`ingestion/`)
- **fetch_filings.py** — SEC EDGAR client. Declares a proper `User-Agent`, respects rate limits (polite delay), retries with exponential backoff, and **caches** every downloaded artifact to `data/raw/` so nothing is re-fetched. Pulls from SEC's structured endpoints (submissions API, Financial Statement Data Sets, full-text search) rather than scraping pages.
- **extract_footnotes.py** — pulls rev-rec + going-concern sections using XBRL/iXBRL tags first, heuristic fallback second. Records `extraction_method` and `extraction_confidence`. Writes to DuckDB.
- **load_enforcement.py** — ingests AAER list + matched clean set; keys on CIK.
- **build_index.py** — embeds footnotes (bge-small), builds the browser vector index, computes UMAP projection, writes packed files.
- **generate_explanations.py** — batched Claude calls for featured pairs; backoff; **hard spend cap**; writes static findings.

### Validation (`validation/`)
- **aaer_backtest.py** — measures whether enforced companies cluster; outputs a pass/fail against the threshold defined in VALIDATION_PLAN.md.

### App (`app/`)
- React + Vite + Tailwind. `search/` holds the in-browser bge-small loader + nearest-neighbor logic. `findings/` renders finding cards + the static explanation layer. `design-system/` holds tokens from DESIGN_SYSTEM.md. The constellation is the hero component.

## Why no server / no Supabase in v1
- Data is read-only reference data; there are no user writes, no auth.
- Static + CDN gives global caching, speed, and $0 hosting essentially for free.
- Fewer credentials to secure and rotate (aligns with the standing security discipline).
- **V2** (accounts, saved searches, live generation) is when a server/Supabase enters — and then as a *fresh isolated project*.

## Performance & "not buggy/slow" plan
The runtime is fast *by construction* because the heavy work is pre-computed:
- Structured data shipped as indexed **Parquet** (columnar, fast).
- Vector search pre-indexed; in-browser, no network round-trip.
- Map uses **level-of-detail / decimation** if node count strains rendering (render all points, but throttle link-drawing and label-drawing by zoom).
- CDN edge-caches all static assets and data files.
- Where care genuinely matters is the **build pipeline**: rate-limiting, backoff, and caching against SEC; spend cap + backoff against Claude API. Those are real and specified.

## Tooling
- **Playwright MCP** serves two jobs: (1) **data verification** — confirm an extracted footnote actually matches the live filing on SEC.gov; (2) **QA** — smoke-test the deployed app (does the hero render? does a known query return the expected neighbor?). It is not primarily a UI-pixel tester.
- **DuckDB** for build-time analytics. **bge-small** for embeddings (same as OXE Explorer, $0 in-browser). **UMAP** for projection. **HDBSCAN** optional for cluster labels.

## Security & safety (v1-appropriate)
- No secrets in the frontend (explanations are pre-baked static text; no API key ships).
- API keys live in local env only, used at build time.
- SEC user-agent + rate limits respected.
- Claude batch script: hard spend cap, backoff, idempotent (re-runnable without double-charging).
- V2 server concerns (auth rate-limiting, query caching, pooling) are explicitly deferred — building them now would protect against load that does not exist.
