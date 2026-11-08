// Built-in pictures: simple vector illustrations made from two colours and a seed, as
// data: URLs. The samples and new image blocks use them, so a site looks finished with no
// picture files at all; the user replaces them with their own (file, URL).

export const ART_KINDS = ['landscape', 'abstract', 'waves', 'city', 'food', 'portrait', 'product', 'office', 'nature', 'pattern', 'mountain', 'sea', 'cafe', 'book', 'travel', 'tech'];

/** A small deterministic random generator (the same seed → the same picture). */
function rng(seed) {
  let s = (Number(seed) || 1) >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const mix = (a, b, amount) => {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * amount).toString(16).padStart(2, '0')).join('')}`;
};
const safe = (color, fallback) => (/^#[0-9a-f]{6}$/i.test(String(color ?? '')) ? String(color).toLowerCase() : fallback);

function body(kind, c1, c2, r) {
  const light = mix(c1, '#ffffff', 0.75);
  const dark = mix(c1, '#000000', 0.35);
  const soft = mix(c2, '#ffffff', 0.55);
  const bg = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${soft}"/></linearGradient></defs><rect width="800" height="500" fill="url(#g)"/>`;
  switch (kind) {
    case 'landscape':
    case 'mountain':
      return `${bg}<circle cx="${560 + r() * 120}" cy="${110 + r() * 40}" r="${46 + r() * 20}" fill="${mix(c2, '#ffffff', 0.2)}"/><path d="M0 380 L${150 + r() * 60} ${200 + r() * 40} L320 360 L${470 + r() * 60} ${150 + r() * 50} L800 390 V500 H0Z" fill="${mix(c1, '#ffffff', 0.25)}"/><path d="M0 430 Q200 360 400 420 T800 410 V500 H0Z" fill="${dark}"/>`;
    case 'sea':
    case 'waves':
      return `${bg}${[0, 1, 2, 3].map((i) => `<path d="M0 ${260 + i * 60} Q100 ${230 + i * 60 - r() * 30} 200 ${260 + i * 60} T400 ${260 + i * 60} T600 ${260 + i * 60} T800 ${260 + i * 60} V500 H0Z" fill="${mix(c1, '#000000', i * 0.12)}" opacity="${0.55 + i * 0.12}"/>`).join('')}<circle cx="${150 + r() * 400}" cy="120" r="40" fill="${mix(c2, '#ffffff', 0.3)}"/>`;
    case 'city':
      return `${bg}${Array.from({ length: 11 }, (_, i) => { const w = 50 + r() * 30; const h = 120 + r() * 250; const x = i * 74; return `<rect x="${x}" y="${500 - h}" width="${w}" height="${h}" fill="${mix(dark, c2, r() * 0.4)}"/>${Array.from({ length: Math.floor(h / 40) }, (_, k) => `<rect x="${x + 10}" y="${500 - h + 14 + k * 36}" width="${w - 20}" height="12" fill="${light}" opacity="0.55"/>`).join('')}`; }).join('')}`;
    case 'food':
    case 'cafe':
      return `${bg}<ellipse cx="400" cy="300" rx="230" ry="150" fill="#ffffff" opacity="0.9"/><ellipse cx="400" cy="290" rx="170" ry="105" fill="${mix(c2, '#ffffff', 0.15)}"/>${Array.from({ length: 7 }, () => `<circle cx="${300 + r() * 200}" cy="${240 + r() * 100}" r="${14 + r() * 18}" fill="${mix(c1, c2, r())}"/>`).join('')}<rect x="610" y="140" width="90" height="120" rx="14" fill="${dark}"/><path d="M700 170 q40 0 40 30 t-40 30" fill="none" stroke="${dark}" stroke-width="12"/>`;
    case 'portrait':
      return `${bg}<circle cx="400" cy="210" r="95" fill="${mix(c1, '#000000', 0.15)}"/><path d="M200 500 Q200 330 400 330 Q600 330 600 500Z" fill="${dark}"/>`;
    case 'product':
      return `${bg}<ellipse cx="400" cy="420" rx="200" ry="26" fill="${dark}" opacity="0.25"/><rect x="290" y="130" width="220" height="280" rx="30" fill="${c1}"/><rect x="320" y="170" width="160" height="110" rx="14" fill="${light}"/><circle cx="400" cy="340" r="26" fill="${c2}"/>`;
    case 'office':
    case 'tech':
      return `${bg}<rect x="180" y="110" width="440" height="270" rx="16" fill="${dark}"/><rect x="200" y="130" width="400" height="230" rx="6" fill="${light}"/>${Array.from({ length: 5 }, (_, i) => `<rect x="225" y="${155 + i * 38}" width="${120 + r() * 220}" height="16" rx="8" fill="${i % 2 ? c2 : c1}" opacity="0.8"/>`).join('')}<rect x="330" y="380" width="140" height="20" fill="${dark}"/><rect x="260" y="400" width="280" height="16" rx="8" fill="${dark}"/>`;
    case 'book':
      return `${bg}${Array.from({ length: 6 }, (_, i) => `<rect x="${170 + i * 78}" y="${150 + r() * 60}" width="62" height="${230 - r() * 60}" rx="6" fill="${mix(c1, c2, i / 5)}"/>`).join('')}<rect x="140" y="390" width="520" height="18" rx="4" fill="${dark}"/>`;
    case 'travel':
      return `${bg}<circle cx="400" cy="250" r="160" fill="${mix(c1, '#ffffff', 0.35)}"/><path d="M290 190 q60 -30 110 10 t90 -10 M270 270 q80 30 140 -10 t110 20" fill="none" stroke="${dark}" stroke-width="14" stroke-linecap="round"/><path d="M560 120 l80 -30 -20 40 30 40 -40 -10 -50 40 10 -50z" fill="${c2}"/>`;
    case 'nature':
      return `${bg}${Array.from({ length: 6 }, () => { const x = 60 + r() * 680; const s = 0.7 + r() * 0.8; return `<rect x="${x - 8 * s}" y="${430 - 60 * s}" width="${16 * s}" height="${70 * s}" fill="${dark}"/><circle cx="${x}" cy="${400 - 90 * s}" r="${70 * s}" fill="${mix(c1, c2, r() * 0.5)}"/>`; }).join('')}<rect y="430" width="800" height="70" fill="${mix(c1, '#000000', 0.25)}"/>`;
    case 'pattern':
      return `${bg}${Array.from({ length: 40 }, (_, i) => `<circle cx="${(i % 8) * 100 + 50}" cy="${Math.floor(i / 8) * 100 + 50}" r="${10 + r() * 30}" fill="${i % 3 ? c1 : c2}" opacity="${0.25 + r() * 0.5}"/>`).join('')}`;
    default: // abstract
      return `${bg}${Array.from({ length: 6 }, () => `<circle cx="${r() * 800}" cy="${r() * 500}" r="${60 + r() * 160}" fill="${r() > 0.5 ? c1 : c2}" opacity="${0.18 + r() * 0.3}"/>`).join('')}<path d="M0 ${300 + r() * 80} C 250 ${200 + r() * 100}, 550 ${420 - r() * 100}, 800 ${280 + r() * 80} V500 H0Z" fill="${dark}" opacity="0.35"/>`;
  }
}

/** The picture as SVG text (800 × 500). */
export function artSvg(kind = 'abstract', color1 = '#1d6fd8', color2 = '#00b4d8', seed = 1) {
  const k = ART_KINDS.includes(kind) ? kind : 'abstract';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" width="800" height="500">${body(k, safe(color1, '#1d6fd8'), safe(color2, '#00b4d8'), rng(seed))}</svg>`;
  // One decimal is plenty for an 800 × 500 picture (and keeps the project file small).
  return svg.replace(/(\d+\.\d{2,})/g, (n) => String(Math.round(Number(n) * 10) / 10));
}

/** The picture as a data: URL (an <img src>, a CSS url()): ( ) ' are escaped too, so the URL never ends early. */
export const art = (kind, color1, color2, seed) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(artSvg(kind, color1, color2, seed)).replace(/[()']/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;
