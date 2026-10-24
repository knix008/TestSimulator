// The start page (the MyUMLMaker layout): shown when the program starts (if
// enabled) and from the Home button. New model from a template, open a file,
// recent files, help and the tutorial, sample models and the moving
// background (pick one, shuffle, speed) — all over the animated background.
import { h, replace, numberField } from './dom.js';
import { t, getLanguage } from '../core/i18n.js';
import { commandIcon, commandName } from '../core/commands.js';
import { SAMPLE_IDS, SAMPLE_TAGS, sampleModel } from '../core/samples.js';
import { AnimatedBackground, ANIMATION_KINDS, ANIMATION_ICONS } from './background.js';
import { resolveTheme } from '../core/themes.js';
import { drawPreview } from './dialogs.js';

/** Template tiles: an empty model or a sample to start from. */
/** Starting points by field: an empty model, or a sample of a representative study to build on. */
export const START_TEMPLATES = [
  { id: 'blank2d', icon: '▭', group: 'basic' },
  { id: 'blank3d', icon: '◇', group: 'basic' },
  { id: 'cooling', icon: '🌀', sample: 'cpuHeatsink', group: 'electronics' },
  { id: 'electronics', icon: '▦', sample: 'pcb3d', group: 'electronics' },
  { id: 'dbc', icon: '⚙', sample: 'dbcModule', group: 'electronics' },
  { id: 'coldplate', icon: '❄', sample: 'coldPlate', group: 'electronics' },
  { id: 'turbulent', icon: '🌊', sample: 'turbulentDuct', group: 'flow' },
  { id: 'datacenter', icon: '🗄', sample: 'dataCenter', group: 'flow' },
  { id: 'natural', icon: '♨', sample: 'streetLamp', group: 'flow' },
  { id: 'micro', icon: '🔬', sample: 'microchannel', group: 'flow' },
  { id: 'battery', icon: '🔋', sample: 'battery', group: 'energy' },
  { id: 'pcm', icon: '💧', sample: 'pcmSink', group: 'energy' },
  { id: 'joule', icon: '⚡', sample: 'busbar', group: 'energy' },
  { id: 'solar', icon: '☀', sample: 'solarPanel', group: 'energy' },
  { id: 'static', icon: '➘', sample: 'cantilever', group: 'structure' },
  { id: 'modal', icon: '〜', sample: 'bracketModal', group: 'structure' },
  { id: 'stress', icon: '⚖', sample: 'ledStress', group: 'structure' },
  { id: 'envelope', icon: '🏠', sample: 'windowFrame', group: 'building' },
  { id: 'comfort', icon: '🧍', sample: 'officeComfort', group: 'building' },
  { id: 'floor', icon: '♒', sample: 'floorHeating', group: 'building' },
  { id: 'space', icon: '🛰', sample: 'satellitePanel', group: 'other' },
  { id: 'mug', icon: '☕', sample: 'mugCooling', group: 'other' },
];

export const TEMPLATE_GROUPS = ['basic', 'electronics', 'flow', 'energy', 'structure', 'building', 'other'];

export class StartPage {
  /** app: { state, patchSettings, run, openModel, openPath, newModel(dim), startTutorial() } */
  constructor(host, app) {
    this.host = host;
    this.app = app;
    this.el = h('div', { className: 'start-page', dataset: { testid: 'start-page' } });
    this.canvas = h('canvas', { className: 'start-bg', 'aria-hidden': 'true' });
    this.scroll = h('div', { className: 'start-scroll' });
    this.el.append(this.canvas, this.scroll);
    host.append(this.el);
    const settings = () => this.app.state.settings;
    this.background = new AnimatedBackground(this.canvas, {
      kind: settings().animation,
      speed: () => settings().animationSpeed / 100,
      colors: () => {
        const theme = resolveTheme(settings().theme, settings().customTheme);
        return { bg: theme.colors.bg, accent: theme.colors.accent, text: theme.colors.text, dark: theme.mode === 'dark' };
      },
    });
  }

