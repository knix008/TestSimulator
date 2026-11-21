// Start page: shown when the app starts (if enabled) and from the Home button. A moving background
// behind a board of translucent cards that can be moved and resized: what to do (launcher tiles,
// recent files and folders), what to start from (the AI song wizard, genre templates, the sample
// songs) and how it looks (the moving background). ui/startboard.js places the cards.
import appIcon from '../../assets/icon-256.png';
import { escapeHtml } from './dom.js';
import { animationIcon, icon } from '../icons.js';
import { t, getLanguage } from '../i18n.js';
import { TEMPLATES, SAMPLE_GROUPS, SAMPLES } from '../music/samples.js';
import { GENRES } from '../music/genres.js';
import { ANIMATION_KINDS } from './background.js';
import { baseName } from '../domain/paths.js';
import { ANIMATION_INTERVALS } from '../domain/settings.js';
import { providerFor } from '../music/ai.js';

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

const tile = (start, glyph, label, tip, { value = '', cls = 'start-tile' } = {}) => `<button type="button" class="${cls}" data-start="${start}" ${value ? `data-value="${escapeHtml(value)}"` : ''} title="${escapeHtml(tip)}">${icon(glyph)}<b>${escapeHtml(label)}</b><small>${escapeHtml(tip)}</small></button>`;

function actionsBody(app) {
  const last = app?.state?.recent?.[0]?.path ?? null;
  const items = [
    ['compose', 'aiWizard', t('start.compose'), t('start.tipCompose')],
    ['open', 'folderOpen', t('action.open'), t('start.tipOpen')],
    ['import', 'midiFile', t('action.importAny'), t('start.tipImport')],
    ['tutorial', 'tutorial', t('start.tutorialStart'), t('start.tipTutorial')],
    ['continue', 'recent', t('start.continue'), last ? baseName(last) : t('start.continueNone'), { value: last ?? '' }],
    ['settings', 'gear', t('action.settings'), t('start.tipSettings')],
    ['start-settings', 'home', t('start.settings'), t('start.tipStartSettings')],
    ['about', 'info', t('action.about'), t('start.tipAbout')],
    ['exit', 'exit', t('action.exit'), t('start.tipExit')],
  ];
  return `<div class="start-actions">${items.map(([start, glyph, label, tip, options]) => tile(start, glyph, label, tip, options)).join('')}</div>`;
}

