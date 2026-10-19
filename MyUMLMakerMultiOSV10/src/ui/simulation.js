// BPMN simulation on the canvas (Visual Paradigm's process animation): a bar over the diagram
// (play / pause, one step, from the start, speed, analyse 100 runs, close), tokens that move along
// the sequence flows, and marks on the elements: visited, holding a token, waiting at a join that
// cannot fire, never reached. The run itself is domain/bpmnsim.js; the canvas draws the frames
// (DiagramView.drawSimulation). The model is not changed.
import { analyseSimulation, createSimulation, simulationGraph, stepSimulation } from '../domain/bpmnsim.js';
import { icon } from '../icons.js';
import { escapeHtml } from './dom.js';

const SPEEDS = [0.5, 1, 2, 4];
const STEP_MS = 650;

/** A point `t` (0…1) of the way along a polyline. */
export function pointAlong(points, t) {
  if (!points?.length) return null;
  if (points.length === 1) return points[0];
  const lengths = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) { const d = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y); lengths.push(d); total += d; }
  let left = Math.max(0, Math.min(1, t)) * total;
  for (let i = 0; i < lengths.length; i++) {
    if (left <= lengths[i] || i === lengths.length - 1) {
      const f = lengths[i] ? Math.min(1, left / lengths[i]) : 0;
      return { x: points[i].x + (points[i + 1].x - points[i].x) * f, y: points[i].y + (points[i + 1].y - points[i].y) * f };
    }
    left -= lengths[i];
  }
  return points.at(-1);
}

export class SimulationController {
  /** app: { t, view(), project(), diagram(), notify(kind, text) } */
  constructor(app) {
    this.app = app;
    this.active = false;
    this.playing = false;
    this.speed = 1;
    this.seed = 1;
    this.analysis = null;
    this.animation = null;
  }

  get view() { return this.app.view(); }

  start() {
    const diagram = this.app.diagram();
    if (!diagram || diagram._type !== 'BPMNDiagram') return;
    this.stop();
    this.active = true;
    this.diagramId = diagram._id;
    this.graph = simulationGraph(this.app.project(), diagram);
    this.analysis = null;
    this.seed = 1;
    this.reset();
  }

  /** Back to the start (a new seed after a finished run, so the next run may take other paths). */
  reset({ nextSeed = false } = {}) {
    this.pause();
    if (nextSeed) this.seed += 1;
    this.sim = createSimulation(this.graph, { seed: this.seed });
    this.moving = [];
    this.renderBar();
    this.paint();
  }

  stop() {
    this.pause();
    this.active = false;
    this.analysis = null;
    this.bar?.remove();
    this.bar = null;
    this.view?.drawSimulation?.(null);
  }

  /** The diagram changed or another one opened: a simulation of another diagram ends. */
  diagramChanged() {
    if (!this.active) return;
    if (this.app.diagram()?._id !== this.diagramId) { this.stop(); return; }
    if (!this.bar?.isConnected) this.renderBar();
    this.paint();
  }

  play() {
    if (!this.active) return;
    if (this.sim.status !== 'running') this.reset({ nextSeed: true });
    this.playing = true;
    this.renderBar();
    this.advance();
  }

  pause() {
    this.playing = false;
    if (this.animation) { cancelAnimationFrame(this.animation); this.animation = null; }
    if (this.bar) this.renderBar();
  }

  /** One step, animated; while playing the next follows. */
  advance() {
    if (!this.active || this.sim.status !== 'running') { this.playing = false; this.renderBar(); return; }
    const moves = stepSimulation(this.sim);
    this.moving = moves;
    const started = performance.now();
    const duration = STEP_MS / this.speed;
    const frame = (now) => {
      const t = Math.min(1, (now - started) / duration);
      this.paint(t);
      if (t < 1) { this.animation = requestAnimationFrame(frame); return; }
      this.animation = null;
      this.moving = [];
      this.paint();
      this.renderBar();
      if (this.playing && this.sim.status === 'running') this.animation = requestAnimationFrame(() => this.advance());
      else if (this.playing) { this.playing = false; this.renderBar(); }
    };
    this.animation = requestAnimationFrame(frame);
  }

  step() {
    if (!this.active || this.animation) return;
    if (this.sim.status !== 'running') this.reset({ nextSeed: true });
    this.advance();
  }

  analyse() {
    if (!this.active) return;
    this.pause();
    this.analysis = analyseSimulation(this.graph, { runs: 100 });
    this.renderBar();
    this.paint();
    const a = this.analysis;
    this.app.notify(a.deadlock || a.limit || a.unreached.length ? 'warning' : 'success', this.app.t('sim.analysed', { completed: a.completed, deadlock: a.deadlock, limit: a.limit, unreached: a.unreached.length }));
  }

  setSpeed(value) { this.speed = SPEEDS.includes(value) ? value : 1; this.renderBar(); }

