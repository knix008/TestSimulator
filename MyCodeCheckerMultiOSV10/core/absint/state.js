'use strict';

// Abstract values, memory objects and program states.
//
// Value (immutable plain object; every field optional, {} is "unknown"):
//   iv    Interval of an integer value
//   pt    [{ o: objectId, off: Interval }] pointer targets (non-null part)
//   nul   'null' | 'maybe' | 'non'   nullness; undefined = not known
//   nev   events explaining why the value is (maybe) null
//   nret  { fn, ev }  returned by a function that may return NULL (unchecked)
//   neg   { fn, ev }  returned by a function that may return a negative error code
//   tnt   events: tainted scalar (from an untrusted source)
//   par   parameter index: still the exact value the parameter had at entry
//   sym   { s, d }  value == symbolic s + d   (s: 'p<i>' parameter or 'c<id>' call result)
//   ub    { s, d }  value <= s + d, bound attained (from refinement)
//   dref  event: pointer was dereferenced (proves non-null, REVERSE_INULL)
//   wrap  { ev, definite } unsigned wrap-around produced this value
//   rid   object id of an int resource (file descriptor)
//   slen  object id: the value is strlen() of that object
//   lck   lock key: trylock result, 0 means acquired
//   un    { ev, may } uninitialized
//   fn    function name (function designator)
//   reall object id: realloc result; on NULL the old object stays live
//
// Object (copy-on-write inside a State):
//   id, kind: 'stack'|'global'|'heap'|'string'|'param'|'argv'|'env'|'unknown'
//   name, size (Interval bytes)|null, ssym {s,d}|null, esz element size
//   ak  allocation kind ('malloc','new','new[]','file','fd','dir', user kind)
//   aev allocation events, st 'live'|'freed'|'nulled', fev free events
//   esc escaped (ownership transferred), multi (summary of several allocations)
//   init 'no'|'yes'  (local aggregates), term 'yes'|'no' (NUL terminated)
//   slen Interval (strlen), tnt events (contents tainted), lit string literal
//   fnName owning function (stack objects), vsym variable symbol id, pidx param index

const I = require('./interval');

function vEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return vKey(a) === vKey(b);
}

function ptKey(pt) {
  if (!pt) return '';
  return pt.map((t) => `${t.o}@${I.key(t.off)}`).sort().join('|');
}

function vKey(v) {
  if (!v) return '_';
  let s = '';
  if (v.iv) s += `i${I.key(v.iv)}`;
  if (v.pt) s += `p${ptKey(v.pt)}`;
  if (v.nul) s += `n${v.nul}`;
  if (v.nret) s += 'R';
  if (v.neg) s += 'N';
  if (v.tnt) s += 'T';
  if (v.par !== undefined) s += `P${v.par}`;
  if (v.sym) s += `S${v.sym.s}${v.sym.d}`;
  if (v.ub) s += `U${v.ub.s}${v.ub.d}`;
  if (v.dref) s += 'D';
  if (v.wrap) s += 'W';
  if (v.rid) s += `r${v.rid}`;
  if (v.slen) s += `L${v.slen}`;
  if (v.lck) s += `K${v.lck}`;
  if (v.un) s += v.un.may ? 'u' : 'U';
  if (v.fn) s += `F${v.fn}`;
  if (v.reall) s += `A${v.reall}`;
  if (v.oom) s += 'O';
  return s;
}

function symEq(a, b) {
  return !!a && !!b && a.s === b.s && a.d === b.d;
}

function nulJoin(a, b) {
  if (a === b) return a;
  if (a === 'null' || b === 'null') return 'maybe';
  if (a === 'maybe' || b === 'maybe') return 'maybe';
  return undefined;
}

function ptJoin(a, b, widenTh) {
  const m = new Map();
  for (const t of a) m.set(t.o, t.off);
  for (const t of b) {
    if (m.has(t.o)) {
      const prev = m.get(t.o);
      m.set(t.o, widenTh ? I.widen(prev, t.off, widenTh) : I.join(prev, t.off));
    } else m.set(t.o, t.off);
  }
  if (m.size > 6) return undefined;
  return [...m].map(([o, off]) => ({ o, off }));
}

