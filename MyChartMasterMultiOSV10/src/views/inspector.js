// The inspector (right panel): what the chart shows and how. Five tabs — Data (chart type and which columns play
// which role), Style (titles, legend, palette, background, fonts), Axes (titles, range, scale, number format),
// Series (each series' or slice's colour and visibility, lines, bars, markers) and More (the settings particular
// to pies, histograms, heat maps, gauges, waterfalls and candles). Every control writes straight into the chart.
import { escapeHtml } from '../ui/dom.js';
import { icon } from '../icons.js';
import { baseType, BY_ROW, canMix, CARTESIAN, CHART_GROUPS, CHART_TYPES, chartType, HORIZONTAL, SERIES_KINDS } from '../domain/chart/types.js';
import { stepperHtml } from '../stepper.js';
import { CHART_THEMES, chartTheme, PALETTES, palette, RAMP_IDS, RAMPS, seriesColor } from '../domain/chart/palettes.js';
import { chartTable, normalizeBackground } from '../domain/chart/render.js';
import { labelsOf } from '../domain/data/table.js';

const KIND_ICONS = { column: 'chartColumn', line: 'chartLine', spline: 'chartSpline', step: 'chartStepLine', area: 'chartArea', points: 'chartPointLine', lollipop: 'chartLollipop' };
export const INSPECTOR_TABS = [['data', 'dataGrid'], ['style', 'palette'], ['axes', 'axisIcon'], ['series', 'seriesIcon'], ['more', 'gear']];

const LINE_TYPES = new Set(['line', 'spline', 'stepLine', 'area', 'stackedArea', 'percentArea', 'combo', 'radar']);
const BAR_TYPES = new Set(['column', 'bar', 'stackedColumn', 'stackedBar', 'percentColumn', 'percentBar', 'combo', 'waterfall', 'histogram', 'lollipop']);
const PIE_TYPES = new Set(['pie', 'donut', 'halfDonut', 'polarArea', 'sunburst']);

export class Inspector {
  /** api: { t, language(), doc(), tab(), onTab(id), onType(id), onOption(key, value, merge), onChart(patch, merge), onMapping(patch), onRename(col, name), onPalette(anchor) } */
  constructor(host, api) {
    this.host = host;
    this.api = api;
    host.addEventListener('input', (e) => this.onInput(e, false));
    host.addEventListener('change', (e) => this.onInput(e, true));
    host.addEventListener('click', (e) => this.onClick(e));
  }

  render() {
    const doc = this.api.doc();
    const t = this.api.t;
    if (!doc) { this.host.innerHTML = ''; return; }
    const tab = this.api.tab();
    const scroll = this.host.querySelector('.ins-body')?.scrollTop ?? 0;
    const body = { data: () => this.dataTab(doc), style: () => this.styleTab(doc), axes: () => this.axesTab(doc), series: () => this.seriesTab(doc), more: () => this.moreTab(doc) }[tab]?.() ?? '';
    this.host.innerHTML = `<div class="ins-tabs" role="tablist">${INSPECTOR_TABS.map(([id, glyph]) => `<button class="ins-tab ${tab === id ? 'active' : ''}" data-ins-tab="${id}" role="tab" aria-selected="${tab === id}" title="${escapeHtml(t(`inspector.${id}Tip`))}">${icon(glyph)}<span>${escapeHtml(t(`inspector.${id}`))}</span></button>`).join('')}</div>
      <div class="ins-body">${body}</div>`;
    this.host.querySelector('.ins-body').scrollTop = scroll;
  }

  // ───────────────────────── control builders

  section(glyph, title, rows) {
    const content = rows.filter(Boolean).join('');
    return content ? `<section class="ins-section"><h3>${icon(glyph)}<span>${escapeHtml(title)}</span></h3>${content}</section>` : '';
  }

  row(label, control, tip = '') {
    return `<label class="ins-row" title="${escapeHtml(tip || label)}"><span class="ins-label">${escapeHtml(label)}</span><span class="ins-control">${control}</span></label>`;
  }

  select(scope, key, value, options, label) {
    return `<select data-${scope}="${key}" aria-label="${escapeHtml(label)}">${options.map(([v, text, glyph]) => `<option value="${escapeHtml(v)}" ${String(v) === String(value) ? 'selected' : ''} ${glyph ? `data-icon="${glyph}"` : ''}>${escapeHtml(text)}</option>`).join('')}</select>`;
  }

  text(scope, key, value, label, placeholder = '') {
    return `<input type="text" data-${scope}="${key}" value="${escapeHtml(value ?? '')}" placeholder="${escapeHtml(placeholder)}" aria-label="${escapeHtml(label)}" spellcheck="false" />`;
  }

  /** A number: the shared stepper ( − value unit + ); empty = automatic when there is a placeholder. */
  number(key, value, label, { min = '', max = '', step = 'any', placeholder = '', unit = '' } = {}) {
    const t = this.api.t;
    return stepperHtml({ key: `opt:${key}`, value: value ?? '', min: min === '' ? -1e12 : min, max: max === '' ? 1e12 : max, step: step === 'any' ? 'auto' : step, unit, label, optional: Boolean(placeholder), placeholder, free: step === 'any', start: min === '' ? 0 : min, decreaseTip: t('stepper.decrease', { label }), increaseTip: t('stepper.increase', { label }) });
  }


