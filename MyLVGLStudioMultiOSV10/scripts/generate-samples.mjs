// Writes samples/: complete project folders, made with the same code the app saves with, plus
// samples/index.json, the list the app shows. LVGL itself is not included in any of them.
// Run `npm run samples` after changing the generator or the project format.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { addNode, addScreen, createNode, newProject } from "../src/lvgl/project.js";
import { projectFiles } from "../src/lvgl/codegen.js";
import { addImage, clearImages, imageFiles } from "../src/lvgl/images.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "samples");

/* ---------------------------------------------------- a tiny PNG, so no dependency */
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buffer) => {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, body) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(body.length);
  const tagged = Buffer.concat([Buffer.from(type, "ascii"), body]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(tagged));
  return Buffer.concat([head, tagged, tail]);
}
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/** Registers a drawn picture with the project. `paint(x, y)` returns [r, g, b, a]. */
function picture(project, name, size, paint) {
  const rgba = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) rgba.set(paint(x, y), (y * size + x) * 4);
  addImage(name, { w: size, h: size, rgba, base64: png(size, size, rgba).toString("base64") });
  project.images.push({ name, file: `assets/images/${name}.png`, w: size, h: size });
}

const disc = (color, phase = 0) => (x, y) => {
  const dx = x - 31.5;
  const dy = y - 31.5;
  const r = Math.hypot(dx, dy);
  const a = Math.atan2(dy, dx) + phase;
  const inside = r < 30;
  const blade = Math.sin(a * 3) > 0.2 && r > 8;
  return inside ? (blade ? color : [255, 255, 255, 255]) : [0, 0, 0, 0];
};

/* ---------------------------------------------------------------- the samples */
const add = (project, parent, type, props) => addNode(project, parent.id, createNode(project, type, props));
const named = (node, name) => {
  node.name = name;
  return node;
};
/** Moving `source` moves `target` with it, each over its own range. */
const drives = (source, target) => source.events.push({ trigger: "VALUE_CHANGED", action: "setValue", target: target.id, text: "" });
/** Moving `source` writes its value into `target`: format is like "%d km/h". */
const writes = (source, target, format) => source.events.push({ trigger: "VALUE_CHANGED", action: "showValue", target: target.id, text: format });

function homeControl() {
  const project = newProject("HomeControl");
  project.device = { w: 480, h: 320 };
  project.theme = { dark: true, primary: "#26a69a", secondary: "#ffa726" };
  const home = project.screens[0];
  home.name = "Home";
  add(project, home, "label", { x: 16, y: 10, text: "Living room", font: 20 });
  const dial = add(project, home, "arc", { x: 16, y: 50, width: 170, height: 170, min: 10, max: 35, value: 22 });
  writes(dial, add(project, home, "label", { x: 72, y: 118, text: "22 C", font: 28 }), "%d C");
  const lights = add(project, home, "container", { x: 200, y: 50, width: 264, height: 170, flexFlow: "COLUMN", gap: 8, pad: 12 });
  add(project, lights, "checkbox", { text: "Ceiling light", checked: true });
  add(project, lights, "checkbox", { text: "Floor lamp" });
  const dimmer = add(project, lights, "slider", { width: "100%", height: 12, min: 0, max: 100, value: 65 });
  add(project, lights, "switch", { width: 56, height: 28, checked: true });
  const detailsButton = add(project, home, "button", { x: 16, y: 240, width: 140, height: 60, text: "Schedule" });
  const status = add(project, home, "label", { x: 180, y: 262, text: "All systems normal" });
  writes(dimmer, status, "Light %d %%");
  const details = addScreen(project);
  details.name = "Schedule";
  add(project, details, "roller", { align: "CENTER", x: -80, options: "06:00\n07:00\n08:00\n09:00", selected: 1 });
  add(project, details, "dropdown", { align: "CENTER", x: 90, y: -40, width: 150, options: "Weekdays\nWeekend\nEvery day" });
  const back = add(project, details, "button", { align: "BOTTOM_MID", y: -14, width: 130, height: 48, text: "Back" });
  detailsButton.events.push({ trigger: "CLICKED", action: "screen", target: details.id });
  back.events.push({ trigger: "CLICKED", action: "setText", target: status.id, text: "Schedule saved" }, { trigger: "CLICKED", action: "screen", target: home.id });
  return project;
}

function loginForm() {
  const project = newProject("LoginForm");
  project.device = { w: 480, h: 320 };
  const screen = project.screens[0];
  screen.name = "Login";
  add(project, screen, "label", { align: "TOP_MID", y: 6, text: "Sign in", font: 20 });
  const user = named(add(project, screen, "textarea", { x: 20, y: 36, width: 215, height: 46, placeholder: "Name" }), "user");
  add(project, screen, "textarea", { x: 245, y: 36, width: 215, height: 46, placeholder: "Password" });
  add(project, screen, "keyboard", { x: 0, y: 126, width: "100%", height: 194, target: user.id });
  add(project, screen, "spinner", { x: 444, y: 4, width: 28, height: 28 });
  const level = add(project, screen, "slider", { x: 20, y: 100, width: 215, height: 12, min: 0, max: 100, value: 30 });
  drives(level, add(project, screen, "bar", { x: 245, y: 100, width: 150, height: 12, min: 0, max: 100, value: 30 }));
  writes(level, add(project, screen, "label", { x: 405, y: 96, text: "30 %" }), "%d %%");
  return project;
}

function dataDashboard() {
  const project = newProject("DataDashboard");
  project.device = { w: 800, h: 480 };
  const screen = project.screens[0];
  screen.name = "Dashboard";
  add(project, screen, "label", { x: 16, y: 10, text: "Production today", font: 24 });
  add(project, screen, "chart", { x: 16, y: 50, width: 480, height: 240, series: "20,35,30,55,70,65,80,75\n10,15,25,20,30,45,40,50" });
  add(project, screen, "chart", { x: 510, y: 50, width: 274, height: 240, chartType: "BAR", series: "40,75,55,90,30" });
  add(project, screen, "table", { x: 16, y: 300, width: 480, height: 134, cells: "Line,Output,State\nA,1204,Running\nB,987,Running\nC,0,Stopped", columnWidth: 150 });
  const output = add(project, screen, "bar", { x: 510, y: 310, width: 274, height: 22, min: 0, max: 100, value: 72 });
  const target = add(project, screen, "slider", { x: 16, y: 450, width: 480, height: 14, min: 0, max: 100, value: 72 });
  drives(target, output);
  const load = add(project, screen, "arc", { x: 590, y: 345, width: 120, height: 120, min: 0, max: 100, value: 40, animate: 5000 });
  writes(load, add(project, screen, "label", { x: 636, y: 396, text: "40 %" }), "%d %%");
  return project;
}

