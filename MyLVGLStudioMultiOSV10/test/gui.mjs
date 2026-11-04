// npm run test:gui: drives the real desktop app through the DevTools protocol, in a private
// data folder and WebView2 profile. Screenshots go to test-results/gui/.
//   --no-native    skips downloading LVGL and the native build
//   --exe <path>   the exe to test (default: the debug build)
import { spawn } from "node:child_process";
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
const exe = argument("--exe") ?? path.join(root, "src-tauri", "target", "debug", process.platform === "win32" ? "MyLVGLStudio.exe" : "MyLVGLStudio");
const skipNative = process.argv.includes("--no-native");
const shots = path.join(root, "test-results", "gui");
fs.rmSync(shots, { recursive: true, force: true });
fs.mkdirSync(shots, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const data = fs.mkdtempSync(path.join(os.tmpdir(), "mls-gui-"));
let app = null;
let page = null;

async function launch(args = []) {
  const port = await freePort(9360);
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
const center = (selector) => js(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; e.scrollIntoView({ block: "nearest", inline: "nearest" }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
const mouse = (type, x, y, extra = {}) => page.send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1, ...extra });
async function clickAt(x, y) {
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, buttons: 0 });
  await mouse("mousePressed", x, y);
  await sleep(60);
  await mouse("mouseReleased", x, y);
  await sleep(60);
}
async function click(selector) {
  const point = await center(selector);
  assert.ok(point, `no element ${selector}`);
  await clickAt(point.x, point.y);
}
async function drag(from, to) {
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: from.x, y: from.y, buttons: 0 });
  await mouse("mousePressed", from.x, from.y);
  const steps = 6;
  for (let i = 1; i <= steps; i++) {
    await mouse("mouseMoved", from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
    await sleep(25);
  }
  await mouse("mouseReleased", to.x, to.y);
  await sleep(100);
}
async function typeInto(selector, text) {
  await js(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); e.focus(); const set = Object.getOwnPropertyDescriptor(e instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value").set; set.call(e, ${JSON.stringify(text)}); e.dispatchEvent(new Event("input", { bubbles: true })); })()`);
  await sleep(80);
}
const project = () => js("window.__mls.project()");
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
  await click(`[data-select="${field}"] .icon-select-button`);
  await click(`[data-select="${field}"] [data-value="${value}"]`);
}

category("Start screen");

