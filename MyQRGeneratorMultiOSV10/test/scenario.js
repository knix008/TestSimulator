// The end-to-end checks both builds share: whatever the page draws on screen must scan
// back (jsQR on the real canvas pixels) to exactly the payload it shows.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import jsQR from "jsqr";
import { LOGO_ACCEPT } from "../src/js/logo.js";
import { previewImage, waitFor } from "./cdp.js";

const SAMPLES = [
  ["url", { url: "github.com/knix008" }, "https://github.com/knix008"],
  ["text", { text: "안녕하세요 QR 코드 생성기 — Rust + JavaScript" }, null],
  ["wifi", { ssid: "Home;Net", password: "s3cret:pw", security: "WPA" }, "WIFI:T:WPA;S:Home\\;Net;P:s3cret\\:pw;;"],
  ["vcard", { lastName: "홍", firstName: "길동", phone: "010-1234-5678", email: "gd@example.com" }, null],
  ["email", { to: "a@b.com", subject: "Hello", body: "Body text" }, "mailto:a@b.com?subject=Hello&body=Body%20text"],
  ["sms", { phone: "010-1111-2222", message: "hi" }, "SMSTO:01011112222:hi"],
  ["tel", { phone: "+82 2 123 4567" }, "tel:+8221234567"],
  ["geo", { latitude: "37.5665", longitude: "126.978" }, "geo:37.5665,126.978"],
];

async function scansAs(page, expected, what) {
  const img = await previewImage(page);
  const found = jsQR(img.data, img.width, img.height);
  assert.ok(found, `${what}: the preview did not scan`);
  assert.deepEqual(Uint8Array.from(found.binaryData), new TextEncoder().encode(expected), what);
}

export async function waitForApp(page) {
  await waitFor(() => page.eval("Boolean(window.__qrgen && window.__qrgen.result())"), { what: "the app to render" });
}

/** The page is up and encodes with the expected Rust build. */
export async function checkStartup(page, backend) {
  await waitForApp(page);
  assert.equal(await page.eval("window.__qrgen.backend"), backend);
  assert.equal(await page.eval("document.getElementById('engine').textContent.includes('Rust')"), true);
}

/** Every content type: the payload is right and the preview scans to exactly it. */
export async function checkContentTypes(page) {
  for (const [type, values, expected] of SAMPLES) {
    await page.eval(`(async () => { await window.__qrgen.setType(${JSON.stringify(type)}); for (const [k, v] of Object.entries(${JSON.stringify(values)})) await window.__qrgen.setValue(k, v); })()`);
    const payload = await page.eval("window.__qrgen.payload()");
    if (expected) assert.equal(payload, expected, type);
    await scansAs(page, payload, `type ${type}`);
  }
}

/** 4 module styles × 3 eye styles, each scanned from the preview pixels. */
export async function checkStyles(page) {
  await page.eval("window.__qrgen.setType('url')");
  const payload = await page.eval("window.__qrgen.payload()");
  for (const moduleStyle of ["square", "rounded", "dots", "bars"]) {
    for (const [eyeFrame, eyeBall] of [["square", "square"], ["rounded", "rounded"], ["circle", "circle"], ["leaf", "leaf"]]) {
      await page.eval(`window.__qrgen.setDesign(${JSON.stringify({ moduleStyle, eyeFrame, eyeBall })})`);
      await scansAs(page, payload, `${moduleStyle}/${eyeFrame}/${eyeBall}`);
    }
  }
}

/** Gradient, eye colour and a centred logo still scan, without warnings. */
export async function checkLogo(page) {
  const payload = await page.eval("window.__qrgen.payload()");
  await page.eval("window.__qrgen.setDesign({ moduleStyle: 'rounded', fg: '#1e3a8a', fg2: '#7c3aed', gradient: 'diagonal', eyeColor: '#be123c' })");
  await scansAs(page, payload, "gradient and eye colour");
  // A logo drawn in the page (no file dialog), with H as the app picks for logos.
  await page.eval(`(async () => {
    const c = document.createElement('canvas'); c.width = c.height = 96;
    const g = c.getContext('2d'); g.fillStyle = '#f97316'; g.beginPath(); g.arc(48, 48, 46, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.font = 'bold 54px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Q', 48, 52);
    await window.__qrgen.setEncoding({ ecc: 'H' });
    await window.__qrgen.setLogo(c.toDataURL('image/png'));
  })()`);
  await scansAs(page, payload, "with a logo");
  assert.equal(await page.eval("document.getElementById('warnings').children.length"), 0, "no warnings for the default logo");
}

