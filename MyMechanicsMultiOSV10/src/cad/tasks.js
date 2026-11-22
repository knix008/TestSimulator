// Task scheduler: batch jobs run over many project files, now or on a schedule (once, every day at a time, on
// weekdays, every N minutes) while the application is open. A task = { id, name, kind, enabled, source, output,
// options, schedule, lastRun, log }. Kinds:
//   export       — every part / assembly to STEP, IGES, STL, 3MF, GLB, OBJ; every drawing to DXF / SVG
//   import       — neutral model files (STEP, IGES, STL, …) converted to MyMechanics projects
//   properties   — part / drawing properties set on every file (always or only where empty), saved back
//   designCheck  — the design checker run on every file, an HTML report each and a summary CSV
//   rebuild      — every part rebuilt, failures logged, the file saved back (upgraded to the current format)
//   drawings     — a drawing (standard views) made for every part that has none, saved back
// This module holds the data and the rules (schedules, file selection, output names, property updates, logs); the
// app (app-tasks.js) opens the files and runs the operations.

export const TASK_KINDS = ['export', 'import', 'properties', 'designCheck', 'rebuild', 'drawings'];
export const MODEL_FORMATS = ['step', 'iges', 'stl', '3mf', 'glb', 'obj'];
export const DRAWING_FORMATS = ['dxf', 'svg'];
export const IMPORT_EXTENSIONS = ['step', 'stp', 'igs', 'iges', 'stl', 'obj', 'ply', 'gltf', 'glb', '3mf', 'wrl'];
export const SCHEDULES = ['manual', 'once', 'daily', 'weekly', 'interval'];
export const PROPERTY_TARGETS = { part: ['partNo', 'description', 'material', 'color'], drawing: ['company', 'drawnBy', 'checkedBy', 'date', 'partNo', 'revision'] };

