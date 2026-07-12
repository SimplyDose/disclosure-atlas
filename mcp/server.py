"""Disclosure Atlas MCP server (Phase 6).

A read-only, stateless MCP server exposing the existing computed Disclosure Atlas data (DuckDB + the
JSON/Parquet bundle) as six tools. No new ingestion, no live SEC calls, no Claude API calls. Query
embedding is local (fastembed bge-small, $0). Holds only public research data; no secrets.

HONESTY TRAVELS WITH THE DATA: every tool returning scores / change / multi-measure data includes the
honest framing in its response payload (see honesty.py). The MCP is not a way to strip caveats off the
numbers.

Run locally (stdio):   python mcp/server.py
The functions below are plain callables (the test harness imports them directly) AND registered as MCP
tools, so verification exercises the exact code a client would call.
"""
from __future__ import annotations

import datetime as _dt

from mcp.server.fastmcp import FastMCP

import honesty
from atlas_data import (get_data, normalize_cik, TYPE_KEY, TYPE_FULL, CMP_TEXT, DVI_TEXT,
                        BENEISH_COMPONENTS, DECHOW_COMPONENTS, BENEISH_THRESHOLD)
from cohort import parse_cohort, filtered_indices, build_panel, CODEBOOK, PANEL_COLUMNS

mcp = FastMCP("disclosure-atlas")

# result-size caps
PANEL_MAX, PANEL_HARD = 5000, 20000
SCORES_MAX = 2000
SEARCH_DEFAULT, SEARCH_MAX = 10, 50
CHANGES_DEFAULT, CHANGES_MAX = 50, 500
PROFILE_FOOTNOTE_CAP = 400
EXCERPT_PREVIEW = 600


def _today() -> str:
    return _dt.date.today().isoformat()


def _retrieval() -> dict:
    return {"tool": "Disclosure Atlas MCP", "retrieved": _today(),
            "source": "SEC EDGAR 10-K filings (fixed corpus snapshot)",
            "url": "https://disclosure-atlas.vercel.app"}


# ─────────────────────────────────────────────────────────────────────────────
# 1. export_panel  (PRIORITY)
# ─────────────────────────────────────────────────────────────────────────────
@mcp.tool()
def export_panel(footnote_types: list[str] | None = None, sic_code: str | None = None,
                 industry: str | None = None, enforced_only: bool = False,
                 complexity: str | None = None, distinctiveness: str | None = None,
                 score_filter: str | None = None, year_min: int | None = None,
                 year_max: int | None = None, max_rows: int = PANEL_MAX,
                 include_codebook: bool = True) -> dict:
    """Export the Phase-3 analysis-ready PANEL dataset (one row per company-fiscal-year) for a cohort.

    The priority tool. Returns company-year rows with a full identifier crosswalk so the data joins to
    Compustat/CRSP/WRDS with no manual matching: zero-padded CIK (universal join key), ticker,
    company_name, sic_code, sic_industry, accession - plus gvkey/cusip/permno as honest-EMPTY columns
    (licensed; never fabricated; map from CIK via join_guidance). Also point-in-time filing dates,
    disclosure measures, financial screens (Beneish M + Dechow F, with components), and has_<type>
    availability flags. Missing values are null (NA) - never zero. Includes the data dictionary,
    join_guidance, suggested citation, sample-selection note, and honesty caveats.

    Cohort filters (all optional): footnote_types (revenue_recognition|going_concern|related_party|
    critical_audit_matter|mda|risk_factors), sic_code, industry (exact SIC label), enforced_only,
    complexity (below|near|above), distinctiveness (typical|distinctive|highly_distinctive),
    score_filter (scored|mflag|fhigh), year_min/year_max (filter on FILING year). The panel's
    fiscal_year column is the period of report. max_rows caps output (hard cap 20000).
    """
    data = get_data()
    spec = parse_cohort(data, footnote_types=footnote_types, sic_code=sic_code, industry=industry,
                        enforced_only=enforced_only, complexity=complexity,
                        distinctiveness=distinctiveness, score_filter=score_filter,
                        year_min=year_min, year_max=year_max)
    cap = max(1, min(int(max_rows), PANEL_HARD))
    rows = build_panel(data, filtered_indices(data, spec))

    n_obs = len(rows)
    n_companies = len({r["cik"] for r in rows})
    n_scored = sum(1 for r in rows if r["beneish_m"] is not None)
    truncated = n_obs > cap
    out_rows = rows[:cap]

    result = {
        "cohort": spec.describe(),
        "n_observations": n_obs,
        "n_companies": n_companies,
        "n_scored_company_years": n_scored,
        "returned_rows": len(out_rows),
        "truncated": truncated,
        "max_rows": cap,
        "unit_of_observation": "company-fiscal-year (fiscal_year = 10-K period of report)",
        "columns": PANEL_COLUMNS,
        "rows": out_rows,
        "retrieval": _retrieval(),
        "caveats": honesty.PANEL,
        "missing_data_note": "Empty/null = NA (missing). NEVER interpret as zero. Critical for correct statistics.",
        "point_in_time_note": "filing_date is when each company-year's measures became public; use it to avoid look-ahead bias. The cohort year filter is on filing year; fiscal_year is the period of report.",
        "identifiers_note": honesty.IDENTIFIERS_NOTE,
        "join_guidance": honesty.JOIN_GUIDANCE,
        "suggested_citation": honesty.SUGGESTED_CITATION + f" (retrieved {_today()}).",
        "academic_citations": honesty.ACADEMIC_CITATIONS,
    }
    if include_codebook:
        result["codebook"] = [{"column": c[0], "definition": c[1], "units": c[2], "source": c[3],
                               "date_basis": c[4]} for c in CODEBOOK]
        result["sample_selection"] = (
            "A company-year ENTERS the sample if the cohort filters retained at least one footnote for "
            "that company in that fiscal year. Disclosure measures are computed over ALL footnotes of "
            "each retained company-year (the full disclosure profile, not only the filtered subset). "
            "Financial measures are the Beneish/Dechow screens for that exact company-fiscal-year, "
            "missing (NA) where inputs were insufficient.")
    return result


