// Port of Controls/CanvasRuler.cs — tick marks along the canvas edges.
import { useEffect, useRef } from 'react';
import type { Palette } from '../render/theme';

export const RULER_SIZE = 20;

interface Props {
  orientation: 'horizontal' | 'vertical' | 'corner';
  palette: Palette;
  zoom: number;
  /** Scroll offset in screen pixels. */
  offset: number;
  /** Visible length in screen pixels. */
  length: number;
}

/** Choose a tick spacing that stays roughly 60–140 screen px apart. */
function chooseStep(zoom: number): number {
  const candidates = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
  for (const step of candidates) {
    if (step * zoom >= 60) return step;
  }
  return candidates[candidates.length - 1];
}

export function CanvasRuler({ orientation, palette, zoom, offset, length }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (orientation === 'corner') return;
    const canvas = canvasRef.current;
    if (!canvas || length <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    const w = orientation === 'horizontal' ? length : RULER_SIZE;
    const h = orientation === 'horizontal' ? RULER_SIZE : length;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = palette.rulerBackground;
    ctx.fillRect(0, 0, w, h);

    const step = chooseStep(zoom);
    const minor = step / 5;
    const startWorld = Math.floor(offset / zoom / minor) * minor;
    const endWorld = (offset + length) / zoom;

    ctx.font = '9px system-ui, sans-serif';
    ctx.fillStyle = palette.rulerText;
    ctx.textBaseline = 'top';
    ctx.lineWidth = 1;

    for (let world = startWorld; world <= endWorld; world += minor) {
      const screen = Math.round(world * zoom - offset) + 0.5;
      const isMajor = Math.abs(world % step) < 0.001;
      ctx.strokeStyle = isMajor ? palette.rulerMajorTick : palette.rulerTick;
      const tickLength = isMajor ? RULER_SIZE : RULER_SIZE / 3;

      ctx.beginPath();
      if (orientation === 'horizontal') {
        ctx.moveTo(screen, RULER_SIZE - tickLength);
        ctx.lineTo(screen, RULER_SIZE);
      } else {
        ctx.moveTo(RULER_SIZE - tickLength, screen);
        ctx.lineTo(RULER_SIZE, screen);
      }
      ctx.stroke();

      if (isMajor) {
        ctx.fillStyle = palette.rulerText;
        const label = String(Math.round(world));
        if (orientation === 'horizontal') {
          ctx.textAlign = 'left';
          ctx.fillText(label, screen + 2, 2);
        } else {
          ctx.save();
          ctx.translate(2, screen + 2);
          ctx.rotate(-Math.PI / 2);
          ctx.textAlign = 'right';
          ctx.fillText(label, 0, 0);
          ctx.restore();
        }
      }
    }

    ctx.strokeStyle = palette.rulerBorder;
    ctx.beginPath();
    if (orientation === 'horizontal') {
      ctx.moveTo(0, RULER_SIZE - 0.5);
      ctx.lineTo(w, RULER_SIZE - 0.5);
    } else {
      ctx.moveTo(RULER_SIZE - 0.5, 0);
      ctx.lineTo(RULER_SIZE - 0.5, h);
    }
    ctx.stroke();
  }, [orientation, palette, zoom, offset, length]);

  if (orientation === 'corner') {
    return <div className="ruler-corner" style={{ background: palette.rulerBackground }} />;
  }

  return <canvas ref={canvasRef} className={`ruler ruler-${orientation}`} />;
}
