// The library catalog: parametric items (src/library/parametric) + downloaded
// high-quality models (library/models, src/library/assets.js) + the
// user's own imported objects. Browser-side; the parts are optional at build
// time (import.meta.glob) so the app still runs while one is missing.
import { CATEGORIES, setUserCategories } from './categories.js';

const parametricModules = import.meta.glob('./parametric/index.js', { eager: true });
const assetModules = import.meta.glob('./assets.js', { eager: true });

export const parametricItems = () => Object.values(parametricModules)[0]?.PARAMETRIC_ITEMS ?? [];
export const assetApi = () => Object.values(assetModules)[0] ?? null;

const items = new Map();
let assetsLoaded = null;
const listeners = new Set();

for (const item of parametricItems()) items.set(item.id, item);

/** Loads the downloaded model list once (resolves to the number of asset items). */
export function loadAssetItems() {
  if (assetsLoaded) return assetsLoaded;
  const api = assetApi();
  if (!api?.loadAssetManifest) { assetsLoaded = Promise.resolve(0); return assetsLoaded; }
  assetsLoaded = api.loadAssetManifest().then((manifest) => {
    const list = api.assetCatalogItems(manifest) ?? [];
    for (const item of list) if (!items.has(item.id)) items.set(item.id, item);
    for (const fn of listeners) fn();
    return list.length;
  }).catch((error) => { console.warn('library manifest', error); return 0; });
  return assetsLoaded;
}

/** The user's imported objects (My objects): registered by the app from the document / local library. */
export function registerUserItem(item) {
  items.set(item.id, { category: 'mine', kind: 'user', placement: 'floor', params: [], tags: [], ...item });
  for (const fn of listeners) fn();
}
export function unregisterUserItem(id) { items.delete(id); for (const fn of listeners) fn(); }

export const onCatalogChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const catalogItem = (id) => items.get(id) ?? null;
export const allItems = () => [...items.values()];
export const itemName = (item, language) => (item ? (language === 'ko' ? item.ko ?? item.en : item.en ?? item.ko) ?? item.id : '');

/** Default param values of an item merged with the stored ones. */
export function itemParams(item, params = {}) {
  const out = { ...params };
  for (const p of item?.params ?? []) out[p.key] = params[p.key] ?? p.default;
  return out;
}

/** Items of a category (or all) matching a search text in either language. */
export function searchItems({ category = null, query = '' } = {}) {
  const q = query.trim().toLowerCase();
  return allItems().filter((item) => {
    if (item.hidden) return false; // project copies of the user's library items (they show under their library entry)
    if (category && item.category !== category) return false;
    if (!q) return true;
    return [item.ko, item.en, item.id, ...(item.tags ?? [])].some((s) => String(s ?? '').toLowerCase().includes(q));
  });
}

/** An item's size without building it: measured sizes of parametric models only once they were measured. */
export function knownSize(item) {
  if (!item) return null;
  if ('knownSize' in item) return item.knownSize ?? null;
  return Array.isArray(item.size) ? item.size : null;
}

export const categoryCounts = () => {
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c.id, 0]));
  for (const item of items.values()) if (!item.hidden) counts[item.category] = (counts[item.category] ?? 0) + 1;
  return counts;
};

export { CATEGORIES, setUserCategories };
