/* ── Left tool panel, right property panel, selection ─────────────────── */
const Panels = (() => {
  const KEYS = { left: 'kanban-show-left', right: 'kanban-show-right' };
  let selection = null;

  function shown(side) {
    const saved = localStorage.getItem(KEYS[side]);
    return saved !== '0';
  }

  function apply(side) {
    const on = shown(side);
    document.body.classList.toggle(side === 'left' ? 'panel-left-off' : 'panel-right-off', !on);
    const btn = document.getElementById(side === 'left' ? 'btn-panel-left' : 'btn-panel-right');
    if (btn) {
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  function toggle(side) {
    localStorage.setItem(KEYS[side], shown(side) ? '0' : '1');
    apply(side);
  }

  function init() {
    apply('left');
    apply('right');
    renderTools();
    renderProps();
  }

  function toolBtn(label, icon, onclick, enabled = true) {
    return `<button type="button" class="tool-btn" ${enabled ? '' : 'disabled'} onclick="${onclick}"><span class="tool-btn-icon">${icon}</span><span>${escHtml(label)}</span></button>`;
  }

  function renderTools() {
    const body = document.getElementById('left-panel-body');
    if (!body) return;
    const onBoard = typeof BoardView !== 'undefined' && !!BoardView.currentBoardId;
    const perm = (typeof BoardView !== 'undefined' && BoardView.permissions) || {};
    body.innerHTML = `
      <div class="tool-group">
        <div class="tool-group-title">${I18n.t('toolEdit')}</div>
        ${toolBtn(I18n.t('save'), '💾', 'App.save()')}
        <button type="button" class="tool-btn" id="tool-undo" onclick="if(!this.classList.contains('disabled'))History.undo()"><span class="tool-btn-icon">↶</span><span>${escHtml(I18n.t('undo'))}</span></button>
        <button type="button" class="tool-btn" id="tool-redo" onclick="if(!this.classList.contains('disabled'))History.redo()"><span class="tool-btn-icon">↷</span><span>${escHtml(I18n.t('redo'))}</span></button>
      </div>
      <div class="tool-group">
        <div class="tool-group-title">${I18n.t('toolProject')}</div>
        ${toolBtn(I18n.t('newBoard').replace(/^\+\s*/, ''), '✚', 'BoardView.showCreateBoard()')}
        ${toolBtn(I18n.t('importProject'), '📥', 'BoardView.importProjectFromDialog()')}
        ${toolBtn(I18n.t('exportProject'), '📤', 'BoardView.exportCurrentBoard()', onBoard)}
        ${toolBtn(I18n.t('boardList'), '☷', 'App.showBoards()')}
      </div>
      <div class="tool-group">
        <div class="tool-group-title">${I18n.t('toolBoard')}</div>
        ${toolBtn(I18n.t('summary'), '▤', 'BoardView.showSummary()', onBoard)}
        ${toolBtn(I18n.t('addColumn').replace(/^\+\s*/, ''), '＋', 'BoardView.promptAddColumn()', onBoard && perm.canEdit !== false)}
      </div>`;
    if (typeof History !== 'undefined') History.updateMenuState();
  }

  function row(label, value) {
    const text = value == null || value === '' ? I18n.t('none') : String(value);
    return `<div class="prop-row"><dt>${escHtml(label)}</dt><dd>${escHtml(text)}</dd></div>`;
  }

  function colorRow(label, hex) {
    const swatch = hex ? `<span class="prop-swatch" style="background:${escAttr(hex)}"></span>${escHtml(hex)}` : escHtml(I18n.t('none'));
    return `<div class="prop-row"><dt>${escHtml(label)}</dt><dd>${swatch}</dd></div>`;
  }

  function actions(buttons) {
    return `<div class="prop-actions">${buttons.join('')}</div>`;
  }

  function renderProps() {
    const body = document.getElementById('right-panel-body');
    if (!body) return;
    if (!selection) {
      body.innerHTML = `<div class="prop-empty">${escHtml(I18n.t('noSelection'))}</div>`;
      return;
    }
    const d = selection.data || {};
    if (selection.type === 'board') {
      body.innerHTML = `
        <div class="prop-kind">${escHtml(I18n.t('kindProject'))}</div>
        <div class="prop-list">
          ${row(I18n.t('boardName').replace(/\s*\*$/, ''), d.title)}
          ${row(I18n.t('boardDesc'), d.description)}
          ${colorRow(I18n.t('boardColor'), d.bg_color)}
        </div>
        ${actions([
          `<button type="button" class="btn btn-primary btn-sm" onclick="Panels.openSelected()">${escHtml(I18n.t('open'))}</button>`,
          `<button type="button" class="btn btn-secondary btn-sm" onclick="Panels.editSelected()">${escHtml(I18n.t('edit'))}</button>`,
        ])}`;
      return;
    }
    if (selection.type === 'column') {
      const kind = d.type === 'done' ? I18n.t('colTypeDone') : I18n.t('colTypeNormal');
      body.innerHTML = `
        <div class="prop-kind">${escHtml(I18n.t('kindColumn'))}</div>
        <div class="prop-list">
          ${row(I18n.t('columnName').replace(/\s*\*$/, ''), d.title)}
          ${row(I18n.t('columnType'), kind)}
          ${row(I18n.t('cardCount'), Array.isArray(d.cards) ? d.cards.length : '')}
          ${colorRow(I18n.t('columnColor'), d.bg_color)}
        </div>
        ${actions([`<button type="button" class="btn btn-secondary btn-sm" onclick="Panels.editSelected()">${escHtml(I18n.t('columnProps'))}</button>`])}`;
      return;
    }
    if (selection.type === 'card') {
      const due = d.due_date ? formatDate(String(d.due_date).substring(0, 10)) : '';
      body.innerHTML = `
        <div class="prop-kind">${escHtml(I18n.t('kindCard'))}</div>
        <div class="prop-list">
          ${row(I18n.t('cardTitle').replace(/\s*\*$/, ''), d.title)}
          ${row(I18n.t('cardDesc'), d.description)}
          ${row(I18n.t('columnName').replace(/\s*\*$/, ''), d.columnTitle)}
          ${row(I18n.t('assignee'), d.assignee_name)}
          ${row(I18n.t('dueDate'), due)}
          ${colorRow(I18n.t('cardBgColor'), d.bg_color)}
          ${colorRow(I18n.t('cardStripeColor'), d.stripe_color || d.color)}
        </div>
        ${actions([`<button type="button" class="btn btn-primary btn-sm" onclick="Panels.editSelected()">${escHtml(I18n.t('cardEdit'))}</button>`])}`;
    }
  }

  function highlight() {
    document.querySelectorAll('.is-selected').forEach(el => el.classList.remove('is-selected'));
    if (!selection) return;
    document.querySelector(`[data-select-type="${selection.type}"][data-select-id="${selection.id}"]`)?.classList.add('is-selected');
  }

  function select(type, id, data) {
    selection = { type, id, data };
    highlight();
    renderProps();
  }

  function clear() {
    selection = null;
    highlight();
    renderProps();
  }

  function reapply() {
    if (selection && typeof BoardView !== 'undefined') {
      if (selection.type === 'card') {
        const card = BoardView.findInBoard(selection.id);
        if (!card) selection = null;
        else selection.data = { ...selection.data, ...card };
      } else if (selection.type === 'column') {
        const col = BoardView.findColumn(selection.id);
        if (!col) selection = null;
        else selection.data = col;
      } else if (selection.type === 'board') {
        const board = BoardView.findListedBoard(selection.id);
        if (board) selection.data = board;
      }
    }
    renderTools();
    highlight();
    renderProps();
  }

  function openSelected() {
    if (!selection || typeof BoardView === 'undefined') return;
    if (selection.type === 'board') BoardView.openBoard(selection.id);
    else if (selection.type === 'card') BoardView.openCard(selection.id);
  }

  function editSelected() {
    if (!selection || typeof BoardView === 'undefined') return;
    const d = selection.data || {};
    if (selection.type === 'board') BoardView.editBoard(d.id, d.title || '', d.description || '', d.bg_color || '');
    else if (selection.type === 'column') BoardView.editColumnProps(selection.id);
    else if (selection.type === 'card') BoardView.openCard(selection.id);
  }

  return { init, toggle, select, clear, reapply, openSelected, editSelected, renderTools };
})();
