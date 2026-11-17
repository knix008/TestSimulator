// The start screen: a board of movable cards (startboard.js, the same board as
// MyUMLMaker and MyImageViewer) over a soft background in the theme's colours.
// Cards: program name, quick start, recent captures, tips and themes.
// Every button carries a data-action that app.js handles.
import { baseName, formatDuration } from './domain/naming.js';
import { t } from './i18n.js';
import { icon } from './icons.js';
import { card } from './startboard.js';
import { CUSTOM, fromCustom, SYSTEM, THEMES, themeName } from './themes.js';
import { escapeHtml, swatch } from './ui.js';

/** Quick-start tiles: mode, target, icon. */
export const QUICK_TASKS = [
  ['capture', 'monitor', 'monitor'],
  ['capture', 'window', 'window'],
  ['capture', 'region', 'region'],
  ['record', 'monitor', 'video'],
  ['record', 'window', 'window'],
  ['record', 'region', 'region'],
];

export const TIP_COUNT = 6;
const RECENT_COUNT = 8;

function heroBody({ appIcon, version }) {
  return `<div class="start-hero">
    <img src="${appIcon}" alt="" class="start-icon" />
    <div class="start-hero-text">
      <h1><span>MyCapture</span> <small class="start-version">${escapeHtml(version)}</small></h1>
      <p>${t('start.lead')}</p>
    </div>
    <div class="start-hero-actions">
      <button type="button" class="start-hero-btn" data-action="open-guide" title="${t('guide.title')}">${icon('book')}<span>${t('guide.title')}</span></button>
      <button type="button" class="start-hero-btn" data-action="open-settings" title="${t('settings.title')}">${icon('gear')}<span>${t('settings.title')}</span></button>
      <button type="button" class="start-hero-btn primary" data-action="start-close" title="${t('start.beginTip')}">${icon('chevronRight')}<span>${t('start.begin')}</span></button>
    </div>
  </div>`;
}

function quickBody(locked) {
  return `<div class="start-actions">${QUICK_TASKS.map(([mode, target, glyph]) => `
    <button type="button" class="start-tile ${mode}" data-action="start-quick" data-value="${mode}:${target}" ${locked ? 'disabled' : ''}>
      <span class="action-icon">${icon(glyph)}${mode === 'record' ? '<i class="rec-dot" aria-hidden="true"></i>' : ''}</span>
      <span class="action-text"><strong>${t(`start.quick.${mode}.${target}`)}</strong><small>${t(`start.quick.${mode}.${target}.detail`)}</small></span>
    </button>`).join('')}</div>`;
}

function recentBody(gallery, missing) {
  const items = [...gallery].reverse().slice(0, RECENT_COUNT);
  if (!items.length) {
    return `<div class="start-empty">${icon('images')}<span>${t('start.recentEmpty')}</span></div>`;
  }
  return `<div class="start-recent">${items.map((item) => {
    const name = baseName(item.path);
    const gone = missing.has(item.id);
    return `<button type="button" class="start-recent-item ${gone ? 'missing' : ''}" data-action="start-recent" data-value="${item.id}" title="${escapeHtml(name)}" ${gone ? 'disabled' : ''}>
      <span class="start-recent-thumb">${item.thumbnail ? `<img src="${item.thumbnail}" alt="" loading="lazy" />` : icon(item.kind === 'video' ? 'video' : 'camera')}
        ${item.kind === 'video' ? `<span class="start-recent-badge">${icon('video')}${item.durationMs != null ? formatDuration(item.durationMs) : ''}</span>` : ''}</span>
      <span class="start-recent-name">${escapeHtml(name)}</span>
    </button>`;
  }).join('')}</div>`;
}

function tipsBody() {
  return `<ul class="start-tips">${Array.from({ length: TIP_COUNT }, (_, i) => `<li>${icon('bulb')}<span>${t(`start.tip.${i}`)}</span></li>`).join('')}</ul>`;
}

function themesBody(settingsTheme, language, customTheme) {
  const row = (mode) => `<div class="start-theme-row">
    <span class="start-theme-label">${t(mode === 'dark' ? 'theme.dark' : 'theme.light')} <small>${THEMES.filter((theme) => theme.mode === mode).length}</small></span>
    <div class="start-theme-swatches" role="radiogroup" aria-label="${t(mode === 'dark' ? 'theme.dark' : 'theme.light')}">
      ${THEMES.filter((theme) => theme.mode === mode).map((theme) => {
        const name = escapeHtml(themeName(theme, language));
        const on = settingsTheme === theme.id;
        return `<button type="button" class="start-theme ${on ? 'current' : ''}" role="radio" aria-checked="${on}" data-action="theme-set" data-value="${theme.id}" title="${name}" aria-label="${name}">${swatch(theme)}</button>`;
      }).join('')}
    </div>
  </div>`;
  return `<div class="start-themes">
    ${row('dark')}
    ${row('light')}
    <div class="start-theme-extra">
      <button type="button" class="start-btn ${settingsTheme === SYSTEM ? 'on' : ''}" data-action="theme-set" data-value="${SYSTEM}">${icon('monitor')}<span>${t('theme.system')}</span></button>
      <button type="button" class="start-btn ${settingsTheme === CUSTOM ? 'on' : ''}" data-action="theme-custom">${swatch(customTheme)}<span>${t('theme.customEdit')}</span></button>
    </div>
  </div>`;
}

/** The whole start screen (tools, board, footer) as HTML. */
export function startHtml({ appIcon, version, settings, language, gallery, missing, locked }) {
  const moveTip = t('start.moveCard');
  const resizeTip = t('start.resizeCard');
  const section = (id, glyph, title, body, extra = '') => card(id, { icon: icon(glyph), title, body, moveTip, resizeTip, extra });
  return `<div class="start-bg" aria-hidden="true"></div>
    <div class="start-scroll">
      <div class="start-inner">
        <div class="start-tools">
          <label class="start-btn"><input type="checkbox" data-toggle="showStartScreen" ${settings.showStartScreen ? 'checked' : ''} /><span>${t('start.showOnStart')}</span></label>
          <button type="button" class="start-btn" data-action="start-arrange" title="${t('start.arrangeTip')}">${icon('grid')}<span>${t('start.arrange')}</span></button>
        </div>
        <div class="start-board">
          ${card('hero', { body: heroBody({ appIcon, version }), bare: true, locked: true })}
          ${section('begin', 'rocket', t('start.quick'), quickBody(locked))}
          ${section('recent', 'clock', t('start.recent'), recentBody(gallery, missing), `<span class="gallery-count">${gallery.length}</span>`)}
          ${section('tips', 'bulb', t('start.tips'), tipsBody())}
          ${section('themes', 'palette', t('start.themes'), themesBody(settings.theme, language, fromCustom(settings.customTheme)))}
        </div>
        <footer class="start-foot">${icon('info')}<span class="grow">MyCapture <span class="start-version">${escapeHtml(version)}</span></span><span>© shkwon</span></footer>
      </div>
    </div>`;
}
