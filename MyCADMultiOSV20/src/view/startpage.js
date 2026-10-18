// The start page: what MyCAD can do (each task with its tutorial lesson and a
// sample), quick actions, recent files, a tip of the day, and every sample
// with a thumbnail. Shown in the canvas area (the house tab of the tab row).
import { START_SCENE_ICONS, START_SCENES } from '../domain/settings.js';
import { icon } from '../icons.js';
import { stepperHtml } from '../stepper.js';

/** Tasks on the start page: icon, tutorial lesson (1-based) and a sample. */
export const START_TASKS = [
  { id: 'draw', icon: 'line', lesson: 2, sample: '04-bracket.mcad' },
  { id: 'precise', icon: 'coordinate', lesson: 3, sample: '16-imperial-plate.mcad' },
  { id: 'modify', icon: 'move', lesson: 4, sample: '06-cover-plate.mcad' },
  { id: 'annotate', icon: 'dimension', lesson: 5, sample: '15-annotations.mcad' },
  { id: 'parts', icon: 'part', lesson: 7, sample: '08-parts-catalog.mcad' },
  { id: 'solids', icon: 'solidBox', lesson: 8, sample: '09-solids-showcase.mcad' },
  { id: 'features', icon: 'solidExtrude', lesson: 9, sample: '11-springs-pipes.mcad' },
  { id: 'booleans', icon: 'solidCut', lesson: 10, sample: '10-mounting-block.mcad' },
  { id: 'views', icon: 'solidProject', lesson: 11, sample: '13-drawing-views.mcad' },
  { id: 'files', icon: 'import', lesson: 13, sample: 'drawings/freecad-plate.igs' },
  { id: 'print', icon: 'print', lesson: 14, sample: '02-flange.mcad' },
  { id: 'arch', icon: 'home', lesson: 6, sample: '17-house-plan.mcad' },
];

export const TIP_COUNT = 10;

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Scene buttons and the transparency / speed controls, under the recent files. */
function backgroundSection(ctx) {
  const { t } = ctx;
  const settings = ctx.settings ?? {};
  const current = settings.startScene ?? 'gears';
  const scenes = START_SCENES.map((id) => {
    const label = t(`settings.scene.${id}`);
    const on = current === id;
    return `<button type="button" class="start-scene ${on ? 'active' : ''}" role="radio" aria-checked="${on}" data-start-scene="${id}" title="${escapeHtml(label)}">${icon(START_SCENE_ICONS[id])}<span>${escapeHtml(label)}</span></button>`;
  }).join('');
  const field = (key, value, min, max, step, label) => `<label class="start-bg-row" title="${escapeHtml(label)}"><span>${escapeHtml(label)}</span>${stepperHtml({ key, value: value ?? 0, min, max, step, unit: '%', label })}</label>`;
  return `<h2>${icon('cube')}<span>${escapeHtml(t('settings.startScene'))}</span></h2>
    <div class="start-scene-grid" role="radiogroup" aria-label="${escapeHtml(t('settings.startScene'))}">${scenes}</div>
    <div class="start-bg-settings">
      ${field('startTransparency', settings.startTransparency, 0, 100, 5, t('settings.startTransparency'))}
      ${field('startMotion', settings.startMotion, 0, 100, 5, t('settings.startMotion'))}
      ${field('startCamera', settings.startCamera, 0, 300, 10, t('settings.startCamera'))}
      ${field('startObjects', settings.startObjects, 0, 300, 10, t('settings.startObjects'))}
      <button type="button" class="small-button start-bg-reset" data-start-motion-reset title="${escapeHtml(t('settings.startReset'))}">${icon('refresh')}<span>${escapeHtml(t('settings.startReset'))}</span></button>
    </div>`;
}

/**
 * HTML of the start page. ctx: { t, language, appIcon, version, recent: [{ path, title, at }], samples: [index entries] | null, error, settings }
 */
