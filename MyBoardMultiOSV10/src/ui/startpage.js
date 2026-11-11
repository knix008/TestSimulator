// Start page: shown when the app starts (if enabled) and from the Home button. A moving background
// behind a board of translucent cards that can be moved and resized (ui/startboard.js places them):
// the hero, what to do (action tiles), recent boards and projects, templates, samples, the database
// and the moving background. No side or bottom panels here: the cards use the whole window.
import appIcon from '../../assets/icon-256.png';
import { escapeHtml } from './dom.js';
import { animationIcon, icon } from '../icons.js';
import { t, getLanguage } from '../i18n.js';
import { SAMPLES, TEMPLATES } from '../domain/starters.js';
import { ANIMATION_KINDS } from './background.js';
import { ANIMATION_INTERVALS } from '../domain/settings.js';
import { renderIconRef } from './iconref.js';

const GRIP = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="20" cy="20" r="2"/><circle cx="14" cy="20" r="2"/><circle cx="20" cy="14" r="2"/><circle cx="8" cy="20" r="2"/><circle cx="14" cy="14" r="2"/><circle cx="20" cy="8" r="2"/></svg>';

/** "Every 30 s" / "Every 2 min" / "Off" for the automatic background change. */
export const intervalLabel = (seconds) => (!seconds ? t('start.never') : seconds < 60 ? t('start.everySeconds', { n: seconds }) : t('start.everyMinutes', { n: seconds / 60 }));

/** One card: its handle and title (none on a bare card), its body and its resize corner. */
function card(id, glyph, title, body, { extra = '', bare = false, classes = '' } = {}) {
  const handle = `<button type="button" class="card-handle" data-card-handle="${id}" title="${escapeHtml(t('start.moveCard'))}" aria-label="${escapeHtml(t('start.moveCard'))}">${icon('moveHandle')}</button>`;
  return `<section class="start-card start-card-${id} ${id} ${classes} ${bare ? 'bare' : ''}" data-card="${id}" ${title ? `aria-label="${escapeHtml(title)}"` : ''}>
    ${bare ? `<span class="card-handle-float">${handle}</span>` : `<h2>${handle}${icon(glyph)}<span class="start-card-title">${escapeHtml(title)}</span><span class="grow"></span>${extra}</h2>`}
    <div class="card-body">${body}</div>
    <span class="card-resize" data-card-resize="${id}" title="${escapeHtml(t('start.resizeCard'))}">${GRIP}</span>
  </section>`;
}

const tile = (start, glyph, label, tip, { value = '', cls = 'start-tile', picture = '', disabled = false } = {}) => `<button type="button" class="${cls}" data-start="${start}" ${value ? `data-value="${escapeHtml(value)}"` : ''} title="${escapeHtml(tip)}" ${disabled ? 'disabled' : ''}>${picture || icon(glyph)}<b>${escapeHtml(label)}</b><small>${escapeHtml(tip)}</small></button>`;

function actionsBody(app) {
  const last = app.state.recent?.[0] ?? null;
  const items = [
    ['new-project', 'fileNew', t('action.newProject'), t('start.tipNewProject')],
    ['open', 'folderOpen', t('action.openBoard'), t('start.tipOpen')],
    ['database', 'database', t('action.connectDatabase'), t('start.tipDatabase')],
    ['import', 'importFile', t('action.import'), t('start.tipImport')],
    ['tutorial', 'tutorial', t('start.tutorialStart'), t('start.tipTutorial')],
    ['continue', 'recent', t('start.continue'), last ? last.title || last.path : t('start.continueNone'), { value: last?.path ?? '' }],
    ['settings', 'gear', t('action.settings'), t('start.tipSettings')],
    ['start-settings', 'home', t('start.settings'), t('start.tipStartSettings')],
    ['about', 'info', t('action.about'), t('start.tipAbout')],
    ['exit', 'exit', t('action.exit'), t('start.tipExit')],
  ];
  return `<div class="start-actions">${items.map(([start, glyph, label, tip, options]) => tile(start, glyph, label, tip, options)).join('')}</div>`;
}

