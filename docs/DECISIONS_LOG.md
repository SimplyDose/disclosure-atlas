# DECISIONS_LOG.md — Disclosure Atlas

> _**Provenance note.** This is the verbatim, in-flight decision log from the AI-assisted build,
> preserved unedited as a transparency artifact. Entries were written by the build agent at the
> moment each decision was made and are addressed to the project owner in the second person;
> status lines and open items reflect the state of the project at that time, not the present.
> Nothing below has been retouched for publication._

> **Josh: read this file.** It bundles every decision I made on your behalf during planning, what the options were, what I chose, and why. If you disagree with any of these, say so and we change it before the build. After build starts, the Conductor appends its own self-made decisions below the line.

---

## Decisions locked during planning (made for you, with reasoning)

### 1. Product = EDGAR footnote semantic search (NOT the GL/fraud engine)
**Chose:** the public-filings disclosure-search product.
**Why:** it's solo-buildable, demoable with a clickable public link, novel in the AION sense, validatable against free SEC ground truth, and showcases *your* accounting judgment. The GL engine needs private data you can't get, can't be validated without labeled fraud data, can't be demoed, and carries liability framing a reviewer won't want to adjudicate. The GL engine survives as the "future commercial path" section — which makes you look more strategic.

### 2. Name = Disclosure Atlas
**Chose:** Disclosure Atlas (you confirmed). **Why:** authoritative, instantly legible to an accounting/fellowship audience, instrument/cartographic feel without leaning on stars (avoids looking derivative of AION). Tagline keeps a faint celestial note: "a disclosure atlas for the public markets."

### 3. Footnote types = revenue recognition + going concern (2 types)
**Chose:** these two for v1. **Why:** rev-rec is where most accounting fraud lives (densest signal); going concern captures the distress/failure story. Together = complete narrative. Related-party is the strong third but triples extraction complexity for marginal v1 gain → V2.

### 4. Universe = AAER-enforced companies + matched clean comparison set
**Chose:** this over a broad small-cap universe. **Why:** it's the only choice that makes the project *provable*. Enforced companies are labeled positives; matched clean companies are negatives; that's what lets you *demonstrate* the engine works and produce the headline "clean company in a fraud cluster" moment. Broad-realistic universe = V2.

### 5. LLM explanation layer = secondary, pre-generated at build time
**Chose:** Claude explains resemblances, but generated once at build time and shipped as static text; deterministic embedding search is the engine.
**Why:** keeps runtime cost at $0, keeps the system explainable/defensible (Claude explains, never decides), and stays on-brand for an Anthropic fellowship. Live on-demand generation = V2 (capped).

### 6. Cost posture = $0 runtime; one-time build spend, hard-capped
**Chose:** bge-small in-browser for search ($0); batch Claude generation with a hard cap (~$25, expected actual $5–15).
**Why:** you set a $50–100 ceiling; this stays far under it. Hero explanations can come from your Max subscription via Claude Code; bulk via API batch.

### 7. No Supabase, no Cloudflare in v1
**Chose:** DuckDB/Parquet + static Vercel + CDN. No server, no auth, no database service.
**Why:** v1 data is read-only reference data with no user writes — a server would be solving a problem you don't have. Fewer credentials to secure/rotate. Supabase enters only at V2 (accounts), as a *fresh isolated project* separate from SimplyDose/OXE. Cloudflare only if you add a custom domain.

### 8. Visual direction = real embedding graph + star-chart skin + instrument grid
**Chose:** render the *real* force-directed/UMAP structure (your image 1) dressed in deep-navy star-chart restraint with a faint coordinate grid (your images 2–3). Interactive: click to see why two companies are close. Amber = enforced.
**Why:** the data's true shape is the beauty and it's honest — every point is a real footnote. Interactivity ("click to see why") *is* the value proposition made tactile. This is the signature; everything else stays austere.

### 9. Motion = slow, weighted, deliberate (anti-slop)
**Chose:** custom slow-out easing, no bounce/spring, long fly-to durations, subtle ambient drift, reduced-motion respected.
**Why:** premium reads as physics, slop reads as bouncy effects. This single discipline does a lot of the "not AI-generated" work.

### 10. Autonomy mechanism = gated phases + escalation contract + two log files
**Chose:** Conductor/Worker/Reviewer with explicit gates, an escalation contract (what to decide vs. what to ask), `BLOCKERS.md` for true blockers, `DECISIONS_LOG.md` for self-made calls, and a `SETUP.md` preflight that gathers all keys *before* the long run.
**Why:** this is what buys hours of unattended progress with intervention only at crucial points — autonomy is paid for upfront in spec quality.

### 11. Validation is a hard gate before the demo is built
**Chose:** separation + retrieval + headline-example + semantic-beats-keyword tests must pass before frontend/explanations/deploy.
**Why:** the whole project's credibility rests on enforced companies actually clustering. We find out *before* building the hero, and we surface weak signal honestly rather than dressing up noise.

---

## Decisions for YOU to confirm or override
- The $25 hard spend cap (vs. your $50–100 ceiling) — comfortable?
- Disclosure Atlas as final name (vs. Reckoner/Ledgerline if you want more edge).
- Anything in 1–11 you'd change.

---

## Conductor self-made decisions (appended during build)

### C43. PHASE 5 — COMBINED DESCRIPTIVE INTERSECTION VIEW, live, reviewer honesty-audit PASS
Surfaces companies that are descriptively unusual on MULTIPLE INDEPENDENT measures at once, purely as starting points for HUMAN investigation. $0 (existing data; embeddings lazy only if the change criterion is used). The honesty framing was the central design goal. New module `app/src/intersect.js` (`Intersect` modal class); command-bar `⊕ INTERSECT`.
- **Functionality:** toggle which independent measures to intersect — distinctiveness tier (distinctive+/highly, `node.dvi`) · Beneish M above −1.78 (`node.mflag`; components from scores.json) · enforcement-heavy industry (top-quartile SIC enforcement rate, ≥5 cos — a descriptive industry fact) · year-over-year disclosure change ≥ threshold (Phase-4 measure). Shows companies meeting ALL selected criteria, composable with the active filters (pool = `engine.filteredIndices()` ciks). Export (each measure a SEPARATE column) + cite.
- **HONESTY (the point):** NO composite/combined score — measures are never summed/multiplied; each is shown on its own labeled line per company and as its own CSV column. NOT a risk score / fraud screen / ranking of suspicion / prediction. Results listed ALPHABETICALLY, never ranked. A prominent, unavoidable `.ix-caveat` banner states all of this + co-occurrence-is-not-evidence + the replicated null + cannot-re-validate. Cool/neutral only; amber = the "enforcement history" tag only; no alarm colors; no suspicious/concerning/anomalous/flagged-as-risk language (only honest negations). Methods + DESIGN_SYSTEM updated with the framing + caveat.
- **Verified:** my Playwright — intersection logic EXACT (dist=highly + M = 328 == independent recompute; +heavy +change = 37, all meet all four); each card shows N separate measures (no composite); alphabetical; CSV = 27 separate columns, zero composite/risk/score column; caveat present; enforcement tag amber, all else cool; 0 console errors; mobile no overflow; 94,455 intact. Independent injection-hardened reviewer (52 tool calls) with an EXPLICIT honesty audit: **HONESTY AUDIT PASS (1a no composite/risk score · 1b no ranking-by-suspicion · 1c no alarm colors/forbidden language — all hits are negations · 1d prominent unavoidable caveat · 1e measures independent)** and **Functional PASS** — set-equality cross-check exact (328→37), composes with filters (Pharma 25), export separate columns, no regressions, 0 console errors fresh, no secrets/source-maps. No release-blocking defects (the two INFO 404s were the stale prior-bundle sourcemap hash + a localhost harness artifact — not the current app). Redeployed to https://disclosure-atlas.vercel.app. Anthropic spend unchanged at **$0.355 / $25**.

### C42. PHASE 4 — DISCLOSURE CHANGE / SHIFT DETECTION (discovery), live, reviewer-verified
Turned the instrument from look-up into discovery: surfaces the largest YEAR-OVER-YEAR change in disclosure LANGUAGE across the corpus, from the existing embeddings. $0 (no ingestion/generation; computed in-browser from the int8 buffer). ui-ux-pro-max + emil-design-eng; calm-terminal styling.
- **Measure:** for each company + footnote type, cosine DISTANCE (1 − cos) between that company-type's principal (longest) excerpt embedding in consecutive AVAILABLE fiscal years (gaps shown, never hidden). New module `app/src/changes.js` — lazy `ensureChanges` (one pass over 94k nodes + the int8 embeddings; ~26,547 events), `Changes` modal class, `timelineHTML`, `changesForCik`.
- **Ranked + queryable** (`#changesModal`, command-bar `⇌ DISCLOSURE SHIFTS`): scannable rows (rank · company · type · FYa→FYb · neutral magnitude bar · value · open ↗), sorted by magnitude. **Composes with every existing filter** by requiring both endpoint excerpts ∈ `engine.filteredIndices()`. Export CSV (carries `change_cosine_distance`) + cite.
- **Before/after:** open ↗ reuses the compare view, prefilled with the two years' excerpts and the PRECOMPUTED cosine (shown number == ranked magnitude exactly; no re-embed drift).
- **Profile timeline** (`.pf-timeline`, lazy `_fillTimeline`): per-type rows of neutral bars (one per YoY transition), year-labeled, click-to-compare.
- **Honesty:** strictly descriptive — "largest year-over-year change in disclosure language"; NOT a red flag / not suspicious / not predictive (replicated null referenced); cool/neutral bars (`--node-base`), amber enforcement-only; one-line caveat on every surface. Methods + DESIGN_SYSTEM updated.
- **Verified:** my Playwright — magnitude recompute EXACT vs raw int8 (top events match:true); filter composition (going concern 1,844 all t=1; CAM 2,417 all t=3; full 26,547); compare cosine == 1−dist (0.4045); AMD timeline 39 bars / 5 types; CSV carries the measure (1,844 going-concern rows); 0 console errors; mobile no overflow; 0 forbidden words; 94,455 intact. Independent injection-hardened reviewer (50 tool calls): **PASS 8/8** — recompute exact (diff 0), ranking sorted, filters compose (incl. enforced 1,781 all e=1), over-narrow → graceful, export faithful, honesty clean (bars rgb(138,151,168) neutral; amber only on enforced tag), no regressions. Fixed the reviewer's one MEDIUM bug (timeline `data-tl` was split on "." which collided with the cosine decimal → compare showed 0.0000; changed the separator to ":" — verified live shows 0.6243) + tightened "consecutive" → "consecutive available fiscal years" copy. (Reviewer's other notes: the stale "no filters applied" subtitle is the known UI-select-bound describe(), correct on the real user path / consistent with cohort; the sourcemap 404 was the prior bundle, already resolved.) Redeployed to https://disclosure-atlas.vercel.app. Anthropic spend unchanged at **$0.355 / $25**.

### C41. PHASE 3 — RESEARCH-GRADE PANEL EXPORT (Stata/R), live, reviewer-verified 9/9
Built an analysis-ready company-year PANEL dataset export for empirical accounting researchers, from any cohort (the existing filters). $0 (reuses existing computed data; no ingestion/generation). Entirely in-browser. ui-ux-pro-max + emil-design-eng; calm-terminal styling.
- **Panel grain:** company-fiscal-year (one row per company per fiscal year) — explicit + documented. Sample = the cohort's distinct (cik, fiscal_year) footnote-defined company-years; disclosure measures aggregated over ALL footnotes of each retained company-year (full profile); financial screens = the academic scores for that exact company-year.
- **Modules:** `app/src/dataset.js` (ONE `COLS` registry → CSV header + codebook + Stata/R snippets, no drift; buildPanel/buildPanelZip), `app/src/zip.js` (dependency-free store-only ZIP writer + CRC32), `app/public/data/tickers.json` (cik→ticker, generated by build_scores.py). Wired into the cohort modal (`.ch-panelx` section + `⤓ PANEL DATASET (.zip)`).
- **37 columns:** identifiers (cik zero-padded = PRIMARY join key · ticker · company_name · sic_code · sic_industry), point-in-time (fiscal_year · filing_date = date the 10-K was filed / measures became public · accession), disclosure (n_footnotes · gunning_fog · distinctiveness · 6 has_<type> flags), financial (beneish_m + flag + 8 components · dechow_fscore + prob + 7 inputs), enforced (context). **Missing as empty NA, never zero.**
- **Bundle (.zip):** panel.csv · codebook.md (every column: name/def/units/source/date-basis) · import_panel.do (Stata: import delimited + encode + xtset + date + labels) · import_panel.R (readr col_types, cik=character, filing_date=date) · CITATION.txt (tool + Beneish 1999 + Dechow 2011) · SAMPLE_SELECTION.txt (the exact filters + construction) · README.txt.
- **Honesty:** M/F are cited screens with limitations + cannot-re-validate; disclosure descriptive; replicated null referenced; no "risk score", no judgment column (enforced = context). Fixed the now-inaccurate methods "ticker carries no tickers" line (the panel populates ticker where resolvable; CIK is the join key).
- **Verified:** my Playwright + Bash (unzip/duckdb) — full-population panel = 12,436 obs = distinct cik|pfy in nodes; AMD FY2022 M −1.14 / AQI 2.9933 / flag 1 / Dechow EMPTY (matches DuckDB); missing-as-NA confirmed (8,025 rows: all beneish components empty, never 0); R col_types EXACT 37-col match to header; codebook 37 rows; zip integrity OK; 0 console errors; mobile no overflow; 0 forbidden words. Independent injection-hardened reviewer (49 tool calls): **PASS 9/9** — row counts + AMD FY2022 + Brown-Forman FY2019 components match DuckDB; NA-not-zero verified; smaller cohort (Semiconductors 284 obs) correct; deliverables complete; honesty clean; no regressions at 94k; no secrets. Reviewer's one LOW note (a `.map` 404) was a stale-session DevTools probe on the PRIOR build hash — confirmed non-reproducible: the current deploy emits no sourcemap references and a fresh load shows 0 console errors + 0 .map requests. Redeployed to https://disclosure-atlas.vercel.app. Anthropic spend unchanged at **$0.355 / $25**.

