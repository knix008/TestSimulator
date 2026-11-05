// npm run tutorial:video: records the app's own tutorial, done by hand with a visible mouse pointer,
// and encodes it as MyLVGLStudio-Tutorial.mp4 in the project root. Korean, no sound. Needs ffmpeg.
//
// Drives the real desktop app over the DevTools protocol, in a private data folder, so the user's
// settings and projects are not touched. A window appears on the screen while it records; input goes
// through the protocol, so the mouse and keyboard stay free. Encoding the recording takes a while.
//   --exe <path>   the exe to record (default: the release build)
//   --preview      short pauses and a PNG of every step in test-results/video, no video
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connect, waitForTarget } from "./cdp.mjs";
import { freePort } from "./free-port.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WIDTH = 1920;
const HEIGHT = 1080;
const OUTPUT = "MyLVGLStudio-Tutorial.mp4";
const argument = (name) => {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : null;
};
const preview = process.argv.includes("--preview");
const exe = argument("--exe") ?? path.join(root, "src-tauri", "target", "release", process.platform === "win32" ? "MyLVGLStudio.exe" : "MyLVGLStudio");
if (!fs.existsSync(exe)) throw new Error(`${exe} is missing: build the app first (npm run build:win)`);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** A pause for the viewer, nearly nothing in a preview. */
const hold = (ms) => sleep(preview ? Math.min(ms, 60) : ms);

const work = fs.mkdtempSync(path.join(os.tmpdir(), "mls-video-"));
const frameDir = path.join(work, "frames");
const shotDir = path.join(root, "test-results", "video");
fs.mkdirSync(frameDir);
if (preview) {
  fs.rmSync(shotDir, { recursive: true, force: true });
  fs.mkdirSync(shotDir, { recursive: true });
}
fs.mkdirSync(path.join(work, "settings"));
fs.writeFileSync(path.join(work, "settings", "settings.json"), JSON.stringify({ language: "ko", theme: "light-classic", general: { autoInstallTools: false }, window: { width: WIDTH, height: HEIGHT, x: 0, y: 20 } }));

