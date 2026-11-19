// Tutorial: a guided tour that runs the real app, chapter by chapter: the start page, opening a
// sample capture, the three panes, display filters, colouring, following a stream, statistics,
// the network map, live capture with the demo interface, exporting and customizing.
//
// It works on sample captures of its own (tabs closed at the end without touching the user's
// captures); the settings it changes are put back when it ends. While it runs, popups open inside
// the main window (so a screen recording shows them). A card at the bottom right shows the step
// with previous / next, auto play, a chapter list and exit; the part of the window the step is
// about is outlined.
import { escapeHtml, pointerDrag } from './dom.js';
import { icon } from '../icons.js';
import { getLanguage, t } from '../i18n.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const q = (selector) => document.querySelector(selector);
async function until(test, timeout = 6000) {
  const end = performance.now() + timeout;
  while (performance.now() < end) {
    try { if (await test()) return true; } catch { /* not yet */ }
    await sleep(60);
  }
  return false;
}
const ko = () => getLanguage() !== 'en';

export const CHAPTERS = ['start', 'open', 'filter', 'analyze', 'stats', 'map', 'capture', 'files', 'customize'];

/**
 * Steps. `target`: what the step outlines (selector); `run(a)` puts the app in the state the step
 * shows; `dwell`: how long auto play stays (ms).
 */
