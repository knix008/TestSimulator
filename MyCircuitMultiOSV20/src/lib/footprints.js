// PCB footprint library (millimetres, footprint-local frame, origin at centre
// or pin 1 as noted; y grows downwards).
//
// pad: {num, shape: rect|circle|oval|roundrect, x, y, w, h, rot?, drill?, npth?, layers}
//   layers: "F" (top SMD), "*" (through-hole, every copper layer)
// silk / fab: [{t:"line",x1,y1,x2,y2,w} | {t:"circle",cx,cy,r,w} | {t:"rect",x1,y1,x2,y2,w} | {t:"arc",cx,cy,r,a1,a2,w}]
// courtyard: {x1,y1,x2,y2}
// model3d: {kind, ...} — interpreted by src/view3d/models.js
//   kinds: chip, axial, radial, disc, dip, soic, sot23, sot223, to92, to220,
//          header, led, button, crystal, qfp, hole, buzzer, pot, sod123, do41,
//          usb, testpoint

const FOOTPRINTS = {};
function def(name, spec) {
  const fp = { name, ...spec };
  if (!fp.courtyard) fp.courtyard = autoCourtyard(fp);
  FOOTPRINTS[name] = fp;
  return fp;
}

function autoCourtyard(fp) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  const add = (x, y) => { x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y); };
  for (const p of fp.pads) { add(p.x - p.w / 2, p.y - p.h / 2); add(p.x + p.w / 2, p.y + p.h / 2); }
  for (const s of fp.silk || []) {
    if (s.t === "line" || s.t === "rect") { add(s.x1, s.y1); add(s.x2, s.y2); }
    else if (s.t === "circle" || s.t === "arc") { add(s.cx - s.r, s.cy - s.r); add(s.cx + s.r, s.cy + s.r); }
  }
  if (!Number.isFinite(x1)) return { x1: -1, y1: -1, x2: 1, y2: 1 };
  const m = 0.25;
  return { x1: +(x1 - m).toFixed(3), y1: +(y1 - m).toFixed(3), x2: +(x2 + m).toFixed(3), y2: +(y2 + m).toFixed(3) };
}

const SW = 0.12; // silkscreen line width
const rectSilk = (x1, y1, x2, y2, w = SW) => [
  { t: "line", x1, y1, x2, y2: y1, w }, { t: "line", x1: x2, y1, x2, y2, w },
  { t: "line", x1: x2, y1: y2, x2: x1, y2, w }, { t: "line", x1, y1: y2, x2: x1, y2: y1, w },
];

// ---------------------------------------------------------------- SMD chips
const CHIP = {
  "0402": { L: 1.0, W: 0.5, pw: 0.6, ph: 0.6, px: 0.5, H: 0.35 },
  "0603": { L: 1.6, W: 0.8, pw: 0.9, ph: 0.95, px: 0.8, H: 0.45 },
  "0805": { L: 2.0, W: 1.25, pw: 1.0, ph: 1.45, px: 0.95, H: 0.5 },
  "1206": { L: 3.2, W: 1.6, pw: 1.15, ph: 1.8, px: 1.5, H: 0.6 },
};
for (const [size, d] of Object.entries(CHIP)) {
  for (const [prefix, color] of [["R", "resistor"], ["C", "capacitor"], ["L", "inductor"], ["LED", "led"], ["Fuse", "fuse"]]) {
    if (prefix === "LED" && size !== "0805" && size !== "0603") continue;
    if (prefix === "Fuse" && size !== "1206") continue;
    if (prefix === "L" && !(size === "0805" || size === "1206")) continue;
    def(`${prefix}_${size}`, {
      title: `${prefix} ${size} (${(d.L).toFixed(1)}×${d.W.toFixed(2)} mm) SMD`, kind: "smd", category: "Chip",
      pads: [
        { num: "1", shape: "roundrect", x: -d.px, y: 0, w: d.pw, h: d.ph, layers: "F" },
        { num: "2", shape: "roundrect", x: d.px, y: 0, w: d.pw, h: d.ph, layers: "F" },
      ],
      silk: d.W > 0.6 ? [
        { t: "line", x1: -d.L / 2 + 0.2, y1: -d.ph / 2 - 0.2, x2: d.L / 2 - 0.2, y2: -d.ph / 2 - 0.2, w: SW },
        { t: "line", x1: -d.L / 2 + 0.2, y1: d.ph / 2 + 0.2, x2: d.L / 2 - 0.2, y2: d.ph / 2 + 0.2, w: SW },
      ] : [],
      model3d: { kind: "chip", L: d.L, W: d.W, H: d.H, body: color, polarity: prefix === "LED" },
    });
  }
}

