// The window chrome: the title bar (drag area, name and version, help, theme, language,
// window buttons), the tool bar, the status bar (with the resize grip) and the size previews.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { t } from '../i18n.js';
import { isDesktop, listen, windowControl, windowDrag, currentWindow } from '../lib/platform.js';
import { THEMES, CUSTOM_ID } from '../lib/themes.js';
import { serializeSvg } from '../lib/iconCanvas.js';
import { Btn, Icon, IconSelect } from './controls.jsx';
import appIcon from '../../assets/icon.svg';

export const APP_NAME = 'MyICOMaker';
// eslint-disable-next-line no-undef
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '1.0.1';

export function themeOptions(lang) {
  return [...THEMES.map((th) => ({ value: th.id, label: th.name[lang], icon: th.dark ? 'moon' : 'sun' })), { value: CUSTOM_ID, label: lang === 'ko' ? '사용자 정의' : 'Custom', icon: 'palette' }];
}
export const languageOptions = () => [
  { value: 'ko', label: '한국어', icon: 'langKo' },
  { value: 'en', label: 'English', icon: 'langEn' },
];

function WindowButtons() {
  const [max, setMax] = useState(false);
  useEffect(() => {
    if (!isDesktop()) return undefined;
    let off = () => {};
    (async () => {
      const win = await currentWindow();
      setMax(await win.isMaximized());
      off = await win.onResized(async () => setMax(await win.isMaximized()));
    })();
    return () => off();
  }, []);
  if (!isDesktop()) return null;
  return (
    <div className="win-buttons">
      <button type="button" className="win-btn" title={t('win.minimize')} aria-label={t('win.minimize')} onClick={() => windowControl('minimize')}><Icon name="minimize" size={16} /></button>
      <button type="button" className="win-btn" title={t(max ? 'win.restore' : 'win.maximize')} aria-label={t(max ? 'win.restore' : 'win.maximize')} onClick={() => windowControl('maximize')}><Icon name={max ? 'restore' : 'maximize'} size={16} /></button>
      <button type="button" className="win-btn close" title={t('win.close')} aria-label={t('win.close')} onClick={() => windowControl('close')}><Icon name="close" size={16} /></button>
    </div>
  );
}

/** Starts a window drag from empty parts of a bar (double click: maximize / restore). */
export const dragProps = {
  onPointerDown: (e) => { if (e.button === 0 && !e.target.closest('button, input, select, label, a, [role="listbox"]')) windowDrag(); },
  onDoubleClick: (e) => { if (!e.target.closest('button, input, select, label, a')) windowControl('maximize'); },
};

export function TitleBar({ fileName, dirty, lang, theme, onTheme, onLanguage, onGuide, onAbout, onHome, onStart, onSettings, onThemeSettings }) {
  return (
    <header className="titlebar" {...dragProps} data-testid="titlebar">
      <img src={appIcon} alt="" className="app-logo" draggable={false} />
      <span className="app-name">{APP_NAME}</span>
      <span className="app-version">v{APP_VERSION}</span>
      {fileName !== undefined && <span className="doc-name" title={fileName}>{dirty ? '● ' : ''}{fileName || t('doc.untitled')}</span>}
      <span className="grow" />
      {onStart && <Btn icon="home" label={t('action.start')} title={t('tip.start')} onClick={onStart} />}
      {onHome && <Btn icon="design" label={t('action.editor')} title={t('tip.editor')} onClick={onHome} />}
      <Btn icon="guide" label={t('action.guide')} title={t('tip.guide')} onClick={onGuide} data-testid="guide-button" />
      {onSettings && <Btn icon="settings" label={t('action.settings')} onClick={onSettings} data-testid="settings-button" />}
      <IconSelect label={t('action.theme')} value={theme} options={themeOptions(lang)} onChange={onTheme} className="fixed-select" testId="theme-select" />
      {onThemeSettings && <Btn icon="palette" label={t('theme.customize')} title={t('theme.customizeTip')} onClick={onThemeSettings} data-testid="theme-settings-button" />}
      <IconSelect label={t('action.language')} value={lang} options={languageOptions()} onChange={onLanguage} className="fixed-select" testId="language-select" />
      <Btn icon="about" label={t('action.about')} onClick={onAbout} />
      <WindowButtons />
    </header>
  );
}

