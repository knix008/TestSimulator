// Start page: shown when no chart is open and from the Home button. A moving background of charts behind a
// board of translucent cards that can be moved and resized (ui/startboard.js places them): a new chart of any
// type, recent files and folders, what to do (launcher tiles), the sample charts, and how it looks (theme,
// moving background). The program card on top is fixed.
import { CHART_GROUPS, CHART_TYPES } from '../domain/chart/types.js';
import appIcon from '../../assets/icon-256.png';
import { escapeHtml } from './dom.js';
import { animationIcon, hasIcon, icon } from '../icons.js';
import { t, getLanguage } from '../i18n.js';
import { ANIMATION_INTERVALS } from '../domain/settings.js';
import { ANIMATION_KINDS } from './background.js';
import { switchFlag } from '../flags.js';
import { stepperHtml } from '../stepper.js';

const GRIP = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="20" cy="20" r="2"/><circle cx="14" cy="20" r="2"/><circle cx="20" cy="14" r="2"/><circle cx="8" cy="20" r="2"/><circle cx="14" cy="14" r="2"/><circle cx="20" cy="8" r="2"/></svg>';
const baseName = (path) => String(path ?? '').split(/[\\/]/).pop() ?? '';

/** "Every 30 s" / "Every 2 min" / "Off" for the automatic background change. */
export const intervalLabel = (seconds) => (!seconds ? t('start.never') : seconds < 60 ? t('start.everySeconds', { n: seconds }) : t('start.everyMinutes', { n: seconds / 60 }));

/** A sample's picture: the icon of its chart type. */
export const sampleIcon = (sample) => (hasIcon(sample.icon) ? sample.icon : 'chartColumn');

/** One card: its handle and title (none on a bare card), its body and its resize corner. */
function card(id, glyph, title, body, { extra = '', bare = false, classes = '' } = {}) {
  const handle = `<button type="button" class="card-handle" data-card-handle="${id}" title="${escapeHtml(t('start.moveCard'))}" aria-label="${escapeHtml(t('start.moveCard'))}">${icon('moveHandle')}</button>`;
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
    ['new-blank', 'newChart', t('action.newChart'), t('start.tipNew')],
    ['import', 'importData', t('action.importData'), t('start.tipImport')],
    ['paste', 'pasteData', t('action.pasteData'), t('start.tipPaste')],
    ['tutorial', 'tutorial', t('start.tutorialStart'), t('start.tipTutorial')],
    ['theme-settings', 'palette', t('start.themeSettings'), t('start.tipTheme')],
    ['language', 'globe', L === 'ko' ? 'English' : '한국어', t('start.tipLanguage'), { flag: switchFlag(L) }],
    ['settings', 'gear', t('action.settings'), t('start.tipSettings')],
    ['start-settings', 'home', t('start.settings'), t('start.tipStartSettings')],
    ['about', 'info', t('action.about'), t('start.tipAbout')],
    ['exit', 'exit', t('action.exit'), t('start.tipExit')],
  ];
  return `<div class="start-actions">${items.map(([start, glyph, label, tip, options]) => tile(start, glyph, label, tip, options)).join('')}</div>`;
}

/** The new-chart card: one tile per chart type, by group (a click makes a chart of that type with starter data). */
function newChartBody(L) {
  return `<div class="nc-groups">${CHART_GROUPS.map((g) => `<div class="nc-group"><h3 class="start-sub">${icon(g.icon)}<span>${escapeHtml(g[L])}</span></h3><div class="nc-tiles">${CHART_TYPES.filter((c) => c.group === g.id).map((c) => `<button type="button" class="nc-tile" data-start="new-chart" data-value="${c.id}" title="${escapeHtml(`${c[L]} — ${c[`${L}Desc`]}`)}">${icon(c.icon)}<span>${escapeHtml(c[L])}</span></button>`).join('')}</div></div>`).join('')}</div>`;
}

