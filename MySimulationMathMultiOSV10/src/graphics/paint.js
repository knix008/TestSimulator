// Paints a whole figure (2D canvas parts + the WebGL 3D axes composited in)
// into any Canvas 2D-like context: the screen canvas, an export canvas or the
// SVG recorder. Also the export / getframe encoders the engine requests.
import { drawFigure, computeLayout, makeMapper, drawRulers, RULER } from './render2d.js';
import { Axes3DView } from './render3d.js';
import { PAPER, readTheme, rgbCss } from './theme.js';
import { drawTex } from './text.js';
import { SvgContext } from './svgctx.js';
import { bytesToBase64, deflate, rgbaToRgb, buildPdf, blobBytes, encodeGif, setPngDpi, setJpegDpi } from './encode.js';
import { formatInfo, outputSize, clampRect } from './exportopts.js';

/**
 * o: { theme, views (Map axId → {XLim, YLim}), grid5, grid3d, background,
 *      dpr, views3d (Map axId → Axes3DView, kept; null = temporary views),
 *      state3d (Map axId → {zoomF, target}), lightOpts(ax) → render3d options }
 * Returns the layout (items carry their mapper / 3D view).
 */
export function paintFigure(ctx, fig, W, H, o) {
  const opts = { theme: o.theme, views: o.views || new Map(), grid5: !!o.grid5, background: o.background, view3d: new Map() };
  const layout = computeLayout(ctx, fig, W, H, opts.views);
  opts.layout = layout;
  drawFigure(ctx, fig, W, H, opts, 'base');
  const temps = [];
  const dpr = o.dpr || 1;
  for (const it of layout.items) {
    if (it.kind !== 'axes3d') continue;
    const ax = it.node;
    let v = o.views3d ? o.views3d.get(ax.id) : null;
    let fresh = false;
    if (!v) {
      try { v = new Axes3DView(); } catch (e) { console.warn('WebGL is not available', e); continue; }
      fresh = true;
      if (o.views3d) o.views3d.set(ax.id, v); else (o.temps || temps).push(v);
    }
    const w = Math.max(1, Math.round(it.region.w)), h = Math.max(1, Math.round(it.region.h));
    if (v._sz !== `${w}x${h}@${dpr}`) { v.setSize(w, h, dpr); v._sz = `${w}x${h}@${dpr}`; }
    const lo = o.lightOpts ? o.lightOpts(ax) : { lighting: false };
    v.setOptions({ theme: o.theme, grid: !!o.grid3d, axesLines: o.axesLines !== false, ...lo });
    if (v._node !== ax) {
      v.setAxes(ax, fig);
      v._node = ax;
      if (fresh && o.state3d && o.state3d.has(ax.id)) {
        const s = o.state3d.get(ax.id);
        v.zoomF = s.zoomF || 1;
        if (s.target) v.target.set(s.target[0], s.target[1], s.target[2]);
        if (s.view) v.setView(s.view[0], s.view[1]);
      }
    }
    if (o.onView3d) o.onView3d(v, ax);
    v.render();
    it.view = v;
    ctx.drawImage(v.canvas, it.region.x, it.region.y, it.region.w, it.region.h);
    opts.view3d.set(ax.id, v);
  }
  drawFigure(ctx, fig, W, H, opts, 'overlay');
  for (const v of temps) v.dispose();
  return layout;
}

// ---------------------------------------------------------------- shared overlays (screen + export)

/** Where the view ray through region point (cx, cy) meets the 3D ground plane, in data units. */
export function groundHit(v, cx, cy) {
  if (!v || !v.flim) return null;
  const rc = v.ray(cx, cy);
  const o = rc.ray.origin, d = rc.ray.direction;
  if (Math.abs(d.z) < 1e-9) return null;
  const t = (-v.half.z - o.z) / d.z;
  return v.toData(o.clone().addScaledVector(d, t));
}

/** Ruler mapper of a 2D axes item, shifted by (dx, dy) px. */
export function rulerMapper2d(it, dx, dy) {
  const m = it.mapper, p = it.node.props;
  if (!m) return null;
  return makeMapper({ x: m.box.x + dx, y: m.box.y + dy, w: m.box.w, h: m.box.h }, m.xlim, m.ylim, p.XScale, p.YScale, p.XDir, p.YDir);
}

