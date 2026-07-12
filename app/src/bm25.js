// Lightweight BM25 keyword index over the corpus excerpts — built lazily, in-browser.
// Used by the "show keyword baseline" toggle to put a keyword ranking next to the semantic one,
// making the validated semantic-beats-keyword result tangible (and the honest framing concrete).

const STOP = new Set(("the of to and a in is for that on as are with by an be or this its which at from has " +
  "have was were will would such not no any all we our us their it they when where than then also may " +
  "company companys").split(" "));
function tokens(s) { return (String(s || "").toLowerCase().match(/[a-z][a-z0-9]+/g) || []).filter((t) => t.length > 2 && !STOP.has(t)); }

export class BM25 {
  constructor() { this.ready = false; this.k1 = 1.5; this.b = 0.75; }
  build(excerpts, nodes) {
    const N = nodes.length;
    this.docs = new Array(N); this.df = new Map(); this.len = new Float32Array(N); this.nodes = nodes;
    let total = 0;
    for (let i = 0; i < N; i++) {
      const toks = tokens(excerpts[String(i)]); const tf = new Map();
      for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1);
      this.docs[i] = tf; this.len[i] = toks.length; total += toks.length;
      for (const t of tf.keys()) this.df.set(t, (this.df.get(t) || 0) + 1);
    }
    this.N = N; this.avg = total / N || 1; this.ready = true;
  }
  // top-k cross-company keyword matches for a query text; excludes the query's own CIK
  scoreQuery(text, k, excludeCik) {
    const qt = [...new Set(tokens(text))];
    const idf = qt.map((t) => { const df = this.df.get(t) || 0; return Math.log(1 + (this.N - df + 0.5) / (df + 0.5)); });
    const scored = [];
    for (let i = 0; i < this.N; i++) {
      const tf = this.docs[i]; if (!tf || !tf.size) continue;
      let s = 0;
      for (let j = 0; j < qt.length; j++) { const f = tf.get(qt[j]); if (!f) continue; s += idf[j] * (f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + this.b * this.len[i] / this.avg)); }
      if (s > 0) scored.push([i, s]);
    }
    scored.sort((a, b) => b[1] - a[1]);
    const seen = new Set(excludeCik ? [excludeCik] : []); const out = [];
    for (const [i, s] of scored) { const c = this.nodes[i].cik; if (seen.has(c)) continue; seen.add(c); out.push([i, s]); if (out.length >= k) break; }
    return out;
  }
}
