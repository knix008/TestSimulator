// Long-running operations (connect, download, upload, remote delete) run as jobs.
//
// A job carries progress — files done / total and bytes done / total with a
// transfer speed — can be cancelled, and can pause on a question for the
// user (a file that already exists at the destination) until the UI answers.
// The Electron main process pushes job snapshots to the renderer over IPC;
// the web server hands them out on request (the browser polls). Both use the
// same object, so the UI code is identical.
'use strict';

const { EventEmitter } = require('events');

let nextId = 1;

class Job extends EventEmitter {
  constructor(kind, meta = {}) {
    super();
    this.id = nextId++;
    this.kind = kind;
    this.meta = meta;
    this.status = 'running';   // running | done | cancelled | error
    this.current = 0;          // files finished
    this.total = 0;            // files to transfer
    this.bytes = 0;            // bytes transferred so far (all files)
    this.bytesTotal = 0;       // bytes to transfer (all files)
    this.speed = 0;            // bytes / second, smoothed
    this.detail = '';          // the file being worked on
    this.conflict = null;      // { name, destPath, destIsDir, kind } while waiting
    this.result = null;
    this.error = null;
    this.errorDetail = '';
    this.notes = [];           // per-file records for the UI log: { seq, ...data }
    this._noteSeq = 0;
    this.createdAt = Date.now();
    this.finishedAt = 0;
    this._cancelled = false;
    this._conflictResolver = null;
    this._applyAll = null;     // 'overwrite' | 'skip' once "apply to all" was ticked
    this._emitTimer = null;
    this._cancelHooks = new Set();
    this._speedSamples = [];   // [time, bytes] over the last ~3 s
  }

  isCancelled() { return this._cancelled; }

  // Registers something to run when the job is cancelled (abort a socket…).
  onCancel(fn) { this._cancelHooks.add(fn); return () => this._cancelHooks.delete(fn); }

  cancel() {
    if (this.status !== 'running') return;
    this._cancelled = true;
    // A job waiting on a conflict answer is released with "cancel".
    if (this._conflictResolver) this.resolveConflict('cancel', false);
    for (const fn of Array.from(this._cancelHooks)) { try { fn(); } catch { /* ignore */ } }
    this._emit();
  }

  throwIfCancelled() {
    if (this._cancelled) throw cancelledError();
  }

  setTotal(total, bytesTotal = 0) { this.total = total; this.bytesTotal = bytesTotal; this._emit(); }

  // A file starts: `detail` is shown to the user.
  begin(detail) { this.detail = detail || ''; this._emit(); }

  // A file finished (advance the file counter).
  advance() { this.current++; this._emit(); }

  // Bytes moved since the previous call (per-file progress adds up here).
  addBytes(delta) {
    if (!delta) return;
    this.bytes += delta;
    const now = Date.now();
    this._speedSamples.push([now, this.bytes]);
    while (this._speedSamples.length > 2 && now - this._speedSamples[0][0] > 3000) this._speedSamples.shift();
    const [t0, b0] = this._speedSamples[0];
    if (now > t0) this.speed = ((this.bytes - b0) * 1000) / (now - t0);
    this._emit();
  }

  // Records something the UI should log (one line per transferred file).
  // Notes ride along in every snapshot, so a burst of small files that all
  // finish between two coalesced updates is still logged in full.
  note(data) {
    this.notes.push({ seq: ++this._noteSeq, ...data });
    if (this.notes.length > 2000) this.notes.splice(0, this.notes.length - 2000);
    this._emit();
  }

  // Asks the UI what to do about an existing destination. Resolves with
  // 'overwrite' | 'skip' | 'cancel'. Remembers the answer when the user
  // ticked "apply to all".
  askConflict(info) {
    if (this._applyAll) return Promise.resolve(this._applyAll);
    if (this._cancelled) return Promise.resolve('cancel');
    return new Promise((resolve) => {
      this.conflict = info;
      this._conflictResolver = resolve;
      this._emit(true);
    });
  }

