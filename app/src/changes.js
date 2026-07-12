// PHASE 4 — DISCLOSURE CHANGE / SHIFT detection. Surfaces the largest YEAR-OVER-YEAR shifts in
// disclosure LANGUAGE across the corpus, from the existing embeddings. For each company + footnote
// type, the change between consecutive available fiscal years is the cosine DISTANCE between that
// company-type's principal (longest) excerpt in each year. DESCRIPTIVE ONLY: a large shift is not a
// red flag, not suspicious, not predictive of anything (the replicated null stands). Cool/neutral;
// amber = enforcement only. Reuses existing embeddings; $0; no generation.
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const TYPE_FULL = { 0: "revenue recognition", 1: "going concern", 2: "related-party", 3: "critical audit matter", 4: "MD&A", 5: "risk factors" };
const TYPE_KEY = { 0: "revenue_recognition", 1: "going_concern", 2: "related_party", 3: "critical_audit_matter", 4: "mda", 5: "risk_factors" };
const f3 = (v) => (v == null || !isFinite(v)) ? "—" : v.toFixed(3);

let _events = null, _byCik = null, _p = null;

// build all change events once (lazy — needs embeddings.bin)
export function ensureChanges(nodes, paste) {
  return _p || (_p = (async () => {
    await paste.ensureEmbeddings();
    const raw = paste.rawEmb, dim = paste.dim, inv = paste.inv;
    if (!raw) { _events = []; _byCik = new Map(); return _events; }
    // principal (longest) excerpt per company|type|year
    const rep = new Map();
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]; if (n.pfy == null) continue;
      const k = n.cik + "|" + n.t + "|" + n.pfy; const w = n.wc || 0;
      const cur = rep.get(k); if (!cur || w > cur.w) rep.set(k, { idx: i, w });
    }
    // group principals by company|type
    const grp = new Map();
    for (const [k, v] of rep) {
      const a = k.split("|"); const gk = a[0] + "|" + a[1];
      let arr = grp.get(gk); if (!arr) { arr = []; grp.set(gk, arr); }
      arr.push({ year: +a[2], idx: v.idx });
    }
    const dot = (a, b) => { let s = 0; const oa = a * dim, ob = b * dim; for (let k = 0; k < dim; k++) s += (raw[oa + k] * inv) * (raw[ob + k] * inv); return s; };
    const events = [];
    for (const [gk, arr] of grp) {
      if (arr.length < 2) continue;
      arr.sort((x, y) => x.year - y.year);
      const t = +gk.slice(gk.indexOf("|") + 1);
      for (let j = 1; j < arr.length; j++) {
        const A = arr[j - 1], B = arr[j];
        const cos = Math.max(-1, Math.min(1, dot(A.idx, B.idx)));
        const n = nodes[B.idx];
        events.push({ cik: n.cik, name: n.name, ind: n.ind || "", sic: n.sic || "", tk: n.tk || "", e: n.e ? 1 : 0, t, yA: A.year, yB: B.year, dist: 1 - cos, idxA: A.idx, idxB: B.idx });
      }
    }
    _events = events;
    _byCik = new Map();
    for (const ev of events) { let a = _byCik.get(ev.cik); if (!a) { a = []; _byCik.set(ev.cik, a); } a.push(ev); }
    return events;
  })());
}
export const allChanges = () => _events || [];
export const changesForCik = (cik) => (_byCik ? (_byCik.get(cik) || []) : []);

