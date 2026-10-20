// The sidebar at the left, three tabs:
//   개요   the map as a tree (its own folding, independent of the map's);
//          a click selects the topic and brings it into view
//   찾기   find (text and notes; case, whole word, regular expression) and
//          replace in the found topics
//   필터   the map index — icons, tags, priorities, progress and due dates
//          used in the map with their counts — and the filter built from
//          them (the other topics dimmed or hidden)
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { t, useLanguage, getLanguage } from '../lib/i18n';
import { Icon } from './Icons';
import { findTopics, usage, filterTopics, filterActive, findTopic, entryOf } from '../lib/model';
import { markerSvgDoc, markerLabel, topicMarkers } from '../lib/markers';

const firstLine = (s) => String(s || '').split('\n')[0];

function OutlineTree({ map, sel, onPick, onContext, filterText }) {
  const [closed, setClosed] = useState(() => new Set());
  const rows = [];
  const q = filterText.trim().toLowerCase();
  const matches = (tp) => !q || String(tp.text || '').toLowerCase().includes(q);
  const keep = (tp) => matches(tp) || (tp.children || []).some(keep);
  const walk = (tp, depth, kind) => {
    if (q && !keep(tp)) return;
    const kids = tp.children || [];
    const open = q ? true : !closed.has(tp.id);
    rows.push({ tp, depth, kind, kids: kids.length, open });
    if (open) kids.forEach((c) => walk(c, depth + 1, 'child'));
  };
  walk(map.root, 0, 'root');
  for (const f of map.floating || []) walk(f, 1, 'floating');
  const toggle = (id) => setClosed((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <div className="sb-body outline-tree">
      {rows.map(({ tp, depth, kind, kids, open }) => {
        const mk = topicMarkers(tp)[0];
        return (
          <div key={tp.id} className={`tree-row ${sel.includes(tp.id) ? 'active' : ''} ${kind}`} style={{ paddingLeft: 12 + depth * 14 }} title={tp.text}
            onClick={() => onPick(tp.id)} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); if (onContext) onContext(tp.id, e.clientX, e.clientY); }}>
            <span className="tree-expander" onClick={(e) => { e.stopPropagation(); if (kids) toggle(tp.id); }}>
              {kids ? <Icon name={open ? 'chevronDown' : 'chevronRight'} size={12} /> : <span className="tree-leaf" />}
            </span>
            {kind === 'floating' && <Icon name="floating" size={13} className="muted" />}
            {mk && <span className="mk-svg" style={{ width: 14, height: 14 }} dangerouslySetInnerHTML={{ __html: markerSvgDoc(mk, 14) }} />}
            <span className={`tree-name ${kind === 'root' ? 'root' : ''}`}>{firstLine(tp.text) || <span className="muted">{t('untitled_topic')}</span>}</span>
            {tp.notes && <Icon name="notes" size={11} className="muted" />}
            {tp.collapsed && kids > 0 && <span className="tree-count">{kids}</span>}
          </div>
        );
      })}
    </div>
  );
}

