import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DialogFrame } from './DialogFrame.jsx';
import { Icon } from '../components/Icons.jsx';
import { Check } from '../components/common.jsx';
import { platform } from '../lib/platform.js';
import { formatDuration } from '../lib/format.js';

// ── Print ─────────────────────────────────────────────────
export function PrintDialog({ payload, onSubmit, onClose, standalone }) {
  const { t } = useTranslation();
  const p = payload || {};
  const docs = p.docs || [];
  const [scope, setScope] = useState(docs.length > 1 ? 'all' : 'current');
  const [picked, setPicked] = useState(() => new Set(p.currentId ? [p.currentId] : []));
  const [selectionOnly, setSelectionOnly] = useState(false);
  const [landscape, setLandscape] = useState(() => {
    const cur = docs.find((d) => d.id === p.currentId);
    return !!(cur && cur.width > cur.height);
  });
  const [fit, setFit] = useState(true);

  const ids = scope === 'all' ? docs.map((d) => d.id) : scope === 'current' ? (p.currentId ? [p.currentId] : []) : docs.filter((d) => picked.has(d.id)).map((d) => d.id);
  const toggle = (id) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <DialogFrame title={t('print.title')} standalone={standalone} onClose={onClose}
      footer={<>
        <span style={{ marginRight: 'auto', color: 'var(--text-dim)' }}>{ids.length ? t('print.pages', { n: ids.length }) : t('print.none')}</span>
        <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
        <button className="btn primary" disabled={!ids.length} onClick={() => onSubmit({ docIds: ids, selectionOnly: scope !== 'all' && selectionOnly && ids.length === 1 && ids[0] === p.currentId, landscape, fit })}><Icon name="print" />{t('print.print')}</button>
      </>}
    >
      <div className="section-title">{t('print.scope')}</div>
      <label className="check"><input type="radio" checked={scope === 'all'} onChange={() => setScope('all')} /><span>{t('print.all', { n: docs.length })}</span></label><br />
      <label className="check"><input type="radio" checked={scope === 'current'} disabled={!p.currentId} onChange={() => setScope('current')} /><span>{t('print.current')}</span></label><br />
      <label className="check"><input type="radio" checked={scope === 'custom'} onChange={() => setScope('custom')} /><span>{t('print.custom')}</span></label>
      {scope === 'custom' ? (
        <div style={{ margin: '8px 0 8px 24px' }}>
          <div style={{ color: 'var(--text-dim)', marginBottom: 4 }}>{t('print.selectDocs')}</div>
          <div className="doc-list">
            {docs.map((d) => (
              <label key={d.id}>
                <input type="checkbox" checked={picked.has(d.id)} onChange={() => toggle(d.id)} />
                <Icon name={d.kind === 'video' ? 'video' : 'image'} size={14} />
                <span>{d.name}</span>
                <span className="dim">{d.width && d.height ? `${d.width} × ${d.height}` : ''}</span>
              </label>
            ))}
          </div>
        </div>
      ) : null}
      {scope !== 'all' ? (
        <div style={{ marginLeft: 24 }}>
          <Check label={`${t('print.selectionOnly')} ${p.hasSelection ? '' : t('print.noSelection')}`} checked={selectionOnly} disabled={!p.hasSelection} onChange={setSelectionOnly} />
        </div>
      ) : null}
      <div className="section-title" style={{ marginTop: 16 }}>{t('print.orientation')}</div>
      <label className="check"><input type="radio" checked={!landscape} onChange={() => setLandscape(false)} /><span>{t('print.portrait')}</span></label>
      <label className="check" style={{ marginLeft: 16 }}><input type="radio" checked={landscape} onChange={() => setLandscape(true)} /><span>{t('print.landscape')}</span></label>
      <br />
      <Check label={t('print.fit')} checked={fit} onChange={setFit} />
    </DialogFrame>
  );
}

