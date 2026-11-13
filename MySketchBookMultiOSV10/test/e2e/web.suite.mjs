// E2E suite: the real MySketchBook page (Vite dev build) in headless Edge with the
// GPU, driven through the test hook window.__mysketchbook and synthetic pointer
// events on the 3D canvas (never the real mouse). Each case throws on failure;
// the runner also fails a case when the page logged an error while it ran.
//
// Cases marked `desktop: true` also run in the desktop app (test/e2e/desktop.suite.mjs).
import assert from 'node:assert/strict';

/** Tags every case with its group. */
const group = (name, list) => list.map((c) => ({ group: name, ...c }));

export const cases = [
  ...group('시작 화면', [
    {
      name: '시작 화면: 오류 없이 표시, 옆 패널·하단 패널 없음 (#app.on-start)', desktop: true,
      async run(app) {
        const r = await app.run(`
          await T.reset({ project: false });
          if (A.state.doc) await A.actions.closeProject({ force: true });
          A.actions.showStartPage(true);
          await T.frames(3);
          const app = document.querySelector('#app');
          const shown = (sel) => { const el = document.querySelector(sel); if (!el || el.hidden) return false; const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2 && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden'; };
          return { onStart: app.classList.contains('on-start'), start: shown('#start-page'), left: shown('#left-panel'), right: shown('#right-panel'), bottom: shown('#bottom-panel'), palette: shown('#palette-host'), view: shown('#view-host'),
            templates: document.querySelectorAll('#start-page [data-start="template"]').length, samples: document.querySelectorAll('#start-page [data-start="sample"]').length, title: document.title };`);
        assert.ok(r.onStart, '#app.on-start');
        assert.ok(r.start, 'the start page is shown');
        assert.deepEqual({ left: r.left, right: r.right, bottom: r.bottom, palette: r.palette, view: r.view }, { left: false, right: false, bottom: false, palette: false, view: false }, 'no side panels, bottom panel, palette or 3D view');
        assert.ok(r.templates >= 5, `template cards (${r.templates})`);
        assert.ok(r.samples >= 4, `sample cards (${r.samples})`);
        assert.match(r.title, /^MySketchBook v\d+\.\d+\.\d+/);
      },
    },
  ]),

  ...group('템플릿', [
    {
      name: '모든 템플릿이 벽·방·문/창과 함께 오류 없이 만들어짐', desktop: true,
      async run(app) {
        const list = await app.run(`
          const out = [];
          for (const [id] of A.domain.TEMPLATES) {
            const d = await T.fresh(id);
            await T.sleep(150);
            const p = d.project;
            const b = A.builder;
            const missing = [...p.objects, ...p.openings].filter((e) => !b.objectOf(e.id)).map((e) => e.item);
            out.push({ id, walls: p.walls.length, rooms: p.rooms.length, openings: p.openings.length, wallMeshes: b.groups.walls.children.length, missing });
          }
          return out;`, 120000);
        assert.ok(list.length >= 10, `templates (${list.length})`);
        for (const t of list) {
          if (t.id === 'empty') { assert.equal(t.walls + t.rooms + t.openings, 0, 'empty is empty'); continue; }
          assert.ok(t.walls >= 4, `${t.id}: walls (${t.walls})`);
          assert.ok(t.rooms >= 1, `${t.id}: rooms (${t.rooms})`);
          assert.ok(t.openings >= 1, `${t.id}: doors/windows (${t.openings})`);
          assert.ok(t.wallMeshes >= 1, `${t.id}: wall meshes built`);
          assert.deepEqual(t.missing, [], `${t.id}: every opening/object has its 3D object`);
        }
      },
    },
  ]),

  ...group('예제', [
    {
      name: '시작 화면의 모든 예제가 열림 (가구까지 만들어짐)',
      async run(app) {
        const list = await app.run(`
          const { SAMPLE_PROJECTS } = await import('/src/engine/samples.js');
          const out = [];
          for (const s of SAMPLE_PROJECTS) {
            await T.reset({ project: false });
            if (A.state.doc) await A.actions.closeProject({ force: true });
            A.actions.showStartPage(true);
            await T.frames(2);
            const button = document.querySelector('#start-page [data-start="sample"][data-value="' + s.id + '"]');
            if (!button) { out.push({ id: s.id, error: 'no start-page card' }); continue; }
            button.click();
            await T.until(() => A.state.doc && !A.state.showStart, 15000, 'sample ' + s.id);
            await T.sleep(300);
            const p = A.state.doc.project;
            A.state.doc.markSaved();
            const missing = p.objects.filter((o) => !A.builder.objectOf(o.id)).map((o) => o.item);
            out.push({ id: s.id, objects: p.objects.length, walls: p.walls.length, rooms: p.rooms.length, missing });
          }
          return out;`, 180000);
        assert.ok(list.length >= 4, 'samples');
        for (const s of list) {
          assert.ok(!s.error, `${s.id}: ${s.error}`);
          assert.ok(s.walls >= 4 && s.rooms >= 1, `${s.id}: walls/rooms`);
          // Empty floor plans (plan-*, plans.js) carry no furniture; their furnished variants do.
          if (!/^plan-/.test(s.id) || /-furnished$/.test(s.id)) assert.ok(s.objects >= 3, `${s.id}: furnished (${s.objects} objects)`);
          assert.deepEqual(s.missing, [], `${s.id}: every object built`);
        }
      },
    },
  ]),

  ...group('그리기', [
    {
      name: '벽 도구: 캔버스 클릭 5번으로 닫힌 벽 4개 (4 m × 3 m)', desktop: true,
      async run(app) {
        const r = await app.run(`
          await T.fresh('empty');
          await T.top([-1, 5]);
          A.actions.setTool('wall');
          for (const [x, z] of [[0, 0], [4, 0], [4, 3], [0, 3], [0, 0]]) await T.clickWorld(x, 0, z);
          await T.frames(2);
          const p = A.state.doc.project;
          return { tool: A.state.tool, walls: p.walls.map((w) => [w.a, w.b].flat().map((v) => Math.round(v * 100) / 100)) };`);
        assert.equal(r.walls.length, 4, `4 walls (${JSON.stringify(r.walls)})`);
        const lengths = r.walls.map(([ax, az, bx, bz]) => Math.hypot(bx - ax, bz - az)).sort();
        assert.deepEqual(lengths.map((l) => Math.round(l * 10) / 10), [3, 3, 4, 4], `wall lengths ${lengths}`);
      },
    },
    {
      name: '방 도구: 벽 안을 클릭하면 방이 생기고 면적이 맞음', desktop: true,
      async run(app) {
        const r = await app.run(`
          // Drawing the closed walls made their room already: start from the bare walls.
          A.actions.change('op.delete', (pr) => { pr.rooms = []; }, ['rooms']);
          A.actions.select([]);
          A.actions.setTool('room');
          await T.clickWorld(2, 0, 1.5);
          await T.frames(2);
          const p = A.state.doc.project;
          const area = (pts) => Math.abs(pts.reduce((s, [x, z], i) => { const [x2, z2] = pts[(i + 1) % pts.length]; return s + x * z2 - x2 * z; }, 0) / 2);
          return { rooms: p.rooms.map((rm) => area(rm.points)), t: A.state.settings.defaultWallThickness, selected: A.state.selection.length };`);
        assert.equal(r.rooms.length, 1, 'one room');
        const inner = (4 - r.t) * (3 - r.t);
        assert.ok(Math.abs(r.rooms[0] - inner) / inner < 0.03, `area ${r.rooms[0].toFixed(3)} m² ≈ inner ${inner.toFixed(3)} m² (walls ${r.t} m)`);
        assert.equal(r.selected, 1, 'the new room is selected');
      },
    },
    {
      name: '라이브러리 배치: startPlacing + 캔버스 클릭 → 물체 1개', desktop: true,
      async run(app) {
        const r = await app.run(`
          const before = A.state.doc.project.objects.length;
          A.actions.startPlacing('armchair');
          if (A.state.tool !== 'place') return { error: 'not placing: ' + A.state.tool };
          await T.clickWorld(2, 0, 1.5);
          await T.sleep(200);
          const p = A.state.doc.project;
          const o = p.objects.at(-1);
          A.actions.setTool('select');
          return { added: p.objects.length - before, item: o?.item, at: o?.position, built: Boolean(o && A.builder.objectOf(o.id)), selected: A.state.selection[0] === o?.id };`);
        assert.ok(!r.error, r.error);
        assert.equal(r.added, 1, 'one object');
        assert.equal(r.item, 'armchair');
        assert.ok(Math.abs(r.at[0] - 2) < 0.6 && Math.abs(r.at[2] - 1.5) < 0.6, `placed where clicked (${r.at})`);
        assert.ok(r.built && r.selected, 'built and selected');
      },
    },
    {
      name: '선택·이동·회전·삭제·실행 취소·다시 실행',
      async run(app) {
        const r = await app.run(`
          const p = A.state.doc.project;
          const o = p.objects.at(-1);
          const id = o.id;
          const s0 = T.screen(o.position[0], 0.4, o.position[2]);
          A.actions.setTool('select');
          await T.click(s0.x, s0.y);
          const picked = A.state.selection.includes(id);
          A.actions.select([id]);
          const x0 = o.position[0];
          A.actions.change('op.move', () => A.actions.moveEntities([id], T.vec(0.5, 0, 0), { live: false }));
          const moved = p.objects.find((x) => x.id === id).position[0] - x0;
          const r0 = p.objects.find((x) => x.id === id).rotation[1];
          await A.run('rotate90');
          const turned = p.objects.find((x) => x.id === id).rotation[1] - r0;
          await A.actions.deleteEntities([id]);
          const deleted = !p.objects.some((x) => x.id === id);
          A.actions.undo();
          const back = A.state.doc.project.objects.some((x) => x.id === id);
          A.actions.redo();
          const gone = !A.state.doc.project.objects.some((x) => x.id === id);
          A.actions.undo();
          return { picked, moved, turned, deleted, back, gone, undoLabel: A.state.doc.history.canUndo };`);
        assert.ok(r.picked, 'a click on the object selects it');
        assert.ok(Math.abs(r.moved - 0.5) < 1e-6, `moved 0.5 m (${r.moved})`);
        assert.ok(Math.abs(Math.abs(r.turned) - Math.PI / 2) < 1e-6, `rotated 90° (${r.turned})`);
        assert.ok(r.deleted, 'deleted');
        assert.ok(r.back, 'undo brings it back');
        assert.ok(r.gone, 'redo deletes it again');
      },
    },
    {
      name: '선택 도구 끌기: 빈 곳 = 궤도 회전, Ctrl+끌기 = 화면 이동, Shift+끌기 = 선택 상자, 선택한 가구 끌기 = 이동, leftDrag=select = 옛 방식', desktop: true,
      async run(app) {
        const r = await app.run(`
          await T.fresh('room');
          const lv = A.state.doc.project.activeLevel;
          A.actions.change('op.place', (p) => { p.objects.push({ id: 'ob-drag', level: lv, item: 'armchair', params: {}, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], materials: {}, tag: 'untagged', name: '' }); }, ['objects']);
          const saved = A.state.settings.leftDrag;
          A.actions.updateSettings({ leftDrag: 'orbit' }, { quiet: true });
          await T.iso([[-1, 0, -1], [5, 2.5, 4.5]]);
          A.actions.setTool('select');
          A.actions.select([]);
          const v = A.viewport;
          const rect = v.canvas.getBoundingClientRect();
          // Empty space: the sky in the top corner of the view.
          const empty = { x: rect.left + 40, y: rect.top + 40 };
          const cam0 = v.camera.position.toArray();
          await T.drag(empty, { x: empty.x + 160, y: empty.y + 30 });
          await T.sleep(250);
          const cam1 = v.camera.position.toArray();
          const orbited = Math.hypot(...cam1.map((c, i) => c - cam0[i]));
          const selAfterOrbit = A.state.selection.length;
          v.stopGlide();
          // Ctrl + drag on empty space moves (pans) the view: the target moves, the view direction stays.
          const t0 = v.target.toArray();
          const f0 = v.target.clone().sub(v.camera.position).normalize().toArray();
          await T.drag(empty, { x: empty.x + 120, y: empty.y + 40 }, { ctrl: true });
          v.stopGlide();
          const panned = Math.hypot(...v.target.toArray().map((c, i) => c - t0[i]));
          const turned = Math.hypot(...v.target.clone().sub(v.camera.position).normalize().toArray().map((c, i) => c - f0[i]));
          const selAfterPan = A.state.selection.length;
          // Shift + drag: a window (left → right) round the armchair selects it, the camera stays.
          await T.iso([[-1, 0, -1], [5, 2.5, 4.5]]);
          const box = A.builder.worldBox('ob-drag');
          const corners = [];
          for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(T.screen(x, y, z));
          const x0 = Math.min(...corners.map((c) => c.x)) - 25, x1 = Math.max(...corners.map((c) => c.x)) + 25;
          const y0 = Math.min(...corners.map((c) => c.y)) - 25, y1 = Math.max(...corners.map((c) => c.y)) + 25;
          const cam2 = v.camera.position.toArray();
          await T.drag({ x: x0, y: y0 }, { x: x1, y: y1 }, { shift: true });
          const ctrlBox = A.state.selection.slice();
          const camStill = Math.hypot(...v.camera.position.toArray().map((c, i) => c - cam2[i]));
          // Dragging the selected armchair moves it (seen from above: no wall in front of it).
          await T.top([-3, 3]);
          A.actions.select(['ob-drag']);
          const p0 = A.state.doc.project.objects.find((o) => o.id === 'ob-drag').position.slice();
          const c0 = T.screen(p0[0], 0.6, p0[2]);
          await T.drag(c0, { x: c0.x + 60, y: c0.y + 10 });
          const p1 = A.state.doc.project.objects.find((o) => o.id === 'ob-drag').position;
          const movedBy = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]);
          // The old SketchUp behaviour: a plain drag draws the box.
          A.actions.updateSettings({ leftDrag: 'select' }, { quiet: true });
          A.actions.select([]);
          await T.iso([[-1, 0, -1], [5, 2.5, 4.5]]);
          const box2 = A.builder.worldBox('ob-drag');
          const cs = [];
          for (const x of [box2.min.x, box2.max.x]) for (const y of [box2.min.y, box2.max.y]) for (const z of [box2.min.z, box2.max.z]) cs.push(T.screen(x, y, z));
          const cam3 = v.camera.position.toArray();
          await T.drag({ x: Math.min(...cs.map((c) => c.x)) - 25, y: Math.min(...cs.map((c) => c.y)) - 25 }, { x: Math.max(...cs.map((c) => c.x)) + 25, y: Math.max(...cs.map((c) => c.y)) + 25 });
          const plainBox = A.state.selection.slice();
          const camStill2 = Math.hypot(...v.camera.position.toArray().map((c, i) => c - cam3[i]));
          A.actions.updateSettings({ leftDrag: saved }, { quiet: true });
          return { orbited, selAfterOrbit, panned, turned, selAfterPan, ctrlBox, camStill, movedBy, plainBox, camStill2 };`);
        assert.ok(r.orbited > 0.3, `a left drag on empty space orbits the camera (moved ${r.orbited.toFixed(2)} m)`);
        assert.equal(r.selAfterOrbit, 0, 'orbiting selects nothing');
        assert.ok(r.panned > 0.2, `Ctrl + drag moves the view (target moved ${r.panned.toFixed(2)} m)`);
        assert.ok(r.turned < 1e-6, `Ctrl + drag does not turn the view (${r.turned})`);
        assert.equal(r.selAfterPan, 0, 'Ctrl + drag on empty space selects nothing');
        assert.ok(r.ctrlBox.includes('ob-drag'), `Shift + drag window selects the armchair (${r.ctrlBox})`);
        assert.ok(r.camStill < 1e-6, 'Shift + drag does not orbit');
        assert.ok(r.movedBy > 0.05, `dragging the selected armchair moves it (${r.movedBy.toFixed(3)} m)`);
        assert.ok(r.plainBox.includes('ob-drag'), `leftDrag = select: a plain drag draws the selection box (${r.plainBox})`);
        assert.ok(r.camStill2 < 1e-6, 'leftDrag = select: no orbit');
      },
    },
    {
      name: '사각형 + 밀기/끌기 (측정 상자 2000,1500 → 800) → 면 6개 상자',
      async run(app) {
        const r = await app.run(`
          await T.fresh('empty');
          await T.iso([[-1, 0, -3], [4, 2, 2]]);
          A.actions.setTool('rectangle');
          await T.clickWorld(0, 0, 0);
          const okRect = A.state.toolObject.vcb('2000,1500');
          await T.frames(2);
          const p = A.state.doc.project;
          const M = await import('/src/tools/modeling.js');
          const model = p.models[0];
          if (!model) return { error: 'no model after the rectangle', okRect };
          const facesBefore = M.meshOf(model).faces.size;
          const bb = M.meshOf(model).boundingBox();
          const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
          A.actions.setTool('pushpull');
          const s = T.screen(cx, 0, cz);
          T.fire('pointermove', s.x, s.y); await T.frames(3);
          T.fire('pointerdown', s.x, s.y); await T.frames(1);
          const active = Boolean(A.state.toolObject.active);
          const okPush = A.state.toolObject.vcb('800');
          await T.frames(2);
          const mesh = M.meshOf(A.state.doc.project.models[0]);
          const b2 = mesh.boundingBox();
          return { okRect, facesBefore, size: [bb.max.x - bb.min.x, bb.max.z - bb.min.z], active, okPush, faces: mesh.faces.size, solid: mesh.isSolid(), height: b2.max.y - b2.min.y };`);
        assert.ok(!r.error, r.error);
        assert.ok(r.okRect, 'rectangle accepted "2000,1500"');
        assert.equal(r.facesBefore, 1, 'the rectangle is one face');
        assert.deepEqual(r.size.map((v) => Math.round(v * 1000) / 1000).sort(), [1.5, 2], `2 m × 1.5 m (${r.size})`);
        assert.ok(r.active, 'push/pull picked the face');
        assert.ok(r.okPush, 'push/pull accepted "800"');
        assert.equal(r.faces, 6, 'a box has 6 faces');
        assert.ok(r.solid, 'a closed solid');
        assert.ok(Math.abs(r.height - 0.8) < 1e-6, `0.8 m high (${r.height})`);
      },
    },
    {
      name: '문 도구: 벽을 클릭하면 문이 벽에 들어감', desktop: true,
      async run(app) {
        const r = await app.run(`
          await T.fresh('empty');
          A.actions.change('op.wall', (p) => { p.walls.push({ id: 'w-door', level: p.activeLevel, a: [0, 0], b: [4, 0], thickness: 0.2, height: null, material: {} }); }, ['walls']);
          await T.top([-1, 5]);
          await A.run('door');
          if (A.state.tool !== 'place') return { error: 'door tool did not start placing (' + A.state.tool + ')' };
          await T.clickWorld(2, 2.4, 0);
          await T.frames(2);
          const p = A.state.doc.project;
          const o = p.openings[0];
          A.actions.setTool('select');
          return { openings: p.openings.length, wall: o?.wall, offset: o?.offset, item: o?.item, built: Boolean(o && A.builder.objectOf(o.id)) };`);
        assert.ok(!r.error, r.error);
        assert.equal(r.openings, 1, 'one door');
        assert.equal(r.wall, 'w-door', 'in the wall');
        assert.ok(Math.abs(r.offset - 2) < 0.3, `where clicked (offset ${r.offset})`);
        assert.match(r.item, /door/);
        assert.ok(r.built, 'built in 3D');
      },
    },
    {
      name: '페인트 통: 벽의 한쪽 면에 재질 칠하기',
      async run(app) {
        const r = await app.run(`
          const p = A.state.doc.project;
          const w = p.walls[0];
          await T.iso([[-1, 0, -3], [5, 2.5, 3]]);
          A.state.brush = 'wall-paint-sage';
          A.actions.setTool('paint');
          // The side that faces the camera: +z (the iso camera is at +x +y +z).
          await T.clickWorld(0.8, 1.6, 0.101);
          await T.frames(2);
          const m = A.state.doc.project.walls.find((x) => x.id === w.id).material ?? {};
          A.actions.setTool('select');
          return { material: m };`);
        const sides = Object.entries(r.material).filter(([, v]) => v === 'wall-paint-sage').map(([k]) => k);
        assert.equal(sides.length, 1, `exactly one side painted (${JSON.stringify(r.material)})`);
        assert.ok(['left', 'right'].includes(sides[0]), `a wall side (${sides[0]})`);
      },
    },
  ]),

  ...group('보기', [
    {
      name: '평면도(2D) 켜기·끄기', desktop: true,
      async run(app) {
        const r = await app.run(`
          await T.fresh('apt59');
          await A.run('planView'); await T.frames(2);
          const on = { plan: A.state.planView, ortho: A.viewport.isOrtho, cuts: A.builder.groups.cuts.visible, segment: document.querySelector('[data-plan="2d"]')?.classList.contains('active') };
          await A.run('planView'); await T.frames(2);
          return { on, off: { plan: A.state.planView, cuts: A.builder.groups.cuts.visible } };`);
        assert.deepEqual({ ...r.on, segment: undefined }, { plan: true, ortho: true, cuts: true, segment: undefined }, 'plan view on');
        assert.equal(r.on.segment, true, 'the 3D | 2D switch above the view shows 2D after F4 / the menu command');
        assert.deepEqual(r.off, { plan: false, cuts: false }, 'plan view off');
      },
    },
    {
      name: '스타일 순환 (K): 모든 면 스타일을 거쳐 처음으로', desktop: true,
      async run(app) {
        const r = await app.run(`
          const { STYLE_MODES } = await import('/src/engine/viewport.js');
          const seen = [A.state.doc.project.style.mode];
          for (let i = 0; i < STYLE_MODES.length; i++) { await A.run('styleCycle'); await T.frames(2); seen.push(A.state.doc.project.style.mode + '/' + A.viewport.styleMode); }
          return { modes: STYLE_MODES, seen };`);
        const modes = r.seen.slice(1).map((s) => s.split('/'));
        for (const [doc, view] of modes) assert.equal(doc, view, 'the view shows the project style');
        assert.deepEqual([...new Set(modes.map(([m]) => m))].sort(), [...r.modes].sort(), 'every style visited');
        assert.equal(modes.at(-1)[0], r.seen[0], 'back to the first');
      },
    },
    {
      name: '장면 추가·전환 (탭)',
      async run(app) {
        const r = await app.run(`
          await A.run('view:top'); await T.sleep(400);
          await A.run('addScene');
          await A.run('view:iso'); await T.sleep(400);
          await A.run('addScene');
          const p = A.state.doc.project;
          const [a, b] = p.scenes.slice(-2);
          document.querySelector('[data-scene-tab="' + a.id + '"]').click();
          await T.sleep(500);
          const cam = A.viewport.cameraState();
          return { count: p.scenes.length, tabs: document.querySelectorAll('[data-scene-tab]').length, active: p.activeScene === a.id, a: a.camera.position, cam: cam.position };`);
        assert.ok(r.count >= 2 && r.tabs === r.count, `scenes ${r.count}, tabs ${r.tabs}`);
        assert.ok(r.active, 'the clicked scene is active');
        assert.ok(r.a.every((v, i) => Math.abs(v - r.cam[i]) < 0.05), `camera at the scene (${r.cam} ≈ ${r.a})`);
      },
    },
    {
      name: '층 추가 → 새 층이 활성, 층 칩에 표시',
      async run(app) {
        const r = await app.run(`
          const p = A.state.doc.project;
          const before = p.levels.length;
          await A.run('addLevel');
          await T.frames(2);
          const top = p.levels.at(-1);
          return { before, after: p.levels.length, active: p.activeLevel === top.id, elevation: top.elevation, chip: document.querySelector('[data-level-menu]')?.textContent.trim() ?? '', name: top.name };`);
        assert.equal(r.after, r.before + 1);
        assert.ok(r.active, 'the new level is active');
        assert.ok(r.elevation > 2, `above the first (${r.elevation})`);
        assert.ok(r.chip.includes(r.name), `level chip shows ${r.name} (${r.chip})`);
      },
    },
  ]),

  ...group('메뉴', [
    {
      name: '메뉴 막대의 모든 메뉴와 하위 메뉴가 열림 (항목 수 일치)',
      async run(app) {
        const r = await app.run(`
          await T.fresh('living');
          // An object selected: the Transform / Visibility groups need a selection.
          const lv = A.state.doc.project.activeLevel;
          A.actions.change('op.place', (p) => { p.objects.push({ id: 'ob-menu', level: lv, item: 'armchair', params: {}, position: [1, 0, 1], rotation: [0, 0, 0], scale: [1, 1, 1], materials: {}, tag: 'untagged', name: '' }); }, ['objects']);
          A.actions.select(['ob-menu']);
          const out = [];
          for (const name of Object.keys(A.menus.MENUS)) {
            A.api.openMenubarMenu(name);
            await T.popupReady('menu');
            const doc = T.frameOf('menu').contentDocument;
            const expected = A.menus.MENUS[name].filter((x) => x !== '-').length;
            const items = doc.querySelectorAll('.popup-menu[data-level="0"] .menu-item').length;
            const subs = [];
            for (const entry of A.menus.MENUS[name].filter((x) => typeof x === 'object')) {
              const row = doc.querySelector('.menu-item[data-id="submenu:' + entry.sub + '"]');
              if (!row) { subs.push({ sub: entry.sub, error: 'row missing' }); continue; }
              const want = A.menus.SUBMENUS[entry.sub].items.filter((x) => x !== '-').length;
              if (row.disabled) { subs.push({ sub: entry.sub, disabled: true, want }); continue; }
              row.click();
              await T.until(() => doc.querySelector('.popup-menu[data-level="1"]'), 3000, 'submenu ' + entry.sub).catch(() => null);
              const got = doc.querySelectorAll('.popup-menu[data-level="1"] .menu-item').length;
              subs.push({ sub: entry.sub, want, got });
            }
            out.push({ name, expected, items, subs });
            await A.popups.hideMenu();
            await T.frames(2);
          }
          return out;`, 90000);
        assert.equal(r.length, 7, 'seven menus');
        for (const m of r) {
          assert.equal(m.items, m.expected, `${m.name}: ${m.items} of ${m.expected} items`);
          for (const s of m.subs) {
            assert.ok(!s.error, `${m.name} › ${s.sub}: ${s.error}`);
            assert.ok(!s.disabled, `${m.name} › ${s.sub} is disabled with a project open`);
            assert.equal(s.got, s.want, `${m.name} › ${s.sub}: ${s.got} of ${s.want} items`);
          }
        }
      },
    },
    {
      name: '메뉴 항목 클릭이 명령을 실행 (보기 › 평면도)',
      async run(app) {
        const r = await app.run(`
          await T.reset();
          A.api.openMenubarMenu('view');
          await T.popupReady('menu');
          const doc = T.frameOf('menu').contentDocument;
          doc.querySelector('.menu-item[data-id="planView"]').click();
          await T.until(() => A.state.planView, 5000, 'plan view');
          await A.run('planView');
          return true;`);
        assert.ok(r);
      },
    },
  ]),

  ...group('팝업', [
    {
      name: '모든 팝업 종류가 그려짐 (웹: 페이지 안 프레임)',
      async run(app) {
        const r = await app.run(`
          await T.reset();
          const { POPUPS } = await import('/src/platform/popups.js');
          const params = {
            settings: { tab: 'general' }, about: {}, confirm: { icon: 'save', title: 'T', message: 'M', buttons: [{ id: 'cancel', label: 'Cancel' }, { id: 'ok', label: 'OK', primary: true }] },
            error: { title: 'T', message: 'test error (expected)', detail: 'stack', context: 'e2e', time: '', app: 'MySketchBook' }, progress: { title: 'T', name: 'x', op: 'op-test' },
            recent: {}, menu: { items: [{ id: 'about', label: 'About', icon: 'info' }], name: 'context', header: { icon: 'cube', title: 'T' } }, theme: { current: A.state.settings.theme },
            welcome: {}, color: { color: '#336699' }, prompt: { title: 'T', label: 'L', value: 'v' }, importmodel: { names: ['chair.glb'], units: 'auto', upAxis: 'auto', optimize: true },
            snapshot: { width: 1920, height: 1080, format: 'png', transparent: false }, render: { width: 1280, height: 720, samples: 64 },
            renderresult: { image: A.viewport.capture(64, 40).toDataURL('image/jpeg'), width: 64, height: 40 }, material: { name: 'm', color: '#a0a0a0', roughness: 0.7, metalness: 0 },
          };
          const out = [];
          for (const kind of Object.keys(POPUPS)) {
            A.popups.open(kind, params[kind] ?? {});
            let ok = true; let note = '';
            try { await T.popupReady(kind, 15000); } catch (e) { ok = false; note = e.message; }
            const doc = T.frameOf(kind)?.contentDocument;
            const text = doc?.querySelector('.popup, .popup-menu, .color-picker, [role="dialog"]')?.textContent.trim().length ?? 0;
            const errorShown = kind !== 'error' && Boolean(document.querySelector('.web-popup-error'));
            out.push({ kind, ok, note, text, errorShown });
            if (kind === 'menu') await A.popups.hideMenu(); else await A.popups.close(kind);
            await T.frames(2);
          }
          // Every settings tab.
          const tabs = [];
          for (const tab of ['general', 'start', 'appearance', 'font', 'background', 'view3d', 'recent', 'shortcuts']) {
            A.popups.open('settings', { tab });
            await T.popupReady('settings');
            await T.sleep(150);
            const d = T.frameOf('settings').contentDocument;
            tabs.push({ tab, page: Boolean(d.querySelector('.settings-page.settings-' + tab)), text: d.querySelector('.settings-page')?.textContent.trim().length ?? 0 });
            await A.popups.close('settings');
          }
          return { out, tabs };`, 120000);
        assert.ok(r.out.length >= 16, `popup kinds (${r.out.length})`);
        for (const p of r.out) {
          assert.ok(p.ok, `${p.kind}: ${p.note}`);
          assert.ok(p.text > 0, `${p.kind}: has content`);
          assert.ok(!p.errorShown, `${p.kind}: opening it raised the error popup`);
        }
        for (const t of r.tabs) assert.ok(t.page && t.text > 20, `settings › ${t.tab}`);
      },
    },
  ]),

  ...group('패널', [
    {
      name: '하단 패널 탭(문제·메시지·정보) + 문제 감지 (겹친 안락의자 → objectsOverlap)',
      async run(app) {
        const r = await app.run(`
          await T.fresh('room');
          const lv = A.state.doc.project.activeLevel;
          A.actions.change('op.place', (p) => {
            for (const id of ['ob-a', 'ob-b']) p.objects.push({ id, level: lv, item: 'armchair', params: {}, position: [2.2, 0, 1.8], rotation: [0, 0, 0], scale: [1, 1, 1], materials: {}, tag: 'untagged', name: '' });
          }, ['objects']);
          await A.run('showProblems');
          await A.run('checkNow');
          await T.frames(2);
          const problems = A.state.problems.map((p) => p.code + ':' + p.entity);
          const rows = document.querySelectorAll('#bottom-panel [data-problem]').length;
          const tabs = {};
          for (const tab of ['problems', 'messages', 'info']) {
            document.querySelector('[data-bottom-tab="' + tab + '"]').click();
            await T.frames(1);
            tabs[tab] = { active: document.querySelector('[data-bottom-tab="' + tab + '"]').classList.contains('active'), rows: document.querySelectorAll('#bottom-panel .bottom-row').length };
          }
          document.querySelector('[data-bottom-tab="problems"]').click();
          await T.frames(1);
          document.querySelector('#bottom-panel [data-problem^="objectsOverlap"]')?.click();
          await T.frames(1);
          const revealed = A.state.selection.slice();
          return { problems, rows, tabs, revealed, status: document.querySelector('#statusbar [data-command="showProblems"]')?.textContent.trim() };`);
        assert.ok(r.problems.some((p) => p.startsWith('objectsOverlap:ob-')), `objectsOverlap found (${r.problems})`);
        assert.ok(r.rows >= 1, 'listed in the problems tab');
        for (const [tab, s] of Object.entries(r.tabs)) { assert.ok(s.active, `${tab} tab active`); assert.ok(s.rows >= 1, `${tab} tab has rows`); }
        assert.equal(r.revealed.length, 1, 'clicking the problem selects its object');
        assert.ok(r.status, 'status bar problem count');
      },
    },
    {
      name: '라이브러리: 검색(소파/sofa)과 분류',
      async run(app) {
        const r = await app.run(`
          await T.reset();
          A.actions.showLibrary('all');
          await T.frames(2);
          const all = document.querySelectorAll('#left-panel .lib-card[data-item]').length;
          const input = document.querySelector('#library-search');
          input.value = 'sofa'; input.dispatchEvent(new Event('input', { bubbles: true }));
          await T.until(() => A.state.libraryQuery === 'sofa', 3000, 'query');
          await T.frames(2);
          const found = [...document.querySelectorAll('#left-panel .lib-card[data-item]')].map((el) => el.dataset.item);
          const ko = A.domain.searchItems({ query: '소파' }).map((x) => x.id);
          const s2 = document.querySelector('#library-search'); s2.value = ''; s2.dispatchEvent(new Event('input', { bubbles: true }));
          await T.until(() => A.state.libraryQuery === '', 3000, 'query cleared');
          const cats = {};
          for (const el of [...document.querySelectorAll('#left-panel [data-lib-category]')]) {
            const id = el.dataset.libCategory;
            document.querySelector('#left-panel [data-lib-category="' + id + '"]').click();
            await T.frames(1);
            const items = [...document.querySelectorAll('#left-panel .lib-card[data-item]')].map((c) => A.domain.catalogItem(c.dataset.item)?.category);
            cats[id] = { count: items.length, wrong: id === 'all' || id === 'mine' ? 0 : items.filter((c) => c !== id).length };
          }
          document.querySelector('#left-panel [data-lib-category="all"]')?.click();
          return { all, found, ko, cats };`, 60000);
        assert.ok(r.all >= 50, `library items (${r.all})`);
        assert.ok(r.found.length >= 3, `"sofa" finds sofas (${r.found})`);
        assert.ok(r.found.includes('sofa-modern'), 'sofa-modern found');
        assert.ok(r.ko.includes('sofa-modern'), 'Korean search 소파 finds it too');
        const ids = Object.keys(r.cats);
        assert.ok(ids.length >= 8, `categories (${ids})`);
        for (const [id, c] of Object.entries(r.cats)) {
          if (id !== 'mine') assert.ok(c.count > 0, `category ${id} has items`);
          assert.equal(c.wrong, 0, `category ${id} shows only its items`);
        }
      },
    },
    {
      name: '재질 탭: 목록·분류, 재질을 고르면 페인트 통이 그 재질로',
      async run(app) {
        const r = await app.run(`
          document.querySelector('[data-left-tab="materials"]').click();
          await T.frames(2);
          const mats = [...document.querySelectorAll('#left-panel [data-material]')].map((el) => el.dataset.material);
          const cats = document.querySelectorAll('#left-panel [data-mat-category]').length;
          const pick = mats.find((m) => m !== A.state.brush);
          document.querySelector('#left-panel [data-material="' + pick + '"]').click();
          await T.frames(1);
          const res = { count: mats.length, cats, pick, brush: A.state.brush, tool: A.state.tool, presets: A.domain.MATERIAL_PRESETS.length };
          A.actions.setTool('select');
          document.querySelector('[data-left-tab="library"]').click();
          return res;`);
        assert.ok(r.count >= 20, `materials (${r.count} of ${r.presets} presets)`);
        assert.ok(r.cats >= 5, `material categories (${r.cats})`);
        assert.equal(r.brush, r.pick, 'the brush is the picked material');
        assert.equal(r.tool, 'paint', 'the paint bucket is active');
      },
    },
  ]),

  ...group('파일', [
    {
      name: '저장 → .msk 바이트 → 다시 열기 (fileformat.js 왕복, 웹 저장 경로)',
      async run(app) {
        const r = await app.run(`
          const sample = document.querySelector('#start-page [data-start="sample"]');
          await T.fresh('apt59');
          const lv = A.state.doc.project.activeLevel;
          A.actions.change('op.place', (p) => { p.objects.push({ id: 'ob-save', level: lv, item: 'sofa-modern', params: { seats: 2 }, position: [6, 0, 5], rotation: [0, 1, 0], scale: [1, 1, 1], materials: {}, tag: 'untagged', name: 'Mine' }); }, ['objects']);
          // The web save goes through showSaveFilePicker: a handle that keeps the bytes in memory.
          let saved = null;
          const original = window.showSaveFilePicker;
          window.showSaveFilePicker = async (o) => ({ name: o.suggestedName, createWritable: async () => { const parts = []; return { write: async (b) => parts.push(b), close: async () => { saved = new Uint8Array(await new Blob(parts).arrayBuffer()); } }; } });
          let ok;
          try { ok = await A.actions.saveDoc({ saveAs: true }); } finally { window.showSaveFilePicker = original; }
          if (!saved) return { error: 'nothing written', ok };
          const F = await import('/src/engine/fileformat.js');
          const { project } = F.unpackProject(saved);
          const before = A.state.doc.project;
          const d = await A.actions.openContent('copy.msk', saved);
          const opened = d?.project;
          return { ok, dirty: false, magic: String.fromCharCode(saved[0], saved[1]), size: saved.length,
            saved: { walls: project.walls, rooms: project.rooms, openings: project.openings, objects: project.objects }, before: JSON.parse(JSON.stringify({ walls: before.walls, rooms: before.rooms, openings: before.openings, objects: before.objects })),
            sofa: project.objects.find((o) => o.id === 'ob-save'), openedObjects: opened?.objects.length, beforeObjects: before.objects.length, thumbnail: Boolean(F.unpackProject(saved).thumbnail) };`, 60000);
        assert.ok(!r.error, r.error);
        assert.equal(r.ok, true, 'saveDoc reports success');
        assert.equal(r.magic, 'PK', 'a ZIP');
        for (const k of ['walls', 'rooms', 'openings', 'objects']) assert.deepEqual(r.saved[k], r.before[k], `${k} unchanged after the round trip`);
        assert.deepEqual(r.sofa.params, { seats: 2 });
        assert.equal(r.sofa.name, 'Mine');
        assert.equal(r.openedObjects, r.beforeObjects, 'the reopened project has the same objects');
        assert.ok(r.thumbnail, 'the file has a thumbnail');
      },
    },
    {
      name: 'GLB 내보내기 (io/export.js + 파일 › 내보내기 › GLB 웹 경로)',
      async run(app) {
        const r = await app.run(`
          await T.fresh('living');
          await T.sleep(300);
          const io = await import('/src/io/export.js');
          const direct = await io.exportModel(A.builder.root, 'glb');
          const head = (b) => String.fromCharCode(...b.slice(0, 4));
          const dv = new DataView(direct.bytes.buffer, direct.bytes.byteOffset, direct.bytes.byteLength);
          let saved = null;
          const original = window.showSaveFilePicker;
          window.showSaveFilePicker = async (o) => ({ name: o.suggestedName, createWritable: async () => { const parts = []; return { write: async (b) => parts.push(b), close: async () => { saved = new Uint8Array(await new Blob(parts).arrayBuffer()); } }; } });
          try { await A.run('exportGlb'); } finally { window.showSaveFilePicker = original; }
          const { GLTFLoader } = await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js');
          let meshes = 0;
          if (saved) { const gltf = await new GLTFLoader().parseAsync(saved.buffer.slice(saved.byteOffset, saved.byteOffset + saved.byteLength), ''); gltf.scene.traverse((o) => { if (o.isMesh) meshes += 1; }); }
          return { magic: head(direct.bytes), version: dv.getUint32(4, true), length: dv.getUint32(8, true) === direct.bytes.length, size: direct.bytes.length, saved: saved ? head(saved) : null, meshes };`, 90000);
        assert.equal(r.magic, 'glTF');
        assert.equal(r.version, 2);
        assert.ok(r.length, 'header length = byte length');
        assert.ok(r.size > 10000, `bytes ${r.size}`);
        assert.equal(r.saved, 'glTF', 'the menu command wrote a GLB');
        assert.ok(r.meshes >= 10, `the GLB loads back with meshes (${r.meshes})`);
      },
    },
  ]),

  ...group('렌더링', [
    {
      name: '사진 렌더링 (경로 추적, GPU): 예제 4개 320×200',
      async run(app) {
        const r = await app.run(`
          const { SAMPLE_PROJECTS } = await import('/src/engine/samples.js');
          const photo = await import('/src/engine/photo.js');
          const out = [];
          for (const s of SAMPLE_PROJECTS.slice(0, 4)) {
            await T.reset({ project: false });
            if (A.state.doc) await A.actions.closeProject({ force: true });
            A.actions.showStartPage(true); await T.frames(2);
            document.querySelector('#start-page [data-start="sample"][data-value="' + s.id + '"]').click();
            await T.until(() => A.state.doc && !A.state.showStart, 15000, 'sample');
            A.state.doc.markSaved();
            await T.sleep(500);
            const t0 = performance.now();
            const canvas = await photo.renderPathTraced(A.viewport, { width: 320, height: 200, samples: 4 });
            const ms = performance.now() - t0;
            const c2 = document.createElement('canvas'); c2.width = 32; c2.height = 20;
            const g = c2.getContext('2d'); g.drawImage(canvas, 0, 0, 32, 20);
            const px = g.getImageData(0, 0, 32, 20).data;
            let sum = 0, sq = 0, n = 0;
            for (let i = 0; i < px.length; i += 4) { const l = (px[i] + px[i + 1] + px[i + 2]) / 3; sum += l; sq += l * l; n += 1; }
            const mean = sum / n;
            out.push({ id: s.id, w: canvas.width, h: canvas.height, ms: Math.round(ms), mean: Math.round(mean), sd: Math.round(Math.sqrt(Math.max(0, sq / n - mean * mean))) });
          }
          return out;`, 300000);
        assert.equal(r.length, 4);
        for (const s of r) {
          assert.equal(`${s.w}×${s.h}`, '320×200', `${s.id}: size`);
          assert.ok(s.mean > 10 && s.mean < 250, `${s.id}: not blank (mean ${s.mean})`);
          assert.ok(s.sd > 3, `${s.id}: has a picture (sd ${s.sd})`);
        }
        app.note?.(`렌더 시간: ${r.map((s) => `${s.id} ${s.ms} ms`).join(', ')}`);
      },
    },
    {
      name: '성능: 가구 배치된 59㎡ 예제를 60프레임 궤도 회전 (중앙값 < 50 ms)',
      async run(app) {
        const r = await app.run(`
          await T.reset({ project: false });
          if (A.state.doc) await A.actions.closeProject({ force: true });
          A.actions.showStartPage(true); await T.frames(2);
          document.querySelector('#start-page [data-start="sample"][data-value="apt59-furnished"]').click();
          await T.until(() => A.state.doc && !A.state.showStart, 15000, 'sample');
          A.state.doc.markSaved();
          await T.sleep(1500);
          const v = A.viewport;
          v.setView('iso', { animate: false });
          await T.frames(10);
          const times = []; const calls = []; const tris = [];
          let last = performance.now();
          for (let i = 0; i < 60; i++) {
            v.orbit(6, 0, v.target.clone());
            v.touchInteraction();
            await new Promise((res) => requestAnimationFrame(res));
            const now = performance.now();
            times.push(now - last); last = now;
            calls.push(v.stats.calls); tris.push(v.stats.triangles);
          }
          await T.sleep(400);
          const sorted = [...times].sort((a, b) => a - b);
          const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
          return { median: sorted[30], p90: sorted[54], max: sorted[59], calls: med(calls), triangles: med(tris), objects: A.state.doc.project.objects.length, renderer: (() => { const gl = v.renderer.getContext(); const ext = gl.getExtension('WEBGL_debug_renderer_info'); return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); })() };`, 120000);
        app.note?.(`궤도 회전 60프레임: 중앙값 ${r.median.toFixed(1)} ms · p90 ${r.p90.toFixed(1)} ms · 최대 ${r.max.toFixed(1)} ms · 드로콜 ${r.calls} · 삼각형 ${r.triangles.toLocaleString()} · 물체 ${r.objects} · ${r.renderer}`);
        assert.ok(!/SwiftShader/i.test(r.renderer), `a real GPU (${r.renderer})`);
        assert.ok(r.calls > 0, 'draw calls counted');
        assert.ok(r.median < 50, `median frame ${r.median.toFixed(1)} ms < 50 ms (p90 ${r.p90.toFixed(1)}, draw calls ${r.calls})`);
      },
    },
  ]),

  ...group('반응 속도 · 이동 · 내 라이브러리', [
    {
      name: '벽걸이 소품: 마우스로 끌어 벽면을 따라 위아래로 이동 (바닥면에 갇히지 않음)',
      async run(app) {
        const r = await app.run(`
          await T.fresh('empty');
          A.actions.change('op.place', (p) => { p.objects.push({ id: 'e2e-clock', level: p.activeLevel, item: 'ofp-office-wall-clock', params: {}, position: [0, 1.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1], materials: {}, tag: 'untagged', name: '' }); });
          await T.frames(3);
          A.viewport.setView('front', { animate: false, box: A.builder.worldBox('e2e-clock').clone().expandByScalar(1.5) });
          await T.frames(3);
          A.actions.setTool('select');
          A.actions.select(['e2e-clock']);
          const b = A.builder.worldBox('e2e-clock'); const c = b.getCenter(b.min.clone());
          const from = T.screen(c.x, c.y, c.z); const to = T.screen(c.x, c.y + 0.5, c.z);
          const before = [...A.api.project().objects.find((o) => o.id === 'e2e-clock').position];
          await T.drag(from, to);
          const after = A.api.project().objects.find((o) => o.id === 'e2e-clock').position;
          return { dy: after[1] - before[1], dz: after[2] - before[2] };`);
        assert.ok(r.dy > 0.35, `moved up ${r.dy.toFixed(2)} m (want about 0.5)`);
        assert.ok(Math.abs(r.dz) < 1e-6, `stays on its wall (dz ${r.dz})`);
      },
    },
    {
      name: '바닥 소품: 위쪽을 잡아 끌어도 바닥을 따라 이동, ↑ 키로 위아래 이동 전환',
      async run(app) {
        const r = await app.run(`
          await T.fresh('empty');
          A.actions.change('op.place', (p) => { p.objects.push({ id: 'e2e-desk', level: p.activeLevel, item: 'desk', params: {}, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], materials: {}, tag: 'untagged', name: '' }); });
          await T.frames(3);
          A.viewport.setView('iso', { animate: false, box: A.builder.worldBox('e2e-desk').clone().expandByScalar(2) });
          await T.frames(3);
          A.actions.setTool('select');
          A.actions.select(['e2e-desk']);
          const pos = () => [...A.api.project().objects.find((o) => o.id === 'e2e-desk').position];
          const b = A.builder.worldBox('e2e-desk'); const top = b.getCenter(b.min.clone()); top.y = b.max.y - 0.01;
          // grabbed on the top, dragged by the screen distance of 1 m along x on the floor
          const s0 = T.screen(0, 0, 0), s1 = T.screen(1, 0, 0), a = T.screen(top.x, top.y, top.z);
          const p0 = pos();
          await T.drag(a, { x: a.x + (s1.x - s0.x), y: a.y + (s1.y - s0.y) });
          const p1 = pos();
          // vertical: press, move a little, ↑, then move up on the screen
          // the desk top again (the middle of its box is the empty knee space under the top: nothing to grab there)
          const b2 = A.builder.worldBox('e2e-desk'); const c2 = b2.getCenter(b2.min.clone()); c2.y = b2.max.y - 0.01;
          const g = T.screen(c2.x, c2.y, c2.z);
          T.fire('pointermove', g.x, g.y); await T.frames(2);
          T.fire('pointerdown', g.x, g.y); await T.frames(1);
          T.fire('pointermove', g.x + 6, g.y, { pressed: true }); await T.frames(2);
          document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp', bubbles: true, cancelable: true }));
          await T.frames(1);
          for (let i = 1; i <= 6; i++) { T.fire('pointermove', g.x + 6, g.y - i * 15, { pressed: true }); await T.frames(2); }
          T.fire('pointerup', g.x + 6, g.y - 90); await T.frames(2);
          const p2 = pos();
          return { dx: p1[0] - p0[0], dy1: p1[1] - p0[1], dz: p1[2] - p0[2], up: p2[1] - p1[1] };`);
        assert.ok(Math.abs(r.dx - 1) < 0.2, `moved ${r.dx.toFixed(2)} m along x (want 1)`);
        assert.ok(Math.abs(r.dy1) < 1e-6 && Math.abs(r.dz) < 0.2, `on the floor (dy ${r.dy1}, dz ${r.dz.toFixed(2)})`);
        assert.ok(r.up > 0.2, `↑ lifts it: ${r.up.toFixed(2)} m`);
      },
    },
    {
      name: '라이브러리 전체: 빠르게 그림 (처음 일부, 나머지는 쉬는 동안), 카드 그리기에 모델을 만들지 않음',
      async run(app) {
        const r = await app.run(`
          await T.fresh('room');
          A.actions.showLibrary('living');
          await T.frames(2);
          const t0 = performance.now();
          A.actions.showLibrary('all');
          const ms = performance.now() - t0;
          const first = document.querySelectorAll('#left-panel .lib-card').length;
          await T.until(() => document.querySelectorAll('#left-panel .lib-card').length >= A.domain.searchItems({}).length, 8000);
          const all = document.querySelectorAll('#left-panel .lib-card').length;
          const measured = A.domain.searchItems({}).filter((i) => 'knownSize' in i && i.knownSize != null).length;
          const total = A.domain.searchItems({}).length;
          return { ms, first, all, total, measured };`, 30000);
        assert.ok(r.ms < 150, `switch to All ${r.ms.toFixed(0)} ms`);
        assert.ok(r.first <= 200, `first cards ${r.first}`);
        assert.equal(r.all, r.total, 'all cards appended later');
        assert.ok(r.measured < r.total * 0.3, `${r.measured} of ${r.total} models built just for the panel`);
      },
    },
    {
      name: '분류 칩: 마지막 줄에 빈칸 없음 (마지막 칩이 남은 칸을 채움)',
      async run(app) {
        const r = await app.run(`
          await T.fresh('room');
          A.actions.showLibrary('all');
          await T.frames(3);
          const grid = document.querySelector('#left-panel .lib-chips');
          const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
          const last = grid.lastElementChild;
          const span = Number((last.style.gridColumn.match(/span (\\d+)/) ?? [0, 1])[1]);
          const lr = last.getBoundingClientRect(), gr = grid.getBoundingClientRect();
          return { n: grid.children.length, cols, span, rightGap: gr.right - lr.right };`);
        assert.equal((r.n - 1 + r.span) % r.cols, 0, `${r.n} chips in ${r.cols} columns, last spans ${r.span}`);
        assert.ok(r.rightGap < 4, `the last chip reaches the right edge (gap ${r.rightGap.toFixed(1)} px)`);
      },
    },
    {
      name: '진행 창 (웹): 미리 만들어 둔 창이 바로 열리고, 계산이 페이지를 붙잡아도 지연 후 보임, 작업에 맞는 아이콘',
      async run(app) {
        const r = await app.run(`
          await T.reset({ project: false });
          // T.reset took the page's popup frames out: make the progress frame ahead of time again, as the app does at start
          A.popups.prewarm('progress', { warm: true });
          await T.until(() => A.popups.parked.get('progress')?.querySelector('iframe')?.contentDocument?.readyState === 'complete' && A.popups.parked.get('progress').isConnected, 8000);
          await T.sleep(300);
          const prewarmed = Boolean(A.popups.parked.get('progress')?.isConnected);
          let during = null;
          await A.actions.withProgress('progress.image', '1920 × 1080', async () => {
            const f = document.querySelector('.web-popup-progress');
            const t = performance.now(); while (performance.now() - t < 400) { /* a long computation */ }
            during = { open: Boolean(f) && f.style.visibility !== 'hidden', delayed: f?.classList.contains('web-popup-delayed'), title: f?.querySelector('iframe')?.contentDocument?.body?.innerText?.split('\\n')[0] ?? '' };
          }, { delay: 250 });
          await T.sleep(1000);
          return { prewarmed, during, parkedAfter: A.popups.parked.has('progress') && A.popups.parked.get('progress').style.visibility === 'hidden' };`, 20000);
        assert.ok(r.prewarmed, 'the progress frame is made ahead of time');
        assert.ok(r.during.open && r.during.delayed, `open while the job runs, fading in after the delay: ${JSON.stringify(r.during)}`);
        assert.match(r.during.title, /그림|image/i);
        assert.ok(r.parkedAfter, 'hidden and kept for the next job');
      },
    },
    {
      name: '내 라이브러리: 새 분류 · 모델 추가 · 놓으면 프로젝트에 복사 · 삭제',
      async run(app) {
        const r = await app.run(`
          await T.fresh('room');
          const ul = A.userLibrary();
          const cat = await ul.createCategory('E2E 분류', 'libDecor');
          const obj = A.builder.objectOf(A.api.project().objects[0]?.id) ?? A.viewport.scene.children.find((c) => c.isMesh);
          const ex = await import('/src/io/export.js');
          const glb = await ex.exportModel((obj ?? A.builder.groups.walls).clone(true), 'glb');
          await ul.addFromFiles([{ name: 'e2e-a.glb', bytes: glb.bytes }, { name: 'e2e-b.glb', bytes: glb.bytes }], cat.id);
          const items = A.domain.searchItems({ category: cat.id });
          const chip = Boolean(document.querySelector('[data-lib-category="' + cat.id + '"]'));
          A.actions.startPlacing(items[0].id);
          await ul.settled();
          const asset = Object.values(A.api.project().assets).find((a) => a.lib);
          A.actions.setTool('select');
          for (const it of items) await ul.deleteItem(it.id);
          await ul.deleteCategory(cat.id);
          const gone = !document.querySelector('[data-lib-category="' + cat.id + '"]') && !A.domain.searchItems({ category: cat.id }).length;
          return { n: items.length, names: items.map((i) => i.ko), chip, asset: Boolean(asset), gone };`, 60000);
        assert.equal(r.n, 2, 'two items in the new category');
        assert.deepEqual(r.names.sort(), ['e2e-a', 'e2e-b']);
        assert.ok(r.chip, 'the category has its chip');
        assert.ok(r.asset, 'placing copies the model into the project');
        assert.ok(r.gone, 'deleted again');
      },
    },
  ]),
];