const RED = [225, 29, 72];

/**
 * Logo files chosen in the picker and dropped on the window. AVIF is a real fixture
 * (the browser under test may not encode AVIF). TIFF is decoded by qrimage.wasm.
 * A file that is not an image is refused and the current logo stays.
 */
export async function checkLogoInputs(page) {
  assert.equal(await page.eval("document.getElementById('logo-file').accept"), LOGO_ACCEPT);
  const avif = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "logo.avif")).toString("base64");
  const rows = await page.eval(`(async () => {
    const avifBytes = Uint8Array.from(atob(${JSON.stringify(avif)}), (c) => c.charCodeAt(0));
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const input = document.getElementById("logo-file");
    async function sample(dataUrl) {
      const img = new Image();
      img.src = dataUrl;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0);
      const p = g.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data;
      return { w: c.width, h: c.height, px: [p[0], p[1], p[2], p[3]] };
    }
    async function pick(file) {
      // Two different files can become the same stored PNG (a flat red square). Plant a
      // different logo first so a successful decode is visible as a change.
      await window.__qrgen.setLogo("data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7");
      const prev = window.__qrgen.state.design.logo;
      const statusBefore = document.getElementById("status-text").textContent;
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event("change"));
      const start = performance.now();
      while (performance.now() - start < 8000) {
        const logo = window.__qrgen.state.design.logo;
        let status = document.getElementById("status-text").textContent;
        if (logo && logo !== prev) {
          const until = performance.now() + 500;
          while (!/준비|Ready/.test(status) && performance.now() < until) {
            await sleep(20);
            status = document.getElementById("status-text").textContent;
          }
          const seen = await sample(window.__qrgen.state.design.logo);
          return { ok: true, ...seen, ecc: window.__qrgen.state.encoding.ecc, status, thumb: document.getElementById("logo-thumb").classList.contains("has-logo"), cleared: input.value === "" };
        }
        if (status !== statusBefore && /열 수 없|can't be opened/.test(status)) return { ok: false, refused: true, status, unchanged: logo === prev };
        await sleep(25);
      }
      return { ok: false, timeout: true, status: document.getElementById("status-text").textContent };
    }
    async function drop(file, maxMs) {
      const prev = window.__qrgen.state.design.logo;
      const dt = new DataTransfer();
      dt.items.add(file);
      document.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
      const start = performance.now();
      while (performance.now() - start < maxMs) {
        if (window.__qrgen.state.design.logo !== prev) {
          let status = document.getElementById("status-text").textContent;
          const until = performance.now() + 500;
          while (!/준비|Ready/.test(status) && performance.now() < until) {
            await sleep(20);
            status = document.getElementById("status-text").textContent;
          }
          return { changed: true, status };
        }
        await sleep(25);
      }
      return { changed: false, status: document.getElementById("status-text").textContent };
    }
    function solid(w, h) {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const g = c.getContext("2d");
      g.fillStyle = "#e11d48";
      g.fillRect(0, 0, w, h);
      return c;
    }
    const blob = (canvas, type) => new Promise((resolve) => canvas.toBlob(resolve, type));
    await window.__qrgen.setEncoding({ ecc: "M" });
    const square = solid(32, 32);
    const rows = [];
    for (const [id, type, name] of [["png", "image/png", "a.png"], ["jpeg", "image/jpeg", "a.jpg"], ["webp", "image/webp", "a.webp"]]) {
      const file = await blob(square, type);
      rows.push({ id, ...(file ? await pick(new File([file], name, { type })) : { ok: false, error: "toBlob returned null" }) });
    }
    const mod = await import(new URL("js/exporters.js", document.baseURI).href);
    const encode = await mod.loadWasmImageEncoder(new URL("wasm/qrimage.wasm", document.baseURI).href);
    const pixels = new Uint8Array(square.getContext("2d").getImageData(0, 0, 32, 32).data.buffer);
    for (const [id, name] of [["gif", "a.gif"], ["bmp", "a.bmp"], ["ico", "a.ico"], ["tiff", "scan.tif"]]) {
      const bytes = encode(pixels, 32, 32, id, 90, 0xffffff);
      rows.push({ id, ...await pick(new File([bytes], name, { type: "" })) });
    }
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#e11d48"/></svg>';
    rows.push({ id: "svg", ...await pick(new File([svg], "a.svg", { type: "image/svg+xml" })) });
    rows.push({ id: "avif", ...await pick(new File([avifBytes], "photo.AVIF", { type: "" })) });
    const wide = new Uint8Array(520 * 8 * 4);
    for (let i = 0; i < wide.length; i += 4) { wide[i] = 225; wide[i + 1] = 29; wide[i + 2] = 72; wide[i + 3] = 255; }
    const wideTiff = encode(wide, 520, 8, "tiff", 90, 0xffffff);
    rows.push({ id: "tiff-wide", ...await pick(new File([wideTiff], "wide.tiff", { type: "image/tiff" })) });
    const large = await blob(solid(640, 40), "image/png");
    rows.push({ id: "png-large", ...await pick(new File([large], "large.png", { type: "image/png" })) });
    document.getElementById("status-text").textContent = "준비";
    rows.push({ id: "txt", ...await pick(new File(["hello"], "notes.txt", { type: "text/plain" })) });
    document.getElementById("status-text").textContent = "준비";
    rows.push({ id: "pdf", ...await pick(new File(["%PDF"], "page.pdf", { type: "application/pdf" })) });
    const again = await blob(square, "image/png");
    rows.push({ id: "png-after-reject", ...await pick(new File([again], "b.png", { type: "image/png" })) });
    const beforeDrop = window.__qrgen.state.design.logo;
    const droppedText = await drop(new File(["nope"], "notes.txt", { type: "text/plain" }), 300);
    rows.push({ id: "drop-txt", ok: !droppedText.changed && window.__qrgen.state.design.logo === beforeDrop, status: droppedText.status });
    const dropped = await drop(new File([avifBytes], "drop.avif", { type: "" }), 8000);
    rows.push({ id: "drop-avif", ok: dropped.changed, status: dropped.status });
    return rows;
  })()`);

  const tol = { png: 1, jpeg: 24, webp: 1, gif: 16, bmp: 1, ico: 8, tiff: 1, "tiff-wide": 1, svg: 1, avif: 16, "png-large": 1, "png-after-reject": 1 };
  for (const row of rows) {
    if (row.id === "txt" || row.id === "pdf") {
      assert.equal(row.refused, true, `${row.id} refused: ${JSON.stringify(row)}`);
      assert.equal(row.unchanged, true, `${row.id} left the logo in place`);
      assert.match(row.status, /열 수 없|can't be opened/);
      continue;
    }
    if (row.id === "drop-txt") {
      assert.equal(row.ok, true, JSON.stringify(row));
      continue;
    }
    if (row.id === "drop-avif") {
      assert.equal(row.ok, true, JSON.stringify(row));
      assert.match(row.status, /준비|Ready/);
      continue;
    }
    assert.equal(row.ok, true, `${row.id}: ${JSON.stringify(row)}`);
    assert.equal(row.thumb, true, row.id);
    assert.equal(row.cleared, true, `${row.id} input cleared so the same file can be chosen again`);
    assert.equal(row.ecc, "H", `${row.id} switches to error correction H`);
    assert.match(row.status, /준비|Ready/, `${row.id} clears an earlier error`);
    assert.ok(row.w > 0 && row.h > 0 && row.w <= 512 && row.h <= 512, `${row.id} size ${row.w}×${row.h}`);
    if (row.id === "png-large") {
      assert.equal(row.w, 512, "a wide logo is scaled so the long side is 512");
      assert.equal(row.h, 32);
    }
    if (row.id === "tiff-wide") {
      assert.equal(row.w, 512);
      assert.ok(row.h < 8, `tiff long side capped, height ${row.h}`);
    }
    if (row.id === "avif") assert.equal(row.w, 64, "AVIF keeps its size when it is already small");
    const slack = tol[row.id];
    if (slack != null) {
      RED.forEach((channel, i) => assert.ok(Math.abs(row.px[i] - channel) <= slack, `${row.id} pixel ${row.px} near ${RED}`));
      assert.equal(row.px[3], 255, row.id);
    }
  }
}