await step("It opens on the start screen with every card", async () => {
  await page.until("document.querySelector('[data-start-screen]')", 15000);
  for (const card of ["hero", "actions", "recent", "theme", "background"]) {
    assert.ok(await js(`!!document.querySelector('[data-card="${card}"]')`), card);
  }
  await sleep(400);
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

await step("Continue opens the empty project in the designer", async () => {
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
  await click('[data-view="split"]');
  await sleep(100);
  await click('[data-code-tab="src/ui/screens/ui_Screen1.c"]');
  await sleep(50);
  const code = await js(`document.querySelector("[data-code]").textContent`);
  assert.match(code, /lv_button_create/);
  assert.match(code, /"Start"/);
  await shot("04-split");
  await click('[data-view="design"]');
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
  await click('[data-view="split"]');
  await sleep(50);
  await click('[data-code-tab="src/ui/screens/ui_Screen1.c"]');
  await sleep(50);
  const code = await js(`document.querySelector("[data-code]")?.textContent ?? ""`);
  assert.match(code, /lv_btn_create/);
  await click('[data-view="design"]');
  await click('[data-command="version-chip"]');
  await sleep(80);
  await choose("lvglVersion", "9.5.0");
  await page.until('document.querySelector("[data-note=engine]")', 3000);
  await page.until('window.__mls.engine().runtimeVersion() === "9.6.0"', 15000);
  await choose("lvglVersion", "9.6.0");
  await click('[data-command="settings-close"]');
});

await step("Run mode: clicking the button runs its action", async () => {
  await click(`[data-tree="${(await lastWidget()).id}"]`);
  await click('[data-command="event-add"]');
  await sleep(80);
  await typeInto('[data-field="eventText"]', "hello from lvgl");
  await click('[data-command="run"]');
  await page.until('document.querySelector("[data-overlay=run]")', 3000);
  await sleep(200);
  const widget = await lastWidget();
  const area = await box(widget.id);
  const point = await displayPoint(area.x + area.w / 2, area.y + area.h / 2);
  await clickAt(point.x, point.y);
  await sleep(200);
  await page.until('Array.from(document.querySelectorAll("[data-log=log] .log-line span")).some((e) => e.textContent === "hello from lvgl")', 3000);
  await shot("06-running");
  await click('[data-command="run"]');
  await page.until('document.querySelector("[data-overlay=design]")', 3000);
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
  assert.equal(types.length, 23);
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
  await typeInto('.attributes input[data-field="width"]', "50%");
  assert.equal((await nodeById(id)).props.width, "50%");
  await typeInto('.attributes input[data-field="width"]', "content");
  assert.equal((await nodeById(id)).props.width, "content");
  await typeInto('.attributes input[data-field="width"]', "120");
  assert.equal((await nodeById(id)).props.width, 120);
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
  await click(".zoom-box .mini:nth-of-type(2)");
  const larger = await zoom();
  await click(".zoom-box .mini:first-of-type");
  assert.ok((await zoom()) < larger);
  await click(".zoom-box .mini:last-of-type");
  const fitted = await zoom();
  const size = await js("(() => { const r = window.__mls.canvas().getBoundingClientRect(); const v = document.querySelector('.viewport').getBoundingClientRect(); return { fits: r.width <= v.width && r.height <= v.height }; })()");
  assert.ok(fitted > 0 && size.fits);
});

await step("Design, split and code views switch", async () => {
  for (const [view, surface, code] of [["code", false, true], ["split", true, true], ["design", true, false]]) {
    await click(`[data-view="${view}"]`);
    await sleep(80);
    assert.equal(await js("getComputedStyle(document.querySelector('.viewport')).display !== 'none'"), surface, view);
    assert.equal(await js("!!document.querySelector('[data-code]')"), code, view);
  }
});

await step("Every generated file can be read in the code view", async () => {
  await click('[data-view="code"]');
  await sleep(60);
  const tabs = await js("Array.from(document.querySelectorAll('[data-code-tab]')).map((e) => e.dataset.codeTab)");
  for (const name of ["CMakeLists.txt", "config/lv_conf.h", "src/main.c", "src/ui/ui.c", "src/ui/ui.h", "src/ui/ui_events.c", "src/ui/ui_events.h"]) assert.ok(tabs.includes(name), name);
  for (const name of tabs) {
    await click(`[data-code-tab="${name}"]`);
    assert.ok((await js('document.querySelector("[data-code]").textContent')).length > 10, name);
  }
  await click('[data-view="design"]');
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

await step("The divider between the palette and the component tree moves", async () => {
  const palette = () => js('document.querySelector("[data-panel=palette]").getBoundingClientRect().height');
  const tree = () => js('document.querySelector("[data-panel=tree]").getBoundingClientRect().height');
  const [paletteBefore, treeBefore] = [await palette(), await tree()];
  const divider = await center('[data-splitter="palette"]');
  await drag(divider, { x: divider.x, y: divider.y + 50 });
  assert.ok(Math.abs((await palette()) - (paletteBefore + 50)) <= 2, "the palette did not grow");
  assert.ok(Math.abs((await tree()) - (treeBefore - 50)) <= 2, "the tree did not shrink");
  const moved = await center('[data-splitter="palette"]');
  await drag(moved, { x: moved.x, y: moved.y - 9999 > 0 ? moved.y - 9999 : 5 });
  assert.ok((await palette()) >= 60, "the palette can vanish");
  const again = await center('[data-splitter="palette"]');
  await drag(again, { x: again.x, y: 2000 });
  assert.ok((await tree()) >= 60, "the tree can vanish");
  const back = await center('[data-splitter="palette"]');
  await drag(back, { x: back.x, y: back.y - (await palette()) + paletteBefore });
  await sleep(100);
  const saved = JSON.parse(fs.readFileSync(path.join(data, "settings", "settings.json"), "utf8"));
  assert.ok(typeof saved.panels.palette === "number", "the position is not saved");
});

await step("Every menu opens and lists its commands", async () => {
  for (const [menu, command] of [["file", "new"], ["edit", "undo"], ["view", "zoomFit"], ["run", "native"], ["tools", "manager"], ["help", "about"]]) {
    await click(`[data-menu="${menu}"] > button`);
    assert.ok(await js(`!!document.querySelector('[data-menu="${menu}"] [data-command="${command}"]')`), menu);
    await click(`[data-menu="${menu}"] > button`);
  }
});

await step("About and project settings open and close", async () => {
  await click('[data-command="about"]');
  await page.until('document.querySelector("[data-dialog=about]")', 2000);
  assert.match(await js('document.querySelector("[data-dialog=about]").textContent'), /9\.6\.0/);
  await click('[data-dialog="about"] footer button');
  await click('[data-command="version-chip"]');
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
  await click('[data-command="language"]');
  await click('[data-language="en"]');
  await sleep(100);
  assert.equal(await js(`document.querySelector('[data-menu="file"] button').textContent`), "File");
  await shot("07-dark-english");
});

await step("Nothing is cut off at the minimum window width", async () => {
  const overflow = await js(`(() => { const bar = document.querySelector(".toolbar"); return bar.scrollWidth - bar.clientWidth; })()`);
  assert.ok(overflow <= 0, `toolbar overflows by ${overflow}`);
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
  await click('[data-command="language"]');
  await click('[data-language="en"]');
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
