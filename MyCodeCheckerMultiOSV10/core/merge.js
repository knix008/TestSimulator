'use strict';

// Three-way merge of workspace data. A long operation (an analysis) loads the
// workspace, changes its own copy and saves it much later; meanwhile other
// calls may have saved changes (issue status, settings). merge3 keeps both:
// whatever the operation changed relative to `base` wins, everything else is
// taken from `theirs` (the workspace as saved now).
//
// Objects merge key by key. Arrays whose items all have an `id` merge item by
// item (order of `mine`, then items only `theirs` added); other arrays and
// values are leaves. `tasks` stays newest first.

const same = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const byId = (list) => Array.isArray(list) && list.length > 0 && list.every((x) => isObj(x) && x.id != null);

function merge3(base, mine, theirs, key) {
  if (same(mine, base)) return theirs;
  if (same(theirs, base) || theirs === undefined) return mine;
  if (isObj(mine) && isObj(theirs)) {
    const b = isObj(base) ? base : {};
    const out = {};
    for (const k of new Set([...Object.keys(mine), ...Object.keys(theirs), ...Object.keys(b)])) {
      const inMine = k in mine;
      const inTheirs = k in theirs;
      if (!inMine && !inTheirs) continue;
      // Removed on one side, untouched on the other: removed.
      if (!inMine && same(theirs[k], b[k])) continue;
      if (!inTheirs && k in b && same(mine[k], b[k])) continue;
      const v = merge3(b[k], inMine ? mine[k] : undefined, inTheirs ? theirs[k] : undefined, k);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  if ((byId(mine) || mine.length === 0) && (byId(theirs) || theirs.length === 0) && Array.isArray(mine) && Array.isArray(theirs)) {
    const baseList = Array.isArray(base) ? base : [];
    const index = (list) => new Map(list.filter(isObj).map((x) => [x.id, x]));
    const b = index(baseList);
    const t = index(theirs);
    const m = index(mine);
    const out = [];
    for (const item of mine) {
      const id = item.id;
      if (!t.has(id)) {
        // Deleted by them and not changed by us: stays deleted.
        if (b.has(id) && same(item, b.get(id))) continue;
        out.push(item);
      } else out.push(merge3(b.get(id), item, t.get(id)));
    }
    for (const item of theirs) {
      if (m.has(item.id)) continue;
      // Deleted by us: stays deleted unless they changed it.
      if (b.has(item.id) && same(item, b.get(item.id))) continue;
      out.push(item);
    }
    if (key === 'tasks') out.sort((x, y) => String(y.submittedAt || '').localeCompare(String(x.submittedAt || '')));
    return out;
  }
  return mine;
}

module.exports = { merge3 };
