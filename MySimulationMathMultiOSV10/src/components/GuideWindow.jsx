// 사용 설명서 window: the table of contents on the left (chapters → sections,
// clickable, the section being read is highlighted while scrolling) and the
// content on the right. Toolbar: document (manual / tutorial document),
// language (flags), font size [−] 12px [+] (remembered), print (whole
// manual or the current chapter; Ctrl+P), run tutorial, close.
//
// Where it lives:
//   desktop  a real child window: index.html#/window/guide?id=… (GuidePage,
//            opened by openGuide() → lib/popups openPopupWindow, kind 'guide');
//            its position and size are remembered.
//   web      a separate browser window (same route, opened with window.open);
//            when popups are blocked, an in-page floating window (GuideHost).
// Colours: the theme tokens of the main window (lib/guideLink look), followed live.
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, CloseButton, ResizeGrip } from './Chrome';
import { LangFlag } from './Flags';
import { IconSelect } from '../views/common';
import { isDesktop, loadSettings } from '../lib/backend';
import { applyTheme, setCustomThemes } from '../themes';
import { getLanguage } from '../lib/i18n';
import { guideDoc, GUIDE_DOCS, GUIDE_LANGS } from '../lib/guideDocs';
import { GUIDE_CONTENT_CSS, currentHeading, clampFont, FONT_MIN, FONT_MAX, FONT_DEFAULT, manualPrintHtml } from '../lib/guide';
import { popupRoute, receivePayload, closeSelf, onBroadcast, announceShown } from '../lib/popups';
import { onGuide, postGuide, applyLook, storedLook } from '../lib/guideLink';
import '../guide.css';

const L = {
  ko: { title: '사용 설명서', doc: '문서', lang: '언어', font: '글자 크기', smaller: '글자 작게', larger: '글자 크게', print: '인쇄', printTip: '인쇄 (Ctrl+P)', printAll: '전체 설명서', printChapter: '현재 장', printScope: '인쇄 범위', tour: '튜토리얼 실행', close: '닫기 (Esc)', contents: '목차', ko: '한국어', en: 'English', top: '맨 위로' },
  en: { title: 'User manual', doc: 'Document', lang: 'Language', font: 'Font size', smaller: 'Smaller text', larger: 'Larger text', print: 'Print', printTip: 'Print (Ctrl+P)', printAll: 'Whole manual', printChapter: 'Current chapter', printScope: 'What to print', tour: 'Run tutorial', close: 'Close (Esc)', contents: 'Contents', ko: '한국어', en: 'English', top: 'Back to top' },
};
const FONT_KEY = 'msm.guide.fontSize';
const AT_KEY = 'msm.guide.at';
const SCOPE_KEY = 'msm.guide.printScope';
const read = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } };

let styleDone = false;
function useContentCss() {
  useEffect(() => {
    if (styleDone || typeof document === 'undefined') return;
    styleDone = true;
    const el = document.createElement('style');
    el.dataset.guide = '1';
    el.textContent = GUIDE_CONTENT_CSS;
    document.head.appendChild(el);
  }, []);
}

/** Prints chapters with the shared print dialog (src/print), or the browser's print. */
export async function printChapters(chapters, { title, lang, fontSize }) {
  const baseUrl = new URL('./', window.location.href).href;
  const html = manualPrintHtml(chapters, { title, lang, baseUrl, fontSize });
  // The shared dialog: page setup on the left, preview on the right. Bundled when present.
  const mods = import.meta.glob('../print/index.js');
  const load = mods['../print/index.js'];
  if (load) {
    try {
      const m = await load();
      if (m && typeof m.openPrintDialog === 'function') return await m.openPrintDialog({ kind: 'html', html, title, baseUrl });
    } catch (e) { console.warn('print dialog', e); }
  }
  // Fallback: the browser's print of the same page in a hidden frame.
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '1px', height: '1px', border: '0', opacity: '0' });
    frame.srcdoc = html;
    frame.onload = () => {
      const w = frame.contentWindow;
      const imgs = Array.from(w.document.images);
      Promise.all(imgs.map((im) => (im.complete ? null : new Promise((r) => { im.onload = r; im.onerror = r; })))).then(() => {
        try { w.focus(); w.print(); } catch { /* blocked */ }
        setTimeout(() => { frame.remove(); resolve({ ok: true, fallback: true }); }, 500);
      });
    };
    document.body.appendChild(frame);
  });
}

