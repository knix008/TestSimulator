// Tutorial lessons. Each step: title, text ({ ko, en }), run(ctx) — performs
// the step on the real interface and checks the result — and practice:
// { todo, setup?(ctx, mem), check?(ctx, mem), targets?(ctx) } for doing it
// yourself (no check = an information step). Coordinates are mm; the first
// lessons draw in the box (−10…170, −10…110). doc/Tutorial.md follows the
// same lessons, steps and coordinates.
const T = (ko, en) => ({ ko, en });
const added = (ctx, mem, type) => ctx.entities(type).filter((e) => !mem.start.ids.has(e.id));
const has = (ctx, mem, type, n = 1) => added(ctx, mem, type).length >= n;
const near = (a, b, eps = 0.6) => Math.abs(a - b) <= eps;
const tile = (id) => ({ el: `#left-panel [data-tool="${id}"]` });
const cmd = (id) => ({ el: `#toolbar [data-command="${id}"], #left-panel [data-command="${id}"]` });
const pts = (...list) => list.map(([x, y]) => ({ x, y }));
const selectTool = (ctx) => ctx.api.setTool('select');
const selectWhere = (ctx, test) => { const found = ctx.entities().filter(test); ctx.select(found.map((e) => e.id)); return found; };

// ───────────────────────── 1. finding your way around
const tour = {
  title: T('둘러보기', 'Finding your way around'),
  fresh: true,
  steps: [
    {
      title: T('시작 페이지', 'The start page'),
      text: T('시작 페이지에서 할 수 있는 일, 튜토리얼, 샘플, 최근 파일을 고릅니다. 메뉴 줄 맨 왼쪽의 집 버튼(또는 탭 줄의 집 탭)으로 언제든 돌아옵니다.', 'The start page lists what you can do, the tutorial, samples and recent files. The house button at the left of the menu bar (or the house tab) brings it back any time.'),
      run: async (ctx) => { await ctx.click('.menubar-home'); ctx.expect(ctx.api.state().home, 'start page not shown'); },
      practice: { todo: T('메뉴 줄 맨 왼쪽의 집 버튼을 누르세요.', 'Click the house button at the left of the menu bar.'), check: (ctx) => ctx.api.state().home, targets: () => [{ el: '.menubar-home' }, { el: '[data-tab-home]' }] },
    },
    {
      title: T('샘플 열기', 'Opening a sample'),
      text: T('샘플 카드를 누르면 그 도면이 새 탭으로 열립니다. 플랜지 샘플을 엽니다.', 'Clicking a sample card opens it in a new tab. Open the flange sample.'),
      run: async (ctx) => {
        await ctx.click('.sample-card[data-sample="02-flange.mcad"]');
        await ctx.api.waitIdle();
        ctx.expect(ctx.entities('part').some((e) => e.kind === 'flange'), 'flange sample not open');
      },
      practice: { todo: T('샘플에서 "플랜지"를 누르세요.', 'Click the "Flange" sample.'), check: (ctx) => !ctx.api.state().home && ctx.entities('part').some((e) => e.kind === 'flange'), targets: () => [{ el: '.sample-card[data-sample="02-flange.mcad"]' }] },
    },
    {
      title: T('전체 보기와 확대', 'Zoom to fit and zoom'),
      text: T('전체 보기(Home)는 도면 전체를 화면에 맞춥니다. Ctrl+휠이나 + / − 버튼으로 확대·축소합니다.', 'Zoom to fit (Home) shows the whole drawing. Ctrl + wheel or the + / − buttons zoom in and out.'),
      run: async (ctx) => { await ctx.command('zoomIn'); await ctx.command('zoomIn'); await ctx.command('zoomFit'); },
      practice: { todo: T('툴바의 확대(+) 버튼과 전체 보기 버튼을 눌러 보세요.', 'Click the zoom-in (+) and zoom-to-fit buttons on the toolbar.'), setup: (ctx, mem) => { mem.zoom = ctx.api.zoom(); }, check: (ctx, mem) => Math.abs(ctx.api.zoom() - mem.zoom) > 1e-6, targets: () => [cmd('zoomFit'), { el: '.toolbar-zoom' }] },
    },
    {
      title: T('화면 이동', 'Panning'),
      text: T('화면 이동 도구(또는 가운데 버튼·스페이스+끌기)로 도면을 옮겨 봅니다.', 'Move the view with the pan tool (or the middle button, or Space + drag).'),
      run: async (ctx) => { await ctx.tool('pan'); await ctx.drag({ x: 0, y: 0 }, { x: 25, y: 10 }); await ctx.tool('select'); },
      practice: { todo: T('화면 이동 도구를 고르고 캔버스를 끌어 보세요.', 'Pick the pan tool and drag the canvas.'), setup: (ctx, mem) => { mem.centre = ctx.api.centre(); }, check: (ctx, mem) => Math.hypot(ctx.api.centre().x - mem.centre.x, ctx.api.centre().y - mem.centre.y) > 1, targets: () => [tile('pan')] },
    },
    {
      title: T('패널 접고 펴기', 'Panels'),
      text: T('왼쪽 도구 패널과 오른쪽 속성 패널은 툴바 버튼(Ctrl+1, Ctrl+2)으로 접고 폅니다. 왼쪽 패널의 각 묶음 머리글을 누르면 그 묶음만 접힙니다.', 'The tool panel (left) and properties panel (right) fold with toolbar buttons (Ctrl+1, Ctrl+2). Clicking a group header in the left panel folds just that group.'),
      run: async (ctx) => { await ctx.command('rightPanel'); await ctx.wait(500); await ctx.command('rightPanel'); ctx.expect(ctx.settings().showRightPanel, 'right panel stays hidden'); },
      practice: { todo: T('속성 패널 버튼을 두 번 눌러 접었다 펴 보세요.', 'Click the properties panel button twice.'), targets: () => [cmd('rightPanel'), cmd('leftPanel')] },
    },
    {
      title: T('3D 보기', 'The 3D view'),
      text: T('3D 보기(Ctrl+Shift+3)는 닫힌 윤곽을 두께가 있는 판으로, 솔리드를 그대로 보여 줍니다. 다시 누르면 2D로 돌아갑니다.', 'The 3D view (Ctrl+Shift+3) shows closed outlines as plates and solids as they are. Click again to go back to 2D.'),
      run: async (ctx) => { await ctx.command('view3d'); await ctx.api.waitIdle(800); ctx.expect(ctx.api.state().view3d, '3D view not shown'); await ctx.wait(1200); await ctx.command('view3d'); },
      practice: { todo: T('툴바의 3D 보기 버튼을 누르세요.', 'Click the 3D view button on the toolbar.'), check: (ctx) => ctx.api.state().view3d, targets: () => [cmd('view3d')] },
    },
  ],
};

// ───────────────────────── 2. drawing
const drawing = {
  title: T('선과 도형 그리기', 'Drawing lines and shapes'),
  fresh: true,
  steps: [
    {
      title: T('새 도면', 'A new drawing'),
      text: T('새 도면(Ctrl+N)을 만듭니다. 격자 스냅이 켜져 있어 클릭이 5 mm 격자에 맞습니다.', 'Make a new drawing (Ctrl+N). Grid snap is on, so clicks land on the 5 mm grid.'),
      run: async (ctx) => { await ctx.command('new'); ctx.view({ minX: -10, minY: -10, maxX: 170, maxY: 110 }); ctx.expect(ctx.entities().length === 0, 'not empty'); },
      practice: { todo: T('툴바의 새 도면 버튼을 누르세요.', 'Click New on the toolbar.'), setup: (ctx, mem) => { mem.docs = ctx.api.state().docs.length; }, check: (ctx, mem) => ctx.api.state().docs.length > mem.docs, targets: () => [cmd('new')] },
    },
    {
      title: T('선 (L)', 'Lines (L)'),
      text: T('선 도구로 (0,0) → (60,0) → (60,40)을 클릭합니다. 클릭할 때마다 선이 이어지고 Esc로 끝냅니다.', 'With the line tool click (0,0) → (60,0) → (60,40). Each click continues the line; Esc finishes.'),
      run: async (ctx) => { await ctx.tool('line'); await ctx.clicks([[0, 0], [60, 0], [60, 40]]); await ctx.key('Escape'); await ctx.key('Escape'); ctx.expect(ctx.entities('line').length >= 2, 'two lines expected'); },
      practice: { todo: T('선 도구로 표시된 세 점을 차례로 클릭하고 Esc를 누르세요.', 'With the line tool click the three marks, then Esc.'), check: (ctx, mem) => has(ctx, mem, 'line', 2), targets: () => [tile('line'), ...pts([0, 0], [60, 0], [60, 40])] },
    },
    {
      title: T('사각형 (R)', 'Rectangles (R)'),
      text: T('사각형은 두 모서리를 클릭합니다: (80,0)과 (140,40).', 'A rectangle takes two corners: (80,0) and (140,40).'),
      run: async (ctx) => { await ctx.tool('rect'); await ctx.clicks([[80, 0], [140, 40]]); const r = ctx.last('rect'); ctx.expect(r && near(r.width, 60) && near(r.height, 40), 'rectangle 60 × 40 expected'); },
      practice: { todo: T('사각형 도구로 두 모서리를 클릭하세요.', 'With the rectangle tool click the two corners.'), check: (ctx, mem) => has(ctx, mem, 'rect'), targets: () => [tile('rect'), ...pts([80, 0], [140, 40])] },
    },
    {
      title: T('원 (C)', 'Circles (C)'),
      text: T('원은 중심 (20,70)을 클릭하고, 반지름 15가 되도록 (35,70)을 클릭합니다.', 'A circle: click the centre (20,70), then (35,70) for a radius of 15.'),
      run: async (ctx) => { await ctx.tool('circle'); await ctx.clicks([[20, 70], [35, 70]]); ctx.expect(near(ctx.last('circle')?.r ?? 0, 15), 'radius 15 expected'); },
      practice: { todo: T('원 도구로 중심과 반지름 점을 클릭하세요.', 'With the circle tool click the centre and a point on the circle.'), check: (ctx, mem) => has(ctx, mem, 'circle'), targets: () => [tile('circle'), ...pts([20, 70], [35, 70])] },
    },
    {
      title: T('호 (3점)', 'Arcs (3 points)'),
      text: T('호는 시작점, 지나는 점, 끝점의 세 점으로 그립니다: (45,60), (60,75), (75,60).', 'An arc goes through three points: start (45,60), through (60,75), end (75,60).'),
      run: async (ctx) => { await ctx.tool('arc'); await ctx.clicks([[45, 60], [60, 75], [75, 60]]); ctx.expect(ctx.last('arc'), 'arc expected'); },
      practice: { todo: T('호 도구로 세 점을 클릭하세요.', 'With the arc tool click the three points.'), check: (ctx, mem) => has(ctx, mem, 'arc'), targets: () => [tile('arc'), ...pts([45, 60], [60, 75], [75, 60])] },
    },
    {
      title: T('타원', 'Ellipses'),
      text: T('타원은 중심 (100,70), 긴 축의 끝 (120,70), 짧은 축 반지름 (100,80)을 클릭합니다.', 'An ellipse: centre (100,70), end of the major axis (120,70), minor radius (100,80).'),
      run: async (ctx) => { await ctx.tool('ellipse'); await ctx.clicks([[100, 70], [120, 70], [100, 80]]); const e = ctx.last('ellipse'); ctx.expect(e && near(e.rx, 20) && near(e.ry, 10), 'ellipse 20 × 10 expected'); },
      practice: { todo: T('타원 도구로 세 점을 클릭하세요.', 'With the ellipse tool click the three points.'), check: (ctx, mem) => has(ctx, mem, 'ellipse'), targets: () => [tile('ellipse'), ...pts([100, 70], [120, 70], [100, 80])] },
    },
    {
      title: T('정다각형', 'Polygons'),
      text: T('정다각형은 중심 (145,70)과 꼭짓점 (155,70)을 클릭합니다. 변의 수는 도구 옵션에서 바꿉니다.', 'A polygon: centre (145,70) and a corner (155,70). The number of sides is a tool option.'),
      run: async (ctx) => { await ctx.tool('polygon'); await ctx.field('[data-tool-option="sides"]', 6); await ctx.clicks([[145, 70], [155, 70]]); ctx.expect(ctx.last('polygon')?.sides === 6, 'hexagon expected'); },
      practice: { todo: T('정다각형 도구로 중심과 꼭짓점을 클릭하세요.', 'With the polygon tool click the centre and a corner.'), check: (ctx, mem) => has(ctx, mem, 'polygon'), targets: () => [tile('polygon'), ...pts([145, 70], [155, 70])] },
    },
    {
      title: T('폴리선', 'Polylines'),
      text: T('폴리선은 여러 점을 이어 한 객체로 만듭니다. (0,95), (30,100), (50,90), (70,100)을 클릭하고 Enter.', 'A polyline joins many points into one object. Click (0,95), (30,100), (50,90), (70,100), then Enter.'),
      run: async (ctx) => { await ctx.tool('polyline'); await ctx.clicks([[0, 95], [30, 100], [50, 90], [70, 100]]); await ctx.key('Enter'); ctx.expect(ctx.last('polyline')?.points.length === 4, 'polyline of 4 points expected'); },
      practice: { todo: T('폴리선 도구로 네 점을 클릭하고 Enter를 누르세요.', 'With the polyline tool click four points, then Enter.'), check: (ctx, mem) => has(ctx, mem, 'polyline'), targets: () => [tile('polyline'), ...pts([0, 95], [30, 100], [50, 90], [70, 100])] },
    },
    {
      title: T('스플라인', 'Splines'),
      text: T('스플라인은 클릭한 점을 부드럽게 지나는 곡선(NURBS)입니다. (85,95), (100,105), (115,90), (130,100)을 클릭하고 Enter.', 'A spline is a smooth curve (NURBS) through the points you click: (85,95), (100,105), (115,90), (130,100), then Enter.'),
      run: async (ctx) => { await ctx.tool('spline'); await ctx.clicks([[85, 95], [100, 105], [115, 90], [130, 100]]); await ctx.key('Enter'); ctx.expect(ctx.last('spline'), 'spline expected'); },
      practice: { todo: T('스플라인 도구로 네 점을 클릭하고 Enter를 누르세요.', 'With the spline tool click four points, then Enter.'), check: (ctx, mem) => has(ctx, mem, 'spline'), targets: () => [tile('spline'), ...pts([85, 95], [100, 105], [115, 90], [130, 100])] },
    },
    {
      title: T('점', 'Points'),
      text: T('점 도구는 기준점을 찍습니다: (150,95).', 'The point tool marks a reference point: (150,95).'),
      run: async (ctx) => { await ctx.tool('point'); await ctx.clickAt(150, 95); await ctx.key('Escape'); selectTool(ctx); ctx.expect(ctx.last('point'), 'point expected'); },
      practice: { todo: T('점 도구로 표시된 곳을 클릭하세요.', 'With the point tool click the mark.'), check: (ctx, mem) => has(ctx, mem, 'point'), targets: () => [tile('point'), ...pts([150, 95])] },
    },
  ],
};

// ───────────────────────── 3. precise input and snaps
const precise = {
  title: T('정밀 입력·스냅·단위', 'Precise input, snaps and units'),
  fresh: true,
  steps: [
    {
      title: T('좌표 입력', 'Typing coordinates'),
      text: T('그리는 중에 숫자를 치면 명령 칸에 들어갑니다. 선 도구에서 0,0 → @80,0 → @0,50 → @-80,0을 입력하면 정확한 크기의 선이 됩니다.', 'Numbers typed while drawing go to the command box. With the line tool type 0,0 → @80,0 → @0,50 → @-80,0 for exact lengths.'),
      run: async (ctx) => {
        await ctx.fresh();
        await ctx.tool('line');
        for (const text of ['0,0', '@80,0', '@0,50', '@-80,0']) await ctx.type(text);
        await ctx.key('Escape');
        ctx.expect(ctx.entities('line').some((l) => near(l.x1, 80) && near(l.y1, 0) && near(l.x2, 80) && near(l.y2, 50)), 'line (80,0)–(80,50) expected');
      },
      practice: { todo: T('선 도구를 고르고 명령 칸에 0,0 · @80,0 · @0,50 · @-80,0을 차례로 입력하세요.', 'Pick the line tool and type 0,0 · @80,0 · @0,50 · @-80,0 into the command box.'), check: (ctx, mem) => added(ctx, mem, 'line').some((l) => near(Math.hypot(l.x2 - l.x1, l.y2 - l.y1), 50) || near(Math.hypot(l.x2 - l.x1, l.y2 - l.y1), 80)), targets: () => [tile('line'), { el: '#command-input' }] },
    },
    {
      title: T('극좌표: 거리<각도', 'Polar: distance<angle'),
      text: T('@40<60은 마지막 점에서 40 mm, 60° 방향입니다. 100,0에서 시작해 @40<60을 입력합니다.', '@40<60 means 40 mm at 60° from the last point. Start at 100,0 and type @40<60.'),
      run: async (ctx) => {
        await ctx.tool('line');
        await ctx.type('100,0');
        await ctx.type('@40<60');
        await ctx.key('Escape');
        ctx.expect(ctx.entities('line').some((l) => near(Math.hypot(l.x2 - l.x1, l.y2 - l.y1), 40) && near((Math.atan2(l.y2 - l.y1, l.x2 - l.x1) * 180) / Math.PI, 60)), '40 mm at 60° expected');
      },
      practice: { todo: T('선 도구로 100,0을 입력한 뒤 @40<60을 입력하세요.', 'With the line tool type 100,0 then @40<60.'), check: (ctx, mem) => added(ctx, mem, 'line').some((l) => near((Math.atan2(l.y2 - l.y1, l.x2 - l.x1) * 180) / Math.PI, 60, 1)), targets: () => [{ el: '#command-input' }] },
    },
    {
      title: T('객체 스냅 (F3)', 'Object snap (F3)'),
      text: T('객체 스냅을 켜면 커서가 끝점·중간점·중심 등에 달라붙습니다. 끝점 (80,50) 근처를 클릭해 원의 중심을 정확히 맞춥니다.', 'With object snap on, the cursor jumps to end points, midpoints, centres… Click near the end point (80,50) to put a circle exactly there.'),
      run: async (ctx) => {
        if (!ctx.settings().snapObject) await ctx.command('snap');
        await ctx.tool('circle');
        await ctx.clickAt(81, 51);
        await ctx.clickAt(92, 50);
        await ctx.key('Escape');
        await ctx.command('snap');
        const c = ctx.last('circle');
        ctx.expect(c && near(c.cx, 80, 0.01) && near(c.cy, 50, 0.01), 'circle centred on the end point expected');
      },
      practice: { todo: T('툴바의 스냅을 켜고, 원 도구로 끝점 근처를 클릭하세요.', 'Switch snap on in the toolbar; with the circle tool click near the end point.'), check: (ctx, mem) => added(ctx, mem, 'circle').some((c) => near(c.cx, 80, 0.01) && near(c.cy, 50, 0.01)), targets: () => [cmd('snap'), ...pts([80, 50])] },
    },
    {
      title: T('직교 모드 (F8)', 'Ortho mode (F8)'),
      text: T('직교 모드에서는 선이 수평·수직으로만 그려집니다.', 'In ortho mode lines are drawn only horizontally or vertically.'),
      run: async (ctx) => {
        await ctx.command('ortho');
        await ctx.tool('line');
        await ctx.clicks([[0, 80], [50, 87]]);
        await ctx.key('Escape');
        await ctx.key('Escape');
        await ctx.command('ortho');
        const l = ctx.last('line');
        ctx.expect(l && near(l.y1, l.y2, 1e-9), 'horizontal line expected');
      },
      practice: { todo: T('직교를 켜고 비스듬히 선을 그어 보세요.', 'Switch ortho on and draw a slanted line.'), check: (ctx, mem) => added(ctx, mem, 'line').some((l) => near(l.y1, l.y2, 1e-9) || near(l.x1, l.x2, 1e-9)), targets: () => [cmd('ortho')] },
    },
    {
      title: T('길이 단위', 'Length units'),
      text: T('설정 › 일반 › 길이 단위에서 mm·cm·m·in·ft를 고릅니다. 도면은 mm로 저장되고 보이는 값만 바뀝니다. 인치로 바꿉니다.', 'Settings › General › Length unit picks mm, cm, m, in or ft. Drawings are stored in mm; only what you see changes. Switch to inches.'),
      run: async (ctx) => {
        await ctx.dialog('settings', () => ctx.api.popups.open('settings', { tab: 'general' }), () => ctx.api.updateSettings({ units: 'in' }));
        ctx.expect(ctx.settings().units === 'in', 'units not inches');
      },
      practice: { todo: T('설정(톱니바퀴) › 일반에서 길이 단위를 인치로 바꾸세요.', 'In Settings (gear) › General set the length unit to inches.'), check: (ctx) => ctx.settings().units === 'in', targets: () => [cmd('settings')] },
    },
    {
      title: T('다른 단위로 입력', 'Typing other units'),
      text: T('숫자 뒤에 단위를 붙이면 자동으로 바뀝니다. 원의 반지름을 25.4mm로 입력하면 1 in가 됩니다.', 'A unit after a number is converted automatically. A radius typed as 25.4mm becomes 1 in.'),
      run: async (ctx) => {
        await ctx.tool('circle');
        await ctx.type('120mm,40mm');
        await ctx.type('@25.4mm<0');
        await ctx.key('Escape');
        ctx.expect(near(ctx.last('circle')?.r ?? 0, 25.4, 0.01), 'radius 25.4 mm expected');
        await ctx.wait(800);
        ctx.api.updateSettings({ units: 'mm' });
      },
      practice: { todo: T('원 도구에서 120mm,40mm 와 @25.4mm<0을 입력하세요.', 'With the circle tool type 120mm,40mm and @25.4mm<0.'), check: (ctx, mem) => added(ctx, mem, 'circle').some((c) => near(c.r, 25.4, 0.01)), targets: () => [{ el: '#command-input' }] },
    },
    {
      title: T('축척 막대', 'The scale bar'),
      text: T('캔버스 왼쪽 아래 축척 막대는 막대 길이가 실제 몇 mm인지와 화면 축척을 보여 줍니다. 끌어서 옮기고, 끝선을 끌어 길이를 바꾸며, 툴바 버튼으로 켜고 끕니다.', 'The scale bar (bottom left) shows how long it is in the drawing and the screen scale. Drag it, drag its end lines to resize it, switch it with its toolbar button.'),
      run: async (ctx) => { await ctx.command('scaleBar'); await ctx.wait(400); await ctx.command('scaleBar'); ctx.expect(ctx.settings().showScaleBar, 'scale bar hidden'); },
      practice: { todo: T('축척 막대를 끌어 옮기거나 끝선을 끌어 보세요.', 'Drag the scale bar, or drag one of its end lines.'), targets: () => [{ el: '#scale-bar' }, cmd('scaleBar')] },
    },
  ],
};

