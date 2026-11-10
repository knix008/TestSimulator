// Soft drifting colour behind the window, the same idea as the reference app's start page.

function rgba(hex, alpha) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!match) return `rgba(120,140,180,${alpha})`;
  const value = parseInt(match[1], 16);
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},${alpha})`;
}

/** Starts a slow background on `canvas`. Returns a function that stops it. */
export function startBackdrop(canvas) {
  const ctx = canvas.getContext('2d');
  const orbs = Array.from({ length: 7 }, (_, index) => ({
    phase: index * 1.25,
    speed: 0.12 + (index % 3) * 0.05,
    radius: 0.2 + (index % 4) * 0.045,
  }));
  let frame = 0;
  let last = 0;
  let raf = 0;
  const draw = (now) => {
    raf = requestAnimationFrame(draw);
    if (document.hidden || now - last < 33) return;
    last = now;
    frame += 1;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width < 2 || height < 2) return;
    const pixelWidth = Math.round(width * dpr);
    const pixelHeight = Math.round(height * dpr);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const style = getComputedStyle(document.documentElement);
    const bg = style.getPropertyValue('--bg').trim() || '#eef1f6';
    const accent = style.getPropertyValue('--accent').trim() || '#3b6cff';
    const vivid = document.getElementById('app')?.classList.contains('on-start');
    const boost = vivid ? 1 : 0.45;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
    for (const orb of orbs) {
      const t = frame * 0.008 * orb.speed;
      const x = width * (0.5 + Math.cos(t + orb.phase) * 0.34);
      const y = height * (0.46 + Math.sin(t * 0.85 + orb.phase) * 0.28);
      const radius = Math.min(width, height) * orb.radius;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, rgba(accent, 0.26 * boost));
      gradient.addColorStop(1, rgba(accent, 0));
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = rgba(accent, vivid ? 0.16 : 0.06);
    ctx.lineWidth = 1;
    const cx = width * 0.7;
    const cy = height * 0.36;
    for (let ring = 1; ring <= 5; ring += 1) {
      ctx.beginPath();
      ctx.arc(cx, cy, ring * Math.min(width, height) * 0.075 + Math.sin(frame * 0.02 + ring) * 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  };
  raf = requestAnimationFrame(draw);
  return () => cancelAnimationFrame(raf);
}
