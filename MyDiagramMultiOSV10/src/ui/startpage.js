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
import { masterIcon } from '../render/svg.js';
import { panelDoc } from '../domain/designs.js';

/** "Every 30 s" / "Every 2 min" / "Off" for the automatic background change. */
export const intervalLabel = (seconds) => (!seconds ? t('start.never') : seconds < 60 ? t('start.everySeconds', { n: seconds }) : t('start.everyMinutes', { n: seconds / 60 }));

/** One card of the board: its ⠿ handle, heading, contents and triangle of dots. */
function card(id, cls, head, extra, body) {
  const moveTip = escapeHtml(t('start.moveCard'));
  const handle = `<button class="card-handle" type="button" title="${moveTip}" aria-label="${moveTip}">⠿</button>`;
  const heading = `<h2 class="card-head">${handle}${head[0]}<span class="card-title">${escapeHtml(head[1])}</span><span class="grow"></span>${extra}</h2>`;
  return `<section class="start-card ${cls}" data-card="${id}">${heading}<div class="card-body">${body}</div><span class="card-grip" data-card-grip title="${escapeHtml(t('start.resizeCard'))}"></span></section>`;
}

/** A tile: its icon, name and one line under it (as on the MyUMLMaker start page). */
/** An icon by name, or "m:<master>": that stencil shape's own picture (the sample tiles). */
const glyphHtml = (glyph) => {
  if (!glyph.startsWith('m:')) return icon(glyph);
  const root = globalThis.document?.documentElement;
  const css = root ? getComputedStyle(root) : null;
  const doc = panelDoc(null, root?.style.colorScheme === 'dark', { panel: css?.getPropertyValue('--surface').trim(), text: css?.getPropertyValue('--text').trim() });
  return `<span class="icon master-glyph">${masterIcon(glyph.slice(2), { size: 24, doc })}</span>`;
};
const tile = (start, glyph, label, sub, { value = '', tip = sub, cls = 'start-tile' } = {}) => `<button type="button" class="${cls}" data-start="${start}" ${value ? `data-value="${escapeHtml(value)}"` : ''} title="${escapeHtml(tip)}">${glyphHtml(glyph)}<b>${escapeHtml(label)}</b><small>${escapeHtml(sub)}</small></button>`;

/**
 * The samples the start page shows: this language's drawings, ten per group. The Visio copy of the
 * online shop stays in the samples folder (File › Open) but has no tile of its own.
 */
const onStartPage = (path, L) => path.includes(`.${L}.`) && !/\.(vsdx|vstx)$/i.test(path);