// ───────────────────────── 4. selecting and modifying
const modify = {
  title: T('선택과 수정', 'Selecting and modifying'),
  fresh: true,
  steps: [
    {
      title: T('준비: 사각형과 원', 'Set-up: a rectangle and a circle'),
      text: T('수정할 도형을 그립니다: 사각형 (0,0)–(40,30)과 원 중심 (100,20), 반지름 10.', 'Draw something to modify: a rectangle (0,0)–(40,30) and a circle at (100,20), radius 10.'),
      run: async (ctx) => { await ctx.fresh(); await ctx.tool('rect'); await ctx.clicks([[0, 0], [40, 30]]); await ctx.tool('circle'); await ctx.clicks([[100, 20], [110, 20]]); await ctx.key('Escape'); selectTool(ctx); ctx.expect(ctx.entities('rect').length === 1 && ctx.entities('circle').length === 1, 'set-up failed'); },
      practice: { todo: T('사각형과 원을 그리세요.', 'Draw the rectangle and the circle.'), check: (ctx) => ctx.entities('rect').length >= 1 && ctx.entities('circle').length >= 1, targets: () => pts([0, 0], [40, 30], [100, 20]) },
    },
    {
      title: T('선택', 'Selecting'),
      text: T('선택 도구로 객체를 클릭하면 선택되고 속성 패널에 속성이 나옵니다. 왼쪽→오른쪽으로 끌면 완전히 들어간 것만, 오른쪽→왼쪽은 걸친 것까지 선택합니다.', 'Click an object to select it; its properties show on the right. Dragging left→right selects what is fully inside, right→left what it touches.'),
      run: async (ctx) => { await ctx.tool('select'); await ctx.clickAt(0, 15); ctx.expect(ctx.api.selection().length === 1, 'one object selected expected'); },
      practice: { todo: T('사각형의 변을 클릭하세요.', 'Click an edge of the rectangle.'), check: (ctx) => ctx.api.selection().length >= 1, targets: () => pts([0, 15]) },
    },
    {
      title: T('이동 (M)', 'Move (M)'),
      text: T('선택한 사각형을 이동 도구로 기준점 (0,0)에서 (10,10)으로 옮깁니다.', 'Move the selected rectangle with the move tool from (0,0) to (10,10).'),
      run: async (ctx) => { selectWhere(ctx, (e) => e.type === 'rect'); await ctx.tool('move'); await ctx.clicks([[0, 0], [10, 10]]); selectTool(ctx); ctx.expect(near(ctx.last('rect').x, 10), 'rectangle at x = 10 expected'); },
      practice: { todo: T('사각형을 선택하고 이동 도구로 두 점을 클릭하세요.', 'Select the rectangle, then click two points with the move tool.'), setup: (ctx, mem) => { mem.x = ctx.entities('rect')[0]?.x; }, check: (ctx, mem) => ctx.entities('rect').some((r) => !near(r.x, mem.x, 0.01)), targets: () => [tile('move'), ...pts([0, 0], [10, 10])] },
    },
    {
      title: T('복사', 'Copy'),
      text: T('복사 도구는 기준점에서 여러 번 복사합니다. (10,10)에서 (60,10)으로 복사하고 Esc.', 'The copy tool copies from a base point as often as you click. Copy from (10,10) to (60,10), then Esc.'),
      run: async (ctx) => { selectWhere(ctx, (e) => e.type === 'rect'); await ctx.tool('copy'); await ctx.clicks([[10, 10], [60, 10]]); await ctx.key('Escape'); selectTool(ctx); ctx.expect(ctx.entities('rect').length === 2, 'two rectangles expected'); },
      practice: { todo: T('사각형을 선택하고 복사 도구로 기준점과 새 위치를 클릭하세요.', 'Select the rectangle, then click a base point and a new place with the copy tool.'), check: (ctx, mem) => has(ctx, mem, 'rect'), targets: () => [tile('copy')] },
    },
    {
      title: T('회전', 'Rotate'),
      text: T('복사한 사각형을 기준점 (60,10)에 대해 30° 돌립니다. 기준점을 클릭한 뒤 각도 30을 입력합니다.', 'Rotate the copy by 30° about (60,10): click the base point, then type 30.'),
      run: async (ctx) => { const copy = ctx.entities('rect').at(-1); ctx.select([copy.id]); await ctx.tool('rotate'); await ctx.clickAt(60, 10); await ctx.type('30'); selectTool(ctx); ctx.expect(near(ctx.entities('rect').at(-1).angle, 30, 0.01), '30° expected'); },
      practice: { todo: T('사각형을 선택하고 회전 도구로 기준점을 클릭한 뒤 30을 입력하세요.', 'Select a rectangle, click the base point with the rotate tool, type 30.'), check: (ctx) => ctx.entities('rect').some((r) => near(r.angle, 30, 0.5)), targets: () => [tile('rotate'), { el: '#command-input' }] },
    },
    {
      title: T('대칭', 'Mirror'),
      text: T('원을 x = 130 축에 대칭 복사합니다: 축의 두 점 (130,0), (130,40).', 'Mirror the circle about x = 130: click two points on the axis, (130,0) and (130,40).'),
      run: async (ctx) => { selectWhere(ctx, (e) => e.type === 'circle'); await ctx.tool('mirror'); await ctx.clicks([[130, 0], [130, 40]]); selectTool(ctx); ctx.expect(ctx.entities('circle').some((c) => near(c.cx, 160)), 'mirrored circle at x = 160 expected'); },
      practice: { todo: T('원을 선택하고 대칭 도구로 축의 두 점을 클릭하세요.', 'Select the circle and click two axis points with the mirror tool.'), setup: (ctx, mem) => { mem.circles = ctx.entities('circle').map((c) => c.cx).join(); }, check: (ctx, mem) => ctx.entities('circle').map((c) => c.cx).join() !== mem.circles, targets: () => [tile('mirror'), ...pts([130, 0], [130, 40])] },
    },
    {
      title: T('크기 조정', 'Scale'),
      text: T('첫 번째 원을 중심 (100,20)에 대해 2배로 키웁니다: 기준점을 클릭하고 2 입력.', 'Scale the first circle 2× about its centre: click (100,20) and type 2.'),
      run: async (ctx) => { const c = ctx.entities('circle')[0]; ctx.select([c.id]); await ctx.tool('scale'); await ctx.clickAt(100, 20); await ctx.type('2'); selectTool(ctx); ctx.expect(near(ctx.entities('circle')[0].r, 20, 0.01), 'radius 20 expected'); },
      practice: { todo: T('원을 선택하고 크기 조정 도구로 중심을 클릭한 뒤 2를 입력하세요.', 'Select the circle, click its centre with the scale tool, type 2.'), setup: (ctx, mem) => { mem.r = ctx.entities('circle')[0]?.r; }, check: (ctx, mem) => !near(ctx.entities('circle')[0]?.r ?? mem.r, mem.r, 0.01), targets: () => [tile('scale')] },
    },
    {
      title: T('간격 띄우기', 'Offset'),
      text: T('간격 띄우기는 같은 모양을 일정 거리만큼 띄워 그립니다. 간격 5로 원의 바깥쪽을 클릭합니다.', 'Offset draws the same shape at a distance. With distance 5, pick the circle and click outside it.'),
      run: async (ctx) => { await ctx.tool('offset'); await ctx.field('[data-tool-option="offset"]', 5); await ctx.clickAt(120, 20); await ctx.clickAt(130, 20); await ctx.key('Escape'); selectTool(ctx); ctx.expect(ctx.entities('circle').some((c) => near(c.r, 25, 0.01)), 'offset circle r = 25 expected'); },
      practice: { todo: T('간격 띄우기 도구로 원을 클릭하고 바깥쪽을 클릭하세요.', 'With the offset tool click the circle, then outside it.'), check: (ctx, mem) => has(ctx, mem, 'circle'), targets: () => [tile('offset')] },
    },
    {
      title: T('배열 복사', 'Arrays'),
      text: T('배열 창에서 행·열과 간격(직사각형) 또는 개수와 각도(원형)를 정해 한 번에 복사합니다. 점을 3열 × 2행으로 복사합니다.', 'The array window copies in rows and columns (rectangular) or around a centre (polar). Copy a point into 3 columns × 2 rows.'),
      run: async (ctx) => {
        await ctx.tool('point'); await ctx.clickAt(0, 60); await ctx.key('Escape'); selectTool(ctx);
        selectWhere(ctx, (e) => e.type === 'point');
        await ctx.dialog('array', () => ctx.api.run('array'), () => ctx.api.arrayRect({ rows: 2, columns: 3, dx: 20, dy: 15 }));
        ctx.expect(ctx.entities('point').length === 6, '6 points expected');
      },
      practice: { todo: T('객체를 선택하고 수정 묶음의 "배열 복사…"를 누르세요.', 'Select something and click "Array…" in the modify group.'), check: (ctx, mem) => ctx.entities().length >= mem.start.count + 2, targets: () => [cmd('array')] },
    },
    {
      title: T('분해', 'Explode'),
      text: T('분해는 사각형을 폴리선으로, 폴리선·다각형·부품을 선과 호로 풉니다. 사각형을 두 번 분해하면 선 네 개가 됩니다.', 'Explode turns a rectangle into a polyline, and polylines, polygons and parts into lines and arcs. Exploding a rectangle twice gives four lines.'),
      run: async (ctx) => { ctx.select([ctx.entities('rect')[0].id]); await ctx.command('explode'); ctx.expect(ctx.api.selection().length === 1 && ctx.entities('polyline').length >= 1, 'polyline expected'); await ctx.command('explode'); ctx.expect(ctx.entities('line').length >= 4, '4 lines expected'); },
      practice: { todo: T('사각형을 선택하고 분해를 누르세요.', 'Select a rectangle and click Explode.'), check: (ctx, mem) => has(ctx, mem, 'polyline') || has(ctx, mem, 'line', 4), targets: () => [cmd('explode')] },
    },
    {
      title: T('실행 취소·다시 실행', 'Undo and redo'),
      text: T('Ctrl+Z로 되돌리고 Ctrl+Y로 다시 합니다. 툴바의 화살표 버튼도 같습니다.', 'Ctrl+Z undoes, Ctrl+Y redoes; the arrow buttons on the toolbar do the same.'),
      run: async (ctx) => {
        const ids = () => ctx.entities().map((e) => e.id).join();
        const before = ids();
        await ctx.key('z', { ctrl: true });
        ctx.expect(ids() !== before, 'undo did nothing');
        await ctx.key('y', { ctrl: true });
        ctx.expect(ids() === before, 'redo did not restore');
      },
      practice: { todo: T('툴바의 실행 취소와 다시 실행을 눌러 보세요.', 'Click Undo and then Redo on the toolbar.'), targets: () => [cmd('undo'), cmd('redo')] },
    },
    {
      title: T('삭제', 'Delete'),
      text: T('선택한 객체는 Delete 키로 지웁니다.', 'Delete removes the selection.'),
      run: async (ctx) => { selectWhere(ctx, (e) => e.type === 'point'); const n = ctx.entities().length; await ctx.key('Delete'); ctx.expect(ctx.entities().length < n, 'nothing deleted'); },
      practice: { todo: T('점들을 선택하고 Delete를 누르세요.', 'Select the points and press Delete.'), check: (ctx, mem) => ctx.entities().length < mem.start.count, targets: () => [cmd('delete')] },
    },
  ],
};

// ───────────────────────── 5. dimensions and notes
const annotate = {
  title: T('치수와 주석', 'Dimensions and notes'),
  fresh: true,
  steps: [
    {
      title: T('준비: 판과 구멍', 'Set-up: a plate and a hole'),
      text: T('치수를 넣을 판 (0,0)–(100,60)과 구멍 (50,30) 반지름 20을 그립니다.', 'Draw a plate (0,0)–(100,60) and a hole at (50,30), radius 20, to dimension.'),
      run: async (ctx) => { await ctx.fresh(); await ctx.tool('rect'); await ctx.clicks([[0, 0], [100, 60]]); await ctx.tool('circle'); await ctx.clicks([[50, 30], [70, 30]]); await ctx.key('Escape'); selectTool(ctx); },
      practice: { todo: T('사각형과 원을 그리세요.', 'Draw the rectangle and the circle.'), check: (ctx) => ctx.entities('rect').length >= 1 && ctx.entities('circle').length >= 1, targets: () => pts([0, 0], [100, 60], [50, 30]) },
    },
    {
      title: T('선형 치수', 'Linear dimensions'),
      text: T('선형 치수: 두 점 (0,0), (100,0)을 클릭하고 치수선 위치 (50,-12)를 클릭합니다.', 'Linear dimension: click (0,0) and (100,0), then where the dimension line goes (50,-12).'),
      run: async (ctx) => { await ctx.tool('dimLinear'); await ctx.clicks([[0, 0], [100, 0], [50, -12]]); ctx.expect(ctx.last('dim'), 'dimension expected'); },
      practice: { todo: T('선형 치수 도구로 세 점을 클릭하세요.', 'With the linear dimension tool click the three points.'), check: (ctx, mem) => has(ctx, mem, 'dim'), targets: () => [tile('dimLinear'), ...pts([0, 0], [100, 0], [50, -12])] },
    },
    {
      title: T('정렬 치수', 'Aligned dimensions'),
      text: T('정렬 치수는 두 점을 잇는 방향으로 잽니다: (100,0), (100,60), 위치 (112,30).', 'An aligned dimension measures along the two points: (100,0), (100,60), position (112,30).'),
      run: async (ctx) => { await ctx.tool('dimAligned'); await ctx.clicks([[100, 0], [100, 60], [112, 30]]); ctx.expect(ctx.entities('dim').length >= 2, 'second dimension expected'); },
      practice: { todo: T('정렬 치수 도구로 세 점을 클릭하세요.', 'With the aligned dimension tool click three points.'), check: (ctx, mem) => has(ctx, mem, 'dim'), targets: () => [tile('dimAligned'), ...pts([100, 0], [100, 60], [112, 30])] },
    },
    {
      title: T('지름·반지름 치수', 'Diameter and radius'),
      text: T('지름 치수: 원을 클릭하고 지시선 방향 (80,50)을 클릭합니다.', 'Diameter dimension: click the circle, then the leader direction (80,50).'),
      run: async (ctx) => { await ctx.tool('dimDiameter'); await ctx.clickAt(70, 30); await ctx.clickAt(80, 50); ctx.expect(ctx.entities('dim').some((d) => d.kind === 'diameter'), 'diameter dimension expected'); },
      practice: { todo: T('지름 치수 도구로 원과 방향을 클릭하세요.', 'With the diameter tool click the circle and a direction.'), check: (ctx, mem) => added(ctx, mem, 'dim').some((d) => d.kind === 'diameter' || d.kind === 'radius'), targets: () => [tile('dimDiameter'), ...pts([70, 30])] },
    },
    {
      title: T('각도 치수', 'Angle dimensions'),
      text: T('각도 치수: 꼭짓점 (0,0), 첫 방향 (40,0), 둘째 방향 (0,40)을 클릭합니다.', 'Angle dimension: the vertex (0,0), the first direction (40,0), the second (0,40).'),
      run: async (ctx) => { await ctx.tool('dimAngle'); await ctx.clicks([[0, 0], [40, 0], [0, 40]]); ctx.expect(ctx.entities('dim').some((d) => d.kind === 'angle'), 'angle dimension expected'); },
      practice: { todo: T('각도 치수 도구로 세 점을 클릭하세요.', 'With the angle tool click three points.'), check: (ctx, mem) => added(ctx, mem, 'dim').some((d) => d.kind === 'angle'), targets: () => [tile('dimAngle'), ...pts([0, 0], [40, 0], [0, 40])] },
    },
    {
      title: T('문자', 'Text'),
      text: T('문자 도구로 (0,75)를 클릭하고, 속성 패널의 내용 칸에 "커버 플레이트"를 씁니다.', 'Click (0,75) with the text tool and type "Cover plate" into the properties.'),
      run: async (ctx) => {
        await ctx.tool('text'); await ctx.clickAt(0, 75); await ctx.key('Escape'); selectTool(ctx);
        ctx.select([ctx.last('text').id]);
        await ctx.field('#right-panel [data-prop="text"]', ctx.lang === 'ko' ? '커버 플레이트' : 'Cover plate');
        ctx.expect(/커버|Cover/.test(ctx.last('text').text), 'text not changed');
      },
      practice: { todo: T('문자 도구로 클릭한 뒤 속성 패널에서 내용을 바꾸세요.', 'Click with the text tool, then change the content in the properties.'), check: (ctx, mem) => has(ctx, mem, 'text'), targets: () => [tile('text'), ...pts([0, 75])] },
    },
    {
      title: T('지시선', 'Leaders'),
      text: T('지시선: 화살표 끝 (62,38), 꺾임 (85,80), (100,80)을 클릭하고 Enter. 메모는 속성 패널에서 고칩니다.', 'Leader: arrow tip (62,38), bends (85,80) and (100,80), then Enter. Edit the note in the properties.'),
      run: async (ctx) => { await ctx.tool('leader'); await ctx.clicks([[62, 38], [85, 80], [100, 80]]); await ctx.key('Enter'); selectTool(ctx); ctx.expect(ctx.last('leader'), 'leader expected'); },
      practice: { todo: T('지시선 도구로 세 점을 클릭하고 Enter를 누르세요.', 'With the leader tool click three points, then Enter.'), check: (ctx, mem) => has(ctx, mem, 'leader'), targets: () => [tile('leader'), ...pts([62, 38], [85, 80], [100, 80])] },
    },
    {
      title: T('해칭', 'Hatching'),
      text: T('해칭 도구로 닫힌 영역 안 (10,10)을 클릭합니다. 안쪽 원은 구멍으로 남습니다. 무늬·배율·각도는 도구 옵션입니다.', 'Click inside a closed area (10,10) with the hatch tool; the inner circle stays a hole. Pattern, scale and angle are tool options.'),
      run: async (ctx) => { await ctx.tool('hatch'); await ctx.clickAt(10, 10); await ctx.key('Escape'); selectTool(ctx); const h = ctx.last('hatch'); ctx.expect(h && h.loops.length === 2, 'hatch with a hole expected'); },
      practice: { todo: T('해칭 도구로 사각형 안(원 바깥)을 클릭하세요.', 'With the hatch tool click inside the rectangle (outside the circle).'), check: (ctx, mem) => has(ctx, mem, 'hatch'), targets: () => [tile('hatch'), ...pts([10, 10])] },
    },
    {
      title: T('중심선', 'Centre lines'),
      text: T('중심선은 일점쇄선으로 중심선 레이어에 그려집니다: (30,30) → (70,30).', 'Centre lines are dash-dot lines on the centre-line layer: (30,30) → (70,30).'),
      run: async (ctx) => { await ctx.tool('centerline'); await ctx.clicks([[30, 30], [70, 30]]); await ctx.key('Escape'); await ctx.key('Escape'); ctx.expect(ctx.entities('line').some((l) => l.lineType === 'center'), 'centre line expected'); },
      practice: { todo: T('중심선 도구로 두 점을 클릭하세요.', 'With the centre-line tool click two points.'), check: (ctx, mem) => added(ctx, mem, 'line').some((l) => l.lineType === 'center'), targets: () => [tile('centerline'), ...pts([30, 30], [70, 30])] },
    },
    {
      title: T('거리 재기', 'Measuring'),
      text: T('거리 재기는 두 점 사이의 거리·각도·Δx·Δy를 알려 줍니다: (0,0) → (100,60).', 'Measure gives the distance, angle, Δx and Δy between two points: (0,0) → (100,60).'),
      run: async (ctx) => { await ctx.tool('measure'); await ctx.clicks([[0, 0], [100, 60]]); await ctx.key('Escape'); selectTool(ctx); ctx.expect(/116\.6/.test(ctx.api.notice()), 'distance 116.6 expected'); },
      practice: { todo: T('거리 재기 도구로 두 점을 클릭하세요.', 'With the measure tool click two points.'), check: (ctx) => /\d/.test(ctx.api.notice()), targets: () => [tile('measure')] },
    },
  ],
};

