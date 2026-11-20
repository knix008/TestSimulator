// Start page: shown when the app starts (if enabled) and from the Home button. A moving background from
// the world of broadcasting behind a board of translucent cards that can be moved and resized
// (ui/startboard.js places them) under the program's title: what to do (action tiles), the scene
// collections and recent files, the sample collections and the moving background.
import appIcon from '../../assets/icon-256.png';
import { escapeHtml } from './dom.js';
import { animationIcon, icon } from '../icons.js';
import { t } from '../i18n.js';
import { SAMPLE_COLLECTIONS, SAMPLE_ICONS } from '../bc/samples.js';
import { ANIMATION_KINDS } from './background.js';
import { ANIMATION_INTERVALS } from '../domain/settings.js';

const GRIP = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="20" cy="20" r="2"/><circle cx="14" cy="20" r="2"/><circle cx="20" cy="14" r="2"/><circle cx="8" cy="20" r="2"/><circle cx="14" cy="14" r="2"/><circle cx="20" cy="8" r="2"/></svg>';

/** "Every 30 s" / "Every 2 min" / "Off" for the automatic background change. */
export const intervalLabel = (seconds) => (!seconds ? t('start.never') : seconds < 60 ? t('start.everySeconds', { n: seconds }) : t('start.everyMinutes', { n: seconds / 60 }));

function card(id, glyph, title, body, { extra = '', bare = false, classes = '' } = {}) {
  const handle = `<button type="button" class="card-handle" data-card-handle="${id}" title="${escapeHtml(t('start.moveCard'))}" aria-label="${escapeHtml(t('start.moveCard'))}">${icon('moveHandle')}</button>`;
  return `<section class="start-card start-card-${id} ${id} ${classes} ${bare ? 'bare' : ''}" data-card="${id}" ${title ? `aria-label="${escapeHtml(title)}"` : ''}>
    ${bare ? `<span class="card-handle-float">${handle}</span>` : `<h2>${handle}${icon(glyph)}<span class="start-card-title">${escapeHtml(title)}</span><span class="grow"></span>${extra}</h2>`}
    <div class="card-body">${body}</div>
    <span class="card-resize" data-card-resize="${id}" title="${escapeHtml(t('start.resizeCard'))}">${GRIP}</span>
  </section>`;
}

const tile = (start, glyph, label, tip, { value = '', cls = 'start-tile', disabled = false, kind = '' } = {}) => `<button type="button" class="${cls}" data-start="${start}" ${value ? `data-value="${escapeHtml(value)}"` : ''} ${kind ? `data-kind="${kind}"` : ''} title="${escapeHtml(tip)}" ${disabled ? 'disabled' : ''}>${icon(glyph)}<b>${escapeHtml(label)}</b><small>${escapeHtml(tip)}</small></button>`;

function actionsBody(app) {
  const items = [
    ['new-collection', 'collectionNew', t('action.newCollection'), t('start.tipNewCollection')],
    ['import', 'importFile', t('action.importCollection'), t('start.tipImport')],
    ['continue', 'play', t('start.continue'), t('start.tipContinue', { name: app.studio.collections.current })],
    ['autoconfig', 'wizard', t('tool.autoconfig'), t('start.tipAutoconfig')],
    ['tutorial', 'tutorial', t('start.tutorialStart'), t('start.tipTutorial')],
    ['settings', 'gear', t('action.settings'), t('start.tipSettings')],
    ['start-settings', 'home', t('start.settings'), t('start.tipStartSettings')],
    ['about', 'info', t('action.about'), t('start.tipAbout')],
    ['exit', 'exit', t('action.exit'), t('start.tipExit')],
  ];
  return `<div class="start-actions">${items.map(([start, glyph, label, tip, options]) => tile(start, glyph, label, tip, options)).join('')}</div>`;
}

