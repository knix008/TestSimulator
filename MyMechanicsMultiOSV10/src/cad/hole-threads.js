// Tapped holes of the Hole Wizard (hole kind 'tapped'): every drilled hole (the tap drill, d − P) gets an ISO
// metric internal thread from the face it starts on — cosmetic (a thread record for the view and the
// drawings) or modelled (the ISO 68-1 thread cut from the part, threads.js). Through holes are threaded through
// the material along the axis, blind ones to the thread depth. features.js calls it after drilling.
import { rep } from './kernel.js';
import { isoThread, threadSolid, cosmeticThread, parseThreadSize, wantsModelled, threadFrame, internalRunoutBlank } from './threads.js';

/** The ISO thread a tapped hole feature asks for (its threadSize, "M8" or "M10×1.25"). */
export function tappedSpec(f) {
  const named = parseThreadSize(f.threadSize ?? 'M8');
  if (!named) return null;
  try { return isoThread(named.d, named.P); } catch { return null; }
}

/** The length of material along a line from `at` in direction `dir` (a probe cylinder through the solid). */
function materialRun(body, at, dir, r, maxLen) {
  const R = rep();
  try {
    const probe = R.makeCylinder(r, maxLen, at, dir);
    const v = R.measureVolume(body.clone().intersect(probe, { simplify: false }));
    return v / (Math.PI * r * r);
  } catch { return 0; }
}

/**
 * Threads of a tapped hole feature: `axes` [{ at, dir }] (entry point on the face, into the material),
 * `before` (the body before drilling, to measure through holes), `body` (drilled). Returns
 * { body, thread, threads } — the body re-cut with modelled threads, or unchanged for cosmetic ones.
 */
export function tapHoles(f, axes, before, body, { maxLen = 1e4 } = {}) {
  const spec = tappedSpec(f);
  if (!spec) throw Object.assign(new Error('thread size'), { code: 'thread-size' });
  const modelled = wantsModelled(f.threadMode ?? 'auto');
  const depth = Math.max(0.1, Number(f.depth) || 0);
  const threads = [];
  let out = body;
  for (const { at, dir } of axes) {
    let length;
    if (f.through) length = materialRun(before, at, dir, Math.max(0.05, spec.d1 * 0.25), maxLen);
    else length = Math.min(Math.max(spec.P, Number(f.threadDepth) || 2 * spec.d), depth);
    if (!(length > 1e-6)) continue;
    threads.push(cosmeticThread({ centre: at, dir, length, internal: true, d: spec.d, P: spec.P, radius: (Number(f.diameter) || spec.tapDrill) / 2, modelled }));
    if (modelled) {
      let tool = threadSolid(spec, 'internal', { origin: at, dir, length });
      // A blind tapped hole: the thread fades out over the runout toward the drill's bottom.
      if (!f.through) tool = tool.intersect(internalRunoutBlank(spec, threadFrame(at, dir), length, (Number(f.diameter) || spec.tapDrill) / 2), { simplify: false });
      out = out.cut(tool, { simplify: false });
    }
  }
  return { body: out, thread: threads[0] ?? null, threads };
}

/**
 * Patterns of tapped holes: the threads of the seed hole features copied with the pattern (`places`: one
 * function (point | direction, isDir) → placed per copy); modelled internal threads are cut at the copies too.
 * Returns the pattern's result with `threads` added (unchanged when the seeds have none).
 */
export function patternThreads(f, ctx, out, places) {
  if (f.body || !places.length || !out?.body) return out;
  const seeds = (f.seeds ?? []).filter((id) => ctx.part.features.find((x) => x.id === id)?.type === 'hole').map((id) => ctx.results.get(id)).filter((r) => r?.ok && (r.threads || r.thread));
  if (!seeds.length) return out;
  const threads = []; let body = out.body;
  for (const r of seeds) {
    for (const th of r.threads ?? [r.thread]) {
      if (!th?.major) continue;
      for (const place of places) {
        const copy = { ...th, centre: place(th.centre, false), dir: place(th.dir, true) };
        threads.push(copy);
        if (th.modelled && th.internal) body = body.cut(threadSolid(isoThread(th.major, th.pitch), 'internal', { origin: copy.centre, dir: copy.dir, length: th.length }), { simplify: false });
      }
    }
  }
  return threads.length ? { ...out, body, threads, thread: threads[0] } : out;
}