  /** The current frame on the canvas (`t`: how far the moving tokens are along their flows). */
  paint(t = 1) {
    const view = this.view;
    if (!this.active || !view?.drawSimulation) return;
    const sim = this.sim;
    const tokens = [];
    const routeOf = (edgeId) => view.ctx?.routes.get(edgeId)?.points ?? null;
    const centerOf = (id) => { const b = view.boxOf(id); return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : null; };
    if (this.moving.length && t < 1) {
      for (const move of this.moving) { const p = pointAlong(routeOf(move.edgeId), t); if (p) tokens.push(p); }
    } else {
      for (const token of sim.tokens) { const p = centerOf(token.at); if (p) tokens.push(p); }
    }
    const waiting = new Map();
    for (const [id, held] of sim.waiting) waiting.set(id, [...held.values()].reduce((a, b) => a + b, 0));
    const a = this.analysis;
    view.drawSimulation({
      visited: new Set(sim.visits.keys()),
      active: new Set(sim.tokens.map((token) => token.at)),
      waiting,
      stuck: new Set(sim.stuckAt),
      unreached: new Set(a?.unreached ?? []),
      unusedFlows: new Set(a?.unusedFlows ?? []),
      percent: a ? new Map([...a.nodeRuns].map(([id, runs]) => [id, Math.round((runs / a.runs) * 100)])) : null,
      tokens,
    });
  }

  statusText() {
    const t = this.app.t;
    const sim = this.sim;
    if (this.analysis) {
      const a = this.analysis;
      return t('sim.analysis', { runs: a.runs, completed: a.completed, deadlock: a.deadlock, limit: a.limit, unreached: a.unreached.length, steps: a.averageSteps.toFixed(1) });
    }
    const key = { running: 'sim.running', completed: 'sim.completed', deadlock: 'sim.deadlock', limit: 'sim.limit', noStart: 'sim.noStart' }[sim.status];
    return t(key, { step: sim.step, tokens: sim.tokens.length, done: sim.completed + sim.implicitEnds, run: this.seed });
  }

  renderBar() {
    const view = this.view;
    if (!this.active || !view?.root) return;
    if (!this.bar || !this.bar.isConnected) {
      this.bar = document.createElement('div');
      this.bar.className = 'sim-bar';
      this.bar.setAttribute('role', 'toolbar');
      this.bar.addEventListener('click', (event) => this.onClick(event));
      this.bar.addEventListener('change', (event) => { if (event.target.matches('[data-sim-speed]')) this.setSpeed(Number(event.target.value)); });
      this.bar.addEventListener('pointerdown', (event) => event.stopPropagation());
      // Over the drawing area (below the ruler), not over the diagram-type tabs.
      (view.root.querySelector('.canvas-main') ?? view.root).append(this.bar);
    }
    const t = this.app.t;
    const b = (action, glyph, label, extra = '') => `<button class="icon-button" data-sim="${action}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" ${extra}>${icon(glyph)}</button>`;
    const sim = this.sim;
    const tone = this.analysis ? (this.analysis.deadlock || this.analysis.limit || this.analysis.unreached.length ? 'warning' : 'ok') : sim.status === 'completed' ? 'ok' : sim.status === 'running' ? '' : 'warning';
    this.bar.innerHTML = `<span class="sim-title">${icon('bpmnSimulate')}<b>${escapeHtml(t('sim.title'))}</b></span>`
      + (this.playing ? b('pause', 'pause', t('sim.pause')) : b('play', 'play', t('sim.play')))
      + b('step', 'stepForward', t('sim.step'), this.animation ? 'disabled' : '')
      + b('reset', 'refresh', t('sim.reset'))
      + `<label class="sim-speed" title="${escapeHtml(t('sim.speed'))}">${icon('speed')}<select data-sim-speed aria-label="${escapeHtml(t('sim.speed'))}">${SPEEDS.map((s) => `<option value="${s}" ${s === this.speed ? 'selected' : ''}>${s}×</option>`).join('')}</select></label>`
      + `<button class="button small" data-sim="analyse" title="${escapeHtml(t('sim.analyseTip'))}">${icon('reportData')}<span>${escapeHtml(t('sim.analyse'))}</span></button>`
      + `<span class="sim-status ${tone}" data-sim-status>${escapeHtml(this.statusText())}</span>`
      + b('close', 'close', t('sim.close'));
  }

  onClick(event) {
    const button = event.target.closest('[data-sim]');
    if (!button || button.disabled) return;
    switch (button.dataset.sim) {
      case 'play': this.play(); break;
      case 'pause': this.pause(); break;
      case 'step': this.step(); break;
      case 'reset': this.analysis = null; this.reset({ nextSeed: this.sim.status !== 'running' }); break;
      case 'analyse': this.analyse(); break;
      case 'close': this.stop(); break;
      default: break;
    }
  }
}
