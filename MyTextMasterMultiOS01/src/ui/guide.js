// The user's guide in a tab of the main window: contents on the left, the guide on the right, and a
// bar with the text size (− 100 % +) and the language (한국어 / English) of the guide itself.
import DOMPurify from 'dompurify';
import { escapeHtml } from './dom.js';
import { icon } from '../icons.js';
import { t } from '../i18n.js';
import { markdownToHtml } from '../domain/render.js';
import { markdownOutline } from '../domain/outline.js';
import { PREVIEW_CSS } from '../domain/previewcss.js';

export const GUIDE_SIZES = [70, 80, 90, 100, 110, 125, 140, 160, 180, 200];

/** hooks: text(language) → markdown, settings(), update(patch), dark(), openLink(href) */
export function showGuide(host, hooks) {
  const draw = () => {
    const s = hooks.settings();
    const language = s.guideLanguage === 'en' ? 'en' : 'ko';
    const markdown = hooks.text(language);
    const headings = markdownOutline(markdown).filter((h) => h.level <= 3);
    host.innerHTML = `<div class="viewer-bar guide-bar">
        ${icon('userGuide')}<b class="viewer-title">${escapeHtml(t('action.userGuide'))}</b><span class="grow"></span>
        <span class="guide-label">${icon('font')}<span>${escapeHtml(t('guide.textSize'))}</span></span>
        <span class="stepper"><button class="stepper-button" data-guide="smaller" title="${escapeHtml(t('guide.smaller'))}" aria-label="${escapeHtml(t('guide.smaller'))}">${icon('minus')}</button><span class="stepper-value guide-size">${s.guideSize}%</span><button class="stepper-button" data-guide="larger" title="${escapeHtml(t('guide.larger'))}" aria-label="${escapeHtml(t('guide.larger'))}">${icon('plus')}</button></span>
        <button class="small-button" data-guide="reset" title="${escapeHtml(t('guide.reset'))}">${icon('zoomReset')}<span>100%</span></button>
        <span class="tool-sep"></span>
        <span class="guide-label">${icon('globe')}<span>${escapeHtml(t('guide.language'))}</span></span>
        <span class="segmented"><button class="segment ${language === 'ko' ? 'active' : ''}" data-guide-lang="ko">한국어</button><button class="segment ${language === 'en' ? 'active' : ''}" data-guide-lang="en">English</button></span>
      </div>
      <div class="guide-body">
        <nav class="guide-toc" aria-label="${escapeHtml(t('guide.contents'))}"><h3>${icon('outline')}<span>${escapeHtml(t('guide.contents'))}</span></h3>${headings.map((h, i) => `<button class="outline-item level-${h.level}" style="--depth:${h.level - 1}" data-guide-heading="${i}">${escapeHtml(h.text)}</button>`).join('')}</nav>
        <iframe class="guide-frame" title="${escapeHtml(t('action.userGuide'))}" sandbox="allow-same-origin"></iframe>
      </div>`;
    const frame = host.querySelector('.guide-frame');
    // The frame first loads its empty initial page: only the guide itself (about:srcdoc) is wired.
    const onLoad = () => {
      const doc = frame.contentDocument;
      if (!doc?.body || doc.URL !== 'about:srcdoc') return;
      frame.removeEventListener('load', onLoad);
      doc.body.style.fontSize = `${hooks.settings().guideSize}%`;
      doc.addEventListener('click', (event) => {
        const link = event.target.closest('a[href]');
        if (!link) return;
        event.preventDefault();
        const href = link.getAttribute('href');
        if (href.startsWith('#')) doc.getElementById(decodeURIComponent(href.slice(1)))?.scrollIntoView();
        else hooks.openLink(href);
      });
    };
    frame.addEventListener('load', onLoad);
    frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><style>${PREVIEW_CSS} body { font-size: ${s.guideSize}%; } .markdown-body { font-size: 1em; }</style></head><body class="preview-body style-github${hooks.dark() ? ' dark' : ''}"><article class="markdown-body">${DOMPurify.sanitize(markdownToHtml(markdown, { lines: false }))}</article></body></html>`;
  };
  host.onclick = (event) => {
    const s = hooks.settings();
    const action = event.target.closest('[data-guide]')?.dataset.guide;
    const lang = event.target.closest('[data-guide-lang]')?.dataset.guideLang;
    const heading = event.target.closest('[data-guide-heading]')?.dataset.guideHeading;
    if (action) {
      const i = GUIDE_SIZES.indexOf(s.guideSize);
      const size = action === 'reset' ? 100 : GUIDE_SIZES[Math.max(0, Math.min(GUIDE_SIZES.length - 1, (i < 0 ? 3 : i) + (action === 'larger' ? 1 : -1)))];
      hooks.update({ guideSize: size });
      const body = host.querySelector('.guide-frame')?.contentDocument?.body;
      if (body) body.style.fontSize = `${size}%`;
      host.querySelector('.guide-size').textContent = `${size}%`;
    } else if (lang) {
      hooks.update({ guideLanguage: lang });
      draw();
    } else if (heading !== undefined) {
      host.querySelector('.guide-frame')?.contentDocument?.querySelectorAll('h1, h2, h3')[Number(heading)]?.scrollIntoView({ block: 'start' });
    }
  };
  draw();
  return { redraw: draw };
}
