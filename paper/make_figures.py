"""Regenerate every figure in the paper from the repository's real data (read-only).

Each figure is computed from the same sources as paper/final_tables.py — the repo's own
panel builder (mcp/cohort.py) over the shipped data bundles, restricted to the archived
going-concern cohort (paper/gc_cohort_2010_2026.csv semantics: fiscal 2010-2026 minus the
collapsed keys in docs/AUDIT_2026-07-01_collapsed_company_years.csv). Nothing is simulated:
every plotted value is recomputed here and asserted, digit-for-digit, against the numbers
reported in the paper before any figure is drawn.

  Figure 1  Financial-score coverage of the cohort (= Table 1 Ns: 1,120 Beneish and
            1,323 Dechow of 4,186 company-years; discussed in Section 3).
  Figure 2  Spearman correlation matrix among the four principal measures (= Table 2).
  Figure 3  Distribution of Spearman rho across all 460 tests of the pre-registered
            systematic screen (= Table 4 family; survivors marked).
  Figure 4  Firm-level Spearman correlations with firm-bootstrap 95% CIs (= Section 5.5;
            percentile bootstrap over firms, 4,000 resamples, seed 7).

Outputs paper/figures/fig{1..4}_*.png (300 dpi) and .pdf. Grayscale only; Times New Roman.
"""
import csv, json, math, os, sys

import numpy as np
from scipy import stats

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "figures")
os.makedirs(OUT, exist_ok=True)

sys.path.insert(0, os.path.join(ROOT, "mcp"))
from atlas_data import AtlasData
from cohort import CohortSpec, filtered_indices, build_panel

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

plt.rcParams.update({
    "font.family": "Times New Roman",
    "font.size": 9,
    "text.color": "black",
    "axes.edgecolor": "black",
    "axes.labelcolor": "black",
    "xtick.color": "black",
    "ytick.color": "black",
    "axes.linewidth": 0.8,
    "savefig.dpi": 300,
})

GRAY_FILL = "0.82"      # light gray bar fill
GRAY_MID = "0.55"


def save(fig, stem):
    for ext in ("png", "pdf"):
        fig.savefig(os.path.join(OUT, f"{stem}.{ext}"), bbox_inches="tight")
    plt.close(fig)
    print(f"  wrote figures/{stem}.png + .pdf")


# ---------------------------------------------------------------- cohort (as final_tables.py)
data = AtlasData()
rows = build_panel(data, filtered_indices(data, CohortSpec(types={1})))
collapsed = set()
with open(f"{ROOT}/docs/AUDIT_2026-07-01_collapsed_company_years.csv") as f:
    for r in csv.DictReader(f):
        collapsed.add((r["cik"], int(r["panel_fiscal_year"])))
cohort = [r for r in rows if 2010 <= r["fiscal_year"] <= 2026
          and (r["cik"], r["fiscal_year"]) not in collapsed]
assert len(cohort) == 4186, len(cohort)
assert len(set(r["cik"] for r in cohort)) == 1373

# cross-check against the archived cohort key list shipped with the paper
with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "gc_cohort_2010_2026.csv")) as f:
    archived = {(r["cik"], int(r["fiscal_year"])) for r in csv.DictReader(f)}
assert {(r["cik"], r["fiscal_year"]) for r in cohort} == archived, "cohort != archived key list"

MEASURES = ["gunning_fog", "distinctiveness", "beneish_m", "dechow_fscore"]
LABELS = {"gunning_fog": "Gunning Fog", "distinctiveness": "Distinctiveness",
          "beneish_m": "Beneish M-Score", "dechow_fscore": "Dechow F-Score"}


# ---------------------------------------------------------------- Figure 1: Table 2 matrix
print("Figure 2: correlation matrix (Table 2)")
R = np.eye(4)
for i in range(4):
    for j in range(i + 1, 4):
        a, b = MEASURES[i], MEASURES[j]
        pairs = [(r[a], r[b]) for r in cohort if r[a] is not None and r[b] is not None]
        x, y = zip(*pairs)
        rho, p = stats.spearmanr(x, y)
        R[i, j] = R[j, i] = rho
        print(f"  {a}~{b}: N={len(x)} rho={rho:+.4f} p={p:.4f}")

