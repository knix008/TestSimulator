// Start page: shown when the app starts (if enabled) and from the Home button. A moving
// background behind a board of translucent cards that can be moved and resized — the same
// board as MyUMLMaker: what to do (launcher tiles, recent files and folders), what to start
// from (templates, sample documents) and how it looks (theme, moving background).
// ui/startboard.js places the cards.
import appIcon from '../../assets/icon-256.png';
import { escapeHtml } from './dom.js';
import { animationIcon, icon } from '../icons.js';
import { t, getLanguage } from '../i18n.js';
import { TEMPLATES } from '../domain/templates.js';
import { SAMPLE_GROUPS, SAMPLES } from '../domain/samples.js';
import { ANIMATION_KINDS } from './background.js';
import { baseName, kindOf, KINDS } from '../domain/doctypes.js';
import { ANIMATION_INTERVALS } from '../domain/settings.js';
import { DARK_THEMES, LIGHT_THEMES } from '../themes.js';
import { switchFlag } from '../flags.js';

const GRIP = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="20" cy="20" r="2"/><circle cx="14" cy="20" r="2"/><circle cx="20" cy="14" r="2"/><circle cx="8" cy="20" r="2"/><circle cx="14" cy="14" r="2"/><circle cx="20" cy="8" r="2"/></svg>';

/** "Every 30 s" / "Every 2 min" / "Off" for the automatic background change. */
export const intervalLabel = (seconds) => (!seconds ? t('start.never') : seconds < 60 ? t('start.everySeconds', { n: seconds }) : t('start.everyMinutes', { n: seconds / 60 }));

/** One card: its handle and title (none on a bare card), its body and its resize corner. */
function card(id, glyph, title, body, { extra = '', bare = false, classes = '' } = {}) {
  const handle = `<button type="button" class="card-handle" data-card-handle="${id}" title="${escapeHtml(t('start.moveCard'))}" aria-label="${escapeHtml(t('start.moveCard'))}">${icon('menu')}</button>`;
  return `<section class="start-card start-card-${id} ${id} ${classes} ${bare ? 'bare' : ''}" data-card="${id}" ${title ? `aria-label="${escapeHtml(title)}"` : ''}>
    ${bare ? `<span class="card-handle-float">${handle}</span>` : `<h2>${handle}${icon(glyph)}<span class="start-card-title">${escapeHtml(title)}</span><span class="grow"></span>${extra}</h2>`}
    <div class="card-body">${body}</div>
    <span class="card-resize" data-card-resize="${id}" title="${escapeHtml(t('start.resizeCard'))}">${GRIP}</span>
  </section>`;
}

const tile = (start, glyph, label, tip, { value = '', flag = '', cls = 'start-tile' } = {}) => `<button type="button" class="${cls}" data-start="${start}" ${value ? `data-value="${escapeHtml(value)}"` : ''} title="${escapeHtml(tip)}">${flag ? `<span class="flag-slot">${flag}</span>` : icon(glyph)}<b>${escapeHtml(label)}</b><small>${escapeHtml(tip)}</small></button>`;

function actionsBody(L) {
  const items = [
    ['open', 'folderOpen', t('action.open'), t('start.tipOpen')],
    ['new-markdown', 'mdFile', t('action.newMarkdown'), t('start.tipNewMarkdown')],
    ['new-html', 'htmlFile', t('action.newHtml'), t('start.tipNewHtml')],
    ['new-text', 'txtFile', t('action.newText'), t('start.tipNewText')],
    ['paste-new', 'paste', t('action.pasteNew'), t('start.tipPasteNew')],
    ['open-folder-explorer', 'explorer', t('action.openFolder'), t('start.tipOpenFolder')],
    ['guide', 'userGuide', t('action.userGuide'), t('tip.userGuide')],
    ['theme-settings', 'palette', t('start.themeSettings'), t('start.tipTheme')],
    ['language', 'globe', L === 'ko' ? 'English' : '한국어', t('start.tipLanguage'), { flag: switchFlag(L) }],
    ['settings', 'gear', t('action.settings'), t('start.tipSettings')],
    ['start-settings', 'home', t('start.settings'), t('start.tipStartSettings')],
    ['about', 'info', t('action.about'), t('start.tipAbout')],
    ['exit', 'exit', t('action.exit'), t('start.tipExit')],
  ];
  return `<div class="start-actions">${items.map(([start, glyph, label, tip, options]) => tile(start, glyph, label, tip, options)).join('')}</div>`;
}