function gridLayout() {
  const project = newProject("GridLayout");
  project.device = { w: 480, h: 320 };
  const screen = project.screens[0];
  screen.name = "Calculator";
  const keys = add(project, screen, "grid", { x: 0, y: 0, width: "100%", height: "100%", pad: 6, gap: 6, gridColumns: "1fr,1fr,1fr,1fr", gridRows: "2fr,1fr,1fr,1fr,1fr,1fr" });
  const display = add(project, keys, "textarea", { text: "0", gridCol: 0, gridRow: 0, gridColSpan: 4 });
  const labels = ["7", "8", "9", "/", "4", "5", "6", "x", "1", "2", "3", "-", "0", ".", "=", "+"];
  labels.forEach((text, index) => {
    const key = add(project, keys, "button", { text, gridCol: index % 4, gridRow: 1 + Math.floor(index / 4) });
    key.events.push({ trigger: "CLICKED", action: "setText", target: display.id, text });
  });
  writes(add(project, keys, "slider", { min: 0, max: 100, value: 0, gridCol: 0, gridRow: 5, gridColSpan: 4 }), display, "%d");
  return project;
}

function imageGallery() {
  const project = newProject("ImageGallery");
  project.device = { w: 480, h: 320 };
  const screen = project.screens[0];
  screen.name = "Gallery";
  const colors = { fan_a: [38, 166, 154, 255], fan_b: [66, 165, 245, 255], fan_c: [255, 167, 38, 255] };
  Object.entries(colors).forEach(([name, color], index) => picture(project, name, 64, disc(color, (index * Math.PI) / 9)));
  add(project, screen, "label", { x: 16, y: 10, text: "Images", font: 20 });
  add(project, screen, "image", { x: 16, y: 50, width: "content", height: "content", src: "fan_a" });
  const fan = add(project, screen, "image", { x: 110, y: 50, width: "content", height: "content", src: "fan_b", rotation: 30 });
  add(project, screen, "image", { x: 220, y: 70, width: "content", height: "content", src: "fan_c", scale: 150 });
  add(project, screen, "imagebutton", { x: 16, y: 150, width: 64, height: 64, src: "fan_b" });
  add(project, screen, "animimage", { x: 110, y: 150, width: 64, height: 64, frames: "fan_a\nfan_b\nfan_c", duration: 900 });
  add(project, screen, "label", { x: 16, y: 230, text: "Animation Image repeats these three pictures." });
  const turn = add(project, screen, "slider", { x: 16, y: 280, width: 300, height: 12, min: 0, max: 359, value: 30 });
  drives(turn, fan);
  writes(turn, add(project, screen, "label", { x: 336, y: 276, text: "30 deg" }), "%d deg");
  return project;
}

function settingsTabs() {
  const project = newProject("SettingsTabs");
  project.device = { w: 480, h: 320 };
  const screen = project.screens[0];
  screen.name = "Settings";
  add(project, screen, "tabview", { x: 0, y: 0, width: "100%", height: 150, tabs: "Network\nDisplay\nSound" });
  add(project, screen, "list", { x: 8, y: 158, width: 220, height: 154, items: "#Network\nWi-Fi\nBluetooth\n#System\nUpdate" });
  const number = add(project, screen, "spinbox", { x: 240, y: 158, width: 130, min: 0, max: 9999, value: 1200, digits: 4, separator: 0 });
  drives(add(project, screen, "slider", { x: 240, y: 204, width: 232, height: 8, min: 0, max: 9999, value: 1200 }), number);
  add(project, screen, "buttonmatrix", { x: 240, y: 220, width: 232, height: 92, map: "Save,Reset\nCancel" });
  add(project, screen, "spinner", { x: 400, y: 158, width: 40, height: 40 });
  return project;
}

/** More menu rows than the display holds: the title stays, the menu scrolls under it. */
function scrollMenu() {
  const project = newProject("ScrollMenu");
  project.device = { w: 480, h: 320 };
  const screen = project.screens[0];
  screen.name = "Menu";
  add(project, screen, "label", { x: 12, y: 10, text: "Menu", font: 20 });
  const status = named(add(project, screen, "label", { x: 240, y: 14, text: "Drag the menu up or down" }), "status");
  const menu = named(add(project, screen, "container", { x: 0, y: 44, width: "100%", height: 276, flexFlow: "COLUMN", gap: 6, pad: 8, scrollable: true }), "menu_list");
  add(project, screen, "spinner", { x: 444, y: 8, width: 28, height: 28 });
  writes(add(project, screen, "slider", { x: 80, y: 18, width: 140, height: 10, min: 0, max: 100, value: 0 }), status, "Level %d %%");
  const rows = ["Network", "Wi-Fi", "Bluetooth", "Display", "Brightness", "Sound", "Volume", "Language", "Date and Time", "Storage", "Security", "Updates", "Backup", "About"];
  for (const text of rows) {
    const row = add(project, menu, "button", { width: "100%", height: 52, text });
    row.events.push({ trigger: "CLICKED", action: "setText", target: status.id, text: `Selected: ${text}` });
  }
  return project;
}