  toggle(key, value, label) {
    return `<label class="switch-wrap ins-switch" title="${escapeHtml(label)}"><input type="checkbox" data-opt="${key}" ${value ? 'checked' : ''} aria-label="${escapeHtml(label)}" /><span class="switch" aria-hidden="true"></span></label>`;
  }

  /** A value in a range (was a slider): the same stepper, moving by the step. */
  range(key, value, label, min, max, step, unit = '') {
    const t = this.api.t;
    return stepperHtml({ key: `opt:${key}`, value: value ?? min, min, max, step, unit, label, decreaseTip: t('stepper.decrease', { label }), increaseTip: t('stepper.increase', { label }) });
  }

  /** A colour that may follow the theme: the picker and an "Auto" button (pressed while the colour is automatic). */
  optColor(key, value, label, fallback = '#888888') {
    const t = this.api.t;
    const own = /^#[0-9a-f]{6}$/i.test(String(value ?? ''));
    return `<span class="ins-color-opt">${this.color(key, own ? value : fallback, label)}<button type="button" class="small-button ${own ? '' : 'on'}" data-ins-action="reset-opt" data-key="${key}" aria-pressed="${!own}" title="${escapeHtml(t('inspector.autoColorTip'))}">${escapeHtml(t('inspector.autoColor'))}</button></span>`;
  }


  color(key, value, label, extra = '') {
    return `<input type="color" ${extra || `data-opt="${key}"`} value="${escapeHtml(value)}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}" />`;
  }

  segmented(key, value, items, label) {
    return `<span class="segmented ins-seg" role="radiogroup" aria-label="${escapeHtml(label)}">${items.map(([v, text, glyph]) => `<button type="button" class="segment ${String(value) === String(v) ? 'active' : ''}" data-seg="${key}" data-value="${escapeHtml(v)}" role="radio" aria-checked="${String(value) === String(v)}" title="${escapeHtml(text)}">${glyph ? icon(glyph) : ''}<span>${escapeHtml(text)}</span></button>`).join('')}</span>`;
  }

  // ───────────────────────── tabs

  dataTab(doc) {
    const t = this.api.t;
    const L = this.api.language();
    const type = chartType(doc.chart.type);
    // The columns of the chart's view (its data range, its orientation), as the roles point at them.
    const view = chartTable(doc.table, doc.chart);
    const cols = view.columns;
    const colOptions = (kind, optional) => [
      ...(optional ? [['', t('inspector.none'), 'close']] : []),
      ...cols.map((c, i) => [String(i), `${c.name}${kind === 'number' && c.type !== 'number' ? ` (${t(`type.${c.type}`)})` : ''}`, c.type === 'number' ? 'typeNumber' : c.type === 'date' ? 'typeDate' : 'typeText']),
    ];
    const typeOptions = CHART_GROUPS.flatMap((g) => CHART_TYPES.filter((c) => c.group === g.id).map((c) => [c.id, `${c[L]} · ${g[L]}`, c.icon]));
    const m = doc.chart.mapping;
    const roleRows = type.roles.map((role) => {
      const label = t(`role.${role.id}${role.id === 'values' && !role.multi ? '1' : ''}`);
      if (role.id === 'values' && role.multi) {
        const chosen = new Set(m.values ?? []);
        const list = cols.map((c, i) => {
          const on = chosen.has(i);
          const k = (m.values ?? []).indexOf(i);
          const color = on ? seriesColor(doc.chart.options, k) : 'transparent';
          return `<label class="ins-check ${c.type !== 'number' ? 'muted' : ''}" title="${escapeHtml(c.name)}"><input type="checkbox" data-value-col="${i}" ${on ? 'checked' : ''} /><span class="ins-dot" style="background:${color}"></span>${icon(c.type === 'number' ? 'typeNumber' : c.type === 'date' ? 'typeDate' : 'typeText')}<span>${escapeHtml(c.name)}</span></label>`;
        }).join('');
        return `<div class="ins-row block"><span class="ins-label">${escapeHtml(label)}</span><div class="ins-checks">${list}</div></div>`;
      }
      const value = role.id === 'values' ? (m.values?.[0] ?? '') : (m[role.id] ?? '');
      return this.row(label, this.select('map', role.id, value, colOptions(role.kind, role.optional || role.id === 'category'), label));
    });
    const o = doc.chart.options;
    const sortable = !['candlestick', 'scatter', 'bubble', 'sankey', 'histogram', 'boxplot'].includes(doc.chart.type);
    return [
      this.section('chartGallery', t('inspector.chartType'), [
        this.row(t('inspector.type'), this.select('type', 'type', doc.chart.type, typeOptions, t('inspector.type'))),
        `<p class="ins-hint">${icon(type.icon)}<span>${escapeHtml(type[`${L}Desc`])}</span></p>`,
      ]),
      this.section('chartRange', t('inspector.dataView'), [
        this.row(t('inspector.dataRange'), `<span class="ins-range-name">${escapeHtml(doc.chart.dataRange ? this.api.rangeName(doc.chart.dataRange) : t('inspector.wholeTable'))}</span>`),
        `<div class="ins-buttons"><button type="button" class="small-button" data-command="chartFromSelection">${icon('chartRange')}<span>${escapeHtml(t('action.chartFromSelection'))}</span></button>${doc.chart.dataRange ? `<button type="button" class="small-button" data-command="clearDataRange">${icon('dataGrid')}<span>${escapeHtml(t('action.clearDataRange'))}</span></button>` : ''}</div>`,
        this.row(t('inspector.seriesIn'), `<span class="segmented ins-seg" role="radiogroup" aria-label="${escapeHtml(t('inspector.seriesIn'))}">${[['columns', 'seriesInColumns', 'seriesIcon'], ['rows', 'seriesInRows', 'transpose']].map(([v, cmd, glyph]) => `<button type="button" class="segment ${(doc.chart.seriesIn ?? 'columns') === v ? 'active' : ''}" data-command="${cmd}" aria-pressed="${(doc.chart.seriesIn ?? 'columns') === v}">${icon(glyph)}<span>${escapeHtml(t(`seriesIn.${v}`))}</span></button>`).join('')}</span>`),
        `<p class="ins-hint">${icon('info')}<span>${escapeHtml(t('inspector.dataViewHint'))}</span></p>`,
      ]),
      this.section('dataGrid', t('inspector.mapping'), roleRows),
      this.section('sort', t('inspector.order'), [
        sortable ? this.row(t('inspector.sort'), this.select('opt', 'sort', o.sort, [['none', t('sort.none'), 'list'], ['desc', t('sort.desc'), 'sortDesc'], ['asc', t('sort.asc'), 'sortAsc'], ['label', t('sort.label'), 'typeText']], t('inspector.sort'))) : '',
        this.row(t('inspector.maxItems'), this.number('maxItems', o.maxItems || '', t('inspector.maxItems'), { min: 0, step: 1, placeholder: t('inspector.all') })),
      ]),
      `<p class="ins-hint">${icon('info')}<span>${escapeHtml(t('inspector.dataHint', { rows: doc.table.rows.length, cols: cols.length }))}</span></p>`,
    ].join('');
  }

