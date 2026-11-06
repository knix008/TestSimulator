// Start page: shown when the app starts (if enabled) and from the Home button.
// New drawing from a template, open a file (also Visio), recent files and folders, sample
// drawings, the tutorial, and the moving background (pick an animation, shuffle,
// speed) — all over the animated background.
import appIcon from '../../assets/icon-256.png';
import { escapeHtml } from './dom.js';
import { backgroundIcon, icon } from '../icons.js';
import { t, getLanguage } from '../i18n.js';
import { TEMPLATES } from '../domain/templates.js';
import { ANIMATION_KINDS } from './background.js';
import { baseName } from '../domain/format.js';
import { ANIMATION_INTERVALS } from '../domain/settings.js';
import { SAMPLE_GROUPS, sampleInfo } from '../domain/sample-names.js';
import { stepperHtml } from '../stepper.js';

/** "Every 30 s" / "Every 2 min" / "Off" for the automatic background change. */
export const intervalLabel = (seconds) => (!seconds ? t('start.never') : seconds < 60 ? t('start.everySeconds', { n: seconds }) : t('start.everyMinutes', { n: seconds / 60 }));

/** One card: its ⠿ handle, heading (none for the bare hero), contents and triangle of dots. */
function card(id, cls, head, extra, body) {
  const moveTip = escapeHtml(t('start.moveCard'));
  const handle = `<button class="card-handle" type="button" title="${moveTip}" aria-label="${moveTip}">⠿</button>`;
  const heading = head ? `<h2 class="card-head">${handle}${head[0]}<span class="card-title">${escapeHtml(head[1])}</span><span class="grow"></span>${extra}</h2>` : `<span class="card-handle-float">${handle}</span>`;
  return `<section class="start-card ${cls}${head ? '' : ' bare'}" data-card="${id}">${heading}<div class="card-body">${body}</div><span class="card-grip" data-card-grip title="${escapeHtml(t('start.resizeCard'))}"></span></section>`;
}

/** The installed samples of this language, by group, under their names in this language. */
function samplesListHtml(paths, L) {
  const groups = new Map();
  for (const path of paths) {
    if (!path.includes(`.${L}.`)) continue;
    const name = baseName(path.replace(/^web-sample:/, ''));
    const stem = name.replace(/\.(ko|en)\.[^.]+$/, '');
    const info = sampleInfo(stem);
    const key = info?.group.id ?? 'other';
    if (!groups.has(key)) groups.set(key, { name: info?.group.name[L] ?? '', items: [] });
    const visio = /\.(vsdx|vstx)$/i.test(name) ? ' (Visio)' : '';
    groups.get(key).items.push({ path, label: info ? `${info.item.name[L]}${visio}` : name });
  }
  const order = [...SAMPLE_GROUPS.map((group) => group.id), 'other'];
  return order.filter((id) => groups.has(id)).map((id) => {
    const group = groups.get(id);
    return `${group.name ? `<div class="start-group">${escapeHtml(group.name)}</div>` : ''}${group.items.map((item) => `<button class="start-link compact" data-start="open-sample" data-value="${escapeHtml(item.path)}" title="${escapeHtml(item.path)}">${icon('samples')}<span class="name">${escapeHtml(item.label)}</span></button>`).join('')}`;
  }).join('');
}

