"""Phase 2 gate (PRD §11.2): embeddings/index sane and a known pair retrieves above threshold.

Checks:
  1. Artifact integrity: embeddings.npy aligns with meta.json; unit-normalized; no NaNs.
  2. Retrieval coherence: for sampled queries, nearest neighbors share the same footnote_type
     far above the base rate (semantic structure, not noise).
  3. Known-pair retrieval: top-k neighbor similarity >> random-pair baseline (effect size).

Exit 0 = PASS, 1 = FAIL.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
EMB = ROOT / "data" / "embeddings"


def main() -> int:
    vecs = np.load(EMB / "embeddings.npy")
    meta = json.loads((EMB / "meta.json").read_text())
    fails = []

    if vecs.shape[0] != len(meta):
        fails.append(f"embeddings rows {vecs.shape[0]} != meta rows {len(meta)}")
    if np.isnan(vecs).any():
        fails.append("NaNs in embeddings")
    norms = np.linalg.norm(vecs, axis=1)
    if not np.allclose(norms, 1.0, atol=1e-3):
        fails.append(f"embeddings not unit-normalized (norm range {norms.min():.3f}-{norms.max():.3f})")

    types = np.array([m["type"] for m in meta])
    cohorts = np.array([m["cohort"] for m in meta])
    ciks = np.array([m["cik"] for m in meta])
    sims = vecs @ vecs.T
    np.fill_diagonal(sims, -1.0)  # exclude self

    rng = np.random.default_rng(42)
    q_idx = rng.choice(len(meta), size=min(300, len(meta)), replace=False)

    # same-type rate among top-10 neighbors vs base rate
    k = 10
    same_type_hits, same_type_total = 0, 0
    topk_sims = []
    for i in q_idx:
        nn = np.argpartition(sims[i], -k)[-k:]
        same_type_hits += int((types[nn] == types[i]).sum())
        same_type_total += k
        topk_sims.append(sims[i][nn].mean())
    same_type_rate = same_type_hits / same_type_total
    base_rate = max((types == "rev_rec").mean(), (types == "going_concern").mean())
    mean_topk = float(np.mean(topk_sims))

    # random-pair baseline
    a = rng.choice(len(meta), 2000); b = rng.choice(len(meta), 2000)
    rand_sim = float(np.mean([sims[x, y] for x, y in zip(a, b) if x != y]))

    print(f"rows={vecs.shape[0]} dim={vecs.shape[1]}")
    print(f"top-{k} same-type rate={same_type_rate:.3f} (base rate {base_rate:.3f})")
    print(f"mean top-{k} cosine={mean_topk:.3f} vs random-pair baseline={rand_sim:.3f}")

    if same_type_rate < base_rate + 0.05:
        fails.append("neighbors not more same-type than chance (no semantic structure)")
    if mean_topk < rand_sim + 0.15:
        fails.append(f"top-k similarity not meaningfully above random ({mean_topk:.3f} vs {rand_sim:.3f})")

    # known-pair: best enforced->enforced rev_rec retrieval should be high
    enf_rev = np.where((cohorts == "enforced") & (types == "rev_rec"))[0]
    if len(enf_rev) > 5:
        best = 0.0
        for i in enf_rev[:200]:
            row = sims[i].copy()
            # restrict to other enforced rev_rec from a DIFFERENT company
            mask = (cohorts == "enforced") & (types == "rev_rec") & (ciks != ciks[i])
            if mask.any():
                best = max(best, float(row[mask].max()))
        print(f"best enforced->enforced (diff company) rev_rec cosine={best:.3f}")
        if best < 0.85:
            fails.append(f"no strong enforced pair found (best {best:.3f} < 0.85)")

    if fails:
        print("GATE: FAIL")
        for f in fails:
            print("  -", f)
        return 1
    print("GATE: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
