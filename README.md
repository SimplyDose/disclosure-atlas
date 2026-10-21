# Disclosure Atlas

Disclosure Atlas is a browser-based semantic search research instrument for SEC disclosures. I built this to study the relationship between how distressed companies write their disclosure notes and their financial condition. It maps 161,469 footnotes from 3,253 public companies and allows you to search by meaning and compute financial quality scores at scale. To test my findings, I built a systematic screening framework and ran hundreds of pre-registered tests, and implemented safeguards to prevent false discoveries and p-hacking, including:

- mandatory corrections
- locking in the tests before running them
- reporting every result

## What I found

My findings suggest that among companies issued a going-concern warning, the way they write their disclosures has no meaningful relationship to their financial-quality measures. This was tested rigorously with 460 tests, only 3 of which survived, and none involved the financial scores. Overall, this paper suggests disclosure language reflects the standardized conventions public companies follow rather than their financial condition.

## What's in this repo

- `paper/`: the working paper, plus the replication code that regenerates every table (`final_tables.py`) and every figure (`make_figures.py`) from the real data. The exact cohort is archived in `gc_cohort_2010_2026.csv`.
- `app/`: the source code for the Disclosure Atlas app itself. It's a static site. The embeddings run in your browser, and there is no backend.
- `ingestion/`: the pipeline that pulls the filings from SEC EDGAR and extracts the footnotes.
- `eval/`: the evaluation harness. It re-derives the core results with independently written code and checks them against the published numbers. The recorded full evaluation is in `eval/REPORT.md`; use the commands below for fresh checks of the current checkout.
- `docs/`: architecture notes, the build log, and the audits.

## Start here for development

Read [AGENTS.md](AGENTS.md) for shared project boundaries and the scope-document gap.
The current frontend is **Vite + vanilla JavaScript with static data and browser-side
embeddings**; Supabase/pgvector is not part of its current runtime. See
[app/README.md](app/README.md) for frontend setup and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
for the build-time pipeline.

For the data-independent financial checks, use Python 3.14.5 in a separate environment:

```bash
python3.14 -m venv .venv-offline
.venv-offline/bin/python -m pip install -r eval/requirements-offline.txt
.venv-offline/bin/python eval/run_eval.py --offline
```

The same command runs in the proposed [offline workflow](.github/workflows/offline-checks.yml).
It tests production formulas against known answers and edge cases, without datasets,
model downloads, credentials, SEC calls or paid calls. Dependency installation needs
package-registry access; the check itself works offline. It does not certify the full
study, frontend or MCP server. See [eval/README.md](eval/README.md) for the full evaluation.

Deployments are separate owner-approved operations. Before publishing a branch or
merging, verify all connected hosting triggers, including Vercel and GitHub Pages;
an unchanged Pages workflow alone does not establish deployment isolation.

## How it works

The corpus is 161,469 footnotes extracted from the annual filings of 3,253 public companies on SEC EDGAR. For each disclosure I measure two things about the language and two financial screens:

- readability (the Gunning Fog Index)
- distinctiveness (cosine distance from same-industry peer disclosures)
- the Beneish M-Score
- the Dechow F-Score

To make sure nothing was hiding in subgroups, I ran a systematic screen of 460 tests with Bonferroni and Benjamini–Hochberg FDR corrections applied across the whole family.

## Links

- Live app: https://disclosure-atlas.vercel.app
- Project page: https://simplydose.app/disclosure-atlas
- Paper: [`paper/disclosure_atlas_paper.pdf`](paper/disclosure_atlas_paper.pdf)

## Built with

I built this with AI assistance (Claude, via Claude Code), and all of the computations were independently verified. See the AI-Use Disclosure in the paper for details.

## License

MIT. See [LICENSE](LICENSE).
