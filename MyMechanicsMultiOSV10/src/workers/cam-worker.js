// Machining off the main window's thread: toolpath generation and the stock simulation (with its gouge check)
// run here, so the window stays usable on large parts. The worker keeps the kernel and the machining model of the
// last part between requests (rebuilt only when the part's key changes); the window ends the worker to cancel.
//
// Messages in:  { id, kind: 'generate', key, brep, mesh, context: { stock, tools, machine, material, features, profile }, ops }
//               { id, kind: 'simulate', key, brep, mesh, stock, paths, tools, lathe, cell, tol, profile, threads }
// Messages out: { id, type: 'progress', fraction, text } … then { id, type: 'done', result } or { id, type: 'error', message }
import { loadKernel, rep } from '../cad/kernel.js';
import { machiningModel } from '../cad/cam-features.js';
import { camContext, generateToolpath, profileAt } from '../cad/cam-ops.js';
import { simulateMilling, gougeCheck, simulateTurning, turnGougeCheck, withLiveGouges } from '../cad/cam-sim.js';

let current = { key: null, model: null };

async function modelFor(key, brep, mesh) {
  if (current.key === key && current.model) return current.model;
  await loadKernel();
  let shape = null;
  if (brep) { try { shape = rep().deserializeShape(brep); } catch { shape = null; } }
  current = { key, model: machiningModel(mesh, { shape }) };
  return current.model;
}

self.onmessage = async (event) => {
  const msg = event.data ?? {};
  const { id } = msg;
  const progress = (fraction, text = '') => self.postMessage({ id, type: 'progress', fraction, text });
  try {
    const model = await modelFor(msg.key, msg.brep, msg.mesh);
    if (msg.kind === 'generate') {
      const ctx = camContext({ model, ...msg.context });
      const paths = []; const errors = [];
      const ops = msg.ops.filter((op) => !op.suppressed);
      for (let i = 0; i < ops.length; i++) {
        const op = ops[i];
        progress(i / Math.max(1, ops.length), op.name ?? op.type);
        try { paths.push(generateToolpath(ctx, op)); } catch (error) { errors.push({ op: op.id, code: error.code ?? 'failed', message: error.message }); }
      }
      progress(1);
      self.postMessage({ id, type: 'done', result: { paths, errors } });
      return;
    }
    if (msg.kind === 'simulate') {
      if (msg.lathe) {
        const sim = simulateTurning(msg.stock, msg.paths, msg.tools, { cell: msg.cell });
        const at = (z) => profileAt(msg.profile, z);
        const check = withLiveGouges(turnGougeCheck(sim, at, { tol: msg.tol, threads: msg.threads ?? [] }), sim, model, { tol: msg.tol });
        self.postMessage({ id, type: 'done', result: { sim, check } });
        return;
      }
      const sim = simulateMilling(msg.stock, msg.paths, msg.tools, { cell: msg.cell, onProgress: (f) => progress(f * 0.9) });
      progress(0.92);
      const check = gougeCheck(sim, model, { tol: msg.tol });
      self.postMessage({ id, type: 'done', result: { sim, check } });
      return;
    }
    throw new Error(`unknown request ${msg.kind}`);
  } catch (error) {
    self.postMessage({ id, type: 'error', message: String(error?.message ?? error) });
  }
};