/** Too much data for a forced small version shows an error instead of a stale code. */
export async function checkTooLong(page) {
  await page.eval("(async () => { await window.__qrgen.setEncoding({ version: 1 }); await window.__qrgen.setType('text'); await window.__qrgen.setValue('text', 'x'.repeat(200)); })()");
  assert.equal(await page.eval("document.getElementById('message').hidden"), false);
  assert.match(await page.eval("document.getElementById('message').textContent"), /2\d\d|bit|비트/);
  assert.equal(await page.eval("document.getElementById('save').disabled"), true);
  await page.eval("(async () => { await window.__qrgen.setEncoding({ version: 0 }); await window.__qrgen.setValue('text', 'QR Generator'); })()");
  await scansAs(page, "QR Generator", "back to automatic version");
}

/** Decodes an exported file with the browser's own image decoders and scans it. */
export async function scansFile(page, bytes, mime, expected, what) {
  const { width, height, rgba } = await page.eval(`(async () => {
    const bytes = Uint8Array.from(atob(${JSON.stringify(Buffer.from(bytes).toString("base64"))}), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: ${JSON.stringify(mime)} });
    let source;
    if (${JSON.stringify(mime)} === "image/svg+xml") {
      source = new Image();
      source.src = URL.createObjectURL(blob);
      await source.decode();
    } else {
      source = await createImageBitmap(blob);
    }
    const w = source.width, h = source.height;
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); g.drawImage(source, 0, 0);
    const data = new Uint8Array(g.getImageData(0, 0, w, h).data.buffer);
    let s = ""; for (let i = 0; i < data.length; i += 0x8000) s += String.fromCharCode.apply(null, data.subarray(i, i + 0x8000));
    return { width: w, height: h, rgba: btoa(s) };
  })()`);
  const found = jsQR(new Uint8ClampedArray(Buffer.from(rgba, "base64")), width, height);
  assert.ok(found, `${what}: the exported file did not scan`);
  assert.equal(found.data, expected, what);
  return { width, height };
}

