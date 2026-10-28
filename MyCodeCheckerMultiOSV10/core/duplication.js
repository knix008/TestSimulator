'use strict';

const crypto = require('crypto');

// Clone detection: a window of normalized lines that appears in two places.
// Overlapping windows collapse into one block per file.

const WINDOW = 8;

function normalizeLine(line) {
  let s = String(line || '');
  s = s.replace(/"(?:\\.|[^"\\])*"/g, '""');
  s = s.replace(/'(?:\\.|[^'\\])*'/g, "''");
  s = s.replace(/\/\/.*$/, '');
  s = s.replace(/#.*$/, '');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

function findDuplications(files) {
  // files: [{ path, lines: string[] (code lines, raw ok) }]
  const hits = new Map();
  for (const file of files) {
    const norm = file.lines.map(normalizeLine);
    for (let i = 0; i <= norm.length - WINDOW; i++) {
      const slice = norm.slice(i, i + WINDOW);
      if (slice.some((l) => l.length < 3)) continue;
      const body = slice.join('\n');
      const hash = crypto.createHash('sha1').update(body).digest('hex').slice(0, 16);
      if (!hits.has(hash)) hits.set(hash, []);
      const list = hits.get(hash);
      const prev = list[list.length - 1];
      if (prev && prev.path === file.path && i <= prev.end) {
        prev.end = i + WINDOW;
        continue;
      }
      list.push({ path: file.path, start: i + 1, end: i + WINDOW });
    }
  }
  const blocks = [];
  for (const [hash, places] of hits) {
    const unique = [];
    const seen = new Set();
    for (const p of places) {
      const id = `${p.path}:${p.start}`;
      if (!seen.has(id)) { seen.add(id); unique.push(p); }
    }
    if (unique.length < 2) continue;
    // skip a window that is only inside one file and fully overlapped — already collapsed
    const filesTouched = new Set(unique.map((p) => p.path));
    if (filesTouched.size < 2 && unique.length < 2) continue;
    const lines = unique[0].end - unique[0].start + 1;
    blocks.push({
      hash,
      lines,
      instances: unique.map((p) => ({ path: p.path, start: p.start, end: p.end })),
    });
  }
  // Prefer larger blocks and drop a block that is contained in a larger one with the same pair.
  blocks.sort((a, b) => b.lines - a.lines);
  const kept = [];
  const sigs = new Set();
  for (const b of blocks) {
    const sig = b.instances.map((i) => `${i.path}:${i.start}`).sort().join('|');
    if (sigs.has(sig)) continue;
    sigs.add(sig);
    kept.push(b);
  }
  const duplicatedLines = new Map();
  for (const b of kept) {
    for (const inst of b.instances) {
      const set = duplicatedLines.get(inst.path) || new Set();
      for (let n = inst.start; n <= inst.end; n++) set.add(n);
      duplicatedLines.set(inst.path, set);
    }
  }
  let total = 0;
  const perFile = {};
  for (const [p, set] of duplicatedLines) {
    perFile[p] = set.size;
    total += set.size;
  }
  return {
    blocks: kept.slice(0, 200),
    duplicatedLines: total,
    perFile,
  };
}

module.exports = { findDuplications, normalizeLine, WINDOW };
