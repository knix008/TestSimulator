// The smaller editors: UV, Image, Text, Console, Info, Spreadsheet.
import { GEOMETRY_TYPES, activeObject, evaluatedMesh, newId } from '../../core/doc.js';
import { selectedFaces } from '../../core/mesh.js';
import { runConsoleLine, runScript } from '../../core/script.js';
import { createPythonConsole, runPython } from '../../core/python.js';
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { nameOf, t } from '../i18n.js';
import { menuTitle } from '../menus.js';
import { getOp } from '../../core/ops.js';
import { colorField, emptyNote, numField, select } from '../widgets.js';
import { PAINT_BLENDS, paintDabImage } from '../../core/paint.js';
import { encodeImageData } from '../render.js';
import { sessionTool } from './view3d.js';

// ─────────────── UV editor

export function createUVEditor(app, el, area) {
  const state = area.state ??= { zoom: 0.8, x: 0, y: 0 };
  const canvas = h('canvas', { className: 'uv-canvas', dataset: { testid: 'uv-canvas' } });
  const root = h('div', { className: 'view3d', dataset: { testid: 'uv-editor' } }, canvas);
  el.append(root);
  let dirty = true;
  const redraw = () => { dirty = true; app.requestFrame(); };
  const layout = () => {
    const r = root.getBoundingClientRect();
    const size = Math.min(r.width, r.height) * state.zoom;
    return { w: r.width, h: r.height, size, ox: (r.width - size) / 2 + state.x, oy: (r.height - size) / 2 + state.y };
  };
  const toScreen = (uv, l) => [l.ox + uv[0] * l.size, l.oy + (1 - uv[1]) * l.size];
  const mesh = () => { const o = activeObject(app.doc); return o?.type === 'MESH' ? o.data : null; };
  const selectedUV = new Set();
  const draw = () => {
    dirty = false;
    const l = layout();
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(l.w * dpr) || canvas.height !== Math.round(l.h * dpr)) { canvas.width = Math.round(l.w * dpr); canvas.height = Math.round(l.h * dpr); }
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#2b2b2b';
    g.fillRect(0, 0, l.w, l.h);
    g.fillStyle = '#3a3a3a';
    g.fillRect(l.ox, l.oy, l.size, l.size);
    g.strokeStyle = '#555';
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 0; i <= 8; i++) {
      const k = (i / 8) * l.size;
      g.moveTo(l.ox + k, l.oy); g.lineTo(l.ox + k, l.oy + l.size);
      g.moveTo(l.ox, l.oy + k); g.lineTo(l.ox + l.size, l.oy + k);
    }
    g.stroke();
    const m = mesh();
    if (!m?.uvs) {
      g.fillStyle = '#999';
      g.font = '12px sans-serif';
      g.textAlign = 'center';
      g.fillText(m ? t('This mesh has no UV map: use UV › Smart UV Project', '이 메시에 UV 맵이 없습니다: UV › 스마트 UV 투영') : t('Select a mesh', '메시를 선택하세요'), l.w / 2, l.h / 2);
      return;
    }
    const inEdit = app.doc.mode === 'EDIT';
    const selected = inEdit ? new Set(selectedFaces(m)) : null;
    m.uvs.forEach((uv, f) => {
      if (!uv || (selected && selected.size && !selected.has(f))) return;
      g.beginPath();
      uv.forEach((p, i) => { const [x, y] = toScreen(p, l); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      g.closePath();
      g.fillStyle = 'rgba(239,139,60,.13)';
      g.fill();
      g.strokeStyle = '#dddddd';
      g.stroke();
      uv.forEach((p, i) => {
        const [x, y] = toScreen(p, l);
        g.fillStyle = selectedUV.has(`${f}:${i}`) ? '#ef8b3c' : '#111';
        g.fillRect(x - 2, y - 2, 4, 4);
      });
    });
  };
  const pick = (mx, my, l) => {
    const m = mesh();
    if (!m?.uvs) return null;
    let best = null;
    let bestD = 10;
    m.uvs.forEach((uv, f) => uv?.forEach((p, i) => {
      const [x, y] = toScreen(p, l);
      const d = Math.hypot(x - mx, y - my);
      if (d < bestD) { bestD = d; best = { f, i, uv: p }; }
    }));
    return best;
  };
  canvas.addEventListener('pointerdown', (e) => {
    app.setActiveArea(area);
    const r = canvas.getBoundingClientRect();
    const [mx, my] = [e.clientX - r.left, e.clientY - r.top];
    const l = layout();
    canvas.setPointerCapture(e.pointerId);
    if (e.button === 1 || e.altKey) {
      const [ox, oy] = [state.x, state.y];
      const move = (m) => { state.x = ox + m.clientX - e.clientX; state.y = oy + m.clientY - e.clientY; redraw(); };
      const up = () => { canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up); };
      canvas.addEventListener('pointermove', move);
      canvas.addEventListener('pointerup', up);
      return;
    }
    const hit = pick(mx, my, l);
    if (!e.shiftKey) selectedUV.clear();
    if (!hit) { redraw(); return; }
    const m = mesh();
    // Corners at the same place on the same vertex move together.
    const vert = m.faces[hit.f][hit.i];
    m.uvs.forEach((uv, f) => uv?.forEach((p, i) => { if (m.faces[f][i] === vert && Math.hypot(p[0] - hit.uv[0], p[1] - hit.uv[1]) < 1e-5) selectedUV.add(`${f}:${i}`); }));
    const moving = [...selectedUV].map((key) => { const [f, i] = key.split(':').map(Number); return { uv: m.uvs[f][i], start: [...m.uvs[f][i]] }; });
    let moved = false;
    const move = (ev) => {
      const [dx, dy] = [(ev.clientX - e.clientX) / l.size, -(ev.clientY - e.clientY) / l.size];
      if (Math.abs(dx) + Math.abs(dy) > 0.001) moved = true;
      for (const c of moving) { c.uv[0] = c.start[0] + dx; c.uv[1] = c.start[1] + dy; }
      app.touch();
      redraw();
    };
    const up = () => {
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      if (moved) app.commit(t('Move UVs', 'UV 이동'));
    };
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    redraw();
  });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); state.zoom = Math.max(0.1, Math.min(8, state.zoom * (e.deltaY > 0 ? 0.9 : 1.1))); redraw(); }, { passive: false });
  const ro = new ResizeObserver(redraw);
  ro.observe(root);
  return {
    update: redraw,
    frame() { if (dirty) draw(); },
    header(hdr) {
      hdr.append(menuTitle(t('UV', 'UV'), () => ['uv.unwrap', 'uv.smart_project', 'uv.cube_project', 'uv.cylinder_project', 'uv.sphere_project', 'uv.reset'].map((id) => ({ label: nameOf(getOp(id)), disabled: !app.canRun(id), testid: `uvop-${id}`, onClick: () => app.op(id) })), 'menu-uv'));
    },
    dispose() { ro.disconnect(); root.remove(); },
  };
}

