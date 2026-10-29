// The user manual window: the program's theme (also when it changes while the
// manual is open), the language switch (한국어 / English) and the text size
// (−, current size centred, +), checked in the real manual window:
//   node test/smoke/manual-probe.mjs [--shots dir]
import fs from "node:fs";
import path from "node:path";
import { launch, sleep } from "./driver.mjs";

const shotsArg = process.argv.indexOf("--shots");
const shots = shotsArg > 0 ? path.resolve(process.argv[shotsArg + 1]) : null;
if (shots) fs.mkdirSync(shots, { recursive: true });
const a = await launch({ width: 1400, height: 900 });
const app = (x) => a.ev(`const app = window.myarchApp; ${x}`);
let failed = 0;
const check = (name, ok, detail = "") => { if (!ok) failed++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? `  — ${detail}` : ""}`); };

// The manual window's own DevTools target.
async function manual() {
  for (let i = 0; i < 60; i++) {
    const list = await (await fetch(`http://127.0.0.1:${a.port}/json`)).json();
    const t = list.find((x) => x.type === "page" && /USERSGUIDE/.test(x.url));
    if (t) {
      const ws = new WebSocket(t.webSocketDebuggerUrl);
      await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
      let id = 0; const pending = new Map();
      ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } };
      const send = (method, params = {}) => new Promise((res) => { const i2 = ++id; pending.set(i2, res); ws.send(JSON.stringify({ id: i2, method, params })); });
      const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text); return r.result.result.value; };
      for (let j = 0; j < 50; j++) { if (await ev(`return document.readyState === "complete" && !!document.getElementById("fs-value")`).catch(() => false)) break; await sleep(100); }
      return { ev, send, url: t.url, close: () => ws.close() };
    }
    await sleep(200);
  }
  throw new Error("manual window did not open");
}
const shot = async (m, file) => { if (!shots) return; const r = await m.send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(path.join(shots, file), Buffer.from(r.result.data, "base64")); };
const STATE = `const cs = getComputedStyle(document.documentElement); const out = document.getElementById("fs-value"), dec = document.getElementById("fs-dec"), inc = document.getElementById("fs-inc");
  const o = out.getBoundingClientRect(), d = dec.getBoundingClientRect(), i = inc.getBoundingClientRect(), r = document.createRange(); r.selectNodeContents(out); const tx = r.getBoundingClientRect();
  return { lang: document.documentElement.lang, title: document.title, mode: document.documentElement.dataset.mode || "", bg: cs.getPropertyValue("--bg").trim(), body: getComputedStyle(document.body).backgroundColor,
    fs: getComputedStyle(document.querySelector("main")).fontSize, out: out.textContent, decDisabled: dec.disabled, incDisabled: inc.disabled,
    order: d.right <= o.left + 1 && o.right <= i.left + 1, centre: Math.abs((tx.left + tx.right) / 2 - (o.left + o.right) / 2), sameRow: Math.abs(d.top - i.top) < 2 && Math.abs(o.top - d.top) < 4,
    langs: [...document.querySelectorAll(".manual-bar .seg button")].map((b) => b.textContent + (b.classList.contains("on") ? "*" : "")).join(" ") };`;
