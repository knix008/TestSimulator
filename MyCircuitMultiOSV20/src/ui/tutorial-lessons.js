// The guided tour: every lesson drives the real program to build one
// project — "LED switch with delay" — from an empty sheet to manufacturing
// files, touching every feature on the way. Each step's run() uses the UI the
// way a person would (toolbar, library, canvas clicks, keys, dialogs) and then
// checks the result, so the whole course is also an end-to-end test.
//
// Schematic coordinates are mils, PCB coordinates millimetres.

import { getSymbol } from "../lib/symbols.js";
import { partPins } from "../core/netlist.js";
import { routingStats, ratsnest, copperConnectivity } from "../pcb/board.js";

// Ids of the parts the tour creates, by role (refs are only known after annotation).
export const S = {};
const T = (ko, en) => ({ ko, en });

// ---------------------------------------------------------------- helpers
export function pinOf(ctx, role, num) {
  const id = S[role];
  const p = ctx.app.sch.fullSch.parts.find((x) => x.id === id);
  if (!p) throw new Error(`part ${role} not found`);
  // By the part itself: before annotation many parts share refs like "R?".
  const pin = partPins(p).find((q) => q.num === String(num));
  if (!pin) throw new Error(`pin ${role}.${num} not found`);
  return [pin.x, pin.y];
}

// The part playing a role, by id (refs are ambiguous until annotation).
export function partOf(ctx, role) {
  const p = ctx.app.store.project.schematic.parts.find((x) => x.id === S[role]);
  if (!p) throw new Error(`part ${role} not found`);
  return p;
}

export function refOf(ctx, role) {
  const p = ctx.app.store.project.schematic.parts.find((x) => x.id === S[role]);
  if (!p) throw new Error(`part ${role} not found`);
  return p.ref;
}

export const MAIN_VIEW = { x1: 1000, y1: 300, x2: 4600, y2: 3200 };
export const BENCH_VIEW = { x1: 1000, y1: 700, x2: 3400, y2: 2300 };

async function searchLibrary(ctx, text) {
  // A document edit rebuilds the library panel about 60ms later. Wait that out
  // before taking the search box, or typed text lands on a detached input.
  // Instant runs type in one shot, before that timer, so they must not wait.
  if (!(ctx.app.tutorial && ctx.app.tutorial.instant)) await new Promise((r) => setTimeout(r, 90));
  const input = await ctx.waitFor(() => document.querySelector(".side.left .search input"));
  await ctx.type(input, text);
}

// Place a library part through the library panel: search, click the row,
// optionally rotate the ghost with R, click on the sheet.
async function placePart(ctx, role, lib, x, y, { rot = 0, value = null, search = null } = {}) {
  await searchLibrary(ctx, search || lib);
  const row = await ctx.waitFor(() => [...document.querySelectorAll(".lib-item")].find((r) => r.querySelector(".nm").textContent === lib));
  await ctx.click(row);
  await ctx.canvasMove("sch", x - 150, y - 100);
  await ctx.canvasMove("sch", x, y);
  for (let i = 0; i < rot / 90; i++) await ctx.key("r");
  const before = ctx.app.store.project.schematic.parts.length;
  await ctx.canvasClick("sch", x, y);
  await ctx.key("Escape");
  const parts = ctx.app.store.project.schematic.parts;
  ctx.expect(parts.length === before + 1, `${lib} was not placed`);
  const part = parts[parts.length - 1];
  S[role] = part.id;
  if (value) await setValue(ctx, part, value);
  return part;
}

// Edit the value in the Properties panel (the part is selected after placing).
async function setValue(ctx, part, value) {
  ctx.app.sch.select([part.id]);
  ctx.app.refreshInspector();
  await ctx.wait(150);
  const label = [...document.querySelectorAll(".side.right .prop-grid > span")].find((s) => s.textContent === ctx.app.t("Value"));
  if (!label) throw new Error("value field not found");
  await ctx.type(label.nextElementSibling, value);
  ctx.expect(ctx.app.store.project.schematic.parts.find((p) => p.id === part.id).value === value, "value not set");
}

// Place power ports with P → pick list → clicks.
async function placePower(ctx, lib, points) {
  await ctx.key("p");
  const input = await ctx.waitFor(() => document.querySelector(".qp-input"));
  await ctx.type(input, lib);
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await ctx.wait(200);
  for (const [x, y] of points) {
    await ctx.canvasMove("sch", x, y);
    await ctx.canvasClick("sch", x, y);
  }
  await ctx.key("Escape");
  ctx.expect(ctx.app.sch.tool === "select", "power tool did not finish");
}

