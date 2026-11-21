// Data management lite, kept inside the project file (no DOM, no kernel):
//   versions — every save adds a numbered version { n, time, author, comment, thumbnail, data } (data = the
//     project's parts, assemblies and drawings as JSON, without the version list itself); compare two versions
//     (documents added / removed / renamed, features added / removed / changed, volume differences through a
//     callback) and roll back (the project's documents replaced by those of a version);
//   check-out / check-in — a lock flag per document: with "require check-out" on, a document that is not checked
//     out is read-only (the app refuses changes to it);
//   where used — which assemblies (also through sub-assemblies) and drawings use a part or an assembly.

export const MAX_VERSIONS = 60;

const DOC_LISTS = ['parts', 'assemblies', 'drawings'];
const KIND_OF = { parts: 'part', assemblies: 'assembly', drawings: 'drawing' };

/** The project's documents as JSON text (what a version keeps). */
export function snapshotOf(project) {
  const data = { name: project.name, units: project.units };
  for (const k of DOC_LISTS) data[k] = project[k] ?? [];
  return JSON.stringify(data);
}

export const versionsOf = (project) => (Array.isArray(project?.versions) ? project.versions : []);
export const latestVersion = (project) => versionsOf(project).at(-1) ?? null;

/**
 * Adds a version (called on every save). Unchanged documents since the last version still get a new number
 * only when `force`; otherwise the call returns { version: last, added: false }. Older versions beyond
 * MAX_VERSIONS lose their data first (kept as history rows), then go.
 */
export function addVersion(project, { author = '', comment = '', thumbnail = null, time = new Date().toISOString(), force = false } = {}) {
  const list = versionsOf(project);
  const data = snapshotOf(project);
  const last = list.at(-1);
  if (last && last.data === data && !force) return { version: last, added: false };
  const version = { n: (last?.n ?? 0) + 1, time, author: String(author ?? ''), comment: String(comment ?? ''), thumbnail: thumbnail ?? null, data, ...summaryOf(JSON.parse(data)) };
  project.versions = [...list, version];
  if (project.versions.length > MAX_VERSIONS) project.versions = project.versions.slice(-MAX_VERSIONS);
  return { version, added: true };
}

/** Counts of a snapshot: { parts, assemblies, drawings, features }. */
function summaryOf(data) {
  return { counts: { parts: data.parts?.length ?? 0, assemblies: data.assemblies?.length ?? 0, drawings: data.drawings?.length ?? 0, features: (data.parts ?? []).reduce((t, p) => t + (p.features?.length ?? 0), 0) } };
}

export const findVersion = (project, n) => versionsOf(project).find((v) => v.n === Number(n)) ?? null;

/** The documents of a version (parsed). The current project counts as version 'current'. */
export function versionData(project, n) {
  if (n === 'current') return JSON.parse(snapshotOf(project));
  const v = findVersion(project, n);
  return v ? JSON.parse(v.data) : null;
}

const featureKey = (f) => JSON.stringify({ ...f, name: undefined });

/**
 * Differences from version a to version b (numbers or 'current'). volumeOf(part) → mm³ (optional, e.g. the
 * kernel's measure) gives volume changes of parts present in both. Returns { from, to, documents: [{ kind, id,
 * name, status: 'added' | 'removed' | 'changed' | 'same', renamed?, features?: { added, removed, changed },
 * components? { added, removed }, volume?: { from, to, change } }], summary { added, removed, changed } }.
 */
export function compareVersions(project, a, b, { volumeOf = null } = {}) {
  const A = versionData(project, a), B = versionData(project, b);
  if (!A || !B) return null;
  const documents = [];
  for (const list of DOC_LISTS) {
    const kind = KIND_OF[list];
    const before = new Map((A[list] ?? []).map((d) => [d.id, d])), after = new Map((B[list] ?? []).map((d) => [d.id, d]));
    for (const [id, d] of after) {
      const old = before.get(id);
      if (!old) { documents.push({ kind, id, name: d.name, status: 'added' }); continue; }
      const entry = { kind, id, name: d.name, status: 'same' };
      if (old.name !== d.name) entry.renamed = { from: old.name, to: d.name };
      if (kind === 'part') {
        const fa = new Map((old.features ?? []).map((f) => [f.id, f])), fb = new Map((d.features ?? []).map((f) => [f.id, f]));
        const added = [...fb.values()].filter((f) => !fa.has(f.id)).map((f) => f.name);
        const removed = [...fa.values()].filter((f) => !fb.has(f.id)).map((f) => f.name);
        const changed = [...fb.values()].filter((f) => fa.has(f.id) && featureKey(fa.get(f.id)) !== featureKey(f)).map((f) => f.name);
        entry.features = { added, removed, changed };
        if (volumeOf) {
          try {
            const v0 = volumeOf(old), v1 = volumeOf(d);
            if (Number.isFinite(v0) && Number.isFinite(v1)) entry.volume = { from: v0, to: v1, change: v1 - v0 };
          } catch { /* no volume */ }
        }
        const other = JSON.stringify({ ...old, features: undefined, name: undefined, annotations: undefined }) !== JSON.stringify({ ...d, features: undefined, name: undefined, annotations: undefined });
        if (added.length || removed.length || changed.length || other || JSON.stringify(old.annotations ?? []) !== JSON.stringify(d.annotations ?? [])) entry.status = 'changed';
      } else if (kind === 'assembly') {
        const ca = new Set((old.components ?? []).map((c) => c.id)), cb = new Set((d.components ?? []).map((c) => c.id));
        entry.components = { added: (d.components ?? []).filter((c) => !ca.has(c.id)).map((c) => c.name), removed: (old.components ?? []).filter((c) => !cb.has(c.id)).map((c) => c.name) };
        if (JSON.stringify({ ...old, name: undefined }) !== JSON.stringify({ ...d, name: undefined })) entry.status = 'changed';
      } else if (JSON.stringify({ ...old, name: undefined }) !== JSON.stringify({ ...d, name: undefined })) entry.status = 'changed';
      if (entry.renamed && entry.status === 'same') entry.status = 'changed';
      documents.push(entry);
    }
    for (const [id, d] of before) if (!after.has(id)) documents.push({ kind, id, name: d.name, status: 'removed' });
  }
  const count = (s) => documents.filter((d) => d.status === s).length;
  return { from: a, to: b, documents, summary: { added: count('added'), removed: count('removed'), changed: count('changed') } };
}

