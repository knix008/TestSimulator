// Clipboard text for entities. Copies carry a marker line so a paste can tell
// MyCAD entities from ordinary text (which is pasted as a text entity).
import { normalizeEntity } from './entities.js';

export const CLIP_MARKER = 'MyCAD-Clipboard/1';

export function entitiesToClipboard(entities, layers = []) {
  const used = new Set(entities.map((entity) => entity.layer));
  return `${CLIP_MARKER}\n${JSON.stringify({ entities, layers: layers.filter((layer) => used.has(layer.id)) })}`;
}

/** { entities, layers } from clipboard text, or null when it is not a MyCAD copy. */
export function entitiesFromClipboard(text) {
  const value = String(text ?? '');
  if (!value.startsWith(CLIP_MARKER)) return null;
  try {
    const data = JSON.parse(value.slice(CLIP_MARKER.length).trim());
    const entities = (Array.isArray(data.entities) ? data.entities : []).map(normalizeEntity).filter(Boolean);
    return { entities, layers: Array.isArray(data.layers) ? data.layers : [] };
  } catch {
    return null;
  }
}
