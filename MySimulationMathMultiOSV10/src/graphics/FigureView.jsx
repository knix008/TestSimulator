// One figure on screen: the painted canvas (2D + composited 3D axes), an
// overlay canvas (rulers, rubber band, data tips, ginput cross), the HTML ui
// controls on top, and every mouse interaction (wheel zoom, box zoom, pan,
// 3D orbit, data tips, light gizmo drag, ginput, ButtonDown callbacks).
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { paintFigure, groundHit, rulerMapperOf, drawTips } from './paint.js';
import { drawRulers, RULER } from './render2d.js';
import { rgbCss } from './theme.js';
import { lightOptionsFor } from './controller.js';
import { nearestPoint, zoomLimits, panLimits, fmtNum, lightsOf } from './scene.js';
import { tr } from './i18n.js';
import { UiLayer } from './UiLayer.jsx';

/**
 * A selection rectangle that reads on any plot colour: a light translucent
 * fill, a thin contrasting solid line under an accent dashed line, and an
 * optional size label next to it.
 */
function dashedRect(g, x, y, w, h, theme, label, { fill = true, strong = true } = {}) {
  g.save();
  if (fill) { g.fillStyle = rgbCss(theme.accent, 0.1); g.fillRect(x, y, w, h); }
  const X = Math.round(x) + 0.5, Y = Math.round(y) + 0.5, W = Math.round(w), H = Math.round(h);
  g.setLineDash([]);
  g.strokeStyle = theme.dark ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.9)';
  g.lineWidth = strong ? 3.5 : 2.5;
  g.strokeRect(X, Y, W, H);
  g.strokeStyle = rgbCss(theme.accent, strong ? 1 : 0.7);
  g.lineWidth = strong ? 1.6 : 1.1;
  g.setLineDash([6, 4]);
  g.strokeRect(X, Y, W, H);
  g.setLineDash([]);
  if (label) {
    g.font = '600 11px "Segoe UI", sans-serif';
    const tw = g.measureText(label).width + 10;
    const lx = X + W - tw, ly = Y + H + 4 + 18 < g.canvas.height / (window.devicePixelRatio || 1) ? Y + H + 4 : Y - 22;
    g.fillStyle = rgbCss(theme.accent, 0.95);
    g.fillRect(Math.max(X, lx), ly, tw, 18);
    g.fillStyle = theme.dark ? '#081018' : '#ffffff';
    g.textBaseline = 'middle'; g.textAlign = 'left';
    g.fillText(label, Math.max(X, lx) + 5, ly + 9.5);
  }
  g.restore();
}

const inBox = (b, x, y) => b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;

/** Layout item under figure point (fx, fy). */
function hitItem(layout, fx, fy) {
  if (!layout) return null;
  for (let i = layout.items.length - 1; i >= 0; i--) {
    const it = layout.items[i];
    if (it.kind === 'axes3d' && inBox(it.region, fx, fy)) return it;
    if ((it.kind === 'axes2d' || it.kind === 'heatmap' || it.kind === 'polar') && inBox(it.box, fx, fy)) return it;
  }
  for (let i = layout.items.length - 1; i >= 0; i--) { const it = layout.items[i]; if (it.kind !== 'layout' && inBox(it.outer, fx, fy)) return it; }
  return null;
}

