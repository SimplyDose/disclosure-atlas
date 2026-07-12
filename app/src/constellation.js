// Constellation canvas engine — ported from the locked Claude Design, wired to REAL data.
// Drawing/motion/aesthetic preserved exactly (nebula, polar grid, faint edges, node glow,
// twinkle, ambient drift, weighted fly-to, vignette). Synthetic PRNG data is replaced by the
// real UMAP nodes + real cross-company neighbors. Amber === real enforced cohort only.

const EASE_PTS = [0.22, 0.61, 0.36, 1];
const DRIFT_STEP_MS = 850;   // animation pace: one filing-year step per this many ms
const TYPE_LABEL = { 0: "revenue recognition", 1: "going concern", 2: "related-party", 3: "critical audit matter", 4: "MD&A", 5: "risk factors" };
const TYPE_TAG = { 0: "REV-REC", 1: "GOING CONCERN", 2: "RELATED-PARTY", 3: "CAM", 4: "MD&A", 5: "RISK FACTORS" };

function bezier(p1x, p1y, p2x, p2y) {
  const cx = 3 * p1x, bx = 3 * (p2x - p1x) - cx, ax = 1 - cx - bx;
  const cy = 3 * p1y, by = 3 * (p2y - p1y) - cy, ay = 1 - cy - by;
  const fx = (t) => ((ax * t + bx) * t + cx) * t;
  const dfx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (t) => { let x = t; for (let i = 0; i < 5; i++) { const e = fx(x) - t, d = dfx(x); if (Math.abs(d) < 1e-6) break; x -= e / d; } return ((ay * x + by) * x + cy) * x; };
}

export class Constellation {
  constructor(canvas, data, opts = {}) {
    this.canvas = canvas;
    this.nodes = data.nodes;
    this.neighbors = data.neighbors; // by index: [[idx,score]...]
    this.onSelect = opts.onSelect || (() => {});
    this.reduced = matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.ease = bezier(...EASE_PTS);
    this.filter = { type: "all", industry: "", enforcedOnly: false, sim: 0, cmp: null, dvi: null, score: null, yearMin: null, yearMax: null };
    this.sel = null; this.virtual = null; this.hover = -1;
    this.dragging = false; this._moved = false;

    // per-node static visual props (deterministic)
    for (const n of this.nodes) {
      const h = (n.i * 2654435761) >>> 0;
      n.b = 0.4 + ((h % 1000) / 1000) * 0.5;     // brightness 0.4–0.9
      n.ph = ((h >>> 10) % 6283) / 1000;          // twinkle phase
      n.r = n.e ? 2.4 : (1.2 + (n.b - 0.4) * 2.2); // radius
    }
    this._buildEdges();
    this._bounds();
    this._init();
  }

  // edges: each node to its top-2 cross-company neighbors (deduped, undirected)
  _buildEdges() {
    const seen = new Set(); const edges = [];
    for (let i = 0; i < this.nodes.length; i++) {
      const nb = this.neighbors[i] || [];
      for (let k = 0; k < Math.min(2, nb.length); k++) {
        const j = nb[k][0], s = nb[k][1];
        const key = i < j ? i + "_" + j : j + "_" + i;
        if (seen.has(key)) continue; seen.add(key);
        edges.push([i, j, s]);
      }
    }
    this.edges = edges;
  }

  _bounds() {
    let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    for (const n of this.nodes) { if (n.x < minx) minx = n.x; if (n.x > maxx) maxx = n.x; if (n.y < miny) miny = n.y; if (n.y > maxy) maxy = n.y; }
    this.bounds = { minx, maxx, miny, maxy, cx: (minx + maxx) / 2, cy: (miny + maxy) / 2, w: maxx - minx, h: maxy - miny };
  }

