// Sample media the app draws itself (no files needed: start screen samples, the tutorial, the tests) and
// the sample scene collections of the start page. `sample:<name>` values resolve here (bc/platform.js).
import { addFilter, addItem, addScene, createCollection, createSource, currentScene } from './model.js';

const cache = new Map();

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
const toUrl = (c) => new Promise((resolve) => c.toBlob((b) => resolve(URL.createObjectURL(b)), 'image/png'));

/** The sample pictures: name → drawing. */
const DRAW = {
  // SMPTE-like colour bars with a title band.
  bars(ctx, w, h) {
    const colors = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'];
    colors.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect((i * w) / 7, 0, w / 7 + 1, h * 0.67); });
    const low = ['#0000c0', '#131313', '#c000c0', '#131313', '#00c0c0', '#131313', '#c0c0c0'];
    low.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect((i * w) / 7, h * 0.67, w / 7 + 1, h * 0.08); });
    ctx.fillStyle = '#101010'; ctx.fillRect(0, h * 0.75, w, h * 0.25);
    ctx.fillStyle = '#fff'; ctx.font = `700 ${h * 0.09}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('MyBroadcasting', w / 2, h * 0.9);
  },
  // A studio backdrop: dark gradient with soft light spots.
  studio(ctx, w, h) {
    const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#0d1b3d'); g.addColorStop(1, '#3a0f4a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) {
      const x = ((i * 0.13 + 0.07) % 1) * w; const y = ((i * 0.29 + 0.2) % 1) * h; const r = h * (0.15 + (i % 3) * 0.08);
      const s = ctx.createRadialGradient(x, y, 0, x, y, r); s.addColorStop(0, 'rgba(120,170,255,0.35)'); s.addColorStop(1, 'rgba(120,170,255,0)');
      ctx.fillStyle = s; ctx.fillRect(0, 0, w, h);
    }
  },
  // A green screen card with a person-like silhouette (chroma key demo).
  greenscreen(ctx, w, h) {
    ctx.fillStyle = '#00ff00'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f0c8a0'; ctx.beginPath(); ctx.arc(w / 2, h * 0.36, h * 0.14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2a4a9a'; ctx.beginPath(); ctx.ellipse(w / 2, h * 0.92, w * 0.22, h * 0.36, 0, Math.PI, 0); ctx.fill();
  },
  // A lower-third bar (transparent around it).
  lowerthird(ctx, w, h) {
    const g = ctx.createLinearGradient(0, 0, w, 0); g.addColorStop(0, 'rgba(229,72,77,0.95)'); g.addColorStop(1, 'rgba(229,72,77,0)');
    ctx.fillStyle = g; ctx.fillRect(0, h * 0.2, w, h * 0.6);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, h * 0.2, w * 0.012, h * 0.6);
  },
  // A round logo with transparency.
  logo(ctx, w, h) {
    const r = Math.min(w, h) / 2 - 4;
    const g = ctx.createRadialGradient(w / 2 - r / 3, h / 2 - r / 3, r / 8, w / 2, h / 2, r); g.addColorStop(0, '#ff7a7f'); g.addColorStop(1, '#b3121a');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `800 ${r * 0.62}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('ON', w / 2, h / 2 + r * 0.04);
  },
  // Frames for the slide show.
  slide1(ctx, w, h) { DRAW.studio(ctx, w, h); label(ctx, w, h, '1', '#5aa9ff'); },
  slide2(ctx, w, h) { ctx.fillStyle = '#1f3d2b'; ctx.fillRect(0, 0, w, h); label(ctx, w, h, '2', '#3ddc84'); },
  slide3(ctx, w, h) { ctx.fillStyle = '#3d2a1f'; ctx.fillRect(0, 0, w, h); label(ctx, w, h, '3', '#ffb454'); },
  // A gradient mask (image mask filter demo): white centre fading out.
  vignette(ctx, w, h) { const g = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, h * 0.7); g.addColorStop(0, '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); },
  // A webcam stand-in: a face card (when there is no camera).
  guest(ctx, w, h) {
    ctx.fillStyle = '#2b2f3a'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f0c8a0'; ctx.beginPath(); ctx.arc(w / 2, h * 0.42, h * 0.18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6a7cff'; ctx.beginPath(); ctx.ellipse(w / 2, h, w * 0.3, h * 0.38, 0, Math.PI, 0); ctx.fill();
  },
};
const SIZES = { logo: [256, 256], lowerthird: [1280, 160], guest: [640, 360] };
function label(ctx, w, h, text, color) { ctx.fillStyle = color; ctx.font = `800 ${h * 0.4}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, w / 2, h / 2); }

export const SAMPLE_PICTURES = Object.keys(DRAW);

/** A PNG object URL of a sample picture (drawn once). */
export async function sampleUrl(name) {
  if (cache.has(name)) return cache.get(name);
  const draw = DRAW[name] ?? DRAW.bars;
  const [w, h] = SIZES[name] ?? [1920, 1080];
  const [c, ctx] = canvas(w, h);
  draw(ctx, w, h);
  const url = await toUrl(c);
  cache.set(name, url);
  return url;
}

/** Text samples: an identity LUT, a warm LUT, a chat log. */
export function sampleText(name) {
  if (name === 'warm.cube' || name === 'identity.cube') {
    const n = 9;
    let out = `TITLE "${name}"\nLUT_3D_SIZE ${n}\n`;
    for (let b = 0; b < n; b++) for (let g = 0; g < n; g++) for (let r = 0; r < n; r++) {
      let [R, G, B] = [r / (n - 1), g / (n - 1), b / (n - 1)];
      if (name === 'warm.cube') { R = Math.min(1, R * 1.12 + 0.03); B = B * 0.82; }
      out += `${R.toFixed(4)} ${G.toFixed(4)} ${B.toFixed(4)}\n`;
    }
    return out;
  }
  if (name === 'chat.txt') return ['viewer1: 안녕하세요!', 'viewer2: hello 👋', 'mod: 방송 시작했습니다', 'viewer3: 소리 잘 들려요', 'viewer4: GG'].join('\n');
  return '';
}

// ───────────────────────── sample scene collections (start page › Samples)

export const SAMPLE_COLLECTIONS = ['talk', 'gaming', 'lecture', 'music', 'news', 'countdown'];
export const SAMPLE_ICONS = { talk: 'smpTalk', gaming: 'smpGaming', lecture: 'smpLecture', music: 'smpMusic', news: 'smpNews', countdown: 'smpCountdown' };

const W = 1920; const H = 1080;
const text = (c, name, body, extra = {}) => createSource(c, 'text_gdiplus', name, { text: body, ...extra });

/** A ready-made scene collection. `t` gives the names in the UI language. */
export function sampleCollection(id, t = (k) => k) {
  const c = createCollection(t(`sample.${id}`));
  const first = currentScene(c);
  const bg = createSource(c, 'image_source', t('sample.src.background'), { file: 'sample:studio' });
  const logo = createSource(c, 'image_source', t('sample.src.logo'), { file: 'sample:logo' });
  const place = (scene, src, tr) => addItem(c, scene.id, src.id, tr);
  switch (id) {
    case 'gaming': {
      first.name = t('sample.scene.game');
      const game = createSource(c, 'image_source', t('sample.src.game'), { file: 'sample:bars' });
      place(first, game, { x: 0, y: 0 });
      const cam = createSource(c, 'image_source', t('sample.src.cam'), { file: 'sample:guest' });
      addFilter(c, cam.id, 'color_filter_v2', t('flt.color_filter_v2'), { saturation: 0.2 });
      place(first, cam, { x: 1440, y: 760, sx: 0.7, sy: 0.7 });
      place(first, text(c, t('sample.src.title'), 'LIVE · Game night', { font: { face: 'Arial', size: 54, bold: true }, outline: true, outline_size: 3 }), { x: 40, y: 30 });
      const brb = addScene(c, t('sample.scene.brb'));
      place(brb, bg, {});
      place(brb, text(c, t('sample.src.brb'), t('sample.text.brb'), { font: { face: 'Arial', size: 110, bold: true }, align: 'center', drop_shadow: true }), { x: W / 2, y: H / 2, align: 'center' });
      const start = addScene(c, t('sample.scene.starting'));
      place(start, bg, {});
      place(start, createSource(c, 'text_gdiplus', t('sample.src.countdown'), { text_mode: 'countdown', countdown_seconds: 300, countdown_end_text: 'LIVE!', font: { face: 'Arial', size: 160, bold: true } }), { x: W / 2, y: H / 2, align: 'center' });
      break;
    }
    case 'lecture': {
      first.name = t('sample.scene.slides');
      const slides = createSource(c, 'slideshow', t('sample.src.slides'), { files: ['sample:slide1', 'sample:slide2', 'sample:slide3'], slide_time: 4000 });
      place(first, slides, {});
      place(first, createSource(c, 'image_source', t('sample.src.cam'), { file: 'sample:guest' }), { x: 1500, y: 40, sx: 0.6, sy: 0.6 });
      place(first, text(c, t('sample.src.title'), t('sample.text.lecture'), { font: { face: 'Arial', size: 44 }, bk_opacity: 60, bk_color: '#000000' }), { x: 40, y: 1000 });
      const q = addScene(c, t('sample.scene.qna'));
      place(q, bg, {});
      place(q, createSource(c, 'image_source', t('sample.src.cam'), { file: 'sample:guest' }), { x: 0, y: 0, sx: 3, sy: 3 });
      break;
    }
    case 'music': {
      first.name = t('sample.scene.stage');
      place(first, bg, {});
      place(first, createSource(c, 'image_source', t('sample.src.cam'), { file: 'sample:guest' }), { x: 360, y: 120, sx: 1.9, sy: 1.9 });
      const lut = addFilter(c, bg.id, 'clut_filter', t('flt.clut_filter'), { image_path: 'sample:warm.cube' });
      void lut;
      place(first, text(c, t('sample.src.nowPlaying'), '♪ Now playing — Demo Song', { font: { face: 'Arial', size: 48, italic: true }, gradient: true }), { x: 60, y: 980 });
      break;
    }
    case 'news': {
      first.name = t('sample.scene.desk');
      place(first, bg, {});
      const anchor = createSource(c, 'image_source', t('sample.src.anchor'), { file: 'sample:greenscreen' });
      addFilter(c, anchor.id, 'chroma_key_filter_v2', t('flt.chroma_key_filter_v2'));
      place(first, anchor, { x: 560, y: 120, sx: 0.85, sy: 0.85 });
      place(first, createSource(c, 'image_source', t('sample.src.lowerThird'), { file: 'sample:lowerthird' }), { x: 0, y: 840 });
      place(first, text(c, t('sample.src.headline'), t('sample.text.headline'), { font: { face: 'Arial', size: 56, bold: true } }), { x: 60, y: 880 });
      const ticker = text(c, t('sample.src.ticker'), t('sample.text.ticker'), { font: { face: 'Arial', size: 36 } });
      addFilter(c, ticker.id, 'scroll_filter', t('flt.scroll_filter'), { speed_x: 120, limit_cx: true, cx: 1920 });
      place(first, ticker, { x: 0, y: 1020 });
      place(first, createSource(c, 'text_gdiplus', t('sample.src.clock'), { text_mode: 'clock', font: { face: 'Arial', size: 40, bold: true } }), { x: 1700, y: 40 });
      break;
    }
    case 'countdown': {
      first.name = t('sample.scene.starting');
      place(first, bg, {});
      place(first, createSource(c, 'text_gdiplus', t('sample.src.countdown'), { text_mode: 'countdown', countdown_seconds: 600, countdown_end_text: 'LIVE!', font: { face: 'Arial', size: 220, bold: true }, outline: true, outline_size: 4 }), { x: W / 2, y: H / 2, align: 'center' });
      place(first, text(c, t('sample.src.title'), t('sample.text.starting'), { font: { face: 'Arial', size: 72 }, align: 'center' }), { x: W / 2, y: 260, align: 'top' });
      const main = addScene(c, t('sample.scene.main'));
      place(main, createSource(c, 'image_source', t('sample.src.cam'), { file: 'sample:guest' }), { x: 0, y: 0, sx: 3, sy: 3 });
      break;
    }
    default: { // talk show
      first.name = t('sample.scene.talk');
      place(first, bg, {});
      place(first, createSource(c, 'image_source', t('sample.src.host'), { file: 'sample:guest' }), { x: 80, y: 220, sx: 1.4, sy: 1.4 });
      place(first, createSource(c, 'image_source', t('sample.src.guest'), { file: 'sample:guest' }), { x: 1000, y: 220, sx: 1.4, sy: 1.4 });
      place(first, text(c, t('sample.src.title'), t('sample.text.talk'), { font: { face: 'Arial', size: 64, bold: true }, align: 'center' }), { x: W / 2, y: 80, align: 'top' });
      const chat = text(c, t('sample.src.chat'), '', { read_from_file: true, file: 'sample:chat.txt', chatlog: true, chatlog_lines: 4, font: { face: 'Arial', size: 30 }, bk_opacity: 50 });
      place(first, chat, { x: 1380, y: 760 });
      const solo = addScene(c, t('sample.scene.solo'));
      place(solo, bg, {});
      place(solo, createSource(c, 'image_source', t('sample.src.host'), { file: 'sample:guest' }), { x: 0, y: 0, sx: 3, sy: 3 });
      break;
    }
  }
  // Every sample: the logo in the corner of the first scene, and a fade-to-colour and a luma wipe to try.
  place(first, logo, { x: 1800, y: 960, sx: 0.4, sy: 0.4 });
  return c;
}