  styleTab(doc) {
    const t = this.api.t;
    const L = this.api.language();
    const o = doc.chart.options;
    const bgValue = normalizeBackground(o.background);
    const bg = bgValue.startsWith('#') ? 'custom' : bgValue;
    const ct = chartTheme(o.chartTheme);
    const pal = palette(o.palette);
    return [
      this.section('chartTitle', t('inspector.titles'), [
        this.row(t('inspector.title'), this.text('chart', 'title', doc.chart.title, t('inspector.title'), t('inspector.titlePlaceholder'))),
        this.row(t('inspector.subtitle'), this.text('chart', 'subtitle', doc.chart.subtitle, t('inspector.subtitle'))),
        this.row(t('inspector.titleAlign'), this.segmented('titleAlign', o.titleAlign, [['left', t('align.left'), 'textAlignLeft'], ['center', t('align.center'), 'textAlignCenter'], ['right', t('align.right'), 'textAlignRight']], t('inspector.titleAlign'))),
        this.row(t('inspector.titleSize'), this.range('titleSize', o.titleSize ?? 20, t('inspector.titleSize'), 8, 60, 1, 'pt')),
        this.row(t('inspector.titleColor'), this.optColor('titleColor', o.titleColor, t('inspector.titleColor'))),
        this.row(t('inspector.titleBold'), this.toggle('titleBold', o.titleBold !== false, t('inspector.titleBold'))),
        this.row(t('inspector.subtitleSize'), this.range('subtitleSize', o.subtitleSize ?? 13, t('inspector.subtitleSize'), 6, 40, 1, 'pt')),
        this.row(t('inspector.subtitleColor'), this.optColor('subtitleColor', o.subtitleColor, t('inspector.subtitleColor'))),
        this.row(t('inspector.note'), this.text('opt', 'note', o.note, t('inspector.note'), t('inspector.notePlaceholder'))),
      ]),
      this.section('legendIcon', t('inspector.legend'), [
        this.row(t('inspector.legendPosition'), this.select('opt', 'legend', o.legend, [['top', t('pos.top'), 'chevronUp'], ['bottom', t('pos.bottom'), 'chevronDown'], ['left', t('pos.left'), 'chevronLeft'], ['right', t('pos.right'), 'chevronRight'], ['custom', t('pos.custom'), 'moveHandle'], ['none', t('pos.none'), 'close']], t('inspector.legendPosition'))),
        o.legend === 'custom' ? this.row(t('inspector.legendX'), this.range('legendX', o.legendX ?? 70, t('inspector.legendX'), 0, 100, 1, '%')) : '',
        o.legend === 'custom' ? this.row(t('inspector.legendY'), this.range('legendY', o.legendY ?? 12, t('inspector.legendY'), 0, 100, 1, '%')) : '',
        this.row(t('inspector.legendFontSize'), this.range('legendFontSize', o.legendFontSize ?? 12, t('inspector.legendFontSize'), 6, 40, 1, 'pt')),
        this.row(t('inspector.legendColor'), this.optColor('legendColor', o.legendColor, t('inspector.legendColor'))),
        this.row(t('inspector.legendSwatch'), this.segmented('legendSwatch', o.legendSwatch ?? 'square', [['square', t('swatch.square'), 'stop'], ['circle', t('swatch.circle'), 'dot'], ['line', t('swatch.line'), 'minus']], t('inspector.legendSwatch'))),
        this.row(t('inspector.legendBox'), this.toggle('legendBox', o.legendBox, t('inspector.legendBox'))),
        `<p class="ins-hint">${icon('info')}<span>${escapeHtml(t('inspector.legendDragHint'))}</span></p>`,
      ]),
      this.section('chartTheme', t('inspector.chartTheme'), [
        this.row(t('inspector.chartTheme'), this.select('opt', 'chartTheme', ct.id, CHART_THEMES.map((c) => [c.id, c[L], 'chartTheme']), t('inspector.chartTheme'))),
        `<div class="ins-theme-preview" title="${escapeHtml(t('chartTheme.hint'))}"><span class="ins-theme-paper" style="background:${ct.bg};color:${ct.text}${ct.font ? `;font-family:${escapeHtml(ct.font)}` : ''}">Aa</span><span class="ins-swatches">${palette(ct.palette).colors.slice(0, 8).map((c) => `<i style="background:${c}"></i>`).join('')}</span></div>`,
        `<p class="ins-hint">${icon('info')}<span>${escapeHtml(t('chartTheme.hint'))}</span></p>`,
      ]),
      this.section('palette', t('inspector.colors'), [
        `<div class="ins-row"><span class="ins-label">${escapeHtml(t('inspector.palette'))}</span><span class="ins-control"><button type="button" class="ins-palette" data-ins-action="palette" title="${escapeHtml(t('action.palette'))}"><span class="ins-swatches">${pal.colors.slice(0, 8).map((c) => `<i style="background:${c}"></i>`).join('')}</span><span>${escapeHtml(pal[L])}</span>${icon('chevronDown')}</button></span></div>`,
        this.row(t('inspector.background'), this.select('opt', 'background', bg, [['theme', t('bg.theme'), 'palette'], ['chart', t('bg.chart'), 'chartTheme'], ['white', t('bg.white'), 'whiteBg'], ['transparent', t('bg.transparent'), 'transparentBg'], ['custom', t('bg.custom'), 'fillColor']], t('inspector.background'))),
        bg === 'custom' ? this.row(t('inspector.backgroundColor'), this.color('backgroundColor', o.background, t('inspector.backgroundColor'))) : '',
        this.row(t('inspector.border'), this.toggle('border', o.border, t('inspector.border'))),
      ]),
      this.section('chartSize', t('inspector.plotArea'), [
        this.row(t('inspector.plotBackground'), this.optColor('plotBackground', o.plotBackground, t('inspector.plotBackground'), '#f8fafc')),
        this.row(t('inspector.plotBorder'), this.toggle('plotBorder', o.plotBorder, t('inspector.plotBorder'))),
        this.row(t('inspector.padding'), this.range('padding', o.padding ?? 16, t('inspector.padding'), 0, 120, 2, 'px')),
      ]),
      this.section('font', t('inspector.text'), [
        this.row(t('inspector.fontScale'), this.range('fontScale', o.fontScale, t('inspector.fontScale'), 0.6, 2, 0.05, '×')),
        this.row(t('inspector.fontFamily'), this.text('opt', 'fontFamily', o.fontFamily, t('inspector.fontFamily'), t('inspector.fontDefault'))),
        this.row(t('inspector.textScale'), this.range('textScale', o.textScale ?? 1, t('inspector.textScale'), 0.5, 3, 0.05, '×')),
        this.row(t('inspector.textColor'), this.optColor('textColor', o.textColor, t('inspector.textColor'))),
      ]),
    ].join('');
  }

