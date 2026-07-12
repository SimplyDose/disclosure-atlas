"""AAER backtest — the HARD GATE (VALIDATION_PLAN). Earns the central claim:
enforced companies disclose in measurably similar ways, surfaceable by the engine.

Honesty guardrails are built in: effect sizes + baselines (not p-values alone), matched
negatives, same-company pairs excluded (boilerplate would inflate intra-enforced similarity),
and per-footnote-type analysis (type/industry dominate raw cosine, so we compare like to like).

Tests:
  1. Separation   — enforced↔enforced (diff company) vs enforced↔clean, per type. Cohen's d.
  2. Retrieval    — enforced enrichment in top-k neighbors (diff company), semantic vs TF-IDF
                    keyword baseline vs base rate. precision/recall@k.
  3. Headline     — clean footnotes sitting inside enforced neighborhoods (candidates to vet).
  4. Sem>keyword  — a query where semantic finds a same-concept match keyword misses.

Writes validation/results.json. Exit 0 if gate criteria met, else 1.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
EMB = ROOT / "data" / "embeddings"
OUT = ROOT / "validation" / "results.json"
# Chapter B: validate every type, including the four new ones (descriptive until validated).
TYPES = ("rev_rec", "going_concern", "related_party", "cam", "mda", "risk_factors")


class RowSim:
    """Lazy cosine-similarity ROW provider — avoids the O(N^2) Gram matrix (33 GB at 91k).
    sims[i] -> full similarity row for query i (self masked to -1); sims[i, sel] -> row[sel].
    Each access is one BLAS matvec (vecs @ vecs[i]), O(N) memory. Embeddings are L2-normalized,
    so dot product == cosine."""
    def __init__(self, vecs): self.v = vecs
    def _row(self, i):
        r = self.v @ self.v[i]
        r[i] = -1.0
        return r
    def __getitem__(self, key):
        if isinstance(key, tuple):
            i, sel = key
            return self._row(i)[sel]
        return self._row(key)


class KwRowSim:
    """Same lazy-row trick for the sparse TF-IDF keyword baseline (the dense N^2 would also be
    33 GB). X is CSR [N, V]; one row is (X @ X[i].T) densified to [N]."""
    def __init__(self, X): self.X = X
    def _row(self, i):
        r = np.asarray((self.X @ self.X[i].T).todense()).ravel().astype(np.float32)
        r[i] = -1.0
        return r
    def __getitem__(self, key):
        if isinstance(key, tuple):
            i, sel = key
            return self._row(i)[sel]
        return self._row(key)


def cohens_d(a: np.ndarray, b: np.ndarray) -> float:
    na, nb = len(a), len(b)
    if na < 2 or nb < 2:
        return 0.0
    va, vb = a.var(ddof=1), b.var(ddof=1)
    pooled = np.sqrt(((na - 1) * va + (nb - 1) * vb) / (na + nb - 2))
    return float((a.mean() - b.mean()) / pooled) if pooled > 0 else 0.0


def load():
    vecs = np.load(EMB / "embeddings.npy")
    meta = json.loads((EMB / "meta.json").read_text())
    return vecs, meta


def test_separation(vecs, meta, sims):
    cohort = np.array([m["cohort"] for m in meta])
    typ = np.array([m["type"] for m in meta])
    cik = np.array([m["cik"] for m in meta])
    out = {}
    for t in TYPES:
        enf = np.where((cohort == "enforced") & (typ == t))[0]
        cln = np.where((cohort == "clean") & (typ == t))[0]
        if len(enf) < 5 or len(cln) < 5:
            out[t] = {"note": "insufficient rows"}; continue
        intra, cross = [], []
        for i in enf:
            row = sims[i]
            mask_e = (cohort == "enforced") & (typ == t) & (cik != cik[i])
            mask_c = (cohort == "clean") & (typ == t)
            intra.append(float(row[mask_e].mean()))
            cross.append(float(row[mask_c].mean()))
        intra = np.array(intra); cross = np.array(cross)
        diff = intra - cross
        out[t] = {
            "intra_enforced_mean": round(float(intra.mean()), 4),
            "enforced_to_clean_mean": round(float(cross.mean()), 4),
            "mean_diff": round(float(diff.mean()), 4),
            "cohens_d": round(cohens_d(intra, cross), 3),
            "pct_enforced_closer_to_enforced": round(float((diff > 0).mean()), 3),
            "n_enforced": int(len(enf)), "n_clean": int(len(cln)),
        }
    return out


def test_retrieval(vecs, meta, sims, kw_sims, ks=(10, 25, 50)):
    cohort = np.array([m["cohort"] for m in meta])
    typ = np.array([m["type"] for m in meta])
    cik = np.array([m["cik"] for m in meta])
    res = {}
    for t in TYPES:
        enf = np.where((cohort == "enforced") & (typ == t))[0]
        pool = np.where(typ == t)[0]
        if len(enf) < 10:
            res[t] = {"note": "insufficient"}; continue
        base = float((cohort[pool] == "enforced").mean())  # enforced base rate within type
        # i-outer so each query row (semantic + keyword) is computed ONCE, then scored at every k.
        acc = {k: {"sem": [], "kw": [], "rec": []} for k in ks}
        for i in enf:
            cand = np.where((typ == t) & (cik != cik[i]))[0]
            if len(cand) == 0:
                continue
            sem_sorted = cand[np.argsort(-sims[i, cand])]
            kw_sorted = cand[np.argsort(-kw_sims[i, cand])]
            n_enf_diff = int((cohort[cand] == "enforced").sum())
            for k in ks:
                order = sem_sorted[:k]
                acc[k]["sem"].append(float((cohort[order] == "enforced").mean()))
                acc[k]["kw"].append(float((cohort[kw_sorted[:k]] == "enforced").mean()))
                if n_enf_diff:
                    acc[k]["rec"].append(float((cohort[order] == "enforced").sum()) / n_enf_diff)
        per_k = {}
        for k in ks:
            sm = float(np.mean(acc[k]["sem"])) if acc[k]["sem"] else 0.0
            per_k[f"p@{k}"] = {
                "semantic": round(sm, 3),
                "keyword": round(float(np.mean(acc[k]["kw"])) if acc[k]["kw"] else 0.0, 3),
                "base_rate": round(base, 3),
                "semantic_lift": round(sm / base, 2) if base else None,
                "recall": round(float(np.mean(acc[k]["rec"])), 3) if acc[k]["rec"] else None,
            }
        res[t] = per_k
    return res


def test_headline(vecs, meta, sims, k=15, top_n=8):
    cohort = np.array([m["cohort"] for m in meta])
    typ = np.array([m["type"] for m in meta])
    cik = np.array([m["cik"] for m in meta])
    cands = []
    clean_idx = np.where(cohort == "clean")[0]
    for i in clean_idx:
        t = typ[i]
        cand = np.where((typ == t) & (cik != cik[i]))[0]
        if len(cand) == 0:
            continue
        row = sims[i]                       # one matvec; reuse for ordering AND the cosine readout
        order = cand[np.argsort(-row[cand])][:k]
        enf_frac = float((cohort[order] == "enforced").mean())
        # nearest enforced neighbor
        enf_order = [j for j in order if cohort[j] == "enforced"]
        if enf_frac >= 0.8 and enf_order:
            nn = enf_order[0]
            cands.append({
                "clean_company": meta[i]["company_name"], "clean_cik": meta[i]["cik"],
                "clean_type": t, "enforced_frac_top%d" % k: round(enf_frac, 2),
                "nearest_enforced_company": meta[nn]["company_name"],
                "nearest_enforced_cik": meta[nn]["cik"],
                "cosine": round(float(row[nn]), 3),
                "clean_sec_url": meta[i]["sec_url"], "enforced_sec_url": meta[nn]["sec_url"],
                "clean_excerpt": meta[i]["text"][:280], "enforced_excerpt": meta[nn]["text"][:280],
            })
    cands.sort(key=lambda c: (-c[f"enforced_frac_top{k}"], -c["cosine"]))
    return cands[:top_n]


TOKEN = re.compile(r"[a-z][a-z]+")


def test_sem_beats_keyword(vecs, meta, sims, kw_sims):
    """Find a query whose semantic top-1 (diff company, same type) is a strong concept match
    but lexically dissimilar AND ranked poorly by keyword search."""
    cohort = np.array([m["cohort"] for m in meta])
    typ = np.array([m["type"] for m in meta])
    cik = np.array([m["cik"] for m in meta])

    def toks(s):
        return set(TOKEN.findall(s.lower()))

    best = None
    rng = np.random.default_rng(0)
    qs = rng.choice(len(meta), size=min(800, len(meta)), replace=False)
    for i in qs:
        t = typ[i]
        cand = np.where((typ == t) & (cik != cik[i]))[0]
        if len(cand) < 50:
            continue
        sem_order = cand[np.argsort(-sims[i, cand])]
        top = sem_order[0]
        # lexical overlap (Jaccard) between query and semantic top-1
        a, b = toks(meta[i]["text"]), toks(meta[top]["text"])
        jac = len(a & b) / max(1, len(a | b))
        # keyword rank of that same doc
        kw_order = list(cand[np.argsort(-kw_sims[i, cand])])
        kw_rank = kw_order.index(top) + 1
        cos = float(sims[i, top])
        # want: high semantic cosine, low lexical overlap, keyword buries it
        if cos >= 0.85 and jac <= 0.25 and kw_rank >= 10:
            score = cos - jac + kw_rank / 1000
            if best is None or score > best["_score"]:
                best = {"_score": score, "query_company": meta[i]["company_name"],
                        "match_company": meta[top]["company_name"], "type": t,
                        "semantic_cosine": round(cos, 3), "lexical_jaccard": round(jac, 3),
                        "keyword_rank_of_semantic_top1": int(kw_rank),
                        "query_excerpt": meta[i]["text"][:280],
                        "match_excerpt": meta[top]["text"][:280]}
    if best:
        best.pop("_score", None)
    return best


def main() -> int:
    vecs, meta = load()
    print(f"loaded {len(meta)} footnotes")
    # Lazy ROW providers instead of the O(N^2) Gram matrices (33 GB each at 91k). Each row is
    # one BLAS/sparse matvec computed on demand; tests only ever index rows.
    sims = RowSim(vecs)

    # TF-IDF keyword baseline (same corpus)
    from sklearn.feature_extraction.text import TfidfVectorizer
    texts = [m["text"] for m in meta]
    tfidf = TfidfVectorizer(stop_words="english", max_features=20000, ngram_range=(1, 2))
    X = tfidf.fit_transform(texts).astype(np.float32).tocsr()
    kw_sims = KwRowSim(X)

    sep = test_separation(vecs, meta, sims)
    ret = test_retrieval(vecs, meta, sims, kw_sims)
    head = test_headline(vecs, meta, sims)
    sbk = test_sem_beats_keyword(vecs, meta, sims, kw_sims)

    results = {"separation": sep, "retrieval": ret, "headline_candidates": head,
               "semantic_beats_keyword": sbk}
    OUT.write_text(json.dumps(results, indent=2, ensure_ascii=False))

    # ---- gate evaluation (honest thresholds) ----
    print("\n=== TEST 1: SEPARATION (per type) ===")
    t1_pass = False
    for t, d in sep.items():
        if "cohens_d" in d:
            print(f"  {t}: intra={d['intra_enforced_mean']} cross={d['enforced_to_clean_mean']} "
                  f"diff={d['mean_diff']} d={d['cohens_d']} pct_closer={d['pct_enforced_closer_to_enforced']}")
            if d["mean_diff"] > 0 and d["cohens_d"] >= 0.2:
                t1_pass = True

    print("\n=== TEST 2: RETRIEVAL (semantic vs keyword vs base) ===")
    t2_pass = False
    for t, ks in ret.items():
        if isinstance(ks, dict) and "p@10" in ks:
            for k, v in ks.items():
                print(f"  {t} {k}: sem={v['semantic']} kw={v['keyword']} base={v['base_rate']} lift={v['semantic_lift']}")
            p10 = ks["p@10"]
            if p10["semantic"] > p10["base_rate"] and p10["semantic"] >= p10["keyword"]:
                t2_pass = True

    print("\n=== TEST 3: HEADLINE clean-in-enforced candidates ===")
    for c in head[:5]:
        kkey = [k for k in c if k.startswith("enforced_frac")][0]
        print(f"  CLEAN {c['clean_company']} ({c['clean_type']}) {kkey}={c[kkey]} "
              f"-> nearest enforced {c['nearest_enforced_company']} cos={c['cosine']}")
    t3_pass = len(head) >= 1

    print("\n=== TEST 4: SEMANTIC BEATS KEYWORD ===")
    if sbk:
        print(f"  query={sbk['query_company']} -> match={sbk['match_company']} ({sbk['type']}) "
              f"cos={sbk['semantic_cosine']} jaccard={sbk['lexical_jaccard']} kw_rank={sbk['keyword_rank_of_semantic_top1']}")
    t4_pass = sbk is not None

    print("\n=== GATE ===")
    for name, ok in [("Test1 separation", t1_pass), ("Test2 retrieval", t2_pass),
                     ("Test3 headline", t3_pass), ("Test4 sem>keyword", t4_pass)]:
        print(f"  {'PASS' if ok else 'FAIL'}  {name}")
    gate = t1_pass and t2_pass and t4_pass and t3_pass
    print(f"\nVALIDATION GATE: {'PASS' if gate else 'FAIL'}")
    return 0 if gate else 1


if __name__ == "__main__":
    sys.exit(main())
