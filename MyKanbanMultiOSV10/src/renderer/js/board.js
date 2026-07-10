/* ── Context menu utility ────────────────────────────────────────────────── */
const CtxMenu = (() => {
  let dismissTimer = null;

  function el() { return document.getElementById('ctx-menu'); }

  function clearDismiss() {
    if (dismissTimer) { clearTimeout(dismissTimer); dismissTimer = null; }
    document.removeEventListener('mousedown', onDismiss, true);
    document.removeEventListener('keydown', onKeyDismiss, true);
    document.removeEventListener('contextmenu', hide, true);
  }

  function onDismiss(e) {
    if (e.target.closest('#ctx-menu')) return;
    hide();
  }

  function onKeyDismiss(e) {
    if (e.key === 'Escape') hide();
  }

  function show(e, items) {
    e.preventDefault();
    e.stopPropagation();
    const menu = el();
    if (!menu || !items?.length) return;

    clearDismiss();
    hide();

    menu.innerHTML = '';
    items.forEach(item => {
      if (item.type === 'sep') {
        const d = document.createElement('div'); d.className = 'ctx-sep'; menu.appendChild(d); return;
      }
      const btn = document.createElement('button');
      if (item.danger) btn.className = 'danger';
      if (item.disabled) { btn.disabled = true; btn.style.opacity = '.5'; }
      if (item.tooltip) btn.title = item.tooltip;
      btn.innerHTML = (item.icon ? `<span class="ctx-icon">${item.icon}</span>` : '') + item.label;
      btn.onmousedown = (ev) => ev.preventDefault();
      btn.onclick = () => { hide(); item.action && item.action(); };
      menu.appendChild(btn);
    });

    const vw = window.innerWidth, vh = window.innerHeight;
    let x = e.clientX, y = e.clientY;
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    menu.classList.remove('hidden');

    requestAnimationFrame(() => {
      const w = menu.offsetWidth, h = menu.offsetHeight;
      if (x + w > vw - 8) x = Math.max(8, vw - w - 8);
      if (y + h > vh - 8) y = Math.max(8, vh - h - 8);
      menu.style.left = x + 'px';
      menu.style.top = y + 'px';
    });

    dismissTimer = setTimeout(() => {
      document.addEventListener('mousedown', onDismiss, true);
      document.addEventListener('keydown', onKeyDismiss, true);
      document.addEventListener('contextmenu', hide, true);
    }, 0);
  }

  function hide() {
    clearDismiss();
    el()?.classList.add('hidden');
  }

  return { show, hide };
})();

/* ── Status bar utility ──────────────────────────────────────────────────── */
function setStatus(msg, type) {
  const msgEl = document.getElementById('status-msg');
  const dot = document.getElementById('status-indicator');
  const text = msg || I18n.t('ready');
  if (msgEl) {
    if (text === I18n.t('ready')) {
      msgEl.dataset.statusKey = 'ready';
    } else {
      delete msgEl.dataset.statusKey;
    }
    msgEl.textContent = text;
  }
  if (dot) {
    dot.className = 'status-dot ' + (type === 'err' ? 'status-err' : type === 'warn' ? 'status-warn' : 'status-ok');
  }
}
function setStatusBoard(name) {
  const el = document.getElementById('status-board');
  if (el) el.textContent = name || '';
}

function renderBackButton(onclick, labelKey, icons) {
  const iconHtml = icons || '&#8592; &#128194;';
  return `<button type="button" class="btn btn-back" onclick="${onclick}" title="${escAttr(I18n.t(labelKey))}"><span class="btn-back-icon" aria-hidden="true">${iconHtml}</span><span>${I18n.t(labelKey)}</span></button>`;
}

