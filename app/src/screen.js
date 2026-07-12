// SYSTEMATIC SCREEN — pre-registered multiple-hypothesis screening across the two pillars.
// A researcher defines a test family (disclosure measures × financial measures × subgroups) BEFORE
// any result is computed; the tool enumerates the full family, records the registration (timestamp,
// cohort, spec, SHA-256), runs every test, and reports ALL of them with mandatory Bonferroni and
// Benjamini-Hochberg FDR correction. The integrity safeguards ARE the feature and cannot be disabled:
//   1. pre-registration before results   2. full reporting (every test, always — sorting only, no
//   filtering/hiding)   3. corrections always applied   4. survivors labeled "candidate association —
//   warrants confirmation on independent data", never "finding"   5. effect size (Spearman ρ) beside
//   every p   6. rank-based (robust) methods, per the documented heavy outliers in the financial
//   screens (correctness audit 2026-07-01).
// Unit: the company-year panel (buildPanel) — the same rows the data table / Table 1 / panel export
// use. Pairwise deletion per test; missing is never zero-imputed. Descriptive/exploratory only —
// association in this sample, not causation, not a judgment about any company. $0; existing data.
import { buildPanel } from "./dataset.js";
import { ensureScores, companyScores } from "./scores.js";
import { downloadText } from "./exporters.js";

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const ok = (v) => v != null && isFinite(v);

// ── the measure registries (fixed; a screen selects a subset) ──────────────────────────────────
export const MEASURES_A = [   // disclosure-language measures (company-year aggregates)
  { key: "fog", label: "Gunning Fog (complexity)", get: (r) => r.fog, on: true },
  { key: "dst", label: "Distinctiveness", get: (r) => r.dst, on: true },
  { key: "nfn", label: "Footnotes (n)", get: (r) => r.n_fn, on: false },
];
const BEN = ["DSRI", "GMI", "AQI", "SGI", "DEPI", "SGAI", "LVGI", "TATA"];
const DEC = ["rsst_accruals", "ch_receivables", "ch_inventory", "soft_assets", "ch_cash_sales", "ch_roa", "issuance"];
const DEC_LABEL = { rsst_accruals: "RSST accruals", ch_receivables: "Δ receivables", ch_inventory: "Δ inventory", soft_assets: "Soft assets", ch_cash_sales: "Δ cash sales", ch_roa: "Δ ROA", issuance: "Issuance" };
export const MEASURES_B = [   // financial-quality measures (published academic screens, per company-year)
  { key: "m", label: "Beneish M-Score", get: (r) => r.m, on: true },
  ...BEN.map((k) => ({ key: "m_" + k.toLowerCase(), label: "M: " + k, get: (r) => (r.mc || {})[k], on: true })),
  { key: "f", label: "Dechow F-Score", get: (r) => r.f, on: true },
  ...DEC.map((k) => ({ key: "f_" + k, label: "F: " + DEC_LABEL[k], get: (r) => (r.fc || {})[k], on: true })),
];
export const DIMS = [   // subgroup dimensions; "full cohort" is always in the family
  { key: "enf", label: "Enforcement status (context)", on: true },
  { key: "yr", label: "Filing-year buckets (5-year)", on: true },
  { key: "ind", label: "SIC industry", on: true },
];
export const MIN_N = 30;      // pre-specified inclusion rule: pairwise-complete N ≥ 30, non-constant
export const ALPHA = 0.05;    // fixed two-sided level for both corrections — not adjustable

export const CANDIDATE_LABEL = "candidate association: warrants confirmation on independent data";

