// The simulation engine: one clock and one event list for three paradigms.
//
//  • Discrete-event flow: entities move through blocks (source → queue →
//    process → … → sink). Push with back-pressure: a block takes an entity only
//    when it has room (canAccept); a block that frees room asks its upstream
//    blocks to try again (requestRetry), so blocking and starving emerge.
//  • System dynamics: stocks, flows and variables integrated every sdDt
//    (Euler or RK4); equations can read discrete-event metrics and vice versa.
//  • Agent-based: populations of agents that move in their area and change
//    state by rates, timeouts, contacts with other agents or conditions.
//
// No DOM: the app animates it frame by frame (runUntil), experiments and the
// tests run it headless as fast as possible.
import { BLOCK_TYPES, baseOf, isSd, pathLength, pathPoints, pointAlong, portsOf } from './blocks.js';
import { compile } from './expr.js';
import { createRandom, distMean, listOf, sample } from './random.js';

// ───────────────────────── event list (binary heap)

class EventHeap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  peek() { return this.a[0]; }
  push(ev) {
    const a = this.a; a.push(ev);
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (less(a[p], a[i])) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  pop() {
    const a = this.a; const top = a[0]; const last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) {
        const l = 2 * i + 1; const r = l + 1; let m = i;
        if (l < a.length && less(a[l], a[m])) m = l;
        if (r < a.length && less(a[r], a[m])) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
}
const less = (x, y) => (x.time < y.time || (x.time === y.time && x.seq < y.seq));

// ───────────────────────── statistics

/** A value that holds over time (queue length, busy servers): time-weighted mean, min, max. */
export class TimeStat {
  constructor(now = 0, value = 0) { this.reset(now, value); }
  reset(now, value = this.value ?? 0) { this.value = value; this.last = now; this.start = now; this.area = 0; this.max = value; this.min = value; }
  set(now, value) { this.area += this.value * (now - this.last); this.last = now; this.value = value; if (value > this.max) this.max = value; if (value < this.min) this.min = value; }
  add(now, delta) { this.set(now, this.value + delta); }
  mean(now) { const span = now - this.start; return span > 0 ? (this.area + this.value * (now - this.last)) / span : this.value; }
}

/** Observations (waiting times, cycle times): count, mean, sd, min, max. */
export class Tally {
  constructor() { this.reset(); }
  reset() { this.n = 0; this.sum = 0; this.sq = 0; this.min = Infinity; this.max = -Infinity; }
  add(x) { this.n += 1; this.sum += x; this.sq += x * x; if (x < this.min) this.min = x; if (x > this.max) this.max = x; }
  get mean() { return this.n ? this.sum / this.n : 0; }
  get sd() { return this.n > 1 ? Math.sqrt(Math.max(0, (this.sq - (this.sum * this.sum) / this.n) / (this.n - 1))) : 0; }
}

const num = (v, fallback = 0) => { const n = Number(v); return Number.isFinite(n) ? n : fallback; };
const capOf = (v) => { const n = Math.round(num(v)); return n > 0 ? n : Infinity; };

// ───────────────────────── runtime blocks

class Node {
  constructor(sim, block) {
    this.sim = sim; this.block = block; this.id = block.id; this.name = block.name; this.type = block.type; this.base = baseOf(block.type); this.p = block.props;
    this.outs = []; this.ups = new Set(); this.rr = [];
    this.countIn = 0; this.countOut = 0;
    this.contents = new TimeStat(0, 0);
    const ports = portsOf(block);
    this.inPorts = ports.ins; this.outPorts = ports.outs;
  }
  get now() { return this.sim.now; }
  start() {}
  canAccept() { return false; }
  accept() {}
  retry() { this.notifyUp(); }
  notifyUp() { for (const u of this.ups) this.sim.requestRetry(u); }
  resetStats(now) { this.countIn = 0; this.countOut = 0; this.contents.reset(now); }
  enter(e) { this.countIn += 1; e.at = this.id; e.since = this.now; }
  /** Moves e out through `port` if a downstream block takes it; true when it left. */
  forward(e, port = 0) {
    const target = this.sim.findTarget(this, e, port);
    if (!target) return false;
    this.countOut += 1;
    this.sim.deliver(e, target);
    return true;
  }
  metric(name) {
    if (name === 'count') return this.countOut;
    if (name === 'contents') return this.contents.value;
    return NaN;
  }
  summary(now) { return { in: this.countIn, out: this.countOut, contentsMean: this.contents.mean(now), contentsMax: this.contents.max }; }
  /** Fills `push(entity, x, y, z, heading)` for every entity this block holds (animation). */
  positions() {}
  /** Where the block is in the world. */
  get x() { return this.block.x; }
  get y() { return this.block.y; }
  local(lx, ly) {
    const r = ((this.block.rot ?? 0) * Math.PI) / 180;
    return [this.block.x + lx * Math.cos(r) - ly * Math.sin(r), this.block.y + lx * Math.sin(r) + ly * Math.cos(r)];
  }
  get w() { return this.block.w ?? BLOCK_TYPES[this.type].w; }
  get h() { return this.block.h ?? BLOCK_TYPES[this.type].h; }
  /** Lays out n items in a grid inside the block (servers, buffers). */
  gridSpot(i, n, spacing = 0.8) {
    const cols = Math.max(1, Math.min(n, Math.floor(this.w / spacing)));
    const rows = Math.ceil(n / cols);
    const c = i % cols; const r = Math.floor(i / cols);
    return this.local((c - (cols - 1) / 2) * Math.min(spacing, this.w / cols), (r - (rows - 1) / 2) * Math.min(spacing, this.h / Math.max(rows, 1)));
  }
}

class SourceNode extends Node {
  constructor(sim, block) {
    super(sim, block);
    this.pending = []; this.arrivals = 0; this.lost = 0;
    const types = Array.isArray(this.p.types) && this.p.types.length ? this.p.types : [{ name: 'Part', color: '#3b82f6', weight: 1 }];
    this.types = types; this.weights = types.map((t) => num(t.weight, 1));
  }
  start() {
    const first = num(this.p.firstAt);
    if (first > 0) this.sim.at(first, () => this.arrive());
    else this.scheduleNext();
  }
  rateAt(t) {
    if (this.p.arrivalMode === 'schedule') {
      const period = Math.max(1e-9, num(this.p.period, 1440));
      const phase = t % period;
      const row = (this.p.schedule ?? []).find((r) => phase >= num(r.start) && phase < num(r.end));
      return row ? Math.max(0, num(row.value)) : 0;
    }
    return Math.max(0, num(this.sim.evalExpr(this.p.rate)));
  }
  scheduleNext() {
    if (num(this.p.maxArrivals) > 0 && this.arrivals >= num(this.p.maxArrivals)) return;
    const mode = this.p.arrivalMode;
    if (mode === 'interval') { this.sim.after(this.sim.sample(this.p.interarrival), () => this.arrive()); return; }
    if (mode === 'rate') {
      const rate = this.rateAt(this.now);
      if (rate <= 0) { this.sim.after(this.sim.pollStep, () => this.scheduleNext()); return; }
      this.sim.after(this.sim.random.exponential(1 / rate), () => this.arrive());
      return;
    }
    // Schedule: a non-homogeneous Poisson process by thinning with the highest rate of the table.
    const max = Math.max(0, ...(this.p.schedule ?? []).map((r) => num(r.value)));
    if (max <= 0) return;
    let t = this.now;
    for (let guard = 0; guard < 100000; guard++) {
      t += this.sim.random.exponential(1 / max);
      if (this.sim.random.next() * max <= this.rateAt(t)) { this.sim.at(t, () => this.arrive()); return; }
      if (t > this.sim.end) return;
    }
  }
  arrive() {
    const n = Math.max(1, Math.round(num(this.p.batchSize, 1)));
    for (let i = 0; i < n; i++) {
      if (num(this.p.maxArrivals) > 0 && this.arrivals >= num(this.p.maxArrivals)) break;
      const type = this.types[this.sim.random.pick(this.weights)];
      const e = this.sim.createEntity({ type: type.name, color: type.color, shape: this.p.shape, priority: num(this.p.priority) });
      this.arrivals += 1; this.countIn += 1;
      e.at = this.id; e.since = this.now;
      this.pending.push(e);
    }
    this.flush();
    if (this.p.onBlocked === 'drop' && this.pending.length) {
      for (const e of this.pending) { this.lost += 1; this.sim.destroy(e, 'lost'); }
      this.pending = [];
    }
    this.contents.set(this.now, this.pending.length);
    this.scheduleNext();
  }
  flush() {
    while (this.pending.length) {
      if (!this.forward(this.pending[0], 0)) break;
      this.pending.shift();
    }
    this.contents.set(this.now, this.pending.length);
  }
  retry() { this.flush(); }
  metric(name) { if (name === 'count') return this.arrivals; return super.metric(name); }
  summary(now) { return { ...super.summary(now), arrivals: this.arrivals, lost: this.lost, waiting: this.pending.length }; }
  resetStats(now) { super.resetStats(now); this.arrivals = 0; this.lost = 0; }
  positions(push) { this.pending.forEach((e, i) => { const [x, y] = this.local(this.w / 2 - 0.4 - (i % 6) * 0.7, -this.h / 2 + 0.5 + Math.floor(i / 6) * 0.6); push(e, x, y, 0); }); }
}

class SinkNode extends Node {
  constructor(sim, block) { super(sim, block); this.cycle = new Tally(); this.byType = new Map(); }
  canAccept() { return true; }
  accept(e) {
    this.enter(e);
    if (e.created >= this.sim.warmupAt || this.sim.warmupAt <= 0) {
      const ct = this.now - e.created;
      this.cycle.add(ct);
      if (!this.byType.has(e.type)) this.byType.set(e.type, new Tally());
      this.byType.get(e.type).add(ct);
    }
    this.countOut += 1;
    this.sim.sinkCount += 1;
    this.sim.destroy(e, 'sink');
  }
  metric(name) {
    if (name === 'cycleTime') return this.cycle.mean;
    if (name === 'throughput') { const span = this.now - this.sim.statsFrom; return span > 0 ? this.countOut / span : 0; }
    return super.metric(name);
  }
  resetStats(now) { super.resetStats(now); this.cycle.reset(); this.byType.clear(); }
  summary(now) {
    const span = now - this.sim.statsFrom;
    return { ...super.summary(now), cycleMean: this.cycle.mean, cycleSd: this.cycle.sd, cycleMin: this.cycle.n ? this.cycle.min : 0, cycleMax: this.cycle.n ? this.cycle.max : 0, throughput: span > 0 ? this.countOut / span : 0, byType: Object.fromEntries([...this.byType].map(([k, t]) => [k, { n: t.n, mean: t.mean }])) };
  }
}

class QueueNode extends Node {
  constructor(sim, block) { super(sim, block); this.items = []; this.wait = new Tally(); this.reneged = 0; this.cap = capOf(this.p.capacity); }
  propChanged(prop) { if (prop === 'capacity') this.cap = capOf(this.p.capacity); }
  canAccept() { return this.items.length < this.cap; }
  accept(e) {
    this.enter(e);
    e.qEnter = this.now;
    this.items.push(e);
    this.contents.set(this.now, this.items.length);
    if (num(this.p.timeout) > 0) {
      const at = this.now + num(this.p.timeout);
      e.renege = this.sim.at(at, () => this.timeout(e));
    }
    this.pump();
  }
  timeout(e) {
    const i = this.items.indexOf(e);
    if (i < 0) return;
    const target = this.sim.findTarget(this, e, 1);
    this.items.splice(i, 1);
    this.reneged += 1;
    this.contents.set(this.now, this.items.length);
    this.sim.log(this, 'renege', { type: e.type });
    if (target) this.sim.deliver(e, target); else this.sim.destroy(e, 'renege');
    this.notifyUp();
  }
  pick() {
    if (!this.items.length) return -1;
    switch (this.p.discipline) {
      case 'lifo': return this.items.length - 1;
      case 'priority': { let best = 0; for (let i = 1; i < this.items.length; i++) if (this.items[i].priority > this.items[best].priority) best = i; return best; }
      case 'random': return Math.floor(this.sim.random.next() * this.items.length);
      default: return 0;
    }
  }
  pump() {
    let moved = false;
    for (;;) {
      const i = this.pick();
      if (i < 0) break;
      const e = this.items[i];
      const target = this.sim.findTarget(this, e, 0);
      if (!target) break;
      this.items.splice(i, 1);
      if (e.renege) { e.renege.cancelled = true; e.renege = null; }
      this.wait.add(this.now - e.qEnter);
      this.contents.set(this.now, this.items.length);
      this.countOut += 1;
      this.sim.deliver(e, target);
      moved = true;
    }
    if (moved) this.notifyUp();
  }
  retry() { this.pump(); }
  metric(name) {
    if (name === 'length') return this.items.length;
    if (name === 'waitTime') return this.wait.mean;
    return super.metric(name);
  }
  resetStats(now) { super.resetStats(now); this.wait.reset(); this.reneged = 0; }
  summary(now) { return { ...super.summary(now), lengthMean: this.contents.mean(now), lengthMax: this.contents.max, waitMean: this.wait.mean, waitMax: this.wait.n ? this.wait.max : 0, reneged: this.reneged }; }
  positions(push) {
    const n = this.items.length;
    const per = Math.max(1, Math.floor((this.w - 0.4) / 0.7));
    // The head of the line sits at the output end.
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / per); const col = i % per;
      const [x, y] = this.local(this.w / 2 - 0.4 - col * 0.7, (row % 2 ? 0.3 : -0.3) * Math.min(1, Math.floor((n - 1) / per)));
      push(this.items[i], x, y, row >= 2 ? 0.6 * Math.floor(row / 2) : 0);
    }
  }
}

