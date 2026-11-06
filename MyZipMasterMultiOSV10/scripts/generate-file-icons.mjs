// Draws one 3D document icon per archive format, then turns each into what every system wants:
//   assets/file-icons/<name>.svg   the drawing
//   public/file-icons/<name>.svg   used by the file list inside the app
//   src-tauri/icons/files/<name>.ico / .icns / .png
// Letters are drawn as strokes, so the result does not depend on the fonts of the machine building it.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Each format's face: its label and colour. `exts` are the names it is registered under.
export const FILE_ICONS = {
  zip: { label: 'ZIP', hue: ['#ffcf4a', '#e98a0c'], exts: ['zip', 'zipx'], mime: 'application/zip' },
  '7z': { label: '7Z', hue: ['#6fb4ff', '#1d5fd1'], exts: ['7z'], mime: 'application/x-7z-compressed' },
  rar: { label: 'RAR', hue: ['#c792ff', '#6f2fd6'], exts: ['rar'], mime: 'application/vnd.rar' },
  tar: { label: 'TAR', hue: ['#a7b5c6', '#566579'], exts: ['tar'], mime: 'application/x-tar' },
  gz: { label: 'GZ', hue: ['#66e39a', '#129a52'], exts: ['gz', 'tgz'], mime: 'application/gzip' },
  bz2: { label: 'BZ2', hue: ['#5fe6dc', '#0d8f92'], exts: ['bz2', 'tbz', 'tbz2'], mime: 'application/x-bzip2' },
  xz: { label: 'XZ', hue: ['#ff93b9', '#d62c6e'], exts: ['xz', 'txz'], mime: 'application/x-xz' },
  zst: { label: 'ZST', hue: ['#ffa071', '#dc4d14'], exts: ['zst', 'tzst'], mime: 'application/zstd' },
  cab: { label: 'CAB', hue: ['#d8c26a', '#8d7312'], exts: ['cab'], mime: 'application/vnd.ms-cab-compressed' },
  iso: { label: 'ISO', hue: ['#ff8080', '#c81e2d'], exts: ['iso'], mime: 'application/x-cd-image' },
  part: { label: '001', hue: ['#8f9bff', '#3b3fc7'], exts: ['001'], mime: 'application/x-7z-compressed-part' },
};

// On a grid 10 wide and 14 tall.
const GLYPHS = {
  Z: [[[0, 0], [10, 0], [0, 14], [10, 14]]],
  I: [[[1.5, 0], [8.5, 0]], [[5, 0], [5, 14]], [[1.5, 14], [8.5, 14]]],
  P: [[[0, 14], [0, 0], [7, 0], [10, 3], [10, 5.5], [7, 8.5], [0, 8.5]]],
  7: [[[0, 0], [10, 0], [3.5, 14]]],
  R: [[[0, 14], [0, 0], [7, 0], [10, 3], [10, 5.5], [7, 8.5], [0, 8.5]], [[5.5, 8.5], [10, 14]]],
  A: [[[0, 14], [5, 0], [10, 14]], [[2, 9.5], [8, 9.5]]],
  T: [[[0, 0], [10, 0]], [[5, 0], [5, 14]]],
  G: [[[10, 2.8], [7.5, 0], [3, 0], [0, 3], [0, 11], [3, 14], [7.5, 14], [10, 11.5], [10, 7.5], [5.5, 7.5]]],
  B: [[[0, 7], [0, 0], [6.5, 0], [9, 2.2], [9, 4.8], [6.5, 7], [0, 7], [0, 14], [7, 14], [10, 11.6], [10, 9.4], [7, 7]]],
  X: [[[0, 0], [10, 14]], [[10, 0], [0, 14]]],
  S: [[[10, 2.6], [7.5, 0], [2.5, 0], [0, 2.4], [0, 4.6], [2.5, 7], [7.5, 7], [10, 9.4], [10, 11.6], [7.5, 14], [2.5, 14], [0, 11.4]]],
  C: [[[10, 2.8], [7.5, 0], [3, 0], [0, 3], [0, 11], [3, 14], [7.5, 14], [10, 11.2]]],
  O: [[[3, 0], [7, 0], [10, 3], [10, 11], [7, 14], [3, 14], [0, 11], [0, 3], [3, 0]]],
  0: [[[3, 0], [7, 0], [10, 3], [10, 11], [7, 14], [3, 14], [0, 11], [0, 3], [3, 0]]],
  1: [[[2, 3], [5.5, 0], [5.5, 14]]],
  2: [[[0, 3], [3, 0], [7, 0], [10, 3], [10, 5.5], [0, 14], [10, 14]]],
};

function letters(label, centerX, centerY, height) {
  const scale = height / 14;
  const advance = 13 * scale;
  const width = advance * (label.length - 1) + 10 * scale;
  const paths = [];
  [...label].forEach((ch, i) => {
    const x0 = centerX - width / 2 + i * advance;
    const y0 = centerY - height / 2;
    for (const stroke of GLYPHS[ch]) {
      paths.push(`M${stroke.map(([x, y]) => `${(x0 + x * scale).toFixed(1)} ${(y0 + y * scale).toFixed(1)}`).join('L')}`);
    }
  });
  return paths.join('');
}

