// Schematic symbol library.
//
// Units are mils. A pin's (x, y) is its connection tip; `dir` is the direction
// from the tip towards the body (L R U D) and `len` the length drawn that way.
// Pin types follow KiCad: input output bidir tristate passive power_in
// power_out open_collector unspecified no_connect.
//
// body primitives:
//   {t:"line", pts:[[x,y],...], w?}
//   {t:"rect", x1,y1,x2,y2, fill?}        fill: "body" | "fg" | undefined
//   {t:"circle", cx,cy,r, fill?}
//   {t:"arc", cx,cy,r, a1,a2}             degrees, screen CCW from +x
//   {t:"poly", pts, fill?}                closed
//   {t:"text", x,y,text,size?,anchor?}    anchor: "start" | "middle" | "end"
//
// sim: how the simulator treats the part (see src/sim/engine.js). `pins` lists
// the symbol pin numbers in the order the model expects.

const P = (num, name, x, y, dir, type = "passive", extra = {}) => ({ num: String(num), name, x, y, dir, len: extra.len ?? 100, type, ...extra });

function twoPin(body, opts = {}) {
  return {
    pins: [P(1, "~", 0, -200, "D", "passive", { hideName: true, hideNum: opts.hideNum ?? true }), P(2, "~", 0, 200, "U", "passive", { hideName: true, hideNum: opts.hideNum ?? true })],
    body,
  };
}

const SYMBOLS = {};
function def(name, spec) {
  SYMBOLS[name] = { name, ...spec };
}

// ---------------------------------------------------------------- passives
def("R", {
  title: "Resistor", category: "Passive", refPrefix: "R", value: "10k",
  footprints: ["R_0805", "R_0603", "R_1206", "R_Axial_P10.16mm", "R_Axial_P7.62mm"],
  keywords: "resistor ohm 저항",
  sim: { model: "R", pins: ["1", "2"] },
  ...twoPin([{ t: "rect", x1: -40, y1: -100, x2: 40, y2: 100 }]),
});
def("R_POT", {
  title: "Potentiometer", category: "Passive", refPrefix: "RV", value: "10k",
  footprints: ["Potentiometer_3386P"], keywords: "pot trimmer variable resistor 가변저항",
  sim: { model: "POT", pins: ["1", "2", "3"] },
  pins: [P(1, "1", 0, -200, "D", "passive", { hideName: true }), P(2, "W", 200, 0, "L", "passive", { hideName: true }), P(3, "3", 0, 200, "U", "passive", { hideName: true })],
  body: [{ t: "rect", x1: -40, y1: -100, x2: 40, y2: 100 }, { t: "poly", pts: [[45, 0], [85, -20], [85, 20]], fill: "fg" }, { t: "line", pts: [[85, 0], [100, 0]] }],
});
def("C", {
  title: "Capacitor", category: "Passive", refPrefix: "C", value: "100n",
  footprints: ["C_0805", "C_0603", "C_1206", "C_Disc_D5.0mm_P5.00mm"], keywords: "capacitor cap ceramic 커패시터 콘덴서",
  sim: { model: "C", pins: ["1", "2"] },
  ...twoPin([
    { t: "line", pts: [[0, -100], [0, -20]] }, { t: "line", pts: [[0, 20], [0, 100]] },
    { t: "line", pts: [[-80, -20], [80, -20]], w: 2 }, { t: "line", pts: [[-80, 20], [80, 20]], w: 2 },
  ]),
});
def("C_POL", {
  title: "Polarized capacitor", category: "Passive", refPrefix: "C", value: "10u",
  footprints: ["CP_Radial_D5.0mm_P2.00mm", "CP_Radial_D8.0mm_P3.50mm"], keywords: "electrolytic polarized capacitor 전해",
  sim: { model: "C", pins: ["1", "2"] },
  ...twoPin([
    { t: "line", pts: [[0, -100], [0, -20]] }, { t: "line", pts: [[0, 20], [0, 100]] },
    { t: "rect", x1: -80, y1: -30, x2: 80, y2: -20 },
    { t: "arc", cx: 0, cy: 120, r: 100, a1: 55, a2: 125 },
    { t: "text", x: -70, y: -50, text: "+", size: 50, anchor: "middle" },
  ]),
});
def("L", {
  title: "Inductor", category: "Passive", refPrefix: "L", value: "10u",
  footprints: ["L_0805", "L_1206"], keywords: "inductor coil choke 인덕터 코일",
  sim: { model: "L", pins: ["1", "2"] },
  ...twoPin([
    { t: "arc", cx: 0, cy: -75, r: 25, a1: -90, a2: 90 }, { t: "arc", cx: 0, cy: -25, r: 25, a1: -90, a2: 90 },
    { t: "arc", cx: 0, cy: 25, r: 25, a1: -90, a2: 90 }, { t: "arc", cx: 0, cy: 75, r: 25, a1: -90, a2: 90 },
  ]),
});
def("FUSE", {
  title: "Fuse", category: "Passive", refPrefix: "F", value: "500mA",
  footprints: ["Fuse_1206"], keywords: "fuse 퓨즈",
  sim: { model: "R", pins: ["1", "2"], fixed: 0.05 },
  ...twoPin([{ t: "rect", x1: -30, y1: -100, x2: 30, y2: 100 }, { t: "line", pts: [[0, -100], [0, 100]] }]),
});
def("CRYSTAL", {
  title: "Crystal", category: "Passive", refPrefix: "Y", value: "16MHz",
  footprints: ["Crystal_HC49-U"], keywords: "crystal oscillator xtal 크리스탈",
  ...twoPin([
    { t: "line", pts: [[0, -100], [0, -50]] }, { t: "line", pts: [[0, 50], [0, 100]] },
    { t: "line", pts: [[-70, -50], [70, -50]], w: 2 }, { t: "line", pts: [[-70, 50], [70, 50]], w: 2 },
    { t: "rect", x1: -50, y1: -30, x2: 50, y2: 30 },
  ]),
});