export const STEPS = [
  // ── start page
  { id: 'welcome', chapter: 'start', target: '.start-hero', run: (a) => a.start() },
  { id: 'home', chapter: 'start', target: '#menubar [data-home]', run: (a) => a.start() },
  { id: 'captureCard', chapter: 'start', target: '.start-card.capture', dwell: 6000, run: (a) => a.start() },
  { id: 'samplesCard', chapter: 'start', target: '.start-card.samples', run: (a) => a.start() },
  { id: 'recentCard', chapter: 'start', target: '.start-card.recent', run: (a) => a.start() },
  // ── open a capture
  { id: 'sample', chapter: 'open', target: '#view-host', dwell: 5000, run: (a) => a.sample() },
  { id: 'packetList', chapter: 'open', target: '.pane-list', dwell: 6000, async run(a) { await a.sample(); a.selectNo(3); } },
  { id: 'details', chapter: 'open', target: '.pane-details', dwell: 6000, async run(a) { await a.sample(); a.selectWhere('dns'); a.app.view?.details.setAll(true); } },
  { id: 'bytes', chapter: 'open', target: '.pane-bytes', dwell: 6000, async run(a) { await a.sample(); a.selectWhere('dns'); a.revealField('ip.src'); } },
  { id: 'columns', chapter: 'open', target: '.pl-head', run: (a) => a.sample() },
  // ── display filters
  { id: 'filterBar', chapter: 'filter', target: '.cap-filterbar', dwell: 6000, async run(a) { await a.sample(); await a.filter(''); a.typeFilter('dns'); } },
  { id: 'filterApply', chapter: 'filter', target: '.pane-list', dwell: 6000, async run(a) { await a.sample(); await a.filter('dns'); } },
  { id: 'filterPresets', chapter: 'filter', target: '.df-presets', dwell: 7000, async run(a) { await a.sample(); await a.filter('dns or udp'); } },
  { id: 'tlsVersion', chapter: 'filter', target: '.pane-list', dwell: 7000, async run(a) { await a.sample(); await a.filter('_ws.col.protocol == "TLSv1.3"'); } },
  { id: 'filterInvalid', chapter: 'filter', target: '.cap-filterbar', async run(a) { await a.sample(); await a.filter(''); a.typeFilter('tcp.port == '); } },
  { id: 'filterFromField', chapter: 'filter', target: '.pane-details', dwell: 7000, async run(a) { await a.sample(); await a.filter(''); a.selectWhere('dns'); a.revealField('ip.dst'); } },
  { id: 'filterExpression', chapter: 'filter', target: '.web-popup-filterexpr', dwell: 6000, async run(a) { await a.sample(); await a.popup(() => a.app.run('filterExpression'), 'filterexpr'); } },
  { id: 'coloring', chapter: 'filter', target: '.web-popup-coloring', dwell: 6000, async run(a) { await a.sample('troubleshooting'); await a.popup(() => a.app.run('coloringRules'), 'coloring'); } },
  // ── analyze
  { id: 'expert', chapter: 'analyze', target: '.web-popup-stats', dwell: 7000, async run(a) { await a.sample('troubleshooting'); await a.popup(() => a.app.run('expertInfo'), 'stats'); } },
  { id: 'follow', chapter: 'analyze', target: '.web-popup-follow', dwell: 7000, async run(a) { await a.sample('http'); a.selectWhere('http.request'); await a.popup(() => a.app.run('followTcp'), 'follow'); } },
  { id: 'conversationFilter', chapter: 'analyze', target: '.pane-list', async run(a) { await a.sample('http'); await a.filter(''); a.selectWhere('tcp'); await a.app.run('conversation:tcp'); } },
  { id: 'decodeAs', chapter: 'analyze', target: '.web-popup-decodeas', async run(a) { await a.sample(); a.selectNo(3); await a.popup(() => a.app.run('decodeAs'), 'decodeas'); } },
  // ── statistics
  { id: 'properties', chapter: 'stats', target: '.web-popup-stats', async run(a) { await a.sample(); await a.popup(() => a.app.run('captureProperties'), 'stats'); } },
  { id: 'hierarchy', chapter: 'stats', target: '.web-popup-stats', async run(a) { await a.sample(); await a.popup(() => a.app.run('protocolHierarchy'), 'stats'); } },
  { id: 'conversations', chapter: 'stats', target: '.web-popup-stats', async run(a) { await a.sample(); await a.popup(() => a.app.run('conversations'), 'stats'); } },
  { id: 'ioGraph', chapter: 'stats', target: '.web-popup-chart', dwell: 6000, async run(a) { await a.sample(); await a.popup(() => a.app.run('ioGraph'), 'chart'); } },
  { id: 'flowGraph', chapter: 'stats', target: '.web-popup-flowgraph', dwell: 6000, async run(a) { await a.sample('http'); await a.popup(() => a.app.run('flowGraph'), 'flowgraph'); } },
  // ── network map
  { id: 'netMap', chapter: 'map', target: '.pane-map', dwell: 7000, async run(a) { await a.sample(); await a.filter(''); a.app.updateSettings({ showNetMap: true }); await sleep(700); } },
  { id: 'netMapSelect', chapter: 'map', target: '.pane-map', dwell: 8000, async run(a) {
    await a.sample(); a.app.updateSettings({ showNetMap: true }); await sleep(700);
    const map = a.app.view?.map;
    const node = map?.topology?.nodes.find((n) => n.kind === 'router') ?? map?.topology?.nodes[0];
    if (node) map.choose({ type: 'node', id: node.id });
  } },
  { id: 'netMapLink', chapter: 'map', target: '.pane-map', dwell: 7000, async run(a) {
    await a.sample(); a.app.updateSettings({ showNetMap: true }); await sleep(700);
    const map = a.app.view?.map;
    const link = map?.topology?.links.slice().sort((x, y) => y.bytes - x.bytes)[0];
    if (link) map.choose({ type: 'link', id: link.id });
  } },
  // ── live capture
  { id: 'captureOptions', chapter: 'capture', target: '.web-popup-capopts', dwell: 6000, async run(a) { await a.start(); await a.popup(() => a.app.run('captureOptions'), 'capopts'); } },
  { id: 'captureDemo', chapter: 'capture', target: '#view-host', dwell: 8000, async run(a) { await a.demo(); await sleep(2500); } },
  { id: 'captureStop', chapter: 'capture', target: '#toolbar [data-command="captureStart"]', async run(a) { const doc = await a.demo(); await sleep(800); if (doc?.capture) await a.app.stopLiveCapture(doc); } },
  // ── files
  { id: 'save', chapter: 'files', target: '#toolbar [data-command="save"]', run: (a) => a.sample() },
  { id: 'export', chapter: 'files', target: '.web-popup-export', async run(a) { await a.sample(); await a.popup(() => a.app.run('exportText'), 'export'); } },
  { id: 'printExport', chapter: 'files', target: '.web-popup-print', dwell: 7000, async run(a) { await a.sample(); await a.popup(() => a.app.run('print'), 'print'); } },
  { id: 'objects', chapter: 'files', target: '.web-popup-stats', async run(a) { await a.sample('http'); await a.popup(() => a.app.run('exportObjectsHttp'), 'stats'); } },
  // ── customize
  { id: 'theme', chapter: 'customize', target: '.split-button', dwell: 6000, async run(a) { await a.sample(); for (const theme of ['dark', 'light']) { a.app.updateSettings({ theme }); await sleep(900); } } },
  { id: 'layout', chapter: 'customize', target: '#view-host', dwell: 6000, async run(a) { await a.sample(); for (const layout of ['details-right', 'stack']) { a.app.updateSettings({ paneLayout: layout }); await sleep(1200); } } },
  { id: 'settings', chapter: 'customize', target: '.web-popup-settings', async run(a) { await a.sample(); await a.popup(() => a.app.popups.open('settings', { tab: 'layout' }), 'settings'); } },
  { id: 'help', chapter: 'customize', target: '#menubar [data-menu="help"]', run: (a) => a.sample() },
  { id: 'finish', chapter: 'customize', target: '[data-command="tutorial"]', run: (a) => a.sample() },
];