function vJoin(a, b, widenTh) {
  if (a === b) return a;
  if (!a || !b) return {};
  const r = {};
  if (a.iv && b.iv) r.iv = widenTh ? I.widen(a.iv, b.iv, widenTh) : I.join(a.iv, b.iv);
  const aNull = a.nul === 'null', bNull = b.nul === 'null';
  if (a.pt && b.pt) {
    const pt = ptJoin(a.pt, b.pt, widenTh);
    if (pt) r.pt = pt;
  } else if (a.pt && bNull) r.pt = a.pt;
  else if (b.pt && aNull) r.pt = b.pt;
  const nul = nulJoin(a.nul, b.nul);
  if (nul) r.nul = nul;
  if (r.nul === 'maybe' || r.nul === 'null') {
    r.nev = aNull ? a.nev : bNull ? b.nev : (a.nev || b.nev);
    if (!r.nev) delete r.nev;
  }
  if (a.nret || b.nret) r.nret = a.nret || b.nret;
  if (a.neg || b.neg) r.neg = a.neg || b.neg;
  if (a.tnt || b.tnt) r.tnt = a.tnt || b.tnt;
  if (a.par !== undefined && a.par === b.par) r.par = a.par;
  if (symEq(a.sym, b.sym)) r.sym = a.sym;
  if (symEq(a.ub, b.ub)) r.ub = a.ub;
  if (a.dref && b.dref) r.dref = a.dref;
  if (a.wrap || b.wrap) r.wrap = a.wrap || b.wrap;
  if (a.rid && a.rid === b.rid) r.rid = a.rid;
  if (a.slen && a.slen === b.slen) r.slen = a.slen;
  if (a.lck && a.lck === b.lck) r.lck = a.lck;
  if (a.un || b.un) r.un = { ev: (a.un || b.un).ev, may: !(a.un && b.un) || a.un.may || b.un.may };
  if (a.fn && a.fn === b.fn) r.fn = a.fn;
  if (a.reall && a.reall === b.reall) r.reall = a.reall;
  if (a.oom && b.oom) r.oom = true;
  if (r.iv && I.isTop(r.iv)) delete r.iv;
  return r;
}

function oKey(o) {
  return `${o.kind}${o.size ? I.key(o.size) : ''}${o.ssym ? `S${o.ssym.s}${o.ssym.d}` : ''}${o.st || ''}${o.esc ? 'E' : ''}${o.multi ? 'M' : ''}${o.init || ''}${o.term || ''}${o.slen ? I.key(o.slen) : ''}${o.tnt ? 'T' : ''}${o.ak || ''}`;
}

function oJoin(a, b, widenTh) {
  if (a === b) return a;
  const r = { ...a };
  r.size = a.size && b.size ? (widenTh ? I.widen(a.size, b.size, widenTh) : I.join(a.size, b.size)) : null;
  r.ssym = symEq(a.ssym, b.ssym) ? a.ssym : null;
  if (a.st !== b.st) {
    // freed on one path only: the object may still be live (no definite free).
    r.st = a.st === 'nulled' ? b.st : b.st === 'nulled' ? a.st : 'live';
    if (r.st === 'live') r.mayFreed = a.fev || b.fev || true;
    r.fev = r.st === 'freed' ? (a.fev || b.fev) : null;
  }
  r.esc = a.esc || b.esc;
  r.multi = a.multi || b.multi;
  r.init = a.init === b.init ? a.init : 'yes';
  r.term = a.term === b.term ? a.term : undefined;
  r.slen = a.slen && b.slen ? (widenTh ? I.widen(a.slen, b.slen, widenTh) : I.join(a.slen, b.slen)) : undefined;
  r.tnt = a.tnt || b.tnt;
  return r;
}

let STATE_ID = 0;

class State {
  constructor() {
    this.env = new Map();
    this.objs = new Map();
    this.own = new Set(); // objects copied into this state (writable)
    this.locks = new Map(); // key -> { h: 'held'|'free'|'maybe', ev, here }
    this.trail = [];
    this.dead = null; // null | 'soft' | 'noreturn' | 'hard'
    this.dp = null; // Set of param indices dereferenced on this path
    this.ret = null;
    this.tmp = null; // Map node -> Value (call results inside the current condition)
    this.id = ++STATE_ID;
    this._key = null;
    this._part = null;
  }