function legacyMeter() {
  const project = newProject("LegacyMeter");
  project.lvgl = "8.4.0";
  project.device = { w: 480, h: 320 };
  const screen = project.screens[0];
  screen.name = "Gauges";
  const gauge = add(project, screen, "meter", { x: 16, y: 34, width: 220, height: 220, min: 0, max: 200, value: 120 });
  const needle = add(project, screen, "slider", { x: 16, y: 280, width: 220, height: 14, min: 0, max: 200, value: 120 });
  drives(needle, gauge);
  writes(needle, add(project, screen, "label", { x: 256, y: 276, text: "120" }), "%d");
  add(project, screen, "colorwheel", { x: 260, y: 60, width: 190, height: 190 });
  add(project, screen, "label", { x: 16, y: 10, text: "Meter and Color Wheel exist only in LVGL 8", font: 16 });
  return project;
}

function modernScale() {
  const project = newProject("ModernScale");
  project.device = { w: 480, h: 320 };
  const screen = project.screens[0];
  screen.name = "Instruments";
  add(project, screen, "label", { x: 16, y: 10, text: "Widgets of LVGL 9", font: 16 });
  add(project, screen, "scale", { x: 16, y: 44, width: 130, height: 130, scaleMode: "ROUND_INNER", totalTicks: 31, majorEvery: 5 });
  add(project, screen, "scale", { x: 240, y: 44, width: 220, height: 60, totalTicks: 21, majorEvery: 5 });
  add(project, screen, "barcode", { x: 240, y: 120, width: 220, height: 60, text: "LVGL-9" });
  add(project, screen, "qrcode", { x: 300, y: 196, qrSize: 110, text: "https://lvgl.io" });
  add(project, screen, "arclabel", { x: 16, y: 180, width: 130, height: 130, text: "Arc Label" });
  add(project, screen, "spinner", { x: 170, y: 200, width: 60, height: 60 });
  const meterBar = add(project, screen, "bar", { x: 160, y: 130, width: 70, height: 14, min: 0, max: 100, value: 50 });
  drives(add(project, screen, "slider", { x: 160, y: 280, width: 130, height: 12, min: 0, max: 100, value: 50 }), meterBar);
  return project;
}

function mediaPlayer() {
  const project = newProject("MediaPlayer");
  project.device = { w: 480, h: 320 };
  project.theme = { dark: true, primary: "#ab47bc", secondary: "#26c6da" };
  const screen = project.screens[0];
  screen.name = "Player";
  picture(project, "cover", 64, (x, y) => [120 + x * 2, 40 + y, 200 - x, 255]);
  add(project, screen, "image", { x: 24, y: 28, width: "content", height: "content", src: "cover", scale: 200 });
  add(project, screen, "label", { x: 170, y: 36, text: "Night Drive", font: 24 });
  add(project, screen, "label", { x: 170, y: 72, text: "The Sample Band" });
  const progress = add(project, screen, "slider", { x: 170, y: 110, width: 230, height: 8, min: 0, max: 100, value: 35, animate: 20000 });
  writes(progress, add(project, screen, "label", { x: 412, y: 104, text: "35 %" }), "%d %%");
  const row = add(project, screen, "container", { x: 150, y: 140, width: 310, height: 70, flexFlow: "ROW", gap: 10, pad: 8, bgOpa: 0, borderWidth: 0 });
  const status = add(project, screen, "label", { x: 24, y: 240, text: "Paused" });
  for (const [text, message] of [["Prev", "Previous"], ["Play", "Playing"], ["Next", "Next"]]) {
    const button = add(project, row, "button", { width: 88, height: 50, text });
    button.events.push({ trigger: "CLICKED", action: "setText", target: status.id, text: message });
  }
  const volume = add(project, screen, "slider", { x: 24, y: 276, width: 432, height: 12, min: 0, max: 100, value: 70, indicatorColor: "#26c6da" });
  writes(volume, add(project, screen, "label", { x: 340, y: 244, text: "Volume 70 %" }), "Volume %d %%");
  return project;
}

function weatherStation() {
  const project = newProject("WeatherStation");
  project.device = { w: 480, h: 320 };
  project.theme = { dark: false, primary: "#29b6f6", secondary: "#ffca28" };
  const screen = project.screens[0];
  screen.name = "Weather";
  screen.props = { bgColor: "#e3f2fd", bgOpa: 255 };
  add(project, screen, "label", { x: 20, y: 14, text: "Seoul", font: 28 });
  const degrees = add(project, screen, "label", { x: 20, y: 56, text: "18 C", font: 48, textColor: "#0277bd" });
  add(project, screen, "label", { x: 20, y: 116, text: "Partly cloudy", font: 16 });
  add(project, screen, "chart", { x: 200, y: 16, width: 264, height: 130, series: "14,15,17,18,18,17,15,14" });
  add(project, screen, "table", { x: 20, y: 160, width: 444, height: 134, cells: "Day,High,Low\nMon,19,11\nTue,21,12\nWed,17,10", columnWidth: 148 });
  writes(add(project, screen, "slider", { x: 20, y: 302, width: 444, height: 10, min: -10, max: 40, value: 18 }), degrees, "%d C");
  return project;
}

function carDashboard() {
  const project = newProject("CarDashboard");
  project.device = { w: 800, h: 480 };
  project.theme = { dark: true, primary: "#ef5350", secondary: "#66bb6a" };
  const screen = project.screens[0];
  screen.name = "Cluster";
  screen.props = { bgColor: "#101418", bgOpa: 255 };
  const speedo = add(project, screen, "arc", { x: 40, y: 50, width: 300, height: 300, min: 0, max: 240, value: 96 });
  const speedText = add(project, screen, "label", { x: 146, y: 166, text: "96", font: 48, textColor: "#ffffff" });
  add(project, screen, "label", { x: 156, y: 224, text: "km/h", font: 16, textColor: "#ffffff" });
  const rev = add(project, screen, "arc", { x: 460, y: 50, width: 300, height: 300, min: 0, max: 8000, value: 3000 });
  const revText = add(project, screen, "label", { x: 566, y: 166, text: "3000", font: 48, textColor: "#ffffff" });
  add(project, screen, "label", { x: 590, y: 224, text: "rpm", font: 16, textColor: "#ffffff" });
  add(project, screen, "bar", { x: 300, y: 450, width: 200, height: 18, min: 0, max: 100, value: 62, indicatorColor: "#66bb6a", animate: 15000 });
  const warning = add(project, screen, "led", { x: 372, y: 20, width: 24, height: 24, ledBright: 96 });
  const rpmLight = add(project, screen, "led", { x: 408, y: 20, width: 24, height: 24, ledBright: 96 });
  // Drag these two: the gauges and the numbers follow.
  add(project, screen, "label", { x: 40, y: 364, text: "Drag: speed", textColor: "#ffffff" });
  const speedDrag = add(project, screen, "slider", { x: 40, y: 390, width: 300, height: 16, min: 0, max: 240, value: 96 });
  drives(speedDrag, speedo);
  writes(speedDrag, speedText, "%d");
  drives(speedDrag, warning);
  add(project, screen, "label", { x: 460, y: 364, text: "Drag: engine", textColor: "#ffffff" });
  const revDrag = add(project, screen, "slider", { x: 460, y: 390, width: 300, height: 16, min: 0, max: 8000, value: 3000 });
  drives(revDrag, rev);
  writes(revDrag, revText, "%d");
  drives(revDrag, rpmLight);
  return project;
}

