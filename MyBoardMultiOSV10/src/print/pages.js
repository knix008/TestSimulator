// Lays the print content (print/host.js) out on pages of the chosen paper: a project page, the board (a table per
// column), the reports (picture + summary, one or two per page) and the issue list; tables continue on the next
// page with their header repeated. Heights are estimated in millimetres (rows have a fixed height in print.css),
// so the same pages come out in the preview and on paper. Pure: (content, setup, t) → { pages: [html], geometry }.
import { escapeHtml as esc } from '../ui/dom.js';

export const PAPERS = { A4: { width: 210, height: 297 }, A3: { width: 297, height: 420 }, Letter: { width: 215.9, height: 279.4 }, Legal: { width: 215.9, height: 355.6 } };
export const MARGINS = { narrow: 8, normal: 14, wide: 22 };
export const PARTS = ['project', 'board', 'reports', 'issues'];

// heights (mm) — print.css uses the same values
const H = { head: 10, foot: 8, title: 11, subtitle: 8, row: 6.2, tableHead: 7, gap: 4, para: 5.2, tiles: 15 };

export function defaultSetup() {
  return { printer: '', copies: 1, paper: 'A4', orientation: 'portrait', margin: 'normal', color: 'color', headerFooter: true, parts: { project: true, board: true, reports: true, issues: true }, reports: {} };
}

export function geometryOf(setup) {
  const paper = PAPERS[setup.paper] ?? PAPERS.A4;
  const landscape = setup.orientation === 'landscape';
  const width = landscape ? paper.height : paper.width;
  const height = landscape ? paper.width : paper.height;
  const margin = MARGINS[setup.margin] ?? MARGINS.normal;
  const inner = { width: width - 2 * margin, height: height - 2 * margin - (setup.headerFooter ? H.head + H.foot : 0) };
  return { width, height, margin, inner };
}

/** Packs blocks ({ h, html }) and tables into pages of `room` mm. */
function packer(room) {
  const pages = [];
  let page = [];
  let left = room;
  const flush = () => { if (page.length) pages.push(page.join('')); page = []; left = room; };
  return {
    pages,
    newPage: flush,
    block(h, html) { if (h > left && page.length) flush(); page.push(html); left -= h; },
    /** A table: rows flow over pages, the title (first page) and the header row are kept with at least 3 rows. */
    table(title, head, rows, cls = '') {
      const headRow = `<tr>${head.map(([text, w]) => `<th style="${w ? `width:${w}` : ''}">${esc(text)}</th>`).join('')}</tr>`;
      let i = 0;
      let first = true;
      while (i < rows.length || first) {
        const titleH = first && title ? H.subtitle : 0;
        if (left < titleH + H.tableHead + H.row * Math.min(3, Math.max(1, rows.length - i)) && page.length) flush();
        const fit = Math.max(1, Math.floor((left - titleH - H.tableHead) / H.row));
        const chunk = rows.slice(i, i + fit);
        page.push(`${first && title ? `<h3 class="pp-sub">${title}</h3>` : ''}<table class="pp-table ${cls}"><thead>${headRow}</thead><tbody>${chunk.join('')}</tbody></table>`);
        left -= titleH + H.tableHead + chunk.length * H.row + H.gap;
        i += chunk.length;
        first = false;
        if (i < rows.length) flush();
      }
    },
    get left() { return left; },
  };
}

const cell = (v) => `<td>${esc(v ?? '')}</td>`;