export class Tutorial {
  constructor(app, layer) {
    this.app = app;
    this.layer = layer;
    this.index = 0;
    this.active = false;
    this.busy = false;
    this.autoplay = false;
    this.timer = null;
    this.card = { right: 18, bottom: 34 };
  }

  state() {
    return { active: this.active, index: this.index, busy: this.busy, autoplay: this.autoplay, total: STEPS.length, id: STEPS[this.index]?.id };
  }

  /** Everything a step's `run` uses. */
  helpers() {
    const app = this.app;
    const tutorial = this;
    const helpers = {
      app,
      async start() { await tutorial.closeAll(); app.showStartPage(true); await sleep(250); },
      /** A sample capture of the tour, opened once and kept for the tour. 'basics': the mixed LAN one. */
      async sample(group = 'basics') {
        await tutorial.closeAll();
        const samples = app.samples();
        const pick = group === 'basics' ? samples.find((x) => /mixed|office|lan/i.test(x.id))
          : group === 'http' ? samples.find((x) => /^http-page/i.test(x.id)) ?? samples.find((x) => /^http/i.test(x.id))
            : samples.find((x) => x.group === group);
        const wanted = pick ?? samples[0];
        let doc = app.state.docs.find((d) => d.tourSample === wanted.id);
        if (!doc) {
          doc = await app.openSample(wanted.id);
          if (doc) { doc.tourSample = wanted.id; tutorial.docs.add(doc.id); }
        } else if (app.state.active !== doc.id || app.state.showStart) {
          app.state.active = doc.id; app.state.showStart = false; app.renderAll();
        }
        await until(() => app.view);
        await sleep(150);
        return doc;
      },
      async demo() {
        await tutorial.closeAll();
        let doc = app.state.docs.find((d) => d.id === tutorial.demoId);
        if (!doc || !doc.capture) {
          doc = await app.startLiveCapture('demo');
          if (doc) { tutorial.demoId = doc.id; tutorial.docs.add(doc.id); }
        }
        return doc;
      },
      selectNo(no) { const doc = app.doc(); if (doc && no - 1 < doc.count) app.selectFrame(doc, no - 1, { reveal: true }); },
      selectWhere(field) {
        const doc = app.doc();
        if (!doc) return;
        for (let i = 0; i < doc.passed; i += 1) if (doc.dissection(i).fields?.has(field)) { app.selectFrame(doc, i, { reveal: true }); return; }
      },
      revealField(abbrev) {
        const v = app.view;
        const node = v?.details.find((n) => n.abbrev === abbrev);
        if (node) { v.details.reveal(node); v.bytes.highlight(node); }
      },
      typeFilter(text) { app.view?.setFilterText(text); },
      async filter(text) { app.view?.setFilterText(text); await app.applyDisplayFilter(text); },
      popup(open, kind) { Promise.resolve(open()).catch(() => {}); return until(() => q(`.web-popup-${kind}`) && getComputedStyle(q(`.web-popup-${kind}`)).visibility !== 'hidden'); },
      closeMenus: () => tutorial.closeAll(),
      ko,
    };
    app.actions = window.__mynetmanager?.actions;
    return helpers;
  }

