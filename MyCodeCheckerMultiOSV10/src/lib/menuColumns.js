// Dropdown menus and lists with more than 6 items show two columns, filled
// top to bottom (column-major). Separators start groups and a group stays in
// one column; a single long group (no separators) is split in half.
//
//   const cols = columnsOf(items);       // [[{ item, index }], …] (1 or 2 columns)
//   cols.jump(active, +1 | -1)            // ←/→: same row in the other column
//   menuSize(items, colWidth)             // { width, height } for a popup window
export const TWO_COLUMN_MIN = 7;
export const ROW_H = 30;
export const SEP_H = 9;

const rowsOf = (list) => list.reduce((h, x) => h + (x.item.sep ? SEP_H : ROW_H), 0);

export function columnsOf(items) {
  const all = (items || []).map((item, index) => ({ item, index }));
  const count = all.filter((x) => !x.item.sep).length;
  let cols;
  if (count < TWO_COLUMN_MIN) cols = [all];
  else {
    // Groups between separators.
    const groups = [[]];
    for (const x of all) {
      if (x.item.sep) { if (groups[groups.length - 1].length) groups.push([]); }
      else groups[groups.length - 1].push(x);
    }
    if (!groups[groups.length - 1].length) groups.pop();
    const sepAt = (g) => all.find((x) => x.item.sep && x.index === g[0].index - 1);
    if (groups.length === 1) {
      const half = Math.ceil(groups[0].length / 2);
      cols = [groups[0].slice(0, half), groups[0].slice(half)];
    } else {
      // The split that makes the two columns closest in height.
      const total = groups.reduce((h, g) => h + g.length * ROW_H, 0) + (groups.length - 1) * SEP_H;
      let best = 1;
      let bestDiff = Infinity;
      for (let k = 1; k < groups.length; k += 1) {
        const left = groups.slice(0, k).reduce((h, g) => h + g.length * ROW_H, 0) + (k - 1) * SEP_H;
        const diff = Math.abs(total - SEP_H - 2 * left);
        if (diff < bestDiff) { bestDiff = diff; best = k; }
      }
      const build = (gs) => gs.flatMap((g, i) => (i === 0 ? g : [sepAt(g) || { item: { sep: true }, index: `s${g[0].index}` }, ...g]));
      cols = [build(groups.slice(0, best)), build(groups.slice(best))];
    }
  }
  // Positions of the selectable items: running index over the columns in order.
  const pos = [];
  cols.forEach((col, c) => { let r = 0; for (const x of col) { if (!x.item.sep) { pos.push({ c, r }); r += 1; } } });
  cols.jump = (active, dir) => {
    const p = pos[active];
    if (!p) return active;
    const c = p.c + dir;
    if (c < 0 || c >= cols.length) return active;
    const inCol = pos.map((q, i) => ({ ...q, i })).filter((q) => q.c === c);
    if (!inCol.length) return active;
    return (inCol[Math.min(p.r, inCol.length - 1)]).i;
  };
  // Running index → the order in which items are rendered (the same here).
  return cols;
}

/** Popup size for a list: one or two columns of colWidth, plus padding. */
export function menuSize(items, colWidth) {
  const cols = columnsOf(items);
  const height = Math.max(...cols.map(rowsOf)) + 10;
  return { width: cols.length > 1 ? colWidth * 2 + 9 : colWidth, height, columns: cols.length };
}
