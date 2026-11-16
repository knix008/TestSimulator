// Start page: shown when the app starts (if enabled) and from the Home button. A moving background behind
// a board of translucent cards (ui/startboard.js places them; vertical by default — one card per row):
// the hero, what to do, recent agents, developer templates, office templates, models & keys, background.
import appIcon from '../../assets/icon-256.png';
import { escapeHtml } from './dom.js';
import { animationIcon, icon } from '../icons.js';
import { t, getLanguage } from '../i18n.js';
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

const tile = (start, glyph, label, tip, { value = '', cls = 'start-tile', disabled = false } = {}) => `<button type="button" class="${cls}" data-start="${start}" ${value ? `data-value="${escapeHtml(value)}"` : ''} title="${escapeHtml(tip)}" ${disabled ? 'disabled' : ''}>${icon(glyph)}<b>${escapeHtml(label)}</b><small>${escapeHtml(tip)}</small></button>`;

function actionsBody(app) {
  const ready = app.coreReady();
  const last = app.state.agents?.[0] ?? null;
  const items = [
    ['new-agent', 'fileNew', t('action.newAgent'), t('start.tipNew')],
    ['describe', 'wand', t('action.describe'), t('start.tipDescribe')],
    ['open', 'folderOpen', t('action.open'), t('start.tipOpen')],
    ['import', 'importFile', t('action.import'), t('start.tipImport')],
    ['continue', 'recent', t('start.continue'), last ? last.name : t('start.continueNone'), { value: last?.id ?? '' }],
    ['view-knowledge', 'book', t('view.knowledge'), t('start.tipKnowledge')],
    ['view-models', 'key', t('view.models'), t('start.tipModels')],
    ['view-runs', 'timeline', t('view.runs'), t('start.tipRuns')],
    ['settings', 'gear', t('action.settings'), t('start.tipSettings')],
    ['exit', 'exit', t('action.exit'), t('start.tipExit')],
  ];
  return `<div class="start-actions">${items.map(([start, glyph, label, tip, options]) => tile(start, glyph, label, tip, { ...options, disabled: !ready && !['settings', 'exit'].includes(start) })).join('')}</div>`;
}

const rowButton = (start, value, glyph, tip, danger = false) => `<button type="button" class="start-row-x ${danger ? 'danger' : ''}" data-start="${start}" data-value="${escapeHtml(value)}" title="${escapeHtml(tip)}" aria-label="${escapeHtml(tip)}">${icon(glyph)}</button>`;

/** The card title's "clear all" button (the card handle stays the only drag target). */
const clearButton = (start, label, tip, count) => `<button type="button" class="start-clear" data-start="${start}" title="${escapeHtml(tip)}" ${count ? '' : 'disabled'}>${icon('trash')}<span>${escapeHtml(label)}</span></button>`;

/** History: agents opened lately (newest first). Forgetting an entry leaves the agent itself alone. */
function historyBody(app, settings) {
  const byId = new Map((app.state.agents ?? []).map((a) => [a.id, a]));
  const list = (settings.recentOpened ?? []).map((id) => byId.get(id)).filter(Boolean).slice(0, settings.startRecentCount ?? 8);
  const rows = list.length ? list.map((a) => `<div class="start-row" data-history-row="${escapeHtml(a.id)}" title="${escapeHtml(a.description || a.name)}">
      <button class="start-link" data-start="open-agent" data-value="${escapeHtml(a.id)}">${icon('recent')}<span class="name">${escapeHtml(a.name)}</span><span class="path">${escapeHtml([t('start.nodes', { n: a.nodes }), new Date(a.updatedAt).toLocaleString()].join(' · '))}</span></button>
      ${rowButton('forget-recent', a.id, 'close', t('start.forgetRecent'))}
    </div>`).join('') : `<div class="start-empty">${icon('info')}<span>${escapeHtml(t('start.noHistory'))}</span></div>`;
  return `<div class="start-list">${rows}</div>`;
}

export const historyCount = (app, settings) => { const ids = new Set((app.state.agents ?? []).map((a) => a.id)); return (settings.recentOpened ?? []).filter((id) => ids.has(id)).length; };

function recentBody(app, settings) {
  const list = (app.state.agents ?? []).slice(0, settings.startRecentCount ?? 8);
  const rows = list.length ? list.map((a) => `<div class="start-row" data-agent-row="${escapeHtml(a.id)}" title="${escapeHtml(a.description || a.name)}">
      <button class="start-link" data-start="open-agent" data-value="${escapeHtml(a.id)}">${icon(a.deployed ? 'deploy' : 'robot')}<span class="name">${escapeHtml(a.name)}</span><span class="path">${escapeHtml([t('start.nodes', { n: a.nodes }), ...a.triggers.map((k) => t(`trigger.kind.${k}`)), a.deployed ? t('agent.deployed') : '', new Date(a.updatedAt).toLocaleString()].filter(Boolean).join(' · '))}</span></button>
      ${rowButton('delete-agent', a.id, 'trash', t('start.deleteAgent'), true)}
    </div>`).join('') : `<div class="start-empty">${icon('info')}<span>${escapeHtml(t('start.noAgents'))}</span></div>`;
  return `<div class="start-list">${rows}</div>`;
}

