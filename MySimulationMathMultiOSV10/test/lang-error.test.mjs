// Language: errors with identifiers, try/catch, MException, warnings, assert,
// onCleanup and error reports with an M stack.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSessionWith } from '../core/lang/session.js';
import { createMemoryFs } from '../core/fs-memory.js';

function session(files = {}) {
  const out = [];
  const fs = createMemoryFs(files);
  const s = createSessionWith(null, { fs, print: (t, st) => out.push([st, t]) });
  return {
    s, out,
    run(code) { const r = s.evaluate(code); if (!r.ok) throw Object.assign(new Error(r.error.message), { id: r.error.identifier }); return r; },
    fail(code) { const r = s.evaluate(code); assert.equal(r.ok, false, `expected an error from: ${code}`); return r.error; },
    v(name) { const v = s.getVariable(name); if (v == null) return v; if (v.cls === 'char') return String.fromCharCode(...v.re); if (v.re) return v.re.length === 1 ? v.re[0] : Array.from(v.re); return v; },
    text(stream) { return out.filter((o) => !stream || o[0] === stream).map((o) => o[1]).join(''); },
  };
}

test('error with identifier and formatted message is caught with try/catch', () => {
  const h = session();
  h.run("try, error('my:id', 'Value %d is bad (%s).', 7, 'x'); catch ME, id = ME.identifier; msg = ME.message; end");
  assert.equal(h.v('id'), 'my:id');
  assert.equal(h.v('msg'), 'Value 7 is bad (x).');
  h.run("try, error('plain text %d'); catch e2, m2 = e2.message; i2 = e2.identifier; end");
  assert.equal(h.v('m2'), 'plain text %d');
  assert.equal(h.v('i2'), '');
  h.run("try, error('Width is %d.', 4); catch e3, m3 = e3.message; end");
  assert.equal(h.v('m3'), 'Width is 4.');
  h.run("try, x = [1 2](3); catch, caught = 1; end");
  assert.equal(h.v('caught'), 1);
});

test('runtime errors carry identifiers', () => {
  const h = session();
  h.run("try, undefinedThing + 1; catch ME, a = ME.identifier; end; try, q = [1 2 3]; q(5); catch ME, b = ME.identifier; end; try, [1 2] + [1 2 3]; catch ME, c = ME.identifier; end");
  assert.equal(h.v('a'), 'core:UndefinedFunction');
  assert.equal(h.v('b'), 'core:index:outOfBounds');
  assert.equal(h.v('c'), 'core:sizeDimensionsMustMatch');
});

test('MException objects: construct, throw, rethrow, causes and reports', () => {
  const h = session({
    '/home/thrower.m': "function thrower()\nME = MException('pkg:fail', 'Failed with %d items.', 3);\nthrow(ME);\nend\n",
    '/home/wrapper.m': "function wrapper()\ntry\n  thrower();\ncatch inner\n  outer = MException('pkg:outer', 'Outer failure.');\n  outer = addCause(outer, inner);\n  throw(outer);\nend\nend\n",
  });
  h.run('try, thrower(); catch ME, id = ME.identifier; msg = ME.message; st = ME.stack; n = st(1).name; ln = st(1).line; end');
  assert.equal(h.v('id'), 'pkg:fail');
  assert.equal(h.v('msg'), 'Failed with 3 items.');
  assert.equal(h.v('n'), 'thrower');
  assert.equal(h.v('ln'), 3);
  h.run('try, wrapper(); catch ME, c = ME.cause; cid = c{1}.identifier; rep = getReport(ME); end');
  assert.equal(h.v('cid'), 'pkg:fail');
  assert.match(h.v('rep'), /Outer failure\./);
  h.run("try, try, error('a:b', 'first'); catch E, rethrow(E); end; catch F, r = F.identifier; end");
  assert.equal(h.v('r'), 'a:b');
  assert.match(h.fail("MException('bad id', 'x')").message, /identifier/);
});

