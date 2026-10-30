// The bottom panel's tabs besides the Command Window:
//   HelpBrowser   도움말: everything that can be used — workspace variables,
//                 constants and functions (engine.catalog) — with a search, a
//                 kind / area filter and the selected entry's text and syntax;
//                 a syntax line or the name goes into the editor or the prompt.
//   ProblemsPane  문제점: the static problems of the active editor file
//                 (engine.check, core/lang/check.js), re-checked while typing;
//                 a click moves the editor to the line.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { t, useLanguage, getLanguage } from '../lib/i18n';
import { Icon } from '../components/Chrome';

const KINDS = [
  { id: 'all', icon: 'list', label: 'bh_all' },
  { id: 'variable', icon: 'variable', label: 'bh_variables' },
  { id: 'constant', icon: 'hash', label: 'bh_constants' },
  { id: 'function', icon: 'code', label: 'bh_functions' },
];
const AREAS = ['lang', 'base', 'linalg', 'numeric', 'io', 'graphics', 'sim'];
const LIMIT = 400;

const dimsText = (d) => (Array.isArray(d) ? d.join('×') : '');

export function HelpBrowser({ engine, engineReady, variables, onInsert }) {
  useLanguage();
  const ko = getLanguage() !== 'en';
  const [catalog, setCatalog] = useState([]);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [area, setArea] = useState(null);
  const [sel, setSel] = useState(null); // { name, kind }
  const [help, setHelp] = useState(null);
  useEffect(() => {
    if (!engineReady) return undefined;
    let alive = true;
    engine.catalog().then((c) => { if (alive) setCatalog(Array.isArray(c) ? c : []); });
    return () => { alive = false; };
  }, [engine, engineReady]);

  const all = useMemo(() => {
    const vars = (variables || []).map((v) => ({ name: v.name, kind: 'variable', area: null, en: v.summary || '', ko: v.summary || '', cls: v.cls, dims: v.dims }));
    return [...vars, ...catalog];
  }, [variables, catalog]);
  const q = query.trim().toLowerCase();
  const matches = useMemo(() => {
    const ranked = [];
    for (const it of all) {
      if (kind !== 'all' && it.kind !== kind) continue;
      if (area && it.area !== area) continue;
      const n = it.name.toLowerCase();
      let r = 3;
      if (q) {
        if (n === q) r = 0;
        else if (n.startsWith(q)) r = 1;
        else if (n.includes(q)) r = 2;
        else if (`${it.en} ${it.ko}`.toLowerCase().includes(q)) r = 3;
        else continue;
      }
      ranked.push([r, it]);
    }
    ranked.sort((a, b) => a[0] - b[0]);
    return ranked.map((x) => x[1]);
  }, [all, kind, area, q]);
  const counts = useMemo(() => {
    const c = { all: all.length, variable: 0, constant: 0, function: 0 };
    for (const it of all) c[it.kind] += 1;
    return c;
  }, [all]);

  const item = sel && all.find((x) => x.name === sel.name && x.kind === sel.kind);
  useEffect(() => {
    if (!sel || sel.kind === 'variable') { setHelp(null); return undefined; }
    let alive = true;
    engine.help(sel.name).then((h) => { if (alive) setHelp(h); });
    return () => { alive = false; };
  }, [engine, sel]);

  const main = help ? (ko && help.ko ? help.ko : help.en || help.text) : '';
  const other = help && ko && help.ko && help.en ? help.en : '';
  const syntax = help && help.syntax ? help.syntax : [];
  return (
    <div className="bh-pane" data-pane="help">
      <div className="bh-list">
        <div className="pane-tools">
          <span className="pane-filter"><Icon name="search" size={13} /><input value={query} placeholder={t('bh_search')} aria-label={t('bh_search')}
            onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && matches[0]) setSel({ name: matches[0].name, kind: matches[0].kind }); }} /></span>
          <span className="small muted">{t('px_fh_count', { n: matches.length })}</span>
        </div>
        <div className="bh-chips" role="group" aria-label={t('bh_kind')}>
          {KINDS.map((k) => (
            <button key={k.id} type="button" className={`bh-chip ${kind === k.id ? 'on' : ''}`} aria-pressed={kind === k.id} onClick={() => { setKind(k.id); if (k.id !== 'function' && k.id !== 'all') setArea(null); }}>
              <Icon name={k.icon} size={12} /><span>{t(k.label)}</span><span className="bh-count">{counts[k.id]}</span>
            </button>
          ))}
        </div>
        {(kind === 'function' || kind === 'all') && (
          <div className="bh-chips bh-areas" role="group" aria-label={t('bh_area')}>
            {AREAS.map((a) => (
              <button key={a} type="button" className={`bh-chip small ${area === a ? 'on' : ''}`} aria-pressed={area === a} onClick={() => setArea(area === a ? null : a)}>{t(`bh_area_${a}`)}</button>
            ))}
          </div>
        )}
        <div className="pane-scroll">
          {!engineReady && <div className="pane-empty small muted">{t('ws_no_engine')}</div>}
          {engineReady && !matches.length && <div className="pane-empty small muted">{t('px_fh_none')}</div>}
          {matches.slice(0, LIMIT).map((it) => (
            <button key={`${it.kind}:${it.name}`} type="button" className={`bh-item ${item === it ? 'on' : ''}`} title={(ko && it.ko) || it.en}
              onClick={() => setSel({ name: it.name, kind: it.kind })} onDoubleClick={() => onInsert(it.kind === 'function' ? `${it.name}(` : it.name)}>
              <Icon name={KINDS.find((k) => k.id === it.kind).icon} size={12} className={`bh-kind-${it.kind}`} />
              <span className="mono bh-name">{it.name}</span>
              <span className="small muted ellipsis">{it.kind === 'variable' ? `${it.cls || ''} ${dimsText(it.dims)}` : (ko && it.ko) || it.en}</span>
            </button>
          ))}
          {matches.length > LIMIT && <div className="pane-empty small muted">{t('bh_more', { n: matches.length - LIMIT })}</div>}
        </div>
      </div>
      <div className="bh-detail pane-scroll" data-help={item ? item.name : ''}>
        {!item && <div className="pane-empty small muted"><Icon name="info" size={14} />{t('bh_pick')}</div>}
        {item && (
          <>
            <div className="bh-head">
              <strong className="mono">{item.name}</strong>
              <span className={`bh-tag bh-kind-${item.kind}`}>{t(`bh_kind_${item.kind}`)}</span>
              {item.area && <span className="bh-tag">{t(`bh_area_${item.area}`)}</span>}
              <span className="spacer" />
              <button type="button" className="vbtn vbtn-sm" title={t('bh_insert_tip')} onClick={() => onInsert(item.kind === 'function' ? `${item.name}(` : item.name)}><Icon name="edit" size={13} /><span>{t('bh_insert')}</span></button>
            </div>
            {item.kind === 'variable' && (
              <dl className="bh-var">
                <dt>{t('bh_class')}</dt><dd className="mono">{item.cls}</dd>
                <dt>{t('bh_size')}</dt><dd className="mono">{dimsText(item.dims)}</dd>
                {item.en && <><dt>{t('bh_value')}</dt><dd className="mono">{item.en}</dd></>}
              </dl>
            )}
            {main && <p className="fh-text">{main}</p>}
            {other && <p className="fh-text muted small">{other}</p>}
            {item.kind !== 'variable' && help && !syntax.length && help.text && help.text !== main && <pre className="fh-pre mono">{help.text}</pre>}
            {syntax.length > 0 && <div className="fp-section small">{t('px_fh_syntax')}</div>}
            {syntax.map((s) => (
              <div key={s} className="fh-syntax">
                <code className="mono ellipsis" title={s}>{s}</code>
                <button type="button" className="icon-btn" title={t('bh_insert_tip')} aria-label={`${t('bh_insert')}: ${s}`} onClick={() => onInsert(s)}><Icon name="edit" size={13} /></button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

const SEV_ICON = { error: 'xCircle', warning: 'alert', info: 'info' };

/** Text of a problem in the GUI language (the parser's own message for syntax errors). */
export function problemText(p) {
  if (p.code === 'parse') return t('pr_parse', { message: p.message });
  const key = `pr_${p.code}`;
  const s = t(key, { name: p.name || '' });
  return s === key ? p.message : s;
}

/**
 * active: { id, title, path } of the active editor document or null;
 * getText(id) → its text; onGoto(id, line, col); onCount({ error, warning, info }).
 */
export function ProblemsPane({ engine, engineReady, active, getText, onGoto, onCount, refreshKey }) {
  useLanguage();
  const [list, setList] = useState([]);
  const [checked, setChecked] = useState(null); // doc id the list belongs to
  const [show, setShow] = useState({ error: true, warning: true, info: true });
  const timer = useRef(0);
  const activeId = active ? active.id : null;
  const activePath = active ? active.path : null;

  useEffect(() => {
    if (!engineReady || !activeId) { setList([]); setChecked(null); return undefined; }
    let alive = true;
    const run = () => {
      const text = getText(activeId);
      if (text == null) return;
      engine.check(text, activePath || undefined).then((r) => { if (alive) { setList(Array.isArray(r) ? r : []); setChecked(activeId); } });
    };
    run();
    const onChange = (e) => { if (e.detail && e.detail.id === activeId) { clearTimeout(timer.current); timer.current = setTimeout(run, 400); } };
    window.addEventListener('msm-editor-change', onChange);
    return () => { alive = false; clearTimeout(timer.current); window.removeEventListener('msm-editor-change', onChange); };
  }, [engine, engineReady, activeId, activePath, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => {
    const c = { error: 0, warning: 0, info: 0 };
    for (const p of list) c[p.severity] = (c[p.severity] || 0) + 1;
    return c;
  }, [list]);
  useEffect(() => { if (onCount) onCount(activeId ? counts : null); }, [counts, activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = list.filter((p) => show[p.severity]);
  return (
    <div className="pr-pane" data-pane="problems">
      <div className="pane-tools">
        <Icon name="file" size={13} />
        <span className="ellipsis small" title={active ? active.path || active.title : ''}>{active ? active.title : t('pr_no_file')}</span>
        <span className="spacer" />
        {['error', 'warning', 'info'].map((s) => (
          <button key={s} type="button" className={`bh-chip pr-sev-${s} ${show[s] ? 'on' : ''}`} aria-pressed={show[s]} title={t(`pr_sev_${s}`)} onClick={() => setShow((x) => ({ ...x, [s]: !x[s] }))}>
            <Icon name={SEV_ICON[s]} size={12} /><span>{t(`pr_sev_${s}`)}</span><span className="bh-count">{counts[s]}</span>
          </button>
        ))}
      </div>
      <div className="pane-scroll">
        {!active && <div className="pane-empty small muted"><Icon name="info" size={14} />{t('pr_open_file')}</div>}
        {active && checked === activeId && !list.length && <div className="pane-empty small pr-ok"><Icon name="checkCircle" size={14} />{t('pr_none')}</div>}
        {active && shown.map((p, i) => (
          <button key={`${p.line}:${p.col}:${p.code}:${i}`} type="button" className={`pr-item pr-sev-${p.severity}`} onClick={() => onGoto(activeId, p.line, p.col)} title={p.message}>
            <Icon name={SEV_ICON[p.severity]} size={13} />
            <span className="pr-msg ellipsis">{problemText(p)}</span>
            <span className="pr-where small muted mono">{t('pr_where', { line: p.line, col: p.col })}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
