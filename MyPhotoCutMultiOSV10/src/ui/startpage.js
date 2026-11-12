// Start page: shown when the app starts (if enabled) and from the Home button. A moving
// background behind a board of translucent cards that can be moved and resized: what to do
// (open a photo, take one with the camera, recent files), sample portraits to start from, the
// caricature styles (which ones a new photo gets) and the moving background.
// ui/startboard.js places the cards.
import appIcon from '../../assets/icon-256.png';
import { escapeHtml } from './dom.js';
import { animationIcon, icon } from '../icons.js';
import { t, getLanguage } from '../i18n.js';
import { ANIMATION_KINDS } from './background.js';
import { baseName } from '../domain/project.js';
import { ANIMATION_INTERVALS } from '../domain/settings.js';
import { switchFlag } from '../flags.js';
import { SAMPLE_PHOTOS, sampleUrl } from '../domain/samples.js';
import { STYLES } from '../engine/styles.js';

const GRIP = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="20" cy="20" r="2"/><circle cx="14" cy="20" r="2"/><circle cx="20" cy="14" r="2"/><circle cx="8" cy="20" r="2"/><circle cx="14" cy="14" r="2"/><circle cx="20" cy="8" r="2"/></svg>';

/** "Every 30 s" / "Every 2 min" / "Off" for the automatic background change. */
export const intervalLabel = (seconds) => (!seconds ? t('start.never') : seconds < 60 ? t('start.everySeconds', { n: seconds }) : t('start.everyMinutes', { n: seconds / 60 }));

/** One card: its handle and title (none on a bare card), its body and its resize corner. A fixed card stays put. */
function card(id, glyph, title, body, { extra = '', bare = false, classes = '', fixed = false } = {}) {
  const handle = fixed ? '' : `<button type="button" class="card-handle" data-card-handle="${id}" title="${escapeHtml(t('start.moveCard'))}" aria-label="${escapeHtml(t('start.moveCard'))}">${icon('moveHandle')}</button>`;
  const resize = fixed ? '' : `<span class="card-resize" data-card-resize="${id}" title="${escapeHtml(t('start.resizeCard'))}">${GRIP}</span>`;
  return `<section class="start-card start-card-${id} ${id} ${classes} ${bare ? 'bare' : ''} ${fixed ? 'fixed' : ''}" data-card="${id}" ${title ? `aria-label="${escapeHtml(title)}"` : ''}>
    ${bare ? (handle ? `<span class="card-handle-float">${handle}</span>` : '') : `<h2>${handle}${icon(glyph)}<span class="start-card-title">${escapeHtml(title)}</span><span class="grow"></span>${extra}</h2>`}
    <div class="card-body">${body}</div>
    ${resize}
  </section>`;
}

const tile = (start, glyph, label, tip, { value = '', flag = '', cls = 'start-tile' } = {}) => `<button type="button" class="${cls}" data-start="${start}" ${value ? `data-value="${escapeHtml(value)}"` : ''} title="${escapeHtml(tip)}">${flag ? `<span class="flag-slot">${flag}</span>` : icon(glyph)}<b>${escapeHtml(label)}</b><small>${escapeHtml(tip)}</small></button>`;

function actionsBody(L, app) {
  const items = [
    ['open', 'folderOpen', t('action.open'), t('start.tipOpen')],
    ['camera', 'camera', t('action.camera'), t('start.tipCamera')],
    ['paste', 'paste', t('action.pastePhoto'), t('start.tipPaste')],
    ['continue', 'photo', t('start.continue'), t('start.tipContinue'), { disabled: !app.hasPhoto() }],
    ['styles', 'styleSet', t('action.styleSet'), t('start.tipStyles')],
    ['language', 'globe', L === 'ko' ? 'English' : '한국어', t('start.tipLanguage'), { flag: switchFlag(L) }],
    ['settings', 'gear', t('action.settings'), t('start.tipSettings')],
    ['about', 'info', t('action.about'), t('start.tipAbout')],
    ['exit', 'exit', t('action.exit'), t('start.tipExit')],
  ];
  return `<div class="start-actions">${items.filter(([, , , , options]) => !options?.disabled).map(([start, glyph, label, tip, options]) => tile(start, glyph, label, tip, options)).join('')}</div>`;
}

