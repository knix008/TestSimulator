// The app's own M file extension (.mym, core/lang/mext.js): new files get it, it is found
// before .m, and .m files keep working.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../core/session.js';
import { createMemoryFs } from '../core/fs-memory.js';
import { M_EXT, isMFile, stripMExt } from '../core/lang/mext.js';

function session(files) {
  let out = '';
  const events = [];
  const s = createSession({ fs: createMemoryFs(files), print: (t) => { out += t; }, onEvent: (e) => events.push(e) });
  const run = (code) => { out = ''; const r = s.evaluate(code); assert.equal(r.ok, true, `${code}: ${r.error && r.error.message}`); return out; };
  return { s, run, events };
}

test('mext: the extension helpers', () => {
  assert.equal(M_EXT, '.mym');
  assert.ok(isMFile('a.mym') && isMFile('b.M') && !isMFile('c.mat') && !isMFile('d.md'));
  assert.equal(stripMExt('dir/f.mym'), 'dir/f');
  assert.equal(stripMExt('g.m'), 'g');
});

test('mext: functions and scripts in .mym files are found, called and run; .m files still work', () => {
  const { run } = session({
    '/home/twice.mym': 'function y = twice(x)\n  y = 2*x;\nend\n',
    '/home/oldstyle.m': 'function y = oldstyle(x)\n  y = x + 100;\nend\n',
    '/home/hello.mym': "disp(['hello from ' mfilename])\n",
  });
  assert.match(run('disp(twice(21))'), /42/);
  assert.match(run('disp(oldstyle(1))'), /101/);
  assert.match(run('hello'), /hello from hello/);
  assert.match(run("run('hello')"), /hello from hello/);
  assert.match(run("run('hello.mym')"), /hello from hello/);
  assert.match(run('what'), /hello[\s\S]*oldstyle[\s\S]*twice|twice[\s\S]*hello/);
});

test('mext: .mym wins over .m of the same name; f.m asked for by name gets f.m', () => {
  const { run } = session({ '/home/pick.mym': "disp('mym')\n", '/home/pick.m': "disp('m')\n" });
  assert.match(run('pick'), /^mym/);
  assert.match(run("run('pick')"), /^mym/);
  assert.match(run("run('pick.m')"), /^m\b/);
});

test('mext: edit of a new name creates a .mym file; completion lists .mym functions', () => {
  const { s, run, events } = session({ '/home/myfun.mym': 'function myfun()\nend\n' });
  run('edit brandnew');
  const open = events.filter((e) => e.type === 'openFile').pop();
  assert.equal(open.path, '/home/brandnew.mym');
  assert.ok(s.complete('myf').some((c) => c.label === 'myfun'));
});
