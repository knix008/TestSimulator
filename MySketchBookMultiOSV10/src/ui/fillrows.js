// Grids of chips (library and material categories) never end with a hole: the last chip spans what is left of
// its row. The number of columns follows the panel's width (auto-fill), so it is measured, and measured again
// when the panel is resized.

/** Stretches the last child of a CSS grid over the empty cells of the last row. */
export function fillLastRow(grid) {
  const items = [...grid.children];
  const last = items.at(-1);
  if (!last) return;
  last.style.gridColumn = '';
  const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length;
  const rest = cols > 1 ? items.length % cols : 0;
  if (rest) last.style.gridColumn = `span ${cols - rest + 1}`;
}

const watched = new WeakSet();
const resize = typeof ResizeObserver === 'function' ? new ResizeObserver((entries) => { for (const e of entries) fillLastRow(e.target); }) : null;

/** Fills the chip grids inside `root` now and whenever they are resized. */
export function fillChipRows(root) {
  for (const grid of root.querySelectorAll('.lib-chips')) {
    fillLastRow(grid);
    if (resize && !watched.has(grid)) { watched.add(grid); resize.observe(grid); }
  }
}
