// Class support for the M language.
//
// ClassInfo describes a class: user `classdef` classes (built by the
// interpreter from source files) and classes written in JS by the library
// areas (CONTRACT.md §5, wrapped by makeJsClassInfo). The language registers a
// few JS classes of its own here: MException, onCleanup, event.listener.
//
// Library areas may use objectValue() to create instances of their JS classes.
import { MError, str, empty, bool, cellRow, struct, toStr, isText, isCell, object } from './value.js';

export class ClassInfo {
  constructor(name) {
    this.name = name;
    this.supers = [];
    this.isHandle = false;
    this.dynamic = false;
    this.props = new Map();
    this.methods = new Map();
    this.getters = new Map();
    this.setters = new Map();
    this.events = new Set();
    this.enumDefs = [];
    this.ctorFi = null;
    this.js = null;
    this.file = null;
    this.attrs = {};
  }
  findMethod(name) {
    const m = this.methods.get(name);
    if (m) return m;
    for (const s of this.supers) { const r = s.findMethod(name); if (r) return r; }
    return null;
  }
  findProp(name) {
    const p = this.props.get(name);
    if (p) return p;
    for (const s of this.supers) { const r = s.findProp(name); if (r) return r; }
    return null;
  }
  findGetter(name) {
    const g = this.getters.get(name);
    if (g) return g;
    for (const s of this.supers) { const r = s.findGetter(name); if (r) return r; }
    return null;
  }
  findSetter(name) {
    const g = this.setters.get(name);
    if (g) return g;
    for (const s of this.supers) { const r = s.findSetter(name); if (r) return r; }
    return null;
  }
  isa(name) {
    if (this.name === name) return true;
    if (name === 'handle' && this.isHandle) return true;
    return this.supers.some((s) => s.isa(name));
  }
  allPropNames() {
    const out = new Set();
    for (const s of this.supers) for (const n of s.allPropNames()) out.add(n);
    for (const n of this.props.keys()) out.add(n);
    if (this.js && this.js.def.props) for (const n of this.js.def.props) out.add(n);
    return out;
  }
  publicPropNames() {
    const out = [];
    for (const n of this.allPropNames()) {
      const p = this.findProp(n);
      if (!p || (p.get === 'public' && !p.hidden)) out.push(n);
    }
    return out;
  }
  allMethodNames() {
    const out = new Set();
    for (const s of this.supers) for (const n of s.allMethodNames()) out.add(n);
    for (const [n, m] of this.methods) if (m.access === 'public' || m.access === undefined) out.add(n);
    if (this.ctorFi) out.add(this.name.slice(this.name.lastIndexOf('.') + 1));
    if (this.isHandle) for (const n of ['addlistener', 'delete', 'eq', 'isvalid', 'ne', 'notify', 'listener']) out.add(n);
    return out;
  }
  isAbstract() {
    if (this.attrs && this.attrs.Abstract) return true;
    for (const m of this.methods.values()) if (m.fi && m.fi.abstract) return true;
    for (const p of this.props.values()) if (p.abstract) return true;
    return false;
  }
}

/** Wraps a JS class definition (CONTRACT §5). */
export function makeJsClassInfo(name, def) {
  const ci = new ClassInfo(name);
  ci.js = { def };
  ci.isHandle = !!def.handle;
  for (const [k, fn] of Object.entries(def.methods || {})) ci.methods.set(k, { js: true, fn, access: 'public', cls: ci });
  return ci;
}

/** Creates an instance value of a JS class. */
export function objectValue(cls, props = {}, handle = false) {
  return object(cls, props, { handle });
}

// ------------------------------------------------------------------ implicit methods of user classes
// Methods every classdef object has (handle-class methods and a few conversions).
// Each returns Value[] or null when it does not apply.
export const HANDLE_METHODS = new Map();

