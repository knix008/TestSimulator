import {
  UI_HEADER_MIN_WIDTH_FALLBACK,
  UI_NAV_MIN_SCROLL_VIEWPORT,
} from '../../../config/ui-layout.mjs';
import { translate } from '../i18n/index.js';
import {
  getDisplayProjectName,
  getDisplayRoleLabel,
  getDisplayUserName,
} from './displayLabels.js';

const MEASURE_LANGUAGES = ['ko', 'en'];
const MIN_WIDTH_BUFFER = 8;
const MIN_PROJECT_SELECT_WIDTH = 160;

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
  const children = Array.from(el.children).filter((child) => {
    const childStyle = getComputedStyle(child);
    return childStyle.display !== 'none' && childStyle.visibility !== 'hidden';
  });

  let width = padding;
  children.forEach((child, index) => {
    width += measureElementWidth(child);
    if (index < children.length - 1) width += gap;
  });

  return Math.ceil(width);
}

function makeTranslator(lang) {
  return (key, vars) => translate(lang, key, vars);
}

function applyI18nLabels(root, lang) {
  const t = makeTranslator(lang);
  root.querySelectorAll('[data-i18n-label]').forEach((el) => {
    const key = el.getAttribute('data-i18n-label');
    if (!key) return;
    const text = t(key);
    const labelEl = el.querySelector('.icon-text__label');
    if (labelEl) {
      labelEl.textContent = text;
      return;
    }
    const plainLabel = el.querySelector(':scope > span:not(.icon-text__icon)');
    if (plainLabel) {
      plainLabel.textContent = text;
    }
  });
}

function applyNavLocale(navEl, lang, context, { compact = false } = {}) {
  const t = makeTranslator(lang);
  applyI18nLabels(navEl, lang);

  const noProjectsEl = navEl.querySelector('[data-i18n-no-projects]');
  if (noProjectsEl) {
    noProjectsEl.textContent = t('nav.noProjects');
  }

  const userEl = navEl.querySelector('[data-i18n-user-display]');
  if (userEl && context.user) {
    const name = getDisplayUserName(context.user, t);
    const role = getDisplayRoleLabel(context.user.role, t);
    const labelEl = userEl.querySelector('.icon-text__label');
    if (labelEl) labelEl.textContent = `${name} (${role})`;
  }

  const select = navEl.querySelector('.nav-project select');
  if (select && context.projects?.length) {
    Array.from(select.options).forEach((option) => {
      const project = context.projects.find((item) => item.id === Number(option.value));
      if (!project) return;
      option.textContent = getDisplayProjectName(project, t);
    });

    if (!compact) {
      let widestText = '';
      Array.from(select.options).forEach((option) => {
        if (option.textContent.length > widestText.length) widestText = option.textContent;
      });
      if (widestText) {
        const selectWidth = Math.max(
          MIN_PROJECT_SELECT_WIDTH,
          measureTextWidth(widestText, select) + 48,
        );
        select.style.width = `${selectWidth}px`;
        select.style.minWidth = `${selectWidth}px`;
      }
    } else {
      select.style.width = `${MIN_PROJECT_SELECT_WIDTH}px`;
      select.style.minWidth = `${MIN_PROJECT_SELECT_WIDTH}px`;
    }
  }
}

function measureTextWidth(text, referenceEl) {
  const probe = document.createElement('span');
  probe.textContent = text;
  const refStyle = getComputedStyle(referenceEl);
  probe.style.cssText = [
    'position: absolute',
    'visibility: hidden',
    'white-space: nowrap',
    'left: -10000px',
    `font: ${refStyle.font}`,
  ].join(';');
  document.body.appendChild(probe);
  const width = Math.ceil(probe.getBoundingClientRect().width);
  document.body.removeChild(probe);
  return width;
}

function mountMeasurementClone(el) {
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
  return clone;
}

function measureLastScrollItemWidth(root) {
  const scroll = root?.querySelector('.nav-scroll');
  if (!scroll) return UI_NAV_MIN_SCROLL_VIEWPORT;

  const children = Array.from(scroll.children).filter((child) => {
    const style = getComputedStyle(child);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });
  if (children.length === 0) return UI_NAV_MIN_SCROLL_VIEWPORT;

  return measureElementWidth(children[children.length - 1]);
}

