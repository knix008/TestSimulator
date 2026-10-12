// Frame cost of the 3D view in the real app (GPU included): opens samples in
// the desktop app, orbits the camera and times the frames.
//
//   npm run bench:3d:gui                    the large samples
//   npm run bench:3d:gui -- 03 10           samples whose file name contains one of these
//
// frameMs:  one orbit step rendered and finished on the GPU (gl.finish), median
// orbitFps: frames per second of a 2 s orbit on the display (capped by vsync)
// editMs:   moving one item and rebuilding the 3D model
// calls:    draw calls of one frame
import { launch, sleep } from "../test/smoke/driver.mjs";

const filters = process.argv.slice(2).filter((x) => !x.startsWith("--"));
const SAMPLES = ["03-two-storey-house.myarch", "11-mixed-use.myarch", "13-school.myarch", "10-office-tower.myarch"];
const files = filters.length ? SAMPLES.concat(["01-studio.myarch", "12-hospital.myarch", "15-sketchup-complex.myarch"]).filter((f) => filters.some((x) => f.includes(x))) : SAMPLES;

const a = await launch({ width: 1500, height: 950 });
const app = (expr) => a.ev(`const app = window.myarchApp; ${expr}`);
const rows = [];
try {
  for (let i = 0; i < 80; i++) { if (await app(`return !!(app && app.store)`).catch(() => false)) break; await sleep(250); }
  for (const file of files) {
    await app(`app.store.dirty = false; await app.openSample(${JSON.stringify(file)}); app.setTab("3d"); await app.v3d.ensure(); return 1`);
    await sleep(1500);
    const r = await app(`
      const v = app.v3d.viewer, t = v.three, gl = t.renderer.getContext();
      v.setView("iso"); await new Promise((r) => setTimeout(r, 800));
      const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
      // GPU-finished frame cost of an orbit step.
      const times = [];
      for (let i = 0; i < 40; i++) {
        v.orbit(1, 0);
        const t0 = performance.now();
        t.renderer.render(t.scene, t.camera);
        gl.finish();
        times.push(performance.now() - t0);
        await frame();
      }
      times.sort((a, b) => a - b);
      t.renderer.render(t.scene, t.camera);
      const calls = t.renderer.info.render.calls;
      // Real orbit on the display.
      let n = 0; const s0 = performance.now();
      while (performance.now() - s0 < 2000) { v.orbit(1.5, 0); await frame(); n++; }
      const fps = n / ((performance.now() - s0) / 1000);
      // Edit: move one item, rebuild.
      const p = app.store.project;
      const f = p.furniture.find((x) => x.level === p.levels[0].id) || p.furniture[0];
      const e = [];
      for (let i = 0; i < 5; i++) { f.x += 10; const t0 = performance.now(); v.setProject(p); e.push(performance.now() - t0); }
      e.sort((a, b) => a - b);
      return { frameMs: +times[20].toFixed(2), orbitFps: +fps.toFixed(1), editMs: +e[2].toFixed(1), calls, stats: v.stats() };
    `);
    rows.push({ file, ...r });
    console.log(file.padEnd(28), `frame ${String(r.frameMs).padStart(6)} ms`, `orbit ${String(r.orbitFps).padStart(5)} fps`, `edit ${String(r.editMs).padStart(6)} ms`, `calls ${String(r.calls).padStart(6)}`, JSON.stringify(r.stats));
  }
} finally {
  a.child.kill();
}
