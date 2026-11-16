// Line differences (pure: the Diff node and the editor's Code tab both use it).

/** Line-by-line operations between two texts: [' ' | '+' | '-', line][] (LCS table). */
export function lineOps(a, b) {
  const x = String(a ?? '').split('\n');
  const y = String(b ?? '').split('\n');
  const n = x.length;
  const m = y.length;
  if (n * m > 25_000_000) return null;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) for (let j = m - 1; j >= 0; j -= 1) dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && x[i] === y[j]) { ops.push([' ', x[i]]); i += 1; j += 1; }
    else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) { ops.push(['+', y[j]]); j += 1; }
    else { ops.push(['-', x[i]]); i += 1; }
  }
  return ops;
}

/** Which lines of the new text are new or changed (1-based numbers) and how many went away. */
export function changedLines(before, after) {
  if (before == null) return { added: new Set(String(after ?? '').split('\n').map((_, i) => i + 1)), removed: 0, fresh: true };
  const ops = lineOps(before, after);
  if (!ops) return { added: new Set(), removed: 0, fresh: false };
  const added = new Set();
  let line = 0;
  let removed = 0;
  for (const [op] of ops) { if (op === '-') { removed += 1; continue; } line += 1; if (op === '+') added.add(line); }
  return { added, removed, fresh: false };
}

/** A unified diff with three lines of context → { diff, added, removed, same }. */
export function lineDiff(a, b, name = 'file') {
  const ops = lineOps(a, b);
  if (!ops) { const e = new Error('The texts are too long to compare here'); e.code = 'DIFF_TOO_BIG'; throw e; }
  const added = ops.filter((o) => o[0] === '+').length;
  const removed = ops.filter((o) => o[0] === '-').length;
  const lines = [`--- a/${name}`, `+++ b/${name}`];
  let k = 0;
  let ai = 1;
  let bi = 1;
  while (k < ops.length) {
    if (ops[k][0] === ' ') { ai += 1; bi += 1; k += 1; continue; }
    const start = Math.max(0, k - 3);
    let end = k;
    let quiet = 0;
    while (end < ops.length && quiet <= 6) { quiet = ops[end][0] === ' ' ? quiet + 1 : 0; end += 1; }
    end = Math.min(ops.length, end - Math.max(0, quiet - 3));
    const before = k - start;
    const hunk = ops.slice(start, end);
    const aLen = hunk.filter((o) => o[0] !== '+').length;
    const bLen = hunk.filter((o) => o[0] !== '-').length;
    lines.push(`@@ -${ai - before},${aLen} +${bi - before},${bLen} @@`, ...hunk.map(([op, t]) => `${op}${t}`));
    for (const [op] of ops.slice(k, end)) { if (op !== '+') ai += 1; if (op !== '-') bi += 1; }
    k = end;
  }
  return { diff: added || removed ? lines.join('\n') : '', added, removed, same: !added && !removed };
}