/**
 * Rolls the project back to version n: its parts, assemblies and drawings become those of the version (the
 * version list stays; the next save adds a new version). Check-out flags of documents still present are kept.
 * Returns true when done.
 */
export function rollbackTo(project, n) {
  const data = versionData(project, n);
  if (!data) return false;
  const locks = new Map();
  for (const k of DOC_LISTS) for (const d of project[k] ?? []) if (d.checkout) locks.set(d.id, d.checkout);
  for (const k of DOC_LISTS) project[k] = (data[k] ?? []).map((d) => { const c = { ...d }; delete c.checkout; if (locks.has(d.id)) c.checkout = locks.get(d.id); return c; });
  if (data.units) project.units = data.units;
  const all = DOC_LISTS.flatMap((k) => (project[k] ?? []).map((d) => ({ kind: KIND_OF[k], id: d.id })));
  if (!all.some((r) => r.kind === project.active?.kind && r.id === project.active?.id)) project.active = all[0] ?? null;
  project.rolledBackTo = Number(n);
  return true;
}

// ───────────────────────── check-out / check-in

const docOf = (project, ref) => {
  const list = ref?.kind === 'part' ? project.parts : ref?.kind === 'assembly' ? project.assemblies : ref?.kind === 'drawing' ? project.drawings : null;
  return list?.find((d) => d.id === ref.id) ?? null;
};

export function setRequireCheckout(project, on) { project.vault = { ...(project.vault ?? {}), requireCheckout: Boolean(on) }; }
export const requiresCheckout = (project) => Boolean(project?.vault?.requireCheckout);

/** Checks a document out to `by` (refused when someone else holds it). */
export function checkOut(project, ref, by, time = new Date().toISOString()) {
  const d = docOf(project, ref);
  if (!d) return { ok: false, error: 'missing' };
  if (d.checkout && d.checkout.by !== by) return { ok: false, error: 'held', by: d.checkout.by };
  d.checkout = { by: String(by ?? ''), time };
  return { ok: true };
}

/** Checks a document in (clears its lock). */
export function checkIn(project, ref, by) {
  const d = docOf(project, ref);
  if (!d) return { ok: false, error: 'missing' };
  if (d.checkout && by != null && d.checkout.by !== by) return { ok: false, error: 'held', by: d.checkout.by };
  delete d.checkout;
  return { ok: true };
}

/** True when the document may not be changed: check-out is required and nobody — or someone else — has it. */
export function isReadOnly(project, ref, user = null) {
  if (!requiresCheckout(project)) return false;
  const d = docOf(project, ref);
  if (!d) return false;
  return !d.checkout || (user != null && d.checkout.by !== user);
}

// ───────────────────────── where used

/**
 * Where a part or an assembly is used: [{ kind: 'assembly' | 'drawing', id, name, count (direct instances),
 * via (sub-assembly names when used indirectly) }].
 */
export function whereUsed(project, ref) {
  const out = [];
  const usesDirect = (a) => (a.components ?? []).filter((c) => (ref.kind === 'part' ? c.part === ref.id && !c.sub : c.sub === ref.id)).length;
  const subsOf = (a) => (a.components ?? []).filter((c) => c.sub).map((c) => project.assemblies.find((x) => x.id === c.sub)).filter(Boolean);
  const containing = (a, seen = new Set()) => {
    if (seen.has(a.id)) return [];
    seen.add(a.id);
    const via = [];
    for (const s of subsOf(a)) if (usesDirect(s) || containing(s, seen).length) via.push(s.name);
    return via;
  };
  for (const a of project.assemblies ?? []) {
    if (ref.kind === 'assembly' && a.id === ref.id) continue;
    const count = usesDirect(a);
    const via = containing(a);
    if (count || via.length) out.push({ kind: 'assembly', id: a.id, name: a.name, count, via });
  }
  const users = new Set([ref.id, ...out.map((x) => x.id)]);
  for (const d of project.drawings ?? []) {
    if (!d.source) continue;
    if (d.source.id === ref.id && d.source.kind === ref.kind) out.push({ kind: 'drawing', id: d.id, name: d.name, count: 1, via: [] });
    else if (d.source.kind === 'assembly' && users.has(d.source.id) && d.source.id !== ref.id) out.push({ kind: 'drawing', id: d.id, name: d.name, count: 0, via: [project.assemblies.find((a) => a.id === d.source.id)?.name ?? ''] });
  }
  return out;
}

/** The project without its version data (for a lighter undo history / for comparing). */
export function withoutVersions(project) {
  const { versions, ...rest } = project;
  void versions;
  return rest;
}
