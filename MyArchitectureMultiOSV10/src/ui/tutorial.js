// Interactive tutorial player.
//
// A tutorial is a list of lessons, each a list of steps:
//   { title: {ko, en}, text: {ko, en}, run: async (ctx) => { … },
//     practice: { todo: {ko, en}, check: (ctx, mem) => bool, targets: (ctx) => [...] } }
// Watch mode performs every step on the REAL program — an animated cursor
// moves to toolbar buttons, menus, library rows, canvas points and dialog
// buttons, and real pointer / keyboard events are dispatched — so the viewer
// sees each feature used exactly as they would use it. Practice mode lets the
// user do the step, marks where to act and checks the result. Every step
// verifies its outcome (ctx.expect), so the lessons double as an end-to-end
// test (the GUI smoke test runs them all at instant speed).

import { getLanguage } from "./i18n.js";
import { icon } from "./icons.js";
import { h } from "./widgets.js";
import { LESSONS } from "./tutorial-lessons.js";

// A macrotask yield that is not throttled when the window is in the background.
const yieldNow = () => new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });

export const L = (o) => (o == null ? "" : typeof o === "string" ? o : o[getLanguage()] || o.en || o.ko || "");
const UI = {
  title: { ko: "튜토리얼", en: "Tutorial" },
  play: { ko: "자동 재생", en: "Play" },
  pause: { ko: "일시 정지", en: "Pause" },
  next: { ko: "다음 단계 실행", en: "Run next step" },
  prev: { ko: "이전 단계", en: "Previous step" },
  stop: { ko: "튜토리얼 끝내기", en: "End tutorial" },
  speed: { ko: "속도", en: "Speed" },
  step: { ko: "단계", en: "Step" },
  done: { ko: "레슨 완료", en: "Lesson complete" },
  allDone: { ko: "모든 레슨을 마쳤습니다. 만든 프로젝트는 그대로 열려 있으니 저장하거나 계속 고쳐 보세요.", en: "All lessons finished. The project you built stays open — save it or keep editing." },
  failed: { ko: "이 단계가 예상대로 끝나지 않았습니다", en: "This step did not finish as expected" },
  skip: { ko: "건너뛰기", en: "Skip" },
  retry: { ko: "다시 시도", en: "Retry" },
  running: { ko: "실행 중…", en: "Running…" },
  ready: { ko: "▶ 자동 재생을 누르거나, 한 단계씩 '다음'을 누르세요.", en: "Press ▶ Play, or step through with Next." },
  pickLesson: { ko: "레슨 선택", en: "Choose a lesson" },
  watch: { ko: "보기", en: "Watch" },
  practice: { ko: "따라 하기", en: "Practice" },
  watchHint: { ko: "프로그램이 각 단계를 직접 실행하며 보여 줍니다", en: "The program performs every step for you" },
  practiceHint: { ko: "안내에 따라 직접 해 보면 자동으로 확인하고 다음 단계로 넘어갑니다", en: "Do each step yourself; it is checked automatically and the tour moves on" },
  showMe: { ko: "보여 주기", en: "Show me" },
  nextInfo: { ko: "다음", en: "Next" },
  yourTurn: { ko: "직접 해 보세요:", en: "Your turn:" },
  welldone: { ko: "잘했습니다!", en: "Well done!" },
  lookOnly: { ko: "살펴보기:", en: "Have a look:" },
  pressNext: { ko: "설명을 읽고 다음을 누르세요.", en: "Read the explanation and press Next." },
  preparing: { ko: "앞 레슨의 결과를 빠르게 만드는 중…", en: "Preparing the result of the earlier lessons…" },
};

export class TutorialPlayer {
  constructor(app) {
    this.app = app;
    this.lessons = LESSONS;
    this.li = 0;
    this.si = 0;
    this.playing = false;
    this.busy = false;
    this.speed = 1;
    this.instant = false;
    this.panel = null;
    this.cursor = null;
    this.ring = null;
    this.report = [];
    this.completed = -1; // last lesson whose steps all ran in this session
    this.mode = "watch";
    this.done = false;
    this.mem = { modals: new Set() };
  }