// ---------------------------------------------------------------- diodes
function diodeBody(extra = []) {
  return [
    { t: "line", pts: [[0, -100], [0, 100]] },
    { t: "poly", pts: [[-50, -40], [50, -40], [0, 40]], fill: "fg" },
    { t: "line", pts: [[-50, 40], [50, 40]], w: 2 },
    ...extra,
  ];
}
// Pin 1 = cathode (K), pin 2 = anode (A); anode on top so current flows down.
function diodePins() {
  return [P(1, "K", 0, 200, "U", "passive", { hideName: true, hideNum: true }), P(2, "A", 0, -200, "D", "passive", { hideName: true, hideNum: true })];
}
def("D", {
  title: "Diode", category: "Diode", refPrefix: "D", value: "1N4148",
  footprints: ["D_SOD-123", "D_DO-41_P10.16mm"], keywords: "diode rectifier 다이오드",
  sim: { model: "D", pins: ["2", "1"], params: { is: 2.52e-9, n: 1.752 } },
  pins: diodePins(), body: diodeBody(),
});
def("D_SCHOTTKY", {
  title: "Schottky diode", category: "Diode", refPrefix: "D", value: "BAT54",
  footprints: ["D_SOD-123"], keywords: "schottky diode 쇼트키",
  sim: { model: "D", pins: ["2", "1"], params: { is: 3e-7, n: 1.05 } },
  pins: diodePins(), body: diodeBody([{ t: "line", pts: [[-50, 40], [-50, 25]] }, { t: "line", pts: [[50, 40], [50, 55]] }]),
});
def("D_ZENER", {
  title: "Zener diode", category: "Diode", refPrefix: "D", value: "5V1",
  footprints: ["D_SOD-123"], keywords: "zener diode 제너",
  sim: { model: "D", pins: ["2", "1"], params: { is: 1e-12, n: 1.5, bv: 5.1 } },
  pins: diodePins(), body: diodeBody([{ t: "line", pts: [[-50, 40], [-65, 25]] }, { t: "line", pts: [[50, 40], [65, 55]] }]),
});
def("LED", {
  title: "LED", category: "Diode", refPrefix: "D", value: "Red",
  footprints: ["LED_0805", "LED_D5.0mm", "LED_D3.0mm"], keywords: "led light emitting diode 발광",
  sim: { model: "D", pins: ["2", "1"], params: { is: 1e-19, n: 1.8, led: true } },
  pins: diodePins(),
  body: diodeBody([
    { t: "line", pts: [[60, -10], [110, -50]] }, { t: "poly", pts: [[110, -50], [88, -45], [100, -33]], fill: "fg" },
    { t: "line", pts: [[60, 30], [110, -10]] }, { t: "poly", pts: [[110, -10], [88, -5], [100, 7]], fill: "fg" },
  ]),
});

