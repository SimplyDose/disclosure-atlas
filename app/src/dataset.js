// PHASE 3 — research-grade, analysis-ready PANEL export (company-year), built for Stata/R workflows.
// Unit of observation: one row per company-fiscal-year. Disclosure measures are aggregated over ALL
// footnotes of that company-year (full disclosure profile); financial measures are the published
// academic screens for that company-year (NA where inputs insufficient — proper missing, never zero).
// One column registry (COLS) drives the CSV header, the codebook, and the Stata + R import snippets,
// so the data file and its documentation can never drift. Reuses existing data; $0; no generation.
import { makeZip } from "./zip.js";

const TYPE_KEY = { 0: "revenue_recognition", 1: "going_concern", 2: "related_party", 3: "critical_audit_matter", 4: "mda", 5: "risk_factors" };
const today = () => new Date().toISOString().slice(0, 10);
const num = (v, d) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

// ── column registry: { name, type, get(row), def, units, source, basis } ──
// type: id|date|int|num|flag  →  drives col_types (R) and labels; "" = proper missing for num/flag.
const COLS = [
  { name: "cik", type: "id", get: (r) => r.cik, def: "SEC Central Index Key, zero-padded. The PRIMARY join key to Compustat/CRSP/WRDS (via CIK to GVKEY/PERMNO links)", units: "id", source: "SEC EDGAR", basis: "time-invariant" },
  { name: "ticker", type: "id", get: (r) => r.ticker, def: "Exchange ticker where resolvable from SEC company_tickers, else missing. Join on CIK for completeness", units: "id", source: "SEC company_tickers", basis: "as of corpus construction" },
  { name: "company_name", type: "id", get: (r) => r.name, def: "SEC conformed company name", units: "text", source: "SEC EDGAR", basis: "as filed" },
  { name: "sic_code", type: "id", get: (r) => r.sic, def: "4-digit SIC industry classification code", units: "id", source: "SEC EDGAR", basis: "time-invariant" },
  { name: "sic_industry", type: "id", get: (r) => r.ind, def: "SIC industry description", units: "text", source: "SEC EDGAR", basis: "time-invariant" },
  { name: "gvkey", type: "id", get: () => "", def: "Compustat firm identifier, EMPTY by design: GVKEY is a licensed Compustat/WRDS field this dataset does not contain. Map it in your own WRDS environment from CIK (see JOINING.md), never fabricated", units: "id (licensed)", source: "Compustat/WRDS, not included. Join on CIK", basis: "supply from your licensed source" },
  { name: "cusip", type: "id", get: () => "", def: "CUSIP security identifier, EMPTY by design: CUSIP is a licensed identifier this dataset does not contain. Map it from CIK in your WRDS/Compustat/CRSP environment (see JOINING.md), never fabricated", units: "id (licensed)", source: "CUSIP/CRSP/Compustat, not included. Join on CIK", basis: "supply from your licensed source" },
  { name: "permno", type: "id", get: () => "", def: "CRSP permanent security identifier, EMPTY by design: PERMNO is a licensed CRSP field this dataset does not contain. Map it from CIK via the CRSP/Compustat Merged link in your environment (see JOINING.md), never fabricated", units: "id (licensed)", source: "CRSP/WRDS, not included. Join on CIK", basis: "supply from your licensed source" },
  { name: "fiscal_year", type: "int", get: (r) => r.fy, def: "Fiscal year (period of report), the panel time index", units: "year", source: "SEC 10-K period_of_report", basis: "period of report" },
  { name: "filing_date", type: "date", get: (r) => r.filing_date, def: "Date the 10-K was filed with the SEC, the date these measures became public. Use for look-ahead / point-in-time control", units: "YYYY-MM-DD", source: "SEC EDGAR", basis: "POINT-IN-TIME: known on this date" },
  { name: "accession", type: "id", get: (r) => r.accession, def: "SEC accession number of the source 10-K filing", units: "id", source: "SEC EDGAR", basis: "filing identifier" },
  { name: "n_footnotes", type: "int", get: (r) => r.n_fn, def: "Number of footnote excerpts captured for this company-year", units: "count", source: "Disclosure Atlas", basis: "known at filing_date" },
  { name: "gunning_fog", type: "num", get: (r) => r.fog, def: "Gunning Fog readability index, company-year mean across footnotes (descriptive complexity, NOT a risk measure)", units: "grade level", source: "Disclosure Atlas (Gunning 1952)", basis: "known at filing_date" },
  { name: "distinctiveness", type: "num", get: (r) => r.dst, def: "Mean cosine distance from same-SIC-industry, same-type peer centroid. Descriptive language unusualness", units: "0-1", source: "Disclosure Atlas (bge-small-en-v1.5)", basis: "known at filing_date" },
];
for (let t = 0; t <= 5; t++) {
  COLS.push({ name: "has_" + TYPE_KEY[t], type: "flag", get: (r) => r.has[t], def: `1 if a ${TYPE_KEY[t].replace(/_/g, " ")} footnote is present this company-year, else 0`, units: "0/1", source: "Disclosure Atlas", basis: "known at filing_date" });
}
const BEN = ["dsri", "gmi", "aqi", "sgi", "depi", "sgai", "lvgi", "tata"];
COLS.push(
  { name: "beneish_m", type: "num", get: (r) => r.m, def: "Beneish M-Score (Beneish 1999), 8-variable. A published earnings-manipulation SCREEN, not a verdict. Missing if inputs insufficient", units: "score", source: "Beneish 1999", basis: "known at filing_date" },
  { name: "beneish_flag", type: "flag", get: (r) => r.mf, def: "1 if M > -1.78 (Beneish's published cutoff), else 0. Missing if no M. A screen with a documented high false-positive rate", units: "0/1", source: "Beneish 1999", basis: "known at filing_date" },
);
for (const k of BEN) COLS.push({ name: "beneish_" + k, type: "num", get: (r) => r.mc[k.toUpperCase()] ?? null, def: `Beneish M-Score component index: ${k.toUpperCase()}`, units: "index", source: "Beneish 1999", basis: "known at filing_date" });
COLS.push(
  { name: "dechow_fscore", type: "num", get: (r) => r.f, def: "Dechow F-Score (Dechow, Ge, Larson & Sloan 2011, Model 1) = predicted probability / 0.0037 unconditional rate; F>1 = above the base rate, NOT a probability of fraud; missing if inputs insufficient", units: "score", source: "Dechow et al. 2011", basis: "known at filing_date" },
  { name: "dechow_prob", type: "num", get: (r) => r.fp, def: "Dechow Model-1 predicted misstatement probability (logistic)", units: "probability", source: "Dechow et al. 2011", basis: "known at filing_date" },
);
const DEC = ["rsst_accruals", "ch_receivables", "ch_inventory", "soft_assets", "ch_cash_sales", "ch_roa", "issuance"];
for (const k of DEC) COLS.push({ name: "dechow_" + k, type: "num", get: (r) => r.fc[k] ?? null, def: `Dechow Model-1 input: ${k.replace(/_/g, " ")}`, units: "ratio", source: "Dechow et al. 2011", basis: "known at filing_date" });
COLS.push({ name: "enforced", type: "flag", get: (r) => r.enforced, def: "1 if the company has SEC AAER enforcement history, else 0. Descriptive CONTEXT about the company, NOT an outcome or a prediction from its disclosures", units: "0/1", source: "SEC AAERs", basis: "company-level context" });

