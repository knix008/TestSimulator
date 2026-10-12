import React from 'react';
import { Icon } from './Icons.jsx';
import { THEMES, customThemesOf, themeLabel } from '../themes.js';

// Menu bodies shared by the popup window (desktop) and the in-page dropdown
// (web). Everything they receive is plain JSON so it can cross to another
// window; a choice is reported as `onChoose(id, keepOpen)`.

// ── Payload builders (main window side) ───────────────────
function swatchOf(th, language) {
  return {
    id: th.id,
    label: themeLabel(th, language),
    bg: th.tokens['--bg'],
    panel: th.tokens['--bg-panel'],
    border: th.tokens['--border-strong'],
    accent: th.tokens['--accent'],
    text: th.tokens['--text'],
  };
}

export function themeMenuPayload(settings, language, t) {
  return {
    variant: 'theme',
    current: settings.theme,
    dark: THEMES.filter((th) => th.mode === 'dark').map((th) => swatchOf(th, language)),
    light: THEMES.filter((th) => th.mode === 'light').map((th) => swatchOf(th, language)),
    custom: customThemesOf(settings).map((th) => swatchOf(th, language)),
    labels: {
      dark: t('settings.themeDark'),
      light: t('settings.themeLight'),
      custom: t('settings.themeCustom'),
      manage: t('toolbar.themeManage'),
    },
  };
}

export function recentMenuPayload(recent, t) {
  return {
    variant: 'recent',
    items: recent.map((r) => ({ path: r.path, name: r.name, kind: r.kind })),
    labels: { empty: t('recent.empty'), clear: t('menu.clearRecent'), remove: t('menu.removeRecent') },
  };
}

/** Context-menu items → JSON items with index ids (callbacks stay behind). */
export function itemsMenuPayload(items) {
  return {
    variant: 'items',
    items: items.filter(Boolean).map((it, i) => (it === 'sep' ? 'sep' : {
      id: i, label: it.label, icon: it.icon, shortcut: it.shortcut, sub: it.sub, disabled: !!it.disabled, danger: !!it.danger, checked: !!it.checked,
    })),
  };
}

// ── Bodies ────────────────────────────────────────────────
export function ThemeSwatch({ th, size = 18 }) {
  return (
    <span className="menu-swatch" style={{ width: size, height: size, background: th.bg, borderColor: th.border }} aria-hidden="true">
      <i style={{ background: th.panel }} />
      <b style={{ background: th.accent }} />
    </span>
  );
}

function ThemeItem({ th, current, onChoose }) {
  return (
    <div className={`theme-item${th.id === current ? ' current' : ''}`} onClick={() => onChoose('theme:' + th.id)} role="menuitemradio" aria-checked={th.id === current}>
      <ThemeSwatch th={th} />
      <span className="theme-item-label">{th.label}</span>
      {th.id === current ? <Icon name="check" className="theme-item-check" /> : null}
    </div>
  );
}

function ThemeMenu({ data, onChoose }) {
  const { labels = {}, current } = data;
  return (
    <div className="popup-menu theme-menu" role="menu">
      <div className="theme-cols">
        <div className="theme-col">
          <div className="theme-col-head"><Icon name="moon" />{labels.dark}</div>
          {(data.dark || []).map((th) => <ThemeItem key={th.id} th={th} current={current} onChoose={onChoose} />)}
        </div>
        <div className="theme-col">
          <div className="theme-col-head"><Icon name="sun" />{labels.light}</div>
          {(data.light || []).map((th) => <ThemeItem key={th.id} th={th} current={current} onChoose={onChoose} />)}
        </div>
      </div>
      {data.custom && data.custom.length ? (
        <div className="theme-custom">
          <div className="theme-col-head"><Icon name="palette" />{labels.custom}</div>
          <div className="theme-custom-grid">
            {data.custom.map((th) => <ThemeItem key={th.id} th={th} current={current} onChoose={onChoose} />)}
          </div>
        </div>
      ) : null}
      <div className="dd-footer">
        <button className="btn small" onClick={() => onChoose('manage')}><Icon name="settings" />{labels.manage}</button>
      </div>
    </div>
  );
}

function RecentMenu({ data, onChoose }) {
  const items = data.items || [];
  const labels = data.labels || {};
  return (
    <div className="popup-menu recent-menu" role="menu">
      {items.length ? items.map((r) => (
        <div key={r.path} className="dd-item" onClick={() => onChoose('open:' + r.path)} title={r.path}>
          <Icon name={r.kind === 'video' ? 'video' : r.kind === 'image' ? 'image' : 'file'} size={15} />
          <div className="name"><div>{r.name}</div><div className="path">{r.path}</div></div>
          <button className="x" title={labels.remove} onClick={(e) => { e.stopPropagation(); onChoose('remove:' + r.path, true); }}><Icon name="close" /></button>
        </div>
      )) : <div className="dd-empty">{labels.empty}</div>}
      <div className="dd-footer">
        <button className="btn small" disabled={!items.length} onClick={() => onChoose('clear')}><Icon name="trash" />{labels.clear}</button>
      </div>
    </div>
  );
}

function ItemsMenu({ data, onChoose }) {
  return (
    <div className="popup-menu items-menu" role="menu" onContextMenu={(e) => e.preventDefault()}>
      {(data.items || []).map((it, i) => {
        if (it === 'sep') return <div key={i} className="ctx-sep" />;
        return (
          <div
            key={i}
            className={`ctx-item${it.disabled ? ' disabled' : ''}${it.danger ? ' danger' : ''}${it.checked ? ' checked' : ''}`}
            role={it.checked ? 'menuitemcheckbox' : 'menuitem'}
            aria-checked={it.checked || undefined}
            onClick={() => { if (!it.disabled) onChoose(it.id); }}
          >
            {it.checked ? <Icon name="check" /> : it.icon ? <Icon name={it.icon} /> : <span style={{ width: 15 }} />}
            <span>{it.label}</span>
            {it.sub ? <span className="sub">{it.sub}</span> : null}
            {it.shortcut ? <span className="shortcut">{it.shortcut}</span> : null}
          </div>
        );
      })}
    </div>
  );
}

export function MenuContent({ payload, onChoose }) {
  if (!payload) return null;
  if (payload.variant === 'theme') return <ThemeMenu data={payload} onChoose={onChoose} />;
  if (payload.variant === 'recent') return <RecentMenu data={payload} onChoose={onChoose} />;
  return <ItemsMenu data={payload} onChoose={onChoose} />;
}
