// "Practice" mode for the tutorial: for every lesson step, what the user is
// asked to do themselves, where to look (targets), and how the player knows
// the goal was reached (check). PRACTICE[lesson][step] mirrors LESSONS.
//
//   todo    {ko, en}  instruction shown in the panel
//   targets (ctx) => [{ ed: "sch"|"pcb", x, y } | { el: selector }]   blinking markers
//   check   (ctx, mem) => boolean     polled ~3× a second; may bind roles in S
//   after   async (ctx) => {}         tidy-up once done (values the user need not type)
// A null entry is an information step: the user just presses Next.
//
// mem is per step: mem.modals is the set of dialog titles seen while the
// step was active; checks may store their own flags on it.

import { S, pinOf, refOf, partOf, sameNet } from "./tutorial-lessons.js";
import { getSymbol } from "../lib/symbols.js";
import { routingStats } from "../pcb/board.js";
import { pageOf } from "../core/netlist.js";

const T = (ko, en) => ({ ko, en });
const sch = (ctx) => ctx.app.store.project.schematic;
const pcb = (ctx) => ctx.app.store.project.pcb;

function partAt(ctx, lib, x, y, { rot = null, page = null } = {}) {
  const s = sch(ctx);
  const pg = page || ctx.app.sch.pageId;
  return s.parts.find((p) => p.lib === lib && p.x === x && p.y === y && pageOf(s, p) === pg && (rot === null || (p.rot || 0) === rot)) || null;
}

function bind(role, part) {
  if (part) S[role] = part.id;
  return !!part;
}

const el = (sel) => ({ el: sel });
const at = (x, y, ed = "sch") => ({ ed, x, y });
// Dialog titles may carry placeholders ("Part properties — {ref}"): match the translated prefix.
const titlePrefix = (ctx, label) => ctx.app.t(label).split("{")[0].replace(/[\s—-]+$/, "");
const sawModal = (ctx, mem, label) => [...mem.modals].some((m) => m.includes(titlePrefix(ctx, label))) && !document.querySelector(".modal");
const libRow = (name) => () => [...document.querySelectorAll(".lib-item")].find((r) => r.querySelector(".nm").textContent === name) || ".side.left .search input";

async function setValue(ctx, role, value) {
  const p = sch(ctx).parts.find((x) => x.id === S[role]);
  if (p && p.value !== value) ctx.app.store.edit("Edit value", () => { p.value = value; });
}