function factoryPanel() {
  const project = newProject("FactoryPanel");
  project.device = { w: 800, h: 480 };
  const screen = project.screens[0];
  screen.name = "Panel";
  const panel = add(project, screen, "grid", { x: 0, y: 0, width: "100%", height: "100%", pad: 10, gap: 10, gridColumns: "1fr,1fr,1fr", gridRows: "1fr,1fr" });
  for (const [name, value, animate] of [["Pump", 72, 2000], ["Valve", 40, 3500], ["Motor", 88, 1400]]) {
    const card = add(project, panel, "container", { flexFlow: "COLUMN", gap: 8, pad: 10 });
    add(project, card, "label", { text: name, font: 18 });
    const level = add(project, card, "bar", { width: "100%", height: 16, min: 0, max: 100, value, ...(name === "Motor" ? { animate } : {}) });
    if (name !== "Motor") drives(add(project, card, "slider", { width: "100%", height: 12, min: 0, max: 100, value }), level);
    add(project, card, "switch", { width: 56, height: 28, checked: value > 50 });
  }
  const log = add(project, panel, "list", { gridCol: 0, gridRow: 1, gridColSpan: 2, items: "#Events\nPump started\nValve at 40 %\nMotor warm" });
  log.name = "events";
  const stop = add(project, panel, "button", { gridCol: 2, gridRow: 1, text: "Stop all", bgColor: "#d32f2f", font: 20 });
  stop.events.push({ trigger: "CLICKED", action: "log", text: "Stop all pressed" });
  return project;
}

function calendarPlanner() {
  const project = newProject("CalendarPlanner");
  project.device = { w: 800, h: 480 };
  const screen = project.screens[0];
  screen.name = "Planner";
  add(project, screen, "calendar", { x: 16, y: 16, width: 460, height: 448, year: 2026, month: 11, day: 4 });
  const today = add(project, screen, "label", { x: 496, y: 18, text: "Today", font: 24 });
  add(project, screen, "list", { x: 496, y: 60, width: 288, height: 280, items: "#Morning\nTeam meeting\nDesign review\n#Afternoon\nFirmware test" });
  add(project, screen, "button", { x: 496, y: 356, width: 288, height: 56, text: "Add event" }).events.push({ trigger: "CLICKED", action: "setText", target: today.id, text: "Event added" });
  add(project, screen, "spinner", { x: 736, y: 8, width: 44, height: 44 });
  writes(add(project, screen, "slider", { x: 496, y: 436, width: 288, height: 14, min: 0, max: 12, value: 3 }), today, "%d events");
  return project;
}

function smartWatch() {
  const project = newProject("SmartWatch");
  project.device = { w: 240, h: 240, shape: "round" };
  project.theme = { dark: true, primary: "#66bb6a", secondary: "#ff7043" };
  const screen = project.screens[0];
  screen.name = "Face";
  screen.props = { bgColor: "#000000", bgOpa: 255 };
  const ring = add(project, screen, "arc", { align: "CENTER", width: 220, height: 220, min: 0, max: 100, value: 68 });
  add(project, screen, "label", { align: "CENTER", y: -14, text: "10:24", font: 36, textColor: "#ffffff" });
  writes(ring, add(project, screen, "label", { align: "CENTER", y: 26, text: "68 % of goal", textColor: "#a5d6a7" }), "%d %% of goal");
  add(project, screen, "led", { align: "BOTTOM_MID", y: -34, width: 12, height: 12, ledBright: 255 });
  return project;
}

/** A round display: the slider in the middle drives the ring around it. */
function roundGauge() {
  const project = newProject("RoundGauge");
  project.device = { w: 360, h: 360, shape: "round" };
  project.theme = { dark: true, primary: "#29b6f6", secondary: "#ffa726" };
  const screen = project.screens[0];
  screen.name = "Gauge";
  screen.props = { bgColor: "#0b1220", bgOpa: 255 };
  const ring = add(project, screen, "arc", { align: "CENTER", width: 330, height: 330, min: 0, max: 100, value: 40 });
  const inner = add(project, screen, "arc", { align: "CENTER", width: 240, height: 240, min: 0, max: 100, value: 40, animate: 4000, indicatorColor: "#ffa726" });
  const number = add(project, screen, "label", { align: "CENTER", y: -30, text: "40", font: 48, textColor: "#ffffff" });
  add(project, screen, "label", { align: "CENTER", y: 14, text: "Drag the slider", textColor: "#90caf9" });
  const pulse = add(project, screen, "label", { align: "CENTER", y: 88, text: "40 %", textColor: "#ffcc80" });
  writes(inner, pulse, "%d %%");
  const slider = add(project, screen, "slider", { align: "CENTER", y: 50, width: 150, height: 12, min: 0, max: 100, value: 40 });
  drives(slider, ring);
  writes(slider, number, "%d");
  return project;
}