export const SIGNATURES = { png: "89504e47", jpeg: "ffd8ff", webp: "52494646", gif: "47494638", bmp: "424d", tiff: "49492a00", ico: "00000100", svg: "3c737667", pdf: "25504446", eps: "25215053" };
const MIME = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", bmp: "image/bmp", ico: "image/x-icon", svg: "image/svg+xml" };

/**
 * Exports every format through `getBytes(formatId)` and checks it: right signature, and the
 * browser-decodable ones must scan. TIFF (no browser decoder) and PDF/EPS (Ghostscript checks
 * them in test/export.test.js) are checked by signature here.
 */
export async function checkExports(page, getBytes) {
  await page.eval("(async () => { await window.__qrgen.setType('url'); await window.__qrgen.setValue('url', 'https://example.com/export'); window.__qrgen.setDesign({ moduleStyle: 'rounded', gradient: 'none', transparent: false }); window.__qrgen.setExport({ size: 512, quality: 90, printMm: 40 }); })()");
  const expected = await page.eval("window.__qrgen.payload()");
  for (const id of Object.keys(SIGNATURES)) {
    const bytes = await getBytes(id);
    assert.ok(Buffer.from(bytes.subarray(0, 4)).toString("hex").startsWith(SIGNATURES[id]), `${id} signature`);
    if (MIME[id]) {
      const size = await scansFile(page, bytes, MIME[id], expected, `${id} export`);
      if (id === "ico") assert.equal(size.width, 256, "ICO is capped at 256 px");
      else if (id !== "svg") assert.equal(size.width, 512, `${id} size`);
    }
  }
}

