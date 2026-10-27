// Session API (CONTRACT.md §7): the M-language engine with every library
// area's builtins, help texts and classes. Used by the worker and by tests.
//
//   const s = createSession({ fs, host, print(text, stream) {}, onEvent(ev) {} });
//   s.evaluate('x = magic(3)');
//
// print streams: 'out' (normal output), 'err' (error reports), 'warn'
// (warnings), 'echo' (echoed commands and input() answers).
// Options beyond the contract: `registry` (a buildRegistry() result to use
// instead of the full one).
import { buildRegistry } from './registry.js';
import { createSessionWith } from './lang/session.js';

export function createSession(opts = {}) {
  const registry = opts.registry || buildRegistry();
  return createSessionWith(registry, opts);
}

export { createSessionWith };
