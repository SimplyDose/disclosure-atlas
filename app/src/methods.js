// METHODS & REPRODUCIBILITY BUNDLE — a comprehensive, citable resource consolidating the corpus
// definition, both pillars' methods, the replicated validation null, the financial-model formulas +
// XBRL tag mappings + coverage, the export data dictionary, citations, and limitations. One content
// model renders BOTH the in-app panel (HTML) and the downloadable markdown so they never drift.
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const n = (v) => (v == null ? "—" : Number(v).toLocaleString("en-US"));
const today = () => new Date().toISOString().slice(0, 10);

// the single source of truth for the methods content, built from the live manifest
function sections(m, findings) {
  const c = m.corpus || {}, v = m.validation || {}, fin = m.financials || {};
  const byT = c.footnotes_by_type || {};
  const forms = Object.entries(c.filing_forms || {}).map(([k, x]) => `${k} ${n(x)}`).join(" · ");
  const flagPct = fin.beneish_scored ? (100 * fin.beneish_flagged / fin.beneish_scored).toFixed(1) : "—";
  return [
    { h: "OVERVIEW", lead: "Disclosure Atlas is a browser-based semantic search research instrument for SEC disclosures. I built it to study the relationship between how companies write their disclosure notes and their financial condition. It has two pillars: a disclosure-language semantic map with lenses, and published academic financial-quality screens. Everything it shows is descriptive. It surfaces resemblance, readability, language unusualness, and the outputs of cited screening models. It makes no prediction or accusation about any company.", paras: [] },

    { h: "CORPUS DEFINITION", paras: [
        `Company universe (the deterministic fetch list): ${n(fin.universe)} public companies. This is the v1 enforcement/clean set (companies with SEC AAER enforcement history plus a SIC- and era-matched comparison set), expanded with recognizable large-caps and an evenly-spaced mid/small-cap tail sample from SEC's company_tickers list (mid/small-weighted, not Fortune-500-only). The disclosure corpus below is the subset of those companies whose 10-K footnotes I successfully extracted.`,
        `Filings: ${n(c.filings)} (${forms}). Footnote types (6): revenue recognition, going concern, related-party, critical audit matters, MD&A, risk factors. Footnotes embedded: ${n(c.footnotes)} across ${n(c.companies_in_corpus)} companies, filing years ${esc(c.year_min)}-${esc(c.year_max)}.`,
        `Data source: U.S. SEC EDGAR (data.sec.gov). Footnote text comes from primary 10-K documents (iXBRL PolicyTextBlock tags where present, else heading-anchored/topic-classified extraction, ≤1400-char excerpts, exact-duplicate deduped) and structured financials come from the XBRL company-facts API. Enforcement overlay: ${n(c.aaer_releases)} SEC AAER releases. The shipped dataset is a fixed snapshot retrieved from EDGAR during corpus construction.`,
      ],
      tables: [{ cap: "Corpus counts", cols: ["metric", "value"], rows: [
        ["footnotes embedded", n(c.footnotes)], ["companies in corpus", n(c.companies_in_corpus)],
        ["10-K filings", n(c.filings)], ["companies in database", n(c.companies_universe)],
        ["companies w/ enforcement history", n(c.companies_enforced)], ["AAER releases", n(c.aaer_releases)],
        ["revenue recognition", n(byT.rev_rec)], ["going concern", n(byT.going_concern)],
        ["related-party", n(byT.related_party)], ["critical audit matters", n(byT.cam)],
        ["MD&A", n(byT.mda)], ["risk factors", n(byT.risk_factors)],
      ] }] },

    { h: "DISCLOSURE PILLAR · METHODS", paras: [
        `Embedding model: ${esc(m.model || "bge-small-en-v1.5")} (BAAI bge-small-en-v1.5), ${n(m.embedding_dim || 384)}-dimensional, CLS pooling, L2-normalized. The same ONNX model runs in-browser (transformers.js) for the paste/compare features, so build-time and in-browser vectors match. bge-small-en-v1.5 is a pretrained model. No model was trained for this project.`,
        `Similarity: cosine in the embedding space (equivalently, dot product of normalized vectors). Neighbors: precomputed top-10 cross-company nearest footnotes per footnote (deduped to distinct other companies). Map: a UMAP projection of the embeddings (n_neighbors=15, min_dist=0.12, metric=cosine, random_state=42).`,
        `Complexity: the Gunning Fog readability index of the footnote text; complexity_vs_industry = below / near / above the median Fog of same-SIC-industry peers ("near" = within ±10% of the group median). Descriptive, not a risk measure.`,
        `Distinctiveness: cosine distance of a footnote's embedding from the centroid of same-SIC-industry, same-type peers (= 1 − cosine to the renormalized peer-group centroid). Tiers (distribution-relative within each industry×type group): typical (≤75th pct) / distinctive (75th-93rd) / highly distinctive (>93rd). A descriptive measure of language unusualness, not a finding.`,
        `Keyword baseline: BM25 (k1=1.5, b=0.75) over the same excerpts, computed in-browser, shown alongside the semantic neighbors.`,
        `Year-over-year change (Disclosure Shifts): for each company + footnote type, the change between consecutive available fiscal years is the cosine DISTANCE (1 − cosine) between that company-type's principal (longest) excerpt embedding in each year. Rankable and filter-composable, exportable, and shown as a per-company timeline. Descriptive only. A large shift measures linguistic change, not a red flag, and it is not predictive (the disclosure-language null stands).`,
      ],
      pre: ["Gunning Fog = 0.4 × ( words/sentences + 100 × complex_words/words )\n  complex word = a token of 3+ syllables (suffix-adjusted: trailing -es/-ed/-ing stripped)"] },

    { h: "VALIDATION · THE REPLICATED NULL (stated plainly, surfaced as a feature)", paras: [
        v.headline || "Across the corpus and all six disclosure types, disclosure language does NOT separate SEC-enforced from matched-clean companies. The null replicates at about 30 times the original scale.",
        `How it was tested: an AAER backtest comparing enforced companies against SIC- and era-matched clean companies. I report separation effect sizes (Cohen's d) with leakage-free grouped cross-validation (0 companies shared across folds). The positive control is footnote-type classification (AUC 1.000), so the pipeline is healthy and the null is specific to enforcement. Retrieval enrichment is compared against a keyword baseline. Random-pair cosine is intrinsically high (about 0.6) for financial footnotes, so effects are reported as effect sizes, not raw cosines.`,
        v.rev_rec || "", v.going_concern || "", v.new_types || "", v.engine || "",
        "This null is a result, not a gap, and it is surfaced throughout the tool. SEC enforcement history is shown only as context about a company, never as a prediction from its disclosures.",
      ].filter(Boolean),
      tables: [{ cap: "Per-type separation (enforced vs matched-clean), Cohen's d: none clears the 0.2 bar", cols: ["footnote type", "separation d"], rows: [
        ["revenue recognition", "≈ −0.10 (grouped-CV AUC 0.506 = chance)"], ["going concern", "≈ +0.15 (weak; AUC ≈ 0.61)"],
        ["related-party", "≈ −0.25"], ["critical audit matters", "≈ +0.18"], ["MD&A", "≈ −0.04"], ["risk factors", "≈ +0.02"],
      ] }] },

    { h: "FINANCIAL PILLAR · METHODS", paras: [
        "Two published, peer-reviewed academic screening models computed per company-fiscal-year from SEC XBRL structured financials. They are screens, not verdicts, and not my judgment.",
        `Beneish M-Score (Beneish 1999): 8-variable earnings-manipulation model comparing year t to t−1. Published cutoff M > ${n(fin.beneish_threshold ?? -1.78)} classifies a firm-year as a likely manipulator (a screen with a documented high false-positive rate).`,
        `Dechow F-Score (Dechow, Ge, Larson & Sloan 2011), Model 1 (financial-statement variables only): a logistic misstatement-prediction model built on SEC AAER cases. F-Score = predicted probability ÷ ${fin.dechow_unconditional ?? 0.0037} (the unconditional misstatement rate in Dechow's sample); F > 1 means above that base rate, NOT a probability of fraud.`,
        "Missing-data policy: a company-year with insufficient inputs receives NO score (a recorded reason), never a fabricated or partial one. Genuinely-optional balance items (inventory, investments, preferred, debt-in-current-liabilities) are treated as 0 when absent. Beneish's SGAI/DEPI use the literature's neutral value (1) when SG&A or depreciation isn't reported. Every score is reproducible from its stored components and the cited formula.",
      ],
      pre: [
        "Beneish M = −4.840 + 0.920·DSRI + 0.528·GMI + 0.404·AQI + 0.892·SGI\n            + 0.115·DEPI − 0.172·SGAI + 4.679·TATA − 0.327·LVGI",
        "Dechow Model 1:\n  predicted = −7.893 + 0.790·RSST_accruals + 2.518·Δreceivables + 1.191·Δinventory\n              + 1.979·soft_assets + 0.171·Δcash_sales − 0.932·ΔROA + 1.029·issuance\n  probability = e^predicted / (1 + e^predicted) ;  F-Score = probability / 0.0037",
      ],
      tables: [
        { cap: "XBRL line items → us-gaap tag chains (first present wins; SEC company-facts API)", cols: ["line item", "us-gaap tags"], rows: [
          ["Revenue", "RevenueFromContractWithCustomerExcludingAssessedTax · Revenues · SalesRevenueNet"],
          ["COGS", "CostOfGoodsAndServicesSold · CostOfRevenue · CostOfGoodsSold"],
          ["Receivables (net)", "AccountsReceivableNetCurrent · ReceivablesNetCurrent"],
          ["Inventory", "InventoryNet"], ["Current assets", "AssetsCurrent"], ["Total assets", "Assets"],
          ["PP&E (net)", "PropertyPlantAndEquipmentNet"], ["Depreciation", "DepreciationDepletionAndAmortization · DepreciationAndAmortization"],
          ["SG&A", "SellingGeneralAndAdministrativeExpense"], ["Current liabilities", "LiabilitiesCurrent"],
          ["Total liabilities", "Liabilities"], ["Long-term debt", "LongTermDebtNoncurrent · LongTermDebt"],
          ["Income (cont. ops)", "IncomeLossFromContinuingOperations… (else NetIncomeLoss)"], ["Net income", "NetIncomeLoss · ProfitLoss"],
          ["Cash flow from ops", "NetCashProvidedByUsedInOperatingActivities"], ["Cash", "CashAndCashEquivalentsAtCarryingValue"],
          ["Issuance (equity/debt)", "ProceedsFromIssuanceOfCommonStock · ProceedsFromIssuanceOfLongTermDebt"],
        ] },
        { cap: "Financial-pillar coverage (honest)", cols: ["metric", "value"], rows: [
          ["companies with XBRL company-facts", `${n(fin.with_companyfacts)} of ${n(fin.universe)} (absent ${n(fin.companyfacts_absent)}: pre-XBRL / delisted / foreign)`],
          ["companies with assembled financials", n(fin.companies_with_financials)],
          ["company-years assembled", n(fin.company_years)], ["candidate company-years (have prior year)", n(fin.candidate_company_years)],
          ["Beneish M-Score computed", `${n(fin.beneish_scored)} (${flagPct}% above the −1.78 threshold)`],
          ["Dechow F-Score computed", n(fin.dechow_scored)], ["neither model (insufficient inputs)", n(fin.neither_scored)],
          ["enforced companies with ≥1 M-Score", n(fin.enforced_with_beneish)],
        ] },
      ] },

    { h: "FINANCIAL MODELS · LIMITATIONS (including why THIS dataset cannot re-validate them)", paras: [
        "Beneish M-Score: developed on manipulators from 1982 to 1992, with a documented high false-positive rate. Legitimate M&A or restructuring can spike the indices (an acquisition lifts the asset-quality index AQI, for example), and the model is weak for financial firms and firms without COGS/inventory.",
        "Dechow F-Score: out-of-sample discrimination is modest (AUC of roughly 0.69 to 0.73, and Model 1 is lower). The misstatement base rate is tiny, so even elevated F-Scores yield many false positives. The model was built on AAER firms from 1982 to 2005, so it is era- and selection-dependent.",
        `Cannot re-validate on this corpus: SEC XBRL begins ~2009, but most of this corpus's enforcement cases predate that (AAER median release ≈ 2013, many earlier), so only ${n(fin.enforced_with_beneish)} enforced companies have any XBRL-era score and enforced vs. clean score distributions do NOT separate in this sample. The basis that these models carry signal is therefore the published literature, presented as such. It is not a claim this dataset independently demonstrates. Degenerate micro-cap outliers (|M|>10, F>20) are real formula outputs shown verbatim (and display-annotated), not meaningful magnitudes.`,
      ] },

    { h: "DATA DICTIONARY · export columns (CSV / XLSX)", paras: [
        "Per-finding, bulk, shortlist, company-profile, and cohort exports share these columns (a per-finding export adds a leading rank, and 00 is the query row). Every export and every MCP payload carries the full set of resolvable identifiers as clean columns, so the data joins to Compustat/CRSP/WRDS with no manual matching: zero-padded 10-digit CIK (the universal join key), ticker, company name, sic_code, and sic_industry. Licensed identifiers (gvkey, cusip, permno) require Compustat/CRSP/WRDS, sources this project does not hold, so they ship as named, honest-EMPTY columns (NA, never fabricated). You know exactly where to drop them in after mapping from CIK.",
        "For statistical work, the cohort view also offers a RESEARCH PANEL EXPORT: a company-year panel (.zip) with its own codebook, ready-to-run Stata / R / Python import snippets (CIK kept as a string so leading zeros survive, filing dates parsed, empty cells as proper NA), a JOINING.md note (how to merge on CIK, map CIK→GVKEY/PERMNO/CUSIP in your own WRDS environment, and the point-in-time / look-ahead caveat), point-in-time filing dates, and missing-as-NA. A COPY IMPORT CODE affordance on the cohort and data-table views hands you the same Stata/R/Python loader for that exact file with one click.",
        "The DATA TABLE view renders that same company-year panel for the current cohort as a sortable, virtualized grid, a live preview of exactly what the panel .zip exports. Every column is descriptive. Sorting by an academic screen such as the M-Score orders a descriptive measure, not a suspicion ranking, and there is no composite or risk-score column.",
        "The TABLE 1 view generates publication-style descriptive statistics (N, mean, median, SD, min, p25, p75, max) for each measure over the active cohort. Disclosure measures are summarised at the footnote level and the financial screens over distinct company-years (deduplicated), with N reflecting non-missing observations (zeros never imputed). It exports as CSV and as a copy-pasteable table for a paper.",
        "Any defined cohort (the full active filter set) can be captured as a SHAREABLE LINK that reconstructs the exact sample on load, same filters and same count, for collaboration, robustness checks, and referee reproducibility (sample-selection transparency without accounts). The link is a descriptive sample definition and can open directly into Table 1 or the data table.",
        "A CORRELATION MATRIX view computes pairwise Pearson or Spearman correlations across the numeric measures (Gunning Fog, distinctiveness, footnotes, Beneish M + key components, Dechow F) over the company-year panel, with pairwise or listwise deletion of missing values (never zero-imputed) and per-cell N. It is descriptive association, not causal and sample-specific. It is shaded by magnitude in a neutral hue (no red/green) and exports as CSV."],
      tables: [{ cap: "", cols: ["column", "definition"], rows: [
        ["rank", "position in a per-finding result list (00 = the query)"],
        ["company", "issuer name as filed (SEC conformed name)"],
        ["cik", "SEC Central Index Key (zero-padded; the permanent company id)"],
        ["ticker", "exchange ticker where resolvable from SEC company_tickers, blank where SEC has no current mapping. Join on CIK for completeness. No value is fabricated"],
        ["sic_code / sic_industry", "4-digit SIC classification code and its industry label (resolvable from SEC data; included in every export for industry joins)"],
        ["gvkey / cusip / permno", "licensed Compustat (GVKEY) / CUSIP / CRSP (PERMNO) identifiers, EMPTY by design: this project does not hold these licensed sources, so the columns ship as honest NA (never fabricated). Map them from CIK in your own WRDS/Compustat/CRSP environment; see JOINING.md in the panel .zip"],
        ["footnote_type", "revenue recognition · going concern · related-party · critical audit matter · mda · risk factors"],
        ["similarity", "cosine similarity to the active query (blank when no query is active)"],
        ["enforced", "yes if the company has SEC enforcement history (AAER). Context, not a prediction"],
        ["accession", "SEC accession number of the source 10-K"], ["edgar_url", "direct link to the filing on sec.gov"],
        ["gunning_fog / avg_sentence_length / word_count / complex_word_pct", "Gunning Fog readability stats of the footnote text"],
        ["complexity_vs_industry", "below / near / above the median Fog of same-SIC-industry peers"],
        ["distinctiveness", "cosine distance from the same-industry, same-type peer centroid (language unusualness)"],
        ["distinctiveness_vs_industry", "typical / distinctive / highly_distinctive vs same-industry peers"],
        ["fiscal_year", "fiscal year (period of report) of the financial statements scored"],
        ["beneish_m", "Beneish M-Score for that company-year (blank if insufficient inputs)"],
        ["beneish_flagged", "yes if M > −1.78 (Beneish's published cutoff). A screen, not a verdict"],
        ["DSRI / GMI / AQI / SGI / DEPI / SGAI / LVGI / TATA", "the eight Beneish component indices"],
        ["dechow_fscore", "Dechow F-Score (probability ÷ 0.0037 unconditional rate)"],
        ["rsst_accruals / ch_receivables / ch_inventory / soft_assets / ch_cash_sales / ch_roa / issuance", "the seven Dechow Model-1 inputs"],
      ] }] },

    { h: "SYSTEMATIC SCREEN · PRE-REGISTERED MULTIPLE-HYPOTHESIS SCREENING", paras: [
        "The SYSTEMATIC SCREEN view runs a rigorous exploratory screen over the two pillars: the association between each selected disclosure-language measure (Gunning Fog complexity, distinctiveness, optionally footnote count) and each selected financial-quality measure (Beneish M-Score and its 8 components; Dechow F-Score and its 7 inputs), within pre-specified subgroups (the full cohort, enforcement status, 5-year filing-year buckets, SIC industries). Unit: the company-year panel, with pairwise deletion per test. Missing values are never zero-imputed.",
        "Its integrity safeguards are structural and cannot be disabled: (1) PRE-REGISTRATION: the full test family is enumerated and recorded (timestamp, cohort definition, spec, SHA-256 of the canonical spec + family) BEFORE any test statistic is computed. A deterministic inclusion rule (pairwise N ≥ 30, non-constant) is applied at enumeration and every excluded candidate is listed with its reason. (2) FULL REPORTING: every registered test appears in the table and the export. Sorting reorders, nothing filters or hides, and reporting a subset misrepresents the screen (the export header says so). (3) MANDATORY CORRECTION: Bonferroni AND Benjamini–Hochberg FDR are always computed across the whole family (raw p, Bonferroni-adjusted p, and FDR q shown for every test, at a fixed two-sided α = 0.05). (4) HONEST LABELING: tests that survive correction are labeled candidate associations that warrant confirmation on independent data, never findings or discoveries. (5) EFFECT SIZE FIRST: the Spearman ρ is shown beside every p-value. Statistical significance is not practical importance (at these N, associations too small to matter can clear any correction). (6) ROBUST METHODS: rank-based (Spearman) statistics throughout, because the financial screens contain documented extreme outliers that invalidate mean/Pearson-based statistics.",
        "Statistics: Spearman rank correlation with average ranks for ties. Two-sided p comes from the t approximation t = ρ·√((n−2)/(1−ρ²)) with df = n−2 (the same approximation scipy.stats.spearmanr and R's cor.test use at these sample sizes). Bonferroni p·m is clamped at 1. Benjamini–Hochberg step-up q-values. The implementation is verified digit-for-digit against scipy (spearmanr and false_discovery_control) on the shipped data.",
        "Framing: a screen is exploratory. It generates candidate hypotheses for confirmation on independent data. It is not confirmatory research, and the correction covers only the registered family (running further screens and reporting the interesting one rebuilds the multiple-comparisons problem). Associations are descriptive rank relationships in this sample. They are not causal and not a statement about any individual company.",
      ] },

    { h: "CITATIONS", paras: [
        "Beneish, M. D. (1999). The Detection of Earnings Manipulation. Financial Analysts Journal, 55(5), 24–36.",
        "Dechow, P. M., Ge, W., Larson, C. R., & Sloan, R. G. (2011). Predicting Material Accounting Misstatements. Contemporary Accounting Research, 28(1), 17–82.",
        "Richardson, S. A., Sloan, R. G., Soliman, M. T., & Tuna, İ. (2005). Accrual reliability, earnings persistence and stock prices. Journal of Accounting and Economics, 39(3), 437–485.",
        "Gunning, R. (1952). The Technique of Clear Writing. McGraw-Hill.",
        "Xiao, S., Liu, Z., Zhang, P., & Muennighoff, N. (2023). C-Pack: Packed Resources for General Text Embeddings (BAAI BGE; bge-small-en-v1.5). arXiv:2309.07597.",
        "McInnes, L., Healy, J., & Melville, J. (2018). UMAP: Uniform Manifold Approximation and Projection for Dimension Reduction. arXiv:1802.03426.",
        "Robertson, S., & Zaragoza, H. (2009). The Probabilistic Relevance Framework: BM25 and Beyond. Foundations and Trends in Information Retrieval, 3(4), 333–389.",
        "Benjamini, Y., & Hochberg, Y. (1995). Controlling the False Discovery Rate: A Practical and Powerful Approach to Multiple Testing. Journal of the Royal Statistical Society B, 57(1), 289–300.",
        "Spearman, C. (1904). The Proof and Measurement of Association between Two Things. American Journal of Psychology, 15(1), 72–101.",
        "U.S. Securities and Exchange Commission. Accounting and Auditing Enforcement Releases (AAERs); EDGAR / company-facts API (data.sec.gov).",
      ] },

    { h: "LIMITATIONS", paras: [
        "Disclosure pillar: similarity, complexity, and distinctiveness describe the resemblance, readability, and unusualness of disclosure LANGUAGE, not the underlying economics or accounting quality. MD&A coverage is partial (some filers file it as a separate exhibit), and a small residual of risk-factor extracts includes executive-officer/section-boundary text. Random-pair cosine is intrinsically high for financial footnotes. The validated capability is concept-level retrieval beyond keywords. Disclosure language does not separate enforced companies (the replicated null).",
        "Financial pillar: the screens are published academic models over reported financials, sample/era-dependent, with material false-positive rates, weak for financial / no-COGS firms, and not re-validated on this corpus (see above). They are screens, not verdicts.",
        "Both pillars: descriptive and comparative only. SEC enforcement history is context, never a prediction. There is no per-company risk score, no ranking by implied concern, and no claim about any individual company.",
        "Descriptive intersection view: the tool can surface companies that are descriptively unusual on multiple INDEPENDENT measures at once (e.g. highly distinctive disclosure language AND a Beneish M-Score above the published threshold AND an enforcement-heavy industry AND a large year-over-year disclosure change) as starting points for HUMAN investigation. It is NOT a risk score, fraud screen, ranking of suspicion, or prediction. There is NO composite score (each measure is reported separately and results are listed alphabetically). Co-occurrence of descriptive measures is descriptive context, never evidence of wrongdoing. The replicated null and the cannot-re-validate caveat both apply.",
      ] },

    { h: "SUGGESTED CITATION (this tool)", paras: [
        `Munger, Joshua (2026). Disclosure Atlas: a browser-based semantic search research instrument for SEC disclosures, with published academic financial-quality screens (Beneish 1999; Dechow et al. 2011). https://disclosure-atlas.vercel.app (retrieved ${today()}).`,
        `Corpus snapshot: ${n(c.footnotes)} footnotes, ${n(c.companies_in_corpus)} companies, filing years ${esc(c.year_min)}-${esc(c.year_max)}. Financial screens cover ${n(fin.candidate_company_years)} candidate company-years. Models version: Beneish 1999 (8-variable); Dechow et al. 2011 (Model 1).`,
      ] },
  ];
}

