// Line differences between two texts, and a three-way merge built on them.
// Used to compare page versions and to merge people writing the same page at once.

function lines(text) {
  const source = String(text ?? '').replace(/\r\n/g, '\n');
  return source === '' ? [] : source.split('\n');
}

/**
 * The shortest edit from `before` to `after`, line by line:
 * [{ type: 'same' | 'del' | 'add', text }]. Common head and tail are trimmed before the table is built.
 */
export function diffLines(before, after) {
  const a = lines(before);
  const b = lines(after);
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head += 1;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail += 1;
  const x = a.slice(head, a.length - tail);
  const y = b.slice(head, b.length - tail);
  const out = a.slice(0, head).map((text) => ({ type: 'same', text }));
  if (x.length * y.length > 4_000_000) {
    // Too large for the table: everything in the middle counts as replaced.
    out.push(...x.map((text) => ({ type: 'del', text })), ...y.map((text) => ({ type: 'add', text })));
  } else {
    const n = x.length;
    const m = y.length;
    const table = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i -= 1) {
      for (let j = m - 1; j >= 0; j -= 1) {
        table[i][j] = x[i] === y[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (x[i] === y[j]) { out.push({ type: 'same', text: x[i] }); i += 1; j += 1; }
      else if (table[i + 1][j] >= table[i][j + 1]) { out.push({ type: 'del', text: x[i] }); i += 1; }
      else { out.push({ type: 'add', text: y[j] }); j += 1; }
    }
    while (i < n) { out.push({ type: 'del', text: x[i] }); i += 1; }
    while (j < m) { out.push({ type: 'add', text: y[j] }); j += 1; }
  }
  out.push(...a.slice(a.length - tail).map((text) => ({ type: 'same', text })));
  return out;
}

/** How many lines were added and removed. */
export function diffStats(parts) {
  return {
    added: parts.filter((part) => part.type === 'add').length,
    removed: parts.filter((part) => part.type === 'del').length,
  };
}

/**
 * Changes from `base` to `other` as hunks over base line positions:
 * [{ start, end, lines }] — base lines start..end-1 are replaced by `lines`.
 */
function hunks(base, other) {
  const parts = diffLines(base, other);
  const out = [];
  let at = 0;
  let open = null;
  for (const part of parts) {
    if (part.type === 'same') {
      if (open) { out.push(open); open = null; }
      at += 1;
    } else {
      if (!open) open = { start: at, end: at, lines: [] };
      if (part.type === 'del') { at += 1; open.end = at; }
      else open.lines.push(part.text);
    }
  }
  if (open) out.push(open);
  return out;
}

/**
 * Three-way merge by lines. Both sides' changes to `base` are kept; where both changed the same lines
 * differently, `mine` wins and `conflicts` counts it (the other side's lines follow, so nothing is lost).
 * Returns { text, conflicts }.
 */
export function merge3(base, mine, theirs) {
  if (mine === theirs) return { text: mine, conflicts: 0 };
  if (mine === base) return { text: theirs, conflicts: 0 };
  if (theirs === base) return { text: mine, conflicts: 0 };
  const source = lines(base);
  const ours = hunks(base, mine).map((hunk) => ({ ...hunk, side: 'mine' }));
  const others = hunks(base, theirs).map((hunk) => ({ ...hunk, side: 'theirs' }));
  const all = [...ours, ...others].sort((p, q) => p.start - q.start || p.end - q.end);
  const out = [];
  let conflicts = 0;
  let at = 0;
  let index = 0;
  while (index < all.length) {
    // Gather hunks that overlap (or touch at the same insertion point).
    const group = [all[index]];
    let end = all[index].end;
    index += 1;
    while (index < all.length && (all[index].start < end || (all[index].start === end && all[index].start === group[0].start))) {
      group.push(all[index]);
      end = Math.max(end, all[index].end);
      index += 1;
    }
    const start = group[0].start;
    out.push(...source.slice(at, start));
    const mineGroup = group.filter((hunk) => hunk.side === 'mine');
    const theirGroup = group.filter((hunk) => hunk.side === 'theirs');
    const rebuild = (side) => {
      const result = [];
      let cursor = start;
      for (const hunk of side) {
        result.push(...source.slice(cursor, hunk.start), ...hunk.lines);
        cursor = hunk.end;
      }
      result.push(...source.slice(cursor, end));
      return result;
    };
    if (!theirGroup.length) out.push(...rebuild(mineGroup));
    else if (!mineGroup.length) out.push(...rebuild(theirGroup));
    else {
      const left = rebuild(mineGroup);
      const right = rebuild(theirGroup);
      if (left.join('\n') === right.join('\n')) out.push(...left);
      else {
        conflicts += 1;
        out.push(...left, ...right.filter((line) => !left.includes(line)));
      }
    }
    at = end;
  }
  out.push(...source.slice(at));
  return { text: out.join('\n'), conflicts };
}
