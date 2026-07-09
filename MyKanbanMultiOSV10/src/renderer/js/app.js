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
      footer: `<button type="button" class="btn btn-primary" onclick="Modal.close()">${I18n.t('close')}</button>`,
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
  const LAST_USERNAME_KEY = 'kanban-last-username';

  function getLastUsername() {
    try { return localStorage.getItem(LAST_USERNAME_KEY) || ''; } catch { return ''; }
  }

  function saveLastUsername(username) {
    try { localStorage.setItem(LAST_USERNAME_KEY, username); } catch {}
  }

  // Apply saved theme and lang on load
  (() => {
    const saved = localStorage.getItem('kanban-theme');
    if (saved === 'dark') document.documentElement.dataset.theme = 'dark';
    document.documentElement.lang = I18n.getLang();
  })();

  async function init() {
    updateLangBtn();
    updateThemeBtn();
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
    } catch {
      showLogin();
    }
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
    const adminBtn = document.getElementById('btn-admin');
    const adminMenu = document.getElementById('mb-admin');
    if (user.role !== 'admin') {
      adminBtn.classList.add('hidden');
      adminMenu?.classList.add('hidden');
    } else {
      adminBtn.classList.remove('hidden');
      adminMenu?.classList.remove('hidden');
    }
    // Update status bar user
    const statusUser = document.getElementById('status-user');
    if (statusUser) statusUser.textContent = user.displayName || user.username;
    // Update DB type in status bar
    updateStatusDb();
    updateI18nElements();
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

    if (document.getElementById('login-username')) {
      showLogin();
      return;
    }
    if (document.getElementById('reg-username')) {
      showRegister();
      return;
    }
    if (main.querySelector('.settings-section')) {
      SettingsView.render();
      return;
    }
    if (main.querySelector('.tabs')) {
      AdminView.render();
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

  // ── Auth views ────────────────────────────────────────────────────────────

  function showLogin() {
    document.getElementById('app-header').classList.add('hidden');
    document.getElementById('app-menubar')?.classList.add('hidden');
    document.getElementById('status-bar')?.classList.add('hidden');
    document.getElementById('breadcrumb').innerHTML = '';
    document.getElementById('main-content').innerHTML = renderLoginView();
    const lastUser = getLastUsername();
    const pwEl = document.getElementById('login-password');
    if (lastUser && pwEl) pwEl.focus();
    else document.getElementById('login-username')?.focus();
  }

  function renderLoginView() {
    const lastUser = escAttr(getLastUsername());
    return `
      <div class="login-wrap">
        <div class="login-box">
          <div style="text-align:center;font-size:32px;margin-bottom:8px">&#9783;</div>
          <h1 class="login-title">MyKanban</h1>
          <p class="login-sub">${I18n.t('loginSub')}</p>
          <div class="form-group">
            <label>${I18n.t('idLabel')}</label>
            <input id="login-username" class="form-control" value="${lastUser}" placeholder="${I18n.t('idLabel')}" autocomplete="username">
          </div>
          <div class="form-group">
            <label>${I18n.t('pwLabel')}</label>
            <input id="login-password" type="password" class="form-control" placeholder="${I18n.t('pwLabel')}" autocomplete="current-password">
          </div>
          <div id="login-error" style="color:var(--danger);font-size:12px;margin-bottom:10px;display:none"></div>
          <button class="btn btn-primary" style="width:100%;justify-content:center" onclick="App.doLogin()">${I18n.t('login')}</button>
          <div class="login-divider">${I18n.t('orDivider')}</div>
          <button class="btn-link" style="width:100%;text-align:center;display:block;padding:8px" onclick="App.showRegister()">
            ${I18n.t('registerLink')}
          </button>
        </div>
      </div>`;
  }

  function showRegister() {
    document.getElementById('main-content').innerHTML = `
      <div class="login-wrap">
        <div class="login-box">
          <h1 class="login-title">${I18n.t('registerTitle')}</h1>
          <p class="login-sub">${I18n.t('registerSub')}</p>
          <div class="form-group">
            <label>${I18n.t('idLabel')} *</label>
            <input id="reg-username" class="form-control" placeholder="${I18n.t('idLabel')}">
          </div>
          <div class="form-group">
            <label>${I18n.t('pwLabel')} *</label>
            <input id="reg-password" type="password" class="form-control" placeholder="${I18n.t('pwLabel')}">
          </div>
          <div class="form-group">
            <label>${I18n.t('nameLabel')}</label>
            <input id="reg-name" class="form-control" placeholder="${I18n.t('nameLabel')}">
          </div>
          <div class="form-group">
            <label>${I18n.t('emailLabel')}</label>
            <input id="reg-email" type="email" class="form-control" placeholder="${I18n.t('emailLabel')}">
          </div>
          <div id="reg-msg" style="font-size:12px;margin-bottom:10px;display:none"></div>
          <button class="btn btn-primary" style="width:100%;justify-content:center" onclick="App.doRegister()">${I18n.t('submitRegister')}</button>
          <button class="btn-link" style="width:100%;text-align:center;display:block;padding:10px;margin-top:4px" onclick="App.showLogin()">
            ${I18n.t('backToLogin')}
          </button>
        </div>
      </div>`;
    document.getElementById('reg-username').focus();
  }

  async function doLogin() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const errEl = document.getElementById('login-error');
    errEl.style.display = 'none';
    try {
      const user = await API.post('/auth/login', { username, password });
      saveLastUsername(username);
      setUser(user);
      showBoards();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
      document.getElementById('login-password').value = '';
    }
  }

  async function doRegister() {
    const username = document.getElementById('reg-username').value.trim();
    const password = document.getElementById('reg-password').value;
    const displayName = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const msgEl = document.getElementById('reg-msg');
    msgEl.style.display = 'none';

    if (!username || !password) {
      msgEl.textContent = I18n.t('loginRequired');
      msgEl.style.color = 'var(--danger)'; msgEl.style.display = 'block'; return;
    }

    try {
      const r = await API.post('/auth/register-request', { username, password, displayName, email });
      msgEl.textContent = r.message;
      msgEl.style.color = 'var(--success)'; msgEl.style.display = 'block';
      setTimeout(() => showLogin(), 2500);
    } catch (err) {
      msgEl.textContent = err.message;
      msgEl.style.color = 'var(--danger)'; msgEl.style.display = 'block';
    }
  }

  function showBoards() {
    if (!currentUser) { showLogin(); return; }
    document.getElementById('breadcrumb').innerHTML = '';
    BoardView.renderBoardList();
  }

  function showAdmin() {
    AppMenu.close();
    if (!currentUser || currentUser.role !== 'admin') {
      showToast(I18n.t('adminRequired'), 'error'); return;
    }
    AdminView.render();
  }

  function showSettings() {
    AppMenu.close();
    if (!currentUser) { showLogin(); return; }
    SettingsView.render();
  }

  async function logout() {
    AppMenu.close();
    try { await API.post('/auth/logout'); } catch {}
    currentUser = null;
    showLogin();
  }

  // Keyboard shortcuts
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
    if (e.key === 'Enter') {
      const loginPw = document.getElementById('login-password');
      const loginUn = document.getElementById('login-username');
      if (document.activeElement === loginPw || document.activeElement === loginUn) doLogin();
    }
  });

  return {
    get currentUser() { return currentUser; },
    init, showLogin, showRegister, doLogin, doRegister,
    showBoards, showAdmin, showSettings, logout,
    toggleTheme, toggleLang, updateStatusDb, refresh,
  };
})();

// Boot
document.addEventListener('DOMContentLoaded', () => App.init());