function recentBody(app, settings) {
  const count = settings.startRecentCount ?? 8;
  const cols = app.studio.collections.names.map((name) => `<div class="start-row ${name === app.studio.collections.current ? 'current' : ''}" title="${escapeHtml(name)}">
      <button class="start-link" data-start="open-collection" data-value="${escapeHtml(name)}">${icon('collection')}<span class="name">${escapeHtml(name)}</span><span class="path">${escapeHtml(name === app.studio.collections.current ? t('start.currentCollection') : t('start.storedCollection'))}</span></button></div>`).join('');
  const files = (app.state.recent ?? []).slice(0, count).map((item) => `<div class="start-row" title="${escapeHtml(item.path)}">
      <button class="start-link" data-start="open-recent" data-value="${escapeHtml(item.path)}">${icon('fileCollection')}<span class="name">${escapeHtml(item.title || item.path)}</span><span class="path">${escapeHtml(item.path)}</span></button>
      <button class="icon-button" data-start="remove-recent" data-value="${escapeHtml(item.path)}" title="${escapeHtml(t('recent.remove'))}" aria-label="${escapeHtml(t('recent.remove'))}">${icon('close')}</button></div>`).join('');
  return `<h3 class="start-sub">${icon('collection')}<span>${escapeHtml(t('start.collections'))}</span></h3><div class="start-list">${cols}</div>
    <h3 class="start-sub">${icon('recent')}<span>${escapeHtml(t('start.recent'))}</span><span class="grow"></span>${files ? `<button class="small-button danger" data-start="clear-recent" title="${escapeHtml(t('recent.clear'))}">${icon('clearHistory')}<span>${escapeHtml(t('recent.clear'))}</span></button>` : ''}</h3>
    <div class="start-list">${files || `<div class="start-empty">${icon('info')}<span>${escapeHtml(app.desktop ? t('recent.empty') : t('recent.emptyWeb'))}</span></div>`}</div>`;
}

function samplesBody() {
  return `<div class="sample-tiles start-samples">${SAMPLE_COLLECTIONS.map((id) => tile('sample', SAMPLE_ICONS[id], t(`sample.${id}`), t(`sample.${id}.desc`), { value: id })).join('')}</div>
    <p class="start-note muted">${icon('info')}<span>${escapeHtml(t('start.samplesNote'))}</span></p>`;
}

function backgroundBody(settings) {
  return `<div class="anim-chips bg-grid" role="radiogroup">${ANIMATION_KINDS.map((kind) => `<button class="anim-chip bg-tile ${settings.animation === kind && settings.backgroundKind === 'animated' ? 'active on' : ''}" data-start="animation" data-value="${kind}" role="radio" aria-checked="${settings.animation === kind}" title="${escapeHtml(t(`animation.${kind}`))}">${icon(animationIcon(kind))}<span>${escapeHtml(t(`animation.${kind}`))}</span></button>`).join('')}</div>
    <div class="start-controls">
      <button class="start-btn" data-start="shuffle" title="${escapeHtml(t('action.shuffleBackground'))}">${icon('dice')}<span>${escapeHtml(t('action.shuffleBackground'))}</span></button>
      <button class="start-btn" data-start="background-image" title="${escapeHtml(t('action.backgroundImage'))}">${icon('imageBg')}<span>${escapeHtml(t('action.backgroundImage'))}</span></button>
      <label class="start-speed" title="${escapeHtml(t('settings.animationSpeed'))}">${icon('speed')}<span>${escapeHtml(t('settings.animationSpeed'))}</span><button type="button" class="slider-step" data-slider-step="-1" title="${escapeHtml(t('stepper.decrease', { label: t('settings.animationSpeed') }))}" aria-label="${escapeHtml(t('stepper.decrease', { label: t('settings.animationSpeed') }))}">−</button><input type="range" min="0" max="300" step="10" value="${settings.animationSpeed}" data-start-speed /><button type="button" class="slider-step" data-slider-step="1" title="${escapeHtml(t('stepper.increase', { label: t('settings.animationSpeed') }))}" aria-label="${escapeHtml(t('stepper.increase', { label: t('settings.animationSpeed') }))}">+</button><output>${settings.animationSpeed}%</output></label>
      <label class="start-speed" title="${escapeHtml(t('start.cardOpacity'))}">${icon('opacity')}<span>${escapeHtml(t('start.cardOpacity'))}</span><button type="button" class="slider-step" data-slider-step="-1" title="${escapeHtml(t('stepper.decrease', { label: t('start.cardOpacity') }))}" aria-label="${escapeHtml(t('stepper.decrease', { label: t('start.cardOpacity') }))}">−</button><input type="range" min="20" max="100" step="5" value="${settings.startCardOpacity}" data-start-opacity /><button type="button" class="slider-step" data-slider-step="1" title="${escapeHtml(t('stepper.increase', { label: t('start.cardOpacity') }))}" aria-label="${escapeHtml(t('stepper.increase', { label: t('start.cardOpacity') }))}">+</button><output>${settings.startCardOpacity}%</output></label>
      <label class="start-check" title="${escapeHtml(t('tip.bgRandom'))}"><input type="checkbox" data-start-random ${settings.animationRandom ? 'checked' : ''} /><span>${escapeHtml(t('start.bgRandom'))}</span></label>
      <label class="start-interval" title="${escapeHtml(t('tip.bgInterval'))}">${icon('clock')}<span>${escapeHtml(t('start.bgInterval'))}</span><select data-icon="clock" data-start-interval aria-label="${escapeHtml(t('start.bgInterval'))}">${ANIMATION_INTERVALS.map((n) => `<option value="${n}" ${settings.animationInterval === n ? 'selected' : ''}>${escapeHtml(intervalLabel(n))}</option>`).join('')}</select></label>
    </div>`;
}

