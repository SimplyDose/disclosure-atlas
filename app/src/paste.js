// Paste-your-own-footnote: embed text IN THE BROWSER with the same bge-small model used to
// build the index (transformers.js, CLS pooling + L2 normalize to match fastembed), then cosine
// against the packed embeddings. $0, no API call, text never leaves the machine.

const TRANSFORMERS_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3";
const MODEL = "Xenova/bge-small-en-v1.5";
const DIM = 384;
const INV = 1 / 127;   // int8 dequantization scale for the shipped embeddings.bin

export class PasteSearch {
  constructor(nodes) {
    this.nodes = nodes;
    this.ciks = nodes.map((n) => n.cik);
    this._extractor = null; this._emb = null;
  }

  async _ensureModel(onStatus) {
    if (this._extractor) return this._extractor;
    onStatus && onStatus("loading embedding model (first time, ~30 MB)…");
    const mod = await import(/* @vite-ignore */ TRANSFORMERS_URL);
    const { pipeline, env } = mod;
    env.allowLocalModels = false; // fetch from HF hub
    this._extractor = await pipeline("feature-extraction", MODEL, {
      dtype: "q8",
      progress_callback: (p) => { if (p && p.status === "progress" && p.file && /onnx/.test(p.file)) onStatus && onStatus(`downloading model… ${Math.round(p.progress || 0)}%`); },
    });
    return this._extractor;
  }

  async _ensureEmbeddings(onStatus) {
    if (this._emb) return this._emb;
    onStatus && onStatus("loading vector index…");
    // embeddings.bin ships as int8 (L2-normalized vectors quantized x127) — ~36 MB instead of
    // 145 MB at 94k, well under the 100 MB/file host limit, with negligible cosine error.
    // Dequantize on use via INV (= 1/127); query vectors are float unit vectors.
    const buf = await (await fetch("./data/embeddings.bin")).arrayBuffer();
    const arr = new Int8Array(buf);
    if (arr.length !== this.nodes.length * DIM) {
      console.warn("embeddings.bin length mismatch", arr.length, this.nodes.length * DIM);
    }
    this._emb = arr;
    return arr;
  }

  async embed(text, onStatus) {
    const ex = await this._ensureModel(onStatus);
    onStatus && onStatus("embedding your text…");
    const out = await ex(text, { pooling: "cls", normalize: true });
    return Float32Array.from(out.data); // 384-d, normalized
  }

  // ---- helpers shared with bulk CSV export ----
  async ensureEmbeddings(onStatus) { return this._ensureEmbeddings(onStatus); }
  // dequantized float unit vector for a stored node (so node-as-query matches the pasted-float path)
  vecAt(idx) { if (!this._emb) return null; const off = idx * DIM, out = new Float32Array(DIM); for (let k = 0; k < DIM; k++) out[k] = this._emb[off + k] * INV; return out; }
  cosine(qvec, idx) { const off = idx * DIM; let d = 0; for (let k = 0; k < DIM; k++) d += qvec[k] * this._emb[off + k]; return Math.max(-1, Math.min(1, d * INV)); }
  get lastQueryVec() { return this._lastQueryVec; }
  // raw int8 corpus buffer + dims + scale — for O(N) aggregate centroid math (cohort analysis)
  get rawEmb() { return this._emb; }
  get dim() { return DIM; }
  get inv() { return INV; }

  // returns top-K cross-company neighbors [[idx, cosine], ...]
  async search(text, k, onStatus) {
    const [q, emb] = await Promise.all([this.embed(text, onStatus), this._ensureEmbeddings(onStatus)]);
    this._lastQueryVec = q;
    onStatus && onStatus("scoring " + this.nodes.length.toLocaleString() + " disclosures…");
    const N = this.nodes.length;
    const scored = new Array(N);
    for (let i = 0; i < N; i++) {
      let dot = 0; const off = i * DIM;
      for (let d = 0; d < DIM; d++) dot += q[d] * emb[off + d];
      scored[i] = [i, dot * INV];   // dequantize int8 corpus vectors
    }
    scored.sort((a, b) => b[1] - a[1]);
    const seen = new Set(); const out = [];
    for (const [i, s] of scored) {
      const c = this.ciks[i]; if (seen.has(c)) continue; seen.add(c);
      out.push([i, Math.max(-1, Math.min(1, s))]);
      if (out.length >= k) break;
    }
    return out;
  }
}
