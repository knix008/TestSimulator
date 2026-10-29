// IFC ZIP (.ifczip): a ZIP archive holding one .ifc (or .ifcxml) file, the
// compressed form buildingSMART defines for IFC. Entries are deflated with
// CompressionStream("deflate-raw") (Electron, browsers, Node 18+); where that
// is missing they are stored, which every reader also accepts.

import { toBytes, crc32, dosDateTime } from "./zip.js";

async function deflate(bytes) {
  if (typeof CompressionStream !== "function") return null;
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// files: [{name, data: string|Uint8Array, date?}] → Uint8Array of a .zip with deflated entries.
export async function makeDeflatedZip(files, opts = {}) {
  const enc = new TextEncoder();
  const entries = [];
  for (const f of files) {
    const data = toBytes(f.data);
    const packed = await deflate(data);
    const useDeflate = packed && packed.length < data.length;
    entries.push({
      name: enc.encode(String(f.name).replace(/\\/g, "/")), raw: data.length, crc: crc32(data),
      body: useDeflate ? packed : data, method: useDeflate ? 8 : 0, dt: dosDateTime(f.date || opts.date || new Date()),
    });
  }
  let size = 22;
  for (const e of entries) size += 30 + e.name.length + e.body.length + 46 + e.name.length;
  const out = new Uint8Array(size);
  const dv = new DataView(out.buffer);
  let p = 0;
  const u16 = (v) => { dv.setUint16(p, v, true); p += 2; };
  const u32 = (v) => { dv.setUint32(p, v >>> 0, true); p += 4; };
  const put = (b) => { out.set(b, p); p += b.length; };
  const FLAGS = 0x0800; // UTF-8 names
  for (const e of entries) {
    e.offset = p;
    u32(0x04034b50); u16(20); u16(FLAGS); u16(e.method); u16(e.dt.time); u16(e.dt.date);
    u32(e.crc); u32(e.body.length); u32(e.raw); u16(e.name.length); u16(0);
    put(e.name); put(e.body);
  }
  const cd = p;
  for (const e of entries) {
    u32(0x02014b50); u16(20); u16(20); u16(FLAGS); u16(e.method); u16(e.dt.time); u16(e.dt.date);
    u32(e.crc); u32(e.body.length); u32(e.raw); u16(e.name.length); u16(0); u16(0); u16(0); u16(0); u32(0); u32(e.offset);
    put(e.name);
  }
  const cdSize = p - cd;
  u32(0x06054b50); u16(0); u16(0); u16(entries.length); u16(entries.length); u32(cdSize); u32(cd); u16(0);
  return out;
}

// `project` → .ifczip bytes holding <name>.ifc (or .ifcxml when xml is set).
export async function exportIfcZip(project, { name = "model", xml = false, ...opts } = {}) {
  let text;
  if (xml) text = (await import("./ifcxml.js")).exportIfcXml(project, opts);
  else text = (await import("./ifc.js")).exportIfc(project, opts);
  return makeDeflatedZip([{ name: `${name}.${xml ? "ifcxml" : "ifc"}`, data: text }], opts);
}
