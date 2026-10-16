// Report export: a report model (src/views/reports.js reportModel) as a
// standalone HTML page, Markdown, or a Word document (.docx, written here with a
// small ZIP writer — no dependencies). Pure functions: no DOM, so the unit tests
// run them in Node. The PDF (pages drawn on a canvas) is in report-pdf.js.

export const REPORT_FONT = "'Malgun Gothic','Apple SD Gothic Neo','Noto Sans KR','Segoe UI',sans-serif";
export const TONES = { scheduled: '#2f6fde', planned: '#98a2b3', actual: '#22a06b', over: '#d64545', bad: '#d64545', good: '#22a06b' };

const XML_INVALID = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
/** Text safe inside XML/HTML text and attributes. */
export const escapeXml = (value) => String(value ?? '').replace(XML_INVALID, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const isWide = (code) => code >= 0x1100 && (code <= 0x115f || (code >= 0x2e80 && code <= 0xa4cf) || (code >= 0xac00 && code <= 0xd7a3) || (code >= 0xf900 && code <= 0xfaff) || (code >= 0xfe30 && code <= 0xfe4f) || (code >= 0xff00 && code <= 0xff60));
/** Rough rendered width (px) of text at a font size — CJK is about one em, Latin about 0.58 em. */
export const approxWidth = (text, size) => [...String(text)].reduce((sum, ch) => sum + (isWide(ch.codePointAt(0)) ? size : size * 0.58), 0);
const fit = (text, size, width) => {
  const chars = [...String(text)];
  if (approxWidth(text, size) <= width) return String(text);
  while (chars.length && approxWidth(`${chars.join('')}…`, size) > width) chars.pop();
  return `${chars.join('')}…`;
};
const blockTitle = (block) => block.title || '';
const fileSafe = (name) => String(name).replace(/[\\/:*?"<>|]/g, '_').trim() || 'report';

/** File name of an exported report: "<project> - <report>.<ext>". */
export function reportFileName(model, ext) {
  return `${fileSafe([model.project, model.title].filter(Boolean).join(' - '))}.${ext}`;
}

// ───────────────────────── charts (SVG, self-contained: no classes, inline colours)

function barsSvg(block) {
  const items = block.items;
  const W = 680;
  const hasSecond = items.some((item) => item.second != null);
  const rowH = hasSecond ? 34 : 28;
  const labelW = 190;
  const valueW = 120;
  const trackW = W - labelW - valueW - 20;
  const legend = block.legend?.length ? 28 : 0;
  const ruler = block.axis && items.length ? 30 : 0;
  const rowsH = Math.max(1, items.length) * rowH + 12;
  const H = rowsH + ruler + legend;
  const max = block.axis?.top ?? Math.max(1, ...items.map((item) => Math.max(item.value ?? 0, item.second ?? 0)));
  const secondTone = TONES[block.legend?.[1]?.tone] ?? TONES.planned;
  const rows = items.map((item, i) => {
    const y = 6 + i * rowH;
    const w = Math.max(0, ((item.value ?? 0) / max) * trackW);
    const color = TONES[item.tone] ?? TONES.scheduled;
    const barH = hasSecond ? 12 : 14;
    const second = item.second != null ? `<rect x="${labelW}" y="${y + 5 + barH + 2}" width="${Math.max(0, (item.second / max) * trackW).toFixed(1)}" height="8" rx="2" fill="${secondTone}"/>` : '';
    return `<text x="${labelW - 8}" y="${y + 5 + barH - 2}" font-size="12" text-anchor="end" fill="#374151">${escapeXml(fit(item.label, 12, labelW - 12))}</text>`
      + `<rect x="${labelW}" y="${y + 5}" width="${trackW}" height="${barH}" rx="3" fill="#eef1f5" fill-opacity="0.55"/><rect x="${labelW}" y="${y + 5}" width="${w.toFixed(1)}" height="${barH}" rx="3" fill="${color}"/>${second}`
      + `<text x="${labelW + trackW + 8}" y="${y + 5 + barH - 2}" font-size="12" fill="#111827">${escapeXml(item.text)}</text>`;
  }).join('');
  const empty = items.length ? '' : `<text x="${W / 2}" y="24" font-size="12" text-anchor="middle" fill="#6b7280">${escapeXml(block.empty ?? '')}</text>`;
  // Gridlines at every tick behind the bars, and a ruler with the tick values under them.
  const ticks = ruler ? block.axis.ticks : [];
  const gridSvg = ticks.map((tick) => `<line x1="${(labelW + tick.at * trackW).toFixed(1)}" x2="${(labelW + tick.at * trackW).toFixed(1)}" y1="4" y2="${rowsH}" stroke="#e5e7eb"/>`).join('');
  const rulerSvg = ruler ? `<line x1="${labelW}" x2="${labelW + trackW}" y1="${rowsH}" y2="${rowsH}" stroke="#9ca3af"/>` + ticks.map((tick, i) => {
    const x = labelW + tick.at * trackW;
    const anchor = i === 0 ? 'start' : i === ticks.length - 1 ? 'end' : 'middle';
    return `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${rowsH}" y2="${rowsH + 5}" stroke="#9ca3af"/><text x="${x.toFixed(1)}" y="${rowsH + 18}" font-size="11" text-anchor="${anchor}" fill="#6b7280">${escapeXml(tick.text)}</text>`;
  }).join('') : '';
  const legendSvg = legend ? legendRow(block.legend, H - 10, W) : '';
  return { svg: svgWrap(W, H, gridSvg + rows + empty + rulerSvg + legendSvg), width: W, height: H };
}

function legendRow(entries, y, W) {
  let x = 0;
  const parts = entries.map((entry) => {
    const part = `<rect x="${x}" y="${y - 9}" width="14" height="10" rx="2" fill="${TONES[entry.tone] ?? TONES.scheduled}"/><text x="${x + 20}" y="${y}" font-size="12" fill="#374151">${escapeXml(entry.label)}</text>`;
    x += 34 + approxWidth(entry.label, 12);
    return part;
  });
  return `<g transform="translate(${Math.max(0, (W - x) / 2).toFixed(1)} 0)">${parts.join('')}</g>`;
}

function lineSvg(block) {
  const W = 680;
  const H = 280;
  const left = 96;
  const right = 20;
  const top = 12;
  const bottom = 64;
  const points = block.points;
  const max = block.axis?.top ?? Math.max(1, ...points.flatMap((p) => block.series.map((s) => p.values[s.key] ?? 0)));
  const x = (i) => left + (i / Math.max(1, points.length - 1)) * (W - left - right);
  const y = (v) => top + (1 - v / max) * (H - top - bottom);
  const fmtTick = (f) => {
    // Axis labels formatted by the report (block.ticks for 0, ½ and the maximum); else a plain number.
    const given = block.ticks?.[[0, 0.5, 1].indexOf(f)];
    if (given != null) return given;
    let best = null;
    for (const p of points) for (const s of block.series) if (p.values[s.key] != null && (best == null || Math.abs(p.values[s.key] - max * f) < Math.abs(best.v - max * f))) best = { v: p.values[s.key], text: p.texts[s.key] };
    return f === 0 ? '0' : best && Math.abs(best.v - max * f) < max * 0.02 ? best.text : String(Math.round(max * f).toLocaleString('en-US'));
  };
  const yTicks = block.axis ? block.axis.ticks.map((tick) => ({ v: tick.value, text: tick.text })) : [0, 0.5, 1].map((f) => ({ v: max * f, text: fmtTick(f) }));
  const grid = yTicks.map((tick) => `<line x1="${left}" x2="${W - right}" y1="${y(tick.v).toFixed(1)}" y2="${y(tick.v).toFixed(1)}" stroke="#e5e7eb"/><line x1="${left - 5}" x2="${left}" y1="${y(tick.v).toFixed(1)}" y2="${y(tick.v).toFixed(1)}" stroke="#9ca3af"/><text x="${left - 8}" y="${(y(tick.v) + 4).toFixed(1)}" font-size="11" text-anchor="end" fill="#6b7280">${escapeXml(fit(tick.text, 11, left - 12))}</text>`).join('')
    + `<line x1="${left}" x2="${left}" y1="${top}" y2="${H - bottom}" stroke="#9ca3af"/><line x1="${left}" x2="${W - right}" y1="${H - bottom}" y2="${H - bottom}" stroke="#9ca3af"/>`;
  const lines = block.series.map((s) => {
    const pts = points.map((p, i) => (p.values[s.key] == null ? null : `${x(i).toFixed(1)},${y(p.values[s.key]).toFixed(1)}`)).filter(Boolean);
    return pts.length ? `<polyline points="${pts.join(' ')}" fill="none" stroke="${TONES[s.tone] ?? TONES.scheduled}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"${s.tone === 'planned' ? ' stroke-dasharray="6 4"' : ''}/>` : '';
  }).join('');
  // About one dated tick per 100 px, each with a light vertical gridline.
  const every = Math.max(1, Math.ceil((points.length * 100) / (W - left - right)));
  const dateIdx = [];
  for (let i = 0; i < points.length; i += every) dateIdx.push(i);
  const dates = dateIdx.map((i) => `<line x1="${x(i).toFixed(1)}" x2="${x(i).toFixed(1)}" y1="${top}" y2="${H - bottom}" stroke="#f0f1f4"/><line x1="${x(i).toFixed(1)}" x2="${x(i).toFixed(1)}" y1="${H - bottom}" y2="${H - bottom + 5}" stroke="#9ca3af"/><text x="${x(i).toFixed(1)}" y="${H - bottom + 18}" font-size="11" text-anchor="${i === 0 ? 'start' : 'middle'}" fill="#6b7280">${escapeXml(points[i].label)}</text>`).join('');
  return { svg: svgWrap(W, H, grid + lines + dates + legendRow(block.series, H - 12, W)), width: W, height: H };
}

function donutSvg(block) {
  const W = 200;
  const H = 200;
  const r = 70;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, Number(block.percent) || 0));
  const body = `<circle cx="100" cy="100" r="${r}" fill="none" stroke="#eef1f5" stroke-width="22"/>`
    + `<circle cx="100" cy="100" r="${r}" fill="none" stroke="${TONES.scheduled}" stroke-width="22" stroke-dasharray="${((c * pct) / 100).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 100 100)"/>`
    + `<text x="100" y="104" font-size="30" font-weight="700" text-anchor="middle" fill="#111827">${pct}%</text>`
    + `<text x="100" y="128" font-size="12" text-anchor="middle" fill="#6b7280">${escapeXml(fit(block.label, 12, 120))}</text>`;
  return { svg: svgWrap(W, H, body), width: W, height: H };
}

const svgWrap = (W, H, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${REPORT_FONT}">${body}</svg>`;

/** A chart block as standalone SVG { svg, width, height }, or null for blocks that are not charts. */
export function chartSvg(block) {
  if (block.type === 'bars') return barsSvg(block);
  if (block.type === 'line') return lineSvg(block);
  if (block.type === 'donut') return donutSvg(block);
  return null;
}

/** The numbers behind a chart (or KPIs) as a plain table { columns, rows } for Markdown / Word / HTML. */
export function blockTable(block, labels = {}) {
  if (block.type === 'kpis') return { columns: [{ label: labels.item ?? 'Item' }, { label: labels.value ?? 'Value', align: 'right' }], rows: block.items.map((item) => [item.label, item.value]) };
  if (block.type === 'donut') return { columns: [{ label: labels.item ?? 'Item' }, { label: labels.value ?? 'Value', align: 'right' }], rows: [[block.label, `${block.percent}%`]] };
  if (block.type === 'bars') {
    const second = block.items.some((item) => item.second != null);
    return {
      columns: [{ label: labels.item ?? 'Item' }, { label: block.legend?.[0]?.label ?? labels.value ?? 'Value', align: 'right' }, ...(second ? [{ label: block.legend?.[1]?.label ?? '', align: 'right' }] : [])],
      rows: block.items.map((item) => [item.label, item.text, ...(second ? [item.secondText ?? ''] : [])]),
      empty: block.empty,
    };
  }
  if (block.type === 'line') {
    return { columns: [{ label: labels.date ?? 'Date' }, ...block.series.map((s) => ({ label: s.label, align: 'right' }))], rows: block.points.map((p) => [p.label, ...block.series.map((s) => p.texts[s.key] ?? '')]) };
  }
  if (block.type === 'table') return block;
  return null;
}

// ───────────────────────── HTML

const HTML_CSS = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { margin: 0; background: #f4f6f9; color: #111827; font: 14px/1.55 ${REPORT_FONT}; }
.page { max-width: 960px; margin: 32px auto; padding: 40px 48px; background: #fff; border-radius: 14px; box-shadow: 0 1px 3px rgba(16,24,40,.08), 0 8px 24px rgba(16,24,40,.06); }
header { border-bottom: 2px solid #2f6fde; padding-bottom: 16px; margin-bottom: 24px; }
.eyebrow { color: #2f6fde; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
h1 { margin: 4px 0 4px; font-size: 28px; line-height: 1.25; }
.meta { margin: 0; color: #6b7280; }
h2 { margin: 0 0 12px; font-size: 17px; color: #1f2937; }
section { margin: 0 0 28px; }
.kpis { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 12px; }
.kpi { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px 14px; background: #fafbfc; }
.kpi small { display: block; color: #6b7280; font-size: 12px; }
.kpi b { display: block; font-size: 18px; margin-top: 2px; }
.kpi.bad b { color: #d64545; } .kpi.good b { color: #22a06b; }
figure { margin: 0; }
figure svg { display: block; max-width: 100%; height: auto; }
details { margin-top: 8px; color: #374151; }
summary { cursor: pointer; color: #2f6fde; font-size: 13px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { border: 1px solid #e5e7eb; padding: 6px 10px; text-align: left; vertical-align: top; }
th { background: #eef2f7; font-weight: 700; }
tbody tr:nth-child(even) td { background: #fafbfc; }
td.right, th.right { text-align: right; } td.center, th.center { text-align: center; }
.note { color: #6b7280; margin: 0 0 12px; }
.empty { color: #6b7280; font-style: italic; }
footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 12px; }
@media print { body { background: #fff; } .page { margin: 0; box-shadow: none; max-width: none; padding: 0; } details { display: none; } section { break-inside: avoid; } }
@media (max-width: 640px) { .page { margin: 0; border-radius: 0; padding: 24px 16px; } }`;

function htmlTable(table) {
  if (!table.rows.length) return `<p class="empty">${escapeXml(table.empty ?? '')}</p>`;
  const align = (col) => (col?.align && col.align !== 'left' ? ` class="${escapeXml(col.align)}"` : '');
  return `<table><thead><tr>${table.columns.map((col) => `<th${align(col)}>${escapeXml(col.label)}</th>`).join('')}</tr></thead>
<tbody>${table.rows.map((row) => `<tr>${row.map((cell, i) => `<td${align(table.columns[i])}>${escapeXml(cell)}</td>`).join('')}</tr>`).join('\n')}</tbody></table>`;
}

/** The report as a standalone HTML page (UTF-8, inline CSS, charts as inline SVG). */
export function reportToHtml(model) {
  const labels = model.labels ?? {};
  const sections = model.blocks.map((block) => {
    const head = blockTitle(block) ? `<h2>${escapeXml(block.title)}</h2>` : '';
    if (block.type === 'kpis') return `<section class="kpis">${block.items.map((item) => `<div class="kpi${item.tone ? ` ${escapeXml(item.tone)}` : ''}"><small>${escapeXml(item.label)}</small><b>${escapeXml(item.value)}</b></div>`).join('')}</section>`;
    if (block.type === 'note') return `<p class="note">${escapeXml(block.text)}</p>`;
    if (block.type === 'table') return `<section>${head}${htmlTable(block)}</section>`;
    const chart = chartSvg(block);
    if (!chart) return '';
    const data = blockTable(block, labels);
    const note = block.note ? `<p class="note">${escapeXml(block.note)}</p>` : '';
    const hasData = data.rows.length && block.type !== 'donut';
    return `<section>${head}<figure>${chart.svg}</figure>${note}${hasData ? `<details><summary>${escapeXml(labels.value ?? 'Data')}</summary>${htmlTable(data)}</details>` : ''}</section>`;
  }).join('\n');
  const title = [model.title, model.project].filter(Boolean).join(' — ');
  return `<!doctype html>
<html lang="${escapeXml(model.language ?? 'en')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="MyWorkPlan">
<title>${escapeXml(title)}</title>
<style>${HTML_CSS}
</style>
</head>
<body>
<main class="page">
<header><div class="eyebrow">MyWorkPlan</div><h1>${escapeXml(model.title)}</h1><p class="meta">${escapeXml([model.project, model.date].filter(Boolean).join(' · '))}</p></header>
${sections}
<footer>${escapeXml(labels.generated ?? 'MyWorkPlan')} · ${escapeXml(model.date ?? '')}</footer>
</main>
</body>
</html>
`;
}

// ───────────────────────── Markdown

const mdCell = (value) => String(value ?? '').replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
const mdText = (value) => String(value ?? '').replace(/([\\`*_[\]#<>])/g, '\\$1');

function mdTable(table) {
  if (!table.rows.length) return `_${mdText(table.empty ?? '')}_`;
  const sep = table.columns.map((col) => (col.align === 'right' ? '---:' : col.align === 'center' ? ':---:' : '---'));
  return [
    `| ${table.columns.map((col) => mdCell(col.label)).join(' | ')} |`,
    `| ${sep.join(' | ')} |`,
    ...table.rows.map((row) => `| ${row.map(mdCell).join(' | ')} |`),
  ].join('\n');
}

/** The report as Markdown (GitHub tables; charts become tables of their numbers). */
export function reportToMarkdown(model) {
  const labels = model.labels ?? {};
  const out = [`# ${mdText(model.title)}`, '', `**${mdText(model.project)}** · ${mdText(model.date)}`, ''];
  for (const block of model.blocks) {
    if (block.type === 'note') { out.push(`> ${mdText(block.text)}`, ''); continue; }
    if (blockTitle(block)) out.push(`## ${mdText(block.title)}`, '');
    if (block.type === 'donut') {
      const pct = Math.max(0, Math.min(100, Number(block.percent) || 0));
      out.push(`**${mdText(block.label)}**: ${pct}%  `, `\`${'█'.repeat(Math.round(pct / 5))}${'░'.repeat(20 - Math.round(pct / 5))}\``, '');
      continue;
    }
    const table = blockTable(block, labels);
    if (table) out.push(mdTable(table), '');
    if (block.note) out.push(`> ${mdText(block.note)}`, '');
  }
  out.push('---', '', `_${mdText(labels.generated ?? 'MyWorkPlan')} · ${mdText(model.date)}_`, '');
  return out.join('\n');
}

// ───────────────────────── ZIP (stored entries) + CRC-32

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const utf8 = (text) => new TextEncoder().encode(text);

/** A ZIP archive (entries stored, UTF-8 names) of [{ name, data: string | Uint8Array }]. */
export function zip(entries, date = new Date()) {
  const time = ((date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)) & 0xffff;
  const day = (((Math.max(1980, date.getFullYear()) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xffff;
  const files = entries.map((entry) => {
    const data = typeof entry.data === 'string' ? utf8(entry.data) : entry.data;
    return { name: utf8(entry.name), data, crc: crc32(data) };
  });
  const size = files.reduce((sum, f) => sum + 30 + f.name.length + f.data.length + 46 + f.name.length, 0) + 22;
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  let at = 0;
  const u16 = (v) => { view.setUint16(at, v, true); at += 2; };
  const u32 = (v) => { view.setUint32(at, v >>> 0, true); at += 4; };
  const bytes = (b) => { out.set(b, at); at += b.length; };
  for (const f of files) {
    f.offset = at;
    u32(0x04034b50); u16(20); u16(0x0800); u16(0); u16(time); u16(day); u32(f.crc); u32(f.data.length); u32(f.data.length); u16(f.name.length); u16(0);
    bytes(f.name); bytes(f.data);
  }
  const central = at;
  for (const f of files) {
    u32(0x02014b50); u16(20); u16(20); u16(0x0800); u16(0); u16(time); u16(day); u32(f.crc); u32(f.data.length); u32(f.data.length);
    u16(f.name.length); u16(0); u16(0); u16(0); u16(0); u32(0); u32(f.offset);
    bytes(f.name);
  }
  const centralSize = at - central;
  u32(0x06054b50); u16(0); u16(0); u16(files.length); u16(files.length); u32(centralSize); u32(central); u16(0);
  return out;
}

// ───────────────────────── Word (.docx)

const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
const TEXT_WIDTH = 9638; // twips: A4 (11906) minus 2 cm margins
const FONT = 'Malgun Gothic';

const run = (text, { bold = false, color = null, size = null } = {}) => `<w:r>${bold || color || size ? `<w:rPr>${bold ? '<w:b/><w:bCs/>' : ''}${color ? `<w:color w:val="${color}"/>` : ''}${size ? `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>` : ''}</w:rPr>` : ''}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
const para = (text, style = null, extra = '') => `<w:p>${style || extra ? `<w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${extra}</w:pPr>` : ''}${text === '' ? '' : run(text)}</w:p>`;

function docxTable(table) {
  if (!table.rows.length) return para(table.empty ?? '', 'Note');
  const cols = table.columns.length;
  // Column widths by content length (at least a share of the page, the rest by the longest text).
  const weights = table.columns.map((col, i) => Math.min(40, Math.max(4, approxWidth(col.label, 1), ...table.rows.slice(0, 200).map((row) => approxWidth(row[i] ?? '', 1)))));
  const sum = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((w) => Math.max(600, Math.floor((w / sum) * TEXT_WIDTH)));
  const scale = TEXT_WIDTH / widths.reduce((a, b) => a + b, 0);
  for (let i = 0; i < cols; i++) widths[i] = Math.floor(widths[i] * scale);
  const border = (side) => `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="C9D1DB"/>`;
  const jc = (col) => (col?.align === 'right' ? '<w:jc w:val="right"/>' : col?.align === 'center' ? '<w:jc w:val="center"/>' : '');
  const cell = (text, i, header, band) => `<w:tc><w:tcPr><w:tcW w:w="${widths[i]}" w:type="dxa"/>${header ? '<w:shd w:val="clear" w:color="auto" w:fill="EEF2F7"/>' : band ? '<w:shd w:val="clear" w:color="auto" w:fill="FAFBFC"/>' : ''}</w:tcPr><w:p><w:pPr><w:spacing w:before="20" w:after="20"/>${jc(table.columns[i])}</w:pPr>${run(text, { bold: header })}</w:p></w:tc>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="${TEXT_WIDTH}" w:type="dxa"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>`
    + `<w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`
    + `<w:tr><w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>${table.columns.map((col, i) => cell(col.label, i, true, false)).join('')}</w:tr>`
    + table.rows.map((row, r) => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${table.columns.map((_, i) => cell(row[i] ?? '', i, false, r % 2 === 1)).join('')}</w:tr>`).join('')
    + '</w:tbl>' + para('', null, '<w:spacing w:after="0"/>');
}

function docxImage(rid, n, width, height) {
  const maxCx = 6000000; // EMU (~16.7 cm)
  let cx = Math.round(width * 9525);
  let cy = Math.round(height * 9525);
  if (cx > maxCx) { cy = Math.round((cy * maxCx) / cx); cx = maxCx; }
  return `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="Chart ${n}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>`
    + `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${n}" name="chart${n}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
    + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

const DOCX_STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:eastAsia="${FONT}" w:cs="${FONT}"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="ko-KR" w:eastAsia="ko-KR" w:bidi="ar-SA"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="40"/></w:pPr><w:rPr><w:b/><w:bCs/><w:color w:val="111827"/><w:sz w:val="44"/><w:szCs w:val="44"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="12" w:space="6" w:color="2F6FDE"/></w:pBdr><w:spacing w:after="240"/></w:pPr><w:rPr><w:color w:val="6B7280"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="280" w:after="100"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:bCs/><w:color w:val="1F2937"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Note"><w:name w:val="Note"/><w:basedOn w:val="Normal"/><w:qFormat/><w:rPr><w:i/><w:iCs/><w:color w:val="6B7280"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/><w:rPr><w:color w:val="9CA3AF"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr></w:style>
<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
</w:styles>`;

/**
 * The report as a Word document (.docx bytes). `images` maps a block index to a
 * rendered chart { png: Uint8Array, width, height } (CSS px); charts without one
 * are written as tables of their numbers. Charts with one get both picture and table.
 */
export function reportToDocx(model, { images = {}, now = new Date() } = {}) {
  const labels = model.labels ?? {};
  const media = [];
  const body = [para(model.title, 'Title'), para([model.project, model.date].filter(Boolean).join(' · '), 'Subtitle')];
  model.blocks.forEach((block, index) => {
    if (block.type === 'note') { body.push(para(block.text, 'Note')); return; }
    if (blockTitle(block)) body.push(para(block.title, 'Heading1'));
    const image = images[index];
    if (image?.png?.length) {
      media.push({ index, png: image.png });
      body.push(docxImage(`rIdImg${media.length}`, media.length, image.width, image.height));
    }
    if (block.note) body.push(para(block.note, 'Note'));
    const table = blockTable(block, labels);
    if (table && !(image && block.type === 'donut')) body.push(docxTable(table));
  });
  body.push(para(`${labels.generated ?? 'MyWorkPlan'} · ${model.date ?? ''}`, 'Footer'));
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W_NS}><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${media.map((_, i) => `<Relationship Id="rIdImg${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/chart${i + 1}.png"/>`).join('')}</Relationships>`;
  const created = new Date(Math.floor(now.getTime() / 1000) * 1000).toISOString().replace('.000Z', 'Z');
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escapeXml([model.title, model.project].filter(Boolean).join(' — '))}</dc:title><dc:creator>MyWorkPlan</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${created}</dcterms:modified></cp:coreProperties>`;
  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;
  return zip([
    { name: '[Content_Types].xml', data: types },
    { name: '_rels/.rels', data: rootRels },
    { name: 'docProps/core.xml', data: core },
    { name: 'word/document.xml', data: document },
    { name: 'word/styles.xml', data: DOCX_STYLES },
    { name: 'word/_rels/document.xml.rels', data: rels },
    ...media.map((m, i) => ({ name: `word/media/chart${i + 1}.png`, data: m.png })),
  ], now);
}

/** Bytes → base64 (chunked; for writing binary files through the backend). */
export function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
