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

function homeControl() {
  const project = newProject("HomeControl");
  project.device = { w: 480, h: 320 };
  project.theme = { dark: true, primary: "#26a69a", secondary: "#ffa726" };
  const home = project.screens[0];
  home.name = "Home";
  add(project, home, "label", { x: 16, y: 10, text: "Living room", font: 20 });
  add(project, home, "arc", { x: 16, y: 50, width: 170, height: 170, min: 10, max: 35, value: 22 });
  add(project, home, "label", { x: 72, y: 118, text: "22 C", font: 28 });
  const lights = add(project, home, "container", { x: 200, y: 50, width: 264, height: 170, flexFlow: "COLUMN", gap: 8, pad: 12 });
  add(project, lights, "checkbox", { text: "Ceiling light", checked: true });
  add(project, lights, "checkbox", { text: "Floor lamp" });
  add(project, lights, "slider", { width: "100%", height: 12, min: 0, max: 100, value: 65 });
  add(project, lights, "switch", { width: 56, height: 28, checked: true });
  const detailsButton = add(project, home, "button", { x: 16, y: 240, width: 140, height: 60, text: "Schedule" });
  const status = add(project, home, "label", { x: 180, y: 262, text: "All systems normal" });
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
  add(project, screen, "keyboard", { x: 0, y: 92, width: "100%", height: 228, target: user.id });
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
  add(project, screen, "table", { x: 16, y: 300, width: 480, height: 170, cells: "Line,Output,State\nA,1204,Running\nB,987,Running\nC,0,Stopped", columnWidth: 150 });
  add(project, screen, "bar", { x: 510, y: 310, width: 274, height: 22, value: 72 });
  add(project, screen, "arc", { x: 590, y: 345, width: 120, height: 120, value: 40 });
  return project;
}

function gridLayout() {
  const project = newProject("GridLayout");
  project.device = { w: 480, h: 320 };
  const screen = project.screens[0];
  screen.name = "Calculator";
  const keys = add(project, screen, "grid", { x: 0, y: 0, width: "100%", height: "100%", pad: 6, gap: 6, gridColumns: "1fr,1fr,1fr,1fr", gridRows: "2fr,1fr,1fr,1fr,1fr" });
  add(project, keys, "textarea", { text: "0", gridCol: 0, gridRow: 0, gridColSpan: 4 });
  const labels = ["7", "8", "9", "/", "4", "5", "6", "x", "1", "2", "3", "-", "0", ".", "=", "+"];
  labels.forEach((text, index) => add(project, keys, "button", { text, gridCol: index % 4, gridRow: 1 + Math.floor(index / 4) }));
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
  add(project, screen, "image", { x: 110, y: 50, width: "content", height: "content", src: "fan_b", rotation: 30 });
  add(project, screen, "image", { x: 220, y: 70, width: "content", height: "content", src: "fan_c", scale: 150 });
  add(project, screen, "imagebutton", { x: 16, y: 150, width: 64, height: 64, src: "fan_b" });
  add(project, screen, "animimage", { x: 110, y: 150, width: 64, height: 64, frames: "fan_a\nfan_b\nfan_c", duration: 900 });
  add(project, screen, "label", { x: 16, y: 230, text: "Animation Image repeats these three pictures." });
  return project;
}

function settingsTabs() {
  const project = newProject("SettingsTabs");
  project.device = { w: 480, h: 320 };
  const screen = project.screens[0];
  screen.name = "Settings";
  add(project, screen, "tabview", { x: 0, y: 0, width: "100%", height: 150, tabs: "Network\nDisplay\nSound" });
  add(project, screen, "list", { x: 8, y: 158, width: 220, height: 154, items: "#Network\nWi-Fi\nBluetooth\n#System\nUpdate" });
  add(project, screen, "spinbox", { x: 240, y: 158, width: 130, min: 0, max: 9999, value: 1200, digits: 4, separator: 0 });
  add(project, screen, "buttonmatrix", { x: 240, y: 214, width: 232, height: 98, map: "Save,Reset\nCancel" });
  return project;
}

