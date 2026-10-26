import React, { useEffect, useState } from 'react';
import { t, useLanguage, getLanguage } from '../lib/i18n';
import { allThemes, nextThemeId, themeById } from '../themes';
import { isDesktop, windowControl } from '../lib/backend';

const base = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };

const PATHS = {
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  file: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></>,
  play: <path d="M8 5v14l11-7z" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v4h1" /></>,
  home: <><path d="M3 11l9-8 9 8" /><path d="M5 10v10h5v-6h4v6h5V10" /></>,
  shield: <path d="M12 3l8 3v6c0 5-3.4 7.8-8 9-4.6-1.2-8-4-8-9V6z" />,
  bug: <><path d="M8 9h8v4a4 4 0 0 1-8 0z" /><path d="M9 9V7a3 3 0 0 1 6 0v2M4 11h4M16 11h4M5 16l3-1M19 16l-3-1M12 17v4" /></>,
  chart: <path d="M4 19V5M4 19h16M8 16v-5M12 16V8M16 16v-3" />,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M4 16V4h12" /></>,
  check: <path d="M5 12l5 5L20 7" />,
  alert: <><path d="M12 3l10 18H2z" /><path d="M12 10v4M12 17h.01" /></>,
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  code: <path d="M9 8l-4 4 4 4M15 8l4 4-4 4" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  gate: <><path d="M4 20V5h16v15" /><path d="M9 20v-6h6v6" /></>,
  layers: <path d="M12 3l9 5-9 5-9-5zM3 12l9 5 9-5M3 17l9 5 9-5" />,
  chevronDown: <path d="M6 9l6 6 6-6" />,
  chevronLeft: <path d="M15 6l-6 6 6 6" />,
  chevronRight: <path d="M9 6l6 6-6 6" />,
  palette: <><path d="M12 3a9 9 0 0 0 0 18h1.2a2 2 0 0 0 1.4-3.4 2 2 0 0 1 1.4-3.4H18a3 3 0 0 0 3-3A8.2 8.2 0 0 0 12 3z" /><circle cx="7.5" cy="10.5" r="1" fill="currentColor" /><circle cx="10.5" cy="7.5" r="1" fill="currentColor" /><circle cx="15" cy="7.5" r="1" fill="currentColor" /></>,
  download: <path d="M12 4v10M8 10l4 4 4-4M5 20h14" />,
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  upload: <path d="M12 16V5M8 9l4-4 4 4M5 20h14" />,
  save: <><path d="M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" /><path d="M7 3v5h8V3M7 21v-7h10v7" /></>,
  print: <><path d="M6 9V3h12v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M6 14h12v7H6z" /></>,
  package: <><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M4 7.5l8 4.5 8-4.5M12 12v9" /></>,
  flow: <><circle cx="5" cy="6" r="2" /><circle cx="19" cy="18" r="2" /><path d="M7 6h6a3 3 0 0 1 0 6h-2a3 3 0 0 0 0 6h6" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>,
  branch: <><circle cx="6" cy="5" r="2" /><circle cx="6" cy="19" r="2" /><circle cx="18" cy="8" r="2" /><path d="M6 7v10M18 10a6 6 0 0 1-6 6H6" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6" /></>,
  webhook: <><circle cx="12" cy="6" r="2.5" /><circle cx="5.5" cy="17" r="2.5" /><circle cx="18.5" cy="17" r="2.5" /><path d="M10.8 8.2L7 14.8M8 17h8M13.2 8.2L17 14.8" /></>,
  key: <><circle cx="8" cy="14" r="4" /><path d="M11 11l9-9M16 6l3 3M14 8l2 2" /></>,
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4" />,
  refresh: <><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 13a8 8 0 0 0 14.3 4.9L20 16" /><path d="M4 3v5h5M20 21v-5h-5" /></>,
  report: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 17v-3M12 17v-5M15 17v-2" /></>,
  tree: <path d="M5 4v16M5 8h6M5 14h6M11 6h8v4h-8zM11 12h8v4h-8z" />,
  filter: <path d="M4 5h16l-6 8v6l-4-2v-4z" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  link: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
  terminal: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 9l3 3-3 3M12 15h5" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  group: <><circle cx="8" cy="9" r="3" /><circle cx="16" cy="9" r="3" /><path d="M2 20a6 6 0 0 1 12 0M10 20a6 6 0 0 1 12 0" /></>,
  minus: <path d="M5 12h14" />,
  cpu: <><rect x="6" y="6" width="12" height="12" rx="2" /><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  scale: <path d="M12 3v18M5 21h14M5 7h14M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z" />,
  star: <path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z" />,
  wrench: <path d="M14.7 6.3a4 4 0 0 0 5 5L21 13l-8 8-3-3 8-8M14.7 6.3L13 4.6a4 4 0 0 0-5.6 5.6l1.7 1.7M3 21l6-6" />,
  installBox: <><path d="M4 9l8-5 8 5v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" /><path d="M12 9v7M9 13l3 3 3-3" /></>,
  lightbulb: <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z" /></>,
  inbox: <><path d="M3 13l3-8h12l3 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" /><path d="M3 13h5l1 3h6l1-3h5" /></>,
  thumbsUp: <><path d="M7 11v9H4v-9z" /><path d="M7 11l4-8a2 2 0 0 1 2 2v4h6a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.8 20H7" /></>,
  userCheck: <><circle cx="9" cy="8" r="4" /><path d="M2 21a7 7 0 0 1 14 0M16 11l2 2 4-4" /></>,
  unlock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 7.7-1.5" /></>,
  smell: <path d="M3 8h10a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7" />,
  ban: <><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></>,
  chevronsUp: <path d="M7 13l5-5 5 5M7 18l5-5 5 5" />,
  chevronUp: <path d="M6 15l6-6 6 6" />,
  checkCircle: <><circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" /></>,
  xCircle: <><circle cx="12" cy="12" r="9" /><path d="M9 9l6 6M15 9l-6 6" /></>,
  circleDot: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="2.5" fill="currentColor" /></>,
  shieldCheck: <><path d="M12 3l8 3v6c0 5-3.4 7.8-8 9-4.6-1.2-8-4-8-9V6z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></>,
  archive: <><rect x="3" y="4" width="18" height="5" rx="1" /><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4" /></>,
  spinner: <path d="M12 3a9 9 0 1 0 9 9" />,
  external: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
  sparkle: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />,
  gauge: <><path d="M4 18a8 8 0 1 1 16 0" /><path d="M12 18l4-6" /></>,
  grid: <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />,
  hourglass: <path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9" />,
  hash: <path d="M5 9h15M4 15h15M10 3L8 21M16 3l-2 18" />,
};