  clone() {
    const s = new State();
    s.env = new Map(this.env);
    s.objs = new Map(this.objs);
    s.locks = new Map(this.locks);
    s.trail = this.trail;
    s.dead = this.dead;
    s.dp = this.dp ? new Set(this.dp) : null;
    s.ret = this.ret;
    s.tmp = this.tmp ? new Map(this.tmp) : null;
    this.own = new Set(); // objects are shared from now on: both copy on write
    return s;
  }

  replaceWith(o) {
    this.env = o.env; this.objs = o.objs; this.own = o.own; this.locks = o.locks; this.trail = o.trail;
    this.dead = o.dead; this.dp = o.dp; this.ret = o.ret; this.tmp = o.tmp;
    this._key = null; this._part = null;
  }

  touch() { this._key = null; this._part = null; }

  get(k) { return this.env.get(k); }

  set(k, v) { this.env.set(k, v); this.touch(); }

  del(k) { if (this.env.delete(k)) this.touch(); }

  obj(id) { return this.objs.get(id); }

  // Writable copy of an object.
  mut(id) {
    const o = this.objs.get(id);
    if (!o) return null;
    this.touch();
    if (this.own.has(id)) return o;
    const c = { ...o };
    this.objs.set(id, c);
    this.own.add(id);
    return c;
  }

  addObj(o) {
    this.objs.set(o.id, o);
    this.own.add(o.id);
    this.touch();
    return o;
  }

  pushTrail(ev) {
    const t = this.trail.length >= 6 ? this.trail.slice(this.trail.length - 5) : this.trail.slice();
    t.push(ev);
    this.trail = t;
  }

  // Partition signature: property states that a path-sensitive checker must
  // not merge (nullness, allocation/free status, locks, uninitialized vars).
  part() {
    if (this._part !== null) return this._part;
    const bits = [];
    for (const [k, v] of this.env) {
      if (v.nul === 'null' || v.nul === 'non') bits.push(`${k}${v.nul === 'null' ? 'z' : 'n'}`);
      if (v.un && !v.un.may) bits.push(`${k}u`);
    }
    for (const [id, o] of this.objs) if (o.ak || o.kind === 'param') bits.push(`${id}${o.st || ''}${o.esc ? 'e' : ''}`);
    for (const [k, l] of this.locks) bits.push(`${k}${l.h}`);
    bits.sort();
    this._part = bits.join(';');
    return this._part;
  }

  key() {
    if (this._key !== null) return this._key;
    const bits = [];
    for (const [k, v] of this.env) bits.push(`${k}=${vKey(v)}`);
    for (const [id, o] of this.objs) bits.push(`#${id}=${oKey(o)}`);
    for (const [k, l] of this.locks) bits.push(`!${k}=${l.h}`);
    bits.sort();
    this._key = bits.join(';');
    return this._key;
  }
}

function joinStates(a, b, widenTh) {
  if (!a) return b;
  if (!b) return a;
  const s = new State();
  for (const [k, va] of a.env) {
    const vb = b.env.get(k);
    if (vb === undefined) continue;
    s.env.set(k, vJoin(va, vb, widenTh));
  }
  for (const [id, oa] of a.objs) {
    const ob = b.objs.get(id);
    s.objs.set(id, ob ? oJoin(oa, ob, widenTh) : oa);
  }
  for (const [id, ob] of b.objs) if (!a.objs.has(id)) s.objs.set(id, ob);
  for (const [k, la] of a.locks) {
    const lb = b.locks.get(k);
    if (!lb) { s.locks.set(k, { ...la, h: la.h === 'held' ? 'maybe' : la.h }); continue; }
    s.locks.set(k, la.h === lb.h ? la : { ...la, h: 'maybe' });
  }
  for (const [k, lb] of b.locks) if (!a.locks.has(k)) s.locks.set(k, { ...lb, h: lb.h === 'held' ? 'maybe' : lb.h });
  s.trail = a.trail;
  s.dp = a.dp && b.dp ? new Set([...a.dp].filter((x) => b.dp.has(x))) : null;
  return s;
}

module.exports = { State, joinStates, vJoin, vEqual, vKey, oJoin, symEq };