# ─────────────────────────────────────────────────────────────────────────────
# 2. get_company_profile
# ─────────────────────────────────────────────────────────────────────────────
@mcp.tool()
def get_company_profile(cik: str | None = None, name: str | None = None,
                        max_footnotes: int = PROFILE_FOOTNOTE_CAP) -> dict:
    """Both pillars for one company: disclosure (every footnote with complexity + distinctiveness) and
    financial (Beneish M / Dechow F history with components), plus SEC enforcement context and nearest
    cross-company disclosure neighbors. Provide either cik or name (case-insensitive substring).
    Ambiguous names return a disambiguation list. Descriptive only; caveats included.
    """
    data = get_data()
    if not cik and not name:
        raise ValueError("provide either cik or name")
    resolved, matches = data.resolve_company(cik, name)
    if resolved is None:
        if matches:
            return {"ambiguous": True, "query": cik or name,
                    "matches": [{"cik": c, "company_name": nm} for c, nm in matches[:50]],
                    "note": "Multiple companies matched; call again with a specific cik."}
        return {"found": False, "query": cik or name}

    c = resolved
    idxs = data.cik_to_indices[c]
    nodes = data.nodes
    enforced = bool(nodes[idxs[0]].get("e"))

    foot = []
    for i in sorted(idxs, key=lambda i: (nodes[i]["t"], nodes[i].get("pfy") or 0)):
        n = nodes[i]
        foot.append({
            "footnote_type": TYPE_KEY[n["t"]], "fiscal_year": n.get("pfy"),
            "filing_year": n.get("fd"), "filing_date": n.get("fdate"),
            "gunning_fog": n.get("fog"),
            "complexity_vs_industry": CMP_TEXT.get(n.get("cmp")),
            "distinctiveness": n.get("dst"),
            "distinctiveness_vs_industry": DVI_TEXT.get(n.get("dvi")),
            "accession": n.get("acc"), "edgar_url": n.get("url"),
            "excerpt_preview": data.excerpt(i)[:EXCERPT_PREVIEW],
        })
    foot_trunc = len(foot) > max_footnotes
    foot = foot[:max_footnotes]

    sc = data.scores.get(c)
    fin_years = []
    if sc:
        for y in sc["years"]:
            row = {"fiscal_year": y["y"], "beneish_m": y.get("m"),
                   "beneish_flag": (1 if y.get("mf") else 0) if y.get("m") is not None else None,
                   "beneish_components": y.get("mc", {})}
            if y.get("f") is not None:
                row["dechow_fscore"] = y["f"]
                row["dechow_prob"] = y.get("fp")
                row["dechow_components"] = y.get("fc", {})
            fin_years.append(row)

    # nearest cross-company neighbors aggregated across this company's footnotes
    seen = {}
    for i in idxs:
        for nb_idx, cos in data.neighbors[i][:5]:
            nb = nodes[nb_idx]
            if nb["cik"] == c:
                continue
            key = nb["cik"]
            if key not in seen or cos > seen[key]["similarity"]:
                seen[key] = {"cik": nb["cik"], "company_name": nb["name"],
                             "footnote_type": TYPE_KEY[nb["t"]], "similarity": round(float(cos), 4),
                             "enforced": bool(nb.get("e"))}
    neighbors = sorted(seen.values(), key=lambda x: -x["similarity"])[:15]

    return {
        "found": True,
        "identity": {"cik": c, "company_name": data.cik_name[c],
                     "ticker": data.tickers.get(c, ""),
                     "sic_code": nodes[idxs[0]].get("sic"), "industry": nodes[idxs[0]].get("ind"),
                     "gvkey": "", "cusip": "", "permno": "",
                     "enforced": enforced},
        "identifiers_note": honesty.IDENTIFIERS_NOTE,
        "disclosure_pillar": {"n_footnotes": len(idxs), "footnotes": foot, "truncated": foot_trunc},
        "financial_pillar": {"n_scored_years": len(fin_years), "years": fin_years,
                             "beneish_threshold": BENEISH_THRESHOLD},
        "enforcement_context": {"has_enforcement_history": enforced,
                                "aaers": data.enforcement_detail(c) if enforced else []},
        "nearest_neighbors": neighbors,
        "retrieval": _retrieval(),
        "caveats": honesty.PROFILE,
    }


