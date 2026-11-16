// Tutorial lessons. Every step explains a feature in Korean and English,
// performs it on the real program (`run`, used by Watch mode and the tests)
// and describes what the user should do in Practice mode (`practice`: a todo
// text, a goal `check` and canvas / UI `targets` to mark).
//
// Lessons 2–14 build one small house step by step; lessons marked `fresh`
// start from a new project or a sample, so they can be played on their own.
// Lesson 20 designs a whole three-storey building from an empty sheet;
// lesson 21 a more complex one around an atrium with a wing at 45°.

const T = (ko, en) => ({ ko, en });

// Confirm "Don't save" when a command asks about unsaved changes.
async function discard(ctx) {
  await ctx.wait(150);
  const btn = [...document.querySelectorAll(".modal-foot .btn")].find((b) => b.classList.contains("danger"));
  if (btn && document.querySelector(".modal-title")) await ctx.click(btn);
}

// Back to the Select tool (Esc ends a drawing but keeps its tool).
async function toSelect(ctx) {
  if (ctx.app.plan.tool !== "select") await ctx.command("plan.select");
}

async function closeAll(ctx) {
  for (let i = 0; i < 3; i++) {
    const x = document.querySelector(".modal-head .icon-btn");
    if (!x) break;
    await ctx.click(x);
  }
  document.querySelectorAll(".qp-backdrop, .ctx-menu, .theme-drop").forEach((e) => e.remove());
}

const walls = (ctx) => ctx.on("walls");
let undoButtonsStart = 0; // store revision when the undo/redo button practice starts
let bridgeParamsStart = ""; // the bridge's parameters when "Change the bridge" practice starts
const wallAtPt = (ctx, x, y) => walls(ctx).find((w) => Math.abs((w.x2 - w.x1) * (y - w.y1) - (w.y2 - w.y1) * (x - w.x1)) / (Math.hypot(w.x2 - w.x1, w.y2 - w.y1) || 1) < 5 && x >= Math.min(w.x1, w.x2) - 5 && x <= Math.max(w.x1, w.x2) + 5 && y >= Math.min(w.y1, w.y2) - 5 && y <= Math.max(w.y1, w.y2) + 5);
const plusOf = (field) => () => { const st = [...document.querySelectorAll("#right-panel .stepper")].find((s) => s.dataset.field === field); return st ? st.querySelector('[data-step="1"]') : null; };
const fieldEl = (ctx, key) => () => document.querySelector(`#right-panel [data-field="${ctx.app.t(key)}"]`);
const sampleOpen = async (ctx, file, title) => {
  ctx.app.store.dirty = false;
  await ctx.command("file.samples");
  await ctx.pick(title);
  await ctx.waitFor(() => ctx.app.store.fileName === file, 5000);
  await ctx.wait(300);
};
const HOUSE = { x1: -1500, y1: -2500, x2: 15500, y2: 8500 };

// Lesson 20 (a three-storey mixed-use building): the plan, in mm.
const BLD = { x1: -2500, y1: -2500, x2: 20500, y2: 14500 };
const OUTLINE = [[0, 0], [18000, 0], [18000, 7000], [12000, 7000], [12000, 12000], [0, 12000]];
// Core walls (stair hall over the toilets), café | shops, shop | shop.
const PARTITIONS = [[[12000, 0], [12000, 7000]], [[12000, 3500], [18000, 3500]], [[0, 6000], [12000, 6000]], [[6000, 6000], [6000, 12000]]];
// [x, y, a point on the side the door opens to]
const ENTRANCES = [[6000, 0, 6000, 300], [3000, 12000, 3000, 11700], [9000, 12000, 9000, 11700]];
const INNER_DOORS = [[12000, 1750, 11700, 1750], [15000, 3500, 15000, 3700]];
const WINDOWS = [[2500, 0], [9500, 0], [15000, 0], [0, 3000], [0, 9000], [18000, 1750], [18000, 5250], [15000, 7000], [12000, 9500]];
const ROOMS_1F = [[6000, 3000, T("카페", "Café")], [3000, 9000, T("상가 1", "Shop 1")], [9000, 9000, T("상가 2", "Shop 2")], [15000, 1750, T("계단실", "Stair hall")], [15000, 5250, T("화장실", "Toilets")]];
const GRID = [[[0, -1500], [0, 13500]], [[6000, -1500], [6000, 13500]], [[12000, -1500], [12000, 13500]], [[18000, -1500], [18000, 13500]], [[-1500, 0], [19500, 0]], [[-1500, 6000], [19500, 6000]], [[-1500, 12000], [19500, 12000]]];
const COLUMNS = [[12000, 0], [6000, 6000], [12000, 6000], [6000, 12000]];
const STAIR = [[12800, 1750], [16800, 1750]];
const SHOP_WALLS = [[3000, 6000], [6000, 9000]];
const DESK = [3000, 3000];
const OFFICE = [6000, 9000];
// Lesson 21 (a three-storey office around an atrium with a 45° wing): the plan, in mm.
const CPX = { x1: -3000, y1: -5000, x2: 33000, y2: 19000 };
const CPX_WALLS = [[0, 16000], [0, 0], [24000, 0], [24000, 16000]]; // north, west and east sides
const CPX_CURTAIN = [[24000, 16000], [0, 16000]]; // the glass south front
const CPX_WING = [[24000, 4000], [30000, -2000], [30000, 6000], [24000, 12000]];
// Atrium | west offices, atrium | core, west office | west office, stair hall | café.
const CPX_PARTS = [[[8000, 0], [8000, 16000]], [[16000, 0], [16000, 16000]], [[0, 8000], [8000, 8000]], [[16000, 6000], [24000, 6000]]];
const CPX_ENTRANCE = [12000, 16000, 12000, 15700];
// [x, y, a point on the side the door opens to]: offices, stair hall, café, wing.
const CPX_DOORS = [[8000, 4000, 8300, 4000], [8000, 12000, 8300, 12000], [16000, 3000, 15700, 3000], [16000, 11000, 15700, 11000], [24000, 8000, 24300, 8000]];
const CPX_WINDOWS = [[4000, 0], [12000, 0], [20000, 0], [0, 4000], [0, 12000], [30000, 2000]];
const CPX_ATRIUM = [12000, 8000], CPX_WINGPT = [27000, 5000];
const CPX_STAIR = [[17000, 1500], [23000, 1500]];
const CPX_VOID = [[8300, 300], [15700, 15700]];
async function cpxDoors(ctx) {
  await ctx.key("d"); for (const [x, y, ix, iy] of CPX_DOORS) { await ctx.move(ix, iy); await ctx.clickAt(x, y); } await ctx.key("Escape");
}
async function cpxName(ctx, [x, y], name) {
  await toSelect(ctx);
  await ctx.clickAt(x, y, { dbl: true });
  const input = await ctx.waitFor(() => document.querySelector(".modal input.input"));
  await ctx.type(input, ctx.L(name)); await ctx.confirm();
}
const levelDoors = (ctx) => ctx.p.openings.filter((o) => o.kind === "door" && walls(ctx).some((w) => w.id === o.wall)).length;

// Name the open-plan room of an office floor (after Detect rooms).
async function nameOffice(ctx) {
  await toSelect(ctx);
  await ctx.clickAt(OFFICE[0], OFFICE[1], { dbl: true });
  const input = await ctx.waitFor(() => document.querySelector(".modal input.input"));
  await ctx.type(input, ctx.L(T("사무실", "Office"))); await ctx.confirm();
}
async function innerDoors(ctx) {
  await ctx.key("d"); for (const [x, y, ix, iy] of INNER_DOORS) { await ctx.move(ix, iy); await ctx.clickAt(x, y); } await ctx.key("Escape");
}
// Nothing selected: the right panel shows the level and the New items defaults.
async function deselect(ctx) {
  await toSelect(ctx);
  ctx.app.plan.clearSelection();
  ctx.app.refreshInspector();
  await ctx.waitFor(newWallType, 3000);
}
// The wall type under New items (right panel, nothing selected).
const newWallType = () => {
  const app = window.myarchApp;
  const span = [...document.querySelectorAll("#right-panel .prop-grid > span")].find((e) => e.textContent === app.t("Wall type") && e.nextElementSibling && e.nextElementSibling.tagName === "SELECT");
  return span ? span.nextElementSibling : null;
};

