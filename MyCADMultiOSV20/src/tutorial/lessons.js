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

export const LESSONS = [tour, drawing, precise, modify, annotate, props, parts, solids, features, booleans, views, view3d, files, printing, settings, help];

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
};