// ---------------------------------------------------------------- THT passives
// The 7.62 mm pitch takes the smaller DIN0204 body so the outline clears the pads.
for (const [pitch, L, D, din] of [[7.62, 3.6, 1.6, "DIN0204"], [10.16, 6.3, 2.5, "DIN0207"]]) {
  const hl = L / 2;
  const hd = D / 2;
  def(`R_Axial_P${pitch.toFixed(2)}mm`, {
    title: `Resistor axial ${din}, pitch ${pitch} mm`, kind: "tht", category: "Axial",
    pads: [
      { num: "1", shape: "circle", x: 0, y: 0, w: 1.6, h: 1.6, drill: 0.8, layers: "*" },
      { num: "2", shape: "oval", x: pitch, y: 0, w: 1.6, h: 1.6, drill: 0.8, layers: "*" },
    ],
    silk: [...rectSilk(pitch / 2 - hl, -hd, pitch / 2 + hl, hd), { t: "line", x1: 1.0, y1: 0, x2: pitch / 2 - hl, y2: 0, w: SW }, { t: "line", x1: pitch / 2 + hl, y1: 0, x2: pitch - 1.0, y2: 0, w: SW }],
    model3d: { kind: "axial", pitch, L, D, body: "resistor" },
  });
}
def("D_DO-41_P10.16mm", {
  title: "Diode DO-41, pitch 10.16 mm", kind: "tht", category: "Axial",
  pads: [
    { num: "1", shape: "rect", x: 0, y: 0, w: 2.2, h: 2.2, drill: 1.1, layers: "*" },
    { num: "2", shape: "oval", x: 10.16, y: 0, w: 2.2, h: 2.2, drill: 1.1, layers: "*" },
  ],
  silk: [...rectSilk(2.5, -1.4, 7.66, 1.4), { t: "line", x1: 3.2, y1: -1.4, x2: 3.2, y2: 1.4, w: 0.3 }],
  model3d: { kind: "axial", pitch: 10.16, L: 5.2, D: 2.7, body: "diode" },
});
for (const [D, P] of [[5, 2.0], [8, 3.5]]) {
  def(`CP_Radial_D${D.toFixed(1)}mm_P${P.toFixed(2)}mm`, {
    title: `Electrolytic capacitor D${D} mm, pitch ${P} mm`, kind: "tht", category: "Radial",
    pads: [
      { num: "1", shape: "rect", x: 0, y: 0, w: 1.6, h: 1.6, drill: 0.8, layers: "*" },
      { num: "2", shape: "circle", x: P, y: 0, w: 1.6, h: 1.6, drill: 0.8, layers: "*" },
    ],
    silk: [{ t: "circle", cx: P / 2, cy: 0, r: D / 2 + 0.12, w: SW }, { t: "line", x1: -D / 2 + P / 2 - 1.2, y1: -D / 2 + 0.2, x2: -D / 2 + P / 2 - 0.2, y2: -D / 2 + 0.2, w: SW }, { t: "line", x1: -D / 2 + P / 2 - 0.7, y1: -D / 2 - 0.3, x2: -D / 2 + P / 2 - 0.7, y2: -D / 2 + 0.7, w: SW }],
    model3d: { kind: "radial", pitch: P, D, H: D * 1.4 + 2 },
  });
}
def("C_Disc_D5.0mm_P5.00mm", {
  title: "Ceramic disc capacitor D5 mm, pitch 5 mm", kind: "tht", category: "Radial",
  pads: [
    { num: "1", shape: "circle", x: 0, y: 0, w: 1.6, h: 1.6, drill: 0.8, layers: "*" },
    { num: "2", shape: "circle", x: 5, y: 0, w: 1.6, h: 1.6, drill: 0.8, layers: "*" },
  ],
  // Body outline above and below only: the pads sit on the body's ends, so a
  // closed rectangle would run straight through them.
  silk: [{ t: "line", x1: -0.25, y1: -1.5, x2: 5.25, y2: -1.5, w: SW }, { t: "line", x1: -0.25, y1: 1.5, x2: 5.25, y2: 1.5, w: SW }],
  model3d: { kind: "disc", pitch: 5, D: 5, T: 2.5 },
});
for (const D of [3, 5]) {
  def(`LED_D${D.toFixed(1)}mm`, {
    title: `LED ${D} mm round THT`, kind: "tht", category: "LED",
    pads: [
      { num: "1", shape: "rect", x: 0, y: 0, w: 1.8, h: 1.8, drill: 0.9, layers: "*" },
      { num: "2", shape: "circle", x: 2.54, y: 0, w: 1.8, h: 1.8, drill: 0.9, layers: "*" },
    ],
    // At least 2.6 mm radius so the outline clears the square pad corner of the 3 mm LED.
    silk: [{ t: "arc", cx: 1.27, cy: 0, r: Math.max(D / 2 + 0.4, 2.6), a1: 40, a2: 320, w: SW }],
    model3d: { kind: "led", pitch: 2.54, D, H: D * 1.7 },
  });
}
def("Crystal_HC49-U", {
  title: "Crystal HC-49/U, pitch 4.88 mm", kind: "tht", category: "Crystal",
  pads: [
    { num: "1", shape: "circle", x: 0, y: 0, w: 1.5, h: 1.5, drill: 0.8, layers: "*" },
    { num: "2", shape: "circle", x: 4.88, y: 0, w: 1.5, h: 1.5, drill: 0.8, layers: "*" },
  ],
  silk: [{ t: "line", x1: -1.0, y1: -2.3, x2: 5.9, y2: -2.3, w: SW }, { t: "line", x1: -1.0, y1: 2.3, x2: 5.9, y2: 2.3, w: SW }, { t: "arc", cx: -1.0, cy: 0, r: 2.3, a1: 90, a2: 270, w: SW }, { t: "arc", cx: 5.9, cy: 0, r: 2.3, a1: -90, a2: 90, w: SW }],
  model3d: { kind: "crystal", pitch: 4.88, L: 10.9, W: 4.6, H: 3.6 },
});
def("Potentiometer_3386P", {
  title: "Trimmer potentiometer Bourns 3386P", kind: "tht", category: "Potentiometer",
  pads: [
    { num: "1", shape: "rect", x: 0, y: 0, w: 1.6, h: 1.6, drill: 0.9, layers: "*" },
    { num: "2", shape: "circle", x: 2.54, y: -2.54, w: 1.6, h: 1.6, drill: 0.9, layers: "*" },
    { num: "3", shape: "circle", x: 5.08, y: 0, w: 1.6, h: 1.6, drill: 0.9, layers: "*" },
  ],
  silk: rectSilk(-2.3, -6.0, 7.4, 1.4),
  model3d: { kind: "pot", cx: 2.54, cy: -2.3, W: 9.5, D: 7.3, H: 4.8 },
});
def("Buzzer_12mm", {
  title: "Piezo buzzer 12 mm, pitch 7.6 mm", kind: "tht", category: "Misc",
  pads: [
    { num: "1", shape: "rect", x: 0, y: 0, w: 2, h: 2, drill: 1, layers: "*" },
    { num: "2", shape: "circle", x: 7.6, y: 0, w: 2, h: 2, drill: 1, layers: "*" },
  ],
  silk: [{ t: "circle", cx: 3.8, cy: 0, r: 6.1, w: SW }],
  model3d: { kind: "buzzer", cx: 3.8, D: 12, H: 9.5 },
});
def("SW_PUSH_6mm", {
  title: "Tactile switch 6×6 mm THT", kind: "tht", category: "Switch",
  pads: [
    { num: "1", shape: "circle", x: 0, y: 0, w: 2, h: 2, drill: 1.1, layers: "*" },
    { num: "2", shape: "circle", x: 6.5, y: 0, w: 2, h: 2, drill: 1.1, layers: "*" },
    { num: "1", shape: "circle", x: 0, y: 4.5, w: 2, h: 2, drill: 1.1, layers: "*" },
    { num: "2", shape: "circle", x: 6.5, y: 4.5, w: 2, h: 2, drill: 1.1, layers: "*" },
  ],
  // Body outline broken at the four pads (a closed rectangle runs through them).
  silk: [
    { t: "line", x1: 1.25, y1: -0.75, x2: 5.25, y2: -0.75, w: SW }, { t: "line", x1: 1.25, y1: 5.25, x2: 5.25, y2: 5.25, w: SW },
    { t: "line", x1: 0.25, y1: 1.25, x2: 0.25, y2: 3.25, w: SW }, { t: "line", x1: 6.25, y1: 1.25, x2: 6.25, y2: 3.25, w: SW },
    { t: "circle", cx: 3.25, cy: 2.25, r: 1.75, w: SW },
  ],
  model3d: { kind: "button", cx: 3.25, cy: 2.25, W: 6, H: 5 },
});
def("TestPoint_Pad_D1.5mm", {
  title: "Test point pad Ø1.5 mm", kind: "smd", category: "Misc",
  pads: [{ num: "1", shape: "circle", x: 0, y: 0, w: 1.5, h: 1.5, layers: "F" }],
  silk: [{ t: "circle", cx: 0, cy: 0, r: 1.0, w: SW }],
  model3d: { kind: "testpoint" },
});
def("MountingHole_3.2mm", {
  title: "Mounting hole M3 (3.2 mm, NPTH)", kind: "tht", category: "Mechanical",
  pads: [{ num: "", shape: "circle", x: 0, y: 0, w: 3.2, h: 3.2, drill: 3.2, npth: true, layers: "*" }],
  silk: [{ t: "circle", cx: 0, cy: 0, r: 3.0, w: SW }],
  model3d: { kind: "hole" },
});

