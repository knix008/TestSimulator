// Engineering calculators (KiCad's PCB Calculator, plus a few everyday ones).
// The maths is exported separately so test/unit/calc.test.mjs can check it.

import { t } from "./i18n.js";
import { h, modal, field, input, select, tabs } from "./widgets.js";
import { parseValue, formatValue } from "../core/project.js";

// ---------------------------------------------------------------- pure maths
export const E_SERIES = {
  E12: [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2],
  E24: [1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1],
  E96: [1.00, 1.02, 1.05, 1.07, 1.10, 1.13, 1.15, 1.18, 1.21, 1.24, 1.27, 1.30, 1.33, 1.37, 1.40, 1.43, 1.47, 1.50, 1.54, 1.58, 1.62, 1.65, 1.69, 1.74, 1.78, 1.82, 1.87, 1.91, 1.96, 2.00, 2.05, 2.10, 2.15, 2.21, 2.26, 2.32, 2.37, 2.43, 2.49, 2.55, 2.61, 2.67, 2.74, 2.80, 2.87, 2.94, 3.01, 3.09, 3.16, 3.24, 3.32, 3.40, 3.48, 3.57, 3.65, 3.74, 3.83, 3.92, 4.02, 4.12, 4.22, 4.32, 4.42, 4.53, 4.64, 4.75, 4.87, 4.99, 5.11, 5.23, 5.36, 5.49, 5.62, 5.76, 5.90, 6.04, 6.19, 6.34, 6.49, 6.65, 6.81, 6.98, 7.15, 7.32, 7.50, 7.68, 7.87, 8.06, 8.25, 8.45, 8.66, 8.87, 9.09, 9.31, 9.53, 9.76],
};

export function nearestE(value, series = "E24") {
  if (!(value > 0)) return NaN;
  const dec = Math.floor(Math.log10(value));
  let best = Infinity;
  let bestV = NaN;
  for (const d of [dec - 1, dec, dec + 1]) {
    for (const m of E_SERIES[series]) {
      const v = m * 10 ** d;
      const err = Math.abs(Math.log(v / value));
      if (err < best) { best = err; bestV = +v.toPrecision(3); }
    }
  }
  return bestV;
}

export const BAND_COLORS = [
  ["black", "#000000"], ["brown", "#7b3f00"], ["red", "#d62020"], ["orange", "#f07c00"], ["yellow", "#f2d600"],
  ["green", "#1e9e3a"], ["blue", "#1f5fd6"], ["violet", "#8a3fc8"], ["grey", "#8a8a8a"], ["white", "#ffffff"],
];
export const MULT_COLORS = [...BAND_COLORS.slice(0, 8).map((c, i) => [c[0], c[1], 10 ** i]), ["gold", "#c9a227", 0.1], ["silver", "#b8b8b8", 0.01]];
export const TOL_COLORS = [["brown", "#7b3f00", 1], ["red", "#d62020", 2], ["green", "#1e9e3a", 0.5], ["blue", "#1f5fd6", 0.25], ["violet", "#8a3fc8", 0.1], ["gold", "#c9a227", 5], ["silver", "#b8b8b8", 10]];

// Resistance → colour bands (4-band for 2 significant digits, 5-band for 3).
export function resistorBands(ohms, bands = 4) {
  const digits = bands === 5 ? 3 : 2;
  if (!(ohms > 0)) return null;
  let exp = Math.floor(Math.log10(ohms)) - (digits - 1);
  let sig = Math.round(ohms / 10 ** exp);
  if (sig >= 10 ** digits) { sig = Math.round(sig / 10); exp += 1; }
  if (exp < -2 || exp > 7) return null;
  const ds = String(sig).padStart(digits, "0").split("").map(Number);
  const mult = exp === -1 ? 8 : exp === -2 ? 9 : exp;
  return { digits: ds, multIndex: mult, value: sig * 10 ** exp };
}

