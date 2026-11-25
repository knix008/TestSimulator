// Feature order and feature folders of a part.
//   moveFeature   a feature (with the sketch only it uses, kept just before it) moved before another feature (or to
//                 the end): refused when a feature would come before one it refers to — any reference: its sketch,
//                 planes, seeds, paths, curves … (a feature's id anywhere in another's settings).
//   folders       part.folders = [{ id, name, members: [feature ids] }]: features grouped in the tree; members are
//                 next to each other in the part's order (a folder is made from adjacent features, a feature dropped
//                 on a folder is moved to its end).

/** The ids of other features a feature refers to (anywhere in its settings). */
export function referencesOf(f, ids) {
  const text = JSON.stringify({ ...f, id: undefined, name: undefined });
  return ids.filter((id) => id !== f.id && text.includes(`"${id}"`));
}

/** Whether every feature comes after everything it refers to: { ok, bad: [[feature id, missing id]] }. */
export function checkOrder(features) {
  const ids = features.map((f) => f.id);
  const seen = new Set(); const bad = [];
  for (const f of features) {
    for (const r of referencesOf(f, ids)) if (!seen.has(r)) bad.push([f.id, r]);
    seen.add(f.id);
  }
  return { ok: !bad.length, bad };
}

/** The sketch a feature absorbs (used by it alone, right before it), moved with it. */
function absorbed(part, f) {
  if (!f.sketch) return null;
  const sk = part.features.find((x) => x.id === f.sketch && x.type === 'sketch');
  if (!sk) return null;
  const users = part.features.filter((x) => x.sketch === sk.id);
  return users.length === 1 ? sk : null;
}

/**
 * Moves feature `id` (and its own sketch) before feature `beforeId` (null: to the end). Returns { ok, reason, bad }
 * and changes the part only when the new order is valid. The rollback bar stays at the same feature.
 */
export function moveFeature(part, id, beforeId = null) {
  const f = part.features.find((x) => x.id === id);
  if (!f) return { ok: false, reason: 'missing' };
  if (beforeId === id) return { ok: true, reason: 'same' };
  const block = [absorbed(part, f), f].filter(Boolean);
  const rest = part.features.filter((x) => !block.includes(x));
  let at = beforeId == null ? rest.length : rest.findIndex((x) => x.id === beforeId);
  if (at < 0) return { ok: false, reason: 'missing' };
  // Before a feature: before its own sketch too (that sketch belongs with it).
  const target = rest[at];
  const tsk = target && absorbed(part, target);
  if (tsk && rest[at - 1] === tsk) at -= 1;
  const order = [...rest.slice(0, at), ...block, ...rest.slice(at)];
  const check = checkOrder(order);
  if (!check.ok) return { ok: false, reason: 'dependency', bad: check.bad };
  const rolledAt = part.rollback != null ? part.features[part.rollback]?.id ?? null : null;
  part.features = order;
  if (part.rollback != null) { const k = rolledAt ? order.findIndex((x) => x.id === rolledAt) : order.length; part.rollback = k < 0 ? null : k; }
  normalizeFolders(part);
  return { ok: true };
}

/** The folder a feature is in, or null. */
export const folderOf = (part, id) => (part.folders ?? []).find((g) => g.members.includes(id)) ?? null;

/**
 * Makes a folder of features that sit next to each other in the tree (sketches absorbed by them come along).
 * Returns the folder, or null when they are not adjacent.
 */
export function makeFolder(part, ids, name, newId) {
  const pick = new Set(ids);
  for (const id of ids) { const f = part.features.find((x) => x.id === id); const sk = f && absorbed(part, f); if (sk) pick.add(sk.id); }
  const idx = part.features.map((f, i) => (pick.has(f.id) ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return null;
  for (let i = idx[0]; i <= idx[idx.length - 1]; i++) if (!pick.has(part.features[i].id)) return null;
  const members = idx.map((i) => part.features[i].id);
  part.folders = (part.folders ?? []).map((g) => ({ ...g, members: g.members.filter((m) => !pick.has(m)) })).filter((g) => g.members.length);
  const folder = { id: newId(), name, members };
  part.folders.push(folder);
  return folder;
}

/** Moves a feature to the end of a folder (and into it). Returns { ok, reason }. */
export function moveIntoFolder(part, id, folderId) {
  const g = (part.folders ?? []).find((x) => x.id === folderId);
  if (!g) return { ok: false, reason: 'missing' };
  if (g.members.includes(id)) return { ok: true };
  const last = g.members[g.members.length - 1];
  const f = part.features.find((x) => x.id === id); const sk = f && absorbed(part, f);
  const after = part.features[part.features.findIndex((x) => x.id === last) + 1];
  // Already right after the folder (its sketch next): only the membership changes.
  if (!(after && (after.id === id || after.id === sk?.id))) {
    const r = moveFeature(part, id, after ? after.id : null);
    if (!r.ok) return r;
  }
  for (const x of part.folders) x.members = x.members.filter((m) => m !== id && m !== sk?.id);
  const folder = part.folders.find((x) => x.id === folderId) ?? g;
  folder.members.push(...[sk?.id, id].filter(Boolean));
  if (!part.folders.includes(folder)) part.folders.push(folder);
  normalizeFolders(part);
  return { ok: true };
}

/** Dissolves a folder (its features stay where they are). */
export function dissolveFolder(part, folderId) {
  part.folders = (part.folders ?? []).filter((g) => g.id !== folderId);
  if (!part.folders.length) delete part.folders;
}

/** Folders keep only existing features, in the part's order, as one run (members split off by a move leave it). */
export function normalizeFolders(part) {
  if (!part.folders) return;
  const pos = new Map(part.features.map((f, i) => [f.id, i]));
  part.folders = part.folders.map((g) => {
    const m = g.members.filter((id) => pos.has(id)).sort((a, b) => pos.get(a) - pos.get(b));
    // The longest run of adjacent members stays; the others leave the folder.
    let best = []; let cur = [];
    for (const id of m) { if (cur.length && pos.get(id) !== pos.get(cur[cur.length - 1]) + 1) { if (cur.length > best.length) best = cur; cur = []; } cur.push(id); }
    if (cur.length > best.length) best = cur;
    return { ...g, members: best };
  }).filter((g) => g.members.length);
  if (!part.folders.length) delete part.folders;
}
