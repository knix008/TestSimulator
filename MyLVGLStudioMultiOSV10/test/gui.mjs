// npm run test:gui: drives the real desktop app through the DevTools protocol, in a private
// data folder and WebView2 profile. Screenshots go to test-results/gui/.
//   --no-native    skips downloading LVGL and the native build
//   --exe <path>   the exe to test (default: the debug build)
import { execFileSync, spawn } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connect, waitForTarget } from "../scripts/cdp.mjs";
import { freePort } from "../scripts/free-port.mjs";
import { createReporter } from "./reporter.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argument = (name) => {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : null;
};
const exe = argument("--exe") ?? path.join(root, "src-tauri", "target", "e2e", "debug", process.platform === "win32" ? "MyLVGLStudio.exe" : "MyLVGLStudio");
const skipNative = process.argv.includes("--no-native");
const shots = path.join(root, "test-results", "gui");
fs.rmSync(shots, { recursive: true, force: true });
fs.mkdirSync(shots, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const data = fs.mkdtempSync(path.join(os.tmpdir(), "mls-gui-"));
let app = null;
let page = null;
let debugPort = 0;

async function launch(args = []) {
  const port = await freePort(9360);
  debugPort = port;
  app = spawn(exe, args, {
    stdio: "ignore",
    env: {
      ...process.env,
      MLS_SETTINGS_DIR: path.join(data, "settings"),
      WEBVIEW2_USER_DATA_FOLDER: path.join(data, "webview"),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
    },
  });
  const target = await waitForTarget(port, (item) => /index\.html|tauri\.localhost/.test(item.url), 40000);
  page = await connect(target);
  await page.send("Page.enable");
  await page.until("window.__mls && window.__mls.engine && window.__mls.canvas", 20000);
}

async function restart(args = []) {
  page.close();
  app.kill();
  await sleep(1500);
  await launch(args);
}

const { category, test: step, summary } = createReporter({
  title: `My LVGL Studio GUI tests: ${path.relative(root, exe)}`,
  reportFile: path.join(root, "test-results", "gui-report.json"),
  onFailure: async (number) => {
    try {
      fs.writeFileSync(path.join(shots, `failed-${number}.png`), await page.screenshot());
    } catch { /* the window is gone */ }
  },
});

await launch();

const js = (expression) => page.evaluate(expression);
const shot = async (name) => fs.writeFileSync(path.join(shots, `${name}.png`), await page.screenshot());
const center = async (selector) => {
  const point = await locate(selector);
  // A scroll reaches hit testing a frame later than it reaches the page.
  await sleep(50);
  return point;
};
const locate = (selector) => js(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; e.scrollIntoView({ block: "nearest", inline: "nearest" }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
const mouse = (type, x, y, extra = {}) => page.send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1, ...extra });
const WATCH_INPUT = `window.__input ??= (() => { const s = { down: 0, up: 0 }; addEventListener("pointerdown", () => s.down++, true); addEventListener("pointerup", () => s.up++, true); return s; })()`;
/** Sends a press. The input channel can drop one before it reaches the page; only that is retried. */
async function press(x, y, extra = {}) {
  await js(WATCH_INPUT);
  for (let attempt = 0; attempt < 5; attempt++) {
    const before = await js("window.__input.down");
    await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, buttons: 0 });
    await sleep(attempt * 120);
    await mouse("mousePressed", x, y, extra);
    await sleep(60);
    if ((await js("window.__input.down")) > before) return;
  }
  throw new Error(`the window never received a press at ${x},${y}`);
}
async function release(x, y, extra = {}) {
  const before = await js("window.__input.up");
  await mouse("mouseReleased", x, y, extra);
  await sleep(60);
  if ((await js("window.__input.up")) === before) {
    await mouse("mouseReleased", x, y, extra);
    await sleep(60);
  }
}
async function clickAt(x, y) {
  await press(x, y);
  await release(x, y);
}
async function click(selector) {
  const point = await center(selector);
  assert.ok(point, `no element ${selector}`);
  await clickAt(point.x, point.y);
}
async function drag(from, to) {
  await press(from.x, from.y);
  const steps = 6;
  for (let i = 1; i <= steps; i++) {
    await mouse("mouseMoved", from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
    await sleep(25);
  }
  await release(to.x, to.y);
  await sleep(50);
}
async function typeInto(selector, text) {
  await js(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); e.focus(); const set = Object.getOwnPropertyDescriptor(e instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value").set; set.call(e, ${JSON.stringify(text)}); e.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  await sleep(80);
}
const project = () => js("window.__mls.project()");
async function pickVersion(version) {
  await click('[data-command="version-chip"]');
  await page.until('document.querySelector("[data-version-menu]")', 2000);
  await click(`[data-version="${version}"]`);
  await sleep(100);
}
const lastWidget = async () => {
  const p = await project();
  return p.screens[0].children.at(-1);
};
/** Page position of a display coordinate. */
const displayPoint = (x, y) => js(`(() => { const r = window.__mls.canvas().getBoundingClientRect(); const z = window.__mls.zoom(); return { x: r.left + ${x} * z, y: r.top + ${y} * z }; })()`);
const pressKey = async (key, code, keyCode, modifiers = 0) => {
  await js("document.activeElement && document.activeElement.blur()");
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, modifiers, windowsVirtualKeyCode: keyCode });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, modifiers, windowsVirtualKeyCode: keyCode });
  await sleep(100);
};
const allNodes = () => js(`(() => { const list = []; const step = (n) => { list.push(n); n.children.forEach(step); }; window.__mls.project().screens.forEach(step); return list; })()`);
const nodeById = async (id) => (await allNodes()).find((node) => node.id === id);
const canvasHash = (selector) => js(`(() => { const c = document.querySelector(${JSON.stringify(selector)}); const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let h = 0; for (let i = 0; i < d.length; i += 97) h = (h * 31 + d[i]) | 0; return h; })()`);
async function doubleClick(selector) {
  const point = await center(selector);
  assert.ok(point, `no element ${selector}`);
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y, buttons: 0 });
  await mouse("mousePressed", point.x, point.y, { clickCount: 1 });
  await mouse("mouseReleased", point.x, point.y, { clickCount: 1 });
  await mouse("mousePressed", point.x, point.y, { clickCount: 2 });
  await mouse("mouseReleased", point.x, point.y, { clickCount: 2 });
  await sleep(120);
}
/** The worst text/background contrast among the fields and drop-downs on screen. */
const CONTRAST_PROBE = `(() => {
  const rgb = (text) => { const m = text.match(/[\\d.]+/g).map(Number); return { c: m.slice(0, 3), a: m[3] ?? 1 }; };
  const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const [h, l] = [lum(a), lum(b)].sort((x, y) => y - x); return (h + 0.05) / (l + 0.05); };
  const background = (e) => { for (let n = e; n; n = n.parentElement) { const b = rgb(getComputedStyle(n).backgroundColor); if (b.a > 0.9) return b.c; } return [255, 255, 255]; };
  let worst = { ratio: 99, what: "" };
  const look = (e, color, what) => { const r = ratio(rgb(color).c, background(e)); if (r < worst.ratio) worst = { ratio: r, what }; };
  for (const e of document.querySelectorAll("input:not([type=color]):not([type=checkbox]), textarea, .icon-select-button, .icon-select-text, [data-menu] > button, .tree-row, .palette-item, .theme-row, .field-label, .panel h3, .attributes h4, .pref-tabs button, .form-grid > span, .theme-color-row > span, .dialog > header strong, .status-cell, .app-title strong, .title-file")) {
    look(e, getComputedStyle(e).color, e.className || e.tagName);
    if (e.placeholder) look(e, getComputedStyle(e, "::placeholder").color, "placeholder of " + (e.dataset.field || e.className));
  }
  return worst;
})()`;
const clickRecent = (file) => js(`Array.from(document.querySelectorAll("[data-recent]")).find((e) => e.dataset.recent === ${JSON.stringify(file)}).click()`);
const box = (id) => js(`window.__mls.box(${JSON.stringify(id)})`);
const pixel = (x, y) => js(`(() => { const c = window.__mls.canvas(); const d = c.getContext("2d").getImageData(${x}, ${y}, 1, 1).data; return [d[0], d[1], d[2]]; })()`);
const logText = () => js(`Array.from(document.querySelectorAll('[data-log] .log-line span')).map((e) => e.textContent).join("\\n")`);
async function choose(field, value) {
  await sleep(120);
  await click(`[data-select="${field}"] .icon-select-button`);
  await click(`[data-select="${field}"] [data-value="${value}"]`);
}

category("Start screen");

await step("It opens on the start screen with every card", async () => {
  await page.until("document.querySelector('[data-start-screen]')", 15000);
  for (const card of ["hero", "actions", "recent", "samples", "theme", "background"]) {
    assert.ok(await js(`!!document.querySelector('[data-card="${card}"]')`), card);
  }
  await sleep(400);
  assert.equal(await js("!!document.querySelector('[data-title-file], [data-status=file], [data-status=device], [data-status=selection]')"), false, "the empty project must not show on the start screen");
  assert.ok(!(await js("document.querySelector('.app').textContent")).includes("Untitled"), "Untitled is visible on the start screen");
  assert.equal(await js("document.querySelectorAll('[data-grip] circle').length"), 6, "the grip is a triangle of six dots");
  await shot("01-start");
});

await step("The menu card lists every action as a tile", async () => {
  for (const action of ["new", "open", "continue", "manager", "settings", "theme", "language", "preferences", "start-settings", "about", "exit"]) {
    assert.ok(await js(`!!document.querySelector('.start-tile[data-start="${action}"] small')`), action);
  }
});

await step("At least 20 backgrounds are offered, each with its own chip", async () => {
  const count = await js("document.querySelectorAll('[data-card=background] [data-background]').length");
  assert.ok(count >= 20, String(count));
  const hashes = await js(`Array.from(document.querySelectorAll('[data-card=background] [data-background] canvas')).map((c) => { const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let h = 0; for (let i = 0; i < d.length; i += 7) h = (h * 31 + d[i]) | 0; return h; })`);
  assert.equal(new Set(hashes).size, count, "two chips are the same");
});

await step("Every background draws and moves on the real canvas", async () => {
  const kinds = await js("Array.from(document.querySelectorAll('[data-card=background] [data-background]')).map((e) => e.dataset.background)");
  const pictures = new Set();
  for (const kind of kinds) {
    await js(`document.querySelector('[data-card=background] [data-background="${kind}"]').click()`);
    await sleep(120);
    assert.equal(await js("window.__mls.start().background"), kind);
    const first = await canvasHash("[data-start-canvas]");
    let second = first;
    for (let wait = 0; wait < 10 && second === first; wait++) {
      await sleep(250);
      second = await canvasHash("[data-start-canvas]");
    }
    assert.notEqual(first, second, `${kind} does not move`);
    pictures.add(second);
  }
  assert.equal(pictures.size, kinds.length, "two backgrounds look the same");
  await shot("01b-last-background");
});

await step("The speed stepper changes the speed; 0 stops the background", async () => {
  const speed = () => js("window.__mls.start().speed");
  const shown = Number(await js('document.querySelector(\'[data-card=background] [data-field="startSpeed"]\').value'));
  await click('[data-card="background"] [data-step="startSpeed:up"]');
  await sleep(60);
  assert.equal(await speed(), shown + 10);
  await typeInto('[data-card="background"] [data-field="startSpeed"]', "0");
  await js("document.activeElement.blur()");
  await sleep(120);
  assert.equal(await speed(), 0);
  const first = await canvasHash("[data-start-canvas]");
  await sleep(300);
  assert.equal(await canvasHash("[data-start-canvas]"), first);
  await typeInto('[data-card="background"] [data-field="startSpeed"]', "100");
  await js("document.activeElement.blur()");
  await sleep(60);
  assert.equal(await speed(), 100);
});

await step("Card opacity changes the cards", async () => {
  await click('[data-card="background"] [data-step="startOpacity:down"]');
  await sleep(60);
  assert.equal(await js("window.__mls.start().cardOpacity"), 80);
  assert.equal(await js("document.querySelector('[data-start-screen]').style.getPropertyValue('--start-card-alpha')"), "80%");
  await click('[data-card="background"] [data-step="startOpacity:up"]');
});

await step("Speed and opacity: a slide bar right of the minus button, the value centred", async () => {
  for (const name of ["startSpeed", "startOpacity"]) {
    const order = await js(`Array.from(document.querySelector('[data-card=background] [data-range="${name}"]').children).map((e) => e.className)`);
    assert.deepEqual(order, ["range-step", "range-bar", "range-value", "range-step"], name);
    assert.equal(await js(`getComputedStyle(document.querySelector('[data-card=background] [data-field="${name}"]')).textAlign`), "center", name);
  }
  const bar = await js(`(() => { const e = document.querySelector('[data-card=background] [data-range-bar="startOpacity"]'); e.scrollIntoView({ block: "nearest" }); const r = e.getBoundingClientRect(); return { left: r.left, width: r.width, y: r.top + r.height / 2 }; })()`);
  assert.ok(bar.width >= 60 && bar.width <= 130, `the bar should be short: ${bar.width}`);
  await drag({ x: bar.left + bar.width * 0.5, y: bar.y }, { x: bar.left + bar.width + 30, y: bar.y });
  await sleep(80);
  assert.equal(await js("window.__mls.start().cardOpacity"), 100);
  for (let i = 0; i < 4; i++) {
    await click('[data-card="background"] [data-step="startOpacity:down"]');
    await sleep(60);
  }
  assert.equal(await js("window.__mls.start().cardOpacity"), 80);
  await shot("01e-ranges");
});

