import test from "node:test";
import assert from "node:assert/strict";
import { newProject } from "../../src/core/project.js";
import { partPins } from "../../src/core/netlist.js";
import { buildCircuit, simulate, toSpiceNetlist } from "../../src/sim/engine.js";

// Build a project from [{lib, ref, value, fields, nets: {pinNum: "NET"}}].
// Parts are spread out on a grid; each listed pin gets a label (or a GND power
// symbol for "GND") right on its tip, so pins with the same net text connect.
function circuit(specs) {
  const p = newProject("sim test");
  const sch = p.schematic;
  let id = 0;
  specs.forEach((s, i) => {
    const part = { id: `p${++id}`, lib: s.lib, ref: s.ref, value: s.value ?? "", footprint: "", x: 2000 + (i % 6) * 1500, y: 2000 + Math.floor(i / 6) * 1500, rot: 0, mirror: false, fields: s.fields || {} };
    sch.parts.push(part);
    for (const pin of partPins(part)) {
      const net = s.nets[pin.num];
      if (!net) continue;
      if (net === "GND") sch.parts.push({ id: `g${++id}`, lib: "GND", ref: "#PWR", value: "GND", x: pin.x, y: pin.y, rot: 0, mirror: false, fields: {} });
      else sch.labels.push({ id: `l${++id}`, kind: "local", text: net, x: pin.x, y: pin.y, rot: 0 });
    }
  });
  return p;
}

const near = (actual, expected, tol, msg) => assert.ok(Math.abs(actual - expected) <= tol, `${msg || ""} expected ${expected} ± ${tol}, got ${actual}`);
const at = (res, sig, t) => {
  const i = res.time.findIndex((x) => Math.abs(x - t) < 1e-12);
  assert.ok(i >= 0, `time ${t} not in output`);
  return res.signals[sig][i];
};

test("voltage divider 10 V, 1k/1k gives 5.000 V", () => {
  const p = circuit([
    { lib: "VSOURCE", ref: "V1", value: "10", nets: { 1: "VIN", 2: "GND" } },
    { lib: "R", ref: "R1", value: "1k", nets: { 1: "VIN", 2: "OUT" } },
    { lib: "R", ref: "R2", value: "1k", nets: { 1: "OUT", 2: "GND" } },
  ]);
  const r = simulate(p, { mode: "op" });
  assert.ok(r.ok, r.errors.join("; "));
  near(r.voltages.OUT, 5, 1e-6);
  near(r.voltages.VIN, 10, 1e-9);
  assert.equal(r.voltages.GND, 0);
  near(r.currents.R1, 5e-3, 1e-9, "R1 current");
  near(r.currents.V1, -5e-3, 1e-9, "source current (into + pin)");
  near(r.power.V1, -0.05, 1e-9, "source delivers 50 mW");
  near(r.power.R1, 0.025, 1e-9);
});

test("buildCircuit: nodes, ground and gmin-safe structure", () => {
  const p = circuit([
    { lib: "BATTERY", ref: "BT1", value: "9", nets: { 1: "VIN", 2: "GND" } },
    { lib: "R", ref: "R1", value: "4k7", nets: { 1: "VIN", 2: "GND" } },
    { lib: "MOUNTING_HOLE", ref: "H1", nets: {} },
    { lib: "CRYSTAL", ref: "Y1", nets: { 1: "VIN", 2: "GND" } },
  ]);
  const c = buildCircuit(p);
  assert.equal(c.ground, "GND");
  assert.deepEqual(c.nodes, ["VIN"]);
  assert.equal(c.elements.length, 2);
  assert.equal(c.errors.length, 0);
  assert.ok(c.warnings.some((w) => w.includes("Y1")), "crystal without model warns");
  assert.ok(!c.warnings.some((w) => w.includes("H1")), "mounting hole is silent");
});

test("missing ground is an error", () => {
  const p = circuit([
    { lib: "VSOURCE", ref: "V1", value: "5", nets: { 1: "A", 2: "B" } },
    { lib: "R", ref: "R1", value: "1k", nets: { 1: "A", 2: "B" } },
  ]);
  const r = simulate(p, { mode: "op" });
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /No GND net/);
});