  axesTab(doc) {
    const t = this.api.t;
    const o = doc.chart.options;
    const type = baseType(doc.chart.type);
    const cartesian = CARTESIAN.has(type);
    const radial = type === 'radar' || type === 'heatmap';
    const horizontal = HORIZONTAL.has(type);
    const numberRows = [
      this.row(t('inspector.numberFormat'), this.select('opt', 'numberFormat', o.numberFormat, [['auto', t('fmt.auto'), 'typeNumber'], ['plain', t('fmt.plain'), 'typeNumber'], ['compact', t('fmt.compact'), 'typeNumber'], ['percent', t('fmt.percent'), 'percent'], ['scientific', t('fmt.scientific'), 'typeNumber']], t('inspector.numberFormat'))),
      this.row(t('inspector.decimals'), this.select('opt', 'decimals', o.decimals, [[-1, t('fmt.autoDecimals')], [0, '0'], [1, '1'], [2, '2'], [3, '3'], [4, '4']], t('inspector.decimals'))),
      this.row(t('inspector.prefix'), this.text('opt', 'prefix', o.prefix, t('inspector.prefix'), '₩, $')),
      this.row(t('inspector.suffix'), this.text('opt', 'suffix', o.suffix, t('inspector.suffix'), '%, °C, kg')),
    ];
    if (!cartesian && !radial) return [this.section('typeNumber', t('inspector.numbers'), numberRows), `<p class="ins-hint">${icon('info')}<span>${escapeHtml(t('inspector.noAxes'))}</span></p>`].join('');
    return [
      cartesian ? this.section('axisIcon', t('inspector.axisTitles'), [
        this.row(horizontal ? t('inspector.categoryAxisTitle') : t('inspector.xTitle'), this.text('opt', 'xTitle', o.xTitle, t('inspector.xTitle'))),
        this.row(horizontal ? t('inspector.valueAxisTitle') : t('inspector.yTitle'), this.text('opt', 'yTitle', o.yTitle, t('inspector.yTitle'))),
        type === 'combo' || Object.values(o.seriesAxis ?? {}).includes('right') ? this.row(t('inspector.y2Title'), this.text('opt', 'y2Title', o.y2Title, t('inspector.y2Title'))) : '',
        this.row(t('inspector.showAxisTitles'), this.toggle('showAxisTitles', o.showAxisTitles !== false, t('inspector.showAxisTitles'))),
        this.row(t('inspector.axisTitleSize'), this.range('axisTitleSize', o.axisTitleSize ?? 12.5, t('inspector.axisTitleSize'), 6, 40, 0.5, 'pt')),
        this.row(t('inspector.axisTitleColor'), this.optColor('axisTitleColor', o.axisTitleColor, t('inspector.axisTitleColor'))),
        `<p class="ins-hint">${icon('info')}<span>${escapeHtml(t('inspector.axisTitleHint'))}</span></p>`,
      ]) : '',
      this.section('ruler', t('inspector.range'), [
        this.row(t('inspector.yMin'), this.number('yMin', o.yMin, t('inspector.yMin'), { placeholder: t('inspector.auto') })),
        this.row(t('inspector.yMax'), this.number('yMax', o.yMax, t('inspector.yMax'), { placeholder: t('inspector.auto') })),
        cartesian ? this.row(t('inspector.yStep'), this.number('yStep', o.yStep, t('inspector.yStep'), { min: 0, placeholder: t('inspector.auto') })) : '',
        cartesian ? this.row(t('inspector.beginAtZero'), this.toggle('beginAtZero', o.beginAtZero, t('inspector.beginAtZero'))) : '',
        cartesian ? this.row(t('inspector.yScale'), this.segmented('yScale', o.yScale, [['linear', t('scale.linear'), 'chartLine'], ['log', t('scale.log'), 'chartSpline']], t('inspector.yScale'))) : '',
        type === 'combo' ? this.row(t('inspector.secondAxis'), this.toggle('secondAxis', o.secondAxis, t('inspector.secondAxis'))) : '',
      ]),
      cartesian ? this.section('axisIcon', t('inspector.axisLook'), [
        this.row(t('inspector.axisColor'), this.optColor('axisColor', o.axisColor, t('inspector.axisColor'))),
        this.row(t('inspector.axisWidth'), this.range('axisWidth', o.axisWidth ?? 1, t('inspector.axisWidth'), 0, 6, 0.5, 'px')),
        this.row(t('inspector.tickColor'), this.optColor('tickColor', o.tickColor, t('inspector.tickColor'))),
        this.row(t('inspector.tickSize'), this.range('tickSize', o.tickSize ?? 11, t('inspector.tickSize'), 6, 30, 0.5, 'pt')),
        this.row(horizontal ? t('inspector.showCategoryLabels') : t('inspector.showXLabels'), this.toggle('showXLabels', o.showXLabels !== false, t('inspector.showXLabels'))),
        this.row(horizontal ? t('inspector.showValueLabels') : t('inspector.showYLabels'), this.toggle('showYLabels', o.showYLabels !== false, t('inspector.showYLabels'))),
      ]) : '',
      cartesian ? this.section('grid', t('inspector.gridAndLabels'), [
        this.row(t('inspector.gridLines'), this.toggle('gridLines', o.gridLines, t('inspector.gridLines'))),
        this.row(t('inspector.xGridLines'), this.toggle('xGridLines', o.xGridLines, t('inspector.xGridLines'))),
        this.row(t('inspector.gridColor'), this.optColor('gridColor', o.gridColor, t('inspector.gridColor'), '#e5e7eb')),
        this.row(t('inspector.gridWidth'), this.range('gridWidth', o.gridWidth ?? 1, t('inspector.gridWidth'), 0, 6, 0.5, 'px')),
        this.row(t('inspector.gridStyle'), this.select('opt', 'gridStyle', o.gridStyle ?? 'theme', [['theme', t('gridStyle.theme')], ['solid', t('gridStyle.solid')], ['dashed', t('gridStyle.dashed')], ['dotted', t('gridStyle.dotted')]], t('inspector.gridStyle'))),
        !horizontal ? this.row(t('inspector.labelAngle'), this.select('opt', 'xLabelAngle', o.xLabelAngle, [['auto', t('inspector.auto')], ['0', '0°'], ['45', '45°'], ['90', '90°']], t('inspector.labelAngle'))) : '',
      ]) : '',
      this.section('typeNumber', t('inspector.numbers'), numberRows),
    ].join('');
  }