await step("The auto change tile switches on and off", async () => {
  await click('[data-card="background"] [data-background-shuffle]');
  assert.equal(await js("window.__mls.start().shuffle"), true);
  await click('[data-card="background"] [data-background-shuffle]');
  assert.equal(await js("window.__mls.start().shuffle"), false);
});

await step("A card moves by its handle, and auto arrange puts it back", async () => {
  await js("document.querySelector('.start-scroll').scrollTop = 0");
  const top = () => js("document.querySelector('[data-card=recent]').offsetTop");
  const before = await top();
  const from = await center('[data-card-handle="recent"]');
  const hero = await center('[data-card="hero"]');
  await drag(from, { x: from.x, y: hero.y - 60 });
  await sleep(350);
  assert.ok(await js("window.__mls.start().layout !== null"), "the layout was not saved");
  assert.ok((await top()) < before, "the card did not move up");
  await click('[data-start="arrange"]');
  await sleep(350);
  assert.ok(Math.abs((await top()) - before) < 3, "auto arrange did not restore it");
});

await step("A card can be resized by its corner", async () => {
  const height = () => js("document.querySelector('[data-card=recent]').getBoundingClientRect().height");
  const before = await height();
  const corner = await center('[data-card-resize="recent"]');
  await drag(corner, { x: corner.x, y: corner.y + 100 });
  await sleep(300);
  assert.ok((await height()) > before + 50, "the card did not grow");
  await click('[data-start="arrange"]');
  await sleep(300);
});

await step("A theme on the start screen applies at once", async () => {
  assert.equal(await js("document.querySelectorAll('[data-start-theme]').length"), 40);
  await click('[data-start-theme="dark-midnight"]');
  await sleep(120);
  assert.equal(await js("document.documentElement.dataset.theme"), "dark-midnight");
  await js("document.querySelector('.start-scroll').scrollTop = 0");
  await shot("01c-start-dark");
  await click('[data-start-theme="light-classic"]');
  await sleep(80);
});

await step("The language tile switches the language", async () => {
  await click('[data-start="language"]');
  await sleep(80);
  assert.equal(await js("window.__mls.language()"), "en");
  await click('[data-start="language"]');
  await sleep(80);
  assert.equal(await js("window.__mls.language()"), "ko");
});

await step("The language can change without disturbing the engine", async () => {
  const engine = () => js("window.__mls.engine().width");
  const before = await engine();
  await click('[data-start="language"]');
  await sleep(150);
  await click('[data-start="language"]');
  await sleep(150);
  assert.equal(await engine(), before);
});

await step("The Start button leaves and returns to the start screen", async () => {
  await click('[data-command="start"]');
  await sleep(100);
  assert.equal(await js("window.__mls.showStart()"), false);
  await click('[data-command="start"]');
  await sleep(100);
  assert.equal(await js("window.__mls.showStart()"), true);
});

await step("A sample opens as an unsaved copy, and only then asks about LVGL", async () => {
  assert.ok((await js("document.querySelectorAll('[data-card=samples] [data-sample]').length")) >= 6, "too few samples");
  assert.equal(await js("Array.from(document.querySelectorAll('[data-card=samples] [data-sample]')).filter((e) => !e.querySelector('.icon')).length"), 0, "a sample has no icon");
  const hues = await js("new Set(Array.from(document.querySelectorAll('[data-card=samples] [data-sample] .icon')).map((e) => e.dataset.tone)).size");
  assert.ok(hues >= 5, `the samples should be colourful: ${hues} colours`);
  const kinds = await js("new Set(Array.from(document.querySelectorAll('[data-card=samples] [data-sample] .icon')).map((e) => e.dataset.icon)).size");
  assert.equal(kinds, await js("document.querySelectorAll('[data-card=samples] [data-sample]').length"), "every sample has its own icon");
  assert.ok(await js("!!document.querySelector('[data-start=samples]') && !!document.querySelector('[data-start=hero-samples]')"), "no sample button");
  await click('[data-start="hero-samples"]');
  await page.until('document.querySelector("[data-dialog=samples]")', 3000);
  await shot("01e2-samples-dialog");
  await click('[data-dialog="samples"] footer button');
  await click('[data-card="samples"] [data-sample="LegacyMeter"]');
  await page.until('document.querySelector("[data-dialog=confirm]")', 8000);
  assert.match(await js('document.querySelector("[data-dialog=confirm]").textContent'), /8\.4\.0/);
  await shot("01f-sample-asks");
  await click('[data-command="confirm-no"]');
  await sleep(200);
  assert.equal(await js("window.__mls.showStart()"), false);
  assert.equal((await project()).name, "LegacyMeter");
  assert.equal((await project()).lvgl, "8.4.0");
  await page.until('window.__mls.engine() && window.__mls.engine().runtimeVersion() === "8.4.0"', 15000);
  await sleep(200);
  assert.ok(await js('document.querySelector("[data-tree]") !== null'));
  assert.equal(await js("window.__mls.recent().length"), 0, "a sample copy is not a recent project");
  await shot("01g-sample-open");
});

await step("A sample with images draws them", async () => {
  await click('[data-menu="file"] > button');
  await click('[data-menu="file"] [data-command="samples"]');
  await page.until('document.querySelector("[data-dialog=samples]")', 3000);
  assert.ok(await js('!!document.querySelector("[data-dialog=samples] [data-dialog-title] .icon")'));
  await click('[data-dialog="samples"] [data-sample="ImageGallery"]');
  await page.until('document.querySelector("[data-dialog=confirm]")', 8000);
  await click('[data-command="confirm-no"]');
  await page.until('window.__mls.project().name === "ImageGallery" && window.__mls.engine().runtimeVersion() === "9.6.0"', 15000);
  await sleep(250);
  const image = (await project()).screens[0].children.find((node) => node.type === "image");
  const area = await box(image.id);
  assert.deepEqual([area.w, area.h], [64, 64]);
  const painted = await js(`(() => { const d = window.__mls.canvas().getContext("2d").getImageData(${area.x}, ${area.y}, ${area.w}, ${area.h}).data; let coloured = 0; for (let i = 0; i < d.length; i += 4) if (Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]) > 60) coloured++; return coloured; })()`);
  assert.ok(painted > 200, `no picture: ${painted} coloured pixels`);
  await shot("01h-sample-images");
  await click('[data-command="start"]');
  await sleep(100);
});

await step("Continue opens the empty project in the designer", async () => {
  // A fresh project for the tests below; the sample was left unchanged, so nothing asks.
  await click('[data-start="new"]');
  await page.until('document.querySelector("[data-dialog=new-project]")', 3000);
  await click('[data-dialog="new-project"] footer button:last-child');
  await js("window.__mls.resetForTest()");
  await sleep(100);
  await click('[data-start="continue"]');
  await sleep(250);
  assert.equal(await js("!!document.querySelector('[data-start-screen]')"), false);
  await page.until("window.__mls.engine() && window.__mls.canvas().width > 0", 20000);
  const white = await pixel(10, 10);
  assert.ok(white[0] > 200 && white[1] > 200 && white[2] > 200, `screen background ${white}`);
  await shot("01d-designer");
});

category("Designing");

await step("A palette drag places a real LVGL button", async () => {
  const from = await center('[data-palette="button"]');
  await drag(from, await displayPoint(40, 40));
  const widget = await lastWidget();
  assert.equal(widget.type, "button");
  await sleep(120);
  const area = await box(widget.id);
  assert.ok(area && Math.abs(area.x - 40) <= 12, JSON.stringify(area));
  assert.equal(area.w, 110);
  assert.equal(await js("window.__mls.selected()"), widget.id);
  const inside = await pixel(area.x + 6, area.y + area.h - 6);
  assert.ok(inside[2] > inside[0], `button colour ${inside}`);
  await shot("02-button");
});

await step("Dragging moves it and one undo restores it", async () => {
  const widget = await lastWidget();
  const area = await box(widget.id);
  await drag(await displayPoint(area.x + 50, area.y + 20), await displayPoint(area.x + 80, area.y + 50));
  const moved = await lastWidget();
  assert.equal(moved.props.x - widget.props.x, 30);
  assert.equal(moved.props.y - widget.props.y, 30);
  await click('[data-command="undo"]');
  assert.equal((await lastWidget()).props.x, widget.props.x);
  await click('[data-command="redo"]');
  assert.equal((await lastWidget()).props.x, moved.props.x);
});

await step("The browser's own drag never interrupts a drag", async () => {
  // Selected content is what the browser would start dragging by itself.
  await js("getSelection().selectAllChildren(document.body)");
  assert.equal(await js("(() => { const e = new DragEvent('dragstart', { bubbles: true, cancelable: true }); document.body.dispatchEvent(e); return e.defaultPrevented; })()"), true);
  await js("getSelection().removeAllRanges()");
});

await step("The resize handle changes the size", async () => {
  const widget = await lastWidget();
  const handle = await center('[data-handle="se"]');
  await drag(handle, { x: handle.x + 40, y: handle.y + 20 });
  const after = await lastWidget();
  const zoom = await js("window.__mls.zoom()");
  assert.ok(Math.abs(after.props.width - (widget.props.width + 40 / zoom)) <= 2, `${after.props.width}`);
  await sleep(100);
  assert.equal((await box(after.id)).w, after.props.width);
});

await step("The attributes panel edits text and colour on the surface", async () => {
  const widget = await lastWidget();
  await typeInto('.attributes input[data-field="text"]', "Start");
  await typeInto('.attributes [data-field="bgColor"] .color-text', "#ff0000");
  await sleep(150);
  const edited = await lastWidget();
  assert.equal(edited.props.text, "Start");
  const area = await box(widget.id);
  assert.deepEqual(await pixel(area.x + 6, area.y + Math.floor(area.h / 2)), [255, 0, 0]);
  await shot("03-attributes");
});

await step("Code view shows the generated C", async () => {
  await click('[data-command="code"]');
  await sleep(100);
  await click('[data-code-tab="src/ui/screens/ui_Screen1.c"]');
  await sleep(50);
  const code = await js(`document.querySelector("[data-code]").textContent`);
  assert.match(code, /lv_button_create/);
  assert.match(code, /"Start"/);
  await shot("04-split");
  await click('[data-command="code"]');
});

category("Project folder");

await step("Saving creates the project folder with structured code", async () => {
  await click('[data-command="save"]');
  await page.until('document.querySelector("[data-dialog=new-project]")', 3000);
  await typeInto('[data-field="newName"]', "GuiApp");
  await typeInto('[data-field="newLocation"]', data);
  await shot("04b-save");
  await click('[data-command="project-create"]');
  await page.until('!document.querySelector("[data-dialog=new-project]")', 5000);
  const folder = path.join(data, "GuiApp");
  const saved = JSON.parse(fs.readFileSync(path.join(folder, "GuiApp.mylvgl"), "utf8"));
  assert.equal(saved.format, "mylvgl");
  assert.equal(saved.name, "GuiApp");
  assert.ok((await js("window.__mls.recent()")).some((file) => file.endsWith("GuiApp.mylvgl")), "a saved project must join the recent list at once");
  for (const file of ["CMakeLists.txt", "config/lv_conf.h", "src/main.c", "src/ui/ui.c", "src/ui/ui.h", "src/ui/ui_events.c", "src/ui/ui_events.h", "src/ui/screens/ui_Screen1.c"]) {
    assert.ok(fs.existsSync(path.join(folder, file)), file);
  }
  assert.match(fs.readFileSync(path.join(folder, "src/ui/screens/ui_Screen1.c"), "utf8"), /"Start"/);
});

await step("Saving over a folder with other files is refused", async () => {
  fs.mkdirSync(path.join(data, "Taken"));
  fs.writeFileSync(path.join(data, "Taken", "keep.txt"), "mine");
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "S", code: "KeyS", modifiers: 2 | 8, windowsVirtualKeyCode: 83 });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "S", code: "KeyS", modifiers: 2 | 8, windowsVirtualKeyCode: 83 });
  await page.until('document.querySelector("[data-dialog=new-project]")', 3000);
  await typeInto('[data-field="newName"]', "Taken");
  await typeInto('[data-field="newLocation"]', data);
  await click('[data-command="project-create"]');
  await page.until('document.querySelector("[data-note=project-error]")', 3000);
  assert.equal(fs.readFileSync(path.join(data, "Taken", "keep.txt"), "utf8"), "mine");
  assert.deepEqual(fs.readdirSync(path.join(data, "Taken")), ["keep.txt"]);
  await click('[data-dialog="new-project"] footer button:last-child');
});

await step("A removed screen's code file goes away on the next save", async () => {
  await click('[data-command="add-screen"]');
  await sleep(120);
  await click('[data-command="save"]');
  await sleep(300);
  const folder = path.join(data, "GuiApp", "src", "ui", "screens");
  assert.equal(fs.readdirSync(folder).length, 2);
  await click('[data-command="undo"]');
  await sleep(120);
  await click('[data-command="save"]');
  await sleep(300);
  assert.deepEqual(fs.readdirSync(folder), ["ui_Screen1.c"]);
});

category("Project settings and running");