// ─────────────── Image editor

export function createImageEditor(app, el, area) {
  const state = area.state ??= { source: 'RENDER' };
  const canvas = h('canvas', { dataset: { testid: 'image-canvas' } });
  const note = h('div', { className: 'empty-note', style: { position: 'absolute' } });
  const root = h('div', { className: 'image-view', dataset: { testid: 'image-editor' } }, canvas, note);
  el.append(root);
  let shown; // undefined: nothing drawn yet, so the first draw also shows the "no render" note.
  const draw = () => {
    const doc = app.doc;
    let source = null;
    if (state.source === 'RENDER') source = app.renderResult;
    else source = app.imageCache?.()[state.source] ?? null;
    if (source === shown) return;
    shown = source;
    if (!source) {
      canvas.style.display = 'none';
      note.style.display = '';
      note.textContent = state.source === 'RENDER' ? t('No render yet: press F12', '렌더 결과 없음: F12를 누르세요') : t('No image', '이미지 없음');
      return;
    }
    canvas.style.display = '';
    note.style.display = 'none';
    canvas.width = source.width;
    canvas.height = source.height;
    const g = canvas.getContext('2d');
    const rgba = source.display ?? source.rgba;
    g.putImageData(new ImageData(new Uint8ClampedArray(rgba), source.width, source.height), 0, 0);
    void doc;
  };
  // Painting: what's under the mouse, through the picture's fit inside the area.
  const toUV = (e) => {
    const r = canvas.getBoundingClientRect();
    const scale = Math.min(r.width / canvas.width, r.height / canvas.height);
    const [w, hh] = [canvas.width * scale, canvas.height * scale];
    return [(e.clientX - r.left - (r.width - w) / 2) / w, 1 - (e.clientY - r.top - (r.height - hh) / 2) / hh];
  };
  canvas.addEventListener('pointerdown', (e) => {
    app.setActiveArea(area);
    if (!state.paint || e.button !== 0 || state.source === 'RENDER') return;
    const entry = app.imageCache?.()[state.source];
    if (!entry) return;
    e.preventDefault();
    const win = canvas.ownerDocument.defaultView;
    const dab = ([u, v]) => paintDabImage(entry, u, v, { radius: state.brushSize ?? 24, strength: sessionTool.strength, color: sessionTool.paintColor, blend: sessionTool.paintBlend });
    let last = toUV(e);
    dab(last);
    const changed = () => { entry.version = (entry.version ?? 0) + 1; shown = undefined; draw(); app.touch(); };
    changed();
    const move = (ev) => {
      const next = toUV(ev);
      // Fast strokes stay continuous: dabs a quarter of the brush apart.
      const spacing = Math.max(1, (state.brushSize ?? 24) / 4) / entry.width;
      const steps = Math.max(1, Math.ceil(Math.hypot(next[0] - last[0], next[1] - last[1]) / spacing));
      for (let i = 1; i <= steps; i++) dab([last[0] + ((next[0] - last[0]) * i) / steps, last[1] + ((next[1] - last[1]) * i) / steps]);
      last = next;
      changed();
    };
    const up = () => {
      win.removeEventListener('pointermove', move);
      win.removeEventListener('pointerup', up);
      const image = app.doc.images.find((x) => x.id === state.source);
      if (image) { image.dataUrl = encodeImageData(entry); entry.src = image.dataUrl; }
      app.commit(t('Paint', '칠하기'));
    };
    win.addEventListener('pointermove', move);
    win.addEventListener('pointerup', up);
  });
  let holder = null;
  let savable = false;
  let imageCount = app.doc.images.length;
  return {
    refresh() { shown = undefined; draw(); },
    update() {
      // In Texture Paint the picture being painted is what this editor is there for.
      if (state.source === 'RENDER' && !state.chosen && app.doc.mode === 'TEXTURE_PAINT' && app.doc.images.length) { state.source = app.doc.images.at(-1).id; shown = undefined; }
      if (imageCount !== app.doc.images.length) { imageCount = app.doc.images.length; this.syncHeader(); }
      if (state.source !== 'RENDER' && !app.doc.images.some((x) => x.id === state.source)) { state.source = 'RENDER'; shown = undefined; this.syncHeader(); }
      // A render still in progress keeps one result object with a growing image: it has to be drawn again each time.
      if (app.renderResult?.partial) shown = undefined;
      const finished = Boolean(app.renderResult?.linear);
      if (finished !== savable) { savable = finished; this.syncHeader(); }
      draw();
    },
    frame() { draw(); },
    header(hdr) {
      holder = h('span', { className: 'scroll' });
      const sync = () => {
        const painting = state.paint && state.source !== 'RENDER';
        canvas.style.cursor = painting ? 'crosshair' : '';
        holder.replaceChildren(
          h('button', { type: 'button', className: `hdr-btn${state.paint ? ' on' : ''}`, title: t('Paint on this image', '이 이미지에 칠하기'), dataset: { testid: 'image-paint' }, onClick: () => { state.paint = !state.paint; sync(); } }, icon('tool-brush', 13)),
          h('button', { type: 'button', className: 'hdr-btn', title: t('New image', '새 이미지'), dataset: { testid: 'image-new' }, onClick: () => { if (app.op('image.new', { name: `Image.${String(app.doc.images.length + 1).padStart(3, '0')}`, color: [1, 1, 1] })) { state.source = app.doc.images.at(-1).id; state.paint = true; shown = undefined; sync(); draw(); } } }, icon('new', 13)),
          ...(painting ? [
            colorField({ value: sessionTool.paintColor, onChange: (v) => { sessionTool.paintColor = v; } }),
            numField({ value: state.brushSize ?? 24, step: 1, min: 1, max: 1024, int: true, testid: 'image-brush', onChange: (v) => { state.brushSize = v; } }),
            select({ value: sessionTool.paintBlend, options: PAINT_BLENDS, testid: 'image-blend', onChange: (v) => { sessionTool.paintBlend = v; } }),
          ] : []),
          select({ value: state.source, options: [['RENDER', t('Render Result', '렌더 결과')], ...app.doc.images.map((i) => [i.id, i.name])], testid: 'image-source', onChange: (v) => { state.source = v; state.chosen = true; shown = undefined; draw(); sync(); } }),
          h('button', { type: 'button', className: 'hdr-btn', title: t('Save the render as an image', '렌더를 이미지로 저장'), disabled: !app.renderResult?.linear, dataset: { testid: 'image-save' }, onClick: () => app.op('render.save_image') }, icon('save', 13)),
          h('button', { type: 'button', className: 'hdr-btn', title: t('Load an image', '이미지 불러오기'), onClick: () => app.op('image.open') }, icon('open', 13)),
        );
      };
      sync();
      hdr.append(holder);
      this.syncHeader = sync;
    },
    syncHeader() {},
    dispose() { root.remove(); },
  };
}