  seriesTab(doc) {
    const t = this.api.t;
    const o = doc.chart.options;
    const type = baseType(doc.chart.type);
    const m = doc.chart.mapping;
    const byRow = BY_ROW.has(type) && type !== 'waterfall' && type !== 'gauge';
    const hidden = new Set((o.hidden ?? []).map(Number));
    // Value series of category charts can each be drawn their own way (a refused combination says why in a popup).
    const mixable = !byRow && CARTESIAN.has(type) && !['scatter', 'bubble', 'candlestick', 'histogram', 'boxplot', 'waterfall'].includes(type);
    let items;
    const view = chartTable(doc.table, doc.chart);
    const rawCol = (c) => (doc.chart.seriesIn === 'rows' ? null : c + (doc.chart.dataRange?.c0 ?? 0));
    if (byRow) items = labelsOf(view, m.category ?? null).slice(0, 60).map((name, i) => ({ name, i }));
    else if (type === 'bubble' && m.group != null) items = [...new Set(labelsOf(view, m.group))].map((name, i) => ({ name, i }));
    else items = (m.values ?? []).map((c, i) => ({ name: view.columns[c]?.name ?? '', i, col: rawCol(c), series: true }));
    const list = items.map((it) => `<div class="ins-series ${hidden.has(it.i) ? 'off' : ''}">
        ${this.color('', seriesColor(o, it.i), t('inspector.seriesColor', { name: it.name }), `data-series-color="${it.i}"`)}
        ${it.col != null ? `<input type="text" class="ins-series-name" data-rename-col="${it.col}" value="${escapeHtml(it.name)}" aria-label="${escapeHtml(t('inspector.seriesName'))}" spellcheck="false" />` : `<span class="ins-series-name">${escapeHtml(it.name)}</span>`}
        <button type="button" class="icon-button" data-series-toggle="${it.i}" title="${escapeHtml(t(hidden.has(it.i) ? 'inspector.show' : 'inspector.hide'))}" aria-pressed="${!hidden.has(it.i)}">${icon(hidden.has(it.i) ? 'deselect' : 'eye')}</button>
        ${o.colors?.[it.i] ? `<button type="button" class="icon-button" data-series-reset="${it.i}" title="${escapeHtml(t('inspector.resetColor'))}">${icon('refresh')}</button>` : ''}
      </div>${mixable && it.series ? `<div class="ins-series-mix">${this.select('series-kind', it.i, o.seriesTypes?.[it.i] ?? '', [['', t('kind.default')], ...SERIES_KINDS.map((k) => [k, t(`kind.${k}`), KIND_ICONS[k]])], t('inspector.drawAs', { name: it.name }))}${this.select('series-axis', it.i, o.seriesAxis?.[it.i] ?? 'left', [['left', t('axis.left'), 'chevronLeft'], ['right', t('axis.right'), 'chevronRight']], t('inspector.valueAxis', { name: it.name }))}</div>` : ''}`).join('');
    const lines = LINE_TYPES.has(type) || type === 'scatter' || type === 'bubble';
    const mixed = Object.keys(o.seriesTypes ?? {}).length || Object.values(o.seriesAxis ?? {}).includes('right');
    const bars = BAR_TYPES.has(type);
    return [
      this.section(byRow ? 'chartPie' : 'seriesIcon', byRow ? t('inspector.slices') : t('inspector.seriesList'), [items.length ? `<div class="ins-series-list">${list}</div>` : `<p class="ins-hint">${escapeHtml(t('inspector.noSeries'))}</p>`, Object.keys(o.colors ?? {}).length ? `<button type="button" class="small-button" data-ins-action="reset-colors">${icon('refresh')}<span>${escapeHtml(t('inspector.resetColors'))}</span></button>` : '']),
      lines ? this.section('chartLine', t('inspector.lines'), [
        type !== 'scatter' && type !== 'bubble' ? this.row(t('inspector.lineWidth'), this.range('lineWidth', o.lineWidth, t('inspector.lineWidth'), 0.5, 8, 0.5, 'px')) : '',
        this.row(t('inspector.markers'), this.toggle('markers', o.markers, t('inspector.markers'))),
        this.row(t('inspector.markerSize'), this.range('markerSize', o.markerSize, t('inspector.markerSize'), 1, 12, 0.5, 'px')),
        ['line', 'area', 'stackedArea', 'combo'].includes(type) ? this.row(t('inspector.smooth'), this.toggle('smooth', o.smooth, t('inspector.smooth'))) : '',
        ['area', 'stackedArea', 'percentArea', 'radar'].includes(type) ? this.row(t('inspector.areaOpacity'), this.range('areaOpacity', o.areaOpacity, t('inspector.areaOpacity'), 0.05, 1, 0.05)) : '',
        ['line', 'spline', 'scatter', 'combo'].includes(type) ? this.row(t('inspector.trendline'), this.toggle('trendline', o.trendline, t('inspector.trendline'))) : '',
      ]) : '',
      bars ? this.section('chartColumn', t('inspector.bars'), [
        this.row(t('inspector.barRadius'), this.range('barRadius', o.barRadius, t('inspector.barRadius'), 0, 20, 1, 'px')),
        type !== 'histogram' ? this.row(t('inspector.barGap'), this.range('barGap', o.barGap, t('inspector.barGap'), 0, 0.8, 0.02)) : '',
      ]) : '',
      mixable ? this.section('chartCombo', t('inspector.mixed'), [
        `<p class="ins-hint">${icon('info')}<span>${escapeHtml(t(canMix(doc.chart.type) ? 'inspector.mixedHint' : 'inspector.mixedNo'))}</span></p>`,
        mixed ? `<button type="button" class="small-button" data-ins-action="reset-mix">${icon('refresh')}<span>${escapeHtml(t('inspector.mixedReset'))}</span></button>` : '',
      ]) : '',
      this.section('fillColor', t('inspector.marks'), [
        this.row(t('inspector.markOpacity'), this.range('markOpacity', o.markOpacity ?? 1, t('inspector.markOpacity'), 0.05, 1, 0.05)),
        this.row(t('inspector.markStroke'), this.range('markStroke', o.markStroke ?? 0, t('inspector.markStroke'), 0, 6, 0.5, 'px')),
        this.row(t('inspector.markStrokeColor'), this.optColor('markStrokeColor', o.markStrokeColor, t('inspector.markStrokeColor'), '#1f2937')),
      ]),
      this.section('labelsIcon', t('inspector.dataLabels'), [
        this.row(t('inspector.showLabels'), this.toggle('dataLabels', o.dataLabels, t('inspector.showLabels'))),
        PIE_TYPES.has(type) ? this.row(t('inspector.labelPosition'), this.select('opt', 'labelPosition', o.labelPosition, [['auto', t('inspector.labelOutside')], ['inside', t('inspector.labelInside')]], t('inspector.labelPosition'))) : '',
      ]),
    ].join('');
  }

