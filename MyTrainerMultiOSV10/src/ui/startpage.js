// Start page: shown when the app starts (if enabled) and from the Home button.
// Left: new project, open, continue, recent files, and below them the AI-themed
// moving background (pick one, shuffle, speed, change automatically). Right: every
// sample model by group in columns — everything fits on one screen.
import appIcon from '../../assets/icon-256.png';
import { SAMPLE_GROUPS, SAMPLE_IDS, SAMPLES } from '../domain/samples.js';
import { ANIMATION_INTERVALS } from '../domain/settings.js';
import { animationIcon, icon } from '../icons.js';
import { ANIMATION_KINDS } from './background.js';
import { escapeHtml } from './dom.js';

export function startPageHtml(app) {
  const t = app.t;
  const settings = app.settings();
  const lang = app.lang();
  const recent = app.recent().slice(0, Math.min(5, settings.startRecentCount));
  const intervalLabel = (n) => (!n ? t('start.never') : n < 60 ? t('start.everySeconds', { n }) : t('start.everyMinutes', { n: n / 60 }));
  const samples = SAMPLE_GROUPS.map((group) => `<div class="sample-group"><h4>${escapeHtml(t(`sampleGroup.${group}`))}</h4><div class="sample-tiles">${SAMPLE_IDS.filter((id) => SAMPLES[id].group === group).map((id) => {
    const sample = SAMPLES[id];
    return `<button class="sample-tile" data-start="sample" data-value="${id}" title="${escapeHtml(lang === 'en' ? sample.descEn : sample.descKo)}">${icon(sample.icon)}<b>${escapeHtml(lang === 'en' ? sample.en : sample.ko)}</b></button>`;
  }).join('')}</div></div>`).join('');
  return `
    <canvas class="start-bg" aria-hidden="true"></canvas>
    <div class="start-scroll"><div class="start-inner">
      <header class="start-hero">
        <img src="${appIcon}" alt="" class="start-icon"/>
        <div><h1>MyTrainer <small>v${escapeHtml(app.version())}</small></h1><p>${escapeHtml(t('start.tagline'))}</p></div>
        <div class="start-hero-actions">
          <button class="button big" data-start="guide">${icon('userGuide')}<span>${escapeHtml(t('menu.guide'))}</span></button>
          <button class="button big primary" data-start="gallery">${icon('samples')}<span>${escapeHtml(t('start.gallery'))}</span></button>
        </div>
      </header>
      <div class="start-grid">
        <div class="start-column">
          <section class="start-card">
            <h2>${icon('fileNew')}<span>${escapeHtml(t('start.begin'))}</span></h2>
            <div class="start-actions vertical">
              <button class="start-link" data-start="new">${icon('fileNew')}<span class="name">${escapeHtml(t('start.newEmpty'))}</span><span class="path">${escapeHtml(t('start.newEmptyDesc'))}</span></button>
              <button class="start-link" data-start="open">${icon('folderOpen')}<span class="name">${escapeHtml(t('menu.open'))}</span><span class="path">.mytrain</span></button>
              ${app.hasSession() ? `<button class="start-link" data-start="continue">${icon('recent')}<span class="name">${escapeHtml(t('start.continue'))}</span><span class="path">${escapeHtml(app.sessionName())}</span></button>` : ''}
            </div>
            <h2>${icon('recent')}<span>${escapeHtml(t('start.recent'))}</span></h2>
            <div class="start-list">${recent.length ? recent.map((item) => `<div class="start-row"><button class="start-link" data-start="recent" data-value="${escapeHtml(item.path)}" title="${escapeHtml(item.path)}">${icon('file')}<span class="name">${escapeHtml(item.title || item.path.split(/[\/]/).pop())}</span><span class="path">${escapeHtml(item.web ? t('start.webFile') : item.path)}</span></button><button class="icon-button" data-start="forget" data-value="${escapeHtml(item.path)}" title="${escapeHtml(t('start.forget'))}">${icon('close')}</button></div>`).join('') : `<div class="start-empty">${icon('info')}<span>${escapeHtml(t('start.noRecent'))}</span></div>`}</div>
          </section>
          <section class="start-card background-card">
            <h2>${icon('sparkles')}<span>${escapeHtml(t('start.background'))}</span><span class="grow"></span><button class="small-button" data-start="shuffle" title="${escapeHtml(t('start.shuffle'))}">${icon('dice')}<span>${escapeHtml(t('start.shuffle'))}</span></button></h2>
            <div class="anim-chips" role="radiogroup">${ANIMATION_KINDS.map((kind) => `<button class="anim-chip ${settings.animation === kind ? 'active' : ''}" data-start="animation" data-value="${kind}" role="radio" aria-checked="${settings.animation === kind}" title="${escapeHtml(t(`animation.${kind}`))}">${icon(animationIcon(kind))}<span>${escapeHtml(t(`animation.${kind}`))}</span></button>`).join('')}</div>
            <label class="start-speed">${icon('speed')}<span>${escapeHtml(t('start.speed'))}</span><input type="range" min="0" max="300" step="10" value="${settings.animationSpeed}" data-start-speed/><output>${settings.animationSpeed}%</output></label>
            <div class="start-auto">
              <label class="start-check"><input type="checkbox" data-start-random ${settings.animationRandom ? 'checked' : ''}/><span>${escapeHtml(t('start.random'))}</span></label>
              <label class="start-interval">${icon('clock')}<select data-start-interval>${ANIMATION_INTERVALS.map((n) => `<option value="${n}" ${settings.animationInterval === n ? 'selected' : ''}>${escapeHtml(intervalLabel(n))}</option>`).join('')}</select></label>
            </div>
          </section>
        </div>
        <section class="start-card samples-card">
          <h2>${icon('samples')}<span>${escapeHtml(t('start.samples'))}</span><span class="grow"></span><span class="muted small">${escapeHtml(t('samples.hint', { n: SAMPLE_IDS.length }))}</span></h2>
          <div class="sample-columns">${samples}</div>
        </section>
      </div>
      <footer class="start-foot">
        <label class="check-row"><input type="checkbox" data-start-toggle ${settings.showStartPage ? 'checked' : ''}/><span>${escapeHtml(t('start.showOnStart'))}</span></label>
        <span class="grow"></span><span class="muted">© SHKWON (knix008@naver.com)</span>
      </footer>
    </div></div>`;
}