# assert digit-for-digit against Table 2 of the paper (2 dp)
expect_t2 = {(0, 1): 0.02, (0, 2): 0.02, (0, 3): 0.03, (1, 2): 0.06, (1, 3): -0.03, (2, 3): 0.10}
for (i, j), v in expect_t2.items():
    assert round(R[i, j], 2) == v, (MEASURES[i], MEASURES[j], R[i, j], v)

fig, ax = plt.subplots(figsize=(4.9, 4.0))
ax.imshow(np.abs(R), cmap="Greys", vmin=0, vmax=1)
for i in range(4):
    for j in range(4):
        v = R[i, j]
        ax.text(j, i, f"{v:.2f}" if i != j else "1.00",
                ha="center", va="center", fontsize=10,
                color=("white" if abs(v) > 0.5 else "black"))
ticks = [LABELS[m] for m in MEASURES]
ax.set_xticks(range(4), ["Fog", "Distinct.", "Beneish M", "Dechow F"])
ax.set_yticks(range(4), ticks)
ax.set_xticks(np.arange(-0.5, 4), minor=True)
ax.set_yticks(np.arange(-0.5, 4), minor=True)
ax.grid(which="minor", color="white", linewidth=1.5)
ax.tick_params(which="both", length=0)
for s in ax.spines.values():
    s.set_visible(False)
save(fig, "fig2_correlation_matrix")


# ---------------------------------------------------------------- Figure 2: 460-test screen
# Exact replication of the screen family from paper/final_tables.py (screen.js semantics).
print("Figure 3: systematic-screen rho distribution (Table 4 family)")
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
assert len(srows) == 4186

def ok(v):
    return v is not None and isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)

BEN = ["DSRI", "GMI", "AQI", "SGI", "DEPI", "SGAI", "LVGI", "TATA"]
DEC = ["rsst_accruals", "ch_receivables", "ch_inventory", "soft_assets",
       "ch_cash_sales", "ch_roa", "issuance"]
A = [("fog", lambda r: r["fog"]), ("dst", lambda r: r["dst"])]
B = [("m", lambda r: r["m"])]
B += [("m_" + k.lower(), (lambda kk: lambda r: r["mc"].get(kk))(k)) for k in BEN]
B += [("f", lambda r: r["f"])]
B += [("f_" + k, (lambda kk: lambda r: r["fc"].get(kk))(k)) for k in DEC]

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
inc = []
for dname, gname, gidx in subgroups:
    for ak, af in A:
        for bk, bf in B:
            xs, ys = [], []
            for i in gidx:
                x, y = af(srows[i]), bf(srows[i])
                if ok(x) and ok(y): xs.append(x); ys.append(y)
            if len(xs) < MIN_N or len(set(xs)) == 1 or len(set(ys)) == 1:
                continue
            inc.append((ak, bk, dname, gname, np.array(xs), np.array(ys)))
assert len(inc) == 460, len(inc)

res = []
for ak, bk, dname, gname, xs, ys in inc:
    rho, p = stats.spearmanr(xs, ys)
    res.append([ak, bk, dname, gname, len(xs), rho, p])
mfam = len(res)
ps = np.array([r[6] for r in res])
order = np.argsort(ps)
q = np.empty(mfam); run = 1.0
for k in range(mfam - 1, -1, -1):
    i = order[k]
    run = min(run, mfam * ps[i] / (k + 1)); q[i] = run
fdr = q < 0.05
bonf = np.minimum(1, ps * mfam) < 0.05
rhos = np.array([r[5] for r in res])
assert int(fdr.sum()) == 3 and int(bonf.sum()) == 1, (fdr.sum(), bonf.sum())
surv = sorted(rhos[fdr])
# the three FDR survivors reported in the paper: dst~TATA at rho 0.11 / 0.12 / 0.16
assert [round(v, 4) for v in surv] == [0.1132, 0.1189, 0.1551], surv
assert all(res[j][0] == "dst" and res[j][1] == "m_tata" for j in range(mfam) if fdr[j])
print(f"  family=460  FDR survivors=3  Bonferroni=1  survivor rhos={[f'{v:+.3f}' for v in surv]}")

