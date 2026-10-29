// 사용 설명서 window: reads the generated documents in ./docs (npm run
// build:docs) — the user's guide, the tutorial document and the README, in
// Korean or English — in an iframe, with a toolbar: document, language
// (flags), ◀ ▶ history, open in a new window, close.
//
// The page follows the main window's theme exactly: every --* token of the
// app (plus the page's own names mapped from them) is written to
// localStorage['mycodechecker.docTheme'] before the page loads, and posted
// into the iframe on load and whenever the theme changes. The language
// follows the app's until changed here.
//
// Mounted once in App: <UserGuide />. window.__mcc.openGuide(doc?, lang?)
// opens it ('guide' | 'tutorial' | 'readme'), window.__mcc.closeGuide() closes it.
//
// Desktop: the guide is a window of its own (popup kind 'guide', the system
// title bar, top level — not owned by the main window, so it can be moved
// anywhere and go behind it; fixed size). It renders <UserGuide windowed />;
// opening it again sends 'mcc-guide-show' to the window that is already open,
// and the main window sends 'mcc-guide-look' when its theme or language changes.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { getLanguage, setLanguage, useLanguage } from '../lib/i18n';
import { Icon, CloseButton } from './Chrome';
import { FlagKR, FlagGB } from './Flags';
import { onBroadcast, broadcast, usePopupWindows, openPopupWindow, closeSelf } from '../lib/popups';
import { applyTheme, setCustomThemes, getCustomThemesRaw } from '../themes';
import '../tutorial.css';

export const GUIDE_DOCS = [
  { id: 'guide', base: 'UsersGuide', icon: 'book', ko: '사용 설명서', en: 'User\'s guide' },
  { id: 'tutorial', base: 'Tutorial', icon: 'graduation', ko: '튜토리얼 문서', en: 'Tutorial document' },
  { id: 'readme', base: 'README', icon: 'file', ko: 'README', en: 'README' },
];

const L = {
  ko: { title: '사용 설명서', doc: '문서 선택', back: '뒤로', forward: '앞으로', external: '새 창에서 열기', close: '닫기 (Esc)', missing: '이 문서는 아직 만들어지지 않았습니다.', build: '문서를 만들려면 npm run build:docs 를 실행하세요.', ko: '한국어', en: 'English' },
  en: { title: 'User\'s guide', doc: 'Document', back: 'Back', forward: 'Forward', external: 'Open in new window', close: 'Close (Esc)', missing: 'This document has not been built yet.', build: 'Run npm run build:docs to build the documents.', ko: '한국어', en: 'English' },
};

const docOf = (id) => GUIDE_DOCS.find((d) => d.id === id) || GUIDE_DOCS[0];
export const guidePath = (id, lang) => `docs/${docOf(id).base}${lang === 'en' ? '.en' : ''}.html`;
const absolute = (p) => new URL(`./${p}`, window.location.href).href;

// Layout tokens that should not leak into the document page.
const SKIP = new Set(['--font', '--mono', '--fs', '--radius']);

/** Every --* token of the app now, plus the document page's names mapped from them. */
export function currentDocTheme() {
  const root = document.documentElement;
  const css = getComputedStyle(root);
  const vars = {};
  const take = (name) => {
    if (!name.startsWith('--') || SKIP.has(name) || name in vars) return;
    const v = css.getPropertyValue(name).trim();
    if (v) vars[name] = v;
  };
  for (let i = 0; i < root.style.length; i += 1) take(root.style[i]);
  for (let i = 0; i < css.length; i += 1) take(css[i]);
  for (const name of ['--bg', '--bg-panel', '--bg-elev', '--bg-hover', '--bg-sel', '--fg', '--fg-muted', '--border', '--border-strong', '--accent', '--accent-strong', '--accent-text', '--danger', '--ok']) take(name);
  const v = (k, d) => vars[k] || d;
  const surface = v('--bg-elev', v('--bg-panel', v('--bg')));
  const dark = root.dataset.mode ? root.dataset.mode !== 'light' : true;
  Object.assign(vars, {
    '--surface': surface,
    '--text': v('--fg'),
    '--muted': v('--fg-muted'),
    '--panel': v('--bg-panel'),
    '--raised': v('--bg-elev'),
    '--code-bg': v('--bg-panel', v('--bg')),
    '--row-alt': `color-mix(in srgb, ${v('--bg-panel', surface)} 55%, ${surface})`,
    '--accent-soft': `color-mix(in srgb, ${v('--accent')} ${dark ? 18 : 12}%, ${surface})`,
    '--th-bg': `color-mix(in srgb, ${v('--accent')} ${dark ? 22 : 14}%, ${surface})`,
    '--link': v('--accent'),
    '--shadow': dark ? '0 1px 3px rgba(0, 0, 0, .4)' : '0 1px 3px rgba(20, 30, 50, .08)',
  });
  return { dark, theme: root.dataset.theme || '', vars };
}