// Issue type / severity / status → icon, shared by every view.
export const TYPE_ICON = { BUG: 'bug', VULNERABILITY: 'unlock', CODE_SMELL: 'smell', SECURITY_HOTSPOT: 'shield' };
export const SEV_ICON = { BLOCKER: 'ban', CRITICAL: 'chevronsUp', MAJOR: 'chevronUp', MINOR: 'chevronDown', INFO: 'info' };
export const STATUS_ICON = {
  OPEN: 'circleDot', CONFIRMED: 'userCheck', REOPENED: 'refresh', RESOLVED: 'checkCircle', CLOSED: 'archive',
  ACCEPTED: 'thumbsUp', 'FALSE-POSITIVE': 'xCircle', WONTFIX: 'thumbsUp', FIXED: 'wrench', REMOVED: 'archive',
  TO_REVIEW: 'eye', ACKNOWLEDGED: 'userCheck', SAFE: 'shieldCheck',
};

export function Icon({ name, size = 16, className }) {
  return <svg {...base} width={size} height={size} className={className} aria-hidden="true">{PATHS[name] || PATHS.file}</svg>;
}

function Flag({ country }) {
  if (country === 'gb') {
    return (
      <svg className="flag" width="22" height="14" viewBox="0 0 60 36">
        <rect width="60" height="36" fill="#012169" />
        <path d="M0 0l60 36M60 0L0 36" stroke="#fff" strokeWidth="8" />
        <path d="M0 0l60 36M60 0L0 36" stroke="#C8102E" strokeWidth="4" />
        <path d="M30 0v36M0 18h60" stroke="#fff" strokeWidth="12" />
        <path d="M30 0v36M0 18h60" stroke="#C8102E" strokeWidth="6" />
      </svg>
    );
  }
  return (
    <svg className="flag" width="22" height="14" viewBox="0 0 60 40">
      <rect width="60" height="40" fill="#fff" />
      <circle cx="30" cy="20" r="10" fill="#cd2e3a" />
      <path d="M30 8l2 6h6l-5 4 2 6-5-4-5 4 2-6-5-4h6z" fill="#0047a0" />
    </svg>
  );
}