// ---------------------------------------------------------------- transistors
def("Q_NPN", {
  title: "NPN transistor", category: "Transistor", refPrefix: "Q", value: "2N3904",
  footprints: ["TO-92_Inline", "SOT-23_Q"], keywords: "npn bjt transistor 트랜지스터",
  sim: { model: "NPN", pins: ["3", "2", "1"], params: { is: 6.7e-15, bf: 200, br: 2 } }, // C B E — pins numbered E=1 B=2 C=3 like a TO-92 2N3904
  pins: [P(2, "B", -200, 0, "R", "input", { hideName: true }), P(3, "C", 100, -200, "D", "passive", { hideName: true }), P(1, "E", 100, 200, "U", "passive", { hideName: true })],
  body: [
    { t: "circle", cx: 30, cy: 0, r: 110 },
    { t: "line", pts: [[-100, 0], [-20, 0]] }, { t: "line", pts: [[-20, -60], [-20, 60]], w: 2 },
    { t: "line", pts: [[-20, -25], [100, -100]] }, { t: "line", pts: [[-20, 25], [100, 100]] },
    { t: "poly", pts: [[100, 100], [55, 95], [75, 65]], fill: "fg" },
  ],
});
def("Q_PNP", {
  title: "PNP transistor", category: "Transistor", refPrefix: "Q", value: "2N3906",
  footprints: ["TO-92_Inline", "SOT-23_Q"], keywords: "pnp bjt transistor 트랜지스터",
  sim: { model: "PNP", pins: ["3", "2", "1"], params: { is: 6.7e-15, bf: 200, br: 2 } },
  pins: [P(2, "B", -200, 0, "R", "input", { hideName: true }), P(3, "C", 100, 200, "U", "passive", { hideName: true }), P(1, "E", 100, -200, "D", "passive", { hideName: true })],
  body: [
    { t: "circle", cx: 30, cy: 0, r: 110 },
    { t: "line", pts: [[-100, 0], [-20, 0]] }, { t: "line", pts: [[-20, -60], [-20, 60]], w: 2 },
    { t: "line", pts: [[-20, -25], [100, -100]] }, { t: "line", pts: [[-20, 25], [100, 100]] },
    { t: "poly", pts: [[-15, -28], [25, -35], [15, -60]], fill: "fg" },
  ],
});
def("Q_NMOS", {
  title: "N-channel MOSFET", category: "Transistor", refPrefix: "Q", value: "2N7000",
  footprints: ["TO-92_Inline", "SOT-23_Q"], keywords: "nmos mosfet fet 모스펫",
  sim: { model: "NMOS", pins: ["3", "2", "1"], params: { vt: 2.1, k: 0.1 } }, // D G S — pins numbered S=1 G=2 D=3 like a TO-92 2N7000
  pins: [P(2, "G", -200, 0, "R", "input", { hideName: true }), P(3, "D", 100, -200, "D", "passive", { hideName: true }), P(1, "S", 100, 200, "U", "passive", { hideName: true })],
  body: [
    { t: "circle", cx: 30, cy: 0, r: 110 },
    { t: "line", pts: [[-100, 0], [-40, 0]] }, { t: "line", pts: [[-40, -60], [-40, 60]], w: 2 },
    { t: "line", pts: [[-20, -70], [-20, -30]], w: 2 }, { t: "line", pts: [[-20, -20], [-20, 20]], w: 2 }, { t: "line", pts: [[-20, 30], [-20, 70]], w: 2 },
    { t: "line", pts: [[-20, -50], [100, -50], [100, -100]] }, { t: "line", pts: [[-20, 50], [100, 50], [100, 100]] },
    { t: "line", pts: [[-20, 0], [100, 0], [100, 50]] }, { t: "poly", pts: [[-20, 0], [10, -15], [10, 15]], fill: "fg" },
  ],
});
def("Q_PMOS", {
  title: "P-channel MOSFET", category: "Transistor", refPrefix: "Q", value: "PMOS",
  footprints: ["TO-92_Inline", "SOT-23_Q"], keywords: "pmos mosfet fet 모스펫",
  sim: { model: "PMOS", pins: ["3", "2", "1"], params: { vt: 2.0, k: 0.1 } },
  pins: [P(2, "G", -200, 0, "R", "input", { hideName: true }), P(3, "D", 100, 200, "U", "passive", { hideName: true }), P(1, "S", 100, -200, "D", "passive", { hideName: true })],
  body: [
    { t: "circle", cx: 30, cy: 0, r: 110 },
    { t: "line", pts: [[-100, 0], [-40, 0]] }, { t: "line", pts: [[-40, -60], [-40, 60]], w: 2 },
    { t: "line", pts: [[-20, -70], [-20, -30]], w: 2 }, { t: "line", pts: [[-20, -20], [-20, 20]], w: 2 }, { t: "line", pts: [[-20, 30], [-20, 70]], w: 2 },
    { t: "line", pts: [[-20, -50], [100, -50], [100, -100]] }, { t: "line", pts: [[-20, 50], [100, 50], [100, 100]] },
    { t: "line", pts: [[-20, 0], [100, 0], [100, -50]] }, { t: "poly", pts: [[100, 0], [70, -15], [70, 15]], fill: "fg" },
  ],
});

