// The chart popups: Export (format, size, scale, background, what to include, with a live preview), Import
// (preview of the table with header, delimiter, encoding, decimal and sheet choices), Print (printer, paper,
// orientation, margins, fit, header and footer, data pages, a page preview; prints at once), Palette (every
// colour set) and Data statistics (one row per column), plus the Settings tabs Layout, Charts and Data.
// popup.js hands its helpers over (installChartPopups) and dispatches renders, clicks, changes and messages here.
//
// Data comes from the main window: a popup asks with an action ('chart-preview', 'import-preview', 'print-request',
// 'stats-request') and gets { type: 'chart-preview' | 'import-preview' | 'print-data' | 'stats-data', … } back.
import { EXPORT_KEY, PANE_LAYOUTS, PAPERS, PRINT_KEY } from './domain/settings.js';
import { PALETTES } from './domain/chart/palettes.js';
import { CHART_FORMATS, TRANSPARENT_FORMATS } from './domain/export/chartexport.js';
import { DOC_KINDS, docUrl } from './domain/helpdocs.js';

const FORMAT_ICONS = { png: 'imageFormat', jpg: 'imageFormat', webp: 'imageFormat', gif: 'imageFormat', avif: 'imageFormat', svg: 'svgFile', pdf: 'pdfFile', html: 'htmlFile', docx: 'reportWord', markdown: 'reportMarkdown' };
const PAPER_MM = { A3: [297, 420], A4: [210, 297], A5: [148, 210], B4: [250, 353], B5: [176, 250], Letter: [215.9, 279.4], Legal: [215.9, 355.6], Tabloid: [279.4, 431.8] };
const MARGINS_MM = { none: 0, narrow: 6, normal: 12, wide: 20 };
const fmtNum = (v, lang) => (v == null || !Number.isFinite(v) ? '' : new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'ko-KR', { maximumFractionDigits: Math.abs(v) >= 100 ? 2 : 4 }).format(v));

