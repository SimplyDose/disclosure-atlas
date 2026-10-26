# Local verification: October 25, 2026

This record covers the local fellowship-presentation changes and second-review
corrections based on `7da5044c75f2702b6d522cbf441472b7d7ac7854`. It supplements the
historical [evaluation report](REPORT.md). These changes have not been published.

## Final combined checks

| Check | Observed result |
|---|---|
| `cd app && npm test` | 21 passed, including all 17 retained featured pairs against decoded vectors, reverse-score precedence, slider-hidden rank exports and statistical known answers |
| `cd app && npm run build` | Production build passed |
| `python -m unittest discover -s eval -p test_featured_integrity.py -v` | 2 passed in the minimal example environment; stale source annotations rejected without importing database dependencies |
| `python -m unittest discover -s eval -p test_screen_reproduction.py -v` | 8 passed in the minimal example environment; all 460 adjusted results checked against SciPy, archive protection and singleton sensitivity checked |
| `python -m unittest discover -s eval -p test_research_example.py -v` | 7 passed in the minimal example environment |
| `python examples/going_concern.py` | Archived cohort, counts and four correlations matched; JSON checks PASS; expected report input hashes refreshed for corrected manifest text |
| `python eval/run_eval.py --offline` | 21 financial formula checks passed, including non-neutral DEPI, SGAI, LVGI and Dechow change terms |
| `python -m unittest discover -s eval -p test_offline_runner.py -v` | 1 boundary/failure-propagation check passed |
| `HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 PYTHONDONTWRITEBYTECODE=1 python eval/run_eval.py` | 45 passed, none failed or skipped, using original-data archives and cached model |
| `cd mcp && ../.venv/bin/python test_harness.py` | 81 passed, none failed |
| Preserved-input SHA-256 comparison | Original paper PDF, cohort-key archive, nodes, embeddings and financial scores unchanged |
| Local Markdown links | All targets present across seven review entry points |
| Python syntax and `git diff --check` | Passed |

The research evaluator ran in the existing Python 3.14.5 environment. The example,
full-family replay and builder-integrity tests ran in the previously freshly installed
minimal environment (`examples/requirements.txt`, NumPy and SciPy only). The full
research dependency specification was not installed into a fresh environment.
The original database and embeddings remained outside Git and were read without
ingesting new filings. The evaluator's new measurements were saved privately, then
the historical measurements file was restored byte-for-byte. No figures were rebuilt.

## Research corrections

Two of the previous 19 featured annotations failed an independent embedding check.
They were removed with their unsupported notes. The builder now rejects score/pair
misalignment rather than silently replacing a number while retaining a stale note.
Recorded forward/reverse neighbor scores take precedence over featured metadata.

The read-only full-family replay retains the published results: three BH survivors
and one Bonferroni survivor, all nested distinctiveness/TATA rows. The separately
labeled singleton sensitivity has three BH and two Bonferroni survivors. Neither
family has a surviving composite-score association. The Dechow/Beneish score-to-score
comparison is outside this testing family. See the [dated research note](../paper/RESEARCH_NOTE_2026-10-25.md)
and [results guide](../docs/RESULTS.md) for definitions, values and reproduction scope.

## Independent review and visual checks

Fresh independent code and research reviews of the second-review corrections found
no actionable high- or medium-priority issues in their checked scopes. The code
reviewer independently ran the 21 JavaScript, eight screen-replay and two builder
checks. The research reviewer independently recalculated both families' adjusted
values, counted singleton observations and verified preserved-input hashes.

Local isolated Chrome checks at 1440 by 1000 and 390 by 844 verified the comparison
panel and layout without horizontal document overflow or page errors. The retained
pair `64142 / 133327` displays `0.9629` with true first neighbor `0.9799`. The retired
pair `101616 / 102169` uses its recorded reverse-neighbor `0.9746`; the unrecorded
`101616 / 102080` comparison displays `Unavailable` without the stale annotation.
Methodology reports 17 featured pairs and links the dated research note. The README
screenshot shows the actual comparison panel.

Earlier in the same local work segment, clean npm installation, citation-schema
validation and design lint passed. Those unchanged setup checks were not repeated
after the second-review wording and integrity corrections.

## Publication gates

No commit, push, PR, merge, deployment or remote CI run was performed. After owner
approval, source documentation must be available on the linked default branch before
deploying the app that links to it. The deployed app, repository links and public
research page then need live verification before the revised version is shared.
XBRL extraction accuracy, new centroid specifications and unavailable paper checks
are separate research revisions, not established by passing these checks.