/** Turn the ring to set the temperature; the heating light and the room follow. */
function thermostat() {
  const project = newProject("Thermostat");
  project.device = { w: 360, h: 360, shape: "round" };
  project.theme = { dark: true, primary: "#ff7043", secondary: "#42a5f5" };
  const screen = project.screens[0];
  screen.name = "Heating";
  screen.props = { bgColor: "#16181d", bgOpa: 255 };
  const ring = add(project, screen, "arc", { align: "CENTER", width: 320, height: 320, min: 10, max: 30, value: 21 });
  const number = add(project, screen, "label", { align: "CENTER", y: -30, text: "21 C", font: 48, textColor: "#ffffff" });
  add(project, screen, "label", { align: "CENTER", y: 14, text: "Turn the ring", textColor: "#ffccbc" });
  const heat = add(project, screen, "led", { align: "CENTER", y: 46, width: 22, height: 22, ledBright: 140 });
  add(project, screen, "bar", { align: "CENTER", y: 82, width: 140, height: 8, min: 0, max: 100, value: 45, animate: 7000 });
  writes(ring, number, "%d C");
  drives(ring, heat);
  return project;
}

/** Four channels: each fader moves its level meter and its number. */
function audioMixer() {
  const project = newProject("AudioMixer");
  project.device = { w: 800, h: 480 };
  project.theme = { dark: true, primary: "#7e57c2", secondary: "#26a69a" };
  const screen = project.screens[0];
  screen.name = "Mixer";
  screen.props = { bgColor: "#14131a", bgOpa: 255 };
  add(project, screen, "label", { x: 24, y: 14, text: "Drag the faders", font: 20, textColor: "#ffffff" });
  ["Vocal", "Guitar", "Bass", "Drums", "Keys", "Master"].forEach((name, index) => {
    const x = 34 + index * 126;
    const start = 30 + index * 11;
    add(project, screen, "label", { x, y: 56, text: name, textColor: "#d1c4e9" });
    const fader = add(project, screen, "slider", { x: x + 6, y: 92, width: 26, height: 310, min: 0, max: 100, value: start });
    drives(fader, add(project, screen, "bar", { x: x + 56, y: 92, width: 14, height: 310, min: 0, max: 100, value: start }));
    writes(fader, add(project, screen, "label", { x, y: 420, text: String(start), font: 20, textColor: "#ffffff" }), "%d");
  });
  return project;
}

/** Drag the charge level: the bar, the number, the ring and the warning light all follow. */
function batteryMonitor() {
  const project = newProject("BatteryMonitor");
  project.device = { w: 480, h: 320 };
  project.theme = { dark: false, primary: "#43a047", secondary: "#e53935" };
  const screen = project.screens[0];
  screen.name = "Battery";
  add(project, screen, "label", { x: 20, y: 14, text: "Battery", font: 24 });
  const percent = add(project, screen, "label", { x: 300, y: 12, text: "64 %", font: 28 });
  const level = add(project, screen, "bar", { x: 20, y: 60, width: 440, height: 40, min: 0, max: 100, value: 64 });
  const ring = add(project, screen, "arc", { x: 20, y: 116, width: 130, height: 130, min: 0, max: 100, value: 64 });
  const light = add(project, screen, "led", { x: 186, y: 130, width: 36, height: 36, ledBright: 163 });
  add(project, screen, "bar", { x: 250, y: 140, width: 210, height: 14, min: 0, max: 100, value: 20, animate: 2200, indicatorColor: "#ffb300" });
  add(project, screen, "label", { x: 250, y: 116, text: "Charging" });
  const drag = add(project, screen, "slider", { x: 20, y: 276, width: 440, height: 18, min: 0, max: 100, value: 64 });
  drives(drag, level);
  drives(drag, ring);
  drives(drag, light);
  writes(drag, percent, "%d %%");
  return project;
}

/** Three rooms: a dimmer for each lamp. */
function lightDimmer() {
  const project = newProject("LightDimmer");
  project.device = { w: 480, h: 320 };
  project.theme = { dark: true, primary: "#ffb300", secondary: "#42a5f5" };
  const screen = project.screens[0];
  screen.name = "Lights";
  screen.props = { bgColor: "#101014", bgOpa: 255 };
  [["Kitchen", 200], ["Living room", 90], ["Bedroom", 30]].forEach(([name, value], index) => {
    const y = 16 + index * 100;
    add(project, screen, "label", { x: 96, y, text: name, font: 16, textColor: "#ffe082" });
    const lamp = add(project, screen, "led", { x: 24, y: y + 8, width: 52, height: 52, ledBright: value });
    const dimmer = add(project, screen, "slider", { x: 96, y: y + 38, width: 300, height: 16, min: 0, max: 255, value });
    drives(dimmer, lamp);
    writes(dimmer, add(project, screen, "label", { x: 412, y: y + 34, text: String(value), textColor: "#ffffff" }), "%d");
  });
  return project;
}

/** Three rings on a round watch: drag any of them. */
function fitnessRings() {
  const project = newProject("FitnessRings");
  project.device = { w: 466, h: 466, shape: "round" };
  project.theme = { dark: true, primary: "#ec407a", secondary: "#66bb6a" };
  const screen = project.screens[0];
  screen.name = "Activity";
  screen.props = { bgColor: "#000000", bgOpa: 255 };
  const rings = [[420, 70, "Move"], [320, 50, "Exercise"], [220, 30, "Stand"]].map(([size, value]) => add(project, screen, "arc", { align: "CENTER", width: size, height: size, min: 0, max: 100, value }));
  const move = add(project, screen, "label", { align: "CENTER", y: -26, text: "Move 70", textColor: "#ffffff" });
  const exercise = add(project, screen, "label", { align: "CENTER", y: 0, text: "Exercise 50", textColor: "#ffffff" });
  const stand = add(project, screen, "label", { align: "CENTER", y: 26, text: "Stand 30", textColor: "#ffffff" });
  writes(rings[0], move, "Move %d");
  writes(rings[1], exercise, "Exercise %d");
  writes(rings[2], stand, "Stand %d");
  return project;
}

