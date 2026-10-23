import { t } from './i18n.js';
import { applyThemeVars, htmlToPlain, lookFromSettings, storedToHtml } from './shared.js';
import { showAlert, showConfirm } from './dialogs.js';

export function initList({
  isDesktop,
  isWeb,
  api,
  getMemos,
  setMemos,
  getSettings,
  removeLook,
  openSettings,
  openMemo,
  openNew,
  importFile
}) {
  const host = document.getElementById('card-host');
  const empty = document.getElementById('list-empty');
  const view = document.getElementById('view-list');
  const count = document.getElementById('list-count');
  let selected = 0;

  /** Moves the highlight without rebuilding the cards (a rebuild between two clicks loses the double-click). */
  function select(index) {
    selected = index;
    host.querySelectorAll('.memo-card').forEach((card) => {
      card.classList.toggle('selected', Number(card.dataset.index) === index);
    });
    host.querySelector('.memo-card.selected')?.scrollIntoView({ block: 'nearest' });
  }

  function applyTheme() {
    const settings = getSettings();
    applyThemeVars(settings.editorBackColor || lookFromSettings(settings).editorBackColor);
  }

  function render() {
    const memos = getMemos();
    host.innerHTML = '';
    if (count) count.textContent = memos.length ? t('list.count', { n: memos.length }) : '';
    if (!memos.length) {
      empty.hidden = false;
      selected = -1;
      return;
    }
    empty.hidden = true;
    if (selected < 0 || selected >= memos.length) selected = 0;
    memos.forEach((stored, index) => {
      const card = document.createElement('article');
      card.className = `memo-card${index === selected ? ' selected' : ''}`;
      card.dataset.index = String(index);
      const preview = htmlToPlain(storedToHtml(stored)).trim() || '...';
      card.innerHTML = `
        <div class="card-no">#${index + 1}</div>
        <div class="card-preview"></div>
        <button type="button" class="card-delete" data-tooltip="${t('list.delete')}" aria-label="${t('list.delete')}">
          <img class="icon" src="icons/delete.svg" alt="" draggable="false" />
        </button>
      `;
      card.querySelector('.card-preview').textContent = preview;
      card.addEventListener('click', (e) => {
        if (e.target.closest('.card-delete')) return;
        select(index);
      });
      card.addEventListener('dblclick', () => openMemo(index));
      card.querySelector('.card-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteAt(index);
      });
      host.appendChild(card);
    });
    host.querySelector('.memo-card.selected')?.scrollIntoView({ block: 'nearest' });
  }

  async function deleteAt(index) {
    const memos = getMemos();
    if (index < 0 || index >= memos.length) return;
    const ok = await showConfirm(t('memo.confirmDelete'), t('memo.confirmDelete.title'));
    if (!ok) return;
    const next = memos.slice();
    next.splice(index, 1);
    removeLook(index);
    setMemos(next);
    if (selected >= next.length) selected = next.length - 1;
    render();
  }

  document.getElementById('list-settings').addEventListener('click', () => openSettings());
  document.getElementById('list-close').addEventListener('click', () => {
    if (isWeb) return;
    api?.close?.();
  });
  document.getElementById('btn-new').addEventListener('click', () => openNew());
  document.getElementById('btn-load').addEventListener('click', () => importFile());

  host.addEventListener('keydown', (e) => {
    const memos = getMemos();
    if (e.key === 'ArrowDown' && selected < memos.length - 1) {
      select(selected + 1);
      e.preventDefault();
    } else if (e.key === 'ArrowUp' && selected > 0) {
      select(selected - 1);
      e.preventDefault();
    } else if (e.key === 'Enter') {
      if (selected >= 0) openMemo(selected);
      e.preventDefault();
    } else if (e.key === 'Delete' && selected >= 0) {
      deleteAt(selected);
      e.preventDefault();
    } else if (e.key === 'Escape' && isDesktop) {
      api?.close?.();
    }
  });

  applyTheme();
  render();

  return { view, render, applyTheme, select, open: openMemo, deleteAt, getSelected: () => selected };
}