  resolveConflict(answer, applyAll) {
    const resolve = this._conflictResolver;
    if (!resolve) return false;
    this._conflictResolver = null;
    this.conflict = null;
    const a = ['overwrite', 'skip', 'cancel'].includes(answer) ? answer : 'cancel';
    if (applyAll && a !== 'cancel') this._applyAll = a;
    resolve(a);
    this._emit(true);
    return true;
  }

  finish(result) {
    if (this.status !== 'running') return;
    this.status = this._cancelled ? 'cancelled' : 'done';
    this.result = result === undefined ? null : result;
    this.finishedAt = Date.now();
    this._emit(true);
  }

  fail(err) {
    if (this.status !== 'running') return;
    if ((err && err.code === 'CANCELLED') || this._cancelled) {
      this._cancelled = true;
      this.status = 'cancelled';
    } else {
      this.status = 'error';
      this.error = errorMessage(err);
      // Kept apart from the message so the UI can show/copy it as details.
      this.errorDetail = err && typeof err === 'object'
        ? [err.code && err.code !== 'ERROR' ? `code: ${err.code}` : '', err.path ? `path: ${err.path}` : '', err.stack || ''].filter(Boolean).join('\n')
        : '';
    }
    this.finishedAt = Date.now();
    this._emit(true);
  }

  snapshot() {
    return {
      id: this.id,
      kind: this.kind,
      meta: this.meta,
      status: this.status,
      current: this.current,
      total: this.total,
      bytes: this.bytes,
      bytesTotal: this.bytesTotal,
      speed: this.status === 'running' ? this.speed : 0,
      detail: this.detail,
      conflict: this.conflict,
      result: this.result,
      error: this.error,
      errorDetail: this.errorDetail || '',
      notes: this.notes,
    };
  }

  // Coalesce bursts of progress into ~30 updates/s; `now` forces an update.
  _emit(now = false) {
    if (now) {
      if (this._emitTimer) { clearTimeout(this._emitTimer); this._emitTimer = null; }
      this.emit('update', this.snapshot());
      return;
    }
    if (this._emitTimer) return;
    this._emitTimer = setTimeout(() => {
      this._emitTimer = null;
      this.emit('update', this.snapshot());
    }, 33);
  }
}

function cancelledError() {
  const err = new Error('Cancelled');
  err.code = 'CANCELLED';
  return err;
}

function errorMessage(err) {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  return err.message || String(err);
}

class JobRegistry extends EventEmitter {
  constructor() {
    super();
    this.jobs = new Map();
  }

  create(kind, meta) {
    const job = new Job(kind, meta);
    this.jobs.set(job.id, job);
    job.on('update', (snap) => this.emit('update', snap));
    // Finished jobs stay around for a while so a late poll still sees them.
    const sweep = () => {
      if (job.status === 'running') return;
      setTimeout(() => this.jobs.delete(job.id), 60_000).unref?.();
      job.off('update', sweep);
    };
    job.on('update', sweep);
    return job;
  }

  // Runs `fn(job)`; its return value becomes the job result.
  run(kind, meta, fn) {
    const job = this.create(kind, meta);
    Promise.resolve()
      .then(() => fn(job))
      .then((result) => job.finish(result), (err) => job.fail(err));
    return job;
  }

  get(id) { return this.jobs.get(Number(id)) || null; }

  cancel(id) { const j = this.get(id); if (j) j.cancel(); return !!j; }

  resolveConflict(id, answer, applyAll) {
    const j = this.get(id);
    return j ? j.resolveConflict(answer, applyAll) : false;
  }

  snapshot(id) { const j = this.get(id); return j ? j.snapshot() : null; }

  running() { return Array.from(this.jobs.values()).filter((j) => j.status === 'running'); }

  cancelAll() { for (const j of this.jobs.values()) j.cancel(); }
}

module.exports = { Job, JobRegistry, cancelledError };