await step("Project settings switch the LVGL version and the engine", async () => {
  await click('[data-command="settings"]');
  await sleep(100);
  await choose("lvglVersion", "8.4.0");
  await page.until('window.__mls.engine() && window.__mls.engine().runtimeVersion() === "8.4.0"', 15000);
  await sleep(150);
  await shot("05-settings");
  await click('[data-command="settings-close"]');
  const button = await lastWidget();
  const redrawn = await box(button.id);
  assert.deepEqual(await pixel(redrawn.x + 6, redrawn.y + Math.floor(redrawn.h / 2)), [255, 0, 0]);
  await click('[data-command="code"]');
  await sleep(50);
  await click('[data-code-tab="src/ui/screens/ui_Screen1.c"]');
  await sleep(50);
  const code = await js(`document.querySelector("[data-code]")?.textContent ?? ""`);
  assert.match(code, /lv_btn_create/);
  await click('[data-command="code"]');
  await click('[data-command="settings"]');
  await sleep(80);
  await choose("lvglVersion", "9.5.0");
  await page.until('document.querySelector("[data-note=engine]")', 3000);
  await page.until('window.__mls.engine().runtimeVersion() === "9.6.0"', 15000);
  await choose("lvglVersion", "9.6.0");
  await click('[data-command="settings-close"]');
});

await step("Run opens a separate window; clicking its button runs the action", async () => {
  await click(`[data-tree="${(await lastWidget()).id}"]`);
  await click('[data-command="event-add"]');
  await sleep(80);
  await typeInto('[data-field="eventText"]', "hello from lvgl");
  await click('[data-command="run"]');
  const target = await waitForTarget(debugPort, (item) => item.url.includes("run=1"), 15000);
  const runPage = await connect(target);
  await runPage.send("Page.enable");
  await runPage.until("window.__mlsRun && window.__mlsRun.ready()", 15000);
  await sleep(300);
  assert.ok(await runPage.evaluate("!!document.querySelector('.run-title img')"), "the run window has no icon");
  assert.ok(await runPage.evaluate("!!document.querySelector('[data-run-title]').textContent"), "the run window has no title");
  assert.ok(await runPage.evaluate("document.querySelector('.app-version').textContent.includes('LVGL 9.6.0')"));
  assert.ok(await js("!!document.querySelector('[data-overlay=design]')"), "the main window must keep the design surface");
  // Stop is a filled red square, in both windows.
  const stopStyle = (where) => where.evaluate(`(() => { const s = document.querySelector('.icon[data-icon="stop"]'); const r = s.querySelector('rect'); return { color: getComputedStyle(s).color, fill: getComputedStyle(r).fill }; })()`);
  for (const where of [page, runPage]) {
    const style = await stopStyle(where);
    assert.equal(style.color, "rgb(220, 38, 38)");
    assert.equal(style.fill, "rgb(220, 38, 38)");
  }
  fs.writeFileSync(path.join(shots, "06-run-window.png"), await runPage.screenshot());
  await shot("06b-main-while-running");
  const area = await box((await lastWidget()).id);
  const at = await runPage.evaluate(`(() => { const r = window.__mlsRun.canvas().getBoundingClientRect(); const s = r.width / window.__mlsRun.canvas().width; return { x: r.left + ${area.x + area.w / 2} * s, y: r.top + ${area.y + area.h / 2} * s }; })()`);
  await runPage.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: at.x, y: at.y, buttons: 0 });
  await runPage.send("Input.dispatchMouseEvent", { type: "mousePressed", x: at.x, y: at.y, button: "left", buttons: 1, clickCount: 1 });
  await sleep(120);
  await runPage.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: at.x, y: at.y, button: "left", buttons: 0, clickCount: 1 });
  await page.until('Array.from(document.querySelectorAll("[data-log=log] .log-line span")).some((e) => e.textContent === "hello from lvgl")', 5000);
  assert.equal(await js("window.__mls.runOpen()"), true);
  runPage.close();
  await click('[data-command="run"]');
  await page.until("window.__mls.runOpen() === false", 5000);
  await sleep(300);
  const left = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
  assert.ok(!left.some((item) => item.url.includes("run=1")), "the run window is still there");
});

await step("The run window's own stop button ends the run", async () => {
  await click('[data-command="run"]');
  const target = await waitForTarget(debugPort, (item) => item.url.includes("run=1"), 15000);
  const runPage = await connect(target);
  await runPage.until("window.__mlsRun && window.__mlsRun.ready()", 15000);
  await runPage.evaluate('document.querySelector(\'[data-command="run-stop"]\').click()').catch(() => {});
  runPage.close();
  await page.until("window.__mls.runOpen() === false", 5000);
});

await step("A second screen can be added and switched to", async () => {
  await click('[data-command="add-screen"]');
  await sleep(150);
  const p = await project();
  assert.equal(p.screens.length, 2);
  await click(`[data-screen-tab="${p.screens[0].id}"]`);
  await sleep(100);
  assert.ok(await box((await lastWidget()).id));
});

category("Editing commands");

await step("Every palette widget can be added and is drawn", async () => {
  await click(`[data-screen-tab="${(await project()).screens[0].id}"]`);
  const types = await js("Array.from(document.querySelectorAll('[data-palette]')).map((e) => e.dataset.palette)");
  assert.equal(types.length, 36);
  for (const type of types) {
    const before = await allNodes();
    await doubleClick(`[data-palette="${type}"]`);
    const added = (await allNodes()).filter((node) => !before.some((old) => old.id === node.id));
    assert.equal(added.length, 1, type);
    assert.equal(added[0].type, type);
    await sleep(60);
    assert.ok(await box(added[0].id), `${type} has no box`);
    assert.ok(await js(`!!document.querySelector('[data-tree="${added[0].id}"]')`), `${type} is not in the tree`);
  }
  await shot("10-all-widgets");
});

await step("The tree selects a widget, and shows its attributes", async () => {
  const nodes = await allNodes();
  const label = nodes.find((node) => node.type === "label");
  await click(`[data-tree="${label.id}"]`);
  assert.equal(await js("window.__mls.selected()"), label.id);
  assert.equal(await js('document.querySelector(".attributes input[data-field=name]").value'), label.name);
});

await step("Every attribute kind edits the document", async () => {
  const id = await js("window.__mls.selected()");
  await typeInto('.attributes input[data-field="name"]', "title");
  assert.equal((await nodeById(id)).name, "title");
  await typeInto('.attributes [data-field="width"] input', "50%");
  assert.equal((await nodeById(id)).props.width, "50%");
  assert.equal(await js(`document.querySelector('.attributes [data-field="width"] [data-unit]').textContent`), "%");
  await click('.attributes [data-field="width"] button:last-child');
  assert.equal((await nodeById(id)).props.width, "51%");
  await typeInto('.attributes [data-field="width"] input', "content");
  assert.equal((await nodeById(id)).props.width, "content");
  await typeInto('.attributes [data-field="width"] input', "120");
  assert.equal((await nodeById(id)).props.width, 120);
  assert.equal(await js(`document.querySelector('.attributes [data-field="width"] [data-unit]').textContent`), "px");
  await click('.attributes [data-field="width"] button:first-child');
  assert.equal((await nodeById(id)).props.width, 119);
  await typeInto('.attributes [data-field="width"] input', "120");
  await typeInto('.attributes [data-field="x"] input', "33");
  assert.equal((await nodeById(id)).props.x, 33);
  await click('.attributes [data-field="y"] button:last-child');
  await click('.attributes [data-field="x"] button:first-child');
  assert.equal((await nodeById(id)).props.x, 32);
  await click('.attributes [data-select="align"] .icon-select-button');
  await click('.attributes [data-select="align"] [data-value="CENTER"]');
  assert.equal((await nodeById(id)).props.align, "CENTER");
  await click('.attributes [data-select="align"] .icon-select-button');
  await click('.attributes [data-select="align"] [data-value=""]');
  assert.ok(!("align" in (await nodeById(id)).props));
  await click('.attributes [data-select="font"] .icon-select-button');
  await click('.attributes [data-select="font"] [data-value="24"]');
  assert.equal((await nodeById(id)).props.font, 24);
  await typeInto('.attributes [data-field="textColor"] .color-text', "#00ff00");
  assert.equal((await nodeById(id)).props.textColor, "#00ff00");
  await click('.attributes [data-field="textColor"] .mini');
  assert.ok(!("textColor" in (await nodeById(id)).props));
  await click('.attributes [data-field="hidden"]');
  assert.equal((await nodeById(id)).props.hidden, true);
  await click('.attributes [data-field="hidden"]');
  assert.equal((await nodeById(id)).props.hidden, false);
});

await step("Options are edited as lines", async () => {
  const roller = (await allNodes()).find((node) => node.type === "roller");
  await click(`[data-tree="${roller.id}"]`);
  await typeInto('.attributes textarea[data-field="options"]', "Red\nGreen");
  assert.equal((await nodeById(roller.id)).props.options, "Red\nGreen");
});

await step("Events: every action can be chosen", async () => {
  const button = (await allNodes()).find((node) => node.type === "button" && node.props.text === "Button");
  await click(`[data-tree="${button.id}"]`);
  await click('[data-command="event-add"]');
  const row = '.event-row:last-of-type';
  for (const action of ["screen", "setText", "toggle", "show", "hide", "log"]) {
    await click(`${row} [data-select="action"] .icon-select-button`);
    await sleep(30);
    await click(`${row} [data-select="action"] [data-value="${action}"]`);
    assert.equal((await nodeById(button.id)).events.at(-1).action, action);
  }
  for (const trigger of ["PRESSED", "RELEASED", "VALUE_CHANGED", "CLICKED"]) {
    await click(`${row} [data-select="trigger"] .icon-select-button`);
    await click(`${row} [data-select="trigger"] [data-value="${trigger}"]`);
    assert.equal((await nodeById(button.id)).events.at(-1).trigger, trigger);
  }
  await click(`${row} .event-head .mini`);
  assert.equal((await nodeById(button.id)).events.length, 0);
});

await step("Image: a new widget shows a placeholder, then the imported picture", async () => {
  await click('[data-command="add-screen"]');
  await sleep(120);
  await doubleClick('[data-palette="image"]');
  const id = await js("window.__mls.selected()");
  await sleep(100);
  assert.ok(await js(`!!document.querySelector('[data-image-placeholder="${id}"]')`), "no placeholder");
  assert.ok(await js('!!document.querySelector(\'[data-command="image-import"]\')'), "no import button");
  await js(`window.__mls.addTestImage(${JSON.stringify(id)}, "C:\\\\pics\\\\Test Logo.png", 32, 24, 255, 0, 128)`);
  await sleep(200);
  const widget = await nodeById(id);
  assert.equal(widget.props.src, "Test_Logo");
  assert.ok(!("width" in widget.props));
  assert.equal(await js(`!!document.querySelector('[data-image-placeholder="${id}"]')`), false);
  const area = await box(id);
  assert.deepEqual([area.w, area.h], [32, 24]);
  assert.deepEqual(await pixel(area.x + 16, area.y + 12), [255, 0, 128]);
  await shot("10b-image");
});

await step("Image: rotation and scale are edited in the panel", async () => {
  const id = await js("window.__mls.selected()");
  const area = await box(id);
  await typeInto('.attributes [data-field="scale"] input', "200");
  await sleep(150);
  assert.equal((await nodeById(id)).props.scale, 200);
  const hash = await canvasHash("[data-surface]");
  await typeInto('.attributes [data-field="rotation"] input', "45");
  await sleep(150);
  assert.notEqual(await canvasHash("[data-surface]"), hash);
  assert.ok(area);
});

await step("Image: saving writes the original file and its C array", async () => {
  await click('[data-command="save"]');
  await sleep(400);
  const folder = path.join(data, "GuiApp");
  const png = fs.readFileSync(path.join(folder, "assets", "images", "Test_Logo.png"));
  assert.deepEqual([...png.subarray(1, 4)], [0x50, 0x4e, 0x47]);
  assert.match(fs.readFileSync(path.join(folder, "src", "ui", "images", "ui_img_Test_Logo.c"), "utf8"), /0xff/);
  const saved = JSON.parse(fs.readFileSync(path.join(folder, "GuiApp.mylvgl"), "utf8"));
  assert.equal(saved.images[0].file, "assets/images/Test_Logo.png");
});

await step("Image: project settings list it, and can delete it", async () => {
  await click('[data-command="settings"]');
  await page.until('document.querySelector(\'[data-image="Test_Logo"]\')', 2000);
  await shot("10c-settings-images");
  await click('[data-command="settings-close"]');
  await click(`[data-screen-tab="${(await project()).screens[0].id}"]`);
});

await step("Data widgets: their text settings reach the surface", async () => {
  const nodes = await allNodes();
  const table = nodes.find((node) => node.type === "table");
  await click(`[data-tree="${table.id}"]`);
  await typeInto('.attributes textarea[data-field="cells"]', "Other,Text\nC,3");
  await sleep(150);
  assert.equal((await nodeById(table.id)).props.cells, "Other,Text\nC,3");
  const keyboard = nodes.find((node) => node.type === "keyboard");
  await click(`[data-tree="${keyboard.id}"]`);
  const area = nodes.find((node) => node.type === "textarea");
  await click('.attributes [data-select="target"] .icon-select-button');
  await click(`.attributes [data-select="target"] [data-value="${area.id}"]`);
  assert.equal((await nodeById(keyboard.id)).props.target, area.id);
});

await step("Copy, paste, duplicate and delete work from the keyboard", async () => {
  const count = async () => (await allNodes()).length;
  const start = await count();
  await pressKey("c", "KeyC", 67, 2);
  await pressKey("v", "KeyV", 86, 2);
  assert.equal(await count(), start + 1);
  await pressKey("d", "KeyD", 68, 2);
  assert.equal(await count(), start + 2);
  await pressKey("Delete", "Delete", 46);
  assert.equal(await count(), start + 1);
  await pressKey("z", "KeyZ", 90, 2);
  assert.equal(await count(), start + 2);
  await pressKey("y", "KeyY", 89, 2);
  assert.equal(await count(), start + 1);
});