export const LESSONS = [
  // ---------------------------------------------------------------- 1
  {
    title: T("화면 둘러보기", "Finding your way around"), fresh: true,
    steps: [
      { title: T("예제 열기", "Open a sample"), text: T("파일 → 예제 열기에서 2층 주택을 엽니다. 시작 페이지의 예제 카드를 눌러도 됩니다.", "File → Open sample opens the two-storey house. The sample cards on the start page do the same."),
        run: async (ctx) => { await sampleOpen(ctx, "03-two-storey-house.myarch", ctx.L(T("2층 주택", "Two-storey house"))); ctx.expect(ctx.app.tab === "plan" && ctx.p.levels.length === 2, "sample not opened"); },
        practice: { todo: T("파일 → 예제 열기… 에서 '2층 주택'을 고르세요.", "Use File → Open sample… and choose the two-storey house."), check: (ctx) => ctx.app.store.fileName === "03-two-storey-house.myarch", targets: () => [{ el: '.menu-root[data-menu="File"]' }] } },
      { title: T("전체 보기", "Zoom to fit"), text: T("Home 키는 도면 전체를 화면에 맞춥니다. 휠로 확대·축소하고, 빈 곳을 끌면 화면이 이동합니다.", "Home fits the whole drawing. The wheel zooms, dragging empty space pans."),
        run: async (ctx) => { await ctx.key("Home"); ctx.expect(ctx.app.plan.vp.scale > 0, "no view"); },
        practice: { todo: T("Home 키를 누르세요.", "Press Home."), check: () => true } },
      { title: T("화면 이동", "Pan the view"), text: T("빈 곳을 왼쪽 버튼으로 끌면 도면이 따라 움직입니다 (Shift+끌기는 영역 선택).", "Drag empty space with the left button to move the drawing (Shift+drag selects a box)."),
        run: async (ctx) => {
          // Start in the empty top-left of the canvas (inside the rulers), whatever the window size.
          await toSelect(ctx);
          const vp = ctx.app.plan.vp;
          const ox = vp.ox;
          const a = vp.toWorld(70, 70), b = vp.toWorld(170, 130);
          await ctx.drag(a, b);
          ctx.expect(vp.ox !== ox, "view did not move");
        },
        practice: { todo: T("빈 곳을 끌어 화면을 옮기세요.", "Drag empty space to move the view."), setup: (ctx) => { ctx.app.plan.mem0 = ctx.app.plan.vp.ox; }, check: (ctx) => Math.abs(ctx.app.plan.vp.ox - (ctx.app.plan.mem0 ?? ctx.app.plan.vp.ox)) > 20 } },
      { title: T("층 바꾸기", "Switch levels"), text: T("왼쪽 아래의 층 탭으로 편집할 층을 고릅니다. 아래층은 흐리게 보입니다.", "The level tabs at the bottom left choose the storey you edit; the one below shows faintly."),
        run: async (ctx) => { await ctx.click(`.page-tab[data-level="${ctx.level("2F").id}"]`); ctx.expect(ctx.app.plan.level === ctx.level("2F").id, "level not changed"); },
        practice: { todo: T("'2F' 탭을 누르세요.", "Click the 2F tab."), check: (ctx) => ctx.app.plan.level === ctx.level("2F").id, targets: (ctx) => [{ el: `.page-tab[data-level="${ctx.level("2F").id}"]` }] } },
      { title: T("3D 보기", "The 3D view"), text: T("F3(또는 3D 보기 탭)은 건물을 3D로 보여 줍니다. 끌어서 회전, 오른쪽 끌기로 이동, 휠로 확대합니다.", "F3 (or the 3D View tab) shows the building in 3D. Drag to orbit, right-drag to pan, wheel to zoom."),
        run: async (ctx) => { await ctx.key("F3"); await ctx.waitFor(() => ctx.app.v3d.viewer, 8000); ctx.expect(ctx.app.tab === "3d", "3D not shown"); await ctx.wait(800); },
        practice: { todo: T("F3을 누르거나 3D 보기 탭을 누르세요.", "Press F3 or click the 3D View tab."), check: (ctx) => ctx.app.tab === "3d", targets: () => [{ el: '.doc-tab[data-tab="3d"]' }] } },
      { title: T("평면으로 돌아가기", "Back to the plan"), text: T("F2는 평면도로 돌아옵니다. Ctrl+K 로는 모든 명령과 방, 층을 검색할 수 있습니다.", "F2 returns to the floor plan. Ctrl+K searches every command, room and level."),
        run: async (ctx) => { await ctx.key("F2"); await ctx.click(`.page-tab[data-level="${ctx.level("1F").id}"]`); ctx.expect(ctx.app.tab === "plan", "not on the plan"); },
        practice: { todo: T("F2를 누르세요.", "Press F2."), check: (ctx) => ctx.app.tab === "plan", targets: () => [{ el: '.doc-tab[data-tab="plan"]' }] } },
    ],
  },
  // ---------------------------------------------------------------- 2
  {
    title: T("벽 그리기", "Drawing walls"), fresh: true,
    steps: [
      { title: T("새 프로젝트", "A new project"), text: T("Ctrl+N 은 빈 평면을 만듭니다. 단위는 mm 입니다.", "Ctrl+N starts an empty plan. Units are millimetres."),
        run: async (ctx) => { ctx.app.store.dirty = false; await ctx.command("file.new"); await discard(ctx); await ctx.waitFor(() => ctx.app.tab === "plan" && ctx.p.walls.length === 0); await ctx.view(HOUSE); },
        practice: { todo: T("Ctrl+N 을 누르세요.", "Press Ctrl+N."), check: (ctx) => ctx.app.tab === "plan" && ctx.p.walls.length === 0 } },
      { title: T("외벽 네 개", "Four outside walls"), text: T("W 를 누르고 모서리마다 클릭합니다. 처음 점을 다시 클릭하면 닫히며 끝납니다. 각도는 45° 단위로, 길이는 격자에 맞춰집니다.", "Press W and click each corner. Clicking the first point closes the outline. Angles snap to 45° steps and lengths to the grid."),
        run: async (ctx) => { await ctx.key("w"); await ctx.clicks([[0, 0], [9000, 0], [9000, 6000], [0, 6000], [0, 0]]); ctx.expect(walls(ctx).length === 4, `expected 4 walls, got ${walls(ctx).length}`); },
        practice: { todo: T("W 를 누르고 표시된 네 모서리를 차례로 클릭한 뒤 첫 점을 다시 클릭하세요.", "Press W, click the four marked corners in turn and click the first one again."), check: (ctx) => walls(ctx).length >= 4, targets: () => [{ x: 0, y: 0 }, { x: 9000, y: 0 }, { x: 9000, y: 6000 }, { x: 0, y: 6000 }] } },
      { title: T("칸막이 벽", "An inside wall"), text: T("벽 끝을 다른 벽 위에 놓으면 T 자로 깔끔하게 이어집니다. Esc 로 그리기를 끝냅니다.", "Ending a wall on another wall joins them in a clean T. Esc stops drawing."),
        run: async (ctx) => { await ctx.key("w"); await ctx.clicks([[5000, 0], [5000, 6000]]); await ctx.key("Escape"); ctx.expect(walls(ctx).length === 5, "inside wall missing"); },
        practice: { todo: T("W 로 위쪽 벽 가운데(5000, 0)에서 아래쪽 벽까지 벽을 그리고 Esc.", "With W, draw from the top wall at 5000 to the bottom wall, then Esc."), check: (ctx) => walls(ctx).length >= 5, targets: () => [{ x: 5000, y: 0 }, { x: 5000, y: 6000 }] } },
      { title: T("길이를 입력해 그리기", "Typing a length"), text: T("그리는 중에 숫자를 입력하면 정확한 길이로 그립니다: 5000, 3.6m, 360cm, 각도는 5000<90 처럼.", "While drawing, type a number for an exact length: 5000, 3.6m, 360cm, or with an angle like 5000<90."),
        run: async (ctx) => { await ctx.key("w"); await ctx.clickAt(0, 3000); await ctx.move(2500, 3000); await ctx.key("5"); await ctx.popup("5000"); await ctx.key("Escape"); ctx.expect(walls(ctx).some((w) => Math.abs(w.x2 - 5000) < 2 && Math.abs(w.y2 - 3000) < 2 && w.x1 === 0), "typed wall missing"); },
        practice: { todo: T("W, 왼쪽 벽의 (0, 3000)을 클릭하고 오른쪽으로 마우스를 옮긴 뒤 5000 을 입력하고 Enter, Esc.", "W, click the left wall at (0, 3000), move right, type 5000 and Enter, then Esc."), check: (ctx) => walls(ctx).some((w) => Math.abs(Math.hypot(w.x2 - w.x1, w.y2 - w.y1) - 5000) < 2 && Math.abs(w.y1 - 3000) < 2), targets: () => [{ x: 0, y: 3000 }] } },
      { title: T("벽 두께", "Wall thickness"), text: T("벽을 클릭하면 오른쪽에 속성이 나타납니다. 모든 숫자는 − / + 로 바꾸거나 직접 입력합니다.", "Click a wall to see its properties on the right. Every number has − / + or can be typed."),
        run: async (ctx) => { await toSelect(ctx); await ctx.clickAt(4000, 0); const w = wallAtPt(ctx, 4000, 0); const t0 = w.thickness; await ctx.click(plusOf(ctx.app.t("Thickness"))); ctx.expect(wallAtPt(ctx, 4000, 0).thickness === t0 + 10, "thickness unchanged"); },
        practice: { todo: T("위쪽 벽을 클릭하고 오른쪽의 '두께' + 를 누르세요.", "Click the top wall and press + next to Thickness."), setup: (ctx) => { ctx.app.tutorialT0 = (wallAtPt(ctx, 4000, 0) || {}).thickness; }, check: (ctx) => (wallAtPt(ctx, 4000, 0) || {}).thickness > ctx.app.tutorialT0, targets: () => [{ x: 4000, y: 0 }] } },
      { title: T("벽 옮기기와 되돌리기", "Move a wall, then undo"), text: T("벽을 끌면 이어진 벽이 따라 늘어납니다. Ctrl+Z 로 되돌리고 Ctrl+Y 로 다시 합니다.", "Dragging a wall stretches the walls joined to it. Ctrl+Z undoes, Ctrl+Y redoes."),
        run: async (ctx) => { await toSelect(ctx); await ctx.drag([5000, 1500], [5600, 1500]); ctx.expect(walls(ctx).some((w) => Math.abs(w.x1 - 5600) < 2 && Math.abs(w.x2 - 5600) < 2), "wall not moved"); await ctx.key("z", { ctrl: true }); ctx.expect(walls(ctx).some((w) => w.x1 === 5000 && w.x2 === 5000), "undo failed"); },
        practice: { todo: T("가운데 벽을 오른쪽으로 끌었다가 Ctrl+Z 로 되돌리세요.", "Drag the middle wall to the right, then press Ctrl+Z."), check: (ctx) => ctx.app.store.redoStack.length > 0 && walls(ctx).some((w) => w.x1 === 5000 && w.x2 === 5000), targets: () => [{ x: 5000, y: 1500 }] } },
      { title: T("되돌리기·다시 실행 단추", "Undo and redo buttons"), text: T("도구 모음의 ↶ 되돌리기 · ↷ 다시 실행 단추도 같은 일을 합니다. 단추에 마우스를 올리면 무엇을 되돌릴지 보여 주고, 도면이나 3D 화면을 오른쪽 클릭한 메뉴 맨 위에도 있습니다.", "The ↶ Undo and ↷ Redo buttons on the toolbar do the same; their tooltip names the step, and they are also at the top of the right-click menu in the plan and in 3D."),
        run: async (ctx) => {
          await ctx.click('#toolbar [data-cmd="edit.redo"]');
          ctx.expect(walls(ctx).some((w) => Math.abs(w.x1 - 5600) < 2 && Math.abs(w.x2 - 5600) < 2), "redo button did nothing");
          await ctx.click('#toolbar [data-cmd="edit.undo"]');
          ctx.expect(walls(ctx).some((w) => w.x1 === 5000 && w.x2 === 5000), "undo button did nothing");
        },
        practice: {
          todo: T("도구 모음의 ↷ 다시 실행을 누른 다음 ↶ 되돌리기를 누르세요.", "Press ↷ Redo on the toolbar, then ↶ Undo."),
          setup: (ctx) => { undoButtonsStart = ctx.app.store.revision; },
          check: (ctx) => ctx.app.store.revision >= undoButtonsStart + 2 && walls(ctx).some((w) => w.x1 === 5000 && w.x2 === 5000),
          targets: () => [{ el: '#toolbar [data-cmd="edit.redo"]' }, { el: '#toolbar [data-cmd="edit.undo"]' }],
        } },
    ],
  },
  // ---------------------------------------------------------------- 3
  {
    title: T("문과 창문", "Doors and windows"),
    steps: [
      { title: T("현관문", "The front door"), text: T("D 를 누르고 벽 위를 클릭하면 문이 들어갑니다. 커서가 있는 쪽으로 열립니다.", "Press D and click on a wall to put in a door. It opens towards the side the cursor is on."),
        run: async (ctx) => { await ctx.key("d"); await ctx.move(2000, 5800); await ctx.clickAt(2000, 5950); await ctx.key("Escape"); ctx.expect(ctx.p.openings.some((o) => o.kind === "door"), "no door"); },
        practice: { todo: T("D 를 누르고 아래쪽 벽의 표시된 곳을 클릭하세요.", "Press D and click the bottom wall at the mark."), check: (ctx) => ctx.p.openings.some((o) => o.kind === "door"), targets: () => [{ x: 2000, y: 6000 }] } },
      { title: T("창문 두 개", "Two windows"), text: T("N 은 창문입니다. 폭·높이·창대 높이는 오른쪽 패널이나 빌드 → 기본 크기에서 정합니다.", "N places windows. Width, height and sill come from the right panel or Build → Default sizes."),
        run: async (ctx) => { await ctx.key("n"); await ctx.clickAt(2500, 0); await ctx.clickAt(7000, 0); await ctx.key("Escape"); ctx.expect(ctx.p.openings.filter((o) => o.kind === "window").length === 2, "windows missing"); },
        practice: { todo: T("N 을 누르고 위쪽 벽의 두 곳을 클릭하세요.", "Press N and click the top wall at the two marks."), check: (ctx) => ctx.p.openings.filter((o) => o.kind === "window").length >= 2, targets: () => [{ x: 2500, y: 0 }, { x: 7000, y: 0 }] } },
      { title: T("안쪽 문", "Inside doors"), text: T("칸막이 벽에도 문을 넣습니다.", "Inside walls get doors too."),
        run: async (ctx) => { await ctx.key("d"); await ctx.move(5100, 1600); await ctx.clickAt(5000, 1500); await ctx.move(2500, 3100); await ctx.clickAt(2500, 3000); await ctx.key("Escape"); ctx.expect(ctx.p.openings.filter((o) => o.kind === "door").length === 3, "inside doors missing"); },
        practice: { todo: T("D 로 두 칸막이 벽의 표시된 곳에 문을 넣으세요.", "With D, put doors at the two marks on the inside walls."), check: (ctx) => ctx.p.openings.filter((o) => o.kind === "door").length >= 3, targets: () => [{ x: 5000, y: 1500 }, { x: 2500, y: 3000 }] } },
      { title: T("여는 방향 바꾸기", "Flip the swing"), text: T("문을 선택하고 X 는 여는 쪽을, H 는 경첩 쪽을 바꿉니다.", "Select a door: X flips the side it opens to, H swaps the hinge."),
        run: async (ctx) => { await ctx.clickAt(2000, 6000); const o = ctx.p.openings.find((x) => [...ctx.app.plan.sel].includes(x.id)); ctx.expect(o, "door not selected"); const side = o.side; await ctx.key("x"); await ctx.key("h"); const o2 = ctx.p.openings.find((x) => x.id === o.id); ctx.expect(o2.side === -side, "swing not flipped"); },
        practice: { todo: T("현관문을 클릭하고 X 와 H 를 눌러 보세요.", "Click the front door and press X and H."), check: (ctx) => ctx.app.store.history().undo.filter((l) => l === ctx.app.t("Flip door")).length >= 1, targets: () => [{ x: 2000, y: 6000 }] } },
      { title: T("문 폭", "Door width"), text: T("오른쪽 패널에서 폭을 + 로 넓힙니다. 한 번 누를 때 50 mm 씩입니다.", "Widen it with + on the right; each press adds 50 mm."),
        run: async (ctx) => { await toSelect(ctx); await ctx.clickAt(2000, 6000); const o = ctx.p.openings.find((x) => [...ctx.app.plan.sel].includes(x.id)); const w0 = o.width; await ctx.click(plusOf(ctx.app.t("Width"))); ctx.expect(ctx.p.openings.find((x) => x.id === o.id).width === w0 + 50, "width unchanged"); },
        practice: { todo: T("현관문 선택 상태에서 '폭' + 를 누르세요.", "With the front door selected, press + next to Width."), check: (ctx) => ctx.p.openings.some((o) => o.kind === "door" && o.width > 900) } },
    ],
  },
  // ---------------------------------------------------------------- 4
  {
    title: T("방과 면적", "Rooms and areas"),
    steps: [
      { title: T("벽 안을 클릭해 방 만들기", "Click inside walls"), text: T("A 를 누르고 닫힌 벽 안을 클릭하면 방과 면적(벽 안쪽 기준)이 자동으로 생깁니다.", "Press A and click inside closed walls: the room and its net area appear by themselves."),
        run: async (ctx) => { await ctx.key("a"); for (const [x, y] of [[2500, 1500], [2500, 4500], [7000, 3000]]) await ctx.clickAt(x, y); await ctx.key("Escape"); ctx.expect(ctx.on("rooms").length === 3, `expected 3 rooms, got ${ctx.on("rooms").length}`); },
        practice: { todo: T("A 를 누르고 세 공간을 각각 클릭하세요.", "Press A and click inside each of the three spaces."), check: (ctx) => ctx.on("rooms").length >= 3, targets: () => [{ x: 2500, y: 1500 }, { x: 2500, y: 4500 }, { x: 7000, y: 3000 }] } },
      { title: T("방 이름 바꾸기", "Rename a room"), text: T("방을 두 번 클릭하면 속성 창이 열립니다. 목록에서 이름을 고르거나 직접 입력합니다.", "Double-click a room for its properties. Pick a name from the list or type one."),
        run: async (ctx) => {
          await ctx.clickAt(7000, 2200, { dbl: true });
          const input = await ctx.waitFor(() => document.querySelector(".modal input.input"));
          await ctx.type(input, ctx.L(T("거실", "Living room")));
          await ctx.confirm();
          ctx.expect(ctx.on("rooms").some((r) => r.name === ctx.L(T("거실", "Living room"))), "room not renamed");
        },
        practice: { todo: T("오른쪽 큰 방을 두 번 클릭해 이름을 '거실'로 바꾸세요.", "Double-click the big room on the right and call it Living room."), check: (ctx) => ctx.on("rooms").some((r) => /거실|living/i.test(r.name)), targets: () => [{ x: 7000, y: 2200 }] } },
      { title: T("방 번호와 면적", "Room number and area"), text: T("방을 선택하면 면적, 둘레, 번호, 용도(부서)를 볼 수 있습니다. 실 번호는 BIM 과 집계표에 쓰입니다.", "A selected room shows its area, perimeter, number and department. Room numbers feed BIM and schedules."),
        run: async (ctx) => { await ctx.clickAt(2500, 1500); const f = await ctx.waitFor(fieldEl(ctx, "Number")); await ctx.type(f, "101"); ctx.expect(ctx.on("rooms").some((r) => r.number === "101"), "number not set"); },
        practice: { todo: T("왼쪽 위 방을 클릭하고 '번호'에 101 을 입력하세요.", "Click the top-left room and enter 101 as its Number."), check: (ctx) => ctx.on("rooms").some((r) => r.number), targets: () => [{ x: 2500, y: 1500 }] } },
    ],
  },
  // ---------------------------------------------------------------- 5
  {
    title: T("가구 배치", "Furnishing"),
    steps: [
      { title: T("라이브러리에서 고르기", "From the library"), text: T("왼쪽 가구 라이브러리에서 항목을 누르고 평면을 클릭하면 놓입니다. 끌어다 놓아도 됩니다.", "Click an item in the furniture library on the left, then click the plan. Drag and drop works too."),
        run: async (ctx) => { await ctx.click('.lib-item[data-kind="sofa3"]'); await ctx.clickAt(7000, 3500); ctx.expect(ctx.on("furniture").some((f) => f.kind === "sofa3"), "sofa missing"); },
        practice: { todo: T("왼쪽 목록의 '소파 (3인)'을 누르고 거실을 클릭하세요.", "Click Sofa (3 seats) on the left, then click in the living room."), check: (ctx) => ctx.on("furniture").some((f) => f.kind === "sofa3"), targets: () => [{ el: '.lib-item[data-kind="sofa3"]' }] } },
      { title: T("회전", "Rotate"), text: T("R 은 90°, Shift+R 은 15° 씩 돌립니다. 놓기 전 미리보기도 R 로 돌릴 수 있습니다.", "R turns by 90°, Shift+R by 15°. The preview can be turned before placing too."),
        run: async (ctx) => { await ctx.key("r"); ctx.expect(ctx.on("furniture").find((f) => f.kind === "sofa3").rot === 90, "not rotated"); },
        practice: { todo: T("소파를 선택한 상태에서 R 을 누르세요.", "With the sofa selected, press R."), check: (ctx) => ctx.on("furniture").some((f) => f.kind === "sofa3" && f.rot) } },
      { title: T("검색해서 놓기", "Search and place"), text: T("F 는 가구 검색 창을 엽니다. 이름을 입력하고 Enter, 평면을 클릭합니다.", "F opens the furniture search. Type a name, press Enter and click the plan."),
        run: async (ctx) => { await ctx.key("f"); await ctx.pick(ctx.L(T("더블", "Double bed")), ctx.L(T("더블", "Double bed"))); await ctx.clickAt(2500, 1400); ctx.expect(ctx.on("furniture").some((f) => f.kind === "doubleBed"), "bed missing"); },
        practice: { todo: T("F 를 누르고 '더블 침대'를 찾아 왼쪽 위 방에 놓으세요.", "Press F, find Double bed and place it in the top-left room."), check: (ctx) => ctx.on("furniture").some((f) => f.kind === "doubleBed"), targets: () => [{ x: 2500, y: 1400 }] } },
      { title: T("끌어서 옮기기", "Drag to move"), text: T("가구를 끌면 격자 반 칸 단위로 움직입니다. Shift 를 누르면 가로·세로로만 움직입니다.", "Drag furniture to move it in half-grid steps; Shift keeps it horizontal or vertical."),
        run: async (ctx) => { await ctx.drag([7000, 3500], [7000, 3000]); ctx.expect(ctx.on("furniture").find((f) => f.kind === "sofa3").y === 3000, "sofa not moved"); },
        practice: { todo: T("소파를 위로 끌어 옮기세요.", "Drag the sofa a little upwards."), check: (ctx) => ctx.on("furniture").some((f) => f.kind === "sofa3" && f.y < 3500), targets: () => [{ x: 7000, y: 3500 }] } },
      { title: T("속성 창", "The properties window"), text: T("두 번 클릭하면 크기, 높이, 색상 같은 모든 속성을 바꿀 수 있습니다.", "Double-click to change size, height, colour and every other property."),
        run: async (ctx) => { await ctx.clickAt(7000, 3000, { dbl: true }); await ctx.waitFor(() => ctx.modal()); await ctx.confirm(); },
        practice: { todo: T("소파를 두 번 클릭해 속성 창을 열고 확인을 누르세요.", "Double-click the sofa and press OK."), check: (ctx, mem) => mem.modals.size > 0 && !ctx.modal() } },
    ],
  },
  // ---------------------------------------------------------------- 6
  {
    title: T("편집: 선택, 복사, 그룹", "Editing: select, copy, group"),
    steps: [
      { title: T("영역 선택", "Box selection"), text: T("Shift+끌기는 영역 선택입니다. 왼쪽→오른쪽은 완전히 들어간 것만, 오른쪽→왼쪽은 걸친 것까지 고릅니다.", "Shift+drag selects a box: left-to-right takes what is fully inside, right-to-left anything it touches."),
        run: async (ctx) => { await ctx.key("Escape"); await ctx.drag([-800, -800], [4200, 2800], { shift: true }); ctx.expect(ctx.app.plan.selectedItems().some((i) => i.obj.kind === "doubleBed"), "bed not selected"); },
        practice: { todo: T("Shift 를 누른 채 건물 바깥 왼쪽 위에서 시작해 침대를 감싸도록 끄세요.", "Hold Shift and drag a box from outside the top-left corner around the bed."), check: (ctx) => ctx.app.plan.selectedItems().some((i) => i.obj.kind === "doubleBed"), targets: () => [{ x: -800, y: -800 }] } },
      { title: T("복제와 삭제", "Duplicate and delete"), text: T("Ctrl+D 는 복제, Ctrl+C / Ctrl+V 는 복사·붙여넣기, Del 은 삭제입니다.", "Ctrl+D duplicates, Ctrl+C / Ctrl+V copy and paste, Del deletes."),
        run: async (ctx) => { const n = ctx.on("furniture").length; await ctx.key("d", { ctrl: true }); ctx.expect(ctx.on("furniture").length === n + 1, "not duplicated"); await ctx.key("Delete"); ctx.expect(ctx.on("furniture").length === n, "not deleted"); },
        practice: { todo: T("Ctrl+D 로 복제한 다음 Del 로 지우세요.", "Press Ctrl+D, then Del."), check: (ctx) => ctx.app.store.history().undo.includes(ctx.app.t("Delete")) } },
      { title: T("되돌리기 기록", "Undo history"), text: T("편집 → 되돌리기 기록 에서 원하는 단계까지 한 번에 되돌릴 수 있습니다.", "Edit → Undo history goes back several steps at once."),
        run: async (ctx) => { await ctx.command("edit.history"); await ctx.waitFor(() => ctx.modal()); await closeAll(ctx); },
        practice: { todo: T("편집 → 되돌리기 기록… 을 열어 보고 닫으세요.", "Open Edit → Undo history… and close it."), check: (ctx, mem) => [...mem.modals].some((m) => m.includes(ctx.app.t("Undo history"))) } },
      { title: T("그룹 만들기", "Make a group"), text: T("여러 요소를 골라 Ctrl+G 로 그룹을 만들면 함께 선택되고 움직입니다. Alt+클릭은 하나만 고릅니다. Ctrl+Shift+G 는 그룹 해제.", "Select several items and press Ctrl+G: they are selected and moved together. Alt+click picks one. Ctrl+Shift+G ungroups."),
        run: async (ctx) => {
          await ctx.clickAt(7000, 3000);
          await ctx.clickAt(2500, 1400, { shift: true });
          await ctx.key("g", { ctrl: true });
          const fs = ctx.on("furniture").filter((f) => f.group);
          ctx.expect(fs.length === 2, "group not made");
          await ctx.key("Escape");
          await ctx.clickAt(7000, 3000);
          ctx.expect(ctx.app.plan.sel.size === 2, "group not selected as one");
        },
        practice: { todo: T("소파와 침대를 Shift+클릭으로 함께 고르고 Ctrl+G 를 누르세요.", "Shift+click the sofa and the bed, then press Ctrl+G."), check: (ctx) => ctx.on("furniture").filter((f) => f.group).length >= 2 } },
      { title: T("그룹 풀기", "Ungroup"), text: T("Ctrl+Shift+G 로 그룹을 풉니다.", "Ctrl+Shift+G breaks the group up again."),
        run: async (ctx) => { await ctx.key("g", { ctrl: true, shift: true }); ctx.expect(!ctx.on("furniture").some((f) => f.group), "still grouped"); },
        practice: { todo: T("그룹을 선택하고 Ctrl+Shift+G.", "Select the group and press Ctrl+Shift+G."), check: (ctx) => !ctx.on("furniture").some((f) => f.group) } },
      { title: T("크기 조정", "Scale"), text: T("편집 → 크기 조정… 은 선택한 것을 배율로 키우거나 줄입니다 (가구는 높이까지).", "Edit → Scale… resizes the selection by a factor (furniture in height too)."),
        run: async (ctx) => { await ctx.clickAt(2500, 1400); const w0 = ctx.on("furniture").find((f) => f.kind === "doubleBed").w; await ctx.command("edit.scale"); const inp = await ctx.waitFor(() => document.querySelector(".modal input")); await ctx.type(inp, "0.9"); await ctx.confirm(); ctx.expect(Math.abs(ctx.on("furniture").find((f) => f.kind === "doubleBed").w - w0 * 0.9) < 1, "not scaled"); },
        practice: { todo: T("침대를 선택하고 편집 → 크기 조정… 에서 0.9 를 입력하세요.", "Select the bed, Edit → Scale… and enter 0.9."), check: (ctx) => ctx.on("furniture").some((f) => f.kind === "doubleBed" && f.w < 1600) } },
    ],
  },
  // ---------------------------------------------------------------- 7
  {
    title: T("치수, 문자, 그리드", "Dimensions, text and grids"),
    steps: [
      { title: T("자동 치수", "Automatic dimensions"), text: T("빌드 → 외벽 치수 넣기 는 전체 크기와 벽 사이 치수를 바깥에 그립니다.", "Build → Dimension the outside walls draws the overall and wall-to-wall dimensions outside."),
        run: async (ctx) => { await ctx.command("build.autoDims"); ctx.expect(ctx.on("dimensions").length >= 2, "no dimensions"); },
        practice: { todo: T("빌드 메뉴의 '외벽 치수 넣기'를 누르세요.", "Use Build → Dimension the outside walls."), check: (ctx) => ctx.on("dimensions").length >= 2 } },
      { title: T("치수 직접 넣기", "A dimension of your own"), text: T("K 를 누르고 두 점을 클릭한 뒤, 치수선 위치를 정해 한 번 더 클릭합니다.", "Press K, click two points, then click once more where the dimension line goes."),
        run: async (ctx) => { const n = ctx.on("dimensions").length; await ctx.key("k"); await ctx.clickAt(0, 6000); await ctx.clickAt(5000, 6000); await ctx.move(2500, 7000); await ctx.clickAt(2500, 7000); await ctx.key("Escape"); ctx.expect(ctx.on("dimensions").length === n + 1, "dimension missing"); },
        practice: { todo: T("K, 표시된 두 점, 그리고 아래쪽을 클릭하세요.", "K, the two marks, then click below them."), setup: (ctx) => { ctx.app.tutN = ctx.on("dimensions").length; }, check: (ctx) => ctx.on("dimensions").length > ctx.app.tutN, targets: () => [{ x: 0, y: 6000 }, { x: 5000, y: 6000 }] } },
      { title: T("문자", "Text"), text: T("T 를 누르고 클릭한 곳에 글자를 입력합니다.", "Press T, click and type."),
        run: async (ctx) => { await ctx.key("t"); await ctx.clickAt(500, 7600); await ctx.popup(ctx.L(T("현관", "Entrance"))); await ctx.key("Escape"); ctx.expect(ctx.on("texts").length === 1, "no text"); },
        practice: { todo: T("T 를 누르고 아래쪽에 '현관'을 쓰세요.", "Press T and write Entrance below the plan."), check: (ctx) => ctx.on("texts").length >= 1, targets: () => [{ x: 500, y: 7600 }] } },
      { title: T("거리 재기", "Measure"), text: T("M 은 두 점 사이의 거리를 잽니다 (도면에는 남지 않습니다).", "M measures between two points (nothing is added to the drawing)."),
        run: async (ctx) => { await ctx.key("m"); await ctx.clickAt(0, 0); await ctx.clickAt(9000, 6000); ctx.expect(ctx.app.plan.measure && ctx.app.plan.measure.b, "no measurement"); await ctx.key("Escape"); },
        practice: { todo: T("M 을 누르고 대각선의 두 모서리를 클릭하세요.", "Press M and click two opposite corners."), check: (ctx) => !!(ctx.app.plan.measure && ctx.app.plan.measure.b), targets: () => [{ x: 0, y: 0 }, { x: 9000, y: 6000 }] } },
      { title: T("구조 그리드", "Structural grid"), text: T("G 로 통심선을 그립니다. 세로선은 1, 2, 3 …, 가로선은 A, B, C … 로 번호가 붙고 모든 층에 나타납니다.", "G draws grid lines: vertical ones are numbered 1, 2, 3 …, horizontal ones A, B, C …, and they show on every level."),
        run: async (ctx) => { await ctx.key("g"); await ctx.clickAt(0, -1500); await ctx.clickAt(0, 7500); await ctx.clickAt(9000, -1500); await ctx.clickAt(9000, 7500); await ctx.clickAt(-1500, 0); await ctx.clickAt(10500, 0); await ctx.key("Escape"); ctx.expect(ctx.p.grids.length === 3 && ctx.p.grids.some((g) => g.label === "A"), "grid lines missing"); },
        practice: { todo: T("G 로 왼쪽 벽을 따라 세로선 하나를 그리세요.", "With G, draw a vertical line along the left wall."), check: (ctx) => ctx.p.grids.length >= 1, targets: () => [{ x: 0, y: -1500 }, { x: 0, y: 7500 }] } },
      { title: T("CAD 선", "Drafting lines"), text: T("L 은 CAD 레이어에 선을 그립니다 (DXF 로 내보내집니다). Enter 로 끝냅니다.", "L draws lines on a CAD layer (exported to DXF). Enter finishes."),
        run: async (ctx) => { await ctx.key("l"); await ctx.clicks([[10500, 2000], [12000, 2000], [12000, 3500]]); await ctx.key("Enter"); await ctx.key("Escape"); ctx.expect(ctx.on("drawings").length === 1, "no line"); },
        practice: { todo: T("L 로 선을 몇 번 클릭해 그리고 Enter.", "Draw a line with L and a few clicks, then Enter."), check: (ctx) => ctx.on("drawings").length >= 1 } },
    ],
  },
  // ---------------------------------------------------------------- 8
  {
    title: T("층과 계단", "Levels and stairs"),
    steps: [
      { title: T("계단", "A stair"), text: T("S 를 누르고 계단의 아래쪽과 위쪽을 클릭합니다. 단 수는 층 높이에 맞춰집니다.", "Press S and click the bottom and the top of the stair. The number of steps follows the level height."),
        run: async (ctx) => { await ctx.key("s"); await ctx.clickAt(5600, 5350); await ctx.clickAt(8600, 5350); await ctx.key("Escape"); ctx.expect(ctx.on("stairs").length === 1, "no stair"); },
        practice: { todo: T("S, 그리고 거실 아래쪽의 두 점을 클릭하세요.", "S, then the two marks at the bottom of the living room."), check: (ctx) => ctx.on("stairs").length >= 1, targets: () => [{ x: 5600, y: 5350 }, { x: 8600, y: 5350 }] } },
      { title: T("위층 추가", "Add a level"), text: T("층 탭의 + 는 위에 새 층을 만들고 맨 위층의 벽(안쪽 벽 포함)과 창문을 복사합니다. 문은 복사하지 않습니다.", "The + on the level tabs adds a storey on top and copies the top level's walls (inside walls too) and windows — not the doors."),
        run: async (ctx) => { await ctx.click("#view-plan .page-tab.add"); ctx.expect(ctx.p.levels.length === 2, "level not added"); ctx.expect(ctx.p.walls.filter((w) => w.level === ctx.app.plan.level).length >= 4, "walls not copied"); },
        practice: { todo: T("왼쪽 아래 층 탭의 + 를 누르세요.", "Press + on the level tabs at the bottom left."), check: (ctx) => ctx.p.levels.length >= 2, targets: () => [{ el: "#view-plan .page-tab.add" }] } },
      { title: T("층 속성", "Level properties"), text: T("층의 이름, 높이(FL), 층고와 슬래브 두께를 바꿉니다.", "Rename a level and set its elevation, storey height and slab."),
        run: async (ctx) => { await ctx.command("build.levelProps"); await ctx.waitFor(() => ctx.modal()); await ctx.confirm(); },
        practice: { todo: T("빌드 → 층 속성… 을 열고 확인.", "Open Build → Level properties… and press OK."), check: (ctx, mem) => [...mem.modals].some((m) => m.includes(ctx.app.t("Level properties"))) && !ctx.modal() } },
      { title: T("아래층으로", "Back downstairs"), text: T("층 탭으로 1층으로 돌아갑니다.", "Back to the ground floor with its tab."),
        run: async (ctx) => { await ctx.click(`.page-tab[data-level="${ctx.p.levels[0].id}"]`); ctx.expect(ctx.app.plan.level === ctx.p.levels[0].id, "level not changed"); },
        practice: { todo: T("1F 탭을 누르세요.", "Click the 1F tab."), check: (ctx) => ctx.app.plan.level === ctx.p.levels[0].id, targets: (ctx) => [{ el: `.page-tab[data-level="${ctx.p.levels[0].id}"]` }] } },
    ],
  },
  // ---------------------------------------------------------------- 9
  {
    title: T("지붕과 기둥", "Roofs and columns"),
    steps: [
      { title: T("지붕 자동 생성", "Roof over the building"), text: T("빌드 → 맨 위층 지붕 은 맨 위층 외벽 윤곽에 박공지붕을 올립니다.", "Build → Roof over the top level puts a gable roof over the top storey's outline."),
        run: async (ctx) => { await ctx.command("build.autoRoof"); ctx.expect(ctx.p.roofs.length === 1, "no roof"); },
        practice: { todo: T("빌드 메뉴의 '맨 위층 지붕'을 누르세요.", "Use Build → Roof over the top level."), check: (ctx) => ctx.p.roofs.length >= 1 } },
      { title: T("모임지붕으로", "Make it a hip roof"), text: T("지붕을 선택한 상태에서 모양(박공·모임·외쪽·평)과 경사, 처마를 바꿉니다.", "With the roof selected change its shape (gable, hip, shed, flat), pitch and overhang."),
        run: async (ctx) => { const sel = await ctx.waitFor(fieldEl(ctx, "Shape")); await ctx.select(sel, "hip"); ctx.expect(ctx.p.roofs[0].kind === "hip", "roof shape unchanged"); },
        practice: { todo: T("오른쪽의 '모양'을 '모임'으로 바꾸세요.", "Change Shape on the right to Hip."), check: (ctx) => ctx.p.roofs.some((r) => r.kind === "hip"), targets: (ctx) => [{ el: fieldEl(ctx, "Shape") }] } },
      { title: T("기둥", "Columns"), text: T("C 를 누르고 클릭하면 기둥이 놓입니다. 벽 모서리에 달라붙습니다.", "Press C and click to place a column. It snaps to wall corners."),
        run: async (ctx) => { await ctx.click(`.page-tab[data-level="${ctx.p.levels[0].id}"]`); await ctx.key("c"); await ctx.clickAt(9000, 6000); await ctx.key("Escape"); ctx.expect(ctx.on("columns").length === 1, "no column"); },
        practice: { todo: T("C 를 누르고 오른쪽 아래 모서리를 클릭하세요.", "Press C and click the bottom-right corner."), check: (ctx) => ctx.p.columns.length >= 1, targets: () => [{ x: 9000, y: 6000 }] } },
    ],
  },
  // ---------------------------------------------------------------- 10
  {
    title: T("매스 모델링 (스케치업 방식)", "Massing (SketchUp style)"),
    steps: [
      { title: T("매스 상자", "A mass box"), text: T("B 를 누르고 마주 보는 두 모서리를 클릭하면 입체 매스가 생깁니다.", "Press B and click two opposite corners for a solid mass."),
        run: async (ctx) => { await ctx.view({ x1: -1500, y1: -2500, x2: 16000, y2: 9000 }); await ctx.key("b"); await ctx.clickAt(11000, 1000); await ctx.clickAt(14000, 4000); await ctx.key("Escape"); ctx.expect(ctx.on("solids").length === 1, "no mass"); },
        practice: { todo: T("B 를 누르고 표시된 두 점을 클릭하세요.", "Press B and click the two marks."), check: (ctx) => ctx.on("solids").length >= 1, targets: () => [{ x: 11000, y: 1000 }, { x: 14000, y: 4000 }] } },
      { title: T("높이와 테이퍼", "Height and taper"), text: T("오른쪽에서 높이, 바닥 높이, 테이퍼(위쪽을 좁혀 피라미드나 원뿔로)를 정합니다.", "On the right set its height, base height and taper (narrow the top into a pyramid or cone)."),
        run: async (ctx) => { await toSelect(ctx); await ctx.clickAt(12500, 2500); const h0 = ctx.on("solids")[0].height; await ctx.click(plusOf(ctx.app.t("Height"))); ctx.expect(ctx.on("solids")[0].height === h0 + 100, "height unchanged"); },
        practice: { todo: T("매스를 클릭하고 '높이' + 를 누르세요.", "Click the mass and press + next to Height."), check: (ctx) => ctx.on("solids").some((s) => s.height !== 3000), targets: () => [{ x: 12500, y: 2500 }] } },
      { title: T("원기둥 매스", "A cylinder"), text: T("U 를 누르고 중심과 원 위의 한 점을 클릭합니다.", "Press U and click the centre and a point on the circle."),
        run: async (ctx) => { await ctx.key("u"); await ctx.clickAt(12500, 6500); await ctx.clickAt(13500, 6500); await ctx.key("Escape"); ctx.expect(ctx.on("solids").length === 2, "no cylinder"); },
        practice: { todo: T("U, 그리고 표시된 두 점.", "U, then the two marks."), check: (ctx) => ctx.on("solids").length >= 2, targets: () => [{ x: 12500, y: 6500 }, { x: 13500, y: 6500 }] } },
      { title: T("밀기/끌기", "Push/Pull"), text: T("3D 에서 밀기/끌기 도구로 매스나 벽의 윗면을 위아래로 끌어 높이를 바꿉니다.", "In 3D the Push/Pull tool drags the top of a mass or a wall up or down."),
        run: async (ctx) => {
          await ctx.key("F3");
          const v = await ctx.waitFor(() => ctx.app.v3d.viewer, 8000);
          ctx.app.v3d.syncModel();
          v.setView("iso");
          await ctx.wait(600);
          v.three.controls.update();
          await ctx.click('[data-tool3d="pushpull"]');
          const s = ctx.on("solids")[0];
          const h0 = s.height;
          const [x, y] = ctx.screenOf3d(12500, 2500, s.height);
          const c = v.three.renderer.domElement;
          const ev = (type, yy) => c.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: yy, pointerId: 1, button: 0, buttons: type === "pointerup" ? 0 : 1, pointerType: "mouse", isPrimary: true }));
          await ctx.moveTo(x, y);
          ev("pointerdown", y);
          for (let k = 1; k <= 8; k++) { ev("pointermove", y - k * 10); await ctx.wait(30); }
          ev("pointerup", y - 80);
          await ctx.wait(200);
          ctx.expect(ctx.app.store.project.solids.find((q) => q.id === s.id).height > h0, "push/pull did not raise the mass");
        },
        practice: { todo: T("3D 에서 '밀기/끌기'를 고르고 매스 윗면을 위로 끄세요.", "In 3D pick Push/Pull and drag the top of the mass upwards."), setup: (ctx) => { ctx.app.tutH = (ctx.app.store.project.solids[0] || {}).height; }, check: (ctx) => (ctx.app.store.project.solids[0] || {}).height > ctx.app.tutH, targets: () => [{ el: '[data-tool3d="pushpull"]' }] } },
      { title: T("페인트 통", "Paint bucket"), text: T("페인트 통으로 왼쪽에서 재료를 고르고 벽, 바닥, 지붕, 매스, 가구를 클릭해 칠합니다.", "With the Paint bucket pick a material on the left and click walls, floors, roofs, masses or furniture."),
        run: async (ctx) => {
          await ctx.click('[data-tool3d="paint"]');
          await ctx.click('.swatch[data-material="brick"]');
          const s = ctx.app.store.project.solids[0];
          await ctx.click3d(14000, 2500, Math.min(1500, s.height / 2));
          ctx.expect(ctx.app.store.project.solids[0].material === "brick", "not painted");
        },
        practice: { todo: T("페인트 통, '벽돌'을 고르고 매스의 옆면을 클릭하세요.", "Paint bucket, choose Brick and click a side of the mass."), check: (ctx) => (ctx.app.store.project.solids || []).some((s) => s.material === "brick"), targets: () => [{ el: '[data-tool3d="paint"]' }] } },
      { title: T("줄자", "Tape measure"), text: T("줄자는 3D 모델 위 두 점 사이의 거리를 표시합니다. Esc 로 지웁니다.", "The tape measure shows the distance between two points on the model. Esc clears it."),
        run: async (ctx) => {
          await ctx.click('[data-tool3d="tape"]');
          const s = ctx.app.store.project.solids[0];
          await ctx.click3d(14000, 1200, 200);
          await ctx.click3d(14000, 3800, 200);
          ctx.expect(ctx.app.v3d.viewer.measureCount() >= 1, "no measurement");
          ctx.expect(s, "no mass");
        },
        practice: { todo: T("줄자를 고르고 모델 위 두 점을 클릭하세요.", "Pick the tape measure and click two points on the model."), check: (ctx) => ctx.app.v3d.viewer && ctx.app.v3d.viewer.measureCount() >= 1, targets: () => [{ el: '[data-tool3d="tape"]' }] } },
      { title: T("장면 저장과 재생", "Scenes"), text: T("장면은 카메라와 스타일, 단면을 저장합니다. + 로 추가하고 ▶ 로 장면을 차례로 재생합니다.", "A scene stores the camera, style and section. + adds one, ▶ plays them in turn."),
        run: async (ctx) => {
          await ctx.key("Escape");
          await ctx.click('[data-scene-add="1"]');
          ctx.app.v3d.viewer.setView("front");
          await ctx.wait(600);
          await ctx.click('[data-scene-add="1"]');
          ctx.expect(ctx.p.scenes.length === 2, "scenes not saved");
          await ctx.click(`[data-scene="${ctx.p.scenes[0].id}"]`);
        },
        practice: { todo: T("왼쪽 '장면' 패널의 + 를 두 번(시점을 바꿔 가며) 누르세요.", "Press + in the Scenes panel twice, changing the view in between."), check: (ctx) => ctx.p.scenes.length >= 2, targets: () => [{ el: '[data-scene-add="1"]' }] } },
    ],
  },
  // ---------------------------------------------------------------- 11
  {
    title: T("BIM: 벽 타입, 속성, 단계", "BIM: wall types, properties, phases"),
    steps: [
      { title: T("벽 타입", "Wall types"), text: T("BIM → 벽 타입… 에서 재료 층(마감·단열·구조)으로 이루어진 벽 타입을 만들고 고칩니다. 두께는 층의 합입니다.", "BIM → Wall types… defines layered walls (finish, insulation, structure); the thickness is the sum of the layers."),
        run: async (ctx) => { await ctx.key("F2"); await ctx.command("build.wallTypes"); await ctx.waitFor(() => ctx.modal()); await ctx.confirm(); },
        practice: { todo: T("BIM → 벽 타입… 을 열어 보고 확인.", "Open BIM → Wall types… and press OK."), check: (ctx, mem) => [...mem.modals].some((m) => m.includes(ctx.app.t("Wall types"))) && !ctx.modal() } },
      { title: T("벽에 타입 지정", "Give a wall a type"), text: T("벽을 선택하고 '벽 타입'을 고르면 두께와 레이어가 바뀌고, 평면에는 층 경계선이 그려집니다.", "Select a wall and choose its Wall type: thickness and layers follow, and the plan draws the layer lines."),
        run: async (ctx) => { await ctx.click(`.page-tab[data-level="${ctx.p.levels[0].id}"]`); await ctx.clickAt(4400, 0); const sel = await ctx.waitFor(fieldEl(ctx, "Wall type")); await ctx.select(sel, "ext-brick-300"); ctx.expect(wallAtPt(ctx, 4400, 0).type === "ext-brick-300" && wallAtPt(ctx, 4400, 0).thickness === 300, "type not applied"); },
        practice: { todo: T("위쪽 벽(창문이 없는 곳)을 클릭하고 '벽 타입'에서 벽돌 벽을 고르세요.", "Click the top wall (away from the windows) and choose the brick cavity wall type."), check: (ctx) => walls(ctx).some((w) => w.type), targets: () => [{ x: 4400, y: 0 }] } },
      { title: T("BIM 속성", "BIM properties"), text: T("BIM → 선택 요소의 BIM 속성… 에서 내화 등급, 열관류율 같은 속성을 붙입니다. IFC 의 속성 세트로 내보내집니다.", "BIM → BIM properties attaches data such as fire rating or U-value; it is exported as an IFC property set."),
        run: async (ctx) => {
          await ctx.command("build.bimProps");
          await ctx.waitFor(() => ctx.modal());
          const add = [...document.querySelectorAll(".modal .btn")].find((b) => b.textContent.includes(ctx.app.t("Add property")));
          await ctx.click(add);
          const inputs = document.querySelectorAll(".modal table input");
          await ctx.type(inputs[inputs.length - 2], "FireRating");
          await ctx.type(inputs[inputs.length - 1], "REI 60");
          await ctx.confirm();
          ctx.expect(wallAtPt(ctx, 4400, 0).props && wallAtPt(ctx, 4400, 0).props.FireRating === "REI 60", "property missing");
        },
        practice: { todo: T("벽을 선택한 상태에서 BIM 속성 창에 FireRating = REI 60 을 넣으세요.", "With the wall selected, add FireRating = REI 60 in BIM properties."), check: (ctx) => walls(ctx).some((w) => w.props && Object.keys(w.props).length) } },
      { title: T("시공 단계", "Phases"), text: T("요소마다 단계(기존·신축·철거)를 정합니다. 기존 벽은 옅게, 철거는 빨간 점선으로 보이고, 보기 → 단계 에서 '기존 건물'이나 '새 설계'만 볼 수 있습니다.", "Every element has a phase (existing, new, demolish): existing walls show lighter, demolition red dashed, and View → Phases shows the building before or after the works."),
        run: async (ctx) => { await ctx.clickAt(5000, 4000); const sel = await ctx.waitFor(fieldEl(ctx, "Phase")); await ctx.select(sel, "demolish"); ctx.expect(walls(ctx).some((w) => w.phase === "demolish"), "phase not set"); await ctx.command("view.phaseNew"); await ctx.wait(300); await ctx.command("view.phaseAll"); await ctx.key("z", { ctrl: true }); },
        practice: { todo: T("가운데 벽을 선택하고 '단계'를 '철거'로 바꿔 보세요.", "Select the middle wall and set its Phase to Demolish."), check: (ctx) => ctx.app.store.history().undo.length > 0 && (walls(ctx).some((w) => w.phase === "demolish") || ctx.app.store.redoStack.length > 0), targets: () => [{ x: 5000, y: 4000 }] } },
      { title: T("비슷한 요소 선택", "Select similar"), text: T("BIM → 비슷한 요소 선택 은 같은 종류·타입의 요소를 한 번에 고릅니다.", "BIM → Select similar picks every element of the same kind and type."),
        run: async (ctx) => { await ctx.clickAt(9000, 3000); await ctx.command("build.selectSimilar"); ctx.expect(ctx.app.plan.sel.size >= 2, "nothing similar"); },
        practice: { todo: T("벽을 하나 선택하고 BIM → 비슷한 요소 선택.", "Select a wall, then BIM → Select similar."), check: (ctx) => ctx.app.plan.sel.size >= 2 } },
      { title: T("집계표와 공사비", "Schedules and cost"), text: T("빌드 → 집계와 수량… 은 방, 문·창, 벽 타입, 층별 면적과 공사비 산출(단가 편집 가능)을 보여 주고 CSV 로 저장합니다.", "Build → Schedules and quantities lists rooms, doors and windows, wall types, level areas and a cost estimate with editable unit prices, and saves CSV."),
        run: async (ctx) => { await ctx.command("build.schedules"); await ctx.waitFor(() => ctx.modal()); const tab = [...document.querySelectorAll(".modal .tab")].find((b) => b.textContent === ctx.app.t("Cost estimate")); await ctx.click(tab); await ctx.wait(400); await closeAll(ctx); },
        practice: { todo: T("집계와 수량 창을 열어 '공사비' 탭을 보세요.", "Open Schedules and quantities and look at the Cost estimate tab."), check: (ctx, mem) => [...mem.modals].some((m) => m.includes(ctx.app.t("Schedules and quantities"))) } },
    ],
  },
  // ---------------------------------------------------------------- 12
  {
    title: T("모델 검사", "Model check"),
    steps: [
      { title: T("문제 만들어 보기", "Make a mistake"), text: T("두께보다 짧은 벽처럼 이상한 것을 그리면 모델 검사가 바로 찾아냅니다.", "Draw something odd, like a wall shorter than its thickness, and the model check finds it at once."),
        run: async (ctx) => { ctx.app.settings.snap = false; await ctx.key("w"); await ctx.clickAt(1000, 4000); await ctx.clickAt(1080, 4000); await ctx.key("Escape"); ctx.app.settings.snap = true; ctx.expect(walls(ctx).some((w) => Math.hypot(w.x2 - w.x1, w.y2 - w.y1) < 100), "short wall missing"); },
        practice: { todo: T("아주 짧은 벽을 하나 그려 보세요.", "Draw a very short wall."), check: (ctx) => walls(ctx).some((w) => Math.hypot(w.x2 - w.x1, w.y2 - w.y1) < 150) } },
      { title: T("검사 실행", "Run the check"), text: T("F5 는 모델 검사입니다: 벽 겹침, 개구부, 문 열림 방해, 간섭(Clash), 문 없는 방 등. 오른쪽 목록을 누르면 그곳으로 갑니다.", "F5 runs the model check: overlapping walls, openings, blocked doors, clashes, rooms without doors… Click an entry on the right to go there."),
        run: async (ctx) => { await ctx.key("F5"); ctx.expect(ctx.app.checkIssues.some((i) => i.code === "wall-short"), "issue not found"); const row = await ctx.waitFor(() => document.querySelector("#right-panel .issue")); await ctx.click(row); },
        practice: { todo: T("F5 를 누르고 오른쪽 문제 목록을 클릭하세요.", "Press F5 and click the problem on the right."), check: (ctx) => ctx.app.checkIssues.some((i) => i.code === "wall-short") } },
      { title: T("고치기", "Fix it"), text: T("문제의 벽을 지우거나 Ctrl+Z 로 되돌리면 경고가 사라집니다.", "Delete the wall or undo with Ctrl+Z and the warning goes away."),
        run: async (ctx) => { await ctx.key("z", { ctrl: true }); ctx.app.runCheck(false); ctx.expect(!ctx.app.checkIssues.some((i) => i.code === "wall-short"), "still there"); },
        practice: { todo: T("Ctrl+Z 로 짧은 벽을 없애세요.", "Press Ctrl+Z to remove the short wall."), check: (ctx) => !walls(ctx).some((w) => Math.hypot(w.x2 - w.x1, w.y2 - w.y1) < 150) } },
    ],
  },
  // ---------------------------------------------------------------- 13
  {
    title: T("3D 보기 자세히", "The 3D view in depth"),
    steps: [
      { title: T("시점", "Views"), text: T("도구 모음의 표준 시점 단추 ▾ 에서 등각, 위, 정면, 배면, 좌측면, 우측면, 조감도를 고릅니다(또는 1–7 키). 단추를 누르면 마지막에 고른 시점으로 갑니다.", "The Standard views button ▾ on the toolbar lists Isometric, Top, Front, Rear, Left side, Right side and Bird's eye (or keys 1–7); the button itself goes to the last one chosen."),
        run: async (ctx) => { await ctx.key("F3"); await ctx.waitFor(() => ctx.app.v3d.viewer, 8000); await ctx.key("2"); await ctx.wait(500); await ctx.key("1"); await ctx.wait(500); },
        practice: { todo: T("표준 시점 ▾ 에서 '위'를 고른 다음 '등각'을 고르세요.", "From Standard views ▾ choose Top, then Isometric."), check: (ctx) => ctx.app.tab === "3d", targets: () => [{ el: '#toolbar [data-view="menu"]' }] } },
      { title: T("표현 스타일", "Render styles"), text: T("사실적, 흰색 모형, 선 그림(입면도 느낌), X-레이 스타일이 있습니다.", "Realistic, white model, line drawing (like an elevation) and x-ray."),
        run: async (ctx) => {
          const pick = async (label) => { await ctx.click('#toolbar [data-style="menu"]'); const it = await ctx.waitFor(() => [...document.querySelectorAll(".ctx-menu .menu-item")].find((m) => m.textContent.includes(label)), 3000); await ctx.click(it); };
          await pick(ctx.L(T("선 그림", "Line drawing"))); ctx.expect(ctx.app.v3d.opts.style === "lines", "style unchanged"); await ctx.wait(400); await pick(ctx.L(T("사실적", "Realistic")));
        },
        practice: { todo: T("도구 모음의 렌더 스타일 ▾ 에서 '선 그림'을 고르세요.", "From Render style ▾ on the toolbar choose Line drawing."), check: (ctx) => ctx.app.v3d.opts.style !== "realistic", targets: () => [{ el: '#toolbar [data-style="menu"]' }] } },
      { title: T("단면", "Section cut"), text: T("단면 버튼(X)은 현재 층 바닥 1.2 m 위를 잘라 3D 평면을 보여 줍니다. 높이는 왼쪽에서 바꿉니다.", "The section button (X) cuts 1.2 m above the current floor for a 3D plan; set the height on the left."),
        run: async (ctx) => { await ctx.key("x"); ctx.expect(ctx.app.v3d.opts.section !== null, "no section"); await ctx.wait(400); await ctx.key("x"); },
        practice: { todo: T("X 를 눌러 단면을 켜고 다시 끄세요.", "Press X to cut and again to remove it."), check: (ctx) => ctx.app.store && true } },
      { title: T("직교 투영과 입면", "Orthographic elevations"), text: T("O 는 직교 투영입니다. 도구 모음의 정면 입면 단추는 직교 + 선 그림으로 입면도를 만듭니다.", "O switches to orthographic. The Front elevation button on the toolbar combines orthographic and line drawing."),
        run: async (ctx) => { await ctx.command("v3d.front"); await ctx.wait(500); ctx.expect(ctx.app.v3d.opts.ortho, "not orthographic"); await ctx.key("o"); ctx.app.v3d.setOpt("style", "realistic"); await ctx.key("1"); },
        practice: { todo: T("도구 모음의 정면 입면 단추를 누르세요.", "Press the Front elevation button on the toolbar."), check: (ctx) => ctx.app.v3d.opts.ortho, targets: () => [{ el: '#toolbar [data-cmd="v3d.front"]' }] } },
      { title: T("걸어서 둘러보기", "Walk through"), text: T("V 는 1인칭 걷기입니다: W/A/S/D 로 걷고 끌어서 둘러보며, Q/E 로 내려가고 올라갑니다. Esc 로 나옵니다.", "V walks in first person: W/A/S/D to move, drag to look, Q/E down/up. Esc leaves."),
        run: async (ctx) => { await ctx.key("v"); ctx.expect(ctx.app.v3d.opts.navMode === "walk", "not walking"); await ctx.wait(600); await ctx.key("Escape"); ctx.expect(ctx.app.v3d.opts.navMode === "orbit", "still walking"); },
        practice: { todo: T("V 를 눌러 걸어 보고 Esc.", "Press V, look around, then Esc."), check: (ctx) => ctx.app.v3d.opts.navMode === "walk" } },
      { title: T("일조 분석", "Sun study"), text: T("왼쪽 '일조' 패널에서 대지 위치와 날짜·시각으로 해의 위치와 그림자를 계산합니다.", "The Sun study panel places the sun from the site location, date and time."),
        run: async (ctx) => {
          const box = [...document.querySelectorAll("#left-panel .check")].find((l) => l.textContent.includes(ctx.app.t("Sun from the site, date and time")));
          await ctx.click(box.querySelector("input"));
          ctx.expect(ctx.app.settings.sunStudy, "sun study off");
          await ctx.click([...document.querySelectorAll("#left-panel .check")].find((l) => l.textContent.includes(ctx.app.t("Sun from the site, date and time"))).querySelector("input"));
        },
        practice: { todo: T("왼쪽의 '대지·날짜·시각으로 해 위치'를 켜 보세요.", "Tick Sun from the site, date and time on the left."), check: (ctx) => !!ctx.app.settings.sunStudy } },
      { title: T("3D 에서 선택", "Pick in 3D"), text: T("3D 에서 벽이나 가구를 클릭하면 평면에서도 선택됩니다(그 반대도).", "Clicking a wall or piece of furniture in 3D selects it in the plan as well (and back)."),
        run: async (ctx) => { await ctx.click('[data-nav="orbit"]'); await ctx.click3d(9000, 3000, 1500); await ctx.wait(300); await ctx.key("F2"); ctx.expect(ctx.app.plan.sel.size >= 1, "nothing selected from 3D"); },
        practice: { todo: T("3D 에서 벽을 클릭하고 F2 로 평면을 보세요.", "Click a wall in 3D, then press F2."), check: (ctx) => ctx.app.plan.sel.size >= 1 } },
    ],
  },
  // ---------------------------------------------------------------- 14
  {
    title: T("가져오기와 내보내기", "Import and export"),
    steps: [
      { title: T("DXF 가져오기", "Import a DXF"), text: T("파일 → 가져오기(Ctrl+I) 는 DXF, IFC, SVG, 3D 모델, 이미지를 읽습니다. DXF 는 CAD 레이어로 들어와 그 위에 벽을 따라 그릴 수 있습니다.", "File → Import (Ctrl+I) reads DXF, IFC, SVG, 3D models and images. A DXF comes in on CAD layers so you can trace walls over it."),
        run: async (ctx) => {
          const { exportDxf } = await import("../io/dxf.js");
          const text = exportDxf(ctx.p, { level: ctx.p.levels[0].id });
          const bytes = new TextEncoder().encode(text);
          const before = ctx.p.drawings.length;
          const pr = ctx.app.openFileObject({ name: "tutorial-plan.dxf", bytes, text });
          await ctx.waitFor(() => ctx.modal());
          await ctx.confirm();
          await pr;
          ctx.expect(ctx.app.store.project.drawings.length > before, "DXF not imported");
        },
        practice: { todo: T("파일 → 가져오기 로 DXF 파일을 하나 열어 보세요 (없으면 '건너뛰기').", "Import any DXF with File → Import (or press Skip)."), check: (ctx) => ctx.p.drawings.length > 3 } },
      { title: T("3D 모델 가져오기", "Import a 3D model"), text: T("OBJ, FBX, GLB/glTF, STL, DAE, 3MF, 3DS, PLY 모델은 가구처럼 배치됩니다. 단위와 위쪽 축은 자동 판단됩니다.", "OBJ, FBX, GLB/glTF, STL, DAE, 3MF, 3DS and PLY models become furniture. Units and the up axis are detected."),
        run: async (ctx) => {
          const obj = ["o box", "v 0 0 0", "v 60 0 0", "v 60 0 60", "v 0 0 60", "v 0 75 0", "v 60 75 0", "v 60 75 60", "v 0 75 60", "f 1 2 3 4", "f 5 8 7 6", "f 1 5 6 2", "f 2 6 7 3", "f 3 7 8 4", "f 4 8 5 1"].join("\n");
          const n = ctx.p.models.length;
          const pr = ctx.app.openFileObject({ name: "stool.obj", bytes: new TextEncoder().encode(obj), text: obj });
          await ctx.waitFor(() => ctx.modal());
          await ctx.confirm();
          await pr;
          ctx.expect(ctx.app.store.project.models.length === n + 1, "model not imported");
        },
        practice: { todo: T("3D 모델 파일을 가져와 보세요 (없으면 '건너뛰기').", "Import a 3D model file (or press Skip)."), check: (ctx) => ctx.p.models.length > 0 } },
      { title: T("이미지 밑그림", "Image underlay"), text: T("스캔한 도면 이미지를 밑그림으로 깔고 축척(폭)을 맞춘 뒤 따라 그립니다.", "Put a scanned plan underneath as an underlay, set its width to scale and trace it."),
        run: async (ctx) => {
          const c = document.createElement("canvas");
          c.width = 64; c.height = 48;
          const g = c.getContext("2d");
          g.fillStyle = "#fff"; g.fillRect(0, 0, 64, 48); g.strokeStyle = "#000"; g.strokeRect(4, 4, 56, 40);
          const b64 = c.toDataURL("image/png").split(",")[1];
          const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
          const pr = ctx.app.openFileObject({ name: "scan.png", bytes, text: "" });
          await ctx.waitFor(() => ctx.modal());
          await ctx.confirm();
          await pr;
          ctx.expect(ctx.app.store.project.underlays.length >= 1, "underlay missing");
        },
        practice: { todo: T("이미지 파일을 가져와 밑그림으로 놓아 보세요 (없으면 '건너뛰기').", "Import an image as an underlay (or press Skip)."), check: (ctx) => ctx.p.underlays.length > 0 } },
      { title: T("3D 내보내기", "3D export"), text: T("GLB, glTF, OBJ+MTL, Collada(DAE), STL, 3MF, PLY, USDZ 로 내보냅니다. 스케치업·블렌더·3D 프린터·AR 에서 열 수 있습니다.", "Export GLB, glTF, OBJ+MTL, Collada (DAE), STL, 3MF, PLY or USDZ for SketchUp, Blender, 3D printing or AR."),
        run: async (ctx) => { await ctx.command("file.export3d"); await ctx.waitFor(() => ctx.modal()); await closeAll(ctx); },
        practice: { todo: T("파일 → 내보내기 → 3D 모델 창을 열어 형식을 살펴보세요.", "Open the 3D export window and look at the formats."), check: (ctx, mem) => [...mem.modals].some((m) => m.includes(ctx.app.t("Export 3D model"))) } },
      { title: T("DXF·IFC 내보내기", "DXF and IFC export"), text: T("DXF 는 AutoCAD 표준 레이어(A-WALL, A-DOOR …)로, IFC 는 IFC4/IFC2X3 BIM 모델(벽 타입, 속성, 단계, 그리드 포함)로 내보냅니다.", "DXF uses standard AutoCAD layers (A-WALL, A-DOOR …); IFC writes an IFC4 / IFC2X3 BIM model with wall types, properties, phases and grids."),
        run: async (ctx) => { await ctx.command("file.exportIfc"); await ctx.waitFor(() => ctx.modal()); await closeAll(ctx); await ctx.command("file.exportDxf"); await ctx.waitFor(() => ctx.modal()); await closeAll(ctx); },
        practice: { todo: T("BIM → IFC 내보내기 창을 열어 보세요.", "Open BIM → Export IFC."), check: (ctx, mem) => [...mem.modals].some((m) => m.includes("IFC")) } },
      { title: T("인쇄와 PDF", "Print and PDF"), text: T("Ctrl+P 는 인쇄 창을 엽니다. 왼쪽에서 프린터·매수·용지·방향·여백·축척(1:50, 1:100 …)·인쇄할 층과 표제란·머리글/바닥글을 정하면 오른쪽 미리 보기에 실제 시트가 바로 바뀌어 보입니다. [인쇄] 를 누르면 다른 창 없이 곧바로 인쇄되고, PDF·SVG 로도 저장할 수 있습니다.", "Ctrl+P opens the print window. Choose printer, copies, paper, orientation, margins, scale (1:50, 1:100 …), levels, title block and header/footer on the left and the preview on the right shows the real sheets at once. Print prints straight away with no further dialog; PDF and SVG are a click away too."),
        run: async (ctx) => { await ctx.command("file.print"); await ctx.waitFor(() => document.querySelector(".print-stage svg"), 5000); await ctx.wait(500); await closeAll(ctx); },
        practice: { todo: T("Ctrl+P 로 인쇄 미리 보기를 열어 보세요.", "Open the print preview with Ctrl+P."), check: (ctx, mem) => [...mem.modals].some((m) => m.includes(ctx.app.t("Print"))) } },
    ],
  },
  // ---------------------------------------------------------------- 15
  {
    title: T("설정과 화면 꾸미기", "Settings and appearance"),
    steps: [
      { title: T("설정", "Settings"), text: T("설정(Ctrl+,)에서 단위, 격자, 스냅, 벽 표현, 3D, 출력 등을 정합니다.", "Settings (Ctrl+,) holds units, grid, snapping, wall drawing, 3D and output options."),
        run: async (ctx) => { await ctx.key("F2"); await ctx.command("tools.settings"); await ctx.waitFor(() => ctx.modal()); for (const tab of [...document.querySelectorAll(".modal .tab")].slice(0, 6)) { await ctx.click(tab); await ctx.wait(150); } await closeAll(ctx); },
        practice: { todo: T("설정 창을 열어 탭들을 둘러보세요.", "Open Settings and look through the tabs."), check: (ctx, mem) => [...mem.modals].some((m) => m.includes(ctx.app.t("Settings"))) } },
      { title: T("테마", "Themes"), text: T("팔레트 버튼은 무작위 테마, 옆의 ▾ 는 다크·라이트 40가지 테마와 사용자 테마 목록입니다.", "The palette button picks a random theme; the ▾ next to it lists 40 dark and light themes and your own."),
        run: async (ctx) => { const before = ctx.app.settings.theme; await ctx.click("#title-right .split-btn .icon-btn"); ctx.expect(ctx.app.settings.theme !== before, "theme unchanged"); ctx.app.setSetting("theme", before); },
        practice: { todo: T("제목 표시줄 오른쪽, 최소화 단추 왼쪽의 팔레트 버튼을 눌러 보세요.", "Press the palette button in the title bar, left of the minimise button."), check: (ctx) => true, targets: () => [{ el: "#title-right .split-btn .icon-btn" }] } },
      { title: T("단위", "Units"), text: T("상태 표시줄의 단위 단추는 mm → cm → m → ft 로 바뀝니다.", "The units button in the status bar cycles mm → cm → m → ft."),
        run: async (ctx) => { const u = ctx.app.settings.units || "mm"; const btn = [...document.querySelectorAll("#statusbar button.cell")].find((b) => b.textContent.trim() === u); await ctx.click(btn); ctx.expect((ctx.app.settings.units || "mm") !== u, "units unchanged"); ctx.app.setSetting("units", u); },
        practice: { todo: T("상태 표시줄 오른쪽의 'mm' 를 눌러 보세요.", "Click 'mm' at the right of the status bar."), check: (ctx) => true } },
      { title: T("상태 표시줄과 창 크기", "Status bar and window size"), text: T("아래쪽 상태 표시줄은 커서 좌표, 레벨, 격자, 스냅, 직교, 축척, 단위, 선택 개수와 검사 결과를 보여 주고(3D 에서는 탐색 방식·투영·단면·스타일·삼각형 수), 대부분 눌러서 바꿀 수 있습니다. 오른쪽 아래 모서리의 점 표시를 끌면 창 크기가 바뀝니다.", "The status bar along the bottom shows the cursor position, level, grid, snap, ortho, scale, units, selection and the model check (in 3D: navigation, projection, section, style and triangle count); most cells can be clicked. Drag the dotted grip in the bottom-right corner to resize the window."),
        run: async (ctx) => {
          await ctx.key("F2");
          ctx.spot("#statusbar"); await ctx.wait(900);
          ctx.expect(document.querySelectorAll("#status-cells .cell").length >= 5, "status bar is empty");
          const grip = document.getElementById("size-grip");
          if (grip && getComputedStyle(grip).display !== "none") { ctx.spot("#size-grip"); await ctx.wait(900); }
        },
        practice: { todo: T("상태 표시줄을 살펴보고 오른쪽 아래 모서리를 끌어 창 크기를 바꿔 보세요.", "Look along the status bar and drag the bottom-right corner to resize the window."), check: () => true, targets: () => [{ el: "#size-grip" }] } },
      { title: T("패널 접기", "Collapse the side panels"), text: T("Ctrl+1 / Ctrl+2(또는 패널 제목의 < > 단추)로 좌우 패널을 접습니다. 접힌 패널은 아이콘과 제목으로 남아 다시 누르면 펼쳐집니다.", "Ctrl+1 / Ctrl+2 (or the < > on a panel title) collapse the side panels; a collapsed panel stays as an icon and title you click to open again."),
        run: async (ctx) => { await ctx.key("1", { ctrl: true }); ctx.expect(document.querySelector('#left-panel .side-rail'), "no rail"); await ctx.click('#left-panel .side-rail'); ctx.expect(ctx.app.settings.showLeft, "panel not reopened"); },
        practice: { todo: T("Ctrl+1 로 왼쪽 패널을 접었다가 레일을 눌러 펼치세요.", "Press Ctrl+1, then click the rail to open the panel again."), check: (ctx) => !!document.querySelector('#left-panel .side-rail') || ctx.app.settings.showLeft } },
    ],
  },
  // ---------------------------------------------------------------- 16
  {
    title: T("예제로 고급 기능 익히기", "Advanced features in the samples"), fresh: true,
    steps: [
      { title: T("리모델링: 단계와 벽 타입", "Renovation: phases and wall types"), text: T("리모델링 예제는 기존·철거·신축 단계, 다층 벽 타입, 그리드, 실 번호와 공사비를 담고 있습니다. 보기 → 단계 로 전후를 비교하세요.", "The renovation sample has existing, demolished and new work, layered wall types, a grid, room numbers and a cost estimate. Compare before and after with View → Phases."),
        run: async (ctx) => { await sampleOpen(ctx, "06-renovation-bim.myarch", ctx.L(T("리모델링", "Renovation"))); await ctx.command("view.phaseExisting"); await ctx.wait(500); await ctx.command("view.phaseNew"); await ctx.wait(500); await ctx.command("view.phaseAll"); ctx.expect(ctx.p.walls.some((w) => w.phase === "demolish"), "wrong sample"); },
        practice: { todo: T("리모델링 예제를 열고 보기 → 단계 를 바꿔 보세요.", "Open the renovation sample and switch View → Phases."), check: (ctx) => ctx.app.store.fileName === "06-renovation-bim.myarch" } },
      { title: T("매스 스터디: 장면 재생", "Massing study: play the scenes"), text: T("매스 예제는 포디움·타워·원형 매스와 저장된 장면을 갖고 있습니다. 장면을 눌러 이동하고 ▶ 로 재생합니다.", "The massing sample has a podium, towers, a rotunda and saved scenes. Click a scene to fly there, ▶ plays them."),
        run: async (ctx) => { await sampleOpen(ctx, "07-massing-study.myarch", ctx.L(T("매스", "Massing"))); await ctx.key("F3"); await ctx.waitFor(() => ctx.app.v3d.viewer, 8000); ctx.app.v3d.syncModel(); const row = await ctx.waitFor(() => document.querySelector("[data-scene]")); await ctx.click(row); await ctx.wait(1000); ctx.expect(ctx.p.solids.length >= 4, "wrong sample"); },
        practice: { todo: T("매스 예제를 열고 3D 의 장면 목록을 눌러 보세요.", "Open the massing sample and click a scene in 3D."), check: (ctx) => ctx.app.store.fileName === "07-massing-study.myarch" && ctx.app.tab === "3d" } },
      { title: T("공동주택: 3개 층과 단면", "Apartment block: three storeys and a section"), text: T("3층 공동주택 예제의 '2F 단면' 장면은 2층을 잘라 보여 줍니다. 레벨 체크로 층을 숨길 수도 있습니다.", "In the apartment block the '2F cut' scene slices through the second floor; the level checkboxes hide storeys."),
        run: async (ctx) => { await ctx.key("F2"); await sampleOpen(ctx, "08-apartment-block.myarch", ctx.L(T("공동주택", "Apartment"))); await ctx.key("F3"); await ctx.waitFor(() => ctx.app.v3d.viewer, 8000); ctx.app.v3d.syncModel(); const rows = await ctx.waitFor(() => document.querySelectorAll("[data-scene]").length > 1 && document.querySelectorAll("[data-scene]")); await ctx.click(rows[1]); await ctx.wait(800); ctx.expect(ctx.app.v3d.opts.section !== null, "section scene not applied"); },
        practice: { todo: T("공동주택 예제의 '2F 단면' 장면을 누르세요.", "Open the apartment block and click the '2F cut' scene."), check: (ctx) => ctx.app.store.fileName === "08-apartment-block.myarch" && ctx.app.v3d.opts.section !== null } },
      { title: T("DXF 따라 그리기", "Tracing a DXF"), text: T("CAD 따라 그리기 예제는 가져온 AutoCAD 도면의 레이어를 보여 줍니다. 왼쪽 CAD 레이어 목록에서 눈 아이콘으로 켜고 끕니다.", "The tracing sample shows the layers of an imported AutoCAD drawing; the eye icons in the CAD layers list turn them on and off."),
        run: async (ctx) => { await ctx.key("F2"); await sampleOpen(ctx, "09-cad-tracing.myarch", "DXF"); const eye = await ctx.waitFor(() => document.querySelector("#left-panel .layer-row .eye")); await ctx.click(eye); ctx.expect(ctx.p.layers.some((l) => l.visible === false), "layer not hidden"); },
        practice: { todo: T("DXF 따라 그리기 예제를 열고 CAD 레이어 하나를 숨겨 보세요.", "Open the DXF tracing sample and hide a CAD layer."), check: (ctx) => ctx.app.store.fileName === "09-cad-tracing.myarch" } },
    ],
  },
  // ---------------------------------------------------------------- 17
  {
    title: T("단면도·입면도·시트", "Sections, elevations and sheets"), fresh: true,
    steps: [
      { title: T("단면선 그리기", "Draw a section line"), text: T("평면 도구 모음의 뷰 ▾ → 단면도(또는 도면 메뉴)를 고르고 단면선의 시작과 끝을 클릭합니다. 그린 방향의 왼쪽을 바라보는 단면 기호가 생기고, 단면도는 모델에서 바로 만들어집니다.", "Pick views ▾ → Section on the plan tool bar (or the Drawings menu) and click the start and the end of the section line. A section marker looking to the left of the line appears; the section is generated from the model."),
        run: async (ctx) => {
          await sampleOpen(ctx, "03-two-storey-house.myarch", ctx.L(T("2층 주택", "Two-storey house")));
          await ctx.key("F2");
          const before = ctx.p.views.filter((v) => v.kind === "section").length;
          await ctx.command("views.section");
          await ctx.clickAt(-1500, 2500);
          await ctx.clickAt(11500, 2500);
          ctx.expect(ctx.p.views.filter((v) => v.kind === "section").length === before + 1, "no section made");
        },
        practice: { todo: T("단면도 도구로 건물을 가로지르는 선을 그려 보세요.", "Draw a section line across the building with the Section tool."), check: (ctx, mem) => ctx.p.views.filter((v) => v.kind === "section").length > (mem.sections ?? (mem.sections = ctx.p.views.filter((v) => v.kind === "section").length)) } },
      { title: T("단면도 열기", "Open the section"), text: T("단면 기호의 머리를 더블클릭하면 뷰와 시트 탭(F6)에 단면도가 열립니다. 잘린 벽·슬래브는 재료 해치로 채워지고, 그 너머는 숨은선을 지운 투영선, 레벨선과 그리드 번호가 자동으로 붙습니다.", "Double-click the head of the section marker: the section opens in the Views & sheets tab (F6). Cut walls and slabs are filled with their material hatch, what lies beyond is drawn with hidden lines removed, and levels and grid heads are added."),
        run: async (ctx) => {
          const v = ctx.p.views.filter((x) => x.kind === "section").at(-1);
          const S = ctx.app.views.ext.scale();
          await ctx.clickAt(v.line.x2 + 4 * S, v.line.y2, { dbl: true });
          await ctx.waitFor(() => ctx.app.tab === "views" && ctx.app.views.tab.current === v.id, 4000);
          await ctx.wait(800);
        },
        practice: { todo: T("단면 기호 머리를 더블클릭하세요 (또는 프로젝트 탐색기에서 누르세요).", "Double-click the section head (or click it in the Project Browser)."), check: (ctx) => ctx.app.tab === "views" && !!ctx.app.views.tab.current } },
      { title: T("외부 입면도", "Exterior elevations"), text: T("도면 → 외부 입면도는 북·남·동·서 입면도를 한 번에 만듭니다. 모두 프로젝트 탐색기의 입면도 아래에 있습니다.", "Drawings → Exterior elevations makes the north, south, east and west elevations at once; they are listed under Elevations in the Project Browser."),
        run: async (ctx) => { await ctx.command("views.extElevations"); await ctx.wait(500); ctx.expect(ctx.p.views.filter((v) => v.kind === "elevation").length >= 4, "no elevations"); },
        practice: { todo: T("도면 → 외부 입면도를 실행하세요.", "Run Drawings → Exterior elevations."), check: (ctx) => ctx.p.views.filter((v) => v.kind === "elevation").length >= 4 } },
      { title: T("시트에 배치", "Place it on a sheet"), text: T("도면 → 새 시트로 표제란이 있는 시트를 만들고, 뷰 배치…(또는 탐색기에서 끌어 놓기)로 단면도를 그 축척으로 놓습니다. 뷰포트를 끌어 옮기고, 표제란 필드는 시트 속성에서 고칩니다.", "Drawings → New sheet makes a sheet with a title block; Place view… (or dragging from the Project Browser) puts the section on it at its scale. Drag the viewport to move it; the title block fields are in the sheet properties."),
        run: async (ctx) => {
          const v = ctx.p.views.filter((x) => x.kind === "section").at(-1);
          await ctx.command("views.sheet");
          await ctx.waitFor(() => ctx.app.views.tab.isSheet(), 3000);
          await ctx.command("views.placeView");
          await ctx.pick(ctx.app.views.displayName(v.name), ctx.app.views.displayName(v.name));
          await ctx.waitFor(() => ctx.p.sheets.some((s) => s.viewports.some((vp) => vp.view === v.id)), 6000);
          await ctx.wait(600);
        },
        practice: { todo: T("새 시트를 만들고 단면도를 배치해 보세요.", "Make a new sheet and place the section on it."), check: (ctx) => ctx.p.sheets.some((s) => s.viewports.some((vp) => (ctx.p.views.find((x) => x.id === vp.view) || {}).kind === "section")) } },
      { title: T("일람표 뷰", "Schedule views"), text: T("도면 → 새 일람표…에서 범주(실, 문, 창 …)를 고르면 필드·필터·정렬·그룹·합계·계산 값이 있는 표가 뷰로 열립니다. 셀을 더블클릭해 고치면 모델이 바뀌고, 시트에 표로 놓을 수 있습니다.", "Drawings → New schedule… asks for a category (rooms, doors, windows …) and opens a table with fields, filters, sorting, grouping, totals and calculated values. Editing a cell changes the model; the table can go on a sheet."),
        run: async (ctx) => { const n = ctx.p.views.filter((v) => v.kind === "schedule").length; await ctx.command("views.schedule"); await ctx.pick(ctx.app.t("Doors"), ctx.app.t("Doors")); await ctx.waitFor(() => ctx.p.views.filter((v) => v.kind === "schedule").length > n, 3000); await ctx.waitFor(() => document.querySelector(".vt-sched"), 3000); },
        practice: { todo: T("새 일람표를 하나 만들어 보세요.", "Make a new schedule."), check: (ctx, mem) => ctx.p.views.filter((v) => v.kind === "schedule").length > (mem.schedules ?? (mem.schedules = ctx.p.views.filter((v) => v.kind === "schedule").length)) } },
      { title: T("출판", "Publish"), text: T("도면 → 시트 출판에서 시트(또는 저장한 출판 세트)를 골라 인쇄·PDF·SVG·DXF로 한꺼번에 내보냅니다. 인쇄 창은 시트마다 자기 용지 크기로 인쇄합니다.", "Drawings → Publish sheets prints or saves chosen sheets (or a saved publish set) as print, PDF, SVG or DXF in one go; the print window prints each sheet on its own paper size."),
        run: async (ctx) => { await ctx.command("views.publish"); await ctx.waitFor(() => ctx.modal(), 3000); await ctx.wait(400); await closeAll(ctx); },
        practice: { todo: T("도면 → 시트 출판 창을 열어 보세요.", "Open Drawings → Publish sheets."), check: (ctx, mem) => [...mem.modals].some((m) => m.includes(ctx.app.t("Publish sheets"))) } },
    ],
  },
  // ---------------------------------------------------------------- SketchUp tools
  {
    title: T("스케치업 도구: 면 그리기, 밀기/끌기, 컴포넌트, 태그, 단면", "SketchUp tools: draw on faces, push/pull, components, tags, sections"), fresh: true,
    steps: [
      { title: T("면 위에 사각형", "A rectangle on a face"), text: T("3D 도구 모음의 그리기 ▾ 에서 사각형(R)을 고르고 포디움 윗면에 두 모서리를 클릭합니다. 면 위에 그린 도형은 그 면의 일부가 되어 따로 밀고 당길 수 있습니다. 포인터는 끝점·중점·모서리·면·축에 붙습니다.", "Pick Rectangle (R) from Draw ▾ on the 3D toolbar and click two corners on the podium's top. A shape drawn on a face becomes a face of its own that can be pushed or pulled. The pointer snaps to endpoints, midpoints, edges, faces and the axes."),
        run: async (ctx) => {
          await sampleOpen(ctx, "07-massing-study.myarch", ctx.L(T("매스", "Massing")));
          await ctx.key("F3");
          const v = await ctx.waitFor(() => ctx.app.v3d.viewer, 8000);
          ctx.app.v3d.resetView(); // no cut or style left over from a scene
          ctx.app.v3d.syncModel();
          ctx.app.v3d.setOpt("furniture", false); // the trees would stand in front of the podium
          v.setCamera({ pos: [45, 38, 52], target: [21, 6, 16], ortho: false }, 1);
          await ctx.wait(900);
          v.three.controls.update();
          ctx.app.v3d.setTool("rect");
          // Corners well clear of the tower's edge, so they snap to the podium's top face only.
          await ctx.click3d(19800, 17300, 6000);
          await ctx.click3d(25000, 19300, 6000);
          const pod = ctx.p.solids.find((s) => s.name === "Podium");
          ctx.expect(pod.mesh && pod.mesh.f.length === 7, "the rectangle did not become a face of the podium");
        },
        practice: { todo: T("사각형 도구로 포디움 윗면에 사각형을 그리세요.", "Draw a rectangle on the podium's top with the Rectangle tool."), check: (ctx) => ctx.app.store.project.solids.some((s) => s.name === "Podium" && s.mesh && s.mesh.f.length > 6), targets: () => [{ el: '[data-skgroup-split="draw"]' }] } },
      { title: T("그 면을 끌어 올리기", "Pull that face up"), text: T("밀기/끌기로 새 면을 위로 끌면 탑이 솟습니다. 클릭-이동-클릭으로도 되고, 숫자(예: 9000)를 치고 Enter 하면 그 높이만큼 정확히 끕니다.", "Pull the new face up with Push/Pull: a tower rises. Click-move-click works too, and typing a number (say 9000) and Enter pulls exactly that far."),
        run: async (ctx) => {
          const v = ctx.app.v3d.viewer;
          await ctx.click('[data-tool3d="pushpull"]');
          const [x, y] = ctx.screenOf3d(22400, 18300, 6000);
          const c = v.three.renderer.domElement;
          const ev = (type, yy) => c.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: yy, pointerId: 1, button: 0, buttons: type === "pointerup" ? 0 : 1, pointerType: "mouse", isPrimary: true }));
          await ctx.moveTo(x, y);
          ev("pointerdown", y);
          for (let k = 1; k <= 8; k++) { ev("pointermove", y - k * 12); await ctx.wait(40); }
          ev("pointerup", y - 96);
          await ctx.wait(300);
          ctx.expect(ctx.p.solids.find((s) => s.name === "Podium").height > 6000, "the face was not pulled up");
        },
        practice: { todo: T("밀기/끌기로 새 면을 위로 끄세요.", "Pull the new face up with Push/Pull."), setup: (ctx) => { ctx.app.tutH = (ctx.app.store.project.solids.find((s) => s.name === "Podium") || {}).height; }, check: (ctx) => ((ctx.app.store.project.solids.find((s) => s.name === "Podium") || {}).height || 0) > (ctx.app.tutH || 6000), targets: () => [{ el: '[data-tool3d="pushpull"]' }] } },
      { title: T("컴포넌트로 만들기", "Make a component"), text: T("원형 매스를 고르고 솔리드 도구 ▾ → 컴포넌트 만들기… 를 누릅니다. 컴포넌트 패널의 + 로 복사본을 놓고, 하나를 두 번 클릭해 편집하면 모든 복사본이 함께 바뀝니다.", "Select the rotunda and press Solid tools ▾ → Make component…. Place copies with + on the Components panel; double-click one to edit it and every copy changes too."),
        run: async (ctx) => {
          const s = ctx.p.solids.find((x) => x.name === "Rotunda");
          ctx.app.plan.select([s.id]);
          await ctx.command("sk.makeComponent");
          const ok = await ctx.waitFor(() => document.querySelector(".modal-foot .btn.primary"), 3000);
          await ctx.click(ok);
          await ctx.wait(300);
          ctx.expect(ctx.p.components.length === 1 && ctx.p.furniture.some((f) => f.kind === "component"), "no component");
        },
        practice: { todo: T("원형 매스를 컴포넌트로 만드세요.", "Make the rotunda a component."), check: (ctx) => (ctx.app.store.project.components || []).length >= 1, targets: () => [{ el: '[data-skgroup-split="solid"]' }] } },
      { title: T("태그로 숨기기", "Hide with tags"), text: T("태그 패널의 + 로 태그를 만들고, 항목을 골라 행의 태그 아이콘으로 지정한 뒤 체크를 끄면 3D 에서 사라집니다. 장면은 어떤 태그가 보이는지 기억합니다.", "Make a tag with + on the Tags panel, select items and assign them with the tag icon on its row; untick it and they leave the 3D view. Scenes remember which tags are shown."),
        run: async (ctx) => {
          ctx.app.settings.skFold = { ...(ctx.app.settings.skFold || {}), tags: true };
          const s = ctx.p.solids.find((x) => x.name === "Tower A");
          const id = "tag-tut";
          ctx.app.store.edit("New tag", (p) => { if (!p.layers.some((l) => l.id === id)) p.layers.push({ id, name: ctx.L(T("타워", "Towers")), color: "#4e8ec8", visible: true }); });
          ctx.app.plan.select([s.id]);
          ctx.app.renderLeft();
          await ctx.click(await ctx.waitFor(() => document.querySelector(`[data-sk-tag-assign="${id}"]`), 3000));
          await ctx.click(await ctx.waitFor(() => document.querySelector(`[data-sk-tag="${id}"] input`), 3000));
          await ctx.wait(300);
          ctx.expect(ctx.app.v3d.hiddenTags.has(id) && ctx.p.solids.find((x) => x.name === "Tower A").layer === id, "tag not hidden");
          await ctx.click(document.querySelector(`[data-sk-tag="${id}"] input`));
        },
        practice: { todo: T("태그를 하나 만들어 항목을 지정하고 체크를 꺼 보세요.", "Make a tag, assign something to it and untick it."), check: (ctx) => ctx.app.v3d.hiddenTags.size > 0, targets: () => [{ el: '[data-sk-panel="tags"]' }] } },
      { title: T("단면 평면", "A section plane"), text: T("보조 도구 ▾ → 단면을 고르고 면을 클릭하면 그 면에서 모델이 잘리고 잘린 면이 채워집니다. 단면 패널에서 켜고 끄고, 옮기고, 뒤집습니다.", "Pick Construction ▾ → Section plane and click a face: the model is cut there and the cut is filled. The Section planes panel switches, moves and flips them."),
        run: async (ctx) => {
          const v = ctx.app.v3d.viewer;
          v.setCamera({ pos: [60, 45, 45], target: [15, 6, 10], ortho: false }, 1);
          await ctx.wait(500);
          v.three.controls.update();
          ctx.app.v3d.setTool("sectionplane");
          await ctx.click3d(30000, 10000, 3000);
          ctx.expect(ctx.p.sections.length === 1 && ctx.p.sections[0].active, "no section plane");
          await ctx.wait(600);
          ctx.app.store.edit("Section plane", (p) => { for (const s of p.sections) s.active = false; });
          ctx.app.v3d.setTool("sectionplane");
          ctx.app.v3d.setOpt("furniture", true);
          v.rebuild();
        },
        practice: { todo: T("단면 도구로 면을 클릭하세요.", "Click a face with the Section plane tool."), check: (ctx) => (ctx.app.store.project.sections || []).length >= 1, targets: () => [{ el: '[data-skgroup-split="construct"]' }] } },
    ],
  },
  // ---------------------------------------------------------------- 19
  {
    title: T("인테리어, 재질, 철탑과 교량", "Interiors, materials, towers and bridges"), fresh: true,
    steps: [
      { title: T("인테리어 예제", "The interior sample"), text: T("예제 '인테리어 디자인 아파트'를 엽니다. 방마다 벽 마감과 걸레받이가 있고, TV 벽처럼 벽 한쪽 면만 다른 마감인 포인트 벽도 있습니다. 평면에서는 벽 면을 따라 마감 색 띠로 보입니다.", "Open the sample Interior design apartment. Every room has its own wall finish and skirting; feature walls (like the TV wall) finish one face only. On the plan the finishes show as coloured bands along the faces."),
        run: async (ctx) => { await sampleOpen(ctx, "21-interior-design.myarch", ctx.L(T("인테리어", "Interior"))); ctx.expect(ctx.p.rooms.some((r) => r.wallFinish), "sample not opened"); },
        practice: { todo: T("파일 → 예제 열기… 에서 '인테리어 디자인 아파트'를 여세요.", "Open the Interior design apartment from File → Open sample…."), check: (ctx) => ctx.app.store.fileName === "21-interior-design.myarch" } },
      { title: T("방의 벽 마감", "A room's wall finish"), text: T("방을 선택하면 오른쪽에 '벽 마감'이 있습니다. 재질 견본 창에서 분류를 고르거나 검색해 바꾸면 그 방을 바라보는 모든 벽 면이 바뀝니다.", "Select a room: Wall finish is on the right. Pick a swatch from the material window (by group or by search) and every wall face looking into the room changes."),
        run: async (ctx) => {
          const room = ctx.p.rooms.find((r) => r.name === "Living room");
          ctx.app.plan.select([room.id]);
          const btn = await ctx.waitFor(fieldEl(ctx, "Wall finish"), 3000);
          await ctx.click(btn);
          const tile = await ctx.waitFor(() => document.querySelector('.mat-pop .mat-tile[data-mat="paint-teal"]'), 3000);
          await ctx.click(tile);
          ctx.expect(ctx.p.rooms.find((r) => r.id === room.id).wallFinish === "paint-teal", "wall finish unchanged");
        },
        practice: { todo: T("거실을 선택하고 '벽 마감'을 다른 재질로 바꾸세요.", "Select the living room and change its Wall finish."), check: (ctx) => ctx.app.store.project.rooms.some((r) => r.name === "Living room" && r.wallFinish && r.wallFinish !== "paint-greige"), targets: (ctx) => [{ el: fieldEl(ctx, "Wall finish") }] } },
      { title: T("걸레받이", "Skirting"), text: T("'걸레받이 높이'를 올리면 벽을 따라 걸레받이가 생기고 문에서 끊깁니다. 재질은 바로 아래 칸에서 고릅니다.", "Raise Skirting height: a skirting board runs along the walls and stops at the doors. Its material is just below."),
        run: async (ctx) => {
          const plus = await ctx.waitFor(plusOf(ctx.app.t("Skirting height")), 3000);
          await ctx.click(plus); await ctx.click(plus);
          ctx.expect(ctx.p.rooms.find((r) => r.name === "Living room").skirting > 80, "skirting unchanged");
        },
        practice: { todo: T("거실의 '걸레받이 높이'를 바꾸세요.", "Change the living room's Skirting height."), check: (ctx) => ctx.app.store.project.rooms.some((r) => r.name === "Living room" && r.skirting !== 80), targets: (ctx) => [{ el: plusOf(ctx.app.t("Skirting height")) }] } },
      { title: T("3D 로 보기", "See it in 3D"), text: T("F3 으로 3D 를 열고 왼쪽 '장면'의 '거실'을 누르면 눈높이에서 마감과 가구를 볼 수 있습니다.", "F3 opens 3D; the scene Living room on the left shows the finishes and furniture at eye level."),
        run: async (ctx) => {
          await ctx.key("F3");
          const v = await ctx.waitFor(() => ctx.app.v3d.viewer, 8000);
          const sc = ctx.p.scenes.find((s) => s.name === "Living room");
          if (sc) v.setCamera(sc.camera, 900);
          await ctx.wait(1500);
          ctx.expect(ctx.app.tab === "3d", "not in 3D");
        },
        practice: { todo: T("F3 을 누르세요.", "Press F3."), check: (ctx) => ctx.app.tab === "3d" } },
      { title: T("격자 철탑", "A lattice tower"), text: T("빌드 → 격자 철탑… 은 높이, 밑면·윗면 폭, 패널 수, 면 수와 가새 형식으로 철탑을 강재 부재로 만듭니다. 같은 단면의 부재는 한 번에 그려져 수천 개여도 가볍습니다.", "Build → Lattice tower… makes a tower of steel members from its height, base and top widths, panels, sides and bracing. Members of one section are drawn at once, so thousands stay light."),
        run: async (ctx) => {
          ctx.app.store.dirty = false;
          await ctx.command("file.new"); await discard(ctx);
          await ctx.waitFor(() => ctx.app.tab === "plan" && ctx.p.walls.length === 0, 5000);
          await ctx.command("build.tower");
          await ctx.confirm();
          await ctx.waitFor(() => (ctx.p.structures || []).some((s) => s.kind === "tower"), 5000);
          ctx.expect(ctx.p.members.length > 50, "no tower");
        },
        practice: { todo: T("빌드 → 격자 철탑… 으로 철탑을 만드세요.", "Make a tower with Build → Lattice tower…."), check: (ctx) => (ctx.app.store.project.structures || []).some((s) => s.kind === "tower") } },
      { title: T("교량", "A bridge"), text: T("빌드 → 교량… 에서 형식(거더, 트러스, 아치, 현수, 사장, 상로 아치, 변단면, 하프형, 엑스트라도즈드, 스트레스 리본)과 길이, 경간, 폭, 높이, 곡선 반지름, 종단 경사를 정합니다.", "Build → Bridge… sets the kind (girder, truss, arch, suspension, cable-stayed, deck arch, haunched, harp, extradosed, stress ribbon), the length, spans, width, height, curve radius and grade."),
        run: async (ctx) => {
          await ctx.command("build.bridge");
          const sel = await ctx.waitFor(() => document.querySelector(".modal .form-grid select"), 3000);
          await ctx.select(sel, "harp");
          await ctx.confirm();
          await ctx.waitFor(() => (ctx.p.structures || []).some((s) => s.kind === "bridge"), 5000);
          ctx.expect(ctx.p.structures.find((s) => s.kind === "bridge").params.type === "harp", "no harp bridge");
        },
        practice: { todo: T("빌드 → 교량… 으로 교량을 만드세요.", "Make a bridge with Build → Bridge…."), check: (ctx) => (ctx.app.store.project.structures || []).some((s) => s.kind === "bridge") } },
      { title: T("교량 고치기", "Change the bridge"), text: T("교량을 클릭하면 오른쪽에 길이, 부재 수, 강재 중량이 나옵니다. '교량 편집…'에서 형식이나 치수를 바꾸면 부재가 다시 만들어집니다. Alt+클릭은 부재 하나만 고릅니다.", "Click the bridge: the right shows its length, members and steel weight. Edit bridge… changes its kind or sizes and makes the members again. Alt+click picks one member."),
        run: async (ctx) => {
          const st = ctx.p.structures.find((s) => s.kind === "bridge");
          ctx.app.plan.select(ctx.p.members.filter((m) => m.structure === st.id).map((m) => m.id));
          ctx.app.refreshInspector();
          const edit = await ctx.waitFor(() => [...document.querySelectorAll("#right-panel .prop-actions .btn")].find((b) => b.textContent === ctx.app.t("Edit bridge…")), 3000);
          await ctx.click(edit);
          const sel = await ctx.waitFor(() => document.querySelector(".modal .form-grid select"), 3000);
          await ctx.select(sel, "extradosed");
          await ctx.confirm();
          await ctx.wait(400);
          ctx.expect(ctx.p.structures.find((s) => s.id === st.id).params.type === "extradosed", "bridge unchanged");
          await ctx.key("F3");
          await ctx.waitFor(() => ctx.app.v3d.viewer, 8000);
          ctx.app.v3d.setView("iso");
          await ctx.wait(1200);
        },
        practice: { setup: (ctx) => { const st = (ctx.app.store.project.structures || []).find((s) => s.kind === "bridge"); bridgeParamsStart = st ? JSON.stringify(st.params) : ""; },
          todo: T("교량을 선택하고 '교량 편집…'에서 무엇이든 바꾸세요.", "Select the bridge and change anything in Edit bridge…."),
          check: (ctx) => { const st = (ctx.app.store.project.structures || []).find((s) => s.kind === "bridge"); return !!st && !!bridgeParamsStart && JSON.stringify(st.params) !== bridgeParamsStart; } } },
    ],
  },
  // ---------------------------------------------------------------- 20
  // A whole building from an empty sheet: an L-shaped, three-storey
  // neighbourhood building (café and two shops below, offices above) with a
  // stair core, wall types, a structural grid, slabs, a flat roof, furniture,
  // a model check and a look at it in 3D.
  {
    title: T("실전: 3층 근린생활시설 설계", "A real project: a three-storey mixed-use building"), fresh: true,
    steps: [
      { title: T("새 프로젝트", "Start the project"), text: T("빈 평면에서 시작합니다. 대지에 맞춘 ㄱ자 건물(18 × 12 m)을 1층 카페·상가 두 곳, 2·3층 사무실, 계단과 화장실이 있는 코어로 설계합니다.", "Start from an empty plan. The L-shaped building (18 × 12 m) gets a café and two shops on the ground floor, offices above and a core with the stair and toilets."),
        run: async (ctx) => { ctx.app.store.dirty = false; await ctx.command("file.new"); await discard(ctx); await ctx.waitFor(() => ctx.app.tab === "plan" && ctx.p.walls.length === 0); await ctx.view(BLD); await ctx.key("Escape"); /* the first key after the tutorial opens can be lost */ },
        practice: { todo: T("Ctrl+N 을 누르세요.", "Press Ctrl+N."), check: (ctx) => ctx.app.tab === "plan" && ctx.p.walls.length === 0 } },
      { title: T("외벽 타입 고르기", "Choose the outside wall type"), text: T("아무것도 고르지 않았을 때 오른쪽 '새 항목'에서 앞으로 그릴 벽의 타입을 정합니다. 외벽은 '외벽 미장 250'(단열재·블록·미장 층)으로 그립니다.", "With nothing selected, New items on the right sets the type of the walls you draw next. The outside walls use Rendered exterior wall 250 (render, insulation and block layers)."),
        run: async (ctx) => { await deselect(ctx); await ctx.select(newWallType, "ext-render-250"); ctx.expect(ctx.app.settings.wallType === "ext-render-250", "wall type not chosen"); },
        practice: { todo: T("오른쪽 '새 항목'의 벽 타입을 '외벽 미장 250'으로 바꾸세요.", "Set the wall type under New items on the right to Rendered exterior wall 250."), check: (ctx) => ctx.app.settings.wallType === "ext-render-250", targets: () => [{ el: newWallType }] } },
      { title: T("ㄱ자 외벽", "The L-shaped outline"), text: T("W 로 여섯 모서리를 차례로 클릭하고 첫 점을 다시 클릭해 닫습니다. 벽 두께는 타입이 정합니다.", "With W click the six corners in turn and the first one again to close the outline. The type sets the thickness."),
        run: async (ctx) => { await ctx.key("w"); await ctx.clicks([...OUTLINE, OUTLINE[0]]); await ctx.key("Escape"); ctx.expect(walls(ctx).length === 6 && walls(ctx).every((w) => w.type === "ext-render-250"), `expected 6 rendered walls, got ${walls(ctx).length}`); },
        practice: { todo: T("W 를 누르고 표시된 여섯 모서리를 돈 뒤 첫 점을 다시 클릭하세요.", "Press W, click the six marked corners and the first one again."), check: (ctx) => walls(ctx).length >= 6, targets: () => OUTLINE.map(([x, y]) => ({ x, y })) } },
      { title: T("칸막이벽과 코어", "Partitions and the core"), text: T("벽 타입을 '블록 칸막이 150'으로 바꾸고 안쪽 벽을 그립니다: 코어(계단실·화장실)를 나누는 벽, 카페와 상가 사이 벽, 두 상가 사이 벽. 벽 끝을 다른 벽에 놓으면 T 자로 이어집니다.", "Switch the type to Block partition 150 and draw the inside walls: the core (stair hall and toilets), the wall between the café and the shops, and the one between the two shops. Ending on another wall joins it in a T."),
        run: async (ctx) => {
          await deselect(ctx);
          await ctx.select(newWallType, "int-block-150");
          for (const [a, b] of PARTITIONS) { await ctx.key("w"); await ctx.clicks([a, b]); await ctx.key("Escape"); }
          ctx.expect(walls(ctx).filter((w) => w.type === "int-block-150").length === PARTITIONS.length, "partitions missing");
        },
        practice: { todo: T("벽 타입을 '블록 칸막이 150'으로 바꾸고 W 로 표시된 네 벽을 그리세요 (벽마다 Esc).", "Set the type to Block partition 150 and draw the four marked walls with W (Esc after each)."), check: (ctx) => walls(ctx).filter((w) => w.type === "int-block-150").length >= PARTITIONS.length, targets: () => PARTITIONS.flat().map(([x, y]) => ({ x, y })) } },
      { title: T("출입문", "Entrances"), text: T("D 로 바깥쪽 벽에 출입문 세 개를 넣습니다: 북쪽은 카페, 남쪽은 두 상가의 문입니다.", "With D put three entrance doors in the outside walls: the café's on the north side, the two shops' on the south side."),
        run: async (ctx) => { await ctx.key("d"); for (const [x, y, ix, iy] of ENTRANCES) { await ctx.move(ix, iy); await ctx.clickAt(x, y); } await ctx.key("Escape"); ctx.expect(ctx.p.openings.filter((o) => o.kind === "door").length === ENTRANCES.length, "entrance doors missing"); },
        practice: { todo: T("D 를 누르고 표시된 세 곳을 클릭하세요.", "Press D and click the three marks."), check: (ctx) => ctx.p.openings.filter((o) => o.kind === "door").length >= ENTRANCES.length, targets: () => ENTRANCES.map(([x, y]) => ({ x, y })) } },
      { title: T("카페 문은 양개문으로", "A double door for the café"), text: T("문을 선택하고 오른쪽의 '유형'에서 양개·미닫이 같은 형식을 고르고, 폭도 넓힙니다.", "Select a door to choose its type (double, sliding …) on the right and widen it."),
        run: async (ctx) => {
          await toSelect(ctx); await ctx.clickAt(ENTRANCES[0][0], ENTRANCES[0][1]);
          const sel = await ctx.waitFor(fieldEl(ctx, "Type")); await ctx.select(sel, "double");
          for (let i = 0; i < 6; i++) await ctx.click(plusOf(ctx.app.t("Width")));
          const o = ctx.p.openings.find((x) => [...ctx.app.plan.sel].includes(x.id));
          ctx.expect(o && o.type === "double" && o.width >= 1200, "café door not changed");
        },
        practice: { todo: T("북쪽 문을 클릭하고 '유형'을 '양개'로 바꾼 뒤 폭을 넓히세요.", "Click the north door, set Type to Double and widen it."), check: (ctx) => ctx.p.openings.some((o) => o.type === "double"), targets: () => [{ x: ENTRANCES[0][0], y: ENTRANCES[0][1] }] } },
      { title: T("안쪽 문", "Inside doors"), text: T("카페에서 계단실로, 계단실에서 화장실로 가는 문입니다. 좁은 곳은 미닫이문이 편합니다: 문을 넣은 뒤 유형을 '미닫이'로 바꿉니다.", "From the café to the stair hall and from the stair hall to the toilets. Sliding doors suit tight spots: put the door in, then set its type to Sliding."),
        run: async (ctx) => {
          await ctx.key("d"); for (const [x, y, ix, iy] of INNER_DOORS) { await ctx.move(ix, iy); await ctx.clickAt(x, y); } await ctx.key("Escape");
          await toSelect(ctx); await ctx.clickAt(INNER_DOORS[1][0], INNER_DOORS[1][1]);
          await ctx.select(await ctx.waitFor(fieldEl(ctx, "Type")), "sliding");
          ctx.expect(ctx.p.openings.filter((o) => o.kind === "door").length === ENTRANCES.length + INNER_DOORS.length && ctx.p.openings.some((o) => o.type === "sliding"), "inside doors missing");
        },
        practice: { todo: T("D 로 표시된 두 칸막이벽에 문을 넣고, 화장실 문을 '미닫이'로 바꾸세요.", "With D put doors at the two marks, then make the toilet door Sliding."), check: (ctx) => ctx.p.openings.filter((o) => o.kind === "door").length >= ENTRANCES.length + INNER_DOORS.length, targets: () => INNER_DOORS.map(([x, y]) => ({ x, y })) } },
      { title: T("창문", "Windows"), text: T("N 으로 외벽에 창을 고르게 넣습니다. 층을 복사하면 창문도 함께 올라갑니다.", "With N spread windows over the outside walls. Copying the storey later takes the windows up too."),
        run: async (ctx) => { await ctx.key("n"); for (const [x, y] of WINDOWS) await ctx.clickAt(x, y); await ctx.key("Escape"); ctx.expect(ctx.p.openings.filter((o) => o.kind === "window").length === WINDOWS.length, "windows missing"); },
        practice: { todo: T("N 을 누르고 표시된 곳을 모두 클릭하세요.", "Press N and click every mark."), check: (ctx) => ctx.p.openings.filter((o) => o.kind === "window").length >= WINDOWS.length - 2, targets: () => WINDOWS.map(([x, y]) => ({ x, y })) } },
      { title: T("방과 이름", "Rooms and names"), text: T("A 로 다섯 공간을 클릭해 방을 만들고, 두 번 클릭해 이름을 붙입니다. 면적은 벽 안쪽 기준으로 계산됩니다.", "With A click the five spaces to make rooms, then double-click them to name them. Areas are measured inside the walls."),
        run: async (ctx) => {
          await ctx.key("a"); for (const [x, y] of ROOMS_1F) await ctx.clickAt(x, y); await ctx.key("Escape");
          await toSelect(ctx);
          for (const [x, y, name] of ROOMS_1F) {
            await ctx.clickAt(x, y + 600, { dbl: true });
            const input = await ctx.waitFor(() => document.querySelector(".modal input.input"));
            await ctx.type(input, ctx.L(name)); await ctx.confirm();
          }
          ctx.expect(ctx.on("rooms").length === ROOMS_1F.length && ctx.on("rooms").some((r) => r.name === ctx.L(ROOMS_1F[0][2])), "rooms missing or unnamed");
        },
        practice: { todo: T("A 로 다섯 공간을 만들고, 카페를 두 번 클릭해 이름을 '카페'로 바꾸세요.", "Make the five rooms with A, then double-click the café and call it Café."), check: (ctx) => ctx.on("rooms").length >= ROOMS_1F.length && ctx.on("rooms").some((r) => /카페|caf/i.test(r.name)), targets: () => ROOMS_1F.map(([x, y]) => ({ x, y })) } },
      { title: T("구조 그리드와 기둥", "Structural grid and columns"), text: T("G 로 6 m 간격의 통심선 1–4, A–C 를 그리고, C 로 벽이 만나는 그리드 교점에 기둥을 세웁니다. 그리드는 모든 층에 보입니다.", "With G draw grid lines 1–4 and A–C at 6 m, then put columns with C where the grid meets the walls. The grid shows on every level."),
        run: async (ctx) => {
          await ctx.key("g"); for (const [a, b] of GRID) await ctx.clicks([a, b]); await ctx.key("Escape");
          await ctx.key("c"); for (const [x, y] of COLUMNS) await ctx.clickAt(x, y); await ctx.key("Escape");
          ctx.expect(ctx.p.grids.length === GRID.length && ctx.on("columns").length === COLUMNS.length, `grid ${ctx.p.grids.length}, columns ${ctx.on("columns").length}`);
        },
        practice: { todo: T("G 로 표시된 그리드선을 그리고 C 로 기둥을 세우세요.", "Draw the marked grid lines with G, then place columns with C."), check: (ctx) => ctx.p.grids.length >= 4 && ctx.p.columns.length >= 2, targets: () => COLUMNS.map(([x, y]) => ({ x, y })) } },
      { title: T("계단", "The stair"), text: T("S 로 계단실 안에 계단을 놓습니다. 단 수는 층 높이에 맞춰집니다.", "With S place the stair in the stair hall. The number of steps follows the storey height."),
        run: async (ctx) => { await ctx.key("s"); await ctx.clicks(STAIR); await ctx.key("Escape"); ctx.expect(ctx.on("stairs").length === 1, "no stair"); },
        practice: { todo: T("S 를 누르고 계단실의 두 점을 클릭하세요.", "Press S and click the two marks in the stair hall."), check: (ctx) => ctx.on("stairs").length >= 1, targets: () => STAIR.map(([x, y]) => ({ x, y })) } },
      { title: T("2층 올리기", "Add the first floor"), text: T("층 탭의 + 는 맨 위층의 벽과 창을 그대로 복사한 새 층을 올립니다. 문과 방은 층마다 새로 정합니다.", "The + on the level tabs adds a storey with copies of the top level's walls and windows. Doors and rooms are set per storey."),
        run: async (ctx) => { await ctx.click("#view-plan .page-tab.add"); ctx.expect(ctx.p.levels.length === 2 && walls(ctx).length === 6 + PARTITIONS.length, "level not added"); },
        practice: { todo: T("층 탭의 + 를 누르세요.", "Press + on the level tabs."), check: (ctx) => ctx.p.levels.length >= 2, targets: () => [{ el: "#view-plan .page-tab.add" }] } },
      { title: T("2층은 넓은 사무실", "An open office upstairs"), text: T("위층에는 상가 칸막이가 필요 없습니다. 벽을 클릭하고 Del 로 지워 한 공간으로 만들고, 계단실·화장실 문을 넣습니다.", "The offices don't need the shop partitions: click them and press Del to open the floor up, then add the stair-hall and toilet doors."),
        run: async (ctx) => {
          await toSelect(ctx);
          for (const [x, y] of SHOP_WALLS) { await ctx.clickAt(x, y); await ctx.key("Delete"); }
          await innerDoors(ctx);
          ctx.expect(walls(ctx).length === 6 + PARTITIONS.length - SHOP_WALLS.length && ctx.on("openings").length >= 0, "walls not removed");
          ctx.expect(ctx.p.openings.filter((o) => o.kind === "door" && walls(ctx).some((w) => w.id === o.wall)).length === INNER_DOORS.length, "doors missing upstairs");
        },
        practice: { todo: T("카페·상가 사이 두 벽을 지우고, D 로 표시된 두 곳에 문을 넣으세요.", "Delete the two shop walls and put doors at the two marks with D."), check: (ctx) => walls(ctx).length <= 6 + PARTITIONS.length - SHOP_WALLS.length, targets: () => SHOP_WALLS.map(([x, y]) => ({ x, y })) } },
      { title: T("방 자동 찾기와 위층 계단", "Find the rooms, stair up"), text: T("빌드 → 방 자동 찾기 는 닫힌 공간마다 방을 만듭니다. 큰 방은 두 번 클릭해 '사무실'로 이름을 바꾸고, 3층으로 가는 계단도 같은 자리에 놓습니다.", "Build → Detect rooms makes a room in every closed space. Double-click the big one and call it Office, then put the stair to the second floor in the same place."),
        run: async (ctx) => {
          await ctx.command("build.detectRooms"); await ctx.wait(200); await closeAll(ctx);
          await nameOffice(ctx);
          await ctx.key("s"); await ctx.clicks(STAIR); await ctx.key("Escape");
          ctx.expect(ctx.on("rooms").length >= 3 && ctx.on("stairs").length === 1, `rooms ${ctx.on("rooms").length}, stairs ${ctx.on("stairs").length}`);
        },
        practice: { todo: T("빌드 → 방 자동 찾기 를 누르고, S 로 계단을 놓으세요.", "Use Build → Detect rooms, then place the stair with S."), check: (ctx) => ctx.on("rooms").length >= 3 && ctx.on("stairs").length >= 1, targets: () => STAIR.map(([x, y]) => ({ x, y })) } },
      { title: T("3층과 평지붕", "Second floor and a flat roof"), text: T("+ 로 3층을 올리고 문을 넣고 방을 찾은 뒤, 빌드 → 맨 위층 지붕 으로 지붕을 얹어 모양은 '평', 재질은 '지붕 방수 시트'로 바꿉니다.", "Add the second floor with +, put in its doors and detect its rooms, then put a roof on with Build → Roof over the top level, make it Flat and give it a Roof membrane."),
        run: async (ctx) => {
          await ctx.click("#view-plan .page-tab.add");
          await innerDoors(ctx);
          await ctx.command("build.detectRooms"); await ctx.wait(200); await closeAll(ctx);
          await nameOffice(ctx);
          await ctx.command("build.autoRoof");
          const sel = await ctx.waitFor(fieldEl(ctx, "Shape")); await ctx.select(sel, "flat");
          await ctx.click(await ctx.waitFor(fieldEl(ctx, "Material"), 3000));
          await ctx.click(await ctx.waitFor(() => document.querySelector('.mat-pop .mat-tile[data-mat="roof-membrane"]'), 3000));
          ctx.expect(ctx.p.levels.length === 3 && ctx.p.roofs.length === 1 && ctx.p.roofs[0].kind === "flat" && ctx.p.roofs[0].material === "roof-membrane", "roof or level missing");
        },
        practice: { todo: T("+ 로 층을 올리고, 맨 위층 지붕을 만든 뒤 모양을 '평'으로 바꾸세요.", "Add a storey with +, make the roof and set its Shape to Flat."), check: (ctx) => ctx.p.levels.length >= 3 && ctx.p.roofs.some((r) => r.kind === "flat") } },
      { title: T("바닥 슬래브", "Floor slabs"), text: T("빌드 → 모든 층 바닥 슬래브 는 층마다 외벽 윤곽으로 슬래브를 만들고, 계단 위는 뚫어 둡니다. 물량과 IFC 에도 들어갑니다.", "Build → Floor slabs under every level makes a slab inside each storey's outline, with holes over the stairs. They count in quantities and IFC."),
        run: async (ctx) => { await ctx.command("build.autoSlabs"); await ctx.wait(200); await closeAll(ctx); ctx.expect((ctx.p.slabs || []).length >= 3, `slabs ${(ctx.p.slabs || []).length}`); },
        practice: { todo: T("빌드 메뉴에서 '모든 층 바닥 슬래브'를 누르세요.", "Use Build → Floor slabs under every level."), check: (ctx) => (ctx.p.slabs || []).length >= 3 } },
      { title: T("사무 가구", "Office furniture"), text: T("2층으로 내려가 F 로 '칸막이 사무용 책상'을 찾아 놓고 Ctrl+D 로 복제해 줄을 맞춥니다.", "Go down to the first floor, find Workstation with screen with F, place it and Ctrl+D to repeat it in a row."),
        run: async (ctx) => {
          await ctx.click(`.page-tab[data-level="${ctx.p.levels[1].id}"]`);
          await ctx.key("f"); await ctx.pick(ctx.L(T("칸막이 사무용 책상", "Workstation with screen")), ctx.L(T("칸막이 사무용 책상", "Workstation with screen"))); await ctx.clickAt(DESK[0], DESK[1]);
          await toSelect(ctx); await ctx.clickAt(DESK[0], DESK[1]);
          for (let i = 0; i < 3; i++) await ctx.key("d", { ctrl: true });
          ctx.expect(ctx.on("furniture").filter((f) => f.kind === "workstation").length === 4, "desks missing");
        },
        practice: { todo: T("2F 탭을 누르고, F 로 책상을 놓은 뒤 Ctrl+D 로 몇 개 복제하세요.", "Click the 2F tab, place a workstation with F and duplicate it with Ctrl+D."), check: (ctx) => ctx.p.furniture.filter((f) => f.kind === "workstation").length >= 2, targets: () => [{ x: DESK[0], y: DESK[1] }] } },
      { title: T("모델 검사", "Model check"), text: T("F5 는 겹친 벽, 문 없는 방, 계단 머리 높이 같은 문제를 찾습니다. 이 건물은 오류도 경고도 없습니다. 문제가 있으면 항목을 클릭해 그 위치로 갑니다.", "F5 looks for overlapping walls, rooms without a door, stair headroom and more. This building has neither errors nor warnings; when there are some, click one to jump to it."),
        run: async (ctx) => { await ctx.key("F5"); await ctx.wait(300); const issues = ctx.app.checkIssues || []; await closeAll(ctx); ctx.expect(issues.length === 0, `${issues.length} issues: ${issues.map((e) => e.message || e.code).slice(0, 3).join("; ")}`); },
        practice: { todo: T("F5 를 누르세요.", "Press F5."), check: (ctx) => Array.isArray(ctx.app.checkIssues) } },
      { title: T("3D 로 확인", "See it in 3D"), text: T("F3 으로 3D 에서 건물 전체를 봅니다. 빌드 → 일람표와 물량 에서는 층별 면적과 문·창 목록을 볼 수 있습니다.", "F3 shows the whole building in 3D. Build → Schedules and quantities lists the areas per storey and the doors and windows."),
        run: async (ctx) => {
          await ctx.command("build.schedules"); await ctx.waitFor(() => ctx.modal()); await ctx.wait(300); await closeAll(ctx);
          await ctx.key("F3"); await ctx.waitFor(() => ctx.app.v3d.viewer, 8000); ctx.app.v3d.setView("iso"); await ctx.wait(1200);
          ctx.expect(ctx.app.tab === "3d", "3D not shown");
        },
        practice: { todo: T("일람표와 물량을 열어 보고 닫은 뒤 F3 을 누르세요.", "Open Schedules and quantities, close it and press F3."), check: (ctx) => ctx.app.tab === "3d" } },
    ],
  },
  // ---------------------------------------------------------------- 21
  // A more complex building: three storeys of offices around a full-height
  // atrium, a glass curtain-wall front, a wing set at 45°, a stair core, a
  // shaft that opens the atrium through the upper floors and the roof, and a
  // model check and section view of the result.
  {
    title: T("실전: 아트리움과 사선 날개가 있는 복합 건물", "A real project: an atrium building with an angled wing"), fresh: true,
    steps: [
      { title: T("새 프로젝트", "Start the project"), text: T("빈 평면에서 시작합니다. 24 × 16 m 본관 가운데에 3개 층을 관통하는 아트리움을 두고, 남쪽은 유리 커튼월, 동쪽에는 45° 로 꺾인 날개를 붙인 3층 업무 시설을 그립니다.", "Start from an empty plan. The three-storey office has a 24 × 16 m main block with an atrium through all floors in the middle, a glass curtain wall on the south and a wing set at 45° on the east."),
        run: async (ctx) => { ctx.app.store.dirty = false; await ctx.command("file.new"); await discard(ctx); await ctx.waitFor(() => ctx.app.tab === "plan" && ctx.p.walls.length === 0); await ctx.view(CPX); await ctx.key("Escape"); /* the first key after the tutorial opens can be lost */ },
        practice: { todo: T("Ctrl+N 을 누르세요.", "Press Ctrl+N."), check: (ctx) => ctx.app.tab === "plan" && ctx.p.walls.length === 0 } },
      { title: T("세 면의 외벽", "Three outside walls"), text: T("W 로 남서쪽 모서리에서 시작해 북서·북동·남동 모서리를 차례로 클릭하고 Esc 로 끝냅니다. 남쪽 면은 다음 단계에서 커튼월로 닫습니다.", "With W start at the south-west corner, click the north-west, north-east and south-east corners and press Esc. The south side is closed with a curtain wall next."),
        run: async (ctx) => { await ctx.key("w"); await ctx.clicks(CPX_WALLS); await ctx.key("Escape"); ctx.expect(walls(ctx).length === 3, `expected 3 walls, got ${walls(ctx).length}`); },
        practice: { todo: T("W 를 누르고 표시된 네 모서리를 차례로 클릭한 뒤 Esc 를 누르세요.", "Press W, click the four marked corners in turn and press Esc."), check: (ctx) => walls(ctx).length >= 3, targets: () => CPX_WALLS.map(([x, y]) => ({ x, y })) } },
      { title: T("유리 커튼월", "A glass curtain wall"), text: T("V 는 커튼월 도구입니다. 벽처럼 두 모서리를 클릭하면 멀리언과 유리 패널이 있는 커튼월이 생기고, 나중에 넣는 문과 창은 패널을 대신합니다.", "V is the curtain wall tool. Click two corners like a wall: the curtain wall gets mullions and glass panels, and doors or windows put in later replace panels."),
        run: async (ctx) => { await ctx.key("v"); await ctx.clicks(CPX_CURTAIN); await ctx.key("Escape"); ctx.expect(walls(ctx).some((w) => /^curtain/.test(w.type || "")), "no curtain wall"); },
        practice: { todo: T("V 를 누르고 남동쪽과 남서쪽 모서리를 클릭한 뒤 Esc 를 누르세요.", "Press V, click the south-east and south-west corners and press Esc."), check: (ctx) => walls(ctx).some((w) => /^curtain/.test(w.type || "")), targets: () => CPX_CURTAIN.map(([x, y]) => ({ x, y })) } },
      { title: T("45° 로 꺾인 날개", "A wing at 45°"), text: T("W 로 동쪽 벽 위에서 시작해 45° 방향으로 그립니다. 그리는 방향은 45° 단위로 맞춰지고, 끝을 다시 동쪽 벽 위에 놓으면 T 자로 이어져 평행사변형 날개가 닫힙니다.", "With W start on the east wall and draw at 45°. Directions snap in 45° steps; ending back on the east wall joins it in a T and closes the parallelogram wing."),
        run: async (ctx) => { await ctx.key("w"); await ctx.clicks(CPX_WING); await ctx.key("Escape"); ctx.expect(walls(ctx).length === 7, `expected 7 walls, got ${walls(ctx).length}`); },
        practice: { todo: T("W 를 누르고 표시된 네 점을 차례로 클릭한 뒤 Esc 를 누르세요.", "Press W, click the four marks in turn and press Esc."), check: (ctx) => walls(ctx).filter((w) => Math.abs(Math.abs(w.x2 - w.x1) - Math.abs(w.y2 - w.y1)) < 10 && w.x1 !== w.x2).length >= 2, targets: () => CPX_WING.map(([x, y]) => ({ x, y })) } },
      { title: T("아트리움과 코어를 나누는 벽", "Walls around the atrium and the core"), text: T("안쪽 벽 네 개를 그립니다: 아트리움 양쪽 벽, 서쪽 사무실 두 곳을 나누는 벽, 계단실과 카페를 나누는 벽. 벽마다 Esc 로 끝냅니다.", "Draw four inside walls: the two sides of the atrium, the wall between the two west offices and the one between the stair hall and the café. Press Esc after each."),
        run: async (ctx) => { for (const [a, b] of CPX_PARTS) { await ctx.key("w"); await ctx.clicks([a, b]); await ctx.key("Escape"); } ctx.expect(walls(ctx).length === 7 + CPX_PARTS.length, `expected ${7 + CPX_PARTS.length} walls, got ${walls(ctx).length}`); },
        practice: { todo: T("W 로 표시된 네 벽을 그리세요 (벽마다 Esc).", "Draw the four marked walls with W (Esc after each)."), check: (ctx) => walls(ctx).length >= 7 + CPX_PARTS.length, targets: () => CPX_PARTS.flat().map(([x, y]) => ({ x, y })) } },
      { title: T("커튼월의 출입문과 안쪽 문", "The entrance and the inside doors"), text: T("D 로 커튼월 가운데에 출입문을 넣으면 그 자리의 유리 패널이 문으로 바뀝니다. 이어서 아트리움에서 사무실·계단실·카페로, 카페에서 날개로 가는 문을 넣습니다.", "With D put the entrance in the middle of the curtain wall: the glass panel there becomes a door. Then add the doors from the atrium to the offices, the stair hall and the café, and from the café into the wing."),
        run: async (ctx) => {
          await ctx.key("d"); await ctx.move(CPX_ENTRANCE[2], CPX_ENTRANCE[3]); await ctx.clickAt(CPX_ENTRANCE[0], CPX_ENTRANCE[1]); await ctx.key("Escape");
          await cpxDoors(ctx);
          ctx.expect(levelDoors(ctx) === 1 + CPX_DOORS.length, `doors ${levelDoors(ctx)}`);
        },
        practice: { todo: T("D 를 누르고 표시된 여섯 곳을 클릭하세요.", "Press D and click the six marks."), check: (ctx) => levelDoors(ctx) >= 1 + CPX_DOORS.length, targets: () => [CPX_ENTRANCE, ...CPX_DOORS].map(([x, y]) => ({ x, y })) } },
      { title: T("창문", "Windows"), text: T("N 으로 북쪽·서쪽 벽과 날개 끝에 창을 넣습니다. 남쪽은 커튼월이 이미 유리입니다.", "With N put windows in the north and west walls and the end of the wing. The south front is glass already."),
        run: async (ctx) => { await ctx.key("n"); for (const [x, y] of CPX_WINDOWS) await ctx.clickAt(x, y); await ctx.key("Escape"); ctx.expect(ctx.p.openings.filter((o) => o.kind === "window").length === CPX_WINDOWS.length, "windows missing"); },
        practice: { todo: T("N 을 누르고 표시된 곳을 모두 클릭하세요.", "Press N and click every mark."), check: (ctx) => ctx.p.openings.filter((o) => o.kind === "window").length >= CPX_WINDOWS.length - 2, targets: () => CPX_WINDOWS.map(([x, y]) => ({ x, y })) } },
      { title: T("방 자동 찾기와 이름", "Find the rooms and name them"), text: T("빌드 → 방 자동 찾기 는 사선 벽으로 둘러싸인 날개까지 닫힌 공간마다 방을 만듭니다. 가운데 방은 '아트리움', 날개는 '전시실'로 이름을 바꿉니다.", "Build → Detect rooms makes a room in every closed space, the wing between its slanted walls included. Call the middle room Atrium and the wing Gallery."),
        run: async (ctx) => {
          await ctx.command("build.detectRooms"); await ctx.wait(200); await closeAll(ctx);
          await cpxName(ctx, CPX_ATRIUM, T("아트리움", "Atrium")); await cpxName(ctx, CPX_WINGPT, T("전시실", "Gallery"));
          ctx.expect(ctx.on("rooms").length === 6 && ctx.on("rooms").some((r) => r.name === ctx.L(T("아트리움", "Atrium"))), `rooms ${ctx.on("rooms").length}`);
        },
        practice: { todo: T("빌드 → 방 자동 찾기 를 누르고, 가운데 방의 이름을 '아트리움'으로 바꾸세요.", "Use Build → Detect rooms and rename the middle room Atrium."), check: (ctx) => ctx.on("rooms").length >= 6 && ctx.on("rooms").some((r) => /아트리움|atrium/i.test(r.name)), targets: () => [{ x: CPX_ATRIUM[0], y: CPX_ATRIUM[1] }, { x: CPX_WINGPT[0], y: CPX_WINGPT[1] }] } },
      { title: T("계단", "The stair"), text: T("S 로 계단실에 계단을 놓습니다. 위층 바닥을 만들면 계단 위는 자동으로 뚫립니다.", "With S place the stair in the stair hall. When the floors above get their slabs, the slab over the stair is cut open by itself."),
        run: async (ctx) => { await ctx.key("s"); await ctx.clicks(CPX_STAIR); await ctx.key("Escape"); ctx.expect(ctx.on("stairs").length === 1, "no stair"); },
        practice: { todo: T("S 를 누르고 계단실의 두 점을 클릭하세요.", "Press S and click the two marks in the stair hall."), check: (ctx) => ctx.on("stairs").length >= 1, targets: () => CPX_STAIR.map(([x, y]) => ({ x, y })) } },
      { title: T("2층: 복사하고 문, 방, 계단", "First floor: copy, doors, rooms, stair"), text: T("층 탭의 + 는 커튼월과 날개를 포함한 벽과 창을 복사합니다. 위층에서는 출입문 없이 안쪽 문만 넣고, 방을 자동으로 찾고, 같은 자리에 3층으로 가는 계단을 놓습니다.", "The + on the level tabs copies the walls (curtain wall and wing included) and windows. Upstairs only the inside doors are needed; detect the rooms and put the stair to the second floor in the same place."),
        run: async (ctx) => {
          await ctx.click("#view-plan .page-tab.add");
          await cpxDoors(ctx);
          await ctx.command("build.detectRooms"); await ctx.wait(200); await closeAll(ctx);
          await ctx.key("s"); await ctx.clicks(CPX_STAIR); await ctx.key("Escape");
          ctx.expect(ctx.p.levels.length === 2 && levelDoors(ctx) === CPX_DOORS.length && ctx.on("rooms").length === 6 && ctx.on("stairs").length === 1, `levels ${ctx.p.levels.length}, doors ${levelDoors(ctx)}, rooms ${ctx.on("rooms").length}, stairs ${ctx.on("stairs").length}`);
        },
        practice: { todo: T("+ 로 층을 올리고, D 로 안쪽 문 다섯 개를 넣고, 방 자동 찾기 후 S 로 계단을 놓으세요.", "Add a level with +, put in the five inside doors with D, detect the rooms and place the stair with S."), check: (ctx) => ctx.p.levels.length >= 2 && ctx.on("rooms").length >= 5 && ctx.on("stairs").length >= 1, targets: () => [...CPX_DOORS.map(([x, y]) => ({ x, y })), ...CPX_STAIR.map(([x, y]) => ({ x, y }))] } },
      { title: T("3층과 평지붕", "Second floor and a flat roof"), text: T("+ 로 3층을 올리고 문을 넣고 방을 찾습니다. 맨 위층이라 계단은 없습니다. 빌드 → 맨 위층 지붕 으로 본관과 날개를 함께 덮는 지붕을 얹고 모양을 '평'으로 바꿉니다.", "Add the second floor with +, put in its doors and detect its rooms; the top floor has no stair. Build → Roof over the top level covers the main block and the wing together; make it Flat."),
        run: async (ctx) => {
          await ctx.click("#view-plan .page-tab.add");
          await cpxDoors(ctx);
          await ctx.command("build.detectRooms"); await ctx.wait(200); await closeAll(ctx);
          await ctx.command("build.autoRoof");
          await ctx.select(await ctx.waitFor(fieldEl(ctx, "Shape")), "flat");
          ctx.expect(ctx.p.levels.length === 3 && ctx.p.roofs.length === 1 && ctx.p.roofs[0].kind === "flat", "roof or level missing");
        },
        practice: { todo: T("+ 로 층을 올리고, 맨 위층 지붕을 만든 뒤 모양을 '평'으로 바꾸세요.", "Add a storey with +, make the roof and set its Shape to Flat."), check: (ctx) => ctx.p.levels.length >= 3 && ctx.p.roofs.some((r) => r.kind === "flat") } },
      { title: T("바닥 슬래브", "Floor slabs"), text: T("빌드 → 모든 층 바닥 슬래브 는 층마다 날개를 포함한 외곽선으로 슬래브를 만들고 계단 위를 뚫습니다.", "Build → Floor slabs under every level makes a slab inside each storey's outline, wing included, with holes over the stairs."),
        run: async (ctx) => { await ctx.command("build.autoSlabs"); await ctx.wait(200); await closeAll(ctx); ctx.expect((ctx.p.slabs || []).length >= 3, `slabs ${(ctx.p.slabs || []).length}`); },
        practice: { todo: T("빌드 메뉴에서 '모든 층 바닥 슬래브'를 누르세요.", "Use Build → Floor slabs under every level."), check: (ctx) => (ctx.p.slabs || []).length >= 3 } },
      { title: T("아트리움을 위까지 뚫기", "Open the atrium to the sky"), text: T("2층 탭으로 가서 샤프트 도구(바닥 슬래브 단추 ▾ → 샤프트 개구부)로 아트리움의 두 모서리를 클릭합니다. 샤프트는 2층부터 위의 모든 슬래브와 지붕을 뚫어 3개 층 높이의 아트리움과 천창 자리를 만듭니다.", "Go to the 2F tab and, with the Shaft tool (the Floor slab button ▾ → Shaft opening), click two opposite corners of the atrium. The shaft cuts every slab from 2F up and the roof, so the atrium rises through all three floors to a rooflight."),
        run: async (ctx) => {
          await ctx.click(`.page-tab[data-level="${ctx.p.levels[1].id}"]`);
          await ctx.command("plan.shaft"); await ctx.clicks(CPX_VOID); await ctx.key("Escape");
          const sh = (ctx.p.shafts || [])[0];
          ctx.expect(sh && sh.level === ctx.p.levels[1].id && sh.top === ctx.p.levels[2].id, "no shaft from 2F to the top");
        },
        practice: { todo: T("2F 탭을 누르고 샤프트 도구로 아트리움의 두 모서리를 클릭하세요.", "Click the 2F tab and click two corners of the atrium with the Shaft tool."), check: (ctx) => (ctx.p.shafts || []).length >= 1, targets: () => CPX_VOID.map(([x, y]) => ({ x, y })) } },
      { title: T("모델 검사", "Model check"), text: T("F5 로 검사합니다. 사선 벽, 커튼월 문, 샤프트까지 모두 맞으면 오류도 경고도 없습니다. 샤프트가 아무것도 뚫지 않거나 계단 단 높이가 너무 크면 여기서 알려 줍니다.", "Check it with F5. With the slanted walls, the curtain-wall door and the shaft all right there are neither errors nor warnings; a shaft that cuts nothing or stair risers that are too high would show up here."),
        run: async (ctx) => { await ctx.key("F5"); await ctx.wait(300); const issues = ctx.app.checkIssues || []; await closeAll(ctx); ctx.expect(issues.length === 0, `${issues.length} issues: ${issues.map((e) => e.message || e.code).slice(0, 3).join("; ")}`); },
        practice: { todo: T("F5 를 누르세요.", "Press F5."), check: (ctx) => Array.isArray(ctx.app.checkIssues) } },
      { title: T("3D 단면으로 확인", "A 3D section through it"), text: T("F3 으로 3D 를 열고 단면(X)을 켜면 위가 잘린 건물 안에서 3개 층을 관통하는 아트리움과 45° 날개를 볼 수 있습니다. 단면 높이는 왼쪽에서 바꿉니다.", "Open 3D with F3 and turn on the section (X): with the top cut away you see the atrium through all three floors and the wing at 45°. The cut height is set on the left."),
        run: async (ctx) => {
          await ctx.key("F3"); await ctx.waitFor(() => ctx.app.v3d.viewer, 8000);
          ctx.app.v3d.setView("bird"); await ctx.key("x"); await ctx.wait(1200);
          ctx.expect(ctx.app.tab === "3d", "3D not shown");
        },
        practice: { todo: T("F3 을 누른 뒤 X 로 단면을 켜세요.", "Press F3, then X for the section."), check: (ctx) => ctx.app.tab === "3d" } },
    ],
  },
];