function recentBody(app, settings) {
  const recent = app.state.recent.slice(0, settings.startRecentCount ?? 8);
  const dirs = app.state.recentDirs.slice(0, settings.startRecentCount ?? 8);
  const recentHtml = recent.length ? recent.map((item) => `<div class="start-row" title="${escapeHtml(item.path)}">
      <button class="start-link" data-start="open-recent" data-value="${escapeHtml(item.path)}">${icon('songFile')}<span class="name">${escapeHtml(baseName(item.path))}</span><span class="path">${escapeHtml(item.web ? t('recent.webFile') : item.path)}</span></button>
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
  return `<div class="sample-groups">${SAMPLE_GROUPS.map((group) => {
    const items = SAMPLES.filter((sample) => sample.group === group.id);
    return `<section class="sample-group" data-sample-group="${group.id}">
      <h3>${icon(group.icon)}<span>${escapeHtml(group[L])}</span><span class="sample-count">${items.length}</span></h3>
      <div class="sample-tiles">${items.map((sample) => tile('sample', GENRES.find((g) => g.id === sample.genre)?.icon ?? 'samples', sample[L][0], sample[L][1], { value: sample.id })).join('')}</div>
    </section>`;
  }).join('')}</div>`;
}

/** The AI wizard card: a genre to start from (the wizard opens with it) and which AI writes. */
function composeBody(app, L) {
  const provider = providerFor(app.settings());
  return `<div class="start-compose">
      <button type="button" class="start-compose-main" data-start="compose" title="${escapeHtml(t('start.tipCompose'))}">${icon('aiWizard')}<span><b>${escapeHtml(t('start.compose'))}</b><small>${escapeHtml(t('start.composeText'))}</small></span></button>
      <span class="start-provider ${provider}">${icon(provider === 'builtin' ? 'aiBuiltin' : provider === 'claude' ? 'aiClaude' : 'aiLocal')}<span>${escapeHtml(t('start.providerNow', { name: t(`ai.provider.${provider}`) }))}</span></span>
    </div>
    <div class="genre-tiles">${GENRES.map((g) => `<button type="button" class="genre-tile" data-start="genre" data-value="${g.id}" title="${escapeHtml(t('start.genreTip', { name: g[L] }))}">${icon(g.icon)}<span>${escapeHtml(g[L])}</span></button>`).join('')}</div>`;
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
      <h1><span>MyAudioMaker</span> <small>v${escapeHtml(version)}</small></h1>
      <p>${escapeHtml(t('start.tagline'))}</p>
    </div>
    <div class="start-hero-actions">
      <div class="start-docs" role="group" aria-label="${escapeHtml(t('start.help'))}">
        <button class="button big doc-button" data-start="guide" title="${escapeHtml(t('tip.userGuide'))}">${icon('userGuide')}<span>${escapeHtml(t('action.userGuide'))}</span></button>
        <button class="button big doc-button" data-start="tutorial-doc" title="${escapeHtml(t('tip.tutorialDoc'))}">${icon('tutorialDoc')}<span>${escapeHtml(t('action.tutorialDoc'))}</span></button>
        <button class="button big doc-button" data-start="tutorial-video" title="${escapeHtml(t('tip.tutorialVideo'))}">${icon('tutorialVideo')}<span>${escapeHtml(t('action.tutorialVideo'))}</span></button>
      </div>
      <button class="button big" data-start="help-menu" title="${escapeHtml(t('tip.startHelp'))}" aria-haspopup="true">${icon('question')}<span>${escapeHtml(t('menu.help'))}</span>${icon('chevronDown', 'icon tiny')}</button>
      <button class="button primary big" data-start="compose" title="${escapeHtml(t('start.tipCompose'))}">${icon('aiWizard')}<span>${escapeHtml(t('start.compose'))}</span></button>
    </div>`;
  const templates = `<div class="template-grid">${TEMPLATES.map(([id, glyph]) => tile('template', glyph, t(`template.${id}`), t(`template.${id}.desc`), { value: id, cls: 'start-tile template-tile' })).join('')}</div>`;
  const cards = [
    card('hero', '', '', hero, { bare: true, classes: 'start-hero' }),
    card('actions', 'launcher', t('start.actions'), actionsBody(app)),
    settings.startShowRecent === false && settings.startShowFolders === false ? '' : card('recent', 'recent', t('start.recentCard'), recentBody(app, settings)),
    card('compose', 'aiWizard', t('start.composeCard'), composeBody(app, L), { extra: `<span class="start-card-note">${GENRES.length}</span>` }),
    card('templates', 'fileNew', t('start.new'), templates, { extra: `<span class="start-card-note">${TEMPLATES.length}</span>` }),
    settings.startShowSamples === false ? '' : card('samples', 'samples', t('start.samples'), samplesBody(L), { extra: `<span class="start-card-note">${SAMPLES.length}</span>` }),
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
        ${settings.tutorialDone || settings.startShowTutorialBanner === false ? '' : `<div class="start-banner">${icon('bulb')}<span>${escapeHtml(t('start.tutorialBanner'))}</span><button class="small-button" data-start="tutorial" title="${escapeHtml(t('start.tutorialStart'))}">${icon('play')}<span>${escapeHtml(t('start.tutorialGo'))}</span></button></div>`}
        <div class="start-board">${cards.join('')}</div>
        <footer class="start-foot">
          ${icon('info')}<span class="grow">MyAudioMaker v${escapeHtml(version)}</span>
          <span class="muted">© SHKWON(knix008@naver.com)</span>
        </footer>
      </div>
    </div>`;
}
