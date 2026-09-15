// Search section under the folder tree (Ctrl+Shift+F): finds a text in the
// open documents or in every file of the folder open in the sidebar
// (backend, core/search.js). Options like the find bar's (case, whole word, regex),
// include / exclude patterns for the folder scope, results grouped by file
// with the matching line — click one to open the file at that place.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { call } from '../lib/backend';
import { Icon } from './Icons';

const baseName = (p) => (p || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop();
const dirOf = (p) => { const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')); return i > 0 ? p.slice(0, i) : ''; };

// The line with the match highlighted (trimmed to keep the match in view).
function Line({ text, col, endCol }) {
  const from = Math.max(0, col - 1), to = Math.max(from, endCol - 1);
  let start = 0;
  if (from > 40) start = from - 30;
  const head = text.slice(start, from), hit = text.slice(from, to), tail = text.slice(to, to + 160);
  return <span className="sr-line mono">{start > 0 ? '…' : ''}{head}<mark>{hit}</mark>{tail}{to + 160 < text.length ? '…' : ''}</span>;
}

export function SearchPanel({ folder, request, searchOpen, onOpen, onClose, onError, onResizeStart }) {
  useLanguage();
  const [scope, setScope] = useState(folder ? 'folder' : 'open');   // 'open' | 'folder'
  const [q, setQ] = useState('');
  const [caseSensitive, setCase] = useState(false);
  const [wholeWord, setWord] = useState(false);
  const [regex, setRegex] = useState(false);
  const [include, setInclude] = useState('');
  const [exclude, setExclude] = useState('');
  const [result, setResult] = useState(null);   // { hits, files, matchedFiles, truncated, cancelled, error } | null
  const [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const inputRef = useRef(null);
  const seq = useRef(0);

  // Ctrl+Shift+F: focus, take the selection as the query, run.
  useEffect(() => {
    if (!request) return;
    if (request.initial) setQ(request.initial);
    if (request.scope) setScope(request.scope);
    setTimeout(() => { const el = inputRef.current; if (el) { el.focus(); el.select(); } }, 0);
    if (request.initial) setTimeout(() => run(request.initial, request.scope || scope), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);

  const run = async (query = q, sc = scope) => {
    const text = String(query || '');
    if (!text) { setResult(null); return; }
    const my = ++seq.current;
    setBusy(true);
    try {
      let r;
      if (sc === 'open') r = searchOpen({ query: text, regex, caseSensitive, wholeWord });
      else {
        if (!folder) { setResult({ hits: [], error: t('search_no_folder') }); return; }
        r = await call('search.files', { id: 1, dir: folder, query: text, regex, caseSensitive, wholeWord, include, exclude });
      }
      if (my !== seq.current) return;
      setResult(r);
      setCollapsed(new Set());
    } catch (e) {
      if (my === seq.current) { setResult({ hits: [], error: e.message }); if (onError) onError(e); }
    } finally { if (my === seq.current) setBusy(false); }
  };

  const groups = useMemo(() => {
    if (!result) return [];
    const map = new Map();
    for (const h of result.hits) { const k = h.docId != null ? `doc:${h.docId}` : h.path; if (!map.has(k)) map.set(k, { key: k, path: h.path, name: h.name || baseName(h.path), rel: h.rel, docId: h.docId, hits: [] }); map.get(k).hits.push(h); }
    return [...map.values()];
  }, [result]);

  const onKey = (e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } else if (e.key === 'Escape') { e.currentTarget.blur(); } };
  const toggle = (k) => setCollapsed((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const summary = result && !result.error ? (result.hits.length ? t('search_summary', { n: result.hits.length, files: groups.length }) : t('search_none')) + (result.truncated ? ` ${t('search_truncated')}` : '') : '';

  return (
    <div className="search-panel">
      <div className="h-splitter" onMouseDown={onResizeStart} />
      <div className="sb-head">
        <span className="panel-title"><Icon name="search" size={14} /> {t('search_title')}</span>
        <span className="spacer" />
        <button className="icon-btn" title={t('close')} onClick={onClose}><Icon name="close" size={15} /></button>
      </div>
      <div className="search-form">
        <div className="search-scope">
          <button className={`seg-btn ${scope === 'open' ? 'on' : ''}`} onClick={() => setScope('open')}>{t('search_scope_open')}</button>
          <button className={`seg-btn ${scope === 'folder' ? 'on' : ''}`} disabled={!folder} title={folder || t('search_no_folder')} onClick={() => setScope('folder')}>{t('search_scope_folder')}</button>
        </div>
        <div className="fb-input search-input">
          <input ref={inputRef} value={q} placeholder={t('search_placeholder')} spellCheck={false} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} />
          <span className="fb-opts">
            <button className={caseSensitive ? 'on' : ''} title={t('match_case')} onClick={() => setCase(!caseSensitive)}>Aa</button>
            <button className={wholeWord ? 'on' : ''} title={t('whole_word')} onClick={() => setWord(!wholeWord)}><u>ab</u></button>
            <button className={regex ? 'on' : ''} title={t('regex')} onClick={() => setRegex(!regex)}>.*</button>
          </span>
        </div>
        {scope === 'folder' && (
          <div className="search-globs">
            <input value={include} placeholder={t('search_include')} spellCheck={false} onChange={(e) => setInclude(e.target.value)} onKeyDown={onKey} />
            <input value={exclude} placeholder={t('search_exclude')} spellCheck={false} onChange={(e) => setExclude(e.target.value)} onKeyDown={onKey} />
          </div>
        )}
        <div className="search-actions">
          <button className="btn primary" disabled={!q || busy} onClick={() => run()}><Icon name="search" size={14} /> {busy ? t('search_running') : t('search_run')}</button>
          {busy && scope === 'folder' && <button className="btn" onClick={() => { seq.current++; setBusy(false); call('search.cancel', { id: 1 }).catch(() => {}); }}>{t('cancel')}</button>}
          <span className="muted small ellipsis" title={summary}>{summary}</span>
        </div>
        {result && result.error && <div className="danger small search-error">{result.error}</div>}
      </div>
      <div className="search-results">
        {groups.map((g) => (
          <div key={g.key} className="sr-group">
            <div className="sr-file" title={g.path || g.name} onClick={() => toggle(g.key)}>
              <Icon name={collapsed.has(g.key) ? 'chevronRight' : 'chevronDown'} size={12} />
              <Icon name="fileText" size={13} />
              <span className="sr-name ellipsis">{g.name}</span>
              {g.rel && dirOf(g.rel) && <span className="muted small ellipsis">{dirOf(g.rel)}</span>}
              <span className="sr-count">{g.hits.length}</span>
            </div>
            {!collapsed.has(g.key) && g.hits.map((h, i) => (
              <div key={i} className="sr-hit" onClick={() => onOpen(h)} title={`${h.line}:${h.col}`}>
                <span className="sr-ln mono">{h.line}</span>
                <Line text={h.text} col={h.col} endCol={h.endCol} />
              </div>
            ))}
          </div>
        ))}
        {result && !result.error && !result.hits.length && <div className="sb-empty"><Icon name="search" size={24} /><p>{t('search_none')}</p></div>}
        {!result && <div className="sb-empty"><Icon name="search" size={24} /><p>{t('search_hint')}</p></div>}
      </div>
    </div>
  );
}

export default SearchPanel;