// per-company "disclosure change timeline" (used in the company profile) — neutral bars, one per
// year-over-year transition, grouped by footnote type. Bars are buttons (data-tl="idxA.idxB").
export function timelineHTML(cik) {
  const evs = changesForCik(cik);
  if (!evs.length) return `<div class="caveat">No year-over-year disclosure-language change to show (needs at least two fiscal years of the same footnote type).</div>`;
  const byType = new Map();
  for (const ev of evs) { let a = byType.get(ev.t); if (!a) { a = []; byType.set(ev.t, a); } a.push(ev); }
  const maxD = Math.max(0.2, ...evs.map((e) => e.dist));
  const rows = [...byType.keys()].sort((a, b) => a - b).map((t) => {
    const list = byType.get(t).sort((a, b) => a.yA - b.yA);
    const bars = list.map((ev) => {
      const h = Math.max(6, Math.round(ev.dist / maxD * 30));
      return `<button class="pf-tl-bar" data-tl="${ev.idxA}:${ev.idxB}:${(1 - ev.dist).toFixed(4)}" type="button" title="FY${ev.yA}→FY${ev.yB} · change ${f3(ev.dist)} (cosine distance)"><span class="pf-tl-fill" style="height:${h}px"></span><span class="pf-tl-yr mono">${String(ev.yB).slice(2)}</span></button>`;
    }).join("");
    return `<div class="pf-tl-row"><span class="pf-tl-type mono">${esc(TYPE_FULL[t])}</span><div class="pf-tl-bars">${bars}</div></div>`;
  }).join("");
  return `<div class="pf-tl">${rows}</div><div class="caveat">Year-over-year change in disclosure language (cosine distance between consecutive available fiscal years' principal excerpt of each type). Bars are labeled with the later year. Descriptive only: taller means more linguistic change, never a flag or a judgment. Click a bar to read the before and after.</div>`;
}

const CSV_HEAD = ["company", "cik", "ticker", "sic_code", "sic_industry", "footnote_type", "year_from", "year_to", "change_cosine_distance", "enforced"];
const csvRow = (ev) => [ev.name, ev.cik, ev.tk, ev.sic, ev.ind, TYPE_KEY[ev.t], ev.yA, ev.yB, ev.dist.toFixed(4), ev.e ? "yes" : "no"];

const HONESTY = "Largest year-over-year change in disclosure LANGUAGE. This is a neutral, descriptive measure (cosine distance between consecutive available fiscal years' principal excerpt of each footnote type). The two years are always shown and may span a gap for sparse filers. A large shift is NOT a red flag, not suspicious, and not predictive of anything. It is a starting point for a researcher to read what changed. The replicated null stands: disclosure language does not separate SEC-enforced from matched-clean companies.";

export class Changes {
  // deps: { modal, body, setModal, engine, nodes, paste, describe, openCompare, downloadCSV }
  constructor(deps) { Object.assign(this, deps); this.body.addEventListener("click", (e) => this._onClick(e)); }

  async open() {
    this.setModal(this.modal, true); this.body.scrollTop = 0;
    this.body.innerHTML = `<div class="ch-head"><div class="ch-head-main"><div class="ch-title mono">DISCLOSURE SHIFTS</div><div class="ch-def mono">computing year-over-year change…</div></div><button class="icon-btn mono" data-cx="close" type="button" aria-label="Close">✕</button></div><div class="ch-pad"><div class="caveat">Measuring shifts from the existing embeddings…</div></div>`;
    try { await ensureChanges(this.nodes, this.paste); } catch (e) { this._error("Embeddings unavailable, so change detection was not computed."); return; }
    this._render();
  }
  close() { this.setModal(this.modal, false); }
  _error(msg) { const d = this.body.querySelector(".ch-pad"); if (d) d.innerHTML = `<div class="caveat">${esc(msg)}</div>`; }