export function startPageHtml(ctx) {
  const { t } = ctx;
  const ko = ctx.language === 'ko';
  const action = (command, glyph, title, text, extra = '') => `<button type="button" class="action-card" data-command="${command}" ${extra} title="${escapeHtml(title)}">
    <span class="action-icon">${icon(glyph)}</span><span class="action-text"><b>${escapeHtml(title)}</b><small>${escapeHtml(text)}</small></span></button>`;
  const recent = ctx.recent.slice(0, 8).map((item) => {
    const name = String(item.path).split(/[\\/]/).pop();
    const date = item.at ? new Date(item.at).toLocaleDateString() : '';
    return `<li class="recent-item" data-recent-path="${escapeHtml(item.path)}" title="${escapeHtml(item.path)}">
      ${icon('drawing')}<span class="recent-name">${escapeHtml(item.title || name)}<small>${escapeHtml(name)}</small></span><small class="recent-date">${escapeHtml(date)}</small>
      <button type="button" class="icon-button recent-remove" data-recent-remove="${escapeHtml(item.path)}" title="${escapeHtml(t('start.removeRecent'))}" aria-label="${escapeHtml(t('start.removeRecent'))}">${icon('close')}</button></li>`;
  }).join('');
  const tip = Math.floor(Date.now() / 86400000) % TIP_COUNT;
  const sampleTitle = (s) => (ko ? s.titleKo || s.title : s.title || s.titleKo);
  const sampleOf = (file) => ctx.samples?.find((s) => s.file === file);
  const tasks = START_TASKS.map((task) => {
    const sample = sampleOf(task.sample);
    return `<article class="task-card" data-task="${task.id}">
      <header>${icon(task.icon)}<b>${escapeHtml(t(`start.task.${task.id}`))}</b></header>
      <p>${escapeHtml(t(`start.task.${task.id}.text`))}</p>
      <footer>
        <button type="button" class="small-button" data-start-lesson="${task.lesson - 1}" title="${escapeHtml(t('start.lessonTip', { n: task.lesson }))}">${icon('tutorial')}<span>${escapeHtml(t('start.lesson', { n: task.lesson }))}</span></button>
        ${sample ? `<button type="button" class="small-button" data-sample-open="${escapeHtml(sample.file)}" title="${escapeHtml(sampleTitle(sample))}">${icon('open')}<span>${escapeHtml(t('start.openSample'))}</span></button>` : ''}
      </footer></article>`;
  }).join('');
  const samples = ctx.samples
    ? ctx.samples.map((s) => `<button type="button" class="sample-card" data-sample="${escapeHtml(s.file)}" title="${escapeHtml(`${sampleTitle(s)} — ${s.file}`)}">
        <canvas class="sample-thumb" width="320" height="200" data-thumb="${escapeHtml(s.file)}" aria-hidden="true"></canvas>
        <span class="sample-body"><b>${escapeHtml(sampleTitle(s))}</b><small>${escapeHtml(ko ? s.descriptionKo || s.description : s.description || s.descriptionKo)}</small>
        <span class="sample-tags">${(s.tags ?? []).slice(0, 4).map((tag) => `<i>${escapeHtml(tag)}</i>`).join('')}<i class="sample-ext">${escapeHtml(s.file.split('.').pop().toUpperCase())}</i></span></span></button>`).join('')
    : `<p class="muted">${escapeHtml(ctx.error ? t('start.samplesError', { error: ctx.error }) : t('start.samplesLoading'))}</p>`;
  return `<div class="start">
    <header class="start-head">
      <img class="start-logo" src="${ctx.appIcon}" alt="" />
      <div><h1>MyCAD <span>${escapeHtml(ctx.version ?? '')}</span></h1><p>${escapeHtml(t('start.lead'))}</p></div>
    </header>
    <div class="start-grid">
      <aside class="start-side">
        <h2>${icon('play')}<span>${escapeHtml(t('start.begin'))}</span></h2>
        <div class="start-actions">
          ${action('tutorial', 'tutorial', t('action.tutorial'), t('start.tutorialText'), 'data-primary')}
          ${action('new', 'newDrawing', t('action.new'), t('start.newText'))}
          ${action('open', 'open', t('action.open'), t('start.openText'))}
          ${action('importDxf', 'import', t('start.import2d'), t('start.import2dText'))}
          ${action('import3d', 'solidImport', t('start.import3d'), t('start.import3dText'))}
          ${action('tutorialDoc', 'book', t('action.tutorialDoc'), t('start.docText'))}
          ${action('shortcuts', 'keyboard', t('action.shortcuts'), t('start.shortcutsText'))}
        </div>
        <h2 class="recent-head">${icon('recent')}<span>${escapeHtml(t('start.recent'))}</span>${ctx.recent.length ? `<button type="button" class="small-button" data-recent-clear title="${escapeHtml(t('start.clearRecent'))}">${escapeHtml(t('start.clearRecent'))}</button>` : ''}</h2>
        ${recent ? `<ul class="recent-list">${recent}</ul>` : `<p class="muted">${escapeHtml(t('start.noRecent'))}</p>`}
        ${backgroundSection(ctx)}
        <p class="start-tip">${icon('bulb')}<span><b>${escapeHtml(t('start.tip'))}</b> ${escapeHtml(t(`start.tip.${tip}`))}</span></p>
      </aside>
      <section class="start-main">
        <h2>${icon('checklist')}<span>${escapeHtml(t('start.tasks'))}</span></h2>
        <div class="task-grid">${tasks}</div>
        <h2>${icon('drawing')}<span>${escapeHtml(t('start.samples'))}</span><small>${ctx.samples ? escapeHtml(t('start.sampleCount', { count: ctx.samples.length })) : ''}</small></h2>
        <div class="sample-grid">${samples}</div>
      </section>
    </div>
  </div>`;
}
