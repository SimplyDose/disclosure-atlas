# Disclosure Atlas — frontend

Production frontend for Disclosure Atlas: a comparative disclosure **semantic search** instrument
rendered as an observatory-style constellation map. It is a faithful port of the locked Claude
Design (`design-reference/Disclosure Atlas.dc.html`) wired to the **real** ingested dataset — real
companies, real CIKs, real UMAP coordinates, real cosine similarity, and the 38 real pre-generated
Claude explanations. No fabricated data anywhere (see `docs/DECISIONS_LOG.md` C16).

## Stack
- Vite + vanilla JS (no framework). Canvas 2D constellation, DOM overlays for hero/panel/filters.
- In-browser embeddings via transformers.js (`@huggingface/transformers`, `Xenova/bge-small-en-v1.5`,
  CLS pooling + L2 normalize) — loaded lazily on first paste, $0, no API call.

## Data pipeline
The app reads a static bundle in `public/data/`, built from the embedding artifacts:

```bash
# from repo root, with the project venv active (has numpy + duckdb)
python3 app/scripts/build_app_data.py
```
Outputs: `nodes.json`, `excerpts.json`, `neighbors.json` (cross-company top-10 real cosine),
`findings.json` (38 featured pairs, node-indexed), `aaer.json` (real AAER numbers), `manifest.json`,
and a copy of `embeddings.bin` (for the in-browser paste search).

## Develop / build
```bash
cd app
npm install
npm run dev       # local dev server
npm run build     # static production build -> app/dist
npm run preview   # serve app/dist at http://localhost:4173
```

## Features (v1, all on existing data)
- **Constellation hero** — real UMAP structure; enforced companies in amber (context only).
- **Paste-your-own-footnote** — embeds your text in-browser, surfaces nearest neighbors.
- **Nearest-neighbor exploration** — click a point → fly-to + ranked cross-company neighbors + finding panel.
- **Filters** — footnote type, industry/SIC, similarity threshold, enforcement-only.
- **Finding panel** — companies/CIK, real similarity, real excerpts, real Claude explanation
  (featured pairs) or a neutral honest note, real EDGAR `sec.gov` source links, real AAER badge.

## Honesty guardrails (enforced in copy + code)
- UI language stays at "resembles / similar / nearest / drifted toward distress / outlier".
  Never "suspicious / fraud / flagged".
- Enforcement history is contextual, never a prediction (validation found no enforcement signal in
  these footnote types — see `validation/VALIDATION_RESULTS.md`). Going-concern carries only a
  weak, caveated distress tendency.
- Explanations shown only from the 38 real generated findings; all other pairs are "shown by
  similarity only", never invented analysis.

## Deploy
Static build in `app/dist` is CDN-ready (relative `base`). Deploy with any static host:
`vercel deploy --prod app/dist` (needs a Vercel token — not run autonomously) or drag-drop `dist/`.
The ~8 MB data bundle gzips well; enable gzip/brotli on the host.
