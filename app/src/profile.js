// COMPANY PROFILE — one unified, composed view of everything the instrument knows about a single
// company: its disclosure pillar (all footnotes across 6 types/years + complexity/distinctiveness +
// nearest cross-company neighbors) and its financial pillar (Beneish M / Dechow F history with
// component breakdowns on demand). Descriptive/comparative only — academic screens, never "our
// risk score", no guilt-implying treatment. Reuses existing computed data; no new ingestion.
import { ensureScores, companyScores, yearTilesHTML, scoreCells, SCORE_HEADERS, M_THRESHOLD } from "./scores.js";
import { ensureChanges, timelineHTML } from "./changes.js";

const TYPE_FULL = { 0: "Revenue recognition", 1: "Going concern", 2: "Related-party transactions", 3: "Critical audit matter", 4: "MD&A", 5: "Risk factors" };
const TYPE_TAG = { 0: "REV-REC", 1: "GOING CONCERN", 2: "RELATED-PARTY", 3: "CAM", 4: "MD&A", 5: "RISK FACTORS" };
const CMP_SHORT = { "-1": "below", "0": "near", "1": "above" };
const DVI_SHORT = { "0": "typical", "1": "distinctive", "2": "highly distinctive" };
const PROFILE_HEADERS = ["company", "cik", "ticker", "footnote_type", "filing_year", "enforced", "accession", "edgar_url",
  "gunning_fog", "avg_sentence_length", "word_count", "complex_word_pct", "complexity_vs_industry",
  "distinctiveness", "distinctiveness_vs_industry", ...SCORE_HEADERS];
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const edgarCompany = (cik) => "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=" + cik + "&type=10-K";
const MIN_PEERS = 5;   // below this, no peer comparison is shown (too few same-industry companies)
function median(a) { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
function quantile(s, p) { if (!s.length) return null; const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); }
function pctileOf(v, a) { if (!a.length) return null; let c = 0; for (const x of a) if (x < v) c++; return c / a.length; }
function ord(n) { const v = n % 100, s = ["th", "st", "nd", "rd"]; return n + (s[(v - 20) % 10] || s[v] || s[0]); }   // 1st/2nd/3rd/4th…

export class Profile {
  // deps: { modal, body, setModal, nodes, neighbors, aaer, onOpenFinding(idx), setHash, exporters:{downloadCSV,downloadXLSX,downloadText} }
  constructor(deps) {
    Object.assign(this, deps);
    this.byCik = new Map();
    this.cikInd = new Map();   // cik -> SIC-industry label (for peer benchmarking)
    for (const n of this.nodes) {
      const a = this.byCik.get(n.cik) || []; a.push(n.i); this.byCik.set(n.cik, a);
      if (n.ind && !this.cikInd.has(n.cik)) this.cikInd.set(n.cik, n.ind);
    }
    this.cik = null; this.selYear = null;
    this.body.addEventListener("click", (e) => this._onClick(e));
  }

  open(cik) {
    if (!this.byCik.has(cik)) return false;
    ensureScores().then(() => { this.cik = cik; this.selYear = null; this._render(); this.setModal(this.modal, true); this.body.scrollTop = 0; this.setHash("c=" + cik); });
    return true;
  }
  close() { this.setModal(this.modal, false); this.setHash(""); }

  _company() {
    const idxs = this.byCik.get(this.cik) || [];
    const ns = idxs.map((i) => this.nodes[i]);
    const ref = ns[0] || {};
    return { ns, name: ref.name || "", sic: ref.sic || "", ind: ref.ind || "", enforced: ns.some((n) => n.e) };
  }
  _aaer(cik) { return this.aaer[cik] || this.aaer[String(parseInt(cik, 10)).padStart(10, "0")] || []; }

  _neighbors(ns) {
    const best = new Map(); // otherCik -> {score, idx}
    for (const n of ns) {
      const nb = this.neighbors[n.i] || [];
      for (const [idx, sc] of nb) {
        const o = this.nodes[idx]; if (!o || o.cik === this.cik) continue;
        const cur = best.get(o.cik);
        if (!cur || sc > cur.score) best.set(o.cik, { score: sc, idx });
      }
    }
    return [...best.entries()].map(([cik, v]) => ({ cik, score: v.score, node: this.nodes[v.idx] }))
      .sort((a, b) => b.score - a.score).slice(0, 8);
  }

