// Menu bar (파일/편집/보기/압축 — every title and item with an icon, as in
// MyEditor) and the icon toolbar, drawn in-app so they look the same in the
// desktop app and in the browser. View holds the bottom dock (log /
// terminals); the toolbar has a terminal button. The right end of the
// toolbar holds the theme picker (16 themes), the language toggle and the
// About button. Toolbar buttons are icon-only; the tooltip (and aria-label)
// carries the description.
import React, { useState } from 'react';
import { t, useLanguage, getLanguage } from '../lib/i18n';
import { THEMES, themeById, nextThemeId } from '../themes';
import { Icon, Flag } from './Icons';
import { ContextMenu } from './ContextMenu';

export function MenuBar({ onAction, state }) {
  useLanguage();
  const [open, setOpen] = useState(null); // { id, el }

  const menus = {
    file: [
      { id: 'view', label: t('view_file'), icon: 'view', shortcut: 'F3', disabled: !state.oneFile },
      { id: 'edit', label: t('edit_file'), icon: 'edit', shortcut: 'F4', disabled: !state.oneFile },
      { id: 'properties', label: t('ctx_properties'), icon: 'properties', shortcut: 'Alt+Enter', disabled: state.selCount !== 1 },
      { sep: true },
      { id: 'newFolder', label: t('new_folder'), icon: 'folderNew', shortcut: 'F7' },
      { id: 'newFile', label: t('new_file'), icon: 'fileNew', shortcut: 'Shift+F4' },
      { sep: true },
      { id: 'quit', label: t('quit'), icon: 'quit', shortcut: 'Alt+F4' },
    ],
    edit: [
      { id: 'undo', label: t('undo'), icon: 'undo', shortcut: 'Ctrl+Z', disabled: !state.canUndo },
      { id: 'redo', label: t('redo'), icon: 'redo', shortcut: 'Ctrl+Y', disabled: !state.canRedo },
      { sep: true },
      { id: 'copyOther', label: t('copy_to_other'), icon: 'copy', disabled: !state.hasSelection },
      { id: 'moveOther', label: t('move_to_other'), icon: 'move', disabled: !state.hasSelection },
      { sep: true },
      { id: 'rename', label: t('rename'), icon: 'rename', disabled: state.selCount !== 1 },
      { id: 'multiRename', label: t('multi_rename'), icon: 'multiRename', shortcut: 'Ctrl+M', disabled: !state.hasSelection },
      { id: 'delete', label: t('delete'), icon: 'delete', disabled: !state.hasSelection },
    ],
    select: [
      { id: 'selectPattern', label: t('sel_pattern'), icon: 'select', shortcut: 'Num +' },
      { id: 'unselectPattern', label: t('unsel_pattern'), icon: 'select', shortcut: 'Num -' },
      { sep: true },
      { id: 'selectAll', label: t('sel_all'), icon: 'select', shortcut: 'Ctrl+A' },
      { id: 'unselectAll', label: t('unsel_all'), icon: 'select', shortcut: 'Ctrl+Num -' },
      { id: 'invertSelection', label: t('sel_invert'), icon: 'select', shortcut: 'Num *' },
      { id: 'selectSameExt', label: t('sel_same_ext'), icon: 'select', shortcut: 'Alt+Num +', disabled: !state.oneFile },
      { sep: true },
      { id: 'compareDirs', label: t('compare_dirs'), icon: 'compare', shortcut: 'Shift+F2' },
    ],
    view: [
      { id: 'refresh', label: t('refresh'), icon: 'refresh', shortcut: 'Ctrl+R' },
      { id: 'search', label: t('search'), icon: 'search' },
      { sep: true },
      { id: 'swapPanels', label: t('swap_panels'), icon: 'swap', shortcut: 'Ctrl+U' },
      { id: 'targetLeft', label: t('target_left'), icon: 'folder', shortcut: 'Ctrl+←' },
      { id: 'targetRight', label: t('target_right'), icon: 'folder', shortcut: 'Ctrl+→' },
      { id: 'dirHistory', label: t('dir_history'), icon: 'history', shortcut: 'Alt+↓' },
      { id: 'hotlist', label: t('hotlist'), icon: 'star', shortcut: 'Ctrl+D' },
      { sep: true },
      { id: 'toggleHidden', label: t('show_hidden'), icon: 'eye', checked: state.showHidden, shortcut: 'Ctrl+H' },
      { id: 'toggleToolbar', label: t('set_show_toolbar'), icon: 'panelBottom', checked: state.showToolbar },
      { id: 'toggleFnBar', label: t('fn_bar'), icon: 'panelBottom', checked: state.fnBar },
      { id: 'nextTheme', label: t('next_theme'), icon: 'palette' },
      { sep: true },
      { id: 'toggleDock', label: t('toggle_dock'), icon: 'panelBottom', checked: state.dockVisible, shortcut: 'Ctrl+`' },
      { id: 'showLog', label: t('log'), icon: 'log' },
      { id: 'newTerminal', label: t('term_new'), icon: 'terminal', shortcut: 'Ctrl+Shift+`' },
    ],
    archive: [
      { id: 'compress', label: t('compress'), icon: 'archive', shortcut: 'Alt+F5', disabled: !state.hasSelection },
      { id: 'extract', label: t('extract'), icon: 'extract', shortcut: 'Alt+F9', disabled: !state.canExtract },
    ],
  };

  // Each menu title carries an icon, as in MyEditor's menu bar.
  const titles = [['file', 'menu_file', 'folder'], ['edit', 'menu_edit', 'edit'], ['select', 'menu_select', 'select'], ['view', 'menu_view', 'eye'], ['archive', 'menu_archive', 'archive']];

  return (
    <div className="menubar">
      {titles.map(([id, label, icon]) => (
        <button key={id} className={`menu-title ${open && open.id === id ? 'open' : ''}`}
          onMouseDown={(e) => { e.preventDefault(); setOpen(open && open.id === id ? null : { id, el: e.currentTarget }); }}
          onMouseEnter={(e) => { if (open && open.id !== id) setOpen({ id, el: e.currentTarget }); }}>
          <Icon name={icon} size={14} className="menu-icon" />{t(label)}
        </button>
      ))}
      {open && (
        <ContextMenu anchorEl={open.el} x={0} y={0} items={menus[open.id]} onClose={() => setOpen(null)}
          onPick={(id) => { setOpen(null); onAction(id); }} />
      )}
    </div>
  );
}

