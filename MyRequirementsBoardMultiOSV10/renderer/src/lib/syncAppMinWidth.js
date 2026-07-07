const MIN_WIDTH_BUFFER = 2;

function measureElementWidth(el) {
  if (!el) return 0;

  const clone = el.cloneNode(true);
  clone.style.cssText = [
    'position: absolute',
    'visibility: hidden',
    'pointer-events: none',
    'width: max-content',
    'min-width: max-content',
    'max-width: none',
    'left: -10000px',
    'top: 0',
  ].join(';');

  document.body.appendChild(clone);
  const width = Math.ceil(clone.getBoundingClientRect().width);
  document.body.removeChild(clone);

  return width;
}

function measureFlexRow(el) {
  if (!el) return 0;

  const style = getComputedStyle(el);
  const gap = parseFloat(style.columnGap || style.gap) || 0;
  const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  const children = Array.from(el.children);

  let width = padding;
  children.forEach((child, index) => {
    width += measureElementWidth(child);
    if (index < children.length - 1) width += gap;
  });

  return Math.ceil(width);
}

function measureNavExplicitWidth(navEl) {
  if (!navEl) return 0;

  const style = getComputedStyle(navEl);
  const paddingX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  const gap = parseFloat(style.columnGap || style.gap) || 0;

  const primary = navEl.querySelector('.nav-primary');
  const trailing = navEl.querySelector('.nav-trailing');

  const segments = [
    primary ? measureFlexRow(primary) : 0,
    trailing ? measureFlexRow(trailing) : 0,
  ].filter((width) => width > 0);

  const content = segments.reduce((sum, width) => sum + width, 0);
  const gaps = gap * Math.max(segments.length - 1, 0);

  return Math.ceil(paddingX + content + gaps);
}

function measureNavCloneWidth(navEl) {
  if (!navEl) return 0;

  const clone = navEl.cloneNode(true);
  clone.style.cssText = [
    'position: absolute',
    'visibility: hidden',
    'pointer-events: none',
    'width: max-content',
    'min-width: max-content',
    'max-width: none',
    'left: -10000px',
    'top: 0',
  ].join(';');

  document.body.appendChild(clone);
  const width = Math.ceil(clone.getBoundingClientRect().width);
  document.body.removeChild(clone);

  return width;
}

function measureNavIntrinsicWidth(navEl) {
  return Math.max(
    measureNavExplicitWidth(navEl),
    measureNavCloneWidth(navEl),
    0,
  ) + MIN_WIDTH_BUFFER;
}

function measureHeaderDefaultWidth(headerEl) {
  const nav = headerEl?.querySelector('.nav');
  const menubar = headerEl?.querySelector('.app-menubar');

  const navWidth = nav ? measureNavIntrinsicWidth(nav) : 0;
  const menubarWidth = menubar ? measureFlexRow(menubar) : 0;

  return Math.max(navWidth, menubarWidth, 640);
}

async function applyLayout({ defaultWidth, updateMinWidth, lockMinOnly }) {
  if (!window.electronAPI?.syncHeaderLayout) return null;

  return window.electronAPI.syncHeaderLayout({
    defaultWidth,
    updateMinWidth: Boolean(updateMinWidth),
    lockMinOnly: Boolean(lockMinOnly),
  });
}

export async function syncAppMinWidthFromNav(navEl, { updateMinWidth = true, lockMinOnly = false } = {}) {
  if (lockMinOnly) {
    return applyLayout({ lockMinOnly: true });
  }

  const header = navEl?.closest('.app-header') || document.querySelector('.app-header');
  const defaultWidth = header ? measureHeaderDefaultWidth(header) : 640;

  const result = await applyLayout({ defaultWidth, updateMinWidth });

  return {
    defaultWidth,
    minWidth: result?.minWidth ?? result?.width ?? defaultWidth,
  };
}
