// Drawings of the PlantUML / Enterprise Architect kinds: Gantt charts (a
// calendar with its rows, task bars, milestones, separators), WBS boxes,
// timelines (a time axis with events and periods), ArchiMate 3 elements,
// groupings and junctions, network diagrams (networks, nodes, groups), JSON
// and YAML tree tables, and the railroad diagrams of EBNF rules and regular
// expressions. Merged into SHAPES (shapes.js); same entry format:
//   size(ctx, view, element, style) → { w, h }, draw(ctx, view, element, box, style) → SVG, clip
// plus `place(ctx, view, element, box) → box` for views whose position follows
// their data (a task bar starts on its start date on the calendar).
// Pure: text is measured by ctx.measure.
import { esc, n, textLine, wrapText } from './text.js';
import { ARCHIMATE_GLYPHS, DEVICE_GLYPHS } from './glyphs.js';
import { archimateInfo } from '../domain/archimate.js';
import { closedTest, dateParts, formatDate, MONTHS_EN, nextMonth, parseDate, schedule } from '../domain/planning.js';
import { dataRows, parseData, railroadOf } from '../domain/datatext.js';

// ───────────────────────── small helpers

const refOf = (value) => (value && typeof value === 'object' ? value.$ref ?? null : typeof value === 'string' ? value : null);
const lw = (st) => st.lineWidth ?? 1;
const strokeAttr = (st, color = st.line) => `stroke="${esc(color)}" stroke-width="${n(lw(st))}"`;
const shadowAttr = (st) => (st.shadow ? ' filter="url(#uml-shadow)"' : '');
const rect = (b, st, { r = 0, fill = st.fill, line = st.line, dash = '', shadow = true, opacity = null } = {}) => `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(Math.max(0, b.w))}" height="${n(Math.max(0, b.h))}" rx="${n(r)}" fill="${esc(fill)}"${opacity !== null ? ` fill-opacity="${opacity}"` : ''} ${strokeAttr(st, line)}${dash ? ` stroke-dasharray="${dash}"` : ''}${shadow ? shadowAttr(st) : ''}/>`;
const shape = (d, st, { fill = st.fill, line = st.line, dash = '', shadow = true } = {}) => `<path d="${d}" fill="${esc(fill)}" ${strokeAttr(st, line)}${dash ? ` stroke-dasharray="${dash}"` : ''}${shadow ? shadowAttr(st) : ''}/>`;
const stroke = (d, st, { color = st.line, width = lw(st), dash = '' } = {}) => `<path d="${d}" fill="none" stroke="${esc(color)}" stroke-width="${n(width)}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
const text = (value, x, y, st, opts = {}) => textLine(value, x, y, { face: st.face, size: st.size, color: st.color, ...opts });
const measure = (ctx, value, size, bold = false) => ctx.measure(String(value ?? ''), { fontSize: size, bold });
const glyph = (inner, x, y, size, color) => `<g transform="translate(${n(x)} ${n(y)}) scale(${n(size / 24)})" color="${esc(color)}" fill="none" stroke="${esc(color)}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`;
const finite = (value, fallback = 0) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));

/** Lighter (amount > 0) or darker (< 0) colour. */
function tint(hex, amount) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? ''));
  if (!m) return hex;
  const v = parseInt(m[1], 16);
  const ch = (c) => Math.max(0, Math.min(255, Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount)));
  return `#${((1 << 24) + (ch(v >> 16) << 16) + (ch((v >> 8) & 255) << 8) + ch(v & 255)).toString(16).slice(1)}`;
}
/** `color` moved `amount` of the way towards the shape's background (grid lines, secondary text — in every theme). */
function fade(st, color, amount) {
  const bg = st.fill === 'none' || !/^#?[0-9a-f]{6}$/i.test(String(st.fill ?? '')) ? '#ffffff' : st.fill;
  const a = /^#?([0-9a-f]{6})$/i.exec(String(color ?? '')); const b = /^#?([0-9a-f]{6})$/i.exec(bg);
  if (!a || !b) return color;
  const [x, y] = [parseInt(a[1], 16), parseInt(b[1], 16)];
  const ch = (shift) => Math.round(((x >> shift) & 255) * (1 - amount) + ((y >> shift) & 255) * amount);
  return `#${((1 << 24) + (ch(16) << 16) + (ch(8) << 8) + ch(0)).toString(16).slice(1)}`;
}
/** Is a colour dark (for the text on it)? */
const isDark = (hex) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? '')); if (!m) return false; const v = parseInt(m[1], 16); return (0.299 * (v >> 16) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) < 140; };
/** A value computed once per layout (ctx.cache is cleared by layoutDiagram). */
function memo(ctx, key, make) {
  if (!ctx.cache) return make();
  if (!ctx.cache.has(key)) ctx.cache.set(key, make());
  return ctx.cache.get(key);
}
const viewsOf = (ctx) => ctx.diagram?.ownedViews ?? [];
const modelOf = (ctx, view) => (view?.model ? ctx.index?.get(refOf(view.model)) ?? null : null);
const boxOf = (ctx, view) => ctx.nodeBox?.(view) ?? { x: finite(view.left), y: finite(view.top), w: finite(view.width) || 100, h: finite(view.height) || 40 };
const ko = (ctx) => ctx.language === 'ko';
const monthLabel = (ctx, y, m, short = false) => (ko(ctx) ? (short ? `${m + 1}월` : `${y}년 ${m + 1}월`) : (short ? MONTHS_EN[m] : `${MONTHS_EN[m]} ${y}`));

// ───────────────────────── time scales (Gantt calendar, timeline axis)

const HEADER_H = 40;
const ROW_H = 22;

