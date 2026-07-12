// DATA TABLE — the analysis-ready Phase-3 PANEL rendered as a sortable, filterable, virtualized grid.
// It is an INTERFACE to existing data: rows == buildPanel() (the exact company-year panel the .zip
// exports), columns == PANEL_COLS, so the table is a live preview of precisely what downloads.
// HONESTY: descriptive columns only; NO composite/risk score column; sorting by M-Score sorts a
// descriptive academic screen, NOT a suspicion ranking; missing = NA (never zero); neutral styling,
// amber = enforcement context ONLY, no alarm colors. The grid must not read as a "most suspicious" board.
import { PANEL_COLS, buildPanel, buildPanelZip } from "./dataset.js";
import { ensureScores, companyScores } from "./scores.js";
import { downloadBlob } from "./exporters.js";

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const ROW_H = 30;          // px per row (fixed → virtualization math is exact)
const OVERSCAN = 8;        // extra rows above/below the viewport

// per-column display metadata keyed by PANEL_COLS name: short label, px width, alignment, group.
// (Order/defs come from PANEL_COLS so the table can never drift from the export.)
const DISPLAY = {
  cik:            { label: "CIK",            w: 92,  align: "l", group: "id" },
  ticker:         { label: "TICKER",         w: 66,  align: "l", group: "id" },
  company_name:   { label: "COMPANY",        w: 230, align: "l", group: "id" },
  sic_code:       { label: "SIC",            w: 54,  align: "l", group: "id" },
  sic_industry:   { label: "INDUSTRY",       w: 220, align: "l", group: "id" },
  gvkey:          { label: "GVKEY",          w: 84,  align: "l", group: "id" },
  cusip:          { label: "CUSIP",          w: 92,  align: "l", group: "id" },
  permno:         { label: "PERMNO",         w: 84,  align: "l", group: "id" },
  fiscal_year:    { label: "FY",             w: 52,  align: "r", group: "id" },
  filing_date:    { label: "FILED",          w: 92,  align: "l", group: "id" },
  accession:      { label: "ACCESSION",      w: 150, align: "l", group: "id" },
  n_footnotes:    { label: "N FN",           w: 52,  align: "r", group: "disc" },
  gunning_fog:    { label: "FOG",            w: 60,  align: "r", group: "disc" },
  distinctiveness:{ label: "DISTINCT.",      w: 78,  align: "r", group: "disc" },
  beneish_m:      { label: "M-SCORE",        w: 74,  align: "r", group: "fin" },
  beneish_flag:   { label: "M>−1.78",        w: 64,  align: "r", group: "fin" },
  dechow_fscore:  { label: "F-SCORE",        w: 70,  align: "r", group: "fin" },
  dechow_prob:    { label: "F PROB",         w: 76,  align: "r", group: "fin" },
  enforced:       { label: "ENFORCED",       w: 80,  align: "l", group: "ctx" },
};
// availability flags + score components — present, hidden by default, revealable via the column picker.
for (const c of PANEL_COLS) {
  if (DISPLAY[c.name]) continue;
  let label = c.name.toUpperCase();
  let group = "fin";
  if (c.name.startsWith("has_")) { label = "has " + c.name.slice(4).replace(/_/g, " "); group = "disc"; }
  else if (c.name.startsWith("beneish_")) label = c.name.slice(8).toUpperCase();
  else if (c.name.startsWith("dechow_")) label = c.name.slice(7).replace(/_/g, " ");
  DISPLAY[c.name] = { label, w: c.name.startsWith("has_") ? 132 : 88, align: c.name.startsWith("has_") ? "r" : "r", group };
}
const GROUP_LABEL = { id: "IDENTIFIERS", disc: "DISCLOSURE", fin: "FINANCIAL SCREENS", ctx: "CONTEXT" };
const DEFAULT_VISIBLE = ["cik", "ticker", "company_name", "sic_code", "fiscal_year", "filing_date",
  "n_footnotes", "gunning_fog", "distinctiveness", "beneish_m", "beneish_flag", "dechow_fscore", "enforced"];
const LS_KEY = "da_table_cols_v1";

const HONESTY = "This table is a live preview of the analysis-ready company-year panel (one row per company per fiscal year), exactly what “Download this view” exports. Every column is descriptive: there is NO composite or risk score, and no “most-suspicious” ranking. The Beneish M-Score (Beneish 1999) and Dechow F-Score (Dechow, Ge, Larson & Sloan 2011, Model 1) are published, peer-reviewed academic SCREENS shown with their known limitations. Sorting by one of them simply orders a descriptive measure, it is not a suspicion ranking. This dataset cannot re-validate the screens (XBRL begins around 2009, most enforcement predates it, and enforced and clean scores do not separate in this sample), so their basis is the literature. Enforcement history is descriptive context. Missing values are NA, never zero.";