export function startPageHtml(app) {
  const settings = app.settings();
  const version = app.version();
  const hero = `
    <img src="${appIcon}" alt="" class="start-icon" />
    <div class="start-hero-text">
      <h1><span>MyBroadcasting</span> <small>v${escapeHtml(version)}</small></h1>
      <p>${escapeHtml(t('start.tagline'))}</p>
    </div>
    <div class="start-hero-actions">
      <div class="start-docs" role="group" aria-label="${escapeHtml(t('start.help'))}">
        <button class="button big doc-button" data-start="guide" title="${escapeHtml(t('tip.userGuide'))}">${icon('userGuide')}<span>${escapeHtml(t('action.userGuide'))}</span></button>
        <button class="button big doc-button" data-start="tutorial-doc" title="${escapeHtml(t('tip.tutorialDoc'))}">${icon('tutorialDoc')}<span>${escapeHtml(t('action.tutorialDoc'))}</span></button>
      </div>
      <button class="button big" data-start="help-menu" title="${escapeHtml(t('tip.startHelp'))}" aria-haspopup="true">${icon('question')}<span>${escapeHtml(t('menu.help'))}</span>${icon('chevronDown', 'icon tiny')}</button>
      <button class="button primary big" data-start="tutorial" title="${escapeHtml(t('start.tutorialStart'))}">${icon('tutorial')}<span>${escapeHtml(t('start.tutorialStart'))}</span></button>
    </div>`;
  const cards = [
    card('actions', 'launcher', t('start.actions'), actionsBody(app)),
    settings.startShowRecent === false ? '' : card('recent', 'collection', t('start.recentCard'), recentBody(app, settings)),
    settings.startShowSamples === false ? '' : card('samples', 'samples', t('start.samples'), samplesBody(), { extra: `<span class="start-card-note">${SAMPLE_COLLECTIONS.length}</span>` }),
    settings.startShowBackground === false ? '' : card('background', 'sparkles', t('start.background'), backgroundBody(settings), { extra: `<span class="start-card-note">${ANIMATION_KINDS.length}</span>` }),
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
        ${settings.tutorialDone || settings.startShowTutorialBanner === false ? '' : `<div class="start-banner">${icon('bulb')}<span>${escapeHtml(t('start.tutorialBanner'))}</span><button class="small-button" data-start="tutorial" title="${escapeHtml(t('start.tutorialStart'))}">${icon('play')}<span>${escapeHtml(t('start.tutorialGo'))}</span></button></div>`}
        <section class="start-hero start-hero-fixed" aria-label="MyBroadcasting">${hero}</section>
        <div class="start-board">${cards.join('')}</div>
        <footer class="start-foot">
          ${icon('info')}<span class="grow">MyBroadcasting v${escapeHtml(version)}</span>
          <span class="muted">© SHKWON(knix008@naver.com)</span>
        </footer>
      </div>
    </div>`;
}
