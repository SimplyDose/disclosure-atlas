"""One consolidated, read-only recomputation of every corrected number for the paper.

Cohort (archived to gc_cohort_2010_2026.csv): going-concern company-years, built with the
repo's own mcp/cohort.py build_panel, restricted to fiscal years 2010-2026, minus the
collapsed keys in docs/AUDIT_2026-07-01_collapsed_company_years.csv.
"""
import csv, json, math, os, sys
import numpy as np
from scipy import stats

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.dirname(os.path.abspath(__file__))

sys.path.insert(0, os.path.join(ROOT, "mcp"))
from atlas_data import AtlasData
from cohort import CohortSpec, filtered_indices, build_panel

data = AtlasData()
spec = CohortSpec(types={1})  # going_concern
idxs = filtered_indices(data, spec)
rows = build_panel(data, idxs)

collapsed = set()
with open(f"{ROOT}/docs/AUDIT_2026-07-01_collapsed_company_years.csv") as f:
    for r in csv.DictReader(f):
        collapsed.add((r["cik"], int(r["panel_fiscal_year"])))

cohort = [r for r in rows if 2010 <= r["fiscal_year"] <= 2026
          and (r["cik"], r["fiscal_year"]) not in collapsed]
print(f"COHORT: {len(cohort)} company-years, {len(set(r['cik'] for r in cohort))} firms, "
      f"fy {min(r['fiscal_year'] for r in cohort)}-{max(r['fiscal_year'] for r in cohort)}")
print(f"  raw panel: {len(rows)} CY / {len(set(r['cik'] for r in rows))} firms, "
      f"fy {min(r['fiscal_year'] for r in rows)}-{max(r['fiscal_year'] for r in rows)}")
n_collapsed = sum(1 for r in rows if (r['cik'], r['fiscal_year']) in collapsed)
n_pre2010 = sum(1 for r in rows if r['fiscal_year'] < 2010 and (r['cik'], r['fiscal_year']) not in collapsed)
print(f"  removed: {n_collapsed} collapsed keys, {n_pre2010} pre-2010 CYs")

# archive the cohort key list
with open(f"{OUT}/gc_cohort_2010_2026.csv", "w", newline="") as f:
    w = csv.writer(f); w.writerow(["cik", "fiscal_year", "enforced"])
    for r in sorted(cohort, key=lambda r: (r["cik"], r["fiscal_year"])):
        w.writerow([r["cik"], r["fiscal_year"], r["enforced"]])

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

# ---------- GC-cohort systematic screen (exact screen.js semantics on this cohort) ----------
print("\n=== GC-COHORT SYSTEMATIC SCREEN ===")
nodes = json.load(open(f"{ROOT}/app/public/data/nodes.json"))
scores = json.load(open(f"{ROOT}/app/public/data/scores.json"))
def num(v, d): return None if v is None else round(v * 10**d) / 10**d

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
        if n.get("dst") is not None: dstS += n["dst"]; dstN += 1
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
print(f"  screen panel rows: {len(srows)} (should equal cohort {len(cohort)})")

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
print(f"  subgroups={len(subgroups)}  candidates={cand}  in family={len(inc)}  excluded={n_exc}")

res = []
for ak, bk, dname, gname, xs, ys in inc:
    rho, p = stats.spearmanr(xs, ys)
    res.append([ak, bk, dname, gname, len(xs), rho, p])
mfam = len(res)
ps = np.array([r[6] for r in res])
pb = np.minimum(1, ps * mfam)
order = np.argsort(ps)
q = np.empty(mfam); run = 1.0
for k in range(mfam - 1, -1, -1):
    i = order[k]
    run = min(run, mfam * ps[i] / (k + 1)); q[i] = run
fdr, bonf = q < 0.05, pb < 0.05
print(f"  FDR survivors: {int(fdr.sum())}   Bonferroni survivors: {int(bonf.sum())}")
if fdr.sum():
    for j, r in enumerate(res):
        if fdr[j]:
            print(f"    {r[0]}~{r[1]} | {r[2]} | {r[3][:50]} | N={r[4]} rho={r[5]:+.4f} p={r[6]:.2e}")
minp = res[int(np.argmin(ps))]
print(f"  smallest raw p in family: {minp[0]}~{minp[1]} | {minp[2]} | {minp[3][:40]} | "
      f"N={minp[4]} rho={minp[5]:+.4f} p={minp[6]:.4f} (BH q={q[int(np.argmin(ps))]:.3f})")
maxr = res[int(np.argmax([abs(r[5]) for r in res]))]
print(f"  largest |rho| in family: {maxr[0]}~{maxr[1]} | {maxr[2]} | {maxr[3][:40]} | "
      f"N={maxr[4]} rho={maxr[5]:+.4f} p={maxr[6]:.4f}")

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
