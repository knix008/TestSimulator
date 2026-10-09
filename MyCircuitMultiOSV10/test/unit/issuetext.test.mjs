// Every ERC/DRC message shape has a Korean rendering, and a real ERC run
// (broken schematic) comes out fully translated.
import test from "node:test";
import assert from "node:assert/strict";

globalThis.document = globalThis.document || { documentElement: {} };
const { setLanguage } = await import("../../src/ui/i18n.js");
const { issueText } = await import("../../src/ui/issuetext.js");
const { newProject } = await import("../../src/core/project.js");
const { runERC } = await import("../../src/core/netlist.js");
const { newPart, addWire } = await import("../../src/sch/ops.js");

const SAMPLES = [
  'Unknown symbol "FOO"', "R? is not annotated", "Duplicate reference U1", "R1 has no footprint assigned",
  "Outputs U1.3, U2.3 drive the same net Q", "Power input U1.8 (VCC) on net +5V is not driven by any power output (add a PWR_FLAG)",
  "Pin U1.2 (TR) is not connected", "Pin R1.1 has a no-connect flag but is connected", "Net CLK has only input pins",
  "Wire end is not connected to anything", 'Label "SDA" is only used once', "No-connect flag is not on a pin",
  'R1: footprint "R_9999" not found in the library', "Board outline needs at least 3 points", "Board outline has an invalid point",
  "Board outline has zero area", "Board outline crosses itself", "J1: footprint is outside the board outline", "J1: footprint is not fully inside the board outline",
  "Courtyards of R1 and C1 overlap", "Track width 0.1 mm < minimum 0.15 mm", "Via drill 0.2 mm < minimum 0.3 mm", "Via annular ring 0.05 mm < 0.13 mm",
  "Pad J1.1 drill 0.2 mm < minimum 0.3 mm", "Pad J1.1 annular ring 0.1 mm < 0.13 mm", "Hole spacing 0.1 mm < 0.25 mm (via / J1.2)",
  "Unnetted track touches pad R1.1 of net GND", "Short between GND and VCC (track / pad R1.2)", "Clearance 0.12 mm < 0.2 mm between GND and SIG (track / via)",
  "Zones GND and VCC overlap on F.Cu with equal priority", "via is outside the board outline", "pad R1.1 is 0.1 mm from the board edge (< 0.3 mm)",
  "Dangling track end (SIG)", "Silkscreen over pad U1.3", "Unconnected net GND",
];

test("every known message shape is translated to Korean", () => {
  setLanguage("ko");
  for (const m of SAMPLES) {
    const out = issueText(m);
    assert.notEqual(out, m, `untranslated: ${m}`);
    assert.match(out, /[가-힣]/, `no Hangul: ${out}`);
  }
  setLanguage("en");
  assert.equal(issueText(SAMPLES[0]), SAMPLES[0], "English passes through");
});

test("a real ERC run is fully translated", () => {
  const s = newProject().schematic;
  s.parts.push(newPart("NE555", 2000, 2000, { ref: "U1" }), newPart("R", 4000, 2000, { ref: "U1" }), newPart("R", 5000, 2000));
  s.noconnects.push({ id: "n", x: 9999, y: 9999 });
  addWire(s, 100, 100, 600, 100);
  setLanguage("ko");
  const issues = runERC(s);
  assert.ok(issues.length > 5);
  for (const is of issues) assert.match(issueText(is.message), /[가-힣]/, is.message);
  setLanguage("en");
});
