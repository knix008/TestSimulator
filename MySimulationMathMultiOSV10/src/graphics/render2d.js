// Canvas 2D renderer for figures (works on a real canvas or the SVG
// recorder): layout, cartesian / polar axes, every 2D object type, legends,
// colorbars, heatmaps, annotations, the 5×5 grid and the rulers.
import { drawTex, measureTex, linesOf } from './text.js';
import { rgbCss, mix } from './theme.js';
import { gridStepFor, logGridLines } from './grid.js';
import { ticksFor, tickLabels, maxTicksFor, minorTicks, dateTicks, niceNum } from '../../core/graphics/ticks.js';
import { mapColor } from '../../core/graphics/colormaps.js';

const finite = (x) => x === x && x !== Infinity && x !== -Infinity;
const PT = 1.25; // px per point (screen)
export const RULER = 22;

// ---------------------------------------------------------------- helpers

/** Rows ([r,g,b]) of a colormap Mat. */
export function cmapRows(M) {
  if (!M || !M.dims) return [[0, 0, 0]];
  const [m] = M.dims;
  const out = [];
  for (let i = 0; i < m; i++) out.push([M.data[i], M.data[i + m], M.data[i + 2 * m]]);
  return out;
}
const matAt = (M, i, j = 0) => M.data[i + j * M.dims[0]];
const matLen = (M) => (M ? M.data.length : 0);

/** Colour of a node property honouring theme-auto colours. */
export function colorOf(node, prop, theme) {
  const v = node.props[prop];
  if (theme && node.auto && node.auto.includes(prop)) {
    switch (node.type) {
      case 'figure': return theme.figure;
      case 'axes': case 'polaraxes': case 'uiaxes':
        if (prop === 'Color') return theme.axes;
        if (prop === 'GridColor' || prop === 'MinorGridColor') return theme.grid;
        return theme.fg;
      case 'legend': return prop === 'TextColor' ? theme.fg : prop === 'Color' ? theme.axes : theme.muted;
      case 'heatmap': return theme.axes;
      default: return theme.fg;
    }
  }
  return v;
}

const dashFor = (style, lw) => {
  const w = Math.max(1, lw);
  if (style === '--') return [6 * w, 4 * w];
  if (style === ':') return [1.2 * w, 2.6 * w];
  if (style === '-.') return [6 * w, 3 * w, 1.2 * w, 3 * w];
  return [];
};

export function drawMarker(ctx, m, x, y, size, edge, face, lw = 1) {
  const r = size / 2;
  ctx.beginPath();
  switch (m) {
    case 'o': ctx.arc(x, y, r, 0, Math.PI * 2); break;
    case '.': ctx.arc(x, y, Math.max(1, r / 3), 0, Math.PI * 2); face = face && face !== 'none' ? face : edge; break;
    case 's': ctx.rect(x - r * 0.9, y - r * 0.9, r * 1.8, r * 1.8); break;
    case 'd': ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); break;
    case '^': ctx.moveTo(x, y - r); ctx.lineTo(x + r, y + r * 0.8); ctx.lineTo(x - r, y + r * 0.8); ctx.closePath(); break;
    case 'v': ctx.moveTo(x, y + r); ctx.lineTo(x + r, y - r * 0.8); ctx.lineTo(x - r, y - r * 0.8); ctx.closePath(); break;
    case '>': ctx.moveTo(x + r, y); ctx.lineTo(x - r * 0.8, y + r); ctx.lineTo(x - r * 0.8, y - r); ctx.closePath(); break;
    case '<': ctx.moveTo(x - r, y); ctx.lineTo(x + r * 0.8, y + r); ctx.lineTo(x + r * 0.8, y - r); ctx.closePath(); break;
    case 'p': case 'h': {
      const k = m === 'p' ? 5 : 6;
      for (let i = 0; i < 2 * k; i++) { const a = -Math.PI / 2 + (i * Math.PI) / k; const rr = i % 2 ? r * 0.45 : r; ctx[i ? 'lineTo' : 'moveTo'](x + rr * Math.cos(a), y + rr * Math.sin(a)); }
      ctx.closePath(); break;
    }
    case '+': ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); face = null; break;
    case 'x': ctx.moveTo(x - r * 0.7, y - r * 0.7); ctx.lineTo(x + r * 0.7, y + r * 0.7); ctx.moveTo(x + r * 0.7, y - r * 0.7); ctx.lineTo(x - r * 0.7, y + r * 0.7); face = null; break;
    case '*': for (let i = 0; i < 3; i++) { const a = (i * Math.PI) / 3; ctx.moveTo(x - r * Math.cos(a), y - r * Math.sin(a)); ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a)); } ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); face = null; break;
    case '_': ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); face = null; break;
    case '|': ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); face = null; break;
    default: return;
  }
  if (face && face !== 'none') { ctx.fillStyle = face; ctx.fill(); }
  if (edge && edge !== 'none') { ctx.strokeStyle = edge; ctx.lineWidth = lw; ctx.setLineDash([]); ctx.stroke(); }
}

// ---------------------------------------------------------------- coordinate mapping

/** Maps data → px for a 2D axes box. */
export function makeMapper(box, xlim, ylim, xscale, yscale, xdir, ydir) {
  const T = (s) => (s === 'log' ? (v) => (v > 0 ? Math.log10(v) : NaN) : (v) => v);
  const tx = T(xscale), ty = T(yscale);
  const x0 = tx(xlim[0]), x1 = tx(xlim[1]), y0 = ty(ylim[0]), y1 = ty(ylim[1]);
  const fx = box.w / (x1 - x0 || 1), fy = box.h / (y1 - y0 || 1);
  const rx = xdir === 'reverse', ry = ydir === 'reverse';
  const m = {
    box, xlim, ylim, xscale, yscale,
    x: (v) => { if (v === Infinity) return rx ? box.x : box.x + box.w; if (v === -Infinity) return rx ? box.x + box.w : box.x; const t = (tx(v) - x0) * fx; return rx ? box.x + box.w - t : box.x + t; },
    y: (v) => { if (v === Infinity) return ry ? box.y + box.h : box.y; if (v === -Infinity) return ry ? box.y : box.y + box.h; const t = (ty(v) - y0) * fy; return ry ? box.y + t : box.y + box.h - t; },
    invX: (px) => { const t = rx ? box.x + box.w - px : px - box.x; const v = x0 + t / fx; return xscale === 'log' ? 10 ** v : v; },
    invY: (py) => { const t = ry ? py - box.y : box.y + box.h - py; const v = y0 + t / fy; return yscale === 'log' ? 10 ** v : v; },
    pxPerUnitX: Math.abs(fx), pxPerUnitY: Math.abs(fy),
  };
  return m;
}

// ---------------------------------------------------------------- layout

const fontPx = (pt) => pt * PT;
function textSize(ctx, s, pt, weight) { if (!s || (Array.isArray(s) && !s.length)) return { width: 0, height: 0 }; return measureTex(ctx, s, fontPx(pt), { bold: weight === 'bold' }); }
const hasText = (t) => t && t.props && t.props.String != null && linesOf(t.props.String).some((l) => l.trim() !== '');

/** Effective limits / ticks for an axes, honouring GUI zoom overrides. */
export function axesState(ax, view, box) {
  const p = ax.props;
  const xlim = (view && view.XLim) || p.XLim, ylim = (view && view.YLim) || p.YLim;
  const tick = (axis, lim, len, horiz) => {
    const type = p[`${axis}AxisType`];
    const zoomed = view && (view.XLim || view.YLim);
    let ticks, labels, exponent = 0;
    if (p[`${axis}TickMode`] === 'manual' || type === 'categorical') { ticks = p[`${axis}Tick`] || []; labels = p[`${axis}TickLabel`] || []; exponent = p[`${axis}TickExponent`] || 0; if (type === 'categorical' && zoomed) { /* keep */ } }
    else if (type === 'datetime') { const d = dateTicks(lim[0], lim[1], Math.max(3, maxTicksFor(len, horiz) - 1)); ticks = d.ticks; labels = d.labels; }
    else { ticks = ticksFor(lim[0], lim[1], p[`${axis}Scale`], maxTicksFor(len, horiz)); const t = tickLabels(ticks, p[`${axis}Scale`]); labels = t.labels; exponent = t.exponent; }
    if (p[`${axis}TickLabelMode`] === 'manual') labels = p[`${axis}TickLabel`] || [];
    return { ticks: ticks.filter((v) => v >= Math.min(lim[0], lim[1]) - 1e-12 * Math.abs(lim[1] - lim[0]) && v <= Math.max(lim[0], lim[1]) + 1e-12 * Math.abs(lim[1] - lim[0])), labels: labels.slice(0, ticks.length), allTicks: ticks, exponent };
  };
  const w = box ? box.w : 400, h = box ? box.h : 300;
  const xt = tick('X', xlim, w, true), yt = tick('Y', ylim, h, false);
  // labels follow the filtered ticks
  const relabel = (t) => { const idx = t.allTicks.map((v, i) => [v, i]).filter(([v]) => t.ticks.includes(v)).map(([, i]) => i); return { ...t, labels: idx.map((i) => t.labels[i] ?? '') }; };
  return { xlim, ylim, xt: relabel({ ...xt, labels: (p.XTickLabelMode === 'manual' ? p.XTickLabel : xt.labels) }), yt: relabel({ ...yt, labels: (p.YTickLabelMode === 'manual' ? p.YTickLabel : yt.labels) }) };
}

/**
 * Lays out the figure: [{node, kind, outer, box, region}] in CSS px (origin
 * top left). kind: 'axes2d' | 'axes3d' | 'polar' | 'heatmap'.
 */
export function computeLayout(ctx, fig, W, H, views = new Map()) {
  const items = [];
  const sg = fig.props.SgTitle && hasText(fig.props.SgTitle) ? fig.props.SgTitle : null;
  const sgH = sg ? textSize(ctx, sg.props.String, sg.props.FontSize, sg.props.FontWeight).height + 10 : 0;
  const area = { x: 0, y: sgH, w: W, h: H - sgH };
  const toPx = (pos, frame = area) => ({ x: frame.x + pos[0] * frame.w, y: frame.y + (1 - pos[1] - pos[3]) * frame.h, w: pos[2] * frame.w, h: pos[3] * frame.h });
  const visit = (node, frame) => {
    for (const c of node.children.slice().reverse()) {
      if (c.type === 'tiledlayout') {
        const t = c.props.Title && hasText(c.props.Title) ? c.props.Title : null;
        const outer = toPx(c.props.OuterPosition, frame);
        const th = t ? textSize(ctx, t.props.String, t.props.FontSize, 'bold').height + 8 : 0;
        const xl = c.props.XLabel && hasText(c.props.XLabel) ? 22 : 0, yl = c.props.YLabel && hasText(c.props.YLabel) ? 22 : 0;
        items.push({ node: c, kind: 'layout', outer, titleH: th });
        visit(c, { x: outer.x + yl, y: outer.y + th, w: outer.w - yl, h: outer.h - th - xl });
        continue;
      }
      if (c.type === 'uipanel') { visit(c, frame); continue; }
      if (c.type === 'heatmap') { const outer = toPx(c.props.OuterPosition, frame); items.push({ node: c, kind: 'heatmap', outer, box: heatmapBox(ctx, c, outer) }); continue; }
      if (!['axes', 'polaraxes', 'uiaxes'].includes(c.type)) continue;
      const p = c.props;
      const outer = toPx(p.OuterPosition, frame);
      if (p.Kind === 'polar') { items.push({ node: c, kind: 'polar', outer, box: polarBox(ctx, c, outer) }); continue; }
      if (p.Is3D) {
        const titleH = titleBlockH(ctx, c);
        const cbW = p.Colorbar && p.Colorbar.props.Visible !== false ? 60 : 0;
        const lgW = p.Legend && p.Legend.props.Visible !== false && /outside/.test(p.Legend.props.Location) ? legendSize(ctx, c).w + 12 : 0;
        const region = { x: outer.x, y: outer.y + titleH, w: Math.max(40, outer.w - cbW - lgW), h: Math.max(40, outer.h - titleH) };
        items.push({ node: c, kind: 'axes3d', outer, region, box: region, titleH });
        continue;
      }
      items.push({ node: c, kind: 'axes2d', outer, box: axes2dBox(ctx, c, outer, views.get(c.id)) });
    }
  };
  visit(fig, area);
  return { items, sg, sgH };
}