// ---------------------------------------------------------------- headers
for (let n = 1; n <= 10; n++) {
  const nn = String(n).padStart(2, "0");
  def(`PinHeader_1x${nn}_P2.54mm`, {
    title: `Pin header 1×${n}, 2.54 mm`, kind: "tht", category: "Connector",
    pads: Array.from({ length: n }, (_, i) => ({ num: String(i + 1), shape: i === 0 ? "rect" : "oval", x: 0, y: i * 2.54, w: 1.7, h: 1.7, drill: 1.0, layers: "*" })),
    silk: rectSilk(-1.33, -1.33, 1.33, (n - 1) * 2.54 + 1.33),
    model3d: { kind: "header", rows: 1, n, pitch: 2.54 },
  });
}
for (const n of [2, 3, 4, 5, 8]) {
  const nn = String(n).padStart(2, "0");
  const pads = [];
  for (let i = 0; i < n; i++) {
    pads.push({ num: String(i * 2 + 1), shape: i === 0 ? "rect" : "oval", x: 0, y: i * 2.54, w: 1.7, h: 1.7, drill: 1.0, layers: "*" });
    pads.push({ num: String(i * 2 + 2), shape: "oval", x: 2.54, y: i * 2.54, w: 1.7, h: 1.7, drill: 1.0, layers: "*" });
  }
  def(`PinHeader_2x${nn}_P2.54mm`, {
    title: `Pin header 2×${n}, 2.54 mm`, kind: "tht", category: "Connector",
    pads, silk: rectSilk(-1.33, -1.33, 3.87, (n - 1) * 2.54 + 1.33),
    model3d: { kind: "header", rows: 2, n, pitch: 2.54 },
  });
}
def("USB_Micro-B", {
  title: "USB Micro-B receptacle (SMD)", kind: "smd", category: "Connector",
  pads: [
    ...[0, 1, 2, 3, 4].map((i) => ({ num: String(i + 1), shape: "rect", x: (i - 2) * 0.65, y: -2.7, w: 0.4, h: 1.35, layers: "F" })),
    { num: "6", shape: "rect", x: -3.1, y: -2.55, w: 2.1, h: 1.6, layers: "F" }, { num: "6", shape: "rect", x: 3.1, y: -2.55, w: 2.1, h: 1.6, layers: "F" },
    { num: "6", shape: "rect", x: -1.2, y: 0, w: 1.9, h: 1.9, layers: "F" }, { num: "6", shape: "rect", x: 1.2, y: 0, w: 1.9, h: 1.9, layers: "F" },
  ],
  silk: [{ t: "line", x1: -3.8, y1: 1.6, x2: 3.8, y2: 1.6, w: SW }],
  model3d: { kind: "usb", W: 7.5, D: 5.0, H: 2.5, cy: -1.0 },
});

