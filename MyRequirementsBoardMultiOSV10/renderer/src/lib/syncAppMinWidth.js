import { UI_MIN_HEIGHT } from '../../../config/ui-layout.mjs';

let defaultSizeApplied = false;

export function isDefaultSizeApplied() {
  return defaultSizeApplied;
}

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

function rowGap(el) {
  return parseFloat(getComputedStyle(el).columnGap || getComputedStyle(el).gap) || 0;
}

function rowPadding(el) {
  const style = getComputedStyle(el);
  return parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
}

function measureNavDefaultWidth(navEl) {
  if (!navEl) return 0;

  const gap = rowGap(navEl);
  const padding = rowPadding(navEl);
  const scroll = navEl.querySelector('.nav-scroll');
  const programInfo = navEl.querySelector('.nav-program-info');
  const trailing = navEl.querySelector('.nav-trailing');

  const scrollWidth = scroll ? measureFlexRow(scroll) : 0;
  const programInfoWidth = programInfo ? measureElementWidth(programInfo) : 0;
  const trailingWidth = trailing ? measureFlexRow(trailing) : 0;

  const segments = [scrollWidth, programInfoWidth, trailingWidth];
  const content = segments.reduce((sum, width) => sum + width, 0);
  const gaps = gap * Math.max(segments.filter((width) => width > 0).length - 1, 0);

  return padding + content + gaps;
}

function measureHeaderDefaultWidth(headerEl) {
  const nav = headerEl?.querySelector('.nav');
  const menubar = headerEl?.querySelector('.app-menubar');

  const navWidth = nav ? measureNavDefaultWidth(nav) : 0;
  const menubarWidth = menubar ? measureFlexRow(menubar) : 0;

  return Math.max(navWidth, menubarWidth, 640);
}

async function applyLayout({ defaultWidth, applyDefaultSize, lockMinOnly, refitLayout }) {
  if (!window.electronAPI?.syncHeaderLayout) return null;

  if (lockMinOnly) {
    return window.electronAPI.syncHeaderLayout({ lockMinOnly: true });
  }

  if (refitLayout) {
    return window.electronAPI.syncHeaderLayout({
      defaultWidth,
      applyDefaultSize: true,
    });
  }

  const shouldApply = applyDefaultSize && !defaultSizeApplied;
  const result = await window.electronAPI.syncHeaderLayout({
    defaultWidth,
    applyDefaultSize: shouldApply,
  });

  if (shouldApply) defaultSizeApplied = true;

  return result;
}

export async function syncAppMinWidthFromNav(navEl, { applyDefaultSize = false, lockMinOnly = false, refitLayout = false } = {}) {
  if (lockMinOnly) {
    return applyLayout({ lockMinOnly: true });
  }

  const header = navEl?.closest('.app-header') || document.querySelector('.app-header');
  const defaultWidth = header ? measureHeaderDefaultWidth(header) : 640;

  const result = await applyLayout({ defaultWidth, applyDefaultSize, refitLayout });

  return {
    defaultWidth,
    minWidth: result?.width ?? defaultWidth,
  };
}

export function resetAppMinWidthLock() {
  defaultSizeApplied = false;
}
