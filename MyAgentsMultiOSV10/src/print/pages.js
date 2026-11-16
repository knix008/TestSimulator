// Lays the print content (print/host.js) out on pages of the chosen paper: the agent's overview, its flow
// picture, every node with its settings, and the last run; tables continue on the next page with their header
// repeated. Heights are estimated in millimetres (rows have a fixed height in print.css), so the preview and
// the paper show the same pages. Pure: (content, setup, t) → { pages: [html], geometry }.
import { escapeHtml as esc } from '../ui/dom.js';
import { autoLayout } from '../../core/layout.js';
import { diagramSvg } from './host.js';

export const PAPERS = { A4: { width: 210, height: 297 }, A3: { width: 297, height: 420 }, B5: { width: 176, height: 250 }, Letter: { width: 215.9, height: 279.4 }, Legal: { width: 215.9, height: 355.6 } };
export const MARGINS = { narrow: 8, normal: 14, wide: 22 };
export const PARTS = ['overview', 'diagram', 'nodes', 'run'];
export const SCALES = [70, 80, 90, 100, 110, 120];

// heights (mm) — print.css uses the same values
const H = { head: 10, foot: 8, title: 11, subtitle: 8, row: 6.2, tableHead: 7, gap: 4, para: 5.2, tiles: 15, line: 4.6 };

export function defaultSetup() {
  return { printer: '', copies: 1, paper: 'A4', orientation: 'portrait', margin: 'normal', color: 'color', scale: 100, headerFooter: true, pageNumbers: true, nodeSettings: true, diagramLayout: 'fit', parts: { overview: true, diagram: true, nodes: true, run: true } };
}

export function geometryOf(setup) {
  const paper = PAPERS[setup.paper] ?? PAPERS.A4;
  const landscape = setup.orientation === 'landscape';
  const width = landscape ? paper.height : paper.width;
  const height = landscape ? paper.width : paper.height;
  const margin = MARGINS[setup.margin] ?? MARGINS.normal;
  const scale = (SCALES.includes(Number(setup.scale)) ? Number(setup.scale) : 100) / 100;
  // The content is drawn at `scale`: the page holds 1/scale as much (the body is zoomed by the same factor).
  const inner = { width: (width - 2 * margin) / scale, height: (height - 2 * margin - (setup.headerFooter ? H.head + H.foot : 0)) / scale };
  return { width, height, margin, inner, scale };
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
    /** A table: rows flow over pages; the title (first page) and the header row stay with at least 3 rows. */
    table(title, head, rows, cls = '') {
      const headRow = `<tr>${head.map(([label, w]) => `<th style="${w ? `width:${w}` : ''}">${esc(label)}</th>`).join('')}</tr>`;
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
  };
}

const cell = (v, cls = '') => `<td${cls ? ` class="${cls}"` : ''}>${esc(v ?? '')}</td>`;
const fmtMs = (ms) => (ms == null ? '' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);
/** Lines a text takes at about `perLine` characters a line (Korean counts double). */
const linesOf = (s, perLine) => Math.max(1, Math.ceil([...String(s)].reduce((n, ch) => n + (ch.charCodeAt(0) > 0x2e80 ? 2 : 1), 0) / perLine));

