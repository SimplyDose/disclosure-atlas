"""Build the static app data bundle from the real ingested artifacts.

Reads:  data/embeddings/{meta.json, projection.json, embeddings.npy, findings.json}
        data/processed/atlas.duckdb (real AAER numbers per CIK)
Writes: app/public/data/{nodes.json, excerpts.json, neighbors.json, findings.json,
        aaer.json, manifest.json} and copies embeddings.bin (for in-browser paste search).

Everything here is REAL — real companies, real CIKs, real UMAP coordinates, real cosine
similarity, real pre-generated explanations. No fabrication (DECISIONS_LOG C16).
"""
from __future__ import annotations

import json
import re
import shutil
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent.parent
EMB = ROOT / "data" / "embeddings"
OUT = ROOT / "app" / "public" / "data"
sys.path.insert(0, str(ROOT / "ingestion"))
from db import connect  # noqa: E402

WORLD_SCALE = 820.0      # projection coords are in [-1,1]; scale to the design's world units
EXCERPT_CHARS = 540
TOPK = 10                # cross-company neighbors per node
NB_OVER = 220            # candidates fetched per row before company-dedup (head-room for repeats)
NB_BATCH = 512           # column-batch size for the blocked matmul (~190 MB/block at 91k)
NB_CKPT = ROOT / "data" / "processed" / "neighbors_ckpt.jsonl"  # resumable per-row checkpoint


def compute_neighbors_batched(vecs, ciks, n):
    """Top-K cross-company cosine neighbors without the N x N Gram matrix. Blocked matmul +
    per-row checkpoint so the (~1-2 h) build is resumable. Returns a list[n] of [[idx, score], ...]."""
    done = {}
    if NB_CKPT.exists():
        for ln in NB_CKPT.open():
            ln = ln.strip()
            if ln:
                r = json.loads(ln); done[int(r["i"])] = r["nb"]
        print(f"  resuming neighbors from checkpoint: {len(done)}/{n} rows done")
    f = NB_CKPT.open("a")
    over = min(NB_OVER, n)
    for s in range(0, n, NB_BATCH):
        e = min(s + NB_BATCH, n)
        if all(i in done for i in range(s, e)):
            continue
        block = vecs @ vecs[s:e].T            # [N, b]
        for c in range(e - s):
            i = s + c
            if i in done:
                continue
            col = block[:, c].copy()
            col[i] = -2.0
            part = np.argpartition(-col, over - 1)[:over]
            part = part[np.argsort(-col[part])]
            seen, out = {ciks[i]}, []
            for j in part:
                cj = ciks[j]
                if cj in seen:
                    continue
                seen.add(cj); out.append([int(j), round(float(col[j]), 4)])
                if len(out) >= TOPK:
                    break
            done[i] = out
            f.write(json.dumps({"i": i, "nb": out}) + "\n")
        f.flush()
        print(f"  neighbors {e}/{n}", flush=True)
    f.close()
    return [done[i] for i in range(n)]


def write_parquet_bundle(nodes, excerpts, neighbors):
    """Write the scalable columnar bundle (ZSTD Parquet) with DuckDB — no extra deps.
    nodes.parquet (one row/point), excerpts.parquet (i,text), neighbors.parquet (i,rank,j,score)."""
    import duckdb
    d = duckdb.connect()
    # nodes: read the array-of-objects JSON we just wrote
    d.execute(f"COPY (SELECT * FROM read_json_auto('{(OUT / 'nodes.json').as_posix()}')) "
              f"TO '{(OUT / 'nodes.parquet').as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD)")
    # excerpts: dict -> (i, text)
    d.execute("CREATE TABLE ex (i INTEGER, text VARCHAR)")
    d.executemany("INSERT INTO ex VALUES (?,?)", [(int(k), v) for k, v in excerpts.items()])
    d.execute(f"COPY ex TO '{(OUT / 'excerpts.parquet').as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD)")
    # neighbors: long format (i, rank, j, score) — compact + columnar
    nb_rows = [(i, r, int(j), float(s)) for i, nbs in enumerate(neighbors) for r, (j, s) in enumerate(nbs)]
    d.execute("CREATE TABLE nb (i INTEGER, rank INTEGER, j INTEGER, score DOUBLE)")
    d.executemany("INSERT INTO nb VALUES (?,?,?,?)", nb_rows)
    d.execute(f"COPY nb TO '{(OUT / 'neighbors.parquet').as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD)")
    d.close()
    for f in ["nodes.parquet", "excerpts.parquet", "neighbors.parquet"]:
        print(f"  {f}: {(OUT / f).stat().st_size // 1024} KB")