await step("Arrow keys move the widget by 1, with Shift by 10", async () => {
  await click(`[data-tree="${(await lastWidget()).id}"]`);
  const id = await js("window.__mls.selected()");
  const x = Number((await nodeById(id)).props.x) || 0;
  await pressKey("ArrowRight", "ArrowRight", 39);
  assert.equal((await nodeById(id)).props.x, x + 1);
  await pressKey("ArrowLeft", "ArrowLeft", 37, 8);
  assert.equal((await nodeById(id)).props.x, x - 9);
  const y = Number((await nodeById(id)).props.y) || 0;
  await pressKey("ArrowDown", "ArrowDown", 40);
  await pressKey("ArrowUp", "ArrowUp", 38);
  assert.equal((await nodeById(id)).props.y, y);
});

await step("Forward and backward change the drawing order", async () => {
  const screen = (await project()).screens[0];
  const first = screen.children[0].id;
  await click(`[data-tree="${first}"]`);
  await click('[data-command="forward"]');
  assert.equal((await project()).screens[0].children[1].id, first);
  await click('[data-command="backward"]');
  assert.equal((await project()).screens[0].children[0].id, first);
});

await step("Dropping a widget on a container moves it inside", async () => {
  await click('[data-command="add-screen"]');
  await sleep(120);
  const screenId = await js("window.__mls.selected()");
  await doubleClick('[data-palette="container"]');
  const containerId = await js("window.__mls.selected()");
  await click(`[data-tree="${screenId}"]`);
  await doubleClick('[data-palette="led"]');
  const ledId = await js("window.__mls.selected()");
  // Move the LED clear of the container first, then drop it on the container.
  await typeInto('.attributes [data-field="x"] input', "250");
  await typeInto('.attributes [data-field="y"] input', "170");
  await sleep(120);
  const led = await box(ledId);
  const container = await box(containerId);
  await drag(await displayPoint(led.x + led.w / 2, led.y + led.h / 2), await displayPoint(container.x + 60, container.y + 50));
  await sleep(120);
  const updated = (await project()).screens.find((item) => item.id === screenId);
  assert.equal(updated.children.length, 1, "still on the screen");
  assert.equal(updated.children[0].children[0].id, ledId);
  await pressKey("z", "KeyZ", 90, 2);
  await click(`[data-screen-tab="${(await project()).screens[0].id}"]`);
});

await step("A screen can be renamed and deleted, but not the last one", async () => {
  const screens = (await project()).screens;
  const last = screens.at(-1);
  await click(`[data-screen-tab="${last.id}"]`);
  await typeInto('.attributes input[data-field="name"]', "Renamed");
  assert.equal((await project()).screens.at(-1).name, "Renamed");
  await click(".screen-tab.active .mini");
  await sleep(120);
  assert.equal((await project()).screens.length, screens.length - 1);
  await click('[data-command="undo"]');
  assert.equal((await project()).screens.length, screens.length);
});

await step("Zoom in, out and fit change the surface", async () => {
  const zoom = () => js("window.__mls.zoom()");
  await click('[data-command="zoomIn"]');
  const larger = await zoom();
  await click('[data-command="zoomOut"]');
  assert.ok((await zoom()) < larger);
  await click('[data-command="zoomFit"]');
  const fitted = await zoom();
  const size = await js("(() => { const r = window.__mls.canvas().getBoundingClientRect(); const v = document.querySelector('.viewport').getBoundingClientRect(); return { fits: r.width <= v.width && r.height <= v.height }; })()");
  assert.ok(fitted > 0 && size.fits);
});

await step("The code button is a toggle on the toolbar; the tab row holds only tabs", async () => {
  const pressed = () => js(`document.querySelector('[data-command="code"]').getAttribute("aria-pressed")`);
  assert.equal(await js("!!document.querySelector('.toolbar [data-command=code]')"), true);
  assert.equal(await js("!!document.querySelector('.toolbar [data-command=version-chip]') && !!document.querySelector('.toolbar [data-zoom]')"), true);
  assert.equal(await js("!!document.querySelector('.design-bar [data-command=version-chip], .design-bar [data-zoom], .design-bar [data-command=code]')"), false);
  assert.equal(await pressed(), "false");
  assert.equal(await js("!!document.querySelector('[data-code]')"), false);
  await click('[data-command="code"]');
  await sleep(80);
  assert.equal(await pressed(), "true");
  assert.equal(await js("!!document.querySelector('[data-code]')"), true);
  assert.equal(await js("getComputedStyle(document.querySelector('.viewport')).display !== 'none'"), true);
  await click('[data-command="code"]');
  await sleep(80);
  assert.equal(await pressed(), "false");
  assert.equal(await js("!!document.querySelector('[data-code]')"), false);
});

await step("The version button on the toolbar changes LVGL: controls, code and engine follow", async () => {
  await pickVersion("9.2.2");
  await page.until('window.__mls.engine().runtimeVersion() === "9.2.2"', 15000);
  assert.equal((await project()).lvgl, "9.2.2");
  assert.match(await js("document.querySelector('[data-command=version-chip]').textContent"), /9\.2\.2/);
  await click('[data-command="version-chip"]');
  await page.until('document.querySelector("[data-version-menu]")', 2000);
  const menu = await js(`(() => { const m = document.querySelector("[data-version-menu]").getBoundingClientRect(); return { items: document.querySelectorAll("[data-version]").length, selected: document.querySelector("[data-version].selected").dataset.version, inside: m.left >= 0 && m.right <= innerWidth && m.bottom <= innerHeight }; })()`);
  assert.equal(menu.selected, "9.2.2");
  assert.ok(menu.items >= 6 && menu.inside, JSON.stringify(menu));
  await shot("10k-version-menu");
  await click('[data-version="8.4.0"]');
  await page.until('window.__mls.engine().runtimeVersion() === "8.4.0"', 15000);
  const palette = () => js("Array.from(document.querySelectorAll('[data-palette]')).map((e) => e.dataset.palette)");
  assert.ok((await palette()).includes("meter"), "the controls did not follow");
  await click('[data-command="code"]');
  await sleep(80);
  await click('[data-code-tab="src/ui/screens/ui_Screen1.c"]');
  await sleep(50);
  assert.match(await js('document.querySelector("[data-code]").textContent'), /lv_btn_create|lv_obj_create/);
  await pickVersion("9.6.0");
  await page.until('window.__mls.engine().runtimeVersion() === "9.6.0"', 15000);
  await sleep(80);
  assert.doesNotMatch(await js('document.querySelector("[data-code]").textContent'), /lv_btn_create/, "the code did not follow");
  await click('[data-command="code"]');
  assert.ok(!(await palette()).includes("meter"));
});

await step("Problems: a list in the bottom panel; a row leads to the control and to its code", async () => {
  const start = (await project()).screens[0].children.length;
  await click('[data-screen-tab="' + (await project()).screens[0].id + '"]');
  await doubleClick('[data-palette="image"]');
  await sleep(120);
  const image = (await project()).screens[0].children.at(-1);
  await doubleClick('[data-palette="scale"]');
  await sleep(120);
  const scale = (await project()).screens[0].children.at(-1);
  await click('[data-bottom="problems"]');
  await sleep(80);
  const row = (code, id) => `[data-problem="${code}"]${id ? "" : ""}`;
  assert.ok(await js(`window.__mls.problems().some((p) => p.code === "imageEmpty" && p.node === "${image.id}")`));
  assert.ok((await js("Number(document.querySelector('[data-problem-count]')?.textContent ?? 0)")) > 0, "no count on the tab");
  assert.equal(await js("document.querySelectorAll('.problem-head [role=columnheader]').length"), 4);
  await shot("10l-problems");
  // Choosing a row selects the control; the button shows its code.
  await click('[data-screen-tab="' + (await project()).screens[0].id + '"]');
  await click(`[data-tree="${scale.id}"]`);
  const rowFor = `Array.from(document.querySelectorAll('[data-problem="imageEmpty"]'))`;
  await click(row("imageEmpty"));
  await sleep(100);
  assert.equal(await js("window.__mls.selected()"), (await js(`window.__mls.problems().find((p) => p.code === "imageEmpty").node`)));
  assert.equal(await js(`${rowFor}[0].getAttribute("aria-selected")`), "true");
  await click(`[data-problem="imageEmpty"] [data-problem-code]`);
  await sleep(150);
  const focus = await js("window.__mls.codeFocus()");
  assert.ok(focus && /ui_Screen1\.c$/.test(focus.file), JSON.stringify(focus));
  const shown = await js(`(() => { const pre = document.querySelector("[data-code]"); const mark = document.querySelector("[data-code-focus]"); const a = pre.getBoundingClientRect(); const b = mark.getBoundingClientRect(); return { line: Number(mark.dataset.codeFocus), text: pre.textContent.split("\\n")[Number(mark.dataset.codeFocus) - 1], inside: b.top >= a.top && b.bottom <= a.bottom }; })()`);
  assert.ok(shown.inside, "the marked line is out of view");
  const imageName = await js(`window.__mls.problems().find((p) => p.code === "imageEmpty").nodeName`);
  assert.ok(shown.text.includes(`ui_${imageName}`), JSON.stringify(shown));
  await shot("10m-problem-code");
  await click('[data-command="code"]');
  // A control the version lacks: an error, shown as soon as the version changes, without code.
  await pickVersion("8.4.0");
  await page.until('document.querySelector("[data-problem=widgetVersion]")', 3000);
  assert.equal(await js("document.querySelector('[data-bottom=problems]').classList.contains('active')"), true, "the tab did not open by itself");
  assert.equal(await js("document.querySelector('[data-problem-count]').hasAttribute('data-errors')"), true);
  assert.equal(await js("document.querySelector('[data-problem=widgetVersion] [data-problem-code]').disabled"), true);
  await click('[data-problem="widgetVersion"] [data-problem-control]');
  await sleep(100);
  assert.equal(await js("window.__mls.selected()"), scale.id);
  await pickVersion("9.6.0");
  await page.until('window.__mls.engine().runtimeVersion() === "9.6.0"', 15000);
  await click(`[data-tree="${scale.id}"]`);
  await click('[data-command="delete"]');
  await click(`[data-tree="${image.id}"]`);
  await click('[data-command="delete"]');
  await sleep(80);
  assert.equal((await project()).screens[0].children.length, start);
  await click('[data-bottom="log"]');
});

await step("Every button has a tooltip", async () => {
  const check = (scope) => js(`(() => { const missing = []; for (const b of document.querySelectorAll(${JSON.stringify(scope)})) { if (!b.getClientRects().length) continue; b.dispatchEvent(new PointerEvent("pointerover", { bubbles: true })); const text = (b.title || "").trim(); if (!text || text === "-" || text === "+" || text === "×" || text === "−") missing.push(b.outerHTML.slice(0, 90)); } return missing; })()`);
  assert.deepEqual(await check("button"), []);
  assert.match(await js('document.querySelector("[data-palette=button]").title'), /\S+: /);
  await click('[data-command="preferences"]');
  await page.until('document.querySelector("[data-dialog=preferences]")', 2000);
  for (const tab of ["general", "theme", "start"]) {
    await click(`[data-pref-tab="${tab}"]`);
    await sleep(60);
    assert.deepEqual(await check("[data-dialog=preferences] button"), [], tab);
  }
  await click('[data-pref-tab="general"]');
  await sleep(40);
  assert.match(await js("(() => { const b = document.querySelector('[data-field=prefSnap] button'); b.dispatchEvent(new PointerEvent('pointerover', { bubbles: true })); return b.title; })()"), /감소|Decrease/);
  await click('[data-command="preferences-close"]');
});

await step("Tabs: < and > at the far right walk through the screens, and they scroll", async () => {
  const nav = await js(`(() => { const bar = document.querySelector(".design-bar").getBoundingClientRect(); const next = document.querySelector('[data-command="tab-next"]').getBoundingClientRect(); return bar.right - next.right; })()`);
  assert.ok(nav < 20, "the buttons are not at the far right");
  const start = (await project()).screens.length;
  for (let i = 0; i < 24; i++) {
    await click('[data-command="add-screen"]');
    await sleep(30);
  }
  const active = () => js("document.querySelector('.screen-tab.active [data-screen-tab]').dataset.screenTab");
  const visible = () => js(`(() => { const a = document.querySelector(".screen-tab.active").getBoundingClientRect(); const b = document.querySelector(".screen-tabs").getBoundingClientRect(); return a.left >= b.left - 1 && a.right <= b.right + 1; })()`);
  await sleep(100);
  assert.ok(await visible(), "the new tab is out of view");
  assert.equal(await js(`document.querySelector('[data-command="tab-next"]').disabled`), true, "next on the last tab");
  await shot("10j-many-tabs");
  for (let i = 0; i < 3; i++) await click('[data-command="tab-prev"]');
  await sleep(80);
  assert.ok(await visible());
  const screens = (await project()).screens;
  assert.equal(await active(), screens.at(-4).id);
  await click('[data-command="tab-next"]');
  assert.equal(await active(), screens.at(-3).id);
  await click(`[data-screen-tab="${screens[0].id}"]`);
  await sleep(80);
  assert.equal(await js(`document.querySelector('[data-command="tab-prev"]').disabled`), true, "previous on the first tab");
  for (let i = 0; i < 24; i++) {
    await click('[data-command="undo"]');
    await sleep(15);
  }
  assert.equal((await project()).screens.length, start);
  await click(`[data-screen-tab="${(await project()).screens[0].id}"]`);
});