// ---------------------------------------------------------------- sources & switches
def("VSOURCE", {
  title: "Voltage source", category: "Simulation", refPrefix: "V", value: "5",
  footprints: ["PinHeader_1x02_P2.54mm"], keywords: "voltage source dc sine pulse 전압원",
  fields: { wave: "dc", amplitude: "1", freq: "1k", offset: "0", period: "1m", duty: "50" },
  sim: { model: "V", pins: ["1", "2"] },
  pins: [P(1, "+", 0, -200, "D", "power_out", { hideName: true }), P(2, "-", 0, 200, "U", "power_out", { hideName: true })],
  body: [
    { t: "circle", cx: 0, cy: 0, r: 100 },
    { t: "text", x: 0, y: -35, text: "+", size: 50, anchor: "middle" }, { t: "text", x: 0, y: 65, text: "−", size: 50, anchor: "middle" },
  ],
});
def("ISOURCE", {
  title: "Current source", category: "Simulation", refPrefix: "I", value: "1m",
  footprints: ["PinHeader_1x02_P2.54mm"], keywords: "current source 전류원",
  sim: { model: "I", pins: ["1", "2"] },
  pins: [P(1, "+", 0, -200, "D", "power_out", { hideName: true }), P(2, "-", 0, 200, "U", "power_out", { hideName: true })],
  body: [
    { t: "circle", cx: 0, cy: 0, r: 100 },
    { t: "line", pts: [[0, 60], [0, -50]] }, { t: "poly", pts: [[0, -60], [-20, -25], [20, -25]], fill: "fg" },
  ],
});
def("BATTERY", {
  title: "Battery", category: "Power", refPrefix: "BT", value: "9",
  footprints: ["PinHeader_1x02_P2.54mm"], keywords: "battery cell 배터리 건전지",
  sim: { model: "V", pins: ["1", "2"] },
  pins: [P(1, "+", 0, -200, "D", "power_out", { hideName: true }), P(2, "-", 0, 200, "U", "power_out", { hideName: true })],
  body: [
    { t: "line", pts: [[0, -100], [0, -40]] }, { t: "line", pts: [[0, 40], [0, 100]] },
    { t: "line", pts: [[-80, -40], [80, -40]], w: 2 }, { t: "line", pts: [[-40, -10], [40, -10]], w: 3 },
    { t: "line", pts: [[-80, 10], [80, 10]], w: 2 }, { t: "line", pts: [[-40, 40], [40, 40]], w: 3 },
    { t: "text", x: -70, y: -60, text: "+", size: 45, anchor: "middle" },
  ],
});
def("SW_PUSH", {
  title: "Push button", category: "Switch", refPrefix: "SW", value: "SW_Push",
  footprints: ["SW_PUSH_6mm"], keywords: "push button switch tact 버튼 스위치",
  fields: { state: "open" },
  sim: { model: "SW", pins: ["1", "2"] },
  pins: [P(1, "1", -200, 0, "R", "passive", { hideName: true, hideNum: true }), P(2, "2", 200, 0, "L", "passive", { hideName: true, hideNum: true })],
  body: [
    { t: "circle", cx: -80, cy: 0, r: 15 }, { t: "circle", cx: 80, cy: 0, r: 15 },
    { t: "line", pts: [[-100, -50], [100, -50]] }, { t: "line", pts: [[0, -50], [0, -100]] }, { t: "line", pts: [[-30, -100], [30, -100]] },
  ],
});
def("SW_SPST", {
  title: "Toggle switch", category: "Switch", refPrefix: "SW", value: "SW_SPST",
  footprints: ["PinHeader_1x02_P2.54mm"], keywords: "toggle switch spst 토글 스위치",
  fields: { state: "closed" },
  sim: { model: "SW", pins: ["1", "2"] },
  pins: [P(1, "1", -200, 0, "R", "passive", { hideName: true, hideNum: true }), P(2, "2", 200, 0, "L", "passive", { hideName: true, hideNum: true })],
  body: [{ t: "circle", cx: -80, cy: 0, r: 15 }, { t: "circle", cx: 80, cy: 0, r: 15 }, { t: "line", pts: [[-68, -8], [75, -60]] }],
});

// ---------------------------------------------------------------- misc
def("BUZZER", {
  title: "Buzzer", category: "Misc", refPrefix: "BZ", value: "Buzzer",
  footprints: ["Buzzer_12mm"], keywords: "buzzer piezo speaker 부저",
  sim: { model: "R", pins: ["1", "2"], fixed: 42 },
  pins: [P(1, "+", -100, 200, "U", "passive", { hideName: true }), P(2, "-", 100, 200, "U", "passive", { hideName: true })],
  body: [{ t: "arc", cx: 0, cy: 100, r: 130, a1: 0, a2: 180 }, { t: "line", pts: [[-130, 100], [130, 100]] }],
});
def("MOTOR", {
  title: "DC motor", category: "Misc", refPrefix: "M", value: "Motor",
  footprints: ["PinHeader_1x02_P2.54mm"], keywords: "motor dc 모터",
  sim: { model: "R", pins: ["1", "2"], fixed: 20 },
  ...twoPin([{ t: "circle", cx: 0, cy: 0, r: 90 }, { t: "text", x: 0, y: 20, text: "M", size: 70, anchor: "middle" }]),
});
def("TESTPOINT", {
  title: "Test point", category: "Misc", refPrefix: "TP", value: "TP",
  footprints: ["TestPoint_Pad_D1.5mm"], keywords: "test point probe 테스트",
  pins: [P(1, "1", 0, 100, "U", "passive", { hideName: true, hideNum: true, len: 50 })],
  body: [{ t: "circle", cx: 0, cy: 30, r: 20 }],
});
def("MOUNTING_HOLE", {
  title: "Mounting hole", category: "Mechanical", refPrefix: "H", value: "MountingHole",
  footprints: ["MountingHole_3.2mm"], keywords: "mounting hole screw 마운팅 홀",
  pins: [], body: [{ t: "circle", cx: 0, cy: 0, r: 50 }, { t: "circle", cx: 0, cy: 0, r: 25 }],
});

