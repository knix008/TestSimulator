// SVG for a drawing: shapes (outline parts, fills, gradients, patterns,
// shadows, pictures), their text (wrapped, aligned, compartments, header bands,
// fields such as {page} or {data:Cost}), connectors (routes, line jumps,
// arrowheads, labels) and whole pages as standalone SVG for export, printing
// and thumbnails. The drawing view uses the same functions, so what is on the
// screen is what is exported. Pure: text is measured by a function passed in
// (a canvas in the app, an estimate in Node).
import { DEG, rotatePoint } from '../domain/geometry.js';
import { dashArray, designById, mix, pageColor, readableOn, resolveConnectorStyle, resolveShapeStyle } from '../domain/designs.js';
import { drawingSize, findShape, isConnector, isGroup, layerState, pageById } from '../domain/diagram.js';
import { routePage } from '../domain/routing.js';
import { masterById, shapeParams } from '../domain/stencils.js';

export const DEFAULT_FONT = '"Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

const XML_INVALID = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
export const esc = (value) => String(value ?? '').replace(XML_INVALID, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n = (value) => Number(Number(value).toFixed(2));

const isWide = (code) => code >= 0x1100 && (code <= 0x115f || (code >= 0x2e80 && code <= 0xa4cf) || (code >= 0xac00 && code <= 0xd7a3) || (code >= 0xf900 && code <= 0xfaff) || (code >= 0xfe30 && code <= 0xfe4f) || (code >= 0xff00 && code <= 0xff60));
/** Text width estimate (no DOM): CJK about one em, Latin about 0.56 em, bold a little wider. */
export function estimateWidth(textValue, size, bold = false) {
  let width = 0;
  for (const ch of String(textValue)) {
    const code = ch.codePointAt(0);
    width += isWide(code) ? size : ' .,:;il|!\'"`'.includes(ch) ? size * 0.3 : /[A-Z]/.test(ch) ? size * 0.66 : size * 0.55;
  }
  return width * (bold ? 1.06 : 1);
}
export const estimateMeasure = (textValue, style) => estimateWidth(textValue, style.fontSize, style.bold);

// ───────────────────────── text

/** Wraps text into lines no wider than `width` (words; CJK may break anywhere). */
export function wrapText(textValue, width, style, measure = estimateMeasure) {
  const out = [];
  for (const paragraph of String(textValue ?? '').split(/\r?\n/)) {
    if (!paragraph) { out.push(''); continue; }
    if (width <= 0 || measure(paragraph, style) <= width) { out.push(paragraph); continue; }
    // Tokens: a word with its trailing space, or a single wide character.
    const tokens = paragraph.match(/[ᄀ-ᇿ⺀-꓏가-힣豈-﫿＀-｠]|[^\sᄀ-ᇿ⺀-꓏가-힣豈-﫿＀-｠]+\s*|\s+/g) ?? [paragraph];
    let current = '';
    for (const token of tokens) {
      const next = current + token;
      if (current && measure(next.trimEnd(), style) > width) {
        out.push(current.trimEnd());
        current = token.trimStart();
        // A single word wider than the box is cut by characters.
        while (current && measure(current, style) > width && current.length > 1) {
          let cut = current.length - 1;
          while (cut > 1 && measure(current.slice(0, cut), style) > width) cut -= 1;
          out.push(current.slice(0, cut));
          current = current.slice(cut);
        }
      } else current = next;
    }
    out.push(current.trimEnd());
  }
  return out;
}

/** Replaces fields in shape text: {page} {pages} {pageName} {title} {author} {date} {time} {name} {master} {width} {height} {data:Key}. */
export function expandFields(textValue, ctx, shape) {
  const value = String(textValue ?? '');
  if (!value.includes('{')) return value;
  const now = ctx.now ?? new Date();
  return value.replace(/\{(\w+)(?::([^}]+))?\}/g, (match, name, arg) => {
    switch (name) {
      case 'page': return String(ctx.pageNumber ?? 1);
      case 'pages': return String(ctx.pageCount ?? 1);
      case 'pageName': return (ctx.fieldPage ?? ctx.page)?.name ?? '';
      case 'title': return ctx.doc?.title ?? '';
      case 'author': return ctx.doc?.author ?? '';
      case 'subject': return ctx.doc?.subject ?? '';
      case 'company': return ctx.doc?.company ?? '';
      case 'date': return now.toLocaleDateString(ctx.locale ?? undefined);
      case 'time': return now.toLocaleTimeString(ctx.locale ?? undefined, { hour: '2-digit', minute: '2-digit' });
      case 'name': return shape?.name || '';
      case 'master': return shape ? masterById(shape.master).name[ctx.language === 'en' ? 'en' : 'ko'] : '';
      case 'width': return shape ? String(Math.round(shape.w)) : '';
      case 'height': return shape ? String(Math.round(shape.h)) : '';
      case 'data': return shape?.data?.find((f) => f.key === arg || f.label === arg)?.value ?? '';
      default: return match;
    }
  });
}

