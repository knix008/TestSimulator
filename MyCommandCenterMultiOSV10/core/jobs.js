// Long-running operations (copy, move, delete, archive, search) run as jobs.
//
// A job carries progress (current/total/detail), can be cancelled, and can
// pause on a question for the user — a file conflict — until the UI answers.
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
    this.current = 0;
    this.total = 0;
    this.detail = '';
    this.conflict = null;      // { name, destPath, destIsDir, isMove } while waiting
    this.result = null;
    this.error = null;
    this.createdAt = Date.now();
    this.finishedAt = 0;
    this._cancelled = false;
    this._conflictResolver = null;
    this._applyAll = null;     // 'overwrite' | 'skip' once "apply to all" was ticked
    this._emitTimer = null;
  }

  isCancelled() { return this._cancelled; }

  cancel() {
    if (this.status !== 'running') return;
    this._cancelled = true;
    // A job waiting on a conflict answer is released with "cancel".
    if (this._conflictResolver) this.resolveConflict('cancel', false);
    this._emit();
  }

  setTotal(total) { this.total = total; this._emit(); }

  progress(detail, advance = true) {
    if (advance) this.current++;
    this.detail = detail || '';
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
    if (err && err.code === 'CANCELLED') { this._cancelled = true; this.status = 'cancelled'; }
    else {
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
      detail: this.detail,
      conflict: this.conflict,
      result: this.status === 'running' ? this._partialResult() : this.result,
      error: this.error,
      errorDetail: this.errorDetail || '',
    };
  }

  // Search reports how many hits it has so far while running; the list
  // itself only travels once, when the job is done.
  _partialResult() {
    return this.partial || null;
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

  cancelAll() { for (const j of this.jobs.values()) j.cancel(); }
}

module.exports = { Job, JobRegistry };
