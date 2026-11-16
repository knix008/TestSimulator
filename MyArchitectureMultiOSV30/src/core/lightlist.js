// Every light fixture of the project, grouped by level and by the room it hangs
// in, for the Lights panel (switch each one, a room, a level or all of them).
// Pure: the project in, plain lists out.

import { isLight, lightOf, furnitureDef } from "../lib/furniture.js";
import { pointInPolygon } from "./geom.js";

const isOn = (f) => !f.light || f.light.on !== false;

/**
 * [{ level, name, on, total, rooms: [{ id (room id, "" = not in a room), name, on, total, lamps: [{ id, name, on,
 * lumens, kind }] }] }] in level order (top first, as the plan's level list), rooms by name.
 */
export function lightGroups(p, { name = (f) => f.name || (furnitureDef(f.kind) || {}).name || f.kind } = {}) {
  const out = [];
  const levels = [...p.levels].sort((a, b) => b.elevation - a.elevation);
  for (const lv of levels) {
    const lamps = p.furniture.filter((f) => f.level === lv.id && isLight(f));
    if (!lamps.length) continue;
    const rooms = p.rooms.filter((r) => r.level === lv.id);
    const byRoom = new Map();
    for (const f of lamps) {
      const r = rooms.find((x) => pointInPolygon(f.x, f.y, x.pts));
      const key = r ? r.id : "";
      if (!byRoom.has(key)) byRoom.set(key, { id: key, name: r ? r.name : "", lamps: [] });
      const l = lightOf(f);
      byRoom.get(key).lamps.push({ id: f.id, name: name(f), on: isOn(f), lumens: l ? Math.round(l.lumens) : 0, kind: f.kind });
    }
    const list = [...byRoom.values()].map((g) => ({ ...g, total: g.lamps.length, on: g.lamps.filter((x) => x.on).length }))
      .sort((a, b) => (!a.id) - (!b.id) || String(a.name).localeCompare(String(b.name)));
    out.push({ level: lv.id, name: lv.name, rooms: list, total: lamps.length, on: lamps.filter(isOn).length });
  }
  return out;
}

/** The ids of a group's lamps: all, a level's, or a room's of a level. */
export function lampIds(groups, { level = null, room = null } = {}) {
  return groups.filter((g) => !level || g.level === level).flatMap((g) => g.rooms.filter((r) => room === null || r.id === room).flatMap((r) => r.lamps.map((x) => x.id)));
}