export function writeDocTheme() {
  const theme = currentDocTheme();
  try { localStorage.setItem('mycodechecker.docTheme', JSON.stringify(theme)); } catch { /* storage blocked */ }
  return theme;
}

async function exists(path) {
  try {
    const res = await fetch(absolute(path), { cache: 'no-store' });
    if (!res.ok) return false;
    // Vite's dev server answers unknown paths with index.html.
    return !/<div id="root"><\/div>/.test(await res.text());
  } catch { return false; }
}

const mcc = () => {
  if (!window.__mcc) window.__mcc = {};
  return window.__mcc;
};

// ── desktop: the guide window ──────────────────────────
let guideWin = null;
const look = () => ({ theme: document.documentElement.dataset.theme, language: getLanguage(), customThemes: getCustomThemesRaw() });

/** Size of the guide window (CSS px): fixed, fitted to the screen. */
export function guideWindowSize() {
  const sw = window.screen.availWidth || 1280;
  const sh = window.screen.availHeight || 800;
  return { width: Math.min(1180, sw - 40), height: Math.min(860, sh - 40) };
}

async function openGuideWindow(id, language) {
  const req = { doc: docOf(id).id, lang: language || getLanguage() };
  if (guideWin) {
    await broadcast('mcc-guide-show', { ...req, ...look() });
    try { await guideWin.unminimize(); } catch { /* not minimized */ }
    try { await guideWin.show(); await guideWin.setFocus(); } catch { /* gone */ }
    return;
  }
  const size = guideWindowSize();
  const s = L[getLanguage() === 'en' ? 'en' : 'ko'];
  guideWin = await openPopupWindow({
    kind: 'guide', center: true, frame: true, owned: false, width: size.width, height: size.height,
    payload: { ...look(), ...req, windowTitle: `${s.title} · MyCodeChecker` },
    onClose: () => { guideWin = null; },
  });
  // The main window's theme / language changes follow into the guide window.
  const mo = new MutationObserver(() => { if (guideWin) broadcast('mcc-guide-look', look()).catch(() => {}); else mo.disconnect(); });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'data-theme', 'data-mode', 'class', 'lang'] });
}

const applyLook = (p) => {
  if (!p) return;
  if (p.customThemes) setCustomThemes(p.customThemes);
  if (p.theme) applyTheme(p.theme);
  if (p.language && p.language !== getLanguage()) setLanguage(p.language);
};