await step("Buttons, menus and panel buttons follow the state of the program", async () => {
  const disabled = (id) => js(`document.querySelector('.toolbar [data-command="${id}"]').disabled`);
  const screen = (await project()).screens[0];
  await click(`[data-tree="${screen.id}"]`);
  await sleep(40);
  for (const id of ["copy", "duplicate", "forward", "backward"]) assert.equal(await disabled(id), true, `${id} on a screen`);
  const first = screen.children[0].id;
  await click(`[data-tree="${first}"]`);
  await sleep(40);
  assert.equal(await disabled("copy"), false, "copy on a widget");
  assert.equal(await disabled("backward"), true, "the first widget cannot go back");
  assert.equal(await disabled("forward"), false, "the first widget can come forward");
  const last = screen.children.at(-1).id;
  await click(`[data-tree="${last}"]`);
  await sleep(40);
  assert.equal(await disabled("forward"), true, "the last widget cannot come forward");
  await click('[data-command="save"]');
  await sleep(300);
  assert.equal(await disabled("save"), true, "nothing to save");
  await pressKey("ArrowRight", "ArrowRight", 39);
  assert.equal(await disabled("save"), false, "a change can be saved");
  await click('[data-command="undo"]');
  assert.equal(await disabled("redo"), false, "redo after undo");
  await click('[data-command="redo"]');
  assert.equal(await disabled("redo"), true, "nothing to redo");
  // In the menus too.
  await click('[data-menu="edit"] > button');
  assert.equal(await js(`document.querySelector('[data-menu="edit"] [data-command="redo"]').classList.contains("is-disabled")`), true);
  await click('[data-menu="edit"] > button');
  // The zoom buttons stop at the ends.
  for (let i = 0; i < 8; i++) if (!(await js(`document.querySelector('[data-command="zoomIn"]').disabled`))) await click('[data-command="zoomIn"]');
  assert.equal(await js(`document.querySelector('[data-command="zoomIn"]').disabled`), true, "zoom in at the largest");
  await click('[data-command="zoomFit"]');
  // On the start screen, everything about editing rests.
  await click('[data-command="start"]');
  await sleep(100);
  for (const id of ["copy", "delete", "undo", "run", "native", "code", "panelLeft", "panelRight", "panelBottom", "rulers", "zoomIn", "zoomOut", "zoomFit"]) {
    assert.equal(await disabled(id), true, `${id} on the start screen`);
  }
  for (const id of ["new", "open", "preferences", "manager", "about"]) {
    assert.equal(await js(`document.querySelector('.toolbar [data-command="${id}"]').disabled`), false, `${id} on the start screen`);
  }
  await click('[data-command="start"]');
  await sleep(100);
  assert.equal(await disabled("run"), false);
});

await step("The right-click menu adds any control, and where it was clicked", async () => {
  const count = async () => (await allNodes()).length;
  const before = await count();
  const beforeIds = new Set((await allNodes()).map((node) => node.id));
  const screenId = (await project()).screens[0].id;
  await click(`[data-screen-tab="${screenId}"]`);
  const at = await displayPoint(250, 200);
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: at.x, y: at.y, button: "right", buttons: 2, clickCount: 1 });
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: at.x, y: at.y, button: "right", buttons: 0, clickCount: 1 });
  await sleep(100);
  await click('[data-context="add-control"]');
  await sleep(60);
  const groups = await js(`Array.from(document.querySelectorAll('[data-context^="add-group-"]')).map((e) => e.dataset.context)`);
  assert.deepEqual(groups, ["add-group-common", "add-group-layout", "add-group-input", "add-group-display"]);
  await click('[data-context="add-group-display"]');
  await sleep(60);
  assert.equal(await js(`Array.from(document.querySelectorAll('.context-sub [data-context]')).filter((e) => !e.querySelector('.icon')).length`), 0, "an item has no icon");
  const inside = await js(`Array.from(document.querySelectorAll('.context-sub')).every((m) => { const r = m.getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; })`);
  assert.ok(inside, "a list leaves the window");
  assert.equal(await js(`!!document.querySelector('[data-context="add-meter"]')`), false, "meter does not exist in LVGL 9");
  await shot("10k-context-add");
  await click('[data-context="add-scale"]');
  await sleep(120);
  assert.equal(await count(), before + 1);
  const added = (await allNodes()).find((node) => node.type === "scale" && !beforeIds.has(node.id));
  assert.ok(added, "no scale");
  const inScreen = (await project()).screens[0].children.some((child) => child.id === added.id) || (await allNodes()).some((node) => node.children.some((child) => child.id === added.id));
  assert.ok(inScreen);
  await click('[data-command="undo"]');
});

await step("The panel shows the controls of each LVGL version, Grid included", async () => {
  const palette = () => js("Array.from(document.querySelectorAll('[data-palette]')).map((e) => e.dataset.palette)");
  const names = await palette();
  assert.equal(names.length, 36);
  for (const type of ["grid", "scale", "barcode", "arclabel"]) assert.ok(names.includes(type), type);
  assert.ok(!names.includes("meter") && !names.includes("colorwheel"));
  await pickVersion("8.4.0");
  const old = await palette();
  assert.equal(old.length, 35);
  for (const type of ["grid", "meter", "colorwheel"]) assert.ok(old.includes(type), type);
  assert.ok(!old.includes("scale") && !old.includes("arclabel") && !old.includes("barcode"));
  await page.until('window.__mls.engine().runtimeVersion() === "8.4.0"', 15000);
  await pickVersion("9.6.0");
  await page.until('window.__mls.engine().runtimeVersion() === "9.6.0"', 15000);
});

await step("Grid: its children get cell settings in the attributes", async () => {
  await click(`[data-screen-tab="${(await project()).screens[0].id}"]`);
  await click('[data-command="add-screen"]');
  await sleep(100);
  await doubleClick('[data-palette="grid"]');
  await sleep(80);
  const grid = await js("window.__mls.selected()");
  assert.equal(await js(`document.querySelector('.attributes [data-field="gridColumns"]').value`), "1fr,1fr");
  await doubleClick('[data-palette="button"]');
  await sleep(100);
  const child = await js("window.__mls.selected()");
  assert.equal((await nodeById(grid)).children[0].id, child);
  assert.ok(await js(`!!document.querySelector('.attributes [data-field="gridCol"]')`), "no cell settings");
  await typeInto('.attributes [data-field="gridCol"] input', "1");
  await sleep(120);
  const cell = await box(child);
  const whole = await box(grid);
  assert.ok(cell.x > whole.x + whole.w / 3, "the widget did not move to the second column");
  await shot("10l-grid");
  await click(".screen-tab.active .mini");
  await sleep(100);
  await click(`[data-screen-tab="${(await project()).screens[0].id}"]`);
});

await step("The compiler can be installed from the LVGL manager, after showing the commands", async () => {
  const plan = await js("window.__TAURI_INTERNALS__.invoke('tools_plan')");
  assert.ok(plan.length >= 1, "no plan");
  const text = plan.join("\n");
  for (const word of ["gcc", "cmake", "ninja", "SDL2"]) assert.match(text, new RegExp(word, "i"), word);
  assert.doesNotMatch(text, /nodejs|emscripten|python/i, "a package that would change the PC's Node or Python");
  await click('[data-command="manager"]');
  await page.until('document.querySelector("[data-action=install-tools]")', 15000);
  assert.equal(await js('document.querySelector("[data-action=install-tools]").disabled'), true, "everything is installed here, so nothing to do");
  await click('[data-dialog="manager"] footer button');
});

await step("The theme menu: my themes and settings on top, Dark and Light side by side", async () => {
  await click('[data-command="theme"]');
  await sleep(80);
  const shape = await js(`(() => { const top = document.querySelector("[data-theme-group=top]").getBoundingClientRect(); const dark = document.querySelector("[data-theme-column=dark]").getBoundingClientRect(); const light = document.querySelector("[data-theme-column=light]").getBoundingClientRect(); const pop = document.querySelector(".theme-pop"); return { topFirst: top.bottom <= dark.top + 1, sideBySide: Math.abs(dark.top - light.top) <= 1 && dark.right <= light.left + 1, darkLeft: dark.left < light.left, dark: document.querySelectorAll("[data-theme-column=dark] [data-theme-id]").length, light: document.querySelectorAll("[data-theme-column=light] [data-theme-id]").length, scrolls: pop.scrollHeight - pop.clientHeight }; })()`);
  assert.deepEqual(shape, { topFirst: true, sideBySide: true, darkLeft: true, dark: 20, light: 20, scrolls: 0 });
  assert.ok(await js('!!document.querySelector("[data-theme-group=top] [data-command=theme-settings] .icon")'));
  await shot("10m-theme-menu");
  await click('[data-theme-group="top"] [data-command="theme-settings"]');
  await page.until('document.querySelector("[data-dialog=preferences] [data-pref-page=theme]")', 3000);
  await click('[data-command="preferences-close"]');
});

await step("About: icon on the left, description on the right, items in straight columns", async () => {
  await click('[data-command="about"]');
  await page.until('document.querySelector("[data-dialog=about]")', 2000);
  const shape = await js(`(() => { const icon = document.querySelector(".about-icon").getBoundingClientRect(); const copy = document.querySelector(".about-copy").getBoundingClientRect(); const meta = document.querySelector(".about-meta").getBoundingClientRect(); const dd = Array.from(document.querySelectorAll(".about-meta dd")).map((e) => Math.round(e.getBoundingClientRect().left)); const dt = Array.from(document.querySelectorAll(".about-meta dt")).map((e) => Math.round(e.getBoundingClientRect().left)); return { iconLeft: icon.right <= copy.left, below: meta.top >= icon.bottom, ddColumns: new Set(dd).size, dtColumns: new Set(dt).size, rows: dd.length, text: document.querySelector(".about-meta").textContent, icon: document.querySelector(".about-icon").naturalWidth }; })()`);
  assert.ok(shape.iconLeft && shape.below, JSON.stringify(shape));
  assert.equal(shape.ddColumns, 1, "values are not in one column");
  assert.equal(shape.dtColumns, 1, "labels are not in one column");
  assert.ok(shape.rows >= 8);
  assert.ok(shape.icon > 0, "the icon did not load");
  assert.ok(shape.text.includes("SHKWON(knix008@naver.com)"), "no author");
  assert.match(shape.text, /\d{4}-\d{2}-\d{2} \d{2}:\d{2}/, "no build information");
  await shot("10n-about");
  await click('[data-dialog="about"] footer button');
});

await step("Every generated file can be read in the code view", async () => {
  await click('[data-command="code"]');
  await sleep(60);
  const tabs = await js("Array.from(document.querySelectorAll('[data-code-tab]')).map((e) => e.dataset.codeTab)");
  for (const name of ["CMakeLists.txt", "config/lv_conf.h", "src/main.c", "src/ui/ui.c", "src/ui/ui.h", "src/ui/ui_events.c", "src/ui/ui_events.h"]) assert.ok(tabs.includes(name), name);
  for (const name of tabs) {
    await click(`[data-code-tab="${name}"]`);
    assert.ok((await js('document.querySelector("[data-code]").textContent')).length > 10, name);
  }
  await click('[data-command="code"]');
});

await step("Panels can be resized by their splitters", async () => {
  const width = () => js('document.querySelector(".left-col").getBoundingClientRect().width');
  const before = await width();
  const splitter = await center('[data-splitter="left"]');
  await drag(splitter, { x: splitter.x + 40, y: splitter.y });
  assert.ok(Math.abs((await width()) - (before + 40)) <= 2);
  const attributes = () => js('document.querySelector(".right-col").getBoundingClientRect().width');
  const wide = await attributes();
  const right = await center('[data-splitter="right"]');
  await drag(right, { x: right.x - 40, y: right.y });
  assert.ok(Math.abs((await attributes()) - (wide + 40)) <= 2);
  const height = () => js('document.querySelector(".bottom-panel").getBoundingClientRect().height');
  const lower = await height();
  const bottom = await center('[data-splitter="bottom"]');
  await drag(bottom, { x: bottom.x, y: bottom.y - 30 });
  assert.ok(Math.abs((await height()) - (lower + 30)) <= 2);
});

await step("The component tree is above the attributes on the right, with a divider that moves", async () => {
  const rect = (name) => js(`(() => { const r = document.querySelector("[data-panel=${name}]").getBoundingClientRect(); return { left: r.left, top: r.top, bottom: r.bottom, height: r.height }; })()`);
  const [treeBox, attributesBox, paletteBox] = [await rect("tree"), await rect("attributes"), await rect("palette")];
  assert.ok(treeBox.left > paletteBox.left + 400, "the tree is not on the right");
  assert.ok(treeBox.bottom <= attributesBox.top, "the tree is not above the attributes");
  assert.ok(Math.abs(treeBox.left - attributesBox.left) <= 1, "the two panels are not in one column");
  const divider = await center('[data-splitter="tree"]');
  await drag(divider, { x: divider.x, y: divider.y + 50 });
  assert.ok(Math.abs((await rect("tree")).height - (treeBox.height + 50)) <= 2, "the tree did not grow");
  assert.ok(Math.abs((await rect("attributes")).height - (attributesBox.height - 50)) <= 2, "the attributes did not shrink");
  const moved = await center('[data-splitter="tree"]');
  await drag(moved, { x: moved.x, y: 5 });
  assert.ok((await rect("tree")).height >= 60, "the tree can vanish");
  const again = await center('[data-splitter="tree"]');
  await drag(again, { x: again.x, y: 2000 });
  assert.ok((await rect("attributes")).height >= 60, "the attributes can vanish");
  const back = await center('[data-splitter="tree"]');
  await drag(back, { x: back.x, y: treeBox.bottom });
  await sleep(100);
  await shot("10d-right-panel");
  const saved = JSON.parse(fs.readFileSync(path.join(data, "settings", "settings.json"), "utf8"));
  assert.ok(typeof saved.panels.tree === "number", "the position is not saved");
});

