// The capture tab: display filter bar; the navigator (left), the packet list with details and bytes
// below it (stacked or side by side), the Problems / Log / Analysis panel (bottom) and the network map
// (right). Every panel has a title bar with a fold button; the side panels fold to a slim rail, the
// bottom panel and the details / bytes panes to their title bar. Splitters between them; the shares
// and widths are settings.
import { escapeHtml } from '../ui/dom.js';
import { icon } from '../icons.js';
import { PacketList } from './packetlist.js';
import { DetailsTree } from './details.js';
import { BytesPane } from './bytes.js';
import { NetMap } from './netmap.js';
import { BottomPanel, NavigatorPanel } from './panels.js';

/** The fold icons: the same pictures as the panel buttons in the title row. */
export const FOLD_ICONS = { left: 'panelLeft', map: 'panelRight', bottom: 'panelBottom', details: 'panelBottom', bytes: 'panelBottom' };

export class CaptureView {
  /**
   * app: { t, settings(), updateSettings(patch, opts), doc(), filterState(), list: {...PacketList callbacks},
   *        details: {...}, bytes: {...}, map: {...}, nav: {...}, bottom: {...}, onFold(which),
   *        onFilterInput(text), onFilterApply(text), onFilterAction(kind, element), expanded }
   */
  constructor(host, app) {
    this.host = host;
    this.app = app;
    const fold = (which) => `<button class="icon-button pane-fold" data-fold="${which}">${icon(FOLD_ICONS[which])}</button>`;
    host.innerHTML = `<div class="cap-view">
      <div class="cap-filterbar" role="search"></div>
      <div class="cap-main">
        <div class="pane-rail rail-left" data-rail="left">${fold('left')}<span class="rail-title" data-pane-title="left"></span></div>
        <section class="pane pane-left" aria-label="navigator"><header class="pane-head">${icon('launcher')}<span class="pane-title" data-pane-title="left"></span><span class="grow"></span>${fold('left')}</header><div class="nav-body"></div></section>
        <div class="splitter vertical side-split" data-pane-split="left" role="separator" aria-orientation="vertical"></div>
        <div class="cap-center">
          <div class="cap-panes">
            <section class="pane pane-list" aria-label="list"></section>
            <div class="splitter horizontal pane-split" data-pane-split="list" role="separator" aria-orientation="horizontal"></div>
            <div class="cap-lower">
              <section class="pane pane-details" aria-label="details"><header class="pane-head">${icon('paneDetails')}<span class="pane-title" data-pane-title="details"></span><span class="grow"></span>${fold('details')}</header><div class="pane-body"></div></section>
              <div class="splitter pane-split lower-split" data-pane-split="details" role="separator"></div>
              <section class="pane pane-bytes" aria-label="bytes"><header class="pane-head">${icon('paneBytes')}<span class="pane-title" data-pane-title="bytes"></span><span class="grow"></span>${fold('bytes')}</header><div class="pane-body"></div></section>
            </div>
          </div>
          <div class="splitter horizontal bottom-split" data-pane-split="bottom" role="separator" aria-orientation="horizontal"></div>
          <section class="pane pane-bottom" aria-label="problems"><header class="pane-head">${icon('expertInfo')}<span class="bottom-tools"></span><span class="grow"></span>${fold('bottom')}</header><div class="bottom-body"></div></section>
        </div>
        <div class="splitter vertical map-split" data-pane-split="map" role="separator" aria-orientation="vertical"></div>
        <section class="pane pane-map" aria-label="map"></section>
        <div class="pane-rail rail-right" data-rail="map">${fold('map')}<span class="rail-title" data-pane-title="map"></span></div>
      </div>
    </div>`;
    this.root = host.querySelector('.cap-view');
    this.filterBar = host.querySelector('.cap-filterbar');
    this.list = new PacketList(host.querySelector('.pane-list'), app.list);
    this.details = new DetailsTree(host.querySelector('.pane-details .pane-body'), app.details);
    this.bytes = new BytesPane(host.querySelector('.pane-bytes .pane-body'), app.bytes);
    this.map = new NetMap(host.querySelector('.pane-map'), app.map);
    this.nav = new NavigatorPanel(host.querySelector('.pane-left'), app.nav);
    this.bottom = new BottomPanel(host.querySelector('.pane-bottom'), app.bottom);
    this.root.addEventListener('click', (event) => {
      const button = event.target.closest('[data-fold]');
      if (button) { event.stopPropagation(); app.onFold(button.dataset.fold); }
    });
    this.bindSplitters();
    this.bindFilterBar();
    this.applyLayout();
    this.renderFilterBar();
  }

