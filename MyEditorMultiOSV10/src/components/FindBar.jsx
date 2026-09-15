// Find / replace bar above the editor (Ctrl+F / Ctrl+H). Drives CodeMirror's
// search state (src/lib/editor.js › searchApi) so matches are highlighted in
// the document; Enter = next, Shift+Enter = previous, Escape = close.
import React, { useEffect, useRef, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { Icon } from './Icons';
import { searchApi } from '../lib/editor';

export function FindBar({ view, mode, initial, onClose, onModeChange, docVersion }) {
  useLanguage();
  const [q, setQ] = useState(initial || '');
  const [r, setR] = useState('');
  const [caseSensitive, setCase] = useState(false);
  const [regexp, setRegexp] = useState(false);
  const [wholeWord, setWord] = useState(false);
  const [count, setCount] = useState({ total: 0, current: 0 });
  const [invalid, setInvalid] = useState(false);
  const inputRef = useRef(null);

  // Push the query into the editor whenever anything about it changes.
  useEffect(() => {
    if (!view) return;
    let valid = true;
    if (regexp) { try { new RegExp(q); } catch { valid = false; } }
    setInvalid(!valid);
    searchApi.setQuery(view, { search: valid ? q : '', replace: r, caseSensitive, regexp, wholeWord });
    searchApi.open(view);
    setCount(searchApi.count(view));
  }, [view, q, r, caseSensitive, regexp, wholeWord, docVersion]);

  useEffect(() => { if (initial !== undefined && initial !== null && initial !== '') setQ(initial); }, [initial]);
  useEffect(() => { const el = inputRef.current; if (el) { el.focus(); el.select(); } }, [mode]);
  useEffect(() => () => { if (view) searchApi.close(view); }, [view]);

  const refresh = () => { if (view) setCount(searchApi.count(view)); };
  const next = () => { if (view && q) { searchApi.next(view); refresh(); } };
  const prev = () => { if (view && q) { searchApi.prev(view); refresh(); } };
  const replaceOne = () => { if (view && q) { searchApi.replaceNext(view); refresh(); } };
  const replaceAll = () => { if (view && q) { searchApi.replaceAll(view); refresh(); } };
  const selectAll = () => { if (view && q) { searchApi.selectAll(view); view.focus(); refresh(); } };
  const onKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); if (e.shiftKey) prev(); else next(); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };
  const onReplaceKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); if (e.ctrlKey || e.metaKey) replaceAll(); else replaceOne(); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };
  const status = !q ? '' : count.total ? (count.current ? t('match_of', { i: count.current, n: count.total }) : t('matches', { n: count.total })) : t('no_match');

  return (
    <div className={`findbar ${mode === 'replace' ? 'replace' : ''}`}>
      <button className="fb-toggle" title={mode === 'replace' ? t('find') : t('replace')} onClick={() => onModeChange(mode === 'replace' ? 'find' : 'replace')}>
        <Icon name={mode === 'replace' ? 'chevronDown' : 'chevronRight'} size={14} />
      </button>
      <div className="fb-rows">
        <div className="fb-row">
          <div className={`fb-input ${invalid ? 'invalid' : ''} ${q && !count.total && !invalid ? 'nomatch' : ''}`}>
            <input ref={inputRef} value={q} placeholder={t('find_ph')} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} spellCheck={false} />
            <span className="fb-opts">
              <button className={caseSensitive ? 'on' : ''} title={t('match_case')} onClick={() => setCase(!caseSensitive)}>Aa</button>
              <button className={wholeWord ? 'on' : ''} title={t('whole_word')} onClick={() => setWord(!wholeWord)}><u>ab</u></button>
              <button className={regexp ? 'on' : ''} title={t('regex')} onClick={() => setRegexp(!regexp)}>.*</button>
            </span>
          </div>
          <span className={`fb-count ${q && !count.total ? 'none' : ''}`}>{status}</span>
          <button className="fb-btn" title={`${t('find_prev')} (Shift+F3)`} onClick={prev} disabled={!count.total}><Icon name="arrowUp" size={14} /></button>
          <button className="fb-btn" title={`${t('find_next')} (F3)`} onClick={next} disabled={!count.total}><Icon name="arrowDown" size={14} /></button>
          <button className="fb-btn" title={t('select_all_matches')} onClick={selectAll} disabled={!count.total}><Icon name="list" size={14} /></button>
          <span className="spacer" />
          <button className="fb-btn" title={`${t('close_find')} (Esc)`} onClick={onClose}><Icon name="close" size={14} /></button>
        </div>
        {mode === 'replace' && (
          <div className="fb-row">
            <div className="fb-input">
              <input value={r} placeholder={t('replace_ph')} onChange={(e) => setR(e.target.value)} onKeyDown={onReplaceKey} spellCheck={false} />
            </div>
            <button className="fb-btn text" onClick={replaceOne} disabled={!count.total}>{t('replace_one')}</button>
            <button className="fb-btn text" onClick={replaceAll} disabled={!count.total}>{t('replace_all')}</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default FindBar;
