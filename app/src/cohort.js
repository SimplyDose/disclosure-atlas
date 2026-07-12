// COHORT / BATCH ANALYSIS — group-level research over the CURRENT filter set (the cohort definition).
// Computes AGGREGATE statistics across both pillars in-browser from existing data. Descriptive /
// comparative / aggregate ONLY — statistics describe the group, never judge an individual company;
// no "our risk score", no ranking by implied concern, no alarm colors (amber = enforcement only).
import { buildPanel, buildPanelZip } from "./dataset.js";
import { ensureScores, companyScores } from "./scores.js";
import { downloadBlob } from "./exporters.js";

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function stats(arr) {
  const a = arr.filter((x) => x != null && isFinite(x)).slice().sort((x, y) => x - y);
  const n = a.length; if (!n) return null;
  const q = (p) => { const i = (n - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return a[lo] + (a[hi] - a[lo]) * (i - lo); };
  return { n, min: a[0], max: a[n - 1], median: q(0.5), q25: q(0.25), q75: q(0.75) };
}
function histo(arr, lo, hi, bins) {
  const a = arr.filter((x) => x != null && isFinite(x));
  const w = (hi - lo) / bins, out = Array.from({ length: bins }, (_, i) => ({ lo: lo + i * w, hi: lo + (i + 1) * w, c: 0 }));
  for (const x of a) { let b = Math.floor((x - lo) / w); if (b < 0) b = 0; if (b >= bins) b = bins - 1; out[b].c++; }
  return out;
}
function histoHTML(bins, fmt) {
  const max = Math.max(1, ...bins.map((b) => b.c));
  return `<div class="ch-histo">` + bins.map((b) => `<div class="ch-bar-row">
    <span class="ch-bar-lab mono">${fmt(b.lo)}</span>
    <span class="ch-bar-track"><span class="ch-bar-fill" style="width:${Math.round(100 * b.c / max)}%"></span></span>
    <span class="ch-bar-c mono">${b.c.toLocaleString()}</span></div>`).join("") + `</div>`;
}
const f2 = (v) => (v == null || !isFinite(v)) ? "—" : v.toFixed(2);
const f3 = (v) => (v == null || !isFinite(v)) ? "—" : v.toFixed(3);

const HONESTY = "Aggregate statistics describe this cohort as a group. They never judge an individual company. The Beneish M-Score (Beneish 1999) and Dechow F-Score (Dechow, Ge, Larson & Sloan 2011, Model 1) are established, peer-reviewed academic screens shown with their published limitations. This dataset cannot re-validate them (XBRL begins around 2009, most enforcement cases predate that, and enforced and clean scores do not separate in this sample), so the basis that they carry signal is the literature. This is distinct from, and consistent with, the disclosure-language null.";

export class Cohort {
  // deps: { modal, body, setModal, engine, paste, nodes, getRows, headers, exporters:{downloadCSV,downloadXLSX}, describe }
  constructor(deps) { Object.assign(this, deps); this._baseline = null; this.body.addEventListener("click", (e) => this._onClick(e)); }

  open() {
    this.idxs = this.engine.filteredIndices();
    this._render();
    this.setModal(this.modal, true); this.body.scrollTop = 0;
    // the embedding-clustering stat needs embeddings.bin (lazy) — fill it in progressively
    this._fillClustering();
  }
  close() { this.setModal(this.modal, false); }

  _render() {
    const idxs = this.idxs, ns = idxs.map((i) => this.nodes[i]);
    if (!ns.length) {
      this.body.innerHTML = `<div class="ch-head"><div class="ch-title mono">COHORT ANALYSIS</div><button class="icon-btn mono" data-ch="close" type="button" aria-label="Close">✕</button></div>
        <div class="modal-pad"><div class="caveat">No companies match the current filters. Adjust the filters to define a cohort, then analyze.</div></div>`;
      return;
    }
    const ciks = new Set(ns.map((n) => n.cik));
    const types = new Set(ns.map((n) => n.t));
    const yrs = ns.map((n) => +n.fd).filter(Boolean);
    // reduce (not Math.min(...yrs)) — at full-corpus scale yrs has 100k+ entries and the spread
    // would blow the call stack (RangeError). reduce is O(n) and stack-safe at any size.
    const yrange = yrs.length ? yrs.reduce((m, v) => v < m ? v : m, Infinity) + "-" + yrs.reduce((m, v) => v > m ? v : m, -Infinity) : "—";

    // disclosure: complexity (Fog) + distinctiveness over footnotes
    const fog = ns.map((n) => n.fog), dst = ns.map((n) => n.dst);
    const sF = stats(fog), sD = stats(dst);
    const cmpTier = { below: 0, near: 0, above: 0 };
    for (const n of ns) { if (n.cmp === -1) cmpTier.below++; else if (n.cmp === 1) cmpTier.above++; else if (n.cmp === 0) cmpTier.near++; }
    const dviTier = { typical: 0, distinctive: 0, highly: 0 };
    for (const n of ns) { if (n.dvi === 0) dviTier.typical++; else if (n.dvi === 1) dviTier.distinctive++; else if (n.dvi === 2) dviTier.highly++; }

    // financial: dedupe to distinct company-years (scores are per company-year, not per footnote)
    const seen = new Set(), mArr = [], fArr = []; let mFlag = 0, fHigh = 0;
    for (const n of ns) {
      if (n.ms == null && n.fs == null) continue;
      const key = n.cik + "|" + n.pfy; if (seen.has(key)) continue; seen.add(key);
      if (n.ms != null) { mArr.push(n.ms); if (n.mflag === 1) mFlag++; }
      if (n.fs != null) { fArr.push(n.fs); if (n.fs > 1) fHigh++; }
    }
    const sM = stats(mArr), sFs = stats(fArr);

    const summary = `<div class="ch-summary">
      ${this._kpi(ns.length.toLocaleString(), "footnotes")}
      ${this._kpi(ciks.size.toLocaleString(), "companies")}
      ${this._kpi(types.size, "footnote types")}
      ${this._kpi(yrange, "filing years")}
    </div>`;

    const disc = `<div class="ch-pillar">
      <div class="ch-pillar-h mono">DISCLOSURE PILLAR</div>
      <div class="ch-stat-h mono">COMPLEXITY · GUNNING FOG <span class="ch-rel">across ${sF ? sF.n.toLocaleString() : 0} footnotes</span></div>
      ${sF ? `<div class="ch-stat mono">median <b>${f2(sF.median)}</b> · IQR ${f2(sF.q25)}-${f2(sF.q75)} · range ${f2(sF.min)}-${f2(sF.max)}</div>
      ${histoHTML(histo(fog, Math.min(sF.min, 6), Math.max(sF.max, 24), 9), (v) => v.toFixed(0))}
      <div class="ch-tier mono">vs SIC industry: below ${cmpTier.below.toLocaleString()} · near ${cmpTier.near.toLocaleString()} · above ${cmpTier.above.toLocaleString()}</div>` : `<div class="caveat">No complexity data.</div>`}
      <div class="ch-stat-h mono" style="margin-top:14px">DISTINCTIVENESS · vs SIC INDUSTRY <span class="ch-rel">cosine distance from peer centroid</span></div>
      ${sD ? `<div class="ch-stat mono">median <b>${f3(sD.median)}</b> · IQR ${f3(sD.q25)}-${f3(sD.q75)} · range ${f3(sD.min)}-${f3(sD.max)}</div>
      <div class="ch-tier mono">typical ${dviTier.typical.toLocaleString()} · distinctive ${dviTier.distinctive.toLocaleString()} · highly distinctive ${dviTier.highly.toLocaleString()}</div>` : ""}
      <div class="ch-stat-h mono" style="margin-top:14px">EMBEDDING CLUSTERING <span class="ch-rel">mean intra-cohort similarity vs population</span></div>
      <div class="ch-cluster" id="chCluster"><span class="ch-stat mono">computing…</span></div>
      <div class="caveat">Complexity &amp; distinctiveness are descriptive measures vs same-industry peers; clustering is the mean pairwise cosine of cohort members' embeddings vs the all-population baseline. Descriptive group statistics, not judgments.</div>
    </div>`;

    const fin = `<div class="ch-pillar">
      <div class="ch-pillar-h mono">FINANCIAL-QUALITY PILLAR</div>
      ${(sM || sFs) ? `
      <div class="ch-stat-h mono">BENEISH M-SCORE <span class="ch-rel">across ${sM ? sM.n.toLocaleString() : 0} company-years</span></div>
      ${sM ? `<div class="ch-stat mono">median <b>${f2(sM.median)}</b> · IQR ${f2(sM.q25)}-${f2(sM.q75)} · range ${f2(sM.min)}-${f2(sM.max)}</div>
      <div class="ch-tier mono">above the −1.78 threshold: <b>${mFlag.toLocaleString()}</b> / ${sM.n.toLocaleString()} (${(100 * mFlag / sM.n).toFixed(1)}%)</div>
      ${histoHTML(histo(mArr, Math.max(-6, sM.min), Math.min(6, sM.max), 9), (v) => v.toFixed(1))}` : `<div class="caveat">No M-Scores in this cohort.</div>`}
      <div class="ch-stat-h mono" style="margin-top:14px">DECHOW F-SCORE <span class="ch-rel">across ${sFs ? sFs.n.toLocaleString() : 0} company-years</span></div>
      ${sFs ? `<div class="ch-stat mono">median <b>${f2(sFs.median)}</b> · IQR ${f2(sFs.q25)}-${f2(sFs.q75)} · range ${f2(sFs.min)}-${f2(sFs.max)}</div>
      <div class="ch-tier mono">above the unconditional rate (F&gt;1): <b>${fHigh.toLocaleString()}</b> / ${sFs.n.toLocaleString()} (${(100 * fHigh / sFs.n).toFixed(1)}%)</div>
      ${histoHTML(histo(fArr, 0, Math.min(5, Math.max(2, sFs.max)), 9), (v) => v.toFixed(1))}` : `<div class="caveat">No F-Scores in this cohort.</div>`}
      ` : `<div class="caveat">No financial-quality scores for this cohort (e.g. pre-XBRL filers, or financial-sector firms without COGS / unclassified balance sheets). No score is shown rather than a fabricated one.</div>`}
      <div class="caveat fin-honesty">${esc(HONESTY)}</div>
    </div>`;

    // distinct company-years in the cohort (the research-panel unit of observation)
    const cyKeys = new Set(); for (const n of ns) { if (n.pfy != null) cyKeys.add(n.cik + "|" + n.pfy); }

    const def = this.describe ? this.describe() : "all disclosures";
    this.body.innerHTML = `<div class="ch-head">
        <div class="ch-head-main"><div class="ch-title mono">COHORT ANALYSIS</div><div class="ch-def mono">${esc(def)}</div></div>
        <button class="icon-btn mono" data-ch="close" type="button" aria-label="Close">✕</button>
      </div>
      <div class="ch-pad">
        ${summary}
        <div class="ch-actions">
          <button class="act-btn mono" data-ch="csv" type="button">↓ CSV</button>
          <button class="act-btn mono" data-ch="xlsx" type="button">↓ XLSX</button>
          <button class="act-btn mono" data-ch="cite" type="button">⧉ CITE COHORT</button>
          <span class="act-toast mono" data-ch="toast" aria-live="polite"></span>
        </div>
        <div class="ch-grid">${disc}${fin}</div>
        <div class="ch-panelx">
          <div class="ch-stat-h mono">RESEARCH PANEL EXPORT <span class="ch-rel">company-year · Stata + R + codebook</span></div>
          <p class="ch-px-note">An analysis-ready <b>company-year panel</b> for this cohort (~${cyKeys.size.toLocaleString()} observations): disclosure measures + financial screens joined per company per fiscal year, with identifiers (CIK, ticker, SIC), <b>point-in-time filing dates</b> for look-ahead control, and missing-as-NA (never zero). Bundled with a data dictionary, ready-to-run <b>Stata</b> + <b>R</b> import snippets, a citation, and a sample-selection note.</p>
          <div class="ch-actions">
            <button class="act-btn mono" data-ch="panel" type="button">⤓ PANEL DATASET (.zip)</button>
            ${this.openImport ? `<button class="act-btn mono" data-ch="import" type="button">⧉ COPY IMPORT CODE</button>` : ""}
            <span class="act-toast mono" data-ch="ptoast" aria-live="polite"></span>
          </div>
          <p class="ch-px-note ch-px-sub">Joins straight to Compustat/CRSP/WRDS on <b>CIK</b>. Every resolvable identifier is a clean column, and licensed IDs (GVKEY/CUSIP/PERMNO) are honest-empty with a documented CIK→ID recipe (never fabricated). “Copy import code” gives ready-to-run <b>Stata · R · Python</b> loaders for this exact file.</p>
        </div>
      </div>`;
  }

  // distinct company-year keys ("cik|fy") in the current cohort = the panel's units of observation
  _cohortKeys() { const s = new Set(); for (const i of this.idxs) { const n = this.nodes[i]; if (n.pfy != null) s.add(n.cik + "|" + n.pfy); } return [...s]; }

  async _ensurePanelDeps() {
    if (!this._allByKey) {
      const m = new Map();
      for (let i = 0; i < this.nodes.length; i++) { const n = this.nodes[i]; if (n.pfy == null) continue; const k = n.cik + "|" + n.pfy; let a = m.get(k); if (!a) { a = []; m.set(k, a); } a.push(i); }
      this._allByKey = m;
    }
    if (!this._tickers) { try { this._tickers = await fetch("./data/tickers.json").then((r) => r.json()); } catch (e) { this._tickers = {}; } }
    await ensureScores();
  }

  async _exportPanel(t) {
    if (t) t.textContent = "building panel…";
    try {
      await this._ensurePanelDeps();
      const rows = buildPanel(this._cohortKeys(), this._allByKey, this.nodes, companyScores, this._tickers);
      if (!rows.length) { if (t) t.textContent = "no company-years"; return; }
      const nCompanies = new Set(rows.map((r) => r.cik)).size;
      const nScored = rows.filter((r) => r.m != null).length;
      const meta = { filterDesc: this.describe ? this.describe() : "all disclosures", nObs: rows.length, nCompanies, nScored };
      downloadBlob(buildPanelZip(rows, meta), "disclosure-atlas_panel_" + rows.length + "obs.zip");
      this._toast(t, rows.length.toLocaleString() + " obs · " + nCompanies.toLocaleString() + " companies");
    } catch (e) { if (t) t.textContent = "export failed"; }
  }

  _kpi(v, k) { return `<div class="ch-kpi"><div class="ch-kpi-v mono">${esc(String(v))}</div><div class="ch-kpi-k mono">${esc(k)}</div></div>`; }

  // mean pairwise cosine of a set of members, computed in O(N·dim) from the int8 buffer:
  //   Σ_{i≠j} u_i·u_j = ‖Σ u_i‖² − Σ‖u_i‖²  ;  mean = that / (n²−n)
  _meanPairwise(idxs, raw, dim, inv) {
    if (idxs.length < 2) return null;
    const S = new Float64Array(dim); let diag = 0;
    for (const i of idxs) { const off = i * dim; for (let k = 0; k < dim; k++) { const v = raw[off + k] * inv; S[k] += v; diag += v * v; } }
    let ss = 0; for (let k = 0; k < dim; k++) ss += S[k] * S[k];
    const n = idxs.length;
    return (ss - diag) / (n * n - n);
  }

  async _fillClustering() {
    const el0 = this.body.querySelector("#chCluster"); if (!el0) return;
    try { await this.paste.ensureEmbeddings(); } catch (e) { const el = this.body.querySelector("#chCluster"); if (el) el.innerHTML = `<span class="caveat">Embeddings unavailable, so clustering was not computed.</span>`; return; }
    const raw = this.paste.rawEmb, dim = this.paste.dim, inv = this.paste.inv;
    if (!raw) return;
    if (this._baseline == null) {
      const all = Array.from({ length: this.nodes.length }, (_, i) => i);
      this._baseline = this._meanPairwise(all, raw, dim, inv);
    }
    const coh = this._meanPairwise(this.idxs, raw, dim, inv);
    const el = this.body.querySelector("#chCluster"); if (!el) return;
    if (coh == null) { el.innerHTML = `<span class="ch-stat mono">cohort too small to compute</span>`; return; }
    const d = coh - this._baseline;
    const rel = d > 0.01 ? "more tightly clustered than" : d < -0.01 ? "more dispersed than" : "about as clustered as";
    el.innerHTML = `<span class="ch-stat mono">cohort mean cosine <b>${f3(coh)}</b> vs population <b>${f3(this._baseline)}</b> · this cohort is <b>${rel}</b> the overall population</span>`;
  }

  _cite() {
    const ns = this.idxs.map((i) => this.nodes[i]);
    const ciks = new Set(ns.map((n) => n.cik));
    const date = new Date().toISOString().slice(0, 10);
    return `Disclosure Atlas · cohort analysis\nCohort definition: ${this.describe ? this.describe() : "all disclosures"}\n`
      + `Members: ${ns.length.toLocaleString()} footnotes across ${ciks.size.toLocaleString()} companies.\n`
      + `Source: SEC EDGAR (footnote text + structured XBRL); measures computed in-browser from the shipped dataset.\nRetrieved ${date}.\n`
      + `Note: aggregate, descriptive statistics about the group, not a judgment about any company. The M and F scores are published academic screens shown with their limitations (this dataset cannot re-validate them, so their basis is the literature).`;
  }

  _toast(t, msg) { if (t) { t.textContent = msg; clearTimeout(this._tt); this._tt = setTimeout(() => { t.textContent = ""; }, 2400); } }

  _onClick(e) {
    const el = e.target.closest("[data-ch]"); if (!el) return;
    const act = el.getAttribute("data-ch"); const toast = this.body.querySelector('[data-ch="toast"]');
    if (act === "close") return this.close();
    if (act === "import" && this.openImport) return this.openImport();
    if (act === "panel") return void this._exportPanel(this.body.querySelector('[data-ch="ptoast"]'));
    if (act === "cite") { navigator.clipboard.writeText(this._cite()).then(() => this._toast(toast, "cohort citation copied")).catch(() => this._toast(toast, "copy failed")); return; }
    if (act === "csv" || act === "xlsx") {
      if (toast) toast.textContent = "building…";
      this.getRows().then((b) => {
        if (!b) { if (toast) toast.textContent = "empty cohort"; return; }
        const base = "disclosure-atlas_cohort_" + b.rows.length + "rows";
        if (act === "xlsx") return this.exporters.downloadXLSX(base + ".xlsx", "cohort", this.headers, b.rows).then(() => { if (toast) toast.textContent = ""; });
        this.exporters.downloadCSV(base + ".csv", this.headers, b.rows); if (toast) toast.textContent = "";
      }).catch(() => { if (toast) toast.textContent = "export failed"; });
    }
  }
}
