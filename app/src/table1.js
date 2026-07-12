// TABLE 1 — DESCRIPTIVE STATISTICS. The standard "Table 1" every empirical accounting paper opens with,
// for the ACTIVE cohort (existing filters). One row per measure × {N, mean, median, SD, min, p25, p75,
// max}. Units are explicit and correct: disclosure measures are FOOTNOTE-level; footnotes-per-company is
// COMPANY-level; financial screens are COMPANY-YEAR-level (deduped — never footnote-duplicated) and read
// from scores.json (full precision + components). Missing handled correctly: N = non-missing; zeros are
// never imputed. HONESTY: purely descriptive summary statistics — no scores, no ranking, no judgment;
// the cited-screens + cannot-re-validate caveat travels with the financial measures. $0; reuses data.
import { ensureScores, scoreForYear } from "./scores.js";
import { downloadCSV } from "./exporters.js";

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const BEN = ["DSRI", "GMI", "AQI", "SGI", "DEPI", "SGAI", "LVGI", "TATA"];
const DEC = ["rsst_accruals", "ch_receivables", "ch_inventory", "soft_assets", "ch_cash_sales", "ch_roa", "issuance"];
const DEC_LABEL = { rsst_accruals: "RSST accruals", ch_receivables: "Δ receivables", ch_inventory: "Δ inventory", soft_assets: "Soft assets", ch_cash_sales: "Δ cash sales", ch_roa: "Δ ROA", issuance: "Issuance" };
const STAT_COLS = ["N", "Mean", "Median", "SD", "Min", "P25", "P75", "Max"];

const UNIT_NOTE = "Unit of observation per measure: disclosure-language measures (Gunning Fog complexity, distinctiveness) are summarised at the FOOTNOTE level, footnotes-per-company at the COMPANY level, and the financial screens (the Beneish M-Score and its 8 components, and the Dechow F-Score and its components) at the distinct COMPANY-YEAR level, deduplicated and never footnote-duplicated. N is the count of NON-MISSING observations for each measure. Missing values are excluded (zeros are never imputed).";
const HONESTY = "These are purely descriptive summary statistics: no score, no ranking, no judgment about any company. The Beneish M-Score (Beneish 1999) and Dechow F-Score (Dechow, Ge, Larson & Sloan 2011, Model 1) are established, peer-reviewed academic SCREENS shown with their published limitations. This dataset cannot re-validate them (XBRL begins around 2009, most enforcement cases predate that, and enforced and clean scores do not separate in this sample), so the basis that they carry signal is the literature. This is distinct from, and consistent with, the disclosure-language null.";