/* ── Project / Board View ────────────────────────────────────────────────── */
const BoardView = (() => {
  let currentBoardId = null;
  let currentPermissions = null;
  let boardData = null;
  let boardsList = [];
  let assignees = [];
  let drag = null;
  let dragCol = null;
  let pendingCommentFiles = [];
  let pendingReplyFiles = {};
  const editCommentOriginals = new Map();
  let burndownChart = null;
  let burndownChartCache = null;
  let summaryReportCache = null;

  const COLUMN_CHART_COLORS = ['#3B82F6', '#F59E0B', '#8B5CF6', '#22C55E', '#EF4444', '#06B6D4', '#EC4899', '#64748B'];

  function chartRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function getThemeCssVar(name, fallback = '') {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  }

  function cssColorToRgba(color, alpha) {
    if (!color) return `rgba(100,116,139,${alpha})`;
    if (color.startsWith('#')) {
      const hex = color.length === 4
        ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
        : color;
      return chartRgba(hex, alpha);
    }
    if (color.startsWith('rgb')) {
      const nums = color.match(/[\d.]+/g);
      if (nums?.length >= 3) return `rgba(${nums[0]},${nums[1]},${nums[2]},${alpha})`;
    }
    return color;
  }

  function getBurndownChartTheme() {
    const isDark = document.documentElement.dataset.theme === 'dark';
    const text = getThemeCssVar('--text', isDark ? '#E2E8F0' : '#1E293B');
    const textMuted = getThemeCssVar('--text-muted', isDark ? '#94A3B8' : '#64748B');
    const textLight = getThemeCssVar('--text-light', isDark ? '#64748B' : '#94A3B8');
    const danger = getThemeCssVar('--danger', isDark ? '#F87171' : '#EF4444');
    const bgCard = getThemeCssVar('--bg-card', isDark ? '#1E293B' : '#FFFFFF');
    const border = getThemeCssVar('--border', isDark ? '#334155' : '#CBD5E1');

    return {
      isDark,
      text,
      textMuted,
      textLight,
      bgCard,
      border,
      grid: cssColorToRgba(border, isDark ? 0.5 : 0.4),
      idealLine: danger,
    };
  }

  const COLUMN_BG_PRESETS = [
    '#F59E0B','#D97706','#F97316','#EF4444','#F43F5E',
    '#EC4899','#A855F7','#7C3AED','#6366F1','#3B82F6',
    '#0EA5E9','#06B6D4','#14B8A6','#22C55E','#10B981',
    '#84CC16','#78716C','#64748B','#6B7280','#9CA3AF',
  ];

  // Backward compatibility: map old named colors to hex
  const NAMED_COL_COLOR_MAP = {
    yellow:'#F59E0B', blue:'#3B82F6', green:'#22C55E', pink:'#EC4899',
    purple:'#A855F7', cyan:'#06B6D4', orange:'#F97316', red:'#EF4444',
  };

  function hexToColBg(raw) {
    if (!raw) return null;
    const hex = NAMED_COL_COLOR_MAP[raw] || raw;
    if (!/^#[0-9A-Fa-f]{6}$/i.test(hex)) return null;
    const r = parseInt(hex.slice(1,3), 16);
    const g = parseInt(hex.slice(3,5), 16);
    const b = parseInt(hex.slice(5,7), 16);
    return `rgba(${r},${g},${b},.18)`;
  }

  function boardColorPickerHtml(currentColor) {
    const currentHex = NAMED_COL_COLOR_MAP[currentColor] || currentColor || '';
    const isPreset = COLUMN_BG_PRESETS.includes(currentHex);
    const isCustom = currentHex && !isPreset;
    const customInitVal = isCustom ? currentHex : '#3B82F6';
    const swatches = COLUMN_BG_PRESETS.map(hex => `
      <div class="col-color-swatch board-color-swatch${hex === currentHex ? ' selected' : ''}" style="background:${hex}" data-color="${hex}" title="${hex}"
           onclick="document.querySelectorAll('.board-color-swatch').forEach(s=>s.classList.remove('selected'));this.classList.add('selected');document.getElementById('board-sel-color').value=this.dataset.color;document.getElementById('board-custom-hex').value=this.dataset.color;document.getElementById('board-custom-picker').value=this.dataset.color"></div>
    `).join('');
    return `
      <div class="form-group">
        <label>${I18n.t('boardColor')}</label>
        <div class="col-color-grid">
          <div class="col-color-swatch board-color-swatch col-color-none${!currentHex ? ' selected' : ''}" data-color="" title="${I18n.t('colorDefault')}"
               onclick="document.querySelectorAll('.board-color-swatch').forEach(s=>s.classList.remove('selected'));this.classList.add('selected');document.getElementById('board-sel-color').value='';document.getElementById('board-custom-hex').value=''">
            <span style="font-size:15px;line-height:1">✕</span>
          </div>
          ${swatches}
        </div>
        <div style="display:flex;gap:8px;align-items:center;margin-top:8px">
          <input type="color" id="board-custom-picker" value="${escAttr(customInitVal)}"
                 style="width:44px;height:34px;border-radius:6px;border:1px solid var(--border);padding:2px;cursor:pointer;background:none;flex-shrink:0"
                 oninput="const v=this.value;document.querySelectorAll('.board-color-swatch').forEach(s=>s.classList.remove('selected'));document.getElementById('board-sel-color').value=v;document.getElementById('board-custom-hex').value=v">
          <input type="text" id="board-custom-hex" class="form-control" maxlength="7"
                 value="${escAttr(isCustom ? currentHex : '')}" placeholder="#RRGGBB"
                 style="font-family:monospace;font-size:13px"
                 oninput="const v=this.value.trim();if(/^#[0-9A-Fa-f]{6}$/.test(v)){document.querySelectorAll('.board-color-swatch').forEach(s=>s.classList.remove('selected'));document.getElementById('board-sel-color').value=v;document.getElementById('board-custom-picker').value=v}">
        </div>
        <input type="hidden" id="board-sel-color" value="${escAttr(currentHex)}">
      </div>`;
  }

  const NAMED_CARD_COLOR_MAP = {
    blue: '#6366F1', green: '#22C55E', yellow: '#F59E0B', orange: '#F97316',
    red: '#EF4444', purple: '#A855F7', pink: '#EC4899', cyan: '#06B6D4',
  };

  function resolveCardHex(raw) {
    if (!raw) return '';
    return NAMED_CARD_COLOR_MAP[raw] || raw;
  }

  function hexToCardBg(raw) {
    if (!raw) return null;
    const hex = resolveCardHex(raw);
    if (!/^#[0-9A-Fa-f]{6}$/i.test(hex)) return null;
    const r = parseInt(hex.slice(1,3), 16);
    const g = parseInt(hex.slice(3,5), 16);
    const b = parseInt(hex.slice(5,7), 16);
    return `rgba(${r},${g},${b},.25)`;
  }

  function hexToStripeColor(raw) {
    const hex = resolveCardHex(raw);
    return /^#[0-9A-Fa-f]{6}$/i.test(hex) ? hex : null;
  }

  function cardStyleAttr(card) {
    const styles = [];
    const bg = hexToCardBg(card.bg_color);
    const stripe = hexToStripeColor(card.stripe_color || card.color);
    if (bg) styles.push(`background:${bg}`);
    if (stripe) styles.push(`border-left-color:${stripe}`);
    return styles.length ? `style="${styles.join(';')}"` : '';
  }

  // ── Export / Import (.kprj) ───────────────────────────────────────────────

  async function exportProject(boardId, boardTitle) {
    if (typeof window.electron !== 'undefined') {
      try {
        const res = await fetch(`/api/boards/${boardId}/export`, { credentials: 'include' });
        const json = await res.text();
        const result = await window.electron.saveKprj(boardTitle, json);
        if (result.ok) showToast(I18n.t('exportSuccess') + ': ' + result.filePath.split(/[\\/]/).pop(), 'success');
        else if (!result.cancelled) showError(I18n.t('exportProject'), result.error || I18n.t('exportSaveFailed'));
      } catch (err) { showError(I18n.t('exportProject'), err.message); }
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
      if (data.format !== 'mykanban-project') throw new Error(I18n.t('invalidKprjDetail'));
      const board = await API.post('/boards/import', data);
      showToast(I18n.t('importSuccess'), 'success');
      return board;
    } catch (err) {
      showError(I18n.t('importError'), err.message);
      return null;
    }
  }

  async function importProjectFromDialog(startDir) {
    if (typeof window.electron !== 'undefined') {
      // Electron: native file open dialog with optional starting directory
      const result = await window.electron.openKprjDialog(startDir || undefined);
      if (!result || result.cancelled) return;
      if (!result.ok) { showToast(result.error, 'error'); return; }
      const board = await importProject(result.content);
      if (board) openBoard(board.id);
    } else {
      // Web: browser file picker (can't set directory, but remember choice for UX)
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

  async function openSampleProject() {
    try {
      const res = await fetch('/sample/sample.kprj');
      if (!res.ok) throw new Error(I18n.t('sampleNotFound'));
      const data = JSON.parse(await res.text());
      if (data.format !== 'mykanban-project') throw new Error(I18n.t('invalidKprj'));
      const board = await API.post('/boards/import', { ...data, _noSuffix: true });
      showToast(I18n.t('importSuccess'), 'success');
      openBoard(board.id);
    } catch (err) {
      showError(I18n.t('importError'), err.message);
    }
  }

  // Called when a .kprj file is double-clicked via OS file association (Electron)
  async function handleKprjFileOpen(filePath) {
    try {
      const res = await fetch(`/api/boards/import-file?path=${encodeURIComponent(filePath)}`, { credentials: 'include' });
      if (!res.ok) throw new Error(I18n.t('fileReadFailed'));
      const data = await res.json();
      if (data.id) { showToast(I18n.t('importSuccess'), 'success'); openBoard(data.id); }
    } catch (err) { showError(I18n.t('fileOpenFailed'), filePath + '\n\n' + err.message); }
  }

  // Register IPC listener
  if (typeof window.electron !== 'undefined' && window.electron.onOpenKprj) {
    window.electron.onOpenKprj((filePath) => handleKprjFileOpen(filePath));
  }

  // ── Project List ──────────────────────────────────────────────────────────

  async function renderBoardList() {
    currentBoardId = null;
    History.setBoard(null);
    const main = document.getElementById('main-content');
    main.innerHTML = `<div class="spinner-wrap"><div class="spinner"></div></div>`;
    document.getElementById('breadcrumb').innerHTML = '';

    try {
      const boards = await API.get('/boards');
      boardsList = boards;
      setStatus(I18n.t('ready')); setStatusBoard('');

      if (boards.length === 0) {
        main.innerHTML = `
          <div class="page-wrap" oncontextmenu="BoardView.showListCtxMenu(event)">
            <div class="page-header">
              <h1 class="page-title">&#9783; ${I18n.t('myBoards')}</h1>
              <div style="display:flex;gap:8px">
                <button class="btn btn-secondary" onclick="BoardView.importProjectFromDialog()" title="${I18n.t('importProject')}">&#128229; ${I18n.t('importProject')}</button>
                <button class="btn btn-primary" onclick="BoardView.showCreateBoard()" title="${I18n.t('createBoard')}">&#10010; ${I18n.t('newBoard')}</button>
              </div>
            </div>
            <div class="board-empty">
              <div class="icon">&#9783;</div>
              <p>${I18n.t('boardEmpty')}</p>
            </div>
          </div>`;
      } else {
        const roleLabel = { owner: I18n.t('roleAdmin'), 'system-admin': I18n.t('admin'), admin: I18n.t('roleAdmin'), editor: I18n.t('roleEditor'), viewer: I18n.t('roleViewer') };
        const cards = boards.map(b => {
          const bgStyle = hexToColBg(b.bg_color) ? `style="background:${hexToColBg(b.bg_color)}"` : '';
          return `
          <div class="board-card" ${bgStyle}
               data-board-id="${b.id}" data-board-title="${escAttr(b.title)}" data-board-desc="${escAttr(b.description||'')}" data-board-bg="${escAttr(b.bg_color||'')}" data-my-role="${b.myRole}"
               onclick="BoardView.openBoard(${b.id})"
               oncontextmenu="BoardView.showBoardCtxMenu(event,this)">
            <div class="board-card-actions">
              ${b.myRole !== 'viewer' ? `<button class="board-card-btn" onclick="event.stopPropagation();BoardView.editBoard(${b.id},'${escHtml(b.title)}','${escHtml(b.description||'')}','${escHtml(b.bg_color||'')}')" title="${I18n.t('edit')}">&#9998;</button>` : ''}
              <button class="board-card-btn" onclick="event.stopPropagation();BoardView.exportProject(${b.id},'${escHtml(b.title)}')" title="${I18n.t('exportProject')}">&#128229;</button>
            ${['owner','system-admin'].includes(b.myRole) ? `<button class="board-card-btn" onclick="event.stopPropagation();BoardView.deleteBoard(${b.id})" title="${I18n.t('delete')}" style="color:#EF4444">&#128465;</button>` : ''}
            </div>
            <span class="role-badge role-${b.myRole === 'system-admin' ? 'owner' : b.myRole}">${roleLabel[b.myRole] || b.myRole}</span>
            <div class="board-card-title">${escHtml(b.title)}</div>
            <div class="board-card-desc">${escHtml(b.description || '')}</div>
            <div class="board-card-meta">${I18n.t('owner')}: ${escHtml(b.owner_name || '-')}</div>
          </div>`;
        }).join('');

        main.innerHTML = `
          <div class="page-wrap" oncontextmenu="BoardView.showListCtxMenu(event)">
            <div class="page-header">
              <h1 class="page-title">&#9783; ${I18n.t('myBoards')}</h1>
              <div style="display:flex;gap:8px">
                <button class="btn btn-secondary" onclick="BoardView.importProjectFromDialog()" title="${I18n.t('importProject')}">&#128229; ${I18n.t('importProject')}</button>
                <button class="btn btn-primary" onclick="BoardView.showCreateBoard()" title="${I18n.t('createBoard')}">&#10010; ${I18n.t('newBoard')}</button>
              </div>
            </div>
            <div class="boards-grid">${cards}</div>
          </div>`;
      }
    } catch (err) {
      main.innerHTML = `<div class="spinner-wrap">${err.message}</div>`;
      setStatus(err.message, 'err');
    }
  }

  function showCreateBoard() {
    Modal.dialog({
      title: I18n.t('createBoard'),
      icon: '➕',
      size: 'sm',
      body: `
      <div class="form-group">
        <label>${I18n.t('boardName')}</label>
        <input id="new-board-title" class="form-control" placeholder="${I18n.t('boardName')}">
      </div>
      <div class="form-group">
        <label>${I18n.t('boardDesc')}</label>
        <input id="new-board-desc" class="form-control" placeholder="...">
      </div>`,
      footer: Modal.footerCancelPrimary(I18n.t('create'), 'BoardView.createBoard()', { primaryIcon: '➕' }),
    });
    document.getElementById('new-board-title').focus();
    document.getElementById('new-board-title').addEventListener('keydown', e => { if (e.key === 'Enter') createBoard(); });
  }

  async function createBoard() {
    const title = document.getElementById('new-board-title').value.trim();
    const description = document.getElementById('new-board-desc').value.trim();
    if (!title) { showToast(I18n.t('boardName') + ' ' + I18n.t('fieldRequired'), 'error'); return; }
    try {
      const board = await API.post('/boards', { title, description });
      Modal.close();
      showToast(I18n.t('createdDone'), 'success');
      openBoard(board.id);
    } catch (err) { showToast(err.message, 'error'); }
  }

  function editBoard(id, title, desc, bgColor) {
    const saveKey = `board:${id}`;
    const initial = { title, description: desc || '', bg_color: bgColor || '' };
    Modal.dialog({
      title: I18n.t('edit'),
      icon: '✏️',
      size: 'sm',
      body: `
      <div class="form-group">
        <label>${I18n.t('boardName')}</label>
        <input id="edit-board-title" class="form-control" value="${escHtml(title)}">
      </div>
      <div class="form-group">
        <label>${I18n.t('boardDesc')}</label>
        <input id="edit-board-desc" class="form-control" value="${escHtml(desc || '')}">
      </div>
      ${boardColorPickerHtml(bgColor || '')}`,
      footer: `
        <div class="modal-footer-left"><span id="board-autosave-status" class="autosave-status"></span></div>
        ${Modal.btn({ label: I18n.t('close'), icon: '✕', variant: 'secondary', onclick: 'Modal.close()' })}
        ${Modal.btn({ label: I18n.t('save'), icon: '💾', variant: 'primary', onclick: `BoardView.saveEditBoard(${id})` })}`,
    });
    let committedBoard = { ...initial };
    AutoSave.start(saveKey, {
      indicatorId: 'board-autosave-status',
      initialPayload: initial,
      collect: () => {
        const t = document.getElementById('edit-board-title')?.value.trim();
        if (!t) return null;
        return {
          title: t,
          description: document.getElementById('edit-board-desc')?.value.trim() || '',
          bg_color: document.getElementById('board-sel-color')?.value || '',
        };
      },
      save: async (payload) => {
        const before = { ...committedBoard };
        await API.put(`/boards/${id}`, payload);
        if (!History.isApplying()) History.recordBoardUpdate(id, before, payload);
        committedBoard = { ...payload };
        await renderBoardList();
      },
    });
    ['edit-board-title', 'edit-board-desc'].forEach((fieldId) => {
      document.getElementById(fieldId)?.addEventListener('input', () => AutoSave.schedule(saveKey));
    });
    document.querySelectorAll('.board-color-swatch').forEach(s => {
      s.addEventListener('click', () => AutoSave.schedule(saveKey));
    });
    ['board-custom-picker', 'board-custom-hex'].forEach(elId => {
      document.getElementById(elId)?.addEventListener('input', () => AutoSave.schedule(saveKey));
    });
    Modal.setBeforeClose(async () => {
      const ok = await AutoSave.flush(saveKey);
      AutoSave.stop(saveKey);
      return ok;
    });
  }

  async function saveEditBoard(id) {
    await AutoSave.flush(`board:${id}`);
    Modal.close();
  }

  async function deleteBoard(id) {
    const board = boardsList.find(b => b.id == id);
    const ok = await Modal.confirm({
      title: I18n.t('confirmTitle'),
      message: I18n.t('confirmDeleteProject', { name: board?.title || '' }),
      confirmLabel: I18n.t('delete'),
    });
    if (!ok) return;
    try {
      await API.delete(`/boards/${id}`);
      showToast(I18n.t('deletedDone'), 'success');
      renderBoardList();
    } catch (err) { showToast(err.message, 'error'); }
  }

  // ── Board / Kanban View ───────────────────────────────────────────────────

  async function loadAssignees() {
    if (!currentBoardId) {
      assignees = [];
      return;
    }
    assignees = await API.get(`/boards/${currentBoardId}/assignees`).catch(() => []);
  }

  async function openBoard(boardId) {
    currentBoardId = boardId;
    History.setBoard(boardId);
    setStatus(I18n.t('loading'));
    document.getElementById('main-content').innerHTML =
      `<div id="board-view"><div class="spinner-wrap"><div class="spinner"></div></div></div>`;
    try {
      await loadAssignees();
      await loadBoard();
    } catch (err) {
      document.getElementById('main-content').innerHTML = `<div class="spinner-wrap">${err.message}</div>`;
      setStatus(err.message, 'err');
    }
  }

  async function loadBoard() {
    try {
      const [response] = await Promise.all([
        API.get(`/boards/${currentBoardId}/columns`),
        loadAssignees(),
      ]);
      // Handle both old array format and new {permissions, columns} format
      if (Array.isArray(response)) {
        boardData = response;
        currentPermissions = { myRole: 'system-admin', canEdit: true, canManageMembers: true, canDeleteProject: true };
      } else {
        boardData = response.columns;
        currentPermissions = response.permissions;
      }
      renderBoard();
    } catch (err) { showToast(I18n.t('loadFailed') + ': ' + err.message, 'error'); }
  }

  function renderBoard() {
    const perm = currentPermissions;
    const breadcrumb = document.getElementById('breadcrumb');
    breadcrumb.innerHTML = `<span onclick="App.showBoards()">${I18n.t('myBoards')}</span><span class="sep">/</span><span>...</span>`;

    document.getElementById('main-content').innerHTML = `
      <div id="board-view">
        <div class="board-toolbar">
          ${renderBackButton('App.showBoards()', 'backToBoards')}
          <span class="board-toolbar-title" id="board-title-lbl">${I18n.t('myBoards')}</span>
          <div class="board-toolbar-right">
            ${perm.canEdit && localStorage.getItem('kanban-show-add-col') !== 'false' ? `<button class="btn btn-primary btn-sm" onclick="BoardView.promptAddColumn()" title="${I18n.t('addColumn')}">&#10010; ${I18n.t('addColumn')}</button>` : ''}
            <button class="btn btn-secondary btn-sm" onclick="BoardView.showSummary()" title="${I18n.t('summaryTitle')}">${icon('chart', 'toolbar')} ${I18n.t('summary')}</button>
            ${perm.canManageMembers ? `<button class="btn btn-secondary btn-sm" onclick="BoardView.showMembers()" title="${I18n.t('memberMgmt')}">${icon('users', 'toolbar')} ${I18n.t('members')}</button>` : ''}
            <button class="btn btn-secondary btn-sm" id="btn-export-board" onclick="BoardView.exportCurrentBoard()" title="${I18n.t('exportProject')}">${icon('export', 'toolbar')} ${I18n.t('exportProject')}</button>
          </div>
        </div>
        <div class="columns-container" id="columns-container" oncontextmenu="BoardView.showBoardAreaCtxMenu(event)" ondragover="BoardView.onContainerDragOver(event)" ondrop="BoardView.onContainerDrop(event)">
          ${boardData.map(col => renderColumn(col)).join('')}
          ${perm.canEdit && localStorage.getItem('kanban-show-add-col') !== 'false' ? `<div class="add-col-btn" onclick="BoardView.promptAddColumn()">${I18n.t('addColumn')}</div>` : ''}
        </div>
      </div>`;

    // Load board title from server
    API.get('/boards').then(boards => {
      boardsList = boards;
      const b = boards.find(x => x.id == currentBoardId);
      if (b) {
        document.getElementById('board-title-lbl') && (document.getElementById('board-title-lbl').textContent = b.title);
        const crumb = document.getElementById('breadcrumb');
        if (crumb) crumb.innerHTML = `<span onclick="App.showBoards()" style="cursor:pointer">${I18n.t('myBoards')}</span><span class="sep">/</span><span>${escHtml(b.title)}</span>`;
        setStatus(I18n.t('ready')); setStatusBoard(b.title);
      }
    }).catch(() => {});

    initDragAndDrop();
  }

  function renderColumn(col) {
    const perm = currentPermissions;
    const cards = col.cards.map(c => renderCard(c, col.id)).join('');
    const bg = hexToColBg(col.bg_color);
    const bgStyle = bg ? ` style="background:${bg}"` : '';
    const isDone = col.type === 'done';
    const doneBadge = isDone ? `<span class="col-done-badge" title="${I18n.t('colTypeDone')}">✓ ${I18n.t('colTypeDone')}</span>` : '';
    const canDrag = perm.canEdit && !isDone;

    return `
      <div class="column${isDone ? ' col-done' : ''}" data-col-id="${col.id}"${bgStyle}
           ${perm.canEdit ? `oncontextmenu="BoardView.showColumnCtxMenu(event,${col.id})"` : ''}>
        <div class="column-header" ${canDrag ? `draggable="true" ondragstart="BoardView.onColDragStart(event,${col.id})" ondragend="BoardView.onColDragEnd(event)"` : ''}>
          <span class="column-title" id="col-title-${col.id}" ${perm.canEdit ? `ondblclick="BoardView.startEditColTitle(${col.id})"` : ''}>${escHtml(col.title)}</span>
          ${doneBadge}
          <span class="column-count">${col.cards.length}</span>
          ${perm.canEdit ? `<button class="column-menu" onclick="BoardView.showColumnCtxMenu(event,${col.id})" title="${I18n.t('ctxRenameCol')}">&#8942;</button>` : ''}
        </div>
        <div class="cards-list" id="cards-list-${col.id}">
          ${cards}
        </div>
        ${perm.canEdit ? `<button class="add-card-btn" onclick="BoardView.showAddCard(${col.id})">${I18n.t('addCard')}</button>` : ''}
      </div>`;
  }

  function getCardLocation(cardId) {
    for (const col of boardData || []) {
      const idx = col.cards.findIndex(c => c.id == cardId);
      if (idx >= 0) return { columnId: col.id, position: idx };
    }
    return null;
  }

  function findCard(cardId) {
    for (const col of boardData || []) {
      const card = col.cards.find(c => c.id == cardId);
      if (card) return card;
    }
    return null;
  }

  function assigneeOptionsHtml(selectedId, extraAssignee) {
    const list = [...assignees];
    if (extraAssignee?.id && !list.find(u => String(u.id) === String(extraAssignee.id))) {
      list.push(extraAssignee);
      list.sort((a, b) =>
        (a.display_name || a.username).localeCompare(b.display_name || b.username, 'ko')
      );
    }
    return list.map(u =>
      `<option value="${u.id}" ${String(selectedId) === String(u.id) ? 'selected' : ''}>${escHtml(u.display_name || u.username)}</option>`
    ).join('');
  }

  function renderCard(card, colId) {
    const dueCls = dueDateClass(card.due_date);
    const dueBadge = card.due_date ? `<span class="card-due ${dueCls}">${formatDate(card.due_date)}</span>` : '';
    const assigneeInitial = card.assignee_name ? escHtml(card.assignee_name[0].toUpperCase()) : '';
    const assigneeBadge = card.assignee_name
      ? `<span class="card-assignee" title="${escAttr(I18n.t('assignee'))}: ${escAttr(card.assignee_name)}"><span class="card-assignee-avatar">${assigneeInitial}</span><span class="card-assignee-name">${escHtml(card.assignee_name)}</span></span>`
      : '';
    const attachBadge = card.attachment_count > 0 ? `<span class="card-attach">&#128206; ${card.attachment_count}</span>` : '';
    const colorStyle = cardStyleAttr(card);

    return `
      <div class="card" draggable="${currentPermissions.canEdit}" ${colorStyle} data-card-id="${card.id}" data-col-id="${colId}"
           onclick="BoardView.openCard(${card.id})"
           oncontextmenu="BoardView.showCardCtxMenu(event,${card.id},${colId})"
           ondragstart="BoardView.onDragStart(event,${card.id},${colId})"
           ondragend="BoardView.onDragEnd(event)">
        <div class="card-title-row">
          <div class="card-title">${escHtml(card.title)}</div>
          ${assigneeBadge}
        </div>
        ${dueBadge || attachBadge ? `<div class="card-meta">${dueBadge}${attachBadge}</div>` : ''}
      </div>`;
  }

  // ── Drag & Drop ───────────────────────────────────────────────────────────

  function getDropIndicator() {
    let ind = document.getElementById('drop-indicator');
    if (!ind) {
      ind = document.createElement('div');
      ind.id = 'drop-indicator';
      ind.className = 'drop-indicator';
    }
    return ind;
  }

  function removeDropIndicator() {
    document.getElementById('drop-indicator')?.remove();
    document.querySelectorAll('.cards-list.drag-over-col').forEach(el => el.classList.remove('drag-over-col'));
  }

  function getDragInsertBefore(list, clientY) {
    const cards = [...list.querySelectorAll('.card:not(.dragging)')];
    for (const card of cards) {
      const { top, height } = card.getBoundingClientRect();
      if (clientY < top + height / 2) return card;
    }
    return null;
  }

  function onListDragOver(e) {
    if (!drag || dragCol) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const list = e.currentTarget;
    list.classList.add('drag-over-col');
    const ind = getDropIndicator();
    const before = getDragInsertBefore(list, e.clientY);
    if (before) list.insertBefore(ind, before);
    else list.appendChild(ind);
  }

  function onListDragLeave(e) {
    if (dragCol) return;
    const list = e.currentTarget;
    if (!list.contains(e.relatedTarget)) {
      list.classList.remove('drag-over-col');
      document.getElementById('drop-indicator')?.remove();
    }
  }

  function onListDrop(e) {
    if (dragCol) return;
    e.preventDefault();
    if (!drag) { removeDropIndicator(); return; }
    const list = e.currentTarget;
    const colId = list.id.replace('cards-list-', '');
    const ind = document.getElementById('drop-indicator');
    let position = 0;
    if (ind) {
      const children = [...list.children];
      const indIdx = children.indexOf(ind);
      position = children.slice(0, indIdx).filter(el => el.classList.contains('card')).length;
    } else {
      position = list.querySelectorAll('.card').length;
    }
    removeDropIndicator();
    moveCard(drag.cardId, colId, position);
  }

  function initDragAndDrop() {
    if (!currentPermissions?.canEdit) return;
    document.querySelectorAll('.cards-list').forEach(list => {
      list.addEventListener('dragover', onListDragOver);
      list.addEventListener('dragleave', onListDragLeave);
      list.addEventListener('drop', onListDrop);
    });
  }

  function onDragStart(e, cardId, colId) {
    if (!currentPermissions.canEdit) { e.preventDefault(); return; }
    drag = { cardId, colId };
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => e.target.classList.add('dragging'), 0);
  }

  function onDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
    drag = null;
    removeDropIndicator();
  }

  // ── Column Drag & Drop ────────────────────────────────────────────────────

  function onColDragStart(e, colId) {
    if (!currentPermissions?.canEdit) { e.preventDefault(); return; }
    dragCol = { colId };
    drag = null;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `col:${colId}`);
    setTimeout(() => document.querySelector(`.column[data-col-id="${colId}"]`)?.classList.add('col-dragging'), 0);
  }

  function onColDragEnd(e) {
    e.currentTarget.closest('.column')?.classList.remove('col-dragging');
    dragCol = null;
    removeColDropIndicator();
  }

  function removeColDropIndicator() {
    document.getElementById('col-drop-ind')?.remove();
  }

  function getColInsertBefore(container, clientX) {
    const cols = [...container.querySelectorAll('.column:not(.col-dragging):not(.col-done)')];
    for (const col of cols) {
      const { left, width } = col.getBoundingClientRect();
      if (clientX < left + width / 2) return col;
    }
    return container.querySelector('.column.col-done') || null;
  }

  function onContainerDragOver(e) {
    if (!dragCol) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const container = e.currentTarget;
    let ind = document.getElementById('col-drop-ind');
    if (!ind) {
      ind = document.createElement('div');
      ind.id = 'col-drop-ind';
      ind.className = 'col-drop-ind';
    }
    const before = getColInsertBefore(container, e.clientX);
    if (before) container.insertBefore(ind, before);
    else {
      const addBtn = container.querySelector('.add-col-btn');
      if (addBtn) container.insertBefore(ind, addBtn);
      else container.appendChild(ind);
    }
  }

  async function onContainerDrop(e) {
    e.preventDefault();
    if (!dragCol) return;
    const container = e.currentTarget;
    const ind = document.getElementById('col-drop-ind');
    let position = 0;
    if (ind) {
      const children = [...container.children];
      const indIdx = children.indexOf(ind);
      position = children.slice(0, indIdx)
        .filter(el => el.classList.contains('column') && !el.classList.contains('col-done')).length;
    }
    const colId = dragCol.colId;
    dragCol = null;
    removeColDropIndicator();
    await moveColumn(colId, position);
  }

  async function moveColumn(colId, position) {
    const normalCols = (boardData || []).filter(c => c.type !== 'done');
    const col = normalCols.find(c => c.id == colId);
    const oldPosition = normalCols.indexOf(col);
    if (oldPosition < 0 || oldPosition === position) return;
    try {
      await API.post(`/boards/${currentBoardId}/columns/${colId}/move`, { position });
      if (!History.isApplying()) History.recordColumnMove(currentBoardId, colId, oldPosition, position);
      await loadBoard();
    } catch (err) { showToast(err.message, 'error'); }
  }

  async function moveCard(cardId, targetColId, position) {
    const from = getCardLocation(cardId);
    if (!from) return;
    try {
      await API.post(`/boards/${currentBoardId}/cards/${cardId}/move`, { targetColumnId: targetColId, position });
      if (!History.isApplying()) {
        History.recordCardMove(currentBoardId, cardId, from.columnId, from.position, targetColId, position);
      }
      await loadBoard();
    } catch (err) { showToast(err.message, 'error'); await loadBoard(); }
  }

  // ── Context menus ─────────────────────────────────────────────────────────

  function showBoardCtxMenu(e, el) {
    e.stopPropagation();
    const id = parseInt(el.dataset.boardId);
    const title = el.dataset.boardTitle || '';
    const desc = el.dataset.boardDesc || '';
    const bgColor = el.dataset.boardBg || '';
    const myRole = el.dataset.myRole;
    const canEdit = myRole !== 'viewer';
    const canDelete = ['owner', 'system-admin'].includes(myRole);
    CtxMenu.show(e, [
      { label: I18n.t('open'), icon: '📂', tooltip: I18n.t('ctxOpenBoard'), action: () => openBoard(id) },
      ...(canEdit ? [{ label: I18n.t('edit'), icon: '✏️', tooltip: I18n.t('ctxEditBoard'), action: () => editBoard(id, title, desc, bgColor) }] : []),
      { label: I18n.t('exportProject'), icon: '📥', tooltip: I18n.t('ctxExportBoard'), action: () => exportProject(id, title) },
      ...(canDelete ? [
        { type: 'sep' },
        { label: I18n.t('delete'), icon: '🗑️', tooltip: I18n.t('ctxDeleteBoard'), danger: true, action: () => deleteBoard(id) }
      ] : [])
    ]);
  }

  function showListCtxMenu(e) {
    if (e.target.closest('.board-card, button, input, a, .menubar-item')) return;
    const items = [
      { label: I18n.t('newBoard'), icon: '➕', tooltip: I18n.t('createBoard'), action: () => showCreateBoard() },
      { label: I18n.t('importProject'), icon: '📥', tooltip: I18n.t('importProject'), action: () => importProjectFromDialog() },
      { type: 'sep' },
      { label: I18n.t('settings'), icon: '⚙️', tooltip: I18n.t('settings'), action: () => App.showSettings() },
    ];
    if (App.currentUser?.role === 'admin') {
      items.splice(3, 0, { label: I18n.t('dbSettings'), icon: '🗄️', tooltip: I18n.t('dbSettings'), action: () => App.showSettings() });
    }
    CtxMenu.show(e, items);
  }

  function showBoardAreaCtxMenu(e) {
    if (e.target.closest('.column, .kanban-card, .column-header, .column-menu, button, input, a, .add-col-btn, .add-card-btn')) return;
    const perm = currentPermissions;
    const items = [];
    if (perm?.canEdit) {
      items.push({ label: I18n.t('addColumn'), icon: '➕', tooltip: I18n.t('addColumn'), action: () => promptAddColumn() });
      items.push({ label: I18n.t('addCard'), icon: '📝', tooltip: I18n.t('addCard'), action: () => {
        const firstCol = boardData?.[0];
        if (firstCol) showAddCard(firstCol.id);
        else showToast(I18n.t('addColumnFirst'), 'error');
      }});
    }
    items.push({ type: 'sep' });
    items.push({ label: I18n.t('exportProject'), icon: '📤', tooltip: I18n.t('exportProject'), action: () => exportCurrentBoard() });
    items.push({ label: I18n.t('backToBoards'), icon: '📂', tooltip: I18n.t('boardList'), action: () => App.showBoards() });
    CtxMenu.show(e, items);
  }

  function showColumnCtxMenu(e, colId) {
    e.stopPropagation();
    e.preventDefault();
    const perm = currentPermissions;
    if (!perm?.canEdit) return;
    CtxMenu.show(e, [
      { label: I18n.t('addCard'), icon: '➕', tooltip: I18n.t('ctxAddCardCol'), action: () => showAddCard(colId) },
      { type: 'sep' },
      { label: I18n.t('columnProps'), icon: '⚙️', tooltip: I18n.t('ctxColumnProps'), action: () => editColumnProps(colId) },
      { label: I18n.t('columnColor'), icon: '🎨', tooltip: I18n.t('ctxColumnColor'), action: () => showColumnColorPicker(colId) },
      { type: 'sep' },
      { label: I18n.t('deleteColumn'), icon: '🗑️', tooltip: I18n.t('ctxDeleteCol'), danger: true, action: () => deleteColumn(colId) }
    ]);
  }

  function editColumnProps(colId) {
    const col = boardData?.find(c => c.id == colId);
    if (!col) return;
    const rawColor = col.bg_color || '';
    const currentHex = NAMED_COL_COLOR_MAP[rawColor] || rawColor;
    const isPreset = COLUMN_BG_PRESETS.includes(currentHex);
    const isCustom = currentHex && !isPreset;
    const customInitVal = isCustom ? currentHex : '#6366F1';
    const colType = col.type || 'normal';
    const normalCols = (boardData || []).filter(c => c.type !== 'done');
    const isLastNormal = colType === 'done' || (normalCols.length > 0 && normalCols[normalCols.length - 1].id == colId);

    const swatches = COLUMN_BG_PRESETS.map(hex => `
      <div class="col-color-swatch${hex === currentHex ? ' selected' : ''}" style="background:${hex}" data-color="${hex}" title="${hex}"
           onclick="document.querySelectorAll('.col-color-swatch').forEach(s=>s.classList.remove('selected'));this.classList.add('selected');document.getElementById('col-sel-color').value=this.dataset.color;document.getElementById('col-custom-hex').value=this.dataset.color;document.getElementById('col-custom-picker').value=this.dataset.color"></div>
    `).join('');

    Modal.dialog({
      title: I18n.t('columnProps'),
      icon: '⚙️',
      size: 'sm',
      body: `
      <div class="form-group">
        <label>${I18n.t('columnName')}</label>
        <input id="col-prop-title" class="form-control" value="${escAttr(col.title)}" autofocus>
      </div>
      <div class="form-group">
        <label>${I18n.t('columnType')}</label>
        <select id="col-prop-type" class="form-control">
          <option value="normal"${colType === 'normal' ? ' selected' : ''}>${I18n.t('colTypeNormal')}</option>
          <option value="done"${colType === 'done' ? ' selected' : ''}${!isLastNormal ? ' disabled' : ''}>${I18n.t('colTypeDone')}</option>
        </select>
        ${!isLastNormal ? `<div style="font-size:11px;color:var(--text-muted);margin-top:4px">${I18n.t('doneColMustBeLast')}</div>` : ''}
      </div>
      <input type="hidden" id="col-sel-color" value="${escAttr(currentHex)}">
      <div class="form-group">
        <label>${I18n.t('columnColor')}</label>
        <div class="col-color-grid">
          <div class="col-color-swatch col-color-none${!currentHex ? ' selected' : ''}" data-color="" title="${I18n.t('colorDefault')}"
               onclick="document.querySelectorAll('.col-color-swatch').forEach(s=>s.classList.remove('selected'));this.classList.add('selected');document.getElementById('col-sel-color').value='';document.getElementById('col-custom-hex').value=''">
            <span style="font-size:15px;line-height:1">✕</span>
          </div>
          ${swatches}
        </div>
      </div>
      <div class="form-group" style="margin-bottom:0">
        <label style="font-size:12px;color:var(--text-muted)">${I18n.t('colCustomColor') || '직접 입력 (사용자 정의 색상)'}</label>
        <div style="display:flex;gap:8px;align-items:center">
          <input type="color" id="col-custom-picker" value="${escAttr(customInitVal)}"
                 style="width:44px;height:34px;border-radius:6px;border:1px solid var(--border);padding:2px;cursor:pointer;background:none;flex-shrink:0"
                 oninput="const v=this.value;document.querySelectorAll('.col-color-swatch').forEach(s=>s.classList.remove('selected'));document.getElementById('col-sel-color').value=v;document.getElementById('col-custom-hex').value=v">
          <input type="text" id="col-custom-hex" class="form-control" maxlength="7"
                 value="${escAttr(isCustom ? currentHex : '')}" placeholder="#RRGGBB"
                 style="font-family:monospace;font-size:13px"
                 oninput="const v=this.value.trim();if(/^#[0-9A-Fa-f]{6}$/.test(v)){document.querySelectorAll('.col-color-swatch').forEach(s=>s.classList.remove('selected'));document.getElementById('col-sel-color').value=v;document.getElementById('col-custom-picker').value=v}">
        </div>
      </div>`,
      footer: Modal.footerCancelPrimary(I18n.t('save'), `BoardView.saveColumnProps(${colId})`, { primaryIcon: '💾' }),
    });
    document.getElementById('col-prop-title').addEventListener('keydown', e => { if (e.key === 'Enter') saveColumnProps(colId); });
  }

  async function saveColumnProps(colId) {
    const title = document.getElementById('col-prop-title')?.value.trim();
    const type = document.getElementById('col-prop-type')?.value;
    const color = document.getElementById('col-sel-color')?.value ?? '';
    if (!title) { showToast(I18n.t('columnTitleRequired'), 'error'); return; }
    try {
      await API.put(`/boards/${currentBoardId}/columns/${colId}`, { title, type, bg_color: color || null });
      Modal.close();
      await loadBoard();
    } catch (err) { showToast(err.message, 'error'); }
  }

  function showColumnColorPicker(colId) {
    const col = boardData?.find(c => c.id == colId);
    const rawColor = col?.bg_color || '';
    const currentHex = NAMED_COL_COLOR_MAP[rawColor] || rawColor;
    const isPreset = COLUMN_BG_PRESETS.includes(currentHex);
    const isCustom = currentHex && !isPreset;
    const customInitVal = isCustom ? currentHex : '#6366F1';

    const swatches = COLUMN_BG_PRESETS.map(hex => `
      <div class="col-color-swatch${hex === currentHex ? ' selected' : ''}" style="background:${hex}" data-color="${hex}" title="${hex}"
           onclick="document.querySelectorAll('.col-color-swatch').forEach(s=>s.classList.remove('selected'));this.classList.add('selected');document.getElementById('col-sel-color').value=this.dataset.color;document.getElementById('col-custom-hex').value=this.dataset.color;document.getElementById('col-custom-picker').value=this.dataset.color"></div>
    `).join('');

    Modal.dialog({
      title: I18n.t('columnColor'),
      icon: '🎨',
      size: 'sm',
      body: `
      <input type="hidden" id="col-sel-color" value="${escAttr(currentHex)}">
      <div class="form-group">
        <label>${I18n.t('columnColor')}</label>
        <div class="col-color-grid">
          <div class="col-color-swatch col-color-none${!currentHex ? ' selected' : ''}" data-color="" title="${I18n.t('colorDefault')}"
               onclick="document.querySelectorAll('.col-color-swatch').forEach(s=>s.classList.remove('selected'));this.classList.add('selected');document.getElementById('col-sel-color').value='';document.getElementById('col-custom-hex').value=''">
            <span style="font-size:15px;line-height:1">✕</span>
          </div>
          ${swatches}
        </div>
      </div>
      <div class="form-group" style="margin-bottom:0">
        <label style="font-size:12px;color:var(--text-muted)">${I18n.t('colCustomColor') || '직접 입력 (사용자 정의 색상)'}</label>
        <div style="display:flex;gap:8px;align-items:center">
          <input type="color" id="col-custom-picker" value="${escAttr(customInitVal)}"
                 style="width:44px;height:34px;border-radius:6px;border:1px solid var(--border);padding:2px;cursor:pointer;background:none;flex-shrink:0"
                 oninput="const v=this.value;document.querySelectorAll('.col-color-swatch').forEach(s=>s.classList.remove('selected'));document.getElementById('col-sel-color').value=v;document.getElementById('col-custom-hex').value=v">
          <input type="text" id="col-custom-hex" class="form-control" maxlength="7"
                 value="${escAttr(isCustom ? currentHex : '')}" placeholder="#RRGGBB"
                 style="font-family:monospace;font-size:13px"
                 oninput="const v=this.value.trim();if(/^#[0-9A-Fa-f]{6}$/.test(v)){document.querySelectorAll('.col-color-swatch').forEach(s=>s.classList.remove('selected'));document.getElementById('col-sel-color').value=v;document.getElementById('col-custom-picker').value=v}">
        </div>
      </div>`,
      footer: Modal.footerCancelPrimary(I18n.t('save'), `BoardView.applyColumnColor(${colId})`, { primaryIcon: '🎨' }),
    });
  }

  async function applyColumnColor(colId) {
    const color = document.getElementById('col-sel-color')?.value ?? '';
    try {
      const col = boardData?.find(c => c.id == colId);
      const oldColor = col?.bg_color || '';
      await API.put(`/boards/${currentBoardId}/columns/${colId}`, { bg_color: color });
      if (!History.isApplying()) History.recordColumnColorChange(currentBoardId, colId, oldColor, color);
      Modal.close();
      await loadBoard();
    } catch (err) { showToast(err.message, 'error'); }
  }

  function showCardCtxMenu(e, cardId, colId) {
    e.stopPropagation();
    const perm = currentPermissions;
    const card = findCard(cardId);
    CtxMenu.show(e, [
      { label: I18n.t('cardEdit'), icon: '✏️', tooltip: I18n.t('ctxEditCard'), action: () => openCard(cardId) },
      ...(perm.canEdit ? [
        { label: I18n.t('changeAssignee'), icon: '👤', tooltip: I18n.t('changeAssignee'), action: () => showAssigneePicker(cardId, card?.assignee_id) },
        { type: 'sep' },
        { label: I18n.t('deleteCard'), icon: '🗑️', tooltip: I18n.t('ctxDeleteCard'), danger: true, action: () => deleteCard(cardId) }
      ] : [])
    ]);
  }

  // ── Column actions ────────────────────────────────────────────────────────

  function startEditColTitle(colId) {
    const span = document.getElementById(`col-title-${colId}`);
    if (!span) return;
    const old = span.textContent;
    span.style.display = 'none';
    const wrap = document.createElement('div');
    wrap.className = 'inline-edit';
    wrap.innerHTML = `<input value="${escHtml(old)}" style="flex:1">
      <button class="btn btn-secondary btn-sm" onclick="cancelColEdit(${colId})">${I18n.t('cancel')}</button>
      <button class="btn btn-primary btn-sm" onclick="saveColTitle(${colId})">${I18n.t('save')}</button>`;
    span.parentElement.insertBefore(wrap, span);
    const input = wrap.querySelector('input');
    input.focus();
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') saveColTitle(colId);
      if (e.key === 'Escape') cancelColEdit(colId);
    });
    input.addEventListener('blur', () => {
      setTimeout(() => {
        if (document.body.contains(wrap)) saveColTitle(colId);
      }, 120);
    });
    window.saveColTitle = async (id) => {
      const val = input.value.trim();
      if (!val || val === old) { cancelColEdit(id); return; }
      try {
        await API.put(`/boards/${currentBoardId}/columns/${id}`, { title: val });
        if (!History.isApplying()) History.recordColumnRename(currentBoardId, id, old, val);
        await loadBoard();
      } catch (err) { showToast(err.message, 'error'); }
    };
    window.cancelColEdit = () => { wrap.remove(); span.style.display = ''; };
  }

  async function deleteColumn(colId) {
    const ok = await Modal.confirm({
      title: I18n.t('confirmTitle'),
      message: I18n.t('confirmDeleteColumn'),
      confirmLabel: I18n.t('delete'),
    });
    if (!ok) return;
    const col = boardData?.find(c => c.id == colId);
    const snapshot = col ? { id: col.id, title: col.title, position: col.position, cards: col.cards.map(c => ({ ...c })) } : null;
    try {
      await API.delete(`/boards/${currentBoardId}/columns/${colId}`);
      if (!History.isApplying() && snapshot) History.recordColumnDelete(currentBoardId, snapshot);
      await loadBoard();
    }
    catch (err) { showToast(err.message, 'error'); }
  }

  async function promptAddColumn() {
    Modal.dialog({
      title: I18n.t('addColumn'),
      icon: '➕',
      size: 'sm',
      body: `
      <div class="form-group">
        <label>${I18n.t('columnName')}</label>
        <input id="new-col-title" class="form-control" autofocus>
      </div>`,
      footer: Modal.footerCancelPrimary(I18n.t('addColumn'), 'BoardView.addColumn()', { primaryIcon: '➕' }),
    });
    document.getElementById('new-col-title').addEventListener('keydown', e => { if (e.key === 'Enter') addColumn(); });
  }

  async function addColumn() {
    const title = document.getElementById('new-col-title').value.trim();
    if (!title) return;
    try {
      const created = await API.post(`/boards/${currentBoardId}/columns`, { title });
      if (!History.isApplying()) History.recordColumnAdd(currentBoardId, created.id, title);
      Modal.close();
      await loadBoard();
    } catch (err) { showToast(err.message, 'error'); }
  }

  // ── Card actions ──────────────────────────────────────────────────────────

  function cardColorPickerBlock(prefix, labelKey, selectedColor) {
    const currentHex = resolveCardHex(selectedColor);
    const isPreset = COLUMN_BG_PRESETS.includes(currentHex);
    const isCustom = currentHex && !isPreset;
    const customInitVal = isCustom ? currentHex : '#3B82F6';
    const swatchClass = `${prefix}-color-swatch`;
    const swatches = COLUMN_BG_PRESETS.map(hex => `
      <div class="col-color-swatch ${swatchClass}${hex === currentHex ? ' selected' : ''}" style="background:${hex}" data-color="${hex}" title="${hex}"
           onclick="BoardView.selectCardColor('${prefix}', this.dataset.color)"></div>
    `).join('');
    return `
      <div class="form-group">
        <label>${I18n.t(labelKey)}</label>
        <div class="col-color-grid" style="max-width:396px">
          <div class="col-color-swatch ${swatchClass} col-color-none${!currentHex ? ' selected' : ''}" data-color="" title="${I18n.t('colorDefault')}"
               onclick="BoardView.selectCardColor('${prefix}', '')">
            <span style="font-size:15px;line-height:1">✕</span>
          </div>
          ${swatches}
        </div>
        <div style="display:flex;gap:8px;align-items:center;margin-top:8px">
          <input type="color" id="${prefix}-custom-picker" value="${escAttr(customInitVal)}"
                 style="width:44px;height:34px;border-radius:6px;border:1px solid var(--border);padding:2px;cursor:pointer;background:none;flex-shrink:0"
                 oninput="BoardView.selectCardColor('${prefix}', this.value)">
          <input type="text" id="${prefix}-custom-hex" class="form-control" maxlength="7"
                 value="${escAttr(isCustom ? currentHex : '')}" placeholder="#RRGGBB"
                 style="font-family:monospace;font-size:13px"
                 oninput="const v=this.value.trim();if(/^#[0-9A-Fa-f]{6}$/.test(v))BoardView.selectCardColor('${prefix}', v)">
        </div>
        <input type="hidden" id="${prefix}-sel-color" value="${escAttr(currentHex)}">
      </div>`;
  }

  function selectCardColor(prefix, value) {
    document.querySelectorAll(`.${prefix}-color-swatch`).forEach(s => s.classList.remove('selected'));
    const hidden = document.getElementById(`${prefix}-sel-color`);
    const hexInput = document.getElementById(`${prefix}-custom-hex`);
    const picker = document.getElementById(`${prefix}-custom-picker`);
    if (hidden) hidden.value = value || '';
    if (value && /^#[0-9A-Fa-f]{6}$/i.test(value)) {
      if (hexInput) hexInput.value = value;
      if (picker) picker.value = value;
      const match = document.querySelector(`.${prefix}-color-swatch[data-color="${value}"]`);
      if (match) match.classList.add('selected');
    } else if (!value) {
      if (hexInput) hexInput.value = '';
      document.querySelector(`.${prefix}-color-swatch.col-color-none`)?.classList.add('selected');
    }
  }

  function cardColorPickersHtml(bgColor, stripeColor) {
    return `
      ${cardColorPickerBlock('card-bg', 'cardBgColor', bgColor || '')}
      ${cardColorPickerBlock('card-stripe', 'cardStripeColor', stripeColor || '')}`;
  }

  function getSelectedCardBgColor() {
    return document.getElementById('card-bg-sel-color')?.value || '';
  }

  function getSelectedCardStripeColor() {
    return document.getElementById('card-stripe-sel-color')?.value || '';
  }

  async function showAddCard(colId) {
    await loadAssignees();
    const userOptions = assigneeOptionsHtml(null);
    Modal.dialog({
      title: I18n.t('addCardTitle'),
      icon: '📝',
      size: 'md',
      body: `
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
      ${cardColorPickersHtml('', '')}`,
      footer: Modal.footerCancelPrimary(I18n.t('addCardTitle'), `BoardView.createCard(${colId})`, { primaryIcon: '➕' }),
    });
    document.getElementById('new-card-title').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) createCard(colId); });
  }

  async function createCard(colId) {
    const title = document.getElementById('new-card-title').value.trim();
    const description = document.getElementById('new-card-desc').value.trim();
    const assigneeId = document.getElementById('new-card-assignee').value;
    const dueDate = document.getElementById('new-card-due').value;
    const bgColor = getSelectedCardBgColor();
    const stripeColor = getSelectedCardStripeColor();
    if (!title) { showToast(I18n.t('cardTitle'), 'error'); return; }
    try {
      const created = await API.post(`/boards/${currentBoardId}/cards`, { columnId: colId, title, description, assigneeId, dueDate, bgColor, stripeColor });
      if (!History.isApplying()) {
        History.recordCardCreate(currentBoardId, created.id, { columnId: colId, title, description, assigneeId, dueDate, bgColor, stripeColor });
      }
      Modal.close();
      await loadBoard();
    } catch (err) { showToast(err.message, 'error'); }
  }

  async function openCard(cardId) {
    pendingCommentFiles = [];
    pendingReplyFiles = {};
    editCommentOriginals.clear();
    try {
      await loadAssignees();
      const card = await API.get(`/boards/${currentBoardId}/cards/${cardId}`);
      const canEdit = currentPermissions.canEdit;
      const extraAssignee = card.assignee_id && !assignees.find(u => u.id == card.assignee_id)
        ? { id: card.assignee_id, display_name: card.assignee_name, username: card.assignee_name }
        : null;
      const userOptions = assigneeOptionsHtml(card.assignee_id, extraAssignee);

      const attachHtml = card.attachments.length > 0
        ? card.attachments.map(a => renderAttachItem(a, canEdit, cardId)).join('')
        : `<div style="font-size:12px;color:var(--text-light);padding:4px 0">${I18n.t('noAttach')}</div>`;

      Modal.dialog({
        title: I18n.t('cardEdit'),
        icon: '✏️',
        size: 'lg',
        body: `
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
        ${canEdit ? cardColorPickersHtml(card.bg_color || '', card.stripe_color || card.color || '') : ''}
        <div class="modal-section">
          <div class="modal-section-title">${I18n.t('attachments')}</div>
          <div class="attachment-list" id="attach-list">${attachHtml}</div>
          ${canEdit ? `<label class="upload-btn">&#128206; ${I18n.t('attachFile')}<input type="file" id="attach-input" multiple onchange="BoardView.uploadAttachment(${cardId})"></label>` : ''}
        </div>
        <div class="modal-section" style="margin-bottom:0">
          <div class="modal-section-title">💬 ${I18n.t('comments')}</div>
          <div id="card-comments-section"><div style="font-size:12px;color:var(--text-muted)">${I18n.t('loadingComments')}</div></div>
        </div>`,
        footer: canEdit
          ? `
            <div class="modal-footer-left">
              ${Modal.btn({ label: I18n.t('deleteCard'), icon: '🗑️', variant: 'danger', extraClass: 'btn-sm', onclick: `BoardView.deleteCard(${cardId})` })}
              <span id="card-autosave-status" class="autosave-status autosave-saved">${escHtml(I18n.t('autoSaved'))}</span>
            </div>
            ${Modal.btn({ label: I18n.t('close'), icon: '✕', variant: 'secondary', onclick: 'Modal.close()' })}
            ${Modal.btn({ label: I18n.t('save'), icon: '💾', variant: 'primary', onclick: `BoardView.saveCard(${cardId})` })}`
          : Modal.btn({ label: I18n.t('close'), icon: '✕', variant: 'primary', onclick: 'Modal.close()' }),
      });
      if (canEdit) setupCardAutoSave(cardId, card);
      loadComments(cardId);
    } catch (err) { showToast(err.message, 'error'); }
  }

  function collectCardPayload() {
    const title = document.getElementById('ec-title')?.value.trim();
    if (!title) return null;
    return {
      title,
      description: document.getElementById('ec-desc')?.value.trim() || '',
      assigneeId: document.getElementById('ec-assignee')?.value || '',
      dueDate: document.getElementById('ec-due')?.value || '',
      bgColor: getSelectedCardBgColor() || '',
      stripeColor: getSelectedCardStripeColor() || '',
    };
  }

  function setupCardAutoSave(cardId, card) {
    const saveKey = `card:${cardId}`;
    const initial = {
      title: card.title,
      description: card.description || '',
      assigneeId: card.assignee_id ? String(card.assignee_id) : '',
      dueDate: card.due_date ? card.due_date.substring(0, 10) : '',
      bgColor: card.bg_color || '',
      stripeColor: card.stripe_color || card.color || '',
    };
    let committedCard = { ...initial };
    AutoSave.start(saveKey, {
      indicatorId: 'card-autosave-status',
      initialPayload: initial,
      collect: collectCardPayload,
      save: async (payload) => {
        const before = { ...committedCard };
        await API.put(`/boards/${currentBoardId}/cards/${cardId}`, payload);
        if (!History.isApplying()) History.recordCardUpdate(currentBoardId, cardId, before, payload);
        committedCard = { ...payload };
        await loadBoard();
      },
    });
    ['ec-title', 'ec-desc'].forEach((id) => {
      document.getElementById(id)?.addEventListener('input', () => AutoSave.schedule(saveKey));
    });
    ['ec-assignee', 'ec-due'].forEach((id) => {
      document.getElementById(id)?.addEventListener('change', () => AutoSave.schedule(saveKey));
    });
    document.querySelectorAll('.card-bg-color-swatch, .card-stripe-color-swatch').forEach((dot) => {
      dot.addEventListener('click', () => AutoSave.schedule(saveKey));
    });
    ['card-bg-custom-picker', 'card-bg-custom-hex', 'card-stripe-custom-picker', 'card-stripe-custom-hex'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => AutoSave.schedule(saveKey));
    });
    Modal.setBeforeClose(async () => {
      const title = document.getElementById('ec-title')?.value.trim();
      if (!title) {
        showToast(I18n.t('cardTitle') + ' ' + I18n.t('fieldRequired'), 'error');
        return false;
      }
      const ok = await AutoSave.flush(saveKey);
      AutoSave.stop(saveKey);
      return ok;
    });
  }

  async function saveCard(cardId) {
    const ok = await AutoSave.flush(`card:${cardId}`);
    if (!ok) return;
    AutoSave.stop(`card:${cardId}`);
    Modal.close();
  }

  async function showAssigneePicker(cardId, currentAssigneeId) {
    await loadAssignees();
    const card = findCard(cardId);
    const extraAssignee = currentAssigneeId && !assignees.find(u => u.id == currentAssigneeId) && card?.assignee_name
      ? { id: currentAssigneeId, display_name: card.assignee_name, username: card.assignee_name }
      : null;
    Modal.dialog({
      title: I18n.t('changeAssignee'),
      icon: '👤',
      size: 'sm',
      body: `
      <div class="form-group">
        <label>${I18n.t('assignee')}</label>
        <select id="pick-assignee" class="form-control">
          <option value="">${I18n.t('none')}</option>
          ${assigneeOptionsHtml(currentAssigneeId, extraAssignee)}
        </select>
      </div>`,
      footer: `
        <div class="modal-footer-left"><span id="assignee-autosave-status" class="autosave-status autosave-saved">${escHtml(I18n.t('autoSaved'))}</span></div>
        ${Modal.btn({ label: I18n.t('close'), icon: '✕', variant: 'primary', onclick: 'Modal.close()' })}`,
    });
    const saveKey = `assignee:${cardId}`;
    const initial = { assigneeId: currentAssigneeId ? String(currentAssigneeId) : '' };
    let committedAssignee = { ...initial };
    AutoSave.start(saveKey, {
      indicatorId: 'assignee-autosave-status',
      initialPayload: initial,
      collect: () => ({ assigneeId: document.getElementById('pick-assignee')?.value || '' }),
      save: async (payload) => {
        const before = {
          title: card?.title || '',
          description: card?.description || '',
          assigneeId: committedAssignee.assigneeId,
          dueDate: card?.due_date ? String(card.due_date).substring(0, 10) : '',
          bgColor: card?.bg_color || '',
          stripeColor: card?.stripe_color || card?.color || '',
        };
        const after = { ...before, assigneeId: payload.assigneeId };
        await API.put(`/boards/${currentBoardId}/cards/${cardId}`, payload);
        if (!History.isApplying()) History.recordCardUpdate(currentBoardId, cardId, before, after);
        committedAssignee = { assigneeId: payload.assigneeId };
        await loadBoard();
      },
    });
    document.getElementById('pick-assignee')?.addEventListener('change', () => AutoSave.schedule(saveKey));
    Modal.setBeforeClose(async () => {
      const ok = await AutoSave.flush(saveKey);
      AutoSave.stop(saveKey);
      return ok;
    });
  }

  async function saveAssignee(cardId) {
    await AutoSave.flush(`assignee:${cardId}`);
    AutoSave.stop(`assignee:${cardId}`);
    Modal.close();
  }

  async function deleteCard(cardId) {
    const ok = await Modal.confirm({
      title: I18n.t('confirmTitle'),
      message: I18n.t('confirmDeleteCard'),
      confirmLabel: I18n.t('delete'),
    });
    if (!ok) return;
    const loc = getCardLocation(cardId);
    const card = findCard(cardId);
    const snapshot = card ? { ...card, column_id: loc?.columnId ?? card.column_id, position: loc?.position ?? 0 } : null;
    AutoSave.stop(`card:${cardId}`);
    Modal.clearBeforeClose();
    try {
      await API.delete(`/boards/${currentBoardId}/cards/${cardId}`);
      if (!History.isApplying() && snapshot) History.recordCardDelete(currentBoardId, snapshot);
      Modal.forceClose();
      await loadBoard();
    }
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
        list.insertAdjacentHTML('beforeend', renderAttachItem(attach, true, cardId));
      } catch (err) { showToast(I18n.t('uploadFailed') + ': ' + err.message, 'error'); }
    }
    input.value = '';
  }

  async function deleteAttachment(cardId, attachId) {
    try {
      await API.delete(`/boards/${currentBoardId}/cards/${cardId}/attachments/${attachId}`);
      document.getElementById(`attach-${attachId}`)?.remove();
    } catch (err) { showToast(err.message, 'error'); }
  }

  // ── Attachment helpers ────────────────────────────────────────────────────

  function fileIcon(mimetype, filename) {
    const ext = (filename || '').split('.').pop().toLowerCase();
    const byExt = { jpg:'🖼️', jpeg:'🖼️', png:'🖼️', gif:'🖼️', svg:'🖼️', webp:'🖼️', bmp:'🖼️',
                    pdf:'📄', doc:'📝', docx:'📝', xls:'📊', xlsx:'📊', ppt:'📑', pptx:'📑',
                    zip:'🗜️', rar:'🗜️', '7z':'🗜️', tar:'🗜️', gz:'🗜️',
                    mp4:'🎬', avi:'🎬', mkv:'🎬', mov:'🎬', mp3:'🎵', wav:'🎵', ogg:'🎵', flac:'🎵',
                    txt:'📃', csv:'📊', json:'📃', xml:'📃', html:'🌐', js:'📃', ts:'📃', py:'📃' };
    if (byExt[ext]) return byExt[ext];
    if (!mimetype) return '📎';
    if (mimetype.startsWith('image/')) return '🖼️';
    if (mimetype === 'application/pdf') return '📄';
    if (mimetype.includes('word') || mimetype.includes('document')) return '📝';
    if (mimetype.includes('excel') || mimetype.includes('spreadsheet')) return '📊';
    if (mimetype.includes('powerpoint') || mimetype.includes('presentation')) return '📑';
    if (mimetype.startsWith('video/')) return '🎬';
    if (mimetype.startsWith('audio/')) return '🎵';
    if (mimetype.includes('zip') || mimetype.includes('compressed') || mimetype.includes('tar')) return '🗜️';
    if (mimetype.startsWith('text/')) return '📃';
    return '📎';
  }

  function renderAttachItem(a, canEdit, cardId) {
    const icon = fileIcon(a.mimetype, a.original_name);
    const isElectron = typeof window.electron !== 'undefined' && window.electron.openAttachment;
    const dblclickAttr = isElectron
      ? `ondblclick="BoardView.openAttachment('${escAttr(a.filename)}')" title="${escAttr(a.original_name)}\n(${I18n.getLang() === 'ko' ? '더블클릭으로 파일 열기' : 'Double-click to open'})"`
      : `title="${escAttr(a.original_name)}"`;
    const nameEl = isElectron
      ? `<span class="attachment-name attachment-name-link" ${dblclickAttr}>${escHtml(a.original_name)}</span>`
      : `<a href="/uploads/${escAttr(a.filename)}" target="_blank" class="attachment-name" ${dblclickAttr}>${escHtml(a.original_name)}</a>`;
    const openBtn = isElectron
      ? `<button class="btn-icon attachment-open" onclick="BoardView.openAttachment('${escAttr(a.filename)}')" title="${I18n.getLang() === 'ko' ? '파일 열기' : 'Open file'}">&#128065;</button>`
      : `<a href="/uploads/${escAttr(a.filename)}" target="_blank" class="btn-icon attachment-open" title="${I18n.getLang() === 'ko' ? '파일 열기' : 'Open file'}">&#128065;</a>`;
    return `
      <div class="attachment-item" id="attach-${a.id}">
        <span class="attachment-icon">${icon}</span>
        ${nameEl}
        <span class="attachment-size">${fileSize(a.size)}</span>
        ${openBtn}
        ${canEdit ? `<button class="attachment-del btn-icon" onclick="BoardView.deleteAttachment(${cardId},${a.id})" title="${I18n.getLang() === 'ko' ? '삭제' : 'Delete'}">&#10005;</button>` : ''}
      </div>`;
  }

  async function openAttachment(filename) {
    if (typeof window.electron !== 'undefined' && window.electron.openAttachment) {
      const result = await window.electron.openAttachment(filename);
      if (!result.ok) showToast(result.error || (I18n.getLang() === 'ko' ? '파일을 열 수 없습니다.' : 'Cannot open file.'), 'error');
    } else {
      window.open(`/uploads/${filename}`, '_blank');
    }
  }

  // ── Member management ─────────────────────────────────────────────────────

  async function showMembers() {
    try {
      const { owner, members } = await API.get(`/boards/${currentBoardId}/members`);
      const allUsers = await API.get('/users/active');
      const memberIds = new Set([
        ...(owner ? [String(owner.id)] : []),
        ...members.map(m => String(m.id)),
      ]);
      const nonMembers = allUsers.filter(u => !memberIds.has(String(u.id)));

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
          <button class="btn btn-sm" style="color:var(--danger)" onclick="BoardView.removeMember(${m.id},'${escAttr(m.display_name || m.username)}')">${I18n.t('removeBtn')}</button>
        </div>`).join('') || `<div style="color:var(--text-muted);font-size:13px;padding:8px">${I18n.t('noMembers')}</div>`;

      const nonMemberOptions = nonMembers.map(u =>
        `<option value="${u.id}">${escHtml(u.display_name || u.username)} (@${escHtml(u.username)})</option>`).join('');

      Modal.dialog({
        title: I18n.t('memberMgmt'),
        icon: '👥',
        size: 'lg',
        body: `
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
          <div class="modal-section-title">${I18n.t('members')} (${members.length})</div>
          <div class="member-list" id="member-list">${memberRows}</div>
        </div>
        ${nonMembers.length > 0 ? `
          <div class="modal-section">
            <div class="modal-section-title">${I18n.t('addMember')}</div>
            <div class="member-add-row">
              <select id="add-member-user" class="form-control">
                ${nonMemberOptions}
              </select>
              <select id="add-member-role" class="form-control member-role-input">
                <option value="editor">${I18n.t('roleEditor')}</option>
                <option value="viewer">${I18n.t('roleViewer')}</option>
                <option value="admin">${I18n.t('roleAdmin')}</option>
              </select>
              ${Modal.btn({ label: I18n.t('addMember'), icon: '➕', variant: 'primary', extraClass: 'btn-sm', onclick: 'BoardView.addMember()' })}
            </div>
          </div>` : ''}`,
      });
    } catch (err) { showToast(err.message, 'error'); }
  }

  async function addMember() {
    const userId = document.getElementById('add-member-user').value;
    const role = document.getElementById('add-member-role').value;
    if (!userId) return;
    try {
      await API.post(`/boards/${currentBoardId}/members`, { userId, role });
      await loadAssignees();
      showToast(I18n.t('memberAdded'), 'success');
      showMembers();
    } catch (err) { showToast(err.message, 'error'); }
  }

  async function changeMemberRole(userId, role) {
    try {
      await API.put(`/boards/${currentBoardId}/members/${userId}`, { role });
    } catch (err) { showToast(err.message, 'error'); showMembers(); }
  }

  async function removeMember(userId, memberName = '') {
    const ok = await Modal.confirm({
      title: I18n.t('confirmTitle'),
      message: memberName
        ? I18n.t('confirmRemoveMember', { name: memberName })
        : I18n.t('confirmRemoveMember', { name: I18n.t('members') }),
      confirmLabel: I18n.t('removeBtn'),
    });
    if (!ok) return;
    try {
      await API.delete(`/boards/${currentBoardId}/members/${userId}`);
      await loadAssignees();
      document.getElementById(`mitem-${userId}`)?.remove();
      showToast(I18n.t('deletedDone'), 'success');
    } catch (err) { showToast(err.message, 'error'); }
  }

  // ── Summary / Burndown ────────────────────────────────────────────────────

  function todayDateKey() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function burndownRangeStorageKey(boardId) {
    return `burndown-range-${boardId}`;
  }

  function loadBurndownRange(boardId) {
    try {
      const raw = localStorage.getItem(burndownRangeStorageKey(boardId));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function saveBurndownRange(boardId, startDate, endDate) {
    localStorage.setItem(burndownRangeStorageKey(boardId), JSON.stringify({ start: startDate, end: endDate }));
  }

  function formatSummaryDate(dateKey) {
    if (!dateKey) return '';
    return new Date(dateKey + 'T12:00:00').toLocaleDateString(
      I18n.getLang() === 'ko' ? 'ko-KR' : 'en-US',
      { year: 'numeric', month: 'short', day: 'numeric' }
    );
  }

  function buildSummaryQuery(startDate, endDate) {
    const qs = new URLSearchParams();
    if (startDate) qs.set('startDate', startDate);
    if (endDate) qs.set('endDate', endDate);
    const q = qs.toString();
    return q ? `?${q}` : '';
  }

  function paintBurndownChart(columns, burndown) {
    burndownChartCache = { columns, burndown };
    if (burndownChart) { burndownChart.destroy(); burndownChart = null; }

    const labels = burndown.map(d => d.date.substring(5));
    const remainingArr = burndown.map(d => d.remaining);
    const idealArr = burndown.map(d => d.ideal ?? 0);
    const scopeArr = burndown.map(d => (d.columnCounts || []).reduce((sum, n) => sum + n, 0));
    const yMax = Math.max(1, ...remainingArr, ...idealArr, ...scopeArr);
    const pointRadius = burndown.length > 60 ? 2 : 4;

    const canvas = document.getElementById('burndown-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const theme = getBurndownChartTheme();

    const columnDatasets = columns.map((col, i) => {
      const isDone = col.type === 'done';
      const color = isDone ? '#22C55E' : COLUMN_CHART_COLORS[i % COLUMN_CHART_COLORS.length];
      return {
        label: isDone ? `${col.title} ✓` : col.title,
        data: burndown.map(d => (d.columnCounts && d.columnCounts[i]) ?? 0),
        borderColor: color,
        backgroundColor: chartRgba(color, isDone ? 0.45 : 0.35),
        legendColor: color,
        fill: true,
        stack: 'columns',
        tension: 0.25,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: isDone ? 2 : 1.5,
        pointStyle: 'rect',
        order: 1,
      };
    });

    const legendLabels = (chart) => chart.data.datasets.map((ds, i) => ({
      text: ds.label,
      fillStyle: ds.legendColor || ds.borderColor,
      strokeStyle: ds.legendColor || ds.borderColor,
      fontColor: theme.text,
      color: theme.text,
      lineWidth: 0,
      hidden: !chart.isDatasetVisible(i),
      datasetIndex: i,
      pointStyle: 'rect',
    }));

    burndownChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          ...columnDatasets,
          {
            label: I18n.t('burndownRemaining'),
            data: remainingArr,
            borderColor: '#6366F1',
            backgroundColor: 'transparent',
            legendColor: '#6366F1',
            fill: false,
            tension: 0.2,
            pointRadius,
            pointHoverRadius: 6,
            pointBackgroundColor: '#6366F1',
            pointBorderColor: '#fff',
            pointBorderWidth: 1,
            borderWidth: 2.5,
            spanGaps: true,
            order: 0,
            stack: 'burndown-remaining',
            pointStyle: 'rect',
          },
          {
            label: I18n.t('burndownIdeal'),
            data: idealArr,
            borderColor: theme.idealLine,
            backgroundColor: 'transparent',
            legendColor: theme.idealLine,
            borderDash: [8, 4],
            fill: false,
            tension: 0,
            pointRadius: 0,
            pointHoverRadius: 4,
            borderWidth: 2,
            spanGaps: true,
            order: 0,
            stack: 'burndown-ideal',
            pointStyle: 'rect',
          },
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400 },
        interaction: { mode: 'index', intersect: false },
        plugins: {
              legend: {
                labels: {
                  color: theme.text,
                  usePointStyle: true,
                  pointStyle: 'rect',
                  pointStyleWidth: 14,
                  padding: 14,
                  font: { size: 11, color: theme.text },
                  generateLabels: legendLabels,
                },
              },
          tooltip: {
            backgroundColor: theme.bgCard,
            titleColor: theme.text,
            bodyColor: theme.textMuted,
            footerColor: theme.textMuted,
            borderColor: theme.border,
            borderWidth: 1,
            callbacks: {
              title: (items) => {
                const idx = items[0]?.dataIndex;
                return burndown[idx] ? burndown[idx].date : items[0]?.label;
              },
              label: (ctx) => {
                const val = ctx.parsed.y;
                const label = ctx.dataset.label || '';
                return `${label}: ${Number.isInteger(val) ? val : val.toFixed(1)}`;
              },
              footer: (items) => {
                const idx = items[0]?.dataIndex;
                const counts = burndown[idx]?.columnCounts;
                if (!counts || !counts.length) return '';
                const total = counts.reduce((sum, n) => sum + n, 0);
                return `${I18n.t('chartCardTotal')}: ${total}`;
              },
            }
          }
        },
        scales: {
          x: {
            ticks: { color: theme.textMuted, maxTicksLimit: 12 },
            grid: { color: theme.grid }
          },
          y: {
            type: 'linear',
            position: 'left',
            beginAtZero: true,
            stacked: true,
            suggestedMax: yMax + 1,
            title: { display: true, text: I18n.t('chartCardCount'), color: theme.textMuted, font: { size: 11 } },
            ticks: { color: theme.textMuted, precision: 0, maxTicksLimit: 10 },
            grid: { color: theme.grid }
          },
        }
      }
    });
  }

  function refreshBurndownChartTheme() {
    if (!burndownChartCache || !document.getElementById('burndown-chart')) return false;
    paintBurndownChart(burndownChartCache.columns, burndownChartCache.burndown);
    return true;
  }

  function updateBurndownRangeSubtitle(startDate, endDate) {
    const el = document.getElementById('burndown-range-subtitle');
    if (!el || !startDate || !endDate) return;
    el.textContent = `${formatSummaryDate(startDate)} ~ ${formatSummaryDate(endDate)}`;
  }

  async function applyBurndownDateRange() {
    const startEl = document.getElementById('burndown-start');
    const endEl = document.getElementById('burndown-end');
    const start = startEl?.value;
    const end = endEl?.value;
    if (!start || !end) {
      showToast(I18n.t('burndownDateRequired'), 'error');
      return;
    }
    if (start > end) {
      showToast(I18n.t('burndownDateInvalid'), 'error');
      return;
    }
    if (end > todayDateKey()) {
      showToast(I18n.t('burndownEndFuture'), 'error');
      return;
    }

    saveBurndownRange(currentBoardId, start, end);
    const wrap = document.querySelector('.burndown-chart-wrap');
    if (wrap) wrap.classList.add('chart-loading');

    try {
      const data = await API.get(`/boards/${currentBoardId}/summary${buildSummaryQuery(start, end)}`);
      if (summaryReportCache?.boardId === currentBoardId) {
        summaryReportCache.data = { ...summaryReportCache.data, ...data };
      }
      updateBurndownRangeSubtitle(data.burndownStartDate, data.burndownEndDate);
      if (startEl) startEl.value = data.burndownStartDate;
      if (endEl) endEl.value = data.burndownEndDate;
      requestAnimationFrame(() => requestAnimationFrame(() => paintBurndownChart(data.columns, data.burndown || [])));
      showToast(I18n.t('refreshed'), 'success', 1200);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      wrap?.classList.remove('chart-loading');
    }
  }

  async function showSummary() {
    const main = document.getElementById('main-content');
    if (burndownChart) { burndownChart.destroy(); burndownChart = null; }
    main.innerHTML = `<div class="spinner-wrap"><div class="spinner"></div></div>`;

    try {
      const savedRange = loadBurndownRange(currentBoardId);
      const data = await API.get(`/boards/${currentBoardId}/summary${buildSummaryQuery(savedRange?.start, savedRange?.end)}`);
      const {
        boardTitle, columns, totalCards, completedCards, overdueCards,
        burndown = [], burndownStartDate, burndownEndDate, projectStartDate,
      } = data;
      summaryReportCache = { boardId: currentBoardId, data: { ...data, boardTitle } };

      const rangeSubtitle = burndownStartDate && burndownEndDate
        ? `${formatSummaryDate(burndownStartDate)} ~ ${formatSummaryDate(burndownEndDate)}`
        : '';

      const totalNonZero = totalCards || 1;
      const colBars = columns.map(col => `
        <div class="col-bar-row">
          <div class="col-bar-label">${escHtml(col.title)}</div>
          <div class="col-bar-track"><div class="col-bar-fill" style="width:${(col.count/totalNonZero*100).toFixed(0)}%"></div></div>
          <div class="col-bar-count">${col.count}</div>
        </div>`).join('');

      const todayKey = todayDateKey();

      main.innerHTML = `
        <div id="board-view">
          <div class="board-toolbar">
            ${renderBackButton(`BoardView.openBoard(${currentBoardId})`, 'backToKanban', '&#8592; &#9783;')}
            <span class="board-toolbar-title">${I18n.t('summaryTitle')}</span>
            <div class="board-toolbar-actions">
              <button type="button" class="btn btn-primary btn-sm" onclick="BoardView.exportSummaryReport()">&#128196; ${I18n.t('exportReport')}</button>
            </div>
          </div>
          <div class="summary-wrap">
            <div class="stat-grid">
              <div class="stat-card"><div class="stat-label">${I18n.t('totalCards')}</div><div class="stat-value">${totalCards}</div></div>
              <div class="stat-card"><div class="stat-label">${I18n.t('completedCards')}</div><div class="stat-value success">${completedCards}</div></div>
              <div class="stat-card"><div class="stat-label">${I18n.t('overdueCards')}</div><div class="stat-value ${overdueCards > 0 ? 'danger' : ''}">${overdueCards}</div></div>
              <div class="stat-card"><div class="stat-label">${I18n.t('completionRate')}</div><div class="stat-value">${totalCards > 0 ? Math.round(completedCards/totalCards*100) : 0}%</div></div>
            </div>
            <div class="chart-wrap">
              <div class="chart-title">${I18n.t('columnDist')}</div>
              <div class="col-dist">${colBars}</div>
            </div>
            <div class="chart-wrap">
              <div class="chart-header-row">
                <div class="chart-title">
                  ${I18n.t('burndownChart')}
                  ${rangeSubtitle ? `<span class="chart-subtitle" id="burndown-range-subtitle">${rangeSubtitle}</span>` : ''}
                </div>
                <div class="chart-date-range">
                  <label class="chart-date-field">
                    <span>${I18n.t('burndownStartDate')}</span>
                    <input type="date" id="burndown-start" class="form-control chart-date-input"
                      value="${burndownStartDate || projectStartDate || ''}"
                      max="${burndownEndDate || todayKey}">
                  </label>
                  <label class="chart-date-field">
                    <span>${I18n.t('burndownEndDate')}</span>
                    <input type="date" id="burndown-end" class="form-control chart-date-input"
                      value="${burndownEndDate || todayKey}"
                      max="${todayKey}">
                  </label>
                  <button type="button" class="btn btn-secondary btn-sm" onclick="BoardView.applyBurndownDateRange()">${I18n.t('burndownApply')}</button>
                </div>
              </div>
              <div class="chart-canvas-wrap burndown-chart-wrap">
                <canvas id="burndown-chart"></canvas>
              </div>
            </div>
          </div>
        </div>`;

      document.getElementById('burndown-end')?.addEventListener('change', (e) => {
        const startEl = document.getElementById('burndown-start');
        if (startEl && e.target.value) startEl.max = e.target.value;
      });
      document.getElementById('burndown-start')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') applyBurndownDateRange();
      });
      document.getElementById('burndown-end')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') applyBurndownDateRange();
      });

      requestAnimationFrame(() => requestAnimationFrame(() => paintBurndownChart(columns, burndown)));
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

  async function flushColumnEdit() {
    const wrap = document.querySelector('.inline-edit');
    if (!wrap) return;
    const span = wrap.parentElement?.querySelector('[id^="col-title-"]');
    if (!span?.id) return;
    const colId = parseInt(span.id.replace('col-title-', ''), 10);
    if (!Number.isNaN(colId) && typeof window.saveColTitle === 'function') {
      await window.saveColTitle(colId);
    }
  }

  async function reloadAfterHistory() {
    if (currentBoardId) await loadBoard();
    else await renderBoardList();
  }

  async function savePending() {
    await flushColumnEdit();
    return AutoSave.flushAll();
  }

  function exportSummaryReport() {
    ReportExport.showExportDialog(summaryReportCache);
  }

  /* ── Comment System ──────────────────────────────────────────────────── */

  function formatCommentTime(ts) {
    if (!ts) return '';
    const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (diff < 60) return I18n.t('justNow');
    if (diff < 3600) return Math.floor(diff / 60) + I18n.t('minutesAgo');
    if (diff < 86400) return Math.floor(diff / 3600) + I18n.t('hoursAgo');
    return Math.floor(diff / 86400) + I18n.t('daysAgo');
  }

  function avatarInitial(name) {
    return (name || '?').charAt(0).toUpperCase();
  }

  function renderCommentAttach(a, commentId, cardId, canDelete) {
    const isImg = a.mimetype && a.mimetype.startsWith('image/');
    const sizeStr = a.size ? (a.size > 1048576 ? (a.size / 1048576).toFixed(1) + ' MB' : Math.round(a.size / 1024) + ' KB') : '';
    const delBtn = canDelete ? `<button class="comment-attach-del" onclick="BoardView.deleteCommentAttachment(${a.id},${commentId},${cardId})" title="삭제">&times;</button>` : '';
    if (isImg) {
      return `<div class="comment-attach-item">
        <img class="comment-image" src="/uploads/${escAttr(a.filename)}" alt="${escAttr(a.original_name)}" onclick="BoardView.openAttachment('${escAttr(a.filename)}')" loading="lazy">
        ${delBtn}
      </div>`;
    }
    return `<div class="comment-attach-item">
      <span class="comment-file-link" onclick="BoardView.openAttachment('${escAttr(a.filename)}')" title="${escAttr(a.original_name)}">
        📎 <span>${escHtml(a.original_name)}</span>${sizeStr ? `<span class="comment-file-size">${sizeStr}</span>` : ''}
      </span>
      ${delBtn}
    </div>`;
  }

  function renderCommentAttachments(attachments, commentId, cardId, canDelete) {
    if (!attachments || !attachments.length) return '';
    return `<div class="comment-attachments">${attachments.map(a => renderCommentAttach(a, commentId, cardId, canDelete)).join('')}</div>`;
  }

  function renderCommentNode(node, depth, cardId, canEdit) {
    const isChild = depth > 0;
    const avatarClass = isChild ? 'comment-avatar comment-avatar-sm' : 'comment-avatar';
    const taClass = isChild ? 'comment-textarea comment-textarea-sm' : 'comment-textarea';
    const childrenHtml = (node.children || []).length
      ? `<div class="comment-replies">${(node.children || []).map(c => renderCommentNode(c, depth + 1, cardId, canEdit)).join('')}</div>`
      : '';

    if (node.deleted) {
      return `<div class="comment${isChild ? ' comment-reply' : ''}" id="comment-item-${node.id}">
        <div class="${avatarClass}" style="background:var(--border);color:var(--text-muted)">?</div>
        <div class="comment-body">
          <div class="comment-content" style="color:var(--text-muted);font-style:italic">[${I18n.getLang()==='ko'?'삭제된 댓글':'Deleted comment'}]</div>
          ${childrenHtml}
        </div>
      </div>`;
    }

    const isOwn = node.user_id && App.currentUser && node.user_id == App.currentUser.id;
    const canMod = canEdit || isOwn;
    const isEditing = editCommentOriginals.has(node.id);
    const authorName = escHtml(node.author_name || I18n.t('unknownUser'));
    const attachHtml = renderCommentAttachments(node.attachments, node.id, cardId, canMod);
    const pendingKey = `reply-${node.id}`;
    const pendingFiles = pendingReplyFiles[pendingKey] || [];
    const pendingHtml = pendingFiles.length
      ? `<div class="pending-files" id="pending-reply-files-${node.id}">${pendingFiles.map((f,i)=>`<span class="pending-file"><span class="pending-file-name">${escHtml(f.name)}</span><button class="btn-icon" style="font-size:10px;color:var(--danger)" onclick="BoardView.removePendingReplyFile('${pendingKey}',${i},${node.id})">&times;</button></span>`).join('')}</div>`
      : '';

    if (isEditing) {
      return `<div class="comment${isChild ? ' comment-reply' : ''}" id="comment-item-${node.id}">
        <div class="${avatarClass}">${avatarInitial(node.author_name)}</div>
        <div class="comment-body">
          <textarea id="comment-edit-ta-${node.id}" class="form-control ${taClass}">${escHtml(editCommentOriginals.get(node.id))}</textarea>
          <div class="comment-form-footer" style="margin-top:4px">
            <button class="btn btn-sm btn-secondary" onclick="BoardView.cancelEditComment(${node.id},${cardId})">${I18n.t('cancel')}</button>
            <button class="btn btn-sm btn-primary" onclick="BoardView.saveCommentEdit(${node.id},${cardId})">${I18n.t('save')}</button>
          </div>
          ${childrenHtml}
        </div>
      </div>`;
    }

    const replyForm = canEdit ? `<div id="reply-form-wrap-${node.id}" style="display:none">
      <div class="comment-form-new" style="margin-top:6px">
        <div class="comment-avatar comment-avatar-sm">${avatarInitial(App.currentUser?.displayName || App.currentUser?.username)}</div>
        <div class="comment-form-body">
          <textarea id="reply-ta-${node.id}" class="form-control comment-textarea comment-textarea-sm" placeholder="${escAttr(I18n.t('replyPlaceholder'))}"></textarea>
          ${pendingHtml}
          <div class="comment-form-footer">
            <label class="comment-file-label" for="reply-file-${node.id}">📎</label>
            <input type="file" id="reply-file-${node.id}" multiple style="display:none" onchange="BoardView.addPendingReplyFiles('${pendingKey}',${node.id},this)">
            <button class="btn btn-sm btn-secondary" onclick="BoardView.toggleReplyForm(${node.id},${cardId})">${I18n.t('cancel')}</button>
            <button class="btn btn-sm btn-primary" onclick="BoardView.submitReply(${cardId},${node.id})">${I18n.t('commentSubmit')}</button>
          </div>
        </div>
      </div>
    </div>` : '';

    return `<div class="comment${isChild ? ' comment-reply' : ''}" id="comment-item-${node.id}">
      <div class="${avatarClass}">${avatarInitial(node.author_name)}</div>
      <div class="comment-body">
        <div class="comment-meta">
          <span class="comment-author">${authorName}</span>
          <span class="comment-time">${formatCommentTime(node.created_at)}</span>
          ${node.updated_at && node.updated_at !== node.created_at ? `<span class="comment-edited">(${I18n.t('edited')})</span>` : ''}
          <div class="comment-actions">
            ${canMod ? `<button class="btn-icon comment-action-btn" onclick="BoardView.startEditComment(${node.id},${cardId})" title="${I18n.getLang()==='ko'?'수정':'Edit'}">✏️</button>` : ''}
            ${canMod ? `<button class="btn-icon comment-action-btn" onclick="BoardView.deleteComment(${node.id},${cardId})" title="${I18n.getLang()==='ko'?'삭제':'Delete'}">🗑️</button>` : ''}
          </div>
        </div>
        <div class="comment-content">${escHtml(node.content)}</div>
        ${attachHtml}
        <div class="comment-footer">
          ${canEdit ? `<button class="comment-reply-toggle" onclick="BoardView.toggleReplyForm(${node.id},${cardId})">${I18n.t('reply')}</button>` : ''}
          ${canMod ? `<label class="comment-attach-btn" for="comment-file-${node.id}" style="cursor:pointer">📎 ${I18n.getLang()==='ko'?'파일 첨부':'Attach'}</label>
          <input type="file" id="comment-file-${node.id}" multiple style="display:none" onchange="BoardView.addCommentAttachDirect(${node.id},${cardId},this)">` : ''}
        </div>
        ${replyForm}
        ${childrenHtml}
      </div>
    </div>`;
  }

  function renderNewCommentForm(cardId) {
    const pendingHtml = pendingCommentFiles.length ? `<div class="pending-files" id="pending-comment-files">${pendingCommentFiles.map((f,i)=>`<span class="pending-file"><span class="pending-file-name">${escHtml(f.name)}</span><button class="btn-icon" style="font-size:10px;color:var(--danger)" onclick="BoardView.removePendingCommentFile(${i})">&times;</button></span>`).join('')}</div>` : '';
    return `<div class="comment-form-new" id="new-comment-form">
      <div class="comment-avatar">${avatarInitial(App.currentUser?.displayName || App.currentUser?.username)}</div>
      <div class="comment-form-body">
        <textarea id="new-comment-ta" class="form-control comment-textarea" placeholder="${escAttr(I18n.t('commentPlaceholder'))}"></textarea>
        ${pendingHtml}
        <div class="comment-form-footer">
          <label class="comment-file-label" for="new-comment-file">📎</label>
          <input type="file" id="new-comment-file" multiple style="display:none" onchange="BoardView.addPendingCommentFiles(this)">
          <button class="btn btn-sm btn-primary" onclick="BoardView.submitComment(${cardId})">${I18n.t('commentSubmit')}</button>
        </div>
      </div>
    </div>`;
  }

  function buildCommentTree(flatList) {
    const byId = {};
    flatList.forEach(c => { byId[c.id] = { ...c, children: [] }; });
    const roots = [];
    flatList.forEach(c => {
      if (c.parent_id && byId[c.parent_id]) { byId[c.parent_id].children.push(byId[c.id]); }
      else { roots.push(byId[c.id]); }
    });
    return roots;
  }

  function renderComments(flatList, cardId) {
    const canEdit = currentPermissions.canEdit;
    const sec = document.getElementById('card-comments-section');
    if (!sec) return;
    const tree = buildCommentTree(flatList);
    const nonEmpty = tree.filter(c => !c.deleted || c.children.length > 0);
    const listHtml = nonEmpty.length
      ? nonEmpty.map(c => renderCommentNode(c, 0, cardId, canEdit)).join('')
      : `<div class="comment-empty">${I18n.t('noComments')}</div>`;
    sec.innerHTML = listHtml + (canEdit ? renderNewCommentForm(cardId) : '');
  }

  let _currentCardForComments = null;
  let _currentCommentsFlat = [];

  async function loadComments(cardId) {
    _currentCardForComments = cardId;
    const sec = document.getElementById('card-comments-section');
    if (!sec) return;
    try {
      const comments = await API.get(`/boards/${currentBoardId}/cards/${cardId}/comments`);
      _currentCommentsFlat = comments;
      renderComments(comments, cardId);
    } catch (err) {
      if (sec) sec.innerHTML = `<div class="comment-empty" style="color:var(--danger)">${escHtml(err.message)}</div>`;
    }
  }

  function addPendingCommentFiles(input) {
    if (!input?.files?.length) return;
    pendingCommentFiles = pendingCommentFiles.concat(Array.from(input.files));
    input.value = '';
    const sec = document.getElementById('card-comments-section');
    if (sec) {
      const ta = document.getElementById('new-comment-ta')?.value || '';
      const pending = document.getElementById('pending-comment-files');
      const newPending = `<div class="pending-files" id="pending-comment-files">${pendingCommentFiles.map((f,i)=>`<span class="pending-file"><span class="pending-file-name">${escHtml(f.name)}</span><button class="btn-icon" style="font-size:10px;color:var(--danger)" onclick="BoardView.removePendingCommentFile(${i})">&times;</button></span>`).join('')}</div>`;
      if (pending) { pending.outerHTML = newPending; } else {
        const ta2 = document.getElementById('new-comment-ta');
        if (ta2) ta2.insertAdjacentHTML('afterend', newPending);
      }
    }
  }

  function removePendingCommentFile(idx) {
    pendingCommentFiles.splice(idx, 1);
    const pending = document.getElementById('pending-comment-files');
    if (pending) {
      if (pendingCommentFiles.length) {
        pending.outerHTML = `<div class="pending-files" id="pending-comment-files">${pendingCommentFiles.map((f,i)=>`<span class="pending-file"><span class="pending-file-name">${escHtml(f.name)}</span><button class="btn-icon" style="font-size:10px;color:var(--danger)" onclick="BoardView.removePendingCommentFile(${i})">&times;</button></span>`).join('')}</div>`;
      } else { pending.remove(); }
    }
  }

  function addPendingReplyFiles(key, commentId, input) {
    if (!input?.files?.length) return;
    if (!pendingReplyFiles[key]) pendingReplyFiles[key] = [];
    pendingReplyFiles[key] = pendingReplyFiles[key].concat(Array.from(input.files));
    input.value = '';
    const pending = document.getElementById(`pending-reply-files-${commentId}`);
    const newHtml = `<div class="pending-files" id="pending-reply-files-${commentId}">${pendingReplyFiles[key].map((f,i)=>`<span class="pending-file"><span class="pending-file-name">${escHtml(f.name)}</span><button class="btn-icon" style="font-size:10px;color:var(--danger)" onclick="BoardView.removePendingReplyFile('${key}',${i},${commentId})">&times;</button></span>`).join('')}</div>`;
    if (pending) { pending.outerHTML = newHtml; } else {
      const ta = document.getElementById(`reply-ta-${commentId}`);
      if (ta) ta.insertAdjacentHTML('afterend', newHtml);
    }
  }

  function removePendingReplyFile(key, idx, commentId) {
    if (!pendingReplyFiles[key]) return;
    pendingReplyFiles[key].splice(idx, 1);
    const pending = document.getElementById(`pending-reply-files-${commentId}`);
    if (pending) {
      if (pendingReplyFiles[key].length) {
        pending.outerHTML = `<div class="pending-files" id="pending-reply-files-${commentId}">${pendingReplyFiles[key].map((f,i)=>`<span class="pending-file"><span class="pending-file-name">${escHtml(f.name)}</span><button class="btn-icon" style="font-size:10px;color:var(--danger)" onclick="BoardView.removePendingReplyFile('${key}',${i},${commentId})">&times;</button></span>`).join('')}</div>`;
      } else { pending.remove(); }
    }
  }

  async function submitComment(cardId) {
    const ta = document.getElementById('new-comment-ta');
    const content = ta?.value.trim();
    if (!content) { showToast(I18n.t('commentRequired'), 'error'); return; }
    try {
      const comment = await API.post(`/boards/${currentBoardId}/cards/${cardId}/comments`, { content });
      if (pendingCommentFiles.length) {
        await uploadCommentAttachments(comment.id, pendingCommentFiles, cardId);
        pendingCommentFiles = [];
      }
      await loadComments(cardId);
    } catch (err) { showToast(err.message, 'error'); }
  }

  async function submitReply(cardId, parentId) {
    const ta = document.getElementById(`reply-ta-${parentId}`);
    const content = ta?.value.trim();
    if (!content) { showToast(I18n.t('commentRequired'), 'error'); return; }
    const key = `reply-${parentId}`;
    try {
      const reply = await API.post(`/boards/${currentBoardId}/cards/${cardId}/comments`, { content, parentId });
      const files = pendingReplyFiles[key] || [];
      if (files.length) {
        await uploadCommentAttachments(reply.id, files, cardId);
        delete pendingReplyFiles[key];
      }
      await loadComments(cardId);
    } catch (err) { showToast(err.message, 'error'); }
  }

  function toggleReplyForm(commentId, cardId) {
    const wrap = document.getElementById(`reply-form-wrap-${commentId}`);
    if (!wrap) return;
    const hidden = wrap.style.display === 'none' || !wrap.style.display;
    wrap.style.display = hidden ? 'block' : 'none';
    if (hidden) document.getElementById(`reply-ta-${commentId}`)?.focus();
  }

  function startEditComment(commentId, cardId) {
    const found = _currentCommentsFlat.find(c => c.id == commentId);
    editCommentOriginals.set(commentId, found ? found.content : '');
    renderComments(_currentCommentsFlat, cardId);
  }

  function cancelEditComment(commentId, cardId) {
    editCommentOriginals.delete(commentId);
    renderComments(_currentCommentsFlat, cardId);
  }

  async function saveCommentEdit(commentId, cardId) {
    const ta = document.getElementById(`comment-edit-ta-${commentId}`);
    const content = ta?.value.trim();
    if (!content) { showToast(I18n.t('commentRequired'), 'error'); return; }
    try {
      await API.put(`/boards/${currentBoardId}/comments/${commentId}`, { content });
      editCommentOriginals.delete(commentId);
      await loadComments(cardId);
    } catch (err) { showToast(err.message, 'error'); }
  }

  async function deleteComment(commentId, cardId) {
    const ok = await Modal.confirm({
      title: I18n.t('confirmTitle'),
      message: I18n.t('confirmDeleteComment'),
      confirmLabel: I18n.t('delete'),
    });
    if (!ok) return;
    try {
      await API.delete(`/boards/${currentBoardId}/comments/${commentId}`);
      await loadComments(cardId);
    } catch (err) { showToast(err.message, 'error'); }
  }

  async function uploadCommentAttachments(commentId, files, cardId) {
    for (const file of files) {
      const fd = new FormData(); fd.append('file', file);
      try {
        await API.upload(`/boards/${currentBoardId}/comments/${commentId}/attachments`, fd);
      } catch (err) { showToast(err.message, 'error'); }
    }
  }

  async function addCommentAttachDirect(commentId, cardId, input) {
    if (!input?.files?.length) return;
    const files = Array.from(input.files);
    input.value = '';
    await uploadCommentAttachments(commentId, files, cardId);
    await loadComments(cardId);
  }

  async function deleteCommentAttachment(attachId, commentId, cardId) {
    try {
      await API.delete(`/boards/${currentBoardId}/comments/${commentId}/attachments/${attachId}`);
      await loadComments(cardId);
    } catch (err) { showToast(err.message, 'error'); }
  }

  return {
    get currentBoardId() { return currentBoardId; },
    renderBoardList, showCreateBoard, createBoard, editBoard, saveEditBoard, deleteBoard,
    openBoard, loadBoard, reloadAfterHistory,
    showBoardCtxMenu, showListCtxMenu, showBoardAreaCtxMenu, showColumnCtxMenu, showColumnColorPicker, applyColumnColor, showCardCtxMenu,
    editColumnProps, saveColumnProps,
    startEditColTitle, deleteColumn, promptAddColumn, addColumn,
    onColDragStart, onColDragEnd, onContainerDragOver, onContainerDrop,
    showAddCard, createCard, openCard, saveCard, deleteCard, showAssigneePicker, saveAssignee, selectCardColor,
    uploadAttachment, deleteAttachment, openAttachment,
    loadComments, submitComment, submitReply, toggleReplyForm,
    startEditComment, cancelEditComment, saveCommentEdit, deleteComment,
    addPendingCommentFiles, removePendingCommentFile,
    addPendingReplyFiles, removePendingReplyFile,
    addCommentAttachDirect, deleteCommentAttachment,
    onDragStart, onDragEnd,
    showMembers, addMember, changeMemberRole, removeMember,
    showSummary, exportSummaryReport, applyBurndownDateRange, refreshBurndownChartTheme,
    exportProject, exportCurrentBoard, importProjectFromDialog, openSampleProject, handleKprjFileOpen,
    savePending,
  };
})();