const fontFamily = (style) => (style.font ? `"${String(style.font).replace(/"/g, '')}", ${DEFAULT_FONT}` : DEFAULT_FONT);

/**
 * SVG text for `textValue` laid out in the box (x, y, w, h) of `style`.
 * Returns '' for empty text. `rotate` turns the block around the box centre.
 */
export function textBlock(textValue, box, style, measure = estimateMeasure, { rotate = 0, background = null, boldFirst = false } = {}) {
  if (!String(textValue ?? '').length) return '';
  const margin = style.margin ?? 4;
  const turned = Math.abs(rotate % 180) === 90;
  const innerW = Math.max(4, (turned ? box.h : box.w) - margin * 2);
  const innerH = Math.max(4, (turned ? box.w : box.h) - margin * 2);
  const size = Math.max(4, style.fontSize ?? 13);
  const lineH = size * (style.lineSpacing ?? 1.2);
  const lines = wrapText(textValue, innerW, style, measure);
  const totalH = lines.length * lineH;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const left = cx - innerW / 2;
  const top = cy - innerH / 2;
  let y0 = top;
  if (style.valign === 'middle') y0 = top + (innerH - totalH) / 2;
  else if (style.valign === 'bottom') y0 = top + innerH - totalH;
  const anchor = style.align === 'left' ? 'start' : style.align === 'right' ? 'end' : 'middle';
  const x = style.align === 'left' ? left : style.align === 'right' ? left + innerW : cx;
  const decoration = [style.underline ? 'underline' : '', style.strike ? 'line-through' : ''].filter(Boolean).join(' ');
  const color = style.textColor ?? '#1f2937';
  let bg = '';
  if (background && background !== 'none') {
    const widest = Math.max(...lines.map((ln) => measure(ln, style)), 1);
    const bx = anchor === 'start' ? x - 2 : anchor === 'end' ? x - widest - 2 : x - widest / 2 - 2;
    bg = `<rect x="${n(bx)}" y="${n(y0 - 1)}" width="${n(widest + 4)}" height="${n(totalH + 2)}" fill="${esc(background)}" rx="2"/>`;
  }
  const tspans = lines.map((ln, i) => `<tspan x="${n(x)}" y="${n(y0 + i * lineH + size * 0.95)}"${boldFirst && i === 0 && !style.bold ? ' font-weight="700"' : ''}>${esc(ln) || ' '}</tspan>`).join('');
  const transform = rotate ? ` transform="rotate(${n(rotate)} ${n(cx)} ${n(cy)})"` : '';
  return `<g class="shape-text"${transform}>${bg}<text font-family="${esc(fontFamily(style))}" font-size="${n(size)}" fill="${esc(color)}" text-anchor="${anchor}"${style.bold ? ' font-weight="700"' : ''}${style.italic ? ' font-style="italic"' : ''}${decoration ? ` text-decoration="${decoration}"` : ''} xml:space="preserve">${tspans}</text></g>`;
}

// ───────────────────────── fills

