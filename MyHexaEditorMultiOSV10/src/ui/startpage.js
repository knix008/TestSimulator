// Start page (MySketchBook's board): a moving background behind translucent cards that can be moved and
// resized (ui/startboard.js), under the program's title. Cards: what to do (open a file, a new file, a disk,
// process memory, compare, import, continue …), recent files, sample files, the tools and the background.
import appIcon from '../../assets/icon-256.png';
import { escapeHtml } from './dom.js';
import { animationIcon, icon } from '../icons.js';
import { t } from '../i18n.js';
import { SAMPLES } from '../domain/samples.js';
import { ANIMATION_KINDS } from './background.js';
import { ANIMATION_INTERVALS } from '../domain/settings.js';

const GRIP = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="20" cy="20" r="2"/><circle cx="14" cy="20" r="2"/><circle cx="20" cy="14" r="2"/><circle cx="8" cy="20" r="2"/><circle cx="14" cy="14" r="2"/><circle cx="20" cy="8" r="2"/></svg>';

export const intervalLabel = (seconds) => (!seconds ? t('start.never') : seconds < 60 ? t('start.everySeconds', { n: seconds }) : t('start.everyMinutes', { n: seconds / 60 }));

function card(id, glyph, title, body, { extra = '' } = {}) {
  const handle = `<button type="button" class="card-handle" data-card-handle="${id}" title="${escapeHtml(t('start.moveCard'))}" aria-label="${escapeHtml(t('start.moveCard'))}">${icon('moveHandle')}</button>`;
  return `<section class="start-card start-card-${id} ${id}" data-card="${id}" aria-label="${escapeHtml(title)}">
    <h2>${handle}${icon(glyph)}<span class="start-card-title">${escapeHtml(title)}</span><span class="grow"></span>${extra}</h2>
    <div class="card-body">${body}</div>
    <span class="card-resize" data-card-resize="${id}" title="${escapeHtml(t('start.resizeCard'))}">${GRIP}</span>
  </section>`;
}

