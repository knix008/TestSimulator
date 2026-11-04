/* Writes the pictures of the user's guide (guide.html) into doc/images/.
 *
 * It drives the real web app headless: scripts/browser.js starts a static server and Edge or
 * Chrome, index.html?test=1 is loaded at a fixed size, and each shot below runs its setup
 * through window.MyPaint (the test API at the end of src/app.js) before a screenshot is taken
 * of the whole window or of the rectangle around some elements.
 *
 *   node scripts/make-guide-images.js                 every shot, Korean and English
 *   node scripts/make-guide-images.js --only toolbar,dicom
 *   node scripts/make-guide-images.js --lang ko       one language only
 *
 * Korean pictures are written as <name>.png, English ones as <name>-en.png; the guide falls back
 * to <name>.png when an English picture is missing. A shot whose setup fails (an action that does
 * not exist yet, a selector that matches nothing) is reported as a warning and skipped, and the
 * picture already on disk, if any, is left alone.
 */
const fs = require("fs");
const path = require("path");
const browser = require("./browser");

const root = browser.root;
const OUT = path.join(root, "doc", "images");
const VIEW = { width: 1360, height: 860 };

/* ── the shots ──────────────────────────────────────────────────────────────────
 * name   file name under doc/images/ (without .png)
 * setup  the body of an async function (api, lang, util) run in the page after a reset;
 *        api = window.MyPaint, lang = "ko" | "en",
 *        util.need(action)       throws when api.hasAction(action) is false
 *        util.wait(ms)           waits
 *        util.fixture(file)      bytes of test/fixtures/<file> as a Uint8Array
 *        util.click(selector)    clicks the first element that matches, throws when none does
 *        util.field(name, value) sets a [data-field] in the open popup and fires change
 * clip   null for the whole window, or a selector / list of selectors whose union is cut out
 *        (selectors matching nothing are ignored, but at least one must match)
 * pad    extra pixels around the clip (default 0)
 */
