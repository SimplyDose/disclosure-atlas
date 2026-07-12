"""Centralized honesty / caveat framing for the Disclosure Atlas MCP server.

THE most important module. An MCP pulls numbers out of the instrument *without the website's
surrounding copy*, so the caveats must ride inside every response payload. This is the single
source of truth for that framing; tools attach the relevant block to their results. The MCP must
never be a way to strip the caveats off the numbers.

Wording is kept consistent with app/src/methods.js and docs/VALIDATION_RESULTS.md.
"""

# ── individual caveat statements (reused, composed per tool) ──
DESCRIPTIVE_ONLY = (
    "Descriptive only. These are language, readability, and published-screen measures — never a "
    "judgment, prediction, or accusation about any company."
)

CITED_SCREENS = (
    "The Beneish M-Score (Beneish 1999; 8-variable; published cutoff M > -1.78, with a documented "
    "high false-positive rate) and the Dechow F-Score (Dechow, Ge, Larson & Sloan 2011, Model 1; "
    "F > 1 means above the 0.0037 unconditional base rate, NOT a probability of fraud) are published, "
    "peer-reviewed academic SCREENS — not verdicts, and not our judgment."
)

CANNOT_REVALIDATE = (
    "This dataset cannot re-validate these models: SEC XBRL structured financials begin ~2009, but "
    "most enforcement cases in this corpus predate that, and enforced vs. clean score distributions "
    "do not separate in this sample. The basis that these models carry signal is the published "
    "literature, presented as such — not a claim this dataset independently demonstrates."
)

REPLICATED_NULL = (
    "Replicated null: across this corpus, disclosure language does NOT separate SEC-enforced from "
    "matched-clean companies (holds at 94,455 footnotes across 6 footnote types). Disclosure language "
    "does not predict enforcement."
)

CHANGE_NOT_A_FLAG = (
    "A large year-over-year change in disclosure language is NOT a red flag, not suspicious, and not "
    "predictive of anything. It is a neutral, descriptive measure (cosine distance between consecutive "
    "available fiscal years' principal excerpt) and a starting point for a researcher to read what "
    "changed."
)

NO_RISK_SCORE = (
    "There is no per-company risk score, no composite, and no ranking by implied concern. SEC "
    "enforcement history is descriptive context about a company, never an outcome or a prediction. "
    "Co-occurrence of descriptive measures is descriptive context, never evidence of wrongdoing."
)

KEYWORD_BASELINE = (
    "Honest baseline: a BM25 keyword ranking is the comparison point for semantic search. The "
    "validated capability of this instrument is concept-level retrieval that finds matches keyword "
    "overlap misses; it does not carry any enforcement signal (see the replicated null)."
)

ENFORCEMENT_CONTEXT = (
    "SEC enforcement history (AAERs) is attached as descriptive context about a company. It is never a "
    "prediction derived from the company's disclosures, and was never fed to any model or embedding."
)

DISTINCTIVENESS_DEF = (
    "Distinctiveness = cosine distance of a footnote's embedding from the centroid of same-SIC-industry, "
    "same-type peers. Tiers (distribution-relative within each industry x type group): typical (<=75th "
    "pct) / distinctive (75-93rd) / highly_distinctive (>93rd). A descriptive measure of language "
    "unusualness, not a finding."
)

COMPLEXITY_DEF = (
    "Complexity = the Gunning Fog readability index of the footnote text; complexity_vs_industry = "
    "below / near / above the median Fog of same-SIC-industry peers ('near' = within +/-10% of the "
    "group median). A descriptive readability measure, not a risk measure."
)

# ── composed blocks per tool family ──
PANEL = [DESCRIPTIVE_ONLY, CITED_SCREENS, CANNOT_REVALIDATE, REPLICATED_NULL, NO_RISK_SCORE]
SCORES = [DESCRIPTIVE_ONLY, CITED_SCREENS, CANNOT_REVALIDATE, REPLICATED_NULL, NO_RISK_SCORE]
CHANGES = [CHANGE_NOT_A_FLAG, REPLICATED_NULL, DESCRIPTIVE_ONLY, NO_RISK_SCORE]
SEARCH = [DESCRIPTIVE_ONLY, KEYWORD_BASELINE, REPLICATED_NULL]
PROFILE = [DESCRIPTIVE_ONLY, COMPLEXITY_DEF, DISTINCTIVENESS_DEF, CITED_SCREENS, CANNOT_REVALIDATE,
           REPLICATED_NULL, ENFORCEMENT_CONTEXT, NO_RISK_SCORE]
COHORT_STATS = [DESCRIPTIVE_ONLY, COMPLEXITY_DEF, DISTINCTIVENESS_DEF, CITED_SCREENS,
                CANNOT_REVALIDATE, REPLICATED_NULL, NO_RISK_SCORE]

# ── identifier crosswalk / join guidance (rides with every payload that carries identifiers) ──
IDENTIFIERS_NOTE = (
    "Identifiers travel with the data so it joins to existing databases without manual matching. CIK is "
    "the zero-padded 10-digit UNIVERSAL join key (keep it a STRING - leading zeros matter). Resolvable "
    "identifiers (cik, ticker, company_name, sic_code, sic_industry, accession) are populated from SEC "
    "data; ticker is blank where SEC company_tickers has no current mapping (join on CIK for "
    "completeness). Licensed identifiers (gvkey, cusip, permno) are EMPTY by design - they require "
    "Compustat/CRSP/WRDS, which this dataset does not contain, and are NEVER fabricated. Map them from "
    "CIK in your own licensed environment."
)

JOIN_GUIDANCE = {
    "primary_key": "cik (zero-padded 10-digit string)",
    "company_year_key": ["cik", "fiscal_year"],
    "resolvable_identifiers": ["cik", "ticker", "company_name", "sic_code", "sic_industry", "accession"],
    "licensed_identifiers_empty_by_design": ["gvkey", "cusip", "permno"],
    "cik_to_gvkey": ("Compustat 'company' table or the CCM (CRSP/Compustat Merged) link, which carries "
                     "CIK. A CIK can map to multiple GVKEYs over time (renames/re-incorporation); join "
                     "on a date."),
    "cik_to_permno": ("CIK -> GVKEY via CCM, then GVKEY -> LPERMNO via the CRSP/Compustat Merged link, "
                      "respecting LINKDT/LINKENDDT and LINKTYPE/LINKPRIM = P."),
    "cusip": "available from CRSP/Compustat once linked by PERMNO/GVKEY.",
    "point_in_time": ("filing_date is when each company-year's measures became public; align "
                      "market/return data to it and respect link validity windows to avoid look-ahead "
                      "bias."),
}

SUGGESTED_CITATION = (
    "Disclosure Atlas (2026). A comparative disclosure semantic-search instrument over SEC 10-K "
    "footnotes, with published academic financial-quality screens (Beneish 1999; Dechow et al. 2011). "
    "https://disclosure-atlas.vercel.app"
)

ACADEMIC_CITATIONS = [
    "Beneish, M. D. (1999). The Detection of Earnings Manipulation. Financial Analysts Journal, "
    "55(5), 24-36.",
    "Dechow, P. M., Ge, W., Larson, C. R., & Sloan, R. G. (2011). Predicting Material Accounting "
    "Misstatements. Contemporary Accounting Research, 28(1), 17-82.",
    "Gunning, R. (1952). The Technique of Clear Writing. McGraw-Hill.",
]