function legacyMeter() {
  const project = newProject("LegacyMeter");
  project.lvgl = "8.4.0";
  project.device = { w: 480, h: 320 };
  const screen = project.screens[0];
  screen.name = "Gauges";
  add(project, screen, "meter", { x: 16, y: 40, width: 220, height: 220, min: 0, max: 200, value: 120 });
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
  add(project, screen, "scale", { x: 16, y: 44, width: 200, height: 200, scaleMode: "ROUND_INNER", totalTicks: 31, majorEvery: 5 });
  add(project, screen, "scale", { x: 240, y: 44, width: 220, height: 60, totalTicks: 21, majorEvery: 5 });
  add(project, screen, "barcode", { x: 240, y: 120, width: 220, height: 60, text: "LVGL-9" });
  add(project, screen, "qrcode", { x: 300, y: 196, qrSize: 110, text: "https://lvgl.io" });
  add(project, screen, "arclabel", { x: 16, y: 180, width: 130, height: 130, text: "Arc Label" });
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
  add(project, screen, "slider", { x: 170, y: 110, width: 280, height: 8, value: 35 });
  const row = add(project, screen, "container", { x: 150, y: 140, width: 310, height: 70, flexFlow: "ROW", gap: 10, pad: 8, bgOpa: 0, borderWidth: 0 });
  const status = add(project, screen, "label", { x: 24, y: 240, text: "Paused" });
  for (const [text, message] of [["Prev", "Previous"], ["Play", "Playing"], ["Next", "Next"]]) {
    const button = add(project, row, "button", { width: 88, height: 50, text });
    button.events.push({ trigger: "CLICKED", action: "setText", target: status.id, text: message });
  }
  add(project, screen, "bar", { x: 24, y: 276, width: 432, height: 12, value: 70, indicatorColor: "#26c6da" });
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
  add(project, screen, "label", { x: 20, y: 56, text: "18 C", font: 48, textColor: "#0277bd" });
  add(project, screen, "label", { x: 20, y: 116, text: "Partly cloudy", font: 16 });
  add(project, screen, "chart", { x: 200, y: 16, width: 264, height: 130, series: "14,15,17,18,18,17,15,14" });
  add(project, screen, "table", { x: 20, y: 160, width: 444, height: 140, cells: "Day,High,Low\nMon,19,11\nTue,21,12\nWed,17,10", columnWidth: 148 });
  return project;
}

function carDashboard() {
  const project = newProject("CarDashboard");
  project.device = { w: 800, h: 480 };
  project.theme = { dark: true, primary: "#ef5350", secondary: "#66bb6a" };
  const screen = project.screens[0];
  screen.name = "Cluster";
  screen.props = { bgColor: "#101418", bgOpa: 255 };
  add(project, screen, "arc", { x: 40, y: 70, width: 300, height: 300, min: 0, max: 240, value: 96 });
  add(project, screen, "label", { x: 146, y: 186, text: "96", font: 48, textColor: "#ffffff" });
  add(project, screen, "label", { x: 156, y: 244, text: "km/h", font: 16, textColor: "#ffffff" });
  add(project, screen, "arc", { x: 460, y: 70, width: 300, height: 300, min: 0, max: 8, value: 3 });
  add(project, screen, "label", { x: 590, y: 186, text: "3", font: 48, textColor: "#ffffff" });
  add(project, screen, "label", { x: 572, y: 244, text: "x1000 rpm", font: 14, textColor: "#ffffff" });
  add(project, screen, "bar", { x: 300, y: 420, width: 200, height: 18, value: 62, indicatorColor: "#66bb6a" });
  add(project, screen, "led", { x: 372, y: 40, width: 24, height: 24, ledBright: 255 });
  add(project, screen, "led", { x: 408, y: 40, width: 24, height: 24, ledBright: 120 });
  return project;
}