const fmtNum = (name, v) => {
  if (v == null || v === "" || (typeof v === "number" && !isFinite(v))) return null;
  if (name === "gunning_fog" || name === "beneish_m" || name === "dechow_fscore") return (+v).toFixed(2);
  if (name === "distinctiveness") return (+v).toFixed(4);
  if (name === "dechow_prob") return (+v).toFixed(6);
  if (name.startsWith("beneish_") || name.startsWith("dechow_")) return (+v).toFixed(4);
  return String(v);
};

export class Table {
  // deps: { modal, body, setModal, engine, nodes, describe, openProfile }
  constructor(deps) {
    Object.assign(this, deps);
    this.rows = []; this.view = []; this.sortKey = "cik"; this.sortDir = 1;
    try { const s = JSON.parse(localStorage.getItem(LS_KEY)); if (Array.isArray(s) && s.length) this.visible = s.filter((n) => DISPLAY[n]); } catch (e) {}
    if (!this.visible || !this.visible.length) this.visible = DEFAULT_VISIBLE.slice();
    this.body.addEventListener("click", (e) => this._onClick(e));
  }

  async open() {
    this.setModal(this.modal, true); this.body.scrollTop = 0;
    this.idxs = this.engine.filteredIndices();
    this._shell("building panel…");
    try {
      await this._ensureDeps();
      this.rows = buildPanel(this._cohortKeys(), this._allByKey, this.nodes, companyScores, this._tickers);
      this._applySort();
      this._render();
    } catch (e) { this._shell("Could not build the panel for this cohort."); }
  }
  close() { this.setModal(this.modal, false); }

  // — panel deps (identical to the cohort export path so table == download) —
  _cohortKeys() { const s = new Set(); for (const i of this.idxs) { const n = this.nodes[i]; if (n.pfy != null) s.add(n.cik + "|" + n.pfy); } return [...s]; }
  async _ensureDeps() {
    if (!this._allByKey) {
      const m = new Map();
      for (let i = 0; i < this.nodes.length; i++) { const n = this.nodes[i]; if (n.pfy == null) continue; const k = n.cik + "|" + n.pfy; let a = m.get(k); if (!a) { a = []; m.set(k, a); } a.push(i); }
      this._allByKey = m;
    }
    if (!this._tickers) { try { this._tickers = await fetch("./data/tickers.json").then((r) => r.json()); } catch (e) { this._tickers = {}; } }
    await ensureScores();
  }

  _shell(msg) {
    const def = this.describe ? this.describe() : "all disclosures";
    this.body.innerHTML = `<div class="ch-head">
        <div class="ch-head-main"><div class="ch-title mono">DATA TABLE</div><div class="ch-def mono">${esc(def)}</div></div>
        <button class="icon-btn mono" data-dt="close" type="button" aria-label="Close">✕</button>
      </div><div class="ch-pad"><div class="caveat">${esc(msg)}</div></div>`;
  }

  // — sorting: NA always sinks to the bottom regardless of direction (NA is not a low/high value) —
  _colGet(name) { const c = PANEL_COLS.find((c) => c.name === name); return c ? c.get : () => null; }
  _applySort() {
    const get = this._colGet(this.sortKey), dir = this.sortDir;
    const col = PANEL_COLS.find((c) => c.name === this.sortKey);
    const numeric = col && (col.type === "num" || col.type === "int" || col.type === "flag");
    this.view = this.rows.slice().sort((ra, rb) => {
      let a = get(ra), b = get(rb);
      const an = a == null || a === "", bn = b == null || b === "";
      if (an && bn) return 0; if (an) return 1; if (bn) return -1;   // NA to the bottom, both directions
      if (numeric) return (a - b) * dir;
      return String(a).localeCompare(String(b)) * dir;
    });
  }

