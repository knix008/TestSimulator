// `npm run tutorial`: films the desktop app being used, slowly, as a tutorial video
// (QRGenerator-Tutorial.mp4 in the project root).
//
// It runs the latest code as a separate instance (own settings, save folder and WebView2
// profile, so a copy the user has open is not touched), drives it with real mouse and
// keyboard input over the DevTools protocol, shows a cursor, click ripples and captions,
// grabs frames with their timestamps and encodes them with ffmpeg (FFMPEG=… or ffmpeg on PATH).
import { execFileSync, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import jsQR from "jsqr";
import { Page, waitFor } from "../test/cdp.js";
import { freePort } from "./free-port.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.join(root, "QRGenerator-Tutorial.mp4");
const FPS_INTERVAL = 66; // ~15 captures per second; the video is encoded at 30 fps
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findFfmpeg() {
  if (process.env.FFMPEG && fs.existsSync(process.env.FFMPEG)) return process.env.FFMPEG;
  const onPath = spawnSync(process.platform === "win32" ? "where" : "which", ["ffmpeg"], { encoding: "utf8" });
  if (onPath.status === 0) return onPath.stdout.split(/\r?\n/)[0].trim();
  throw new Error("ffmpeg not found: put it on PATH or set FFMPEG=path/to/ffmpeg");
}

// ---- Overlay drawn into the page: cursor, click ripple, captions, title cards ----
const OVERLAY = `(() => {
  if (window.__tut) return;
  const style = document.createElement("style");
  style.textContent = \`
    #tut-cursor { position: fixed; left: -50px; top: -50px; width: 26px; height: 26px; z-index: 2147483647; pointer-events: none; filter: drop-shadow(0 2px 3px rgba(0,0,0,.5)); }
    #tut-ripple { position: fixed; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%; border: 3px solid #f59e0b; z-index: 2147483646; pointer-events: none; opacity: 0; }
    #tut-ripple.go { animation: tut-ripple .55s ease-out; }
    @keyframes tut-ripple { from { opacity: 1; transform: scale(.3); } to { opacity: 0; transform: scale(1.5); } }
    #tut-caption { position: fixed; left: 50%; bottom: 46px; transform: translateX(-50%); max-width: 82%; background: rgba(15,23,42,.9); color: #fff;
      font: 600 19px "Malgun Gothic", "Segoe UI", sans-serif; padding: 10px 24px 11px; border-radius: 12px; z-index: 2147483645; pointer-events: none;
      box-shadow: 0 8px 28px rgba(0,0,0,.35); text-align: center; opacity: 0; transition: opacity .25s; }
    #tut-caption.on { opacity: 1; }
    #tut-caption small { display: block; font-weight: 400; font-size: 14px; opacity: .82; margin-top: 3px; }
    #tut-step { display: inline-block; background: #2563eb; border-radius: 6px; padding: 0 8px; margin-right: 10px; font-size: 15px; }
    #tut-title { position: fixed; inset: 0; background: radial-gradient(circle at 30% 20%, #1e3a8a, #0f172a 70%); color: #fff; display: grid; place-items: center;
      text-align: center; z-index: 2147483644; font: 700 44px "Malgun Gothic", "Segoe UI", sans-serif; transition: opacity .5s; pointer-events: none; }
    #tut-title small { display: block; font: 400 20px "Malgun Gothic", "Segoe UI", sans-serif; opacity: .85; margin-top: 16px; line-height: 1.6; }
    #tut-title img { width: 120px; height: 120px; display: block; margin: 0 auto 22px; }
  \`;
  document.head.append(style);
  const cursor = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  cursor.id = "tut-cursor";
  cursor.setAttribute("viewBox", "0 0 24 24");
  cursor.innerHTML = '<path d="M4 2.5v17.2l4.6-4.3 3 6.6 3-1.4-3-6.4h6.3z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/>';
  const ripple = Object.assign(document.createElement("div"), { id: "tut-ripple" });
  const caption = Object.assign(document.createElement("div"), { id: "tut-caption" });
  const title = Object.assign(document.createElement("div"), { id: "tut-title" });
  title.style.opacity = "0";
  document.body.append(title, caption, ripple, cursor);
  // Pointer events: a drag handle cancels pointerdown, which stops the compatibility mouse events.
  document.addEventListener("pointermove", (e) => { cursor.style.left = e.clientX - 3 + "px"; cursor.style.top = e.clientY - 2 + "px"; }, true);
  document.addEventListener("pointerdown", (e) => {
    ripple.style.left = e.clientX + "px"; ripple.style.top = e.clientY + "px";
    ripple.classList.remove("go"); void ripple.offsetWidth; ripple.classList.add("go");
  }, true);
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
  window.__tut = {
    caption(step, text, sub) {
      caption.innerHTML = (step ? '<span id="tut-step">' + esc(step) + "</span>" : "") + esc(text) + (sub ? "<small>" + esc(sub) + "</small>" : "");
      caption.classList.add("on");
    },
    hideCaption() { caption.classList.remove("on"); },
    title(text, sub) {
      title.innerHTML = '<div><img src="icon.png" alt="">' + esc(text) + (sub ? "<small>" + sub.split("\\n").map(esc).join("<br>") + "</small>" : "") + "</div>";
      title.style.opacity = "1";
    },
    hideTitle() { title.style.opacity = "0"; },
  };
})()`;

class Recorder {
  constructor(page, dir) {
    this.page = page;
    this.dir = dir;
    this.frames = [];
    this.running = false;
  }

  start() {
    this.running = true;
    this.loop = (async () => {
      while (this.running) {
        const t = Date.now();
        try {
          const { data } = await this.page.send("Page.captureScreenshot", { format: "jpeg", quality: 90 });
          const file = path.join(this.dir, `f${String(this.frames.length).padStart(5, "0")}.jpg`);
          fs.writeFileSync(file, Buffer.from(data, "base64"));
          this.frames.push({ file, t });
        } catch {
          // A frame lost while the page repaints; the next one follows.
        }
        await sleep(Math.max(0, FPS_INTERVAL - (Date.now() - t)));
      }
    })();
  }

  async stop() {
    this.running = false;
    await this.loop;
  }

  /** Encodes the frames with their real timing (concat demuxer durations) to H.264. */
  encode(output) {
    const list = this.frames.map((f, i) => {
      const next = this.frames[i + 1];
      const duration = next ? (next.t - f.t) / 1000 : 1.5;
      return `file '${f.file.replace(/\\/g, "/")}'\nduration ${duration.toFixed(3)}`;
    });
    list.push(`file '${this.frames.at(-1).file.replace(/\\/g, "/")}'`);
    const listFile = path.join(this.dir, "frames.txt");
    fs.writeFileSync(listFile, list.join("\n"));
    execFileSync(
      findFfmpeg(),
      ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listFile, "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p", "-r", "30", "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-movflags", "+faststart", output],
      { stdio: "inherit" },
    );
  }
}

