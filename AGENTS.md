# Disclosure Atlas: shared agent guide

Start at [README.md](README.md) for setup and the offline check. The current frontend
is Vite + vanilla JavaScript, static data and browser-side embeddings. The build-time
research pipeline uses DuckDB; Supabase/pgvector is not a current frontend dependency.

## Scope and evidence

The earlier guides named `docs/SCOPE_V1.md` as canonical, but that file is absent.
Do not reconstruct or replace an approved scope from assumptions. Preserve existing
boundaries below; raise scope conflicts and obtain the missing specification or an
approved scoped decision before product behavior, schema or architecture changes.
The approved offline-check pilot changes verification and descriptive documentation,
not the product or research scope.

- Preserve the archived paper, recorded analysis definitions, Bonferroni/FDR safeguards and known-answer
  evaluation. An offline pass is not full research replication.
- No new ingestion, live SEC calls or fabricated data. Use existing derived assets
  with attribution. Financial screens and enforcement history are research context,
  never a fraud conclusion or enforcement prediction.
- Keep credentials local and out of frontend/source history. Escalate schema changes,
  spending, privacy, destructive operations, design-system deviations and scope forks.
- Preserve [docs/DATA_MODEL.md](docs/DATA_MODEL.md),
  [docs/VALIDATION_PLAN.md](docs/VALIDATION_PLAN.md) and
  [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) for affected work. Historical role guides
  in `.claude/` remain available; they do not resolve missing specifications.

## Verification and completion

- Formula/edge checks: `.venv-offline/bin/python eval/run_eval.py --offline` after the
  setup in docs/REPRODUCIBILITY.md. Keep full/fast research evaluation available as documented in
  [eval/README.md](eval/README.md).
- The local read-only MCP server is `mcp/server.py`; its research caveats in
  `mcp/honesty.py` must travel with scores. For MCP changes, use the full project
  environment and run `../.venv/bin/python test_harness.py` from `mcp/`. See
  [mcp/README.md](mcp/README.md) for its distinct data and model requirements.
- The deployed frontend uses its shipped bundle, not this machine's archival `data/`.
  Keep local data, model caches and ignored assets intact; moving them is separate work.
- Run relevant checks and obtain fresh independent review before claiming code complete.
  Record the actual checked revision and unresolved gates in the existing task record.
- Verify all linked deployment triggers before any push/PR/merge. Owner approval still
  governs production deployment and release. Preparing or passing checks does not grant
  authority to publish, merge, ingest, spend or alter data.