  moreTab(doc) {
    const t = this.api.t;
    const o = doc.chart.options;
    const type = baseType(doc.chart.type);
    const rows = [];
    if (['donut', 'halfDonut'].includes(type)) rows.push(this.row(t('inspector.innerRadius'), this.range('innerRadius', o.innerRadius, t('inspector.innerRadius'), 0.2, 0.9, 0.02)));
    if (['pie', 'donut', 'polarArea', 'sunburst'].includes(type)) rows.push(this.row(t('inspector.startAngle'), this.range('startAngle', o.startAngle, t('inspector.startAngle'), 0, 360, 5, '°')));
    if (PIE_TYPES.has(type)) rows.push(this.row(t('inspector.sliceGap'), this.range('sliceGap', o.sliceGap, t('inspector.sliceGap'), 0, 6, 0.5, 'px')));
    if (type === 'histogram') rows.push(this.row(t('inspector.bins'), this.number('bins', o.bins || '', t('inspector.bins'), { min: 0, max: 200, step: 1, placeholder: t('inspector.auto') })));
    if (type === 'heatmap') rows.push(this.row(t('inspector.ramp'), this.select('opt', 'ramp', o.ramp, RAMP_IDS.map((id) => [id, t(`ramp.${id}`)]), t('inspector.ramp'))), `<div class="ins-ramp" style="background:linear-gradient(90deg, ${RAMPS[o.ramp]?.join(', ')})"></div>`);
    if (['radialBar', 'activityRings', 'progressBars'].includes(type)) rows.push(this.row(t('inspector.gaugeMax'), this.number('gaugeMax', o.gaugeMax, t('inspector.gaugeMax'), { placeholder: t('inspector.auto') })));
    if (type === 'bollinger') rows.push(this.row(t('inspector.movingAverage'), this.number('movingAverage', o.movingAverage || '', t('inspector.movingAverage'), { min: 2, max: 60, step: 1, placeholder: '5' })));
    if (['gauge', 'gaugeGrid', 'linearGauge'].includes(type)) rows.push(this.row(t('inspector.gaugeMin'), this.number('gaugeMin', o.gaugeMin, t('inspector.gaugeMin'), { placeholder: '0' })), this.row(t('inspector.gaugeMax'), this.number('gaugeMax', o.gaugeMax, t('inspector.gaugeMax'), { placeholder: t('inspector.auto') })));
    if (type === 'waterfall') rows.push(this.row(t('inspector.waterfallTotal'), this.toggle('waterfallTotal', o.waterfallTotal, t('inspector.waterfallTotal'))));
    if (['waterfall', 'candlestick', 'gauge', 'divergingBar', 'linearGauge', 'bigNumber'].includes(type) || doc.chart.type === 'divergingBar') rows.push(this.row(t('inspector.upColor'), this.color('upColor', o.upColor, t('inspector.upColor'))), this.row(t('inspector.downColor'), this.color('downColor', o.downColor, t('inspector.downColor'))));
    return [
      rows.length ? this.section(chartType(doc.chart.type).icon, t('inspector.typeOptions', { name: chartType(doc.chart.type)[this.api.language()] }), rows) : `<p class="ins-hint">${icon('info')}<span>${escapeHtml(t('inspector.noTypeOptions'))}</span></p>`,
      this.section('chartSize', t('inspector.size'), [
        this.row(t('inspector.width'), this.number('width', o.width ?? '', t('inspector.width'), { min: 200, max: 8000, step: 10 })),
        this.row(t('inspector.height'), this.number('height', o.height ?? '', t('inspector.height'), { min: 150, max: 8000, step: 10 })),
        `<div class="ins-sizes">${[[800, 500], [1024, 640], [1280, 720], [1920, 1080], [1080, 1080], [1200, 630]].map(([w, h]) => `<button type="button" class="small-button" data-ins-size="${w}x${h}">${w}×${h}</button>`).join('')}</div>`,
      ]),
    ].join('');
  }