function recentBody(app, settings) {
  const recent = app.state.recent.slice(0, settings.startRecentCount ?? 8);
  const rows = recent.length ? recent.map((item) => `<div class="start-row" title="${escapeHtml(item.title || item.path)}">
      <button class="start-link" data-start="open-recent" data-value="${escapeHtml(item.path)}">${item.icon ? renderIconRef(item.icon, { size: 18 }) : icon(item.kind === 'project' ? 'folder' : 'columns')}<span class="name">${escapeHtml(item.title || item.path)}</span><span class="path">${escapeHtml([item.kind === 'board' ? item.project : t('recent.project'), item.db].filter(Boolean).join(' · '))}</span></button>
      <button class="icon-button" data-start="remove-recent" data-value="${escapeHtml(item.path)}" title="${escapeHtml(t('recent.remove'))}" aria-label="${escapeHtml(t('recent.remove'))}">${icon('close')}</button>
    </div>`).join('') : `<div class="start-empty">${icon('info')}<span>${escapeHtml(t('recent.empty'))}</span></div>`;
  return `<h3 class="start-sub">${icon('recent')}<span>${escapeHtml(t('start.recent'))}</span><span class="grow"></span>${recent.length ? `<button class="small-button danger" data-start="clear-recent" title="${escapeHtml(t('recent.clear'))}">${icon('clearHistory')}<span>${escapeHtml(t('recent.clear'))}</span></button>` : ''}</h3><div class="start-list">${rows}</div>`;
}

function templatesBody(app) {
  const ready = app.coreReady();
  return `<div class="template-grid">${TEMPLATES.map(([id, glyph, ref]) => tile('template', glyph, t(`template.${id}`), t(`template.${id}.desc`), { value: id, cls: 'start-tile template-tile', picture: renderIconRef(ref, { size: 30 }), disabled: !ready })).join('')}</div>`;
}

function samplesBody(app) {
  const L = getLanguage() === 'en' ? 'en' : 'ko';
  const ready = app.coreReady();
  return `<div class="sample-tiles start-samples">${SAMPLES.map((s) => tile('sample', s.glyph, t(`sample.${s.id}`), t(`sample.${s.id}.desc`), { value: s.id, picture: renderIconRef(s.icon, { size: 30 }), disabled: !ready })).join('')}</div>
    <p class="start-note muted">${icon('info')}<span>${escapeHtml(t('start.samplesNote', { lang: L === 'en' ? 'English' : '한국어' }))}</span></p>`;
}

