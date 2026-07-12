// Financial-quality pillar (Chapter E) — renders the two PUBLISHED academic screens
// (Beneish M-Score 1999; Dechow F-Score 2011, Model 1) component-first, for a company.
// Honest framing only: named + cited academic SCREENS, with component breakdowns + plainly-stated
// limitations. Never "our risk score"; no alarm/red colors; amber stays enforcement-only.
let _scoresP = null;
let SCORES = {};

export function ensureScores() {
  return _scoresP || (_scoresP = fetch("./data/scores.json")
    .then((r) => (r.ok ? r.json() : {}))
    .then((d) => { SCORES = d; return d; })
    .catch(() => ({})));
}
export const companyScores = (cik) => SCORES[cik] || null;
export const scoreForYear = (cik, fy) => {
  const c = SCORES[cik]; if (!c) return null;
  return c.years.find((y) => y.y === fy) || null;
};

// published coefficients + neutral baselines (for the "what drives this score" emphasis)
const M_COEF = { DSRI: 0.920, GMI: 0.528, AQI: 0.404, SGI: 0.892, DEPI: 0.115, SGAI: -0.172, LVGI: -0.327, TATA: 4.679 };
const M_KEYS = ["DSRI", "GMI", "AQI", "SGI", "DEPI", "SGAI", "LVGI", "TATA"];
const M_LABEL = { DSRI: "DSRI", GMI: "GMI", AQI: "AQI", SGI: "SGI", DEPI: "DEPI", SGAI: "SGAI", LVGI: "LVGI", TATA: "TATA" };
const M_FULL = {
  DSRI: "Days sales in receivables", GMI: "Gross margin index", AQI: "Asset quality index",
  SGI: "Sales growth index", DEPI: "Depreciation index", SGAI: "SG&A index",
  LVGI: "Leverage index", TATA: "Total accruals / total assets",
};
const F_COEF = { rsst_accruals: 0.790, ch_receivables: 2.518, ch_inventory: 1.191, soft_assets: 1.979, ch_cash_sales: 0.171, ch_roa: -0.932, issuance: 1.029 };
const F_KEYS = ["rsst_accruals", "ch_receivables", "ch_inventory", "soft_assets", "ch_cash_sales", "ch_roa", "issuance"];
const F_LABEL = { rsst_accruals: "RSST accruals", ch_receivables: "Δ receivables", ch_inventory: "Δ inventory", soft_assets: "Soft assets", ch_cash_sales: "Δ cash sales", ch_roa: "Δ ROA", issuance: "Issuance" };

export const M_THRESHOLD = -1.78;
const M_OUTLIER = 10, F_OUTLIER = 20;
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

export const CITE_M = "Beneish (1999), Financial Analysts Journal";
export const CITE_F = "Dechow, Ge, Larson & Sloan (2011), Contemporary Accounting Research, Model 1";
const LIMIT_M = "Screen, not a verdict. Beneish (1999) notes a high false-positive rate. Legitimate M&A or restructuring can spike the indices (an acquisition lifts AQI, for example). The model is sample- and era-dependent (1982 to 1992) and weak for financial / no-COGS firms.";
const LIMIT_F = "Screen, not a verdict. F>1 means above the unconditional misstatement rate, not a probability of fraud. The base rate is tiny, so even elevated values yield many false positives. The model was built on AAER firms from 1982 to 2005.";
export const PILLAR_NOTE = "These are outputs of established, peer-reviewed academic screening models over reported financials, shown with their drivers and published limitations. They are screens, not verdicts, and not my judgment. This dataset cannot re-validate them: XBRL begins around 2009, most enforcement cases predate that, and enforced and clean scores do not separate in this sample. So the basis that these models carry signal is the published literature, presented as such. This is distinct from, and consistent with, the disclosure-language null.";

// signed contribution of each component to the score, relative to its neutral baseline
function mContribs(mc) {
  return M_KEYS.map((k) => ({ k, v: mc[k], c: M_COEF[k] * (mc[k] - (k === "TATA" ? 0 : 1)) }));
}
function fContribs(fc) {
  return F_KEYS.map((k) => ({ k, v: fc[k], c: F_COEF[k] * fc[k] }));
}
// index of the single largest POSITIVE contributor (the main thing lifting the score)
function topDriver(arr) {
  let bi = -1, bv = 1e-9;
  arr.forEach((a, i) => { if (a.c > bv) { bv = a.c; bi = i; } });
  return bi;
}

function fmt(v, d = 2) { return (v == null || !isFinite(v)) ? "—" : Number(v).toFixed(d); }

function compGrid(items, fmtKey, top) {
  return `<div class="fin-grid">` + items.map((a, i) => {
    const drv = i === top;
    const label = fmtKey(a.k);
    const val = a.k === "issuance" ? (a.v ? "yes" : "no") : fmt(a.v);
    return `<div class="fin-comp${drv ? " is-driver" : ""}">
      <span class="fin-comp-k mono">${esc(label)}</span>
      <span class="fin-comp-v mono">${drv ? '<span class="fin-drv" title="largest driver of this score">▲</span>' : ""}${val}</span>
    </div>`;
  }).join("") + `</div>`;
}