test("voltage source loop reports a singular matrix naming the source", () => {
  const p = circuit([
    { lib: "VSOURCE", ref: "V1", value: "5", nets: { 1: "A", 2: "GND" } },
    { lib: "VSOURCE", ref: "V2", value: "3", nets: { 1: "A", 2: "GND" } },
  ]);
  const r = simulate(p, { mode: "op" });
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /Singular matrix at V[12]/);
});

test("floating net is named in a warning", () => {
  const p = circuit([
    { lib: "VSOURCE", ref: "V1", value: "5", nets: { 1: "A", 2: "GND" } },
    { lib: "R", ref: "R1", value: "1k", nets: { 1: "A", 2: "GND" } },
    { lib: "C", ref: "C1", value: "1u", nets: { 1: "A", 2: "ISLAND" } },
    { lib: "R", ref: "R2", value: "1k", nets: { 1: "ISLAND", 2: "ISLAND2" } },
  ]);
  const r = simulate(p, { mode: "op" });
  assert.ok(r.ok);
  assert.ok(r.warnings.some((w) => w.includes("Net ISLAND ")), r.warnings.join("\n"));
});

test("RC charging: V(tau) = 63.2 % within 1 % (zero initial conditions)", () => {
  const p = circuit([
    { lib: "VSOURCE", ref: "V1", value: "5", nets: { 1: "VIN", 2: "GND" } },
    { lib: "R", ref: "R1", value: "1k", nets: { 1: "VIN", 2: "OUT" } },
    { lib: "C", ref: "C1", value: "1u", nets: { 1: "OUT", 2: "GND" } },
  ]);
  const r = simulate(p, { mode: "tran", tStop: "5m", tStep: "10u", uic: true });
  assert.ok(r.ok, r.errors.join("; "));
  near(r.signals["V(OUT)"][0], 0, 1e-6, "starts discharged");
  const v = at(r, "V(OUT)", 1e-3);
  near(v / 5, 1 - Math.exp(-1), 0.01 * (1 - Math.exp(-1)));
  near(at(r, "V(OUT)", 5e-3), 5 * (1 - Math.exp(-5)), 0.01);
  // Capacitor current at t = tau: (5 - v) / R
  near(at(r, "I(C1)", 1e-3), (5 - v) / 1000, 2e-5);
});

test("RC driven by a pulse source starts from the DC operating point", () => {
  const p = circuit([
    { lib: "VSOURCE", ref: "V1", value: "0", fields: { wave: "pulse", offset: "0", amplitude: "5", period: "20m", duty: "50" }, nets: { 1: "VIN", 2: "GND" } },
    { lib: "R", ref: "R1", value: "1k", nets: { 1: "VIN", 2: "OUT" } },
    { lib: "C", ref: "C1", value: "1u", nets: { 1: "OUT", 2: "GND" } },
  ]);
  const r = simulate(p, { mode: "tran", tStop: "20m", tStep: "10u" });
  assert.ok(r.ok, r.errors.join("; "));
  near(at(r, "V(OUT)", 1e-3) / 5, 0.632, 0.01);
  near(at(r, "V(OUT)", 9e-3), 5, 0.01, "charged before the falling edge");
  near(at(r, "V(OUT)", 11e-3) / 5, Math.exp(-1), 0.01, "discharges after the falling edge");
});

test("RL current rise: i(tau) = 63.2 % of V/R", () => {
  const p = circuit([
    { lib: "VSOURCE", ref: "V1", value: "1", nets: { 1: "VIN", 2: "GND" } },
    { lib: "R", ref: "R1", value: "10", nets: { 1: "VIN", 2: "MID" } },
    { lib: "L", ref: "L1", value: "10m", nets: { 1: "MID", 2: "GND" } },
  ]);
  const r = simulate(p, { mode: "tran", tStop: "5m", tStep: "5u", uic: true });
  assert.ok(r.ok, r.errors.join("; "));
  near(at(r, "I(L1)", 1e-3), 0.1 * (1 - Math.exp(-1)), 0.001);
  const op = simulate(p, { mode: "op" });
  near(op.currents.L1, 0.1, 1e-9, "inductor is a short at DC");
});