  show(visible) {
    this.el.hidden = !visible;
    if (visible) {
      this.render();
      this.background.setKind(this.app.state.settings.animation);
      this.background.start();
    } else this.background.stop();
  }

  destroy() {
    this.background.destroy();
    this.el.remove();
  }

  get visible() {
    return !this.el.hidden;
  }

  /** 0 % = the moving background fully shown; higher values fade it into the page colour. */
  applyTransparency() {
    this.canvas.style.opacity = String(1 - this.app.state.settings.startBgTransparency / 100);
  }

  render() {
    this.applyTransparency();
    if (this.el.hidden) return;
    const lang = getLanguage();
    const s = this.app.state.settings;
    const app = this.app;
    const button = (label, icon, onClick, opts = {}) => h('button', { type: 'button', className: `button${opts.primary ? ' primary' : ''}${opts.big ? ' big' : ''}`, title: opts.title ?? label, dataset: opts.testid ? { testid: opts.testid } : undefined, onClick }, h('span', { className: 'icon' }, icon), h('span', null, label));
    const link = (label, icon, onClick, path = '', testid = null) => h('button', { type: 'button', className: path ? 'start-link' : 'start-link compact', title: path || label, dataset: testid ? { testid } : undefined, onClick },
      h('span', { className: 'icon' }, icon), h('span', { className: 'name' }, label), path ? h('span', { className: 'path' }, path) : null);
    const recent = s.recentFiles.slice(0, 8);
    replace(this.scroll, h('div', { className: 'start-inner' },
      h('header', { className: 'start-hero' },
        h('img', { src: './icon.png', alt: '', className: 'start-icon' }),
        h('div', null, h('h1', null, 'MyHeatManager ', h('small', null, `v${__APP_VERSION__}`)), h('p', null, t('startTagline'))),
        h('div', { className: 'start-hero-actions' },
          h('div', { className: 'start-docs' },
            button(commandName('usage', lang), commandIcon('usage'), () => app.run('usage'), { big: true }),
            button(commandName('tutorialDoc', lang), commandIcon('tutorialDoc'), () => app.run('tutorialDoc'), { big: true })),
          button(t('startTutorialStart'), commandIcon('tutorial'), () => app.startTutorial(), { primary: true, big: true, testid: 'start-tutorial' }))),
      s.tutorialDone ? null : h('div', { className: 'start-banner', dataset: { testid: 'start-banner' } }, h('span', { className: 'icon' }, '💡'), h('span', null, t('startTutorialBanner')),
        h('button', { type: 'button', className: 'small-button', onClick: () => app.startTutorial() }, `▶ ${t('startTutorialGo')}`)),
      h('div', { className: 'start-grid start-board', dataset: { testid: 'start-board' } },
        h('section', { className: 'start-card templates', dataset: { testid: 'start-templates' } },
          h('h2', null, h('span', { className: 'icon' }, commandIcon('new')), h('span', null, t('startNew'))),
          h('div', { className: 'template-groups' }, ...TEMPLATE_GROUPS.map((group) => h('div', { className: 'template-group', dataset: { testid: `start-tpl-group-${group}` } },
            h('p', { className: 'template-group-title' }, t(`tplGroup_${group}`)),
            ...START_TEMPLATES.filter((tpl) => tpl.group === group).map((tpl) => h('button', {
              type: 'button', className: 'template-tile', dataset: { testid: `start-tpl-${tpl.id}` }, title: t(`tpl_${tpl.id}_desc`),
              onClick: () => (tpl.sample ? app.openModel(sampleModel(tpl.sample, lang), null) : app.newModel(tpl.id === 'blank3d' ? 3 : 2)),
            }, h('span', { className: 'icon' }, tpl.icon), h('b', null, t(`tpl_${tpl.id}`)), h('small', null, t(`tpl_${tpl.id}_desc`))))))),
          h('div', { className: 'start-actions' },
            button(commandName('open', lang), commandIcon('open'), () => app.run('open'), { testid: 'start-open' }),
            button(commandName('newFromSample', lang).replace('…', ''), commandIcon('newFromSample'), () => app.run('newFromSample')),
            button(commandName('heatmapImport', lang).replace('…', ''), commandIcon('heatmapImport'), () => app.run('heatmapImport')))),
        h('section', { className: 'start-card recent', dataset: { testid: 'start-recent' } },
          h('h2', null, h('span', { className: 'icon' }, commandIcon('recent')), h('span', null, t('recentFiles')), h('span', { className: 'grow' }),
            recent.length ? h('button', { type: 'button', className: 'small-button danger', onClick: () => app.patchSettings({ recentFiles: [] }) }, t('clearRecent')) : null),
          h('div', { className: 'start-list' }, ...(recent.length ? recent.map((file) => h('div', { className: 'start-row' },
            link(file.name, '📄', () => app.openPath(file.path), file.path),
            h('button', { type: 'button', className: 'icon-button', title: t('remove'), onClick: () => app.patchSettings({ recentFiles: s.recentFiles.filter((f) => f.path !== file.path) }) }, '✕')))
            : [h('div', { className: 'start-empty' }, h('span', null, 'ℹ'), h('span', null, t('startRecentEmpty')))])),
          h('h2', null, h('span', { className: 'icon' }, '📖'), h('span', null, t('startHelp'))),
          h('div', { className: 'start-list' },
            link(commandName('tutorial', lang), commandIcon('tutorial'), () => app.startTutorial()),
            link(commandName('tutorialDoc', lang), commandIcon('tutorialDoc'), () => app.run('tutorialDoc')),
            link(commandName('usage', lang), commandIcon('usage'), () => app.run('usage')),
            link(commandName('shortcuts', lang), commandIcon('shortcuts'), () => app.run('shortcuts')),
            link(commandName('batchHelp', lang).replace('…', ''), commandIcon('batchHelp'), () => app.run('batchHelp')))),
        h('section', { className: 'start-card side', dataset: { testid: 'start-side' } },
          h('h2', null, h('span', { className: 'icon' }, '✨'), h('span', null, t('startBackground'))),
          h('div', { className: 'anim-chips', role: 'radiogroup' }, ...ANIMATION_KINDS.map((kind) => h('button', {
            type: 'button', className: kind === s.animation ? 'anim-chip active' : 'anim-chip', role: 'radio', 'aria-checked': kind === s.animation, title: t(`anim_${kind}`), dataset: { testid: `anim-${kind}` },
            onClick: () => { app.patchSettings({ animation: kind }); this.background.setKind(kind); this.render(); },
          }, h('span', { className: 'icon' }, ANIMATION_ICONS[kind]), h('span', null, t(`anim_${kind}`))))),
          h('div', { className: 'start-actions' }, button(t('startShuffle'), '🎲', () => { const kind = this.background.shuffle(); app.patchSettings({ animation: kind }); this.render(); }, { testid: 'start-shuffle' })),
          h('div', { className: 'start-speed' }, h('span', { className: 'icon' }, '⏩'), h('span', null, t('startSpeed')),
            numberField({ value: s.animationSpeed, min: 0, max: 300, step: 10, suffix: '%', testid: 'start-speed', onChange: (v) => app.patchSettings({ animationSpeed: Math.round(v) }) })),
          h('div', { className: 'start-speed', title: t('startTransparency') }, h('span', { className: 'icon' }, '◐'), h('span', null, t('startTransparency')),
            numberField({ value: s.startBgTransparency, min: 0, max: 95, step: 5, suffix: '%', testid: 'start-transparency', onChange: (v) => { this.canvas.style.opacity = String(1 - v / 100); app.patchSettings({ startBgTransparency: Math.round(v) }); } })),
          h('label', { className: 'start-check' }, h('input', { type: 'checkbox', checked: s.animationRandom, onChange: (event) => app.patchSettings({ animationRandom: event.target.checked }) }), h('span', null, t('startRandom')))),
      // The samples, a section of their own: a card per sample with a preview, its name, tags and description.
      h('section', { className: 'start-card start-samples', dataset: { testid: 'start-samples' } },
        h('h2', null, h('span', { className: 'icon' }, '🗂'), h('span', null, `${t('startSamples')} (${SAMPLE_IDS.length})`), h('span', { className: 'grow' }),
          h('button', { type: 'button', className: 'small-button', onClick: () => app.run('newFromSample') }, `🗂 ${t('sampleGallery')}`)),
        h('div', { className: 'start-sample-grid' }, ...SAMPLE_IDS.map((id) => {
          const model = sampleModel(id, lang);
          const canvas = h('canvas');
          drawPreview(canvas, model);
          return h('button', { type: 'button', className: 'start-sample', title: model.description, dataset: { testid: `start-sample-${id}` }, onClick: () => app.openModel(model, null) },
            canvas, h('b', null, model.name),
            h('span', { className: 'tags' }, ...[...new Set([...(SAMPLE_TAGS[id] ?? []), `${model.domain.dim}D`])].map((tag) => h('span', { className: 'tag' }, tag))),
            h('small', null, model.description));
        })))),
      h('footer', { className: 'start-foot' },
        h('label', { className: 'start-check' }, h('input', { type: 'checkbox', checked: s.showStartPage, dataset: { testid: 'start-toggle' }, onChange: (event) => app.patchSettings({ showStartPage: event.target.checked }) }), h('span', null, t('startShow'))),
        h('span', { className: 'grow' }),
        h('span', { className: 'muted' }, '© SHKWON (knix008@naver.com)'))));
    this.applyLayout();
  }

