# Ingestion build notes — Phase 1 foundations

Record of the first ingestion tasks (fetch client + enforcement ground truth), preserved from the
build log. The full development narrative lives in `docs/BUILD_LOG.md`.

### ✅ Task 1 — SEC fetch client (ingestion/fetch_filings.py)
Rate-limited (≤8 rps), exponential backoff on 429/5xx, caches every artifact to data/raw/. Smoke test passed (Apple submissions + cache hit).

### ✅ Task 2 — AAER enforcement ground truth (ingestion/load_enforcement.py + db.py)
- DuckDB schema (ingestion/db.py) matches DATA_MODEL.md exactly — no schema drift, no blocker.
- Parsed 1,513 unique AAERs from SEC archive pages 2001-2019 + current index.
- Classified 393 as issuer-companies (excluded ~1,120 individuals/audit firms).
- Resolved **192 enforced companies** to verified CIKs (symmetric name match vs submissions API; SIC backfilled). 281→214→192 as precision filters tightened.
- 159 unresolved names logged to data/processed/enforcement_unresolved.json (honesty: nothing silently dropped).
- AAER date range 2001-2025. Spot-checked correct: Adelphia, Avon, Biovail, Magnum Hunter, Computer Sciences, JPMorgan Chase.
- API spend so far: $0 (SEC only; Anthropic untouched).