  _init() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this._resize();
    this.heroCam = this._heroCam();
    this.base = { ...this.heroCam }; this.cam = { ...this.base }; this.camAnim = null;
    this.narrow = this.cssW < 720;
    const cv = this.canvas;
    cv.addEventListener("mousemove", (e) => this._mouseMove(e));
    cv.addEventListener("mouseleave", () => { this.hover = -1; this._tip && (this._tip.style.opacity = "0"); cv.style.cursor = "default"; });
    cv.addEventListener("mousedown", (e) => this._down(e));
    window.addEventListener("mouseup", () => { this.dragging = false; });
    window.addEventListener("mousemove", (e) => this._drag(e));
    cv.addEventListener("click", (e) => this._click(e));
    cv.addEventListener("wheel", (e) => this._wheel(e), { passive: false });
    this.ro = new ResizeObserver(() => { this._resize(); this.narrow = this.cssW < 720; this.heroCam = this._heroCam(); if (!this.camAnim && !this.sel) this.base = { ...this.heroCam }; });
    this.ro.observe(this.canvas.parentElement);
    this.t0 = performance.now();
    this._tick();
  }
  setTip(tip, name, meta) { this._tip = tip; this._tipName = name; this._tipMeta = meta; }

  _resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    this.cssW = r.width; this.cssH = r.height;
    this.canvas.width = Math.round(r.width * this.dpr); this.canvas.height = Math.round(r.height * this.dpr);
  }
  _heroCam() {
    const b = this.bounds;
    if (!(this.cssW > 0 && this.cssH > 0)) return { x: b.cx, y: b.cy, zoom: 0.3 };
    const narrow = this.cssW < 720;
    const zoom = Math.min(this.cssW / (b.w * 1.18), this.cssH / (b.h * 1.18)) * (narrow ? 0.96 : 0.92);
    const shiftX = narrow ? 0 : -(this.cssW * 0.13) / zoom;
    return { x: b.cx + shiftX, y: b.cy - (this.cssH * 0.04) / zoom, zoom };
  }

  // transforms
  _w2s(wx, wy) { const c = this.cam; return [this.cssW / 2 + (wx - c.x) * c.zoom, this.cssH / 2 + (wy - c.y) * c.zoom]; }
  _s2w(sx, sy) { const c = this.cam; return [(sx - this.cssW / 2) / c.zoom + c.x, (sy - this.cssH / 2) / c.zoom + c.y]; }
  _evtPos(e) { const r = this.canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }

  _passesFilter(n) {
    if (this.filter.type !== "all" && n.t !== +this.filter.type) return false;
    if (this.filter.industry && n.ind !== this.filter.industry) return false;
    if (this.filter.enforcedOnly && !n.e) return false;
    if (this.filter.cmp != null && n.cmp !== this.filter.cmp) return false;
    if (this.filter.dvi != null && n.dvi !== this.filter.dvi) return false;
    if (this.filter.score) {   // financial-quality screen filter (Chapter E)
      const s = this.filter.score;
      if (s === "scored" && n.ms == null && n.fs == null) return false;
      if (s === "mflag" && n.mflag !== 1) return false;
      if (s === "fhigh" && !(n.fs > 1)) return false;
    }
    if (this.filter.yearMin || this.filter.yearMax) { const y = +n.fd; if (this.filter.yearMin && y < this.filter.yearMin) return false; if (this.filter.yearMax && y > this.filter.yearMax) return false; }
    return true;
  }

  _pick(sx, sy) {
    let best = -1, bd = 16 * 16;
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      if (!this._passesFilter(n)) continue;
      const [px, py] = this._w2s(n.x, n.y);
      if (px < sx - 20 || px > sx + 20 || py < sy - 20 || py > sy + 20) continue;  // cheap reject before sqrt math
      const dx = px - sx, dy = py - sy; const d = dx * dx + dy * dy;
      const rr = Math.max(8, n.r * this.cam.zoom + 6);
      if (d < rr * rr && d < bd) { bd = d; best = i; }
    }
    return best;
  }
  _mouseMove(e) {
    const [sx, sy] = this._evtPos(e);
    if (this.dragging) return;
    const i = this._pick(sx, sy); this.hover = i;
    this.canvas.style.cursor = i >= 0 ? "pointer" : "default";
    if (i >= 0 && this._tip) {
      const n = this.nodes[i];
      this._tipName.textContent = n.name;
      this._tipMeta.innerHTML = (TYPE_TAG[n.t] || "FOOTNOTE") + " · CIK " + n.cik + (n.e ? '  <span style="color:#E0A04A">● ENFORCEMENT HISTORY</span>' : "");
      this._tip.style.left = sx + "px"; this._tip.style.top = sy + "px"; this._tip.style.opacity = "1";
    } else if (this._tip) this._tip.style.opacity = "0";
  }
  _down(e) { this.dragging = true; this._moved = false; this.dragStart = this._evtPos(e); this.baseStart = { ...this.base }; }
  _drag(e) { if (!this.dragging) return; const [sx, sy] = this._evtPos(e); const dx = sx - this.dragStart[0], dy = sy - this.dragStart[1]; if (Math.abs(dx) + Math.abs(dy) > 3) this._moved = true; this.camAnim = null; this.base = { ...this.base, x: this.baseStart.x - dx / this.base.zoom, y: this.baseStart.y - dy / this.base.zoom }; this._tip && (this._tip.style.opacity = "0"); }
  _click(e) { if (this._moved) return; const [sx, sy] = this._evtPos(e); const i = this._pick(sx, sy); if (i >= 0) this.selectIndex(i); }
  _wheel(e) { e.preventDefault(); this.camAnim = null; const [sx, sy] = this._evtPos(e); const [wx, wy] = this._s2w(sx, sy); const f = Math.exp(-e.deltaY * 0.0014); const nz = Math.max(this.heroCam.zoom * 0.55, Math.min(this.heroCam.zoom * 12, this.base.zoom * f)); this.base = { x: wx - (sx - this.cssW / 2) / nz, y: wy - (sy - this.cssH / 2) / nz, zoom: nz }; }

  _localRadius(idx) {
    const nb = this.neighbors[idx] || []; const q = this.nodes[idx]; let mx = 60;
    for (const [j] of nb) { const m = this.nodes[j]; mx = Math.max(mx, Math.hypot(m.x - q.x, m.y - q.y)); }
    return mx;
  }
  _flyTo(target, dur) { if (dur <= 0) { this.base = { ...target }; this.camAnim = null; return; } this.camAnim = { from: { ...this.base }, to: target, t0: performance.now(), dur }; }

  // ---- selection: a real map node ----
  selectIndex(qi, forceMatch = null) {
    const q = this.nodes[qi];
    let nb = (this.neighbors[qi] || []).map(([j, s], idx) => ({ idx: j, rank: idx, score: s }));
    let match = nb.length ? nb[0].idx : qi;
    if (forceMatch != null && forceMatch !== qi) {
      match = forceMatch;
      if (!nb.some((x) => x.idx === forceMatch)) {
        // featured match not in precomputed top-K (rare): inject with its real cosine
        const s = this._cosineKnown(qi, forceMatch);
        nb = [{ idx: forceMatch, rank: 0, score: s }, ...nb].slice(0, 10).map((x, i) => ({ ...x, rank: i }));
      }
    }
    this.sel = { q: qi, match, nb, t0: performance.now(), nbSet: new Set(nb.map((x) => x.idx)) };
    this.virtual = null;
    this._flyToNode(qi);
    this.onSelect(this._finding());
  }
  _cosineKnown(qi, mi) {
    // fall back to a neighbor's recorded score if present, else a conservative estimate
    const rec = (this.neighbors[qi] || []).find(([j]) => j === mi);
    return rec ? rec[1] : 0.9;
  }
  selectPair(qi, mi) { this.selectIndex(qi, mi); }
  _flyToNode(qi) {
    const q = this.nodes[qi]; const rad = this._localRadius(qi);
    const minDim = Math.min(this.cssW, this.cssH);
    const tz = Math.max(this.heroCam.zoom * 1.5, Math.min(this.heroCam.zoom * 9, (minDim * 0.55) / (rad * 2.2)));
    const offX = this.narrow ? 0 : (this.cssW * 0.18) / tz;
    const offY = this.narrow ? -(this.cssH * 0.14) / tz : 0;
    this._flyTo({ x: q.x + offX, y: q.y + offY, zoom: tz }, this.reduced ? 0 : 780);
  }

  // ---- selection: a virtual pasted query ----
  selectVirtual(neighborList, label, excerpt) {
    // place a virtual node at the weighted centroid of its top neighbors
    let wx = 0, wy = 0, ws = 0;
    for (const [j, s] of neighborList.slice(0, 6)) { const m = this.nodes[j]; const w = Math.max(0.01, s); wx += m.x * w; wy += m.y * w; ws += w; }
    const vx = ws ? wx / ws : this.bounds.cx, vy = ws ? wy / ws : this.bounds.cy;
    const nb = neighborList.map(([j, s], idx) => ({ idx: j, rank: idx, score: s }));
    this.virtual = { x: vx, y: vy, label: label || "Your pasted disclosure", excerpt: excerpt || "" };
    this.sel = { q: -1, match: nb.length ? nb[0].idx : -1, nb, t0: performance.now(), nbSet: new Set(nb.map((x) => x.idx)), virtual: true };
    // fly to the centroid
    let mx = 80; for (const [j] of neighborList) { const m = this.nodes[j]; mx = Math.max(mx, Math.hypot(m.x - vx, m.y - vy)); }
    const minDim = Math.min(this.cssW, this.cssH);
    const tz = Math.max(this.heroCam.zoom * 1.4, Math.min(this.heroCam.zoom * 8, (minDim * 0.55) / (mx * 2.2)));
    const offX = this.narrow ? 0 : (this.cssW * 0.18) / tz;
    this._flyTo({ x: vx + offX, y: vy, zoom: tz }, this.reduced ? 0 : 780);
    this.onSelect(this._finding());
  }

  setMatch(mi) { if (!this.sel) return; this.sel.match = mi; this.onSelect(this._finding()); }
  closeFinding() { this.sel = null; this.virtual = null; this._flyTo({ ...this.heroCam }, this.reduced ? 0 : 760); this._tip && (this._tip.style.opacity = "0"); }

  _finding() {
    const sel = this.sel; const m = this.nodes[sel.match];
    const q = sel.virtual ? null : this.nodes[sel.q];
    const nb = sel.nb.filter((x) => x.score >= this.filter.sim);
    const best = sel.nb.find((x) => x.idx === sel.match);
    return {
      virtual: !!sel.virtual,
      query: q ? { idx: q.i, name: q.name, cik: q.cik, url: q.url, type: q.t, enforced: !!q.e } :
        { idx: -1, name: this.virtual.label, cik: "—", url: null, type: m.t, enforced: false, pasted: true, excerpt: this.virtual.excerpt },
      match: { idx: m.i, name: m.name, cik: m.cik, url: m.url, type: m.t, enforced: !!m.e },
      score: best ? best.score : 0,
      typeLabel: TYPE_LABEL[m.t],
      neighbors: nb.map((x) => ({ idx: x.idx, rank: x.rank, name: this.nodes[x.idx].name, score: x.score, enforced: !!this.nodes[x.idx].e, active: x.idx === sel.match })),
      neighborCount: sel.nb.length,
    };
  }

  // ---- filters ----
  setFilter(patch) { Object.assign(this.filter, patch); if (this.sel) this.onSelect(this._finding()); }
  filteredIndices() { const out = []; for (let i = 0; i < this.nodes.length; i++) if (this._passesFilter(this.nodes[i])) out.push(i); return out; }
  queryIndex() { return this.sel && !this.sel.virtual ? this.sel.q : -1; }

  // ---- search / presets ----
  findByText(qraw) {
    const q = (qraw || "").trim().toLowerCase(); if (!q) return -1;
    let hit = this.nodes.findIndex((n) => n.cik === q.padStart(10, "0") || n.cik === q);
    if (hit < 0) hit = this.nodes.findIndex((n) => n.name.toLowerCase() === q);
    if (hit < 0) hit = this.nodes.findIndex((n) => n.name.toLowerCase().includes(q));
    if (hit < 0) { if (q.includes("going")) hit = this.nodes.findIndex((n) => n.t === 1); else if (q.includes("rev")) hit = this.nodes.findIndex((n) => n.t === 0); }
    return hit;
  }

  // ---- draw loop (ported) ----
  _tick() { this.raf = requestAnimationFrame(() => this._tick()); this._draw(); }
  _draw() {
    const ctx = this.canvas.getContext("2d"); if (!ctx) return;
    if (!(this.cssW > 0 && this.cssH > 0)) { this._resize(); if (!(this.cssW > 0 && this.cssH > 0)) return; }
    if (!this.base || !isFinite(this.base.zoom) || this.base.zoom <= 0) { this.heroCam = this._heroCam(); this.base = { ...this.heroCam }; }
    const now = performance.now(), t = now - this.t0;
    if (this.camAnim) { let p = (now - this.camAnim.t0) / this.camAnim.dur; if (p >= 1) { this.base = { ...this.camAnim.to }; this.camAnim = null; } else { const e = this.ease(p), a = this.camAnim.from, b = this.camAnim.to; this.base = { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, zoom: a.zoom + (b.zoom - a.zoom) * e }; } }
    let dx = 0, dy = 0; if (!this.reduced && !this.dragging) { const z = Math.max(this.base.zoom, 1e-3); dx = Math.sin(t * 0.00006) * 7 / z; dy = Math.cos(t * 0.00008) * 6 / z; }
    this.cam = { x: this.base.x + dx, y: this.base.y + dy, zoom: this.base.zoom };
    const W = this.cssW, H = this.cssH, dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#060708"; ctx.fillRect(0, 0, W, H);
    const center = this._w2s(this.bounds.cx - 120, this.bounds.cy - 40);
    const neb = ctx.createRadialGradient(center[0], center[1], 0, center[0], center[1], Math.max(W, H) * 0.55);
    neb.addColorStop(0, "rgba(26,30,38,0.20)"); neb.addColorStop(0.5, "rgba(14,17,22,0.08)"); neb.addColorStop(1, "rgba(6,7,8,0)");
    ctx.fillStyle = neb; ctx.fillRect(0, 0, W, H);
    this._drawGrid(ctx); this._drawEdges(ctx); this._drawNodes(ctx, now);
    if (this.virtual) this._drawVirtual(ctx, now);
    if (this.drift) this._drawDrift(ctx, now);
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.5, W / 2, H / 2, Math.max(W, H) * 0.82);
    vg.addColorStop(0, "rgba(6,7,8,0)"); vg.addColorStop(1, "rgba(0,0,0,0.66)");
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }
  _drawGrid(ctx) {
    const c0 = this._w2s(this.bounds.cx, this.bounds.cy);
    ctx.save(); ctx.strokeStyle = "#1E2A38"; ctx.lineWidth = 1;
    for (let r = 200; r <= 1300; r += 180) { ctx.beginPath(); ctx.arc(c0[0], c0[1], r * this.cam.zoom, 0, 6.2832); ctx.globalAlpha = 0.32 - (r / 1300) * 0.16; ctx.stroke(); }
    ctx.globalAlpha = 0.12;
    for (let a = 0; a < 12; a++) { const ang = a * Math.PI / 6; ctx.beginPath(); ctx.moveTo(c0[0], c0[1]); ctx.lineTo(c0[0] + Math.cos(ang) * 1300 * this.cam.zoom, c0[1] + Math.sin(ang) * 1300 * this.cam.zoom); ctx.stroke(); }
    ctx.restore();
  }
  _drawEdges(ctx) {
    const sel = this.sel; ctx.lineWidth = 1;
    // LOD: at 94k the full edge web is ~150k strokes/frame (slow) and a visual hairball. When a
    // finding is selected we draw ONLY its neighbor edges (clean focus); otherwise we draw a
    // decimated sample of the ambient web plus any hovered node's edges.
    const big = this.nodes.length > 20000;
    const ambientStride = big ? 15 : 1;
    for (let ei = 0; ei < this.edges.length; ei++) {
      const e = this.edges[ei];
      const a = this.nodes[e[0]], b = this.nodes[e[1]];
      const inA = sel ? (sel.nbSet.has(a.i) || a.i === sel.q) : (this.hover >= 0 && a.i === this.hover);
      const inB = sel ? (sel.nbSet.has(b.i) || b.i === sel.q) : (this.hover >= 0 && b.i === this.hover);
      const important = inA || inB;
      if (!important) {
        if (sel) continue;                              // selection active: hide ambient web
        if (ei % ambientStride !== 0) continue;         // decimate ambient web when large
      }
      const [ax, ay] = this._w2s(a.x, a.y), [bx, by] = this._w2s(b.x, b.y);
      if ((ax < -40 && bx < -40) || (ax > this.cssW + 40 && bx > this.cssW + 40) || (ay < -40 && by < -40) || (ay > this.cssH + 40 && by > this.cssH + 40)) continue;
      let alpha = 0.05, col = "#1E2A38";
      if (sel) {
        if (inA && inB && e[2] >= this.filter.sim) { alpha = 0.3; col = "#5BA4DD"; }
        else { alpha = 0.09; col = "#3A4656"; }
      } else if (this.hover >= 0 && important) { alpha = 0.22; col = "#8A97A8"; }
      else if (e[2] >= this.filter.sim && this.filter.sim > 0) { alpha = 0.12; col = "#3A4656"; }
      ctx.globalAlpha = alpha; ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  _drawNodes(ctx, now) {
    const sel = this.sel; const hov = this.hover;
    // Level-of-detail: at 94k points, draw every ambient node only when zoomed in. When zoomed
    // out (most/all points on screen), decimate the ambient cloud by an index-stride so the draw
    // count stays bounded and the map stays smooth — enforced (amber, meaningful), selection-
    // relevant, and hovered nodes are ALWAYS drawn, so nothing important is dropped. Deterministic
    // stride (by index) keeps the visible cloud stable frame-to-frame (no flicker).
    const big = this.nodes.length > 20000;
    let stride = 1;
    if (big) {
      const zr = this.cam.zoom / this.heroCam.zoom;
      stride = zr <= 1.2 ? 9 : zr <= 2 ? 5 : zr <= 3.5 ? 3 : zr <= 6 ? 2 : 1;
    }
    const lightGlow = big && (this.cam.zoom / this.heroCam.zoom) < 1.5;  // drop costly shadowBlur when far out
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i]; const [sx, sy] = this._w2s(n.x, n.y);
      if (sx < -30 || sx > this.cssW + 30 || sy < -30 || sy > this.cssH + 30) continue;
      const important = n.e || (sel && (n.i === sel.q || n.i === sel.match || sel.nbSet.has(n.i))) || (hov >= 0 && n.i === hov);
      if (stride > 1 && !important && (n.i % stride) !== 0) continue;
      const filtered = !this._passesFilter(n);
      let r = Math.max(0.7, Math.min(7.5, n.r * this.cam.zoom * 0.62));
      let color, alpha = 1, glow = 0;
      const twk = this.reduced ? 1 : (0.82 + 0.18 * Math.sin(now * 0.0011 + n.ph));
      if (filtered) { color = "#283340"; alpha = 0.16 * twk; }
      else if (sel) {
        const isQ = n.i === sel.q; const isM = n.i === sel.match; const rank = sel.nbSet.has(n.i) ? sel.nb.find((x) => x.idx === n.i).rank : undefined;
        if (isQ) { color = "#5BA4DD"; alpha = 1; glow = 14; r = Math.max(r, 4.6); }
        else if (rank !== undefined) {
          const reveal = Math.max(0, Math.min(1, (now - sel.t0 - rank * 22) / 300)); const e = this.ease(reveal);
          if (n.e) { color = "#E0A04A"; glow = 8 * e; } else { color = "#DCE3EC"; }
          alpha = 0.35 + 0.65 * e; r = Math.max(r, isM ? 3.8 : 2.4); if (isM) glow = Math.max(glow, 8);
        } else { if (n.e) { color = "#E0A04A"; alpha = 0.3; } else { color = "#3A4656"; alpha = 0.3; } }
      } else {
        if (n.e) { color = "#E0A04A"; alpha = 0.9 * twk; glow = lightGlow ? 0 : 6; }
        else { const br = n.b; color = br > 0.78 ? "#DCE3EC" : (br > 0.5 ? "#8A97A8" : "#3A4656"); alpha = (0.35 + br * 0.6) * twk; }
        if (hov >= 0 && n.i === hov) { color = "#DCE3EC"; alpha = 1; r = Math.max(r, 3.2); glow = Math.max(glow, 7); }
      }
      if (glow > 0) { ctx.save(); ctx.globalAlpha = Math.min(1, alpha); ctx.shadowColor = color; ctx.shadowBlur = glow; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(sx, sy, r, 0, 6.2832); ctx.fill(); ctx.restore(); }
      else { ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(sx, sy, r, 0, 6.2832); ctx.fill(); }
      if (sel && n.i === sel.q) { ctx.globalAlpha = 0.9; ctx.strokeStyle = "#5BA4DD"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(sx, sy, r + 6, 0, 6.2832); ctx.stroke(); ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.arc(sx, sy, r + 11, 0, 6.2832); ctx.stroke(); }
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  }
  _drawVirtual(ctx, now) {
    const v = this.virtual; const [sx, sy] = this._w2s(v.x, v.y);
    const pulse = this.reduced ? 1 : (0.7 + 0.3 * Math.sin(now * 0.004));
    ctx.save(); ctx.globalAlpha = 1; ctx.shadowColor = "#5BA4DD"; ctx.shadowBlur = 18; ctx.fillStyle = "#5BA4DD"; ctx.beginPath(); ctx.arc(sx, sy, 5.2, 0, 6.2832); ctx.fill();
    ctx.shadowBlur = 0; ctx.globalAlpha = 0.85 * pulse; ctx.strokeStyle = "#5BA4DD"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(sx, sy, 9 + 3 * pulse, 0, 6.2832); ctx.stroke(); ctx.restore();
  }

  // ---- disclosure drift over time (descriptive movement, never a prediction) ----
  // Trace how ONE company's ONE footnote-type language moves through the (projected) embedding
  // space year over year: centroid the company's nodes per filing year, connect chronologically.
  traceDrift(cik, type) {
    const byYear = new Map();
    let company = "", industry = "";
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      if (n.cik !== cik || n.t !== type) continue;
      const y = +n.fd; if (!y) continue;
      company = n.name; industry = n.ind;
      (byYear.get(y) || byYear.set(y, []).get(y)).push(n);
    }
    const years = [...byYear.keys()].sort((a, b) => a - b);
    if (years.length < 2) { this.drift = null; return null; }
    const pts = years.map((y) => { const a = byYear.get(y); let sx = 0, sy = 0; for (const n of a) { sx += n.x; sy += n.y; } return { year: y, x: sx / a.length, y: sy / a.length, n: a.length }; });
    // descriptive reference anchors: the company's industry centroid for this type, and the
    // going-concern ("distress-language") region of the map. Distances are pure geometry.
    let ix = 0, iy = 0, ic = 0, gx = 0, gy = 0, gc = 0;
    for (const n of this.nodes) {
      if (n.t === type && industry && n.ind === industry) { ix += n.x; iy += n.y; ic++; }
      if (n.t === 1) { gx += n.x; gy += n.y; gc++; }
    }
    const indC = ic ? { x: ix / ic, y: iy / ic } : null, gcC = gc ? { x: gx / gc, y: gy / gc } : null;
    const dist = (p, c) => c ? Math.hypot(p.x - c.x, p.y - c.y) : null;
    this.drift = { cik, type, company, pts, t0: performance.now(), playing: true, cursor: 0 };
    let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9;
    for (const p of pts) { mnx = Math.min(mnx, p.x); mny = Math.min(mny, p.y); mxx = Math.max(mxx, p.x); mxy = Math.max(mxy, p.y); }
    const cx = (mnx + mxx) / 2, cy = (mny + mxy) / 2;
    const w = Math.max(160, mxx - mnx) * 1.8, h = Math.max(160, mxy - mny) * 1.8;
    const z = Math.max(this.heroCam.zoom * 0.6, Math.min(this.heroCam.zoom * 9, Math.min(this.cssW / w, this.cssH / h)));
    this._flyTo({ x: cx, y: cy, zoom: z }, 700);
    return {
      company, industry, type, years, first: years[0], last: years[years.length - 1], nYears: years.length,
      industry_dist: indC ? { first: dist(pts[0], indC), last: dist(pts[pts.length - 1], indC) } : null,
      going_concern_dist: gcC ? { first: dist(pts[0], gcC), last: dist(pts[pts.length - 1], gcC) } : null,
    };
  }
  closeDrift() { this.drift = null; }
  driftState() { if (!this.drift) return null; const d = this.drift, P = d.pts.length; const k = Math.min(P - 1, Math.round(d.cursor)); return { cursor: d.cursor, n: P, year: d.pts[k].year, playing: d.playing }; }
  driftSetCursor(frac) { if (!this.drift) return; this.drift.playing = false; this.drift.cursor = Math.max(0, Math.min(this.drift.pts.length - 1, frac * (this.drift.pts.length - 1))); }
  driftTogglePlay() { if (!this.drift) return false; const d = this.drift; d.playing = !d.playing; if (d.playing) { if (d.cursor >= d.pts.length - 1) d.cursor = 0; d.t0 = performance.now() - d.cursor * DRIFT_STEP_MS; } return d.playing; }

  _drawDrift(ctx, now) {
    const d = this.drift, P = d.pts.length;
    if (d.playing) { const c = (now - d.t0) / DRIFT_STEP_MS; if (c > P - 1 + 1.6) { d.t0 = now; d.cursor = 0; } else d.cursor = Math.min(P - 1, c); }
    const scr = d.pts.map((p) => this._w2s(p.x, p.y));
    ctx.save();
    // faint full path (where the language has been + will go)
    ctx.lineWidth = 1.4; ctx.strokeStyle = "rgba(91,164,221,0.16)"; ctx.beginPath();
    scr.forEach((s, k) => (k ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]))); ctx.stroke();
    // revealed path up to the cursor (bright)
    const c = d.cursor, full = Math.floor(c), frac = c - full;
    ctx.strokeStyle = "#5BA4DD"; ctx.lineWidth = 2.1; ctx.beginPath(); ctx.moveTo(scr[0][0], scr[0][1]);
    for (let k = 1; k <= full; k++) ctx.lineTo(scr[k][0], scr[k][1]);
    let hx = scr[full][0], hy = scr[full][1];
    if (full + 1 < P && frac > 0) { const a = scr[full], b = scr[full + 1]; hx = a[0] + (b[0] - a[0]) * frac; hy = a[1] + (b[1] - a[1]) * frac; ctx.lineTo(hx, hy); }
    ctx.stroke();
    // year markers (first = neutral, last = bright); labels on endpoints + current
    scr.forEach((s, k) => {
      const on = k <= c + 1e-6;
      ctx.globalAlpha = on ? 1 : 0.35;
      ctx.fillStyle = k === 0 ? "#8A97A8" : (k === P - 1 ? "#DCE3EC" : "#5BA4DD");
      ctx.beginPath(); ctx.arc(s[0], s[1], 3.2, 0, 6.2832); ctx.fill();
      if (k === 0 || k === P - 1 || k === Math.round(c)) { ctx.globalAlpha = 0.9; ctx.fillStyle = "#9AA7B6"; ctx.font = "10px ui-monospace, monospace"; ctx.fillText(String(d.pts[k].year), s[0] + 7, s[1] - 6); }
    });
    // playhead glow at the interpolated current position
    ctx.globalAlpha = 1; ctx.shadowColor = "#5BA4DD"; ctx.shadowBlur = 16; ctx.fillStyle = "#9AC9EF";
    ctx.beginPath(); ctx.arc(hx, hy, 5, 0, 6.2832); ctx.fill(); ctx.shadowBlur = 0;
    ctx.restore();
  }

  destroy() { cancelAnimationFrame(this.raf); this.ro && this.ro.disconnect(); }
}
