"""Shared cohort filtering + panel construction.

`passes()` reproduces constellation.js `_passesFilter` exactly so MCP cohort counts match the
website's. `build_panel()` reproduces dataset.js `buildPanel` + the COLS registry so the exported
panel and its codebook are identical to the site's downloadable bundle.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

from atlas_data import (AtlasData, TYPE_KEY, KEY_TYPE, CMP_TO_INT, DVI_TO_INT,
                        BENEISH_COMPONENTS, DECHOW_COMPONENTS)


def js_round(v, d):
    """Match JS num(v,d) = Math.round(v*10^d)/10^d (round-half-up), returns None for None."""
    if v is None:
        return None
    p = 10 ** d
    return math.floor(v * p + 0.5) / p


@dataclass
class CohortSpec:
    types: set[int] = field(default_factory=set)   # empty => all
    sic_code: str | None = None
    industry: str | None = None
    enforced_only: bool = False
    complexity: int | None = None                  # -1/0/1
    distinctiveness: int | None = None             # 0/1/2
    score_filter: str | None = None                # scored|mflag|fhigh
    year_min: int | None = None
    year_max: int | None = None

    def describe(self) -> str:
        parts = []
        if self.types:
            parts.append("types=" + ",".join(sorted(TYPE_KEY[t] for t in self.types)))
        else:
            parts.append("types=all")
        if self.sic_code:
            parts.append(f"sic={self.sic_code}")
        if self.industry:
            parts.append(f"industry={self.industry}")
        if self.enforced_only:
            parts.append("enforced_only")
        if self.complexity is not None:
            parts.append("complexity=" + {-1: "below", 0: "near", 1: "above"}[self.complexity])
        if self.distinctiveness is not None:
            parts.append("distinctiveness=" + {0: "typical", 1: "distinctive", 2: "highly_distinctive"}[self.distinctiveness])
        if self.score_filter:
            parts.append(f"score={self.score_filter}")
        if self.year_min:
            parts.append(f"filing_year>={self.year_min}")
        if self.year_max:
            parts.append(f"filing_year<={self.year_max}")
        return "; ".join(parts) if parts else "all footnotes"


def parse_cohort(data: AtlasData, *, footnote_types=None, sic_code=None, industry=None,
                 enforced_only=False, complexity=None, distinctiveness=None,
                 score_filter=None, year_min=None, year_max=None) -> CohortSpec:
    """Validate raw tool inputs into a CohortSpec. Raises ValueError on bad input (no silent empties)."""
    types: set[int] = set()
    if footnote_types:
        if isinstance(footnote_types, str):
            footnote_types = [footnote_types]
        for ft in footnote_types:
            key = str(ft).strip().lower()
            if key in ("all", ""):
                types = set()
                break
            if key not in KEY_TYPE:
                raise ValueError(f"unknown footnote_type {ft!r}; valid: {sorted(set(TYPE_KEY.values()))}")
            types.add(KEY_TYPE[key])

    if sic_code is not None:
        sic_code = str(sic_code).strip()
        valid_sics = {n.get("sic") for n in data.nodes}
        if sic_code not in valid_sics:
            raise ValueError(f"unknown sic_code {sic_code!r} (no footnotes carry it)")

    if industry is not None:
        industry = str(industry).strip()
        valid_inds = {n.get("ind") for n in data.nodes}
        if industry not in valid_inds:
            raise ValueError(f"unknown industry {industry!r}; see manifest.industries for valid values")

    cmp_i = None
    if complexity is not None:
        key = str(complexity).strip().lower()
        if key not in CMP_TO_INT:
            raise ValueError(f"complexity must be one of {list(CMP_TO_INT)}; got {complexity!r}")
        cmp_i = CMP_TO_INT[key]

    dvi_i = None
    if distinctiveness is not None:
        key = str(distinctiveness).strip().lower()
        if key not in DVI_TO_INT:
            raise ValueError(f"distinctiveness must be one of {list(DVI_TO_INT)}; got {distinctiveness!r}")
        dvi_i = DVI_TO_INT[key]

    if score_filter is not None:
        score_filter = str(score_filter).strip().lower()
        if score_filter not in ("scored", "mflag", "fhigh"):
            raise ValueError("score_filter must be one of scored|mflag|fhigh")

    for nm, v in (("year_min", year_min), ("year_max", year_max)):
        if v is not None and not (1990 <= int(v) <= 2030):
            raise ValueError(f"{nm} out of range (1990-2030): {v}")
    if year_min and year_max and int(year_min) > int(year_max):
        raise ValueError("year_min must be <= year_max")

    return CohortSpec(types=types, sic_code=sic_code, industry=industry,
                      enforced_only=bool(enforced_only), complexity=cmp_i,
                      distinctiveness=dvi_i, score_filter=score_filter,
                      year_min=int(year_min) if year_min else None,
                      year_max=int(year_max) if year_max else None)


def passes(n: dict, c: CohortSpec) -> bool:
    """Reproduces constellation.js _passesFilter exactly."""
    if c.types and n["t"] not in c.types:
        return False
    if c.industry and n.get("ind") != c.industry:
        return False
    if c.sic_code and n.get("sic") != c.sic_code:
        return False
    if c.enforced_only and not n.get("e"):
        return False
    if c.complexity is not None and n.get("cmp") != c.complexity:
        return False
    if c.distinctiveness is not None and n.get("dvi") != c.distinctiveness:
        return False
    if c.score_filter:
        if c.score_filter == "scored" and n.get("ms") is None and n.get("fs") is None:
            return False
        if c.score_filter == "mflag" and n.get("mflag") != 1:
            return False
        if c.score_filter == "fhigh" and not (n.get("fs") is not None and n["fs"] > 1):
            return False
    if c.year_min or c.year_max:
        try:
            y = int(n.get("fd"))
        except (TypeError, ValueError):
            return False
        if c.year_min and y < c.year_min:
            return False
        if c.year_max and y > c.year_max:
            return False
    return True


def filtered_indices(data: AtlasData, c: CohortSpec) -> list[int]:
    return [i for i, n in enumerate(data.nodes) if passes(n, c)]


# ── panel column registry (mirrors dataset.js COLS) ──
def _company_year(scores, cik, fy):
    sc = scores.get(cik)
    if not sc:
        return None
    for y in sc["years"]:
        if y.get("y") == fy:
            return y
    return None


def build_panel(data: AtlasData, indices: list[int]):
    """Reproduce dataset.js buildPanel: group filtered nodes by cik|pfy -> company-year rows."""
    by_key: dict[str, list[int]] = {}
    for i in indices:
        n = data.nodes[i]
        if n.get("pfy") is None:
            continue
        by_key.setdefault(f"{n['cik']}|{n['pfy']}", []).append(i)

    rows = []
    for key, idxs in by_key.items():
        sep = key.rindex("|")
        cik, fy = key[:sep], int(key[sep + 1:])
        first = data.nodes[idxs[0]]
        fog_sum = fog_n = dst_sum = dst_n = 0
        has = {t: 0 for t in range(6)}
        for i in idxs:
            n = data.nodes[i]
            if n.get("fog") is not None:
                fog_sum += n["fog"]; fog_n += 1
            if n.get("dst") is not None:
                dst_sum += n["dst"]; dst_n += 1
            has[n["t"]] = 1
        yr = _company_year(data.scores, cik, fy)
        m = yr["m"] if yr and yr.get("m") is not None else None
        f = yr["f"] if yr and yr.get("f") is not None else None
        rows.append({
            "cik": cik, "ticker": data.tickers.get(cik, ""), "company_name": first["name"],
            "sic_code": first.get("sic", ""), "sic_industry": first.get("ind", ""),
            "gvkey": "", "cusip": "", "permno": "",
            "fiscal_year": fy, "filing_date": first.get("fdate", ""),
            "accession": first.get("acc", ""), "n_footnotes": len(idxs),
            "gunning_fog": js_round(fog_sum / fog_n, 2) if fog_n else None,
            "distinctiveness": js_round(dst_sum / dst_n, 4) if dst_n else None,
            **{f"has_{TYPE_KEY[t]}": has[t] for t in range(6)},
            "beneish_m": m,
            "beneish_flag": (1 if yr.get("mf") else 0) if (yr and yr.get("m") is not None) else None,
            **{f"beneish_{k.lower()}": (yr.get("mc", {}).get(k) if yr else None) for k in BENEISH_COMPONENTS},
            "dechow_fscore": f,
            "dechow_prob": yr["fp"] if yr and yr.get("fp") is not None else None,
            **{f"dechow_{k}": (yr.get("fc", {}).get(k) if yr else None) for k in DECHOW_COMPONENTS},
            "enforced": 1 if first.get("e") else 0,
        })
    rows.sort(key=lambda r: (r["cik"], r["fiscal_year"]))
    return rows


# column codebook (definition / units / source / date-basis) — mirrors dataset.js COLS
CODEBOOK = [
    ("cik", "SEC Central Index Key, zero-padded - PRIMARY join key to Compustat/CRSP/WRDS (CIK to GVKEY/PERMNO)", "id", "SEC EDGAR", "time-invariant"),
    ("ticker", "Exchange ticker where resolvable from SEC company_tickers, else missing", "id", "SEC company_tickers", "as of corpus construction"),
    ("company_name", "SEC conformed company name", "text", "SEC EDGAR", "as filed"),
    ("sic_code", "4-digit SIC industry classification code", "id", "SEC EDGAR", "time-invariant"),
    ("sic_industry", "SIC industry description", "text", "SEC EDGAR", "time-invariant"),
    ("gvkey", "Compustat firm identifier - EMPTY by design: a licensed Compustat/WRDS field this dataset does not contain. Map from CIK in your WRDS environment (see JOINING); never fabricated", "id (licensed)", "Compustat/WRDS - not included; join on CIK", "supply from your licensed source"),
    ("cusip", "CUSIP security identifier - EMPTY by design: a licensed identifier this dataset does not contain. Map from CIK in your WRDS/CRSP/Compustat environment; never fabricated", "id (licensed)", "CUSIP/CRSP/Compustat - not included; join on CIK", "supply from your licensed source"),
    ("permno", "CRSP permanent security identifier - EMPTY by design: a licensed CRSP field this dataset does not contain. Map from CIK via the CRSP/Compustat Merged link; never fabricated", "id (licensed)", "CRSP/WRDS - not included; join on CIK", "supply from your licensed source"),
    ("fiscal_year", "Fiscal year (period of report) - the panel time index", "year", "SEC 10-K period_of_report", "period of report"),
    ("filing_date", "Date the 10-K was filed - the date these measures became public; use for point-in-time / look-ahead control", "YYYY-MM-DD", "SEC EDGAR", "POINT-IN-TIME"),
    ("accession", "SEC accession number of the source 10-K filing", "id", "SEC EDGAR", "filing identifier"),
    ("n_footnotes", "Number of footnote excerpts captured for this company-year", "count", "Disclosure Atlas", "known at filing_date"),
    ("gunning_fog", "Gunning Fog readability index - company-year mean across footnotes (descriptive complexity, NOT a risk measure)", "grade level", "Disclosure Atlas (Gunning 1952)", "known at filing_date"),
    ("distinctiveness", "Mean cosine distance from same-SIC-industry, same-type peer centroid - descriptive language unusualness", "0-1", "Disclosure Atlas (bge-small-en-v1.5)", "known at filing_date"),
]
for _t in range(6):
    CODEBOOK.append((f"has_{TYPE_KEY[_t]}", f"1 if a {TYPE_KEY[_t].replace('_',' ')} footnote is present this company-year, else 0", "0/1", "Disclosure Atlas", "known at filing_date"))
CODEBOOK.append(("beneish_m", "Beneish M-Score (Beneish 1999), 8-variable - a published earnings-manipulation SCREEN, not a verdict; missing if inputs insufficient", "score", "Beneish 1999", "known at filing_date"))
CODEBOOK.append(("beneish_flag", "1 if M > -1.78 (Beneish's published cutoff), else 0; missing if no M - a screen with a documented high false-positive rate", "0/1", "Beneish 1999", "known at filing_date"))
for _k in BENEISH_COMPONENTS:
    CODEBOOK.append((f"beneish_{_k.lower()}", f"Beneish M-Score component index: {_k}", "index", "Beneish 1999", "known at filing_date"))
CODEBOOK.append(("dechow_fscore", "Dechow F-Score (Dechow et al. 2011, Model 1) = predicted probability / 0.0037 unconditional rate; F>1 = above the base rate, NOT a probability of fraud; missing if inputs insufficient", "score", "Dechow et al. 2011", "known at filing_date"))
CODEBOOK.append(("dechow_prob", "Dechow Model-1 predicted misstatement probability (logistic)", "probability", "Dechow et al. 2011", "known at filing_date"))
for _k in DECHOW_COMPONENTS:
    CODEBOOK.append((f"dechow_{_k}", f"Dechow Model-1 input: {_k.replace('_',' ')}", "ratio", "Dechow et al. 2011", "known at filing_date"))
CODEBOOK.append(("enforced", "1 if the company has SEC AAER enforcement history, else 0 - descriptive CONTEXT about the company, NOT an outcome or a prediction from its disclosures", "0/1", "SEC AAERs", "company-level context"))

PANEL_COLUMNS = [row[0] for row in CODEBOOK]
