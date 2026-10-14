// Background image analysis: pictures of the open folder (or any list) go one by
// one to the analysis worker (worker.js) as their cached thumbnails; the page
// only queues, waits and files the results. Progress shows in the status bar,
// results land in the catalog (record.analysis) in small batches, and the
// catalog pane lists them by category (people, scene, objects).
// A picture is analysed again only when the file changed or the analysis
// version went up.
import { kindOf } from '../formats/types.js';
import { t } from '../i18n.js';
import { app } from '../store.js';
import { thumbs } from '../thumbs/thumbs.js';
import { statusProgress } from '../ui/dialog.js';

export const ANALYSIS_VERSION = 1;
const SKIP_KINDS = new Set(['dicom', 'pdf', 'video']); // medical pictures, documents and videos are not sorted this way
const BATCH = 6;

let worker = null;
let ready = null;
let backend = null;
let nextId = 1;
const waiting = new Map(); // id → { resolve, reject }

/** May this item be analysed (a picture, not a folder, a medical image or a video)? */
export const analysable = (item) => item && !item.isDir && !item.archive && kindOf(item.name) != null && !SKIP_KINDS.has(kindOf(item.name));

/** Is the stored analysis of this item still good? */
export function upToDate(item, record) {
  const a = record?.analysis;
  return Boolean(a && a.v === ANALYSIS_VERSION && a.modified === Math.round(item.modified ?? 0));
}

function startWorker() {
  if (ready) return ready;
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (event) => {
    const message = event.data;
    if (message.type === 'ready') { backend = message.backend; waiting.get('init')?.resolve(message.backend); waiting.delete('init'); return; }
    const job = waiting.get(message.id ?? 'init');
    if (!job) return;
    waiting.delete(message.id ?? 'init');
    if (message.type === 'result') job.resolve(message.result); else job.reject(new Error(message.message));
  };
  worker.onerror = (event) => { for (const job of waiting.values()) job.reject(new Error(event.message || 'worker')); waiting.clear(); ready = null; worker = null; };
  ready = new Promise((resolve, reject) => {
    waiting.set('init', { resolve, reject });
    worker.postMessage({ type: 'init', base: new URL('./models/', document.baseURI).href });
  });
  ready.catch(() => { ready = null; worker?.terminate(); worker = null; });
  return ready;
}

function ask(url, faces) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    worker.postMessage({ type: 'analyze', id, url, faces });
  });
}

// ───────── the queue

let queue = [];       // items still to do
let running = null;   // the loop's promise
let stopped = false;
let task = null;      // status bar entry
let done = 0;
let total = 0;
let failed = 0;
const listeners = new Set();
const emit = () => { for (const listener of listeners) listener(state()); };

/** { running, done, total, failed, backend } */
export const state = () => ({ running: Boolean(running), done, total, failed, backend, queued: queue.length });
export const onAnalysis = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };

/**
 * Queues items for analysis (the ones not done yet, unless `force`). `replace`
 * drops what was queued before (another folder was opened).
 */
export function analyze(items, { force = false, replace = false } = {}) {
  const todo = items.filter((item) => analysable(item) && (force || !upToDate(item, app.catalog.get(item.path))));
  if (replace) { total = done; queue = []; }
  const known = new Set(queue.map((item) => item.path));
  for (const item of todo) if (!known.has(item.path)) queue.push(item);
  total = done + queue.length;
  if (queue.length && !running) {
    stopped = false;
    running = loop().finally(() => { running = null; task?.done(); task = null; emit(); });
  }
  emit();
  return todo.length;
}

/** Stops after the picture being analysed now. */
export function stopAnalysis() {
  stopped = true;
  queue = [];
  emit();
}

async function loop() {
  done = 0;
  failed = 0;
  task = statusProgress.start(t('analysis.running'));
  try {
    await startWorker();
  } catch (error) {
    console.warn('analysis', error);
    queue = [];
    const { toast } = await import('../ui/dialog.js');
    toast(t('analysis.noModels', { error: String(error?.message ?? error) }), 'error', 6000);
    return;
  }
  let batch = [];
  const flush = () => { if (batch.length) app.catalog.setAnalysis(batch); batch = []; };
  while (queue.length && !stopped) {
    const item = queue.shift();
    task.update(done, total, item.name);
    try {
      const thumb = await thumbs.get(item, 0);
      if (thumb?.url && !thumb.error) {
        const record = app.catalog.get(item.path);
        const faces = record?.facesScanned ? (record.faces?.length ?? 0) : null;
        const result = await ask(thumb.url, faces);
        batch.push([item.path, { v: ANALYSIS_VERSION, modified: Math.round(item.modified ?? 0), at: Date.now(), ...result }]);
      } else if (!thumb?.cancelled) failed++;
    } catch (error) {
      failed++;
      console.warn('analysis', item.path, error);
    }
    done++;
    if (batch.length >= BATCH) flush();
    emit();
    // Let the page breathe between pictures (input, painting, thumbnails on screen).
    await new Promise((resolve) => (globalThis.requestIdleCallback ? requestIdleCallback(resolve, { timeout: 200 }) : setTimeout(resolve, 16)));
  }
  flush();
}

// ───────── automatic analysis of the open folder

let autoSuspended = false;
let autoTimer = null;
let lastFolder = null;
/** Test hook: keeps the automatic run off for this session (not saved). */
export const suspendAuto = (on = true) => { autoSuspended = on; if (on) clearTimeout(autoTimer); };

/**
 * Called when the list on screen changes: after it settles (2.5 s, so thumbnails
 * on screen come first) the folder's new pictures are analysed, when the setting
 * allows. Another folder replaces what was still queued.
 */
export function autoAnalyze() {
  clearTimeout(autoTimer);
  if (autoSuspended || app.settings?.analysis?.auto === false) return;
  const source = app.state.source;
  if (source?.type !== 'folder') return;
  autoTimer = setTimeout(() => {
    if (autoSuspended || app.state.source !== source) return;
    const replace = lastFolder !== source.path;
    lastFolder = source.path;
    analyze(app.state.list, { replace });
  }, 2500);
}
