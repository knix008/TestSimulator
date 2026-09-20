// Fills an Electron dialog window (`#dialog=<name>`). Renders the same
// components as the in-app overlay so a dialog never knows which host it is in.
import React, { useEffect, useRef, useState } from 'react';
import { applyTheme, DEFAULT_THEME } from './themes';
import { setLanguage } from './lib/i18n';
import { DialogStandalone, RENDERERS } from './dialogs/Dialogs';

const electron = typeof window !== 'undefined' ? window.myFtpClient : null;

function applyAppearance(appearance) {
  if (!appearance) return;
  applyTheme(appearance.theme || DEFAULT_THEME);
  if (appearance.language) setLanguage(appearance.language);
  if (appearance.fontSize) document.documentElement.style.setProperty('--fs', `${Math.max(9, Number(appearance.fontSize) || 13)}px`);
}

export function dialogNameFromLocation() {
  const match = /[#&?]dialog=([^&]+)/.exec(window.location.hash + window.location.search);
  return match ? decodeURIComponent(match[1]) : null;
}

export default function DialogWindow({ name }) {
  const [payload, setPayload] = useState(null);
  const boxRef = useRef(null);
  const kind = String(name || '').split('#')[0];
  const Renderer = RENDERERS[kind];

  useEffect(() => {
    document.documentElement.classList.add('dialog');
    document.title = 'My FTP Client';
    if (!electron || !electron.getDialogPayload) return undefined;
    let alive = true;
    electron.getDialogPayload().then((value) => {
      if (!alive) return;
      const p = value ? value.payload : null;
      applyAppearance(p && p.appearance);
      setPayload(p || {});
    });
    const offPayload = electron.onDialogPayload((p) => { applyAppearance(p && p.appearance); setPayload(p || {}); });
    const offAppearance = electron.onDialogAppearance(applyAppearance);
    return () => { alive = false; offPayload(); offAppearance(); };
  }, [name]);

  useEffect(() => {
    if (!payload || !electron) return;
    if (payload.title) document.title = payload.title;
    const fit = () => {
      const el = boxRef.current;
      if (!el || !electron.dialogSetSize) return;
      const r = el.getBoundingClientRect();
      electron.dialogSetSize(Math.ceil(r.width), Math.ceil(r.height));
    };
    const id = requestAnimationFrame(fit);
    if (electron.dialogReady) electron.dialogReady();
    return () => cancelAnimationFrame(id);
  }, [payload]);

  const done = (data) => {
    if (!electron) { window.close(); return; }
    if (electron.submitDialog) electron.submitDialog(name, data);
    if (electron.closeSelf) electron.closeSelf();
    else window.close();
  };

  if (!Renderer || payload === null) return <div className="boot" />;
  return (
    <DialogStandalone>
      <div ref={boxRef} className="dlg-window-fit">
        <Renderer spec={{ type: kind, ...payload }} done={done} />
      </div>
    </DialogStandalone>
  );
}
