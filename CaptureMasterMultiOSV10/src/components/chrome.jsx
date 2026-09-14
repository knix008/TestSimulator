import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icons.jsx';
import { platform } from '../lib/platform.js';
import { formatDuration } from '../lib/format.js';
import { isDirty } from '../lib/document.js';

// ── Title bar: program name + version + current document ──
export function TitleBar({ version, docName, dirty, isMac }) {
  const { t } = useTranslation();
  const wc = platform.windowControls;
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!wc.available) return undefined;
    wc.isMaximized().then(setMaximized);
    return wc.onMaximizedChange(setMaximized);
  }, [wc]);

  return (
    <div className={`titlebar${isMac ? ' mac' : ''}`} onDoubleClick={() => wc.available && wc.toggleMaximize()}>
      <img className="titlebar-icon" src="./icon.svg" alt="" draggable={false} />
      <div className="titlebar-title">
        <span className="titlebar-name">{t('app.name')}</span>
        {version ? <span className="titlebar-version">v{version}</span> : null}
        {docName ? <span className="titlebar-doc">{dirty ? '● ' : ''}{docName}</span> : null}
      </div>
      <div className="titlebar-spacer" />
      {wc.available && !isMac ? (
        <div className="titlebar-controls">
          <button onClick={() => wc.minimize()} data-tip={t('common.minimize')} aria-label={t('common.minimize')}><Icon name="minimize" /></button>
          <button onClick={() => wc.toggleMaximize()} data-tip={maximized ? t('common.restore') : t('common.maximize')} aria-label={t('common.maximize')}>
            <Icon name={maximized ? 'restore' : 'maximize'} />
          </button>
          <button className="close" onClick={() => wc.close()} data-tip={t('common.close')} aria-label={t('common.close')}><Icon name="close" /></button>
        </div>
      ) : null}
    </div>
  );
}

// ── Tabs ──────────────────────────────────────────────────
export function Tabs({ docs, activeId, onSelect, onClose, onContextMenu }) {
  const { t } = useTranslation();
  if (!docs.length) return <div className="tabs" style={{ minHeight: 0, padding: 0, borderBottom: 0 }} />;
  return (
    <div className="tabs">
      {docs.map((d) => (
        <div
          key={d.id}
          className={`tab${d.id === activeId ? ' active' : ''}`}
          onClick={() => onSelect(d.id)}
          onAuxClick={(e) => { if (e.button === 1) onClose(d.id); }}
          onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, d); }}
          title={d.path || d.name}
        >
          <Icon name={d.kind === 'video' ? 'video' : d.path && d.path.endsWith('.cmcap') ? 'file' : 'image'} className="tab-kind" />
          <span className="tab-name">{d.name}</span>
          {isDirty(d) ? <span className="tab-dirty">●</span> : null}
          <button className="tab-close" data-tip={t('tabs.close')} onClick={(e) => { e.stopPropagation(); onClose(d.id); }}><Icon name="close" /></button>
        </div>
      ))}
    </div>
  );
}

// ── Status bar ────────────────────────────────────────────
export function StatusBar({ doc, zoom, cursor, tool, message, recording, capturing, themeLabel, docsCount }) {
  const { t } = useTranslation();
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!recording) { setElapsed(0); return undefined; }
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - recording.startedAt - (recording.pausedMs || 0)) / 1000)), 500);
    return () => clearInterval(id);
  }, [recording]);

  const present = doc && doc.history ? doc.history.present : null;
  const w = present ? present.image.width : doc && doc.kind === 'video' ? doc.width : 0;
  const h = present ? present.image.height : doc && doc.kind === 'video' ? doc.height : 0;

  return (
    <div className="statusbar">
      {recording ? <span className="sb-item rec"><span className="rec-dot" />{t('status.recElapsed', { t: formatDuration(elapsed) })}</span> : null}
      {capturing ? <span className="sb-item warn">{capturing}</span> : null}
      <span className="sb-item grow">{message || (doc ? t('status.ready') : t('status.noDocument'))}</span>
      {doc ? <span className="sb-item">{doc.kind === 'video' ? <Icon name="video" /> : <Icon name="image" />}{w && h ? t('status.size', { w, h }) : doc.kind === 'video' ? t('status.video') : ''}</span> : null}
      {doc && doc.kind === 'video' && doc.duration ? <span className="sb-item">{t('status.duration', { t: formatDuration(doc.duration) })}</span> : null}
      {doc && doc.kind === 'image' ? <span className="sb-item">{t('status.annotations', { n: present.annotations.length })}</span> : null}
      {doc && doc.selection ? <span className="sb-item">{t('status.selection', { w: Math.round(doc.selection.w), h: Math.round(doc.selection.h) })}</span> : null}
      {doc && cursor ? <span className="sb-item">{t('status.cursor', { x: cursor.x, y: cursor.y })}</span> : null}
      {doc && doc.kind === 'image' ? <span className="sb-item">{t('status.tool', { tool: t(`tool.${tool}`) })}</span> : null}
      {doc ? <span className="sb-item">{t('status.zoom', { z: Math.round(zoom * 100) })}</span> : null}
      {doc && doc.kind === 'image' ? <span className={`sb-item ${isDirty(doc) ? 'warn' : 'ok'}`}>{isDirty(doc) ? t('status.modified') : doc.path ? t('status.saved') : t('status.unsaved')}</span> : null}
      {docsCount ? <span className="sb-item">{t('status.docs', { n: docsCount })}</span> : null}
      <span className="sb-item">{t('status.theme', { theme: themeLabel })}</span>
      <ResizeGrip />
    </div>
  );
}

