// The side and bottom panels of a capture tab.
//   Left  — navigator: protocols, top talkers and findings of the capture (a click filters the packets).
//   Bottom — Problems (expert information), Log (what the app did) and Analysis (automatic findings),
//            with Report… to save or print them.
// Both draw from the capture's analysis (domain/analysis/findings.js), made by the app in slices.
import { escapeHtml } from '../ui/dom.js';
import { icon } from '../icons.js';

const SEV_ICON = { error: 'error', warn: 'warning', note: 'info', chat: 'comment', info: 'check' };
const fmtBytes = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n >= 1e3 ? `${(n / 1e3).toFixed(1)} kB` : `${n} B`);
const v = (address) => (String(address).includes(':') && String(address).split(':').length > 6 ? 'eth' : String(address).includes(':') ? 'ipv6' : 'ip');

/** A panel title bar: icon, title, extra tools, and the fold button (same icons as the title row). */
export function panelHead(glyph, title, foldIcon, foldTip, extra = '', foldKey = '') {
  return `<header class="pane-head">${icon(glyph)}<span class="pane-title">${escapeHtml(title)}</span><span class="grow"></span>${extra}<button class="icon-button pane-fold" data-fold="${foldKey}" title="${escapeHtml(foldTip)}" aria-label="${escapeHtml(foldTip)}">${icon(foldIcon)}</button></header>`;
}

export class NavigatorPanel {
  /** app: { t, analysis(), onFilter(filter), onFold() } */
  constructor(host, app) {
    this.host = host;
    this.app = app;
    this.open = new Set(['protocols', 'talkers', 'findings']);
    host.addEventListener('click', (event) => {
      const section = event.target.closest('[data-nav-section]');
      if (section) { const id = section.dataset.navSection; if (this.open.has(id)) this.open.delete(id); else this.open.add(id); this.render(); return; }
      const item = event.target.closest('[data-nav-filter]');
      if (item) app.onFilter(item.dataset.navFilter);
    });
  }

  render() {
    const t = this.app.t;
    const a = this.app.analysis();
    const section = (id, glyph, title, count, body) => `<section class="nav-section ${this.open.has(id) ? 'open' : ''}">
      <button class="nav-section-head" data-nav-section="${id}" aria-expanded="${this.open.has(id)}">${icon(this.open.has(id) ? 'caretDown' : 'caretRight', 'icon tiny')}${icon(glyph)}<span>${escapeHtml(title)}</span><span class="grow"></span><span class="nav-count">${count}</span></button>
      ${this.open.has(id) ? `<div class="nav-items">${body}</div>` : ''}</section>`;
    const item = (glyph, label, value, filter, extra = '') => `<button class="nav-item ${extra}" data-nav-filter="${escapeHtml(filter ?? '')}" title="${escapeHtml(filter ? `${label}\n${filter}` : label)}" ${filter ? '' : 'disabled'}>${icon(glyph)}<span class="nav-label">${escapeHtml(label)}</span><span class="nav-value">${escapeHtml(value)}</span></button>`;
    let body;
    if (!a) body = `<div class="nav-empty">${icon('hourglass')}<span>${escapeHtml(t('stats.loading'))}</span></div>`;
    else {
      const total = Math.max(1, a.overview.packets);
      body = [
        section('findings', 'expertInfo', t('panel.findings'), a.findings.length, a.findings.map((f) => item(SEV_ICON[f.severity] ?? 'info', t(`finding.${f.key}.title`, f.params), f.count ? String(f.count) : '', f.filter, `sev-${f.severity}`)).join('')),
        section('protocols', 'protocolHierarchy', t('panel.protocols'), a.overview.protocols.length, a.overview.protocols.slice(0, 40).map((p) => item('packet', p.name || '?', `${((p.packets / total) * 100).toFixed(1)}%`, p.name ? String(p.name).toLowerCase().replace(/[^a-z0-9.]/g, '') : null)).join('')),
        section('talkers', 'endpoints', t('panel.talkers'), a.overview.talkers.length, a.overview.talkers.map((x) => item('netHost', x.address, fmtBytes(x.bytes), `${v(x.address)}.addr == ${x.address}`)).join('')),
      ].join('');
    }
    this.host.querySelector('.nav-body').innerHTML = body;
  }
}

