// ifcXML (ISO 10303-28) and IFC ZIP: hand-written files in both flavours
// (IFC4 ifcXML with attribute values and nested inverse relationships,
// IFC2x3 ifcXML with element values and ex:double-wrapper lists), our own
// IFC export written as ifcXML and read back to the very same entity graph,
// the import through ifc.js, .ifczip holding .ifc or .ifcxml, and — when
// xmllint and the buildingSMART schemas are at hand (MYARCH_XSD_DIR with
// IFC4_ADD2.xsd, IFC2X3.xsd and ex.xsd) — validity against the XSD.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync, mkdtempSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { IFC4_XML, IFC2X3_XML } from "./ifcxml-fixtures.mjs";
import { parseIfcXml, importIfcXml, stepToIfcXml, exportIfcXml, schemaModel, looksLikeIfcXml } from "../../src/io/ifcxml.js";
import { exportIfc, importIfc, parseStep } from "../../src/io/ifc.js";
import { exportIfcZip, makeDeflatedZip } from "../../src/io/ifczip.js";
import { readBimFile, bimKind } from "../../src/io/bimformats.js";
import { parseProject } from "../../src/core/project.js";

const TS = "2026-01-02T03:04:05";
const root = path.resolve(import.meta.dirname, "..", "..");
const sample = (f) => parseProject(readFileSync(path.join(root, "sample", f), "utf8"));
const counts = (p) => ({ levels: p.levels.length, walls: p.walls.length, openings: p.openings.length, rooms: p.rooms.length, roofs: p.roofs.length, columns: p.columns.length, stairs: p.stairs.length, furniture: p.furniture.length, solids: p.solids.length });

// The entity graph read from ifcXML equals the STEP one (the ids are
// renumbered in order of appearance: map them through the i<n> ids).
function sameGraph(step, xml) {
  const a = parseStep(step);
  const b = parseIfcXml(xml).entities;
  assert.equal(b.size, a.size, "entity count");
  const seen = new Map();
  let n = 1;
  for (const m of xml.matchAll(/ (?:id|ref)="i(\d+)"/g)) if (!seen.has(+m[1])) seen.set(+m[1], n++);
  const norm = (v, map) => (v === null || (v && v.derived) ? null : Array.isArray(v) ? v.map((x) => norm(x, map)) : v && typeof v === "object" ? ("ref" in v ? { ref: map(v.ref) } : "typed" in v ? { typed: v.typed, value: norm(v.value, map) } : v) : v);
  for (const [id, e] of a) {
    const e2 = b.get(seen.get(id));
    assert.ok(e2, `#${id} ${e.type} is in the ifcXML`);
    assert.deepEqual({ t: e2.type, a: norm(e2.args, (r) => r) }, { t: e.type, a: norm(e.args, (r) => seen.get(r)) }, `#${id} ${e.type}`);
  }
}

describe("ifcXML schema tables", () => {
  test("attribute order and inheritance come from the EXPRESS schemas", () => {
    const m4 = schemaModel("IFC4"), m2 = schemaModel("IFC2X3");
    assert.deepEqual(m4.ents.get("IFCDOOR").attrs.map((a) => a.name), ["GlobalId", "OwnerHistory", "Name", "Description", "ObjectType", "ObjectPlacement", "Representation", "Tag", "OverallHeight", "OverallWidth", "PredefinedType", "OperationType", "UserDefinedOperationType"]);
    assert.equal(m2.ents.get("IFCDOOR").attrs.length, 10, "IFC2x3 doors have no PredefinedType");
    assert.ok(m4.ents.get("IFCSIUNIT").attrs.find((a) => a.name === "Dimensions").derived, "IfcSIUnit.Dimensions is derived");
    assert.deepEqual(m4.ents.get("IFCOBJECTDEFINITION").inv.get("IsDecomposedBy"), { entity: "IFCRELAGGREGATES", forAttr: "RelatingObject", one: false });
    assert.ok(m4.suppressed.has("IFCRELAGGREGATES.RelatingObject"), "IFC4 ifcXML writes RelatingObject through IsDecomposedBy");
  });
});

