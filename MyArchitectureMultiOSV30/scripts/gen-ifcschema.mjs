// Generates src/io/ifcschema.js — the entity attribute tables ifcXML needs
// (attribute names in STEP order with their types, supertypes, inverse
// attributes) — from the official EXPRESS schemas of IFC4 and IFC2X3:
//
//   node scripts/gen-ifcschema.mjs <IFC4_ADD2_TC1.exp> <IFC2X3_TC1.exp>
//
// The EXPRESS files come from buildingSMART (github.com/buildingSMART/
// IFC4.3.x-development, folder reference_schemas). The generated module is
// checked in; this script only has to run again for a new schema release.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const BUILTIN = { REAL: "r", NUMBER: "r", INTEGER: "i", STRING: "s", BOOLEAN: "b", LOGICAL: "l", BINARY: "x" };

// "LIST [1:?] OF UNIQUE IfcX" → "L:IfcX"; builtins → one letter.
function typeDesc(src) {
  let s = src.replace(/\s+/g, " ").trim();
  let pre = "";
  for (;;) {
    const m = /^(LIST|SET|BAG|ARRAY)\s*\[[^\]]*\]\s*OF\s+(?:UNIQUE\s+)?(?:OPTIONAL\s+)?/i.exec(s);
    if (!m) break;
    pre += m[1].toUpperCase() === "ARRAY" || m[1].toUpperCase() === "LIST" ? "L:" : "S:";
    s = s.slice(m[0].length);
  }
  const base = s.replace(/\s*\(.*$/, "").replace(/\s+FIXED$/i, "").trim();
  return pre + (BUILTIN[base.toUpperCase()] || base);
}

function parseExpress(text) {
  const src = text.replace(/\(\*[\s\S]*?\*\)/g, " ");
  const types = new Map(); // name → descriptor ("e" enum, "S" select, or a type desc)
  const enums = new Map();
  const selects = new Map();
  for (const m of src.matchAll(/\bTYPE\s+(\w+)\s*=\s*([\s\S]*?);/g)) {
    const [, name, def] = m;
    const d = def.trim();
    if (/^ENUMERATION\s+OF/i.test(d)) {
      types.set(name, "e");
      enums.set(name, d.replace(/^ENUMERATION\s+OF\s*\(/i, "").replace(/\)\s*$/, "").split(",").map((x) => x.trim()));
    } else if (/^SELECT/i.test(d)) {
      types.set(name, "S");
      selects.set(name, d.replace(/^SELECT\s*\(/i, "").replace(/\)\s*$/, "").split(",").map((x) => x.trim()));
    } else types.set(name, typeDesc(d));
  }
  const entities = new Map();
  for (const m of src.matchAll(/\bENTITY\s+(\w+)([\s\S]*?)\bEND_ENTITY\s*;/g)) {
    const [, name, body] = m;
    const semi = body.indexOf(";");
    const head = body.slice(0, semi);
    const sup = /SUBTYPE\s+OF\s*\(\s*(\w+)\s*\)/i.exec(head);
    const abstract = /\bABSTRACT\b/i.test(head);
    const ent = { name, sup: sup ? sup[1] : null, abstract, attrs: [], derived: [], inverse: [] };
    let section = "explicit";
    for (let stmt of body.slice(semi + 1).split(";")) {
      stmt = stmt.trim();
      const sec = /^(DERIVE|INVERSE|WHERE|UNIQUE)\b/i.exec(stmt);
      if (sec) { section = sec[1].toUpperCase(); stmt = stmt.slice(sec[0].length).trim(); }
      if (!stmt) continue;
      if (section === "explicit") {
        const a = /^([\w\\.,\s]+?)\s*:\s*(OPTIONAL\s+)?([\s\S]+)$/i.exec(stmt);
        if (!a) continue;
        for (const nm of a[1].split(",").map((x) => x.trim())) {
          if (nm.startsWith("SELF\\")) continue; // a redeclaration keeps its place
          ent.attrs.push({ name: nm, type: typeDesc(a[3]), opt: !!a[2] });
        }
      } else if (section === "DERIVE") {
        const a = /^SELF\\(\w+)\.(\w+)\s*:/i.exec(stmt);
        if (a) ent.derived.push(a[2]);
      } else if (section === "INVERSE") {
        const a = /^(\w+)\s*:\s*(?:(SET|BAG|LIST)\s*\[\s*\d+\s*:\s*([\d?]+)\s*\]\s*OF\s+)?(\w+)\s+FOR\s+(\w+)/i.exec(stmt);
        if (a) ent.inverse.push({ name: a[1], entity: a[4], forAttr: a[5], one: !a[2] || a[3] === "1" });
      }
    }
    entities.set(name, ent);
  }
  return { types, enums, selects, entities };
}

