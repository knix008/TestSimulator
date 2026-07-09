/* ── Project / Board View ────────────────────────────────────────────────── */
const BoardView = (() => {
  let currentBoardId = null;
  let currentPermissions = null;
  let boardData = null;
  let users = [];
  let drag = null;

  const CARD_COLORS = [
    { value: '', label: '기본' },
    { value: 'blue', label: '파랑', hex: '#6366F1' },
    { value: 'green', label: '초록', hex: '#22C55E' },
    { value: 'yellow', label: '노랑', hex: '#F59E0B' },
    { value: 'orange', label: '주황', hex: '#F97316' },
    { value: 'red', label: '빨강', hex: '#EF4444' },
    { value: 'purple', label: '보라', hex: '#A855F7' },
    { value: 'pink', label: '분홍', hex: '#EC4899' },
    { value: 'cyan', label: '청록', hex: '#06B6D4' },
  ];

  // ── Export / Import (.kprj) ───────────────────────────────────────────────

  async function exportProject(boardId, boardTitle) {
    if (typeof window.electron !== 'undefined') {
      try {
        const res = await fetch(`/api/boards/${boardId}/export`, { credentials: 'include' });
        const json = await res.text();
        const result = await window.electron.saveKprj(boardTitle, json);
        if (result.ok) showToast(I18n.t('exportSuccess') + ': ' + result.filePath.split(/[\\/]/).pop(), 'success');
        else if (!result.cancelled) showToast(result.error, 'error');
      } catch (err) { showToast(err.message, 'error'); }
    } else {
      // Web: trigger browser download
      const a = document.createElement('a');
      a.href = `/api/boards/${boardId}/export`;
      a.download = boardTitle.replace(/[^a-zA-Z0-9가-힣\s]/g, '_') + '.kprj';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast(I18n.t('exportSuccess'), 'success');
    }
  }

  async function importProject(jsonText) {
    try {
      const data = JSON.parse(jsonText);
      if (data.format !== 'mykanban-project') throw new Error('올바른 .kprj 파일이 아닙니다.');
      const board = await API.post('/boards/import', data);
      showToast(I18n.t('importSuccess'), 'success');
      return board;
    } catch (err) {
      showToast(I18n.t('importError') + ': ' + err.message, 'error');
      return null;
    }
  }

  async function importProjectFromDialog() {
    if (typeof window.electron !== 'undefined') {
      const result = await window.electron.openKprjDialog();
      if (!result || result.cancelled) return;
      if (!result.ok) { showToast(result.error, 'error'); return; }
      const board = await importProject(result.content);
      if (board) openBoard(board.id);
    } else {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = '.kprj';
      input.onchange = async () => {
        if (!input.files[0]) return;
        const text = await input.files[0].text();
        const board = await importProject(text);
        if (board) openBoard(board.id);
      };
      input.click();
    }
  }

  // Called when a .kprj file is double-clicked via OS file association (Electron)
  async function handleKprjFileOpen(filePath) {
    try {
      const res = await fetch(`/api/boards/import-file?path=${encodeURIComponent(filePath)}`, { credentials: 'include' });
      if (!res.ok) throw new Error('파일 읽기 실패');
      const data = await res.json();
      if (data.id) { showToast(I18n.t('importSuccess'), 'success'); openBoard(data.id); }
    } catch { /* ignore — will be retried via IPC */ }
  }

  // Register IPC listener
  if (typeof window.electron !== 'undefined' && window.electron.onOpenKprj) {
    window.electron.onOpenKprj((filePath) => handleKprjFileOpen(filePath));
  }

  // ── Project List ──────────────────────────────────────────────────────────

  async function renderBoardList() {
    const main = document.getElementById('main-content');
    main.innerHTML = `<div class="spinner-wrap"><div class="spinner"></div></div>`;
    document.getElementById('breadcrumb').innerHTML = '';

    try {
      const boards = await API.get('/boards');
      users = await API.get('/users/active').catch(() => []);

      if (boards.length === 0) {
        main.innerHTML = `
          <div class="page-wrap">
            <div class="page-header">
              <h1 class="page-title">${I18n.t('myBoards')}</h1>
              <div style="display:flex;gap:8px">
                <button class="btn btn-secondary" onclick="BoardView.importProjectFromDialog()">&#128229; ${I18n.t('importProject')}</button>
                <button class="btn btn-primary" onclick="BoardView.showCreateBoard()">${I18n.t('newBoard')}</button>
              </div>
            </div>
            <div class="board-empty">
              <div class="icon">&#9783;</div>
              <p>${I18n.t('boardEmpty')}</p>
            </div>
          </div>`;
      } else {
        const roleLabel = { owner: I18n.t('roleAdmin'), 'system-admin': I18n.t('admin'), admin: I18n.t('roleAdmin'), editor: I18n.t('roleEditor'), viewer: I18n.t('roleViewer') };
        const cards = boards.map(b => `
          <div class="board-card" onclick="BoardView.openBoard(${b.id})">
            <div class="board-card-actions">
              ${b.myRole !== 'viewer' ? `<button class="board-card-btn" onclick="event.stopPropagation();BoardView.editBoard(${b.id},'${escHtml(b.title)}','${escHtml(b.description||'')}')" title="${I18n.t('edit')}">&#9998;</button>` : ''}
              <button class="board-card-btn" onclick="event.stopPropagation();BoardView.exportProject(${b.id},'${escHtml(b.title)}')" title="${I18n.t('exportProject')}">&#128229;</button>
            ${['owner','system-admin'].includes(b.myRole) ? `<button class="board-card-btn" onclick="event.stopPropagation();BoardView.deleteBoard(${b.id})" title="${I18n.t('delete')}" style="color:#EF4444">&#128465;</button>` : ''}
            </div>
            <span class="role-badge role-${b.myRole === 'system-admin' ? 'owner' : b.myRole}">${roleLabel[b.myRole] || b.myRole}</span>
            <div class="board-card-title">${escHtml(b.title)}</div>
            <div class="board-card-desc">${escHtml(b.description || '')}</div>
            <div class="board-card-meta">${I18n.t('owner')}: ${escHtml(b.owner_name || '-')}</div>
          </div>`).join('');

        main.innerHTML = `
          <div class="page-wrap">
            <div class="page-header">
              <h1 class="page-title">${I18n.t('myBoards')}</h1>
              <div style="display:flex;gap:8px">
                <button class="btn btn-secondary" onclick="BoardView.importProjectFromDialog()">&#128229; ${I18n.t('importProject')}</button>
                <button class="btn btn-primary" onclick="BoardView.showCreateBoard()">${I18n.t('newBoard')}</button>
              </div>
            </div>
            <div class="boards-grid">${cards}</div>
          </div>`;
      }
    } catch (err) {
      main.innerHTML = `<div class="spinner-wrap">${err.message}</div>`;
    }
  }

  function showCreateBoard() {
    Modal.open(`
      <button class="modal-close" onclick="Modal.close()">&#10005;</button>
      <h2 class="modal-title">${I18n.t('createBoard')}</h2>
      <div class="form-group">
        <label>${I18n.t('boardName')}</label>
        <input id="new-board-title" class="form-control" placeholder="${I18n.t('boardName')}">
      </div>
      <div class="form-group">
        <label>${I18n.t('boardDesc')}</label>
        <input id="new-board-desc" class="form-control" placeholder="...">
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">${I18n.t('cancel')}</button>
        <button class="btn btn-primary" onclick="BoardView.createBoard()">${I18n.t('create')}</button>
      </div>`);
    document.getElementById('new-board-title').focus();
    document.getElementById('new-board-title').addEventListener('keydown', e => { if (e.key === 'Enter') createBoard(); });
  }

  async function createBoard() {
    const title = document.getElementById('new-board-title').value.trim();
    const description = document.getElementById('new-board-desc').value.trim();
    if (!title) { showToast(I18n.t('boardName') + ' 필수', 'error'); return; }
    try {
      const board = await API.post('/boards', { title, description });
      Modal.close();
      showToast(I18n.t('create') + ' 완료', 'success');
      openBoard(board.id);
    } catch (err) { showToast(err.message, 'error'); }
  }

  function editBoard(id, title, desc) {
    Modal.open(`
      <button class="modal-close" onclick="Modal.close()">&#10005;</button>
      <h2 class="modal-title">${I18n.t('edit')}</h2>
      <div class="form-group">
        <label>${I18n.t('boardName')}</label>
        <input id="edit-board-title" class="form-control" value="${escHtml(title)}">
      </div>
      <div class="form-group">
        <label>${I18n.t('boardDesc')}</label>
        <input id="edit-board-desc" class="form-control" value="${escHtml(desc)}">
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">${I18n.t('cancel')}</button>
        <button class="btn btn-primary" onclick="BoardView.saveEditBoard(${id})">${I18n.t('save')}</button>
      </div>`);
  }

  async function saveEditBoard(id) {
    const title = document.getElementById('edit-board-title').value.trim();
    const description = document.getElementById('edit-board-desc').value.trim();
    if (!title) return;
    try {
      await API.put(`/boards/${id}`, { title, description });
      Modal.close();
      showToast(I18n.t('save') + ' 완료', 'success');
      renderBoardList();
    } catch (err) { showToast(err.message, 'error'); }
  }

  async function deleteBoard(id) {
    if (!confirm(I18n.t('delete') + '?')) return;
    try {
      await API.delete(`/boards/${id}`);
      showToast(I18n.t('delete') + ' 완료', 'success');
      renderBoardList();
    } catch (err) { showToast(err.message, 'error'); }
  }

  // ── Board / Kanban View ───────────────────────────────────────────────────

  async function openBoard(boardId) {
    currentBoardId = boardId;
    document.getElementById('main-content').innerHTML =
      `<div id="board-view"><div class="spinner-wrap"><div class="spinner"></div></div></div>`;
    try {
      users = await API.get('/users/active').catch(() => []);
      await loadBoard();
    } catch (err) {
      document.getElementById('main-content').innerHTML = `<div class="spinner-wrap">${err.message}</div>`;
    }
  }

  async function loadBoard() {
    try {
      const response = await API.get(`/boards/${currentBoardId}/columns`);
      // Handle both old array format and new {permissions, columns} format
      if (Array.isArray(response)) {
        boardData = response;
        currentPermissions = { myRole: 'system-admin', canEdit: true, canManageMembers: true, canDeleteProject: true };
      } else {
        boardData = response.columns;
        currentPermissions = response.permissions;
      }
      renderBoard();
    } catch (err) { showToast('로드 실패: ' + err.message, 'error'); }
  }

  function renderBoard() {
    const perm = currentPermissions;
    const breadcrumb = document.getElementById('breadcrumb');
    breadcrumb.innerHTML = `<span onclick="App.showBoards()">${I18n.t('myBoards')}</span><span class="sep">/</span><span>...</span>`;

    document.getElementById('main-content').innerHTML = `
      <div id="board-view">
        <div class="board-toolbar">
          <button class="btn btn-ghost btn-sm" onclick="App.showBoards()">${I18n.t('backToBoards')}</button>
          <span class="board-toolbar-title" id="board-title-lbl">프로젝트</span>
          <div class="board-toolbar-right">
            <button class="btn btn-secondary btn-sm" onclick="BoardView.showSummary()">${I18n.t('summary')}</button>
            ${perm.canManageMembers ? `<button class="btn btn-secondary btn-sm" onclick="BoardView.showMembers()">&#128100; ${I18n.t('members')}</button>` : ''}
            <button class="btn btn-secondary btn-sm" id="btn-export-board" onclick="BoardView.exportCurrentBoard()">&#128229;</button>
            ${perm.canEdit ? `<button class="btn btn-primary btn-sm" onclick="BoardView.promptAddColumn()">${I18n.t('addColumn')}</button>` : ''}
          </div>
        </div>
        <div class="columns-container" id="columns-container">
          ${boardData.map(col => renderColumn(col)).join('')}
          ${perm.canEdit ? `<div class="add-col-btn" onclick="BoardView.promptAddColumn()">${I18n.t('addColumn')}</div>` : ''}
        </div>
      </div>`;

    // Load board title from server
    API.get('/boards').then(boards => {
      const b = boards.find(x => x.id == currentBoardId);
      if (b) {
        document.getElementById('board-title-lbl') && (document.getElementById('board-title-lbl').textContent = b.title);
        const crumb = document.getElementById('breadcrumb');
        if (crumb) crumb.innerHTML = `<span onclick="App.showBoards()" style="cursor:pointer">${I18n.t('myBoards')}</span><span class="sep">/</span><span>${escHtml(b.title)}</span>`;
      }
    }).catch(() => {});

    initDragAndDrop();
  }

  function renderColumn(col) {
    const perm = currentPermissions;
    const cards = col.cards.map((c, idx) => `
      <div class="drop-zone" data-col="${col.id}" data-pos="${idx}"></div>
      ${renderCard(c, col.id)}`).join('');

    return `
      <div class="column" data-col-id="${col.id}">
        <div class="column-header">
          <span class="column-title" id="col-title-${col.id}" ${perm.canEdit ? `ondblclick="BoardView.startEditColTitle(${col.id})"` : ''}>${escHtml(col.title)}</span>
          <span class="column-count">${col.cards.length}</span>
          ${perm.canEdit ? `<button class="column-menu" onclick="BoardView.showColumnMenu(event,${col.id})">&#8942;</button>` : ''}
        </div>
        <div class="cards-list" id="cards-list-${col.id}">
          ${cards}
          <div class="drop-zone" data-col="${col.id}" data-pos="${col.cards.length}"></div>
        </div>
        ${perm.canEdit ? `<button class="add-card-btn" onclick="BoardView.showAddCard(${col.id})">${I18n.t('addCard')}</button>` : ''}
      </div>`;
  }

  function renderCard(card, colId) {
    const dueCls = dueDateClass(card.due_date);
    const dueBadge = card.due_date ? `<span class="card-due ${dueCls}">${formatDate(card.due_date)}</span>` : '';
    const assigneeBadge = card.assignee_name ? `<span class="card-assignee">${escHtml(card.assignee_name)}</span>` : '';
    const attachBadge = card.attachment_count > 0 ? `<span class="card-attach">&#128206; ${card.attachment_count}</span>` : '';
    const colorAttr = card.color ? `data-color="${card.color}"` : '';

    return `
      <div class="card" draggable="${currentPermissions.canEdit}" ${colorAttr} data-card-id="${card.id}" data-col-id="${colId}"
           onclick="BoardView.openCard(${card.id})"
           ondragstart="BoardView.onDragStart(event,${card.id},${colId})"
           ondragend="BoardView.onDragEnd(event)">
        <div class="card-title">${escHtml(card.title)}</div>
        <div class="card-meta">${assigneeBadge}${dueBadge}${attachBadge}</div>
      </div>`;
  }

  // ── Drag & Drop ───────────────────────────────────────────────────────────

  function initDragAndDrop() {
    document.querySelectorAll('.drop-zone').forEach(dz => {
      dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over'); });
      dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
      dz.addEventListener('drop', e => {
        e.preventDefault();
        dz.classList.remove('drag-over');
        if (!drag) return;
        moveCard(drag.cardId, dz.dataset.col, parseInt(dz.dataset.pos));
      });
    });
  }

  function onDragStart(e, cardId, colId) {
    if (!currentPermissions.canEdit) { e.preventDefault(); return; }
    drag = { cardId, colId };
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => e.target.classList.add('dragging'), 0);
  }

  function onDragEnd(e) {
    e.target.classList.remove('dragging');
    drag = null;
    document.querySelectorAll('.drop-zone').forEach(dz => dz.classList.remove('drag-over'));
  }

  async function moveCard(cardId, targetColId, position) {
    try {
      await API.post(`/boards/${currentBoardId}/cards/${cardId}/move`, { targetColumnId: targetColId, position });
      await loadBoard();
    } catch (err) { showToast(err.message, 'error'); await loadBoard(); }
  }

  // ── Column actions ────────────────────────────────────────────────────────

  function showColumnMenu(e, colId) {
    e.stopPropagation();
    document.querySelector('.ctx-menu')?.remove();
    const menu = document.createElement('div');
    menu.className = 'ctx-menu';
    menu.innerHTML = `
      <button onclick="BoardView.startEditColTitle(${colId});document.querySelector('.ctx-menu')?.remove()">&#9998; ${I18n.t('renameColumn')}</button>
      <button class="danger" onclick="BoardView.deleteColumn(${colId});document.querySelector('.ctx-menu')?.remove()">&#128465; ${I18n.t('deleteColumn')}</button>`;
    const rect = e.target.getBoundingClientRect();
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.right = `${window.innerWidth - rect.right}px`;
    document.body.appendChild(menu);
    setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 0);
  }

  function startEditColTitle(colId) {
    const span = document.getElementById(`col-title-${colId}`);
    if (!span) return;
    const old = span.textContent;
    span.style.display = 'none';
    const wrap = document.createElement('div');
    wrap.className = 'inline-edit';
    wrap.innerHTML = `<input value="${escHtml(old)}" style="flex:1">
      <button class="btn btn-primary btn-sm" onclick="saveColTitle(${colId})">${I18n.t('save')}</button>
      <button class="btn btn-secondary btn-sm" onclick="cancelColEdit(${colId})">${I18n.t('cancel')}</button>`;
    span.parentElement.insertBefore(wrap, span);
    wrap.querySelector('input').focus();
    wrap.querySelector('input').addEventListener('keydown', e => {
      if (e.key === 'Enter') saveColTitle(colId);
      if (e.key === 'Escape') cancelColEdit(colId);
    });
    window.saveColTitle = async (id) => {
      const val = wrap.querySelector('input').value.trim();
      if (!val) return;
      try { await API.put(`/boards/${currentBoardId}/columns/${id}`, { title: val }); await loadBoard(); }
      catch (err) { showToast(err.message, 'error'); }
    };
    window.cancelColEdit = () => { wrap.remove(); span.style.display = ''; };
  }

  async function deleteColumn(colId) {
    if (!confirm(I18n.t('deleteColumn') + '?')) return;
    try { await API.delete(`/boards/${currentBoardId}/columns/${colId}`); await loadBoard(); }
    catch (err) { showToast(err.message, 'error'); }
  }

  async function promptAddColumn() {
    Modal.open(`
      <button class="modal-close" onclick="Modal.close()">&#10005;</button>
      <h2 class="modal-title">${I18n.t('addColumn')}</h2>
      <div class="form-group">
        <label>컬럼 이름 *</label>
        <input id="new-col-title" class="form-control" autofocus>
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">${I18n.t('cancel')}</button>
        <button class="btn btn-primary" onclick="BoardView.addColumn()">${I18n.t('addColumn')}</button>
      </div>`);
    document.getElementById('new-col-title').addEventListener('keydown', e => { if (e.key === 'Enter') addColumn(); });
  }

  async function addColumn() {
    const title = document.getElementById('new-col-title').value.trim();
    if (!title) return;
    try {
      await API.post(`/boards/${currentBoardId}/columns`, { title });
      Modal.close();
      await loadBoard();
    } catch (err) { showToast(err.message, 'error'); }
  }

  // ── Card actions ──────────────────────────────────────────────────────────

  function colorPickerHtml(selectedColor) {
    return `
      <div class="form-group">
        <label>${I18n.t('cardColor')}</label>
        <div class="color-picker-row">
          ${CARD_COLORS.map(c => `
            <div class="color-dot ${c.value === selectedColor ? 'selected' : ''}"
                 style="background:${c.hex || 'var(--bg-col)'}; ${!c.hex ? 'border:1px solid var(--border)' : ''}"
                 title="${c.label}" data-color-val="${c.value}"
                 onclick="document.querySelectorAll('.color-dot').forEach(d=>d.classList.remove('selected'));this.classList.add('selected')"></div>
          `).join('')}
        </div>
      </div>`;
  }

  function getSelectedColor() {
    const sel = document.querySelector('.color-dot.selected');
    return sel ? sel.dataset.colorVal : '';
  }

  function showAddCard(colId) {
    const userOptions = users.map(u =>
      `<option value="${u.id}">${escHtml(u.display_name || u.username)}</option>`).join('');
    Modal.open(`
      <button class="modal-close" onclick="Modal.close()">&#10005;</button>
      <h2 class="modal-title">${I18n.t('addCardTitle')}</h2>
      <div class="form-group">
        <label>${I18n.t('cardTitle')}</label>
        <input id="new-card-title" class="form-control" autofocus>
      </div>
      <div class="form-group">
        <label>${I18n.t('cardDesc')}</label>
        <textarea id="new-card-desc" class="form-control"></textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>${I18n.t('assignee')}</label>
          <select id="new-card-assignee" class="form-control"><option value="">${I18n.t('none')}</option>${userOptions}</select>
        </div>
        <div class="form-group">
          <label>${I18n.t('dueDate')}</label>
          <input type="date" id="new-card-due" class="form-control">
        </div>
      </div>
      ${colorPickerHtml('')}
      <div class="form-actions">
        <button class="btn btn-secondary" onclick="Modal.close()">${I18n.t('cancel')}</button>
        <button class="btn btn-primary" onclick="BoardView.createCard(${colId})">${I18n.t('addCardTitle')}</button>
      </div>`);
    document.getElementById('new-card-title').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) createCard(colId); });
  }

  async function createCard(colId) {
    const title = document.getElementById('new-card-title').value.trim();
    const description = document.getElementById('new-card-desc').value.trim();
    const assigneeId = document.getElementById('new-card-assignee').value;
    const dueDate = document.getElementById('new-card-due').value;
    const color = getSelectedColor();
    if (!title) { showToast(I18n.t('cardTitle'), 'error'); return; }
    try {
      await API.post(`/boards/${currentBoardId}/cards`, { columnId: colId, title, description, assigneeId, dueDate, color });
      Modal.close();
      await loadBoard();
    } catch (err) { showToast(err.message, 'error'); }
  }

  async function openCard(cardId) {
    try {
      const card = await API.get(`/boards/${currentBoardId}/cards/${cardId}`);
      const canEdit = currentPermissions.canEdit;
      const userOptions = users.map(u =>
        `<option value="${u.id}" ${card.assignee_id == u.id ? 'selected' : ''}>${escHtml(u.display_name || u.username)}</option>`).join('');

      const attachHtml = card.attachments.length > 0
        ? card.attachments.map(a => `
            <div class="attachment-item" id="attach-${a.id}">
              <a href="/uploads/${a.filename}" target="_blank" class="attachment-name">${escHtml(a.original_name)}</a>
              <span class="attachment-size">${fileSize(a.size)}</span>
              ${canEdit ? `<button class="attachment-del btn-icon" onclick="BoardView.deleteAttachment(${cardId},${a.id})">&#10005;</button>` : ''}
            </div>`).join('')
        : `<div style="font-size:12px;color:var(--text-light);padding:4px 0">${I18n.t('noAttach')}</div>`;

      Modal.open(`
        <button class="modal-close" onclick="Modal.close()">&#10005;</button>
        <h2 class="modal-title">${I18n.t('cardEdit')}</h2>
        <div class="form-group">
          <label>${I18n.t('cardTitle')}</label>
          <input id="ec-title" class="form-control" value="${escHtml(card.title)}" ${!canEdit ? 'readonly' : ''}>
        </div>
        <div class="form-group">
          <label>${I18n.t('cardDesc')}</label>
          <textarea id="ec-desc" class="form-control" ${!canEdit ? 'readonly' : ''}>${escHtml(card.description || '')}</textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>${I18n.t('assignee')}</label>
            <select id="ec-assignee" class="form-control" ${!canEdit ? 'disabled' : ''}>
              <option value="">${I18n.t('none')}</option>${userOptions}
            </select>
          </div>
          <div class="form-group">
            <label>${I18n.t('dueDate')}</label>
            <input type="date" id="ec-due" class="form-control" value="${card.due_date ? card.due_date.substring(0,10) : ''}" ${!canEdit ? 'readonly' : ''}>
          </div>
        </div>
        ${canEdit ? colorPickerHtml(card.color || '') : ''}
        <div class="modal-section">
          <div class="modal-section-title">${I18n.t('attachments')}</div>
          <div class="attachment-list" id="attach-list">${attachHtml}</div>
          ${canEdit ? `<label class="upload-btn">&#128206; ${I18n.t('attachFile')}<input type="file" id="attach-input" multiple onchange="BoardView.uploadAttachment(${cardId})"></label>` : ''}
        </div>
        <div class="form-actions">
          ${canEdit ? `<button class="btn btn-danger btn-sm" onclick="BoardView.deleteCard(${cardId})" style="margin-right:auto">&#128465; ${I18n.t('deleteCard')}</button>` : ''}
          <button class="btn btn-secondary" onclick="Modal.close()">${I18n.t('cancel')}</button>
          ${canEdit ? `<button class="btn btn-primary" onclick="BoardView.saveCard(${cardId})">${I18n.t('save')}</button>` : ''}
        </div>`);
    } catch (err) { showToast(err.message, 'error'); }
  }

  async function saveCard(cardId) {
    const title = document.getElementById('ec-title').value.trim();
    const description = document.getElementById('ec-desc').value.trim();
    const assigneeId = document.getElementById('ec-assignee').value;
    const dueDate = document.getElementById('ec-due').value;
    const color = getSelectedColor();
    if (!title) return;
    try {
      await API.put(`/boards/${currentBoardId}/cards/${cardId}`, { title, description, assigneeId, dueDate, color });
      Modal.close();
      showToast(I18n.t('save') + ' 완료', 'success');
      await loadBoard();
    } catch (err) { showToast(err.message, 'error'); }
  }

  async function deleteCard(cardId) {
    if (!confirm(I18n.t('deleteCard') + '?')) return;
    try { await API.delete(`/boards/${currentBoardId}/cards/${cardId}`); Modal.close(); await loadBoard(); }
    catch (err) { showToast(err.message, 'error'); }
  }

  async function uploadAttachment(cardId) {
    const input = document.getElementById('attach-input');
    if (!input.files.length) return;
    for (const file of Array.from(input.files)) {
      const fd = new FormData(); fd.append('file', file);
      try {
        const attach = await API.upload(`/boards/${currentBoardId}/cards/${cardId}/attachments`, fd);
        const list = document.getElementById('attach-list');
        if (list.innerHTML.includes(I18n.t('noAttach'))) list.innerHTML = '';
        const item = document.createElement('div');
        item.className = 'attachment-item'; item.id = `attach-${attach.id}`;
        item.innerHTML = `<a href="/uploads/${attach.filename}" target="_blank" class="attachment-name">${escHtml(attach.original_name)}</a>
          <span class="attachment-size">${fileSize(attach.size)}</span>
          <button class="attachment-del btn-icon" onclick="BoardView.deleteAttachment(${cardId},${attach.id})">&#10005;</button>`;
        list.appendChild(item);
      } catch (err) { showToast('업로드 실패: ' + err.message, 'error'); }
    }
    input.value = '';
  }

  async function deleteAttachment(cardId, attachId) {
    try {
      await API.delete(`/boards/${currentBoardId}/cards/${cardId}/attachments/${attachId}`);
      document.getElementById(`attach-${attachId}`)?.remove();
    } catch (err) { showToast(err.message, 'error'); }
  }

  // ── Member management ─────────────────────────────────────────────────────

  async function showMembers() {
    try {
      const { owner, members } = await API.get(`/boards/${currentBoardId}/members`);
      const allUsers = await API.get('/users/active');
      const memberIds = new Set([
        ...(owner ? [owner.id] : []),
        ...members.map(m => m.id)
      ]);
      const nonMembers = allUsers.filter(u => !memberIds.has(u.id));

      const memberRows = members.map(m => `
        <div class="member-item" id="mitem-${m.id}">
          <div class="member-avatar">${(m.display_name || m.username || '?')[0].toUpperCase()}</div>
          <div class="member-info">
            <div class="member-name">${escHtml(m.display_name || m.username)}</div>
            <div class="member-username">@${escHtml(m.username)}</div>
          </div>
          <select class="member-role-select" onchange="BoardView.changeMemberRole(${m.id},this.value)">
            <option value="admin" ${m.role==='admin'?'selected':''}>${I18n.t('roleAdmin')}</option>
            <option value="editor" ${m.role==='editor'?'selected':''}>${I18n.t('roleEditor')}</option>
            <option value="viewer" ${m.role==='viewer'?'selected':''}>${I18n.t('roleViewer')}</option>
          </select>
          <button class="btn btn-sm" style="color:var(--danger)" onclick="BoardView.removeMember(${m.id})">${I18n.t('removeBtn')}</button>
        </div>`).join('') || `<div style="color:var(--text-muted);font-size:13px;padding:8px">멤버가 없습니다.</div>`;

      const nonMemberOptions = nonMembers.map(u =>
        `<option value="${u.id}">${escHtml(u.display_name || u.username)} (@${escHtml(u.username)})</option>`).join('');

      Modal.open(`
        <button class="modal-close" onclick="Modal.close()">&#10005;</button>
        <h2 class="modal-title">${I18n.t('memberMgmt')}</h2>
        ${owner ? `
          <div class="modal-section">
            <div class="modal-section-title">${I18n.t('projectOwner')}</div>
            <div class="member-item">
              <div class="member-avatar">${(owner.display_name || owner.username || '?')[0].toUpperCase()}</div>
              <div class="member-info">
                <div class="member-name">${escHtml(owner.display_name || owner.username)}</div>
                <div class="member-username">@${escHtml(owner.username)}</div>
              </div>
              <span class="member-owner-badge">${I18n.t('projectOwner')}</span>
            </div>
          </div>` : ''}
        <div class="modal-section">
          <div class="modal-section-title">멤버 (${members.length}명)</div>
          <div class="member-list" id="member-list">${memberRows}</div>
        </div>
        ${nonMembers.length > 0 ? `
          <div class="modal-section">
            <div class="modal-section-title">${I18n.t('addMember')}</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <select id="add-member-user" class="form-control" style="flex:1;min-width:160px">
                ${nonMemberOptions}
              </select>
              <select id="add-member-role" class="form-control" style="width:120px">
                <option value="editor">${I18n.t('roleEditor')}</option>
                <option value="viewer">${I18n.t('roleViewer')}</option>
                <option value="admin">${I18n.t('roleAdmin')}</option>
              </select>
              <button class="btn btn-primary btn-sm" onclick="BoardView.addMember()">${I18n.t('addMember')}</button>
            </div>
          </div>` : ''}
      `);
    } catch (err) { showToast(err.message, 'error'); }
  }

  async function addMember() {
    const userId = document.getElementById('add-member-user').value;
    const role = document.getElementById('add-member-role').value;
    if (!userId) return;
    try {
      await API.post(`/boards/${currentBoardId}/members`, { userId, role });
      showToast('멤버가 추가되었습니다.', 'success');
      showMembers();
    } catch (err) { showToast(err.message, 'error'); }
  }

  async function changeMemberRole(userId, role) {
    try {
      await API.put(`/boards/${currentBoardId}/members/${userId}`, { role });
    } catch (err) { showToast(err.message, 'error'); showMembers(); }
  }

  async function removeMember(userId) {
    try {
      await API.delete(`/boards/${currentBoardId}/members/${userId}`);
      document.getElementById(`mitem-${userId}`)?.remove();
    } catch (err) { showToast(err.message, 'error'); }
  }

  // ── Summary / Burndown ────────────────────────────────────────────────────

  async function showSummary() {
    const main = document.getElementById('main-content');
    main.innerHTML = `<div class="spinner-wrap"><div class="spinner"></div></div>`;

    try {
      const data = await API.get(`/boards/${currentBoardId}/summary`);
      const { columns, totalCards, completedCards, overdueCards, cardsByDate } = data;

      const totalNonZero = totalCards || 1;
      const colBars = columns.map(col => `
        <div class="col-bar-row">
          <div class="col-bar-label">${escHtml(col.title)}</div>
          <div class="col-bar-track"><div class="col-bar-fill" style="width:${(col.count/totalNonZero*100).toFixed(0)}%"></div></div>
          <div class="col-bar-count">${col.count}</div>
        </div>`).join('');

      // Prepare burndown data (last 30 days)
      const last30 = [];
      for (let i = 29; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        last30.push(d.toISOString().substring(0, 10));
      }
      const createdArr = last30.map(d => (cardsByDate[d] || {}).created || 0);
      const completedArr = last30.map(d => (cardsByDate[d] || {}).completed || 0);

      // Compute cumulative remaining (burndown)
      let cumCreated = 0; let cumCompleted = 0;
      const remainingArr = last30.map((d, i) => {
        cumCreated += createdArr[i];
        cumCompleted += completedArr[i];
        return cumCreated - cumCompleted;
      });

      main.innerHTML = `
        <div id="board-view">
          <div class="board-toolbar">
            <button class="btn btn-ghost btn-sm" onclick="BoardView.openBoard(${currentBoardId})">&#8592; 칸반 보드</button>
            <span class="board-toolbar-title">${I18n.t('summaryTitle')}</span>
          </div>
          <div class="summary-wrap">
            <div class="stat-grid">
              <div class="stat-card"><div class="stat-label">${I18n.t('totalCards')}</div><div class="stat-value">${totalCards}</div></div>
              <div class="stat-card"><div class="stat-label">${I18n.t('completedCards')}</div><div class="stat-value success">${completedCards}</div></div>
              <div class="stat-card"><div class="stat-label">${I18n.t('overdueCards')}</div><div class="stat-value ${overdueCards > 0 ? 'danger' : ''}">${overdueCards}</div></div>
              <div class="stat-card"><div class="stat-label">완료율</div><div class="stat-value">${totalCards > 0 ? Math.round(completedCards/totalCards*100) : 0}%</div></div>
            </div>
            <div class="chart-wrap">
              <div class="chart-title">컬럼별 카드 분포</div>
              <div class="col-dist">${colBars}</div>
            </div>
            <div class="chart-wrap">
              <div class="chart-title">${I18n.t('burndownChart')}</div>
              <canvas id="burndown-chart" style="max-height:300px"></canvas>
            </div>
          </div>
        </div>`;

      // Render burndown chart
      const ctx = document.getElementById('burndown-chart').getContext('2d');
      const isDark = document.documentElement.dataset.theme === 'dark';
      const gridColor = isDark ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.1)';
      const textColor = isDark ? '#94A3B8' : '#64748B';

      new Chart(ctx, {
        type: 'line',
        data: {
          labels: last30.map(d => d.substring(5)),
          datasets: [
            {
              label: '남은 카드 (번다운)',
              data: remainingArr,
              borderColor: '#6366F1',
              backgroundColor: 'rgba(99,102,241,.15)',
              fill: true,
              tension: 0.4,
              pointRadius: 2
            },
            {
              label: I18n.t('cardsCreated'),
              data: createdArr,
              borderColor: '#F59E0B',
              backgroundColor: 'transparent',
              borderDash: [5, 5],
              tension: 0.4,
              pointRadius: 2
            },
            {
              label: I18n.t('cardsCompleted'),
              data: completedArr,
              borderColor: '#22C55E',
              backgroundColor: 'transparent',
              borderDash: [5, 5],
              tension: 0.4,
              pointRadius: 2
            }
          ]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { labels: { color: textColor } }
          },
          scales: {
            x: { ticks: { color: textColor, maxTicksLimit: 10 }, grid: { color: gridColor } },
            y: { ticks: { color: textColor }, grid: { color: gridColor }, beginAtZero: true }
          }
        }
      });
    } catch (err) {
      main.innerHTML = `<div class="spinner-wrap">${err.message}</div>`;
    }
  }

  async function exportCurrentBoard() {
    if (!currentBoardId) return;
    const boards = await API.get('/boards').catch(() => []);
    const b = boards.find(x => x.id == currentBoardId);
    await exportProject(currentBoardId, b ? b.title : 'project');
  }

  return {
    renderBoardList, showCreateBoard, createBoard, editBoard, saveEditBoard, deleteBoard,
    openBoard, loadBoard,
    showColumnMenu, startEditColTitle, deleteColumn, promptAddColumn, addColumn,
    showAddCard, createCard, openCard, saveCard, deleteCard,
    uploadAttachment, deleteAttachment,
    onDragStart, onDragEnd,
    showMembers, addMember, changeMemberRole, removeMember,
    showSummary,
    exportProject, exportCurrentBoard, importProjectFromDialog, handleKprjFileOpen,
  };
})();
