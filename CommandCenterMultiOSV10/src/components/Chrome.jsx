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
      { id: 'newFolder', label: t('new_folder'), icon: 'folderNew', shortcut: 'F7' },
      { id: 'newFile', label: t('new_file'), icon: 'fileNew' },
      { sep: true },
      { id: 'quit', label: t('quit'), icon: 'quit' },
    ],
    edit: [
      { id: 'undo', label: t('undo'), icon: 'undo', shortcut: 'Ctrl+Z', disabled: !state.canUndo },
      { id: 'redo', label: t('redo'), icon: 'redo', shortcut: 'Ctrl+Y', disabled: !state.canRedo },
      { sep: true },
      { id: 'copyOther', label: t('copy_to_other'), icon: 'copy' },
      { id: 'moveOther', label: t('move_to_other'), icon: 'move' },
      { sep: true },
      { id: 'rename', label: t('rename'), icon: 'rename' },
      { id: 'delete', label: t('delete'), icon: 'delete' },
    ],
    view: [
      { id: 'refresh', label: t('refresh'), icon: 'refresh' },
      { id: 'search', label: t('search'), icon: 'search' },
      { sep: true },
      { id: 'toggleHidden', label: t('show_hidden'), icon: 'eye', checked: state.showHidden },
      { id: 'nextTheme', label: t('next_theme'), icon: 'palette' },
      { sep: true },
      { id: 'toggleDock', label: t('toggle_dock'), icon: 'panelBottom', checked: state.dockVisible, shortcut: 'Ctrl+`' },
      { id: 'showLog', label: t('log'), icon: 'log' },
      { id: 'newTerminal', label: t('term_new'), icon: 'terminal', shortcut: 'Ctrl+Shift+`' },
    ],
    archive: [
      { id: 'compress', label: t('compress'), icon: 'archive', disabled: !state.hasSelection },
      { id: 'extract', label: t('extract'), icon: 'extract', disabled: !state.canExtract },
    ],
  };

  // Each menu title carries an icon, as in MyEditor's menu bar.
  const titles = [['file', 'menu_file', 'folder'], ['edit', 'menu_edit', 'edit'], ['view', 'menu_view', 'eye'], ['archive', 'menu_archive', 'archive']];

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

export function Toolbar({ onAction, theme, dockVisible, history = {} }) {
  useLanguage();
  const [themeMenu, setThemeMenu] = useState(null);
  const lang = getLanguage();
  const items = [
    ['newFolder', 'folderNew', 'tb_new_folder', 'tip_new_folder'],
    ['newFile', 'fileNew', 'tb_new_file', 'tip_new_file'],
    null,
    ['copyOther', 'copy', 'tb_copy', 'tip_copy'],
    ['moveOther', 'move', 'tb_move', 'tip_move'],
    ['delete', 'delete', 'tb_delete', 'tip_delete'],
    null,
    ['search', 'search', 'tb_search', 'tip_search'],
    null,
    ['terminal', 'terminal', 'terminal', 'tip_dock'],
  ];
  const themeLabel = (id) => { const th = themeById(id); return lang === 'ko' ? th.label : th.labelEn; };
  const themeItems = THEMES.map((th) => ({
    id: `theme:${th.id}`,
    label: lang === 'ko' ? th.label : th.labelEn,
    checked: th.id === theme,
    swatch: th.tokens['--accent'],
    swatchBg: th.tokens['--bg'],
  }));
  // Undo / redo: icon-only buttons whose tooltip names the operation they would reverse / replay.
  const undoTip = history.canUndo ? `${t('tip_undo')}\n${history.undoWhat}` : t('tip_undo_none');
  const redoTip = history.canRedo ? `${t('tip_redo')}\n${history.redoWhat}` : t('tip_redo_none');
  return (
    <div className="toolbar">
      <button className="tb-btn tb-icon-only" title={undoTip} aria-label={t('undo')} disabled={!history.canUndo} onClick={() => onAction('undo')}><Icon name="undo" /></button>
      <button className="tb-btn tb-icon-only" title={redoTip} aria-label={t('redo')} disabled={!history.canRedo} onClick={() => onAction('redo')}><Icon name="redo" /></button>
      <span className="tb-sep" />
      {items.map((it, i) => it
        ? <button key={it[0]} className={`tb-btn tb-icon-only ${it[0] === 'terminal' && dockVisible ? 'on' : ''}`} onClick={() => onAction(it[0])} title={t(it[3])} aria-label={t(it[2])}><Icon name={it[1]} /></button>
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
