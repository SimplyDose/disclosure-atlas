# DESIGN_SYSTEM.md — Disclosure Atlas

This file is the **contract** that prevents AI-slop UI. Both Claude Design and Claude Code implement against these tokens exactly. Do not invent colors, fonts, spacing, or motion outside this file. If a new token is needed, add it here first and log it.

---

## Design thesis

**A financial-data terminal for the public markets — calm, orderly, institutional.** The interface is a *Bloomberg-Terminal-class instrument*, not a web app: dark, near-black, monospace-forward, data-first, framed into panels. But it is **composed, not cramped** — FASB's orderly whitespace and Linear/Vercel-grade craft applied within the dark terminal: a deliberate spacing scale with real breathing room, soft layered surfaces (semi-transparent hairlines + subtle shadows, not hard lines everywhere), gentle consistent radii, and clear typographic levels. The constellation is the centerpiece, framed like a calm data panel. Premium reads here as *precise, orderly, expensive, trustworthy* — the instrument an accounting professor or auditor immediately trusts.

**Terminal colour language:** amber/orange (also our enforcement signal) + a terminal green for data/active accents + a cyan-blue for the user's selection, all on near-black. Monospace (JetBrains Mono) dominates — data, labels, headers, readouts, even the headline; a clean sans (IBM Plex Sans) carries only running prose where readability needs it.

Reference anchors: Bloomberg Terminal, a trading desk, a scientific data console. NOT generic fintech SaaS, NOT dribbble gradients, NOT a spacious marketing layout, NOT cyberpunk neon/scanlines (we stay authoritative and restrained, not flashy).

## The signature element

The **constellation map** is the one memorable thing. Spend all boldness here; keep everything else quiet. It renders the *real* embedding structure (clustered nodes, dense cores, lonely outliers) as points of light on a dark field behind a faint polar/coordinate grid. Enforced companies glow amber. This is not decoration — every point is a real footnote; positions are real UMAP coordinates. Honesty is the aesthetic.

## Color — refined dark terminal palette (premium / calm / institutional pass)

Refined off the harsh pure-black-and-hard-borders look toward considered neutrals with subtle depth — soft semi-transparent hairlines + layered shadows do the separating, not hard lines everywhere.

```
/* Surfaces — refined neutral darks, lifted, subtle depth */
--term-black        #0B0D12   /* chrome bars / panel headers — soft premium dark (was #000) */
--field-void        #060708   /* canvas field (near-black; lets the star-field read) — kept */
--field-base        #10131A   /* panel surfaces — lifted, calm (was #0B0D10) */
--field-raised      #181C25   /* raised cells / hover */
--field-inset       #0C0E13   /* recessed data wells — soft, not pure black (was #000) */
--border            #242A35   /* defined frame border — used sparingly (was harsh #2A2F38) */
--border-soft       rgba(255,255,255,0.06)  /* PRIMARY inner hairline — soft, premium */
--grid-line         #1E2A38   /* the canvas polar grid + faint legacy hairlines */
--node-dim          #3A4656   /* star-field — kept (load-bearing constellation identity) */
--node-base         #8A97A8
--node-bright       #DCE3EC
--ink-primary       #ECF1F7   /* primary readout / headings */
--ink-secondary     #AEB7C4   /* prose / secondary — LIFTED for readable body (was #9AA7B6) */
--ink-tertiary      #8893A2   /* captions, supporting */
--ink-faint         #5E6876   /* labels, ticks, metadata */
/* Terminal signals */
--signal-amber      #E0A04A   /* ENFORCEMENT history / severity — semantic, never decorative (EXACT) */
--signal-alert      #C8553D
--term-green        #4DBE7A   /* data / active-control / positive accent — UI semantics, NOT a company judgment */
--accent-cool       #5BA4DD   /* the user's active selection / query (cyan-blue) */
/* Tinted surfaces + halos */
--accent-tint #11202D ; --accent-line #2A4258
--green-tint rgba(77,190,122,0.11) ; --green-line rgba(77,190,122,0.40)
--amber-tint rgba(224,160,74,0.10) ; --amber-line rgba(224,160,74,0.40)
--accent-glow rgba(91,164,221,0.22) · --green-glow rgba(77,190,122,0.26) · --amber-glow rgba(224,160,74,0.28)
```

**Rules:** **amber** = enforcement/severity context **only** (kept EXACT — protects the honesty guardrail). **green** is a UI/data accent (active filters, sliders, the cosine bar, live readouts) — never "this company is good/safe"; no company judgment. **cyan** (`--accent-cool`) marks the user's own selection/query. **`--border-soft`** (a 6%-white hairline) is now the primary divider — soft and premium; the harder `--border` is reserved for the few defined frames. Separation comes from **soft hairlines + layered shadows**, not hard lines everywhere. The star-field node colors + cyan accent are mirrored as literals in `constellation.js`/`panel.js`; the near-black void in `constellation.js` + favicon — keep in sync.

## Financial-quality pillar (Chapter E) — the second pillar, native to the instrument

A company now has BOTH its disclosure language (words) and its financial-quality **screens**
(numbers). The financials surface lives inside the finding panel as a dedicated **pillar** below the
disclosure lenses (`.fin-pillar`, separated by a `--border-soft` top rule), plus a compact
micro-readout (`.co-fin`, `M −1.14▲ · F 1.30`) under each company in the two-company tile.