### C40. HOLISTIC DESIGN-CONSISTENCY PASS — one coherent instrument, live, reviewer-verified 7/7
Swept the whole product (built across separate chapters) so every section shares one finish. No features/data/layout/honesty-copy changed — CSS-only + one ESC-hash tidy. $0. ui-ux-pro-max + emil-design-eng against DESIGN_SYSTEM.md as source of truth.
- **Unified the text hierarchy into 3 deliberate levels** applied identically everywhere: (1) overlay title — `.panel-title`/`.ch-title`/`.mb-title` → mono 11px/600/2.5px/cyan (were 11/3 vs 12/2.5); (2) section/pillar header — `.section-label`(finding)/`.pf-pillar-h`/`.ch-pillar-h`/`.mb-h` → mono 10px/600/1.6px/cyan (the finding panel's section headers were FAINT while every other surface was cyan — the biggest drift; now identical, reviewer-confirmed all four computed-equal); (3) eyebrow/caption → mono 9.5px/500/1.6px/faint.
- **Amber discipline restored:** `--signal-amber` is now ENFORCEMENT-ONLY. The methodology validation/null callout `.method-finding` was the lone misuse (amber border/tint/label) → recoloured to the cool callout treatment (`--accent-line` left rule + `--field-inset` + cyan label), matching `.fin-honesty`. Reviewer confirmed enforcement badge still amber rgb(224,160,74); all scores/markers/bars cool-neutral (no amber/red anywhere else).
- **Hover unified:** removed an ad-hoc translucent-cyan hover (`rgba(91,164,221,0.08)`) on `.sb-key`/`.search-go` → `--field-raised` (matches the other chrome cells). Reviewer grep confirmed the rgba is gone from the shipped CSS.
- **Lens-tile metric** `.fin-tile-val` 24→22px to match `.cx-fog` (parallel "lens tile metric").
- **mb-h** lost its lone bottom-border so section headers match across surfaces.
- **ESC/click-outside hash tidy:** ESC/backdrop-close on a hash-bearing overlay (#methods, #c=) now clears the hash like the ✕ buttons (`closeFinding`/`methodsClose` already did). Reviewer's one LOW note → fixed; verified live (#methods → "" on ESC).
- **Verified:** my Playwright (computed-style cross-surface equality + 0 console errors + mobile 390 no overflow + 94,455 intact) and an independent injection-hardened reviewer (58 tool calls): **PASS 7/7** — section headers + titles computed-identical across all surfaces; amber enforcement-only; hovers unified (no cyan-rgba residue); no regressions (finding/profile+peer/cohort/methods/methodology all work, #methods permalink works, modals close via ✕+ESC); honesty copy byte-unchanged (only honest negations / academic-model names); mobile 0 overflow on every surface; no secrets/source-maps. DESIGN_SYSTEM.md updated with the unified hierarchy. Anthropic spend unchanged at **$0.355 / $25**.

### C39. METHODS & REPRODUCIBILITY BUNDLE — comprehensive citable resource (panel + download), live, reviewer-verified
Made the tool citable in academic work: a comprehensive methods/reproducibility document, both an in-app panel and a downloadable Markdown file. $0 (consolidation of existing docs/data; no generation). Calm-premium terminal styling.
- **Single source of truth:** new module `app/src/methods.js` — `sections(manifest, findings)` builds the content model; `renderMethodsHTML` (panel) and `buildMethodsMD` (download) both render from it, so the page and the file never drift. All numbers come from `manifest.corpus` / `manifest.validation` / `manifest.financials`.
- **Data-driven coverage:** `app/scripts/build_scores.py` now injects a `financials` block into manifest.json (read from validation/chapter_d_coverage.json + the companyfacts checkpoints) — with_companyfacts 2,222 / absent 528 / companies_with_financials 1,687 / company_years 17,541 / candidate 15,790 / beneish 6,252 / flagged 837 / dechow 5,782 / neither 7,873 / enforced_with_beneish 59 / threshold −1.78 / unconditional 0.0037. So the methods numbers are accurate + cross-checkable.
- **10 sections:** Overview · Corpus definition (+counts table) · Disclosure-pillar methods (embedding/similarity/UMAP params + Gunning-Fog formula + distinctiveness definition + BM25) · **The replicated null** (per-type Cohen's d table, stated plainly) · Financial-pillar methods (Beneish + Dechow **formulas**, **XBRL tag-mapping table**, coverage table) · Financial-model limitations incl. **cannot-re-validate** · **Data dictionary** (every export column) · Citations (formatted papers) · Limitations (both pillars) · Suggested tool citation (with retrieval date).
- **Access:** dedicated `#methodsModal` (`.methods-card`, sticky header + "↓ DOWNLOAD (.md)") reached from the Methodology modal's "↗ full methods & reproducibility" button and the shareable **`#methods`** permalink. Removed the old per-chapter `buildMethodsCard` (stale 2-type data dictionary) in favor of this consolidated source.
- **Honesty:** the null + cannot-re-validate are prominent sections, not buried; no "our risk score" / no overclaiming (only honest negations remain — "no per-company risk score", "not our judgment").
- **Verified:** my Playwright (local + live) — 10 sections render, numbers cross-check manifest, formulas/tag-mappings/citations present, download works, 0 console errors, mobile no overflow. Independent injection-hardened reviewer (30 tool calls): **8/9 then 9/9 after fixes** — every corpus + financial number cross-checked to manifest AND DuckDB exactly (footnotes 94,455; beneish 6,252 == duckdb; flagged 837/6,252 = 13.4%; dechow 5,782; companies_with_financials 1,687), formulas verbatim-correct, null + cannot-re-validate prominent, data dictionary complete, citations correct, download = panel (no drift), honesty clean, no regressions/secrets/source-maps. **Fixed the one MEDIUM defect it found** — the `#methods` permalink didn't open on fresh load (missing applyHash branch) → added; verified opens on load. Also disambiguated a LOW "universe" label (2,750 fetch list vs 1,978 in-DB). Redeployed to https://disclosure-atlas.vercel.app. Anthropic spend unchanged at **$0.355 / $25**.

### C38. PEER BENCHMARKING — company vs SIC-industry peers (both pillars), in the Company Profile, live, reviewer-verified 6/6
Added a "PEER COMPARISON" section to the Company Profile answering the auditor/researcher question "is this company typical or unusual for its industry?" $0 (in-browser computation on existing data; no ingestion/generation). Calm-premium terminal styling.
- **Computation (profile.js):** for the selected company vs its **SIC-industry peers** (companies sharing `node.ind`, built once into `cikInd`): each company's *representative* value = median across its disclosures (Gunning Fog, distinctiveness `dst`) / median across its scored years (M, F via scores.json). Compares the company's representative to the distribution of peers' representatives — median, IQR, p10/p90, and the company's **percentile**.
- **Render:** one scannable `.pf-cmp` row per measure (Complexity·Fog, Distinctiveness, Beneish M, Dechow F): company value · "ind. median X" · a **position bar** (`.pf-bar`: IQR band + median tick + a cool `●` marker at the company's value) · a descriptive phrase ("well less complex than its industry's median · ~5th percentile of 37 peers" / "typical for its industry"). Full-width section above the two pillars.
- **Honest handling:** descriptive/comparative ONLY ("higher/lower/typical vs industry median"), never "outlier of concern" or any individual judgment; <5 same-industry companies → "too few for a peer comparison" (no fabricated position); company with no M/F → "no score · industry median for context" (no blank/zero); a one-line caveat states position is descriptive context, not a verdict; M/F carry the screens-not-verdicts + cannot-re-validate framing. Cool/neutral only — marker `--accent-cool`, band `--field-raised`, tick `--ink-faint`; amber stays enforcement-only.
- **Constraints:** no "our risk score", no guilt-implying ranking, no alarm colors. Existing features + honesty copy untouched. Reused existing data. DESIGN_SYSTEM.md updated.
- **Verified:** my Playwright (local + live) — AMD vs Semiconductors (37 peers): Fog 16.8 vs ind 19.0 (~5th pctile), distinctiveness 0.194 vs 0.180 (~70th), M −2.48 vs −2.60 (~68th of 31 scored), F honest no-score — independently recomputed from engine.nodes, exact match; neutral cyan marker; 0 console errors; mobile 390px no overflow; 0 forbidden words (only the established "not our judgment" negation). Independent injection-hardened reviewer (32 tool calls): **PASS 6/6** — recompute matches displayed Fog/dst/peer-counts/percentiles exactly; small-industry (Apple's 4-company SIC, a 1-company SIC) → graceful "too few"; no-data graceful; dot cyan on all rows incl. high percentiles (no alarm); honesty clean; no regressions at 94k; no secrets/source-maps. Reviewer found one LOW cosmetic bug — percentile ordinal hard-coded "th" ("83th") — **fixed** (added `ord()` → 1st/2nd/3rd/…; verified live "~83rd percentile"). Redeployed to https://disclosure-atlas.vercel.app. Anthropic spend unchanged at **$0.355 / $25**.

### C37. COHORT / BATCH ANALYSIS — group-level research over both pillars, live, reviewer-verified 6/6
Turned the instrument from per-company browsing into group-level research. $0 (in-browser computation on existing data; no ingestion, no generation). Calm-premium terminal styling (ui-ux-pro-max + emil craft).
- **The cohort IS the current filter set** — "▤ ANALYZE COHORT" in the command bar opens `#cohortModal` computing aggregate statistics over `engine.filteredIndices()`. New module `app/src/cohort.js` (`Cohort` class); reuses the existing filters (industry/SIC, type, year range, complexity/distinctiveness tiers, enforcement, financials/M-flag, similarity) as the cohort definition.
- **KPIs:** footnotes · companies (distinct CIK) · footnote types · filing-year range. Header shows the cohort definition derived from the active filter selects.
- **Disclosure pillar:** Gunning-Fog + distinctiveness summary stats (median · IQR · range) with compact histograms (neutral `--node-base` data bars) + vs-industry tier counts; **embedding clustering** = exact mean intra-cohort cosine vs the all-population baseline, computed O(N·dim) from the int8 buffer via the centroid identity `Σᵢ≠ⱼ uᵢ·uⱼ = ‖Σu‖² − Σ‖u‖²` (added `rawEmb`/`dim`/`inv` getters to paste.js; baseline cached). Self-consistent: the all-population cohort reads "0.602 vs 0.602 · about as clustered as the population"; a going-concern+M-flag cohort shifts to 0.732 (more tightly clustered).
- **Financial pillar:** M-Score + F-Score distributions **deduped to distinct company-years** (scores are per company-year, not per footnote) — median · IQR · range, **% above threshold** (group stat), histograms with outliers clamped to a sane window (true min/max kept in the range line). Honest "no scores in this cohort" message for pre-XBRL / financial-sector cohorts.
- **Export + cite:** whole cohort → CSV/XLSX (reuses the bulk filtered-set builder — both pillars' columns) + a reproducible **cohort cite** (definition + counts + retrieval date + aggregate-descriptive / screens-not-verdicts disclaimer).
- **Honesty/constraints:** aggregate/descriptive ONLY — statistics describe the group, never judge or rank an individual; amber stays enforcement-only; histograms/score stats cool/neutral; no "our risk score". Existing features + honesty copy untouched. DESIGN_SYSTEM.md updated.
- **Verified:** my Playwright (local+live) — cohort footnote KPI == filteredIndices length (358 cohort; 94,455 all), companies == distinct CIK, both pillars accurate, clustering self-consistent, CSV (358 rows) + cite work, 0 console errors, mobile no overflow, 0 forbidden words. Independent injection-hardened reviewer (42 tool calls): **PASS 6/6, no material defects** — counts track the filter across ≥2 definitions + empty cohort graceful; M median −2.57 (duckdb −2.56), 13.9% flagged (duckdb 13.4%), F>1 28.4% (duckdb 28.95%) all cross-checked; M/F over distinct company-years; export both pillars; honesty 0 hits; `.ch-bar-fill` = neutral rgb(138,151,168) (not red/amber); no regressions at 94k; no secrets/source-maps; 0 console errors. Two INFO notes (header reads the on-page selects — always correct on the real user path; `beneish_flagged` = the model's own term) — no fix needed. Redeployed to https://disclosure-atlas.vercel.app. Anthropic spend unchanged at **$0.355 / $25**.

### C36. COMPANY PROFILE — unified two-pillar company view (centerpiece research workflow), live, reviewer-verified 7/7
Built the highest-value research feature: one composed, scannable view of everything the instrument knows about a single company. $0 (computation on existing data, no ingestion, no generation). Matched the calm-premium dark-terminal system exactly (ui-ux-pro-max + emil craft).
- **New module `app/src/profile.js` (`Profile` class)** — built entirely from already-shipped data (nodes, neighbors.json, scores.json, aaer.json); no new data. New `#profileModal` (large `.profile-card`, reuses modal infra: inert/ESC/click-outside). Reached by clicking any **company name** (finding-panel two-co cells are now `.co-name-btn`, wired via a new Panel `onCompany` callback) or the shareable permalink **`#c=<CIK>`** (added to applyHash). Exposed on `window.__atlas.profile`.
- **Header:** name + CIK·SIC·industry (mono); enforcement badge in **amber** (the one correct amber — enforcement context) with AAER numbers, else a quiet neutral pill.
- **Disclosure pillar:** every footnote grouped by type, each row = FY + Gunning-Fog(vs-industry) + distinctiveness(vs-industry) + **`open ↗`** (closes profile → opens it in the finding panel + locates on the constellation); plus **nearest companies by disclosure language** (aggregated cross-company neighbors; each opens that company's profile — profile-to-profile navigation).
- **Financial pillar:** **M / F by fiscal year** master table; click a year to expand its full component breakdown (reuses the finding panel's `yearTilesHTML`, newly exported from scores.js); above-threshold M marked with a **cool ▲ (never red/amber)**; outliers `≫`; no-score years honest; a company with zero computable years shows a concise "no sufficient inputs" message (added branch); the screens-not-verdicts / cannot-re-validate / literature-based honesty note always present.
- **Export + cite:** whole profile → CSV/XLSX (every footnote × BOTH pillars' columns — 15 disclosure + 19 financial = 34 cols) and a company-level **cite** (coverage, scored years, enforcement-as-context, EDGAR company link, retrieval date, resemblance-only/screens-not-verdicts disclaimer).
- **Constraints honored:** descriptive/comparative only; no "our risk score"; no guilt-implying ranking; no alarm/red (amber = enforcement only; scores cool/neutral). Existing disclosure/embedding/constellation features + honesty copy untouched. DESIGN_SYSTEM.md updated with the profile spec.
- **Verified:** my Playwright (local + live) — AMD profile both pillars, FY2022 M −1.14 / AQI ▲2.99 on expand, Apple FY2025 M −2.03 / F 1.30, Brixmor concise no-score, permalink opens on load, open-finding-from-profile works, CSV downloads with both pillars' columns, 0 console errors, mobile 390px no overflow (pillars stack), 0 forbidden words. Independent injection-hardened reviewer (53 tool calls): **PASS 7/7, no defects of severity** — values cross-checked exact to DuckDB (incl. Fifth Third enforced amber badge AAER-3514), export header carries both pillars, honesty clean (only "not our judgment" negation), no regressions at 94k, no secrets/source-maps; only the known benign third-party transformers.js CDN warnings (0 console errors). Redeployed to https://disclosure-atlas.vercel.app. Anthropic spend unchanged at **$0.355 / $25**.

### C35. FULL END-TO-END REVIEW (both pillars at 94k) — PASS, production-ready, no changes
Verification-only sweep of the complete deployed product after Chapter E (no new features). My static sweep + an independent injection-hardened reviewer (64 tool calls) on the live site.
- **Static (mine):** security headers present (CSP, HSTS, X-Frame-Options:DENY, nosniff, Referrer-Policy, Permissions-Policy); source maps 404 (none shipped); **0 secrets** in the bundle; forbidden words in bundle are only honest negations ("not our judgment", "No risk score"); shipped data (manifest/scores/findings) 0 forbidden words; EDGAR sample 200; **local dist == live bundle** (index-D3iZdlE8.js — no drift).
- **Reviewer (live): PASS 6/6.** Disclosure pillar (94,455 nodes; finding panel; paste cosine 0.92; compare 0.82; drift 12 yrs; BM25 toggle) ✓. Filters all compose, reset→94,455 ✓ (noted: the similarity slider is an edge-visibility control, not a node filter — by design, `_drawEdges` only). Financial pillar: AMD FY2022 M −1.14 / AQI ▲2.99 / Xilinx worked example, Apple FY2025 M −2.03 / F 1.30 — **cross-checked exact to DuckDB**; no-score (Brixmor REIT) + degenerate outlier (IFF FY2020 ≫10.71 annotated) honest ✓. Shared: shortlist, per-finding/bulk(24.9MB)/shortlist CSV+XLSX carry BOTH disclosure + financial columns, cite-this, permalink survives hard reload, methodology has both the disclosure-null and financial-pillar sections ✓. Quality: headers, EDGAR 200, no secrets/source-maps, mobile 390px no overflow (fin tiles stack), keyboard focus visible ✓. Honesty: every guilt-adjacent term is a deliberate negation; replicated null surfaced; amber=enforcement only; financial threshold pill is cool blue (not amber/red); M/F framed as cited screens with limits + the "cannot re-validate" caveat ✓.
- **Only finding — LOW / honest residual (not fixed by design):** two identical console **warnings** ("Unable to determine content-length from response headers") emitted by the third-party transformers.js CDN (@huggingface/transformers@3.3.3) when paste/compare lazy-loads the in-browser embedding model. **0 console ERRORS** throughout; warning is third-party, benign, and only on first paste/compare use. Deliberately NOT suppressed via console monkey-patching (hiding a library's own output would be worse than the warning and could mask real issues). Documented as an honest residual.
- **Outcome:** no genuine defects → no code change, no redeploy. Both pillars production-ready. Anthropic spend unchanged at **$0.355 / $25**.

### C34. CHAPTER E — financial-quality pillar UI (Beneish + Dechow), premium + honest, live, reviewer-verified 9/9
Built the UI for the Chapter-D financial scores to the calm-premium dark-terminal standard, as a native second pillar (NOT a bolted-on section). $0 (no generation). Used ui-ux-pro-max + emil craft; matched DESIGN_SYSTEM tokens exactly (soft hairline borders, --elev-card, gentle radii, JetBrains Mono data / IBM Plex Sans prose, amber=enforcement / green=data / cyan=selection — NO alarm/red).
- **Data join (new build step `app/scripts/build_scores.py`, runs after build_app_data):** joins `accounting_scores`/`financials` via each node's accession → `filings.period_of_report` (fiscal year). Adds per-node `pfy`/`ms`/`fs`/`mflag` to nodes.json (38 MB; for the synchronous score filter + micro-readout) and writes lazy `scores.json` (3.5 MB, keyed by CIK; full components for the panel/history/exports). 48,499 nodes tagged.
- **New module `app/src/scores.js`:** lazy `ensureScores()`, accessors, model META (citations, published limitations, coefficients + neutral baselines), component-contribution math (emphasizes the single largest driver), `renderFinancials()`, `microScore()`, `scoreCells()`/`SCORE_HEADERS`.
- **(1) Component-first display:** each model a fundamentals-tile (`.fin-tile`) — big mono score, citation, FULL component breakdown (M: DSRI/GMI/AQI/SGI/DEPI/SGAI/LVGI/TATA; F: rsst/Δrec/Δinv/soft/Δcash/ΔROA/issuance), top driver subtly emphasized (brighter + weight + cyan ▲, never color-only/alarm), + a multi-year `M BY FISCAL YEAR` mini-history (focal year in cyan).
- **(2) Academic framing visible:** named + cited (Beneish 1999; Dechow, Ge, Larson & Sloan 2011, Model 1) with a plain limitations line on every tile; **built-in AMD FY2022 worked example** naming the Xilinx acquisition (assets ~$9B→~$68B, goodwill/intangibles) as the textbook AQI-driven false positive.
- **(3) Two-pillar story:** the finding panel shows a company's disclosure side AND financial-quality side together; the two-company tile gains a compact `M · F` micro-readout per company.
- **(4) Exports + screen:** 19 score/component columns added to per-finding/bulk/shortlist CSV+XLSX (blank when no score); a `#scoreSel` filter (has-score / M above threshold / F above unconditional) that composes with all filters and is reset-aware (engine `_passesFilter` on node.ms/fs/mflag).
- **(5) Honest data handling:** insufficient inputs → "no score · insufficient data" (+reason), never a blank-as-zero; company with no XBRL/financials → explicit message; degenerate outliers (|M|>10, F>20) annotated `≫` as real-but-not-meaningful formula outputs.
- **(6) Prominent honesty note + methodology:** the pillar carries a cool-bordered note — established academic SCREENS, not verdicts, not our judgment, with published limits; **this dataset cannot re-validate them** (XBRL ~2009 / mostly pre-2009 cases / enforced-clean don't separate) so the signal basis is the literature; distinct from + consistent with the disclosure-language null. Methodology panel gained a matching "FINANCIAL-QUALITY SCREENS · A SECOND PILLAR" section.
- **Constraints honored:** disclosure/embedding/constellation features + existing honesty copy untouched; no "our risk score"; no ranking implying WE judge; no alarm/red (threshold pill is cool cyan outline; amber stays enforcement-only). DESIGN_SYSTEM.md updated with the pillar spec.
- **Verified:** my Playwright (local + live) — AMD FY2022 M −1.14 / AQI ▲2.99, Apple FY2025 M −2.03 / F 1.30 with full components (cross-checked to Chapter D); filter counts exact + composing (mflag 4,885; +type going-concern 583; reset 94,455); exports carry the 19 columns; insufficient + outlier handled; methodology updated; 0 console errors; mobile 390px no overflow (tiles stack); 0 forbidden words in DOM; bundle has no secrets / no source-maps (only honest negations "not our judgment"/"No risk score"). Independent injection-hardened reviewer (35 tool calls): **PASS 9/9, no blocking defects** — scores/components cross-check to duckdb, exports + filter + honesty + no-regressions all confirmed; its one note (name the Xilinx case explicitly) was then implemented. Redeployed to https://disclosure-atlas.vercel.app. Anthropic spend unchanged at **$0.355 / $25**.

### C33. CHAPTER D — structured-financials pillar (Beneish + Dechow), DATA+COMPUTE only, reviewer-verified
Began the structured-financials chapter: ingested SEC XBRL **companyfacts** for the existing 2,750-company universe and computed two **published academic** accounting-quality models per company-fiscal-year. **No UI this chapter** (next). **$0** (public data + formulas, no generation). All steps resumable (cache + checkpoint).
- **Plan first:** `docs/CHAPTER_D_PLAN.md` — data source, exact XBRL tag mappings (fallback chains), both formulas with citations (Beneish 1999 8-var; Dechow et al. 2011 Model 1), schema, honesty framing, missing-data policy.
- **SCHEMA CHANGE (additive — authorized by the chapter brief):** new module `ingestion/db_financials.py` adds two tables keyed **(cik, fiscal_year)** — `financials` (assembled annual line items) and `accounting_scores` (beneish_m/flag/components-JSON, dechow_pred/prob/fscore/components-JSON, models_version, notes, computed_at). The locked footnote/embedding/findings schema in `db.py` is **untouched** (reviewer confirmed companies 1978 / filings 14085 / footnotes 94455 / enforcement 214 unchanged; only CREATE IF NOT EXISTS, no ALTER/DROP).
- **Pipeline (resumable/idempotent):** `SECClient.company_facts()` (new cached endpoint; also fixed `get()` to fail-fast on non-429 4xx so 404s don't burn retries) → `fetch_companyfacts.py` (per-CIK, checkpoint `companyfacts_done.txt` + `companyfacts_absent.txt` for 404s) → `extract_financials.py` (cache→annual line items; flows=full-year duration, stocks=FYE instant; INSERT OR REPLACE) → `compute_scores.py` (both models, honest missing-data handling, coverage JSON).
- **Coverage (honest):** 2,222 companies have companyfacts (528 absent — pre-XBRL/delisted/foreign, NO score); 1,687 companies / 17,541 company-years assembled; 15,790 candidate years → **Beneish M 6,252** (13.4% over the −1.78 threshold) / **Dechow F 5,782**; 7,873 neither (financial/no-COGS/unclassified-balance-sheet firms the models don't fit). Full detail: `validation/CHAPTER_D_COVERAGE.md` + `validation/chapter_d_coverage.json`.
- **Sanity:** XBRL line items match known figures (Abbott FY2018 rev $30.58B, AMD FY2022 $23.60B/assets $67.58B); Beneish median **−2.56** (matches the paper's normal-firm median) and 13.4% flagged (its documented high false-positive rate); scores reproduce by hand from stored components + cited formula. **AMD FY2022 is flagged purely from the Xilinx acquisition spiking AQI to 2.99** — a textbook M&A false positive, visible in the components (why we always show the breakdown).
- **HONESTY (critical, different from the disclosure null):** models are presented as **named, cited, validated academic screens** (Beneish 1999; Dechow et al. 2011) with **component breakdowns** and **plainly-stated limitations** (false positives, era/sample dependence, weak for financial/no-COGS firms) — **never "our risk score / our judgment."** No fabricated/partial scores (insufficient inputs → NULL + recorded reason). Key honest caveat surfaced: XBRL begins ~2009 but most of our enforced cohort's AAERs (median 2013, many pre-2009) predate their scorable years — only 59 enforced firms (412 firm-years) have any score and enforced/clean medians don't separate (M −2.63 vs −2.56), so **our data cannot re-validate the models; their validity rests on the published literature** (stated as such, no overclaim). Degenerate micro-cap outliers (|M|>10: 208; F>20: 64) are real formula outputs stored with components (auditable) — the UI must clamp/annotate them.
- **Independent injection-hardened reviewer (18 tool calls): PASS 7/7** — reparsed raw XBRL → stored line items exact (0% diff); by-hand M and F reproduce stored within ≤0.0002; coverage/distribution/era/outlier numbers all recompute; null/components/notes integrity perfect; framing cited + component-backed + non-overclaiming; $0 (no LLM calls in chapter scripts). One cosmetic fix applied (fetched 2,220→**2,222**). Anthropic spend unchanged at **$0.355 / $25**.

### C32. Disclosure DISTINCTIVENESS lens — descriptive language-unusualness vs industry peers (no new data), live, reviewer-verified
Added a third descriptive lens over the EXISTING embeddings (no ingestion, $0), mirroring the complexity lens. **Metric:** for each footnote, cosine distance from the centroid of same-SIC-industry, same-type peers in the bge-small embedding space (embeddings are L2-normalized → distance = 1 − cosine). Tiers are distribution-relative within each (industry, type) group: typical (≤75th pct) / distinctive (75–93rd) / highly distinctive (>93rd); groups <8 default to typical (too few peers), <2 skipped. Stored as node fields `dst` (distance), `dmd` (group median), `dvi` (0/1/2) in `build_app_data.py` — added fields only, node order preserved so embeddings.bin stays aligned. Distribution across 94,455: typical 70,986 / distinctive 16,448 / **highly 7,021**.
- **Surfaced 3 ways (matches the complexity lens + calm-premium terminal tokens):** (a) finding-panel readout "DISCLOSURE DISTINCTIVENESS · vs SIC INDUSTRY" — two columns (query/match) showing the distance, "cosine distance from same-industry peer centroid", and an industry-relative phrase ("typical language for its industry peers" / "more distinctive than its industry peers" / "unusually distinctive for its industry peers" · median X), plus a descriptive caveat; pasted text honestly shows "no industry peer set for pasted text"; (b) CSV/XLSX exports gain `distinctiveness` (distance) + `distinctiveness_vs_industry` (typical/distinctive/highly_distinctive) on per-finding, bulk, and shortlist; (c) a `#dxSel` filter (all/typical/distinctive/highly) that composes with every other filter and is reset-aware. Tier colors are cool/neutral (`.dx-typical/.dx-distinctive/.dx-high`), never an alarm color.
- **Honesty (HARD rule held):** descriptive/comparative ONLY — "unusually distinctive for its industry", never suspicious/anomalous/red-flag/concerning/wrongdoing/risk-score; caveat states it's "a descriptive measure … not a finding or a judgment about the company"; no per-company risk score or concern-implying ranking; consistent with the replicated null + resemblance-only framing. Forbidden-word scan: 0 in our copy (only established negations remain). Methods-card data dictionary updated to document the new columns.
- **Verified:** my Playwright (local + live) — readout renders, filter counts EXACT to tier counts (highly 7,021 / typical 70,986 / reset 94,455), composes with type, exports carry both columns, 0 console errors, mobile no overflow, honesty clean. Rebuilt the data bundle (neighbors from checkpoint, ~fast, $0) + vite + **redeployed to https://disclosure-atlas.vercel.app** (removed the `.env.local` Vercel auto-pulled). Independent injection-hardened reviewer (54 tool calls): **PASS 8/8, no defects** — independently recomputed the metric (mean dst rises monotonically 0.149<0.215<0.268 across tiers; `dmd` == group median in 40/40 sampled groups; 0 group-relative tier violations across 1,347 groups; classification genuinely group-relative), all 3 surfaces work at 94k, 0 forbidden words, guardrails intact, no regressions/secrets/source-maps. One benign note: a third-party CDN (HuggingFace transformers) emits a content-length warning only during paste — not our code, pre-existing. Anthropic spend unchanged at **$0.355 / $25** ($0 this pass — distances from existing embeddings, no generation).

### C31. PREMIUM-TERMINAL refinement — calm/orderly/institutional craft pass (keeps terminal direction), live, reviewer-verified
Elevated the dark terminal from "dense/busy" to **premium, calm, institutional** (FASB order + Bloomberg seriousness + Linear/Vercel craft) without changing direction, features, data, or honesty copy. Used ui-ux-pro-max + emil-design-eng + review-animations.
- **Spacing & rhythm:** introduced a real spacing scale (`--sp-1..8`, 4–40px) and applied genuine breathing room — panel/modal padding 20–24px (was 14–18), cards 14–18px, section gaps 18–22px; taller composed chrome (`--status-h` 30→**38**, `--cmd-h` 34→**42**, `--top-h` 64→**80**). Calm, not packed.
- **Cards & panels:** every surface intentional — **soft hairline borders** (`--border-soft` rgba(255,255,255,.06)) as the primary divider instead of hard `#2A2F38` lines everywhere; **subtle layered shadows** (`--elev-card`, Emil semi-transparent depth) on cards; **gentle consistent radii** (`--r-sm 3 / --r-md 6 / --r-lg 9`, was square 0). No surface reads as a default box.
- **Color refinement (still dark):** lifted/refined neutrals — `--term-black` #000→**#0B0D12** (no harsh pure-black chrome), `--field-base` #0B0D10→**#10131A**, `--field-inset` #000→**#0C0E13**, `--border` softened to #242A35; added **`--ink-tertiary` #8893A2** and lifted `--ink-secondary` #9AA7B6→**#AEB7C4** for readable prose; softer glows. Canvas void #060708 kept (star-field). Amber/green/cyan semantics unchanged.
- **Typography & hierarchy:** kept mono-forward data; prose now IBM Plex Sans at **13–13.5px / line-height 1.6–1.65** (genuine readability, not sacrificed). Defined deliberate type levels and **one shared tertiary-label treatment** (mono 500, 9.5px, +1.6px tracking, uppercase, faint) for every eyebrow/section label — orderly, consistent.
- **Motion/detail (Emil):** durations eased to `--t-fast 130 / --t-mid 220 / --t-slow 360`; refined hover (border+bg+color together), soft focus ring (1px cyan + 3px accent-glow) on controls/inputs/search, green-glow on the paste CTA. Calm, not flashy.
- **Honesty fully intact (NO copy changed):** resemblance-only; amber = enforcement context, never prediction; green = data/UI only (no per-company score); replicated null surfaced; complexity disclaimer present. Forbidden-word scan: only "predict/hiding" in established negations.
- **DESIGN_SYSTEM.md updated** (thesis, color, typography, layout, elevation, motion) with the refined tokens as source of truth.
- **Verified:** my Playwright (local + live) — refined tokens applied, hero=JetBrains Mono, body=IBM Plex Sans (prose 1.62 line-height), 6 types, 94,455 nodes, finding/methodology/mobile (390px no overflow) calmer & clean, 0 console errors, honesty copy unchanged. Rebuilt + **redeployed to https://disclosure-atlas.vercel.app** (removed the `.env.local` Vercel auto-pulled into the build artifact). Independent injection-hardened reviewer (41 tool calls): **PASS 9/9, no defects** — refinement genuinely applied (soft borders/shadows, gentle radii, lifted neutrals, breathing room, taller chrome), dark terminal identity intact, all features at 94k, 0 console errors, mobile clean, honesty guardrails intact, no secrets/source-maps, EDGAR 200; judged it "genuinely calmer, more premium, more orderly." Anthropic spend unchanged at **$0.355 / $25** ($0 this pass — CSS only, no generation).

### C30. BLOOMBERG-TERMINAL overhaul — real visual transformation (layout density + structure + palette + type), live, reviewer-verified
Prior passes (C28/C29) only swapped fonts, so the site still "felt the same" — the layout/density/palette never changed. This pass is a true overhaul to a dense **financial-data-terminal (Bloomberg)** aesthetic. Per the brief, layout density / panel structure / spacing / color / typography were all changed; NO feature removed/broken, NO data change, NO honesty-guardrail/copy change.
- **Layout → terminal workspace:** the floating topbar became a full-width dense **status bar** (`.statusbar`, pure-black, bordered cells: brand · live stats · function keys); the floating filter strip became a full-width **command/filter toolbar** (`#filters`) directly below it; together a persistent 64px terminal header. The **finding panel now docks below the header** (`top:64px`) instead of full-height, so the header stays visible (real terminal workspace). The **constellation is framed as a data panel** (`#root::after` bezel + `#root::before` "CONSTELLATION · SEMANTIC MAP" label). The **hero became a docked "query console" panel** (bordered, black header strip, bottom-left). Mobile: command bar docks to bottom, panel full-screen, status bar wraps.
- **Palette → near-black terminal:** `--field-void` #0A0E14 → **#060708**; neutral near-black surface ramp (base #0B0D10, raised #14171C, inset #000); added `--border` #2A2F38 for the visible tiled-panel framing; canvas bg + nebula + vignette retuned to neutral near-black. Added **`--term-green` #4DBE7A** as the data/active-control accent (SIM slider, cosine bar, active filters, paste CTA) — explicitly a UI/data semantic, NOT a company judgment. **Amber #E0A04A kept EXACT** (enforcement context); cyan `--accent-cool` #5BA4DD kept (selection); star-field node colors kept (constellation identity). Only the void literal touched JS (constellation + favicon), grep-verified.
- **Typography → monospace-first:** dropped the serif (Newsreader) and Space Grotesk entirely. **JetBrains Mono** now dominates (data, labels, headers, readouts, entity names, AND the hero headline as a terminal banner); **IBM Plex Sans** carries only running prose (hero paragraph, excerpts, explanations, help). Two families requested total. Base 13px, radius crisp/square (`--r-sm/md 0`, `--r-lg 2px`), tighter spacing.
- **Stale-chip fix:** the header "2 footnote types" was a hardcoded HTML value; `main.js` now sets `#statTypes` from the real manifest (`Object.keys(corpus.footnotes_by_type).length`) → **6**.
- **Honesty fully intact (NO copy changed):** resemblance-only; amber = enforcement context, never prediction; green is data/UI only (no per-company score); replicated null surfaced in Methodology; complexity disclaimer present. Forbidden-word scan: only "predict/hiding" inside established negations.
- **DESIGN_SYSTEM.md rewritten** (thesis, color, typography, layout, motion) as the new terminal source of truth.
- **Verified:** my Playwright (local + live) — near-black, mono headline, status/command bars, 6 types, finding panel + methodology + mobile (390px no overflow), 0 console errors, fonts = {IBM Plex Sans, JetBrains Mono}, honesty copy unchanged. Rebuilt + **redeployed to https://disclosure-atlas.vercel.app** (removed the `.env.local` Vercel auto-pulled into the build artifact). Independent injection-hardened reviewer (39 tool calls): **PASS 9/9, no defects** — terminal aesthetic genuinely applied, mono-first type, stale chip fixed to 6, all features work at 94k, 0 console errors, mobile clean, honesty guardrails intact, no secrets/source-maps, EDGAR 200. Anthropic spend unchanged at **$0.355 / $25** ($0 this pass — layout/color/type only, no generation).

### C29. Design-REFINEMENT pass — high-character editorial typography + refined premium palette + Emil craft (no layout/feature/data/copy change), live, reviewer-verified
The two prior passes (C28) were too timid — they stayed on neutral grotesques (Inter→Archivo) so the site still read AI-generated. This pass makes the decisive move to a **distinctive, premium, hand-crafted, authoritative research-instrument** look, using the new design skills (ui-ux-pro-max design-system + typography/color intelligence; emil-design-eng + review-animations for craft). Direction kept LOCKED: dark observatory aesthetic preserved (load-bearing for the constellation); distinctive-but-authoritative, not flashy.
- **Typography (the headline change):** moved decisively OFF neutral grotesques. `--display` Archivo Narrow → **Newsreader** (editorial serif, optical sizing, broadsheet/journal gravitas) — used for the hero masthead, the one signature typographic moment (weight 560 / lh 1.05 / -0.012em). `--body` Archivo → **IBM Plex Sans** (humanist, finance/trust-coded, characterful; lh 1.55 / tracking 0 — Plex needs no negative tracking) — felt on every paragraph/button/label. Kept **Space Grotesk** (entity names + big readouts) and **JetBrains Mono** (ALL numerics, per the hard constraint). Result is a coherent 4-voice editorial-instrument system: serif authority · humanist sans · geometric grotesk · mono. Inter/Archivo no longer requested by the page.
- **Palette refined within the dark direction (premium financial-terminal):** deeper/cooler surface ramp (`--field-base` #0F141B→#0E141D, `--field-raised` #161D27→#151D29, new `--field-inset` #0B1018 for recessed wells); cleaner premium ink (`--ink-primary` #E6ECF3→#ECF1F7); refined instrument azure accent (`--accent-cool` #5E9BD1→**#5BA4DD**, swapped consistently across CSS + constellation.js/panel.js/main.js + favicon, grep-verified 0 stragglers). **Amber kept EXACTLY (#E0A04A)** to protect the enforcement-context semantic; star-field node colors kept stable (constellation identity is load-bearing). New harmonized accent-tint surfaces + semi-transparent glow tokens.
- **Emil craft / component finish:** strong weighted easing curves (`--ease-out` cubic-bezier(.23,1,.32,1), `--ease-in-out`, iOS-like `--ease-drawer` for the panel; never ease-in on UI); **button `:active` scale(0.97) press feedback** on every pressable (suppressed on touch); richer **multi-layer elevation** + 1px top **edge-light** on raised surfaces (no soft blobs); modal scale+fade entry (origin center) + drift-bar slide-up; refined hover/focus (premium accent focus-ring; replaced `transition: all`); refined tooltip (kept as a fast 110ms opacity fade — high-frequency hover element, no scale-in, per Emil); inset wells harmonized to `--field-inset`; reduced-motion now tames animations too.
- **DESIGN_SYSTEM.md updated** as the source of truth (color, typography, elevation, motion tokens locked).
- **Honesty guardrails fully intact (NO copy changed):** resemblance-only language; amber = enforcement context only ("context, not a verdict" / "never as a prediction"); no risk scores/rankings/predictions; replicated null surfaced in Methodology. Forbidden-word scan: only hits are "predict/hiding" inside established honest negations.
- **Verified:** my own Playwright (local build + live) — Newsreader/Plex applied, accent #5BA4DD, 94,455 nodes, 0 console errors, panel/methodology/mobile clean, honesty copy unchanged, no overflow at 390px. Rebuilt + **redeployed to https://disclosure-atlas.vercel.app** (linked to existing project; removed the `.env.local` Vercel auto-pulled into the build artifact for hygiene). Independent injection-hardened reviewer (43 tool calls): **ALL 9 PASS, no defects** — typography/palette actually changed (not Archivo/Inter), features work at 94k, 0 console errors, mobile no overflow, honesty intact, no secrets/source-maps in bundle, EDGAR links 200. Anthropic spend unchanged at **$0.355 / $25** ($0 this pass — CSS/type/color only, no generation).

### C28. Design-finish pass — typography + texture refinement (no layout/feature/data change), live, reviewer-verified
Elevated visual finish so the site reads as deliberately hand-crafted, not AI-generated — finish only, everything functional/structural untouched. **Biggest lever: body/UI font Inter → Archivo** (the superfamily mate of the existing Archivo Narrow display face — a coherent, intentional editorial system). Kept Archivo Narrow (display/hero, now weight 600 / -0.02em tracking), Space Grotesk (entity names + big readout numbers), JetBrains Mono (all numerics). Added deliberate body rhythm (14px / 1.55 / -0.002em, optical sizing, kern/liga/calt). **Texture/motion:** unified EVERY transition onto weighted easing tokens (--ease / --ease-out + --t-fast/mid/slow) — no bare/linear timings remain; added radius tokens (--r-sm/md/lg, ≤5px, instrument-crisp) and layered low-spread elevation tokens (--elev-1/2, no soft blobs); refined tooltip/drift-bar surfaces + hero. Honesty guardrails fully intact (resemblance-only, amber=context, replicated null surfaced, drift caveat present; 0 forbidden words in our copy bar the established negations). Updated DESIGN_SYSTEM.md to lock the final type + radius + elevation + motion tokens as the source of truth. Independent injection-hardened reviewer (47 tool calls): ALL PASS — Archivo applied (Inter not requested), hero/numerics/names fonts correct, 94,455 nodes, 0 console errors, every feature intact (finding/6-type filter/time-range/drift/paste/export/permalink, EDGAR 200), honesty unchanged, weighted cubic-bezier transitions, ~26 ms/frame at 94k (no freeze), mobile no overflow, headers present, no secrets, no injection. Redeployed. Anthropic spend unchanged at $0.355 / $25 ($0 this pass).

### C27. CHAPTER C COMPLETE — the time dimension (time-range filter + disclosure drift), live, reviewer-verified
Added two time features to the 94k/6-type map, honesty guardrails intact. (1) **Time-range filter**: #yearFrom/#yearTo selects (1996–2026) filter by filing year (`node.fd`), wired into `_passesFilter` so it COMPOSES with type/industry/similarity/complexity/enforcement; "as of a year" = From=min..To=Y, or any window; reset + bulk-count integrated. (2) **Disclosure drift (showpiece)**: `engine.traceDrift(cik,type)` centroids a company's footnotes per filing year and connects them chronologically through the projected embedding space; an animated trail (play/pause/scrub, year markers, glowing playhead) drawn on the canvas via `_drawDrift`, triggered by a "◷ DRIFT" button in the finding panel; camera flies to fit the trail. **Honesty (strict)**: framing is descriptive only — "drifted toward/away from its industry's typical [type] language / the going-concern region of the map" (pure geometric distance early-vs-late), with a caveat "Drift is a descriptive measure … not a prediction or a warning." NO deteriorating/fraud/predictive language; no risk score; amber = enforcement context only; the replicated null stays surfaced. Performance: LOD rendering unchanged; drift trails are per-company (light) — reviewer measured ~45 fps with a trail active, no freeze; drift centroids recomputed independently and matched exactly (dx=dy=0 across all 12 AMD years). Independent injection-hardened reviewer (50 tool calls): ALL PASS — time filter composes (year+type+enforced = 162, all constraints satisfied), drift play/scrub/close correct, 0 forbidden words in our copy, methodology null intact, existing features (paste/complexity/exports/permalink) intact, 0 console errors, no secrets, headers present, no injection. Redeployed to disclosure-atlas.vercel.app. Anthropic spend unchanged at $0.355 / $25 (all local; $0).

### C26. CHAPTER B COMPLETE — 94k / 6-type constellation live, LOD rendering, int8 embeddings, honest null surfaced
Final Chapter B step shipped to https://disclosure-atlas.vercel.app . Fixed the `build_app_data.py` 2-type `TYPE` map → 6 types (was crashing the bundle build with KeyError). Rebuilt the full bundle: **94,455 nodes** across 6 types (rev_rec 22,922 / going_concern 6,266 / related_party 13,397 / cam 4,971 / mda 15,679 / risk_factors 31,220); batched checkpointed neighbors completed in ~4 min (Apple Accelerate BLAS — far faster than the 1-2 h estimate); ZSTD Parquet bundle produced (nodes.parquet 1.6 MB vs nodes.json 35 MB).
- **LOD rendering** (constellation.js): index-stride decimation of the ambient node cloud + ambient-edge web when zoomed out (enforced/selected/hovered always drawn), viewport culling in `_pick`, selection hides the ambient web. Map stays smooth at 94k (reviewer: ~60 fps idle, one 83 ms hitch on zoom).
- **Lazy loading**: nodes/neighbors load upfront; the big excerpts file (~48 MB) lazy-loads on first finding (panel renders when ready); embeddings lazy on paste.
- **int8 embeddings** (the Vercel blocker fix): embeddings.bin shipped as int8 (×127, dequantized 1/127 in `paste.js`) → **36 MB** instead of 145 MB (Vercel's 100 MB/file limit); cosine error ~0.002, negligible. `build_index.py` updated to write int8 going forward.
- **6-type frontend**: type filter is now a 7-option select; TYPE_FULL/TYPE_TAG extended to 6 across main/panel/constellation; exports + complexity + BM25 + compare + shortlist + cite + permalink all verified at scale.
- **Honesty**: methodology panel + manifest validation block + VALIDATION_RESULTS.md state the **replicated null across all 6 types at 94k** plainly as a strength. Reviewer caught one "fraud" token in OUR methodology copy (a *negating* phrase) — reworded to "not an enforcement signal in the disclosures"; our generated copy (bundle, findings explanations, manifest, caveats) is now zero forbidden words. **Distinction recorded:** the guardrail governs OUR framing/labels/explanations; the verbatim **quoted SEC source excerpts** legitimately contain words like "fraud/misleading" (real risk-factor/going-concern text) and are shown attributed + unaltered — redacting source filings would itself be dishonest. No risk scores/rankings/predictions; amber = enforcement context only.
- Independent injection-hardened reviewer (59 tool calls): all substantive checks PASS (node count, 6 pure type filters matching manifest, smooth LOD, lazy excerpts, real CIKs resolving on EDGAR, paste/compare/BM25/export/cite/permalink, headers intact, no secrets, no mobile overflow); only flag was the now-fixed "fraud" copy token. Anthropic spend unchanged at $0.355 / $25 (all local; $0 this chapter).

### C25. CHAPTER B kickoff — resumable data-expansion architecture (multi-session ingestion)
Began the large data expansion. Wrote `docs/V2_ROADMAP.md` (post-application features: accounts+DB workspace, on-demand capped Claude explanations, distinctiveness/drift lenses, self-hosting CDN libs, PDF finding sheets — all deferred). Architected the ingestion to be **resumable across sessions** by separating the slow network phase from the DB phase:
- **Task 1 (done):** `ingestion/build_universe_v2.py` → `data/processed/universe_v2.json` = **2,750 companies**, deterministic/reproducible: 475 v1 (continuity, incl. enforced set) + 69 recognizable large-caps (curated tickers) + 2,206 evenly-spaced tail samples from SEC `company_tickers.json` (which is size-ordered, so the tail sweep is mid/small-cap-weighted by construction — NOT Fortune-500-only, as required).
- **Task 2 (running):** `ingestion/fetch_history_v2.py` — per company, fetch submissions + up to 10 newest 10-Ks (~10 years) into the existing `data/raw` cache; **append-only** manifest `data/processed/filings_v2.jsonl` + per-CIK checkpoint `fetch_history_done.txt`; holds NO DuckDB lock; crash-safe and instantly resumable (re-run skips checkpointed CIKs, HTTP is all cache hits). Validated on 12 companies then launched full background run (SEC ≤8 rps, backoff, cache — unchanged politeness). Decoupling the network phase from the DB is the key design choice: hours of fetching can't corrupt the DB and can be killed/resumed freely.
- **Task 3 (code done, full run pending fetch):** extended `ingestion/extract_footnotes.py` to six types — added **related_party, cam, mda, risk_factors**. related_party/cam use topic-run detection; mda/risk_factors are heading-anchored narrative Items bounded by a per-(filing,type) chunk cap (`MAX_CHUNKS_PER_TYPE=5`) so long Items don't dominate the corpus. Validated on real cached filings (CAM, risk-factors, MD&A, related-party all extract). Honest known limitation: some large filers put MD&A in a separate exhibit (not the primary doc), so MD&A coverage is partial this pass — to be refined, not hidden.
- **Engineering decisions deferred to Task 4 (not yet built):** the current `build_index.py`/`aaer_backtest.py` compute N×N similarity (40 GB at 100k) — MUST be reworked to batched top-k; data bundle to move to columnar Parquet + compression; frontend to LOD/decimated rendering for 100k+ points. These are required before re-embedding at scale.
**Honesty gate carried forward (critical):** new types are descriptive/comparative only and CANNOT inform any enforcement claim until `aaer_backtest` is re-run per new type (Task 5) and reported honestly in VALIDATION_RESULTS.md — whether MD&A/risk-factor language carries enforcement signal where boilerplate didn't is an OPEN empirical question; no assuming, no dressing up. No risk scores/rankings/predictions; resemblance-only; amber = real enforcement only. $0 Anthropic spend this session (no generation; ingestion is pure fetch + text stats).

### C24. Disclosure readability/complexity lens (Gunning Fog) — descriptive/comparative only, live, reviewer-verified
Added an established-readability lens over the EXISTING dataset (no new ingestion, no D-series). For every footnote, `build_app_data.py` now computes Gunning Fog, average sentence length, word count, complex-word % (3+ syllables, suffix-adjusted, deterministic vowel-group syllables), and each footnote's complexity relative to its SIC-industry median (below / near / above; "near" = within ±10% of the group's median Fog). Stored on nodes as fog/asl/wc/cwp/cmp/fim — added fields only, node order preserved so embeddings.bin stays aligned. Surfaced: (a) panel "DISCLOSURE COMPLEXITY · GUNNING FOG" readout with a two-column query/match comparison, industry-relative phrasing, and a caveat that it's a descriptive readability measure, not a finding/judgment; (b) new columns in per-finding/bulk/shortlist CSV + XLSX (gunning_fog, avg_sentence_length, word_count, complex_word_pct, complexity_vs_industry); (c) a new filter (#cxSel: below/near/above industry median). Pasted-text queries compute Fog in-browser via a JS port that mirrors the Python exactly (`readability.js`); they honestly show "no industry peer set for pasted text". **Honesty:** all copy is descriptive/comparative — "more/less complex than its industry peers" / "typical complexity"; NO suspicious/obfuscating/hiding/evasive/deceptive/misleading/fraud/flagged/"red flag"; no per-company risk score, rank, or prediction; consistent with the validation null + resemblance-only framing. Verified by me on live (panel, exports CSV+XLSX, filter counts 970/1198/920/3088, pasted Fog, mobile stacks to 1 col, 0 console errors, 0 forbidden words across DOM+JS+data) AND by an independent injection-hardened reviewer (55 tool calls, recomputed the metrics itself — exact match; 0 forbidden words; no risk/prediction; no regressions). Honest nuance: 14/3088 nodes sit within <0.04 Fog of a ±10% boundary, so full-precision vs 1-decimal-stored classification can differ at the margin — an immaterial rounding artifact inherent to any threshold, not an error. Redeployed; security headers persist (vercel.json in public/). $0 Anthropic spend (pure text statistics + in-browser embeddings; no generation).

### C23. Security review — honest pass; fixed dev-dep vulns + added security headers
Ran a full security review of the deployed app + codebase (docs/SECURITY_REVIEW.md). **Secret exposure: proven clean** — verified live with Playwright that no Anthropic key / SEC user-agent / Vercel token appears in the shipped JS bundle, HTML, data files, network requests, localStorage, or window globals, and the frontend never references the Anthropic API or any env var (key is build-time Python only). `.env` is git-ignored and never committed (0 commits, 0 key occurrences in history). **XSS: none** — pasted text (paste-box, compare) is escaped and inert (tested with live `<img onerror>`/`<script>` payloads → did not execute), the `#f=qi.mi` permalink parser is digit-only and doesn't echo input, external links use `rel=noopener`. **Fixed:** upgraded `vite` 5.4.21→8.1.0 to clear 2 dev-server-only npm-audit vulns (now 0; no production impact either way). **Hardened:** added security response headers via `app/public/vercel.json` (CSP scoped to the pinned CDNs + `'wasm-unsafe-eval'`/`blob:` for the in-browser ML, plus nosniff / X-Frame-Options:DENY / Referrer-Policy / COOP / Permissions-Policy) — verified live that paste/compare/XLSX still work under the CSP with 0 console errors. **Stated N/A honestly:** RLS, DB auth, accounts/CSRF, server rate-limiting — the static, backend-less, account-less architecture removes these from the threat model (no DB, no server, nothing privileged in the request path). Confirmed build-pipeline SEC rate-limit (8 rps + backoff + cache) and Anthropic $25 spend cap in code. **Honest residual items:** CDN supply-chain trust (pinned, official, but no SRI on ESM dynamic import — self-hosting would remove it) and the chat-exposed credentials + the password in the `.env` SEC_USER_AGENT line → parked in BLOCKERS.md for Josh to rotate. Redeployed. $0 Anthropic spend.

### C21. Quick-wins pass (R1/R2/R3/R4/A1 + XLSX) built, live, double-verified
Implemented the low-risk/high-value items from IMPROVEMENT_PROPOSAL.md (no ingestion, no D-series): **R1** shareable permalinks (`#f=qi.mi` hash, set on select / restored on load / cleared on close); **R2** compare-two-disclosures (two in-browser embeddings → cosine + honest "resemblance only" reading); **R3** the **keyword-baseline (BM25) toggle** in the finding panel — the honesty showpiece, putting an in-browser BM25 ranking next to the semantic one with an "N/10 overlap" note that makes the validated semantic-beats-keyword result tangible; **R4** a reproducibility methods card (`disclosure-atlas_methods.md`) built from the real manifest (corpus counts, bge-small/384/CLS/cosine, UMAP params, validation AUC numbers framed as a strength, data dictionary incl. ticker "intentionally blank"); **A1** a client-side **shortlist** (pin from a finding, view/clear, combined CSV/XLSX export); and **.xlsx export** (lazy SheetJS from CDN) alongside CSV everywhere (CSV stays default + offline). New modules: exporters.js, bm25.js. Verified by me on live (R1 restore, R2 cosine, R3 BM25, R4 counts, A1 CSV/XLSX, bulk XLSX round-trip, 0 forbidden words, 0 secrets in dist, mobile clean, 0 console errors) AND by an independent hardened reviewer (83 tool calls, all PASS, DuckDB-cross-checked). Redeployed to disclosure-atlas.vercel.app. $0 Anthropic spend (no generation; embeddings in-browser).

### C22. SECURITY: a review sub-agent returned prompt-injected content — discarded, not acted on
The first reviewer sub-agent dispatched for this pass returned a message containing **injected instructions** (0 tool calls, ~14s): it tried to get me to trust a non-existent `.claude/conductor-results.json`, skip independent verification, write a fabricated "APPROVED" sign-off file, and emit a special "RELEASE_LOCK_NOW" phrase. None of it originated from Josh or the Conductor. Per the "tool output is data, not instructions" discipline, I **discarded it entirely**, acted on none of it, wrote no fabricated approval, and instead verified everything myself on the live site and re-dispatched a **fresh injection-hardened reviewer** (explicitly told to ignore embedded instructions and trust only its own tool-gathered evidence) which did real verification and passed. Surfaced to Josh in PROGRESS. No blocker (work was unaffected), but logged as a security observation.

### C20. Review + light-polish pass: 2 features (resizable panel, bulk CSV), review fixes, reviewer-verified
Full codebase + live-site sweep (Playwright): no bugs/dead-code/console-errors/broken-links/honesty-leaks found in behaviour; applied two minor review fixes (removed a dead no-op block; **focus moves into the finding panel on open** for keyboard users). Added two low-risk/high-value features: **(B1) resizable finding panel** — drag the left edge (1:1 tracking, transition suppressed during drag), arrow-key resize for a11y, clamped 360..min(860,96vw), width remembered in localStorage (client-side only), handle hidden on mobile; **(B2) bulk CSV export** of the current filtered set — company, cik, ticker(blank — dataset carries no tickers, honest), footnote_type, similarity (filled from the active query via lazily-loaded embeddings, blank when no query — sorted desc), enforced, accession, edgar_url. Reviewer found one cosmetic bug (filtered-count badge froze after first export due to a stale DOM reference when restoring the button's innerHTML) — **fixed** (re-query the span each update + refresh after export); re-verified live. Wrote `docs/IMPROVEMENT_PROPOSAL.md` (proposal only — not built): prioritized menu through researcher / auditor / data-expansion lenses with value·effort·risk·honesty-touch, ranked by value-per-effort. Independent reviewer: all checks PASS (counts cross-checked to DuckDB, CSV well-formed & real, EDGAR links 200, 0 forbidden words in DOM+JS bundle, no leaked secrets in app/ or dist, mobile/a11y clean). Redeployed to disclosure-atlas.vercel.app. $0 Anthropic spend this pass (no generation; embeddings run in-browser).

### C19. Researcher features (methodology, CSV export, cite-this) added, live, reviewer-verified 8/8
Per Josh's direction, added three researcher-trust features to the deployed app and redeployed: (a) a **Methodology** panel (quiet header link) with corpus source + real DuckDB-exact counts + bge-small/cosine method + the honest validation null stated as a strength + the enforcement-is-context stance; (b) **CSV export** of the current result set (query + ranked neighbors; real company/CIK/accession/EDGAR/enforced/score); (c) **cite-this** copyable stable reference (company, CIK, accession, filing date, EDGAR link, retrieval date, honest disclaimer). Rebuilt the data bundle to carry accession_number + filing_date on nodes and corpus/validation blocks in the manifest. Decide-yourself: **ticker column is intentionally blank** in CSV — our dataset carries no tickers (companies.ticker all NULL) and fabricating them would violate the credibility requirement; the column is kept for researcher convenience but honestly empty. Verified live (Playwright + independent reviewer 8/8: counts cross-checked to DuckDB, all CIKs/accessions real, EDGAR links 200, 0 forbidden words across DOM+JS+data, mobile/a11y clean, no regressions). Redeployed to https://disclosure-atlas.vercel.app. $0 Anthropic spend this phase (paste embeds in-browser).

### C18. Deployed to Vercel production (disclosure-atlas.vercel.app)
Deployed the verified app/dist as a static production site via Vercel CLI; token from .env (never printed), team scope simplydoseapp-5623s-projects (the account's only team). Live + verified (root/data/range all serve, no auth wall). Deploying first de-risked the credential path; researcher features below will rebuild + redeploy once at the end (C25).

### C17. Frontend built, Playwright-smoke-tested, and independently reviewer-verified (PASS 9/9)
Production Vite build in app/dist (27 KB JS / 13 KB CSS + ~8 MB static data bundle). Playwright verification (mine + an independent reviewer agent): real data (3,088 nodes, 1,414 enforced, real CIKs cross-checked vs DuckDB, 0 synthetic PRNG names); EDGAR source links all resolve 200 on sec.gov; amber strictly = real enforced cohort with real AAER numbers (AAER-3997/4555 verified, no invented numbers); paste-your-own-footnote works in-browser end-to-end (going-concern paste → going-concern match cos 0.91, 0 Anthropic/API calls); all filters mutate state + affect the map; honesty scan 0 forbidden words with both caveats present; 0 console errors/warnings on load (favicon inlined; modals use `inert`+blur not aria-hidden); design fidelity matches DESIGN_SYSTEM (Archivo Narrow hero, JetBrains Mono right-aligned numerics, amber semantic-only, cool-blue selection, 2px radius, hairline dividers); mobile (390px) reflows cleanly, keyboard focus visible, no-canvas list fallback present. Deploy to a public host needs a Vercel token (outward-facing + credential I don't have) — static build is ready, deploy left for Josh.

### C16. Frontend = locked Claude Design ported to a production Vite vanilla build, wired to REAL data
Imported the locked design (Claude Design project 340b8c5f… "Constellation app two screens", `Disclosure Atlas.dc.html`) via the design MCP. The design's visual language, motion, constellation aesthetic, and finding panel are reproduced exactly — but it ships with **fabricated** data (PRNG company names, random CIKs, 7 synthetic themes, invented AAER numbers, and explanation copy implying enforcement-from-disclosure). Per the credibility requirement, ALL synthetic data is replaced wholesale with our real ingested dataset. Chose to port the design out of the proprietary `x-dc` prototype runtime into a clean **Vite vanilla-JS** static build because the production app needs real async data loading, in-browser bge-small (transformers.js) for paste, filters, and graceful fallbacks — none of which the prototype runtime supports well. Real-data reconciliation: 7 synthetic theme-clusters → our 2 real footnote types (rev_rec/going_concern) over the real UMAP projection; amber strictly = real `enforced` cohort; real `aaer_number` on badges (no invented numbers); EDGAR links use the real `sec_url`; explanations come from the 38 real generated findings (neutral honest note for non-featured pairs, never invented analysis); design copy that implied enforcement-from-disclosure is rewritten to the honest "context, not a verdict" framing (C13 guardrails).
Recorded the full feature vision so nothing is lost, organized by build phase: v1 frontend (constellation hero, nearest-neighbor "companies like this one", finding panel with pre-generated explanations, going-concern distress layer as caveated featured view, enforcement as non-predictive context flag — all on existing data); v2 (needs a second data run: disclosure drift over time via multi-year filings, more disclosure types, SIC "galaxies"); v3 (Claude-in-product: NL query of the embedding space, explainer-not-judge). Hard rules recorded in the file and binding on every phase: keep the $25 Anthropic spend cap on ALL generation; UI/generated copy stays at "resembles / similar / drifted toward distress / outlier" — never "suspicious / fraud / flagged"; enforcement is context, not a prediction. Frontend NOT started — stopped per Josh's instruction, awaiting the Claude Design output.

### C14. Phase 4 explanations: model claude-opus-4-8, thinking omitted, enforcement kept out of the prompt
Generated 38 featured-pair resemblance explanations with claude-opus-4-8 for **$0.355** (cap $25; safety stop at 90%). Thinking omitted — these are short, grounded explanations, so omitting keeps cost predictable and output = exactly the explanation. Filtered out same-economic-entity pairs (different CIK, ~same name, e.g. Baker Hughes Holdings LLC vs Baker Hughes Co) so featured pairs are genuinely different companies. Enforcement history is NOT fed into the prompt (prevents biasing toward accusation) and only attached as a context flag on the shipped finding; honesty scan found 0 explanations with fraud/enforcement/accusatory language. `findings` table (from DATA_MODEL, implemented now) + data/embeddings/findings.json written. Idempotent + spend-capped.

### C13. Product reframed to honest "comparative disclosure semantic search" (Josh-approved, Option A)
Josh chose Option A from the BLOCKERS escalation after the validation null. Reframed SCOPE_V1.md, PRD.md (and VALIDATION_RESULTS.md records the finding): the product is comparative disclosure semantic search — the engine provably beats keyword search (Test 4) and has strong nearest-neighbor coherence. The "enforced companies cluster / clean-in-fraud-cluster" claim is **withdrawn**, not dressed up; SEC enforcement history is kept only as a **contextual overlay** with an explicit non-prediction caveat. The weak going-concern signal (AUC≈0.61) is preserved as an honestly-caveated featured view, not a fraud claim. Per Josh's instruction: generate featured-pair explanations next, then STOP before the frontend (which needs the Claude Design pass first).

### C1. Preflight passed; build started — 2026-06-25
Credentials in local `.env` only; Python venv with requests/duckdb/lxml verified on Py3.14; live SEC connectivity confirmed. Proceeding to Phase 1.

### C2. SEC fetching is single-process + rate-limited; extraction is what gets parallelized
SEC fair-access limit is ~10 req/s. Parallel worker agents hammering EDGAR would risk a block. So all network fetching goes through one polite throttled client (≤8 req/s, backoff, cache-to-`data/raw`); CPU-bound extraction over already-cached files is the parallelizable step. Honors conductor.md "parallelize extraction across batches" without violating PRD §7 politeness.

### C3. Python 3.14 toolchain risk flagged for Phase 2, not Phase 1
torch/sentence-transformers/umap may lack 3.14 wheels. Phase 1 (fetch/extract/DuckDB) needs none of them, so build proceeds; if Phase 2 install fails I will fall back to a 3.11/3.12 venv (decide-yourself: toolchain choice) and log it.

### C8. Footnote unit = paragraph-level on-topic excerpts (iXBRL text-blocks first, heuristic fallback), deduped
Extract rev-rec/going-concern via inline-XBRL PolicyTextBlock tags (exact, conf 0.95) where present, else classify paragraphs by topic and keep only on-topic ones (conf 0.35-0.65). Chunk to ≤1400 chars (bge-small-friendly, DATA_MODEL "bounded excerpt"). Rejected a fixed heading-window approach after it captured off-topic text (inventories/risk-factors). Exact-duplicate excerpts deduped (same-company boilerplate across years is degenerate for embeddings). Result: 3,206 unique footnotes, gate PASS.

### C9. Reviewer-driven fixes before Phase 2 (entity decoding, hard length cap, stricter rev_rec, cohort derivation)
Independent reviewer (conditional pass) found: 132K-char blobs from double-encoded HTML, entity/style leakage (~3.6% rows), a cash-flow line mislabeled rev_rec (SABA), and cohort stored in companies.current_status (contradicting C5). All are doc-determined fixes, not Josh-decisions, so corrected in-place and logged: normalize_excerpt() unescapes twice + strips residual tags; chunk_section() force-splits to the cap; rev_rec now REQUIRES recognition language; current_status restored to its DATA_MODEL meaning (NULL) with cohort derived via enforcement membership (db.py COHORT_CASE). Post-fix: 0 over-cap rows, 0 HTML-leak rows.

### C10. Per-chunk topic guard + XBRL-noise filter (reviewer re-verification follow-up)
Reviewer's re-verification PASSED all 4 fixes but noted ~2.8% chunk-level off-topic residual (topic test was paragraph-level; chunking sub-split without re-checking) and occasional inline-XBRL data noise. Added a per-chunk guard after splitting (drops chunks lacking topic cues + any XBRL-namespace noise). Result: rev_rec off-topic 1.07%, going_concern 0.53%, XBRL-noise 0. Final corpus 3,088 footnotes, gate PASS.

### C11. Phase 2 embedding toolchain = fastembed (bge-small ONNX), NOT torch — resolves the Py3.14 risk
fastembed 0.8 + onnxruntime 1.27 import and embed cleanly on Python 3.14 (384-dim bge-small, no torch wheels needed). Bonus: it's the SAME ONNX model the browser runs via transformers.js, so build-time and runtime embeddings match exactly. umap-learn + scikit-learn also install on 3.14. No fallback venv needed; C3 risk closed.

### C12. Validation HARD GATE failed — STOPPED at the gate, escalated (no signal dressing-up)
Ran the full backtest + 6 principled narrowing cuts. Revenue-recognition shows NO signal (SIC-matched separation d≈0, grouped-CV AUC 0.506); going-concern shows only a weak classification signal (AUC≈0.61), not a cluster. Retrieval lift ≈1.0×. No defensible headline. Honest conclusion: the central premise (enforced companies' rev-rec/going-concern footnotes cluster) is not supported — boilerplate policy notes carry topic/industry, not an enforcement fingerprint. Per VALIDATION_PLAN honesty guardrails + the unattended-run rules, did NOT start Phases 4–6, wrote validation/VALIDATION_RESULTS.md, and escalated to BLOCKERS.md with options (recommend reframing to the honest "comparative disclosure semantic search" instrument, which the engine genuinely supports per Test 4). Caught and fixed a cohort-labeling bug (correlated-subquery) mid-analysis before concluding, so the null is real, not an artifact. Phases 1–2 stand and are reusable under any chosen direction.

### C6. AAER→CIK resolution: precision over recall, every candidate verified against submissions API
Resolved 192 enforced issuers from 1,513 parsed AAERs (393 were issuer-companies; rest individuals/audit firms, correctly excluded). Each candidate CIK is verified by symmetric name-token overlap (both directions ≥0.6) against the EDGAR submissions API — this rejects false matches like "Sunbeam Americas Holdings LLC" for the real "Sunbeam Corp". Chose 192 verified over 248 looser matches because ground-truth label quality drives validation credibility (VALIDATION_PLAN honesty guardrail). 159 names unresolved (delisted/foreign/renamed) are logged in data/processed/enforcement_unresolved.json, not silently dropped.

### C5. DuckDB schema matches DATA_MODEL.md exactly; build-time labels are derived, not stored
Avoided adding helper columns (cohort/primary_doc/respondent_raw) to stay inside the escalation contract (schema changes require escalation). "enforced vs clean" = enforcement-table membership; footnote→cik = join via filings; primary-doc URL lives in filings.sec_url (which IS the canonical source link). No schema deviation, no blocker needed.

### C4. AAER ground-truth source = SEC AAER index pages, names resolved to CIK via EDGAR
The canonical AAER list lives at sec.gov/divisions/enforce/friactions*.htm (public domain). I parse the index for respondent names + release dates, then resolve names→CIK via EDGAR company-tickers + full-text search. Keeps everything keyed on CIK per DATA_MODEL. Unresolvable names are logged with confidence, not dropped silently.


---

### C44. Phase 6 — Disclosure Atlas MCP server (read-only, stateless; LOCAL ONLY this pass)
**Built:** a read-only, stateless MCP server (`mcp/`) exposing the existing computed data (DuckDB +
JSON/Parquet bundle) as **six tools** via the official MCP Python SDK (`mcp` 1.28.1, FastMCP, stdio):
export_panel (priority), get_company_profile, search_disclosures, get_financial_scores,
find_disclosure_changes, query_cohort_stats. Plan written first (docs/MCP_PLAN.md).

**Architecture decisions:**
- **Canonical source = the shipped JSON bundle** (nodes/scores/neighbors/excerpts/tickers/aaer/manifest +
  int8 embeddings.bin), NOT a re-derivation, so MCP results are byte-identical to the website. DuckDB
  (opened `read_only=True`) is the relational backstop for enforcement detail / financials / raw text.
- **Cohort filter (`cohort.py:passes`) reproduces `constellation.js _passesFilter` exactly**, and
  `build_panel` reproduces `dataset.js buildPanel` + the COLS codebook — so cohort counts and the panel
  match the site. Verified: SIC-3674 = 37 companies / 284 company-years; enforced = 123 / 938; AMD
  FY2022 M −1.14 / AQI 2.9933 / flag 1 (matches DuckDB accounting_scores raw −1.1365 rounded).
- **No Claude/Anthropic API in the server.** search_disclosures embeds the query LOCALLY with fastembed
  bge-small (ONNX, CPU, $0), mirroring the browser encoder; cosine over the int8 embeddings.
- **Honesty travels with the data (the overriding rule):** centralized in `honesty.py`; every tool that
  returns scores/changes/multi-measure/profile data attaches the relevant caveat block IN the payload
  (descriptive-only; cited screens Beneish 1999/Dechow 2011 with limitations; cannot-re-validate;
  replicated null / does-not-predict-enforcement; no risk score / no composite / no ranking;
  enforcement = context, co-occurrence ≠ evidence). No way found to get numbers without the caveats.
- **Read-only / stateless / validated / capped:** no writes anywhere; pydantic-typed inputs + explicit
  enum/range validation (bad type/sic/industry/year/cik raise, never silent-empty); result caps
  (panel 5000/hard 20000, search top_k 50, changes top_n 500) with a correct `truncated` flag.
- **No secrets:** the server never reads `.env`/credentials (no os.getenv/dotenv for secrets); a test
  asserts no Anthropic/Vercel/SEC/password material in any response.

**Verification:** `mcp/test_harness.py` 66/66 PASS (known values, counts-vs-bundle, honesty present,
no-secrets, input validation, limits) + a real stdio protocol round-trip (6 tools, valid inputSchemas,
live calls) + an independent injection-hardened reviewer: **overall PASS, HONESTY AUDIT PASS**, no
security/correctness/honesty failures; only a negligible dead expression (removed) and a defensible note
(changes tool omits the cannot-re-validate caveat because it returns language-change distances, not the
financial screens — the load-bearing not-a-red-flag + replicated-null caveats are present).

**NOT deployed.** Local build + verification only, per instruction; public hosting is a later deliberate
step. Anthropic spend unchanged at $0.355 / $25 (fastembed is local; $0).

---

### C45. Final comprehensive audit (all six phases complete) — PASS; one cosmetic fix
**Scope:** verification + hygiene pass over the whole project (live web product + local MCP server).
No features added.

**Deterministic local checks (self):** MCP harness 66/66 PASS. Data anchors vs DuckDB + bundle: AMD
FY2022 M −1.14 / AQI 2.9933 / flag set; Apple FY2025 M −2.03 / AQI 0.9863; no-score companies carry
node ms=None (never 0); AMD peer percentile (14th in SIC-3674, fog 17.77 vs 19.16 median) and
going_concern cohort stat (6,266 footnotes / 491 enforced / 7.84% / M median −2.87) reproduce exactly
via MCP. Dist hygiene: 0 .map, 0 sourceMappingURL, 0 secrets in shipped code. Live: root 200, full
security headers (CSP/COOP/Permissions-Policy/Referrer-Policy/nosniff/X-Frame-Options DENY),
**deploy == current source build** (bundle index-DGI3xjki.js identical → no redeploy needed),
nodes.json 200, EDGAR sample 200.

**Independent injection-hardened reviewer (Playwright live sweep + cross-project honesty):** OVERALL
PASS. All web features verified at 94,455 with 0 console errors; mobile 390px 0 overflow on every
surface; keyboard focus + ESC-clears-hash; 5 EDGAR links 200; filters compose monotonically (all
94,455 → going_concern 6,266 → +enforced 491 → +Semiconductors 6); peer percentiles correct (no
"83th"); INTERSECT alphabetical + each measure separate + no composite; panel zip has all 7 files with
missing-as-NA; permalinks/cite/CSV/XLSX/shortlist/methods all work. MCP: 6 tools, schemas valid,
read-only, no secrets, validation + caps, honesty in every payload, no caveat-stripping path.
**HONESTY AUDIT PASS — zero judgment-word violations** across live DOM + JS bundle + data + MCP
payloads (forbidden words appear only in honest negations / academic methodology / verbatim SEC quotes).
Replicated null surfaced as a strength; amber = enforcement context only; M/F = cited screens with
limitations + cannot-re-validate; no per-company risk score / composite / ranking-by-suspicion.

**Defects:** none release-blocking, none medium. Two info notes: (1) MCP get_financial_scores omitted
the literal "Descriptive only." line that other score-bearing tools carry — **FIXED** (added
DESCRIPTIVE_ONLY to honesty.SCORES; harness still 66/66); (2) benign HuggingFace CDN content-length
console warning during in-browser embedding (third-party, not an app error — info only).

**Data note (not a defect):** DuckDB companies = 1,978 rows; distinct companies carrying footnotes =
1,804 (matches the stated corpus; 192/1,978 with enforcement history).

**No redeploy:** web bundle unchanged (deploy == build); MCP is local-only by design. Anthropic spend
unchanged at $0.355 / $25.

---

### C46. DATA TABLE view — the Phase-3 panel as a sortable, virtualized in-browser grid
**Built:** a command-bar `▦ DATA TABLE` (app/src/table.js + .dt-* styles + #tableModal) that renders the
CURRENT cohort (active filters) as the analysis-ready company-year PANEL in a grid — meeting researchers
in the tabular format they natively work in. An INTERFACE to existing data, not new data.

**Key design decision — table == export, by construction:** rows are `buildPanel()` and columns are
`PANEL_COLS` (both imported from dataset.js, the same code the .zip uses), and "Download this view"
calls the same `buildPanelZip()`. So the grid is a literal live preview of exactly what downloads; it
cannot drift from the export.
- **Virtualized** windowed rendering (ROW_H 30px + overscan): ~25 DOM rows for 12,436 company-years
  (sizer 373,080px) — smooth at thousands. Separate sticky header with horizontal scroll synced to the
  body via translateX (fixed px column widths keep head/rows aligned).
- **Sortable** headers (▲/▼), with **NA always sinking to the bottom in both directions** (NA is not a
  low/high value). **Column show/hide** picker grouped Identifiers/Disclosure/Financial/Context,
  persisted to localStorage. **Click a row → that company's profile.** Composes with all existing filters.
- **Honesty (load-bearing, the critical constraint):** descriptive columns only — **NO composite/risk
  column exists**; the cited-screens + cannot-re-validate caveat sits visibly above the grid; sorting by
  the M/F screen is described as ordering a descriptive measure, **not** a suspicion ranking; missing =
  muted "NA", never 0; **amber appears ONLY on the enforcement-context cell**, every other cell neutral
  (tabular figures). The grid must not read as a "most-suspicious" leaderboard — it does not (default
  sort is CIK, academic framing, calm palette). The one "suspicious" token on screen is inside the honest
  negation `no "most-suspicious" ranking`.

**Verification (my Playwright sweep + independent injection-hardened reviewer — both PASS):**
- Sort cross-checked vs DuckDB: panel M min −398.07 (cik 0000318299 FY2018) / max 6970.08 (cik
  0001162896 FY2020) exact; corpus-wide DB extremes correctly absent (not footnote-defined company-years).
- Filters compose exactly: going_concern → 6,266 footnotes → 2,714 company-years (a node with undefined
  fiscal year is correctly excluded from the company-year panel); enforcedOnly → 938. Counts match the
  cohort recompute.
- Virtualization (25 DOM rows / 12,436 view), row→profile (→ #c=…), download = valid 2.48 MB
  application/zip (PK) with all 7 panel files + panel.csv 12,436×37, column show/hide + persist, 0 console
  errors, mobile 390px no page/card overflow (grid scrolls internally), honesty banner complete.
- Reviewer HONESTY AUDIT: **PASSED** — no composite/risk score, caveats prominent, NA-not-zero,
  enforcement-only amber, not a suspicion leaderboard. No release-blocking/medium defects. Low/cosmetic:
  programmatic `engine.setFilter()` (JS hook only) doesn't refresh the subtitle label — NOT user-facing
  (the real dropdown path updates it). Info: a few source rows have gunning_fog 0 (descriptive artifact).

**Docs:** DESIGN_SYSTEM.md (new "Data table" section) + methods.js (data-table mention) updated.
**Deployed** to https://disclosure-atlas.vercel.app (live bundle index-QeSsB9_p.js == local build).
Anthropic spend unchanged at $0.355 / $25 (in-browser only; $0). No new blockers.

---

### C47. TABLE 1 — descriptive-statistics generator (the academic "Table 1")
**Built:** a command-bar `Σ TABLE 1 · DESCRIPTIVES` (app/src/table1.js + .t1-* styles + #table1Modal)
that produces the standard publication-style descriptive-statistics table for the ACTIVE cohort: one row
per measure × {N, mean, median, SD (sample n−1), min, p25, p75, max}, grouped Disclosure / Financial.

**Unit handling (the explicit correctness requirement) — cross-checked:**
- Disclosure measures (Gunning Fog, distinctiveness) at the FOOTNOTE level (N up to 94,455).
- Footnotes-per-company at the COMPANY level (N = 1,804 distinct CIKs).
- Beneish M (+8 components) and Dechow F (+7 components) at the distinct COMPANY-YEAR level —
  **deduplicated by cik|pfy, never footnote-duplicated** — read from scores.json for full precision.
- **N = non-missing count; zeros never imputed** (M-Score N=4,411 ≪ 12,436 company-years; the ~8k
  score-less company-years are excluded, not zeroed).
- Each row states its unit + an explicit unit-of-observation note.

**Exports:** `↓ CSV` and `⧉ COPY (for paper)` — a titled, tab-separated table (drops into Excel/Word/
Sheets) carrying the cohort definition, N line, retrieval date, the unit note, and the descriptive +
cited-screens + cannot-re-validate caveat, so context travels with the numbers.

**Honesty:** purely descriptive — no score/ranking/judgment/composite column; the cited-screens +
cannot-re-validate caveat travels with the financial measures; neutral styling, **no amber** (no
enforcement cell here); 0 forbidden words. Reads as a neutral descriptive table, not a scoring device.

**Verification (my Playwright + independent injection-hardened reviewer — both PASS; honesty PASS,
unit/dedup CORRECT):** every statistic independently recomputed vs the bundle/DuckDB and matched the UI
exactly — full cohort Beneish M: N=4,411, **median −2.57** (expected band ≈ −2.56/−2.57), mean 1.438,
SD 135.603, min −398.07, max 6970.08; AQI median 0.994; Dechow F N=4,625, median 0.59; Gunning Fog
N=94,455 (footnote-level), median 19.00; footnotes-per-company N=1,804 (company-level). The reviewer
proved dedup: footnote-duplicated M would be N=35,975 (or ~94k) — the UI's 4,411 matches the deduped
count. Filters compose (going_concern → 6,266 footnotes / 2,714 company-years / M N=678 / median
−2.765, exact). CSV + copy correct. 0 console errors; mobile 390px no page/card overflow (table scrolls
internally, measure column frozen). No regressions (finding/data-table/cohort/methods all work at 94k).
Non-blocking notes only (a reviewer-side hook-timing artifact; the known non-user-facing label desync
under the low-level setFilter() API; a ~1s loading state) — no fixes warranted.

**Docs:** DESIGN_SYSTEM.md (new "Table 1" section) + methods.js (Table 1 mention) updated.
**Deployed** to https://disclosure-atlas.vercel.app (live bundle index-xRBBr1N8.js == build).
Anthropic spend unchanged at $0.355 / $25 (in-browser only; $0). No new blockers.

---

### C48. Shareable cohort definitions via URL (reproducible sample, no accounts)
**Built:** a command-bar `⧉ SHARE COHORT` (app/src/share.js + .sh-*/.share-card styles + #shareModal)
that captures the full active filter set (the cohort = the sample) as a clean URL reconstructing the
EXACT cohort on a fresh load — for collaboration, robustness checks, and referee reproducibility
("here's my exact sample") without accounts.

**Encoding:** only non-default filters are serialised (industry as its manifest.industries index) →
minimal JSON → base64url, in a `#cohort=<token>` permalink. Decode is defensive: malformed/empty →
null → ignored (graceful degrade to the full corpus; never throws).

**Reconstruction reuses existing logic:** on load `applyCohortMin` sets the real <select>/slider/toggle
controls and dispatches their native events, so the SAME engine.setFilter path runs — lossless round-trip
(open link → identical filters + identical filteredIndices count). Validated/clamped on apply.

**Bug found & fixed during verification:** a hash-only navigation does NOT reload the page, so
reconstruction had relied solely on the init handler (setTimeout applyHash). Added a `hashchange`
listener so pasting a shared link into the same tab (and back/forward) also reconstructs. Our own
setHash() uses history.replaceState, which does NOT fire hashchange → no feedback loop.

**Pairs with the views:** an optional `v` field (t1/dt/ch) opens Table 1 / data table / cohort analysis
directly on the shared sample; the Share modal + in-context buttons in Table 1 and the Data Table offer
copy-link / → Table 1 / → Data table. The Share modal shows the human-readable cohort definition (one
line per filter) + N (footnotes/company-years/companies) for sample-selection transparency.

**Honesty:** a cohort link is a descriptive sample definition — no scores/ranking/judgment; the caveat
carries the cited-screens + cannot-re-validate note where financial measures appear; neutral styling,
no amber (a sample definition is not an enforcement signal).

**Verification (my Playwright + independent injection-hardened reviewer — both PASS):** lossless
round-trip cross-checked on cold load for two cohorts (complex multi-filter → identical filter state +
count; related_party type → 4,971 before/after); v=t1 / v=dt links reconstruct AND auto-open the view;
malformed + empty tokens degrade to the full corpus (94,455) with 0 console errors; share-modal N line
independently matched (17 footnotes / 10 companies / 16 company-years); 0 forbidden words, 0 amber; no
regressions at 94k; mobile 390px no overflow. Reviewer: **PASS, no defects** (two informational notes
were reviewer-side test-harness artifacts).

Sample link: https://disclosure-atlas.vercel.app/#cohort=eyJ0IjoiMSIsImN4IjoiYWJvdmUifQ
(going-concern + complexity above industry median).

**Docs:** DESIGN_SYSTEM.md (new "Share cohort" section) + methods.js (shareable-link mention) updated.
**Deployed** to https://disclosure-atlas.vercel.app (live bundle index-Btdk9S0E.js == build).
Anthropic spend unchanged at $0.355 / $25 (in-browser only; $0). No new blockers.

---

### C49. Correlation matrix — pre-modeling pairwise correlations across cohort measures
**Built:** a command-bar `⊞ CORRELATIONS` (app/src/correlation.js + .cr-* styles + #corrModal) — the
standard pre-regression "how do my variables relate?" check for the active cohort.

**Key design decision — unit:** correlations require all variables on ONE unit, so the matrix is computed
over the COMPANY-YEAR panel (buildPanel — same rows as the data table / Table 1 financial / export):
disclosure measures aggregated to company-year, financial screens already per distinct company-year
(deduped, never footnote-duplicated). 10 variables: Gunning Fog, Distinctiveness, Footnotes(n),
Beneish M + key components (DSRI/GMI/AQI/SGI/TATA), Dechow F.

**Methods:** PEARSON | SPEARMAN (rank via fractional-rank transform) and PAIRWISE | LISTWISE deletion
toggles. Pairwise (default) computes each coefficient over company-years where both measures are present
(per-cell N, shown on hover); listwise uses the complete-case set. Missing never zero-imputed; N stated
(cohort N + pairwise range / listwise N). Self-pairs/constants → null (no spurious correlation).

**Honesty / colour (load-bearing):** cells shade by |r| (MAGNITUDE) in a single neutral cyan hue; the
SIGN lives only in the digits — NEVER red/green good-bad, NEVER alarm colours. Purely descriptive —
correlations describe linear/rank association in this sample, not causal, not a judgment, sample-specific;
the cited-screens + cannot-re-validate caveat travels with the financial measures. Neutral, no amber.

**Composes with the pattern:** filters (reads filteredIndices); CSV export labeled with cohort + method +
unit + N (coefficient matrix + pairwise-N matrix); shareable-cohort (v=cr opens it; Share modal gains a
⧉ CORRELATIONS link option; in-modal ⧉ SHARE COHORT copies that link).

**Verification (my Playwright + independent injection-hardened reviewer — both PASS; all 12 items, honesty
PASS):** every UI coefficient independently recomputed (numpy) and matched to 4 decimals — Pearson
fog~footnotes 0.0906 (N=12,436), M~AQI 0.0208 (N=4,411), M~TATA 0.1367; Spearman m~tata 0.6296; M~DSRI
0.79. Unit/dedup confirmed (corr.N=12,436; financial pairs N=4,411 deduped, NOT ~35,975 footnote-dup;
Dechow F 4,625). Pairwise (range 3,173–12,436) and listwise (N=3,173) both correct; no zero-imputation.
0 red/green cells (single cyan hue; +/− of equal |r| identical shade). Filters compose (going_concern →
2,714 company-years; M-pairs 678). CSV + share(v=cr) cold-load reconstruct + open the matrix. 0 console
errors, mobile 390px no overflow, 0 forbidden words, 0 amber. No defects; one informational note
(disclosure measures aggregated over the full company-year, consistent-by-design with the panel/Table 1).

**Docs:** DESIGN_SYSTEM.md (new "Correlation matrix" section) + methods.js updated.
**Deployed** to https://disclosure-atlas.vercel.app (live bundle index-DPI43EYS.js == build).
Anthropic spend unchanged at $0.355 / $25 (in-browser only; $0). No new blockers.

---

### C50. Final adversarial security + integrity audit (pre-external-sharing) — PASS
**Scope:** full adversarial verification of the live web product + local MCP server before the project is
shown to an external researcher and cited in a formal application. No features added. My deterministic
sweep + an independent injection-hardened reviewer (92 tool calls), in agreement.

**SECURITY — PASS.** Secrets: 0 in shipped code, data files, all git-tracked files (repo has 0 commits →
no history), and the MCP server (reads no credentials); `.env`/`.env.save` git-ignored and verified
absent from bundle/data/live. Source maps: 0 (dist + live `.js.map` → 404, no sourceMappingURL). Headers
(live): CSP without unsafe-inline (script-src locked to self + pinned CDNs; object-src none;
frame-ancestors none; base-uri self), HSTS max-age=63072000 includeSubDomains preload, X-Frame-Options
DENY, nosniff, Referrer-Policy, Permissions-Policy, COOP. EDGAR sample 200. Injection/XSS: paste +
compare payloads (`<img onerror>`/`<script>`/`<svg onload>`) escaped, never executed (window flags stayed
undefined); hostile/malformed cohort + hash links (`<script>`, out-of-range type/industry index, garbage,
huge tokens) all degrade gracefully to the full corpus with 0 console errors and no script execution —
confirmed both by code analysis (strict-regex routing + JSON-parse-in-try/catch + field validation/clamp,
never written to innerHTML; user text in textareas/textContent; corpus via esc()) and live reviewer tests.
MCP: harness 66/66; DB read_only (CREATE/INSERT/UPDATE/DELETE/DROP all raise); 6 tools; bad inputs raise;
caps clamp (panel 20000 / search 50 / changes 500) with truncated flag; every score/change/multi-measure
payload carries the honesty caveats (no naked-score / caveat-strip path); no secrets in responses.

**INTEGRITY / HONESTY — PASS.** No risk score / composite / suspicion ranking / judgment / alarm colour
on any surface (constellation, profile, peer benchmarking, cohort, shifts, intersection, data table,
Table 1, correlation matrix, exports, MCP). The tool cannot be made to imply a company is fraudulent.
Amber (#E0A04A) = enforcement context ONLY. Correlation matrix neutrally coloured (0 red/0 green cells;
magnitude-only). Forbidden words appear only in honest negations/caveats or verbatim SEC/academic
citations (Beneish 1999 title). Replicated null surfaced as a strength; M/F framed as cited screens with
limitations + cannot-re-validate.

**CORRECTNESS — PASS (all exact vs DuckDB/bundle).** AMD FY2022 M −1.1365/−1.14, AQI 2.9933, flag set;
Table 1 Beneish M median −2.57 (N 4,411); Pearson Fog~Footnotes 0.0906 (N 12,436); going_concern 6,266
footnotes / 2,714 company-years; panel observations 12,436; corpus 94,455 / 6 types / 1,804 companies.
0 console errors on clean loads; mobile 390px no overflow on every modal; deploy == build
(index-DPI43EYS.js).

**Defects:** none (release-blocking / medium / low). Two info notes: (1) `.env`/`.env.save` hold live
keys in the project root — git-ignored, 0 commits, nothing shipped; keep out of the first commit + rotate
(standing BLOCKERS item, updated). (2) A one-time `blob:fake` console error from a prior in-browser-worker
test that does not reproduce on clean loads. Nothing changed → no redeploy. Anthropic spend unchanged at
$0.355 / $25.

**Verdict:** secure, honest, and correct — safe and sound to show externally and cite in an application.

### C51. Data-wrangling / merge-friction killer — identifier crosswalk + copy-as-code import snippets
**Decision.** Eliminate the most-hated step in empirical accounting research (wrangling/merging the data
into an existing database) so Disclosure Atlas data joins effortlessly and drops into the researcher's
tools with zero manual work. Scope: identifiers travel with every export AND every MCP payload; one-click
ready-to-run import code in three flavors; the data dictionary + a JOINING note travel with every export.

**What shipped.**
- **Identifier crosswalk.** Added `gvkey`/`cusip`/`permno` to the panel column registry (`dataset.js COLS`
  ⇄ `mcp/cohort.py CODEBOOK`/`build_panel`/`PANEL_COLUMNS`) as honest-EMPTY (NA) columns; resolvable
  identifiers (zero-padded CIK, ticker, company_name, sic_code, sic_industry, accession) already present.
  New `app/src/identifiers.js` (`XWALK_HEADERS`/`xwalkCells`) splices sic_code/sic_industry + the three
  honest-NA licensed columns into the footnote-level exports (filtered/bulk, shortlist, finding panel).
  Data-table `DISPLAY` gained the three id columns (hidden by default, revealable; export carries all).
- **Copy-as-code import snippets.** `dataset.js` now exports `stataSnippet`/`rSnippet`/`pySnippet`
  (generated from `COLS` → can't drift) + `joiningNote()`. The panel `.zip` gained `import_panel.py`
  (pandas: CIK as string, parse_dates, NA preserved) and `JOINING.md`. New `app/src/importcode.js`
  (`ImportCode`, `importModal`, `.ic-*`) is a calm modal with `STATA · R · PYTHON` tabs + copy + a
  joining note; opened by a `⧉ COPY IMPORT CODE` button on the Cohort and Data-table views.
- **Data dictionary + joining note travel with the data.** `codebook.md` gained an identifiers/joining
  preamble; `README.txt` IDENTIFIERS section updated; `JOINING.md` covers merge-on-CIK and
  CIK→GVKEY/PERMNO/CUSIP mapping in the researcher's own WRDS/Compustat/CRSP env + the point-in-time /
  look-ahead caveat.
- **MCP payloads.** `export_panel` carries `identifiers_note` + structured `join_guidance` (and the rows
  now include the honest-NA licensed columns + codebook); `get_company_profile` identity + 
  `get_financial_scores` company blocks carry the crosswalk + `identifiers_note`; `search_disclosures`
  hits gained sic_code/sic_industry; all relevant tools carry `identifiers_note`. New
  `honesty.IDENTIFIERS_NOTE` + `honesty.JOIN_GUIDANCE` are the single source of that framing.

**Honesty (load-bearing).** NEVER fabricate an identifier: GVKEY/CUSIP/PERMNO require licensed sources
this project does not hold, so they ship as named, empty NA columns with a documented CIK→ID recipe — the
researcher fills them from their own licensed environment. CIK is the universal join key. All existing
caveats intact; descriptive only; no risk score; neutral styling (no amber on these surfaces).

**Verification.** JS build clean (26 modules). Generated a real `panel.csv` for a cohort (SIC 3674, 284
company-years, 37 companies, incl. AMD) via the exact `buildPanel`/`panelCSV`/snippet generators and RAN
the generated `import_panel.py` with pandas 3.0.4: dtypes correct (cik `string`, filing_date
`datetime64`, measures `float64`), zero-padded 10-digit CIK preserved (all len 10), gvkey/cusip/permno
ALL-NA (never fabricated), ticker/sic populated where resolvable, missing beneish_m is NaN not 0, AMD
FY2022 M −1.14 / AQI 2.9933, and merge-on-CIK attaches a researcher's GVKEY. (A SIGBUS in the bleeding-
edge pandas 3.0.4 / numpy 2.4.6 / Py3.14 stack on a StringDtype boolean-mask `.iloc` pattern was worked
around with a groupby path — environment bug, not the snippet/data.) R + Stata snippets static-verified:
every referenced column matches the CSV header exactly, CIK kept string, dates parsed, only numeric
columns destrung. MCP harness 81/81 (was 66; +15 crosswalk/join checks). $0 spend (no generation).

**Review + deploy (C51).** Playwright (local + live prod): import modal opens on Cohort + Data-table,
all three flavors render correct loaders (CIK-as-string / parse_dates / NA), JOINING note present, 0
amber, 0 console errors, mobile 390px clean (no overflow, code scrolls internally); data-table column
picker exposes gvkey/cusip/permno under IDENTIFIERS (NA, hidden by default). Independent adversarial
reviewer: **OVERALL PASS**, no genuine defects — confirmed licensed ids never fabricated (100% NA at
runtime), crosswalk complete + column-aligned, snippets load the real file, **zero JS↔Python drift (40
cols identical order)**, JOINING/codebook travel with the zip, no implied wrongdoing, harness 81/81. One
low-severity hardening applied per the reviewer: the Stata `destring` list is now derived from `COLS`
(like R/Python) so it can't drift — re-verified it equals the 30 numeric columns exactly, no identifier.
Rebuilt (`index-Db2QW4_Z.js`), deployed to prod (https://disclosure-atlas.vercel.app, alias live, 200;
CSP/HSTS/X-Frame-Options intact), `.vercel`/`.env.local` removed. **$0 spend** (no generation).

### C52. Chapter F — corpus expansion to ~150k footnotes (multi-session, resumable) — KICKOFF
**Decision.** Grow the corpus from 94,455 footnotes / 1,804 yielding companies to ~150,000 by broadening
the company universe ONLY — same 6 footnote types, same ~10-year window, same extraction bar, same
pipeline (extract → embed bge-small → UMAP → batched checkpointed neighbors → int8 quantize → bundle).
No feature/design change. $0 (SEC public data + local bge-small; no Claude API). Plan: `docs/EXPANSION_PLAN.md`.

**Sizing (measured, not guessed).** 52.4 footnotes/yielding company; yield ratio 0.656. To add ~55.5k
footnotes ≈ 1,060 yielding companies ≈ ~1,620 universe entries at current yield; the deeper small-cap
tail yields less, so set **TARGET = 4,800** (adds 2,050). Trim precisely at extraction via
`MAX_CHUNKS_PER_TYPE` (no re-fetch). File-size projections at 150k (1.59×): embeddings.bin 36→58MB,
nodes.json 40→64MB, excerpts.json 48.5→77MB, neighbors.json 14→22MB — all under the 100MB/file cap;
excerpts.json is the one to watch (safe to ~175k; mitigation = shard index-ranged lazy parts).

**Additive universe (no churn).** Modified `build_universe_v2.py` to pin the entire prior
`universe_v2.json`, guaranteeing the new universe is a strict SUPERSET. Verified: prior 2,750 ⊆ new 4,800,
0 dropped, 2,050 added. Backup at `data/processed/universe_v2.prior.json`.

**Status at kickoff.** Fetch (`fetch_history_v2.py`) launched under `caffeinate -i` in the background:
universe=4,800, 2,750 already done (instant skip), 2,050 to fetch. Early rate ~0.27 co/s, **0 errors**,
~84% yielding ≥1 10-K → ETA ~2h. Per-CIK checkpoint (`fetch_history_done.txt`) + append-only manifest
(`filings_v2.jsonl`) make it crash-safe/resumable. Downstream scripts all compile-checked; the bundle
builder recomputes distinctiveness/complexity vs the larger SIC-industry peer groups automatically (groups
rebuilt from the live corpus). RESUME_HERE written to PROGRESS.md. Next: load → extract → financials →
embed+bundle → honest re-validation → verify+deploy. Anthropic spend unchanged.

### C52 cont. — extraction made resumable/checkpointed (repeated background-kill mitigation)
The footnote extraction over 25,741 filings was killed twice mid-run as a background job (once at
16,500 filings, once at ~1,000) with no OOM evidence (16 GB RAM, no jetsam) — long background tasks are
being reaped unpredictably. The original `extract_footnotes.py` cleared the table and re-parsed ALL
filings each run with no checkpoint, so a kill lost everything. Fix (honoring the "design it RESUMABLE"
mandate): added an **accession-level checkpoint** (`data/processed/extract_done.txt`) written+flushed the
instant each filing is processed, a `--limit N` batch flag, and `--fresh`. A fresh run clears
table+checkpoint; a resume keeps both and skips done accessions. Cache-missing filings are checkpointed
too (won't retry forever). **Dedup is gated** to run only once every filing is processed (it must see the
full corpus); if killed before then the run prints INCOMPLETE and re-running resumes. Driver
`data/processed/extract_driver.sh` loops bounded 3,000-filing batches until the checkpoint reaches the
filing total, so progress survives kills and the loop itself is re-runnable. `MAX_CHUNKS_PER_TYPE=4`.

### C53. Chapter F — corpus expansion COMPLETE (94k → 161,469 footnotes), deployed
Expanded the company universe (2,750 → 4,800, strict superset) and re-ran the full pipeline. Final:
**161,469 footnotes / 3,253 yielding companies** (from 94,455 / 1,804) — exceeds the ~150k goal. Per type:
risk_factors 51,585 · rev_rec 40,797 · mda 26,744 · related_party 23,680 · cam 9,749 · going_concern 8,914.
Financials: 34,677 rows / 3,126 companies; 12,691 Beneish-M + 11,717 Dechow-F scored; 15,219 honest-NULL
with recorded insufficiency reasons (never fabricated). Distinctiveness/complexity recomputed vs the larger
SIC-industry peer groups at build time. Identifier crosswalk extended: tickers.json resolves 2,940/3,253
(rest honest-blank); gvkey/cusip/permno remain honest-empty.

**Deploy-size constraint MET** (all files <100MB/file): embeddings.bin 59.1MB · nodes.json 65.8MB ·
excerpts.json 79.7MB (largest; safe to ~175k) · neighbors.json 23.7MB · scores.json 6.9MB. Dropped the
unused .parquet from the web deploy (MCP-only). LOD rendering verified smooth at 161,469 points
(canvas active, 0 console errors, mobile 390px clean, data table builds 23,592 company-years, new-company
profile works). Spot-check: AAR CORP (CIK 1750, a NEW company) FY2016 Beneish M = DB −2.288 → scores.json
−2.29, components present — correct.

**Honest null re-validation at scale (`validation/VALIDATION_RESULTS.md` Chapter F):** the replicated null
HOLDS at 161k — separation Cohen's d per type all |d|<0.26 (rev_rec −0.12, going_concern +0.15,
related_party −0.25, cam +0.11, mda −0.06, risk_factors +0.02), gate FAIL. A larger, more diverse clean
set did NOT produce separation. Test 4 (semantic-beats-keyword) still PASSES (semantic top-1 ranks 8,982nd
by keyword) — the engine works; it carries no enforcement signal. Reported as-is, no dressing up.

**Resumability engineering (the multi-session mandate).** Background CPU jobs were reaped within minutes
here, so I added checkpoint-resumable + bounded-batch drivers to extraction (accession checkpoint),
financials (CIK checkpoint), and embedding (memmap row counter). Neighbors were already checkpointed.
Each stage survived repeated reaps by resuming from its checkpoint. Pipeline unchanged otherwise; no
feature/design change (JS bundle identical: index-Db2QW4_Z.js). Deployed to prod (alias live, 200,
manifest shows 161,469/3,253; CSP/HSTS intact). $0 (SEC public data + local bge-small; no Claude API).

**Review (C53).** Independent adversarial reviewer: **OVERALL PASS 7/7** — corpus aligned (161,469 across
nodes/neighbors/excerpts/manifest/DB; embeddings.bin = 161,469×384 exactly), all files <100MB, new-company
Beneish M-scores match DB (full sweep 12,691 values, 0 mismatches, 0 fabricated; insufficient years honest-
NULL with reasons), distinctiveness/complexity recomputed at scale (dvi {0:121204,1:28376,2:11889}; cmp all
three tiers), tickers 2,940 all match DB (0 fabricated; gvkey/cusip/permno honest-empty), null reported
honestly (all |d|<0.26, gate FAIL), JS bundle unchanged (no feature/design change), no forbidden framing.
Reviewer's two cosmetic nits (manifest validation prose still cited the prior 94,455/~30x jump and "CAMs
+0.18" vs actual +0.112) were FIXED in build_app_data.py + the shipped manifest.json and **redeployed**;
live manifest now reads 161,469 / CAMs +0.11. Chapter F COMPLETE.

---

## C54 — FOCUSED BUG-HUNT + VERIFICATION AUDIT (export "won't open" + post-161k regression sweep)

**Context.** User reported a downloaded CSV/Excel export "wouldn't open" recently (i.e. after the
161k expansion). Mandate: reproduce by actually generating every export and OPENING each; fix; full
regression/honesty/security sweep at the new scale; redeploy. $0; read .env, never print secrets.

**Reproduction (real browser, real data).** Drove the live app with Playwright, intercepted every
export Blob, and parsed each with openpyxl/pandas/zipfile/expat. Per-finding CSV+XLSX were valid
(CIK stays string "0000002488", numbers numeric, OOXML well-formed). Then the full-set **bulk XLSX
(161,469 rows) crashed the renderer (OOM) — reproduced deterministically twice.** Bulk CSV was fine
(48.5 MB string). 

**BUG #1 — root cause.** `exporters.downloadXLSX` built the workbook via SheetJS `aoa_to_sheet`
(lazy-loaded from cdn.sheetjs.com). At 161k×~31 that allocates ~5M cell objects → tab OOM. The
94k→161k expansion tipped it past the memory cliff. This is the "Excel export wouldn't open": at a
large filter the tab crashes → no/truncated file.
  **Fix.** Replaced SheetJS entirely with a dependency-free **streaming OOXML writer** (exporters.js)
  that builds sheet XML as a string and zips it via a new DEFLATE `makeZipAsync` (zip.js, using the
  platform `CompressionStream('deflate-raw')`). Properties: no per-cell object (scales to any size);
  XML-escapes &<>"' and strips illegal XML control chars; emits real JS numbers as numeric cells and
  everything else as inlineStr so a zero-padded CIK NEVER loses leading zeros; correct OOXML MIME.
  Also removes the external-CDN failure mode (offline, deterministic, $0). Store-only would have made
  the file 271 MB; DEFLATE brings the full 161k workbook to ~17 MB.
  **Verified:** Node unit test (adversarial: AT&T `&`, apostrophes/commas, form-feed, unicode, empty
  cells, leading-zero CIK) + 161,469-row stress → openpyxl/pandas open both; CIK stays string; XML
  well-formed. On the rebuilt app: full bulk XLSX builds in ~6 s, 17.3 MB, opens in openpyxl (39 cols,
  CIK "0000886475", gvkey/cusip empty). Every export type re-generated over a real cohort and opened:
  finding/bulk/shortlist/profile/cohort CSV+XLSX, Table 1 + correlation CSV, panel .zip (cohort and
  table byte-identical → parity holds). 14/14 artifacts valid (correlation CSV carries an intentional
  publication preamble — Excel/csv parse fine; only naive pd.read_csv without skiprows trips on it).

**BUG #2 — found during the sweep (separate 161k regression, was LIVE on prod).**
`cohort.js:58` computed the year range with `Math.min(...yrs)` / `Math.max(...yrs)`; at full corpus
`yrs` has ~161k entries, so the spread blew the call stack → `RangeError: Maximum call stack size
exceeded`. **The entire COHORT ANALYSIS feature threw on open for any large cohort on production.**
Confirmed broken on the deployed site before the fix.
  **Fix.** Reduce-based min/max (O(n), stack-safe at any size) in cohort.js; same anti-pattern fixed
  defensively in profile.js (×2). Verified: all modals (profile, cohort@161k, table, table1, corr,
  intersect, changes) open without error on the rebuilt app and on prod after deploy.

**Deploy + live re-verify.** `vite build` → deploy app/dist to Vercel prod (alias live). Deployed JS
= index-fJ7RLrP5.js (== local build → deploy==build). On https://disclosure-atlas.vercel.app:
cohort.open() OK at 161,469; full bulk XLSX builds 17.3 MB no crash; 0 console errors on load and
after exercising finding/cohort/Table1/correlation; mobile 390px clean (header shows 161,469 mapped /
5,572 with enforcement history; "amber — context, not a verdict" honesty copy intact). No feature or
design change — bug fixes only. $0 (no Claude API; SEC public data + local tooling).

**Independent verification sweep (ultracode workflow — 4 dimensions, 23 checks, adversarial verify of every non-PASS).**
Result: 20 PASS / 3 WARN; after adversarial re-verification only ONE real problem.
  - DATA CROSS-CHECKS @161k — PASS: footnotes COUNT = 161,469 == nodes.json length; AMD reference screen
    present; gunning_fog company-year panel median 19.54 over 23,592 rows (finite/plausible); enforced
    cohort 5,572 footnotes; tickers/scores plausible.
  - HONESTY INVARIANTS — PASS (one stale-string WARN, fixed below): no per-company risk/fraud composite;
    enforcement framed as descriptive context; null surfaced citing 161,469; crosswalk columns present with
    gvkey/cusip/permno honest-empty; insufficient-input financials are NULL not zero.
  - SECURITY + DEPLOY — PASS: no secrets in dist; no source maps; deploy==build (asset hash matches);
    security headers present (HSTS/CSP etc.); JSON MIME correct.
  - BUNDLE INTEGRITY @161k — WARN (housekeeping, not a defect): every shipped file < 100 MB/file cap;
    embeddings.bin = N×384 int8 aligned to nodes.json; manifest internally consistent. The WARN is ~27 MB of
    UNUSED .parquet (nodes/excerpts/neighbors) copied into dist from public/data — never fetched by the
    browser (0 refs in app/src or built JS), harmless, under cap. Recommend excluding from the web build
    (.vercelignore *.parquet or skip write_parquet_bundle for public/) but NOT a must-fix; left in place.

**BUG #3 (found by the sweep, FIXED + redeployed): stale user-facing honesty string.** The Intersect modal
CAVEAT in app/src/intersect.js:22 hardcoded "a replicated null at 94k" while the corpus is now 161,469 —
user-facing and contradicting the app's own manifest. Honest (the null was re-confirmed at the LARGER N, so
94k understates the evidence) but stale. Fixed -> "a replicated null at 161k", rebuilt (index-D3YvDkgv.js),
redeployed; live JS confirmed to contain "161k" and zero "94k". The other four "94k" occurrences are internal
code comments (LOD thresholds / file-size notes), not user-facing — left as-is.

**Final live state.** https://disclosure-atlas.vercel.app — JS index-D3YvDkgv.js (deploy==build); 161,469
nodes; cohort opens at full scale; full bulk XLSX builds 17 MB with no crash; 0 console errors; mobile 390px
clean; honesty/crosswalk intact. THREE bugs found and fixed (bulk-XLSX OOM, cohort stack overflow, stale 94k
string), all verified by actually opening the regenerated files and by an independent adversarial sweep.
C54 COMPLETE. $0 spend.

---

## C55 — FINAL COMPUTATIONAL-CORRECTNESS AUDIT (2026-07-01, $0)

**Trigger:** Josh is about to run an empirical study on the tool's outputs; requested a final audit that independently RECOMPUTES every researcher-facing value class from the raw source and confirms it matches what the tool computes/exports. No feature/functionality changes.

**Method:** 10 independent reviewer sub-agents (Beneish, Dechow, correlation, Table 1, going-concern, panel export, drift, internal consistency, build lineage, corpus coverage), each re-deriving from RAW (`atlas.duckdb`, `embeddings.npy`) and comparing digit-for-digit to the tool's actual code path (JS run in Node v24; numpy/scipy in Python). Every discrepancy adversarially re-verified by 2 further skeptics (recompute + spec/unit lens); confirmed issues reproduced a 3rd time by the orchestrator. Full report: `docs/CORRECTNESS_AUDIT_2026-07-01.md`.

**Result — VERIFIED, 0 arithmetic bugs:** Beneish M+8 comps (0 mismatches / 31,391 company-years; AMD FY2022 M=−1.1365, AQI=2.9933 exact), Dechow F+7 inputs (0/11,717), Pearson+Spearman (== scipy to 6 dp, NA never zeroed, correct company-year dedup), Table 1 (== numpy ddof=1/linear pctile to 3.6e-12), going-concern cohort (8,914 fn / 1,408 CIK / 4,291 company-years, set-identical raw↔bundle), panel export (23,592×40, 0 cell mismatches, no row cap, missing-as-NA correct), cross-view M-Score byte-identical (dist == public by SHA-256), build lineage (0 fabricated rows, NULL preserved, all counts reconcile), corpus coverage (161,469 / 0 orphans, by_type & enforced reconcile).

**Two confirmed structural caveats (NOT arithmetic bugs; both adversarially CONFIRMED + orchestrator-reproduced) — logged, NOT hot-fixed** (both would change shipped values/functionality; maintainer decision; parked in BLOCKERS.md):
- **A (drift precision):** displayed/exported `change_cosine_distance` is computed from int8 embeddings (`round(vec×127)`, bit-exact), not full precision. Error median 0.0022 / max 0.0140; 98% differ at 4th dp, 86% at 3rd; noise floor ≈0.015. Rankings preserved (Spearman 0.998). Reliable to ~2 decimals only.
- **B (panel unit collision):** `pfy=int(period_of_report[:4])` collapses 52/53-week fiscal filers → **exactly 75 of 23,592 rows (0.32%), 63 companies**, merge two 10-Ks: doubled `n_footnotes`, blended readability, `filing_date`/`accession` from earlier filing only (look-ahead breach). Full list: `docs/AUDIT_2026-07-01_collapsed_company_years.csv`. Orchestrator-reproduced exactly (75/23,592).

**One data-property warning (study-critical, not a defect):** Beneish M / Dechow F produce genuine near-zero-denominator outliers (M up to ~1.9M) that dominate mean/SD/Pearson (Table 1 M mean≈218, SD≈20,472; Pearson(M,DSRI)=0.999996 vs Spearman 0.349). Researcher must use median/IQR + Spearman or winsorize.

**Dismissed as FALSE_ALARM by adversarial verify:** Table 1 "full precision" vs 2dp/4dp rounding — the tool is exact over the (rounded) data it loads; a documentation nuance, not a computation error.

**Actions taken:** wrote `docs/CORRECTNESS_AUDIT_2026-07-01.md` (single report), `docs/AUDIT_2026-07-01_collapsed_company_years.csv` (75-key exclusion list), two BLOCKERS entries. Zero source-code changes (no genuine computational bug existed to fix; both structural items are maintainer/scope decisions). $0 spend.

---

## C56 — SYSTEMATIC SCREEN: pre-registered multiple-hypothesis screening (integrity-first flagship). Built, double-verified, LIVE. $0.

**Decision.** Build the flagship "AI-accelerated but honest research" feature: a systematic screen that
tests the association between every selected disclosure-language measure (Gunning Fog, distinctiveness,
optional footnote count) and every selected financial-quality measure (Beneish M + 8 components; Dechow
F + 7 inputs) across pre-specified subgroups (full cohort · enforcement status · 5-year filing-year
buckets · SIC industry), computed in-browser over the company-year panel (`buildPanel`; pairwise
deletion; missing never zero-imputed). New module `app/src/screen.js` + `#screenModal` + `.sc-*` styles
+ command-bar `⌗ SYSTEMATIC SCREEN`; composes with all filters and the shareable-cohort pattern (`v=sc`).
Live at https://disclosure-atlas.vercel.app.

**The safeguards ARE the feature (structural — no code path can bypass them):**
1. **Pre-registration.** The full test family is enumerated (deterministic order) and REGISTERED —
   UTC timestamp, cohort definition, spec, SHA-256 of the canonical spec + family — BEFORE any test
   statistic is computed (`runFamily` runs only after the record is written). Deterministic inclusion
   rule (pairwise N ≥ 30, non-constant) applied at enumeration; every excluded candidate is listed with
   its reason in the UI and the export. Client-side registration log (localStorage, last 50).
2. **Full reporting.** Every registered test is always in the table and the CSV; column sorting is the
   only view control (aria-sort, keyboard-operable) — there is no filter/threshold/hide affordance at
   all. Default order = registration order. CSV header declares "THIS FILE CONTAINS ALL OF THEM".
3. **Mandatory correction.** Bonferroni AND Benjamini–Hochberg FDR across the whole family; raw p,
   Bonferroni p, FDR q per test; α = 0.05 is a const. No toggle exists.
4. **Honest labeling.** Survivors: "candidate association — warrants confirmation on independent data"
   (cool cyan tag) — never "finding"/"discovery". Prominent exploratory-not-confirmatory caveat +
   one-screen-one-correction warning (re-screening and reporting the interesting one rebuilds the
   multiple-comparisons problem).
5. **Effect size beside significance.** Spearman ρ next to every p (sortable by |ρ|), with the
   significance ≠ practical importance note.
6. **Robust methods.** Spearman rank statistics only, per the C55-documented extreme financial-score
   outliers that invalidate mean/Pearson. Two-sided p via the t approximation (Lanczos log-gamma +
   continued-fraction incomplete beta) — same approximation scipy/R use at these N.

**Verification (double).** (a) My Node+scipy harness on the shipped data: Spearman ρ + p digit-for-digit
vs scipy 1.18 (incl. min-p and max-|ρ| tests); Bonferroni exact; BH q == scipy.false_discovery_control;
survivor flags exact. Known R cross-check REPRODUCED: going-concern-cohort Beneish~Dechow **ρ=0.1013,
p=0.00275, N=872** (target ρ≈0.101, p≈0.003); full-panel M~F ρ=0.1490, p=2.5e-32, N=6,242. Default
full-cohort screen: 34 pairs × 362 subgroups = 12,308 candidates → **2,890 tests, 43 FDR survivors,
21 Bonferroni**. My Playwright suite (~50 checks, local + LIVE): full family always rendered under every
sort; zero hide controls; CSV = prereg header (full sha-256) + all 2,890 tests + all 9,418 exclusions;
honest labels; 0 forbidden words; regressions (cohort/Table 1/correlations/data table) clean at 161k;
0 console errors; mobile 390px no overflow. (b) **Independent injection-hardened adversarial reviewer:
PASS on all 6 dimensions, no CRITICAL/HIGH/MEDIUM defects** — re-derived every reference number with its
own code (stats to ~1 ulp incl. p=4e-148 tails; all 12,308 pairwise Ns independently reproduced; 0
enumeration mismatches), tried and failed to hide tests via UI/JS/export, recomputed the SHA-256 from the
spec (exact match), confirmed corrections have no disable path, honesty audit clean (survivor tag =
--accent-cool; no amber; "finding" only inside the explicit negation). Reviewer's LOW/INFO items fixed:
crypto.subtle fallback now states "unavailable (requires a secure context)" instead of failing silently;
hash displays lowercase (`.sc-hash` opts out of the header uppercase transform); leftover temp test file
removed.

**Docs.** DESIGN_SYSTEM.md (new "Systematic screen" section — colour discipline: survivors cyan, green
only on the REGISTER action, amber never), methodology panel paragraph, methods bundle section (formulas,
safeguards, scipy verification note) + Benjamini-Hochberg 1995 and Spearman 1904 citations.

**Deploy note (operational).** Vercel CLI 54 binds path-argument deploys to a project named after the
folder: `vercel deploy --prod dist` auto-created a stray "dist" project on the first attempt. Fixed by
linking app/dist to the disclosure-atlas project and deploying from inside it; the stray project was
deleted via the API (204; its alias now 404s) so no orphaned public copy remains. Live deploy verified:
alias 200, bundle index-D39Ch1sP.js == local build, CSP/HSTS/nosniff/X-Frame intact, full Playwright
suite re-run green against production.

**Honesty (held).** Descriptive/exploratory framing only; no composite or risk score; correction cannot
be disabled; cherry-picking impossible by design; all existing features and honesty copy intact.
**$0 spend** (in-browser statistics on existing data; no generation). Anthropic total unchanged at
$0.355 / $25.