/** A linear ruler mapper for a 3D axes from the ground plane along the middle row / column. */
export function rulerMapper3d(it, dx, dy) {
  const v = it.view, r = it.region;
  if (!v) return null;
  const a = groundHit(v, 0, r.h / 2), b = groundHit(v, r.w, r.h / 2);
  const c = groundHit(v, r.w / 2, 0), d = groundHit(v, r.w / 2, r.h);
  if (!a || !b || !c || !d) return null;
  const xa = a[0], xb = b[0], ya = c[1], yb = d[1];
  const okX = Math.abs(xb - xa) > 1e-12 && Number.isFinite(xb - xa), okY = Math.abs(yb - ya) > 1e-12 && Number.isFinite(yb - ya);
  const X0 = dx + r.x, Y0 = dy + r.y;
  return {
    xscale: okX ? 'linear' : 'log', yscale: okY ? 'linear' : 'log',
    x: (val) => X0 + ((val - xa) / (xb - xa)) * r.w, invX: (px) => xa + ((px - X0) / r.w) * (xb - xa),
    y: (val) => Y0 + ((val - ya) / (yb - ya)) * r.h, invY: (py) => ya + ((py - Y0) / r.h) * (yb - ya),
    pxPerUnitX: okX ? r.w / Math.abs(xb - xa) : 1, pxPerUnitY: okY ? r.h / Math.abs(yb - ya) : 1,
  };
}

/** The ruler mapper of a layout item. */
export function rulerMapperOf(it, dx, dy) {
  if (!it) return null;
  if (it.kind === 'axes2d') return rulerMapper2d(it, dx, dy);
  if (it.kind === 'axes3d') return rulerMapper3d(it, dx, dy);
  return null;
}

/** The ruler mapper for a layout: the given axes, else the first 2D / 3D one. */
export function rulerMapperFor(layout, axesId, dx, dy) {
  if (!layout) return null;
  const ok = (x) => x.kind === 'axes2d' || x.kind === 'axes3d';
  return rulerMapperOf(layout.items.find((x) => ok(x) && x.node && x.node.id === axesId) || layout.items.find(ok), dx, dy);
}

const inBox = (b, x, y) => b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;

/** Data tips ([{axId, point, label[]}]) in figure px. */
export function drawTips(g, layout, tips, theme, figW) {
  for (const tip of tips || []) {
    const it = layout && layout.items.find((x) => x.node && x.node.id === tip.axId);
    if (!it) continue;
    let X, Y;
    if (it.kind === 'axes3d') { if (!it.view) continue; const s = it.view.project(tip.point); X = it.region.x + s.x; Y = it.region.y + s.y; }
    else if (it.mapper) { X = it.mapper.x(tip.point[0]); Y = it.mapper.y(tip.point[1]); }
    else continue;
    if (!Number.isFinite(X) || !Number.isFinite(Y) || !inBox(it.kind === 'axes3d' ? it.region : it.box, X, Y)) continue;
    const lines = tip.label;
    g.font = '11px "Segoe UI", sans-serif';
    const w = Math.max(...lines.map((s) => g.measureText(s).width)) + 12, h = lines.length * 15 + 6;
    const bx = Math.min(figW - w - 2, X + 10), by = Math.max(2, Y - h - 10);
    g.strokeStyle = rgbCss(theme.fg, 0.8); g.lineWidth = 1; g.setLineDash([]);
    g.beginPath(); g.moveTo(X, Y); g.lineTo(bx, by + h); g.stroke();
    g.fillStyle = theme.dark ? 'rgba(24,30,40,0.94)' : 'rgba(255,255,236,0.96)';
    g.fillRect(bx, by, w, h); g.strokeRect(bx + 0.5, by + 0.5, w, h);
    lines.forEach((s, i) => drawTex(g, s, bx + 6, by + 4 + i * 15, { size: 11, align: 'left', valign: 'top', color: rgbCss(theme.fg), interpreter: 'none' }));
    g.fillStyle = rgbCss(theme.accent); g.strokeStyle = theme.dark ? '#000' : '#fff';
    g.beginPath(); g.arc(X, Y, 4, 0, Math.PI * 2); g.fill(); g.stroke();
  }
}

