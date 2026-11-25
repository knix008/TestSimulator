// What the user adds: their own emoji ("My emoji": pictures or parts of a design) and their own
// examples ("My examples": whole designs, shown on the start screen). Each list has its own
// localStorage key (not the shared settings, which every window reloads on any change) and is
// kept small: an item is refused when the browser storage is full.
export const USER_EMOJI_KEY = 'myicomaker.userEmoji';
export const USER_EXAMPLES_KEY = 'myicomaker.userExamples';
export const MAX_USER_EMOJI = 200;
export const MAX_USER_EXAMPLES = 60;

const store = () => globalThis.localStorage;

function readList(key, storage = store()) {
  try {
    const list = JSON.parse(storage?.getItem(key) ?? '[]');
    return Array.isArray(list) ? list.filter((item) => item && typeof item === 'object' && typeof item.id === 'string') : [];
  } catch { return []; }
}

function writeList(key, list, storage = store()) {
  try { storage?.setItem(key, JSON.stringify(list)); } catch { throw new Error('STORAGE_FULL'); }
  return list;
}

const newId = (prefix) => `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
const cleanName = (name, fallback) => String(name ?? '').trim().slice(0, 60) || fallback;

// ── My emoji: { id, name, href (data: URL), time } ──────────────────────────
export const loadUserEmoji = (storage) => readList(USER_EMOJI_KEY, storage).filter((e) => typeof e.href === 'string' && e.href.startsWith('data:image/'));

export function addUserEmoji({ name, href }, storage) {
  if (typeof href !== 'string' || !href.startsWith('data:image/')) throw new Error('BAD_PICTURE');
  const list = loadUserEmoji(storage);
  if (list.length >= MAX_USER_EMOJI) throw new Error('LIBRARY_FULL');
  const item = { id: newId('u'), name: cleanName(name, 'emoji'), href, time: Date.now() };
  writeList(USER_EMOJI_KEY, [...list, item], storage);
  return item;
}

export const removeUserEmoji = (id, storage) => writeList(USER_EMOJI_KEY, loadUserEmoji(storage).filter((e) => e.id !== id), storage);

// ── My examples: { id, name, design, thumb (data: URL), time } ──────────────
export const loadUserExamples = (storage) => readList(USER_EXAMPLES_KEY, storage).filter((e) => e.design && Array.isArray(e.design.objects));

export function addUserExample({ name, design, thumb }, storage) {
  if (!design || !Array.isArray(design.objects)) throw new Error('BAD_FILE');
  const list = loadUserExamples(storage);
  if (list.length >= MAX_USER_EXAMPLES) throw new Error('LIBRARY_FULL');
  const item = { id: newId('x'), name: cleanName(name, 'example'), design: JSON.parse(JSON.stringify(design)), thumb: thumb ?? '', time: Date.now() };
  writeList(USER_EXAMPLES_KEY, [...list, item], storage);
  return item;
}

export const removeUserExample = (id, storage) => writeList(USER_EXAMPLES_KEY, loadUserExamples(storage).filter((e) => e.id !== id), storage);