/**
 * One case per menu command (every menu and submenu): with a project that enables it, the command runs
 * without an error. A command that opens a popup gets the popup closed (cancel) and must then finish;
 * OS file dialogs are answered "cancelled" (the stubs record that they were asked for).
 */
export async function commandCases(app) {
  const ids = await app.run(`
    const out = [];
    const walk = (list, where) => { for (const x of list) { if (x === '-') continue; if (typeof x === 'object') walk(A.menus.SUBMENUS[x.sub].items, where + ' › ' + x.sub); else if (!out.some((o) => o.id === x)) out.push({ id: x, where }); } };
    for (const [name, list] of Object.entries(A.menus.MENUS)) walk(list, name);
    return out;`);
  return ids.map(({ id, where }) => ({
    group: `명령 · ${where.split(' › ')[0]}`,
    name: `${id}${where.includes(' › ') ? ` (${where.split(' › ').slice(1).join(' › ')})` : ''}`,
    async run(ctx) {
      const r = await ctx.run(`return await T.command(${JSON.stringify(id)});`, 60000);
      if (r.error) throw new Error(r.error);
      if (!r.enabled) throw new Error(`disabled even with a project prepared for it (${r.why ?? ''})`);
      if (r.note) ctx.note?.(`${id}: ${r.note}`);
    },
  }));
}

