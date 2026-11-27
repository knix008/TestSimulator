// Start page: a moving background behind movable, resizable cards (ui/startboard.js): what to do,
// recent projects, new analysis systems by physics, the example projects, the background.
import appIcon from '../../assets/icon-256.png';
import { escapeHtml } from './dom.js';
import { animationIcon, icon } from '../icons.js';
import { t, getLanguage } from '../i18n.js';
import { SAMPLE_GROUPS, SAMPLES } from '../sim/samples.js';
import { GROUPS, SYSTEMS, SYSTEM_IDS } from '../sim/catalog.js';
import { ANIMATION_KINDS } from './background.js';
import { baseName } from '../domain/paths.js';
import { ANIMATION_INTERVALS } from '../domain/settings.js';

const GRIP = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="19.5" cy="19.5" r="2.3"/><circle cx="12.5" cy="19.5" r="2.3"/><circle cx="5.5" cy="19.5" r="2.3"/><circle cx="19.5" cy="12.5" r="2.3"/><circle cx="12.5" cy="12.5" r="2.3"/><circle cx="19.5" cy="5.5" r="2.3"/></svg>';
const e = escapeHtml;

export const intervalLabel = (seconds) => (!seconds ? t('start.never') : seconds < 60 ? t('start.everySeconds', { n: seconds }) : t('start.everyMinutes', { n: seconds / 60 }));

function card(id, glyph, title, body, { extra = '' } = {}) {
  const handle = `<button type="button" class="card-handle" data-card-handle="${id}" title="${e(t('start.moveCard'))}" aria-label="${e(t('start.moveCard'))}">${icon('moveHandle')}</button>`;
  return `<section class="start-card start-card-${id} ${id}" data-card="${id}" aria-label="${e(title)}">
    <h2>${handle}${icon(glyph)}<span class="start-card-title">${e(title)}</span><span class="grow"></span>${extra}</h2>
    <div class="card-body">${body}</div>
    <span class="card-resize" data-card-resize="${id}" title="${e(t('start.resizeCard'))}">${GRIP}</span>
  </section>`;
}

const tile = (start, glyph, label, tip, { value = '', cls = 'start-tile' } = {}) => `<button type="button" class="${cls}" data-start="${start}" ${value ? `data-value="${e(value)}"` : ''} title="${e(tip)}">${icon(glyph)}<b>${e(label)}</b><small>${e(tip)}</small></button>`;

function actionsBody(app) {
  const last = app?.state?.recent?.[0]?.path ?? null;
  const open = Boolean(app?.state?.project);
  const items = [
    ['new', 'fileNew', t('action.new'), t('start.tipNew')],
    ['open', 'folderOpen', t('action.open'), t('start.tipOpen')],
    ['import', 'stlFile', t('cmd.importStl'), t('start.tipImport')],
    open ? ['back', 'geometry', t('start.back'), app.state.project.name] : ['continue', 'recent', t('start.continue'), last ? baseName(last) : t('start.continueNone'), { value: last ?? '' }],
    ['guide', 'userGuide', t('action.userGuide'), t('tip.userGuide')],
    ['settings', 'gear', t('action.settings'), t('start.tipSettings')],
    ['about', 'info', t('action.about'), t('start.tipAbout')],
    ['exit', 'exit', t('action.exit'), t('start.tipExit')],
  ];
  return `<div class="start-actions">${items.map(([s, g, l, tip, o]) => tile(s, g, l, tip, o)).join('')}</div>`;
}

function recentBody(app, settings) {
  const recent = app.state.recent.slice(0, settings.startRecentCount ?? 8);
  const html = recent.length ? recent.map((item) => `<div class="start-row" title="${e(item.path)}">
      <button class="start-link" data-start="open-recent" data-value="${e(item.path)}">${icon('project')}<span class="name">${e(baseName(item.path))}</span><span class="path">${e(item.web ? t('recent.webFile') : item.path)}</span></button>
      <button class="icon-button" data-start="remove-recent" data-value="${e(item.path)}" title="${e(t('recent.remove'))}">${icon('close')}</button></div>`).join('') : `<div class="start-empty">${icon('info')}<span>${e(t('recent.empty'))}</span></div>`;
  return `<h3 class="start-sub">${icon('recent')}<span>${e(t('start.recent'))}</span><span class="grow"></span>${recent.length ? `<button class="small-button danger" data-start="clear-recent">${icon('clearHistory')}<span>${e(t('recent.clear'))}</span></button>` : ''}</h3><div class="start-list">${html}</div>`;
}

