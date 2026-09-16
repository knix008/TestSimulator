// Title-bar icons of the separate tool windows (settings, viewer, editor,
// multi-rename, search): the same line icons the UI uses (src/components/
// Icons.jsx), rasterized with sharp into assets/tool-icons/<kind>.png so the
// settings window carries the gear, the viewer the viewer icon, and so on.
// The PNGs are committed (tiny) — run this only when an icon changes:
//   node scripts/generate-tool-icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'assets', 'tool-icons');

// Paths copied from Icons.jsx (24×24 viewBox, 2px strokes).
const ICONS = {
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  viewer: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><circle cx="11.5" cy="14" r="2.5"/><path d="M13.5 16l2 2"/>',
  editor: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  multiRename: '<path d="M4 6h9M4 12h9M4 18h9"/><path d="M20.5 5.5a1.5 1.5 0 0 1 0 2L16 12l-3 1 1-3 4.5-4.5a1.5 1.5 0 0 1 2 0z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
};

const sharp = (await import('sharp')).default;
fs.mkdirSync(out, { recursive: true });
for (const [name, body] of Object.entries(ICONS)) {
  // Rounded dark tile with the accent-coloured line icon — readable at 16 px in a title bar.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="64" height="64">
    <rect x="0.5" y="0.5" width="23" height="23" rx="5" fill="#1a2029" stroke="#2c3644"/>
    <g fill="none" stroke="#4cc9f0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" transform="translate(3 3) scale(0.75)">${body}</g>
  </svg>`;
  const file = path.join(out, `${name}.png`);
  await sharp(Buffer.from(svg)).resize(64, 64).png().toFile(file);
  console.log('wrote', path.relative(root, file));
}
