import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { tauriApi } from './lib/tauriBridge.js';
import { applyAppearanceBundle, applyFont } from './themes.js';
import { MenuContent } from './components/Menus.jsx';

// Content of the shared popup window: renders the current menu, reports its
// size so the native side can place the window, and forwards the choice.
export default function PopupHost() {
  const [payload, setPayload] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    document.documentElement.classList.add('popup-window');
    tauriApi.popup.getPayload().then((p) => { if (p) setPayload(p); });
    const offP = tauriApi.popup.onPayload((p) => setPayload(p));
    const offA = tauriApi.dialogs.onAppearance((a) => {
      applyAppearanceBundle(a);
      if (a && a.font) applyFont(a.font);
    });
    const onKey = (e) => { if (e.key === 'Escape') tauriApi.popup.hide(); };
    window.addEventListener('keydown', onKey);
    return () => { offP(); offA(); window.removeEventListener('keydown', onKey); };
  }, []);

  useLayoutEffect(() => {
    if (!payload) return;
    if (payload.appearance) {
      applyAppearanceBundle(payload.appearance);
      if (payload.appearance.font) applyFont(payload.appearance.font);
    }
    // Measured synchronously: the window is still hidden here, and hidden
    // webviews do not run requestAnimationFrame callbacks.
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    tauriApi.popup.place(payload.token, Math.ceil(r.width), Math.ceil(r.height));
  }, [payload]);

  if (!payload) return null;
  return (
    <div className="popup-root" ref={ref}>
      <MenuContent payload={payload} onChoose={(id, keepOpen) => tauriApi.popup.choose(payload.token, id, keepOpen)} />
    </div>
  );
}