/** A fill attribute value for a style, adding gradients / patterns to `defs`. */
function fillPaint(style, defs, key) {
  if (!style.fill || style.fill === 'none') return 'none';
  const pattern = style.fillPattern ?? 'solid';
  if (pattern === 'solid' || pattern === 'none') return style.fill;
  const id = `f-${key}`;
  const c1 = style.fill;
  const c2 = style.fill2 ?? '#ffffff';
  if (pattern === 'linear') {
    const a = ((style.gradientAngle ?? 90) - 90) * DEG;
    const x1 = 0.5 - Math.cos(a) / 2; const y1 = 0.5 - Math.sin(a) / 2;
    defs.push(`<linearGradient id="${id}" x1="${n(x1)}" y1="${n(y1)}" x2="${n(1 - x1)}" y2="${n(1 - y1)}"><stop offset="0" stop-color="${esc(c1)}"/><stop offset="1" stop-color="${esc(c2)}"/></linearGradient>`);
  } else if (pattern === 'radial') {
    defs.push(`<radialGradient id="${id}" cx="0.5" cy="0.45" r="0.65"><stop offset="0" stop-color="${esc(c1)}"/><stop offset="1" stop-color="${esc(c2)}"/></radialGradient>`);
  } else {
    const body = pattern === 'hatch' ? `<path d="M0 8L8 0M-2 2L2 -2M6 10L10 6" stroke="${esc(c2)}" stroke-width="1.4"/>`
      : pattern === 'cross' ? `<path d="M4 0V8M0 4H8" stroke="${esc(c2)}" stroke-width="1.2"/>`
        : `<circle cx="4" cy="4" r="1.5" fill="${esc(c2)}"/>`;
    defs.push(`<pattern id="${id}" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="${esc(c1)}"/>${body}</pattern>`);
  }
  return `url(#${id})`;
}

// ───────────────────────── shapes

/** Text box of a shape in its own coordinates. */
function textBoxOf(master, shape) {
  const w = shape.w;
  const h = shape.h;
  if (master.textHeader) {
    if (master.header === 'left') return { x: 0, y: 0, w: Math.min(36, w), h, rotate: -90 };
    return { x: 0, y: 0, w, h: Math.min(master.id === 'swimlaneV' ? 34 : 30, h), rotate: 0 };
  }
  if (master.lifeline) return { x: 0, y: 0, w, h: Math.min(40, h), rotate: 0 };
  let [l, t, r, b] = master.text ?? [0, 0, 1, 1];
  if (shape.flipH) [l, r] = [1 - r, 1 - l];
  if (shape.flipV) [t, b] = [1 - b, 1 - t];
  return { x: l * w, y: t * h, w: Math.max(1, (r - l) * w), h: Math.max(1, (b - t) * h), rotate: 0 };
}

/** Compartments (UML class, entity): header + sections split by "---" lines. */
function compartmentsSvg(textValue, shape, style, measure) {
  const sections = String(textValue ?? '').split(/\r?\n[ \t]*-{3,}[ \t]*(?:\r?\n|$)/);
  const wanted = masterById(shape.master).id === 'umlClass' ? 3 : 2;
  while (sections.length < wanted) sections.push('');
  const size = style.fontSize ?? 13;
  const lineH = size * (style.lineSpacing ?? 1.2);
  const headerLines = Math.max(1, wrapText(sections[0], shape.w - 12, { ...style, bold: true }, measure).length);
  const headerH = Math.min(shape.h, Math.max(28, headerLines * lineH + 12));
  const rest = sections.slice(1);
  const counts = rest.map((section) => Math.max(1, wrapText(section, shape.w - 16, style, measure).length));
  const total = counts.reduce((a, b) => a + b, 0);
  const free = Math.max(0, shape.h - headerH);
  let y = headerH;
  let out = `<path d="M0 ${n(headerH)}H${n(shape.w)}" fill="none" stroke="${esc(style.line === 'none' ? '#888' : style.line)}" stroke-width="${n(style.lineWidth ?? 1)}"/>`;
  out += textBlock(sections[0], { x: 0, y: 0, w: shape.w, h: headerH }, { ...style, bold: true, valign: 'middle' }, measure);
  rest.forEach((section, i) => {
    const h = total ? (free * counts[i]) / total : free / rest.length;
    if (i > 0) out += `<path d="M0 ${n(y)}H${n(shape.w)}" fill="none" stroke="${esc(style.line === 'none' ? '#888' : style.line)}" stroke-width="${n(style.lineWidth ?? 1)}"/>`;
    out += textBlock(section, { x: 0, y, w: shape.w, h }, { ...style, align: style.align === 'center' ? 'left' : style.align, valign: 'top', margin: 6 }, measure);
    y += h;
  });
  return out;
}

/**
 * SVG of one 2-D shape (not a connector, not a group record). `ctx` = { doc, page,
 * measure, defs (array), keyPrefix, pageNumber, pageCount, language }.
 */