  // ---- peer benchmarking: this company vs its SIC-industry peers (both pillars) ----
  _companyRep(idxs) {
    const fog = [], dst = [];
    for (const i of idxs) { const n = this.nodes[i]; if (n.fog != null) fog.push(n.fog); if (n.dst != null) dst.push(n.dst); }
    return { fog: median(fog), dst: median(dst) };
  }
  _scoreRep(cik) {
    const c = companyScores(cik); if (!c) return { m: null, f: null };
    const m = [], f = []; for (const y of c.years) { if (y.m != null) m.push(y.m); if (y.f != null) f.push(y.f); }
    return { m: m.length ? median(m) : null, f: f.length ? median(f) : null };
  }
  _cmpRow(label, val, arr, dp, hi, lo, isScore) {
    if (arr.length < MIN_PEERS) return "";
    const s = arr.slice().sort((a, b) => a - b);
    const med = quantile(s, 0.5), d10 = quantile(s, 0.1), d90 = quantile(s, 0.9), q1 = quantile(s, 0.25), q3 = quantile(s, 0.75);
    if (val == null) {
      return `<div class="pf-cmp"><div class="pf-cmp-top"><span class="pf-cmp-label mono">${esc(label)}</span><span class="pf-cmp-num mono"><b class="pf-na">no score</b> · ind. median ${med.toFixed(dp)}</span></div><div class="pf-cmp-phrase">No ${isScore ? "score" : "value"} for this company; the industry median is shown for context.</div></div>`;
    }
    const p = pctileOf(val, s);
    const span = (d90 - d10) || 1, pos = (v) => Math.max(0, Math.min(100, (v - d10) / span * 100));
    const phrase = p >= 0.85 ? ("well " + hi + " its industry's median") : p > 0.60 ? (hi + " its industry's median") : p >= 0.40 ? "typical for its industry" : p > 0.15 ? (lo + " its industry's median") : ("well " + lo + " its industry's median");
    return `<div class="pf-cmp">
      <div class="pf-cmp-top"><span class="pf-cmp-label mono">${esc(label)}</span><span class="pf-cmp-num mono"><b>${val.toFixed(dp)}</b> · ind. median ${med.toFixed(dp)}</span></div>
      <div class="pf-bar" role="img" aria-label="${esc(label)} ${val.toFixed(dp)} versus industry median ${med.toFixed(dp)}">
        <span class="pf-bar-band" style="left:${q1 != null ? pos(q1) : 0}%;width:${Math.max(1, pos(q3) - pos(q1))}%"></span>
        <span class="pf-bar-med" style="left:${pos(med)}%"></span>
        <span class="pf-bar-dot" style="left:${pos(val)}%"></span>
      </div>
      <div class="pf-cmp-phrase">${phrase} · ~${ord(Math.round(p * 100))} percentile of ${s.length} peers</div>
    </div>`;
  }
  _peerHTML(ind) {
    if (!ind) return `<div class="pf-peer"><div class="pf-pillar-h mono">PEER COMPARISON</div><div class="caveat">No SIC-industry label for this company, so a peer comparison is unavailable.</div></div>`;
    const peerCiks = []; for (const [cik] of this.byCik) if (this.cikInd.get(cik) === ind) peerCiks.push(cik);
    if (peerCiks.length < MIN_PEERS) return `<div class="pf-peer"><div class="pf-pillar-h mono">PEER COMPARISON · vs ${esc(ind)}</div><div class="caveat">Only ${peerCiks.length} same-industry compan${peerCiks.length === 1 ? "y" : "ies"} in the corpus, which is too few for a peer comparison.</div></div>`;
    const fogA = [], dstA = [], mA = [], fA = [];
    for (const cik of peerCiks) { const r = this._companyRep(this.byCik.get(cik)); if (r.fog != null) fogA.push(r.fog); if (r.dst != null) dstA.push(r.dst); const s = this._scoreRep(cik); if (s.m != null) mA.push(s.m); if (s.f != null) fA.push(s.f); }
    const self = this._companyRep(this.byCik.get(this.cik)), selfS = this._scoreRep(this.cik);
    const rows = [
      this._cmpRow("Complexity · Gunning Fog", self.fog, fogA, 1, "more complex than", "less complex than", false),
      this._cmpRow("Distinctiveness · vs industry", self.dst, dstA, 3, "more distinctive than", "less distinctive than", false),
      this._cmpRow("Beneish M-Score", selfS.m, mA, 2, "higher than", "lower than", true),
      this._cmpRow("Dechow F-Score", selfS.f, fA, 2, "higher than", "lower than", true),
    ].join("");
    const finNote = (mA.length < MIN_PEERS && fA.length < MIN_PEERS) ? `<div class="caveat">Too few scored same-industry peers to benchmark the financial screens.</div>` : "";
    return `<div class="pf-peer">
      <div class="pf-pillar-h mono">PEER COMPARISON · vs ${esc(ind)} · ${peerCiks.length} companies</div>
      ${rows}${finNote}
      <div class="caveat">Each row compares this company's representative value (median across its disclosures / scored years) to the distribution of same-SIC-industry peers (band = interquartile range, tick = median, ● = this company). Position vs peers is descriptive context, not a verdict or a judgment about the company. M / F are published academic screens (Beneish 1999; Dechow, Ge, Larson &amp; Sloan 2011) with known limitations. This dataset cannot re-validate them, so their basis is the literature.</div>
    </div>`;
  }