def clean_excerpt(t: str) -> str:
    t = re.sub(r"\s+", " ", t).strip()
    if len(t) <= EXCERPT_CHARS:
        return t
    cut = t[:EXCERPT_CHARS]
    sp = cut.rfind(" ")
    return (cut[:sp] if sp > 200 else cut).rstrip() + "…"


# ---- descriptive readability / complexity (Gunning Fog) ----------------------------------
# These are DESCRIPTIVE, COMPARATIVE measures only — never a risk score or a judgment.
# Method (documented for reproducibility): standard Gunning Fog on the full footnote text.
#   Fog = 0.4 * ( words/sentences + 100 * complex_words/words )
#   complex word = a token whose base (after stripping a trailing -es/-ed/-ing inflection)
#   has 3+ syllables, per the original Gunning definition (suffix-adjusted). Syllables are
#   counted by vowel-group heuristic with a silent-final-e adjustment. Deterministic.
_WORD = re.compile(r"[A-Za-z][A-Za-z'-]*")
_VOWELS = re.compile(r"[aeiouy]+")
_SUFFIX = re.compile(r"(es|ed|ing)$")


def _syllables(w: str) -> int:
    w = w.lower()
    n = len(_VOWELS.findall(w))
    if w.endswith("e") and not w.endswith("le") and n > 1:
        n -= 1
    return max(1, n)


def _is_complex(token: str) -> bool:
    w = re.sub(r"[^a-z]", "", token.lower())
    if len(w) <= 2:
        return False
    base = _SUFFIX.sub("", w) or w
    return _syllables(base) >= 3