describe("ifcXML import", () => {
  test("IFC4 ifcXML: attributes, xsi:type references and nested inverse relationships", () => {
    assert.ok(looksLikeIfcXml(IFC4_XML));
    const g = parseIfcXml(IFC4_XML);
    assert.equal(g.schema, "IFC4");
    const { project: p, warnings } = importIfcXml(IFC4_XML);
    assert.equal(p.meta.title, "Hand made & tested");
    assert.deepEqual(p.levels.map((l) => [l.name, l.elevation]), [["Ground floor", 0]]);
    assert.equal(p.walls.length, 2);
    const south = p.walls.find((w) => w.y1 === 0 && w.y2 === 0);
    assert.deepEqual([south.x1, south.x2, south.thickness], [0, 5000, 200]);
    const west = p.walls.find((w) => w !== south);
    assert.deepEqual([west.x1, west.y1, west.x2, west.y2], [0, 0, 0, -4000], "IFC y north is plan y up");
    assert.equal(p.openings.length, 1, "the door fills the opening voiding the wall");
    const d = p.openings[0];
    assert.deepEqual([d.kind, d.wall, d.at, d.width, d.height, d.sill], ["door", south.id, 1500, 900, 2100, 0]);
    assert.deepEqual(warnings, []);
  });

  test("IFC2x3 ifcXML: iso_10303_28 / uos, element values, wrapper lists, metres", () => {
    const g = parseIfcXml(IFC2X3_XML);
    assert.equal(g.schema, "IFC2X3");
    const { project: p } = importIfcXml(new TextEncoder().encode(IFC2X3_XML));
    assert.deepEqual(p.levels.map((l) => [l.name, l.elevation]), [["EG", 0], ["OG", 3000]]);
    assert.equal(p.walls.length, 1);
    const w = p.walls[0];
    assert.equal(p.levels.find((l) => l.id === w.level).name, "OG");
    assert.deepEqual([w.x1, w.x2, w.thickness, w.y1], [0, 6000, 250, -125], "metres become millimetres");
    assert.equal(w.height ?? p.levels[1].height, 2800);
    assert.equal(w.props["Pset_WallCommon.FireRating"], "REI 60", "IfcLabel select value in a property");
  });

  test("UTF-16 with a byte order mark, and a file that is not ifcXML", () => {
    const le = new Uint8Array([0xff, 0xfe, ...new Uint8Array(new Uint16Array([...IFC2X3_XML].map((c) => c.charCodeAt(0))).buffer)]);
    assert.equal(importIfcXml(le).project.walls.length, 1);
    assert.throws(() => parseIfcXml("<svg/>"), (e) => e.code === "ifcxml-not");
  });
});

describe("ifcXML export", () => {
  for (const schema of ["IFC4", "IFC2X3"]) {
    test(`${schema}: our IFC export as ifcXML reads back to the same entity graph and project`, () => {
      const p = sample("03-two-storey-house.myarch");
      const step = exportIfc(p, { schema, timestamp: TS });
      const xml = stepToIfcXml(step, { timestamp: TS });
      assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
      assert.match(xml, schema === "IFC4" ? /<ifcXML xmlns="http:\/\/www.buildingsmart-tech.org\/ifcXML\/IFC4\/Add2"/ : /<ex:iso_10303_28 [^>]*>[\s\S]*<uos id="uos_1"[^>]*configuration="i_ifc2x3"/);
      sameGraph(step, xml);
      const a = importIfc(step).project, b = importIfcXml(xml).project;
      assert.deepEqual(counts(b), counts(a));
      assert.deepEqual(b.walls.map((w) => [w.x1, w.y1, w.x2, w.y2, w.thickness, w.height, w.type]), a.walls.map((w) => [w.x1, w.y1, w.x2, w.y2, w.thickness, w.height, w.type]));
      assert.deepEqual(b.roofs.map((r) => [r.kind, r.pitch]), a.roofs.map((r) => [r.kind, r.pitch]));
    });
  }

  test("every sample survives IFC → ifcXML → IFC with the same elements (both schemas)", () => {
    for (const f of ["01-studio.myarch", "06-renovation-bim.myarch", "07-massing-study.myarch", "14-courtyard-house.myarch"]) {
      const p = sample(f);
      for (const schema of ["IFC4", "IFC2X3"]) {
        const ref = importIfc(exportIfc(p, { schema, timestamp: TS })).project;
        const back = importIfcXml(exportIfcXml(p, { schema, timestamp: TS })).project;
        assert.deepEqual(counts(back), counts(ref), `${f} ${schema}`);
      }
    }
  });

  test("IFC4: the owner pointers the XSD leaves out go through inverse elements", () => {
    const xml = exportIfcXml(sample("01-studio.myarch"), { timestamp: TS });
    assert.doesNotMatch(xml, /<RelatingObject[ >]/, "IfcRelAggregates.RelatingObject is written as IsDecomposedBy");
    assert.match(xml, /<IsDecomposedBy>\s*<IfcRelAggregates ref="i\d+" xsi:nil="true"\/>/);
    assert.match(xml, /<HasOpenings ref="i\d+" xsi:type="IfcRelVoidsElement" xsi:nil="true"\/>/);
    assert.match(xml, /<StyledByItem ref="i\d+" xsi:type="IfcStyledItem" xsi:nil="true"\/>/);
    assert.match(xml, /<IfcCartesianPoint id="i\d+" Coordinates="[-\d. ]+"\/>/, "numeric lists as one attribute");
    assert.match(xml, /<NominalValue>\s*<Ifc\w+-wrapper>/, "select values in -wrapper elements");
  });

  test("special characters survive in names and property values", () => {
    const p = sample("01-studio.myarch");
    p.meta.title = "Tom & Jerry's <\"house\">";
    p.walls[0].props = { Note: "a < b & c > d \"q\" 한국어" };
    const back = importIfcXml(exportIfcXml(p, { timestamp: TS })).project;
    assert.equal(back.meta.title, p.meta.title);
    assert.ok(back.walls.some((w) => w.props && w.props.Note === p.walls[0].props.Note));
  });
});