const pad = (n) => String(n).padStart(2, '0');
export const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** A new task of `kind` with its defaults. */
export function createTask(kind, { id, name } = {}) {
  const options = {
    export: { formats: ['step'], drawings: ['dxf'], parts: true, assemblies: true },
    import: {},
    properties: { rows: [{ target: 'part', field: 'description', value: '', mode: 'ifEmpty' }] },
    designCheck: { summary: true },
    rebuild: { save: true },
    drawings: { sheet: 'A3', standard: 'ISO' },
  }[kind] ?? {};
  return {
    id: id ?? `task-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    name: name ?? kind, kind, enabled: true,
    source: { type: 'files', paths: [], folder: '', recursive: true, pattern: '*' },
    output: { folder: '', sameAsSource: true, overwrite: true },
    options, schedule: { mode: 'manual', at: '', time: '22:00', weekdays: [1, 2, 3, 4, 5], minutes: 60 },
    created: new Date().toISOString(), lastRun: null, lastStatus: null, log: [],
  };
}

/** The extensions a task reads: neutral models for import, projects otherwise. */
export const sourceExtensions = (task) => (task.kind === 'import' ? IMPORT_EXTENSIONS : ['mymech']);

const globRe = (pattern) => new RegExp(`^${String(pattern || '*').split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`, 'i');
export const baseName = (p) => String(p).split(/[\\/]/).pop();
export const stem = (p) => baseName(p).replace(/\.[^.]+$/, '');
export const dirName = (p) => { const s = String(p); const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\')); return i >= 0 ? s.slice(0, i) : ''; };
const extOf = (p) => (/\.([^.\\/]+)$/.exec(String(p))?.[1] ?? '').toLowerCase();

/** The files a task works on, from a listing of its folder (or its own paths): right extension, name pattern, no duplicates, sorted. */
export function filesOf(task, listing = []) {
  const exts = sourceExtensions(task); const re = globRe(task.source?.pattern);
  const all = task.source?.type === 'folder' ? listing : task.source?.paths ?? [];
  return [...new Set(all)].filter((p) => exts.includes(extOf(p)) && re.test(baseName(p))).sort((a, b) => a.localeCompare(b));
}

/** Where an output goes: the task's folder (or the source's folder), the name made safe, `{name}` / `{date}` / `{doc}` filled. */
export function outputPath(task, source, docName, ext, now = new Date()) {
  const folder = task.output?.sameAsSource !== false || !task.output?.folder ? dirName(source) : task.output.folder;
  const base = String(task.output?.template || (docName ? '{name} - {doc}' : '{name}')).replace(/\{name\}/g, stem(source)).replace(/\{doc\}/g, docName ?? '').replace(/\{date\}/g, isoDay(now)).replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '_').replace(/\s*-\s*$/, '').trim() || 'output';
  return folder ? `${folder}/${base}.${ext}` : `${base}.${ext}`;
}

// ───────────────────────── schedules

const atTime = (day, hhmm) => { const [h, m] = String(hhmm || '00:00').split(':').map(Number); const d = new Date(day); d.setHours(h || 0, m || 0, 0, 0); return d; };

/**
 * When the task runs next, after `now` and after its last run (Date), or null (manual / done / off). A slot missed
 * while the application was closed is due at once (its time is in the past).
 */
export function nextRun(task, now = new Date()) {
  const s = task.schedule ?? {}; if (!task.enabled || s.mode === 'manual' || !s.mode) return null;
  const last = task.lastRun ? new Date(task.lastRun) : new Date(task.created ?? 0);
  if (s.mode === 'once') { const at = s.at ? new Date(s.at) : null; return at && !Number.isNaN(+at) && (!task.lastRun || new Date(task.lastRun) < at) ? at : null; }
  if (s.mode === 'interval') { const step = Math.max(1, Number(s.minutes) || 60) * 60000; return new Date(+last + step); }
  // daily / weekly: the first slot after the last run (a missed slot is in the past → due now).
  const days = s.mode === 'weekly' ? (s.weekdays ?? []).map(Number) : [0, 1, 2, 3, 4, 5, 6];
  if (!days.length) return null;
  const start = new Date(last); start.setHours(0, 0, 0, 0);
  for (let i = 0; i < 15; i++) {
    const day = new Date(start); day.setDate(start.getDate() + i);
    const slot = atTime(day, s.time);
    if (slot > last && days.includes(slot.getDay())) return slot;
  }
  void now;
  return null;
}

/** The enabled tasks due at `now` (their next run at or before it), oldest first. */
export function dueTasks(tasks, now = new Date()) {
  return tasks.map((t) => [t, nextRun(t, now)]).filter(([, at]) => at && at <= now).sort((a, b) => a[1] - b[1]).map(([t]) => t);
}

/** A schedule in words (labels: t-like function for 'sched.*'). */
export function scheduleText(task, t, days = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']) {
  const s = task.schedule ?? {};
  switch (s.mode) {
    case 'once': return t('sched.onceAt', { at: String(s.at ?? '').replace('T', ' ') });
    case 'daily': return t('sched.dailyAt', { time: s.time });
    case 'weekly': return t('sched.weeklyAt', { days: (s.weekdays ?? []).map((d) => days[d]).join(' '), time: s.time });
    case 'interval': return t('sched.every', { minutes: s.minutes });
    default: return t('sched.manual');
  }
}

// ───────────────────────── operations on a project (data only)

/** `{name}` `{file}` `{date}` `{project}` in a property value. */
export const fillValue = (value, { file = '', doc = '', project = '', now = new Date() } = {}) => String(value ?? '').replace(/\{file\}/g, stem(file)).replace(/\{name\}/g, doc).replace(/\{project\}/g, project).replace(/\{date\}/g, isoDay(now));

/** Applies the property rows to every part / drawing; returns [{ doc, field, from, to }] of what changed. */
export function applyProperties(project, rows, { file = '', now = new Date() } = {}) {
  const changes = [];
  for (const row of rows ?? []) {
    if (!row?.field || !PROPERTY_TARGETS[row.target]?.includes(row.field)) continue;
    const list = row.target === 'part' ? project.parts ?? [] : project.drawings ?? [];
    for (const d of list) {
      const holder = row.target === 'part' ? d : (d.title ??= {});
      const from = holder[row.field] ?? '';
      if (row.mode === 'ifEmpty' && String(from).trim()) continue;
      const to = fillValue(row.value, { file, doc: d.name, project: project.name, now });
      if (String(from) === to) continue;
      holder[row.field] = to;
      changes.push({ doc: d.name, field: row.field, from, to });
    }
  }
  return changes;
}

/** Parts without a drawing of their own. */
export const partsWithoutDrawing = (project) => (project.parts ?? []).filter((p) => !(project.drawings ?? []).some((d) => d.source?.kind === 'part' && d.source.id === p.id));

// ───────────────────────── runs and logs

/** A log line { at, level: 'info' | 'ok' | 'error', file, text }. */
export const logLine = (level, file, text, at = new Date()) => ({ at: at.toISOString(), level, file: file ? baseName(file) : '', text });

/** The task after a run: last run, status (ok / errors / failed), the log kept to its last `keep` lines. */
export function finishRun(task, lines, { at = new Date(), keep = 400 } = {}) {
  const errors = lines.filter((l) => l.level === 'error').length;
  const ok = lines.filter((l) => l.level === 'ok').length;
  return { ...task, lastRun: at.toISOString(), lastStatus: errors ? (ok ? 'partial' : 'failed') : 'ok', log: [...(task.log ?? []), { run: at.toISOString(), lines }].slice(-20).map((r) => ({ ...r, lines: r.lines.slice(-keep) })), ...(task.schedule?.mode === 'once' ? { enabled: false } : {}) };
}

/** The log of a run as CSV (time, level, file, message). */
export function logCsv(lines) {
  const q = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return ['Time,Level,File,Message', ...lines.map((l) => [l.at, l.level, l.file, l.text].map(q).join(','))].join('\n') + '\n';
}

/** A task read back from the settings: defaults filled, unknown kinds refused (null). */
export function normalizeTask(raw) {
  if (!raw || !TASK_KINDS.includes(raw.kind)) return null;
  const base = createTask(raw.kind, { id: raw.id, name: raw.name });
  return { ...base, ...raw, source: { ...base.source, ...(raw.source ?? {}) }, output: { ...base.output, ...(raw.output ?? {}) }, options: { ...base.options, ...(raw.options ?? {}) }, schedule: { ...base.schedule, ...(raw.schedule ?? {}) }, log: Array.isArray(raw.log) ? raw.log : [] };
}