# ─────────────────────────────────────────────────────────────────────────────
# 3. search_disclosures
# ─────────────────────────────────────────────────────────────────────────────
@mcp.tool()
def search_disclosures(query: str, footnote_types: list[str] | None = None, sic_code: str | None = None,
                       industry: str | None = None, enforced_only: bool = False,
                       year_min: int | None = None, year_max: int | None = None,
                       top_k: int = SEARCH_DEFAULT) -> dict:
    """Semantic search: most similar footnotes to a query passage/description (cosine over bge-small
    embeddings; the query is embedded locally, no API calls). Optional cohort filters. The honest BM25
    keyword baseline is noted in the response. Descriptive resemblance only; caveats included.
    """
    if not query or not query.strip():
        raise ValueError("query must be a non-empty passage or description")
    data = get_data()
    spec = parse_cohort(data, footnote_types=footnote_types, sic_code=sic_code, industry=industry,
                        enforced_only=enforced_only, year_min=year_min, year_max=year_max)
    k = max(1, min(int(top_k), SEARCH_MAX))

    qvec = data.embed_query(query.strip())
    sims = data.cosine_to_all(qvec)

    allow = None
    if spec.types or spec.sic_code or spec.industry or spec.enforced_only or spec.year_min or spec.year_max:
        allow = set(filtered_indices(data, spec))

    import numpy as np
    order = np.argsort(-sims)
    hits = []
    for i in order:
        i = int(i)
        if allow is not None and i not in allow:
            continue
        n = data.nodes[i]
        hits.append({
            "rank": len(hits) + 1, "company_name": n["name"], "cik": n["cik"],
            "ticker": data.tickers.get(n["cik"], ""),
            "sic_code": n.get("sic", ""), "sic_industry": n.get("ind", ""),
            "footnote_type": TYPE_KEY[n["t"]],
            "fiscal_year": n.get("pfy"), "similarity": round(float(sims[i]), 4),
            "enforced": bool(n.get("e")), "accession": n.get("acc"), "edgar_url": n.get("url"),
            "excerpt": data.excerpt(i)[:EXCERPT_PREVIEW],
        })
        if len(hits) >= k:
            break

    return {
        "query": query.strip(),
        "cohort": spec.describe(),
        "method": "cosine similarity over bge-small-en-v1.5 (384-dim) embeddings; query embedded locally (fastembed/ONNX, $0)",
        "top_k": k,
        "results": hits,
        "identifiers_note": honesty.IDENTIFIERS_NOTE,
        "keyword_baseline_note": honesty.KEYWORD_BASELINE,
        "retrieval": _retrieval(),
        "caveats": honesty.SEARCH,
    }