function titleBlockH(ctx, ax) {
  const p = ax.props;
  let h = 6;
  if (hasText(p.Title)) h += textSize(ctx, p.Title.props.String, p.Title.props.FontSize, p.Title.props.FontWeight).height + 4;
  if (hasText(p.Subtitle)) h += textSize(ctx, p.Subtitle.props.String, p.Subtitle.props.FontSize, 'normal').height + 2;
  return h;
}

function axes2dBox(ctx, ax, outer, view) {
  const p = ax.props;
  if (p.PositionConstraint === 'innerposition') {
    return fitAspect({ x: outer.x, y: outer.y, w: outer.w, h: outer.h }, ax, view, true);
  }
  const fs = fontPx(p.FontSize);
  ctx.font = `${fs}px sans-serif`;
  const st = axesState(ax, view, { w: outer.w * 0.75, h: outer.h * 0.75 });
  const vis = p.Visible !== false;
  const ytw = vis ? Math.max(0, ...st.yt.labels.map((s) => measureTex(ctx, s, fs).width)) : 0;
  const xth = vis && st.xt.labels.length ? (p.XTickLabelRotation ? Math.max(...st.xt.labels.map((s) => measureTex(ctx, s, fs).width)) * Math.abs(Math.sin(p.XTickLabelRotation * Math.PI / 180)) + fs : fs * 1.3) : 0;
  const xl = hasText(p.XLabel) ? textSize(ctx, p.XLabel.props.String, p.XLabel.props.FontSize, 'normal').height + 4 : 0;
  const yl = hasText(p.YLabel) ? textSize(ctx, p.YLabel.props.String, p.YLabel.props.FontSize, 'normal').height + 4 : 0;
  const top = titleBlockH(ctx, ax) + (st.yt.exponent ? fs : 0) + 6;
  let right = 14 + (st.xt.exponent ? 24 : 0);
  if (p.YAxisLocation === 'right') right += ytw + 6;
  const lg = p.Legend && p.Legend.props.Visible !== false ? p.Legend : null;
  const cb = p.Colorbar && p.Colorbar.props.Visible !== false ? p.Colorbar : null;
  let left = 10 + (p.YAxisLocation === 'right' ? 0 : ytw + 6) + yl;
  let bottom = 8 + xth + xl;
  if (cb) {
    const loc = cb.props.Location;
    if (loc === 'eastoutside') right += colorbarThickness(ctx, ax) + 10;
    if (loc === 'westoutside') left += colorbarThickness(ctx, ax) + 10;
    if (loc === 'southoutside') bottom += 46;
    if (loc === 'northoutside') { /* below the title */ }
  }
  if (lg && /outside/.test(lg.props.Location)) {
    const ls = legendSize(ctx, ax);
    if (/east/.test(lg.props.Location)) right += ls.w + 10; else if (/west/.test(lg.props.Location)) left += ls.w + 10;
    else if (/south/.test(lg.props.Location)) bottom += ls.h + 10; else if (/north/.test(lg.props.Location)) { /* handled by top */ }
  }
  const box = { x: outer.x + left, y: outer.y + top, w: Math.max(20, outer.w - left - right), h: Math.max(20, outer.h - top - bottom) };
  return fitAspect(box, ax, view, false);
}

