// The Help window (Help › 도움말, the start page's 사용법 보기): a chapter list
// with each chapter's sections and a search box on the left, the illustrated
// chapter on the right. Opened as its own window (popup kind "help").
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { Dialog } from '../dialogs/Dialogs';
import { openExternal } from '../lib/backend';
import { helpChapters, helpChapter, helpHtml, searchHelp } from '../help';
import { Icon } from './Icons';

// Wraps every match of `word` in the article's text in <mark>.
function markMatches(root, word) {
  if (!root || !word) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const hits = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeValue.toLowerCase().includes(word)) hits.push(node);
  }
  for (const node of hits) {
    const text = node.nodeValue;
    const lower = text.toLowerCase();
    const frag = document.createDocumentFragment();
    let at = 0;
    for (let i = lower.indexOf(word); i >= 0; i = lower.indexOf(word, at)) {
      frag.append(text.slice(at, i));
      const m = document.createElement('mark');
      m.textContent = text.slice(i, i + word.length);
      frag.append(m);
      at = i + word.length;
    }
    frag.append(text.slice(at));
    node.replaceWith(frag);
  }
}

export function HelpWindow({ initialId = '', onClose }) {
  const lang = useLanguage();
  const HELP_CHAPTERS = helpChapters(lang);
  const [id, setId] = useState(() => helpChapter(lang, initialId).id);
  const [query, setQuery] = useState('');
  const article = useRef(null);
  const chapter = helpChapter(lang, id);   // the same number in the other language when the UI language changes
  const index = HELP_CHAPTERS.indexOf(chapter);
  const html = useMemo(() => helpHtml(chapter), [chapter]);
  const found = useMemo(() => searchHelp(lang, query), [lang, query]);
  const word = query.trim().toLowerCase().split(/\s+/)[0] || '';

  useLayoutEffect(() => {
    const el = article.current;
    if (!el) return;
    el.innerHTML = html;
    markMatches(el, word);
    const first = word && el.querySelector('mark');
    if (first) first.scrollIntoView({ block: 'center' });
  }, [html, word]);

  const open = (next, section = -1) => {
    setId(next);
    requestAnimationFrame(() => {
      const el = article.current;
      if (!el) return;
      const target = section >= 0 ? el.querySelector(`#help-s${section}`) : null;
      if (target) target.scrollIntoView({ block: 'start' });
      else el.scrollTop = 0;
    });
  };

  // Links inside a chapter: another chapter (NN-name.md), a section (#…), or a web page.
  const onArticleClick = (e) => {
    const a = e.target.closest('a');
    if (!a) return;
    const href = a.getAttribute('href') || '';
    e.preventDefault();
    if (/^https?:/i.test(href)) { openExternal(href); return; }
    const file = href.split('#')[0].replace(/^\.\//, '');
    if (file.endsWith('.md')) { open(helpChapter(lang, file).id); return; }
    if (href.startsWith('#')) { const el = article.current && article.current.querySelector(href); if (el) el.scrollIntoView({ block: 'start' }); }
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.altKey && e.key === 'ArrowLeft' && index > 0) { e.preventDefault(); open(HELP_CHAPTERS[index - 1].id); }
      else if (e.altKey && e.key === 'ArrowRight' && index < HELP_CHAPTERS.length - 1) { e.preventDefault(); open(HELP_CHAPTERS[index + 1].id); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, lang]);   // eslint-disable-line react-hooks/exhaustive-deps

  const list = found ? HELP_CHAPTERS.filter((c) => found.has(c.id)) : HELP_CHAPTERS;
  return (
    <Dialog embedded modal={false} kind="help" className="help-window" icon="help" title={t('help_menu')} onClose={onClose}>
      <div className="help-layout">
        <nav className="help-nav" aria-label={t('help_menu')}>
          <label className="help-search">
            <Icon name="search" size={14} />
            <input type="search" value={query} placeholder={t('help_search')} aria-label={t('help_search')} onChange={(e) => setQuery(e.target.value)} />
          </label>
          {found && <div className="help-found">{t('help_found', { n: list.length })}</div>}
          <ol className="help-chapters">
            {list.map((c) => (
              <li key={c.id} className={c.id === chapter.id ? 'on' : ''}>
                <button type="button" className="help-chapter" data-chapter={c.id} onClick={() => open(c.id)}>
                  <span>{c.title}</span>
                  {found && <small>{found.get(c.id)}</small>}
                </button>
                {c.id === chapter.id && c.sections.length > 0 && (
                  <ul className="help-sections">
                    {c.sections.map((s, i) => <li key={s}><button type="button" onClick={() => open(c.id, i)}>{s}</button></li>)}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </nav>
        <div className="help-main">
          <article className="help-article" ref={article} onClick={onArticleClick} />
          <div className="help-pager">
            <button type="button" className="btn" disabled={index <= 0} onClick={() => open(HELP_CHAPTERS[index - 1].id)}>
              ← {index > 0 ? HELP_CHAPTERS[index - 1].title : ''}
            </button>
            <span className="help-page-no">{index + 1} / {HELP_CHAPTERS.length}</span>
            <button type="button" className="btn" disabled={index >= HELP_CHAPTERS.length - 1} onClick={() => open(HELP_CHAPTERS[index + 1].id)}>
              {index < HELP_CHAPTERS.length - 1 ? HELP_CHAPTERS[index + 1].title : ''} →
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

export default HelpWindow;
