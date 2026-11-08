// The test titles written in the test files, for the feature map (test/features.map.js): unit tests by file, web E2E cases.
// Read from the source, so a title written as a template keeps its ${…} parts.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const unquote = (s) => s.replace(/\\(.)/g, '$1');
// A quoted title, escaped quotes included.
const TITLE = String.raw`(['\x60])((?:\\.|(?!\1).)*)\1`;
const UNIT_TEST = new RegExp(String.raw`^\s*(?:test|it|check|fails)\(` + TITLE);
const WEB_TEST = new RegExp(String.raw`^await test\(` + TITLE, 'gm');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Map of '<unit file>' or 'web' to the set of titles written there. */
export function writtenTitles() {
  const out = new Map();
  const unit = path.join(root, 'test', 'unit');
  for (const file of fs.readdirSync(unit).filter((f) => f.endsWith('.test.js'))) {
    const titles = new Set();
    for (const line of fs.readFileSync(path.join(unit, file), 'utf8').split(/\r?\n/)) {
      const m = line.match(UNIT_TEST);
      if (m) titles.add(unquote(m[2]));
    }
    out.set(file.replace(/\.test\.js$/, ''), titles);
  }
  const web = new Set();
  for (const m of fs.readFileSync(path.join(root, 'test', 'e2e', 'web.mjs'), 'utf8').matchAll(WEB_TEST)) web.add(unquote(m[2]));
  out.set('web', web);
  return out;
}

/** '<where> › <title>' split in two. */
export function splitRef(ref) {
  const at = ref.indexOf(' › ');
  return [ref.slice(0, at), ref.slice(at + 3)];
}

/** Whether a test name that ran matches a written title (a template title matches every name it can make). */
export function titleMatches(written, ran) {
  if (!written.includes('${')) return written === ran;
  const pattern = written.split(/\$\{[^}]*\}/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp(`^${pattern}$`, 's').test(ran);
}