/** Roll the program; drag the time; the drum goes round by itself. */
function washingMachine() {
  const project = newProject("WashingMachine");
  project.device = { w: 480, h: 320 };
  project.theme = { dark: false, primary: "#0288d1", secondary: "#ff7043" };
  const screen = project.screens[0];
  screen.name = "Program";
  const program = add(project, screen, "roller", { x: 16, y: 16, width: 150, options: "Cotton\nSynthetics\nWool\nQuick\nDelicate\nSpin", selected: 1 });
  const chosen = add(project, screen, "label", { x: 190, y: 16, text: "Program 1", font: 16 });
  writes(program, chosen, "Program %d");
  add(project, screen, "arc", { x: 330, y: 16, width: 130, height: 130, min: 0, max: 100, value: 0, animate: 2500 });
  add(project, screen, "label", { x: 190, y: 56, text: "Time", font: 16 });
  const minutes = add(project, screen, "label", { x: 190, y: 90, text: "45 min", font: 28 });
  const time = add(project, screen, "slider", { x: 16, y: 240, width: 448, height: 18, min: 10, max: 120, value: 45 });
  writes(time, minutes, "%d min");
  drives(time, add(project, screen, "bar", { x: 16, y: 200, width: 448, height: 12, min: 0, max: 100, value: 32 }));
  return project;
}

/** Drag the ring and the needle's picture turns. */
function compassDial() {
  const project = newProject("CompassDial");
  project.device = { w: 360, h: 360, shape: "round" };
  project.theme = { dark: true, primary: "#26c6da", secondary: "#ef5350" };
  const screen = project.screens[0];
  screen.name = "Compass";
  screen.props = { bgColor: "#0d1b2a", bgOpa: 255 };
  picture(project, "needle", 64, (x, y) => {
    const half = 8 - Math.abs(y - 32) / 4;
    const inside = Math.abs(x - 31.5) < half;
    return inside ? (y < 32 ? [239, 83, 80, 255] : [236, 239, 241, 255]) : [0, 0, 0, 0];
  });
  const ring = add(project, screen, "arc", { align: "CENTER", width: 320, height: 320, min: 0, max: 359, value: 45 });
  const needle = add(project, screen, "image", { align: "CENTER", y: -20, width: "content", height: "content", src: "needle", scale: 250, rotation: 45 });
  const heading = add(project, screen, "label", { align: "CENTER", y: 70, text: "45 deg", font: 24, textColor: "#ffffff" });
  add(project, screen, "label", { align: "CENTER", y: 104, text: "Drag the ring", textColor: "#80deea" });
  drives(ring, needle);
  writes(ring, heading, "%d deg");
  return project;
}

/** Switches light the lamps; the sliders set the climate. */
function greenhouse() {
  const project = newProject("Greenhouse");
  project.device = { w: 800, h: 480 };
  project.theme = { dark: false, primary: "#2e7d32", secondary: "#f9a825" };
  const screen = project.screens[0];
  screen.name = "Climate";
  screen.props = { bgColor: "#f1f8e9", bgOpa: 255 };
  add(project, screen, "label", { x: 24, y: 16, text: "Greenhouse", font: 28 });
  [["Temperature", 24, "%d C", 0, 45], ["Humidity", 60, "%d %%", 0, 100], ["Light", 75, "%d %%", 0, 100]].forEach(([name, value, format, min, max], index) => {
    const x = 24 + index * 256;
    add(project, screen, "label", { x, y: 70, text: name, font: 16 });
    const dial = add(project, screen, "arc", { x, y: 100, width: 200, height: 200, min, max, value });
    writes(dial, add(project, screen, "label", { x: x + 72, y: 188, text: format.replace("%d", String(value)).replace("%%", "%"), font: 20 }), format);
    const drag = add(project, screen, "slider", { x, y: 316, width: 200, height: 14, min, max, value });
    drives(drag, dial);
  });
  ["Pump", "Fan", "Heater"].forEach((name, index) => {
    const x = 24 + index * 256;
    add(project, screen, "label", { x, y: 356, text: name, font: 16 });
    const lamp = add(project, screen, "led", { x: x + 80, y: 386, width: 36, height: 36, ledBright: 0 });
    drives(add(project, screen, "switch", { x, y: 390, width: 60, height: 30 }), lamp);
  });
  return project;
}

/** Everything here moves by itself; the slider at the bottom can also be dragged. */
function loadingGallery() {
  const project = newProject("LoadingGallery");
  project.device = { w: 800, h: 480 };
  project.theme = { dark: true, primary: "#29b6f6", secondary: "#ab47bc" };
  const screen = project.screens[0];
  screen.name = "Loading";
  screen.props = { bgColor: "#0f1420", bgOpa: 255 };
  add(project, screen, "label", { x: 24, y: 16, text: "Things that move by themselves", font: 20, textColor: "#ffffff" });
  [900, 1500, 2400, 3600].forEach((animate, index) => {
    const x = 24 + index * 192;
    const ring = add(project, screen, "arc", { x, y: 60, width: 160, height: 160, min: 0, max: 100, value: 0, animate });
    writes(ring, add(project, screen, "label", { x: x + 62, y: 130, text: "0 %", textColor: "#ffffff" }), "%d %%");
    add(project, screen, "bar", { x, y: 240, width: 160, height: 14, min: 0, max: 100, value: 0, animate: animate + 400 });
    add(project, screen, "spinner", { x: x + 50, y: 272, width: 60, height: 60 });
  });
  const drag = add(project, screen, "slider", { x: 24, y: 400, width: 590, height: 18, min: 0, max: 100, value: 50 });
  drives(drag, add(project, screen, "bar", { x: 24, y: 360, width: 590, height: 18, min: 0, max: 100, value: 50 }));
  writes(drag, add(project, screen, "label", { x: 640, y: 390, text: "50 %", font: 28, textColor: "#ffffff" }), "%d %%");
  return project;
}