// ───────────────────────── 6. properties and layers
const props = {
  title: T('속성과 레이어', 'Properties and layers'),
  steps: [
    {
      title: T('속성 패널에서 고치기', 'Editing in the properties'),
      text: T('원을 선택하고 반지름 칸에 25를 입력합니다. − / + 버튼으로 한 단계씩 바꿀 수도 있습니다.', 'Select the circle and type 25 for the radius. The − / + buttons step it.'),
      run: async (ctx) => { selectTool(ctx); ctx.select([ctx.entities('circle')[0].id]); await ctx.field('#right-panel [data-prop="r"]', 25); ctx.expect(near(ctx.entities('circle')[0].r, 25, 1e-9), 'radius 25 expected'); },
      practice: { todo: T('원을 선택하고 속성 패널의 반지름을 바꾸세요.', 'Select the circle and change its radius in the properties.'), setup: (ctx, mem) => { mem.r = ctx.entities('circle')[0]?.r; }, check: (ctx, mem) => !near(ctx.entities('circle')[0]?.r ?? mem.r, mem.r, 1e-9), targets: () => [{ el: '#right-panel [data-prop="r"]' }] },
    },
    {
      title: T('계산식과 단위', 'Formulas and units'),
      text: T('숫자 칸에는 계산식(10*2+2)과 다른 단위(1in)를 쓸 수 있습니다. 반지름에 1in를 입력하면 25.4 mm가 됩니다.', 'Number fields take formulas (10*2+2) and other units (1in). A radius of 1in becomes 25.4 mm.'),
      run: async (ctx) => { ctx.select([ctx.entities('circle')[0].id]); await ctx.field('#right-panel [data-prop="r"]', '10*2+2'); ctx.expect(near(ctx.entities('circle')[0].r, 22, 1e-9), '22 expected'); await ctx.field('#right-panel [data-prop="r"]', '1in'); ctx.expect(near(ctx.entities('circle')[0].r, 25.4, 1e-9), '25.4 expected'); },
      practice: { todo: T('반지름 칸에 1in를 입력하세요.', 'Type 1in into the radius field.'), check: (ctx) => near(ctx.entities('circle')[0]?.r ?? 0, 25.4, 1e-6), targets: () => [{ el: '#right-panel [data-prop="r"]' }] },
    },
    {
      title: T('선 종류·굵기·색', 'Line type, width and colour'),
      text: T('선 종류를 파선으로, 굵기를 0.5 mm로 바꿉니다. 비워 두면 레이어를 따릅니다.', 'Set the line type to dashed and the width to 0.5 mm. "By layer" uses the layer\'s style.'),
      run: async (ctx) => { ctx.select([ctx.entities('circle')[0].id]); await ctx.field('#right-panel [data-style="lineType"]', 'dashed'); await ctx.field('#right-panel [data-style="lineWidth"]', '0.5'); const c = ctx.entities('circle')[0]; ctx.expect(c.lineType === 'dashed' && c.lineWidth === 0.5, 'style not changed'); },
      practice: { todo: T('속성 패널에서 선 종류를 바꾸세요.', 'Change the line type in the properties.'), check: (ctx) => ctx.entities('circle')[0]?.lineType === 'dashed', targets: () => [{ el: '#right-panel [data-style="lineType"]' }] },
    },
    {
      title: T('레이어', 'Layers'),
      text: T('레이어 묶음에서 새 레이어를 만들고, 눈 아이콘으로 숨기고, 자물쇠로 잠급니다. 이름을 누르면 현재 레이어가 됩니다.', 'In the layers group add a layer, hide it with the eye, lock it with the padlock. Click a name to make it the current layer.'),
      run: async (ctx) => {
        ctx.api.openSection('layers');
        const n = ctx.drawing().layers.length;
        await ctx.command('addLayer');
        ctx.expect(ctx.drawing().layers.length === n + 1, 'layer not added');
        const id = ctx.drawing().layers.at(-1).id;
        await ctx.click(`[data-layer-visible="${id}"]`);
        ctx.expect(ctx.drawing().layers.at(-1).visible === false, 'layer not hidden');
        await ctx.click(`[data-layer-visible="${id}"]`);
      },
      practice: { todo: T('레이어 묶음의 "레이어 추가"를 누르세요.', 'Click "Add layer" in the layers group.'), setup: (ctx, mem) => { mem.layers = ctx.drawing().layers.length; }, check: (ctx, mem) => ctx.drawing().layers.length > mem.layers, targets: () => [cmd('addLayer')] },
    },
  ],
};

// ───────────────────────── 7. parts library
const parts = {
  title: T('부품 라이브러리', 'The parts library'),
  fresh: true,
  steps: [
    {
      title: T('기어 넣기', 'Placing a gear'),
      text: T('부품 묶음에서 기어를 고르면 부품 창이 열립니다. 모듈·잇수를 정하고 넣기를 누른 뒤 도면에 클릭해 놓습니다.', 'Pick a gear in the parts group: the part window opens. Set the module and teeth, press Insert, then click to place it.'),
      run: async (ctx) => {
        await ctx.fresh();
        await ctx.dialog('part', () => ctx.api.openPartDialog({ kind: 'gear' }), () => ctx.api.placePart('gear', { module: 2, teeth: 20 }));
        await ctx.clickAt(40, 50);
        selectTool(ctx);
        ctx.expect(ctx.entities('part').some((e) => e.kind === 'gear'), 'gear expected');
      },
      practice: { todo: T('부품 묶음에서 기어를 넣으세요.', 'Insert a gear from the parts group.'), check: (ctx, mem) => added(ctx, mem, 'part').length >= 1, targets: () => [{ el: '#left-panel [data-section="parts"]' }] },
    },
    {
      title: T('볼트와 너트', 'Bolts and nuts'),
      text: T('ISO 볼트·너트·와셔·베어링 등 36가지 부품이 있습니다. M10 볼트를 놓습니다.', 'There are 36 parts — ISO bolts, nuts, washers, bearings… Place an M10 bolt.'),
      run: async (ctx) => {
        await ctx.dialog('part', () => ctx.api.openPartDialog({ kind: 'bolt' }), () => ctx.api.placePart('bolt', {}));
        await ctx.clickAt(110, 50);
        selectTool(ctx);
        ctx.expect(ctx.entities('part').some((e) => e.kind === 'bolt'), 'bolt expected');
      },
      practice: { todo: T('부품 묶음에서 볼트를 넣으세요.', 'Insert a bolt.'), check: (ctx, mem) => added(ctx, mem, 'part').length >= 1, targets: () => [{ el: '#left-panel [data-section="parts"]' }] },
    },
    {
      title: T('부품 치수 바꾸기', 'Changing a part'),
      text: T('부품을 선택하면 속성 패널에서 치수를 바로 바꿉니다. 기어 잇수를 30으로 바꿉니다.', 'A selected part shows its sizes in the properties. Change the gear to 30 teeth.'),
      run: async (ctx) => { const gear = ctx.entities('part').find((e) => e.kind === 'gear'); ctx.select([gear.id]); await ctx.field('#right-panel [data-param="teeth"]', 30); ctx.expect(ctx.entities('part').find((e) => e.kind === 'gear').params.teeth === 30, '30 teeth expected'); },
      practice: { todo: T('기어를 선택하고 잇수를 바꾸세요.', 'Select the gear and change its number of teeth.'), setup: (ctx, mem) => { mem.teeth = ctx.entities('part').find((e) => e.kind === 'gear')?.params.teeth; }, check: (ctx, mem) => ctx.entities('part').find((e) => e.kind === 'gear')?.params.teeth !== mem.teeth, targets: () => [{ el: '#right-panel [data-param="teeth"]' }] },
    },
  ],
};

// ───────────────────────── 8. 3D solids
const solids = {
  title: T('3D 솔리드', '3D solids'),
  fresh: true,
  steps: [
    {
      title: T('상자 넣기', 'A box'),
      text: T('3D 도형 묶음의 상자를 누르면 솔리드 창에서 크기와 위치를 정합니다. 60 × 40 × 20 상자를 넣습니다.', 'Click Box in the 3D shapes group; the solid window sets its size and place. Insert a 60 × 40 × 20 box.'),
      run: async (ctx) => {
        await ctx.fresh();
        await ctx.dialog('solid', () => ctx.api.openSolidDialog({ kind: 'box' }), () => ctx.api.insertSolid('box', { length: 60, width: 40, height: 20 }, { x: 0, y: 0, z: 0 }));
        ctx.expect(ctx.entities('solid').some((e) => e.kind === 'box'), 'box expected');
      },
      practice: { todo: T('3D 도형 묶음에서 상자를 넣으세요.', 'Insert a box from the 3D shapes group.'), check: (ctx, mem) => has(ctx, mem, 'solid'), targets: () => [{ el: '#left-panel [data-command="solid:box"]' }] },
    },
    {
      title: T('원기둥', 'A cylinder'),
      text: T('원기둥(반지름 10, 높이 40)을 상자 위 (30,20)에 넣습니다. 원뿔·구·토러스·튜브·쐐기·각기둥·타원체·나선도 같습니다.', 'Insert a cylinder (radius 10, height 40) at (30,20). Cones, spheres, tori, tubes, wedges, prisms, ellipsoids and helices work the same way.'),
      run: async (ctx) => { await ctx.dialog('solid', () => ctx.api.openSolidDialog({ kind: 'cylinder' }), () => ctx.api.insertSolid('cylinder', { radius: 10, height: 40 }, { x: 30, y: 20, z: 0 })); ctx.expect(ctx.entities('solid').length >= 2, 'cylinder expected'); },
      practice: { todo: T('원기둥을 넣으세요.', 'Insert a cylinder.'), check: (ctx, mem) => has(ctx, mem, 'solid'), targets: () => [{ el: '#left-panel [data-command="solid:cylinder"]' }] },
    },
    {
      title: T('3D로 보기', 'Seeing it in 3D'),
      text: T('3D 보기로 바꿉니다. 왼쪽 끌기로 돌리고, 휠로 확대하며, 오른쪽 끌기로 옮깁니다.', 'Switch to 3D. Drag to orbit, wheel to zoom, right-drag to pan.'),
      run: async (ctx) => { await ctx.command('view3d'); await ctx.api.waitIdle(800); ctx.expect(ctx.api.state().view3d, '3D view not shown'); },
      practice: { todo: T('3D 보기 버튼을 누르세요.', 'Click the 3D view button.'), check: (ctx) => ctx.api.state().view3d, targets: () => [cmd('view3d')] },
    },
    {
      title: T('시점 바꾸기', 'Views'),
      text: T('3D 막대에서 위·정면·오른쪽·등각 시점을 고릅니다.', 'The 3D bar picks top, front, right and isometric views.'),
      run: async (ctx) => { await ctx.click('.view3d-bar [data-view3d="view:top"]'); await ctx.wait(600); await ctx.click('.view3d-bar [data-view3d="view:iso"]'); },
      practice: { todo: T('3D 막대의 "위" 버튼을 누르세요.', 'Click "Top" on the 3D bar.'), targets: () => [{ el: '.view3d-bar [data-view3d="view:top"]' }] },
    },
    {
      title: T('위치와 회전', 'Position and rotation'),
      text: T('솔리드를 선택하면 속성 패널에서 X·Y·Z 위치와 회전을 바꿉니다. 원기둥을 z = 20으로 올립니다.', 'A selected solid shows X, Y, Z and rotations in the properties. Lift the cylinder to z = 20.'),
      run: async (ctx) => { const cyl = ctx.entities('solid').find((e) => e.kind === 'cylinder'); ctx.select([cyl.id]); await ctx.field('#right-panel [data-prop="z"]', 20); ctx.expect(near(ctx.entities('solid').find((e) => e.kind === 'cylinder').z, 20, 1e-9), 'z = 20 expected'); },
      practice: { todo: T('원기둥을 선택하고 Z를 바꾸세요.', 'Select the cylinder and change Z.'), check: (ctx) => ctx.entities('solid').some((e) => e.kind === 'cylinder' && !near(e.z, 0, 1e-9)), targets: () => [{ el: '#right-panel [data-prop="z"]' }] },
    },
    {
      title: T('2D로 돌아가기', 'Back to 2D'),
      text: T('3D 보기 버튼을 다시 누르면 2D로 돌아갑니다. 솔리드는 2D에서 윤곽으로 보입니다.', 'Click the 3D button again to return to 2D; solids show as outlines there.'),
      run: async (ctx) => { await ctx.command('view3d'); await ctx.api.waitIdle(300); ctx.expect(!ctx.api.state().view3d, 'still in 3D'); },
      practice: { todo: T('3D 보기 버튼을 다시 누르세요.', 'Click the 3D button again.'), check: (ctx) => !ctx.api.state().view3d, targets: () => [cmd('view3d')] },
    },
  ],
};

// ───────────────────────── 9. features from 2D
const features = {
  title: T('2D에서 3D로: 돌출·회전·로프트·스윕', '2D to 3D: pad, revolve, loft, sweep'),
  fresh: true,
  steps: [
    {
      title: T('돌출 (Pad)', 'Pad (extrude)'),
      text: T('닫힌 윤곽(사각형 + 안쪽 원)을 선택하고 돌출하면 구멍 뚫린 판이 됩니다. 높이 15.', 'Select closed outlines (a rectangle and a circle inside) and pad them: a plate with a hole, 15 high.'),
      run: async (ctx) => {
        await ctx.fresh();
        await ctx.tool('rect'); await ctx.clicks([[0, 0], [60, 40]]);
        await ctx.tool('circle'); await ctx.clicks([[30, 20], [38, 20]]); await ctx.key('Escape'); selectTool(ctx);
        ctx.select(ctx.entities().map((e) => e.id));
        await ctx.dialog('solid', () => ctx.api.run('solid:pad'), () => ctx.api.applyFeature('pad', { height: 15 }));
        ctx.expect(ctx.entities('solid').some((e) => e.kind === 'pad'), 'pad expected');
      },
      practice: { todo: T('사각형과 원을 그려 선택하고 "돌출"을 누르세요.', 'Draw, select a rectangle and a circle, then click "Pad".'), check: (ctx, mem) => added(ctx, mem, 'solid').some((e) => e.kind === 'pad'), targets: () => [{ el: '#left-panel [data-command="solid:pad"]' }] },
    },
    {
      title: T('회전 (Revolve)', 'Revolve'),
      text: T('단면 윤곽을 축 둘레로 돌립니다. (80,0)–(95,0)–(95,30)–(85,30)–(80,0) 폴리선을 그려 Y축 둘레로 360° 돌립니다.', 'Revolve a profile around an axis. Draw the polyline (80,0)–(95,0)–(95,30)–(85,30) closed, and revolve it 360° about Y.'),
      run: async (ctx) => {
        await ctx.tool('polyline'); await ctx.clicks([[80, 0], [95, 0], [95, 30], [85, 30], [80, 0]]); selectTool(ctx);
        ctx.select([ctx.last('polyline').id]);
        await ctx.dialog('solid', () => ctx.api.run('solid:revolution'), () => ctx.api.applyFeature('revolution', { angle: 360 }));
        ctx.expect(ctx.entities('solid').some((e) => e.kind === 'revolution'), 'revolution expected');
      },
      practice: { todo: T('닫힌 폴리선을 선택하고 "회전"을 누르세요.', 'Select a closed polyline and click "Revolve".'), check: (ctx, mem) => added(ctx, mem, 'solid').some((e) => e.kind === 'revolution'), targets: () => [{ el: '#left-panel [data-command="solid:revolution"]' }] },
    },
    {
      title: T('로프트 (Loft)', 'Loft'),
      text: T('두 윤곽 사이를 부드럽게 잇습니다. 사각형과 원을 선택해 높이 30으로 로프트합니다.', 'A loft joins two outlines smoothly. Select a rectangle and a circle and loft them 30 high.'),
      run: async (ctx) => {
        await ctx.tool('rect'); await ctx.clicks([[110, 0], [140, 30]]);
        await ctx.tool('circle'); await ctx.clicks([[125, 15], [135, 15]]); await ctx.key('Escape'); selectTool(ctx);
        ctx.select([ctx.last('rect').id, ctx.last('circle').id]);
        await ctx.dialog('solid', () => ctx.api.run('solid:loft'), () => ctx.api.applyFeature('loft', { height: 30 }));
        ctx.expect(ctx.entities('solid').some((e) => e.kind === 'loft'), 'loft expected');
      },
      practice: { todo: T('두 윤곽을 선택하고 "로프트"를 누르세요.', 'Select two outlines and click "Loft".'), check: (ctx, mem) => added(ctx, mem, 'solid').some((e) => e.kind === 'loft'), targets: () => [{ el: '#left-panel [data-command="solid:loft"]' }] },
    },
    {
      title: T('스윕 (Sweep)', 'Sweep'),
      text: T('경로를 따라 원형 단면을 쓸어 관을 만듭니다. 폴리선 경로를 그려 반지름 3으로 스윕합니다.', 'Sweep a round section along a path to make a pipe. Draw a polyline path and sweep it with radius 3.'),
      run: async (ctx) => {
        await ctx.tool('polyline'); await ctx.clicks([[0, 70], [40, 70], [60, 90], [100, 90]]); await ctx.key('Enter'); selectTool(ctx);
        ctx.select([ctx.last('polyline').id]);
        await ctx.dialog('solid', () => ctx.api.run('solid:sweep'), () => ctx.api.applyFeature('sweep', { radius: 3 }));
        ctx.expect(ctx.entities('solid').some((e) => e.kind === 'sweep'), 'sweep expected');
      },
      practice: { todo: T('열린 폴리선을 선택하고 "스윕"을 누르세요.', 'Select an open polyline and click "Sweep".'), check: (ctx, mem) => added(ctx, mem, 'solid').some((e) => e.kind === 'sweep'), targets: () => [{ el: '#left-panel [data-command="solid:sweep"]' }] },
    },
  ],
};

// ───────────────────────── 10. booleans
const booleans = {
  title: T('불리언: 빼기·합치기·교차', 'Booleans: cut, fuse, common'),
  fresh: true,
  steps: [
    {
      title: T('빼기 (Cut)', 'Cut'),
      text: T('판(상자)에서 원기둥을 빼 구멍을 뚫습니다. 판을 먼저, 원기둥을 다음에 선택하고 빼기를 누릅니다.', 'Cut a cylinder out of a plate. Select the plate first, then the cylinder, and click Cut.'),
      run: async (ctx) => {
        await ctx.fresh();
        const plate = ctx.api.insertSolid('box', { length: 60, width: 40, height: 10 }, { x: 0, y: 0, z: 0 });
        const drill = ctx.api.insertSolid('cylinder', { radius: 6, height: 30 }, { x: 30, y: 20, z: -10 });
        ctx.select([plate.id, drill.id]);
        await ctx.command('bool:cut');
        ctx.expect(ctx.entities('solid').some((e) => e.kind === 'boolean' && e.shape?.op === 'cut'), 'cut expected');
      },
      practice: { todo: T('두 솔리드를 선택하고 "빼기"를 누르세요.', 'Select two solids and click "Cut".'), check: (ctx, mem) => ctx.entities('solid').some((e) => e.kind === 'boolean'), targets: () => [{ el: '#left-panel [data-command="bool:cut"]' }] },
    },
    {
      title: T('합치기 (Fuse)', 'Fuse'),
      text: T('두 솔리드를 하나로 합칩니다. 구멍 뚫린 판과 새 상자를 합칩니다.', 'Fuse two solids into one: the drilled plate and a new box.'),
      run: async (ctx) => {
        const block = ctx.api.insertSolid('box', { length: 20, width: 40, height: 30 }, { x: 60, y: 0, z: 0 });
        const base = ctx.entities('solid').find((e) => e.kind === 'boolean');
        ctx.select([base.id, block.id]);
        await ctx.command('bool:union');
        ctx.expect(ctx.entities('solid').some((e) => e.kind === 'boolean' && e.shape?.op === 'union'), 'fuse expected');
      },
      practice: { todo: T('두 솔리드를 선택하고 "합치기"를 누르세요.', 'Select two solids and click "Fuse".'), check: (ctx) => ctx.entities('solid').some((e) => e.kind === 'boolean' && e.shape?.op === 'union'), targets: () => [{ el: '#left-panel [data-command="bool:union"]' }] },
    },
    {
      title: T('분해로 되돌리기', 'Explode gives the parts back'),
      text: T('불리언은 FreeCAD처럼 트리로 남습니다. 분해하면 원래 솔리드로 돌아갑니다.', 'Booleans stay a tree, like in FreeCAD. Explode gives the original solids back.'),
      run: async (ctx) => { const b = ctx.entities('solid').find((e) => e.kind === 'boolean'); ctx.select([b.id]); await ctx.command('explode'); ctx.expect(ctx.entities('solid').length >= 2, 'parts expected'); await ctx.key('z', { ctrl: true }); },
      practice: { todo: T('불리언 솔리드를 선택하고 분해를 누르세요.', 'Select the boolean solid and click Explode.'), check: (ctx) => !ctx.entities('solid').some((e) => e.kind === 'boolean' && e.shape?.op === 'union'), targets: () => [cmd('explode')] },
    },
  ],
};

// ───────────────────────── 11. drawing views and sections
const views = {
  title: T('도면 뷰와 단면', 'Drawing views and sections'),
  steps: [
    {
      title: T('투영 도면 만들기', 'Projected views'),
      text: T('솔리드에서 정면·평면·우측면(숨은선 포함)과 등각 투상도를 자동으로 그립니다.', 'Make front, top and right views (with hidden lines) and an isometric view from the solids.'),
      run: async (ctx) => {
        ctx.select(ctx.entities('solid').map((e) => e.id));
        const before = ctx.entities().length;
        await ctx.dialog('solid', () => ctx.api.run('solidProject'), () => ctx.api.projectSolids({ gap: 20, views: { top: true, front: true, right: true, iso: true } }));
        ctx.expect(ctx.entities().length > before + 10, 'views expected');
        ctx.api.zoomFit();
      },
      practice: { todo: T('솔리드를 선택하고 "도면 뷰 만들기"를 누르세요.', 'Select the solids and click "Make drawing views".'), check: (ctx, mem) => ctx.entities().length > mem.start.count + 10, targets: () => [{ el: '#left-panel [data-command="solidProject"]' }] },
    },
    {
      title: T('단면', 'Sections'),
      text: T('높이 z = 5에서 자른 단면 윤곽을 그립니다.', 'Draw the section outline at height z = 5.'),
      run: async (ctx) => {
        ctx.select(ctx.entities('solid').map((e) => e.id));
        const before = ctx.entities().length;
        await ctx.dialog('solid', () => ctx.api.run('solidSection'), () => ctx.api.sectionSolids(5));
        ctx.expect(ctx.entities().length > before, 'section expected');
      },
      practice: { todo: T('솔리드를 선택하고 "단면 만들기"를 누르세요.', 'Select the solids and click "Make section".'), check: (ctx, mem) => ctx.entities().length > mem.start.count, targets: () => [{ el: '#left-panel [data-command="solidSection"]' }] },
    },
  ],
};

