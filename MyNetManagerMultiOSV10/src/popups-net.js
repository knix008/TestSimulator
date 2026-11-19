// The network analysis popups: capture options, colouring rules, display filter expression, saved
// filters, statistics (tables, trees, properties, text), charts (I/O graph, TCP stream graphs),
// follow stream, flow graph, export options, decode as, enabled protocols, go to packet, find,
// time shift and packet list columns. popup.js hands its helpers over (installNetPopups) and
// dispatches renders, clicks, changes and host messages here.
//
// Data: a statistics popup asks the main window ('stats-request' { statKind, options, displayedOnly })
// and gets { type: 'stats-data', result } back (src/analysis-bridge.js makes the result).
import { loadSavedFilters, storeSavedFilters } from './domain/filters-store.js';
import { svgToCanvas } from './domain/export/images.js';
import { CAPTURE_PRESETS, presetButtons, togglePreset } from './domain/filter/presets.js';
import { COLUMN_KINDS, DEFAULT_COLUMNS, PANE_LAYOUTS, PRINT_KEY, TIME_FORMATS, TIME_PRECISIONS } from './domain/settings.js';
import { defaultPrintOptions, FONT_SIZES, layoutPrint, MARGINS, PAPERS, paperSize, PRINT_DETAILS, PRINT_RANGES } from './print/packets.js';