# ─────────────────────────────────────────────────────────────────────────────
# 4. get_financial_scores
# ─────────────────────────────────────────────────────────────────────────────
@mcp.tool()
def get_financial_scores(cik: str | None = None, name: str | None = None,
                         footnote_types: list[str] | None = None, sic_code: str | None = None,
                         industry: str | None = None, enforced_only: bool = False,
                         year_min: int | None = None, year_max: int | None = None,
                         max_rows: int = SCORES_MAX) -> dict:
    """Beneish M-Score (+8 components) and Dechow F-Score (+components) for a single company (cik/name,
    all years) OR a cohort. The cited-screens framing, model limitations, and the cannot-re-validate
    caveat are IN the response payload. These are published academic SCREENS, not verdicts.
    """
    data = get_data()
    framing = {"beneish_model": "Beneish (1999), 8-variable; published cutoff M > -1.78",
               "beneish_threshold": BENEISH_THRESHOLD,
               "dechow_model": "Dechow, Ge, Larson & Sloan (2011), Model 1; F = prob / 0.0037 unconditional rate",
               "dechow_unconditional_rate": 0.0037,
               "interpretation": "M > -1.78 / F > 1 are SCREEN thresholds, not verdicts or probabilities of fraud."}

    def company_block(c):
        sc = data.scores.get(c)
        years = []
        if sc:
            for y in sc["years"]:
                row = {"fiscal_year": y["y"], "beneish_m": y.get("m"),
                       "beneish_flag": (1 if y.get("mf") else 0) if y.get("m") is not None else None,
                       "beneish_components": y.get("mc", {})}
                if y.get("f") is not None:
                    row["dechow_fscore"] = y["f"]; row["dechow_prob"] = y.get("fp")
                    row["dechow_components"] = y.get("fc", {})
                years.append(row)
        first = data.nodes[data.cik_to_indices[c][0]] if data.cik_to_indices.get(c) else {}
        return {"cik": c, "company_name": data.cik_name.get(c, ""),
                "ticker": data.tickers.get(c, ""),
                "sic_code": first.get("sic", ""), "sic_industry": first.get("ind", ""),
                "gvkey": "", "cusip": "", "permno": "",
                "enforced": bool(c in data.aaer), "years": years}

    if cik or name:
        resolved, matches = data.resolve_company(cik, name)
        if resolved is None:
            if matches:
                return {"ambiguous": True, "matches": [{"cik": m[0], "company_name": m[1]} for m in matches[:50]]}
            return {"found": False, "query": cik or name}
        return {"mode": "company", "company": company_block(resolved),
                "model_framing": framing, "identifiers_note": honesty.IDENTIFIERS_NOTE,
                "retrieval": _retrieval(), "caveats": honesty.SCORES}

    # cohort mode
    spec = parse_cohort(data, footnote_types=footnote_types, sic_code=sic_code, industry=industry,
                        enforced_only=enforced_only, year_min=year_min, year_max=year_max)
    cap = max(1, min(int(max_rows), SCORES_MAX))
    ciks = []
    seen = set()
    for i in filtered_indices(data, spec):
        cc = data.nodes[i]["cik"]
        if cc not in seen and cc in data.scores:
            seen.add(cc); ciks.append(cc)
    ciks.sort()
    truncated = len(ciks) > cap
    blocks = [company_block(c) for c in ciks[:cap]]
    return {"mode": "cohort", "cohort": spec.describe(), "n_companies_with_scores": len(ciks),
            "returned_companies": len(blocks), "truncated": truncated, "max_rows": cap,
            "companies": blocks, "model_framing": framing,
            "identifiers_note": honesty.IDENTIFIERS_NOTE, "retrieval": _retrieval(),
            "caveats": honesty.SCORES}