/** Process, delay, robot and dock: parallel servers, an optional resource pool, setups, rejects and breakdowns. */
class ProcessNode extends Node {
  constructor(sim, block) {
    super(sim, block);
    const base = baseOf(block.type);
    const unlimited = base === 'delay' && !(num(this.p.capacity) > 0);
    this.cap = base === 'robot' ? 1 : base === 'dock' ? Math.max(1, Math.round(num(this.p.doors, 1))) : unlimited ? Infinity : Math.max(1, Math.round(num(this.p.capacity, 1)));
    this.servers = []; // { e, state: 'busy'|'blocked', end, ev, remaining, port }
    // An event changed the capacity.
    this.propChanged = (prop) => {
      if (prop !== 'capacity' && prop !== 'doors') return;
      const b2 = baseOf(this.type);
      if (b2 === 'robot') return;
      this.cap = b2 === 'dock' ? Math.max(1, Math.round(num(this.p.doors, 1))) : b2 === 'delay' && !(num(this.p.capacity) > 0) ? Infinity : Math.max(1, Math.round(num(this.p.capacity, 1)));
    };
    this.busy = new TimeStat(0, 0); this.blocked = new TimeStat(0, 0); this.down = new TimeStat(0, 0); this.setupStat = new TimeStat(0, 0);
    this.failed = false; this.lastType = null; this.rejects = 0; this.failures = 0;
    this.time = new Tally();
    this.poolNode = null; this.units = Math.max(1, Math.round(num(this.p.units, 1)));
    this.timeline = [];
  }
  start() {
    if (this.p.pool) { this.poolNode = this.sim.byName.get(this.p.pool) ?? null; this.poolNode?.waiters.add(this); }
    if (this.p.failures) this.scheduleFailure();
  }
  mark(state) {
    if (this.timeline.length > 4000) this.timeline.splice(0, 1000);
    const last = this.timeline[this.timeline.length - 1];
    if (!last || last[1] !== state) this.timeline.push([this.now, state]);
  }
  state() { if (this.failed) return 'failed'; if (this.servers.some((s) => s.state === 'busy')) return 'busy'; if (this.servers.length) return 'blocked'; return 'idle'; }
  updateStats() {
    const busy = this.servers.filter((s) => s.state === 'busy').length;
    this.busy.set(this.now, busy);
    this.blocked.set(this.now, this.servers.length - busy);
    this.contents.set(this.now, this.servers.length);
    this.mark(this.state());
  }
  canAccept() {
    if (this.failed || this.servers.length >= this.cap) return false;
    if (this.p.pool) return Boolean(this.poolNode) && this.poolNode.available >= this.units;
    return true;
  }
  accept(e) {
    this.enter(e);
    if (this.poolNode) { this.poolNode.seize(this.units, this); e.poolHeld = this.units; }
    let t = this.sim.sample(this.p.time);
    if (num(this.p.setup) > 0 && this.lastType !== null && this.lastType !== e.type) t += num(this.p.setup);
    this.lastType = e.type;
    const server = { e, state: 'busy', end: this.now + t, ev: null, port: 0, slot: this.freeSlot() };
    this.servers.push(server);
    if (!this.failed) server.ev = this.sim.at(server.end, () => this.finish(server));
    this.time.add(t);
    this.updateStats();
  }
  freeSlot() { const used = new Set(this.servers.map((s) => s.slot)); let i = 0; while (used.has(i)) i += 1; return i; }
  finish(server) {
    server.ev = null;
    if (this.poolNode && server.e.poolHeld) { this.poolNode.release(server.e.poolHeld, this); server.e.poolHeld = 0; }
    server.state = 'blocked';
    if (num(this.p.defectRate) > 0 && this.sim.random.next() < num(this.p.defectRate)) {
      this.rejects += 1;
      server.port = 1;
      if (!this.sim.hasOutput(this, 1)) { this.drop(server, 'reject'); return; }
    }
    this.updateStats();
    this.tryLeave(server);
  }
  drop(server, why) {
    this.servers.splice(this.servers.indexOf(server), 1);
    this.sim.destroy(server.e, why);
    this.updateStats();
    this.notifyUp();
  }
  tryLeave(server) {
    if (!this.forward(server.e, server.port)) return false;
    this.servers.splice(this.servers.indexOf(server), 1);
    this.updateStats();
    this.notifyUp();
    return true;
  }
  retry() {
    for (const s of this.servers.filter((x) => x.state === 'blocked')) this.tryLeave(s);
    if (!this.failed && this.servers.length < this.cap) this.notifyUp();
  }
  goDown(kind) {
    this.failed = true;
    this.down.set(this.now, 1);
    for (const s of this.servers) if (s.ev) { s.ev.cancelled = true; s.ev = null; s.remaining = Math.max(0, s.end - this.now); }
    this.sim.log(this, kind);
    this.mark('failed');
  }
  goUp(kind) {
    this.failed = false;
    this.down.set(this.now, 0);
    for (const s of this.servers) if (s.state === 'busy' && s.remaining != null) { s.end = this.now + s.remaining; s.remaining = null; s.ev = this.sim.at(s.end, () => this.finish(s)); }
    this.sim.log(this, kind);
    this.updateStats();
    this.notifyUp();
  }
  scheduleFailure() {
    this.sim.after(this.sim.sample(this.p.mtbf), () => {
      if (this.failed) { this.scheduleFailure(); return; }
      this.failures += 1;
      this.goDown('failure');
      this.sim.after(this.sim.sample(this.p.mttr), () => { this.goUp('repair'); this.scheduleFailure(); });
    });
  }
  /** Planned downtime (maintenance blocks); false when it is down already. */
  forceDown(duration, kind = 'maintenance') {
    if (this.failed) return false;
    this.maintenances = (this.maintenances ?? 0) + 1;
    this.goDown(kind);
    this.sim.after(duration, () => this.goUp('maintenanceDone'));
    return true;
  }
  utilization(now) { return this.cap === Infinity ? 0 : this.busy.mean(now) / this.cap; }
  metric(name) {
    if (name === 'utilization') return this.cap === Infinity ? 0 : this.busy.mean(this.now) / this.cap;
    if (name === 'busy') return this.busy.value;
    return super.metric(name);
  }
  resetStats(now) { super.resetStats(now); for (const st of [this.busy, this.blocked, this.down, this.setupStat]) st.reset(now); this.rejects = 0; this.failures = 0; this.time.reset(); }
  summary(now) {
    const span = Math.max(1e-9, now - this.sim.statsFrom);
    const cap = this.cap === Infinity ? Math.max(1, this.contents.max) : this.cap;
    return {
      ...super.summary(now), utilization: this.busy.mean(now) / cap, blockedShare: this.blocked.mean(now) / cap, downShare: this.down.mean(now), idleShare: Math.max(0, 1 - (this.busy.mean(now) + this.blocked.mean(now)) / cap - this.down.mean(now)),
      processMean: this.time.mean, rejects: this.rejects, failures: this.failures, capacity: this.cap, cost: num(this.p.cost) * this.busy.mean(now) * span,
    };
  }
  positions(push) {
    const n = this.cap === Infinity ? Math.max(1, this.servers.length) : this.cap;
    for (const s of this.servers) { const [x, y] = this.gridSpot(s.slot, n, 0.9); push(s.e, x, y, this.base === 'delay' ? 0 : 0.9); }
  }
}

class PoolNode extends Node {
  constructor(sim, block) {
    super(sim, block);
    this.capacity = Math.max(1, Math.round(num(this.p.capacity, 1)));
    this.inUse = 0; this.waiters = new Set();
    this.busyStat = new TimeStat(0, 0); this.capStat = new TimeStat(0, this.capacity);
    this.units = []; // { node: id|null }
    this.syncUnits();
  }
  get available() { return this.capacity - this.inUse; }
  start() {
    if (this.p.shifts && (this.p.schedule ?? []).length) this.applyShift();
  }
  applyShift() {
    const period = Math.max(1e-9, num(this.p.period, 1440));
    const phase = this.now % period;
    const rows = this.p.schedule ?? [];
    const row = rows.find((r) => phase >= num(r.start) && phase < num(r.end));
    this.setCapacity(row ? Math.max(0, Math.round(num(row.value))) : 0);
    // Next change: the nearest row boundary after now.
    const bounds = rows.flatMap((r) => [num(r.start), num(r.end)]).map((b) => (b > phase + 1e-9 ? b - phase : b + period - phase)).filter((d) => d > 1e-9);
    this.sim.after(bounds.length ? Math.min(...bounds) : period, () => this.applyShift());
  }
  propChanged(prop) { if (prop === 'capacity') this.setCapacity(Math.max(0, Math.round(num(this.p.capacity, 1)))); }
  setCapacity(c) {
    this.capacity = c;
    this.capStat.set(this.now, c);
    this.syncUnits();
    if (this.available > 0) this.wake();
  }
  syncUnits() { while (this.units.length < Math.max(this.capacity, this.inUse)) this.units.push({ node: null }); while (this.units.length > Math.max(this.capacity, this.inUse) && this.units[this.units.length - 1].node == null) this.units.pop(); }
  seize(n, node) {
    this.inUse += n;
    this.busyStat.set(this.now, this.inUse);
    this.syncUnits();
    let left = n;
    for (const u of this.units) if (left > 0 && u.node == null) { u.node = node.id; left -= 1; }
  }
  release(n, node) {
    this.inUse = Math.max(0, this.inUse - n);
    this.busyStat.set(this.now, this.inUse);
    let left = n;
    for (const u of this.units) if (left > 0 && u.node === node.id) { u.node = null; left -= 1; }
    for (const u of this.units) if (left > 0 && u.node != null) { u.node = null; left -= 1; }
    this.syncUnits();
    this.wake();
  }
  wake() { for (const w of this.waiters) for (const u of w.ups) this.sim.requestRetry(u); for (const w of this.waiters) if (w.base === 'seize') this.sim.requestRetry(w); }
  metric(name) {
    if (name === 'utilization') return this.capStat.mean(this.now) > 0 ? this.busyStat.mean(this.now) / this.capStat.mean(this.now) : 0;
    if (name === 'busy') return this.inUse;
    if (name === 'idle') return Math.max(0, this.capacity - this.inUse);
    if (name === 'capacity') return this.capacity;
    return super.metric(name);
  }
  resetStats(now) { super.resetStats(now); this.busyStat.reset(now); this.capStat.reset(now); }
  summary(now) { const span = Math.max(1e-9, now - this.sim.statsFrom); const cap = this.capStat.mean(now); return { utilization: cap > 0 ? this.busyStat.mean(now) / cap : 0, busyMean: this.busyStat.mean(now), busyMax: this.busyStat.max, capacity: this.capacity, capacityMean: cap, cost: num(this.p.cost) * cap * span }; }
}