function recentBody(app, settings) {
  const recent = app.state.recent.slice(0, settings.startRecentCount ?? 8);
  const dirs = app.state.recentDirs.slice(0, settings.startRecentCount ?? 8);
  const recentHtml = recent.length ? recent.map((item) => `<div class="start-row" title="${escapeHtml(item.path)}">
      <button class="start-link" data-start="open-recent" data-value="${escapeHtml(item.path)}">${icon(/\.mypcut$/i.test(item.path) ? 'gallery' : 'photo')}<span class="name">${escapeHtml(baseName(item.path))}</span><span class="path">${escapeHtml(item.web ? t('recent.webFile') : item.path)}</span></button>
      <button class="icon-button" data-start="remove-recent" data-value="${escapeHtml(item.path)}" title="${escapeHtml(t('recent.remove'))}" aria-label="${escapeHtml(t('recent.remove'))}">${icon('close')}</button>
    </div>`).join('') : `<div class="start-empty">${icon('info')}<span>${escapeHtml(t('recent.empty'))}</span></div>`;
  const dirsHtml = dirs.length ? dirs.map((item) => `<div class="start-row" title="${escapeHtml(item.path)}">
      <button class="start-link" data-start="open-folder" data-value="${escapeHtml(item.path)}">${icon('folder')}<span class="name">${escapeHtml(baseName(item.path) || item.path)}</span><span class="path">${escapeHtml(item.path)}</span></button>
      <button class="icon-button" data-start="remove-folder" data-value="${escapeHtml(item.path)}" title="${escapeHtml(t('recent.removeFolder'))}" aria-label="${escapeHtml(t('recent.removeFolder'))}">${icon('close')}</button>
    </div>`).join('') : `<div class="start-empty">${icon('info')}<span>${escapeHtml(t('recent.noFolders'))}</span></div>`;
  const recentBlock = settings.startShowRecent === false ? '' : `<h3 class="start-sub">${icon('recent')}<span>${escapeHtml(t('start.recent'))}</span><span class="grow"></span>${recent.length ? `<button class="small-button danger" data-start="clear-recent" title="${escapeHtml(t('recent.clear'))}">${icon('clearHistory')}<span>${escapeHtml(t('recent.clear'))}</span></button>` : ''}</h3><div class="start-list">${recentHtml}</div>`;
  const foldersBlock = settings.startShowFolders === false ? '' : `<h3 class="start-sub">${icon('recentFolder')}<span>${escapeHtml(t('start.recentFolders'))}</span><span class="grow"></span>${dirs.length ? `<button class="small-button danger" data-start="clear-folders" title="${escapeHtml(t('recent.clearFolders'))}">${icon('trash')}<span>${escapeHtml(t('recent.clearFolders'))}</span></button>` : ''}</h3><div class="start-list">${dirsHtml}</div>`;
  return `${recentBlock}${foldersBlock}`;
}

function samplesBody(L) {
  return `<div class="sample-photos">${SAMPLE_PHOTOS.map((sample) => `<button type="button" class="sample-photo" data-start="sample" data-value="${sample.id}" title="${escapeHtml(t('start.sampleTip', { name: sample[L] }))}">
    <img src="${escapeHtml(sampleUrl(sample))}" alt="" draggable="false" /><span>${escapeHtml(sample[L])}</span></button>`).join('')}</div>
    <p class="start-note">${icon('info')}<span>${escapeHtml(t('start.samplesCredit'))}</span></p>`;
}

function stylesBody(settings) {
  const set = new Set(settings.styleSet);
  return `<div class="start-styles">${STYLES.map((style) => `<button type="button" class="style-chip ${set.has(style.id) ? 'on' : ''}" data-start="toggle-style" data-value="${style.id}" role="switch" aria-checked="${set.has(style.id)}" title="${escapeHtml(t(`style.${style.id}.desc`))}">
    ${icon(style.icon)}<span>${escapeHtml(t(`style.${style.id}`))}</span>${set.has(style.id) ? icon('check', 'icon tick') : ''}</button>`).join('')}</div>
    <p class="start-note">${icon('bulb')}<span>${escapeHtml(t('start.stylesNote', { count: set.size }))}</span></p>`;
}

