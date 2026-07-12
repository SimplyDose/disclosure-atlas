// Finding panel renderer — real companies, real CIKs, real scores, real explanations.
// Explanation text is shown ONLY from the pre-generated Claude findings; for any other pair a
// neutral, non-accusatory note is shown (never invented analysis). Honesty copy only.
import { downloadCSV, downloadXLSX } from "./exporters.js";
import { BM25 } from "./bm25.js";
import { readability } from "./readability.js";
import { renderFinancials, microScore, ensureScores, scoreCells, SCORE_HEADERS } from "./scores.js";
import { XWALK_HEADERS, xwalkCells } from "./identifiers.js";

const TYPE_TAG = { 0: "REV-REC", 1: "GOING CONCERN", 2: "RELATED-PARTY", 3: "CAM", 4: "MD&A", 5: "RISK FACTORS" };
const TYPE_FULL = { 0: "Revenue recognition", 1: "Going concern", 2: "Related-party transactions", 3: "Critical audit matter", 4: "MD&A", 5: "Risk factors" };
const FINDING_HEADERS = ["rank", "company", "cik", "ticker", ...XWALK_HEADERS, "footnote_type", "similarity", "enforced", "accession", "edgar_url", "gunning_fog", "avg_sentence_length", "word_count", "complex_word_pct", "complexity_vs_industry", "distinctiveness", "distinctiveness_vs_industry", ...SCORE_HEADERS];
const CMP_TEXT = { "-1": "below", "0": "near", "1": "above" };
const CMP_PHRASE = { "-1": "less complex than its industry peers", "0": "typical complexity for its industry peers", "1": "more complex than its industry peers" };
const CMP_CLASS = { "-1": "cx-below", "0": "cx-near", "1": "cx-above" };
// descriptive DISTINCTIVENESS (language unusualness vs same-industry, same-type peers) — never a judgment
const DVI_TEXT = { "0": "typical", "1": "distinctive", "2": "highly_distinctive" };
const DVI_PHRASE = { "0": "typical language for its industry peers", "1": "more distinctive than its industry peers", "2": "unusually distinctive for its industry peers" };
const DVI_CLASS = { "0": "dx-typical", "1": "dx-distinctive", "2": "dx-high" };

function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

