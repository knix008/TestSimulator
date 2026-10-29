// What a desktop child window shows: menu, select (IconSelect list), themes
// (theme picker), settings (the whole settings window) and info (about /
// help / shortcuts). The payload comes from the main window; the result goes
// back as an event (lib/popups.js).
//
// index.html#/window/pool?slot=list|dialog — a hidden window kept for reuse:
// it renders whatever 'pool-open:<slot>' sends (synchronously, no API call)
// and hides itself on close. index.html#/window/<kind>?id=… — a one-off
// window (before the pool is ready).
import React, { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { t, useLanguage, setLanguage, getLanguage } from '../lib/i18n';
import { applyTheme, setCustomThemes } from '../themes';
import { loadSettings, storeSettings } from '../lib/backend';
import { merge, DEFAULTS } from '../lib/settings';
import { Icon, Dialog, menuIcon } from '../components/Chrome';
import { LangFlag } from '../components/Flags';
import { ThemePicker } from '../components/ThemePicker';
import { popupRoute, receivePayload, sendResult, closeSelf, broadcast, setPoolCloser, announceShown } from '../lib/popups';
import { SettingsDialog } from './Settings';
import { UiHost } from '../components/UiHost';
import { columnsOf } from '../lib/menuColumns';
import { AboutDialog } from './About';
import { PromptHost } from '../components/PromptHost';
import { GuidePage } from '../components/GuideWindow';

function useCloseOnBlur(enabled) {
  useEffect(() => {
    if (!enabled) return undefined;
    // Ignore the blur that can arrive while the window is being shown.
    const armed = { on: false };
    const t0 = setTimeout(() => { armed.on = true; }, 300);
    const blur = () => { if (armed.on) closeSelf(); };
    window.addEventListener('blur', blur);
    return () => { clearTimeout(t0); window.removeEventListener('blur', blur); };
  }, [enabled]);
}

function ListPopup({ id, items, value, kind }) {
  useLanguage();
  const list = items.filter((x) => !x.sep);
  const [active, setActive] = useState(Math.max(0, list.findIndex((x) => (kind === 'select' ? x.value === value : false))));
  const box = useRef(null);
  const pick = (item) => { if (!item.disabled) sendResult(id, kind === 'select' ? { value: item.value } : { id: item.id }); };
  // Long lists: two columns filled top to bottom (lib/menuColumns).
  const cols = columnsOf(items);
  useEffect(() => {
    const key = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeSelf(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(list.length - 1, i + 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
      else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && cols.length > 1) {
        e.preventDefault();
        setActive((i) => cols.jump(i, e.key === 'ArrowRight' ? 1 : -1));
      }
      else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
      else if (e.key === 'End') { e.preventDefault(); setActive(list.length - 1); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (list[active]) pick(list[active]); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });
  useEffect(() => {
    const el = box.current && box.current.querySelectorAll('[data-item]')[active];
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [active]);
  let n = -1;
  const row = (item, i) => {
    if (item.sep) return <div key={`s${i}`} className="menu-sep" />;
    n += 1;
    const idx = n;
    const on = kind === 'select' ? item.value === value : !!item.on;
    return (
      <button key={item.id || String(item.value)} type="button" data-item className={`menu-item ${idx === active ? 'active' : ''} ${on ? 'on' : ''}`} disabled={!!item.disabled}
        role={kind === 'select' ? 'option' : 'menuitem'} aria-selected={kind === 'select' ? on : undefined} onMouseEnter={() => setActive(idx)} onClick={() => pick(item)}>
        {item.flag ? <LangFlag lang={item.flag} width={22} height={15} /> : <Icon name={menuIcon(item)} size={14} />}
        <span className="menu-item-label">{item.label}</span>
        {item.keys && <span className="menu-keys">{item.keys}</span>}
        {on && <Icon name="check" size={13} />}
      </button>
    );
  };
  return (
    <div ref={box} className={`popup-root popup-${kind} ${cols.length > 1 ? 'menu-cols' : ''}`} role={kind === 'select' ? 'listbox' : 'menu'}>
      {cols.length > 1
        ? cols.map((col, c) => <div key={c} className="menu-col">{col.map((x) => row(x.item, x.index))}</div>)
        : items.map(row)}
    </div>
  );
}

function SettingsWindow({ id, payload }) {
  useLanguage();
  // The main window sends its settings with the request: no API call before the first paint.
  const [settings, setSettings] = useState(payload.settings || null);
  useEffect(() => { if (!payload.settings) loadSettings().then((x) => setSettings(merge(DEFAULTS, x || {}))); }, [payload.settings]);
  if (!settings) return <div className="boot">{t('loading')}</div>;
  const onSave = async (draft) => {
    const latest = merge(DEFAULTS, (await loadSettings()) || {});
    const next = { ...latest, ...draft };
    await storeSettings(next);
    await broadcast('msm-settings-saved', next);
  };
  return (
    <><SettingsDialog settings={settings} windowed initialTab={payload.tab || null} onSave={onSave}
      onPreview={(p) => broadcast('msm-settings-preview', p)} onClose={() => sendResult(id, { closed: true })} /><UiHost /><PromptHost /></>
  );
}

function applyLook(p) {
  if (!p) return;
  if (p.customThemes) setCustomThemes(p.customThemes);
  if (p.theme) applyTheme(p.theme);
  if (p.language && p.language !== getLanguage()) setLanguage(p.language);
}

/** The content for one request: { kind, id } + payload. */
function PopupContent({ kind, id, payload }) {
  const transient = kind === 'menu' || kind === 'select' || kind === 'themes';
  useCloseOnBlur(transient);
  useEffect(() => {
    const key = (e) => { if (e.key === 'Escape' && kind !== 'settings') closeSelf(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [kind]);
  // First paint → the main window records the time it took.
  useEffect(() => { requestAnimationFrame(() => announceShown(id)); }, [id]);
  if (kind === 'menu' || kind === 'select') return <ListPopup id={id} kind={kind} items={payload.items || []} value={payload.value} />;
  if (kind === 'themes') {
    return (
      <div className="popup-root popup-themes">
        <ThemePicker list value={payload.value} onPick={(v) => sendResult(id, { id: `theme:${v}` })}
          onNewCustom={() => sendResult(id, { id: 'settings:custom' })} onEditCustom={() => sendResult(id, { id: 'settings:custom' })} />
      </div>
    );
  }
  if (kind === 'settings') return <SettingsWindow id={id} payload={payload} />;
  if (kind === 'about') return <AboutDialog windowed onClose={() => closeSelf()} />;
  if (kind === 'info') {
    return (
      <Dialog windowed title={payload.title} icon={payload.icon || 'info'} onClose={() => closeSelf()}>
        {String(payload.body || '').split('\n').map((line, i) => <p key={i}>{line}</p>)}
        {payload.small && <p className="small">{payload.small}</p>}
      </Dialog>
    );
  }
  return <div className="popup-root">{kind}</div>;
}

/** A pool window: hidden until the main window sends a request. */
function PoolWindow({ slot }) {
  useLanguage();
  const [cur, setCur] = useState(null);
  const curRef = useRef(null);
  curRef.current = cur;
  useEffect(() => {
    document.documentElement.classList.add('popup-window');
    let alive = true;
    const unsub = [];
    (async () => {
      const { listen, emit } = await import('@tauri-apps/api/event');
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const me = getCurrentWindow();
      const hide = async () => {
        const c = curRef.current;
        if (!c) return;
        curRef.current = null;
        try { await me.hide(); } catch { /* gone */ }
        // Reset the content so the next request starts clean.
        setCur(null);
        await emit(`popup-closed:${c.id}`);
      };
      setPoolCloser(() => { hide(); });
      unsub.push(await listen(`pool-open:${slot}`, (e) => {
        const req = e.payload || {};
        const prev = curRef.current;
        applyLook(req.payload);
        flushSync(() => setCur(req));
        curRef.current = req;
        if (prev && prev.id !== req.id) emit(`popup-closed:${prev.id}`);
      }));
      unsub.push(await listen(`pool-hide:${slot}`, () => { hide(); }));
      unsub.push(await listen(`pool-ping:${slot}`, () => { emit(`pool-ready:${slot}`); }));
      if (alive) await emit(`pool-ready:${slot}`);
    })();
    return () => { alive = false; unsub.forEach((u) => u()); setPoolCloser(null); };
  }, [slot]);
  if (!cur) return <div className="popup-root" />;
  return <PopupContent key={cur.id} kind={cur.kind} id={cur.id} payload={cur.payload || {}} />;
}

export function PopupWindow() {
  const route = popupRoute();
  // The user manual (desktop child window or web browser window) runs on its own.
  if (route.kind === 'guide') return <GuidePage />;
  return <PopupWindowMain route={route} />;
}

function PopupWindowMain({ route }) {
  const [payload, setPayload] = useState(null);
  useLanguage();
  useEffect(() => {
    if (route.kind === 'pool') return;
    document.documentElement.classList.add('popup-window');
    receivePayload(route.id, (p) => {
      applyLook(p);
      setPayload(p || {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (route.kind === 'pool') return <PoolWindow slot={route.slot || 'list'} />;
  if (!payload) return <div className="popup-root" />;
  return <PopupContent kind={route.kind} id={route.id} payload={payload} />;
}
