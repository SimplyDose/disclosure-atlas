"""Chapter E / build step — join Chapter-D financial scores into the app bundle.

Reads `accounting_scores` + `financials` + `filings` from DuckDB and:
  1. annotates each node in app/public/data/nodes.json with `pfy` (period fiscal year, via the
     node's accession -> filings.period_of_report) and, when that company-fiscal-year has a score,
     compact `ms` / `fs` / `mflag` (for the synchronous score FILTER + quick panel header);
  2. writes app/public/data/scores.json (lazy-loaded) keyed by CIK with each company's per-year
     M / F + FULL component breakdowns + honest notes (for the panel breakdown + multi-year history
     + export component columns).

Idempotent, $0, no network. Run AFTER build_app_data.py (which produces nodes.json) and after
ingestion/compute_scores.py. Run:  python app/scripts/build_scores.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "ingestion"))
from db import connect  # noqa: E402

OUT = ROOT / "app" / "public" / "data"
NODES = OUT / "nodes.json"
SCORES = OUT / "scores.json"
BENEISH_THRESHOLD = -1.78


def main() -> int:
    con = connect(read_only=True)
    # accession -> fiscal year (period of report)
    acc_fy = {}
    for acc, per in con.execute("SELECT accession_number, period_of_report FROM filings WHERE period_of_report IS NOT NULL").fetchall():
        try:
            acc_fy[acc] = int(str(per)[:4])
        except Exception:
            pass
    # company names
    names = dict(con.execute("SELECT cik, company_name FROM companies").fetchall())
    # all candidate score rows
    rows = con.execute(
        "SELECT cik, fiscal_year, beneish_m, beneish_flag, beneish_components, "
        "dechow_fscore, dechow_prob, dechow_components, notes FROM accounting_scores").fetchall()
    con.close()

    by_cik_fy = {}        # (cik, fy) -> compact for node tagging
    scores_by_cik = {}    # cik -> {name, years:[...]}
    for cik, fy, bm, bflag, bcomp, dfs, dprob, dcomp, notes in rows:
        fy = int(fy)
        year = {"y": fy}
        if bm is not None:
            year["m"] = round(float(bm), 2)
            year["mf"] = 1 if bflag else 0
            year["mc"] = json.loads(bcomp) if bcomp else None
        if dfs is not None:
            year["f"] = round(float(dfs), 2)
            year["fp"] = round(float(dprob), 6) if dprob is not None else None
            year["fc"] = json.loads(dcomp) if dcomp else None
        if bm is None and dfs is None:
            year["note"] = notes or "insufficient data"
        scores_by_cik.setdefault(cik, {"name": names.get(cik, ""), "years": []})["years"].append(year)
        by_cik_fy[(cik, fy)] = (
            None if bm is None else round(float(bm), 2),
            None if dfs is None else round(float(dfs), 2),
            1 if (bm is not None and bm > BENEISH_THRESHOLD) else 0 if bm is not None else None,
        )
    for v in scores_by_cik.values():
        v["years"].sort(key=lambda r: r["y"])

    # annotate nodes
    nodes = json.loads(NODES.read_text())
    tagged = 0
    for n in nodes:
        fy = acc_fy.get(n.get("acc"))
        if fy is None:
            continue
        n["pfy"] = fy
        sc = by_cik_fy.get((n.get("cik"), fy))
        if sc is None:
            continue
        m, f, mflag = sc
        if m is not None:
            n["ms"] = m
        if f is not None:
            n["fs"] = f
        if mflag is not None:
            n["mflag"] = mflag
        if m is not None or f is not None:
            tagged += 1
    NODES.write_text(json.dumps(nodes, separators=(",", ":")))
    SCORES.write_text(json.dumps(scores_by_cik, separators=(",", ":")))

    # inject financial-pillar coverage into the manifest (single source for the methods page)
    try:
        cov = json.loads((ROOT / "validation" / "chapter_d_coverage.json").read_text())
        uni = len(json.loads((ROOT / "data" / "processed" / "universe_v2.json").read_text()))
        absent = sum(1 for ln in (ROOT / "data" / "processed" / "companyfacts_absent.txt").read_text().splitlines() if ln.strip())
        mpath = OUT / "manifest.json"
        mani = json.loads(mpath.read_text())
        mani["financials"] = {
            "universe": uni,
            "with_companyfacts": uni - absent,
            "companyfacts_absent": absent,
            "companies_with_financials": cov["financials_companies"],
            "company_years": cov["financials_company_years"],
            "candidate_company_years": cov["candidate_company_years_with_prior"],
            "beneish_scored": cov["beneish_m_scored"],
            "beneish_flagged": cov["beneish_flagged_gt_threshold"],
            "dechow_scored": cov["dechow_fscore_scored"],
            "neither_scored": cov["neither_model_scored"],
            "enforced_with_beneish": cov["enforced_companies_with_beneish"],
            "beneish_threshold": -1.78,
            "dechow_unconditional": 0.0037,
        }
        mpath.write_text(json.dumps(mani, separators=(",", ":")))
        print("manifest.financials injected")
    except Exception as e:
        print("WARN: could not inject manifest.financials:", e)

    # ship tickers (cik -> ticker) for the research panel export (CIK stays the primary join key)
    try:
        con2 = connect(read_only=True)
        corpus = set(r[0] for r in con2.execute(
            "SELECT DISTINCT f.cik FROM footnotes ft JOIN filings f ON ft.accession_number=f.accession_number").fetchall())
        tk = {cik: t for cik, t in con2.execute("SELECT cik, ticker FROM companies WHERE ticker IS NOT NULL").fetchall()
              if cik in corpus and t}
        con2.close()
        (OUT / "tickers.json").write_text(json.dumps(tk, separators=(",", ":")))
        print(f"tickers.json: {len(tk)}/{len(corpus)} corpus companies")
    except Exception as e:
        print("WARN: could not write tickers.json:", e)

    n_companies = len(scores_by_cik)
    n_m = sum(1 for v in scores_by_cik.values() for y in v["years"] if "m" in y)
    n_f = sum(1 for v in scores_by_cik.values() for y in v["years"] if "f" in y)
    print(f"nodes tagged with a score: {tagged}/{len(nodes)}")
    print(f"scores.json: companies={n_companies} m_years={n_m} f_years={n_f} "
          f"size={SCORES.stat().st_size//1024} KB ; nodes.json size={NODES.stat().st_size//1024//1024} MB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
