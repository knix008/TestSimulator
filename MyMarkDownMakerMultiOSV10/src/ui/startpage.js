// Start page: shown when the app starts (if enabled) and from the Home button. A moving background from
// the world of documents behind a board of translucent cards that can be moved and resized
// (ui/startboard.js places them) under the program's title (fixed: it is not a card and cannot be moved or
// resized): what to do (action tiles), recent files and folders, the
// sample documents and the moving background. No side or bottom panels here: the cards use the window.
import appIcon from '../../assets/icon-256.png';
import { escapeHtml } from './dom.js';
import { animationIcon, icon } from '../icons.js';
import { t } from '../i18n.js';
import { SAMPLE_IDS, sampleGlyph } from '../domain/samples.js';
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
  const doc = app.state.doc;
  const last = app.state.recentDirs?.[0] ?? app.state.recent?.[0] ?? null;
  const continueTip = doc ? t('start.continueDoc') : last ? last.title || last.path : t('start.continueNone');
  const items = [
    ['add-folder', 'folderAdd', t('action.addFolder'), t('start.tipAddFolder')],
    ['add-files', 'filesAdd', t('action.addFiles'), t('start.tipAddFiles')],
    ['new-doc', 'docNew', t('action.newDoc'), t('start.tipNewDoc')],
    ['open-doc', 'openFile', t('action.openDoc'), t('start.tipOpenDoc')],
    ['continue', 'recent', t('start.continue'), continueTip, { value: doc ? '' : last?.path ?? '', kind: last?.kind ?? '' }],
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
  const entries = [...(app.state.recentDirs ?? []).map((x) => ({ ...x, kind: 'folder' })), ...(app.state.recent ?? []).map((x) => ({ ...x, kind: 'file' }))]
    .sort((a, b) => (b.at ?? 0) - (a.at ?? 0)).slice(0, count);
  const rows = entries.length ? entries.map((item) => `<div class="start-row" title="${escapeHtml(item.path)}">
      <button class="start-link" data-start="open-recent" data-kind="${item.kind}" data-value="${escapeHtml(item.path)}">${icon(item.kind === 'folder' ? 'folder' : 'markdownFile')}<span class="name">${escapeHtml(item.title || item.path)}</span><span class="path">${escapeHtml(item.path)}</span></button>
      <button class="icon-button" data-start="remove-recent" data-kind="${item.kind}" data-value="${escapeHtml(item.path)}" title="${escapeHtml(t('recent.remove'))}" aria-label="${escapeHtml(t('recent.remove'))}">${icon('close')}</button>
    </div>`).join('') : `<div class="start-empty">${icon('info')}<span>${escapeHtml(app.desktop ? t('recent.empty') : t('recent.emptyWeb'))}</span></div>`;
  return `<h3 class="start-sub">${icon('recent')}<span>${escapeHtml(t('start.recent'))}</span><span class="grow"></span>${entries.length ? `<button class="small-button danger" data-start="clear-recent" title="${escapeHtml(t('recent.clear'))}">${icon('clearHistory')}<span>${escapeHtml(t('recent.clear'))}</span></button>` : ''}</h3><div class="start-list">${rows}</div>`;
}

function samplesBody() {
  return `<div class="sample-tiles start-samples">${SAMPLE_IDS.map((id) => tile('sample', sampleGlyph(id), t(`sample.${id}`), t(`sample.${id}.desc`), { value: id })).join('')}</div>
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
      <h1><span>MyMarkDownMaker</span> <small>v${escapeHtml(version)}</small></h1>
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
    settings.startShowRecent === false ? '' : card('recent', 'recent', t('start.recentCard'), recentBody(app, settings)),
    settings.startShowSamples === false ? '' : card('samples', 'samples', t('start.samples'), samplesBody(), { extra: `<span class="start-card-note">${SAMPLE_IDS.length}</span>` }),
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
        <section class="start-hero start-hero-fixed" aria-label="MyMarkDownMaker">${hero}</section>
        <div class="start-board">${cards.join('')}</div>
        <footer class="start-foot">
          ${icon('info')}<span class="grow">MyMarkDownMaker v${escapeHtml(version)}</span>
          <span class="muted">© SHKWON(knix008@naver.com)</span>
        </footer>
      </div>
    </div>`;
}
