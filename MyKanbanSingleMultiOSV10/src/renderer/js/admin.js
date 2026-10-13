/* ── Settings View ──────────────────────────────────────────────────────── */
const SettingsView = (() => {
  let selectedDbType = 'sqlite';

  async function render() {
    const main = document.getElementById('main-content');
    document.getElementById('breadcrumb').innerHTML =
      `<span onclick="App.showBoards()" style="cursor:pointer">${I18n.t('myBoards')}</span><span class="sep">/</span><span>${I18n.t('settings')}</span>`;

    const user = App.currentUser;
    let dbConfig = null;
    try { dbConfig = await API.get('/settings/db'); } catch {}

    main.innerHTML = `
      <div class="admin-wrap">
        <div class="page-header"><h1 class="page-title">${I18n.t('settings')}</h1>${saveButton()}</div>
        ${renderGeneralSection(user)}
        ${typeof Themes !== 'undefined' ? Themes.settingsSection() : ''}
        ${renderDbSection(dbConfig)}
        <div class="settings-save-row">${saveButton()}</div>
      </div>`;

    initDbTypeButtons();
    setupDisplayNameAutoSave(user);
  }

  function clientToUiType(config) {
    if (config?.client === 'json') return 'json';
    if (!config?.client) return 'sqlite';
    const m = { 'better-sqlite3': 'sqlite', sqlite3: 'sqlite', mysql2: 'mariadb', pg: 'postgresql', mssql: 'mssql' };
    return m[config.client] || 'sqlite';
  }

  function renderDbSection(config) {
    const cur = clientToUiType(config);
    selectedDbType = cur;
    const sqliteFile = config?.connection?.filename || '';
    return `
      <div class="settings-section">
        <div class="settings-section-title">${I18n.t('dbSettings')}</div>
        <div class="settings-section-desc">${I18n.t('dbChangeWarn')}</div>
        <div class="settings-status">${I18n.t('dbCurrent')}: ${escHtml(curDbLabel(config))}</div>
        <div class="db-type-grid">
          <div class="db-type-btn ${cur==='json'?'selected':''}" data-type="json" onclick="SettingsView.selectDb('json',this)">${I18n.t('dbNone')}<br><small style="font-weight:400;color:inherit;opacity:.7">${I18n.t('dbJsonHint')}</small></div>
          <div class="db-type-btn ${cur==='sqlite'?'selected':''}" data-type="sqlite" onclick="SettingsView.selectDb('sqlite',this)">SQLite3<br><small style="font-weight:400;color:inherit;opacity:.7">${I18n.t('dbSqliteDefault')}</small></div>
          <div class="db-type-btn ${cur==='mariadb'?'selected':''}" data-type="mariadb" onclick="SettingsView.selectDb('mariadb',this)">MariaDB<br><small style="font-weight:400;color:inherit;opacity:.7">${I18n.t('dbRemoteDefault')}</small></div>
          <div class="db-type-btn ${cur==='mysql'?'selected':''}" data-type="mysql" onclick="SettingsView.selectDb('mysql',this)">MySQL</div>
          <div class="db-type-btn ${cur==='postgresql'?'selected':''}" data-type="postgresql" onclick="SettingsView.selectDb('postgresql',this)">PostgreSQL</div>
          <div class="db-type-btn ${cur==='mssql'?'selected':''}" data-type="mssql" onclick="SettingsView.selectDb('mssql',this)">MS SQL</div>
        </div>
        <div id="db-remote-fields" class="db-remote-fields${cur==='sqlite'?'':' visible'}">
          <div class="db-fields-title">${I18n.t('dbConnSettings')}</div>
          <div class="form-row">
            <div class="form-group"><label>${I18n.t('host')}</label><input id="db-host" class="form-control" value="${escAttr(config?.connection?.host || config?.connection?.server || '')}" placeholder="localhost"></div>
            <div class="form-group"><label>${I18n.t('port')}</label><input id="db-port" class="form-control" value="${escAttr(String(config?.connection?.port || ''))}" placeholder="3306"></div>
          </div>
          <div class="form-group"><label>${I18n.t('dbName')}</label><input id="db-name" class="form-control" value="${escAttr(config?.connection?.database || '')}" placeholder="kanban"></div>
          <div class="form-row">
            <div class="form-group"><label>${I18n.t('dbUser')}</label><input id="db-user" class="form-control" value="${escAttr(config?.connection?.user || '')}" placeholder="root"></div>
            <div class="form-group"><label>${I18n.t('dbPass')}</label><input id="db-pass" type="password" class="form-control" placeholder="${I18n.t('pwOptionalHint')}"></div>
          </div>
        </div>
        <div id="db-json-fields"${cur==='json'?'':' class="hidden"'}>
          <div class="db-fields-title">${I18n.t('jsonStorage')}</div>
          <p class="settings-section-desc">${I18n.t('jsonStorageHint')}</p>
          <div class="form-group">
            <label>${I18n.t('jsonFile')} <span style="color:var(--text-muted);font-weight:400">(${I18n.t('jsonFileHint')})</span></label>
            <input id="db-json-file" class="form-control" value="${escAttr(cur==='json' ? (config?.connection?.filename || '') : '')}">
          </div>
        </div>
        <div id="db-sqlite-fields"${cur==='sqlite'?'':' class="hidden"'}>
          <div class="db-fields-title">${I18n.t('dbSqliteSettings')}</div>
          <div class="form-group">
            <label>${I18n.t('dbFile')} <span style="color:var(--text-muted);font-weight:400">(${I18n.t('dbFileHint')})</span></label>
            <div style="display:flex;gap:8px;align-items:stretch">
              <input id="db-file" class="form-control" value="${escAttr(sqliteFile)}" style="flex:1">
              ${typeof window.electron !== 'undefined' ? `<button type="button" class="btn btn-secondary btn-sm" onclick="SettingsView.browseSqliteFile()" title="${I18n.t('dbFileBrowse')}">&#128194;</button>` : ''}
            </div>
          </div>
        </div>
        <div id="db-test-result" class="test-result"></div>
        <div class="settings-actions">
          <button class="btn btn-secondary" onclick="SettingsView.testDb()">${I18n.t('testConn')}</button>
          <button class="btn btn-primary" onclick="SettingsView.saveDb()">${I18n.t('applyDb')}</button>
        </div>
        <div class="settings-reset">
          <p>${I18n.t('dbResetHint')}</p>
          <button class="btn btn-ghost btn-sm" onclick="SettingsView.resetDb()">${I18n.t('resetSqlite')}</button>
        </div>
      </div>`;
  }

  function curDbLabel(config) {
    if (config?.client === 'json') return 'JSON';
    if (!config) return 'SQLite3';
    const m = { 'better-sqlite3': 'SQLite3', sqlite3: 'SQLite3', mysql2: 'MySQL/MariaDB', pg: 'PostgreSQL', mssql: 'MS SQL Server' };
    const host = config.connection?.host || config.connection?.server || '';
    return (m[config.client] || config.client) + (host ? ` @ ${host}` : '');
  }

  function initDbTypeButtons() {
    const cur = document.querySelector('.db-type-btn.selected');
    if (cur) selectDb(cur.dataset.type, cur);
  }

  function selectDb(type, el) {
    selectedDbType = type;
    document.querySelectorAll('.db-type-btn').forEach(b => b.classList.remove('selected'));
    el.classList.add('selected');
    const remote = document.getElementById('db-remote-fields');
    const sqlite = document.getElementById('db-sqlite-fields');
    const json = document.getElementById('db-json-fields');
    if (type === 'json') {
      remote?.classList.remove('visible');
      sqlite?.classList.add('hidden');
      json?.classList.remove('hidden');
    } else if (type === 'sqlite') {
      remote?.classList.remove('visible');
      sqlite?.classList.remove('hidden');
      json?.classList.add('hidden');
    } else {
      remote?.classList.add('visible');
      sqlite?.classList.add('hidden');
      json?.classList.add('hidden');
      const portDefaults = { mariadb: 3306, mysql: 3306, postgresql: 5432, mssql: 1433 };
      const portEl = document.getElementById('db-port');
      if (portEl && !portEl.value) portEl.value = portDefaults[type] || '';
      const hostEl = document.getElementById('db-host');
      if (hostEl && !hostEl.value) hostEl.value = 'localhost';
    }
  }

  async function browseSqliteFile() {
    if (typeof window.electron === 'undefined' || !window.electron.openSqliteDialog) return;
    const result = await window.electron.openSqliteDialog();
    if (result?.ok && result.filePath) {
      const el = document.getElementById('db-file');
      if (el) el.value = result.filePath;
    }
  }

  function getDbFormData() {
    return {
      dbType: selectedDbType,
      host: document.getElementById('db-host')?.value.trim(),
      port: document.getElementById('db-port')?.value,
      database: document.getElementById('db-name')?.value.trim(),
      username: document.getElementById('db-user')?.value.trim(),
      password: document.getElementById('db-pass')?.value,
      filename: selectedDbType === 'json'
        ? document.getElementById('db-json-file')?.value.trim()
        : document.getElementById('db-file')?.value.trim(),
    };
  }

  const DB_FIELD_IDS = { host: 'db-host', database: 'db-name', username: 'db-user', port: 'db-port' };

  function validateDbForm() {
    const data = getDbFormData();
    const missing = [];
    if (data.dbType === 'sqlite' || data.dbType === 'json') return missing;
    if (!data.host) missing.push({ key: 'host', label: I18n.t('host') });
    if (!data.database) missing.push({ key: 'database', label: I18n.t('dbName') });
    if (!data.username) missing.push({ key: 'username', label: I18n.t('dbUser') });
    return missing;
  }

  function focusDbField(key) {
    const el = document.getElementById(DB_FIELD_IDS[key]);
    if (el) {
      el.focus();
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function showDbMissingPopup(missing) {
    Modal.dialog({
      title: I18n.t('dbMissingTitle'),
      icon: '🗄️',
      size: 'sm',
      body: `
        <p class="modal-message">${I18n.t('dbMissingIntro')}</p>
        <ul class="modal-bullet-list">${missing.map(m => `<li>${escHtml(m.label)}</li>`).join('')}</ul>`,
      footer: Modal.btn({ label: I18n.t('close'), icon: '✕', variant: 'primary', onclick: `Modal.close(); SettingsView.focusDbField('${missing[0].key}')` }),
    });
  }

  function showDbErrorPopup(message, title = I18n.t('dbConnFailed')) {
    showError(title, message);
  }

  function setDbTestResult(state, text) {
    const result = document.getElementById('db-test-result');
    if (!result) return;
    if (!state) {
      result.className = 'test-result';
      result.textContent = '';
      return;
    }
    result.className = `test-result ${state}`;
    result.textContent = text;
  }

  async function testDb() {
    const missing = validateDbForm();
    if (missing.length) {
      setDbTestResult('', '');
      showDbMissingPopup(missing);
      return;
    }

    setDbTestResult('loading', I18n.t('testingConn'));
    try {
      const r = await API.post('/settings/db/test', getDbFormData());
      setDbTestResult('success', r.message || I18n.t('dbConnSuccess'));
    } catch (err) {
      setDbTestResult('error', err.message);
      showDbErrorPopup(err.message);
    }
  }

  async function saveDb() {
    const missing = validateDbForm();
    if (missing.length) {
      showDbMissingPopup(missing);
      return;
    }
    const ok = await Modal.confirm({
      title: I18n.t('confirmContinue'),
      message: I18n.t('dbChangeConfirm'),
      confirmLabel: I18n.t('applyDb'),
      confirmIcon: '✓',
      danger: false,
      size: 'md',
    });
    if (!ok) return;
    try {
      const r = await API.post('/settings/db', getDbFormData());
      showToast(r.message, 'success');
      await App.reloadUser();
      App.updateStatusDb();
      render();
    } catch (err) {
      showDbErrorPopup(err.message, I18n.t('dbSaveFailed'));
    }
  }

  async function resetDb() {
    const ok = await Modal.confirm({
      title: I18n.t('confirmContinue'),
      message: I18n.t('dbResetConfirm'),
      confirmLabel: I18n.t('resetSqlite'),
      confirmIcon: '↺',
      danger: true,
    });
    if (!ok) return;
    try {
      const r = await API.post('/settings/db/reset', {});
      showToast(r.message, 'success');
      await App.reloadUser();
      App.updateStatusDb();
      render();
    } catch (err) { showDbErrorPopup(err.message, I18n.t('dbSaveFailed')); }
  }

  function renderGeneralSection(user) {
    return `
      <div class="settings-section">
        <div class="settings-section-title">${I18n.t('generalSettings')}</div>
        <div class="settings-section-desc">${I18n.t('displayNameHint')}</div>
        <div class="form-group">
          <label>${I18n.t('displayName')}</label>
          <input id="p-name" class="form-control" value="${escAttr(user.displayName || '')}">
        </div>
        <div class="profile-autosave-row">
          <span id="profile-autosave-status" class="autosave-status autosave-saved">${escHtml(I18n.t('autoSaved'))}</span>
        </div>
      </div>`;
  }

  function setupDisplayNameAutoSave(user) {
    const saveKey = 'profile';
    AutoSave.stop(saveKey);
    AutoSave.start(saveKey, {
      indicatorId: 'profile-autosave-status',
      initialPayload: { displayName: user.displayName || '' },
      collect: () => {
        const el = document.getElementById('p-name');
        if (!el) return null;
        return { displayName: el.value.trim() };
      },
      save: async (payload) => {
        await API.put('/auth/profile', { displayName: payload.displayName, email: user.email || '' });
        App.currentUser.displayName = payload.displayName;
        document.getElementById('header-username').textContent = payload.displayName || App.currentUser.username;
      },
    });
    const nameEl = document.getElementById('p-name');
    nameEl?.addEventListener('input', () => AutoSave.schedule(saveKey));
    nameEl?.addEventListener('blur', () => AutoSave.flush(saveKey));
  }

  async function saveProfile() {
    await AutoSave.flush('profile');
  }

  function saveButton() {
    return `<button type="button" class="btn btn-primary btn-save-settings" onclick="SettingsView.saveSettings()">&#128190; ${I18n.t('saveSettings')}</button>`;
  }

  async function saveSettings() {
    try {
      if (!(await AutoSave.flush('profile'))) return;
      const payload = Themes.persistPayload(I18n.getLang());
      try {
        localStorage.setItem('kanban-theme', payload.theme);
        localStorage.setItem('kanban-theme-id', payload.themeId);
        localStorage.setItem('kanban-custom-themes', JSON.stringify(payload.customThemes));
      } catch {}
      await API.put('/settings/app', payload);
      showToast(I18n.t('settingsSaved'), 'success');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function setPref(key, value) {
    localStorage.setItem(key, String(value));
  }

  return { render, selectDb, testDb, saveDb, resetDb, saveProfile, saveSettings, browseSqliteFile, focusDbField, setPref };
})();
