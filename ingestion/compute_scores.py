"""Chapter D / step 4 — compute Beneish M-Score (1999) + Dechow F-Score (2011, Model 1)
per (cik, fiscal_year) from the `financials` table. Idempotent (INSERT OR REPLACE). $0.

Honesty: published academic formulas — Beneish (1999), Financial Analysts Journal 55(5);
Dechow, Ge, Larson & Sloan (2011), Contemporary Accounting Research 28(1), Model 1. A company-year with insufficient inputs gets NO score for that model and a recorded
reason — never a fabricated/partial one. Components (the drivers) are stored as JSON so every score
is reproducible from the stored inputs + the cited formula. Writes coverage to
validation/chapter_d_coverage.json.

Run:  python ingestion/compute_scores.py
"""
from __future__ import annotations

import json
import math
from collections import Counter
from datetime import datetime
from pathlib import Path

from db import connect
from db_financials import ensure_financials_schema, LINE_ITEMS

ROOT = Path(__file__).resolve().parent.parent
COVERAGE = ROOT / "validation" / "chapter_d_coverage.json"
MODELS_VERSION = "beneish1999-8var; dechow2011-model1"
BENEISH_THRESHOLD = -1.78          # Beneish (1999): M > -1.78 => model flags likely manipulation
DECHOW_UNCONDITIONAL = 0.0037      # Dechow et al. (2011) unconditional misstatement rate


def _n(x):
    """Coerce to float or None."""
    return None if x is None else float(x)


def _req(d: dict, keys: list[str]):
    """Return None if any required key is missing/None; else a dict of those values."""
    out = {}
    for k in keys:
        v = d.get(k)
        if v is None:
            return None
        out[k] = float(v)
    return out


def beneish(t: dict, p: dict):
    """Beneish (1999) 8-variable M-Score. Returns (M, flag, components) or (None, None, reason)."""
    core = ["revenue", "receivables", "cogs", "current_assets", "ppe_net",
            "total_assets", "current_liabilities", "cfo"]
    ct = _req(t, core); cp = _req(p, core)
    if ct is None or cp is None:
        return None, None, "insufficient: missing core balance/income inputs (t or t-1)"
    # income from continuing operations; fall back to net income (flagged)
    ic_t = t.get("income_cont_ops"); fb = False
    if ic_t is None:
        ic_t = t.get("net_income"); fb = True
    if ic_t is None:
        return None, None, "insufficient: no income (continuing ops or net) for TATA"
    ic_t = float(ic_t)
    s_t, s_p = ct["revenue"], cp["revenue"]
    if s_t <= 0 or s_p <= 0:
        return None, None, "insufficient: non-positive sales (t or t-1)"
    ta_t, ta_p = ct["total_assets"], cp["total_assets"]
    if ta_t <= 0 or ta_p <= 0:
        return None, None, "insufficient: non-positive total assets"
    rec_t, rec_p = ct["receivables"], cp["receivables"]
    if rec_p == 0:
        return None, None, "insufficient: zero prior receivables (DSRI undefined)"
    # indices
    DSRI = (rec_t / s_t) / (rec_p / s_p)
    gm_t = (s_t - ct["cogs"]) / s_t
    gm_p = (s_p - cp["cogs"]) / s_p
    if gm_t == 0:
        return None, None, "insufficient: zero current gross margin (GMI undefined)"
    GMI = gm_p / gm_t
    soft_t = 1.0 - (ct["current_assets"] + ct["ppe_net"]) / ta_t
    soft_p = 1.0 - (cp["current_assets"] + cp["ppe_net"]) / ta_p
    if soft_p == 0:
        return None, None, "insufficient: zero prior soft-asset ratio (AQI undefined)"
    AQI = soft_t / soft_p
    SGI = s_t / s_p
    # DEPI — neutral (=1) when depreciation not reported (documented convention)
    dep_t, dep_p = t.get("depreciation"), p.get("depreciation")
    neutral_depi = False
    if dep_t is None or dep_p is None:
        DEPI = 1.0; neutral_depi = True
    else:
        dr_t_den = float(dep_t) + ct["ppe_net"]; dr_p_den = float(dep_p) + cp["ppe_net"]
        if dr_t_den == 0 or dr_p_den == 0 or (float(dep_t) + ct["ppe_net"]) == 0:
            DEPI = 1.0; neutral_depi = True
        else:
            dr_t = float(dep_t) / dr_t_den; dr_p = float(dep_p) / dr_p_den
            DEPI = (dr_p / dr_t) if dr_t else 1.0
            if not dr_t:
                neutral_depi = True
    # SGAI — neutral (=1) when SG&A not reported
    sga_t, sga_p = t.get("sga"), p.get("sga")
    neutral_sgai = False
    if sga_t is None or sga_p is None:
        SGAI = 1.0; neutral_sgai = True
    else:
        prev = float(sga_p) / s_p
        SGAI = ((float(sga_t) / s_t) / prev) if prev else 1.0
        if not prev:
            neutral_sgai = True
    ltd_t = t.get("ltd_noncurrent") or 0.0; ltd_p = p.get("ltd_noncurrent") or 0.0
    lev_t = (ct["current_liabilities"] + float(ltd_t)) / ta_t
    lev_p = (cp["current_liabilities"] + float(ltd_p)) / ta_p
    if lev_p == 0:
        return None, None, "insufficient: zero prior leverage (LVGI undefined)"
    LVGI = lev_t / lev_p
    TATA = (ic_t - ct["cfo"]) / ta_t

    M = (-4.840 + 0.920 * DSRI + 0.528 * GMI + 0.404 * AQI + 0.892 * SGI
         + 0.115 * DEPI - 0.172 * SGAI + 4.679 * TATA - 0.327 * LVGI)
    if not math.isfinite(M):
        return None, None, "insufficient: non-finite M (degenerate inputs)"
    comp = {"DSRI": round(DSRI, 4), "GMI": round(GMI, 4), "AQI": round(AQI, 4),
            "SGI": round(SGI, 4), "DEPI": round(DEPI, 4), "SGAI": round(SGAI, 4),
            "LVGI": round(LVGI, 4), "TATA": round(TATA, 4),
            "neutral_depi": neutral_depi, "neutral_sgai": neutral_sgai,
            "income_cont_ops_fallback_net": fb}
    return round(M, 4), bool(M > BENEISH_THRESHOLD), comp