  // ───────────────────────── events

  onClick(event) {
    const tab = event.target.closest('[data-ins-tab]');
    if (tab) { this.api.onTab(tab.dataset.insTab); return; }
    const seg = event.target.closest('[data-seg]');
    if (seg) { this.api.onOption(seg.dataset.seg, seg.dataset.value); return; }
    const toggle = event.target.closest('[data-series-toggle]');
    if (toggle) {
      const i = Number(toggle.dataset.seriesToggle);
      const hidden = new Set((this.api.doc().chart.options.hidden ?? []).map(Number));
      if (hidden.has(i)) hidden.delete(i); else hidden.add(i);
      this.api.onOption('hidden', [...hidden]);
      return;
    }
    const reset = event.target.closest('[data-series-reset]');
    if (reset) { const colors = { ...this.api.doc().chart.options.colors }; delete colors[reset.dataset.seriesReset]; this.api.onOption('colors', colors); return; }
    const size = event.target.closest('[data-ins-size]');
    if (size) { const [w, h] = size.dataset.insSize.split('x').map(Number); this.api.onChart({ options: { width: w, height: h } }); return; }
    const action = event.target.closest('[data-ins-action]');
    if (action?.dataset.insAction === 'palette') this.api.onPalette(action);
    if (action?.dataset.insAction === 'reset-opt') this.api.onOption(action.dataset.key, '');
    if (action?.dataset.insAction === 'reset-mix') this.api.onChart({ options: { seriesTypes: {}, seriesAxis: {} } });
    if (action?.dataset.insAction === 'reset-colors') this.api.onOption('colors', {});
  }