function fitAspect(box, ax, view, keep) {
  const p = ax.props;
  let ratio = null; // width / height
  if (p.DataAspectRatioMode === 'manual') {
    const xl = (view && view.XLim) || p.XLim, yl = (view && view.YLim) || p.YLim;
    const sx = (p.XScale === 'log' ? Math.log10(xl[1] / xl[0]) : xl[1] - xl[0]) / p.DataAspectRatio[0];
    const sy = (p.YScale === 'log' ? Math.log10(yl[1] / yl[0]) : yl[1] - yl[0]) / p.DataAspectRatio[1];
    if (sx > 0 && sy > 0) ratio = sx / sy;
  } else if (p.PlotBoxAspectRatioMode === 'manual') ratio = p.PlotBoxAspectRatio[0] / p.PlotBoxAspectRatio[1];
  if (!ratio || keep && false) return box;
  let w = box.w, h = box.h;
  if (w / h > ratio) w = h * ratio; else h = w / ratio;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

function polarBox(ctx, ax, outer) {
  const top = titleBlockH(ctx, ax) + 4;
  const pad = fontPx(ax.props.FontSize) * 2.6;
  const w = outer.w - 2 * pad, h = outer.h - top - 2 * pad;
  const r = Math.max(10, Math.min(w, h) / 2);
  const cx = outer.x + outer.w / 2, cy = outer.y + top + pad + h / 2;
  return { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r, cx, cy, r };
}

function heatmapBox(ctx, hm, outer) {
  const p = hm.props;
  const fs = fontPx(p.FontSize);
  ctx.font = `${fs}px sans-serif`;
  const yw = Math.max(0, ...(p.YDisplayLabels || []).map((s) => ctx.measureText(String(s)).width));
  const top = p.Title ? fs * 2.2 : 10;
  const left = yw + 14 + (p.YLabel ? fs * 1.6 : 0);
  const bottom = fs * 1.8 + (p.XLabel ? fs * 1.6 : 0) + 6;
  const right = p.ColorbarVisible ? 70 : 14;
  return { x: outer.x + left, y: outer.y + top, w: Math.max(20, outer.w - left - right), h: Math.max(20, outer.h - top - bottom) };
}

// ---------------------------------------------------------------- figure drawing

/**
 * Draws a figure. phase: 'base' (backgrounds, 2D axes, annotations) or
 * 'overlay' (decorations of 3D axes drawn over the WebGL canvases).
 * opts: { theme, views: Map(axId → {XLim, YLim}), grid5, layout, view3d: Map(axId → Axes3DView), scale }
 */
export function drawFigure(ctx, fig, W, H, opts, phase = 'base') {
  const theme = opts.theme;
  const layout = opts.layout || computeLayout(ctx, fig, W, H, opts.views);
  if (phase === 'base') {
    const bg = colorOf(fig, 'Color', theme);
    if (opts.background !== 'none' && bg !== 'none') { ctx.fillStyle = rgbCss(bg); ctx.fillRect(0, 0, W, H); }
    for (const it of layout.items) {
      if (it.kind === 'axes2d') drawAxes2D(ctx, it, opts);
      else if (it.kind === 'polar') drawPolar(ctx, it, opts);
      else if (it.kind === 'heatmap') drawHeatmap(ctx, it, opts);
      else if (it.kind === 'layout') drawLayoutLabels(ctx, it, opts);
      else if (it.kind === 'axes3d') drawAxes3DBackdrop(ctx, it, opts);
    }
    if (layout.sg) {
      const t = layout.sg;
      drawTex(ctx, t.props.String, W / 2, 6, { size: fontPx(t.props.FontSize), align: 'center', valign: 'top', color: rgbCss(colorOf(t, 'Color', theme)), bold: t.props.FontWeight === 'bold', interpreter: t.props.Interpreter });
    }
    const wb = fig.children.find((c) => c.type === 'waitbar');
    if (wb) drawWaitbar(ctx, wb, W, H, theme);
  } else {
    for (const it of layout.items) if (it.kind === 'axes3d') drawAxes3DOverlay(ctx, it, opts);
    for (const c of fig.children) if (c.type === 'annotation' && c.props.Visible !== false) drawAnnotation(ctx, c, W, H, theme, layout.sgH);
  }
  return layout;
}

function drawLayoutLabels(ctx, it, opts) {
  const n = it.node, theme = opts.theme;
  const o = it.outer;
  if (n.props.Title && hasText(n.props.Title)) { const t = n.props.Title; drawTex(ctx, t.props.String, o.x + o.w / 2, o.y + 4, { size: fontPx(t.props.FontSize), align: 'center', valign: 'top', bold: true, color: rgbCss(colorOf(t, 'Color', theme)) }); }
  if (n.props.XLabel && hasText(n.props.XLabel)) { const t = n.props.XLabel; drawTex(ctx, t.props.String, o.x + o.w / 2, o.y + o.h - 4, { size: fontPx(t.props.FontSize), align: 'center', valign: 'bottom', color: rgbCss(colorOf(t, 'Color', theme)) }); }
  if (n.props.YLabel && hasText(n.props.YLabel)) { const t = n.props.YLabel; drawTex(ctx, t.props.String, o.x + 4, o.y + o.h / 2, { size: fontPx(t.props.FontSize), align: 'center', valign: 'top', rotation: 90, color: rgbCss(colorOf(t, 'Color', theme)) }); }
}

function drawTitleBlock(ctx, ax, cx, top, theme, left = null) {
  const p = ax.props;
  let y = top;
  const align = p.TitleHorizontalAlignment || 'center';
  const x = align === 'left' && left ? left.x : align === 'right' && left ? left.x + left.w : cx;
  if (hasText(p.Title)) {
    const t = p.Title;
    const m = drawTex(ctx, t.props.String, x, y, { size: fontPx(t.props.FontSize), align, valign: 'top', color: rgbCss(colorOf(t, 'Color', theme)), bold: t.props.FontWeight === 'bold', italic: t.props.FontAngle === 'italic', interpreter: t.props.Interpreter });
    y += m.height + 2;
  }
  if (hasText(p.Subtitle)) {
    const t = p.Subtitle;
    const m = drawTex(ctx, t.props.String, x, y, { size: fontPx(t.props.FontSize), align, valign: 'top', color: rgbCss(mix(colorOf(t, 'Color', theme), theme.axes || [1, 1, 1], 0.25)), interpreter: t.props.Interpreter });
    y += m.height;
  }
  return y;
}

function drawAxes3DBackdrop(ctx, it, opts) {
  const ax = it.node, theme = opts.theme;
  if (ax.props.Visible === false) return;
  drawTitleBlock(ctx, ax, it.outer.x + it.outer.w / 2, it.outer.y + 6, theme);
}
function drawAxes3DOverlay(ctx, it, opts) {
  const view = opts.view3d && opts.view3d.get(it.node.id);
  if (view && view.drawOverlay) view.drawOverlay(ctx, it.region.x, it.region.y, opts.theme);
  const ax = it.node;
  if (ax.props.Colorbar && ax.props.Colorbar.props.Visible !== false) drawColorbar(ctx, ax, { x: it.region.x + it.region.w + 6, y: it.region.y + it.region.h * 0.1, w: 0, h: it.region.h * 0.8 }, opts.theme, true);
  if (ax.props.Legend && ax.props.Legend.props.Visible !== false) drawLegend(ctx, ax, it.region, opts.theme);
}

// ---------------------------------------------------------------- 2D axes

function drawAxes2D(ctx, it, opts) {
  const ax = it.node, p = ax.props, theme = opts.theme, box = it.box;
  const view = opts.views && opts.views.get(ax.id);
  const st = axesState(ax, view, box);
  const m = makeMapper(box, st.xlim, st.ylim, p.XScale, p.YScale, p.XDir, p.YDir);
  it.mapper = m;
  it.state = st;
  const vis = p.Visible !== false;
  const fg = rgbCss(colorOf(ax, 'XColor', theme));
  const fgY = rgbCss(colorOf(ax, 'YColor', theme));
  const fs = fontPx(p.FontSize);
  // background
  const bg = colorOf(ax, 'Color', theme);
  if (vis && bg !== 'none') { ctx.fillStyle = rgbCss(bg); ctx.fillRect(box.x, box.y, box.w, box.h); }
  // grid
  const gridOn = vis && (opts.grid5 || p.XGrid || p.YGrid || p.XMinorGrid || p.YMinorGrid);
  if (gridOn) drawGrid5(ctx, ax, m, theme, opts.grid5 || p.XMinorGrid || p.YMinorGrid, { x: opts.grid5 || p.XGrid || p.XMinorGrid, y: opts.grid5 || p.YGrid || p.YMinorGrid });
  // children
  ctx.save();
  ctx.beginPath(); ctx.rect(box.x, box.y, box.w, box.h); ctx.clip();
  const cmap = cmapRows(p.Colormap);
  const cctx = { m, cmap, clim: p.CLim, theme, ax, fs };
  for (const c of ax.children.slice().reverse()) drawChild2D(ctx, c, cctx);
  ctx.restore();
  // unclipped children (text with Clipping off)
  for (const c of ax.children.slice().reverse()) if (c.type === 'text' && c.props.Clipping === false && c.props.Visible !== false) drawText2D(ctx, c, cctx, true);
  if (vis) {
    drawAxisLines2D(ctx, ax, m, st, fg, fgY, fs, theme);
    drawTitleBlock(ctx, ax, box.x + box.w / 2, it.outer.y + 6, theme, box);
  }
  if (p.Colorbar && p.Colorbar.props.Visible !== false) drawColorbar(ctx, ax, box, theme);
  if (p.Legend && p.Legend.props.Visible !== false) drawLegend(ctx, ax, box, theme);
}

/** The 5×5 grid: minor lines (nice step, readable at any zoom) and a stronger major line every 5. */
export function drawGrid5(ctx, ax, m, theme, minorOn, which = { x: true, y: true }) {
  const p = ax.props;
  const box = m.box;
  const gc = colorOf(ax, 'GridColor', theme);
  const ga = p.GridAlpha ?? 0.15;
  const majorA = Math.min(1, (theme && theme.gridMajorAlpha) || ga * 2);
  const minorA = Math.max(0.05, ((theme && theme.gridAlpha) || ga) * 0.9);
  const lines = (vals, horiz, alpha, width) => {
    if (!vals.length) return;
    ctx.beginPath();
    for (const v of vals) {
      if (horiz) { const y = Math.round(m.y(v)) + 0.5; if (y < box.y - 0.5 || y > box.y + box.h + 0.5) continue; ctx.moveTo(box.x, y); ctx.lineTo(box.x + box.w, y); }
      else { const x = Math.round(m.x(v)) + 0.5; if (x < box.x - 0.5 || x > box.x + box.w + 0.5) continue; ctx.moveTo(x, box.y); ctx.lineTo(x, box.y + box.h); }
    }
    ctx.strokeStyle = rgbCss(gc, alpha);
    ctx.lineWidth = width;
    ctx.setLineDash(p.GridLineStyle === '-' || !p.GridLineStyle ? [] : dashFor(p.GridLineStyle, 1));
    ctx.stroke();
  };
  const axisLines = (lim, scale, ppu) => {
    if (scale === 'log') { const g = logGridLines(Math.min(...lim), Math.max(...lim)); return { minor: g.minorLines, major: g.majorLines }; }
    const lo = Math.min(...lim), hi = Math.max(...lim);
    const span = hi - lo;
    if (!(span > 0)) return { minor: [], major: [] };
    const base = 10 ** Math.floor(Math.log10(span));
    const step = gridStepFor(base, ppu);
    const major = step * 5;
    const minor = [], majorL = [];
    const first = Math.ceil(lo / step - 1e-9);
    for (let i = first; ; i++) {
      const v = Number((i * step).toPrecision(12));
      if (v > hi + step * 1e-9) break;
      if (Math.abs(v / major - Math.round(v / major)) < 1e-6) majorL.push(v); else minor.push(v);
      if (minor.length + majorL.length > 3000) break;
    }
    return { minor, major: majorL };
  };
  const gx = axisLines(m.xlim, p.XScale, m.pxPerUnitX), gy = axisLines(m.ylim, p.YScale, m.pxPerUnitY);
  if (minorOn) { if (which.x) lines(gx.minor, false, minorA, 1); if (which.y) lines(gy.minor, true, minorA, 1); }
  if (which.x) lines(gx.major, false, majorA, 1.2);
  if (which.y) lines(gy.major, true, majorA, 1.2);
  ctx.setLineDash([]);
  return { x: gx, y: gy };
}

function drawAxisLines2D(ctx, ax, m, st, fg, fgY, fs, theme) {
  const p = ax.props, box = m.box;
  const lw = Math.max(1, p.LineWidth * PT);
  ctx.lineWidth = lw;
  ctx.setLineDash([]);
  const yAt = p.XAxisLocation === 'top' ? box.y : p.XAxisLocation === 'origin' ? clampN(m.y(0), box.y, box.y + box.h) : box.y + box.h;
  const xAt = p.YAxisLocation === 'right' ? box.x + box.w : p.YAxisLocation === 'origin' ? clampN(m.x(0), box.x, box.x + box.w) : box.x;
  const crisp = (v) => Math.round(v) + 0.5;
  ctx.strokeStyle = fg;
  ctx.beginPath();
  ctx.moveTo(box.x, crisp(yAt)); ctx.lineTo(box.x + box.w, crisp(yAt));
  if (p.Box) { const other = p.XAxisLocation === 'top' ? box.y + box.h : box.y; ctx.moveTo(box.x, crisp(other)); ctx.lineTo(box.x + box.w, crisp(other)); }
  ctx.stroke();
  ctx.strokeStyle = fgY;
  ctx.beginPath();
  ctx.moveTo(crisp(xAt), box.y); ctx.lineTo(crisp(xAt), box.y + box.h);
  if (p.Box) { const other = p.YAxisLocation === 'right' ? box.x : box.x + box.w; ctx.moveTo(crisp(other), box.y); ctx.lineTo(crisp(other), box.y + box.h); }
  ctx.stroke();
  // ticks
  const tl = Math.max(3, Math.min(box.w, box.h) * (p.TickLength ? p.TickLength[0] : 0.01));
  const dir = p.TickDir === 'out' ? -1 : p.TickDir === 'none' ? 0 : 1;
  const xDown = p.XAxisLocation === 'top' ? 1 : -1;
  ctx.beginPath();
  ctx.strokeStyle = fg;
  for (const v of st.xt.ticks) { const x = crisp(m.x(v)); ctx.moveTo(x, yAt); ctx.lineTo(x, yAt + xDown * dir * tl); if (p.Box && dir) { const o = p.XAxisLocation === 'top' ? box.y + box.h : box.y; ctx.moveTo(x, o); ctx.lineTo(x, o - xDown * dir * tl); } }
  ctx.stroke();
  ctx.beginPath();
  ctx.strokeStyle = fgY;
  const yRight = p.YAxisLocation === 'right' ? -1 : 1;
  for (const v of st.yt.ticks) { const y = crisp(m.y(v)); ctx.moveTo(xAt, y); ctx.lineTo(xAt + yRight * dir * tl, y); if (p.Box && dir) { const o = p.YAxisLocation === 'right' ? box.x : box.x + box.w; ctx.moveTo(o, y); ctx.lineTo(o - yRight * dir * tl, y); } }
  ctx.stroke();
  // minor ticks
  if (p.XMinorTick || p.YMinorTick) {
    ctx.beginPath();
    if (p.XMinorTick) for (const v of minorTicks(st.xt.ticks, m.xlim[0], m.xlim[1], p.XScale)) { const x = crisp(m.x(v)); ctx.moveTo(x, yAt); ctx.lineTo(x, yAt + xDown * dir * tl * 0.55); }
    if (p.YMinorTick) for (const v of minorTicks(st.yt.ticks, Math.min(...m.ylim), Math.max(...m.ylim), p.YScale)) { const y = crisp(m.y(v)); ctx.moveTo(xAt, y); ctx.lineTo(xAt + yRight * dir * tl * 0.55, y); }
    ctx.stroke();
  }
  // tick labels
  const rot = p.XTickLabelRotation || 0;
  st.xt.ticks.forEach((v, i) => {
    const s = st.xt.labels[i];
    if (s == null || s === '') return;
    const x = m.x(v);
    const y = p.XAxisLocation === 'top' ? yAt - 4 : yAt + 4 + (dir < 0 ? tl : 0);
    drawTex(ctx, String(s), x, y, { size: fs, align: rot ? 'right' : 'center', valign: p.XAxisLocation === 'top' ? 'bottom' : 'top', rotation: rot, color: fg });
  });
  let ytw = 0;
  st.yt.ticks.forEach((v, i) => {
    const s = st.yt.labels[i];
    if (s == null || s === '') return;
    const y = m.y(v);
    const r = drawTex(ctx, String(s), p.YAxisLocation === 'right' ? xAt + 5 : xAt - 5 - (dir < 0 ? tl : 0), y, { size: fs, align: p.YAxisLocation === 'right' ? 'left' : 'right', valign: 'middle', rotation: p.YTickLabelRotation || 0, color: fgY });
    ytw = Math.max(ytw, r.width);
  });
  if (st.xt.exponent) drawTex(ctx, `\\times10^{${st.xt.exponent}}`, box.x + box.w, yAt + fs * 1.5, { size: fs, align: 'right', valign: 'top', color: fg });
  if (st.yt.exponent) drawTex(ctx, `\\times10^{${st.yt.exponent}}`, box.x, box.y - 3, { size: fs, align: 'left', valign: 'bottom', color: fgY });
  // axis labels
  const xh = st.xt.labels.length ? fs * 1.3 + (rot ? Math.max(0, ...st.xt.labels.map((s) => measureTex(ctx, String(s), fs).width)) * Math.abs(Math.sin(rot * Math.PI / 180)) : 0) : 0;
  if (hasText(p.XLabel)) {
    const t = p.XLabel;
    const y = p.XAxisLocation === 'top' ? box.y - xh - 6 : yAt + xh + 6;
    drawTex(ctx, t.props.String, box.x + box.w / 2, y, { size: fontPx(t.props.FontSize), align: 'center', valign: p.XAxisLocation === 'top' ? 'bottom' : 'top', color: rgbCss(colorOf(t, 'Color', theme)), bold: t.props.FontWeight === 'bold', interpreter: t.props.Interpreter });
  }
  if (hasText(p.YLabel)) {
    const t = p.YLabel;
    const x = p.YAxisLocation === 'right' ? xAt + ytw + 10 : xAt - ytw - 10;
    drawTex(ctx, t.props.String, x, box.y + box.h / 2, { size: fontPx(t.props.FontSize), align: 'center', valign: p.YAxisLocation === 'right' ? 'top' : 'bottom', rotation: 90, color: rgbCss(colorOf(t, 'Color', theme)), bold: t.props.FontWeight === 'bold', interpreter: t.props.Interpreter });
  }
}
const clampN = (v, a, b) => (v < a ? a : v > b ? b : v);

// ---------------------------------------------------------------- children

function colorFromCData(cctx, v) { const c = mapColor(cctx.cmap, v, cctx.clim[0], cctx.clim[1]); return c ? rgbCss(c) : null; }

function polyline(ctx, xs, ys, m, close = false) {
  let pen = false;
  ctx.beginPath();
  for (let i = 0; i < xs.length; i++) {
    const X = m.x(xs[i]), Y = m.y(ys[i]);
    if (!finite(X) || !finite(Y)) { pen = false; continue; }
    if (pen) ctx.lineTo(X, Y); else { ctx.moveTo(X, Y); pen = true; }
  }
  if (close) ctx.closePath();
}
function strokeStyle(ctx, color, style, lw) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(0.6, lw * PT);
  ctx.setLineDash(dashFor(style, lw * PT));
  ctx.lineJoin = 'round';
  ctx.lineCap = style === '-' ? 'round' : 'butt';
}
function markerColors(p, base) {
  const edge = p.MarkerEdgeColor === 'auto' ? base : p.MarkerEdgeColor === 'none' ? 'none' : rgbCss(p.MarkerEdgeColor);
  const face = p.MarkerFaceColor === 'auto' ? base : p.MarkerFaceColor === 'none' ? 'none' : p.MarkerFaceColor === 'flat' ? base : rgbCss(p.MarkerFaceColor);
  return { edge, face };
}
function drawMarkers(ctx, xs, ys, m, p, base) {
  if (!p.Marker || p.Marker === 'none') return;
  const { edge, face } = markerColors(p, base);
  const idx = p.MarkerIndices && p.MarkerIndices.length ? p.MarkerIndices.map((k) => k - 1) : null;
  const n = xs.length;
  for (let k = 0; k < (idx ? idx.length : n); k++) {
    const i = idx ? idx[k] : k;
    const X = m.x(xs[i]), Y = m.y(ys[i]);
    if (finite(X) && finite(Y)) drawMarker(ctx, p.Marker, X, Y, p.MarkerSize * PT, edge, face, Math.max(0.8, p.LineWidth * PT));
  }
}
const arr = (M) => (M ? M.data : []);

