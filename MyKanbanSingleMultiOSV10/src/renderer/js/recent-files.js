/* ── Recent files (list only — never deletes the file on disk) ──────────── */
const RecentFiles = (() => {
  const KEY = 'kanban-recent-files';
  const MAX = 10;

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
      if (!Array.isArray(raw)) return [];
      const seen = new Set();
      const list = [];
      for (const item of raw) {
        if (!item || typeof item.path !== 'string' || !item.path.trim()) continue;
        const path = item.path.trim();
        const id = path.replace(/\\/g, '/');
        if (seen.has(id)) continue;
        seen.add(id);
        list.push({ path, name: item.name || path.split(/[\\/]/).pop() || path });
        if (list.length >= MAX) break;
      }
      return list;
    } catch {
      return [];
    }
  }

  function persist(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))); } catch {}
  }

  function remember(filePath) {
    if (typeof filePath !== 'string' || !filePath.trim()) return;
    const path = filePath.trim();
    const id = path.replace(/\\/g, '/');
    const name = path.split(/[\\/]/).pop() || path;
    const list = load().filter((item) => item.path.replace(/\\/g, '/') !== id);
    list.unshift({ path, name });
    persist(list);
    render();
  }

  function remove(path) {
    const id = String(path || '').replace(/\\/g, '/');
    persist(load().filter((item) => item.path.replace(/\\/g, '/') !== id));
    render();
  }

  function clearAll(event) {
    if (event) event.stopPropagation();
    persist([]);
    render();
  }

  function render() {
    const host = document.getElementById('recent-files');
    const clearBtn = document.getElementById('recent-clear');
    if (!host) return;
    const list = load();
    if (clearBtn) clearBtn.classList.toggle('disabled', list.length === 0);
    if (!list.length) {
      host.innerHTML = `<div class="menubar-opt disabled"><span class="menubar-opt-icon"></span><span>${esc(I18n.t('recentEmpty'))}</span></div>`;
      return;
    }
    host.innerHTML = list.map((item) => `
      <div class="menubar-opt recent-file" data-recent-path="${esc(item.path)}" title="${esc(item.path)}">
        <span class="menubar-opt-icon">&#128196;</span>
        <span class="recent-file-name">${esc(item.name)}</span>
        <button type="button" class="recent-file-remove" data-recent-remove="${esc(item.path)}" title="${esc(I18n.t('recentRemove'))}" aria-label="${esc(I18n.t('recentRemove'))}">&#10005;</button>
      </div>`).join('');
  }

  async function open(filePath) {
    if (typeof AppMenu !== 'undefined') AppMenu.close();
    if (typeof BoardView !== 'undefined' && BoardView.handleKprjFileOpen) {
      await BoardView.handleKprjFileOpen(filePath);
    }
  }

  function onClick(event) {
    const removeBtn = event.target.closest('[data-recent-remove]');
    if (removeBtn) {
      event.stopPropagation();
      event.preventDefault();
      remove(removeBtn.getAttribute('data-recent-remove'));
      return;
    }
    const row = event.target.closest('[data-recent-path]');
    if (!row) return;
    event.stopPropagation();
    open(row.getAttribute('data-recent-path'));
  }

  document.getElementById('recent-files')?.addEventListener('click', onClick);

  return { remember, remove, clearAll, render, open };
})();
