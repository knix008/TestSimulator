import { persistGetItem, persistSetItem } from './persist.js';

const STORAGE_KEY = 'myvideoplayer.recent.v1';
export const RECENT_LIMIT = 30;

/**
 * @typedef {{
 *  id: string,
 *  type: 'file' | 'youtube' | 'rtsp',
 *  title: string,
 *  name: string,
 *  path?: string,
 *  url?: string,
 *  ext?: string,
 *  size?: number,
 *  playedAt: number
 * }} RecentItem
 */

function isRecentType(type) {
  return type === 'file' || type === 'youtube' || type === 'rtsp';
}

/** @returns {RecentItem[]} */
export function loadRecent() {
  try {
    const raw = persistGetItem(STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list
      .filter((item) => item && isRecentType(item.type) && item.id)
      .slice(0, RECENT_LIMIT);
  } catch {
    return [];
  }
}

/** @param {RecentItem[]} items */
export function saveRecent(items) {
  persistSetItem(STORAGE_KEY, JSON.stringify(items.slice(0, RECENT_LIMIT)));
}

/**
 * @param {Omit<RecentItem, 'id' | 'playedAt'> & { id?: string, playedAt?: number }} item
 * @returns {RecentItem[]}
 */
export function addRecent(item) {
  if (!item?.type) return loadRecent();
  const id = item.id || (item.type === 'youtube'
    ? `youtube:${item.url || item.name}`
    : `file:${item.path || item.name}`);
  const next = {
    id,
    type: item.type,
    title: item.title || item.name || 'Untitled',
    name: item.name || item.title || 'Untitled',
    path: item.path || undefined,
    url: item.url || undefined,
    ext: item.ext || undefined,
    size: Number.isFinite(item.size) ? item.size : undefined,
    playedAt: Date.now()
  };

  // Files without a real path can't be reopened later (web blob) — skip.
  if (next.type === 'file' && !next.path) return loadRecent();
  if ((next.type === 'youtube' || next.type === 'rtsp') && !next.url) return loadRecent();

  const list = loadRecent().filter((r) => r.id !== next.id);
  list.unshift(next);
  const trimmed = list.slice(0, RECENT_LIMIT);
  saveRecent(trimmed);
  return trimmed;
}

export function clearRecent() {
  saveRecent([]);
  return [];
}

export function removeRecent(id) {
  const list = loadRecent().filter((r) => r.id !== id);
  saveRecent(list);
  return list;
}