/** The Gantt chart of the diagram: calendar view, schedule, first day, days, day width, label column. */
function ganttPlan(ctx) {
  return memo(ctx, 'gantt', () => {
    const views = viewsOf(ctx);
    const calView = views.find((v) => v._type === 'GanttCalendarView' && modelOf(ctx, v)) ?? null;
    const cal = calView ? modelOf(ctx, calView) : null;
    const items = []; const seen = new Set(); const rows = [];
    for (const v of views) {
      const el = modelOf(ctx, v);
      if (!el || !['GanttTask', 'GanttMilestone', 'GanttSeparator'].includes(el._type)) continue;
      rows.push(v);
      if (el._type === 'GanttSeparator' || seen.has(el._id)) continue;
      seen.add(el._id);
      items.push({ id: el._id, milestone: el._type === 'GanttMilestone', start: el._type === 'GanttMilestone' ? el.date : el.start, end: el.end, duration: el.duration });
    }
    const links = views.filter((v) => (v.tail || v.head) && modelOf(ctx, v)?._type === 'GanttDependency').map((v) => { const el = modelOf(ctx, v); return [refOf(el.source), refOf(el.target)]; });
    const isClosed = cal ? closedTest(cal.closedDays ?? '', cal.closedDates ?? '') : () => false;
    const projectStart = parseDate(cal?.start) ?? parseDate(ctx.index?.parent(ctx.diagram?._id)?.start);
    const sch = schedule(items, links, { projectStart, isClosed });
    const start = projectStart ?? sch.first;
    // Room after the last bar for its resources and a milestone's date.
    const days = finite(cal?.days) > 0 ? Math.round(cal.days) : Math.max(14, sch.last - start + 2 + Math.ceil(90 / clamp(finite(cal?.dayWidth, 22) || 22, 2, 120)));
    const left = rows.length ? Math.min(...rows.map((v) => finite(v.left))) : 0;
    return { calView, cal, sch, start, days: clamp(days, 1, 3660), dayW: clamp(finite(cal?.dayWidth, 22) || 22, 2, 120), labelW: calView ? 190 : 0, isClosed, rows, left };
  });
}

/** The timeline of the diagram: axis view, first and last day, day width. */
function timelinePlan(ctx) {
  return memo(ctx, 'timeline', () => {
    const views = viewsOf(ctx);
    const axisView = views.find((v) => v._type === 'TLTimelineView' && modelOf(ctx, v)) ?? null;
    const axis = axisView ? modelOf(ctx, axisView) : null;
    const days = [];
    const rows = [];
    for (const v of views) {
      const el = modelOf(ctx, v);
      if (el?._type === 'TLEvent') { rows.push(v); const d = parseDate(el.date); if (d !== null) days.push(d); }
      if (el?._type === 'TLPeriod') { rows.push(v); for (const key of ['start', 'end']) { const d = parseDate(el[key]); if (d !== null) days.push(d); } }
    }
    const first = parseDate(axis?.start) ?? (days.length ? Math.min(...days) - 10 : parseDate('2026-01-01'));
    // Without an end date the axis runs past the last date far enough for its label.
    let last = parseDate(axis?.end) ?? (days.length ? Math.max(...days) + Math.ceil(150 / clamp(finite(axis?.dayWidth, 3) || 3, 0.2, 60)) : first + 365);
    if (last <= first) last = first + 30;
    const left = rows.length ? Math.min(...rows.map((v) => finite(v.left))) : 0;
    return { axisView, axis, start: first, days: clamp(last - first + 1, 1, 36600), dayW: clamp(finite(axis?.dayWidth, 3) || 3, 0.2, 60), labelW: 0, rows, left };
  });
}

/** x of a day on a plan (relative to the scale view, or to the leftmost row without one). */
function dayX(ctx, plan, scaleView, day) {
  const origin = scaleView ? boxOf(ctx, scaleView).x + plan.labelW : plan.left;
  return origin + (day - plan.start) * plan.dayW;
}

/** The header rows and the grid of a time scale. */
function scaleDraw(ctx, b, st, plan, { gantt }) {
  const x0 = b.x + plan.labelW;
  const right = b.x + b.w;
  const grid = fade(st, st.line, 0.82);
  const weak = fade(st, st.line, 0.9);
  const closedFill = fade(st, st.line, 0.93);
  const small = st.size - 2;
  let out = rect(b, st, { fill: st.fill });
  const bodyTop = b.y + HEADER_H;
  const bottom = b.y + b.h;
  // Closed days (Gantt) and the vertical grid.
  if (gantt && plan.dayW >= 3) {
    for (let d = 0; d < plan.days; d += 1) if (plan.isClosed(plan.start + d)) out += `<rect x="${n(x0 + d * plan.dayW)}" y="${n(bodyTop)}" width="${n(plan.dayW)}" height="${n(Math.max(0, bottom - bodyTop))}" fill="${esc(closedFill)}"/>`;
  }
  out += `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(HEADER_H)}" fill="${esc(fade(st, st.line, 0.93))}" ${strokeAttr(st)}/>`;
  out += stroke(`M${n(x0)} ${n(b.y + HEADER_H / 2)}H${n(right)}`, st, { color: grid });
  // Months (top row) and days / weeks / months (bottom row); long scales: years on top, months below.
  const end = plan.start + plan.days;
  const years = plan.dayW < 4;
  for (let m = plan.start; m < end; m = nextMonth(m)) {
    const mx = x0 + (m - plan.start) * plan.dayW;
    const mEnd = Math.min(end, nextMonth(m));
    const w = (mEnd - m) * plan.dayW;
    const { y, m: month } = dateParts(m);
    const newYear = month === 0 || m === plan.start;
    if (m !== plan.start) out += stroke(`M${n(mx)} ${n(years && !newYear ? b.y + HEADER_H / 2 : b.y)}V${n(bottom)}`, st, { color: years && !newYear ? weak : grid });
    if (years) {
      if (newYear) {
        let yEnd = m; while (yEnd < end && dateParts(yEnd).y === y) yEnd = nextMonth(yEnd);
        const yw = (Math.min(end, yEnd) - m) * plan.dayW;
        if (yw > 30) out += text(ko(ctx) ? `${y}년` : String(y), mx + yw / 2, b.y + 14, st, { size: small, anchor: 'middle', bold: true });
      }
      continue;
    }
    const label = w > 90 ? monthLabel(ctx, y, month) : w > 28 ? monthLabel(ctx, y, month, true) : '';
    if (label) out += text(label, mx + w / 2, b.y + 14, st, { size: small, anchor: 'middle', bold: true });
  }
  if (plan.dayW >= 14) {
    for (let d = 0; d < plan.days; d += 1) {
      const dx = x0 + d * plan.dayW;
      if (d) out += stroke(`M${n(dx)} ${n(b.y + HEADER_H / 2)}V${n(bottom)}`, st, { color: weak });
      out += text(String(dateParts(plan.start + d).d), dx + plan.dayW / 2, b.y + HEADER_H - 6, st, { size: small - 1, anchor: 'middle', color: gantt && plan.isClosed(plan.start + d) ? fade(st, st.color, 0.5) : st.color });
    }
  } else if (plan.dayW * 7 >= 22) {
    for (let d = 0; d < plan.days; d += 1) {
      const day = plan.start + d;
      if (dateParts(day).w !== 1) continue;
      const dx = x0 + d * plan.dayW;
      out += stroke(`M${n(dx)} ${n(b.y + HEADER_H / 2)}V${n(bottom)}`, st, { color: weak });
      out += text(String(dateParts(day).d), dx + 3, b.y + HEADER_H - 6, st, { size: small - 1 });
    }
  } else {
    // Long timelines: the months under the years (names when they fit, initials otherwise).
    for (let m = plan.start; m < end; m = nextMonth(m)) {
      const mx = x0 + (m - plan.start) * plan.dayW;
      const w = (Math.min(end, nextMonth(m)) - m) * plan.dayW;
      const { m: month } = dateParts(m);
      const label = w >= 30 ? (ko(ctx) ? `${month + 1}월` : MONTHS_EN[month]) : w >= 10 ? (ko(ctx) ? String(month + 1) : MONTHS_EN[month][0]) : '';
      if (label) out += text(label, mx + w / 2, b.y + HEADER_H - 6, st, { size: small - 1, anchor: 'middle' });
    }
  }
  if (plan.labelW) {
    out += stroke(`M${n(x0)} ${n(b.y)}V${n(bottom)}`, st);
    out += text(ko(ctx) ? '작업' : 'Task', b.x + 8, b.y + HEADER_H / 2 + 5, st, { size: small, bold: true });
    out += text(formatDate(plan.start), b.x + 8, b.y + HEADER_H - 6, st, { size: small - 1, color: fade(st, st.color, 0.4) });
  }
  // Row stripes.
  for (const v of plan.rows) {
    const y = finite(v.top);
    if (y + ROW_H > bodyTop && y < bottom) out += stroke(`M${n(b.x)} ${n(y + ROW_H + 2)}H${n(right)}`, st, { color: weak, width: 0.6 });
  }
  return out;
}

