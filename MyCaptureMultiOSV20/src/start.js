// The start screen: a board of movable cards (startboard.js, the same board as
// MyUMLMaker and MyImageViewer) over a moving capture scene (startbg.js) in the
// theme's colours. Cards: program name, quick start, recent captures (each with
// its own delete, plus delete all), tips and the moving background (24 scenes,
// motion, automatic change, speed, transparency — like MyUMLMaker's card). Themes
// are chosen in the title bar's theme menu and in Settings.
// Every button carries a data-action that app.js handles.
import { baseName, formatDuration } from './domain/naming.js';
import {
  START_BG_KINDS, START_BG_MOTIONS, START_BG_SHUFFLE, START_BG_SPEED, START_BG_TRANSPARENCY, START_CARD_TRANSPARENCY,
} from './domain/settings.js';
import { t } from './i18n.js';
import { icon } from './icons.js';
import { card } from './startboard.js';
import { escapeHtml } from './ui.js';

/** Quick-start tiles: mode, target, icon. */
export const QUICK_TASKS = [
  ['capture', 'monitor', 'monitor'],
  ['capture', 'window', 'window'],
  ['capture', 'region', 'region'],
  ['record', 'monitor', 'video'],
  ['record', 'window', 'window'],
  ['record', 'region', 'region'],
];

/** The icon of each background scene and motion (start card and Settings). */
export const SCENE_ICONS = Object.freeze({
  studio: 'camera', region: 'region', film: 'film', lens: 'aperture',
  aurora: 'aurora', waves: 'waves', particles: 'particles', constellation: 'constellation', bubbles: 'bubbles', gridflow: 'gridflow',
  flowchart: 'flowchart', starfield: 'starfield', rain: 'rain', snow: 'snow', fireflies: 'fireflies', ripples: 'ripples',
  coderain: 'coderain', hexagons: 'hexagons', orbits: 'orbits', lava: 'lava', spiral: 'spiral', confetti: 'confetti', nodes: 'nodes', ribbons: 'ribbons',
});
export const MOTION_ICONS = Object.freeze({ animated: 'play', still: 'pause', off: 'stop' });

/** "30 s", "1 min" … for the automatic scene change. */
export const shuffleLabel = (seconds) => (seconds === 0 ? t('startBg.shuffle.off') : seconds < 60 ? t('startBg.shuffle.seconds', { n: seconds }) : t('startBg.shuffle.minutes', { n: seconds / 60 }));

/**
 * The moving background card (as MyUMLMaker's): a tile per scene — MyCapture's four
 * capture scenes and twenty general ones — then Animated / Still / Off, "another one",
 * the automatic change, speed, the background's and the cards' transparency, and reset.
 * Rebuilt on its own when these settings change (backgroundKey); the board stays put.
 */
export function backgroundBody(settings) {
  const off = settings.startBgMotion === 'off';
  const tiles = START_BG_KINDS.map((kind) => {
    const on = settings.startBgKind === kind;
    return `<button type="button" class="bg-tile${on ? ' on' : ''}" role="radio" aria-checked="${on}" data-action="start-bg-kind" data-value="${kind}" title="${escapeHtml(t(`startBg.kind.${kind}.detail`))}">${icon(SCENE_ICONS[kind])}<span>${t(`startBg.kind.${kind}`)}</span></button>`;
  }).join('');
  const radio = (action, value, on, glyph, label) => `<button type="button" class="start-btn${on ? ' on' : ''}" role="radio" aria-checked="${on}" data-action="${action}" data-value="${value}">${icon(glyph)}<span>${label}</span></button>`;
  const motions = START_BG_MOTIONS.map((motion) => radio('start-bg-motion', motion, settings.startBgMotion === motion, MOTION_ICONS[motion], t(`startBg.motion.${motion}`))).join('');
  const shuffles = START_BG_SHUFFLE.map((seconds) => radio('start-bg-auto', seconds, settings.startBgShuffle === seconds, seconds ? 'clock' : 'stop', shuffleLabel(seconds))).join('');
  const slider = (key, range, glyph, label, disabled) => `<label class="start-slider" title="${label}">${icon(glyph)}<span>${label}</span>
      <input type="range" min="${range.min}" max="${range.max}" step="${range.step}" value="${settings[key]}" data-input="${key}" aria-label="${label}" ${disabled ? 'disabled' : ''} />
      <output data-output="${key}">${settings[key]}%</output></label>`;
  return `<div class="bg-grid" role="radiogroup" aria-label="${t('startBg.scene')}">${tiles}</div>
    <div class="start-controls">
      <div class="start-motion" role="radiogroup" aria-label="${t('startBg.motion')}">${motions}</div>
      <button type="button" class="start-btn" data-action="start-bg-random" title="${t('startBg.randomTip')}">${icon('shuffle')}<span>${t('startBg.random')}</span></button>
      <div class="start-motion" role="radiogroup" aria-label="${t('startBg.shuffle')}"><span class="start-controls-label">${icon('clock')}<span>${t('startBg.shuffle')}</span></span>${shuffles}</div>
    </div>
    <div class="start-controls">
      ${slider('startBgSpeed', START_BG_SPEED, 'gaugeHigh', t('startBg.speed'), off)}
      ${slider('startBgTransparency', START_BG_TRANSPARENCY, 'opacity', t('startBg.transparency'), off)}
      ${slider('startCardTransparency', START_CARD_TRANSPARENCY, 'frame', t('startBg.cardTransparency'), false)}
      <button type="button" class="start-btn" data-action="start-bg-reset" title="${t('startBg.reset')}">${icon('refresh')}<span>${t('startBg.reset')}</span></button>
    </div>`;
}