  // ---------------------------------------------------------------- lifecycle
  async open({ lesson = 0, autoplay = false, mode = null } = {}) {
    if (!this.panel) this.build();
    this.panel.style.display = "";
    this.li = Math.max(0, Math.min(this.lessons.length - 1, lesson));
    this.si = 0;
    if (this.completed >= this.li) this.completed = -1;
    if (mode) this.mode = mode;
    this.render();
    if (this.mode === "practice") this.practiceStep();
    else if (autoplay) this.play();
  }

  close() {
    this.stopPractice();
    this.playing = false;
    if (this.panel) this.panel.style.display = "none";
    this.hideCursor();
    this.spot(null);
  }

  get lesson() { return this.lessons[this.li]; }
  get step() { return this.lesson.steps[this.si]; }

  // Run everything without animation and return a report — used by tests.
  async runAll({ from = 0, to = this.lessons.length - 1 } = {}) {
    this.instant = true;
    this.report = [];
    if (!this.panel) this.build();
    for (let li = from; li <= to; li++) {
      this.li = li;
      for (let si = 0; si < this.lessons[li].steps.length; si++) {
        this.si = si;
        this.render();
        const ok = await this.exec();
        this.report.push({ lesson: L(this.lessons[li].title), step: L(this.lessons[li].steps[si].title), ok, error: ok ? null : this.lastError });
      }
    }
    this.instant = false;
    return this.report;
  }

  // Self-test of practice mode: perform every step and confirm its practice
  // check recognises the result (sampled while the step runs, as the poll would).
  async verifyPractice() {
    const report = [];
    this.instant = true;
    if (!this.panel) this.build();
    const ctx = this.ctx();
    for (let li = 0; li < this.lessons.length; li++) {
      this.li = li;
      for (let si = 0; si < this.lessons[li].steps.length; si++) {
        this.si = si;
        const pr = this.step.practice || null;
        const mem = { modals: new Set() };
        let passed = false;
        const sample = () => {
          const title = document.querySelector(".modal .modal-title");
          if (title) mem.modals.add(title.textContent);
          if (pr && pr.check && !passed) { try { passed = !!pr.check(ctx, mem); } catch { /* not yet */ } }
        };
        // Practice mode prepares a step (remembers the starting state) first.
        if (pr && pr.setup) { try { await pr.setup(ctx); } catch { /* optional */ } }
        if (pr && pr.check) sample();
        const obs = new MutationObserver(sample);
        obs.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
        const off1 = this.app.store.on("change", sample);
        const off2 = this.app.store.on("preview", sample);
        const ok = await this.exec();
        sample();
        obs.disconnect();
        off1();
        off2();
        report.push({ lesson: L(this.lessons[li].title), step: L(this.lessons[li].steps[si].title), run: ok, check: !pr || !pr.check ? "info" : passed, error: ok ? null : this.lastError });
      }
    }
    this.instant = false;
    return report;
  }