function scaleSize(ctx, v, plan) {
  const w = plan.labelW + plan.days * plan.dayW;
  const top = finite(v.top);
  const bottom = Math.max(top + HEADER_H + 2 * ROW_H, ...plan.rows.map((r) => finite(r.top) + ROW_H + 10));
  return { w: Math.max(120, Math.ceil(w)), h: Math.ceil(bottom - top) };
}

/** Name of a row in the label column of the calendar. */
function rowLabel(ctx, plan, b, st, name, extra = {}) {
  if (!plan.calView || !name) return '';
  const cal = boxOf(ctx, plan.calView);
  const max = plan.labelW - 14;
  let label = String(name);
  while (label.length > 1 && measure(ctx, label, st.size, extra.bold) > max) label = label.slice(0, -1);
  if (label !== String(name)) label = `${label.slice(0, -1)}…`;
  return text(label, cal.x + 8, b.y + b.h / 2 + st.size * 0.36, st, extra);
}

const BAR = '#9ec5fe';
const BAR_DONE = '#2563eb';

const GANTT = {
  ganttCalendar: {
    clip: 'rect',
    size: (ctx, v) => scaleSize(ctx, v, ganttPlan(ctx)),
    draw: (ctx, v, el, b, st) => scaleDraw(ctx, b, st, ganttPlan(ctx), { gantt: true }),
  },
  ganttTask: {
    clip: 'rect',
    size: (ctx, v, el) => { const plan = ganttPlan(ctx); const at = plan.sch.at.get(el._id); return { w: Math.max(4, ((at ? at.end - at.start : 5)) * plan.dayW), h: ROW_H }; },
    place: (ctx, v, el, box) => {
      const plan = ganttPlan(ctx);
      const at = plan.sch.at.get(el._id);
      if (!at) return box;
      const x = dayX(ctx, plan, plan.calView, at.start);
      return { x, y: finite(v.top), w: Math.max(4, (at.end - at.start) * plan.dayW), h: ROW_H };
    },
    draw: (ctx, v, el, b, st) => {
      const plan = ganttPlan(ctx);
      const fill = st.userFill ? st.fill : BAR;
      const done = clamp(finite(el.completion), 0, 100);
      const bar = { x: b.x, y: b.y + 3, w: b.w, h: b.h - 6 };
      let out = rect(bar, st, { r: 3, fill, line: tint(fill, -0.35) });
      if (done > 0) out += `<rect x="${n(bar.x)}" y="${n(bar.y)}" width="${n(bar.w * done / 100)}" height="${n(bar.h)}" rx="3" fill="${esc(tint(st.userFill ? st.fill : BAR_DONE, st.userFill ? -0.3 : 0))}"/>`;
      if (done > 0 && bar.w > 34) out += text(`${done}%`, bar.x + bar.w / 2, bar.y + bar.h / 2 + 4, st, { size: st.size - 3, anchor: 'middle', color: done >= 50 ? '#ffffff' : '#1f2937', bold: true });
      const after = [plan.calView ? '' : el.name, el.resources ? String(el.resources).split(/[,;]/).map((s) => s.trim()).filter(Boolean).join(', ') : ''].filter(Boolean).join('  ');
      if (after) out += text(after, b.x + b.w + 12, b.y + b.h / 2 + st.size * 0.33, st, { size: st.size - 1, color: plan.calView ? fade(st, st.color, 0.3) : st.color });
      return out + rowLabel(ctx, plan, b, st, el.name);
    },
  },
  ganttMilestone: {
    clip: 'diamond',
    size: () => ({ w: 16, h: 16 }),
    place: (ctx, v, el, box) => {
      const plan = ganttPlan(ctx);
      const at = plan.sch.at.get(el._id);
      if (!at) return box;
      return { x: dayX(ctx, plan, plan.calView, at.start) - 8, y: finite(v.top) + 3, w: 16, h: 16 };
    },
    draw: (ctx, v, el, b, st) => {
      const plan = ganttPlan(ctx);
      const at = plan.sch.at.get(el._id);
      const cx = b.x + b.w / 2; const cy = b.y + b.h / 2;
      let out = shape(`M${n(cx)} ${n(b.y)}L${n(b.x + b.w)} ${n(cy)}L${n(cx)} ${n(b.y + b.h)}L${n(b.x)} ${n(cy)}Z`, st, { fill: st.userFill ? st.fill : st.line });
      const label = [plan.calView ? '' : el.name, at ? formatDate(at.start) : ''].filter(Boolean).join('  ');
      out += text(label, b.x + b.w + 6, cy + st.size * 0.33, st, { size: st.size - 1, color: plan.calView ? fade(st, st.color, 0.3) : st.color });
      return out + rowLabel(ctx, plan, { ...b, y: b.y - 3, h: ROW_H }, st, el.name, { italic: true });
    },
  },
  ganttSeparator: {
    clip: 'rect',
    size: (ctx, v, el, st) => ({ w: Math.max(200, measure(ctx, el.name, st.size, true) + 40), h: 20 }),
    place: (ctx, v, el, box) => {
      const plan = ganttPlan(ctx);
      if (!plan.calView) return box;
      const cal = boxOf(ctx, plan.calView);
      return { x: cal.x, y: finite(v.top), w: cal.w, h: 20 };
    },
    draw: (ctx, v, el, b, st) => {
      const cy = b.y + b.h / 2;
      const w = measure(ctx, el.name, st.size - 1, true) + 16;
      return stroke(`M${n(b.x)} ${n(cy)}H${n(b.x + b.w)}`, st, { dash: '5 3' })
        + (el.name ? `<rect x="${n(b.x + b.w / 2 - w / 2)}" y="${n(cy - 8)}" width="${n(w)}" height="16" rx="8" fill="${esc(st.fill === 'none' ? '#ffffff' : st.fill)}" ${strokeAttr(st)}/>` + text(el.name, b.x + b.w / 2, cy + 4, st, { size: st.size - 1, anchor: 'middle', bold: true }) : '');
    },
  },
};