// ── Source picker (screens / windows) ─────────────────────
export function SourcesDialog({ payload, onSubmit, onClose, standalone }) {
  const { t } = useTranslation();
  const p = payload || {};
  const kind = p.kind || 'screen';               // 'screen' | 'window' | 'record'
  const [sources, setSources] = useState(p.sources || null);
  const [tab, setTab] = useState(kind === 'window' ? 'window' : 'screen');
  const [picked, setPicked] = useState(null);
  const [loading, setLoading] = useState(!p.sources);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await platform.capture.listSources({ types: ['screen', 'window'], thumbWidth: 360 });
      setSources(list);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (!p.sources) refresh(); }, [p.sources, refresh]);
  useEffect(() => { if (p.sources) setSources(p.sources); }, [p.sources]);

  const shown = (sources || []).filter((s) => (kind === 'record' ? s.kind === 'screen' : s.kind === tab));
  useEffect(() => { if (!picked && shown.length) setPicked(shown[0].id); }, [shown, picked]);

  const title = kind === 'record' ? t('sources.titleRecord') : kind === 'window' ? t('sources.titleWindow') : t('sources.titleScreen');
  const go = () => { const src = shown.find((s) => s.id === picked); if (src) onSubmit({ id: src.id, name: src.name, kind: src.kind, displayId: src.displayId }); };

  return (
    <DialogFrame title={title} standalone={standalone} onClose={onClose}
      footer={<>
        <div className="left"><button className="btn" onClick={refresh} disabled={loading}><Icon name="refresh" />{t('sources.refresh')}</button></div>
        <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
        <button className="btn primary" disabled={!picked} onClick={go}><Icon name={kind === 'record' ? 'record' : 'camera'} />{kind === 'record' ? t('sources.record') : t('sources.capture')}</button>
      </>}
    >
      {kind !== 'record' ? (
        <div className="sources-tabs">
          <button className={tab === 'screen' ? 'active' : ''} onClick={() => { setTab('screen'); setPicked(null); }}>{t('sources.screens')}</button>
          <button className={tab === 'window' ? 'active' : ''} onClick={() => { setTab('window'); setPicked(null); }}>{t('sources.windows')}</button>
        </div>
      ) : null}
      {loading && !sources ? <div style={{ color: 'var(--text-dim)' }}>{t('sources.loading')}</div> : null}
      {!loading && !shown.length ? <div style={{ color: 'var(--text-dim)' }}>{t('sources.empty')}</div> : null}
      <div className="sources-grid">
        {shown.map((s) => (
          <div key={s.id} className={`source-card${picked === s.id ? ' active' : ''}`} onClick={() => setPicked(s.id)} onDoubleClick={() => { setPicked(s.id); setTimeout(go, 0); }}>
            <div className="source-thumb">{s.thumbnail ? <img src={s.thumbnail} alt="" draggable={false} /> : <Icon name={s.kind === 'screen' ? 'screen' : 'window'} size={40} />}</div>
            <div className="source-name">
              {s.appIcon ? <img src={s.appIcon} alt="" /> : <Icon name={s.kind === 'screen' ? 'screen' : 'window'} size={16} />}
              <span title={s.name}>{s.name}{s.isPrimary ? ` · ${t('sources.primary')}` : ''}</span>
            </div>
          </div>
        ))}
      </div>
    </DialogFrame>
  );
}

// ── Recording controller (small always-on-top window) ─────
export function RecorderDialog({ payload, onSubmit }) {
  const { t } = useTranslation();
  const p = payload || {};
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(id); }, []);
  const elapsed = p.paused ? (p.pausedAt - p.startedAt - (p.pausedMs || 0)) / 1000 : (now - (p.startedAt || now) - (p.pausedMs || 0)) / 1000;
  return (
    <div className="recorder">
      <span className="rec-dot" style={{ animationPlayState: p.paused ? 'paused' : 'running' }} />
      <span className="time">{formatDuration(elapsed)}</span>
      {p.paused ? <span className="paused">{t('recorder.paused')}</span> : null}
      <span style={{ flex: 1 }} />
      <button className="btn" data-tip={p.paused ? t('recorder.resume') : t('recorder.pause')} onClick={() => onSubmit({ action: p.paused ? 'resume' : 'pause' }, true)}><Icon name={p.paused ? 'play' : 'pause'} /></button>
      <button className="btn danger" data-tip={t('recorder.stop')} onClick={() => onSubmit({ action: 'stop' }, true)}><Icon name="stop" />{t('recorder.stop')}</button>
      <button className="btn" data-tip={t('recorder.discard')} onClick={() => onSubmit({ action: 'discard' }, true)}><Icon name="trash" /></button>
    </div>
  );
}

