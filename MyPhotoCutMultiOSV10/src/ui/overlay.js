// Overlay effects drawn on a canvas over a finished caricature: frame, caption, speech bubble and
// stickers (crown on the head, glasses on the eyes, hearts, stars, sparkles, flowers). They need
// fonts, so they are drawn here and not in the worker. Sizes are given for a 600-pixel picture
// and scale with the picture; a frame makes the canvas larger.
import { effectDef } from '../engine/effects.js';

const unitOf = (w, h) => Math.max(0.35, Math.max(w, h) / 600);
const FONT = '"Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif';

/** The extra space a frame adds around the picture: { left, top, right, bottom }. */
export function frameMargins(effects, width, height) {
  const frame = (effects ?? []).filter((e) => e?.on && e.id === 'frame').at(-1);
  if (!frame) return { left: 0, top: 0, right: 0, bottom: 0 };
  const u = unitOf(width, height);
  const w = Math.round((frame.width ?? 24) * u);
  if (frame.style === 'polaroid') return { left: w, top: w, right: w, bottom: Math.round(w * 3.2) };
  if (frame.style === 'film') return { left: Math.round(w * 0.6), top: Math.round(w * 1.6), right: Math.round(w * 0.6), bottom: Math.round(w * 1.6) };
  return { left: w, top: w, right: w, bottom: w };
}

/**
 * Draws a finished caricature with its overlays into a new canvas.
 * `image` = { width, height, data } (the worker's pixels), `features` = where the face is in it.
 */
export function composeCanvas(image, effects = [], features = null, canvas = document.createElement('canvas')) {
  const m = frameMargins(effects, image.width, image.height);
  canvas.width = image.width + m.left + m.right;
  canvas.height = image.height + m.top + m.bottom;
  const ctx = canvas.getContext('2d');
  const frame = (effects ?? []).filter((e) => e?.on && e.id === 'frame').at(-1);
  if (frame) drawFrameBack(ctx, frame, canvas.width, canvas.height, m, image);
  ctx.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), m.left, m.top);
  ctx.save();
  ctx.translate(m.left, m.top);
  const u = unitOf(image.width, image.height);
  for (const effect of effects ?? []) {
    if (!effect?.on || !effectDef(effect.id)?.overlay || effect.id === 'frame') continue;
    if (effect.id === 'caption') drawCaption(ctx, effect, image.width, image.height, u);
    else if (effect.id === 'bubble') drawBubble(ctx, effect, image.width, image.height, u, features);
    else if (effect.id === 'sticker') drawSticker(ctx, effect, image.width, image.height, u, features);
  }
  ctx.restore();
  if (frame) drawFrameFront(ctx, frame, canvas.width, canvas.height, m, image, u);
  return canvas;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawFrameBack(ctx, frame, W, H, m) {
  ctx.fillStyle = frame.style === 'film' ? '#111111' : frame.color;
  if (frame.style === 'rounded') {
    ctx.clearRect(0, 0, W, H);
    roundRect(ctx, 0, 0, W, H, Math.min(W, H) * 0.06);
    ctx.fill();
  } else ctx.fillRect(0, 0, W, H);
  if (frame.style === 'film') {
    // Sprocket holes along the top and bottom.
    ctx.fillStyle = '#f2f2f2';
    const hole = Math.max(4, m.top * 0.35);
    for (let x = hole; x < W - hole; x += hole * 2.2) {
      roundRect(ctx, x, m.top * 0.32, hole * 1.2, hole, hole * 0.2); ctx.fill();
      roundRect(ctx, x, H - m.bottom * 0.32 - hole, hole * 1.2, hole, hole * 0.2); ctx.fill();
    }
  }
}

