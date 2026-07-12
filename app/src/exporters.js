// Export helpers. Both CSV and XLSX are fully offline and dependency-free: CSV is a streamed
// string; XLSX is a streamed OOXML workbook zipped with makeZip. Neither path allocates a
// per-cell object, so exports scale to the full corpus (161k+ rows) without crashing the tab.
import { makeZipAsync } from "./zip.js";

function csvCell(v) { const s = String(v == null ? "" : v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
export function toCSV(headers, rows) { return [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n"); }

export function downloadBlob(data, filename, mime) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: (mime || "text/plain") + ";charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
}
export function downloadText(text, filename, mime) { downloadBlob(text, filename, mime || "text/plain"); }
export function downloadCSV(filename, headers, rows) { downloadBlob(toCSV(headers, rows), filename, "text/csv"); }

// ---- dependency-free streaming XLSX (SpreadsheetML, inline strings) ----
// Escape the five XML predefined entities and strip characters illegal in XML 1.0 (control chars
// other than tab/newline/CR) so a stray byte in a filed company name can never corrupt the workbook.
function xmlEsc(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]))
          .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F￾￿]/g, "");
}
// 1-based column index -> A, B, ... Z, AA, ...
function colRef(n) { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

// One <c> cell. Real finite JS numbers become numeric cells; everything else is an inline string
// (so a numeric-looking identifier like a zero-padded CIK keeps its leading zeros — never coerced).
function cellXML(ref, v) {
  if (v == null || v === "") return "";
  if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(String(v))}</t></is></c>`;
}

function sheetXML(headers, rows) {
  const nCols = headers.length;
  const lastCol = colRef(nCols);
  const dim = `A1:${lastCol}${rows.length + 1}`;
  const out = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    `<dimension ref="${dim}"/>`,
    "<sheetData>",
  ];
  const rowXML = (cells, r) => {
    let s = `<row r="${r}">`;
    for (let c = 0; c < cells.length; c++) s += cellXML(colRef(c + 1) + r, cells[c]);
    return s + "</row>";
  };
  out.push(rowXML(headers, 1));
  for (let i = 0; i < rows.length; i++) out.push(rowXML(rows[i], i + 2));
  out.push("</sheetData></worksheet>");
  return out.join("");
}

function sheetNameSafe(name) {
  // Excel: <=31 chars, none of : \ / ? * [ ]
  return (String(name || "Sheet1").replace(/[:\\/?*[\]]/g, " ").slice(0, 31)) || "Sheet1";
}

export function buildXLSXParts(sheetName, headers, rows) {
  const safe = sheetNameSafe(sheetName);
  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    "</Types>";
  const rootRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    "</Relationships>";
  const workbook =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<sheets><sheet name="${xmlEsc(safe)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const workbookRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    "</Relationships>";
  return [
    { name: "[Content_Types].xml", text: contentTypes },
    { name: "_rels/.rels", text: rootRels },
    { name: "xl/workbook.xml", text: workbook },
    { name: "xl/_rels/workbook.xml.rels", text: workbookRels },
    { name: "xl/worksheets/sheet1.xml", text: sheetXML(headers, rows) },
  ];
}

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export function buildXLSXBlob(sheetName, headers, rows) {
  return makeZipAsync(buildXLSXParts(sheetName, headers, rows), XLSX_MIME);
}

// DEFLATE-compressed, dependency-free, offline. Callers await it.
export async function downloadXLSX(filename, sheetName, headers, rows) {
  downloadBlob(await buildXLSXBlob(sheetName, headers, rows), filename);
}