const SHOTS = [
  {
    name: "main-window",
    setup: ``,
    clip: null,
  },
  {
    name: "toolbar",
    setup: ``,
    clip: "#toolbar",
  },
  {
    name: "tool-panel",
    setup: `api.setTool("rect");`,
    clip: "#leftPanel",
  },
  {
    name: "properties-panel",
    setup: `
      api.setTool("rect");
      api.setColor("#2563eb");
      const shape = api.draw(120, 120, 340, 260);
      api.selectShape(shape.id);`,
    clip: "#rightPanel",
  },
  {
    name: "selection-handles",
    setup: `
      api.clearDrawing();
      api.setTool("ellipse");
      api.setColor("#16a34a");
      api.draw(520, 150, 760, 330);
      api.setTool("rect");
      api.setColor("#2563eb");
      api.setStrokeWidth(4);
      const shape = api.draw(170, 130, 440, 330);
      api.setTool("select");
      api.selectShape(shape.id);`,
    clip: "#stage",
  },
  {
    name: "line-looks",
    setup: `
      api.clearDrawing();
      api.setTool("arrow");
      api.setColor("#ea580c");
      api.setStrokeWidth(6);
      const shape = api.draw(170, 170, 620, 330);
      api.setTool("select");
      api.selectShape(shape.id);`,
    clip: "#rightPanel",
  },
  {
    name: "effects-panel",
    setup: `
      api.clearDrawing();
      api.setTool("rect");
      api.setColor("#2563eb");
      const shape = api.draw(170, 130, 440, 330);
      api.setTool("select");
      api.selectShape(shape.id);
      await util.settle();
      const scroller = document.querySelector("#rightPanel .right-scroll");
      const section = scroller.querySelector(".fx-section");
      scroller.scrollTop += section.getBoundingClientRect().top - scroller.getBoundingClientRect().top;`,
    clip: "#rightPanel",
  },
  {
    name: "svg-edit",
    setup: `
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320" viewBox="0 0 480 320">\\n' +
        '  <rect x="20" y="20" width="440" height="280" rx="24"\\n    fill="#e0f2fe" stroke="#0369a1" stroke-width="6"/>\\n' +
        '  <circle cx="150" cy="160" r="80" fill="#f59e0b"/>\\n' +
        '  <path d="M260 240 L340 80 L420 240 Z" fill="#16a34a"/>\\n' +
        '  <text x="240" y="290" font-family="Segoe UI"\\n    font-size="28" text-anchor="middle"\\n    fill="#0f172a">MyPaint</text>\\n</svg>\\n';
      await api.openFiles([{ name: "logo.svg", text: svg, type: "image/svg+xml" }]);
      await util.wait(400);
      if (!document.getElementById("svgSource")) throw new Error("no SVG source box in the right panel");
      await util.settle();
      document.querySelector("#rightPanel .right-scroll").scrollTop = 100;`,
    clip: null,
  },
  {
    name: "drawing-shapes",
    setup: `
      api.clearDrawing();
      const put = (tool, color, width, a, b, c, d) => { api.setTool(tool); api.setColor(color); api.setStrokeWidth(width); return api.draw(a, b, c, d); };
      put("rect", "#2563eb", 4, 60, 60, 260, 200);
      put("ellipse", "#dc2626", 4, 300, 70, 480, 210);
      put("triangle", "#16a34a", 4, 520, 60, 700, 210);
      put("roundRect", "#9333ea", 4, 740, 60, 860, 210);
      put("arrow", "#f59e0b", 5, 80, 300, 300, 300);
      put("line", "#0f766e", 3, 80, 360, 300, 420);
      api.setTool("freeCurve"); api.setColor("#db2777"); api.setStrokeWidth(5);
      const wave = [];
      for (let i = 0; i <= 52; i += 1) wave.push({ x: 350 + i * 7, y: 380 + Math.sin(i / 6) * 60 });
      api.stroke(wave);
      api.setTool("pencil"); api.setColor("#111827"); api.setStrokeWidth(3);
      const loop = [];
      for (let i = 0; i <= 80; i += 1) loop.push({ x: 760 + Math.cos(i / 8) * 50 + i * 0.6, y: 400 + Math.sin(i / 8) * 50 });
      api.stroke(loop);
      api.deselect();`,
    clip: "#stage",
  },
  {
    name: "grid-rulers",
    setup: `
      util.need("toggleRulers");
      if (!api.getSettings().showGrid) api.run("toggleGrid");
      if (!api.getSettings().showRulers) api.run("toggleRulers");
      api.setZoom(100);
      await util.wait(300);`,
    clip: ["#rulerH", "#rulerV", "#stage"],
  },
  {
    name: "export-dialog",
    setup: `
      api.run("export");
      await util.wait(200);
      util.field("format", "jpeg");`,
    clip: "#popupLayer .popup",
    pad: 0,
  },
  {
    name: "print-dialog",
    setup: `api.run("print");`,
    clip: "#popupLayer .popup",
  },
  {
    name: "settings-dialog",
    setup: `api.run("settings");`,
    clip: "#popupLayer .popup",
  },
  {
    name: "settings-start",
    setup: `
      api.run("settings");
      await util.wait(150);
      util.click("#popupLayer .popup [data-tab='start']");`,
    clip: "#popupLayer .popup",
  },
  {
    name: "theme-menu",
    setup: `api.run("themeMenu");`,
    clip: [".menu.theme-menu", "[data-action='themeMenu']"],
    pad: 10,
  },
  {
    name: "dicom",
    setup: `
      await api.openBytes(await util.fixture("CT_small.dcm"), "CT_small.dcm");
      if (!api.dicom()) throw new Error("the DICOM fixture did not open as DICOM");
      await util.wait(300);`,
    clip: null,
  },
  {
    name: "start-screen",
    setup: `
      util.need("home");
      api.clearRecent();
      [
        ["floor-plan.mypaint", "C:/Users/me/Pictures/floor-plan.mypaint"],
        ["chest-ct.dcm", "C:/Users/me/Scans/chest-ct.dcm"],
        ["holiday.jpg", "C:/Users/me/Pictures/holiday.jpg"],
        ["logo.svg", "C:/Users/me/Design/logo.svg"],
        ["sketch.mypaint", "C:/Users/me/Documents/sketch.mypaint"],
      ].reverse().forEach((row, index) => api.addRecent({ id: "guide-" + index, name: row[0], path: row[1] }));
      api.run("home");
      await util.wait(250);`,
    clip: null,
  },
];

