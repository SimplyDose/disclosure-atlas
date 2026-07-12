// Disclosure Atlas — bootstrap. Loads the real data bundle, wires the locked design's controls,
// and drives the constellation + finding panel. No fabricated values anywhere.
import { Constellation } from "./constellation.js";
import { Panel } from "./panel.js";
import { PasteSearch } from "./paste.js";
import { downloadCSV, downloadXLSX, downloadText } from "./exporters.js";
import { ensureScores, scoreCells, SCORE_HEADERS } from "./scores.js";
import { Profile } from "./profile.js";
import { Cohort } from "./cohort.js";
import { Changes } from "./changes.js";
import { Intersect } from "./intersect.js";
import { Table } from "./table.js";
import { Table1 } from "./table1.js";
import { Share, encodeCohort, decodeCohort } from "./share.js";
import { Corr } from "./correlation.js";
import { Screen } from "./screen.js";
import { XWALK_HEADERS, xwalkCells } from "./identifiers.js";
import { ImportCode } from "./importcode.js";
import { renderMethodsHTML, buildMethodsMD } from "./methods.js";

const $ = (id) => document.getElementById(id);
const TYPE_FULL = { 0: "revenue recognition", 1: "going concern", 2: "related-party", 3: "critical audit matter", 4: "MD&A", 5: "risk factors" };

async function loadJSON(p) { const r = await fetch(p); if (!r.ok) throw new Error("fetch " + p + " " + r.status); return r.json(); }

function canvasSupported(cv) { try { return !!(cv.getContext && cv.getContext("2d")); } catch (e) { return false; } }