export function drawChild2D(ctx, c, cctx) {
  const p = c.props;
  if (p.Visible === false) return;
  const { m } = cctx;
  switch (c.type) {
    case 'line': case 'animatedline': {
      const xs = arr(p.XData), ys = arr(p.YData);
      if (!xs.length) return;
      const color = p.Color === 'none' ? 'none' : rgbCss(p.Color);
      if (p.LineStyle !== 'none' && color !== 'none') { polyline(ctx, xs, ys, m); strokeStyle(ctx, color, p.LineStyle, p.LineWidth); ctx.stroke(); ctx.setLineDash([]); }
      drawMarkers(ctx, xs, ys, m, p, color);
      break;
    }
    case 'stair': {
      const path = p.Path || [];
      const xs = [], ys = [];
      for (let i = 0; i < path.length; i += 2) { xs.push(path[i]); ys.push(path[i + 1]); }
      const color = rgbCss(p.Color);
      if (p.LineStyle !== 'none') { polyline(ctx, xs, ys, m); strokeStyle(ctx, color, p.LineStyle, p.LineWidth); ctx.stroke(); ctx.setLineDash([]); }
      drawMarkers(ctx, arr(p.XData), arr(p.YData), m, p, color);
      break;
    }
    case 'stem': {
      const xs = arr(p.XData), ys = arr(p.YData);
      const color = rgbCss(p.Color);
      if (p.LineStyle !== 'none') {
        ctx.beginPath();
        for (let i = 0; i < ys.length; i++) { const X = m.x(xs[i]); if (!finite(X) || !finite(m.y(ys[i]))) continue; ctx.moveTo(X, m.y(p.BaseValue)); ctx.lineTo(X, m.y(ys[i])); }
        strokeStyle(ctx, color, p.LineStyle, p.LineWidth); ctx.stroke(); ctx.setLineDash([]);
      }
      if (p.ShowBaseLine) { ctx.beginPath(); ctx.moveTo(m.box.x, Math.round(m.y(p.BaseValue)) + 0.5); ctx.lineTo(m.box.x + m.box.w, Math.round(m.y(p.BaseValue)) + 0.5); strokeStyle(ctx, rgbCss(cctx.theme.fg), '-', 0.5); ctx.stroke(); }
      drawMarkers(ctx, xs, ys, m, p, color);
      break;
    }
    case 'errorbar': {
      const xs = arr(p.XData), ys = arr(p.YData);
      const color = rgbCss(p.Color);
      const cap = (p.CapSize || 6) / 2 * PT;
      ctx.beginPath();
      for (let i = 0; i < ys.length; i++) {
        const X = m.x(xs[i]), Y = m.y(ys[i]);
        if (!finite(X) || !finite(Y)) continue;
        const yn = p.YNegativeDelta ? p.YNegativeDelta.data[i] : null, yp = p.YPositiveDelta ? p.YPositiveDelta.data[i] : null;
        if (yn != null || yp != null) {
          const a = m.y(ys[i] - (yn || 0)), b = m.y(ys[i] + (yp || 0));
          ctx.moveTo(X, a); ctx.lineTo(X, b); ctx.moveTo(X - cap, a); ctx.lineTo(X + cap, a); ctx.moveTo(X - cap, b); ctx.lineTo(X + cap, b);
        }
        const xn = p.XNegativeDelta ? p.XNegativeDelta.data[i] : null, xp = p.XPositiveDelta ? p.XPositiveDelta.data[i] : null;
        if (xn != null || xp != null) {
          const a = m.x(xs[i] - (xn || 0)), b = m.x(xs[i] + (xp || 0));
          ctx.moveTo(a, Y); ctx.lineTo(b, Y); ctx.moveTo(a, Y - cap); ctx.lineTo(a, Y + cap); ctx.moveTo(b, Y - cap); ctx.lineTo(b, Y + cap);
        }
      }
      strokeStyle(ctx, color, '-', p.LineWidth); ctx.stroke();
      if (p.LineStyle !== 'none') { polyline(ctx, xs, ys, m); strokeStyle(ctx, color, p.LineStyle, p.LineWidth); ctx.stroke(); ctx.setLineDash([]); }
      drawMarkers(ctx, xs, ys, m, p, color);
      break;
    }
    case 'scatter': drawScatter2D(ctx, c, cctx); break;
    case 'bar': case 'histogram': {
      const rects = p.Rects || [];
      const fcBase = p.FaceColor === 'auto' ? cctx.theme.accent : p.FaceColor;
      const ec = p.EdgeColor === 'none' ? null : p.EdgeColor === 'auto' || p.EdgeColor === 'flat' ? rgbCss(cctx.theme.fg) : rgbCss(p.EdgeColor);
      const alpha = p.FaceAlpha ?? 1;
      for (const r of rects) {
        const x0 = m.x(r[0]), x1 = m.x(r[2]), y0 = m.y(r[1]), y1 = m.y(r[3]);
        if (![x0, x1, y0, y1].every(finite)) continue;
        const X = Math.min(x0, x1), Y = Math.min(y0, y1), Wd = Math.abs(x1 - x0), Ht = Math.abs(y1 - y0);
        let fc = fcBase;
        if (fc === 'flat') fc = p.CData && p.CData.dims[1] === 3 ? [matAt(p.CData, r[4] % p.CData.dims[0], 0), matAt(p.CData, r[4] % p.CData.dims[0], 1), matAt(p.CData, r[4] % p.CData.dims[0], 2)] : mapColor(cctx.cmap, r[4] + 1, 1, Math.max(2, rects.length));
        if (p.DisplayStyle === 'stairs') continue;
        if (fc !== 'none') { ctx.fillStyle = rgbCss(fc, alpha); ctx.fillRect(X, Y, Wd, Ht); }
        if (ec && p.LineStyle !== 'none') { ctx.strokeStyle = ec; ctx.lineWidth = Math.max(0.5, p.LineWidth * PT * 0.8); ctx.setLineDash([]); ctx.strokeRect(Math.round(X) + 0.5, Math.round(Y) + 0.5, Math.round(Wd), Math.round(Ht)); }
      }
      if (p.DisplayStyle === 'stairs' && rects.length) {
        ctx.beginPath();
        rects.forEach((r, i) => { const a = m.x(r[0]), b = m.x(r[2]), y = m.y(r[3]); if (i === 0) ctx.moveTo(a, m.y(0)); ctx.lineTo(a, y); ctx.lineTo(b, y); if (i === rects.length - 1) ctx.lineTo(b, m.y(0)); });
        strokeStyle(ctx, rgbCss(fcBase === 'none' ? cctx.theme.fg : fcBase), '-', Math.max(1, p.LineWidth)); ctx.stroke();
      }
      if (c.type === 'bar' && p.ShowBaseLine && rects.length) {
        ctx.beginPath();
        if (p.Horizontal) { const x = Math.round(m.x(p.BaseValue)) + 0.5; ctx.moveTo(x, m.box.y); ctx.lineTo(x, m.box.y + m.box.h); }
        else { const y = Math.round(m.y(p.BaseValue)) + 0.5; ctx.moveTo(m.box.x, y); ctx.lineTo(m.box.x + m.box.w, y); }
        strokeStyle(ctx, rgbCss(cctx.theme.fg), '-', 0.5); ctx.stroke();
      }
      break;
    }
    case 'area': {
      const X = p.X || [], lo = p.Lower || [], up = p.Upper || [];
      if (!X.length) return;
      ctx.beginPath();
      for (let i = 0; i < X.length; i++) { const px = m.x(X[i]), py = m.y(up[i]); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
      for (let i = X.length - 1; i >= 0; i--) ctx.lineTo(m.x(X[i]), m.y(lo[i]));
      ctx.closePath();
      if (p.FaceColor !== 'none') { ctx.fillStyle = rgbCss(p.FaceColor === 'flat' ? cctx.theme.accent : p.FaceColor, p.FaceAlpha ?? 1); ctx.fill(); }
      if (p.EdgeColor !== 'none' && p.LineStyle !== 'none') { polyline(ctx, X, up, m); strokeStyle(ctx, rgbCss(p.EdgeColor), p.LineStyle, p.LineWidth); ctx.stroke(); ctx.setLineDash([]); }
      break;
    }
    case 'patch': drawPatch2D(ctx, c, cctx); break;
    case 'surface': drawSurface2D(ctx, c, cctx); break;
    case 'image': drawImage2D(ctx, c, cctx); break;
    case 'contour': drawContour2D(ctx, c, cctx); break;
    case 'quiver': {
      const seg = p.Segments || [], heads = p.Heads || [];
      ctx.beginPath();
      for (let i = 0; i < seg.length; i += 6) { ctx.moveTo(m.x(seg[i]), m.y(seg[i + 1])); ctx.lineTo(m.x(seg[i + 3]), m.y(seg[i + 4])); }
      for (let i = 0; i < heads.length; i += 6) { ctx.moveTo(m.x(heads[i]), m.y(heads[i + 1])); ctx.lineTo(m.x(heads[i + 3]), m.y(heads[i + 4])); }
      strokeStyle(ctx, rgbCss(p.Color), p.LineStyle, p.LineWidth); ctx.stroke(); ctx.setLineDash([]);
      if (p.Marker && p.Marker !== 'none') drawMarkers(ctx, arr(p.XData), arr(p.YData), m, { ...p, MarkerEdgeColor: 'auto', MarkerFaceColor: 'none' }, rgbCss(p.Color));
      break;
    }
    case 'rectangle': {
      const [x, y, w, h] = p.Position;
      const X0 = m.x(x), X1 = m.x(x + w), Y0 = m.y(y), Y1 = m.y(y + h);
      const L = Math.min(X0, X1), T = Math.min(Y0, Y1), Wd = Math.abs(X1 - X0), Ht = Math.abs(Y1 - Y0);
      const cv = p.Curvature.length === 1 ? [p.Curvature[0], p.Curvature[0]] : p.Curvature;
      const rx = (Wd / 2) * Math.min(1, cv[0] || 0), ry = (Ht / 2) * Math.min(1, cv[1] || 0);
      ctx.beginPath();
      if (rx > 0 && ry > 0) {
        if (rx >= Wd / 2 - 0.01 && ry >= Ht / 2 - 0.01) ctx.ellipse(L + Wd / 2, T + Ht / 2, Wd / 2, Ht / 2, 0, 0, Math.PI * 2);
        else { ctx.moveTo(L + rx, T); ctx.lineTo(L + Wd - rx, T); ctx.ellipse(L + Wd - rx, T + ry, rx, ry, 0, -Math.PI / 2, 0); ctx.lineTo(L + Wd, T + Ht - ry); ctx.ellipse(L + Wd - rx, T + Ht - ry, rx, ry, 0, 0, Math.PI / 2); ctx.lineTo(L + rx, T + Ht); ctx.ellipse(L + rx, T + Ht - ry, rx, ry, 0, Math.PI / 2, Math.PI); ctx.lineTo(L, T + ry); ctx.ellipse(L + rx, T + ry, rx, ry, 0, Math.PI, Math.PI * 1.5); ctx.closePath(); }
      } else ctx.rect(L, T, Wd, Ht);
      if (p.FaceColor !== 'none') { ctx.fillStyle = rgbCss(p.FaceColor, p.FaceAlpha ?? 1); ctx.fill(); }
      if (p.EdgeColor !== 'none' && p.LineStyle !== 'none') { strokeStyle(ctx, rgbCss(p.EdgeColor), p.LineStyle, p.LineWidth); ctx.stroke(); ctx.setLineDash([]); }
      break;
    }
    case 'text': if (p.Clipping !== false) drawText2D(ctx, c, cctx, false); break;
    case 'hggroup': for (const k of c.children.slice().reverse()) drawChild2D(ctx, k, cctx); break;
    default: break;
  }
}

function drawText2D(ctx, c, cctx, unclipped) {
  void unclipped;
  const p = c.props;
  const { m } = cctx;
  let x, y;
  if (p.Units === 'normalized') { x = m.box.x + p.Position[0] * m.box.w; y = m.box.y + (1 - p.Position[1]) * m.box.h; }
  else if (p.Units === 'pixels') { x = m.box.x + p.Position[0]; y = m.box.y + m.box.h - p.Position[1]; }
  else { x = m.x(p.Position[0]); y = m.y(p.Position[1]); }
  if (!finite(x) || !finite(y)) return;
  drawTex(ctx, p.String, x, y, {
    size: fontPx(p.FontSize), align: p.HorizontalAlignment, valign: p.VerticalAlignment, rotation: p.Rotation, color: rgbCss(colorOf(c, 'Color', cctx.theme)),
    bold: p.FontWeight === 'bold', italic: p.FontAngle === 'italic', interpreter: p.Interpreter,
    background: p.BackgroundColor === 'none' ? null : rgbCss(p.BackgroundColor), edge: p.EdgeColor === 'none' ? null : rgbCss(p.EdgeColor), margin: p.Margin,
  });
}

function drawScatter2D(ctx, c, cctx) {
  const p = c.props, m = cctx.m;
  const xs = arr(p.XData), ys = arr(p.YData);
  const S = p.SizeData ? p.SizeData.data : [36];
  const C = p.CData;
  const n = xs.length;
  const colorAt = (i) => {
    if (!C) return rgbCss(cctx.theme.accent);
    if (C.dims[1] === 3 && C.dims[0] === n && n !== 1) return rgbCss([matAt(C, i, 0), matAt(C, i, 1), matAt(C, i, 2)]);
    if (C.dims[1] === 3 && C.dims[0] === 1) return rgbCss([C.data[0], C.data[1], C.data[2]]);
    if (C.data.length === n) return colorFromCData(cctx, C.data[i]) || 'none';
    return rgbCss([C.data[0], C.data[1] ?? 0, C.data[2] ?? 0]);
  };
  const fa = p.MarkerFaceAlpha ?? 1;
  for (let i = 0; i < n; i++) {
    const X = m.x(xs[i]), Y = m.y(ys[i]);
    if (!finite(X) || !finite(Y)) continue;
    const base = colorAt(i);
    const sz = Math.sqrt(S.length === n ? S[i] : S[0]) * PT;
    const edge = p.MarkerEdgeColor === 'flat' ? base : p.MarkerEdgeColor === 'none' ? 'none' : rgbCss(p.MarkerEdgeColor);
    let face = p.MarkerFaceColor === 'flat' || p.MarkerFaceColor === 'auto' ? base : p.MarkerFaceColor === 'none' ? 'none' : rgbCss(p.MarkerFaceColor);
    if (face !== 'none' && fa < 1) { ctx.globalAlpha = fa; }
    drawMarker(ctx, p.Marker, X, Y, sz, edge, face, Math.max(0.8, p.LineWidth * PT));
    ctx.globalAlpha = 1;
  }
}

function patchFaceColor(p, cctx, f, verts) {
  const C = p.FaceVertexCData;
  if (Array.isArray(p.FaceColor)) return rgbCss(p.FaceColor, p.FaceAlpha ?? 1);
  if (p.FaceColor === 'none') return null;
  if (!C) return rgbCss(cctx.theme.fg);
  const nf = p.Faces ? p.Faces.dims[0] : 1;
  const nv = p.Vertices ? p.Vertices.dims[0] : 0;
  const rgb = C.dims[1] === 3;
  const pick = (row) => (rgb ? [matAt(C, row, 0), matAt(C, row, 1), matAt(C, row, 2)] : mapColor(cctx.cmap, C.data[row], cctx.clim[0], cctx.clim[1]));
  let col;
  if (C.dims[0] === nf && (nf !== nv || p.FaceColor === 'flat')) col = pick(f);
  else if (C.dims[0] === 1) col = pick(0);
  else if (p.FaceColor === 'interp') {
    // average colour of the face's vertices
    const cs = verts.map((v) => (rgb ? pick(v) : null)).filter(Boolean);
    if (rgb) col = [0, 1, 2].map((k) => cs.reduce((s, c) => s + c[k], 0) / cs.length);
    else { const avg = verts.reduce((s, v) => s + C.data[v], 0) / verts.length; col = mapColor(cctx.cmap, avg, cctx.clim[0], cctx.clim[1]); }
  } else col = pick(verts[0] ?? 0);
  return col ? rgbCss(col, p.FaceAlpha ?? 1) : null;
}

function drawPatch2D(ctx, c, cctx) {
  const p = c.props, m = cctx.m;
  const V = p.Vertices, F = p.Faces;
  if (!V || !F) return;
  const nv = V.dims[0], [nf, k] = F.dims;
  const ec = p.EdgeColor === 'none' ? null : p.EdgeColor === 'flat' || p.EdgeColor === 'interp' ? rgbCss(cctx.theme.fg) : rgbCss(p.EdgeColor);
  for (let f = 0; f < nf; f++) {
    const verts = [];
    for (let j = 0; j < k; j++) { const v = matAt(F, f, j); if (finite(v) && v >= 1 && v <= nv) verts.push(v - 1); }
    if (verts.length < 2) continue;
    ctx.beginPath();
    verts.forEach((v, i) => { const X = m.x(matAt(V, v, 0)), Y = m.y(matAt(V, v, 1)); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
    ctx.closePath();
    const fc = patchFaceColor(p, cctx, f, verts);
    if (fc) { ctx.fillStyle = fc; ctx.fill(); }
    if (ec && p.LineStyle !== 'none') { strokeStyle(ctx, ec, p.LineStyle, p.LineWidth); ctx.stroke(); ctx.setLineDash([]); }
  }
}

function drawSurface2D(ctx, c, cctx) {
  const p = c.props, m = cctx.m;
  const Z = p.ZData;
  if (!Z) return;
  const [rows, cols] = Z.dims;
  const X = p.XData, Y = p.YData;
  const xv = (i, j) => (X.data.length === cols && X.data.length !== rows * cols ? X.data[j] : matAt(X, i, j));
  const yv = (i, j) => (Y.data.length === rows && Y.data.length !== rows * cols ? Y.data[i] : matAt(Y, i, j));
  const C = p.CData || Z;
  const truecolor = C.dims.length === 3;
  const colAt = (i, j) => truecolor ? rgbCss([matAt(C, i, j), C.data[i + j * rows + rows * cols], C.data[i + j * rows + 2 * rows * cols]]) : colorFromCData(cctx, matAt(C, i, j));
  const ec = p.EdgeColor === 'none' ? null : Array.isArray(p.EdgeColor) ? rgbCss(p.EdgeColor) : 'flat';
  for (let j = 0; j < cols - 1; j++) for (let i = 0; i < rows - 1; i++) {
    const pts = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
    ctx.beginPath();
    let bad = false;
    pts.forEach(([a, b], q) => { const sx = m.x(xv(a, b)), sy = m.y(yv(a, b)); if (!finite(sx) || !finite(sy) || !finite(matAt(Z, a, b))) bad = true; q ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); });
    if (bad) continue;
    ctx.closePath();
    if (p.FaceColor !== 'none') {
      let col;
      if (Array.isArray(p.FaceColor)) col = rgbCss(p.FaceColor);
      else if (p.FaceColor === 'interp' && !truecolor) col = colorFromCData(cctx, (matAt(C, i, j) + matAt(C, i + 1, j) + matAt(C, i + 1, j + 1) + matAt(C, i, j + 1)) / 4);
      else col = colAt(i, j);
      if (col) { ctx.fillStyle = col; ctx.fill(); if (!ec) { ctx.strokeStyle = col; ctx.lineWidth = 0.6; ctx.stroke(); } }
    }
    if (ec) { ctx.strokeStyle = ec === 'flat' ? colAt(i, j) : ec; ctx.lineWidth = Math.max(0.5, p.LineWidth * PT * 0.8); ctx.setLineDash([]); ctx.stroke(); }
  }
}

const imageCache = new WeakMap();
function drawImage2D(ctx, c, cctx) {
  const p = c.props, m = cctx.m;
  const C = p.CData;
  if (!C) return;
  const [h, w] = C.dims;
  const key = `${cctx.clim.join(',')}|${cctx.cmap.length}|${cctx.cmap[0]}|${p.CDataMapping}`;
  let cached = imageCache.get(C);
  if (!cached || cached.key !== key) {
    const canvas = makeCanvas(w, h);
    const ictx = canvas.getContext('2d');
    const img = ictx.createImageData(w, h);
    const truecolor = C.dims.length === 3 && C.dims[2] >= 3;
    const scale = C.cls === 'uint8' ? 1 / 255 : C.cls === 'uint16' ? 1 / 65535 : 1;
    const A = p.AlphaData && p.AlphaData.data.length === w * h ? p.AlphaData.data : null;
    for (let i = 0; i < h; i++) for (let j = 0; j < w; j++) {
      const o = (i * w + j) * 4;
      const k = i + j * h;
      let col;
      if (truecolor) col = [C.data[k] * scale, C.data[k + w * h] * scale, C.data[k + 2 * w * h] * scale];
      else if (p.CDataMapping === 'scaled') col = mapColor(cctx.cmap, C.data[k], cctx.clim[0], cctx.clim[1]);
      else { const idx = Math.max(1, Math.min(cctx.cmap.length, Math.floor(C.data[k]))); col = finite(C.data[k]) ? cctx.cmap[idx - 1] : null; }
      if (!col) { img.data[o + 3] = 0; continue; }
      img.data[o] = Math.round(Math.max(0, Math.min(1, col[0])) * 255);
      img.data[o + 1] = Math.round(Math.max(0, Math.min(1, col[1])) * 255);
      img.data[o + 2] = Math.round(Math.max(0, Math.min(1, col[2])) * 255);
      img.data[o + 3] = A ? Math.round(Math.max(0, Math.min(1, A[k])) * 255) : 255;
    }
    ictx.putImageData(img, 0, 0);
    cached = { key, canvas };
    imageCache.set(C, cached);
  }
  const xd = p.XData, yd = p.YData;
  const x1 = xd[0], x2 = xd.length > 1 ? xd[xd.length - 1] : xd[0] + w - 1;
  const y1 = yd[0], y2 = yd.length > 1 ? yd[yd.length - 1] : yd[0] + h - 1;
  const hx = w > 1 ? (x2 - x1) / (w - 1) / 2 : 0.5, hy = h > 1 ? (y2 - y1) / (h - 1) / 2 : 0.5;
  const L = m.x(x1 - hx), R = m.x(x2 + hx), T = m.y(y1 - hy), B = m.y(y2 + hy);
  ctx.save();
  ctx.imageSmoothingEnabled = p.Interpolation === 'bilinear';
  ctx.translate(L, T);
  ctx.scale((R - L) / w, (B - T) / h);
  ctx.drawImage(cached.canvas, 0, 0);
  ctx.restore();
}

export function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(Math.max(1, w), Math.max(1, h));
  const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c;
}

function drawContour2D(ctx, c, cctx) {
  const p = c.props, m = cctx.m;
  const levels = p.LevelList || [];
  if (p.Fill && p.Bands) {
    for (const b of p.Bands) {
      const v = Number.isFinite(b.lo) ? b.lo : (levels.length ? levels[0] - 1e-9 : b.hi);
      const col = mapColor(cctx.cmap, v, cctx.clim[0], cctx.clim[1]);
      if (!col || !b.polys.length) continue;
      ctx.beginPath();
      for (const poly of b.polys) {
        for (let i = 0; i < poly.length; i += 2) { const X = m.x(poly[i]), Y = m.y(poly[i + 1]); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }
        ctx.closePath();
      }
      ctx.fillStyle = rgbCss(col, p.FaceAlpha ?? 1);
      ctx.fill('nonzero');
      ctx.strokeStyle = rgbCss(col, p.FaceAlpha ?? 1); ctx.lineWidth = 0.35; ctx.stroke(); // hide hairline seams
    }
  }
  if (p.LineColor === 'none' || p.LineStyle === 'none') return;
  for (const l of p.Lines || []) {
    const col = p.LineColor === 'flat' ? mapColor(cctx.cmap, l.level, cctx.clim[0], cctx.clim[1]) : p.LineColor;
    ctx.beginPath();
    for (let i = 0; i < l.points.length; i += 2) { const X = m.x(l.points[i]), Y = m.y(l.points[i + 1]); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }
    strokeStyle(ctx, rgbCss(col || [0, 0, 0]), p.LineStyle, p.LineWidth); ctx.stroke(); ctx.setLineDash([]);
  }
  if (p.ShowText) {
    const fs = fontPx(8);
    for (const l of p.Lines || []) {
      const n = l.points.length / 2;
      if (n < 8) continue;
      const k = Math.floor(n / 2);
      const X = m.x(l.points[2 * k]), Y = m.y(l.points[2 * k + 1]);
      const label = String(Number(l.level.toPrecision(4)));
      ctx.font = `${fs}px sans-serif`;
      const w = ctx.measureText(label).width;
      ctx.fillStyle = rgbCss(colorOf(cctx.ax, 'Color', cctx.theme));
      ctx.fillRect(X - w / 2 - 2, Y - fs / 2 - 1, w + 4, fs + 2);
      drawTex(ctx, label, X, Y, { size: fs, align: 'center', valign: 'middle', color: rgbCss(cctx.theme.fg), interpreter: 'none' });
    }
  }
}

// ---------------------------------------------------------------- legend / colorbar

function legendItems(ax) {
  const lg = ax.props.Legend;
  if (!lg) return [];
  const byId = new Map();
  const walk = (n) => { for (const c of n.children) { byId.set(c.id, c); if (c.type === 'hggroup') walk(c); } };
  walk(ax);
  return (lg.props.Entries || []).map((e) => ({ label: e.label, node: byId.get(e.target) })).filter((e) => e.node);
}

function legendSize(ctx, ax) {
  const lg = ax.props.Legend;
  const fs = fontPx(lg.props.FontSize);
  const items = legendItems(ax);
  const widths = items.map((e) => measureTex(ctx, e.label, fs).width);
  const horiz = lg.props.Orientation === 'horizontal';
  const cols = horiz ? items.length : Math.max(1, lg.props.NumColumns || 1);
  const rows = Math.ceil(items.length / cols);
  const colW = Math.max(10, ...widths) + 40;
  const titleH = lg.props.Title ? fs * 1.4 : 0;
  return { w: horiz ? widths.reduce((s, w) => s + w + 40, 0) + 8 : cols * colW + 8, h: rows * fs * 1.45 + 8 + titleH, fs, items, cols, colW, widths, titleH };
}

export function drawLegend(ctx, ax, box, theme) {
  const lg = ax.props.Legend;
  const S = legendSize(ctx, ax);
  if (!S.items.length) return null;
  const loc = lg.props.Location;
  const pad = 8;
  let x, y;
  const L = box.x, T = box.y, R = box.x + box.w, B = box.y + box.h;
  const best = loc === 'best' ? 'northeast' : loc === 'bestoutside' ? 'northeastoutside' : loc;
  switch (best) {
    case 'northwest': x = L + pad; y = T + pad; break;
    case 'north': x = (L + R - S.w) / 2; y = T + pad; break;
    case 'southwest': x = L + pad; y = B - S.h - pad; break;
    case 'south': x = (L + R - S.w) / 2; y = B - S.h - pad; break;
    case 'southeast': x = R - S.w - pad; y = B - S.h - pad; break;
    case 'east': x = R - S.w - pad; y = (T + B - S.h) / 2; break;
    case 'west': x = L + pad; y = (T + B - S.h) / 2; break;
    case 'eastoutside': case 'northeastoutside': x = R + 10 + (ax.props.Colorbar && ax.props.Colorbar.props.Location === 'eastoutside' ? colorbarThickness(ctx, ax) + 10 : 0); y = best === 'eastoutside' ? (T + B - S.h) / 2 : T; break;
    case 'westoutside': case 'northwestoutside': x = L - S.w - 10 - 40; y = T; break;
    case 'southoutside': x = (L + R - S.w) / 2; y = B + 40; break;
    case 'northoutside': x = (L + R - S.w) / 2; y = T - S.h - 4; break;
    default: x = R - S.w - pad; y = T + pad;
  }
  const bg = colorOf(lg, 'Color', theme);
  if (bg !== 'none') { ctx.fillStyle = rgbCss(bg); ctx.fillRect(x, y, S.w, S.h); }
  if (lg.props.Box) { ctx.strokeStyle = rgbCss(colorOf(lg, 'EdgeColor', theme)); ctx.lineWidth = 1; ctx.setLineDash([]); ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(S.w), Math.round(S.h)); }
  const tc = rgbCss(colorOf(lg, 'TextColor', theme));
  let oy = y + 4 + S.titleH;
  if (lg.props.Title) drawTex(ctx, String(lg.props.Title), x + S.w / 2, y + 4, { size: S.fs, align: 'center', valign: 'top', bold: true, color: tc });
  const rowH = S.fs * 1.45;
  let cx = x + 4;
  S.items.forEach((e, i) => {
    let ix, iy;
    if (lg.props.Orientation === 'horizontal') { ix = cx; iy = oy; cx += S.widths[i] + 40; }
    else { const col = i % S.cols, row = Math.floor(i / S.cols); ix = x + 4 + col * S.colW; iy = oy + row * rowH; }
    drawLegendIcon(ctx, e.node, ix + 2, iy + rowH / 2, 26, theme, ax);
    drawTex(ctx, e.label, ix + 34, iy + rowH / 2, { size: S.fs, align: 'left', valign: 'middle', color: tc, interpreter: lg.props.Interpreter });
  });
  return { x, y, w: S.w, h: S.h };
}

