// Rulers along the top and left of the canvas, in design pixels (0 … 512), with the same steps
// as the grid (labels on major lines, short ticks on the 5 minor ones) and the pointer's
// position as a red mark. Colours come from the theme (--ruler, --text, --muted).
import React, { useLayoutEffect, useRef } from 'react';
import { CANVAS, gridSteps } from '../lib/iconCanvas.js';

const SIZE = 22;

function draw(canvas, horizontal, zoom, cursor) {
  const svg = document.querySelector('.icon-canvas');
  if (!canvas || !svg) return;
  const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
  const box = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(box.width * ratio));
  const h = Math.max(1, Math.round(box.height * ratio));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const c = canvas.getContext('2d');
  c.setTransform(ratio, 0, 0, ratio, 0, 0);
  const css = getComputedStyle(document.documentElement);
  const v = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
  const length = horizontal ? box.width : box.height;
  c.fillStyle = v('--ruler', '#1b2536');
  c.fillRect(0, 0, box.width, box.height);
  const s = svg.getBoundingClientRect();
  const origin = horizontal ? s.left - box.left : s.top - box.top;
  const scale = (horizontal ? s.width : s.height) / CANVAS;
  const { major, minor } = gridSteps(zoom);
  const from = Math.floor(-origin / scale / minor) * minor;
  const to = (length - origin) / scale;
  c.strokeStyle = v('--muted', '#8899aa');
  c.fillStyle = v('--text', '#e6edf7');
  c.font = '10px Segoe UI, sans-serif';
  c.lineWidth = 1;
  c.beginPath();
  for (let d = from; d <= to; d += minor) {
    const p = Math.round(origin + d * scale) + 0.5;
    const isMajor = Math.abs(d / major - Math.round(d / major)) < 1e-6;
    const tick = isMajor ? SIZE : d % (major / 2) === 0 && major % 2 === 0 ? SIZE * 0.45 : SIZE * 0.28;
    if (horizontal) { c.moveTo(p, SIZE); c.lineTo(p, SIZE - tick); } else { c.moveTo(SIZE, p); c.lineTo(SIZE - tick, p); }
    if (isMajor) {
      const label = String(Math.round(d));
      if (horizontal) c.fillText(label, p + 3, 10);
      else { c.save(); c.translate(10, p + 3); c.rotate(-Math.PI / 2); c.fillText(label, -c.measureText(label).width - 3, 0); c.restore(); }
    }
  }
  c.stroke();
  // The canvas itself (0 … 512) is marked with the accent colour along the edge.
  c.fillStyle = v('--accent', '#4f9cff');
  if (horizontal) c.fillRect(origin, SIZE - 2, CANVAS * scale, 2); else c.fillRect(SIZE - 2, origin, 2, CANVAS * scale);
  // The pointer: a red line and triangle.
  if (cursor) {
    const p = Math.round(origin + (horizontal ? cursor[0] : cursor[1]) * scale) + 0.5;
    c.strokeStyle = '#ef4444';
    c.fillStyle = '#ef4444';
    c.lineWidth = 1.5;
    c.beginPath();
    if (horizontal) { c.moveTo(p, 0); c.lineTo(p, SIZE); } else { c.moveTo(0, p); c.lineTo(SIZE, p); }
    c.stroke();
    c.beginPath();
    if (horizontal) { c.moveTo(p - 5, 0); c.lineTo(p + 5, 0); c.lineTo(p, 6); } else { c.moveTo(0, p - 5); c.lineTo(0, p + 5); c.lineTo(6, p); }
    c.fill();
  }
}

export default function Rulers({ zoom, pan, cursor, theme }) {
  const top = useRef(null);
  const left = useRef(null);
  useLayoutEffect(() => {
    const paint = () => { draw(top.current, true, zoom, cursor); draw(left.current, false, zoom, cursor); };
    paint();
    const observer = new ResizeObserver(paint);
    if (top.current) observer.observe(top.current);
    if (left.current) observer.observe(left.current);
    return () => observer.disconnect();
  }, [zoom, pan, cursor, theme]);
  return (
    <>
      <div className="ruler-corner" aria-hidden="true">px</div>
      <canvas ref={top} className="ruler ruler-top" aria-hidden="true" data-testid="ruler-top" />
      <canvas ref={left} className="ruler ruler-left" aria-hidden="true" data-testid="ruler-left" />
    </>
  );
}