export function layoutPages(content, setup, t) {
  const g = geometryOf(setup);
  if (!content) return { pages: [], geometry: g };
  const P = packer(g.inner.height);
  const part = (key) => setup.parts?.[key] !== false;
  const a = content.agent;
  const perLine = Math.floor(g.inner.width / 1.9);
  // ── overview
  if (part('overview')) {
    const pairs = [
      [t('print.p.name'), a.name], [t('print.p.triggers'), a.triggers.join(', ') || '—'], [t('print.p.nodes'), `${a.nodes} · ${t('print.p.edges', { n: a.edges })}`],
      [t('print.p.deployed'), a.deployed ? t('print.p.yes') : t('print.p.no')], ...(a.tags?.length ? [[t('print.p.tags'), a.tags.join(', ')]] : []),
      ...(a.updatedAt ? [[t('print.p.updated'), new Date(a.updatedAt).toLocaleString(content.lang === 'en' ? 'en-US' : 'ko-KR')]] : []),
    ];
    P.block(H.title, `<h2 class="pp-title">${esc(t('print.p.overview'))}</h2>`);
    P.block(pairs.length * H.row + H.gap, `<table class="pp-kv">${pairs.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(String(v))}</td></tr>`).join('')}</table>`);
    if (a.description) P.block(H.subtitle + linesOf(a.description, perLine) * H.line + H.gap, `<div class="pp-desc"><h3 class="pp-sub">${esc(t('print.p.description'))}</h3><p>${esc(a.description).replace(/\n/g, '<br>')}</p></div>`);
    const tiles = Object.entries(a.byCategory ?? {}).map(([id, n]) => `<div class="pp-tile"><span>${esc(t(`print.cat.${id}`))}</span><b>${n}</b></div>`).join('');
    if (tiles) P.block(H.subtitle + H.tiles + H.gap, `<h3 class="pp-sub">${esc(t('print.p.byCategory'))}</h3><div class="pp-tiles">${tiles}</div>`);
    if (a.variables?.length) P.table(esc(t('print.p.variables')), [[t('print.p.col.key'), '30%'], [t('print.p.col.value'), '']], a.variables.map(([k, v]) => `<tr>${cell(k)}${cell(v)}</tr>`));
  }
  // ── the flow picture: as wide as the page, at most 60 % of its height (a whole page of its own when it is
  //    tall); 'fit' lays the nodes out again in rows shaped like that space, 'canvas' keeps the canvas's places
  const room = { w: g.inner.width, h: g.inner.height - H.title - H.gap };
  const flow = content.flow;
  const svg = flow?.nodes?.length ? diagramSvg({ nodes: setup.diagramLayout === 'canvas' ? flow.nodes : autoLayout(flow.nodes, flow.edges, { aspect: room.w / (room.h * 0.75) }), edges: flow.edges }, content.lang) : content.diagram ?? '';
  if (part('diagram') && svg) {
    const m = /viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg);
    const ratio = m ? Number(m[4]) / Number(m[3]) : 0.5;
    const h = Math.min(room.w * ratio, room.h);
    P.block(H.title + h + H.gap, `<section class="pp-diagram"><h2 class="pp-title">${esc(t('print.p.diagram'))}</h2><div class="pp-chart" style="height:${h.toFixed(1)}mm">${svg}</div></section>`);
  }
  // ── the nodes: a summary table, then each node's settings
  if (part('nodes') && content.nodes?.length) {
    P.newPage();
    P.block(H.title, `<h2 class="pp-title">${esc(t('print.p.nodeList'))} <small>${content.nodes.length}</small></h2>`);
    P.table('', [[t('print.p.col.no'), '7%'], [t('print.p.col.name'), ''], [t('print.p.col.type'), '24%'], [t('print.p.col.category'), '17%'], [t('print.p.col.phase'), '17%']],
      content.nodes.map((n, i) => `<tr>${cell(String(i + 1))}<td><i class="pp-dot" style="background:${esc(n.color)}"></i>${esc(n.name)}${n.disabled ? ` <small class="pp-muted-inline">(${esc(t('print.p.disabled'))})</small>` : ''}</td>${cell(n.type)}${cell(n.category)}${cell(n.phase || '—')}</tr>`));
    if (setup.nodeSettings !== false) {
      for (const [i, n] of content.nodes.entries()) {
        const rows = n.settings.map(([k, v]) => `<tr><th>${esc(k)}</th><td class="pp-pre">${esc(v)}</td></tr>`);
        const h = H.subtitle + (n.description ? linesOf(n.description, perLine) * H.line : 0) + n.settings.reduce((sum, [, v]) => sum + Math.max(H.row, linesOf(v, Math.floor(perLine * 0.7)) * H.line + 1.4), 0) + H.gap;
        P.block(Math.min(h, g.inner.height), `<section class="pp-node"><h3 class="pp-sub"><i class="pp-dot" style="background:${esc(n.color)}"></i>${i + 1}. ${esc(n.name)} <small>${esc(n.type)}</small></h3>${n.description ? `<p class="pp-text">${esc(n.description)}</p>` : ''}${rows.length ? `<table class="pp-kv wrap">${rows.join('')}</table>` : `<p class="pp-muted">${esc(t('print.p.noSettings'))}</p>`}</section>`);
      }
    }
  }
  // ── the last run
  if (part('run')) {
    P.newPage();
    const r = content.run;
    P.block(H.title, `<h2 class="pp-title">${esc(t('print.p.run'))}${r ? ` <small>${esc(t(`run.status.${r.status}`))} · ${esc(fmtMs(r.ms))}${r.startedAt ? ` · ${esc(new Date(r.startedAt).toLocaleString(content.lang === 'en' ? 'en-US' : 'ko-KR'))}` : ''}</small>` : ''}</h2>`);
    if (!r) P.block(H.para, `<p class="pp-muted">${esc(t('print.p.noRun'))}</p>`);
    else {
      if (r.error) P.block(H.para * 2, `<p class="pp-error">${esc(r.error)}</p>`);
      P.table('', [[t('print.p.col.no'), '7%'], [t('print.p.col.name'), '24%'], [t('print.p.col.status'), '12%'], [t('print.p.col.time'), '10%'], [t('print.p.col.output'), '']],
        r.steps.map((s, i) => `<tr>${cell(String(i + 1))}${cell(s.name)}${cell(t(`run.status.${s.status}`), `st-${s.status}`)}${cell(fmtMs(s.ms))}${cell(s.output)}</tr>`));
    }
  }
  P.newPage();
  return { pages: P.pages, geometry: g };
}

/** One page with its header and footer, sized in millimetres. */
export function pageHtml(inner, index, total, geometry, setup, content, t) {
  const { width, height, margin, scale } = geometry;
  const date = new Date(content?.at ?? Date.now()).toLocaleDateString(content?.lang === 'en' ? 'en-US' : 'ko-KR');
  const head = setup.headerFooter ? `<header class="pp-head"><b>${esc(content?.title ?? '')}</b><span class="grow"></span><span>${esc(t('print.p.printedAt', { date }))}</span></header>` : '';
  const number = setup.pageNumbers !== false ? `<span>${esc(t('print.pageOf', { n: index + 1, total }))}</span>` : '';
  const foot = setup.headerFooter ? `<footer class="pp-foot"><span>MyAgents</span><span class="grow"></span>${number}</footer>` : number ? `<footer class="pp-foot bare"><span class="grow"></span>${number}</footer>` : '';
  return `<div class="pp-page${setup.color === 'grey' ? ' grey' : ''}" style="width:${width}mm;height:${height}mm;padding:${margin}mm"${scale !== 1 ? ` data-scale="${scale}"` : ''}>${head}<main class="pp-body"><div class="pp-zoom" style="${scale !== 1 ? `zoom:${scale};` : ''}">${inner}</div></main>${foot}</div>`;
}