test('error reports show the function, line and call stack', () => {
  const h = session({
    '/home/inner1.m': "function inner1(x)\ny = x;\nerror('my:boom', 'Boom %d.', y);\nend\n",
    '/home/outer1.m': 'function outer1()\ninner1(5);\nend\n',
  });
  const e = h.fail('outer1()');
  assert.equal(e.identifier, 'my:boom');
  assert.deepEqual(e.stack.map((s) => [s.name, s.line]), [['inner1', 3], ['outer1', 2]]);
  const err = h.text('err');
  assert.match(err, /Error using inner1 \(line 3\)\nBoom 5\./);
  assert.match(err, /Error in outer1 \(line 2\)/);
  const e2 = h.fail('nosuchfunction(1)');
  assert.match(e2.message, /Undefined function 'nosuchfunction' for input arguments of type 'double'/);
});

test('error struct, empty message and lasterr', () => {
  const h = session();
  h.run("error(''); s.message = 'From struct.'; s.identifier = 'st:id'; try, error(s); catch ME, m = ME.message; i = ME.identifier; end; [le, lid] = lasterr;");
  assert.equal(h.v('m'), 'From struct.');
  assert.equal(h.v('i'), 'st:id');
  assert.equal(h.v('le'), 'From struct.');
  assert.equal(h.v('lid'), 'st:id');
});

test('warnings: display, identifiers, on/off/query state and lastwarn', () => {
  const h = session();
  h.run("warning('w:one', 'First %d.', 1); [m, id] = lastwarn;");
  assert.equal(h.v('m'), 'First 1.');
  assert.equal(h.v('id'), 'w:one');
  assert.match(h.text('warn'), /Warning: First 1\./);
  h.run("warning('off', 'w:one'); warning('w:one', 'Hidden.'); [m2] = lastwarn; st = warning('query', 'w:one'); s2 = st.state;");
  assert.equal(h.v('m2'), 'First 1.');
  assert.equal(h.v('s2'), 'off');
  assert.doesNotMatch(h.text('warn'), /Hidden/);
  h.run("warning('on', 'w:one'); warning off all; warning('w:two', 'Off too.'); warning on all; warning('w:two', 'Back.');");
  assert.doesNotMatch(h.text('warn'), /Off too/);
  assert.match(h.text('warn'), /Back\./);
  h.run("warning('error', 'w:three');");
  assert.match(h.fail("warning('w:three', 'Now an error.')").message, /Now an error/);
});

test('assert', () => {
  const h = session();
  h.run('assert(1 == 1); assert([1 1 1] > 0, "unused");');
  assert.match(h.fail('assert(1 == 2)').message, /Assertion failed/);
  const e = h.fail("assert(0, 'my:assert', 'Expected %d.', 3)");
  assert.equal(e.identifier, 'my:assert');
  assert.equal(e.message, 'Expected 3.');
});

test('onCleanup runs when the function exits, also on error', () => {
  const h = session({
    '/home/withclean.m': "function withclean(fail)\nc = onCleanup(@() assignin('base', 'cleaned', 1));\nif fail, error('x:y', 'failing'); end\nassignin('base', 'body', 1);\nend\n",
  });
  h.run('cleaned = 0; withclean(0);');
  assert.equal(h.v('cleaned'), 1);
  assert.equal(h.v('body'), 1);
  h.run('cleaned = 0; try, withclean(1); catch, end');
  assert.equal(h.v('cleaned'), 1);
  h.run("cleaned = 0; c = onCleanup(@() assignin('base', 'cleaned', 2)); clear c");
  assert.equal(h.v('cleaned'), 2);
});

test('try/catch inside loops and functions keeps the call stack consistent', () => {
  const h = session({ '/home/maybeFail.m': "function r = maybeFail(k)\nif k == 2, error('m:f', 'two'); end\nr = k;\nend\n" });
  h.run('t = 0; for k = 1:3, try, t = t + maybeFail(k); catch, t = t + 100; end, end');
  assert.equal(h.v('t'), 104);
  assert.equal(h.s.interp.stack.length, 0);
});

test('uncaught errors print a report and the session keeps working', () => {
  const h = session();
  const r = h.s.evaluate("error('top:level', 'At top.')");
  assert.equal(r.ok, false);
  assert.equal(r.error.identifier, 'top:level');
  assert.match(h.text('err'), /At top\./);
  h.run('x = 1 + 1;');
  assert.equal(h.v('x'), 2);
});