function FindTab({ map, onPick, onContext, onReplace, focusSignal }) {
  const [q, setQ] = useState('');
  const [rep, setRep] = useState('');
  const [opts, setOpts] = useState({ caseSensitive: false, wholeWord: false, regex: false, notes: true });
  const input = useRef(null);
  useEffect(() => { if (focusSignal && input.current) { input.current.focus(); input.current.select(); } }, [focusSignal]);
  const ids = useMemo(() => (q ? findTopics(map, q, opts) : []), [map, q, opts]);
  const toggle = (k) => setOpts((o) => ({ ...o, [k]: !o[k] }));
  let re = null;
  try { re = q ? new RegExp(opts.regex ? q : q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), opts.caseSensitive ? 'g' : 'gi') : null; } catch { re = null; }
  const mark = (text) => {
    const s = firstLine(text);
    if (!re) return s;
    const out = [];
    let at = 0;
    re.lastIndex = 0;
    for (let m = re.exec(s); m && out.length < 40; m = re.exec(s)) {
      if (!m[0]) { re.lastIndex++; continue; }
      out.push(s.slice(at, m.index), <mark key={m.index}>{m[0]}</mark>);
      at = m.index + m[0].length;
    }
    out.push(s.slice(at));
    return out;
  };
  return (
    <div className="find-tab">
      <div className="search-form">
        <div className="fb-input">
          <input ref={input} value={q} placeholder={t('find_ph')} onChange={(e) => setQ(e.target.value)} spellCheck={false}
            onKeyDown={(e) => { if (e.key === 'Enter' && ids.length) onPick(ids[0], ids); }} />
          <span className="fb-opts">
            <button type="button" className={opts.caseSensitive ? 'on' : ''} title={t('match_case')} onClick={() => toggle('caseSensitive')}>Aa</button>
            <button type="button" className={opts.wholeWord ? 'on' : ''} title={t('whole_word')} onClick={() => toggle('wholeWord')}>ab</button>
            <button type="button" className={opts.regex ? 'on' : ''} title={t('regex')} onClick={() => toggle('regex')}>.*</button>
          </span>
        </div>
        <label className="check small"><input type="checkbox" checked={opts.notes} onChange={() => toggle('notes')} /><span>{t('find_in_notes')}</span></label>
        <div className="fb-input">
          <input value={rep} placeholder={t('replace_ph')} onChange={(e) => setRep(e.target.value)} spellCheck={false} />
        </div>
        <div className="search-actions">
          <span className={`fb-count ${q && !ids.length ? 'none' : ''}`}>{q ? (ids.length ? t('matches', { n: ids.length }) : t('no_match')) : ''}</span>
          <span className="spacer" />
          <button type="button" className="btn small" disabled={!ids.length} onClick={() => onPick(ids[0], ids)}><Icon name="selectAll" size={12} /> {t('select_all_matches')}</button>
          <button type="button" className="btn small" disabled={!ids.length} onClick={() => onReplace(ids, q, rep, opts)}><Icon name="replace" size={12} /> {t('replace_all')}</button>
        </div>
      </div>
      <div className="search-results">
        {ids.map((id) => {
          const tp = findTopic(map, id);
          const e = entryOf(map, id);
          const parent = e && e.parent ? findTopic(map, e.parent) : null;
          return (
            <div key={id} className="sr-hit" onClick={() => onPick(id)} title={tp.text} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); if (onContext) onContext(id, e.clientX, e.clientY); }}>
              <Icon name={tp.notes && !String(tp.text).toLowerCase().includes(q.toLowerCase()) ? 'notes' : 'dot'} size={10} className="muted" />
              <span className="sr-line">{mark(tp.text)}</span>
              {parent && <span className="sr-parent muted">{firstLine(parent.text)}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FilterTab({ map, filter, mode, onFilter, onMode, onPickAll }) {
  const lang = getLanguage();
  const u = useMemo(() => usage(map), [map]);
  const f = filter || {};
  const toggleIn = (key, v) => { const list = f[key] || []; onFilter({ ...f, [key]: list.includes(v) ? list.filter((x) => x !== v) : [...list, v] }); };
  const active = filterActive(f);
  const result = useMemo(() => (active ? filterTopics(map, f) : null), [map, filter]);   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="filter-tab sb-body">
      <div className="filter-head">
        <input value={f.text || ''} placeholder={t('filter_text_ph')} onChange={(e) => onFilter({ ...f, text: e.target.value })} />
        <div className="seg">
          <button type="button" className={`seg-btn ${mode !== 'hide' ? 'on' : ''}`} onClick={() => onMode('dim')}>{t('filter_dim')}</button>
          <button type="button" className={`seg-btn ${mode === 'hide' ? 'on' : ''}`} onClick={() => onMode('hide')}>{t('filter_hide')}</button>
        </div>
        <div className="row">
          <span className="muted small">{active ? t('filter_count', { n: result.hits.size }) : t('filter_none')}</span>
          <span className="spacer" />
          <button type="button" className="btn small" disabled={!active} onClick={() => onPickAll([...result.hits])}><Icon name="selectAll" size={12} /> {t('select')}</button>
          <button type="button" className="btn small" disabled={!active} onClick={() => onFilter(null)}><Icon name="close" size={12} /> {t('filter_clear')}</button>
        </div>
      </div>
      <h4 className="pane-h">{t('mk_priority')}</h4>
      {u.priorities.size ? (
        <div className="index-list">
          {[...u.priorities.entries()].sort((a, b) => a[0] - b[0]).map(([p, n]) => (
            <button key={p} type="button" className={`index-item ${(f.priority || []).includes(p) ? 'on' : ''}`} onClick={() => toggleIn('priority', p)}>
              <span className="mk-svg" style={{ width: 16, height: 16 }} dangerouslySetInnerHTML={{ __html: markerSvgDoc(`priority-${p}`, 16) }} />
              <span className="ellipsis">{markerLabel(`priority-${p}`, lang)}</span><span className="index-n">{n}</span>
            </button>
          ))}
        </div>
      ) : <p className="muted small index-empty">{t('index_none')}</p>}
      <h4 className="pane-h">{t('filter_status')}</h4>
      <div className="index-list">
        {[['progress', 'open', 'filter_open', 'progress-50'], ['progress', 'done', 'filter_done', 'progress-100'], ['due', 'overdue', 'filter_overdue', 'warning'], ['due', 'week', 'filter_week', 'calendar']].map(([k, v, label, mk]) => (
          <button key={`${k}${v}`} type="button" className={`index-item ${f[k] === v ? 'on' : ''}`} onClick={() => onFilter({ ...f, [k]: f[k] === v ? '' : v })}>
            <span className="mk-svg" style={{ width: 16, height: 16 }} dangerouslySetInnerHTML={{ __html: markerSvgDoc(mk, 16) }} />
            <span className="ellipsis">{t(label)}</span>
          </button>
        ))}
      </div>
      <h4 className="pane-h">{t('index_icons')}</h4>
      {u.icons.size ? (
        <div className="index-list">
          {[...u.icons.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => (
            <button key={id} type="button" className={`index-item ${(f.icons || []).includes(id) ? 'on' : ''}`} onClick={() => toggleIn('icons', id)}>
              <span className="mk-svg" style={{ width: 16, height: 16 }} dangerouslySetInnerHTML={{ __html: markerSvgDoc(id, 16) }} />
              <span className="ellipsis">{markerLabel(id, lang)}</span><span className="index-n">{n}</span>
            </button>
          ))}
        </div>
      ) : <p className="muted small index-empty">{t('index_none')}</p>}
      <h4 className="pane-h">{t('mk_tags')}</h4>
      {u.tags.size ? (
        <div className="index-list">
          {[...u.tags.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([g, n]) => (
            <button key={g} type="button" className={`index-item ${(f.tags || []).includes(g) ? 'on' : ''}`} onClick={() => toggleIn('tags', g)}>
              <Icon name="tag" size={14} className="muted" /><span className="ellipsis">{g}</span><span className="index-n">{n}</span>
            </button>
          ))}
        </div>
      ) : <p className="muted small index-empty">{t('index_none')}</p>}
    </div>
  );
}

export const SIDEBAR_TABS = [['outline', 'listTree', 'sb_outline'], ['find', 'search', 'sb_find'], ['filter', 'filter', 'sb_filter']];

export function Sidebar({ doc, map, settings, tab, onTab, onPick, onContext, onReplace, onFilter, onFilterMode, onPickAll, onAction, findFocus }) {
  useLanguage();
  const [outlineFilter, setOutlineFilter] = useState('');
  return (
    <aside className="sidebar" style={{ width: `var(--sidebar-w, ${settings.sidebarWidth}px)` }}>
      <div className="pane-tabs" role="tablist">
        {SIDEBAR_TABS.map(([id, icon, label]) => (
          <button key={id} type="button" role="tab" data-side={id} className={`pane-tab ${tab === id ? 'active' : ''}`} title={t(label)} onClick={() => onTab(id)}>
            <Icon name={icon} size={15} /><span>{t(label)}</span>
            {id === 'filter' && doc && filterActive(doc.filter) && <span className="panel-badge">!</span>}
          </button>
        ))}
        <button type="button" className="icon-btn pane-close" data-cmd="collapse-left" title={t('tip_sidebar_toggle')} onClick={() => onAction('toggle:sidebarVisible')}><Icon name="chevronLeft" size={14} /></button>
      </div>
      {!doc ? <div className="sb-empty"><p>{t('pane_no_doc')}</p></div> : (
        <>
          {tab === 'outline' && (
            <>
              <div className="sb-filter"><Icon name="search" size={13} /><input value={outlineFilter} placeholder={t('outline_filter_ph')} onChange={(e) => setOutlineFilter(e.target.value)} /></div>
              <OutlineTree map={map} sel={doc.sel || []} onPick={onPick} onContext={onContext} filterText={outlineFilter} />
            </>
          )}
          {tab === 'find' && <FindTab map={map} onPick={onPick} onContext={onContext} onReplace={onReplace} focusSignal={findFocus} />}
          {tab === 'filter' && <FilterTab map={map} filter={doc.filter} mode={doc.filterMode} onFilter={onFilter} onMode={onFilterMode} onPickAll={onPickAll} />}
        </>
      )}
    </aside>
  );
}

export default Sidebar;