test("LED + 330 Ω on 5 V: 1.8-2.1 V forward, 9-10 mA", () => {
  const p = circuit([
    { lib: "VSOURCE", ref: "V1", value: "5", nets: { 1: "VCC", 2: "GND" } },
    { lib: "R", ref: "R1", value: "330", nets: { 1: "VCC", 2: "A" } },
    { lib: "LED", ref: "D1", value: "Red", nets: { 2: "A", 1: "GND" } },
  ]);
  const r = simulate(p, { mode: "op" });
  assert.ok(r.ok, r.errors.join("; "));
  const vf = r.voltages.A;
  assert.ok(vf >= 1.8 && vf <= 2.1, `LED Vf ${vf}`);
  assert.ok(r.currents.D1 >= 9e-3 && r.currents.D1 <= 10e-3, `LED current ${r.currents.D1}`);
  near(r.currents.D1, r.currents.R1, 1e-9);
  assert.ok(!("D1#rs" in r.voltages), "internal nodes are not reported");
});

test("1N4148 forward drop and zener breakdown", () => {
  const p = circuit([
    { lib: "VSOURCE", ref: "V1", value: "12", nets: { 1: "VCC", 2: "GND" } },
    { lib: "R", ref: "R1", value: "1k", nets: { 1: "VCC", 2: "Z" } },
    { lib: "D_ZENER", ref: "D1", value: "5V1", nets: { 1: "Z", 2: "GND" } },
    { lib: "R", ref: "R2", value: "10k", nets: { 1: "VCC", 2: "A" } },
    { lib: "D", ref: "D2", nets: { 2: "A", 1: "GND" } },
  ]);
  const r = simulate(p, { mode: "op" });
  assert.ok(r.ok, r.errors.join("; "));
  assert.ok(r.voltages.Z > 5.0 && r.voltages.Z < 5.4, `zener ${r.voltages.Z}`);
  assert.ok(r.currents.D1 < -5e-3, "zener conducts in reverse");
  assert.ok(r.voltages.A > 0.5 && r.voltages.A < 0.7, `diode ${r.voltages.A}`);
});

test("NPN common emitter driven into saturation", () => {
  const p = circuit([
    { lib: "VSOURCE", ref: "V1", value: "5", nets: { 1: "VCC", 2: "GND" } },
    { lib: "R", ref: "RB", value: "10k", nets: { 1: "VCC", 2: "B" } },
    { lib: "R", ref: "RC", value: "1k", nets: { 1: "VCC", 2: "C" } },
    { lib: "Q_NPN", ref: "Q1", nets: { 2: "B", 3: "C", 1: "GND" } },
  ]);
  const r = simulate(p, { mode: "op" });
  assert.ok(r.ok, r.errors.join("; "));
  assert.ok(r.voltages.C < 0.2, `Vce(sat) ${r.voltages.C}`);
  assert.ok(r.voltages.B > 0.6 && r.voltages.B < 0.85, `Vbe ${r.voltages.B}`);
  near(r.currents.Q1, (5 - r.voltages.C) / 1000, 1e-6, "Ic = RC current");
  assert.ok(r.currents.Q1 / r.pinCurrents.Q1["2"] < 200, "forced beta below bf");
});

test("NPN in the active region follows beta", () => {
  const p = circuit([
    { lib: "VSOURCE", ref: "V1", value: "10", nets: { 1: "VCC", 2: "GND" } },
    { lib: "R", ref: "RB", value: "1Meg", nets: { 1: "VCC", 2: "B" } },
    { lib: "R", ref: "RC", value: "1k", nets: { 1: "VCC", 2: "C" } },
    { lib: "Q_NPN", ref: "Q1", nets: { 2: "B", 3: "C", 1: "GND" } },
  ]);
  const r = simulate(p, { mode: "op" });
  assert.ok(r.ok);
  const ib = r.pinCurrents.Q1["2"];
  near(r.currents.Q1 / ib, 200, 2);
  assert.ok(r.voltages.C > 1 && r.voltages.C < 9);
});

test("PNP high-side switch saturates", () => {
  const p = circuit([
    { lib: "VSOURCE", ref: "V1", value: "5", nets: { 1: "VCC", 2: "GND" } },
    { lib: "Q_PNP", ref: "Q1", nets: { 1: "VCC", 2: "B", 3: "C" } },
    { lib: "R", ref: "RB", value: "10k", nets: { 1: "B", 2: "GND" } },
    { lib: "R", ref: "RL", value: "1k", nets: { 1: "C", 2: "GND" } },
  ]);
  const r = simulate(p, { mode: "op" });
  assert.ok(r.ok, r.errors.join("; "));
  assert.ok(r.voltages.C > 4.8, `PNP collector ${r.voltages.C}`);
  assert.ok(r.currents.Q1 < 0, "collector current flows out of a PNP");
});

