"""Embed footnotes (bge-small) and build the shipped artifacts: vector matrix, browser
packed index, and the 2D UMAP projection for the constellation.

Outputs to data/embeddings/:
  embeddings.npy      float32 [N,384], L2-normalized (cosine == dot product)
  meta.json          aligned per-row metadata (id, cohort, type, company, cik, sec_url, ...)
  embeddings.bin     packed float32 little-endian [N*384] for the browser (transformers.js bge-small)
  index_meta.json    {dim, count, model, ids[], cohort[], type[], company[], cik[], sec_url[]}
  projection.json    [{footnote_id, x, y, cohort, type, company_name, cik, sec_url}]

Embeddings/projection are NOT DuckDB tables (DATA_MODEL: shipped as packed files).
Model = bge-small-en-v1.5 (same ONNX model the browser runs => build/runtime parity).

Run:  python ingestion/build_index.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

from db import connect

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "embeddings"
MODEL = "BAAI/bge-small-en-v1.5"
MODEL_VERSION = "bge-small-en-v1.5"


def load_rows(con):
    return con.execute(f"""
        SELECT fn.footnote_id, fn.raw_text_excerpt, fn.footnote_type,
               fn.extraction_confidence, fn.extraction_method, fn.char_count,
               f.accession_number, f.cik, f.sec_url, f.filing_date,
               co.company_name, co.sic_code, co.industry_label,
               CASE WHEN f.cik IN (SELECT cik FROM enforcement)
                    THEN 'enforced' ELSE 'clean' END AS cohort
        FROM footnotes fn
        JOIN filings f USING(accession_number)
        JOIN companies co ON co.cik = f.cik
        ORDER BY fn.footnote_id
    """).fetchall()


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    con = connect(read_only=True)
    rows = load_rows(con)
    con.close()
    if not rows:
        print("no footnotes to embed"); return 1
    cols = ["footnote_id", "text", "type", "confidence", "method", "char_count",
            "accession", "cik", "sec_url", "filing_date", "company_name", "sic", "industry", "cohort"]
    recs = [dict(zip(cols, r)) for r in rows]
    texts = [r["text"] for r in recs]
    cache = OUT / "embeddings.npy"
    if cache.exists() and np.load(cache, mmap_mode="r").shape[0] == len(texts) and "--reembed" not in sys.argv:
        vecs = np.load(cache)
        print(f"reusing cached embeddings {vecs.shape} (pass --reembed to force)")
    else:
        # RESUMABLE embed: stream into a float32 memmap, checkpointing a row counter so a kill never
        # loses embedded rows. On resume we re-embed only texts[resume_at:]. L2-normalize per vector
        # (cosine == dot product; matches in-browser search). Only save embeddings.npy when complete.
        N, DIM = len(texts), 384
        partial = OUT / "embeddings_partial.f32"
        counter = OUT / "embed_done.txt"
        right_size = partial.exists() and partial.stat().st_size == N * DIM * 4
        resume_at = 0
        if right_size and counter.exists():
            try:
                resume_at = max(0, min(N, int(counter.read_text().strip() or 0)))
            except Exception:
                resume_at = 0
        mm = np.memmap(partial, dtype=np.float32, mode=("r+" if right_size else "w+"), shape=(N, DIM))
        # --max-rows N caps how many rows THIS invocation embeds, then exits cleanly (resumable). Lets
        # embedding run as bounded foreground chunks (each under the tool timeout) immune to bg reaping.
        max_rows = int(sys.argv[sys.argv.index("--max-rows") + 1]) if "--max-rows" in sys.argv else None
        if resume_at >= N:
            print(f"embeddings already complete in partial ({N})")
        else:
            stop_at = N if max_rows is None else min(N, resume_at + max_rows)
            print(f"embedding {N} footnotes with {MODEL} (rows {resume_at}..{stop_at}) ...")
            from fastembed import TextEmbedding
            # ATLAS_THREADS=0/unset → full parallelism (fast). Set a low value only to throttle CPU.
            import os as _os
            _thr = int(_os.environ.get("ATLAS_THREADS", "0")) or None
            embedder = TextEmbedding(model_name=MODEL, threads=_thr)
            i = resume_at
            for emb in embedder.embed(texts[resume_at:stop_at]):
                v = np.asarray(emb, dtype=np.float32)
                nrm = float(np.linalg.norm(v))
                mm[i] = v / (nrm if nrm > 1e-8 else 1.0)
                i += 1
                if i % 1000 == 0:
                    mm.flush(); counter.write_text(str(i))
                    print(f"  embedded {i}/{N}", flush=True)
            mm.flush(); counter.write_text(str(i))
            if i < N:
                del mm
                print(f"INCOMPLETE embed: {i}/{N} done this/total. Re-run to continue.", flush=True)
                return 0
        vecs = np.array(mm, dtype=np.float32)
        print(f"embeddings shape {vecs.shape}")
        del mm

    np.save(OUT / "embeddings.npy", vecs)
    # embed complete → drop the resumable scratch so future builds start clean
    for scratch in (OUT / "embeddings_partial.f32", OUT / "embed_done.txt"):
        try:
            scratch.unlink()
        except FileNotFoundError:
            pass
    # Shipped browser index as int8 (vectors are L2-normalized; quantize x127). ~4x smaller than
    # float32 and under the 100 MB/file host limit at 94k; cosine error is negligible. The frontend
    # (paste.js) dequantizes by 1/127. embeddings.npy stays float32 for offline neighbor/validation.
    np.clip(np.round(vecs * 127.0), -127, 127).astype(np.int8).tofile(OUT / "embeddings.bin")

    # aligned metadata (drop full text from the shipped index to keep it lean; keep in meta.json)
    for d in recs:
        d["filing_date"] = str(d["filing_date"]) if d["filing_date"] else None
    (OUT / "meta.json").write_text(json.dumps(recs, ensure_ascii=False))
    index_meta = {
        "dim": int(vecs.shape[1]), "count": int(vecs.shape[0]), "model": MODEL_VERSION,
        "ids": [r["footnote_id"] for r in recs],
        "cohort": [r["cohort"] for r in recs],
        "type": [r["type"] for r in recs],
        "company": [r["company_name"] for r in recs],
        "cik": [r["cik"] for r in recs],
        "sec_url": [r["sec_url"] for r in recs],
    }
    (OUT / "index_meta.json").write_text(json.dumps(index_meta, ensure_ascii=False))

    # 2D projection for the constellation
    print("computing UMAP projection ...")
    import umap
    reducer = umap.UMAP(n_neighbors=15, min_dist=0.12, metric="cosine", random_state=42)
    xy = reducer.fit_transform(vecs)
    xy = np.asarray(xy, dtype=np.float32)
    # scale to a stable [-1,1] box for the renderer
    mn, mx = xy.min(0), xy.max(0)
    span = np.clip(mx - mn, 1e-6, None)
    xy01 = (xy - mn) / span * 2 - 1
    projection = [{
        "footnote_id": r["footnote_id"], "x": round(float(xy01[i, 0]), 5),
        "y": round(float(xy01[i, 1]), 5), "cohort": r["cohort"], "type": r["type"],
        "company_name": r["company_name"], "cik": r["cik"], "sec_url": r["sec_url"],
    } for i, r in enumerate(recs)]
    (OUT / "projection.json").write_text(json.dumps(projection, ensure_ascii=False))

    print(f"wrote artifacts to {OUT}:")
    for f in ["embeddings.npy", "embeddings.bin", "meta.json", "index_meta.json", "projection.json"]:
        print(f"  {f}: {(OUT / f).stat().st_size//1024} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