/** Drag the car between floors; the buttons call it and the doors open and close. */
function elevatorPanel() {
  const project = newProject("ElevatorPanel");
  project.device = { w: 480, h: 480 };
  project.theme = { dark: true, primary: "#ffa000", secondary: "#42a5f5" };
  const screen = project.screens[0];
  screen.name = "Lift";
  screen.props = { bgColor: "#1b1d22", bgOpa: 255 };
  const floor = add(project, screen, "label", { x: 196, y: 20, text: "3", font: 48, textColor: "#ffc107" });
  add(project, screen, "label", { x: 196, y: 84, text: "Floor" , textColor: "#ffffff" });
  const shaft = add(project, screen, "slider", { x: 40, y: 24, width: 30, height: 430, min: 1, max: 12, value: 3 });
  writes(shaft, floor, "%d");
  drives(shaft, add(project, screen, "bar", { x: 96, y: 24, width: 14, height: 430, min: 0, max: 100, value: 18 }));
  const status = add(project, screen, "label", { x: 196, y: 116, text: "Doors closed", textColor: "#90caf9" });
  const panel = add(project, screen, "grid", { x: 150, y: 150, width: 300, height: 300, pad: 6, gap: 6, gridColumns: "1fr,1fr,1fr", gridRows: "1fr,1fr,1fr,1fr" });
  for (let n = 1; n <= 9; n++) add(project, panel, "button", { text: String(n) }).events.push({ trigger: "CLICKED", action: "setText", target: floor.id, text: String(n) });
  add(project, panel, "button", { text: "Open" }).events.push({ trigger: "CLICKED", action: "setText", target: status.id, text: "Doors open" });
  add(project, panel, "button", { text: "Close" }).events.push({ trigger: "CLICKED", action: "setText", target: status.id, text: "Doors closed" });
  add(project, panel, "button", { text: "Bell", bgColor: "#d32f2f" }).events.push({ trigger: "CLICKED", action: "setText", target: status.id, text: "Alarm sent" });
  return project;
}

function appWindows() {
  const project = newProject("AppWindows");
  project.device = { w: 800, h: 480 };
  const screen = project.screens[0];
  screen.name = "Desktop";
  add(project, screen, "win", { x: 16, y: 16, width: 370, height: 220, title: "Status", text: "All services are running." });
  add(project, screen, "menu", { x: 400, y: 16, width: 384, height: 220, menuItems: "Network\nDisplay\nSound\nAbout" });
  add(project, screen, "tileview", { x: 16, y: 250, width: 370, height: 214, tiles: "Swipe me\nSecond tile\nThird tile" });
  add(project, screen, "msgbox", { x: 410, y: 270, width: 360, title: "Update", text: "A new version is ready.", buttons: "Install,Later" });
  const done = add(project, screen, "bar", { x: 400, y: 238, width: 384, height: 10, min: 0, max: 100, value: 30 });
  drives(add(project, screen, "slider", { x: 400, y: 254, width: 384, height: 10, min: 0, max: 100, value: 30 }), done);
  return project;
}

function typography() {
  const project = newProject("Typography");
  project.device = { w: 480, h: 320 };
  const screen = project.screens[0];
  screen.name = "Text";
  add(project, screen, "span", { x: 16, y: 12, width: 448, height: 50, spans: "Spangroup puts \ndifferent spans \nin one paragraph." });
  add(project, screen, "canvas", { x: 16, y: 70, canvasW: 140, canvasH: 90, canvasColor: "#ffe082" });
  add(project, screen, "line", { x: 176, y: 70, points: "0,80 70,10 140,70 280,0", lineColor: "#e53935", lineWidth: 4 });
  add(project, screen, "spinner", { x: 410, y: 110, width: 50, height: 50 });
  const fonts = add(project, screen, "container", { x: 16, y: 172, width: 448, height: 136, flexFlow: "COLUMN", gap: 2, pad: 8 });
  const sized = [14, 18, 24].map((font) => add(project, fonts, "label", { font, text: `Montserrat ${font}` }));
  const dial = add(project, screen, "slider", { x: 176, y: 150, width: 220, height: 12, min: 0, max: 100, value: 40 });
  sized.forEach((label, index) => writes(dial, label, `Size ${[14, 18, 24][index]}: %d`));
  return project;
}

