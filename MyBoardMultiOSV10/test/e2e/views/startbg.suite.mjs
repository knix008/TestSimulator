// The start page's moving background: speed changes act at once without restarting the scene, and the
// cumulative-flow scene scrolls smoothly (no jump when a new day enters on the right).
import assert from 'node:assert/strict';

export const cases = [
  {
    group: 'Start page',
    name: 'Background speed: − / + and the slider change the pace at once; other settings do not restart the scene',
    async run(app) {
      const r = await app.run(`await T.reset(); await T.until(() => A.startBackground()?.running, 8000, 'background running');
        A.actions.updateSettings({ backgroundKind: 'animated', animationSpeed: 100, animationInterval: 0 }, { quiet: true });
        const bg = () => A.startBackground();
        const pace = async () => { const t0 = bg().time; const s = performance.now(); await new Promise((r) => setTimeout(r, 600)); return (bg().time - t0) / ((performance.now() - s) / 1000); };
        const slow = await pace();
        const plus = document.querySelector('.start-speed [data-start-speed]').parentElement.querySelector('[data-slider-step="1"]');
        for (let i = 0; i < 10; i++) { plus.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })); window.dispatchEvent(new PointerEvent('pointerup')); }
        const stored = A.state.settings.animationSpeed;
        const fast = await pace();
        const before = bg().time; const same = bg();
        A.actions.updateSettings({ startCardOpacity: A.state.settings.startCardOpacity === 90 ? 85 : 90 });
        await T.frames(3);
        const after = bg().time;
        A.actions.updateSettings({ animationSpeed: 100, animationInterval: 60 }, { quiet: true });
        return { slow, fast, stored, before, after, rebuilt: same !== bg() };`);
      assert.equal(r.stored, 200, 'ten + steps of 10 % → 200 %');
      assert.ok(r.fast > r.slow * 1.6, `pace grows with the speed (${r.slow.toFixed(2)} → ${r.fast.toFixed(2)})`);
      assert.ok(r.after >= r.before, `the scene carries on after the start page is drawn again (${r.before.toFixed(2)} → ${r.after.toFixed(2)})`);
    },
  },
  {
    group: 'Start page',
    name: 'Cumulative flow: scrolling is continuous (a new day entering does not make the bands jump)',
    async run(app) {
      const r = await app.run(`await T.reset(); await T.until(() => A.startBackground(), 8000, 'background');
        const bg = A.startBackground(); bg.stop(); bg.setKind('cumulativeFlow');
        const c = bg.canvas; const w = c.width; const dx = w / 40;
        const frame = (time) => { bg.time = time; bg.draw(); return c.getContext('2d').getImageData(0, 0, w, c.height).data; };
        const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); return s / (a.length / 4); };
        const step = 0.02;
        const wrapAt = (5 * dx) / 18;
        const across = diff(frame(wrapAt - step / 2), frame(wrapAt + step / 2));
        const within = diff(frame(wrapAt + dx / 36 - step / 2), frame(wrapAt + dx / 36 + step / 2));
        bg.setKind(A.state.settings.animation);
        return { across, within };`);
      assert.ok(r.across < Math.max(r.within * 3, 0.05), `a day boundary looks like any other frame step (across ${r.across.toFixed(3)}, within ${r.within.toFixed(3)})`);
    },
  },
];