/** Picks a value from an in-page dropdown list (browser build). */
export async function pickInPage(page, root, value) {
  await page.eval(`document.querySelector("#${root} .iselect-button").click()`);
  assert.equal(await page.eval(`document.querySelector("#${root} .iselect-list").hidden`), false, `${root} opens`);
  assert.equal(await page.eval(`[...document.querySelectorAll("#${root} .iselect-option")].every((o) => o.querySelector("svg"))`), true, `${root} options have icons`);
  await page.eval(`document.querySelector('#${root} .iselect-option[data-value="${value}"]').click()`);
}

/**
 * At each width (both languages): language, theme, program settings, program info and window
 * buttons fully visible; every toolbar button keeps a visible icon; nothing overlaps.
 */
export async function checkToolbarFit(page, widths) {
  await page.eval("document.getElementById('window-controls').hidden = false");
  for (const lang of ["ko", "en"]) {
    await page.eval(`(() => { const s = window.__qrgen.selects.lang; s.pick("${lang}"); })()`);
    for (const width of widths) {
      await page.send("Emulation.setDeviceMetricsOverride", { width, height: 760, deviceScaleFactor: 1, mobile: false });
      await new Promise((r) => setTimeout(r, 250));
      const report = await page.eval(`(() => {
        const vw = document.documentElement.clientWidth;
        const box = (el) => el.getBoundingClientRect();
        const must = ["#lang-select", "#theme-select", "#app-settings", "#app-about", "#win-min", "#win-max", "#win-close"].map((s) => [s, box(document.querySelector(s))]);
        const outside = must.filter(([, b]) => b.left < 0 || b.right > vw + 0.5 || b.width < 20).map(([s]) => s);
        const labels = ["#lang-select .iselect-label", "#theme-select .iselect-label"].filter((s) => { const e = document.querySelector(s); return !e || e.offsetWidth === 0 || e.scrollWidth > e.clientWidth + 0.5; });
        const icons = [...document.querySelectorAll(".toolbar .tb")].filter((b) => { const i = b.querySelector("svg"); return !i || box(i).width < 10 || box(b).right > vw + 0.5; }).map((b) => b.id);
        const items = [...document.querySelectorAll(".main-bar > *:not(.tb-spacer)")].map(box).sort((a, b) => a.left - b.left);
        const overlaps = items.some((b, i) => i && b.left < items[i - 1].right - 0.5);
        return { outside, labels, icons, overlaps, overflow: document.querySelector(".main-bar").scrollWidth - document.querySelector(".main-bar").clientWidth };
      })()`);
      assert.deepEqual(report, { outside: [], labels: [], icons: [], overlaps: false, overflow: 0 }, `toolbar at ${width}px (${lang})`);
    }
  }
  await page.eval("document.getElementById('window-controls').hidden = true");
}