function recentBody(app, settings) {
  const recent = app.state.recent.slice(0, settings.startRecentCount);
  const dirs = app.state.recentDirs.slice(0, settings.startRecentCount);
  const recentHtml = recent.length ? recent.map((item) => `<div class="start-row" title="${escapeHtml(item.path)}">
      <button class="start-link" data-start="open-recent" data-value="${escapeHtml(item.path)}">${icon(KINDS[kindOf(item.path)].icon)}<span class="name">${escapeHtml(baseName(item.path))}</span><span class="path">${escapeHtml(item.web ? t('recent.webFile') : item.path)}</span></button>
      <button class="icon-button" data-start="remove-recent" data-value="${escapeHtml(item.path)}" title="${escapeHtml(t('recent.remove'))}" aria-label="${escapeHtml(t('recent.remove'))}">${icon('close')}</button>
    </div>`).join('') : `<div class="start-empty">${icon('info')}<span>${escapeHtml(t('recent.empty'))}</span></div>`;
  const dirsHtml = dirs.length ? dirs.map((item) => `<div class="start-row" title="${escapeHtml(item.path)}">
      <button class="start-link" data-start="open-folder" data-value="${escapeHtml(item.path)}" title="${escapeHtml(t('start.folderTip'))}">${icon('folder')}<span class="name">${escapeHtml(baseName(item.path) || item.path)}</span><span class="path">${escapeHtml(item.path)}</span></button>
      <button class="icon-button" data-start="remove-folder" data-value="${escapeHtml(item.path)}" title="${escapeHtml(t('recent.removeFolder'))}" aria-label="${escapeHtml(t('recent.removeFolder'))}">${icon('close')}</button>
    </div>`).join('') : `<div class="start-empty">${icon('info')}<span>${escapeHtml(t('recent.noFolders'))}</span></div>`;
  const files = `<h3 class="start-sub">${icon('recent')}<span>${escapeHtml(t('start.recent'))}</span><span class="grow"></span>${recent.length ? `<button class="small-button danger" data-start="clear-recent" title="${escapeHtml(t('recent.clear'))}">${icon('clearHistory')}<span>${escapeHtml(t('recent.clear'))}</span></button>` : ''}</h3><div class="start-list">${recentHtml}</div>`;
  const folders = app.desktop ? `<h3 class="start-sub">${icon('recentFolder')}<span>${escapeHtml(t('start.recentFolders'))}</span><span class="grow"></span>${dirs.length ? `<button class="small-button danger" data-start="clear-folders" title="${escapeHtml(t('recent.clearFolders'))}">${icon('trash')}<span>${escapeHtml(t('recent.clearFolders'))}</span></button>` : ''}</h3><div class="start-list">${dirsHtml}</div>` : '';
  return files + folders;
}

function samplesBody(L) {
  return `<div class="sample-groups">${SAMPLE_GROUPS.map((group) => {
    const items = SAMPLES.filter((sample) => sample.group === group.id);
    return `<section class="sample-group" data-sample-group="${group.id}">
      <h3>${icon(group.icon)}<span>${escapeHtml(group[L])}</span><span class="sample-count">${items.length}</span></h3>
      <div class="sample-tiles">${items.map((sample) => tile('sample', sample.icon, sample[L][0], sample[L][1], { value: sample.id })).join('')}</div>
    </section>`;
  }).join('')}</div>`;
}

