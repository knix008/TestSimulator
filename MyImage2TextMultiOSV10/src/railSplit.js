// The divider between the image list (1) and the conversion settings (2) in the left panel.
// Drag it (or focus it and use the arrow keys, Home/End) to share the panel's height between
// the two; double-click puts it back to the default share. The height of the image list is
// remembered and is kept inside the limits when the window changes size.

export const RAIL_SPLIT = { minTop: 120, minBottom: 160, step: 16, key: 'image2text.railSplit' };

/** The image list height that fits: at least minTop, leaving minBottom for the settings. */
export function clampSplit(height, total, { minTop = RAIL_SPLIT.minTop, minBottom = RAIL_SPLIT.minBottom } = {}) {
  const value = Math.round(Number(height));
  if (!Number.isFinite(value)) return null;
  const max = Math.max(minTop, total - minBottom);
  return Math.min(max, Math.max(minTop, value));
}

function load() {
  try {
    const stored = Number(localStorage.getItem(RAIL_SPLIT.key));
    return Number.isFinite(stored) && stored > 0 ? stored : null;
  } catch {
    return null;
  }
}

function save(height) {
  try {
    if (height === null) localStorage.removeItem(RAIL_SPLIT.key);
    else localStorage.setItem(RAIL_SPLIT.key, String(height));
  } catch {
    // Storage blocked: the divider still works until the window closes.
  }
}

export function setupRailSplit({ rail, top, divider }) {
  if (!rail || !top || !divider) return null;
  let wanted = load(); // null: the default share from the style sheet.

  // Room for both parts: the rail minus the divider and anything else in it.
  const room = () => {
    let other = 0;
    for (const child of rail.children) {
      if (child !== top && !child.matches('.settings') && getComputedStyle(child).display !== 'none') {
        other += child.getBoundingClientRect().height;
      }
    }
    return rail.clientHeight - other;
  };

  function apply() {
    const total = room();
    if (wanted === null || total <= 0) {
      top.style.flex = '';
    } else {
      top.style.flex = `0 0 ${clampSplit(wanted, total)}px`;
    }
    const now = Math.round(top.getBoundingClientRect().height);
    divider.setAttribute('aria-valuenow', String(now));
    divider.setAttribute('aria-valuemin', String(RAIL_SPLIT.minTop));
    divider.setAttribute('aria-valuemax', String(Math.max(RAIL_SPLIT.minTop, Math.round(total - RAIL_SPLIT.minBottom))));
  }

  function set(height, remember = true) {
    wanted = clampSplit(height, room());
    apply();
    if (remember) save(wanted);
  }

  divider.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = top.getBoundingClientRect().height;
    divider.setPointerCapture(event.pointerId);
    divider.classList.add('dragging');
    document.body.classList.add('rail-resizing');
    const move = (moveEvent) => set(startHeight + moveEvent.clientY - startY, false);
    const end = () => {
      divider.removeEventListener('pointermove', move);
      divider.removeEventListener('pointerup', end);
      divider.removeEventListener('pointercancel', end);
      divider.classList.remove('dragging');
      document.body.classList.remove('rail-resizing');
      save(wanted);
    };
    divider.addEventListener('pointermove', move);
    divider.addEventListener('pointerup', end);
    divider.addEventListener('pointercancel', end);
  });

  divider.addEventListener('dblclick', () => {
    wanted = null;
    save(null);
    apply();
  });

  divider.addEventListener('keydown', (event) => {
    const now = top.getBoundingClientRect().height;
    const step = event.shiftKey ? RAIL_SPLIT.step * 4 : RAIL_SPLIT.step;
    const moves = { ArrowUp: now - step, ArrowDown: now + step, Home: 0, End: Infinity };
    if (!(event.key in moves)) return;
    event.preventDefault();
    set(event.key === 'End' ? room() : moves[event.key]);
  });

  new ResizeObserver(() => apply()).observe(rail);
  apply();
  return { apply, get height() { return wanted; } };
}
