import { UI_HEADER_MIN_WIDTH_FALLBACK, UI_NAV_SCROLL_TRAILING_GAP } from '../../../config/ui-layout.mjs';
import { translate } from '../i18n/index.js';
import {
  getDisplayProjectName,
  getDisplayRoleLabel,
  getDisplayUserName,
} from './displayLabels.js';

const MEASURE_LANGUAGES = ['ko', 'en'];
const MIN_WIDTH_BUFFER = 24;
const MIN_PROJECT_SELECT_WIDTH = 160;
const NAV_SCROLL_TRAILING_GAP = UI_NAV_SCROLL_TRAILING_GAP;
const SETTINGS_CLEARANCE = 8;

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

  const trailing = navEl.querySelector('.nav-trailing');
  const trailingWidth = trailing ? measureFlexRow(trailing) : 0;
  navEl.style.setProperty('--nav-trailing-width', `${trailingWidth}px`);

  const style = getComputedStyle(navEl);
  const paddingLeft = parseFloat(style.paddingLeft) || 0;
  const marginEnd = parseFloat(style.getPropertyValue('--nav-trailing-margin-end')) || 24;

  const scroll = navEl.querySelector('.nav-scroll');
  if (!scroll) return 0;

  const scrollStyle = getComputedStyle(scroll);
  const scrollPadLeft = parseFloat(scrollStyle.paddingLeft) || 0;
  const gap = parseFloat(scrollStyle.gap) || 0;
  const children = Array.from(scroll.children);
  let contentWidth = 0;
  children.forEach((child, index) => {
    contentWidth += measureElementWidth(child);
    if (index < children.length - 1) contentWidth += gap;
  });

  return Math.ceil(
    paddingLeft
    + scrollPadLeft
    + contentWidth
    + trailingWidth
    + NAV_SCROLL_TRAILING_GAP
    + marginEnd,
  );
}

function prepareMeasurementNav(navEl) {
  if (!navEl) return;

  const trailing = navEl.querySelector('.nav-trailing');
  if (!trailing) return;

  const trailingWidth = measureFlexRow(trailing);
  navEl.style.setProperty('--nav-trailing-width', `${trailingWidth}px`);
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
  prepareMeasurementNav(clone);
  const width = Math.ceil(clone.getBoundingClientRect().width);
  document.body.removeChild(clone);

  return width;
}

function measureNavIntrinsicWidth(navEl) {
  prepareMeasurementNav(navEl);
  return Math.max(
    measureNavExplicitWidth(navEl),
    measureNavCloneWidth(navEl),
    0,
  ) + MIN_WIDTH_BUFFER;
}

function makeTranslator(lang) {
  return (key, vars) => translate(lang, key, vars);
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

function applyNavLocale(navEl, lang, context) {
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
    let widestText = '';
    Array.from(select.options).forEach((option) => {
      const project = context.projects.find((item) => item.id === Number(option.value));
      if (!project) return;
      const text = getDisplayProjectName(project, t);
      option.textContent = text;
      if (text.length > widestText.length) widestText = text;
    });

    if (widestText) {
      const selectWidth = Math.max(
        MIN_PROJECT_SELECT_WIDTH,
        measureTextWidth(widestText, select) + 48,
      );
      select.style.width = `${selectWidth}px`;
      select.style.minWidth = `${selectWidth}px`;
    }
  }
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

function measureHeaderForLanguage(headerEl, lang, context) {
  const clone = mountMeasurementClone(headerEl);
  try {
    const nav = clone.querySelector('.nav');
    const menubar = clone.querySelector('.app-menubar');

    if (nav) {
      applyNavLocale(nav, lang, context);
      prepareMeasurementNav(nav);
    }
    if (menubar) applyI18nLabels(menubar, lang);

    const navWidth = nav ? measureNavIntrinsicWidth(nav) : 0;
    const menubarWidth = menubar ? measureFlexRow(menubar) : 0;
    return Math.max(navWidth, menubarWidth);
  } finally {
    document.body.removeChild(clone);
  }
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

function measureHeaderDefaultWidth(headerEl, context) {
  let maxWidth = UI_HEADER_MIN_WIDTH_FALLBACK;
  for (const lang of MEASURE_LANGUAGES) {
    maxWidth = Math.max(maxWidth, measureHeaderForLanguage(headerEl, lang, context));
  }
  return maxWidth;
}

function getNavSettingsElement(navEl) {
  return navEl?.querySelector('.nav-scroll a[href="/settings"]')
    || navEl?.querySelector('.nav-scroll a.nav-item[href$="/settings"]');
}

/** Pixels the settings control overlaps the fixed trailing cluster (0 = fully visible). */
export function measureNavSettingsOverlap(navEl) {
  if (!navEl) return 0;

  prepareMeasurementNav(navEl);

  const settingsEl = getNavSettingsElement(navEl);
  const trailing = navEl.querySelector('.nav-trailing');
  if (!settingsEl || !trailing) return 0;

  const settingsRect = settingsEl.getBoundingClientRect();
  const trailingRect = trailing.getBoundingClientRect();
  return Math.max(0, Math.ceil(settingsRect.right - trailingRect.left + SETTINGS_CLEARANCE));
}

function measureNavLiveMinWidth(navEl) {
  prepareMeasurementNav(navEl);
  const overlap = measureNavSettingsOverlap(navEl);
  if (overlap > 0) {
    return Math.ceil(window.innerWidth + overlap);
  }
  return Math.ceil(window.innerWidth);
}

function resolveAppMinWidth(navEl, headerEl, context) {
  const intrinsic = headerEl
    ? measureHeaderDefaultWidth(headerEl, context)
    : UI_HEADER_MIN_WIDTH_FALLBACK;
  const layoutFloor = navEl ? measureNavLiveMinWidth(navEl) : intrinsic;
  return Math.max(intrinsic, layoutFloor, UI_HEADER_MIN_WIDTH_FALLBACK);
}

async function applyLayout({ defaultWidth, updateMinWidth }) {
  if (!window.electronAPI?.syncHeaderLayout) return null;

  return window.electronAPI.syncHeaderLayout({
    defaultWidth,
    updateMinWidth: Boolean(updateMinWidth),
  });
}

export async function syncAppMinWidthFromNav(navEl, { updateMinWidth = true } = {}) {
  const header = navEl?.closest('.app-header') || document.querySelector('.app-header');
  const context = parseMeasureContext(navEl);
  const defaultWidth = resolveAppMinWidth(navEl, header, context);

  const result = await applyLayout({ defaultWidth, updateMinWidth });

  return {
    defaultWidth,
    minWidth: result?.minWidth ?? result?.width ?? defaultWidth,
  };
}