/** Toolbar: every item shows an icon; toggles flip their option. */
export async function checkToolbar(page, pick = pickInPage) {
  const missing = await page.eval(`[...document.querySelectorAll(".toolbar .tb, .toolbar .iselect-button")].filter((b) => !b.querySelector("svg")).map((b) => b.id || b.textContent)`);
  assert.deepEqual(missing, [], "toolbar items without an icon");
  for (const [id, path] of [["transparent", "design.transparent"], ["boost", "encoding.boostEcc"], ["eci", "encoding.eciUtf8"]]) {
    const before = await page.eval(`window.__qrgen.state.${path}`);
    await page.eval(`document.getElementById("${id}").click()`);
    assert.equal(await page.eval(`window.__qrgen.state.${path}`), !before, id);
    assert.equal(await page.eval(`document.getElementById("${id}").getAttribute("aria-pressed")`), String(!before), `${id} shows its state`);
    await page.eval(`document.getElementById("${id}").click()`);
  }
  // Dropdowns: open, every option has an icon, pick one. Format is chosen in the save dialog.
  for (const [root, value] of [["theme-select", "dark"], ["lang-select", "en"]]) await pick(page, root, value);
  assert.equal(await page.eval("document.documentElement.dataset.theme"), "dark");
  await page.eval("document.getElementById('save').click()");
  assert.equal(await page.eval("document.getElementById('modal').hidden"), false, "save format dialog opens");
  assert.equal(await page.eval("document.getElementById('modal-title').textContent"), "Format");
  await page.eval("document.querySelector('#modal [data-format=\"pdf\"]').click()");
  assert.equal(await page.eval("window.__qrgen.state.export.format"), "pdf");
  assert.equal(await page.eval("document.getElementById('save-label').textContent"), "Save");
  assert.equal(await page.eval("document.getElementById('print-field').classList.contains('off')"), false, "PDF enables the print size");
  assert.equal(await page.eval("document.getElementById('quality-field').classList.contains('off')"), true, "PDF has no JPEG quality");
  assert.equal(await page.eval("document.querySelector('#size-field .size-grid').classList.contains('off')"), true);
  await page.eval("document.getElementById('modal-close').click()");

  // Every button in the left panel and the status bar items carry an icon.
  const bare = await page.eval(`[...document.querySelectorAll(".column .card:not(#card-export) button, #card-export button.step")].filter((b) => !b.querySelector("svg")).map((b) => b.id || b.textContent)`);
  assert.deepEqual(bare, [], "left-panel buttons without an icon");
  assert.notEqual(await page.eval("document.querySelector('#lang-select .iselect-button use').getAttribute('href')"), "#i-lang-ko", "English shows its own icon");

  await page.eval("document.getElementById('app-settings').click()");
  assert.equal(await page.eval("document.getElementById('modal').hidden"), false, "settings opens");
  assert.equal(await page.eval("document.getElementById('modal-title').textContent"), await page.eval("document.getElementById('app-settings').title"));
  await page.eval("document.querySelector('#modal [data-setting=\"theme\"][data-value=\"light\"]').click()");
  assert.equal(await page.eval("document.documentElement.dataset.theme"), "light", "settings changes the theme");
  await page.eval("document.querySelector('#modal [data-setting=\"theme\"][data-value=\"dark\"]').click()");
  await page.eval("document.getElementById('modal-close').click()");
  assert.equal(await page.eval("document.getElementById('modal').hidden"), true, "settings closes");
  await page.eval("document.getElementById('app-about').click()");
  assert.equal(await page.eval("document.getElementById('modal-title').textContent"), await page.eval("document.getElementById('app-about').title"));
  assert.match(await page.eval("document.getElementById('modal-body').textContent"), /MyQRGenerator/);
  await page.eval("document.querySelector('#modal .modal-actions button').click()");
  assert.equal(await page.eval("document.getElementById('modal').hidden"), true, "about closes");
}