# ─────────────────────────────────────────────────────────────────────────────
# 5. find_disclosure_changes
# ─────────────────────────────────────────────────────────────────────────────
@mcp.tool()
def find_disclosure_changes(footnote_types: list[str] | None = None, sic_code: str | None = None,
                            industry: str | None = None, enforced_only: bool = False,
                            year_min: int | None = None, year_max: int | None = None,
                            top_n: int = CHANGES_DEFAULT, include_excerpts: bool = False) -> dict:
    """Ranked largest YEAR-OVER-YEAR disclosure-language changes (descriptive). For each company+type,
    the change between consecutive available fiscal years is the cosine distance between that
    company-type's principal (longest) excerpt in each year. Optional cohort filters; ranked descending
    by change. A large shift is NOT a red flag - the not-a-red-flag caveat is in the response.
    """
    data = get_data()
    spec = parse_cohort(data, footnote_types=footnote_types, sic_code=sic_code, industry=industry,
                        enforced_only=enforced_only, year_min=year_min, year_max=year_max)
    n = max(1, min(int(top_n), CHANGES_MAX))

    # cohort filter applies to BOTH endpoints (matches the site's filter-composable behavior)
    allow = None
    if spec.types or spec.sic_code or spec.industry or spec.enforced_only or spec.year_min or spec.year_max:
        allow = set(filtered_indices(data, spec))

    events = data.changes()
    out = []
    for ev in events:
        if allow is not None and (ev["idxA"] not in allow or ev["idxB"] not in allow):
            continue
        out.append(ev)
    out.sort(key=lambda e: -e["dist"])
    total = len(out)
    rows = []
    for ev in out[:n]:
        row = {"company_name": ev["name"], "cik": ev["cik"], "ticker": ev["tk"],
               "sic_code": ev["sic"], "sic_industry": ev["ind"],
               "footnote_type": TYPE_KEY[ev["t"]], "year_from": ev["yA"], "year_to": ev["yB"],
               "change_cosine_distance": round(ev["dist"], 4), "enforced": bool(ev["e"])}
        if include_excerpts:
            row["excerpt_from"] = data.excerpt(ev["idxA"])[:EXCERPT_PREVIEW]
            row["excerpt_to"] = data.excerpt(ev["idxB"])[:EXCERPT_PREVIEW]
        rows.append(row)

    return {
        "cohort": spec.describe(),
        "method": "cosine distance between consecutive available fiscal years' principal (longest) excerpt per company+footnote-type (bge-small embeddings)",
        "n_events_total": total, "returned": len(rows), "truncated": total > n, "top_n": n,
        "results": rows,
        "identifiers_note": honesty.IDENTIFIERS_NOTE,
        "retrieval": _retrieval(),
        "caveats": honesty.CHANGES,
    }


# ─────────────────────────────────────────────────────────────────────────────
# 6. query_cohort_stats
# ─────────────────────────────────────────────────────────────────────────────
def _quartiles(vals):
    import numpy as np
    a = np.array([v for v in vals if v is not None], dtype=float)
    if a.size == 0:
        return None
    q = np.percentile(a, [0, 25, 50, 75, 100])
    return {"n": int(a.size), "min": round(float(q[0]), 4), "p25": round(float(q[1]), 4),
            "median": round(float(q[2]), 4), "p75": round(float(q[3]), 4),
            "max": round(float(q[4]), 4), "mean": round(float(a.mean()), 4)}