const TIMELINE = {
  tlTimeline: {
    clip: 'rect',
    size: (ctx, v) => scaleSize(ctx, v, timelinePlan(ctx)),
    draw: (ctx, v, el, b, st) => scaleDraw(ctx, b, st, timelinePlan(ctx), { gantt: false }) + (el.name ? text(el.name, b.x + 6, b.y - 6, st, { bold: true }) : ''),
  },
  tlEvent: {
    clip: 'rect',
    size: (ctx, v, el, st) => ({ w: 22 + Math.max(measure(ctx, el.name, st.size, true), measure(ctx, el.date, st.size - 2)), h: ROW_H + 8 }),
    place: (ctx, v, el, box) => {
      const plan = timelinePlan(ctx);
      const day = parseDate(el.date);
      if (day === null) return box;
      return { ...box, x: dayX(ctx, plan, plan.axisView, day) - 7, y: finite(v.top) };
    },
    draw: (ctx, v, el, b, st) => {
      const cx = b.x + 7; const cy = b.y + 9;
      const c = st.userFill ? st.fill : '#f59e0b';
      return shape(`M${n(cx)} ${n(cy - 7)}L${n(cx + 7)} ${n(cy)}L${n(cx)} ${n(cy + 7)}L${n(cx - 7)} ${n(cy)}Z`, st, { fill: c, line: tint(c, -0.35) })
        + text(el.name, b.x + 18, cy + st.size * 0.33, st, { bold: true })
        + text(el.date, b.x + 18, cy + st.size * 0.33 + st.size, st, { size: st.size - 2, color: fade(st, st.color, 0.35) });
    },
  },
  tlPeriod: {
    clip: 'rect',
    size: (ctx, v, el) => { const plan = timelinePlan(ctx); const a = parseDate(el.start); const z = parseDate(el.end); return { w: a !== null && z !== null ? Math.max(4, (z - a + 1) * plan.dayW) : 120, h: ROW_H }; },
    place: (ctx, v, el, box) => {
      const plan = timelinePlan(ctx);
      const a = parseDate(el.start); const z = parseDate(el.end);
      if (a === null) return box;
      return { x: dayX(ctx, plan, plan.axisView, a), y: finite(v.top), w: Math.max(4, ((z ?? a) - a + 1) * plan.dayW), h: ROW_H };
    },
    draw: (ctx, v, el, b, st) => {
      const c = st.userFill ? st.fill : '#a7f3d0';
      const label = el.name ?? '';
      const inside = measure(ctx, label, st.size - 1, true) + 12 <= b.w;
      const range = `${el.start ?? ''} – ${el.end ?? ''}`;
      const plan = timelinePlan(ctx);
      const right = plan.axisView ? boxOf(ctx, plan.axisView).x + boxOf(ctx, plan.axisView).w : Infinity;
      const after = inside ? b.x + b.w + 6 : b.x + b.w + 12 + measure(ctx, label, st.size - 1, true);
      // The dates go after the bar, or before it when the bar ends at the end of the axis.
      const rangeW = measure(ctx, range, st.size - 3);
      const rangeAt = after + rangeW > right - 4 && inside ? { x: b.x - 6, anchor: 'end' } : { x: after, anchor: 'start' };
      return rect(b, st, { r: b.h / 2, fill: c, line: tint(c, -0.4) })
        + (inside ? text(label, b.x + b.w / 2, b.y + b.h / 2 + st.size * 0.33, st, { size: st.size - 1, anchor: 'middle', bold: true, color: isDark(c) ? '#ffffff' : '#1f2937' }) : text(label, b.x + b.w + 6, b.y + b.h / 2 + st.size * 0.33, st, { size: st.size - 1, bold: true }))
        + text(range, rangeAt.x, b.y + b.h / 2 + st.size * 0.33, st, { size: st.size - 3, anchor: rangeAt.anchor, color: fade(st, st.color, 0.4) });
    },
  },
};