// ───────────────────────── 12. the 3D view in depth
const view3d = {
  title: T('3D 보기 자세히', 'The 3D view in depth'),
  steps: [
    {
      title: T('보기 스타일과 좌표축', 'Draw styles and axes'),
      text: T('3D 막대의 스타일 단추로 기본 · 음영 · 숨은선 · X-Ray · 스케치 · 와이어프레임 등 10가지 보기를 고릅니다. 좌표축(눈금 포함)도 켜고 끕니다. 바닥 격자는 확대해도 5 × 5 칸으로 보입니다.', 'The style button on the 3D bar picks one of ten looks: as is, shaded, hidden line, X-ray, sketch, wireframe and more. The axes (with ticks) switch on and off. The ground grid keeps 5 × 5 cells while zooming.'),
      run: async (ctx) => { await ctx.command('view3d'); await ctx.api.waitIdle(800); for (const style of ['xray', 'sketch', 'asis']) { await ctx.command(`view3dStyle:${style}`); await ctx.wait(600); } },
      practice: { todo: T('3D 막대의 스타일 단추를 눌러 X-Ray 나 스케치를 골라 보세요.', 'Click the style button on the 3D bar and pick X-ray or sketch.'), setup: (ctx, mem) => { mem.style = ctx.settings().view3dStyle; }, check: (ctx, mem) => ctx.settings().view3dStyle !== mem.style, targets: () => [{ el: '.view3d-bar [data-view3d="styleMenu"]' }] },
    },
    {
      title: T('광원 (해)', 'The light (sun)'),
      text: T('해 아이콘을 끌어 빛의 방향을 바꾸고, 두 번 누르면 켜고 끕니다. 해를 클릭하면 방위·고도·세기·색·그림자가 속성 패널에 나옵니다.', 'Drag the sun to move the light; double-click switches it. Clicking the sun shows azimuth, elevation, strength, colour and shadows in the properties.'),
      run: async (ctx) => { await ctx.command('lightProperties'); await ctx.field('#right-panel [data-light="azimuth"]', 200); ctx.expect(near(ctx.settings().light.azimuth, 200, 0.5), 'azimuth 200 expected'); await ctx.field('#right-panel [data-light="azimuth"]', 135); },
      practice: { todo: T('해를 끌거나 클릭해 속성 패널에서 방위를 바꾸세요.', 'Drag or click the sun and change its azimuth.'), setup: (ctx, mem) => { mem.az = ctx.settings().light.azimuth; }, check: (ctx, mem) => !near(ctx.settings().light.azimuth, mem.az, 0.5), targets: () => [{ el: '.view3d-bar [data-view3d="light"]' }] },
    },
    {
      title: T('2D로', 'Back to 2D'),
      text: T('3D 보기를 닫습니다.', 'Close the 3D view.'),
      run: async (ctx) => { await ctx.command('view3d'); await ctx.api.waitIdle(300); ctx.expect(!ctx.api.state().view3d, 'still in 3D'); },
      practice: { todo: T('3D 보기 버튼을 누르세요.', 'Click the 3D view button.'), check: (ctx) => !ctx.api.state().view3d, targets: () => [cmd('view3d')] },
    },
  ],
};

// ───────────────────────── 13. files
const files = {
  title: T('파일: 저장·열기·가져오기·내보내기', 'Files: save, open, import, export'),
  fresh: true,
  steps: [
    {
      title: T('저장과 열기', 'Save and open'),
      text: T('Ctrl+S로 .mcad 파일로 저장하고 Ctrl+O로 엽니다. 최근 파일 목록과 마지막 폴더를 기억하며, 시작할 때 지난 도면을 다시 엽니다.', 'Ctrl+S saves a .mcad file, Ctrl+O opens. Recent files and the last folder are remembered; the last drawings reopen at start-up.'),
      run: async (ctx) => { await ctx.fresh(); await ctx.wait(800); },
      practice: { todo: T('툴바의 저장·열기 버튼을 확인하세요.', 'Find Save and Open on the toolbar.'), targets: () => [cmd('save'), cmd('open'), cmd('recent')] },
    },
    {
      title: T('다른 CAD 도면 열기', 'Opening other CAD drawings'),
      text: T('DXF(텍스트·바이너리, R12–2018), SVG, IGES, HP-GL, Gerber, Excellon을 엽니다. FreeCAD가 만든 IGES를 엽니다.', 'DXF (text and binary, R12–2018), SVG, IGES, HP-GL, Gerber and Excellon open too. Open an IGES file made by FreeCAD.'),
      run: async (ctx) => { await ctx.api.openSample('drawings/freecad-plate.igs'); await ctx.api.waitIdle(); ctx.expect(ctx.api.activeFormat() === 'iges', 'IGES not open'); },
      practice: { todo: T('시작 페이지의 "파일 교환" 샘플이나 열기(Ctrl+O)로 DXF·IGES·SVG 파일을 여세요.', 'Open a DXF, IGES or SVG file with Open (Ctrl+O) or the start page.'), check: (ctx) => ['dxf', 'iges', 'svg', 'hpgl', 'gerber', 'excellon'].includes(ctx.api.activeFormat()), targets: () => [cmd('open')] },
    },
    {
      title: T('PCB 거버', 'PCB Gerber'),
      text: T('Gerber는 PCB 동박·실크 레이어의 표준 형식입니다. 패드·배선(선 굵기 유지)·구리 영역이 그대로 열립니다.', 'Gerber is the standard for PCB copper and silkscreen layers. Pads, tracks (with their widths) and copper areas open as drawn.'),
      run: async (ctx) => { await ctx.api.openSample('drawings/pcb-board-top.gtl'); await ctx.api.waitIdle(); ctx.expect(ctx.api.activeFormat() === 'gerber', 'Gerber not open'); },
      practice: { todo: T('Gerber 샘플을 열어 보세요.', 'Open the Gerber sample.'), check: (ctx) => ctx.api.activeFormat() === 'gerber', targets: () => [cmd('open')] },
    },
    {
      title: T('내보내기', 'Exporting'),
      text: T('내보내기 메뉴: DXF R12·2000, SVG, IGES, HP-GL/2, PNG, 3D 프린팅(STL), 그리고 FreeCAD·STEP·3MF 등 3D 형식.', 'The export menu: DXF R12 and 2000, SVG, IGES, HP-GL/2, PNG, STL for 3D printing, and 3D formats (FreeCAD, STEP, 3MF…).'),
      run: async (ctx) => { await ctx.command('exportMenu'); await ctx.wait(1500); ctx.api.closeMenu(); },
      practice: { todo: T('툴바의 내보내기 버튼을 눌러 메뉴를 보세요.', 'Click Export on the toolbar to see the menu.'), targets: () => [cmd('exportMenu')] },
    },
    {
      title: T('끌어 놓기', 'Drag and drop'),
      text: T('탐색기에서 도면·3D 모델 파일을 끌어다 놓으면 열리고, 그림은 배경이 되며, 글은 문자로 붙습니다.', 'Drop drawings and 3D models from the file manager to open them; images become the background, text is pasted as text.'),
      run: async (ctx) => { await ctx.wait(600); },
    },
  ],
};

// ───────────────────────── 14. printing and 3D printing
const printing = {
  title: T('인쇄와 3D 프린팅', 'Printing and 3D printing'),
  fresh: true,
  steps: [
    {
      title: T('인쇄 미리보기', 'Print preview'),
      text: T('인쇄(Ctrl+P) 창에서 용지·방향·여백·축척·표제란·흑백과 인쇄할 범위(도면·레이어·선택)를 정합니다. PDF로도 저장됩니다.', 'The print window (Ctrl+P) sets paper, orientation, margins, scale, title block, black-and-white and what to print (drawings, layers, selection). It also saves PDF.'),
      run: async (ctx) => { await ctx.api.openSample('02-flange.mcad'); await ctx.api.waitIdle(); await ctx.dialog('print', () => ctx.api.run('print'), null, 2200); },
      practice: { todo: T('툴바의 인쇄 버튼을 누르세요.', 'Click Print on the toolbar.'), targets: () => [cmd('print')] },
    },
    {
      title: T('3D 프린팅 (STL)', '3D printing (STL)'),
      text: T('STL 창은 닫힌 윤곽을 두께가 있는 판으로 만들어 미리 보여 줍니다(구멍 포함). 솔리드도 같이 들어갑니다.', 'The STL window turns closed outlines into a plate of a given thickness (holes included) and shows it; solids are included too.'),
      run: async (ctx) => { await ctx.dialog('stl', () => ctx.api.run('exportStl'), null, 2200); },
      practice: { todo: T('내보내기 메뉴의 "3D 프린팅 (STL)"을 누르세요.', 'Click "3D printing (STL)" in the export menu.'), targets: () => [cmd('exportMenu')] },
    },
  ],
};

// ───────────────────────── 15. settings and appearance
const settings = {
  title: T('설정과 모양', 'Settings and appearance'),
  steps: [
    {
      title: T('설정 창', 'The settings window'),
      text: T('설정(Ctrl+,)에는 일반·모양·글꼴·배경·도면·스냅·최근 파일·단축키 탭이 있습니다.', 'Settings (Ctrl+,) has General, Appearance, Font, Background, Drawing, Snaps, Recent files and Shortcuts tabs.'),
      run: async (ctx) => { await ctx.dialog('settings', () => ctx.api.popups.open('settings', { tab: 'general' }), null, 2400); },
      practice: { todo: T('툴바의 톱니바퀴(설정)를 누르세요.', 'Click the gear (Settings) on the toolbar.'), targets: () => [cmd('settings')] },
    },
    {
      title: T('테마', 'Themes'),
      text: T('테마 버튼은 다음 테마로, ▾는 다크·라이트 40가지 테마를 고르는 창을 엽니다. 사용자 정의 테마도 만들 수 있습니다.', 'The theme button switches to the next theme; ▾ opens the picker with 40 dark and light themes. You can make your own as well.'),
      run: async (ctx) => { const theme = ctx.settings().theme; await ctx.command('theme'); await ctx.wait(900); ctx.expect(ctx.settings().theme !== theme, 'theme unchanged'); ctx.api.updateSettings({ theme }); },
      practice: { todo: T('테마 버튼을 눌러 보세요.', 'Click the theme button.'), setup: (ctx, mem) => { mem.theme = ctx.settings().theme; }, check: (ctx, mem) => ctx.settings().theme !== mem.theme, targets: () => [cmd('theme')] },
    },
    {
      title: T('툴바와 패널 묶음', 'Toolbar and panel groups'),
      text: T('창이 좁으면 툴바를 두 줄로 바꿉니다. 왼쪽 패널의 묶음 머리글을 눌러 접고, 위쪽 버튼으로 모두 접거나 폅니다.', 'In a narrow window put the toolbar on two rows. Fold groups of the left panel by their headers; the buttons at the top fold or unfold all.'),
      run: async (ctx) => { await ctx.command('toolbarRows'); await ctx.wait(700); await ctx.command('toolbarRows'); ctx.expect(ctx.settings().toolbarRows === 1, 'toolbar not one row'); },
      practice: { todo: T('툴바 줄 수 버튼을 눌러 보세요.', 'Click the toolbar rows button.'), targets: () => [cmd('toolbarRows')] },
    },
  ],
};

// ───────────────────────── 16. help
const help = {
  title: T('도움말', 'Help'),
  steps: [
    {
      title: T('기능표', 'Feature list'),
      text: T('도움말 › 기능표는 FreeCAD의 기능과 하나씩 맞대어 지원·부분 지원·미지원을 보여 줍니다.', 'Help › Feature list compares every FreeCAD feature: supported, partly supported, not supported.'),
      run: async (ctx) => { await ctx.dialog('coverage', () => ctx.api.run('freecadCoverage'), null, 2400); },
      practice: { todo: T('도움말 메뉴에서 기능표를 여세요.', 'Open the feature list from the Help menu.'), targets: () => [{ el: '[data-menu="help"]' }] },
    },
    {
      title: T('프로그램 정보와 지원 형식', 'About and file formats'),
      text: T('프로그램 정보(F1)에는 빌드 정보와 "지원 파일 형식" 탭이 있습니다.', 'About (F1) shows the build and a "File formats" tab.'),
      run: async (ctx) => { await ctx.dialog('about', () => ctx.api.run('about'), null, 2000); },
      practice: { todo: T('툴바 오른쪽 끝의 정보(i) 버튼을 누르세요.', 'Click the info (i) button at the right of the toolbar.'), targets: () => [cmd('about')] },
    },
    {
      title: T('튜토리얼 다시 보기', 'The tutorial again'),
      text: T('튜토리얼은 도움말 메뉴와 시작 페이지에서 언제든 다시 엽니다. doc/Tutorial.md에 그림과 함께 같은 내용이 있습니다.', 'Open the tutorial any time from the Help menu or the start page. doc/Tutorial.md has the same lessons with pictures.'),
      run: async (ctx) => { await ctx.wait(800); },
    },
  ],
};

// ───────────────────────── 17. assembly and motion
const waitFor = async (ctx, test, ms = 15000) => { for (const until = Date.now() + ms; !test() && Date.now() < until;) await new Promise((resolve) => setTimeout(resolve, 100)); };
const assembly = {
  title: T('조립과 움직임', 'Assembly and motion'),
  fresh: true,
  steps: [
    {
      title: T('움직이는 샘플', 'A moving sample'),
      text: T('샘플 "단기통 엔진 (움직임)"을 열면 3D 보기에서 바로 움직입니다. 크랭크 · 커넥팅 로드 · 피스톤이 조인트로 이어져 닫힌 고리를 이루고, MyCAD 가 매 순간 고리를 풀어 피스톤 자리를 구합니다 (FreeCAD Assembly).', 'Open the sample "Single-cylinder engine (moving)": it moves in the 3D view at once. Crank, connecting rod and piston are joined into a closed loop, which MyCAD solves at every moment to place the piston (FreeCAD Assembly).'),
      run: async (ctx) => {
        await ctx.api.openSample('25-crank-engine.mcad');
        await ctx.api.waitIdle();
        await waitFor(ctx, () => ctx.api.animState().active);
        ctx.expect(ctx.api.animState().active, 'the engine should be playing');
        await ctx.wait(2500);
      },
      practice: { todo: T('시작 페이지에서 "단기통 엔진 (움직임)" 샘플을 여세요.', 'Open the sample "Single-cylinder engine (moving)" from the start page.'), check: (ctx) => ctx.api.animState().active, targets: () => [{ el: '.sample-card[data-sample="25-crank-engine.mcad"]' }] },
    },
    {
      title: T('재생 막대', 'The play bar'),
      text: T('3D 보기 아래의 재생 막대: 재생 · 일시 정지, 처음으로, 시간 슬라이더(끌면 그 순간), 반복 · 왕복 · 한 번, 한 바퀴 시간. 저장 단추는 지금 자세를 도면에 남깁니다.', 'The play bar under the 3D view: play and pause, back to the start, the time slider (drag to a moment), loop, back and forth or once, and the time for one run. The save button keeps the pose in the drawing.'),
      run: async (ctx) => { await ctx.api.toggleAnimation(false); await ctx.wait(900); await ctx.api.toggleAnimation(true); await ctx.wait(1500); },
      practice: { todo: T('재생 막대의 일시 정지 단추를 누르세요.', 'Click the pause button on the play bar.'), check: (ctx) => !ctx.api.animState().playing, targets: () => [{ el: '.anim-bar [data-anim="play"]' }] },
    },
    {
      title: T('조인트와 구동', 'Joints and drives'),
      text: T('솔리드 두 개를 차례로 고르고(먼저 고른 것이 바탕) 3D 솔리드 메뉴의 회전 조인트를 누르면 경첩이 생깁니다. 속성 패널에서 구동 시작 → 끝 값을 정하면 재생할 때 그만큼 돕니다. 기어 · 벨트 · 랙 · 나사는 연동 비율로 잇습니다.', 'Pick two solids in turn (the first is the base) and click Revolute joint in the 3D solid menu: a hinge. Give the drive a start and end in the properties and it turns that far when played. Gears, belts, racks and screws are linked by a coupling ratio.'),
      run: async (ctx) => {
        ctx.api.stopAnimation();
        await ctx.fresh();
        const frame = ctx.api.insertSolid('box', { length: 100, width: 100, height: 600 }, { x: 0, y: 0, z: 0 });
        const door = ctx.api.insertSolid('box', { length: 500, width: 30, height: 580 }, { x: 100, y: 0, z: 10 });
        ctx.select([frame.id, door.id]);
        ctx.api.addJoint('revolute');
        const joint = ctx.api.drawing().joints?.[0];
        ctx.expect(joint, 'a joint expected');
        ctx.api.setJointDrive(joint.id, 'to', 100);
        await ctx.api.toggleAnimation(true);
        await ctx.wait(3000);
        ctx.api.stopAnimation();
        await ctx.api.toggle3d(false);
      },
      practice: { todo: T('솔리드 두 개를 차례로 고르고 회전 조인트를 넣으세요.', 'Pick two solids in turn and add a revolute joint.'), check: (ctx) => (ctx.api.drawing().joints ?? []).length > 0, targets: () => [cmd('joint:revolute')] },
    },
  ],
};

// ───────────────────────── 18. exact solids (OpenCASCADE)
const exact = {
  title: T('정확한 솔리드 (OpenCASCADE)', 'Exact solids (OpenCASCADE)'),
  fresh: true,
  steps: [
    {
      title: T('곡면 위 불리언', 'Booleans on curved faces'),
      text: T('FreeCAD 와 같은 OpenCASCADE 커널로 불리언 · 모깎기 · 구배가 곡면 그대로 계산되고 부피도 정확합니다. STEP · IGES · FCStd 로 내보내도 원통 · 구 같은 곡면이 그대로 갑니다.', 'With OpenCASCADE, the kernel FreeCAD uses, booleans, fillets and drafts keep their curved faces and exact volumes. STEP, IGES and FCStd exports keep the cylinders and spheres too.'),
      run: async (ctx) => {
        await ctx.fresh();
        await waitFor(ctx, () => ctx.api.kernelReady(), 30000);
        const plate = ctx.api.insertSolid('box', { length: 80, width: 50, height: 10 }, { x: 0, y: 0, z: 0 });
        const drill = ctx.api.insertSolid('cylinder', { radius: 10, height: 30 }, { x: 40, y: 25, z: -10 });
        ctx.select([plate.id, drill.id]);
        await ctx.command('bool:cut');
        ctx.expect(ctx.entities('solid').some((e) => e.kind === 'boolean'), 'cut expected');
      },
      practice: { todo: T('두 솔리드를 고르고 빼기를 누르세요.', 'Select two solids and click Cut.'), check: (ctx) => ctx.entities('solid').some((e) => e.kind === 'boolean'), targets: () => [{ el: '#left-panel [data-command="bool:cut"]' }] },
    },
    {
      title: T('모깎기와 구배', 'Fillet and draft'),
      text: T('솔리드를 고르고 3D 솔리드 › 모깎기로 모서리를 둥글게, 구배(Draft)로 옆면을 기울입니다 — 주조 · 사출의 빼기 구배.', 'Select a solid: Fillet rounds its edges, Draft leans its sides — the draft for casting and moulding.'),
      run: async (ctx) => {
        const block = ctx.api.insertSolid('box', { length: 40, width: 30, height: 20 }, { x: 0, y: 70, z: 0 });
        ctx.select([block.id]);
        await ctx.api.dressUp('fillet', { size: 4, edges: 0 });
        const tower = ctx.api.insertSolid('box', { length: 30, width: 30, height: 40 }, { x: 60, y: 70, z: 0 });
        ctx.select([tower.id]);
        await ctx.api.dressUp('draft', { angle: 8 });
        ctx.expect(ctx.entities('solid').some((e) => e.kind === 'fillet') && ctx.entities('solid').some((e) => e.kind === 'draft'), 'fillet and draft expected');
        await ctx.api.toggle3d(true);
        await ctx.wait(1800);
      },
      practice: { todo: T('솔리드를 고르고 모깎기나 구배를 넣으세요.', 'Select a solid and add a fillet or a draft.'), check: (ctx) => ctx.entities('solid').some((e) => e.kind === 'fillet' || e.kind === 'draft'), targets: () => [{ el: '#left-panel [data-command="dress:fillet"]' }, { el: '#left-panel [data-command="dress:draft"]' }] },
    },
    {
      title: T('3D 에서 모서리 고르기', 'Picking edges in 3D'),
      text: T('모깎기를 선택하고 속성 패널의 "3D 에서 모서리 고르기"를 누르면 모서리가 파랗게 보입니다. 누르는 모서리만 둥글게 됩니다(주황). 고른 모서리는 위치 · 방향으로 기억해 상자 크기가 바뀌어도 다시 찾습니다 (위상 이름).', 'Select the fillet and click "Pick edges in 3D": the edges show blue. Only the ones you click are rounded (orange). Picked edges are kept by place and direction, so they are found again when the box changes size (topological naming).'),
      run: async (ctx) => {
        const fillet = ctx.entities('solid').find((e) => e.kind === 'fillet');
        ctx.select([fillet.id]);
        await ctx.api.toggleEdgePick(true);
        await waitFor(ctx, () => ctx.api.view3d()?.edgePick?.edges.length);
        const edges = ctx.api.view3d().edgePick.edges;
        await ctx.wait(800);
        // Keep the vertical edges only: click the others away.
        for (const edge of edges.filter((e) => Math.abs(e.dir[2]) < 0.5).slice(0, 8)) { ctx.api.toggleEdge(fillet.id, edge); await ctx.wait(120); }
        await ctx.wait(1200);
        await ctx.api.toggleEdgePick(false);
        ctx.expect(ctx.entities('solid').find((e) => e.kind === 'fillet').shape.picks?.length >= 1, 'picked edges expected');
        await ctx.api.toggle3d(true);
      },
      practice: { todo: T('모깎기를 고르고 "3D 에서 모서리 고르기"를 눌러 모서리 하나를 누르세요.', 'Select the fillet, click "Pick edges in 3D" and click an edge.'), check: (ctx) => ctx.entities('solid').some((e) => e.kind === 'fillet' && e.shape?.picks?.length), targets: () => [{ el: '#right-panel [data-edge-pick-mode]' }] },
    },
  ],
};