export function layoutPages(content, setup, t) {
  const g = geometryOf(setup);
  if (!content) return { pages: [], geometry: g };
  const P = packer(g.inner.height);
  const part = (key) => setup.parts?.[key] !== false;
  const info = content.project;
  // ── the project
  if (part('project')) {
    const pairs = [
      [t('print.p.key'), info.key], [t('print.p.name'), info.name], [t('print.p.lead'), info.lead || '—'],
      [t('print.p.members'), info.members ?? '—'], [t('print.p.board'), info.boardName || '—'], [t('print.p.issues'), info.issueCount],
    ];
    const cats = ['todo', 'inprogress', 'done'].map((c) => `<div class="pp-tile cat-${c}"><span>${esc(t(`print.cat.${c}`))}</span><b>${info.byCategory?.[c] ?? 0}</b></div>`).join('');
    const listOf = (items) => (items.length ? esc(items.join(', ')) : '—');
    P.block(H.title, `<h2 class="pp-title">${esc(t('print.p.project'))}</h2>`);
    P.block(pairs.length * H.row + H.gap, `<table class="pp-kv">${pairs.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(String(v))}</td></tr>`).join('')}</table>`);
    if (info.description) P.block(Math.ceil(info.description.length / 95 + 1) * H.para + H.gap, `<div class="pp-desc"><h3 class="pp-sub">${esc(t('print.p.description'))}</h3><p>${esc(info.description).replace(/\n/g, '<br>')}</p></div>`);
    P.block(H.subtitle + H.tiles + H.gap, `<h3 class="pp-sub">${esc(t('print.p.byCategory'))}</h3><div class="pp-tiles">${cats}</div>`);
    const lines = [
      [t('print.p.types'), listOf(info.types)],
      [t('print.p.statuses'), listOf(info.statuses.map((s) => `${s.name} (${t(`print.cat.${s.category}`)})`))],
      [t('print.p.components'), listOf(info.components)],
      [t('print.p.versions'), listOf(info.versions.map((v) => `${v.name}${v.released ? ` · ${t('print.p.released')}` : v.releaseDate ? ` · ${v.releaseDate}` : ''}`))],
    ];
    P.block(lines.length * H.row * 1.6 + H.gap, `<table class="pp-kv wrap">${lines.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`).join('')}</table>`);
  }
  // ── the board
  if (part('board') && content.columns?.length) {
    P.newPage();
    P.block(H.title, `<h2 class="pp-title">${esc(t('print.p.boardTitle', { name: info.boardName }))}</h2>`);
    const head = [[t('print.p.col.key'), '18%'], [t('print.p.col.summary'), ''], [t('print.p.col.assignee'), '20%'], [t('print.p.col.priority'), '14%'], [t('print.p.col.points'), '9%']];
    for (const c of content.columns) {
      const rows = c.issues.length ? c.issues.map((i) => `<tr>${cell(i.key)}${cell(i.summary)}${cell(i.assignee)}${cell(i.priority)}${cell(i.points)}</tr>`) : [`<tr><td colspan="5" class="pp-none">${esc(t('print.p.noIssues'))}</td></tr>`];
      P.table(esc(t('print.p.column', { name: c.name, n: c.issues.length })), head, rows);
    }
  }
  // ── the reports
  const chosen = (content.reports ?? []).filter((r) => setup.reports?.[r.id] !== false);
  if (part('reports') && chosen.length) {
    P.newPage();
    const chartH = Math.min(g.inner.width * (330 / 760), g.inner.height * 0.42);
    for (const r of chosen) {
      const h = H.title + H.para + (r.error ? H.para : chartH + H.tiles + H.para) + H.gap * 2;
      const tiles = (r.summary ?? []).slice(0, 6).map((x) => `<div class="pp-tile"><span>${esc(x.label)}</span><b>${esc(String(x.value))}</b></div>`).join('');
      P.block(h, `<section class="pp-report">
        <h2 class="pp-title">${esc(r.title)}${r.range ? `<small>${esc(r.range)}</small>` : ''}</h2>
        <p class="pp-muted">${esc(r.description)}</p>
        ${r.error ? `<p class="pp-error">${esc(t('print.p.reportError', { error: r.error }))}</p>` : `<div class="pp-chart" style="height:${chartH.toFixed(1)}mm">${r.svg}</div><div class="pp-legend">${r.legend}</div><div class="pp-tiles">${tiles}</div>`}
      </section>`);
    }
  }
  // ── the issue list
  if (part('issues') && content.issues?.length) {
    P.newPage();
    P.block(H.title, `<h2 class="pp-title">${esc(t('print.p.issueList'))} <small>${content.issues.length}</small></h2>`);
    const head = [[t('print.p.col.key'), '12%'], [t('print.p.col.summary'), ''], [t('print.p.col.type'), '11%'], [t('print.p.col.status'), '13%'], [t('print.p.col.priority'), '11%'], [t('print.p.col.assignee'), '14%'], [t('print.p.col.due'), '11%']];
    P.table('', head, content.issues.map((i) => `<tr>${cell(i.key)}${cell(i.summary)}${cell(i.type)}${cell(i.status)}${cell(i.priority)}${cell(i.assignee)}${cell(i.due)}</tr>`));
  }
  P.newPage();
  return { pages: P.pages, geometry: g };
}

/** One page with its header and footer, sized in millimetres. */
export function pageHtml(inner, index, total, geometry, setup, content, t) {
  const { width, height, margin } = geometry;
  const date = new Date(content?.at ?? Date.now()).toLocaleDateString(content?.lang === 'en' ? 'en-US' : 'ko-KR');
  const head = setup.headerFooter ? `<header class="pp-head"><b>${esc(content?.project?.name ?? '')}</b><span>${esc(content?.project?.key ?? '')}</span><span class="grow"></span><span>${esc(t('print.p.printedAt', { date }))}</span></header>` : '';
  const foot = setup.headerFooter ? `<footer class="pp-foot"><span>MyBoard</span><span class="grow"></span><span>${esc(t('print.pageOf', { n: index + 1, total }))}</span></footer>` : '';
  return `<div class="pp-page${setup.color === 'grey' ? ' grey' : ''}" style="width:${width}mm;height:${height}mm;padding:${margin}mm">${head}<main class="pp-body">${inner}</main>${foot}</div>`;
}