fig, ax = plt.subplots(figsize=(6.3, 3.2))
bins = np.arange(-0.55, 0.60, 0.05)
ax.hist(rhos, bins=bins, color=GRAY_FILL, edgecolor="black", linewidth=0.7)
ax.axvline(0, color="black", linewidth=0.8, linestyle="--")
ymax = ax.get_ylim()[1]
# the first two survivors (rho 0.113, 0.119) nearly coincide; stagger them vertically
ax.plot([surv[0], surv[2]], [-ymax * 0.035] * 2, marker="^", linestyle="none",
        color="black", markersize=6, clip_on=False)
ax.plot([surv[1]], [-ymax * 0.085], marker="^", linestyle="none",
        color="black", markersize=6, clip_on=False)
ax.annotate("3 FDR survivors\n(distinctiveness–TATA,\n$\\rho$ = 0.11–0.16)",
            xy=(surv[1], 0), xytext=(0.24, ymax * 0.55), fontsize=8.5,
            arrowprops=dict(arrowstyle="-", linewidth=0.7, color="black"))
ax.set_xlabel("Spearman $\\rho$")
ax.set_ylabel("Number of tests")
ax.spines[["top", "right"]].set_visible(False)
save(fig, "fig3_screen_rho_distribution")


# ---------------------------------------------------------------- Figure 3: firm-level forest
# Exact replication of the Section 5.5 numbers: per-firm medians, Spearman, percentile
# bootstrap over firms (4,000 resamples, numpy default_rng seed 7, pairs in fixed order).
print("Figure 4: firm-level correlations with firm-bootstrap 95% CIs (Section 5.5)")
byfirm = {}
for r in cohort:
    byfirm.setdefault(r["cik"], []).append(r)
firm_rows = []
for cik, rr in byfirm.items():
    fr = {"cik": cik}
    for m in MEASURES:
        vals = [x[m] for x in rr if x[m] is not None]
        fr[m] = float(np.median(vals)) if vals else None
    firm_rows.append(fr)

rng = np.random.default_rng(7)
NBOOT = 4000
forest = []
for i in range(len(MEASURES)):
    for j in range(i + 1, len(MEASURES)):
        a, b = MEASURES[i], MEASURES[j]
        pr = [(r[a], r[b]) for r in firm_rows if r[a] is not None and r[b] is not None]
        x = np.array([p[0] for p in pr]); y = np.array([p[1] for p in pr])
        rho, p = stats.spearmanr(x, y)
        boots = []
        for _ in range(NBOOT):
            k = rng.integers(0, len(x), len(x))
            if len(set(x[k])) > 1 and len(set(y[k])) > 1:
                boots.append(stats.spearmanr(x[k], y[k])[0])
        lo, hi = np.percentile(boots, [2.5, 97.5])
        forest.append((a, b, len(x), rho, p, lo, hi))
        print(f"  {a}~{b}: Nfirms={len(x)} rho={rho:+.4f} p={p:.4f} CI[{lo:+.3f},{hi:+.3f}]")

# assert against the verified Section 5.5 / V3 ground-truth values (seed 7, 4,000 resamples)
expect_f = {
    ("gunning_fog", "distinctiveness"): (1373, 0.0039, -0.049, 0.058),
    ("gunning_fog", "beneish_m"):       (494, 0.0225, -0.063, 0.108),
    ("gunning_fog", "dechow_fscore"):   (530, 0.0095, -0.074, 0.092),
    ("distinctiveness", "beneish_m"):   (494, 0.0511, -0.033, 0.135),
    ("distinctiveness", "dechow_fscore"): (530, 0.0017, -0.087, 0.087),
    ("beneish_m", "dechow_fscore"):     (389, 0.1234, 0.015, 0.230),
}
for a, b, n, rho, p, lo, hi in forest:
    en, erho, elo, ehi = expect_f[(a, b)]
    assert n == en and round(rho, 4) == erho, (a, b, n, rho)
    assert round(lo, 3) == elo and round(hi, 3) == ehi, (a, b, lo, hi)

