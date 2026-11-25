// Feature patterns that rebuild each instance in place, and sketch-driven variation.
//   instance rebuild  (pattern option "geometry pattern" off) every instance is the seed feature built again on a
//                     copy of its sketch moved to the instance's place: end conditions (through all, up to next,
//                     up to surface, offset from surface) and anything measured from the body are worked out there,
//                     not copied from the seed. Seeds without a sketch (fillets, chamfers …) are copied as geometry.
//   variation         (linear pattern) dimensions of the first seed's sketch change from instance to instance by
//                     a step per instance along direction 1 and along direction 2 — a variable pattern: the copy
//                     of the sketch is solved with the new values before the instance is built.

/** A frame { origin, xDir, yDir, normal } carried by a rigid point map place(q, isDir). */
export function movedFrame(frame, place) {
  return { ...frame, origin: place(frame.origin, false), xDir: place(frame.xDir, true), yDir: place(frame.yDir, true), normal: place(frame.normal, true) };
}

/**
 * A sketch copy drawn mirrored (x → −x in its own plane), so that on the frame { M o, −M x, M y, M n } — a
 * right-handed frame — it lands exactly on the mirror image M of the original. Arcs run the other way round
 * (their ends swap), ellipses turn the other way.
 */
export function mirrorSketchX(sk) {
  for (const e of sk.entities ?? []) {
    if (e.type === 'point' && Number.isFinite(e.x)) e.x = -e.x;
    if (e.type === 'text' && Number.isFinite(e.x)) { e.x = -e.x; if (Number.isFinite(e.rot)) e.rot = -e.rot; }
    if ((e.type === 'arc' || e.type === 'ellipseArc') && e.p1 && e.p2) [e.p1, e.p2] = [e.p2, e.p1];
    if ((e.type === 'ellipse' || e.type === 'ellipseArc') && Number.isFinite(e.rot)) e.rot = Math.PI - e.rot;
  }
  return sk;
}
const neg = (v) => v.map((x) => -x);

/**
 * The tools of one instance: each seed built again on its moved (and varied) sketch. `place` the instance's rigid
 * map, `index` [i, j] (for variation), `build` the feature builder, `solveSketch` the sketch solver.
 * Returns [{ tool, op }] — seeds without a sketch come back as a moved copy of their tool.
 */
export function instanceTools(f, ctx, place, move, index, { build, solveSketch, codeError, mirror = false }) {
  const out = [];
  const vary = Array.isArray(f.vary) ? f.vary.filter((v) => v && v.dim && (Number(v.step) || Number(v.step2))) : [];
  (f.seeds ?? []).forEach((id, k) => {
    const seed = ctx.part.features.find((x) => x.id === id);
    const r = ctx.results.get(id);
    if (!seed || !r?.ok) return;
    const op = r.toolOp ?? (seed.type === 'hole' || seed.op === 'cut' ? 'cut' : 'boss');
    const skr = seed.sketch ? ctx.results.get(seed.sketch) : null;
    const sketch = seed.sketch ? ctx.part.features.find((x) => x.id === seed.sketch && x.type === 'sketch') : null;
    if (!sketch || !skr?.frame) { if (r.tool) out.push({ tool: move(r.tool.clone()), op }); return; }
    const tag = `~${index.join('.')}`;
    const sk = JSON.parse(JSON.stringify(sketch)); sk.id = `${sketch.id}${tag}`;
    // Variation: the first seed's sketch dimensions, stepped by the instance's place in the pattern.
    if (k === 0 && vary.length) {
      for (const v of vary) {
        const c = (sk.constraints ?? []).find((x) => x.id === v.dim);
        if (!c || !Number.isFinite(Number(c.value))) continue;
        c.value = Number(c.value) + (Number(v.step) || 0) * index[0] + (Number(v.step2) || 0) * (index[1] ?? 0);
        if (c.type !== 'angle' && !(c.value > 0)) throw codeError('vary-negative');
      }
      const solved = solveSketch(sk);
      if (!solved.ok) throw codeError('vary-unsolved');
    }
    const copy = JSON.parse(JSON.stringify(seed)); copy.id = `${seed.id}${tag}`; copy.sketch = sk.id;
    const results = new Map(ctx.results);
    let frame = movedFrame(skr.frame, place);
    // A mirror image: the sketch drawn mirrored on a right-handed frame (its normal mirrored, so a boss grows the
    // mirrored way).
    if (mirror) { mirrorSketchX(sk); frame = { ...frame, xDir: neg(frame.xDir) }; }
    results.set(sk.id, { ok: true, frame });
    const ictx = { ...ctx, part: { ...ctx.part, features: [...ctx.part.features, sk, copy] }, results };
    const built = build(copy, ictx) ?? {};
    if (!built.tool) throw codeError('instance-failed');
    out.push({ tool: built.tool, op: built.toolOp ?? op });
  });
  return out;
}

/** Applies instance tools to the body in turn (bosses fused, cuts cut). */
export function applyInstances(body, list) {
  let out = body; let made = 0;
  for (const tools of list) for (const { tool, op } of tools) { out = op === 'cut' ? out.cut(tool) : out.fuse(tool); made++; }
  return { body: out, copies: made };
}
