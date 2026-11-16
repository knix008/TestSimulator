// Each door opened or closed on its own in 3D. An opening's `open` is the angle
// (degrees, 0 = closed … 110) it stands at; unset, it follows the 3D view's
// "Open doors" switch (75° when that is on). Double-click a door in 3D (or its
// menu / properties) to open or close it. The walk-through opens every hinged
// door it passes (`force`). Sliding doors slide instead of turning (the same
// angle says how far: 0 closed, 90 fully open). Pure.

export const OPEN_ANGLE = 75; // what "Open doors" opens a door to
export const MAX_ANGLE = 110;

/** Whether the opening is a door that opens (doors and garage doors; not windows or plain openings). */
export const isDoor = (o) => !!o && o.kind === "door";

/** The angle (degrees) door `o` stands at: its own, else the view's switch; `force` = at least OPEN_ANGLE. */
export function doorAngle(o, openAll = false, { force = false } = {}) {
  if (!isDoor(o)) return 0;
  const own = Number.isFinite(+o.open) && o.open !== null && o.open !== "" ? Math.max(0, Math.min(MAX_ANGLE, +o.open)) : null;
  const a = own ?? (openAll ? OPEN_ANGLE : 0);
  return force ? Math.max(a, OPEN_ANGLE) : a;
}

/** Whether door `o` is open (as the 3D view draws it). */
export const isOpen = (o, openAll = false) => doorAngle(o, openAll) > 0;

/** The door's `open` after a toggle: closed → open (its last angle or 90°), open → closed. */
export function toggledOpen(o, openAll = false) {
  if (isOpen(o, openAll)) return 0;
  const last = Number.isFinite(+o.lastOpen) && +o.lastOpen > 0 ? +o.lastOpen : 90;
  return Math.min(MAX_ANGLE, last);
}

/** Opens or closes doors (ids) in project `p` (inside the caller's undo step); `open` true/false or undefined = toggle. */
export function setDoors(p, ids, { open = undefined, openAll = false, angle = null } = {}) {
  let n = 0;
  for (const o of p.openings) {
    if (!ids.includes(o.id) || !isDoor(o)) continue;
    const next = open === undefined ? toggledOpen(o, openAll) : open ? (angle ?? (Number.isFinite(+o.lastOpen) && +o.lastOpen > 0 ? +o.lastOpen : 90)) : 0;
    if (next > 0) o.lastOpen = next;
    o.open = next;
    n++;
  }
  return n;
}

/** Back to following the view's "Open doors" switch. */
export function followSwitch(p, ids) {
  let n = 0;
  for (const o of p.openings) if (ids.includes(o.id) && o.open !== undefined) { delete o.open; n++; }
  return n;
}