  _render() {
    const { ns, name, sic, ind, enforced } = this._company();
    const aaer = enforced ? this._aaer(this.cik) : [];
    // header
    const badge = enforced
      ? `<span class="pf-badge mono" title="SEC enforcement history. Shown as context about the company, never a prediction from its disclosures or scores">● ENFORCEMENT HISTORY${aaer.length ? " · " + aaer.map((a) => esc(a.aaer)).slice(0, 4).join(" ") : ""}</span>`
      : `<span class="pf-badge is-quiet mono">NO ENFORCEMENT ON RECORD</span>`;
    const header = `<div class="pf-head">
      <div class="pf-head-main">
        <div class="pf-name">${esc(name)}</div>
        <div class="pf-meta mono">CIK ${esc(this.cik)}${sic ? " · SIC " + esc(sic) : ""}${ind ? " · " + esc(ind) : ""}</div>
      </div>
      <button class="icon-btn mono" data-pf="close" type="button" aria-label="Close profile">✕</button>
    </div>
    <div class="pf-badges">${badge}</div>`;

    // disclosure pillar — footnotes grouped by type, sorted by filing year desc
    const byType = {};
    for (const n of ns) (byType[n.t] = byType[n.t] || []).push(n);
    const years = ns.map((n) => +n.fd).filter(Boolean);
    const yrange = years.length ? years.reduce((m, v) => v < m ? v : m, Infinity) + "-" + years.reduce((m, v) => v > m ? v : m, -Infinity) : "—";
    let discRows = "";
    for (let t = 0; t < 6; t++) {
      const list = byType[t]; if (!list) continue;
      list.sort((a, b) => (+b.fd) - (+a.fd));
      discRows += `<div class="pf-type-h mono">${TYPE_TAG[t]} · <span class="pf-type-n">${list.length}</span></div>`;
      discRows += list.map((n) => {
        const cmp = n.cmp != null ? `Fog ${n.fog} <span class="pf-rel">(${CMP_SHORT[n.cmp]} ind.)</span>` : "";
        const dvi = n.dvi != null ? `<span class="pf-rel">${DVI_SHORT[n.dvi]}</span>` : "";
        return `<div class="pf-fn">
          <span class="pf-fn-y mono">FY${esc(n.fd)}</span>
          <span class="pf-fn-cx mono">${cmp}</span>
          <span class="pf-fn-dx mono">${dvi}</span>
          <button class="pf-open mono" data-pf="open" data-idx="${n.i}" type="button" title="Open this disclosure in the finding panel / locate on the map">open ↗</button>
        </div>`;
      }).join("");
    }
    const neigh = this._neighbors(ns);
    const neighHtml = neigh.length ? neigh.map((x) => `<button class="pf-neigh mono" data-pf="company" data-cik="${esc(x.cik)}" type="button" title="Open this company's profile">
        <span class="pf-neigh-dot" style="background:${x.node.e ? "var(--signal-amber)" : "var(--node-base)"}"></span>
        <span class="pf-neigh-name">${esc(x.node.name)}</span>
        <span class="pf-neigh-sc mono">${x.score.toFixed(4)}</span></button>`).join("")
      : `<div class="caveat">No cross-company neighbors recorded.</div>`;

    const disclosure = `<div class="pf-pillar">
      <div class="pf-pillar-h mono">DISCLOSURE PILLAR · ${ns.length} FOOTNOTES · ${Object.keys(byType).length} TYPES · ${yrange}</div>
      <div class="pf-fn-list">${discRows}</div>
      <div class="section-label mono" style="margin-top:14px">NEAREST COMPANIES BY DISCLOSURE LANGUAGE</div>
      <div class="pf-neigh-list">${neighHtml}</div>
      <div class="caveat">Complexity (Gunning Fog) and distinctiveness are descriptive measures vs same-SIC-industry peers, not findings or judgments. "open ↗" loads the disclosure in the finding panel and locates it on the constellation.</div>
    </div>`;

    // financial pillar — history + on-demand component breakdown (master/detail)
    const fin = this._financialHTML();

    this.body.innerHTML = `${header}
      <div class="pf-actions">
        <button class="act-btn mono" data-pf="csv" type="button">↓ CSV</button>
        <button class="act-btn mono" data-pf="xlsx" type="button">↓ XLSX</button>
        <button class="act-btn mono" data-pf="cite" type="button">⧉ CITE COMPANY</button>
        <a class="act-btn mono" href="${esc(edgarCompany(this.cik))}" target="_blank" rel="noopener">EDGAR ↗</a>
        <span class="act-toast mono" data-pf="toast" aria-live="polite"></span>
      </div>
      ${this._peerHTML(ind)}
      <div class="pf-grid">${disclosure}${fin}</div>
      <div class="pf-timeline">
        <div class="pf-pillar-h mono">DISCLOSURE CHANGE TIMELINE</div>
        <div id="pfTlWrap"><div class="caveat">computing year-over-year change…</div></div>
      </div>`;
    this._fillTimeline();
  }