describe("IFC ZIP export and import", () => {
  test(".ifczip holding .ifc or .ifcxml is deflated and reads like the plain file", async () => {
    const p = sample("03-two-storey-house.myarch");
    const ref = counts(importIfc(exportIfc(p, { timestamp: TS })).project);
    for (const xml of [false, true]) {
      const bytes = await exportIfcZip(p, { name: "house", xml, timestamp: TS });
      assert.equal(bytes[0], 0x50, "PK");
      assert.equal(new DataView(bytes.buffer).getUint16(8, true), 8, "deflated");
      const plain = xml ? exportIfcXml(p, { timestamp: TS }) : exportIfc(p, { timestamp: TS });
      assert.ok(bytes.length < plain.length / 3, `compressed (${bytes.length} of ${plain.length} bytes)`);
      assert.equal(bimKind("house.ifczip", bytes), "ifczip");
      const r = await readBimFile({ name: "house.ifczip", bytes });
      assert.deepEqual(counts(r.project), ref);
    }
    const r2 = await readBimFile({ name: "m.ifczip", bytes: await makeDeflatedZip([{ name: "x/model.ifcxml", data: IFC4_XML }]) });
    assert.equal(r2.project.walls.length, 2);
  });

  test(".ifcxml and ifcXML in a .xml are recognised", async () => {
    const bytes = new TextEncoder().encode(IFC2X3_XML);
    assert.equal(bimKind("a.ifcxml", bytes), "ifcxml");
    assert.equal(bimKind("a.xml", bytes), "ifcxml");
    const r = await readBimFile({ name: "a.xml", bytes });
    assert.equal(r.kind, "ifcxml");
    assert.equal(r.project.walls.length, 1);
  });
});

// ---------------------------------------------------------------- XSD
const xsdDir = process.env.MYARCH_XSD_DIR || "";
const lint = spawnSync("xmllint", ["--version"], { encoding: "utf8" });
const haveLint = !lint.error && lint.status === 0;
const xsd4 = path.join(xsdDir, "IFC4_ADD2.xsd"), xsd2 = path.join(xsdDir, "IFC2X3.xsd"), exXsd = path.join(xsdDir, "ex.xsd");
const skip = !haveLint ? "xmllint is not installed" : !xsdDir || !existsSync(xsd4) || !existsSync(xsd2) || !existsSync(exXsd) ? "set MYARCH_XSD_DIR to a folder with IFC4_ADD2.xsd, IFC2X3.xsd and ex.xsd" : false;

describe("ifcXML against the buildingSMART XSD", { skip }, () => {
  const tmp = skip ? "" : mkdtempSync(path.join(os.tmpdir(), "myarch-ifcxml-"));
  const validate = (xml, schemaFile, name) => {
    const f = path.join(tmp, name);
    writeFileSync(f, xml);
    const r = spawnSync("xmllint", ["--noout", "--schema", schemaFile, f], { encoding: "utf8" });
    return (r.stderr || "").split(/\r?\n/).filter((l) => /error/i.test(l));
  };
  test("IFC2x3 ifcXML validates", () => {
    // IFC2X3.xsd imports ex.xsd from the web: point it at the local copy.
    const local = path.join(tmp, "IFC2X3-local.xsd");
    writeFileSync(local, readFileSync(xsd2, "utf8").replace(/schemaLocation="[^"]*ex\.xsd"/, `schemaLocation="${exXsd.replace(/\\/g, "/")}"`));
    for (const f of ["01-studio.myarch", "14-courtyard-house.myarch"]) assert.deepEqual(validate(exportIfcXml(sample(f), { schema: "IFC2X3", timestamp: TS }), local, `${f}-2x3.ifcxml`), [], f);
  });
  test("IFC4 ifcXML validates (apart from the IFC4_ADD2.xsd limit of one HasOpenings per wall)", () => {
    for (const f of ["07-massing-study.myarch", "01-studio.myarch"]) {
      const errors = validate(exportIfcXml(sample(f), { timestamp: TS }), xsd4, `${f}-4.ifcxml`).filter((l) => !/HasOpenings|HasFillings|fails to validate/.test(l));
      assert.deepEqual(errors, [], f);
    }
  });
});
