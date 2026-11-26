// The helpers the guide's screenshots (make-guide-images.mjs) and the tutorial video (make-tutorial-video.mjs)
// install in the page as window.__g. installHelpers is serialised with toString() and run in the page, so it
// must not use anything from this module's scope.
// ───────────────────────── helpers that run in the page (window.__g)

export function installHelpers(lang) {
  const m = window.__mymechanics;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const T = (ko, en) => (lang === 'en' ? en : ko);
  const rectOf = (target) => {
    if (!target) return null;
    if (typeof target === 'object' && 'x' in target && 'w' in target) return target;
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width || r.height ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
  };
  const layer = () => {
    let d = document.getElementById('guide-overlay');
    if (!d) {
      d = document.createElement('div');
      d.id = 'guide-overlay';
      d.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;font:600 13px "Segoe UI","Malgun Gothic",sans-serif';
      document.body.append(d);
    }
    return d;
  };
  const g = {
    m, T, sleep, rectOf,
    clear() { document.getElementById('guide-overlay')?.remove(); },
    /** A red frame round `target` with a numbered badge and a label: opts { pad, at: 'tl'|'tr'|'bl'|'br'|'in', color }. */
    mark(target, n, label, opts = {}) {
      const r = rectOf(target);
      if (!r) return;
      const pad = opts.pad ?? 2;
      const color = opts.color ?? '#e11d48';
      const d = layer();
      const box = document.createElement('div');
      box.style.cssText = `position:fixed;left:${r.x - pad}px;top:${r.y - pad}px;width:${r.w + 2 * pad}px;height:${r.h + 2 * pad}px;border:3px solid ${color};border-radius:6px;box-sizing:border-box;box-shadow:0 0 0 1px rgba(255,255,255,.7)`;
      d.append(box);
      if (n == null && !label) return;
      const tag = document.createElement('div');
      tag.style.cssText = `position:fixed;display:flex;align-items:center;gap:6px;white-space:nowrap;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))`;
      if (n != null) tag.innerHTML += `<span style="display:inline-grid;place-items:center;width:24px;height:24px;border-radius:50%;background:${color};color:#fff;border:2px solid #fff;font-size:13px">${n}</span>`;
      if (label) tag.innerHTML += `<span style="padding:2px 8px;border-radius:5px;background:${color};color:#fff">${label}</span>`;
      d.append(tag);
      const tw = tag.offsetWidth; const th = tag.offsetHeight;
      const at = opts.at ?? 'tl';
      let x = r.x + 4; let y = r.y + 4;
      if (at === 'tr') x = r.x + r.w - tw - 4;
      if (at === 'bl') y = r.y + r.h - th - 4;
      if (at === 'br') { x = r.x + r.w - tw - 4; y = r.y + r.h - th - 4; }
      if (at === 'above') y = r.y - th - 6;
      if (at === 'below') y = r.y + r.h + 6;
      if (at === 'right') { x = r.x + r.w + 8; y = r.y + r.h / 2 - th / 2; }
      if (at === 'left') { x = r.x - tw - 8; y = r.y + r.h / 2 - th / 2; }
      if (opts.dx) x += opts.dx;
      if (opts.dy) y += opts.dy;
      tag.style.left = `${Math.max(2, Math.min(innerWidth - tw - 2, x))}px`;
      tag.style.top = `${Math.max(2, Math.min(innerHeight - th - 2, y))}px`;
    },
    /** The area around several targets (for smoke-web's "clip"). */
    clip(targets, pad = 6) {
      const rs = targets.map(rectOf).filter(Boolean);
      if (!rs.length) return null;
      const x0 = Math.max(0, Math.min(...rs.map((r) => r.x)) - pad); const y0 = Math.max(0, Math.min(...rs.map((r) => r.y)) - pad);
      const x1 = Math.min(innerWidth, Math.max(...rs.map((r) => r.x + r.w)) + pad); const y1 = Math.min(innerHeight, Math.max(...rs.map((r) => r.y + r.h)) + pad);
      return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
    },
    /** The bounding box of every element matching `selector` (inside `within`). */
    union(selector, within = document) {
      const rs = [...within.querySelectorAll(selector)].map(rectOf).filter(Boolean);
      if (!rs.length) return null;
      const x0 = Math.min(...rs.map((r) => r.x)); const y0 = Math.min(...rs.map((r) => r.y));
      return { x: x0, y: y0, w: Math.max(...rs.map((r) => r.x + r.w)) - x0, h: Math.max(...rs.map((r) => r.y + r.h)) - y0 };
    },
    /** A view-relative rectangle (graphics area pixels) → page rectangle. */
    inView(x, y, w, h) { const r = rectOf('#view-host'); return { x: r.x + (x < 0 ? r.w + x : x), y: r.y + (y < 0 ? r.h + y : y), w, h }; },
    /** The screen point of a model point. */
    toPage(p) { const vp = m.viewport; const r = vp.canvas.getBoundingClientRect(); const s = vp.toScreen(p); return { x: s.x + r.left, y: s.y + r.top }; },
    async settle(ms = 500) { await sleep(ms); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); },
    async fit() { await m.run('zoomFit'); await g.settle(400); },
    async view(name) { await m.run(`view:${name}`); await g.settle(500); },
    async reset() {
      g.clear();
      try { await m.popups.closeAll(); } catch { /* none open */ }
      if (m.state.editing) m.actions.cancelEditing({ quiet: true });
      if (m.state.draftAnalysis) await m.run('draftAnalysis');
      await m.actions.closeProject({ force: true });
      await g.settle(200);
    },
    // (the sample's own documents: the scenes work on its part or assembly, not on its motion stage)
    async sample(id, { stage = false } = {}) { await g.reset(); await m.actions.openSampleAsk(id, { stage }); await g.settle(900); },
    async newPart() { await g.reset(); await m.actions.newDocument('part'); await g.settle(400); },
    /** A sketch added straight to the active part (entities in sketch coordinates). */
    sketch(plane, ents, name) {
      const part = m.active();
      const id = `sk${Math.random().toString(36).slice(2, 8)}`;
      m.actions.change('op.addSketch', () => { part.features.push({ id, type: 'sketch', name: name || `S${part.features.length}`, plane, entities: [{ id: 'O', type: 'point', x: 0, y: 0, fixed: true, origin: true }, ...ents], constraints: [] }); });
      return id;
    },
    rect(x0, y0, x1, y1, p = 'r') {
      return [{ id: `${p}a`, type: 'point', x: x0, y: y0 }, { id: `${p}b`, type: 'point', x: x1, y: y0 }, { id: `${p}c`, type: 'point', x: x1, y: y1 }, { id: `${p}d`, type: 'point', x: x0, y: y1 },
        { id: `${p}1`, type: 'line', p1: `${p}a`, p2: `${p}b` }, { id: `${p}2`, type: 'line', p1: `${p}b`, p2: `${p}c` }, { id: `${p}3`, type: 'line', p1: `${p}c`, p2: `${p}d` }, { id: `${p}4`, type: 'line', p1: `${p}d`, p2: `${p}a` }];
    },
    /** Clicks edges of the body in the graphics area (as the user does while a feature picks edges). */
    pickEdges(filter) {
      const vp = m.viewport; const r = vp.canvas.getBoundingClientRect();
      let n = 0;
      for (const ed of m.state.partEntry.edgeList.filter(filter)) {
        const p = ed.pointAt(0.5); const s = vp.toScreen([p.x, p.y, p.z]);
        const hit = vp.pick(s.x + r.left, s.y + r.top, { kinds: ['edge'] });
        if (hit) { vp.options.onPick(hit, { clientX: s.x + r.left, clientY: s.y + r.top }); n++; }
      }
      return n;
    },
    /** Clicks a model point (a face under it). */
    clickAt(p, kinds) {
      const vp = m.viewport; const r = vp.canvas.getBoundingClientRect(); const s = vp.toScreen(p);
      const hit = vp.pick(s.x + r.left, s.y + r.top, kinds ? { kinds } : undefined);
      if (hit) vp.options.onPick(hit, { clientX: s.x + r.left, clientY: s.y + r.top });
      return Boolean(hit);
    },
    faceIndex(score) { const faces = m.state.partEntry.faces; let best = -1; let bv = -Infinity; faces.forEach((f, i) => { const v = score(f.center, f); if (v > bv) { bv = v; best = i; } }); return best; },
    featureOf(type, nth = 0) { return m.active().features.filter((f) => f.type === type)[nth]; },
    treeRow(text) { return [...document.querySelectorAll('#left-panel .tree-row')].find((row) => row.textContent.includes(text)); },
    pm: () => document.querySelector('#left-panel'),
    /** Shows a CommandManager tab ('features', 'sketch', 'sheetMetal', 'evaluate', 'assembly', …). */
    async cm(tab) { document.querySelector(`#palette-host [data-cm-tab="${tab}"]`)?.click(); await g.settle(250); },
    cmd: (id) => document.querySelector(`#palette-host [data-command="${id}"]`),
    /** The tree row of a feature. */
    featureRow(f) { return f ? g.treeRow(f.name) : null; },
    /** Scrolls the PropertyManager to its end (results). */
    async pmEnd() { for (const el of document.querySelectorAll('#left-panel .panel-body, #left-panel .pm-body, #left-panel')) el.scrollTop = el.scrollHeight; await g.settle(200); },
    /** A beam fixed at one end and loaded at the other, with the simulation PropertyManager open. */
    async cantilever() {
      const g = this;
      const { m } = g;
      await g.newPart();
      const part = m.active();
      const s = g.sketch({ kind: 'std', name: 'front' }, [...g.rect(0, 0, 120, 12), { id: 'hc', type: 'point', x: 90, y: 6 }], g.T('보', 'Beam'));
      m.actions.change('op.addFeature', () => { part.features.push({ id: 'ex1', type: 'extrude', name: g.T('보스-돌출1', 'Boss-Extrude1'), sketch: s, op: 'boss', end: 'blind', depth: 24, reverse: false, end2: 'none', depth2: 10 }); });
      await g.settle(800); await g.view('iso'); await g.fit(); await g.cm('evaluate');
      await m.run('simulation'); await g.settle(300);
      const e = m.state.editing; const entry = m.state.partEntry;
      const faces = entry.faces.map((f, i) => ({ i, f, c: f.center }));
      const fix = faces.reduce((a, b) => (b.c.x < a.c.x ? b : a)); const load = faces.reduce((a, b) => (b.c.x > a.c.x ? b : a));
      return { e, fix, load };
    },
  };
  window.__g = g;
  return 'helpers';
}