  async _fillTimeline() {
    if (!this.paste) return;
    const cik = this.cik;
    try { await ensureChanges(this.nodes, this.paste); } catch (e) { const w = this.body.querySelector("#pfTlWrap"); if (w && this.cik === cik) w.innerHTML = `<div class="caveat">Embeddings unavailable, so the change timeline was not computed.</div>`; return; }
    const w = this.body.querySelector("#pfTlWrap"); if (w && this.cik === cik) w.innerHTML = timelineHTML(cik);
  }

  _financialHTML() {
    const comp = companyScores(this.cik);
    if (!comp) {
      return `<div class="pf-pillar"><div class="pf-pillar-h mono">FINANCIAL-QUALITY PILLAR</div>
        <div class="caveat">No financial screens for this company: no SEC XBRL company-facts are available (typically a pre-XBRL, delisted, or foreign filer). No score is shown rather than a fabricated one.</div></div>`;
    }
    const scored = comp.years.filter((y) => y.m != null || y.f != null);
    if (!scored.length) {
      return `<div class="pf-pillar"><div class="pf-pillar-h mono">FINANCIAL-QUALITY PILLAR</div>
        <div class="caveat">This company has SEC financials but no company-year had sufficient inputs for either model (e.g. a financial-sector firm without COGS, or an unclassified balance sheet). No score is shown rather than a fabricated one.</div>
        <div class="caveat fin-honesty">${esc(PILLAR_NOTE_PROFILE)}</div></div>`;
    }
    if (this.selYear == null) this.selYear = scored[scored.length - 1].y;
    const rows = comp.years.map((y) => {
      const sel = y.y === this.selYear;
      const mout = y.m != null && Math.abs(y.m) > 10, fout = y.f != null && y.f > 20;
      const mcell = y.m == null ? `<span class="pf-fy-na">no score</span>` : `<span class="pf-fy-m${y.mf ? " is-flag" : ""}">${mout ? "≫" : ""}${y.m.toFixed(2)}</span>`;
      const fcell = y.f == null ? `<span class="pf-fy-na">—</span>` : `<span class="pf-fy-f">${fout ? "≫" : ""}${y.f.toFixed(2)}</span>`;
      return `<button class="pf-fy${sel ? " is-sel" : ""}" data-pf="year" data-year="${y.y}" type="button" title="Show component breakdown for FY${y.y}">
        <span class="pf-fy-y mono">FY${y.y}</span><span class="pf-fy-mcell mono">${mcell}</span><span class="pf-fy-fcell mono">${fcell}</span></button>`;
    }).join("");
    const detail = this.selYear != null ? yearTilesHTML(comp.years.find((y) => y.y === this.selYear)) : "";
    return `<div class="pf-pillar">
      <div class="pf-pillar-h mono">FINANCIAL-QUALITY PILLAR · M / F BY FISCAL YEAR</div>
      <div class="pf-fy-head mono"><span>YEAR</span><span class="pf-fy-mcell">BENEISH M</span><span class="pf-fy-fcell">DECHOW F</span></div>
      <div class="pf-fy-list">${rows}</div>
      <div class="pf-detail">${detail}</div>
      <div class="caveat fin-honesty">${esc(PILLAR_NOTE_PROFILE)}</div>
    </div>`;
  }