/** Pass-through blocks take an entity only when the next block takes it too (no waiting inside). */
class PassNode extends Node {
  constructor(sim, block) { super(sim, block); this.pending = null; }
  choosePort() { return 0; }
  canAccept(e) {
    if (!this.open(e)) return false;
    const port = this.choosePort(e);
    if (port < 0) return false;
    const target = this.sim.findTarget(this, e, port);
    if (!target) return false;
    this.pending = { e, target };
    return true;
  }
  open() { return true; }
  accept(e) {
    this.enter(e);
    this.apply(e);
    const target = this.pending?.e === e ? this.pending.target : this.sim.findTarget(this, e, this.choosePort(e));
    this.pending = null;
    this.countOut += 1;
    this.passed();
    if (target) this.sim.deliver(e, target); else this.sim.destroy(e, 'stuck');
  }
  apply() {}
  passed() {}
}

class SeizeNode extends PassNode {
  start() { this.poolNode = this.sim.byName.get(this.p.pool) ?? null; this.poolNode?.waiters.add(this); this.units = Math.max(1, Math.round(num(this.p.units, 1))); }
  open() { return Boolean(this.poolNode) && this.poolNode.available >= this.units; }
  apply(e) { this.poolNode.seize(this.units, this); e.held ??= {}; e.held[this.poolNode.name] = (e.held[this.poolNode.name] ?? 0) + this.units; }
}

class ReleaseNode extends PassNode {
  apply(e) {
    for (const [name, units] of Object.entries(e.held ?? {})) {
      if (this.p.pool && name !== this.p.pool) continue;
      const pool = this.sim.byName.get(name);
      pool?.release(units, { id: null });
      delete e.held[name];
    }
  }
}

class SelectNode extends PassNode {
  constructor(sim, block) {
    super(sim, block);
    this.n = Math.max(2, Math.round(num(this.p.outputs, 2)));
    this.weights = listOf(this.p.weights);
    this.typeMap = new Map(String(this.p.typeMap ?? '').split(/[,;]+/).map((s) => s.split(':').map((x) => x.trim())).filter((x) => x.length === 2).map(([k, v]) => [k, Math.max(0, Math.round(num(v, 1)) - 1)]));
    this.next = 0; this.byPort = new Array(this.n).fill(0);
  }
  choosePort(e) {
    e.sel ??= {};
    switch (this.p.mode) {
      case 'probability': if (e.sel[this.id] == null) e.sel[this.id] = this.sim.random.pick(Array.from({ length: this.n }, (_, i) => this.weights[i] ?? 1)); return e.sel[this.id];
      case 'type': return Math.min(this.n - 1, this.typeMap.get(e.type) ?? 0);
      case 'condition': return this.sim.evalEntity(this.p.condition, e) ? 0 : 1;
      case 'roundRobin': for (let k = 0; k < this.n; k++) { const port = (this.next + k) % this.n; if (this.sim.findTarget(this, e, port)) return port; } return -1;
      case 'shortest': {
        let best = -1; let bestLoad = Infinity;
        for (let port = 0; port < this.n; port++) { const target = this.sim.findTarget(this, e, port); if (!target) continue; const load = target.node.contents.value; if (load < bestLoad) { bestLoad = load; best = port; } }
        return best;
      }
      default: for (let port = 0; port < this.n; port++) if (this.sim.findTarget(this, e, port)) return port; return -1;
    }
  }
  accept(e) {
    const port = this.pending?.e === e ? this.pending.target.fromPort : this.choosePort(e);
    if (port >= 0 && port < this.n) this.byPort[port] += 1;
    if (this.p.mode === 'roundRobin') this.next = (port + 1) % this.n;
    if (e.sel) delete e.sel[this.id];
    super.accept(e);
  }
  resetStats(now) { super.resetStats(now); this.byPort.fill(0); }
  summary(now) { return { ...super.summary(now), byPort: [...this.byPort] }; }
}

class AssignNode extends PassNode {
  apply(e) {
    if (this.p.setType) e.type = String(this.p.setType);
    if (this.p.setColor) e.color = this.p.setColor;
    if (this.p.setShape) e.shape = this.p.setShape;
    if (String(this.p.setPriority ?? '').trim() !== '') e.priority = num(this.sim.evalEntity(this.p.setPriority, e));
  }
}

class GateNode extends PassNode {
  constructor(sim, block) {
    super(sim, block);
    this.signal = baseOf(block.type) === 'signal';
    this.isOpen = this.signal ? false : this.p.mode !== 'closed';
    this.phase = 'red'; this.nextAllowed = 0;
    this.openStat = new TimeStat(0, this.isOpen ? 1 : 0);
  }
  start() {
    if (this.signal) {
      const offset = num(this.p.offset);
      this.setPhase('red');
      this.sim.after(offset, () => this.cycle('green'));
    } else if (this.p.mode === 'schedule') {
      this.setOpen(true);
      this.sim.after(num(this.p.openTime, 60), () => this.toggle());
    } else if (this.p.mode === 'condition') {
      this.poll();
    }
  }
  poll() { this.setOpen(Boolean(this.sim.evalExpr(this.p.condition))); this.sim.after(this.sim.pollStep, () => this.poll()); }
  /** An event sets `open` (1 = open, 0 = closed). */
  propChanged(prop) { if (prop === 'open' && !this.signal) this.setOpen(Boolean(num(this.p.open))); }
  toggle() {
    this.setOpen(!this.isOpen);
    this.sim.after(num(this.isOpen ? this.p.openTime : this.p.closedTime, 30) || this.sim.pollStep, () => this.toggle());
  }
  cycle(phase) {
    this.setPhase(phase);
    const next = phase === 'green' ? 'yellow' : phase === 'yellow' ? 'red' : 'green';
    const length = Math.max(1e-6, num(this.p[phase], 0.5));
    this.sim.after(length, () => this.cycle(next));
  }
  setPhase(phase) { this.phase = phase; this.setOpen(phase === 'green'); }
  setOpen(open) {
    const was = this.isOpen;
    this.isOpen = open;
    this.openStat.set(this.now, open ? 1 : 0);
    if (open && !was) this.notifyUp();
  }
  open() { return this.isOpen && this.now >= this.nextAllowed - 1e-12; }
  passed() {
    const headway = this.signal ? num(this.p.headway) : 0;
    if (headway > 0) { this.nextAllowed = this.now + headway; this.sim.after(headway, () => this.notifyUp()); }
  }
  retry() { if (this.isOpen) this.notifyUp(); }
  metric(name) { if (name === 'open') return this.isOpen ? 1 : 0; return super.metric(name); }
  resetStats(now) { super.resetStats(now); this.openStat.reset(now); }
  summary(now) { return { ...super.summary(now), openShare: this.openStat.mean(now) }; }
}

class CombineNode extends Node {
  constructor(sim, block) {
    super(sim, block);
    this.nIn = Math.max(2, Math.round(num(this.p.inputs, 2)));
    const q = listOf(this.p.quantities);
    this.q = Array.from({ length: this.nIn }, (_, i) => Math.max(1, Math.round(q[i] ?? 1)));
    this.buffers = Array.from({ length: this.nIn }, () => []);
    this.busy = false; this.working = []; this.out = null;
    this.busyStat = new TimeStat(0, 0);
  }
  canAccept(e, port) { return port < this.nIn && this.buffers[port].length < this.q[port]; }
  accept(e, port) { this.enter(e); this.buffers[port].push(e); this.count(); this.tryStart(); }
  count() { this.contents.set(this.now, this.buffers.reduce((s, b) => s + b.length, 0) + this.working.length + (this.out ? 1 : 0)); }
  tryStart() {
    if (this.busy || this.out || !this.buffers.every((b, i) => b.length >= this.q[i])) return;
    this.working = this.buffers.flatMap((b, i) => b.splice(0, this.q[i]));
    this.busy = true; this.busyStat.set(this.now, 1);
    this.count();
    this.notifyUp();
    this.sim.after(this.sim.sample(this.p.time), () => {
      const members = this.working; this.working = [];
      const created = Math.min(...members.map((m) => m.created));
      const product = this.sim.createEntity({ type: this.p.outType || 'Assembly', color: this.p.outColor || '#0d9488', shape: members[0]?.shape === 'pallet' ? 'pallet' : 'carton', created });
      for (const m of members) this.sim.destroy(m, 'assembled');
      product.at = this.id;
      this.busy = false; this.busyStat.set(this.now, 0);
      this.out = product;
      this.count();
      this.release();
    });
  }
  release() {
    if (this.out && this.forward(this.out, 0)) { this.out = null; this.count(); this.tryStart(); this.notifyUp(); }
  }
  retry() { this.release(); }
  metric(name) { if (name === 'utilization') return this.busyStat.mean(this.now); return super.metric(name); }
  resetStats(now) { super.resetStats(now); this.busyStat.reset(now); }
  summary(now) { return { ...super.summary(now), utilization: this.busyStat.mean(now), waiting: this.buffers.map((b) => b.length) }; }
  positions(push) {
    this.buffers.forEach((b, i) => b.forEach((e, k) => { const [x, y] = this.local(-this.w / 2 + 0.4 + (k % 3) * 0.45, -this.h / 2 + (this.h * (i + 1)) / (this.nIn + 1) + Math.floor(k / 3) * 0.3); push(e, x, y, 0.4); }));
    this.working.forEach((e, k) => { const [x, y] = this.local(0.1 + (k % 3) * 0.3, (Math.floor(k / 3) - 0.5) * 0.3); push(e, x, y, 0.8); });
    if (this.out) { const [x, y] = this.local(this.w / 2 - 0.4, 0); push(this.out, x, y, 0.4); }
  }
}

class BatchNode extends Node {
  constructor(sim, block) { super(sim, block); this.size = Math.max(2, Math.round(num(this.p.size, 2))); this.members = []; this.out = null; }
  canAccept() { return !this.out && this.members.length < this.size; }
  accept(e) {
    this.enter(e); this.members.push(e);
    if (this.members.length >= this.size) {
      const created = Math.min(...this.members.map((m) => m.created));
      const b = this.sim.createEntity({ type: this.p.outType || 'Batch', color: this.p.outColor || '#a16207', shape: this.p.shape || 'pallet', created });
      b.members = this.members; this.members = [];
      for (const m of b.members) this.sim.hide(m);
      b.at = this.id;
      this.out = b;
      this.release();
    }
    this.contents.set(this.now, this.members.length + (this.out ? 1 : 0));
  }
  release() { if (this.out && this.forward(this.out, 0)) { this.out = null; this.contents.set(this.now, this.members.length); this.notifyUp(); } }
  retry() { this.release(); }
  positions(push) { this.members.forEach((e, k) => { const [x, y] = this.gridSpot(k, this.size, 0.5); push(e, x, y, 0.3); }); if (this.out) { const [x, y] = this.local(this.w / 2 - 0.5, 0); push(this.out, x, y, 0.3); } }
}

class UnbatchNode extends Node {
  constructor(sim, block) { super(sim, block); this.queue = []; }
  canAccept() { return this.queue.length === 0; }
  accept(e) {
    this.enter(e);
    if (e.members?.length) { for (const m of e.members) { this.sim.show(m); m.at = this.id; } this.queue.push(...e.members); e.members = null; this.sim.destroy(e, 'unbatched'); } else this.queue.push(e);
    this.contents.set(this.now, this.queue.length);
    this.flush();
  }
  flush() {
    while (this.queue.length && this.forward(this.queue[0], 0)) this.queue.shift();
    this.contents.set(this.now, this.queue.length);
    if (!this.queue.length) this.notifyUp();
  }
  retry() { this.flush(); }
  positions(push) { this.queue.forEach((e, k) => { const [x, y] = this.gridSpot(k, Math.max(4, this.queue.length), 0.5); push(e, x, y, 0.3); }); }
}

