// Opening the user manual from the main window.
//   openGuide({ doc, lang, section })
//     desktop: a real child window (lib/popups, kind 'guide'); a second call
//              focuses the open one and asks it to show the document / section.
//     web:     a separate browser window (window.open on the same page, route
//              #/window/guide); when the browser blocks it, the in-page
//              floating window drawn by <GuideHost/> (mounted once in App).
import React, { useEffect, useState } from 'react';
import { isDesktop } from '../lib/backend';
import { getLanguage } from '../lib/i18n';
import { getSettings } from '../lib/settings';
import { getCustomThemesRaw } from '../themes';
import { openPopupWindow, POPUP_HASH } from '../lib/popups';
import { postGuide, storeLook, watchLook } from '../lib/guideLink';
import { GuideFloat, guideGeometry } from './GuideWindow';

let desktopWin = null;
let webWin = null;
let floatSeq = 0;

export async function openGuide({ doc = 'manual', lang, section = null, inPage = false } = {}) {
  const l = lang || (getLanguage() === 'en' ? 'en' : 'ko');
  const look = storeLook();
  const geo = guideGeometry();
  if (isDesktop) {
    if (desktopWin) {
      try {
        await desktopWin.show();
        await desktopWin.setFocus();
        await postGuide('msm-guide-goto', { doc, lang: l, section });
        return desktopWin;
      } catch { desktopWin = null; }
    }
    const s = getSettings();
    desktopWin = await openPopupWindow({
      kind: 'guide', center: true, resizable: true, width: geo.width, height: geo.height,
      payload: { look, theme: s.theme, customThemes: getCustomThemesRaw(), language: getLanguage(), lang: l, doc, section },
      onClose: () => { desktopWin = null; },
    });
    return desktopWin;
  }
  const url = `${window.location.pathname}${window.location.search}${POPUP_HASH}guide?id=web&lang=${l}&doc=${doc}${section ? `&section=${encodeURIComponent(section)}` : ''}`;
  if (inPage) {
    floatSeq += 1;
    window.dispatchEvent(new CustomEvent('msm-guide-float', { detail: { doc, lang: l, section, n: floatSeq } }));
    return null;
  }
  if (webWin && !webWin.closed) {
    try { webWin.focus(); postGuide('msm-guide-goto', { doc, lang: l, section }); return webWin; } catch { webWin = null; }
  }
  const w = Math.min(geo.width, window.screen.availWidth || geo.width);
  const h = Math.min(geo.height, window.screen.availHeight || geo.height);
  const x = Number.isFinite(geo.x) ? geo.x : Math.round((window.screen.availWidth - w) / 2);
  const y = Number.isFinite(geo.y) ? geo.y : Math.round((window.screen.availHeight - h) / 2);
  let win = null;
  try { win = window.open(url, 'msm-guide', `popup=yes,width=${w},height=${h},left=${x},top=${y}`); } catch { win = null; }
  if (win) { webWin = win; return win; }
  // Blocked: the in-page window.
  floatSeq += 1;
  window.dispatchEvent(new CustomEvent('msm-guide-float', { detail: { doc, lang: l, section, n: floatSeq } }));
  return null;
}

/** In-page floating manual (web when popups are blocked) and the look watcher. */
export function GuideHost() {
  const [req, setReq] = useState(null);
  useEffect(() => watchLook(), []);
  useEffect(() => {
    const on = (e) => setReq(e.detail);
    window.addEventListener('msm-guide-float', on);
    return () => window.removeEventListener('msm-guide-float', on);
  }, []);
  if (!req) return null;
  return <GuideFloat request={req} onClose={() => setReq(null)} />;
}

export default GuideHost;