/** The font size control: [−] 12px [+], the value centred between the buttons. */
function FontSize({ value, onChange, s }) {
  return (
    <span className="guide-font" role="group" aria-label={s.font} title={s.font}>
      <button type="button" className="step-btn guide-font-btn" aria-label={s.smaller} title={s.smaller} disabled={value <= FONT_MIN} onClick={() => onChange(value - 1)} data-testid="guide-font-minus">−</button>
      <span className="guide-font-val" aria-live="polite" data-testid="guide-font-value">{value}px</span>
      <button type="button" className="step-btn guide-font-btn" aria-label={s.larger} title={s.larger} disabled={value >= FONT_MAX} onClick={() => onChange(value + 1)} data-testid="guide-font-plus">+</button>
    </span>
  );
}

function TocNode({ node, depth, current, path, open, onToggle, onGo, num }) {
  const hasKids = node.children && node.children.length > 0 && depth < 2;
  const isOpen = depth === 0 ? open.has(node.id) || path.has(node.id) : true;
  const on = node.id === current;
  const inPath = !on && path.has(node.id);
  return (
    <li className={`guide-toc-item d${depth}`}>
      <div className={`guide-toc-row ${on ? 'on' : ''} ${inPath ? 'in' : ''}`} data-toc={node.id} style={{ paddingLeft: 6 + depth * 14 }}>
        {depth === 0
          ? <button type="button" className="guide-toc-tw" tabIndex={-1} aria-label={isOpen ? 'collapse' : 'expand'} onClick={() => onToggle(node.id)} disabled={!hasKids}><Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={12} /></button>
          : <span className="guide-toc-dot" />}
        <button type="button" className="guide-toc-link" title={node.text} onClick={() => onGo(node.id)} aria-current={on ? 'location' : undefined}>
          {num && <span className="guide-toc-num">{num}</span>}<span className="guide-toc-text">{node.text}</span>
        </button>
      </div>
      {hasKids && isOpen && (
        <ul>{node.children.map((c, i) => <TocNode key={c.id} node={c} depth={depth + 1} current={current} path={path} open={open} onToggle={onToggle} onGo={onGo} num={depth === 0 && num ? `${num}${i + 1}` : null} />)}</ul>
      )}
    </li>
  );
}

/**
 * The manual itself (toolbar, TOC, content). chrome: 'window' (a whole child
 * window / browser window: drag region, resize grip) or 'float' (in page).
 */