function drawLegendIcon(ctx, n, x, y, w, theme, ax) {
  const p = n.props;
  const cmap = cmapRows(ax.props.Colormap);
  ctx.setLineDash([]);
  switch (n.type) {
    case 'line': case 'animatedline': case 'stair': case 'errorbar': case 'stem': case 'quiver': {
      const col = p.Color === 'none' ? 'none' : rgbCss(p.Color);
      if (p.LineStyle !== 'none') { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); strokeStyle(ctx, col, p.LineStyle, p.LineWidth); ctx.stroke(); ctx.setLineDash([]); }
      if (p.Marker && p.Marker !== 'none') { const mc = markerColors(p, col); drawMarker(ctx, p.Marker, x + w / 2, y, Math.min(10, p.MarkerSize * PT), mc.edge, mc.face, 1); }
      break;
    }
    case 'scatter': {
      const C = p.CData;
      const col = C && C.dims[1] === 3 ? rgbCss([C.data[0], C.data[C.dims[0]], C.data[2 * C.dims[0]]]) : rgbCss(cmap[Math.floor(cmap.length / 2)]);
      drawMarker(ctx, p.Marker, x + w / 2, y, 8, p.MarkerEdgeColor === 'none' ? 'none' : col, p.MarkerFaceColor === 'none' ? 'none' : col, 1);
      break;
    }
    default: {
      let fc = p.FaceColor;
      const mapped = n.type === 'surface' || n.type === 'contour' || n.type === 'patch';
      // a mesh has white faces and coloured edges: show the colormap so the swatch is visible
      if (!Array.isArray(fc) || (mapped && fc.every((v) => v > 0.95))) fc = mapped ? cmap[Math.floor(cmap.length * 0.6)] : theme.accent;
      ctx.fillStyle = rgbCss(fc, p.FaceAlpha ?? 1);
      ctx.fillRect(x + 2, y - 5, w - 4, 10);
      const ec = Array.isArray(p.EdgeColor) ? p.EdgeColor : Array.isArray(p.LineColor) ? p.LineColor : null;
      if (ec) { ctx.strokeStyle = rgbCss(ec); ctx.lineWidth = 1; ctx.strokeRect(x + 2.5, y - 4.5, w - 5, 9); }
    }
  }
}