  _profileRows() {
    const ns = (this.byCik.get(this.cik) || []).map((i) => this.nodes[i]).sort((a, b) => a.t - b.t || (+b.fd) - (+a.fd));
    const TF = { 0: "revenue recognition", 1: "going concern", 2: "related-party", 3: "critical audit matter", 4: "mda", 5: "risk factors" };
    const CMP = { "-1": "below", "0": "near", "1": "above" };
    const DVI = { "0": "typical", "1": "distinctive", "2": "highly_distinctive" };
    return ns.map((n) => [n.name, n.cik, n.tk, TF[n.t], n.fd, n.e ? "yes" : "no", n.acc, n.url,
      n.fog, n.asl, n.wc, n.cwp, CMP[n.cmp], n.dst, DVI[n.dvi], ...scoreCells(n)]);
  }

  _cite() {
    const { ns, name, sic, ind, enforced } = this._company();
    const comp = companyScores(this.cik);
    const years = ns.map((n) => +n.fd).filter(Boolean);
    const types = [...new Set(ns.map((n) => TYPE_FULL[n.t]))];
    const nM = comp ? comp.years.filter((y) => y.m != null).length : 0;
    const nF = comp ? comp.years.filter((y) => y.f != null).length : 0;
    const date = new Date().toISOString().slice(0, 10);
    return `Disclosure Atlas · company profile\n${name} (CIK ${this.cik})${sic ? " · SIC " + sic : ""}${ind ? " · " + ind : ""}\n`
      + `Disclosures: ${ns.length} footnotes across ${types.length} type(s) [${types.join(", ")}], filing years ${years.length ? years.reduce((m, v) => v < m ? v : m, Infinity) + "-" + years.reduce((m, v) => v > m ? v : m, -Infinity) : "n/a"}.\n`
      + `Financial-quality screens (published academic models, computed from SEC XBRL): Beneish M-Score for ${nM} fiscal year(s), Dechow F-Score for ${nF}.\n`
      + (enforced ? `Enforcement history (context only, not a prediction): ${this._aaer(this.cik).map((a) => a.aaer).join(", ")}.\n` : "")
      + `Source: SEC EDGAR · ${edgarCompany(this.cik)}\nRetrieved ${date}.\n`
      + `Note: disclosure measures describe resemblance and readability of language. The M and F scores are the outputs of established academic screening models shown with their limitations. Screens, not verdicts, and not a claim about the company.`;
  }

  _onClick(e) {
    const tl = e.target.closest("[data-tl]");
    if (tl) { const p = tl.getAttribute("data-tl").split(":"); if (this.openCompare) this.openCompare(+p[0], +p[1], p[2] != null ? +p[2] : undefined); return; }
    const el = e.target.closest("[data-pf]"); if (!el) return;
    const act = el.getAttribute("data-pf");
    if (act === "close") return this.close();
    if (act === "open") { const i = +el.getAttribute("data-idx"); this.close(); this.onOpenFinding(i); return; }
    if (act === "company") { const c = el.getAttribute("data-cik"); this.open(c); return; }
    if (act === "year") { this.selYear = +el.getAttribute("data-year"); this._render(); return; }
    if (act === "csv") { this.exporters.downloadCSV("disclosure-atlas_profile_" + this.cik + ".csv", PROFILE_HEADERS, this._profileRows()); return; }
    if (act === "xlsx") { const t = this.body.querySelector('[data-pf="toast"]'); if (t) t.textContent = "building…"; this.exporters.downloadXLSX("disclosure-atlas_profile_" + this.cik + ".xlsx", "profile", PROFILE_HEADERS, this._profileRows()).then(() => { if (t) t.textContent = ""; }).catch(() => { if (t) t.textContent = "failed"; }); return; }
    if (act === "cite") { const t = this.body.querySelector('[data-pf="toast"]'); navigator.clipboard.writeText(this._cite()).then(() => { if (t) t.textContent = "citation copied"; setTimeout(() => { if (t) t.textContent = ""; }, 2200); }).catch(() => { if (t) t.textContent = "copy failed"; }); return; }
  }
}

// profile-specific phrasing of the financial honesty note (kept identical in substance to the panel's)
const PILLAR_NOTE_PROFILE = "Beneish M-Score (Beneish 1999) and Dechow F-Score (Dechow, Ge, Larson & Sloan 2011, Model 1) are established, peer-reviewed academic screening models computed from reported financials, shown with their drivers and published limitations. They are screens, not verdicts, and not my judgment. This dataset cannot re-validate them (SEC XBRL begins around 2009, most enforcement cases predate that, and enforced and clean scores do not separate in this sample), so the basis that these models carry signal is the published literature, presented as such. This is distinct from, and consistent with, the disclosure-language null.";