export function GuideView({ initialLang, initialDoc = 'manual', initialSection = null, onClose, chrome = 'window', headProps = {} }) {
  useContentCss();
  const [lang, setLang] = useState(GUIDE_LANGS.includes(initialLang) ? initialLang : (getLanguage() === 'en' ? 'en' : 'ko'));
  const [doc, setDoc] = useState(initialDoc === 'tutorial' ? 'tutorial' : 'manual');
  const [font, setFontRaw] = useState(() => clampFont(read(FONT_KEY, FONT_DEFAULT)));
  const [scope, setScopeRaw] = useState(() => (read(SCOPE_KEY, 'all') === 'chapter' ? 'chapter' : 'all'));
  const [current, setCurrent] = useState(null);
  const [open, setOpen] = useState(() => new Set());
  const [printing, setPrinting] = useState(false);
  const content = useRef(null);
  const tocBox = useRef(null);
  const tops = useRef([]);
  const s = L[lang];
  const manual = useMemo(() => guideDoc(doc, lang), [doc, lang]);
  const setFont = (v) => { const n = clampFont(v); setFontRaw(n); write(FONT_KEY, n); };
  const setScope = (v) => { setScopeRaw(v); write(SCOPE_KEY, v); };

  // Heading positions (after a render, a font change or a resize).
  const measure = useCallback(() => {
    const box = content.current;
    if (!box) return;
    const list = [];
    const base = box.getBoundingClientRect().top - box.scrollTop;
    for (const el of box.querySelectorAll('h1[id], h2[id], h3[id]')) list.push({ id: el.id, top: el.getBoundingClientRect().top - base });
    tops.current = list;
  }, []);
  const spy = useCallback(() => {
    const box = content.current;
    if (!box) return;
    const id = box.scrollTop + box.clientHeight >= box.scrollHeight - 2 && tops.current.length ? tops.current[tops.current.length - 1].id : currentHeading(tops.current, box.scrollTop);
    setCurrent((c) => (c === id ? c : id));
  }, []);
  const goTo = useCallback((id, smooth = true) => {
    const box = content.current;
    const el = box && id ? box.querySelector(`[id="${CSS.escape(id)}"]`) : null;
    if (!el) return;
    const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 8;
    box.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
    setCurrent(id);
  }, []);

  // Where the reader was (per document and language), or the asked-for section.
  const restored = useRef(false);
  useLayoutEffect(() => {
    measure();
    const at = restored.current ? null : (initialSection || (read(AT_KEY, {})[`${doc}:${lang}`]));
    restored.current = true;
    if (at) goTo(at, false); else if (content.current) { content.current.scrollTop = 0; spy(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manual]);
  useEffect(() => { measure(); spy(); }, [font, measure, spy]);
  useEffect(() => {
    const box = content.current;
    if (!box || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => { measure(); spy(); });
    ro.observe(box);
    // Images change the heights when they load.
    const onLoad = () => { measure(); spy(); };
    box.addEventListener('load', onLoad, true);
    return () => { ro.disconnect(); box.removeEventListener('load', onLoad, true); };
  }, [measure, spy]);
  useEffect(() => {
    if (!current) return;
    const at = read(AT_KEY, {});
    at[`${doc}:${lang}`] = current;
    write(AT_KEY, at);
    const row = tocBox.current && tocBox.current.querySelector(`[data-toc="${CSS.escape(current)}"]`);
    if (row && row.scrollIntoViewIfNeeded) row.scrollIntoViewIfNeeded(false); else if (row) row.scrollIntoView({ block: 'nearest' });
  }, [current, doc, lang]);

  // The chapter (and section) the current heading belongs to.
  const chapterOf = (id) => manual.chapters.find((c) => c.id === id || c.headings.some((h) => h.id === id)) || manual.chapters[0];
  const curChapter = current ? chapterOf(current) : manual.chapters[0];
  const path = useMemo(() => {
    const p = new Set();
    if (!current || !curChapter) return p;
    p.add(curChapter.id);
    let last2 = null;
    for (const h of curChapter.headings) {
      if (h.level === 2) last2 = h.id;
      if (h.id === current) { if (last2) p.add(last2); break; }
    }
    return p;
  }, [current, curChapter]);
  const toggle = (id) => setOpen((o) => { const n = new Set(o); if (n.has(id) || path.has(id)) n.delete(id); else n.add(id); return n; });

  const print = useCallback(async () => {
    if (printing) return;
    setPrinting(true);
    try {
      const chapters = scope === 'chapter' && curChapter ? [curChapter] : manual.chapters;
      const name = GUIDE_DOCS.find((d) => d.id === doc);
      const title = `MySimulationMath — ${scope === 'chapter' && curChapter ? curChapter.title : (lang === 'en' ? name.en : name.ko)}`;
      await printChapters(chapters, { title, lang, fontSize: font });
    } finally { setPrinting(false); }
  }, [printing, scope, curChapter, manual, doc, lang, font]);

  // Keys: Ctrl+P print, Ctrl+= / Ctrl+- font size, Esc close.
  useEffect(() => {
    const onKey = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === 'p' || e.key === 'P')) { e.preventDefault(); e.stopPropagation(); print(); }
      else if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); setFont(font + 1); }
      else if (mod && e.key === '-') { e.preventDefault(); setFont(font - 1); }
      else if (e.key === 'Escape' && onClose && !document.querySelector('.iselect-pop')) { e.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const onContentClick = (e) => {
    const a = e.target.closest && e.target.closest('a[data-internal]');
    if (a) { e.preventDefault(); goTo(a.getAttribute('href').slice(1)); }
  };
  const runTour = () => { postGuide('msm-tutorial-start', { index: 0 }); if (chrome === 'float' && onClose) onClose(); };
  const drag = chrome === 'window' && isDesktop ? { 'data-tauri-drag-region': true } : {};

  return (
    <div className={`guide-root guide-${chrome}`} data-testid="guide-window" lang={lang}>
      <div className="guide-bar" {...drag} {...headProps}>
        <span className="guide-title" {...drag}><Icon name="book" size={16} />{s.title}</span>
        <span className="guide-sep" />
        <IconSelect value={doc} width={150} ariaLabel={s.doc} title={s.doc} icon="book" onChange={(v) => setDoc(v)}
          options={GUIDE_DOCS.map((d) => ({ value: d.id, label: lang === 'en' ? d.en : d.ko, icon: d.icon }))} />
        <IconSelect value={lang} width={120} ariaLabel={s.lang} title={s.lang} onChange={(v) => setLang(v)}
          options={GUIDE_LANGS.map((l) => ({ value: l, label: L[l][l], iconNode: <LangFlag lang={l} width={20} height={14} /> }))} />
        <span className="guide-sep" />
        <FontSize value={font} onChange={setFont} s={s} />
        <span className="guide-sep" />
        <IconSelect value={scope} width={130} ariaLabel={s.printScope} title={s.printScope} onChange={setScope}
          options={[{ value: 'all', label: s.printAll, icon: 'book' }, { value: 'chapter', label: s.printChapter, icon: 'file' }]} />
        <button type="button" className="vbtn" title={s.printTip} onClick={print} disabled={printing} data-testid="guide-print"><Icon name="print" size={15} /><span>{s.print}</span></button>
        <button type="button" className="vbtn" title={s.tour} onClick={runTour} data-testid="guide-tour"><Icon name="graduation" size={15} /><span>{s.tour}</span></button>
        <span className="guide-grow" {...drag} />
        {onClose && <CloseButton className="guide-x" title={s.close} aria-label={s.close} onClick={onClose} size={15} data-testid="guide-close" />}
      </div>
      <div className="guide-main">
        <nav className="guide-toc" ref={tocBox} aria-label={s.contents} data-testid="guide-toc">
          <div className="guide-toc-head"><Icon name="list" size={13} />{s.contents}</div>
          <ul>
            {manual.toc.map((node, i) => (
              <TocNode key={node.id} node={node} depth={0} current={current} path={path} open={open} onToggle={toggle} onGo={(id) => goTo(id)} num={manual.toc.length > 1 ? `${i + 1}.` : null} />
            ))}
          </ul>
        </nav>
        <div className="guide-content" ref={content} onScroll={spy} onClick={onContentClick} data-testid="guide-content">
          <article className="guide-doc" style={{ fontSize: font }}>
            {manual.chapters.map((c) => <section key={`${doc}:${lang}:${c.id}`} className="guide-chapter" data-chapter={c.id} dangerouslySetInnerHTML={{ __html: c.html }} />)}
          </article>
        </div>
      </div>
      {chrome === 'window' && isDesktop && <span className="guide-grip"><ResizeGrip /></span>}
    </div>
  );
}

// ── The child window / browser window page ───────────────
const GEO_KEY = 'msm.guide.window';

async function rememberGeometry() {
  if (!isDesktop) {
    const save = () => write(GEO_KEY, { x: window.screenX, y: window.screenY, w: window.outerWidth, h: window.outerHeight });
    window.addEventListener('resize', save);
    window.addEventListener('beforeunload', save);
    return () => { window.removeEventListener('resize', save); window.removeEventListener('beforeunload', save); };
  }
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const { LogicalPosition, LogicalSize } = await import('@tauri-apps/api/dpi');
  const win = getCurrentWindow();
  const g = read(GEO_KEY, null);
  if (g && Number.isFinite(g.x) && Number.isFinite(g.y)) {
    try {
      if (g.w > 300 && g.h > 200) await win.setSize(new LogicalSize(Math.round(g.w), Math.round(g.h)));
      await win.setPosition(new LogicalPosition(Math.round(g.x), Math.round(g.y)));
    } catch { /* keep the centred place */ }
  }
  let timer = null;
  const save = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        const [sf, pos, size] = await Promise.all([win.scaleFactor(), win.outerPosition(), win.innerSize()]);
        write(GEO_KEY, { x: pos.x / sf, y: pos.y / sf, w: size.width / sf, h: size.height / sf });
      } catch { /* closing */ }
    }, 250);
  };
  const offs = await Promise.all([win.onMoved(save), win.onResized(save)]);
  return () => offs.forEach((f) => f());
}

