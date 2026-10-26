"""Read-only replay of the paper tables and its 460-test exploratory screen.

Use --screen-json for the full family from tracked files only. The default table
report additionally needs the original read-only DuckDB archive for the text subset.
The archived cohort is compared before reporting and is never overwritten.

Cohort (archived to gc_cohort_2010_2026.csv): going-concern company-years, built with the
repo's own mcp/cohort.py build_panel, restricted to fiscal years 2010-2026, minus the
collapsed keys in docs/AUDIT_2026-07-01_collapsed_company_years.csv.
"""
import argparse
import csv, json, math, os, sys
from collections import Counter
import numpy as np
from scipy import stats

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.dirname(os.path.abspath(__file__))

sys.path.insert(0, os.path.join(ROOT, "mcp"))
from atlas_data import AtlasData
from cohort import CohortSpec, filtered_indices, build_panel


def validate_archive(cohort, archive=None):
    """Reject cohort drift; the historical reference is input, never output."""
    archive = archive or f"{OUT}/gc_cohort_2010_2026.csv"
    with open(archive, newline="") as source:
        reader = csv.DictReader(source)
        if reader.fieldnames != ["cik", "fiscal_year", "enforced"]:
            raise ValueError("Paper archive requires cik,fiscal_year,enforced columns")
        archived_rows = list(reader)
    archived = {(r["cik"], int(r["fiscal_year"])): int(r["enforced"]) for r in archived_rows}
    actual = {(r["cik"], r["fiscal_year"]): r["enforced"] for r in cohort}
    if len(archived) != len(archived_rows) or len(actual) != len(cohort) or actual != archived:
        raise ValueError("Rebuilt cohort keys/enforcement indicators differ from the paper archive")


def singleton_peer_indices(nodes):
    """Match the builder's industry-label -> SIC -> all fallback and type grouping."""
    def peer_key(node):
        return (node.get("ind") or node.get("sic") or "_all", node["t"])
    counts = Counter(peer_key(node) for node in nodes)
    return {i for i, node in enumerate(nodes) if counts[peer_key(node)] < 2}


def load_cohort(exclude_singletons=False):
    data = AtlasData()
    if exclude_singletons:
        excluded = singleton_peer_indices(data.nodes)
        data.nodes = [{**node, "dst": None} if i in excluded else node
                      for i, node in enumerate(data.nodes)]
    spec = CohortSpec(types={1})  # going_concern
    idxs = filtered_indices(data, spec)
    rows = build_panel(data, idxs)

    collapsed = set()
    with open(f"{ROOT}/docs/AUDIT_2026-07-01_collapsed_company_years.csv") as f:
        for r in csv.DictReader(f):
            collapsed.add((r["cik"], int(r["panel_fiscal_year"])))

    cohort = [r for r in rows if 2010 <= r["fiscal_year"] <= 2026
              and (r["cik"], r["fiscal_year"]) not in collapsed]
    validate_archive(cohort)
    return rows, cohort, collapsed


