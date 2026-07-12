// SHAREABLE COHORT DEFINITIONS — capture the full active filter set (the cohort = the sample) as a
// clean, lossless URL that reconstructs the EXACT cohort on a fresh load: same filters, same count.
// Serves collaboration, robustness checks, and referee reproducibility ("here's my exact sample")
// without accounts. A cohort link is a reproducible SAMPLE DEFINITION — descriptive, no scores or
// judgment; existing caveats travel where financial measures appear. Reuses existing filter logic; $0.

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ── compact, robust encoding: minimal JSON (only non-default filters; industry as its manifest index)
//    → base64url. Decodes defensively: any malformation returns null (caller degrades gracefully). ──
function b64urlEncode(s) {
  return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s) {
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  return decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad)));
}

export function encodeCohort(o) {
  try {
    const keys = Object.keys(o || {});
    if (!keys.length) return "";                 // no filters → empty token (link loads "all")
    return b64urlEncode(JSON.stringify(o));
  } catch (e) { return ""; }
}

export function decodeCohort(token) {
  try {
    if (!token) return {};
    const o = JSON.parse(b64urlDecode(token));
    return (o && typeof o === "object" && !Array.isArray(o)) ? o : null;
  } catch (e) { return null; }                   // malformed link → null → caller ignores it
}

const VIEW_LABEL = { t1: "Table 1", dt: "data table", ch: "cohort analysis", cr: "correlations" };

export class Share {
  // deps: { modal, body, setModal, getInfo }  getInfo() => { def, defParts[], nF, nCY, nCO, url, urlT1, urlDT }
  constructor(deps) { Object.assign(this, deps); this.body.addEventListener("click", (e) => this._onClick(e)); }

  open() { this._info = this.getInfo(); this._render(); this.setModal(this.modal, true); this.body.scrollTop = 0;
    const inp = this.body.querySelector(".sh-url"); if (inp) { inp.focus(); inp.select(); } }
  close() { this.setModal(this.modal, false); }

  _render() {
    const i = this._info;
    const parts = (i.defParts && i.defParts.length) ? i.defParts : ["all disclosures (no filters applied)"];
    this.body.innerHTML = `<div class="ch-head">
        <div class="ch-head-main"><div class="ch-title mono">SHARE COHORT</div><div class="ch-def mono">a reproducible sample definition</div></div>
        <button class="icon-btn mono" data-sh="close" type="button" aria-label="Close">✕</button>
      </div>
      <div class="sh-pad">
        <div class="sh-meta mono">N = <b>${i.nF.toLocaleString()}</b> footnotes · <b>${i.nCY.toLocaleString()}</b> company-years · <b>${i.nCO.toLocaleString()}</b> companies</div>

        <div class="sh-block">
          <div class="sh-label mono">SHAREABLE LINK</div>
          <div class="sh-url-row">
            <input class="sh-url mono" type="text" readonly value="${esc(i.url)}" aria-label="Shareable cohort link" />
            <button class="act-btn mono" data-sh="copy" type="button">⧉ COPY LINK</button>
          </div>
          <div class="sh-views">
            <span class="sh-views-lab mono">or copy a link that opens directly in:</span>
            <button class="act-btn mono" data-sh="copy-t1" type="button">⧉ TABLE 1</button>
            <button class="act-btn mono" data-sh="copy-dt" type="button">⧉ DATA TABLE</button>
            <button class="act-btn mono" data-sh="copy-cr" type="button">⧉ CORRELATIONS</button>
            <span class="act-toast mono" data-sh="toast" aria-live="polite"></span>
          </div>
        </div>

        <div class="sh-block">
          <div class="sh-label mono">COHORT DEFINITION · sample selection</div>
          <ul class="sh-def-list">${parts.map((p) => `<li class="mono">${esc(p)}</li>`).join("")}</ul>
        </div>

        <div class="caveat">Opening this link reconstructs the EXACT cohort above: the same active filters and the same resulting set (footnotes, company-years, companies). A collaborator or referee lands on the identical sample and can immediately view Table 1, the data table, or download the panel. A cohort link is a reproducible <b>sample definition</b>: descriptive, with no scores, ranking, or judgment. Where financial measures (Beneish M-Score, Dechow F-Score) appear in this sample they are published academic screens shown with their limitations. This dataset cannot re-validate them. Enforcement history is descriptive context.</div>
      </div>`;
  }

  _copy(text, label) {
    const toast = this.body.querySelector('[data-sh="toast"]');
    navigator.clipboard.writeText(text).then(() => this._toast(toast, label + " copied"))
      .catch(() => this._toast(toast, "copy failed. Select the link and copy manually"));
  }
  _toast(t, msg) { if (t) { t.textContent = msg; clearTimeout(this._tt); this._tt = setTimeout(() => { t.textContent = ""; }, 2600); } }

  _onClick(e) {
    const el = e.target.closest("[data-sh]"); if (!el) return;
    const act = el.getAttribute("data-sh"); const i = this._info;
    if (act === "close") return this.close();
    if (act === "copy") return this._copy(i.url, "cohort link");
    if (act === "copy-t1") return this._copy(i.urlT1, "link (→ " + VIEW_LABEL.t1 + ")");
    if (act === "copy-dt") return this._copy(i.urlDT, "link (→ " + VIEW_LABEL.dt + ")");
    if (act === "copy-cr") return this._copy(i.urlCR, "link (→ " + VIEW_LABEL.cr + ")");
  }
}