// ───────────────────────── WBS

const wbsDepth = (ctx, el) => { let d = 0; for (let p = ctx.index?.parent(el._id); p && p._type === 'WBSNode' && d < 50; p = ctx.index.parent(p._id)) d += 1; return d; };
const WBS_FILLS = ['#c7d2fe', '#e0e7ff', '#f1f5f9'];
const wbsLabel = (el) => `${el.code ? `${el.code}  ` : ''}${el.name ?? ''}`;
const WBS = {
  wbsNode: {
    clip: 'rect',
    size: (ctx, v, el, st) => { const root = wbsDepth(ctx, el) === 0; const lines = String(wbsLabel(el)).split('\n'); return { w: Math.max(root ? 120 : 90, Math.ceil(Math.max(...lines.map((l) => measure(ctx, l, st.size + (root ? 2 : 0), root))) + 24)), h: Math.max(root ? 40 : 30, lines.length * (st.size + 4) + 14) }; },
    draw: (ctx, v, el, b, st) => {
      const depth = wbsDepth(ctx, el);
      const fill = st.userFill ? st.fill : WBS_FILLS[Math.min(depth, 2)];
      const lines = String(wbsLabel(el)).split('\n');
      const size = st.size + (depth === 0 ? 2 : 0);
      const top = b.y + (b.h - lines.length * (size + 4)) / 2 + size;
      return rect(b, st, { r: depth === 0 ? 6 : 2, fill }) + lines.map((line, i) => text(line, b.x + b.w / 2, top + i * (size + 4), st, { size, anchor: 'middle', bold: depth === 0, color: st.color === '#ffffff' && !isDark(fill) ? '#1f2937' : st.color })).join('');
    },
  },
};

// ───────────────────────── ArchiMate

const amColor = (st, info) => (st.userFill ? st.fill : info.fill);
const ARCHIMATE = {
  archimate: {
    clip: 'rect',
    size: (ctx, v, el, st) => {
      const lines = wrapText(el.name ?? '', 150, { fontSize: st.size }, ctx.measure);
      const w = Math.max(...lines.map((l) => measure(ctx, l, st.size)), 40);
      return { w: Math.max(120, Math.ceil(w + 44)), h: Math.max(55, lines.length * (st.size + 3) + 26) };
    },
    draw: (ctx, v, el, b, st) => {
      const info = archimateInfo(el.kind);
      const fill = amColor(st, info);
      const line = st.line === '#1f1f1f' || st.line === '#000000' ? tint(fill, -0.55) : st.line;
      let out;
      if (info.form === 'motivation') { const k = 8; out = shape(`M${n(b.x + k)} ${n(b.y)}H${n(b.x + b.w - k)}L${n(b.x + b.w)} ${n(b.y + k)}V${n(b.y + b.h - k)}L${n(b.x + b.w - k)} ${n(b.y + b.h)}H${n(b.x + k)}L${n(b.x)} ${n(b.y + b.h - k)}V${n(b.y + k)}Z`, st, { fill, line }); } else out = rect(b, st, { r: info.form === 'behavior' ? 10 : 0, fill, line });
      out += glyph(ARCHIMATE_GLYPHS[info.name] ?? ARCHIMATE_GLYPHS.actor, b.x + b.w - 22, b.y + 5, 17, line);
      const lines = wrapText(el.name ?? '', b.w - 34, { fontSize: st.size }, ctx.measure);
      const stereo = typeof el.stereotype === 'string' && el.stereotype ? [`«${el.stereotype}»`] : [];
      const all = [...stereo, ...lines];
      const lineH = st.size + 3;
      const top = b.y + Math.max(st.size + 4, (b.h - all.length * lineH) / 2 + st.size);
      const color = st.color === '#ffffff' || st.color === '#e8eaef' ? '#1f2937' : st.color;
      return out + all.map((l, i) => text(l, b.x + (b.w - 20) / 2 + 4, top + i * lineH, st, { anchor: 'middle', color, size: i < stereo.length ? st.size - 2 : st.size })).join('');
    },
  },
  amGrouping: {
    clip: 'rect',
    size: (ctx, v, el, st) => ({ w: Math.max(200, measure(ctx, el.name, st.size, true) + 40), h: 140 }),
    draw: (ctx, v, el, b, st) => {
      const tabW = Math.min(b.w, measure(ctx, el.name, st.size, true) + 20);
      const tabH = st.size + 9;
      return shape(`M${n(b.x)} ${n(b.y + tabH)}V${n(b.y)}H${n(b.x + tabW)}V${n(b.y + tabH)}`, st, { fill: 'none', dash: '6 3', shadow: false })
        + rect({ x: b.x, y: b.y + tabH, w: b.w, h: b.h - tabH }, st, { fill: st.userFill ? st.fill : 'none', dash: '6 3', shadow: false })
        + text(el.name, b.x + 8, b.y + tabH - 6, st, { bold: true });
    },
  },
  amJunction: {
    clip: 'circle',
    size: () => ({ w: 14, h: 14 }),
    draw: (ctx, v, el, b, st) => `<circle cx="${n(b.x + b.w / 2)}" cy="${n(b.y + b.h / 2)}" r="${n(Math.min(b.w, b.h) / 2)}" fill="${esc(el.junctionType === 'or' ? (st.fill === 'none' ? '#ffffff' : st.fill) : st.line)}" ${strokeAttr(st)}/>`,
  },
};

// ───────────────────────── network

