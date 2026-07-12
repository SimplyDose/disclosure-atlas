// PHASE 5 — COMBINED DESCRIPTIVE INTERSECTION VIEW.
//
// HONESTY IS THE POINT OF THIS FEATURE. This surfaces companies that are descriptively unusual on
// MULTIPLE INDEPENDENT measures at once — purely as starting points for a HUMAN to investigate.
//   • NOT a risk score, NOT a fraud screen, NOT a ranking of suspicion, NOT a prediction.
//   • There is NO combined/composite score. Each measure is shown SEPARATELY per company.
//   • Co-occurrence of descriptive measures is descriptive context, never evidence of wrongdoing.
//   • The replicated null stands (disclosure language does not predict enforcement); the financial
//     screens are published models this dataset cannot re-validate.
//   • Results are listed ALPHABETICALLY, never ranked by any measure. Cool/neutral only; amber is
//     enforcement-context only; no alarm colors; no "suspicious / concerning / anomalous" language.
import { ensureScores, companyScores } from "./scores.js";
import { ensureChanges, changesForCik } from "./changes.js";

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const TYPE_FULL = { 0: "revenue recognition", 1: "going concern", 2: "related-party", 3: "critical audit matter", 4: "MD&A", 5: "risk factors" };
const DIST_TIER = { 0: "typical", 1: "distinctive", 2: "highly distinctive" };
const quantile = (s, p) => { if (!s.length) return null; const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
const f2 = (v) => (v == null || !isFinite(v)) ? "—" : v.toFixed(2);
const f3 = (v) => (v == null || !isFinite(v)) ? "—" : v.toFixed(3);

const CAVEAT = "Starting points for human investigation, not a verdict. This surfaces companies that are descriptively unusual on multiple INDEPENDENT measures at once. It is NOT a risk score, NOT a fraud screen, NOT a ranking of suspicion, and NOT a prediction. Each measure is shown separately. There is no combined score, and results are listed alphabetically, not ranked. The co-occurrence of descriptive measures is descriptive context, never evidence of wrongdoing. Disclosure language does not predict enforcement (a replicated null at 161k). The Beneish M-Score (1999) and Dechow F-Score (2011) are published academic screens this dataset cannot re-validate. Read each company yourself.";

const BEN = ["DSRI", "GMI", "AQI", "SGI", "DEPI", "SGAI", "LVGI", "TATA"];

export class Intersect {
  // deps: { modal, body, setModal, engine, nodes, paste, describe, openProfile, downloadCSV }
  constructor(deps) {
    Object.assign(this, deps);
    this.crit = { dist: false, distTier: 2, m: false, heavy: false, change: false, changeMin: 0.35 };
    this._companies = null; this._industry = null;
    this.body.addEventListener("click", (e) => this._onClick(e));
    this.body.addEventListener("change", (e) => this._onChange(e));
  }

  _build() {
    if (this._companies) return;
    const m = new Map();
    for (const n of this.nodes) {
      let c = m.get(n.cik);
      if (!c) { c = { cik: n.cik, name: n.name, ind: n.ind || "", sic: n.sic || "", tk: n.tk || "", e: n.e ? 1 : 0, distTier: 0, distVal: 0, mMax: null, mYear: null, mFlag: 0 }; m.set(n.cik, c); }
      if (n.dvi > c.distTier) c.distTier = n.dvi;
      if (n.dst != null && n.dst > c.distVal) c.distVal = n.dst;
      if (n.ms != null) { if (c.mMax == null || n.ms > c.mMax) { c.mMax = n.ms; c.mYear = n.pfy; } if (n.mflag === 1) c.mFlag = 1; }
    }
    this._companies = m;
    // industry enforcement context: rate per SIC industry; "enforcement-heavy" = top quartile among
    // industries with >=5 companies (descriptive industry fact, NOT a statement about any company)
    const ind = new Map();
    for (const c of m.values()) { let s = ind.get(c.ind); if (!s) { s = { total: 0, enf: 0 }; ind.set(c.ind, s); } s.total++; if (c.e) s.enf++; }
    const rates = [...ind.values()].filter((s) => s.total >= 5).map((s) => s.enf / s.total).sort((a, b) => a - b);
    const thr = rates.length ? quantile(rates, 0.75) : 1;
    for (const s of ind.values()) { s.rate = s.total ? s.enf / s.total : 0; s.heavy = s.total >= 5 && s.enf > 0 && s.rate >= thr; }
    this._industry = ind;
  }

  async open() {
    this._build();
    this.setModal(this.modal, true); this.body.scrollTop = 0;
    this._render();
  }
  close() { this.setModal(this.modal, false); }

  _checkbox(id, on, label, extra) { return `<label class="ix-crit"><input type="checkbox" data-ix="${id}"${on ? " checked" : ""}> <span>${label}</span>${extra || ""}</label>`; }

  _render() {
    const c = this.crit;
    const distSel = `<select data-ix="distTier" class="ix-sel">${[[1, "distinctive +"], [2, "highly distinctive"]].map(([v, t]) => `<option value="${v}"${c.distTier == v ? " selected" : ""}>${t}</option>`).join("")}</select>`;
    const chSel = `<select data-ix="changeMin" class="ix-sel">${[0.25, 0.35, 0.45].map((v) => `<option value="${v}"${c.changeMin == v ? " selected" : ""}>≥ ${v.toFixed(2)}</option>`).join("")}</select>`;
    const controls = `<div class="ix-controls">
      ${this._checkbox("dist", c.dist, "distinctiveness tier", " " + distSel)}
      ${this._checkbox("m", c.m, "Beneish M-Score above −1.78 (published threshold)")}
      ${this._checkbox("heavy", c.heavy, "enforcement-heavy industry (top quartile by enforcement rate)")}
      ${this._checkbox("change", c.change, "year-over-year disclosure change", " " + chSel)}
    </div>`;
    const def = this.describe ? this.describe() : "all disclosures";
    this.body.innerHTML = `<div class="ch-head">
        <div class="ch-head-main"><div class="ch-title mono">DESCRIPTIVE INTERSECTION</div><div class="ch-def mono">${esc(def)} · independent descriptive measures</div></div>
        <button class="icon-btn mono" data-ix="close" type="button" aria-label="Close">✕</button>
      </div>
      <div class="ch-pad">
        <div class="ix-caveat">${esc(CAVEAT)}</div>
        <div class="ix-crit-h mono">INTERSECT THESE INDEPENDENT MEASURES <span class="ch-rel">companies meeting ALL selected criteria · each measure shown separately</span></div>
        ${controls}
        <div class="ix-actions">
          <span class="ix-count mono" id="ixCount"></span>
          <span class="ch-spacer"></span>
          <button class="act-btn mono" data-ix="csv" type="button">↓ CSV</button>
          <button class="act-btn mono" data-ix="cite" type="button">⧉ CITE</button>
          <span class="act-toast mono" data-ix="toast" aria-live="polite"></span>
        </div>
        <div class="ix-list" id="ixList"></div>
      </div>`;
    this._renderResults();
  }

  _selected() { const c = this.crit; return c.dist || c.m || c.heavy || c.change; }

  _matches() {
    const c = this.crit;
    const pool = new Set(this.engine.filteredIndices().map((i) => this.nodes[i].cik));
    const out = [];
    for (const cik of pool) {
      const co = this._companies.get(cik); if (!co) continue;
      if (c.dist && co.distTier < +c.distTier) continue;
      if (c.m && co.mFlag !== 1) continue;
      if (c.heavy) { const s = this._industry.get(co.ind); if (!s || !s.heavy) continue; }
      let ch = null;
      if (c.change) { ch = this._maxChange(cik); if (!ch || ch.dist < +c.changeMin) continue; }
      else ch = this._maxChange(cik, true);
      out.push({ co, ch });
    }
    out.sort((a, b) => a.co.name.localeCompare(b.co.name));
    return out;
  }
  _maxChange(cik, soft) {
    // soft=true: only read if changes already computed (don't force-load embeddings)
    if (soft && !this._changesReady) return null;
    const evs = changesForCik(cik); if (!evs || !evs.length) return null;
    let best = evs[0]; for (const e of evs) if (e.dist > best.dist) best = e;
    return best;
  }

  async _onChange(e) {
    const k = e.target.getAttribute("data-ix"); if (!k) return;
    if (k === "dist" || k === "m" || k === "heavy" || k === "change") this.crit[k] = e.target.checked;
    if (k === "distTier") this.crit.distTier = +e.target.value;
    if (k === "changeMin") this.crit.changeMin = +e.target.value;
    if (this.crit.change && !this._changesReady) {
      const list = this.body.querySelector("#ixList"); if (list) list.innerHTML = `<div class="caveat">loading embeddings to measure disclosure change…</div>`;
      try { await ensureChanges(this.nodes, this.paste); this._changesReady = true; } catch (err) { /* leave unready */ }
    }
    if ((this.crit.m || true)) { try { await ensureScores(); } catch (err) { /* components optional */ } }
    this._renderResults();
  }

  _measureLine(k, v) { return `<div class="ix-m"><span class="ix-m-k mono">${k}</span><span class="ix-m-v">${v}</span></div>`; }

  _renderResults() {
    const list = this.body.querySelector("#ixList"); const cnt = this.body.querySelector("#ixCount"); if (!list) return;
    if (!this._selected()) { list.innerHTML = `<div class="caveat">Select one or more independent measures above to intersect. The view will show companies meeting all selected criteria, with each measure listed separately. There is no combined score and no ranking.</div>`; if (cnt) cnt.textContent = ""; this._view = []; return; }
    const matches = this._matches(); this._view = matches;
    const CAP = 200; const shown = matches.slice(0, CAP);
    if (cnt) cnt.textContent = matches.length.toLocaleString() + " compan" + (matches.length === 1 ? "y" : "ies") + (matches.length > CAP ? " · showing first " + CAP + " (alphabetical)" : " (alphabetical)");
    if (!matches.length) { list.innerHTML = `<div class="caveat">No companies in the current selection meet all the chosen criteria. Loosen a criterion or widen the filters.</div>`; return; }
    const c = this.crit;
    list.innerHTML = shown.map(({ co, ch }) => {
      const measures = [];
      if (c.dist) measures.push(this._measureLine("DISTINCTIVENESS", `${esc(DIST_TIER[co.distTier])} vs its SIC industry · max cosine distance ${f3(co.distVal)}`));
      if (c.m) {
        const sc = companyScores(co.cik); const yr = sc ? sc.years.find((y) => y.y === co.mYear) : null; const mc = (yr && yr.mc) || null;
        const comps = mc ? `<div class="ix-comp mono">${BEN.map((b) => `${b} ${f2(mc[b])}`).join(" · ")}</div>` : "";
        measures.push(this._measureLine("BENEISH M-SCORE", `${f2(co.mMax)} (FY${co.mYear}) · above the −1.78 published threshold${comps}`));
      }
      if (c.heavy) { const s = this._industry.get(co.ind); measures.push(this._measureLine("INDUSTRY ENFORCEMENT CONTEXT", `${esc(co.ind)} · ${s.enf} of ${s.total} companies have SEC enforcement history (${Math.round(s.rate * 100)}%)`)); }
      if (c.change && ch) measures.push(this._measureLine("DISCLOSURE CHANGE", `max year-over-year ${f3(ch.dist)} · FY${ch.yA}→FY${ch.yB} (${esc(TYPE_FULL[ch.t])})`));
      return `<div class="ix-co">
        <div class="ix-co-head"><button class="co-name-btn" data-cik="${esc(co.cik)}" type="button">${esc(co.name)}</button>${co.e ? ' <span class="ix-enf amber mono">enforcement history</span>' : ""}</div>
        <div class="ix-co-meta mono">CIK ${esc(co.cik)}${co.tk ? " · " + esc(co.tk) : ""} · SIC ${esc(co.sic)}</div>
        <div class="ix-measures">${measures.join("")}</div>
      </div>`;
    }).join("") + `<div class="caveat ix-foot">Each measure above is independent and descriptive. Their co-occurrence is context for a human to investigate, not evidence of anything. Click a company to open its full profile.</div>`;
  }

  // EXPORT: each constituent measure as a SEPARATE column. There is deliberately NO composite score.
  _csv() {
    const head = ["company", "cik", "ticker", "sic_code", "sic_industry", "enforced", "criteria_met",
      "distinctiveness_tier", "distinctiveness_max_cosine",
      "beneish_m_max", "beneish_m_year", "beneish_above_threshold", ...BEN.map((b) => "beneish_" + b.toLowerCase()),
      "industry_enforced_count", "industry_company_count", "industry_enforcement_rate",
      "max_yoy_change", "change_year_from", "change_year_to", "change_type"];
    const c = this.crit;
    const met = [c.dist ? "distinctiveness>=" + DIST_TIER[c.distTier] : null, c.m ? "beneish_above_threshold" : null, c.heavy ? "enforcement_heavy_industry" : null, c.change ? "yoy_change>=" + c.changeMin : null].filter(Boolean).join("; ");
    const rows = (this._view || []).map(({ co, ch }) => {
      const s = this._industry.get(co.ind) || { enf: "", total: "", rate: "" };
      const sc = companyScores(co.cik); const yr = sc ? sc.years.find((y) => y.y === co.mYear) : null; const mc = (yr && yr.mc) || {};
      return [co.name, co.cik, co.tk, co.sic, co.ind, co.e ? "yes" : "no", met,
        DIST_TIER[co.distTier], co.distVal != null ? co.distVal.toFixed(4) : "",
        co.mMax != null ? co.mMax : "", co.mYear != null ? co.mYear : "", co.mFlag ? "yes" : (co.mMax != null ? "no" : ""), ...BEN.map((b) => mc[b] != null ? mc[b] : ""),
        s.enf, s.total, s.rate != null && s.rate !== "" ? (s.rate).toFixed(4) : "",
        ch ? ch.dist.toFixed(4) : "", ch ? ch.yA : "", ch ? ch.yB : "", ch ? (TYPE_FULL[ch.t]) : ""];
    });
    return { head, rows };
  }

  _cite() {
    const date = new Date().toISOString().slice(0, 10);
    const c = this.crit;
    const met = [c.dist ? "distinctiveness ≥ " + DIST_TIER[c.distTier] : null, c.m ? "Beneish M above −1.78" : null, c.heavy ? "enforcement-heavy industry (top quartile)" : null, c.change ? "year-over-year disclosure change ≥ " + c.changeMin : null].filter(Boolean).join(" AND ");
    return `Disclosure Atlas · descriptive intersection\n`
      + `Filters: ${this.describe ? this.describe() : "all disclosures"}\nIntersected measures: ${met || "(none)"}\n`
      + `${(this._view || []).length.toLocaleString()} companies meet all selected criteria (listed alphabetically). Retrieved ${date}.\n`
      + `Each measure is independent and descriptive and is reported separately. There is NO composite score, NO ranking, and this is NOT a risk or fraud assessment. Co-occurrence is descriptive context for human investigation, not evidence. Disclosure language does not predict enforcement (the replicated null). The M and F scores are published academic screens this dataset cannot re-validate.`;
  }
  _toast(t, m) { if (t) { t.textContent = m; clearTimeout(this._tt); this._tt = setTimeout(() => { t.textContent = ""; }, 2400); } }

  _onClick(e) {
    const close = e.target.closest('[data-ix="close"]'); if (close) return this.close();
    const toast = this.body.querySelector('[data-ix="toast"]');
    if (e.target.closest('[data-ix="csv"]')) { const { head, rows } = this._csv(); if (!rows.length) { this._toast(toast, "nothing to export"); return; } this.downloadCSV("disclosure-atlas_intersection_" + rows.length + "rows.csv", head, rows); this._toast(toast, "CSV downloaded"); return; }
    if (e.target.closest('[data-ix="cite"]')) { navigator.clipboard.writeText(this._cite()).then(() => this._toast(toast, "citation copied")).catch(() => this._toast(toast, "copy failed")); return; }
    const co = e.target.closest(".co-name-btn"); if (co && this.openProfile) { this.openProfile(co.getAttribute("data-cik")); }
  }
}
