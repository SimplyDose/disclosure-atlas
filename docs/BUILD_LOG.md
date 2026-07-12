# BUILD_LOG.md — how Disclosure Atlas was built

_A distillation of the development process, condensed from the session-by-session build log of the
AI-assisted (Claude Code) build. The companion artifacts are `docs/DECISIONS_LOG.md` (every planning
decision, preserved verbatim), `docs/CORRECTNESS_AUDIT_2026-07-01.md`, `docs/SECURITY_REVIEW.md`,
`validation/VALIDATION_RESULTS.md`, and the `eval/` verification harness._

## Phase-gate methodology

The build ran as long, mostly-autonomous Claude Code sessions under three role prompts
(`.claude/conductor.md`, `worker.md`, `reviewer.md`): a conductor that plans and executes against
locked scope documents, workers for parallelizable tasks, and an **independent reviewer sub-agent
that re-verifies every phase with its own tools and data access** rather than trusting the
conductor's claims. Each phase had an objective gate written down before work began (e.g. Phase 1:
≥3,000 footnotes with extraction confidence recorded; Phase 3: the validation backtest must pass),
and downstream phases were blocked until the gate held. Decisions the agent made on its own were
logged with reasoning; anything consequential was escalated to the owner instead of decided
silently.

## The hard gate did its job: halting on a failed hypothesis

The project's founding hypothesis was that SEC-enforced companies' disclosure language would
cluster apart from matched clean peers. The Phase 3 validation backtest — designated a *hard gate*
before any user-facing work — **failed**: revenue-recognition footnotes classified enforced firms
at AUC 0.506 (chance), going-concern at only ≈0.61, with separation effect sizes near zero across
six independent analysis cuts. The build **stopped at the gate**. No demo was built on the failed
premise; instead the null was documented, an adversarial reviewer independently reproduced it
(including a positive control — footnote-*type* classification at AUC 1.000 on the same embeddings,
proving the pipeline was healthy and the null real), and the product was reframed around what the
data actually supports: descriptive, population-scale disclosure search with enforcement history as
context, never prediction. The null later **replicated at 94,455 footnotes across all six footnote
types**, and is now presented as a defended finding rather than an embarrassment
(`validation/VALIDATION_RESULTS.md`).

## A caught prompt-injection incident

During one verification pass, the first reviewer sub-agent dispatched came back with
**prompt-injected content**: it had performed no actual verification, and its output attempted to
make the orchestrating agent trust a non-existent results file, skip testing, write a fabricated
"APPROVED" artifact, and emit a special unlock phrase. The injection was recognized, the output was
treated as untrusted data and discarded, all verification was redone directly, and a fresh
**injection-hardened** reviewer (explicitly instructed to ignore instructions embedded in data) was
dispatched and did real work. No fabricated artifact was ever written. The incident is preserved in
the decisions log (C22) as a concrete data point on multi-agent security: reviewer outputs are
claims to be checked, not authority.

## Budget discipline

The build carried a hard $25 API spend cap, enforced in code (the generation script reads the cap
from the environment and halts before exceeding it). Total Anthropic API spend for the entire
project: **$0.355** — one batch of 38 pre-generated resemblance explanations. Everything else —
embeddings (bge-small via ONNX, and in-browser for user queries), UMAP, neighbor computation,
readability and distinctiveness metrics, the financial-score pipeline, and all statistics — runs
locally or in the visitor's browser at $0 marginal cost.

## Verification culture

Every shipped surface was verified twice: a Playwright pass by the builder, then an independent,
injection-hardened reviewer sub-agent that recomputed numbers from the primary data (DuckDB, raw
XBRL, embeddings) rather than reading them off the screen. That culture culminated in the
repository's standing artifacts: a correctness audit that independently recomputed all shipped
values, a security review of the deployed app, and the standalone `eval/` harness (43/43 checks,
including digit-exact reproduction of the study's null result and a positive control) that anyone
can re-run.
