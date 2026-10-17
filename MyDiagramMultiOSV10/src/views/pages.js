// Pages view: a thumbnail of every page (foreground pages, then background
// pages) with its size and shape count. Click to open, double-click to go to
// the drawing, drag to reorder; buttons to add, duplicate, rename and delete.
import { icon } from '../icons.js';
import { escapeHtml } from '../ui/dom.js';
import { formatLength, isConnector } from '../domain/diagram.js';
import { renderPageSvg } from '../render/svg.js';

export class PagesView {
  constructor(app, host) {
    this.app = app;
    this.host = host;
    host.classList.add('pages-view');
    host.addEventListener('click', (event) => {
      const action = event.target.closest('[data-pages-action]');
      if (action) { this.app.goToPage(action.dataset.page, { keepView: true }); this.app.run(action.dataset.pagesAction); return; }
      const card = event.target.closest('[data-page]');
      if (!card) return;
      // Double-click: handled on its second click. Every click re-renders the cards, so a
      // 'dblclick' listener never fired (its target had already left the page).
      if (event.detail >= 2) { this.app.goToPage(card.dataset.page); this.app.switchView('drawing'); return; }
      this.app.goToPage(card.dataset.page, { keepView: true });
      this.render();
    });
    host.addEventListener('contextmenu', (event) => {
      const card = event.target.closest('[data-page]');
      event.preventDefault();
      if (card) this.app.goToPage(card.dataset.page, { keepView: true });
      this.app.contextMenu(event, 'pageTab', { pageId: card?.dataset.page ?? null });
    });
    host.addEventListener('dragstart', (event) => {
      const card = event.target.closest('[data-page]');
      if (card) event.dataTransfer.setData('application/x-mydiagram-page', card.dataset.page);
    });
    host.addEventListener('dragover', (event) => { if ([...event.dataTransfer.types].includes('application/x-mydiagram-page')) event.preventDefault(); });
    host.addEventListener('drop', (event) => {
      const id = event.dataTransfer.getData('application/x-mydiagram-page');
      const card = event.target.closest('[data-page]');
      if (!id || !card || card.dataset.page === id) return;
      event.preventDefault();
      this.app.movePageTo(id, this.app.doc().doc.pages.findIndex((page) => page.id === card.dataset.page));
    });
  }

  render() {
    const t = this.app.t;
    const doc = this.app.doc().doc;
    const current = this.app.page()?.id;
    const card = (page) => {
      const { svg } = renderPageSvg(doc, page, { measure: this.app.measure, language: this.app.language() });
      const shapes = page.shapes.filter((s) => !isConnector(s) && s.type !== 'group').length;
      const connectors = page.shapes.filter(isConnector).length;
      const background = page.backgroundId ? doc.pages.find((p) => p.id === page.backgroundId)?.name : '';
      return `<article class="page-card ${page.id === current ? 'active' : ''} ${page.background ? 'background' : ''}" data-page="${escapeHtml(page.id)}" draggable="true" title="${escapeHtml(page.name)}">
        <div class="page-thumb">${svg.replace('<svg ', '<svg preserveAspectRatio="xMidYMid meet" ').replace(/ width="\d+" height="\d+"/, ' width="100%" height="100%"')}</div>
        <div class="page-card-info">
          <b>${page.background ? icon('pageBg', 'icon tiny') : ''}${escapeHtml(page.name)}</b>
          <small>${escapeHtml(formatLength(page.width, doc.units))} × ${escapeHtml(formatLength(page.height, doc.units))} · ${escapeHtml(t('pages.counts', { shapes, connectors }))}</small>
          ${background ? `<small class="muted">${escapeHtml(t('pages.uses', { name: background }))}</small>` : ''}
        </div>
        <div class="page-card-actions">
          <button class="icon-button" data-pages-action="pageDuplicate" data-page="${escapeHtml(page.id)}" title="${escapeHtml(t('action.pageDuplicate'))}" aria-label="${escapeHtml(t('action.pageDuplicate'))}">${icon('pageDuplicate')}</button>
          <button class="icon-button" data-pages-action="pageRename" data-page="${escapeHtml(page.id)}" title="${escapeHtml(t('action.pageRename'))}" aria-label="${escapeHtml(t('action.pageRename'))}">${icon('pageRename')}</button>
          <button class="icon-button" data-pages-action="pageDelete" data-page="${escapeHtml(page.id)}" title="${escapeHtml(t('action.pageDelete'))}" aria-label="${escapeHtml(t('action.pageDelete'))}" ${doc.pages.length < 2 ? 'disabled' : ''}>${icon('trash')}</button>
        </div>
      </article>`;
    };
    const fore = doc.pages.filter((page) => !page.background);
    const back = doc.pages.filter((page) => page.background);
    this.host.innerHTML = `<div class="pages-bar">${icon('viewPages')}<b>${escapeHtml(t('view.pages'))}</b><span class="muted">${escapeHtml(t('pages.total', { count: doc.pages.length }))}</span><span class="grow"></span>
        <button class="small-button" data-pages-action="pageNew" data-page="${escapeHtml(current ?? '')}" title="${escapeHtml(t('action.pageNew'))}">${icon('pageAdd')}<span>${escapeHtml(t('action.pageNew'))}</span></button>
        <button class="small-button" data-pages-action="pageBackgroundNew" data-page="${escapeHtml(current ?? '')}" title="${escapeHtml(t('action.pageBackgroundNew'))}">${icon('pageBg')}<span>${escapeHtml(t('action.pageBackgroundNew'))}</span></button></div>
      <h3 class="pages-heading">${escapeHtml(t('pages.foreground'))}</h3><div class="page-grid">${fore.map(card).join('')}</div>
      ${back.length ? `<h3 class="pages-heading">${escapeHtml(t('pages.background'))}</h3><div class="page-grid">${back.map(card).join('')}</div>` : ''}`;
  }

  update() { this.render(); }
  selectionChanged() {}
  destroy() { this.host.innerHTML = ''; this.host.className = 'view-host'; }
}