/** Conveyors and roads: items move along a path at a speed, keep their spacing and pile up when the end is blocked. */
class ConveyorNode extends Node {
  constructor(sim, block) {
    super(sim, block);
    this.points = pathPoints(block);
    this.L = Math.max(0.1, pathLength(this.points));
    this.road = baseOf(block.type) === 'road';
    this.v = Math.max(1e-6, num(this.p.speed, 1));
    this.gap = Math.max(0.05, num(this.road ? this.p.vehicleLength : this.p.spacing, 1));
    this.nLanes = this.road ? Math.max(1, Math.round(num(this.p.lanes, 1))) : 1;
    this.lanes = Array.from({ length: this.nLanes }, () => ({ items: [], moving: true, frontEv: null }));
    this.capPerLane = Math.max(1, Math.floor(this.L / this.gap) + 1);
    this.transit = new Tally();
    this.accumulating = this.road || this.p.accumulating !== false;
  }
  pos(lane, i, now) {
    const it = lane.items[i];
    const free = it.s0 + (lane.moving || this.accumulating ? this.v * (now - it.t0) : 0);
    const limit = i === 0 ? this.L : this.pos(lane, i - 1, now) - this.gap;
    return Math.max(0, Math.min(free, limit));
  }
  entranceClear(lane) {
    if (!lane.items.length) return true;
    if (lane.items.length >= this.capPerLane) return false;
    return this.pos(lane, lane.items.length - 1, this.now) >= this.gap - 1e-9;
  }
  canAccept() { return this.lanes.some((lane) => this.entranceClear(lane)); }
  accept(e) {
    this.enter(e);
    e.cEnter = this.now;
    // Roads: the lane with the most room.
    const lane = this.lanes.filter((l) => this.entranceClear(l)).sort((a, b) => a.items.length - b.items.length)[0];
    lane.items.push({ e, s0: 0, t0: this.now });
    e.lane = this.lanes.indexOf(lane);
    this.contents.add(this.now, 1);
    if (lane.items.length === 1) this.scheduleFront(lane);
    this.scheduleClear(lane);
  }
  scheduleFront(lane) {
    if (lane.frontEv) { lane.frontEv.cancelled = true; lane.frontEv = null; }
    if (!lane.items.length) return;
    const it = lane.items[0];
    const s = this.pos(lane, 0, this.now);
    const dt = Math.max(0, (this.L - s) / this.v);
    lane.frontEv = this.sim.after(dt, () => { lane.frontEv = null; this.arrive(lane); });
  }
  scheduleClear(lane) {
    const last = lane.items[lane.items.length - 1];
    if (!last) return;
    const s = this.pos(lane, lane.items.length - 1, this.now);
    if (s >= this.gap) return;
    this.sim.after((this.gap - s) / this.v + 1e-9, () => this.notifyUp());
  }
  reanchor(lane) { const now = this.now; const ss = lane.items.map((_, i) => this.pos(lane, i, now)); lane.items.forEach((it, i) => { it.s0 = ss[i]; it.t0 = now; }); }
  arrive(lane) {
    const it = lane.items[0];
    if (!it) return;
    if (this.forward(it.e, 0)) {
      this.reanchor(lane);
      lane.items.shift();
      lane.moving = true;
      this.transit.add(this.now - it.e.cEnter);
      this.contents.add(this.now, -1);
      this.scheduleFront(lane);
      this.scheduleClear(lane);
      this.notifyUp();
    } else {
      it.blocked = true;
      if (!this.accumulating) { this.reanchor(lane); lane.moving = false; }
    }
  }
  retry() { for (const lane of this.lanes) if (lane.items[0]?.blocked && !lane.frontEv && this.pos(lane, 0, this.now) >= this.L - 1e-6) this.arrive(lane); }
  metric(name) { return super.metric(name); }
  resetStats(now) { super.resetStats(now); this.transit.reset(); }
  summary(now) { return { ...super.summary(now), transitMean: this.transit.mean, length: this.L, capacity: this.capPerLane * this.nLanes }; }
  positions(push) {
    const now = this.now;
    for (const [li, lane] of this.lanes.entries()) {
      const off = this.road ? (li - (this.nLanes - 1) / 2) * 3.5 : 0;
      lane.items.forEach((it, i) => {
        const s = this.pos(lane, i, now);
        const q = pointAlong(this.points, s);
        push(it.e, q.x - q.dy * off, q.y + q.dx * off, this.road ? 0 : 0.85, Math.atan2(q.dy, q.dx));
      });
    }
  }
}

/** A fleet of AGVs / forklifts that carries each entity from here to the next block. */
class TransporterNode extends Node {
  constructor(sim, block) {
    super(sim, block);
    this.waiting = [];
    this.speed = Math.max(1e-6, num(this.p.speed, 60));
    const n = Math.max(1, Math.round(num(this.p.fleet, 1)));
    this.vehicles = Array.from({ length: n }, (_, i) => { const [x, y] = this.gridSpot(i, n, 1.2); return { i, x, y, fx: x, fy: y, tx: x, ty: y, t0: 0, t1: 0, state: 'idle', load: null }; });
    this.home = this.vehicles.map((v) => [v.x, v.y]);
    this.busyStat = new TimeStat(0, 0); this.distance = 0;
  }
  canAccept() { return true; }
  accept(e) { this.enter(e); this.waiting.push(e); this.contents.set(this.now, this.waiting.length); this.dispatch(); }
  where(v) { const now = this.now; if (now >= v.t1 || v.t1 <= v.t0) return [v.tx, v.ty]; const f = (now - v.t0) / (v.t1 - v.t0); return [v.fx + (v.tx - v.fx) * f, v.fy + (v.ty - v.fy) * f]; }
  dist(ax, ay, bx, by) { return this.p.routing === 'straight' ? Math.hypot(bx - ax, by - ay) : Math.abs(bx - ax) + Math.abs(by - ay); }
  move(v, x, y, state, then) {
    const [cx, cy] = this.where(v);
    const d = this.dist(cx, cy, x, y);
    this.distance += d;
    Object.assign(v, { fx: cx, fy: cy, tx: x, ty: y, t0: this.now, t1: this.now + d / this.speed, state });
    if (v.ev) v.ev.cancelled = true;
    v.ev = this.sim.after(d / this.speed, () => { v.ev = null; v.x = x; v.y = y; then(); });
  }
  busyCount() { return this.vehicles.filter((v) => v.state !== 'idle' && v.state !== 'returning').length; }
  dispatch() {
    while (this.waiting.length) {
      const free = this.vehicles.filter((v) => v.state === 'idle' || v.state === 'returning');
      if (!free.length) break;
      const [px, py] = this.local(0, 0);
      free.sort((a, b) => { const [ax, ay] = this.where(a); const [bx, by] = this.where(b); return this.dist(ax, ay, px, py) - this.dist(bx, by, px, py); });
      const v = free[0]; const e = this.waiting.shift();
      this.contents.set(this.now, this.waiting.length);
      v.load = e;
      this.move(v, px, py, 'toPickup', () => {
        v.state = 'loading';
        this.sim.after(num(this.p.loadTime), () => {
          const dest = this.destination();
          this.move(v, dest[0], dest[1], 'carrying', () => {
            v.state = 'unloading';
            this.sim.after(num(this.p.unloadTime), () => { v.state = 'delivering'; this.deliver(v); });
          });
        });
      });
      this.busyStat.set(this.now, this.busyCount());
    }
  }
  destination() {
    const target = this.outs[0]?.[0];
    if (!target) return this.local(this.w, 0);
    const port = target.node.inPorts[target.port] ?? { x: target.node.x, y: target.node.y, nx: -1, ny: 0 };
    return [port.x + port.nx * 1.2, port.y + port.ny * 1.2];
  }
  deliver(v) {
    if (!v.load) return;
    if (!this.forward(v.load, 0)) { v.state = 'waitDrop'; return; }
    v.load = null;
    this.busyStat.set(this.now, this.busyCount());
    if (this.p.returnHome !== false) {
      const [hx, hy] = this.home[v.i];
      this.move(v, hx, hy, 'returning', () => { v.state = 'idle'; this.busyStat.set(this.now, this.busyCount()); this.dispatch(); });
    } else v.state = 'idle';
    this.busyStat.set(this.now, this.busyCount());
    this.dispatch();
  }
  retry() { for (const v of this.vehicles) if (v.state === 'waitDrop') { v.state = 'delivering'; this.deliver(v); } }
  metric(name) { if (name === 'utilization') return this.busyStat.mean(this.now) / this.vehicles.length; if (name === 'waiting') return this.waiting.length; return super.metric(name); }
  resetStats(now) { super.resetStats(now); this.busyStat.reset(now); this.distance = 0; }
  summary(now) { return { ...super.summary(now), utilization: this.busyStat.mean(now) / this.vehicles.length, distance: this.distance, fleet: this.vehicles.length, waitingNow: this.waiting.length }; }
  positions(push) {
    this.waiting.forEach((e, k) => { const [x, y] = this.local(-this.w / 2 + 0.4 + (k % 5) * 0.45, this.h / 2 - 0.3 - Math.floor(k / 5) * 0.45); push(e, x, y, 0); });
    for (const v of this.vehicles) if (v.load && v.state !== 'toPickup') { const [x, y] = this.where(v); push(v.load, x, y, 0.55); }
  }
  vehicleViews(out) {
    for (const v of this.vehicles) {
      const [x, y] = this.where(v);
      const heading = v.t1 > v.t0 ? Math.atan2(v.ty - v.fy, v.tx - v.fx) : (v.heading ?? 0);
      v.heading = heading;
      out.push({ id: `${this.id}:${v.i}`, block: this.id, kind: this.p.vehicle || 'agv', x, y, heading, state: v.state, loaded: Boolean(v.load) });
    }
  }
}

/** Racks and parking lots: places that hold each entity for a dwell time. */
class StoreNode extends Node {
  constructor(sim, block) {
    super(sim, block);
    this.parking = baseOf(block.type) === 'parking';
    this.cap = this.parking ? Math.max(1, Math.round(num(this.p.spaces, 1))) : Math.max(1, Math.round(num(this.p.bays, 1)) * Math.round(num(this.p.levels, 1)));
    this.cells = new Array(this.cap).fill(null);
    this.ready = [];
    this.dwell = new Tally();
  }
  canAccept() { return this.cells.some((c) => c == null); }
  accept(e) {
    this.enter(e);
    const free = this.cells.map((c, i) => (c == null ? i : -1)).filter((i) => i >= 0);
    const cell = this.p.policy === 'random' ? free[Math.floor(this.sim.random.next() * free.length)] : free[0];
    this.cells[cell] = e; e.cell = cell; e.stored = this.now;
    this.contents.add(this.now, 1);
    const t = num(this.p.storeTime) + this.sim.sample(this.p.dwell) + num(this.p.retrieveTime);
    this.sim.after(t, () => { this.ready.push(e); this.release(); });
  }
  release() {
    let moved = false;
    for (;;) {
      if (!this.ready.length) break;
      const i = this.p.policy === 'lifo' ? this.ready.length - 1 : 0;
      const e = this.ready[i];
      if (!this.forward(e, 0)) break;
      this.ready.splice(i, 1);
      this.cells[e.cell] = null;
      this.dwell.add(this.now - e.stored);
      this.contents.add(this.now, -1);
      moved = true;
    }
    if (moved) this.notifyUp();
  }
  retry() { this.release(); }
  metric(name) { if (name === 'fill') return this.contents.value / this.cap; return super.metric(name); }
  resetStats(now) { super.resetStats(now); this.dwell.reset(); }
  summary(now) { return { ...super.summary(now), capacity: this.cap, fillMean: this.contents.mean(now) / this.cap, dwellMean: this.dwell.mean }; }
  cellSpot(i) {
    if (this.parking) {
      const cols = Math.max(1, Math.round(Math.sqrt(this.cap * (this.w / Math.max(1, this.h)) / 1.8)));
      const rows = Math.ceil(this.cap / cols);
      const c = i % cols; const r = Math.floor(i / cols);
      const [x, y] = this.local(-this.w / 2 + (this.w * (c + 0.5)) / cols, -this.h / 2 + (this.h * (r + 0.5)) / rows);
      return [x, y, 0];
    }
    const bays = Math.max(1, Math.round(num(this.p.bays, 1))); const levels = Math.max(1, Math.round(num(this.p.levels, 1)));
    const bay = i % bays; const level = Math.floor(i / bays) % levels;
    const [x, y] = this.local(-this.w / 2 + (this.w * (bay + 0.5)) / bays, 0);
    return [x, y, 0.15 + level * 1.0, level];
  }
  positions(push) { this.cells.forEach((e, i) => { if (!e) return; const [x, y, z] = this.cellSpot(i); push(e, x, y, z, this.parking ? Math.PI / 2 : 0); }); }
}