function recentBody(app, settings) {
  const recent = app.state.recent.slice(0, settings.startRecentCount ?? 8);
  const dirs = app.state.recentDirs.slice(0, settings.startRecentCount ?? 8);
  const recentHtml = recent.length ? recent.map((item) => `<div class="start-row" title="${escapeHtml(item.path)}">
      <button class="start-link" data-start="open-recent" data-value="${escapeHtml(item.path)}">${icon(/.mychart$/i.test(item.path) ? 'fileChart' : /.xlsx?$/i.test(item.path) ? 'xlsxFile' : /.json$/i.test(item.path) ? 'jsonFile' : 'fileData')}<span class="name">${escapeHtml(baseName(item.path))}</span><span class="path">${escapeHtml(item.web ? t('recent.webFile') : item.path)}</span></button>
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

function samplesBody(samples, groups, L) {
  const known = new Set(groups.map((g) => g.id));
  const all = [...groups, ...(samples.some((x) => !known.has(x.group)) ? [{ id: 'other', ko: t('sampleGroup.other'), en: t('sampleGroup.other') }] : [])];
  // One grid of equal tiles, in group order; the group is named in each tile's tip. An "Open…" tile
  // makes the count 30, which 2, 3, 5 and 6 columns divide, so every row is full (styles.css picks the columns).
  const tiles = all.flatMap((group) => samples
    .filter((sample) => (group.id === 'other' ? !known.has(sample.group) : sample.group === group.id))
    .map((sample) => {
      const html = tile('sample', sampleIcon(sample), sample[L]?.[0] ?? sample.id, sample[L]?.[1] ?? '', { value: sample.id });
      return html.replace(/title="([^"]*)"/, (_, tip) => `data-sample-group="${group.id}" title="${escapeHtml(group[L] ?? group.en ?? group.id)} · ${tip}"`);
    }));
  const open = [tile('open', 'folderOpen', t('action.open'), t('start.tipOpen'))];
  return `<div class="sample-tiles-box"><div class="sample-tiles">${[...tiles, ...open].join('')}</div></div>`;
}

function backgroundBody(settings) {
  return `<div class="anim-chips bg-grid" role="radiogroup">${ANIMATION_KINDS.map((kind) => `<button class="anim-chip bg-tile ${settings.animation === kind && settings.backgroundKind === 'animated' ? 'active on' : ''}" data-start="animation" data-value="${kind}" role="radio" aria-checked="${settings.animation === kind}" title="${escapeHtml(t(`animation.${kind}`))}">${icon(animationIcon(kind))}<span>${escapeHtml(t(`animation.${kind}`))}</span></button>`).join('')}</div>
    <div class="start-controls">
      <button class="start-btn" data-start="shuffle" title="${escapeHtml(t('action.shuffleBackground'))}">${icon('dice')}<span>${escapeHtml(t('action.shuffleBackground'))}</span></button>
      <button class="start-btn" data-start="background-image" title="${escapeHtml(t('action.backgroundImage'))}">${icon('imageBg')}<span>${escapeHtml(t('action.backgroundImage'))}</span></button>
      <label class="start-speed" title="${escapeHtml(t('settings.animationSpeed'))}">${icon('speed')}<span>${escapeHtml(t('settings.animationSpeed'))}</span>${stepperHtml({ key: 'animationSpeed', value: settings.animationSpeed, min: 0, max: 300, step: 10, unit: '%', label: t('settings.animationSpeed'), decreaseTip: t('stepper.decrease', { label: t('settings.animationSpeed') }), increaseTip: t('stepper.increase', { label: t('settings.animationSpeed') }) })}</label>
      <label class="start-speed" title="${escapeHtml(t('start.cardOpacity'))}">${icon('opacity')}<span>${escapeHtml(t('start.cardOpacity'))}</span>${stepperHtml({ key: 'startCardOpacity', value: settings.startCardOpacity, min: 20, max: 100, step: 5, unit: '%', label: t('start.cardOpacity'), decreaseTip: t('stepper.decrease', { label: t('start.cardOpacity') }), increaseTip: t('stepper.increase', { label: t('start.cardOpacity') }) })}</label>
      <label class="start-check" title="${escapeHtml(t('tip.bgRandom'))}"><input type="checkbox" data-start-random ${settings.animationRandom ? 'checked' : ''} /><span>${escapeHtml(t('start.bgRandom'))}</span></label>
      <label class="start-interval" title="${escapeHtml(t('tip.bgInterval'))}">${icon('clock')}<span>${escapeHtml(t('start.bgInterval'))}</span><select data-icon="clock" data-start-interval aria-label="${escapeHtml(t('start.bgInterval'))}">${ANIMATION_INTERVALS.map((n) => `<option value="${n}" ${settings.animationInterval === n ? 'selected' : ''}>${escapeHtml(intervalLabel(n))}</option>`).join('')}</select></label>
    </div>`;
}

export function startPageHtml(app) {
  const L = getLanguage();
  const settings = app.settings();
  const version = app.version();
  const samples = app.samples();
  const hero = `
    <img src="${appIcon}" alt="" class="start-icon" />
    <div class="start-hero-text">
      <h1><span>MyChartMaster</span> <small>v${escapeHtml(version)}</small></h1>
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
  const newExtra = `<button class="start-btn small" data-start="new-blank" title="${escapeHtml(t('start.tipNew'))}">${icon('newChart')}<span>${escapeHtml(t('start.blank'))}</span></button><button class="start-btn small" data-start="import" title="${escapeHtml(t('start.tipImport'))}">${icon('importData')}<span>${escapeHtml(t('start.importShort'))}</span></button>`;
  const cards = [
    card('newchart', 'newChart', t('start.newChart'), newChartBody(L), { extra: newExtra }),
    settings.startShowRecent === false && settings.startShowFolders === false ? '' : card('recent', 'recent', t('start.recentCard'), recentBody(app, settings)),
    card('actions', 'launcher', t('start.actions'), actionsBody(L)),
    settings.startShowSamples === false ? '' : card('samples', 'samples', t('start.samples'), samplesBody(samples, app.sampleGroups(), L), { extra: `<span class="start-card-note">${samples.length}</span>` }),
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
        <section class="start-card start-card-hero hero start-hero bare fixed-hero" data-fixed-card="hero" aria-label="MyChartMaster"><div class="card-body">${hero}</div></section>
        <div class="start-board">${cards.join('')}</div>
        <footer class="start-foot">
          ${icon('info')}<span class="grow">MyChartMaster v${escapeHtml(version)}</span>
          <span class="muted">© SHKWON(knix008@naver.com)</span>
        </footer>
      </div>
    </div>`;
}