/* ── runner ─────────────────────────────────────────────────────────────────────── */

function parseArgs(argv) {
  const out = { only: null, langs: ["ko", "en"] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--only") out.only = String(argv[++i] || "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (arg.startsWith("--only=")) out.only = arg.slice(7).split(",").map((s) => s.trim()).filter(Boolean);
    else if (arg === "--lang") out.langs = langList(argv[++i]);
    else if (arg.startsWith("--lang=")) out.langs = langList(arg.slice(7));
  }
  return out;
}

function langList(value) {
  if (value === "ko" || value === "en") return [value];
  return ["ko", "en"];
}

const PAGE_HELPERS = `
  window.__guideUtil = {
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    need: (action) => {
      if (!window.MyPaint.hasAction(action)) throw new Error("the action \\"" + action + "\\" does not exist yet");
    },
    fixture: async (file) => {
      const response = await fetch("/test/fixtures/" + file);
      if (!response.ok) throw new Error("fixture " + file + " not found");
      return new Uint8Array(await response.arrayBuffer());
    },
    click: (selector) => {
      const node = document.querySelector(selector);
      if (!node) throw new Error("nothing matches " + selector);
      node.click();
    },
    field: (name, value) => {
      const node = document.querySelector('#popupLayer [data-field="' + name + '"]');
      if (!node) throw new Error("no field " + name + " in the popup");
      node.value = value;
      node.dispatchEvent(new Event("input", { bubbles: true }));
      node.dispatchEvent(new Event("change", { bubbles: true }));
    },
    settle: () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 120)))),
    rect: (selectors) => {
      const list = Array.isArray(selectors) ? selectors : [selectors];
      let box = null;
      list.forEach((selector) => {
        document.querySelectorAll(selector).forEach((node) => {
          const r = node.getBoundingClientRect();
          if (!r.width || !r.height) return;
          if (!box) box = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
          else {
            box.left = Math.min(box.left, r.left);
            box.top = Math.min(box.top, r.top);
            box.right = Math.max(box.right, r.right);
            box.bottom = Math.max(box.bottom, r.bottom);
          }
        });
      });
      return box;
    },
  };
  true;
`;

async function evaluate(cdp, expression, timeoutMs) {
  const run = cdp.send("Runtime.evaluate", { expression: expression, returnByValue: true, awaitPromise: true });
  const timer = new Promise((resolve, reject) => setTimeout(() => reject(new Error("timed out")), timeoutMs || 30000));
  const result = await Promise.race([run, timer]);
  if (result.exceptionDetails) {
    const detail = result.exceptionDetails;
    const message = (detail.exception && (detail.exception.description || detail.exception.value)) || detail.text || "failed";
    throw new Error(String(message).split("\n")[0]);
  }
  return result.result.value;
}

async function waitFor(cdp, expression, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      if (await evaluate(cdp, expression, 5000)) return true;
    } catch (error) { /* page still loading */ }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return false;
}