const hex2rgb = (h) => { const n = parseInt(h.slice(1), 16); return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`; };

try {
  for (let i = 0; i < 80; i++) { if (await app(`return !!(app && app.store && app.settings)`).catch(() => false)) break; await sleep(250); }
  await app(`app.setSetting("lang", "ko"); app.setSetting("theme", "dracula"); return 1`);
  await app(`app.run("help.manual"); return 1`);
  let m = await manual();
  let s = await m.ev(STATE);
  check("opens in the program's language", s.lang === "ko" && s.langs === "한국어* English", s.langs);
  check("dark theme of the program (Dracula)", s.mode === "dark" && s.bg === "#21222c" && s.body === hex2rgb("#21222c"), `${s.mode} ${s.bg} ${s.body}`);
  check("window title is the page's", s.title === "사용 설명서 — MyArchitecture 10.0", s.title);
  check("text size: − , value , + on one row", s.order && s.sameRow, JSON.stringify({ order: s.order, sameRow: s.sameRow }));
  check("current size centred", s.centre < 1, `off by ${s.centre.toFixed(2)} px`);
  check("starts at 12 px", s.out === "12 px" && s.fs === "12px", `${s.out} / ${s.fs}`);
  const BAR = `const q = (s) => document.querySelector(s), r = (s) => q(s).getBoundingClientRect(), b = r("#manual-bar"), wc = q("#win-controls");
    return { top: Math.round(b.top), left: Math.round(b.left), width: Math.round(b.width), inner: document.documentElement.clientWidth,
    inBar: !!q("#manual-bar #fs-value") && !!q("#manual-bar .seg"), inToc: !!q("nav.toc .seg, nav.toc #fs-value"),
    titleLeft: Math.round(r(".bar-title").left), titleText: q(".bar-title").textContent, icon: !!q(".bar-title img"),
    winShown: !wc.hidden && r("#win-controls").width > 100, winRight: Math.round(r("#win-controls").right), buttons: [...wc.querySelectorAll("button")].map((x) => x.title).join(","),
    gapToWin: Math.round(r("#win-controls").left - r("#manual-bar .size").right), gapTitle: Math.round(r("#manual-bar .group").left - r(".bar-title").right),
    drag: getComputedStyle(q("#manual-bar")).getPropertyValue("app-region") || getComputedStyle(q("#manual-bar")).webkitAppRegion,
    frame: outerHeight - innerHeight };`;
  let b = await m.ev(BAR);
  check("own toolbar across the top", b.top === 0 && b.left === 0 && b.width === b.inner && b.inBar && !b.inToc, JSON.stringify(b));
  check("icon and title at the left of the toolbar", b.icon && b.titleLeft < 30 && /사용 설명서/.test(b.titleText), `${b.titleLeft} ${b.titleText}`);
  check("settings right-aligned, window buttons at the far right", b.winShown && b.winRight === b.inner && b.gapToWin <= 20 && b.gapTitle > 100, JSON.stringify({ winRight: b.winRight, gapToWin: b.gapToWin, gapTitle: b.gapTitle }));
  check("window buttons: minimize, maximize, close", b.buttons === "최소화,최대화,닫기", b.buttons);
  check("no native title bar; the toolbar moves the window", b.frame < 20 && b.drag === "drag", `outer−inner ${b.frame}px, region ${b.drag}`);
  await shot(m, "manual-dark-ko.png");
  // Contents link → the heading shows below the toolbar, which stays put.
  const jump = await m.ev(`const pane = document.querySelector(".layout"); pane.style.scrollBehavior = "auto"; document.querySelectorAll("nav.toc li.ch > a")[4].click(); await new Promise((r) => setTimeout(r, 400));
    const id = document.querySelectorAll("nav.toc li.ch > a")[4].getAttribute("href").slice(1); const hTop = document.getElementById(id).getBoundingClientRect().top;
    return { hTop: Math.round(hTop), bar: document.getElementById("manual-bar").offsetHeight, barTop: Math.round(document.getElementById("manual-bar").getBoundingClientRect().top), scrolled: pane.scrollTop > 0, active: (document.querySelector("nav.toc a.active") || {}).textContent || "" };`);
  check("toolbar stays on top while scrolled; heading not under it", jump.scrolled && jump.barTop === 0 && jump.hTop >= jump.bar && jump.hTop < jump.bar + 40 && /^5\./.test(jump.active), JSON.stringify(jump));
  await shot(m, "manual-dark-ko-scrolled.png");
  await m.ev(`document.querySelector(".layout").scrollTo({ top: 0, behavior: "instant" }); return 1`);

  await m.ev(`document.getElementById("fs-inc").click(); document.getElementById("fs-inc").click(); return 1`);
  s = await m.ev(STATE);
  check("+ twice → 14 px", s.out === "14 px" && s.fs === "14px", `${s.out} / ${s.fs}`);
  await m.ev(`for (let k = 0; k < 30; k++) document.getElementById("fs-dec").click(); return 1`);
  s = await m.ev(STATE);
  check("− stops at 10 px and turns off", s.out === "10 px" && s.decDisabled && !s.incDisabled, `${s.out} dec=${s.decDisabled}`);
  await m.ev(`for (let k = 0; k < 30; k++) document.getElementById("fs-inc").click(); return 1`);
  s = await m.ev(STATE);
  check("+ stops at 28 px and turns off", s.out === "28 px" && s.incDisabled && !s.decDisabled, `${s.out} inc=${s.incDisabled}`);
  check("value still centred at 28 px", s.centre < 1, `off by ${s.centre.toFixed(2)} px`);
  await m.ev(`for (let k = 0; k < 10; k++) document.getElementById("fs-dec").click(); return 1`); // 18 px

  // The program's theme changes while the manual is open.
  await app(`app.setSetting("theme", "paper"); return 1`);
  await sleep(400);
  s = await m.ev(STATE);
  check("follows a theme change live (Paper)", s.mode === "light" && s.bg === "#f4f1ea" && s.body === hex2rgb("#f4f1ea"), `${s.mode} ${s.bg} ${s.body}`);

  // English.
  await m.ev(`document.querySelector('.manual-bar .seg button[lang="en"]').click(); return 1`);
  m.close();
  await sleep(600);
  m = await manual();
  s = await m.ev(STATE);
  check("English page", s.lang === "en" && s.langs === "한국어 English*" && /USERSGUIDE\.en\.html/.test(m.url), `${s.lang} ${s.langs}`);
  check("English title", s.title === "User manual — MyArchitecture 10.0", s.title);
  check("keeps theme and text size", s.mode === "light" && s.bg === "#f4f1ea" && s.out === "18 px" && s.fs === "18px", `${s.mode} ${s.bg} ${s.out}`);
  await shot(m, "manual-light-en.png");
  // And back.
  await m.ev(`document.querySelector('.manual-bar .seg button[lang="ko"]').click(); return 1`);
  m.close();
  await sleep(600);
  m = await manual();
  s = await m.ev(STATE);
  check("back to Korean", s.lang === "ko" && s.title === "사용 설명서 — MyArchitecture 10.0", `${s.lang} ${s.title}`);
  // Window buttons.
  const maxState = () => m.ev(`return window.__TAURI__.core.invoke("win_is_maximized")`);
  await m.ev(`document.querySelector('[data-win="max"]').click(); return 1`);
  await sleep(700);
  const maxed = await maxState(), maxTitle = await m.ev(`return document.querySelector('[data-win="max"]').title`);
  await m.ev(`document.querySelector('[data-win="max"]').click(); return 1`);
  await sleep(700);
  check("maximize / restore", maxed === true && maxTitle === "이전 크기로" && (await maxState()) === false, `${maxed} ${maxTitle}`);
  await m.ev(`document.querySelector('[data-win="close"]').click(); return 1`).catch(() => {});
  m.close();
  let gone = false;
  for (let i = 0; i < 30 && !gone; i++) { await sleep(150); gone = !(await (await fetch(`http://127.0.0.1:${a.port}/json`)).json()).some((x) => /USERSGUIDE/.test(x.url)); }
  check("close button closes the manual (program stays)", gone && (await app(`return !!app.store`)), String(gone));
  check("no errors in the program", a.errors.length === 0, a.errors.join(" | ").slice(0, 300));
} finally {
  await a.close();
}
console.log(failed ? `${failed} FAILED` : "ALL PASSED");
process.exit(failed ? 1 : 0);
