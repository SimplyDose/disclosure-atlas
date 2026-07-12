// Identifier crosswalk shared by the footnote-level exports (filtered cohort, shortlist, finding
// panel) so every CSV/XLSX joins to Compustat/CRSP/WRDS the same way the company-year panel does.
// Resolvable identifiers come straight from SEC data; the licensed identifiers (GVKEY/CUSIP/PERMNO)
// ship as honest-EMPTY columns — present so a researcher knows exactly where to drop them in, but
// NEVER fabricated (they require licensed sources this dataset does not contain). CIK is the universal
// join key. The company-name/CIK/ticker columns already lead these exports; this adds the rest.
export const XWALK_HEADERS = ["sic_code", "sic_industry", "gvkey", "cusip", "permno"];

// node -> [sic_code, sic_industry, gvkey, cusip, permno]. gvkey/cusip/permno are intentionally "".
// Accepts a null node (e.g. a pasted-query row) and returns all-blank cells.
export const xwalkCells = (n) => [n ? (n.sic || "") : "", n ? (n.ind || "") : "", "", "", ""];
