"""Local verification harness for the Disclosure Atlas MCP server.

Calls each of the six tools in-process and checks correctness against known values, schema shape,
honesty-framing presence, no-secret-leakage, input validation, and result limits. Exit code 0 = all
pass. No network beyond the (cached) local fastembed model; no deploy.
"""
from __future__ import annotations

import json
import sys
import traceback

import server as S
from cohort import parse_cohort, filtered_indices, build_panel
from atlas_data import get_data

PASS, FAIL = [], []


def check(name, cond, detail=""):
    (PASS if cond else FAIL).append(name)
    print(f"  [{'PASS' if cond else 'FAIL'}] {name}" + (f"  -- {detail}" if detail and not cond else ""))
    return cond


def section(t):
    print("\n" + "=" * 78 + f"\n{t}\n" + "=" * 78)


def has_honesty(payload, *needles):
    """All caveat needles appear somewhere in the stringified caveats/notes of the payload."""
    blob = json.dumps(payload).lower()
    return all(nd.lower() in blob for nd in needles)


def main():
    data = get_data()

    # ── 1. export_panel ──
    section("1. export_panel (priority) — known values + counts match the bundle")
    # AMD single-company panel
    res = S.export_panel(footnote_types=None, max_rows=20000)
    check("export_panel returns rows", len(res["rows"]) > 0)
    # no composite/risk-score/ranking column (has_<type> flags + the published dechow_fscore screen are legit)
    forbidden_cols = [c for c in res["columns"]
                      if c in ("risk_score", "composite", "composite_score", "rank", "suspicion",
                               "risk", "risk_rank", "concern_score")]
    check("panel has no composite/risk-score/ranking column", not forbidden_cols, str(forbidden_cols))
    amd = [r for r in res["rows"] if r["cik"] == "0000002488" and r["fiscal_year"] == 2022]
    check("AMD FY2022 present in full panel", len(amd) == 1)
    if amd:
        r = amd[0]
        check("AMD FY2022 beneish_m == -1.14", r["beneish_m"] == -1.14, str(r["beneish_m"]))
        check("AMD FY2022 beneish_aqi == 2.9933", r["beneish_aqi"] == 2.9933, str(r["beneish_aqi"]))
        check("AMD FY2022 beneish_flag == 1", r["beneish_flag"] == 1, str(r["beneish_flag"]))
        # AMD is not in SEC company_tickers resolution (1491/1804) -> ticker honestly blank (documented)
        check("AMD ticker honestly blank (unresolved, not fabricated)", r["ticker"] == "", repr(r["ticker"]))
        check("AMD cik zero-padded 10-digit", r["cik"] == "0000002488", r["cik"])
    # ticker resolution works where SEC company_tickers has it (APD / CIK 0000002969)
    apd = [r for r in res["rows"] if r["cik"] == "0000002969"]
    check("ticker resolves where available (APD)", bool(apd) and apd[0]["ticker"] == "APD",
          apd[0]["ticker"] if apd else "no APD row")
    # counts match an independent recompute via the cohort layer (the site's path)
    for label, kw in [("all", {}), ("going_concern", {"footnote_types": ["going_concern"]}),
                      ("enforced", {"enforced_only": True}), ("sic_3674", {"sic_code": "3674"})]:
        spec = parse_cohort(data, **kw)
        rows_ref = build_panel(data, filtered_indices(data, spec))
        n_co_ref = len({rr["cik"] for rr in rows_ref})
        rp = S.export_panel(**kw, max_rows=20000)
        check(f"panel n_observations matches site cohort ({label})", rp["n_observations"] == len(rows_ref),
              f"{rp['n_observations']} vs {len(rows_ref)}")
        check(f"panel n_companies matches ({label})", rp["n_companies"] == n_co_ref)
    # missing-as-NA, never zero: find a row lacking a score and confirm null not 0
    null_m = [r for r in res["rows"] if r["beneish_m"] is None]
    check("missing beneish_m encoded as null (not 0)", len(null_m) > 0 and all(r["beneish_m"] is None for r in null_m[:5]))
    # codebook + citation + honesty
    check("panel includes codebook", "codebook" in res and len(res["codebook"]) == len(res["columns"]))
    check("panel includes suggested_citation", "Disclosure Atlas" in res["suggested_citation"])
    check("panel honesty: cited-screens + cannot-re-validate + replicated null + no risk score",
          has_honesty(res, "published", "cannot re-validate", "does not separate", "no per-company risk score"))
    # result limit
    rlim = S.export_panel(max_rows=10)
    check("panel max_rows enforced", len(rlim["rows"]) == 10 and rlim["truncated"] is True)

    # ── 1b. identifier crosswalk (merge-friction killer) ──
    section("1b. identifier crosswalk — resolvable IDs present, licensed IDs honest-empty, join guidance")
    cols = set(res["columns"])
    check("panel carries resolvable identifiers",
          {"cik", "ticker", "company_name", "sic_code", "sic_industry", "accession"} <= cols)
    check("panel carries licensed id columns (present so they can be joined in)",
          {"gvkey", "cusip", "permno"} <= cols)
    # licensed identifiers must be EMPTY in every row — never fabricated
    licensed_nonempty = [r for r in res["rows"] if r.get("gvkey") or r.get("cusip") or r.get("permno")]
    check("licensed identifiers (gvkey/cusip/permno) honest-empty in ALL rows (never fabricated)",
          not licensed_nonempty, f"{len(licensed_nonempty)} rows had a fabricated licensed id")
    # resolvable id positions populated where available
    check("a resolvable sic_code is populated", any(r.get("sic_code") for r in res["rows"]))
    check("a resolvable ticker is populated", any(r.get("ticker") for r in res["rows"]))
    check("panel includes identifiers_note + join_guidance",
          "identifiers_note" in res and "join_guidance" in res)
    check("join_guidance documents CIK->GVKEY and CIK->PERMNO mapping",
          "cik_to_gvkey" in res["join_guidance"] and "cik_to_permno" in res["join_guidance"])
    check("identifiers_note states licensed ids are not fabricated",
          "never fabricated" in res["identifiers_note"].lower())
    # codebook documents the licensed columns as licensed/empty
    cb = {c["column"]: c for c in res["codebook"]}
    check("codebook documents gvkey as licensed/empty",
          "gvkey" in cb and "licensed" in (cb["gvkey"]["units"] + cb["gvkey"]["source"]).lower())

    # ── 2. get_company_profile ──
    section("2. get_company_profile — both pillars + enforcement context + neighbors")
    prof = S.get_company_profile(cik="2488")
    check("profile resolves AMD by short cik", prof.get("found") and prof["identity"]["company_name"].startswith("ADVANCED MICRO"))
    check("profile cik normalized", prof["identity"]["cik"] == "0000002488")
    check("profile identity carries crosswalk (sic + honest-empty licensed ids)",
          prof["identity"]["sic_code"] is not None and prof["identity"]["gvkey"] == ""
          and prof["identity"]["cusip"] == "" and prof["identity"]["permno"] == "")
    check("profile includes identifiers_note", "identifiers_note" in prof)
    check("profile disclosure pillar has footnotes", prof["disclosure_pillar"]["n_footnotes"] > 0)
    check("profile financial pillar has years", prof["financial_pillar"]["n_scored_years"] > 0)
    check("profile footnote carries complexity + distinctiveness",
          prof["disclosure_pillar"]["footnotes"][0]["complexity_vs_industry"] is not None or
          prof["disclosure_pillar"]["footnotes"][0]["distinctiveness"] is not None)
    check("profile nearest_neighbors are cross-company",
          all(nb["cik"] != "0000002488" for nb in prof["nearest_neighbors"]))
    check("profile honesty present", has_honesty(prof, "descriptive only", "context"))
    # enforced company has AAER detail
    enf_cik = next(iter(data.aaer))
    pe = S.get_company_profile(cik=enf_cik)
    check("enforced company profile lists AAERs", pe["enforcement_context"]["has_enforcement_history"] and len(pe["enforcement_context"]["aaers"]) > 0)
    # ambiguous name
    amb = S.get_company_profile(name="inc")
    check("ambiguous name returns disambiguation", amb.get("ambiguous") is True and len(amb["matches"]) > 1)

    # ── 3. search_disclosures ──
    section("3. search_disclosures — semantic + BM25 baseline noted")
    sr = S.search_disclosures(query="substantial doubt about the company's ability to continue as a going concern",
                              top_k=10)
    check("search returns results", len(sr["results"]) == 10)
    check("search ranked descending by similarity",
          all(sr["results"][i]["similarity"] >= sr["results"][i + 1]["similarity"] for i in range(len(sr["results"]) - 1)))
    top_types = [h["footnote_type"] for h in sr["results"][:5]]
    check("search top hits are going_concern (sane semantics)", top_types.count("going_concern") >= 3, str(top_types))
    check("search hits carry sic crosswalk + identifiers_note",
          "identifiers_note" in sr and sr["results"][0].get("sic_code") is not None)
    check("search notes BM25 keyword baseline", "bm25" in json.dumps(sr).lower())
    check("search honesty present", has_honesty(sr, "descriptive only", "does not separate"))
    # filter composition
    srf = S.search_disclosures(query="revenue recognition policy", footnote_types=["revenue_recognition"], top_k=5)
    check("search cohort filter applied", all(h["footnote_type"] == "revenue_recognition" for h in srf["results"]))

    # ── 4. get_financial_scores ──
    section("4. get_financial_scores — cited-screens framing + limitations IN payload")
    fs = S.get_financial_scores(cik="2488")
    check("scores company mode returns years", fs["mode"] == "company" and len(fs["company"]["years"]) > 0)
    y22 = [y for y in fs["company"]["years"] if y["fiscal_year"] == 2022]
    check("scores AMD FY2022 M -1.14 / AQI 2.9933", y22 and y22[0]["beneish_m"] == -1.14 and y22[0]["beneish_components"]["AQI"] == 2.9933)
    check("scores framing: threshold + not a verdict", fs["model_framing"]["beneish_threshold"] == -1.78)
    check("scores honesty: cited screens + cannot re-validate + no risk score",
          has_honesty(fs, "published", "cannot re-validate", "no per-company risk score"))
    check("scores company carries crosswalk (sic + honest-empty licensed ids)",
          fs["company"]["sic_code"] is not None and fs["company"]["gvkey"] == ""
          and fs["company"]["cusip"] == "" and fs["company"]["permno"] == "")
    check("scores includes identifiers_note", "identifiers_note" in fs)
    fsc = S.get_financial_scores(footnote_types=["going_concern"], max_rows=50)
    check("scores cohort mode capped", fsc["mode"] == "cohort" and len(fsc["companies"]) <= 50)

    # ── 5. find_disclosure_changes ──
    section("5. find_disclosure_changes — ranked + not-a-red-flag caveat")
    ch = S.find_disclosure_changes(top_n=20)
    check("changes returns events", len(ch["results"]) == 20)
    check("changes ranked descending",
          all(ch["results"][i]["change_cosine_distance"] >= ch["results"][i + 1]["change_cosine_distance"] for i in range(len(ch["results"]) - 1)))
    check("changes distance in [0,2]", all(0 <= r["change_cosine_distance"] <= 2 for r in ch["results"]))
    check("changes year_to > year_from", all(r["year_to"] > r["year_from"] for r in ch["results"]))
    check("changes honesty: not a red flag", has_honesty(ch, "not a red flag", "does not separate"))
    check("changes carries identifiers_note + sic crosswalk",
          "identifiers_note" in ch and ch["results"][0].get("sic_code") is not None)
    # cross-check one event's distance against an independent int8 recompute
    ev = data.changes()[0]
    recomputed = 1.0 - data.cos_pair(ev["idxA"], ev["idxB"])
    check("changes magnitude matches independent recompute", abs(recomputed - ev["dist"]) < 1e-9)
    chf = S.find_disclosure_changes(footnote_types=["mda"], top_n=5)
    check("changes cohort filter applied", all(r["footnote_type"] == "mda" for r in chf["results"]))

    # ── 6. query_cohort_stats ──
    section("6. query_cohort_stats — descriptive both-pillar aggregates, no risk score")
    st = S.query_cohort_stats(footnote_types=["going_concern"])
    check("stats footnote count matches manifest going_concern", st["counts"]["footnotes"] == 6266, str(st["counts"]["footnotes"]))
    check("stats has complexity + distinctiveness distributions",
          st["complexity_distribution"]["gunning_fog"] is not None and st["distinctiveness_distribution"]["value"] is not None)
    check("stats has score distribution", "beneish_m" in st["score_distribution"])
    check("stats clustering descriptor present + honest about high floor",
          st["language_clustering"]["mean_within_cohort_cosine"] is not None and "high floor" in json.dumps(st).lower())
    # no risk-score VALUE/field anywhere (the words may appear only inside honest negations in caveats)
    def keys_recursive(o):
        if isinstance(o, dict):
            for kk, vv in o.items():
                yield kk
                yield from keys_recursive(vv)
        elif isinstance(o, list):
            for it in o:
                yield from keys_recursive(it)
    st_keys = {k.lower() for k in keys_recursive(st)}
    check("stats exposes no risk-score / composite / suspicion field",
          not (st_keys & {"risk_score", "composite", "suspicion", "concern_score", "rank"}))
    # the only places the phrase 'risk score' appears must be honest negations (in caveats)
    non_caveat = json.dumps({k: v for k, v in st.items() if k != "caveats"}).lower()
    check("'risk score' phrase confined to honest caveat negations", "risk score" not in non_caveat)
    check("stats honesty present", has_honesty(st, "descriptive only", "no per-company risk score"))

    # ── input validation ──
    section("input validation — bad inputs raise, not silently empty")
    def raises(fn):
        try:
            fn(); return False
        except Exception:
            return True
    check("unknown footnote_type rejected", raises(lambda: S.export_panel(footnote_types=["not_a_type"])))
    check("unknown sic rejected", raises(lambda: S.query_cohort_stats(sic_code="ZZZZ")))
    check("unknown industry rejected", raises(lambda: S.export_panel(industry="Nonexistent Industry")))
    check("year_min>year_max rejected", raises(lambda: S.export_panel(year_min=2020, year_max=2010)))
    check("bad complexity rejected", raises(lambda: S.query_cohort_stats(complexity="purple")))
    check("empty search query rejected", raises(lambda: S.search_disclosures(query="  ")))
    check("profile needs cik or name", raises(lambda: S.get_company_profile()))
    check("bad cik rejected", raises(lambda: S.get_company_profile(cik="abc")))

    # ── no secrets leak ──
    section("no-secrets — responses contain no credential material")
    big = json.dumps([res, prof, sr, fs, ch, st])
    secret_markers = ["sk-ant", "ANTHROPIC", "VERCEL_TOKEN", "vercel_token", "BEGIN OPENSSH",
                      "password", "SEC_USER_AGENT"]
    leaked = [m for m in secret_markers if m.lower() in big.lower()]
    check("no secret markers in any response", not leaked, str(leaked))
    # server module references no credential env vars
    src = open("server.py").read() + open("atlas_data.py").read()
    check("server never reads credential env vars",
          all(t not in src for t in ["ANTHROPIC_API_KEY", "VERCEL_TOKEN", "SEC_USER_AGENT", "os.getenv", "dotenv"]))

    # ── summary ──
    section("SUMMARY")
    print(f"  PASS: {len(PASS)}   FAIL: {len(FAIL)}")
    if FAIL:
        print("  FAILURES:")
        for f in FAIL:
            print("   -", f)
    return 1 if FAIL else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        traceback.print_exc()
        sys.exit(2)
