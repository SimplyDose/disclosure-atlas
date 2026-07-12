// CORRELATION MATRIX — the standard pre-modeling check ("how do my variables relate?") for the active
// cohort. Computed over the COMPANY-YEAR panel (buildPanel) so every variable shares one unit: disclosure
// measures are aggregated to company-year, the financial screens are already per company-year (deduped) —
// the exact rows the data table / Table 1 / panel export use. Pearson + Spearman; pairwise (default) or
// listwise deletion of missing (never zero-imputed). HONESTY: purely descriptive — correlations describe
// linear/rank association IN THIS SAMPLE, nothing causal, no judgment; cool/neutral shading by magnitude
// only (NEVER red/green good-bad, NEVER alarm colors). Reuses existing data; $0.
import { buildPanel } from "./dataset.js";
import { ensureScores, companyScores } from "./scores.js";
import { downloadText } from "./exporters.js";

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// variables (all at the company-year unit). Financial = Beneish M + its key components + Dechow F.
const VARS = [
  { key: "fog", short: "Fog", label: "Gunning Fog", group: "disc", get: (r) => r.fog },
  { key: "dst", short: "Distinct.", label: "Distinctiveness", group: "disc", get: (r) => r.dst },
  { key: "nfn", short: "Footnotes", label: "Footnotes (n)", group: "disc", get: (r) => r.n_fn },
  { key: "m", short: "M", label: "Beneish M", group: "fin", get: (r) => r.m },
  { key: "dsri", short: "DSRI", label: "M: DSRI", group: "fin", get: (r) => (r.mc || {}).DSRI },
  { key: "gmi", short: "GMI", label: "M: GMI", group: "fin", get: (r) => (r.mc || {}).GMI },
  { key: "aqi", short: "AQI", label: "M: AQI", group: "fin", get: (r) => (r.mc || {}).AQI },
  { key: "sgi", short: "SGI", label: "M: SGI", group: "fin", get: (r) => (r.mc || {}).SGI },
  { key: "tata", short: "TATA", label: "M: TATA", group: "fin", get: (r) => (r.mc || {}).TATA },
  { key: "f", short: "F", label: "Dechow F", group: "fin", get: (r) => r.f },
];
const ok = (v) => v != null && isFinite(v);

function pearson(pairs) {
  const n = pairs.length; if (n < 3) return { r: null, n };
  let sx = 0, sy = 0; for (const [x, y] of pairs) { sx += x; sy += y; }
  const mx = sx / n, my = sy / n; let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of pairs) { const dx = x - mx, dy = y - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  if (sxx === 0 || syy === 0) return { r: null, n };        // a constant has no correlation
  return { r: sxy / Math.sqrt(sxx * syy), n };
}
function ranks(arr) { // fractional ranks, ties averaged
  const idx = arr.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const out = new Array(arr.length); let i = 0;
  while (i < idx.length) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) out[idx[k][1]] = avg; i = j + 1; }
  return out;
}
function spearman(pairs) {
  if (pairs.length < 3) return { r: null, n: pairs.length };
  const rx = ranks(pairs.map((p) => p[0])), ry = ranks(pairs.map((p) => p[1]));
  return pearson(rx.map((v, i) => [v, ry[i]]));
}

const HONESTY = "Correlations are purely descriptive. They summarise the linear (Pearson) or rank (Spearman) association between measures IN THIS SAMPLE. They are not causal and not a judgment about any company, and they are sample-specific (they can change with the cohort). The Beneish M-Score (Beneish 1999) and Dechow F-Score (Dechow, Ge, Larson & Sloan 2011, Model 1) are established academic screens shown with their published limitations. This dataset cannot re-validate them (XBRL begins around 2009, most enforcement cases predate that, and enforced and clean scores do not separate in this sample). This is distinct from, and consistent with, the disclosure-language null.";

export class Corr {
  // deps: { modal, body, setModal, engine, nodes, describe, cohortLink }
  constructor(deps) { Object.assign(this, deps); this.method = "pearson"; this.deletion = "pairwise"; this.body.addEventListener("click", (e) => this._onClick(e)); }

  async open() {
    this.setModal(this.modal, true); this.body.scrollTop = 0;
    this.idxs = this.engine.filteredIndices();
    this._shell("computing correlations…");
    try { await this._ensureDeps(); this._buildRows(); this._render(); }
    catch (e) { this._shell("Could not compute correlations for this cohort."); }
  }
  close() { this.setModal(this.modal, false); }