  /** The saved arrangement of the cards (order, column span 1–3, height in px or auto). */
  layout() {
    const saved = this.app.state.settings.startLayout ?? {};
    const order = (saved.order ?? []).filter((id) => CARD_IDS.includes(id));
    for (const id of CARD_IDS) if (!order.includes(id)) order.push(id);
    return { order, span: { ...DEFAULT_SPAN, ...(saved.span ?? {}) }, height: { ...(saved.height ?? {}) } };
  }

  saveLayout(layout) {
    this.app.patchSettings({ startLayout: layout });
  }

  /**
   * Puts the cards in the saved order and size, and gives each a move handle (⠿ in its heading: drag it over
   * another card to put it there) and a size grip (bottom right: drag for the width in columns and the height;
   * double-click for the automatic height). The arrangement is saved in the settings.
   */
  applyLayout() {
    const board = this.scroll.querySelector('.start-board');
    if (!board) return;
    const layout = this.layout();
    const cards = Object.fromEntries(CARD_IDS.map((id) => [id, board.querySelector(`.start-card.${CARD_CLASS[id]}`)]));
    for (const id of layout.order) {
      const card = cards[id];
      if (!card) continue;
      board.append(card);
      card.dataset.card = id;
      card.style.gridColumn = `span ${Math.max(1, Math.min(3, layout.span[id] ?? 1))}`;
      card.style.height = layout.height[id] ? `${layout.height[id]}px` : '';
      card.classList.toggle('fixed-height', Boolean(layout.height[id]));
      const heading = card.querySelector('h2');
      if (heading && !heading.querySelector('.card-handle')) {
        const handle = h('span', { className: 'card-handle', title: t('startMoveCard'), dataset: { testid: `card-handle-${id}` } }, '⠿');
        heading.prepend(handle);
        handle.addEventListener('pointerdown', (event) => this.dragCard(event, id, board));
      }
      if (!card.querySelector('.card-resize')) {
        const grip = h('span', { className: 'card-resize', title: t('startResizeCard'), dataset: { testid: `card-resize-${id}` } });
        card.append(grip);
        grip.addEventListener('pointerdown', (event) => this.resizeCard(event, id, card, board));
        grip.addEventListener('dblclick', () => {
          const next = this.layout();
          delete next.height[id];
          this.saveLayout(next);
          this.render();
        });
      }
    }
  }

