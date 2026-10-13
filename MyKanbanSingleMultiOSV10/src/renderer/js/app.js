/* ── AppMenu controller ──────────────────────────────────────────────────── */
const AppMenu = (() => {
  let openId = null;

  function toggle(id, event) {
    if (event && event.target.closest('.menubar-dropdown')) return;
    const itemId = `mb-${id}`;
    if (openId === id) { close(); return; }
    close();
    openId = id;
    if (id === 'file') refreshFileMenu();
    document.getElementById(itemId)?.classList.add('open');
  }

  function refreshFileMenu() {
    if (typeof RecentFiles !== 'undefined') RecentFiles.render();
    const saveAs = document.getElementById('mb-save-as');
    const onBoard = typeof BoardView !== 'undefined' && !!BoardView.currentBoardId;
    if (saveAs) saveAs.classList.toggle('disabled', !onBoard);
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
    const build = formatBuildInfo(info);
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

  function showHelp() {
    close();
    const items = ['helpTopicProject', 'helpTopicCard', 'helpTopicColumn', 'helpTopicFile', 'helpTopicPanel', 'helpTopicTheme'];
    Modal.dialog({
      title: I18n.t('helpUsage'),
      icon: '?',
      size: 'sm',
      body: `<ul class="help-list">${items.map(key => `<li>${escHtml(I18n.t(key))}</li>`).join('')}</ul>`,
      footer: Modal.btn({ label: I18n.t('close'), icon: '✕', variant: 'primary', onclick: 'Modal.close()' }),
    });
  }

  function formatBuildInfo(info) {
    const git = info && info.git;
    if (!git || !git.commit) return escHtml(I18n.t('aboutGitUnavailable'));
    const dirty = git.dirty ? ` · ${escHtml(I18n.t('aboutGitDirty'))}` : '';
    const line = `${escHtml(git.branch || '')} · ${escHtml(git.commit)}${dirty} · ${escHtml(git.date || '')}`;
    const subject = git.subject ? `<span class="about-git-subject">${escHtml(git.subject)}</span>` : '';
    return line + subject;
  }

  // Close menu when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#app-menubar')) close();
  });

  return { toggle, close, showAbout, showHelp };
})();

/* ── Desktop window controls (Electron only) ───────────────────────────── */
const WindowControls = (() => {
  function applyMaximized(maximized) {
    document.body.classList.toggle('is-max', !!maximized);
    const btn = document.getElementById('win-max');
    if (!btn) return;
    btn.classList.toggle('is-max', !!maximized);
    btn.dataset.i18nTitle = maximized ? 'winRestore' : 'winMaximize';
    const label = I18n.t(btn.dataset.i18nTitle);
    btn.title = label;
    btn.setAttribute('aria-label', label);
  }

  function init() {
    if (!window.electron || !window.electron.minimize) return;
    document.body.classList.add('is-electron');
    document.getElementById('app-header')?.classList.remove('hidden');
    document.getElementById('window-controls')?.classList.remove('hidden');
    window.electron.onMaximizedChange(applyMaximized);
    window.electron.isMaximized().then(applyMaximized).catch(() => {});
    window.electron.onRequestClose?.(() => handleCloseRequest());
    const grip = document.getElementById('window-resize');
    if (grip && window.electron.resizeBy) {
      grip.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || document.body.classList.contains('is-max')) return;
        e.preventDefault();
        let x = e.screenX;
        let y = e.screenY;
        const move = (ev) => {
          const dx = ev.screenX - x;
          const dy = ev.screenY - y;
          x = ev.screenX;
          y = ev.screenY;
          window.electron.resizeBy(dx, dy);
        };
        const up = () => {
          window.removeEventListener('mousemove', move);
          window.removeEventListener('mouseup', up);
        };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
      });
    }
  }

  function minimize() { window.electron?.minimize(); }
  function toggleMaximize() {
    window.electron?.toggleMaximize().then(applyMaximized).catch(() => {});
  }
  function close() { window.electron?.close(); }

  let closePromptOpen = false;

  async function handleCloseRequest() {
    if (closePromptOpen) return;
    if (!ChangeGuard.isDirty()) {
      window.electron?.confirmClose();
      return;
    }
    closePromptOpen = true;
    const choice = await Modal.choose({
      title: I18n.t('unsavedTitle'),
      message: I18n.t('unsavedMessage'),
      icon: '💾',
      choices: [
        { value: 'save', label: I18n.t('save'), icon: '💾', variant: 'primary' },
        { value: 'discard', label: I18n.t('dontSave'), icon: '✕', variant: 'secondary' },
        { value: 'cancel', label: I18n.t('cancel'), icon: '↩', variant: 'secondary' },
      ],
    });
    closePromptOpen = false;
    if (choice === 'save') {
      const ok = await App.save();
      if (ok) window.electron?.confirmClose();
      return;
    }
    if (choice === 'discard') {
      AutoSave.discardAll();
      try { await API.post('/settings/workspace/revert', {}); } catch {}
      ChangeGuard.clear();
      window.electron?.confirmClose();
    }
  }

  return { init, minimize, toggleMaximize, close, applyMaximized, handleCloseRequest };
})();