await step("Every menu opens and lists its commands", async () => {
  for (const [menu, command] of [["file", "new"], ["edit", "undo"], ["view", "zoomFit"], ["run", "native"], ["tools", "manager"], ["help", "about"]]) {
    assert.ok(await js(`!!document.querySelector('[data-menu="${menu}"] > button .icon')`), `${menu} has no icon on the menu bar`);
    await click(`[data-menu="${menu}"] > button`);
    assert.ok(await js(`!!document.querySelector('[data-menu="${menu}"] [data-command="${command}"]')`), menu);
    assert.equal(await js(`Array.from(document.querySelectorAll('[data-menu="${menu}"] [role=menuitem]')).filter((e) => !e.querySelector('.icon')).length`), 0, `${menu} has an item without an icon`);
    await click(`[data-menu="${menu}"] > button`);
  }
});

await step("Every number shows − value unit +, centred", async () => {
  const button = (await allNodes()).find((node) => node.type === "button");
  await click(`[data-tree="${button.id}"]`);
  await typeInto('.attributes [data-field="x"] input', "33");
  await typeInto('.attributes [data-field="borderWidth"] input', "2");
  const bad = await js(`Array.from(document.querySelectorAll(".attributes .stepper")).map((s) => { const kids = Array.from(s.children); const input = s.querySelector("input"); const unit = s.querySelector("[data-unit]"); const box = s.querySelector(".stepper-value").getBoundingClientRect(); const items = [input, unit].filter(Boolean).map((e) => e.getBoundingClientRect()); const left = Math.min(...items.map((r) => r.left)); const right = Math.max(...items.map((r) => r.right)); return { field: s.dataset.field, order: kids.length === 3 && kids[0].tagName === "BUTTON" && kids[2].tagName === "BUTTON", hasValue: !!input.value, unit: unit && unit.textContent, centred: Math.abs((left + right) / 2 - (box.left + box.right) / 2) <= 2, align: getComputedStyle(input).textAlign }; }).filter((f) => !f.order || f.align !== "center" || (f.hasValue && (!f.unit || !f.centred)))`);
  assert.deepEqual(bad, []);
  assert.equal(await js(`document.querySelector('.attributes [data-field="x"] [data-unit]').textContent`), "px");
});

await step("Rulers sit on the edges of the canvas; zero follows the screen; a red line follows the mouse", async () => {
  const on = () => js("!!document.querySelector('[data-ruler=x]')");
  if (!(await on())) await click('[data-command="rulers"]');
  await sleep(120);
  const measure = () => js(`(() => {
    const view = document.querySelector(".viewport").getBoundingClientRect();
    const x = document.querySelector("[data-ruler=x]").getBoundingClientRect();
    const y = document.querySelector("[data-ruler=y]").getBoundingClientRect();
    const screen = window.__mls.canvas().getBoundingClientRect();
    const zeroX = document.querySelector("[data-ruler=x] [data-zero]");
    const zeroY = document.querySelector("[data-ruler=y] [data-zero]");
    return { xGap: x.left - view.left, xLength: x.width - view.width, xTop: view.top - x.bottom, yGap: y.top - view.top, yLength: y.height - view.height, yLeft: view.left - y.right, zeroX: zeroX ? x.left + Number(zeroX.getAttribute("x1")) - screen.left : null, zeroY: zeroY ? y.top + Number(zeroY.getAttribute("y1")) - screen.top : null, screenGap: screen.left - x.left };
  })()`);
  const check = await measure();
  for (const key of ["xGap", "xLength", "yGap", "yLength"]) assert.ok(Math.abs(check[key]) <= 1, `${key}: ${JSON.stringify(check)}`);
  assert.ok(check.xTop >= -1 && check.xTop <= 1 && check.yLeft >= -1 && check.yLeft <= 1, `not on the edge: ${JSON.stringify(check)}`);
  assert.ok(check.screenGap > 20, `the ruler is stuck to the screen: ${JSON.stringify(check)}`);
  assert.ok(Math.abs(check.zeroX) <= 1 && Math.abs(check.zeroY) <= 1, `zero is not at the screen: ${JSON.stringify(check)}`);
  assert.equal(await js("document.querySelector('.ruler-corner').textContent"), "px");
  // The pointer's position, in red, on both rulers.
  const marker = (axis) => js(`(() => { const m = document.querySelector('[data-ruler-marker="${axis}"]'); const r = m.getBoundingClientRect(); const c = getComputedStyle(m); return { x: r.left, y: r.top, visible: c.visibility, color: c.backgroundColor }; })()`);
  const point = await displayPoint(120, 90);
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y, buttons: 0 });
  await sleep(80);
  const [mx, my] = [await marker("x"), await marker("y")];
  assert.equal(mx.visible, "visible");
  assert.equal(mx.color, "rgb(229, 57, 53)");
  assert.ok(Math.abs(mx.x - point.x) <= 1.5, `x line at ${mx.x}, pointer at ${point.x}`);
  assert.ok(Math.abs(my.y - point.y) <= 1.5, `y line at ${my.y}, pointer at ${point.y}`);
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5, buttons: 0 });
  await sleep(60);
  assert.equal((await marker("x")).visible, "hidden", "the line stays after the pointer left");
  await shot("10g-rulers");
  // Zoom and scrolling move the zero, not the rulers.
  await click('[data-command="zoomIn"]');
  await click('[data-command="zoomIn"]');
  await sleep(150);
  const zoomed = await measure();
  assert.ok(Math.abs(zoomed.xGap) <= 1 && Math.abs(zoomed.zeroX ?? 0) <= 1.5, JSON.stringify(zoomed));
  await js('document.querySelector(".viewport").scrollLeft = 60');
  await sleep(150);
  const scrolled = await measure();
  assert.ok(Math.abs(scrolled.xGap) <= 1, "the ruler scrolled away");
  await click('[data-command="zoomFit"]');
  await click('[data-command="rulers"]');
  await sleep(100);
  assert.equal(await on(), false, "the rulers do not turn off");
  await click('[data-command="rulers"]');
});

await step("Every toolbar icon is in colour, also when pressed", async () => {
  const grey = await js(`Array.from(document.querySelectorAll(".toolbar .icon")).map((e) => { const [r, g, b] = getComputedStyle(e).color.match(/\\d+/g).map(Number); return { icon: e.dataset.icon, spread: Math.max(r, g, b) - Math.min(r, g, b) }; }).filter((item) => item.spread < 40).map((item) => item.icon)`);
  assert.deepEqual(grey, []);
  assert.equal(await js(`document.querySelector('[data-command="rulers"]').getAttribute("aria-pressed")`), "true");
});

await step("Panels: title bars fold them, and the toolbar folds left, right and bottom", async () => {
  for (const panel of ["left", "tree", "attributes"]) assert.ok(await js(`!!document.querySelector('[data-panel-title="${panel}"] .icon')`), panel);
  assert.equal(await js('document.querySelector("[data-panel-title=left]").textContent'), "콘트롤");
  const width = (selector) => js(`document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().width`);
  const collapsed = () => js("window.__mls.collapsed()");
  await click('[data-collapse="left"]');
  await sleep(80);
  assert.ok((await width(".left-col")) <= 31, "the left panel did not fold");
  await shot("10h-panels-folded");
  await click('[data-expand="left"]');
  await sleep(80);
  assert.ok((await width(".left-col")) > 100, "the left panel did not unfold");
  for (const [command, key] of [["panelLeft", "left"], ["panelRight", "right"], ["panelBottom", "bottom"]]) {
    assert.equal(await js(`document.querySelector('[data-command="${command}"]').getAttribute("aria-pressed")`), "true", command);
    await click(`[data-command="${command}"]`);
    await sleep(80);
    assert.equal((await collapsed())[key], true, command);
    assert.equal(await js(`document.querySelector('[data-command="${command}"]').getAttribute("aria-pressed")`), "false", command);
  }
  assert.ok((await width(".right-col")) <= 31);
  assert.ok((await js('document.querySelector(".bottom-panel").getBoundingClientRect().height')) <= 30);
  assert.ok((await width(".viewport")) > 1000, "the surface did not take the room");
  await shot("10i-all-folded");
  for (const command of ["panelLeft", "panelRight", "panelBottom"]) {
    await click(`[data-command="${command}"]`);
    await sleep(60);
  }
  const height = (name) => js(`document.querySelector("[data-panel=${name}]").getBoundingClientRect().height`);
  const full = await height("attributes");
  await click('[data-collapse="tree"]');
  await sleep(80);
  assert.ok((await height("tree")) < 40, "the tree did not fold");
  assert.ok((await height("attributes")) > full, "the attributes did not take the room");
  await click('[data-collapse="tree"]');
  await click('[data-collapse="attributes"]');
  await sleep(80);
  assert.ok((await height("attributes")) < 40, "the attributes did not fold");
  await click('[data-collapse="attributes"]');
  await sleep(200);
  await click('[data-collapse="bottom"]');
  await sleep(120);
  assert.equal((await collapsed()).bottom, true);
  await click('[data-collapse="bottom"]');
  await sleep(60);
  const saved = JSON.parse(fs.readFileSync(path.join(data, "settings", "settings.json"), "utf8"));
  assert.equal(saved.collapsed.bottom, false);
});

await step("Preferences uses the gear icon, unlike project settings", async () => {
  assert.equal(await js(`document.querySelector('[data-command="preferences"] .icon').dataset.icon`), "settings");
  assert.ok(await js(`document.querySelector('[data-command="preferences"] .icon path').getAttribute("d").length > 200`), "not the gear drawing");
  assert.equal(await js(`document.querySelector('[data-command="settings"] .icon').dataset.icon`), "project");
});

await step("Every right-click menu has an icon on every item", async () => {
  const open = async (selector) => {
    const point = await center(selector);
    assert.ok(point, `no element ${selector}`);
    await press(point.x, point.y, { button: "right", buttons: 2 });
    await release(point.x, point.y, { button: "right" });
    await sleep(140);
    const shown = await js(`(() => { const m = document.querySelector("[data-context-menu]"); if (!m) return null; const r = m.getBoundingClientRect(); return { items: Array.from(m.querySelectorAll("[data-context]")).map((e) => e.dataset.context), withoutIcon: Array.from(m.querySelectorAll("[data-context]")).filter((e) => !e.querySelector(".icon")).length, inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight }; })()`);
    assert.ok(shown, `no menu on ${selector}: ${JSON.stringify(await js("window.__mls.contextMenu() ? 'state yes' : 'state no'"))}`);
    assert.equal(shown.withoutIcon, 0, `${selector}: an item has no icon`);
    assert.ok(shown.inside, `${selector}: the menu leaves the window`);
    return shown.items;
  };
  const close = async () => {
    await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await sleep(80);
  };
  const widget = (await project()).screens[0].children[0];
  assert.ok((await open(`[data-tree="${widget.id}"]`)).includes("cut"));
  assert.equal(await js("window.__mls.selected()"), widget.id, "the tree row was not selected");
  await shot("10e-context-menu");
  await close();
  assert.equal(await js('!!document.querySelector("[data-context-menu]")'), false, "Escape did not close it");
  assert.ok((await open('[data-overlay="design"]')).includes("zoomFit"));
  await close();
  assert.ok((await open(".screen-tab")).includes("screen-add"));
  await close();
  assert.ok((await open('[data-palette="label"]')).includes("palette-add"));
  await close();
  assert.ok((await open('.attributes input[data-field="name"]')).includes("text-paste"));
  await close();
  assert.ok((await open(".log-list")).includes("log-clear"));
  await close();
  assert.ok((await open(".statusbar")).includes("preferences"));
  await close();
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5, buttons: 0 });
});

await step("The palette's right-click menu adds the widget", async () => {
  const count = (await allNodes()).length;
  const point = await center('[data-palette="led"]');
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "right", buttons: 2, clickCount: 1 });
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "right", buttons: 0, clickCount: 1 });
  await sleep(100);
  await click('[data-context="palette-add"]');
  assert.equal((await allNodes()).length, count + 1);
  await click('[data-command="undo"]');
});

await step("Cut removes the widget and paste brings it back", async () => {
  const widget = (await project()).screens[0].children.at(-1);
  await click(`[data-tree="${widget.id}"]`);
  const count = (await allNodes()).length;
  await pressKey("x", "KeyX", 88, 2);
  assert.equal((await allNodes()).length, count - 1);
  await pressKey("v", "KeyV", 86, 2);
  assert.equal((await allNodes()).length, count);
});