function mTile(year) {
  const out = Math.abs(year.m) > M_OUTLIER;
  const flag = year.mf === 1;
  const contribs = mContribs(year.mc);
  const grid = compGrid(contribs.map((a) => ({ k: a.k, v: a.v, c: a.c })), (k) => M_LABEL[k], topDriver(contribs));
  return `<div class="fin-tile">
    <div class="fin-tile-head">
      <span class="fin-tile-name mono">BENEISH M-SCORE</span>
      <span class="fin-tile-val mono">${out ? '<span class="fin-out" title="degenerate: tiny-denominator inputs. A real formula output, interpret with caution">≫</span>' : ""}${fmt(year.m)}</span>
    </div>
    <div class="fin-tile-cite">${esc(CITE_M)}</div>
    ${flag ? `<div class="fin-pill mono" title="The model's published cutoff. A screen, not a verdict.">▲ ABOVE ${M_THRESHOLD} THRESHOLD</div>` : `<div class="fin-pill is-quiet mono">below ${M_THRESHOLD} threshold</div>`}
    ${grid}
    ${out ? `<div class="fin-limits">Degenerate value from near-zero denominators. It is shown verbatim (a real formula output), not a meaningful magnitude.</div>` : ""}
    <div class="fin-limits">${esc(LIMIT_M)}</div>
  </div>`;
}

function fTile(year) {
  const out = year.f > F_OUTLIER;
  const bin = year.f > 2.45 ? "high vs unconditional rate" : year.f > 1.4 ? "substantial vs unconditional rate" : year.f > 1.0 ? "above unconditional rate" : "at / below unconditional rate";
  const contribs = fContribs(year.fc);
  const grid = compGrid(contribs.map((a) => ({ k: a.k, v: a.v, c: a.c })), (k) => F_LABEL[k], topDriver(contribs));
  return `<div class="fin-tile">
    <div class="fin-tile-head">
      <span class="fin-tile-name mono">DECHOW F-SCORE</span>
      <span class="fin-tile-val mono">${out ? '<span class="fin-out" title="degenerate: tiny-denominator inputs. A real formula output, interpret with caution">≫</span>' : ""}${fmt(year.f)}</span>
    </div>
    <div class="fin-tile-cite">${esc(CITE_F)}</div>
    <div class="fin-pill is-quiet mono">${esc(bin)}</div>
    ${grid}
    ${out ? `<div class="fin-limits">Degenerate value from near-zero denominators. It is shown verbatim (a real formula output), not a meaningful magnitude.</div>` : ""}
    <div class="fin-limits">${esc(LIMIT_F)}</div>
  </div>`;
}

function noTile(name, cite, year) {
  const reason = year && year.note ? esc(year.note.replace(/beneish:|dechow:/g, "").trim()) : "insufficient inputs";
  return `<div class="fin-tile fin-none"><div class="fin-tile-head"><span class="fin-tile-name mono">${name}</span><span class="fin-tile-val mono fin-na">no score</span></div><div class="fin-tile-cite">${esc(cite)}</div><div class="fin-limits">No score for FY${year ? year.y : ""}: ${reason} (not zero).</div></div>`;
}
// reusable: the M + F tiles for one fiscal year (used by the finding panel AND the company profile)
export function yearTilesHTML(year) {
  const m = year && year.m != null ? mTile(year) : noTile("BENEISH M-SCORE", CITE_M, year);
  const f = year && year.f != null ? fTile(year) : noTile("DECHOW F-SCORE", CITE_F, year);
  return `<div class="fin-tiles">${m}${f}</div>`;
}

function history(comp, focalY) {
  const ys = comp.years.filter((y) => y.m != null);
  if (ys.length < 2) return "";
  const cells = ys.map((y) => `<span class="fin-hist-cell${y.y === focalY ? " is-focal" : ""} mono" title="FY${y.y} Beneish M ${fmt(y.m)}">${String(y.y).slice(2)}<b>${fmt(y.m, 1)}</b></span>`).join("");
  return `<div class="fin-hist"><span class="fin-hist-lab mono">M BY FISCAL YEAR</span><div class="fin-hist-row">${cells}</div></div>`;
}