function themeBody(settings, L) {
  const themeTile = (theme) => `<button type="button" role="radio" aria-checked="${settings.theme === theme.id}" class="bg-tile st-theme-tile ${settings.theme === theme.id ? 'on' : ''}" data-start="pick-theme" data-value="${theme.id}" title="${escapeHtml(theme.name[L])}">
    <span class="st-theme-chip" aria-hidden="true" style="background:${theme.swatch[0]};border-color:${theme.swatch[2]}"><i style="background:${theme.swatch[1]}"></i><i style="background:${theme.swatch[2]}"></i></span><span>${escapeHtml(theme.name[L])}</span></button>`;
  const group = (kind, glyph, label, themes) => `<section class="sample-group" data-theme-kind="${kind}"><h3>${icon(glyph)}<span>${escapeHtml(label)}</span><span class="sample-count">${themes.length}</span></h3><div class="bg-grid st-theme-tiles" role="radiogroup" aria-label="${escapeHtml(label)}">${themes.map(themeTile).join('')}</div></section>`;
  return `<div class="sample-groups">${group('dark', 'moon', t('start.themeDark'), DARK_THEMES)}${group('light', 'sun', t('start.themeLight'), LIGHT_THEMES)}</div>`;
}

function backgroundBody(settings) {
  return `<div class="anim-chips bg-grid" role="radiogroup">${ANIMATION_KINDS.map((kind) => `<button class="anim-chip bg-tile ${settings.animation === kind && settings.backgroundKind === 'animated' ? 'active on' : ''}" data-start="animation" data-value="${kind}" role="radio" aria-checked="${settings.animation === kind}" title="${escapeHtml(t(`animation.${kind}`))}">${icon(animationIcon(kind))}<span>${escapeHtml(t(`animation.${kind}`))}</span></button>`).join('')}</div>
    <div class="start-controls">
      <button class="start-btn" data-start="shuffle" title="${escapeHtml(t('action.shuffleBackground'))}">${icon('dice')}<span>${escapeHtml(t('action.shuffleBackground'))}</span></button>
      <button class="start-btn" data-start="still" title="${escapeHtml(t('start.stillTip'))}">${icon(settings.backgroundKind === 'animated' ? 'pause' : 'play')}<span>${escapeHtml(t(settings.backgroundKind === 'animated' ? 'start.still' : 'start.move'))}</span></button>
      <label class="start-speed" title="${escapeHtml(t('settings.animationSpeed'))}">${icon('speed')}<span>${escapeHtml(t('settings.animationSpeed'))}</span><input type="range" min="0" max="300" step="10" value="${settings.animationSpeed}" data-start-speed /><output>${settings.animationSpeed}%</output></label>
      <label class="start-speed" title="${escapeHtml(t('start.cardOpacity'))}">${icon('opacity')}<span>${escapeHtml(t('start.cardOpacity'))}</span><input type="range" min="20" max="100" step="5" value="${settings.startCardOpacity}" data-start-opacity /><output>${settings.startCardOpacity}%</output></label>
      <label class="start-check" title="${escapeHtml(t('start.bgRandomTip'))}"><input type="checkbox" data-start-random ${settings.animationRandom ? 'checked' : ''} /><span>${escapeHtml(t('start.bgRandom'))}</span></label>
      <label class="start-interval" title="${escapeHtml(t('start.bgIntervalTip'))}">${icon('clock')}<span>${escapeHtml(t('start.bgInterval'))}</span><select data-start-interval aria-label="${escapeHtml(t('start.bgInterval'))}">${ANIMATION_INTERVALS.map((n) => `<option value="${n}" ${settings.animationInterval === n ? 'selected' : ''}>${escapeHtml(intervalLabel(n))}</option>`).join('')}</select></label>
    </div>`;
}

