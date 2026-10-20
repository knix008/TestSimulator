// The overview in the corner of the canvas: the whole map drawn small
// (boxes in their colours and the lines), with the visible part as a frame.
// Click or drag in it to move the view there.
import React, { useRef } from 'react';
import { t } from '../lib/i18n';

const W = 200, H = 130;

export function Overview({ L, ms, view, size, onMove }) {
  const ref = useRef(null);
  if (!L || !view) return null;
  const b = L.bounds;
  const bw = Math.max(1, b.x1 - b.x0), bh = Math.max(1, b.y1 - b.y0);
  const s = Math.min((W - 12) / bw, (H - 12) / bh);
  const ox = (W - bw * s) / 2 - b.x0 * s, oy = (H - bh * s) / 2 - b.y0 * s;
  // the visible part of the map, in map coordinates
  const vx = -view.x / view.k, vy = -view.y / view.k, vw = size.w / view.k, vh = size.h / view.k;
  const go = (e) => {
    const r = ref.current.getBoundingClientRect();
    const mx = (e.clientX - r.left - ox) / s, my = (e.clientY - r.top - oy) / s;
    onMove({ ...view, x: size.w / 2 - mx * view.k, y: size.h / 2 - my * view.k });
  };
  return (
    <div className="overview" title={t('overview_tip')}>
      <svg ref={ref} width={W} height={H}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); go(e); }}
        onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) go(e); }}>
        <rect width={W} height={H} fill={ms.bg} />
        <g transform={`translate(${ox} ${oy}) scale(${s})`}>
          {L.lines.map((l) => (l.fill && l.fill !== 'none' && l.kind !== 'callout'
            ? <path key={l.id} d={l.d} fill={l.fill} opacity="0.8" />
            : <path key={l.id} d={l.d} fill="none" stroke={l.stroke || ms.line.color} strokeWidth={Math.max(1 / s, l.width || 1)} opacity="0.8" />))}
          {L.order.map((n) => (
            <rect key={n.id} x={n.x} y={n.y} width={n.w} height={n.h} rx={4}
              fill={n.st.fill && n.st.fill !== 'none' ? n.st.fill : n.st.branch || ms.line.color} opacity={n.st.fill && n.st.fill !== 'none' ? 1 : 0.45} />
          ))}
          <rect className="overview-frame" x={vx} y={vy} width={vw} height={vh} style={{ strokeWidth: 1.5 / s }} />
        </g>
      </svg>
    </div>
  );
}

export default Overview;