function colorbarThickness(ctx, ax) {
  const cb = ax.props.Colorbar;
  const fs = fontPx(cb.props.FontSize);
  ctx.font = `${fs}px sans-serif`;
  const L = cb.props.Limits || [0, 1];
  const t = ticksFor(L[0], L[1], 'linear', 8);
  const labels = cb.props.TicksMode === 'manual' ? cb.props.Ticks.map(String) : tickLabels(t).labels;
  return 14 + 6 + Math.max(0, ...labels.map((s) => ctx.measureText(s).width)) + (cb.props.Label && hasText(cb.props.Label) ? fs * 1.6 : 0);
}

export function drawColorbar(ctx, ax, box, theme, beside = false) {
  const cb = ax.props.Colorbar;
  const p = cb.props;
  const cmap = cmapRows(p.Colormap || ax.props.Colormap);
  const L = p.Limits || ax.props.CLim || [0, 1];
  const fs = fontPx(p.FontSize);
  const loc = p.Location;
  const vertical = !/north|south/.test(loc);
  const th = 14;
  let x, y, w, h;
  if (beside) { x = box.x; y = box.y; w = th; h = box.h; }
  else if (vertical) {
    h = box.h; y = box.y; w = th;
    x = loc === 'eastoutside' ? box.x + box.w + 10 : loc === 'westoutside' ? box.x - 10 - colorbarThickness(ctx, ax) : loc === 'west' ? box.x + 10 : box.x + box.w - th - 40;
    if (loc === 'westoutside') x = box.x - colorbarThickness(ctx, ax) - 10 + (colorbarThickness(ctx, ax) - th);
  } else {
    w = box.w; x = box.x; h = th;
    y = loc === 'southoutside' ? box.y + box.h + 30 : loc === 'northoutside' ? box.y - th - 8 : loc === 'south' ? box.y + box.h - th - 30 : box.y + 10;
  }
  const n = cmap.length;
  const rev = p.Direction === 'reverse';
  for (let i = 0; i < n; i++) {
    const c = cmap[rev ? n - 1 - i : i];
    ctx.fillStyle = rgbCss(c);
    if (vertical) { const y0 = y + h - ((i + 1) * h) / n; ctx.fillRect(x, y0, w, h / n + 0.6); }
    else { const x0 = x + (i * w) / n; ctx.fillRect(x0, y, w / n + 0.6, h); }
  }
  const fg = rgbCss(colorOf(cb, 'Color', theme));
  ctx.strokeStyle = fg; ctx.lineWidth = 1; ctx.setLineDash([]);
  ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w), Math.round(h));
  const ticks = p.TicksMode === 'manual' ? p.Ticks : ticksFor(L[0], L[1], 'linear', vertical ? Math.max(3, Math.floor(h / 36)) : Math.max(3, Math.floor(w / 70)));
  const labels = p.TickLabelsMode === 'manual' ? p.TickLabels : tickLabels(ticks).labels;
  ctx.beginPath();
  ticks.forEach((v, i) => {
    if (v < Math.min(...L) || v > Math.max(...L)) return;
    const f = (v - L[0]) / (L[1] - L[0] || 1);
    const ff = rev ? 1 - f : f;
    if (vertical) {
      const ty = Math.round(y + h - ff * h) + 0.5;
      ctx.moveTo(x, ty); ctx.lineTo(x + 3, ty); ctx.moveTo(x + w, ty); ctx.lineTo(x + w - 3, ty);
      drawTex(ctx, String(labels[i] ?? ''), x + w + 5, ty, { size: fs, align: 'left', valign: 'middle', color: fg });
    } else {
      const tx = Math.round(x + ff * w) + 0.5;
      ctx.moveTo(tx, y); ctx.lineTo(tx, y + 3); ctx.moveTo(tx, y + h); ctx.lineTo(tx, y + h - 3);
      drawTex(ctx, String(labels[i] ?? ''), tx, loc === 'northoutside' ? y - 3 : y + h + 3, { size: fs, align: 'center', valign: loc === 'northoutside' ? 'bottom' : 'top', color: fg });
    }
  });
  ctx.stroke();
  if (p.Label && hasText(p.Label)) {
    const t = p.Label;
    if (vertical) { ctx.font = `${fs}px sans-serif`; const lw = Math.max(0, ...labels.map((s) => ctx.measureText(String(s)).width)); drawTex(ctx, t.props.String, x + w + 10 + lw, y + h / 2, { size: fontPx(t.props.FontSize), align: 'center', valign: 'top', rotation: 90, color: fg }); }
    else drawTex(ctx, t.props.String, x + w / 2, y + h + fs * 1.6, { size: fontPx(t.props.FontSize), align: 'center', valign: 'top', color: fg });
  }
  return { x, y, w, h };
}

