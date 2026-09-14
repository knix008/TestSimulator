// Menu bar (파일/편집/보기/압축) and the icon toolbar, drawn in-app so they look
// the same in the desktop app and in the browser. The right end of the
// toolbar holds the theme picker (16 themes), the language toggle and the
// About button.
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
      { id: 'toggleHidden', label: t('show_hidden'), checked: state.showHidden },
      { id: 'nextTheme', label: t('next_theme'), icon: 'palette' },
    ],
    archive: [
      { id: 'compress', label: t('compress'), icon: 'archive', disabled: !state.hasSelection },
      { id: 'extract', label: t('extract'), icon: 'extract', disabled: !state.canExtract },
    ],
  };

  const titles = [['file', 'menu_file'], ['edit', 'menu_edit'], ['view', 'menu_view'], ['archive', 'menu_archive']];

  return (
    <div className="menubar">
      {titles.map(([id, label]) => (
        <button key={id} className={`menu-title ${open && open.id === id ? 'open' : ''}`}
          onMouseDown={(e) => { e.preventDefault(); setOpen(open && open.id === id ? null : { id, el: e.currentTarget }); }}
          onMouseEnter={(e) => { if (open && open.id !== id) setOpen({ id, el: e.currentTarget }); }}>
          {t(label)}
        </button>
      ))}
      {open && (
        <ContextMenu anchorEl={open.el} x={0} y={0} items={menus[open.id]} onClose={() => setOpen(null)}
          onPick={(id) => { setOpen(null); onAction(id); }} />
      )}
    </div>
  );
}

export function Toolbar({ onAction, theme }) {
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
  ];
  const themeLabel = (id) => { const th = themeById(id); return lang === 'ko' ? th.label : th.labelEn; };
  const themeItems = THEMES.map((th) => ({
    id: `theme:${th.id}`,
    label: lang === 'ko' ? th.label : th.labelEn,
    checked: th.id === theme,
    swatch: th.tokens['--accent'],
    swatchBg: th.tokens['--bg'],
  }));
  return (
    <div className="toolbar">
      {items.map((it, i) => it
        ? <button key={it[0]} className="tb-btn" onClick={() => onAction(it[0])} title={t(it[3])}><Icon name={it[1]} /><span>{t(it[2])}</span></button>
        : <span key={`s${i}`} className="tb-sep" />)}
      <span className="tb-spacer" />
      {/* Split button: the main part cycles to the next theme, the caret opens the list of all 16. */}
      <span className="tb-split">
        <button className="tb-btn tb-split-main" title={t('tip_next_theme', { theme: themeLabel(nextThemeId(theme)) })} onClick={() => onAction('nextTheme')}>
          <Icon name="palette" /><span>{themeLabel(theme)}</span>
        </button>
        <button className="tb-btn tb-split-caret" title={t('tip_theme')} aria-label={t('tip_theme')} onClick={(e) => setThemeMenu(themeMenu ? null : e.currentTarget)}>
          <Icon name="chevronDown" size={14} />
        </button>
      </span>
      <button className="tb-btn tb-icon-only" title={lang === 'ko' ? 'Switch to English' : '한국어로 전환'} aria-label={t('tip_language')} onClick={() => onAction('toggleLanguage')}>
        <Flag country={lang === 'ko' ? 'gb' : 'kr'} width={22} />
      </button>
      <button className="tb-btn" title={t('tip_settings')} onClick={() => onAction('settings')}>
        <Icon name="settings" /><span>{t('settings')}</span>
      </button>
      <span className="tb-sep" />
      <button className="tb-btn" title={t('tip_about')} onClick={() => onAction('about')}>
        <Icon name="info" /><span>{t('menu_info')}</span>
      </button>
      {themeMenu && (
        <ContextMenu anchorEl={themeMenu} x={0} y={0} items={themeItems} onClose={() => setThemeMenu(null)}
          onPick={(id) => { setThemeMenu(null); onAction(id); }} />
      )}
    </div>
  );
}