// ── build the panel rows for a set of company-year keys ("cik|fy") ──
export function buildPanel(keys, allByKey, nodes, companyScores, tickers) {
  const rows = [];
  for (const key of keys) {
    const idxs = allByKey.get(key); if (!idxs || !idxs.length) continue;
    const sep = key.lastIndexOf("|"); const cik = key.slice(0, sep), fy = +key.slice(sep + 1);
    if (!Number.isFinite(fy)) continue;
    const first = nodes[idxs[0]];
    let fogSum = 0, fogN = 0, dstSum = 0, dstN = 0; const has = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const i of idxs) { const n = nodes[i]; if (n.fog != null) { fogSum += n.fog; fogN++; } if (n.dst != null) { dstSum += n.dst; dstN++; } has[n.t] = 1; }
    const sc = companyScores(cik); const yr = sc ? sc.years.find((y) => y.y === fy) : null;
    rows.push({
      cik, ticker: tickers[cik] || "", name: first.name, sic: first.sic || "", ind: first.ind || "",
      fy, filing_date: first.fdate || "", accession: first.acc || "", enforced: first.e ? 1 : 0,
      n_fn: idxs.length, fog: fogN ? num(fogSum / fogN, 2) : null, dst: dstN ? num(dstSum / dstN, 4) : null, has,
      m: yr && yr.m != null ? yr.m : null, mf: yr && yr.m != null ? (yr.mf ? 1 : 0) : null, mc: (yr && yr.mc) || {},
      f: yr && yr.f != null ? yr.f : null, fp: yr && yr.fp != null ? yr.fp : null, fc: (yr && yr.fc) || {},
    });
  }
  rows.sort((a, b) => (a.cik < b.cik ? -1 : a.cik > b.cik ? 1 : a.fy - b.fy));
  return rows;
}