const PALETTE = ['#1f77b4', '#d62728', '#2ca02c', '#ff7f0e', '#9467bd', '#8c564b', '#e377c2', '#17becf', '#7f7f7f', '#bcbd22'];
const fmtBytes = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(2)} MB` : n >= 1e3 ? `${(n / 1e3).toFixed(1)} kB` : `${n} B`);
/** Export formats offered in the statistics and print windows, with their icons (docexport.js writes them). */
const DOC_FORMAT_LIST = [['html', 'protoWeb'], ['markdown', 'notes'], ['pdf', 'exportReport'], ['docx', 'exportFile']];
const fmtNumber = (value, fmt) => {
  if (value == null || value === '') return '';
  if (typeof value !== 'number') return String(value);
  if (fmt === 'bytes') return fmtBytes(value);
  if (fmt === 'pct') return `${value.toFixed(2)}%`;
  if (fmt === 'time') return value.toFixed(6);
  if (fmt === 'bps') return value >= 1e6 ? `${(value / 1e6).toFixed(2)} M` : value >= 1e3 ? `${(value / 1e3).toFixed(1)} k` : value.toFixed(0);
  if (fmt === 'float') return value.toFixed(4);
  return Number.isInteger(value) ? String(value) : value.toFixed(3);
};

export function installNetPopups(c) {
  const { kind, root, state, s, P, L, t, icon, escapeHtml, native, action, close, ready, update, frame, button, row, toggle, segmented, select, numberField, tabsHtml, paged, fitHeight, copyText } = c;
  const render = () => c.render();
  const net = { data: null, loading: false, sort: null, query: '', collapsed: new Set(), selectedRow: null, draft: null, fields: null, protocols: null, colorRules: null };

  const request = (statKind, options = {}) => {
    net.loading = true;
    action('stats-request', { statKind, options, displayedOnly: Boolean(net.draft?.displayedOnly) });
  };

  const loadingHtml = () => `<div class="net-loading">${icon('hourglass')}<span>${escapeHtml(t('stats.loading'))}</span></div>`;
  const errorHtml = (text) => `<div class="net-loading error">${icon('error')}<span>${escapeHtml(text)}</span></div>`;

  // ───────────────────────── statistics (tables, trees, properties, text)

  const STAT_META = {
    properties: ['captureProperties', 'action.captureProperties'], resolved: ['resolvedAddresses', 'action.resolvedAddresses'], hierarchy: ['protocolHierarchy', 'action.protocolHierarchy'],
    conversations: ['conversations', 'action.conversations'], endpoints: ['endpoints', 'action.endpoints'], lengths: ['packetLengths', 'action.packetLengths'],
    httpCounter: ['httpStats', 'action.httpCounter'], httpRequests: ['httpStats', 'action.httpRequests'], httpLoad: ['httpStats', 'action.httpLoad'], dns: ['dnsStats', 'action.dnsStats'],
    ipStats: ['endpoints', 'action.ipv4Stats'], ports: ['endpoints', 'action.portTypes'], expert: ['expertInfo', 'action.expertInfo'], objects: ['exportObjects', 'action.exportObjectsHttp'],
    packet: ['showPacketWindow', 'action.packetWindow'], firewall: ['protoLock', 'action.firewallRules'], credentials: ['protoLock', 'action.credentials'], sip: ['protoVoip', 'action.sipFlows'],
    rtp: ['protoVoip', 'action.rtpStreams'], wlan: ['ifWifi', 'action.wlanTraffic'],
  };

  function statOptions() {
    const p = P();
    const d = net.draft;
    return { tab: d.tab, version: p.version, objectKind: p.objectKind, index: p.index, product: d.product, stream: d.stream };
  }

  function renderStats() {
    const p = P();
    if (!net.draft) {
      net.draft = { tab: p.tab ?? null, displayedOnly: false, product: 'iptables', stream: p.stream ?? 0 };
      request(p.statKind, statOptions());
    }
    const [glyph, titleKey] = STAT_META[p.statKind] ?? ['ioGraph', 'menu.statistics'];
    const titleText = p.statKind === 'ipStats' && p.version === 6 ? t('action.ipv6Stats') : p.statKind === 'objects' ? t(`action.exportObjects${({ http: 'Http', tftp: 'Tftp', imf: 'Imf', 'ftp-data': 'Ftp' })[p.objectKind] ?? 'Http'}`) : t(titleKey);
    const r = net.data;
    let body = loadingHtml();
    if (r?.error) body = errorHtml(r.error);
    else if (r && !net.loading) body = statBody(r);
    const tabs = r?.tabs ? tabsHtml(r.tabs.map((tab) => [tab.id, tab.icon ?? 'conversations', tab.count != null ? `${tab.label} · ${tab.count}` : tab.label]), r.tab ?? net.draft.tab ?? r.tabs[0].id, 'stat-tab') : '';
    const canFilter = r?.view === 'table' || r?.view === 'tree';
    // The filter controls sit above the list: what to count, the search box, the display filter
    // from the selected row and, for a tree, expand / collapse all.
    const filterBar = [
      p.statKind !== 'packet' && p.statKind !== 'firewall' ? `<label class="check-inline" title="${escapeHtml(t('stats.displayedOnly'))}"><input type="checkbox" data-net="displayedOnly" ${net.draft.displayedOnly ? 'checked' : ''} /><span>${escapeHtml(t('stats.displayedOnly'))}</span></label>` : '',
      canFilter ? `<span class="net-search">${icon('search')}<input type="text" data-net="query" value="${escapeHtml(net.query)}" placeholder="${escapeHtml(t('stats.search'))}" aria-label="${escapeHtml(t('stats.search'))}" /></span>` : '',
      r?.view === 'tree' && !r.error ? button('net-expand-all', t('action.expandAll'), 'expandAll', 'small') + button('net-collapse-all', t('action.collapseAll'), 'collapseAll', 'small') : '',
      '<span class="grow"></span>',
      canFilter ? button('net-prepare', t('stats.prepareFilter'), 'filterPrepare', 'small', '', net.selectedRow?.filter ? '' : 'disabled') : '',
      canFilter ? button('net-apply', t('stats.applyFilter'), 'filterApply', 'small', '', net.selectedRow?.filter ? '' : 'disabled') : '',
    ].join('');
    const top = filterBar.replace('<span class="grow"></span>', '') ? `<div class="net-filterbar">${filterBar}</div>` : '';
    const canDocument = r && !r.error && r.view !== 'objects';
    const foot = [
      canDocument ? button('net-print', t('action.print'), 'print', 'small') : '',
      canDocument ? exportControls('net-export') : '',
      '<span class="grow"></span>',
      r?.view === 'objects' ? button('net-save-all', t('stats.saveAll'), 'save', 'small', '', r.rows?.length ? '' : 'disabled') : '',
      r && !r.error ? button('net-copy', t('stats.copy'), 'copy', 'small') : '',
      r && !r.error ? button('net-save', t('stats.saveAs'), 'save', 'small') : '',
      button('net-refresh', t('stats.refresh'), 'refresh', 'small'),
      button('close', t('common.close'), 'close'),
    ].join('');
    root.innerHTML = frame({ glyph, title: `${titleText}${p.doc ? ` — ${p.doc}` : ''}`, tabs, body: `<div class="net-stats">${top}${body}</div>`, foot });
    ready();
  }

  function statBody(r) {
    if (r.view === 'props') {
      return `<div class="net-props">${r.sections.map((sec) => `<section><h3 class="section-title">${icon(sec.icon ?? 'captureProperties')}${escapeHtml(sec.title)}</h3><dl>${sec.rows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join('')}</dl></section>`).join('')}</div>`;
    }
    if (r.view === 'text') {
      const options = r.options ? `<div class="row net-text-opts">${segmented('net-product', r.options.map((o) => [o.id, o.label, 'protoLock']), r.option, 'data-net-seg')}</div>` : '';
      return `${options}<pre class="net-text">${escapeHtml(r.text)}</pre>`;
    }
    if (r.view === 'packet') return `<div class="net-packet">${r.lines.map((line) => `<div class="dt-row" style="--depth:${line.depth}"><span class="dt-label">${escapeHtml(line.text)}</span></div>`).join('')}<pre class="net-text">${escapeHtml(r.hex)}</pre></div>`;
    return tableHtml(r);
  }

  /**
   * The export format (remembered while the window is open) and the button that exports with it. A window
   * with pictures (graphs) adds, for Markdown, whether the pictures go inside the file or beside it, linked.
   */
  const exportControls = (actionName, { images = false } = {}) => `<span class="net-export">${images && (net.exportFormat ?? 'html') === 'markdown' ? `<select data-net="imageMode" data-icon="imageFormat" aria-label="${escapeHtml(t('docExport.images'))}" title="${escapeHtml(t('docExport.images'))}"><option value="embed" data-icon="imageFormat" ${(net.imageMode ?? 'embed') === 'embed' ? 'selected' : ''}>${escapeHtml(t('docExport.imagesEmbed'))}</option><option value="link" data-icon="link" ${net.imageMode === 'link' ? 'selected' : ''}>${escapeHtml(t('docExport.imagesLink'))}</option></select>` : ''}<select data-net="exportFormat" data-icon="exportFile" aria-label="${escapeHtml(t('docExport.format'))}" title="${escapeHtml(t('docExport.format'))}">${DOC_FORMAT_LIST.map(([id, glyph]) => `<option value="${id}" data-icon="${glyph}" ${(net.exportFormat ?? 'html') === id ? 'selected' : ''}>${escapeHtml(t(`docExport.${id}`))}</option>`).join('')}</select>${button(actionName, t('docExport.export'), 'exportFile', 'small')}</span>`;

  /** What the window shows, as a document for printing and exporting (docexport.js): the rows as they are on screen. */
  function statDocument() {
    const p = P();
    const r = net.data;
    const [, titleKey] = STAT_META[p.statKind] ?? ['', 'menu.statistics'];
    const title = p.statKind === 'ipStats' && p.version === 6 ? t('action.ipv6Stats') : t(titleKey);
    const subtitle = [p.doc, net.query.trim() ? `${t('stats.search')}: ${net.query.trim()}` : ''].filter(Boolean).join(' · ');
    if (r.view === 'props') {
      return { title, subtitle, columns: [{ label: t('docExport.item') }, { label: t('docExport.value') }], rows: r.sections.flatMap((sec) => [{ depth: 0, cells: [sec.title, ''] }, ...sec.rows.map(([k, v]) => ({ depth: 1, cells: [k, v] }))]) };
    }
    if (r.view === 'text') return { title, subtitle, columns: [{ label: title }], rows: String(r.text).split('\n').map((line) => ({ cells: [line] })) };
    if (r.view === 'packet') return { title, subtitle, columns: [{ label: title }], rows: [...r.lines.map((l) => ({ depth: l.depth, cells: [l.text] })), { cells: [''] }, ...String(r.hex).split('\n').map((line) => ({ cells: [line] }))] };
    const tree = r.view === 'tree';
    return {
      title,
      subtitle,
      note: r.note,
      columns: r.columns.map((c) => ({ label: c.label, num: Boolean(c.num) })),
      rows: visibleRows(r).map((row) => ({ depth: tree ? row.depth : 0, cells: r.columns.map((c) => String(fmtNumber(row.cells[c.id], c.fmt) ?? '')) })),
    };
  }

  /** The rows as shown: searched, sorted and (for a tree) with collapsed rows' children hidden. */
  function visibleRows(r) {
    const query = net.query.trim().toLowerCase();
    let rows = r.rows;
    const tree = r.view === 'tree';
    const matches = (row) => Object.values(row.cells).some((v) => String(v ?? '').toLowerCase().includes(query));
    const compare = net.sort ? (a, b) => {
      const x = a.cells[net.sort.id];
      const y = b.cells[net.sort.id];
      const cmp = typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), undefined, { numeric: true });
      return net.sort.desc ? -cmp : cmp;
    } : null;
    if (tree) {
      // Rows come depth-first; rebuild the tree so a heading click sorts each row's children in
      // place, a search keeps the ancestors of what it finds (opened), and collapsed rows hide theirs.
      const roots = [];
      const stack = [];
      for (const row of rows) {
        const node = { row, kids: [] };
        while (stack.length && stack[stack.length - 1].row.depth >= row.depth) stack.pop();
        (stack.length ? stack[stack.length - 1].kids : roots).push(node);
        stack.push(node);
      }
      const hit = new Map();
      const found = (node) => {
        if (!hit.has(node)) hit.set(node, matches(node.row) || node.kids.some(found));
        return hit.get(node);
      };
      const out = [];
      const walk = (list) => {
        for (const node of compare ? [...list].sort((a, b) => compare(a.row, b.row)) : list) {
          if (query && !found(node)) continue;
          out.push(node.row);
          if (query || !net.collapsed.has(node.row.id)) walk(node.kids);
        }
      };
      walk(roots);
      rows = out;
    } else {
      if (query) rows = rows.filter(matches);
      if (compare) rows = [...rows].sort(compare);
    }
    return rows;
  }

  /** A sortable table (or a tree when rows have depth) with a filter box; a click selects a row. */
  function tableHtml(r) {
    const columns = r.columns;
    const tree = r.view === 'tree';
    const rows = visibleRows(r);
    const limit = 3000;
    const shown = rows.slice(0, limit);
    const hasChildren = new Set();
    if (tree) r.rows.forEach((row, i) => { if (r.rows[i + 1]?.depth > row.depth) hasChildren.add(row.id); });
    const head = `<tr>${columns.map((col) => `<th class="${col.num ? 'num' : ''} ${net.sort?.id === col.id ? (net.sort.desc ? 'desc' : 'asc') : ''}" data-action="net-sort" data-value="${escapeHtml(col.id)}" title="${escapeHtml(col.tip ?? col.label)}">${escapeHtml(col.label)}${net.sort?.id === col.id ? icon(net.sort.desc ? 'chevronDown' : 'chevronUp', 'icon tiny') : ''}</th>`).join('')}${r.view === 'objects' ? '<th></th>' : ''}</tr>`;
    const body = shown.map((row) => `<tr class="${net.selectedRow?.id === row.id ? 'selected' : ''} ${row.severity ? `sev-${row.severity}` : ''}" data-action="net-row" data-value="${escapeHtml(row.id)}" ${row.filter ? `title="${escapeHtml(row.filter)}"` : ''}>${columns.map((col, ci) => {
      const value = row.cells[col.id];
      const bar = col.bar && typeof value === 'number' ? `<i class="net-bar" style="width:${Math.min(100, Math.max(0, value))}%"></i>` : '';
      const toggleHtml = tree && ci === 0 ? `<span class="net-tree-toggle" data-action="net-toggle" data-value="${escapeHtml(row.id)}">${hasChildren.has(row.id) ? icon(net.collapsed.has(row.id) ? 'caretRight' : 'caretDown', 'icon tiny') : ''}</span>` : '';
      return `<td class="${col.num ? 'num' : ''} ${col.bar ? 'barcell' : ''}" ${tree && ci === 0 ? `style="padding-left:${8 + row.depth * 16}px"` : ''}>${toggleHtml}${bar}<span>${escapeHtml(fmtNumber(value, col.fmt))}</span></td>`;
    }).join('')}${r.view === 'objects' ? `<td>${button('net-save-object', t('stats.save'), 'save', 'small', row.id)}</td>` : ''}</tr>`).join('');
    const more = rows.length > limit ? `<div class="muted net-more">${escapeHtml(t('stats.more', { count: rows.length - limit }))}</div>` : '';
    const empty = rows.length ? '' : `<div class="net-loading">${icon('info')}<span>${escapeHtml(r.empty ?? t('stats.empty'))}</span></div>`;
    const summary = r.note ? `<div class="muted net-note">${escapeHtml(r.note)}</div>` : '';
    return `${summary}<div class="net-table-wrap"><table class="net-table ${tree ? 'tree' : ''}"><thead>${head}</thead><tbody>${body}</tbody></table>${empty}${more}</div>`;
  }

  const tableCsv = (r) => {
    const quote = (v) => { const text = String(v ?? ''); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; };
    if (r.view === 'props') return r.sections.flatMap((sec) => [sec.title, ...sec.rows.map(([k, v]) => `${quote(k)},${quote(v)}`), '']).join('\n');
    if (r.view === 'text') return r.text;
    if (r.view === 'packet') return `${r.lines.map((l) => `${'  '.repeat(l.depth)}${l.text}`).join('\n')}\n\n${r.hex}`;
    return [r.columns.map((col) => quote(col.label)).join(','), ...r.rows.map((row) => r.columns.map((col) => quote(row.view === 'tree' ? row.cells[col.id] : row.cells[col.id])).join(','))].join('\n');
  };

  // ───────────────────────── charts (I/O graph, TCP stream graph)

  function renderChart() {
    const p = P();
    const io = p.statKind === 'iograph';
    if (!net.draft) {
      net.draft = io
        ? { displayedOnly: false, interval: 1, unit: 'packets', series: [{ name: t('chart.allPackets'), filter: '', color: PALETTE[0], style: 'line', calc: 'packets', field: '', on: true }, { name: t('chart.tcpErrors'), filter: 'tcp.analysis.flags', color: PALETTE[1], style: 'bar', calc: 'packets', field: '', on: true }] }
        : { displayedOnly: false, graph: 'stevens', stream: p.stream ?? 0, reverse: false };
      requestChart();
    }
    const d = net.draft;
    const r = net.data;
    const controls = io ? ioControls(d) : tcpControls(d);
    const chart = r?.error ? errorHtml(r.error) : r && !net.loading ? chartSvg(r) : loadingHtml();
    root.innerHTML = frame({
      glyph: io ? 'ioGraph' : 'tcpGraph', title: `${t(io ? 'action.ioGraph' : 'action.tcpGraph')}${p.doc ? ` — ${p.doc}` : ''}`,
      body: `<div class="net-chart-layout"><div class="net-chart">${chart}</div><div class="net-chart-controls">${controls}</div></div>`,
      foot: `<label class="check-inline"><input type="checkbox" data-net="displayedOnly" ${d.displayedOnly ? 'checked' : ''} /><span>${escapeHtml(t('stats.displayedOnly'))}</span></label><span class="grow"></span>${button('net-save-svg', t('image.save'), 'exportImage', 'small')}${exportControls('graph-export', { images: true })}${button('net-copy', t('stats.copy'), 'copy', 'small')}${button('net-refresh', t('stats.refresh'), 'refresh', 'small')}${button('close', t('common.close'), 'close')}`,
    });
    ready();
  }

  function requestChart() {
    const p = P();
    const d = net.draft;
    if (p.statKind === 'iograph') request('iograph', { interval: Number(d.interval), series: d.series.filter((x) => x.on) });
    else request('tcpgraph', { graph: d.graph, stream: Number(d.stream), reverse: d.reverse });
  }

  function ioControls(d) {
    const intervals = [[0.001, '1 ms'], [0.01, '10 ms'], [0.1, '100 ms'], [1, '1 s'], [10, '10 s'], [60, '1 min'], [600, '10 min']];
    const calcs = ['packets', 'bytes', 'bits', 'sum', 'min', 'max', 'avg', 'load'];
    return `${row('clock', t('chart.interval'), select('data-net-sel', 'interval', intervals, d.interval, t('chart.interval')))}
      <h3 class="section-title">${icon('ioGraph')}${escapeHtml(t('chart.series'))}<span class="grow"></span>${button('net-series-add', t('chart.addSeries'), 'plus', 'small')}</h3>
      <div class="net-series">${d.series.map((x, i) => `<div class="net-series-row" data-index="${i}">
        <input type="checkbox" data-series="on" data-index="${i}" ${x.on ? 'checked' : ''} title="${escapeHtml(t('chart.show'))}" />
        <input type="color" data-series="color" data-index="${i}" value="${escapeHtml(x.color)}" title="${escapeHtml(t('chart.color'))}" />
        <input type="text" data-series="name" data-index="${i}" value="${escapeHtml(x.name)}" class="net-series-name" title="${escapeHtml(t('chart.name'))}" />
        <input type="text" data-series="filter" data-index="${i}" value="${escapeHtml(x.filter)}" placeholder="${escapeHtml(t('chart.filterPlaceholder'))}" class="net-series-filter" spellcheck="false" title="${escapeHtml(t('chart.filter'))}" />
        <select data-series="style" data-index="${i}" title="${escapeHtml(t('chart.style'))}">${['line', 'bar', 'dot'].map((v) => `<option value="${v}" ${x.style === v ? 'selected' : ''}>${escapeHtml(t(`chart.style.${v}`))}</option>`).join('')}</select>
        <select data-series="calc" data-index="${i}" title="${escapeHtml(t('chart.calc'))}">${calcs.map((v) => `<option value="${v}" ${x.calc === v ? 'selected' : ''}>${escapeHtml(t(`chart.calc.${v}`))}</option>`).join('')}</select>
        ${['sum', 'min', 'max', 'avg', 'load'].includes(x.calc) ? `<input type="text" data-series="field" data-index="${i}" value="${escapeHtml(x.field)}" placeholder="${escapeHtml(t('chart.field'))}" class="net-series-field" spellcheck="false" />` : ''}
        <button class="icon-button" data-action="net-series-remove" data-value="${i}" title="${escapeHtml(t('chart.removeSeries'))}">${icon('trash')}</button>
      </div>`).join('')}</div>
      <div class="row">${button('net-refresh', t('chart.apply'), 'check', 'small primary')}</div>`;
  }

  function tcpControls(d) {
    const graphs = [['stevens', t('chart.tcp.stevens')], ['throughput', t('chart.tcp.throughput')], ['rtt', t('chart.tcp.rtt')], ['window', t('chart.tcp.window')]];
    return `${row('tcpGraph', t('chart.graphType'), select('data-net-sel', 'graph', graphs, d.graph, t('chart.graphType')))}
      ${row('conversations', t('chart.stream'), numberField('net:stream', d.stream, 0, 1e6, 1, '', t('chart.stream')))}
      ${row('goForward', t('chart.direction'), `<label class="check-inline"><input type="checkbox" data-net="reverse" ${d.reverse ? 'checked' : ''} /><span>${escapeHtml(t('chart.reverse'))}</span></label>`)}
      <div class="row">${button('net-refresh', t('chart.apply'), 'check', 'small primary')}</div>
      ${net.data?.note ? `<p class="muted">${escapeHtml(net.data.note)}</p>` : ''}`;
  }

  /** Line / bar / dot chart of series of [x, y] points, with axes and a legend. */
  function chartSvg(r) {
    const W = 860;
    const H = 520;
    const M = { l: 70, r: 20, t: 20, b: 50 };
    const all = r.series.flatMap((x) => x.points);
    if (!all.length) return `<div class="net-loading">${icon('info')}<span>${escapeHtml(t('stats.empty'))}</span></div>`;
    const xs = all.map((p) => p[0]);
    const ys = all.map((p) => p[1]);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs, x0 + 1e-9);
    const y1 = Math.max(...ys, 0) * 1.08 || 1;
    const y0 = Math.min(0, ...ys);
    const sx = (x) => M.l + ((x - x0) / (x1 - x0)) * (W - M.l - M.r);
    const sy = (y) => H - M.b - ((y - y0) / (y1 - y0)) * (H - M.t - M.b);
    const ticks = (a, b, n) => { const step = niceStep((b - a) / n); const out = []; for (let v = Math.ceil(a / step) * step; v <= b + 1e-12; v += step) out.push(Number(v.toPrecision(10))); return out; };
    const grid = ticks(y0, y1, 6).map((v) => `<line class="grid" x1="${M.l}" x2="${W - M.r}" y1="${sy(v)}" y2="${sy(v)}"/><text class="ylab" x="${M.l - 8}" y="${sy(v) + 4}">${escapeHtml(fmtAxis(v))}</text>`).join('')
      + ticks(x0, x1, 8).map((v) => `<line class="grid" y1="${M.t}" y2="${H - M.b}" x1="${sx(v)}" x2="${sx(v)}"/><text class="xlab" x="${sx(v)}" y="${H - M.b + 18}">${escapeHtml(fmtAxis(v))}</text>`).join('');
    const barWidth = Math.max(1, Math.min(18, ((W - M.l - M.r) / Math.max(1, Math.max(...r.series.map((x) => x.points.length)))) * 0.8));
    const series = r.series.map((x) => {
      if (x.style === 'bar') return x.points.map(([px, py]) => `<rect x="${sx(px) - barWidth / 2}" y="${Math.min(sy(py), sy(0))}" width="${barWidth}" height="${Math.abs(sy(0) - sy(py))}" fill="${x.color}" opacity="0.75"/>`).join('');
      if (x.style === 'dot') return x.points.map(([px, py]) => `<circle cx="${sx(px)}" cy="${sy(py)}" r="2.2" fill="${x.color}"/>`).join('');
      return `<polyline fill="none" stroke="${x.color}" stroke-width="1.8" points="${x.points.map(([px, py]) => `${sx(px).toFixed(1)},${sy(py).toFixed(1)}`).join(' ')}"/>`;
    }).join('');
    const legend = r.series.map((x, i) => `<g transform="translate(${M.l + 10 + i * 170} ${M.t + 4})"><rect width="12" height="12" fill="${x.color}" rx="2"/><text x="18" y="11" class="legend">${escapeHtml(x.name.slice(0, 22))}</text></g>`).join('');
    return `<svg class="net-chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img">
      ${grid}<line class="axis" x1="${M.l}" x2="${W - M.r}" y1="${sy(Math.max(0, y0))}" y2="${sy(Math.max(0, y0))}"/><line class="axis" x1="${M.l}" x2="${M.l}" y1="${M.t}" y2="${H - M.b}"/>
      ${series}${legend}
      <text class="axis-title" x="${(W + M.l) / 2}" y="${H - 10}">${escapeHtml(r.xLabel ?? '')}</text>
      <text class="axis-title" transform="translate(16 ${(H - M.b) / 2}) rotate(-90)">${escapeHtml(r.yLabel ?? '')}</text></svg>`;
  }
  const niceStep = (raw) => { const p = 10 ** Math.floor(Math.log10(raw || 1)); const n = raw / p; return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * p; };
  const fmtAxis = (v) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : Math.abs(v) >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : Number.isInteger(v) ? String(v) : v.toFixed(Math.abs(v) < 0.01 ? 4 : 2));

  // ───────────────────────── follow stream

  function renderFollow() {
    const p = P();
    if (!net.draft) {
      net.draft = { mode: 'ascii', direction: 'both', index: p.index ?? 0, kind: p.kind ?? 'tcp', find: '' };
      requestFollow();
    }
    const d = net.draft;
    const r = net.data;
    let body = loadingHtml();
    if (r?.error) body = errorHtml(r.error);
    else if (r && !net.loading) {
      const segs = r.segments.filter((seg) => d.direction === 'both' || (d.direction === 'client' ? seg.dir === 0 : seg.dir === 1));
      const find = d.find.trim().toLowerCase();
      body = `<div class="follow-head"><span class="follow-client">${icon('netHost')}${escapeHtml(r.client ?? '')}</span><span class="muted">→</span><span class="follow-server">${icon('netServer')}${escapeHtml(r.server ?? '')}</span><span class="grow"></span><span class="muted">${escapeHtml(t('follow.stats', { client: fmtBytes(r.clientBytes ?? 0), server: fmtBytes(r.serverBytes ?? 0), packets: r.packets ?? segs.length }))}</span></div>
        ${!segs.length ? `<div class="net-banner">${icon('info')}<span>${escapeHtml(r.note ? `${t('follow.empty')} ${r.note}` : t('follow.empty'))}</span></div>` : ''}
        <pre class="follow-text" tabindex="0">${segs.map((seg) => `<span class="seg dir-${seg.dir} ${find && seg.text.toLowerCase().includes(find) ? 'found' : ''}" data-action="follow-frame" data-value="${seg.frame}" title="${escapeHtml(t('follow.frameTip', { no: seg.frame }))}">${escapeHtml(seg.text)}</span>`).join('')}</pre>`;
    }
    const modes = ['ascii', 'ebcdic', 'hexdump', 'carrays', 'raw', 'yaml', 'utf8'];
    const directions = [['both', t('follow.both')], ['client', r?.client ? `${r.client} → ${r.server}` : t('follow.client')], ['server', r?.server ? `${r.server} → ${r.client}` : t('follow.server')]];
    const kindLabel = { tcp: 'TCP', udp: 'UDP', tls: 'TLS', http: 'HTTP', http2: 'HTTP/2', quic: 'QUIC' }[d.kind] ?? d.kind.toUpperCase();
    root.innerHTML = frame({
      glyph: 'followStream', title: `${t('follow.title', { kind: kindLabel, index: d.index })}${p.doc ? ` — ${p.doc}` : ''}`,
      body: `<div class="follow">${body}<div class="follow-controls">
        ${select('data-net-sel', 'direction', directions, d.direction, t('follow.direction'))}
        ${select('data-net-sel', 'mode', modes.map((m) => [m, t(`follow.mode.${m}`)]), d.mode, t('follow.mode'))}
        <span class="net-search">${icon('search')}<input type="text" data-net="find" value="${escapeHtml(d.find)}" placeholder="${escapeHtml(t('follow.find'))}" /></span>
        <span class="grow"></span>
        <span class="row-label">${escapeHtml(t('follow.stream'))}</span>${numberField('net:index', d.index, 0, Math.max(0, (r?.streams ?? 1) - 1), 1, '', t('follow.stream'))}
      </div></div>`,
      foot: `${button('follow-filter-out', t('follow.filterOut'), 'filterClear', 'small')}${button('follow-show', t('follow.showStream'), 'filterApply', 'small')}<span class="grow"></span>${button('net-copy', t('stats.copy'), 'copy', 'small')}${button('net-save', t('stats.saveAs'), 'save', 'small')}${button('close', t('common.close'), 'close')}`,
    });
    ready();
  }

  function requestFollow() {
    const d = net.draft;
    request('follow', { kind: d.kind, index: Number(d.index), mode: d.mode });
  }

  // ───────────────────────── flow graph

  function renderFlow() {
    const p = P();
    if (!net.draft) { net.draft = { displayedOnly: Boolean(p.filter), flowType: 'all', addresses: 'any', filter: p.filter ?? '' }; request('flow', { flowType: 'all', addresses: 'any', filter: p.filter ?? '' }); }
    const d = net.draft;
    const r = net.data;
    let body = loadingHtml();
    if (r?.error) body = errorHtml(r.error);
    else if (r && !net.loading) body = flowSvg(r);
    root.innerHTML = frame({
      glyph: 'flowGraph', title: `${t('action.flowGraph')}${p.doc ? ` — ${p.doc}` : ''}`,
      body: `<div class="net-flow">${body}</div>`,
      foot: `<label class="check-inline"><input type="checkbox" data-net="displayedOnly" ${d.displayedOnly ? 'checked' : ''} /><span>${escapeHtml(t('stats.displayedOnly'))}</span></label>
        ${select('data-net-sel', 'flowType', [['all', t('flow.all')], ['tcp', t('flow.tcp')]], d.flowType, t('flow.type'))}
        ${select('data-net-sel', 'addresses', [['any', t('flow.anyAddress')], ['network', t('flow.networkAddress')]], d.addresses, t('flow.addresses'))}
        <span class="grow"></span>${button('net-save-svg', t('image.save'), 'exportImage', 'small')}${exportControls('graph-export', { images: true })}${button('net-copy', t('stats.copy'), 'copy', 'small')}${button('net-refresh', t('stats.refresh'), 'refresh', 'small')}${button('close', t('common.close'), 'close')}`,
    });
    ready();
  }

  /** Sequence diagram: one column per address, one row per packet (arrow and label). */
  function flowSvg(r) {
    const nodes = r.nodes;
    if (!r.rows.length) return `<div class="net-loading">${icon('info')}<span>${escapeHtml(t('stats.empty'))}</span></div>`;
    const colW = 170;
    const rowH = 26;
    const left = 120;
    const top = 50;
    const rows = r.rows.slice(0, 2000);
    const width = left + nodes.length * colW + 260;
    const height = top + rows.length * rowH + 20;
    const x = (i) => left + i * colW + colW / 2;
    const heads = nodes.map((n, i) => `<text class="flow-node" x="${x(i)}" y="22">${escapeHtml(n)}</text><line class="flow-life" x1="${x(i)}" x2="${x(i)}" y1="${top - 14}" y2="${height}"/>`).join('');
    const lines = rows.map((row, j) => {
      const y = top + j * rowH;
      const a = x(row.from);
      const b = x(row.to);
      const dir = b >= a ? 1 : -1;
      const color = PALETTE[(row.color ?? 0) % PALETTE.length];
      return `<g class="flow-row" data-action="follow-frame" data-value="${row.frame}">
        <rect class="flow-hit" x="0" y="${y - rowH / 2}" width="${width}" height="${rowH}"/>
        <text class="flow-time" x="8" y="${y + 4}">${escapeHtml(row.time)}</text>
        <line x1="${a}" x2="${b - dir * 6}" y1="${y}" y2="${y}" stroke="${color}" stroke-width="1.6"/>
        <path d="M${b} ${y} l${-dir * 8} -4 v8 z" fill="${color}"/>
        <text class="flow-label" x="${(a + b) / 2}" y="${y - 5}">${escapeHtml(row.label.length > 40 ? `${row.label.slice(0, 39)}…` : row.label)}</text>
        <text class="flow-comment" x="${left + nodes.length * colW + 10}" y="${y + 4}">${escapeHtml(row.comment ?? '')}</text></g>`;
    }).join('');
    return `<svg class="flow-svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${heads}${lines}</svg>${r.rows.length > rows.length ? `<div class="muted net-more">${escapeHtml(t('stats.more', { count: r.rows.length - rows.length }))}</div>` : ''}`;
  }

  // ───────────────────────── capture options

  function renderCapopts() {
    const p = P();
    if (!net.draft) net.draft = { tab: 'input', interfaces: p.interfaces ?? [], backend: p.backend, filterCheck: null };
    const d = net.draft;
    const st = s();
    const tabs = tabsHtml([['input', 'interfaces', t('capopts.input')], ['output', 'save', t('capopts.output')], ['options', 'gear', t('capopts.options')]], d.tab, 'net-tab');
    let body = '';
    if (d.tab === 'input') {
      const list = d.interfaces.map((iface) => `<tr class="${st.captureInterface === iface.id ? 'selected' : ''}" data-action="cap-iface" data-value="${escapeHtml(iface.id)}">
        <td><input type="radio" name="iface" ${st.captureInterface === iface.id ? 'checked' : ''} tabindex="-1" /></td>
        <td>${icon({ demo: 'ifDemo', wifi: 'ifWifi', loopback: 'ifLoopback', bluetooth: 'ifBluetooth', virtual: 'ifVirtual' }[iface.kind] ?? 'ifEthernet')}<b>${escapeHtml(iface.friendly)}</b></td>
        <td class="muted">${escapeHtml((iface.addresses ?? []).join(', '))}</td>
        <td class="muted">${escapeHtml(iface.kind === 'demo' ? t('capture.demoKind') : iface.up === false ? t('capopts.down') : t('capopts.up'))}</td></tr>`).join('');
      const fc = d.filterCheck;
      const savedOptions = (p.saved ?? []).map((f) => [f.filter, `${f.name} — ${f.filter}`]);
      body = `${d.backend && d.backend.available === false ? `<div class="net-banner">${icon('warning')}<span>${escapeHtml(d.backend.error === 'web' ? t('start.webCapture') : t('start.noBackend', { error: d.backend.error ?? '' }))}</span></div>` : ''}
        <div class="net-table-wrap short"><table class="net-table"><thead><tr><th></th><th>${escapeHtml(t('capopts.interface'))}</th><th>${escapeHtml(t('capopts.addresses'))}</th><th>${escapeHtml(t('capopts.state'))}</th></tr></thead><tbody>${list}</tbody></table></div>
        ${row('captureFilterIcon', t('capopts.filter'), `<span class="cap-filter ${fc ? (fc.ok ? 'valid' : 'invalid') : ''}"><input type="text" data-net="captureFilter" value="${escapeHtml(st.captureFilter)}" spellcheck="false" placeholder="${escapeHtml(t('start.captureFilterPlaceholder'))}" />${savedOptions.length ? `<select data-net-sel="savedCaptureFilter" title="${escapeHtml(t('capopts.saved'))}"><option value="">${escapeHtml(t('capopts.saved'))}</option>${savedOptions.map(([v, l]) => `<option value="${escapeHtml(v)}">${escapeHtml(l)}</option>`).join('')}</select>` : ''}</span>`)}
        ${row('filterApply', t('capopts.presets'), presetButtons(CAPTURE_PRESETS, st.captureFilter, { t, icon, escapeHtml, attr: 'data-action="cap-preset" data-value', label: t('capopts.presets'), i18n: 'capturePreset' }))}
        ${fc && !fc.ok ? `<div class="net-banner error">${icon('error')}<span>${escapeHtml(fc.error ?? '')}</span></div>` : ''}
        ${toggle('capturePromisc', t('capopts.promisc'), 'interfaces')}
        ${toggle('captureMonitor', t('capopts.monitor'), 'ifWifi')}
        ${row('ruler', t('capopts.snaplen'), numberField('captureSnaplen', st.captureSnaplen, 64, 262144, 1024, 'B', t('capopts.snaplen')))}
        ${row('database', t('capopts.buffer'), numberField('captureBufferMb', st.captureBufferMb, 1, 1024, 1, 'MB', t('capopts.buffer')))}`;
    } else if (d.tab === 'output') {
      body = `<p class="muted">${escapeHtml(t('capopts.outputHint'))}</p>
        ${row('packets', t('capopts.stopPackets'), numberField('captureStopPackets', st.captureStopPackets, 0, 1e9, 100, '', t('capopts.stopPackets')))}
        ${row('clock', t('capopts.stopSeconds'), numberField('captureStopSeconds', st.captureStopSeconds, 0, 1e7, 10, 's', t('capopts.stopSeconds')))}
        ${row('database', t('capopts.stopMegabytes'), numberField('captureStopMegabytes', st.captureStopMegabytes, 0, 1e6, 1, 'MB', t('capopts.stopMegabytes')))}
        ${row('ifDemo', t('capopts.demoRate'), numberField('demoRate', st.demoRate, 1, 2000, 10, '/s', t('capopts.demoRate')))}`;
    } else {
      body = `${toggle('autoScroll', t('action.autoScroll'), 'autoScroll')}
        ${toggle('resolveMac', t('action.resolveMac'), 'resolvedAddresses')}
        ${toggle('resolveTransport', t('action.resolveTransport'), 'resolvedAddresses')}
        ${toggle('resolveNetwork', t('action.resolveNetwork'), 'resolvedAddresses')}
        ${toggle('showNetMap', t('action.netMap'), 'paneMap')}`;
    }
    root.innerHTML = frame({
      glyph: 'captureOptions', title: t('action.captureOptions'), tabs, body: `<div class="settings-page">${body}</div>`,
      foot: `${button('cap-refresh', t('action.refreshInterfaces'), 'refreshInterfaces', 'small')}${button('cap-check', t('capopts.check'), 'check', 'small')}<span class="grow"></span>${button('close', t('common.close'), 'close')}${button('cap-start', t('action.captureStart'), 'captureStart', 'primary')}`,
    });
    ready();
  }

  // ───────────────────────── colouring rules

  function renderColoring() {
    if (!net.colorRules) { action('coloring-request'); root.innerHTML = frame({ glyph: 'coloringRules', title: t('action.coloringRules'), body: loadingHtml() }); ready(); return; }
    const rules = net.colorRules;
    const sel = net.selectedRow?.index ?? -1;
    const rowsHtml = rules.map((rule, i) => `<tr class="${sel === i ? 'selected' : ''} ${rule.invalid ? 'invalid' : ''}" data-action="color-row" data-value="${i}">
      <td><input type="checkbox" data-color-field="enabled" data-index="${i}" ${rule.enabled !== false ? 'checked' : ''} /></td>
      <td><input type="text" class="color-name" data-color-field="name" data-index="${i}" value="${escapeHtml(rule.name)}" style="background:${rule.bg};color:${rule.fg}" /></td>
      <td><input type="text" class="color-filter" data-color-field="filter" data-index="${i}" value="${escapeHtml(rule.filter)}" spellcheck="false" /></td>
      <td><input type="color" data-color-field="fg" data-index="${i}" value="${escapeHtml(rule.fg)}" title="${escapeHtml(t('coloring.fg'))}" /></td>
      <td><input type="color" data-color-field="bg" data-index="${i}" value="${escapeHtml(rule.bg)}" title="${escapeHtml(t('coloring.bg'))}" /></td></tr>`).join('');
    root.innerHTML = frame({
      glyph: 'coloringRules', title: t('action.coloringRules'),
      body: `<p class="muted">${escapeHtml(t('coloring.hint'))}</p><div class="net-table-wrap"><table class="net-table coloring"><thead><tr><th></th><th>${escapeHtml(t('coloring.name'))}</th><th>${escapeHtml(t('coloring.filter'))}</th><th>${escapeHtml(t('coloring.fg'))}</th><th>${escapeHtml(t('coloring.bg'))}</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
        <div class="row">${button('color-add', t('coloring.add'), 'plus', 'small')}${button('color-copy', t('coloring.copy'), 'copy', 'small', '', sel >= 0 ? '' : 'disabled')}${button('color-up', t('coloring.up'), 'chevronUp', 'small', '', sel > 0 ? '' : 'disabled')}${button('color-down', t('coloring.down'), 'chevronDown', 'small', '', sel >= 0 && sel < rules.length - 1 ? '' : 'disabled')}${button('color-delete', t('coloring.delete'), 'trash', 'small danger', '', sel >= 0 ? '' : 'disabled')}<span class="grow"></span>${button('color-import', t('coloring.import'), 'importFile', 'small')}${button('color-export', t('coloring.export'), 'exportFile', 'small')}</div>
        ${net.importing ? `<div class="editor"><textarea data-net="importText" rows="5" placeholder="${escapeHtml(t('coloring.importPlaceholder'))}"></textarea><div class="row">${button('color-import-apply', t('coloring.importApply'), 'check', 'small primary')}</div></div>` : ''}`,
      foot: `${button('color-reset', t('coloring.reset'), 'refresh', 'small danger')}<span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('color-save', t('common.ok'), 'check', 'primary')}`,
    });
    ready();
  }

  /** Wireshark's colorfilters text: @name@filter@[r,g,b][r,g,b] with 16-bit channels. */
  const toColorfilters = (rules) => rules.map((r) => {
    const ch = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) * 257).join(',');
    return `${r.enabled === false ? '!' : ''}@${r.name}@${r.filter}@[${ch(r.bg)}][${ch(r.fg)}]`;
  }).join('\n');
  const fromColorfilters = (text) => String(text).split(/\r?\n/).map((line) => {
    const m = /^(!?)@([^@]*)@(.*)@\[(\d+),(\d+),(\d+)\]\[(\d+),(\d+),(\d+)\]\s*$/.exec(line.trim());
    if (!m) return null;
    const hex = (a, b, cc) => `#${[a, b, cc].map((v) => Math.round(Number(v) / 257).toString(16).padStart(2, '0')).join('')}`;
    return { name: m[2], filter: m[3], enabled: !m[1], bg: hex(m[4], m[5], m[6]), fg: hex(m[7], m[8], m[9]) };
  }).filter(Boolean);

  // ───────────────────────── display filter expression

  function renderFilterExpr() {
    const p = P();
    if (!net.draft) { net.draft = { protoQuery: '', protocol: null, field: null, relation: 'present', value: '', text: p.text ?? '', check: null }; action('fields-request', { protocol: null }); }
    const d = net.draft;
    const protocols = (net.protocols ?? []).filter((x) => !d.protoQuery || `${x.abbrev} ${x.name}`.toLowerCase().includes(d.protoQuery.toLowerCase()));
    const fields = net.fields ?? [];
    const field = fields.find((f) => f.abbrev === d.field);
    const relations = [['present', t('expr.present')], ['==', '=='], ['!=', '!='], ['>', '>'], ['<', '<'], ['>=', '>='], ['<=', '<='], ['contains', 'contains'], ['matches', 'matches'], ['in', 'in']];
    const expr = buildExpression(d, field);
    const [protoPage, protoPager] = paged('expr-protocols', protocols, 400);
    root.innerHTML = frame({
      glyph: 'filterExpression', title: t('action.filterExpression'),
      body: `<div class="expr-layout">
        <div class="expr-col"><h3 class="section-title">${icon('protocolHierarchy')}${escapeHtml(t('expr.protocols'))} <span class="muted">${protocols.length}</span>${protoPager}</h3>
          <span class="net-search">${icon('search')}<input type="text" data-net="protoQuery" value="${escapeHtml(d.protoQuery)}" placeholder="${escapeHtml(t('expr.search'))}" /></span>
          <div class="expr-list">${protoPage.map((x) => `<button class="expr-item ${d.protocol === x.abbrev ? 'active' : ''}" data-action="expr-proto" data-value="${escapeHtml(x.abbrev)}" title="${escapeHtml(x.name)}"><code>${escapeHtml(x.abbrev)}</code><span>${escapeHtml(x.name)}</span></button>`).join('')}</div></div>
        <div class="expr-col"><h3 class="section-title">${icon('tag')}${escapeHtml(t('expr.fields'))} <span class="muted">${fields.length}</span></h3>
          <div class="expr-list">${d.protocol ? fields.map((f) => `<button class="expr-item ${d.field === f.abbrev ? 'active' : ''}" data-action="expr-field" data-value="${escapeHtml(f.abbrev)}" title="${escapeHtml(`${f.name} (${f.type})`)}"><code>${escapeHtml(f.abbrev)}</code><span>${escapeHtml(f.name)}</span></button>`).join('') : `<p class="muted">${escapeHtml(t('expr.pickProtocol'))}</p>`}</div></div>
        <div class="expr-col narrow"><h3 class="section-title">${icon('filterExpression')}${escapeHtml(t('expr.relation'))}</h3>
          <div class="expr-list">${relations.map(([v, l]) => `<button class="expr-item ${d.relation === v ? 'active' : ''}" data-action="expr-rel" data-value="${escapeHtml(v)}">${escapeHtml(l)}</button>`).join('')}</div>
          <h3 class="section-title">${icon('edit')}${escapeHtml(t('expr.value'))}${field ? ` <span class="muted">(${escapeHtml(field.type)})</span>` : ''}</h3>
          <input type="text" data-net="exprValue" value="${escapeHtml(d.value)}" ${d.relation === 'present' ? 'disabled' : ''} spellcheck="false" />
          ${field?.strings?.length ? `<div class="expr-list short">${field.strings.slice(0, 300).map(([v, l]) => `<button class="expr-item" data-action="expr-value" data-value="${escapeHtml(v)}"><code>${escapeHtml(v)}</code><span>${escapeHtml(l)}</span></button>`).join('')}</div>` : ''}
        </div></div>
        <div class="expr-preview ${d.check?.status ?? ''}">${icon('filterApply')}<input type="text" data-net="exprText" value="${escapeHtml(expr || d.text)}" spellcheck="false" /><span class="muted">${escapeHtml(d.check?.error ?? '')}</span></div>`,
      foot: `<span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('expr-ok', t('expr.prepare'), 'filterPrepare')}${button('expr-apply', t('stats.applyFilter'), 'filterApply', 'primary')}`,
    });
    ready();
  }

  function buildExpression(d, field) {
    if (!d.field) return '';
    if (d.relation === 'present') return d.field;
    let value = d.value.trim();
    if (!value) return '';
    const textual = field && ['string', 'char'].includes(field.type);
    if ((textual || d.relation === 'contains' || d.relation === 'matches') && !/^".*"$/.test(value) && !/^([0-9a-f]{2}[:.-])+[0-9a-f]{2}$/i.test(value)) value = `"${value.replace(/"/g, '\\"')}"`;
    if (d.relation === 'in') return `${d.field} in {${value.replace(/^\{|\}$/g, '')}}`;
    return `${d.field} ${d.relation} ${value}`;
  }

  // ───────────────────────── saved filters

  function renderFilters() {
    const p = P();
    const which = p.which === 'capture' ? 'capture' : 'display';
    if (!net.draft) net.draft = { list: loadSavedFilters()[which].map((f) => ({ ...f })) };
    const d = net.draft;
    const sel = net.selectedRow?.index ?? -1;
    root.innerHTML = frame({
      glyph: which === 'capture' ? 'captureFilterIcon' : 'filterBookmark', title: t(which === 'capture' ? 'action.captureFilters' : 'action.displayFilters'),
      body: `<div class="net-table-wrap"><table class="net-table"><thead><tr><th>${escapeHtml(t('filter.name'))}</th><th>${escapeHtml(t('coloring.filter'))}</th>${which === 'display' ? `<th>${escapeHtml(t('filter.asButton'))}</th>` : ''}</tr></thead><tbody>
        ${d.list.map((f, i) => `<tr class="${sel === i ? 'selected' : ''}" data-action="filters-row" data-value="${i}"><td><input type="text" data-filters-field="name" data-index="${i}" value="${escapeHtml(f.name)}" /></td><td><input type="text" class="color-filter" data-filters-field="filter" data-index="${i}" value="${escapeHtml(f.filter)}" spellcheck="false" /></td>${which === 'display' ? `<td><input type="checkbox" data-filters-field="button" data-index="${i}" ${f.button ? 'checked' : ''} /></td>` : ''}</tr>`).join('')}
      </tbody></table></div>
      <div class="row">${button('filters-add', t('coloring.add'), 'plus', 'small')}${button('filters-delete', t('coloring.delete'), 'trash', 'small danger', '', sel >= 0 ? '' : 'disabled')}${which === 'display' ? button('filters-apply', t('stats.applyFilter'), 'filterApply', 'small', '', sel >= 0 ? '' : 'disabled') : ''}</div>`,
      foot: `<span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('filters-save', t('common.ok'), 'check', 'primary')}`,
    });
    ready();
  }

  // ───────────────────────── export / print options

  function renderExport() {
    const p = P();
    const fmt = p.format;
    if (!net.draft) net.draft = { range: p.displayed < p.count ? 'displayed' : 'all', custom: '', summary: true, details: 'expanded', bytes: false, fileType: 'pcapng', format: fmt === 'pcapng' ? 'pcapng' : fmt, header: true };
    const d = net.draft;
    const ranges = [['all', t('export.all', { count: p.count })], ['displayed', t('export.displayed', { count: p.displayed })], ['selected', t('export.selected', { no: p.selected > 0 ? p.selected : '-' })], ['marked', t('export.marked', { count: p.marked })], ['custom', t('export.custom')]];
    const packets = fmt === 'pcapng';
    const print = fmt === 'print';
    const text = ['text', 'print'].includes(d.format);
    root.innerHTML = frame({
      glyph: print ? 'print' : packets ? 'exportPackets' : 'exportDissections', title: t(print ? 'action.print' : packets ? 'action.exportSpecified' : 'export.title'),
      body: `<div class="settings-page">
        <h3 class="section-title">${icon('packets')}${escapeHtml(t('export.range'))}</h3>
        <div class="export-ranges">${ranges.map(([v, l]) => `<label class="check-inline"><input type="radio" name="range" data-net-radio="range" value="${v}" ${d.range === v ? 'checked' : ''} ${(v === 'selected' && p.selected < 1) || (v === 'marked' && !p.marked) ? 'disabled' : ''} /><span>${escapeHtml(l)}</span></label>`).join('')}
          <input type="text" data-net="custom" value="${escapeHtml(d.custom)}" placeholder="1-10,15,20-" ${d.range === 'custom' ? '' : 'disabled'} /></div>
        ${packets ? row('save', t('export.fileType'), segmented('fileType', [['pcapng', 'pcapng', 'save'], ['pcap', 'pcap', 'saveAs']], d.fileType, 'data-net-seg')) : ''}
        ${!packets && !print ? row('exportDissections', t('export.format'), select('data-net-sel', 'format', [['text', t('export.fmt.text')], ['csv', 'CSV'], ['json', 'JSON'], ['pdml', 'PDML (XML)'], ['psml', 'PSML (XML)'], ['c', t('export.fmt.c')]], d.format, t('export.format'))) : ''}
        ${text ? `<h3 class="section-title">${icon('paneDetails')}${escapeHtml(t('export.packetFormat'))}</h3>
          <label class="check-inline"><input type="checkbox" data-net="summary" ${d.summary ? 'checked' : ''} /><span>${escapeHtml(t('export.summaryLine'))}</span></label>
          <label class="check-inline"><input type="checkbox" data-net="header" ${d.header ? 'checked' : ''} /><span>${escapeHtml(t('export.columnHeader'))}</span></label>
          ${row('paneDetails', t('export.details'), segmented('details', [['none', t('export.details.none'), 'close'], ['collapsed', t('export.details.collapsed'), 'collapseAll'], ['displayed', t('export.details.displayed'), 'eye'], ['expanded', t('export.details.expanded'), 'expandAll']], d.details, 'data-net-seg'))}
          <label class="check-inline"><input type="checkbox" data-net="bytes" ${d.bytes ? 'checked' : ''} /><span>${escapeHtml(t('export.bytes'))}</span></label>` : ''}
      </div>`,
      foot: `<span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('export-ok', t(print ? 'action.print' : 'export.save'), print ? 'print' : 'save', 'primary')}`,
    });
    fitHeight();
    ready();
  }

  // ───────────────────────── decode as, enabled protocols

  const DECODE_TABLES = [['tcp.port', 'TCP port'], ['udp.port', 'UDP port'], ['sctp.port', 'SCTP port'], ['ethertype', 'Ethertype'], ['ip.proto', 'IP protocol']];

  function renderDecodeAs() {
    const p = P();
    if (!net.draft) { net.draft = { list: (s().decodeAs ?? []).map((x) => ({ ...x })) }; if (!net.protocols) action('fields-request', { protocol: null }); }
    const d = net.draft;
    const protos = (net.protocols ?? []).map((x) => [x.abbrev, `${x.short ?? x.abbrev} — ${x.name}`]);
    const sel = net.selectedRow?.index ?? -1;
    root.innerHTML = frame({
      glyph: 'decodeAs', title: t('action.decodeAs'),
      body: `<p class="muted">${escapeHtml(t('decodeAs.hint'))}</p><div class="net-table-wrap"><table class="net-table"><thead><tr><th>${escapeHtml(t('decodeAs.field'))}</th><th>${escapeHtml(t('decodeAs.value'))}</th><th>${escapeHtml(t('decodeAs.current'))}</th></tr></thead><tbody>
        ${d.list.map((x, i) => `<tr class="${sel === i ? 'selected' : ''}" data-action="decode-row" data-value="${i}"><td>${select('data-decode-field', `table:${i}`, DECODE_TABLES, x.table, t('decodeAs.field'))}</td><td><input type="text" data-decode-field="value:${i}" value="${escapeHtml(x.value)}" /></td><td>${select('data-decode-field', `proto:${i}`, [['none', t('decodeAs.none')], ...protos], x.proto, t('decodeAs.current'))}</td></tr>`).join('')}
      </tbody></table></div><div class="row">${button('decode-add', t('coloring.add'), 'plus', 'small')}${button('decode-delete', t('coloring.delete'), 'trash', 'small danger', '', sel >= 0 ? '' : 'disabled')}${p.current?.tcpPort != null || p.current?.udpPort != null ? `<span class="muted">${escapeHtml(t('decodeAs.fromPacket', { tcp: p.current.tcpPort ?? '-', udp: p.current.udpPort ?? '-' }))}</span>` : ''}</div>`,
      foot: `<span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('decode-save', t('common.ok'), 'check', 'primary')}`,
    });
    ready();
  }

  function protocolsBody() {
    if (!net.protocols) { action('fields-request', { protocol: null }); return loadingHtml(); }
    const disabled = new Set(s().disabledProtocols);
    const q = (net.protoQuery ?? '').toLowerCase();
    const list = net.protocols.filter((x) => !q || `${x.abbrev} ${x.name}`.toLowerCase().includes(q));
    const [page, pager] = paged('protocols', list, 60);
    return `<div class="row"><span class="net-search">${icon('search')}<input type="text" data-net="protoQuery" value="${escapeHtml(net.protoQuery ?? '')}" placeholder="${escapeHtml(t('expr.search'))}" /></span>${pager}<span class="grow"></span>${button('protocols-all', t('protocols.enableAll'), 'check', 'small')}${button('protocols-none', t('protocols.disableAll'), 'close', 'small')}</div>
      <div class="protocol-grid">${page.map((x) => `<label class="check-inline" title="${escapeHtml(x.name)}"><input type="checkbox" data-proto-toggle="${escapeHtml(x.abbrev)}" ${disabled.has(x.abbrev) ? '' : 'checked'} /><code>${escapeHtml(x.abbrev)}</code><span class="muted">${escapeHtml(x.name)}</span></label>`).join('')}</div>
      <p class="muted">${escapeHtml(t('protocols.hint'))}</p>`;
  }

  function renderProtocols() {
    root.innerHTML = frame({ glyph: 'enabledProtocols', title: t('action.enabledProtocols'), body: `<div class="settings-page">${protocolsBody()}</div>`, foot: `<span class="grow"></span>${button('protocols-apply', t('common.done'), 'check', 'primary')}` });
    ready();
  }

  // ───────────────────────── go to, find, time shift, columns

  function renderGoto() {
    const p = P();
    if (!net.draft) net.draft = { value: String(p.current > 0 ? p.current : 1) };
    root.innerHTML = frame({ glyph: 'goPacket', title: t('action.goPacket'), body: `<div class="editor">${row('goPacket', t('goto.label', { max: p.max }), numberField('net:value', Number(net.draft.value) || 1, 1, Math.max(1, p.max ?? 1), 1, '', t('goto.label', { max: p.max })))}</div>`, foot: `<span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('goto-ok', t('goto.go'), 'goForward', 'primary')}` });
    fitHeight();
    const input = root.querySelector('.stepper-value');
    input?.focus(); input?.select();
    ready();
  }

  function renderFind() {
    const p = P();
    if (!net.draft) net.draft = { mode: p.mode ?? 'filter', text: p.text ?? '', where: p.where ?? 'details', matchCase: Boolean(p.matchCase) };
    const d = net.draft;
    root.innerHTML = frame({
      glyph: 'findPacket', title: t('action.findPacket'),
      body: `<div class="settings-page">
        ${row('findPacket', t('find.by'), segmented('mode', [['filter', t('find.mode.filter'), 'filterApply'], ['hex', t('find.mode.hex'), 'paneBytes'], ['string', t('find.mode.string'), 'textTool']], d.mode, 'data-net-seg'))}
        ${d.mode === 'string' ? row('paneDetails', t('find.where'), segmented('where', [['list', t('find.where.list'), 'paneList'], ['details', t('find.where.details'), 'paneDetails'], ['bytes', t('find.where.bytes'), 'paneBytes']], d.where, 'data-net-seg')) : ''}
        ${d.mode === 'string' ? `<label class="check-inline"><input type="checkbox" data-net="matchCase" ${d.matchCase ? 'checked' : ''} /><span>${escapeHtml(t('find.matchCase'))}</span></label>` : ''}
        ${row('search', t('find.text'), `<input type="text" data-draft="text" value="${escapeHtml(d.text)}" spellcheck="false" placeholder="${escapeHtml(t(`find.placeholder.${d.mode}`))}" />`)}
      </div>`,
      foot: `<span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('find-ok', t('find.find'), 'findPacket', 'primary')}`,
    });
    fitHeight();
    root.querySelector('[data-draft="text"]')?.focus();
    ready();
  }

  function renderTimeShift() {
    const p = P();
    if (!net.draft) net.draft = { value: '', selectedOnly: false };
    root.innerHTML = frame({
      glyph: 'timeShift', title: t('action.timeShift'),
      body: `<div class="settings-page">${row('timeShift', t('timeshift.by'), `<input type="text" data-draft="value" value="${escapeHtml(net.draft.value)}" placeholder="-1:30:00.5 / 2.25" />`)}
        <p class="muted">${escapeHtml(t('timeshift.hint'))}</p>
        <label class="check-inline"><input type="checkbox" data-net="selectedOnly" ${net.draft.selectedOnly ? 'checked' : ''} ${p.selected > 0 ? '' : 'disabled'} /><span>${escapeHtml(t('timeshift.selectedOnly', { no: p.selected }))}</span></label></div>`,
      foot: `<span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('timeshift-ok', t('common.ok'), 'check', 'primary')}`,
    });
    fitHeight();
    ready();
  }

  const parseShift = (text) => {
    const m = /^\s*([+-])?\s*(?:(\d+):)?(?:(\d+):)?(\d+(?:\.\d+)?)\s*$/.exec(String(text));
    if (!m) return null;
    const parts = [m[2], m[3]].filter((x) => x != null).map(Number);
    let seconds = Number(m[4]);
    if (parts.length === 2) seconds += parts[0] * 3600 + parts[1] * 60;
    else if (parts.length === 1) seconds += parts[0] * 60;
    return m[1] === '-' ? -seconds : seconds;
  };

  function renderColumns() {
    if (!net.draft) net.draft = { list: s().columns.map((col) => ({ ...col })) };
    const d = net.draft;
    const sel = net.selectedRow?.index ?? -1;
    const kinds = COLUMN_KINDS.map((k) => [k, t(`column.${k}`)]);
    root.innerHTML = frame({
      glyph: 'columns', title: t('action.columnPrefs'),
      body: `<div class="net-table-wrap"><table class="net-table"><thead><tr><th>${escapeHtml(t('columns.shown'))}</th><th>${escapeHtml(t('columns.title'))}</th><th>${escapeHtml(t('columns.kind'))}</th><th>${escapeHtml(t('columns.field'))}</th><th>${escapeHtml(t('columns.width'))}</th></tr></thead><tbody>
        ${d.list.map((col, i) => `<tr class="${sel === i ? 'selected' : ''}" data-action="columns-row" data-value="${i}"><td><input type="checkbox" data-col-field="visible" data-index="${i}" ${col.visible ? 'checked' : ''} /></td><td><input type="text" data-col-field="title" data-index="${i}" value="${escapeHtml(col.title ?? '')}" placeholder="${escapeHtml(col.kind === 'field' ? col.field ?? '' : t(`column.${col.kind}`))}" /></td><td>${select('data-col-field', `kind:${i}`, kinds, col.kind, t('columns.kind'))}</td><td><input type="text" data-col-field="field" data-index="${i}" value="${escapeHtml(col.field ?? '')}" ${col.kind === 'field' ? '' : 'disabled'} spellcheck="false" placeholder="tcp.window_size" /></td><td>${numberField(`col:width:${i}`, col.width, 30, 3000, 10, 'px', t('columns.width'))}</td></tr>`).join('')}
      </tbody></table></div><div class="row">${button('columns-add', t('columns.add'), 'plus', 'small')}${button('columns-up', t('coloring.up'), 'chevronUp', 'small', '', sel > 0 ? '' : 'disabled')}${button('columns-down', t('coloring.down'), 'chevronDown', 'small', '', sel >= 0 && sel < d.list.length - 1 ? '' : 'disabled')}${button('columns-delete', t('coloring.delete'), 'trash', 'small danger', '', sel >= 0 ? '' : 'disabled')}</div>`,
      foot: `${button('columns-reset', t('columns.reset'), 'refresh', 'small')}<span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('columns-save', t('common.ok'), 'check', 'primary')}`,
    });
    ready();
  }

  // ───────────────────────── print (own window: printer, page setup, preview, prints at once)

  function printOptions() {
    if (!net.print) {
      let saved = {};
      try { saved = JSON.parse(globalThis.localStorage?.getItem(PRINT_KEY) ?? '{}') ?? {}; } catch { /* defaults */ }
      const p = P();
      net.print = { ...defaultPrintOptions(), ...saved, range: p.displayed < p.count ? 'displayed' : 'all', custom: '', ...(p.preset ?? {}) };
    }
    return net.print;
  }

  function changePrint(patch, { refetch = false } = {}) {
    net.print = { ...printOptions(), ...patch };
    const { range, custom, ...kept } = net.print;
    void range; void custom;
    try { globalThis.localStorage?.setItem(PRINT_KEY, JSON.stringify(kept)); } catch { /* ignore */ }
    if (refetch) requestPrint();
    else net.printLayout = null;
    render();
  }

  function requestPrint() {
    const o = printOptions();
    net.printModel = null;
    net.printLayout = null;
    net.printPage = 0;
    action('print-request', { report: Boolean(P().report), range: o.range, custom: o.custom, summary: o.summary, columnHeader: o.columnHeader, details: o.details, bytes: o.bytes });
  }

  function printLayoutNow() {
    if (!net.printModel) return null;
    net.printLayout ??= layoutPrint(net.printModel, printOptions(), { language: L(), t });
    return net.printLayout;
  }

  function renderPrint() {
    const p = P();
    const o = printOptions();
    if (!net.printModel && !net.printRequested) { net.printRequested = true; requestPrint(); }
    if (!net.printers) {
      net.printers = { printers: [], defaultPrinter: '' };
      native.listPrinters().then((list) => { net.printers = list; if (list.printers.length) render(); }).catch(() => {});
    }
    const { printers, defaultPrinter } = net.printers;
    const layout = printLayoutNow();
    const count = layout?.count ?? 0;
    net.printPage = Math.max(0, Math.min(net.printPage ?? 0, count - 1));
    const page = layout?.pages[net.printPage];
    const sel = (key, values, label) => select('data-print', key, values, o[key], label);
    const check = (key, label, glyph) => row(glyph, label, `<label class="switch-wrap" title="${escapeHtml(label)}"><input type="checkbox" data-print-toggle="${key}" ${o[key] ? 'checked' : ''} aria-label="${escapeHtml(label)}" /><span class="switch" aria-hidden="true"></span></label>`);
    const section = (glyph, title, rows) => `<section class="print-section"><h3>${icon(glyph)}<span>${escapeHtml(title)}</span></h3>${rows.join('')}</section>`;
    const rangeLabel = { all: t('export.all', { count: p.count }), displayed: t('export.displayed', { count: p.displayed }), selected: t('export.selected', { no: p.selected > 0 ? p.selected : '-' }), marked: t('export.marked', { count: p.marked }), custom: t('export.custom') };
    const rangeDisabled = { selected: p.selected < 1, marked: !p.marked };
    root.innerHTML = frame({
      glyph: 'print', title: `${t('print.title')}${p.doc ? ` — ${p.doc}` : ''}`,
      body: `<div class="print-view">
        <div class="print-options">
          <div class="print-column">
          ${section('print', t('print.printer'), [
            printers.length ? row('print', t('print.printer'), select('data-print', 'printer', [['', t('print.defaultPrinter', { name: defaultPrinter || '-' }), 'print'], ...printers.map((name) => [name, name, 'print'])], printers.includes(o.printer) ? o.printer : '', t('print.printer'))) : row('info', '', `<span class="muted">${escapeHtml(t('print.systemDialog'))}</span>`),
            printers.length ? row('copy', t('print.copies'), numberField('print:copies', o.copies, 1, 99, 1, '', t('print.copies'))) : '',
          ])}
          ${section('packets', t('export.range'), [
            ...PRINT_RANGES.map((range) => `<label class="row radio-row" title="${escapeHtml(rangeLabel[range])}"><input type="radio" name="range" data-print-range="${range}" ${o.range === range ? 'checked' : ''} ${rangeDisabled[range] ? 'disabled' : ''} /><span>${icon({ all: 'selectAll', displayed: 'filterApply', selected: 'packet', marked: 'markPacket', custom: 'list' }[range])}${escapeHtml(rangeLabel[range])}</span></label>`),
            o.range === 'custom' ? row('list', t('print.packetRange'), `<input type="text" data-print-text="custom" value="${escapeHtml(o.custom)}" placeholder="1-10,15,20-" spellcheck="false" />`) : '',
          ])}
          ${section('paneDetails', t('export.packetFormat'), [
            check('summary', t('export.summaryLine'), 'paneList'),
            check('columnHeader', t('export.columnHeader'), 'columns'),
            row('paneDetails', t('export.details'), sel('details', PRINT_DETAILS.map((d) => [d, t(`export.details.${d}`)]), t('export.details'))),
            check('bytes', t('export.bytes'), 'paneBytes'),
            check('newPage', t('print.newPage'), 'file'),
          ])}
          </div>
          <div class="print-column">
          ${section('pageSetup', t('print.tabPage'), [
            row('file', t('print.paper'), sel('paper', Object.keys(PAPERS).map((paper) => [paper, paper]), t('print.paper'))),
            row('pageSetup', t('print.orientation'), segmented('orientation', [['portrait', t('print.portrait'), 'file'], ['landscape', t('print.landscape'), 'pageSetup']], o.orientation, 'data-print-segment')),
            row('fitPage', t('print.margin'), sel('margin', Object.keys(MARGINS).map((margin) => [margin, t(`print.margin.${margin}`)]), t('print.margin'))),
            row('font', t('print.fontSize'), sel('fontSize', FONT_SIZES.map((size) => [size, `${size} pt`]), t('print.fontSize'))),
          ])}
          ${section('notes', t('print.tabHeader'), [
            check('header', t('print.header'), 'notes'),
            row('edit', t('print.headerText'), `<input type="text" data-print-text="headerText" value="${escapeHtml(o.headerText)}" placeholder="${escapeHtml(net.printModel?.title ?? p.doc ?? '')}" title="${escapeHtml(t('print.headerText'))}" />`),
            check('footer', t('print.footer'), 'pageSetup'),
            row('edit', t('print.footerText'), `<input type="text" data-print-text="footerText" value="${escapeHtml(o.footerText)}" placeholder="MyNetManager" title="${escapeHtml(t('print.footerText'))}" />`),
            row('info', t('print.summary'), `<span class="muted">${escapeHtml(layout ? t('print.summaryPackets', { packets: net.printModel.packets.length, sheets: count, lines: layout.metrics.lines, chars: layout.metrics.chars }) : t('stats.loading'))}</span>`),
          ])}
          </div>
        </div>
        <div class="print-preview" id="print-preview">
          ${page ? `<div class="preview-stage pp-stage" data-w="${layout.metrics.width}" data-h="${layout.metrics.height}">${page.html}</div>` : `<div class="preview-empty">${icon(layout ? 'info' : 'hourglass')}<span>${escapeHtml(layout ? t('print.empty') : t('stats.loading'))}</span></div>`}
        </div>
      </div>
      <div class="print-sheet" aria-hidden="true">${(layout?.pages ?? []).map((item) => `<div class="print-page">${item.html}</div>`).join('')}</div>`,
      foot: `<button class="icon-button" data-action="print-page" data-value="-1" title="${escapeHtml(t('print.prev'))}" aria-label="${escapeHtml(t('print.prev'))}" ${net.printPage <= 0 ? 'disabled' : ''}>${icon('chevronLeft')}</button>
        <span class="page-number" id="page-number">${escapeHtml(t('print.page', { n: count ? net.printPage + 1 : 0, total: count }))}</span>
        <button class="icon-button" data-action="print-page" data-value="1" title="${escapeHtml(t('print.next'))}" aria-label="${escapeHtml(t('print.next'))}" ${net.printPage >= count - 1 ? 'disabled' : ''}>${icon('chevronRight')}</button>
        <span class="grow"></span>
        ${count ? exportControls('print-export') : ''}
        <button class="button primary" data-action="print-now" title="${escapeHtml(t('print.print'))}" ${count ? '' : 'disabled'}>${icon('print')}<span>${escapeHtml(t('print.print'))}</span></button>
        ${button('close', t('common.close'), 'close')}`,
    });
    let style = document.querySelector('#page-style');
    if (!style) { style = document.createElement('style'); style.id = 'page-style'; document.head.append(style); }
    const paper = layout?.paper ?? paperSize(o);
    // A hair under the paper's height: a sheet exactly as tall as the page can round over it and print an empty page.
    style.textContent = `@page { size: ${paper.width}mm ${paper.height}mm; margin: 0; }
@media print { .print-sheet .print-page { width: ${paper.width}mm; height: ${paper.height - 0.5}mm; } .print-sheet .pp-sheet { width: ${paper.width}mm !important; height: ${paper.height - 0.5}mm !important; } }`;
    fitPrintPreview();
    ready();
  }

  function fitPrintPreview() {
    const area = root.querySelector('#print-preview');
    const stage = area?.querySelector('.pp-stage');
    if (!stage) return;
    const box = area.getBoundingClientRect();
    const w = Number(stage.dataset.w);
    const h = Number(stage.dataset.h);
    const scale = Math.min((box.width - 24) / w, (box.height - 24) / h);
    stage.style.transform = `scale(${scale})`;
    stage.style.width = `${w}px`;
    stage.style.height = `${h}px`;
    stage.style.left = `${(box.width - w * scale) / 2}px`;
    stage.style.top = `${(box.height - h * scale) / 2}px`;
  }

  /** Prints at once: to the chosen printer without a system dialog (Windows), else the system dialog. */
  async function printNow() {
    const layout = printLayoutNow();
    if (!layout?.count) return;
    const o = printOptions();
    const job = { printer: net.printers?.printers.includes(o.printer) ? o.printer : '', copies: o.copies ?? 1, widthMm: layout.paper.width, heightMm: layout.paper.height };
    try {
      const hook = window.__mynetmanagerPrintHook ?? (() => { try { return window.parent?.__mynetmanagerPrintHook; } catch { return null; } })();
      if (hook) hook(layout, job);
      else if (net.printers?.printers.length) await native.printDirect(job);
      else await native.printWindow();
      action('printed', { sheets: layout.count });
    } catch (error) {
      action('report-error', { titleKey: 'error.print', message: native.errorText(error), context: 'print' });
    }
  }

  // ───────────────────────── report (sections and format)

  const REPORT_ICONS = { overview: 'captureProperties', findings: 'expertInfo', protocols: 'protocolHierarchy', talkers: 'endpoints', problems: 'warning', log: 'notes' };

  function renderReport() {
    const p = P();
    if (!net.draft) net.draft = { sections: new Set(p.sections ?? Object.keys(REPORT_ICONS)), format: 'html' };
    const d = net.draft;
    root.innerHTML = frame({
      glyph: 'reportHtml', title: `${t('action.report')}${p.doc ? ` — ${p.doc}` : ''}`,
      body: `<div class="settings-page">
        <h3 class="section-title">${icon('list')}${escapeHtml(t('report.sections'))}</h3>
        <div class="report-sections">${(p.sections ?? Object.keys(REPORT_ICONS)).map((id) => `<label class="check-inline"><input type="checkbox" data-report-section="${id}" ${d.sections.has(id) ? 'checked' : ''} />${icon(REPORT_ICONS[id] ?? 'list')}<span>${escapeHtml(t(`report.section.${id}`))}</span></label>`).join('')}</div>
        ${row('reportHtml', t('report.format'), segmented('format', [['html', 'HTML', 'reportHtml'], ['markdown', 'Markdown', 'reportMarkdown'], ['pdf', 'PDF', 'exportReport'], ['docx', 'Word', 'exportFile'], ['print', t('action.print'), 'print']], d.format, 'data-net-seg'))}
        <p class="muted">${escapeHtml(t('report.hint'))}</p>
      </div>`,
      foot: `<span class="grow"></span>${button('close', t('common.cancel'), 'close')}${button('report-ok', t(d.format === 'print' ? 'action.print' : 'export.save'), d.format === 'print' ? 'print' : 'save', 'primary', '', d.sections.size ? '' : 'disabled')}`,
    });
    fitHeight();
    ready();
  }

  // ───────────────────────── settings tabs

  const settingsTabs = {
    layout: () => [
      row('paneList', t('settings.paneLayout'), segmented('paneLayout', PANE_LAYOUTS.map((id) => [id, t(`settings.layout.${id}`), { stack: 'paneList', 'details-right': 'paneDetails', 'bytes-right': 'paneBytes' }[id]]), s().paneLayout)),
      toggle('showFilterBar', t('action.filterBar'), 'filterBar'),
      toggle('showPacketList', t('action.paneList'), 'paneList'),
      toggle('showDetails', t('action.paneDetails'), 'paneDetails'),
      toggle('showBytes', t('action.paneBytes'), 'paneBytes'),
      toggle('showNetMap', t('action.netMap'), 'paneMap'),
      row('clock', t('settings.timeFormat'), select('data-select', 'timeFormat', TIME_FORMATS.map((f) => [f, t(`time.${f}`)]), s().timeFormat, t('settings.timeFormat'))),
      row('clock', t('settings.timePrecision'), select('data-select', 'timePrecision', TIME_PRECISIONS.map((p) => [p, t(`precision.${p}`)]), s().timePrecision, t('settings.timePrecision'))),
      row('packets', t('settings.rowHeight'), numberField('rowHeight', s().rowHeight, 16, 40, 1, 'px', t('settings.rowHeight'))),
      toggle('colorize', t('action.colorize'), 'colorize'),
      toggle('autoScroll', t('action.autoScroll'), 'autoScroll'),
      row('columns', t('action.columnPrefs'), button('open-columns', t('action.columnPrefs'), 'columns', 'small')),
    ].join(''),
    capture: () => [
      toggle('capturePromisc', t('capopts.promisc'), 'interfaces'),
      toggle('captureMonitor', t('capopts.monitor'), 'ifWifi'),
      row('ruler', t('capopts.snaplen'), numberField('captureSnaplen', s().captureSnaplen, 64, 262144, 1024, 'B', t('capopts.snaplen'))),
      row('database', t('capopts.buffer'), numberField('captureBufferMb', s().captureBufferMb, 1, 1024, 1, 'MB', t('capopts.buffer'))),
      row('packets', t('capopts.stopPackets'), numberField('captureStopPackets', s().captureStopPackets, 0, 1e9, 100, '', t('capopts.stopPackets'))),
      row('clock', t('capopts.stopSeconds'), numberField('captureStopSeconds', s().captureStopSeconds, 0, 1e7, 10, 's', t('capopts.stopSeconds'))),
      row('ifDemo', t('capopts.demoRate'), numberField('demoRate', s().demoRate, 1, 2000, 10, '/s', t('capopts.demoRate'))),
      row('captureFilterIcon', t('capopts.filter'), `<input type="text" data-setting-text="captureFilter" value="${escapeHtml(s().captureFilter)}" spellcheck="false" />`),
    ].join(''),
    resolution: () => [
      toggle('resolveMac', t('action.resolveMac'), 'resolvedAddresses'),
      toggle('resolveTransport', t('action.resolveTransport'), 'resolvedAddresses'),
      toggle('resolveNetwork', t('action.resolveNetwork'), 'resolvedAddresses'),
      toggle('tcpRelativeSeq', t('settings.tcpRelativeSeq'), 'tcpGraph'),
      toggle('tcpAnalyze', t('settings.tcpAnalyze'), 'expertInfo'),
      row('info', '', `<span class="muted">${escapeHtml(t('settings.redissectHint'))}</span>`, t('settings.redissectHint')),
      row('refresh', t('settings.redissect'), button('redissect', t('settings.redissectNow'), 'refresh', 'small')),
    ].join(''),
    protocols: () => protocolsBody(),
  };

  // ───────────────────────── events

  function click(target, event) {
    const value = target.dataset.value;
    const name = target.dataset.action;
    const d = net.draft;
    switch (name) {
      case 'stat-tab': net.draft.tab = value; net.data = null; net.sort = null; net.selectedRow = null; request(P().statKind, statOptions()); return render();
      case 'net-tab': d.tab = value; return render();
      case 'net-sort': net.sort = net.sort?.id === value ? (net.sort.desc ? null : { id: value, desc: true }) : { id: value, desc: false }; return render();
      case 'net-toggle': event.stopPropagation(); if (net.collapsed.has(value)) net.collapsed.delete(value); else net.collapsed.add(value); return render();
      case 'net-print': return net.data && !net.data.error ? action('doc-print', { doc: statDocument() }) : undefined;
      case 'net-export': return net.data && !net.data.error ? action('doc-export', { doc: statDocument(), format: net.exportFormat ?? 'html' }) : undefined;
      case 'print-export': return net.printModel?.packets?.length ? action('doc-export', { doc: { title: net.printModel.title || P().doc || t('action.print'), subtitle: P().doc ?? '', pre: net.printModel.packets.flatMap((pk, i) => (i ? ['', ...pk.lines] : pk.lines)) }, format: net.exportFormat ?? 'html' }) : undefined;
      case 'net-expand-all': net.collapsed.clear(); return render();
      case 'net-collapse-all': (net.data?.rows ?? []).forEach((row, i, all) => { if (all[i + 1]?.depth > row.depth) net.collapsed.add(row.id); }); return render();
      case 'net-row': {
        net.selectedRow = net.data?.rows?.find((r) => String(r.id) === value) ?? null;
        if (event.detail >= 2 && net.selectedRow?.no) action('select-node', { no: net.selectedRow.no });
        else if (event.detail >= 2 && net.selectedRow?.filter) action('apply-filter', { filter: net.selectedRow.filter });
        return render();
      }
      case 'net-prepare': return net.selectedRow?.filter ? action('apply-filter', { filter: net.selectedRow.filter, prepare: true }) : undefined;
      case 'net-apply': return net.selectedRow?.filter ? action('apply-filter', { filter: net.selectedRow.filter }) : undefined;
      case 'net-refresh':
        net.data = null;
        if (kind === 'chart') requestChart(); else if (kind === 'follow') requestFollow(); else if (kind === 'flowgraph') request('flow', { flowType: d.flowType, addresses: d.addresses, filter: d.filter }); else request(P().statKind, statOptions());
        return render();
      case 'net-copy': return net.data && !net.data.error ? copyText(kind === 'follow' ? net.data.text ?? net.data.segments.map((x) => x.text).join('') : kind === 'chart' ? chartCsv(net.data) : kind === 'flowgraph' ? net.data.rows.map((r) => `${r.time}\t${net.data.nodes[r.from]}\t${net.data.nodes[r.to]}\t${r.label}`).join('\n') : tableCsv(net.data)).then(() => action('notice', { kind: 'success', text: t('error.copied') })) : undefined;
      case 'net-save': {
        if (!net.data || net.data.error) return undefined;
        if (kind === 'follow') return action('save-text', { name: `stream-${d.index}.txt`, text: net.data.text ?? net.data.segments.map((x) => x.text).join(''), type: 'txt' });
        const csv = net.data.view === 'table' || net.data.view === 'tree' || net.data.view === 'objects';
        return action('save-text', { name: `${P().statKind}.${csv ? 'csv' : 'txt'}`, text: csv ? `﻿${tableCsv(net.data)}` : tableCsv(net.data), type: csv ? 'csv' : 'txt', mime: csv ? 'text/csv' : 'text/plain' });
      }
      case 'net-save-svg': { const svg = root.querySelector('.net-chart-svg, .flow-svg'); return svg ? action('save-image', { name: `${P().statKind ?? kind}`, svg: svgStandalone(svg) }) : undefined; }
      case 'graph-export': return graphExport();
      case 'net-save-object': { const r = net.data.rows.find((x) => String(x.id) === value); return r ? action('save-bytes', { objectKind: P().objectKind, id: r.id, name: r.cells.filename || `object-${r.id}`, type: 'any' }) : undefined; }
      case 'net-save-all': return net.data.rows.forEach((r) => action('save-bytes', { objectKind: P().objectKind, id: r.id, name: r.cells.filename || `object-${r.id}`, type: 'any' }));
      case 'net-series-add': d.series.push({ name: t('chart.newSeries'), filter: '', color: PALETTE[d.series.length % PALETTE.length], style: 'line', calc: 'packets', field: '', on: true }); return render();
      case 'net-series-remove': d.series.splice(Number(value), 1); return render();
      case 'follow-frame': return action('select-node', { no: Number(value) });
      case 'follow-filter-out': action('follow-filter-out', { kind: d.kind, index: d.index }); return close();
      case 'follow-show': return action('follow-stream', { kind: d.kind, index: d.index });
      // capture options
      case 'cap-iface': update({ captureInterface: value }); return undefined;
      case 'cap-refresh': return action('refresh-interfaces');
      case 'cap-preset': update({ captureFilter: togglePreset(s().captureFilter, value, CAPTURE_PRESETS) }); net.draft.filterCheck = null; return render();
      case 'cap-check': return action('capture-filter-check', { filter: s().captureFilter, linktype: d.interfaces.find((i) => i.id === s().captureInterface)?.linktype ?? 1 });
      case 'cap-start': return close({ start: true });
      // colouring
      case 'color-row': net.selectedRow = { index: Number(value) }; return keepRender();
      case 'color-add': net.colorRules.push({ name: t('coloring.newRule'), filter: 'frame', fg: '#000000', bg: '#ffffff', enabled: true }); net.selectedRow = { index: net.colorRules.length - 1 }; return render();
      case 'color-copy': { const i = net.selectedRow.index; net.colorRules.splice(i + 1, 0, { ...net.colorRules[i], name: `${net.colorRules[i].name} (2)` }); net.selectedRow = { index: i + 1 }; return render(); }
      case 'color-up': case 'color-down': { const i = net.selectedRow.index; const j = name === 'color-up' ? i - 1 : i + 1; [net.colorRules[i], net.colorRules[j]] = [net.colorRules[j], net.colorRules[i]]; net.selectedRow = { index: j }; return render(); }
      case 'color-delete': net.colorRules.splice(net.selectedRow.index, 1); net.selectedRow = null; return render();
      case 'color-export': return action('save-text', { name: 'colorfilters', text: toColorfilters(net.colorRules), type: 'colorfilters' });
      case 'color-import': net.importing = !net.importing; return render();
      case 'color-import-apply': { const rules = fromColorfilters(root.querySelector('[data-net="importText"]')?.value ?? ''); if (rules.length) { net.colorRules = rules; net.importing = false; } return render(); }
      case 'color-reset': net.colorRules = net.colorDefaults.map((r) => ({ ...r })); return render();
      case 'color-save': action('coloring-save', { rules: net.colorRules }); return close();
      // filter expression
      case 'expr-proto': d.protocol = value; d.field = null; net.fields = null; action('fields-request', { protocol: value }); return render();
      case 'expr-field': d.field = value; return syncExpr();
      case 'expr-rel': d.relation = value; return syncExpr();
      case 'expr-value': d.value = value; if (d.relation === 'present') d.relation = '=='; return syncExpr();
      case 'expr-ok': return close({ filter: root.querySelector('[data-net="exprText"]')?.value.trim() ?? '' });
      case 'expr-apply': return close({ filter: root.querySelector('[data-net="exprText"]')?.value.trim() ?? '', apply: true });
      // saved filters
      case 'filters-row': net.selectedRow = { index: Number(value) }; return keepRender();
      case 'filters-add': d.list.push({ name: t('filter.newName'), filter: '', button: false }); net.selectedRow = { index: d.list.length - 1 }; return render();
      case 'filters-delete': d.list.splice(net.selectedRow.index, 1); net.selectedRow = null; return render();
      case 'filters-apply': { const f = d.list[net.selectedRow.index]; return f?.filter ? action('apply-filter', { filter: f.filter }) : undefined; }
      case 'filters-save': { const saved = loadSavedFilters(); saved[P().which === 'capture' ? 'capture' : 'display'] = d.list; storeSavedFilters(saved); action('filters-changed'); return close(); }
      // export
      case 'export-ok': return close({ ...d });
      // decode as
      case 'decode-row': net.selectedRow = { index: Number(value) }; return keepRender();
      case 'decode-add': { const cur = P().current ?? {}; d.list.push(cur.tcpPort != null ? { table: 'tcp.port', value: String(cur.tcpPort), proto: 'http' } : cur.udpPort != null ? { table: 'udp.port', value: String(cur.udpPort), proto: 'dns' } : { table: 'tcp.port', value: '8080', proto: 'http' }); net.selectedRow = { index: d.list.length - 1 }; return render(); }
      case 'decode-delete': d.list.splice(net.selectedRow.index, 1); net.selectedRow = null; return render();
      case 'decode-save': update({ decodeAs: d.list.filter((x) => String(x.value).trim()).map((x) => ({ table: x.table, value: /port|proto/.test(x.table) || x.table === 'ethertype' ? Number(x.value) : x.value, proto: x.proto })) }); action('redissect'); return close();
      // protocols
      case 'protocols-all': update({ disabledProtocols: [] }); return undefined;
      case 'protocols-none': update({ disabledProtocols: (net.protocols ?? []).map((x) => x.abbrev).filter((a) => !['frame', 'eth', 'ip', 'ipv6'].includes(a)) }); return undefined;
      case 'protocols-apply': action('redissect'); return close();
      case 'redissect': return action('redissect');
      case 'open-columns': return action('open-columns-window');
      // go to, find, time shift
      case 'goto-ok': return close({ value: Number(root.querySelector('.stepper-value')?.value ?? net.draft.value) });
      case 'find-ok': return close({ mode: d.mode, text: d.text, where: d.where, matchCase: d.matchCase });
      case 'timeshift-ok': { const seconds = parseShift(d.value); if (seconds == null) { root.querySelector('[data-draft="value"]')?.classList.add('invalid'); return undefined; } return close({ seconds, selectedOnly: d.selectedOnly }); }
      // report
      case 'report-ok': return close({ sections: [...d.sections], format: d.format });
      // print
      case 'print-page': net.printPage = (net.printPage ?? 0) + Number(value); return render();
      case 'print-now': return printNow();
      // columns
      case 'columns-row': net.selectedRow = { index: Number(value) }; return keepRender();
      case 'columns-add': d.list.push({ id: `f-${Date.now() % 100000}`, kind: 'field', field: 'tcp.window_size', title: '', width: 120, visible: true }); net.selectedRow = { index: d.list.length - 1 }; return render();
      case 'columns-up': case 'columns-down': { const i = net.selectedRow.index; const j = name === 'columns-up' ? i - 1 : i + 1; [d.list[i], d.list[j]] = [d.list[j], d.list[i]]; net.selectedRow = { index: j }; return render(); }
      case 'columns-delete': d.list.splice(net.selectedRow.index, 1); net.selectedRow = null; return render();
      case 'columns-reset': update({ columns: DEFAULT_COLUMNS.map((col) => ({ ...col })) }); net.draft = null; action('columns-changed'); return render();
      case 'columns-save': update({ columns: d.list }); action('columns-changed'); return close();
      default: break;
    }
    if (target.dataset.printSegment) { changePrint({ [target.dataset.printSegment]: target.dataset.value }); return undefined; }
    if (target.dataset.netSeg) { d[target.dataset.netSeg] = target.dataset.value; if (kind === 'stats') { net.data = null; request(P().statKind, statOptions()); } return render(); }
    return undefined;
  }

  /** Selecting a row in an editable table keeps the focused input. */
  function keepRender() { c.keepFocus(render); }

  function syncExpr() {
    const field = (net.fields ?? []).find((f) => f.abbrev === net.draft.field);
    net.draft.text = buildExpression(net.draft, field) || net.draft.text;
    action('filter-check', { text: net.draft.text, id: 'expr' });
    return render();
  }

  function change(target) {
    const d = net.draft;
    const field = target.dataset.net;
    if (field === 'exportFormat') { net.exportFormat = target.value; return render(); }
    if (field === 'imageMode') { net.imageMode = target.value; return undefined; }
    if (field === 'displayedOnly' && d) {
      d.displayedOnly = target.checked;
      net.data = null;
      if (kind === 'chart') requestChart(); else if (kind === 'flowgraph') request('flow', { flowType: d.flowType, addresses: d.addresses, filter: d.filter }); else request(P().statKind, statOptions());
      return render();
    }
    if (field === 'captureFilter') { update({ captureFilter: target.value.trim() }); return undefined; }
    if (['summary', 'bytes', 'header', 'matchCase', 'selectedOnly', 'reverse'].includes(field) && d) { d[field] = target.checked; return render(); }
    if (target.dataset.netRadio && d) { d[target.dataset.netRadio] = target.value; return render(); }
    if (target.dataset.netSel && d !== undefined) {
      const key = target.dataset.netSel;
      if (key === 'savedCaptureFilter') { if (target.value) update({ captureFilter: target.value }); return undefined; }
      if (!d) return undefined;
      d[key] = key === 'interval' ? Number(target.value) : target.value;
      if (kind === 'follow') { if (key === 'mode') { net.data = null; requestFollow(); } return render(); }
      if (kind === 'flowgraph') { net.data = null; request('flow', { flowType: d.flowType, addresses: d.addresses, filter: d.filter }); return render(); }
      if (kind === 'chart') { net.data = null; requestChart(); return render(); }
      return render();
    }
    if (target.dataset.series && d) {
      const s0 = d.series[Number(target.dataset.index)];
      s0[target.dataset.series] = target.type === 'checkbox' ? target.checked : target.value;
      if (target.dataset.series === 'calc' || target.dataset.series === 'on') render();
      return undefined;
    }
    if (target.dataset.colorField && net.colorRules) {
      const rule = net.colorRules[Number(target.dataset.index)];
      rule[target.dataset.colorField] = target.type === 'checkbox' ? target.checked : target.value;
      if (target.dataset.colorField === 'filter') action('filter-check', { text: target.value, id: `color:${target.dataset.index}` });
      return keepRender();
    }
    if (target.dataset.filtersField && d) { const f = d.list[Number(target.dataset.index)]; f[target.dataset.filtersField] = target.type === 'checkbox' ? target.checked : target.value; return undefined; }
    if (target.dataset.decodeField && d) { const [key, i] = target.dataset.decodeField.split(':'); d.list[Number(i)][key] = target.value; return undefined; }
    if (target.dataset.colField && d) {
      const [key, i] = target.dataset.colField.includes(':') ? target.dataset.colField.split(':') : [target.dataset.colField, target.dataset.index];
      const col = d.list[Number(i)];
      col[key] = target.type === 'checkbox' ? target.checked : key === 'width' ? Number(target.value) : target.value;
      if (key === 'kind') return render();
      return undefined;
    }
    if (kind === 'print') {
      if (target.dataset.printRange) return changePrint({ range: target.dataset.printRange }, { refetch: target.dataset.printRange !== 'custom' || Boolean(printOptions().custom) });
      if (target.dataset.printToggle) { const key = target.dataset.printToggle; return changePrint({ [key]: target.checked }, { refetch: ['summary', 'columnHeader', 'bytes'].includes(key) }); }
      if (target.dataset.print) { const key = target.dataset.print; return changePrint({ [key]: key === 'fontSize' ? Number(target.value) : target.value }, { refetch: key === 'details' }); }
      if (target.dataset.printText) { const key = target.dataset.printText; return changePrint({ [key]: target.value }, { refetch: key === 'custom' }); }
    }
    if (target.dataset.reportSection && d) { if (target.checked) d.sections.add(target.dataset.reportSection); else d.sections.delete(target.dataset.reportSection); return render(); }
    if (target.dataset.protoToggle) {
      const set = new Set(s().disabledProtocols);
      if (target.checked) set.delete(target.dataset.protoToggle); else set.add(target.dataset.protoToggle);
      update({ disabledProtocols: [...set] });
      return undefined;
    }
    return undefined;
  }

  function input(target) {
    // Plain text boxes of these popups (data-draft) write into this module's draft.
    if (target.dataset.draft && net.draft) net.draft[target.dataset.draft] = target.value;
    const field = target.dataset.net;
    if (!field) return;
    if (field === 'query') { net.query = target.value; keepCaret(target, render); return; }
    if (field === 'protoQuery') { if (net.draft) net.draft.protoQuery = target.value; net.protoQuery = target.value; state.pager.protocols = 0; state.pager['expr-protocols'] = 0; keepCaret(target, render); return; }
    if (field === 'find' && net.draft) { net.draft.find = target.value; keepCaret(target, render); return; }
    if (field === 'exprValue' && net.draft) { net.draft.value = target.value; const field2 = (net.fields ?? []).find((f) => f.abbrev === net.draft.field); const text = buildExpression(net.draft, field2); const box = root.querySelector('[data-net="exprText"]'); if (box && text) box.value = text; action('filter-check', { text: box?.value ?? '', id: 'expr' }); return; }
    if (field === 'exprText' && net.draft) { net.draft.text = target.value; action('filter-check', { text: target.value, id: 'expr' }); return; }
    if (field === 'custom' && net.draft) net.draft.custom = target.value;
  }

  function keepCaret(target, draw) {
    const selector = `[data-net="${target.dataset.net}"]`;
    const at = target.selectionStart;
    draw();
    const next = root.querySelector(selector);
    next?.focus();
    next?.setSelectionRange(at, at);
  }

  function message(m) {
    if (m?.type === 'print-data') { net.printModel = m.model ?? { packets: [] }; net.printLayout = null; render(); return true; }
    if (m?.type === 'stats-data') {
      net.loading = false;
      net.data = m.result ?? { error: 'no data' };
      if (net.data.tab && net.draft) net.draft.tab = net.data.tab;
      render();
      return true;
    }
    if (m?.type === 'fields') { net.protocols = m.protocols ?? []; if (m.fields) net.fields = m.fields; render(); return true; }
    if (m?.type === 'coloring') { net.colorRules = (m.rules ?? []).map((r) => ({ ...r })); net.colorDefaults = m.defaults ?? []; render(); return true; }
    if (m?.type === 'interfaces' && net.draft) { net.draft.interfaces = m.interfaces ?? []; net.draft.backend = m.backend; render(); return true; }
    if (m?.type === 'capture-filter-check' && net.draft) { net.draft.filterCheck = { ok: m.ok, error: m.error }; render(); return true; }
    if (m?.type === 'filter-check') {
      if (m.id === 'expr' && net.draft) { net.draft.check = { status: m.status, error: m.error }; const box = root.querySelector('.expr-preview'); if (box) { box.classList.remove('valid', 'invalid', 'deprecated', 'empty'); box.classList.add(m.status); box.querySelector('.muted').textContent = m.error ?? ''; } }
      if (String(m.id).startsWith('color:') && net.colorRules) { const i = Number(m.id.slice(6)); if (net.colorRules[i]) { net.colorRules[i].invalid = m.status === 'invalid'; root.querySelector(`[data-color-field="filter"][data-index="${i}"]`)?.classList.toggle('invalid', m.status === 'invalid'); } }
      return true;
    }
    return false;
  }

  function stepper(scope, field, value) {
    if (scope === 'print') { changePrint({ [field]: value }); return; }
    if (scope === 'col' && net.draft) { const [, index] = field.split(':'); const col = net.draft.list[Number(index)]; if (col) col.width = value; return; }
    if (scope !== 'net' || !net.draft) return;
    net.draft[field] = value;
    if (kind === 'follow' && field === 'index') { net.data = null; requestFollow(); render(); }
    if (kind === 'chart' && field === 'stream') { net.data = null; requestChart(); render(); }
  }

  function keydown(event) {
    if (kind === 'print' && (event.key === 'PageDown' || event.key === 'PageUp')) { event.preventDefault(); net.printPage = (net.printPage ?? 0) + (event.key === 'PageDown' ? 1 : -1); render(); }
    if (kind === 'follow' && event.key === 'F3') { event.preventDefault(); root.querySelector('.seg.found')?.scrollIntoView({ block: 'center' }); }
  }

  const chartCsv = (r) => r.series.map((x) => `${x.name}\n${x.points.map(([px, py]) => `${px},${py}`).join('\n')}`).join('\n\n');
  /** A graph window as a document: the picture (PNG) and its numbers as a table (docexport.js). */
  async function graphExport() {
    const svg = root.querySelector('.net-chart-svg, .flow-svg');
    if (!svg || !net.data || net.data.error) return undefined;
    const title = root.querySelector('#popup-title span')?.textContent || t('menu.statistics');
    const canvas = await svgToCanvas(svgStandalone(svg), { scale: 2, background: '#ffffff' });
    const r = net.data;
    let table = null;
    if (kind === 'flowgraph' && r.rows) table = { columns: [{ label: t('flow.time') }, { label: t('flow.from') }, { label: t('flow.to') }, { label: t('flow.label') }], rows: r.rows.map((x) => ({ cells: [String(x.time), r.nodes[x.from], r.nodes[x.to], x.label] })) };
    else if (r.series) table = { columns: [{ label: t('chart.series') }, { label: 'X', num: true }, { label: 'Y', num: true }], rows: r.series.flatMap((x) => x.points.map(([px, py]) => ({ cells: [x.name, String(px), String(py)] }))) };
    const doc = { title, subtitle: P().doc ?? '', images: [{ dataUrl: canvas.toDataURL('image/png'), caption: title, ext: 'png', mime: 'image/png' }], ...(table ?? {}) };
    return action('doc-export', { doc, format: net.exportFormat ?? 'html', imageMode: net.imageMode ?? 'embed' });
  }

  const svgStandalone = (svg) => {
    const clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = 'text{font:12px sans-serif;fill:#333}.grid{stroke:#ddd}.axis{stroke:#666}.ylab{text-anchor:end}.xlab,.axis-title,.flow-node,.flow-label{text-anchor:middle}.flow-life{stroke:#bbb;stroke-dasharray:4 3}.flow-hit{fill:transparent}';
    clone.prepend(style);
    return new XMLSerializer().serializeToString(clone);
  };

  return {
    renderers: {
      stats: renderStats, chart: renderChart, follow: renderFollow, flowgraph: renderFlow, capopts: renderCapopts, coloring: renderColoring, filterexpr: renderFilterExpr,
      filters: renderFilters, export: renderExport, print: renderPrint, report: renderReport, decodeas: renderDecodeAs, protocols: renderProtocols, goto: renderGoto, find: renderFind, timeshift: renderTimeShift, columns: renderColumns,
    },
    settingsTabs,
    enterActions: { goto: 'goto-ok', find: 'find-ok', timeshift: 'timeshift-ok' },
    click, change, input, message, stepper, keydown,
    refresh: () => { net.data = null; net.draft = null; net.sort = null; net.query = ''; net.selectedRow = null; net.collapsed.clear(); net.colorRules = null; net.fields = null; net.importing = false; net.print = null; net.printModel = null; net.printLayout = null; net.printRequested = false; net.printPage = 0; },
    resize: () => { if (kind === 'print') fitPrintPreview(); },
    state: net,
  };
}