// ── statistics (pure; unit-tested in Node against scipy) ───────────────────────────────────────
export function avgRanks(a) {   // fractional ranks, ties averaged (matches scipy.stats.rankdata "average")
  const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]);
  const out = new Array(a.length); let i = 0;
  while (i < idx.length) {
    let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const r = (i + j) / 2 + 1; for (let k = i; k <= j; k++) out[idx[k][1]] = r; i = j + 1;
  }
  return out;
}
function pearsonR(x, y) {
  const n = x.length; let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { sx += x[i]; sy += y[i]; }
  const mx = sx / n, my = sy / n; let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  if (sxx === 0 || syy === 0) return null;
  return Math.max(-1, Math.min(1, sxy / Math.sqrt(sxx * syy)));
}
export function spearmanRho(x, y) {   // over paired arrays (no missing) → ρ or null (constant input)
  if (x.length < 3) return null;
  return pearsonR(avgRanks(x), avgRanks(y));
}
// Regularized incomplete beta I_x(a,b) — Lanczos log-gamma + Numerical Recipes continued fraction.
function logGamma(z) {
  const g = [676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  z -= 1; let a = 0.99999999999980993;
  for (let i = 0; i < 8; i++) a += g[i] / (z + i + 1);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}
function betacf(a, b, x) {
  const EPS = 3e-14, FPMIN = 1e-300, MAXIT = 300;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d; let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; const del = d * c; h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}
export function ibeta(a, b, x) {
  if (x <= 0) return 0; if (x >= 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
}
// Two-sided p for Spearman ρ via the t approximation, t = ρ√((n−2)/(1−ρ²)), df = n−2
// (the same approximation scipy.stats.spearmanr and R cor.test use for samples of this size).
export function spearmanP(rho, n) {
  if (rho == null || n < 4) return null;
  const df = n - 2, r2 = rho * rho;
  if (r2 >= 1) return 0;
  const t = Math.abs(rho) * Math.sqrt(df / (1 - r2));
  return ibeta(df / 2, 0.5, df / (df + t * t));
}
// Mandatory corrections over the WHOLE family. Bonferroni: p·m clamped to 1.
export function bonferroni(ps) { const m = ps.length; return ps.map((p) => Math.min(1, p * m)); }
// Benjamini-Hochberg step-up q-values: q(i) = min_{j≥i} ( m·p(j)/j ), clamped to 1.
export function bhQ(ps) {
  const m = ps.length, order = ps.map((p, i) => i).sort((a, b) => ps[a] - ps[b]);
  const q = new Array(m); let run = 1;
  for (let k = m - 1; k >= 0; k--) {
    const i = order[k];
    run = Math.min(run, (m * ps[i]) / (k + 1));
    q[i] = run;
  }
  return q;
}

// ── family enumeration (deterministic; happens at registration, before any test statistic) ─────
const yrBucket = (fy) => { const b = Math.floor(fy / 5) * 5; return b + "-" + (b + 4); };
export function enumerateFamily(rows, selA, selB, selDims, minN) {
  // subgroup list: full cohort first, then each selected dimension's groups in deterministic order
  const subgroups = [{ dim: "full", name: "full cohort", idx: rows.map((_, i) => i) }];
  const dimGroups = (keyOf, dim) => {
    const map = new Map();
    rows.forEach((r, i) => { const k = keyOf(r); if (k == null || k === "") return; let a = map.get(k); if (!a) { a = []; map.set(k, a); } a.push(i); });
    [...map.keys()].sort().forEach((k) => subgroups.push({ dim, name: String(k), idx: map.get(k) }));
  };
  if (selDims.includes("enf")) dimGroups((r) => (r.enforced ? "enforcement history" : "no enforcement history"), "enforcement");
  if (selDims.includes("yr")) dimGroups((r) => (r.fy != null ? yrBucket(r.fy) : null), "filing-year bucket");
  if (selDims.includes("ind")) dimGroups((r) => r.ind || null, "SIC industry");

  // candidate tests = every selected pair × every subgroup. Inclusion rule (pre-specified, applied
  // BEFORE any test statistic is computed): pairwise-complete N ≥ minN and both variables
  // non-constant on that pairwise set. Everything excluded is listed with its reason — never hidden.
  const included = [], excluded = [];
  for (const g of subgroups) {
    for (const A of selA) {
      for (const B of selB) {
        const xs = [], ys = [];
        for (const i of g.idx) { const x = A.get(rows[i]), y = B.get(rows[i]); if (ok(x) && ok(y)) { xs.push(x); ys.push(y); } }
        const t = { a: A.key, b: B.key, aLabel: A.label, bLabel: B.label, dim: g.dim, group: g.name, n: xs.length };
        if (xs.length < minN) { excluded.push({ ...t, reason: "pairwise N < " + minN }); continue; }
        const cx = xs.every((v) => v === xs[0]), cy = ys.every((v) => v === ys[0]);
        if (cx || cy) { excluded.push({ ...t, reason: "constant values (no variation)" }); continue; }
        included.push({ ...t, xs, ys });
      }
    }
  }
  return { included, excluded, nSubgroups: subgroups.length };
}

// run every test in the family; corrections across the whole family. Chunked so the UI stays live.
export async function runFamily(included, onProgress) {
  const results = [];
  for (let i = 0; i < included.length; i++) {
    const t = included[i];
    const rho = spearmanRho(t.xs, t.ys);
    const p = spearmanP(rho, t.n);
    results.push({ a: t.a, b: t.b, aLabel: t.aLabel, bLabel: t.bLabel, dim: t.dim, group: t.group, n: t.n, rho, p });
    if (onProgress && i % 40 === 39) { onProgress(i + 1, included.length); await new Promise((r) => setTimeout(r, 0)); }
  }
  const ps = results.map((r) => r.p);
  const pb = bonferroni(ps), q = bhQ(ps);
  results.forEach((r, i) => {
    r.pBonf = pb[i]; r.q = q[i];
    r.fdr = r.q < ALPHA; r.bonf = r.pBonf < ALPHA;   // survives-correction flags at the fixed α
  });
  return results;
}

// ── honesty copy (travels with the panel, the export, and the methods doc) ─────────────────────
const HONESTY = [
  "EXPLORATORY, NOT CONFIRMATORY. A systematic screen generates candidate hypotheses. It does not establish findings. Anything that survives correction here is a starting point that warrants confirmation on independent data (a different sample, a different period, or a pre-registered replication). It is never a conclusion by itself.",
  "THE FULL FAMILY IS ALWAYS REPORTED. Every pre-registered test appears in the table and in the export, including every non-survivor, and the corrections are computed across the whole family. Sorting reorders the table. Nothing is filtered out or hidden. These safeguards make selective reporting a deliberate act rather than a default.",
  "SIGNIFICANCE IS NOT IMPORTANCE. At large N, associations too small to matter (|ρ| under ~0.1) can clear any correction. Read the effect size (Spearman ρ) first, the q-value second. An interesting effect size that does not survive correction is not evidence of anything either. This family was searched, so uncorrected p-values overstate the evidence.",
  "ONE SCREEN, ONE CORRECTION. The correction covers the tests registered in THIS screen. Running further screens and reporting only the interesting one silently rebuilds the multiple-comparisons problem this tool corrects for. Report every screen you ran. The registration record (timestamp and SHA-256) exists so that a reported screen can be shown to be the screen that was run.",
  "DESCRIPTIVE, NOT CAUSAL. These are rank associations between measures in this sample. They are sample-specific, not causal, and not a statement about any individual company. The financial measures are published academic screens (Beneish 1999; Dechow et al. 2011) with known limitations, and this dataset cannot re-validate them. I use rank-based (Spearman) statistics throughout because the financial screens contain documented extreme outliers that invalidate mean and Pearson-based statistics.",
].join("\n\n");

const INTRO = "Define the test family first: which measure pairs, over which subgroups. The tool enumerates every resulting pre-specified test, records the registration, runs the complete family, and reports every test with mandatory Bonferroni and Benjamini–Hochberg (FDR) corrections. Nothing runs until you register, and everything is reported after.";

const fmtP = (p) => p == null ? "—" : p < 1e-4 ? "<0.0001" : p.toFixed(4);
const fmtR = (r) => r == null ? "—" : (r >= 0 ? "+" : "−") + Math.abs(r).toFixed(3);

// ── the modal ───────────────────────────────────────────────────────────────────────────────────
export class Screen {
  // deps: { modal, body, setModal, engine, nodes, describe, cohortLink }
  constructor(deps) {
    Object.assign(this, deps);
    this.selA = new Set(MEASURES_A.filter((m) => m.on).map((m) => m.key));
    this.selB = new Set(MEASURES_B.filter((m) => m.on).map((m) => m.key));
    this.selDims = new Set(DIMS.filter((d) => d.on).map((d) => d.key));
    this.state = "define";           // define → registered (results shown)
    this.sort = { col: null, dir: 1 }; // null = registration (pre-specified) order
    this.body.addEventListener("click", (e) => this._onClick(e));
    this.body.addEventListener("change", (e) => this._onChange(e));
    this.body.addEventListener("keydown", (e) => {   // keyboard sorting on the results table headers
      if (e.key !== "Enter" && e.key !== " ") return;
      const el = e.target.closest && e.target.closest("[data-sc-sort]");
      if (el) { e.preventDefault(); el.click(); }
    });
  }

  async open() {
    this.setModal(this.modal, true); this.body.scrollTop = 0;
    if (this.state === "registered") return;   // keep a completed screen on re-open (record intact)
    this.idxs = this.engine.filteredIndices();
    this._shell("preparing the screen…");
    try { await this._ensureDeps(); this._buildRows(); this._renderDefine(); }
    catch (e) { this._shell("Could not prepare a screen for this cohort."); }
  }
  close() { this.setModal(this.modal, false); }

  _cohortKeys() { const s = new Set(); for (const i of this.idxs) { const n = this.nodes[i]; if (n.pfy != null) s.add(n.cik + "|" + n.pfy); } return [...s]; }
  async _ensureDeps() {
    if (!this._allByKey) { const m = new Map(); for (let i = 0; i < this.nodes.length; i++) { const n = this.nodes[i]; if (n.pfy == null) continue; const k = n.cik + "|" + n.pfy; let a = m.get(k); if (!a) { a = []; m.set(k, a); } a.push(i); } this._allByKey = m; }
    if (!this._tickers) { try { this._tickers = await fetch("./data/tickers.json").then((r) => r.json()); } catch (e) { this._tickers = {}; } }
    await ensureScores();
  }
  _buildRows() { this.rows = buildPanel(this._cohortKeys(), this._allByKey, this.nodes, companyScores, this._tickers); }

  _selMeasures() {
    return {
      A: MEASURES_A.filter((m) => this.selA.has(m.key)),
      B: MEASURES_B.filter((m) => this.selB.has(m.key)),
      dims: DIMS.filter((d) => this.selDims.has(d.key)).map((d) => d.key),
    };
  }
  _enumerate() { const s = this._selMeasures(); return enumerateFamily(this.rows, s.A, s.B, s.dims, MIN_N); }

  // ── registry (client-side audit log of past registrations in this browser) ──
  _registry() { try { return JSON.parse(localStorage.getItem("atlas.screenRegistry") || "[]"); } catch (e) { return []; } }
  _registrySave(list) { try { localStorage.setItem("atlas.screenRegistry", JSON.stringify(list.slice(-50))); } catch (e) {} }

  _shell(msg) {
    this.body.innerHTML = `${this._head()}<div class="ch-pad"><div class="caveat">${esc(msg)}</div></div>`;
  }
  _head() {
    // once registered, the header pins the REGISTERED cohort (the record), not the live filter state
    const def = (this.state === "registered" && this.registration) ? this.registration.spec.cohort
      : (this.describe ? this.describe() : "all disclosures");
    return `<div class="ch-head"><div class="ch-head-main"><div class="ch-title mono">SYSTEMATIC SCREEN · PRE-REGISTERED</div><div class="ch-def mono">${esc(def)}</div></div><button class="icon-btn mono" data-sc="close" type="button" aria-label="Close">✕</button></div>`;
  }

  // ── DEFINE state ──
  _renderDefine() {
    const en = this._enumerate();
    const { A, B, dims } = this._selMeasures();
    const nPairs = A.length * B.length;
    const box = (title, items, sel, name, note) => `
      <div class="sc-col">
        <div class="sc-col-h mono">${esc(title)}</div>
        ${items.map((m) => `<label class="sc-check mono"><input type="checkbox" data-sc-set="${name}" value="${esc(m.key)}"${sel.has(m.key) ? " checked" : ""}> ${esc(m.label)}</label>`).join("")}
        ${note ? `<div class="sc-col-note">${note}</div>` : ""}
      </div>`;
    const reg = this._registry();
    this.body.innerHTML = `${this._head()}
      <div class="sc-pad">
        <div class="caveat sc-intro">${esc(INTRO)}</div>
        <div class="sc-grid">
          ${box("DISCLOSURE MEASURES", MEASURES_A, this.selA, "a", "descriptive language properties")}
          ${box("FINANCIAL MEASURES", MEASURES_B, this.selB, "b", "published academic screens (Beneish 1999; Dechow et&nbsp;al. 2011). Screens, not verdicts. This dataset cannot re-validate them")}
          <div class="sc-col">
            <div class="sc-col-h mono">SUBGROUPS</div>
            <label class="sc-check mono is-locked"><input type="checkbox" checked disabled> Full cohort <span class="sc-lock">always included</span></label>
            ${DIMS.map((d) => `<label class="sc-check mono"><input type="checkbox" data-sc-set="dim" value="${esc(d.key)}"${this.selDims.has(d.key) ? " checked" : ""}> ${esc(d.label)}</label>`).join("")}
            <div class="sc-col-note">each selected dimension adds one test per measure pair per group</div>
          </div>
        </div>
        <div class="sc-prereg">
          <div class="sc-col-h mono">PRE-REGISTRATION · THE FULL TEST FAMILY, ENUMERATED BEFORE ANY RESULT</div>
          <div class="sc-prereg-line mono">${nPairs.toLocaleString()} measure pairs × ${en.nSubgroups.toLocaleString()} subgroups → <b>${(en.included.length + en.excluded.length).toLocaleString()}</b> candidate tests · <b class="sc-m">${en.included.length.toLocaleString()}</b> enter the family · ${en.excluded.length.toLocaleString()} excluded by the pre-specified rule (pairwise N&nbsp;≥&nbsp;${MIN_N}, non-constant). Excluded tests are listed in the results and the export, never silently dropped</div>
          <div class="sc-prereg-line mono">method: Spearman rank correlation (two-sided) · unit: company-year · pairwise deletion, missing never zero-imputed · corrections (mandatory, across the whole family): Bonferroni AND Benjamini–Hochberg FDR · α = ${ALPHA} · every test reported</div>
          <div class="sc-actions">
            <button class="act-btn sc-run mono" data-sc="run" type="button"${en.included.length ? "" : " disabled"}>⊜ REGISTER &amp; RUN · ${en.included.length.toLocaleString()} PRE-SPECIFIED TESTS</button>
            <span class="act-toast mono" data-sc="toast" aria-live="polite"></span>
          </div>
        </div>
        ${reg.length ? `<div class="sc-registry"><div class="sc-col-h mono">REGISTRATION LOG · THIS BROWSER</div>${reg.slice().reverse().map((r) => `<div class="sc-reg-row mono">${esc(r.at)} · ${r.m.toLocaleString()} tests · sha-256 ${esc(r.hash.slice(0, 16))}… · ${esc(r.cohort)}${r.outcome ? ` · ${r.outcome.fdr} survived FDR` : ""}</div>`).join("")}<div class="sc-col-note">a client-side log of screens registered in this browser, part of the record that what you report is what you ran</div></div>` : ""}
      </div>`;
  }

  // ── register + run ──
  async _register() {
    const en = this._enumerate();
    if (!en.included.length) return;
    const { A, B, dims } = this._selMeasures();
    const at = new Date().toISOString();
    const spec = {
      version: 1, registered_utc: at,
      cohort: this.describe ? this.describe() : "all disclosures",
      unit: "company-year", method: "spearman_rank_two_sided", alpha: ALPHA,
      corrections: ["bonferroni", "benjamini_hochberg_fdr"],
      inclusion_rule: "pairwise N >= " + MIN_N + " and non-constant",
      disclosure_measures: A.map((m) => m.key), financial_measures: B.map((m) => m.key),
      subgroup_dimensions: ["full_cohort", ...dims],
      m_tests: en.included.length, excluded_candidates: en.excluded.length,
      family: en.included.map((t) => t.a + "~" + t.b + "|" + t.dim + "|" + t.group + "|n=" + t.n),
    };
    let hash = "";
    try {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(spec)));
      hash = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch (e) { hash = "unavailable"; }   // Web Crypto needs a secure context; stated, not silent
    this.registration = { spec, hash };
    // record BEFORE results exist — the registration precedes what it registers
    const reg = this._registry();
    reg.push({ at, hash, m: spec.m_tests, cohort: spec.cohort });
    this._registrySave(reg);

    this.state = "registered";
    this.excluded = en.excluded;
    this._renderRunning(0, en.included.length);
    this.results = await runFamily(en.included, (done, total) => this._renderRunning(done, total));
    // append the outcome to the registry entry (clearly an outcome, added after the record)
    const reg2 = this._registry();
    const last = reg2[reg2.length - 1];
    if (last && last.hash === hash) { last.outcome = { fdr: this.results.filter((r) => r.fdr).length, bonf: this.results.filter((r) => r.bonf).length }; this._registrySave(reg2); }
    this.sort = { col: null, dir: 1 };
    this._renderResults();
  }

  _renderRunning(done, total) {
    this.body.innerHTML = `${this._head()}
      <div class="sc-pad">${this._registrationHTML()}
        <div class="caveat">running the pre-registered family… ${done.toLocaleString()} / ${total.toLocaleString()} tests</div>
      </div>`;
  }

  _registrationHTML() {
    const s = this.registration.spec;
    const h = this.registration.hash;
    const hashTxt = h === "unavailable" ? "unavailable (requires a secure context)" : h.slice(0, 16) + "…";
    return `<div class="sc-prereg is-locked">
      <div class="sc-col-h mono">REGISTERED · ${esc(s.registered_utc)} · SHA-256 <span class="sc-hash">${esc(hashTxt)}</span></div>
      <div class="sc-prereg-line mono">cohort: ${esc(s.cohort)} · unit: company-year · ${s.disclosure_measures.length}×${s.financial_measures.length} measure pairs · dimensions: ${esc(s.subgroup_dimensions.join(", "))}</div>
      <div class="sc-prereg-line mono">family: <b class="sc-m">${s.m_tests.toLocaleString()}</b> pre-specified tests (${s.excluded_candidates.toLocaleString()} candidates excluded by the pre-specified rule, listed below) · Spearman rank, two-sided · Bonferroni + BH-FDR across all ${s.m_tests.toLocaleString()} · α = ${s.alpha} · the spec was locked before any result was computed</div>
    </div>`;
  }

  // ── RESULTS state ──
  _sorted() {
    const r = this.results.slice();
    const c = this.sort.col, d = this.sort.dir;
    if (!c) return r;   // registration (pre-specified) order — the default view
    const val = (t) => c === "pair" ? t.aLabel + "×" + t.bLabel : c === "group" ? t.dim + "|" + t.group : c === "n" ? t.n : c === "rho" ? (t.rho == null ? -Infinity : Math.abs(t.rho)) : c === "p" ? (t.p == null ? Infinity : t.p) : c === "pb" ? (t.pBonf == null ? Infinity : t.pBonf) : (t.q == null ? Infinity : t.q);
    r.sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * d; });
    return r;
  }

  _renderResults() {
    const res = this._sorted();
    const nFdr = this.results.filter((r) => r.fdr).length, nBonf = this.results.filter((r) => r.bonf).length;
    const m = this.results.length;
    const th = (col, label, title) => {
      const on = this.sort.col === col;
      const aria = on ? (this.sort.dir === 1 ? "ascending" : "descending") : "none";
      return `<th class="mono${on ? " is-sort" : ""}" data-sc-sort="${col}" aria-sort="${aria}" title="${esc(title)}" role="columnheader" tabindex="0">${esc(label)}${on ? (this.sort.dir === 1 ? " ▲" : " ▼") : ""}</th>`;
    };
    const rows = res.map((t) => `<tr class="${t.fdr ? "sc-cand" : ""}">
      <td class="sc-pair">${esc(t.aLabel)} <span class="sc-x">×</span> ${esc(t.bLabel)}</td>
      <td class="sc-grp">${esc(t.group)}${t.dim !== "full" ? ` <span class="sc-dim">${esc(t.dim)}</span>` : ""}</td>
      <td class="sc-num">${t.n.toLocaleString()}</td>
      <td class="sc-num">${fmtR(t.rho)}</td>
      <td class="sc-num">${fmtP(t.p)}</td>
      <td class="sc-num">${fmtP(t.pBonf)}</td>
      <td class="sc-num">${fmtP(t.q)}</td>
      <td class="sc-status">${t.fdr ? `<span class="sc-tag mono" title="${esc(CANDIDATE_LABEL)}">candidate†${t.bonf ? " ‡" : ""}</span>` : `<span class="sc-null">—</span>`}</td>
    </tr>`).join("");
    const excl = this.excluded.length ? `<details class="sc-excl"><summary class="mono">${this.excluded.length.toLocaleString()} candidate tests excluded by the pre-specified rule (full list, nothing is silently dropped)</summary>${this.excluded.map((t) => `<div class="sc-reg-row mono">${esc(t.aLabel)} × ${esc(t.bLabel)} · ${esc(t.group)} · N=${t.n.toLocaleString()} · ${esc(t.reason)}</div>`).join("")}</details>` : "";
    this.body.innerHTML = `${this._head()}
      <div class="sc-pad">
        ${this._registrationHTML()}
        <div class="sc-summary mono"><b>${nFdr.toLocaleString()}</b> of <b>${m.toLocaleString()}</b> tests survive FDR correction (q &lt; ${ALPHA}) · <b>${nBonf.toLocaleString()}</b> also survive Bonferroni · every one of the ${m.toLocaleString()} tests is shown below and in the export</div>
        <div class="caveat sc-candnote">† <b>${esc(CANDIDATE_LABEL)}</b>. Exploratory screening generates hypotheses, not conclusions. Confirmation on fresh, independent data is required before any of these is more than a lead. ‡ also survives the stricter Bonferroni bound. Statistical significance ≠ practical importance: at these N, small effects clear correction, so read ρ first.</div>
        <div class="sc-bar">
          <div class="sc-meta mono">sorted: ${this.sort.col ? esc(this.sort.col) + " (a view aid, all " + m.toLocaleString() + " rows remain in the table)" : "registration order (pre-specified)"}</div>
          <div class="sc-actions-r">
            <button class="act-btn mono" data-sc="csv" type="button">↓ CSV · FULL SCREEN (ALL ${m.toLocaleString()} TESTS)</button>
            ${this.cohortLink ? `<button class="act-btn mono" data-sc="share" type="button">⧉ SHARE COHORT</button>` : ""}
            <button class="act-btn mono" data-sc="new" type="button">⌗ NEW SCREEN</button>
            <span class="act-toast mono" data-sc="toast" aria-live="polite"></span>
          </div>
        </div>
        <div class="sc-scroll">
          <table class="sc-table mono">
            <thead><tr>${th("pair", "MEASURE PAIR", "disclosure measure × financial measure")}${th("group", "SUBGROUP", "the pre-specified subgroup")}${th("n", "N", "pairwise-complete company-years")}${th("rho", "SPEARMAN ρ", "Spearman rank correlation, the effect size (sorts by |ρ|)")}${th("p", "P (RAW)", "two-sided and uncorrected, which overstates evidence in a searched family")}${th("pb", "P·BONF", "Bonferroni-adjusted across all " + m + " tests")}${th("q", "Q (FDR)", "Benjamini–Hochberg across all " + m + " tests")}<th class="mono">STATUS</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        ${excl}
        <div class="sc-honesty">${HONESTY.split("\n\n").map((p) => { const i = p.indexOf(". "); return `<p><b class="mono">${esc(p.slice(0, i + 1))}</b> ${esc(p.slice(i + 2))}</p>`; }).join("")}</div>
      </div>`;
  }

  // ── export: the FULL screen (registration header + every test + every exclusion) ──
  _csv() {
    const s = this.registration.spec;
    const L = [];
    L.push("# Disclosure Atlas · systematic screen (pre-registered multiple-hypothesis screening)");
    L.push("# registered_utc: " + s.registered_utc);
    L.push("# registration_sha256: " + this.registration.hash);
    L.push("# cohort: " + s.cohort);
    L.push("# unit: company-year (pairwise deletion; missing never zero-imputed)");
    L.push("# method: Spearman rank correlation, two-sided (t approximation); rank-based per the documented financial-screen outliers");
    L.push("# corrections (mandatory, across the whole family): Bonferroni AND Benjamini-Hochberg FDR; alpha = " + s.alpha);
    L.push("# inclusion_rule: " + s.inclusion_rule + " (applied before any test statistic; exclusions listed at the end of this file)");
    L.push("# disclosure_measures: " + s.disclosure_measures.join(", "));
    L.push("# financial_measures: " + s.financial_measures.join(", "));
    L.push("# subgroup_dimensions: " + s.subgroup_dimensions.join(", "));
    L.push("# m_tests: " + s.m_tests + ". This file contains all of them. Reporting a subset misrepresents the screen");
    L.push("# survivors are labeled: " + CANDIDATE_LABEL);
    L.push("# exploratory screening generates hypotheses, not conclusions; statistical significance != practical importance (read the effect size)");
    L.push("# financial measures are published academic screens (Beneish 1999; Dechow et al. 2011) with known limitations; this dataset cannot re-validate them");
    L.push("# retrieved from https://disclosure-atlas.vercel.app");
    L.push("disclosure_measure,financial_measure,subgroup_dimension,subgroup,n,spearman_rho,p_raw,p_bonferroni,q_fdr_bh,survives_fdr_05,survives_bonferroni_05,label");
    const cell = (v) => { const t = String(v == null ? "" : v); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
    for (const t of this.results) {
      L.push([t.aLabel, t.bLabel, t.dim, t.group, t.n,
        t.rho == null ? "" : t.rho.toFixed(6), t.p == null ? "" : t.p.toExponential(4),
        t.pBonf == null ? "" : t.pBonf.toExponential(4), t.q == null ? "" : t.q.toExponential(4),
        t.fdr ? 1 : 0, t.bonf ? 1 : 0, t.fdr ? CANDIDATE_LABEL : ""].map(cell).join(","));
    }
    if (this.excluded.length) {
      L.push("");
      L.push("# excluded candidate tests (pre-specified rule; never silently dropped)");
      L.push("disclosure_measure,financial_measure,subgroup_dimension,subgroup,n,reason");
      for (const t of this.excluded) L.push([t.aLabel, t.bLabel, t.dim, t.group, t.n, t.reason].map(cell).join(","));
    }
    downloadText(L.join("\n"), "disclosure-atlas_systematic-screen_" + this.results.length + "tests.csv", "text/csv");
    this._toast("CSV downloaded · all " + this.results.length.toLocaleString() + " tests");
  }

  _toast(msg) { const t = this.body.querySelector('[data-sc="toast"]'); if (t) { t.textContent = msg; clearTimeout(this._tt); this._tt = setTimeout(() => { t.textContent = ""; }, 2600); } }

  _onChange(e) {
    const el = e.target.closest("[data-sc-set]"); if (!el) return;
    const set = el.getAttribute("data-sc-set") === "a" ? this.selA : el.getAttribute("data-sc-set") === "b" ? this.selB : this.selDims;
    if (el.checked) set.add(el.value); else set.delete(el.value);
    this._renderDefine();
  }
  _onClick(e) {
    const sortEl = e.target.closest("[data-sc-sort]");
    if (sortEl) {
      const col = sortEl.getAttribute("data-sc-sort");
      this.sort = this.sort.col === col ? { col, dir: -this.sort.dir } : { col, dir: col === "rho" ? -1 : 1 };
      return this._renderResults();
    }
    const el = e.target.closest("[data-sc]"); if (!el) return;
    const act = el.getAttribute("data-sc");
    if (act === "close") return this.close();
    if (act === "run") { el.disabled = true; return this._register(); }
    if (act === "csv") return this._csv();
    if (act === "share" && this.cohortLink) { navigator.clipboard.writeText(this.cohortLink("sc")).then(() => this._toast("cohort link copied")).catch(() => this._toast("copy failed")); return; }
    if (act === "new") { this.state = "define"; this.results = null; this.registration = null; this.idxs = this.engine.filteredIndices(); this._buildRows(); return this._renderDefine(); }
  }
}