const csvCell = (v) => { if (v == null) return ""; const s = String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

export function panelCSV(rows) {
  const head = COLS.map((c) => c.name).join(",");
  const body = rows.map((r) => COLS.map((c) => { const v = c.get(r); return csvCell(v == null ? "" : v); }).join(","));
  return head + "\n" + body.join("\n") + "\n";
}

function codebookMD(rows, meta) {
  const head = `# Disclosure Atlas · research panel codebook\n\nGenerated ${today()} · ${rows.length} observations (company-years) · ${meta.nCompanies} companies\n\n**Unit of observation:** one row per company-fiscal-year. Disclosure measures are aggregated over ALL footnotes of that company-year (the full disclosure profile); financial measures are the published academic screens for that company-year. Missing data is encoded as an EMPTY field (NA in R, \`.\` in Stata), never zero. CIK is the primary join key.\n\n## Identifiers & joining (read before merging)\n\nEvery resolvable identifier ships as a clean column so this panel joins to your existing databases with no manual matching:\n\n- \`cik\`: SEC Central Index Key, **zero-padded to 10 digits** and stored as TEXT. This is the **universal join key**. Keep it a string on import (the snippets do) or leading zeros are lost.\n- \`ticker\`, \`company_name\`, \`sic_code\`, \`sic_industry\`: resolved from SEC data. \`ticker\` is NA where SEC \`company_tickers\` has no current mapping (join on CIK for completeness).\n- \`accession\`: the source 10-K filing identifier.\n\nLicensed identifiers (\`gvkey\`, \`cusip\`, \`permno\`) ship **empty by design**: they require Compustat / CRSP / WRDS, which this dataset does not contain. They are present as named, honest-NA columns so you know exactly where to drop them in. They are **never fabricated**. Map them yourself from CIK in your licensed environment (Compustat \`company\`/CCM link, CRSP/Compustat Merged). See \`JOINING.md\` for ready merge recipes and the point-in-time / look-ahead caveat.\n\n| column | definition | units | source | date basis |\n| --- | --- | --- | --- | --- |\n`;
  const tidy = (s) => s.replace(/\|/g, "/");
  return head + COLS.map((c) => `| \`${c.name}\` | ${tidy(c.def)} | ${c.units} | ${tidy(c.source)} | ${tidy(c.basis)} |`).join("\n") + "\n";
}

// id-type columns drive the dtype/string handling in every snippet (so leading zeros survive);
// date-type columns drive date parsing. Derived from COLS so the snippets can never drift.
const ID_COLS = COLS.filter((c) => c.type === "id").map((c) => c.name);
const DATE_COLS = COLS.filter((c) => c.type === "date").map((c) => c.name);

export function stataSnippet(meta) {
  const labels = COLS.map((c) => `label variable ${c.name} \`"${c.def.replace(/"/g, "'").slice(0, 78)}"'`).join("\n");
  // numeric columns are derived from COLS (like the R/Python snippets) so the destring list can't drift
  const numeric = COLS.filter((c) => c.type === "int" || c.type === "num" || c.type === "flag").map((c) => c.name);
  const chunks = [];
  for (let i = 0; i < numeric.length; i += 5) chunks.push(numeric.slice(i, i + 5).join(" "));
  const destring = chunks.join(" ///\n    ");
  return `* Disclosure Atlas · research panel import (Stata)
* Cohort: ${meta.filterDesc}
* Retrieved ${today()} from https://disclosure-atlas.vercel.app
* Place panel.csv in the working directory, then run this do-file.

* import delimited keeps identifiers as strings, preserving the zero-padded 10-digit CIK
import delimited "panel.csv", varnames(1) case(preserve) stringcols(_all) encoding("UTF-8") clear

* destring the numeric measures (empty cells -> missing "."); identifiers stay strings
destring ${destring}, replace

* declare the panel; CIK (string) -> numeric panel id
encode cik, generate(cik_id)
xtset cik_id fiscal_year

* parse the point-in-time filing date (the date each measure became public, used to avoid look-ahead)
generate filing_date_d = date(filing_date, "YMD")
format filing_date_d %td

* empty cells are missing (.), do NOT recode 0 as missing
${labels}

* CIK is the primary join key to Compustat/CRSP (via CIK<->GVKEY/PERMNO crosswalks).
* gvkey/cusip/permno ship EMPTY (licensed). Fill them from your WRDS environment (see JOINING.md).
* M-Score / F-Score are published academic SCREENS (Beneish 1999; Dechow et al. 2011) with known
* limitations. This corpus cannot re-validate them. Disclosure measures are descriptive. No risk score.
`;
}

export function rSnippet(meta) {
  const ct = COLS.map((c) => {
    const t = c.type === "date" ? `col_date(format = "%Y-%m-%d")` : c.type === "int" ? "col_integer()" : c.type === "id" ? "col_character()" : "col_double()";
    return `    ${c.name} = ${t}`;
  }).join(",\n");
  return `# Disclosure Atlas · research panel import (R)
# Cohort: ${meta.filterDesc}
# Retrieved ${today()} from https://disclosure-atlas.vercel.app
library(readr)

panel <- read_csv("panel.csv", col_types = cols(
${ct}
))

# Empty cells read as NA (proper missing), do NOT treat 0 as missing.
# CIK (character, zero-padded 10-digit) is the primary join key to Compustat/CRSP via CIK<->GVKEY/PERMNO.
# gvkey/cusip/permno read as NA character columns (licensed). Fill them from WRDS (see JOINING.md).
# filing_date is point-in-time: the date each measure became public (use to avoid look-ahead bias).
# M-Score / F-Score are published academic SCREENS (Beneish 1999; Dechow et al. 2011) with known
# limitations. This corpus cannot re-validate them. Disclosure measures are descriptive. No risk score.
str(panel)
`;
}

export function pySnippet(meta) {
  const ids = ID_COLS.map((c) => `"${c}"`).join(", ");
  const dates = DATE_COLS.map((c) => `"${c}"`).join(", ");
  return `# Disclosure Atlas · research panel import (Python / pandas)
# Cohort: ${meta.filterDesc}
# Retrieved ${today()} from https://disclosure-atlas.vercel.app
import pandas as pd

# identifiers stay strings so the zero-padded 10-digit CIK keeps its leading zeros (e.g. "0000320193")
id_cols = [${ids}]
panel = pd.read_csv(
    "panel.csv",
    dtype={c: "string" for c in id_cols},
    parse_dates=[${dates}],
    keep_default_na=True,   # empty cells -> <NA>/NaT (proper missing), NEVER 0
)

# CIK (zero-padded string) is the primary join key to Compustat/CRSP via CIK<->GVKEY/PERMNO.
# gvkey/cusip/permno arrive EMPTY (licensed). Fill them from your WRDS environment (see JOINING.md).
# filing_date is point-in-time: the date each measure became public (use to avoid look-ahead bias).
# M-Score / F-Score are published academic SCREENS (Beneish 1999; Dechow et al. 2011) with known
# limitations. This corpus cannot re-validate them. Disclosure measures are descriptive. No risk score.
print(panel.dtypes)
print(panel.shape)
`;
}

export function joiningNote() {
  return `Disclosure Atlas · JOINING THIS DATA
====================================

Every row carries a zero-padded 10-digit CIK. CIK is the universal join key: it links this panel to
SEC EDGAR and, through standard crosswalks, to Compustat / CRSP / WRDS. Resolvable identifiers
(ticker, company_name, sic_code, sic_industry, accession) ship as clean columns. Licensed identifiers
(gvkey, cusip, permno) ship EMPTY by design: they require Compustat/CRSP/WRDS, which this dataset does
not contain. They are never fabricated. Map them yourself from CIK in your licensed environment.

1) KEEP CIK A STRING
   CSV stores CIK as "0000320193". If a tool reads it as a number the leading zeros vanish and joins
   fail. The provided import_panel.{do,R,py} all read identifiers as strings. Use them. If you build
   your own loader, force CIK to character/string, or re-pad: CIK = zero-pad to width 10.

2) MERGE ON CIK
   Stata:   merge m:1 cik using your_other_dataset      // both CIK string, width 10
   R:       dplyr::left_join(panel, other, by = "cik")
   pandas:  panel.merge(other, on = "cik", how = "left")
   Match on (cik, fiscal_year) for a company-year merge. fiscal_year is the 10-K period of report.

3) MAP CIK -> GVKEY / PERMNO / CUSIP (in YOUR WRDS/Compustat/CRSP environment)
   - GVKEY (Compustat): use the Compustat "company" table or the CCM (CRSP/Compustat Merged) link,
     which carries CIK. Be aware a CIK can map to more than one GVKEY over time (renames, re-incorp).
   - PERMNO (CRSP): go CIK -> GVKEY via CCM, then GVKEY -> PERMNO (LPERMNO) using the CCM link table,
     respecting the link's valid date window (LINKDT/LINKENDDT) and LINKTYPE/LINKPRIM = P.
   - CUSIP: available from CRSP/Compustat keyed by PERMNO/GVKEY once linked.
   Always join the link on a date (filing_date or fiscal_year), because these mappings change over time.

4) POINT-IN-TIME / LOOK-AHEAD BIAS
   filing_date is when each company-year's measures became PUBLIC (the 10-K filing date). fiscal_year
   is the period of report, which ends months earlier. To avoid look-ahead bias, align market/return
   data to filing_date (information was not knowable before it), and when merging point-in-time
   Compustat/CRSP data respect each link's valid date window rather than using the latest mapping.

5) HONESTY (carried from the instrument)
   Disclosure measures are descriptive language properties. M-Score / F-Score are published academic
   SCREENS shown with their limitations (this corpus cannot re-validate them). There is no risk score,
   no composite, and no ranking by implied concern. enforced is descriptive context, never a prediction.
`;
}

function citationTXT(meta) {
  return `Disclosure Atlas · suggested citation
=====================================

Tool:
  Munger, Joshua (2026). Disclosure Atlas: a browser-based semantic search research instrument
  for SEC disclosures, with published academic financial-quality screens. https://disclosure-atlas.vercel.app
  (retrieved ${today()}).

This panel extract:
  Cohort definition: ${meta.filterDesc}
  Unit of observation: company-fiscal-year. ${meta.nObs} observations across ${meta.nCompanies} companies.
  Financial screens present for ${meta.nScored} company-years (NA elsewhere).
  Retrieved ${today()}.

Academic models (cite when using the financial-screen columns):
  Beneish, M. D. (1999). The Detection of Earnings Manipulation. Financial Analysts Journal, 55(5), 24-36.
  Dechow, P. M., Ge, W., Larson, C. R., & Sloan, R. G. (2011). Predicting Material Accounting
    Misstatements. Contemporary Accounting Research, 28(1), 17-82.
  Gunning, R. (1952). The Technique of Clear Writing. McGraw-Hill.   (Gunning Fog complexity)
`;
}

function sampleSelectionTXT(meta) {
  return `Sample selection (for the methods/transparency section referees require)
======================================================================

Source: U.S. SEC EDGAR 10-K filings (a fixed corpus snapshot). Financial screens computed from SEC
XBRL structured financials per company-fiscal-year.

Cohort filters applied (defines the sample):
  ${meta.filterDesc}

Construction of this panel:
  - Unit of observation: company-fiscal-year.
  - A company-year ENTERS the sample if the cohort filters retained at least one footnote for that
    company in that fiscal year (fiscal year = the 10-K period of report).
  - Disclosure measures (gunning_fog, distinctiveness, footnote-type availability, n_footnotes) are
    computed over ALL footnotes of each retained company-year (the full disclosure profile, not only
    the filtered subset), so a type/complexity filter selects the sample without biasing the measures.
  - Financial measures are the Beneish M-Score and Dechow F-Score (with components) for that exact
    company-fiscal-year. They are MISSING (NA) where the model's inputs were insufficient.
  - Missing data is empty (NA), never zero.

Result: ${meta.nObs} company-year observations, ${meta.nCompanies} distinct companies,
  and ${meta.nScored} company-years that carry a Beneish M-Score.
`;
}

function readmeTXT(rows, meta) {
  return `Disclosure Atlas · research panel export
========================================
Generated ${today()} from https://disclosure-atlas.vercel.app  ($0; reuses existing computed data)

UNIT OF OBSERVATION: company-fiscal-year (one row per company per fiscal year). ${rows.length} rows.

FILES IN THIS BUNDLE
  panel.csv              The data (UTF-8, comma-separated, one header row).
  codebook.md            Data dictionary: every column's name, definition, units, source, date basis.
  import_panel.do        Stata import + xtset + variable labels (import delimited).
  import_panel.R         R import via readr::read_csv with explicit column types.
  import_panel.py        Python import via pandas.read_csv (CIK as string, dates parsed, NA preserved).
  JOINING.md             How to merge on CIK, map CIK->GVKEY/PERMNO/CUSIP, and avoid look-ahead bias.
  CITATION.txt           Suggested tool citation + the academic model citations.
  SAMPLE_SELECTION.txt   Exactly how this cohort/sample was defined (the filters).

POINT-IN-TIME / LOOK-AHEAD
  filing_date is the date the 10-K was filed with the SEC, the date each company-year's measures
  became public. Use it to avoid look-ahead bias. fiscal_year is the period of report.

IDENTIFIERS / JOINING  (full recipes in JOINING.md)
  CIK (zero-padded 10-digit) is the PRIMARY, always-present join key. Resolvable identifiers ship as
  clean columns: ticker (NA where unresolvable), company_name, sic_code, sic_industry, accession.
  Licensed identifiers (gvkey from Compustat, cusip, and permno from CRSP) ship EMPTY by design: they require
  Compustat/CRSP/WRDS, which this dataset does not contain. They are present as named, honest-NA
  columns (never fabricated). Map them from CIK in your own licensed environment (see JOINING.md).
  Keep CIK a STRING on import (the snippets do) or the leading zeros are lost.

MISSING DATA
  Encoded as EMPTY (NA in R, . in Stata), NEVER zero. Critical for correct statistics.

HONESTY (carried from the instrument, unchanged)
  - The Beneish M-Score and Dechow F-Score are PUBLISHED ACADEMIC SCREENS (Beneish 1999; Dechow
    et al. 2011), shown with their known limitations (documented false-positive rates and sample/era
    dependence). THIS dataset cannot re-validate them: SEC XBRL begins ~2009 but most enforcement
    cases predate it, and enforced vs. clean score distributions do not separate in this sample, so
    their basis is the literature, presented as such.
  - Disclosure measures (complexity, distinctiveness) are DESCRIPTIVE language properties, not
    accounting-quality judgments. Across this corpus, disclosure language does NOT separate
    SEC-enforced from matched-clean companies (a replicated null).
  - There is no per-company "risk score", no ranking by implied concern, and no judgment column.
    enforced is descriptive context, never an outcome or a prediction.
`;
}

// assemble the whole bundle as a single .zip Blob
export function buildPanelZip(rows, meta) {
  const files = [
    { name: "panel.csv", text: panelCSV(rows) },
    { name: "codebook.md", text: codebookMD(rows, meta) },
    { name: "import_panel.do", text: stataSnippet(meta) },
    { name: "import_panel.R", text: rSnippet(meta) },
    { name: "import_panel.py", text: pySnippet(meta) },
    { name: "JOINING.md", text: joiningNote() },
    { name: "CITATION.txt", text: citationTXT(meta) },
    { name: "SAMPLE_SELECTION.txt", text: sampleSelectionTXT(meta) },
    { name: "README.txt", text: readmeTXT(rows, meta) },
  ];
  return makeZip(files);
}

export const PANEL_COLS = COLS;