// ---------------------------------------------------------------- polar axes

function drawPolar(ctx, it, opts) {
  const ax = it.node, p = ax.props, theme = opts.theme, b = it.box;
  const { cx, cy, r } = b;
  const fg = rgbCss(colorOf(ax, 'XColor', theme));
  const fs = fontPx(p.FontSize);
  const RL = p.RLim || [0, 1], TL = p.ThetaLim || [0, 360];
  const dirSign = p.ThetaDir === 'clockwise' ? -1 : 1;
  const zero = { right: 0, top: 90, left: 180, bottom: 270 }[p.ThetaZeroLocation] || 0;
  const ang = (thDeg) => ((zero + dirSign * thDeg) * Math.PI) / 180;
  const rad = (v) => ((v - RL[0]) / (RL[1] - RL[0] || 1)) * r;
  const toXY = (th, rv) => { const a = ang((th * 180) / Math.PI); const rr = rad(rv); return [cx + rr * Math.cos(a), cy - rr * Math.sin(a)]; };
  it.polar = { cx, cy, r, RL, toXY, inv: (x, y) => { const dx = x - cx, dy = cy - y; let a = (Math.atan2(dy, dx) * 180) / Math.PI - zero; a = dirSign * a; a = ((a % 360) + 360) % 360; return [a, RL[0] + (Math.hypot(dx, dy) / r) * (RL[1] - RL[0])]; } };
  const full = TL[1] - TL[0] >= 360;
  const bg = colorOf(ax, 'Color', theme);
  if (p.Visible !== false && bg !== 'none') {
    ctx.beginPath();
    if (full) ctx.arc(cx, cy, r, 0, Math.PI * 2);
    else { ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, -ang(TL[0]), -ang(TL[1]), dirSign > 0); ctx.closePath(); }
    ctx.fillStyle = rgbCss(bg); ctx.fill();
  }
  if (p.Visible !== false) {
    const gc = rgbCss(colorOf(ax, 'GridColor', theme), Math.min(1, (theme.gridMajorAlpha || 0.3)));
    ctx.strokeStyle = gc; ctx.lineWidth = 1; ctx.setLineDash([]);
    const minorOn = opts.grid5;
    for (const v of p.RTick || []) { if (v <= RL[0]) continue; ctx.beginPath(); ctx.arc(cx, cy, rad(v), -ang(TL[0]), -ang(TL[1]), dirSign > 0); ctx.stroke(); }
    if (minorOn && (p.RTick || []).length > 1) {
      ctx.strokeStyle = rgbCss(colorOf(ax, 'GridColor', theme), theme.gridAlpha || 0.12);
      const st = (p.RTick[1] - p.RTick[0]) / 5;
      for (let v = RL[0] + st; v < RL[1]; v += st) { if (Math.abs(v / (st * 5) - Math.round(v / (st * 5))) < 1e-6) continue; ctx.beginPath(); ctx.arc(cx, cy, rad(v), -ang(TL[0]), -ang(TL[1]), dirSign > 0); ctx.stroke(); }
      ctx.strokeStyle = gc;
    }
    for (const t of p.ThetaTick || []) { const a = ang(t); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + r * Math.cos(a), cy - r * Math.sin(a)); ctx.stroke(); }
    ctx.strokeStyle = fg; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, r, -ang(TL[0]), -ang(TL[1]), dirSign > 0); if (!full) { ctx.lineTo(cx, cy); ctx.closePath(); } ctx.stroke();
    (p.ThetaTick || []).forEach((t, i) => {
      const a = ang(t);
      const lbl = (p.ThetaTickLabel || [])[i] ?? `${t}°`;
      drawTex(ctx, lbl, cx + (r + fs * 1.1) * Math.cos(a), cy - (r + fs * 1.1) * Math.sin(a), { size: fs, align: 'center', valign: 'middle', color: fg, interpreter: 'none' });
    });
    const ra = ang(p.RAxisLocation ?? 80);
    (p.RTick || []).forEach((v, i) => {
      const lbl = (p.RTickLabel || [])[i] ?? String(v);
      const rr = rad(v);
      drawTex(ctx, lbl, cx + rr * Math.cos(ra) + 3, cy - rr * Math.sin(ra), { size: fs * 0.92, align: 'left', valign: 'bottom', color: fg });
    });
    drawTitleBlock(ctx, ax, it.outer.x + it.outer.w / 2, it.outer.y + 6, theme);
  }
  // data
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r + 1, 0, Math.PI * 2); ctx.clip();
  const cmap = cmapRows(p.Colormap);
  const pm = { x: (v) => v, y: (v) => v, box: b };
  for (const c of ax.children.slice().reverse()) {
    const q = c.props;
    if (q.Visible === false) continue;
    if (c.type === 'line' || c.type === 'scatter' || c.type === 'animatedline') {
      const th = arr(q.XData), rv = arr(q.YData);
      const xs = [], ys = [];
      for (let i = 0; i < th.length; i++) { const [X, Y] = toXY(th[i], rv[i]); xs.push(finite(rv[i]) ? X : NaN); ys.push(Y); }
      if (c.type === 'scatter') drawScatter2D(ctx, { ...c, props: { ...q, XData: { dims: [1, xs.length], data: xs }, YData: { dims: [1, ys.length], data: ys } } }, { m: pm, cmap, clim: p.CLim, theme });
      else {
        const col = rgbCss(q.Color);
        if (q.LineStyle !== 'none') { polyline(ctx, xs, ys, pm); strokeStyle(ctx, col, q.LineStyle, q.LineWidth); ctx.stroke(); ctx.setLineDash([]); }
        drawMarkers(ctx, xs, ys, pm, q, col);
      }
    } else if (c.type === 'text') {
      const [X, Y] = toXY(q.Position[0], q.Position[1]);
      drawTex(ctx, q.String, X, Y, { size: fontPx(q.FontSize), align: q.HorizontalAlignment, valign: q.VerticalAlignment, color: rgbCss(colorOf(c, 'Color', theme)) });
    }
  }
  ctx.restore();
  if (p.Legend && p.Legend.props.Visible !== false) drawLegend(ctx, ax, { x: b.x - 20, y: b.y - 10, w: b.w + 60, h: b.h + 20 }, theme);
}

// ---------------------------------------------------------------- heatmap