export function installChartPopups(c) {
  const { kind, root, s, P, L, t, icon, escapeHtml, native, action, close, ready, update, frame, button, row, toggle, segmented, select, numberField, fitHeight } = c;
  const render = () => c.render();
  const ch = { draft: null, preview: null, data: null, printers: null, page: 0, requested: false, sort: null };

  const loadJson = (key) => { try { return JSON.parse(globalThis.localStorage?.getItem(key) ?? '{}') ?? {}; } catch { return {}; } };
  const saveJson = (key, value) => { try { globalThis.localStorage?.setItem(key, JSON.stringify(value)); } catch { /* full */ } };
  const loading = () => `<div class="net-loading">${icon('hourglass')}<span>${escapeHtml(t('stats.loading'))}</span></div>`;
  const check = (attr, key, value, label, glyph) => row(glyph, label, `<label class="switch-wrap" title="${escapeHtml(label)}"><input type="checkbox" ${attr}="${key}" ${value ? 'checked' : ''} aria-label="${escapeHtml(label)}" /><span class="switch" aria-hidden="true"></span></label>`);
  const section = (glyph, title, rows) => `<section class="print-section"><h3>${icon(glyph)}<span>${escapeHtml(title)}</span></h3>${rows.filter(Boolean).join('')}</section>`;

  // ───────────────────────── export

  function exportDraft() {
    if (!ch.draft) {
      const p = P();
      const saved = loadJson(EXPORT_KEY);
      const format = p.format ?? saved.format ?? s().exportFormat ?? 'png';
      ch.draft = { format, width: p.width, height: p.height, scale: saved.scale ?? s().exportScale ?? 2, background: saved.background === 'transparent' && !TRANSPARENT_FORMATS.has(format) ? 'white' : saved.background ?? 'chart', includeData: saved.includeData ?? true, paper: saved.paper ?? s().defaultPaper, orientation: saved.orientation ?? 'auto', quality: saved.quality ?? 92 };
    }
    return ch.draft;
  }

  function requestPreview() {
    const d = exportDraft();
    ch.preview = null;
    action('chart-preview', { width: d.width, height: d.height, background: d.background });
  }

  function renderExport() {
    const p = P();
    const d = exportDraft();
    if (!ch.requested) { ch.requested = true; requestPreview(); }
    const kindOf = CHART_FORMATS[d.format]?.[2];
    const raster = kindOf === 'image';
    const pixels = `${Math.round(d.width * d.scale)} × ${Math.round(d.height * d.scale)} px`;
    const formatTile = (id) => `<button type="button" class="ex-format ${d.format === id ? 'active' : ''}" data-ex-format="${id}" aria-pressed="${d.format === id}" title="${escapeHtml(t(`format.${id}Tip`))}">${icon(FORMAT_ICONS[id])}<b>${escapeHtml(t(`format.${id}`))}</b><small>.${escapeHtml(CHART_FORMATS[id][0])}${TRANSPARENT_FORMATS.has(id) ? `<i class="ex-alpha" title="${escapeHtml(t('export.alphaTip'))}"></i>` : ''}</small></button>`;
    const sizes = [[800, 500], [1024, 640], [1280, 720], [1600, 900], [1920, 1080], [1080, 1080], [1200, 630], [600, 400]];
    root.innerHTML = frame({
      glyph: 'exportChart', title: `${t('export.title')}${p.name ? ` — ${p.name}` : ''}`,
      body: `<div class="ex-view">
        <div class="ex-options">
          ${section('imageFormat', t('export.format'), [`<div class="ex-formats">${Object.keys(CHART_FORMATS).map(formatTile).join('')}</div>`])}
          ${section('chartSize', t('export.size'), [
            row('chartSize', t('export.width'), numberField('ex:width', d.width, 100, 8000, 10, 'px', t('export.width'))),
            row('chartSize', t('export.height'), numberField('ex:height', d.height, 100, 8000, 10, 'px', t('export.height'))),
            `<div class="ex-sizes">${sizes.map(([w, h]) => `<button type="button" class="small-button ${d.width === w && d.height === h ? 'on' : ''}" data-ex-size="${w}x${h}">${w}×${h}</button>`).join('')}</div>`,
            kindOf !== 'vector' && d.format !== 'html' ? row('zoomIn', t('export.scale'), segmented('scale', [[1, '1×'], [2, '2×'], [3, '3×'], [4, '4×']], d.scale, 'data-ex-seg')) : '',
            kindOf !== 'vector' && d.format !== 'html' ? row('info', t('export.pixels'), `<span class="muted">${escapeHtml(pixels)}</span>`) : '',
          ])}
          ${section('fillColor', t('export.look'), [
            // A transparent background is offered only by the formats that keep it (PNG, WebP, GIF, AVIF, SVG, HTML).
            row('fillColor', t('export.background'), select('data-ex', 'background', [['chart', t('export.bgChart'), 'palette'], ['theme', t('bg.theme'), 'palette'], ['white', t('bg.white'), 'whiteBg'], ...(TRANSPARENT_FORMATS.has(d.format) ? [['transparent', t('bg.transparent'), 'transparentBg']] : [])], d.background, t('export.background'))),
            `<p class="muted ex-note" data-ex-alpha="${TRANSPARENT_FORMATS.has(d.format) ? 'yes' : 'no'}">${icon(TRANSPARENT_FORMATS.has(d.format) ? 'transparentBg' : 'info')}${escapeHtml(t(TRANSPARENT_FORMATS.has(d.format) ? 'export.alphaYes' : 'export.alphaNo', { format: t(`format.${d.format}`) }))}</p>`,
            raster && ['jpg', 'webp', 'avif'].includes(d.format) ? row('quality', t('export.quality'), numberField('ex:quality', d.quality, 30, 100, 5, '%', t('export.quality'))) : '',
            ['pdf', 'html', 'docx', 'markdown'].includes(d.format) ? check('data-ex-toggle', 'includeData', d.includeData, t('export.includeData'), 'dataGrid') : '',
            d.format === 'pdf' ? row('file', t('print.paper'), select('data-ex', 'paper', PAPERS.map((x) => [x, x]), d.paper, t('print.paper'))) : '',
            d.format === 'pdf' ? row('pageSetup', t('print.orientation'), segmented('orientation', [['auto', t('print.auto'), 'fitPage'], ['portrait', t('print.portrait'), 'file'], ['landscape', t('print.landscape'), 'pageSetup']], d.orientation, 'data-ex-seg')) : '',
          ])}
        </div>
        <div class="ex-preview ${d.background === 'transparent' ? 'checker' : ''}">${ch.preview ? ch.preview : loading()}</div>
      </div>`,
      foot: `<span class="muted">${escapeHtml(t(`format.${d.format}Tip`))}</span><span class="grow"></span>${button('copy-image', t('stage.copy'), 'copyImage')}${button('close', t('common.cancel'), 'close')}${button('export-ok', t('export.save'), 'save', 'primary')}`,
    });
    ready();
  }

  function finishExport() {
    const d = exportDraft();
    saveJson(EXPORT_KEY, { format: d.format, scale: d.scale, background: d.background, includeData: d.includeData, paper: d.paper, orientation: d.orientation, quality: d.quality });
    update({ exportFormat: d.format, exportScale: d.scale });
    return close({ ...d, orientation: d.orientation === 'auto' ? undefined : d.orientation, quality: d.quality / 100 });
  }

  // ───────────────────────── import

  function importDraft() {
    if (!ch.draft) {
      const p = P();
      ch.draft = { header: p.header ?? s().importHeader, delimiter: p.delimiter ?? s().importDelimiter, encoding: s().importEncoding, decimal: s().importDecimal, sheet: p.sheet ?? 0, mode: p.mode ?? 'new' };
    }
    return ch.draft;
  }

  function requestImport() {
    ch.data = null;
    action('import-preview', { ...importDraft() });
  }

  function renderImport() {
    const p = P();
    const d = importDraft();
    if (!ch.requested) { ch.requested = true; requestImport(); }
    const r = ch.data;
    const text = ['csv', 'tsv', 'text'].includes(r?.format ?? p.format);
    const sheets = r?.sheets ?? p.sheets ?? [];
    const table = r?.table;
    const preview = !r ? loading() : r.error ? `<div class="net-loading error">${icon('error')}<span>${escapeHtml(r.error)}</span></div>` : `<div class="net-table-wrap"><table class="net-table im-table"><thead><tr><th>#</th>${table.columns.map((col) => `<th class="${col.type === 'number' ? 'num' : ''}">${icon(col.type === 'number' ? 'typeNumber' : col.type === 'date' ? 'typeDate' : 'typeText')} ${escapeHtml(col.name)}</th>`).join('')}</tr></thead><tbody>${table.rows.slice(0, 200).map((row, i) => `<tr><td class="muted">${i + 1}</td>${row.map((v, k) => `<td class="${table.columns[k]?.type === 'number' ? 'num' : ''}">${escapeHtml(v == null ? '' : String(v))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    root.innerHTML = frame({
      glyph: 'importData', title: `${t('import.title')}${p.name ? ` — ${p.name}` : ''}`,
      body: `<div class="im-view">
        <div class="im-options">
          ${row('fileData', t('import.format'), `<span class="badge">${escapeHtml(t(`importFormat.${r?.format ?? p.format ?? 'csv'}`, null, (r?.format ?? p.format ?? 'csv').toUpperCase()))}</span>`)}
          ${sheets.length > 1 ? row('dataGrid', t('import.sheet'), select('data-im', 'sheet', sheets.map((name, i) => [String(i), name, 'dataGrid']), String(d.sheet), t('import.sheet'))) : ''}
          ${row('list', t('import.header'), segmented('header', [['auto', t('import.auto')], ['yes', t('import.firstRow')], ['no', t('import.noHeader')]], d.header, 'data-im-seg'))}
          ${text ? row('csvFile', t('import.delimiter'), select('data-im', 'delimiter', [['auto', t('import.auto')], [',', t('import.comma')], [';', t('import.semicolon')], ['\t', t('import.tab')], ['|', t('import.pipe')], [' ', t('import.space')]], d.delimiter, t('import.delimiter'))) : ''}
          ${text ? row('font', t('import.encoding'), select('data-im', 'encoding', [['auto', t('import.auto')], ['utf-8', 'UTF-8'], ['euc-kr', 'EUC-KR (CP949)'], ['utf-16le', 'UTF-16 LE'], ['windows-1252', 'Windows-1252']], d.encoding, t('import.encoding'))) : ''}
          ${row('typeNumber', t('import.decimal'), segmented('decimal', [['auto', t('import.auto')], ['.', '1,234.5'], [',', '1.234,5']], d.decimal, 'data-im-seg'))}
          ${p.canReplace ? row('swapAxes', t('import.into'), segmented('mode', [['new', t('import.newChart'), 'newChart'], ['replace', t('import.replace'), 'refresh']], d.mode, 'data-im-seg')) : ''}
          ${r && !r.error ? row('info', t('import.summary'), `<span class="muted">${escapeHtml(t('import.counts', { rows: r.total ?? table.rows.length, cols: table.columns.length, numbers: table.columns.filter((x) => x.type === 'number').length }))}</span>`) : ''}
        </div>
        <div class="im-preview">${preview}</div>
      </div>`,
      foot: `<span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('import-ok', t('import.ok'), 'importData', 'primary', '', r && !r.error ? '' : 'disabled')}`,
    });
    ready();
  }

  // ───────────────────────── print

  function printOptions() {
    if (!ch.draft) {
      const saved = loadJson(PRINT_KEY);
      ch.draft = { printer: '', copies: 1, paper: s().defaultPaper, orientation: s().defaultOrientation, margin: 'normal', fit: 'page', header: true, footer: true, headerText: '', footerText: '', includeData: false, sheetGrid: true, sheetHeadings: false, ...saved };
    }
    return ch.draft;
  }

  function changePrint(patch) {
    ch.draft = { ...printOptions(), ...patch };
    const { printer, copies, ...kept } = ch.draft;
    void printer; void copies;
    saveJson(PRINT_KEY, kept);
    render();
  }

  // ── documents (P().doc = { kind, lang }): the page is loaded here and laid out on sheets of the chosen paper.
  const MM = 96 / 25.4;
  const docKey = (o) => [o.paper, o.orientation, o.margin, o.header, o.footer].join('|');

  /** The document's <main>: its HTML with image addresses made absolute, without the heading anchors. */
  async function loadDocument(doc) {
    const url = new URL(docUrl(doc.kind, doc.lang) ?? 'docs/UserGuide.html', location.href);
    const html = await (await fetch(url)).text();
    const page = new DOMParser().parseFromString(html, 'text/html');
    const main = page.querySelector('main') ?? page.body;
    for (const img of main.querySelectorAll('img')) { img.setAttribute('src', new URL(img.getAttribute('src'), url).href); img.removeAttribute('loading'); }
    for (const a of main.querySelectorAll('.anchor')) a.remove();
    return { title: main.querySelector('h1')?.textContent.trim() || page.title, html: main.innerHTML };
  }

  /**
   * The document on sheets: its blocks are laid out at the sheet's text width, then put on pages by their measured
   * heights. A heading stays with what follows it; a table or list taller than a page is split (a table repeats its
   * head); an image is never taller than a page.
   */
  async function paginateDocument(content, o) {
    const [pw, ph] = PAPER_MM[o.paper] ?? PAPER_MM.A4;
    const W = o.orientation === 'landscape' ? ph : pw;
    const H = o.orientation === 'landscape' ? pw : ph;
    const margin = MARGINS_MM[o.margin] ?? 12;
    const pageHeight = (H - margin * 2 - (o.header ? 9 : 0) - (o.footer ? 9 : 0)) * MM - 4;
    const measure = document.createElement('div');
    measure.className = 'docp docp-measure';
    measure.style.width = `${(W - margin * 2) * MM}px`;
    measure.style.setProperty('--docp-max-image', `${Math.floor(pageHeight * 0.85)}px`);
    measure.innerHTML = content.html;
    document.body.append(measure);
    await Promise.all([...measure.querySelectorAll('img')].map((img) => (img.complete ? null : new Promise((done) => { img.onload = done; img.onerror = done; }))));
    const heightOf = (el) => { const style = getComputedStyle(el); return el.getBoundingClientRect().height + parseFloat(style.marginTop) + parseFloat(style.marginBottom); };
    const pieces = [];
    for (const block of [...measure.children]) {
      const h = heightOf(block);
      const table = block.matches('table') ? block : block.querySelector(':scope > table');
      if (h > pageHeight && table && table.tBodies[0]) {
        // A long table: chunks of rows that fit, each with the table's head.
        const head = table.tHead ? table.tHead.outerHTML : '';
        const headH = table.tHead ? table.tHead.getBoundingClientRect().height : 0;
        let rows = [];
        let used = headH;
        for (const tr of [...table.tBodies[0].rows]) {
          const rh = tr.getBoundingClientRect().height;
          if (rows.length && used + rh > pageHeight - 8) { pieces.push({ html: `<table>${head}<tbody>${rows.join('')}</tbody></table>`, h: used + 8 }); rows = []; used = headH; }
          rows.push(tr.outerHTML);
          used += rh;
        }
        if (rows.length) pieces.push({ html: `<table>${head}<tbody>${rows.join('')}</tbody></table>`, h: used + 8 });
      } else if (h > pageHeight && block.matches('ul, ol')) {
        // A long list: chunks of items that fit.
        let items = [];
        let used = 0;
        const tag = block.tagName.toLowerCase();
        for (const li of [...block.children]) {
          const lh = heightOf(li);
          if (items.length && used + lh > pageHeight - 8) { pieces.push({ html: `<${tag}>${items.join('')}</${tag}>`, h: used + 8 }); items = []; used = 0; }
          items.push(li.outerHTML);
          used += lh;
        }
        if (items.length) pieces.push({ html: `<${tag}>${items.join('')}</${tag}>`, h: used + 8 });
      } else {
        pieces.push({ html: block.outerHTML, h, heading: /^H[1-4]$/.test(block.tagName) });
      }
    }
    measure.remove();
    const pages = [];
    let page = [];
    let used = 0;
    pieces.forEach((piece, i) => {
      const next = pieces[i + 1];
      // A heading moves to the next page when the block after it would not fit beside it.
      const need = piece.heading && next ? piece.h + Math.min(next.h, pageHeight / 3) : piece.h;
      if (page.length && used + need > pageHeight) { pages.push(page.join('')); page = []; used = 0; }
      page.push(piece.html);
      used += piece.h;
    });
    if (page.length) pages.push(page.join(''));
    return { pages, W, H, margin };
  }

  /** The document's sheets for the current options (laid out again when paper, orientation, margin or header change). */
  function documentPages(o) {
    const p = P();
    // The window is reused: another document or language starts over.
    const which = `${p.doc.kind}|${p.doc.lang}`;
    if (ch.docFor !== which) { ch.docFor = which; ch.doc = null; ch.docLoading = false; ch.docLayout = null; ch.docLaying = null; ch.docError = null; ch.page = 0; }
    if (!ch.doc) {
      if (!ch.docLoading) {
        ch.docLoading = true;
        loadDocument(p.doc).then((doc) => { ch.doc = doc; render(); }).catch((error) => { ch.docError = String(error?.message ?? error); render(); });
      }
      return null;
    }
    const key = docKey(o);
    if (ch.docLayout?.key !== key) {
      if (ch.docLaying !== key) {
        ch.docLaying = key;
        paginateDocument(ch.doc, o).then((layout) => { ch.docLayout = { key, ...layout }; render(); }).catch((error) => { ch.docError = String(error?.message ?? error); render(); });
      }
      if (!ch.docLayout) return null;
    }
    const { pages: contents, W, H, margin } = ch.docLayout;
    const title = ch.doc.title;
    const head = o.header ? `<div class="pc-head"><span>${escapeHtml(o.headerText || title)}</span><span>${escapeHtml(new Date().toLocaleDateString())}</span></div>` : '';
    const foot = (n, total) => (o.footer ? `<div class="pc-foot"><span>${escapeHtml(o.footerText || 'MyChartMaster')}</span><span>${n} / ${total}</span></div>` : '');
    const style = `width:${W}mm;height:${H}mm;padding:${margin}mm`;
    const pages = contents.map((html, k) => `<div class="pp-sheet pc-sheet doc-sheet" style="${style}">${head}<div class="docp docp-page">${html}</div>${foot(k + 1, contents.length)}</div>`);
    return { pages, W, H };
  }

  /**
   * The data window's cells (P().sheet): rows split over pages with the names row repeated on each; columns
   * shrink to the page width ("fit") or go on pages of their own ("actual"). Gridlines and row / column headings
   * are choices.
   */
  function sheetPages(o) {
    const m = ch.data?.sheet;
    if (!m || !Array.isArray(m.rows)) return null;
    const [pw, ph] = PAPER_MM[o.paper] ?? PAPER_MM.A4;
    const W = o.orientation === 'landscape' ? ph : pw;
    const H = o.orientation === 'landscape' ? pw : ph;
    const margin = MARGINS_MM[o.margin] ?? 12;
    const title = m.title || '';
    const head = o.header ? `<div class="pc-head"><span>${escapeHtml(o.headerText || title)}</span><span>${escapeHtml(m.range ?? '')} · ${escapeHtml(new Date().toLocaleDateString())}</span></div>` : '';
    const foot = (n, total) => (o.footer ? `<div class="pc-foot"><span>${escapeHtml(o.footerText || 'MyChartMaster')}</span><span>${n} / ${total}</span></div>` : '');
    const availW = (W - margin * 2) * MM - 2;
    const availH = (H - margin * 2 - (o.header ? 9 : 0) - (o.footer ? 9 : 0)) * MM - 6;
    const headW = o.sheetHeadings ? 34 : 0;
    const widths = (m.widths ?? []).map((w) => Math.max(24, Number(w) || 80));
    const total = widths.reduce((a, b) => a + b, 0);
    let scale = 1;
    let groups = [];
    if (o.fit === 'page') { scale = Math.min(1, availW / (total + headW)); groups = [widths.map((_, i) => i)]; }
    else {
      let group = [];
      let used = headW;
      widths.forEach((w, i) => { if (group.length && used + w > availW) { groups.push(group); group = []; used = headW; } group.push(i); used += w; });
      if (group.length) groups.push(group);
    }
    const rowH = 20 * scale;
    const names = m.rows[0]?.head ? m.rows[0] : null;
    const body = names ? m.rows.slice(1) : m.rows;
    const fixed = (o.sheetHeadings ? rowH : 0) + (names ? rowH : 0);
    const perPage = Math.max(1, Math.floor((availH - fixed) / rowH));
    const chunks = [];
    for (let i = 0; i < Math.max(1, body.length); i += perPage) chunks.push(body.slice(i, i + perPage));
    const cellHtml = (row, i, tag = 'td') => {
      const st = row.styles?.[i];
      const css = [st?.b ? 'font-weight:700' : '', st?.i ? 'font-style:italic' : '', st?.u || st?.s ? `text-decoration:${[st.u ? 'underline' : '', st.s ? 'line-through' : ''].join(' ').trim()}` : '', st?.color ? `color:${st.color}` : '', st?.fill ? `background:${st.fill}` : '', st?.align ? `text-align:${st.align}` : row.numbers?.[i] ? 'text-align:right' : ''].filter(Boolean).join(';');
      return `<${tag}${css ? ` style="${escapeHtml(css)}"` : ''}>${escapeHtml(row.cells?.[i] ?? '')}</${tag}>`;
    };
    const tables = [];
    for (const rows of chunks) {
      for (const cols of groups) {
        const colgroup = `<colgroup>${o.sheetHeadings ? `<col style="width:${headW * scale}px">` : ''}${cols.map((i) => `<col style="width:${widths[i] * scale}px">`).join('')}</colgroup>`;
        const letters = o.sheetHeadings ? `<tr class="ps-letters"><th></th>${cols.map((i) => `<th>${escapeHtml(m.letters?.[i] ?? '')}</th>`).join('')}</tr>` : '';
        const nameRow = names ? `<tr class="ps-names">${o.sheetHeadings ? `<th class="ps-n">${names.n}</th>` : ''}${cols.map((i) => cellHtml(names, i, 'th')).join('')}</tr>` : '';
        const bodyRows = rows.map((row) => `<tr>${o.sheetHeadings ? `<th class="ps-n">${row.n}</th>` : ''}${cols.map((i) => cellHtml(row, i)).join('')}</tr>`).join('');
        tables.push(`<table class="ps-table ${o.sheetGrid ? 'grid' : ''}" style="font-size:${(12 * scale).toFixed(2)}px;--ps-row:${rowH.toFixed(2)}px">${colgroup}<thead>${letters}${nameRow}</thead><tbody>${bodyRows}</tbody></table>`);
      }
    }
    const style = `width:${W}mm;height:${H}mm;padding:${margin}mm`;
    const pages = tables.map((html, k) => `<div class="pp-sheet pc-sheet" style="${style}">${head}<div class="ps-body">${html}</div>${foot(k + 1, tables.length)}</div>`);
    return { pages, W, H };
  }

  /** The sheets: page 1 the chart, then the data table split over pages (or the pages of a document). */
  function printPages() {
    const o = printOptions();
    if (P().doc) return documentPages(o);
    if (P().sheet) return sheetPages(o);
    const m = ch.data;
    if (!m) return null;
    const [pw, ph] = PAPER_MM[o.paper] ?? PAPER_MM.A4;
    const W = o.orientation === 'landscape' ? ph : pw;
    const H = o.orientation === 'landscape' ? pw : ph;
    const margin = MARGINS_MM[o.margin] ?? 12;
    const head = o.header ? `<div class="pc-head"><span>${escapeHtml(o.headerText || m.title)}</span><span>${escapeHtml(new Date().toLocaleDateString())}</span></div>` : '';
    const foot = (n, total) => (o.footer ? `<div class="pc-foot"><span>${escapeHtml(o.footerText || 'MyChartMaster')}</span><span>${n} / ${total}</span></div>` : '');
    const svg = m.svg.replace(/<svg /, '<svg preserveAspectRatio="xMidYMid meet" ');
    const pages = [];
    const rowsPerPage = Math.max(5, Math.floor((H - margin * 2 - 20) / 6.2));
    const dataPages = [];
    if (o.includeData && m.table) {
      for (let i = 0; i < m.table.rows.length; i += rowsPerPage) dataPages.push(m.table.rows.slice(i, i + rowsPerPage));
    }
    const total = 1 + dataPages.length;
    const style = `width:${W}mm;height:${H}mm;padding:${margin}mm`;
    pages.push(`<div class="pp-sheet pc-sheet" style="${style}">${head}<div class="pc-chart ${o.fit === 'actual' ? 'actual' : ''}" style="--w:${m.width};--h:${m.height}">${svg}</div>${foot(1, total)}</div>`);
    dataPages.forEach((rows, k) => {
      pages.push(`<div class="pp-sheet pc-sheet" style="${style}">${head}<table class="pc-table"><thead><tr>${m.table.columns.map((col) => `<th class="${col.num ? 'num' : ''}">${escapeHtml(col.label)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.cells.map((v, i) => `<td class="${m.table.columns[i].num ? 'num' : ''}">${escapeHtml(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>${foot(k + 2, total)}</div>`);
    });
    return { pages, W, H };
  }

  function renderPrint() {
    const p = P();
    const o = printOptions();
    const isDoc = Boolean(p.doc);
    const isSheet = Boolean(p.sheet);
    if (!ch.requested && !isDoc) { ch.requested = true; action('print-request', { sheet: isSheet }); }
    if (!ch.printers) {
      ch.printers = { printers: [], defaultPrinter: '' };
      native.listPrinters().then((list) => { ch.printers = list; if (list.printers.length) render(); }).catch(() => {});
    }
    const { printers, defaultPrinter } = ch.printers;
    const layout = printPages();
    const count = layout?.pages.length ?? 0;
    ch.page = Math.max(0, Math.min(ch.page, count - 1));
    const sel = (key, values, label) => select('data-print', key, values, o[key], label);
    root.innerHTML = frame({
      glyph: 'print', title: `${t('print.title')}${p.name ? ` — ${p.name}` : isDoc && DOC_KINDS[p.doc.kind] ? ` — ${t(DOC_KINDS[p.doc.kind].title)}` : ''}${isSheet ? ` · ${t('sheet.title')}` : ''}`,
      body: `<div class="print-view">
        <div class="print-options">
          <div class="print-column">
          ${section('print', t('print.printer'), [
            printers.length ? row('print', t('print.printer'), select('data-print', 'printer', [['', t('print.defaultPrinter', { name: defaultPrinter || '-' }), 'print'], ...printers.map((name) => [name, name, 'print'])], printers.includes(o.printer) ? o.printer : '', t('print.printer'))) : row('info', '', `<span class="muted">${escapeHtml(t('print.systemDialog'))}</span>`),
            printers.length ? row('copy', t('print.copies'), numberField('print:copies', o.copies, 1, 99, 1, '', t('print.copies'))) : '',
          ])}
          ${section('pageSetup', t('print.tabPage'), [
            row('file', t('print.paper'), sel('paper', PAPERS.map((x) => [x, x]), t('print.paper'))),
            row('pageSetup', t('print.orientation'), segmented('orientation', [['portrait', t('print.portrait'), 'file'], ['landscape', t('print.landscape'), 'pageSetup']], o.orientation, 'data-print-seg')),
            row('fitPage', t('print.margin'), sel('margin', Object.keys(MARGINS_MM).map((x) => [x, t(`print.margin.${x}`)]), t('print.margin'))),
            isDoc ? '' : row('fitView', t('print.fit'), segmented('fit', [['page', t('print.fitPage'), 'fitPage'], ['actual', t('print.actual'), 'chartSize']], o.fit, 'data-print-seg')),
            isSheet ? check('data-print-toggle', 'sheetGrid', o.sheetGrid, t('print.gridlines'), 'grid') : '',
            isSheet ? check('data-print-toggle', 'sheetHeadings', o.sheetHeadings, t('print.headings'), 'sheetWindow') : '',
          ])}
          </div>
          <div class="print-column">
          ${section('notes', t('print.tabHeader'), [
            check('data-print-toggle', 'header', o.header, t('print.header'), 'notes'),
            row('edit', t('print.headerText'), `<input type="text" data-print-text="headerText" value="${escapeHtml(o.headerText)}" placeholder="${escapeHtml((isDoc ? ch.doc?.title : ch.data?.title) ?? '')}" />`),
            check('data-print-toggle', 'footer', o.footer, t('print.footer'), 'pageSetup'),
            row('edit', t('print.footerText'), `<input type="text" data-print-text="footerText" value="${escapeHtml(o.footerText)}" placeholder="MyChartMaster" />`),
            isDoc || isSheet ? '' : check('data-print-toggle', 'includeData', o.includeData, t('print.includeData'), 'dataGrid'),
          ])}
          </div>
        </div>
        <div class="print-preview" id="print-preview">
          ${layout ? `<div class="preview-stage pp-stage" data-w="${layout.W}" data-h="${layout.H}">${layout.pages[ch.page]}</div>` : ch.docError ? `<div class="preview-empty">${icon('error')}<span>${escapeHtml(ch.docError)}</span></div>` : `<div class="preview-empty">${icon('hourglass')}<span>${escapeHtml(t('stats.loading'))}</span></div>`}
        </div>
      </div>
      <div class="print-sheet" aria-hidden="true">${(layout?.pages ?? []).map((html) => `<div class="print-page">${html}</div>`).join('')}</div>`,
      foot: `<button class="icon-button" data-action="print-page" data-value="-1" title="${escapeHtml(t('print.prev'))}" aria-label="${escapeHtml(t('print.prev'))}" ${ch.page <= 0 ? 'disabled' : ''}>${icon('chevronLeft')}</button>
        <span class="page-number" id="page-number">${escapeHtml(t('print.page', { n: count ? ch.page + 1 : 0, total: count }))}</span>
        <button class="icon-button" data-action="print-page" data-value="1" title="${escapeHtml(t('print.next'))}" aria-label="${escapeHtml(t('print.next'))}" ${ch.page >= count - 1 ? 'disabled' : ''}>${icon('chevronRight')}</button>
        <span class="grow"></span>
        <button class="button primary" data-action="print-now" title="${escapeHtml(t('print.print'))}" ${count ? '' : 'disabled'}>${icon('print')}<span>${escapeHtml(t('print.print'))}</span></button>
        ${button('close', t('common.close'), 'close')}`,
    });
    let style = document.querySelector('#page-style');
    if (!style) { style = document.createElement('style'); style.id = 'page-style'; document.head.append(style); }
    if (layout) {
      style.textContent = `@page { size: ${layout.W}mm ${layout.H}mm; margin: 0; }
@media print { .print-sheet .print-page { width: ${layout.W}mm; height: ${layout.H - 0.5}mm; } .print-sheet .pp-sheet { width: ${layout.W}mm !important; height: ${layout.H - 0.5}mm !important; } }`;
    }
    fitPrintPreview();
    ready();
  }

  function fitPrintPreview() {
    const area = root.querySelector('#print-preview');
    const stage = area?.querySelector('.pp-stage');
    if (!stage) return;
    const box = area.getBoundingClientRect();
    const mm = 96 / 25.4;
    const w = Number(stage.dataset.w) * mm;
    const h = Number(stage.dataset.h) * mm;
    const scale = Math.min((box.width - 24) / w, (box.height - 24) / h);
    Object.assign(stage.style, { transform: `scale(${scale})`, width: `${w}px`, height: `${h}px`, left: `${(box.width - w * scale) / 2}px`, top: `${(box.height - h * scale) / 2}px` });
  }

  async function printNow() {
    const layout = printPages();
    if (!layout) return;
    const o = printOptions();
    const job = { printer: ch.printers?.printers.includes(o.printer) ? o.printer : '', copies: o.copies ?? 1, widthMm: layout.W, heightMm: layout.H };
    try {
      const hook = window.__mychartmasterPrintHook ?? (() => { try { return window.parent?.__mychartmasterPrintHook; } catch { return null; } })();
      if (hook) hook(layout, job);
      else if (ch.printers?.printers.length) await native.printDirect(job);
      else await native.printWindow();
      action('printed', { sheets: layout.pages.length });
    } catch (error) {
      action('report-error', { titleKey: 'error.print', message: native.errorText(error), context: 'print' });
    }
  }

  // ───────────────────────── palette

  function renderPalette() {
    const current = P().current ?? 'vivid';
    root.innerHTML = frame({
      glyph: 'palette', title: t('palette.title'),
      body: `<div class="pal-grid" role="radiogroup">${PALETTES.map((pal) => `<button type="button" class="pal-tile ${pal.id === current ? 'active' : ''}" data-pick-palette="${pal.id}" role="radio" aria-checked="${pal.id === current}" title="${escapeHtml(pal[L()])}">
        <span class="pal-swatches">${pal.colors.map((col) => `<i style="background:${col}"></i>`).join('')}</span>
        <span class="pal-bars">${pal.colors.slice(0, 6).map((col, i) => `<i style="background:${col};height:${[60, 85, 45, 100, 70, 55][i]}%"></i>`).join('')}</span>
        <b>${escapeHtml(pal[L()])}</b></button>`).join('')}</div>`,
      foot: `<span class="muted">${escapeHtml(t('palette.hint'))}</span><span class="grow"></span>${button('close', t('common.cancel'), 'close')}`,
    });
    ready();
  }

  // ───────────────────────── data statistics

  function renderDataStats() {
    if (!ch.requested) { ch.requested = true; action('stats-request', {}); }
    const r = ch.data;
    const lang = L();
    const cols = [['name', t('stats.column'), false], ['type', t('stats.type'), false], ['count', t('stats.count'), true], ['empty', t('stats.empty'), true], ['distinct', t('stats.distinct'), true], ['sum', t('stats.sum'), true], ['mean', t('stats.mean'), true], ['median', t('stats.median'), true], ['min', t('stats.min'), true], ['max', t('stats.max'), true], ['stdev', t('stats.stdev'), true]];
    let rows = r?.columns ?? [];
    if (ch.sort) { const [key, dir] = ch.sort; rows = [...rows].sort((a, b) => dir * (typeof a[key] === 'number' && typeof b[key] === 'number' ? a[key] - b[key] : String(a[key] ?? '').localeCompare(String(b[key] ?? '')))); }
    root.innerHTML = frame({
      glyph: 'dataStats', title: `${t('stats.title')}${P().name ? ` — ${P().name}` : ''}`,
      body: r ? `<div class="net-stats"><div class="net-table-wrap"><table class="net-table"><thead><tr>${cols.map(([key, label, num]) => `<th class="${num ? 'num' : ''} ${ch.sort?.[0] === key ? (ch.sort[1] > 0 ? 'asc' : 'desc') : ''}" data-stats-sort="${key}">${escapeHtml(label)}</th>`).join('')}</tr></thead><tbody>${rows.map((x) => `<tr>${cols.map(([key, , num]) => `<td class="${num ? 'num' : ''}">${key === 'type' ? `${icon(x.type === 'number' ? 'typeNumber' : x.type === 'date' ? 'typeDate' : 'typeText')} ${escapeHtml(t(`type.${x.type}`))}` : escapeHtml(num ? fmtNum(x[key], lang) : x[key] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="muted">${escapeHtml(t('stats.rows', { rows: r.rows }))}</p></div>` : loading(),
      foot: `<span class="grow"></span>${button('copy-stats', t('stats.copy'), 'copy', '', '', r ? '' : 'disabled')}${button('close', t('common.close'), 'close', 'primary')}`,
    });
    ready();
  }

  // ───────────────────────── settings tabs

  const settingsTabs = {
    layout: () => [
      row('paneList', t('settings.paneLayout'), segmented('paneLayout', PANE_LAYOUTS.map((id) => [id, t(`layout.${id}`), { 'grid-bottom': 'panelBottom', 'grid-right': 'panelRight', 'chart-only': 'chartColumn' }[id]]), s().paneLayout)),
      toggle('showLeftPanel', t('action.leftPanel'), 'panelLeft'),
      toggle('showRightPanel', t('action.rightPanel'), 'panelRight'),
      toggle('showBottomPanel', t('action.bottomPanel'), 'panelBottom'),
      row('dataGrid', t('settings.rowHeight'), numberField('rowHeight', s().rowHeight, 20, 44, 1, 'px', t('settings.rowHeight'))),
      toggle('showTooltips', t('settings.showTooltips'), 'info'),
      toggle('animateCharts', t('settings.animateCharts'), 'sparkles'),
    ].join(''),
    charts: () => [
      row('palette', t('settings.chartPalette'), select('data-select', 'chartPalette', PALETTES.map((pal) => [pal.id, pal[L()], 'palette']), s().chartPalette, t('settings.chartPalette'))),
      row('fillColor', t('settings.chartBackground'), select('data-select', 'chartBackground', [['white', t('bg.white'), 'whiteBg'], ['theme', t('bg.theme'), 'palette'], ['transparent', t('bg.transparent'), 'transparentBg']], s().chartBackground, t('settings.chartBackground'))),
      row('legendIcon', t('settings.chartLegend'), select('data-select', 'chartLegend', ['top', 'bottom', 'left', 'right', 'none'].map((x) => [x, t(`pos.${x}`)]), s().chartLegend, t('settings.chartLegend'))),
      toggle('chartDataLabels', t('settings.chartDataLabels'), 'labelsIcon'),
      row('chartColumn', t('settings.chartRounded'), numberField('chartRounded', s().chartRounded, 0, 20, 1, 'px', t('settings.chartRounded'))),
      row('chartSize', t('settings.chartWidth'), numberField('chartWidth', s().chartWidth, 200, 8000, 10, 'px', t('settings.chartWidth'))),
      row('chartSize', t('settings.chartHeight'), numberField('chartHeight', s().chartHeight, 150, 8000, 10, 'px', t('settings.chartHeight'))),
      row('font', t('settings.chartFont'), `<input type="text" data-setting-text="chartFont" value="${escapeHtml(s().chartFont)}" placeholder="${escapeHtml(t('inspector.fontDefault'))}" />`),
      `<p class="muted">${escapeHtml(t('settings.chartsHint'))}</p>`,
    ].join(''),
    data: () => [
      row('list', t('import.header'), select('data-select', 'importHeader', [['auto', t('import.auto')], ['yes', t('import.firstRow')], ['no', t('import.noHeader')]], s().importHeader, t('import.header'))),
      row('csvFile', t('import.delimiter'), select('data-select', 'importDelimiter', [['auto', t('import.auto')], [',', t('import.comma')], [';', t('import.semicolon')], ['\t', t('import.tab')], ['|', t('import.pipe')], [' ', t('import.space')]], s().importDelimiter, t('import.delimiter'))),
      row('font', t('import.encoding'), select('data-select', 'importEncoding', [['auto', t('import.auto')], ['utf-8', 'UTF-8'], ['euc-kr', 'EUC-KR (CP949)'], ['utf-16le', 'UTF-16 LE'], ['windows-1252', 'Windows-1252']], s().importEncoding, t('import.encoding'))),
      row('typeNumber', t('import.decimal'), select('data-select', 'importDecimal', [['auto', t('import.auto')], ['.', '1,234.5'], [',', '1.234,5']], s().importDecimal, t('import.decimal'))),
    ].join(''),
  };

  // ───────────────────────── events

  function click(target) {
    const d = ch.draft;
    if (target.dataset.exFormat) {
      // Leaving a format that keeps transparency for one that does not: white instead, and back to transparent later.
      const d = exportDraft();
      d.format = target.dataset.exFormat;
      if (!TRANSPARENT_FORMATS.has(d.format) && d.background === 'transparent') { d.background = 'white'; d.wantTransparent = true; requestPreview(); }
      else if (TRANSPARENT_FORMATS.has(d.format) && d.wantTransparent) { d.background = 'transparent'; d.wantTransparent = false; requestPreview(); }
      return render();
    }
    if (target.dataset.exSize) { const [w, h] = target.dataset.exSize.split('x').map(Number); Object.assign(exportDraft(), { width: w, height: h }); requestPreview(); return render(); }
    if (target.dataset.exSeg) {
      const key = target.dataset.exSeg;
      exportDraft()[key] = key === 'scale' ? Number(target.dataset.value) : target.dataset.value;
      return render();
    }
    if (target.dataset.imSeg) { importDraft()[target.dataset.imSeg] = target.dataset.value; if (target.dataset.imSeg !== 'mode') requestImport(); return render(); }
    if (target.dataset.printSeg) return changePrint({ [target.dataset.printSeg]: target.dataset.value });
    if (target.dataset.pickPalette) return close({ palette: target.dataset.pickPalette });
    if (target.dataset.statsSort) { const key = target.dataset.statsSort; ch.sort = [key, ch.sort?.[0] === key ? -ch.sort[1] : 1]; return render(); }
    switch (target.dataset.action) {
      case 'export-ok': return finishExport();
      case 'copy-image': return action('copy-image', { ...exportDraft() });
      case 'import-ok': return close({ ...importDraft() });
      case 'print-page': ch.page += Number(target.dataset.value); return render();
      case 'print-now': return printNow();
      case 'copy-stats': {
        const r = ch.data;
        if (!r) return undefined;
        const keys = ['name', 'type', 'count', 'empty', 'distinct', 'sum', 'mean', 'median', 'min', 'max', 'stdev'];
        return action('copy-text', { text: [keys.join('\t'), ...r.columns.map((x) => keys.map((k) => x[k] ?? '').join('\t'))].join('\n'), what: t('stats.title') });
      }
      default: void d; return undefined;
    }
  }

  function change(target) {
    if (target.dataset.ex) { exportDraft()[target.dataset.ex] = target.value; if (target.dataset.ex === 'background') { exportDraft().wantTransparent = false; requestPreview(); } return render(); }
    if (target.dataset.exToggle) { exportDraft()[target.dataset.exToggle] = target.checked; return render(); }
    if (target.dataset.im) { importDraft()[target.dataset.im] = target.dataset.im === 'sheet' ? Number(target.value) : target.value; requestImport(); return render(); }
    if (target.dataset.print) return changePrint({ [target.dataset.print]: target.value });
    if (target.dataset.printToggle) return changePrint({ [target.dataset.printToggle]: target.checked });
    if (target.dataset.printText) return changePrint({ [target.dataset.printText]: target.value });
    return undefined;
  }

  function input() {}

  function stepper(scope, field, value) {
    if (scope === 'ex') {
      exportDraft()[field] = value;
      if (field === 'width' || field === 'height') { clearTimeout(ch.timer); ch.timer = setTimeout(requestPreview, 250); }
      return render();
    }
    if (scope === 'print') return changePrint({ [field]: value });
    return undefined;
  }

  function message(m) {
    if (m?.type === 'chart-preview' && kind === 'export') { ch.preview = m.svg; render(); return true; }
    if (m?.type === 'import-preview' && kind === 'import') { ch.data = m; render(); return true; }
    if (m?.type === 'print-data' && kind === 'print') { ch.data = m; render(); return true; }
    if (m?.type === 'stats-data' && kind === 'datastats') { ch.data = m; render(); return true; }
    return false;
  }

  return {
    renderers: { export: renderExport, import: renderImport, print: renderPrint, palette: renderPalette, datastats: renderDataStats },
    settingsTabs,
    enterActions: {},
    click, change, input, message, stepper, keydown: () => {},
    refresh: () => { ch.draft = null; ch.preview = null; ch.data = null; ch.requested = false; ch.page = 0; ch.sort = null; ch.docFor = null; ch.doc = null; ch.docLayout = null; ch.docLaying = null; ch.docLoading = false; ch.docError = null; },
    resize: () => { if (kind === 'print') fitPrintPreview(); },
    state: ch,
    fitHeight,
  };
}