export function shapeSvg(ctx, shape) {
  const master = masterById(shape.master);
  const style = resolveShapeStyle(ctx.doc, shape);
  const layer = layerState(ctx.page, shape);
  if (layer.color) { style.line = style.line === 'none' ? 'none' : layer.color; style.textColor = layer.color; }
  const params = shapeParams(shape, master);
  const radius = Number(style.rounding) || 0;
  const key = `${ctx.keyPrefix ?? ''}${shape.id}`;
  const fill = fillPaint(style, ctx.defs, key);
  const stroke = style.line && style.line !== 'none' ? style.line : 'none';
  const lw = stroke === 'none' ? 0 : Math.max(0, style.lineWidth ?? 1);
  const dash = dashArray(style.dash, lw);
  const fillOpacity = (style.fillOpacity ?? 100) < 100 ? ` fill-opacity="${n(style.fillOpacity / 100)}"` : '';
  const strokeAttrs = `stroke="${esc(stroke)}" stroke-width="${n(lw)}"${dash ? ` stroke-dasharray="${dash}"` : ''}${(style.lineOpacity ?? 100) < 100 ? ` stroke-opacity="${n(style.lineOpacity / 100)}"` : ''} stroke-linejoin="round" stroke-linecap="round"`;
  const base = style.fill && style.fill !== 'none' ? style.fill : null;
  const parts = master.id === 'image' ? [] : master.geometry(shape.w, shape.h, params, radius);
  const partFill = (part) => {
    if (part.fill === 'main') return fill;
    if (part.fill === 'none') return 'none';
    if (part.fill === 'dark') return base ? mix(base, '#000000', 0.2) : 'none';
    if (part.fill === 'light') return base ? mix(base, '#ffffff', 0.5) : 'none';
    if (part.fill === 'stroke') return stroke !== 'none' ? stroke : style.textColor;
    return 'none';
  };
  const body = parts.map((part, i) => {
    const dashed = master.dashedLine && i > 0 ? ` stroke-dasharray="${dashArray('dash', Math.max(1, lw))}"` : '';
    const pf = partFill(part);
    return `<path d="${part.d}" fill="${esc(pf)}"${pf !== 'none' && part.fill === 'main' ? fillOpacity : ''} fill-rule="evenodd" ${strokeAttrs}${dashed}/>`;
  }).join('');
  let shadow = '';
  if (style.shadow && parts.length) {
    shadow = `<g transform="translate(3 4)" opacity="0.9">${parts.filter((part) => part.fill !== 'none').map((part) => `<path d="${part.d}" fill="${esc(style.shadowColor ?? 'rgba(0,0,0,0.25)')}" fill-rule="evenodd"/>`).join('') || parts.map((part) => `<path d="${part.d}" fill="none" stroke="${esc(style.shadowColor ?? 'rgba(0,0,0,0.25)')}" stroke-width="${n(Math.max(lw, 1))}"/>`).join('')}</g>`;
  }
  let picture = '';
  if (master.id === 'image') {
    picture = shape.src ? `<image href="${esc(shape.src)}" x="0" y="0" width="${n(shape.w)}" height="${n(shape.h)}" preserveAspectRatio="none"/>` : `<rect width="${n(shape.w)}" height="${n(shape.h)}" fill="#eeeeee" stroke="#999999"/>`;
    if (shape.style?.line && shape.style.line !== 'none') picture += `<rect width="${n(shape.w)}" height="${n(shape.h)}" fill="none" ${strokeAttrs}/>`;
  }
  const flip = shape.flipH || shape.flipV ? ` transform="translate(${shape.flipH ? n(shape.w) : 0} ${shape.flipV ? n(shape.h) : 0}) scale(${shape.flipH ? -1 : 1} ${shape.flipV ? -1 : 1})"` : '';
  const textValue = expandFields(shape.text, ctx, shape);
  let textSvg = '';
  if (master.compartments) textSvg = compartmentsSvg(textValue, shape, style, ctx.measure);
  else if (textValue) {
    const box = textBoxOf(master, shape);
    textSvg = textBlock(textValue, box, style, ctx.measure, { rotate: box.rotate + (style.textAngle ?? 0), background: style.textBg === 'page' ? pageColor(ctx.doc, ctx.page) : style.textBg, boldFirst: Boolean(master.org) });
  }
  const angle = shape.angle ? ` rotate(${n(shape.angle)} ${n(shape.w / 2)} ${n(shape.h / 2)})` : '';
  const opacity = (style.opacity ?? 100) < 100 ? ` opacity="${n(style.opacity / 100)}"` : '';
  return `<g class="shape" data-id="${esc(shape.id)}" transform="translate(${n(shape.x)} ${n(shape.y)})${angle}"${opacity}>${shadow}<g${flip}>${body}${picture}</g>${textSvg}</g>${dataGraphicSvg(ctx, shape)}`;
}

