// Two presentation modes over a rendered note (the Rust renderer's HTML):
//   startSlides(html, ctx)              — Obsidian Slides: one slide per top-level <hr> section, full window.
//   startReadingPresentation(html, ctx) — Markdific's presentation mode: the whole note full screen for
//                                          reading / teleprompting, with live text size, spacing, width,
//                                          contrast, theme and auto-scroll controls (prefs: ctx.loadPrefs/savePrefs).
// Both return stop() (stop.ready resolves when the content is rendered) and call ctx.onExit() once when closed.
import './presentation.css';
import { registerTexts, t } from '../i18n.js';
import { icon } from '../icons.js';
import { escapeHtml } from '../ui/dom.js';
import TEXTS from './texts.js';
import { destroyPreview, renderPreview } from './preview.js';
import { normalizeReadingPrefs, READING_LIMITS, READING_THEMES, splitSlides } from './slides.js';

registerTexts(TEXTS);

const SLIDE_W = 1280;
const SLIDE_H = 720;

const btn = (action, title, iconName, label = '') => `<button type="button" class="pres-btn" data-pres="${action}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">${icon(iconName)}${label ? `<span>${escapeHtml(label)}</span>` : ''}</button>`;

function toggleFullscreen(el) {
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  else el.requestFullscreen?.().catch(() => {});
}

const isInteractive = (target) => !!target.closest('a, button, input, select, textarea, label, summary, audio, video, iframe, .md-btn, .md-diagram-bar, .code-block-tools, .callout-title[role="button"], .markdown-embed-title');

function exiter(ctx, cleanup) {
  let done = false;
  return () => {
    if (done) return;
    done = true;
    cleanup();
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    ctx.onExit?.();
  };
}

// ───────────────────────── slides