// A frameless window has no corner to drag: this grip resizes the window.
function ResizeGrip() {
  const { t } = useTranslation();
  const wc = platform.windowControls;
  const drag = useRef(null);
  if (!wc.available) return null;
  const down = async (e) => {
    const size = await wc.getSize();
    if (!size) return;
    drag.current = { sx: e.screenX, sy: e.screenY, w: size.width, h: size.height };
    const move = (ev) => {
      if (!drag.current) return;
      wc.setSize({ width: drag.current.w + (ev.screenX - drag.current.sx), height: drag.current.h + (ev.screenY - drag.current.sy) });
    };
    const up = () => { drag.current = null; window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };
  return <div className="sb-grip" onMouseDown={down} data-tip={t('status.resizeGrip')}><Icon name="grip" /></div>;
}

// ── Welcome screen ────────────────────────────────────────
export function Welcome({ onAction, canCapture }) {
  const { t, i18n } = useTranslation();
  const ref = useRef(null);

  // The start screen must be fully visible: whatever does not fit is added to
  // the window's minimum height (measured again once fonts have settled).
  useLayoutEffect(() => {
    const measure = () => {
      const el = ref.current;
      if (!el) return;
      const missing = el.scrollHeight - el.clientHeight;
      if (missing > 0) platform.windowControls.setMinHeight(window.innerHeight + missing);
    };
    measure();
    const id = setTimeout(measure, 400);
    return () => clearTimeout(id);
  }, [i18n.language]);

  const keys = [
    ['Ctrl+N', t('toolbar.captureScreen')], ['Ctrl+Shift+W', t('toolbar.captureWindow')], ['Ctrl+Shift+R', t('toolbar.captureRegion')],
    ['Ctrl+Shift+V', t('toolbar.record')], ['Ctrl+O', t('toolbar.open')], ['Ctrl+V', t('toolbar.paste')],
  ];
  return (
    <div className="welcome" ref={ref}>
      <img src="./icon.svg" alt="" draggable={false} />
      <h1>{t('welcome.title')}</h1>
      <div>{t('welcome.hint')}</div>
      <div className="welcome-actions">
        <button onClick={() => onAction('screen')} disabled={!canCapture}><Icon name="screen" />{t('welcome.screen')}</button>
        <button onClick={() => onAction('window')} disabled={!canCapture}><Icon name="window" />{t('welcome.window')}</button>
        <button onClick={() => onAction('region')} disabled={!canCapture}><Icon name="region" />{t('welcome.region')}</button>
        <button onClick={() => onAction('record')} disabled={!canCapture}><Icon name="record" />{t('welcome.record')}</button>
        <button onClick={() => onAction('open')}><Icon name="open" />{t('welcome.open')}</button>
        <button onClick={() => onAction('paste')}><Icon name="paste" />{t('welcome.paste')}</button>
      </div>
      <div className="welcome-keys">
        {keys.map(([k, label]) => (
          <React.Fragment key={k}><kbd>{k}</kbd><span>{label}</span></React.Fragment>
        ))}
      </div>
    </div>
  );
}