HANDLE_METHODS.set('delete', (rt, obj) => {
  if (!obj.handle) return null;
  rt.deleted.add(obj.props);
  return [];
});
HANDLE_METHODS.set('isvalid', (rt, obj) => (obj.handle ? [bool(!rt.deleted.has(obj.props))] : null));
const addListener = (rt, obj, args) => {
  if (!obj.handle) return null;
  let evname, cb;
  if (args.length >= 4) { evname = toStr(args[2]) + ':' + toStr(args[1]); cb = args[3]; }
  else { evname = toStr(args[1]); cb = args[2]; }
  if (!cb || cb.cls !== 'function_handle') throw new MError('core:addlistener:callback', 'The listener callback must be a function handle.');
  const ci = rt.classOf(obj);
  const base = evname.includes(':') ? evname.split(':')[1] : evname;
  if (ci && !ci.js && !evname.includes(':') && !ci.events.has(base) && !hasEvent(ci, base)) throw new MError('core:addlistener:noEvent', `Event '${base}' is not defined for class '${obj.cls}'.`);
  let lmap = rt.listeners.get(obj.props);
  if (!lmap) { lmap = new Map(); rt.listeners.set(obj.props, lmap); }
  const list = lmap.get(evname) || [];
  const rec = { cb, enabled: true };
  list.push(rec);
  lmap.set(evname, list);
  const props = Object.create(null);
  props.Source = cellRow([obj]);
  props.EventName = str(evname);
  props.Callback = cb;
  props.Enabled = bool(true);
  const l = { cls: 'event.listener', isObject: true, dims: [1, 1], handle: true, props, rec };
  return [l];
};
function hasEvent(ci, name) { if (ci.events.has(name)) return true; return ci.supers.some((s) => hasEvent(s, name)); }
HANDLE_METHODS.set('addlistener', addListener);
HANDLE_METHODS.set('listener', addListener);
HANDLE_METHODS.set('notify', (rt, obj, args) => {
  if (!obj.handle) return null;
  const evname = toStr(args[1]);
  const lmap = rt.listeners.get(obj.props);
  const list = lmap ? lmap.get(evname) : null;
  if (!list) return [];
  const data = args[2] && args[2].isObject ? args[2] : rt.eventData(obj, evname);
  if (args[2] && args[2].isObject) { data.props.Source = obj; data.props.EventName = str(evname); }
  for (const l of list.slice()) if (l.enabled) rt.callHandle(l.cb, [obj, data], 0);
  return [];
});
HANDLE_METHODS.set('copy', (rt, obj) => {
  if (!obj.handle) return null;
  return [{ ...obj, props: Object.assign(Object.create(null), obj.props) }];
});
HANDLE_METHODS.set('addprop', (rt, obj, args) => {
  const ci = rt.classOf(obj);
  if (!ci || !ci.dynamic) return null;
  const name = toStr(args[1]);
  obj.props[name] = empty();
  return [];
});
HANDLE_METHODS.set('disp', (rt, obj) => { rt.out(rt.dispText(obj)); return []; });
HANDLE_METHODS.set('display', (rt, obj, args) => {
  const name = args[1] && isText(args[1]) ? toStr(args[1]) : 'ans';
  rt.out(`${name} = \n\n${rt.dispText(obj)}\n`);
  return [];
});
HANDLE_METHODS.set('char', (rt, obj) => (obj.enumName !== undefined ? [str(obj.enumName)] : null));
HANDLE_METHODS.set('string', (rt, obj) => (obj.enumName !== undefined ? [{ cls: 'string', dims: [1, 1], data: [obj.enumName] }] : null));
HANDLE_METHODS.set('fieldnames', (rt, obj) => {
  const ci = rt.classOf(obj);
  if (!ci) return null;
  const names = ci.publicPropNames();
  return [{ cls: 'cell', dims: [names.length, 1], data: names.map((n) => str(n)) }];
});

// ------------------------------------------------------------------ language JS classes

function messageFrom(ctx, fmt, rest) {
  return ctx.interp.formatMessage(fmt, rest);
}