/** What the background card shows: rebuild it when this changes. */
export const backgroundKey = (settings) => [
  settings.startBgKind, settings.startBgMotion, settings.startBgSpeed, settings.startBgTransparency, settings.startCardTransparency, settings.startBgShuffle,
].join('|');

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
  // The history is stored newest first: the first few are the most recent.
  const items = gallery.slice(0, RECENT_COUNT);
  if (!items.length) {
    return `<div class="start-empty">${icon('images')}<span>${t('start.recentEmpty')}</span></div>`;
  }
  // Each entry opens in the viewer, and has its own delete button (the history entry only;
  // the file stays). Entries whose file is gone never get here: app.js drops them.
  const remove = t('gallery.delete');
  return `<div class="start-recent">${items.map((item) => {
    const name = escapeHtml(baseName(item.path));
    const gone = missing.has(item.id);
    return `<div class="start-recent-item ${gone ? 'missing' : ''}" data-id="${item.id}">
      <button type="button" class="start-recent-open" data-action="start-recent" data-value="${item.id}" title="${name}" ${gone ? 'disabled' : ''}>
        <span class="start-recent-thumb">${item.thumbnail ? `<img src="${item.thumbnail}" alt="" loading="lazy" />` : icon(item.kind === 'video' ? 'video' : 'camera')}
          ${item.kind === 'video' ? `<span class="start-recent-badge">${icon('video')}${item.durationMs != null ? formatDuration(item.durationMs) : ''}</span>` : ''}</span>
        <span class="start-recent-name">${name}</span>
      </button>
      <button type="button" class="start-recent-delete" data-action="gallery-delete" data-value="${item.id}" title="${remove}" aria-label="${remove}: ${name}">${icon('close')}</button>
    </div>`;
  }).join('')}</div>`;
}

/** Recent captures' header: how many, and "delete all" (asks first, files are kept). */
function recentExtra(count) {
  return `<span class="gallery-count">${count}</span>
    <button type="button" class="start-card-action danger" data-action="gallery-clear" title="${t('gallery.clearTitle')}" ${count ? '' : 'disabled'}>${icon('trash')}<span>${t('gallery.clear')}</span></button>`;
}

function tipsBody() {
  return `<ul class="start-tips">${Array.from({ length: TIP_COUNT }, (_, i) => `<li>${icon('bulb')}<span>${t(`start.tip.${i}`)}</span></li>`).join('')}</ul>`;
}

/** The whole start screen (tools, board, footer) as HTML. */
export function startHtml({ appIcon, version, settings, language, gallery, missing, locked }) {
  const moveTip = t('start.moveCard');
  const resizeTip = t('start.resizeCard');
  const section = (id, glyph, title, body, extra = '') => card(id, { icon: icon(glyph), title, body, moveTip, resizeTip, extra });
  return `<div class="start-bg" aria-hidden="true"><canvas class="start-bg-canvas"></canvas></div>
    <div class="start-scroll">
      <div class="start-inner">
        <div class="start-tools">
          <label class="start-btn"><input type="checkbox" data-toggle="showStartScreen" ${settings.showStartScreen ? 'checked' : ''} /><span>${t('start.showOnStart')}</span></label>
          <button type="button" class="start-btn" data-action="start-background" title="${t('startBg.tip')}">${icon('images')}<span>${t('startBg.button')}</span></button>
          <button type="button" class="start-btn" data-action="start-arrange" title="${t('start.arrangeTip')}">${icon('grid')}<span>${t('start.arrange')}</span></button>
        </div>
        <div class="start-board">
          ${card('hero', { body: heroBody({ appIcon, version }), bare: true, locked: true })}
          ${section('begin', 'rocket', t('start.quick'), quickBody(locked))}
          ${section('recent', 'clock', t('start.recent'), recentBody(gallery, missing), recentExtra(gallery.length))}
          ${section('tips', 'bulb', t('start.tips'), tipsBody())}
          ${section('background', 'film', t('startBg.card'), backgroundBody(settings))}
        </div>
        <footer class="start-foot">${icon('info')}<span class="grow">MyCapture <span class="start-version">${escapeHtml(version)}</span></span><span>© shkwon</span></footer>
      </div>
    </div>`;
}
