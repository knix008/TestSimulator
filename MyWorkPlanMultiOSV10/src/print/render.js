// Printable pages of a plan: the task table and the Gantt chart drawn as SVG
// (black on white, independent of the theme). Used by the print preview popup
// and by "Export picture" (one long page). The timescale fits the page width;
// rows continue on the following pages.
import { TASK_FIELD_MAP, fieldText } from '../domain/fields.js';
import { formatDay, toMin } from '../domain/time.js';
import { Timescale } from '../views/timescale.js';

export const PAPERS = {
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 },
  A5: { width: 148, height: 210 },
  Letter: { width: 215.9, height: 279.4 },
  Legal: { width: 215.9, height: 355.6 },
  Tabloid: { width: 279.4, height: 431.8 },
};
export const MARGINS = { narrow: 6, normal: 12, wide: 20 };
export const RANGES = ['all', 'view', 'custom'];
export const CONTENTS = ['both', 'table', 'chart'];
const MM = 96 / 25.4;
const PRINT_WIDTHS = { name: 230, wbs: 46, duration: 64, start: 82, finish: 82, predecessors: 70, resourceNames: 130, percentComplete: 50, cost: 82, work: 64 };

export function defaultPrintOptions() {
  return {
    range: 'all', content: 'both', fromRow: 1, toRow: 9999, fromDate: null, toDate: null, selectedOnly: false,
    paper: 'A4', orientation: 'landscape', margin: 'normal', scale: 100, header: true, footer: true, legend: true, notes: false,
    headerText: '', footerText: '',
  };
}

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Which tasks to print, from the range choice. */
export function selectRows(project, sched, options, { visible = null, selected = [] } = {}) {
  let tasks = project.tasks;
  if (options.range === 'view' && visible) {
    const set = new Set(visible);
    tasks = tasks.filter((task) => set.has(task.id));
  } else if (options.range === 'custom') {
    if (options.selectedOnly) {
      const set = new Set(selected);
      tasks = tasks.filter((task) => set.has(task.id));
    } else {
      const from = Math.max(1, Number(options.fromRow) || 1);
      const to = Math.max(from, Number(options.toRow) || 9999);
      tasks = tasks.filter((task) => { const row = sched.info(task.id)?.row ?? 0; return row >= from && row <= to; });
    }
    const fromDate = toMin(options.fromDate);
    const toDate = toMin(options.toDate);
    if (fromDate != null || toDate != null) tasks = tasks.filter((task) => { const info = sched.info(task.id); return info && (toDate == null || info.start <= toDate + 1440) && (fromDate == null || info.finish >= fromDate); });
  }
  return tasks.filter((task) => sched.info(task.id));
}

/**
 * options: { columns, t, language, transparent (no white page), dateFormat, paper, orientation, margin, scale, header, footer, legend, content,
 *            single (one page with everything), title, visible, selected, showCritical }
 * Returns { pages: [{ svg, width, height }], svg, width, height } (svg/width/height: the first page).
 */
