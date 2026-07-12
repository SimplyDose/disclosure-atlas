// COPY-AS-CODE IMPORT SNIPPETS — kill the merge-friction step. For the current cohort, hand the
// researcher one-click, ready-to-run import code in Stata, R, and Python that loads the EXACT
// panel.csv this cohort exports: CIK kept as a string (leading zeros preserved), filing dates parsed,
// empty cells as proper missing (NA / .), and a join recipe to Compustat/CRSP/WRDS. The snippets are
// generated from the same column registry that builds the CSV (dataset.js COLS) so they can never
// drift from the file. Descriptive only; existing caveats ride inside each snippet's header comments.
import { stataSnippet, rSnippet, pySnippet, joiningNote } from "./dataset.js";

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const FLAVORS = [
  { key: "stata", label: "STATA (.do)", file: "import_panel.do", gen: stataSnippet },
  { key: "r", label: "R (readr)", file: "import_panel.R", gen: rSnippet },
  { key: "python", label: "PYTHON (pandas)", file: "import_panel.py", gen: pySnippet },
];

export class ImportCode {
  // deps: { modal, body, setModal, getMeta }  getMeta() => { filterDesc, nObs?, nCompanies?, nScored? }
  constructor(deps) { Object.assign(this, deps); this.flavor = "stata"; this.body.addEventListener("click", (e) => this._onClick(e)); }

  open() { this._meta = this.getMeta(); this._render(); this.setModal(this.modal, true); this.body.scrollTop = 0; }
  close() { this.setModal(this.modal, false); }

  _snippet() { return (FLAVORS.find((f) => f.key === this.flavor) || FLAVORS[0]).gen(this._meta); }

  _render() {
    const m = this._meta;
    const counts = (m.nObs != null)
      ? `N = <b>${(m.nObs).toLocaleString()}</b> company-years · <b>${(m.nCompanies || 0).toLocaleString()}</b> companies${m.nScored != null ? ` · <b>${m.nScored.toLocaleString()}</b> with a financial screen` : ""}`
      : "the current cohort";
    const tabs = FLAVORS.map((f) => `<button class="ic-tab mono${f.key === this.flavor ? " is-on" : ""}" data-ic="tab" data-flavor="${f.key}" type="button" role="tab" aria-selected="${f.key === this.flavor}">${esc(f.label)}</button>`).join("");
    this.body.innerHTML = `<div class="ch-head">
        <div class="ch-head-main"><div class="ch-title mono">COPY IMPORT CODE</div><div class="ch-def mono">load this cohort's panel.csv, zero manual wrangling</div></div>
        <button class="icon-btn mono" data-ic="close" type="button" aria-label="Close">✕</button>
      </div>
      <div class="ic-pad">
        <div class="ic-meta mono">${counts} · loads <code>panel.csv</code> from this cohort's panel <b>.zip</b></div>
        <div class="ic-tabs" role="tablist" aria-label="Import language">${tabs}
          <span class="ic-grow"></span>
          <button class="act-btn mono" data-ic="copy" type="button">⧉ COPY CODE</button>
          <span class="act-toast mono" data-ic="toast" aria-live="polite"></span>
        </div>
        <pre class="ic-code mono" id="icCode" tabindex="0"></pre>
        <div class="ic-note">
          <div class="ic-note-h mono">JOINING THIS DATA</div>
          <p class="ic-note-p">Every row carries a zero-padded 10-digit <b>CIK</b>, the universal join key. Resolvable identifiers (ticker, company_name, sic_code, sic_industry, accession) ship as clean columns. Licensed identifiers (<b>gvkey</b>, <b>cusip</b>, <b>permno</b>) ship <b>empty by design</b>: they require Compustat/CRSP/WRDS, which this dataset does not contain, and they are never fabricated. Map them yourself from CIK.</p>
          <ul class="ic-note-list mono">
            <li>Merge on CIK: Stata <code>merge m:1 cik using …</code> · R <code>left_join(by="cik")</code> · pandas <code>.merge(on="cik")</code> (match <code>cik,fiscal_year</code> for a company-year join).</li>
            <li>CIK → GVKEY via the Compustat <code>company</code> table / CCM link; GVKEY → PERMNO via the CRSP/Compustat Merged link (respect LINKDT/LINKENDDT, LINKPRIM=P).</li>
            <li>Point-in-time: <code>filing_date</code> is when each measure became public. Align return/market data to it to avoid look-ahead bias.</li>
          </ul>
          <p class="ic-note-p ic-note-foot">The full <code>JOINING.md</code> (with these recipes), the data dictionary (<code>codebook.md</code>), and all three import scripts travel inside the panel <b>.zip</b>.</p>
        </div>
        <div class="caveat">These snippets load a descriptive research panel. The Beneish M-Score / Dechow F-Score columns are published academic screens shown with their limitations (this dataset cannot re-validate them). Disclosure measures are descriptive language properties. There is no risk score, no composite, and no ranking by implied concern.</div>
      </div>`;
    this._paint();
  }

  _paint() {
    const el = this.body.querySelector("#icCode"); if (el) el.textContent = this._snippet();
    const t = this.body.querySelector('[data-ic="toast"]'); if (t) t.textContent = "";
  }

  _toast(msg) { const t = this.body.querySelector('[data-ic="toast"]'); if (t) { t.textContent = msg; clearTimeout(this._tt); this._tt = setTimeout(() => { t.textContent = ""; }, 2400); } }

  _onClick(e) {
    const el = e.target.closest("[data-ic]"); if (!el) return;
    const act = el.getAttribute("data-ic");
    if (act === "close") return this.close();
    if (act === "tab") {
      const f = el.getAttribute("data-flavor"); if (f && f !== this.flavor) { this.flavor = f; this._render(); }
      return;
    }
    if (act === "copy") {
      const code = this._snippet();
      navigator.clipboard.writeText(code).then(() => this._toast("import code copied")).catch(() => this._toast("copy failed. Select the code and copy manually"));
      return;
    }
  }
}