const port = await freePort(9460);
const app = spawn(exe, [], {
  stdio: "ignore",
  env: {
    ...process.env,
    MLS_SETTINGS_DIR: path.join(work, "settings"),
    // One page to record: dialogs stay in it.
    MLS_INLINE_DIALOGS: "1",
    WEBVIEW2_USER_DATA_FOLDER: path.join(work, "webview"),
    // A window behind other windows must keep painting.
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --disable-features=CalculateNativeWinOcclusion --disable-renderer-backgrounding --disable-backgrounding-occluded-windows`,
  },
});

let page = null;
let runPage = null;
const frames = [];

const js = (expression) => page.evaluate(expression);
const q = (selector) => JSON.stringify(selector);

/* ------------------------------------------------------------ the mouse pointer */

const CURSOR = `(() => {
  if (window.__cursor) return;
  const dot = document.createElement("div");
  dot.style.cssText = "position:fixed;left:0;top:0;width:26px;height:30px;z-index:2147483647;pointer-events:none;transform:translate(960px,540px);filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))";
  dot.innerHTML = '<svg width="26" height="30" viewBox="0 0 26 30"><path d="M2 2 L2 23 L8 18 L12 27 L16 25 L12 16 L20 16 Z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  document.documentElement.append(dot);
  const ring = document.createElement("div");
  ring.style.cssText = "position:fixed;left:-18px;top:-18px;width:36px;height:36px;border-radius:50%;background:rgba(255,160,0,.45);border:2px solid rgba(230,120,0,.9);z-index:2147483646;pointer-events:none;opacity:0";
  document.documentElement.append(ring);
  window.__cursor = {
    at: (x, y) => { dot.style.transform = "translate(" + x + "px," + y + "px)"; ring.style.transform = "translate(" + x + "px," + y + "px)"; },
    down: (on) => { ring.style.opacity = on ? "1" : "0"; },
  };
})()`;

let cursor = { x: WIDTH / 2, y: HEIGHT / 2 };
/** Where the mouse goes: the main page, or the run window floating at `run`. */
let run = null;

function send(type, x, y, extra = {}) {
  const [target, dx, dy] = run?.mouse ? [runPage, run.left, run.top] : [page, 0, 0];
  return target.send("Input.dispatchMouseEvent", { type, x: x - dx, y: y - dy, ...extra });
}

async function moveTo(x, y, { buttons = 0, button = "none", ms } = {}) {
  const from = cursor;
  const distance = Math.hypot(x - from.x, y - from.y);
  const time = preview ? 30 : ms ?? Math.min(650, 180 + distance * 0.7);
  const count = Math.max(2, Math.round(time / 18));
  for (let i = 1; i <= count; i++) {
    const t = i / count;
    const eased = t * t * (3 - 2 * t);
    const [cx, cy] = [from.x + (x - from.x) * eased, from.y + (y - from.y) * eased];
    await js(`window.__cursor.at(${cx},${cy})`);
    await send("mouseMoved", cx, cy, { buttons, button });
    await sleep(8);
  }
  cursor = { x, y };
}

async function press(extra = {}) {
  await js("window.__cursor.down(true)");
  await send("mousePressed", cursor.x, cursor.y, { button: "left", buttons: 1, clickCount: 1, ...extra });
  await hold(110);
}
async function release(extra = {}) {
  await send("mouseReleased", cursor.x, cursor.y, { button: "left", buttons: 0, clickCount: 1, ...extra });
  await js("window.__cursor.down(false)");
  await hold(60);
}

const centerOf = (selector) => js(`(() => { const e = document.querySelector(${q(selector)}); if (!e) return null; e.scrollIntoView({ block: "nearest", inline: "nearest" }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);

async function goTo(selector) {
  const point = await centerOf(selector);
  if (!point) throw new Error(`nothing to press: ${selector}`);
  await sleep(50);
  await moveTo(point.x, point.y);
}

async function click(selector) {
  await goTo(selector);
  await hold(120);
  await press();
  await release();
  await hold(180);
}

async function doubleClick(selector) {
  await goTo(selector);
  await hold(120);
  await press();
  await release();
  await sleep(40);
  await press({ clickCount: 2 });
  await release({ clickCount: 2 });
  await hold(200);
}

/** A press now and then does not reach a busy page: look, and press again. */
async function clickUntil(selector, expression) {
  for (let attempt = 0; attempt < 5; attempt++) {
    await click(selector);
    for (let wait = 0; wait < 12; wait++) {
      if (await js(`!!(${expression})`)) return;
      await sleep(50);
    }
  }
  throw new Error(`${selector} did not lead to ${expression}`);
}

async function type(text) {
  for (const char of text) {
    await page.send("Input.insertText", { text: char });
    await sleep(preview ? 5 : 55);
  }
  await hold(120);
}

async function typeInto(selector, text) {
  await clickUntil(selector, `document.activeElement === document.querySelector(${q(selector)})`);
  await js(`document.querySelector(${q(selector)}).select()`);
  await hold(90);
  await type(text);
}

/* ------------------------------------------------------------ the attributes */

/** Sets one attribute the way a person would. What already has the value is left alone. */
async function attribute(key, value) {
  const panel = ".attributes";
  const select = `${panel} [data-select="${key}"]`;
  if (await js(`!!document.querySelector(${q(select)})`)) {
    if ((await js(`document.querySelector(${q(`${select} .icon-select-text`)}).textContent`)).startsWith(String(value))) return;
    await choose(select, value);
    return;
  }
  const input = await js(`(() => {
    const field = document.querySelector(${q(`${panel} [data-field="${key}"]`)});
    if (!field) return null;
    if (field.matches("input, textarea")) return ${q(`${panel} [data-field="${key}"]`)};
    return field.querySelector(".color-text") ? ${q(`${panel} [data-field="${key}"] .color-text`)} : ${q(`${panel} [data-field="${key}"] input`)};
  })()`);
  if (!input) throw new Error(`no attribute ${key}`);
  if ((await js(`document.querySelector(${q(input)}).value`)) === String(value)) return;
  await typeInto(input, String(value));
}

async function attributes(values) {
  for (const [key, value] of Object.entries(values)) await attribute(key, value);
  await js("document.activeElement?.blur?.()");
  await hold(300);
}

async function choose(select, value) {
  await clickUntil(`${select} .icon-select-button`, `document.querySelector(${q(`${select} .icon-select-list`)})`);
  await hold(250);
  await click(`${select} [data-value="${value}"]`);
  await hold(200);
}

const nodeId = (screen, type, nth) => js(`window.__mls.project().screens[${screen}].children.filter((n) => n.type === ${q(type)})[${nth}]?.id`);
const screenId = (screen) => js(`window.__mls.project().screens[${screen}].id`);
const countOf = (screen) => js(`window.__mls.project().screens[${screen}].children.length`);

/** The first of a kind is dragged onto the screen; after that a double click is quicker. */
async function place(screen, type, how = "double") {
  const before = await countOf(screen);
  if (how === "drag") {
    await goTo(`[data-palette="${type}"]`);
    await hold(150);
    await press();
    const canvas = await js(`(() => { const r = window.__mls.canvas().getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await moveTo(canvas.x, canvas.y, { buttons: 1, button: "left", ms: 800 });
    await hold(250);
    await release();
  } else {
    await doubleClick(`[data-palette="${type}"]`);
  }
  await hold(350);
  if ((await countOf(screen)) !== before + 1) await doubleClick(`[data-palette="${type}"]`);
  await hold(250);
  if ((await countOf(screen)) !== before + 1) throw new Error(`${type} was not placed on screen ${screen}`);
}

async function addEvent(index, { action, target, text, trigger }) {
  const row = `.attributes [data-event="${index}"]`;
  await clickUntil('.attributes [data-command="event-add"]', `document.querySelector(${q(row)})`);
  await hold(300);
  await choose(`${row} [data-select="action"]`, action);
  if (trigger) await choose(`${row} [data-select="trigger"]`, trigger);
  await choose(`${row} [data-select="target"]`, target);
  if (text) await typeInto(`${row} [data-field="eventText"]`, text);
  await js("document.activeElement?.blur?.()");
  await hold(300);
}

/* ------------------------------------------------------------ the run window */

/**
 * The program runs in a window of its own, a separate page. Its picture is shown over the main page
 * where the mouse pointer can reach it, and the mouse goes to the real run window.
 */
async function openRunWindow() {
  await clickUntil('[data-command="run"]', "window.__mls.runOpen()");
  const target = await waitForTarget(port, (item) => item.url.includes("run=1"), 15000);
  runPage = await connect(target);
  await runPage.send("Page.enable");
  await runPage.until("window.__mlsRun && window.__mlsRun.ready()", 15000);
  await sleep(300);
  const size = await runPage.evaluate("({ w: innerWidth, h: innerHeight })");
  // Left of the design, in the empty part of the surface, where it covers neither the design nor the card.
  const left = Math.round(await js(`window.__mls.canvas().getBoundingClientRect().left`)) - size.w - 4;
  const top = 200;
  run = { left, top, ...size, mouse: true };
  await js(`(() => {
    const img = document.createElement("img");
    img.id = "__run";
    img.style.cssText = "position:fixed;left:${left}px;top:${top}px;width:${size.w}px;height:${size.h}px;z-index:2147483000;pointer-events:none;box-shadow:0 10px 36px rgba(0,0,0,.55);border-radius:6px;background:#000";
    document.documentElement.append(img);
    window.__runFrame = (data) => { img.src = "data:image/jpeg;base64," + data; };
  })()`);
  runPage.onEvent("Page.screencastFrame", (frame) => {
    runPage.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => {});
    js(`window.__runFrame(${JSON.stringify(frame.data)})`).catch(() => {});
  });
  await runPage.send("Page.startScreencast", { format: "jpeg", quality: 92, everyNthFrame: 1 });
  await hold(1500);
}

const runPoint = async (offsetX, offsetY) => {
  const box = await runPage.evaluate(`(() => { const r = window.__mlsRun.canvas().getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, s: r.width / window.__mlsRun.canvas().width }; })()`);
  return { x: run.left + box.x + offsetX * box.s, y: run.top + box.y + offsetY * box.s };
};

/** Round the ring of the given diameter, from one angle to another, clockwise from three o'clock. */
async function dragRing(diameter, from, to) {
  const point = async (degrees) => runPoint(Math.cos((degrees * Math.PI) / 180) * (diameter / 2 - 6), Math.sin((degrees * Math.PI) / 180) * (diameter / 2 - 6));
  const start = await point(from);
  await moveTo(start.x, start.y);
  await hold(250);
  await press();
  const steps = preview ? 8 : 45;
  for (let i = 1; i <= steps; i++) {
    const at = await point(from + ((to - from) * i) / steps);
    await js(`window.__cursor.at(${at.x},${at.y})`);
    await send("mouseMoved", at.x, at.y, { button: "left", buttons: 1 });
    cursor = at;
    await sleep(preview ? 5 : 28);
  }
  await hold(300);
  await release();
  await hold(700);
}

async function pressInRun(offsetX, offsetY) {
  const at = await runPoint(offsetX, offsetY);
  await moveTo(at.x, at.y);
  await hold(250);
  await press();
  await release();
  await hold(1100);
}

async function useRunWindow() {
  await dragRing(340, 318, 225);
  await dragRing(340, 225, 350);
  await hold(1800); // the inner ring keeps sweeping by itself
  await pressInRun(0, 88);
  await hold(800);
  await dragRing(320, 250, 340);
  await dragRing(320, 340, 200);
  await hold(600);
  await pressInRun(0, 90);
  await hold(1600);
  run.mouse = false;
}

async function closeRunOverlay() {
  await runPage.send("Page.stopScreencast").catch(() => {});
  run = null;
  await js(`document.getElementById("__run")?.remove()`);
  runPage.close();
  runPage = null;
}

/* ------------------------------------------------------------ the steps, by hand */

const FACE = 0;
const WORKOUT = 1;
const CENTER = { align: "CENTER", x: 0 };

const DOING = {
  // The card says it can be moved: out of the way of the watch, for the rest of the video.
  welcome: async () => {
    const title = await centerOf(".tutorial-card header strong");
    const card = await js(`(() => { const c = document.querySelector(".tutorial-card").getBoundingClientRect(); const a = document.querySelector('[data-panel="attributes"]').getBoundingClientRect(); return { left: c.left, top: c.top, room: a.left - 400 - 14 }; })()`);
    await moveTo(title.x, title.y);
    await hold(300);
    await press();
    await moveTo(title.x + card.room - card.left, title.y + (HEIGHT - 320) - card.top, { buttons: 1, button: "left", ms: 900 });
    await hold(150);
    await release();
    await hold(400);
  },
  round: async () => {
    await clickUntil('[data-command="device-chip"]', "document.querySelector('[data-device-menu]')");
    await hold(500);
    await click('[data-device="circle360"]');
  },
  theme: async () => {
    await clickUntil('[data-command="settings"]', "document.querySelector('[data-dialog=\"settings\"]')");
    await hold(700);
    await click('[data-field="themeDark"]');
    await hold(700);
    await clickUntil('[data-command="settings-close"]', "!document.querySelector('[data-dialog=\"settings\"]')");
    await hold(300);
    await attributes({ bgColor: "#000000", name: "Face" });
  },
  outer: async () => {
    await place(FACE, "arc", "drag");
    await attributes({ width: 340, height: 340, ...CENTER, y: 0, value: 68, indicatorColor: "#66bb6a" });
  },
  inner: async () => {
    await place(FACE, "arc");
    await attributes({ width: 290, height: 290, ...CENTER, y: 0, value: 45, indicatorColor: "#ff7043" });
  },
  time: async () => {
    await place(FACE, "label", "drag");
    await attributes({ text: "10:24", font: 48, textColor: "#ffffff", ...CENTER, y: -34 });
  },
  date: async () => {
    await place(FACE, "label");
    await attributes({ text: "THU 5 NOV", font: 18, textColor: "#9e9e9e", ...CENTER, y: 12 });
  },
  goal: async () => {
    await place(FACE, "label");
    await attributes({ text: "68 % of goal", textColor: "#a5d6a7", ...CENTER, y: 44 });
  },
  battery: async () => {
    await place(FACE, "bar");
    await attributes({ width: 60, height: 8, ...CENTER, y: -88, value: 80, indicatorColor: "#66bb6a" });
  },
  link: () => nodeId(FACE, "label", 2).then((target) => addEvent(0, { action: "showValue", target, text: "%d %% of goal" })),
  sweep: () => attributes({ animate: 8000 }),
  workout: async () => {
    await clickUntil('[data-command="add-screen"]', "window.__mls.project().screens.length > 1");
    await hold(500);
    await attributes({ name: "Workout", bgColor: "#000000" });
  },
  heart: async () => {
    await place(WORKOUT, "arc");
    await attributes({ width: 320, height: 320, ...CENTER, y: 0, min: 60, max: 200, value: 120, indicatorColor: "#ef5350" });
  },
  bpm: async () => {
    await place(WORKOUT, "label");
    await attributes({ text: "120", font: 48, textColor: "#ffffff", ...CENTER, y: -20 });
    await place(WORKOUT, "label");
    await attributes({ text: "BPM", ...CENTER, y: 28, textColor: "#ef9a9a" });
    await selectInTree(WORKOUT, "arc", 0);
    await addEvent(0, { action: "showValue", target: await nodeId(WORKOUT, "label", 0), text: "%d" });
  },
  back: async () => {
    await place(WORKOUT, "button");
    await attributes({ text: "Back", width: 110, height: 44, ...CENTER, y: 90 });
    await addEvent(0, { action: "screen", target: await screenId(FACE), trigger: "CLICKED" });
  },
  go: async () => {
    await place(FACE, "button");
    await attributes({ text: "Workout", width: 110, height: 40, ...CENTER, y: 88 });
    await addEvent(0, { action: "screen", target: await screenId(WORKOUT), trigger: "CLICKED" });
  },
  run: async () => {
    await openRunWindow();
    await useRunWindow();
  },
  code: async () => {
    const place = await js(`(() => {
      const box = document.querySelector("[data-code-input]");
      const at = box.value.indexOf("10:24");
      if (at < 0) return null;
      const line = box.value.slice(0, at).split("\\n").length - 1;
      const column = at - (box.value.lastIndexOf("\\n", at - 1) + 1);
      const style = getComputedStyle(box);
      const height = parseFloat(style.lineHeight);
      const glyph = document.createElement("canvas").getContext("2d");
      glyph.font = style.font;
      const char = glyph.measureText("0").width;
      box.scrollTop = Math.max(0, (line - 6) * height);
      box.scrollLeft = 0;
      const r = box.getBoundingClientRect();
      return { x: r.left + parseFloat(style.paddingLeft) + (column + 2.5) * char, y: r.top + parseFloat(style.paddingTop) + (line + 0.5) * height - box.scrollTop, at };
    })()`);
    if (!place) throw new Error("10:24 is not in the code on screen");
    await hold(800);
    await moveTo(place.x, place.y);
    await hold(300);
    await press();
    await release();
    await js(`(() => { const box = document.querySelector("[data-code-input]"); box.focus(); box.setSelectionRange(${place.at}, ${place.at + 5}); })()`);
    await hold(1200);
    await page.send("Input.insertText", { text: "10:30" });
    // What is typed reaches the design a moment later. The pointer moves away from what changed.
    await page.until('!document.querySelector("[data-tutorial-task]:not([data-done])")', 4000);
    await moveTo(place.x + 150, place.y + 30);
    await hold(2200);
  },
  problems: () => click('[data-bottom="problems"]'),
  fonts: () => showDialog('[data-command="fonts"]', "fonts"),
  conf: () => showDialog('[data-command="lvconf"]', "lvconf"),
};

async function selectInTree(screen, type, nth) {
  const id = await nodeId(screen, type, nth);
  const selector = `[data-tree="${id}"]`;
  if (await js(`!!document.querySelector(${q(selector)})`)) await clickUntil(selector, `window.__mls.selected() === ${q(id)}`);
  else throw new Error(`no row for ${id} in the tree`);
  await hold(400);
}

/** The step is about a dialog: open it, leave it up for a moment, close it. */
async function showDialog(button, id) {
  await clickUntil(button, `document.querySelector('[data-dialog="${id}"]')`);
  // On the desktop a dialog is a window of its own, which the tutorial's dimming does not reach.
  await js(`document.documentElement.append(Object.assign(document.createElement("style"), { id: "__nodim", textContent: ".tutorial-spot { display: none; }" }))`);
  await hold(4500);
  // The card lies over the bottom of a big dialog; its top corner is free.
  await clickUntil(`[data-dialog="${id}"] header button:last-child`, `!document.querySelector('[data-dialog="${id}"]')`);
  await js(`document.getElementById("__nodim").remove()`);
  await hold(300);
}

/* ------------------------------------------------------------ recording */

async function encode() {
  const output = path.join(root, OUTPUT);
  const list = [];
  frames.forEach((frame, index) => {
    const next = frames[index + 1]?.time ?? frame.time + 3;
    list.push(`file '${frame.file.replace(/\\/g, "/")}'`, `duration ${Math.max(0.001, next - frame.time).toFixed(3)}`);
  });
  list.push(`file '${frames.at(-1).file.replace(/\\/g, "/")}'`);
  const listFile = path.join(work, "frames.txt");
  fs.writeFileSync(listFile, `${list.join("\n")}\n`);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listFile,
    "-vf", `fps=30,scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`,
    "-c:v", "libx264", "-preset", "slow", "-tune", "stillimage", "-crf", "23", "-g", "120", "-movflags", "+faststart", "-an", output], { stdio: "inherit" });
  return output;
}

let failure = null;
try {
  const target = await waitForTarget(port, (item) => /index\.html|tauri\.localhost/.test(item.url), 40000);
  page = await connect(target);
  await page.send("Page.enable");
  await page.until("window.__mls && window.__mls.engine && window.__mls.canvas", 20000);
  await js(CURSOR);
  await page.until('document.querySelector("[data-dialog=tutorial-ask]")', 15000);

  const size = await js("({ w: innerWidth, h: innerHeight })");
  console.log(`window ${size.w}x${size.h}`);

  let sequence = 0;
  if (!preview) {
    page.onEvent("Page.screencastFrame", (frame) => {
      const file = path.join(frameDir, `${String(sequence++).padStart(6, "0")}.jpg`);
      fs.writeFileSync(file, Buffer.from(frame.data, "base64"));
      frames.push({ file, time: frame.metadata.timestamp });
      page.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => {});
    });
    await page.send("Page.startScreencast", { format: "jpeg", quality: 90, everyNthFrame: 1 });
  }
  const shoot = async (name) => {
    if (preview) fs.writeFileSync(path.join(shotDir, `${name}.png`), await page.screenshot());
  };

  await hold(2500);
  await shoot("00-ask");
  await clickUntil('[data-command="tutorial-start"]', 'document.querySelector("[data-tutorial]")');

  const total = Number((await js('document.querySelector("[data-tutorial-count]").textContent')).split("/")[1]);
  for (let index = 0; index < total; index++) {
    await page.until(`document.querySelector("[data-tutorial-count]").textContent.trim().startsWith(${q(`${index + 1} /`)})`, 5000);
    await sleep(350);
    const step = await js(`({ id: document.querySelector("[data-tutorial]").dataset.tutorial, words: document.querySelector("[data-tutorial-text]").textContent.length })`);
    const label = `${String(index + 1).padStart(2, "0")}-${step.id}`;
    process.stdout.write(`${label}\n`);
    await shoot(`${label}-a`);
    // Time to read the card: about 13 characters a second.
    await hold(Math.max(3000, Math.min(11000, (step.words / 13) * 1000)));
    await DOING[step.id]?.();
    const open = await js('Array.from(document.querySelectorAll("[data-tutorial-task]:not([data-done])")).map((e) => e.dataset.tutorialTask)');
    if (open.length) throw new Error(`${step.id}: still to do: ${open.join(", ")}`);
    await shoot(`${label}-b`);
    await hold(DOING[step.id] ? 1400 : 500);
    if (index < total - 1) {
      await clickUntil('[data-command="tutorial-next"]', `!document.querySelector("[data-tutorial-count]").textContent.trim().startsWith(${q(`${index + 1} /`)})`);
      if (run) await closeRunOverlay();
    }
  }
  await hold(1500);
  await clickUntil('[data-command="tutorial-done"]', '!document.querySelector("[data-tutorial]")');
  await hold(3000);
  await shoot("99-end");
  if (!preview) await page.send("Page.stopScreencast");
} catch (error) {
  failure = error;
  try {
    fs.mkdirSync(shotDir, { recursive: true });
    fs.writeFileSync(path.join(shotDir, "failed.png"), await page.screenshot());
  } catch { /* the window is gone */ }
} finally {
  page?.close();
  runPage?.close();
  app.kill();
}

if (failure) {
  console.error(failure.stack ?? failure);
  process.exitCode = 1;
} else if (!preview) {
  if (frames.length < 50) throw new Error(`only ${frames.length} frames were recorded`);
  console.log(`${frames.length} frames over ${(frames.at(-1).time - frames[0].time).toFixed(0)} s, encoding`);
  const output = await encode();
  console.log(`${path.basename(output)}: ${(fs.statSync(output).size / 1e6).toFixed(1)} MB`);
}

await sleep(1500);
fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
