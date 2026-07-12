// Descriptive readability (Gunning Fog) for pasted text — mirrors the Python build pipeline
// (build_app_data.py) exactly so in-browser numbers match the stored node metrics.
// DESCRIPTIVE / COMPARATIVE only — never a risk score or a judgment.
const WORD = /[A-Za-z][A-Za-z'-]*/g;
const VOWELS = /[aeiouy]+/g;
const SUFFIX = /(es|ed|ing)$/;

function syllables(w) {
  w = w.toLowerCase();
  const m = w.match(VOWELS);
  let n = m ? m.length : 0;
  if (w.endsWith("e") && !w.endsWith("le") && n > 1) n -= 1;
  return Math.max(1, n);
}
function isComplex(token) {
  const w = token.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length <= 2) return false;
  const base = w.replace(SUFFIX, "") || w;
  return syllables(base) >= 3;
}
export function readability(text) {
  text = (text || "").trim();
  const words = text.match(WORD) || [];
  const wc = words.length;
  if (!wc) return { fog: 0, asl: 0, wc: 0, cwp: 0 };
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim());
  const ns = Math.max(1, sentences.length);
  const cx = words.filter(isComplex).length;
  const asl = wc / ns, cwp = (100 * cx) / wc, fog = 0.4 * (asl + cwp);
  return { fog: +fog.toFixed(1), asl: +asl.toFixed(1), wc, cwp: +cwp.toFixed(1) };
}
