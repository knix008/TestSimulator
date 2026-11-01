import React, { useEffect, useRef } from 'react';
import { getScene, makeRandom, parseColor, START_BG_IDS } from '../lib/startbg.js';

const FRAME_MS = 1000 / 30;

function themeColors() {
  const css = getComputedStyle(document.documentElement);
  return {
    accent: parseColor(css.getPropertyValue('--accent'), [224, 87, 77]),
    text: parseColor(css.getPropertyValue('--text'), [239, 232, 229]),
  };
}

// The moving 3D picture behind the start screen. 30 frames a second at most,
// paused while the window is hidden; `opacity` and `speed` come from settings.
export default function StartBackground({ scene = 'books', opacity = 0.6, speed = 1 }) {
  const canvasRef = useRef(null);
  const speedRef = useRef(speed);
  speedRef.current = speed;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext?.('2d');
    if (!canvas || !ctx || typeof ctx.clearRect !== 'function') return undefined;
    const def = getScene(scene);
    let state = null;
    let w = 1;
    let h = 1;
    let colors = themeColors();
    let t = 0;
    let last = performance.now();
    let raf = 0;
    let frames = 0;
    let alive = true;

    const resize = () => {
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      w = Math.max(1, canvas.clientWidth);
      h = Math.max(1, canvas.clientHeight);
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(h * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      state = def.init(w, h, makeRandom(START_BG_IDS.indexOf(scene) * 7919 + 13));
    };
    resize();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    ro?.observe(canvas);

    const loop = (now) => {
      if (!alive) return;
      raf = requestAnimationFrame(loop);
      if (document.hidden || now - last < FRAME_MS - 2) return;
      const dt = Math.min(0.1, (now - last) / 1000) * speedRef.current;
      last = now;
      t += dt;
      if (frames++ % 30 === 0) colors = themeColors();   // follows a theme change
      ctx.clearRect(0, 0, w, h);
      try {
        def.draw(ctx, state, { t, dt, w, h, c: colors });
      } catch {
        /* a bad frame must never take the start screen down */
      }
      canvas.dataset.frames = String(frames);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, [scene]);

  return (
    <canvas
      ref={canvasRef}
      className="start-bg"
      aria-hidden="true"
      data-scene={scene}
      style={{ opacity }}
    />
  );
}
