// Reports view and dashboards E2E cases (web build with a web core): every chart against the API's
// numbers, date range, exports, tooltips, dashboards (create, gadgets add/move/resize/configure, kept
// after a reload), languages, dark theme and a narrow window.
import assert from 'node:assert/strict';

/** Page prelude: SHOP open in the reports view (samples made the first time) → `rv`, `shop`, `board`. */
const OPEN = `await T.reset(); await T.until(() => A.state.core.status === 'ready', 20000, 'core');
  try { localStorage.removeItem('myboard.reports.v1'); } catch {}
  if (A.state.settings.language !== 'ko') A.actions.updateSettings({ language: 'ko' });
  let projects = await A.api.projects({ limit: 200 }); projects = Array.isArray(projects) ? projects : projects.items;
  let shop = projects.find((p) => p.key === 'SHOP');
  if (!shop) { const made = await A.api.createSamples('en'); shop = made.projects.find((p) => String(p.key).startsWith('SHOP')); await A.actions.refreshProjects(); }
  await A.actions.openTarget('project', shop.id, { view: 'reports', quiet: true });
  await T.until(() => window.__myboardReports?.project?.id === shop.id && window.__myboardReports.state === 'ready' && window.__myboardReports.chart, 20000, 'reports ready');
  const rv = window.__myboardReports;
  const board = rv.board;
  const show = async (id) => {
    document.querySelector('.left-view-body [data-vs-act="report"][data-vs-value="' + id + '"]').click();
    await T.until(() => rv.prefs.report === id && rv.state === 'ready' && (rv.chart || document.querySelector('.rp-chart .rp-state')), 15000, id);
    await T.frames(2); await T.sleep(250); // the chart settles after the panel resizes
  };
  const svg = () => document.querySelector('.rp-chart svg');
  const count = (sel) => svg()?.querySelectorAll(sel).length ?? 0;`;

const ANSWER = `async function answerPrompt(value) {
    await T.popupReady('prompt');
    const d = T.popupDoc('prompt'); const input = d.querySelector('[data-draft="value"]');
    input.value = value; input.dispatchEvent(new Event('input', { bubbles: true }));
    d.querySelector('[data-action="prompt-apply"]').click();
  }
  async function answerConfirm(choice) { await T.popupReady('confirm'); T.popupDoc('confirm').querySelector('[data-action="choice"][data-value="' + choice + '"]').click(); }`;

/** Opens the dashboards tab (a dashboard of our own named `name`, made through the UI when missing) → `db`. */
const DASH = (name) => `${ANSWER}
  rv.pickDashboard(); // the dashboards are the left panel's sidebar items
  await T.until(() => rv.dashboards?.state === 'ready', 10000, 'dashboards');
  let db = rv.dashboards;
  const mine = db.list.find((d) => d.name === ${JSON.stringify(name)} && d.mine);
  if (mine) { await db.load(mine.id); } else {
    document.querySelector('.left-view-body [data-vs-act="newDashboard"]').click();
    await answerPrompt(${JSON.stringify(name)});
    await T.until(() => db.dash?.name === ${JSON.stringify(name)}, 10000, 'created');
  }
  const settleGadgets = () => T.until(() => [...document.querySelectorAll('.db-gadget .db-gbody')].every((b) => !b.querySelector('.rp-state .icon') || !b.textContent.includes('불러오는')), 15000, 'gadgets');`;