  /**
   * Moving a card: a translucent copy (the silhouette) follows the pointer, a dashed placeholder of the card's
   * size shows where it will land, and the other cards slide aside to make room (FLIP animation).
   */
  dragCard(event, id, board) {
    event.preventDefault();
    const card = board.querySelector(`[data-card="${id}"]`);
    const rect = card.getBoundingClientRect();
    const offset = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const ghost = card.cloneNode(true);
    ghost.classList.add('card-ghost');
    Object.assign(ghost.style, { width: `${rect.width}px`, height: `${rect.height}px`, left: `${rect.left}px`, top: `${rect.top}px` });
    document.body.append(ghost);
    const placeholder = h('div', { className: 'card-placeholder', dataset: { testid: 'card-placeholder' } });
    Object.assign(placeholder.style, { gridColumn: card.style.gridColumn, height: `${rect.height}px` });
    board.replaceChild(placeholder, card);
    const slide = (mutate) => {
      // FLIP: remember where every card is, change the order, then animate each from its old place.
      const before = new Map([...board.children].map((el) => [el, el.getBoundingClientRect()]));
      mutate();
      for (const [el, old] of before) {
        const now = el.getBoundingClientRect();
        const dx = old.left - now.left;
        const dy = old.top - now.top;
        if (!dx && !dy) continue;
        el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], { duration: 180, easing: 'ease-out' });
      }
    };
    const move = (ev) => {
      ghost.style.left = `${ev.clientX - offset.x}px`;
      ghost.style.top = `${ev.clientY - offset.y}px`;
      ghost.hidden = true;
      const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.start-board > .start-card');
      ghost.hidden = false;
      if (!over) return;
      const r = over.getBoundingClientRect();
      const before = ev.clientY < r.top + r.height / 2 && (ev.clientX < r.left + r.width * 0.75 || ev.clientY < r.top + r.height / 3);
      const next = before ? over : over.nextSibling;
      if (next === placeholder || (before && over.previousSibling === placeholder) || (!before && over.nextSibling === placeholder)) return;
      slide(() => board.insertBefore(placeholder, next));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      ghost.remove();
      board.replaceChild(card, placeholder);
      const layout = this.layout();
      layout.order = [...board.querySelectorAll(':scope > .start-card')].map((el) => el.dataset.card).filter(Boolean);
      this.saveLayout(layout);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  resizeCard(event, id, card, board) {
    event.preventDefault();
    event.stopPropagation();
    const start = { x: event.clientX, y: event.clientY, w: card.getBoundingClientRect().width, hgt: card.getBoundingClientRect().height };
    const gap = 14;
    const column = (board.getBoundingClientRect().width - gap * 2) / 3;
    let span = Math.max(1, Math.min(3, Math.round((start.w + gap) / (column + gap))));
    let height = start.hgt;
    card.classList.add('resizing');
    const move = (ev) => {
      span = Math.max(1, Math.min(3, Math.round((start.w + ev.clientX - start.x + gap) / (column + gap))));
      height = Math.max(120, Math.round(start.hgt + ev.clientY - start.y));
      card.style.gridColumn = `span ${span}`;
      card.style.height = `${height}px`;
      card.classList.add('fixed-height');
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      card.classList.remove('resizing');
      const next = this.layout();
      next.span[id] = span;
      next.height[id] = height;
      this.saveLayout(next);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
}

const CARD_IDS = ['templates', 'recent', 'side', 'samples'];
const CARD_CLASS = { templates: 'templates', recent: 'recent', side: 'side', samples: 'start-samples' };
const DEFAULT_SPAN = { templates: 3, recent: 2, side: 1, samples: 3 };