function systemsBody() {
  return `<div class="sample-groups">${GROUPS.map((g) => `<section class="sample-group"><h3>${icon(g.icon)}<span>${e(t(`group.${g.id}`))}</span></h3>
    <div class="template-grid">${SYSTEM_IDS.filter((id) => SYSTEMS[id].group === g.id).map((id) => tile('new-system', SYSTEMS[id].icon, t(`sys.${id}`), t(`sysDesc.${id}`), { value: id, cls: 'start-tile template-tile' })).join('')}</div></section>`).join('')}</div>`;
}

function samplesBody(L) {
  return `<div class="sample-groups">${SAMPLE_GROUPS.map((g) => {
    const items = SAMPLES.filter((s) => s.group === g.id);
    return `<section class="sample-group"><h3>${icon(g.icon)}<span>${e(g[L])}</span><span class="sample-count">${items.length}</span></h3>
      <div class="sample-tiles">${items.map((s) => `<button type="button" class="start-tile sample-tile" data-start="sample" data-value="${e(s.id)}" title="${e(`${s[L][0]} — ${s[L][1]}`)}">${icon(s.icon)}<b>${e(s[L][0])}</b><small>${e(s[L][1])}</small></button>`).join('')}</div></section>`;
  }).join('')}</div>`;
}

function backgroundBody(settings) {
  return `<div class="anim-chips bg-grid">${ANIMATION_KINDS.map((k) => `<button class="anim-chip bg-tile ${settings.animation === k && settings.backgroundKind === 'animated' ? 'active on' : ''}" data-start="animation" data-value="${k}" title="${e(t(`animation.${k}`))}">${icon(animationIcon(k))}<span>${e(t(`animation.${k}`))}</span></button>`).join('')}</div>
    <div class="start-controls"><button class="start-btn" data-start="shuffle">${icon('dice')}<span>${e(t('action.shuffleBackground'))}</span></button>
    <span class="muted">${e(t('start.bgInterval'))}: ${e(intervalLabel(settings.animationInterval))}</span></div>`;
}

export function startPageHtml(app) {
  const L = getLanguage() === 'en' ? 'en' : 'ko';
  const settings = app.settings();
  const version = app.version();
  void ANIMATION_INTERVALS;
  const cards = [
    card('actions', 'launcher', t('start.actions'), actionsBody(app)),
    settings.startShowRecent === false ? '' : card('recent', 'recent', t('start.recentCard'), recentBody(app, settings)),
    card('templates', 'simSystems', t('start.newSystem'), systemsBody(), { extra: `<span class="start-card-note">${SYSTEM_IDS.length}</span>` }),
    settings.startShowSamples === false ? '' : card('samples', 'samples', t('start.samples'), samplesBody(L), { extra: `<span class="start-card-note">${SAMPLES.length}</span>` }),
    settings.startShowBackground === false ? '' : card('background', 'sparkles', t('start.background'), backgroundBody(settings)),
  ];
  return `<canvas class="start-bg" aria-hidden="true"></canvas>
    <div class="start-scroll"><div class="start-inner" style="--start-card-alpha:${settings.startCardOpacity}%">
      <div class="start-tools">
        <label class="start-btn start-startup check-row"><input type="checkbox" data-start-toggle ${settings.showStartPage ? 'checked' : ''} /><span>${e(t('settings.showStartPage'))}</span></label>
        <button class="start-btn" data-start="start-settings">${icon('gear')}<span>${e(t('start.settings'))}</span></button>
        <button class="start-btn" data-start="arrange">${icon('launcher')}<span>${e(t('start.arrange'))}</span></button>
      </div>
      <div class="start-banner">${icon('bulb')}<span>${e(t('start.banner'))}</span><button class="small-button" data-start="sample" data-value="cantilever">${icon('play')}<span>${e(t('start.bannerGo'))}</span></button></div>
      <section class="start-hero start-info"><img src="${appIcon}" alt="" class="start-icon" />
        <div class="start-hero-text"><h1><span>My3DMaker</span> <small>v${e(version)}</small></h1><p>${e(t('start.tagline'))}</p></div>
        <div class="start-hero-actions"><button class="button big doc-button" data-start="guide">${icon('userGuide')}<span>${e(t('action.userGuide'))}</span></button><button class="button big doc-button" data-start="tutorial">${icon('tutorialDoc')}<span>${e(t('start.tutorialDocShort'))}</span></button><button class="button primary big" data-start="new">${icon('fileNew')}<span>${e(t('action.new'))}</span></button></div>
      </section>
      <div class="start-board">${cards.join('')}</div>
      <footer class="start-foot">${icon('info')}<span class="grow">My3DMaker v${e(version)}</span><span class="muted">© SHKWON(knix008@naver.com)</span></footer>
    </div></div>`;
}