export const cases = [
  {
    group: '보고서',
    name: '누적 흐름도 · 관리도 · 처리량: 그림의 점·막대 수가 API 숫자와 같음',
    async run(app) {
      const r = await app.run(`${OPEN}
        const q = { boardId: board.id };
        await show('cfd');
        const cfd = await A.api.report('cfd', { ...q, ...rv.query('cfd') });
        const c1 = { areas: count('.rp-area'), bands: count('.rp-band'), cols: cfd.columns.length, days: cfd.days.length, legend: document.querySelectorAll('.rp-legend .rp-leg').length,
          lastTotal: rv.chart.tips.at(-1).total, apiLast: cfd.series.reduce((a, s) => a + s.values.at(-1), 0) };
        await show('control');
        const ctl = await A.api.report('control', rv.query('control'));
        const c2 = { points: count('.rp-point'), api: ctl.points.length, rolling: count('.rp-rolling'), band: count('.rp-band-sd'), mean: count('.rp-mean'), statN: document.querySelector('.rp-stat b').textContent };
        await show('throughput');
        const tp = await A.api.report('throughput', rv.query('throughput'));
        const c3 = { bars: count('.rp-bar'), hits: count('.rp-hit'), apiBars: tp.buckets.filter((b) => b.count > 0).length, apiBuckets: tp.buckets.length, avg: count('.rp-avg'),
          heights: [...svg().querySelectorAll('.rp-bar')].map((b) => Number(b.dataset.value)), apiCounts: tp.buckets.filter((b) => b.count > 0).map((b) => b.count) };
        return { c1, c2, c3 };`);
      assert.equal(r.c1.areas, r.c1.cols, 'one stacked area per board column');
      assert.equal(r.c1.bands, r.c1.days, 'one hover band per day');
      assert.equal(r.c1.legend, r.c1.cols);
      assert.equal(r.c1.lastTotal, r.c1.apiLast, 'last day total');
      assert.ok(r.c2.api > 0);
      assert.equal(r.c2.points, r.c2.api, 'one dot per completed issue');
      assert.equal(r.c2.rolling, 1); assert.equal(r.c2.band, 1); assert.equal(r.c2.mean, 1);
      assert.equal(Number(r.c2.statN), r.c2.api);
      assert.equal(r.c3.bars, r.c3.apiBars); assert.equal(r.c3.hits, r.c3.apiBuckets); assert.equal(r.c3.avg, 1);
      assert.deepEqual(r.c3.heights, r.c3.apiCounts);
    },
  },
  {
    group: '보고서',
    name: '생성 대 해결 · 작업량 · 버전 · 분포: API 숫자와 같음',
    async run(app) {
      const r = await app.run(`${OPEN}
        await show('createdResolved');
        const cr = await A.api.report('created-resolved', rv.query('createdResolved'));
        const a = { lines: count('.rp-line'), bands: count('.rp-band'), days: cr.days.length, between: count('.rp-between'), last: rv.chart.tips.at(-1).rows.map((x) => x.value), api: [cr.days.at(-1).cumulativeCreated, cr.days.at(-1).cumulativeResolved] };
        await show('workload');
        const wl = await A.api.report('workload', rv.query('workload'));
        const b = { bars: count('.rp-bar'), api: wl.items.filter((i) => i.count > 0).length, values: [...svg().querySelectorAll('.rp-bar')].map((x) => Number(x.dataset.value)), apiValues: wl.items.filter((i) => i.count > 0).map((i) => i.count) };
        await show('version');
        const ver = await A.api.report('version/' + rv.opts('version').versionId, {});
        const c = { bands: count('.rp-band'), burnup: ver.burnup.length, lines: count('.rp-line'), stat: document.querySelector('.rp-stat b').textContent, total: ver.total, predicted: ver.predictedReleaseDate };
        await show('breakdown');
        const br = await A.api.report('breakdown', { jql: rv.query('breakdown').jql, field: 'status' });
        const d = { slices: count('.rp-slice'), api: Math.min(8, br.items.length), center: svg().querySelector('text[font-weight="700"]').textContent, total: br.total };
        return { a, b, c, d };`);
      assert.equal(r.a.lines, 2); assert.equal(r.a.bands, r.a.days); assert.equal(r.a.between, r.a.days - 1);
      assert.deepEqual(r.a.last, r.a.api, 'cumulative created / resolved on the last day');
      assert.equal(r.b.bars, r.b.api); assert.deepEqual(r.b.values, r.b.apiValues);
      assert.ok(r.c.bands >= r.c.burnup, 'burn-up days (plus the forecast)');
      assert.ok(r.c.lines >= 2);
      assert.equal(Number(r.c.stat), r.c.total);
      assert.equal(r.d.slices, r.d.api); assert.equal(Number(r.d.center), r.d.total);
    },
  },
  {
    group: '보고서',
    name: '기간 바꾸기 (최근 7일 · 직접 지정) → 다시 불러와 점 수가 바뀜',
    async run(app) {
      const r = await app.run(`${OPEN}
        await show('cfd');
        const before = count('.rp-band');
        document.querySelector('[data-drop="range"]').click(); await T.until(() => document.querySelector('.mbv-pop'), 3000, 'range');
        document.querySelector('.mbv-pop-item[data-value="7"]').click();
        await T.until(() => count('.rp-band') !== before && rv.state === 'ready', 8000, 'reloaded');
        const seven = count('.rp-band');
        const from = document.querySelector('[data-date="from"]');
        const d = new Date(Date.now() - 14 * 86400000); from.value = d.toISOString().slice(0, 10);
        from.dispatchEvent(new Event('change', { bubbles: true }));
        await T.until(() => rv.opts('cfd').from && rv.state === 'ready' && count('.rp-band') !== seven, 8000, 'custom');
        const custom = count('.rp-band');
        const api = await A.api.report('cfd', rv.query('cfd'));
        return { before, seven, custom, api: api.days.length, label: document.querySelector('[data-drop="range"]').textContent.trim() };`);
      assert.equal(r.before, 31);
      assert.equal(r.seven, 8, 'seven days back: 8 days');
      assert.equal(r.custom, r.api);
      assert.ok(r.custom >= 14 && r.custom <= 16);
      assert.match(r.label, /직접 지정/);
    },
  },
  {
    group: '보고서',
    name: '내보내기: PNG · SVG 파일, CSV 복사·저장 (내용 확인)',
    async run(app) {
      const r = await app.run(`${OPEN}
        await show('throughput');
        const { savedFiles } = await import('/src/views/backlog/download.js');
        const n = savedFiles.length;
        document.querySelector('[data-act="svg"]').click(); await T.until(() => savedFiles.length > n, 5000, 'svg');
        const svgFile = savedFiles[0];
        document.querySelector('[data-act="png"]').click(); await T.until(() => savedFiles.length > n + 1, 8000, 'png');
        const png = savedFiles[0];
        const head = new Uint8Array(await png.blob.slice(0, 8).arrayBuffer());
        document.querySelector('[data-act="copyCsv"]').click(); await T.until(() => savedFiles.length > n + 2, 5000, 'copy');
        const copied = savedFiles[0];
        document.querySelector('[data-act="saveCsv"]').click(); await T.until(() => savedFiles.length > n + 3, 5000, 'csv');
        const csv = savedFiles[0];
        const tp = await A.api.report('throughput', rv.query('throughput'));
        return { svgName: svgFile.name, svgHead: svgFile.text.slice(0, 60), svgBars: (svgFile.text.match(/class="rp-bar"/g) ?? []).length, apiBars: tp.buckets.filter((b) => b.count > 0).length,
          pngName: png.name, pngType: png.mime, pngSize: png.size, magic: [...head].slice(0, 4), copied: copied.text.split('\\r\\n'), csvName: csv.name, rows: tp.buckets.length, first: tp.buckets[0] };`);
      assert.match(r.svgName, /\.svg$/); assert.match(r.svgHead, /^<\?xml/); assert.equal(r.svgBars, r.apiBars);
      assert.match(r.pngName, /\.png$/); assert.equal(r.pngType, 'image/png'); assert.ok(r.pngSize > 2000); assert.deepEqual(r.magic, [137, 80, 78, 71]);
      assert.equal(r.copied[0], 'Start,Completed issues,Story points');
      assert.equal(r.copied.length, r.rows + 1);
      assert.equal(r.copied[1], [r.first.date, r.first.count, r.first.points].join(','));
      assert.match(r.csvName, /\.csv$/);
    },
  },
  {
    group: '보고서',
    name: '마우스를 올리면 도움말 (값) · 범례로 열 숨기기 · 관리도 시작/끝 열',
    async run(app) {
      const r = await app.run(`${OPEN}
        await show('cfd');
        const band = svg().querySelectorAll('.rp-band')[10]; const b = band.getBoundingClientRect();
        band.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: b.left + b.width / 2, clientY: b.top + 40 }));
        await T.frames(1);
        const tip = document.querySelector('.rp-chart .rp-tip');
        const tipText = tip.hidden ? '' : tip.textContent; const cross = svg().querySelector('.rp-cross').getAttribute('visibility');
        const expected = rv.data.series.reduce((a, s) => a + s.values[10], 0);
        document.querySelector('[data-toggle-series]').click(); await T.frames(1);
        const areas = count('.rp-area');
        await show('control');
        const cols = rv.columns.filter((c) => !c.backlog).map((c) => c.id);
        document.querySelector('[data-drop="startCols"]').click(); await T.until(() => document.querySelector('.mbv-pop'), 3000, 'cols');
        const firstWork = document.querySelectorAll('.mbv-pop-item')[1]; firstWork.click();
        document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        await T.until(() => rv.state === 'ready' && rv.query('control').startColumnIds, 8000, 'start cols');
        const q = rv.query('control');
        await T.sleep(400);
        const api = await A.api.report('control', q);
        return { tipText, cross, expected, areas, cols: rv.data.columns?.length ?? rv.columns.length, q, points: count('.rp-point'), api: api.points.length };`);
      assert.match(r.tipText, /Σ/); assert.ok(r.tipText.includes(String(r.expected)), 'tooltip total');
      assert.equal(r.cross, 'visible', 'crosshair');
      assert.equal(r.areas, r.cols - 1, 'a legend click hides one column');
      assert.ok(r.q.startColumnIds, 'start columns sent to the API');
      assert.equal(r.points, r.api);
    },
  },
  {
    group: '대시보드',
    name: '만들기 → 가젯 추가 · 옮기기(메뉴) · 끌어서 옮기기 · 크기 · 설정(양식) → 다시 열어도 그대로',
    async run(app) {
      const name = `E2E 대시보드 ${Date.now()}`;
      const r1 = await app.run(`${OPEN}
        ${DASH(name)}
        await settleGadgets();
        const starter = db.gadgets.length;
        const svgs = document.querySelectorAll('.db-gadget svg.rp-svg').length;
        document.querySelector('[data-drop="addGadget"]').click(); await T.until(() => document.querySelector('.mbv-pop'), 3000, 'types');
        const types = [...document.querySelectorAll('.mbv-pop-item')].map((x) => x.dataset.value);
        document.querySelector('.mbv-pop-item[data-value="throughput"]').click();
        await T.until(() => db.gadgets.length === starter + 1, 8000, 'added');
        const g = db.gadgets.find((x) => x.type === 'throughput');
        await settleGadgets();
        const card = document.querySelector('[data-gadget="' + g.id + '"]');
        card.querySelector('[data-gact="menu"]').click(); await T.until(() => document.querySelector('.mbv-pop'), 3000, 'menu');
        document.querySelector('.mbv-pop-item[data-value="right"]').click();
        await T.until(() => db.gadgets.find((x) => x.id === g.id).col === 1, 8000, 'moved right');
        await db.saving;
        const head = document.querySelector('[data-gadget="' + g.id + '"] .db-ghead').getBoundingClientRect();
        const grip = document.querySelector('[data-gadget="' + g.id + '"] .db-grip').getBoundingClientRect();
        const cs = db.cellSize();
        return { id: g.id, starter, svgs, types, head: { x: head.left + 60, y: head.top + head.height / 2 }, grip: { x: grip.left + 8, y: grip.top + 8 }, colW: cs.colW, rowH: cs.rowH, col: db.gadgets.find((x) => x.id === g.id).col };`);
      assert.ok(r1.starter >= 4, 'starter gadgets');
      assert.ok(r1.svgs >= 2, 'charts drawn in gadgets');
      assert.deepEqual(r1.types, ['filterResults', 'pie', 'createdVsResolved', 'cfd', 'control', 'throughput', 'workload', 'version', 'assignedToMe', 'activity', 'markdown']);
      assert.equal(r1.col, 1);
      // A real pointer drag of the title one column to the left, then the corner grip one column wider.
      await app.main.drag(r1.head, { x: r1.head.x - r1.colW - 10, y: r1.head.y }, 14);
      const r2 = await app.run(`const db = window.__myboardReports.dashboards; await T.until(() => db.gadgets.find((x) => x.id === ${JSON.stringify(r1.id)}).col === 0, 8000, 'dragged'); await db.saving;
        const grip = document.querySelector('[data-gadget="${r1.id}"] .db-grip').getBoundingClientRect();
        return { grip: { x: grip.left + 8, y: grip.top + 8 }, g: db.gadgets.find((x) => x.id === ${JSON.stringify(r1.id)}) };`);
      assert.equal(r2.g.col, 0, 'dragged to the first column');
      await app.main.drag(r2.grip, { x: r2.grip.x + r1.colW + 12, y: r2.grip.y }, 14);
      const r3 = await app.run(`const db = window.__myboardReports.dashboards; const rv = window.__myboardReports;
        await T.until(() => db.gadgets.find((x) => x.id === ${JSON.stringify(r1.id)}).w === 2, 8000, 'resized'); await db.saving;
        const p = db.configure(db.gadgets.find((x) => x.id === ${JSON.stringify(r1.id)}));
        await T.popupReady('form');
        const d = T.popupDoc('form');
        const fields = [...d.querySelectorAll('[data-ff-row]')].map((x) => x.dataset.ffRow);
        const title = d.querySelector('[data-ff="title"]'); title.value = 'E2E 처리량'; title.dispatchEvent(new Event('input', { bubbles: true }));
        d.querySelector('[data-action="form-submit"]').click();
        await p; await db.saving;
        await T.until(() => document.querySelector('[data-gadget="${r1.id}"] .db-ghead b')?.textContent === 'E2E 처리량', 5000, 'title');
        const undoLabel = A.history.undoLabel;
        const saved = (await A.api.get('/dashboards/' + db.dash.id)).layout.gadgets.find((x) => x.id === ${JSON.stringify(r1.id)});
        return { fields, saved, undoLabel, dashId: db.dash.id };`);
      assert.ok(r3.fields.includes('days') && r3.fields.includes('interval') && r3.fields.includes('title'), 'throughput settings');
      assert.equal(r3.saved.config.title, 'E2E 처리량');
      assert.equal(r3.saved.w, 2, 'size saved');
      assert.equal(r3.saved.col, 0, 'place saved');
      assert.match(r3.undoLabel, /가젯 설정/);
      await app.reload();
      const r4 = await app.run(`await T.until(() => A.state.core.status === 'ready', 20000, 'core');
        let projects = await A.api.projects({ limit: 200 }); projects = Array.isArray(projects) ? projects : projects.items;
        const shop = projects.find((p) => p.key === 'SHOP');
        await A.actions.openTarget('project', shop.id, { view: 'reports', quiet: true });
        await T.until(() => window.__myboardReports?.dashboards?.dash?.id === ${JSON.stringify(r3.dashId)}, 15000, 'same dashboard after reload');
        const el = document.querySelector('[data-gadget="${r1.id}"]');
        return { title: el?.querySelector('.db-ghead b').textContent, style: el?.getAttribute('style') };`);
      assert.equal(r4.title, 'E2E 처리량');
      assert.match(r4.style, /grid-column: 1 \/ span 2/);
    },
  },
  {
    group: '대시보드',
    name: '가젯 종류마다 내용 (필터 결과 수 = API, 메모 Markdown) · 실행 취소 · 이름 바꾸기 · 삭제',
    async run(app) {
      const r = await app.run(`${OPEN}
        ${DASH('E2E 가젯')}
        for (const g of [...db.gadgets]) await db.gadgetMenu(g, 'remove');
        const jql = 'project = SHOP AND statusCategory != done';
        const fr = await db.addGadget('filterResults', { jql, limit: 5 });
        const md = await db.addGadget('markdown', { text: '# 제목\\n- **굵게**' });
        const me = await db.addGadget('assignedToMe');
        await db.addGadget('activity');
        await T.until(() => document.querySelector('[data-gadget="' + fr.id + '"] .db-issues'), 8000, 'results');
        const api = await A.api.issues({ jql, limit: 5 });
        const items = [...document.querySelectorAll('[data-gadget="' + fr.id + '"] .db-issue b')].map((b) => b.textContent);
        const more = document.querySelector('[data-gadget="' + fr.id + '"] .db-more')?.textContent ?? '';
        const mdHtml = document.querySelector('[data-gadget="' + md.id + '"] .db-md').innerHTML;
        const n = db.gadgets.length;
        await A.actions.undo(); await T.until(() => db.gadgets.length === n - 1, 5000, 'undo add');
        await A.actions.redo(); await T.until(() => db.gadgets.length === n, 5000, 'redo add');
        document.querySelector('[data-dact="rename"]').click();
        await answerPrompt('E2E 가젯 2'); await T.until(() => db.dash.name === 'E2E 가젯 2', 5000, 'renamed');
        const id = db.dash.id;
        document.querySelector('[data-dact="delete"]').click();
        await answerConfirm('delete');
        await T.until(() => db.dash?.id !== id, 8000, 'deleted');
        const gone = !(await A.api.dashboards()).some((d) => d.id === id);
        return { items, apiKeys: api.items.map((i) => i.key), more, apiTotal: api.total, mdHtml, gone };`);
      assert.deepEqual(r.items, r.apiKeys);
      if (r.apiTotal > 5) assert.match(r.more, new RegExp(String(r.apiTotal)));
      assert.match(r.mdHtml, /<h3>제목<\/h3><ul><li><b>굵게<\/b><\/li><\/ul>/);
      assert.ok(r.gone, 'deleted in the database');
    },
  },
  {
    group: '보고서',
    name: '한국어 ↔ English · 어두운 테마 · 좁은 창 (가로 스크롤 없음, 도구 안 잘림)',
    async run(app) {
      await app.main.send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 760, deviceScaleFactor: 1, mobile: false });
      try {
        const r = await app.run(`${OPEN}
          await show('cfd');
          const ko = document.querySelector('.rp-title h2').textContent;
          A.actions.updateSettings({ language: 'en', theme: 'dark' }); await T.until(() => document.querySelector('.rp-title h2')?.textContent === 'Cumulative flow', 8000, 'en');
          await T.until(() => rv.state === 'ready' && svg(), 8000, 'chart');
          const en = document.querySelector('.rp-title h2').textContent;
          const bg = svg().querySelector('.rp-bg').getAttribute('fill');
          const textFill = svg().querySelector('text').getAttribute('fill');
          const ws = document.querySelector('#workspace').getBoundingClientRect();
          const clipped = [...document.querySelectorAll('.rp-bar button, .rp-export button, .rp-controls button, .rp-controls input')].filter((b) => { const q = b.getBoundingClientRect(); return q.width > 0 && (q.right > ws.right + 1 || q.left < ws.left - 1); }).length;
          const out = { ko, en, bg, textFill, clipped, page: document.documentElement.scrollWidth <= document.documentElement.clientWidth, svgW: svg().getBoundingClientRect().width, cardW: document.querySelector('.rp-card').getBoundingClientRect().width, narrow: rv.root.classList.contains('narrow') };
          A.actions.updateSettings({ language: 'ko', theme: 'light' });
          return out;`);
        assert.equal(r.ko, '누적 흐름도');
        assert.equal(r.en, 'Cumulative flow');
        assert.notEqual(r.bg, '#ffffff', 'dark chart surface');
        assert.ok(r.page, 'no page-level horizontal scroll');
        assert.equal(r.clipped, 0, 'no clipped controls');
        assert.ok(r.svgW <= r.cardW, 'the chart fits its card');
        assert.ok(r.narrow);
      } finally {
        await app.main.send('Emulation.setDeviceMetricsOverride', { width: app.width, height: app.height, deviceScaleFactor: 1, mobile: false });
      }
    },
  },
];