// ───────────────────────── system dynamics

class SdSystem {
  constructor(sim, blocks, links) {
    this.sim = sim;
    this.stocks = new Map(); this.flows = new Map(); this.vars = new Map(); this.params = new Map(); this.lookups = new Map(); this.smooths = new Map();
    for (const b of blocks) {
      const base = baseOf(b.type);
      if (base === 'stock') this.stocks.set(b.name, { b, value: 0, inflows: [], outflows: [], nonNeg: b.props.nonNegative !== false, cap: num(b.props.capacity) > 0 ? num(b.props.capacity) : Infinity });
      if (base === 'flow') this.flows.set(b.name, { b, expr: compile(b.props.equation), rate: 0, open: num(b.props.openTime), closed: num(b.props.closedTime) });
      if (base === 'variable') this.vars.set(b.name, { b, expr: compile(b.props.equation), value: 0 });
      if (base === 'parameter') this.params.set(b.name, { b, value: num(b.props.value) });
      if (base === 'lookup') this.lookups.set(b.name, { b, input: compile(b.props.input), xs: listOf(b.props.xs), ys: listOf(b.props.ys), value: 0 });
      if (base === 'smooth') this.smooths.set(b.name, { b, input: compile(b.props.input), delay: Math.max(1e-6, num(b.props.delay, 1)), value: 0 });
    }
    const byId = new Map(blocks.map((b) => [b.id, b]));
    for (const l of links) {
      if (l.kind !== 'flow') continue;
      const a = byId.get(l.from.block); const c = byId.get(l.to.block);
      if (baseOf(a?.type) === 'stock' && baseOf(c?.type) === 'flow') this.stocks.get(a.name)?.outflows.push(c.name);
      if (baseOf(a?.type) === 'flow' && baseOf(c?.type) === 'stock') this.stocks.get(c.name)?.inflows.push(a.name);
    }
    this.override = null;
    this.evaluating = new Set();
    this.history = [];
  }
  get active() { return this.stocks.size + this.flows.size + this.vars.size + this.params.size + this.lookups.size + this.smooths.size > 0; }
  has(name) { return this.stocks.has(name) || this.flows.has(name) || this.vars.has(name) || this.params.has(name) || this.lookups.has(name) || this.smooths.has(name); }
  value(name) {
    if (this.override?.has(name)) return this.override.get(name);
    const st = this.stocks.get(name); if (st) return st.value;
    const pr = this.params.get(name); if (pr) return pr.value;
    const sm = this.smooths.get(name); if (sm) return sm.value;
    const lk = this.lookups.get(name);
    if (lk) {
      if (this.evaluating.has(name)) return 0;
      this.evaluating.add(name);
      try { return interpolate(lk.xs, lk.ys, num(lk.input.eval((n) => this.sim.lookup(n), { time: this.sim.now, random: this.sim.random }))); } finally { this.evaluating.delete(name); }
    }
    const f = this.flows.get(name) ?? this.vars.get(name);
    if (!f) return 0;
    if (this.evaluating.has(name)) { this.sim.log(null, 'sdLoop', { name }); return 0; }
    this.evaluating.add(name);
    try {
      // A valve (flow with an open / closed cycle) passes nothing while closed.
      if (f.open > 0 && f.closed > 0 && (this.sim.now % (f.open + f.closed)) >= f.open) return 0;
      return num(f.expr.eval((n) => this.sim.lookup(n), { time: this.sim.now, random: this.sim.random }));
    } finally { this.evaluating.delete(name); }
  }
  init() {
    for (const [, st] of this.stocks) st.value = Math.min(st.cap, num(compile(st.b.props.initial).eval((n) => this.sim.lookup(n), { time: 0, random: this.sim.random })));
    for (const [, sm] of this.smooths) {
      const init = String(sm.b.props.initial ?? '').trim();
      sm.value = num((init ? compile(init) : sm.input).eval((n) => this.sim.lookup(n), { time: 0, random: this.sim.random }));
    }
    this.refresh();
  }
  refresh() { for (const [name, f] of this.flows) f.rate = this.value(name); for (const [name, v] of this.vars) v.value = this.value(name); for (const [name, l] of this.lookups) l.value = this.value(name); }
  derivative() {
    const d = new Map();
    const rates = new Map([...this.flows.keys()].map((name) => [name, this.value(name)]));
    for (const [name, st] of this.stocks) d.set(name, st.inflows.reduce((s, f) => s + (rates.get(f) ?? 0), 0) - st.outflows.reduce((s, f) => s + (rates.get(f) ?? 0), 0));
    return d;
  }
  step(dt) {
    const names = [...this.stocks.keys()];
    if (this.sim.model.settings.sdMethod === 'rk4') {
      const base = new Map(names.map((n) => [n, this.stocks.get(n).value]));
      const at = (k, h) => { this.override = new Map(names.map((n) => [n, base.get(n) + (k ? h * k.get(n) : 0)])); const d = this.derivative(); this.override = null; return d; };
      const k1 = at(null, 0); const k2 = at(k1, dt / 2); const k3 = at(k2, dt / 2); const k4 = at(k3, dt);
      for (const n of names) this.stocks.get(n).value = base.get(n) + (dt / 6) * (k1.get(n) + 2 * k2.get(n) + 2 * k3.get(n) + k4.get(n));
    } else {
      const d = this.derivative();
      for (const n of names) this.stocks.get(n).value += dt * d.get(n);
    }
    for (const st of this.stocks.values()) { if (st.nonNeg && st.value < 0) st.value = 0; if (st.value > st.cap) { st.value = st.cap; st.full = true; } else st.full = false; }
    // First-order smoothing (exponential delay): d(s)/dt = (input − s) / delay.
    const targets = [...this.smooths.values()].map((sm) => [sm, num(sm.input.eval((n) => this.sim.lookup(n), { time: this.sim.now, random: this.sim.random }))]);
    for (const [sm, input] of targets) sm.value += (dt * (input - sm.value)) / sm.delay;
    this.refresh();
  }
}

// ───────────────────────── agents

class PopulationNode extends Node {
  constructor(sim, block) {
    super(sim, block);
    this.states = (this.p.states ?? []).map((s) => ({ name: String(s.name), color: s.color || '#64748b' }));
    this.stateIndex = new Map(this.states.map((s, i) => [s.name, i]));
    this.transitions = (this.p.transitions ?? []).map((t) => ({ ...t, from: this.stateIndex.get(t.from) ?? -1, to: this.stateIndex.get(t.to) ?? -1, trigger: this.stateIndex.get(t.trigger) ?? -1, value: t.kind === 'condition' ? compile(t.value) : num(t.value), radius: Math.max(0.05, num(t.radius, 1)) }));
    const n = Math.max(1, Math.round(num(this.p.count, 100)));
    this.n = n;
    this.ax = new Float32Array(n); this.ay = new Float32Array(n); this.pax = new Float32Array(n); this.pay = new Float32Array(n);
    this.tx = new Float32Array(n); this.ty = new Float32Array(n);
    this.state = new Int16Array(n); this.entered = new Float64Array(n);
    this.counts = new Array(this.states.length).fill(0);
    this.countStats = this.states.map(() => new TimeStat(0, 0));
    this.stepAt = 0; this.dt = 1;
    this.transitionsDone = 0;
  }
  get x0() { return this.block.x - this.w / 2; }
  get y0() { return this.block.y - this.h / 2; }
  start() {
    const r = this.sim.random;
    const spec = String(this.p.initial ?? '').split(/[,;]+/).map((s) => s.split(':').map((x) => x.trim())).filter((x) => x.length === 2 && this.stateIndex.has(x[0]));
    const shares = spec.map(([name, v]) => [this.stateIndex.get(name), num(v)]);
    const counts = shares.some(([, v]) => v > 1) ? shares.map(([i, v]) => [i, Math.round(v)]) : shares.map(([i, v]) => [i, Math.round(v * this.n)]);
    let k = 0;
    for (const [i, c] of counts) for (let j = 0; j < c && k < this.n; j++) this.state[k++] = i;
    while (k < this.n) this.state[k++] = 0;
    for (let i = 0; i < this.n; i++) {
      this.ax[i] = this.pax[i] = this.x0 + r.next() * this.w;
      this.ay[i] = this.pay[i] = this.y0 + r.next() * this.h;
      this.tx[i] = this.x0 + r.next() * this.w; this.ty[i] = this.y0 + r.next() * this.h;
      this.entered[i] = 0;
    }
    this.recount();
  }
  recount() { this.counts.fill(0); for (let i = 0; i < this.n; i++) this.counts[this.state[i]] += 1; this.countStats.forEach((s, i) => s.set(this.now, this.counts[i])); }
  step(dt) {
    const r = this.sim.random; const now = this.now;
    this.pax.set(this.ax); this.pay.set(this.ay);
    this.stepAt = now; this.dt = dt;
    const speed = num(this.p.speed);
    const move = speed * dt;
    for (let i = 0; i < this.n; i++) {
      const dx = this.tx[i] - this.ax[i]; const dy = this.ty[i] - this.ay[i];
      const d = Math.hypot(dx, dy);
      if (d <= move || d < 1e-6) {
        this.ax[i] = this.tx[i]; this.ay[i] = this.ty[i];
        this.tx[i] = this.x0 + r.next() * this.w; this.ty[i] = this.y0 + r.next() * this.h;
      } else { this.ax[i] += (dx / d) * move; this.ay[i] += (dy / d) * move; }
    }
    // Contacts: a grid of cells as wide as the largest contact radius.
    const contacts = this.transitions.filter((t) => t.kind === 'contact' && t.from >= 0);
    let grid = null; let cell = 1;
    if (contacts.length) {
      cell = Math.max(...contacts.map((t) => t.radius));
      grid = new Map();
      for (let i = 0; i < this.n; i++) { const key = `${Math.floor(this.ax[i] / cell)},${Math.floor(this.ay[i] / cell)}`; let list = grid.get(key); if (!list) grid.set(key, (list = [])); list.push(i); }
    }
    const changes = [];
    for (let i = 0; i < this.n; i++) {
      const s = this.state[i];
      for (const t of this.transitions) {
        if (t.from !== s || t.to < 0) continue;
        let fire = false;
        if (t.kind === 'rate') fire = r.next() < 1 - Math.exp(-t.value * dt);
        else if (t.kind === 'timeout') fire = now - this.entered[i] >= t.value - 1e-9;
        else if (t.kind === 'condition') fire = Boolean(t.value.eval((name) => this.sim.lookup(name), { time: now, random: r }));
        else if (t.kind === 'contact' && grid) {
          let n = 0;
          const cx = Math.floor(this.ax[i] / cell); const cy = Math.floor(this.ay[i] / cell);
          for (let ax = cx - 1; ax <= cx + 1; ax++) for (let ay = cy - 1; ay <= cy + 1; ay++) for (const j of grid.get(`${ax},${ay}`) ?? []) if (j !== i && this.state[j] === t.trigger && Math.hypot(this.ax[j] - this.ax[i], this.ay[j] - this.ay[i]) <= t.radius) n += 1;
          fire = n > 0 && r.next() < 1 - Math.exp(-t.value * n * dt);
        }
        if (fire) { changes.push([i, t.to]); break; }
      }
    }
    for (const [i, to] of changes) { this.state[i] = to; this.entered[i] = now; }
    this.transitionsDone += changes.length;
    this.recount();
  }
  metric(name) {
    if (name === 'count') return this.n;
    const i = this.stateIndex.get(name);
    return i == null ? NaN : this.counts[i];
  }
  resetStats(now) { super.resetStats(now); this.countStats.forEach((s) => s.reset(now)); this.transitionsDone = 0; }
  summary(now) { return { agents: this.n, transitions: this.transitionsDone, states: Object.fromEntries(this.states.map((s, i) => [s.name, { now: this.counts[i], mean: this.countStats[i].mean(now), max: this.countStats[i].max }])) }; }
  agentViews(out) {
    const f = this.dt > 0 ? Math.min(1, Math.max(0, (this.sim.now - this.stepAt) / this.dt)) : 1;
    for (let i = 0; i < this.n; i++) out.push(this.pax[i] + (this.ax[i] - this.pax[i]) * f, this.pay[i] + (this.ay[i] - this.pay[i]) * f, this.state[i]);
  }
}