// ---------------------------------------------------------------- DIP / SOIC / QFP
for (const n of [8, 14, 16, 28]) {
  const half = n / 2;
  const pads = [];
  for (let i = 0; i < half; i++) pads.push({ num: String(i + 1), shape: i === 0 ? "rect" : "oval", x: 0, y: i * 2.54, w: 1.6, h: 1.6, drill: 0.8, layers: "*" });
  for (let i = 0; i < half; i++) pads.push({ num: String(half + i + 1), shape: "oval", x: 7.62, y: (half - 1 - i) * 2.54, w: 1.6, h: 1.6, drill: 0.8, layers: "*" });
  const len = (half - 1) * 2.54;
  def(`DIP-${n}_W7.62mm`, {
    title: `DIP-${n}, 7.62 mm row spacing`, kind: "tht", category: "DIP",
    pads,
    silk: [
      { t: "line", x1: 1.16, y1: -1.33, x2: 2.81, y2: -1.33, w: SW }, { t: "line", x1: 4.81, y1: -1.33, x2: 6.46, y2: -1.33, w: SW },
      { t: "line", x1: 1.16, y1: -1.33, x2: 1.16, y2: len + 1.33, w: SW }, { t: "line", x1: 6.46, y1: -1.33, x2: 6.46, y2: len + 1.33, w: SW },
      { t: "line", x1: 1.16, y1: len + 1.33, x2: 6.46, y2: len + 1.33, w: SW }, { t: "arc", cx: 3.81, cy: -1.33, r: 1.0, a1: 180, a2: 360, w: SW },
    ],
    model3d: { kind: "dip", n, pitch: 2.54, row: 7.62 },
  });
}
for (const [n, bodyL] of [[8, 4.9], [16, 9.9]]) {
  const half = n / 2;
  const pads = [];
  const y0 = -((half - 1) * 1.27) / 2;
  for (let i = 0; i < half; i++) pads.push({ num: String(i + 1), shape: "roundrect", x: -2.7, y: y0 + i * 1.27, w: 1.55, h: 0.6, layers: "F" });
  for (let i = 0; i < half; i++) pads.push({ num: String(half + i + 1), shape: "roundrect", x: 2.7, y: y0 + (half - 1 - i) * 1.27, w: 1.55, h: 0.6, layers: "F" });
  def(`SOIC-${n}_3.9x${bodyL}mm`, {
    title: `SOIC-${n}, 3.9×${bodyL} mm, 1.27 mm pitch`, kind: "smd", category: "SOIC",
    pads,
    silk: [{ t: "line", x1: -1.95, y1: -bodyL / 2 - 0.1, x2: 1.95, y2: -bodyL / 2 - 0.1, w: SW }, { t: "line", x1: -1.95, y1: bodyL / 2 + 0.1, x2: 1.95, y2: bodyL / 2 + 0.1, w: SW }, { t: "line", x1: -3.5, y1: -bodyL / 2 - 0.1, x2: -1.95, y2: -bodyL / 2 - 0.1, w: SW }],
    model3d: { kind: "soic", n, W: 3.9, L: bodyL, H: 1.5, span: 6.0, pitch: 1.27 },
  });
}
def("TQFP-32_7x7mm_P0.8mm", {
  title: "TQFP-32, 7×7 mm, 0.8 mm pitch", kind: "smd", category: "QFP",
  pads: (() => {
    const pads = [];
    const s = 4.25;
    for (let i = 0; i < 8; i++) {
      const o = -2.8 + i * 0.8;
      pads.push({ num: String(i + 1), shape: "roundrect", x: -s, y: o, w: 1.5, h: 0.5, layers: "F" });
      pads.push({ num: String(i + 9), shape: "roundrect", x: o, y: s, w: 0.5, h: 1.5, layers: "F" });
      pads.push({ num: String(i + 17), shape: "roundrect", x: s, y: -o, w: 1.5, h: 0.5, layers: "F" });
      pads.push({ num: String(i + 25), shape: "roundrect", x: -o, y: -s, w: 0.5, h: 1.5, layers: "F" });
    }
    return pads;
  })(),
  // Body outline inside the pad rows (inner pad edges are at ±3.5 mm).
  silk: [...rectSilk(-3.3, -3.3, 3.3, 3.3), { t: "circle", cx: -4.6, cy: -4.2, r: 0.2, w: 0.3 }],
  model3d: { kind: "qfp", W: 7, H: 1.2, n: 32, pitch: 0.8, span: 9 },
});

