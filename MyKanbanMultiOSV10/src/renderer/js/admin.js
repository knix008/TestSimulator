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
            <button class="btn btn-ghost btn-sm" onclick="AdminView.showEdit(${u.id})">${I18n.t('edit')}</button>
            <button class="btn btn-sm" style="color:var(--danger);padding:4px 8px" onclick="AdminView.deleteUser(${u.id})">${I18n.t('delete')}</button>
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
            <th>${I18n.getLang() === 'ko' ? '권한' : 'Role'}</th>
            <th>${I18n.getLang() === 'ko' ? '상태' : 'Status'}</th>
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
            <button class="btn btn-primary btn-sm" onclick="AdminView.approveUser(${u.id})">${I18n.t('approve')}</button>
            <button class="btn btn-sm" style="color:var(--danger);padding:4px 8px" onclick="AdminView.rejectUser(${u.id})">${I18n.t('reject')}</button>
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
    Modal.open(`
      <button class="modal-close" onclick="Modal.close()">&#10005;</button>
      <h2 class="modal-title">${I18n.t('addUser')}</h2>
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
        <label>${I18n.getLang() === 'ko' ? '권한' : 'Role'}</label>
        <select id="cu-role" class="form-control">
          <option value="user">${I18n.t('user')}</option>
          <option value="admin">${I18n.t('admin')}</option>
        </select>
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">${I18n.t('cancel')}</button>
        <button class="btn btn-primary" onclick="AdminView.createUser()">${I18n.getLang() === 'ko' ? '추가' : 'Add'}</button>
      </div>`);
    document.getElementById('cu-username').focus();
  }

  async function createUser() {
    const username = document.getElementById('cu-username').value.trim();
    const password = document.getElementById('cu-password').value;
    const displayName = document.getElementById('cu-name').value.trim();
    const email = document.getElementById('cu-email').value.trim();
    const role = document.getElementById('cu-role').value;
    if (!username || !password) {
      showToast(I18n.getLang() === 'ko' ? '아이디와 비밀번호는 필수입니다.' : 'Username and password are required.', 'error'); return;
    }
    try {
      await API.post('/users', { username, password, displayName, email, role });
      Modal.close();
      showToast(I18n.getLang() === 'ko' ? '사용자가 추가되었습니다.' : 'User created.', 'success');
      render();
    } catch (err) { showToast(err.message, 'error'); }
  }

  function showEdit(id) {
    const u = users.find(u => u.id === id);
    if (!u) return;
    Modal.open(`
      <button class="modal-close" onclick="Modal.close()">&#10005;</button>
      <h2 class="modal-title">${I18n.t('edit')}: ${escHtml(u.username)}</h2>
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
          <label>${I18n.getLang() === 'ko' ? '권한' : 'Role'}</label>
          <select id="eu-role" class="form-control">
            <option value="user" ${u.role === 'user' ? 'selected' : ''}>${I18n.t('user')}</option>
            <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>${I18n.t('admin')}</option>
          </select>
        </div>
        <div class="form-group">
          <label>${I18n.getLang() === 'ko' ? '상태' : 'Status'}</label>
          <select id="eu-status" class="form-control">
            <option value="active" ${u.status === 'active' ? 'selected' : ''}>${I18n.t('active')}</option>
            <option value="inactive" ${u.status === 'inactive' ? 'selected' : ''}>${I18n.t('inactive')}</option>
            <option value="pending" ${u.status === 'pending' ? 'selected' : ''}>${I18n.t('pending')}</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>${I18n.t('newPw')} <span style="color:var(--text-muted);font-weight:400">(${I18n.getLang() === 'ko' ? '변경할 경우에만 입력' : 'leave blank to keep current'})</span></label>
        <input id="eu-password" type="password" class="form-control">
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">${I18n.t('cancel')}</button>
        <button class="btn btn-primary" onclick="AdminView.saveEdit(${id})">${I18n.t('save')}</button>
      </div>`);
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
      showToast(I18n.getLang() === 'ko' ? '저장되었습니다.' : 'Saved.', 'success');
      render();
    } catch (err) { showToast(err.message, 'error'); }
  }

  async function deleteUser(id) {
    if (!confirm(I18n.getLang() === 'ko' ? '이 사용자를 삭제하시겠습니까?' : 'Delete this user?')) return;
    try {
      await API.delete(`/users/${id}`);
      showToast(I18n.getLang() === 'ko' ? '삭제되었습니다.' : 'Deleted.', 'success');
      render();
    } catch (err) { showToast(err.message, 'error'); }
  }

  async function approveUser(id) {
    try {
      await API.patch(`/users/${id}/approve`);
      showToast(I18n.getLang() === 'ko' ? '승인되었습니다.' : 'Approved.', 'success');
      render();
    } catch (err) { showToast(err.message, 'error'); }
  }

  async function rejectUser(id) {
    if (!confirm(I18n.getLang() === 'ko' ? '이 등록 요청을 거부하고 삭제하시겠습니까?' : 'Reject and delete this request?')) return;
    try {
      await API.patch(`/users/${id}/reject`);
      showToast(I18n.getLang() === 'ko' ? '거부되었습니다.' : 'Rejected.', 'success');
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

  function renderDbSection(config) {
    const cur = config && (config.client === 'better-sqlite3' || config.client === 'sqlite3') ? 'sqlite' : (config ? config.client : 'sqlite');
    return `
      <div class="settings-section">
        <div class="settings-section-title">&#128452; ${I18n.t('dbSettings')}</div>
        <div class="settings-section-desc">${I18n.t('dbCurrent')}: ${curDbLabel(config)} — ${I18n.t('dbChangeWarn')}</div>
        <div class="db-type-grid">
          <div class="db-type-btn ${cur==='sqlite'?'selected':''}" data-type="sqlite" onclick="SettingsView.selectDb('sqlite',this)">SQLite3<br><small style="font-weight:400;color:inherit;opacity:.7">${I18n.getLang()==='ko'?'기본 (파일)':'Default (file)'}</small></div>
          <div class="db-type-btn ${cur==='mariadb'||cur==='mysql2'?'selected':''}" data-type="mariadb" onclick="SettingsView.selectDb('mariadb',this)">MariaDB<br><small style="font-weight:400;color:inherit;opacity:.7">${I18n.getLang()==='ko'?'원격 기본':'Remote default'}</small></div>
          <div class="db-type-btn" data-type="mysql" onclick="SettingsView.selectDb('mysql',this)">MySQL</div>
          <div class="db-type-btn" data-type="postgresql" onclick="SettingsView.selectDb('postgresql',this)">PostgreSQL</div>
          <div class="db-type-btn" data-type="mssql" onclick="SettingsView.selectDb('mssql',this)">MS SQL</div>
        </div>
        <div id="db-remote-fields" class="db-remote-fields">
          <div class="form-row">
            <div class="form-group"><label>${I18n.t('host')}</label><input id="db-host" class="form-control" value="${config?.connection?.host||''}" placeholder="localhost"></div>
            <div class="form-group"><label>${I18n.t('port')}</label><input id="db-port" class="form-control" value="${config?.connection?.port||''}" placeholder="3306"></div>
          </div>
          <div class="form-group"><label>${I18n.t('dbName')}</label><input id="db-name" class="form-control" value="${config?.connection?.database||''}" placeholder="kanban"></div>
          <div class="form-row">
            <div class="form-group"><label>${I18n.t('dbUser')}</label><input id="db-user" class="form-control" value="${config?.connection?.user||''}" placeholder="root"></div>
            <div class="form-group"><label>${I18n.t('dbPass')}</label><input id="db-pass" type="password" class="form-control"></div>
          </div>
        </div>
        <div id="db-sqlite-fields">
          <div class="form-group">
            <label>${I18n.t('dbFile')} <span style="color:var(--text-muted);font-weight:400">(${I18n.getLang()==='ko'?'비워두면 기본 경로 사용':'leave blank for default path'})</span></label>
            <input id="db-file" class="form-control" value="${config?.connection?.filename||''}">
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
      remote && (remote.style.display = 'none');
      sqlite && (sqlite.style.display = '');
    } else {
      remote && (remote.style.display = '');
      sqlite && (sqlite.style.display = 'none');
      const portDefaults = { mariadb: 3306, mysql: 3306, postgresql: 5432, mssql: 1433 };
      const portEl = document.getElementById('db-port');
      if (portEl && !portEl.value) portEl.value = portDefaults[type] || '';
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

  async function testDb() {
    const result = document.getElementById('db-test-result');
    result.className = 'test-result';
    result.textContent = I18n.getLang() === 'ko' ? '연결 테스트 중...' : 'Testing connection...';
    result.style.display = 'block';
    result.style.background = '#F1F5F9'; result.style.color = 'var(--text-muted)';
    try {
      const r = await API.post('/settings/db/test', getDbFormData());
      result.className = 'test-result success'; result.textContent = r.message;
    } catch (err) {
      result.className = 'test-result error'; result.textContent = err.message;
    }
  }

  async function saveDb() {
    const msg = I18n.getLang() === 'ko'
      ? 'DB를 변경하면 기존 DB의 데이터는 새 DB에 복사되지 않습니다. 계속하시겠습니까?'
      : 'Changing DB will not copy existing data. Continue?';
    if (!confirm(msg)) return;
    try {
      const r = await API.post('/settings/db', getDbFormData());
      showToast(r.message, 'success');
    } catch (err) { showToast(err.message, 'error'); }
  }

  async function resetDb() {
    const msg = I18n.getLang() === 'ko' ? 'SQLite3 기본 설정으로 초기화하시겠습니까?' : 'Reset to SQLite3 defaults?';
    if (!confirm(msg)) return;
    try {
      const r = await API.post('/settings/db/reset', {});
      showToast(r.message, 'success');
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
      showToast(I18n.getLang() === 'ko' ? '프로필이 저장되었습니다.' : 'Profile saved.', 'success');
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
        <button class="btn btn-primary" onclick="SettingsView.changePassword()">${I18n.getLang() === 'ko' ? '변경' : 'Change'}</button>
      </div>`;
  }

  async function changePassword() {
    const currentPassword = document.getElementById('pw-cur').value;
    const newPassword = document.getElementById('pw-new').value;
    const confirmPw = document.getElementById('pw-confirm').value;
    if (!currentPassword || !newPassword) {
      showToast(I18n.getLang() === 'ko' ? '모든 필드를 입력하세요.' : 'All fields required.', 'error'); return;
    }
    if (newPassword !== confirmPw) {
      showToast(I18n.getLang() === 'ko' ? '새 비밀번호가 일치하지 않습니다.' : 'Passwords do not match.', 'error'); return;
    }
    try {
      await API.post('/auth/change-password', { currentPassword, newPassword });
      showToast(I18n.getLang() === 'ko' ? '비밀번호가 변경되었습니다.' : 'Password changed.', 'success');
      document.getElementById('pw-cur').value = '';
      document.getElementById('pw-new').value = '';
      document.getElementById('pw-confirm').value = '';
    } catch (err) { showToast(err.message, 'error'); }
  }

  return { render, selectDb, testDb, saveDb, resetDb, saveProfile, changePassword };
})();