export const langClasses = {
  MException: {
    handle: false,
    props: ['identifier', 'message', 'stack', 'cause', 'Correction'],
    construct(args, ctx) {
      if (args.length < 2) throw new MError('core:MException:args', 'MException requires an identifier and a message.');
      const id = toStr(args[0]);
      if (id && !/^[A-Za-z][\w-]*(:[\w-]+)+$/.test(id)) throw new MError('core:MException:badId', 'The identifier must contain a component and a mnemonic separated by a colon, for example \'myComponent:myError\'.');
      const msg = messageFrom(ctx, toStr(args[1]), args.slice(2));
      const props = Object.create(null);
      props.identifier = str(id);
      props.message = str(msg);
      props.stack = struct([0, 1], ['file', 'name', 'line'], []);
      props.cause = { cls: 'cell', dims: [0, 1], data: [] };
      props.Correction = empty();
      return { cls: 'MException', isObject: true, dims: [1, 1], handle: false, props };
    },
    methods: {
      throw(args, nargout, ctx) { const e = ctx.interp.errorFromMException(args[0], false); e.fromError = true; e.extra.noFn = true; throw e; },
      throwAsCaller(args, nargout, ctx) { const e = ctx.interp.errorFromMException(args[0], false); e.fromError = true; e.extra.noFn = true; throw e; },
      rethrow(args, nargout, ctx) { const e = ctx.interp.errorFromMException(args[0], true); e.frozen = true; e.fromError = true; e.extra.noFn = true; throw e; },
      getReport(args, nargout, ctx) {
        const obj = args[0];
        const e = ctx.interp.errorFromMException(obj, true);
        if (obj.merror) e.extra = obj.merror.extra;
        return str(ctx.interp.errorReport(e));
      },
      addCause(args) {
        const [obj, c] = args;
        if (!c || c.cls !== 'MException') throw new MError('core:MException:cause', 'The cause must be an MException object.');
        const props = Object.assign(Object.create(null), obj.props);
        const old = isCell(props.cause) ? props.cause.data : [];
        props.cause = { cls: 'cell', dims: [old.length + 1, 1], data: [...old, c] };
        return { ...obj, props, merror: null };
      },
      addCorrection(args) { return args[0]; },
    },
  },
  onCleanup: {
    handle: true,
    props: ['task'],
    construct(args, ctx) {
      const task = args[0];
      if (!task || task.cls !== 'function_handle') throw new MError('core:onCleanup:badTask', 'onCleanup requires a function handle.');
      ctx.interp.cleanupLive++;
      const props = Object.create(null);
      props.task = task;
      return { cls: 'onCleanup', isObject: true, dims: [1, 1], handle: true, props };
    },
    methods: {
      delete(args, nargout, ctx) { ctx.interp.fireCleanup(args[0]); return []; },
    },
    display(obj) { return '  onCleanup with properties:\n\n    task: ' + (obj.props.task.text || '@' + obj.props.task.name); },
  },
  'event.listener': {
    handle: true,
    props: ['Source', 'EventName', 'Callback', 'Enabled'],
    construct(args, ctx) {
      const r = HANDLE_METHODS.get('addlistener')(ctx.interp, args[0], args);
      return r[0];
    },
    methods: {
      delete(args) { const l = args[0]; if (l.rec) l.rec.enabled = false; return []; },
    },
    subsasgn(obj, subs, rhs) {
      if (subs.length === 1 && subs[0].type === '.' && subs[0].subs === 'Enabled') {
        obj.props.Enabled = rhs;
        if (obj.rec) obj.rec.enabled = rhs.re ? rhs.re[0] !== 0 : true;
        return obj;
      }
      throw new MError('core:listener:set', 'Only the Enabled property of a listener can be set.');
    },
  },
  'meta.class': {
    handle: true,
    props: ['Name', 'SuperclassList', 'PropertyList', 'MethodList', 'EventList', 'HandleCompatible', 'Abstract', 'EnumerationMemberList'],
  },
  'event.EventData': {
    handle: true,
    props: ['Source', 'EventName'],
    construct() { const props = Object.create(null); props.Source = empty(); props.EventName = str(''); return { cls: 'event.EventData', isObject: true, dims: [1, 1], handle: true, props }; },
  },
};