  async closeAll() {
    await this.app.popups.closeAll();
    for (const el of document.querySelectorAll('.web-popup')) el.remove();
    for (const el of document.querySelectorAll('.web-popup-shield')) el.remove();
    this.app.popups.frames.clear();
  }

  async start({ autoplay = false, index = 0 } = {}) {
    if (this.active) { this.go(index); return; }
    this.active = true;
    this.autoplay = autoplay;
    // Remember what the tour changes, to put it back at the end.
    this.saved = { ...this.app.settings() };
    this.savedActive = this.app.state.active;
    this.savedStart = this.app.state.showStart;
    this.app.popups.inline = true;
    this.docs = new Set();
    await this.closeAll();
    this.layer.classList.add('active');
    this.go(index);
  }

  async stop() {
    if (!this.active) return;
    clearTimeout(this.timer);
    this.active = false;
    this.autoplay = false;
    await this.closeAll();
    this.app.popups.inline = false;
    this.layer.classList.remove('active');
    this.layer.innerHTML = '';
    for (const id of this.docs ?? []) {
      const doc = this.app.state.docs.find((item) => item.id === id);
      if (doc) { if (doc.capture) await this.app.stopLiveCapture(doc); await this.app.closeDoc(doc, { force: true }); }
    }
    this.docs = new Set();
    this.demoId = null;
    const restore = { ...this.saved, tutorialDone: true, tutorialOffered: true };
    this.app.updateSettings(restore);
    const back = this.app.state.docs.find((item) => item.id === this.savedActive);
    if (back) { this.app.state.active = back.id; this.app.state.showStart = this.savedStart; this.app.renderAll(); }
    else this.app.showStartPage(true);
    this.app.notify('success', t('tutorial.ended'));
  }

  next() { if (this.index < STEPS.length - 1) this.go(this.index + 1); else this.stop(); }
  prev() { if (this.index > 0) this.go(this.index - 1); }

  async go(index) {
    clearTimeout(this.timer);
    this.index = Math.max(0, Math.min(STEPS.length - 1, index));
    const step = STEPS[this.index];
    this.busy = true;
    this.draw(step);
    try {
      await step.run(this.helpers());
    } catch (error) {
      console.error('tutorial step', step.id, error);
    }
    await sleep(350);
    if (!this.active || STEPS[this.index] !== step) return;
    this.busy = false;
    this.draw(step);
    if (this.autoplay) {
      this.timer = setTimeout(() => {
        if (!this.active || !this.autoplay) return;
        if (this.index < STEPS.length - 1) this.next();
      }, step.dwell ?? 4200);
    }
  }