function measureNavCompactMinWidth(navEl, lang, context) {
  const clone = mountMeasurementClone(navEl);
  try {
    applyNavLocale(clone, lang, context, { compact: true });

    const style = getComputedStyle(clone);
    const paddingH = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
    const gap = parseFloat(style.gap) || 8;
    const trailing = clone.querySelector('.nav-trailing');
    const trailingWidth = trailing ? measureFlexRow(trailing) : 0;
    const scrollAnchorWidth = measureLastScrollItemWidth(clone);

    return Math.ceil(
      paddingH + gap + trailingWidth + scrollAnchorWidth + MIN_WIDTH_BUFFER,
    );
  } finally {
    document.body.removeChild(clone);
  }
}

function measureMenubarMinWidth(menubarEl, lang) {
  const clone = mountMeasurementClone(menubarEl);
  try {
    applyI18nLabels(clone, lang);
    return measureFlexRow(clone);
  } finally {
    document.body.removeChild(clone);
  }
}

function measureHeaderCompactWidth(headerEl, context) {
  const nav = headerEl.querySelector('.nav');
  const menubar = headerEl.querySelector('.app-menubar');
  let maxWidth = UI_HEADER_MIN_WIDTH_FALLBACK;

  for (const lang of MEASURE_LANGUAGES) {
    const navWidth = nav ? measureNavCompactMinWidth(nav, lang, context) : 0;
    const menubarWidth = menubar ? measureMenubarMinWidth(menubar, lang) : 0;
    maxWidth = Math.max(maxWidth, navWidth, menubarWidth);
  }

  return maxWidth;
}

function parseMeasureContext(navEl) {
  let user = null;
  let projects = [];

  try {
    if (navEl?.dataset?.measureUser) {
      user = JSON.parse(navEl.dataset.measureUser);
    }
    if (navEl?.dataset?.measureProjects) {
      projects = JSON.parse(navEl.dataset.measureProjects);
    }
  } catch {
    user = null;
    projects = [];
  }

  return { user, projects };
}

function measureNavSettingsTrailingOverlap(navEl) {
  if (!navEl) return 0;

  const scroll = navEl.querySelector('.nav-scroll');
  const trailing = navEl.querySelector('.nav-trailing');
  if (!scroll || !trailing) return 0;

  const scrollItems = Array.from(scroll.children).filter((child) => {
    const style = getComputedStyle(child);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });
  const settingsEl = scrollItems[scrollItems.length - 1];
  if (!settingsEl) return 0;

  const settingsRect = settingsEl.getBoundingClientRect();
  const trailingRect = trailing.getBoundingClientRect();
  const overlap = settingsRect.right - trailingRect.left + 2;
  if (overlap > 0) {
    return Math.ceil(window.innerWidth + overlap);
  }

  return 0;
}

export function scrollNavSettingsIntoView(navEl) {
  const scroll = navEl?.querySelector('.nav-scroll');
  if (!scroll) return;
  const maxScroll = scroll.scrollWidth - scroll.clientWidth;
  if (maxScroll > 0) {
    scroll.scrollLeft = maxScroll;
  }
}

function measureNavOverflowMinWidth(navEl) {
  if (!navEl) return 0;

  const navRect = navEl.getBoundingClientRect();
  const trailing = navEl.querySelector('.nav-trailing');
  if (trailing) {
    const trailingRect = trailing.getBoundingClientRect();
    if (trailingRect.right > navRect.right + 1) {
      return Math.ceil(window.innerWidth + (trailingRect.right - navRect.right));
    }
  }

  return 0;
}

function measureToolbarOverlap() {
  const toolbar = document.querySelector('.requirements-toolbar');
  if (!toolbar) return 0;

  const toolbarRect = toolbar.getBoundingClientRect();
  const items = Array.from(toolbar.children).filter((child) => {
    const rect = child.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });

  if (items.length === 0) return 0;

  let overlap = 0;
  for (let index = 1; index < items.length; index += 1) {
    const prev = items[index - 1].getBoundingClientRect();
    const next = items[index].getBoundingClientRect();
    if (next.left < prev.right - 1) {
      overlap = Math.max(overlap, prev.right - next.left + 4);
    }
  }

  const last = items[items.length - 1].getBoundingClientRect();
  if (last.right > toolbarRect.right + 1) {
    overlap = Math.max(overlap, last.right - toolbarRect.right + 4);
  }

  return overlap > 0 ? Math.ceil(window.innerWidth + overlap) : 0;
}