- **Component-first tiles (`.fin-tile`):** each model (Beneish M-Score 1999; Dechow F-Score 2011)
  is a soft-bordered, `--elev-card`, `--r-md` data tile (fundamentals-tile style) — big mono score
  (`--ink-primary`), the academic **citation** (IBM Plex Sans, `--ink-tertiary`), and the FULL
  **component breakdown** (`.fin-grid`: labels `--ink-faint`, mono values right-aligned). The single
  largest driver is **subtly emphasized** (brighter ink + weight 600 + a small `▲` in `--accent-cool`)
  — never by color alone, never by an alarm color. A multi-year `M BY FISCAL YEAR` mini-history
  (`.fin-hist`) gives the time dimension; the focal year is marked in `--accent-cool`.
- **Colour rule (strict):** scores use **neutral/cool only**. The above-threshold pill (`.fin-pill`)
  is a quiet `--accent-line`/`--accent-cool` outline, NOT amber, NOT red — **amber stays
  enforcement-context only**; no alarm/red ever implies guilt. Green stays data-accent.
- **Honesty, as a feature (`.fin-honesty`):** a prominent cool-bordered note — these are
  established, cited academic **screens, not verdicts, not our judgment**, shown with published
  limitations; and this dataset **cannot re-validate** them (XBRL ~2009 vs mostly pre-2009 cases;
  enforced/clean don't separate in-sample) so the signal basis is the literature. Insufficient
  inputs render `no score · insufficient data` (never a blank that reads as zero); degenerate
  outliers (|M|>10, F>20) are annotated `≫` as real formula outputs, not meaningful magnitudes.
- **Data:** `app/scripts/build_scores.py` joins `accounting_scores`/`financials` (Chapter D) →
  per-node `pfy`/`ms`/`fs`/`mflag` in nodes.json (for the synchronous score **filter** `#scoreSel`
  + micro-readout + quick header) and a lazy `scores.json` keyed by CIK (full components for the
  panel breakdown, multi-year history, and the M/F + component **export** columns). Run after
  `build_app_data.py`.

## Company profile — the unified two-pillar view (centerpiece research workflow)

One composed, scannable view of everything the instrument knows about a single company, reached by
clicking any **company name** (finding panel two-company cells become `.co-name-btn`) or the shareable
permalink **`#c=<CIK>`**. Implemented as a large modal (`.profile-card`, `min(1080px,96vw)`, scrolls)
reusing the modal infra (inert / ESC / click-out). Module `app/src/profile.js` (`Profile` class),
built entirely from existing data — no ingestion.

- **Header (`.pf-head`, sticky):** company name (Space-Grotesk/mono, 19px), `CIK · SIC · industry`
  (mono, `--ink-faint`); an **enforcement badge** (`.pf-badge`, **amber** — the one place amber is
  right, it's enforcement context) with AAER numbers, or a quiet neutral "no enforcement" pill.
- **Two pillars side-by-side (`.pf-grid`, 1-col on mobile ≤760px), divided by `--border-soft`:**
  - **Disclosure pillar:** every footnote grouped by type (`REV-REC · n …`), each row = FY + Gunning
    Fog (vs-industry word) + distinctiveness (vs-industry word) + an **`open ↗`** that loads it in
    the finding panel and locates it on the constellation; plus **nearest companies by disclosure
    language** (aggregated cross-company neighbors, each opens that company's profile).
  - **Financial pillar:** an **M / F by fiscal year** master table (`.pf-fy-list`) — click a year to
    expand its full component breakdown (reuses the finding panel's `yearTilesHTML`); above-threshold
    M is marked with a **cool `▲` (never red/amber)**; outliers `≫`; no-score years honest; a company
    with zero computable years shows the concise "no sufficient inputs" message; the financial
    honesty note (screens-not-verdicts / cannot-re-validate / literature-based) is always present.
- **Exportable + citable:** the whole profile → CSV/XLSX (every footnote × all disclosure + financial
  columns) and a company-level **cite** (name, CIK, SIC, footnote/type/year coverage, scored years,
  enforcement-as-context, EDGAR company link, retrieval date, resemblance-only/screens-not-verdicts
  disclaimer).
- **Peer benchmarking (`.pf-peer`, full-width, above the two pillars):** answers "is this company
  typical or unusual for its industry?" — for the company vs its **SIC-industry peers** (same
  `node.ind`), one scannable `.pf-cmp` row per measure (Complexity·Fog, Distinctiveness, Beneish M,
  Dechow F): the company's representative value (median across its disclosures / scored years), the
  **industry median**, and a **position bar** (`.pf-bar`: IQR band + median tick + a cool `●` marker
  at the company's value) with a descriptive phrase + percentile ("more complex than its industry's
  median · ~70th percentile of N peers" / "typical for its industry"). Computed in-browser from
  existing data (no ingestion). Honest: descriptive/comparative only — "higher/lower/typical vs the
  industry median", **never** "outlier of concern" or any individual judgment; <5 peers → no
  comparison; company with no score → "no score · industry median for context"; a one-line caveat
  states position is descriptive context, not a verdict; M/F carry the screens-not-verdicts /
  cannot-re-validate framing. Marker/band are cool/neutral (`--accent-cool` / `--field-raised`).
- **Colour discipline unchanged:** amber = enforcement only; scores/flags/peer-markers cool/neutral;
  no alarm/red, no per-company "our" score or guilt-implying ranking.

## Cohort / batch analysis — group-level research panel

The cohort **is the current filter set** (industry/SIC, type, year range, complexity/distinctiveness
tiers, enforcement, financials/M-flag, similarity) — "▤ ANALYZE COHORT" in the command bar opens
`#cohortModal` (`.cohort-card`) computing **aggregate statistics** over `engine.filteredIndices()`
in-browser. Module `app/src/cohort.js` (`Cohort` class); reuses existing data only.

- **Header + KPIs:** the cohort definition (from the active filters) + a 4-cell KPI strip
  (footnotes · companies · footnote types · filing years).
- **Disclosure pillar:** complexity (Gunning Fog) and distinctiveness summary stats (median · IQR ·
  range) with compact **histograms** (neutral `--node-base` bars — a data color, never an alarm),
  vs-industry tier counts, and **embedding clustering** = exact mean intra-cohort cosine vs the
  all-population baseline (computed O(N·dim) from the int8 buffer via the centroid identity
  `Σᵢ≠ⱼ uᵢ·uⱼ = ‖Σu‖² − Σ‖u‖²`; the all-population cohort correctly reads "about as clustered as the
  population"). Needs embeddings.bin (lazy) — fills in progressively after a "computing…" state.
- **Financial pillar:** M-Score and F-Score distributions **deduped to distinct company-years**
  (scores are per company-year, not per footnote) — median · IQR · range, **% above threshold**
  (group stat, descriptive), histograms (outliers clamped to a sane window; the true min/max stays
  in the range line). The screens-not-verdicts / cannot-re-validate honesty note is always present.
- **Export + cite:** the whole cohort → CSV/XLSX (reuses the bulk filtered-set builder — both
  pillars' columns) and a **cohort cite** (the definition + counts + retrieval date + an
  aggregate-descriptive / screens-not-verdicts disclaimer) for reproducibility.
- **Honesty/colour discipline:** aggregate/descriptive ONLY — statistics describe the group, never
  judge or rank an individual company; amber stays enforcement-only; histogram + score treatments
  are cool/neutral; no "our risk score". 2-col on desktop, single column on mobile.

## Descriptive intersection (Phase 5) — multi-measure starting points (honesty-forward)

The command-bar `⊕ INTERSECT` opens `#intersectModal` (module `app/src/intersect.js`): a researcher
selects which INDEPENDENT descriptive measures to intersect and sees the companies meeting ALL of them,
**with each measure shown separately**. $0 (existing data; embeddings lazy-loaded only if the change
criterion is used). Composes with the active filters (candidate pool = `engine.filteredIndices()` ciks).
- **Measures (toggles):** distinctiveness tier (distinctive+/highly, from `node.dvi`), Beneish M-Score
  above the −1.78 published threshold (`node.mflag`; components from scores.json), enforcement-heavy
  industry (top-quartile SIC enforcement rate among industries ≥5 companies — a descriptive industry
  fact), year-over-year disclosure change ≥ threshold (Phase-4 measure).
- **Per-company card:** company name (→ profile) + an `enforcement history` tag (amber, context only) +
  each selected measure on its own labeled line (`.ix-m`): distinctiveness tier + cosine, M-Score + the
  8 Beneish components, the industry's enforcement context, the max year-over-year change. Listed
  **alphabetically** — never ranked. Export = each measure a SEPARATE column (CSV), plus cite.
- **HONESTY (the point of the feature):** NO composite/combined score — measures are never summed or
  multiplied into a risk index. NOT a risk score / fraud screen / ranking of suspicion / prediction.
  A prominent, unavoidable `.ix-caveat` banner states this; co-occurrence is descriptive context, never
  evidence of wrongdoing; the replicated null + cannot-re-validate caveats are restated. Cool/neutral
  only (`--accent-cool` checkboxes, no bars-as-severity); amber is the enforcement tag only; no alarm
  colors; no "suspicious/concerning/anomalous/flagged-as-risk" language anywhere.

## Disclosure shifts (Phase 4) — year-over-year change / discovery

A finding-generator that surfaces the largest YEAR-OVER-YEAR change in disclosure LANGUAGE across the
corpus, from the existing embeddings ($0). Module `app/src/changes.js` (lazy `ensureChanges` over the
int8 buffer; `Changes` modal class; `timelineHTML` for the profile; `changesForCik`).
- **Measure:** for each company + footnote type, cosine DISTANCE (1 − cos) between that company-type's
  principal (longest) excerpt embedding in consecutive available fiscal years. Computed once, cached.
- **Ranked list** (`#changesModal`, command-bar `⇌ DISCLOSURE SHIFTS`): scannable rows — rank, company,
  type, FYa→FYb, a neutral magnitude bar (`.cx-ev-fill`, `--node-base`), the value, and `open ↗`.
  **Composes with every existing filter** by requiring both endpoint excerpts to be in
  `engine.filteredIndices()`. Export (CSV, carries `change_cosine_distance`) + cite.
- **Before/after:** `open ↗` reuses the compare view, prefilled with the two years' excerpts and the
  PRECOMPUTED cosine (so the shown number equals the ranked magnitude exactly — no re-embed drift).
- **Profile timeline** (`.pf-timeline`): per-type rows of neutral bars (one per year-over-year
  transition), labeled by year, click-to-compare.
- **Honesty (critical):** strictly DESCRIPTIVE — "largest year-over-year change in disclosure
  language." A large shift is NOT a red flag, not suspicious, not predictive (the replicated null
  stands). Cool/neutral only (bars `--node-base`); amber stays enforcement-only; one-line caveat on
  every surface. No "concerning", no alarm.

## Research panel export (Phase 3) — analysis-ready dataset for Stata/R

The cohort view (the defined sample) carries a "RESEARCH PANEL EXPORT" section (`.ch-panelx`) below the
two pillars: a calm bordered block with the section header, a plain-language `.ch-px-note`, and a single
`⤓ PANEL DATASET (.zip)` action chip. Built entirely in-browser from existing data ($0).
- **Unit of observation:** company-fiscal-year (one row per company per fiscal year). Modules:
  `app/src/dataset.js` (one `COLS` registry → CSV header + codebook + Stata/R snippets, no drift) and
  `app/src/zip.js` (dependency-free store-only ZIP writer with CRC32). `app/public/data/tickers.json`
  (cik→ticker, generated by `build_scores.py`) supplies the ticker identifier; CIK stays the primary key.
- **Bundle (.zip):** `panel.csv` · `codebook.md` (data dictionary: name/definition/units/source/date-basis,
  with an identifiers-&-joining preamble) · `import_panel.do` (Stata) · `import_panel.R` (readr) ·
  `import_panel.py` (pandas) · `JOINING.md` (merge-on-CIK + CIK→GVKEY/PERMNO/CUSIP recipes +
  point-in-time caveat) · `CITATION.txt` · `SAMPLE_SELECTION.txt` · `README.txt`. Full identifier
  crosswalk (CIK/ticker/name/sic_code/sic_industry resolvable; gvkey/cusip/permno honest-NA, never
  fabricated), point-in-time `filing_date`, disclosure measures + financial screens (+components) per
  company-year, **missing as empty NA, never zero**. See "Identifier crosswalk + copy-as-code import".
- **Honesty (carried, unchanged):** M/F are cited academic screens with limitations + the
  cannot-re-validate caveat; disclosure measures are descriptive; the replicated null is referenced;
  no "risk score", no judgment column (`enforced` is descriptive context only).

## Data table — the panel as a sortable, virtualized grid (researcher-native tabular view)

A command-bar action (`▦ DATA TABLE`) opens the current cohort's company-year panel as a grid
(`app/src/table.js`, `.dt-*` classes, `.table-card` ~1240px). It is an **interface to existing data**:
rows are `buildPanel()` and columns are `PANEL_COLS` (shared with the .zip), so the table is a *live
preview of exactly what "Download this view" exports* — it cannot drift from the export.
- **Structure:** a `.dt-bar` (row count + `▦ COLUMNS` picker + `⤓ DOWNLOAD THIS VIEW (.zip)`), the
  honesty banner (`.dt-honesty`), then `.dt-grid` = a fixed-width-column grid with a separate sticky
  `.dt-head` (horizontal scroll synced to the body via `translateX`) over a virtualized `.dt-bodyscroll`
  (windowed rows at `ROW_H` 30px + overscan → smooth at thousands of rows; only ~30 rows in the DOM).
- **Interaction:** click a header to sort (▲/▼), toggle columns (grouped Identifiers / Disclosure /
  Financial / Context, persisted to `localStorage`), click a row → that company's profile.
- **Honesty (load-bearing):** descriptive columns only — **no composite/risk column exists**; NA is a
  muted `.dt-na`, never zero; sorting by the M/F screen is described as ordering a descriptive measure,
  **not** a suspicion ranking; the cited-screens + cannot-re-validate caveat sits visibly above the grid;
  **amber (`.dt-enf`) appears ONLY on the enforcement-context cell** — every other cell is neutral
  (`--ink-secondary`, tabular figures). The grid must never read as a "most-suspicious" leaderboard.

## Table 1 — publication-style descriptive statistics (the academic opener)

A command-bar action (`Σ TABLE 1 · DESCRIPTIVES`) opens the standard "Table 1" every empirical paper
opens with, for the active cohort (`app/src/table1.js`, `.t1-*` classes, in a `.cohort-card`). One row
per measure × columns `N · Mean · Median · SD · Min · P25 · P75 · Max` (sample n−1 SD, interpolated
percentiles), grouped into **Disclosure measures** and **Financial-quality measures**.
- **Unit handling (cross-checked, load-bearing):** disclosure measures (Gunning Fog, distinctiveness)
  are summarised at the **footnote** level; footnotes-per-company at the **company** level; the Beneish
  M-Score (+8 components) and Dechow F-Score (+components) at the distinct **company-year** level —
  deduplicated by `cik|pfy`, never footnote-duplicated, read from `scores.json` for full precision. Each
  row states its unit; a note restates it. **N = non-missing count; zeros are never imputed.**
- **Style:** monospace tabular figures, right-aligned numerics, a **frozen first (measure) column**
  (sticky `left:0`) and sticky header so it stays legible while scrolling; calm/neutral throughout —
  **no amber** (no enforcement cell here), no scores/ranking/judgment.
- **Export:** `↓ CSV` and `⧉ COPY (for paper)` — a titled, tab-separated table (drops into Excel/Word/
  Sheets) that carries the cohort definition, N, the unit note, and the descriptive + cited-screens +
  cannot-re-validate caveat, so context travels with the numbers.

## Share cohort — reproducible sample definitions via URL

A command-bar action (`⧉ SHARE COHORT`) captures the full active filter set (the cohort = the sample)
as a clean URL that reconstructs the EXACT cohort on a fresh load — same filters, same count — for
collaboration, robustness checks, and referee reproducibility, without accounts. Module
`app/src/share.js` (`.sh-*`, `.share-card`), `#cohort=<token>` permalink, `window.__atlas.share`.
- **Encoding:** only the non-default filters are serialised (industry as its `manifest.industries`
  index for compactness) → minimal JSON → **base64url**. Decoding is defensive: any malformed token
  returns null and is **ignored** (graceful degrade — never throws, app still loads "all").
- **Reconstruction reuses existing logic:** on load, `applyCohortMin` sets the real `<select>` / slider
  / toggle controls and dispatches their native events, so the *same* `engine.setFilter` path runs —
  the link round-trips losslessly (open it → identical filters + identical filteredIndices count).
- **Pairs with the views:** an optional `v` field (`t1` / `dt` / `ch`) opens Table 1 / the data table /
  cohort analysis directly on the shared sample; the Share modal and the in-context buttons in Table 1
  and the Data Table offer "copy link", "→ Table 1", "→ Data table".
- **Transparency:** the Share modal shows the human-readable cohort definition (line per filter) + N
  (footnotes / company-years / companies), so a referee sees exactly how the sample was built.
- **Honesty / style:** a cohort link is a descriptive **sample definition** — no scores/ranking/judgment;
  the caveat carries the cited-screens + cannot-re-validate note where financial measures appear.
  Neutral throughout; **no amber** (a sample definition is not an enforcement signal).

## Correlation matrix — the pre-modeling association check

A command-bar action (`⊞ CORRELATIONS`) computes pairwise correlations across the numeric measures for
the active cohort (`app/src/correlation.js`, `.cr-*`, in a `.cohort-card`). Computed over the
**company-year panel** (`buildPanel`) so every variable shares one unit: disclosure measures aggregated
to company-year, the financial screens already per distinct company-year (deduped). 10 variables:
Gunning Fog, Distinctiveness, Footnotes(n), Beneish M + key components (DSRI/GMI/AQI/SGI/TATA), Dechow F.
- **Methods:** `PEARSON | SPEARMAN` toggle (rank correlation via fractional-rank transform) and
  `PAIRWISE | LISTWISE` deletion toggle. Pairwise (default) uses, per coefficient, the company-years
  where both measures are present (N varies per cell — shown on hover); listwise uses the common
  complete-case set. **Missing is never zero-imputed**; N is stated (cohort N + pairwise range / listwise N).
- **Colour rule (load-bearing honesty):** cells shade by **|r| (magnitude) in a single neutral cyan
  hue**; the **sign lives only in the digits** — **NEVER red/green good-bad, NEVER alarm colours**. The
  diagonal is a faint neutral fill. Frozen row headers + sticky column headers; tabular figures.
- **Export:** `↓ CSV` — a coefficient matrix + a pairwise-N matrix, labeled with the cohort definition,
  method, unit, and N. Composes with filters and the shareable-cohort pattern (`v=cr` opens it; the
  Share modal offers a `⧉ CORRELATIONS` link; an in-modal `⧉ SHARE COHORT` button copies that link).
- **Honesty:** purely descriptive — correlations describe linear/rank association in this sample, not
  causal, not a judgment, sample-specific; the cited-screens + cannot-re-validate caveat travels with
  the financial measures. Neutral; no amber.

## Systematic screen — pre-registered multiple-hypothesis screening (integrity-first)

A command-bar action (`⌗ SYSTEMATIC SCREEN`) opens `#screenModal` (`app/src/screen.js`, `.sc-*`,
`.screen-card` ~1180px): a researcher defines a test family — disclosure measures × financial
measures × pre-specified subgroups (full cohort · enforcement status · 5-year filing-year buckets ·
SIC industry) — and the tool enumerates, registers, runs, and reports the COMPLETE family with
mandatory correction. **The integrity safeguards are the feature and are structural (no code path
exists to bypass them):**
- **Pre-registration:** the define view live-previews the full enumerated family ("P pairs × G
  subgroups → C candidates · M enter the family"); `⊜ REGISTER & RUN` records timestamp, cohort
  definition, spec, and a SHA-256 of the canonical spec + family BEFORE any test statistic is
  computed. The deterministic inclusion rule (pairwise N ≥ 30, non-constant) is applied at
  enumeration; excluded candidates are listed with reasons (in a `<details>` and in the export),
  never silently dropped. A client-side registration log (`localStorage`, last 50) shows every
  screen registered in this browser. Once registered, the header pins the REGISTERED cohort.
- **Full reporting:** the results table always contains every registered test; headers sort
  (aria-sort, keyboard-operable), nothing filters or hides. Default order = registration
  (pre-specified) order. The CSV export carries a reproducible pre-registration header
  (timestamp, SHA-256, cohort, spec, m, "THIS FILE CONTAINS ALL OF THEM") + all tests + all
  exclusions.
- **Mandatory correction:** Bonferroni AND Benjamini–Hochberg FDR across the whole family; raw p,
  Bonferroni p, and FDR q shown per test; fixed α = 0.05; no toggle exists.
- **Honest labeling:** survivors get a cool `--accent-cool` tag "candidate†" with the full label
  "candidate association — warrants confirmation on independent data" — NEVER "finding"/"discovery".
  A prominent caveat states exploratory screening generates hypotheses, not conclusions.
- **Effect size beside p:** Spearman ρ column (sorts by |ρ|), with the significance ≠ importance
  note. **Robust methods:** Spearman rank statistics only (the C55 audit documents extreme
  financial-score outliers that invalidate mean/Pearson).
- **Colour discipline:** survivors cyan (selection/candidate semantics), never green/amber/red — no
  alarm colour ever implies a judgment. Green appears only on the single primary REGISTER action
  (active-control semantics). Unit: company-year panel (`buildPanel`), pairwise deletion, missing
  never zero-imputed. Stats verified digit-for-digit against scipy. Composes with filters and the
  shareable-cohort pattern (`v=sc`).

## Identifier crosswalk + copy-as-code import (the merge-friction killer)

The single most-hated step in empirical accounting research is wrangling/merging the data into an
existing database. The instrument eliminates it: the data arrives already joinable and already
loadable, so a researcher spends zero manual effort.

- **Identifier crosswalk — every export and every MCP payload.** Each row carries every *resolvable*
  identifier as a clean column: zero-padded 10-digit **CIK** (the universal join key), **ticker**,
  **company_name**, **sic_code**, **sic_industry**, **accession**. Driven from the one column registry
  (`dataset.js COLS` ⇄ `mcp/cohort.py CODEBOOK`) so the CSV, codebook, snippets, table, and MCP can
  never drift. Footnote-level exports (filtered/shortlist/finding) share the crosswalk via
  `app/src/identifiers.js` (`XWALK_HEADERS` / `xwalkCells`).
- **Honest-NA for licensed identifiers.** `gvkey` (Compustat), `cusip`, `permno` (CRSP) require
  licensed sources this project does not hold. They ship as **named, empty (NA) columns — never
  fabricated** — so the researcher knows exactly where to drop them in after mapping from CIK. The
  codebook/methods/JOINING note state this plainly. *Never invent an identifier* is a load-bearing
  honesty rule alongside "no risk score".
- **Copy-as-code import snippets.** A `⧉ COPY IMPORT CODE` action on the Cohort and Data-table views
  opens `importModal` (`app/src/importcode.js`, `.ic-*`, in a `.cohort-card`): segmented
  `STATA · R · PYTHON` tabs (same control language as the correlation matrix `cr-seg`), a read-only
  terminal-styled code block (`.ic-code`, neutral, accent left-border), one `⧉ COPY CODE` button, and a
  `JOINING THIS DATA` note. Each snippet **actually loads the exact `panel.csv`** — Stata
  `import delimited` + `stringcols(_all)` + destring + `xtset`; R `readr::read_csv` with explicit
  `col_types`; Python `pandas.read_csv` with `dtype` (CIK as string → leading zeros survive),
  `parse_dates`, NA preserved. Generated from `COLS` (`stataSnippet`/`rSnippet`/`pySnippet` in
  `dataset.js`) so they can never drift from the file; the same three travel inside the panel `.zip`
  alongside `JOINING.md`.
- **Styling:** calm/neutral, no amber (descriptive research data, no enforcement signal). Tabs reuse
  the segmented-control idiom; code surface uses `--field-inset` + a single accent left-border; the
  joining note uses the same inset-card + cyan-bullet language as the share/def lists.

## Unified label / header / title hierarchy (holistic consistency pass)

Three deliberate text levels, applied identically across EVERY surface (finding panel, company
profile, peer comparison, cohort analysis, financial pillar, methods bundle, filters, header):

1. **Overlay title** (the panel/modal's own name — FINDING · COHORT ANALYSIS · METHODS): mono, 11px,
   weight 600, letter-spacing 2.5px, uppercase, `--accent-cool`. One shared rule for
   `.panel-title` / `.ch-title` / `.mb-title`.
2. **Section / pillar header** (DISCLOSURE PILLAR · FOOTNOTE EXCERPTS · CORPUS DEFINITION …): mono,
   10px, weight 600, letter-spacing 1.6px, uppercase, `--accent-cool`. ONE shared rule for
   `.section-label` (finding panel) == `.pf-pillar-h` == `.ch-pillar-h` == `.mb-h`. Previously the
   finding panel's section headers were faint while the other surfaces' were cyan — now identical.
3. **Eyebrow / caption** (QUERY · DISCLOSURE SIMILARITY · FISCAL YEAR …): mono, 9.5px, weight 500,
   letter-spacing 1.6px, uppercase, `--ink-faint`.

Other consistency rules tightened in this pass:
- **Colour discipline (verified):** `--signal-amber` is ENFORCEMENT-ONLY (enforcement badges/pills,
  the enforced filter toggle, the enforced stat). The methodology validation/null callout
  (`.method-finding`) was the lone exception — recoloured to the cool callout treatment
  (`--accent-line` left rule + `--field-inset`), matching `.fin-honesty`. `--accent-cool` = selection
  / query / section headers; `--term-green` = data/active-control; scores & position markers stay
  cool-neutral; no alarm/red.
- **Hover states:** chrome cells (`.sb-key`, `.search-go`, `.seg-btn`, `.select`) all lift to
  `--field-raised`; bordered action chips (`.act-btn`, `.preset`, `.icon-btn`) all use
  `--accent-tint` + `--accent-line`. (Removed an ad-hoc translucent-cyan hover on the chrome keys.)
- **Lens-tile metric** sized consistently: `.fin-tile-val` aligned to 22px to match `.cx-fog`.

## Methods & reproducibility bundle — the citable resource

A comprehensive, downloadable methods document makes the tool citable in academic work. Module
`app/src/methods.js` holds **one content model** (`sections(manifest, findings)`) that renders BOTH
the in-app panel (`renderMethodsHTML`) and the downloadable Markdown (`buildMethodsMD`) — so the page
and the file never drift. All numbers come from `manifest.corpus` / `manifest.validation` /
`manifest.financials` (the financial-coverage block is injected into the manifest by
`app/scripts/build_scores.py`, so they're data-driven and cross-checkable).

- **Dedicated panel `#methodsModal`** (`.methods-card`, sticky `.mb-head` with a prominent
  "↓ DOWNLOAD (.md)") reached from the Methodology modal's "↗ full methods & reproducibility" button
  and the shareable permalink **`#methods`**. Premium calm-terminal styling: cyan section headers
  (`.mb-h`), readable IBM-Plex prose (`.mb-body p`), mono formula blocks (`.mb-pre`), and tidy data
  tables (`.mb-tbl`, fixed layout, wraps on mobile).
- **Sections (10):** Overview · Corpus definition (+counts table) · Disclosure-pillar methods
  (embedding/similarity/UMAP params + Gunning-Fog formula + distinctiveness definition + BM25) ·
  **The replicated null** (per-type Cohen's d table, stated plainly, surfaced as a feature) ·
  Financial-pillar methods (Beneish + Dechow **formulas**, the **XBRL tag-mapping table**, a
  coverage table) · Financial-model limitations incl. **why this dataset cannot re-validate them** ·
  **Data dictionary** (every export column) · Citations (formatted papers) · Limitations (both
  pillars) · Suggested tool citation (with retrieval date).
- **Honesty:** the null and the cannot-re-validate caveat are prominent sections, not buried; no
  "our risk score", no overclaiming; descriptive throughout. The old per-chapter `buildMethodsCard`
  was removed in favor of this single consolidated source.

## Typography — monospace-forward data + readable sans prose (premium pass)

Two families. JetBrains Mono carries all **data**; IBM Plex Sans carries all **prose**, at comfortable sizes/line-heights — legibility is not sacrificed for the terminal look.

- **Data / labels / headers / readouts / headline (`--mono`, `--display`, `--grotesk` = JetBrains Mono, 400/500/600/700):** all numbers, scores, CIKs, dates; every label, status/command-bar control, panel header, button; entity names + big readout numbers; and the hero banner (weight 600, `clamp(20,2.4vw,27)px`). No serif, no Space Grotesk.
- **Running prose (`--body`): IBM Plex Sans** (400/500/600/700) — hero paragraph, footnote excerpts, Claude explanations, methodology/help text, captions. Base **13.5px / line-height 1.6**; prose blocks 12.5–13px / **1.62–1.65** for genuine readability.

**Deliberate type levels:** display/banner (mono 600, 20–27px) · big data readout (mono 600, 40px) · Fog (mono 600, 22px) · entity name (mono 600, 14px) · primary panel label (mono 600, 11px, +3px tracking, cyan) · prose (sans, 12.5–13.5px / 1.6+) · **tertiary label — ONE shared treatment** for every eyebrow/section label (mono 500, 9.5px, +1.6px tracking, uppercase, `--ink-faint`). Only IBM Plex Sans + JetBrains Mono are requested by the page.

## Layout & structure

- **Terminal layout:** a persistent terminal header spans full width — a **status bar** (`--status-h 38px`, `--term-black`, soft-divided cells: brand · live stats · function keys) over a **command/filter bar** (`--cmd-h 42px` per row, the toolbar of selects/toggles/exports). The filter bar **wraps onto as many rows as the viewport needs** (`flex-wrap`; each control a fixed `--cmd-h`-tall band with a soft bottom hairline dividing stacked rows) so **every control is always visible — no horizontal scroll, nothing clipped** (C55). Its real rendered height is published to **`--filters-h`** by a `ResizeObserver` on `#filters` (main.js), and **`--top-h = calc(--status-h + --filters-h)`** so the finding panel (`top: var(--top-h)`), constellation frame (`#root::before/::after`) and legend all track the bar height at any width. The **finding panel docks below the header** so the header stays visible. The **constellation is framed** as a calm data panel (soft `--border-soft` bezel via `#root::after`, radius-md + a quiet `CONSTELLATION · SEMANTIC MAP` label via `#root::before`). The **hero is a docked "query console" panel** bottom-left (rounded, black header strip). On mobile the command bar docks to the bottom (wraps upward, capped at `max-height: 52vh` with vertical touch-scroll beyond that — never a hidden horizontal scroll; the hero console sits at `bottom: calc(--filters-h + 12px)` to stay clear) and the panel goes full-screen.
- **Spacing scale (FINAL — one deliberate rhythm):** `--sp-1 4 · --sp-2 8 · --sp-3 12 · --sp-4 16 · --sp-5 20 · --sp-6 24 · --sp-7 32 · --sp-8 40`. Generous on content surfaces (panel/modal pad 20–24px; cards 14–18px; section gaps 18–22px); compact only in the fixed-height chrome bars. Calm, not packed.
- **Radius tokens (FINAL — gentle, consistent, Linear/Vercel-grade):** `--r-sm 3px` (controls/chips/inputs), `--r-md 6px` (cards/cells/wells), `--r-lg 9px` (panels/modals/floating). No harsh squares; round only for dots.
- **Borders:** `--border-soft` (6%-white hairline) is the **primary** divider on every card/cell/panel — soft, premium; the harder `--border` is reserved for a few defined frames. No hard line on every surface.
- **Elevation tokens (FINAL — soft, layered, semi-transparent; Emil: depth over hard lines):** `--elev-card` `0 1px 2px rgba(0,0,0,.30), 0 2px 8px rgba(0,0,0,.22)` (cards/cells); `--elev-1` (tooltip) `0 2px 6px rgba(0,0,0,.40), 0 8px 24px rgba(0,0,0,.34)`; `--elev-2` (modal/drift) `0 6px 20px rgba(0,0,0,.44), 0 24px 60px rgba(0,0,0,.52)`; `--elev-panel` (finding panel) `-1px 0 0 var(--border-soft), -28px 0 64px rgba(0,0,0,.50)`. Soft, layered — every card carries a subtle lift, not a hard outline.
- Tables/cells with comfortable row height; numbers right-aligned monospace.
- Spacing rhythm (denser): 4 · 8 · 12 · 14 · 16 · 24. Status/command bars are fixed-height; panels pad 14px; cells 10–12px.
- Structural numbering only where order is real (a ranked neighbor list 01–10 is legitimate; decorative section markers are not).

## Motion — the discipline that separates premium from slop

- **Easing (FINAL — strong, weighted curves per Emil Kowalski / animation-standards):**
  `--ease cubic-bezier(0.4, 0, 0.2, 1)` (hover / color change);
  `--ease-out cubic-bezier(0.23, 1, 0.32, 1)` (enters — strong, responsive; the default for UI);
  `--ease-in-out cubic-bezier(0.77, 0, 0.175, 1)` (on-screen movement / morph);
  `--ease-drawer cubic-bezier(0.32, 0.72, 0, 1)` (finding-panel + drift-bar slide — iOS-like).
  No bounce, no spring overshoot, no elastic. **Never `ease-in` on UI**; no bare/linear timings remain.
- **Press feedback (FINAL):** every pressable scales to `0.98` on `:active` (`transform var(--t-fast) var(--ease-out)`) — tight terminal acknowledgement. Suppressed on touch (`@media (hover: none)`).
- **Modal entry:** overlay fades (150ms); card scales `0.98→1` + `translateY(6px)→0` (200ms, `--ease-out`, origin center). Drift-bar slides up on appear.
- **Duration tokens (FINAL):** `--t-fast 130ms` (hovers/focus/press), `--t-mid 220ms` (dropdowns/modal card), `--t-slow 360ms` (panel slide — a touch slower/calmer); map fly-to 600–900ms; similarity-score count-up 500ms; drift step 850ms/year.
- **Refined micro-interactions (premium pass):** hovers transition border + background + color together (soft); focus-visible is a 1px cyan outline + a soft 3px `--accent-glow` ring; inputs/paste-areas/search gain the same focus ring; cards lift on the shared `--elev-card`; the green paste CTA gets a soft green-glow ring on hover. Calm, not flashy.
- **Tooltip:** kept a fast opacity fade (110ms, `--ease-out`) — a high-frequency hover element, so no scale-in (Emil: don't over-animate what users see constantly).
- **Map fly-to:** ease the viewport toward the cluster; neighbors illuminate in a staggered cascade (20ms stagger), not all at once.
- **Score reveal:** numbers count up in monospace as results resolve.
- **Ambient:** a *very* subtle parallax/drift on the star-field at rest — barely perceptible, like a long-exposure. Off under `prefers-reduced-motion`.
- **Rule:** if an animation calls attention to itself, it's wrong. Motion should feel like physics, not effects.

## Interaction spec (the constellation)

- **Hover node:** point brightens (--node-bright), tooltip with company + footnote type.
- **Hover link:** the edge between two nodes brightens and shows the similarity score.
- **Click node:** viewport eases toward it; nearest neighbors illuminate ranked; finding panel slides in from the right.
- **Search:** field reorganizes subtly; viewport flies to the result cluster; query node marked with --accent-cool.
- **The proof toggle:** a control that filters to "clean companies inside enforced clusters" — the headline moment.

## Finding panel (designed before the dashboard)

A finding card contains, in order: severity/enforcement badge (amber if enforced) · the two companies (name, CIK monospace, ticker) · the footnote excerpts side by side · the similarity score (large, monospace) · the **Claude-generated explanation** of why they resemble each other · links to both filings on SEC.gov · footnote type tag. Export to PDF/CSV is present (auditors live in Excel/PDF) — not v1-blocking but designed in.

## Empty / loading / error states

- **Loading:** "instrument warming up" — the grid draws in, then points resolve. Boring, calm copy.
- **Empty search:** an invitation, not a dead end: "Select a disclosure or try a preset query."
- **Error:** plain, in the interface's voice, says what happened and the fix. No apology, no mood.

## Quality floor (non-negotiable)

Responsive to mobile; visible keyboard focus rings (--accent-cool); `prefers-reduced-motion` respected (kills ambient drift + shortens transitions); sufficient contrast on all text; the map degrades gracefully to a list view if WebGL/canvas unavailable.

## The one-accessory-removed check

Before shipping any screen: remove one decorative element. If the screen still works, it's removed for good. The map earns its richness; everything else stays austere.