export function Toolbar({ onAction, theme, dockVisible, state = {} }) {
  useLanguage();
  const [themeMenu, setThemeMenu] = useState(null);
  const lang = getLanguage();
  const one = state.selCount === 1, some = state.selCount > 0;
  // [action, icon, label key, tooltip key, disabled?, toggled?] — null is a separator.
  const items = [
    ['view', 'view', 'view_file', 'tip_view', !state.oneFile],
    ['edit', 'edit', 'edit_file', 'tip_edit', !state.oneFile],
    null,
    ['newFolder', 'folderNew', 'tb_new_folder', 'tip_new_folder'],
    ['newFile', 'fileNew', 'tb_new_file', 'tip_new_file'],
    null,
    ['copyOther', 'copy', 'tb_copy', 'tip_copy', !some],
    ['moveOther', 'move', 'tb_move', 'tip_move', !some],
    ['rename', 'rename', 'ctx_rename', 'tip_rename', !one],
    ['multiRename', 'multiRename', 'multi_rename', 'tip_multi_rename', !some],
    ['delete', 'delete', 'tb_delete', 'tip_delete', !some],
    state.canTrash ? ['trash', 'trash', 'ctx_trash', 'tip_trash', !some] : undefined,
    null,
    ['clipCopy', 'clipboard', 'ctx_copy', 'tip_clip_copy', !some],
    ['clipPaste', 'paste', 'ctx_paste', 'tip_clip_paste'],
    null,
    ['compress', 'archive', 'compress', 'tip_compress', !some],
    ['extract', 'extract', 'extract', 'tip_extract', !state.canExtract],
    null,
    ['search', 'search', 'tb_search', 'tip_search'],
    ['compareDirs', 'compare', 'compare_dirs', 'tip_compare'],
    ['swapPanels', 'swap', 'swap_panels', 'tip_swap'],
    ['refresh', 'refresh', 'refresh', 'tip_refresh'],
    ['toggleHidden', 'eye', 'show_hidden', 'tip_hidden', false, !!state.showHidden],
    ['properties', 'properties', 'ctx_properties', 'tip_properties', !one],
    null,
    ['terminal', 'terminal', 'terminal', 'tip_dock', false, !!dockVisible],
  ].filter((it) => it !== undefined);
  const themeLabel = (id) => { const th = themeById(id); return lang === 'ko' ? th.label : th.labelEn; };
  const themeItems = THEMES.map((th) => ({
    id: `theme:${th.id}`,
    label: lang === 'ko' ? th.label : th.labelEn,
    checked: th.id === theme,
    swatch: th.tokens['--accent'],
    swatchBg: th.tokens['--bg'],
  }));
  // Undo / redo: icon-only buttons whose tooltip names the operation they would reverse / replay.
  const undoTip = state.canUndo ? `${t('tip_undo')}\n${state.undoWhat}` : t('tip_undo_none');
  const redoTip = state.canRedo ? `${t('tip_redo')}\n${state.redoWhat}` : t('tip_redo_none');
  return (
    <div className="toolbar">
      <button className="tb-btn tb-icon-only" title={undoTip} aria-label={t('undo')} disabled={!state.canUndo} onClick={() => onAction('undo')}><Icon name="undo" /></button>
      <button className="tb-btn tb-icon-only" title={redoTip} aria-label={t('redo')} disabled={!state.canRedo} onClick={() => onAction('redo')}><Icon name="redo" /></button>
      <span className="tb-sep" />
      {items.map((it, i) => it
        ? <button key={it[0]} className={`tb-btn tb-icon-only ${it[5] ? 'on' : ''}`} disabled={!!it[4]} onClick={() => onAction(it[0])} title={t(it[3])} aria-label={t(it[2])}><Icon name={it[1]} /></button>
        : <span key={`s${i}`} className="tb-sep" />)}
      <span className="tb-spacer" />
      {/* Split button: the main part cycles to the next theme (the tooltip names the current and the next one), the caret opens the list of all 16. */}
      <span className="tb-split">
        <button className="tb-btn tb-icon-only tb-split-main" title={`${t('theme')}: ${themeLabel(theme)}\n${t('tip_next_theme', { theme: themeLabel(nextThemeId(theme)) })}`} aria-label={t('next_theme')} onClick={() => onAction('nextTheme')}>
          <Icon name="palette" />
        </button>
        <button className="tb-btn tb-split-caret" title={t('tip_theme')} aria-label={t('tip_theme')} onClick={(e) => setThemeMenu(themeMenu ? null : e.currentTarget)}>
          <Icon name="chevronDown" size={14} />
        </button>
      </span>
      <button className="tb-btn tb-icon-only" title={lang === 'ko' ? 'Switch to English' : '한국어로 전환'} aria-label={t('tip_language')} onClick={() => onAction('toggleLanguage')}>
        <Flag country={lang === 'ko' ? 'gb' : 'kr'} width={22} />
      </button>
      <button className="tb-btn tb-icon-only" title={t('tip_settings')} aria-label={t('settings')} onClick={() => onAction('settings')}>
        <Icon name="settings" />
      </button>
      <span className="tb-sep" />
      <button className="tb-btn tb-icon-only" title={t('tip_about')} aria-label={t('menu_info')} onClick={() => onAction('about')}>
        <Icon name="info" />
      </button>
      {themeMenu && (
        <ContextMenu anchorEl={themeMenu} x={0} y={0} items={themeItems} onClose={() => setThemeMenu(null)}
          onPick={(id) => { setThemeMenu(null); onAction(id); }} />
      )}
    </div>
  );
}

// Total Commander's function-key bar at the bottom of the window.
export function FnBar({ onAction, state }) {
  useLanguage();
  const keys = [
    ['F3', 'view', 'fn_view', !state.oneFile],
    ['F4', 'edit', 'fn_edit', !state.oneFile],
    ['F5', 'copyOther', 'fn_copy', !state.hasSelection],
    ['F6', 'moveOther', 'fn_move', !state.hasSelection],
    ['F7', 'newFolder', 'fn_mkdir', false],
    ['F8', 'delete', 'fn_delete', !state.hasSelection],
    ['Alt+F4', 'quit', 'fn_quit', false],
  ];
  return (
    <div className="fnbar">
      {keys.map(([key, id, label, disabled]) => (
        <button key={key} className="fn-btn" disabled={disabled} onClick={() => onAction(id)} title={`${key}: ${t(label)}`}>
          <span className="fn-key">{key}</span><span className="fn-label">{t(label)}</span>
        </button>
      ))}
    </div>
  );
}