function measureMenubarOverlap() {
  const menubar = document.querySelector('.app-menubar');
  if (!menubar) return 0;

  const menubarRect = menubar.getBoundingClientRect();
  const items = Array.from(menubar.querySelectorAll('.app-menu-bar > *')).filter((child) => {
    const rect = child.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });

  if (items.length === 0) return 0;

  let overlap = 0;
  for (let index = 1; index < items.length; index += 1) {
    const prev = items[index - 1].getBoundingClientRect();
    const next = items[index].getBoundingClientRect();
    if (next.left < prev.right - 1) {
      overlap = Math.max(overlap, prev.right - next.left + 4);
    }
  }

  const last = items[items.length - 1].getBoundingClientRect();
  if (last.right > menubarRect.right + 1) {
    overlap = Math.max(overlap, last.right - menubarRect.right + 4);
  }

  return overlap > 0 ? Math.ceil(window.innerWidth + overlap) : 0;
}

function measureOverflowMinWidth(navEl) {
  return Math.max(
    measureNavOverflowMinWidth(navEl),
    measureNavSettingsTrailingOverlap(navEl),
    measureToolbarOverlap(),
    measureMenubarOverlap(),
  );
}

function measureLayoutMinWidth(headerEl, navEl, context) {
  const compact = headerEl ? measureHeaderCompactWidth(headerEl, context) : UI_HEADER_MIN_WIDTH_FALLBACK;
  const overflowMin = measureOverflowMinWidth(navEl);

  if (overflowMin > 0) {
    return Math.max(overflowMin, compact, UI_HEADER_MIN_WIDTH_FALLBACK);
  }

  return Math.max(compact, UI_HEADER_MIN_WIDTH_FALLBACK);
}

async function applyLayout({ defaultWidth, updateMinWidth, lockToCurrentWidth = false, replaceMinimum = false }) {
  if (!window.electronAPI?.syncHeaderLayout) return null;

  return window.electronAPI.syncHeaderLayout({
    defaultWidth,
    updateMinWidth: Boolean(updateMinWidth),
    lockToCurrentWidth: Boolean(lockToCurrentWidth),
    replaceMinimum: Boolean(replaceMinimum),
  });
}

let cachedCompactWidth = 0;
let cachedCompactKey = '';

function buildIntrinsicCacheKey(context) {
  const user = context.user;
  const projectSignature = (context.projects || [])
    .map((project) => `${project.id}:${project.name}:${project.code}`)
    .join('|');
  return `${user?.id ?? ''}|${user?.role ?? ''}|${projectSignature}`;
}

function measureCachedCompactWidth(headerEl, context, { fast = false } = {}) {
  const baseKey = buildIntrinsicCacheKey(context);
  if (!fast && cachedCompactKey === baseKey && cachedCompactWidth > 0) {
    return cachedCompactWidth;
  }

  const width = measureHeaderCompactWidth(headerEl, context);
  if (!fast) {
    cachedCompactKey = baseKey;
    cachedCompactWidth = width;
  }
  return width;
}

export async function lockAppWindowMinimumSize() {
  if (!window.electronAPI?.lockCurrentWindowMinimum) return null;
  return window.electronAPI.lockCurrentWindowMinimum();
}

export async function syncAppMinWidthFromNav(navEl, { updateMinWidth = true, deferHeavyMeasure = false } = {}) {
  const header = navEl?.closest('.app-header') || document.querySelector('.app-header');
  const context = parseMeasureContext(navEl);

  if (deferHeavyMeasure) {
    if (!updateMinWidth) return null;

    const overflowMin = measureOverflowMinWidth(navEl);
    if (overflowMin <= 0) return null;

    const result = await applyLayout({ defaultWidth: overflowMin, updateMinWidth: true });
    return {
      defaultWidth: overflowMin,
      minWidth: result?.minWidth ?? result?.width ?? overflowMin,
    };
  }

  const compactWidth = measureLayoutMinWidth(header, navEl, context);
  measureCachedCompactWidth(header, context, { fast: false });

  if (updateMinWidth) {
    const result = await applyLayout({
      defaultWidth: compactWidth,
      updateMinWidth: true,
      replaceMinimum: true,
    });
    return {
      defaultWidth: compactWidth,
      minWidth: result?.minWidth ?? result?.width ?? compactWidth,
    };
  }

  return null;
}

export async function syncAppMinWidthOnResize(navEl) {
  return syncAppMinWidthFromNav(navEl, { updateMinWidth: true, deferHeavyMeasure: true });
}