/** The database the core uses: type, name, status, and a button to change it. */
function databaseBody(app) {
  const core = app.state.core;
  const info = core.info;
  const db = info?.db ?? null;
  const status = core.status;
  const statusText = status === 'ready' ? t('db.statusConnected') : status === 'connecting' ? t('db.statusConnecting') : status === 'login' ? t('core.loginNeeded') : t('db.statusUnreachable');
  const statusGlyph = status === 'ready' ? 'check' : status === 'connecting' ? 'hourglass' : status === 'login' ? 'user' : 'error';
  const rows = [
    ['database', t('db.type'), db ? t(`db.kind.${db.type}`, null, db.type) : '—'],
    ['tag', t('db.name'), db?.label ?? '—'],
    ['server', t('db.mode'), info ? t(`db.mode.${info.mode}`, null, info.mode) : '—'],
    ['user', t('db.user'), info?.user ? (info.user.displayName ?? info.user.display_name ?? info.user.username) : '—'],
  ];
  return `<div class="db-card ${status}">
      <div class="db-status ${status}" role="status">${icon(statusGlyph)}<b>${escapeHtml(statusText)}</b>${core.error && status !== 'ready' ? `<small title="${escapeHtml(core.error)}">${escapeHtml(core.error)}</small>` : ''}</div>
      <dl class="db-rows">${rows.map(([glyph, label, value]) => `<dt>${icon(glyph)}<span>${escapeHtml(label)}</span></dt><dd title="${escapeHtml(value)}">${escapeHtml(value)}</dd>`).join('')}</dl>
      <div class="start-controls">
        ${status === 'ready' ? '' : status === 'login' ? `<button class="start-btn" data-start="retry-core" title="${escapeHtml(t('login.submit'))}">${icon('user')}<span>${escapeHtml(t('login.submit'))}</span></button>` : `<button class="start-btn" data-start="retry-core" title="${escapeHtml(t('db.retryTip'))}">${icon('refresh')}<span>${escapeHtml(t('db.retry'))}</span></button>`}
        <button class="start-btn primary" data-start="database" title="${escapeHtml(t('start.tipDatabase'))}" ${info?.mode === 'web' && info?.user?.role !== 'admin' ? 'disabled' : ''}>${icon('plug')}<span>${escapeHtml(t('db.change'))}</span></button>
      </div>
    </div>`;
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
  const core = app.state.core;
  const hero = `
    <img src="${appIcon}" alt="" class="start-icon" />
    <div class="start-hero-text">
      <h1><span>MyBoard</span> <small>v${escapeHtml(version)}</small></h1>
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
    card('hero', '', '', hero, { bare: true, classes: 'start-hero' }),
    card('actions', 'launcher', t('start.actions'), actionsBody(app)),
    settings.startShowDatabase === false ? '' : card('database', 'database', t('start.database'), databaseBody(app)),
    settings.startShowRecent === false ? '' : card('recent', 'recent', t('start.recentCard'), recentBody(app, settings)),
    settings.startShowTemplates === false ? '' : card('templates', 'fileNew', t('start.new'), templatesBody(app), { extra: `<span class="start-card-note">${TEMPLATES.length}</span>` }),
    settings.startShowSamples === false ? '' : card('samples', 'samples', t('start.samples'), samplesBody(app), { extra: `<span class="start-card-note">${SAMPLES.length}</span>` }),
    settings.startShowBackground === false ? '' : card('background', 'sparkles', t('start.background'), backgroundBody(settings)),
  ];
  const coreBanner = core.status === 'error'
    ? `<div class="start-banner danger" role="alert">${icon('error')}<span><b>${escapeHtml(t('core.unreachableTitle'))}</b> ${escapeHtml(t('core.unreachableText'))}${core.error ? ` <small>(${escapeHtml(core.error)})</small>` : ''}</span><button class="small-button" data-start="retry-core" title="${escapeHtml(t('db.retryTip'))}">${icon('refresh')}<span>${escapeHtml(t('db.retry'))}</span></button></div>`
    : '';
  return `
    <canvas class="start-bg" aria-hidden="true"></canvas>
    <div class="start-scroll">
      <div class="start-inner" style="--start-card-alpha:${settings.startCardOpacity}%">
        <div class="start-tools">
          <label class="start-btn start-startup check-row" title="${escapeHtml(t('settings.showStartPage'))}"><input type="checkbox" data-start-toggle ${settings.showStartPage ? 'checked' : ''} /><span>${escapeHtml(t('settings.showStartPage'))}</span></label>
          <button class="start-btn" data-start="start-settings" title="${escapeHtml(t('start.tipStartSettings'))}">${icon('gear')}<span>${escapeHtml(t('start.settings'))}</span></button>
          <button class="start-btn" data-start="arrange" title="${escapeHtml(t('start.arrangeTip'))}">${icon('launcher')}<span>${escapeHtml(t('start.arrange'))}</span></button>
        </div>
        ${coreBanner}
        ${settings.tutorialDone || settings.startShowTutorialBanner === false ? '' : `<div class="start-banner">${icon('bulb')}<span>${escapeHtml(t('start.tutorialBanner'))}</span><button class="small-button" data-start="tutorial" title="${escapeHtml(t('start.tutorialStart'))}">${icon('play')}<span>${escapeHtml(t('start.tutorialGo'))}</span></button></div>`}
        <div class="start-board">${cards.join('')}</div>
        <footer class="start-foot">
          ${icon('info')}<span class="grow">MyBoard v${escapeHtml(version)}</span>
          <span class="muted">© SHKWON(knix008@naver.com)</span>
        </footer>
      </div>
    </div>`;
}