// ───────────────────────── 19. CAM in 3D
const cam3d = {
  title: T('CAM 3D 가공과 시뮬레이션', 'CAM in 3D and simulation'),
  fresh: true,
  steps: [
    {
      title: T('3D 황삭 · 정삭', '3D roughing and finishing'),
      text: T('솔리드를 고르고 CAM 을 열면 3D 가공이 골라집니다. 황삭은 층마다 남길 두께를 두고 깎고, 정삭은 볼 엔드밀이 표면을 따라갑니다(드롭 커터: 공구가 모델을 파고들지 않음).', 'Select a solid and open CAM: the 3D operations are chosen. Roughing clears level by level, leaving stock on; finishing runs a ball end mill over the surface (drop-cutter: the tool never cuts into the model).'),
      run: async (ctx) => {
        await ctx.fresh();
        await ctx.api.toggle3d(false);
        const dome = ctx.api.insertSolid('sphere', { radius: 25 }, { x: 0, y: 0, z: 0 });
        ctx.select([dome.id]);
        await ctx.dialog('cam', () => ctx.api.run('cam'), null, 2600);
      },
      practice: { todo: T('솔리드를 고르고 CAM 을 여세요.', 'Select a solid and open CAM.'), targets: () => [cmd('cam'), { el: '#left-panel [data-command="cam"]' }] },
    },
    {
      title: T('시뮬레이션과 가공 결과', 'Simulation and the machined stock'),
      text: T('CAM 창의 시뮬레이션 탭에서 재생하면 소재가 깎이는 모습을 보고 과절삭 · 남은 살을 검사합니다. "가공 결과 솔리드"는 깎인 소재를 도면에 솔리드로 넣습니다.', 'In the CAM window\'s Simulation tab, play to watch the stock being cut and check gouges and the material left. "Machined stock solid" puts the cut stock in the drawing.'),
      run: async (ctx) => {
        await ctx.api.openCam({ operation: 'finish3d', toolShape: 'ball', tool: 6, stepOver: 0.3, action: 'stock' });
        ctx.expect(ctx.entities('solid').some((e) => e.kind === 'mesh'), 'machined stock expected');
        await ctx.api.toggle3d(true);
        await ctx.wait(2200);
      },
      practice: { todo: T('CAM 창의 시뮬레이션 탭에서 재생해 보세요.', 'Play the simulation in the CAM window.'), targets: () => [cmd('cam')] },
    },
  ],
};

// ───────────────────────── 20. FEM
const femLesson = {
  title: T('FEM 해석: 판과 솔리드', 'FEM: plates and solids'),
  fresh: true,
  steps: [
    {
      title: T('판 응력 (평면 응력)', 'Plate stress (plane stress)'),
      text: T('닫힌 윤곽(구멍 포함)을 고르고 FEM 판 응력 해석을 엽니다. 변마다 고정과 하중을 주면 폰 미제스 응력 색과 변형 모양이 나오고, 구멍 둘레의 응력 집중(약 3배)도 보입니다.', 'Select a closed outline (holes too) and open FEM plate stress. Supports and loads go on its sides; you get the von Mises colours and the deformed shape — the stress about three times higher round the hole.'),
      run: async (ctx) => {
        await ctx.fresh();
        await ctx.api.toggle3d(false);
        ctx.api.addEntity('rect', { x: 0, y: 0, width: 120, height: 60 });
        ctx.api.addEntity('circle', { cx: 60, cy: 30, r: 12 });
        await ctx.dialog('plate', () => ctx.api.run('femPlate'), () => ctx.api.openPlate({ action: 'draw', plate: { supports: { 3: 'fixed' }, loads: { 1: { fx: 20000, fy: 0 } } } }), 2600);
        ctx.expect(ctx.entities().some((e) => e.layer === 'fem'), 'results on the FEM layer expected');
      },
      practice: { todo: T('윤곽을 고르고 FEM 판 응력 해석을 여세요.', 'Select an outline and open FEM plate stress.'), targets: () => [{ el: '#left-panel [data-command="femPlate"]' }] },
    },
    {
      title: T('솔리드 (3D) 와 CalculiX', 'Solids (3D) and CalculiX'),
      text: T('솔리드를 고르고 FEM 솔리드 해석을 엽니다. 육면체 요소로 채워 고정 면 · 하중 면 · 자중을 주고 풉니다. .inp 로 저장하면 CalculiX · FreeCAD FEM 에서 열리고, CalculiX 가 설치돼 있으면 같은 모델을 풀어 비교합니다(차이 1 % 안).', 'Select a solid and open FEM solid analysis: it is filled with brick elements, clamped, loaded (and its own weight) and solved. Save .inp for CalculiX and FreeCAD FEM, or, with CalculiX installed, solve the same model there and compare (within 1 %).'),
      run: async (ctx) => {
        await ctx.fresh();
        const beam = ctx.api.insertSolid('box', { length: 200, width: 20, height: 20 }, { x: 0, y: 0, z: 0 });
        ctx.select([beam.id]);
        await ctx.dialog('fem3d', () => ctx.api.run('fem3d'), () => ctx.api.openFem3d({ action: 'draw', fem3d: { fixed: ['xmin'], loads: [{ face: 'xmax', fz: -1000 }] } }), 2600);
        ctx.expect(ctx.entities('solid').some((e) => e.kind === 'mesh'), 'deformed solid expected');
        await ctx.api.toggle3d(true);
        await ctx.wait(2000);
      },
      practice: { todo: T('솔리드를 고르고 FEM 솔리드 해석을 여세요.', 'Select a solid and open FEM solid analysis.'), targets: () => [{ el: '#left-panel [data-command="fem3d"]' }] },
    },
  ],
};

// ───────────────────────── 21. Python and macros
const python = {
  title: T('Python 콘솔과 매크로', 'The Python console and macros'),
  fresh: true,
  steps: [
    {
      title: T('Python 으로 모델 만들기', 'Making a model in Python'),
      text: T('스크립트 콘솔(Ctrl+Shift+J)에서 Python 을 고르면 FreeCAD 매크로처럼 씁니다: import Part, Part.makeBox(…).cut(…), Part.show(…). mycad 모듈로 도면 전체를 다룹니다.', 'Choose Python in the script console (Ctrl+Shift+J) and write as in FreeCAD macros: import Part, Part.makeBox(…).cut(…), Part.show(…). The mycad module reaches the whole drawing.'),
      run: async (ctx) => {
        await ctx.fresh();
        ctx.api.updateSettings({ showConsole: true, consoleLanguage: 'python' });
        await ctx.api.runScript('import FreeCAD as App, Part\nplate = Part.makeBox(120, 80, 10)\nfor x, y in [(15, 15), (105, 15), (105, 65), (15, 65)]:\n    plate = plate.cut(Part.makeCylinder(5, 10, App.Vector(x, y, 0)))\nPart.show(plate, "Plate")\nround(plate.Volume)', { language: 'python' });
        ctx.expect(ctx.entities('solid').some((e) => e.name === 'Plate'), 'the plate expected');
        await ctx.api.toggle3d(true);
        await ctx.wait(1500);
      },
      practice: { todo: T('콘솔에서 Python 을 고르고 Part.show(Part.makeBox(10, 20, 30)) 를 실행하세요.', 'Choose Python in the console and run Part.show(Part.makeBox(10, 20, 30)).'), check: (ctx) => ctx.entities('solid').length > 0, targets: () => [{ el: '[data-console="lang:python"]' }, { el: '[data-console="run"]' }] },
    },
    {
      title: T('애드온 관리자', 'The addon manager'),
      text: T('애드온 관리자는 MyCAD 와 함께 오는 매크로 목록에서, 또는 웹 주소 · 파일에서 매크로(Python · JavaScript)를 설치 · 업데이트 · 제거하고 실행합니다.', 'The addon manager installs, updates, removes and runs macros (Python, JavaScript) from the catalogue that comes with MyCAD, a web address or a file.'),
      run: async (ctx) => {
        await ctx.dialog('addons', () => ctx.api.run('addons'), null, 2600);
        ctx.api.updateSettings({ showConsole: false, consoleLanguage: 'js' });
        await ctx.api.toggle3d(false);
      },
      practice: { todo: T('콘솔 머리의 애드온 관리자 단추를 눌러 보세요.', 'Click the addon manager button in the console header.'), targets: () => [{ el: '[data-command="addons"]' }] },
    },
  ],
};

// ───────────────────────── 22. trim, extend, fillet, chamfer
const horizontalAt = (ctx, y) => ctx.entities('line').filter((l) => near(l.y1, y) && near(l.y2, y));
const edit2d = {
  title: T('2D 편집: 자르기·연장·모깎기·모따기', '2D editing: trim, extend, fillet, chamfer'),
  fresh: true,
  steps: [
    {
      title: T('자르기 (X)', 'Trim (X)'),
      text: T('자르기 도구로 선을 누르면 다른 선과 만나는 곳까지 누른 쪽이 잘려 나갑니다. 가로선 (0,20)–(100,20)과 세로선 (50,0)–(50,40)을 그리고 가로선의 오른쪽 (80,20)을 누릅니다.', 'With the trim tool, clicking a line cuts away the clicked part up to where another line crosses it. Draw a line (0,20)–(100,20) and a line (50,0)–(50,40), then click the right part of the first one at (80,20).'),
      run: async (ctx) => {
        await ctx.fresh();
        await ctx.tool('line'); await ctx.clicks([[0, 20], [100, 20]]); await ctx.key('Escape'); await ctx.key('Escape');
        await ctx.tool('line'); await ctx.clicks([[50, 0], [50, 40]]); await ctx.key('Escape'); await ctx.key('Escape');
        await ctx.tool('trim'); await ctx.clickAt(80, 20); await ctx.key('Escape'); selectTool(ctx);
        ctx.expect(horizontalAt(ctx, 20).some((l) => near(Math.max(l.x1, l.x2), 50)), 'the line should end at x = 50');
      },
      practice: { todo: T('두 선을 엇갈리게 그리고, 자르기 도구로 잘라 낼 부분을 누르세요.', 'Draw two crossing lines, then click the part to cut away with the trim tool.'), check: (ctx) => horizontalAt(ctx, 20).some((l) => near(Math.max(l.x1, l.x2), 50)), targets: () => [tile('trim'), ...pts([80, 20])] },
    },
    {
      title: T('연장 (W)', 'Extend (W)'),
      text: T('연장 도구로 선의 끝 가까이를 누르면 다음 선까지 늘어납니다. 짧은 선 (0,35)–(30,35)를 그리고 오른쪽 끝 (28,35)를 누르면 세로선 x = 50까지 닿습니다.', 'With the extend tool, clicking near the end of a line stretches it to the next line. Draw a short line (0,35)–(30,35) and click near its right end (28,35): it reaches the vertical line at x = 50.'),
      run: async (ctx) => {
        await ctx.tool('line'); await ctx.clicks([[0, 35], [30, 35]]); await ctx.key('Escape'); await ctx.key('Escape');
        await ctx.tool('extend'); await ctx.clickAt(28, 35); await ctx.key('Escape'); selectTool(ctx);
        ctx.expect(horizontalAt(ctx, 35).some((l) => near(Math.max(l.x1, l.x2), 50)), 'the line should reach x = 50');
      },
      practice: { todo: T('연장 도구로 짧은 선의 끝 가까이를 누르세요.', 'Click near the end of the short line with the extend tool.'), check: (ctx) => horizontalAt(ctx, 35).some((l) => near(Math.max(l.x1, l.x2), 50)), targets: () => [tile('extend'), ...pts([28, 35])] },
    },
    {
      title: T('모깎기 (J)', 'Fillet (J)'),
      text: T('모깎기는 두 선이 만나는 모서리를 호로 둥글게 합니다. 모서리 (90,60)에서 만나는 두 선을 그리고, 모깎기 도구에서 반지름 10을 입력한 뒤 남길 쪽의 두 선을 차례로 누릅니다.', 'Fillet rounds the corner where two lines meet. Draw two lines meeting at (90,60), type a radius of 10 in the fillet tool, then click the two lines on the sides to keep.'),
      run: async (ctx) => {
        await ctx.tool('line'); await ctx.clicks([[150, 60], [90, 60], [90, 100]]); await ctx.key('Escape'); await ctx.key('Escape');
        await ctx.tool('fillet'); await ctx.type('10'); await ctx.clickAt(130, 60); await ctx.clickAt(90, 85); await ctx.key('Escape'); selectTool(ctx);
        const arc = ctx.last('arc');
        ctx.expect(arc && near(arc.r, 10) && near(arc.cx, 100) && near(arc.cy, 70), 'a fillet arc r = 10 expected');
      },
      practice: { todo: T('모깎기 도구에서 반지름을 입력하고 두 선을 차례로 누르세요.', 'Type a radius in the fillet tool and click the two lines.'), check: (ctx, mem) => has(ctx, mem, 'arc'), targets: () => [tile('fillet'), { el: '#command-input' }, ...pts([130, 60], [90, 85])] },
    },
    {
      title: T('모따기 (K)', 'Chamfer (K)'),
      text: T('모따기는 모서리를 비스듬히 잘라 냅니다. 폴리선이나 사각형은 모서리 하나만 누르면 됩니다. 사각형 (0,60)–(60,100)의 오른쪽 위 모서리를 누릅니다.', 'Chamfer cuts a corner off at an angle. For a polyline or a rectangle, just click one corner. Click the top right corner of the rectangle (0,60)–(60,100).'),
      run: async (ctx) => {
        await ctx.tool('rect'); await ctx.clicks([[0, 60], [60, 100]]);
        await ctx.tool('chamfer'); await ctx.clickAt(60, 100); await ctx.key('Escape'); selectTool(ctx);
        ctx.expect(ctx.entities('polyline').some((p) => p.points.length === 5), 'a five-corner outline expected');
      },
      practice: { todo: T('사각형을 그리고 모따기 도구로 모서리를 누르세요.', 'Draw a rectangle and click a corner with the chamfer tool.'), check: (ctx) => ctx.entities('polyline').some((p) => p.points.length === 5), targets: () => [tile('chamfer'), ...pts([60, 100])] },
    },
  ],
};

// ───────────────────────── 23. sketch constraints
const sketch = {
  title: T('스케치 구속과 보조선', 'Sketch constraints and construction lines'),
  fresh: true,
  steps: [
    {
      title: T('보조선', 'Construction geometry'),
      text: T('보조선은 파란 점선으로 바뀌어 스냅과 구속에는 쓰이지만 돌출·CAM·내보내기·인쇄에서는 빠집니다. 원을 그리고 스케치 구속 묶음의 "보조선"을 누릅니다.', 'Construction geometry turns blue and dashed: snaps and constraints use it, but pads, CAM, exports and printing leave it out. Draw a circle and click "Construction" in the sketch group.'),
      run: async (ctx) => {
        await ctx.fresh();
        await ctx.tool('circle'); await ctx.clicks([[20, 80], [32, 80]]); await ctx.key('Escape'); selectTool(ctx);
        ctx.select([ctx.last('circle').id]);
        await ctx.command('construction');
        ctx.expect(ctx.last('circle').construction === true, 'construction circle expected');
      },
      practice: { todo: T('객체를 선택하고 스케치 구속 묶음의 "보조선"을 누르세요.', 'Select an object and click "Construction" in the sketch group.'), check: (ctx) => ctx.entities().some((e) => e.construction), targets: () => [cmd('construction')] },
    },
    {
      title: T('기하 구속: 일치·직각', 'Geometric constraints: coincident, perpendicular'),
      text: T('대충 그린 두 선을 차례로 고르고 "일치"를 누르면 끝점이 만나고, "직각"을 누르면 직각이 됩니다. 도면에 보라색 구속 표시가 붙습니다.', 'Pick two roughly drawn lines in turn: "Coincident" joins their ends, "Perpendicular" squares the corner. Purple constraint marks appear on the drawing.'),
      run: async (ctx) => {
        ctx.api.addEntity('line', { x1: 60, y1: 10, x2: 110, y2: 14 });
        ctx.api.addEntity('line', { x1: 112, y1: 12, x2: 125, y2: 50 });
        const [a, b] = ctx.entities('line').slice(-2);
        ctx.select([a.id, b.id]);
        await ctx.wait(500);
        await ctx.command('constrain:coincident');
        await ctx.command('constrain:perpendicular');
        const types = (ctx.drawing().constraints ?? []).map((c) => c.type);
        ctx.expect(types.includes('coincident') && types.includes('perpendicular'), 'coincident and perpendicular expected');
      },
      practice: { todo: T('두 선을 차례로 고르고 "일치"와 "직각"을 누르세요.', 'Pick two lines in turn and click "Coincident" and "Perpendicular".'), check: (ctx) => (ctx.drawing().constraints ?? []).some((c) => c.type === 'perpendicular'), targets: () => [cmd('constrain:coincident'), cmd('constrain:perpendicular')] },
    },
    {
      title: T('치수 구속: 수평·거리', 'Dimensional constraints: horizontal, distance'),
      text: T('첫 선만 골라 "수평"과 "거리"를 누르고, 속성 패널의 구속 조건 목록에서 거리 값을 60으로 고칩니다. 풀이기가 도형을 맞추고 다른 선은 직각을 지키며 따라옵니다.', 'Pick the first line alone, click "Horizontal" and "Distance", then set the distance to 60 in the constraint list of the properties. The solver fits the drawing; the other line follows and stays square.'),
      run: async (ctx) => {
        const first = ctx.entities('line').at(-2);
        ctx.select([first.id]);
        await ctx.command('constrain:horizontal');
        await ctx.command('constrain:distance');
        await ctx.field('#right-panel [data-constraint-value]', 60);
        const l = ctx.entities('line').find((e) => e.id === first.id);
        ctx.expect(near(Math.hypot(l.x2 - l.x1, l.y2 - l.y1), 60, 1e-3) && near(l.y1, l.y2, 1e-6), 'a horizontal line 60 long expected');
      },
      practice: { todo: T('선을 고르고 "거리"를 누른 뒤 속성 패널에서 값을 바꾸세요.', 'Pick a line, click "Distance" and change the value in the properties.'), check: (ctx) => (ctx.drawing().constraints ?? []).some((c) => c.type === 'distance'), targets: () => [cmd('constrain:distance'), { el: '#right-panel [data-constraint-value]' }] },
    },
    {
      title: T('자유도와 구속 상태', 'Degrees of freedom and status'),
      text: T('스케치 구속 묶음 아래에 자유도 n · 완전 구속 · 중복 구속 · 충돌이 나옵니다. 끝점을 끌면 구속을 지키며 나머지가 따라옵니다. 반지름 · 지름 · 각도 · 접선 · 동심 · 대칭 · 고정도 같은 방법으로 겁니다.', 'Under the sketch group you see the degrees of freedom: fully constrained, redundant or conflicting. Drag an end point and the rest follows the constraints. Radius, diameter, angle, tangent, concentric, symmetric and lock work the same way.'),
      run: async (ctx) => { ctx.api.openSection('sketch'); await ctx.wait(1500); ctx.expect((ctx.drawing().constraints ?? []).length >= 4, 'four constraints expected'); },
      practice: { todo: T('스케치 구속 묶음의 상태 표시를 확인하세요.', 'Look at the status under the sketch group.'), targets: () => [{ el: '#left-panel [data-section="sketch"]' }] },
    },
    {
      title: T('스케치·Draft 도구 메뉴', 'Sketcher and Draft tool menus'),
      text: T('수정 메뉴의 스케치 도구에는 FreeCAD Sketcher 의 구속 · 선택(진단) · B-스플라인 · 표시 명령이, Draft 도구에는 늘이기 · 업그레이드 · 경로 배열 · 정리 · 스냅이 모두 있습니다.', 'The Modify menu holds all of FreeCAD Sketcher\'s constraint, selection (diagnostics), B-spline and display commands under Sketch tools, and Draft\'s stretch, upgrade, path array, organize and snap commands under Draft tools.'),
      run: async (ctx) => { await ctx.menu('modify', ['sketchTools']); await ctx.menu('modify', ['draftTools']); },
      practice: { todo: T('수정 메뉴에서 스케치 도구와 Draft 도구를 펼쳐 보세요.', 'Open Sketch tools and Draft tools in the Modify menu.'), targets: () => [{ el: '[data-menu="modify"]' }] },
    },
  ],
};

