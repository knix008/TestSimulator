const KEY = 'image2text.recent.v1';
const DIRECTORY_KEY = 'image2text.lastDirectory.v1';
export const RECENT_LIMIT = 10;

export function lastDirectory() {
  try {
    return localStorage.getItem(DIRECTORY_KEY) || parentDirectory(loadRecent()[0]?.path ?? '');
  } catch {
    return '';
  }
}

export function rememberDirectory(path) {
  const directory = parentDirectory(path);
  if (directory) localStorage.setItem(DIRECTORY_KEY, directory);
}

export function parentDirectory(path) {
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  if (cut < 0) return '';
  if (cut === 0) return path[0];
  const directory = path.slice(0, cut);
  return /^[A-Za-z]:$/.test(directory) ? `${directory}\\` : directory;
}

export function loadRecent() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((item) => item && typeof item.path === 'string' && item.path)
      .slice(0, RECENT_LIMIT)
      .map((item) => ({
        path: item.path,
        name: typeof item.name === 'string' && item.name ? item.name : baseName(item.path),
      }));
  } catch {
    return [];
  }
}

export function rememberRecent(entries) {
  const next = [];
  const seen = new Set();
  for (const entry of [...entries, ...loadRecent()]) {
    if (!entry?.path) continue;
    const key = pathKey(entry.path);
    if (seen.has(key)) continue;
    seen.add(key);
    next.push({
      path: entry.path,
      name: entry.name || baseName(entry.path),
    });
    if (next.length === RECENT_LIMIT) break;
  }
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function removeRecent(path) {
  const key = pathKey(path);
  const next = loadRecent().filter((item) => pathKey(item.path) !== key);
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function clearRecent() {
  localStorage.removeItem(KEY);
  return [];
}

function pathKey(path) {
  return path.replaceAll('\\', '/').toLowerCase();
}

function baseName(path) {
  const parts = path.split(/[/\\]/);
  return parts.at(-1) || path;
}