  _render() {
    const def = this.describe ? this.describe() : "all disclosures";
    const nObs = this.rows.length;
    const nCo = new Set(this.rows.map((r) => r.cik)).size;
    const nScored = this.rows.filter((r) => r.m != null).length;
    if (!nObs) {
      this.body.innerHTML = `<div class="ch-head"><div class="ch-head-main"><div class="ch-title mono">DATA TABLE</div><div class="ch-def mono">${esc(def)}</div></div><button class="icon-btn mono" data-dt="close" type="button" aria-label="Close">✕</button></div>
        <div class="ch-pad"><div class="caveat">No company-years match the current filters. Adjust the filters to define a cohort, then open the table.</div></div>`;
      return;
    }
    this.body.innerHTML = `<div class="ch-head">
        <div class="ch-head-main"><div class="ch-title mono">DATA TABLE</div><div class="ch-def mono">${esc(def)}</div></div>
        <button class="icon-btn mono" data-dt="close" type="button" aria-label="Close">✕</button>
      </div>
      <div class="dt-bar">
        <div class="dt-count mono"><b>${nObs.toLocaleString()}</b> company-years · ${nCo.toLocaleString()} companies · ${nScored.toLocaleString()} with a financial screen</div>
        <div class="dt-bar-actions">
          <button class="act-btn mono" data-dt="cols" type="button" aria-expanded="false">▦ COLUMNS</button>
          <button class="act-btn mono" data-dt="download" type="button">⤓ DOWNLOAD THIS VIEW (.zip)</button>
          ${this.openImport ? `<button class="act-btn mono" data-dt="import" type="button">⧉ COPY IMPORT CODE</button>` : ""}
          ${this.cohortLink ? `<button class="act-btn mono" data-dt="share" type="button">⧉ SHARE COHORT</button>` : ""}
          <span class="act-toast mono" data-dt="toast" aria-live="polite"></span>
        </div>
      </div>
      <div class="dt-colpick" id="dtColpick" hidden></div>
      <div class="dt-honesty caveat">${esc(HONESTY)}</div>
      <div class="dt-grid">
        <div class="dt-head-wrap"><div class="dt-head mono" id="dtHead"></div></div>
        <div class="dt-bodyscroll" id="dtBody" tabindex="0"><div class="dt-sizer" id="dtSizer"><div class="dt-rows" id="dtRows"></div></div></div>
      </div>
      <div class="dt-foot mono">All ${PANEL_COLS.length} panel columns export regardless of which are shown here · click a row to open that company's profile · descriptive measures only, no risk score</div>`;

    this._head = this.body.querySelector("#dtHead");
    this._scroll = this.body.querySelector("#dtBody");
    this._sizer = this.body.querySelector("#dtSizer");
    this._rowsEl = this.body.querySelector("#dtRows");
    this._layout();
    this._renderHead();
    this._sizer.style.height = this.view.length * ROW_H + "px";
    this._scroll.onscroll = () => this._onScroll();
    this._renderRows();
    this._renderColpick();
  }

  _layout() {
    const cols = this.visible.map((n) => DISPLAY[n].w);
    this._total = cols.reduce((a, b) => a + b, 0);
    const tmpl = cols.map((w) => w + "px").join(" ");
    this._head.style.gridTemplateColumns = tmpl;
    this._head.style.width = this._total + "px";
    this._sizer.style.width = this._total + "px";
    this._gridTmpl = tmpl;
  }

  _renderHead() {
    this._head.innerHTML = this.visible.map((name) => {
      const d = DISPLAY[name]; const on = this.sortKey === name;
      const arrow = on ? (this.sortDir > 0 ? " ▲" : " ▼") : "";
      return `<button class="dt-th dt-${d.align} mono${on ? " is-sort" : ""}" data-dt="sort" data-col="${name}" type="button" title="${esc((PANEL_COLS.find((c) => c.name === name) || {}).def || name)}">${esc(d.label)}${arrow}</button>`;
    }).join("");
  }

  _rowHTML(r) {
    const cik = esc(r.cik);
    const cells = this.visible.map((name) => {
      const d = DISPLAY[name];
      if (name === "enforced") {
        const on = !!(r.enforced);
        return `<span class="dt-td dt-l">${on ? '<span class="dt-enf mono">● enforced</span>' : '<span class="dt-na">—</span>'}</span>`;
      }
      const raw = this._colGet(name)(r);
      const col = PANEL_COLS.find((c) => c.name === name);
      let txt;
      if (raw == null || raw === "") txt = `<span class="dt-na">NA</span>`;
      else if (col && (col.type === "num")) txt = esc(fmtNum(name, raw));
      else if (col && col.type === "flag") txt = raw ? "1" : `<span class="dt-na">0</span>`;
      else txt = esc(String(raw));
      return `<span class="dt-td dt-${d.align}" title="${esc(typeof raw === "string" ? raw : "")}">${txt}</span>`;
    }).join("");
    return `<div class="dt-row" role="button" tabindex="-1" data-dt="row" data-cik="${cik}" style="grid-template-columns:${this._gridTmpl};width:${this._total}px">${cells}</div>`;
  }

  _renderRows() {
    const n = this.view.length;
    const st = this._scroll.scrollTop, h = this._scroll.clientHeight || 360;
    let start = Math.max(0, Math.floor(st / ROW_H) - OVERSCAN);
    let end = Math.min(n, Math.ceil((st + h) / ROW_H) + OVERSCAN);
    const html = [];
    for (let i = start; i < end; i++) html.push(this._rowHTML(this.view[i]));
    this._rowsEl.style.transform = `translateY(${start * ROW_H}px)`;
    this._rowsEl.innerHTML = html.join("");
    this._winStart = start; this._winEnd = end;
  }

