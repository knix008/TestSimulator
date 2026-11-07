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