// ───────────────────────── more process blocks

/** Split: the entity goes on through output 1, its copies through output 2. */
class SplitNode extends Node {
  constructor(sim, block) { super(sim, block); this.out = []; }
  canAccept() { return this.out.length === 0; }
  accept(e) {
    this.enter(e);
    this.out.push([e, 0]);
    const n = Math.max(1, Math.round(num(this.p.copies, 1)));
    for (let i = 0; i < n; i++) {
      const c = this.sim.createEntity({ type: this.p.copyType || e.type, color: this.p.copyColor || e.color, shape: e.shape, priority: e.priority, created: this.now });
      c.at = this.id;
      this.out.push([c, 1]);
    }
    this.flush();
  }
  flush() {
    while (this.out.length) {
      const [e, port] = this.out[0];
      if (!this.sim.hasOutput(this, port)) { this.out.shift(); this.sim.destroy(e, 'unrouted'); continue; }
      if (!this.forward(e, port)) break;
      this.out.shift();
    }
    this.contents.set(this.now, this.out.length);
    if (!this.out.length) this.notifyUp();
  }
  retry() { this.flush(); }
  positions(push) { this.out.forEach(([e], k) => { const [x, y] = this.gridSpot(k, Math.max(2, this.out.length), 0.5); push(e, x, y, 0.3); }); }
}

/** Match: waits for one entity at each input (of the same type when asked) and lets the pair go together. */
class MatchNode extends Node {
  constructor(sim, block) { super(sim, block); this.buffers = [[], []]; this.cap = capOf(this.p.capacity); this.pairs = 0; }
  canAccept(e, port) { return port < 2 && this.buffers[port].length < this.cap; }
  accept(e, port) { this.enter(e); this.buffers[port].push(e); this.pump(); }
  pump() {
    let moved = false;
    for (;;) {
      let pair = null;
      if (this.p.byType) {
        for (const a of this.buffers[0]) { const b = this.buffers[1].find((x) => x.type === a.type); if (b) { pair = [a, b]; break; } }
      } else if (this.buffers[0].length && this.buffers[1].length) pair = [this.buffers[0][0], this.buffers[1][0]];
      if (!pair) break;
      const t0 = this.sim.findTarget(this, pair[0], 0); const t1 = this.sim.findTarget(this, pair[1], 1);
      if (!t0 || !t1) break;
      this.buffers[0].splice(this.buffers[0].indexOf(pair[0]), 1);
      this.buffers[1].splice(this.buffers[1].indexOf(pair[1]), 1);
      this.countOut += 2; this.pairs += 1;
      this.sim.deliver(pair[0], t0); this.sim.deliver(pair[1], t1);
      moved = true;
    }
    this.contents.set(this.now, this.buffers[0].length + this.buffers[1].length);
    if (moved) this.notifyUp();
  }
  retry() { this.pump(); }
  summary(now) { return { ...super.summary(now), pairs: this.pairs, waiting: this.buffers.map((b) => b.length) }; }
  positions(push) { this.buffers.forEach((b, i) => b.forEach((e, k) => { const [x, y] = this.local(-this.w / 2 + 0.4 + (k % 4) * 0.4, (i ? 1 : -1) * this.h / 4 + Math.floor(k / 4) * 0.35); push(e, x, y, 0.3); })); }
}

/** Restricted area: at most `capacity` entities between this block and its end block (CONWIP, kanban). */
class RestrictedStartNode extends PassNode {
  constructor(sim, block) { super(sim, block); this.inside = 0; this.insideStat = new TimeStat(0, 0); this.cap = Math.max(1, Math.round(num(this.p.capacity, 1))); }
  open() { return this.inside < this.cap; }
  passed() { this.inside += 1; this.insideStat.set(this.now, this.inside); }
  leave() { this.inside = Math.max(0, this.inside - 1); this.insideStat.set(this.now, this.inside); this.notifyUp(); }
  metric(name) { if (name === 'inside') return this.inside; return super.metric(name); }
  resetStats(now) { super.resetStats(now); this.insideStat.reset(now); }
  summary(now) { return { ...super.summary(now), insideMean: this.insideStat.mean(now), insideMax: this.insideStat.max, capacity: this.cap, fillMean: this.insideStat.mean(now) / this.cap }; }
}
class RestrictedEndNode extends PassNode {
  start() { this.startNode = this.sim.byName.get(this.p.start) ?? null; }
  passed() { this.startNode?.leave?.(); }
}

/** Time measurement: the time between passing a start block and this end block. */
class TimeStartNode extends PassNode {
  apply(e) { e.timers ??= {}; e.timers[this.name] = this.now; }
}
class TimeEndNode extends PassNode {
  constructor(sim, block) { super(sim, block); this.times = new Tally(); }
  apply(e) { const t0 = e.timers?.[this.p.start]; if (t0 != null) this.times.add(this.now - t0); }
  metric(name) { if (name === 'time') return this.times.mean; return super.metric(name); }
  resetStats(now) { super.resetStats(now); this.times.reset(); }
  summary(now) { return { ...super.summary(now), timeMean: this.times.mean, timeMax: this.times.n ? this.times.max : 0, timeSd: this.times.sd, measured: this.times.n }; }
}

/** Scheduled maintenance: takes a process down for a while at intervals. */
class MaintenanceNode extends Node {
  constructor(sim, block) { super(sim, block); this.done = 0; this.downTime = 0; }
  start() {
    const target = this.sim.byName.get(this.p.target);
    if (!(target instanceof ProcessNode)) return;
    const go = () => {
      const d = this.sim.sample(this.p.duration);
      if (target.forceDown(d, 'maintenance')) { this.done += 1; this.downTime += d; }
      this.sim.after(Math.max(1e-6, this.sim.sample(this.p.interval)), go);
    };
    this.sim.at(Math.max(0, num(this.p.firstAt)), go);
  }
  metric(name) { if (name === 'count') return this.done; return super.metric(name); }
  resetStats(now) { super.resetStats(now); this.done = 0; this.downTime = 0; }
  summary() { return { maintenances: this.done, downTotal: this.downTime }; }
}

/** Merge (junction): several inputs into one output. */
class MergeNode extends PassNode {}

/**
 * Event (AnyLogic's Event): at a time, on a cycle or when a condition becomes true, sets a block property
 * (capacity, a distribution's mean …) or an SD parameter to the value of an expression; `current` is the old value.
 * The change is made on a copy of the block's properties (never on the model being edited).
 */
class EventNode extends Node {
  constructor(sim, block) { super(sim, block); this.fired = 0; this.total = 0; this.lastValue = NaN; }
  start() {
    const max = Math.max(0, Math.round(num(this.p.maxTimes)));
    const fire = () => { if (max > 0 && this.total >= max) return false; this.total += 1; this.fired += 1; this.apply(); return true; };
    const first = Math.max(0, num(this.p.startAt));
    if (this.p.trigger === 'condition') {
      let was = false;
      const poll = () => {
        const now = Boolean(this.sim.evalExpr(this.p.condition));
        if (now && !was && !fire()) return;
        was = now;
        this.sim.after(this.sim.pollStep, poll);
      };
      this.sim.at(first, poll);
      return;
    }
    const go = () => { if (!fire()) return; if (this.p.trigger === 'cyclic') this.sim.after(Math.max(1e-6, this.sim.sample(this.p.every)), go); };
    this.sim.at(first, go);
  }
  valueFrom(current) {
    const c = compile(String(this.p.newValue ?? ''));
    if (!c.ok) return NaN;
    return Number(c.eval((n) => (n === 'current' ? current : this.sim.lookup(n)), { time: this.now, random: this.sim.random }));
  }
  apply() {
    const name = this.p.targetBlock;
    const param = this.sim.sd.params.get(name);
    if (param) {
      const v = this.valueFrom(param.value);
      if (Number.isFinite(v)) { this.sim.setParameter(name, v); this.lastValue = v; this.sim.log(this, 'eventFired', { target: name, value: +v.toFixed(4) }); }
      return;
    }
    const node = this.sim.byName.get(name);
    const path = String(this.p.property ?? '').trim();
    if (!node || !path) return;
    const [prop, sub] = path.split('.');
    const old = sub ? node.p[prop]?.[sub] : node.p[prop];
    const v = this.valueFrom(Number(old ?? 0));
    if (!Number.isFinite(v)) return;
    node.p = { ...node.p, [prop]: sub ? { ...node.p[prop], [sub]: v } : v };
    this.lastValue = v;
    node.propChanged?.(prop);
    node.notifyUp();
    this.sim.log(this, 'eventFired', { target: name + "." + path, value: +v.toFixed(4) });
  }
  metric(name) { if (name === 'count') return this.fired; if (name === 'value') return this.lastValue; return super.metric(name); }
  resetStats(now) { super.resetStats(now); this.fired = 0; }
  summary() { return { fired: this.fired, lastValue: this.lastValue }; }
}