# plot: the four form-financial pairs (the paper's null), then the two context pairs
ORDER = [("gunning_fog", "beneish_m"), ("gunning_fog", "dechow_fscore"),
         ("distinctiveness", "beneish_m"), ("distinctiveness", "dechow_fscore"),
         ("gunning_fog", "distinctiveness"), ("beneish_m", "dechow_fscore")]
fmap = {(a, b): (n, rho, lo, hi) for a, b, n, rho, p, lo, hi in forest}
fig, ax = plt.subplots(figsize=(6.3, 3.0))
ys = np.arange(len(ORDER))[::-1]
for yy, (a, b) in zip(ys, ORDER):
    n, rho, lo, hi = fmap[(a, b)]
    form_fin = (a, b) not in [("gunning_fog", "distinctiveness"), ("beneish_m", "dechow_fscore")]
    ax.plot([lo, hi], [yy, yy], color="black", linewidth=1.1)
    for cap in (lo, hi):
        ax.plot([cap, cap], [yy - 0.14, yy + 0.14], color="black", linewidth=1.1)
    ax.plot(rho, yy, marker="s" if form_fin else "o", color="black" if form_fin else "white",
            markeredgecolor="black", markersize=5.5, zorder=3)
    ax.text(0.265, yy, f"{rho:+.3f} [{lo:+.2f}, {hi:+.2f}]", va="center", fontsize=8.5)
ax.axvline(0, color=GRAY_MID, linewidth=0.9)
ax.set_yticks(ys, [f"{LABELS[a]} – {LABELS[b]}   (N = {fmap[(a,b)][0]:,} firms)" for a, b in ORDER])
ax.set_xlabel("Spearman $\\rho$ (per-firm medians), firm-bootstrap 95% CI")
ax.set_xlim(-0.14, 0.42)
ax.spines[["top", "right", "left"]].set_visible(False)
ax.tick_params(axis="y", length=0)
save(fig, "fig4_firm_level_forest")


# ---------------------------------------------------------------- Figure 4: coverage gap
print("Figure 1: financial-score coverage of the cohort")
nb = sum(1 for r in cohort if r["beneish_m"] is not None)
nd = sum(1 for r in cohort if r["dechow_fscore"] is not None)
assert (nb, nd) == (1120, 1323), (nb, nd)
N = len(cohort)
print(f"  Beneish {nb}/{N} = {nb/N:.1%}   Dechow {nd}/{N} = {nd/N:.1%}")

fig, ax = plt.subplots(figsize=(6.3, 1.9))
for yy, (lab, n) in enumerate([("Beneish M-Score", nb), ("Dechow F-Score", nd)]):
    ax.barh(1 - yy, n, color="0.35", edgecolor="black", linewidth=0.6, height=0.55)
    ax.barh(1 - yy, N - n, left=n, color="0.90", edgecolor="black", linewidth=0.6, height=0.55)
    ax.text(n / 2, 1 - yy, f"scored\n{n:,} ({n/N:.1%})", ha="center", va="center",
            fontsize=8.5, color="white")
    ax.text(n + (N - n) / 2, 1 - yy, f"not computable  {N - n:,} ({(N-n)/N:.1%})",
            ha="center", va="center", fontsize=8.5, color="black")
ax.set_yticks([1, 0], ["Beneish M-Score", "Dechow F-Score"])
ax.set_xlim(0, N)
ax.set_xlabel(f"Going-concern company-years (N = {N:,})")
ax.spines[["top", "right", "left"]].set_visible(False)
ax.tick_params(axis="y", length=0)
save(fig, "fig1_score_coverage")

print("\nAll figures regenerated from real data; all assertions passed.")