def readability(text: str) -> dict:
    text = (text or "").strip()
    words = _WORD.findall(text)
    wc = len(words)
    if wc == 0:
        return {"fog": 0.0, "asl": 0.0, "wc": 0, "cwp": 0.0}
    sentences = [s for s in re.split(r"[.!?]+", text) if s.strip()]
    ns = max(1, len(sentences))
    complex_n = sum(1 for w in words if _is_complex(w))
    asl = wc / ns
    cwp = 100.0 * complex_n / wc
    fog = 0.4 * (asl + cwp)
    return {"fog": round(fog, 1), "asl": round(asl, 1), "wc": wc, "cwp": round(cwp, 1)}


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    meta = json.loads((EMB / "meta.json").read_text())
    proj = json.loads((EMB / "projection.json").read_text())
    findings = json.loads((EMB / "findings.json").read_text())
    vecs = np.load(EMB / "embeddings.npy").astype(np.float32)
    n = len(meta)
    assert len(proj) == n == vecs.shape[0], "artifact length mismatch"

    id_to_idx = {m["footnote_id"]: i for i, m in enumerate(meta)}
    proj_by_id = {p["footnote_id"]: p for p in proj}

    # real AAER numbers per CIK (for the enforcement badge — never invented) + corpus counts
    con = connect(read_only=True)
    aaer = {}
    for cik, num, rdate in con.execute(
            "SELECT cik, aaer_number, release_date FROM enforcement ORDER BY release_date").fetchall():
        aaer.setdefault(str(cik), []).append({"aaer": num, "date": str(rdate) if rdate else None})
    q = lambda s: con.execute(s).fetchone()[0]
    yr = con.execute("SELECT MIN(filing_date), MAX(filing_date) FROM filings f JOIN footnotes USING(accession_number)").fetchone()
    corpus = {
        "companies_universe": q("SELECT COUNT(*) FROM companies"),
        "companies_enforced": q("SELECT COUNT(DISTINCT cik) FROM companies WHERE cik IN (SELECT cik FROM enforcement)"),
        "companies_clean": q("SELECT COUNT(*) FROM companies WHERE cik NOT IN (SELECT cik FROM enforcement)"),
        "companies_in_corpus": q("SELECT COUNT(DISTINCT cik) FROM footnotes fn JOIN filings f USING(accession_number)"),
        "filings": q("SELECT COUNT(*) FROM filings"),
        "filing_forms": dict(con.execute("SELECT form_type, COUNT(*) FROM filings GROUP BY 1 ORDER BY 2 DESC").fetchall()),
        "footnotes": q("SELECT COUNT(*) FROM footnotes"),
        "footnotes_by_type": dict(con.execute("SELECT footnote_type, COUNT(*) FROM footnotes GROUP BY 1").fetchall()),
        "aaer_releases": q("SELECT COUNT(*) FROM enforcement"),
        "year_min": str(yr[0])[:4] if yr[0] else None,
        "year_max": str(yr[1])[:4] if yr[1] else None,
    }
    con.close()

    # canonical type codes (must match the frontend TYPE_FULL/TYPE_TAG maps)
    TYPE = {"rev_rec": 0, "going_concern": 1, "related_party": 2, "cam": 3, "mda": 4, "risk_factors": 5}
    ciks = np.array([m["cik"] for m in meta])

    nodes, excerpts = [], {}
    cx_keys = []  # per-node grouping key for the industry-relative complexity comparison
    for i, m in enumerate(meta):
        p = proj_by_id[m["footnote_id"]]
        r = readability(m["text"])
        nodes.append({
            "i": i,
            "x": round(p["x"] * WORLD_SCALE, 1),
            "y": round(p["y"] * WORLD_SCALE, 1),
            "t": TYPE[m["type"]],
            "e": 1 if m["cohort"] == "enforced" else 0,
            "name": m["company_name"],
            "cik": m["cik"],
            "url": m["sec_url"],
            "sic": m.get("sic") or "",
            "ind": m.get("industry") or "",
            "fd": (m.get("filing_date") or "")[:4],
            "fdate": m.get("filing_date") or "",      # full ISO date (for citation)
            "acc": m.get("accession") or "",          # SEC accession number (for citation/CSV)
            "tk": "",                                 # ticker not carried in our dataset (honest blank)
            # descriptive readability (Gunning Fog) — comparative only, never a risk score
            "fog": r["fog"], "asl": r["asl"], "wc": r["wc"], "cwp": r["cwp"],
        })
        # group for the SIC-industry comparison: industry label, else SIC, else all
        cx_keys.append((m.get("industry") or m.get("sic") or "_all"))
        excerpts[str(i)] = clean_excerpt(m["text"])

    # complexity relative to SIC-industry peers: median Fog per group; classify below/near/above
    # ("near" = within +/-10% of the group median). This is descriptive context, not a verdict.
    groups: dict[str, list[float]] = {}
    for k, nd in zip(cx_keys, nodes):
        groups.setdefault(k, []).append(nd["fog"])
    medians = {k: float(np.median(v)) for k, v in groups.items()}
    for k, nd in zip(cx_keys, nodes):
        med = medians[k]
        nd["fim"] = round(med, 1)                     # industry median Fog (for panel display)
        lo, hi = med * 0.9, med * 1.1
        nd["cmp"] = -1 if nd["fog"] < lo else (1 if nd["fog"] > hi else 0)  # below / near / above

    # ---- descriptive DISTINCTIVENESS (language unusualness vs SIC-industry peers) ----------
    # How far this footnote's embedding sits from the centroid of SAME-INDUSTRY, SAME-TYPE
    # footnotes (cosine distance). Purely descriptive: a measure of how unusual the language is
    # relative to peers — NOT a finding, a judgment, or a measure of risk/wrongdoing. Tiers are
    # distribution-relative within each (industry, type) peer group:
    #   typical (<=75th pct) · distinctive (75-93rd) · highly distinctive (>93rd).
    # Embeddings are L2-normalized, so dot == cosine and distance = 1 - cosine.
    dx_members: dict = {}
    for i, (k, nd) in enumerate(zip(cx_keys, nodes)):
        dx_members.setdefault((k, nd["t"]), []).append(i)
    for (k, t), idxs in dx_members.items():
        if len(idxs) < 2:
            for i in idxs:
                nodes[i]["dst"] = 0.0; nodes[i]["dmd"] = 0.0; nodes[i]["dvi"] = 0
            continue
        sub = vecs[idxs]
        c = sub.mean(axis=0)
        nrm = float(np.linalg.norm(c))
        if nrm > 0:
            c = c / nrm
        d = 1.0 - (sub @ c)                            # cosine distance per peer
        md = float(np.median(d))
        if len(idxs) >= 8:
            p75, p93 = (float(x) for x in np.percentile(d, [75, 93]))
        else:
            p75 = p93 = float("inf")                   # too few peers to tier → all "typical"
        for j, i in enumerate(idxs):
            dv = float(d[j])
            nodes[i]["dst"] = round(dv, 3)             # distance from peer centroid
            nodes[i]["dmd"] = round(md, 3)             # peer-group median distance (panel display)
            nodes[i]["dvi"] = 0 if dv <= p75 else (1 if dv <= p93 else 2)  # typical/distinctive/highly

    # cross-company top-K neighbors (real cosine; dedup to distinct OTHER companies).
    # BATCHED + CHECKPOINTED: the full N x N Gram matrix is 33 GB at 91k, so we never
    # materialize it. We multiply the whole matrix against one column-batch at a time
    # (block = vecs @ vecs[s:s+B].T, ~190 MB), take the top-`OVER` candidates per column
    # with argpartition, then dedup to TOPK distinct companies. Each finished row is appended
    # to a checkpoint file, so an interrupted run (the build can take ~1-2 h at 91k) resumes
    # exactly where it stopped on re-run.
    neighbors = compute_neighbors_batched(vecs, ciks, n)

    # findings -> node-indexed featured pairs (skip any that don't map)
    featured = []
    for fd in findings:
        qi = id_to_idx.get(fd["a"]["footnote_id"])
        mi = id_to_idx.get(fd["b"]["footnote_id"])
        if qi is None or mi is None:
            continue
        featured.append({
            "qi": qi, "mi": mi,
            "type": fd["footnote_type"], "similarity": fd["similarity"],
            "explanation": fd["explanation"],
        })

    TYPE_NAMES = {0: "rev_rec", 1: "going_concern", 2: "related_party", 3: "cam", 4: "mda", 5: "risk_factors"}
    by_type = {TYPE_NAMES[k]: int(sum(1 for nd in nodes if nd["t"] == k)) for k in range(6)}
    manifest = {
        "count": n,
        "enforced": int(sum(nd["e"] for nd in nodes)),
        # per-type counts (all six). rev_rec/going_concern kept as top-level keys for back-compat.
        "by_type": by_type,
        "rev_rec": by_type["rev_rec"],
        "going_concern": by_type["going_concern"],
        "model": "bge-small-en-v1.5",
        "embedding_dim": int(vecs.shape[1]),
        "world_scale": WORLD_SCALE,
        "industries": sorted({nd["ind"] for nd in nodes if nd["ind"]}),
        "featured_count": len(featured),
        "corpus": corpus,
        "validation": {
            "headline": "Across 161,469 footnotes and SIX disclosure types, disclosure language does NOT separate SEC-enforced from matched-clean companies. This is a null I re-confirmed as the corpus grew to 161,469 footnotes across 3,253 companies, not a gap I'm hiding. That honesty is the point.",
            "rev_rec": "Revenue recognition: no separable signal (separation Cohen's d ≈ −0.12; semantic retrieval does not beat a keyword baseline).",
            "going_concern": "Going concern: only a weak distress tendency (separation d ≈ +0.15, below the 0.2 effect-size bar). It is real but far from a predictor.",
            "new_types": "The four narrative/relationship types show no enforcement signal either: separation d ≈ related-party −0.25, CAMs +0.11, MD&A −0.06, risk factors +0.02. None clears 0.2. The richer text did not rescue the hypothesis.",
            "engine": "What IS validated: the semantic engine retrieves concept-level matches that keyword search misses (e.g. cosine 0.88 at keyword rank 8,982). The map shows resemblance of disclosure language.",
            "stance": "The instrument surfaces resemblance of disclosure language; the reader judges. Enforcement history is shown as context about a company, never as a prediction from its disclosures. Apparent 'enforced clusters' are industry-peer effects (e.g. direct competitors), not an enforcement signal in the disclosures.",
        },
        "caveats": {
            "enforcement": "SEC enforcement history (AAER) is shown as context about a company's "
                           "history. It is NOT a prediction from its disclosures: my validation "
                           "backtest found disclosure language does not separate enforced from "
                           "matched-clean companies for these footnote types.",
            "going_concern": "Going-concern disclosures carry only a weak distress signal "
                             "(classifier AUC ≈ 0.61), a tendency, never a verdict.",
            "method": "Points are placed by UMAP over bge-small embeddings of the footnote text. "
                      "Similarity is cosine in that embedding space. The engine surfaces "
                      "resemblance of disclosure language; the reader judges.",
        },
    }

    (OUT / "nodes.json").write_text(json.dumps(nodes, separators=(",", ":")))
    (OUT / "excerpts.json").write_text(json.dumps(excerpts, separators=(",", ":"), ensure_ascii=False))
    (OUT / "neighbors.json").write_text(json.dumps(neighbors, separators=(",", ":")))
    (OUT / "findings.json").write_text(json.dumps(featured, separators=(",", ":"), ensure_ascii=False))
    (OUT / "aaer.json").write_text(json.dumps(aaer, separators=(",", ":")))
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False))
    shutil.copy(EMB / "embeddings.bin", OUT / "embeddings.bin")

    # Columnar Parquet bundle (ZSTD) — the scalable shipped format for 91k+ points. The LOD
    # frontend (Task 6) loads these; JSON is kept during the transition. DuckDB writes Parquet
    # directly from the JSON we just emitted (no extra deps).
    try:
        write_parquet_bundle(nodes, excerpts, neighbors)
    except Exception as e:
        print(f"  (parquet bundle skipped: {e})")

    print(f"wrote app data to {OUT}:")
    for f in ["nodes.json", "excerpts.json", "neighbors.json", "findings.json", "aaer.json",
              "manifest.json", "embeddings.bin"]:
        print(f"  {f}: {(OUT / f).stat().st_size // 1024} KB")
    print(f"nodes={n} enforced={manifest['enforced']} featured_pairs={len(featured)} "
          f"industries={len(manifest['industries'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