// Compact text: one entity per line
//   Name<Super!  (! = abstract)  |attr=type?|...  #derived,...  ~inv=Entity.For,...
function encode({ types, entities }) {
  const T = [...types].map(([k, v]) => `${k}=${v}`).join(";");
  const E = [...entities.values()].map((e) => {
    let s = `${e.name}<${e.sup || ""}${e.abstract ? "!" : ""}`;
    for (const a of e.attrs) s += `|${a.name}=${a.type}${a.opt ? "?" : ""}`;
    if (e.derived.length) s += `#${e.derived.join(",")}`;
    if (e.inverse.length) s += `~${e.inverse.map((i) => `${i.name}=${i.entity}.${i.forAttr}${i.one ? "!" : ""}`).join(",")}`;
    return s;
  }).join("\n");
  return { T, E };
}

// The IFC4 ifcXML schema (IFC4_ADD2.xsd) leaves 21 forward attributes out
// (IfcRelAggregates.RelatingObject, IfcStyledItem.Item…): the relationship
// is written inside its owner through an inverse element (IsDecomposedBy,
// StyledByItem…). → {X: suppressed "Entity.Attr" list, O: "Entity:el,el" —
// the element order of every entity level that has inverse elements, "!"
// after an inverse the XSD writes as one element of the relationship type}.
function xsdLayout(xsdText, schema) {
  const out = { X: [], O: [] };
  const types = new Map();
  for (const m of xsdText.matchAll(/<xs:complexType name="(Ifc\w+)"[^>]*>([\s\S]*?)\n\t<\/xs:complexType>/g)) {
    types.set(m[1], { els: [...m[2].matchAll(/<xs:element name="(\w+)"/g)].map((x) => x[1]), single: new Set([...m[2].matchAll(/<xs:element name="(\w+)" type=/g)].map((x) => x[1])), ats: [...m[2].matchAll(/<xs:attribute name="(\w+)"/g)].map((x) => x[1]) });
  }
  for (const e of schema.entities.values()) {
    const t = types.get(e.name);
    if (!t) continue;
    for (const a of e.attrs) if (!t.els.includes(a.name) && !t.ats.includes(a.name)) out.X.push(`${e.name}.${a.name}`);
    const inv = new Set(e.inverse.map((i) => i.name));
    // Inverses declared on a supertype show up on the level that declares them.
    if (t.els.some((n) => inv.has(n))) out.O.push(`${e.name}:${t.els.map((n) => (inv.has(n) && t.single.has(n) ? `${n}!` : n)).join(",")}`);
  }
  return { X: out.X.join(";"), O: out.O.join(";") };
}

const [f4, f2, x4] = process.argv.slice(2);
if (!f4 || !f2 || !x4) { console.error("usage: node scripts/gen-ifcschema.mjs IFC4_ADD2_TC1.exp IFC2X3_TC1.exp IFC4_ADD2.xsd"); process.exit(1); }
const out = [];
out.push("// Generated by scripts/gen-ifcschema.mjs from the buildingSMART EXPRESS");
out.push("// schemas IFC4 ADD2 TC1 and IFC2X3 TC1 — do not edit by hand.");
out.push("// Per schema: T = defined types (name=descriptor; e enum, S select,");
out.push("// r real, i integer, s string, b boolean, l logical, x binary, L:/S: a");
out.push("// list/set of the rest, otherwise another type or an entity name) and");
out.push("// E = entities, one per line: Name<Supertype[!abstract]|attr=type[?]…");
out.push("// #derived attributes ~inverse=Entity.ForAttribute[! at most one],…");
out.push("");
out.push("// IFC4 also has X = attributes its ifcXML schema writes through an inverse");
out.push("// element of the owner instead, and O = element order of the entity levels");
out.push("// that carry such inverse elements (from IFC4_ADD2.xsd).");
out.push("");
for (const [key, file] of [["IFC4", f4], ["IFC2X3", f2]]) {
  const schema = parseExpress(readFileSync(file, "latin1"));
  const enc = encode(schema);
  out.push(`export const ${key} = {`);
  out.push(`  T: ${JSON.stringify(enc.T)},`);
  out.push(`  E: ${JSON.stringify(enc.E)},`);
  if (key === "IFC4") {
    const lay = xsdLayout(readFileSync(x4, "utf8"), schema);
    out.push(`  X: ${JSON.stringify(lay.X)},`);
    out.push(`  O: ${JSON.stringify(lay.O)},`);
  }
  out.push("};");
  out.push("");
}
const dest = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "io", "ifcschema.js");
writeFileSync(dest, out.join("\n"));
console.log(`wrote ${dest}`);