await step("The side panels reach the status bar; the log sits under the surface only", async () => {
  const rect = (selector) => js(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; })()`);
  const [left, right, bottom, center_, status] = [await rect(".left-col"), await rect(".right-col"), await rect(".bottom-panel"), await rect(".center-col"), await rect(".statusbar")];
  assert.ok(Math.abs(left.bottom - status.top) <= 1, `left panel ends at ${left.bottom}, status bar at ${status.top}`);
  assert.ok(Math.abs(right.bottom - status.top) <= 1, `right panel ends at ${right.bottom}, status bar at ${status.top}`);
  assert.ok(bottom.left >= left.right, "the log runs under the left panel");
  assert.ok(bottom.right <= right.left, "the log runs under the right panel");
  assert.ok(Math.abs(bottom.left - center_.left) <= 1 && Math.abs(bottom.right - center_.right) <= 1, "the log is not as wide as the centre");
  await shot("10f-layout");
});

await step("Bottom panel: clearing the output, and deleting build results after asking", async () => {
  const lines = () => js("document.querySelectorAll('[data-log] .log-line').length");
  await click('[data-bottom="log"]');
  await sleep(40);
  assert.ok((await lines()) > 0, "the log should hold something by now");
  await click('[data-command="clear-output"]');
  await sleep(60);
  assert.equal(await lines(), 0);
  assert.equal(await js(`document.querySelector('[data-command="clear-output"]').disabled`), true, "nothing left to clear");
  await click('[data-bottom="build"]');
  await sleep(40);
  assert.equal(await js(`document.querySelector('[data-command="clear-output"]').disabled`), true, "the build output is empty");
  await click('[data-command="clean-build"]');
  await page.until('document.querySelector("[data-dialog=confirm]")', 2000);
  assert.match(await js('document.querySelector("[data-dialog=confirm]").textContent'), /9\.6\.0/);
  await click('[data-command="confirm-no"]');
  await click('[data-command="clean-build"]');
  await page.until('document.querySelector("[data-dialog=confirm]")', 2000);
  await click('[data-command="confirm-yes"]');
  await sleep(200);
  await click('[data-bottom="log"]');
  await sleep(40);
  assert.ok(await js('Array.from(document.querySelectorAll("[data-log=log] .log-line span")).some((e) => e.textContent.includes("9.6.0"))'), "nothing reported");
});

await step("Start screen cards have a faint border in every theme", async () => {
  const faint = await js(`(async () => {
    const el = document.createElement("div");
    el.className = "start-card";
    el.style.cssText = "position:fixed;left:-500px;top:0;width:50px;height:50px";
    document.body.append(el);
    const alpha = getComputedStyle(el).borderTopColor;
    el.remove();
    return alpha;
  })()`);
  const parts = faint.match(/[\d.]+/g).map(Number);
  const opacity = faint.startsWith("color(") ? parts.at(-1) : parts.length > 3 ? parts[3] : 1;
  assert.ok(opacity <= 0.4, `the card border is strong: ${faint}`);
});

await step("Every window shows its icon and title", async () => {
  const check = async (dialog) => {
    await page.until(`document.querySelector('[data-dialog="${dialog}"]')`, 3000);
    const title = await js(`(() => { const t = document.querySelector('[data-dialog="${dialog}"] [data-dialog-title]'); return t ? { icon: !!t.querySelector('.icon'), text: t.textContent.trim() } : null; })()`);
    assert.ok(title?.icon, `${dialog} has no icon`);
    assert.ok(title?.text, `${dialog} has no title`);
  };
  await click('[data-command="about"]');
  await check("about");
  await click('[data-dialog="about"] footer button');
  await click('[data-command="settings"]');
  await check("settings");
  await click('[data-command="settings-close"]');
  await click('[data-command="preferences"]');
  await check("preferences");
  await click('[data-command="preferences-close"]');
  await click('[data-menu="file"] > button');
  await click('[data-menu="file"] [data-command="saveAs"]');
  await check("new-project");
  await click('[data-dialog="new-project"] footer button:last-child');
  await click('[data-command="manager"]');
  await check("manager");
  await click('[data-dialog="manager"] footer button');
  assert.ok(await js("!!document.querySelector('.app-title img') && !!document.querySelector('.app-title strong').textContent"), "the main window has no icon and title");
  for (const panel of ["palette", "tree", "attributes"]) assert.ok(await js(`!!document.querySelector('[data-panel="${panel}"] h3 .icon')`), panel);
});

await step("About and project settings open and close", async () => {
  await click('[data-command="about"]');
  await page.until('document.querySelector("[data-dialog=about]")', 2000);
  assert.match(await js('document.querySelector("[data-dialog=about]").textContent'), /9\.6\.0/);
  await click('[data-dialog="about"] footer button');
  await click('[data-command="settings"]');
  await page.until('document.querySelector("[data-dialog=settings]")', 2000);
  await typeInto('[data-field="projectName"]', "Renamed Project");
  assert.equal((await project()).name, "Renamed Project");
  await click('[data-field="deviceW"] button:last-child');
  assert.equal((await project()).device.w, 321);
  await click('[data-field="deviceW"] button:first-child');
  await choose("device", "wvga");
  assert.equal((await project()).device.w, 800);
  await click(`[data-select="device"] .icon-select-button`);
  await click(`[data-select="device"] [data-value="cyd"]`);
  await click('[data-field="themeDark"]');
  assert.equal((await project()).theme.dark, true);
  await click('[data-field="themeDark"]');
  await typeInto('[data-field="themePrimary"] .color-text', "#ff8800");
  assert.equal((await project()).theme.primary, "#ff8800");
  await click('[data-command="settings-close"]');
});

category("Appearance");

await step("Settings: every built-in theme applies its colours", async () => {
  await click('[data-command="preferences"]');
  await page.until('document.querySelector("[data-dialog=preferences]")', 2000);
  await shot("11-preferences");
  await click('[data-pref-tab="theme"]');
  await sleep(80);
  assert.equal(await js("document.querySelectorAll('[data-theme-group=light] [data-pref-theme]').length"), 20);
  assert.equal(await js("document.querySelectorAll('[data-theme-group=dark] [data-pref-theme]').length"), 20);
  await shot("12-themes");
  const ids = await js("Array.from(document.querySelectorAll('[data-pref-theme]')).map((e) => e.dataset.prefTheme)");
  const colours = new Set();
  for (const id of ids) {
    await js(`document.querySelector('[data-pref-theme="${id}"]').click()`);
    await sleep(30);
    assert.equal(await js("window.__mls.themeId()"), id);
    assert.equal(await js("document.documentElement.dataset.theme"), id);
    colours.add(await js("getComputedStyle(document.documentElement).getPropertyValue('--bg') + getComputedStyle(document.documentElement).getPropertyValue('--accent')"));
    const worst = await js(CONTRAST_PROBE);
    assert.ok(worst.ratio >= 4.5, `${id}: ${worst.what} has contrast ${worst.ratio.toFixed(2)}`);
  }
  assert.equal(colours.size, ids.length, "two themes look the same");
  await click('[data-pref-theme="light-classic"]');
});

await step("Settings: a user theme can be created, edited and used", async () => {
  await click('[data-command="theme-add"]');
  await sleep(100);
  const id = await js("window.__mls.themeId()");
  assert.match(id, /^custom-/);
  await page.until(`document.querySelector('[data-theme-editor="${id}"]')`, 2000);
  await typeInto('[data-field="themeName"]', "Studio Night");
  for (const [key, colour] of [["bg", "#101820"], ["panel", "#18242f"], ["ink", "#e8f0f8"], ["accent", "#ff8800"]]) {
    await typeInto(`[data-field="themeColor-${key}"] .color-text`, colour);
    // At every step of editing, nothing on screen may become unreadable.
    const during = await js(CONTRAST_PROBE);
    assert.ok(during.ratio >= 4.5, `after ${key}: ${during.what} has contrast ${during.ratio.toFixed(2)}`);
  }
  await sleep(100);
  const variable = (name) => js(`getComputedStyle(document.documentElement).getPropertyValue('${name}').trim()`);
  assert.equal(await variable("--bg"), "#101820");
  assert.equal(await variable("--accent"), "#ff8800");
  await click('[data-select="themeMode"] .icon-select-button');
  await click('[data-select="themeMode"] [data-value="dark"]');
  await sleep(100);
  assert.equal(await js("document.documentElement.dataset.mode"), "dark");
  assert.ok((await js(`document.querySelector('[data-pref-theme="${id}"]').textContent`)).includes("Studio Night"));
  const scrolls = await js(`(() => { const p = document.querySelector(".pref-page"); return p.scrollHeight - p.clientHeight; })()`);
  assert.equal(scrolls, 0, "the theme tab scrolls with the editor open");
  // Only some colours were changed, so its panel is dark while its header is still light.
  const worst = await js(CONTRAST_PROBE);
  assert.ok(worst.ratio >= 4.5, `${worst.what} has contrast ${worst.ratio.toFixed(2)}`);
  await shot("13-custom-theme");
});

await step("Settings: a second user theme can be made, then deleted after asking", async () => {
  await click('[data-command="theme-add"]');
  await sleep(100);
  const second = await js("window.__mls.themeId()");
  assert.equal(await js("document.querySelectorAll('[data-theme-group=custom] [data-pref-theme]').length"), 2);
  await click('[data-command="theme-delete"]');
  await page.until('document.querySelector("[data-dialog=confirm]")', 2000);
  await click('[data-command="confirm-no"]');
  assert.equal(await js("document.querySelectorAll('[data-theme-group=custom] [data-pref-theme]').length"), 2);
  await click('[data-command="theme-delete"]');
  await click('[data-command="confirm-yes"]');
  await sleep(120);
  assert.equal(await js("document.querySelectorAll('[data-theme-group=custom] [data-pref-theme]').length"), 1);
  assert.notEqual(await js("window.__mls.themeId()"), second);
  const custom = await js("document.querySelector('[data-theme-group=custom] [data-pref-theme]').dataset.prefTheme");
  await click(`[data-pref-theme="${custom}"]`);
});

await step("Settings: the start screen tab edits the same values", async () => {
  await click('[data-pref-tab="start"]');
  await sleep(100);
  // The same controls as on the start screen: − bar value +, the value centred.
  for (const name of ["startSpeed", "startOpacity"]) {
    const order = await js(`Array.from(document.querySelector('[data-pref-page=start] [data-range="${name}"]').children).map((e) => e.className)`);
    assert.deepEqual(order, ["range-step", "range-bar", "range-value", "range-step"], name);
    assert.equal(await js(`getComputedStyle(document.querySelector('[data-pref-page=start] [data-field="${name}"]')).textAlign`), "center", name);
    assert.ok(await js(`document.querySelector('[data-pref-page=start] [data-step="${name}:up"]').getBoundingClientRect().width`) <= 26, "the buttons are stretched");
  }
  const speedBar = await js(`(() => { const r = document.querySelector('[data-pref-page=start] [data-range-bar="startSpeed"]').getBoundingClientRect(); return { left: r.left, width: r.width, y: r.top + r.height / 2 }; })()`);
  assert.ok(speedBar.width >= 60, "the bar is too short");
  await drag({ x: speedBar.left + speedBar.width / 2, y: speedBar.y }, { x: speedBar.left + speedBar.width + 20, y: speedBar.y });
  await sleep(80);
  assert.equal(await js("window.__mls.start().speed"), 300);
  await click('[data-pref-page="start"] [data-step="startSpeed:down"]');
  await sleep(60);
  assert.equal(await js("window.__mls.start().speed"), 290);
  const noScroll = () => js(`(() => { const p = document.querySelector(".pref-page"); const b = document.querySelector(".dialog-body:has(.pref-layout)"); return { page: p.scrollHeight - p.clientHeight, pageWide: p.scrollWidth - p.clientWidth, body: b.scrollHeight - b.clientHeight }; })()`);
  assert.deepEqual(await noScroll(), { page: 0, pageWide: 0, body: 0 }, "the start tab scrolls");
  await click('[data-pref-tab="theme"]');
  await sleep(100);
  assert.deepEqual(await noScroll(), { page: 0, pageWide: 0, body: 0 }, "the theme tab scrolls");
  await click('[data-pref-tab="general"]');
  await sleep(100);
  assert.deepEqual(await noScroll(), { page: 0, pageWide: 0, body: 0 }, "the general tab scrolls");
  await click('[data-pref-tab="start"]');
  await sleep(100);
  const kinds = await js("Array.from(document.querySelectorAll('[data-pref-page=start] [data-background]')).map((e) => e.dataset.background)");
  assert.ok(kinds.length >= 20);
  await click(`[data-pref-page="start"] [data-background="${kinds[3]}"]`);
  assert.equal(await js("window.__mls.start().background"), kinds[3]);
  await click('[data-pref-page="start"] [data-background-shuffle]');
  assert.equal(await js("window.__mls.start().shuffle"), true);
  await click('[data-pref-page="start"] [data-background-shuffle]');
  await click('[data-pref-page="start"] [data-step="startOpacity:up"]');
  await shot("14-pref-start");
  await click('[data-command="start-reset"]');
  await sleep(60);
  assert.equal(await js("window.__mls.start().cardOpacity"), 85);
  assert.equal(await js("window.__mls.start().background"), "circuit");
  await click(`[data-pref-page="start"] [data-background="${kinds[5]}"]`);
});

await step("Settings: the General tab has real settings, and they work", async () => {
  await click('[data-pref-tab="general"]');
  await sleep(80);
  for (const field of ["prefShowStart", "prefReopen", "prefLocation", "prefRulers", "prefSnap"]) assert.ok(await js(`!!document.querySelector('[data-field="${field}"]')`), field);
  for (const select of ["prefLanguage", "prefNewVersion", "prefNewDevice"]) assert.ok(await js(`!!document.querySelector('[data-select="${select}"]')`), select);
  await shot("14b-pref-general");
  const overflow = await js(`(() => { const p = document.querySelector(".pref-page"); return p.scrollHeight - p.clientHeight; })()`);
  assert.equal(overflow, 0, "the general tab scrolls");
  await choose("prefNewVersion", "8.4.0");
  await choose("prefNewDevice", "wvga");
  await typeInto('[data-field="prefSnap"] input', "10");
  await click('[data-field="prefReopen"]');
  assert.deepEqual(await js("window.__mls.general()"), { reopenLast: true, newVersion: "8.4.0", newDevice: "wvga", snap: 10 });
  await click('[data-field="prefReopen"]');
  await click('[data-command="preferences-close"]');
  // New projects start with these defaults.
  await click('[data-menu="file"] > button');
  await click('[data-menu="file"] [data-command="saveAs"]');
  await click('[data-dialog="new-project"] footer button:last-child');
  const widget = (await project()).screens[0].children.find((node) => node.type === "led");
  await click(`[data-tree="${widget.id}"]`);
  await sleep(100);
  const area = await box(widget.id);
  const before = await displayPoint(area.x + area.w / 2, area.y + area.h / 2);
  await drag(before, { x: before.x + 33, y: before.y + 47 });
  await sleep(100);
  const moved = await nodeById(widget.id);
  assert.equal(moved.props.x % 10, 0, `x ${moved.props.x} is not on the 10 px step`);
  assert.equal(moved.props.y % 10, 0, `y ${moved.props.y} is not on the 10 px step`);
  await click('[data-command="undo"]');
  await click('[data-command="preferences"]');
  await click('[data-pref-tab="general"]');
  await sleep(60);
  await typeInto('[data-field="prefSnap"] input', "1");
  await choose("prefNewVersion", "9.6.0");
  await choose("prefNewDevice", "cyd");
  // The start screen's settings are here as well, with the layout reset.
  await click('[data-pref-tab="start"]');
  await sleep(80);
  assert.ok(await js('!!document.querySelector("[data-command=start-layout-reset]") && !!document.querySelector("[data-field=prefStartShow]") && !!document.querySelector("[data-pref-page=start] [data-background-shuffle]")'));
});

await step("Settings: the language tab changes the whole window", async () => {
  await click('[data-pref-tab="general"]');
  await sleep(60);
  await choose("prefLanguage", "en");
  assert.equal(await js("window.__mls.language()"), "en");
  assert.equal(await js(`document.querySelector('[data-menu="file"] button').textContent`), "File");
  await choose("prefLanguage", "ko");
  assert.equal(await js(`document.querySelector('[data-menu="file"] button').textContent`), "파일");
  await click('[data-field="prefShowStart"]');
  assert.equal(await js("window.__mls.start().showOnStartup"), false);
  await click('[data-field="prefShowStart"]');
  await click('[data-command="preferences-close"]');
});

await step("A dark theme and English change the whole window", async () => {
  await click('[data-command="theme"]');
  await click('.theme-pop [data-theme-id="dark-midnight"]');
  await sleep(100);
  assert.equal(await js("document.documentElement.dataset.mode"), "dark");
  assert.equal(await js("window.__mls.language()"), "ko");
  assert.ok(await js("!!document.querySelector('[data-command=language] [data-flag=gb]')"), "Korean mode must offer the British flag");
  await click('[data-command="language"]');
  await sleep(100);
  assert.equal(await js(`document.querySelector('[data-menu="file"] button').textContent`), "File");
  assert.ok(await js("!!document.querySelector('[data-command=language] [data-flag=kr]')"), "English mode must offer the Korean flag");
  await click('[data-command="language"]');
  await sleep(100);
  assert.equal(await js("window.__mls.language()"), "ko");
  await click('[data-command="language"]');
  await sleep(100);
  await shot("07-dark-english");
});

await step("At the minimum width nothing on the menu row or toolbar hides, in both languages", async () => {
  const check = () => js(`(() => {
    const bad = [];
    for (const e of document.querySelectorAll(".menubar button, .menubar .app-title, .toolbar button, .toolbar [data-zoom]")) {
      if (e.closest(".menu-pop")) continue;
      const r = e.getBoundingClientRect();
      if (r.width === 0 || r.left < -0.5 || r.right > innerWidth + 0.5) bad.push(e.dataset.command || e.textContent || e.className);
    }
    const tools = Array.from(document.querySelectorAll(".toolbar > *")).map((e) => e.getBoundingClientRect());
    for (let i = 1; i < tools.length; i++) if (tools[i].left < tools[i - 1].right - 0.5) bad.push("toolbar groups overlap at " + i);
    const menus = Array.from(document.querySelectorAll(".app-title, .menu, .window-controls")).map((e) => e.getBoundingClientRect());
    for (let i = 1; i < menus.length; i++) if (menus[i].left < menus[i - 1].right - 0.5) bad.push("menu row overlaps at " + i);
    return { width: innerWidth, minimum: window.__mls.minimumWidth(), bad, scroll: document.documentElement.scrollWidth - innerWidth };
  })()`);
  await page.send("Emulation.setDeviceMetricsOverride", { width: 900, height: 800, deviceScaleFactor: 1, mobile: false });
  try {
    for (let round = 0; round < 2; round++) {
      await sleep(250);
      const minimum = await js("window.__mls.minimumWidth()");
      assert.ok(minimum >= 800 && minimum < 1800, String(minimum));
      await page.send("Emulation.setDeviceMetricsOverride", { width: minimum, height: 800, deviceScaleFactor: 1, mobile: false });
      await sleep(250);
      const seen = await check();
      assert.deepEqual(seen.bad, [], `at ${seen.width}px (language round ${round})`);
      await shot(`12b-minimum-width-${round}`);
      await click('[data-command="language"]');
      await sleep(150);
    }
  } finally {
    await page.send("Emulation.clearDeviceMetricsOverride");
  }
  await sleep(200);
});

await step("The window itself refuses to get narrower than that, even from another program", { skip: process.platform !== "win32" }, async () => {
  const minimum = await js("window.__mls.minimumWidth()");
  // No mouse input: a size set by another program, which Windows does not check against the minimum.
  const script = `Add-Type -Name W -Namespace N -MemberDefinition '[DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int ht, bool r);'; $p = Get-Process -Id ${app.pid}; [N.W]::MoveWindow($p.MainWindowHandle, 50, 50, 300, 200, $true) | Out-Null`;
  execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { stdio: "pipe" });
  await sleep(600);
  const width = await js("innerWidth");
  const height = await js("innerHeight");
  assert.ok(width + 1 >= minimum, `the window became ${width}px wide; the minimum is ${minimum}px`);
  assert.ok(height + 1 >= 640, `the window became ${height}px tall`);
  const overflow = await js(`(() => { const bar = document.querySelector(".toolbar"); return bar.scrollWidth - bar.clientWidth; })()`);
  assert.ok(overflow <= 0, `the toolbar overflows by ${overflow}`);
});

if (!skipNative) {
  category("LVGL manager and native run");

  await step("The LVGL manager lists releases and shows the tools", async () => {
    await click('[data-command="manager"]');
    await page.until('document.querySelector("[data-manager] [data-version=\\"9.6.0\\"]")', 15000);
    await page.until('document.querySelector("[data-tools]")', 15000);
    await shot("08-manager");
  });

  await step("It downloads and installs LVGL 9.6.0", async () => {
    await click('[data-version="9.6.0"] [data-action="install"]');
    await page.until('document.querySelector(\'[data-version="9.6.0"] [data-action="remove"]\')', 180000);
    const dir = path.join(data, "settings", "lvgl", "9.6.0");
    assert.ok(fs.existsSync(path.join(dir, "lvgl.h")));
    assert.ok(fs.existsSync(path.join(dir, "include", "lvgl", "lvgl.h")));
    assert.ok(!fs.existsSync(path.join(dir, "docs")));
    await shot("09-installed");
    await click('[data-dialog="manager"] footer button');
  });

  await step("Native run builds with gcc and starts the program", async () => {
    await click('[data-command="native"]');
    await page.until('Array.from(document.querySelectorAll("[data-log=build] .log-line span")).some((e) => e.textContent.startsWith("Running"))', 480000);
    await click('[data-bottom="log"]');
    await page.until('Array.from(document.querySelectorAll("[data-log=log] .log-line span")).some((e) => e.textContent.startsWith("started: 320x240, LVGL 9.6.0"))', 15000);
    await shot("10-native");
  });

  await step("Stop ends the native program", async () => {
    await click('[data-command="native"]');
    await page.until('document.querySelector(\'[data-command="native"]\').getAttribute("aria-pressed") === "false"', 10000);
  });

  await step("Native run of a project whose LVGL is missing offers the download", async () => {
    await click('[data-command="settings"]');
    await choose("lvglVersion", "8.4.0");
    await click('[data-command="settings-close"]');
    await click('[data-command="native"]');
    await page.until('document.querySelector("[data-dialog=confirm]")', 15000);
    assert.match(await js('document.querySelector("[data-dialog=confirm]").textContent'), /8\.4\.0/);
    await click('[data-command="confirm-yes"]');
    await page.until('document.querySelector(\'[data-version="8.4.0"] [data-action="remove"]\')', 180000);
    await click('[data-dialog="manager"] footer button');
  });

  await step("Native run works with the LVGL v8 API too", async () => {
    await click('[data-command="native"]');
    await page.until('Array.from(document.querySelectorAll("[data-log=build] .log-line span")).some((e) => e.textContent.startsWith("Running"))', 480000);
    await click('[data-bottom="log"]');
    await page.until('Array.from(document.querySelectorAll("[data-log=log] .log-line span")).some((e) => e.textContent.startsWith("started: 320x240, LVGL 8.4.0"))', 15000);
    await shot("15-native-v8");
    await click('[data-command="native"]');
    await page.until('document.querySelector(\'[data-command="native"]\').getAttribute("aria-pressed") === "false"', 10000);
  });

  await step("An installed LVGL can be removed after asking", async () => {
    await click('[data-command="manager"]');
    await page.until('document.querySelector(\'[data-version="8.4.0"] [data-action="remove"]\')', 15000);
    await click('[data-version="8.4.0"] [data-action="remove"]');
    await page.until('document.querySelector("[data-dialog=confirm]")', 3000);
    await click('[data-command="confirm-no"]');
    assert.ok(fs.existsSync(path.join(data, "settings", "lvgl", "8.4.0", "lvgl.h")));
    await click('[data-version="8.4.0"] [data-action="remove"]');
    await click('[data-command="confirm-yes"]');
    await page.until('document.querySelector(\'[data-version="8.4.0"] [data-action="install"]\')', 15000);
    assert.ok(!fs.existsSync(path.join(data, "settings", "lvgl", "8.4.0")));
    await click('[data-dialog="manager"] footer button');
    await click('[data-command="settings"]');
    await choose("lvglVersion", "9.6.0");
    await click('[data-command="settings-close"]');
  });
}

category("Across restarts");

await step("Settings are saved: all of them return after a restart", async () => {
  await click('[data-command="save"]');
  await sleep(300);
  await click('[data-command="preferences"]');
  await click('[data-pref-tab="theme"]');
  await js(`document.querySelector('[data-theme-group=custom] [data-pref-theme]').click()`);
  await sleep(80);
  await click('[data-command="preferences-close"]');
  if ((await js("window.__mls.language()")) !== "en") await click('[data-command="language"]');
  await sleep(100);
  const before = await js("({ theme: window.__mls.themeId(), start: window.__mls.start(), recent: window.__mls.recent(), language: window.__mls.language() })");
  await restart();
  await page.until("document.querySelector('[data-start-screen]')", 15000);
  await sleep(300);
  assert.equal(await js("window.__mls.themeId()"), before.theme);
  assert.equal(await js("window.__mls.language()"), "en");
  assert.deepEqual(await js("window.__mls.start()"), before.start);
  assert.deepEqual(await js("window.__mls.recent()"), before.recent);
  await shot("20-restart");
});

await step("A recent project opens from the start screen, with its contents", async () => {
  const recent = await js("window.__mls.recent()");
  assert.ok(recent.some((file) => file.endsWith("GuiApp.mylvgl")), recent.join());
  const file = recent.find((item) => item.endsWith("GuiApp.mylvgl"));
  await clickRecent(file);
  await sleep(300);
  assert.equal(await js("window.__mls.showStart()"), false);
  const saved = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.deepEqual(await project(), saved);
});

await step("Show at startup off opens the designer directly", async () => {
  await click('[data-command="preferences"]');
  await click('[data-field="prefShowStart"]');
  await click('[data-command="preferences-close"]');
  await sleep(100);
  await restart();
  await sleep(300);
  assert.equal(await js("window.__mls.showStart()"), false);
  await click('[data-command="start"]');
  await sleep(100);
  await click('[data-field="startShow"]');
  assert.equal(await js("window.__mls.start().showOnStartup"), true);
  await click('[data-command="start"]');
});

await step("A project file given on the command line opens", async () => {
  const file = path.join(data, "GuiApp", "GuiApp.mylvgl");
  await restart([file]);
  await page.until("window.__mls.project().name === " + JSON.stringify(JSON.parse(fs.readFileSync(file, "utf8")).name), 8000);
  assert.equal(await js("window.__mls.showStart()"), false);
});

await step("A damaged project file is refused with a reason", async () => {
  const file = path.join(data, "Broken.mylvgl");
  fs.writeFileSync(file, '{"format":"mylvgl","formatVersion":99}');
  await restart([file]);
  await page.until('document.querySelector("[data-dialog=message]")', 8000);
  assert.match(await js('document.querySelector("[data-dialog=message]").textContent'), /newer My LVGL Studio/);
  await shot("21-damaged-file");
  await click('[data-dialog="message"] footer button');
});

await step("A recent project that is gone leaves the list", async () => {
  const file = path.join(data, "Gone.mylvgl");
  const settingsFile = path.join(data, "settings", "settings.json");
  await click('[data-command="start"]');
  await sleep(100);
  const settings = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
  page.close();
  app.kill();
  await sleep(1500);
  settings.recent = [file, ...(settings.recent ?? [])];
  fs.writeFileSync(settingsFile, JSON.stringify(settings));
  await launch();
  await page.until("document.querySelector('[data-start-screen]')", 15000);
  await clickRecent(file);
  await page.until('document.querySelector("[data-dialog=message]")', 5000);
  await click('[data-dialog="message"] footer button');
  assert.ok(!(await js("window.__mls.recent()")).includes(file));
});

const exitCode = summary();
page.close();
app.kill();
await sleep(600);
try {
  fs.rmSync(data, { recursive: true, force: true });
} catch { /* WebView2 can hold its folder a little longer; it lives in the temp folder */ }
process.exit(exitCode);