// sample (n−1) descriptive statistics with interpolated percentiles; null if empty.
function summarize(arr) {
  const a = arr.filter((x) => x != null && isFinite(x)).slice().sort((x, y) => x - y);
  const n = a.length; if (!n) return { n: 0 };
  const q = (p) => { const i = (n - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return a[lo] + (a[hi] - a[lo]) * (i - lo); };
  const mean = a.reduce((s, x) => s + x, 0) / n;
  const sd = n > 1 ? Math.sqrt(a.reduce((s, x) => s + (x - mean) * (x - mean), 0) / (n - 1)) : null;
  return { n, mean, median: q(0.5), sd, min: a[0], p25: q(0.25), p75: q(0.75), max: a[n - 1] };
}

export class Table1 {
  // deps: { modal, body, setModal, engine, nodes, describe }
  constructor(deps) { Object.assign(this, deps); this.body.addEventListener("click", (e) => this._onClick(e)); }

  async open() {
    this.setModal(this.modal, true); this.body.scrollTop = 0;
    this.idxs = this.engine.filteredIndices();
    this._shell("computing descriptive statistics…");
    try { await ensureScores(); this._compute(); this._render(); }
    catch (e) { this._shell("Could not compute descriptive statistics for this cohort."); }
  }
  close() { this.setModal(this.modal, false); }

  _shell(msg) {
    const def = this.describe ? this.describe() : "all disclosures";
    this.body.innerHTML = `<div class="ch-head"><div class="ch-head-main"><div class="ch-title mono">TABLE 1 · DESCRIPTIVE STATISTICS</div><div class="ch-def mono">${esc(def)}</div></div><button class="icon-btn mono" data-t1="close" type="button" aria-label="Close">✕</button></div><div class="ch-pad"><div class="caveat">${esc(msg)}</div></div>`;
  }

  _compute() {
    const ns = this.idxs.map((i) => this.nodes[i]);
    this.nFootnotes = ns.length;
    // disclosure — footnote level
    const fog = [], dst = [];
    const perCik = new Map();
    for (const n of ns) {
      if (n.fog != null) fog.push(n.fog);
      if (n.dst != null) dst.push(n.dst);
      perCik.set(n.cik, (perCik.get(n.cik) || 0) + 1);
    }
    this.nCompanies = perCik.size;
    const fpc = [...perCik.values()];
    // financial — distinct company-years (cik|pfy), read from scores.json (full precision + components)
    const cyKeys = new Set();
    for (const n of ns) { if (n.pfy != null) cyKeys.add(n.cik + "|" + n.pfy); }
    this.nCompanyYears = cyKeys.size;
    const M = [], F = [], comps = {}, fcomps = {};
    for (const k of BEN) comps[k] = [];
    for (const k of DEC) fcomps[k] = [];
    for (const key of cyKeys) {
      const sep = key.lastIndexOf("|"); const cik = key.slice(0, sep), fy = +key.slice(sep + 1);
      const yr = scoreForYear(cik, fy); if (!yr) continue;
      if (yr.m != null) M.push(yr.m);
      const mc = yr.mc || {}; for (const k of BEN) if (mc[k] != null && isFinite(mc[k])) comps[k].push(mc[k]);
      if (yr.f != null) F.push(yr.f);
      const fc = yr.fc || {}; for (const k of DEC) if (fc[k] != null && isFinite(fc[k])) fcomps[k].push(fc[k]);
    }
    // measure registry → drives table, CSV, and copy alike (no drift)
    this.disc = [
      { label: "Gunning Fog (complexity)", unit: "footnote", dp: 2, s: summarize(fog) },
      { label: "Distinctiveness", unit: "footnote", dp: 4, s: summarize(dst) },
      { label: "Footnotes per company", unit: "company", dp: 1, s: summarize(fpc) },
    ];
    this.fin = [
      { label: "Beneish M-Score", unit: "company-year", dp: 3, s: summarize(M) },
      ...BEN.map((k) => ({ label: "  M: " + k, unit: "company-year", dp: 3, s: summarize(comps[k]) })),
      { label: "Dechow F-Score", unit: "company-year", dp: 3, s: summarize(F) },
      ...DEC.map((k) => ({ label: "  F: " + DEC_LABEL[k], unit: "company-year", dp: 4, s: summarize(fcomps[k]) })),
    ];
  }

  _fmt(v, dp) { return (v == null || !isFinite(v)) ? "—" : v.toFixed(dp); }
  _cells(m) {
    const s = m.s;
    if (!s || !s.n) return [`<td class="t1-n">0</td>`, ...Array(7).fill(`<td><span class="t1-na">—</span></td>`)].join("");
    return `<td class="t1-n">${s.n.toLocaleString()}</td>`
      + [s.mean, s.median, s.sd, s.min, s.p25, s.p75, s.max].map((v) => `<td>${this._fmt(v, m.dp)}</td>`).join("");
  }
  _rowHTML(m) {
    const indent = m.label.startsWith("  ");
    return `<tr class="${indent ? "t1-sub" : ""}"><th scope="row" class="t1-measure mono">${esc(m.label.trim())}</th><td class="t1-unit mono">${esc(m.unit)}</td>${this._cells(m)}</tr>`;
  }
  _groupHTML(title, rows) {
    return `<tr class="t1-group"><th colspan="10" class="mono">${esc(title)}</th></tr>` + rows.map((m) => this._rowHTML(m)).join("");
  }

  _render() {
    const def = this.describe ? this.describe() : "all disclosures";
    if (!this.nFootnotes) {
      this.body.innerHTML = `<div class="ch-head"><div class="ch-head-main"><div class="ch-title mono">TABLE 1 · DESCRIPTIVE STATISTICS</div><div class="ch-def mono">${esc(def)}</div></div><button class="icon-btn mono" data-t1="close" type="button" aria-label="Close">✕</button></div>
        <div class="ch-pad"><div class="caveat">No observations match the current filters. Adjust the filters to define a cohort, then generate Table 1.</div></div>`;
      return;
    }
    const head = `<thead><tr><th class="t1-measure mono">Measure</th><th class="t1-unit mono">Unit</th>${STAT_COLS.map((c) => `<th class="mono">${c}</th>`).join("")}</tr></thead>`;
    this.body.innerHTML = `<div class="ch-head">
        <div class="ch-head-main"><div class="ch-title mono">TABLE 1 · DESCRIPTIVE STATISTICS</div><div class="ch-def mono">${esc(def)}</div></div>
        <button class="icon-btn mono" data-t1="close" type="button" aria-label="Close">✕</button>
      </div>
      <div class="t1-pad">
        <div class="t1-bar">
          <div class="t1-meta mono">N = <b>${this.nFootnotes.toLocaleString()}</b> footnotes · <b>${this.nCompanyYears.toLocaleString()}</b> company-years · <b>${this.nCompanies.toLocaleString()}</b> companies</div>
          <div class="t1-actions">
            <button class="act-btn mono" data-t1="csv" type="button">↓ CSV</button>
            <button class="act-btn mono" data-t1="copy" type="button">⧉ COPY (for paper)</button>
            ${this.cohortLink ? `<button class="act-btn mono" data-t1="share" type="button">⧉ SHARE COHORT</button>` : ""}
            <span class="act-toast mono" data-t1="toast" aria-live="polite"></span>
          </div>
        </div>
        <div class="t1-scroll">
          <table class="t1-table mono">
            ${head}
            <tbody>
              ${this._groupHTML("DISCLOSURE MEASURES", this.disc)}
              ${this._groupHTML("FINANCIAL-QUALITY MEASURES · academic screens (Beneish 1999; Dechow et al. 2011)", this.fin)}
            </tbody>
          </table>
        </div>
        <div class="caveat t1-note">${esc(UNIT_NOTE)}</div>
        <div class="caveat t1-honesty">${esc(HONESTY)}</div>
      </div>`;
  }

  // ── exports (CSV + a clean copy-pasteable table) — same registry, so they match the rendered table ──
  _rows() {
    const out = [];
    const push = (m) => { const s = m.s || { n: 0 }; const f = (v) => (s.n && v != null && isFinite(v)) ? +v.toFixed(m.dp) : ""; out.push([m.label.trim(), m.unit, s.n || 0, f(s.mean), f(s.median), f(s.sd), f(s.min), f(s.p25), f(s.p75), f(s.max)]); };
    this.disc.forEach(push); this.fin.forEach(push);
    return out;
  }
  _headers() { return ["measure", "unit", "n", "mean", "median", "sd", "min", "p25", "p75", "max"]; }

  _csv(t) {
    downloadCSV("disclosure-atlas_table1_descriptives.csv", this._headers(), this._rows());
    this._toast(t, "CSV downloaded");
  }

  // copy-pasteable: a titled, tab-separated table (drops cleanly into Excel / Word / Sheets) + the
  // cohort definition, N, unit note and the descriptive/cited-screens caveat, so context travels with it.
  _copyText() {
    const def = this.describe ? this.describe() : "all disclosures";
    const date = new Date().toISOString().slice(0, 10);
    const cols = ["Measure", "Unit", ...STAT_COLS];
    const lines = [cols.join("\t")];
    const add = (m) => { const s = m.s || { n: 0 }; const f = (v) => (s.n && v != null && isFinite(v)) ? v.toFixed(m.dp) : ""; lines.push([m.label.trim(), m.unit, s.n ? s.n : 0, f(s.mean), f(s.median), f(s.sd), f(s.min), f(s.p25), f(s.p75), f(s.max)].join("\t")); };
    lines.push("Disclosure measures"); this.disc.forEach(add);
    lines.push("Financial-quality measures (Beneish 1999; Dechow et al. 2011)"); this.fin.forEach(add);
    return `Table 1. Descriptive statistics\nCohort: ${def}\nN = ${this.nFootnotes.toLocaleString()} footnotes; ${this.nCompanyYears.toLocaleString()} company-years; ${this.nCompanies.toLocaleString()} companies. Retrieved ${date} from Disclosure Atlas (https://disclosure-atlas.vercel.app).\n\n`
      + lines.join("\n")
      + `\n\nNote. ${UNIT_NOTE} ${HONESTY}`;
  }

  _toast(t, msg) { if (t) { t.textContent = msg; clearTimeout(this._tt); this._tt = setTimeout(() => { t.textContent = ""; }, 2400); } }

  _onClick(e) {
    const el = e.target.closest("[data-t1]"); if (!el) return;
    const act = el.getAttribute("data-t1"); const toast = this.body.querySelector('[data-t1="toast"]');
    if (act === "close") return this.close();
    if (act === "share" && this.cohortLink) { navigator.clipboard.writeText(this.cohortLink("t1")).then(() => this._toast(toast, "cohort link copied")).catch(() => this._toast(toast, "copy failed")); return; }
    if (act === "csv") return this._csv(toast);
    if (act === "copy") { navigator.clipboard.writeText(this._copyText()).then(() => this._toast(toast, "copied (tab-separated)")).catch(() => this._toast(toast, "copy failed")); return; }
  }
}