/** Cards move by dragging their heading; "reset layout" brings back the default. */
export async function checkLayout(page) {
  assert.deepEqual(await page.eval("window.__qrgen.layout()"), [["card-content", "card-logo", "card-design"], ["card-encoding", "card-export"], ["card-preview"]], "default: QR code on the right");
  const centre = (sel) => page.eval(`(() => { const r = document.querySelector('${sel}').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  const preview = await page.eval("(() => { const r = document.getElementById('card-preview').getBoundingClientRect(); return r.left; })()");
  const logo = await page.eval("(() => { const r = document.getElementById('card-logo').getBoundingClientRect(); return r.right; })()");
  assert.ok(preview > logo, "the QR code sits to the right of the groups");
  // Drag the logo card onto the top of the third column (above the QR code).
  const [hx, hy] = await centre("#card-logo .drag-handle");
  const [tx, ty] = await centre("#card-preview > h2");
  await page.eval(`(() => {
    const h = document.querySelector('#card-logo .drag-handle');
    const opts = (x, y) => ({ clientX: x, clientY: y, button: 0, pointerId: 1, bubbles: true });
    h.dispatchEvent(new PointerEvent('pointerdown', opts(${hx}, ${hy})));
    h.dispatchEvent(new PointerEvent('pointermove', opts(${(hx + tx) / 2}, ${hy})));
    h.dispatchEvent(new PointerEvent('pointermove', opts(${tx}, ${ty - 4})));
    h.dispatchEvent(new PointerEvent('pointerup', opts(${tx}, ${ty - 4})));
  })()`);
  assert.deepEqual(await page.eval("window.__qrgen.layout()"), [["card-content", "card-design"], ["card-encoding", "card-export"], ["card-logo", "card-preview"]], "logo moved above the QR code");
  assert.equal(await page.eval("document.getElementById('card-logo').parentElement.dataset.col"), "2");
  assert.equal(await page.eval("document.querySelector('.drop-placeholder')"), null, "no placeholder left behind");
  await page.eval("document.getElementById('layout-reset').click()");
  assert.deepEqual(await page.eval("window.__qrgen.layout()"), [["card-content", "card-logo", "card-design"], ["card-encoding", "card-export"], ["card-preview"]]);
  assert.equal(await page.eval("[...document.querySelectorAll('.card > h2')].every((h) => h.querySelector('.drag-handle svg'))"), true, "every card has a handle");
}

/** −/+ steppers, the default size, and undo/redo across a few kinds of change. */
export async function checkEditing(page) {
  await page.eval("(async () => { window.__qrgen.setDesign({ margin: 4 }); window.__qrgen.setExport({ format: 'png', size: 1024 }); })()");
  const click = (sel) => page.eval(`(() => { const b = document.querySelector('${sel}'); b.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true })); b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); })()`);
  await click('.step[data-for="margin"][data-step="1"]');
  assert.equal(await page.eval("window.__qrgen.state.design.margin"), 5, "+ raises the margin");
  assert.equal(await page.eval("document.getElementById('margin-out').textContent"), "5");
  await click('.step[data-for="margin"][data-step="-1"]');
  await click('.step[data-for="margin"][data-step="-1"]');
  assert.equal(await page.eval("window.__qrgen.state.design.margin"), 3, "− lowers the margin");
  await click('.step[data-for="export-size"][data-step="1"]');
  assert.equal(await page.eval("window.__qrgen.state.export.size"), 1088, "+ steps the export size by 64");
  await page.eval("document.getElementById('size-default').click()");
  assert.equal(await page.eval("window.__qrgen.state.export.size"), 1024, "default size");
  assert.equal(await page.eval("document.getElementById('export-size').value"), "1024");

  // Undo/redo: a text edit, a style change and a toolbar toggle, each one step.
  await new Promise((r) => setTimeout(r, 800));
  await page.eval("(async () => { await window.__qrgen.setType('text'); })()");
  await new Promise((r) => setTimeout(r, 800));
  await page.eval(`(async () => { const f = document.getElementById('field-text-text'); f.focus(); for (const v of ['u', 'un', 'undo me']) { f.value = v; f.dispatchEvent(new Event('input')); await new Promise((r) => setTimeout(r, 30)); } f.blur(); })()`);
  await new Promise((r) => setTimeout(r, 800));
  await page.eval("document.querySelector('[data-design=\"moduleStyle\"] button[data-value=\"dots\"]').click()");
  await new Promise((r) => setTimeout(r, 800));
  await page.eval("document.getElementById('transparent').click()");
  assert.equal(await page.eval("window.__qrgen.state.design.transparent"), true);

  await page.eval("document.getElementById('undo').click()");
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(await page.eval("window.__qrgen.state.design.transparent"), false, "undo the toggle");
  assert.equal(await page.eval("document.getElementById('transparent').getAttribute('aria-pressed')"), "false");
  await page.eval("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }))");
  await new Promise((r) => setTimeout(r, 200));
  assert.notEqual(await page.eval("window.__qrgen.state.design.moduleStyle"), "dots", "Ctrl+Z undoes the style");
  await page.eval("document.getElementById('undo').click()");
  await new Promise((r) => setTimeout(r, 200));
  assert.notEqual(await page.eval("window.__qrgen.payload()"), "undo me", "undo the whole typed text at once");
  await page.eval("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true }))");
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(await page.eval("window.__qrgen.payload()"), "undo me", "Ctrl+Y redoes it");
  assert.equal(await page.eval("document.getElementById('field-text-text').value"), "undo me", "the field shows the redone text");
  await page.eval("document.getElementById('redo').click()");
  await page.eval("document.getElementById('redo').click()");
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(await page.eval("window.__qrgen.state.design.transparent"), true);
  assert.equal(await page.eval("document.getElementById('redo').disabled"), true, "nothing left to redo");
  await page.eval("document.getElementById('transparent').click()");
}
