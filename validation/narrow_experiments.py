"""Principled narrowing experiments after Test-1 separation came back null.
VALIDATION_PLAN: "If clustering is weak, narrow the footnote type / universe until a real
signal exists — do not dress up noise." This script searches honestly for ANY subset with
a real separation effect, reporting Cohen's d each time. No cherry-picking: every cut is printed.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
EMB = ROOT / "data" / "embeddings"
import sys
sys.path.insert(0, str(ROOT / "ingestion"))
from db import connect  # noqa: E402


def cohens_d(a, b):
    a, b = np.asarray(a), np.asarray(b)
    if len(a) < 2 or len(b) < 2:
        return 0.0
    pooled = np.sqrt(((len(a)-1)*a.var(ddof=1) + (len(b)-1)*b.var(ddof=1)) / (len(a)+len(b)-2))
    return float((a.mean()-b.mean())/pooled) if pooled > 0 else 0.0


def separation(idx_enf, idx_cln, sims, label):
    """Mean intra-enforced (excl self) vs enforced->clean, per the global sims matrix."""
    if len(idx_enf) < 5 or len(idx_cln) < 5:
        print(f"  {label}: insufficient ({len(idx_enf)} enf / {len(idx_cln)} cln)"); return
    enf_set = set(idx_enf.tolist())
    intra, cross = [], []
    for i in idx_enf:
        others = idx_enf[idx_enf != i]
        intra.append(sims[i, others].mean())
        cross.append(sims[i, idx_cln].mean())
    intra, cross = np.array(intra), np.array(cross)
    d = cohens_d(intra, cross)
    print(f"  {label}: intra={intra.mean():.4f} cross={cross.mean():.4f} "
          f"diff={intra.mean()-cross.mean():+.4f} d={d:+.3f} (n_enf={len(idx_enf)})")


def main():
    vecs = np.load(EMB / "embeddings.npy")
    meta = json.loads((EMB / "meta.json").read_text())
    sims = vecs @ vecs.T
    np.fill_diagonal(sims, -1.0)
    cohort = np.array([m["cohort"] for m in meta])
    typ = np.array([m["type"] for m in meta])
    cik = np.array([m["cik"] for m in meta])

    # high-confidence enforced CIKs (name_overlap >= 0.9 AND has_10k True) from enforcement.summary
    con = connect(read_only=True)
    enf_rows = con.execute("SELECT cik, summary FROM enforcement").fetchall()
    con.close()
    hi_conf = set()
    for c, s in enf_rows:
        m = re.search(r"name_overlap=([0-9.]+).*has_10k=(\w+)", s or "")
        if m and float(m.group(1)) >= 0.9 and m.group(2) == "True":
            hi_conf.add(str(int(c)).zfill(10))

    print("=== EXP A: full set, per type (baseline, already known null) ===")
    for t in ("rev_rec", "going_concern"):
        e = np.where((cohort == "enforced") & (typ == t))[0]
        c = np.where((cohort == "clean") & (typ == t))[0]
        separation(e, c, sims, f"type={t}")

    print("=== EXP B: HIGH-CONFIDENCE enforced only, per type ===")
    hi_mask = np.array([m["cik"] in hi_conf for m in meta])
    for t in ("rev_rec", "going_concern"):
        e = np.where(hi_mask & (typ == t))[0]
        c = np.where((cohort == "clean") & (typ == t))[0]
        separation(e, c, sims, f"hiconf type={t}")

    print("=== EXP C: COMPANY-LEVEL vectors (mean-pool footnotes per company, per type) ===")
    for t in ("rev_rec", "going_concern"):
        rows = np.where(typ == t)[0]
        by_co = {}
        for i in rows:
            by_co.setdefault((cik[i], cohort[i]), []).append(vecs[i])
        cos = {k: np.mean(v, axis=0) for k, v in by_co.items()}
        ids = list(cos.keys())
        M = np.array([cos[k] for k in ids], dtype=np.float32)
        M = M / np.clip(np.linalg.norm(M, axis=1, keepdims=True), 1e-8, None)
        csim = M @ M.T
        np.fill_diagonal(csim, -1.0)
        coh = np.array([k[1] for k in ids])
        e = np.where(coh == "enforced")[0]
        c = np.where(coh == "clean")[0]
        separation(e, c, csim, f"company-level type={t}")

    print("=== EXP D: per-SIC pockets (rev_rec), top by |d| ===")
    sic = np.array([(m.get("sic") or "?") for m in meta])
    results = []
    for s in set(sic):
        e = np.where((cohort == "enforced") & (typ == "rev_rec") & (sic == s))[0]
        c = np.where((cohort == "clean") & (typ == "rev_rec") & (sic == s))[0]
        if len(e) >= 8 and len(c) >= 8:
            intra = np.array([sims[i, e[e != i]].mean() for i in e])
            cross = np.array([sims[i, c].mean() for i in e])
            results.append((cohens_d(intra, cross), s, len(e), len(c),
                            intra.mean()-cross.mean()))
    results.sort(reverse=True)
    for d, s, ne, nc, diff in results[:8]:
        print(f"  SIC {s}: d={d:+.3f} diff={diff:+.4f} (n_enf={ne}, n_cln={nc})")
    if not results:
        print("  no SIC with enough rows in both cohorts")


if __name__ == "__main__":
    main()