/**
 * A bar whose labels hide (icons stay) when it is too narrow: first those of priority 3 (view),
 * then 2 (edit), then all. Returns the level (0 = every label shown).
 */
export function useCompactLevel(ref, deps) {
  const [level, setLevel] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const fit = () => {
      let next = 0;
      for (; next < 3; next += 1) {
        el.dataset.compact = String(next);
        if (el.scrollWidth <= el.clientWidth + 1) break;
      }
      el.dataset.compact = String(next);
      setLevel(next);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return level;
}

export function Toolbar({ canUndo, canRedo, hasSelection, hasObjects, view, setView, onCommand, exporting }) {
  const ref = useRef(null);
  const level = useCompactLevel(ref, [canUndo, canRedo, hasSelection, t('action.save')]);
  const sep = (k) => <span key={k} className="tb-sep" aria-hidden="true" />;
  // Priority of the label: 1 file and export (hidden last), 2 edit, 3 view (hidden first).
  const PRIO = { start: 2, new: 1, open: 1, save: 1, saveAs: 2, importImage: 1, exportIco: 1, print: 1, guide: 2, undo: 2, redo: 2, copy: 2, paste: 2, duplicate: 2, delete: 2 };
  const B = (icon, label, command, opts = {}) => <Btn key={command} icon={icon} label={label} title={opts.title ?? label} onClick={() => onCommand(command)} {...opts} data-command={command} data-prio={PRIO[command] ?? 3} />;
  const T = (icon, label, key) => <Btn key={key} icon={icon} label={label} active={!!view[key]} onClick={() => setView({ [key]: !view[key] })} data-view={key} data-prio={3} />;
  return (
    <div ref={ref} className="toolbar" data-compact={level} role="toolbar" aria-label={t('panel.toolbar')} {...dragProps}>
      {B('home', t('action.start'), 'start', { title: t('tip.start') })}
      {sep(1)}
      {B('newFile', t('action.new'), 'new', { title: `${t('action.new')} (Ctrl+N)` })}
      {B('open', t('action.open'), 'open', { title: `${t('action.open')} (Ctrl+O)` })}
      {B('save', t('action.save'), 'save', { title: `${t('action.save')} (Ctrl+S)` })}
      {B('saveAs', t('action.saveAs'), 'saveAs', { title: `${t('action.saveAs')} (Ctrl+Shift+S)` })}
      {B('template', t('library.saveExample'), 'saveExample', { title: t('library.saveExampleTip') })}
      {B('importImage', t('action.importImage'), 'importImage')}
      {sep(2)}
      {B('undo', t('edit.undo'), 'undo', { disabled: !canUndo, title: `${t('edit.undo')} (Ctrl+Z)` })}
      {B('redo', t('edit.redo'), 'redo', { disabled: !canRedo, title: `${t('edit.redo')} (Ctrl+Y)` })}
      {B('copy', t('edit.copy'), 'copy', { disabled: !hasSelection, title: `${t('edit.copy')} (Ctrl+C)` })}
      {B('paste', t('edit.paste'), 'paste', { title: `${t('edit.paste')} (Ctrl+V)` })}
      {B('duplicate', t('edit.duplicate'), 'duplicate', { disabled: !hasSelection, title: `${t('edit.duplicate')} (Ctrl+D)` })}
      {B('trash', t('edit.delete'), 'delete', { disabled: !hasSelection, title: `${t('edit.delete')} (Del)` })}
      {sep(3)}
      {B('zoomOut', t('view.zoomOut'), 'zoomOut', { title: `${t('view.zoomOut')} (Ctrl+−)` })}
      {B('zoomIn', t('view.zoomIn'), 'zoomIn', { title: `${t('view.zoomIn')} (Ctrl++)` })}
      {B('fit', t('view.fit'), 'fit', { title: `${t('view.fit')} (Ctrl+0)` })}
      {B('actual', t('view.actual'), 'actual')}
      {sep(4)}
      {T('ruler', t('view.rulers'), 'rulers')}
      {T('grid', t('view.grid'), 'grid')}
      {T('snap', t('view.snap'), 'snap')}
      {T('guides', t('view.guides'), 'guides')}
      {T('preview', t('view.preview'), 'preview')}
      {sep(5)}
      {B('exportIco', t('export.ico'), 'exportIco', { disabled: exporting || !hasObjects, primary: true, title: `${t('export.ico')} (Ctrl+E)` })}
      {B('print', t('action.print'), 'print', { title: `${t('action.print')} (Ctrl+P)` })}
      {sep(6)}
      {B('guide', t('action.guide'), 'guide', { title: `${t('tip.guide')} (F1)` })}
    </div>
  );
}

export function StatusBar({ tool, selection, cursor, zoom, count, message }) {
  return (
    <footer className="statusbar" data-testid="statusbar">
      <span className="st-item"><Icon name={tool.startsWith('shape:') ? tool : tool} size={15} />{tool.startsWith('shape:') ? t(`shape.${tool.slice(6)}`) : t(`tool.${tool}`)}</span>
      <span className="st-item"><Icon name="layers" size={15} />{t('status.objects', { n: count })}</span>
      {selection && <span className="st-item"><Icon name="design" size={15} />{selection}</span>}
      {cursor && <span className="st-item"><Icon name="position" size={15} />{`${Math.round(cursor[0])}, ${Math.round(cursor[1])}`}</span>}
      <span className="st-item"><Icon name="zoomIn" size={15} />{Math.round(zoom * 100)}%</span>
      <span className="st-msg" role="status">{message}</span>
      <span className="grip" title={t('status.resize')} onPointerDown={(e) => { if (e.button === 0) { e.preventDefault(); windowDrag('SouthEast'); } }} aria-hidden="true">
        <svg viewBox="0 0 16 16" width="16" height="16"><g fill="currentColor"><circle cx="13" cy="13" r="1.5" /><circle cx="9" cy="13" r="1.5" /><circle cx="13" cy="9" r="1.5" /><circle cx="5" cy="13" r="1.5" /><circle cx="9" cy="9" r="1.5" /><circle cx="13" cy="5" r="1.5" /></g></svg>
      </span>
    </footer>
  );
}

const PREVIEW_SIZES = [16, 24, 32, 48, 64, 128];

/** The design at real icon sizes, live. */
export function PreviewStrip({ design }) {
  const url = useMemo(() => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serializeSvg(design, 256))}`, [design]);
  return (
    <div className="preview-strip" aria-label={t('view.preview')} data-testid="preview-strip">
      <span className="preview-title"><Icon name="preview" size={16} />{t('view.preview')}</span>
      {PREVIEW_SIZES.map((s) => (
        <figure key={s} className="preview-cell">
          <div className="preview-box" style={{ width: s, height: s }}><img src={url} width={s} height={s} alt="" draggable={false} /></div>
          <figcaption>{s}</figcaption>
        </figure>
      ))}
      <figure className="preview-cell dark">
        <div className="preview-box" style={{ width: 32, height: 32 }}><img src={url} width={32} height={32} alt="" draggable={false} /></div>
        <figcaption>{t('preview.dark')}</figcaption>
      </figure>
      <figure className="preview-cell light">
        <div className="preview-box" style={{ width: 32, height: 32 }}><img src={url} width={32} height={32} alt="" draggable={false} /></div>
        <figcaption>{t('preview.light')}</figcaption>
      </figure>
    </div>
  );
}

export function useListen(event, handler) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    let off = () => {};
    let gone = false;
    listen(event, (payload) => ref.current(payload)).then((fn) => { if (gone) fn(); else off = fn; });
    return () => { gone = true; off(); };
  }, [event]);
}