/* ── App Controller ─────────────────────────────────────────────────────── */
const App = (() => {
  let currentUser = null;

  // Apply saved theme and lang on load
  (() => {
    if (typeof Themes !== 'undefined') Themes.boot();
    document.documentElement.lang = I18n.getLang();
  })();

  async function applyServerSettings() {
    try {
      const saved = await API.get('/settings/app');
      if (saved?.saved) {
        const hadThemeId = !!saved.themeId;
        const hadCustom = Array.isArray(saved.customThemes) && saved.customThemes.length > 0;
        if (typeof Themes !== 'undefined') Themes.importState(saved);
        if (saved.lang === 'ko' || saved.lang === 'en') I18n.setLang(saved.lang);
        if (typeof Themes !== 'undefined') {
          const payload = Themes.persistPayload(I18n.getLang());
          if (!hadThemeId || (!hadCustom && payload.customThemes.length)) {
            await API.put('/settings/app', payload);
          }
        }
      } else if (typeof Themes !== 'undefined') {
        await API.put('/settings/app', Themes.persistPayload(I18n.getLang()));
      }
    } catch {}
  }

  function persistAppSettings() {
    if (typeof Themes === 'undefined') return;
    const payload = Themes.persistPayload(I18n.getLang());
    try {
      localStorage.setItem('kanban-theme', payload.theme);
      localStorage.setItem('kanban-theme-id', payload.themeId);
      localStorage.setItem('kanban-custom-themes', JSON.stringify(payload.customThemes));
    } catch {}
    API.put('/settings/app', payload).catch(() => {});
  }

  async function init() {
    WindowControls.init();
    if (typeof Panels !== 'undefined') Panels.init();
    await applyServerSettings();
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
    if (typeof Panels !== 'undefined') Panels.reapply();
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
    updateThemeBtn();
    if (typeof RecentFiles !== 'undefined') RecentFiles.render();
  }

  // ── Theme ─────────────────────────────────────────────────────────────────

  function toggleTheme() {
    if (typeof Themes !== 'undefined') Themes.random();
  }

  function updateThemeBtn() {
    const btn = document.getElementById('btn-theme');
    if (!btn) return;
    const theme = typeof Themes !== 'undefined' ? Themes.current() : null;
    const name = theme ? ((I18n.getLang() === 'en' ? theme.en : theme.ko) || '') : '';
    btn.title = name ? `${I18n.t('themeRandom')}: ${name}` : I18n.t('themeRandom');
    const swatch = btn.querySelector('.palette-swatch');
    if (swatch && theme?.vars?.['--primary']) swatch.setAttribute('fill', theme.vars['--primary']);
  }

  // ── Language ──────────────────────────────────────────────────────────────

  function toggleLang() {
    AppMenu.close();
    const next = I18n.getLang() === 'ko' ? 'en' : 'ko';
    I18n.setLang(next);
    updateLangBtn();
    persistAppSettings();
    updateI18nElements();
    updateThemeBtn();
    if (typeof Panels !== 'undefined') Panels.reapply();
    rerenderCurrentView();
  }

  function updateLangBtn() {
    const btn = document.getElementById('btn-lang');
    if (!btn) return;
    const korean = I18n.getLang() === 'ko';
    btn.classList.toggle('show-en', korean);
    btn.classList.toggle('show-ko', !korean);
    btn.dataset.i18nTitle = korean ? 'langToEnglish' : 'langToKorean';
    const label = I18n.t(btn.dataset.i18nTitle);
    btn.title = label;
    btn.setAttribute('aria-label', label);
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
    document.getElementById('breadcrumb').innerHTML = `<span>${I18n.t('myBoards')}</span>`;
    BoardView.renderBoardList();
  }

  function showSettings() {
    AppMenu.close();
    if (!currentUser) return;
    SettingsView.render();
  }

  function print() {
    AppMenu.close();
    window.print();
  }

  async function save() {
    if (!currentUser) return false;
    AppMenu.close();
    try {
      const ok = typeof BoardView !== 'undefined' && BoardView.savePending
        ? await BoardView.savePending()
        : await AutoSave.flushAll();
      if (!ok) return false;
      await API.post('/settings/workspace/save', {});
      ChangeGuard.clear();
      showToast(I18n.t('savedDone'), 'success');
      return true;
    } catch (err) {
      showToast(err.message, 'error');
      return false;
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
  function onPrintShortcut(e) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
    const key = e.key?.toLowerCase();
    if (key !== 'p' && e.code !== 'KeyP') return;
    e.preventDefault();
    e.stopPropagation();
    print();
  }

  document.addEventListener('keydown', onSaveShortcut, true);
  document.addEventListener('keydown', onPrintShortcut, true);
  document.addEventListener('keydown', onHistoryShortcut, true);
  window.addEventListener('beforeunload', (e) => {
    if (!ChangeGuard.isDirty()) return;
    e.preventDefault();
    e.returnValue = '';
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      Modal.close();
      CtxMenu.hide();
      AppMenu.close();
      if (typeof Themes !== 'undefined') Themes.closeMenu();
    }
    if (e.key === 'F5') {
      e.preventDefault();
      refresh();
    }
  });

  return {
    get currentUser() { return currentUser; },
    init, reloadUser,
    showBoards, showSettings, save, print,
    toggleTheme, toggleLang, updateStatusDb, refresh,
    persistAppSettings, updateThemeBtn,
  };
})();

// Boot
document.addEventListener('DOMContentLoaded', () => App.init());