/** A cellular automaton: a grid of cells, each in a state, changing by its neighbours (forest fire, Game of Life). */
class CellGridNode extends Node {
  constructor(sim, block) {
    super(sim, block);
    this.cols = Math.max(2, Math.round(num(this.p.cols, 20))); this.rows = Math.max(2, Math.round(num(this.p.rows, 20)));
    this.states = (this.p.states ?? []).map((s) => ({ name: String(s.name), color: s.color || '#64748b' }));
    this.stateIndex = new Map(this.states.map((s, i) => [s.name, i]));
    this.transitions = (this.p.transitions ?? []).map((t) => ({ ...t, from: this.stateIndex.get(t.from) ?? -1, to: this.stateIndex.get(t.to) ?? -1, trigger: this.stateIndex.get(t.trigger) ?? -1, value: t.kind === 'condition' ? compile(t.value) : num(t.value), max: t.max == null || t.max === '' ? Infinity : num(t.max, Infinity) }));
    const n = this.cols * this.rows;
    this.cells = new Int16Array(n); this.next = new Int16Array(n); this.entered = new Float64Array(n);
    this.counts = new Array(this.states.length).fill(0);
    this.countStats = this.states.map(() => new TimeStat(0, 0));
    this.generation = 0;
  }
  start() {
    const r = this.sim.random;
    const spec = String(this.p.initial ?? '').split(/[,;]+/).map((s) => s.split(':').map((x) => x.trim())).filter((x) => x.length === 2 && this.stateIndex.has(x[0]));
    const weights = this.states.map((s) => { const hit = spec.find(([name]) => name === s.name); return hit ? num(hit[1]) : 0; });
    if (!weights.some((w) => w > 0)) weights[0] = 1;
    for (let i = 0; i < this.cells.length; i++) this.cells[i] = r.pick(weights);
    this.recount();
  }
  recount() { this.counts.fill(0); for (const s of this.cells) this.counts[s] += 1; this.countStats.forEach((st, i) => st.set(this.now, this.counts[i])); }
  neighbours(i, state) {
    const c = i % this.cols; const rr = Math.floor(i / this.cols);
    const wrap = this.p.wrap !== false; const moore = this.p.neighborhood !== 'vonNeumann';
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      if (!moore && dx && dy) continue;
      let x = c + dx; let y = rr + dy;
      if (wrap) { x = (x + this.cols) % this.cols; y = (y + this.rows) % this.rows; } else if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) continue;
      if (this.cells[y * this.cols + x] === state) n += 1;
    }
    return n;
  }
  step(dt) {
    const r = this.sim.random; const now = this.now;
    this.next.set(this.cells);
    for (let i = 0; i < this.cells.length; i++) {
      const s = this.cells[i];
      for (const t of this.transitions) {
        if (t.from !== s || t.to < 0) continue;
        let fire = false;
        if (t.kind === 'rate') fire = r.next() < 1 - Math.exp(-t.value * dt);
        else if (t.kind === 'timeout') fire = now - this.entered[i] >= t.value - 1e-9;
        else if (t.kind === 'neighbors') { const n = this.neighbours(i, t.trigger); fire = n >= t.value && n <= t.max; }
        else if (t.kind === 'neighborsOutside') { const n = this.neighbours(i, t.trigger); fire = n < t.value || n > t.max; }
        else if (t.kind === 'contact') { const n = this.neighbours(i, t.trigger); fire = n > 0 && r.next() < 1 - Math.exp(-t.value * n * dt); }
        else if (t.kind === 'condition') fire = Boolean(t.value.eval((name) => this.sim.lookup(name), { time: now, random: r }));
        if (fire) { this.next[i] = t.to; this.entered[i] = now; break; }
      }
    }
    [this.cells, this.next] = [this.next, this.cells];
    this.generation += 1;
    this.recount();
  }
  metric(name) { if (name === 'count') return this.cells.length; if (name === 'generation') return this.generation; const i = this.stateIndex.get(name); return i == null ? NaN : this.counts[i]; }
  resetStats(now) { super.resetStats(now); this.countStats.forEach((s) => s.reset(now)); }
  summary(now) { return { cells: this.cells.length, generation: this.generation, states: Object.fromEntries(this.states.map((s, i) => [s.name, { now: this.counts[i], mean: this.countStats[i].mean(now), max: this.countStats[i].max }])) }; }
}

const NODE_CLASSES = {
  source: SourceNode, sink: SinkNode, queue: QueueNode, process: ProcessNode, delay: ProcessNode, robot: ProcessNode, dock: ProcessNode,
  resourcePool: PoolNode, seize: SeizeNode, release: ReleaseNode, select: SelectNode, assign: AssignNode, gate: GateNode, signal: GateNode,
  combine: CombineNode, batch: BatchNode, unbatch: UnbatchNode, conveyor: ConveyorNode, road: ConveyorNode, transporter: TransporterNode,
  rack: StoreNode, parking: StoreNode, population: PopulationNode,
  split: SplitNode, match: MatchNode, restrictedStart: RestrictedStartNode, restrictedEnd: RestrictedEndNode, timeStart: TimeStartNode, timeEnd: TimeEndNode,
  maintenance: MaintenanceNode, merge: MergeNode, cellGrid: CellGridNode, event: EventNode,
};

/** Linear interpolation in a table (SD lookup), flat beyond its ends. */
function interpolate(xs, ys, x) {
  const n = Math.min(xs.length, ys.length);
  if (!n) return 0;
  if (x <= xs[0]) return ys[0];
  for (let i = 1; i < n; i++) if (x <= xs[i]) { const f = (x - xs[i - 1]) / ((xs[i] - xs[i - 1]) || 1); return ys[i - 1] + (ys[i] - ys[i - 1]) * f; }
  return ys[n - 1];
}

// ───────────────────────── the simulation

export class Simulation {
  /** model: a normalized model; options: { seed, end, onLog }. */
  constructor(model, options = {}) {
    this.model = model;
    const s = model.settings;
    this.seed = options.seed ?? (s.randomSeed ? Math.floor(Math.random() * 1e9) : s.seed);
    this.random = createRandom(this.seed);
    this.end = options.end ?? s.duration;
    this.warmupAt = Math.max(0, num(s.warmup));
    this.statsFrom = 0;
    this.pollStep = Math.max(1e-6, num(s.sdDt, 0.25));
    this.now = 0; this.seq = 0; this.events = new EventHeap(); this.eventCount = 0;
    this.entities = new Set(); this.hidden = new Set(); this.nextEntity = 1;
    this.created = 0; this.destroyed = 0; this.sinkCount = 0; this.lost = 0;
    this.wip = new TimeStat(0, 0); this.systemTime = new Tally();
    this.retryQueue = new Set(); this.flushing = false;
    this.logs = []; this.onLog = options.onLog ?? null;
    this.nodes = new Map(); this.byName = new Map();
    this.errors = [];
    for (const b of model.blocks) {
      const C = NODE_CLASSES[baseOf(b.type)];
      if (!C) continue;
      const node = new C(this, b);
      this.nodes.set(b.id, node); this.byName.set(b.name, node);
    }
    for (const l of model.links) {
      if (l.kind !== 'flow') continue;
      const a = this.nodes.get(l.from.block); const b = this.nodes.get(l.to.block);
      if (!a || !b) continue;
      (a.outs[l.from.port] ??= []).push({ node: b, port: l.to.port, fromPort: l.from.port, link: l.id });
      b.ups.add(a);
    }
    this.sd = new SdSystem(this, model.blocks, model.links);
    this.populations = [...this.nodes.values()].filter((n) => n instanceof PopulationNode || n instanceof CellGridNode);
    this.displays = model.blocks.filter((b) => baseOf(b.type) === 'display');
    this.series = { t: [], data: new Map() };
    this.sampleEvery = num(s.sampleInterval) > 0 ? num(s.sampleInterval) : this.end / 400;
    this.started = false;
  }

  // ── events
  at(time, fn) { const ev = { time: Math.max(time, this.now), seq: this.seq++, fn, cancelled: false }; this.events.push(ev); return ev; }
  after(delay, fn) { return this.at(this.now + Math.max(0, num(delay)), fn); }
  sample(dist) { return sample(dist, this.random, (expr) => this.evalExpr(expr)); }
  requestRetry(node) { this.retryQueue.add(node); }
  flushRetries() {
    if (this.flushing) return;
    this.flushing = true;
    let guard = 0;
    while (this.retryQueue.size && guard++ < 100000) {
      const [node] = this.retryQueue; this.retryQueue.delete(node);
      node.retry();
    }
    this.flushing = false;
  }

  start() {
    if (this.started) return;
    this.started = true;
    for (const n of this.nodes.values()) if (n instanceof PoolNode) n.start();
    for (const n of this.nodes.values()) if (!(n instanceof PoolNode)) n.start();
    if (this.sd.active) {
      this.sd.init();
      const dt = Math.max(1e-6, num(this.model.settings.sdDt, 0.25));
      let k = 0;
      const tick = () => { this.sd.step(dt); k += 1; this.at((k + 1) * dt, tick); };
      this.at(dt, tick);
    }
    if (this.populations.length) {
      const dt = Math.max(1e-6, num(this.model.settings.agentDt, 0.25));
      let k = 0;
      const tick = () => { for (const p of this.populations) p.step(dt); k += 1; this.at((k + 1) * dt, tick); };
      this.at(dt, tick);
    }
    if (this.warmupAt > 0) this.at(this.warmupAt, () => this.resetStats());
    this.record();
    const rec = () => { this.record(); this.after(this.sampleEvery, rec); };
    this.after(this.sampleEvery, rec);
    this.flushRetries();
  }

  resetStats() {
    const now = this.now;
    this.statsFrom = now;
    for (const n of this.nodes.values()) n.resetStats(now);
    this.wip.reset(now); this.systemTime.reset();
    this.sinkCount = 0; this.created = 0; this.destroyed = 0; this.lost = 0;
    this.log(null, 'warmup');
  }

  get done() { return this.now >= this.end - 1e-12; }

  /** Runs every event up to time `t` (not past the end); returns how many ran. */
  runUntil(t, maxEvents = Infinity) {
    if (!this.started) this.start();
    const target = Math.min(t, this.end);
    let n = 0;
    while (this.events.size && n < maxEvents) {
      const ev = this.events.peek();
      if (ev.time > target + 1e-9) break;
      this.events.pop();
      if (ev.cancelled) continue;
      this.now = ev.time;
      try { ev.fn(); } catch (error) { this.fail(error); }
      this.flushRetries();
      n += 1;
    }
    this.eventCount += n;
    if (n < maxEvents && target > this.now) this.now = target;
    return n;
  }

  /** Runs to the end (experiments, tests). */
  runToEnd() { this.runUntil(this.end); this.record(); return this.results(); }

  fail(error) {
    this.errors.push(String(error?.message ?? error));
    if (this.errors.length > 50) this.errors.shift();
    this.log(null, 'error', { message: String(error?.message ?? error) });
  }

  log(node, kind, data = {}) {
    const entry = { t: this.now, block: node?.name ?? '', kind, ...data };
    this.logs.push(entry);
    if (this.logs.length > 1000) this.logs.splice(0, 200);
    this.onLog?.(entry);
  }

  // ── entities
  createEntity({ type = 'Part', color = '#3b82f6', shape = 'box', priority = 0, created = this.now } = {}) {
    const e = { id: this.nextEntity++, type, color, shape, priority, created, at: null, since: this.now };
    this.entities.add(e);
    this.created += 1;
    this.wip.set(this.now, this.entities.size - this.hidden.size);
    return e;
  }
  destroy(e, why = 'sink') {
    if (!this.entities.delete(e)) return;
    this.hidden.delete(e);
    this.destroyed += 1;
    if (why === 'sink') this.systemTime.add(this.now - e.created);
    if (why === 'lost') this.lost += 1;
    this.wip.set(this.now, this.entities.size - this.hidden.size);
  }
  hide(e) { this.hidden.add(e); this.wip.set(this.now, this.entities.size - this.hidden.size); }
  show(e) { this.hidden.delete(e); this.wip.set(this.now, this.entities.size - this.hidden.size); }

  hasOutput(node, port) { return Boolean(node.outs[port]?.length); }
  /** The first block linked from `node`'s `port` that takes `e` now (round robin over several links). */
  findTarget(node, e, port) {
    const targets = node.outs[port];
    if (!targets?.length) return null;
    const start = node.rr[port] ?? 0;
    for (let k = 0; k < targets.length; k++) {
      const t = targets[(start + k) % targets.length];
      if (t.node.canAccept(e, t.port)) { node.rr[port] = (start + k + 1) % targets.length; return t; }
    }
    return null;
  }
  deliver(e, target) { target.node.accept(e, target.port); }

  // ── expressions
  lookup(name) {
    if (name === 'time' || name === 't') return this.now;
    if (this.sd.has(name)) return this.sd.value(name);
    const dot = name.indexOf('.');
    if (dot > 0) {
      const node = this.byName.get(name.slice(0, dot));
      const metric = name.slice(dot + 1);
      if (node) { const v = node.metric(metric); return Number.isFinite(v) ? v : 0; }
      const display = this.displays.find((d) => d.name === name.slice(0, dot));
      if (display && metric === 'value') return num(this.evalExpr(display.props.expression));
    }
    return 0;
  }
  evalExpr(text) { return compile(text).eval((n) => this.lookup(n), { time: this.now, random: this.random }); }
  evalEntity(text, e) {
    return compile(text).eval((n) => {
      if (n === 'priority') return e.priority;
      if (n === 'age') return this.now - e.created;
      if (n === 'size') return e.members?.length ?? 1;
      return this.lookup(n);
    }, { time: this.now, random: this.random });
  }
  /** Changes a parameter while the model runs (properties panel slider). */
  setParameter(name, value) {
    const p = this.sd.params.get(name);
    if (p) { p.value = num(value); this.sd.refresh(); return true; }
    return false;
  }