// ── Region picker overlay ─────────────────────────────────
// Covers one display with its own frozen screenshot; the user drags a
// rectangle. Coordinates are reported in image pixels (the screenshot's).
export function RegionDialog({ payload, onSubmit, onClose }) {
  const { t } = useTranslation();
  const p = payload || {};
  const [rect, setRect] = useState(null);       // in CSS px of this window
  const [cur, setCur] = useState(null);
  const drag = useRef(null);
  const [vw, setVw] = useState(window.innerWidth);
  const [vh, setVh] = useState(window.innerHeight);

  useEffect(() => {
    const r = () => { setVw(window.innerWidth); setVh(window.innerHeight); };
    window.addEventListener('resize', r);
    return () => window.removeEventListener('resize', r);
  }, []);

  const toImage = useCallback((r) => {
    const sx = (p.width || vw) / vw;
    const sy = (p.height || vh) / vh;
    return { x: Math.round(r.x * sx), y: Math.round(r.y * sy), w: Math.max(1, Math.round(r.w * sx)), h: Math.max(1, Math.round(r.h * sy)) };
  }, [p.width, p.height, vw, vh]);

  const confirm = useCallback(() => { if (rect && rect.w >= 2 && rect.h >= 2) onSubmit(toImage(rect)); }, [rect, onSubmit, toImage]);

  useEffect(() => {
    const key = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      else if (e.key === 'Enter') { e.preventDefault(); confirm(); }
      else if (e.key === 'a' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); setRect({ x: 0, y: 0, w: vw, h: vh }); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose, confirm, vw, vh]);

  const norm = (a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });
  const down = (e) => {
    if (e.button !== 0) return;
    if (e.target.closest && e.target.closest('.actions')) return;
    drag.current = { x: e.clientX, y: e.clientY };
    setRect(null);
  };
  const move = (e) => {
    setCur({ x: e.clientX, y: e.clientY });
    if (drag.current) setRect(norm(drag.current, { x: e.clientX, y: e.clientY }));
  };
  const up = (e) => {
    if (!drag.current) return;
    const r = norm(drag.current, { x: e.clientX, y: e.clientY });
    drag.current = null;
    setRect(r.w >= 2 && r.h >= 2 ? r : null);
  };

  const imgRect = rect ? toImage(rect) : null;
  const labelTop = rect ? (rect.y > 30 ? rect.y - 28 : rect.y + rect.h + 6) : 0;
  const actionsTop = rect ? (rect.y + rect.h + 40 < vh ? rect.y + rect.h + 8 : Math.max(8, rect.y - 40)) : 0;

  return (
    <div className="region" onPointerDown={down} onPointerMove={move} onPointerUp={up} onDoubleClick={confirm} onContextMenu={(e) => { e.preventDefault(); onClose(); }}>
      {p.dataUrl ? <img src={p.dataUrl} alt="" draggable={false} /> : null}
      {rect ? (
        <>
          <div className="shade" style={{ left: 0, top: 0, width: vw, height: rect.y }} />
          <div className="shade" style={{ left: 0, top: rect.y + rect.h, width: vw, height: Math.max(0, vh - rect.y - rect.h) }} />
          <div className="shade" style={{ left: 0, top: rect.y, width: rect.x, height: rect.h }} />
          <div className="shade" style={{ left: rect.x + rect.w, top: rect.y, width: Math.max(0, vw - rect.x - rect.w), height: rect.h }} />
          <div className="box" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} />
          <div className="label" style={{ left: rect.x, top: labelTop }}>{t('region.size', { w: imgRect.w, h: imgRect.h })}</div>
          {!drag.current ? (
            <div className="actions" style={{ left: Math.min(rect.x, vw - 180), top: actionsTop }} onPointerDown={(e) => e.stopPropagation()}>
              <button className="btn primary" onClick={confirm}><Icon name="check" />{t('region.confirm')}</button>
              <button className="btn" onClick={onClose}>{t('region.cancel')}</button>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <div className="shade" style={{ inset: 0, width: vw, height: vh }} />
          {cur ? <><div className="cross-h" style={{ top: cur.y }} /><div className="cross-v" style={{ left: cur.x }} /></> : null}
        </>
      )}
      <div className="hint">{t('region.hint')}</div>
    </div>
  );
}