// ─────────────── Text editor

const SAMPLE_SCRIPT = `# Runs inside the program. bpy.ops are the same operators as the menus.
import bpy

for i in range(5):
    bpy.ops.mesh.primitive_cube_add(size=0.5, location=(i * 0.8 - 1.6, 3, 0.25 + i * 0.5))

print("Objects:", len(bpy.data.objects))
`;
const SAMPLE_JS = `// JavaScript scripts get the same bpy, with props in one object.
bpy.ops.mesh.primitive_cube_add({ size: 0.5, location: [0, 3, 0.25] });
print('Objects:', bpy.data.objects.length);
`;

export function createTextEditor(app, el, area) {
  const state = area.state ??= { textId: null };
  const gutter = h('div', { className: 'text-gutter' });
  const editor = h('textarea', { className: 'text-area', spellcheck: false, wrap: 'off', dataset: { testid: 'text-area' } });
  const root = h('div', { className: 'text-editor', dataset: { testid: 'text-editor' } }, gutter, editor);
  el.append(root);
  const current = () => app.doc.texts.find((x) => x.id === state.textId) ?? null;
  const ensure = () => {
    if (!current()) {
      if (!app.doc.texts.length) app.doc.texts.push({ id: newId('txt'), name: 'script.py', body: SAMPLE_SCRIPT });
      state.textId = app.doc.texts[0].id;
    }
  };
  const numbers = () => { const n = editor.value.split('\n').length; gutter.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n'); gutter.scrollTop = editor.scrollTop; };
  editor.addEventListener('input', () => { const c = current(); if (c) c.body = editor.value; numbers(); });
  editor.addEventListener('scroll', () => { gutter.scrollTop = editor.scrollTop; });
  editor.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = editor.selectionStart;
      editor.setRangeText('  ', s, editor.selectionEnd, 'end');
      editor.dispatchEvent(new Event('input'));
    }
    if ((e.ctrlKey || e.altKey) && (e.key === 'p' || e.key === 'P')) { e.preventDefault(); run(); }
    if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); run(); }
  });
  const run = () => {
    const c = current();
    if (!c) return;
    const r = /\.py$/i.test(c.name) ? runPython(app.ctx, c.body) : runScript(app.ctx, c.body);
    for (const line of r.output) app.log(line, 'info');
    if (r.ok) app.log(t(`Ran ${c.name}`, `${c.name} 실행 완료`), 'report');
    else { app.log(r.error, 'error'); app.status(r.error, true); }
    app.invalidate();
  };
  const load = () => { ensure(); const c = current(); if (editor.ownerDocument.activeElement !== editor) { editor.value = c?.body ?? ''; numbers(); } };
  load();
  let pick = null;
  const syncPick = () => {
    if (!pick) return;
    pick.replaceChildren(select({ value: state.textId, options: app.doc.texts.map((x) => [x.id, x.name]), testid: 'text-pick', onChange: (v) => { state.textId = v; editor.blur(); load(); } }));
  };
  return {
    update() { load(); syncPick(); },
    header(hdr) {
      pick = h('span', {});
      hdr.append(pick,
        h('button', { type: 'button', className: 'hdr-btn', title: t('New text', '새 텍스트'), dataset: { testid: 'text-new' }, onClick: () => { const n = { id: newId('txt'), name: `script${app.doc.texts.length + 1}.py`, body: '' }; app.doc.texts.push(n); state.textId = n.id; editor.blur(); load(); syncPick(); } }, icon('new', 13), 'Py'),
        h('button', { type: 'button', className: 'hdr-btn', title: t('New JavaScript text', '새 JavaScript 텍스트'), dataset: { testid: 'text-new-js' }, onClick: () => { const n = { id: newId('txt'), name: `script${app.doc.texts.length + 1}.js`, body: SAMPLE_JS }; app.doc.texts.push(n); state.textId = n.id; editor.blur(); load(); syncPick(); } }, icon('new', 13), 'JS'),
        h('span', { className: 'hdr-fill' }),
        h('button', { type: 'button', className: 'hdr-btn', title: t('Run script (Ctrl+Enter)', '스크립트 실행 (Ctrl+Enter)'), dataset: { testid: 'text-run' }, onClick: run }, icon('run', 13), t('Run', '실행')));
      syncPick();
    },
    dispose() { root.remove(); },
    api: { run, setText: (body, name) => { const c = current(); if (c) { c.body = body; if (name) c.name = name; } editor.value = body; numbers(); } },
  };
}

