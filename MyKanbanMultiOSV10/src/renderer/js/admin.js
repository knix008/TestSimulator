/* ── Admin View (사용자 관리) ─────────────────────────────────────────────── */
const AdminView = (() => {
  let users = [];

  async function render() {
    const main = document.getElementById('main-content');
    main.innerHTML = `<div class="spinner-wrap"><div class="spinner"></div></div>`;
    document.getElementById('breadcrumb').innerHTML =
      `<span onclick="App.showBoards()" style="cursor:pointer">${I18n.t('myBoards')}</span><span class="sep">/</span><span>${I18n.t('userMgmt')}</span>`;

    try {
      users = await API.get('/users');
      const pendingCount = users.filter(u => u.status === 'pending').length;
      main.innerHTML = `
        <div class="admin-wrap">
          <div class="page-header">
            <h1 class="page-title">${I18n.t('userMgmt')}</h1>
            <button class="btn btn-primary" onclick="AdminView.showCreate()">${I18n.t('addUser')}</button>
          </div>
          <div class="tabs">
            <button class="tab-btn active" onclick="AdminView.switchTab('all',this)">${I18n.t('allUsers')}</button>
            <button class="tab-btn" onclick="AdminView.switchTab('pending',this)">${I18n.t('pendingApproval')} ${pendingCount > 0 ? `<span class="badge-count">(${pendingCount})</span>` : ''}</button>
          </div>
          <div id="tab-all" class="tab-pane active">${renderTable(users)}</div>
          <div id="tab-pending" class="tab-pane">${renderPendingTable(users.filter(u => u.status === 'pending'))}</div>
        </div>`;
    } catch (err) {
      main.innerHTML = `<div class="spinner-wrap">${err.message}</div>`;
    }
  }

  function switchTab(tab, btn) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${tab}`).classList.add('active');
  }

  function actionBtn(icon, label, onclick, variant = 'default') {
    return `<button type="button" class="btn-action btn-action-${variant}" onclick="${onclick}" title="${escAttr(label)}"><span class="btn-action-icon" aria-hidden="true">${icon}</span><span>${escHtml(label)}</span></button>`;
  }

  function isProtectedAdmin(u) {
    return u.username === 'admin';
  }

  function renderTable(list) {
    if (!list.length) return `<div class="spinner-wrap" style="height:100px">${I18n.t('noUsers')}</div>`;
    const rows = list.map(u => `
      <tr>
        <td>${escHtml(u.username)}</td>
        <td>${escHtml(u.display_name || '-')}</td>
        <td>${escHtml(u.email || '-')}</td>
        <td><span class="badge badge-${u.role}">${u.role === 'admin' ? I18n.t('admin') : I18n.t('user')}</span></td>
        <td><span class="badge badge-${u.status}">${statusLabel(u.status)}</span></td>
        <td>${new Date(u.created_at).toLocaleDateString()}</td>
        <td>
          <div class="table-actions">
            ${actionBtn('&#9998;', I18n.t('edit'), `AdminView.showEdit(${u.id})`, 'edit')}
            ${isProtectedAdmin(u) ? '' : actionBtn('&#128465;', I18n.t('delete'), `AdminView.deleteUser(${u.id})`, 'delete')}
          </div>
        </td>
      </tr>`).join('');

    return `
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>${I18n.t('idLabel')}</th>
            <th>${I18n.t('nameLabel')}</th>
            <th>${I18n.t('emailLabel')}</th>
            <th>${I18n.t('role')}</th>
            <th>${I18n.t('status')}</th>
            <th>${I18n.t('createdAt')}</th>
            <th></th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function renderPendingTable(list) {
    if (!list.length) return `<div class="spinner-wrap" style="height:100px">${I18n.t('noPending')}</div>`;
    const rows = list.map(u => `
      <tr>
        <td>${escHtml(u.username)}</td>
        <td>${escHtml(u.display_name || '-')}</td>
        <td>${escHtml(u.email || '-')}</td>
        <td>${new Date(u.created_at).toLocaleDateString()}</td>
        <td>
          <div class="table-actions">
            ${actionBtn('&#10004;', I18n.t('approve'), `AdminView.approveUser(${u.id})`, 'approve')}
            ${actionBtn('&#10006;', I18n.t('reject'), `AdminView.rejectUser(${u.id})`, 'reject')}
          </div>
        </td>
      </tr>`).join('');

    return `
      <div class="table-wrap">
        <table>
          <thead><tr>
            <th>${I18n.t('idLabel')}</th>
            <th>${I18n.t('nameLabel')}</th>
            <th>${I18n.t('emailLabel')}</th>
            <th>${I18n.t('createdAt')}</th>
            <th></th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function statusLabel(s) {
    return { active: I18n.t('active'), pending: I18n.t('pending'), inactive: I18n.t('inactive') }[s] || s;
  }

  function showCreate() {
    Modal.dialog({
      title: I18n.t('addUser'),
      size: 'md',
      body: `
      <div class="form-row">
        <div class="form-group">
          <label>${I18n.t('idLabel')} *</label>
          <input id="cu-username" class="form-control" autofocus>
        </div>
        <div class="form-group">
          <label>${I18n.t('pwLabel')} *</label>
          <input id="cu-password" type="password" class="form-control">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>${I18n.t('displayName')}</label>
          <input id="cu-name" class="form-control">
        </div>
        <div class="form-group">
          <label>${I18n.t('emailLabel')}</label>
          <input id="cu-email" type="email" class="form-control">
        </div>
      </div>
      <div class="form-group">
        <label>${I18n.t('role')}</label>
        <select id="cu-role" class="form-control">
          <option value="user">${I18n.t('user')}</option>
          <option value="admin">${I18n.t('admin')}</option>
        </select>
      </div>`,
      footer: Modal.footerCancelPrimary(I18n.t('addBtn'), 'AdminView.createUser()'),
    });
    document.getElementById('cu-username').focus();
  }

  async function createUser() {
    const username = document.getElementById('cu-username').value.trim();
    const password = document.getElementById('cu-password').value;
    const displayName = document.getElementById('cu-name').value.trim();
    const email = document.getElementById('cu-email').value.trim();
    const role = document.getElementById('cu-role').value;
    if (!username || !password) {
      showToast(I18n.t('userPwRequired'), 'error'); return;
    }
    try {
      await API.post('/users', { username, password, displayName, email, role });
      Modal.close();
      showToast(I18n.t('userCreated'), 'success');
      render();
    } catch (err) { showToast(err.message, 'error'); }
  }

  function showEdit(id) {
    const u = users.find(u => u.id === id);
    if (!u) return;
    Modal.dialog({
      title: `${I18n.t('edit')}: ${u.username}`,
      size: 'md',
      body: `
      <div class="form-row">
        <div class="form-group">
          <label>${I18n.t('displayName')}</label>
          <input id="eu-name" class="form-control" value="${escHtml(u.display_name || '')}">
        </div>
        <div class="form-group">
          <label>${I18n.t('emailLabel')}</label>
          <input id="eu-email" type="email" class="form-control" value="${escHtml(u.email || '')}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>${I18n.t('role')}</label>
          <select id="eu-role" class="form-control">
            <option value="user" ${u.role === 'user' ? 'selected' : ''}>${I18n.t('user')}</option>
            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>${I18n.t('admin')}</option>
          </select>
        </div>
        <div class="form-group">
          <label>${I18n.t('status')}</label>
          <select id="eu-status" class="form-control">
            <option value="active" ${u.status === 'active' ? 'selected' : ''}>${I18n.t('active')}</option>
            <option value="inactive" ${u.status === 'inactive' ? 'selected' : ''}>${I18n.t('inactive')}</option>
            <option value="pending" ${u.status === 'pending' ? 'selected' : ''}>${I18n.t('pending')}</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>${I18n.t('newPw')} <span class="form-hint">(${I18n.t('pwOptionalHint')})</span></label>
        <input id="eu-password" type="password" class="form-control">
      </div>`,
      footer: Modal.footerCancelPrimary(I18n.t('save'), `AdminView.saveEdit(${id})`),
    });
  }

  async function saveEdit(id) {
    const displayName = document.getElementById('eu-name').value.trim();
    const email = document.getElementById('eu-email').value.trim();
    const role = document.getElementById('eu-role').value;
    const status = document.getElementById('eu-status').value;
    const password = document.getElementById('eu-password').value;
    try {
      await API.put(`/users/${id}`, { displayName, email, role, status, password: password || undefined });
      Modal.close();
      showToast(I18n.t('userSaved'), 'success');
      render();
    } catch (err) { showToast(err.message, 'error'); }
  }

  async function deleteUser(id) {
    const u = users.find(user => user.id === id);
    if (u && isProtectedAdmin(u)) {
      showToast(I18n.t('cannotDeleteAdmin'), 'error');
      return;
    }
    if (!confirm(I18n.t('confirmDeleteUser'))) return;
    try {
      await API.delete(`/users/${id}`);
      showToast(I18n.t('userDeleted'), 'success');
      render();
    } catch (err) { showToast(err.message, 'error'); }
  }

  async function approveUser(id) {
    try {
      await API.patch(`/users/${id}/approve`);
      showToast(I18n.t('userApproved'), 'success');
      render();
    } catch (err) { showToast(err.message, 'error'); }
  }

  async function rejectUser(id) {
    if (!confirm(I18n.t('confirmRejectUser'))) return;
    try {
      await API.patch(`/users/${id}/reject`);
      showToast(I18n.t('userRejected'), 'success');
      render();
    } catch (err) { showToast(err.message, 'error'); }
  }

  return { render, switchTab, showCreate, createUser, showEdit, saveEdit, deleteUser, approveUser, rejectUser };
})();

/* ── Settings View ──────────────────────────────────────────────────────── */
const SettingsView = (() => {
  let selectedDbType = 'sqlite';

  async function render() {
    const main = document.getElementById('main-content');
    document.getElementById('breadcrumb').innerHTML =
      `<span onclick="App.showBoards()" style="cursor:pointer">${I18n.t('myBoards')}</span><span class="sep">/</span><span>${I18n.t('settings')}</span>`;

    const user = App.currentUser;
    const isAdmin = user.role === 'admin';

    let dbSection = '';
    if (isAdmin) {
      let dbConfig = null;
      try { dbConfig = await API.get('/settings/db'); } catch {}
      dbSection = renderDbSection(dbConfig);
    }

    main.innerHTML = `
      <div class="admin-wrap">
        <div class="page-header"><h1 class="page-title">${I18n.t('settings')}</h1></div>
        ${dbSection}
        ${renderProfileSection(user)}
        ${renderPasswordSection()}
      </div>`;

    if (isAdmin) initDbTypeButtons();
  }

  function clientToUiType(config) {
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
        <div class="settings-section-title">&#128452; ${I18n.t('dbSettings')}</div>
        <div class="settings-section-desc">${I18n.t('dbCurrent')}: ${curDbLabel(config)} — ${I18n.t('dbChangeWarn')}</div>
        <div class="db-type-grid">
          <div class="db-type-btn ${cur==='sqlite'?'selected':''}" data-type="sqlite" onclick="SettingsView.selectDb('sqlite',this)">SQLite3<br><small style="font-weight:400;color:inherit;opacity:.7">${I18n.t('dbSqliteDefault')}</small></div>
          <div class="db-type-btn ${cur==='mariadb'?'selected':''}" data-type="mariadb" onclick="SettingsView.selectDb('mariadb',this)">MariaDB<br><small style="font-weight:400;color:inherit;opacity:.7">${I18n.t('dbRemoteDefault')}</small></div>
          <div class="db-type-btn ${cur==='mysql'?'selected':''}" data-type="mysql" onclick="SettingsView.selectDb('mysql',this)">MySQL</div>
          <div class="db-type-btn ${cur==='postgresql'?'selected':''}" data-type="postgresql" onclick="SettingsView.selectDb('postgresql',this)">PostgreSQL</div>
          <div class="db-type-btn ${cur==='mssql'?'selected':''}" data-type="mssql" onclick="SettingsView.selectDb('mssql',this)">MS SQL</div>
        </div>
        <div id="db-remote-fields" class="db-remote-fields${cur==='sqlite'?'':' visible'}">
          <div class="db-fields-title">&#128279; ${I18n.t('dbConnSettings')}</div>
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
        <div id="db-sqlite-fields"${cur==='sqlite'?'':' class="hidden"'}>
          <div class="db-fields-title">&#128193; ${I18n.t('dbSqliteSettings')}</div>
          <div class="form-group">
            <label>${I18n.t('dbFile')} <span style="color:var(--text-muted);font-weight:400">(${I18n.t('dbFileHint')})</span></label>
            <div style="display:flex;gap:8px;align-items:stretch">
              <input id="db-file" class="form-control" value="${escAttr(sqliteFile)}" style="flex:1">
              ${typeof window.electron !== 'undefined' ? `<button type="button" class="btn btn-secondary btn-sm" onclick="SettingsView.browseSqliteFile()" title="${I18n.t('dbFileBrowse')}">&#128194;</button>` : ''}
            </div>
          </div>
        </div>
        <div id="db-test-result" class="test-result"></div>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="btn btn-secondary" onclick="SettingsView.testDb()">${I18n.t('testConn')}</button>
          <button class="btn btn-primary" onclick="SettingsView.saveDb()">${I18n.t('applyDb')}</button>
          <button class="btn btn-ghost btn-sm" onclick="SettingsView.resetDb()" style="margin-left:auto;color:var(--text-muted)">${I18n.t('resetSqlite')}</button>
        </div>
      </div>`;
  }

  function curDbLabel(config) {
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
    if (type === 'sqlite') {
      remote?.classList.remove('visible');
      sqlite?.classList.remove('hidden');
    } else {
      remote?.classList.add('visible');
      sqlite?.classList.add('hidden');
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
      filename: document.getElementById('db-file')?.value.trim(),
    };
  }

  const DB_FIELD_IDS = { host: 'db-host', database: 'db-name', username: 'db-user', port: 'db-port' };

  function validateDbForm() {
    const data = getDbFormData();
    const missing = [];
    if (data.dbType === 'sqlite') return missing;
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
      size: 'sm',
      body: `
        <p class="modal-message">${I18n.t('dbMissingIntro')}</p>
        <ul class="modal-bullet-list">${missing.map(m => `<li>${escHtml(m.label)}</li>`).join('')}</ul>`,
      footer: `<button type="button" class="btn btn-primary" onclick="Modal.close(); SettingsView.focusDbField('${missing[0].key}')">${I18n.t('close')}</button>`,
    });
  }

  function showDbErrorPopup(message) {
    Modal.dialog({
      title: I18n.t('dbConnFailed'),
      type: 'error',
      size: 'md',
      body: `<p class="modal-message">${escHtml(message)}</p>`,
      footer: `<button type="button" class="btn btn-primary" onclick="Modal.close()">${I18n.t('close')}</button>`,
    });
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
    const msg = I18n.t('dbChangeConfirm');
    if (!confirm(msg)) return;
    try {
      const r = await API.post('/settings/db', getDbFormData());
      showToast(r.message, 'success');
      App.updateStatusDb();
      if (r.requireRelogin) {
        await App.logout();
        return;
      }
      render();
    } catch (err) {
      showDbErrorPopup(err.message);
      showToast(err.message, 'error');
    }
  }

  async function resetDb() {
    const msg = I18n.t('dbResetConfirm');
    if (!confirm(msg)) return;
    try {
      const r = await API.post('/settings/db/reset', {});
      showToast(r.message, 'success');
      App.updateStatusDb();
      if (r.requireRelogin) {
        await App.logout();
        return;
      }
      render();
    } catch (err) { showToast(err.message, 'error'); }
  }

  function renderProfileSection(user) {
    return `
      <div class="settings-section">
        <div class="settings-section-title">&#128100; ${I18n.t('profile')}</div>
        <div class="form-group"><label>${I18n.t('idLabel')}</label><input class="form-control" value="${escHtml(user.username)}" disabled style="opacity:.6"></div>
        <div class="form-row">
          <div class="form-group"><label>${I18n.t('displayName')}</label><input id="p-name" class="form-control" value="${escHtml(user.displayName||'')}"></div>
          <div class="form-group"><label>${I18n.t('emailLabel')}</label><input id="p-email" type="email" class="form-control" value="${escHtml(user.email||'')}"></div>
        </div>
        <button class="btn btn-primary" onclick="SettingsView.saveProfile()">${I18n.t('save')}</button>
      </div>`;
  }

  async function saveProfile() {
    const displayName = document.getElementById('p-name').value.trim();
    const email = document.getElementById('p-email').value.trim();
    try {
      await API.put('/auth/profile', { displayName, email });
      App.currentUser.displayName = displayName;
      App.currentUser.email = email;
      document.getElementById('header-username').textContent = displayName || App.currentUser.username;
      showToast(I18n.t('profileSaved'), 'success');
    } catch (err) { showToast(err.message, 'error'); }
  }

  function renderPasswordSection() {
    return `
      <div class="settings-section">
        <div class="settings-section-title">&#128274; ${I18n.t('changePw')}</div>
        <div class="form-group"><label>${I18n.t('curPw')}</label><input id="pw-cur" type="password" class="form-control"></div>
        <div class="form-row">
          <div class="form-group"><label>${I18n.t('newPw')}</label><input id="pw-new" type="password" class="form-control"></div>
          <div class="form-group"><label>${I18n.t('confirmPw')}</label><input id="pw-confirm" type="password" class="form-control"></div>
        </div>
        <button class="btn btn-primary" onclick="SettingsView.changePassword()">${I18n.t('changeBtn')}</button>
      </div>`;
  }

  async function changePassword() {
    const currentPassword = document.getElementById('pw-cur').value;
    const newPassword = document.getElementById('pw-new').value;
    const confirmPw = document.getElementById('pw-confirm').value;
    if (!currentPassword || !newPassword) {
      showToast(I18n.t('allFieldsRequired'), 'error'); return;
    }
    if (newPassword !== confirmPw) {
      showToast(I18n.t('pwMismatch'), 'error'); return;
    }
    try {
      await API.post('/auth/change-password', { currentPassword, newPassword });
      showToast(I18n.t('pwChanged'), 'success');
      document.getElementById('pw-cur').value = '';
      document.getElementById('pw-new').value = '';
      document.getElementById('pw-confirm').value = '';
    } catch (err) { showToast(err.message, 'error'); }
  }

  return { render, selectDb, testDb, saveDb, resetDb, saveProfile, changePassword, browseSqliteFile, focusDbField };
})();
