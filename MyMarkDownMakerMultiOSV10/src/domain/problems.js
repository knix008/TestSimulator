// Problems of the document, for the bottom panel's Problems tab: things that make the merged document or
// its exports come out wrong. Pure: the document text and the file list in, a list out.
//   { severity: 'error' | 'warning' | 'info', kind, params, line (0-based, in the document) | null, file }
import { isImageRef } from '../lib/images.js';

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 };

export function findProblems(text, files = [], { checked = null } = {}) {
  const out = [];
  const lines = String(text ?? '').split('\n');
  let fence = null;
  let fenceLine = -1;
  let lastLevel = 0;
  let headings = 0;
  const seen = new Map();
  let inSection = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*<!--\s*mmm:(cover|toc|figures)\s*-->\s*$/.test(line)) { inSection = true; continue; }
    if (/^\s*<!--\s*\/mmm:(cover|toc|figures)\s*-->\s*$/.test(line)) { inSection = false; continue; }
    const f = /^\s*(```+|~~~+)/.exec(line);
    if (f) {
      if (!fence) { fence = f[1][0]; fenceLine = i; } else if (f[1][0] === fence) fence = null;
      continue;
    }
    if (fence || inSection) continue;
    const h = /^(#{1,6})\s+(.*?)\s*$/.exec(line);
    if (h) {
      headings += 1;
      const level = h[1].length;
      if (lastLevel && level > lastLevel + 1) out.push({ severity: 'warning', kind: 'headingJump', params: { from: lastLevel, to: level, text: h[2] }, line: i });
      if (level === 6) out.push({ severity: 'info', kind: 'headingSix', params: { text: h[2] }, line: i });
      if (!h[2].trim()) out.push({ severity: 'warning', kind: 'emptyHeading', params: {}, line: i });
      const key = `${level}:${h[2].replace(/^[\d.]+\s+/, '').trim().toLowerCase()}`;
      if (h[2].trim() && seen.has(key)) out.push({ severity: 'info', kind: 'duplicateHeading', params: { text: h[2], first: seen.get(key) + 1 }, line: i });
      else seen.set(key, i);
      lastLevel = level;
    }
    for (const m of line.matchAll(/!\[[^\]]*\]\(\s*<?([^)\s"<>]+)>?[^)]*\)/g)) {
      const src = m[1];
      if (isImageRef(src) || /^(https?:|data:|\/\/)/i.test(src)) continue;
      out.push({ severity: 'warning', kind: 'missingImage', params: { src }, line: i });
    }
    for (const m of line.matchAll(/(?<!!)\[[^\]]+\]\(\s*\)/g)) out.push({ severity: 'warning', kind: 'emptyLink', params: { text: m[0] }, line: i });
  }
  if (fence) out.push({ severity: 'error', kind: 'openFence', params: {}, line: fenceLine });
  if (String(text ?? '').trim() && !headings) out.push({ severity: 'warning', kind: 'noHeadings', params: {}, line: null });
  for (const file of files) {
    if (checked && !checked(file)) continue;
    if (!String(file.content ?? '').trim()) out.push({ severity: 'warning', kind: 'emptyFile', params: { name: file.relPath || file.name }, line: null, file: file.id });
    else if (!/^#{1,6}\s/m.test(file.content)) out.push({ severity: 'info', kind: 'fileNoHeading', params: { name: file.relPath || file.name }, line: null, file: file.id });
  }
  return out.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || (a.line ?? 1e9) - (b.line ?? 1e9));
}

export function countBySeverity(list) {
  const counts = { error: 0, warning: 0, info: 0 };
  for (const p of list) counts[p.severity] += 1;
  return counts;
}