def systematic_screen(collapsed, exclude_singletons=False):
    """Replay the archived paper's rounded company-year screen and full corrections."""
    with open(f"{ROOT}/app/public/data/nodes.json") as source:
        nodes = json.load(source)
    with open(f"{ROOT}/app/public/data/scores.json") as source:
        scores = json.load(source)
    def num(v, d): return None if v is None else round(v * 10**d) / 10**d

    singleton_indices = singleton_peer_indices(nodes) if exclude_singletons else set()
    excluded_excerpts = 0

    by_key = {}
    for n in nodes:
        if n.get("t") != 1 or n.get("pfy") is None: continue
        if not (2010 <= n["pfy"] <= 2026): continue
        if (n["cik"], n["pfy"]) in collapsed: continue
        by_key.setdefault(n["cik"] + "|" + str(n["pfy"]), []).append(n)

    srows = []
    for key, ns in by_key.items():
        first = ns[0]; cik = first["cik"]; fy = first["pfy"]
        fogS = fogN = dstS = dstN = 0
        for n in ns:
            if n.get("fog") is not None: fogS += n["fog"]; fogN += 1
            if n["i"] in singleton_indices:
                excluded_excerpts += 1
            elif n.get("dst") is not None:
                dstS += n["dst"]; dstN += 1
        yr = None
        sc = scores.get(cik)
        if sc:
            for y in sc["years"]:
                if y["y"] == fy: yr = y; break
        srows.append({
            "cik": cik, "fy": fy, "ind": first.get("ind") or "",
            "enforced": 1 if first.get("e") else 0,
            "fog": num(fogS / fogN, 2) if fogN else None,
            "dst": num(dstS / dstN, 4) if dstN else None,
            "m": yr.get("m") if yr else None, "mc": (yr.get("mc") or {}) if yr else {},
            "f": yr.get("f") if yr else None, "fc": (yr.get("fc") or {}) if yr else {},
        })
    validate_archive([{**r, "fiscal_year": r["fy"]} for r in srows])

    def ok(v):
        return v is not None and isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)

    BEN = ["DSRI","GMI","AQI","SGI","DEPI","SGAI","LVGI","TATA"]
    DEC = ["rsst_accruals","ch_receivables","ch_inventory","soft_assets","ch_cash_sales","ch_roa","issuance"]
    A = [("fog", lambda r: r["fog"]), ("dst", lambda r: r["dst"])]
    B = [("m", lambda r: r["m"])]
    B += [("m_"+k.lower(), (lambda kk: lambda r: r["mc"].get(kk))(k)) for k in BEN]
    B += [("f", lambda r: r["f"])]
    B += [("f_"+k, (lambda kk: lambda r: r["fc"].get(kk))(k)) for k in DEC]

    subgroups = [("full", "full cohort", list(range(len(srows))))]
    def dim(keyof, dname):
        mm = {}
        for i, r in enumerate(srows):
            k = keyof(r)
            if k is None or k == "": continue
            mm.setdefault(k, []).append(i)
        for k in sorted(mm): subgroups.append((dname, str(k), mm[k]))
    dim(lambda r: "enforcement history" if r["enforced"] else "no enforcement history", "enforcement")
    dim(lambda r: f"{(r['fy']//5)*5}-{(r['fy']//5)*5+4}", "filing-year bucket")
    dim(lambda r: r["ind"] or None, "SIC industry")

    MIN_N = 30
    inc, n_exc = [], 0
    for dname, gname, gidx in subgroups:
        for ak, af in A:
            for bk, bf in B:
                xs, ys = [], []
                for i in gidx:
                    x, y = af(srows[i]), bf(srows[i])
                    if ok(x) and ok(y): xs.append(x); ys.append(y)
                if len(xs) < MIN_N or len(set(xs)) == 1 or len(set(ys)) == 1:
                    n_exc += 1; continue
                inc.append((ak, bk, dname, gname, np.array(xs), np.array(ys)))
    cand = len(A) * len(B) * len(subgroups)

    results = []
    for ak, bk, dname, gname, xs, ys in inc:
        rho, p = stats.spearmanr(xs, ys)
        results.append({"language_measure": ak, "financial_measure": bk,
                        "subgroup_dimension": dname, "subgroup": gname,
                        "n": len(xs), "rho": float(rho), "p_raw_two_sided": float(p)})
    m = len(results)
    ps = np.array([r["p_raw_two_sided"] for r in results])
    order = np.argsort(ps)
    q = np.empty(m)
    running = 1.0
    for k in range(m - 1, -1, -1):
        i = order[k]
        running = min(running, m * ps[i] / (k + 1))
        q[i] = running
    for i, result in enumerate(results):
        result["p_bonferroni"] = min(1.0, float(ps[i] * m))
        result["q_bh"] = float(q[i])
        result["survives_bh_005"] = bool(q[i] < 0.05)
        result["survives_bonferroni_005"] = bool(result["p_bonferroni"] < 0.05)
    # Table 2 uses build_panel's JS-compatible rounding, retained separately from
    # the paper screen's historical Python-round aggregation above.
    _, principal_rows, _ = load_cohort(exclude_singletons)
    principal = []
    for x, field_x in (("fog", "gunning_fog"), ("dst", "distinctiveness")):
        for y, field_y in (("m", "beneish_m"), ("f", "dechow_fscore")):
            pairs = [(r[field_x], r[field_y]) for r in principal_rows
                     if ok(r[field_x]) and ok(r[field_y])]
            rho, p = stats.spearmanr(*zip(*pairs))
            principal.append({"language_measure": x, "financial_measure": y,
                              "n": len(pairs), "rho": float(rho), "p_raw_two_sided": float(p)})
    return {"analysis": ("Singleton-distinctiveness sensitivity" if exclude_singletons
                         else "Archived paper systematic screen, derived-bundle replay"),
            "scope": "Rounded derived measures; no upstream extraction or measure reconstruction",
            "singleton_distinctiveness": "excluded" if exclude_singletons else "historical values retained",
            "excluded_singleton_excerpts": excluded_excerpts,
            "cohort_company_years": len(srows), "subgroups": len(subgroups),
            "candidate_tests": cand, "excluded_tests": n_exc,
            "family_tests": m, "alpha": 0.05,
            "fdr_survivors": sum(r["survives_bh_005"] for r in results),
            "bonferroni_survivors": sum(r["survives_bonferroni_005"] for r in results),
            "principal_correlations": principal,
            "tests": results}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--screen-json", action="store_true",
                        help="Print all paper-screen tests as JSON, without the private DuckDB archive")
    parser.add_argument("--exclude-singleton-distinctiveness", action="store_true",
                        help="With --screen-json, exclude singleton-peer distinctiveness before averaging")
    args = parser.parse_args()
    if args.exclude_singleton_distinctiveness and not args.screen_json:
        parser.error("--exclude-singleton-distinctiveness requires --screen-json")
    rows, cohort, collapsed = load_cohort()
    if args.screen_json:
        print(json.dumps(systematic_screen(collapsed, args.exclude_singleton_distinctiveness),
                         indent=2, allow_nan=False))
        return
    print(f"COHORT: {len(cohort)} company-years, {len(set(r['cik'] for r in cohort))} firms, "
          f"fy {min(r['fiscal_year'] for r in cohort)}-{max(r['fiscal_year'] for r in cohort)}")
    print(f"  raw panel: {len(rows)} CY / {len(set(r['cik'] for r in rows))} firms, "
          f"fy {min(r['fiscal_year'] for r in rows)}-{max(r['fiscal_year'] for r in rows)}")
    n_collapsed = sum(1 for r in rows if (r['cik'], r['fiscal_year']) in collapsed)
    n_pre2010 = sum(1 for r in rows if r['fiscal_year'] < 2010 and (r['cik'], r['fiscal_year']) not in collapsed)
    print(f"  removed: {n_collapsed} collapsed keys, {n_pre2010} pre-2010 CYs")

    MEASURES = ["gunning_fog", "distinctiveness", "beneish_m", "dechow_fscore"]

    def col(rr, m):
        return np.array([r[m] for r in rr if r[m] is not None], dtype=float)

    print("\n=== TABLE 1 (corrected) ===")
    for m in MEASURES:
        a = col(cohort, m)
        q1, med, q3 = np.percentile(a, [25, 50, 75])
        print(f"  {m:16} N={len(a):5}  median={med:.4f}  IQR={q3-q1:.4f}")

    print("\n=== TABLE 2 (corrected, pairwise complete) ===")
    for i in range(len(MEASURES)):
        for j in range(i + 1, len(MEASURES)):
            a, b = MEASURES[i], MEASURES[j]
            pairs = [(r[a], r[b]) for r in cohort if r[a] is not None and r[b] is not None]
            x, y = zip(*pairs)
            rho, p = stats.spearmanr(x, y)
            print(f"  {a} ~ {b:16} N={len(x):5}  rho={rho:+.4f}  p={p:.4f}")

    print("\n=== TABLE 3 (corrected; Wilcoxon rank-sum = scipy.stats.ranksums two-sided) ===")
    enf = [r for r in cohort if r["enforced"] == 1]
    non = [r for r in cohort if r["enforced"] != 1]
    print(f"  enforced N={len(enf)} ({len(set(r['cik'] for r in enf))} firms) / "
          f"not enforced N={len(non)} ({len(set(r['cik'] for r in non))} firms)")
    for m in MEASURES:
        ae, an = col(enf, m), col(non, m)
        _, p = stats.ranksums(ae, an)
        print(f"  {m:16} enf: N={len(ae):4} med={np.median(ae):.4f} | non: N={len(an):5} "
              f"med={np.median(an):.4f} | p={p:.4f}")

    print("\n=== GC-COHORT SYSTEMATIC SCREEN ===")
    report = systematic_screen(collapsed)
    print(f"  subgroups={report['subgroups']} candidates={report['candidate_tests']} "
          f"in family={report['family_tests']} excluded={report['excluded_tests']}")
    print(f"  FDR survivors: {report['fdr_survivors']} Bonferroni survivors: {report['bonferroni_survivors']}")
    for result in report["tests"]:
        if result["survives_bh_005"]:
            print("   ", json.dumps(result))

    # ---------- Robustness: cleaned (higher-precision) cohort ----------
    print("\n=== ROBUSTNESS: cleaned high-precision subset ===")
    import duckdb
    con = duckdb.connect(f"{ROOT}/data/processed/atlas.duckdb", read_only=True)
    # verbatim WHERE clause from docs/STUDY_COHORT_GC_CLEANED.md §2 (as pinned by eval/test_null_finding.py)
    COHORT_SQL_WHERE = r"""
        f.footnote_type = 'going_concern'
        AND regexp_matches(lower(f.raw_text_excerpt), 'substantial doubt')
        AND NOT regexp_matches(lower(f.raw_text_excerpt),
            'asu\s*(no\.?\s*)?2014-15|asc\s*205-40|issued (new )?guidance|financial accounting standards board|fasb (issued|has issued)|requires management to (assess|evaluate)|recently (issued|adopted) accounting')
        AND NOT regexp_matches(lower(f.raw_text_excerpt),
            '(if|unless|should) (we|the company|it)[^.]{0,80}(unable to|not be able to|cannot) continue as a going concern|may (be unable|not be able) to continue as a going concern')
    """
    cleaned_sql = f"""
    SELECT DISTINCT fi.cik AS cik, year(fi.period_of_report) AS fy
    FROM footnotes f JOIN filings fi ON f.accession_number = fi.accession_number
    WHERE fi.period_of_report IS NOT NULL AND {COHORT_SQL_WHERE}
    """
    cleaned = {(cik, int(fy)) for cik, fy in con.execute(cleaned_sql).fetchall()}
    con.close()
    sub = [r for r in cohort if (r["cik"], r["fiscal_year"]) in cleaned]
    print(f"  cleaned ∩ paper cohort: {len(sub)} CYs, {len(set(r['cik'] for r in sub))} firms")
    for a, b in [("gunning_fog","beneish_m"), ("gunning_fog","dechow_fscore"),
                 ("distinctiveness","beneish_m"), ("distinctiveness","dechow_fscore"),
                 ("beneish_m","dechow_fscore")]:
        pairs = [(r[a], r[b]) for r in sub if r[a] is not None and r[b] is not None]
        x, y = zip(*pairs)
        rho, p = stats.spearmanr(x, y)
        print(f"  {a} ~ {b:16} N={len(x):4}  rho={rho:+.4f}  p={p:.4f}")


if __name__ == "__main__":
    main()