  // ---------------------------------------------------------------- UI
  build() {
    this.panel = h("div", { class: "tut-panel", role: "dialog", "aria-live": "polite" });
    this.cursor = h("div", { class: "tut-cursor", html: '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2l15 10-7 1.5 4 8-2.5 1.2-4-8L4 20z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>' });
    this.ring = h("div", { class: "tut-ring" });
    document.body.append(this.ring, this.cursor, this.panel);
    this.panel.addEventListener("pointerdown", (e) => {
      if (!e.target.closest(".tut-head") || e.target.closest("button,select")) return;
      const r = this.panel.getBoundingClientRect();
      const ox = e.clientX - r.left;
      const oy = e.clientY - r.top;
      const move = (ev) => { Object.assign(this.panel.style, { left: `${ev.clientX - ox}px`, top: `${ev.clientY - oy}px`, right: "auto", bottom: "auto" }); };
      const up = () => { document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); };
      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", up);
    });
  }

  render() {
    if (!this.panel) return;
    const lesson = this.lesson;
    const step = this.step;
    const total = lesson.steps.length;
    const sel = h("select", { class: "input tut-lesson", title: L(UI.pickLesson) },
      ...this.lessons.map((ls, i) => { const o = h("option", { value: String(i) }, `${i + 1}. ${L(ls.title)}`); if (i === this.li) o.selected = true; return o; }));
    sel.addEventListener("change", () => {
      if (this.busy) return;
      this.playing = false;
      this.li = +sel.value;
      this.si = 0;
      this.render();
      if (this.mode === "practice") this.practiceStep();
    });
    const speed = h("select", { class: "input tut-speed", title: L(UI.speed) }, ...[["0.5", "0.5×"], ["1", "1×"], ["2", "2×"], ["4", "4×"]].map(([v, l]) => { const o = h("option", { value: v }, l); if (+v === this.speed) o.selected = true; return o; }));
    speed.addEventListener("change", () => { this.speed = +speed.value; });
    const btn = (ic, title, fn, cls = "") => h("button", { class: `icon-btn ${cls}`, title: L(title), html: icon(ic, 18), onclick: fn });
    const bar = h("div", { class: "tut-progress" }, h("div", { style: { width: `${(this.si / total) * 100}%` } }));
    const practice = this.mode === "practice";
    const pr = step && step.practice;
    const modeSeg = h("div", { class: "seg tut-mode" },
      h("button", { class: practice ? "" : "on", title: L(UI.watchHint), onclick: () => this.setMode("watch") }, L(UI.watch)),
      h("button", { class: practice ? "on" : "", title: L(UI.practiceHint), onclick: () => this.setMode("practice") }, L(UI.practice)));
    const controls = practice
      ? h("div", { class: "tut-controls" },
        btn("chevronRight", UI.prev, () => { this.prev(); this.practiceStep(); }, "flip-x"),
        h("button", { class: "btn small primary", disabled: this.busy, onclick: () => this.showMe() }, h("span", { html: icon("play", 12) }), L(UI.showMe)),
        pr && pr.check ? h("button", { class: "btn small", disabled: this.busy, onclick: () => this.skipStep() }, L(UI.skip)) : h("button", { class: "btn small", onclick: () => this.skipStep() }, L(UI.nextInfo)),
        h("span", { class: "grow" }))
      : h("div", { class: "tut-controls" },
        btn("chevronRight", UI.prev, () => this.prev(), "flip-x"),
        this.playing ? btn("stop", UI.pause, () => this.pause(), "primary") : btn("play", UI.play, () => this.play(), "primary"),
        btn("chevronRight", UI.next, () => this.nextStep()),
        h("span", { class: "grow" }),
        h("span", { class: "field-hint" }, L(UI.speed)), speed);
    this.panel.innerHTML = "";
    this.panel.append(
      h("div", { class: "tut-head" }, h("span", { html: icon("sample", 16) }), h("b", {}, L(UI.title)), sel, btn("close", UI.stop, () => this.close())),
      h("div", { class: "tut-modebar" }, modeSeg),
      bar,
      h("div", { class: "tut-step" }, `${L(UI.step)} ${Math.min(this.si + 1, total)} / ${total}`, h("span", { class: "tut-state" }, this.busy ? L(UI.running) : practice && this.done ? "✓" : "")),
      h("div", { class: "tut-title" }, step ? L(step.title) : L(UI.done)),
      h("div", { class: "tut-text" }, step ? L(step.text) : L(UI.ready)),
      practice && step ? h("div", { class: `tut-todo ${this.done ? "done" : ""}` }, h("b", {}, this.done ? `✓ ${L(UI.welldone)}` : pr ? L(UI.yourTurn) : L(UI.lookOnly)), " ", pr ? L(pr.todo) : L(UI.pressNext)) : "",
      this.errorBox || "",
      controls,
    );
  }

  // ---------------------------------------------------------------- practice mode
  setMode(mode) {
    if (this.busy || mode === this.mode) return;
    this.playing = false;
    this.mode = mode;
    this.stopPractice();
    if (mode === "practice") this.practiceStep();
    else this.render();
  }

  stopPractice() {
    clearInterval(this.poll);
    this.poll = null;
    this.clearTargets();
  }

  async practiceStep() {
    this.stopPractice();
    this.done = false;
    this.errorBox = null;
    if (!this.step) { this.render(); return; }
    if (!(await this.ensureReady())) { this.render(); return; }
    this.mem = { modals: new Set() };
    this.render();
    const pr = this.step.practice;
    const ctx = this.ctx();
    if (pr && pr.setup) { try { await pr.setup(ctx); } catch (e) { console.error("[tutorial] setup", e); } }
    this.frameTargets(pr, ctx);
    const tick = async () => {
      if (this.mode !== "practice" || this.busy) return;
      const title = document.querySelector(".modal .modal-title");
      if (title) this.mem.modals.add(title.textContent);
      this.drawTargets(pr, ctx);
      if (!pr || !pr.check || this.done) return;
      let ok = false;
      try { ok = !!pr.check(ctx, this.mem); } catch { ok = false; }
      if (!ok) return;
      this.done = true;
      this.stopPractice();
      if (this.si === this.lesson.steps.length - 1) this.completed = Math.max(this.completed, this.li);
      this.render();
      setTimeout(() => { if (this.mode === "practice" && this.done && this.advance()) this.practiceStep(); }, 1300);
    };
    this.poll = setInterval(tick, 300);
    tick();
  }

  async showMe() {
    if (this.busy) return;
    this.stopPractice();
    const ok = await this.exec();
    if (ok && this.mode === "practice" && this.advance()) this.practiceStep();
  }

  // Skipping still performs the step (instantly) so later steps find what they expect.
  async skipStep() {
    if (this.busy) return;
    this.stopPractice();
    const was = this.instant;
    this.instant = true;
    const ok = await this.exec();
    this.instant = was;
    if (ok && this.advance()) this.practiceStep();
  }

  frameTargets(pr, ctx) {
    if (!pr || !pr.targets || this.app.tab !== "plan") return;
    let list = [];
    try { list = pr.targets(ctx) || []; } catch { return; }
    const pts = list.filter((tg) => !tg.el);
    if (!pts.length) return;
    const r = this.app.plan.canvas.getBoundingClientRect();
    const visible = pts.every((tg) => { const [x, y] = ctx.screenOf(tg.x, tg.y); return x > r.left + 30 && x < r.right - 30 && y > r.top + 30 && y < r.bottom - 30; });
    if (visible) return;
    const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
    this.app.plan.vp.fit({ x1: Math.min(...xs) - 2000, y1: Math.min(...ys) - 2000, x2: Math.max(...xs) + 2000, y2: Math.max(...ys) + 2000 }, 0.1);
  }

  clearTargets() {
    for (const m of document.querySelectorAll(".tut-target")) m.remove();
    this.spot(null);
  }

  drawTargets(pr, ctx) {
    for (const m of document.querySelectorAll(".tut-target")) m.remove();
    if (!pr || !pr.targets || this.done) { this.spot(null); return; }
    let list = [];
    try { list = pr.targets(ctx) || []; } catch { list = []; }
    let ringed = false;
    for (const tg of list) {
      if (tg.el) {
        let el = null;
        try { el = typeof tg.el === "function" ? tg.el() : document.querySelector(tg.el); } catch { el = null; }
        if (!el || !el.getBoundingClientRect) continue;
        if (!ringed) { this.spotAlways(el); ringed = true; }
        continue;
      }
      if (this.app.tab !== "plan") continue;
      const [x, y] = ctx.screenOf(tg.x, tg.y);
      const r = this.app.plan.canvas.getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
      document.body.append(h("div", { class: "tut-target", style: { left: `${x}px`, top: `${y}px` } }));
    }
    if (!ringed) this.spot(null);
  }

  spotAlways(el) {
    const r = el.getBoundingClientRect();
    Object.assign(this.ring.style, { display: "block", left: `${r.left - 6}px`, top: `${r.top - 6}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px` });
  }

  // ---------------------------------------------------------------- control
  // Starting in the middle: rebuild what earlier lessons would have left.
  async ensureReady() {
    if (this.si !== 0 || this.li === 0 || this.completed >= this.li - 1) return true;
    const target = this.li;
    const textEl = this.panel.querySelector(".tut-text");
    if (textEl) textEl.textContent = L(UI.preparing);
    const was = this.instant;
    this.instant = true;
    // Lessons marked `fresh` start from scratch, so only replay from the last one.
    let from = this.completed + 1;
    for (let li = target - 1; li > from; li--) if (this.lessons[li].fresh) { from = li; break; }
    for (let li = from; li < target; li++) {
      this.li = li;
      for (let si = 0; si < this.lessons[li].steps.length; si++) {
        this.si = si;
        if (!(await this.exec())) { this.instant = was; return false; }
      }
    }
    this.instant = was;
    this.li = target;
    this.si = 0;
    this.render();
    return true;
  }

  async play() {
    if (this.playing) return;
    this.playing = true;
    this.render();
    if (!(await this.ensureReady())) { this.playing = false; this.render(); return; }
    while (this.playing) {
      const ok = await this.exec();
      if (!ok) { this.playing = false; break; }
      if (!this.advance()) { this.playing = false; break; }
      await this.wait(500);
    }
    this.render();
  }

  pause() { this.playing = false; this.render(); }

  async nextStep() {
    if (this.busy) return;
    if (!(await this.ensureReady())) return;
    const ok = await this.exec();
    if (ok) this.advance();
    this.render();
  }

  prev() {
    if (this.busy) return;
    this.playing = false;
    if (this.si > 0) this.si--;
    else if (this.li > 0) { this.li--; this.si = this.lessons[this.li].steps.length - 1; }
    this.errorBox = null;
    this.render();
  }

  advance() {
    this.errorBox = null;
    if (this.si < this.lesson.steps.length - 1) { this.si++; this.render(); return true; }
    if (this.li < this.lessons.length - 1) { this.li++; this.si = 0; this.render(); return true; }
    this.si = this.lesson.steps.length;
    this.render();
    const title = this.panel.querySelector(".tut-title");
    const text = this.panel.querySelector(".tut-text");
    if (title) title.textContent = L(UI.done);
    if (text) text.textContent = L(UI.allDone);
    this.hideCursor();
    this.spot(null);
    return false;
  }

  async exec() {
    const step = this.step;
    if (!step) return false;
    this.busy = true;
    this.render();
    let ok = true;
    if (this.li === 0 && this.si === 0) this.completed = -1;
    try {
      await this.wait(Math.min(2600, 600 + L(step.text).length * 18));
      await step.run(this.ctx());
      if (this.si === this.lesson.steps.length - 1) this.completed = Math.max(this.completed, this.li);
    } catch (e) {
      ok = false;
      this.lastError = e && e.message ? e.message : String(e);
      console.warn("[tutorial]", L(step.title), e);
      this.errorBox = h("div", { class: "tut-error" }, `${L(UI.failed)}: ${this.lastError}`,
        h("div", { class: "prop-actions" },
          h("button", { class: "btn small", onclick: () => { this.errorBox = null; this.nextStep(); } }, L(UI.retry)),
          h("button", { class: "btn small", onclick: () => { this.errorBox = null; this.advance(); this.render(); } }, L(UI.skip))));
    }
    this.busy = false;
    this.spot(null);
    this.render();
    return ok;
  }

  wait(ms) {
    if (this.instant) return yieldNow();
    return new Promise((r) => setTimeout(r, ms / this.speed));
  }

  // ---------------------------------------------------------------- visuals
  showCursor() { if (!this.instant) this.cursor.style.display = "block"; }
  hideCursor() { if (this.cursor) this.cursor.style.display = "none"; }

  async moveCursor(x, y) {
    if (this.instant) return;
    this.showCursor();
    const cur = this.cursorPos || { x: window.innerWidth - 200, y: window.innerHeight - 160 };
    const d = Math.hypot(x - cur.x, y - cur.y);
    const ms = Math.min(700, 180 + d * 0.6) / this.speed;
    this.cursor.style.transition = `transform ${ms}ms cubic-bezier(.3,.7,.3,1)`;
    this.cursor.style.transform = `translate(${x - 4}px, ${y - 2}px)`;
    this.cursorPos = { x, y };
    await new Promise((r) => setTimeout(r, ms + 30));
  }

  ripple(x, y) {
    if (this.instant) return;
    const r = h("div", { class: "tut-ripple", style: { left: `${x}px`, top: `${y}px` } });
    document.body.append(r);
    setTimeout(() => r.remove(), 600);
  }

  spot(target, pad = 6) {
    if (!this.ring) return;
    if (!target || this.instant) { this.ring.style.display = "none"; return; }
    const r = target instanceof Element ? target.getBoundingClientRect() : target;
    Object.assign(this.ring.style, { display: "block", left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
  }

  showKey(key, mods) {
    if (this.instant) return;
    const label = `${mods.ctrl ? "Ctrl+" : ""}${mods.shift ? "Shift+" : ""}${mods.alt ? "Alt+" : ""}${key === " " ? "Space" : key.length === 1 ? key.toUpperCase() : key}`;
    const k = h("div", { class: "tut-key" }, label);
    document.body.append(k);
    setTimeout(() => k.classList.add("out"), 700);
    setTimeout(() => k.remove(), 1100);
  }

  // ---------------------------------------------------------------- driver
  ctx() {
    const app = this.app;
    const self = this;
    const plan = () => app.plan;
    const find = (sel) => {
      if (sel instanceof Element) return sel;
      const el = typeof sel === "function" ? sel() : document.querySelector(sel);
      if (!el) throw new Error(`UI element not found: ${typeof sel === "string" ? sel : "?"}`);
      return el;
    };
    const centre = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
    const pointer = (target, type, x, y, extra = {}) => {
      const init = { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0, buttons: type === "pointerup" ? 0 : 1, ...extra };
      target.dispatchEvent(new PointerEvent(type, init));
    };
    const ctx = {
      app,
      L,
      get p() { return app.store.project; },
      wait: (ms) => self.wait(ms),
      expect(cond, msg) { if (!cond) throw new Error(msg || "check failed"); },
      async click(sel, { spot = true } = {}) {
        // The UI may still be re-rendering (the inspector follows a selection
        // a moment later): wait for the element instead of failing at once.
        const el = sel instanceof Element ? sel : await ctx.waitFor(() => { try { return find(sel); } catch { return null; } }, 3000).catch(() => find(sel));
        if (el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
        const [x, y] = centre(el);
        if (spot) self.spot(el);
        await self.moveCursor(x, y);
        self.ripple(x, y);
        el.click();
        await self.wait(250);
        return el;
      },
      // A command through its toolbar button, else its menu, else directly.
      async command(id) {
        const c = app.commands.get(id);
        const label = c ? app.t(c.label) : id;
        const btn = document.querySelector(`#toolbar [data-cmd="${id}"]`);
        if (btn && !btn.disabled) return ctx.click(btn);
        const root = Object.entries(app.menuMap || {}).find(([, ids]) => ids.includes(id));
        if (root) {
          await ctx.click(`.menu-root[data-menu="${root[0]}"]`);
          await self.wait(200);
          const item = [...document.querySelectorAll(".ctx-menu .menu-item")].find((m) => m.querySelector(".mi-label").textContent === label);
          if (item && !item.disabled) { await ctx.click(item); return item; }
          document.querySelectorAll(".ctx-menu").forEach((m) => m.remove());
        }
        app.run(id);
        await self.wait(200);
        return null;
      },
      async key(key, mods = {}) {
        const act = document.activeElement;
        if (act && /^(INPUT|TEXTAREA|SELECT)$/.test(act.tagName) && !act.closest(".modal, .quickpick, .tut-panel") && !act.classList.contains("popup-input")) act.blur();
        const ae = document.activeElement;
        const target = ae && ae !== document.body && !ae.closest(".tut-panel") ? ae : document.body;
        const opts = { key, bubbles: true, cancelable: true, ctrlKey: !!mods.ctrl, shiftKey: !!mods.shift, altKey: !!mods.alt, metaKey: false };
        self.showKey(key, mods);
        target.dispatchEvent(new KeyboardEvent("keydown", opts));
        target.dispatchEvent(new KeyboardEvent("keyup", opts));
        await self.wait(220);
      },
      async type(sel, text) {
        const el = find(sel);
        self.spot(el);
        const [x, y] = centre(el);
        await self.moveCursor(x, y);
        el.focus();
        if (self.instant) el.value = text;
        else {
          el.value = "";
          for (const ch of text) { el.value += ch; el.dispatchEvent(new Event("input", { bubbles: true })); await self.wait(45); }
        }
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        await self.wait(200);
        return el;
      },
      async select(sel, value) {
        const el = find(sel);
        self.spot(el);
        const [x, y] = centre(el);
        await self.moveCursor(x, y);
        el.value = value;
        el.dispatchEvent(new Event("change", { bubbles: true }));
        await self.wait(250);
        return el;
      },
      // Answer the small inline text box (lengths, labels, texts, renames).
      async popup(text) {
        await self.wait(150);
        const el = await ctx.waitFor(() => document.querySelector(".popup-input"), 2000);
        await ctx.type(el, text);
        el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        await self.wait(200);
      },
      // Pick from the quick-pick list (palette, furniture, samples) by typing.
      async pick(text, label = null) {
        const input = await ctx.waitFor(() => document.querySelector(".qp-input"), 3000);
        await ctx.type(input, text);
        const rows = [...document.querySelectorAll(".qp-item")];
        const row = label ? rows.find((r) => r.textContent.includes(label)) || rows[0] : rows[0];
        if (!row) throw new Error(`nothing matches "${text}"`);
        await ctx.click(row);
      },
      screenOf(wx, wy) {
        const e = plan();
        const r = e.canvas.getBoundingClientRect();
        const [sx, sy] = e.vp.toScreen(wx, wy);
        return [r.left + sx, r.top + sy];
      },
      moveTo: (x, y) => self.moveCursor(x, y),
      spot(target) { self.spot(target instanceof Element ? target : find(target)); },
      async move(wx, wy, { shift = false } = {}) {
        const [x, y] = ctx.screenOf(wx, wy);
        await self.moveCursor(x, y);
        pointer(plan().canvas, "pointermove", x, y, { buttons: 0, shiftKey: shift });
        await self.wait(60);
      },
      async clickAt(wx, wy, { button = 0, dbl = false, shift = false } = {}) {
        const c = plan().canvas;
        const [x, y] = ctx.screenOf(wx, wy);
        await self.moveCursor(x, y);
        pointer(c, "pointermove", x, y, { buttons: 0, shiftKey: shift });
        self.ripple(x, y);
        pointer(c, "pointerdown", x, y, { button, buttons: button === 2 ? 2 : 1, shiftKey: shift });
        pointer(c, "pointerup", x, y, { button, shiftKey: shift });
        if (dbl) c.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, clientX: x, clientY: y }));
        // The properties panel follows the selection after a short delay; bring
        // it up to date now so the next step finds the right fields.
        app.refreshInspector();
        await self.wait(180);
      },
      async drag(from, to, { steps = 12, alt = false, shift = false } = {}) {
        const c = plan().canvas;
        const [x1, y1] = ctx.screenOf(from[0], from[1]);
        const [x2, y2] = ctx.screenOf(to[0], to[1]);
        await self.moveCursor(x1, y1);
        pointer(c, "pointermove", x1, y1, { buttons: 0 });
        pointer(c, "pointerdown", x1, y1, { altKey: alt, shiftKey: shift });
        for (let i = 1; i <= steps; i++) {
          const x = x1 + ((x2 - x1) * i) / steps;
          const y = y1 + ((y2 - y1) * i) / steps;
          if (!self.instant) { self.cursor.style.transition = "none"; self.cursor.style.transform = `translate(${x - 4}px, ${y - 2}px)`; self.cursorPos = { x, y }; }
          pointer(c, "pointermove", x, y, { altKey: alt, shiftKey: shift });
          await self.wait(28);
        }
        pointer(c, "pointerup", x2, y2, { altKey: alt, shiftKey: shift });
        app.refreshInspector();
        await self.wait(200);
      },
      // Click a sequence of plan points with the current tool (walls, lines…).
      async clicks(points) { for (const [x, y] of points) await ctx.clickAt(x, y); },
      async view(b, margin = 0.12) { plan().vp.fit(b, margin); await self.wait(250); },
      async closeDialog(label) {
        await self.wait(400);
        const buttons = [...document.querySelectorAll(".modal-foot .btn")];
        const btn = label ? buttons.find((b) => b.textContent.trim() === label) : null;
        if (btn) return ctx.click(btn);
        const x = document.querySelector(".modal-head .icon-btn");
        if (x) return ctx.click(x);
        return null;
      },
      // The primary (or named) button of the open dialog.
      async confirm(label = null) {
        await ctx.waitFor(() => document.querySelector(".modal-foot"), 3000);
        await self.wait(300);
        const buttons = [...document.querySelectorAll(".modal-foot .btn")];
        const btn = label ? buttons.find((b) => b.textContent.trim() === label) : buttons.find((b) => b.classList.contains("primary"));
        if (!btn) throw new Error(`dialog button not found: ${label || "primary"}`);
        return ctx.click(btn);
      },
      modal() { return document.querySelector(".modal"); },
      async waitFor(fn, ms = 4000) {
        const t0 = performance.now();
        while (performance.now() - t0 < ms) {
          const v = fn();
          if (v) return v;
          await (self.instant ? new Promise((r) => setTimeout(r, 10)) : new Promise((r) => setTimeout(r, 50)));
        }
        throw new Error("timed out waiting for the program");
      },
      // Screen point of a 3D world point (plan mm + height mm) in the 3D view.
      screenOf3d(xmm, ymm, zmm) {
        const v = app.v3d.viewer;
        const { camera, renderer, THREE } = v.three;
        const r = renderer.domElement.getBoundingClientRect();
        const q = new THREE.Vector3(xmm / 1000, zmm / 1000, ymm / 1000).project(camera);
        return [r.left + ((q.x + 1) / 2) * r.width, r.top + ((1 - q.y) / 2) * r.height];
      },
      async click3d(xmm, ymm, zmm) {
        const v = app.v3d.viewer;
        const c = v.three.renderer.domElement;
        const [x, y] = ctx.screenOf3d(xmm, ymm, zmm);
        await self.moveCursor(x, y);
        self.ripple(x, y);
        pointer(c, "pointerdown", x, y);
        pointer(c, "pointerup", x, y);
        await self.wait(250);
      },
      level(name) { const lv = app.store.project.levels.find((l) => l.name === name); if (!lv) throw new Error(`level ${name} not found`); return lv; },
      on(kind) { return app.store.project[kind].filter((x) => x.level === app.plan.level); },
    };
    return ctx;
  }
}