  _cohortKeys() { const s = new Set(); for (const i of this.idxs) { const n = this.nodes[i]; if (n.pfy != null) s.add(n.cik + "|" + n.pfy); } return [...s]; }
  async _ensureDeps() {
    if (!this._allByKey) { const m = new Map(); for (let i = 0; i < this.nodes.length; i++) { const n = this.nodes[i]; if (n.pfy == null) continue; const k = n.cik + "|" + n.pfy; let a = m.get(k); if (!a) { a = []; m.set(k, a); } a.push(i); } this._allByKey = m; }
    if (!this._tickers) { try { this._tickers = await fetch("./data/tickers.json").then((r) => r.json()); } catch (e) { this._tickers = {}; } }
    await ensureScores();
  }
  _buildRows() {
    const panel = buildPanel(this._cohortKeys(), this._allByKey, this.nodes, companyScores, this._tickers);
    this.N = panel.length;
    // per-variable column of values (null preserved) over company-years
    this.cols = VARS.map((v) => panel.map((r) => { const x = v.get(r); return ok(x) ? x : null; }));
    this.varN = this.cols.map((c) => c.filter((x) => x != null).length);
    // listwise-complete rows (all variables present)
    this.listwiseIdx = [];
    for (let r = 0; r < this.N; r++) { let all = true; for (let c = 0; c < VARS.length; c++) if (this.cols[c][r] == null) { all = false; break; } if (all) this.listwiseIdx.push(r); }
  }

  _matrix() {
    const k = VARS.length, R = Array.from({ length: k }, () => new Array(k).fill(null)), Nc = Array.from({ length: k }, () => new Array(k).fill(0));
    const fn = this.method === "spearman" ? spearman : pearson;
    const rowsFor = (a, b) => {
      const out = [];
      if (this.deletion === "listwise") { for (const r of this.listwiseIdx) out.push([this.cols[a][r], this.cols[b][r]]); }
      else { for (let r = 0; r < this.N; r++) { const x = this.cols[a][r], y = this.cols[b][r]; if (x != null && y != null) out.push([x, y]); } }
      return out;
    };
    let nmin = Infinity, nmax = 0;
    for (let a = 0; a < k; a++) {
      for (let b = a; b < k; b++) {
        if (a === b) { const n = this.deletion === "listwise" ? this.listwiseIdx.length : this.varN[a]; R[a][b] = 1; Nc[a][b] = n; continue; }
        const res = fn(rowsFor(a, b)); R[a][b] = R[b][a] = res.r; Nc[a][b] = Nc[b][a] = res.n;
        if (res.n < nmin) nmin = res.n; if (res.n > nmax) nmax = res.n;
      }
    }
    this._nrange = { min: isFinite(nmin) ? nmin : 0, max: nmax };
    return { R, Nc };
  }

  _shell(msg) {
    const def = this.describe ? this.describe() : "all disclosures";
    this.body.innerHTML = `<div class="ch-head"><div class="ch-head-main"><div class="ch-title mono">CORRELATION MATRIX</div><div class="ch-def mono">${esc(def)}</div></div><button class="icon-btn mono" data-cr="close" type="button" aria-label="Close">✕</button></div><div class="ch-pad"><div class="caveat">${esc(msg)}</div></div>`;
  }

  _cell(r, n, diag) {
    if (r == null) return `<td class="cr-cell"><span class="cr-na" title="too few paired observations (N=${n})">—</span></td>`;
    const a = Math.min(1, Math.abs(r));
    const bg = diag ? "background:var(--field-raised)" : `background:rgba(91,164,221,${(a * 0.30).toFixed(3)})`;  // cool tint by MAGNITUDE only; sign is in the digits, never colour
    const txt = (r >= 0 ? "" : "−") + Math.abs(r).toFixed(2);
    return `<td class="cr-cell${diag ? " cr-diag" : ""}" style="${bg}" title="r=${r.toFixed(4)} · N=${n.toLocaleString()}">${txt}</td>`;
  }