// ---------------------------------------------------------------- power ports
function powerUp(net) {
  return {
    title: `Power ${net}`, category: "Power", refPrefix: "#PWR", value: net, power: net,
    footprints: [], keywords: `power supply rail ${net} 전원`,
    pins: [P(1, net, 0, 0, "U", "power_in", { hideName: true, hideNum: true, len: 0 })],
    body: [{ t: "line", pts: [[0, 0], [0, -60]] }, { t: "line", pts: [[-40, -60], [40, -60]], w: 2 }, { t: "text", x: 0, y: -80, text: net, size: 45, anchor: "middle", valueText: true }],
  };
}
def("GND", {
  title: "Ground", category: "Power", refPrefix: "#PWR", value: "GND", power: "GND",
  footprints: [], keywords: "ground gnd 0v 접지",
  pins: [P(1, "GND", 0, 0, "D", "power_in", { hideName: true, hideNum: true, len: 0 })],
  body: [{ t: "line", pts: [[0, 0], [0, 50]] }, { t: "poly", pts: [[-50, 50], [50, 50], [0, 100]] }],
});
for (const net of ["VCC", "+5V", "+3V3", "+12V", "VBAT"]) def(net, powerUp(net));
def("-12V", {
  ...powerUp("-12V"),
  pins: [P(1, "-12V", 0, 0, "D", "power_in", { hideName: true, hideNum: true, len: 0 })],
  body: [{ t: "line", pts: [[0, 0], [0, 60]] }, { t: "line", pts: [[-40, 60], [40, 60]], w: 2 }, { t: "text", x: 0, y: 110, text: "-12V", size: 45, anchor: "middle", valueText: true }],
});
def("PWR_FLAG", {
  title: "Power flag", category: "Power", refPrefix: "#FLG", value: "PWR_FLAG", flag: true,
  footprints: [], keywords: "power flag erc 전원 플래그",
  pins: [P(1, "pwr", 0, 0, "U", "power_out", { hideName: true, hideNum: true, len: 0 })],
  body: [{ t: "line", pts: [[0, 0], [0, -50]] }, { t: "poly", pts: [[0, -50], [-40, -80], [0, -110], [40, -80]] }],
});

// ---------------------------------------------------------------- generated boxes
// left/right/top/bottom: arrays of [num, name, type]. Box sized to fit.
export function makeBoxSymbol(name, { title, category = "IC", refPrefix = "U", value, footprints = [], left = [], right = [], top = [], bottom = [], keywords = "", sim, fields } = {}) {
  const rows = Math.max(left.length, right.length, 1);
  const cols = Math.max(top.length, bottom.length, 0);
  const height = (rows + 1) * 100;
  const longest = Math.max(0, ...left.map((p) => p[1].length), ...right.map((p) => p[1].length));
  let width = Math.max(400, Math.ceil(((longest * 2 * 40) + 120) / 200) * 200, (cols + 1) * 100);
  width = Math.ceil(width / 200) * 200;
  const y1 = -Math.ceil(height / 200) * 100;
  const y2 = y1 + Math.ceil(height / 100) * 100;
  const x1 = -width / 2;
  const x2 = width / 2;
  const pins = [];
  const yStart = y1 + 100;
  left.forEach(([num, pname, type], i) => pins.push(P(num, pname, x1 - 200, yStart + i * 100, "R", type || "passive", { len: 200 })));
  right.forEach(([num, pname, type], i) => pins.push(P(num, pname, x2 + 200, yStart + i * 100, "L", type || "passive", { len: 200 })));
  const xStart = x1 + 100;
  top.forEach(([num, pname, type], i) => pins.push(P(num, pname, xStart + i * 100, y1 - 200, "D", type || "passive", { len: 200 })));
  bottom.forEach(([num, pname, type], i) => pins.push(P(num, pname, xStart + i * 100, y2 + 200, "U", type || "passive", { len: 200 })));
  return {
    name, title: title || name, category, refPrefix, value: value || name, footprints, keywords, sim, fields,
    pins, body: [{ t: "rect", x1, y1, x2, y2, fill: "body" }],
  };
}

function box(name, spec) {
  SYMBOLS[name] = makeBoxSymbol(name, spec);
}

