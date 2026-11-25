// The burndown chart as a printable page (black on white, independent of the
// theme): header, key figures, the remaining-work chart and the open-tasks
// chart, a legend and the footer. Same paper, margins and scale as the Gantt
// pages of render.js.
import { burndownData } from '../domain/burndown.js';
import { formatDuration } from '../domain/duration.js';
import { dayStart, formatDay } from '../domain/time.js';
import { labelIndexes, valueAxis } from '../ui/axes.js';

const MM = 96 / 25.4;
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Line styles of the series (print colours). */
export const BURNDOWN_SERIES = {
  ideal: { stroke: '#8a919c', dash: '6 4', width: 1.4 },
  baseline: { stroke: '#b07cc6', dash: '2 3', width: 1.4 },
  planned: { stroke: '#3a6cf0', dash: '', width: 2 },
  actual: { stroke: '#1f9d55', dash: '', width: 2.6 },
};

/**
 * One chart: value ruler on the left, dates below, the series, the status-date line.
 * Returns SVG markup placed at (x, y) with the given size.
 */
function chart({ x, y, width, height, points, keys, axis, font, date, statusDay, statusLabel, title }) {
  const M = { left: 64 * (font / 11), right: 10, top: font * 2, bottom: font * 2.2 };
  const plotW = width - M.left - M.right;
  const plotH = height - M.top - M.bottom;
  const px = (i) => x + M.left + (i / Math.max(1, points.length - 1)) * plotW;
  const py = (v) => y + M.top + plotH - (v / axis.top) * plotH;
  const out = [];
  out.push(`<text x="${x}" y="${y + font * 1.2}" font-size="${font * 1.1}" font-weight="700">${esc(title)}</text>`);
  for (const tick of axis.ticks) {
    out.push(`<line x1="${x + M.left}" x2="${x + M.left + plotW}" y1="${py(tick.value)}" y2="${py(tick.value)}" stroke="#e2e5ea" stroke-width="0.6"/>`);
    out.push(`<text x="${x + M.left - 6}" y="${py(tick.value) + font * 0.35}" font-size="${font * 0.85}" text-anchor="end" fill="#444">${esc(tick.text)}</text>`);
  }
  for (const i of labelIndexes(points.length, plotW, font * 9)) {
    out.push(`<line x1="${px(i)}" x2="${px(i)}" y1="${y + M.top}" y2="${y + M.top + plotH}" stroke="#eef0f3" stroke-width="0.6"/>`);
    out.push(`<text x="${px(i)}" y="${y + M.top + plotH + font * 1.4}" font-size="${font * 0.82}" text-anchor="middle" fill="#444">${esc(date(dayStart(points[i].day)))}</text>`);
  }
  out.push(`<path d="M${x + M.left} ${y + M.top}V${y + M.top + plotH}H${x + M.left + plotW}" fill="none" stroke="#666" stroke-width="0.8"/>`);
  // Status date: where "actual" stops.
  const first = points[0]?.day ?? 0;
  const last = points.at(-1)?.day ?? first + 1;
  if (statusDay >= first && statusDay <= last) {
    const sx = x + M.left + ((statusDay - first) / Math.max(1, last - first)) * plotW;
    out.push(`<line x1="${sx}" x2="${sx}" y1="${y + M.top}" y2="${y + M.top + plotH}" stroke="#d93a3f" stroke-width="1" stroke-dasharray="4 3"/>`);
    out.push(`<text x="${sx + 3}" y="${y + M.top + font}" font-size="${font * 0.8}" fill="#d93a3f">${esc(statusLabel)}</text>`);
  }
  for (const [key, style] of keys) {
    const pts = points.map((p, i) => (p[key] == null ? null : `${px(i).toFixed(1)},${py(p[key]).toFixed(1)}`)).filter(Boolean);
    if (pts.length > 1) out.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="${style.stroke}" stroke-width="${style.width}" ${style.dash ? `stroke-dasharray="${style.dash}"` : ''} stroke-linejoin="round"/>`);
  }
  return out.join('');
}

/**
 * options: { t, language, dateFormat, paper, orientation, margin, scale, header, footer, legend, headerText, footerText, title, now }
 * Returns the same shape as renderPrintSvg: { pages, svg, width, height, count, rows }.
 */
export function renderBurndownPages(project, sched, options, { PAPERS, MARGINS }) {
  const o = options;
  const t = o.t ?? ((key) => key);
  const language = o.language ?? 'ko';
  const date = (v) => formatDay(v, o.dateFormat ?? 'iso');
  const data = burndownData(project, sched, { now: o.now });
  const scale = (o.scale ?? 100) / 100;
  const font = 11 * scale;
  const paper = PAPERS[o.paper] ?? PAPERS.A4;
  const landscape = o.orientation === 'landscape';
  const pageW = (landscape ? paper.height : paper.width) * MM;
  const pageH = (landscape ? paper.width : paper.height) * MM;
  const margin = (MARGINS[o.margin] ?? MARGINS.normal) * MM;
  const headerH = o.header ? 34 * scale : 0;
  const footerH = o.footer ? 20 * scale : 0;
  const legendH = o.legend ? 22 * scale : 0;
  const innerW = pageW - margin * 2;
  const minutesPerDay = (project.options?.hoursPerDay ?? 8) * 60;
  const kind = data.unit === 'work' ? 'hours' : 'days';
  const amount = (v) => formatDuration(v ?? 0, data.unit === 'work' ? 'h' : 'd', project.options, language);
  const out = [];
  let y = margin;
  if (o.header) {
    out.push(`<text x="${margin}" y="${y + 16 * scale}" font-size="${15 * scale}" font-weight="700">${esc(o.headerText || o.title || project.title)}</text>`);
    out.push(`<text x="${pageW - margin}" y="${y + 16 * scale}" font-size="${font * 0.9}" text-anchor="end" fill="#555">${esc(`${date(sched.start)} – ${date(sched.finish)}`)}</text>`);
    out.push(`<line x1="${margin}" x2="${pageW - margin}" y1="${y + headerH - 8 * scale}" y2="${y + headerH - 8 * scale}" stroke="#333" stroke-width="1"/>`);
    y += headerH;
  }
  // Title and key figures.
  out.push(`<text x="${margin}" y="${y + font * 1.4}" font-size="${font * 1.45}" font-weight="700">${esc(t('report.burndown'))}</text>`);
  y += font * 2.4;
  const kpis = [
    [t(data.unit === 'work' ? 'burndown.totalWork' : 'burndown.totalDuration'), amount(data.total)],
    [t('burndown.done'), amount(data.done)],
    [t('burndown.remaining'), amount(data.remaining)],
    [t('burndown.openTasks'), `${data.tasksOpen} / ${data.tasks}`],
    [t('field.percentComplete'), `${sched.percentComplete ?? 0}%`],
  ];
  const kpiW = innerW / kpis.length;
  kpis.forEach(([label, value], i) => {
    const kx = margin + i * kpiW;
    out.push(`<rect x="${kx + 2}" y="${y}" width="${kpiW - 4}" height="${font * 3.4}" rx="4" fill="#f4f6f9" stroke="#d5dae1" stroke-width="0.6"/>`);
    out.push(`<text x="${kx + 10}" y="${y + font * 1.3}" font-size="${font * 0.82}" fill="#555">${esc(label)}</text>`);
    out.push(`<text x="${kx + 10}" y="${y + font * 2.85}" font-size="${font * 1.2}" font-weight="700">${esc(value)}</text>`);
  });
  y += font * 4.2;
  const bottom = pageH - margin - footerH - legendH;
  const space = Math.max(120, bottom - y);
  const workH = space * 0.6;
  const taskH = space - workH - font;
  const maxWork = Math.max(1, ...data.points.flatMap((p) => [p.ideal, p.planned, p.baseline ?? 0, p.actual ?? 0]));
  const keys = [['ideal', BURNDOWN_SERIES.ideal], ...(data.hasBaseline ? [['baseline', BURNDOWN_SERIES.baseline]] : []), ['planned', BURNDOWN_SERIES.planned], ['actual', BURNDOWN_SERIES.actual]];
  out.push(chart({
    x: margin, y, width: innerW, height: workH, points: data.points, keys, font, date,
    axis: valueAxis(maxWork, kind, { language, minutesPerDay }),
    statusDay: data.statusDay, statusLabel: t('field.statusDate'),
    title: t(data.unit === 'work' ? 'burndown.chartWork' : 'burndown.chartDuration'),
  }));
  y += workH + font;
  const taskPoints = data.points.map((p) => ({ day: p.day, ideal: p.tasksIdeal, planned: p.tasksPlanned, actual: p.tasksActual }));
  out.push(chart({
    x: margin, y, width: innerW, height: taskH, points: taskPoints, keys: keys.filter(([key]) => key !== 'baseline'), font, date,
    axis: valueAxis(Math.max(1, data.tasks), 'count', { language }),
    statusDay: data.statusDay, statusLabel: t('field.statusDate'),
    title: t('burndown.chartTasks'),
  }));
  if (legendH) {
    const ly = pageH - margin - footerH - legendH + 6 * scale;
    keys.forEach(([key, style], i) => {
      const lx = margin + i * 170 * scale;
      out.push(`<line x1="${lx}" x2="${lx + 26 * scale}" y1="${ly + 5 * scale}" y2="${ly + 5 * scale}" stroke="${style.stroke}" stroke-width="${style.width}" ${style.dash ? `stroke-dasharray="${style.dash}"` : ''}/>`);
      out.push(`<text x="${lx + 32 * scale}" y="${ly + 9 * scale}" font-size="${font * 0.9}">${esc(t(`burndown.series.${key}`))}</text>`);
    });
  }
  if (o.footer) {
    const fy = pageH - margin;
    out.push(`<text x="${margin}" y="${fy}" font-size="${font * 0.85}" fill="#666">${esc(o.footerText || `MyWorkPlan · ${new Date().toLocaleDateString()}`)}</text>`);
    out.push(`<text x="${pageW - margin}" y="${fy}" font-size="${font * 0.85}" text-anchor="end" fill="#666">${esc(t('print.page', { n: 1, total: 1 }))}</text>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pageW}" height="${pageH}" viewBox="0 0 ${pageW} ${pageH}" font-family="Segoe UI, Malgun Gothic, Apple SD Gothic Neo, Noto Sans KR, sans-serif">${o.transparent ? '' : `<rect width="${pageW}" height="${pageH}" fill="#fff"/>`}${out.join('')}</svg>`;
  const pages = [{ svg, width: pageW, height: pageH }];
  return { pages, svg, width: pageW, height: pageH, count: 1, rows: Math.max(1, data.tasks), paper: { width: landscape ? paper.height : paper.width, height: landscape ? paper.width : paper.height } };
}