/** The installed samples of this language as tiles, by group, each with an icon of its own. */
function samplesListHtml(paths, L) {
  const groups = new Map();
  for (const path of paths) {
    if (!onStartPage(path, L)) continue;
    const name = baseName(path.replace(/^web-sample:/, ''));
    const stem = name.replace(/\.(ko|en)\.[^.]+$/, '');
    const info = sampleInfo(stem);
    const key = info?.group.id ?? 'other';
    if (!groups.has(key)) groups.set(key, { name: info?.group.name[L] ?? t('start.otherSamples'), icon: info?.group.icon ?? 'samples', items: [] });
    const visio = /\.(vsdx|vstx)$/i.test(name);
    groups.get(key).items.push({
      // Catalogue order (sample-names.js), a Visio copy right after its drawing.
      rank: info ? info.group.items.indexOf(info.item) * 2 + (visio ? 1 : 0) : 1e6,
      path, icon: visio ? 'vsdxFile' : info?.item.icon ?? 'diagram',
      label: info ? `${info.item.name[L]}${visio ? ' (Visio)' : ''}` : name,
      sub: visio ? t('start.sampleVisio') : info?.item.desc[L] ?? name,
    });
  }
  const order = [...SAMPLE_GROUPS.map((group) => group.id), 'other'];
  return `<div class="sample-groups">${order.filter((id) => groups.has(id)).map((id) => {
    const group = groups.get(id);
    group.items.sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label));
    return `<section class="sample-group" data-sample-group="${id}"><h3 class="start-group">${icon(group.icon)}<span>${escapeHtml(group.name)}</span><span class="sample-count">${group.items.length}</span></h3>
      <div class="sample-tiles">${group.items.map((item) => tile('open-sample', item.icon, item.label, item.sub, { value: item.path, tip: `${item.label} — ${item.sub}\n${item.path.replace(/^web-sample:/, '')}` })).join('')}</div></section>`;
  }).join('')}</div>`;
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
  const samplesHtml = samples.length ? samplesListHtml(samples, L) : `<div class="sample-tiles">${tile('builtin-sample', 'samples', t('start.sampleBuiltin'), t('start.sampleBuiltin'))}</div>`;
  const sampleCount = samples.filter((path) => onStartPage(path, L)).length;
  // The full name is the tooltip; the row shows a short one, so the whole row fits on one line.
  const stepRow = (key, glyph, label, short, value, max, step) => `<div class="start-step" title="${escapeHtml(label)}">${icon(glyph)}<span class="start-step-label">${escapeHtml(short)}</span><input type="range" min="0" max="${max}" step="${step}" value="${value}" data-start-slider="${key}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}" />${stepperHtml({ key, value, min: 0, max, step, unit: '%', label, decreaseTip: t('stepper.decrease', { label }), increaseTip: t('stepper.increase', { label }) })}</div>`;
  // The title and tagline: fixed above the board, neither moved nor resized.
  const hero = `<section class="start-hero"><div class="hero-body">
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
          </div></section>`;
  const cards = [
    // The cards in CARD_ORDER (ui/startboard.js): one below the other, the samples and then the moving background last.
    card('templates', 'templates', [icon('fileNew'), t('start.new')], `<span class="start-count">${TEMPLATES.length}</span>`, `<div class="template-grid">${TEMPLATES.map((tpl) => tile('template', tpl.icon, tpl.name[L], tpl.description[L], { value: tpl.id, cls: 'start-tile template-tile' })).join('')}${tile('open', 'folderOpen', t('action.open'), t('start.openDesc'), { cls: 'start-tile template-tile open-tile' })}</div>`),
    settings.startShowRecent === false ? '' : card('recent', 'recent', [icon('recent'), t('start.recent')], recent.length ? `<button class="small-button danger" data-start="clear-recent" title="${escapeHtml(t('recent.clear'))}">${icon('trash')}<span>${escapeHtml(t('recent.clear'))}</span></button>` : '', `<div class="start-list">${recentHtml}</div>`),
    settings.startShowFolders === false ? '' : card('folders', 'folders', [icon('recentFolder'), t('start.recentFolders')], dirs.length ? `<button class="small-button danger" data-start="clear-folders" title="${escapeHtml(t('recent.clearFolders'))}">${icon('trash')}<span>${escapeHtml(t('recent.clearFolders'))}</span></button>` : '', `<div class="start-list">${dirsHtml}</div>`),
    settings.startShowSamples === false ? '' : card('samples', 'samples', [icon('samples'), t('start.samples')], sampleCount ? `<span class="start-count">${sampleCount}</span>` : '', samplesHtml),
    settings.startShowBackground === false ? '' : card('background', 'background', [icon('sparkles'), t('start.background')], '', `<div class="anim-chips" role="radiogroup">${ANIMATION_KINDS.map((kind) => `<button class="anim-chip ${settings.animation === kind && settings.backgroundKind === 'animated' ? 'active' : ''}" data-start="animation" data-value="${kind}" role="radio" aria-checked="${settings.animation === kind}" title="${escapeHtml(t(`animation.${kind}`))}">${icon(backgroundIcon(kind))}<span>${escapeHtml(t(`animation.${kind}`))}</span></button>`).join('')}</div>
            <div class="start-controls">${stepRow('animationSpeed', 'speed', t('settings.animationSpeed'), t('start.speedShort'), settings.animationSpeed, 300, 10)}${stepRow('startBgTransparency', 'opacity', t('settings.startBgTransparency'), t('start.transparencyShort'), settings.startBgTransparency ?? 0, 100, 5)}
              <label class="start-check" title="${escapeHtml(t('tip.bgRandom'))}"><input type="checkbox" data-start-random ${settings.animationRandom ? 'checked' : ''} /><span>${escapeHtml(t('start.bgRandom'))}</span></label>
              <label class="start-interval" title="${escapeHtml(t('tip.bgInterval'))}">${icon('clock')}<span>${escapeHtml(t('start.bgInterval'))}</span><select data-start-interval aria-label="${escapeHtml(t('start.bgInterval'))}">${ANIMATION_INTERVALS.map((n) => `<option value="${n}" ${settings.animationInterval === n ? 'selected' : ''}>${escapeHtml(intervalLabel(n))}</option>`).join('')}</select></label>
              <span class="start-actions">
              <button class="button" data-start="shuffle" title="${escapeHtml(t('action.shuffleBackground'))}">${icon('dice')}<span>${escapeHtml(t('action.shuffleBackground'))}</span></button>
              <button class="button" data-start="background-image" title="${escapeHtml(t('action.backgroundImage'))}">${icon('imageBg')}<span>${escapeHtml(t('action.backgroundImage'))}</span></button>
              </span>
            </div>`),
  ];
  return `
    <canvas class="start-bg" aria-hidden="true"></canvas>
    <div class="start-image" aria-hidden="true"></div>
    <div class="start-scroll">
      <div class="start-inner">
        <div class="start-tools">
          <label class="start-btn check-row" title="${escapeHtml(t('settings.showStartPage'))}"><input type="checkbox" data-start-toggle ${settings.showStartPage ? 'checked' : ''} /><span>${escapeHtml(t('settings.showStartPage'))}</span></label>
          <button class="start-btn" data-start="arrange" title="${escapeHtml(t('start.arrangeTip'))}">${icon('arrangeCards')}<span>${escapeHtml(t('start.arrange'))}</span></button>
        </div>
        ${hero}
        ${settings.tutorialDone || settings.startShowTutorialBanner === false ? '' : `<div class="start-banner">${icon('bulb')}<span>${escapeHtml(t('start.tutorialBanner'))}</span><button class="small-button" data-start="tutorial" title="${escapeHtml(t('start.tutorialStart'))}">${icon('play')}<span>${escapeHtml(t('start.tutorialGo'))}</span></button></div>`}
        <div class="start-board">${cards.join('')}</div>
        <footer class="start-foot">
          ${icon('info')}<span class="grow">MyDiagram v${escapeHtml(version)}</span>
          <span class="muted">© SHKWON(knix008@naver.com)</span>
        </footer>
      </div>
    </div>`;
}