export function renderPrintSvg(project, sched, options) {
  const o = { ...defaultPrintOptions(), ...options };
  const t = o.t ?? ((key) => key);
  const ctx = { project, sched, language: o.language ?? 'ko', dateFormat: o.dateFormat ?? 'iso', showTime: false, t, toMin };
  const tasks = selectRows(project, sched, o, { visible: o.visible, selected: o.selected });
  const scale = (o.scale ?? 100) / 100;
  const rowH = 20 * scale;
  const font = 11 * scale;
  const columns = o.content === 'chart' ? ['name'] : (o.columns ?? ['name', 'duration', 'start', 'finish']).filter((id) => TASK_FIELD_MAP.has(id) && id !== 'indicators');
  const colWidths = columns.map((id) => (PRINT_WIDTHS[id] ?? 80) * scale);
  const idWidth = 30 * scale;
  const tableWidth = o.content === 'chart' ? idWidth + colWidths[0] : idWidth + colWidths.reduce((a, b) => a + b, 0);
  let pageW;
  let pageH;
  let margin;
  if (o.single) {
    margin = 16;
    pageW = Math.max(900, tableWidth + 900);
    pageH = 0;
  } else {
    const paper = PAPERS[o.paper] ?? PAPERS.A4;
    const landscape = o.orientation === 'landscape';
    pageW = (landscape ? paper.height : paper.width) * MM;
    pageH = (landscape ? paper.width : paper.height) * MM;
    margin = (MARGINS[o.margin] ?? MARGINS.normal) * MM;
  }
  const headerH = o.header ? 34 * scale : 0;
  const footerH = o.footer ? 20 * scale : 0;
  const legendH = o.legend && o.content !== 'table' ? 22 * scale : 0;
  const scaleH = o.content === 'table' ? rowH : rowH * 2;
  const innerW = pageW - margin * 2;
  const chartW = o.content === 'table' ? 0 : Math.max(120, innerW - (o.content === 'chart' ? tableWidth : tableWidth) - 4);
  const fromMin = Math.min(...tasks.map((task) => sched.info(task.id).start), sched.start);
  const toMinV = Math.max(...tasks.map((task) => sched.info(task.id).finish), sched.finish);
  const days = Math.max(1, (toMinV - fromMin) / 1440 + 3);
  const px = Math.max(0.6, chartW / days);
  const scaleObj = new Timescale({ fromDay: Math.floor(fromMin / 1440), toDay: Math.ceil(toMinV / 1440), pxPerDay: px, weekStart: project.options.weekStart ?? 1, language: ctx.language });
  // The padding the timescale adds: shift so the plan starts near the left edge.
  const shift = scaleObj.x(fromMin) - 6;
  const bodyH = o.single ? tasks.length * rowH : pageH - margin * 2 - headerH - footerH - legendH - scaleH;
  const perPage = o.single ? Math.max(1, tasks.length) : Math.max(1, Math.floor(bodyH / rowH));
  const pageCount = Math.max(1, Math.ceil(tasks.length / perPage));
  if (o.single) pageH = margin * 2 + headerH + scaleH + tasks.length * rowH + legendH + footerH + 8;
  const pages = [];
  const rowIndex = new Map(tasks.map((task, i) => [task.id, i]));
  for (let page = 0; page < pageCount; page++) {
    const slice = tasks.slice(page * perPage, (page + 1) * perPage);
    const out = [];
    const top = margin + headerH;
    if (o.header) {
      out.push(`<text x="${margin}" y="${margin + 16 * scale}" font-size="${15 * scale}" font-weight="700">${esc(o.headerText || o.title || project.title)}</text>`);
      out.push(`<text x="${pageW - margin}" y="${margin + 16 * scale}" font-size="${font * 0.9}" text-anchor="end" fill="#555">${esc(`${formatDay(sched.start, ctx.dateFormat)} – ${formatDay(sched.finish, ctx.dateFormat)}`)}</text>`);
      out.push(`<line x1="${margin}" x2="${pageW - margin}" y1="${margin + headerH - 8 * scale}" y2="${margin + headerH - 8 * scale}" stroke="#333" stroke-width="1"/>`);
    }
    // Table header
    let x = margin;
    out.push(`<rect x="${margin}" y="${top}" width="${tableWidth}" height="${scaleH}" fill="#eef1f5" stroke="#999" stroke-width="0.6"/>`);
    out.push(`<text x="${x + 4}" y="${top + scaleH - 6 * scale}" font-size="${font}" font-weight="700">ID</text>`);
    x += idWidth;
    columns.forEach((id, i) => {
      out.push(`<text x="${x + 4}" y="${top + scaleH - 6 * scale}" font-size="${font}" font-weight="700">${esc(t(`field.${id}`))}</text>`);
      out.push(`<line x1="${x}" x2="${x}" y1="${top}" y2="${top + scaleH + slice.length * rowH}" stroke="#bbb" stroke-width="0.5"/>`);
      x += colWidths[i];
    });
    const chartX = margin + tableWidth + 4;
    if (o.content !== 'table') {
      // Timescale (two tiers)
      const tierY = [top, top + rowH];
      const clipId = `clip-${page}`;
      out.push(`<defs><clipPath id="${clipId}"><rect x="${chartX}" y="${top}" width="${chartW}" height="${scaleH + slice.length * rowH + 2}"/></clipPath></defs>`);
      out.push(`<g clip-path="url(#${clipId})">`);
      out.push(`<rect x="${chartX}" y="${top}" width="${chartW}" height="${scaleH}" fill="#eef1f5" stroke="#999" stroke-width="0.6"/>`);
      [scaleObj.topUnit, scaleObj.bottomUnit].forEach((unit, tier) => {
        for (const cell of scaleObj.cells(unit, shift, shift + chartW)) {
          const cx = chartX + cell.x - shift;
          out.push(`<line x1="${cx}" x2="${cx}" y1="${tierY[tier]}" y2="${tier ? top + scaleH + slice.length * rowH : tierY[tier] + rowH}" stroke="${tier ? '#e2e5ea' : '#999'}" stroke-width="0.5"/>`);
          if (cell.width * 1 > font * 1.2) out.push(`<text x="${cx + 3}" y="${tierY[tier] + rowH - 6 * scale}" font-size="${font * 0.85}" fill="#333">${esc(cell.label)}</text>`);
        }
      });
      out.push('</g>');
    }
    // Rows
    slice.forEach((task, i) => {
      const info = sched.info(task.id);
      const y = top + scaleH + i * rowH;
      if (i % 2) out.push(`<rect x="${margin}" y="${y}" width="${innerW}" height="${rowH}" fill="#f7f8fa"/>`);
      out.push(`<line x1="${margin}" x2="${margin + innerW}" y1="${y + rowH}" y2="${y + rowH}" stroke="#e2e5ea" stroke-width="0.5"/>`);
      let cx = margin;
      out.push(`<text x="${cx + idWidth - 4}" y="${y + rowH - 6 * scale}" font-size="${font}" text-anchor="end" fill="#555">${info.row}</text>`);
      cx += idWidth;
      columns.forEach((id, c) => {
        const field = TASK_FIELD_MAP.get(id);
        let text = '';
        try { text = fieldText(ctx, field, task, info); } catch { text = ''; }
        const indent = id === 'name' ? (task.outlineLevel - 1) * 10 * scale : 0;
        const max = Math.floor((colWidths[c] - indent - 6) / (font * 0.55));
        const clipped = text.length > max ? `${text.slice(0, Math.max(1, max - 1))}…` : text;
        const right = ['right'].includes(field.align);
        out.push(`<text x="${right ? cx + colWidths[c] - 4 : cx + 4 + indent}" y="${y + rowH - 6 * scale}" font-size="${font}" ${right ? 'text-anchor="end"' : ''} ${info.summary && id === 'name' ? 'font-weight="700"' : ''}>${esc(clipped)}</text>`);
        cx += colWidths[c];
      });
      if (o.content === 'table') return;
      const bx = chartX + scaleObj.x(info.start) - shift;
      const bw = Math.max(1.5, scaleObj.x(info.finish) - scaleObj.x(info.start));
      const critical = o.showCritical !== false && info.critical && !info.summary;
      const color = critical ? '#d93a3f' : task.barColor || '#3a6cf0';
      out.push(`<g clip-path="url(#clip-${page})">`);
      if (info.milestone) {
        const r = rowH * 0.32;
        const my = y + rowH / 2;
        out.push(`<path d="M${bx} ${my - r}L${bx + r} ${my}L${bx} ${my + r}L${bx - r} ${my}z" fill="#222"/>`);
        out.push(`<text x="${bx + r + 4}" y="${y + rowH - 6 * scale}" font-size="${font * 0.85}" fill="#333">${esc(formatDay(info.start, ctx.dateFormat))}</text>`);
      } else if (info.summary) {
        const sy = y + rowH * 0.32;
        out.push(`<path d="M${bx} ${sy}h${bw}v${rowH * 0.4}l-${rowH * 0.25} -${rowH * 0.22}H${bx + rowH * 0.25}L${bx} ${sy + rowH * 0.4}z" fill="#222"/>`);
      } else {
        if (info.baseline && info.baseline.start != null) {
          const blx = chartX + scaleObj.x(info.baseline.start) - shift;
          out.push(`<rect x="${blx}" y="${y + rowH * 0.66}" width="${Math.max(1, scaleObj.x(info.baseline.finish) - scaleObj.x(info.baseline.start))}" height="${rowH * 0.16}" fill="#9aa3b0"/>`);
        }
        out.push(`<rect x="${bx}" y="${y + rowH * 0.22}" width="${bw}" height="${rowH * 0.42}" rx="2" fill="${color}" fill-opacity="${task.active === false ? 0.25 : 0.85}" stroke="${color}" stroke-width="0.6"/>`);
        if (info.percentComplete) out.push(`<rect x="${bx}" y="${y + rowH * 0.37}" width="${(bw * info.percentComplete) / 100}" height="${rowH * 0.12}" fill="#111"/>`);
        const label = (info.resourceNames ?? []).join(', ');
        if (label) out.push(`<text x="${bx + bw + 4}" y="${y + rowH - 6 * scale}" font-size="${font * 0.85}" fill="#333">${esc(label)}</text>`);
      }
      // Links into this task from tasks on the same page.
      for (const link of task.predecessors ?? []) {
        const j = rowIndex.get(link.taskId);
        if (j == null || j < page * perPage || j >= (page + 1) * perPage) continue;
        const pred = sched.info(link.taskId);
        const py = top + scaleH + (j - page * perPage) * rowH + rowH / 2;
        const px1 = chartX + scaleObj.x(link.type === 'SS' || link.type === 'SF' ? pred.start : pred.finish) - shift;
        const sx = chartX + scaleObj.x(link.type === 'FF' || link.type === 'SF' ? info.finish : info.start) - shift;
        const sy = y + rowH / 2;
        out.push(`<path d="M${px1} ${py}h4V${sy}H${sx}" fill="none" stroke="${critical ? '#d93a3f' : '#5b6575'}" stroke-width="0.7"/><path d="M${sx} ${sy}l-4 -2.5v5z" fill="${critical ? '#d93a3f' : '#5b6575'}"/>`);
      }
      out.push('</g>');
    });
    out.push(`<rect x="${margin}" y="${top}" width="${tableWidth}" height="${scaleH + slice.length * rowH}" fill="none" stroke="#999" stroke-width="0.6"/>`);
    if (o.content !== 'table') out.push(`<rect x="${chartX}" y="${top}" width="${chartW}" height="${scaleH + slice.length * rowH}" fill="none" stroke="#999" stroke-width="0.6"/>`);
    if (legendH) {
      const ly = (o.single ? pageH - margin - footerH - legendH : pageH - margin - footerH - legendH) + 6 * scale;
      const items = [['#3a6cf0', t('print.legendTask')], ['#d93a3f', t('print.legendCritical')], ['#222', t('print.legendSummary')], ['#9aa3b0', t('print.legendBaseline')]];
      items.forEach(([color, label], i) => {
        const lx = margin + i * 150 * scale;
        out.push(`<rect x="${lx}" y="${ly}" width="${22 * scale}" height="${9 * scale}" fill="${color}"/><text x="${lx + 28 * scale}" y="${ly + 9 * scale}" font-size="${font * 0.9}">${esc(label)}</text>`);
      });
      const mx = margin + items.length * 150 * scale;
      out.push(`<path d="M${mx + 5 * scale} ${ly}l${5 * scale} ${5 * scale}l-${5 * scale} ${5 * scale}l-${5 * scale} -${5 * scale}z" fill="#222"/><text x="${mx + 16 * scale}" y="${ly + 9 * scale}" font-size="${font * 0.9}">${esc(t('print.legendMilestone'))}</text>`);
    }
    if (o.footer) {
      const fy = pageH - margin;
      out.push(`<text x="${margin}" y="${fy}" font-size="${font * 0.85}" fill="#666">${esc(o.footerText || `MyWorkPlan · ${new Date().toLocaleDateString()}`)}</text>`);
      out.push(`<text x="${pageW - margin}" y="${fy}" font-size="${font * 0.85}" text-anchor="end" fill="#666">${esc(t('print.page', { n: page + 1, total: pageCount }))}</text>`);
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pageW}" height="${pageH}" viewBox="0 0 ${pageW} ${pageH}" font-family="Segoe UI, Malgun Gothic, Apple SD Gothic Neo, Noto Sans KR, sans-serif">${o.transparent ? '' : `<rect width="${pageW}" height="${pageH}" fill="#fff"/>`}${out.join('')}</svg>`;
    pages.push({ svg, width: pageW, height: pageH });
  }
  return { pages, svg: pages[0].svg, width: pages[0].width, height: pages[0].height, count: pages.length, rows: tasks.length };
}