async function boot() {
  const cv = $("cv");
  let nodes, neighbors, findings, aaer, manifest;
  let excerpts = {};
  try {
    // Load render-critical data upfront; defer the large excerpts file (~50 MB) so the 94k map
    // paints fast. Excerpts are needed only when a finding opens / BM25 runs — lazy-loaded below.
    [nodes, neighbors, findings, aaer, manifest] = await Promise.all([
      loadJSON("./data/nodes.json"), loadJSON("./data/neighbors.json"),
      loadJSON("./data/findings.json"), loadJSON("./data/aaer.json"), loadJSON("./data/manifest.json"),
    ]);
  } catch (e) {
    document.body.innerHTML = '<div style="color:#9AA7B6;font-family:monospace;padding:40px">Could not load the dataset. ' + e.message + "</div>";
    return;
  }
  // lazy excerpts loader (cached promise); kicked off immediately so it's usually ready by first click
  let _excerptsP = null;
  const ensureExcerpts = () => _excerptsP || (_excerptsP = loadJSON("./data/excerpts.json").then((d) => {
    excerpts = d; panel.setExcerpts(d); return d;   // panel is defined by the time this resolves
  }).catch(() => ({})));

  // stats
  $("statTotal").textContent = manifest.count.toLocaleString("en-US");
  $("statEnforced").textContent = manifest.enforced.toLocaleString("en-US");
  // footnote-type count, derived from the real corpus manifest (not a hardcoded value)
  const _typeCount = (manifest.corpus && manifest.corpus.footnotes_by_type)
    ? Object.keys(manifest.corpus.footnotes_by_type).length
    : (TYPE_FULL ? Object.keys(TYPE_FULL).length : 6);
  $("statTypes").textContent = String(_typeCount);

  // industry filter options
  const indSel = $("industry");
  for (const ind of manifest.industries) { const o = document.createElement("option"); o.value = ind; o.textContent = ind; indSel.appendChild(o); }

  // featured map (real Claude explanations) keyed by sorted index pair
  const featuredMap = {};
  for (const f of findings) { const k = f.qi < f.mi ? f.qi + "_" + f.mi : f.mi + "_" + f.qi; featuredMap[k] = f.explanation; }

  // graceful degradation: no canvas -> list view of featured findings (excerpts are lazy)
  if (!canvasSupported(cv)) { excerpts = await loadJSON("./data/excerpts.json").catch(() => ({})); renderFallback(findings, nodes, excerpts, aaer); return; }

  // modal open/close via `inert` (hides from AT + blocks focus, no aria-hidden focus trap)
  const setModal = (m, open) => {
    if (open) { m.classList.add("is-open"); m.removeAttribute("inert"); }
    else { if (m.contains(document.activeElement)) document.activeElement.blur(); m.classList.remove("is-open"); m.setAttribute("inert", ""); }
  };
  ["panel", "pasteModal", "aboutModal", "compareModal", "shortlistModal", "profileModal", "cohortModal", "methodsModal", "changesModal", "intersectModal", "tableModal", "table1Modal", "shareModal", "corrModal", "importModal", "screenModal"].forEach((id) => $(id).setAttribute("inert", ""));

  // shortlist (client-side only)
  const shortlist = {
    ids: (() => { try { return JSON.parse(localStorage.getItem("atlas.shortlist") || "[]").filter((i) => Number.isInteger(i) && i >= 0 && i < nodes.length); } catch (e) { return []; } })(),
    save() { try { localStorage.setItem("atlas.shortlist", JSON.stringify(this.ids)); } catch (e) {} },
    add(i) { if (!this.ids.includes(i)) { this.ids.push(i); this.save(); } updateShortlistCount(); },
    remove(i) { this.ids = this.ids.filter((x) => x !== i); this.save(); updateShortlistCount(); },
    clear() { this.ids = []; this.save(); updateShortlistCount(); },
  };
  const updateShortlistCount = () => { $("shortlistCount").textContent = String(shortlist.ids.length); };

  let profile;   // forward ref (Profile is created after the engine)
  const panel = new Panel(
    { body: $("panelBody"), panel: $("panel") },
    { excerpts, featuredMap, aaer, caveats: manifest.caveats, nodes },
    { onNeighbor: (idx) => engine.setMatch(idx), onPin: (n) => shortlist.add(n.i), onDrift: (cik, type, name) => startDrift(cik, type, name),
      onCompany: (cik) => { if (profile) profile.open(cik); } }
  );
  updateShortlistCount();
  ensureExcerpts();   // kick off the lazy excerpts load in the background right away
  ensureScores();     // and the financial-quality scores bundle (Chapter E)

  const hero = $("hero"), readout = $("readout");
  let currentQuery = null; // {type:'node',idx} | {type:'vec',vec} — drives bulk-export similarity
  const engine = new Constellation(cv, { nodes, neighbors }, {
    onSelect: (f) => {
      if (engine.drift) closeDrift();   // a new finding clears any active drift trail
      hero.classList.add("is-hidden");
      readout.classList.add("is-on");
      $("clusterLabel").textContent = f.virtual ? ("pasted · " + TYPE_FULL[f.match.type]) : TYPE_FULL[f.query.type];
      $("neighborCount").textContent = String(f.neighborCount);
      currentQuery = f.virtual ? (paste.lastQueryVec ? { type: "vec", vec: paste.lastQueryVec } : null) : { type: "node", idx: f.query.idx };
      // R1: shareable permalink for node-based findings (pasted text can't be encoded)
      setHash(f.virtual ? "" : ("f=" + f.query.idx + "." + f.match.idx));
      panel.open();
      // excerpts + financial scores are lazy; render once both are available (usually cached).
      // Open first so the panel animates in; render fills excerpts/complexity/financials when ready.
      Promise.all([ensureExcerpts(), ensureScores()]).then(() => panel.render(f));
    },
  });
  const setHash = (v) => { try { history.replaceState(null, "", location.pathname + location.search + (v ? "#" + v : "")); } catch (e) {} };
  engine.setTip($("tip"), $("tipName"), $("tipMeta"));
  const paste = new PasteSearch(nodes);   // also powers the lazy embeddings used by compare / cohort / change detection
  // open the before/after compare (reuse the compare view) prefilled with two excerpts' text.
  // For a change event, pass the precomputed cosine so the shown number matches the ranked magnitude
  // exactly (no re-embed); otherwise fall back to re-embedding the two texts.
  const openCompare = async (idxA, idxB, cos) => {
    await ensureExcerpts();
    document.querySelectorAll(".modal.is-open").forEach((m) => setModal(m, false));
    $("cmpA").value = excerpts[String(idxA)] || ""; $("cmpB").value = excerpts[String(idxB)] || "";
    setModal($("compareModal"), true);
    if (cos != null && isFinite(cos)) {
      const c = Math.max(-1, Math.min(1, cos));
      $("cmpScore").textContent = c.toFixed(4);
      $("cmpBarFill").style.width = Math.round(Math.max(0, c) * 100) + "%";
      $("cmpReading").textContent = "Cosine " + c.toFixed(4) + " between these two years' disclosure: " + (c >= 0.9 ? "very close: the language barely changed." : c >= 0.75 ? "close: largely the same language." : c >= 0.5 ? "moderate: a notable change in language." : "distant: the language changed substantially.") + " Descriptive linguistic change only, not a flag.";
      $("cmpStatus").textContent = ""; $("cmpResult").hidden = false;
    } else { $("cmpRun").click(); }
  };
  // COMPANY PROFILE — unified two-pillar view; reached from any company name (panel) or #c=CIK
  profile = new Profile({
    modal: $("profileModal"), body: $("profileBody"), setModal, nodes, neighbors, aaer, setHash, paste, openCompare,
    onOpenFinding: (i) => engine.selectIndex(i),
    exporters: { downloadCSV, downloadXLSX, downloadText },
  });
  window.__atlas = { engine, panel, profile }; // for Playwright hooks

  function closeFinding() { engine.closeFinding(); panel.close(); hero.classList.remove("is-hidden"); readout.classList.remove("is-on"); setHash(""); }
  $("panelClose").addEventListener("click", closeFinding);

  // ---- disclosure drift over time (showpiece) — descriptive movement, never a prediction ----
  const driftBar = $("driftBar"), driftScrub = $("driftScrub"), driftPlay = $("driftPlay"), driftYear = $("driftYear");
  let _driftRaf = null;
  const driftDir = (d) => {   // descriptive direction relative to a reference centroid
    if (!d) return "";
    if (d.last < d.first * 0.97) return "toward";
    if (d.last > d.first * 1.03) return "away from";
    return "about the same distance from";
  };
  function startDrift(cik, type, name) {
    const s = engine.traceDrift(cik, type);
    if (!s) { panel._toast && panel._toast("needs ≥2 filing years to trace drift"); return; }
    closeFinding();
    $("driftTitle").textContent = "DRIFT · " + (s.company || name) + " · " + TYPE_FULL[type];
    const ind = driftDir(s.industry_dist), gc = driftDir(s.going_concern_dist);
    $("driftSub").textContent = s.first + "→" + s.last + " · " + s.nYears + " filing years · over this span its language drifted "
      + ind + " its industry's typical " + TYPE_FULL[type] + " language"
      + (gc ? ", and " + gc + " the going-concern region of the map" : "");
    $("driftCaveat").textContent = "Drift is a descriptive measure of how this company's disclosure language moved in the embedding space, year by year. It is not a prediction or a warning.";
    driftScrub.max = String(s.nYears - 1); driftScrub.value = "0";
    driftPlay.textContent = "❚❚";
    driftBar.hidden = false;
    cancelAnimationFrame(_driftRaf);
    const sync = () => { const st = engine.driftState(); if (!st) return; if (st.playing) driftScrub.value = String(st.cursor); driftYear.textContent = st.year; driftPlay.textContent = st.playing ? "❚❚" : "▶"; _driftRaf = requestAnimationFrame(sync); };
    sync();
  }
  function closeDrift() { cancelAnimationFrame(_driftRaf); engine.closeDrift(); driftBar.hidden = true; }
  $("driftClose").addEventListener("click", closeDrift);
  driftPlay.addEventListener("click", () => { driftPlay.textContent = engine.driftTogglePlay() ? "❚❚" : "▶"; });
  driftScrub.addEventListener("input", () => { const m = +driftScrub.max || 1; engine.driftSetCursor(+driftScrub.value / m); const st = engine.driftState(); if (st) driftYear.textContent = st.year; driftPlay.textContent = "▶"; });

  // search
  function runSearch() { const i = engine.findByText($("search").value); if (i >= 0) engine.selectIndex(i); }
  $("searchBtn").addEventListener("click", runSearch);
  $("search").addEventListener("keydown", (e) => { if (e.key === "Enter") runSearch(); });

  // presets -> real featured pairs (guarantees a real Claude explanation shows)
  const firstByType = (t, enfPref) => {
    const pool = findings.filter((f) => (t == null || f.type === t));
    return (enfPref && pool.find((f) => nodes[f.qi].e || nodes[f.mi].e)) || pool[0] || findings[0];
  };
  document.querySelectorAll("[data-preset]").forEach((b) => b.addEventListener("click", () => {
    const kind = b.getAttribute("data-preset");
    const f = kind === "featured" ? firstByType(null, true) : firstByType(kind === "going_concern" ? "going_concern" : "rev_rec", true);
    if (f) engine.selectPair(f.qi, f.mi);
  }));

  // filters
  // re-query #bulkCount each call: the export handler restores the button's innerHTML,
  // which replaces the span node, so a cached reference would go stale (reviewer-found bug).
  const updateBulkCount = () => { const el = $("bulkCount"); if (el) el.textContent = "(" + engine.filteredIndices().length.toLocaleString() + ")"; };
  const typeSel = $("typeSel");
  typeSel.addEventListener("change", () => { engine.setFilter({ type: typeSel.value }); updateBulkCount(); });
  indSel.addEventListener("change", () => { engine.setFilter({ industry: indSel.value }); updateBulkCount(); });
  const cxSel = $("cxSel");
  const CX_VAL = { "": null, below: -1, near: 0, above: 1 };
  cxSel.addEventListener("change", () => { engine.setFilter({ cmp: CX_VAL[cxSel.value] }); updateBulkCount(); });
  const dxSel = $("dxSel");
  const DX_VAL = { "": null, typical: 0, distinctive: 1, highly: 2 };
  dxSel.addEventListener("change", () => { engine.setFilter({ dvi: DX_VAL[dxSel.value] }); updateBulkCount(); });
  // financial-quality screen filter (Chapter E) — composes with all other filters
  const scoreSel = $("scoreSel");
  scoreSel.addEventListener("change", () => { engine.setFilter({ score: scoreSel.value || null }); updateBulkCount(); });

  // time-range filter (filing year). Composes with every other filter via _passesFilter.
  const yMin = parseInt(manifest.corpus.year_min, 10), yMax = parseInt(manifest.corpus.year_max, 10);
  const yearFrom = $("yearFrom"), yearTo = $("yearTo");
  for (let y = yMin; y <= yMax; y++) { const a = new Option(y, y), b = new Option(y, y); yearFrom.appendChild(a); yearTo.appendChild(b); }
  yearFrom.value = String(yMin); yearTo.value = String(yMax);
  const applyYears = () => {
    let lo = +yearFrom.value, hi = +yearTo.value;
    if (lo > hi) { hi = lo; yearTo.value = String(hi); }   // keep From ≤ To
    engine.setFilter({ yearMin: lo > yMin ? lo : null, yearMax: hi < yMax ? hi : null }); updateBulkCount();
  };
  yearFrom.addEventListener("change", applyYears);
  yearTo.addEventListener("change", applyYears);
  $("simSlider").addEventListener("input", (e) => { const v = +e.target.value; $("simVal").textContent = v.toFixed(2); engine.setFilter({ sim: v }); });
  const enfBtn = $("enfToggle");
  enfBtn.addEventListener("click", () => { const on = !enfBtn.classList.contains("is-on"); enfBtn.classList.toggle("is-on", on); enfBtn.setAttribute("aria-pressed", String(on)); engine.setFilter({ enforcedOnly: on }); updateBulkCount(); });
  $("resetBtn").addEventListener("click", () => {
    typeSel.value = "all"; indSel.value = ""; cxSel.value = ""; dxSel.value = ""; scoreSel.value = ""; yearFrom.value = String(yMin); yearTo.value = String(yMax); $("simSlider").value = 0; $("simVal").textContent = "0.00"; enfBtn.classList.remove("is-on"); enfBtn.setAttribute("aria-pressed", "false");
    engine.setFilter({ type: "all", industry: "", enforcedOnly: false, sim: 0, cmp: null, dvi: null, score: null, yearMin: null, yearMax: null }); updateBulkCount();
  });
  updateBulkCount();

  // ── FILTER BAR HEIGHT SYNC ── the toolbar now wraps onto as many rows as the viewport needs, so
  // every filter/export/view control is always visible (no horizontal-scroll-wheel dependence).
  // Publish the bar's real rendered height to --filters-h so the constellation frame, hero console,
  // legend and finding-panel offsets track the bar exactly at any width.
  const filtersEl = $("filters");
  if (filtersEl) {
    const syncFiltersH = () => document.documentElement.style.setProperty("--filters-h", filtersEl.offsetHeight + "px");
    if ("ResizeObserver" in window) new ResizeObserver(syncFiltersH).observe(filtersEl);
    else window.addEventListener("resize", syncFiltersH);
    syncFiltersH();
  }

  // ── SHAREABLE COHORT DEFINITIONS ── capture the active filter set as a lossless URL and reconstruct
  // it on load by re-driving the SAME controls (so the exact existing filter logic is reused).
  const simSlider = $("simSlider");
  const readCohortMin = () => {
    const o = {};
    if (typeSel.value !== "all") o.t = typeSel.value;
    if (indSel.value) { const ii = manifest.industries.indexOf(indSel.value); if (ii >= 0) o.i = ii; }
    if (cxSel.value) o.cx = cxSel.value;
    if (dxSel.value) o.dx = dxSel.value;
    if (scoreSel.value) o.sc = scoreSel.value;
    if (enfBtn.classList.contains("is-on")) o.e = 1;
    const lo = +yearFrom.value, hi = +yearTo.value;
    if (lo > yMin || hi < yMax) o.y = [lo, hi];
    const sim = +simSlider.value; if (sim > 0) o.s = +sim.toFixed(2);
    return o;
  };
  const cohortURL = (view) => {
    const o = readCohortMin(); if (view) o.v = view;
    const token = encodeCohort(o);
    return location.origin + location.pathname + (token ? "#cohort=" + token : "");
  };
  // apply a decoded cohort by setting controls + dispatching their native events (validated; defensive)
  const applyCohortMin = (o) => {
    if (!o || typeof o !== "object") return;
    if (o.t != null && /^[0-5]$/.test(String(o.t))) { typeSel.value = String(o.t); typeSel.dispatchEvent(new Event("change")); }
    if (Number.isInteger(o.i) && manifest.industries[o.i]) { indSel.value = manifest.industries[o.i]; indSel.dispatchEvent(new Event("change")); }
    if (o.cx && o.cx in CX_VAL && o.cx !== "") { cxSel.value = o.cx; cxSel.dispatchEvent(new Event("change")); }
    if (o.dx && o.dx in DX_VAL && o.dx !== "") { dxSel.value = o.dx; dxSel.dispatchEvent(new Event("change")); }
    if (o.sc && ["scored", "mflag", "fhigh"].includes(o.sc)) { scoreSel.value = o.sc; scoreSel.dispatchEvent(new Event("change")); }
    if (o.e) { if (!enfBtn.classList.contains("is-on")) enfBtn.click(); }
    if (Array.isArray(o.y) && o.y.length === 2) {
      const lo = +o.y[0], hi = +o.y[1];
      if (isFinite(lo) && isFinite(hi)) {
        yearFrom.value = String(Math.min(Math.max(yMin, lo), yMax));
        yearTo.value = String(Math.min(Math.max(yMin, hi), yMax));
        yearFrom.dispatchEvent(new Event("change"));
      }
    }
    if (o.s != null && isFinite(+o.s)) { const v = Math.min(1, Math.max(0, +o.s)); simSlider.value = String(v); simSlider.dispatchEvent(new Event("input")); }
  };
  // human-readable, line-by-line cohort definition (sample-selection transparency)
  const cohortDefParts = () => {
    const d = filterDescription();
    return (d === "all disclosures (no filters applied)") ? [d] : d.split(" · ");
  };

  // paste
  const pasteModal = $("pasteModal");
  const openPaste = () => { setModal(pasteModal, true); $("pasteText").focus(); };
  const closePaste = () => setModal(pasteModal, false);
  $("pasteOpen").addEventListener("click", openPaste);
  $("pasteClose").addEventListener("click", closePaste);
  $("pasteRun").addEventListener("click", async () => {
    const text = $("pasteText").value.trim();
    if (text.length < 30) { $("pasteStatus").textContent = "paste at least a sentence or two"; return; }
    const runBtn = $("pasteRun"); runBtn.disabled = true;
    const status = (s) => { $("pasteStatus").textContent = s; };
    try {
      const nb = await paste.search(text, 10, status);
      status("done"); closePaste();
      engine.selectVirtual(nb, "Your pasted disclosure", text.replace(/\s+/g, " ").slice(0, 540));
    } catch (e) {
      console.error(e); status("embedding failed: " + (e.message || e));
    } finally { runBtn.disabled = false; }
  });

  // bulk export of the current filtered set (CSV default, XLSX secondary; similarity filled when a query is active)
  const BULK_HEADERS = ["company", "cik", "ticker", ...XWALK_HEADERS, "footnote_type", "similarity", "enforced", "accession", "edgar_url", "gunning_fog", "avg_sentence_length", "word_count", "complex_word_pct", "complexity_vs_industry", "distinctiveness", "distinctiveness_vs_industry", ...SCORE_HEADERS];
  const TFULL = { 0: "revenue recognition", 1: "going concern", 2: "related-party", 3: "critical audit matter", 4: "mda", 5: "risk factors" };
  const CMP_TEXT = { "-1": "below", "0": "near", "1": "above" };
  const DVI_TEXT = { "0": "typical", "1": "distinctive", "2": "highly_distinctive" };
  async function buildFilteredRows() {
    const idxs = engine.filteredIndices(); if (!idxs.length) return null;
    await ensureScores();   // financial-score columns
    let sims = null;
    if (currentQuery) {
      await paste.ensureEmbeddings();
      const qvec = currentQuery.type === "vec" ? currentQuery.vec : paste.vecAt(currentQuery.idx);
      if (qvec) { sims = new Map(); for (const i of idxs) sims.set(i, paste.cosine(qvec, i)); }
    }
    const recs = idxs.map((i) => ({ n: nodes[i], sv: sims ? sims.get(i) : null }));
    if (sims) recs.sort((a, b) => b.sv - a.sv); else recs.sort((a, b) => a.n.name.localeCompare(b.n.name));
    const rows = recs.map((r) => [r.n.name, r.n.cik, r.n.tk, ...xwalkCells(r.n), TFULL[r.n.t], r.sv == null ? "" : r.sv.toFixed(4), r.n.e ? "yes" : "no", r.n.acc, r.n.url, r.n.fog, r.n.asl, r.n.wc, r.n.cwp, CMP_TEXT[r.n.cmp], r.n.dst, DVI_TEXT[r.n.dvi], ...scoreCells(r.n)]);
    const fl = engine.filter;
    const TYPE_TAG = { "0": "revrec", "1": "goingconcern", "2": "relatedparty", "3": "cam", "4": "mda", "5": "riskfactors" };
    const tag = [TYPE_TAG[fl.type] || "all",
      fl.industry ? fl.industry.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 24) : "", fl.enforcedOnly ? "enforced" : ""].filter(Boolean).join("_");
    return { rows, base: "disclosure-atlas_" + tag + "_" + rows.length + "rows" };
  }
  const wireBulk = (btn, kind) => btn.addEventListener("click", async () => {
    const label = btn.innerHTML; btn.disabled = true; btn.textContent = "↓ …";
    try {
      const b = await buildFilteredRows(); if (!b) return;
      if (kind === "xlsx") await downloadXLSX(b.base + ".xlsx", "filtered", BULK_HEADERS, b.rows);
      else downloadCSV(b.base + ".csv", BULK_HEADERS, b.rows);
    } catch (e) { console.error(e); }
    finally { btn.disabled = false; btn.innerHTML = label; updateBulkCount(); }
  });
  wireBulk($("bulkCsv"), "csv");
  wireBulk($("bulkXlsx"), "xlsx");

  // COHORT / BATCH ANALYSIS — aggregate stats over the current filter set (the cohort definition)
  const filterDescription = () => {
    const txt = (sel) => sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : "";
    const p = [];
    if (typeSel.value !== "all") p.push("type: " + txt(typeSel));
    if (indSel.value) p.push("industry: " + indSel.value);
    if (cxSel.value) p.push("complexity " + cxSel.value + " industry median");
    if (dxSel.value) p.push(txt(dxSel).toLowerCase());
    if (scoreSel.value) p.push(txt(scoreSel).toLowerCase());
    const lo = +yearFrom.value, hi = +yearTo.value;
    if (lo > yMin || hi < yMax) p.push("filing years " + lo + "-" + hi);
    const sim = +$("simSlider").value; if (sim > 0) p.push("similarity ≥ " + sim.toFixed(2));
    if (enfBtn.classList.contains("is-on")) p.push("enforcement history only");
    return p.length ? p.join(" · ") : "all disclosures (no filters applied)";
  };

  // COPY IMPORT CODE — ready-to-run Stata/R/Python loaders for THIS cohort's panel.csv (CIK kept as a
  // string, dates parsed, NA preserved) + the CIK→GVKEY/PERMNO join recipe. Kills the merge-friction step.
  const cohortPanelStats = () => {
    const idxs = engine.filteredIndices();
    const cy = new Set(), co = new Set();
    for (const i of idxs) { const n = nodes[i]; co.add(n.cik); if (n.pfy != null) cy.add(n.cik + "|" + n.pfy); }
    return { nObs: cy.size, nCompanies: co.size };
  };
  const importCode = new ImportCode({
    modal: $("importModal"), body: $("importBody"), setModal,
    getMeta: () => ({ filterDesc: filterDescription(), ...cohortPanelStats() }),
  });
  const openImport = () => importCode.open();
  window.__atlas.importCode = importCode;

  const cohort = new Cohort({
    modal: $("cohortModal"), body: $("cohortBody"), setModal, engine, paste, nodes,
    getRows: () => buildFilteredRows(), headers: BULK_HEADERS,
    exporters: { downloadCSV, downloadXLSX }, describe: filterDescription, openImport,
  });
  $("cohortBtn").addEventListener("click", () => cohort.open());
  window.__atlas.cohort = cohort;

  // PHASE 4 — DISCLOSURE SHIFTS: rank the largest year-over-year disclosure-language change (filter-composable)
  const changes = new Changes({
    modal: $("changesModal"), body: $("changesBody"), setModal, engine, nodes, paste,
    describe: filterDescription, openCompare, downloadCSV,
  });
  $("changesBtn").addEventListener("click", () => changes.open());
  window.__atlas.changes = changes;

  // PHASE 5 — DESCRIPTIVE INTERSECTION: companies unusual on multiple INDEPENDENT descriptive measures.
  // Not a risk score / ranking / prediction; each measure shown separately. Composes with filters.
  const openProfile = (cik) => { document.querySelectorAll(".modal.is-open").forEach((m) => setModal(m, false)); profile.open(cik); };
  const intersect = new Intersect({
    modal: $("intersectModal"), body: $("intersectBody"), setModal, engine, nodes, paste,
    describe: filterDescription, openProfile, downloadCSV,
  });
  $("intersectBtn").addEventListener("click", () => intersect.open());
  window.__atlas.intersect = intersect;

  // DATA TABLE — the analysis-ready company-year panel for the current cohort as a sortable, virtualized
  // grid; a live preview of exactly what the panel .zip exports. Descriptive only; no risk score.
  const table = new Table({
    modal: $("tableModal"), body: $("tableBody"), setModal, engine, nodes,
    describe: filterDescription, openProfile, cohortLink: (v) => cohortURL(v), openImport,
  });
  $("tableBtn").addEventListener("click", () => table.open());
  window.__atlas.table = table;

  // TABLE 1 — publication-style descriptive statistics for the active cohort (one row per measure ×
  // N/mean/median/SD/min/p25/p75/max). Descriptive only; financial measures over deduped company-years.
  const table1 = new Table1({
    modal: $("table1Modal"), body: $("table1Body"), setModal, engine, nodes, describe: filterDescription,
    cohortLink: (v) => cohortURL(v),
  });
  $("table1Btn").addEventListener("click", () => table1.open());
  window.__atlas.table1 = table1;

  // CORRELATION MATRIX — pre-modeling pairwise correlations across measures (company-year unit)
  const corr = new Corr({
    modal: $("corrModal"), body: $("corrBody"), setModal, engine, nodes,
    describe: filterDescription, cohortLink: (v) => cohortURL(v),
  });
  $("corrBtn").addEventListener("click", () => corr.open());
  window.__atlas.corr = corr;

  // SYSTEMATIC SCREEN — pre-registered multiple-hypothesis screening (safeguards non-negotiable):
  // full family enumerated + registered BEFORE results; every test always reported; Bonferroni + BH
  // FDR mandatory; survivors = candidates for confirmation, never findings; Spearman (robust) only.
  const screen = new Screen({
    modal: $("screenModal"), body: $("screenBody"), setModal, engine, nodes,
    describe: filterDescription, cohortLink: (v) => cohortURL(v),
  });
  $("screenBtn").addEventListener("click", () => screen.open());
  window.__atlas.screen = screen;

  // SHARE COHORT — capture the active filter set as a reproducible shareable link
  const share = new Share({
    modal: $("shareModal"), body: $("shareBody"), setModal,
    getInfo: () => {
      const idxs = engine.filteredIndices(); const co = new Set(), cy = new Set();
      for (const i of idxs) { const n = nodes[i]; co.add(n.cik); if (n.pfy != null) cy.add(n.cik + "|" + n.pfy); }
      return { def: filterDescription(), defParts: cohortDefParts(), nF: idxs.length, nCY: cy.size, nCO: co.size,
        url: cohortURL(), urlT1: cohortURL("t1"), urlDT: cohortURL("dt"), urlCR: cohortURL("cr") };
    },
  });
  $("shareBtn").addEventListener("click", () => share.open());
  window.__atlas.share = share;
  window.__atlas.cohortURL = cohortURL;   // also used by Table 1 / Data Table share-link buttons

  // R2: compare two disclosures head-to-head (cosine of two in-browser embeddings)
  const compareModal = $("compareModal");
  $("compareBtn").addEventListener("click", () => { setModal(compareModal, true); $("cmpA").focus(); });
  $("compareClose").addEventListener("click", () => setModal(compareModal, false));
  $("cmpRun").addEventListener("click", async () => {
    const a = $("cmpA").value.trim(), b = $("cmpB").value.trim();
    if (a.length < 20 || b.length < 20) { $("cmpStatus").textContent = "paste a sentence or two in each"; return; }
    const btn = $("cmpRun"); btn.disabled = true; const st = (s) => { $("cmpStatus").textContent = s; };
    try {
      const [va, vb] = [await paste.embed(a, st), await paste.embed(b, st)];
      let dot = 0; for (let i = 0; i < va.length; i++) dot += va[i] * vb[i];
      const cos = Math.max(-1, Math.min(1, dot)); st("done");
      $("cmpScore").textContent = cos.toFixed(4);
      $("cmpBarFill").style.width = Math.round(Math.max(0, cos) * 100) + "%";
      $("cmpReading").textContent = "Cosine " + cos.toFixed(4) + ": " + (cos >= 0.9 ? "very close: these read almost the same way." : cos >= 0.75 ? "close: clear shared phrasing/structure." : cos >= 0.5 ? "moderate: some shared concepts." : "distant: largely different language.") + " Resemblance only.";
      $("cmpResult").hidden = false;
    } catch (e) { console.error(e); st("embedding failed: " + (e.message || e)); }
    finally { btn.disabled = false; }
  });

  // A1: shortlist modal — view / export / clear the pinned working set
  const shortlistModal = $("shortlistModal");
  const SL_HEADERS = ["company", "cik", "ticker", ...XWALK_HEADERS, "footnote_type", "enforced", "accession", "edgar_url", "gunning_fog", "avg_sentence_length", "word_count", "complex_word_pct", "complexity_vs_industry", "distinctiveness", "distinctiveness_vs_industry", ...SCORE_HEADERS];
  const slRows = () => shortlist.ids.map((i) => { const n = nodes[i]; return [n.name, n.cik, n.tk, ...xwalkCells(n), TFULL[n.t], n.e ? "yes" : "no", n.acc, n.url, n.fog, n.asl, n.wc, n.cwp, CMP_TEXT[n.cmp], n.dst, DVI_TEXT[n.dvi], ...scoreCells(n)]; });
  function renderShortlist() {
    const body = $("shortlistBody");
    if (!shortlist.ids.length) { body.innerHTML = '<p class="caveat">No pinned disclosures yet. Open a finding and use “+ SHORTLIST” to add the nearest match.</p>'; return; }
    body.innerHTML = shortlist.ids.map((i) => { const n = nodes[i]; return `<div class="sl-row"><div><div class="sl-name">${esc(n.name)} ${n.e ? '<span class="amber mono" style="font-size:10px">· enforced</span>' : ""}</div><div class="sl-meta mono">${TFULL[n.t]} · CIK ${esc(n.cik)} · <a href="${esc(n.url)}" target="_blank" rel="noopener" style="color:#5BA4DD">EDGAR ↗</a></div></div><button class="act-btn mono" data-sl="${i}" type="button">remove</button></div>`; }).join("");
    body.querySelectorAll("[data-sl]").forEach((b) => b.addEventListener("click", () => { shortlist.remove(+b.getAttribute("data-sl")); renderShortlist(); }));
  }
  $("shortlistBtn").addEventListener("click", () => { renderShortlist(); setModal(shortlistModal, true); });
  $("shortlistClose").addEventListener("click", () => setModal(shortlistModal, false));
  $("slClear").addEventListener("click", () => { shortlist.clear(); renderShortlist(); });
  $("slCsv").addEventListener("click", async () => { if (!shortlist.ids.length) return; await ensureScores(); downloadCSV("disclosure-atlas_shortlist_" + shortlist.ids.length + "rows.csv", SL_HEADERS, slRows()); });
  $("slXlsx").addEventListener("click", async () => { if (!shortlist.ids.length) return; $("slStatus").textContent = "building…"; try { await ensureScores(); await downloadXLSX("disclosure-atlas_shortlist_" + shortlist.ids.length + "rows.xlsx", "shortlist", SL_HEADERS, slRows()); $("slStatus").textContent = ""; } catch (e) { $("slStatus").textContent = "failed"; } });

  // resizable finding panel — drag the left edge (or arrow keys); width remembered client-side only
  const panelEl = $("panel"), handle = $("panelResize");
  const MINW = 360, maxW = () => Math.min(860, Math.round(window.innerWidth * 0.96));
  const setPanelWidth = (w) => { w = Math.max(MINW, Math.min(maxW(), w)); panelEl.style.width = w + "px"; try { localStorage.setItem("atlas.panelW", String(Math.round(w))); } catch (_) {} };
  const savedW = parseInt(localStorage.getItem("atlas.panelW") || "", 10);
  if (savedW && window.innerWidth > 720) setPanelWidth(savedW);
  let resizing = false;
  handle.addEventListener("pointerdown", (e) => { if (window.innerWidth <= 720) return; resizing = true; panelEl.classList.add("resizing"); try { handle.setPointerCapture(e.pointerId); } catch (_) {} e.preventDefault(); });
  handle.addEventListener("pointermove", (e) => { if (resizing) setPanelWidth(window.innerWidth - e.clientX); });
  const endResize = (e) => { if (!resizing) return; resizing = false; panelEl.classList.remove("resizing"); try { handle.releasePointerCapture(e.pointerId); } catch (_) {} };
  handle.addEventListener("pointerup", endResize); handle.addEventListener("pointercancel", endResize);
  handle.addEventListener("keydown", (e) => { const cur = panelEl.getBoundingClientRect().width; if (e.key === "ArrowLeft") { setPanelWidth(cur + 28); e.preventDefault(); } else if (e.key === "ArrowRight") { setPanelWidth(cur - 28); e.preventDefault(); } });

  // methodology / about
  const aboutModal = $("aboutModal");
  const c = manifest.corpus, v = manifest.validation;
  const forms = Object.entries(c.filing_forms).map(([k, n]) => k + " " + n.toLocaleString()).join(" · ");
  const cell = (num, cap) => `<div class="method-cell"><div class="method-num">${num}</div><div class="method-cap">${esc(cap)}</div></div>`;
  $("aboutBody").innerHTML = `
    <p><span class="k">WHAT THIS IS</span>A comparative disclosure <strong>semantic search</strong> instrument. It places real public-company footnotes by how their language resembles one another, so you can find concept-level matches that keyword search misses.</p>
    <p><span class="k">CORPUS · SOURCE: U.S. SEC EDGAR</span>${esc(forms)}, filed ${esc(c.year_min)}-${esc(c.year_max)}. Six disclosure types: revenue recognition (${(c.footnotes_by_type.rev_rec||0).toLocaleString()}), going concern (${(c.footnotes_by_type.going_concern||0).toLocaleString()}), related-party (${(c.footnotes_by_type.related_party||0).toLocaleString()}), critical audit matters (${(c.footnotes_by_type.cam||0).toLocaleString()}), MD&amp;A (${(c.footnotes_by_type.mda||0).toLocaleString()}), and risk factors (${(c.footnotes_by_type.risk_factors||0).toLocaleString()}).</p>
    <div class="method-grid">
      ${cell(c.footnotes.toLocaleString(), "footnotes embedded")}
      ${cell(c.companies_in_corpus.toLocaleString(), "companies in corpus")}
      ${cell(c.filings.toLocaleString(), "10-K filings")}
      ${cell(c.companies_enforced.toLocaleString() + " / " + c.companies_universe.toLocaleString(), "with SEC enforcement history")}
    </div>
    <p><span class="k">METHOD</span>Each footnote is embedded with <strong>bge-small</strong> (the same ONNX model runs in your browser for the paste feature). Similarity is <strong>cosine</strong> in that 384-dimension space; the map is a UMAP projection of it. ${c.aaer_releases.toLocaleString()} SEC AAER releases supply the enforcement overlay.</p>
    <div class="method-finding">
      <p style="margin:0 0 8px"><span class="k">VALIDATION · STATED PLAINLY</span>${esc(v.headline)}</p>
      <p style="margin:0 0 6px;font-size:12.5px">${esc(v.rev_rec)}</p>
      <p style="margin:0 0 6px;font-size:12.5px">${esc(v.going_concern)}</p>
      ${v.new_types ? `<p style="margin:0 0 6px;font-size:12.5px">${esc(v.new_types)}</p>` : ""}
      <p style="margin:0;font-size:12.5px">${esc(v.engine)}</p>
    </div>
    <p><span class="k">STANCE</span>${esc(v.stance)}</p>
    <p><span class="k">FINANCIAL-QUALITY SCREENS · A SECOND PILLAR</span>Alongside disclosure language, the instrument computes two <strong>published, peer-reviewed academic screening models</strong> from SEC XBRL structured financials, per company-fiscal-year: the <strong>Beneish M-Score</strong> (Beneish 1999) and the <strong>Dechow F-Score</strong> (Dechow, Ge, Larson &amp; Sloan 2011, Model 1). Each is shown with its full <strong>component breakdown</strong> (the ratios that drive the number) and its published limitations. Coverage: Beneish M for 6,252 company-years, Dechow F for 5,782, across ~1,623 companies; company-years with insufficient inputs (e.g. financial-sector firms without COGS or an unclassified balance sheet) get <strong>no score</strong>, never a fabricated one.</p>
    <div class="method-finding">
      <p style="margin:0 0 8px"><span class="k">THESE ARE SCREENS, NOT VERDICTS, AND NOT MY JUDGMENT</span>They are the outputs of established academic models, presented as such: named, cited, with drivers and known limits. Those limits include documented high false-positive rates, legitimate M&amp;A or restructuring moving the indices (an acquisition lifts the asset-quality index, for example), and sample/era dependence.</p>
      <p style="margin:0;font-size:12.5px">This dataset <strong>cannot re-validate</strong> the models: SEC XBRL begins ~2009 but most enforcement cases predate that, and in this sample enforced and clean scores do not separate. So the basis that these models carry signal is the <strong>published literature</strong>, presented as such. This is distinct from, and consistent with, the disclosure-language null above.</p>
    </div>
    <p><span class="k">SYSTEMATIC SCREEN · PRE-REGISTERED MULTIPLE-HYPOTHESIS TESTING</span>The <strong>⌗ SYSTEMATIC SCREEN</strong> view runs an integrity-first exploratory screen: the full test family (disclosure measures × financial measures × pre-specified subgroups) is <strong>enumerated and registered before any result is computed</strong>, every test is always reported (sorting reorders, nothing is hidden), <strong>Bonferroni and Benjamini&ndash;Hochberg FDR correction are mandatory</strong> across the whole family, the effect size (Spearman ρ) sits beside every p-value, and anything that survives is labeled a <strong>candidate association that warrants confirmation on independent data</strong>, never a finding. Rank-based statistics throughout (the financial screens contain documented extreme outliers). Exploratory screening generates hypotheses, not conclusions.</p>
    <p><span class="k">SOURCES & REPRODUCIBILITY</span>Every company, CIK, similarity score, and filing link is real and resolves to the actual document on sec.gov. ${findings.length} featured pairs carry a pre-generated Claude explanation; all other pairs are shown by similarity only. Financial scores are reproducible from their stored components and the cited formulas. Export any result set (now incl. M/F scores + components) to CSV or Excel, or copy a stable citation, from the finding panel.</p>
    <div style="margin-top:4px"><button id="reproBtn" class="act-btn mono" type="button">↗ full methods &amp; reproducibility</button></div>`;
  $("aboutBtn").addEventListener("click", () => setModal(aboutModal, true));
  $("aboutClose").addEventListener("click", () => setModal(aboutModal, false));

  // METHODS & REPRODUCIBILITY — comprehensive citable resource (panel + downloadable .md)
  const methodsModal = $("methodsModal");
  let _methodsRendered = false;
  const openMethods = () => {
    if (!_methodsRendered) { $("methodsBody").innerHTML = renderMethodsHTML(manifest, findings.length); _methodsRendered = true; }
    setModal(methodsModal, true); $("methodsBody").scrollTop = 0; setHash("methods");
  };
  $("reproBtn") && $("aboutBody").querySelector("#reproBtn").addEventListener("click", () => { setModal(aboutModal, false); openMethods(); });
  $("methodsClose").addEventListener("click", () => { setModal(methodsModal, false); setHash(""); });
  $("methodsDl").addEventListener("click", () => downloadText(buildMethodsMD(manifest, findings.length), "disclosure-atlas_methods.md", "text/markdown"));
  window.__atlas.openMethods = openMethods;

  // keyboard
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const open = document.querySelector(".modal.is-open");
    if (open) { setModal(open, false); setHash(""); }   // clear any overlay hash (#methods / #c=) on close, like the ✕ buttons
    else if ($("panel").classList.contains("is-open")) closeFinding();
    else if (!driftBar.hidden) closeDrift();
  });
  document.querySelectorAll(".modal").forEach((m) => m.addEventListener("click", (e) => { if (e.target === m) { setModal(m, false); setHash(""); } }));

  // deep links: #demo opens a featured pair; #f=qi.mi restores a shared finding
  const applyHash = () => {
    const h = (location.hash || "").replace(/^#/, "");
    if (h.toLowerCase() === "demo") { const f = firstByType(null, true); if (f) engine.selectPair(f.qi, f.mi); return; }
    const m = h.match(/^f=(\d+)\.(\d+)$/);
    if (m) { const qi = +m[1], mi = +m[2]; if (qi >= 0 && qi < nodes.length && mi >= 0 && mi < nodes.length) engine.selectPair(qi, mi); return; }
    const cm = h.match(/^c=(\d{1,10})$/);   // shareable company profile
    if (cm) { profile.open(cm[1].padStart(10, "0")); return; }
    const coh = h.match(/^cohort=(.*)$/);   // shareable cohort definition (reconstructs the exact sample)
    if (coh) {
      const o = decodeCohort(coh[1]);       // null on a malformed link → ignored (graceful degrade)
      if (o) { applyCohortMin(o); if (o.v === "t1") table1.open(); else if (o.v === "dt") table.open(); else if (o.v === "ch") cohort.open(); else if (o.v === "cr") corr.open(); else if (o.v === "sc") screen.open(); }
      return;
    }
    if (h.toLowerCase() === "methods") openMethods();   // shareable methods & reproducibility doc
  };
  if (location.hash) setTimeout(applyHash, 200);
  // also react to real hash navigations (pasting a shared link into the same tab, back/forward).
  // our own setHash() uses history.replaceState, which does NOT fire hashchange — so no feedback loop.
  window.addEventListener("hashchange", applyHash);
}

function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }


function renderFallback(findings, nodes, excerpts, aaer) {
  $("listFallback").hidden = false;
  const wrap = $("fallbackList");
  wrap.innerHTML = findings.map((f) => {
    const a = nodes[f.qi], b = nodes[f.mi];
    const url = (n) => (n.url || "").startsWith("https://www.sec.gov/") ? n.url : ("https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=" + n.cik + "&type=10-K");
    return `<div class="fb-row">
      <div class="fb-name">${esc(a.name)} ${a.e ? "· enforced" : ""} &nbsp;↔&nbsp; ${esc(b.name)} ${b.e ? "· enforced" : ""}</div>
      <div class="fb-meta">cosine ${f.similarity} · ${esc(f.type)} · CIK ${esc(a.cik)} ↗ <a href="${esc(url(a))}" target="_blank" rel="noopener" style="color:#5BA4DD">EDGAR</a> · CIK ${esc(b.cik)} ↗ <a href="${esc(url(b))}" target="_blank" rel="noopener" style="color:#5BA4DD">EDGAR</a></div>
      <p style="color:#9AA7B6;font-size:13px;line-height:1.6;margin:8px 0 0">${esc(f.explanation)}</p>
    </div>`;
  }).join("");
}

boot();