for (let n = 1; n <= 10; n++) {
  const pins = Array.from({ length: n }, (_, i) => [i + 1, `Pin_${i + 1}`, "passive"]);
  const nn = String(n).padStart(2, "0");
  box(`Conn_01x${nn}`, {
    title: `Connector 1×${n}`, category: "Connector", refPrefix: "J", value: `Conn_01x${nn}`,
    footprints: [`PinHeader_1x${nn}_P2.54mm`], keywords: `connector header pin ${n} 커넥터 헤더`, left: pins,
  });
}
for (const n of [2, 3, 4, 5, 8]) {
  const nn = String(n).padStart(2, "0");
  const left = Array.from({ length: n }, (_, i) => [i * 2 + 1, `Pin_${i * 2 + 1}`, "passive"]);
  const right = Array.from({ length: n }, (_, i) => [i * 2 + 2, `Pin_${i * 2 + 2}`, "passive"]);
  box(`Conn_02x${nn}`, {
    title: `Connector 2×${n}`, category: "Connector", refPrefix: "J", value: `Conn_02x${nn}`,
    footprints: [`PinHeader_2x${nn}_P2.54mm`], keywords: `connector header dual ${n * 2} 커넥터`, left, right,
  });
}

box("NE555", {
  title: "NE555 timer", category: "IC", value: "NE555", footprints: ["DIP-8_W7.62mm", "SOIC-8_3.9x4.9mm"],
  keywords: "555 timer oscillator 타이머",
  left: [["2", "TR", "input"], ["6", "THR", "input"], ["5", "CV", "input"], ["4", "R", "input"]],
  right: [["3", "Q", "output"], ["7", "DIS", "open_collector"], ["8", "VCC", "power_in"], ["1", "GND", "power_in"]],
});
box("LM7805", {
  title: "5V linear regulator", category: "Power", value: "LM7805", footprints: ["TO-220-3_Vertical"],
  keywords: "regulator 7805 ldo 레귤레이터", sim: { model: "REG", pins: ["1", "3", "2"], params: { vout: 5, dropout: 2 } },
  left: [["1", "VI", "power_in"]], right: [["3", "VO", "power_out"]], bottom: [["2", "GND", "power_in"]],
});
box("AMS1117-3.3", {
  title: "3.3V LDO regulator", category: "Power", value: "AMS1117-3.3", footprints: ["SOT-223-3"],
  keywords: "ldo regulator 3.3 레귤레이터", sim: { model: "REG", pins: ["3", "2", "1"], params: { vout: 3.3, dropout: 1.1 } },
  left: [["3", "VI", "power_in"]], right: [["2", "VO", "power_out"]], bottom: [["1", "GND", "power_in"]],
});
box("LM358", {
  title: "Dual op-amp", category: "IC", value: "LM358", footprints: ["DIP-8_W7.62mm", "SOIC-8_3.9x4.9mm"],
  keywords: "opamp operational amplifier dual 연산증폭기",
  left: [["3", "+IN_A", "input"], ["2", "-IN_A", "input"], ["5", "+IN_B", "input"], ["6", "-IN_B", "input"]],
  right: [["1", "OUT_A", "output"], ["7", "OUT_B", "output"], ["8", "V+", "power_in"], ["4", "V-", "power_in"]],
});
box("ATmega328P", {
  title: "ATmega328P MCU", category: "MCU", value: "ATmega328P-PU", footprints: ["DIP-28_W7.62mm"],
  keywords: "avr atmega arduino microcontroller mcu 마이크로컨트롤러",
  left: [["1", "~RESET~/PC6", "input"], ["9", "XTAL1/PB6", "bidir"], ["10", "XTAL2/PB7", "bidir"], ["7", "VCC", "power_in"], ["20", "AVCC", "power_in"], ["21", "AREF", "passive"], ["8", "GND", "power_in"], ["22", "GND", "power_in"],
    ["2", "PD0/RXD", "bidir"], ["3", "PD1/TXD", "bidir"], ["4", "PD2", "bidir"], ["5", "PD3", "bidir"], ["6", "PD4", "bidir"], ["11", "PD5", "bidir"]],
  right: [["12", "PD6", "bidir"], ["13", "PD7", "bidir"], ["14", "PB0", "bidir"], ["15", "PB1", "bidir"], ["16", "PB2", "bidir"], ["17", "PB3/MOSI", "bidir"], ["18", "PB4/MISO", "bidir"],
    ["19", "PB5/SCK", "bidir"], ["23", "PC0", "bidir"], ["24", "PC1", "bidir"], ["25", "PC2", "bidir"], ["26", "PC3", "bidir"], ["27", "PC4/SDA", "bidir"], ["28", "PC5/SCL", "bidir"]],
});
box("ATtiny85", {
  title: "ATtiny85 MCU", category: "MCU", value: "ATtiny85-20PU", footprints: ["DIP-8_W7.62mm", "SOIC-8_3.9x4.9mm"],
  keywords: "avr attiny microcontroller mcu",
  left: [["1", "PB5/~RESET~", "bidir"], ["2", "PB3", "bidir"], ["3", "PB4", "bidir"], ["4", "GND", "power_in"]],
  right: [["8", "VCC", "power_in"], ["7", "PB2/SCK", "bidir"], ["6", "PB1/MISO", "bidir"], ["5", "PB0/MOSI", "bidir"]],
});
box("74HC595", {
  title: "8-bit shift register", category: "Logic", value: "74HC595", footprints: ["DIP-16_W7.62mm", "SOIC-16_3.9x9.9mm"],
  keywords: "shift register 595 logic 시프트",
  left: [["14", "SER", "input"], ["11", "SRCLK", "input"], ["12", "RCLK", "input"], ["10", "~SRCLR~", "input"], ["13", "~OE~", "input"], ["16", "VCC", "power_in"], ["8", "GND", "power_in"]],
  right: [["15", "QA", "tristate"], ["1", "QB", "tristate"], ["2", "QC", "tristate"], ["3", "QD", "tristate"], ["4", "QE", "tristate"], ["5", "QF", "tristate"], ["6", "QG", "tristate"], ["7", "QH", "tristate"], ["9", "QH'", "output"]],
});
box("CH340G", {
  title: "USB-UART bridge", category: "Interface", value: "CH340G", footprints: ["SOIC-16_3.9x9.9mm"],
  keywords: "usb uart serial ch340 인터페이스",
  left: [["5", "UD+", "bidir"], ["6", "UD-", "bidir"], ["9", "XI", "input"], ["10", "XO", "output"], ["16", "VCC", "power_in"], ["4", "V3", "passive"], ["1", "GND", "power_in"]],
  right: [["2", "TXD", "output"], ["3", "RXD", "input"], ["13", "~DTR~", "output"], ["14", "~RTS~", "output"], ["11", "~CTS~", "input"], ["12", "~DSR~", "input"], ["15", "R232", "input"], ["7", "~RI~", "input"], ["8", "~DCD~", "input"]],
});
box("USB_B_Micro", {
  title: "Micro USB connector", category: "Connector", refPrefix: "J", value: "USB_B_Micro", footprints: ["USB_Micro-B"],
  keywords: "usb micro connector 커넥터",
  right: [["1", "VBUS", "power_out"], ["2", "D-", "bidir"], ["3", "D+", "bidir"], ["4", "ID", "passive"], ["5", "GND", "power_out"]],
});