function drawFrameFront(ctx, frame, W, H, m, image, u) {
  if (frame.style === 'rounded') {
    // Round the picture's own corners inside the frame.
    ctx.save();
    ctx.globalCompositeOperation = 'destination-in';
    roundRect(ctx, 0, 0, W, H, Math.min(W, H) * 0.06);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = frame.color;
    ctx.lineWidth = Math.max(2, m.left * 0.6);
    roundRect(ctx, m.left, m.top, image.width, image.height, Math.min(W, H) * 0.04);
    ctx.stroke();
    ctx.restore();
  } else if (frame.style === 'stamp') {
    // Perforated edge: bites out of the border.
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    const r = Math.max(3, m.left * 0.42);
    for (let x = r; x < W; x += r * 2.6) { circle(ctx, x, 0, r); circle(ctx, x, H, r); }
    for (let y = r; y < H; y += r * 2.6) { circle(ctx, 0, y, r); circle(ctx, W, y, r); }
    ctx.restore();
  } else if (frame.style === 'polaroid') {
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = Math.max(1, u);
    ctx.strokeRect(m.left - 0.5, m.top - 0.5, image.width + 1, image.height + 1);
    ctx.restore();
  }
}

function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }

/** Text broken into lines that fit `width`. */
function wrap(ctx, text, width) {
  const lines = [];
  for (const paragraph of String(text).split(/\r?\n/)) {
    let line = '';
    for (const word of paragraph.split(/(\s+)/)) {
      const next = line + word;
      if (ctx.measureText(next).width > width && line.trim()) { lines.push(line.trim()); line = word.trimStart(); } else line = next;
      // A single long word (Korean without spaces) is broken by characters.
      while (ctx.measureText(line).width > width && line.length > 1) {
        let cut = line.length - 1;
        while (cut > 1 && ctx.measureText(line.slice(0, cut)).width > width) cut--;
        lines.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    lines.push(line.trim());
  }
  return lines.filter((l, i, all) => l || all.length === 1);
}

function drawCaption(ctx, e, w, h, u) {
  const text = String(e.text ?? '').trim();
  if (!text) return;
  const size = Math.max(8, e.size * u);
  ctx.font = `800 ${size}px ${FONT}`;
  const lines = wrap(ctx, text, w * 0.9);
  const lineH = size * 1.2;
  const band = lines.length * lineH + size * 0.6;
  const y0 = e.position === 'top' ? 0 : h - band;
  if (e.bandOpacity > 0) {
    ctx.save();
    ctx.globalAlpha = e.bandOpacity / 100;
    ctx.fillStyle = e.band;
    ctx.fillRect(0, y0, w, band);
    ctx.restore();
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, size * 0.14);
  ctx.strokeStyle = 'rgba(0,0,0,0.65)';
  ctx.fillStyle = e.color;
  lines.forEach((line, i) => {
    const y = y0 + size * 0.3 + lineH * (i + 0.5);
    ctx.strokeText(line, w / 2, y);
    ctx.fillText(line, w / 2, y);
  });
}

function drawBubble(ctx, e, w, h, u, f) {
  const text = String(e.text ?? '').trim();
  if (!text) return;
  const size = Math.max(8, e.size * u);
  ctx.font = `700 ${size}px ${FONT}`;
  const maxW = w * 0.42;
  const lines = wrap(ctx, text, maxW);
  const textW = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const pad = size * 0.7;
  const bw = textW + pad * 2;
  const bh = lines.length * size * 1.25 + pad * 1.4;
  const right = e.side !== 'left';
  const mouth = f?.mouth ?? { x: w / 2, y: h * 0.55 };
  const x = right ? Math.min(w - bw - 6 * u, Math.max(w * 0.52, mouth.x + (f?.face.rx ?? w * 0.2) * 0.6)) : Math.max(6 * u, Math.min(w * 0.48 - bw, mouth.x - (f?.face.rx ?? w * 0.2) * 0.6 - bw));
  const y = Math.max(6 * u, Math.min(h - bh - 40 * u, (f?.face.cy ?? h * 0.4) - (f?.face.ry ?? h * 0.25) * 0.9 - bh * 0.3));
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#1b1b22';
  ctx.lineWidth = Math.max(2, 3 * u);
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 6 * u;
  roundRect(ctx, x, y, bw, bh, Math.min(bw, bh) * 0.35);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.stroke();
  // The tail points at the mouth.
  const baseX = right ? x + bw * 0.22 : x + bw * 0.78;
  ctx.beginPath();
  ctx.moveTo(baseX - size * 0.45, y + bh - ctx.lineWidth);
  ctx.lineTo(mouth.x + (right ? 1 : -1) * size * 0.4, Math.min(h - 4, mouth.y - size * 0.2));
  ctx.lineTo(baseX + size * 0.45, y + bh - ctx.lineWidth);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(baseX - size * 0.45, y + bh);
  ctx.lineTo(mouth.x + (right ? 1 : -1) * size * 0.4, Math.min(h - 4, mouth.y - size * 0.2));
  ctx.lineTo(baseX + size * 0.45, y + bh);
  ctx.stroke();
  ctx.fillStyle = '#1b1b22';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((line, i) => ctx.fillText(line, x + bw / 2, y + pad * 0.7 + size * 1.25 * (i + 0.5)));
  ctx.restore();
}

const EMOJI = { hearts: '❤️', stars: '⭐', sparkles: '✨', flowers: '🌸' };

function drawSticker(ctx, e, w, h, u, f) {
  const k = e.size / 100;
  const face = f?.face ?? { cx: w / 2, cy: h * 0.4, rx: w * 0.2, ry: w * 0.26, angle: 0 };
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (e.kind === 'crown') {
    const cw = face.rx * 1.3 * k;
    const ch = cw * 0.55;
    const top = f?.forehead ?? { x: face.cx, y: face.cy - face.ry };
    const cx = top.x;
    const cy = top.y - face.ry * 0.32 - ch * 0.4;
    ctx.translate(cx, cy);
    ctx.rotate(face.angle ?? 0);
    const g = ctx.createLinearGradient(0, -ch / 2, 0, ch / 2);
    g.addColorStop(0, '#ffe680');
    g.addColorStop(1, '#e0a400');
    ctx.fillStyle = g;
    ctx.strokeStyle = '#8a5a00';
    ctx.lineWidth = Math.max(1.5, 2.5 * u);
    ctx.beginPath();
    ctx.moveTo(-cw / 2, ch / 2);
    ctx.lineTo(-cw / 2, -ch / 4);
    ctx.lineTo(-cw / 4, ch / 8);
    ctx.lineTo(0, -ch / 2);
    ctx.lineTo(cw / 4, ch / 8);
    ctx.lineTo(cw / 2, -ch / 4);
    ctx.lineTo(cw / 2, ch / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    for (const [x, c] of [[-cw / 4, '#e53950'], [0, '#3a7bff'], [cw / 4, '#2ecc71']]) {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(x, ch * 0.22, ch * 0.11, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (e.kind === 'glasses' && f) {
    const [l, r] = f.eyes;
    const radius = Math.max(l.r, r.r) * 1.25 * k;
    const ang = Math.atan2(r.y - l.y, r.x - l.x);
    ctx.lineWidth = Math.max(2, radius * 0.18);
    ctx.strokeStyle = '#111';
    ctx.fillStyle = 'rgba(20,20,30,0.82)';
    for (const eye of [l, r]) {
      ctx.save();
      ctx.translate(eye.x, eye.y);
      ctx.rotate(ang);
      roundRect(ctx, -radius * 1.15, -radius * 0.75, radius * 2.3, radius * 1.5, radius * 0.45);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(-radius * 0.8, -radius * 0.5, radius * 0.5, radius * 0.18);
      ctx.restore();
      ctx.fillStyle = 'rgba(20,20,30,0.82)';
    }
    ctx.beginPath();
    ctx.moveTo(l.x + Math.cos(ang) * radius * 1.15, l.y + Math.sin(ang) * radius * 1.15);
    ctx.quadraticCurveTo((l.x + r.x) / 2, (l.y + r.y) / 2 - radius * 0.3, r.x - Math.cos(ang) * radius * 1.15, r.y - Math.sin(ang) * radius * 1.15);
    ctx.stroke();
  } else {
    // Scattered small stickers around the head.
    const glyph = EMOJI[e.kind] ?? EMOJI.sparkles;
    let seed = 7;
    const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const count = 9;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + random() * 0.5;
      const dist = 1.2 + random() * 0.35;
      const x = face.cx + Math.cos(a) * face.rx * dist * 1.25;
      const y = face.cy + Math.sin(a) * face.ry * dist;
      if (x < 0 || y < 0 || x > w || y > h) continue;
      const size = (22 + random() * 22) * u * k;
      ctx.font = `${size}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
      ctx.fillText(glyph, x, y);
    }
  }
  ctx.restore();
}