async function takeShot(cdp, shot, lang) {
  await evaluate(cdp, `(async () => {
    const api = window.MyPaint;
    api.closeMenu();
    api.closePopup();
    await api.resetForTests();
    api.setLanguage(${JSON.stringify(lang)});
    await window.__guideUtil.settle();
    return true;
  })()`, 20000);
  await evaluate(cdp, `(async () => {
    const api = window.MyPaint;
    const lang = ${JSON.stringify(lang)};
    const util = window.__guideUtil;
    ${shot.setup}
    await util.settle();
    return true;
  })()`, 30000);
  let clip = null;
  if (shot.clip) {
    const box = await evaluate(cdp, `window.__guideUtil.rect(${JSON.stringify(shot.clip)})`, 5000);
    if (!box) throw new Error("nothing on screen matches " + JSON.stringify(shot.clip));
    const pad = shot.pad || 0;
    const left = Math.max(0, Math.floor(box.left - pad));
    const top = Math.max(0, Math.floor(box.top - pad));
    const right = Math.min(VIEW.width, Math.ceil(box.right + pad));
    const bottom = Math.min(VIEW.height, Math.ceil(box.bottom + pad));
    if (right - left < 4 || bottom - top < 4) throw new Error("the clip is empty");
    clip = { x: left, y: top, width: right - left, height: bottom - top, scale: 1 };
  }
  const params = { format: "png", captureBeyondViewport: false };
  if (clip) params.clip = clip;
  const shotData = await cdp.send("Page.captureScreenshot", params);
  const file = path.join(OUT, shot.name + (lang === "en" ? "-en" : "") + ".png");
  fs.writeFileSync(file, Buffer.from(shotData.data, "base64"));
  return { file: file, clip: clip };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const shots = args.only ? SHOTS.filter((shot) => args.only.indexOf(shot.name) >= 0) : SHOTS;
  if (!shots.length) {
    console.error("No shot matches " + args.only.join(", ") + ". Known: " + SHOTS.map((s) => s.name).join(", "));
    process.exit(1);
  }
  if (!browser.findBrowser()) {
    console.error("Edge or Chrome was not found. Set BROWSER to the executable path.");
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });
  const server = await browser.startServer();
  const pagePort = server.address().port;
  const debugPort = pagePort + 1;
  const proc = browser.launch({ port: debugPort, url: "about:blank", prefix: "mypaint-guide", window: VIEW.width + "," + VIEW.height });
  let cdp;
  const made = [];
  const failed = [];
  try {
    await browser.waitForDebugger(debugPort);
    cdp = browser.connect(await browser.pageSocket(debugPort));
    await cdp.ready;
    await cdp.send("Runtime.enable");
    await cdp.send("Page.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: VIEW.width, height: VIEW.height, deviceScaleFactor: 1, mobile: false });
    await cdp.send("Page.navigate", { url: "http://127.0.0.1:" + pagePort + "/index.html?test=1" });
    const ready = await waitFor(cdp, "location.protocol === 'http:' && Boolean(window.MyPaint && window.MyPaint.ready)", 30000);
    if (!ready) throw new Error("The app did not start (window.MyPaint.ready never became true).");
    await evaluate(cdp, PAGE_HELPERS, 5000);
    for (const lang of args.langs) {
      for (const shot of shots) {
        const label = shot.name + (lang === "en" ? "-en" : "");
        try {
          const result = await takeShot(cdp, shot, lang);
          made.push(label);
          const size = result.clip ? result.clip.width + "x" + result.clip.height : VIEW.width + "x" + VIEW.height;
          console.log("  \x1b[32mok\x1b[0m    " + label.padEnd(24) + size);
        } catch (error) {
          failed.push({ name: label, error: error.message });
          console.warn("  \x1b[33mwarn\x1b[0m  " + label.padEnd(24) + error.message);
        }
      }
    }
    await evaluate(cdp, "(async () => { window.MyPaint.closePopup(); window.MyPaint.closeMenu(); await window.MyPaint.resetForTests(); return true; })()", 20000).catch(() => {});
  } finally {
    if (cdp) cdp.close();
    await browser.stopProcess(proc.proc);
    await new Promise((resolve) => server.close(resolve));
    await browser.removeProfile(proc.profile);
  }
  console.log("\n" + made.length + " pictures written to " + path.relative(root, OUT) + (failed.length ? ", " + failed.length + " skipped" : ""));
  if (failed.length) failed.forEach((item) => console.log("  - " + item.name + ": " + item.error));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
  });
}

module.exports = { SHOTS: SHOTS, VIEW: VIEW };