/** Data fields shown under a shape (Data Graphics). */
function dataGraphicSvg(ctx, shape) {
  if (!(shape.showData || ctx.doc?.options?.dataGraphics) || !shape.data?.length) return '';
  const lines = shape.data.filter((f) => String(f.value ?? '') !== '').slice(0, 6).map((f) => `${f.label || f.key}: ${f.value}`);
  if (!lines.length) return '';
  const size = 10;
  const widest = Math.max(...lines.map((ln) => ctx.measure(ln, { fontSize: size })));
  const x = shape.x + shape.w / 2 - widest / 2 - 4;
  const y = shape.y + shape.h + 4;
  const d = designById(ctx.doc?.design);
  return `<g class="data-graphic"><rect x="${n(x)}" y="${n(y)}" width="${n(widest + 8)}" height="${n(lines.length * 13 + 4)}" rx="3" fill="${d.dark ? '#00000088' : '#ffffffd9'}" stroke="${d.dark ? '#ffffff44' : '#00000022'}"/>${lines.map((ln, i) => `<text x="${n(x + 4)}" y="${n(y + 13 + i * 13)}" font-family="${esc(DEFAULT_FONT)}" font-size="${size}" fill="${d.dark ? '#e5e7eb' : '#374151'}">${esc(ln)}</text>`).join('')}</g>`;
}

// ───────────────────────── connectors

/** Arrowhead length for a style. */
export const arrowLength = (style) => (8 + 2 * Math.max(1, style.lineWidth ?? 1)) * (style.arrowSize ?? 1);

/** How far the line stops short of the end for an arrowhead. */
function arrowInset(type, len) {
  return { arrow: len * 0.85, stealth: len * 0.55, triangleOpen: len, diamond: len * 1.4, diamondOpen: len * 1.4, circle: len * 0.7, circleOpen: len * 0.7 }[type] ?? 0;
}