export function bandsToOhms(digits, multIndex) {
  const sig = Number(digits.join(""));
  return sig * MULT_COLORS[multIndex][2];
}

export function ledResistor(vs, vf, iA) {
  const r = (vs - vf) / iA;
  return { r, p: (vs - vf) * iA, e24: nearestE(r, "E24") };
}

export function divider(vin, r1, r2) {
  return vin * r2 / (r1 + r2);
}

// R2 for a wanted output given R1; plus best E-series pair.
export function dividerSolve(vin, vout, r1) {
  const r2 = (vout * r1) / (vin - vout);
  return { r2, e: nearestE(r2, "E24") };
}

// IPC-2221: I = k · ΔT^0.44 · A^0.725, A in mil².
export function ipcCurrent(widthMm, oz, rise, internal) {
  const k = internal ? 0.024 : 0.048;
  const area = (widthMm / 0.0254) * oz * 1.378;
  return k * rise ** 0.44 * area ** 0.725;
}

export function ipcWidth(currentA, oz, rise, internal) {
  const k = internal ? 0.024 : 0.048;
  const area = (currentA / (k * rise ** 0.44)) ** (1 / 0.725);
  return (area / (oz * 1.378)) * 0.0254;
}

// Copper resistance of a track (20 °C).
export function trackResistance(widthMm, lengthMm, oz) {
  const rho = 1.72e-8;
  const thick = oz * 35e-6;
  return (rho * (lengthMm / 1000)) / ((widthMm / 1000) * thick);
}

export function viaCurrent(drillMm, platingUm = 25, rise = 10) {
  // A via barrel behaves like an internal conductor with circumference × plating as area.
  const areaMil2 = (Math.PI * (drillMm + platingUm / 1000) / 0.0254) * (platingUm / 25.4);
  return 0.048 * rise ** 0.44 * areaMil2 ** 0.725;
}

export function astable555(r1, r2, c) {
  const th = 0.693 * (r1 + r2) * c;
  const tl = 0.693 * r2 * c;
  return { f: 1 / (th + tl), duty: (th / (th + tl)) * 100, th, tl };
}

export function rcCutoff(r, c) {
  return { fc: 1 / (2 * Math.PI * r * c), tau: r * c };
}