export class BottomPanel {
  /** app: { t, settings(), updateSettings(patch, opts), analysis(), log(), onSelectPacket(no), onFilter(filter), onReport(), onClearLog() } */
  constructor(host, app) {
    this.host = host;
    this.app = app;
    this.query = '';
    this.severity = 'all';
    host.addEventListener('click', (event) => {
      const tab = event.target.closest('[data-bottom-tab]');
      if (tab) { app.updateSettings({ bottomTab: tab.dataset.bottomTab }, { quiet: true }); this.render(); return; }
      const sev = event.target.closest('[data-bottom-sev]');
      if (sev) { this.severity = sev.dataset.bottomSev; this.render(); return; }
      const action = event.target.closest('[data-bottom-action]');
      if (action) { if (action.dataset.bottomAction === 'report') app.onReport(); else if (action.dataset.bottomAction === 'clear-log') app.onClearLog(); return; }
      const row = event.target.closest('[data-bottom-no]');
      if (row) app.onSelectPacket(Number(row.dataset.bottomNo));
      const filter = event.target.closest('[data-bottom-filter]');
      if (filter && filter.dataset.bottomFilter) app.onFilter(filter.dataset.bottomFilter);
    });
    host.addEventListener('input', (event) => {
      if (!event.target.matches('[data-bottom-query]')) return;
      this.query = event.target.value;
      const caret = event.target.selectionStart;
      this.renderBody();
      const input = host.querySelector('[data-bottom-query]');
      input?.focus();
      input?.setSelectionRange(caret, caret);
    });
  }

  tab() { return this.app.settings().bottomTab ?? 'problems'; }

  /** The tab strip and tools (in the panel's title bar). */
  headTools() {
    const t = this.app.t;
    const a = this.app.analysis();
    const tabs = [
      ['problems', 'expertInfo', t('panel.problems'), a ? a.overview.problemCount : ''],
      ['log', 'notes', t('panel.log'), this.app.log().length],
      ['analysis', 'ioGraph', t('panel.analysis'), a ? a.findings.length : ''],
    ];
    return `<span class="bottom-tabs" role="tablist">${tabs.map(([id, glyph, label, count]) => `<button class="bottom-tab ${this.tab() === id ? 'active' : ''}" data-bottom-tab="${id}" role="tab" aria-selected="${this.tab() === id}" title="${escapeHtml(count !== '' ? `${label} (${count})` : label)}">${icon(glyph)}<span class="bottom-tab-label">${escapeHtml(label)}</span>${count !== '' ? `<span class="nav-count">${count}</span>` : ''}</button>`).join('')}</span>
      <button class="small-button bottom-report" data-bottom-action="report" title="${escapeHtml(t('action.report'))}">${icon('reportHtml')}<span class="bottom-tab-label">${escapeHtml(t('panel.report'))}</span></button>`;
  }

  render() {
    const tools = this.host.querySelector('.pane-head .bottom-tools');
    if (tools) tools.innerHTML = this.headTools();
    this.renderBody();
  }