export function startSlides(html, ctx = {}) {
  const sections = splitSlides(html);
  const root = document.createElement('div');
  root.className = 'pres-slides';
  root.tabIndex = -1;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  if (ctx.readingTheme) root.dataset.readingTheme = ctx.readingTheme;
  root.innerHTML = `
    <div class="pres-stage"><div class="pres-frame"></div></div>
    <div class="pres-progress"><div class="pres-progress-bar"></div></div>
    <div class="pres-controls">
      ${btn('prev', t('render.slidesPrev'), 'chevronLeft')}
      <span class="pres-counter" aria-live="polite"></span>
      ${btn('next', t('render.slidesNext'), 'chevronRight')}
      <span class="pres-sep"></span>
      ${btn('fullscreen', t('render.slidesFullscreen'), 'fullscreen')}
      ${btn('exit', t('render.slidesExit'), 'close')}
    </div>`;
  const frame = root.querySelector('.pres-frame');
  const stage = root.querySelector('.pres-stage');
  const slides = (sections.length ? sections : ['']).map((section) => {
    const slide = document.createElement('section');
    slide.className = 'pres-slide';
    slide.hidden = true;
    slide.innerHTML = '<div class="pres-slide-inner markdown-rendered"></div>';
    if (ctx.readingTheme) slide.firstElementChild.dataset.readingTheme = ctx.readingTheme;
    if (ctx.readingFont) slide.firstElementChild.dataset.readingFont = ctx.readingFont;
    frame.append(slide);
    return { slide, inner: slide.firstElementChild, html: section };
  });
  let index = Math.min(Math.max(0, Number(ctx.start) || 0), slides.length - 1);
  const controller = new AbortController();
  const { signal } = controller;

  const fitStage = () => {
    const scale = Math.min(stage.clientWidth / SLIDE_W, stage.clientHeight / SLIDE_H) || 1;
    frame.style.transform = `translate(-50%, -50%) scale(${scale})`;
  };
  const fitContent = (s) => {
    // Content taller than the slide shrinks (CSS zoom, down to 60 %); what still does not fit scrolls.
    s.inner.style.zoom = '';
    const available = SLIDE_H - 2 * 56;
    const height = s.inner.scrollHeight;
    if (height > available) s.inner.style.zoom = String(Math.max(0.6, available / height));
    s.slide.classList.toggle('is-short', height < available * 0.55);
  };
  const show = (i) => {
    index = Math.min(Math.max(0, i), slides.length - 1);
    slides.forEach((s, k) => { s.slide.hidden = k !== index; });
    root.querySelector('.pres-counter').textContent = sections.length ? t('render.slidesCounter', { n: index + 1, total: slides.length }) : t('render.slidesEmpty');
    root.querySelector('.pres-progress-bar').style.width = `${((index + 1) / slides.length) * 100}%`;
    root.querySelector('[data-pres="prev"]').disabled = index === 0;
    root.querySelector('[data-pres="next"]').disabled = index === slides.length - 1;
    requestAnimationFrame(() => fitContent(slides[index]));
    ctx.onSlide?.(index, slides.length);
  };

  const stop = exiter(ctx, () => {
    controller.abort();
    for (const s of slides) destroyPreview(s.inner);
    root.remove();
  });

  root.addEventListener('click', (event) => {
    const action = event.target.closest('[data-pres]')?.dataset.pres;
    if (action === 'prev') return show(index - 1);
    if (action === 'next') return show(index + 1);
    if (action === 'fullscreen') return toggleFullscreen(root);
    if (action === 'exit') return stop();
    if (event.target.closest('.pres-controls') || isInteractive(event.target)) return undefined;
    return show(index + (event.clientX < window.innerWidth * 0.25 ? -1 : 1));
  }, { signal });
  window.addEventListener('keydown', (event) => {
    if (event.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    const key = event.key;
    let handled = true;
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'n', 'N'].includes(key)) show(index + (event.shiftKey && key === ' ' ? -1 : 1));
    else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'p', 'P'].includes(key)) show(index - 1);
    else if (key === 'Home') show(0);
    else if (key === 'End') show(slides.length - 1);
    else if (key === 'Escape') { if (!document.fullscreenElement) stop(); }
    else if ((key === 'f' || key === 'F') && !event.ctrlKey && !event.metaKey && !event.altKey) toggleFullscreen(root);
    else handled = false;
    if (handled) { event.preventDefault(); event.stopPropagation(); }
  }, { capture: true, signal });
  window.addEventListener('resize', () => { fitStage(); fitContent(slides[index]); }, { signal });
  document.addEventListener('fullscreenchange', () => requestAnimationFrame(() => { fitStage(); fitContent(slides[index]); }), { signal });
  let idle = 0;
  root.addEventListener('mousemove', () => {
    root.classList.remove('is-idle');
    clearTimeout(idle);
    idle = setTimeout(() => root.classList.add('is-idle'), 2500);
  }, { signal });

  document.body.append(root);
  root.focus({ preventScroll: true });
  fitStage();
  show(index);
  const sub = { ...ctx, depth: 0, settings: { ...(ctx.settings ?? {}), hoverNeedsMod: true } };
  stop.ready = Promise.all(slides.map((s) => renderPreview(s.inner, s.html, { ...sub, scroller: s.slide }))).then(() => {
    if (!signal.aborted) fitContent(slides[index]);
  });
  stop.goTo = (i) => show(i);
  stop.count = slides.length;
  return stop;
}

// ───────────────────────── reading presentation (teleprompter)

const themeLabel = (id) => ({
  app: t('render.themeApp'), original: t('render.themeOriginal'), dark: t('render.themeDark'), creamy: t('render.themeCreamy'), solarized: t('render.themeSolarized'), contrast: t('render.themeContrast'),
})[id] ?? id;