// Op-amp triangle (single, with supplies) — simulated as a high-gain VCVS with rail clamping.
def("OPAMP", {
  title: "Op-amp", category: "Simulation", refPrefix: "U", value: "OPAMP",
  footprints: ["DIP-8_W7.62mm", "SOIC-8_3.9x4.9mm"], keywords: "opamp op-amp amplifier ideal 연산증폭기",
  sim: { model: "OPAMP", pins: ["3", "2", "1", "7", "4"], params: { gain: 1e5 } }, // +in -in out V+ V-
  pins: [
    P(3, "+", -300, -100, "R", "input", { len: 100 }), P(2, "-", -300, 100, "R", "input", { len: 100 }), P(1, "~", 300, 0, "L", "output", { hideName: true, len: 100 }),
    P(7, "V+", 0, -300, "D", "power_in", { hideName: true, len: 150 }), P(4, "V-", 0, 300, "U", "power_in", { hideName: true, len: 150 }),
  ],
  body: [{ t: "poly", pts: [[-200, -200], [200, 0], [-200, 200]], fill: "body" }],
});

// ---------------------------------------------------------------- multi-unit parts
const opampUnit = (name, inP, inN, out) => ({
  name,
  pins: [P(inP, "+", -300, -100, "R", "input", { len: 100 }), P(inN, "-", -300, 100, "R", "input", { len: 100 }), P(out, "~", 300, 0, "L", "output", { hideName: true, len: 100 })],
  body: [{ t: "poly", pts: [[-200, -200], [200, 0], [-200, 200]], fill: "body" }],
});
const powerUnit = (name, vcc, gnd, vName = "V+", gName = "V-") => ({
  name,
  pins: [P(vcc, vName, 0, -300, "D", "power_in", { len: 150 }), P(gnd, gName, 0, 300, "U", "power_in", { len: 150 })],
  body: [{ t: "rect", x1: -100, y1: -150, x2: 100, y2: 150, fill: "body" }],
});
def("LM358_DUAL", {
  title: "Dual op-amp (2 units + power)", category: "IC", refPrefix: "U", value: "LM358",
  footprints: ["DIP-8_W7.62mm", "SOIC-8_3.9x4.9mm"], keywords: "opamp dual multi-unit 연산증폭기 유닛",
  pins: [], body: [],
  units: [opampUnit("A", 3, 2, 1), opampUnit("B", 5, 6, 7), powerUnit("C", 8, 4)],
});
const nandUnit = (name, a, b, y) => ({
  name,
  pins: [P(a, "~", -300, -100, "R", "input", { hideName: true, len: 150 }), P(b, "~", -300, 100, "R", "input", { hideName: true, len: 150 }), P(y, "~", 300, 0, "L", "output", { hideName: true, len: 120 })],
  body: [
    { t: "line", pts: [[0, -150], [-150, -150], [-150, 150], [0, 150]] },
    { t: "arc", cx: 0, cy: 0, r: 150, a1: -90, a2: 90 },
    { t: "circle", cx: 165, cy: 0, r: 15 },
  ],
});
def("74HC00", {
  title: "Quad 2-input NAND (4 gates + power)", category: "Logic", refPrefix: "U", value: "74HC00",
  footprints: ["DIP-14_W7.62mm"], keywords: "nand gate logic quad multi-unit 게이트 논리",
  pins: [], body: [],
  units: [nandUnit("A", 1, 2, 3), nandUnit("B", 4, 5, 6), nandUnit("C", 9, 10, 8), nandUnit("D", 12, 13, 11), powerUnit("E", 14, 7, "VCC", "GND")],
});