const NW_COLORS = ['#93c5fd', '#86efac', '#fca5a5', '#fde68a', '#c4b5fd', '#99f6e4'];
function networkIndex(ctx, el) {
  const list = viewsOf(ctx).map((v) => modelOf(ctx, v)).filter((m) => m?._type === 'NWNetwork');
  return Math.max(0, list.indexOf(el));
}
const NETWORK = {
  nwNetwork: {
    clip: 'rect',
    size: (ctx, v, el, st) => ({ w: Math.max(300, Math.ceil(measure(ctx, el.name, st.size, true) + measure(ctx, el.address, st.size - 1) + 60)), h: 26 }),
    draw: (ctx, v, el, b, st) => {
      const c = st.userFill ? st.fill : NW_COLORS[networkIndex(ctx, el) % NW_COLORS.length];
      const color = isDark(c) ? '#ffffff' : '#1f2937';
      return rect(b, st, { r: 4, fill: c, line: tint(c, -0.4) })
        + text(el.name, b.x + 10, b.y + b.h / 2 + st.size * 0.36, st, { bold: true, color })
        + text([el.address, el.description].filter(Boolean).join('  ·  '), b.x + b.w - 10, b.y + b.h / 2 + st.size * 0.33, st, { size: st.size - 1, anchor: 'end', color });
    },
  },
  nwNode: {
    clip: 'rect',
    size: (ctx, v, el, st) => ({ w: Math.max(110, Math.ceil(Math.max(measure(ctx, el.name, st.size, true), measure(ctx, el.description, st.size - 2)) + 46)), h: el.description ? 52 : 40 }),
    draw: (ctx, v, el, b, st) => {
      const fill = st.fill === 'none' ? '#ffffff' : st.fill;
      const top = b.y + b.h / 2 + (el.description ? -2 : st.size * 0.36);
      return rect(b, st, { r: 4, fill })
        + glyph(DEVICE_GLYPHS[el.device] ?? DEVICE_GLYPHS.server, b.x + 8, b.y + b.h / 2 - 11, 22, st.line)
        + text(el.name, b.x + 38, top, st, { bold: true })
        + (el.description ? text(el.description, b.x + 38, top + st.size + 1, st, { size: st.size - 2, color: fade(st, st.color, 0.35) }) : '');
    },
  },
  nwGroup: {
    clip: 'rect',
    size: (ctx, v, el, st) => ({ w: Math.max(160, measure(ctx, el.name, st.size, true) + 30), h: 100 }),
    draw: (ctx, v, el, b, st) => {
      const c = st.userFill ? st.fill : '#fde68a';
      return rect(b, st, { r: 10, fill: c, opacity: 0.45, line: tint(c, -0.35), dash: '6 3', shadow: false })
        + text(el.name, b.x + 10, b.y + st.size + 6, st, { bold: true, color: tint(c, -0.7) })
        + (el.description ? text(el.description, b.x + 10, b.y + 2 * st.size + 9, st, { size: st.size - 2, color: tint(c, -0.6) }) : '');
    },
  },
};

// ───────────────────────── JSON / YAML documents

const VALUE_COLOR = { string: '#047857', number: '#1d4ed8', boolean: '#b45309', null: '#6b7280', object: '#6b7280', array: '#6b7280' };
const VALUE_COLOR_ON_DARK = { string: '#6ee7b7', number: '#93c5fd', boolean: '#fcd34d', null: '#9ca3af', object: '#9ca3af', array: '#9ca3af' };
const shorten = (value, max = 48) => { const t = String(value ?? '').replace(/\s*\n\s*/g, ' ⏎ '); return t.length > max ? `${t.slice(0, max - 1)}…` : t; };
function documentLayout(ctx, el, st) {
  const parsed = parseData(el.format, el.text ?? '');
  const rows = parsed.ok ? dataRows(parsed.value) : [{ depth: 0, key: '⚠', value: shorten(parsed.error, 60), kind: 'scalar', type: 'error' }];
  const size = st.size - 1;
  const keyW = Math.max(30, ...rows.map((r) => r.depth * 14 + measure(ctx, r.key, size, true)));
  const valW = Math.max(30, ...rows.map((r) => measure(ctx, shorten(r.value), size)));
  const headerH = st.size + 12;
  const rowH = size + 8;
  const title = el.name ?? '';
  const w = Math.max(measure(ctx, title, st.size, true) + 70, keyW + valW + 36, 160);
  return { rows, keyW, headerH, rowH, size, ok: parsed.ok, w: Math.ceil(w), h: Math.ceil(headerH + Math.max(1, rows.length) * rowH) };
}
const DOCUMENT = {
  dsDocument: {
    clip: 'rect',
    size: (ctx, v, el, st) => { const lay = documentLayout(ctx, el, st); return { w: lay.w, h: lay.h }; },
    draw: (ctx, v, el, b, st) => {
      const lay = documentLayout(ctx, el, st);
      const fill = st.fill === 'none' ? '#ffffff' : st.fill;
      const head = st.userFill ? st.fill : el.format === 'yaml' ? '#fee2e2' : '#e0f2fe';
      let out = rect(b, st, { fill, r: 3 });
      out += `<rect x="${n(b.x)}" y="${n(b.y)}" width="${n(b.w)}" height="${n(lay.headerH)}" rx="3" fill="${esc(head)}" ${strokeAttr(st)}/>`;
      out += text(el.name, b.x + 8, b.y + lay.headerH / 2 + st.size * 0.36, st, { bold: true, color: '#1f2937' });
      const badge = el.format === 'yaml' ? 'YAML' : 'JSON';
      out += text(badge, b.x + b.w - 8, b.y + lay.headerH / 2 + st.size * 0.33, st, { size: st.size - 3, anchor: 'end', bold: true, color: el.format === 'yaml' ? '#b91c1c' : '#0369a1' });
      const split = b.x + 10 + lay.keyW + 8;
      let y = b.y + lay.headerH;
      lay.rows.forEach((row, i) => {
        if (i % 2) out += `<rect x="${n(b.x + 1)}" y="${n(y)}" width="${n(b.w - 2)}" height="${n(lay.rowH)}" fill="${esc(fade(st, st.line, 0.95))}"/>`;
        const base = y + lay.rowH / 2 + lay.size * 0.36;
        out += text(row.key, b.x + 8 + row.depth * 14, base, st, { size: lay.size, bold: row.kind !== 'scalar' || !/^\d+$/.test(row.key), color: row.type === 'error' ? '#dc2626' : st.color });
        out += text(shorten(row.value), split + 6, base, st, { size: lay.size, italic: row.kind !== 'scalar' || row.type === 'null', color: row.type === 'error' ? '#dc2626' : (isDark(fill) ? VALUE_COLOR_ON_DARK : VALUE_COLOR)[row.type] ?? st.color });
        y += lay.rowH;
      });
      if (lay.rows.length) out += stroke(`M${n(split)} ${n(b.y + lay.headerH)}V${n(b.y + b.h)}`, st, { color: fade(st, st.line, 0.75) });
      return out;
    },
  },
};