async function wire(ctx, a, b) {
  if (ctx.app.sch.tool !== "wire") await ctx.key("w");
  await ctx.canvasClick("sch", a[0], a[1]);
  await ctx.canvasMove("sch", (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  await ctx.canvasClick("sch", b[0], b[1]);
  if (ctx.app.sch.wire) await ctx.key("Escape");
}

export function sameNet(ctx, roleA, numA, roleB, numB) {
  const nl = ctx.app.sch.netlist();
  const a = nl.pinNet.get(`${S[roleA]}:${numA}`);
  const b = nl.pinNet.get(`${S[roleB]}:${numB}`);
  return a && a === b;
}

// Click a component in the 3D view: project its centre to the screen and
// send a real click to the 3D canvas.
async function click3D(ctx, ref) {
  const v = ctx.app.v3d.viewer;
  const { THREE, camera, renderer, content } = v.three;
  let obj = null;
  content.traverse((o) => { if (!obj && o.userData && o.userData.ref === ref && o.userData.fpId) obj = o; });
  if (!obj) throw new Error(`3D model of ${ref} not found`);
  // Try the middle first, then other points of the part's box: another part
  // may sit in front of the centre from this viewpoint.
  const box = new THREE.Box3().setFromObject(obj);
  const r = renderer.domElement.getBoundingClientRect();
  const fracs = [[0.5, 1, 0.5], [0.5, 0.6, 0.5], [0.3, 1, 0.3], [0.7, 1, 0.7], [0.3, 1, 0.7], [0.7, 1, 0.3], [0.5, 0.3, 0.5]];
  for (const [fx, fy, fz] of fracs) {
    const p = new THREE.Vector3(box.min.x + (box.max.x - box.min.x) * fx, box.min.y + (box.max.y - box.min.y) * fy, box.min.z + (box.max.z - box.min.z) * fz).project(camera);
    const x = r.left + ((p.x + 1) / 2) * r.width;
    const y = r.top + ((1 - p.y) / 2) * r.height;
    ctx.spot({ left: x - 20, top: y - 20, width: 40, height: 40 });
    await ctx.moveTo(x, y);
    const opts = { bubbles: true, clientX: x, clientY: y, button: 0, pointerId: 1, pointerType: "mouse", isPrimary: true };
    renderer.domElement.dispatchEvent(new PointerEvent("pointerdown", { ...opts, buttons: 1 }));
    renderer.domElement.dispatchEvent(new PointerEvent("pointerup", { ...opts, buttons: 0 }));
    await ctx.wait(300);
    if (ctx.app.v3d.picked === ref) return;
  }
}

function closeAllDialogs() {
  for (const b of document.querySelectorAll(".modal-backdrop, .qp-backdrop, .ctx-menu")) b.remove();
}

async function openTab(ctx, tab) {
  const name = ctx.app.t({ sch: "Schematic", pcb: "PCB", "3d": "3D View", sim: "Simulation", start: "Start" }[tab]);
  const tabs = [...document.querySelectorAll("#tabbar .doc-tab")];
  // Several schematic sheets share the tab bar. Open the one already current
  // so returning to the schematic view does not jump to another page.
  const btn = tabs.find((b) => b.textContent.startsWith(name) && (tab !== "sch" || !b.dataset.page || b.dataset.page === ctx.app.sch.pageId))
    || tabs.find((b) => b.textContent.startsWith(name));
  if (btn) await ctx.click(btn);
  else ctx.app.setTab(tab);
  await ctx.wait(300);
  ctx.expect(ctx.app.tab === tab, `could not open the ${tab} tab`);
}

async function dialogButton(ctx, label) {
  const btn = await ctx.waitFor(() => [...document.querySelectorAll(".modal-foot .btn")].find((b) => b.textContent.trim() === ctx.app.t(label)));
  await ctx.click(btn);
}

// ---------------------------------------------------------------- lessons
export const LESSONS = [
  // 1 -------------------------------------------------------------------
  {
    title: T("시작하기: 화면 둘러보기", "Getting started: the screen"),
    steps: [
      {
        title: T("새 프로젝트 만들기", "Create a new project"),
        text: T("튜토리얼은 실제 프로그램을 직접 조작하며 'LED 지연 스위치' 회로를 처음부터 완성합니다. 먼저 툴바의 새 프로젝트 버튼(Ctrl+N)으로 빈 프로젝트를 엽니다.",
          "The tutorial operates the real program to build an \"LED switch with delay\" from scratch. First the New project button (Ctrl+N) opens an empty project."),
        async run(ctx) {
          for (const k of Object.keys(S)) delete S[k];
          ctx.app.store.dirty = false;
          await ctx.command("file.new");
          await ctx.wait(300);
          closeAllDialogs();
          ctx.app.store.edit("Project properties", (p) => { p.meta.title = ctx.L(T("LED 지연 스위치", "LED switch with delay")); p.meta.author = "MyCircuit Tutorial"; p.meta.rev = "A"; });
          ctx.expect(ctx.app.tab === "sch" && ctx.app.store.project.schematic.parts.length === 0, "new project did not open");
        },
      },
      {
        title: T("탭과 패널", "Tabs and panels"),
        text: T("위쪽 탭은 회로도·PCB·3D·시뮬레이션 화면입니다. 왼쪽은 부품 라이브러리, 오른쪽은 선택한 항목의 속성과 ERC/DRC 문제 목록, 아래는 좌표·그리드·검사 결과가 보이는 상태 표시줄입니다.",
          "The tabs at the top switch between schematic, PCB, 3D and simulation. Left: the part library. Right: properties of the selection and the ERC/DRC issue list. Bottom: the status bar with coordinates, grid and check results."),
        async run(ctx) {
          ctx.spot("#tabbar"); await ctx.wait(900);
          ctx.spot("#left-panel"); await ctx.wait(900);
          ctx.spot("#right-panel"); await ctx.wait(900);
          ctx.spot("#statusbar"); await ctx.wait(900);
        },
      },
      {
        title: T("명령 팔레트 (Ctrl+K)", "Command palette (Ctrl+K)"),
        text: T("Ctrl+K를 누르면 모든 명령·부품·넷을 이름으로 찾아 바로 실행할 수 있습니다. 메뉴 위치를 몰라도 됩니다.",
          "Ctrl+K searches every command, part and net by name and runs it — no need to know where a menu item lives."),
        async run(ctx) {
          await ctx.key("k", { ctrl: true });
          const input = await ctx.waitFor(() => document.querySelector(".qp-input"));
          await ctx.type(input, ctx.app.t("Zoom to fit"));
          await ctx.wait(500);
          input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
          ctx.expect(!document.querySelector(".quickpick"), "palette did not close");
        },
      },
      {
        title: T("테마와 언어", "Theme and language"),
        text: T("오른쪽 위 팔레트 버튼은 테마를 무작위로 바꾸고, 옆의 ▾ 버튼은 다크 20개·라이트 20개 테마 목록을 엽니다. 라이트 테마를 하나 골라 보여 준 뒤 원래대로 돌립니다. 깃발 버튼은 한국어/영어를 바꿉니다.",
          "The palette button at the top right switches to a random theme; the ▾ beside it lists 20 dark and 20 light themes. A light theme is applied briefly, then the original is restored. The flag button switches Korean/English."),
        async run(ctx) {
          const before = ctx.app.settings.theme;
          await ctx.click("#title-right .icon-btn.caret");
          const row = await ctx.waitFor(() => { const c = document.querySelectorAll(".theme-drop .theme-col")[1]; return c && c.querySelectorAll(".theme-row")[4]; });
          await ctx.click(row);
          ctx.expect(document.documentElement.dataset.theme === "light", "light theme not applied");
          await ctx.wait(900);
          ctx.app.setSetting("theme", before);
          ctx.app.buildTitleRight();
        },
      },
    ],
  },
  // 2 -------------------------------------------------------------------
  {
    title: T("회로도: 부품 배치", "Schematic: placing parts"),
    steps: [
      {
        title: T("라이브러리에서 배터리 찾기", "Find the battery in the library"),
        text: T("왼쪽 라이브러리 검색창에 이름이나 값을 입력하면 바로 걸러집니다. 'BATTERY'를 클릭한 뒤 시트를 클릭하면 놓입니다.",
          "Typing a name or value in the library search box filters instantly. Click BATTERY, then click on the sheet to place it."),
        async run(ctx) {
          await ctx.view("sch", MAIN_VIEW, 0.05);
          await placePart(ctx, "bt", "BATTERY", 1500, 2500, { value: "9V" });
          ctx.expect(getSymbol(ctx.app.store.project.schematic.parts[0].lib).name === "BATTERY");
        },
      },
      {
        title: T("스위치와 저항", "Switch and resistor"),
        text: T("누름 스위치를 놓고, 저항은 배치 전에 R 키로 90° 돌려 가로로 놓습니다. 값은 오른쪽 속성 패널에서 바로 입력합니다(10k).",
          "Place a push button, and rotate the resistor 90° with R before placing it horizontally. Its value is typed straight into the Properties panel (10k)."),
        async run(ctx) {
          await placePart(ctx, "sw", "SW_PUSH", 2300, 2000, { search: "push" });
          await placePart(ctx, "r1", "R", 3000, 2000, { rot: 90, value: "10k", search: "resistor" });
        },
      },
      {
        title: T("트랜지스터, LED, 저항, 커패시터", "Transistor, LED, resistor, capacitor"),
        text: T("NPN 트랜지스터, LED, LED 전류 제한 저항(470Ω), 지연용 전해 커패시터(100µ)를 놓습니다. 트랜지스터의 B·C·E 핀은 일반 TO-92 순서(1=E, 2=B, 3=C)로 번호가 매겨져 있습니다.",
          "Place the NPN transistor, the LED, its current-limiting resistor (470 Ω) and the delay capacitor (100 µ). Transistor pins follow the usual TO-92 order (1=E, 2=B, 3=C)."),
        async run(ctx) {
          await placePart(ctx, "q1", "Q_NPN", 3700, 2000, { search: "npn" });
          await placePart(ctx, "d1", "LED", 3800, 1400, { search: "led" });
          await placePart(ctx, "r2", "R", 3800, 800, { value: "470", search: "resistor" });
          await placePart(ctx, "c1", "C_POL", 3400, 2500, { value: "100u", search: "electrolytic" });
          ctx.expect(ctx.app.store.project.schematic.parts.length === 7, "expected seven parts");
        },
      },
      {
        title: T("전원 포트", "Power ports"),
        text: T("P 키로 전원 심볼 목록을 열고 VBAT와 GND를 고릅니다. 같은 이름의 전원 포트는 선을 긋지 않아도 모두 같은 넷입니다.",
          "P opens the power symbols; pick VBAT and GND. Power ports with the same name are the same net without drawing a wire between them."),
        async run(ctx) {
          await placePower(ctx, "VBAT", [pinOf(ctx, "bt", "1"), pinOf(ctx, "r2", "1")]);
          await placePower(ctx, "GND", [[1500, 2900], [3800, 2400], [3400, 2900]]);
          const s = ctx.app.store.project.schematic;
          ctx.expect(s.parts.filter((p) => p.lib === "GND").length === 3 && s.parts.filter((p) => p.lib === "VBAT").length === 2, "power ports missing");
        },
      },
    ],
  },
  // 3 -------------------------------------------------------------------
  {
    title: T("회로도: 배선과 레이블", "Schematic: wires and labels"),
    steps: [
      {
        title: T("배선 도구 (W)", "The wire tool (W)"),
        text: T("W를 누르고 핀 끝을 클릭한 뒤 다른 핀을 클릭하면 직각으로 꺾인 배선이 만들어지고, 핀에 닿으면 자동으로 끝납니다.",
          "Press W, click a pin end, then click another pin: an orthogonal wire is drawn and it finishes by itself when it reaches a pin."),
        async run(ctx) {
          await wire(ctx, pinOf(ctx, "bt", "1"), pinOf(ctx, "sw", "1"));
          await wire(ctx, pinOf(ctx, "sw", "2"), pinOf(ctx, "r1", "1"));
          await wire(ctx, pinOf(ctx, "r1", "2"), pinOf(ctx, "q1", "2"));
          ctx.expect(sameNet(ctx, "r1", "2", "q1", "2") && sameNet(ctx, "bt", "1", "sw", "1"), "wires do not connect the pins");
        },
      },
      {
        title: T("LED 쪽 배선과 접지", "LED branch and grounds"),
        text: T("저항→LED 애노드, LED 캐소드→컬렉터, 이미터·커패시터·배터리(−)→GND를 잇습니다.",
          "Wire resistor → LED anode, LED cathode → collector, and emitter, capacitor and battery (−) to GND."),
        async run(ctx) {
          await wire(ctx, pinOf(ctx, "r2", "2"), pinOf(ctx, "d1", "2"));
          await wire(ctx, pinOf(ctx, "d1", "1"), pinOf(ctx, "q1", "3"));
          await wire(ctx, pinOf(ctx, "q1", "1"), [3800, 2400]);
          await wire(ctx, pinOf(ctx, "c1", "2"), [3400, 2900]);
          await wire(ctx, pinOf(ctx, "bt", "2"), [1500, 2900]);
          ctx.expect(sameNet(ctx, "d1", "1", "q1", "3") && sameNet(ctx, "q1", "1", "bt", "2"), "LED branch not connected");
        },
      },
      {
        title: T("T 접속과 자동 정션", "T joints and automatic junctions"),
        text: T("커패시터 위쪽 핀에서 베이스 배선의 중간을 클릭하면 T자로 연결되고 정션 점이 자동으로 찍힙니다.",
          "Wiring from the capacitor's top pin to the middle of the base wire makes a T joint, and the junction dot appears automatically."),
        async run(ctx) {
          const [x, y] = pinOf(ctx, "c1", "1");
          await wire(ctx, [x, y], [x, 2000]);
          ctx.expect(ctx.app.store.project.schematic.junctions.length >= 1 && sameNet(ctx, "c1", "1", "q1", "2"), "T joint missing");
        },
      },
      {
        title: T("넷 레이블 (L)", "Net labels (L)"),
        text: T("L을 누르고 배선을 클릭하면 이름 입력창이 뜹니다. 'BASE'라고 이름을 붙이면 그 넷의 이름이 되고, 같은 이름의 레이블끼리는 연결됩니다.",
          "Press L and click a wire to type a name. Calling it BASE names the net; labels with the same name are connected."),
        async run(ctx) {
          await ctx.key("l");
          await ctx.canvasClick("sch", 3300, 2000);
          await ctx.popup("BASE");
          await ctx.key("Escape");
          ctx.expect(ctx.app.sch.netlist().pinNet.get(`${S.q1}:2`) === "BASE", "label did not name the net");
        },
      },
      {
        title: T("텍스트 메모 (T)", "Text notes (T)"),
        text: T("T로 시트에 설명을 적어 둡니다.", "T writes a note on the sheet."),
        async run(ctx) {
          await ctx.key("t");
          await ctx.canvasClick("sch", 1200, 600);
          await ctx.popup(ctx.L(T("버튼을 누르면 LED가 켜지고, 놓으면 C1이 방전될 때까지 서서히 꺼집니다.", "Press the button: the LED turns on; release: it fades as C1 discharges.")));
          await ctx.key("Escape");
          ctx.expect(ctx.app.store.project.schematic.texts.length === 1, "text not added");
        },
      },
    ],
  },
  // 4 -------------------------------------------------------------------
  {
    title: T("회로도: 편집 기능", "Schematic: editing"),
    steps: [
      {
        title: T("클릭 선택과 끌어 옮기기", "Select and drag"),
        text: T("부품을 끌면 연결된 배선이 고무줄처럼 따라오며 직각을 유지합니다. 옮겨 본 뒤 Ctrl+Z로 되돌립니다.",
          "Dragging a part pulls its wires along like rubber bands, keeping them orthogonal. After the move, Ctrl+Z undoes it."),
        async run(ctx) {
          const r2 = partOf(ctx, "r2");
          const x0 = r2.x;
          await ctx.canvasDrag("sch", [r2.x, r2.y], [r2.x + 400, r2.y]);
          ctx.expect(partOf(ctx, "r2").x === x0 + 400, "drag did not move the part");
          await ctx.wait(500);
          await ctx.key("z", { ctrl: true });
          ctx.expect(partOf(ctx, "r2").x === x0, "undo did not restore the part");
          await ctx.key("y", { ctrl: true });
          await ctx.key("z", { ctrl: true });
        },
      },
      {
        title: T("연습용 부품: 회전·대칭·복제", "Practice part: rotate, mirror, duplicate"),
        text: T("빈 곳에 NE555를 놓고 R(회전), Y(좌우 대칭), Ctrl+D(복제), Ctrl+C/Ctrl+V(복사·붙여넣기)를 차례로 해 봅니다.",
          "On free space, place an NE555 and try R (rotate), Y (mirror), Ctrl+D (duplicate) and Ctrl+C / Ctrl+V (copy and paste)."),
        async run(ctx) {
          await ctx.view("sch", { x1: 4500, y1: 600, x2: 8200, y2: 3200 }, 0.05);
          const u = await placePart(ctx, "demo", "NE555", 5600, 1500, { search: "555" });
          ctx.app.sch.select([u.id]);
          await ctx.key("r");
          ctx.expect(u.rot === 90, "rotate failed");
          await ctx.key("y");
          ctx.expect(u.mirror === true, "mirror failed");
          await ctx.key("r"); await ctx.key("r"); await ctx.key("r");
          await ctx.key("y");
          const n0 = ctx.app.store.project.schematic.parts.length;
          await ctx.key("d", { ctrl: true });
          ctx.expect(ctx.app.store.project.schematic.parts.length === n0 + 1, "duplicate failed");
          ctx.app.sch.select([u.id]);
          await ctx.key("c", { ctrl: true });
          await ctx.canvasMove("sch", 7200, 2600);
          await ctx.key("v", { ctrl: true });
          ctx.expect(ctx.app.store.project.schematic.parts.length === n0 + 2, "paste failed");
        },
      },
      {
        title: T("연결 없음 플래그·글로벌 레이블·버스", "No-connect, global label, bus"),
        text: T("쓰지 않는 핀에는 Q로 '연결 없음' 표시를 해서 ERC가 경고하지 않게 합니다. Ctrl+L은 글로벌 레이블, B는 버스(그림)입니다.",
          "Unused pins get a no-connect flag (Q) so ERC does not complain. Ctrl+L places a global label, B draws a bus line."),
        async run(ctx) {
          const u = ctx.app.store.project.schematic.parts.find((p) => p.id === S.demo);
          const cvPin = partPins(u).find((q) => q.num === "5");
          const cv = [cvPin.x, cvPin.y];
          await ctx.key("q");
          await ctx.canvasClick("sch", cv[0], cv[1]);
          await ctx.key("Escape");
          ctx.expect(ctx.app.store.project.schematic.noconnects.length === 1, "no-connect not placed");
          await ctx.key("b");
          await ctx.canvasClick("sch", 5000, 2900);
          await ctx.canvasClick("sch", 6400, 2900);
          await ctx.canvasClick("sch", 6400, 2900, { dbl: true });
          if (ctx.app.sch.wire) await ctx.key("Escape");
          await ctx.key("Escape");
          ctx.expect(ctx.app.store.project.schematic.buses.length >= 1, "bus not drawn");
        },
      },
      {
        title: T("상자 선택과 삭제", "Box select and delete"),
        text: T("Shift를 누른 채 빈 곳에서 오른쪽 아래로 끌면 완전히 들어간 항목만, 왼쪽 위로 끌면 걸친 항목까지 선택됩니다(그냥 끌면 화면이 움직입니다). 연습용 항목을 모두 골라 Del로 지웁니다.",
          "Hold Shift and drag right/down from empty space to select what is fully inside; dragging left/up also selects what it touches (a plain drag moves the view). All practice items are selected and deleted with Del."),
        async run(ctx) {
          await ctx.key("Escape");
          await ctx.canvasDrag("sch", [4700, 700], [8100, 3150], { shift: true });
          ctx.expect(ctx.app.sch.sel.size >= 3, "box selection selected nothing");
          await ctx.key("Delete");
          const s = ctx.app.store.project.schematic;
          ctx.expect(!s.parts.some((p) => p.lib === "NE555") && !s.buses.length && !s.noconnects.length, "practice items not deleted");
          await ctx.view("sch", MAIN_VIEW, 0.05);
        },
      },
      {
        title: T("속성 대화상자와 필드 옮기기", "Properties dialog and moving fields"),
        text: T("부품을 더블클릭하면 속성 대화상자가 열립니다(참조·값·풋프린트·필드). 값 글자는 따로 끌어서 보기 좋은 자리로 옮길 수 있습니다.",
          "Double-clicking a part opens its properties (reference, value, footprint, fields). The value text can be dragged on its own to a tidier spot."),
        async run(ctx) {
          const q = partOf(ctx, "q1");
          await ctx.canvasClick("sch", q.x + 20, q.y, { dbl: true });
          await ctx.waitFor(() => ctx.modal());
          await ctx.wait(900);
          await dialogButton(ctx, "Cancel");
          ctx.expect(!ctx.modal(), "dialog did not close");
        },
      },
    ],
  },
  // 5 -------------------------------------------------------------------
  {
    title: T("여러 페이지 회로도", "Multi-page schematics"),
    steps: [
      {
        title: T("페이지 추가와 이름 바꾸기", "Add and rename a page"),
        text: T("캔버스 왼쪽 아래 '+' 탭으로 페이지를 추가하고, 탭을 더블클릭해 이름을 'Test bench'로 바꿉니다. 시뮬레이션용 입력 신호 회로를 여기에 그립니다.",
          "The '+' tab at the bottom left of the canvas adds a page; double-clicking a tab renames it ('Test bench'). The simulation stimulus goes here."),
        async run(ctx) {
          await ctx.click(".page-tab.add");
          closeAllDialogs();
          ctx.expect(ctx.app.store.project.schematic.pages.length === 2, "page not added");
          const tabs = document.querySelectorAll(".page-tab:not(.add)");
          await ctx.click(tabs[1]);
          tabs[1].dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
          await ctx.popup("Test bench");
          await ctx.wait(200);
          ctx.expect(ctx.app.store.project.schematic.pages[1].name === "Test bench", "page not renamed");
          await ctx.view("sch", BENCH_VIEW, 0.05);
        },
      },
      {
        title: T("펄스 전압원과 RC 필터", "Pulse source and RC filter"),
        text: T("전압원(VSOURCE)을 놓고 파형을 펄스(5 V, 주기 4 ms)로 정합니다. 그 뒤에 1kΩ·1µF RC 저역 통과 필터를 붙입니다.",
          "Place a voltage source and set it to a 5 V, 4 ms pulse, followed by a 1 kΩ / 1 µF RC low-pass filter."),
        async run(ctx) {
          const v = await placePart(ctx, "v1", "VSOURCE", 1500, 1500, { value: "0", search: "voltage source" });
          ctx.app.store.edit("Edit part", () => { v.fields = { ...(v.fields || {}), wave: "pulse", amplitude: "5", offset: "0", period: "4m", duty: "50" }; });
          await placePart(ctx, "r4", "R", 2200, 1300, { rot: 90, value: "1k", search: "resistor" });
          await placePart(ctx, "c2", "C", 2700, 1500, { value: "1u", search: "capacitor" });
          await placePower(ctx, "GND", [[1500, 1900], [2700, 1900]]);
          await wire(ctx, pinOf(ctx, "v1", "1"), pinOf(ctx, "r4", "1"));
          await wire(ctx, pinOf(ctx, "r4", "2"), pinOf(ctx, "c2", "1"));
          await wire(ctx, pinOf(ctx, "v1", "2"), [1500, 1900]);
          await wire(ctx, pinOf(ctx, "c2", "2"), [2700, 1900]);
          ctx.expect(sameNet(ctx, "r4", "2", "c2", "1"), "filter not wired");
        },
      },
      {
        title: T("글로벌 레이블로 이름 붙이기", "Name nets with global labels"),
        text: T("Ctrl+L로 글로벌 레이블 IN과 OUT을 답니다. 글로벌 레이블과 전원 포트는 페이지를 넘어 연결되고, 일반 레이블은 자기 페이지 안에서만 연결됩니다.",
          "Ctrl+L adds the global labels IN and OUT. Global labels and power ports connect across pages; ordinary labels only within their page."),
        async run(ctx) {
          await ctx.key("l", { ctrl: true });
          await ctx.canvasClick("sch", 1700, 1300);
          await ctx.popup("IN");
          await ctx.canvasClick("sch", 2550, 1300);
          await ctx.popup("OUT");
          await ctx.key("Escape");
          const nl = ctx.app.sch.netlist();
          ctx.expect(nl.pinNet.get(`${S.c2}:1`) === "OUT" && nl.pinNet.get(`${S.v1}:1`) === "IN", "global labels missing");
          const first = document.querySelector(".page-tab:not(.add)");
          await ctx.click(first);
          ctx.expect(ctx.app.sch.pageId === ctx.app.store.project.schematic.pages[0].id, "did not return to page 1");
          await ctx.view("sch", MAIN_VIEW, 0.05);
        },
      },
    ],
  },
  // 6 -------------------------------------------------------------------
  {
    title: T("참조 번호와 전기 규칙 검사(ERC)", "Annotation and ERC"),
    steps: [
      {
        title: T("참조 번호 부여", "Annotate"),
        text: T("툴바의 참조 번호 부여 버튼이 R?, Q? 같은 부품에 페이지 순서·위치 순서대로 R1, R2… 번호를 붙입니다.",
          "The Annotate button numbers parts like R?, Q? as R1, R2 … in page order, then top-to-bottom, left-to-right."),
        async run(ctx) {
          await ctx.command("tools.annotate");
          const s = ctx.app.store.project.schematic;
          ctx.expect(!s.parts.some((p) => { const sym = getSymbol(p.lib); return sym && !sym.power && /\?$/.test(p.ref); }), "some parts are not annotated");
        },
      },
      {
        title: T("ERC로 실수 찾기", "Find mistakes with ERC"),
        text: T("일부러 LED와 트랜지스터 사이 배선을 지워 봅니다. ERC가 실시간으로 '연결되지 않은 핀'을 찾아 오른쪽 목록과 캔버스에 표시합니다. 문제를 클릭하면 그 자리로 이동합니다.",
          "The wire between the LED and the transistor is deleted on purpose. ERC instantly lists the unconnected pins on the right and marks them on the canvas; clicking an issue zooms to it."),
        async run(ctx) {
          const [x, y] = pinOf(ctx, "d1", "1");
          await ctx.canvasClick("sch", x, y + 100);
          await ctx.key("Delete");
          await ctx.wait(700);
          ctx.app.runErc(false);
          ctx.app.refreshInspector();
          await ctx.wait(300);
          ctx.expect(ctx.app.ercIssues.some((i) => i.code === "unconnected-pin"), "ERC did not report the open pin");
          const issue = await ctx.waitFor(() => document.querySelector(".issue"));
          await ctx.click(issue);
          await ctx.wait(800);
        },
      },
      {
        title: T("되돌리고 다시 검사", "Undo and check again"),
        text: T("Ctrl+Z로 배선을 되살리고 ERC를 다시 실행하면 오류가 없어집니다.", "Ctrl+Z brings the wire back and ERC runs clean again."),
        async run(ctx) {
          await ctx.key("z", { ctrl: true });
          await ctx.command("inspect.erc");
          closeAllDialogs();
          ctx.expect(!ctx.app.ercIssues.some((i) => i.severity === "error") && sameNet(ctx, "d1", "1", "q1", "3"), "ERC still reports errors");
          await ctx.view("sch", MAIN_VIEW, 0.05);
        },
      },
      {
        title: T("넷 강조와 찾기", "Net highlight and find"),
        text: T("배선을 클릭하면 그 넷 전체가 강조됩니다. Ctrl+F로 부품·넷·레이블을 찾아 이동할 수 있습니다.",
          "Clicking a wire highlights its whole net. Ctrl+F finds parts, nets and labels and jumps to them."),
        async run(ctx) {
          await ctx.canvasClick("sch", 2650, 2000);
          await ctx.wait(700);
          await ctx.key("f", { ctrl: true });
          const input = await ctx.waitFor(() => document.querySelector(".qp-input"));
          await ctx.type(input, "BASE");
          await ctx.wait(500);
          input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
          await ctx.wait(500);
          // The first match may be the BASE label (the view jumps to it) or the net (highlighted).
          ctx.expect(ctx.app.highlightNet === "BASE" || (ctx.app.sch.flash && performance.now() - ctx.app.sch.flash.until < 2000), "find did not go to BASE");
          await ctx.key("Escape");
          ctx.app.highlightNet = null;
        },
      },
    ],
  },
  // 7 -------------------------------------------------------------------
  {
    title: T("풋프린트 지정과 PCB로 보내기", "Footprints and sending to the PCB"),
    steps: [
      {
        title: T("풋프린트 지정 대화상자", "Assign footprints"),
        text: T("도구 → 풋프린트 지정에서 부품마다 풋프린트를 고릅니다. ★는 심볼이 추천하는 풋프린트입니다. R2는 스루홀 저항, D1은 5 mm LED로 바꿉니다.",
          "Tools → Assign footprints picks a footprint per part (★ = suggested by the symbol). R2 becomes a through-hole resistor, D1 a 5 mm LED."),
        async run(ctx) {
          await ctx.command("tools.footprints");
          await ctx.waitFor(() => ctx.modal());
          const pick = async (role, fp) => {
            const ref = refOf(ctx, role);
            const row = [...document.querySelectorAll(".modal table.grid tr")].find((tr) => tr.firstChild && tr.firstChild.textContent === ref);
            await ctx.click(row);
            const search = document.querySelector(".modal input.input");
            await ctx.type(search, fp);
            const item = await ctx.waitFor(() => [...document.querySelectorAll(".modal .net-row")].find((r) => r.firstChild.textContent.replace("★ ", "") === fp));
            await ctx.click(item);
          };
          await pick("r2", "R_Axial_P10.16mm");
          await pick("d1", "LED_D5.0mm");
          await pick("r1", "R_Axial_P10.16mm");
          await dialogButton(ctx, "Apply");
          ctx.expect(partOf(ctx, "r2").footprint === "R_Axial_P10.16mm" && partOf(ctx, "d1").footprint === "LED_D5.0mm", "footprints not applied");
        },
      },
      {
        title: T("PCB 업데이트 (F8)", "Update the PCB (F8)"),
        text: T("F8을 누르면 회로도의 부품과 연결이 PCB로 넘어갑니다. 풋프린트는 기판 옆에 놓이고, 연결해야 할 곳은 가는 선(래츠네스트)으로 보입니다.",
          "F8 sends parts and connections to the board. Footprints appear next to the board, and thin airwires (the ratsnest) show what still has to be connected."),
        async run(ctx) {
          await ctx.key("F8");
          await ctx.wait(500);
          ctx.expect(ctx.app.tab === "pcb" && ctx.app.store.project.pcb.footprints.length >= 9, "footprints did not arrive on the board");
          ctx.expect(routingStats(ctx.app.store.project.pcb).unrouted > 0, "no ratsnest");
        },
      },
    ],
  },
  // 8 -------------------------------------------------------------------
  {
    title: T("PCB: 기판과 배치", "PCB: board and placement"),
    steps: [
      {
        title: T("기판 외곽선 그리기 (O)", "Draw the board outline (O)"),
        text: T("O를 누르고 끌면 사각형 외곽선이 됩니다. 여러 번 클릭하면 임의의 모양도 그릴 수 있습니다. 60×40 mm 기판을 만듭니다.",
          "Press O and drag for a rectangle (clicking corners draws any shape). A 60 × 40 mm board is drawn."),
        async run(ctx) {
          await ctx.view("pcb", { x1: -10, y1: -10, x2: 110, y2: 60 }, 0.03);
          await ctx.key("o");
          await ctx.canvasDrag("pcb", [0, 0], [60, 40]);
          await ctx.key("Escape");
          const o = ctx.app.store.project.pcb.outline;
          const xs = o.map((p) => p[0]);
          ctx.expect(Math.abs(Math.max(...xs) - Math.min(...xs) - 60) < 0.7, "outline is not 60 mm wide");
        },
      },
      {
        title: T("자동 정렬로 기판 안에 놓기", "Arrange footprints on the board"),
        text: T("배선 → 풋프린트 기판에 배치는 부품을 기판 안에 가지런히 늘어놓습니다. 그 뒤 손으로 다듬습니다.",
          "Route → Arrange footprints on board lines the parts up inside the board; then they are fine-tuned by hand."),
        async run(ctx) {
          await ctx.command("pcb.arrange");
          await ctx.wait(300);
          ctx.app.pcb.zoomFit();
          const pcb = ctx.app.store.project.pcb;
          ctx.expect(pcb.footprints.every((f) => f.x > 0 && f.x < 60 && f.y > 0 && f.y < 40), "footprints are not on the board");
        },
      },
      {
        title: T("끌어 옮기기·회전(R)·뒤집기(F)·잠금(L)", "Drag, rotate (R), flip (F), lock (L)"),
        text: T("풋프린트를 끌어 옮기고, R로 회전하고, F로 아랫면으로 뒤집었다 되돌리고, L로 잠급니다. 잠근 부품은 움직이지 않습니다.",
          "Footprints are dragged, rotated with R, flipped to the bottom with F (and back), and locked with L — locked parts stay put."),
        async run(ctx) {
          const bt = ctx.fp(refOf(ctx, "bt"));
          const x0 = bt.x;
          await ctx.canvasDrag("pcb", [bt.x, bt.y], [bt.x + 1.27, bt.y]);
          ctx.expect(ctx.fp(refOf(ctx, "bt")).x !== x0, "drag did not move the footprint");
          await ctx.key("z", { ctrl: true });
          ctx.app.pcb.select([ctx.fp(refOf(ctx, "sw")).id]);
          await ctx.key("r");
          await ctx.key("r", { shift: true });
          await ctx.key("f");
          ctx.expect(ctx.fp(refOf(ctx, "sw")).side === "B", "flip failed");
          await ctx.key("f");
          await ctx.key("l");
          ctx.expect(ctx.fp(refOf(ctx, "sw")).locked, "lock failed");
          await ctx.key("l");
        },
      },
      {
        title: T("레이어와 고대비 보기", "Layers and high contrast"),
        text: T("PgUp/PgDn은 활성 레이어를 바꾸고, H는 다른 레이어를 흐리게 하는 고대비 보기입니다. 왼쪽 레이어 패널에서 눈 아이콘으로 보이기/숨기기를 합니다.",
          "PgUp/PgDn switch the active layer, H toggles high contrast (other layers dimmed). The eye icons in the Layers panel show/hide layers."),
        async run(ctx) {
          ctx.app.pcb.setActiveLayer("F.Cu");
          await ctx.key("PageDown");
          ctx.expect(ctx.app.pcb.activeLayer !== "F.Cu", "layer did not change");
          await ctx.key("h");
          await ctx.wait(700);
          await ctx.key("h");
          await ctx.key("PageUp");
          ctx.spot("#left-panel");
          await ctx.wait(700);
        },
      },
      {
        title: T("기판 설정", "Board setup"),
        text: T("기판 설정에서 층 수·두께·솔더 마스크 색·표면 처리·설계 규칙·넷 클래스를 정합니다. 마스크를 파란색, 표면 처리를 ENIG로 바꿉니다.",
          "Board setup holds layer count, thickness, mask colour, surface finish, design rules and net classes. Mask becomes blue, finish ENIG."),
        async run(ctx) {
          await ctx.command("tools.boardSetup");
          await ctx.waitFor(() => ctx.modal());
          const selects = [...document.querySelectorAll(".modal select")];
          const mask = selects.find((s) => [...s.options].some((o) => o.value === "purple"));
          const finish = selects.find((s) => [...s.options].some((o) => o.value === "ENIG"));
          mask.value = "blue"; mask.dispatchEvent(new Event("change", { bubbles: true }));
          finish.value = "ENIG"; finish.dispatchEvent(new Event("change", { bubbles: true }));
          ctx.spot(mask); await ctx.wait(500);
          for (const tab of document.querySelectorAll(".modal .tab")) { await ctx.click(tab); await ctx.wait(300); }
          await dialogButton(ctx, "Apply");
          ctx.expect(ctx.app.store.project.pcb.maskColor === "blue" && ctx.app.store.project.pcb.finish === "ENIG", "board setup not applied");
        },
      },
    ],
  },
  // 9 -------------------------------------------------------------------
  {
    title: T("PCB: 배선", "PCB: routing"),
    steps: [
      {
        title: T("손으로 트랙 배선 (X)", "Route a track by hand (X)"),
        text: T("X를 누르고 패드를 클릭한 뒤 같은 넷의 다른 패드를 클릭하면 45° 각도로 트랙이 그려집니다. 다른 넷에 너무 가까우면 미리보기가 빨갛게 변해 미리 알려 줍니다.",
          "Press X, click a pad, then the other pad of the same net: a 45° track is drawn. If it gets too close to another net the preview turns red before you commit."),
        async run(ctx) {
          const pcb = ctx.app.store.project.pcb;
          const rats = ratsnest(pcb, copperConnectivity(pcb)).sort((a, b) => Math.hypot(a.x2 - a.x1, a.y2 - a.y1) - Math.hypot(b.x2 - b.x1, b.y2 - b.y1));
          const r = rats[0];
          await ctx.view("pcb", { x1: Math.min(r.x1, r.x2) - 6, y1: Math.min(r.y1, r.y2) - 6, x2: Math.max(r.x1, r.x2) + 6, y2: Math.max(r.y1, r.y2) + 6 }, 0.1);
          const before = pcb.tracks.length;
          await ctx.key("x");
          await ctx.canvasClick("pcb", r.x1, r.y1);
          await ctx.canvasMove("pcb", (r.x1 + r.x2) / 2, (r.y1 + r.y2) / 2);
          await ctx.canvasClick("pcb", r.x2, r.y2);
          if (ctx.app.pcb.route) await ctx.key("Escape");
          await ctx.key("Escape");
          ctx.expect(ctx.app.store.project.pcb.tracks.length > before, "no track was routed");
          // If the hand-drawn track breaks a rule, take it back — the autorouter will do it.
          const { runDRC } = await import("../pcb/drc.js");
          if (runDRC(ctx.app.store.project).some((i) => i.code === "clearance" || i.code === "short")) await ctx.key("z", { ctrl: true });
          ctx.app.pcb.zoomFit();
        },
      },
      {
        title: T("자동 배선", "Autoroute"),
        text: T("남은 연결은 '모두 자동 배선'이 맡습니다. 두 레이어를 쓰고 필요한 곳에 비아를 넣으며, 간격 규칙을 지킵니다.",
          "Autoroute all handles the remaining connections on both layers, adding vias where needed and keeping clearances."),
        async run(ctx) {
          await ctx.command("pcb.autoroute");
          await ctx.waitFor(() => routingStats(ctx.app.store.project.pcb).unrouted === 0, 20000);
          ctx.expect(routingStats(ctx.app.store.project.pcb).unrouted === 0, "some connections are still unrouted");
        },
      },
      {
        title: T("넷 강조와 트랙 폭", "Net highlight and track width"),
        text: T("트랙을 클릭하면 넷이 강조되고 오른쪽에 폭·레이어·넷과 허용 전류가 보입니다. VBAT 트랙을 0.5 mm로 넓힙니다.",
          "Clicking a track highlights its net; the right panel shows width, layer, net and current capacity. The VBAT tracks are widened to 0.5 mm."),
        async run(ctx) {
          const pcb = ctx.app.store.project.pcb;
          const vbat = pcb.tracks.filter((t) => t.net === "VBAT");
          ctx.expect(vbat.length > 0, "no VBAT tracks");
          const t0 = vbat[0];
          await ctx.view("pcb", { x1: Math.min(t0.x1, t0.x2) - 5, y1: Math.min(t0.y1, t0.y2) - 5, x2: Math.max(t0.x1, t0.x2) + 5, y2: Math.max(t0.y1, t0.y2) + 5 });
          ctx.app.pcb.setActiveLayer(t0.layer);
          await ctx.canvasClick("pcb", (t0.x1 + t0.x2) / 2, (t0.y1 + t0.y2) / 2);
          ctx.app.pcb.select(vbat.map((t) => t.id));
          ctx.app.refreshInspector();
          await ctx.wait(300);
          const input = await ctx.waitFor(() => document.querySelector(".side.right .prop-grid .stepper input.stepper-val"));
          await ctx.type(input, "0.5");
          ctx.expect(ctx.app.store.project.pcb.tracks.filter((t) => t.net === "VBAT").every((t) => t.w === 0.5), "track width not changed");
          await ctx.key("Escape"); await ctx.key("Escape");
          ctx.app.pcb.zoomFit();
        },
      },
      {
        title: T("그라운드 구리 영역", "Ground copper pour"),
        text: T("'기판을 그라운드 영역으로 채우기'가 양면에 GND 구리 영역을 만듭니다. 다른 넷과는 간격을 두고, GND 패드에는 써멀 릴리프로 연결됩니다.",
          "Fill board with ground zone pours GND copper on both sides; it keeps clear of other nets and joins GND pads through thermal reliefs."),
        async run(ctx) {
          await ctx.command("pcb.groundPour");
          await ctx.waitFor(() => ctx.modal());
          await dialogButton(ctx, "Create");
          ctx.expect(ctx.app.store.project.pcb.zones.filter((z) => z.net === "GND").length === 2, "zones not created");
        },
      },
      {
        title: T("스티칭 비아 (V)", "A stitching via (V)"),
        text: T("V로 비아를 놓으면 아래 구리의 넷을 따릅니다. 그라운드 영역 안에 놓은 비아는 윗면·아랫면 GND를 이어 줍니다.",
          "V places a via that takes the net of the copper under it; inside the ground pour it stitches top and bottom GND together."),
        async run(ctx) {
          const pcb = ctx.app.store.project.pcb;
          const { netAtPoint, allPads } = await import("../pcb/board.js");
          // Find a free spot: away from pads and tracks (netAtPoint with a wide
          // tolerance finds any copper within 1.2 mm) and from the board edge.
          let spot = null;
          for (let x = 4; x < 57 && !spot; x += 1.27) {
            for (let y = 4; y < 37 && !spot; y += 1.27) {
              if (netAtPoint(pcb, x, y, null, 1.2)) continue;
              if (allPads(pcb).some((p) => Math.hypot(p.x - x, p.y - y) < 3)) continue;
              spot = [x, y];
            }
          }
          ctx.expect(spot, "no free spot for a via");
          await ctx.view("pcb", { x1: spot[0] - 8, y1: spot[1] - 6, x2: spot[0] + 8, y2: spot[1] + 6 });
          await ctx.key("v");
          await ctx.canvasClick("pcb", spot[0], spot[1]);
          await ctx.key("Escape");
          const via = ctx.app.store.project.pcb.vias[ctx.app.store.project.pcb.vias.length - 1];
          ctx.expect(via, "via not placed");
          const { runDRC } = await import("../pcb/drc.js");
          if (runDRC(ctx.app.store.project).some((i) => i.ids && i.ids.includes(via.id) && i.severity === "error")) await ctx.key("z", { ctrl: true });
          ctx.app.pcb.zoomFit();
        },
      },
      {
        title: T("설계 규칙 검사 (DRC)", "Design rules check (DRC)"),
        text: T("DRC는 간격, 단락, 미배선, 기판 가장자리, 드릴, 실크 위치를 검사합니다. 한 번 실행하면 이후 편집할 때마다 자동으로 다시 검사합니다.",
          "DRC checks clearances, shorts, unrouted nets, board edge, drills and silkscreen. Once run, it re-checks after every edit."),
        async run(ctx) {
          ctx.app.drcRan = false;
          await ctx.command("inspect.drc");
          await ctx.waitFor(() => ctx.app.drcRan, 15000);
          ctx.expect(!ctx.app.drcIssues.some((i) => i.severity === "error"), `DRC errors: ${ctx.app.drcIssues.filter((i) => i.severity === "error").map((i) => i.message).slice(0, 3).join("; ")}`);
        },
      },
    ],
  },
  // 10 ------------------------------------------------------------------
  {
    title: T("PCB: 실크·치수·측정", "PCB: silkscreen, dimensions, measuring"),
    steps: [
      {
        title: T("실크스크린 글자 (T)", "Silkscreen text (T)"),
        text: T("T로 기판 이름과 리비전을 실크스크린에 씁니다.", "T writes the board name and revision on the silkscreen."),
        async run(ctx) {
          await ctx.view("pcb", { x1: -5, y1: -5, x2: 65, y2: 45 }, 0.03);
          const layerSel = document.querySelector("#toolbar select");
          ctx.spot(layerSel);
          layerSel.value = "F.SilkS";
          layerSel.dispatchEvent(new Event("change", { bubbles: true }));
          await ctx.wait(300);
          await ctx.key("t");
          await ctx.canvasClick("pcb", 30, 38.5);
          await ctx.popup("LED-DELAY rev A");
          await ctx.key("Escape");
          ctx.expect(ctx.app.store.project.pcb.texts.some((t) => t.text === "LED-DELAY rev A" && t.layer === "F.SilkS"), "text not on F.SilkS");
          const { runDRC } = await import("../pcb/drc.js");
          if (runDRC(ctx.app.store.project).some((i) => i.code === "silk_over_pad")) {
            const t = ctx.app.store.project.pcb.texts[ctx.app.store.project.pcb.texts.length - 1];
            ctx.app.store.edit("Move", () => { t.y = 42; });
          }
        },
      },
      {
        title: T("치수선 (D)과 측정 (M)", "Dimension (D) and measure (M)"),
        text: T("D로 두 점을 클릭하면 도면에 치수선이 남고, M은 거리만 잠깐 재어 보여 줍니다.",
          "D leaves a dimension line on the drawing; M just measures and shows the distance."),
        async run(ctx) {
          await ctx.key("d");
          await ctx.canvasClick("pcb", 0, -2);
          await ctx.canvasClick("pcb", 60, -2);
          await ctx.key("Escape");
          ctx.expect(ctx.app.store.project.pcb.dimensions.length === 1, "dimension not added");
          await ctx.key("m");
          await ctx.canvasClick("pcb", 0, 0);
          await ctx.canvasClick("pcb", 60, 40);
          await ctx.wait(900);
          await ctx.key("Escape"); await ctx.key("Escape");
        },
      },
      {
        title: T("풋프린트 속성과 길이 보고서", "Footprint properties and length report"),
        text: T("풋프린트를 더블클릭하면 위치·회전·면·잠금을 숫자로 고칠 수 있습니다. 검사 → 넷 길이 보고서는 넷별 배선 길이와 비아 수를 보여 줍니다.",
          "Double-clicking a footprint edits position, rotation, side and lock numerically. Inspect → Net length report lists routed length and vias per net."),
        async run(ctx) {
          const f = ctx.fp(refOf(ctx, "q1"));
          ctx.app.pcb.setActiveLayer("F.Cu");
          await ctx.canvasClick("pcb", f.x, f.y, { dbl: true });
          await ctx.waitFor(() => ctx.modal());
          await ctx.wait(700);
          await dialogButton(ctx, "Cancel");
          await ctx.command("inspect.lengths");
          await ctx.waitFor(() => ctx.modal());
          await ctx.wait(900);
          await dialogButton(ctx, "Close");
        },
      },
    ],
  },
  // 11 ------------------------------------------------------------------
  {
    title: T("3D 보기", "3D view"),
    steps: [
      {
        title: T("3D로 확인 (F4)", "Check it in 3D (F4)"),
        text: T("F4는 실제 크기의 3D 모델을 보여 줍니다. 저항 색띠는 부품 값에 맞게 칠해집니다. 왼쪽 드래그로 회전, 오른쪽 드래그로 이동, 휠로 확대합니다.",
          "F4 shows the board in true-scale 3D — even resistor colour bands follow the values. Left-drag orbits, right-drag pans, the wheel zooms."),
        async run(ctx) {
          await openTab(ctx, "3d");
          await ctx.waitFor(() => ctx.app.v3d.viewer && ctx.app.v3d.viewer.stats().components > 5, 10000);
        },
      },
      {
        title: T("시점 바꾸기", "Change the view"),
        text: T("툴바의 윗면·아랫면·앞면… 버튼(숫자 키 1~7)으로 시점을 바꿉니다.", "The toolbar's top/bottom/front… buttons (keys 1–7) change the viewpoint."),
        async run(ctx) {
          for (const k of ["2", "3", "4", "1"]) { await ctx.key(k); await ctx.wait(700); }
        },
      },
      {
        title: T("부품 숨기기와 X-ray", "Hide components and X-ray"),
        text: T("부품 버튼으로 부품을 숨겨 기판만 보고, X-ray로 기판을 투명하게 만들어 아랫면 배선을 봅니다.",
          "The Components toggle hides parts to show the bare board; X-ray makes the board see-through to reveal the bottom side."),
        async run(ctx) {
          await ctx.key("c"); await ctx.wait(800); await ctx.key("c");
          ctx.app.v3d.setOpt("transparentBoard", true); await ctx.wait(900);
          ctx.app.v3d.setOpt("transparentBoard", false);
          ctx.expect(ctx.app.v3d.opts.components, "components hidden");
        },
      },
      {
        title: T("교차 선택", "Cross-probing"),
        text: T("회로도에서 부품을 고르면 PCB와 3D에서도 같은 부품이 선택·강조됩니다. 3D에서 부품을 클릭하면 반대로 됩니다.",
          "Selecting a part in the schematic selects it on the PCB and highlights it in 3D — and clicking a part in 3D works the other way round."),
        async run(ctx) {
          const ref = refOf(ctx, "q1");
          await ctx.key("1");
          await ctx.wait(600);
          await click3D(ctx, ref);
          ctx.expect(ctx.app.v3d.picked === ref, "3D click did not pick the part");
          ctx.expect(ctx.app.pcb.sel.size === 1 && ctx.app.sch.sel.size === 1, "selection did not follow in the schematic and PCB");
        },
      },
    ],
  },
  // 12 ------------------------------------------------------------------
  {
    title: T("시뮬레이션", "Simulation"),
    steps: [
      {
        title: T("스위치를 닫힌 상태로", "Close the switch"),
        text: T("회로도에서 SW1을 선택하고 속성 패널의 시뮬레이션 항목 '상태'를 '닫힘'으로 바꿉니다.",
          "In the schematic, select SW1 and set its Simulation 'state' to closed in the Properties panel."),
        async run(ctx) {
          await openTab(ctx, "sch");
          const sw = partOf(ctx, "sw");
          await ctx.canvasClick("sch", sw.x, sw.y - 50);
          ctx.app.refreshInspector();
          await ctx.wait(300);
          const sel = await ctx.waitFor(() => [...document.querySelectorAll(".side.right select")].find((s) => [...s.options].some((o) => o.value === "closed")));
          ctx.spot(sel);
          sel.value = "closed";
          sel.dispatchEvent(new Event("change", { bubbles: true }));
          await ctx.wait(400);
          ctx.expect(partOf(ctx, "sw").fields.state === "closed", "switch state not changed");
        },
      },
      {
        title: T("동작점 해석 (F5)", "Operating point (F5)"),
        text: T("동작점 해석은 각 넷의 직류 전압과 부품 전류를 계산합니다. 결과 전압은 회로도 배선 위에도 표시됩니다. LED 전류는 약 15 mA입니다.",
          "The operating point computes every DC node voltage and part current; the voltages are also drawn on the schematic wires. The LED current comes out near 15 mA."),
        async run(ctx) {
          ctx.app.store.project.sim.mode = "op";
          await ctx.key("F5");
          await ctx.waitFor(() => ctx.app.simResult);
          const r = ctx.app.simResult;
          ctx.expect(r.ok, `simulation failed: ${(r.errors || []).join("; ")}`);
          const iLed = Math.abs(r.currents[refOf(ctx, "d1")]);
          ctx.expect(iLed > 0.01 && iLed < 0.02, `LED current ${iLed}`);
          await ctx.wait(1200);
          await openTab(ctx, "sch");
          await ctx.view("sch", MAIN_VIEW, 0.05);
          await ctx.wait(1200);
        },
      },
      {
        title: T("과도 해석과 프로브", "Transient analysis and probes"),
        text: T("과도 해석으로 Test bench 페이지의 펄스(IN)와 RC 출력(OUT)을 시간에 따라 그립니다. 왼쪽에서 프로브를 고르고, 그래프 위에 마우스를 올리면 값이 보입니다.",
          "The transient analysis plots the Test-bench pulse (IN) and the RC output (OUT) over time. Probes are ticked on the left; hovering the plot reads values."),
        async run(ctx) {
          await openTab(ctx, "sim");
          ctx.app.store.edit("Simulation settings", (p) => { p.sim.mode = "tran"; p.sim.tStop = "12m"; p.sim.tStep = "20u"; p.sim.probes = ["IN", "OUT"]; });
          ctx.app.simView.activate();
          const run = await ctx.waitFor(() => [...document.querySelectorAll(".sim-top .btn.primary")][0]);
          await ctx.click(run);
          await ctx.waitFor(() => ctx.app.simResult && ctx.app.simResult.mode === "tran");
          ctx.expect(ctx.app.simResult.ok && ctx.app.simResult.signals["V(OUT)"], "transient failed");
          await ctx.wait(1500);
        },
      },
      {
        title: T("AC 해석(보드 선도)과 DC 스윕", "AC (Bode) and DC sweep"),
        text: T("AC 해석은 RC 필터의 주파수 특성을 그립니다(차단 주파수 ≈ 159 Hz). DC 스윕은 전원 전압을 바꿔 가며 출력을 봅니다.",
          "The AC analysis draws the filter's frequency response (cut-off ≈ 159 Hz); the DC sweep steps a source voltage and plots the result."),
        async run(ctx) {
          const segs = () => [...document.querySelectorAll(".sim-top .seg button")];
          await ctx.click(segs()[2]);
          await ctx.click([...document.querySelectorAll(".sim-top .btn.primary")][0]);
          await ctx.waitFor(() => ctx.app.simResult && ctx.app.simResult.mode === "ac");
          ctx.expect(ctx.app.simResult.ok, "AC failed");
          await ctx.wait(1500);
          await ctx.click(segs()[3]);
          ctx.app.store.edit("Simulation settings", (p) => { p.sim.dcSource = refOf(ctx, "v1"); p.sim.dcStart = "0"; p.sim.dcStop = "5"; p.sim.dcStep = "0.1"; });
          ctx.app.simView.activate();
          await ctx.click([...document.querySelectorAll(".sim-top .btn.primary")][0]);
          await ctx.waitFor(() => ctx.app.simResult && ctx.app.simResult.mode === "dc");
          ctx.expect(ctx.app.simResult.ok, "DC sweep failed");
          await ctx.wait(1200);
        },
      },
      {
        title: T("SPICE 넷리스트", "SPICE netlist"),
        text: T("같은 회로를 ngspice용 SPICE 넷리스트로 볼 수 있고 파일로 내보낼 수도 있습니다.", "The same circuit can be viewed and exported as an ngspice SPICE netlist."),
        async run(ctx) {
          await ctx.command("sim.spice");
          await ctx.waitFor(() => ctx.modal());
          ctx.expect(/\.dc|\.op|\.tran|\.ac/.test(document.querySelector(".modal textarea").value), "netlist empty");
          await ctx.wait(1200);
          await dialogButton(ctx, "Close");
          ctx.app.store.edit("Simulation settings", (p) => { p.sim.mode = "tran"; });
        },
      },
    ],
  },
  // 13 ------------------------------------------------------------------
  {
    title: T("제조 출력과 인쇄", "Manufacturing outputs and printing"),
    steps: [
      {
        title: T("부품표 (BOM)", "Bill of materials (BOM)"),
        text: T("부품표는 같은 값·풋프린트끼리 묶어 수량과 참조 번호를 정리합니다. 줄을 클릭하면 회로도·PCB·3D에서 해당 부품이 선택됩니다. CSV로 저장할 수 있습니다.",
          "The BOM groups identical value/footprint parts with quantities and references. Clicking a line selects those parts everywhere; it saves as CSV."),
        async run(ctx) {
          await ctx.command("tools.bom");
          await ctx.waitFor(() => document.querySelector(".modal table.grid"));
          const rows = document.querySelectorAll(".modal table.grid tr");
          ctx.expect(rows.length > 5, "BOM is empty");
          await ctx.click(rows[2]);
          await ctx.wait(800);
          await dialogButton(ctx, "Close");
        },
      },
      {
        title: T("거버·드릴 패키지", "Gerber and drill package"),
        text: T("제조 출력은 모든 레이어의 거버 X2, 드릴, BOM, 픽앤플레이스, IPC-356, 작업 파일을 ZIP 하나로 만듭니다. 저장하기 전에 거버 뷰어로 미리 봅니다.",
          "Fabrication outputs builds Gerber X2 for every layer, drill files, BOM, pick-and-place, IPC-356 and a job file into one ZIP. Before saving, the Gerber viewer previews them."),
        async run(ctx) {
          await ctx.command("file.fab");
          await ctx.waitFor(() => document.querySelector(".modal table.grid"));
          ctx.expect(+(document.querySelector(".modal [data-count]") || {}).dataset?.count >= 12, "too few files");
          await ctx.wait(900);
          await dialogButton(ctx, "Preview in Gerber viewer");
          await ctx.waitFor(() => document.querySelectorAll(".modal .layer-row").length >= 8, 6000);
          await ctx.wait(1500);
          await dialogButton(ctx, "Close");
        },
      },
      {
        title: T("인쇄 미리보기", "Print preview"),
        text: T("인쇄는 회로도 각 페이지와 PCB 레이어를 미리 보며 용지·방향·흑백·1:1 배율을 고릅니다. 데스크톱에서는 PDF로도 저장합니다.",
          "Print previews every schematic page and the PCB layers with paper, orientation, black-and-white and 1:1 scale; the desktop app also saves PDF."),
        async run(ctx) {
          await ctx.key("p", { ctrl: true });
          await ctx.waitFor(() => document.querySelector(".print-stage .page"));
          const what = document.querySelector(".print-options select");
          what.value = "both"; what.dispatchEvent(new Event("change", { bubbles: true }));
          await ctx.wait(400);
          const next = () => [...document.querySelectorAll(".modal .summary-row .icon-btn")].pop();
          for (let i = 0; i < 3; i++) { await ctx.click(next()); await ctx.wait(500); }
          await dialogButton(ctx, "Cancel");
        },
      },
    ],
  },
  // 14 ------------------------------------------------------------------
  {
    title: T("라이브러리 만들기와 도구", "Making library parts and tools"),
    steps: [
      {
        title: T("심볼 편집기", "Symbol editor"),
        text: T("심볼 편집기는 핀 표(번호·이름·종류·위치)로 IC 심볼을 만듭니다. 텍스트로 한꺼번에 붙여 넣을 수도 있고, 만든 심볼은 프로젝트 파일 안에 저장됩니다.",
          "The symbol editor builds IC symbols from a pin table (number, name, type, side); pins can be pasted as text, and the symbol is stored in the project file."),
        async run(ctx) {
          await ctx.command("tools.symbolEditor");
          await ctx.waitFor(() => ctx.modal());
          const name = document.querySelector(".modal input.input");
          await ctx.type(name, "TEMP_SENSOR");
          const details = document.querySelector(".modal details");
          details.open = true;
          const ta = details.querySelector("textarea");
          await ctx.type(ta, "5, SDA, bidir, right\n6, SCL, input, right");
          await ctx.click([...details.querySelectorAll("button")].pop());
          await ctx.wait(600);
          await dialogButton(ctx, "Save to project");
          await ctx.key("Escape");
          ctx.expect(ctx.app.store.project.library.symbols.some((s) => s.name === "TEMP_SENSOR" && s.pins.length === 6), "symbol not saved");
        },
      },
      {
        title: T("풋프린트 마법사", "Footprint wizard"),
        text: T("풋프린트 마법사는 헤더·DIP·SOIC·QFP·칩 부품을 치수로 만들고, '사용자 패드'로 패드를 직접 편집할 수도 있습니다.",
          "The footprint wizard generates headers, DIP, SOIC, QFP and chip parts from dimensions, and 'Custom pads' edits pads one by one."),
        async run(ctx) {
          await ctx.command("tools.footprintWizard");
          await ctx.waitFor(() => ctx.modal());
          const kind = document.querySelector(".modal select");
          kind.value = "custom"; kind.dispatchEvent(new Event("change", { bubbles: true }));
          await ctx.wait(500);
          const add = [...document.querySelectorAll(".modal .btn.small")].find((b) => b.textContent === ctx.app.t("Add pad"));
          await ctx.click(add);
          await ctx.wait(500);
          await dialogButton(ctx, "Save to project");
          ctx.expect(ctx.app.store.project.library.footprints.some((f) => f.pads.length === 3), "footprint not saved");
        },
      },
      {
        title: T("계산기", "Calculators"),
        text: T("계산기에는 저항 색 코드, LED 저항, 분압기, IPC-2221 트랙 폭, 555/RC, 단위 변환이 있습니다.",
          "The calculators cover resistor colour codes, LED resistors, dividers, IPC-2221 track width, 555/RC timing and unit conversion."),
        async run(ctx) {
          await ctx.command("tools.calculators");
          await ctx.waitFor(() => ctx.modal());
          for (const tab of document.querySelectorAll(".modal .tab")) { await ctx.click(tab); await ctx.wait(450); }
          await dialogButton(ctx, "Close");
        },
      },
      {
        title: T("설정과 단축키", "Settings and shortcuts"),
        text: T("설정에서 언어·테마·그리드·자동 저장·실시간 검사를 정하고, Ctrl+/는 전체 단축키 표를 보여 줍니다.",
          "Settings hold language, theme, grids, autosave and live checks; Ctrl+/ shows every keyboard shortcut."),
        async run(ctx) {
          await ctx.command("tools.settings");
          await ctx.waitFor(() => ctx.modal());
          for (const tab of document.querySelectorAll(".modal .tab")) { await ctx.click(tab); await ctx.wait(400); }
          await dialogButton(ctx, "Cancel");
          await ctx.key("/", { ctrl: true });
          await ctx.waitFor(() => ctx.modal());
          await ctx.wait(1200);
          await dialogButton(ctx, "Close");
        },
      },
      {
        title: T("화면 이동, 그리드, 눈금자", "Moving around: hand, grid and rulers"),
        text: T("오른쪽 위 손 버튼을 켜면 왼쪽 드래그로 화면을 옮깁니다(가운데·오른쪽 드래그나 Space+드래그는 언제나 됩니다). 그리드와 눈금자 버튼으로 격자와 mm/mil 눈금자를 켜고 끕니다. Esc로 손 모드를 끝냅니다.",
          "Turn on the hand button at the top right and a left-drag moves the view (middle or right drag and Space+drag always work). The grid and ruler buttons switch the grid and the mm/mil rulers. Esc leaves hand mode."),
        async run(ctx) {
          await openTab(ctx, "sch");
          await ctx.view("sch", MAIN_VIEW, 0.05);
          await ctx.click('[data-cmd="view.pan"]');
          const ox = ctx.app.sch.vp.ox;
          await ctx.canvasDrag("sch", [2400, 1800], [1900, 1500]);
          ctx.expect(Math.abs(ctx.app.sch.vp.ox - ox) > 20, "view did not move");
          await ctx.key("Escape");
          ctx.expect(!ctx.app.panMode, "hand mode still on");
          // Switch each off and back on, checking the setting follows the button.
          for (const [id, key] of [["view.grid", "showGrid"], ["view.rulers", "showRulers"]]) {
            const start = ctx.app.settings[key] !== false;
            for (const want of [!start, start]) {
              await ctx.click(`[data-cmd="${id}"]`);
              await ctx.waitFor(() => (ctx.app.settings[key] !== false) === want);
              await ctx.wait(350);
            }
          }
          await ctx.view("sch", MAIN_VIEW, 0.05);
        },
      },
      {
        title: T("치수 재기와 치수선", "Measuring and dimensions"),
        text: T("M(재기)으로 두 점을 클릭하면 거리가 mm와 mil로 나옵니다. D(치수)는 두 점을 클릭하고 마우스로 간격을 정해 한 번 더 클릭하면 도면에 치수선이 남습니다. PCB에서는 보드 크기 치수가 자동으로 표시됩니다.",
          "M (measure): click two points to see the distance in mm and mil. D (dimension): click two points, move to set the offset and click again to leave a dimension on the drawing. The PCB shows the board size automatically."),
        async run(ctx) {
          const sch = ctx.app.sch.sch;
          const y = Math.max(...sch.parts.map((p) => p.y)) + 400;
          const x0 = Math.min(...sch.parts.map((p) => p.x));
          await ctx.view("sch", { x1: x0 - 300, y1: y - 900, x2: x0 + 2600, y2: y + 500 }, 0.05);
          await ctx.key("m");
          await ctx.canvasClick("sch", x0, y);
          await ctx.canvasClick("sch", x0 + 1500, y);
          await ctx.wait(900);
          await ctx.key("Escape");
          const n = (sch.dimensions || []).length;
          await ctx.key("d");
          await ctx.canvasClick("sch", x0, y);
          await ctx.canvasClick("sch", x0 + 1500, y);
          await ctx.canvasMove("sch", x0 + 1500, y + 150);
          await ctx.canvasClick("sch", x0 + 1500, y + 150);
          await ctx.key("Escape");
          ctx.expect((ctx.app.sch.sch.dimensions || []).length === n + 1, "dimension not added");
          await openTab(ctx, "pcb");
          ctx.app.pcb.zoomFit();
          await ctx.wait(900);
        },
      },
      {
        title: T("고급 배선: 길이 맞춤, 차동 쌍, 밀어내기", "Advanced routing: length tuning, pairs, push and shove"),
        text: T("배선 → 길이 맞춤…은 고른 넷들에 미앤더를 넣어 길이를 맞춥니다. 배선 → 차동 쌍 배선…은 USB_D+/USB_D- 같은 쌍을 평행하게 배선합니다. 배선 모드(충돌 표시 / 밀어내기 / 장애물에서 멈춤)는 배선 메뉴와 설정에서 고릅니다. 다른 도구의 회로는 파일 → KiCad 프로젝트 가져오기…로 엽니다.",
          "Route → Length tuning… adds meanders so the chosen nets match in length. Route → Route differential pair… lays pairs such as USB_D+/USB_D- as parallel tracks. The routing mode (highlight collisions / push and shove / stop at obstacles) is chosen in the Route menu and in Settings. Designs from KiCad open with File → Import KiCad project…."),
        async run(ctx) {
          await openTab(ctx, "pcb");
          ctx.app.pcb.zoomFit();
          await ctx.command("pcb.tuneLengths");
          await ctx.waitFor(() => ctx.modal());
          const boxes = [...document.querySelectorAll(".modal [data-net]")].slice(0, 2);
          for (const b of boxes) await ctx.click(b);
          await ctx.wait(500);
          await dialogButton(ctx, "Tune");
          await ctx.wait(900);
          for (const id of ["pcb.modeShove", "pcb.modeHighlight"]) { await ctx.command(id); await ctx.wait(300); }
          ctx.expect((ctx.app.settings.routeMode || "highlight") === "highlight", "routing mode not restored");
          await ctx.click('.menu-root[data-menu="File"]');
          await ctx.wait(700);
          document.querySelectorAll(".ctx-menu").forEach((m) => m.remove());
        },
      },
      {
        title: T("3D: 회전, 이동, 그리드와 좌표축", "3D: rotate, pan, grid and axes"),
        text: T("3D에서 왼쪽 드래그는 회전, 오른쪽 드래그는 이동, 휠은 확대입니다. 손 버튼(P)을 켜면 왼쪽 드래그가 이동이 됩니다. 화살표 키로 회전, Shift+화살표로 이동합니다. 바닥 그리드에는 mm 눈금이, 보드 원점에는 X·Y·Z 축이, 왼쪽 아래에는 방향 표시기가 있습니다.",
          "In 3D, left-drag rotates, right-drag pans and the wheel zooms. The hand button (P) makes left-drag pan. Arrow keys rotate, Shift+arrows pan. The floor grid carries mm marks, the board origin shows X/Y/Z axes, and the gizmo at the bottom left shows the orientation."),
        async run(ctx) {
          await openTab(ctx, "3d");
          await ctx.waitFor(() => ctx.app.v3d.viewer);
          const v = ctx.app.v3d.viewer;
          ctx.expect(v.getOptions().grid && v.getOptions().axes, "grid/axes off");
          for (let i = 0; i < 6; i++) { v.orbit(8, 0); await ctx.wait(120); }
          await ctx.click('[data-nav="pan"]');
          ctx.expect(v.three.controls.mouseButtons.LEFT === 2, "pan mode not set");
          for (let i = 0; i < 5; i++) { v.pan(0.02, 0); await ctx.wait(120); }
          await ctx.click('[data-nav="rotate"]');
          await ctx.key("ArrowUp");
          await ctx.wait(400);
          v.setView("iso");
          await ctx.wait(700);
        },
      },
      {
        title: T("완성!", "Done!"),
        text: T("회로도 두 페이지, 배선이 끝난 2층 기판, 3D 모델, 시뮬레이션 결과, 제조 파일까지 만들었습니다. Ctrl+S로 저장하면 .mycircuit 파일 하나에 모두 담깁니다. 예제 프로젝트(파일 → 예제 열기)도 둘러보세요.",
          "You now have a two-page schematic, a routed two-layer board, a 3D model, simulation results and manufacturing files. Ctrl+S saves it all in one .mycircuit file. Have a look at the sample projects too (File → Open sample)."),
        async run(ctx) {
          await openTab(ctx, "3d");
          await ctx.key("1");
          await ctx.wait(1500);
          ctx.expect(ctx.app.store.project.schematic.parts.length >= 14 && routingStats(ctx.app.store.project.pcb).unrouted === 0, "project incomplete");
        },
      },
    ],
  },
];