// ---------------------------------------------------------------- small outlines
def("SOT-23", {
  title: "SOT-23 (3 pin)", kind: "smd", category: "SOT",
  pads: [
    { num: "1", shape: "roundrect", x: -0.95, y: 1.1, w: 0.6, h: 1.0, layers: "F" },
    { num: "2", shape: "roundrect", x: 0.95, y: 1.1, w: 0.6, h: 1.0, layers: "F" },
    { num: "3", shape: "roundrect", x: 0, y: -1.1, w: 0.6, h: 1.0, layers: "F" },
  ],
  silk: [{ t: "line", x1: -1.52, y1: -0.7, x2: -1.52, y2: 0.7, w: SW }, { t: "line", x1: 1.52, y1: -0.7, x2: 1.52, y2: 0.7, w: SW }],
  model3d: { kind: "sot23", W: 2.9, L: 1.3, H: 1.0 },
});
// SOT-23 for the transistor symbols, whose pins are numbered E/S=1, B/G=2,
// C/D=3 (TO-92 order). SOT-23 transistors are B/G on physical pin 1 and E/S
// on pin 2, so those two pads carry swapped numbers here.
def("SOT-23_Q", {
  title: "SOT-23 transistor (pad 1 = B/G, 2 = E/S, 3 = C/D)", kind: "smd", category: "SOT",
  pads: [
    { num: "2", shape: "roundrect", x: -0.95, y: 1.1, w: 0.6, h: 1.0, layers: "F" },
    { num: "1", shape: "roundrect", x: 0.95, y: 1.1, w: 0.6, h: 1.0, layers: "F" },
    { num: "3", shape: "roundrect", x: 0, y: -1.1, w: 0.6, h: 1.0, layers: "F" },
  ],
  silk: [{ t: "line", x1: -1.52, y1: -0.7, x2: -1.52, y2: 0.7, w: SW }, { t: "line", x1: 1.52, y1: -0.7, x2: 1.52, y2: 0.7, w: SW }],
  model3d: { kind: "sot23", W: 2.9, L: 1.3, H: 1.0 },
});
def("SOT-223-3", {
  title: "SOT-223 (3 pin + tab)", kind: "smd", category: "SOT",
  pads: [
    { num: "1", shape: "roundrect", x: -3.15, y: -2.3, w: 2.0, h: 0.9, layers: "F" },
    { num: "2", shape: "roundrect", x: -3.15, y: 0, w: 2.0, h: 0.9, layers: "F" },
    { num: "3", shape: "roundrect", x: -3.15, y: 2.3, w: 2.0, h: 0.9, layers: "F" },
    { num: "2", shape: "roundrect", x: 3.15, y: 0, w: 2.0, h: 3.5, layers: "F" },
  ],
  silk: [...rectSilk(-1.85, -3.35, 1.85, 3.35)],
  model3d: { kind: "sot223", W: 3.5, L: 6.5, H: 1.6 },
});
def("D_SOD-123", {
  title: "Diode SOD-123", kind: "smd", category: "Diode",
  pads: [
    { num: "1", shape: "roundrect", x: -1.65, y: 0, w: 0.9, h: 1.2, layers: "F" },
    { num: "2", shape: "roundrect", x: 1.65, y: 0, w: 0.9, h: 1.2, layers: "F" },
  ],
  silk: [{ t: "line", x1: -2.35, y1: -1.0, x2: 1.6, y2: -1.0, w: SW }, { t: "line", x1: -2.35, y1: 1.0, x2: 1.6, y2: 1.0, w: SW }, { t: "line", x1: -2.35, y1: -1.0, x2: -2.35, y2: 1.0, w: SW }],
  model3d: { kind: "sod123", L: 2.7, W: 1.6, H: 1.1 },
});
def("TO-92_Inline", {
  title: "TO-92 inline, 1.27 mm pitch", kind: "tht", category: "TO",
  pads: [
    // 0.95 mm wide pads leave 0.32 mm between them — enough for the Power class.
    { num: "1", shape: "rect", x: 0, y: 0, w: 0.95, h: 1.5, drill: 0.6, layers: "*" },
    { num: "2", shape: "oval", x: 1.27, y: 0, w: 0.95, h: 1.5, drill: 0.6, layers: "*" },
    { num: "3", shape: "oval", x: 2.54, y: 0, w: 0.95, h: 1.5, drill: 0.6, layers: "*" },
  ],
  silk: [{ t: "line", x1: -0.53, y1: 1.85, x2: 3.07, y2: 1.85, w: SW }, { t: "arc", cx: 1.27, cy: 0, r: 2.6, a1: 135, a2: 405, w: SW }],
  model3d: { kind: "to92", cx: 1.27, D: 4.8, H: 4.8 },
});
def("TO-220-3_Vertical", {
  title: "TO-220-3 vertical, 2.54 mm pitch", kind: "tht", category: "TO",
  pads: [
    { num: "1", shape: "rect", x: 0, y: 0, w: 1.9, h: 1.9, drill: 1.1, layers: "*" },
    { num: "2", shape: "oval", x: 2.54, y: 0, w: 1.9, h: 1.9, drill: 1.1, layers: "*" },
    { num: "3", shape: "oval", x: 5.08, y: 0, w: 1.9, h: 1.9, drill: 1.1, layers: "*" },
  ],
  silk: [...rectSilk(-2.46, -3.15, 7.54, 1.25), { t: "line", x1: -2.46, y1: -1.85, x2: 7.54, y2: -1.85, w: SW }],
  model3d: { kind: "to220", cx: 2.54, W: 10, T: 4.5, H: 15 },
});