export class Panel {
  constructor(els, data, opts) {
    this.body = els.body; this.panel = els.panel;
    this.excerpts = data.excerpts; this.featured = data.featuredMap; this.aaer = data.aaer; this.caveats = data.caveats;
    this.nodes = data.nodes;
    this.onNeighbor = opts.onNeighbor; this.onPin = opts.onPin || (() => {}); this.onDrift = opts.onDrift || (() => {});
    this.onCompany = opts.onCompany || (() => {});
    this._lastFinding = null;
    this._scoreRaf = null; this._lastKey = null;
    this.ease = (t) => t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);
    this.reduced = matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.bm25 = new BM25();
    this.showBaseline = (() => { try { return localStorage.getItem("atlas.kwBaseline") === "1"; } catch (e) { return false; } })();
  }

  setExcerpts(d) { this.excerpts = d; this.bm25 = new BM25(); }  // lazy-loaded; reset BM25 to rebuild
  _excerpt(idx) { return idx >= 0 ? (this.excerpts[String(idx)] || "") : ""; }
  _aaerLabel(cik) {
    const list = this.aaer[cik] || this.aaer[String(parseInt(cik, 10)).padStart(10, "0")] || [];
    if (!list.length) return "SEC enforcement history on record";
    const nums = list.slice(0, 2).map((x) => x.aaer).join(", ");
    return "SEC " + nums + (list.length > 2 ? " +" + (list.length - 2) : "");
  }
  _explanation(f) {
    if (f.virtual) return { src: "note", text: "Nearest-neighbor matches by disclosure-language similarity, embedded in your browser. Pre-generated analyst explanations exist for the featured pairs highlighted on the map; this is an indicative match. The engine surfaces resemblance. The reader judges." };
    const key = f.query.idx < f.match.idx ? f.query.idx + "_" + f.match.idx : f.match.idx + "_" + f.query.idx;
    const ex = this.featured[key];
    if (ex) return { src: "claude", text: ex };
    return { src: "note", text: "These two disclosures are nearest neighbors by cosine similarity in the bge-small embedding space (" + f.score.toFixed(4) + "). Pre-generated analyst explanations are available for the featured pairs highlighted on the map; this pair is shown by similarity only: resemblance of language, not a judgment." };
  }

  _ensureBM25() { if (!this.bm25.ready) this.bm25.build(this.excerpts, this.nodes); return this.bm25; }
  _queryText(f) { return f.query.pasted ? (f.query.excerpt || "") : this._excerpt(f.query.idx); }
  _baselineHTML(f) {
    if (!this.showBaseline) return `<button class="kw-toggle mono" data-act="kw" type="button" aria-pressed="false">≈ show keyword baseline (BM25)</button>`;
    const qtext = this._queryText(f);
    let html = `<button class="kw-toggle is-on mono" data-act="kw" type="button" aria-pressed="true">≈ hide keyword baseline (BM25)</button>`;
    if (!qtext) { return html + `<p class="caveat">No query text available for a keyword comparison.</p>`; }
    this._ensureBM25();
    const kw = this.bm25.scoreQuery(qtext, 10, f.query.pasted ? null : f.query.cik);
    const semSet = new Set(f.neighbors.map((n) => this.nodes[n.idx].cik));
    const rows = kw.map(([idx, s], r) => {
      const n = this.nodes[idx]; const inSem = semSet.has(n.cik);
      return `<div class="kw-row"><span class="nb-rank mono">${String(r + 1).padStart(2, "0")}</span>
        <span class="nb-name" style="color:${n.e ? "#E0A04A" : "#9AA7B6"}">${esc(n.name)}</span>
        <span class="kw-flag mono" title="${inSem ? "also in semantic top-10" : "keyword-only (semantic ranks it elsewhere)"}">${inSem ? "◆ both" : "○ kw-only"}</span></div>`;
    }).join("");
    const overlap = kw.filter(([idx]) => semSet.has(this.nodes[idx].cik)).length;
    html += `<div class="kw-block">
      <div class="kw-note mono">BM25 keyword ranking · ${overlap}/${kw.length} overlap with semantic top-10. Where they differ is where meaning beats shared words, the one result my validation confirmed.</div>
      ${rows || '<p class="caveat">No keyword matches.</p>'}</div>`;
    return html;
  }

  // ---- descriptive complexity (Gunning Fog) — comparative only, never a judgment ----
  _cxOf(idx, pasted, excerpt) {
    if (!pasted && idx >= 0) { const n = this.nodes[idx]; return { fog: n.fog, asl: n.asl, wc: n.wc, cwp: n.cwp, cmp: n.cmp, fim: n.fim }; }
    const r = readability(excerpt || ""); return { fog: r.fog, asl: r.asl, wc: r.wc, cwp: r.cwp, cmp: null, fim: null };
  }
  _cxColumn(label, accent, d) {
    const rel = d.cmp == null
      ? `<div class="cx-rel mono cx-near">no industry peer set for pasted text</div>`
      : `<div class="cx-rel mono ${CMP_CLASS[d.cmp]}">${CMP_PHRASE[d.cmp]} · median Fog ${d.fim}</div>`;
    return `<div class="cx-col">
      <div class="cx-eyebrow mono" style="color:${accent}">${label}</div>
      <div class="cx-fog mono">Fog ${d.fog}</div>
      <div class="cx-meta mono">${d.asl} words/sentence · ${d.cwp}% complex words · ${d.wc} words</div>
      ${rel}</div>`;
  }
  _complexityHTML(f, matchAccent) {
    const q = this._cxOf(f.query.idx, f.query.pasted, f.query.excerpt);
    const m = this._cxOf(f.match.idx, false, null);
    return `<div class="section-label mono">DISCLOSURE COMPLEXITY · GUNNING FOG</div>
      <div class="cx-grid">
        ${this._cxColumn(f.query.pasted ? "PASTED" : "QUERY", "#5BA4DD", q)}
        ${this._cxColumn("NEAREST MATCH", matchAccent, m)}
      </div>
      <div class="caveat">Complexity is a descriptive readability measure (Gunning Fog) computed on the footnote text, not a finding or a judgment about the company. The comparison is to the median footnote in the same SIC industry.</div>`;
  }

  // ---- descriptive distinctiveness (language unusualness vs industry peers) — comparative only ----
  _dxOf(idx, pasted) {
    if (!pasted && idx >= 0) { const n = this.nodes[idx]; return { dst: n.dst, dmd: n.dmd, dvi: n.dvi }; }
    return { dst: null, dmd: null, dvi: null };   // pasted text has no industry peer set
  }
  _dxColumn(label, accent, d) {
    const rel = d.dvi == null
      ? `<div class="cx-rel mono cx-near">no industry peer set for pasted text</div>`
      : `<div class="cx-rel mono ${DVI_CLASS[d.dvi]}">${DVI_PHRASE[d.dvi]} · median ${d.dmd}</div>`;
    const val = d.dst == null ? "—" : d.dst.toFixed(3);
    return `<div class="cx-col">
      <div class="cx-eyebrow mono" style="color:${accent}">${label}</div>
      <div class="cx-fog mono">${val}</div>
      <div class="cx-meta mono">cosine distance from same-industry peer centroid</div>
      ${rel}</div>`;
  }
  _distinctivenessHTML(f, matchAccent) {
    const q = this._dxOf(f.query.idx, f.query.pasted);
    const m = this._dxOf(f.match.idx, false);
    return `<div class="section-label mono">DISCLOSURE DISTINCTIVENESS · vs SIC INDUSTRY</div>
      <div class="cx-grid">
        ${this._dxColumn(f.query.pasted ? "PASTED" : "QUERY", "#5BA4DD", q)}
        ${this._dxColumn("NEAREST MATCH", matchAccent, m)}
      </div>
      <div class="caveat">Distinctiveness is a descriptive measure of how unusual a footnote's language is relative to same-industry, same-type peers (distance from the peer centroid in embedding space), not a finding or a judgment about the company.</div>`;
  }

  render(f) {
    const enforced = f.query.enforced || f.match.enforced;
    const both = f.query.enforced && f.match.enforced;
    const matchAccent = f.match.enforced ? "#E0A04A" : "#5BA4DD";
    const badge = enforced
      ? { label: both ? "ENFORCEMENT HISTORY · BOTH PARTIES" : ("ENFORCEMENT HISTORY · " + this._aaerLabel(f.query.enforced ? f.query.cik : f.match.cik)), border: "#E0A04A55", bg: "#E0A04A12", dot: "#E0A04A", glow: "#E0A04A80", text: "#E0A04A" }
      : { label: "NO ENFORCEMENT ON RECORD", border: "#1E2A38", bg: "transparent", dot: "#3A4656", glow: "#00000000", text: "#9AA7B6" };
    const expl = this._explanation(f);
    const qExcerpt = f.query.pasted ? (f.query.excerpt || "—") : this._excerpt(f.query.idx);
    const mExcerpt = this._excerpt(f.match.idx);
    const qTag = f.query.pasted ? "PASTED" : TYPE_TAG[f.query.type];

    const nbRows = f.neighbors.map((nb) => {
      const dot = nb.enforced ? "#E0A04A" : (nb.active ? "#5BA4DD" : "#8A97A8");
      return `<button class="nb ${nb.active ? "is-active" : ""}" data-nb="${nb.idx}" type="button">
        <span class="nb-rank mono">${String(nb.rank + 1).padStart(2, "0")}</span>
        <span class="nb-mid"><span class="nb-dot" style="background:${dot}"></span><span class="nb-name" style="color:${nb.active ? "#ECF1F7" : "#9AA7B6"}">${esc(nb.name)}</span></span>
        <span class="nb-score mono" style="color:${nb.active ? "#5BA4DD" : "#9AA7B6"}">${nb.score.toFixed(4)}</span>
      </button>`;
    }).join("");

    const sourcesHtml = [f.query.url ? this._source(f.query.url, f.query.cik) : "", this._source(f.match.url, f.match.cik)].join("");

    this.body.innerHTML = `
      <div class="badge" style="border-color:${badge.border};background:${badge.bg}">
        <span class="badge-dot" style="background:${badge.dot};box-shadow:0 0 8px 1px ${badge.glow}"></span>
        <span class="badge-text mono" style="color:${badge.text}">${esc(badge.label)}</span>
      </div>
      <div class="two-co">
        <div class="co">
          <div class="co-eyebrow mono" style="color:#5BA4DD">QUERY</div>
          ${f.query.pasted ? `<div class="co-name">${esc(f.query.name)}</div>` : `<button class="co-name co-name-btn" data-company="${esc(f.query.cik)}" type="button" title="Open this company's full profile">${esc(f.query.name)}</button>`}
          <div class="co-tag mono">${qTag}</div>
          <div class="co-cik mono">CIK ${esc(f.query.cik)}</div>
          ${f.query.pasted ? "" : microScore(this.nodes[f.query.idx])}
        </div>
        <div class="co">
          <div class="co-eyebrow mono" style="color:${matchAccent}">NEAREST MATCH</div>
          <button class="co-name co-name-btn" data-company="${esc(f.match.cik)}" type="button" title="Open this company's full profile">${esc(f.match.name)}</button>
          <div class="co-tag mono">${TYPE_TAG[f.match.type]}</div>
          <div class="co-cik mono">CIK ${esc(f.match.cik)}</div>
          ${microScore(this.nodes[f.match.idx])}
        </div>
      </div>
      <div class="score-row">
        <div><div class="score-label mono">DISCLOSURE SIMILARITY</div><div class="score-sub mono">cosine · ${TYPE_FULL[f.match.type]}</div></div>
        <div class="score-big mono" id="scoreBig">0.0000</div>
      </div>
      <div class="panel-actions">
        <button class="act-btn mono" data-act="cite" type="button">⧉ CITE</button>
        <button class="act-btn mono" data-act="csv" type="button">↓ CSV</button>
        <button class="act-btn mono" data-act="xlsx" type="button">↓ XLSX</button>
        <button class="act-btn mono" data-act="pin" type="button">+ SHORTLIST</button>
        ${f.query.pasted ? "" : '<button class="act-btn mono" data-act="drift" type="button" title="Trace this company\'s disclosure language for this type, year over year">◷ DRIFT</button>'}
        <span class="act-toast mono" id="actToast" aria-live="polite"></span>
      </div>
      <div class="section-label mono">FOOTNOTE EXCERPTS · ${esc(f.typeLabel)}</div>
      <div class="excerpt"><div class="excerpt-eyebrow mono" style="color:#5BA4DD">${qTag} · ${esc(f.query.name)}</div><p>${esc(qExcerpt)}</p></div>
      <div class="excerpt" style="border-left-color:${matchAccent}"><div class="excerpt-eyebrow mono" style="color:${matchAccent}">${TYPE_TAG[f.match.type]} · ${esc(f.match.name)}</div><p>${esc(mExcerpt)}</p></div>
      <div class="explain">
        <div class="explain-label mono">${expl.src === "claude" ? "WHY THESE RESEMBLE · CLAUDE" : "HOW TO READ THIS PAIR"}</div>
        <p class="${expl.src === "claude" ? "" : "note"}">${esc(expl.text)}</p>
      </div>
      ${this._complexityHTML(f, matchAccent)}
      ${this._distinctivenessHTML(f, matchAccent)}
      <div class="fin-pillar">${renderFinancials(f.query, f.query.idx >= 0 ? this.nodes[f.query.idx].pfy : null)}</div>
      <div class="section-label mono">NEAREST NEIGHBORS · CROSS-COMPANY · SEMANTIC</div>
      <div style="margin-bottom:14px">${nbRows || '<p class="caveat">No neighbors above the current similarity threshold.</p>'}</div>
      <div class="kw-wrap" style="margin-bottom:22px">${this._baselineHTML(f)}</div>
      <div class="section-label mono">SOURCE FILINGS</div>
      <div>${sourcesHtml}</div>
      ${f.match.type === 1 ? `<div class="caveat">${esc(this.caveats.going_concern)}</div>` : ""}
      <div class="caveat">${esc(this.caveats.enforcement)}</div>`;

    this._lastFinding = f;
    this.body.querySelectorAll("[data-nb]").forEach((b) => b.addEventListener("click", () => this.onNeighbor(+b.getAttribute("data-nb"))));
    this.body.querySelectorAll("[data-company]").forEach((b) => b.addEventListener("click", () => this.onCompany(b.getAttribute("data-company"))));
    this.body.querySelector('[data-act="cite"]').addEventListener("click", () => this._copy(this._citation(f), "citation copied"));
    this.body.querySelector('[data-act="csv"]').addEventListener("click", () => this._export(f, "csv"));
    this.body.querySelector('[data-act="xlsx"]').addEventListener("click", () => this._export(f, "xlsx"));
    this.body.querySelector('[data-act="pin"]').addEventListener("click", () => { const n = this.nodes[f.match.idx]; this.onPin(n); this._toast("added to shortlist"); });
    this.body.querySelector('[data-act="drift"]')?.addEventListener("click", () => this.onDrift(f.query.cik, f.query.type, f.query.name));
    const kw = this.body.querySelector('[data-act="kw"]');
    if (kw) kw.addEventListener("click", () => { this.showBaseline = !this.showBaseline; try { localStorage.setItem("atlas.kwBaseline", this.showBaseline ? "1" : "0"); } catch (e) {} this.render(this._lastFinding); });

    const key = f.query.idx + ":" + f.match.idx;
    this._animateScore(f.score, key !== this._lastKey);
    this._lastKey = key;
  }

  // ---- citation ----
  _citation(f) {
    const date = new Date().toISOString().slice(0, 10);
    const node = (idx) => (idx >= 0 ? this.nodes[idx] : null);
    const ref = (label, n, pasted) => {
      if (pasted) return `${label}: user-supplied disclosure text (not a filing).`;
      if (!n) return "";
      return `${label}: ${n.name} (CIK ${n.cik}), Form 10-K, U.S. SEC EDGAR${n.acc ? `, accession ${n.acc}` : ""}${n.fdate ? `, filed ${n.fdate}` : ""}. ${n.url || ""}`;
    };
    const q = node(f.query.idx);
    return [
      ref("Query disclosure", q, f.query.pasted),
      ref("Nearest match", node(f.match.idx), false),
      `Disclosure-language similarity (bge-small, cosine): ${f.score.toFixed(4)}.`,
      `Surfaced by Disclosure Atlas (disclosure-atlas.vercel.app); retrieved ${date}. Resemblance of disclosure language, not a claim about either company.`,
    ].filter(Boolean).join("\n");
  }

  // ---- export current finding (query + ranked neighbors) ----
  _findingRows(f) {
    const TFULL = { 0: "revenue recognition", 1: "going concern", 2: "related-party", 3: "critical audit matter", 4: "mda", 5: "risk factors" };
    const cx = (n) => n ? [n.fog, n.asl, n.wc, n.cwp, CMP_TEXT[n.cmp], n.dst, DVI_TEXT[n.dvi]] : ["", "", "", "", "", "", ""];
    const metrics = (n) => [...cx(n), ...scoreCells(n)];   // complexity + distinctiveness + financial scores
    const q = f.query.idx >= 0 ? this.nodes[f.query.idx] : null;
    const qm = q ? metrics(q) : (() => { const r = readability(f.query.excerpt || ""); return [r.fog, r.asl, r.wc, r.cwp, "", "", "", ...scoreCells(null)]; })();
    const rows = [["00", f.query.pasted ? "Your pasted disclosure" : f.query.name, q ? q.cik : "", q ? q.tk : "", ...xwalkCells(q), TFULL[f.query.type], "query", q ? (q.e ? "yes" : "no") : "", q ? q.acc : "", q ? q.url : "", ...qm]];
    for (const nb of f.neighbors) { const n = this.nodes[nb.idx]; rows.push([String(nb.rank + 1).padStart(2, "0"), n.name, n.cik, n.tk, ...xwalkCells(n), TFULL[n.t], nb.score.toFixed(4), n.e ? "yes" : "no", n.acc, n.url, ...metrics(n)]); }
    return rows;
  }
  async _export(f, kind) {
    await ensureScores();   // financial-score columns come from the lazy scores bundle
    const rows = this._findingRows(f);
    const base = (f.query.pasted ? "pasted-disclosure" : (f.query.idx >= 0 ? this.nodes[f.query.idx].name : "finding")).replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 40);
    try {
      if (kind === "xlsx") { this._toast("building xlsx…"); await downloadXLSX("disclosure-atlas_" + base + ".xlsx", "finding", FINDING_HEADERS, rows); this._toast("XLSX exported · " + rows.length + " rows"); }
      else { downloadCSV("disclosure-atlas_" + base + ".csv", FINDING_HEADERS, rows); this._toast("CSV exported · " + rows.length + " rows"); }
    } catch (e) { console.error(e); this._toast("export failed"); }
  }

  async _copy(text, msg) {
    try { await navigator.clipboard.writeText(text); }
    catch (e) { const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (_) {} document.body.removeChild(ta); }
    this._toast(msg);
  }
  _toast(msg) { const t = this.body.querySelector("#actToast"); if (!t) return; t.textContent = msg; clearTimeout(this._toastT); this._toastT = setTimeout(() => { t.textContent = ""; }, 2600); }

  _source(url, cik) {
    const safe = (url || "").startsWith("https://www.sec.gov/") ? url : ("https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=" + encodeURIComponent(cik) + "&type=10-K");
    return `<a class="source" href="${esc(safe)}" target="_blank" rel="noopener"><span class="mono">EDGAR · 10-K · CIK ${esc(cik)}</span><span class="mono">↗</span></a>`;
  }

  _animateScore(target, fresh) {
    cancelAnimationFrame(this._scoreRaf);
    const el = this.body.querySelector("#scoreBig"); if (!el) return;
    if (this.reduced || !fresh) { el.textContent = target.toFixed(4); return; }
    const start = performance.now(), dur = 520;
    const step = (now) => { let t = (now - start) / dur; if (t >= 1) { el.textContent = target.toFixed(4); return; } el.textContent = (this.ease(t) * target).toFixed(4); this._scoreRaf = requestAnimationFrame(step); };
    this._scoreRaf = requestAnimationFrame(step);
  }

  open() {
    this.panel.classList.add("is-open"); this.panel.removeAttribute("inert");
    const close = document.getElementById("panelClose");
    if (close && !this.panel.contains(document.activeElement)) close.focus({ preventScroll: true });
  }
  close() { if (this.panel.contains(document.activeElement)) document.activeElement.blur(); this.panel.classList.remove("is-open"); this.panel.setAttribute("inert", ""); }
}
