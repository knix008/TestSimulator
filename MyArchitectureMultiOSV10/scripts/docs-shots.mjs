// Screenshots for the documentation (README, UsersGuide, Tutorial and the
// HTML manuals). Drives the real desktop app over CDP — the same driver as the
// GUI smoke test — and saves one WebP per feature into docs/images/<lang>/,
// plus docs/images/<lang>/shots.json (name → caption) for the documents.
//
//   npm run build:docs                    (both languages)
//   node scripts/docs-shots.mjs --lang ko [--only plan-]

import fs from "node:fs";
import path from "node:path";
import { launch, sleep, root } from "../test/smoke/driver.mjs";

const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : def; };
const langs = arg("lang", "ko,en").split(",");
const only = arg("only", "");
const W = 1640, H = 940; // wider than the widest toolbar, so the window never resizes itself

const T = (ko, en) => ({ ko, en });
let a, lang, outDir, manifest, failures = 0;
const app = (expr) => a.ev(`const app = window.myarchApp; ${expr}`);
const closeAll = () => app(`for (let i = 0; i < 6; i++) { const x = document.querySelector(".modal-head .icon-btn"); if (!x) break; x.click(); } document.querySelectorAll(".qp-backdrop,.popup-input").forEach(e => e.remove()); const w = await import("./src/ui/widgets.js"); w.closeMenus(); return 1`);
const waitFor = async (expr, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await app(`return !!(${expr})`)) return; await sleep(80); } throw new Error(`timed out: ${expr}`); };
const run = (id) => app(`app.run(${JSON.stringify(id)}); return 1`);
const sample = async (file) => { await app(`app.store.dirty = false; await app.openSample(${JSON.stringify(file)}); return 1`); await sleep(500); await closeAll(); };
const fresh = async () => { await app(`app.store.dirty = false; app.run("file.new"); return 1`); await sleep(300); await closeAll(); };
const tab = async (t) => { await app(`app.setTab(${JSON.stringify(t)}); return 1`); if (t === "3d") { await waitFor(`app.v3d.viewer`, 10000); await app(`app.v3d.syncModel(); return 1`); } await sleep(t === "3d" ? 900 : 250); };
const fit = (b) => app(`app.plan.vp.fit(${JSON.stringify(b)}, 0.06); app.plan.request(); return 1`);
const scr = (x, y) => app(`const e = app.plan; const r = e.canvas.getBoundingClientRect(); const [sx, sy] = e.vp.toScreen(${x}, ${y}); return [r.left + sx, r.top + sy];`);
const clickW = async (x, y, opts) => { const [sx, sy] = await scr(x, y); await a.move(sx, sy); await a.click(sx, sy, opts); };
const moveW = async (x, y) => { const [sx, sy] = await scr(x, y); await a.move(sx, sy); };
const at3d = (x, y, z) => app(`const v = app.v3d.viewer; const { camera, renderer, THREE } = v.three; const r = renderer.domElement.getBoundingClientRect(); const q = new THREE.Vector3(${x}, ${y}, ${z}).project(camera); return [r.left + (q.x + 1) / 2 * r.width, r.top + (1 - q.y) / 2 * r.height];`);
const rect = (sel) => app(`const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.max(0, b.left - 8), y: Math.max(0, b.top - 8), width: b.width + 16, height: b.height + 16 };`);

// Every shot starts from the same state: no dialogs, no tutorial, default 3D
// view (no section, realistic, perspective, no tool), no sun study.
async function reset() {
  await a.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 5, y: 5, button: "left", clickCount: 1, buttons: 0 });
  await app(`if (window.__tp) { try { await window.__tp; } catch {} window.__tp = null; }
    if (app.tutorial) app.tutorial.close();
    app.settings.sunStudy = false; app.settings.showLeft = true; app.settings.showRight = true; app.applyPanels();
    app.v3d.resetView(); if (app.v3d.viewer) app.v3d.setView("iso");
    app.plan.finishChain(); app.plan.setTool("select"); return 1`);
  await closeAll();
}