// ---------------------------------------------------------------- export

/** A theme for an export background ('theme' = the screen look, 'white' / 'none' = paper). */
export function exportTheme(background) {
  return background === 'theme' ? readTheme() : PAPER;
}

/**
 * The figure for a transparent export: figure and axes backgrounds are not
 * painted; lines, text, grid and the 3D box still are. Nodes are copied down
 * to every axes; data arrays are shared.
 */
export function transparentCopy(node) {
  const n = { ...node, props: { ...node.props }, children: (node.children || []).map(transparentCopy) };
  if (['figure', 'axes', 'polaraxes', 'uiaxes'].includes(n.type)) { n.props.Color = 'none'; n.auto = (n.auto || []).filter((a) => a !== 'Color'); }
  const lg = n.props.Legend;
  if (lg && lg.props) n.props.Legend = { ...lg, props: { ...lg.props, Color: 'none' }, auto: (lg.auto || []).filter((a) => a !== 'Color') };
  return n;
}

function canvasOf(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return c;
}
const toBlob = (canvas, type, q) => new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The image could not be encoded.'))), type, q));

/** The crop box (figure px) of one axes. */
export function cropOf(layout, axesId, W, H) {
  if (axesId == null) return null;
  const it = layout.items.find((x) => x.node && x.node.id === axesId);
  if (!it) return null;
  const r = it.outer;
  const x0 = Math.max(0, Math.floor(r.x)), y0 = Math.max(0, Math.floor(r.y));
  return { x: x0, y: y0, w: Math.min(W, Math.ceil(r.x + r.w)) - x0, h: Math.min(H, Math.ceil(r.y + r.h)) - y0 };
}

/**
 * Geometry of an export: figure size W × H, the crop, the rulers strip R,
 * the base size (crop + rulers) and the output size / scale.
 * e: { figW, figH, target: figure|axes|region, axesId, rect, rulers, sizeMode, scale, width, height, lock }
 */
export function planExport(fig, e, views) {
  const W = Math.max(1, Math.round(e.figW)), H = Math.max(1, Math.round(e.figH));
  let crop = { x: 0, y: 0, w: W, h: H };
  if (e.target === 'axes') {
    const c = cropOf(computeLayout(canvasOf(4, 4).getContext('2d'), fig, W, H, views || new Map()), e.axesId, W, H);
    if (c) crop = c;
  } else if (e.target === 'region') { const r = clampRect(e.rect, W, H); if (r) crop = r; }
  const R = e.rulers ? RULER : 0;
  const baseW = crop.w + R, baseH = crop.h + R;
  return { W, H, crop, R, baseW, baseH, ...outputSize({ sizeMode: e.sizeMode || 'scale', scale: e.scale || 1, width: e.width, height: e.height, lock: e.lock }, baseW, baseH) };
}

/** Draws an export into g (scaled to base px): the crop, data tips and rulers. */
function drawExport(g, fig, plan, e, paintOpts) {
  const theme = e.theme || exportTheme(e.background);
  const f = e.background === 'none' ? transparentCopy(fig) : fig;
  const { crop, R } = plan;
  const temps = [];
  g.save();
  g.beginPath(); g.rect(R, R, crop.w, crop.h); g.clip();
  g.translate(R - crop.x, R - crop.y);
  const layout = paintFigure(g, f, plan.W, plan.H, { ...paintOpts, theme, background: e.background, dpr: Math.max(plan.sx, plan.sy, 1), views3d: null, temps });
  if (e.tips && e.tipList) drawTips(g, layout, e.tipList, theme, plan.W);
  g.restore();
  if (R) {
    // rulers in the units of the axes under the middle of the crop (region), else the chosen axes
    const cx = crop.x + crop.w / 2, cy = crop.y + crop.h / 2;
    const under = e.target === 'region' ? layout.items.find((x) => (x.kind === 'axes2d' || x.kind === 'axes3d') && inBox(x.outer, cx, cy)) : null;
    drawRulers(g, plan.baseW, plan.baseH, rulerMapperFor(layout, under ? under.node.id : e.axesId, R - crop.x, R - crop.y), null, theme, null);
  }
  for (const v of temps) v.dispose();
  return layout;
}