function templatesBody(app, group) {
  const L = getLanguage();
  const ready = app.coreReady();
  const list = (app.state.templates ?? []).filter((x) => x.group === group);
  return `<div class="template-grid">${list.map((x) => tile('template', x.icon, x.title[L] ?? x.title.en, x.desc[L] ?? x.desc.en, { value: x.id, cls: 'start-tile template-tile', disabled: !ready })).join('')}</div>`;
}

function modelsBody(app) {
  const core = app.state.core;
  const st = app.state.providerStatus ?? [];
  const def = app.state.coreSettings?.defaultModel ?? '';
  const status = core.status;
  return `<div class="db-card ${status}">
    <div class="db-status ${status}" role="status">${icon(status === 'ready' ? 'check' : status === 'connecting' ? 'hourglass' : 'error')}<b>${escapeHtml(status === 'ready' ? t('core.ready') : status === 'connecting' ? t('core.connecting') : t('core.unreachableShort'))}</b>${core.error && status !== 'ready' ? `<small title="${escapeHtml(core.error)}">${escapeHtml(core.error)}</small>` : ''}</div>
    <div class="provider-chips">${(app.providers ?? []).map((p) => { const s = st.find((x) => x.id === p.id); return `<span class="chip ${s?.ready ? 'on' : ''}" title="${escapeHtml(s?.ready ? t('models.ready') : t('models.noKey'))}">${icon(s?.ready ? 'check' : 'key')}<span>${escapeHtml(p.label)}</span></span>`; }).join('')}</div>
    <p class="muted small">${icon('star')} ${escapeHtml(t('models.defaultModel'))}: <code>${escapeHtml(def)}</code>${def.startsWith('mock:') ? ` — ${escapeHtml(t('start.mockHint'))}` : ''}</p>
    <div class="start-controls">
      ${status === 'ready' ? '' : `<button class="start-btn" data-start="retry-core">${icon('refresh')}<span>${escapeHtml(t('db.retry'))}</span></button>`}
      <button class="start-btn primary" data-start="view-models">${icon('key')}<span>${escapeHtml(t('start.setupModels'))}</span></button>
    </div>
  </div>`;
}

