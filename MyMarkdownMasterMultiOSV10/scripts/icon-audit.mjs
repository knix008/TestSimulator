// Lists the icon names the UI uses that no icon module defines (they would show as a dot).
// node scripts/icon-audit.mjs  → exit code 1 when something is missing.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const walk = (dir) => readdirSync(dir).flatMap((name) => { const p = path.join(dir, name); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') ? [p] : []; });
const files = walk(path.join(root, 'src')).filter((f) => !/app\.old\.js$|[\\/]lib[\\/]|[\\/]print[\\/]/.test(f));
const names = new Map();
const patterns = [/icon\(\s*'([a-zA-Z][a-zA-Z0-9]+)'/g, /\bicon:\s*'([a-zA-Z][a-zA-Z0-9]+)'/g, /\bglyph:\s*'([a-zA-Z][a-zA-Z0-9]+)'/g, /\[\s*'[\w:.-]+',\s*'([a-zA-Z][a-zA-Z0-9]+)'\s*[,\]]/g];
for (const f of files) {
  const s = readFileSync(f, 'utf8');
  for (const re of patterns) for (const m of s.matchAll(re)) if (!names.has(m[1])) names.set(m[1], path.relative(root, f));
}
const load = (p) => import(pathToFileURL(path.join(root, p)).href).catch(() => null);
const { hasIcon } = await load('src/icons.js');
for (const extra of ['src/ai/ai-icons.js', 'src/render/render-icons.js', 'src/editor/editor-icons.js', 'src/views/app-icons.js', 'src/icons-app.js']) await load(extra);
const missing = [...names].filter(([n]) => !hasIcon(n));
for (const [n, f] of missing.sort()) console.log(`${n}\t${f}`);
console.log(`${missing.length} missing of ${names.size}`);
process.exit(missing.length ? 1 : 0);
