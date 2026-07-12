// Minimal store-only (no compression) ZIP writer — enough to bundle the research-panel deliverables
// into one download with zero dependencies. Produces a standard .zip (local headers + central
// directory + EOCD) that unzips with any tool. Filenames/content are UTF-8.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// files: [{ name, text }]  ->  Blob (application/zip by default; pass a mime for OOXML containers)
export function makeZip(files, mime) {
  const enc = new TextEncoder();
  const parts = [];          // body chunks (local headers + data)
  const central = [];        // central directory chunks
  let offset = 0;

  const u16 = (v) => { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v, true); return b; };
  const u32 = (v) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0, true); return b; };

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const data = enc.encode(f.text);
    const crc = crc32(data);
    const FLAG_UTF8 = 0x0800;
    // local file header
    const lh = [];
    lh.push(u32(0x04034b50), u16(20), u16(FLAG_UTF8), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), nameBytes);
    parts.push(...lh, data);
    // central directory record
    central.push(u32(0x02014b50), u16(20), u16(20), u16(FLAG_UTF8), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0),
      u32(0), u32(offset), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }

  const centralStart = offset;
  let centralSize = 0;
  for (const c of central) centralSize += c.length;
  const eocd = [u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(centralSize), u32(centralStart), u16(0)];

  return new Blob([...parts, ...central, ...eocd], { type: mime || "application/zip" });
}

// DEFLATE each entry via the platform CompressionStream (no deps). Async because compression
// streams. Use this for large containers (e.g. a 161k-row XLSX) where store-only would balloon
// the file; the resulting archive is a standard method-8 ZIP that any tool (and Excel) opens.
async function deflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// files: [{ name, text }]  ->  Promise<Blob>. Same layout as makeZip but compression method = 8.
export async function makeZipAsync(files, mime) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  const u16 = (v) => { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v, true); return b; };
  const u32 = (v) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0, true); return b; };

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const data = enc.encode(f.text);
    const crc = crc32(data);
    const comp = await deflateRaw(data);
    const FLAG_UTF8 = 0x0800;
    const METHOD = 8;   // DEFLATE
    parts.push(u32(0x04034b50), u16(20), u16(FLAG_UTF8), u16(METHOD), u16(0), u16(0),
      u32(crc), u32(comp.length), u32(data.length), u16(nameBytes.length), u16(0), nameBytes, comp);
    central.push(u32(0x02014b50), u16(20), u16(20), u16(FLAG_UTF8), u16(METHOD), u16(0), u16(0),
      u32(crc), u32(comp.length), u32(data.length), u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0),
      u32(0), u32(offset), nameBytes);
    offset += 30 + nameBytes.length + comp.length;
  }

  const centralStart = offset;
  let centralSize = 0;
  for (const c of central) centralSize += c.length;
  const eocd = [u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(centralSize), u32(centralStart), u16(0)];
  return new Blob([...parts, ...central, ...eocd], { type: mime || "application/zip" });
}