// ───────────────────────── 24. clones, working plane, problems
const helpers = {
  title: T('클론·작업 평면·문제 검사', 'Clones, working plane, problems'),
  fresh: true,
  steps: [
    {
      title: T('클론', 'Clones'),
      text: T('클론은 원본을 따라 모양이 바뀌는 복사본입니다(FreeCAD Draft Clone). 사각형을 선택해 "클론"을 누르고, 클론을 이동 도구로 오른쪽으로 옮깁니다.', 'A clone is a copy that follows its original\'s shape (FreeCAD Draft Clone). Select a rectangle, click "Clone", and move the clone to the right with the move tool.'),
      run: async (ctx) => {
        await ctx.fresh();
        await ctx.tool('rect'); await ctx.clicks([[0, 0], [40, 20]]); selectTool(ctx);
        ctx.select([ctx.last('rect').id]);
        await ctx.command('clone');
        const clone = ctx.entities().find((e) => e.clone);
        ctx.expect(clone, 'a clone expected');
        ctx.select([clone.id]);
        await ctx.tool('move'); await ctx.clicks([[0, 0], [70, 0]]); selectTool(ctx);
      },
      practice: { todo: T('객체를 선택하고 수정 묶음의 "클론"을 누르세요.', 'Select an object and click "Clone" in the modify group.'), check: (ctx) => ctx.entities().some((e) => e.clone), targets: () => [cmd('clone')] },
    },
    {
      title: T('원본을 고치면 클론도', 'Change the original, the clone follows'),
      text: T('원본 사각형의 폭을 속성 패널에서 60으로 바꾸면 클론도 같이 바뀝니다. 클론은 위치 · 회전 · 크기 · 대칭과 색 · 레이어만 따로 갖습니다.', 'Set the original rectangle\'s width to 60 in the properties: the clone changes too. A clone keeps only its own position, rotation, scale, mirror, colour and layer.'),
      run: async (ctx) => {
        const source = ctx.entities('rect').find((e) => !e.clone);
        ctx.select([source.id]);
        await ctx.field('#right-panel [data-prop="width"]', 60);
        const clone = ctx.entities().find((e) => e.clone);
        ctx.expect(clone && near(clone.width, 60), 'the clone should follow (width 60)');
      },
      practice: { todo: T('원본을 선택하고 폭을 바꾸세요.', 'Select the original and change its width.'), setup: (ctx, mem) => { mem.w = ctx.entities().find((e) => e.clone)?.width; }, check: (ctx, mem) => ctx.entities().some((e) => e.clone && !near(e.width, mem.w ?? -1)), targets: () => [{ el: '#right-panel [data-prop="width"]' }] },
    },
    {
      title: T('독립시키기', 'Making it independent'),
      text: T('클론을 선택하면 속성 패널에 "원본 선택"과 "독립시키기"가 나옵니다. 독립시키면 보통 객체가 되어 원본을 더 이상 따르지 않습니다.', 'A selected clone shows "Select the original" and "Make independent" in the properties. Made independent, it becomes an ordinary object that no longer follows.'),
      run: async (ctx) => {
        ctx.select([ctx.entities().find((e) => e.clone).id]);
        await ctx.click('#right-panel [data-command="unlinkClone"]');
        ctx.expect(!ctx.entities().some((e) => e.clone), 'no clone left expected');
      },
      practice: { todo: T('클론을 선택하고 속성 패널의 "독립시키기"를 누르세요.', 'Select the clone and click "Make independent" in the properties.'), check: (ctx) => !ctx.entities().some((e) => e.clone), targets: () => [{ el: '#right-panel [data-command="unlinkClone"]' }] },
    },
    {
      title: T('작업 평면', 'The working plane'),
      text: T('수정 › 작업 평면: 원점 (100,10)을 누르고 X 축이 향할 점 (100,60)을 누릅니다. 이제 좌표 입력 · 격자 · 직교 · 상태 표시줄이 이 평면 기준이라 @30,0은 위쪽으로 30입니다.', 'Modify › Working plane: click the origin (100,10), then a point the X axis points to (100,60). Typed coordinates, the grid, ortho and the status bar now follow the plane, so @30,0 goes 30 up.'),
      run: async (ctx) => {
        await ctx.command('tool:workPlane');
        await ctx.clicks([[100, 10], [100, 60]]);
        selectTool(ctx);
        await ctx.tool('line'); await ctx.type('0,0'); await ctx.type('@30,0'); await ctx.key('Escape'); selectTool(ctx);
        const l = ctx.last('line');
        ctx.expect(ctx.drawing().workPlane && l && near(l.x2, 100) && near(l.y2, 40), 'a line up to (100,40) expected');
      },
      practice: { todo: T('수정 메뉴의 작업 평면에서 두 점을 누르세요.', 'Click two points with Working plane in the Modify menu.'), check: (ctx) => Boolean(ctx.drawing().workPlane), targets: () => [{ el: '[data-menu="modify"]' }, ...pts([100, 10], [100, 60])] },
    },
    {
      title: T('전체 좌표로', 'Back to global'),
      text: T('아무것도 고르지 않으면 속성 패널에 작업 평면의 원점 · 각도 · 높이 Z(새 솔리드가 놓이는 높이)가 나옵니다. "전체 좌표로"를 누르면 원래대로 돌아갑니다.', 'With nothing selected, the properties show the working plane\'s origin, angle and height Z (where new solids go). "Back to global" restores the normal axes.'),
      run: async (ctx) => {
        ctx.select([]);
        await ctx.wait(600);
        await ctx.click('#right-panel [data-command="workPlaneReset"]');
        ctx.expect(!ctx.drawing().workPlane, 'working plane should be reset');
      },
      practice: { todo: T('속성 패널의 "전체 좌표로"를 누르세요.', 'Click "Back to global" in the properties.'), check: (ctx) => !ctx.drawing().workPlane, targets: () => [{ el: '#right-panel [data-command="workPlaneReset"]' }] },
    },
    {
      title: T('문제 패널 (Ctrl+Shift+M)', 'The problems panel (Ctrl+Shift+M)'),
      text: T('문제 패널은 길이 0인 객체 · 겹친 객체 · 맞닿지 않은 끝점 · 거의 닫힌 윤곽 같은 실수를 오류 · 경고 · 참고로 보여 줍니다. 줄을 누르면 그 객체로 갑니다. 같은 자리에 선을 두 번 그려 봅니다.', 'The problems panel lists mistakes — zero-length objects, duplicates, ends that do not meet, almost closed outlines — as errors, warnings and notes. Click a row to go to the object. Draw the same line twice.'),
      run: async (ctx) => {
        ctx.api.addEntity('line', { x1: 0, y1: 80, x2: 50, y2: 80 });
        ctx.api.addEntity('line', { x1: 0, y1: 80, x2: 50, y2: 80 });
        if (!ctx.settings().showProblems) await ctx.command('problems');
        await ctx.wait(2200);
        ctx.expect(ctx.settings().showProblems, 'problems panel expected');
        await ctx.command('problems');
      },
      practice: { todo: T('툴바의 문제 패널 버튼을 누르세요.', 'Click the problems panel button on the toolbar.'), check: (ctx) => ctx.settings().showProblems, targets: () => [cmd('problems')] },
    },
    {
      title: T('눈금자 (Ctrl+R)', 'Rulers (Ctrl+R)'),
      text: T('캔버스 위와 왼쪽의 눈금자는 커서 위치를 표시하고, 왼쪽 위 모서리에 단위가 나옵니다. 툴바 버튼으로 끄고 켭니다.', 'The rulers above and left of the canvas mark the cursor; the unit is in the top-left corner. The toolbar button switches them.'),
      run: async (ctx) => { await ctx.command('rulers'); await ctx.wait(700); await ctx.command('rulers'); ctx.expect(ctx.settings().showRulers, 'rulers hidden'); },
      practice: { todo: T('툴바의 눈금자 버튼을 눌러 보세요.', 'Click the rulers button on the toolbar.'), targets: () => [cmd('rulers')] },
    },
  ],
};

// ───────────────────────── 25. drawing annotations (TechDraw)
const techdraw = {
  title: T('제작 도면: 풍선·기하 공차·데이텀', 'Production drawings: balloons, GD&T, datums'),
  fresh: true,
  steps: [
    {
      title: T('준비: 판과 구멍', 'Set-up: a plate and a hole'),
      text: T('주석을 달 판 (0,0)–(100,50)과 구멍 (50,25) 반지름 10을 그립니다.', 'Draw a plate (0,0)–(100,50) and a hole at (50,25), radius 10, to annotate.'),
      run: async (ctx) => {
        await ctx.fresh();
        ctx.view({ minX: -20, minY: -40, maxX: 170, maxY: 100 });
        await ctx.tool('rect'); await ctx.clicks([[0, 0], [100, 50]]);
        await ctx.tool('circle'); await ctx.clicks([[50, 25], [60, 25]]); await ctx.key('Escape'); selectTool(ctx);
      },
      practice: { todo: T('사각형과 원을 그리세요.', 'Draw the rectangle and the circle.'), check: (ctx) => ctx.entities('rect').length >= 1 && ctx.entities('circle').length >= 1, targets: () => pts([0, 0], [100, 50], [50, 25]) },
    },
    {
      title: T('풍선', 'Balloons'),
      text: T('풍선 도구로 가리킬 부품 (10,50)을 누르고 풍선 자리 (20,80)를 누릅니다. 번호는 1, 2, 3 … 저절로 붙습니다. 하나 더 (100,40) → (130,75).', 'With the balloon tool click the part (10,50), then where the balloon goes (20,80). Numbers 1, 2, 3… come by themselves. One more: (100,40) → (130,75).'),
      run: async (ctx) => {
        await ctx.tool('balloon'); await ctx.clicks([[10, 50], [20, 80]]);
        await ctx.tool('balloon'); await ctx.clicks([[100, 40], [130, 75]]); selectTool(ctx);
        ctx.expect(ctx.entities('leader').filter((e) => e.style === 'balloon').map((e) => e.text).join() === '1,2', 'balloons 1 and 2 expected');
      },
      practice: { todo: T('풍선 도구로 두 점을 누르세요.', 'Click two points with the balloon tool.'), check: (ctx) => ctx.entities('leader').some((e) => e.style === 'balloon'), targets: () => [tile('balloon')] },
    },
    {
      title: T('데이텀', 'Datums'),
      text: T('데이텀 도구로 데이텀 면 (50,0)을 누르고 문자 상자 자리 (50,-25)를 누릅니다. 글자는 A, B, C … 저절로 붙습니다.', 'With the datum tool click the datum face (50,0), then where its box goes (50,-25). Letters A, B, C… come by themselves.'),
      run: async (ctx) => {
        await ctx.tool('datum'); await ctx.clicks([[50, 0], [50, -25]]); selectTool(ctx);
        ctx.expect(ctx.entities('leader').some((e) => e.style === 'datum' && e.text === 'A'), 'datum A expected');
      },
      practice: { todo: T('데이텀 도구로 두 점을 누르세요.', 'Click two points with the datum tool.'), check: (ctx) => ctx.entities('leader').some((e) => e.style === 'datum'), targets: () => [tile('datum')] },
    },
    {
      title: T('기하 공차', 'Feature control frames'),
      text: T('기하 공차 도구로 공차를 줄 면 (0,30)을 누르고 틀 자리 (-15,75)를 누릅니다. 속성 패널에서 기호 14종 · 공차 값 · ⌀ · Ⓜ/Ⓛ · 데이텀 A|B|C를 정합니다. 기호를 평면도로 바꿉니다.', 'With the GD&T tool click the face (0,30), then where the frame goes (-15,75). In the properties pick one of 14 symbols, the value, ⌀, Ⓜ/Ⓛ and datums A|B|C. Set the symbol to flatness.'),
      run: async (ctx) => {
        await ctx.tool('gdt'); await ctx.clicks([[0, 30], [-15, 75]]); selectTool(ctx);
        ctx.select([ctx.last('leader').id]);
        await ctx.field('#right-panel [data-prop="symbol"]', 'flatness');
        await ctx.field('#right-panel [data-prop="datums"]', 'A');
        const frame = ctx.last('leader');
        ctx.expect(frame.style === 'gdt' && frame.symbol === 'flatness', 'flatness frame expected');
      },
      practice: { todo: T('기하 공차 도구로 두 점을 누르고 속성에서 기호를 바꾸세요.', 'Click two points with the GD&T tool and change the symbol in the properties.'), check: (ctx) => ctx.entities('leader').some((e) => e.style === 'gdt'), targets: () => [tile('gdt')] },
    },
    {
      title: T('제작 도면 샘플', 'A production drawing sample'),
      text: T('샘플 "축 제작 도면"에는 단면 · 키홈 · 끼워맞춤 공차 · 표면 거칠기 · 주기가 모두 들어 있습니다. DXF · SVG · 인쇄에도 그대로 나옵니다.', 'The sample "Shaft detail" has sections, a keyway, fits, surface roughness and notes. They go to DXF, SVG and print as they are.'),
      run: async (ctx) => { await ctx.api.openSample('21-shaft-detail.mcad'); await ctx.api.waitIdle(); ctx.api.zoomFit(); await ctx.wait(1800); ctx.expect(ctx.entities().length > 10, 'sample not open'); },
      practice: { todo: T('시작 페이지에서 "축 제작 도면" 샘플을 여세요.', 'Open the "Shaft detail" sample from the start page.'), targets: () => [{ el: '.sample-card[data-sample="21-shaft-detail.mcad"]' }] },
    },
    {
      title: T('TechDraw 메뉴', 'The TechDraw menu'),
      text: T('그리기 메뉴의 TechDraw 에는 뷰(투상 · 단면 · 상세 · 활성 뷰) · 장식선(중심선 · 나사선) · 치수(연쇄 · 좌표 · 구멍/축 공차) · 페이지(표제란 · 클립 그룹)가 모두 있습니다.', 'TechDraw in the Draw menu holds views (projection, section, detail, active view), cosmetics (centre lines, threads), dimensions (chain, ordinate, hole and shaft fits) and page tools (title block, clip groups).'),
      run: async (ctx) => { await ctx.menu('draw', ['techDraw']); await ctx.menu('draw', ['techDraw', 'tdDims']); },
      practice: { todo: T('그리기 메뉴에서 TechDraw 를 펼쳐 보세요.', 'Open TechDraw in the Draw menu.'), targets: () => [{ el: '[data-menu="draw"]' }] },
    },
  ],
};

// ───────────────────────── 26. PartDesign: pocket, hole, dress-ups
const partDesign = {
  title: T('PartDesign: 포켓·구멍·모따기·두께', 'PartDesign: pocket, hole, chamfer, thickness'),
  fresh: true,
  steps: [
    {
      title: T('포켓', 'Pocket'),
      text: T('2D 윤곽과 솔리드를 함께 고르고 "포켓"을 누르면 솔리드 윗면에서 깊이만큼(또는 관통) 파냅니다. 100 × 60 × 30 블록에 사각형 (10,10)–(40,30)을 8 mm 깊이로 파냅니다.', 'Select a 2D outline together with a solid and click "Pocket": it cuts down from the top face to a depth (or through all). Pocket the rectangle (10,10)–(40,30) 8 mm into a 100 × 60 × 30 block.'),
      run: async (ctx) => {
        await ctx.fresh();
        const block = ctx.api.insertSolid('box', { length: 100, width: 60, height: 30 }, { x: 0, y: 0, z: 0 });
        await ctx.tool('rect'); await ctx.clicks([[10, 10], [40, 30]]); selectTool(ctx);
        ctx.select([ctx.last('rect').id, block.id]);
        await ctx.dialog('solid', () => ctx.api.run('solid:pocket'), () => ctx.api.applyFeature('pocket', { depth: 8 }));
        ctx.expect(ctx.entities('solid').some((e) => e.kind === 'boolean' && e.shape?.op === 'cut'), 'pocket expected');
      },
      practice: { todo: T('윤곽과 솔리드를 함께 고르고 "포켓"을 누르세요.', 'Select an outline and a solid, then click "Pocket".'), check: (ctx) => ctx.entities('solid').some((e) => e.kind === 'boolean'), targets: () => [{ el: '#left-panel [data-command="solid:pocket"]' }] },
    },
    {
      title: T('구멍', 'Hole'),
      text: T('원과 솔리드를 고르고 "구멍"을 누르면 원마다 구멍이 뚫립니다: 지름은 원에서, 깊이 · 단순/자리파기/접시머리 · 평평/드릴 끝 118°는 창에서. 결과는 빼기 트리라 분해하면 원래대로입니다.', 'Select circles and a solid and click "Hole": a hole at every circle — the diameter from the circle; depth, simple/counterbore/countersink and a flat or 118° drill point in the window. The result is a cut tree that explode undoes.'),
      run: async (ctx) => {
        await ctx.tool('circle'); await ctx.clicks([[70, 30], [76, 30]]); await ctx.key('Escape'); selectTool(ctx);
        ctx.select([ctx.last('circle').id, ctx.entities('solid')[0].id]);
        await ctx.dialog('solid', () => ctx.api.run('solid:hole'), () => ctx.api.applyFeature('hole', { depth: 30 }));
        ctx.expect(ctx.entities('solid').some((e) => e.shape?.parts?.at(-1)?.kind === 'hole'), 'hole expected');
      },
      practice: { todo: T('원과 솔리드를 고르고 "구멍"을 누르세요.', 'Select a circle and a solid, then click "Hole".'), check: (ctx) => ctx.entities('solid').some((e) => e.shape?.parts?.some((p) => p.kind === 'hole')), targets: () => [{ el: '#left-panel [data-command="solid:hole"]' }] },
    },
    {
      title: T('3D 모따기', 'Chamfer (3D)'),
      text: T('상자 · 돌출 · 각기둥 · 원기둥 · 튜브를 하나 고르고 "모따기 (3D)"를 누르면 크기와 모서리(모두 · 윗면 둘레 · 세로 …)를 정해 깎습니다. 분해하면 원래 솔리드로 돌아갑니다.', 'Select one box, pad, prism, cylinder or tube and click "Chamfer (3D)": choose the size and the edges (all, top rim, vertical…). Explode gives the solid back.'),
      run: async (ctx) => {
        const block = ctx.api.insertSolid('box', { length: 40, width: 30, height: 20 }, { x: 120, y: 0, z: 0 });
        ctx.select([block.id]);
        await ctx.dialog('solid', () => ctx.api.run('dress:chamfer'), () => ctx.api.dressUp('chamfer', { size: 4 }));
        ctx.expect(ctx.entities('solid').some((e) => e.kind === 'chamfer'), 'chamfer expected');
      },
      practice: { todo: T('솔리드를 고르고 "모따기 (3D)"를 누르세요.', 'Select a solid and click "Chamfer (3D)".'), check: (ctx) => ctx.entities('solid').some((e) => e.kind === 'chamfer'), targets: () => [{ el: '#left-panel [data-command="dress:chamfer"]' }] },
    },
    {
      title: T('두께와 3D 오프셋', 'Thickness and 3D offset'),
      text: T('"두께"는 속을 비우고 윗면을 엽니다(벽 두께 3). "3D 오프셋"은 솔리드를 고르게 키우거나(+) 줄입니다(−).', '"Thickness" hollows the solid and opens its top (3 mm walls). "3D offset" grows (+) or shrinks (−) the solid evenly.'),
      run: async (ctx) => {
        const cup = ctx.api.insertSolid('box', { length: 40, width: 30, height: 25 }, { x: 120, y: 50, z: 0 });
        ctx.select([cup.id]);
        await ctx.dialog('solid', () => ctx.api.run('dress:thickness'), () => ctx.api.dressUp('thickness', { thickness: 3 }));
        const grow = ctx.api.insertSolid('box', { length: 20, width: 20, height: 20 }, { x: 0, y: 80, z: 0 });
        ctx.select([grow.id]);
        await ctx.api.dressUp('offset3d', { distance: 3 });
        ctx.expect(ctx.entities('solid').some((e) => e.kind === 'thickness') && ctx.entities('solid').some((e) => e.kind === 'offset3d'), 'thickness and offset expected');
      },
      practice: { todo: T('솔리드를 고르고 "두께"나 "3D 오프셋"을 누르세요.', 'Select a solid and click "Thickness" or "3D offset".'), check: (ctx) => ctx.entities('solid').some((e) => e.kind === 'thickness' || e.kind === 'offset3d'), targets: () => [{ el: '#left-panel [data-command="dress:thickness"]' }, { el: '#left-panel [data-command="dress:offset3d"]' }] },
    },
    {
      title: T('3D로 확인하기', 'Checking in 3D'),
      text: T('3D 보기에서 포켓 · 구멍 · 모따기 · 속 빈 상자를 확인합니다.', 'Look at the pocket, the hole, the chamfer and the hollow box in 3D.'),
      run: async (ctx) => { await ctx.command('view3d'); await ctx.api.waitIdle(800); ctx.expect(ctx.api.state().view3d, '3D view not shown'); await ctx.wait(2500); await ctx.command('view3d'); },
      practice: { todo: T('3D 보기 버튼을 누르세요.', 'Click the 3D view button.'), check: (ctx) => ctx.api.state().view3d, targets: () => [cmd('view3d')] },
    },
    {
      title: T('바디 · 패턴 메뉴', 'Body and pattern menus'),
      text: T('3D 솔리드 메뉴에는 FreeCAD PartDesign 처럼 바디 · 팁, 선형 · 원형 패턴 · 대칭 · 다중 변환, 빼는 나선 · 로프트 · 파이프, 바인더 명령이 있습니다.', 'The 3D solid menu has PartDesign\'s body and tip, linear and polar patterns, mirrored and multi-transform, subtractive helix, loft and pipe, and binders.'),
      run: async (ctx) => { await ctx.menu('solid', ['body']); await ctx.menu('solid', ['patterns']); await ctx.menu('solid', ['subtractive']); },
      practice: { todo: T('3D 솔리드 메뉴에서 패턴을 펼쳐 보세요.', 'Open Patterns in the 3D solid menu.'), targets: () => [{ el: '[data-menu="solid"]' }] },
    },
  ],
};