export function startPageHtml(app) {
  const L = getLanguage();
  const settings = app.settings();
  const version = app.version();
  const hero = `
    <img src="${appIcon}" alt="" class="start-icon" />
    <div class="start-hero-text">
      <h1><span>MyTextMaster</span> <small>v${escapeHtml(version)}</small></h1>
      <p>${escapeHtml(t('start.tagline'))}</p>
    </div>
    <div class="start-hero-actions">
      <div class="start-docs" role="group" aria-label="${escapeHtml(t('menu.help'))}">
        <button class="button big doc-button" data-start="guide" title="${escapeHtml(t('tip.userGuide'))}">${icon('userGuide')}<span>${escapeHtml(t('action.userGuide'))}</span></button>
        <button class="button big doc-button" data-start="shortcuts" title="${escapeHtml(t('action.shortcuts'))}">${icon('keyboard')}<span>${escapeHtml(t('action.shortcuts'))}</span></button>
      </div>
      <button class="button big" data-start="help-menu" title="${escapeHtml(t('tip.startHelp'))}" aria-haspopup="true">${icon('question')}<span>${escapeHtml(t('menu.help'))}</span>${icon('chevronDown', 'icon tiny')}</button>
      <button class="button primary big" data-start="new-markdown" title="${escapeHtml(t('start.tipNewMarkdown'))}">${icon('fileNew')}<span>${escapeHtml(t('action.newMarkdown'))}</span></button>
    </div>`;
  const templates = `<div class="template-grid">${TEMPLATES.map((tpl) => tile('template', tpl.icon, tpl[L][0], tpl[L][1], { value: tpl.id, cls: 'start-tile template-tile' })).join('')}</div>`;
  const cards = [
    card('hero', '', '', hero, { bare: true, classes: 'start-hero' }),
    card('actions', 'launcher', t('start.actions'), actionsBody(L)),
    settings.startShowRecent === false ? '' : card('recent', 'recent', t('start.recentCard'), recentBody(app, settings)),
    card('templates', 'fileNew', t('start.new'), templates, { extra: `<span class="start-card-note">${TEMPLATES.length}</span>` }),
    settings.startShowSamples === false ? '' : card('samples', 'samples', t('start.samples'), samplesBody(L), { extra: `<span class="start-card-note">${SAMPLES.length}</span>` }),
    card('theme', 'palette', t('start.theme'), themeBody(settings, L), { extra: `<button class="start-btn small" data-start="theme-settings" title="${escapeHtml(t('start.tipTheme'))}">${icon('gear')}<span>${escapeHtml(t('start.themeSettings'))}</span></button>` }),
    settings.startShowBackground === false ? '' : card('background', 'sparkles', t('start.background'), backgroundBody(settings)),
  ];
  return `
    <canvas class="start-bg" aria-hidden="true"></canvas>
    <div class="start-scroll">
      <div class="start-inner" style="--start-card-alpha:${settings.startCardOpacity}%">
        <div class="start-tools">
          <label class="start-btn start-startup check-row" title="${escapeHtml(t('settings.showStartPage'))}"><input type="checkbox" data-start-toggle ${settings.showStartPage ? 'checked' : ''} /><span>${escapeHtml(t('settings.showStartPage'))}</span></label>
          <button class="start-btn" data-start="start-settings" title="${escapeHtml(t('start.tipStartSettings'))}">${icon('gear')}<span>${escapeHtml(t('start.settings'))}</span></button>
          <button class="start-btn" data-start="arrange" title="${escapeHtml(t('start.arrangeTip'))}">${icon('autoArrange')}<span>${escapeHtml(t('start.arrange'))}</span></button>
        </div>
        ${app.state.docs.length ? `<div class="start-banner">${icon('fileNew')}<span>${escapeHtml(t('start.openDocs', { n: app.state.docs.length }))}</span><button class="small-button" data-start="back" title="${escapeHtml(t('start.backTip'))}">${icon('edit')}<span>${escapeHtml(t('start.back'))}</span></button></div>` : ''}
        <div class="start-board">${cards.join('')}</div>
        <footer class="start-foot">
          ${icon('info')}<span class="grow">MyTextMaster v${escapeHtml(version)}</span>
          <span class="muted">© SHKWON(knix008@naver.com)</span>
        </footer>
      </div>
    </div>`;
}
