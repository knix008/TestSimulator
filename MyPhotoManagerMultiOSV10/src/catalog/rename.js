// Batch rename: new names from a template.
//
//   *  or {name}     the current name (without extension)
//   ###              the counter, padded to the number of #
//   {n}              the counter, not padded
//   {ext}            the extension (without dot)
//   {date:YYYY-MM-DD}  the date taken (else the modified time) — YYYY YY MM DD HH mm ss
//   {modified:…}     the file's modified time
//   {camera} {w} {h} {rating} {folder}
//
// The extension is kept (in the chosen letter case) unless the template has {ext}.
import { extensionOf, stemOf } from '../formats/types.js';

const pad = (n, width = 2) => String(n).padStart(width, '0');

export function formatDate(time, pattern) {
  if (!time) return '';
  const d = new Date(time);
  return pattern.replace(/YYYY|YY|MM|DD|HH|mm|ss/g, (token) => ({
    YYYY: String(d.getFullYear()), YY: pad(d.getFullYear() % 100), MM: pad(d.getMonth() + 1), DD: pad(d.getDate()),
    HH: pad(d.getHours()), mm: pad(d.getMinutes()), ss: pad(d.getSeconds()),
  })[token]);
}

const ILLEGAL = /[\\/:*?"<>|\u0000-\u001f]/g;

function applyCase(text, mode) {
  if (mode === 'lower') return text.toLowerCase();
  if (mode === 'upper') return text.toUpperCase();
  if (mode === 'title') return text.toLowerCase().replace(/(^|[\s_-])(\p{L})/gu, (m, sep, ch) => sep + ch.toUpperCase());
  return text;
}

/**
 * New name for one file. `file`: { name, path, record }, `index`: 0-based.
 * `options`: { template, start = 1, step = 1, caseMode, extCase, find, replace, regex }.
 */
export function renameOne(file, index, options) {
  const { template = '*', start = 1, step = 1, caseMode = 'keep', extCase = 'keep', find = '', replace = '', regex = false } = options;
  const stem = stemOf(file.name);
  const ext = extensionOf(file.name);
  const rawExt = ext ? file.name.slice(file.name.lastIndexOf('.') + 1) : '';
  const extOut = extCase === 'lower' ? rawExt.toLowerCase() : extCase === 'upper' ? rawExt.toUpperCase() : rawExt;
  const counter = start + index * step;
  const record = file.record ?? {};
  const taken = record.meta?.taken ?? file.modified ?? record.modified;
  const folder = String(file.path ?? '').split(/[\\/]/).slice(-2, -1)[0] ?? '';
  let usesExt = false;
  let name = template
    .replace(/\{(\w+)(?::([^}]*))?\}/g, (match, key, format) => {
      switch (key) {
        case 'name': return stem;
        case 'n': return String(counter);
        case 'ext': usesExt = true; return extOut;
        case 'date': case 'taken': return formatDate(taken, format || 'YYYY-MM-DD');
        case 'modified': return formatDate(file.modified ?? record.modified, format || 'YYYY-MM-DD');
        case 'camera': return record.meta?.camera ?? '';
        case 'w': return record.width ? String(record.width) : '';
        case 'h': return record.height ? String(record.height) : '';
        case 'rating': return String(record.rating ?? 0);
        case 'folder': return folder;
        default: return match;
      }
    })
    .replace(/#+/g, (hashes) => pad(counter, hashes.length))
    .replace(/\*/g, stem);
  if (find) {
    if (regex) {
      try { name = name.replace(new RegExp(find, 'g'), replace); } catch { /* invalid pattern: leave the name */ }
    } else {
      name = name.split(find).join(replace);
    }
  }
  name = applyCase(name, caseMode).replace(ILLEGAL, '_').trim();
  if (usesExt) return name;
  return ext ? `${name}.${extOut}` : name;
}

/**
 * Preview of a batch rename: [{ path, from, to, problem }] where problem is
 * null | 'empty' | 'duplicate' | 'exists'. `existing`: names already in the
 * folder(s) (lower-case), not counting the files being renamed.
 */
export function planRename(files, options, existing = new Set()) {
  const plan = files.map((file, index) => ({ path: file.path, from: file.name, to: renameOne(file, index, options), problem: null }));
  const seen = new Map();
  const renamed = new Set(files.map((file) => file.name.toLowerCase()));
  for (const entry of plan) {
    const key = entry.to.toLowerCase();
    if (!entry.to || entry.to.startsWith('.')) entry.problem = 'empty';
    else if (seen.has(key)) { entry.problem = 'duplicate'; seen.get(key).problem ??= 'duplicate'; }
    else if (existing.has(key) && !renamed.has(key)) entry.problem = 'exists';
    seen.set(key, entry);
  }
  return plan;
}

/**
 * Order of renames that never overwrites: entries whose target is another
 * entry's current name go through a temporary name first.
 * Returns [{ path, to, temp }] steps; apply all `temp` renames first, then the finals.
 */
export function renameSteps(plan) {
  const active = plan.filter((entry) => !entry.problem && entry.from !== entry.to);
  const sources = new Set(active.map((entry) => entry.from.toLowerCase()));
  return active.map((entry, i) => ({ path: entry.path, from: entry.from, to: entry.to, temp: sources.has(entry.to.toLowerCase()) || entry.from.toLowerCase() === entry.to.toLowerCase() ? `.~rename-${Date.now().toString(36)}-${i}` : null }));
}