// ───────────────────────── railroad diagrams (EBNF rules, regular expressions)

const RR = { gap: 10, rail: 8, boxH: 22 };
/** Layout of a railroad node: { w, up, down, draw(x, y) } with the main line at y. */
function rr(ctx, node, st) {
  const size = st.size - 1;
  const line = (x1, x2, y) => (x2 > x1 + 0.1 ? stroke(`M${n(x1)} ${n(y)}H${n(x2)}`, st) : '');
  const box = (label, { r = 0, fill, italic = false, bold = false, hex = false }) => {
    const w = Math.ceil(measure(ctx, label, size, bold) + (hex ? 26 : 18));
    const h = RR.boxH;
    return {
      w, up: h / 2, down: h / 2,
      draw: (x, y) => {
        const shapeSvg = hex
          ? shape(`M${n(x + 6)} ${n(y - h / 2)}H${n(x + w - 6)}L${n(x + w)} ${n(y)}L${n(x + w - 6)} ${n(y + h / 2)}H${n(x + 6)}L${n(x)} ${n(y)}Z`, st, { fill, shadow: false })
          : rect({ x, y: y - h / 2, w, h }, st, { r, fill, shadow: false });
        return shapeSvg + text(label, x + w / 2, y + size * 0.36, st, { size, anchor: 'middle', italic, bold, color: '#1f2937' });
      },
    };
  };
  switch (node?.t) {
    case 'term': return box(node.text === ' ' ? '␣' : `"${node.text}"`, { r: RR.boxH / 2, fill: '#fef3c7', bold: true });
    case 'nonterm': return box(node.text, { fill: '#dbeafe' });
    case 'special': return box(node.text, { fill: '#f3f4f6', italic: true, hex: true });
    case 'class': return box(node.text, { fill: '#ede9fe' });
    case 'seq': {
      const items = node.items.map((item) => rr(ctx, item, st));
      const w = items.reduce((s, it) => s + it.w, 0) + RR.gap * (items.length - 1);
      return {
        w, up: Math.max(...items.map((it) => it.up)), down: Math.max(...items.map((it) => it.down)),
        draw: (x, y) => { let cx = x; let out = ''; items.forEach((it, i) => { if (i) { out += line(cx, cx + RR.gap, y); cx += RR.gap; } out += it.draw(cx, y); cx += it.w; }); return out; },
      };
    }
    case 'alt': case 'opt': {
      const list = node.t === 'opt' ? [{ t: 'skip' }, node.item] : node.items;
      const items = list.map((item) => rr(ctx, item, st));
      const inner = Math.max(...items.map((it) => it.w));
      const margin = RR.rail * 2 + 4;
      const w = inner + margin * 2;
      let down = items[0].down;
      const offsets = [0];
      for (let i = 1; i < items.length; i += 1) { const dy = down + RR.gap + items[i].up; offsets.push(dy); down = dy + items[i].down; }
      return {
        w, up: items[0].up, down,
        draw: (x, y) => {
          let out = '';
          const R = RR.rail;
          items.forEach((it, i) => {
            const iy = y + offsets[i];
            const ix = x + margin + (inner - it.w) / 2;
            if (i === 0) out += line(x, ix, y) + line(ix + it.w, x + w, y);
            else {
              out += stroke(`M${n(x)} ${n(y)}Q${n(x + R)} ${n(y)} ${n(x + R)} ${n(y + R)}V${n(iy - R)}Q${n(x + R)} ${n(iy)} ${n(x + 2 * R)} ${n(iy)}H${n(ix)}`, st);
              out += stroke(`M${n(ix + it.w)} ${n(iy)}H${n(x + w - 2 * R)}Q${n(x + w - R)} ${n(iy)} ${n(x + w - R)} ${n(iy - R)}V${n(y + R)}Q${n(x + w - R)} ${n(y)} ${n(x + w)} ${n(y)}`, st);
            }
            out += it.draw(ix, iy);
          });
          return out;
        },
      };
    }
    case 'rep': {
      const it = rr(ctx, node.item, st);
      const margin = RR.rail * 2;
      const labelH = node.label ? size + 2 : 0;
      const loopY = it.down + RR.gap;
      return {
        w: it.w + margin * 2, up: it.up, down: loopY + labelH,
        draw: (x, y) => {
          const R = RR.rail; const w = it.w + margin * 2; const ly = y + loopY;
          let out = line(x, x + margin, y) + it.draw(x + margin, y) + line(x + margin + it.w, x + w, y);
          out += stroke(`M${n(x + margin + it.w)} ${n(y)}Q${n(x + w - R)} ${n(y)} ${n(x + w - R)} ${n(y + R)}V${n(ly - R)}Q${n(x + w - R)} ${n(ly)} ${n(x + w - 2 * R)} ${n(ly)}H${n(x + 2 * R)}Q${n(x + R)} ${n(ly)} ${n(x + R)} ${n(ly - R)}V${n(y + R)}Q${n(x + R)} ${n(y)} ${n(x + margin)} ${n(y)}`, st);
          const mid = x + w / 2;
          out += stroke(`M${n(mid + 4)} ${n(ly - 4)}L${n(mid - 2)} ${n(ly)}L${n(mid + 4)} ${n(ly + 4)}`, st);
          if (node.label) out += text(node.label, mid, ly + size + 1, st, { size: size - 1, anchor: 'middle', color: fade(st, st.color, 0.35) });
          return out;
        },
      };
    }
    case 'group': {
      const it = rr(ctx, node.item, st);
      const pad = 8; const labelH = node.label ? size + 4 : 4;
      return {
        w: it.w + pad * 2, up: it.up + pad + labelH, down: it.down + pad,
        draw: (x, y) => rect({ x, y: y - it.up - pad, w: it.w + pad * 2, h: it.up + it.down + pad * 2 }, st, { r: 6, fill: 'none', dash: '4 3', shadow: false, line: fade(st, st.line, 0.4) })
          + (node.label ? text(node.label, x + 4, y - it.up - pad - 3, st, { size: size - 2, color: fade(st, st.color, 0.35) }) : '')
          + line(x, x + pad, y) + it.draw(x + pad, y) + line(x + pad + it.w, x + it.w + pad * 2, y),
      };
    }
    default: return { w: RR.gap * 2, up: 0, down: 0, draw: (x, y) => line(x, x + RR.gap * 2, y) };
  }
}
function railroadLayout(ctx, el, st, kind) {
  const source = kind === 'regex' ? el.pattern : el.expression;
  const parsed = railroadOf(kind, source ?? '');
  const headerH = st.size + 12;
  if (!parsed.ok) {
    const msg = `⚠ ${parsed.error}`;
    return { ok: false, msg, headerH, w: Math.ceil(Math.max(measure(ctx, el.name, st.size, true), measure(ctx, msg, st.size - 1)) + 30), h: headerH + 34 };
  }
  const tree = rr(ctx, parsed.tree, st);
  const caption = kind === 'regex' ? `/${source}/` : '';
  const w = Math.max(tree.w + 64, measure(ctx, el.name, st.size, true) + measure(ctx, caption, st.size - 2) + 40, 140);
  return { ok: true, tree, headerH, caption, w: Math.ceil(w), h: Math.ceil(headerH + 14 + tree.up + tree.down + 14) };
}
function railroadDraw(ctx, el, b, st, kind) {
  const lay = railroadLayout(ctx, el, st, kind);
  const fill = st.fill === 'none' ? '#ffffff' : st.fill;
  let out = rect(b, st, { fill, r: 4 });
  out += text(el.name, b.x + 8, b.y + lay.headerH / 2 + st.size * 0.36, st, { bold: true });
  out += stroke(`M${n(b.x)} ${n(b.y + lay.headerH)}H${n(b.x + b.w)}`, st, { color: fade(st, st.line, 0.7) });
  if (!lay.ok) return out + text(lay.msg, b.x + 10, b.y + lay.headerH + 22, st, { size: st.size - 1, color: '#dc2626' });
  if (lay.caption) out += text(lay.caption, b.x + b.w - 8, b.y + lay.headerH / 2 + st.size * 0.33, st, { size: st.size - 2, anchor: 'end', color: fade(st, st.color, 0.35), face: 'Consolas, monospace' });
  const y = b.y + lay.headerH + 14 + lay.tree.up;
  const x = b.x + (b.w - lay.tree.w) / 2;
  // Start: two bars; end: two bars.
  out += stroke(`M${n(b.x + 10)} ${n(y - 8)}V${n(y + 8)}M${n(b.x + 14)} ${n(y - 8)}V${n(y + 8)}M${n(b.x + 14)} ${n(y)}H${n(x)}`, st);
  out += lay.tree.draw(x, y);
  out += stroke(`M${n(x + lay.tree.w)} ${n(y)}H${n(b.x + b.w - 14)}M${n(b.x + b.w - 14)} ${n(y - 8)}V${n(y + 8)}M${n(b.x + b.w - 10)} ${n(y - 8)}V${n(y + 8)}`, st);
  return out;
}
const RAILROAD = {
  ebnfRule: { clip: 'rect', size: (ctx, v, el, st) => { const l = railroadLayout(ctx, el, st, 'ebnf'); return { w: l.w, h: l.h }; }, draw: (ctx, v, el, b, st) => railroadDraw(ctx, el, b, st, 'ebnf') },
  regexPattern: { clip: 'rect', size: (ctx, v, el, st) => { const l = railroadLayout(ctx, el, st, 'regex'); return { w: l.w, h: l.h }; }, draw: (ctx, v, el, b, st) => railroadDraw(ctx, el, b, st, 'regex') },
};