const tile = (start, glyph, label, tip, { value = '', disabled = false } = {}) => `<button type="button" class="start-tile" data-start="${start}" ${value ? `data-value="${escapeHtml(value)}"` : ''} title="${escapeHtml(tip)}" ${disabled ? 'disabled' : ''}>${icon(glyph)}<b>${escapeHtml(label)}</b><small>${escapeHtml(tip)}</small></button>`;
const size = (n) => (n == null ? '' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1073741824).toFixed(2)} GB`);

function actionsBody(app) {
  const last = app.state.recent?.[0] ?? null;
  const open = app.docs?.length ?? 0;
  const items = [
    ['open', 'folderOpen', t('action.open'), t('start.tipOpen')],
    ['new', 'fileNew', t('action.newFile'), t('start.tipNew')],
    ['new-sized', 'fill', t('action.newSized'), t('start.tipNewSized')],
    ['continue', 'recent', t('start.continue'), open ? t('start.continueOpen', { n: open }) : last ? last.title || last.path : t('start.continueNone')],
    ...(app.desktop ? [['disk', 'disk', t('action.openDisk'), t('start.tipDisk')], ['process', 'memory', t('action.openProcess'), t('start.tipProcess')]] : []),
    ['compare', 'compare', t('tool.compare'), t('start.tipCompare')],
    ['import', 'importHex', t('action.import'), t('start.tipImport')],
    ['tutorial', 'tutorial', t('start.tutorialStart'), t('start.tipTutorial')],
    ['settings', 'gear', t('action.settings'), t('start.tipSettings')],
    ['about', 'info', t('action.about'), t('start.tipAbout')],
    ...(app.desktop ? [['exit', 'exit', t('action.exit'), t('start.tipExit')]] : []),
  ];
  return `<div class="start-actions">${items.map(([start, glyph, label, tip]) => tile(start, glyph, label, tip)).join('')}</div>`;
}

const RECENT_ICON = { disk: 'disk', process: 'memory', web: 'hexFile', file: 'hexFile', memory: 'hexFile' };
function recentBody(app, settings) {
  const entries = (app.state.recent ?? []).slice(0, settings.startRecentCount ?? 8);
  const rows = entries.length ? entries.map((item) => `<div class="start-row" title="${escapeHtml(item.path)}">
      <button class="start-link" data-start="open-recent" data-value="${escapeHtml(item.path)}">${icon(RECENT_ICON[item.kind] ?? 'hexFile')}<span class="name">${escapeHtml(item.title || item.path)}</span><span class="path">${escapeHtml(item.kind === 'file' ? `${item.path} · ${size(item.size)}` : `${t(`source.${item.kind}`)} · ${size(item.size)}`)}</span></button>
      <button class="icon-button" data-start="remove-recent" data-value="${escapeHtml(item.path)}" title="${escapeHtml(t('recent.remove'))}" aria-label="${escapeHtml(t('recent.remove'))}">${icon('close')}</button>
    </div>`).join('') : `<div class="start-empty">${icon('info')}<span>${escapeHtml(t('recent.empty'))}</span></div>`;
  return `<h3 class="start-sub">${icon('recent')}<span>${escapeHtml(t('start.recent'))}</span><span class="grow"></span>${entries.length ? `<button class="small-button danger" data-start="clear-recent" title="${escapeHtml(t('recent.clear'))}">${icon('clearHistory')}<span>${escapeHtml(t('recent.clear'))}</span></button>` : ''}</h3><div class="start-list">${rows}</div>`;
}

function samplesBody() {
  return `<div class="sample-tiles start-samples">${SAMPLES.map((s) => tile('sample', s.icon, t(`sample.${s.id}`), t(`sample.${s.id}.desc`), { value: s.id })).join('')}</div>
    <p class="start-note muted">${icon('info')}<span>${escapeHtml(t('start.samplesNote'))}</span></p>`;
}

const TOOL_TILES = [['strings', 'textStrings'], ['disasm', 'cpu'], ['calc', 'calculate'], ['carve', 'recover'], ['devices', 'drive'], ['compare', 'compare'], ['template', 'code'], ['processor', 'operation'], ['filesystem', 'disk'], ['yara', 'shieldCheck'], ['visualizer', 'image'], ['script', 'code'], ['patch', 'patch'], ['demangle', 'code'], ['filetools', 'fileTools']];
function toolsBody(app) {
  return `<div class="start-actions start-tools-grid">${TOOL_TILES.filter(([id]) => app.desktop || id !== 'devices').map(([id, glyph]) => tile('tool', glyph, t(`tool.${id}`), t(`start.tool.${id}`), { value: id })).join('')}</div>
    <p class="start-note muted">${icon('info')}<span>${escapeHtml(t('start.toolsNote'))}</span></p>`;
}

function backgroundBody(settings) {
  const slider = (attr, min, max, step, value, glyph, label, unit = '%') => `<label class="start-speed" title="${escapeHtml(label)}">${icon(glyph)}<span>${escapeHtml(label)}</span><button type="button" class="slider-step" data-slider-step="-1" aria-label="${escapeHtml(t('stepper.decrease', { label }))}">−</button><input type="range" min="${min}" max="${max}" step="${step}" value="${value}" ${attr} /><button type="button" class="slider-step" data-slider-step="1" aria-label="${escapeHtml(t('stepper.increase', { label }))}">+</button><output>${value}${unit}</output></label>`;
  return `<div class="anim-chips bg-grid" role="radiogroup">${ANIMATION_KINDS.map((kind) => `<button class="anim-chip bg-tile ${settings.animation === kind && settings.backgroundKind === 'animated' ? 'active on' : ''}" data-start="animation" data-value="${kind}" role="radio" aria-checked="${settings.animation === kind}" title="${escapeHtml(t(`animation.${kind}`))}">${icon(animationIcon(kind))}<span>${escapeHtml(t(`animation.${kind}`))}</span></button>`).join('')}</div>
    <div class="start-controls">
      <button class="start-btn" data-start="shuffle" title="${escapeHtml(t('action.shuffleBackground'))}">${icon('dice')}<span>${escapeHtml(t('action.shuffleBackground'))}</span></button>
      <button class="start-btn" data-start="background-image" title="${escapeHtml(t('action.backgroundImage'))}">${icon('imageBg')}<span>${escapeHtml(t('action.backgroundImage'))}</span></button>
      ${slider('data-start-speed', 0, 100, 1, settings.animationSpeed, 'speed', t('settings.animationSpeed'), '')}
      ${slider('data-start-opacity', 20, 100, 5, settings.startCardOpacity, 'opacity', t('start.cardOpacity'))}
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
      <h1><span>MyHexaMaster</span> <small>v${escapeHtml(version)}</small></h1>
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
    settings.startShowSamples === false ? '' : card('samples', 'samples', t('start.samples'), samplesBody(), { extra: `<span class="start-card-note">${SAMPLES.length}</span>` }),
    settings.startShowTools === false ? '' : card('tools', 'tools', t('start.toolsCard'), toolsBody(app), { extra: `<span class="start-card-note">${TOOL_TILES.length}</span>` }),
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
        <section class="start-hero start-hero-fixed" aria-label="MyHexaMaster">${hero}</section>
        <div class="start-board">${cards.join('')}</div>
        <footer class="start-foot">
          ${icon('info')}<span class="grow">MyHexaMaster v${escapeHtml(version)}</span>
          <span class="muted">© SHKWON(knix008@naver.com)</span>
        </footer>
      </div>
    </div>`;
}