function WindowButtons() {
  return (
    <span className="win-buttons">
      <button className="win-btn" title={t('win_minimize')} onClick={() => windowControl('minimize')}>
        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 5.5h10" stroke="currentColor" strokeWidth="1" /></svg>
      </button>
      <button className="win-btn" title={t('win_maximize')} onClick={() => windowControl('maximize')}>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1"><rect x=".5" y=".5" width="9" height="9" /></svg>
      </button>
      <button className="win-btn win-close" title={t('win_close')} onClick={() => windowControl('close')}>
        <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.1"><path d="M.5.5l9 9M9.5.5l-9 9" /></svg>
      </button>
    </span>
  );
}

export function MenuBar({ menus, onAction, theme, startActive }) {
  useLanguage();
  const [open, setOpen] = useState(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [open]);
  const lang = getLanguage();
  const openMenu = (id, el, e) => {
    if (e) e.stopPropagation();
    if (open && open.id === id) { setOpen(null); return; }
    const left = el ? el.getBoundingClientRect().left : 8;
    setOpen({ id, left });
  };
  const themeLabel = (id) => {
    const th = themeById(id);
    return lang === 'ko' ? th.label : th.labelEn;
  };
  const builtIn = allThemes().filter((th) => !th.custom);
  const themeItems = [
    ...builtIn.filter((th) => th.mode === 'dark').map((th) => ({ id: `theme:${th.id}`, label: th.label, labelEn: th.labelEn })),
    ...builtIn.filter((th) => th.mode === 'light').map((th) => ({ id: `theme:${th.id}`, label: th.label, labelEn: th.labelEn })),
    ...allThemes().filter((th) => th.custom).map((th) => ({ id: `theme:${th.id}`, label: th.label, labelEn: th.labelEn || th.label })),
  ];
  return (
    <div className="toolbar menubar" onDoubleClick={() => { if (isDesktop) windowControl('maximize'); }}>
      <span className="tb-brand" data-tauri-drag-region>
        <img src="./icon.svg" alt="" width={16} height={16} className="tb-logo" draggable={false} />
        <span className="tb-title">{t('appName')}</span>
      </span>
      <button type="button" className={`menu-btn start-nav ${startActive ? 'active' : ''}`} aria-pressed={!!startActive}
        onClick={() => onAction('showStart')}>
        <Icon name="home" size={14} />{t('start_nav')}
      </button>
      <span className="menus">
        {menus.map((m) => (
          <button key={m.id} type="button" className={`menu-btn ${open && open.id === m.id ? 'open' : ''}`}
            onClick={(e) => openMenu(m.id, e.currentTarget, e)}
            onMouseEnter={(e) => { if (open) openMenu(m.id, e.currentTarget); }}>
            <Icon name={m.icon} size={14} />{t(m.labelKey)}
          </button>
        ))}
      </span>
      <span className="tb-spacer" data-tauri-drag-region onClick={() => setOpen(null)} />
      <span className="app-controls">
        <span className="tb-split">
          <button className="tb-btn tb-split-main" title={t('tip_next_theme', { theme: themeLabel(nextThemeId(theme)) })} onClick={() => onAction('nextTheme')}>
            <Icon name="palette" size={14} />{themeLabel(theme)}
          </button>
          <button className="tb-btn tb-split-caret" title={t('tip_theme')} onClick={(e) => openMenu('themes', e.currentTarget, e)}>
            <Icon name="chevronDown" size={14} />
          </button>
        </span>
        <button className="tb-btn tb-icon-only" title={lang === 'ko' ? 'Switch to English' : '한국어로 전환'} onClick={() => onAction('toggleLanguage')}>
          <Flag country={lang === 'ko' ? 'gb' : 'kr'} />
        </button>
        <button className="tb-btn tb-icon-only" title={t('tip_settings')} onClick={() => onAction('settings')}><Icon name="settings" size={15} /></button>
        <button className="tb-btn tb-icon-only" title={t('tip_about')} onClick={() => onAction('about')}><Icon name="info" size={15} /></button>
      </span>
      {isDesktop && <WindowButtons />}
      {open && open.id !== 'themes' && (
        <div className="menu-pop" style={{ left: open.left }}>
          {menus.find((m) => m.id === open.id).items().map((item, index) => (
            item.sep ? <div key={`sep-${index}`} className="menu-sep" /> : (
              <button key={item.id} type="button" className="menu-item" onClick={() => { setOpen(null); onAction(item.id); }}>
                <Icon name={item.icon || 'chevronRight'} size={14} className={item.icon ? '' : 'menu-noicon'} />
                <span className="menu-item-label">{item.label}</span>
                {item.keys && <span className="menu-keys">{item.keys}</span>}
              </button>
            )
          ))}
        </div>
      )}
      {open && open.id === 'themes' && (
        <div className="menu-pop theme-pop" style={{ right: 48, left: 'auto' }}>
          {themeItems.map((th) => (
            <button key={th.id} type="button" className={`menu-item ${th.id === `theme:${theme}` ? 'on' : ''}`} onClick={() => { setOpen(null); onAction(th.id); }}>
              <Icon name={th.id === `theme:${theme}` ? 'check' : 'palette'} size={14} />
              <span className="menu-item-label">{lang === 'ko' ? th.label : th.labelEn}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Icon + label toolbar. Labels hide when the window is narrow; icons stay.
export function Toolbar({ onAction, busy, branch, branches, onBranch, view }) {
  useLanguage();
  const tool = (id, icon, label, opts = {}) => (
    <button type="button" className={`tool-btn ${opts.primary ? 'tool-primary' : ''} ${view && id === `view:${view}` ? 'on' : ''}`} title={opts.tip || label}
      aria-label={label} disabled={opts.disabled} onClick={() => onAction(id)}>
      <Icon name={icon} size={15} /><span className="tool-label">{label}</span>
    </button>
  );
  return (
    <div className="icon-toolbar" role="toolbar">
      {tool('openFolder', 'folder', t('tb_open'), { tip: `${t('open_folder')} (Ctrl+O)` })}
      {tool('analyze', 'play', t('tb_analyze'), { primary: true, disabled: busy, tip: `${t('run_analysis')} (Ctrl+Enter)` })}
      <span className="tb-sep" />
      {tool('view:overview', 'chart', t('nav_overview'))}
      {tool('view:issues', 'bug', t('nav_issues'))}
      {tool('view:hotspots', 'shield', t('tb_hotspots'), { tip: t('nav_hotspots') })}
      {tool('view:code', 'code', t('nav_code'))}
      {tool('view:gates', 'gate', t('tb_gates'), { tip: t('nav_gates') })}
      <span className="tb-sep" />
      <label className="tb-label tb-branch" title={t('branch')}><Icon name="branch" size={14} /><span className="tool-label">{t('branch')}</span></label>
      <input className="tb-select" aria-label={t('branch')} title={t('tip_branch')} value={branch} onChange={(e) => onBranch(e.target.value)} list="branch-list" />
      <datalist id="branch-list">
        {(branches.length ? branches : ['main']).map((b) => <option key={b} value={b} />)}
      </datalist>
      <span className="tb-spacer" />
      {busy && <span className="tb-busy"><Icon name="spinner" size={14} className="spin" /><span className="tool-label">{t('analyzing')}</span></span>}
    </div>
  );
}

export function StatusBar({ project, analysis, message }) {
  useLanguage();
  const m = analysis && analysis.measures;
  const gate = analysis && analysis.qualityGate;
  return (
    <div className="statusbar">
      <span className="sb-item ellipsis"><Icon name="folder" size={13} />{project ? project.name : t('no_project')}</span>
      {project && <span className="muted ellipsis sb-path" title={project.path}>{project.path}</span>}
      <span className="spacer" />
      {message && <span className="sb-item ellipsis"><Icon name="info" size={13} />{message}</span>}
      {m && <span className="sb-item" title={t('files')}><Icon name="file" size={13} />{m.files}</span>}
      {m && <span className="sb-item" title={t('ncloc')}><Icon name="code" size={13} />{m.ncloc}</span>}
      {gate && <span className={`sb-item ${gate.status === 'OK' ? 'ok' : 'bad'}`}><Icon name={gate.status === 'OK' ? 'checkCircle' : 'xCircle'} size={13} />{t('gate')} {gate.status === 'OK' ? t('passed') : t('failed')}</span>}
      <span className="sb-grip" aria-hidden="true" onMouseDown={(e) => { if (isDesktop && e.button === 0) { e.preventDefault(); windowControl('resize'); } }}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><circle cx="10" cy="10" r="1.1" /><circle cx="6" cy="10" r="1.1" /><circle cx="10" cy="6" r="1.1" /><circle cx="2" cy="10" r="1.1" /><circle cx="6" cy="6" r="1.1" /><circle cx="10" cy="2" r="1.1" /></svg>
      </span>
    </div>
  );
}

export function Dialog({ title, children, onClose, wide, icon }) {
  useLanguage();
  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div className={`dialog ${wide ? 'wide' : ''}`} onMouseDown={(e) => e.stopPropagation()} role="dialog">
        <div className="dialog-title">
          <strong>{icon && <Icon name={icon} size={16} />}{title}</strong>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('win_close')}><Icon name="close" size={14} /></button>
        </div>
        <div className="dialog-body selectable">{children}</div>
      </div>
    </div>
  );
}

// Side navigation in five sections. counts: { [view]: number | { n, tone, tip } }.
export const NAV_GROUPS = [
  ['project', 'nav_sec_project', 'folder', [
    ['overview', 'nav_overview', 'chart'],
    ['measures', 'nav_measures', 'gauge'],
    ['code', 'nav_code', 'code'],
    ['duplications', 'nav_dup', 'copy'],
    ['activity', 'nav_activity', 'clock'],
    ['snapshots', 'nav_snapshots', 'history'],
    ['reports', 'nav_reports', 'report'],
  ]],
  ['issues', 'nav_sec_issues', 'bug', [
    ['issues', 'nav_issues', 'bug'],
    ['hotspots', 'nav_hotspots', 'shield'],
    ['pullrequest', 'nav_pullrequest', 'branch'],
  ]],
  ['coverity', 'menu_coverity', 'alert', [
    ['defects', 'nav_defects', 'alert'],
    ['streams', 'nav_streams', 'layers'],
    ['components', 'nav_components', 'grid'],
    ['policies', 'nav_policies', 'gate'],
    ['models', 'nav_models', 'flow'],
  ]],
  ['security', 'nav_sec_security', 'lock', [
    ['compliance', 'nav_compliance', 'lock'],
    ['misra', 'nav_misra', 'shieldCheck'],
    ['dependencies', 'nav_dependencies', 'package'],
    ['dast', 'nav_dast', 'globe'],
  ]],
  ['admin', 'nav_sec_admin', 'settings', [
    ['rules', 'nav_rules', 'search'],
    ['profiles', 'nav_profiles', 'layers'],
    ['gates', 'nav_gates', 'gate'],
    ['portfolios', 'nav_portfolios', 'folder'],
    ['tasks', 'nav_tasks', 'hourglass'],
    ['admin', 'nav_admin', 'users'],
  ]],
];

function readCollapsed() {
  try { return JSON.parse(localStorage.getItem('mcc-nav-collapsed') || '[]'); } catch { return []; }
}

export function SideNav({ view, onView, disabled, counts = {} }) {
  useLanguage();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggle = (id) => {
    const next = collapsed.includes(id) ? collapsed.filter((x) => x !== id) : [...collapsed, id];
    setCollapsed(next);
    try { localStorage.setItem('mcc-nav-collapsed', JSON.stringify(next)); } catch { /* storage blocked */ }
  };
  return (
    <nav className="sidenav" aria-label={t('nav_aria')}>
      {NAV_GROUPS.map(([id, labelKey, groupIcon, items]) => {
        const shut = collapsed.includes(id) && !items.some(([key]) => key === view);
        return (
          <div key={id} className={`nav-group ${shut ? 'shut' : ''}`}>
            <button type="button" className="nav-label" aria-expanded={!shut} title={shut ? t('nav_expand') : t('nav_collapse')} onClick={() => toggle(id)}>
              <Icon name={groupIcon} size={13} /><span>{t(labelKey)}</span><Icon name="chevronDown" size={12} className="nav-caret" />
            </button>
            {!shut && items.map(([key, label, icon]) => {
              const c = counts[key];
              const badges = (Array.isArray(c) ? c : [c]).filter((b) => b != null && (typeof b === 'number' ? b > 0 : b.n > 0)).map((b) => (typeof b === 'number' ? { n: b } : b));
              return (
                <button key={key} type="button" data-view={key} className={`nav-item ${view === key ? 'on' : ''}`} disabled={disabled && id === 'project' && key !== 'rules'}
                  title={t(label)} aria-current={view === key ? 'page' : undefined} onClick={() => onView(key)}>
                  <Icon name={icon} size={15} /><span className="nav-text">{t(label)}</span>
                  {badges.map((b, i) => <span key={i} className={`nav-count ${b.tone || ''}`} title={b.tip}>{b.n > 999 ? '999+' : b.n}</span>)}
                </button>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