test("NMOS and PMOS square law", () => {
  const p = circuit([
    { lib: "VSOURCE", ref: "V1", value: "10", nets: { 1: "VDD", 2: "GND" } },
    { lib: "VSOURCE", ref: "V2", value: "3.1", nets: { 1: "G", 2: "GND" } },
    { lib: "R", ref: "RD", value: "100", nets: { 1: "VDD", 2: "D" } },
    { lib: "Q_NMOS", ref: "Q1", nets: { 2: "G", 3: "D", 1: "GND" } },
    { lib: "Q_PMOS", ref: "Q2", nets: { 1: "VDD", 2: "GND", 3: "PD" } },
    { lib: "R", ref: "RP", value: "1k", nets: { 1: "PD", 2: "GND" } },
  ]);
  const r = simulate(p, { mode: "op" });
  assert.ok(r.ok, r.errors.join("; "));
  // Saturation: Id = k/2 (1.0)^2 (1 + lambda Vds) ≈ 50 mA → Vd ≈ 5 V
  const vd = r.voltages.D;
  near(r.currents.Q1, 0.05 * (1 + 0.01 * vd), 1e-6);
  near(vd, 10 - 100 * r.currents.Q1, 1e-6);
  assert.ok(r.voltages.PD > 9.5, `PMOS switch output ${r.voltages.PD}`);
});

test("op-amp non-inverting gain 2: 1 V in → 2 V out", () => {
  const p = circuit([
    { lib: "VSOURCE", ref: "V1", value: "1", nets: { 1: "IN", 2: "GND" } },
    { lib: "OPAMP", ref: "U1", nets: { 3: "IN", 2: "FB", 1: "OUT" } },
    { lib: "R", ref: "RF", value: "10k", nets: { 1: "OUT", 2: "FB" } },
    { lib: "R", ref: "RG", value: "10k", nets: { 1: "FB", 2: "GND" } },
  ]);
  const r = simulate(p, { mode: "op" });
  assert.ok(r.ok, r.errors.join("; "));
  near(r.voltages.OUT, 2, 1e-3);
  assert.ok(r.warnings.some((w) => /±15 V/.test(w)));
});

test("op-amp output clamps to its supply rails", () => {
  const p = circuit([
    { lib: "VSOURCE", ref: "V1", value: "3", nets: { 1: "IN", 2: "GND" } },
    { lib: "VSOURCE", ref: "V2", value: "5", nets: { 1: "VCC", 2: "GND" } },
    { lib: "OPAMP", ref: "U1", nets: { 3: "IN", 2: "FB", 1: "OUT", 7: "VCC", 4: "GND" } },
    { lib: "R", ref: "RF", value: "10k", nets: { 1: "OUT", 2: "FB" } },
    { lib: "R", ref: "RG", value: "10k", nets: { 1: "FB", 2: "GND" } },
  ]);
  const r = simulate(p, { mode: "op" });
  assert.ok(r.ok, r.errors.join("; "));
  assert.ok(r.voltages.OUT > 4.9 && r.voltages.OUT <= 5.0001, `clamped output ${r.voltages.OUT}`);
});

test("7805 with 9 V in → 5 V out; drops out at low input", () => {
  const mk = (vin) => circuit([
    { lib: "VSOURCE", ref: "V1", value: String(vin), nets: { 1: "IN", 2: "GND" } },
    { lib: "LM7805", ref: "U1", nets: { 1: "IN", 3: "OUT", 2: "GND" } },
    { lib: "R", ref: "RL", value: "100", nets: { 1: "OUT", 2: "GND" } },
  ]);
  const r = simulate(mk(9), { mode: "op" });
  assert.ok(r.ok, r.errors.join("; "));
  near(r.voltages.OUT, 5, 0.01);
  // Input current = load + quiescent
  near(r.currents.U1, r.voltages.OUT / 100 + 5e-3, 1e-4);
  near(r.currents.V1, -r.currents.U1, 1e-9);
  const low = simulate(mk(6), { mode: "op" });
  near(low.voltages.OUT, 4, 0.02);
});