@mcp.tool()
def query_cohort_stats(footnote_types: list[str] | None = None, sic_code: str | None = None,
                       industry: str | None = None, enforced_only: bool = False,
                       complexity: str | None = None, distinctiveness: str | None = None,
                       score_filter: str | None = None, year_min: int | None = None,
                       year_max: int | None = None) -> dict:
    """Aggregate DESCRIPTIVE statistics across both pillars for a cohort: counts (footnotes, companies,
    company-years, by type, enforced share), complexity distribution, distinctiveness distribution,
    score distribution (Beneish M quartiles, % M-flagged, Dechow F where present), and a light language-
    clustering descriptor (mean within-cohort cosine vs the intrinsically high random-pair floor).
    Descriptive only - no ranking, no risk score. Caveats included.
    """
    import numpy as np
    data = get_data()
    spec = parse_cohort(data, footnote_types=footnote_types, sic_code=sic_code, industry=industry,
                        enforced_only=enforced_only, complexity=complexity,
                        distinctiveness=distinctiveness, score_filter=score_filter,
                        year_min=year_min, year_max=year_max)
    idxs = filtered_indices(data, spec)
    nodes = data.nodes
    n_foot = len(idxs)
    if n_foot == 0:
        return {"cohort": spec.describe(), "n_footnotes": 0,
                "note": "No footnotes match this cohort.", "caveats": honesty.COHORT_STATS}

    ciks = set(); coyears = set(); by_type = {}; enforced = 0
    fogs = []; dsts = []; cmp_counts = {-1: 0, 0: 0, 1: 0}; dvi_counts = {0: 0, 1: 0, 2: 0}
    ms_vals = []; mflag = 0
    for i in idxs:
        n = nodes[i]
        ciks.add(n["cik"])
        if n.get("pfy") is not None:
            coyears.add(f"{n['cik']}|{n['pfy']}")
        by_type[TYPE_KEY[n["t"]]] = by_type.get(TYPE_KEY[n["t"]], 0) + 1
        if n.get("e"):
            enforced += 1
        if n.get("fog") is not None:
            fogs.append(n["fog"])
        if n.get("dst") is not None:
            dsts.append(n["dst"])
        if n.get("cmp") in cmp_counts:
            cmp_counts[n["cmp"]] += 1
        if n.get("dvi") in dvi_counts:
            dvi_counts[n["dvi"]] += 1
        if n.get("ms") is not None:
            ms_vals.append(n["ms"])
        if n.get("mflag") == 1:
            mflag += 1

    # Dechow F distribution from scores.json over the cohort's company-years
    f_vals = []
    for key in coyears:
        cik, fy = key.rsplit("|", 1)
        sc = data.scores.get(cik)
        if sc:
            for y in sc["years"]:
                if y["y"] == int(fy) and y.get("f") is not None:
                    f_vals.append(y["f"])

    # light language-clustering descriptor: mean within-cohort cosine via the centroid identity,
    # on a bounded sample (keeps payload + compute small). Compared to the intrinsically high floor.
    sample = idxs if n_foot <= 3000 else [idxs[int(j)] for j in np.linspace(0, n_foot - 1, 3000)]
    vecs = data.emb[sample].astype(np.float32) * data.inv
    norms = np.linalg.norm(vecs, axis=1)
    unit = vecs / norms[:, None]
    m = unit.shape[0]
    centroid_sq = float(np.dot(unit.sum(0), unit.sum(0)))
    mean_pairwise = (centroid_sq - m) / (m * (m - 1)) if m > 1 else None

    return {
        "cohort": spec.describe(),
        "counts": {"footnotes": n_foot, "companies": len(ciks), "company_years": len(coyears),
                   "by_footnote_type": by_type,
                   "enforced_footnotes": enforced,
                   "enforced_share": round(enforced / n_foot, 4)},
        "complexity_distribution": {"gunning_fog": _quartiles(fogs),
                                    "vs_industry": {"below": cmp_counts[-1], "near": cmp_counts[0],
                                                    "above": cmp_counts[1]}},
        "distinctiveness_distribution": {"value": _quartiles(dsts),
                                         "tiers": {"typical": dvi_counts[0], "distinctive": dvi_counts[1],
                                                   "highly_distinctive": dvi_counts[2]}},
        "score_distribution": {
            "beneish_m": _quartiles(ms_vals),
            "n_m_flagged": mflag,
            "pct_m_flagged": round(mflag / len(ms_vals), 4) if ms_vals else None,
            "dechow_fscore": _quartiles(f_vals),
        },
        "language_clustering": {
            "mean_within_cohort_cosine": round(mean_pairwise, 4) if mean_pairwise is not None else None,
            "sampled_footnotes": m,
            "interpretation": "Mean pairwise cosine among the cohort's footnotes. Financial footnotes are intrinsically similar, so this sits on a HIGH floor (random-pair cosine ~0.65); it is a descriptive cohesion descriptor, not a finding or a separation result.",
        },
        "retrieval": _retrieval(),
        "caveats": honesty.COHORT_STATS,
    }


if __name__ == "__main__":
    mcp.run()