function drawHeatmap(ctx, it, opts) {
  const hm = it.node, p = hm.props, theme = opts.theme, b = it.box;
  const C = p.ColorData;
  if (!C) return;
  const [m, n] = C.dims;
  const cmap = cmapRows(p.Colormap);
  const L = p.ColorLimits || [0, 1];
  const fs = fontPx(p.FontSize);
  const cw = b.w / n, ch = b.h / m;
  const fg = rgbCss(theme.fg);
  for (let i = 0; i < m; i++) for (let j = 0; j < n; j++) {
    const v = C.data[i + j * m];
    const col = finite(v) ? mapColor(cmap, v, L[0], L[1]) : colorOf(hm, 'MissingDataColor', theme);
    ctx.fillStyle = rgbCss(col);
    ctx.fillRect(b.x + j * cw, b.y + i * ch, cw + 0.5, ch + 0.5);
    if (p.CellLabelColor !== 'none' && cw > 24 && ch > fs) {
      const lum = 0.2126 * col[0] + 0.7152 * col[1] + 0.0722 * col[2];
      const text = finite(v) ? fmtCell(v, p.CellLabelFormat) : (p.MissingDataLabel || 'NaN');
      drawTex(ctx, text, b.x + (j + 0.5) * cw, b.y + (i + 0.5) * ch, { size: Math.min(fs, ch * 0.6), align: 'center', valign: 'middle', color: lum > 0.5 ? '#111' : '#f4f4f4', interpreter: 'none' });
    }
  }
  if (p.GridVisible) {
    ctx.strokeStyle = rgbCss(theme.axes, 0.9); ctx.lineWidth = 1; ctx.beginPath();
    for (let j = 1; j < n; j++) { const x = Math.round(b.x + j * cw) + 0.5; ctx.moveTo(x, b.y); ctx.lineTo(x, b.y + b.h); }
    for (let i = 1; i < m; i++) { const y = Math.round(b.y + i * ch) + 0.5; ctx.moveTo(b.x, y); ctx.lineTo(b.x + b.w, y); }
    ctx.stroke();
  }
  ctx.strokeStyle = fg; ctx.strokeRect(Math.round(b.x) + 0.5, Math.round(b.y) + 0.5, Math.round(b.w), Math.round(b.h));
  (p.XDisplayLabels || []).forEach((s, j) => drawTex(ctx, String(s), b.x + (j + 0.5) * cw, b.y + b.h + 4, { size: fs, align: 'center', valign: 'top', color: fg, interpreter: 'none' }));
  (p.YDisplayLabels || []).forEach((s, i) => drawTex(ctx, String(s), b.x - 5, b.y + (i + 0.5) * ch, { size: fs, align: 'right', valign: 'middle', color: fg, interpreter: 'none' }));
  if (p.Title) drawTex(ctx, p.Title, b.x + b.w / 2, it.outer.y + 6, { size: fs * 1.1, align: 'center', valign: 'top', bold: true, color: fg });
  if (p.XLabel) drawTex(ctx, p.XLabel, b.x + b.w / 2, b.y + b.h + fs * 1.6 + 4, { size: fs * 1.05, align: 'center', valign: 'top', color: fg });
  if (p.YLabel) { ctx.font = `${fs}px sans-serif`; const yw = Math.max(0, ...(p.YDisplayLabels || []).map((s) => ctx.measureText(String(s)).width)); drawTex(ctx, p.YLabel, b.x - yw - 12, b.y + b.h / 2, { size: fs * 1.05, align: 'center', valign: 'bottom', rotation: 90, color: fg }); }
  if (p.ColorbarVisible) {
    const fake = { props: { Colorbar: { props: { Location: 'eastoutside', Limits: L, FontSize: p.FontSize, Colormap: p.Colormap, TicksMode: 'auto', TickLabelsMode: 'auto', Direction: 'normal', Label: null }, auto: ['Color'], type: 'colorbar' }, Colormap: p.Colormap, CLim: L } };
    drawColorbar(ctx, fake, b, theme);
  }
}
function fmtCell(v, f) {
  const m = /%(\d*)\.?(\d*)([dfgeG])/.exec(f || '%.3g');
  if (!m) return String(v);
  const prec = m[2] === '' ? 4 : Number(m[2]);
  if (m[3] === 'd') return String(Math.round(v));
  if (m[3] === 'f') return v.toFixed(prec);
  if (m[3] === 'e') return v.toExponential(prec);
  return String(Number(v.toPrecision(Math.max(1, prec))));
}

// ---------------------------------------------------------------- annotations / waitbar

function drawAnnotation(ctx, a, W, H, theme, sgH) {
  void sgH;
  const p = a.props;
  const X = (u) => u * W, Y = (v) => (1 - v) * H;
  const col = rgbCss(colorOf(a, 'Color', theme));
  ctx.setLineDash(dashFor(p.LineStyle, p.LineWidth * PT));
  ctx.lineWidth = Math.max(1, p.LineWidth * PT);
  ctx.strokeStyle = col;
  const shape = p.Shape;
  const arrowHead = (x0, y0, x1, y1) => {
    const ang = Math.atan2(y1 - y0, x1 - x0), L = p.HeadLength || 10, Wd = (p.HeadWidth || 10) / 2;
    ctx.beginPath(); ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - L * Math.cos(ang) + Wd * Math.sin(ang), y1 - L * Math.sin(ang) - Wd * Math.cos(ang));
    ctx.lineTo(x1 - L * Math.cos(ang) - Wd * Math.sin(ang), y1 - L * Math.sin(ang) + Wd * Math.cos(ang));
    ctx.closePath(); ctx.fillStyle = col; ctx.setLineDash([]); ctx.fill();
  };
  if (['line', 'arrow', 'doublearrow', 'textarrow'].includes(shape)) {
    const x0 = X(p.X[0]), y0 = Y(p.Y[0]), x1 = X(p.X[1]), y1 = Y(p.Y[1]);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    if (shape !== 'line') arrowHead(x0, y0, x1, y1);
    if (shape === 'doublearrow') arrowHead(x1, y1, x0, y0);
    if (shape === 'textarrow' && p.String) drawTex(ctx, p.String, x0, y0, { size: fontPx(p.FontSize), align: x0 < x1 ? 'right' : 'left', valign: 'middle', color: rgbCss(colorOf(a, 'TextColor', theme)) });
  } else {
    const [l, b, w, h] = p.Position;
    const x = X(l), y = Y(b + h), wd = w * W, ht = h * H;
    ctx.beginPath();
    if (shape === 'ellipse') ctx.ellipse(x + wd / 2, y + ht / 2, Math.abs(wd / 2), Math.abs(ht / 2), 0, 0, Math.PI * 2); else ctx.rect(x, y, wd, ht);
    const fc = shape === 'textbox' ? p.BackgroundColor : p.FaceColor;
    if (fc && fc !== 'none') { ctx.fillStyle = rgbCss(fc, p.FaceAlpha ?? 1); ctx.fill(); }
    const ec = shape === 'textbox' ? p.EdgeColor : p.Color;
    if (ec !== 'none' && p.LineStyle !== 'none') { ctx.strokeStyle = rgbCss(shape === 'textbox' ? colorOf(a, 'EdgeColor', theme) : col); ctx.stroke(); }
    if (shape === 'textbox' && p.String) {
      const ax = p.HorizontalAlignment === 'center' ? x + wd / 2 : p.HorizontalAlignment === 'right' ? x + wd - 4 : x + 4;
      drawTex(ctx, p.String, ax, y + 4, { size: fontPx(p.FontSize), align: p.HorizontalAlignment, valign: 'top', color: rgbCss(colorOf(a, 'Color', theme)), bold: p.FontWeight === 'bold', interpreter: p.Interpreter });
    }
  }
  ctx.setLineDash([]);
}

function drawWaitbar(ctx, wb, W, H, theme) {
  const p = wb.props;
  const pad = 16;
  drawTex(ctx, p.Message || '', pad, pad, { size: 13, align: 'left', valign: 'top', color: rgbCss(theme.fg), interpreter: 'none' });
  const y = Math.min(H - 30, pad + 28), w = W - 2 * pad;
  ctx.fillStyle = rgbCss(theme.axes); ctx.fillRect(pad, y, w, 16);
  ctx.fillStyle = rgbCss(theme.accent); ctx.fillRect(pad, y, w * Math.max(0, Math.min(1, p.Value)), 16);
  ctx.strokeStyle = rgbCss(theme.muted); ctx.lineWidth = 1; ctx.strokeRect(pad + 0.5, y + 0.5, w, 16);
}

// ---------------------------------------------------------------- rulers

/**
 * Rulers along the top and left edges (thickness RULER px) for the data
 * coordinates of a 2D mapper: major ticks with labels, minor ticks, and
 * the cursor position marker. `offset` = where the figure content starts.
 */
export function drawRulers(ctx, W, H, mapper, cursor, theme, info3d = null) {
  const R = RULER;
  ctx.save();
  ctx.fillStyle = rgbCss(theme.ruler);
  ctx.fillRect(0, 0, W, R);
  ctx.fillRect(0, 0, R, H);
  ctx.strokeStyle = rgbCss(theme.rulerLine);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, R - 0.5); ctx.lineTo(W, R - 0.5);
  ctx.moveTo(R - 0.5, 0); ctx.lineTo(R - 0.5, H);
  ctx.stroke();
  const tc = rgbCss(theme.rulerText);
  ctx.fillStyle = tc;
  ctx.strokeStyle = tc;
  ctx.font = '10px "Segoe UI", sans-serif';
  if (mapper) {
    const axisTicks = (lo, hi, ppu) => {
      const majorStep = niceNum(70 / Math.max(1e-12, ppu), false);
      const lead = Math.round(majorStep / 10 ** Math.floor(Math.log10(majorStep)));
      const minor = majorStep / (lead === 2 ? 4 : 5);
      const out = [];
      const a = Math.min(lo, hi), b = Math.max(lo, hi);
      const first = Math.ceil(a / minor - 1e-9);
      for (let i = first; ; i++) { const v = i * minor; if (v > b + minor * 1e-9 || out.length > 2000) break; out.push({ v: Number(v.toPrecision(12)), major: Math.abs(v / majorStep - Math.round(v / majorStep)) < 1e-6 }); }
      return { out, majorStep };
    };
    const lbl = (v, step) => { const d = Math.max(0, -Math.floor(Math.log10(step)) + (String(step).startsWith('2') || String(step).startsWith('5') ? 1 : 0)); const s = v.toFixed(Math.min(10, d)); return s === '-0' ? '0' : s; };
    // visible data range across the whole canvas width / height
    const loX = mapper.invX(R), hiX = mapper.invX(W), loY = mapper.invY(H), hiY = mapper.invY(R);
    if (mapper.xscale !== 'log') {
      const t = axisTicks(loX, hiX, mapper.pxPerUnitX);
      ctx.beginPath();
      for (const { v, major } of t.out) {
        const x = Math.round(mapper.x(v)) + 0.5;
        if (x < R || x > W) continue;
        ctx.moveTo(x, R); ctx.lineTo(x, R - (major ? 12 : 5));
        if (major) { ctx.textBaseline = 'top'; ctx.textAlign = 'left'; ctx.fillText(lbl(v, t.majorStep), x + 3, 2); }
      }
      ctx.stroke();
    }
    if (mapper.yscale !== 'log') {
      const t = axisTicks(loY, hiY, mapper.pxPerUnitY);
      ctx.beginPath();
      for (const { v, major } of t.out) {
        const y = Math.round(mapper.y(v)) + 0.5;
        if (y < R || y > H) continue;
        ctx.moveTo(R, y); ctx.lineTo(R - (major ? 12 : 5), y);
        if (major) { ctx.save(); ctx.translate(2, y - 3); ctx.rotate(-Math.PI / 2); ctx.textBaseline = 'top'; ctx.textAlign = 'left'; ctx.fillText(lbl(v, t.majorStep), 0, 0); ctx.restore(); }
      }
      ctx.stroke();
    }
  }
  if (cursor) {
    ctx.strokeStyle = rgbCss(theme.accent);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(Math.round(cursor.x) + 0.5, 0); ctx.lineTo(Math.round(cursor.x) + 0.5, R);
    ctx.moveTo(0, Math.round(cursor.y) + 0.5); ctx.lineTo(R, Math.round(cursor.y) + 0.5);
    ctx.stroke();
    // little triangles
    ctx.fillStyle = rgbCss(theme.accent);
    ctx.beginPath(); ctx.moveTo(cursor.x - 4, R - 6); ctx.lineTo(cursor.x + 4, R - 6); ctx.lineTo(cursor.x, R); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(R - 6, cursor.y - 4); ctx.lineTo(R - 6, cursor.y + 4); ctx.lineTo(R, cursor.y); ctx.closePath(); ctx.fill();
  }
  if (info3d) {
    ctx.fillStyle = tc; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText(info3d, W - 6, 5);
  }
  // corner
  ctx.fillStyle = rgbCss(theme.ruler);
  ctx.fillRect(0, 0, R, R);
  ctx.strokeStyle = rgbCss(theme.rulerLine);
  ctx.strokeRect(0.5, 0.5, R - 1, R - 1);
  ctx.restore();
}

export { hasText, fontPx, matLen };
