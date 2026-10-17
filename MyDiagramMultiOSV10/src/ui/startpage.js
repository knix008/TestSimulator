// Start page: shown when the app starts (if enabled) and from the Home button.
// New drawing from a template, open a file (also Visio), recent files and folders, sample
// drawings, the tutorial, and the moving background (pick an animation, shuffle,
// speed) — all over the animated background.
import appIcon from '../../assets/icon-256.png';
import { escapeHtml } from './dom.js';
import { icon } from '../icons.js';
import { t, getLanguage } from '../i18n.js';
import { TEMPLATES } from '../domain/templates.js';
import { ANIMATION_KINDS } from './background.js';
import { baseName } from '../domain/format.js';
import { ANIMATION_INTERVALS } from '../domain/settings.js';

/** "Every 30 s" / "Every 2 min" / "Off" for the automatic background change. */
export const intervalLabel = (seconds) => (!seconds ? t('start.never') : seconds < 60 ? t('start.everySeconds', { n: seconds }) : t('start.everyMinutes', { n: seconds / 60 }));

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
  const samplesHtml = (samples.length ? samples.map((path) => ({ id: path, name: baseName(path), path }))
    : [{ id: 'builtin', name: t('start.sampleBuiltin') }])
    .filter((item) => !item.path || item.path.includes(`.${L}.`))
    .map((item) => `<button class="start-link compact" data-start="${item.path ? 'open-sample' : 'builtin-sample'}" data-value="${escapeHtml(item.path ?? '')}" title="${escapeHtml(item.path ?? item.name)}">${icon('samples')}<span class="name">${escapeHtml(item.name)}</span></button>`).join('');
  const recentBlockHtml = `
            <h2>${icon('recent')}<span>${escapeHtml(t('start.recent'))}</span><span class="grow"></span>${recent.length ? `<button class="small-button danger" data-start="clear-recent" title="${escapeHtml(t('recent.clear'))}">${icon('clearHistory')}<span>${escapeHtml(t('recent.clear'))}</span></button>` : ''}</h2>
            <div class="start-list">${recentHtml}</div>
`;
  const foldersBlockHtml = `
            <h2>${icon('recentFolder')}<span>${escapeHtml(t('start.recentFolders'))}</span><span class="grow"></span>${dirs.length ? `<button class="small-button danger" data-start="clear-folders" title="${escapeHtml(t('recent.clearFolders'))}">${icon('trash')}<span>${escapeHtml(t('recent.clearFolders'))}</span></button>` : ''}</h2>
            <div class="start-list">${dirsHtml}</div>
`;
  const samplesBlockHtml = `
            <h2>${icon('samples')}<span>${escapeHtml(t('start.samples'))}</span></h2>
            <div class="start-list samples">${samplesHtml}</div>
`;
  const backgroundBlockHtml = `
            <h2>${icon('sparkles')}<span>${escapeHtml(t('start.background'))}</span></h2>
            <div class="anim-chips" role="radiogroup">${ANIMATION_KINDS.map((kind) => `<button class="anim-chip ${settings.animation === kind && settings.backgroundKind === 'animated' ? 'active' : ''}" data-start="animation" data-value="${kind}" role="radio" aria-checked="${settings.animation === kind}" title="${escapeHtml(t(`animation.${kind}`))}">${escapeHtml(t(`animation.${kind}`))}</button>`).join('')}</div>
            <div class="start-actions">
              <button class="button" data-start="shuffle" title="${escapeHtml(t('action.shuffleBackground'))}">${icon('dice')}<span>${escapeHtml(t('action.shuffleBackground'))}</span></button>
              <button class="button" data-start="background-image" title="${escapeHtml(t('action.backgroundImage'))}">${icon('imageBg')}<span>${escapeHtml(t('action.backgroundImage'))}</span></button>
            </div>
            <label class="start-speed" title="${escapeHtml(t('settings.animationSpeed'))}">${icon('speed')}<span>${escapeHtml(t('settings.animationSpeed'))}</span><input type="range" min="0" max="300" step="10" value="${settings.animationSpeed}" data-start-speed /><output>${settings.animationSpeed}%</output></label>
            <div class="start-auto">
              <label class="start-check" title="${escapeHtml(t('tip.bgRandom'))}"><input type="checkbox" data-start-random ${settings.animationRandom ? 'checked' : ''} /><span>${escapeHtml(t('start.bgRandom'))}</span></label>
              <label class="start-interval" title="${escapeHtml(t('tip.bgInterval'))}">${icon('clock')}<span>${escapeHtml(t('start.bgInterval'))}</span><select data-start-interval aria-label="${escapeHtml(t('start.bgInterval'))}">${ANIMATION_INTERVALS.map((n) => `<option value="${n}" ${settings.animationInterval === n ? 'selected' : ''}>${escapeHtml(intervalLabel(n))}</option>`).join('')}</select></label>
            </div>
`;
  const showSide = settings.startShowSamples !== false || settings.startShowBackground !== false;
  return `
    <canvas class="start-bg" aria-hidden="true"></canvas>
    <div class="start-scroll">
      <div class="start-inner">
        <header class="start-hero">
          <img src="${appIcon}" alt="" class="start-icon" />
          <div>
            <h1>MyDiagram <small>v${escapeHtml(version)}</small></h1>
            <p>${escapeHtml(t('start.tagline'))}</p>
          </div>
          <span class="grow"></span>
          <button class="button primary big" data-start="tutorial" title="${escapeHtml(t('start.tutorialStart'))}">${icon('tutorial')}<span>${escapeHtml(t('start.tutorialStart'))}</span></button>
        </header>
        ${settings.tutorialDone || settings.startShowTutorialBanner === false ? '' : `<div class="start-banner">${icon('bulb')}<span>${escapeHtml(t('start.tutorialBanner'))}</span><button class="small-button" data-start="tutorial" title="${escapeHtml(t('start.tutorialStart'))}">${icon('play')}<span>${escapeHtml(t('start.tutorialGo'))}</span></button></div>`}
        <div class="start-grid${showSide ? '' : ' no-side'}">
          <section class="start-card templates">
            <h2>${icon('fileNew')}<span>${escapeHtml(t('start.new'))}</span></h2>
            <div class="template-grid">${TEMPLATES.map((tpl) => `<button class="template-tile" data-start="template" data-value="${tpl.id}" title="${escapeHtml(tpl.description[L])}">${icon(tpl.icon)}<b>${escapeHtml(tpl.name[L])}</b><small>${escapeHtml(tpl.description[L])}</small></button>`).join('')}</div>
            <div class="start-actions">
              <button class="button" data-start="open" title="${escapeHtml(t('action.open'))}">${icon('folderOpen')}<span>${escapeHtml(t('action.open'))}</span></button>
              <button class="button" data-start="import" title="${escapeHtml(t('action.importVisio'))}">${icon('vsdxFile')}<span>${escapeHtml(t('action.importVisio'))}</span></button>
            </div>
          </section>
          <section class="start-card recent">
${settings.startShowRecent === false ? '' : recentBlockHtml}${settings.startShowFolders === false ? '' : foldersBlockHtml}            <h2>${icon('userGuide')}<span>${escapeHtml(t('start.help'))}</span></h2>
            <div class="start-list">
              <button class="start-link compact" data-start="tutorial-doc" title="${escapeHtml(t('tip.tutorialDoc'))}">${icon('tutorialDoc')}<span class="name">${escapeHtml(t('action.tutorialDoc'))}</span></button>
              <button class="start-link compact" data-start="guide" title="${escapeHtml(t('action.userGuide'))}">${icon('userGuide')}<span class="name">${escapeHtml(t('action.userGuide'))}</span></button>
              <button class="start-link compact" data-start="shortcuts" title="${escapeHtml(t('action.shortcuts'))}">${icon('keyboard')}<span class="name">${escapeHtml(t('action.shortcuts'))}</span></button>
            </div>
          </section>
          ${showSide ? `<section class="start-card side">
${settings.startShowSamples === false ? '' : samplesBlockHtml}${settings.startShowBackground === false ? '' : backgroundBlockHtml}          </section>` : ''}
        </div>
        <footer class="start-foot">
          <label class="check-row" title="${escapeHtml(t('settings.showStartPage'))}"><input type="checkbox" data-start-toggle ${settings.showStartPage ? 'checked' : ''} /><span>${escapeHtml(t('settings.showStartPage'))}</span></label>
          <span class="grow"></span>
          <span class="muted">© SHKWON(knix008@naver.com)</span>
        </footer>
      </div>
    </div>`;
}