// ───────────────────────── 27. check geometry, mesh, reverse engineering
/** A 20 mm mesh box at (x, 0) with its top missing and one face turned over (for check and repair). */
const brokenBox = (x) => {
  const s = 20;
  const P = (px, py, pz) => [px + x, py, pz];
  const quads = [[P(0, 0, 0), P(0, s, 0), P(s, s, 0), P(s, 0, 0)], [P(0, 0, 0), P(s, 0, 0), P(s, 0, s), P(0, 0, s)], [P(s, 0, 0), P(s, s, 0), P(s, s, s), P(s, 0, s)], [P(s, s, 0), P(0, s, 0), P(0, s, s), P(s, s, s)], [P(0, s, 0), P(0, 0, 0), P(0, 0, s), P(0, s, s)]];
  const tris = quads.flatMap(([p, q, r, t]) => [[p, q, r], [p, r, t]]);
  tris[2] = [tris[2][0], tris[2][2], tris[2][1]];
  return tris.flat(2);
};
const meshLesson = {
  title: T('형상 검사·메시·역설계', 'Check geometry, meshes, reverse engineering'),
  fresh: true,
  steps: [
    {
      title: T('형상 검사', 'Check geometry'),
      text: T('3D 솔리드 › 형상 검사는 솔리드마다 닫혔는지, 열린 · 비다양체 모서리, 방향이 어긋난 곳, 뒤집힌 껍질, 자기 교차, 퇴화 · 중복 삼각형을 보여 줍니다. 윗면이 없고 면 하나가 뒤집힌 메시 상자가 문제로 나옵니다.', '3D solid › Check geometry reports for each solid whether it is closed, open and non-manifold edges, flipped faces, inside-out shells, self-intersections and degenerate or duplicate triangles. A mesh box without its top and with one face turned over shows up as a problem.'),
      run: async (ctx) => {
        await ctx.fresh();
        ctx.api.insertSolid('box', { length: 40, width: 30, height: 20 }, { x: 0, y: 0, z: 0 });
        ctx.api.insertSolid('sphere', { radius: 20 }, { x: 100, y: 40, z: 0 });
        ctx.api.addEntity('solid', { kind: 'mesh', name: ctx.lang === 'ko' ? '깨진 메시' : 'broken mesh', shape: { tris: brokenBox(60) } });
        ctx.select([]);
        await ctx.dialog('check', () => ctx.api.run('checkGeometry'), null, 2800);
      },
      practice: { todo: T('"형상 검사"를 누르세요.', 'Click "Check geometry".'), targets: () => [{ el: '#left-panel [data-command="checkGeometry"]' }] },
    },
    {
      title: T('메시 단순화', 'Mesh decimation'),
      text: T('솔리드를 고르고 "메시 단순화"를 누르면 모양은 거의 그대로, 삼각형은 절반쯤으로 줄어든 메시가 됩니다(닫힌 메시 유지).', 'Select a solid and click "Mesh decimation": it becomes a mesh with about half the triangles and almost the same shape (still closed).'),
      run: async (ctx) => {
        ctx.select([ctx.entities('solid').find((e) => e.kind === 'sphere').id]);
        await ctx.command('meshDecimate');
        ctx.expect(ctx.entities('solid').some((e) => e.kind === 'mesh'), 'mesh solid expected');
      },
      practice: { todo: T('솔리드를 고르고 "메시 단순화"를 누르세요.', 'Select a solid and click "Mesh decimation".'), check: (ctx) => ctx.entities('solid').some((e) => e.kind === 'mesh'), targets: () => [{ el: '#left-panel [data-command="meshDecimate"]' }] },
    },
    {
      title: T('메시 수리', 'Mesh repair'),
      text: T('"메시 수리"는 틈(T 접점)을 잇고, 구멍을 메우고, 면 방향을 맞춘 닫힌 메시 솔리드를 만듭니다. 깨진 메시 상자를 고르고 수리합니다. 형상 검사 창에서 체크하고 수리해도 됩니다.', '"Mesh repair" joins gaps (T-junctions), fills holes and orients the faces into a closed mesh solid. Select the broken mesh box and repair it. You can also tick solids in the check window and repair them there.'),
      run: async (ctx) => {
        const broken = () => ctx.entities('solid').find((e) => e.kind === 'mesh' && /깨진|broken/.test(e.name ?? ''));
        const before = broken().shape.tris.length;
        ctx.select([broken().id]);
        await ctx.command('meshRepair');
        ctx.expect(broken().shape.tris.length > before, 'the repaired mesh should have its top filled');
        await ctx.command('view3d'); await ctx.api.waitIdle(800); await ctx.command('view3dStyle:mesh'); await ctx.wait(2200); await ctx.command('view3dStyle:asis'); await ctx.command('view3d');
      },
      practice: { todo: T('깨진 메시를 고르고 "메시 수리"를 누르세요.', 'Select the broken mesh and click "Mesh repair".'), setup: (ctx, mem) => { mem.tris = ctx.entities('solid').filter((e) => e.kind === 'mesh').map((e) => e.shape.tris.length).join(); }, check: (ctx, mem) => ctx.entities('solid').filter((e) => e.kind === 'mesh').map((e) => e.shape.tris.length).join() !== mem.tris, targets: () => [{ el: '#left-panel [data-command="meshRepair"]' }] },
    },
    {
      title: T('메시 도구 메뉴', 'The mesh tools menu'),
      text: T('3D 솔리드 › 검사 · FEM 해석 › 메시 도구에는 FreeCAD Mesh 워크벤치의 정규 도형 · 곡률 색 · 다각형 자르기 · 평활화 · 구멍 메우기 · 육안 검사 같은 명령이 모두 있습니다.', '3D solid › Check and FEM › Mesh tools holds FreeCAD Mesh\'s commands: regular solids, curvature colours, polygon cuts, smoothing, hole filling, visual inspection and more.'),
      run: async (ctx) => { await ctx.menu('solid', ['analysis']); await ctx.menu('solid', ['analysis', 'meshTools']); },
      practice: { todo: T('3D 솔리드 메뉴에서 메시 도구를 펼쳐 보세요.', 'Open Mesh tools in the 3D solid menu.'), targets: () => [{ el: '[data-menu="solid"]' }] },
    },
    {
      title: T('역설계: 점 구름에서 형상으로', 'Reverse engineering: from points to shapes'),
      text: T('점 구름(.xyz · .ply 점)을 가져와 고르면 평면 · 구 · 원기둥 맞춤과 메시 만들기, 곡면 근사 · 단면 · 검사 명령을 씁니다.', 'Import a point cloud (.xyz, .ply points), select it, and fit a plane, a sphere or a cylinder, make a mesh, approximate surfaces, take sections or inspect.'),
      run: async (ctx) => { await ctx.menu('solid', ['reverse']); },
      practice: { todo: T('3D 솔리드 메뉴에서 역설계를 펼쳐 보세요.', 'Open Reverse engineering in the 3D solid menu.'), targets: () => [{ el: '[data-menu="solid"]' }] },
    },
  ],
};

// ───────────────────────── 28. BIM: walls, openings, slab, roof, space
const HOUSE = { minX: -1500, minY: -1500, maxX: 8000, maxY: 5500 };
const bimWalls = {
  title: T('건축 (BIM) 1: 벽·창문·슬래브·지붕·실', 'BIM 1: walls, windows, slabs, roofs, spaces'),
  fresh: true,
  steps: [
    {
      title: T('벽', 'Walls'),
      text: T('선 · 폴리선 · 사각형을 그려 고르고 건축 › 벽을 누릅니다. 닫힌 윤곽은 모서리가 맞춰진 고리 벽이 됩니다. 두께 200 · 높이 2700으로 6 × 4 m 벽을 세웁니다. 평면은 바닥에서 1 m 높이로 자른 단면입니다.', 'Draw lines, a polyline or a rectangle, select it and click BIM › Wall. A closed outline makes a ring of walls with mitred corners. Build 6 × 4 m walls, 200 thick and 2700 high. The plan is a cut 1 m above the floor.'),
      run: async (ctx) => {
        await ctx.fresh();
        ctx.view(HOUSE);
        await ctx.tool('rect'); await ctx.clicks([[0, 0], [6000, 4000]]); selectTool(ctx);
        ctx.select([ctx.last('rect').id]);
        await ctx.dialog('solid', () => ctx.api.run('arch:wall'), () => ctx.api.actions().archFeature('wall', { width: 200, height: 2700 }));
        ctx.expect(ctx.entities('solid').some((e) => e.kind === 'wall'), 'wall expected');
      },
      practice: { todo: T('사각형을 그려 고르고 건축 묶음의 "벽"을 누르세요.', 'Draw and select a rectangle, then click "Wall" in the BIM group.'), check: (ctx) => ctx.entities('solid').some((e) => e.kind === 'wall'), targets: () => [{ el: '#left-panel [data-command="arch:wall"]' }] },
    },
    {
      title: T('창과 문', 'Windows and doors'),
      text: T('벽을 고르고 "창 넣기" / "문 넣기"를 누르면 창 · 문 · 개구부 편집 창이 열립니다. 종류(창 · 문 · 양개문 · 미닫이 · 개구부) · 위치 · 폭 · 창대 높이 · 여는 쪽을 정하면 벽이 뚫리고 창틀 · 유리 · 문짝이 들어갑니다.', 'Select a wall and click "Window" or "Door": the openings editor opens. Choose the type (window, door, double door, sliding, opening), position, width, sill and swing; the wall is cut and frames, glass and leaves go in.'),
      run: async (ctx) => {
        const wall = ctx.entities('solid').find((e) => e.kind === 'wall');
        ctx.select([wall.id]);
        await ctx.dialog('solid', () => ctx.api.run('arch:window'), () => { ctx.api.addOpeningNow('window', 1500); ctx.api.addOpeningNow('door', 900); });
        ctx.expect((ctx.entities('solid').find((e) => e.kind === 'wall').shape.openings ?? []).length >= 2, 'a window and a door expected');
      },
      practice: { todo: T('벽을 고르고 "창 넣기"를 누르세요.', 'Select the wall and click "Window".'), check: (ctx) => ctx.entities('solid').some((e) => e.kind === 'wall' && e.shape?.openings?.length), targets: () => [{ el: '#left-panel [data-command="arch:window"]' }, { el: '#left-panel [data-command="arch:door"]' }] },
    },
    {
      title: T('슬래브', 'Slabs'),
      text: T('닫힌 윤곽을 고르고 "슬래브"를 누르면 두께만큼의 바닥판이 됩니다. 벽 바깥으로 100씩 큰 사각형을 그려 두께 200 슬래브를 만듭니다.', 'Select a closed outline and click "Slab": a floor plate of a thickness. Draw a rectangle 100 larger than the walls and make a 200 thick slab.'),
      run: async (ctx) => {
        await ctx.tool('rect'); await ctx.clicks([[-100, -100], [6100, 4100]]); selectTool(ctx);
        ctx.select([ctx.last('rect').id]);
        await ctx.dialog('solid', () => ctx.api.run('arch:slab'), () => ctx.api.actions().archFeature('slab', { thickness: 200 }));
        ctx.expect(ctx.entities('solid').some((e) => e.kind === 'slab'), 'slab expected');
      },
      practice: { todo: T('닫힌 윤곽을 고르고 "슬래브"를 누르세요.', 'Select a closed outline and click "Slab".'), check: (ctx) => ctx.entities('solid').some((e) => e.kind === 'slab'), targets: () => [{ el: '#left-panel [data-command="arch:slab"]' }] },
    },
    {
      title: T('지붕', 'Roofs'),
      text: T('닫힌 윤곽을 고르고 "지붕"을 누릅니다. 박공 · 모임 · 외쪽 · 평지붕과 경사 · 처마 길이 · 두께를 정하고, 지붕 편집 창의 변별 경사 탭에서 변마다 경사를 줍니다(90°면 박공).', 'Select a closed outline and click "Roof". Pick gable, hip, shed or flat, the slope, overhang and thickness; the per-edge slope tab gives each edge its own slope (90° makes a gable).'),
      run: async (ctx) => {
        await ctx.tool('rect'); await ctx.clicks([[0, 0], [6000, 4000]]); selectTool(ctx);
        ctx.select([ctx.last('rect').id]);
        await ctx.dialog('solid', () => ctx.api.run('arch:roof'), () => ctx.api.actions().archFeature('roof', { roofType: 1, slope: 30, overhang: 400, thickness: 200 }));
        ctx.expect(ctx.entities('solid').some((e) => e.kind === 'roof'), 'roof expected');
      },
      practice: { todo: T('닫힌 윤곽을 고르고 "지붕"을 누르세요.', 'Select a closed outline and click "Roof".'), check: (ctx) => ctx.entities('solid').some((e) => e.kind === 'roof'), targets: () => [{ el: '#left-panel [data-command="arch:roof"]' }] },
    },
    {
      title: T('실 (공간)', 'Spaces'),
      text: T('닫힌 윤곽을 고르고 "공간"을 누르면 실이 됩니다. 이름(속성 패널)과 바닥 면적이 평면도에 표시되고 물량표에 들어갑니다.', 'Select a closed outline and click "Space": a room. Its name (properties) and floor area show on the plan and go into the schedule.'),
      run: async (ctx) => {
        await ctx.tool('rect'); await ctx.clicks([[100, 100], [5900, 3900]]); selectTool(ctx);
        ctx.select([ctx.last('rect').id]);
        await ctx.dialog('solid', () => ctx.api.run('arch:space'), () => ctx.api.actions().archFeature('space', { height: 2400 }));
        ctx.expect(ctx.entities('solid').some((e) => e.kind === 'space'), 'space expected');
      },
      practice: { todo: T('닫힌 윤곽을 고르고 "공간"을 누르세요.', 'Select a closed outline and click "Space".'), check: (ctx) => ctx.entities('solid').some((e) => e.kind === 'space'), targets: () => [{ el: '#left-panel [data-command="arch:space"]' }] },
    },
    {
      title: T('3D로 보기', 'In 3D'),
      text: T('3D 보기로 바꾸면 같은 모델이 입체로 보입니다. 벽은 색으로, 유리는 반투명으로, 실은 옅은 부피로 보입니다.', 'Switch to 3D: the same model stands up. Walls are coloured, glass translucent and spaces faint volumes.'),
      run: async (ctx) => { await ctx.command('view3d'); await ctx.api.waitIdle(800); ctx.expect(ctx.api.state().view3d, '3D view not shown'); await ctx.wait(3000); await ctx.command('view3d'); },
      practice: { todo: T('3D 보기 버튼을 누르세요.', 'Click the 3D view button.'), check: (ctx) => ctx.api.state().view3d, targets: () => [cmd('view3d')] },
    },
  ],
};

// ───────────────────────── 29. BIM: structure, levels, schedules, IFC
const bimMore = {
  title: T('건축 (BIM) 2: 기둥·계단·층·철근·물량표·IFC', 'BIM 2: columns, stairs, levels, rebar, schedules, IFC'),
  steps: [
    {
      title: T('기둥 · 계단 · 가구', 'Columns, stairs, furniture'),
      text: T('기둥 · 계단 · 가구·설비 · 통심선은 바로 넣기 창에서 만듭니다. 기둥 단면은 사각 · 원 · H · ㄷ · ㄱ · T · 각관 · 원형관과 규격 단면(IPE · HEA …), 계단은 일자 · ㄱ자 · ㄷ자 · 나선입니다.', 'Columns, stairs, furniture and grids come from their insert windows. Column sections: rectangle, round, H, C, L, T, box and pipe, plus standard profiles (IPE, HEA…); stairs: straight, L, U and spiral.'),
      run: async (ctx) => {
        ctx.view(HOUSE);
        await ctx.dialog('solid', () => ctx.api.openSolidDialog({ kind: 'column' }), () => ctx.api.insertSolid('column', { width: 300, depth: 300, height: 2700 }, { x: 3000, y: 2000 }));
        ctx.api.insertSolid('stairs', { length: 3000, width: 1000, height: 2700, steps: 15 }, { x: 500, y: 500 });
        ctx.api.insertSolid('equipment', { equipment: 0, length: 2000, width: 1500, height: 900 }, { x: 3500, y: 500 });
        const kinds = ctx.entities('solid').map((e) => e.kind);
        ctx.expect(['column', 'stairs', 'equipment'].every((k) => kinds.includes(k)), 'column, stairs and furniture expected');
      },
      practice: { todo: T('건축 묶음의 "기둥"이나 "계단"을 누르세요.', 'Click "Column" or "Stairs" in the BIM group.'), check: (ctx) => ctx.entities('solid').some((e) => e.kind === 'column' || e.kind === 'stairs'), targets: () => [{ el: '#left-panel [data-command="arch:column"]' }, { el: '#left-panel [data-command="arch:stairs"]' }] },
    },
    {
      title: T('통심선', 'Grids'),
      text: T('통심선은 격자(가로 · 세로 개수와 간격) 또는 방사형으로 놓입니다. 3 × 2 통심선을 3 m · 4 m 간격으로 넣습니다.', 'Grids are rectangular (counts and spacings) or radial. Insert a 3 × 2 grid at 3 m and 4 m.'),
      run: async (ctx) => {
        ctx.api.insertSolid('axis', { countX: 3, spacingX: 3000, countY: 2, spacingY: 4000 }, {});
        ctx.expect(ctx.entities('solid').some((e) => e.kind === 'axis'), 'grid expected');
        await ctx.wait(1000);
      },
      practice: { todo: T('건축 묶음의 "통심선"을 누르세요.', 'Click "Grid" in the BIM group.'), check: (ctx) => ctx.entities('solid').some((e) => e.kind === 'axis'), targets: () => [{ el: '#left-panel [data-command="arch:axis"]' }] },
    },
    {
      title: T('층과 건물 창', 'Levels and the building window'),
      text: T('왼쪽 "건물 (BIM)" 묶음에서 층을 추가하고, 새 객체를 놓을 층(✓) · 평면도에 보일 층 · 층 보이기를 정합니다. "건물·층·재료…" 창에서 층 이름 · 표고 · 층고와 재료(색 · 해칭)를 바꿉니다.', 'In the "Building (BIM)" group add levels and choose where new objects go (✓), which level the plan shows and which are visible. The "Building, levels, materials…" window changes names, elevations, heights and materials (colour, hatch).'),
      run: async (ctx) => {
        ctx.api.openSection('building');
        await ctx.click('#left-panel [data-level-add]');
        ctx.expect(ctx.drawing().bim?.levels.length >= 2, 'a second level expected');
        await ctx.dialog('bim', () => ctx.api.run('bimManager'), null, 2600);
        await ctx.click('#left-panel [data-level-active="L1"]').catch(() => {});
      },
      practice: { todo: T('건물 묶음의 층 추가 버튼을 누르세요.', 'Click the add-level button in the building group.'), check: (ctx) => (ctx.drawing().bim?.levels.length ?? 0) >= 2, targets: () => [{ el: '#left-panel [data-level-add]' }] },
    },
    {
      title: T('철근', 'Rebar'),
      text: T('기둥 · 보 · 슬래브를 고르고 "철근"을 누르면 주근 · 띠철근 · 2방향 배근이 들어가고 무게가 물량표에 잡힙니다. 선을 고르면 그 모양대로 굽힌 철근이 됩니다.', 'Select columns, beams or slabs and click "Rebar": main bars, ties or two-way mats, with their weight in the schedule. Selected lines give bars bent to their shape.'),
      run: async (ctx) => {
        ctx.select([ctx.entities('solid').find((e) => e.kind === 'column').id]);
        await ctx.dialog('solid', () => ctx.api.run('arch:rebar'), () => ctx.api.actions().addRebar({}));
        ctx.expect(ctx.entities('solid').some((e) => e.kind === 'rebar'), 'rebar expected');
      },
      practice: { todo: T('기둥을 고르고 "철근"을 누르세요.', 'Select the column and click "Rebar".'), check: (ctx) => ctx.entities('solid').some((e) => e.kind === 'rebar'), targets: () => [{ el: '#left-panel [data-command="arch:rebar"]' }] },
    },
    {
      title: T('물량표', 'Schedules'),
      text: T('"물량표"는 벽 길이 · 면적 · 체적, 창 · 문 개수, 슬래브 · 지붕 면적, 실별 면적을 도면 오른쪽에 표로 넣습니다. "물량표를 CSV 로"는 객체마다 한 줄씩 Excel 용 파일로, "패널 재단"은 패널을 판에 배치합니다.', '"Schedule" puts wall lengths, areas and volumes, window and door counts, slab and roof areas and room areas in a table right of the drawing. "Schedule as CSV" writes one row per object for Excel; "Panel nesting" lays panels out on sheets.'),
      run: async (ctx) => {
        await ctx.command('archSchedule');
        ctx.api.zoomFit();
        await ctx.wait(1500);
        ctx.expect(ctx.last('text')?.text.includes('BIM'), 'schedule expected');
      },
      practice: { todo: T('건축 묶음의 "물량표"를 누르세요.', 'Click "Schedule" in the BIM group.'), check: (ctx, mem) => has(ctx, mem, 'text'), targets: () => [{ el: '#left-panel [data-command="archSchedule"]' }] },
    },
    {
      title: T('IFC 와 3D 내보내기', 'IFC and 3D export'),
      text: T('3D 내보내기 › IFC 4 로 IfcWall · IfcWindow · IfcDoor · IfcSlab · IfcSpace … 를 개구부 · 물량과 함께 씁니다. MyCAD 가 만든 IFC 는 다시 열면 매개변수 객체 그대로입니다. FCStd · STEP · STL · 3MF 등도 같은 메뉴에 있습니다.', '3D export › IFC 4 writes IfcWall, IfcWindow, IfcDoor, IfcSlab, IfcSpace… with openings and quantities. IFC written by MyCAD opens again as parametric objects. FCStd, STEP, STL, 3MF and more are in the same menu.'),
      run: async (ctx) => { await ctx.command('export3dMenu'); await ctx.wait(2400); ctx.api.closeMenu(); },
      practice: { todo: T('파일 › 내보내기 › 3D 내보내기를 열어 보세요.', 'Open File › Export › 3D export.'), targets: () => [{ el: '[data-menu="file"]' }] },
    },
    {
      title: T('샘플: 2층 주택', 'Sample: a two-storey house'),
      text: T('샘플 "2층 주택"은 층별 평면도, 다층 벽(벽돌 · 단열 · 콘크리트 · 석고), 변별 경사 L자 지붕, 슬래브 철근, 트러스 · 골판 카포트, 가스관, 스케치로 만든 아치 창을 모두 보여 줍니다.', 'The sample "Two-storey house" shows plans per level, layered walls (brick, insulation, concrete, plaster), an L-shaped roof with per-edge slopes, slab rebar, a truss and corrugated carport, a gas pipe and an arched window from a sketch.'),
      run: async (ctx) => {
        await ctx.api.openSample('24-two-storey-house.mcad');
        await ctx.api.waitIdle();
        ctx.expect(ctx.entities('solid').some((e) => e.kind === 'wall'), 'house sample not open');
        await ctx.command('view3d'); await ctx.api.waitIdle(800); await ctx.wait(3000); await ctx.command('view3d');
      },
      practice: { todo: T('시작 페이지에서 "2층 주택" 샘플을 여세요.', 'Open the "Two-storey house" sample from the start page.'), targets: () => [{ el: '.sample-card[data-sample="24-two-storey-house.mcad"]' }] },
    },
  ],
};