  _render() {
    const set = new Set(this.engine.filteredIndices());
    // an event is in scope iff BOTH its endpoint excerpts pass the current filters (composes with all)
    const view = allChanges().filter((ev) => set.has(ev.idxA) && set.has(ev.idxB)).sort((a, b) => b.dist - a.dist);
    this._view = view;
    const CAP = 250;
    const shown = view.slice(0, CAP);
    const maxD = Math.max(0.2, ...(shown.length ? shown.map((e) => e.dist) : [0.2]));
    const def = this.describe ? this.describe() : "all disclosures";
    const list = shown.length ? shown.map((ev, i) => {
      const w = Math.round(ev.dist / maxD * 100);
      return `<button class="cx-ev" data-ev="${i}" type="button">
        <span class="cx-ev-rank mono">${String(i + 1).padStart(2, "0")}</span>
        <span class="cx-ev-main"><span class="cx-ev-co">${esc(ev.name)}</span><span class="cx-ev-meta mono">${esc(TYPE_FULL[ev.t])} · FY${ev.yA}→FY${ev.yB}${ev.e ? ' · <span class="amber">enforced</span>' : ""}</span></span>
        <span class="cx-ev-bar"><span class="cx-ev-fill" style="width:${w}%"></span></span>
        <span class="cx-ev-mag mono">${f3(ev.dist)}</span>
        <span class="cx-ev-open mono">open ↗</span>
      </button>`;
    }).join("") : `<div class="caveat">No year-over-year shifts in the current filter set. Widen the filters (a shift needs two consecutive fiscal years of the same company + footnote type within the selection; set the year range to bound the shifts).</div>`;
    this.body.innerHTML = `<div class="ch-head">
        <div class="ch-head-main"><div class="ch-title mono">DISCLOSURE SHIFTS</div><div class="ch-def mono">${esc(def)} · ranked by year-over-year change</div></div>
        <button class="icon-btn mono" data-cx="close" type="button" aria-label="Close">✕</button>
      </div>
      <div class="ch-pad">
        <div class="ch-actions">
          <span class="cx-count mono">${view.length.toLocaleString()} shift${view.length === 1 ? "" : "s"}${view.length > CAP ? " · showing top " + CAP : ""}</span>
          <span class="ch-spacer"></span>
          <button class="act-btn mono" data-cx="csv" type="button">↓ CSV</button>
          <button class="act-btn mono" data-cx="cite" type="button">⧉ CITE</button>
          <span class="act-toast mono" data-cx="toast" aria-live="polite"></span>
        </div>
        <div class="cx-list">${list}</div>
        <div class="caveat fin-honesty">${esc(HONESTY)}</div>
      </div>`;
  }

  _cite() {
    const date = new Date().toISOString().slice(0, 10);
    const n = (this._view || []).length;
    return `Disclosure Atlas · year-over-year disclosure-language change\n`
      + `Definition: ${this.describe ? this.describe() : "all disclosures"} · ranked by cosine distance between consecutive available fiscal years' principal excerpt per company + footnote type (the two years are shown per row and may span a gap for sparse filers).\n`
      + `${n.toLocaleString()} year-over-year shifts in the current selection.\n`
      + `Source: SEC EDGAR footnote text; embeddings (bge-small-en-v1.5) computed in the build; change measured in-browser. Retrieved ${date}.\n`
      + `Note: a descriptive measure of LINGUISTIC change only. It is not a red flag and not predictive (the disclosure-language null stands). A starting point for investigation.`;
  }
  _toast(t, m) { if (t) { t.textContent = m; clearTimeout(this._tt); this._tt = setTimeout(() => { t.textContent = ""; }, 2400); } }

  _onClick(e) {
    const close = e.target.closest('[data-cx="close"]'); if (close) return this.close();
    const csv = e.target.closest('[data-cx="csv"]');
    const cite = e.target.closest('[data-cx="cite"]');
    const toast = this.body.querySelector('[data-cx="toast"]');
    if (csv) { const rows = (this._view || []).map(csvRow); this.downloadCSV("disclosure-atlas_shifts_" + rows.length + "rows.csv", CSV_HEAD, rows); this._toast(toast, "CSV downloaded"); return; }
    if (cite) { navigator.clipboard.writeText(this._cite()).then(() => this._toast(toast, "citation copied")).catch(() => this._toast(toast, "copy failed")); return; }
    const ev = e.target.closest(".cx-ev"); if (ev) { const i = +ev.getAttribute("data-ev"); const x = (this._view || [])[i]; if (x && this.openCompare) this.openCompare(x.idxA, x.idxB, 1 - x.dist); }
  }
}
