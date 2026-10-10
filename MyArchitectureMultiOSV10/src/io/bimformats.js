// Which of the other programs' building formats a file is, and reading it:
// Sweet Home 3D (.sh3d / Home.xml), gbXML (.gbxml / .xml) and IFC in a ZIP
// (.ifczip). The UI (src/ui/bimimport.js) asks and reports; this does the work.

// What a file is, from its extension and (for .xml) its root element.
export function bimKind(name, bytes) {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (ext === "sh3d") return "sh3d";
  if (ext === "gbxml") return "gbxml";
  if (ext === "ifczip") return "ifczip";
  if (ext === "xml") {
    const head = sniffText(bytes);
    if (/<(?:\w+:)?gbXML[\s>]/.test(head)) return "gbxml";
    if (/<home[\s>]/.test(head)) return "sh3d";
    if (/<(?:\w+:)?(?:ifcXML|iso_10303_28|uos)[\s>]/i.test(head) || /ifcXML/i.test(head)) return "ifcxml";
    return "xml";
  }
  return null;
}

// The first few KB of a file as text (UTF-8 or UTF-16).
function sniffText(bytes) {
  const b = bytes.subarray(0, 8192);
  const le = (b[0] === 0xff && b[1] === 0xfe) || (b[0] === 0x3c && b[1] === 0);
  const be = (b[0] === 0xfe && b[1] === 0xff) || (b[0] === 0 && b[1] === 0x3c);
  try { return new TextDecoder(le ? "utf-16le" : be ? "utf-16be" : "utf-8").decode(b); } catch { return ""; }
}

// → {project, warnings} for a .sh3d / .gbxml / .xml / .ifczip file object.
export async function readBimFile(f) {
  const kind = bimKind(f.name, f.bytes);
  if (kind === "sh3d") {
    const { importSh3d } = await import("./sh3d.js");
    return { kind, ...(await importSh3d(f.bytes, { name: f.name })) };
  }
  if (kind === "gbxml") {
    const { importGbxml } = await import("./gbxml.js");
    return { kind, ...importGbxml(f.bytes, { name: f.name }) };
  }
  if (kind === "ifczip") {
    const { zipEntries, zipEntryData } = await import("./unzip.js");
    const entries = zipEntries(f.bytes);
    const e = entries.find((x) => /\.ifc$/i.test(x.name));
    if (!e) {
      const err = new Error(entries.some((x) => /\.ifcxml$/i.test(x.name)) ? "This IFC ZIP holds ifcXML, which is not read." : "This ZIP archive holds no .ifc file.");
      err.code = "ifczip-empty";
      throw err;
    }
    const { importIfc } = await import("./ifc.js");
    const text = new TextDecoder().decode(await zipEntryData(f.bytes, e));
    return { kind, ...importIfc(text) };
  }
  return { kind };
}