function factoryPanel() {
  const project = newProject("FactoryPanel");
  project.device = { w: 800, h: 480 };
  const screen = project.screens[0];
  screen.name = "Panel";
  const panel = add(project, screen, "grid", { x: 0, y: 0, width: "100%", height: "100%", pad: 10, gap: 10, gridColumns: "1fr,1fr,1fr", gridRows: "1fr,1fr" });
  for (const [name, value] of [["Pump", 72], ["Valve", 40], ["Motor", 88]]) {
    const card = add(project, panel, "container", { flexFlow: "COLUMN", gap: 8, pad: 10 });
    add(project, card, "label", { text: name, font: 18 });
    add(project, card, "bar", { width: "100%", height: 16, value });
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
  add(project, screen, "label", { x: 496, y: 18, text: "Today", font: 24 });
  add(project, screen, "list", { x: 496, y: 60, width: 288, height: 280, items: "#Morning\nTeam meeting\nDesign review\n#Afternoon\nFirmware test" });
  add(project, screen, "button", { x: 496, y: 356, width: 288, height: 56, text: "Add event" });
  return project;
}

function smartWatch() {
  const project = newProject("SmartWatch");
  project.device = { w: 240, h: 240 };
  project.theme = { dark: true, primary: "#66bb6a", secondary: "#ff7043" };
  const screen = project.screens[0];
  screen.name = "Face";
  screen.props = { bgColor: "#000000", bgOpa: 255 };
  add(project, screen, "arc", { align: "CENTER", width: 220, height: 220, value: 68 });
  add(project, screen, "label", { align: "CENTER", y: -14, text: "10:24", font: 36, textColor: "#ffffff" });
  add(project, screen, "label", { align: "CENTER", y: 26, text: "6,840 steps", textColor: "#a5d6a7" });
  add(project, screen, "led", { align: "BOTTOM_MID", y: -34, width: 12, height: 12, ledBright: 255 });
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
  const fonts = add(project, screen, "container", { x: 16, y: 172, width: 448, height: 136, flexFlow: "COLUMN", gap: 2, pad: 8 });
  for (const font of [14, 18, 24]) add(project, fonts, "label", { font, text: `Montserrat ${font}` });
  return project;
}

export const SAMPLES = [
  { id: "HomeControl", icon: "home", build: homeControl, ko: ["스마트 홈 제어", "Arc, 슬라이더, 스위치와 화면 전환 이벤트"], en: ["Smart Home Control", "Arc, slider, switch, and screen change events"] },
  { id: "LoginForm", icon: "lock", build: loginForm, ko: ["로그인 입력", "Text Area와 연결된 Keyboard"], en: ["Login Form", "Text Areas with a linked Keyboard"] },
  { id: "DataDashboard", icon: "chart", build: dataDashboard, ko: ["데이터 대시보드", "Chart, Table, Bar, Arc (800×480)"], en: ["Data Dashboard", "Chart, Table, Bar, Arc (800×480)"] },
  { id: "GridLayout", icon: "gridIcon", build: gridLayout, ko: ["Grid 레이아웃", "Grid로 만든 계산기 자판"], en: ["Grid Layout", "A calculator keypad made with Grid"] },
  { id: "ImageGallery", icon: "image", build: imageGallery, ko: ["이미지 갤러리", "Image, Image Button, Animation Image"], en: ["Image Gallery", "Image, Image Button, Animation Image"] },
  { id: "SettingsTabs", icon: "tabview", build: settingsTabs, ko: ["설정 화면", "Tabview, List, Spinbox, Button Matrix"], en: ["Settings Screen", "Tabview, List, Spinbox, Button Matrix"] },
  { id: "MediaPlayer", icon: "music", build: mediaPlayer, ko: ["음악 플레이어", "표지 이미지, 슬라이더, 재생 버튼 이벤트"], en: ["Music Player", "Cover image, slider, and play button events"] },
  { id: "WeatherStation", icon: "sun", build: weatherStation, ko: ["날씨 스테이션", "큰 글꼴, 선 Chart, 예보 Table"], en: ["Weather Station", "Large fonts, line Chart, forecast Table"] },
  { id: "CarDashboard", icon: "car", build: carDashboard, ko: ["자동차 계기판", "Arc 속도계와 경고등 (800×480)"], en: ["Car Dashboard", "Arc gauges and warning lights (800×480)"] },
  { id: "FactoryPanel", icon: "factory", build: factoryPanel, ko: ["공장 제어 패널", "Grid 안의 카드, 상태 Bar, 정지 버튼"], en: ["Factory Panel", "Cards in a Grid, status bars, stop button"] },
  { id: "CalendarPlanner", icon: "calendar", build: calendarPlanner, ko: ["일정 플래너", "Calendar와 일정 List"], en: ["Calendar Planner", "Calendar with an agenda List"] },
  { id: "SmartWatch", icon: "watch", build: smartWatch, ko: ["스마트워치", "작은 화면(240×240)의 시계 화면"], en: ["Smart Watch", "A watch face on a small display (240×240)"] },
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