async function shot(name, caption, fn, { clip = null } = {}) {
  if (only && !name.includes(only)) return;
  try {
    await reset();
    await fn();
    await sleep(350);
    // Notifications and floating hints would cover the feature being shown.
    await app(`document.querySelectorAll(".toast").forEach(e => e.remove()); const h = document.getElementById("hint"); if (h) h.classList.remove("show"); return 1`);
    await sleep(80);
    let c = typeof clip === "string" ? await rect(clip) : typeof clip === "function" ? await clip() : clip;
    const file = path.join(outDir, `${name}.webp`);
    await a.shot(file, { format: "webp", quality: 82, clip: c ? { ...c, scale: 1 } : undefined });
    manifest[name] = { file: `docs/images/${lang}/${name}.webp`, caption: caption[lang] || caption.en };
    process.stdout.write(`  ✔ ${name}\n`);
  } catch (e) {
    failures++;
    process.stdout.write(`  ✖ ${name}: ${String(e.message || e).split("\n")[0]}\n`);
  }
  try { await a.key("Escape"); await reset(); } catch { /* next shot resets */ }
}

async function shots() {
  // ------------------------------------------------------------------ start, overview
  await shot("start-page", T("시작 페이지: 튜토리얼, 새 프로젝트, 열기, 가져오기, 예제 카드, 최근 파일", "Start page: tutorial, new project, open, import, sample cards and recent files"), async () => {
    await app(`app.addRecent("C:/Projects/house.myarch", "house"); app.addRecent("C:/Projects/office.myarch", "office"); return 1`);
    await tab("start");
  });
  await shot("overview-plan", T("평면도 화면: 메뉴·탭·도구 모음, 왼쪽 가구 라이브러리, 가운데 도면, 오른쪽 속성, 아래 상태 표시줄", "Floor plan: menus, tabs and toolbar, furniture library on the left, drawing in the middle, properties on the right, status bar below"), async () => {
    await sample("03-two-storey-house.myarch"); await tab("plan"); await run("view.fit");
  });
  await shot("overview-3d", T("3D 보기: 왼쪽에 장면·층·표시·단면·태양, 오른쪽에 고른 요소의 속성", "3D view: scenes, levels, display, section and sun on the left, the picked element on the right"), async () => {
    await sample("03-two-storey-house.myarch"); await tab("3d"); await app(`app.v3d.setView("iso"); return 1`);
  });

  // ------------------------------------------------------------------ walls
  await shot("walls-chain", T("벽 그리기(W): 클릭할 때마다 벽이 이어지고 길이·각도가 표시됩니다", "Wall tool (W): each click continues the chain, the length and angle are shown"), async () => {
    await fresh(); await tab("plan"); await fit({ x1: -1500, y1: -1500, x2: 11000, y2: 7500 });
    await a.key("w");
    for (const [x, y] of [[0, 0], [9000, 0], [9000, 6000]]) await clickW(x, y);
    await moveW(3500, 6000);
  });
  await shot("walls-typed-length", T("길이 입력: 그리는 중에 숫자를 치면 정확한 길이(예: 4500, 3.6m, 3600<90)로 벽이 놓입니다", "Typed length: type a number while drawing for an exact length (4500, 3.6m, 3600<90)"), async () => {
    await fresh(); await tab("plan"); await fit({ x1: -1500, y1: -1500, x2: 11000, y2: 7500 });
    await a.key("w"); await clickW(0, 0); await moveW(4000, 0);
    await a.key("4"); await a.type("500");
  });
  await shot("walls-joints", T("벽 이음: 모서리는 자동으로 맞물리고, T 자·십자 이음도 깨끗하게 그려집니다", "Wall joints: corners mitre automatically, T and cross joints are drawn cleanly"), async () => {
    await fresh(); await tab("plan"); await fit({ x1: -1000, y1: -1000, x2: 10000, y2: 7000 });
    await a.key("w");
    for (const [x, y] of [[0, 0], [9000, 0], [9000, 6000], [0, 6000], [0, 0]]) await clickW(x, y);
    await a.key("w"); await clickW(5000, 0); await clickW(5000, 6000); await a.key("Escape");
    await a.key("w"); await clickW(0, 3000); await clickW(9000, 3000); await a.key("Escape"); await a.key("Escape");
    await clickW(5000, 1500);
  });
  await shot("walls-inspector", T("벽을 고르면 오른쪽에서 두께·높이·벽 타입·재료·단계 등을 바로 고칩니다", "Select a wall to edit its thickness, height, wall type, materials and phase on the right"), async () => {
    await sample("02-two-bedroom.myarch"); await tab("plan"); await run("view.fit");
    await app(`app.plan.select([app.store.project.walls[0].id]); app.refreshInspector(); return 1`);
  });

  // ------------------------------------------------------------------ rooms, openings, furniture
  await shot("rooms", T("방(A): 벽으로 둘러싸인 곳을 클릭하면 방이 생기고 이름과 면적이 붙습니다", "Rooms (A): click inside walls for a room with its name and area"), async () => {
    await sample("02-two-bedroom.myarch"); await tab("plan"); await run("view.fit");
    const r = await app(`const r = app.store.project.rooms[0]; app.plan.select([r.id]); app.refreshInspector(); return 1`);
  });
  await shot("doors-windows", T("문(D)·창(N): 벽 위를 클릭하면 들어가고, X 로 여는 방향, H 로 경첩을 바꿉니다", "Doors (D) and windows (N): click on a wall; X flips the swing, H swaps the hinge"), async () => {
    await sample("02-two-bedroom.myarch"); await tab("plan"); await run("view.fit");
    await app(`const o = app.store.project.openings.find(o => o.kind === "door"); app.plan.select([o.id]); app.refreshInspector(); return 1`);
  });
  await shot("furniture-library", T("가구 라이브러리: 분류·검색 후 끌어다 놓거나 눌러서 배치합니다", "Furniture library: filter or search, then drag onto the plan or click to place"), async () => {
    await sample("01-studio.myarch"); await tab("plan"); await run("view.fit");
    await app(`const s = document.querySelector('#left-panel input'); if (s) { s.value = ""; } return 1`);
    await app(`const f = app.store.project.furniture[0]; app.plan.select([f.id]); app.refreshInspector(); return 1`);
  });
  await shot("furniture-picker", T("F 키: 가구를 이름으로 찾아 바로 배치합니다", "F: find furniture by name and place it"), async () => {
    await sample("01-studio.myarch"); await tab("plan"); await run("view.fit");
    await a.key("f"); await sleep(250); await a.type(lang === "ko" ? "침대" : "bed");
  });
  await shot("stairs-columns", T("계단(S)과 기둥(C): 계단은 두 점으로, 기둥은 한 번 클릭으로 놓습니다", "Stairs (S) and columns (C): stairs from two points, a column with one click"), async () => {
    await sample("08-apartment-block.myarch"); await tab("plan"); await run("view.fit");
    await app(`const s = app.store.project.stairs[0]; if (s) { app.plan.setLevel(s.level); app.plan.select([s.id]); app.refreshInspector(); } return 1`);
  });

  // ------------------------------------------------------------------ roofs, levels, annotation
  await shot("roof-plan", T("지붕(O): 맨 위층 위에 박공·모임·외쪽·평지붕을 얹습니다", "Roofs (O): gable, hip, shed or flat over the top level"), async () => {
    await sample("03-two-storey-house.myarch"); await tab("plan");
    await app(`const top = app.store.project.levels.at(-1); app.plan.setLevel(top.id); const r = app.store.project.roofs[0]; if (r) app.plan.select([r.id]); app.refreshInspector(); return 1`); await run("view.fit");
  });
  await shot("roof-3d", T("지붕과 2층이 3D 로 바로 만들어집니다", "Roofs and storeys appear in 3D straight away"), async () => {
    await sample("05-wooden-cabin.myarch"); await tab("3d"); await app(`app.v3d.setView("iso"); return 1`);
  });
  await shot("levels", T("층 탭: 층을 고르고(+ 로 추가), 아래층은 흐리게 겹쳐 보입니다", "Level tabs: pick a storey (+ adds one); the level below shows faintly"), async () => {
    await sample("03-two-storey-house.myarch"); await tab("plan");
    await app(`app.plan.setLevel(app.store.project.levels[1].id); return 1`); await run("view.fit");
  });
  await shot("dimensions-text", T("치수(K)·글자(T)·선(L)·줄자(M): 자동 치수는 바깥 벽을 한 번에 잽니다", "Dimensions (K), text (T), lines (L) and measure (M); auto dimensions measure the outside walls at once"), async () => {
    await sample("02-two-bedroom.myarch"); await tab("plan"); await run("build.autoDims"); await run("view.fit");
  });
  await shot("grids", T("구조 그리드(G): A, B, C … / 1, 2, 3 … 그리드 선과 버블", "Structural grids (G): grid lines with A, B, C … and 1, 2, 3 … bubbles"), async () => {
    await sample("08-apartment-block.myarch"); await tab("plan"); await run("view.fit");
  });

  // ------------------------------------------------------------------ editing
  await shot("select-box", T("상자 선택: Shift+끌기(왼→오른쪽은 완전히 포함, 오른→왼쪽은 걸친 것)", "Box select: Shift+drag (left to right = fully inside, right to left = crossing)"), async () => {
    await sample("02-two-bedroom.myarch"); await tab("plan"); await run("view.fit");
    const [x1, y1] = await scr(-500, -500); const [x2, y2] = await scr(5200, 4200);
    await a.move(x1, y1);
    await a.send("Input.dispatchMouseEvent", { type: "mousePressed", x: x1, y: y1, button: "left", clickCount: 1, modifiers: 8, buttons: 1 });
    for (let i = 1; i <= 8; i++) await a.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x1 + ((x2 - x1) * i) / 8, y: y1 + ((y2 - y1) * i) / 8, buttons: 1, modifiers: 8 });
  });
  await shot("context-menu", T("오른쪽 클릭 메뉴: 맨 위에 되돌리기/다시 실행, 그 아래 고른 요소에 맞는 명령", "Right-click menu: Undo / Redo at the top, then commands for the element"), async () => {
    await sample("02-two-bedroom.myarch"); await tab("plan"); await run("view.fit");
    await app(`app.store.edit("x", (p) => { p.walls[0].height += 0; }); return 1`);
    const w = await app(`const w = app.store.project.walls[0]; return [(w.x1 + w.x2) / 2, (w.y1 + w.y2) / 2]`);
    await clickW(w[0], w[1], { button: "right" });
  });
  await shot("properties-dialog", T("더블클릭(또는 E): 요소의 모든 속성을 한 창에서 고칩니다", "Double-click (or E): every property of an element in one window"), async () => {
    await sample("02-two-bedroom.myarch"); await tab("plan"); await run("view.fit");
    await app(`const o = app.store.project.openings.find(o => o.kind === "window"); app.plan.select([o.id]); app.run("edit.properties"); return 1`);
    await waitFor(`document.querySelector(".modal")`);
  });
  await shot("undo-history", T("되돌리기 기록: 지난 작업 목록에서 원하는 시점으로 돌아갑니다", "Undo history: go back to any earlier step"), async () => {
    await fresh(); await tab("plan"); await fit({ x1: -1500, y1: -1500, x2: 11000, y2: 7500 });
    await a.key("w"); for (const [x, y] of [[0, 0], [8000, 0], [8000, 5000], [0, 5000], [0, 0]]) await clickW(x, y); await a.key("Escape");
    await a.key("a"); await clickW(4000, 2500); await a.key("Escape");
    await a.key("d"); await clickW(2000, 4990); await a.key("Escape");
    await run("edit.history"); await waitFor(`document.querySelector(".modal")`);
  });
  await shot("command-palette", T("명령 팔레트(Ctrl+K): 모든 명령·방·층·가구를 검색합니다", "Command palette (Ctrl+K): search every command, room, level and furniture"), async () => {
    await sample("03-two-storey-house.myarch"); await tab("plan"); await run("view.fit");
    await a.key("k", 2); await sleep(250); await a.type(lang === "ko" ? "벽" : "wall");
  });

  // ------------------------------------------------------------------ massing / SketchUp
  await shot("massing-plan", T("매스(B 상자 · U 원기둥 · 다각형): 평면에서 그리고 높이·테이퍼를 정합니다", "Masses (B box, U cylinder, polygon): draw in plan, set height and taper"), async () => {
    await sample("07-massing-study.myarch"); await tab("plan"); await run("view.fit");
    await app(`const s = app.store.project.solids[0]; app.plan.select([s.id]); app.refreshInspector(); return 1`);
  });
  await shot("massing-3d", T("매스 스터디 예제의 3D 모습", "The massing study in 3D"), async () => {
    await sample("07-massing-study.myarch"); await tab("3d"); await app(`app.v3d.setView("iso"); return 1`);
  });
  await shot("pushpull", T("밀기/끌기: 매스나 벽의 윗면을 위아래로 끌어 높이를 바꿉니다", "Push/Pull: drag the top of a mass or wall up or down"), async () => {
    await sample("07-massing-study.myarch"); await tab("3d"); await app(`app.v3d.setView("iso"); app.v3d.setTool("pushpull"); return 1`); await sleep(500);
    const s = await app(`const s = app.store.project.solids[0]; const xs = s.pts ? s.pts.map(p => p[0]) : [s.x]; const ys = s.pts ? s.pts.map(p => p[1]) : [s.y]; return [(Math.min(...xs) + Math.max(...xs)) / 2000, ((s.base || 0) + s.height) / 1000, (Math.min(...ys) + Math.max(...ys)) / 2000]`);
    const [x, y] = await at3d(s[0], s[1], s[2]); await a.move(x, y);
  });
  await shot("paint-bucket", T("페인트 통: 왼쪽 팔레트에서 재료를 고르고 벽·바닥·지붕·매스를 클릭합니다", "Paint bucket: pick a material on the left and click walls, floors, roofs or masses"), async () => {
    await sample("07-massing-study.myarch"); await tab("3d"); await app(`app.v3d.setView("iso"); app.v3d.setTool("paint"); return 1`);
  });
  await shot("tape-measure", T("줄자: 3D 모델 위 두 점 사이의 거리", "Tape measure: the distance between two points on the model"), async () => {
    await sample("03-two-storey-house.myarch"); await tab("3d"); await app(`app.v3d.setView("iso"); app.v3d.setTool("tape"); return 1`); await sleep(500);
    const p = await app(`const w = app.store.project.walls[0]; return [w.x1 / 1000, w.y1 / 1000, w.x2 / 1000, w.y2 / 1000]`);
    const [x1, y1] = await at3d(p[0], 1.0, p[1]); const [x2, y2] = await at3d(p[2], 1.0, p[3]);
    await a.click(x1, y1); await a.click(x2, y2);
  });
  await shot("scenes", T("장면: 지금 시점을 저장하고(+), 눌러서 이동하고, ▶ 로 차례로 재생합니다", "Scenes: save the current view (+), click to fly there, ▶ plays them in turn"), async () => {
    await sample("07-massing-study.myarch"); await tab("3d");
    await app(`const r = document.querySelector("[data-scene]"); r && r.click(); return 1`); await sleep(1200);
  });
  await shot("section-cut", T("단면(X): 지금 층을 바닥에서 1.2 m 높이로 잘라 내부를 보여 줍니다", "Section (X): cuts the current level 1.2 m above the floor"), async () => {
    await sample("03-two-storey-house.myarch"); await tab("3d"); await app(`app.v3d.setView("iso"); app.v3d.toggleSection(); return 1`);
  });
  for (const [st, ko, en] of [["white", "흰색 모형", "White model"], ["lines", "선 그림", "Line drawing"], ["xray", "X-레이", "X-ray"]]) {
    await shot(`style-${st}`, T(`표현 스타일: ${ko}`, `Display style: ${en}`), async () => {
      await sample("03-two-storey-house.myarch"); await tab("3d"); await app(`app.v3d.setView("iso"); app.v3d.setOpt("style", "${st}"); return 1`);
    });
  }
  await shot("walk-mode", T("걷기(V): 사람 눈높이에서 W/A/S/D 로 걸어 다닙니다", "Walk (V): walk around at eye height with W/A/S/D"), async () => {
    await sample("03-two-storey-house.myarch"); await tab("3d"); await app(`app.v3d.setNav("walk"); return 1`); await sleep(800);
  });
  await shot("elevation-ortho", T("정면도: 평행 투영(O)으로 입면을 그대로 봅니다", "Front elevation in orthographic projection (O)"), async () => {
    await sample("03-two-storey-house.myarch"); await tab("3d"); await app(`app.v3d.setOpt("ortho", true); app.v3d.elevation("front"); return 1`); await sleep(600);
  });
  await shot("sun-study", T("태양 분석: 대지 위치와 날짜·시각으로 실제 그림자를 봅니다", "Sun study: real shadows from the site, date and time"), async () => {
    await sample("03-two-storey-house.myarch"); await tab("3d");
    await app(`app.settings.sunStudy = true; app.settings.sunMonth = 12; app.settings.sunHour = 15; app.v3d.applySettings(); app.renderLeft(); app.v3d.setView("iso"); return 1`);
  });
  await shot("grid-3d", T("3D 그리드: 2D 처럼 5칸마다 또렷한 선(5×5), 확대·축소해도 같은 간격으로 보입니다", "3D grid: a slightly stronger line every 5 cells (5×5) like the plan, the same spacing at any zoom"), async () => {
    await sample("01-studio.myarch"); await tab("3d"); await app(`app.v3d.setView("iso"); return 1`);
  });
  await shot("context-menu-3d", T("3D 오른쪽 클릭 메뉴: 되돌리기/다시 실행, 보기 방향, 도구", "3D right-click menu: Undo / Redo, views and tools"), async () => {
    await sample("03-two-storey-house.myarch"); await tab("3d");
    const [x, y] = await app(`const r = app.v3d.viewer.three.renderer.domElement.getBoundingClientRect(); return [r.left + r.width * 0.3, r.top + r.height * 0.3]`);
    await a.click(x, y, { button: "right" });
  });

  // ------------------------------------------------------------------ BIM
  await shot("bim-renovation", T("단계: 기존(회색)·철거(빨간 점선)·신축 벽을 함께 그리고, 보기 → 단계 로 전후를 비교합니다", "Phases: existing (grey), demolished (red dashed) and new walls; compare with View → Phases"), async () => {
    await sample("06-renovation-bim.myarch"); await tab("plan"); await run("view.fit");
  });
  await shot("bim-inspector", T("BIM 속성: 단계, 분류 코드, IFC 클래스, GlobalId, 사용자 속성", "BIM data: phase, classification, IFC class, GlobalId and custom properties"), async () => {
    await sample("06-renovation-bim.myarch"); await tab("plan"); await run("view.fit");
    await app(`const w = app.store.project.walls.find(w => w.props && Object.keys(w.props).length) || app.store.project.walls[0]; app.plan.select([w.id]); app.refreshInspector(); const p = document.getElementById("right-panel"); p.scrollTop = p.scrollHeight; return 1`);
  });
  await shot("wall-types", T("벽 타입: 재료 층(구조·단열·마감)으로 두께를 정하고 벽에 지정합니다", "Wall types: layers (structure, insulation, finish) define the thickness"), async () => {
    await sample("06-renovation-bim.myarch"); await tab("plan"); await run("build.wallTypes"); await waitFor(`document.querySelector(".wt-dialog")`);
  });
  await shot("bim-properties", T("BIM 속성 창: 고른 요소에 내화 등급 같은 속성을 붙입니다", "BIM properties: add properties such as a fire rating to the selection"), async () => {
    await sample("06-renovation-bim.myarch"); await tab("plan");
    await app(`app.plan.select([app.store.project.walls[0].id]); app.run("build.bimProps"); return 1`); await waitFor(`document.querySelector(".modal")`);
  });
  await shot("schedules", T("일람표: 방 · 문과 창 · 벽 타입 · 공사비 · 층 — CSV 로 내보냅니다", "Schedules: rooms, doors & windows, wall types, costs and levels — export as CSV"), async () => {
    await sample("06-renovation-bim.myarch"); await run("build.schedules"); await waitFor(`document.querySelector(".modal .tabs")`);
  });
  await shot("schedules-cost", T("공사비 탭: 단가 × 수량으로 개략 공사비를 냅니다", "Cost tab: a rough estimate from unit prices × quantities"), async () => {
    await sample("06-renovation-bim.myarch"); await run("build.schedules"); await waitFor(`document.querySelector(".modal .tabs")`);
    await app(`const t = [...document.querySelectorAll(".modal .tab")].find(b => /공사비|Cost/.test(b.textContent)); t && t.click(); return 1`);
  });
  await shot("model-check", T("모델 검사(F5): 겹친 벽, 막힌 문, 간섭(가구·계단·기둥) 등을 찾고 눌러서 그곳으로 갑니다", "Model check (F5): overlapping walls, blocked doors, clashes … click an issue to go there"), async () => {
    await sample("02-two-bedroom.myarch"); await tab("plan");
    await app(`const p = app.store.project; app.store.edit("x", () => { p.furniture.push({ id: "c1", level: p.levels[0].id, kind: "box", x: 2600, y: 1800, rot: 0, w: 900, d: 900, h: 900, elevation: 0 }, { id: "c2", level: p.levels[0].id, kind: "box", x: 2900, y: 2000, rot: 0, w: 900, d: 900, h: 900, elevation: 0 }); }); app.runCheck(false); app.refreshInspector(); return 1`);
    await run("view.fit");
  });
  await shot("project-properties", T("프로젝트 속성: 제목·주소·대지 위도/경도·시간대·분류 체계", "Project properties: title, address, site latitude / longitude, time zone and classification system"), async () => {
    await sample("06-renovation-bim.myarch"); await run("file.props"); await waitFor(`document.querySelector(".modal")`);
  });

  // ------------------------------------------------------------------ files
  await shot("formats", T("지원 형식: 열기·가져오기·내보내기 형식 목록", "Supported formats for opening, import and export"), async () => {
    await run("help.formats"); await waitFor(`document.querySelector(".modal")`);
  });
  await shot("import-picker", T("가져오기: DXF·SVG·IFC·3D 모델·이미지", "Import: DXF, SVG, IFC, 3D models and images"), async () => {
    await tab("plan"); await app(`const d = await import("./src/ui/dialogs.js"); d.importPicker(app); return 1`); await sleep(300);
  });
  await shot("cad-tracing", T("DXF 따라 그리기: 가져온 CAD 선을 레이어별로 보이고 그 위에 벽을 그립니다", "Tracing a DXF: imported CAD layers shown under the walls you draw"), async () => {
    await sample("09-cad-tracing.myarch"); await tab("plan"); await run("view.fit");
  });
  await shot("cad-layers", T("CAD 레이어 창: 레이어별 표시·색·잠금", "CAD layers: visibility, colour and lock per layer"), async () => {
    await sample("09-cad-tracing.myarch"); await run("build.layers"); await waitFor(`document.querySelector(".modal")`);
  });
  await shot("export-3d", T("3D 내보내기: GLB·glTF·OBJ·STL·DAE·3MF·USDZ·PLY, 단위 선택", "3D export: GLB, glTF, OBJ, STL, DAE, 3MF, USDZ or PLY with units"), async () => {
    await sample("03-two-storey-house.myarch"); await run("file.export3d"); await waitFor(`document.querySelector(".modal")`);
  });
  await shot("export-ifc", T("IFC 내보내기: IFC4 또는 IFC2X3", "IFC export: IFC4 or IFC2X3"), async () => {
    await sample("06-renovation-bim.myarch"); await run("file.exportIfc"); await waitFor(`document.querySelector(".modal")`);
  });
  await shot("print-preview", T("인쇄 미리 보기: 용지·축척·표제란·방위표, PDF/SVG 로 저장", "Print preview: paper, scale, title block and north arrow; save as PDF or SVG"), async () => {
    await sample("03-two-storey-house.myarch"); await run("file.print"); await waitFor(`document.querySelector(".print-stage svg")`, 8000); await sleep(500);
  });
  await shot("recent-files", T("최근 파일: 10개까지 기억하고 하나씩 지우거나 목록을 비웁니다", "Recent files: up to 10, remove one or clear the list"), async () => {
    await app(`for (let i = 0; i < 6; i++) app.addRecent("C:/Projects/house-" + (i + 1) + ".myarch", "house " + (i + 1)); return 1`);
    await run("file.recent"); await waitFor(`document.querySelector(".modal")`);
  });

  // ------------------------------------------------------------------ appearance, help
  await shot("settings", T("설정(Ctrl+,): 일반·도면·벽·3D·출력 등 탭, 숫자는 − / + 로 조절", "Settings (Ctrl+,): tabs for general, plan, walls, 3D, output …; numbers use − / +"), async () => {
    await run("tools.settings"); await waitFor(`document.querySelector(".settings-modal")`);
  });
  await shot("themes", T("테마: 다크·라이트 40가지와 사용자 테마", "Themes: 40 dark and light themes plus your own"), async () => {
    await run("view.themes"); await waitFor(`document.querySelector(".modal")`);
  });
  await shot("light-theme", T("라이트 테마의 평면도", "The plan in a light theme"), async () => {
    await app(`app.setSetting("theme", "daylight"); return 1`);
    await sample("02-two-bedroom.myarch"); await tab("plan"); await run("view.fit");
  });
  await app(`app.setSetting("theme", "midnight"); return 1`);
  await shot("panels-collapsed", T("패널 접기(Ctrl+1 / Ctrl+2): 접힌 패널은 아이콘과 제목으로 남습니다", "Collapsed panels (Ctrl+1 / Ctrl+2) stay as an icon and title"), async () => {
    await sample("03-two-storey-house.myarch"); await tab("plan");
    await app(`app.settings.showLeft = false; app.settings.showRight = false; app.applyPanels(); return 1`); await sleep(300); await run("view.fit");
  });
  await app(`app.settings.showLeft = true; app.settings.showRight = true; app.applyPanels(); return 1`);
  await shot("status-bar", T("상태 표시줄: 좌표·층·격자·스냅·직교·축척·단위·선택·검사, 오른쪽 끝은 창 크기 조절 표시", "Status bar: position, level, grid, snap, ortho, scale, units, selection and check; the grip resizes the window"), async () => {
    await sample("03-two-storey-house.myarch"); await tab("plan"); await run("view.fit");
    await app(`app.plan.select(app.store.project.walls.slice(0, 2).map(w => w.id)); app.updateStatus(); return 1`);
    const [x, y] = await scr(3000, 2000); await a.move(x, y);
  }, { clip: () => app(`const b = document.getElementById("statusbar").getBoundingClientRect(); return { x: Math.max(0, b.right - 1000), y: b.top - 4, width: Math.min(1000, b.width), height: b.height + 4 };`) });
  await shot("tutorial-watch", T("튜토리얼 보기 모드: 프로그램이 직접 각 단계를 실행합니다", "Tutorial, watch mode: the program performs each step"), async () => {
    // Caught in the middle of a step (the animated cursor drawing walls); reset() waits for it to finish.
    await app(`app.store.dirty = false; const t = await app.openTutorial({ skipConfirm: true, lesson: 1, mode: "watch" }); t.instant = false; t.speed = 1; window.__tp = t.nextStep(); return 1`); await sleep(2600);
  });
  await shot("tutorial-practice", T("튜토리얼 따라 하기 모드: 할 곳이 표시되고, 직접 하면 자동으로 확인합니다", "Tutorial, practice mode: the place to act is marked and your result is checked"), async () => {
    await app(`app.store.dirty = false; const t = await app.openTutorial({ skipConfirm: true, lesson: 2, mode: "practice" }); return 1`);
    await sleep(500); await waitFor(`!app.tutorial.busy && document.querySelector(".tut-panel")`, 30000); await sleep(1500);
  });
  await app(`app.tutorial && app.tutorial.close(); return 1`);
  await shot("shortcuts", T("단축키 목록(Ctrl+/ 또는 도움말 → 단축키)", "Keyboard shortcuts (Ctrl+/ or Help → Keyboard shortcuts)"), async () => {
    await run("help.keys"); await waitFor(`document.querySelector(".modal")`);
  });
  await shot("about", T("정보 창: 버전과 빌드 정보", "About: version and build"), async () => {
    await run("help.about"); await waitFor(`document.querySelector(".modal")`);
  });
  await shot("menu-bim", T("BIM 메뉴", "The BIM menu"), async () => {
    await tab("plan"); const r = await rect('.menu-root[data-menu="BIM"]'); await a.click(r.x + 14, r.y + 14);
  });
  await shot("menu-3d", T("3D 메뉴", "The 3D menu"), async () => {
    await tab("plan"); const r = await rect('.menu-root[data-menu="3D"]'); await a.click(r.x + 14, r.y + 14);
  });
}

try {
  a = await launch({ width: W, height: H });
  await sleep(1500);
  await app(`app.settings.onboarded = true; return 1`);
  await closeAll();
  for (lang of langs) {
    outDir = path.join(root, "docs", "images", lang);
    fs.mkdirSync(outDir, { recursive: true });
    const mf = path.join(outDir, "shots.json");
    manifest = fs.existsSync(mf) && only ? JSON.parse(fs.readFileSync(mf, "utf8")) : {};
    console.log(`\n${lang}:`);
    await app(`app.setSetting("lang", ${JSON.stringify(lang)}); app.setSetting("theme", "midnight"); return 1`);
    await sleep(400);
    await shots();
    fs.writeFileSync(mf, JSON.stringify(manifest, null, 1));
  }
} finally {
  if (a) {
    if (a.errors.length) { console.error("renderer errors:\n" + a.errors.slice(0, 10).join("\n")); failures++; }
    await a.close();
  }
}
console.log(failures ? `\n${failures} screenshot(s) failed` : "\nall screenshots written");
process.exit(failures ? 1 : 0);