export function startPageHtml(app) {
  const L = getLanguage();
  const settings = app.settings();
  const recent = app.state.recent.slice(0, settings.startRecentCount ?? 8);
  const dirs = app.state.recentDirs.slice(0, settings.startRecentCount ?? 8);
  const samples = app.state.samples ?? [];
  const version = app.version();
  const recentHtml = recent.length ? recent.map((item) => `<div class="start-row" title="${escapeHtml(item.path)}">
      <button class="start-link" data-start="open-recent" data-value="${escapeHtml(item.path)}">${icon('diagram')}<span class="name">${escapeHtml(baseName(item.path))}</span><span class="path">${escapeHtml(item.web ? t('recent.webFile') : item.path)}</span></button>
      <button class="icon-button" data-start="remove-recent" data-value="${escapeHtml(item.path)}" title="${escapeHtml(t('recent.remove'))}" aria-label="${escapeHtml(t('recent.remove'))}">${icon('close')}</button>
    </div>`).join('') : `<div class="start-empty">${icon('info')}<span>${escapeHtml(t('recent.empty'))}</span></div>`;
  const dirsHtml = dirs.length ? dirs.map((item) => `<div class="start-row" title="${escapeHtml(item.path)}">
      <button class="start-link" data-start="open-folder" data-value="${escapeHtml(item.path)}">${icon('folder')}<span class="name">${escapeHtml(baseName(item.path) || item.path)}</span><span class="path">${escapeHtml(item.path)}</span></button>
      <button class="icon-button" data-start="remove-folder" data-value="${escapeHtml(item.path)}" title="${escapeHtml(t('recent.removeFolder'))}" aria-label="${escapeHtml(t('recent.removeFolder'))}">${icon('close')}</button>
    </div>`).join('') : `<div class="start-empty">${icon('info')}<span>${escapeHtml(t('recent.noFolders'))}</span></div>`;
  const samplesHtml = samples.length ? samplesListHtml(samples, L) : `<button class="start-link compact" data-start="builtin-sample" data-value="" title="${escapeHtml(t('start.sampleBuiltin'))}">${icon('samples')}<span class="name">${escapeHtml(t('start.sampleBuiltin'))}</span></button>`;
  const sampleCount = samples.filter((path) => path.includes(`.${L}.`)).length;
  const help = [['tutorial-doc', 'tutorialDoc', t('action.tutorialDoc'), t('tip.tutorialDoc')], ['guide', 'userGuide', t('action.userGuide'), t('action.userGuide')], ['shortcuts', 'keyboard', t('action.shortcuts'), t('action.shortcuts')]];
  const stepRow = (key, glyph, label, value, max, step) => `<div class="start-step" title="${escapeHtml(label)}">${icon(glyph)}<span class="start-step-label">${escapeHtml(label)}</span><input type="range" min="0" max="${max}" step="${step}" value="${value}" data-start-slider="${key}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}" />${stepperHtml({ key, value, min: 0, max, step, unit: '%', label, decreaseTip: t('stepper.decrease', { label }), increaseTip: t('stepper.increase', { label }) })}</div>`;
  const cards = [
    card('hero', 'start-hero', null, '', `<div class="hero-body">
            <img src="${appIcon}" alt="" class="start-icon" />
            <div class="hero-text">
              <h1>MyDiagram <small>v${escapeHtml(version)}</small></h1>
              <p>${escapeHtml(t('start.tagline'))}</p>
            </div>
            <span class="grow"></span>
            <div class="hero-actions">
              <button class="button primary big" data-start="tutorial" title="${escapeHtml(t('start.tutorialStart'))}">${icon('tutorial')}<span>${escapeHtml(t('start.tutorialStart'))}</span></button>
              <button class="button big" data-start="tutorial-doc" title="${escapeHtml(t('tip.tutorialDoc'))}">${icon('tutorialDoc')}<span>${escapeHtml(t('start.viewTutorial'))}</span></button>
              <button class="button big" data-start="guide" title="${escapeHtml(t('start.viewGuide'))}">${icon('userGuide')}<span>${escapeHtml(t('start.viewGuide'))}</span></button>
              <button class="button big" data-start="auto-arrange" title="${escapeHtml(t('start.autoArrangeTip'))}">${icon('autoArrange')}<span>${escapeHtml(t('start.autoArrange'))}</span></button>
            </div>
          </div>`),
    card('templates', 'templates', [icon('fileNew'), t('start.new')], '', `<div class="template-grid">${TEMPLATES.map((tpl) => `<button class="template-tile" data-start="template" data-value="${tpl.id}" title="${escapeHtml(tpl.description[L])}">${icon(tpl.icon)}<b>${escapeHtml(tpl.name[L])}</b><small>${escapeHtml(tpl.description[L])}</small></button>`).join('')}</div>
            <div class="start-actions">
              <button class="button" data-start="open" title="${escapeHtml(t('action.open'))}">${icon('folderOpen')}<span>${escapeHtml(t('action.open'))}</span></button>
              <button class="button" data-start="import" title="${escapeHtml(t('action.importVisio'))}">${icon('vsdxFile')}<span>${escapeHtml(t('action.importVisio'))}</span></button>
            </div>`),
    settings.startShowRecent === false ? '' : card('recent', 'recent', [icon('recent'), t('start.recent')], recent.length ? `<button class="small-button danger" data-start="clear-recent" title="${escapeHtml(t('recent.clear'))}">${icon('clearHistory')}<span>${escapeHtml(t('recent.clear'))}</span></button>` : '', `<div class="start-list">${recentHtml}</div>`),
    settings.startShowFolders === false ? '' : card('folders', 'folders', [icon('recentFolder'), t('start.recentFolders')], dirs.length ? `<button class="small-button danger" data-start="clear-folders" title="${escapeHtml(t('recent.clearFolders'))}">${icon('trash')}<span>${escapeHtml(t('recent.clearFolders'))}</span></button>` : '', `<div class="start-list">${dirsHtml}</div>`),
    card('help', 'help', [icon('userGuide'), t('start.help')], '', `<div class="start-list">${help.map(([action, glyph, label, tip]) => `<button class="start-link compact" data-start="${action}" title="${escapeHtml(tip)}">${icon(glyph)}<span class="name">${escapeHtml(label)}</span></button>`).join('')}</div>`),
    settings.startShowSamples === false ? '' : card('samples', 'samples', [icon('samples'), t('start.samples')], sampleCount ? `<span class="start-count">${sampleCount}</span>` : '', `<div class="start-list samples">${samplesHtml}</div>`),
    settings.startShowBackground === false ? '' : card('background', 'background', [icon('sparkles'), t('start.background')], '', `<div class="anim-chips" role="radiogroup">${ANIMATION_KINDS.map((kind) => `<button class="anim-chip ${settings.animation === kind && settings.backgroundKind === 'animated' ? 'active' : ''}" data-start="animation" data-value="${kind}" role="radio" aria-checked="${settings.animation === kind}" title="${escapeHtml(t(`animation.${kind}`))}">${icon(backgroundIcon(kind))}<span>${escapeHtml(t(`animation.${kind}`))}</span></button>`).join('')}</div>
            <div class="start-actions">
              <button class="button" data-start="shuffle" title="${escapeHtml(t('action.shuffleBackground'))}">${icon('dice')}<span>${escapeHtml(t('action.shuffleBackground'))}</span></button>
              <button class="button" data-start="background-image" title="${escapeHtml(t('action.backgroundImage'))}">${icon('imageBg')}<span>${escapeHtml(t('action.backgroundImage'))}</span></button>
            </div>
            <div class="start-steps">${stepRow('animationSpeed', 'speed', t('settings.animationSpeed'), settings.animationSpeed, 300, 10)}${stepRow('startBgTransparency', 'opacity', t('settings.startBgTransparency'), settings.startBgTransparency ?? 0, 100, 5)}</div>
            <div class="start-auto">
              <label class="start-check" title="${escapeHtml(t('tip.bgRandom'))}"><input type="checkbox" data-start-random ${settings.animationRandom ? 'checked' : ''} /><span>${escapeHtml(t('start.bgRandom'))}</span></label>
              <label class="start-interval" title="${escapeHtml(t('tip.bgInterval'))}">${icon('clock')}<span>${escapeHtml(t('start.bgInterval'))}</span><select data-start-interval aria-label="${escapeHtml(t('start.bgInterval'))}">${ANIMATION_INTERVALS.map((n) => `<option value="${n}" ${settings.animationInterval === n ? 'selected' : ''}>${escapeHtml(intervalLabel(n))}</option>`).join('')}</select></label>
            </div>`),
  ];
  return `
    <canvas class="start-bg" aria-hidden="true"></canvas>
    <div class="start-image" aria-hidden="true"></div>
    <div class="start-scroll">
      <div class="start-inner">
        ${settings.tutorialDone || settings.startShowTutorialBanner === false ? '' : `<div class="start-banner">${icon('bulb')}<span>${escapeHtml(t('start.tutorialBanner'))}</span><button class="small-button" data-start="tutorial" title="${escapeHtml(t('start.tutorialStart'))}">${icon('play')}<span>${escapeHtml(t('start.tutorialGo'))}</span></button></div>`}
        <div class="start-board">${cards.join('')}</div>
        <footer class="start-foot">
          <label class="check-row" title="${escapeHtml(t('settings.showStartPage'))}"><input type="checkbox" data-start-toggle ${settings.showStartPage ? 'checked' : ''} /><span>${escapeHtml(t('settings.showStartPage'))}</span></label>
          <button class="small-button" data-start="arrange" title="${escapeHtml(t('start.arrangeTip'))}">${icon('arrangeCards')}<span>${escapeHtml(t('start.arrange'))}</span></button>
          <span class="grow"></span>
          <span class="muted">© SHKWON(knix008@naver.com)</span>
        </footer>
      </div>
    </div>`;
}