test("RC low-pass AC: -3 dB at 1/(2πRC) within 2 %", () => {
  const p = circuit([
    { lib: "VSOURCE", ref: "V1", value: "0", fields: { acmag: "1" }, nets: { 1: "IN", 2: "GND" } },
    { lib: "R", ref: "R1", value: "1k", nets: { 1: "IN", 2: "OUT" } },
    { lib: "C", ref: "C1", value: "100n", nets: { 1: "OUT", 2: "GND" } },
  ]);
  const r = simulate(p, { mode: "ac", fStart: "10", fStop: "1Meg", points: 50 });
  assert.ok(r.ok, r.errors.join("; "));
  const db = r.signals["V(OUT)"].db;
  near(db[0], 0, 0.01, "flat at low frequency");
  const k = db.findIndex((d) => d < -3.0103);
  const f = r.freq[k - 1] * (r.freq[k] / r.freq[k - 1]) ** ((-3.0103 - db[k - 1]) / (db[k] - db[k - 1]));
  const fc = 1 / (2 * Math.PI * 1e3 * 100e-9);
  near(f / fc, 1, 0.02);
  const ph = r.signals["V(OUT)"].phase;
  assert.ok(ph[ph.length - 1] < -85, "phase approaches -90°");
});

test("AC through a nonlinear device uses the small-signal model", () => {
  // Common-emitter stage: gain ≈ -gm*RC with gm = Ic/Vt.
  const p = circuit([
    { lib: "VSOURCE", ref: "V1", value: "10", nets: { 1: "VCC", 2: "GND" } },
    { lib: "R", ref: "RB", value: "1Meg", nets: { 1: "VCC", 2: "B" } },
    { lib: "R", ref: "RC", value: "1k", nets: { 1: "VCC", 2: "C" } },
    { lib: "Q_NPN", ref: "Q1", nets: { 2: "B", 3: "C", 1: "GND" } },
    { lib: "VSOURCE", ref: "VS", value: "0", fields: { acmag: "1" }, nets: { 1: "SIG", 2: "GND" } },
    { lib: "C", ref: "C1", value: "10u", nets: { 1: "SIG", 2: "B" } },
  ]);
  const op = simulate(p, { mode: "op" });
  const r = simulate(p, { mode: "ac", fStart: "1k", fStop: "1k", points: 1 });
  assert.ok(r.ok, r.errors.join("; "));
  const gm = op.currents.Q1 / 0.02585;
  near(r.signals["V(C)"].mag[0] / (gm * 1000), 1, 0.05);
  near(Math.abs(r.signals["V(C)"].phase[0]), 180, 2);
});

test("half-wave rectifier peak ≈ Vpeak - 0.6 V", () => {
  const p = circuit([
    { lib: "VSOURCE", ref: "V1", value: "0", fields: { wave: "sine", amplitude: "10", freq: "50", offset: "0" }, nets: { 1: "IN", 2: "GND" } },
    { lib: "D", ref: "D1", nets: { 2: "IN", 1: "OUT" } },
    { lib: "R", ref: "RL", value: "10k", nets: { 1: "OUT", 2: "GND" } },
  ]);
  const r = simulate(p, { mode: "tran", tStop: "40m", tStep: "20u" });
  assert.ok(r.ok, r.errors.join("; "));
  const out = r.signals["V(OUT)"];
  const peak = Math.max(...out);
  near(peak, 10 - 0.6, 0.15);
  assert.ok(Math.min(...out) > -0.01, "no negative half-cycles");
  near(Math.max(...r.signals["V(IN)"]), 10, 1e-6);
});

test("DC sweep of a source", () => {
  const p = circuit([
    { lib: "VSOURCE", ref: "V1", value: "0", nets: { 1: "VIN", 2: "GND" } },
    { lib: "R", ref: "R1", value: "1k", nets: { 1: "VIN", 2: "A" } },
    { lib: "D", ref: "D1", nets: { 2: "A", 1: "GND" } },
  ]);
  const r = simulate(p, { mode: "dc", source: "V1", start: "0", stop: "5", step: "0.5" });
  assert.ok(r.ok, r.errors.join("; "));
  assert.equal(r.sweep.length, 11);
  near(r.sweep[10], 5, 1e-12);
  near(r.signals["V(VIN)"][4], 2, 1e-9);
  const a = r.signals["V(A)"];
  for (let i = 1; i < a.length; i++) assert.ok(a[i] >= a[i - 1], "diode voltage rises monotonically");
  assert.ok(a[10] < 0.75);
});