/** Page-side command runner: prepares the project so the command is enabled, runs it, closes what it opened. */
export const COMMAND_HELPER = String.raw`(() => {
  const A = window.__mysketchbook; const T = window.__t;
  const OBJECT = ['cut', 'copy', 'duplicate', 'delete', 'hide', 'lock', 'unlock', 'rotate90', 'rotateMinus90', 'mirrorObject', 'dropToFloor', 'zoomSelection', 'exportSelection', 'makeGroup', 'clearSelection', 'intersectFaces', 'softenEdges'];
  const WALL = ['splitWall', 'flipWall'];
  const MODELS = ['solidUnion', 'solidSubtract', 'solidIntersect', 'editModel', 'explodeModel'];
  async function prepare(id) {
    const d = await T.fresh('room');
    const p = d.project;
    const lv = p.activeLevel;
    A.actions.change('op.place', (pr) => { pr.objects.push({ id: 'ob-cmd', level: lv, item: 'armchair', params: {}, position: [2, 0.3, 1.5], rotation: [0, 0, 0], scale: [1, 1, 1], materials: {}, tag: 'untagged', name: '' }); }, ['objects']);
    if (MODELS.includes(id)) {
      const P = await import('/src/modeling/primitives.js');
      A.actions.change('op.model', (pr) => {
        for (const [mid, x] of [['md-a', 1], ['md-b', 1.4]]) pr.models.push({ id: mid, level: lv, name: mid, mesh: P.box(1, 1, 1, { at: [x, 0, 1] }).toJSON(), position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], tag: 'untagged' });
      }, ['models']);
      A.actions.select(id === 'editModel' ? ['md-a'] : ['md-a', 'md-b']);
    }
    if (['deleteGuides'].includes(id)) A.actions.change('op.guide', (pr) => { pr.guides.push({ id: 'gd-1', a: [0, 0, 0], b: [1, 0, 0] }); }, ['guides']);
    if (['clearSections', 'toggleSections'].includes(id)) A.actions.change('op.section', (pr) => { pr.sections.push({ id: 'sc-1', point: [1, 1, 1], normal: [1, 0, 0], active: true }); }, ['sections']);
    if (['prevScene', 'nextScene'].includes(id)) { A.actions.addScene(); A.actions.addScene(); }
    if (id === 'levelUp' || id === 'levelDown') { await A.run('addLevel'); if (id === 'levelUp') await A.run('levelDown'); }
    if (id === 'redo') A.actions.undo();
    if (OBJECT.includes(id)) A.actions.select(['ob-cmd']);
    if (id === 'paste') { A.actions.select(['ob-cmd']); await A.run('copy'); }
    if (WALL.includes(id)) A.actions.select([p.walls[0].id]);
    if (id === 'clearRecent') { try { localStorage.setItem('x', '1'); } catch {} A.state.recent = [{ path: 'demo.msk', title: 'demo', web: true }]; }
    if (id === 'clearBackground') A.actions.updateSettings({ backgroundKind: 'animated' }, { quiet: true });
    d.markSaved();
    await T.frames(2);
  }
  const asked = [];
  async function command(id) {
    const settings = JSON.parse(JSON.stringify(A.state.settings));
    await prepare(id);
    const enabled = A.menus.enabled(id);
    if (!enabled) { A.actions.updateSettings(settings, { quiet: false }); return { enabled: false, why: 'selection ' + A.state.selection.length }; }
    // OS dialogs: answered "cancelled", and recorded.
    const saved = { open: window.showOpenFilePicker, save: window.showSaveFilePicker, wopen: window.open, click: HTMLInputElement.prototype.click };
    const abort = () => Object.assign(new Error('cancelled by the test'), { name: 'AbortError' });
    window.showOpenFilePicker = async () => { asked.push('open-picker'); throw abort(); };
    window.showSaveFilePicker = async () => { asked.push('save-picker'); throw abort(); };
    window.open = (url) => { asked.push('window:' + url); return null; };
    HTMLInputElement.prototype.click = function () { if (this.type === 'file') { asked.push('file-input'); setTimeout(() => this.dispatchEvent(new Event('cancel')), 0); return; } return saved.click.call(this); };
    const n0 = A.popups.opened.length;
    const a0 = asked.length;
    let error = null; let done = false;
    const anchor = { x: window.screenX + 200, y: window.screenY + 80, flipY: window.screenY + 60 };
    const run = Promise.resolve(A.run(id, { anchor })).then(() => { done = true; }, (e) => { error = e; done = true; });
    try {
      await T.sleep(500);
      // A popup it opened is closed (as Cancel / Esc would), so that the command can finish.
      for (let i = 0; i < 4 && !done; i++) {
        await A.popups.closeAll();
        for (const el of document.querySelectorAll('.web-popup:not(.web-popup-doc)')) el.remove();
        for (const el of document.querySelectorAll('.web-popup-shield')) el.remove();
        A.popups.frames.forEach((f, k) => { if (!f.isConnected) A.popups.frames.delete(k); });
        await Promise.race([run, T.sleep(1500)]);
      }
      if (!done) error = new Error('the command did not finish after its popups were closed');
    } finally {
      window.showOpenFilePicker = saved.open; window.showSaveFilePicker = saved.save; window.open = saved.wopen; HTMLInputElement.prototype.click = saved.click;
    }
    const popupsOpened = A.popups.opened.slice(n0).map((o) => o.kind).filter((k) => k !== 'error');
    const errorPopup = A.popups.opened.slice(n0).some((o) => o.kind === 'error');
    // Back to a known state: settings as before (panels, theme, language), doc frames closed.
    A.api.closeDocFrames?.();
    A.actions.updateSettings(settings);
    await T.reset({ project: false });
    const note = [popupsOpened.length ? 'popup ' + [...new Set(popupsOpened)].join(',') : '', asked.length > a0 ? 'dialog ' + asked.slice(a0).join(',') : ''].filter(Boolean).join(' · ');
    return { enabled: true, error: error ? String(error.stack ?? error) : errorPopup ? 'the error popup opened' : null, note };
  }
  window.__t.command = command;
})(); 1`;