// ---------------------------------------------------------------- user symbols
// Symbols made with the symbol editor live in the project and are merged here.
const userSymbols = new Map();

export function registerUserSymbols(list) {
  userSymbols.clear();
  for (const sym of list || []) if (sym && sym.name) userSymbols.set(sym.name, sym);
}

export function getSymbol(name) {
  return userSymbols.get(name) || SYMBOLS[name] || null;
}

// ---------------------------------------------------------------- multi-unit symbols
// A symbol may have units: [{ name, body, pins }] next to its common body/pins
// (shared by every unit, e.g. power pins). A placed part shows unit part.unit
// (1-based). partSymbol() returns the merged geometry of that unit.
export function unitCount(sym) {
  return sym && Array.isArray(sym.units) && sym.units.length ? sym.units.length : 1;
}

export function unitLetter(n) {
  return String.fromCharCode(64 + Math.max(1, n | 0));
}

const unitCache = new Map();
export function partSymbol(part) {
  const sym = getSymbol(part.lib);
  if (!sym || !Array.isArray(sym.units) || !sym.units.length) return sym;
  const n = Math.max(1, Math.min(sym.units.length, part.unit | 0 || 1));
  const key = `${sym.name}|${n}|${sym.units.length}`;
  const cached = unitCache.get(key);
  if (cached && cached.src === sym) return cached.sym;
  const u = sym.units[n - 1];
  const merged = { ...sym, body: [...(sym.body || []), ...(u.body || [])], pins: [...(sym.pins || []), ...(u.pins || [])], unitName: u.name || unitLetter(n) };
  unitCache.set(key, { src: sym, sym: merged });
  return merged;
}

// Every pin of every unit (pin numbers are unique across units).
export function allSymbolPins(sym) {
  if (!sym) return [];
  if (!Array.isArray(sym.units) || !sym.units.length) return sym.pins || [];
  return [...(sym.pins || []), ...sym.units.flatMap((u) => u.pins || [])];
}

export function allSymbols() {
  return [...Object.values(SYMBOLS), ...userSymbols.values()];
}

export function symbolCategories() {
  return [...new Set(allSymbols().map((s) => s.category))];
}

export function searchSymbols(query) {
  const q = String(query || "").trim().toLowerCase();
  const list = allSymbols();
  if (!q) return list;
  const words = q.split(/\s+/);
  return list
    .map((s) => {
      const hay = `${s.name} ${s.title} ${s.category} ${s.keywords || ""} ${s.value || ""}`.toLowerCase();
      if (!words.every((w) => hay.includes(w))) return null;
      const score = (s.name.toLowerCase() === q ? 100 : 0) + (s.name.toLowerCase().startsWith(q) ? 50 : 0) + (s.title.toLowerCase().includes(q) ? 10 : 0);
      return { s, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .map((e) => e.s);
}

// Local bounding box of a symbol body + pins (mils).
export function symbolBounds(sym) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  const add = (x, y) => {
    x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y);
  };
  for (const b of sym.body || []) {
    if (b.t === "line" || b.t === "poly") b.pts.forEach(([x, y]) => add(x, y));
    else if (b.t === "rect") { add(b.x1, b.y1); add(b.x2, b.y2); }
    else if (b.t === "circle" || b.t === "arc") { add(b.cx - b.r, b.cy - b.r); add(b.cx + b.r, b.cy + b.r); }
    else if (b.t === "text") add(b.x, b.y);
  }
  for (const p of sym.pins || []) add(p.x, p.y);
  if (!Number.isFinite(x1)) return { x1: -50, y1: -50, x2: 50, y2: 50 };
  return { x1, y1, x2, y2 };
}