  destroy() {
    this.list.destroy();
    this.details.destroy();
    this.bytes.destroy();
    this.map.destroy();
    this.nav = null;
    this.bottom = null;
    this.host.innerHTML = '';
  }

  applyLayout() {
    const s = this.app.settings();
    const t = this.app.t;
    const r = this.root;
    r.dataset.layout = s.paneLayout;
    r.classList.toggle('no-filterbar', !s.showFilterBar);
    r.classList.toggle('no-list', !s.showPacketList);
    r.classList.toggle('fold-details', !s.showDetails);
    r.classList.toggle('fold-bytes', !s.showBytes);
    r.classList.toggle('fold-map', !s.showNetMap);
    r.classList.toggle('fold-left', !s.showLeftPanel);
    r.classList.toggle('fold-bottom', !s.showBottomPanel);
    r.style.setProperty('--list-share', `${s.listShare}%`);
    r.style.setProperty('--details-share', `${s.detailsShare}%`);
    r.style.setProperty('--map-width', `${s.mapWidth}px`);
    r.style.setProperty('--left-width', `${s.leftWidth}px`);
    r.style.setProperty('--bottom-height', `${s.bottomHeight}px`);
    r.style.setProperty('--text-zoom', String(s.textZoom / 100));
    const titles = { left: t('panel.navigator'), map: t('netmap.title'), details: t('action.paneDetails'), bytes: t('action.paneBytes') };
    for (const el of r.querySelectorAll('[data-pane-title]')) el.textContent = titles[el.dataset.paneTitle] ?? '';
    const shown = { left: s.showLeftPanel, map: s.showNetMap, bottom: s.showBottomPanel, details: s.showDetails, bytes: s.showBytes };
    const names = { left: t('panel.navigator'), map: t('netmap.title'), bottom: t('panel.bottom'), details: t('action.paneDetails'), bytes: t('action.paneBytes') };
    for (const button of r.querySelectorAll('[data-fold]')) {
      const which = button.dataset.fold;
      const tip = t(shown[which] ? 'panel.fold' : 'panel.unfold', { name: names[which] });
      button.title = tip;
      button.setAttribute('aria-label', tip);
      button.setAttribute('aria-expanded', String(Boolean(shown[which])));
    }
    // The map's own title bar carries a fold button too (views/netmap.js draws that bar).
    const mapTools = r.querySelector('.nm-tools');
    if (mapTools && !mapTools.querySelector('[data-fold]')) mapTools.insertAdjacentHTML('beforeend', `<button class="icon-button pane-fold" data-fold="map">${icon(FOLD_ICONS.map)}</button>`);
  }

  /** Everything again (another doc, columns or settings changed). */
  refresh({ keepNode = true } = {}) {
    this.applyLayout();
    this.renderFilterBar();
    this.list.render();
    this.showSelected({ keepNode });
    this.renderPanels();
  }

  /** The navigator and the bottom panel (after the analysis or the log changed). */
  renderPanels() {
    this.nav.render();
    this.bottom.render();
    this.applyLayout();
  }

  showSelected({ keepNode = true } = {}) {
    const doc = this.app.doc();
    const d = doc && doc.selected >= 0 ? doc.dissection(doc.selected) : null;
    this.details.show(d, { keepNode });
    this.bytes.show(d);
    if (this.details.selected) this.bytes.highlight(this.details.selected);
  }

  // ───────────────────────── display filter bar

