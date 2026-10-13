/* ── AppMenu controller ──────────────────────────────────────────────────── */
const AppMenu = (() => {
  let openId = null;

  function toggle(id) {
    const ddId = `mb-${id}-dd`;
    const itemId = `mb-${id}`;
    if (openId === id) { close(); return; }
    close();
    openId = id;
    document.getElementById(itemId)?.classList.add('open');
  }

  function close() {
    if (openId) {
      document.getElementById(`mb-${openId}`)?.classList.remove('open');
      openId = null;
    }
  }

  async function showAbout() {
    close();
    let info = {
      name: 'MyKanban',
      description: I18n.t('aboutDescription'),
      version: '1.0.0',
      buildNumber: '1',
      copyright: 'Copyright © 2026',
      author: 'SHKWON(knix008@naver.com)',
      iconUrl: '/assets/icon.ico',
    };
    try {
      if (typeof window.electron !== 'undefined' && window.electron.getElectronInfo) {
        info = { ...info, ...(await window.electron.getElectronInfo()) };
      } else {
        info = { ...info, ...(await API.get('/app-info')) };
      }
    } catch {}

    const name = escHtml(info.name || 'MyKanban');
    const desc = escHtml(info.description || I18n.t('aboutDescription'));
    const version = escHtml(info.version || '1.0.0');
    const build = escHtml(info.buildNumber || '1');
    const copyright = escHtml(info.copyright || 'Copyright © 2026');
    const author = escHtml(info.author || 'SHKWON(knix008@naver.com)');
    const iconUrl = escAttr(info.iconUrl || '/assets/icon.ico');

    Modal.dialog({
      title: I18n.t('programInfo'),
      icon: 'ℹ️',
      size: 'sm',
      type: 'about',
      body: `
        <div class="about-dialog">
          <img class="about-icon" src="${iconUrl}" alt="${name}" width="72" height="72">
          <div class="about-body">
            <h3 class="about-name">${name}</h3>
            <p class="about-desc">${desc}</p>
            <dl class="about-meta">
              <div class="about-meta-row"><dt>${I18n.t('aboutVersion')}</dt><dd>${version}</dd></div>
              <div class="about-meta-row"><dt>${I18n.t('aboutBuild')}</dt><dd>${build}</dd></div>
            </dl>
            <p class="about-copy">${copyright}</p>
            <p class="about-author">${author}</p>
          </div>
        </div>`,
      footer: Modal.btn({ label: I18n.t('close'), icon: '✕', variant: 'primary', onclick: 'Modal.close()' }),
    });
  }

  // Close menu when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#app-menubar')) close();
  });

  return { toggle, close, showAbout };
})();