/** windowed: the content of the guide window (always open; closing closes the window). */
export function UserGuide({ windowed = false, initial = null }) {
  const appLang = useLanguage();
  const [open, setOpenState] = useState(windowed);
  const setOpen = useCallback((v) => { if (windowed) { if (!v) closeSelf(); } else setOpenState(v); }, [windowed]);
  const [lang, setLang] = useState((initial && initial.lang) || getLanguage());
  const [doc, setDoc] = useState((initial && initial.doc) || 'guide');
  const [menu, setMenu] = useState(false);
  const [missing, setMissing] = useState(false);
  // History of visited pages (path + hash), with the position in it.
  const [hist, setHist] = useState({ list: [], at: -1 });
  // What the iframe shows: changed only by our own navigation (n remounts it).
  const [nav, setNav] = useState({ src: '', n: 0 });
  const frame = useRef(null);
  const s = L[getLanguage() === 'en' ? 'en' : 'ko'];

  const navigate = useCallback((path, push = true) => {
    writeDocTheme();
    if (push) setHist((h) => ({ list: [...h.list.slice(0, h.at + 1), path], at: h.at + 1 }));
    setNav((v) => ({ src: path, n: v.n + 1 }));
    setMissing(false);
    exists(path.split('#')[0]).then((ok) => setMissing(!ok));
  }, []);

  const show = useCallback((id = 'guide', language) => {
    const l = language || getLanguage();
    setDoc(docOf(id).id);
    setLang(l);
    setOpenState(true);
    navigate(guidePath(id, l));
  }, [navigate]);

  // The guide window: show the first document, then whatever the main window asks for.
  useEffect(() => {
    if (!windowed) return undefined;
    show((initial && initial.doc) || 'guide', initial && initial.lang);
    const offs = [];
    let gone = false;
    const keep = (p) => p.then((fn) => { if (gone) fn(); else offs.push(fn); }).catch(() => {});
    keep(onBroadcast('mcc-guide-show', (p) => { applyLook(p); show((p && p.doc) || 'guide', p && p.lang); }));
    keep(onBroadcast('mcc-guide-look', (p) => applyLook(p)));
    return () => { gone = true; offs.forEach((fn) => fn()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowed]);

  // The app language changed: follow it.
  useEffect(() => {
    if (!open) { setLang(appLang); return; }
    if (appLang !== lang) { setLang(appLang); navigate(guidePath(doc, appLang)); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appLang]);

  useEffect(() => {
    if (windowed) return undefined;
    const api = mcc();
    const separate = usePopupWindows();
    api.openGuide = (id, language) => (separate ? openGuideWindow(id, language) : show(id, language));
    api.closeGuide = () => { if (separate && guideWin) { guideWin.close().catch(() => {}); guideWin = null; } setOpenState(false); };
    let off = null;
    let gone = false;
    onBroadcast('mcc-open-guide', (id) => api.openGuide(id || 'guide')).then((fn) => { if (gone) fn(); else off = fn; }).catch(() => {});
    return () => {
      gone = true;
      if (off) off();
      if (api.openGuide) delete api.openGuide;
      if (api.closeGuide) delete api.closeGuide;
    };
  }, [show, windowed]);

  // Send the theme to the page now and whenever the app's theme changes.
  const post = useCallback(() => {
    const theme = writeDocTheme();
    const w = frame.current && frame.current.contentWindow;
    if (w) { try { w.postMessage({ type: 'mcc-doc-theme', theme }, window.location.origin); } catch { /* page gone */ } }
  }, []);
  useEffect(() => {
    if (!open) return undefined;
    const mo = new MutationObserver(() => post());
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'data-theme', 'data-mode', 'class'] });
    return () => mo.disconnect();
  }, [open, post]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape' || !e.isTrusted) return;
      if (window.__mcc && window.__mcc.tutorial && window.__mcc.tutorial.state().active) return;
      e.stopPropagation();
      if (menu) setMenu(false); else setOpen(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, menu, setOpen]);

  // A link clicked inside the page: keep it in the history, and pick up its document / language.
  const onLoad = () => {
    post();
    let here = '';
    try {
      const loc = frame.current.contentWindow.location;
      const base = new URL('./', window.location.href).href;
      here = loc.href.startsWith(base) ? loc.href.slice(base.length) : '';
    } catch { return; }
    if (!here) return;
    setHist((h) => (h.list[h.at] === here ? h : { list: [...h.list.slice(0, h.at + 1), here], at: h.at + 1 }));
    const file = here.split('#')[0].split('/').pop();
    const d = GUIDE_DOCS.find((x) => file === `${x.base}.html` || file === `${x.base}.en.html`);
    if (d) { setDoc(d.id); setLang(file.endsWith('.en.html') ? 'en' : 'ko'); }
  };

  if (!open) return null;
  const current = hist.list[hist.at] || guidePath(doc, lang);
  const go = (delta) => setHist((h) => {
    const at = Math.max(0, Math.min(h.list.length - 1, h.at + delta));
    if (at !== h.at) { writeDocTheme(); setNav((v) => ({ src: h.list[at], n: v.n + 1 })); exists(h.list[at].split('#')[0]).then((ok) => setMissing(!ok)); }
    return { ...h, at };
  });
  const pickDoc = (id) => { setMenu(false); setDoc(id); navigate(guidePath(id, lang)); };
  const pickLang = (l) => { setLang(l); navigate(guidePath(doc, l)); };
  const openExternal = () => { writeDocTheme(); window.open(absolute(current), '_blank', 'noopener'); };
  const d = docOf(doc);

  const body = (
      <div className={`mcc-guide ${windowed ? 'mcc-guide-windowed' : ''}`} role="dialog" aria-label={s.title} data-tour="guide-window" data-testid="guide-window">
        <div className="mcc-guide-bar">
          {!windowed && <span className="mcc-guide-title"><Icon name="book" size={16} />{s.title}</span>}
          {!windowed && <span className="mcc-guide-sep" />}
          <div className="mcc-guide-docs">
            <button type="button" className="mcc-guide-btn" title={s.doc} aria-haspopup="listbox" aria-expanded={menu} data-testid="guide-doc" onClick={() => setMenu((v) => !v)}>
              <Icon name={d.icon} size={14} /><span>{lang === 'en' ? d.en : d.ko}</span><Icon name="chevronDown" size={12} />
            </button>
            {menu && (
              <ul className="mcc-guide-menu" role="listbox" aria-label={s.doc} onMouseLeave={() => setMenu(false)}>
                {GUIDE_DOCS.map((x) => (
                  <li key={x.id} role="option" aria-selected={x.id === doc} className={x.id === doc ? 'on' : ''} onClick={() => pickDoc(x.id)}>
                    <Icon name={x.icon} size={14} /><span>{getLanguage() === 'en' ? x.en : x.ko}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <span className="mcc-guide-sep" />
          <button type="button" className={`mcc-guide-btn ${lang === 'ko' ? 'on' : ''}`} title={s.ko} aria-label={s.ko} aria-pressed={lang === 'ko'} data-testid="guide-lang-ko" onClick={() => pickLang('ko')}><FlagKR width={22} height={15} /><span>KO</span></button>
          <button type="button" className={`mcc-guide-btn ${lang === 'en' ? 'on' : ''}`} title={s.en} aria-label={s.en} aria-pressed={lang === 'en'} data-testid="guide-lang-en" onClick={() => pickLang('en')}><FlagGB width={22} height={15} /><span>EN</span></button>
          <span className="mcc-guide-sep" />
          <button type="button" className="mcc-guide-btn" title={s.back} aria-label={s.back} disabled={hist.at <= 0} onClick={() => go(-1)}><Icon name="chevronLeft" size={14} /><span>{s.back}</span></button>
          <button type="button" className="mcc-guide-btn" title={s.forward} aria-label={s.forward} disabled={hist.at >= hist.list.length - 1} onClick={() => go(1)}><span>{s.forward}</span><Icon name="chevronRight" size={14} /></button>
          <span className="mcc-guide-grow" />
          <button type="button" className="mcc-guide-btn" title={s.external} aria-label={s.external} data-testid="guide-external" onClick={openExternal}><Icon name="external" size={14} /><span>{s.external}</span></button>
          {!windowed && <CloseButton className="mcc-guide-x" title={s.close} aria-label={s.close} data-testid="guide-close" onClick={() => setOpen(false)} size={15} />}
        </div>
        <div className="mcc-guide-frame">
          {missing
            ? <div className="mcc-guide-empty"><div><Icon name="book" size={30} /><p>{s.missing}</p><p><code>{(nav.src || current).split('#')[0]}</code></p><p className="small">{s.build}</p></div></div>
            : <iframe key={nav.n} ref={frame} title={s.title} src={absolute(nav.src || current)} onLoad={onLoad} />}
        </div>
      </div>
  );
  if (windowed) return body;
  return createPortal(
    <div className="mcc-guide-back" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>{body}</div>,
    document.body,
  );
}

/** Mounts <UserGuide/> on its own (for pages and scripts that do not render it). */
export function mountUserGuide() {
  if (mcc().openGuide) return;
  const host = document.createElement('div');
  host.className = 'mcc-guide-host';
  document.body.appendChild(host);
  createRoot(host).render(<UserGuide />);
}

export default UserGuide;
