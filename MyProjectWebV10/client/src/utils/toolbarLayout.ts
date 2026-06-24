const TOOLBAR_ITEM_GAP = 8;
const TOOLBAR_SECTION_GAP = 16;
const TOOLBAR_HORIZONTAL_PADDING = 32;
const APP_MIN_WIDTH_FLOOR = 1200;
const APP_MIN_HEIGHT = 500;

export { APP_MIN_HEIGHT, APP_MIN_WIDTH_FLOOR };

function measureItemWidths(container: HTMLElement): number[] {
  return Array.from(container.children).map(
    (child) => child.getBoundingClientRect().width + TOOLBAR_ITEM_GAP,
  );
}

/** Minimum actions pane width so all toolbar items fit on at most two rows. */
export function minActionsWidthForTwoRows(itemWidths: number[]): number {
  if (itemWidths.length === 0) return 0;

  let row1 = 0;
  let row2 = 0;
  for (const width of [...itemWidths].sort((a, b) => b - a)) {
    if (row1 <= row2) row1 += width;
    else row2 += width;
  }
  return Math.max(row1, row2);
}

export function computeAppMinWidth(toolbar: HTMLElement, actions: HTMLElement): number {
  const brand = toolbar.querySelector('.toolbar-brand');
  const db = toolbar.querySelector('.toolbar-db');
  const brandWidth = brand instanceof HTMLElement ? brand.getBoundingClientRect().width : 160;
  const dbWidth = db instanceof HTMLElement ? db.getBoundingClientRect().width : 0;
  const actionsWidth = minActionsWidthForTwoRows(measureItemWidths(actions));

  const total =
    brandWidth +
    dbWidth +
    actionsWidth +
    TOOLBAR_SECTION_GAP * (dbWidth > 0 ? 2 : 1) +
    TOOLBAR_HORIZONTAL_PADDING;

  return Math.max(APP_MIN_WIDTH_FLOOR, Math.ceil(total));
}

export function applyAppMinWidth(width: number): void {
  document.documentElement.style.setProperty('--app-min-width', `${width}px`);
}

export function clearAppMinWidth(): void {
  document.documentElement.style.removeProperty('--app-min-width');
}