/* ── App Controller ─────────────────────────────────────────────────────── */
const App = (() => {
  let currentUser = null;

  // Apply saved theme and lang on load
  (() => {
    const saved = localStorage.getItem('kanban-theme');
    if (saved === 'dark') document.documentElement.dataset.theme = 'dark';
    document.documentElement.lang = I18n.getLang();
  })();

  async function init() {
    updateLangBtn();
    updateThemeBtn();
    if (typeof window.electron !== 'undefined' && window.electron.onSaveShortcut) {
      window.electron.onSaveShortcut(() => { if (currentUser) save(); });
    }
    if (typeof window.electron !== 'undefined' && window.electron.onUndoShortcut) {
      window.electron.onUndoShortcut(() => { if (currentUser && typeof History !== 'undefined') History.undo(); });
    }
    if (typeof window.electron !== 'undefined' && window.electron.onRedoShortcut) {
      window.electron.onRedoShortcut(() => { if (currentUser && typeof History !== 'undefined') History.redo(); });
    }
    try {
      const user = await API.get('/auth/me');
      setUser(user);
      showBoards();
      // Check if app was launched by opening a .kprj file (Electron only)
      if (typeof window.electron !== 'undefined' && window.electron.getOpenFile) {
        const kprjPath = await window.electron.getOpenFile();
        if (kprjPath) {
          setTimeout(() => BoardView.handleKprjFileOpen(kprjPath), 500);
        }
      }
      // Update status bar with Electron info
      if (typeof window.electron !== 'undefined' && window.electron.getElectronInfo) {
        window.electron.getElectronInfo().then(info => {
          const verEl = document.getElementById('status-ver');
          if (verEl) verEl.textContent = `v${info.version || '1.0.0'}`;
        }).catch(() => {});
      }
    } catch (err) {
      document.getElementById('main-content').innerHTML =
        `<div class="spinner-wrap">${escHtml(err.message || 'Failed to start')}</div>`;
    }
  }

  async function reloadUser() {
    const user = await API.get('/auth/me');
    setUser(user);
    return user;
  }

  function setUser(user) {
    currentUser = user;
    const header = document.getElementById('app-header');
    const menubar = document.getElementById('app-menubar');
    const statusbar = document.getElementById('status-bar');
    header.classList.remove('hidden');
    menubar?.classList.remove('hidden');
    statusbar?.classList.remove('hidden');
    document.getElementById('header-username').textContent = user.displayName || user.username;
    // Update status bar user
    const statusUser = document.getElementById('status-user');
    if (statusUser) statusUser.textContent = user.displayName || user.username;
    // Update DB type in status bar
    updateStatusDb();
    updateI18nElements();
    if (typeof History !== 'undefined') History.updateMenuState();
  }

  async function updateStatusDb() {
    const dbEl = document.getElementById('status-db');
    if (!dbEl) return;
    try {
      const cfg = await API.get('/settings/db-config').catch(() => null);
      if (cfg) {
        const text = cfg.label || cfg.type || 'SQLite';
        dbEl.textContent = cfg.host ? `${text} @ ${cfg.host}` : text;
      } else {
        dbEl.textContent = 'SQLite';
      }
    } catch {
      dbEl.textContent = 'SQLite';
    }
  }

  function updateI18nElements() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = I18n.t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      el.title = I18n.t(el.dataset.i18nTitle);
    });
    const statusMsg = document.getElementById('status-msg');
    if (statusMsg && (!statusMsg.dataset.statusKey || statusMsg.dataset.statusKey === 'ready')) {
      statusMsg.textContent = I18n.t('ready');
      statusMsg.dataset.statusKey = 'ready';
    }
    const dbEl = document.getElementById('status-db');
    if (dbEl) dbEl.title = I18n.t('dbInfoTitle');
    const langBtn = document.getElementById('btn-lang');
    if (langBtn) langBtn.title = I18n.t('langBtnTitle');
  }

  // ── Theme ─────────────────────────────────────────────────────────────────

  function toggleTheme() {
    AppMenu.close();
    const isDark = document.documentElement.dataset.theme === 'dark';
    if (isDark) {
      delete document.documentElement.dataset.theme;
      localStorage.setItem('kanban-theme', 'light');
    } else {
      document.documentElement.dataset.theme = 'dark';
      localStorage.setItem('kanban-theme', 'dark');
    }
    updateThemeBtn();
    if (typeof BoardView !== 'undefined' && BoardView.refreshBurndownChartTheme()) return;
  }

  function updateThemeBtn() {
    const btn = document.getElementById('btn-theme');
    if (!btn) return;
    const isDark = document.documentElement.dataset.theme === 'dark';
    btn.textContent = isDark ? '☀' : '☽';
    btn.title = isDark ? I18n.t('lightMode') : I18n.t('darkMode');
  }

  // ── Language ──────────────────────────────────────────────────────────────

  function toggleLang() {
    AppMenu.close();
    const next = I18n.getLang() === 'ko' ? 'en' : 'ko';
    I18n.setLang(next);
    updateLangBtn();
    updateThemeBtn();
    updateI18nElements();
    rerenderCurrentView();
  }

  function updateLangBtn() {
    const btn = document.getElementById('btn-lang');
    if (!btn) return;
    btn.textContent = I18n.getLang() === 'ko' ? '한' : 'EN';
  }

  function rerenderCurrentView() {
    const main = document.getElementById('main-content');
    if (!main) return;

    if (main.querySelector('.settings-section')) {
      SettingsView.render();
      return;
    }
    if (main.querySelector('.summary-wrap')) {
      BoardView.showSummary();
      return;
    }
    if (document.getElementById('board-view')) {
      if (typeof BoardView !== 'undefined' && BoardView.currentBoardId) {
        BoardView.loadBoard();
      }
      return;
    }
    if (main.querySelector('.boards-grid, .board-empty')) {
      BoardView.renderBoardList();
      return;
    }
    updateI18nElements();
    updateThemeBtn();
  }

  async function refresh() {
    if (!currentUser) return;
    AppMenu.close();
    CtxMenu.hide();
    await updateStatusDb();
    rerenderCurrentView();
    showToast(I18n.t('refreshed'), 'success', 1500);
  }

  function showBoards() {
    if (!currentUser) return;
    document.getElementById('breadcrumb').innerHTML = '';
    BoardView.renderBoardList();
  }

  function showSettings() {
    AppMenu.close();
    if (!currentUser) return;
    SettingsView.render();
  }

  async function save() {
    if (!currentUser) return;
    AppMenu.close();
    try {
      const ok = typeof BoardView !== 'undefined' && BoardView.savePending
        ? await BoardView.savePending()
        : await AutoSave.flushAll();
      if (ok) showToast(I18n.t('savedDone'), 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function isSaveShortcut(e) {
    return (e.ctrlKey || e.metaKey) && !e.altKey && (e.key?.toLowerCase() === 's' || e.code === 'KeyS');
  }

  function onSaveShortcut(e) {
    if (!isSaveShortcut(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (currentUser) save();
  }

  function onHistoryShortcut(e) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const key = e.key?.toLowerCase();
    if (key === 'z' && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      if (currentUser && typeof History !== 'undefined') History.undo();
      return;
    }
    if (key === 'y' || (key === 'z' && e.shiftKey)) {
      e.preventDefault();
      e.stopPropagation();
      if (currentUser && typeof History !== 'undefined') History.redo();
    }
  }

  // Keyboard shortcuts — capture phase so Ctrl+S works inside inputs/textareas
  document.addEventListener('keydown', onSaveShortcut, true);
  document.addEventListener('keydown', onHistoryShortcut, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      Modal.close();
      CtxMenu.hide();
      AppMenu.close();
    }
    if (e.key === 'F5') {
      e.preventDefault();
      refresh();
    }
  });

  return {
    get currentUser() { return currentUser; },
    init, reloadUser,
    showBoards, showSettings, save,
    toggleTheme, toggleLang, updateStatusDb, refresh,
  };
})();

// Boot
document.addEventListener('DOMContentLoaded', () => App.init());
