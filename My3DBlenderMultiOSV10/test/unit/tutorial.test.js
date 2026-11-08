// The tutorial as data: every step has words in both languages, starts undone, and Do It for Me finishes it, in order, on a real scene.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { TUTORIAL_STEPS, taskStates, tasksOf } from '../../src/core/tutorial.js';
import { createDefaultScene, setFrame } from '../../src/core/doc.js';
import { History } from '../../src/core/history.js';
import { run } from '../../src/core/ops.js';

function environment() {
  const doc = createDefaultScene();
  const ctx = { doc, history: new History(64), lastOp: null, notify: () => {}, undo: () => {} };
  ctx.history.reset(doc);
  const env = {
    get doc() { return ctx.doc; },
    view: { yaw: 40, pitch: 60, dist: 10, target: [0, 0, 0], camView: false },
    result: null,
    op: (id, props) => run(ctx, id, props),
    touch: () => {},
    setFrame: (n) => setFrame(ctx.doc, n),
    render: () => { env.result = { width: 1 }; },
  };
  return env;
}

describe('tutorial', () => {
  test('every step has a title and text in both languages, and tasks with words', () => {
    assert.ok(TUTORIAL_STEPS.length >= 10);
    assert.equal(new Set(TUTORIAL_STEPS.map((s) => s.id)).size, TUTORIAL_STEPS.length);
    for (const step of TUTORIAL_STEPS) {
      for (const o of [step.title, step.text, ...tasksOf(step)]) {
        assert.ok(o.en.length > 2, step.id);
        assert.ok(/[가-힣]/.test(o.ko), `${step.id} has Korean`);
      }
    }
  });
  test('walking through: each task starts undone, and Do It for Me finishes it', () => {
    const env = environment();
    for (const step of TUTORIAL_STEPS) {
      const memo = step.begin?.(env) ?? {};
      for (const { done, task } of taskStates(step, env, memo)) assert.equal(done, false, `${step.id}/${task.id} starts undone`);
      for (const task of tasksOf(step)) task.run(env, memo);
      for (const { done, task } of taskStates(step, env, memo)) assert.equal(done, true, `${step.id}/${task.id} is done`);
    }
    // What came of it.
    const ball = env.doc.objects.find((o) => /sphere/i.test(o.name));
    assert.ok(ball.data.smooth);
    assert.ok(Object.keys(ball.anim.fcurves).length > 0);
    assert.ok(env.doc.objects.find((o) => o.name === 'Cube').modifiers.some((m) => m.type === 'SUBSURF'));
  });
});

describe('tutorial picture', () => {
  test('the picture the startup question shows is the one the tutorial shows at its first and last steps, and it is shipped', async () => {
    const fs = await import('node:fs');
    const { TUTORIAL_PICTURE } = await import('../../src/core/tutorial.js');
    const app = fs.readFileSync(new URL('../../src/ui/app.js', import.meta.url), 'utf8');
    assert.match(app, /src: `\.\/\$\{TUTORIAL_PICTURE\}`/, 'the popup takes the same file');
    const shown = TUTORIAL_STEPS.filter((s) => s.picture).map((s) => [s.id, s.picture.src]);
    assert.deepEqual(shown, [['welcome', TUTORIAL_PICTURE], ['finish', TUTORIAL_PICTURE]]);
    for (const s of TUTORIAL_STEPS.filter((x) => x.picture)) assert.ok(s.picture.en && s.picture.ko, `${s.id}: a caption in both languages`);
    const file = new URL(`../../public/${TUTORIAL_PICTURE}`, import.meta.url);
    const bytes = fs.readFileSync(file);
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
    assert.ok(bytes.length > 10000, 'a real render, not a blank');
    // The written tutorial shows the same picture.
    const doc = fs.readFileSync(new URL('../../doc/images/tutorial-result.png', import.meta.url));
    assert.ok(doc.equals(bytes), 'doc/images/tutorial-result.png is the same picture');
    for (const name of ['Tutorial.md', 'Tutorial.en.md']) assert.match(fs.readFileSync(new URL(`../../doc/${name}`, import.meta.url), 'utf8'), /images\/tutorial-result\.png/, name);
  });
  test('the shadow terminator offset lifts a point onto the corners\' tangent planes and leaves flat triangles alone', async () => {
    const { terminatorOffset } = await import('../../src/core/pathtracer.js');
    const positions = [0, 0, 0, 1, 0, 0, 0, 1, 0];
    const flat = [0, 0, 1, 0, 0, 1, 0, 0, 1];
    assert.deepEqual(terminatorOffset(positions, flat, 0, [0.25, 0.25, 0], 0.5, 0.25, 0.25), [0.25, 0.25, 0]);
    // Normals leaning outwards, as on a sphere: the middle of the triangle is lifted above its flat plane.
    const k = Math.SQRT1_2;
    const round = [-k, -k, 0, k, 0, k, 0, k, k].map((x, i) => (i % 3 === 2 ? x || 0.5 : x));
    for (let i = 0; i < 9; i += 3) { const l = Math.hypot(round[i], round[i + 1], round[i + 2]); round[i] /= l; round[i + 1] /= l; round[i + 2] /= l; }
    const lifted = terminatorOffset(positions, round, 0, [0.3, 0.3, 0], 0.4, 0.3, 0.3);
    assert.ok(lifted[2] > 0.01, `lifted: ${lifted}`);
  });
});
