// The user's guide window: docs/UsersGuide(.en).html in a frame, with a bar for chapters,
// the guide's language, zoom, print and "open in browser", in the app's theme.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { setLanguage, t } from '../i18n.js';
import { loadSettings, PRINT_KEY } from '../lib/settings.js';
import { applyTheme, cssName, themeById } from '../lib/themes.js';
import { invoke, isDesktop, openBrowserWindow } from '../lib/platform.js';
import { Btn, IconSelect } from '../components/controls.jsx';
import { guideFile } from '../lib/docPages.js';
import { languageOptions, useListen } from '../components/Chrome.jsx';

const docFile = guideFile;

export default function GuideWindow() {
  const params = new URLSearchParams(location.search);
  const [lang, setLang] = useState(params.get('lang') === 'en' ? 'en' : params.get('lang') === 'ko' ? 'ko' : loadSettings().language);
  const [chapters, setChapters] = useState([]);
  const [chapter, setChapter] = useState(params.get('chapter') || '');
  const [zoom, setZoom] = useState(100);
  const [look, setLook] = useState(() => loadSettings());
  const frame = useRef(null);
  // The guide is shown once it wears the theme (no flash of its own default colours).
  const [shown, setShown] = useState('');
  useEffect(() => { const timer = setTimeout(() => setShown(lang), 3000); return () => clearTimeout(timer); }, [lang]);
  setLanguage(lang);

  useEffect(() => {
    document.title = `${t('action.guide')} — MyICOMaker`;
    if (isDesktop()) requestAnimationFrame(() => invoke('window_ready').catch(() => {}));
  }, [lang]);
  // The theme follows the main window.
  useEffect(() => {
    const onStorage = (e) => { if (e.key === 'myicomaker.settings') setLook(loadSettings()); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  useEffect(() => { applyTheme(look.theme, undefined, look.customTheme); }, [look]);
  useListen('guide-open', ([l, c]) => { if (l) setLang(l === 'en' ? 'en' : 'ko'); if (c) setChapter(c); });

  const doc = () => frame.current?.contentDocument;
  /** Colours of the document follow the theme; chapters come from its h2 headings. */
  const onLoad = useCallback(() => {
    const d = doc();
    if (!d) return;
    const th = themeById(look.theme, look.customTheme);
    const root = d.documentElement;
    root.dataset.dark = th.dark ? 'true' : 'false';
    for (const [key, value] of Object.entries(th.vars)) root.style.setProperty(cssName(key), value);
    // The page behind the text, the scroll bars and form controls follow the theme too.
    root.style.colorScheme = th.dark ? 'dark' : 'light';
    root.style.background = th.vars.bg;
    if (d.body) { d.body.style.background = th.vars.bg; d.body.style.color = th.vars.text; }
    d.body.style.zoom = `${zoom}%`;
    const list = [...d.querySelectorAll('h2[id]')].map((h) => ({ id: h.id, title: h.textContent.trim() }));
    setChapters(list);
    if (d.readyState !== 'loading' && d.body?.childElementCount) setShown(lang);
    if (chapter) d.getElementById(chapter)?.scrollIntoView();
  }, [look, zoom, chapter, lang]);
  useEffect(() => { onLoad(); }, [look, zoom]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (id) => { setChapter(id); doc()?.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }); };
  // Print goes through the program's print window (printer, page setup, preview of every page),
  // which cuts the guide into pages of the chosen paper.
  const printDoc = async () => {
    const job = { kind: 'guide', lang, name: doc()?.title || t('action.guide'), time: Date.now() };
    try { localStorage.setItem(PRINT_KEY, JSON.stringify(job)); } catch { /* full storage: the window says so */ }
    if (isDesktop()) await invoke('open_popup', { kind: 'print', title: `${t('print.title')} — MyICOMaker` }).catch(() => frame.current?.contentWindow?.print());
    else if (!openBrowserWindow(`${location.pathname}?popup=print`, 'myicomaker-print', 1120, 800)) frame.current?.contentWindow?.print();
  };
  useEffect(() => {
    const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') { e.preventDefault(); printDoc(); } };
    window.addEventListener('keydown', onKey);
    const d = doc();
    d?.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); d?.removeEventListener('keydown', onKey); };
  });
  // Web only: the guide as a page of its own (the desktop window already is one).
  const openInBrowser = () => window.open(docFile(lang), '_blank', 'noopener');

  return (
    <div className="guide-window">
      <header className="guide-bar">
        <IconSelect label={t('guide.chapters')} value={chapter || chapters[0]?.id || ''} onChange={go}
          options={chapters.length ? chapters.map((c) => ({ value: c.id, label: c.title, icon: 'guide' })) : [{ value: '', label: t('guide.chapters'), icon: 'guide' }]} testId="guide-chapters" />
        <span className="grow" />
        <IconSelect label={t('action.language')} value={lang} options={languageOptions()} onChange={setLang} className="fixed-select" />
        <Btn icon="zoomOut" label={t('view.zoomOut')} onClick={() => setZoom((z) => Math.max(60, z - 10))} />
        <span className="zoom-value">{zoom}%</span>
        <Btn icon="zoomIn" label={t('view.zoomIn')} onClick={() => setZoom((z) => Math.min(200, z + 10))} />
        <Btn icon="print" label={t('action.print')} title={`${t('action.print')} (Ctrl+P)`} onClick={printDoc} data-testid="guide-print" />
        {!isDesktop() && <Btn icon="external" label={t('guide.openBrowser')} onClick={openInBrowser} />}
      </header>
      <iframe ref={frame} className="guide-frame" title={t('action.guide')} src={docFile(lang)} onLoad={onLoad} data-testid="guide-frame"
        style={{ visibility: shown === lang ? 'visible' : 'hidden' }} />
    </div>
  );
}