  /** The card and the outline of the step's target. */
  draw(step) {
    const chapter = step.chapter;
    const chapterSteps = STEPS.filter((s) => s.chapter === chapter);
    const target = q(step.target);
    let outline = '';
    if (target) {
      // 4 px around the target, but always inside the window: a target at an edge (the workspace, a side
      // panel, the start page) would otherwise have part of the outline outside it.
      const r = target.getBoundingClientRect();
      // Every edge is clamped, so a target scrolled out of a narrow window still gets a small outline at the edge.
      const M = 4; const MIN = 12;
      const clamp = (value, max) => Math.min(Math.max(value, M), max - M);
      let left = clamp(r.left - 4, window.innerWidth); let top = clamp(r.top - 4, window.innerHeight);
      const right = clamp(r.right + 4, window.innerWidth); const bottom = clamp(r.bottom + 4, window.innerHeight);
      left = Math.min(left, right - MIN); top = Math.min(top, bottom - MIN);
      outline = `<div class="tour-outline" style="left:${left}px;top:${top}px;width:${right - left}px;height:${bottom - top}px"></div>`;
    }
    this.layer.innerHTML = `${outline}
      <div class="tour-card" role="dialog" aria-label="${escapeHtml(t('tutorial.title'))}" style="right:${this.card.right}px;bottom:${this.card.bottom}px">
        <div class="tour-head" data-tour-drag title="${escapeHtml(t('tutorial.drag'))}">${icon('tutorial')}<b>${escapeHtml(t('tutorial.title'))}</b>
          <span class="tour-chapter">${escapeHtml(t(`tutorial.chapter.${chapter}`))} · ${chapterSteps.indexOf(step) + 1}/${chapterSteps.length}</span>
          <span class="grow"></span>
          <button class="icon-button" data-tour="stop" title="${escapeHtml(t('tutorial.stop'))}" aria-label="${escapeHtml(t('tutorial.stop'))}">${icon('close')}</button></div>
        <div class="tour-progress"><i style="width:${((this.index + 1) / STEPS.length) * 100}%"></i></div>
        <h3>${escapeHtml(t(`tutorial.${step.id}.title`))}</h3>
        <p>${escapeHtml(t(`tutorial.${step.id}.text`))}</p>
        <div class="tour-foot">
          <select data-icon="tutorial" data-tour-chapter title="${escapeHtml(t('tutorial.chapters'))}" aria-label="${escapeHtml(t('tutorial.chapters'))}">${CHAPTERS.map((id) => `<option value="${id}" ${id === chapter ? 'selected' : ''}>${escapeHtml(t(`tutorial.chapter.${id}`))}</option>`).join('')}</select>
          <span class="tour-count">${this.index + 1} / ${STEPS.length}${this.busy ? ' …' : ''}</span>
          <span class="grow"></span>
          <button class="icon-button" data-tour="prev" title="${escapeHtml(t('tutorial.prev'))}" aria-label="${escapeHtml(t('tutorial.prev'))}" ${this.index === 0 ? 'disabled' : ''}>${icon('stepBack')}</button>
          <button class="icon-button ${this.autoplay ? 'active' : ''}" data-tour="play" title="${escapeHtml(t(this.autoplay ? 'tutorial.pause' : 'tutorial.play'))}" aria-label="${escapeHtml(t(this.autoplay ? 'tutorial.pause' : 'tutorial.play'))}">${icon(this.autoplay ? 'pause' : 'play')}</button>
          <button class="button primary small" data-tour="next" title="${escapeHtml(t(this.index === STEPS.length - 1 ? 'tutorial.done' : 'tutorial.next'))}">${escapeHtml(t(this.index === STEPS.length - 1 ? 'tutorial.done' : 'tutorial.next'))}${icon('stepForward')}</button>
        </div>
      </div>`;
    this.layer.onclick = (event) => {
      const button = event.target.closest('[data-tour]');
      if (!button || button.disabled) return;
      const actionName = button.dataset.tour;
      if (actionName === 'next') this.next();
      else if (actionName === 'prev') this.prev();
      else if (actionName === 'stop') this.stop();
      else if (actionName === 'play') { this.autoplay = !this.autoplay; if (this.autoplay && !this.busy) this.next(); else this.draw(STEPS[this.index]); }
    };
    this.layer.onchange = (event) => {
      if (event.target.matches('[data-tour-chapter]')) this.go(STEPS.findIndex((s) => s.chapter === event.target.value));
    };
    this.layer.onpointerdown = (event) => {
      if (!event.target.closest('[data-tour-drag]') || event.target.closest('button')) return;
      const { right, bottom } = this.card;
      const card = this.layer.querySelector('.tour-card');
      pointerDrag(event, {
        move: (dx, dy) => { this.card = { right: Math.max(0, right - dx), bottom: Math.max(0, bottom - dy) }; card.style.right = `${this.card.right}px`; card.style.bottom = `${this.card.bottom}px`; },
      });
    };
  }
}