export function FigureView({ ctl, fig, lang, theme, version, onMenu }) {
  const stage = useRef(null);
  const base = useRef(null);
  const over = useRef(null);
  const [size, setSize] = useState({ W: 0, H: 0 });
  const [status, setStatus] = useState('');
  const [ctrl, setCtrl] = useState(false);
  useEffect(() => {
    const on = (e) => setCtrl(!!(e.ctrlKey || e.metaKey));
    const off = () => setCtrl(false);
    window.addEventListener('keydown', on); window.addEventListener('keyup', on); window.addEventListener('blur', off);
    return () => { window.removeEventListener('keydown', on); window.removeEventListener('keyup', on); window.removeEventListener('blur', off); };
  }, []);
  const raf = useRef(0);
  const cursor = useRef(null);   // stage px
  const drag = useRef(null);
  const band = useRef(null);     // rubber band {x0,y0,x1,y1} in figure px
  const ox = ctl.rulers ? RULER : 0;
  const fw = Math.max(1, size.W - ox), fh = Math.max(1, size.H - ox);
  const mode = ctl.mode(fig.id);

  // ----- size
  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => { const r = el.getBoundingClientRect(); setSize((s) => (s.W === Math.round(r.width) && s.H === Math.round(r.height) ? s : { W: Math.round(r.width), H: Math.round(r.height) })); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { if (size.W > 0 && size.H > 0) ctl.reportSize(fig.id, fw, fh); }, [fig.id, fw, fh, size.W, size.H, ctl]);

  // ----- painting
  const drawOverlay = useCallback(() => {
    const c = over.current;
    if (!c || !size.W) return;
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(size.W * dpr) || c.height !== Math.round(size.H * dpr)) { c.width = Math.round(size.W * dpr); c.height = Math.round(size.H * dpr); }
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, size.W, size.H);
    const layout = ctl.layouts.get(fig.id);
    g.save();
    g.translate(ox, ox);
    // rubber band (box zoom, or the export region while it is being dragged — then with its size)
    if (band.current) {
      const b = band.current;
      const x = Math.min(b.x0, b.x1), y = Math.min(b.y0, b.y1), w = Math.abs(b.x1 - b.x0), h = Math.abs(b.y1 - b.y0);
      dashedRect(g, x, y, w, h, theme, ctl.exportDlg && ctl.exportDlg.picking === 'region' ? `${Math.round(w)} × ${Math.round(h)} px` : null);
    }
    // selected axes (several axes, or while exporting) and the export region
    if (layout && (ctl.exportDlg || layout.items.filter((x) => x.node && x.kind !== 'layout').length > 1)) {
      const t = ctl.targetAxes(fig.id);
      const it = t && layout.items.find((x) => x.node && x.node.id === t.id);
      if (it && (!ctl.exportDlg || ctl.exportOpts().target !== 'region')) {
        const o = it.outer;
        dashedRect(g, Math.round(o.x) + 1, Math.round(o.y) + 1, Math.round(o.w) - 3, Math.round(o.h) - 3, theme, null, { fill: false, strong: !!ctl.exportDlg });
      }
    }
    if (ctl.exportDlg && ctl.exportOpts().target === 'region' && ctl.exportRect && !band.current) {
      const r = ctl.exportRect;
      dashedRect(g, r.x, r.y, r.w, r.h, theme, `${Math.round(r.w)} × ${Math.round(r.h)} px`);
    }
    drawTips(g, layout, ctl.tips.get(fig.id), theme, fw);
    // ginput cross
    if (ctl.ginput && ctl.ginput.figId === fig.id) {
      for (const it of layout ? layout.items : []) {
        if (!it.mapper) continue;
        g.fillStyle = rgbCss(theme.accent);
        for (const p of ctl.ginput.points) { const X = it.mapper.x(p[0]), Y = it.mapper.y(p[1]); if (inBox(it.box, X, Y)) { g.beginPath(); g.arc(X, Y, 3.5, 0, Math.PI * 2); g.fill(); } }
      }
      if (cursor.current) {
        const { x, y } = cursor.current;
        g.strokeStyle = rgbCss(theme.accent, 0.8); g.lineWidth = 1;
        g.beginPath(); g.moveTo(0, y - ox + 0.5); g.lineTo(fw, y - ox + 0.5); g.moveTo(x - ox + 0.5, 0); g.lineTo(x - ox + 0.5, fh); g.stroke();
      }
    }
    g.restore();
    // rulers (data units of the axes under the cursor, else the target axes)
    if (ctl.rulers && layout) {
      const cur = cursor.current;
      let it = cur ? hitItem(layout, cur.x - ox, cur.y - ox) : null;
      if (!it || (it.kind !== 'axes2d' && it.kind !== 'axes3d')) { const t = ctl.targetAxes(fig.id); it = layout.items.find((x) => t && x.node && x.node.id === t.id && (x.kind === 'axes2d' || x.kind === 'axes3d')) || layout.items.find((x) => x.kind === 'axes2d' || x.kind === 'axes3d'); }
      drawRulers(g, size.W, size.H, rulerMapperOf(it, ox, ox), cur, theme, null);
    }
  }, [ctl, fig.id, ox, fw, fh, size.W, size.H, theme, lang]);

  const draw = useCallback(() => {
    raf.current = 0;
    const c = base.current;
    if (!c || !size.W || !size.H) return;
    const dpr = window.devicePixelRatio || 1;
    const W = Math.round(size.W * dpr), H = Math.round(size.H * dpr);
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, size.W, size.H);
    g.save();
    g.translate(ox, ox);
    let layout = null;
    try {
      layout = paintFigure(g, fig, fw, fh, {
        theme, views: ctl.views2d, grid5: ctl.grid, grid3d: ctl.grid, axesLines: ctl.axesLines, dpr, views3d: ctl.views3d, state3d: ctl.state3d,
        lightOpts: (ax) => lightOptionsFor(ax),
      });
    } catch (e) { console.error('figure paint', e); }
    g.restore();
    if (layout) ctl.layouts.set(fig.id, layout);
    drawOverlay();
  }, [ctl, fig, ox, fw, fh, size.W, size.H, theme, drawOverlay]);

  const schedule = useCallback(() => { if (!raf.current) raf.current = requestAnimationFrame(draw); }, [draw]);
  useLayoutEffect(() => { draw(); }, [draw, version]);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  // ----- coordinates
  const local = (e) => { const r = stage.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const dataAt = (it, fx, fy) => {
    if (!it) return null;
    if (it.kind === 'axes2d' && it.mapper) return [it.mapper.invX(fx), it.mapper.invY(fy), 0];
    if (it.kind === 'axes3d' && it.view) return groundHit(it.view, fx - it.region.x, fy - it.region.y);
    if (it.kind === 'polar' && it.polar) { const [th, r] = it.polar.inv(fx, fy); return [th, r, 0]; }
    return null;
  };
  const updateStatus = (fx, fy) => {
    const layout = ctl.layouts.get(fig.id);
    const it = hitItem(layout, fx, fy);
    const d = dataAt(it, fx, fy);
    setStatus(d ? (it.kind === 'polar' ? `θ ${fmtNum(d[0])}°  r ${fmtNum(d[1])}` : `x ${fmtNum(d[0])}   y ${fmtNum(d[1])}${it.kind === 'axes3d' ? `   z ${fmtNum(d[2])}` : ''}`) : '');
  };

  const tipFor = (it, fx, fy) => {
    if (it.kind === 'axes2d' && it.mapper) {
      const hit = nearestPoint(it.node, it.mapper, fx, fy);
      if (!hit) return null;
      const label = [`X ${fmtNum(hit.x)}`, `Y ${fmtNum(hit.y)}`];
      if (hit.z != null && Number.isFinite(hit.z)) label.push(`Z ${fmtNum(hit.z)}`);
      if (hit.node.props.DisplayName) label.unshift(String(hit.node.props.DisplayName));
      return { axId: it.node.id, point: [hit.x, hit.y, hit.z || 0], label, node: hit.node };
    }
    if (it.kind === 'axes3d' && it.view) {
      const p = it.view.pick(fx - it.region.x, fy - it.region.y);
      if (!p) return null;
      return { axId: it.node.id, point: p.point, label: [`X ${fmtNum(p.point[0])}`, `Y ${fmtNum(p.point[1])}`, `Z ${fmtNum(p.point[2])}`] };
    }
    return null;
  };

  // ----- pointer
  const onPointerDown = (e) => {
    if (!stage.current) return;
    stage.current.focus({ preventScroll: true });
    const { x, y } = local(e);
    const fx = x - ox, fy = y - ox;
    const layout = ctl.layouts.get(fig.id);
    const it = hitItem(layout, fx, fy);
    const picking = ctl.exportDlg && ctl.exportDlg.picking;
    if (picking === 'region') { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x, y, fx, fy, it, kind: 'region', moved: false }; return; }
    if (it && it.node && (it.kind === 'axes2d' || it.kind === 'axes3d' || it.kind === 'polar' || it.kind === 'heatmap')) ctl.selectAxes(it.node, fig.id);
    if (picking === 'axes') { if (it && it.node) ctl.finishPick(); return; }
    // ginput
    if (ctl.ginput && ctl.ginput.figId === fig.id) {
      const d = dataAt(it, fx, fy) || [fx, fh - fy, 0];
      ctl.addGinputPoint(d[0], d[1], e.button === 0 ? 1 : e.button === 2 ? 3 : 2);
      e.preventDefault();
      return;
    }
    if (!it) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const start = { x, y, fx, fy, it, button: e.button, shift: e.shiftKey, moved: false };
    // Ctrl + left drag: pan in every mode (2D: the axis limits; 3D: the camera target in the view plane)
    if (e.button === 0 && (e.ctrlKey || e.metaKey) && (it.kind === 'axes2d' || it.kind === 'axes3d')) {
      if (it.kind === 'axes2d') drag.current = { ...start, kind: 'pan2d', lim: ctl.limits2d(it.node), mapper: it.mapper };
      else drag.current = { ...start, kind: 'pan3d', lx: x, ly: y };
      e.preventDefault();
      return;
    }
    const m = mode;
    if (e.button === 1 || m === 'pan' || (m === 'none' && e.button === 0 && it.kind === 'axes2d' && !it.node.props.ButtonDownFcn)) {
      if (it.kind === 'axes2d') { const lim = ctl.limits2d(it.node); drag.current = { ...start, kind: 'pan2d', lim, mapper: it.mapper }; }
      else if (it.kind === 'axes3d') drag.current = { ...start, kind: 'pan3d', lx: x, ly: y };
      if (drag.current) { e.preventDefault(); return; }
    }
    if (e.button !== 0) return;
    if (m === 'zoom' || m === 'zoomout') { drag.current = { ...start, kind: 'zoom' }; return; }
    if (m === 'rotate' || (m === 'none' && it.kind === 'axes3d')) {
      if (it.kind === 'axes2d' && m === 'rotate') { ctl.toggle2d3d(fig.id); drag.current = null; return; }
      if (it.kind === 'axes3d') { drag.current = { ...start, kind: 'orbit', lx: x, ly: y }; return; }
    }
    if (m === 'datacursor') { drag.current = { ...start, kind: 'tip' }; return; }
    drag.current = { ...start, kind: 'click' };
  };

  const onPointerMove = (e) => {
    const { x, y } = local(e);
    cursor.current = { x, y };
    const d = drag.current;
    updateStatus(x - ox, y - ox);
    if (!d) { drawOverlay(); return; }
    if (Math.hypot(x - d.x, y - d.y) > 3) d.moved = true;
    const it = d.it;
    switch (d.kind) {
      case 'pan2d': {
        const m = d.mapper;
        const XLim = panLimits(d.lim.XLim, m.x, m.invX, x - d.x);
        const YLim = panLimits(d.lim.YLim, m.y, m.invY, y - d.y);
        ctl.setLimits2d(it.node, XLim, YLim, { commit: 'none' });
        return;
      }
      case 'pan3d': it.view.pan(x - d.lx, y - d.ly); d.lx = x; d.ly = y; schedule(); return;
      case 'orbit': it.view.orbit(x - d.lx, y - d.ly); d.lx = x; d.ly = y; schedule(); return;
      case 'region': band.current = { x0: d.fx, y0: d.fy, x1: x - ox, y1: y - ox }; drawOverlay(); return;
      case 'zoom': if (it.kind === 'axes2d' && d.moved) { band.current = { x0: d.fx, y0: d.fy, x1: x - ox, y1: y - ox }; drawOverlay(); } return;
      default: drawOverlay();
    }
  };

  const onPointerUp = (e) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const { x, y } = local(e);
    const it = d.it;
    const fx = x - ox, fy = y - ox;
    switch (d.kind) {
      case 'region': {
        band.current = null;
        const r = { x: Math.min(d.fx, fx), y: Math.min(d.fy, fy), w: Math.abs(fx - d.fx), h: Math.abs(fy - d.fy) };
        ctl.finishPick(r.w > 4 && r.h > 4 ? r : null);
        drawOverlay();
        break;
      }
      case 'pan2d': ctl.commit2d(it.node); break;
      case 'pan3d': if (d.moved) ctl.commitTarget3d(it.node, it.view.toData(it.view.target)); else ctl.emit(); break;
      case 'orbit': if (d.moved) ctl.commitView3d(it.node, it.view.getView()); break;
      case 'zoom': {
        band.current = null;
        const out = mode === 'zoomout' || d.shift || d.button === 2;
        if (it.kind === 'axes2d' && it.mapper) {
          const m = it.mapper;
          if (d.moved && !out && Math.abs(fx - d.fx) > 4 && Math.abs(fy - d.fy) > 4) {
            const xs = [m.invX(d.fx), m.invX(fx)].sort((a, b) => a - b), ys = [m.invY(d.fy), m.invY(fy)].sort((a, b) => a - b);
            ctl.setLimits2d(it.node, xs, ys, { commit: 'now' });
          } else {
            const f = out ? 0.5 : 2;
            const lim = ctl.limits2d(it.node);
            ctl.setLimits2d(it.node, zoomLimits(lim.XLim, m.x, m.invX, fx, f), zoomLimits(lim.YLim, m.y, m.invY, fy, f), { commit: 'now' });
          }
        } else if (it.kind === 'axes3d' && it.view) { it.view.zoom(out ? 1 / 1.5 : 1.5, fx - it.region.x, fy - it.region.y); ctl.emit(); }
        drawOverlay();
        break;
      }
      case 'tip': { const tip = tipFor(it, fx, fy); if (tip) ctl.addTip(fig.id, tip, d.shift); break; }
      case 'click': {
        if (d.moved) break;
        const pt = dataAt(it, fx, fy) || [0, 0, 0];
        const hit = it.kind === 'axes2d' && it.mapper ? nearestPoint(it.node, it.mapper, fx, fy, 6) : null;
        if (hit && hit.node.props.ButtonDownFcn) ctl.callback(hit.node, 'ButtonDown', null, { point: pt });
        else if (it.node && it.node.props.ButtonDownFcn) ctl.callback(it.node, 'ButtonDown', null, { point: pt });
        if (fig.props.WindowButtonDownFcn) ctl.callback(fig, 'WindowButtonDown', null, { point: pt });
        break;
      }
      default:
    }
  };

  // wheel: zoom at the cursor (non-passive so the page does not scroll)
  useEffect(() => {
    const el = over.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      const { x, y } = local(e);
      const fx = x - ox, fy = y - ox;
      const it = hitItem(ctl.layouts.get(fig.id), fx, fy);
      if (!it) return;
      e.preventDefault();
      const f = Math.exp(-Math.max(-3, Math.min(3, e.deltaY / 100)) * 0.18);
      ctl.selectAxes(it.node, fig.id);
      if (it.kind === 'axes2d' && it.mapper) {
        const m = it.mapper, lim = ctl.limits2d(it.node);
        ctl.setLimits2d(it.node, zoomLimits(lim.XLim, m.x, m.invX, fx, f), zoomLimits(lim.YLim, m.y, m.invY, fy, f), { commit: 'later' });
      } else if (it.kind === 'axes3d' && it.view) { it.view.zoom(f, fx - it.region.x, fy - it.region.y); ctl.emit(); }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  const onKeyDown = (e) => {
    if (ctl.ginput && ctl.ginput.figId === fig.id) {
      e.preventDefault();
      if (e.key === 'Enter' || e.key === 'Escape') ctl.finishGinput();
      else if (ctl.ginput.n === 1 && !ctl.ginput.points.length) ctl.finishGinput(e.key);
      return;
    }
    if (e.key === 'Escape') { ctl.clearTips(fig.id); band.current = null; drag.current = null; drawOverlay(); return; }
    if (fig.props.KeyPressFcn) ctl.callback(fig, 'KeyPress', null, { key: e.key, character: e.key.length === 1 ? e.key : '' });
  };

  const panning = drag.current && (drag.current.kind === 'pan2d' || drag.current.kind === 'pan3d');
  const cursorCss = (ctrl || panning) && !(ctl.ginput && ctl.ginput.figId === fig.id) && !(ctl.exportDlg && ctl.exportDlg.picking) ? 'move'
    : (ctl.ginput && ctl.ginput.figId === fig.id) || (ctl.exportDlg && ctl.exportDlg.picking) ? 'crosshair' : { zoom: 'zoom-in', zoomout: 'zoom-out', pan: 'grab', rotate: 'move', datacursor: 'crosshair' }[mode] || 'default';
  const hint = ctl.exportDlg && ctl.exportDlg.picking ? tr(lang, `pick_${ctl.exportDlg.picking}`) : tr(lang, `hint_${mode}`);
  const tax = ctl.targetAxes(fig.id);
  const tv = tax && tax.props.Is3D ? ctl.views3d.get(tax.id) : null;
  const camera = tv ? `${tr(lang, 'az')} ${fmtNum(tv.getView()[0])}°  ${tr(lang, 'el')} ${fmtNum(tv.getView()[1])}°` : '';
  return (
    <div className="fig-view">
      <div ref={stage} className="fig-stage" tabIndex={0} onKeyDown={onKeyDown} data-figure={fig.id}>
        <canvas ref={base} className="fig-canvas" />
        <canvas ref={over} className="fig-canvas fig-over" style={{ cursor: cursorCss }}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => { drag.current = null; band.current = null; }}
          onPointerLeave={() => { if (!drag.current) { cursor.current = null; setStatus(''); drawOverlay(); } }}
          onContextMenu={(e) => { if (onMenu) onMenu(e); else e.preventDefault(); }} />
        <UiLayer ctl={ctl} fig={fig} left={ox} top={ox} width={fw} height={fh} theme={theme} lang={lang} />
      </div>
      <div className="fig-status">
        <span className="fig-status-coords">{status}</span>
        {camera && <span className="fig-status-cam">{camera}</span>}
        <span className="spacer" />
        <span className="fig-status-hint ellipsis">{hint}</span>
      </div>
    </div>
  );
}