export const PRACTICE = [
  // 1 Getting started
  [
    {
      todo: T("툴바 맨 왼쪽의 '새 프로젝트' 버튼을 누르세요.", "Press the New project button at the left end of the toolbar."),
      targets: () => [el("#toolbar .icon-btn")],
      check: (ctx, mem) => {
        if (!mem.start) mem.start = ctx.app.store.project;
        return ctx.app.store.project !== mem.start && sch(ctx).parts.length === 0;
      },
      after: async (ctx) => {
        for (const k of Object.keys(S)) delete S[k];
        ctx.app.store.edit("Project properties", (p) => { p.meta.title = ctx.L(T("LED 지연 스위치", "LED switch with delay")); p.meta.author = "MyCircuit Tutorial"; p.meta.rev = "A"; });
      },
    },
    null,
    {
      todo: T("Ctrl+K를 눌러 명령 팔레트를 열고, 아무 단어나 입력해 본 뒤 Esc로 닫으세요.", "Press Ctrl+K to open the command palette, type any word, then close it with Esc."),
      targets: () => [el(".palette-btn")],
      check: (ctx, mem) => { if (document.querySelector(".quickpick")) mem.opened = true; return mem.opened && !document.querySelector(".quickpick"); },
    },
    {
      todo: T("오른쪽 위 팔레트 옆 ▾ 버튼을 눌러 목록에서 라이트 테마 하나를 골라 보세요. 팔레트 버튼을 눌러 무작위 테마가 라이트로 나와도 됩니다. 원래 테마로 돌아가도 됩니다.", "Click the ▾ next to the palette at the top right and pick any light theme from the list (a random theme from the palette button counts too, if it lands on a light one). Switching back afterwards is fine."),
      targets: () => [el("#title-right .icon-btn.caret")],
      check: (ctx, mem) => { if (document.documentElement.dataset.theme === "light") mem.light = true; return !!mem.light; },
    },
  ],
  // 2 Placing parts
  [
    {
      todo: T("왼쪽 라이브러리 검색창에 battery를 입력하고 BATTERY를 클릭한 뒤, 깜박이는 표시 위를 클릭해 놓으세요.", "Type battery in the library search, click BATTERY, then click on the blinking marker to place it."),
      targets: () => [el(".side.left .search input"), at(1500, 2500)],
      check: (ctx) => bind("bt", partAt(ctx, "BATTERY", 1500, 2500)),
      after: (ctx) => setValue(ctx, "bt", "9V"),
    },
    {
      todo: T("SW_PUSH를 첫 번째 표시에 놓고, R은 놓기 전에 R 키로 한 번 돌려(가로) 두 번째 표시에 놓으세요.", "Place SW_PUSH on the first marker; for R press the R key once before placing (horizontal) and put it on the second marker."),
      targets: () => [at(2300, 2000), at(3000, 2000)],
      check: (ctx) => bind("sw", partAt(ctx, "SW_PUSH", 2300, 2000)) && bind("r1", partAt(ctx, "R", 3000, 2000, { rot: 90 })),
      after: (ctx) => setValue(ctx, "r1", "10k"),
    },
    {
      todo: T("Q_NPN, LED, R(세로), C_POL을 표시된 네 곳에 차례로 놓으세요.", "Place Q_NPN, LED, R (vertical) and C_POL on the four markers."),
      targets: () => [at(3700, 2000), at(3800, 1400), at(3800, 800), at(3400, 2500)],
      check: (ctx) => bind("q1", partAt(ctx, "Q_NPN", 3700, 2000)) && bind("d1", partAt(ctx, "LED", 3800, 1400)) && bind("r2", partAt(ctx, "R", 3800, 800, { rot: 0 })) && bind("c1", partAt(ctx, "C_POL", 3400, 2500)),
      after: async (ctx) => { await setValue(ctx, "r2", "470"); await setValue(ctx, "c1", "100u"); },
    },
    {
      todo: T("P 키로 전원 심볼을 고르세요. VBAT는 배터리 + 핀과 R2 위쪽 핀에, GND는 아래쪽 세 표시에 놓습니다(놓은 뒤 Esc).", "Press P to pick power symbols: VBAT on the battery + pin and the top of R2, GND on the three lower markers (Esc when done)."),
      targets: (ctx) => [at(...pinOf(ctx, "bt", "1")), at(...pinOf(ctx, "r2", "1")), at(1500, 2900), at(3800, 2400), at(3400, 2900)],
      check: (ctx) => {
        const [bx, by] = pinOf(ctx, "bt", "1");
        const [rx, ry] = pinOf(ctx, "r2", "1");
        return !!partAt(ctx, "VBAT", bx, by) && !!partAt(ctx, "VBAT", rx, ry) && [[1500, 2900], [3800, 2400], [3400, 2900]].every(([x, y]) => partAt(ctx, "GND", x, y));
      },
    },
  ],
  // 3 Wires and labels
  [
    {
      todo: T("W를 누르고 표시된 핀 끝끼리 이으세요: 배터리+ → 스위치, 스위치 → R1, R1 → 트랜지스터 베이스.", "Press W and connect the marked pin ends: battery + → switch, switch → R1, R1 → transistor base."),
      targets: (ctx) => [at(...pinOf(ctx, "bt", "1")), at(...pinOf(ctx, "sw", "1")), at(...pinOf(ctx, "sw", "2")), at(...pinOf(ctx, "r1", "1")), at(...pinOf(ctx, "r1", "2")), at(...pinOf(ctx, "q1", "2"))],
      check: (ctx) => sameNet(ctx, "bt", "1", "sw", "1") && sameNet(ctx, "sw", "2", "r1", "1") && sameNet(ctx, "r1", "2", "q1", "2"),
    },
    {
      todo: T("R2 → LED 애노드, LED 캐소드 → 컬렉터를 잇고, 이미터·C1·배터리(−)를 각각 아래 GND에 이으세요.", "Wire R2 → LED anode and LED cathode → collector, then emitter, C1 and battery (−) down to their GND symbols."),
      targets: (ctx) => [at(...pinOf(ctx, "r2", "2")), at(...pinOf(ctx, "d1", "2")), at(...pinOf(ctx, "d1", "1")), at(...pinOf(ctx, "q1", "3")), at(...pinOf(ctx, "q1", "1")), at(...pinOf(ctx, "c1", "2")), at(...pinOf(ctx, "bt", "2"))],
      check: (ctx) => sameNet(ctx, "r2", "2", "d1", "2") && sameNet(ctx, "d1", "1", "q1", "3") && sameNet(ctx, "q1", "1", "bt", "2") && sameNet(ctx, "c1", "2", "bt", "2"),
    },
    {
      todo: T("C1 위쪽 핀에서 시작해 베이스 배선의 중간을 클릭하세요. T자 연결과 정션 점이 생깁니다.", "Start at C1's top pin and click the middle of the base wire: a T joint with a junction dot appears."),
      targets: (ctx) => { const [x, y] = pinOf(ctx, "c1", "1"); return [at(x, y), at(x, 2000)]; },
      check: (ctx) => sameNet(ctx, "c1", "1", "q1", "2"),
    },
    {
      todo: T("L을 누르고 베이스 배선을 클릭한 뒤 BASE라고 입력하고 Enter를 누르세요.", "Press L, click the base wire, type BASE and press Enter."),
      targets: () => [at(3300, 2000)],
      check: (ctx) => ctx.app.sch.netlist().pinNet.get(`${S.q1}:2`) === "BASE",
    },
    {
      todo: T("T를 누르고 시트 왼쪽 위를 클릭해 아무 설명이나 적으세요.", "Press T, click near the top left of the sheet and write any note."),
      targets: () => [at(1200, 600)],
      check: (ctx) => sch(ctx).texts.length >= 1,
    },
  ],
  // 4 Editing
  [
    {
      todo: T("R2를 마우스로 끌어 옆으로 옮겨 보세요(배선이 따라옵니다). 그 다음 Ctrl+Z로 되돌리세요.", "Drag R2 sideways with the mouse (its wires follow), then press Ctrl+Z to undo."),
      targets: (ctx) => { const p = partOf(ctx, "r2"); return [at(p.x, p.y)]; },
      check: (ctx, mem) => {
        const p = sch(ctx).parts.find((x) => x.id === S.r2);
        if (!p) return false;
        if (mem.x0 === undefined) mem.x0 = p.x;
        if (p.x !== mem.x0) mem.moved = true;
        return mem.moved && p.x === mem.x0;
      },
    },
    {
      todo: T("오른쪽 빈 곳에 NE555를 놓고 선택한 채 R(회전), Y(대칭)를 눌러 본 뒤 Ctrl+D로 복제하세요.", "Place an NE555 on free space to the right, press R (rotate) and Y (mirror) with it selected, then Ctrl+D to duplicate."),
      targets: () => [at(5600, 1500)],
      check: (ctx, mem) => {
        const u = sch(ctx).parts.filter((p) => p.lib === "NE555");
        if (u.some((p) => p.rot || p.mirror)) mem.turned = true;
        if (u[0]) S.demo = u[0].id;
        return u.length >= 2 && !!mem.turned;
      },
    },
    {
      todo: T("Q를 누르고 NE555의 사용하지 않는 핀 끝을 클릭해 '연결 없음' 표시를 하세요. B로 버스 선도 하나 그려 보세요(더블클릭으로 끝).", "Press Q and click an unused NE555 pin end to flag it as no-connect. Draw a bus line with B too (double-click to finish)."),
      targets: () => [],
      check: (ctx) => sch(ctx).noconnects.length >= 1 && sch(ctx).buses.length >= 1,
    },
    {
      todo: T("연습용 항목 전체를 마우스로 끌어 상자로 감싸 선택하고 Del로 지우세요.", "Drag a box around all the practice items to select them, then press Del."),
      targets: () => [],
      check: (ctx) => !sch(ctx).parts.some((p) => p.lib === "NE555") && !sch(ctx).buses.length && !sch(ctx).noconnects.length,
    },
    {
      todo: T("Q1을 더블클릭해 속성 대화상자를 열어 보고, 취소로 닫으세요.", "Double-click Q1 to open its properties, then close them with Cancel."),
      targets: (ctx) => { const q = partOf(ctx, "q1"); return [at(q.x + 20, q.y)]; },
      check: (ctx, mem) => sawModal(ctx, mem, "Part properties — {ref}"),
    },
  ],
  // 5 Multi-page
  [
    {
      todo: T("캔버스 왼쪽 아래 '+' 탭으로 페이지를 추가하고, 새 탭을 더블클릭해 이름을 Test bench로 바꾸세요.", "Add a page with the '+' tab at the bottom left, then double-click the new tab and rename it Test bench."),
      targets: () => [el(".page-tab.add")],
      check: (ctx) => sch(ctx).pages.length >= 2 && sch(ctx).pages[1].name === "Test bench" && ctx.app.sch.pageId === sch(ctx).pages[1].id,
    },
    {
      todo: T("새 페이지에 VSOURCE, R(가로), C를 표시에 놓고 GND 두 개를 놓은 뒤, 전압원 → R → C, 전압원(−)과 C(−) → GND를 이으세요.", "On the new page place VSOURCE, R (horizontal) and C on the markers, two GNDs, then wire source → R → C and source (−) and C (−) to GND."),
      targets: () => [at(1500, 1500), at(2200, 1300), at(2700, 1500), at(1500, 1900), at(2700, 1900)],
      check: (ctx) => {
        const ok = bind("v1", partAt(ctx, "VSOURCE", 1500, 1500)) && bind("r4", partAt(ctx, "R", 2200, 1300, { rot: 90 })) && bind("c2", partAt(ctx, "C", 2700, 1500));
        return ok && sameNet(ctx, "v1", "1", "r4", "1") && sameNet(ctx, "r4", "2", "c2", "1") && sameNet(ctx, "v1", "2", "c2", "2");
      },
      after: async (ctx) => {
        const v = sch(ctx).parts.find((p) => p.id === S.v1);
        ctx.app.store.edit("Edit part", () => { v.value = "0"; v.fields = { ...(v.fields || {}), wave: "pulse", amplitude: "5", offset: "0", period: "4m", duty: "50" }; });
        await setValue(ctx, "r4", "1k");
        await setValue(ctx, "c2", "1u");
      },
    },
    {
      todo: T("Ctrl+L로 전압원 쪽 배선에 IN, 필터 출력 배선에 OUT 글로벌 레이블을 다세요. 그 다음 첫 페이지 탭을 눌러 돌아가세요.", "With Ctrl+L put global labels IN on the source wire and OUT on the filter output wire, then click the first page tab to go back."),
      targets: () => [at(1700, 1300), at(2550, 1300)],
      check: (ctx) => {
        const nl = ctx.app.sch.netlist();
        return nl.pinNet.get(`${S.c2}:1`) === "OUT" && nl.pinNet.get(`${S.v1}:1`) === "IN" && ctx.app.sch.pageId === sch(ctx).pages[0].id;
      },
    },
  ],
  // 6 Annotation and ERC
  [
    {
      todo: T("툴바의 '참조 번호 부여' 버튼(1 2 모양)을 누르세요.", "Press the Annotate button (the '1 2' icon) on the toolbar."),
      targets: (ctx) => [el(() => [...document.querySelectorAll("#toolbar .icon-btn")].find((b) => b.title.startsWith(ctx.app.t("Annotate schematic"))))],
      check: (ctx) => !sch(ctx).parts.some((p) => { const s = getSymbol(p.lib); return s && !s.power && /\?$/.test(p.ref); }),
    },
    {
      todo: T("LED와 트랜지스터 사이 배선을 클릭하고 Del로 지워 보세요. 오른쪽 ERC 목록에 문제가 뜨면 그 줄을 클릭하세요.", "Click the wire between the LED and the transistor and delete it. When ERC lists the problem on the right, click that line."),
      targets: (ctx) => { const [x, y] = pinOf(ctx, "d1", "1"); return [at(x, y + 100)]; },
      check: (ctx) => ctx.app.ercIssues.some((i) => i.code === "unconnected-pin"),
    },
    {
      todo: T("Ctrl+Z로 지운 배선을 되살리세요. ERC 오류가 사라집니다.", "Press Ctrl+Z to bring the wire back; the ERC errors disappear."),
      targets: () => [],
      check: (ctx) => sameNet(ctx, "d1", "1", "q1", "3") && !ctx.app.ercIssues.some((i) => i.severity === "error"),
    },
    {
      todo: T("배선 하나를 클릭해 넷 강조를 보고, Ctrl+F로 BASE를 찾아 Enter를 누르세요.", "Click a wire to see its net highlighted, then press Ctrl+F, look for BASE and press Enter."),
      targets: () => [at(2650, 2000)],
      check: (ctx) => ctx.app.highlightNet === "BASE" || (ctx.app.sch.flash && performance.now() < ctx.app.sch.flash.until),
    },
  ],
  // 7 Footprints
  [
    {
      todo: T("도구 → 풋프린트 지정을 열어 R1·R2는 R_Axial_P10.16mm, D1은 LED_D5.0mm로 고르고 적용하세요.", "Open Tools → Assign footprints, choose R_Axial_P10.16mm for R1 and R2 and LED_D5.0mm for D1, then Apply."),
      targets: () => [el('.menu-root[data-menu="Tools"]')],
      check: (ctx) => partOf(ctx, "r2").footprint === "R_Axial_P10.16mm" && partOf(ctx, "r1").footprint === "R_Axial_P10.16mm" && partOf(ctx, "d1").footprint === "LED_D5.0mm",
    },
    {
      todo: T("F8을 눌러 PCB로 보내세요.", "Press F8 to send everything to the PCB."),
      targets: () => [],
      check: (ctx) => ctx.app.tab === "pcb" && pcb(ctx).footprints.length >= 9,
    },
  ],
  // 8 Board and placement
  [
    {
      todo: T("O를 누르고 표시된 두 모서리 사이를 끌어 60×40 mm 외곽선을 그리세요.", "Press O and drag between the two marked corners to draw a 60 × 40 mm outline."),
      targets: () => [at(0, 0, "pcb"), at(60, 40, "pcb")],
      check: (ctx) => {
        const o = pcb(ctx).outline;
        const xs = o.map((p) => p[0]);
        const ys = o.map((p) => p[1]);
        return Math.abs(Math.max(...xs) - Math.min(...xs) - 60) < 1.3 && Math.abs(Math.max(...ys) - Math.min(...ys) - 40) < 1.3;
      },
    },
    {
      todo: T("배선 메뉴 → '풋프린트 기판에 배치'를 누르세요.", "Choose Route → Arrange footprints on board."),
      targets: () => [el('.menu-root[data-menu="Route"]')],
      check: (ctx) => pcb(ctx).footprints.every((f) => f.x > 0 && f.x < 60 && f.y > 0 && f.y < 40),
    },
    {
      todo: T("스위치(SW1)를 클릭하고 R로 회전, F로 아랫면으로 뒤집기, 다시 F, L로 잠갔다가 다시 L로 풀어 보세요.", "Click the switch (SW1), rotate it with R, flip it with F and back with F, lock with L and unlock with L again."),
      targets: (ctx) => { const f = ctx.fp(refOf(ctx, "sw")); return [at(f.x, f.y, "pcb")]; },
      check: (ctx, mem) => {
        const f = ctx.fp(refOf(ctx, "sw"));
        if (f.side === "B") mem.flipped = true;
        if (f.locked) mem.locked = true;
        if (mem.r0 === undefined) mem.r0 = f.rot;
        if (f.rot !== mem.r0) mem.rotated = true;
        return mem.flipped && mem.locked && mem.rotated && f.side === "F" && !f.locked;
      },
    },
    {
      todo: T("PgDn으로 활성 레이어를 B.Cu로 바꾸고, H로 고대비를 켜 보세요.", "Press PgDn to make B.Cu active, then H to turn on high contrast."),
      targets: () => [el("#toolbar select")],
      check: (ctx, mem) => { if (ctx.app.pcb.activeLayer === "B.Cu") mem.b = true; if (ctx.app.pcb.highContrast) mem.h = true; return mem.b && mem.h; },
      after: async (ctx) => { ctx.app.pcb.highContrast = false; ctx.app.pcb.setActiveLayer("F.Cu"); },
    },
    {
      todo: T("툴바의 기판 설정(톱니바퀴)을 열어 솔더 마스크를 파랑, 표면 처리를 ENIG로 바꾸고 적용하세요.", "Open Board setup (gear) on the toolbar, set the solder mask to blue and the finish to ENIG, then Apply."),
      targets: (ctx) => [el(() => [...document.querySelectorAll("#toolbar .icon-btn")].find((b) => b.title.startsWith(ctx.app.t("Board setup…"))))],
      check: (ctx) => pcb(ctx).maskColor === "blue" && pcb(ctx).finish === "ENIG",
    },
  ],
  // 9 Routing
  [
    {
      todo: T("X를 누르고 래츠네스트(가는 선)로 이어진 두 패드를 차례로 클릭해 트랙을 그리세요.", "Press X and click two pads joined by an airwire to route a track between them."),
      targets: () => [],
      check: (ctx) => pcb(ctx).tracks.length > 0,
    },
    {
      todo: T("툴바의 '모두 자동 배선'을 누르세요.", "Press Autoroute all on the toolbar."),
      targets: (ctx) => [el(() => [...document.querySelectorAll("#toolbar .icon-btn")].find((b) => b.title.startsWith(ctx.app.t("Autoroute all"))))],
      check: (ctx) => routingStats(pcb(ctx)).unrouted === 0,
    },
    {
      todo: T("VBAT 트랙 하나를 클릭하고 오른쪽 속성 패널에서 폭을 0.5로 바꾸세요.", "Click one VBAT track and change its width to 0.5 in the Properties panel."),
      targets: () => [el("#right-panel")],
      check: (ctx) => pcb(ctx).tracks.some((t) => t.net === "VBAT" && t.w === 0.5),
      after: async (ctx) => { ctx.app.store.edit("Track width", (p) => { for (const t of p.pcb.tracks) if (t.net === "VBAT") t.w = 0.5; }); },
    },
    {
      todo: T("툴바의 '기판을 그라운드 영역으로 채우기'(점선 사각형)를 누르고 만들기를 누르세요.", "Press Fill board with ground zone (dashed square) on the toolbar, then Create."),
      targets: (ctx) => [el(() => [...document.querySelectorAll("#toolbar .icon-btn")].find((b) => b.title.startsWith(ctx.app.t("Fill board with ground zone"))))],
      check: (ctx) => pcb(ctx).zones.filter((z) => z.net === "GND").length >= 2,
    },
    {
      todo: T("V를 누르고 그라운드 영역 안의 빈 곳(패드와 트랙에서 떨어진 곳)을 클릭해 비아를 놓으세요.", "Press V and click an empty spot inside the ground pour (away from pads and tracks) to place a via."),
      targets: () => [],
      check: (ctx) => pcb(ctx).vias.some((v) => v.net === "GND"),
    },
    {
      todo: T("툴바의 DRC 버튼(방패)을 누르세요. 오류가 있으면 목록을 클릭해 위치를 확인하고 고치세요.", "Press the DRC button (shield). If errors appear, click them to see where they are and fix them."),
      targets: (ctx) => [el(() => [...document.querySelectorAll("#toolbar .icon-btn")].find((b) => b.title.startsWith(ctx.app.t("Design rules check (DRC)"))))],
      check: (ctx) => ctx.app.drcRan && !ctx.app.drcIssues.some((i) => i.severity === "error"),
    },
  ],
  // 10 Silkscreen, dimensions
  [
    {
      todo: T("툴바 레이어 목록에서 F.SilkS를 고르고, T를 눌러 기판 아래쪽 빈 곳에 기판 이름을 쓰세요.", "Pick F.SilkS in the toolbar layer list, press T and write the board name on free space near the bottom."),
      targets: () => [el("#toolbar select"), at(30, 38.5, "pcb")],
      check: (ctx) => pcb(ctx).texts.some((t) => t.layer === "F.SilkS"),
    },
    {
      todo: T("D를 누르고 기판 위쪽 두 모서리를 클릭해 치수선을 넣으세요. M으로 아무 두 점의 거리도 재 보세요.", "Press D and click the two top corners of the board to add a dimension. Use M to measure any two points too."),
      targets: () => [at(0, -2, "pcb"), at(60, -2, "pcb")],
      check: (ctx) => pcb(ctx).dimensions.length >= 1,
    },
    {
      todo: T("Q1 풋프린트를 더블클릭해 속성을 보고 닫은 뒤, 검사 → 넷 길이 보고서를 열어 보세요.", "Double-click the Q1 footprint to view its properties and close them, then open Inspect → Net length report."),
      targets: (ctx) => { const f = ctx.fp(refOf(ctx, "q1")); return [at(f.x, f.y, "pcb")]; },
      check: (ctx, mem) => sawModal(ctx, mem, "Footprint properties — {ref}") && sawModal(ctx, mem, "Net length report"),
    },
  ],
  // 11 3D
  [
    {
      todo: T("F4를 눌러 3D 보기를 여세요.", "Press F4 to open the 3D view."),
      targets: () => [el("#tabbar")],
      check: (ctx) => ctx.app.tab === "3d" && ctx.app.v3d.viewer && ctx.app.v3d.viewer.stats().components > 5,
    },
    {
      todo: T("툴바의 윗면·아랫면·등각 버튼(또는 숫자 키 1~3)을 눌러 시점을 바꾸고, 마우스로 돌려 보세요. 다 보면 다음을 누르세요.", "Use the Top/Bottom/Isometric buttons (or keys 1–3) and orbit with the mouse. Press Next when you are done."),
      targets: () => [el("#toolbar")],
      check: null,
    },
    {
      todo: T("부품 버튼으로 부품을 숨겼다가 다시 켜고, X-ray(눈 모양) 버튼도 눌러 보세요.", "Hide the components with the Components button and show them again, and try the X-ray (eye) button."),
      targets: () => [el("#toolbar")],
      check: (ctx, mem) => { const o = ctx.app.v3d.opts; if (!o.components) mem.hidden = true; if (o.transparentBoard) mem.xray = true; return mem.hidden && mem.xray && o.components; },
      after: async (ctx) => ctx.app.v3d.setOpt("transparentBoard", false),
    },
    {
      todo: T("3D 화면에서 부품 하나를 클릭해 보세요. 회로도와 PCB에서도 같은 부품이 선택됩니다.", "Click a component in the 3D view — the same part is selected in the schematic and on the PCB."),
      targets: () => [],
      check: (ctx) => !!ctx.app.v3d.picked,
    },
  ],
  // 12 Simulation
  [
    {
      todo: T("회로도에서 SW1을 클릭하고, 오른쪽 '시뮬레이션' 항목의 상태를 '닫힘'으로 바꾸세요.", "In the schematic, click SW1 and set its Simulation state to closed on the right."),
      targets: (ctx) => { const sw = partOf(ctx, "sw"); return [at(sw.x, sw.y - 50)]; },
      check: (ctx) => partOf(ctx, "sw").fields.state === "closed",
    },
    {
      todo: T("F5를 눌러 동작점 해석을 실행하고, 회로도 탭(F2)에서 배선 위 전압을 확인하세요.", "Press F5 to run the operating point, then check the voltages on the wires in the schematic tab (F2)."),
      targets: () => [],
      check: (ctx) => ctx.app.simResult && ctx.app.simResult.ok && ctx.app.simResult.mode === "op" && ctx.app.tab === "sch",
    },
    {
      todo: T("시뮬레이션 탭에서 '과도 해석'을 고르고 왼쪽에서 IN과 OUT을 체크한 뒤 실행하세요.", "In the Simulation tab choose Transient, tick IN and OUT on the left and press Run."),
      targets: () => [el(".sim-top")],
      check: (ctx) => ctx.app.simResult && ctx.app.simResult.ok && ctx.app.simResult.mode === "tran" && ctx.app.simResult.signals["V(OUT)"],
    },
    {
      todo: T("'AC (보드 선도)'를 실행하고, 이어서 'DC 스윕'도 실행해 보세요.", "Run AC (Bode), then the DC sweep."),
      targets: () => [el(".sim-top .seg")],
      check: (ctx, mem) => { const r = ctx.app.simResult; if (r && r.ok && r.mode === "ac") mem.ac = true; if (r && r.ok && r.mode === "dc") mem.dc = true; return mem.ac && mem.dc; },
    },
    {
      todo: T("툴바의 'SPICE 넷리스트 보기'를 눌러 내용을 보고 닫으세요.", "Press Show SPICE netlist on the toolbar, look at it and close it."),
      targets: () => [el("#toolbar")],
      check: (ctx, mem) => sawModal(ctx, mem, "SPICE netlist"),
    },
  ],
  // 13 Outputs
  [
    {
      todo: T("도구 → 부품표를 열어 줄 하나를 클릭해 보고 닫으세요.", "Open Tools → Bill of materials, click a line and close it."),
      targets: () => [el('.menu-root[data-menu="Tools"]')],
      check: (ctx, mem) => sawModal(ctx, mem, "Bill of materials"),
    },
    {
      todo: T("파일 → 제조 출력을 열고 '거버 뷰어로 미리 보기'를 눌러 레이어를 확인한 뒤 닫으세요.", "Open File → Fabrication outputs, press Preview in Gerber viewer, look at the layers and close it."),
      targets: () => [el('.menu-root[data-menu="File"]')],
      check: (ctx, mem) => sawModal(ctx, mem, "Gerber viewer"),
    },
    {
      todo: T("Ctrl+P로 인쇄 창을 열고 '회로도와 PCB'를 골라 페이지를 넘겨 본 뒤 취소하세요.", "Press Ctrl+P, choose Schematic and PCB, page through the preview and cancel."),
      targets: () => [],
      check: (ctx, mem) => sawModal(ctx, mem, "Print"),
    },
  ],
  // 14 Library and tools
  [
    {
      todo: T("도구 → 심볼 편집기에서 핀을 몇 개 추가하고 '프로젝트에 저장'을 누르세요.", "In Tools → Symbol editor, add a few pins and press Save to project."),
      targets: () => [el('.menu-root[data-menu="Tools"]')],
      check: (ctx, mem) => { if (mem.n0 === undefined) mem.n0 = ctx.app.store.project.library.symbols.length; return ctx.app.store.project.library.symbols.length > mem.n0; },
    },
    {
      todo: T("도구 → 풋프린트 마법사에서 패키지를 고르고 '프로젝트에 저장'을 누르세요.", "In Tools → Footprint wizard, pick a package and press Save to project."),
      targets: () => [el('.menu-root[data-menu="Tools"]')],
      check: (ctx, mem) => { if (mem.n0 === undefined) mem.n0 = ctx.app.store.project.library.footprints.length; return ctx.app.store.project.library.footprints.length > mem.n0; },
    },
    {
      todo: T("도구 → 계산기를 열어 탭을 몇 개 둘러보고 닫으세요.", "Open Tools → Calculators, look through a few tabs and close it."),
      targets: () => [el('.menu-root[data-menu="Tools"]')],
      check: (ctx, mem) => sawModal(ctx, mem, "Calculators"),
    },
    {
      todo: T("설정 창(Ctrl+,)을 열어 보고 닫은 뒤, Ctrl+/로 단축키 표를 열었다 닫으세요.", "Open Settings (Ctrl+,) and close it, then open and close the shortcut list with Ctrl+/."),
      targets: () => [el("#title-right")],
      check: (ctx, mem) => sawModal(ctx, mem, "Settings") && sawModal(ctx, mem, "Keyboard shortcuts"),
    },
    {
      todo: T("회로도에서 손 버튼을 켜고 왼쪽 드래그로 화면을 옮긴 뒤 Esc로 끄세요.", "In the schematic, turn on the hand button, move the view with a left-drag, then press Esc."),
      targets: () => [el('[data-cmd="view.pan"]')],
      check: (ctx, mem) => {
        const vp = ctx.app.sch.vp;
        if (ctx.app.panMode) { if (mem.ox === undefined) mem.ox = vp.ox; if (Math.abs(vp.ox - mem.ox) > 20 || Math.abs(vp.oy - (mem.oy ??= vp.oy)) > 20) mem.moved = true; }
        return !!mem.moved && !ctx.app.panMode;
      },
    },
    {
      todo: T("D 키로 치수 도구를 골라 두 점을 클릭하고, 간격을 정해 한 번 더 클릭해 치수선을 하나 추가하세요.", "Press D for the dimension tool, click two points, then click once more to set the offset and add a dimension."),
      targets: () => [el('[data-cmd="sch.dimension"]')],
      check: (ctx, mem) => { const n = (ctx.app.store.project.schematic.dimensions || []).length; if (mem.n === undefined) mem.n = n; return n > mem.n; },
    },
    {
      todo: T("PCB에서 배선 → 길이 맞춤…을 열어 넷 두 개를 체크하고 맞추기를 누르세요.", "In the PCB, open Route → Length tuning…, tick two nets and press Tune."),
      targets: () => [el('.menu-root[data-menu="Route"]')],
      check: (ctx, mem) => sawModal(ctx, mem, "Length tuning"),
    },
    {
      todo: T("3D 화면에서 왼쪽 드래그로 회전하고, 손 버튼을 켜고 드래그해 이동해 보세요.", "In the 3D view, rotate with a left-drag, then turn on the hand button and drag to pan."),
      targets: () => [el('[data-nav="pan"]')],
      check: (ctx, mem) => {
        const v = ctx.app.v3d.viewer;
        if (!v) return false;
        const { camera, controls } = v.three;
        const cam = camera.position.clone().sub(controls.target).normalize();
        if (!mem.dir) { mem.dir = cam.clone(); mem.target = controls.target.clone(); }
        if (cam.distanceTo(mem.dir) > 0.1) mem.rotated = true;
        if (v.getOptions().navMode === "pan") mem.sawPan = true;
        if (mem.sawPan && controls.target.distanceTo(mem.target) > 0.5) mem.panned = true;
        return !!(mem.rotated && mem.panned);
      },
    },
    null,
  ],
];