/** A raster canvas of the export at its output size: { canvas, plan }. */
export function rasterExport(fig, e, paintOpts) {
  const plan = planExport(fig, e, paintOpts && paintOpts.views);
  const c = canvasOf(plan.width, plan.height);
  const g = c.getContext('2d');
  if (e.opaque) { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); }
  g.setTransform(plan.sx, 0, 0, plan.sy, 0, 0);
  drawExport(g, fig, plan, e, paintOpts);
  return { canvas: c, plan };
}

/** SVG text of the export (vector; 3D axes are embedded images): { svg, plan }. */
export function svgExport(fig, e, paintOpts) {
  const plan = planExport(fig, e, paintOpts && paintOpts.views);
  const g = new SvgContext(plan.width, plan.height, { measure: canvasOf(4, 4).getContext('2d') });
  g.scale(plan.sx, plan.sy);
  drawExport(g, fig, plan, e, paintOpts);
  return { svg: g.toString(), plan };
}

/**
 * File bytes of an export: { bytes, mime, ext, width, height }.
 * e: { format, figW, figH, target, axesId, rect, sizeMode, scale, width, height, lock,
 *      dpi, quality, background: theme|white|none, rulers, tips, tipList }
 */
export async function encodeExport(fig, e, paintOpts) {
  const f = formatInfo(e.format);
  if (f.id === 'svg') {
    const { svg, plan } = svgExport(fig, e, paintOpts);
    return { bytes: new TextEncoder().encode(svg), mime: f.mime, ext: f.ext, width: plan.width, height: plan.height };
  }
  const background = !f.alpha && e.background === 'none' ? 'white' : e.background;
  const { canvas, plan } = rasterExport(fig, { ...e, background, opaque: !f.alpha }, paintOpts);
  let bytes;
  if (f.id === 'pdf') {
    const img = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    const over = background === 'theme' ? exportTheme('theme').figure.map((x) => Math.round(x * 255)) : [255, 255, 255];
    const rgb = rgbaToRgb(img.data, over);
    const z = await deflate(rgb);
    bytes = buildPdf({ pageW: plan.baseW * 0.75, pageH: plan.baseH * 0.75, imgW: canvas.width, imgH: canvas.height, data: z || rgb, flate: !!z, title: fig.props.Name || `Figure ${fig.props.Number ?? fig.id}` });
  } else if (f.id === 'gif') {
    const img = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    bytes = encodeGif(img.data, canvas.width, canvas.height, { transparent: background === 'none' });
  } else {
    bytes = await blobBytes(await toBlob(canvas, f.mime, f.quality ? (e.quality ?? 92) / 100 : undefined));
    if (f.id === 'png' && e.dpi) bytes = setPngDpi(bytes, e.dpi);
    if (f.id === 'jpg' && e.dpi) bytes = setJpegDpi(bytes, e.dpi);
  }
  return { bytes, mime: f.mime, ext: f.ext, width: plan.width, height: plan.height };
}

/**
 * The engine's export request (print / saveas / exportgraphics):
 * req: { format: png|jpg|svg|pdf, width, height (figure px), scale, background: theme|white|none, axes }
 */
export async function exportFigureBytes(fig, req, paintOpts) {
  const fmt = String(req.format || 'png').toLowerCase().replace('jpeg', 'jpg');
  let scale = Math.max(0.1, Math.min(8, req.scale || 1));
  if (fmt === 'pdf') scale = Math.max(2, scale);
  return encodeExport(fig, {
    format: fmt, figW: req.width, figH: req.height, sizeMode: 'scale', scale, background: req.background || 'white',
    target: req.axes != null ? 'axes' : 'figure', axesId: req.axes ?? null, dpi: Math.round(96 * (req.scale || 1)), quality: 92,
  }, paintOpts);
}

/** getframe: raw RGBA of the figure (or one axes) as drawn on screen. */
export function frameOf(fig, { width, height, axes = null, ...o }) {
  const { canvas } = rasterExport(fig, { figW: width, figH: height, scale: 1, target: axes != null ? 'axes' : 'figure', axesId: axes, background: 'theme', theme: o.theme || readTheme() }, o);
  const img = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
  return { width: canvas.width, height: canvas.height, rgba: bytesToBase64(new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength)) };
}