  renderFilterBar() {
    const t = this.app.t;
    const f = this.app.filterState();
    const input = this.filterBar.querySelector('.df-input');
    const keep = input && document.activeElement === input ? { value: input.value, start: input.selectionStart, end: input.selectionEnd } : null;
    this.filterBar.innerHTML = `
      <button class="tool-button df-bookmark" data-df="bookmarks" title="${escapeHtml(t('filter.bookmarks'))}" aria-label="${escapeHtml(t('filter.bookmarks'))}" aria-haspopup="true">${icon('filterBookmark')}</button>
      <div class="df-field ${f.status}" title="${escapeHtml(f.error || t('filter.tip'))}">
        ${icon('filterApply', 'icon df-icon')}
        <input class="df-input" type="text" spellcheck="false" autocomplete="off" value="${escapeHtml(keep?.value ?? f.text)}" placeholder="${escapeHtml(t('filter.placeholder'))}" aria-label="${escapeHtml(t('filter.placeholder'))}" aria-invalid="${f.status === 'invalid'}" />
        <button class="icon-button df-clear" data-df="clear" title="${escapeHtml(t('filter.clear'))}" aria-label="${escapeHtml(t('filter.clear'))}" ${f.text || f.applied ? '' : 'hidden'}>${icon('close')}</button>
        <button class="icon-button df-apply" data-df="apply" title="${escapeHtml(t('filter.apply'))}" aria-label="${escapeHtml(t('filter.apply'))}">${icon('goForward')}</button>
        <button class="icon-button df-recent" data-df="recent" title="${escapeHtml(t('filter.recent'))}" aria-label="${escapeHtml(t('filter.recent'))}" aria-haspopup="true">${icon('chevronDown')}</button>
      </div>
      <button class="tool-button" data-df="expression" title="${escapeHtml(t('action.filterExpression'))}" aria-label="${escapeHtml(t('action.filterExpression'))}">${icon('filterExpression')}</button>
      <span class="df-buttons">${f.buttons.map((b, i) => `<button class="small-button df-saved" data-df="saved" data-index="${i}" title="${escapeHtml(b.filter)}">${icon('filterApply')}<span>${escapeHtml(t(`filterDefault.${b.name}`, null, b.name))}</span></button>`).join('')}</span>
      <div class="df-suggest" hidden role="listbox"></div>
      ${f.applied ? `<span class="df-state" title="${escapeHtml(t('filter.appliedTip'))}">${icon('filterApply')}<span>${escapeHtml(t('filter.applied', { shown: f.shown, total: f.total }))}</span></span>` : ''}`;
    if (keep) {
      const next = this.filterBar.querySelector('.df-input');
      next.focus();
      next.setSelectionRange(keep.start, keep.end);
    }
  }

  setFilterStatus(status, error = '') {
    const field = this.filterBar.querySelector('.df-field');
    if (!field) return;
    field.classList.remove('valid', 'invalid', 'deprecated', 'empty');
    field.classList.add(status);
    field.title = error || this.app.t('filter.tip');
    field.querySelector('.df-input')?.setAttribute('aria-invalid', String(status === 'invalid'));
  }

  focusFilter() {
    const input = this.filterBar.querySelector('.df-input');
    input?.focus();
    input?.select();
  }

  filterText() { return this.filterBar.querySelector('.df-input')?.value ?? ''; }

  setFilterText(text) {
    const input = this.filterBar.querySelector('.df-input');
    if (input) input.value = text;
    this.app.onFilterInput(text);
  }

  showSuggestions(items, prefixStart) {
    const box = this.filterBar.querySelector('.df-suggest');
    if (!box) return;
    this.suggest = { items, index: -1, prefixStart };
    box.hidden = !items.length;
    box.innerHTML = items.map((item, i) => `<div class="df-option" role="option" data-option="${i}"><code>${escapeHtml(item.abbrev)}</code><span>${escapeHtml(item.name ?? '')}</span></div>`).join('');
  }

  hideSuggestions() {
    const box = this.filterBar.querySelector('.df-suggest');
    if (box) box.hidden = true;
    this.suggest = null;
  }

  acceptSuggestion(i) {
    const input = this.filterBar.querySelector('.df-input');
    const item = this.suggest?.items[i];
    if (!input || !item) return;
    const caret = input.selectionStart;
    const before = input.value.slice(0, this.suggest.prefixStart);
    const after = input.value.slice(caret);
    input.value = `${before}${item.abbrev}${after.startsWith(' ') ? '' : ' '}${after}`;
    const pos = before.length + item.abbrev.length + 1;
    input.setSelectionRange(pos, pos);
    this.hideSuggestions();
    this.app.onFilterInput(input.value);
  }