def dechow(t: dict, p: dict, pp: dict):
    """Dechow et al. (2011) F-Score, Model 1. Needs t, t-1, and t-2 (for avg-assets ROA &
    prior cash sales). Returns (pred, prob, fscore, components) or (None,None,None,reason)."""
    # inventory is treated as a genuinely-optional balance item (a firm not tagging InventoryNet
    # has none -> Δinventory = 0), so it is NOT required; absence does not void the F-Score.
    core = ["total_assets", "current_assets", "current_liabilities", "total_liabilities",
            "receivables", "revenue", "net_income", "cash"]
    ct = _req(t, core); cp = _req(p, core)
    if ct is None or cp is None:
        return None, None, None, "insufficient: missing core inputs (t or t-1)"
    if pp is None or pp.get("total_assets") is None or pp.get("receivables") is None:
        return None, None, None, "insufficient: needs t-2 total_assets & receivables (avg-assets ROA / prior cash sales)"
    ta_t, ta_p, ta_pp = ct["total_assets"], cp["total_assets"], float(pp["total_assets"])
    avgTA_t = (ta_t + ta_p) / 2.0
    avgTA_p = (ta_p + ta_pp) / 2.0
    if avgTA_t <= 0 or avgTA_p <= 0 or ta_t <= 0:
        return None, None, None, "insufficient: non-positive (avg) total assets"
    opt = lambda d, k: float(d.get(k) or 0.0)   # genuinely-optional balance items default 0
    # working capital, non-current operating, financial (Richardson/RSST decomposition)
    def WC(c, d): return (c["current_assets"] - d_cash_sti(c, d)) - (c["current_liabilities"] - opt(d, "debt_current"))
    def d_cash_sti(c, d): return c["cash"] + opt(d, "st_investments")
    def NCO(c, d): return (c["total_assets"] - c["current_assets"] - opt(d, "lt_investments")) - \
        (c["total_liabilities"] - c["current_liabilities"] - opt(d, "ltd_noncurrent"))
    def FIN(c, d): return (opt(d, "st_investments") + opt(d, "lt_investments")) - \
        (opt(d, "ltd_noncurrent") + opt(d, "debt_current") + opt(d, "preferred_stock"))
    rsst = ((WC(ct, t) - WC(cp, p)) + (NCO(ct, t) - NCO(cp, p)) + (FIN(ct, t) - FIN(cp, p))) / avgTA_t
    ch_rec = (ct["receivables"] - cp["receivables"]) / avgTA_t
    ch_inv = (opt(t, "inventory") - opt(p, "inventory")) / avgTA_t   # absent inventory => 0
    soft_assets = (ta_t - ct["ppe_net"] - ct["cash"]) / ta_t if ct.get("ppe_net") is not None else \
        (ta_t - opt(t, "ppe_net") - ct["cash"]) / ta_t
    # cash sales = sales - change in receivables; %change t vs t-1
    cs_t = ct["revenue"] - (ct["receivables"] - cp["receivables"])
    cs_p = cp["revenue"] - (cp["receivables"] - float(pp["receivables"]))
    if cs_p == 0:
        return None, None, None, "insufficient: zero prior cash sales (delta undefined)"
    ch_cs = (cs_t - cs_p) / cs_p
    roa_t = ct["net_income"] / avgTA_t
    roa_p = cp["net_income"] / avgTA_p
    ch_roa = roa_t - roa_p
    issue = 1.0 if (opt(t, "issuance_equity") > 0 or opt(t, "issuance_debt") > 0) else 0.0

    pred = (-7.893 + 0.790 * rsst + 2.518 * ch_rec + 1.191 * ch_inv + 1.979 * soft_assets
            + 0.171 * ch_cs - 0.932 * ch_roa + 1.029 * issue)
    if not math.isfinite(pred):
        return None, None, None, "insufficient: non-finite predicted value"
    # sign-stable logistic (avoids math.exp overflow at extreme predicted values)
    prob = (1.0 / (1.0 + math.exp(-pred))) if pred >= 0 else (math.exp(pred) / (1.0 + math.exp(pred)))
    fscore = prob / DECHOW_UNCONDITIONAL
    comp = {"rsst_accruals": round(rsst, 4), "ch_receivables": round(ch_rec, 4),
            "ch_inventory": round(ch_inv, 4), "soft_assets": round(soft_assets, 4),
            "ch_cash_sales": round(ch_cs, 4), "ch_roa": round(ch_roa, 4),
            "issuance": int(issue)}
    return round(pred, 4), round(prob, 6), round(fscore, 4), comp