test("current source, switch and potentiometer", () => {
  const p = circuit([
    { lib: "ISOURCE", ref: "I1", value: "1m", nets: { 1: "X", 2: "GND" } },
    { lib: "R", ref: "R1", value: "1k", nets: { 1: "X", 2: "GND" } },
    { lib: "VSOURCE", ref: "V1", value: "10", nets: { 1: "VCC", 2: "GND" } },
    { lib: "R_POT", ref: "RV1", value: "10k", fields: { position: "0.25" }, nets: { 1: "VCC", 2: "W", 3: "GND" } },
    { lib: "SW_PUSH", ref: "SW1", nets: { 1: "VCC", 2: "S" } },
    { lib: "SW_SPST", ref: "SW2", nets: { 1: "VCC", 2: "T" } },
    { lib: "R", ref: "R2", value: "1k", nets: { 1: "S", 2: "GND" } },
    { lib: "R", ref: "R3", value: "1k", nets: { 1: "T", 2: "GND" } },
  ]);
  const r = simulate(p, { mode: "op" });
  assert.ok(r.ok, r.errors.join("; "));
  near(r.voltages.X, 1, 1e-9, "1 mA out of + into 1 kΩ");
  near(r.currents.I1, -1e-3, 1e-12);
  near(r.voltages.W, 7.5, 1e-6);
  assert.ok(r.voltages.S < 1e-4, "push button open by default");
  assert.ok(r.voltages.T > 9.9, "toggle closed by default");
});

test("toSpiceNetlist emits ngspice cards", () => {
  const p = circuit([
    { lib: "VSOURCE", ref: "V1", value: "0", fields: { wave: "sine", amplitude: "1", freq: "1k", offset: "0" }, nets: { 1: "IN", 2: "GND" } },
    { lib: "R", ref: "R1", value: "10k", nets: { 1: "IN", 2: "OUT" } },
    { lib: "C", ref: "C1", value: "100n", nets: { 1: "OUT", 2: "GND" } },
    { lib: "D", ref: "D1", nets: { 2: "OUT", 1: "GND" } },
    { lib: "Q_NPN", ref: "Q1", nets: { 2: "OUT", 3: "VCC", 1: "GND" } },
    { lib: "Q_NMOS", ref: "Q2", nets: { 2: "OUT", 3: "VCC", 1: "GND" } },
    { lib: "OPAMP", ref: "U1", nets: { 3: "OUT", 2: "FB", 1: "FB" } },
    { lib: "LM7805", ref: "U2", nets: { 1: "VCC", 3: "V5", 2: "GND" } },
    { lib: "ISOURCE", ref: "I1", value: "1m", nets: { 1: "VCC", 2: "GND" } },
  ]);
  p.sim.mode = "tran";
  const s = toSpiceNetlist(p);
  const lines = s.split("\n");
  assert.ok(lines[0].length > 0, "title line");
  assert.ok(lines.includes("R1 IN OUT 10000"), s);
  assert.ok(lines.includes("C1 OUT 0 1e-7"), s);
  assert.ok(lines.some((l) => /^V1 IN 0 DC 0 SIN\(0 1 1000/.test(l)), s);
  assert.ok(lines.includes("D1 OUT 0 D_D1"));
  assert.ok(lines.some((l) => l.startsWith(".model D_D1 D(IS=2.52e-9")), s);
  assert.ok(lines.includes("Q1 VCC OUT 0 Q_Q1"));
  assert.ok(lines.some((l) => l.startsWith(".model Q_Q1 NPN(")));
  assert.ok(lines.includes("MQ2 VCC OUT 0 0 M_Q2"), s);
  assert.ok(lines.some((l) => /^XU1 OUT FB FB \S+ \S+ OPAMP_U1$/.test(l)), s);
  assert.ok(lines.includes(".subckt OPAMP_U1 inp inn out vp vn"));
  assert.ok(lines.includes("XU2 VCC V5 0 REG_U2"));
  assert.ok(lines.includes("I1 0 VCC DC 0.001"), "current source reversed to SPICE convention");
  assert.ok(lines.includes(".tran 10u 10m"));
  assert.equal(lines.filter((l) => l === ".end").length, 1);
});