export function fileIconSvg({ label, hue }) {
  const [light, dark] = hue;
  const text = letters(label, 256, 366, label.length >= 3 ? 84 : 96);
  const weight = label.length >= 3 ? 19 : 22;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset=".6" stop-color="#eef2f7"/>
      <stop offset="1" stop-color="#c8d2de"/>
    </linearGradient>
    <linearGradient id="fold" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="#fdfeff"/>
      <stop offset=".5" stop-color="#d5dee8"/>
      <stop offset="1" stop-color="#93a3b5"/>
    </linearGradient>
    <linearGradient id="band" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${light}"/>
      <stop offset="1" stop-color="${dark}"/>
    </linearGradient>
    <linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".6"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="teeth" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${dark}"/>
      <stop offset="1" stop-color="${light}"/>
    </linearGradient>
    <filter id="drop" x="-20%" y="-20%" width="140%" height="150%"><feGaussianBlur stdDeviation="11"/></filter>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="6"/></filter>
  </defs>
  <path d="M100 52a26 26 0 0 1 26-26h196l106 106v326a26 26 0 0 1-26 26H126a26 26 0 0 1-26-26z" transform="translate(6 16)" fill="#000" opacity=".4" filter="url(#drop)"/>
  <path d="M100 52a26 26 0 0 1 26-26h196l106 106v326a26 26 0 0 1-26 26H126a26 26 0 0 1-26-26z" fill="url(#paper)" stroke="#8c9bac" stroke-width="3"/>
  <path d="M322 26l106 106h-80a26 26 0 0 1-26-26z" fill="#000" opacity=".28" transform="translate(-5 8)" filter="url(#soft)"/>
  <path d="M322 26l106 106h-80a26 26 0 0 1-26-26z" fill="url(#fold)" stroke="#8c9bac" stroke-width="3" stroke-linejoin="round"/>
  <!-- The zipper running down the sheet -->
  <rect x="204" y="44" width="44" height="214" rx="6" fill="#000" opacity=".12"/>
  <g fill="url(#teeth)" stroke="#fff" stroke-opacity=".5" stroke-width="1.5">
    <rect x="212" y="56" width="28" height="15" rx="4"/>
    <rect x="212" y="82" width="28" height="15" rx="4"/>
    <rect x="212" y="108" width="28" height="15" rx="4"/>
    <rect x="212" y="134" width="28" height="15" rx="4"/>
    <rect x="212" y="160" width="28" height="15" rx="4"/>
    <rect x="212" y="186" width="28" height="15" rx="4"/>
  </g>
  <path d="M208 214h36l6 34a22 22 0 0 1-48 0z" fill="url(#teeth)" stroke="#55626f" stroke-width="2"/>
  <!-- The raised colour label -->
  <rect x="60" y="282" width="392" height="176" rx="30" fill="#000" opacity=".4" transform="translate(0 14)" filter="url(#soft)"/>
  <rect x="60" y="280" width="392" height="176" rx="30" fill="url(#band)"/>
  <rect x="60" y="280" width="392" height="176" rx="30" fill="none" stroke="#000" stroke-opacity=".25" stroke-width="3"/>
  <path d="M72 312a22 22 0 0 1 22-22h324a22 22 0 0 1 22 22v28c-60 22-120 28-184 28s-124-6-184-28z" fill="url(#gloss)"/>
  <path d="${text}" transform="translate(4 7)" fill="none" stroke="#000" stroke-opacity=".38" stroke-width="${weight}" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="${text}" fill="none" stroke="#fff" stroke-width="${weight}" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const assets = path.join(root, 'assets', 'file-icons');
  const pub = path.join(root, 'public', 'file-icons');
  const out = path.join(root, 'src-tauri', 'icons', 'files');
  for (const d of [assets, pub, out]) fs.mkdirSync(d, { recursive: true });
  const tauri = path.join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');
  for (const [name, spec] of Object.entries(FILE_ICONS)) {
    const svg = fileIconSvg(spec);
    const file = path.join(assets, `${name}.svg`);
    fs.writeFileSync(file, svg);
    fs.writeFileSync(path.join(pub, `${name}.svg`), svg);
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zm-icons-'));
    const r = spawnSync(process.execPath, [tauri, 'icon', file, '-o', temp], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`${name}: ${r.stderr}`);
    fs.copyFileSync(path.join(temp, 'icon.ico'), path.join(out, `${name}.ico`));
    fs.copyFileSync(path.join(temp, 'icon.icns'), path.join(out, `${name}.icns`));
    fs.copyFileSync(path.join(temp, 'icon.png'), path.join(out, `${name}.png`));
    fs.rmSync(temp, { recursive: true, force: true });
    console.log(`[icons] ${name}`);
  }
}