  bindFilterBar() {
    const bar = this.filterBar;
    bar.addEventListener('input', (event) => {
      if (!event.target.classList.contains('df-input')) return;
      this.app.onFilterInput(event.target.value, event.target.selectionStart);
    });
    bar.addEventListener('keydown', (event) => {
      if (!event.target.classList.contains('df-input')) return;
      const sug = this.suggest;
      if (sug && !bar.querySelector('.df-suggest').hidden) {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          sug.index = (sug.index + (event.key === 'ArrowDown' ? 1 : -1) + sug.items.length) % sug.items.length;
          bar.querySelectorAll('.df-option').forEach((el, i) => el.classList.toggle('active', i === sug.index));
          return;
        }
        if ((event.key === 'Tab' || event.key === 'Enter') && sug.index >= 0) { event.preventDefault(); this.acceptSuggestion(sug.index); return; }
        if (event.key === 'Escape') { event.preventDefault(); this.hideSuggestions(); return; }
      }
      if (event.key === 'Enter') { event.preventDefault(); this.hideSuggestions(); this.app.onFilterApply(event.target.value); }
      if (event.key === 'Escape') { event.preventDefault(); this.hideSuggestions(); event.target.blur(); this.list.focus(); }
    });
    bar.addEventListener('focusout', () => setTimeout(() => { if (!bar.contains(document.activeElement)) this.hideSuggestions(); }, 120));
    bar.addEventListener('pointerdown', (event) => {
      const option = event.target.closest('[data-option]');
      if (option) { event.preventDefault(); this.acceptSuggestion(Number(option.dataset.option)); }
    });
    bar.addEventListener('click', (event) => {
      const button = event.target.closest('[data-df]');
      if (!button) return;
      const kind = button.dataset.df;
      if (kind === 'apply') this.app.onFilterApply(this.filterText());
      else if (kind === 'clear') { this.setFilterText(''); this.app.onFilterApply(''); }
      else if (kind === 'saved') this.app.onFilterAction('saved', button, Number(button.dataset.index));
      else this.app.onFilterAction(kind, button);
    });
  }

  // ───────────────────────── splitters

  bindSplitters() {
    this.root.addEventListener('pointerdown', (event) => {
      const split = event.target.closest('[data-pane-split]');
      if (!split || event.button !== 0) return;
      event.preventDefault();
      const which = split.dataset.paneSplit;
      const panes = this.root.querySelector('.cap-panes').getBoundingClientRect();
      const lower = this.root.querySelector('.cap-lower').getBoundingClientRect();
      const main = this.root.querySelector('.cap-main').getBoundingClientRect();
      const center = this.root.querySelector('.cap-center').getBoundingClientRect();
      const side = this.app.settings().paneLayout !== 'stack';
      const bytesFirst = this.app.settings().paneLayout === 'bytes-right';
      split.setPointerCapture?.(event.pointerId);
      const move = (e) => {
        if (which === 'map') this.app.updateSettings({ mapWidth: Math.round(Math.max(260, Math.min(main.width - 400, main.right - e.clientX))) }, { quiet: true });
        else if (which === 'left') this.app.updateSettings({ leftWidth: Math.round(Math.max(180, Math.min(main.width - 400, e.clientX - main.left))) }, { quiet: true });
        else if (which === 'bottom') this.app.updateSettings({ bottomHeight: Math.round(Math.max(90, Math.min(center.height - 160, center.bottom - e.clientY))) }, { quiet: true });
        else if (which === 'list') this.app.updateSettings({ listShare: Math.max(10, Math.min(85, Math.round(((e.clientY - panes.top) / panes.height) * 100))) }, { quiet: true });
        else {
          let share = side ? ((e.clientX - lower.left) / lower.width) * 100 : ((e.clientY - lower.top) / lower.height) * 100;
          if (bytesFirst) share = 100 - share;
          this.app.updateSettings({ detailsShare: Math.max(8, Math.min(90, Math.round(share))) }, { quiet: true });
        }
        this.applyLayout();
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        this.app.updateSettings({}, { quiet: true });
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  }
}