/** Real mouse and keyboard input into the page, with a visible, smoothly moving cursor. */
class Driver {
  constructor(page) {
    this.page = page;
    this.x = 660;
    this.y = 420;
  }

  mouse(type, x, y, extra = {}) {
    return this.page.send("Input.dispatchMouseEvent", { type, x, y, ...extra });
  }

  async center(selector, dx = 0.5, dy = 0.5) {
    const r = await this.page.eval(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; e.scrollIntoView({ block: "nearest" }); const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()`);
    if (!r) throw new Error(`not found: ${selector}`);
    return [r[0] + r[2] * dx, r[1] + r[3] * dy];
  }

  async moveTo(x, y, ms = 650, buttons = 0) {
    const steps = Math.max(1, Math.round(ms / 16));
    const [x0, y0] = [this.x, this.y];
    for (let i = 1; i <= steps; i += 1) {
      const k = i / steps;
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2; // ease in-out
      this.x = x0 + (x - x0) * e;
      this.y = y0 + (y - y0) * e;
      await this.mouse("mouseMoved", this.x, this.y, buttons ? { button: "left", buttons } : {});
      await sleep(16);
    }
  }

  async click(selector, { pause = 700, dx, dy } = {}) {
    const [x, y] = await this.center(selector, dx, dy);
    await this.moveTo(x, y);
    await sleep(120);
    await this.mouse("mousePressed", x, y, { button: "left", buttons: 1, clickCount: 1 });
    await sleep(90);
    await this.mouse("mouseReleased", x, y, { button: "left", buttons: 0, clickCount: 1 });
    await sleep(pause);
  }

  /** Holds the button on an element (steppers repeat while held). */
  async hold(selector, ms) {
    const [x, y] = await this.center(selector);
    await this.moveTo(x, y);
    await this.mouse("mousePressed", x, y, { button: "left", buttons: 1, clickCount: 1 });
    await sleep(ms);
    await this.mouse("mouseReleased", x, y, { button: "left", buttons: 0, clickCount: 1 });
    await sleep(500);
  }

  async drag(fromSelector, toSelector, { toDy = 0.5 } = {}) {
    const [x0, y0] = await this.center(fromSelector);
    await this.moveTo(x0, y0);
    await sleep(200);
    await this.mouse("mousePressed", x0, y0, { button: "left", buttons: 1, clickCount: 1 });
    await sleep(250);
    const [x1, y1] = await this.center(toSelector, 0.5, toDy);
    await this.moveTo(x1, y1, 1400, 1);
    await sleep(400);
    await this.mouse("mouseReleased", x1, y1, { button: "left", buttons: 0, clickCount: 1 });
    await sleep(900);
  }

  /** Clicks a field, clears it and types like a person. */
  async type(selector, text, { delay = 75, pause = 700 } = {}) {
    await this.click(selector, { pause: 250 });
    await this.page.eval(`document.querySelector(${JSON.stringify(selector)}).select()`);
    for (const ch of text) {
      await this.page.send("Input.insertText", { text: ch });
      await sleep(delay);
    }
    await sleep(pause);
  }

  /** Opens an in-page dropdown and picks a value. */
  async pick(rootId, value, pause = 900) {
    await this.click(`#${rootId} .iselect-button`, { pause: 650 });
    await this.click(`#${rootId} .iselect-option[data-value="${value}"]`, { pause });
  }
}

async function run() {
  console.log("Building the latest desktop code…");
  const targetDir = path.join(root, "src-tauri", "target", "e2e");
  execFileSync(process.execPath, [path.join(root, "scripts", "build-wasm.js")], { cwd: root, stdio: "ignore" });
  execFileSync("cargo", ["build", "--manifest-path", path.join(root, "src-tauri", "Cargo.toml"), "--target-dir", targetDir], { cwd: root, stdio: "inherit" });
  const exe = path.join(targetDir, "debug", process.platform === "win32" ? "qrgenerator.exe" : "qrgenerator");

  const work = fs.mkdtempSync(path.join(os.tmpdir(), "qrgen-tutorial-"));
  const frames = path.join(root, "test", ".out", "tutorial-frames");
  fs.rmSync(frames, { recursive: true, force: true });
  fs.mkdirSync(frames, { recursive: true });
  for (const dir of ["config", "saves"]) fs.mkdirSync(path.join(work, dir), { recursive: true });
  // A light theme reads best in a video.
  fs.writeFileSync(path.join(work, "config", "settings.json"), JSON.stringify({ theme: "light", lang: "ko" }));

  const port = await freePort(9460);
  const child = spawn(exe, [], {
    env: { ...process.env, QRGEN_DEBUG_PORT: String(port), QRGEN_CONFIG_DIR: path.join(work, "config"), QRGEN_SAVE_DIR: path.join(work, "saves"), QRGEN_WEBVIEW_DIR: path.join(work, "webview") },
    stdio: "ignore",
  });
  let page;
  try {
    page = await Page.attach(port, (url) => !url.includes("menu.html") && (url.includes("index.html") || url.includes("tauri.localhost")));
    await waitFor(() => page.eval("Boolean(window.__qrgen && window.__qrgen.result())"), { what: "the app" });
    await page.eval("window.__qrgen.inPageMenus()");
    await page.eval(OVERLAY);
    const tut = (js) => page.eval(`window.__tut.${js}`);
    const caption = (step, text, sub = "") => tut(`caption(${JSON.stringify(step)}, ${JSON.stringify(text)}, ${JSON.stringify(sub)})`);
    const d = new Driver(page);
    await d.mouse("mouseMoved", d.x, d.y);

    const recorder = new Recorder(page, frames);
    await tut(`title("QR Generator 사용법", "Rust 인코더 + JavaScript 디자이너\\nWindows · macOS · Linux · 웹")`);
    recorder.start();
    await sleep(3000);
    await tut("hideTitle()");
    await sleep(800);

    // 1. Content
    await caption("1", "내용 종류를 고르고 입력합니다", "입력하는 즉시 QR 코드가 바뀝니다");
    await d.click('.type-tab[data-type="url"]');
    await d.type("#field-url-url", "github.com/knix008/TestSimulator");
    await caption("1", "Wi-Fi: 네트워크 이름과 비밀번호", "스캔하면 바로 접속됩니다 (비밀번호는 저장되지 않음)");
    await d.click('.type-tab[data-type="wifi"]');
    await d.type("#field-wifi-ssid", "MyHome-5G");
    await d.type("#field-wifi-password", "secret1234");
    await caption("1", "연락처(vCard), 이메일, SMS, 전화, 위치도 같은 방식입니다");
    await d.click('.type-tab[data-type="vcard"]');
    await d.type("#field-vcard-lastName", "홍", { delay: 120 });
    await d.type("#field-vcard-firstName", "길동", { delay: 120 });
    await d.type("#field-vcard-phone", "010-1234-5678", { delay: 55 });
    await d.click('.type-tab[data-type="url"]', { pause: 900 });

    // 2. Design
    await caption("2", "디자인: 모듈 모양과 눈(모서리) 모양", "모든 버튼에 모양 그림이 있습니다");
    for (const v of ["dots", "bars", "rounded"]) await d.click(`[data-design="moduleStyle"] button[data-value="${v}"]`, { pause: 800 });
    await d.click('[data-design="eyeFrame"] button[data-value="leaf"]');
    await d.click('[data-design="eyeBall"] button[data-value="circle"]');
    await caption("2", "그라데이션과 색상", "드롭다운도 항목마다 아이콘이 있습니다");
    await d.pick("gradient-select", "diagonal", 500);
    await page.eval("window.__qrgen.setDesign({ fg: '#1e3a8a', fg2: '#7c3aed', eyeColor: '#be123c' })");
    await sleep(1200);
    await caption("2", "여백은 −/+ 버튼으로 조절 (누르고 있으면 반복)");
    await d.click('.step[data-for="margin"][data-step="-1"]', { pause: 500 });
    await d.click('.step[data-for="margin"][data-step="1"]', { pause: 900 });

    // 3. Logo and error correction
    await caption("3", "로고 넣기", "이미지 선택… 또는 창에 그림을 끌어다 놓기 — 오류 정정은 자동으로 H");
    await d.moveTo(...(await d.center("#logo-choose")));
    await page.eval(`(async () => {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d'); g.fillStyle = '#f97316'; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff'; g.font = 'bold 76px Segoe UI, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Q', 64, 70);
      await window.__qrgen.setEncoding({ ecc: 'H' });
      await window.__qrgen.setLogo(c.toDataURL('image/png'));
    })()`);
    await sleep(1500);
    await d.hold('.step[data-for="logo-scale"][data-step="1"]', 700);
    await caption("3", "오류 정정 수준: 높을수록 가려져도 읽힙니다", "아래 정보: 버전 · 크기 · 마스크 · 용량");
    await d.click('#ecc button[data-value="Q"]', { pause: 900 });
    await d.click('#ecc button[data-value="H"]', { pause: 900 });

    // 4. Toolbar options and undo
    await caption("4", "입력이 없는 켜기/끄기는 툴바에 있습니다");
    await d.click("#transparent", { pause: 1000 });
    await d.click("#transparent", { pause: 600 });
    await d.click("#swap", { pause: 1000 });
    await caption("4", "실행 취소 / 다시 실행", "Ctrl+Z · Ctrl+Y");
    await d.click("#undo", { pause: 1000 });
    await d.click("#redo", { pause: 800 });
    await d.click("#undo", { pause: 900 });

    // 5. Layout
    await caption("5", "카드는 제목의 ⠿ 손잡이로 끌어서 옮깁니다", "배치는 저장되고, 배치 초기화로 되돌립니다");
    await d.drag("#card-logo .drag-handle", "#card-preview > h2", { toDy: 0.2 });
    await sleep(600);
    await d.click("#layout-reset", { pause: 1000 });

    // 6. Export
    await caption("6", "내보내기 형식: 이미지 7종 + 벡터 3종", "PNG · JPEG · WebP · GIF · BMP · TIFF · ICO · SVG · PDF · EPS");
    await d.pick("format-select", "pdf");
    await caption("6", "PDF·EPS는 인쇄 크기(mm)를 정합니다");
    await d.click('.step[data-for="print-size"][data-step="1"]', { pause: 400 });
    await d.click('.step[data-for="print-size"][data-step="1"]', { pause: 800 });
    await d.pick("format-select", "png", 700);
    await caption("6", "크기를 고르고 저장 (Ctrl+S)", "결과는 아래 상태 표시줄에 나옵니다");
    await d.click('#size-chips button:nth-child(4)', { pause: 600 });
    await d.click("#save", { pause: 1800 });

    // 7. Language and theme
    await caption("7", "언어와 테마", "한국어(ㅎㆍㄴ) · English(Aa) · 시스템 · 라이트 · 다크");
    await d.pick("theme-select", "dark", 1300);
    await d.pick("lang-select", "en", 1300);
    await d.pick("lang-select", "ko", 900);
    await d.pick("theme-select", "light", 1000);
    await tut("hideCaption()");
    await sleep(600);

    // The finished code must still scan.
    const shot = await page.eval("window.__qrgen.previewPixels()");
    const found = jsQR(new Uint8ClampedArray(Buffer.from(shot.rgba, "base64")), shot.width, shot.height);
    const payload = await page.eval("window.__qrgen.payload()");
    if (found?.data !== payload) throw new Error(`the final QR code did not scan (${found?.data} ≠ ${payload})`);

    await tut(`title("완성!", "만든 QR 코드는 스캔으로 확인했습니다\\nnpm test — 82개 테스트로 같은 과정을 자동 검증합니다")`);
    await sleep(3200);
    await recorder.stop();
    console.log(`${recorder.frames.length} frames, ${((recorder.frames.at(-1).t - recorder.frames[0].t) / 1000).toFixed(1)} s — encoding…`);
    recorder.encode(OUTPUT);
    console.log(`Tutorial video: ${OUTPUT} (${(fs.statSync(OUTPUT).size / 1024 / 1024).toFixed(1)} MB)`);
  } finally {
    page?.close();
    if (child.exitCode === null) {
      if (process.platform === "win32") execFileSync("taskkill", ["/T", "/F", "/PID", String(child.pid)], { stdio: "ignore" });
      else child.kill();
    }
    await sleep(800);
    fs.rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