export function renderMethodsHTML(m, findings) {
  const secs = sections(m, findings);
  const tbl = (t) => `${t.cap ? `<div class="mb-tcap mono">${esc(t.cap)}</div>` : ""}<table class="mb-tbl"><thead><tr>${t.cols.map((c) => `<th class="mono">${esc(c)}</th>`).join("")}</tr></thead><tbody>${t.rows.map((r) => `<tr>${r.map((x, i) => `<td${i === 0 ? ' class="mb-td0 mono"' : ""}>${esc(x)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  return secs.map((s) => `<section class="mb-sec">
    <div class="mb-h mono">${esc(s.h)}</div>
    ${s.lead ? `<p class="mb-lead">${esc(s.lead)}</p>` : ""}
    ${(s.paras || []).map((p) => `<p>${esc(p)}</p>`).join("")}
    ${(s.pre || []).map((p) => `<pre class="mb-pre mono">${esc(p)}</pre>`).join("")}
    ${(s.tables || []).map(tbl).join("")}
  </section>`).join("");
}

export function buildMethodsMD(m, findings) {
  const secs = sections(m, findings);
  const mdTbl = (t) => (t.cap ? `**${t.cap}**\n\n` : "") + `| ${t.cols.join(" | ")} |\n| ${t.cols.map(() => "---").join(" | ")} |\n` + t.rows.map((r) => `| ${r.map((x) => String(x).replace(/\|/g, "/")).join(" | ")} |`).join("\n") + "\n";
  let out = `# Disclosure Atlas · Methods & Reproducibility\n\n_Generated ${today()} · https://disclosure-atlas.vercel.app_\n\n`;
  for (const s of secs) {
    out += `## ${s.h}\n\n`;
    if (s.lead) out += s.lead + "\n\n";
    for (const p of (s.paras || [])) out += p + "\n\n";
    for (const p of (s.pre || [])) out += "```\n" + p + "\n```\n\n";
    for (const t of (s.tables || [])) out += mdTbl(t) + "\n";
  }
  return out;
}