  _render() {
    const def = this.describe ? this.describe() : "all disclosures";
    if (!this.N) {
      this.body.innerHTML = `<div class="ch-head"><div class="ch-head-main"><div class="ch-title mono">CORRELATION MATRIX</div><div class="ch-def mono">${esc(def)}</div></div><button class="icon-btn mono" data-cr="close" type="button" aria-label="Close">✕</button></div>
        <div class="ch-pad"><div class="caveat">No company-years match the current filters. Adjust the filters to define a cohort, then compute correlations.</div></div>`;
      return;
    }
    const { R, Nc } = this._matrix();
    const lw = this.listwiseIdx.length;
    const head = `<tr><th class="cr-corner mono"></th>${VARS.map((v) => `<th class="cr-vh mono" title="${esc(v.label)}">${esc(v.short)}</th>`).join("")}</tr>`;
    const body = VARS.map((v, a) => `<tr><th scope="row" class="cr-rh mono ${v.group === "fin" ? "cr-fin" : "cr-disc"}" title="${esc(v.label)}">${esc(v.label)}</th>${VARS.map((_, b) => this._cell(R[a][b], Nc[a][b], a === b)).join("")}</tr>`).join("");
    const seg = (name, val, opts) => `<span class="cr-seg">${opts.map((o) => `<button class="cr-seg-btn mono${this[name] === o.v ? " is-on" : ""}" data-cr="set-${name}" data-val="${o.v}" type="button">${o.t}</button>`).join("")}</span>`;

    this.body.innerHTML = `<div class="ch-head">
        <div class="ch-head-main"><div class="ch-title mono">CORRELATION MATRIX</div><div class="ch-def mono">${esc(def)}</div></div>
        <button class="icon-btn mono" data-cr="close" type="button" aria-label="Close">✕</button>
      </div>
      <div class="cr-pad">
        <div class="cr-bar">
          <div class="cr-meta mono">unit: <b>company-year</b> · cohort <b>${this.N.toLocaleString()}</b> company-years · ${this.deletion === "listwise" ? `listwise N = <b>${lw.toLocaleString()}</b>` : `pairwise N = <b>${this._nrange.min.toLocaleString()}-${this._nrange.max.toLocaleString()}</b>`}</div>
          <div class="cr-actions">
            ${seg("method", this.method, [{ v: "pearson", t: "PEARSON" }, { v: "spearman", t: "SPEARMAN" }])}
            ${seg("deletion", this.deletion, [{ v: "pairwise", t: "PAIRWISE" }, { v: "listwise", t: "LISTWISE" }])}
            <button class="act-btn mono" data-cr="csv" type="button">↓ CSV</button>
            ${this.cohortLink ? `<button class="act-btn mono" data-cr="share" type="button">⧉ SHARE COHORT</button>` : ""}
            <span class="act-toast mono" data-cr="toast" aria-live="polite"></span>
          </div>
        </div>
        <div class="cr-scroll"><table class="cr-table mono">${head}${body}</table></div>
        <div class="caveat cr-note">${this.method === "spearman" ? "Spearman rank" : "Pearson linear"} correlations over the company-year panel (disclosure measures aggregated to company-year; the financial screens are per distinct company-year, deduped and never footnote-duplicated). Missing data is handled by <b>${this.deletion}</b> deletion${this.deletion === "pairwise" ? ": each coefficient uses the company-years where BOTH measures are present, so N varies per cell (hover a cell for its exact N). Zeros are never imputed" : `: all coefficients use the ${lw.toLocaleString()} company-years where every measure is present`}. Shading is by |r| (magnitude) in a single neutral hue, and the sign is shown only in the number.</div>
        <div class="caveat cr-honesty">${esc(HONESTY)}</div>
      </div>`;
  }

  _csv() {
    const { R, Nc } = this._matrix();
    const date = new Date().toISOString().slice(0, 10);
    const head = ["measure", ...VARS.map((v) => v.label)];
    const lines = [];
    lines.push(`Disclosure Atlas · correlation matrix`);
    lines.push(`Cohort: ${this.describe ? this.describe() : "all disclosures"}`);
    lines.push(`Method: ${this.method} · ${this.deletion} deletion · unit = company-year · cohort N = ${this.N} company-years`);
    lines.push(`Retrieved ${date} from https://disclosure-atlas.vercel.app`);
    lines.push("");
    lines.push("Correlation coefficients");
    lines.push(head.join(","));
    VARS.forEach((v, a) => lines.push([v.label, ...VARS.map((_, b) => R[a][b] == null ? "" : R[a][b].toFixed(4))].join(",")));
    lines.push("");
    lines.push("Pairwise N (observations per coefficient)");
    lines.push(head.join(","));
    VARS.forEach((v, a) => lines.push([v.label, ...VARS.map((_, b) => Nc[a][b])].join(",")));
    downloadText(lines.join("\n"), "disclosure-atlas_correlations_" + this.method + "_" + this.deletion + ".csv", "text/csv");
    this._toast(this.body.querySelector('[data-cr="toast"]'), "CSV downloaded");
  }

  _toast(t, msg) { if (t) { t.textContent = msg; clearTimeout(this._tt); this._tt = setTimeout(() => { t.textContent = ""; }, 2400); } }

  _onClick(e) {
    const el = e.target.closest("[data-cr]"); if (!el) return;
    const act = el.getAttribute("data-cr");
    if (act === "close") return this.close();
    if (act === "csv") return this._csv();
    if (act === "share" && this.cohortLink) { const t = this.body.querySelector('[data-cr="toast"]'); navigator.clipboard.writeText(this.cohortLink("cr")).then(() => this._toast(t, "cohort link copied")).catch(() => this._toast(t, "copy failed")); return; }
    if (act === "set-method") { this.method = el.getAttribute("data-val"); return this._render(); }
    if (act === "set-deletion") { this.deletion = el.getAttribute("data-val"); return this._render(); }
  }
}
