// Presentation (보기 › 프레젠테이션, F5): the map full screen, one slide per
// main topic — the camera glides to that branch and the rest of the map
// fades — between an overview at the start and at the end.
// → Space PageDown: next · ← PageUp: previous · Home / End · Esc: leave.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../lib/i18n';
import { renderMapBody } from '../lib/render';
import { measureText } from '../lib/measure';
import { subtreeIds, mapTitle } from '../lib/model';
import { Icon } from './Icons';

function boundsOf(L, ids) {
  let b = null;
  for (const id of ids) {
    const n = L.nodes.get(id);
    if (!n) continue;
    const nb = { x0: n.x, y0: n.y, x1: n.x + n.w, y1: n.y + n.h };
    b = b ? { x0: Math.min(b.x0, nb.x0), y0: Math.min(b.y0, nb.y0), x1: Math.max(b.x1, nb.x1), y1: Math.max(b.y1, nb.y1) } : nb;
  }
  return b;
}

export function Presentation({ map, L, ms, onClose }) {
  const host = useRef(null);
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight });
  const [i, setI] = useState(0);
  const markup = useMemo(() => renderMapBody(map, L, ms, { static: true, measure: measureText }), [map, L, ms]);
  const slides = useMemo(() => {
    const out = [{ title: mapTitle(map), ids: null }];
    const mains = (map.root.children || []).filter((c) => L.nodes.has(c.id));
    for (const m of mains) out.push({ title: String(m.text || '').split('\n')[0], ids: [map.root.id, ...subtreeIds(map, m.id).filter((id) => L.nodes.has(id))] });
    for (const f of (map.floating || []).filter((x) => L.nodes.has(x.id))) out.push({ title: String(f.text || '').split('\n')[0], ids: subtreeIds(map, f.id).filter((id) => L.nodes.has(id)) });
    if (out.length > 1) out.push({ title: mapTitle(map), ids: null, end: true });
    return out;
  }, [map, L]);
  const slide = slides[Math.min(i, slides.length - 1)];

  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    document.documentElement.requestFullscreen?.().catch(() => {});
    return () => {
      window.removeEventListener('resize', onResize);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (['ArrowRight', 'PageDown', ' ', 'Enter', 'ArrowDown'].includes(e.key)) { e.preventDefault(); setI((x) => Math.min(slides.length - 1, x + 1)); }
      else if (['ArrowLeft', 'PageUp', 'Backspace', 'ArrowUp'].includes(e.key)) { e.preventDefault(); setI((x) => Math.max(0, x - 1)); }
      else if (e.key === 'Home') { e.preventDefault(); setI(0); }
      else if (e.key === 'End') { e.preventDefault(); setI(slides.length - 1); }
      else if (e.key === 'Escape' || e.key === 'F5') { e.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [slides.length, onClose]);

  const b = (slide.ids ? boundsOf(L, slide.ids) : null) || L.bounds;
  const pad = 70;
  const k = Math.min(2.2, (size.w - pad * 2) / Math.max(1, b.x1 - b.x0), (size.h - pad * 2 - 60) / Math.max(1, b.y1 - b.y0));
  const tx = size.w / 2 - ((b.x0 + b.x1) / 2) * k, ty = (size.h - 60) / 2 - ((b.y0 + b.y1) / 2) * k;
  const dim = slide.ids
    ? `.pres-layer .tm-topic,.pres-layer .tm-line,.pres-layer .tm-rel,.pres-layer .tm-boundary,.pres-layer .tm-extra{opacity:.12;transition:opacity .5s}${slide.ids.map((id) => `.pres-layer [data-id="${CSS.escape(id)}"],.pres-layer [data-line="${CSS.escape(id)}"],.pres-layer [data-boundary="${CSS.escape(id)}"]`).join(',')}{opacity:1}`
    : '.pres-layer *{transition:opacity .5s}';

  return (
    <div className="presentation" ref={host} style={{ background: ms.bg }} onClick={(e) => { if (e.target.closest('.pres-bar')) return; setI((x) => Math.min(slides.length - 1, x + 1)); }}>
      <svg width={size.w} height={size.h - 60}>
        <style>{dim}</style>
        <g className="pres-cam" style={{ transform: `translate(${tx}px, ${ty}px) scale(${k})` }}>
          <g className="pres-layer" dangerouslySetInnerHTML={{ __html: markup }} />
        </g>
      </svg>
      <div className="pres-bar" style={{ color: ms.dark ? '#e9eef5' : '#1f2933' }}>
        <button type="button" className="pres-btn" disabled={i === 0} onClick={() => setI(Math.max(0, i - 1))} title={t('pres_prev')}><Icon name="chevronLeft" size={18} /></button>
        <span className="pres-title">{slide.title}</span>
        <span className="pres-count">{`${Math.min(i, slides.length - 1) + 1} / ${slides.length}`}</span>
        <button type="button" className="pres-btn" disabled={i >= slides.length - 1} onClick={() => setI(Math.min(slides.length - 1, i + 1))} title={t('pres_next')}><Icon name="chevronRight" size={18} /></button>
        <button type="button" className="pres-btn" onClick={onClose} title={t('pres_exit')}><Icon name="close" size={16} /></button>
      </div>
      <div className="pres-progress"><span style={{ width: `${((i + 1) / slides.length) * 100}%`, background: ms.line.color }} /></div>
    </div>
  );
}

export default Presentation;