// ─────────────── Console

export function createConsole(app, el) {
  const log = h('div', { className: 'console-log', dataset: { testid: 'console-log' } });
  const input = h('input', { spellcheck: false, dataset: { testid: 'console-input' }, placeholder: 'bpy.data.objects.length' });
  const root = h('div', { className: 'console', dataset: { testid: 'console' } }, log, h('div', { className: 'console-input' }, h('span', { style: { color: 'var(--accent)' } }, '>>>'), input));
  el.append(root);
  const add = (text, kind) => { log.append(h('div', { className: `log-line ${kind}` }, text)); log.scrollTop = log.scrollHeight; };
  add(t('Python console. Try: bpy.ops.mesh.primitive_torus_add()', 'Python 콘솔입니다. 예: bpy.ops.mesh.primitive_torus_add()'), 'report');
  const python = createPythonConsole(app.ctx);
  let language = 'PYTHON';
  const history = [];
  let index = -1;
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      const line = input.value;
      if (!line.trim()) return;
      add(`>>> ${line}`, 'input');
      history.unshift(line);
      index = -1;
      input.value = '';
      const r = language === 'PYTHON' ? python.run(line) : runConsoleLine(app.ctx, line);
      for (const o of r.output) add(o, 'info');
      if (!r.ok) add(r.error, 'error');
      app.ctx.history?.push(app.doc, 'Console');
      app.invalidate();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (index < history.length - 1) input.value = history[++index];
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      index = Math.max(-1, index - 1);
      input.value = index >= 0 ? history[index] : '';
    }
  });
  return {
    update() {},
    header(hdr) { hdr.append(select({ value: language, options: [['PYTHON', 'Python'], ['JAVASCRIPT', 'JavaScript']], testid: 'console-language', onChange: (v) => { language = v; } })); },
    dispose() { root.remove(); },
  };
}