/** SVG of an arrowhead with its tip at `tip`, pointing along `angle` (degrees). */
export function arrowSvg(type, tip, angle, style, pageFill) {
  if (!type || type === 'none') return '';
  const len = arrowLength(style);
  const wid = len * 0.42;
  const color = style.line === 'none' ? '#000000' : style.line;
  const lw = Math.max(1, style.lineWidth ?? 1);
  const T = (x, y) => { const p = rotatePoint({ x: tip.x + x, y: tip.y + y }, tip, angle); return `${n(p.x)} ${n(p.y)}`; };
  const filled = (d) => `<path d="${d}" fill="${esc(color)}" stroke="${esc(color)}" stroke-width="${n(lw)}" stroke-linejoin="round"/>`;
  const hollow = (d) => `<path d="${d}" fill="${esc(pageFill)}" stroke="${esc(color)}" stroke-width="${n(lw)}" stroke-linejoin="round"/>`;
  const stroke = (d) => `<path d="${d}" fill="none" stroke="${esc(color)}" stroke-width="${n(lw)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const circleAt = (cx, r, fill) => { const c = rotatePoint({ x: tip.x + cx, y: tip.y }, tip, angle); return `<circle cx="${n(c.x)}" cy="${n(c.y)}" r="${n(r)}" fill="${esc(fill)}" stroke="${esc(color)}" stroke-width="${n(lw)}"/>`; };
  const bar = (x) => `M${T(x, -wid)}L${T(x, wid)}`;
  const crow = `M${T(-len, 0)}L${T(0, -wid)}M${T(-len, 0)}L${T(0, 0)}M${T(-len, 0)}L${T(0, wid)}`;
  switch (type) {
    case 'arrow': return filled(`M${T(0, 0)}L${T(-len, -wid)}L${T(-len, wid)}Z`);
    case 'open': return stroke(`M${T(-len, -wid)}L${T(0, 0)}L${T(-len, wid)}`);
    case 'stealth': return filled(`M${T(0, 0)}L${T(-len, -wid)}L${T(-len * 0.6, 0)}L${T(-len, wid)}Z`);
    case 'triangleOpen': return hollow(`M${T(0, 0)}L${T(-len, -wid)}L${T(-len, wid)}Z`);
    case 'diamond': return filled(`M${T(0, 0)}L${T(-len * 0.7, -wid)}L${T(-len * 1.4, 0)}L${T(-len * 0.7, wid)}Z`);
    case 'diamondOpen': return hollow(`M${T(0, 0)}L${T(-len * 0.7, -wid)}L${T(-len * 1.4, 0)}L${T(-len * 0.7, wid)}Z`);
    case 'circle': return circleAt(-len * 0.35, len * 0.35, color);
    case 'circleOpen': return circleAt(-len * 0.35, len * 0.35, pageFill);
    case 'bar': return stroke(bar(0));
    case 'one': return stroke(bar(-len * 0.6));
    case 'oneOnly': return stroke(`${bar(-len * 0.45)}${bar(-len * 0.85)}`);
    case 'many': return stroke(crow);
    case 'oneMany': return stroke(`${crow}${bar(-len * 1.25)}`);
    case 'zeroMany': return stroke(crow) + circleAt(-len * 1.45, wid * 0.55, pageFill);
    case 'zeroOne': return stroke(bar(-len * 0.5)) + circleAt(-len * 1.05, wid * 0.55, pageFill);
    default: return '';
  }
}

/** The path string of a polyline with arcs where it jumps over earlier lines. */
function jumpPath(points, jumps, size) {
  if (!jumps.length) return `M${points.map((p) => `${n(p.x)} ${n(p.y)}`).join('L')}`;
  let d = `M${n(points[0].x)} ${n(points[0].y)}`;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const ux = (b.x - a.x) / len; const uy = (b.y - a.y) / len;
    const here = jumps.filter((j) => j.segment === i).sort((x, y) => x.t - y.t);
    let last = -Infinity;
    for (const jump of here) {
      const at = jump.t * len;
      if (at - size < last + 1 || at + size > len - 1) continue;
      d += `L${n(a.x + ux * (at - size))} ${n(a.y + uy * (at - size))}`;
      const sweep = ux > 0 || (ux === 0 && uy > 0) ? 1 : 0;
      d += `A${n(size)} ${n(size)} 0 0 ${sweep} ${n(a.x + ux * (at + size))} ${n(a.y + uy * (at + size))}`;
      last = at + size;
    }
    d += `L${n(b.x)} ${n(b.y)}`;
  }
  return d;
}

/** Moves the first / last point of a polyline back by `inset` along its segment. */
function insetEnds(points, startInset, endInset) {
  const pts = points.map((p) => ({ ...p }));
  const pull = (i, j, d) => {
    const a = pts[i]; const b = pts[j];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (!len || !d) return;
    const k = Math.min(d, len * 0.8) / len;
    a.x += (b.x - a.x) * k; a.y += (b.y - a.y) * k;
  };
  if (pts.length >= 2) { pull(0, 1, startInset); pull(pts.length - 1, pts.length - 2, endInset); }
  return pts;
}

/** SVG of one connector along its route. */
export function connectorSvg(ctx, connector, route) {
  const style = resolveConnectorStyle(ctx.doc, connector);
  const layer = layerState(ctx.page, connector);
  if (layer.color) { style.line = layer.color; style.textColor = layer.color; }
  const color = style.line === 'none' ? 'none' : style.line;
  const lw = Math.max(0.5, style.lineWidth ?? 1.5);
  const dash = dashArray(style.dash, lw);
  const pageFill = pageColor(ctx.doc, ctx.page);
  const len = arrowLength(style);
  const pts = route.points;
  if (pts.length < 2) return '';
  const startAngle = Math.atan2(pts[0].y - pts[1].y, pts[0].x - pts[1].x) / DEG;
  const endAngle = Math.atan2(pts.at(-1).y - pts.at(-2).y, pts.at(-1).x - pts.at(-2).x) / DEG;
  let d;
  if (route.curve) {
    const segs = route.curve;
    d = `M${n(segs[0][0].x)} ${n(segs[0][0].y)}${segs.map(([, c1, c2, p]) => `C${n(c1.x)} ${n(c1.y)} ${n(c2.x)} ${n(c2.y)} ${n(p.x)} ${n(p.y)}`).join('')}`;
  } else {
    const inner = insetEnds(pts, arrowInset(style.startArrow, len), arrowInset(style.endArrow, len));
    d = jumpPath(inner, route.jumps ?? [], 5 * (ctx.doc?.options?.jumpSize ?? 1));
  }
  const strokeAttrs = `stroke="${esc(color)}" stroke-width="${n(lw)}"${dash ? ` stroke-dasharray="${dash}"` : ''}${(style.lineOpacity ?? 100) < 100 ? ` stroke-opacity="${n(style.lineOpacity / 100)}"` : ''} stroke-linejoin="round" stroke-linecap="round"`;
  const heads = color === 'none' ? '' : arrowSvg(style.startArrow, pts[0], startAngle, style, pageFill) + arrowSvg(style.endArrow, pts.at(-1), endAngle, style, pageFill);
  const textValue = expandFields(connector.text, ctx, connector);
  let label = '';
  if (textValue) {
    const width = Math.max(60, Math.min(260, ctx.measure(textValue, style) + 12));
    const box = { x: route.label.x - width / 2, y: route.label.y - 30, w: width, h: 60 };
    label = textBlock(textValue, box, { ...style, valign: 'middle', align: 'center' }, ctx.measure, { background: style.textBg === 'page' ? pageFill : style.textBg });
  }
  const opacity = (style.opacity ?? 100) < 100 ? ` opacity="${n(style.opacity / 100)}"` : '';
  return `<g class="connector" data-id="${esc(connector.id)}"${opacity}><path d="${d}" fill="none" ${strokeAttrs}/>${heads}${label}</g>`;
}

// ───────────────────────── pages

/** The page's number among the foreground pages (background pages are not counted) and how many there are. */
export function pageNumbers(doc, page) {
  const fore = doc.pages.filter((p) => !p.background);
  const i = fore.indexOf(page);
  return { n: i >= 0 ? i + 1 : doc.pages.indexOf(page) + 1, total: Math.max(1, fore.length) };
}

/** Shapes of a page that are drawn (visible layers; for print, printable layers). */
export function drawnShapes(page, { printOnly = false, ids = null } = {}) {
  const set = ids ? new Set(ids) : null;
  return page.shapes.filter((shape) => {
    if (isGroup(shape)) return false;
    const state = layerState(page, shape);
    if (!state.visible || (printOnly && !state.print)) return false;
    if (set && !set.has(shape.id) && !(shape.groupId && [...set].some((id) => id === shape.groupId || isAncestor(page, id, shape)))) return false;
    return true;
  });
}

function isAncestor(page, ancestorId, shape) {
  let current = shape;
  let guard = 0;
  while (current?.groupId && guard++ < 50) {
    if (current.groupId === ancestorId) return true;
    current = findShape(page, current.groupId);
  }
  return false;
}

/** The SVG body (no <svg> element) of a page's shapes and connectors, plus defs. */
export function pageBody(doc, page, { measure = estimateMeasure, printOnly = false, ids = null, routes = null, keyPrefix = '', pageNumber = null, pageCount = null, language = 'ko', withBackground = true, now = null, fieldPage = null } = {}) {
  const defs = [];
  const numbers = pageNumbers(doc, fieldPage ?? page);
  const ctx = { doc, page, fieldPage: fieldPage ?? page, measure, defs, keyPrefix, pageNumber: pageNumber ?? numbers.n, pageCount: pageCount ?? numbers.total, language, now, locale: language === 'en' ? 'en-US' : 'ko-KR' };
  let body = '';
  if (withBackground && page.backgroundId) {
    const bg = pageById(doc, page.backgroundId);
    if (bg && bg.id !== page.id) {
      const inner = pageBody(doc, bg, { measure, printOnly, keyPrefix: `${keyPrefix}bg-`, pageNumber: ctx.pageNumber, pageCount: ctx.pageCount, language, withBackground: bg.backgroundId !== page.id, now, fieldPage: ctx.fieldPage });
      body += `<g class="background-page">${inner.body}</g>`;
      defs.push(...inner.defs);
      ctx.page = page;
    }
  }
  const routeMap = routes ?? routePage(doc, page);
  for (const shape of drawnShapes(page, { printOnly, ids })) {
    body += isConnector(shape) ? (routeMap.get(shape.id) ? connectorSvg(ctx, shape, routeMap.get(shape.id)) : '') : shapeSvg(ctx, shape);
  }
  return { body, defs };
}

/**
 * A whole page as a standalone SVG: { svg, width, height }.
 * area: 'page' (the drawing page, auto-size included) | 'content' (the shapes, with `padding`) | 'selection' (ids).
 */
export function renderPageSvg(doc, page, options = {}) {
  const { area = 'page', ids = null, padding = 20, transparent = false, measure = estimateMeasure, printOnly = false, scale = 1, routes = null, pageNumber = null, language = 'ko', now = null } = options;
  const routeMap = routes ?? routePage(doc, page);
  const routeOf = (shape) => routeMap.get(shape.id) ?? { points: [] };
  let box;
  if (area === 'box' && options.box) {
    box = { ...options.box };
  } else if (area === 'page') {
    const size = drawingSize(page, routeOf);
    box = { x: 0, y: 0, w: size.width, h: size.height };
  } else {
    const list = (ids ? page.shapes.filter((shape) => ids.includes(shape.id) || ids.includes(shape.groupId)) : page.shapes).filter((shape) => !isGroup(shape));
    const boxes = list.map((shape) => (isConnector(shape) ? boundsOfRoute(routeOf(shape)) : shapeBox(shape)));
    const x = Math.min(...boxes.map((b) => b.x)); const y = Math.min(...boxes.map((b) => b.y));
    const x2 = Math.max(...boxes.map((b) => b.x + b.w)); const y2 = Math.max(...boxes.map((b) => b.y + b.h));
    box = boxes.length ? { x: x - padding, y: y - padding, w: x2 - x + padding * 2, h: y2 - y + padding * 2 } : { x: 0, y: 0, w: page.width, h: page.height };
  }
  const index = doc.pages.indexOf(page);
  const { body, defs } = pageBody(doc, page, { measure, printOnly, ids: area === 'selection' ? ids : null, routes: routeMap, pageNumber, language, now });
  const fill = transparent ? '' : `<rect x="${n(box.x)}" y="${n(box.y)}" width="${n(box.w)}" height="${n(box.h)}" fill="${esc(pageColor(doc, page))}"/>`;
  const width = Math.max(1, Math.round(box.w * scale));
  const height = Math.max(1, Math.round(box.h * scale));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="${n(box.x)} ${n(box.y)} ${n(box.w)} ${n(box.h)}" font-family="${esc(DEFAULT_FONT)}">${defs.length ? `<defs>${defs.join('')}</defs>` : ''}${fill}${body}</svg>`;
  return { svg, width, height, box };
}

