// The help screen's side panes:
//   GuideTocPane  사용 설명서 목차 (left, a tool): the manual's chapters and
//                 sections (lib/guideDocs.js); a click opens the manual window
//                 at that section (openGuide({ section })).
//   FuncHelpPane  함수 도움말 (right): search the engine's function help
//                 (engine.helpSearch), one line each; a click shows the full
//                 text with its syntax lines, which go into the Command Window.
import React, { useEffect, useMemo, useState } from 'react';
import { t, useLanguage, getLanguage } from '../lib/i18n';
import { Icon } from '../components/Chrome';
import { guideDoc } from '../lib/guideDocs';
import { openGuide } from '../components/GuideHost';

export function GuideTocPane() {
  useLanguage();
  const lang = getLanguage() === 'en' ? 'en' : 'ko';
  const manual = useMemo(() => { try { return guideDoc('manual', lang); } catch { return { toc: [] }; } }, [lang]);
  const [open, setOpen] = useState({});
  const [filter, setFilter] = useState('');
  const f = filter.trim().toLowerCase();
  const go = (id) => openGuide({ doc: 'manual', lang, section: id });
  const match = (n) => !f || n.text.toLowerCase().includes(f) || (n.children || []).some(match);
  return (
    <div className="pane gt-pane">
      <div className="pane-tools">
        <span className="pane-filter"><Icon name="filter" size={13} /><input value={filter} placeholder={t('ws_filter')} aria-label={t('ws_filter')} onChange={(e) => setFilter(e.target.value)} /></span>
        <button type="button" className="icon-btn" title={t('px_gt_open')} aria-label={t('px_gt_open')} onClick={() => openGuide({ doc: 'manual', lang })}><Icon name="external" size={13} /></button>
      </div>
      <div className="pane-scroll">
        {manual.toc.filter(match).map((ch, i) => {
          const isOpen = f ? true : !!open[ch.id];
          return (
            <div key={ch.id} className="gt-chapter">
              <div className="gt-row gt-h1">
                <button type="button" className={`cf-twisty ${isOpen ? 'open' : ''}`} aria-label={isOpen ? t('collapse') : t('expand')} onClick={() => setOpen((o) => ({ ...o, [ch.id]: !isOpen }))}><Icon name="chevronRight" size={12} /></button>
                <button type="button" className="gt-link" title={`${t('px_gt_open')}: ${ch.text}`} onClick={() => go(ch.id)}><Icon name="book" size={13} /><span className="ellipsis">{i + 1}. {ch.text}</span></button>
              </div>
              {isOpen && (ch.children || []).filter(match).map((s) => (
                <React.Fragment key={s.id}>
                  <button type="button" className="gt-link gt-h2" title={s.text} onClick={() => go(s.id)}><span className="ellipsis">{s.text}</span></button>
                  {(s.children || []).filter(match).map((x) => <button key={x.id} type="button" className="gt-link gt-h3" title={x.text} onClick={() => go(x.id)}><span className="ellipsis">{x.text}</span></button>)}
                </React.Fragment>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function FuncHelpPane({ engine, engineReady, onInsert }) {
  useLanguage();
  const ko = getLanguage() !== 'en';
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState([]);
  const [shown, setShown] = useState(null); // { name, help }
  useEffect(() => {
    if (!engineReady) return undefined;
    let alive = true;
    const timer = setTimeout(() => { engine.helpSearch(query, 120).then((r) => { if (alive) setHits(Array.isArray(r) ? r : []); }); }, 180);
    return () => { alive = false; clearTimeout(timer); };
  }, [engine, engineReady, query]);
  const show = async (name) => { const help = await engine.help(name); setShown({ name, help }); };
  if (shown) {
    const h = shown.help;
    const main = h ? (ko && h.ko ? h.ko : h.en || h.text) : '';
    const other = h && ko && h.ko && h.en ? h.en : '';
    const syntax = h && h.syntax && h.syntax.length ? h.syntax : [];
    return (
      <div className="pane fh-pane" data-help={shown.name}>
        <div className="pane-tools">
          <button type="button" className="vbtn vbtn-sm" onClick={() => setShown(null)}><Icon name="chevronLeft" size={13} /><span>{t('px_fh_back')}</span></button>
          <strong className="mono ellipsis">{shown.name}</strong><span className="spacer" />
          <button type="button" className="vbtn vbtn-sm" title={t('px_fh_insert')} onClick={() => onInsert(syntax[0] && /^\w/.test(syntax[0]) ? syntax[0] : `${shown.name}(`)}><Icon name="terminal" size={13} /><span>{t('px_fh_insert')}</span></button>
        </div>
        <div className="pane-scroll fh-detail">
          {!h && <div className="pane-empty small muted">{t('px_fh_nohelp')}</div>}
          {main && <p className="fh-text">{main}</p>}
          {other && <p className="fh-text muted small">{other}</p>}
          {!syntax.length && h && h.text && h.text !== main && <pre className="fh-pre mono">{h.text}</pre>}
          {syntax.length > 0 && <div className="fp-section small">{t('px_fh_syntax')}</div>}
          {syntax.map((s) => (
            <div key={s} className="fh-syntax">
              <code className="mono ellipsis" title={s}>{s}</code>
              <button type="button" className="icon-btn" title={t('px_fh_insert')} aria-label={`${t('px_fh_insert')}: ${s}`} onClick={() => onInsert(s)}><Icon name="terminal" size={13} /></button>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="pane fh-pane">
      <div className="pane-tools">
        <span className="pane-filter"><Icon name="search" size={13} /><input value={query} placeholder={t('px_fh_search')} aria-label={t('px_fh_search')} onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && hits[0]) show(hits[0].name); }} /></span>
        <span className="small muted">{t('px_fh_count', { n: hits.length })}</span>
      </div>
      <div className="pane-scroll">
        {!engineReady && <div className="pane-empty small muted">{t('ws_no_engine')}</div>}
        {engineReady && !hits.length && <div className="pane-empty small muted">{t('px_fh_none')}</div>}
        {hits.map((h) => (
          <button key={h.name} type="button" className="fh-item" onClick={() => show(h.name)} title={h.en}>
            <span className="mono fh-name">{h.name}</span>
            <span className="small muted ellipsis">{(ko && h.ko) || h.en}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
