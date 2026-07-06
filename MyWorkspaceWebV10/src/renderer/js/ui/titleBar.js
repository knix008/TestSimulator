import { t } from '../i18n/index.js';
import { showPopupMenu, showPopupMenuAtPoint, closePopupMenu } from './popupMenu.js';

export function createTitleBar({ onPageSearch, onSettingsAction, onWindowAction }) {
  const caption = document.getElementById('title-bar-caption');
  const searchInput = document.getElementById('page-search');
  const searchResults = document.getElementById('search-results');
  const settingsMark = document.getElementById('btn-settings-mark');

  if (navigator.platform.includes('Mac')) {
    document.body.classList.add('platform-darwin');
  }

  document.getElementById('btn-minimize')?.addEventListener('click', (event) => {
    event.stopPropagation();
    onWindowAction('minimize');
  });
  document.getElementById('btn-maximize')?.addEventListener('click', async (event) => {
    event.stopPropagation();
    const maximized = await window.myworkspace.toggleMaximizeWindow();
    document.getElementById('btn-maximize')?.classList.toggle('is-maximized', maximized);
  });
  document.getElementById('btn-close')?.addEventListener('click', (event) => {
    event.stopPropagation();
    onWindowAction('close');
  });

  window.myworkspace.isWindowMaximized().then((maximized) => {
    document.getElementById('btn-maximize')?.classList.toggle('is-maximized', maximized);
  });
  window.myworkspace.onWindowMaximizedChanged((maximized) => {
    document.getElementById('btn-maximize')?.classList.toggle('is-maximized', maximized);
  });

  settingsMark?.addEventListener('mousedown', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  settingsMark?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onSettingsAction(settingsMark);
  });

  caption?.addEventListener('dblclick', async (event) => {
    event.stopPropagation();
    const maximized = await window.myworkspace.toggleMaximizeWindow();
    document.getElementById('btn-maximize')?.classList.toggle('is-maximized', maximized);
  });

  let searchTimer = null;
  searchInput?.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      const query = searchInput.value.trim();
      if (!query) {
        searchResults.classList.add('hidden');
        searchResults.replaceChildren();
        return;
      }
      const results = await onPageSearch(query);
      renderSearchResults(results);
    }, 180);
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.title-bar-search-wrap')) {
      searchResults?.classList.add('hidden');
    }
  });

  function renderSearchResults(results) {
    searchResults.replaceChildren();
    if (!results.length) {
      const empty = document.createElement('button');
      empty.type = 'button';
      empty.className = 'search-result-item';
      empty.textContent = t.titleBarPageSearchNoResults;
      empty.disabled = true;
      searchResults.appendChild(empty);
    } else {
      for (const item of results) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'search-result-item';
        button.innerHTML = `<strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.snippet)}</span>`;
        button.addEventListener('click', () => {
          searchResults.classList.add('hidden');
          searchInput.value = '';
          item.onSelect?.();
        });
        searchResults.appendChild(button);
      }
    }
    searchResults.classList.remove('hidden');
  }

  return {
    setCaption(text) {
      if (caption) {
        caption.textContent = text;
      }
    },
    showSettingsMenu(items, anchor, onAction) {
      closePopupMenu();
      const rect = anchor.getBoundingClientRect();
      showPopupMenuAtPoint(items, rect.left, rect.bottom + 2, {
        onAction: (actionId, item) => onAction(actionId, item)
      });
    },
    clearSearch() {
      if (searchInput) {
        searchInput.value = '';
      }
      searchResults?.classList.add('hidden');
    }
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
