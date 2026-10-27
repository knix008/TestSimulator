// A minimal ctx for unit tests of library builtins, used before (or without)
// the interpreter. ctx.call accepts a builtin name, a function handle naming a
// builtin, or a handle with a `jsfn(args, nargout)` field (test-only).
import { buildRegistry } from '../../core/registry.js';
import { MError, isFuncHandle } from '../../core/value.js';
import { createMemoryFs } from '../../core/fs-memory.js';

export function mockCtx(opts = {}) {
  const reg = opts.registry || buildRegistry();
  const out = [];
  const warnings = [];
  const handlers = [];
  const vars = Object.create(null);
  const ctx = {
    registry: reg,
    outText: out,
    warnings,
    state: {},
    format: { numeric: 'short', spacing: 'loose' },
    fs: opts.fs || createMemoryFs(),
    host: opts.host || { post() {}, request() { return null; } },
    out(text) { out.push(text); },
    errOut(text) { out.push(text); },
    warning(id, message) { warnings.push({ id, message }); },
    onMessage(prefix, fn) { handlers.push([prefix, fn]); },
    checkInterrupt() {},
    getVar(name) { return vars[name]; },
    setVar(name, v) { vars[name] = v; },
    evalString() { throw new MError('test:noInterpreter', 'evalString is not available in mockCtx'); },
    call(fn, args, nargout = 1) {
      let r;
      if (typeof fn === 'string') {
        const b = reg.builtins[fn];
        if (!b) throw new MError('test:undefined', `Undefined function '${fn}'.`);
        r = b(args, nargout, ctx);
      } else if (isFuncHandle(fn) && fn.jsfn) {
        r = fn.jsfn(args, nargout);
      } else if (isFuncHandle(fn) && fn.name) {
        return ctx.call(fn.name, args, nargout);
      } else throw new MError('test:badCall', 'mockCtx cannot call this value');
      return Array.isArray(r) ? r : r === undefined ? [] : [r];
    },
    dispatch(msg) { for (const [p, fn] of handlers) if (msg.type.startsWith(p)) fn(msg); },
  };
  for (const install of reg.installs) install(ctx);
  return ctx;
}

/** A JS function as a function handle for tests: fh((x) => ..) gets numbers in, Values out handled by caller. */
export const jsHandle = (jsfn) => ({ cls: 'function_handle', dims: [1, 1], jsfn });