/** Geometry for the next open: { width, height } (and x / y for the web). */
export function guideGeometry() {
  const g = read(GEO_KEY, null) || {};
  return { width: g.w > 300 ? Math.round(g.w) : 1180, height: g.h > 200 ? Math.round(g.h) : 800, x: g.x, y: g.y };
}

function useLookFollow() {
  useEffect(() => {
    const offs = [
      onGuide('msm-look', (look) => applyLook(look)),
    ];
    // The settings window's previews and saves (desktop broadcasts).
    if (isDesktop) {
      const add = (p) => p.then((u) => offs.push(u)).catch(() => {});
      add(onBroadcast('msm-settings-preview', (p) => { if (p && !p.revert) { if (p.customThemes) setCustomThemes(p.customThemes); if (p.theme) applyTheme(p.theme); } }));
      add(onBroadcast('msm-settings-saved', (next) => { if (next) { setCustomThemes(next.customThemes || []); applyTheme(next.theme); } }));
    }
    return () => offs.forEach((f) => f && f());
  }, []);
}

export function GuidePage() {
  const route = popupRoute() || { kind: 'guide', id: '' };
  const q = new URLSearchParams((window.location.hash.split('?')[1]) || '');
  const [payload, setPayload] = useState(() => (isDesktop ? null : { lang: q.get('lang'), doc: q.get('doc'), section: q.get('section') }));
  useLookFollow();
  useEffect(() => {
    document.documentElement.classList.add('popup-window', 'guide-page');
    document.title = 'MySimulationMath';
    let off = null;
    rememberGeometry().then((f) => { off = f; }).catch(() => {});
    if (isDesktop) {
      receivePayload(route.id, (p) => {
        const look = (p && p.look) || storedLook();
        if (p && p.customThemes) setCustomThemes(p.customThemes);
        if (p && p.theme) applyTheme(p.theme);
        applyLook(look);
        setPayload(p || {});
      }).catch(() => setPayload({}));
    } else {
      const look = storedLook();
      if (look) applyLook(look);
      else loadSettings().then((st) => { if (st) { setCustomThemes(st.customThemes || []); applyTheme(st.theme || 'midnight'); } }).catch(() => applyTheme('midnight'));
    }
    return () => { if (off) off(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // The main window asks this (already open) manual to show a document / section.
  const [jump, setJump] = useState(0);
  useEffect(() => onGuide('msm-guide-goto', (p) => { if (p) { setPayload((x) => ({ ...(x || {}), ...p })); setJump((n) => n + 1); } }), []);
  useEffect(() => { if (payload) requestAnimationFrame(() => announceShown(route.id)); }, [payload, route.id]);
  if (!payload) return <div className="popup-root" />;
  const close = () => { if (isDesktop) closeSelf(); else window.close(); };
  return <GuideView key={jump} initialLang={payload.lang} initialDoc={payload.doc || 'manual'} initialSection={payload.section || null} onClose={close} chrome="window" />;
}

// ── In-page floating window (web, popups blocked) ────────
const FLOAT_KEY = 'msm.guide.float';

export function GuideFloat({ request, onClose }) {
  const [box, setBox] = useState(() => {
    const g = read(FLOAT_KEY, null);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = Math.min(vw - 20, g && g.w > 320 ? g.w : 1100);
    const h = Math.min(vh - 20, g && g.h > 240 ? g.h : vh - 80);
    const x = g && Number.isFinite(g.x) ? Math.max(0, Math.min(vw - 120, g.x)) : Math.round((vw - w) / 2);
    const y = g && Number.isFinite(g.y) ? Math.max(0, Math.min(vh - 60, g.y)) : Math.round((vh - h) / 2);
    return { x, y, w, h };
  });
  useEffect(() => { write(FLOAT_KEY, box); }, [box]);
  const dragFrom = (e, mode) => {
    if (e.button !== 0) return;
    if (mode === 'move' && e.target.closest('button, input, .iselect, .guide-font')) return;
    e.preventDefault();
    const from = { x: e.clientX, y: e.clientY, ...box };
    const move = (ev) => {
      const dx = ev.clientX - from.x;
      const dy = ev.clientY - from.y;
      if (mode === 'move') setBox((b) => ({ ...b, x: Math.max(-from.w + 120, Math.min(window.innerWidth - 120, from.x0 + dx)), y: Math.max(0, Math.min(window.innerHeight - 40, from.y0 + dy)) }));
      else setBox((b) => ({ ...b, w: Math.max(520, from.w + dx), h: Math.max(320, from.h + dy) }));
    };
    from.x0 = box.x;
    from.y0 = box.y;
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return createPortal(
    <div className="guide-float" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} role="dialog" aria-modal="false">
      <GuideView key={request.n} initialLang={request.lang} initialDoc={request.doc} initialSection={request.section} onClose={onClose} chrome="float" headProps={{ onPointerDown: (e) => dragFrom(e, 'move') }} />
      <span className="guide-float-grip" onPointerDown={(e) => dragFrom(e, 'size')} aria-hidden="true" />
    </div>,
    document.body,
  );
}

export default GuideView;