  _onScroll() {
    // horizontal: keep the header aligned with the body; vertical: re-window if we left the buffer
    this._head.style.transform = `translateX(${-this._scroll.scrollLeft}px)`;
    const st = this._scroll.scrollTop;
    const first = Math.floor(st / ROW_H);
    if (first < this._winStart + OVERSCAN / 2 || first > this._winEnd - OVERSCAN) this._renderRows();
  }

  _renderColpick() {
    const el = this.body.querySelector("#dtColpick"); if (!el) return;
    const groups = ["id", "disc", "fin", "ctx"];
    el.innerHTML = groups.map((g) => {
      const names = PANEL_COLS.map((c) => c.name).filter((n) => DISPLAY[n].group === g);
      if (!names.length) return "";
      return `<div class="dt-cp-group"><div class="dt-cp-h mono">${GROUP_LABEL[g]}</div><div class="dt-cp-items">` +
        names.map((n) => {
          const on = this.visible.includes(n);
          return `<label class="dt-cp-item mono"><input type="checkbox" data-dt="col-toggle" data-col="${n}" ${on ? "checked" : ""}/> ${esc(DISPLAY[n].label)}</label>`;
        }).join("") + `</div></div>`;
    }).join("") + `<div class="dt-cp-actions"><button class="link-btn mono" data-dt="cols-reset" type="button">reset columns</button></div>`;
  }

  _toggleCol(name) {
    const i = this.visible.indexOf(name);
    if (i >= 0) { if (this.visible.length > 1) this.visible.splice(i, 1); }
    else {
      // insert in PANEL_COLS order so the layout stays canonical
      const order = PANEL_COLS.map((c) => c.name);
      this.visible.push(name);
      this.visible.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    }
    try { localStorage.setItem(LS_KEY, JSON.stringify(this.visible)); } catch (e) {}
    this._layout(); this._renderHead(); this._renderRows(); this._renderColpick();
  }

  async _download(t) {
    if (t) t.textContent = "building .zip…";
    try {
      await this._ensureDeps();
      const rows = buildPanel(this._cohortKeys(), this._allByKey, this.nodes, companyScores, this._tickers);
      if (!rows.length) { if (t) t.textContent = "no company-years"; return; }
      const nCompanies = new Set(rows.map((r) => r.cik)).size;
      const nScored = rows.filter((r) => r.m != null).length;
      const meta = { filterDesc: this.describe ? this.describe() : "all disclosures", nObs: rows.length, nCompanies, nScored };
      downloadBlob(buildPanelZip(rows, meta), "disclosure-atlas_panel_" + rows.length + "obs.zip");
      this._toast(t, rows.length.toLocaleString() + " obs · " + nCompanies.toLocaleString() + " companies");
    } catch (e) { if (t) t.textContent = "download failed"; }
  }

  _toast(t, msg) { if (t) { t.textContent = msg; clearTimeout(this._tt); this._tt = setTimeout(() => { t.textContent = ""; }, 2400); } }

  _onClick(e) {
    const el = e.target.closest("[data-dt]"); if (!el) return;
    const act = el.getAttribute("data-dt");
    if (act === "close") return this.close();
    if (act === "share" && this.cohortLink) {
      const t = this.body.querySelector('[data-dt="toast"]');
      navigator.clipboard.writeText(this.cohortLink("dt")).then(() => this._toast(t, "cohort link copied")).catch(() => this._toast(t, "copy failed"));
      return;
    }
    if (act === "import" && this.openImport) return this.openImport();
    if (act === "download") return void this._download(this.body.querySelector('[data-dt="toast"]'));
    if (act === "sort") {
      const col = el.getAttribute("data-col");
      if (this.sortKey === col) this.sortDir = -this.sortDir; else { this.sortKey = col; this.sortDir = 1; }
      this._applySort(); this._sizer.style.height = this.view.length * ROW_H + "px"; this._scroll.scrollTop = 0;
      this._renderHead(); this._renderRows(); return;
    }
    if (act === "cols") { const p = this.body.querySelector("#dtColpick"); const open = p.hasAttribute("hidden"); if (open) p.removeAttribute("hidden"); else p.setAttribute("hidden", ""); el.setAttribute("aria-expanded", String(open)); return; }
    if (act === "col-toggle") { return this._toggleCol(el.getAttribute("data-col")); }
    if (act === "cols-reset") { this.visible = DEFAULT_VISIBLE.slice(); try { localStorage.setItem(LS_KEY, JSON.stringify(this.visible)); } catch (e) {} this._layout(); this._renderHead(); this._renderRows(); this._renderColpick(); return; }
    if (act === "row") { const cik = el.getAttribute("data-cik"); if (cik && this.openProfile) this.openProfile(cik); return; }
  }
}
