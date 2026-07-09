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
    } catch {
      showLogin();
    }
  }

  function setUser(user) {
    currentUser = user;
    const header = document.getElementById('app-header');
    header.classList.remove('hidden');
    document.getElementById('header-username').textContent = user.displayName || user.username;
    const adminBtn = document.getElementById('btn-admin');
    if (user.role !== 'admin') adminBtn.classList.add('hidden');
    else adminBtn.classList.remove('hidden');
    updateI18nElements();
  }

  function updateI18nElements() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      el.textContent = I18n.t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      el.title = I18n.t(el.dataset.i18nTitle);
    });
  }

  // ── Theme ─────────────────────────────────────────────────────────────────

  function toggleTheme() {
    const isDark = document.documentElement.dataset.theme === 'dark';
    if (isDark) {
      delete document.documentElement.dataset.theme;
      localStorage.setItem('kanban-theme', 'light');
    } else {
      document.documentElement.dataset.theme = 'dark';
      localStorage.setItem('kanban-theme', 'dark');
    }
    updateThemeBtn();
  }

  function updateThemeBtn() {
    const btn = document.getElementById('btn-theme');
    if (!btn) return;
    const isDark = document.documentElement.dataset.theme === 'dark';
    btn.textContent = isDark ? '☀' : '☽';
    btn.title = isDark ? '라이트 모드' : '다크 모드';
  }

  // ── Language ──────────────────────────────────────────────────────────────

  function toggleLang() {
    const next = I18n.getLang() === 'ko' ? 'en' : 'ko';
    I18n.setLang(next);
    updateLangBtn();
    updateI18nElements();
    rerenderCurrentView();
  }

  function updateLangBtn() {
    const btn = document.getElementById('btn-lang');
    if (!btn) return;
    btn.textContent = I18n.getLang() === 'ko' ? '한' : 'EN';
  }

  function rerenderCurrentView() {
    // Re-render the currently visible view by inspecting DOM
    const main = document.getElementById('main-content');
    if (!main) return;
    const boardView = document.getElementById('board-view');
    const boards = main.querySelector('.boards-grid,.board-empty');
    if (boardView) {
      // inside board view — re-render board
      if (typeof BoardView !== 'undefined' && currentBoardId_ref()) {
        BoardView.loadBoard();
      }
    } else if (boards) {
      BoardView.renderBoardList();
    }
  }

  // Helper — we can't directly read BoardView.currentBoardId (it's local),
  // so we check if there's a board toolbar present
  function currentBoardId_ref() {
    return !!document.querySelector('.board-toolbar');
  }

  // ── Auth views ────────────────────────────────────────────────────────────

  function showLogin() {
    document.getElementById('app-header').classList.add('hidden');
    document.getElementById('breadcrumb').innerHTML = '';
    document.getElementById('main-content').innerHTML = renderLoginView();
    document.getElementById('login-username')?.focus();
  }

  function renderLoginView() {
    return `
      <div class="login-wrap">
        <div class="login-box">
          <div style="text-align:center;font-size:32px;margin-bottom:8px">&#9783;</div>
          <h1 class="login-title">MyKanban</h1>
          <p class="login-sub">${I18n.t('loginSub')}</p>
          <div class="form-group">
            <label>${I18n.t('idLabel')}</label>
            <input id="login-username" class="form-control" placeholder="${I18n.t('idLabel')}" autocomplete="username">
          </div>
          <div class="form-group">
            <label>${I18n.t('pwLabel')}</label>
            <input id="login-password" type="password" class="form-control" placeholder="${I18n.t('pwLabel')}" autocomplete="current-password">
          </div>
          <div id="login-error" style="color:var(--danger);font-size:12px;margin-bottom:10px;display:none"></div>
          <button class="btn btn-primary" style="width:100%;justify-content:center" onclick="App.doLogin()">${I18n.t('login')}</button>
          <div class="login-divider">${I18n.getLang() === 'ko' ? '또는' : 'or'}</div>
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
      msgEl.textContent = I18n.getLang() === 'ko' ? '아이디와 비밀번호를 입력하세요.' : 'Username and password are required.';
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
    if (!currentUser || currentUser.role !== 'admin') {
      showToast(I18n.getLang() === 'ko' ? '관리자 권한이 필요합니다.' : 'Admin access required.', 'error'); return;
    }
    AdminView.render();
  }

  function showSettings() {
    if (!currentUser) { showLogin(); return; }
    SettingsView.render();
  }

  async function logout() {
    try { await API.post('/auth/logout'); } catch {}
    currentUser = null;
    showLogin();
  }

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') Modal.close();
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
    toggleTheme, toggleLang,
  };
})();

// Boot
document.addEventListener('DOMContentLoaded', () => App.init());