def main() -> int:
    con = connect()
    ensure_financials_schema(con)
    cols = ["cik", "fiscal_year", *LINE_ITEMS]
    rows = con.execute(f"SELECT {','.join(cols)} FROM financials ORDER BY cik, fiscal_year").fetchall()
    by_cik: dict[str, dict[int, dict]] = {}
    for r in rows:
        d = dict(zip(cols, r))
        by_cik.setdefault(d["cik"], {})[int(d["fiscal_year"])] = d

    upsert = ("INSERT OR REPLACE INTO accounting_scores (cik, fiscal_year, beneish_m, beneish_flag, "
              "beneish_components, dechow_pred, dechow_prob, dechow_fscore, dechow_components, "
              "models_version, notes, computed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
    now = datetime.utcnow()
    batch = []
    cand = b_ok = d_ok = neither = 0
    b_reasons, d_reasons = Counter(), Counter()
    b_flagged = 0

    for cik, years in by_cik.items():
        for fy in sorted(years):
            if (fy - 1) not in years:
                continue                       # need a prior year to form any index
            cand += 1
            t, p = years[fy], years[fy - 1]
            pp = years.get(fy - 2)
            bm, bflag, bcomp = beneish(t, p)
            dp, dprob, dfs, dcomp = dechow(t, p, pp)
            notes = []
            if bm is None:
                b_reasons[bcomp] += 1; notes.append("beneish:" + bcomp)
            else:
                b_ok += 1; b_flagged += int(bool(bflag))
            if dp is None:
                d_reasons[dcomp] += 1; notes.append("dechow:" + dcomp)
            else:
                d_ok += 1
            if bm is None and dp is None:
                neither += 1
            batch.append([cik, fy, bm, bflag, json.dumps(bcomp) if bm is not None else None,
                          dp, dprob, dfs, json.dumps(dcomp) if dp is not None else None,
                          MODELS_VERSION, "; ".join(notes) or "ok", now])
            if len(batch) >= 2000:
                con.executemany(upsert, batch); batch = []
    if batch:
        con.executemany(upsert, batch)

    fin_companies = con.execute("SELECT COUNT(DISTINCT cik) FROM financials").fetchone()[0]
    fin_years = con.execute("SELECT COUNT(*) FROM financials").fetchone()[0]
    enforced_with_score = con.execute(
        "SELECT COUNT(DISTINCT cik) FROM accounting_scores WHERE beneish_m IS NOT NULL "
        "AND cik IN (SELECT cik FROM enforcement)").fetchone()[0]
    con.close()

    coverage = {
        "models_version": MODELS_VERSION,
        "financials_companies": fin_companies,
        "financials_company_years": fin_years,
        "candidate_company_years_with_prior": cand,
        "beneish_m_scored": b_ok,
        "beneish_flagged_gt_threshold": b_flagged,
        "dechow_fscore_scored": d_ok,
        "neither_model_scored": neither,
        "beneish_insufficient_reasons": dict(b_reasons),
        "dechow_insufficient_reasons": dict(d_reasons),
        "enforced_companies_with_beneish": enforced_with_score,
        "note": "Beneish needs t & t-1; Dechow Model 1 needs t, t-1 & t-2. No score = recorded "
                "reason, never fabricated. Components stored for every computed score.",
    }
    COVERAGE.write_text(json.dumps(coverage, indent=2))
    print(json.dumps(coverage, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