// ─────────────── Info log

export function createInfo(app, el) {
  const root = h('div', { className: 'scroll-y', dataset: { testid: 'info-log' } });
  el.append(root);
  let shown = -1;
  const update = () => {
    if (app.logLines.length === shown) return;
    shown = app.logLines.length;
    root.replaceChildren(...app.logLines.slice(-500).map((l) => h('div', { className: `log-line ${l.kind}` }, l.text)));
    root.scrollTop = root.scrollHeight;
  };
  update();
  return { update, dispose() { root.remove(); } };
}

// ─────────────── Spreadsheet

export function createSpreadsheet(app, el, area) {
  const state = area.state ??= { domain: 'VERTEX', evaluated: true };
  const root = h('div', { className: 'scroll-y', dataset: { testid: 'spreadsheet' } });
  el.append(root);
  const MAX = 2000;
  const update = () => {
    const obj = activeObject(app.doc);
    if (!obj || !GEOMETRY_TYPES.has(obj.type)) { root.replaceChildren(emptyNote(t('Select an object with geometry', '지오메트리가 있는 오브젝트를 선택하세요'))); return; }
    const mesh = state.evaluated ? evaluatedMesh(app.doc, obj) : obj.data;
    if (!mesh) { root.replaceChildren(emptyNote(t('No data', '데이터 없음'))); return; }
    let head;
    let rows;
    const fmt = (x) => (typeof x === 'number' ? Number(x.toFixed(3)) : x);
    if (state.domain === 'VERTEX') {
      head = ['', 'x', 'y', 'z'];
      rows = mesh.verts.slice(0, MAX).map((v, i) => [i, fmt(v[0]), fmt(v[1]), fmt(v[2])]);
    } else {
      head = ['', t('corners', '코너 수'), t('vertices', '꼭짓점'), t('material', '재질')];
      rows = mesh.faces.slice(0, MAX).map((f, i) => [i, f.length, f.join(' '), mesh.faceMat?.[i] ?? 0]);
    }
    const total = state.domain === 'VERTEX' ? mesh.verts.length : mesh.faces.length;
    const table = h('table', { className: 'sheet' },
      h('thead', null, h('tr', null, head.map((c) => h('th', null, c)))),
      h('tbody', null, rows.map((r) => h('tr', null, r.map((c) => h('td', null, c))))));
    root.replaceChildren(table, total > MAX ? emptyNote(t(`Showing ${MAX} of ${total} rows`, `${total}행 중 ${MAX}행 표시`)) : h('span'));
    root.dataset.rows = String(total);
  };
  update();
  return {
    update,
    header(hdr) {
      hdr.append(
        select({ value: state.domain, options: [['VERTEX', t('Vertices', '꼭짓점')], ['FACE', t('Faces', '면')]], testid: 'sheet-domain', onChange: (v) => { state.domain = v; update(); } }),
        select({ value: state.evaluated ? 'E' : 'O', options: [['E', t('Evaluated', '평가 결과')], ['O', t('Original', '원본')]], testid: 'sheet-source', onChange: (v) => { state.evaluated = v === 'E'; update(); } }),
      );
    },
    dispose() { root.remove(); },
  };
}