export function startReadingPresentation(html, ctx = {}) {
  const root = document.createElement('div');
  root.className = 'pres-reading';
  root.tabIndex = -1;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.innerHTML = `
    <div class="pres-reading-scroll"><article class="pres-reading-doc markdown-rendered"></article></div>
    <div class="pres-toolbar" role="toolbar">
      <span class="pres-group" title="${escapeHtml(t('render.readingTextSize'))}">${btn('font-', t('render.readingTextSmaller'), 'fontDown')}<span class="pres-value" data-value="fontSize"></span>${btn('font+', t('render.readingTextLarger'), 'fontUp')}</span>
      <span class="pres-group" title="${escapeHtml(t('render.readingLineSpacing'))}">${icon('renderLineSpacing')}${btn('line-', t('render.readingLineSpacing'), 'minus')}<span class="pres-value" data-value="lineHeight"></span>${btn('line+', t('render.readingLineSpacing'), 'plus')}</span>
      <span class="pres-group" title="${escapeHtml(t('render.readingWidth'))}">${icon('renderWidth')}${btn('width-', t('render.readingNarrower'), 'minus')}<span class="pres-value" data-value="width"></span>${btn('width+', t('render.readingWider'), 'plus')}</span>
      <span class="pres-group">${btn('contrast', t('render.readingContrast'), 'renderContrast')}<span class="pres-value" data-value="contrast"></span></span>
      <label class="pres-group" title="${escapeHtml(t('render.readingTheme'))}">${icon('palette')}<select class="pres-select" data-pres-theme aria-label="${escapeHtml(t('render.readingTheme'))}">${READING_THEMES.map((id) => `<option value="${id}">${escapeHtml(themeLabel(id))}</option>`).join('')}</select></label>
      <span class="pres-group" title="${escapeHtml(t('render.readingAutoScroll'))}">${btn('scroll', t('render.readingAutoScroll'), 'play')}${btn('speed-', t('render.readingSpeed'), 'speedDown')}<span class="pres-value" data-value="speed"></span>${btn('speed+', t('render.readingSpeed'), 'speedUp')}</span>
      <span class="pres-sep"></span>
      ${btn('fullscreen', t('render.slidesFullscreen'), 'fullscreen')}
      ${btn('exit', t('render.readingExit'), 'close')}
    </div>`;
  const scroll = root.querySelector('.pres-reading-scroll');
  const doc = root.querySelector('.pres-reading-doc');
  const toolbar = root.querySelector('.pres-toolbar');
  const controller = new AbortController();
  const { signal } = controller;
  let prefs = normalizeReadingPrefs(null);
  let scrolling = false;
  let frame = 0;
  let last = 0;
  let carry = 0;

  const apply = () => {
    root.style.setProperty('--pres-font-size', `${prefs.fontSize}px`);
    root.style.setProperty('--pres-line-height', String(prefs.lineHeight));
    root.style.setProperty('--pres-width', `${prefs.width}px`);
    root.dataset.contrast = prefs.contrast;
    root.dataset.readingTheme = prefs.theme;
    doc.dataset.readingTheme = prefs.theme;
    if (ctx.readingFont) doc.dataset.readingFont = ctx.readingFont;
    const values = { fontSize: `${prefs.fontSize}`, lineHeight: prefs.lineHeight.toFixed(1), width: `${prefs.width}`, contrast: prefs.contrast === 'high' ? t('render.readingContrastHigh') : t('render.readingContrastNormal'), speed: `${prefs.speed}` };
    for (const el of root.querySelectorAll('[data-value]')) el.textContent = values[el.dataset.value];
    root.querySelector('[data-pres-theme]').value = prefs.theme;
    root.querySelector('[data-pres="contrast"]').classList.toggle('is-on', prefs.contrast === 'high');
  };
  const change = (patch) => {
    prefs = normalizeReadingPrefs({ ...prefs, ...patch });
    apply();
    try { ctx.savePrefs?.(prefs); } catch { /* not saved */ }
  };
  const setScrolling = (on) => {
    scrolling = on;
    const b = root.querySelector('[data-pres="scroll"]');
    b.innerHTML = icon(on ? 'pause' : 'play');
    b.classList.toggle('is-on', on);
    cancelAnimationFrame(frame);
    if (!on) return;
    last = performance.now();
    carry = 0;
    const step = (now) => {
      if (!scrolling) return;
      carry += (prefs.speed * (now - last)) / 1000;
      last = now;
      const px = Math.floor(carry);
      if (px) { carry -= px; scroll.scrollTop += px; }
      if (scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 1) { setScrolling(false); return; }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  };

  const stop = exiter(ctx, () => {
    scrolling = false;
    cancelAnimationFrame(frame);
    controller.abort();
    destroyPreview(doc);
    root.remove();
  });

  const L = READING_LIMITS;
  root.addEventListener('click', (event) => {
    const action = event.target.closest('[data-pres]')?.dataset.pres;
    if (!action) return;
    const map = {
      'font-': () => change({ fontSize: prefs.fontSize - 2 }),
      'font+': () => change({ fontSize: prefs.fontSize + 2 }),
      'line-': () => change({ lineHeight: prefs.lineHeight - 0.1 }),
      'line+': () => change({ lineHeight: prefs.lineHeight + 0.1 }),
      'width-': () => change({ width: Math.max(L.width[0], prefs.width - 80) }),
      'width+': () => change({ width: Math.min(L.width[1], prefs.width + 80) }),
      contrast: () => change({ contrast: prefs.contrast === 'high' ? 'normal' : 'high' }),
      scroll: () => setScrolling(!scrolling),
      'speed-': () => change({ speed: Math.round(prefs.speed / 1.25) }),
      'speed+': () => change({ speed: Math.round(prefs.speed * 1.25) + 1 }),
      fullscreen: () => toggleFullscreen(root),
      exit: () => stop(),
    };
    map[action]?.();
  }, { signal });
  root.querySelector('[data-pres-theme]').addEventListener('change', (event) => change({ theme: event.target.value }), { signal });
  window.addEventListener('keydown', (event) => {
    if (event.target.closest?.('input, textarea, [contenteditable="true"]')) return;
    if (event.target.closest?.('select') && event.key !== 'Escape') return;
    let handled = true;
    if (event.key === 'Escape') { if (!document.fullscreenElement) stop(); }
    else if (event.key === ' ') setScrolling(!scrolling);
    else if ((event.key === '+' || event.key === '=') && !event.ctrlKey) change({ fontSize: prefs.fontSize + 2 });
    else if (event.key === '-' && !event.ctrlKey) change({ fontSize: prefs.fontSize - 2 });
    else if ((event.key === 'f' || event.key === 'F') && !event.ctrlKey && !event.metaKey && !event.altKey) toggleFullscreen(root);
    else if (event.key === 'ArrowUp' && scrolling) change({ speed: Math.round(prefs.speed * 1.25) + 1 });
    else if (event.key === 'ArrowDown' && scrolling) change({ speed: Math.round(prefs.speed / 1.25) });
    else handled = false;
    if (handled) { event.preventDefault(); event.stopPropagation(); }
  }, { capture: true, signal });
  // The toolbar hides when the mouse rests (and while auto-scrolling), and comes back on movement.
  let idle = 0;
  const wake = () => {
    root.classList.remove('is-idle');
    clearTimeout(idle);
    idle = setTimeout(() => { if (!toolbar.matches(':hover, :focus-within')) root.classList.add('is-idle'); }, 2200);
  };
  root.addEventListener('mousemove', wake, { signal });
  root.addEventListener('keydown', wake, { signal });
  scroll.addEventListener('wheel', () => { if (scrolling) last = performance.now(); }, { signal, passive: true });

  apply();
  document.body.append(root);
  root.focus({ preventScroll: true });
  wake();
  stop.ready = (async () => {
    try {
      const stored = await ctx.loadPrefs?.();
      if (!signal.aborted && stored) { prefs = normalizeReadingPrefs(stored); apply(); }
    } catch { /* defaults */ }
    if (signal.aborted) return;
    await renderPreview(doc, html, { ...ctx, depth: 0, scroller: scroll });
  })();
  stop.setScrolling = setScrolling;
  return stop;
}
