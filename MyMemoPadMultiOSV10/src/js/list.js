import { t } from './i18n.js';
import { applyThemeVars, htmlToPlain, lookFromSettings, storedToHtml } from './shared.js';
import { showAlert, showConfirm } from './dialogs.js';

export function initList({
  isElectron,
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
  let selected = 0;

  function applyTheme() {
    const settings = getSettings();
    applyThemeVars(settings.editorBackColor || lookFromSettings(settings).editorBackColor);
  }

  function render() {
    const memos = getMemos();
    host.innerHTML = '';
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
        <button type="button" class="card-delete" data-i18n-tooltip="list.delete" aria-label="🗑">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM6 8h12l-1 13H7L6 8z"/>
          </svg>
        </button>
      `;
      card.querySelector('.card-preview').textContent = preview;
      card.addEventListener('click', (e) => {
        if (e.target.closest('.card-delete')) return;
        selected = index;
        render();
      });
      card.addEventListener('dblclick', () => openMemo(index));
      card.querySelector('.card-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteAt(index);
      });
      host.appendChild(card);
    });
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
      selected += 1;
      render();
      e.preventDefault();
    } else if (e.key === 'ArrowUp' && selected > 0) {
      selected -= 1;
      render();
      e.preventDefault();
    } else if (e.key === 'Enter') {
      if (selected >= 0) openMemo(selected);
      e.preventDefault();
    } else if (e.key === 'Delete' && selected >= 0) {
      deleteAt(selected);
      e.preventDefault();
    } else if (e.key === 'Escape' && isElectron) {
      api?.close?.();
    }
  });

  applyTheme();
  render();

  return { view, render, applyTheme, getSelected: () => selected };
}