// ---------------------------------------------------------------- generators for the footprint wizard
export function makeFootprint(kind, opts = {}) {
  const name = opts.name || `${kind}_custom`;
  if (kind === "header") {
    const rows = Math.max(1, Math.min(2, opts.rows | 0 || 1));
    const n = Math.max(1, Math.min(40, opts.n | 0 || 4));
    const pitch = Number(opts.pitch) || 2.54;
    const pads = [];
    for (let i = 0; i < n; i++) {
      for (let r = 0; r < rows; r++) {
        const num = rows === 1 ? i + 1 : i * 2 + r + 1;
        pads.push({ num: String(num), shape: num === 1 ? "rect" : "oval", x: r * pitch, y: i * pitch, w: 1.7, h: 1.7, drill: 1.0, layers: "*" });
      }
    }
    return { name, title: `Header ${rows}×${n} P${pitch}`, kind: "tht", category: "Custom", pads, silk: rectSilk(-pitch / 2 - 0.06, -pitch / 2 - 0.06, (rows - 1) * pitch + pitch / 2 + 0.06, (n - 1) * pitch + pitch / 2 + 0.06), model3d: { kind: "header", rows, n, pitch }, courtyard: null };
  }
  if (kind === "dip") {
    const n = Math.max(4, Math.min(64, (opts.n | 0) & ~1 || 8));
    const row = Number(opts.row) || 7.62;
    const half = n / 2;
    const pads = [];
    for (let i = 0; i < half; i++) pads.push({ num: String(i + 1), shape: i === 0 ? "rect" : "oval", x: 0, y: i * 2.54, w: 1.6, h: 1.6, drill: 0.8, layers: "*" });
    for (let i = 0; i < half; i++) pads.push({ num: String(half + i + 1), shape: "oval", x: row, y: (half - 1 - i) * 2.54, w: 1.6, h: 1.6, drill: 0.8, layers: "*" });
    return { name, title: `DIP-${n} W${row}`, kind: "tht", category: "Custom", pads, silk: rectSilk(1.16, -1.33, row - 1.16, (half - 1) * 2.54 + 1.33), model3d: { kind: "dip", n, pitch: 2.54, row } };
  }
  if (kind === "soic") {
    const n = Math.max(4, Math.min(64, (opts.n | 0) & ~1 || 8));
    const pitch = Number(opts.pitch) || 1.27;
    const span = Number(opts.span) || 5.4;
    const half = n / 2;
    const y0 = -((half - 1) * pitch) / 2;
    const pads = [];
    for (let i = 0; i < half; i++) pads.push({ num: String(i + 1), shape: "roundrect", x: -span / 2, y: y0 + i * pitch, w: 1.55, h: pitch * 0.47, layers: "F" });
    for (let i = 0; i < half; i++) pads.push({ num: String(half + i + 1), shape: "roundrect", x: span / 2, y: y0 + (half - 1 - i) * pitch, w: 1.55, h: pitch * 0.47, layers: "F" });
    const L = (half - 1) * pitch + 1.2;
    return { name, title: `SOIC-${n} P${pitch}`, kind: "smd", category: "Custom", pads, silk: rectSilk(-span / 2 + 1.0, -L / 2, span / 2 - 1.0, L / 2), model3d: { kind: "soic", n, W: span - 2.0, L, H: 1.5, span: span + 0.6, pitch } };
  }
  if (kind === "qfp") {
    const per = Math.max(2, Math.min(40, opts.perSide | 0 || 8));
    const pitch = Number(opts.pitch) || 0.8;
    const bodyW = Math.max(per * pitch + 1, Number(opts.body) || per * pitch + 1);
    const s = bodyW / 2 + 0.75;
    const pads = [];
    for (let i = 0; i < per; i++) {
      const o = -((per - 1) * pitch) / 2 + i * pitch;
      pads.push({ num: String(i + 1), shape: "roundrect", x: -s, y: o, w: 1.5, h: pitch * 0.6, layers: "F" });
      pads.push({ num: String(i + 1 + per), shape: "roundrect", x: o, y: s, w: pitch * 0.6, h: 1.5, layers: "F" });
      pads.push({ num: String(i + 1 + per * 2), shape: "roundrect", x: s, y: -o, w: 1.5, h: pitch * 0.6, layers: "F" });
      pads.push({ num: String(i + 1 + per * 3), shape: "roundrect", x: -o, y: -s, w: pitch * 0.6, h: 1.5, layers: "F" });
    }
    return { name, title: `QFP-${per * 4} P${pitch}`, kind: "smd", category: "Custom", pads, silk: rectSilk(-bodyW / 2, -bodyW / 2, bodyW / 2, bodyW / 2), model3d: { kind: "qfp", W: bodyW, H: 1.2, n: per * 4, pitch, span: bodyW + 2 } };
  }
  if (kind === "chip") {
    const L = Number(opts.L) || 2.0;
    const W = Number(opts.W) || 1.25;
    const pw = L * 0.5;
    return { name, title: `Chip ${L}×${W}`, kind: "smd", category: "Custom", pads: [{ num: "1", shape: "roundrect", x: -L / 2, y: 0, w: pw, h: W * 1.15, layers: "F" }, { num: "2", shape: "roundrect", x: L / 2, y: 0, w: pw, h: W * 1.15, layers: "F" }], silk: [], model3d: { kind: "chip", L, W, H: 0.5, body: "capacitor" } };
  }
  throw new Error(`unknown footprint generator ${kind}`);
}

// ---------------------------------------------------------------- lookup
const userFootprints = new Map();

export function registerUserFootprints(list) {
  userFootprints.clear();
  for (const fp of list || []) {
    if (!fp || !fp.name) continue;
    if (!fp.courtyard) fp.courtyard = autoCourtyard(fp);
    userFootprints.set(fp.name, fp);
  }
}

export function getFootprint(name) {
  return userFootprints.get(name) || FOOTPRINTS[name] || null;
}

export function allFootprints() {
  return [...Object.values(FOOTPRINTS), ...userFootprints.values()];
}

export function searchFootprints(query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return allFootprints();
  return allFootprints().filter((f) => `${f.name} ${f.title} ${f.category}`.toLowerCase().includes(q));
}

export { autoCourtyard };