function boundsOfRoute(route) {
  const pts = route.points ?? [];
  if (!pts.length) return { x: 0, y: 0, w: 0, h: 0 };
  const x = Math.min(...pts.map((p) => p.x)); const y = Math.min(...pts.map((p) => p.y));
  return { x, y, w: Math.max(...pts.map((p) => p.x)) - x, h: Math.max(...pts.map((p) => p.y)) - y };
}

function shapeBox(shape) {
  if (!shape.angle) return { x: shape.x, y: shape.y, w: shape.w, h: shape.h };
  const c = { x: shape.x + shape.w / 2, y: shape.y + shape.h / 2 };
  const pts = [[0, 0], [shape.w, 0], [shape.w, shape.h], [0, shape.h]].map(([x, y]) => rotatePoint({ x: shape.x + x, y: shape.y + y }, c, shape.angle));
  return boundsOfRoute({ points: pts });
}

/** A small picture of a master for the Shapes panel (its own design colours). */
export function masterIcon(masterId, { size = 40, doc = null } = {}) {
  const master = masterById(masterId);
  const scale = Math.min((size - 6) / master.w, (size - 6) / master.h, 1.2);
  const w = master.w * scale;
  const h = master.h * scale;
  const shape = { id: `icon-${master.id}`, type: 'shape', master: master.id, x: (size - w) / 2, y: (size - h) / 2, w: Math.max(2, w), h: Math.max(2, h), angle: 0, text: '', style: { lineWidth: 1.2, shadow: false }, qs: {}, params: {} };
  const defs = [];
  const ctx = { doc: doc ?? { design: 'office', options: {} }, page: { layers: [], color: '#ffffff' }, measure: estimateMeasure, defs, keyPrefix: 'icon-' };
  const body = shapeSvg(ctx, shape);
  return `<svg class="master-icon" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">${defs.length ? `<defs>${defs.join('')}</defs>` : ''}${body}</svg>`;
}

/** The text colour for a background (used by the canvas for labels on dark pages). */
export const labelColor = (bg) => readableOn(bg);
