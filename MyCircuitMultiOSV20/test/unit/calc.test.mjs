// Calculator maths (Tools → Calculators).
import test from "node:test";
import assert from "node:assert/strict";
import { nearestE, resistorBands, bandsToOhms, ledResistor, divider, dividerSolve, ipcCurrent, ipcWidth, trackResistance, astable555, rcCutoff, viaCurrent } from "../../src/ui/calc.js";

const near = (a, b, rel = 0.01) => assert.ok(Math.abs(a - b) <= Math.abs(b) * rel, `${a} ≉ ${b}`);

test("nearest E-series values", () => {
  assert.equal(nearestE(4600, "E24"), 4700);
  assert.equal(nearestE(1234, "E12"), 1200);
  assert.equal(nearestE(10.4, "E96"), 10.5);
  assert.ok(Number.isNaN(nearestE(0)));
});

test("resistor colour bands both ways", () => {
  const b = resistorBands(4700, 4);
  assert.deepEqual(b.digits, [4, 7]);
  assert.equal(b.multIndex, 2); // red ×100
  assert.equal(bandsToOhms(b.digits, b.multIndex), 4700);
  const f = resistorBands(10000, 5);
  assert.deepEqual(f.digits, [1, 0, 0]);
  assert.equal(f.multIndex, 2);
  assert.equal(resistorBands(4.7, 4).multIndex, 8, "gold multiplier for 4.7 Ω");
  assert.equal(resistorBands(-1), null);
});

test("LED resistor and voltage divider", () => {
  const r = ledResistor(5, 2, 0.02);
  near(r.r, 150);
  near(r.p, 0.06);
  assert.equal(r.e24, 150);
  near(divider(12, 10000, 4700), 3.836, 0.001);
  near(dividerSolve(12, 3.3, 10000).r2, 3793, 0.001);
});

test("IPC-2221 track width is the inverse of current capacity", () => {
  const w = ipcWidth(1, 1, 10, false);
  near(ipcCurrent(w, 1, 10, false), 1, 1e-9);
  near(w, 0.30, 0.15); // ≈ 12 mil for 1 A outer, 1 oz, 10 °C
  assert.ok(ipcWidth(1, 1, 10, true) > w * 2, "inner layers need much wider tracks");
  assert.ok(viaCurrent(0.4) > 0.5);
});

test("track resistance, 555 astable and RC cutoff", () => {
  near(trackResistance(0.254, 25.4, 1), 0.0491, 0.02); // 10 mil × 1 inch, 1 oz ≈ 49 mΩ
  const a = astable555(1000, 10000, 10e-6);
  near(a.f, 6.87, 0.01);
  near(a.duty, 52.4, 0.01);
  near(rcCutoff(10000, 100e-9).fc, 159.15, 0.001);
});
