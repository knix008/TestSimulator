// Tutorial lessons. Every step explains a feature in Korean and English,
// performs it on the real program (`run`, used by Watch mode and the tests)
// and describes what the user should do in Practice mode (`practice`: a todo
// text, a goal `check` and canvas / UI `targets` to mark).
//
// Lessons 2–14 build one small house step by step; lessons marked `fresh`
// start from a new project or a sample, so they can be played on their own.

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

export const LESSONS = [
  // ---------------------------------------------------------------- 1
  {
    title: T("화면 둘러보기", "Finding your way around"), fresh: true,
    steps: [
      { title: T("예제 열기", "Open a sample"), text: T("파일 → 예제 열기에서 2층 주택을 엽니다. 시작 페이지의 예제 카드를 눌러도 됩니다.", "File → Open sample opens the two-storey house. The sample cards on the start page do the same."),
        run: async (ctx) => { await sampleOpen(ctx, "03-two-storey-house.myarch", "2"); ctx.expect(ctx.app.tab === "plan" && ctx.p.levels.length === 2, "sample not opened"); },
        practice: { todo: T("파일 → 예제 열기… 에서 '2층 주택'을 고르세요.", "Use File → Open sample… and choose the two-storey house."), check: (ctx) => ctx.app.store.fileName === "03-two-storey-house.myarch", targets: () => [{ el: '.menu-root[data-menu="File"]' }] } },
      { title: T("전체 보기", "Zoom to fit"), text: T("Home 키는 도면 전체를 화면에 맞춥니다. 휠로 확대·축소하고, 빈 곳을 끌면 화면이 이동합니다.", "Home fits the whole drawing. The wheel zooms, dragging empty space pans."),
        run: async (ctx) => { await ctx.key("Home"); ctx.expect(ctx.app.plan.vp.scale > 0, "no view"); },
        practice: { todo: T("Home 키를 누르세요.", "Press Home."), check: () => true } },
      { title: T("화면 이동", "Pan the view"), text: T("빈 곳을 왼쪽 버튼으로 끌면 도면이 따라 움직입니다 (Shift+끌기는 영역 선택).", "Drag empty space with the left button to move the drawing (Shift+drag selects a box)."),
        run: async (ctx) => { const ox = ctx.app.plan.vp.ox; await ctx.drag([-4000, -3000], [-2500, -2000]); ctx.expect(ctx.app.plan.vp.ox !== ox, "view did not move"); },
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
      { title: T("위층 추가", "Add a level"), text: T("층 탭의 + 는 위에 새 층을 만들고 외벽(과 창문)을 복사합니다.", "The + on the level tabs adds a storey on top and copies the walls (and windows)."),
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
      { title: T("시점", "Views"), text: T("등각, 위, 정면, 뒤, 왼쪽, 오른쪽, 조감 버튼(또는 1–7 키)으로 시점을 바꿉니다.", "Isometric, Top, Front, Back, Left, Right and Bird's eye (keys 1–7) switch the view."),
        run: async (ctx) => { await ctx.key("F3"); await ctx.waitFor(() => ctx.app.v3d.viewer, 8000); await ctx.key("2"); await ctx.wait(500); await ctx.key("1"); await ctx.wait(500); },
        practice: { todo: T("툴바의 '위'와 '등각'을 눌러 보세요.", "Click Top and then Isometric in the toolbar."), check: (ctx) => ctx.app.tab === "3d" } },
      { title: T("표현 스타일", "Render styles"), text: T("사실적, 흰색 모델, 선 그림(입면도 느낌), 투시(X-ray) 스타일이 있습니다.", "Realistic, white model, line drawing (like an elevation) and x-ray."),
        run: async (ctx) => { const sel = document.querySelector("#toolbar select"); await ctx.select(sel, "lines"); ctx.expect(ctx.app.v3d.opts.style === "lines", "style unchanged"); await ctx.select(document.querySelector("#toolbar select"), "realistic"); },
        practice: { todo: T("툴바의 스타일을 '선 그림'으로 바꿔 보세요.", "Set the toolbar Style to Line drawing."), check: (ctx) => ctx.app.v3d.opts.style !== "realistic", targets: () => [{ el: "#toolbar select" }] } },
      { title: T("단면", "Section cut"), text: T("단면 버튼(X)은 현재 층 바닥 1.2 m 위를 잘라 3D 평면을 보여 줍니다. 높이는 왼쪽에서 바꿉니다.", "The section button (X) cuts 1.2 m above the current floor for a 3D plan; set the height on the left."),
        run: async (ctx) => { await ctx.key("x"); ctx.expect(ctx.app.v3d.opts.section !== null, "no section"); await ctx.wait(400); await ctx.key("x"); },
        practice: { todo: T("X 를 눌러 단면을 켜고 다시 끄세요.", "Press X to cut and again to remove it."), check: (ctx) => ctx.app.store && true } },
      { title: T("직교 투영과 입면", "Orthographic elevations"), text: T("O 는 직교 투영입니다. 3D → 정면 입면은 직교 + 선 그림으로 입면도를 만듭니다.", "O switches to orthographic. 3D → Front elevation combines orthographic and line drawing."),
        run: async (ctx) => { await ctx.command("v3d.front"); await ctx.wait(500); ctx.expect(ctx.app.v3d.opts.ortho, "not orthographic"); await ctx.key("o"); ctx.app.v3d.setOpt("style", "realistic"); await ctx.key("1"); },
        practice: { todo: T("3D → 정면 입면 을 고르세요.", "Choose 3D → Front elevation."), check: (ctx) => ctx.app.v3d.opts.ortho } },
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
      { title: T("인쇄와 PDF", "Print and PDF"), text: T("Ctrl+P 는 축척(1:50, 1:100 …)과 표제란, 방위표, 축척 막대가 있는 도면 시트를 미리 보고 인쇄·PDF·SVG 로 만듭니다.", "Ctrl+P previews drawing sheets at scale (1:50, 1:100 …) with a title block, north arrow and scale bar, and prints them or saves PDF / SVG."),
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
        practice: { todo: T("오른쪽 위 팔레트 버튼을 눌러 보세요.", "Press the palette button at the top right."), check: (ctx) => true, targets: () => [{ el: "#title-right .split-btn .icon-btn" }] } },
      { title: T("단위", "Units"), text: T("상태 표시줄의 단위 단추는 mm → cm → m → ft 로 바뀝니다.", "The units button in the status bar cycles mm → cm → m → ft."),
        run: async (ctx) => { const u = ctx.app.settings.units || "mm"; const btn = [...document.querySelectorAll("#statusbar button.cell")].find((b) => b.textContent.trim() === u); await ctx.click(btn); ctx.expect((ctx.app.settings.units || "mm") !== u, "units unchanged"); ctx.app.setSetting("units", u); },
        practice: { todo: T("상태 표시줄 오른쪽의 'mm' 를 눌러 보세요.", "Click 'mm' at the right of the status bar."), check: (ctx) => true } },
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
];