// the full financial-quality section for the QUERY company of a finding.
// pfy = the disclosure's own fiscal year (from its filing's period_of_report), passed from the node.
export function renderFinancials(query, pfy) {
  if (query.pasted || !query.cik) {
    return `<div class="section-label mono">FINANCIAL-QUALITY SCREENS</div>
      <div class="caveat">Financial screens require a selected company. They are not available for pasted text.</div>`;
  }
  const comp = companyScores(query.cik);
  const head = `<div class="section-label mono">FINANCIAL-QUALITY SCREENS · ${esc(comp ? comp.name || query.name : query.name)}</div>`;
  if (!comp) {
    return head + `<div class="caveat">No financial screens for this company: no SEC XBRL company-facts are available (typically a pre-XBRL, delisted, or foreign filer). No score is shown rather than a fabricated one.</div>`;
  }
  let focal = (pfy != null) ? comp.years.find((y) => y.y === pfy) : null;
  let focalNote = "";
  if (!focal || (focal.m == null && focal.f == null)) {
    const scored = comp.years.filter((y) => y.m != null || y.f != null);
    if (scored.length) {
      const latest = scored[scored.length - 1];
      if (focal && focal.m == null && focal.f == null) {
        focalNote = `FY${pfy} (this disclosure's year) had insufficient data${focal.note ? ": " + esc(focal.note.replace(/beneish:|dechow:/g, "").trim()) : ""}. Showing FY${latest.y}.`;
      } else if (pfy != null) {
        focalNote = `No score for FY${pfy}; showing nearest available, FY${latest.y}.`;
      }
      focal = latest;
    } else {
      return head + `<div class="caveat">This company has SEC financials but no company-year had sufficient inputs for either model (e.g. financial-sector firm without COGS / unclassified balance sheet). No score is shown.</div>`;
    }
  }
  const fy = focal.y;
  const tiles = `<div class="fin-tiles">
    ${focal.m != null ? mTile(focal) : `<div class="fin-tile fin-none"><div class="fin-tile-head"><span class="fin-tile-name mono">BENEISH M-SCORE</span><span class="fin-tile-val mono fin-na">no score</span></div><div class="fin-tile-cite">${esc(CITE_M)}</div><div class="fin-limits">Insufficient data for FY${fy}. No score (not zero).</div></div>`}
    ${focal.f != null ? fTile(focal) : `<div class="fin-tile fin-none"><div class="fin-tile-head"><span class="fin-tile-name mono">DECHOW F-SCORE</span><span class="fin-tile-val mono fin-na">no score</span></div><div class="fin-tile-cite">${esc(CITE_F)}</div><div class="fin-limits">Insufficient data for FY${fy}. No score (not zero).</div></div>`}
  </div>`;
  // built-in worked example: why components matter (a textbook false positive)
  const worked = (query.cik === "0000002488" && fy === 2022)
    ? `<div class="fin-worked"><span class="fin-worked-k mono">WORKED EXAMPLE · WHY COMPONENTS MATTER</span>AMD's FY2022 M-Score crosses the threshold, but the breakdown shows it is driven almost entirely by <strong>AQI ≈ 2.99</strong> (the asset-quality index). That is the balance-sheet jump from the <strong>Xilinx acquisition</strong> (total assets went from about $9B to $68B, mostly goodwill &amp; intangibles), not earnings management. It is a textbook Beneish <strong>false positive from legitimate M&amp;A</strong>, and it is visible only because the components are shown.</div>`
    : "";
  return head
    + `<div class="fin-eyebrow mono">FISCAL YEAR ${fy}${focalNote ? ' · <span class="fin-focalnote">' + focalNote + "</span>" : ""}</div>`
    + tiles
    + worked
    + history(comp, fy)
    + `<div class="caveat fin-honesty">${esc(PILLAR_NOTE)}</div>`;
}

// compact micro-readout for a company cell in the two-company tile (uses node fields, synchronous)
export function microScore(node) {
  if (!node || (node.ms == null && node.fs == null)) return "";
  const parts = [];
  if (node.ms != null) parts.push(`M ${fmt(node.ms)}${node.mflag ? "▲" : ""}`);
  if (node.fs != null) parts.push(`F ${fmt(node.fs)}`);
  return `<div class="co-fin mono" title="Academic screens for FY${node.pfy ?? "?"}: Beneish M / Dechow F (screens, not verdicts)">${parts.join(" · ")}</div>`;
}

// export columns (per node, via its accession's fiscal year). Blank when no score.
export const SCORE_HEADERS = ["fiscal_year", "beneish_m", "beneish_flagged",
  "DSRI", "GMI", "AQI", "SGI", "DEPI", "SGAI", "LVGI", "TATA",
  "dechow_fscore", "rsst_accruals", "ch_receivables", "ch_inventory", "soft_assets", "ch_cash_sales", "ch_roa", "issuance"];
export function scoreCells(node) {
  const blank = SCORE_HEADERS.map(() => "");
  if (!node || node.cik == null || node.pfy == null) return blank;
  const y = scoreForYear(node.cik, node.pfy);
  if (!y) return blank;
  const mc = y.mc || {}, fc = y.fc || {};
  return [y.y,
    y.m == null ? "" : y.m, y.m == null ? "" : (y.mf ? "yes" : "no"),
    mc.DSRI ?? "", mc.GMI ?? "", mc.AQI ?? "", mc.SGI ?? "", mc.DEPI ?? "", mc.SGAI ?? "", mc.LVGI ?? "", mc.TATA ?? "",
    y.f == null ? "" : y.f,
    fc.rsst_accruals ?? "", fc.ch_receivables ?? "", fc.ch_inventory ?? "", fc.soft_assets ?? "", fc.ch_cash_sales ?? "", fc.ch_roa ?? "", fc.issuance ?? ""];
}