/** The shapes, merged into SHAPES. */
export const MORE_SHAPES = { ...GANTT, ...TIMELINE, ...WBS, ...ARCHIMATE, ...NETWORK, ...DOCUMENT, ...RAILROAD };
/**
 * Routes of lines that follow their ends' data (used when the user has not bent the line):
 * a Gantt dependency leaves the end of its task and enters the start of the next (or drops onto
 * it when they meet); a timeline link drops from one marker and runs to the next.
 */
export const MORE_ROUTES = {
  GanttDependency: (a, b) => {
    const ay = a.y + a.h / 2; const by = b.y + b.h / 2; const ar = a.x + a.w;
    const down = b.y >= a.y;
    if (b.x >= ar + 12) return [{ x: ar, y: ay }, { x: ar + 6, y: ay }, { x: ar + 6, y: by }, { x: b.x, y: by }];
    const x = b.w <= 20 ? b.x + b.w / 2 : b.x + Math.min(8, b.w / 2);
    const entry = down ? b.y : b.y + b.h;
    if (x >= ar - 2) return [{ x: ar, y: ay }, { x, y: ay }, { x, y: entry }].filter((p, i, list) => i === 0 || Math.abs(p.x - list[i - 1].x) + Math.abs(p.y - list[i - 1].y) > 0.5);
    const mid = down ? b.y - 5 : b.y + b.h + 5;
    return [{ x: ar, y: ay }, { x: ar + 8, y: ay }, { x: ar + 8, y: mid }, { x, y: mid }, { x, y: entry }];
  },
  TLLink: (a, b) => {
    const ax = a.x + 7; const bx = b.x + 7;
    if (b.y > a.y + a.h && bx > ax + 10) return [{ x: ax, y: a.y + 16 }, { x: ax, y: b.y + 9 }, { x: b.x, y: b.y + 9 }];
    if (b.y + b.h < a.y && bx > ax + 10) return [{ x: ax, y: a.y + 2 }, { x: ax, y: b.y + 9 }, { x: b.x, y: b.y + 9 }];
    return [{ x: a.x + a.w, y: a.y + 9 }, { x: b.x, y: b.y + 9 }];
  },
};

/** Shapes whose stored size wins over the fitted size. */
export const MORE_FREE = ['amGrouping', 'nwGroup', 'nwNetwork'];
/** Container shapes (drawn behind; moving one moves what is inside). */
export const MORE_CONTAINERS = ['ganttCalendar', 'tlTimeline', 'amGrouping', 'nwGroup'];