  onInput(event, committed) {
    const el = event.target;
    const doc = this.api.doc();
    if (!doc) return;
    if (el.matches('[data-type]')) { if (committed) this.api.onType(el.value); return; }
    if (el.matches('[data-series-kind], [data-series-axis]')) {
      if (!committed) return;
      const kind = el.matches('[data-series-kind]');
      const i = el.dataset[kind ? 'seriesKind' : 'seriesAxis'];
      // A chart that cannot mix ways of drawing (pies, stacked or sideways charts …): say so, change nothing.
      if (!canMix(doc.chart.type) && (kind ? el.value !== '' : el.value === 'right')) { this.api.onCannotMix(doc.chart.type); this.render?.(); return; }
      const key = kind ? 'seriesTypes' : 'seriesAxis';
      const next = { ...(doc.chart.options[key] ?? {}) };
      if (el.value === '' || el.value === 'left') delete next[i]; else next[i] = el.value;
      this.api.onOption(key, next);
      return;
    }
    if (el.matches('[data-chart]')) { this.api.onChart({ [el.dataset.chart]: el.value }, `chart:${el.dataset.chart}`); return; }
    if (el.matches('[data-map]')) {
      if (!committed) return;
      const role = el.dataset.map;
      const value = el.value === '' ? null : Number(el.value);
      this.api.onMapping(role === 'values' ? { values: value == null ? [] : [value] } : { [role]: value });
      return;
    }
    if (el.matches('[data-value-col]')) {
      if (!committed) return;
      const c = Number(el.dataset.valueCol);
      const current = new Set(doc.chart.mapping.values ?? []);
      if (el.checked) current.add(c); else current.delete(c);
      this.api.onMapping({ values: [...current].sort((a, b) => a - b) });
      return;
    }
    if (el.matches('[data-series-color]')) {
      this.api.onOption('colors', { ...doc.chart.options.colors, [el.dataset.seriesColor]: el.value }, 'series-color', !committed);
      return;
    }
    if (el.matches('[data-rename-col]')) { if (committed) this.api.onRename(Number(el.dataset.renameCol), el.value); return; }
    if (!el.matches('[data-opt]')) return;
    const key = el.dataset.opt;
    if (key === 'chartTheme') { if (committed) this.api.onChartTheme(el.value); return; }
    let value;
    if (el.type === 'checkbox') value = el.checked;
    else if (el.type === 'range') { value = Number(el.value); const out = el.nextElementSibling; if (out) out.textContent = `${value}${/Angle/.test(key) ? '°' : /Width|Size|Radius|Gap$/.test(key) && key !== 'barGap' && key !== 'sliceGap' ? 'px' : key === 'fontScale' ? '×' : ''}`; }
    else if (el.type === 'number') { if (!committed && el.value === '') return; value = el.value === '' ? '' : Number(el.value); }
    else if (key === 'background' && el.value === 'custom') value = '#f8fafc';
    else if (key === 'backgroundColor') { this.api.onOption('background', el.value, 'bg-color', !committed); return; }
    else value = key === 'decimals' ? Number(el.value) : el.value;
    if (el.type === 'text' || el.type === 'range' || el.type === 'color') this.api.onOption(key, value, `opt:${key}`, !committed);
    else if (committed) this.api.onOption(key, value);
  }
}