  renderBody() {
    const t = this.app.t;
    const a = this.app.analysis();
    const body = this.host.querySelector('.bottom-body');
    const q = this.query.trim().toLowerCase();
    const search = `<span class="net-search">${icon('search')}<input type="text" data-bottom-query value="${escapeHtml(this.query)}" placeholder="${escapeHtml(t('stats.search'))}" /></span>`;
    if (this.tab() === 'log') {
      const rows = this.app.log().filter((x) => !q || x.text.toLowerCase().includes(q)).slice(-1000).reverse();
      body.innerHTML = `<div class="bottom-bar">${search}<span class="grow"></span><button class="small-button" data-bottom-action="clear-log">${icon('clearHistory')}<span>${escapeHtml(t('panel.clearLog'))}</span></button></div>
        <div class="bottom-list">${rows.length ? `<table class="net-table"><thead><tr><th>${escapeHtml(t('report.time'))}</th><th>${escapeHtml(t('report.level'))}</th><th>${escapeHtml(t('report.message'))}</th></tr></thead><tbody>${rows.map((x) => `<tr class="lv-${x.level}"><td>${escapeHtml(new Date(x.time).toLocaleTimeString())}</td><td>${icon(x.level === 'error' ? 'error' : x.level === 'success' ? 'check' : 'info')}${escapeHtml(t(`log.${x.level}`, null, x.level))}</td><td>${escapeHtml(x.text)}</td></tr>`).join('')}</tbody></table>` : `<div class="nav-empty">${icon('info')}<span>${escapeHtml(t('panel.noLog'))}</span></div>`}</div>`;
      return;
    }
    if (!a) { body.innerHTML = `<div class="nav-empty">${icon('hourglass')}<span>${escapeHtml(t('stats.loading'))}</span></div>`; return; }
    if (this.tab() === 'analysis') {
      const o = a.overview;
      const cards = [
        [t('report.packets'), o.packets], [t('report.bytes'), fmtBytes(o.bytes)], [t('report.duration'), `${o.duration.toFixed(2)} s`],
        [t('expert.error'), o.severities.error], [t('expert.warn'), o.severities.warn], [t('panel.findings'), a.findings.length],
      ];
      body.innerHTML = `<div class="analysis-kpis">${cards.map(([k, val]) => `<div class="kpi"><span>${escapeHtml(k)}</span><b>${escapeHtml(val)}</b></div>`).join('')}</div>
        <div class="bottom-list"><table class="net-table"><thead><tr><th>${escapeHtml(t('report.severity'))}</th><th>${escapeHtml(t('report.finding'))}</th><th>${escapeHtml(t('report.detail'))}</th><th class="num">${escapeHtml(t('report.count'))}</th></tr></thead><tbody>
        ${a.findings.map((f) => `<tr class="sev-${f.severity}" data-bottom-filter="${escapeHtml(f.filter ?? '')}" title="${escapeHtml(f.filter ? t('panel.clickFilter', { filter: f.filter }) : '')}"><td>${icon(SEV_ICON[f.severity] ?? 'info')}${escapeHtml(t(`severity.${f.severity}`))}</td><td>${escapeHtml(t(`finding.${f.key}.title`, f.params))}</td><td>${escapeHtml(t(`finding.${f.key}.detail`, f.params))}</td><td class="num">${f.count}</td></tr>`).join('')}
        </tbody></table></div>`;
      return;
    }
    const sevs = ['all', 'error', 'warn', 'note', 'chat'];
    const list = a.problems.filter((x) => (this.severity === 'all' || x.severity === this.severity) && (!q || `${x.message} ${x.group} ${x.protocol}`.toLowerCase().includes(q)));
    const shown = list.slice(0, 2000);
    body.innerHTML = `<div class="bottom-bar"><span class="segmented">${sevs.map((s) => `<button class="segment ${this.severity === s ? 'active' : ''}" data-bottom-sev="${s}">${s === 'all' ? icon('list') : icon(SEV_ICON[s])}<span>${escapeHtml(s === 'all' ? t('panel.all') : t(`expert.${s}`))}</span><span class="nav-count">${s === 'all' ? a.problems.length : a.overview.severities[s] ?? 0}</span></button>`).join('')}</span>${search}</div>
      <div class="bottom-list">${shown.length ? `<table class="net-table"><thead><tr><th class="num">${escapeHtml(t('column.no'))}</th><th>${escapeHtml(t('report.severity'))}</th><th>${escapeHtml(t('report.group'))}</th><th>${escapeHtml(t('column.protocol'))}</th><th>${escapeHtml(t('report.message'))}</th></tr></thead><tbody>
      ${shown.map((x) => `<tr class="sev-${x.severity}" data-bottom-no="${x.no}"><td class="num">${x.no}</td><td>${icon(SEV_ICON[x.severity] ?? 'info')}${escapeHtml(t(`expert.${x.severity}`))}</td><td>${escapeHtml(x.group)}</td><td>${escapeHtml(x.protocol)}</td><td>${escapeHtml(x.message)}</td></tr>`).join('')}
      </tbody></table>${list.length > shown.length ? `<div class="muted net-more">${escapeHtml(t('stats.more', { count: list.length - shown.length }))}</div>` : ''}` : `<div class="nav-empty">${icon('check')}<span>${escapeHtml(t('panel.noProblems'))}</span></div>`}</div>`;
  }
}