  // ── series for charts
  seriesKeys() {
    const keys = [];
    for (const n of this.nodes.values()) {
      if (n instanceof PopulationNode || n instanceof CellGridNode) { for (const s of n.states) keys.push(`${n.name}.${s.name}`); continue; }
      if (n instanceof RestrictedStartNode) keys.push(`${n.name}.inside`);
      if (n instanceof TimeEndNode) keys.push(`${n.name}.time`);
      if (n instanceof QueueNode) keys.push(`${n.name}.length`);
      else if (n instanceof ProcessNode || n instanceof PoolNode || n instanceof TransporterNode) keys.push(`${n.name}.utilization`);
      if (n instanceof SinkNode || n instanceof SourceNode) keys.push(`${n.name}.count`);
      if (n instanceof ConveyorNode || n instanceof StoreNode || n instanceof ProcessNode || n instanceof CombineNode) keys.push(`${n.name}.contents`);
    }
    for (const name of [...this.sd.stocks.keys(), ...this.sd.flows.keys(), ...this.sd.vars.keys(), ...this.sd.params.keys(), ...this.sd.lookups.keys(), ...this.sd.smooths.keys()]) keys.push(name);
    for (const d of this.displays) keys.push(`${d.name}.value`);
    return keys;
  }
  /** Instant values for series: utilization is the share busy right now (not the running mean). */
  instant(key) {
    const dot = key.indexOf('.');
    if (dot > 0) {
      const node = this.byName.get(key.slice(0, dot)); const m = key.slice(dot + 1);
      if (node && m === 'utilization') {
        // The share busy since the last sample (instant busy / idle would only ever be 0 or 1).
        const stat = node instanceof ProcessNode ? node.busy : node instanceof PoolNode ? node.busyStat : node instanceof TransporterNode ? node.busyStat : null;
        const cap = node instanceof ProcessNode ? node.cap : node instanceof PoolNode ? Math.max(1, node.capacity) : node instanceof TransporterNode ? node.vehicles.length : 1;
        if (stat && cap !== Infinity) {
          const integral = stat.area + stat.value * (this.now - stat.last);
          // A sliding window of the last 12 samples (~3% of the run): steady enough to read, quick enough to follow.
          this.lastIntegral ??= new Map();
          let hist = this.lastIntegral.get(key);
          if (!hist || hist.start !== stat.start) this.lastIntegral.set(key, (hist = { start: stat.start, points: [] }));
          hist.points.push([this.now, integral]);
          if (hist.points.length > 13) hist.points.shift();
          const [t0, i0] = hist.points[0];
          if (this.now > t0) return Math.max(0, Math.min(1, (integral - i0) / ((this.now - t0) * cap)));
          return stat.value / cap;
        }
      }
    }
    return this.lookup(key);
  }
  record() {
    if (!this.keys) this.keys = this.seriesKeys();
    const t = this.now;
    if (this.series.t.length && this.series.t[this.series.t.length - 1] >= t) return;
    this.series.t.push(t);
    for (const k of this.keys) { let arr = this.series.data.get(k); if (!arr) this.series.data.set(k, (arr = [])); arr.push(this.instant(k)); }
    for (const [k, v] of [['wip', this.entities.size - this.hidden.size], ['completed', this.sinkCount]]) { let arr = this.series.data.get(k); if (!arr) this.series.data.set(k, (arr = [])); arr.push(v); }
  }

  // ── views for the 2D / 3D animation
  /** Every visible entity: [{ e, x, y, z, heading }]. */
  entityViews() {
    const out = [];
    const push = (e, x, y, z = 0, heading = 0) => { if (!this.hidden.has(e)) out.push({ e, x, y, z, heading }); };
    for (const n of this.nodes.values()) n.positions(push);
    return out;
  }
  vehicleViews() { const out = []; for (const n of this.nodes.values()) if (n instanceof TransporterNode) n.vehicleViews(out); return out; }
  /** Pool units (workers, robots) and where they are: at home or at the block they serve. */
  workerViews() {
    const out = [];
    for (const n of this.nodes.values()) {
      if (!(n instanceof PoolNode)) continue;
      const home = n.units.length;
      n.units.forEach((u, i) => {
        if (u.node) {
          const target = this.nodes.get(u.node);
          const k = n.units.slice(0, i).filter((x) => x.node === u.node).length;
          const [x, y] = target ? target.local(-target.w / 2 - 0.5, -target.h / 2 + 0.5 + k * 0.7) : [n.x, n.y];
          out.push({ id: `${n.id}:${i}`, pool: n.id, x, y, busy: true, kind: n.p.kind });
        } else {
          const [x, y] = n.gridSpot(i, home, 0.7);
          out.push({ id: `${n.id}:${i}`, pool: n.id, x, y, busy: false, off: i >= n.capacity, kind: n.p.kind });
        }
      });
    }
    return out;
  }
  cellViews() { return this.populations.filter((p) => p instanceof CellGridNode).map((g) => ({ block: g.id, cols: g.cols, rows: g.rows, cells: g.cells, states: g.states })); }
  agentViews() {
    return this.populations.filter((p) => p instanceof PopulationNode).map((p) => { const coords = []; p.agentViews(coords); return { block: p.id, states: p.states, shape: p.p.shape, coords }; });
  }
  /** What each block shows while running: state colour, counts, gauge (0..1), text. */
  blockState(id) {
    const n = this.nodes.get(id);
    if (!n) {
      const b = this.model.blocks.find((x) => x.id === id);
      if (b && isSd(b.type)) { const st = this.sd.stocks.get(b.name); return { value: this.sd.value(b.name), capacity: st?.cap, full: st?.full }; }
      if (b && baseOf(b.type) === 'display') return { value: num(this.evalExpr(b.props.expression)) };
      return null;
    }
    if (n instanceof ProcessNode) return { state: n.state(), contents: n.servers.length, capacity: n.cap, utilization: n.metric('utilization'), count: n.countOut, failed: n.failed };
    if (n instanceof QueueNode) return { contents: n.items.length, capacity: n.cap, count: n.countOut, gauge: n.cap === Infinity ? Math.min(1, n.items.length / 20) : n.items.length / n.cap };
    if (n instanceof PoolNode) return { contents: n.inUse, capacity: n.capacity, utilization: n.metric('utilization') };
    if (n instanceof GateNode) return { open: n.isOpen, phase: n.signal ? n.phase : n.isOpen ? 'green' : 'red', count: n.countOut };
    if (n instanceof SourceNode) return { count: n.arrivals, contents: n.pending.length, lost: n.lost };
    if (n instanceof SinkNode) return { count: n.countOut, cycle: n.cycle.mean };
    if (n instanceof StoreNode) return { contents: n.contents.value, capacity: n.cap, gauge: n.contents.value / n.cap, count: n.countOut };
    if (n instanceof ConveyorNode) return { contents: n.contents.value, capacity: n.capPerLane * n.nLanes, count: n.countOut, blocked: n.lanes.some((l) => l.items[0]?.blocked) };
    if (n instanceof TransporterNode) return { contents: n.waiting.length, utilization: n.metric('utilization'), count: n.countOut };
    if (n instanceof CombineNode) return { state: n.busy ? 'busy' : n.out ? 'blocked' : 'idle', contents: n.contents.value, count: n.countOut };
    if (n instanceof PopulationNode) return { counts: [...n.counts], states: n.states };
    if (n instanceof CellGridNode) return { counts: [...n.counts], states: n.states, cells: n.cells, cols: n.cols, rows: n.rows, generation: n.generation };
    if (n instanceof RestrictedStartNode) return { contents: n.inside, capacity: n.cap, gauge: n.inside / n.cap, count: n.countOut };
    if (n instanceof MaintenanceNode) return { count: n.done };
    return { contents: n.contents.value, count: n.countOut };
  }

  // ── results
  results() {
    const now = this.now;
    const span = Math.max(1e-9, now - this.statsFrom);
    const blocks = {};
    for (const n of this.nodes.values()) blocks[n.name] = { type: n.type, base: n.base, ...n.summary(now) };
    const sinks = [...this.nodes.values()].filter((n) => n instanceof SinkNode);
    const cycle = new Tally();
    for (const s of sinks) { cycle.n += s.cycle.n; cycle.sum += s.cycle.sum; cycle.sq += s.cycle.sq; cycle.min = Math.min(cycle.min, s.cycle.min); cycle.max = Math.max(cycle.max, s.cycle.max); }
    const capacityNodes = [...this.nodes.values()].filter((n) => (n instanceof ProcessNode && n.cap !== Infinity) || n instanceof PoolNode || n instanceof TransporterNode);
    const util = (n) => (n instanceof PoolNode ? n.metric('utilization') : n instanceof TransporterNode ? n.busyStat.mean(now) / n.vehicles.length : n.utilization(now));
    let bottleneck = null;
    for (const n of capacityNodes) { const u = util(n); if (!bottleneck || u > bottleneck.utilization) bottleneck = { name: n.name, utilization: u }; }
    const sd = {};
    for (const [name, st] of this.sd.stocks) sd[name] = { kind: 'stock', value: st.value };
    for (const [name, f] of this.sd.flows) sd[name] = { kind: 'flow', value: f.rate };
    for (const [name, v] of this.sd.vars) sd[name] = { kind: 'variable', value: v.value };
    for (const [name, p] of this.sd.params) sd[name] = { kind: 'parameter', value: p.value };
    for (const [name, l] of this.sd.lookups) sd[name] = { kind: 'lookup', value: this.sd.value(name) };
    for (const [name, m] of this.sd.smooths) sd[name] = { kind: 'smooth', value: m.value };
    const cost = Object.values(blocks).reduce((s, b) => s + (b.cost ?? 0), 0) + num(this.model.settings.costPerEntity) * this.sinkCount;
    return {
      time: now, seed: this.seed, events: this.eventCount, statsFrom: this.statsFrom,
      kpi: {
        throughput: this.sinkCount / span, completed: this.sinkCount, created: this.created, lost: this.lost,
        cycleMean: cycle.mean, cycleSd: cycle.sd, cycleMax: cycle.n ? cycle.max : 0,
        wipMean: this.wip.mean(now), wipMax: this.wip.max, wipNow: this.entities.size - this.hidden.size, cost,
        bottleneck: bottleneck && bottleneck.utilization > 0 ? bottleneck : null,
      },
      blocks, sd, errors: [...this.errors],
    };
  }
}

/** Runs a model to the end and returns its results (experiments, tests). */
export function runModel(model, options = {}) {
  const sim = new Simulation(model, options);
  return { sim, results: sim.runToEnd() };
}

/** A metric of a results object by "Block.metric" or a KPI name ("throughput", "cycleMean" …). */
export function resultValue(results, key) {
  if (Object.hasOwn(results.kpi, key)) { const v = results.kpi[key]; return typeof v === 'number' ? v : v?.utilization ?? NaN; }
  if (Object.hasOwn(results.sd, key)) return results.sd[key].value;
  const dot = key.indexOf('.');
  if (dot > 0) {
    const b = results.blocks[key.slice(0, dot)];
    const m = key.slice(dot + 1);
    if (!b) return NaN;
    const alias = { count: 'out', length: 'lengthMean', waitTime: 'waitMean', cycleTime: 'cycleMean', contents: 'contentsMean', fill: 'fillMean', time: 'timeMean', inside: 'insideMean' }[m] ?? m;
    const v = b[alias] ?? b[m];
    if (typeof v === 'number') return v;
    if (b.states?.[m]) return b.states[m].now;
  }
  return NaN;
}

/** Mean of a distribution, re-exported for panels. */
export { distMean };