// ───────────────────────── 30. CAM in 2D (G-code)
const cam2d = {
  title: T('CAM 2D: 윤곽·포켓·드릴 G 코드', 'CAM in 2D: profile, pocket, drilling G-code'),
  fresh: true,
  steps: [
    {
      title: T('CAM 창', 'The CAM window'),
      text: T('2D 윤곽을 고르고(없으면 보이는 것 전부) 파일 › CAM — G 코드 만들기를 엽니다. 가공: 윤곽(바깥/안쪽) · 포켓(지그재그 + 마무리, 섬은 남김) · 드릴(G83 펙 / G81) · 각인. 오른쪽에 경로(파랑)와 빠른 이동(점선), 아래에 절삭 길이와 예상 시간이 나옵니다.', 'Select 2D outlines (or none for everything visible) and open File › CAM — make G-code. Operations: profile (outside or inside), pocket (zigzag plus a finishing pass, islands kept), drilling (G83 peck or G81) and engraving. The path (blue) and rapids (dashed) show on the right, cut length and time below.'),
      run: async (ctx) => {
        await ctx.fresh();
        await ctx.tool('rect'); await ctx.clicks([[0, 0], [100, 50]]);
        await ctx.tool('circle'); await ctx.clicks([[30, 25], [38, 25]]); await ctx.key('Escape'); selectTool(ctx);
        ctx.select([]);
        await ctx.dialog('cam', () => ctx.api.run('cam'), null, 3000);
      },
      practice: { todo: T('윤곽을 그리고 CAM 을 여세요.', 'Draw an outline and open CAM.'), targets: () => [cmd('cam'), { el: '[data-menu="file"]' }] },
    },
    {
      title: T('G 코드 저장', 'Saving G-code'),
      text: T('공구 지름 · 깊이 · 한 번 깊이 · 겹침 · 이송 · 주축 회전 · 안전 높이를 정하고 "G 코드 저장"을 누르면 .nc (mm, G21 G90; LinuxCNC · GRBL) 파일이 됩니다. 구멍은 G98 G81 X30 Y25 Z-4 처럼 나옵니다.', 'Set the tool diameter, depth, step-down, overlap, feeds, spindle speed and safe height, then "Save G-code" writes a .nc file (mm, G21 G90; LinuxCNC, GRBL). The hole comes out as G98 G81 X30 Y25 Z-4.'),
      run: async (ctx) => {
        const gcode = await ctx.api.openCam({ operation: 'drill', depth: 4, peck: 0 });
        ctx.expect(/G81/.test(gcode ?? ''), 'drilling G-code expected');
        await ctx.wait(1200);
      },
      practice: { todo: T('CAM 창에서 드릴을 고르고 G 코드를 저장해 보세요.', 'Pick drilling in the CAM window and save the G-code.'), targets: () => [cmd('cam')] },
    },
    {
      title: T('CAM 잡 메뉴', 'The CAM job menu'),
      text: T('파일 › CAM 에는 FreeCAD CAM 처럼 잡 · 적응형 · 면 가공 · 나사 · V 조각 같은 작업, 홀딩 탭 · 도그본 같은 드레스업, 공구 · 시뮬레이션 · 점검 명령이 있습니다.', 'File › CAM has FreeCAD CAM\'s job and operations (adaptive, face, thread, V-carve…), dress-ups (holding tags, dogbones…), tools, simulation and the sanity check.'),
      run: async (ctx) => { await ctx.menu('file', ['cam']); await ctx.menu('file', ['cam', 'camOps']); await ctx.menu('file', ['cam', 'camDressups']); },
      practice: { todo: T('파일 메뉴에서 CAM 을 펼쳐 보세요.', 'Open CAM in the File menu.'), targets: () => [{ el: '[data-menu="file"]' }] },
    },
  ],
};

// ───────────────────────── 31. FEM frame analysis
const femFrame = {
  title: T('FEM 골조 해석', 'FEM frame analysis'),
  fresh: true,
  steps: [
    {
      title: T('골조 그리기', 'Drawing the frame'),
      text: T('골조를 선으로 입면에 그립니다. 끝이 만나는 곳이 절점입니다. 높이 3 m, 폭 5 m 문형 골조: (0,0) → (0,3000) → (5000,3000) → (5000,0).', 'Draw the frame in elevation with lines; where ends meet are the nodes. A portal frame 3 m high and 5 m wide: (0,0) → (0,3000) → (5000,3000) → (5000,0).'),
      run: async (ctx) => {
        await ctx.fresh();
        ctx.view({ minX: -800, minY: -800, maxX: 5800, maxY: 3800 });
        await ctx.tool('line'); await ctx.clicks([[0, 0], [0, 3000], [5000, 3000], [5000, 0]]); await ctx.key('Escape'); await ctx.key('Escape'); selectTool(ctx);
        ctx.expect(ctx.entities('line').length === 3, 'three members expected');
      },
      practice: { todo: T('선 도구로 네 점을 차례로 누르세요.', 'Click the four points with the line tool.'), check: (ctx, mem) => has(ctx, mem, 'line', 3), targets: () => [tile('line')] },
    },
    {
      title: T('골조 해석 창', 'The frame analysis window'),
      text: T('3D 솔리드 › FEM — 골조 해석: 재료 · 단면, 보의 등분포 하중(N/mm) · 자중, 절점마다 지지(자유 · 핀 · 고정 · 롤러)와 하중을 정하면 변형(빨간 점선) · 휨 모멘트도(파랑) · 최대 변위 · 응력이 바로 나옵니다. 두 기둥 발을 고정하고 3 N/mm 를 겁니다.', '3D solid › FEM — frame analysis: material, section, a uniform load (N/mm) and self-weight, and for every node a support (free, pinned, fixed, roller) and loads give the deformed shape (red dashes), the bending moments (blue), the largest displacement and stress at once. Fix both column feet and load 3 N/mm.'),
      run: async (ctx) => {
        await ctx.dialog('fem', () => ctx.api.run('fem'), () => ctx.api.actions().openFem({ action: 'draw', fem: { supports: { '0,0': 'fixed', '5000,0': 'fixed' }, q: 3 } }), 2800);
        ctx.expect(ctx.entities().some((e) => e.layer === 'fem'), 'results on the FEM layer expected');
        ctx.api.zoomFit();
        await ctx.wait(1500);
      },
      practice: { todo: T('골조를 그리고 "FEM — 골조 해석"을 여세요.', 'Draw a frame and open "FEM — frame analysis".'), targets: () => [{ el: '#left-panel [data-command="fem"]' }] },
    },
    {
      title: T('FEM 해석 도구 메뉴', 'The FEM tools menu'),
      text: T('3D 솔리드 › 검사 · FEM 해석 › FEM 해석 도구에는 FreeCAD FEM 의 구속 · 하중, 열 · 전기 · 자기 · 유동 조건, 방정식, 재료, 메시, 풀이, 결과(색 · 필터 · 그래프) 명령이 있습니다.', '3D solid › Check and FEM › FEM tools holds FreeCAD FEM\'s constraints and loads, thermal, electric, magnetic and flow conditions, equations, materials, meshing, solving and results (colours, filters, charts).'),
      run: async (ctx) => { await ctx.menu('solid', ['analysis', 'femTools']); await ctx.menu('solid', ['analysis', 'femTools', 'femConstraints']); },
      practice: { todo: T('3D 솔리드 메뉴에서 FEM 해석 도구를 펼쳐 보세요.', 'Open FEM tools in the 3D solid menu.'), targets: () => [{ el: '[data-menu="solid"]' }] },
    },
  ],
};

// ───────────────────────── 32. spreadsheet, JavaScript console, macros
const scripting = {
  title: T('스프레드시트·스크립트 콘솔·매크로 기록', 'Spreadsheet, script console, macro recording'),
  fresh: true,
  steps: [
    {
      title: T('스프레드시트', 'The spreadsheet'),
      text: T('편집 › 스프레드시트 창에서 셀에 값 · 계산식(=width*3)을 쓰고 셀에 별칭(width)을 붙입니다. A1 에 40, 별칭 width.', 'In Edit › Spreadsheet write values and formulas (=width*3) into cells and give cells aliases (width). Put 40 in A1 and call it width.'),
      run: async (ctx) => {
        await ctx.fresh();
        await ctx.dialog('spreadsheet', () => ctx.api.run('spreadsheet'), () => ctx.api.actions().openSpreadsheet({ action: 'apply', sheet: { cells: { A1: '40', B1: '=width*3' }, aliases: { width: 'A1' } } }), 2600);
        ctx.expect(ctx.drawing().spreadsheet?.aliases?.width === 'A1', 'alias width expected');
      },
      practice: { todo: T('편집 메뉴에서 스프레드시트를 여세요.', 'Open the spreadsheet from the Edit menu.'), check: (ctx) => Boolean(ctx.drawing().spreadsheet), targets: () => [{ el: '[data-menu="edit"]' }] },
    },
    {
      title: T('치수를 시트에 묶기', 'Binding sizes to the sheet'),
      text: T('속성 패널의 숫자 칸에 =width*2 처럼 쓰면 그 치수가 시트를 따릅니다. 상자의 길이를 =width*2 로 하면 80, 시트에서 width 를 25 로 바꾸면 50 이 됩니다.', 'Write =width*2 into a number field of the properties and that size follows the sheet. A box length of =width*2 is 80; change width to 25 in the sheet and it becomes 50.'),
      run: async (ctx) => {
        const box = ctx.api.insertSolid('box', { length: 10, width: 10, height: 10 }, { x: 0, y: 0, z: 0 });
        ctx.select([box.id]);
        await ctx.field('#right-panel [data-solid-param="length"]', '=width*2');
        ctx.expect(near(ctx.last('solid').params.length, 80), 'length 80 expected');
        await ctx.api.actions().openSpreadsheet({ action: 'apply', sheet: { cells: { A1: '25', B1: '=width*3' }, aliases: { width: 'A1' } } });
        await ctx.wait(900);
        ctx.expect(near(ctx.last('solid').params.length, 50), 'length 50 expected');
      },
      practice: { todo: T('솔리드를 고르고 길이 칸에 =width*2 를 쓰세요.', 'Select a solid and type =width*2 into its length.'), check: (ctx) => ctx.entities('solid').some((e) => near(e.params?.length ?? 0, 80) || near(e.params?.length ?? 0, 50)), targets: () => [{ el: '#right-panel [data-solid-param="length"]' }] },
    },
    {
      title: T('스크립트 콘솔 (JavaScript)', 'The script console (JavaScript)'),
      text: T('보기 › 스크립트 콘솔(Ctrl+Shift+J)에서 cad 객체로 그립니다: cad.rect · cad.circle · cad.line · cad.solid · cad.move … 실행은 Ctrl+Enter, 고친 것마다 실행 취소 한 단계입니다.', 'View › Script console (Ctrl+Shift+J) draws with the cad object: cad.rect, cad.circle, cad.line, cad.solid, cad.move… Run with Ctrl+Enter; every change is one undo step.'),
      run: async (ctx) => {
        ctx.api.updateSettings({ showConsole: true, consoleLanguage: 'js' });
        await ctx.wait(600);
        await ctx.api.runScript('cad.rect(40, 0, 60, 40);\nfor (let i = 0; i < 3; i++) cad.circle(55 + i * 15, 20, 5);\nprint(cad.entities().length)', { language: 'js' });
        ctx.expect(ctx.entities('circle').length >= 3, 'circles from the script expected');
        await ctx.wait(1500);
      },
      practice: { todo: T('콘솔에서 cad.circle(0, 0, 10) 을 실행하세요.', 'Run cad.circle(0, 0, 10) in the console.'), check: (ctx, mem) => has(ctx, mem, 'circle'), targets: () => [{ el: '[data-console="run"]' }] },
    },
    {
      title: T('매크로 기록', 'Recording a macro'),
      text: T('"매크로 기록"을 누르고 그리거나 명령을 실행한 뒤 다시 누르면 cad.* 줄이 편집기에 들어옵니다. 이름을 붙여 "매크로로 저장"하면 목록에서 실행 · 불러오기 · 지우기를 합니다.', 'Click "Record macro", draw or run commands, and click it again: cad.* lines appear in the editor. Name it and "Save as macro" to run, load or delete it from the list.'),
      run: async (ctx) => {
        await ctx.click('[data-console="record"]');
        await ctx.tool('line'); await ctx.clicks([[0, 60], [100, 60]]); await ctx.key('Escape'); await ctx.key('Escape'); selectTool(ctx);
        await ctx.command('zoomFit');
        await ctx.click('[data-console="record"]');
        await ctx.wait(1500);
        ctx.expect(/cad\./.test(ctx.api.actions().consoleState.code ?? ''), 'recorded lines expected');
        ctx.api.updateSettings({ showConsole: false });
      },
      practice: { todo: T('콘솔의 "매크로 기록"을 누르고 무언가 그린 뒤 다시 누르세요.', 'Click "Record macro" in the console, draw something and click it again.'), targets: () => [{ el: '[data-console="record"]' }] },
    },
  ],
};

// ───────────────────────── 33. robot, views, tools
const robotTools = {
  title: T('로봇·보기·도구 메뉴', 'Robots, views and the tools menu'),
  fresh: true,
  steps: [
    {
      title: T('로봇 팔', 'A robot arm'),
      text: T('3D 솔리드 › 로봇 › 로봇 추가로 6축 로봇 팔을 놓습니다. 속성 패널에서 관절 A1–A6 각도를 바꿉니다.', '3D solid › Robot › Add robot places a six-axis arm. Change the joint angles A1–A6 in the properties.'),
      run: async (ctx) => {
        await ctx.fresh();
        ctx.view({ minX: -400, minY: -500, maxX: 900, maxY: 500 });
        await ctx.command('robot:add');
        ctx.expect(ctx.entities('solid').some((e) => e.kind === 'robot'), 'robot expected');
      },
      practice: { todo: T('3D 솔리드 메뉴에서 로봇을 추가하세요.', 'Add a robot from the 3D solid menu.'), check: (ctx) => ctx.entities('solid').some((e) => e.kind === 'robot'), targets: () => [{ el: '[data-menu="solid"]' }] },
    },
    {
      title: T('점으로 움직이기', 'Moving to a point'),
      text: T('로봇과 점을 함께 고르고 "점으로 이동"을 누르면 역기구학으로 공구 끝이 그 점에 아래를 향해 닿습니다.', 'Select the robot and a point and click "Move to point": inverse kinematics brings the tool tip there, pointing down.'),
      run: async (ctx) => {
        ctx.api.addEntity('point', { x: 600, y: 200 });
        const robot = ctx.entities('solid').find((e) => e.kind === 'robot');
        ctx.select([robot.id, ctx.last('point').id]);
        await ctx.command('robot:moveTo');
        ctx.expect(ctx.entities('solid').find((e) => e.kind === 'robot').params.a1 !== 0, 'joint 1 should turn');
      },
      practice: { todo: T('로봇과 점을 고르고 "점으로 이동"을 누르세요.', 'Select the robot and a point and click "Move to point".'), targets: () => [{ el: '[data-menu="solid"]' }] },
    },
    {
      title: T('경로 따라가기', 'Following a path'),
      text: T('로봇과 폴리선을 고르고 "경로"를 누르면 20 mm 마다 자세를 구해 3D 에서 재생하고 KRL 프로그램을 만듭니다.', 'Select the robot and a polyline and click "Trajectory": poses every 20 mm, played back in 3D, and a KRL program.'),
      run: async (ctx) => {
        ctx.api.addEntity('polyline', { points: [{ x: 450, y: -150 }, { x: 650, y: -150 }, { x: 650, y: 150 }, { x: 450, y: 150 }], closed: true });
        const robot = ctx.entities('solid').find((e) => e.kind === 'robot');
        ctx.select([robot.id, ctx.last('polyline').id]);
        await ctx.api.toggle3d(true);
        await ctx.api.waitIdle(600);
        const run = await ctx.api.actions().robotTrajectory({ save: false, animate: !ctx.api.state().tutorial?.instant });
        ctx.expect(run?.reached, 'every point within reach expected');
        await ctx.wait(4000);
        await ctx.api.toggle3d(false);
      },
      practice: { todo: T('로봇과 폴리선을 고르고 "경로"를 누르세요.', 'Select the robot and a polyline and click "Trajectory".'), targets: () => [{ el: '[data-menu="solid"]' }] },
    },
    {
      title: T('보기 메뉴: 시점 · 카메라', 'The View menu: views and cameras'),
      text: T('보기 메뉴에는 표준 시점(정면 · 평면 · 우측 · 배면 · 저면 · 좌측 · 등각 · 이등각 · 삼등각), 정사영 · 원근 카메라, 저장한 시점, 축 · 절단면 · 회전대 · 입체 보기, 창 나란히 보기가 있습니다.', 'The View menu has the standard views (front, top, right, rear, bottom, left, isometric, dimetric, trimetric), orthographic and perspective cameras, saved views, axes, clipping, turntable and stereo, and tiled windows.'),
      run: async (ctx) => { await ctx.menu('view', ['standardViews']); await ctx.menu('view', ['camera']); await ctx.menu('view', ['viewTools']); },
      practice: { todo: T('보기 메뉴의 표준 시점을 펼쳐 보세요.', 'Open Standard views in the View menu.'), targets: () => [{ el: '[data-menu="view"]' }] },
    },
    {
      title: T('편집 메뉴: 보이기 · 링크 · 배치', 'The Edit menu: visibility, links, placement'),
      text: T('편집 메뉴에는 선택 기록, 보이기 · 숨기기, 색 · 투명도 · 재료, 그룹 · 다시 계산, 링크(다른 도면에서도), 변환 · 점 맞춤 정렬이 있습니다.', 'The Edit menu has selection history, show and hide, colour, transparency and materials, groups and recompute, links (from other drawings too), and transform and point-pair alignment.'),
      run: async (ctx) => { await ctx.menu('edit', ['visibility']); await ctx.menu('edit', ['links']); await ctx.menu('edit', ['placement']); },
      practice: { todo: T('편집 메뉴를 펼쳐 보세요.', 'Open the Edit menu.'), targets: () => [{ el: '[data-menu="edit"]' }] },
    },
    {
      title: T('도구 메뉴', 'The Tools menu'),
      text: T('도구 메뉴: 단위 계산기, 의존성 그래프, 문서 정리, 스크립트 콘솔과 매크로 폴더 · 최근 매크로, 애드온 관리자, 매크로 디버거(중단점 · 한 줄씩), 매개변수 편집기, 사용자 정의(툴바 · 단축키), 설정.', 'The Tools menu: units calculator, dependency graph, document utility, the script console, macro folder and recent macros, the addon manager, the macro debugger (breakpoints, stepping), the parameter editor, customise (toolbars, shortcuts) and settings.'),
      run: async (ctx) => { await ctx.menu('tools', [], 3200); },
      practice: { todo: T('도구 메뉴를 펼쳐 보세요.', 'Open the Tools menu.'), targets: () => [{ el: '[data-menu="tools"]' }] },
    },
    {
      title: T('모델 트리', 'The model tree'),
      text: T('왼쪽 패널 맨 위의 모델 트리는 솔리드와 2D 폴더, 그룹을 보여 줍니다. 눈 아이콘으로 숨기고, 누르면 선택되며, 접고 펼 수 있습니다.', 'The model tree at the top of the left panel lists the solids, the 2D folder and groups. The eye hides an item, a click selects it, and branches fold and unfold.'),
      run: async (ctx) => { ctx.api.insertSolid('box', { length: 200, width: 100, height: 50 }, { x: -300, y: -300, z: 0 }); ctx.api.openSection('model'); await ctx.wait(2000); },
      practice: { todo: T('왼쪽 패널의 모델 트리를 살펴보세요.', 'Look at the model tree in the left panel.'), targets: () => [{ el: '#left-panel [data-section="model"]' }] },
    },
  ],
};

export const LESSONS = [tour, drawing, precise, modify, annotate, props, parts, solids, features, booleans, views, view3d, files, printing, settings, help, assembly, exact, cam3d, femLesson, python, edit2d, sketch, helpers, techdraw, partDesign, meshLesson, bimWalls, bimMore, cam2d, femFrame, scripting, robotTools];

/**
 * Pictures of dialog windows for the documentation (scripts/docs-shots.mjs):
 * after step "lesson-step" runs, this window is opened and photographed too.
 */
export const DOC_DIALOGS = {
  '3-5': { popup: 'settings', open: (api) => api.popups.open('settings', { tab: 'general' }) },
  '4-9': { popup: 'array', open: (api) => api.run('array') },
  '7-1': { popup: 'part', open: (api) => api.openPartDialog({ kind: 'gear' }) },
  '8-2': { popup: 'solid', open: (api) => api.openSolidDialog({ kind: 'cylinder' }) },
  '11-1': { popup: 'solid', open: (api) => { api.select(api.drawing().entities.filter((e) => e.type === 'solid').map((e) => e.id)); return api.run('solidProject'); } },
  '13-4': { popup: 'menu', open: (api) => api.run('exportMenu') },
  '14-1': { popup: 'print', open: (api) => api.run('print') },
  '14-2': { popup: 'stl', open: (api) => api.run('exportStl') },
  '15-1': { popup: 'settings', open: (api) => api.popups.open('settings', { tab: 'drawing' }) },
  '16-1': { popup: 'coverage', open: (api) => api.run('freecadCoverage') },
  '16-2': { popup: 'about', open: (api) => api.run('about'), tab: 'files' },
  '19-1': { popup: 'cam', open: (api) => api.run('cam') },
  '20-2': { popup: 'fem3d', open: (api) => api.run('fem3d') },
  '21-2': { popup: 'addons', open: (api) => api.run('addons') },
};