function backgroundBody(settings) {
  return `<div class="anim-chips bg-grid" role="radiogroup">${ANIMATION_KINDS.map((kind) => `<button class="anim-chip bg-tile ${settings.animation === kind && settings.backgroundKind === 'animated' ? 'active on' : ''}" data-start="animation" data-value="${kind}" role="radio" aria-checked="${settings.animation === kind}" title="${escapeHtml(t(`animation.${kind}`))}">${icon(animationIcon(kind))}<span>${escapeHtml(t(`animation.${kind}`))}</span></button>`).join('')}</div>
    <div class="start-controls">
      <button class="start-btn" data-start="shuffle" title="${escapeHtml(t('action.shuffleBackground'))}">${icon('dice')}<span>${escapeHtml(t('action.shuffleBackground'))}</span></button>
      <button class="start-btn" data-start="background-image" title="${escapeHtml(t('action.backgroundImage'))}">${icon('imageBg')}<span>${escapeHtml(t('action.backgroundImage'))}</span></button>
      <label class="start-speed" title="${escapeHtml(t('settings.animationSpeed'))}">${icon('speed')}<span>${escapeHtml(t('settings.animationSpeed'))}</span><input type="range" min="0" max="300" step="10" value="${settings.animationSpeed}" data-start-speed /><output>${settings.animationSpeed}%</output></label>
      <label class="start-speed" title="${escapeHtml(t('start.cardOpacity'))}">${icon('opacity')}<span>${escapeHtml(t('start.cardOpacity'))}</span><input type="range" min="20" max="100" step="5" value="${settings.startCardOpacity}" data-start-opacity /><output>${settings.startCardOpacity}%</output></label>
      <label class="start-check" title="${escapeHtml(t('tip.bgRandom'))}"><input type="checkbox" data-start-random ${settings.animationRandom ? 'checked' : ''} /><span>${escapeHtml(t('start.bgRandom'))}</span></label>
      <label class="start-interval" title="${escapeHtml(t('tip.bgInterval'))}">${icon('clock')}<span>${escapeHtml(t('start.bgInterval'))}</span><select data-icon="clock" data-start-interval aria-label="${escapeHtml(t('start.bgInterval'))}">${ANIMATION_INTERVALS.map((n) => `<option value="${n}" ${settings.animationInterval === n ? 'selected' : ''}>${escapeHtml(intervalLabel(n))}</option>`).join('')}</select></label>
    </div>`;
}

export function startPageHtml(app) {
  const L = getLanguage();
  const settings = app.settings();
  const version = app.version();
  const hero = `
    <img src="${appIcon}" alt="" class="start-icon" />
    <div class="start-hero-text">
      <h1><span>MyPhotoCut</span> <small>v${escapeHtml(version)}</small></h1>
      <p>${escapeHtml(t('start.tagline'))}</p>
    </div>
    <div class="start-hero-actions">
      <button class="button big doc-button" data-start="guide" title="${escapeHtml(t('tip.userGuide'))}">${icon('userGuide')}<span>${escapeHtml(t('action.userGuide'))}</span></button>
      <button class="button big" data-start="camera" title="${escapeHtml(t('start.tipCamera'))}">${icon('camera')}<span>${escapeHtml(t('action.camera'))}</span></button>
      <button class="button primary big" data-start="open" title="${escapeHtml(t('start.tipOpen'))}">${icon('folderOpen')}<span>${escapeHtml(t('start.openPhoto'))}</span></button>
    </div>`;
  const cards = [
    card('hero', '', '', hero, { bare: true, classes: 'start-hero', fixed: true }),
    card('actions', 'launcher', t('start.actions'), actionsBody(L, app)),
    settings.startShowRecent === false && settings.startShowFolders === false ? '' : card('recent', 'recent', t('start.recentCard'), recentBody(app, settings)),
    settings.startShowSamples === false ? '' : card('samples', 'samples', t('start.samples'), samplesBody(L), { extra: `<span class="start-card-note">${SAMPLE_PHOTOS.length}</span>` }),
    card('styles', 'styleSet', t('start.styles'), stylesBody(settings), { extra: `<span class="start-card-note">${settings.styleSet.length} / ${STYLES.length}</span>` }),
    settings.startShowBackground === false ? '' : card('background', 'sparkles', t('start.background'), backgroundBody(settings)),
  ];
  return `
    <canvas class="start-bg" aria-hidden="true"></canvas>
    <div class="start-scroll">
      <div class="start-inner" style="--start-card-alpha:${settings.startCardOpacity}%">
        <div class="start-tools">
          <label class="start-btn start-startup check-row" title="${escapeHtml(t('settings.showStartPage'))}"><input type="checkbox" data-start-toggle ${settings.showStartPage ? 'checked' : ''} /><span>${escapeHtml(t('settings.showStartPage'))}</span></label>
          <button class="start-btn" data-start="start-settings" title="${escapeHtml(t('start.tipStartSettings'))}">${icon('gear')}<span>${escapeHtml(t('start.settings'))}</span></button>
          <button class="start-btn" data-start="arrange" title="${escapeHtml(t('start.arrangeTip'))}">${icon('launcher')}<span>${escapeHtml(t('start.arrange'))}</span></button>
        </div>
        <div class="start-board">${cards.join('')}</div>
        <footer class="start-foot">
          ${icon('info')}<span class="grow">MyPhotoCut v${escapeHtml(version)}</span>
          <span class="muted">© SHKWON(knix008@naver.com)</span>
        </footer>
      </div>
    </div>`;
}
