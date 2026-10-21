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
  palette: <><path d="M12 3a9 9 0 0 0 0 18h1.2a2 2 0 0 0 1.4-3.4 2 2 0 0 1 1.4-3.4H18a3 3 0 0 0 3-3A8.2 8.2 0 0 0 12 3z" /><circle cx="7.5" cy="10.5" r="1" fill="currentColor" /><circle cx="10.5" cy="7.5" r="1" fill="currentColor" /><circle cx="15" cy="7.5" r="1" fill="currentColor" /></>,
  download: <path d="M12 4v10M8 10l4 4 4-4M5 20h14" />,
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
};

export function Icon({ name, size = 16 }) {
  return <svg {...base} width={size} height={size}>{PATHS[name] || PATHS.file}</svg>;
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

export function MenuBar({ menus, onAction, theme }) {
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
  ];
  return (
    <div className="toolbar menubar" onDoubleClick={() => { if (isDesktop) windowControl('maximize'); }}>
      <span className="tb-brand" data-tauri-drag-region>
        <img src="./icon.svg" alt="" width={16} height={16} className="tb-logo" draggable={false} />
        <span className="tb-title">{t('appName')}</span>
      </span>
      <button type="button" className="menu-btn start-nav" onClick={() => onAction('showStart')}>
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
                {item.label}
              </button>
            )
          ))}
        </div>
      )}
      {open && open.id === 'themes' && (
        <div className="menu-pop theme-pop" style={{ right: 48, left: 'auto' }}>
          {themeItems.map((th) => (
            <button key={th.id} type="button" className="menu-item" onClick={() => { setOpen(null); onAction(th.id); }}>
              {lang === 'ko' ? th.label : th.labelEn}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Toolbar({ onAction, busy, branch, branches, onBranch }) {
  useLanguage();
  return (
    <div className="icon-toolbar">
      <button className="tool-btn" title={t('open_folder')} onClick={() => onAction('openFolder')}><Icon name="folder" /></button>
      <button className="tool-btn" title={t('run_analysis')} disabled={busy} onClick={() => onAction('analyze')}><Icon name="play" /></button>
      <span className="tb-sep" />
      <button className="tool-btn" title={t('nav_overview')} onClick={() => onAction('view:overview')}><Icon name="chart" /></button>
      <button className="tool-btn" title={t('nav_issues')} onClick={() => onAction('view:issues')}><Icon name="bug" /></button>
      <button className="tool-btn" title={t('nav_hotspots')} onClick={() => onAction('view:hotspots')}><Icon name="shield" /></button>
      <button className="tool-btn" title={t('nav_code')} onClick={() => onAction('view:code')}><Icon name="code" /></button>
      <button className="tool-btn" title={t('nav_gates')} onClick={() => onAction('view:gates')}><Icon name="gate" /></button>
      <span className="tb-sep" />
      <label className="tb-label">{t('branch')}</label>
      <input className="tb-select" value={branch} onChange={(e) => onBranch(e.target.value)} list="branch-list" />
      <datalist id="branch-list">
        {(branches.length ? branches : ['main']).map((b) => <option key={b} value={b} />)}
      </datalist>
      <span className="tb-spacer" />
      {busy && <span className="tb-label">{t('analyzing')}</span>}
    </div>
  );
}

export function StatusBar({ project, analysis, message }) {
  useLanguage();
  const m = analysis && analysis.measures;
  const gate = analysis && analysis.qualityGate;
  return (
    <div className="statusbar">
      <span className="ellipsis">{project ? project.name : t('no_project')}</span>
      {project && <span className="muted ellipsis">{project.path}</span>}
      <span className="spacer" />
      {message && <span>{message}</span>}
      {m && <span>{t('files')} {m.files}</span>}
      {m && <span>{t('ncloc')} {m.ncloc}</span>}
      {gate && <span className={gate.status === 'OK' ? 'ok' : 'bad'}>{t('gate')} {gate.status === 'OK' ? t('passed') : t('failed')}</span>}
    </div>
  );
}

export function Dialog({ title, children, onClose, wide }) {
  useLanguage();
  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div className={`dialog ${wide ? 'wide' : ''}`} onMouseDown={(e) => e.stopPropagation()} role="dialog">
        <div className="dialog-title">
          <strong>{title}</strong>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('win_close')}><Icon name="close" size={14} /></button>
        </div>
        <div className="dialog-body selectable">{children}</div>
      </div>
    </div>
  );
}

export function SideNav({ view, onView, disabled }) {
  useLanguage();
  const groups = [
    ['project', [
      ['overview', 'nav_overview', 'chart'],
      ['issues', 'nav_issues', 'bug'],
      ['hotspots', 'nav_hotspots', 'shield'],
      ['measures', 'nav_measures', 'list'],
      ['code', 'nav_code', 'code'],
      ['duplications', 'nav_dup', 'copy'],
      ['activity', 'nav_activity', 'clock'],
    ]],
    ['quality', [
      ['rules', 'nav_rules', 'search'],
      ['profiles', 'nav_profiles', 'layers'],
      ['gates', 'nav_gates', 'gate'],
      ['portfolios', 'nav_portfolios', 'folder'],
      ['tasks', 'nav_tasks', 'clock'],
    ]],
    ['coverity', [
      ['defects', 'nav_defects', 'alert'],
      ['streams', 'nav_streams', 'layers'],
      ['components', 'nav_components', 'folder'],
      ['policies', 'nav_policies', 'gate'],
      ['models', 'nav_models', 'code'],
    ]],
  ];
  return (
    <nav className="sidenav">
      {groups.map(([id, items]) => (
        <div key={id} className="nav-group">
          <div className="nav-label">{id === 'project' ? t('projects') : id === 'coverity' ? t('menu_coverity') : t('menu_quality')}</div>
          {items.map(([key, label, icon]) => (
            <button key={key} type="button" className={`nav-item ${view === key ? 'on' : ''}`} disabled={disabled && id === 'project' && key !== 'rules'}
              onClick={() => onView(key)}>
              <Icon name={icon} size={15} />{t(label)}
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}