export const SAMPLES = [
  { id: "HomeControl", icon: "home", build: homeControl, ko: ["스마트 홈 제어", "Arc, 슬라이더, 스위치와 화면 전환 이벤트"], en: ["Smart Home Control", "Arc, slider, switch, and screen change events"] },
  { id: "LoginForm", icon: "lock", build: loginForm, ko: ["로그인 입력", "Text Area와 연결된 Keyboard"], en: ["Login Form", "Text Areas with a linked Keyboard"] },
  { id: "DataDashboard", icon: "chart", build: dataDashboard, ko: ["데이터 대시보드", "Chart, Table, Bar, Arc (800×480)"], en: ["Data Dashboard", "Chart, Table, Bar, Arc (800×480)"] },
  { id: "GridLayout", icon: "gridIcon", build: gridLayout, ko: ["Grid 레이아웃", "Grid로 만든 계산기 자판"], en: ["Grid Layout", "A calculator keypad made with Grid"] },
  { id: "ImageGallery", icon: "image", build: imageGallery, ko: ["이미지 갤러리", "Image, Image Button, Animation Image"], en: ["Image Gallery", "Image, Image Button, Animation Image"] },
  { id: "SettingsTabs", icon: "tabview", build: settingsTabs, ko: ["설정 화면", "Tabview, List, Spinbox, Button Matrix"], en: ["Settings Screen", "Tabview, List, Spinbox, Button Matrix"] },
  { id: "ScrollMenu", icon: "list", build: scrollMenu, ko: ["수직 스크롤 메뉴", "화면 아래로 이어지는 메뉴를 끌어서 스크롤"], en: ["Vertical Scroll Menu", "A menu that goes on below the display; drag to scroll"] },
  { id: "MediaPlayer", icon: "music", build: mediaPlayer, ko: ["음악 플레이어", "표지 이미지, 슬라이더, 재생 버튼 이벤트"], en: ["Music Player", "Cover image, slider, and play button events"] },
  { id: "WeatherStation", icon: "sun", build: weatherStation, ko: ["날씨 스테이션", "큰 글꼴, 선 Chart, 예보 Table"], en: ["Weather Station", "Large fonts, line Chart, forecast Table"] },
  { id: "CarDashboard", icon: "car", build: carDashboard, ko: ["자동차 계기판", "아래 슬라이더를 끌면 속도계와 숫자가 함께 움직임 (800×480)"], en: ["Car Dashboard", "Drag the sliders below: the gauges and numbers follow (800×480)"] },
  { id: "FactoryPanel", icon: "factory", build: factoryPanel, ko: ["공장 제어 패널", "Grid 안의 카드, 상태 Bar, 정지 버튼"], en: ["Factory Panel", "Cards in a Grid, status bars, stop button"] },
  { id: "CalendarPlanner", icon: "calendar", build: calendarPlanner, ko: ["일정 플래너", "Calendar와 일정 List"], en: ["Calendar Planner", "Calendar with an agenda List"] },
  { id: "SmartWatch", icon: "watch", build: smartWatch, ko: ["스마트워치", "원형 화면(240×240)의 시계, 링을 끌면 숫자가 바뀜"], en: ["Smart Watch", "A watch face on a round display (240×240): drag the ring"] },
  { id: "RoundGauge", icon: "arc", build: roundGauge, ko: ["원형 계기판", "원형 화면(360×360), 슬라이더로 움직이는 링"], en: ["Round Gauge", "A round display (360×360) with a ring moved by a slider"] },
  { id: "Thermostat", icon: "colorwheel", build: thermostat, ko: ["온도 조절기", "원형 화면(360×360), 링을 돌리면 온도와 표시등이 바뀜"], en: ["Thermostat", "A round display (360×360): turn the ring, the number and the light follow"] },
  { id: "FitnessRings", icon: "spinner", build: fitnessRings, ko: ["운동 링", "원형 화면(466×466), 세 링을 각각 끌기"], en: ["Fitness Rings", "A round display (466×466): drag each of the three rings"] },
  { id: "CompassDial", icon: "imagebutton", build: compassDial, ko: ["나침반", "원형 화면(360×360), 링을 끌면 바늘 그림이 회전"], en: ["Compass", "A round display (360×360): drag the ring, the needle's picture turns"] },
  { id: "AudioMixer", icon: "slider", build: audioMixer, ko: ["오디오 믹서", "세로 페이더 6개, 끌면 레벨과 숫자가 움직임 (800×480)"], en: ["Audio Mixer", "Six vertical faders: drag them, levels and numbers follow (800×480)"] },
  { id: "BatteryMonitor", icon: "bar", build: batteryMonitor, ko: ["배터리 모니터", "하나를 끌면 Bar, Arc, LED, 숫자가 함께 움직임"], en: ["Battery Monitor", "Drag one slider: bar, arc, LED and number move together"] },
  { id: "LightDimmer", icon: "led", build: lightDimmer, ko: ["조명 조절", "슬라이더로 LED 밝기 조절"], en: ["Light Dimmer", "Sliders that set the brightness of LEDs"] },
  { id: "WashingMachine", icon: "roller", build: washingMachine, ko: ["세탁기", "Roller로 코스 선택, 시간 끌기, 저절로 도는 드럼"], en: ["Washing Machine", "Roll the program, drag the time, the drum turns by itself"] },
  { id: "Greenhouse", icon: "switch", build: greenhouse, ko: ["온실 제어", "Arc와 슬라이더 연동, 스위치로 LED 켜기 (800×480)"], en: ["Greenhouse", "Arcs and sliders move together, switches light LEDs (800×480)"] },
  { id: "LoadingGallery", icon: "animimage", build: loadingGallery, ko: ["애니메이션 모음", "저절로 움직이는 Arc, Bar, Spinner (800×480)"], en: ["Animation Gallery", "Arcs, bars and spinners that move by themselves (800×480)"] },
  { id: "ElevatorPanel", icon: "spinbox", build: elevatorPanel, ko: ["엘리베이터 패널", "세로 슬라이더로 층 이동, Grid 버튼으로 호출"], en: ["Elevator Panel", "Drag the car between floors, call it with the Grid buttons"] },
  { id: "AppWindows", icon: "win", build: appWindows, ko: ["창과 메뉴", "Window, Menu, Tile View, Message Box"], en: ["Windows and Menus", "Window, Menu, Tile View, Message Box"] },
  { id: "Typography", icon: "span", build: typography, ko: ["글자와 그림", "Spangroup, Canvas, Line, 글꼴 크기"], en: ["Text and Drawing", "Spangroup, Canvas, Line, font sizes"] },
  { id: "ModernScale", icon: "scale", build: modernScale, ko: ["LVGL 9 계기판", "Scale, Barcode, QR Code, Arc Label"], en: ["LVGL 9 Instruments", "Scale, Barcode, QR Code, Arc Label"] },
  { id: "LegacyMeter", icon: "meter", build: legacyMeter, ko: ["LVGL 8 계기판", "Meter, Color Wheel (LVGL 8.4)"], en: ["LVGL 8 Gauges", "Meter, Color Wheel (LVGL 8.4)"] },
];

function main() {
  fs.rmSync(out, { recursive: true, force: true });
  const index = [];
  for (const sample of SAMPLES) {
    clearImages();
    const project = sample.build();
    const folder = path.join(out, sample.id);
    for (const [name, text] of Object.entries(projectFiles(project, sample.id))) {
      const file = path.join(folder, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, text);
    }
    for (const [name, base64] of Object.entries(imageFiles(project))) {
      const file = path.join(folder, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from(base64, "base64"));
    }
    index.push({ id: sample.id, icon: sample.icon, file: `${sample.id}/${sample.id}.mylvgl`, lvgl: project.lvgl, device: project.device, ko: sample.ko, en: sample.en });
    console.log(`sample  ${sample.id}  LVGL ${project.lvgl}`);
  }
  fs.writeFileSync(path.join(out, "index.json"), `${JSON.stringify(index, null, 2)}\n`);
  fs.writeFileSync(path.join(out, "README.md"), `# Samples

My LVGL Studio의 샘플 프로젝트입니다. \`npm run samples\`로 생성합니다.

| 폴더 | 내용 | LVGL |
|---|---|---|
${index.map((item) => `| \`${item.id}\` | ${item.ko[0]}: ${item.ko[1]} | ${item.lvgl} |`).join("\n")}

LVGL 소스는 들어 있지 않습니다. 설계와 실행 화면은 앱에 내장된 엔진으로 동작하고, 네이티브 실행이 필요할 때만 해당 버전을 내려받습니다.
`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