// ---------------------------------------------------------------- UI
export function calculators() {
  const out = (el) => h("div", { class: "calc-out" }, el);
  const num = (val, onInput) => {
    const el = input(val, { onInput });
    el.addEventListener("keydown", (e) => e.stopPropagation());
    return el;
  };

  // Resistor colour code.
  const rc = { value: "4k7", bands: 4 };
  const bandsView = h("div", { class: "color-bands" });
  const rcOut = h("div");
  const drawRc = () => {
    const ohms = parseValue(rc.value);
    const b = resistorBands(ohms, rc.bands);
    bandsView.innerHTML = "";
    if (!b) { rcOut.textContent = t("Enter a value between 0.1 Ω and 100 MΩ"); return; }
    const colors = [...b.digits.map((d) => BAND_COLORS[d]), MULT_COLORS[b.multIndex], rc.bands === 5 ? TOL_COLORS[0] : TOL_COLORS[5]];
    colors.forEach((c, i) => {
      bandsView.append(h("i", { style: { background: c[1], marginLeft: i === colors.length - 1 ? "24px" : "0" }, title: t(c[0]) }));
    });
    rcOut.innerHTML = `${formatValue(b.value, "Ω")} — ${colors.map((c) => t(c[0])).join(", ")}<br>${t("Nearest E24")}: ${formatValue(nearestE(ohms, "E24"), "Ω")} · E96: ${formatValue(nearestE(ohms, "E96"), "Ω")}`;
  };
  const rcTab = h("div", {}, h("div", { class: "form-grid" },
    field(t("Resistance"), num(rc.value, (v) => { rc.value = v; drawRc(); })),
    field(t("Bands"), select("4", [["4", t("4 bands (5 %)")], ["5", t("5 bands (1 %)")]], { onChange: (v) => { rc.bands = +v; drawRc(); } }))),
    bandsView, out(rcOut));
  drawRc();

  // Ohm's law & LED.
  const ohm = { v: "5", i: "20m", vf: "2.0" };
  const ohmOut = h("div");
  const drawOhm = () => {
    const vs = parseValue(ohm.v);
    const i = parseValue(ohm.i);
    const vf = parseValue(ohm.vf);
    const led = ledResistor(vs, vf, i);
    ohmOut.innerHTML = `${t("Series resistor")}: <b>${formatValue(led.r, "Ω")}</b> → E24 ${formatValue(led.e24, "Ω")}<br>${t("Resistor power")}: ${formatValue(led.p, "W")} (${t("use ≥")} ${formatValue(Math.ceil(led.p * 2 * 8) / 8, "W")})<br>${t("Without LED (R = V/I)")}: ${formatValue(vs / i, "Ω")}, P = ${formatValue(vs * i, "W")}`;
  };
  const ohmTab = h("div", {}, h("div", { class: "form-grid three" },
    field(t("Supply voltage"), num(ohm.v, (v) => { ohm.v = v; drawOhm(); })),
    field(t("LED forward voltage"), num(ohm.vf, (v) => { ohm.vf = v; drawOhm(); })),
    field(t("Current"), num(ohm.i, (v) => { ohm.i = v; drawOhm(); }))), out(ohmOut));
  drawOhm();

  // Voltage divider.
  const dv = { vin: "12", r1: "10k", r2: "4k7", want: "3.3" };
  const dvOut = h("div");
  const drawDv = () => {
    const vin = parseValue(dv.vin), r1 = parseValue(dv.r1), r2 = parseValue(dv.r2), want = parseValue(dv.want);
    const s = dividerSolve(vin, want, r1);
    dvOut.innerHTML = `Vout = <b>${formatValue(divider(vin, r1, r2), "V")}</b>, I = ${formatValue(vin / (r1 + r2), "A")}<br>${t("For {v} V with R1 = {r1}: R2 = {r2} (E24 {e} → {vo})", { v: dv.want, r1: formatValue(r1, "Ω"), r2: formatValue(s.r2, "Ω"), e: formatValue(s.e, "Ω"), vo: formatValue(divider(vin, r1, s.e), "V") })}`;
  };
  const dvTab = h("div", {}, h("div", { class: "form-grid" },
    field("Vin", num(dv.vin, (v) => { dv.vin = v; drawDv(); })), field(t("Wanted Vout"), num(dv.want, (v) => { dv.want = v; drawDv(); })),
    field("R1", num(dv.r1, (v) => { dv.r1 = v; drawDv(); })), field("R2", num(dv.r2, (v) => { dv.r2 = v; drawDv(); }))), out(dvOut));
  drawDv();

  // Track width.
  const tw = { i: "1", oz: "1", rise: "10", len: "50", internal: false, width: "0.5" };
  const twOut = h("div");
  const drawTw = () => {
    const i = parseValue(tw.i), oz = parseFloat(tw.oz), rise = parseFloat(tw.rise), len = parseFloat(tw.len), w = parseFloat(tw.width);
    const need = ipcWidth(i, oz, rise, tw.internal);
    const r = trackResistance(need, len, oz);
    twOut.innerHTML = `${t("Minimum width for {i} A", { i: tw.i })}: <b>${need.toFixed(3)} mm</b> (${(need / 0.0254).toFixed(1)} mil)<br>${t("Resistance over {l} mm", { l: tw.len })}: ${formatValue(r, "Ω")}, ${t("drop")} ${formatValue(r * i, "V")}, ${t("loss")} ${formatValue(r * i * i, "W")}<br>${t("A {w} mm track carries")} ${ipcCurrent(w, oz, rise, tw.internal).toFixed(2)} A`;
  };
  const twTab = h("div", {}, h("div", { class: "form-grid three" },
    field(t("Current (A)"), num(tw.i, (v) => { tw.i = v; drawTw(); })),
    field(t("Copper (oz)"), select("1", [["0.5", "0.5 oz (18 µm)"], ["1", "1 oz (35 µm)"], ["2", "2 oz (70 µm)"]], { onChange: (v) => { tw.oz = v; drawTw(); } })),
    field(t("Temperature rise (°C)"), num(tw.rise, (v) => { tw.rise = v; drawTw(); })),
    field(t("Length (mm)"), num(tw.len, (v) => { tw.len = v; drawTw(); })),
    field(t("Check width (mm)"), num(tw.width, (v) => { tw.width = v; drawTw(); })),
    field(t("Layer"), select("ext", [["ext", t("Outer layer")], ["int", t("Inner layer")]], { onChange: (v) => { tw.internal = v === "int"; drawTw(); } }))), out(twOut),
    h("p", { class: "field-hint" }, t("IPC-2221 approximation. Via ({d} mm drill, 25 µm plating) carries about {a} A.", { d: 0.4, a: viaCurrent(0.4).toFixed(2) })));
  drawTw();

  // 555 / RC.
  const ti = { r1: "1k", r2: "10k", c: "10u", r: "10k", cf: "100n" };
  const tiOut = h("div");
  const drawTi = () => {
    const a = astable555(parseValue(ti.r1), parseValue(ti.r2), parseValue(ti.c));
    const f = rcCutoff(parseValue(ti.r), parseValue(ti.cf));
    tiOut.innerHTML = `555 ${t("astable")}: f = <b>${formatValue(a.f, "Hz")}</b>, ${t("duty")} ${a.duty.toFixed(1)} %, ${t("high")} ${formatValue(a.th, "s")}, ${t("low")} ${formatValue(a.tl, "s")}<br>RC: fc = <b>${formatValue(f.fc, "Hz")}</b>, τ = ${formatValue(f.tau, "s")}`;
  };
  const tiTab = h("div", {}, h("div", { class: "form-grid three" },
    field("555 R1", num(ti.r1, (v) => { ti.r1 = v; drawTi(); })), field("555 R2", num(ti.r2, (v) => { ti.r2 = v; drawTi(); })), field("555 C", num(ti.c, (v) => { ti.c = v; drawTi(); })),
    field("RC R", num(ti.r, (v) => { ti.r = v; drawTi(); })), field("RC C", num(ti.cf, (v) => { ti.cf = v; drawTi(); }))), out(tiOut));
  drawTi();

  // Units.
  const un = { v: "1" };
  const unOut = h("div");
  const drawUn = () => {
    const v = parseFloat(un.v) || 0;
    unOut.innerHTML = `${v} mm = ${(v / 0.0254).toFixed(2)} mil = ${(v / 25.4).toFixed(4)} in<br>${v} mil = ${(v * 0.0254).toFixed(4)} mm<br>${v} in = ${(v * 25.4).toFixed(3)} mm<br>${v} oz Cu = ${(v * 34.8).toFixed(1)} µm`;
  };
  const unTab = h("div", {}, field(t("Value"), num(un.v, (v) => { un.v = v; drawUn(); })), out(unOut));
  drawUn();

  modal({
    title: t("Calculators"), width: 680,
    body: tabs([
      { id: "rc", label: t("Colour code"), body: rcTab }, { id: "ohm", label: t("LED / Ohm"), body: ohmTab }, { id: "dv", label: t("Divider"), body: dvTab },
      { id: "tw", label: t("Track width"), body: twTab }, { id: "ti", label: t("555 / RC"), body: tiTab }, { id: "un", label: t("Units"), body: unTab },
    ]),
  });
}
