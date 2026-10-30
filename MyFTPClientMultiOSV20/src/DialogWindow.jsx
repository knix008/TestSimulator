// Fills a dialog window. The shell (src-tauri/src/dialogs.rs) sets
// window.__MFC_DIALOG__ to the dialog's name before the page loads; `#dialog=`
// in the URL does the same in a browser. Renders the same components as the
// in-app overlay so a dialog never knows which host it is in.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { applyTheme, DEFAULT_THEME } from './themes';
import { setLanguage } from './lib/i18n';
import { setAppearance } from './lib/appearance';
import { isTauri, invoke, listen } from './lib/backend';
import { DialogStandalone, RENDERERS } from './dialogs/Dialogs';

function applyAppearance(appearance) {
  if (!appearance) return;
  setAppearance(appearance);
  applyTheme(appearance.theme || DEFAULT_THEME);
  if (appearance.language) setLanguage(appearance.language);
  if (appearance.fontSize) document.documentElement.style.setProperty('--fs', `${Math.max(9, Number(appearance.fontSize) || 13)}px`);
}

export function dialogNameFromLocation() {
  if (typeof window.__MFC_DIALOG__ === 'string' && window.__MFC_DIALOG__) return window.__MFC_DIALOG__;
  const match = /[#&?]dialog=([^&]+)/.exec(window.location.hash + window.location.search);
  return match ? decodeURIComponent(match[1]) : null;
}

export default function DialogWindow({ name }) {
  const [payload, setPayload] = useState(null);
  const boxRef = useRef(null);
  const kind = String(name || '').split('#')[0];
  const Renderer = RENDERERS[kind];

  // Before the first paint: the settings window fills its fixed size, the
  // others are laid out at their content size and fitted.
  useLayoutEffect(() => {
    document.documentElement.classList.add('dialog');
    document.documentElement.classList.toggle('dialog-fixed', kind === 'settings');
  }, [kind]);

  useEffect(() => {
    document.title = 'My FTP Client';
    if (!isTauri) return undefined;
    let alive = true;
    invoke('dialog_payload').then((value) => {
      if (!alive) return;
      const p = value ? value.payload : null;
      applyAppearance(p && p.appearance);
      setPayload(p || {});
    }).catch(() => { if (alive) setPayload({}); });
    const offPayload = listen('dialog:payload', (p) => { applyAppearance(p && p.appearance); setPayload(p || {}); });
    const offAppearance = listen('dialog:appearance', applyAppearance);
    return () => { alive = false; offPayload(); offAppearance(); };
  }, [name]);

  useEffect(() => {
    if (!payload || !isTauri) return;
    if (payload.title) document.title = payload.title;
    const fixed = kind === 'settings';
    const ready = () => invoke('dialog_ready').catch(() => {});
    if (fixed) {
      requestAnimationFrame(() => requestAnimationFrame(ready));
      return undefined;
    }
    let lastW = 0;
    let lastH = 0;
    const fit = () => {
      const el = boxRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const width = Math.ceil(Math.max(el.scrollWidth, r.width));
      const height = Math.ceil(Math.max(el.scrollHeight, r.height));
      if (width < 80 || height < 80) return;
      if (Math.abs(width - lastW) < 2 && Math.abs(height - lastH) < 2) return;
      lastW = width;
      lastH = height;
      invoke('dialog_set_size', { width, height }).catch(() => {});
    };
    const id = requestAnimationFrame(() => requestAnimationFrame(fit));
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    if (ro && boxRef.current) ro.observe(boxRef.current);
    const onToggle = (e) => {
      if (e.target && e.target.closest && e.target.closest('details')) requestAnimationFrame(fit);
    };
    document.addEventListener('toggle', onToggle, true);
    // Shown once it is painted at its fitted size.
    const shown = setTimeout(ready, 60);
    return () => {
      clearTimeout(shown);
      cancelAnimationFrame(id);
      if (ro) ro.disconnect();
      document.removeEventListener('toggle', onToggle, true);
    };
  }, [payload, kind]);

  const done = async (data) => {
    if (!isTauri) { window.close(); return; }
    try {
      await invoke('dialog_submit', { name, data: data === undefined ? null : data });
    } finally {
      invoke('dialog_close_self').catch(() => window.close());
    }
  };

  if (!Renderer || payload === null) return <div className="boot" />;
  return (
    <DialogStandalone>
      <div ref={boxRef} className={kind === 'settings' ? 'dlg-window-fill' : 'dlg-window-fit'}>
        <Renderer spec={{ type: kind, ...payload }} done={done} />
      </div>
    </DialogStandalone>
  );
}