function backgroundBody(settings) {
  return `<div class="anim-chips bg-grid" role="radiogroup">${ANIMATION_KINDS.map((kind) => `<button class="anim-chip bg-tile ${settings.animation === kind && settings.backgroundKind === 'animated' ? 'active on' : ''}" data-start="animation" data-value="${kind}" role="radio" aria-checked="${settings.animation === kind}" title="${escapeHtml(t(`animation.${kind}`))}">${icon(animationIcon(kind))}<span>${escapeHtml(t(`animation.${kind}`))}</span></button>`).join('')}</div>
    <div class="start-controls">
      <button class="start-btn" data-start="shuffle" title="${escapeHtml(t('action.shuffleBackground'))}">${icon('dice')}<span>${escapeHtml(t('action.shuffleBackground'))}</span></button>
      <button class="start-btn" data-start="background-image" title="${escapeHtml(t('action.backgroundImage'))}">${icon('imageBg')}<span>${escapeHtml(t('action.backgroundImage'))}</span></button>
      <label class="start-speed" title="${escapeHtml(t('settings.animationSpeed'))}">${icon('speed')}<span>${escapeHtml(t('settings.animationSpeed'))}</span><button type="button" class="slider-step" data-slider-step="-1" aria-label="−">−</button><input type="range" min="0" max="300" step="10" value="${settings.animationSpeed}" data-start-speed /><button type="button" class="slider-step" data-slider-step="1" aria-label="+">+</button><output>${settings.animationSpeed}%</output></label>
      <label class="start-speed" title="${escapeHtml(t('start.cardOpacity'))}">${icon('opacity')}<span>${escapeHtml(t('start.cardOpacity'))}</span><button type="button" class="slider-step" data-slider-step="-1" aria-label="−">−</button><input type="range" min="20" max="100" step="5" value="${settings.startCardOpacity}" data-start-opacity /><button type="button" class="slider-step" data-slider-step="1" aria-label="+">+</button><output>${settings.startCardOpacity}%</output></label>
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
      <h1><span>MyAgents</span> <small>v${escapeHtml(version)}</small></h1>
      <p>${escapeHtml(t('start.tagline'))}</p>
    </div>
    <div class="start-hero-actions">
      <button class="button big doc-button" data-start="guide" title="${escapeHtml(t('tip.userGuide'))}">${icon('userGuide')}<span>${escapeHtml(t('action.userGuide'))}</span></button>
      <button class="button big" data-start="help-menu" aria-haspopup="true">${icon('question')}<span>${escapeHtml(t('menu.help'))}</span>${icon('chevronDown', 'icon tiny')}</button>
      <button class="button primary big" data-start="describe" title="${escapeHtml(t('start.tipDescribe'))}">${icon('wand')}<span>${escapeHtml(t('action.describe'))}</span></button>
    </div>`;
  const devCount = (app.state.templates ?? []).filter((x) => x.group === 'dev').length;
  const officeCount = (app.state.templates ?? []).filter((x) => x.group === 'office').length;
  const pipelineCount = (app.state.templates ?? []).filter((x) => x.group === 'pipeline').length;
  const cards = [
    card('actions', 'launcher', t('start.actions'), actionsBody(app)),
    settings.startShowHistory === false ? '' : card('history', 'clock', t('start.history'), historyBody(app, settings), { extra: `${clearButton('clear-history', t('start.clearAll'), t('start.clearHistoryTip'), historyCount(app, settings))}<span class="start-card-note">${historyCount(app, settings)}</span>` }),
    settings.startShowRecent === false ? '' : card('recent', 'robot', t('start.recentAgents'), recentBody(app, settings), { extra: `${clearButton('delete-all-agents', t('start.deleteAll'), t('start.deleteAllTip'), app.state.agents?.length ?? 0)}<span class="start-card-note">${app.state.agents?.length ?? 0}</span>` }),
    settings.startShowPipelines === false ? '' : card('pipelineTemplates', 'timeline', t('start.pipelineTemplates'), templatesBody(app, 'pipeline'), { extra: `<span class="start-card-note">${pipelineCount}</span>` }),
    settings.startShowDevTemplates === false ? '' : card('devTemplates', 'code', t('start.devTemplates'), templatesBody(app, 'dev'), { extra: `<span class="start-card-note">${devCount}</span>` }),
    settings.startShowOfficeTemplates === false ? '' : card('officeTemplates', 'notes', t('start.officeTemplates'), templatesBody(app, 'office'), { extra: `<span class="start-card-note">${officeCount}</span>` }),
    settings.startShowModels === false ? '' : card('models', 'key', t('view.models'), modelsBody(app)),
    settings.startShowBackground === false ? '' : card('background', 'sparkles', t('start.background'), backgroundBody(settings)),
  ];
  const coreBanner = core.status === 'error'
    ? `<div class="start-banner danger" role="alert">${icon('error')}<span><b>${escapeHtml(t('core.unreachableTitle'))}</b> ${escapeHtml(t('core.unreachableText'))}${core.error ? ` <small>(${escapeHtml(core.error)})</small>` : ''}</span><button class="small-button" data-start="retry-core">${icon('refresh')}<span>${escapeHtml(t('db.retry'))}</span></button></div>`
    : '';
  return `
    <canvas class="start-bg" aria-hidden="true"></canvas>
    <div class="start-scroll">
      <div class="start-inner" style="--start-card-alpha:${settings.startCardOpacity}%">
        <div class="start-tools">
          <label class="start-btn start-startup check-row" title="${escapeHtml(t('settings.showStartPage'))}"><input type="checkbox" data-start-toggle ${settings.showStartPage ? 'checked' : ''} /><span>${escapeHtml(t('settings.showStartPage'))}</span></label>
          <button class="start-btn" data-start="start-settings" title="${escapeHtml(t('start.tipStartSettings'))}">${icon('gear')}<span>${escapeHtml(t('start.settings'))}</span></button>
          <span class="seg-toggle" role="radiogroup" aria-label="${escapeHtml(t('start.arrange'))}">
            <button class="${settings.startArrange !== 'grid' ? 'active' : ''}" data-start="arrange" data-value="vertical" title="${escapeHtml(t('start.arrangeVerticalTip'))}">${icon('list')}<span>${escapeHtml(t('start.arrangeVertical'))}</span></button>
            <button class="${settings.startArrange === 'grid' ? 'active' : ''}" data-start="arrange" data-value="grid" title="${escapeHtml(t('start.arrangeGridTip'))}">${icon('launcher')}<span>${escapeHtml(t('start.arrangeGrid'))}</span></button>
          </span>
        </div>
        ${coreBanner}
        <section class="start-card start-hero bare start-hero-fixed" aria-label="MyAgents"><div class="card-body">${hero}</div></section>
        <div class="start-board">${cards.join('')}</div>
        <footer class="start-foot">${icon('info')}<span class="grow">MyAgents v${escapeHtml(version)}</span><span class="muted">© SHKWON(knix008@naver.com)</span></footer>
      </div>
    </div>`;
}
