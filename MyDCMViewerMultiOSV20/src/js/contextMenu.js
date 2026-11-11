/* Right-click everywhere: the app's own menus (viewer, folder tree, tabs) handle their places; for the
 * rest this file shows an edit menu with icons (cut / copy / paste / select all) on text fields and
 * selected text, and keeps the browser engine's own menu (back, reload, inspect…) from appearing.
 * Loaded by index.html and popup.html after icons.js and i18n.js.
 */
window.ContextMenu = (function () {
  'use strict';
  const t = (k, fb) => { const v = window.I18n ? window.I18n.t(k) : k; return v === k ? fb : v; };
  let menu = null, target = null, selection = '';

  function build() {
    menu = document.createElement('div');
    menu.className = 'ctx-menu';
    menu.id = 'ctxEdit';
    document.body.append(menu);
    menu.addEventListener('mousedown', (e) => e.preventDefault());   // keep the field's focus and selection
    menu.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-edit]');
      if (!b || b.disabled) return;
      run(b.dataset.edit);
      hide();
    });
    document.addEventListener('mousedown', (e) => { if (menu.classList.contains('open') && !menu.contains(e.target)) hide(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); }, true);
    window.addEventListener('blur', hide);
  }
  const editable = (el) => el && (el.isContentEditable || (el.tagName === 'TEXTAREA') || (el.tagName === 'INPUT' && /^(text|search|number|email|url|tel|password|)$/i.test(el.type)));

  function item(id, icon, label, key, enabled) {
    const svg = window.Icons ? window.Icons.svg(icon) : '';
    return `<button type="button" data-edit="${id}" data-icon="${icon}"${enabled ? '' : ' disabled'}><span class="mi">${svg}</span><span>${label}</span>${key ? `<kbd>${key}</kbd>` : ''}</button>`;
  }
  function show(x, y, el) {
    if (!menu) build();
    target = el;
    selection = String(window.getSelection ? window.getSelection() : '');
    const field = editable(el);
    const hasSel = field ? el.selectionStart !== el.selectionEnd || (el.isContentEditable && !!selection) : !!selection;
    const ro = field && (el.readOnly || el.disabled);
    menu.innerHTML = [
      field ? item('cut', 'cut', t('edit.cut', 'Cut'), 'Ctrl+X', hasSel && !ro) : '',
      item('copy', 'copy', t('edit.copy', 'Copy'), 'Ctrl+C', hasSel),
      field ? item('paste', 'paste', t('edit.paste', 'Paste'), 'Ctrl+V', !ro) : '',
      '<div class="menu-sep"></div>',
      item('selectAll', 'select-all', t('edit.selectAll', 'Select all'), 'Ctrl+A', true),
    ].join('');
    menu.classList.add('open');
    const r = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(0, Math.min(x, innerWidth - r.width - 4))}px`;
    menu.style.top = `${Math.max(0, Math.min(y, innerHeight - r.height - 4))}px`;
  }
  function hide() { if (menu) menu.classList.remove('open'); }

  async function run(cmd) {
    const el = target;
    const field = editable(el);
    if (field) el.focus();
    if (cmd === 'selectAll') {
      if (field && el.select) el.select();
      else { const s = window.getSelection(); s.removeAllRanges(); const r = document.createRange(); r.selectNodeContents(el && el.closest('.modal-box, .popup-box, .doc-view, .panel, body') || document.body); s.addRange(r); }
      return;
    }
    const text = field && !el.isContentEditable ? el.value.slice(el.selectionStart, el.selectionEnd) : selection;
    if (cmd === 'copy' || cmd === 'cut') {
      try { await navigator.clipboard.writeText(text); } catch { document.execCommand('copy'); }
      if (cmd === 'cut' && field) { if (!document.execCommand('delete')) el.setRangeText('', el.selectionStart, el.selectionEnd, 'start'); el.dispatchEvent(new Event('input', { bubbles: true })); }
      return;
    }
    if (cmd === 'paste' && field) {
      let clip = '';
      try { clip = await navigator.clipboard.readText(); } catch { /* not allowed */ }
      if (!document.execCommand('insertText', false, clip)) { el.setRangeText(clip, el.selectionStart, el.selectionEnd, 'end'); el.dispatchEvent(new Event('input', { bubbles: true })); }
    }
  }

  // Bubble phase: menus that handle their place call preventDefault first and are left alone.
  document.addEventListener('contextmenu', (e) => {
    if (e.defaultPrevented) return;
    e.preventDefault();
    const el = e.target;
    const sel = String(window.getSelection ? window.getSelection() : '');
    if (editable(el) || sel) show(e.clientX, e.clientY, el);
  });

  return { show, hide };
})();
