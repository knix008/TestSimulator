// Live HTML preview next to the editor (Ctrl+Shift+M on an HTML document):
// the document is rendered in a sandboxed <iframe> (scripts run in their own
// origin — they cannot reach the editor) a moment after every change.
// Resources the page refers to by a local path — images, stylesheets, scripts
// — are pulled in through the backend (an image as a data URL, a stylesheet
// / script inlined), so a page on disk previews as it would in a browser.
// The scroll position survives a re-render: a small script in the page
// reports it (postMessage) and the next render starts there.
import React, { useEffect, useRef, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { call } from '../lib/backend';
import { Icon } from './Icons';
import { isRemote, joinPath, resolveImageSrc } from '../lib/images';

const RENDER_DELAY = 350;   // ms after the last change

// Rewrites local references in the parsed document; returns when every one is resolved (failures are left as they are).
async function inlineResources(dom, base) {
  const jobs = [];
  const local = (v) => v && !isRemote(v) && !/^(#|javascript:|mailto:|about:)/i.test(v);
  for (const el of dom.querySelectorAll('img[src], source[src], video[src], audio[src], input[type=image][src]')) {
    const src = el.getAttribute('src');
    if (local(src)) jobs.push(resolveImageSrc(src, base).then((u) => el.setAttribute('src', u)).catch(() => {}));
  }
  for (const el of dom.querySelectorAll('link[rel~=stylesheet][href]')) {
    const href = el.getAttribute('href');
    if (!local(href)) continue;
    jobs.push(call('file.read', { path: joinPath(base, href.split(/[?#]/)[0]) }).then((r) => {
      const style = dom.createElement('style');
      style.textContent = r.text;
      el.replaceWith(style);
    }).catch(() => {}));
  }
  for (const el of dom.querySelectorAll('script[src]')) {
    const src = el.getAttribute('src');
    if (!local(src)) continue;
    jobs.push(call('file.read', { path: joinPath(base, src.split(/[?#]/)[0]) }).then((r) => {
      el.removeAttribute('src');
      el.textContent = r.text;
    }).catch(() => {}));
  }
  await Promise.all(jobs);
}

async function parseHtml(text, base) {
  const dom = new DOMParser().parseFromString(text, 'text/html');
  if (base) await inlineResources(dom, base);
  return dom;
}
function serializeHtml(text, dom) {
  const doctype = /^\s*<!doctype[^>]*>/i.exec(text);
  return (doctype ? doctype[0] : '<!DOCTYPE html>') + '\n' + dom.documentElement.outerHTML;
}

// The page with its local resources inlined (no live-preview scroll script) — used for printing.
export async function buildHtmlDocument(text, base) {
  return serializeHtml(text, await parseHtml(text, base));
}

// The page with its local resources inlined and the scroll-keeping script appended.
export async function buildPreviewHtml(text, base, scrollY = 0) {
  const dom = await parseHtml(text, base);
  const keep = dom.createElement('script');
  keep.textContent = `(function(){var y=${Math.max(0, Math.round(scrollY))};if(y)requestAnimationFrame(function(){scrollTo(0,y)});addEventListener('scroll',function(){try{parent.postMessage({medScroll:scrollY},'*')}catch(e){}},{passive:true});})();`;
  (dom.body || dom.documentElement).appendChild(keep);
  return serializeHtml(text, dom);
}

export function HtmlPreview({ view, docVersion, base, name, width }) {
  useLanguage();
  const frameRef = useRef(null);
  const [html, setHtml] = useState('');
  const scrollRef = useRef(0);
  const timer = useRef(null);
  const seq = useRef(0);

  // Where the page is scrolled to (reported by the script appended to it).
  useEffect(() => {
    const onMsg = (e) => { if (frameRef.current && e.source === frameRef.current.contentWindow && e.data && typeof e.data.medScroll === 'number') scrollRef.current = e.data.medScroll; };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  // Re-render a moment after the document changed (or another document became active).
  useEffect(() => {
    if (!view) return undefined;
    clearTimeout(timer.current);
    const my = ++seq.current;
    timer.current = setTimeout(async () => {
      const out = await buildPreviewHtml(view.state.doc.toString(), base, scrollRef.current);
      if (my === seq.current) setHtml(out);
    }, html ? RENDER_DELAY : 0);
    return () => clearTimeout(timer.current);
  }, [view, docVersion, base]);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="html-preview" style={{ width }}>
      <iframe ref={frameRef} title={name || 'HTML'} sandbox="allow-scripts allow-forms allow-popups allow-modals" srcDoc={html} />
    </div>
  );
}

// The slim bar above an HTML document: the preview toggle.
export function HtmlBar({ onAction, preview }) {
  useLanguage();
  return (
    <div className="mdbar htmlbar">
      <span className="muted small htmlbar-hint">{t('html_preview_hint')}</span>
      <span className="spacer" />
      <button className={`md-btn md-toggle ${preview ? 'on' : ''}`} title={`${t('html_preview')} (Ctrl+Shift+M)`} onMouseDown={(e) => e.preventDefault()} onClick={() => onAction('toggle:htmlPreview')}>
        <Icon name="eye" size={16} /><span>{t('md_preview')}</span>
      </button>
    </div>
  );
}

export default HtmlPreview;
