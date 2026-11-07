// The animation editors share one drawing surface: Timeline, Dope Sheet, Graph Editor (with Drivers) and NLA.
import {
  FCURVE_MODIFIERS, HANDLE_TYPES, INTERPOLATIONS, autoHandles, evalFCurve, keyFrames, moveHandle, moveSelectedKeys, pathGroupName, pathLabel, selectInBox, stripActionRange,
} from '../../core/anim.js';
import { activeObject, selectedObjects } from '../../core/doc.js';
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { enumName, t } from '../i18n.js';
import { menuTitle, openMenu } from '../menus.js';
import { button, numField, row, select, sidePanel, textField, toggle } from '../widgets.js';

const css = (el, name) => getComputedStyle(el).getPropertyValue(name).trim();
const CURVE_COLORS = ['#e8596a', '#8cc63f', '#4f9cf0', '#e8b83c', '#c77de0', '#4fd0c0'];
const ROW = 18;

function createAnimEditor(app, el, area, kind) {
  const state = area.state ??= { start: 0, end: 260, vMin: -5, vMax: 5 };
  state.collapsed ??= {};
  state.mode ??= 'FCURVES';
  const root = h('div', { className: 'timeline', dataset: { testid: `editor-${kind}` } });
  const holder = h('div', { className: 'anim-canvas' });
  const canvas = h('canvas', { dataset: { testid: `${kind}-canvas` } });
  holder.append(canvas);
  const panelBody = h('div', { className: 'anim-side', dataset: { testid: `${kind}-side` } });
  const hasPanel = kind === 'graph' || kind === 'nla';
  root.append(h('div', { className: 'anim-row' }, holder, hasPanel ? sidePanel({ id: `${kind}-panel`, side: 'right', icon: kind === 'nla' ? 'ed-nla' : 'ed-graph', title: () => (kind === 'nla' ? t('Strip', '스트립') : t('F-Curve', 'F-커브')), body: panelBody, store: state, onChange: () => { redraw(); } }) : null));
  el.append(root);
  const showChannels = kind !== 'timeline';
  const channelsEl = showChannels ? h('div', { className: 'channels', dataset: { testid: `${kind}-channels` } }) : null;
  if (channelsEl) holder.append(channelsEl);
  const left = showChannels ? 170 : 0;
  const rulerH = 20;
  const drivers = () => kind === 'graph' && state.mode === 'DRIVERS';

  /** The rows of channels this editor shows, as a tree: object, then a group per property, then a curve per component. */
  const channels = () => {
    const doc = app.doc;
    const list = [];
    for (const obj of selectedObjects(doc)) {
      if (kind === 'nla') {
        list.push({ label: obj.name, level: 0, group: true, target: obj });
        (obj.anim?.nla ?? []).forEach((s, index) => list.push({ label: s.name, level: 1, target: obj, strip: s, index }));
        continue;
      }
      if (drivers()) {
        if (!obj.drivers?.length) continue;
        list.push({ label: obj.name, level: 0, group: true, target: obj });
        obj.drivers.forEach((d, index) => list.push({ label: pathLabel(d.path), title: d.path, level: 1, target: obj, driver: d, index }));
        continue;
      }
      const curves = Object.entries(obj.anim?.fcurves ?? {});
      if (!curves.length) continue;
      list.push({ label: obj.name, level: 0, group: true, target: obj, curves: curves.map(([, k]) => k) });
      const groups = new Map();
      for (const [path, keys] of curves) {
        const name = pathGroupName(path);
        if (!groups.has(name)) groups.set(name, []);
        groups.get(name).push([path, keys]);
      }
      for (const [name, members] of groups) {
        const key = `${obj.id}:${name}`;
        const closed = Boolean(state.collapsed[key]);
        list.push({ label: name, level: 1, group: true, foldKey: key, closed, target: obj, curves: members.map(([, k]) => k) });
        if (!closed) for (const [path, keys] of members) list.push({ label: pathLabel(path), title: path, level: 2, target: obj, path, keys });
      }
    }
    return list;
  };
  const allCurves = () => channels().filter((c) => c.keys);

  const frameX = (f, w) => left + ((f - state.start) / (state.end - state.start)) * (w - left);
  const xFrame = (x, w) => state.start + ((x - left) / (w - left)) * (state.end - state.start);
  const valueY = (v, H) => rulerH + (1 - (v - state.vMin) / (state.vMax - state.vMin)) * (H - rulerH);
  const yValue = (y, H) => state.vMin + (1 - (y - rulerH) / (H - rulerH)) * (state.vMax - state.vMin);

  const niceStep = (span, pixels, minPx = 60) => {
    const raw = (span / pixels) * minPx;
    const pow = 10 ** Math.floor(Math.log10(raw));
    for (const m of [1, 2, 5, 10]) if (m * pow >= raw) return m * pow;
    return 10 * pow;
  };

  const isActive = (c) => state.activePath === c.path && state.activeObject === c.target.id;
  let dirty = true;
  const draw = () => {
    dirty = false;
    const r = holder.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const [w, H] = [Math.max(1, r.width), Math.max(1, r.height)];
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(H * dpr); }
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const [bg, line, text, muted, accent] = ['--panel', '--line', '--text', '--muted', '--accent'].map((n) => css(root, n));
    g.fillStyle = bg;
    g.fillRect(0, 0, w, H);
    const doc = app.doc;
    // Outside the frame range is darker.
    g.fillStyle = 'rgba(0,0,0,.18)';
    const [fs, fe] = [frameX(doc.frameStart, w), frameX(doc.frameEnd, w)];
    if (fs > left) g.fillRect(left, 0, fs - left, H);
    if (fe < w) g.fillRect(fe, 0, w - fe, H);
    // Ruler and vertical grid.
    const step = niceStep(state.end - state.start, w - left);
    g.font = '10px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let f = Math.ceil(state.start / step) * step; f <= state.end; f += step) {
      const x = frameX(f, w);
      g.strokeStyle = line;
      g.globalAlpha = 0.6;
      g.beginPath(); g.moveTo(x + 0.5, rulerH); g.lineTo(x + 0.5, H); g.stroke();
      g.globalAlpha = 1;
      g.fillStyle = muted;
      g.fillText(String(Math.round(f)), x, rulerH / 2);
    }
    g.fillStyle = 'rgba(0,0,0,.15)';
    g.fillRect(left, 0, w - left, rulerH);
    const list = channels();
    const objects = selectedObjects(doc);
    if (kind === 'timeline') {
      const frames = new Set();
      for (const o of objects) for (const f of keyFrames(o)) frames.add(f);
      for (const f of frames) diamond(g, frameX(f, w), (H + rulerH) / 2, 5, accent);
    } else if (kind === 'dopesheet') {
      list.forEach((c, i) => {
        const y = rulerH + i * ROW + ROW / 2;
        if (i % 2) { g.fillStyle = 'rgba(255,255,255,.025)'; g.fillRect(left, y - ROW / 2, w - left, ROW); }
        const curves = c.curves ?? [c.keys];
        const seen = new Map();
        for (const keys of curves) for (const k of keys) seen.set(k.f, Boolean(seen.get(k.f)) || Boolean(k.sel));
        for (const [f, selected] of seen) diamond(g, frameX(f, w), y, c.group ? 5 : 4, selected ? accent : c.group ? muted : text);
      });
    } else if (kind === 'graph' && !drivers()) {
      // Horizontal grid.
      const vStep = niceStep(state.vMax - state.vMin, H - rulerH, 40);
      g.textAlign = 'left';
      for (let v = Math.ceil(state.vMin / vStep) * vStep; v <= state.vMax; v += vStep) {
        const y = valueY(v, H);
        g.strokeStyle = line;
        g.globalAlpha = v === 0 ? 1 : 0.5;
        g.beginPath(); g.moveTo(left, y + 0.5); g.lineTo(w, y + 0.5); g.stroke();
        g.globalAlpha = 1;
        g.fillStyle = muted;
        g.fillText(String(Number(v.toFixed(3))), left + 4, y - 6);
      }
      let colorIndex = 0;
      for (const c of list) {
        if (!c.keys) continue;
        const color = CURVE_COLORS[(colorIndex++) % CURVE_COLORS.length];
        g.strokeStyle = color;
        g.lineWidth = isActive(c) ? 2.2 : 1.4;
        g.beginPath();
        for (let px = left; px <= w; px += 2) {
          const value = evalFCurve(c.target.anim, c.path, xFrame(px, w));
          const y = valueY(value, H);
          if (px === left) g.moveTo(px, y); else g.lineTo(px, y);
        }
        g.stroke();
        g.lineWidth = 1;
        for (const k of c.keys) {
          const [x, y] = [frameX(k.f, w), valueY(k.v, H)];
          if (k.sel && k.hl && k.hr && (k.interp ?? 'BEZIER') === 'BEZIER') {
            g.strokeStyle = 'rgba(255,255,255,.55)';
            g.beginPath();
            g.moveTo(frameX(k.hl[0], w), valueY(k.hl[1], H));
            g.lineTo(x, y);
            g.lineTo(frameX(k.hr[0], w), valueY(k.hr[1], H));
            g.stroke();
            for (const hd of [k.hl, k.hr]) {
              g.fillStyle = '#fff';
              g.beginPath(); g.arc(frameX(hd[0], w), valueY(hd[1], H), 3, 0, Math.PI * 2); g.fill();
            }
          }
          diamond(g, x, y, k.sel ? 5 : 3.5, k.sel ? accent : color);
        }
      }
    } else if (kind === 'nla') {
      list.forEach((c, i) => {
        const y = rulerH + i * ROW;
        if (c.group) { g.fillStyle = 'rgba(255,255,255,.04)'; g.fillRect(left, y, w - left, ROW); return; }
        const [x0, x1] = [frameX(c.strip.start, w), frameX(c.strip.end, w)];
        const transition = c.strip.type === 'TRANSITION';
        g.fillStyle = c.strip.mute ? '#666' : transition ? '#6b8fc7' : accent;
        g.globalAlpha = state.activeStrip === c.index && state.activeObject === c.target.id ? 1 : 0.7;
        g.fillRect(x0, y + 2, Math.max(2, x1 - x0), ROW - 4);
        g.globalAlpha = 1;
        // Blend in and out as slopes on the strip.
        if (c.strip.blendIn || c.strip.blendOut) {
          g.strokeStyle = '#111';
          g.beginPath();
          g.moveTo(x0, y + ROW - 2);
          g.lineTo(frameX(c.strip.start + (c.strip.blendIn ?? 0), w), y + 2);
          g.lineTo(frameX(c.strip.end - (c.strip.blendOut ?? 0), w), y + 2);
          g.lineTo(x1, y + ROW - 2);
          g.stroke();
        }
        g.fillStyle = '#111';
        g.textAlign = 'left';
        g.fillText(c.strip.name, x0 + 4, y + ROW / 2);
      });
    }
    // The box being drawn.
    if (drag?.kind === 'box' && drag.moved) {
      g.strokeStyle = accent;
      g.fillStyle = 'rgba(255,255,255,.06)';
      g.beginPath(); g.rect(drag.x, drag.y, drag.px - drag.x, drag.py - drag.y); g.fill(); g.stroke();
    }
    // Markers.
    g.textAlign = 'left';
    for (const m of doc.markers) {
      const x = frameX(m.frame, w);
      g.fillStyle = text;
      g.beginPath(); g.moveTo(x, H - 2); g.lineTo(x - 4, H - 8); g.lineTo(x + 4, H - 8); g.fill();
      g.fillText(m.name, x + 6, H - 7);
    }
    // Playhead.
    const px = frameX(doc.frame, w);
    g.strokeStyle = accent;
    g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(px, rulerH); g.lineTo(px, H); g.stroke();
    g.lineWidth = 1;
    g.fillStyle = accent;
    const label = String(doc.frame);
    const tw = Math.max(24, g.measureText(label).width + 8);
    g.fillRect(px - tw / 2, 1, tw, rulerH - 2);
    g.fillStyle = '#111';
    g.textAlign = 'center';
    g.fillText(label, px, rulerH / 2);
    if (channelsEl) drawChannels(list);
    if (hasPanel) syncPanel();
  };
  const diamond = (g, x, y, r, color) => {
    g.fillStyle = color;
    g.strokeStyle = 'rgba(0,0,0,.6)';
    g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath();
    g.fill(); g.stroke();
  };
  let channelKey = '';
  const drawChannels = (list) => {
    const key = JSON.stringify([list.map((c) => [c.label, c.level, c.closed, c.group ? 1 : 0, c.path, c.index]), state.activePath, state.activeStrip, state.activeObject, app.language?.()]);
    if (key === channelKey) return;
    channelKey = key;
    channelsEl.replaceChildren(h('div', { style: { height: `${rulerH}px` } }), ...list.map((c) => h('div', {
      className: `channel level-${c.level}${c.group ? ' group' : ''}${isActive(c) && c.path ? ' on' : ''}`, title: c.title ?? c.label, dataset: { channel: c.path ?? c.label },
      onClick: () => {
        if (c.foldKey) { state.collapsed[c.foldKey] = !state.collapsed[c.foldKey]; redraw(); return; }
        if (c.path) { state.activePath = c.path; state.activeObject = c.target.id; redraw(); }
        if (c.driver) { state.activeDriver = c.index; state.activeObject = c.target.id; redraw(); }
        if (c.strip) { state.activeStrip = c.index; state.activeObject = c.target.id; redraw(); }
      },
    }, c.foldKey ? icon(c.closed ? 'right' : 'down', 9) : null, h('span', null, c.label))));
    if (!list.length) channelsEl.append(h('div', { className: 'empty-note' }, kind === 'nla' ? t('Select an object', '오브젝트를 선택하세요') : drivers() ? t('Select an object with a driver', '드라이버가 있는 오브젝트를 선택하세요') : t('Select a keyed object', '키가 있는 오브젝트를 선택하세요')));
  };

  const redraw = () => { dirty = true; app.requestFrame(); };
  const changed = (label) => { app.setFrame(app.doc.frame); app.commit(label); redraw(); panelKey = ''; };

  // ── Side panel
  let panelKey = '';
  const syncPanel = () => {
    if (app.widgetActive(panelBody)) return;
    const obj = app.doc.objects.find((o) => o.id === state.activeObject) ?? activeObject(app.doc);
    if (kind === 'nla') {
      const strip = obj?.anim?.nla?.[state.activeStrip];
      const key = JSON.stringify([kind, state.activeStrip, strip, obj?.id]);
      if (key === panelKey) return;
      panelKey = key;
      if (!strip) { panelBody.replaceChildren(h('div', { className: 'note-line' }, t('Click a strip', '스트립을 누르세요'))); return; }
      const field = (name, label, opts = {}) => row(label, numField({ value: strip[name] ?? opts.def ?? 0, step: opts.step ?? 1, min: opts.min, testid: `nla-${name}`, onChange: (v, final) => { strip[name] = v; if (name === 'scale' || name === 'repeat' || name === 'start') app.op('nla.strip_sync', { index: state.activeStrip }); if (final) changed(label); else app.touch(); } }));
      const items = [
        row(t('Name', '이름'), textField({ value: strip.name, testid: 'nla-name', onChange: (v) => { strip.name = v; changed(t('Name', '이름')); } })),
        field('start', t('Start', '시작')),
      ];
      if (strip.type !== 'TRANSITION') {
        const [from, to] = stripActionRange(strip);
        items.push(
          h('div', { className: 'note-line' }, `${t('Action', '액션')}: ${from} – ${to}`),
          field('scale', t('Scale', '크기'), { def: 1, step: 0.1, min: 0.01 }),
          field('repeat', t('Repeat', '반복'), { def: 1, step: 1, min: 1 }),
          field('influence', t('Influence', '영향'), { def: 1, step: 0.05, min: 0 }),
          field('blendIn', t('Blend In', '블렌드 인'), { step: 1, min: 0 }),
          field('blendOut', t('Blend Out', '블렌드 아웃'), { step: 1, min: 0 }),
          row(t('Blending', '블렌딩'), select({ value: strip.blend ?? 'REPLACE', options: ['REPLACE', 'ADD'], testid: 'nla-blend', onChange: (v) => { strip.blend = v; changed(t('Blending', '블렌딩')); } })),
          row(t('Hold', '유지'), select({ value: strip.extrapolate ?? 'NOTHING', options: ['NOTHING', 'HOLD', 'HOLD_FORWARD'], testid: 'nla-extrapolate', onChange: (v) => { strip.extrapolate = v; changed(t('Hold', '유지')); } })),
          toggle({ value: Boolean(strip.reverse), label: t('Reversed', '거꾸로'), testid: 'nla-reverse', onChange: (v) => { strip.reverse = v; changed(t('Reversed', '거꾸로')); } }),
        );
      } else items.push(field('end', t('End', '끝')));
      items.push(
        toggle({ value: Boolean(strip.mute), label: t('Muted', '음소거'), testid: 'nla-mute', onChange: (v) => { strip.mute = v; changed(t('Muted', '음소거')); } }),
        button(t('Add Transition to Next', '다음으로 전환 추가'), () => app.op('nla.transition_add', { index: state.activeStrip }), { className: 'block', testid: 'nla-transition' }),
        button(t('Split at Current Frame', '현재 프레임에서 나누기'), () => app.op('nla.split', { index: state.activeStrip }), { className: 'block', testid: 'nla-split' }),
        button(t('Delete Strip', '스트립 삭제'), () => { app.op('nla.delete', { index: state.activeStrip }); state.activeStrip = null; }, { className: 'block', testid: 'nla-delete' }),
      );
      panelBody.replaceChildren(...items);
      return;
    }
    if (drivers()) {
      const d = obj?.drivers?.[state.activeDriver];
      const key = JSON.stringify(['driver', state.activeDriver, d, obj?.id, app.doc.objects.length]);
      if (key === panelKey) return;
      panelKey = key;
      const addDriver = button(t('Add Driver', '드라이버 추가'), () => app.op('object.driver_add'), { icon: 'add', className: 'block', testid: 'driver-add' });
      if (!d) { panelBody.replaceChildren(h('div', { className: 'note-line' }, t('Click a driver', '드라이버를 누르세요')), obj ? addDriver : ''); return; }
      const objectOptions = [['', t('(none)', '(없음)')], ...app.doc.objects.map((o) => [o.id, o.name])];
      panelBody.replaceChildren(
        row(t('Property', '속성'), textField({ value: d.path, testid: 'driver-path', onChange: (v) => { d.path = v; changed(t('Driver', '드라이버')); } })),
        row(t('Type', '종류'), select({ value: d.type ?? 'SCRIPTED', options: ['SCRIPTED', 'AVERAGE', 'SUM', 'MIN', 'MAX'], testid: 'driver-type', onChange: (v) => { d.type = v; changed(t('Driver', '드라이버')); } })),
        (d.type ?? 'SCRIPTED') === 'SCRIPTED' ? row(t('Expression', '식'), textField({ value: d.expression, testid: 'driver-expression', onChange: (v) => { d.expression = v; changed(t('Driver', '드라이버')); } })) : '',
        d._error ? h('div', { className: 'driver-error', dataset: { testid: 'driver-error' } }, t('This expression cannot be used: only numbers, variables and maths functions.', '이 식은 쓸 수 없습니다: 숫자, 변수, 수학 함수만 됩니다.')) : '',
        h('div', { className: 'note-line' }, t('Variables', '변수')),
        ...(d.variables ?? []).map((v, i) => h('div', { className: 'driver-var', dataset: { testid: `driver-var-${i}` } },
          row(t('Name', '이름'), textField({ value: v.name, testid: `driver-var-name-${i}`, onChange: (x) => { v.name = x; changed(t('Driver', '드라이버')); } })),
          row(t('Object', '오브젝트'), select({ value: v.object ?? '', options: objectOptions, testid: `driver-var-object-${i}`, onChange: (x) => { v.object = x || null; changed(t('Driver', '드라이버')); } })),
          row(t('Path', '경로'), textField({ value: v.path, testid: `driver-var-path-${i}`, onChange: (x) => { v.path = x; changed(t('Driver', '드라이버')); } })),
          button(t('Remove', '제거'), () => { d.variables.splice(i, 1); changed(t('Driver', '드라이버')); }, { className: 'block' }))),
        button(t('Add Variable', '변수 추가'), () => { (d.variables ??= []).push({ name: `var${(d.variables?.length ?? 0) + 1}`, object: null, path: 'location.0' }); changed(t('Driver', '드라이버')); }, { icon: 'add', className: 'block', testid: 'driver-var-add' }),
        button(t('Delete Driver', '드라이버 삭제'), () => { obj.drivers.splice(state.activeDriver, 1); state.activeDriver = null; changed(t('Driver', '드라이버')); }, { className: 'block', testid: 'driver-delete' }),
        addDriver,
      );
      return;
    }
    const curve = state.activePath && obj?.anim?.fcurves?.[state.activePath] ? state.activePath : null;
    const key = JSON.stringify(['curve', curve, obj?.id, obj?.anim?.modifiers?.[curve], obj?.anim?.extrapolation?.[curve], curve && obj.anim.fcurves[curve].filter((k) => k.sel).map((k) => [k.f, k.handleType])]);
    if (key === panelKey) return;
    panelKey = key;
    if (!curve) { panelBody.replaceChildren(h('div', { className: 'note-line' }, t('Click a channel on the left', '왼쪽 채널을 누르세요'))); return; }
    const mods = obj.anim.modifiers?.[curve] ?? [];
    const selected = obj.anim.fcurves[curve].filter((k) => k.sel);
    panelBody.replaceChildren(
      h('div', { className: 'note-line' }, pathLabel(curve)),
      row(t('Extrapolation', '외삽'), select({ value: obj.anim.extrapolation?.[curve] ?? 'CONSTANT', options: ['CONSTANT', 'LINEAR'], testid: 'curve-extrapolation', onChange: (v) => { app.op('graph.extrapolation_set', { path: curve, type: v }); redraw(); } })),
      selected.length ? row(t('Handles', '핸들'), select({ value: selected[0].handleType ?? 'AUTO', options: HANDLE_TYPES, testid: 'curve-handle-type', onChange: (v) => { app.op('graph.handle_type', { type: v }); redraw(); } })) : '',
      selected.length ? row(t('Interpolation', '보간'), select({ value: selected[0].interp ?? 'BEZIER', options: INTERPOLATIONS, testid: 'curve-interp', onChange: (v) => { app.op('anim.interpolation_set', { type: v }); redraw(); } })) : '',
      h('div', { className: 'note-line' }, t('Modifiers', '모디파이어')),
      ...mods.map((m, i) => h('div', { className: 'fmod', dataset: { testid: `fmod-${i}` } },
        h('div', { className: 'fmod-head' }, h('strong', null, t(FCURVE_MODIFIERS[m.type].en, FCURVE_MODIFIERS[m.type].ko)), h('button', { type: 'button', className: 'icon-btn', title: t('Remove', '제거'), dataset: { testid: `fmod-remove-${i}` }, onClick: () => app.op('graph.modifier_remove', { path: curve, index: i }) }, icon('close', 12))),
        ...Object.entries(FCURVE_MODIFIERS[m.type].props).map(([name, def]) => (Array.isArray(def.options)
          ? row(name, select({ value: m[name] ?? def.def, options: def.options, testid: `fmod-${i}-${name}`, onChange: (v) => { m[name] = v; changed(t('F-Curve Modifier', 'F-커브 모디파이어')); } }))
          : Array.isArray(def.def)
            ? row(name, textField({ value: (m[name] ?? def.def).join(' '), testid: `fmod-${i}-${name}`, onChange: (v) => { m[name] = v.trim().split(/[\s,]+/).map(Number).filter(Number.isFinite); changed(t('F-Curve Modifier', 'F-커브 모디파이어')); } }))
            : row(name, numField({ value: m[name] ?? def.def, step: def.step ?? 0.1, min: def.min, testid: `fmod-${i}-${name}`, onChange: (v, final) => { m[name] = v; if (final) changed(t('F-Curve Modifier', 'F-커브 모디파이어')); else { app.setFrame(app.doc.frame); redraw(); } } })))))),
      row(t('Add', '추가'), select({ value: '', options: [['', t('Add Modifier...', '모디파이어 추가...')], ...Object.entries(FCURVE_MODIFIERS).map(([type, m]) => [type, t(m.en, m.ko)])], testid: 'fmod-add', onChange: (v) => { if (v) app.op('graph.modifier_add', { path: curve, type: v }); redraw(); } })),
    );
  };

  // ── Pointer
  let drag = null;
  const pos = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height }; };
  const scrub = (p) => { app.setFrame(Math.round(xFrame(p.x, p.w))); };
  const clearSelection = () => { for (const c of allCurves()) for (const k of c.keys) delete k.sel; };
  const hitHandle = (p) => {
    for (const c of channels()) {
      if (!c.keys) continue;
      for (const k of c.keys) {
        if (!k.sel || !k.hl) continue;
        for (const side of ['hl', 'hr']) if (Math.hypot(frameX(k[side][0], p.w) - p.x, valueY(k[side][1], p.h) - p.y) < 6) return { channel: c, key: k, side };
      }
    }
    return null;
  };
  const hitKey = (p) => {
    const list = channels();
    if (kind === 'graph') {
      for (const c of list) {
        if (!c.keys) continue;
        for (const k of c.keys) if (Math.hypot(frameX(k.f, p.w) - p.x, valueY(k.v, p.h) - p.y) < 7) return { channel: c, key: k };
      }
      return null;
    }
    const rowIndex = kind === 'timeline' ? 0 : Math.floor((p.y - rulerH) / ROW);
    const c = kind === 'timeline' ? null : list[rowIndex];
    if (kind !== 'timeline' && !c) return null;
    if (kind === 'nla') return null;
    const curves = kind === 'timeline' ? selectedObjects(app.doc).flatMap((o) => Object.values(o.anim?.fcurves ?? {})) : (c.curves ?? [c.keys]);
    let found = null;
    for (const keys of curves) for (const k of keys) if (Math.abs(frameX(k.f, p.w) - p.x) < 6) { (found ??= { frame: k.f, curves: [] }); if (k.f === found.frame) found.curves.push(keys); }
    return found;
  };
  const stripAt = (p) => {
    const c = channels()[Math.floor((p.y - rulerH) / ROW)];
    if (!c?.strip) return null;
    const f = xFrame(p.x, p.w);
    return f >= c.strip.start && f <= c.strip.end ? c : null;
  };
  canvas.addEventListener('pointerdown', (e) => {
    app.setActiveArea(area);
    const p = pos(e);
    canvas.setPointerCapture(e.pointerId);
    if (e.button === 1 || (e.button === 0 && e.altKey)) { drag = { kind: e.ctrlKey ? 'zoomv' : 'pan', x: p.x, y: p.y, start: state.start, end: state.end, vMin: state.vMin, vMax: state.vMax }; return; }
    if (e.button !== 0) return;
    if (p.y < rulerH) { drag = { kind: 'scrub' }; scrub(p); return; }
    if (kind === 'nla') {
      const c = stripAt(p);
      if (c) { state.activeStrip = c.index; state.activeObject = c.target.id; drag = { kind: 'strip', strip: c.strip, index: c.index, x: p.x, start: c.strip.start, span: c.strip.end - c.strip.start }; redraw(); return; }
      drag = { kind: 'scrub' };
      scrub(p);
      return;
    }
    if (kind === 'graph' && !drivers()) {
      const handle = hitHandle(p);
      if (handle) { drag = { kind: 'handle', ...handle }; return; }
    }
    if (drivers()) return;
    const hit = hitKey(p);
    if (hit?.key) {
      if (!e.shiftKey && !hit.key.sel) clearSelection();
      hit.key.sel = e.shiftKey ? !hit.key.sel : true;
      state.activePath = hit.channel.path;
      state.activeObject = hit.channel.target.id;
      drag = { kind: 'key', key: hit.key, channel: hit.channel, f: hit.key.f, v: hit.key.v, list: allCurves().flatMap((c) => c.keys.filter((k) => k.sel).map((k) => ({ k, keys: c.keys, f: k.f, v: k.v, hl: k.hl && [...k.hl], hr: k.hr && [...k.hr] }))) };
      redraw();
      return;
    }
    if (hit?.frame != null) {
      if (kind === 'timeline') { drag = { kind: 'keys', frame: hit.frame, curves: hit.curves, lastFrame: hit.frame }; return; }
      const already = hit.curves.every((keys) => keys.find((k) => k.f === hit.frame)?.sel);
      if (!e.shiftKey && !already) clearSelection();
      for (const keys of hit.curves) { const k = keys.find((q) => q.f === hit.frame); if (k) k.sel = true; }
      drag = { kind: 'selected', x: p.x, last: 0 };
      redraw();
      return;
    }
    if (kind === 'timeline') { drag = { kind: 'scrub' }; scrub(p); return; }
    // Empty space: a drag draws a box, a plain click moves the playhead.
    drag = { kind: 'box', x: p.x, y: p.y, px: p.x, py: p.y, moved: false, extend: e.shiftKey };
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = pos(e);
    if (drag.kind === 'scrub') scrub(p);
    else if (drag.kind === 'box') {
      drag.px = p.x;
      drag.py = p.y;
      if (Math.hypot(p.x - drag.x, p.y - drag.y) > 4) drag.moved = true;
      redraw();
    } else if (drag.kind === 'pan') {
      const span = state.end - state.start;
      const shift = ((drag.x - p.x) / (p.w - left)) * span;
      state.start = drag.start + shift;
      state.end = drag.end + shift;
      if (kind === 'graph') {
        const vs = ((p.y - drag.y) / (p.h - rulerH)) * (state.vMax - state.vMin);
        state.vMin = drag.vMin + vs;
        state.vMax = drag.vMax + vs;
      }
      redraw();
    } else if (drag.kind === 'zoomv') {
      const k = 1 + (p.y - drag.y) * 0.01;
      const mid = (drag.vMin + drag.vMax) / 2;
      const half = ((drag.vMax - drag.vMin) / 2) * Math.max(0.05, k);
      state.vMin = mid - half;
      state.vMax = mid + half;
      redraw();
    } else if (drag.kind === 'handle') {
      moveHandle(drag.channel.keys, drag.key, drag.side, [xFrame(p.x, p.w), yValue(p.y, p.h)]);
      drag.moved = true;
      app.setFrame(app.doc.frame);
      app.touch();
      redraw();
    } else if (drag.kind === 'key') {
      const f = Math.round(xFrame(p.x, p.w));
      const v = yValue(p.y, p.h);
      const [df, dv] = [f - drag.f, v - drag.v];
      // All that are selected go together, and the handles of hand-set keys with them.
      for (const item of drag.list) {
        item.k.f = item.f + df;
        item.k.v = item.v + dv;
        if (item.hl) item.k.hl = [item.hl[0] + df, item.hl[1] + dv];
        if (item.hr) item.k.hr = [item.hr[0] + df, item.hr[1] + dv];
      }
      drag.moved = true;
      for (const keys of new Set(drag.list.map((i) => i.keys))) { keys.sort((a, b) => a.f - b.f); autoHandles(keys); }
      app.touch();
      redraw();
    } else if (drag.kind === 'selected') {
      const offset = Math.round(((p.x - drag.x) / (p.w - left)) * (state.end - state.start));
      if (offset !== drag.last) {
        const delta = offset - drag.last;
        drag.last = offset;
        for (const obj of selectedObjects(app.doc)) moveSelectedKeys(obj, delta);
        drag.moved = true;
        app.touch();
        redraw();
      }
    } else if (drag.kind === 'strip') {
      const f = Math.round(drag.start + ((p.x - drag.x) / (p.w - left)) * (state.end - state.start));
      if (f !== drag.strip.start) { drag.strip.start = f; drag.strip.end = f + drag.span; drag.moved = true; app.touch(); redraw(); }
    } else if (drag.kind === 'keys') {
      const f = Math.round(xFrame(p.x, p.w));
      if (f !== drag.lastFrame) {
        for (const keys of drag.curves) {
          const k = keys.find((q) => q.f === drag.lastFrame);
          if (k) { k.f = f; keys.sort((a, b) => a.f - b.f); autoHandles(keys); }
        }
        drag.lastFrame = f;
        drag.moved = true;
        app.touch();
      }
    }
  });
  const end = (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.kind === 'box') {
      const p = pos(e);
      if (!d.moved) { clearSelection(); scrub(p); redraw(); return; }
      if (!d.extend) clearSelection();
      const [x0, x1] = [Math.min(d.x, d.px), Math.max(d.x, d.px)];
      const [y0, y1] = [Math.min(d.y, d.py), Math.max(d.y, d.py)];
      const box = { f0: xFrame(x0, p.w), f1: xFrame(x1, p.w) };
      if (kind === 'graph') {
        for (const c of allCurves()) selectInBox(c.keys, { ...box, v0: yValue(y1, p.h), v1: yValue(y0, p.h) });
      } else {
        channels().forEach((c, i) => {
          const y = rulerH + i * ROW + ROW / 2;
          if (y < y0 || y > y1) return;
          for (const keys of c.curves ?? [c.keys]) selectInBox(keys, box);
        });
      }
      redraw();
      return;
    }
    if (d.moved) { app.setFrame(app.doc.frame); app.commit(t('Move Keyframes', '키프레임 이동')); }
    redraw();
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', () => { drag = null; redraw(); });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const f = xFrame(e.clientX - r.left, r.width);
    const k = e.deltaY > 0 ? 1.15 : 1 / 1.15;
    state.start = f - (f - state.start) * k;
    state.end = f + (state.end - f) * k;
    redraw();
  }, { passive: false });
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    openMenu([
      { label: t('Insert Keyframe', '키프레임 삽입'), icon: 'keyframe', disabled: !app.canRun('anim.keyframe_insert'), onClick: () => app.op('anim.keyframe_insert') },
      { label: t('Delete Keyframes', '키프레임 삭제'), disabled: !app.canRun('anim.keyframe_delete'), onClick: () => app.op('anim.keyframe_delete') },
      { label: t('Duplicate Selected Keys', '선택 키 복제'), disabled: !app.canRun('action.duplicate'), onClick: () => app.op('action.duplicate', { offset: 10 }) },
      { label: t('Interpolation', '보간'), disabled: !app.canRun('anim.interpolation_set'), items: INTERPOLATIONS.map((type) => ({ label: enumName(type), onClick: () => app.op('anim.interpolation_set', { type }) })) },
      kind === 'graph' ? { label: t('Handle Type', '핸들 종류'), items: HANDLE_TYPES.map((type) => ({ label: enumName(type), testid: `handle-${type}`, onClick: () => app.op('graph.handle_type', { type }) })) } : null,
      null,
      { label: t('Add Marker', '마커 추가'), onClick: () => app.op('marker.add') },
      kind === 'nla' ? { label: t('Push Down Action', '액션 내려놓기'), disabled: !app.canRun('nla.push_down'), onClick: () => app.op('nla.push_down') } : null,
    ], e.clientX, e.clientY);
  });

  const frameFit = () => {
    const doc = app.doc;
    state.start = doc.frameStart - 10;
    state.end = doc.frameEnd + 10;
    if (kind === 'graph') {
      const values = channels().flatMap((c) => (c.keys ?? []).map((k) => k.v));
      if (values.length) {
        const [min, max] = [Math.min(...values), Math.max(...values)];
        const pad = Math.max(0.5, (max - min) * 0.15);
        state.vMin = min - pad;
        state.vMax = max + pad;
      }
    }
    redraw();
  };

  // ── Header
  const header = (hdr) => {
    const frameField = h('span', { className: 'frame-holder' });
    const startField = h('span', {});
    const endField = h('span', {});
    const playBtn = h('button', { type: 'button', className: 'hdr-btn', title: t('Play / pause (Space)', '재생/일시정지 (스페이스)'), dataset: { testid: `play-${kind}` }, onClick: () => app.togglePlay() }, icon(app.playing ? 'pause' : 'play', 13));
    const modeButtons = kind === 'graph' ? [['FCURVES', t('F-Curves', 'F-커브')], ['DRIVERS', t('Drivers', '드라이버')]].map(([mode, label]) => h('button', { type: 'button', className: `hdr-btn${state.mode === mode ? ' on' : ''}`, dataset: { testid: `graph-mode-${mode}` }, onClick: (e) => { state.mode = mode; panelKey = ''; channelKey = ''; for (const b of e.currentTarget.parentElement.querySelectorAll('[data-mode]')) b.classList.toggle('on', b.dataset.mode === mode); redraw(); }, }, label)) : [];
    modeButtons.forEach((b, i) => { b.dataset.mode = ['FCURVES', 'DRIVERS'][i]; });
    hdr.append(
      menuTitle(t('View', '뷰'), () => [{ label: t('Frame All', '전체 맞춤'), shortcut: 'Home', onClick: frameFit }], `menu-${kind}-view`),
      ...(kind === 'dopesheet' || kind === 'graph' ? [menuTitle(t('Select', '선택'), () => [
        { label: t('All', '전체'), shortcut: 'A', onClick: () => { for (const c of allCurves()) for (const k of c.keys) k.sel = true; redraw(); } },
        { label: t('None', '해제'), shortcut: 'Alt A', onClick: () => { clearSelection(); redraw(); } },
        { label: t('Invert', '반전'), shortcut: 'Ctrl I', onClick: () => { for (const c of allCurves()) for (const k of c.keys) k.sel = !k.sel; redraw(); } },
      ], `menu-${kind}-select`)] : []),
      menuTitle(t('Marker', '마커'), () => [{ label: t('Add Marker', '마커 추가'), onClick: () => app.op('marker.add') }, { label: t('Delete All Markers', '마커 모두 삭제'), disabled: !app.doc.markers.length, onClick: () => { app.doc.markers = []; app.changed('Delete Markers', true); } }], `menu-${kind}-marker`),
      ...(kind === 'nla' ? [h('button', { type: 'button', className: 'hdr-btn', dataset: { testid: 'nla-push' }, onClick: () => app.op('nla.push_down') }, t('Push Down', '내려놓기'))] : []),
      ...(modeButtons.length ? [h('span', { className: 'hdr-group' }, modeButtons)] : []),
      h('span', { className: 'hdr-fill' }),
      h('span', { className: 'hdr-group' },
        h('button', { type: 'button', className: 'hdr-btn', title: t('Jump to start', '처음으로'), onClick: () => app.setFrame(app.doc.frameStart) }, icon('first', 13)),
        h('button', { type: 'button', className: 'hdr-btn', title: t('Previous frame', '이전 프레임'), onClick: () => app.setFrame(app.doc.frame - 1) }, icon('prev', 13)),
        playBtn,
        h('button', { type: 'button', className: 'hdr-btn', title: t('Next frame', '다음 프레임'), onClick: () => app.setFrame(app.doc.frame + 1) }, icon('next', 13)),
        h('button', { type: 'button', className: 'hdr-btn', title: t('Jump to end', '끝으로'), onClick: () => app.setFrame(app.doc.frameEnd) }, icon('last', 13))),
      frameField,
      h('span', { className: 'hdr-fill' }),
      h('span', { className: 'hdr-label' }, t('Start', '시작')), startField,
      h('span', { className: 'hdr-label' }, t('End', '끝')), endField,
    );
    syncHeader = () => {
      const doc = app.doc;
      playBtn.replaceChildren(icon(app.playing ? 'pause' : 'play', 13));
      if (app.widgetActive(hdr)) return;
      frameField.replaceChildren(numField({ value: doc.frame, int: true, step: 1, testid: `frame-${kind}`, onChange: (v) => app.setFrame(v) }));
      startField.replaceChildren(numField({ value: doc.frameStart, int: true, step: 1, testid: `frame-start-${kind}`, onChange: (v, final) => { doc.frameStart = v; app.changed('Frame Start', final); } }));
      endField.replaceChildren(numField({ value: doc.frameEnd, int: true, step: 1, testid: `frame-end-${kind}`, onChange: (v, final) => { doc.frameEnd = v; app.changed('Frame End', final); } }));
    };
    syncHeader();
  };
  let syncHeader = () => {};
  const ro = new ResizeObserver(redraw);
  ro.observe(holder);
  return {
    header,
    update() { syncHeader(); channelKey = ''; redraw(); },
    frame() { if (dirty) draw(); },
    onKey(e) {
      const key = e.key.toLowerCase();
      if (e.key === 'Home') { frameFit(); return true; }
      if (key === 'a' && kind !== 'timeline' && kind !== 'nla') { for (const c of allCurves()) for (const k of c.keys) { if (e.altKey) delete k.sel; else k.sel = true; } redraw(); return true; }
      if (key === 'i' && e.ctrlKey && kind !== 'timeline' && kind !== 'nla') { for (const c of allCurves()) for (const k of c.keys) k.sel = !k.sel; redraw(); return true; }
      if (key === 'd' && e.shiftKey && app.canRun('action.duplicate')) { app.op('action.duplicate', { offset: 10 }); return true; }
      if (key === 'i' && !e.ctrlKey && app.canRun('anim.keyframe_insert')) { app.op('anim.keyframe_insert'); return true; }
      if ((key === 'x' || e.key === 'Delete') && kind !== 'timeline' && app.canRun('action.delete_selected')) { app.op('action.delete_selected'); return true; }
      if ((key === 'x' || e.key === 'Delete') && app.canRun('anim.keyframe_delete')) { app.op('anim.keyframe_delete'); return true; }
      if (key === 'm') { app.op('marker.add'); return true; }
      return false;
    },
    dispose() { ro.disconnect(); root.remove(); },
    api: { state, frameX: (f) => frameX(f, holder.getBoundingClientRect().width), valueY: (v) => valueY(v, holder.getBoundingClientRect().height), rowY: (i) => rulerH + i * ROW + ROW / 2 },
  };
}

export const createTimeline = (app, el, area) => createAnimEditor(app, el, area, 'timeline');
export const createDopeSheet = (app, el, area) => createAnimEditor(app, el, area, 'dopesheet');
export const createGraph = (app, el, area) => createAnimEditor(app, el, area, 'graph');
export const createNLA = (app, el, area) => createAnimEditor(app, el, area, 'nla');
export { activeObject };
