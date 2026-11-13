// The user's own library in the Library panel: new categories, models added to any category (files or a whole
// folder, one category per sub-folder if wanted), renaming / moving / deleting, and placing (the model is copied
// into the project first, so a saved project never depends on this computer's library).
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  USER_CATEGORY_ICONS, addUserCategory, addUserItem, groupFolderFiles, loadUserLibrary, removeUserCategory,
  removeUserItem, updateUserCategory, updateUserItem, userItemModel,
} from '../domain/userlibrary.js';
import { CATEGORIES, catalogItem, registerUserItem, setUserCategories, unregisterUserItem } from '../library/catalog.js';

const baseName = (p) => String(p).replace(/\\/g, '/').replace(/^.*\//, '');
const stem = (name) => baseName(name).replace(/\.[^.]+$/, '');

/**
 * app: { t, lang, popups, notify, showError, prompt, showMenu, withProgress, desktop, native, settings, doc,
 *        loadIo, readBytes, isModelName, modelAccept, modelExtensions, relatedExtensions, renderLeft, showLibrary,
 *        guessPlacement, state, ask }
 */
export function createUserLibrary(app) {
  const t = app.t;
  const modelCache = new Map();
  const copies = new Set();

  const validCategory = (id) => (CATEGORIES.some((c) => c.id === id) ? id : 'mine');

  async function loadModel(id) {
    if (!modelCache.has(id)) {
      const bytes = await userItemModel(id);
      if (!bytes) throw new Error(t('userlib.missing'));
      const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
      modelCache.set(id, gltf.scene);
    }
    return modelCache.get(id).clone(true);
  }

  function register(item) {
    registerUserItem({
      id: `lib:${item.id}`, ko: item.name, en: item.name, category: validCategory(item.category), size: item.size, kind: 'user',
      libId: item.id, placement: item.placement ?? 'floor', tags: [item.folder, stem(item.source ?? '')].filter(Boolean), load: () => loadModel(item.id),
    });
  }

  async function init() {
    const lib = await loadUserLibrary();
    setUserCategories(lib.categories);
    for (const item of lib.items) register(item);
  }

  /** Before placing a library item: its model becomes an asset of the project (once). → the item id to place. */
  function adopt(itemId) {
    const item = catalogItem(itemId);
    const d = app.doc();
    if (!item?.libId || !d) return itemId;
    const asset = `lib-${item.libId}`;
    const placeId = `user:${asset}`;
    if (!d.project.assets[asset]) {
      d.project.assets[asset] = { name: item.ko, ext: 'glb', size: item.size, triangles: 0, source: 'library', lib: item.libId, category: item.category };
      const copy = userItemModel(item.libId).then((bytes) => { if (bytes) d.assets.set(asset, bytes); }).finally(() => copies.delete(copy));
      copies.add(copy);
      d.revision += 1;
    }
    if (!catalogItem(placeId)) registerUserItem({ id: placeId, ko: item.ko, en: item.en, size: item.size, category: item.category, placement: item.placement, asset, kind: 'user', hidden: true, load: () => loadModel(item.libId) });
    return placeId;
  }

  /** Waits for models still being copied into the project (before saving it). */
  const settled = () => Promise.all([...copies]);

  /* ─────────────── categories */

  async function newCategory({ icon = true } = {}) {
    const name = await app.prompt({ title: t('userlib.newCategory'), label: t('userlib.categoryName'), value: '' });
    if (!name?.trim()) return null;
    const glyph = icon ? await pickIcon(t('userlib.categoryIcon')) : 'libMine';
    const category = await addUserCategory(name, glyph ?? 'libMine');
    await refreshCategories();
    app.showLibrary(category.id);
    app.notify('success', t('userlib.categoryAdded', { name: category.name }));
    return category;
  }

  function pickIcon(title) {
    return new Promise((resolve) => {
      const handlers = {};
      const items = USER_CATEGORY_ICONS.map((glyph) => { handlers[`custom:icon:${glyph}`] = () => resolve(glyph); return { id: `custom:icon:${glyph}`, label: CATEGORIES.find((c) => c.icon === glyph && !c.user)?.[app.lang()] ?? t('userlib.iconDefault'), icon: glyph }; });
      app.showMenu(items, null, 'context', { handlers, header: { icon: 'libMine', title } }).then(() => resolve(null));
    });
  }

  async function refreshCategories() {
    const lib = await loadUserLibrary();
    setUserCategories(lib.categories);
    for (const item of lib.items) register(item);
    app.renderLeft();
  }

  async function renameCategory(id) {
    const c = CATEGORIES.find((x) => x.id === id);
    const name = await app.prompt({ title: t('userlib.renameCategory'), label: t('userlib.categoryName'), value: c?.ko ?? '' });
    if (!name?.trim()) return;
    await updateUserCategory(id, { name });
    await refreshCategories();
  }

  async function changeIcon(id) {
    const glyph = await pickIcon(t('userlib.categoryIcon'));
    if (!glyph) return;
    await updateUserCategory(id, { icon: glyph });
    await refreshCategories();
  }

  async function deleteCategory(id) {
    const c = CATEGORIES.find((x) => x.id === id);
    const lib = await loadUserLibrary();
    const n = lib.items.filter((i) => i.category === id).length;
    let deleteItems = false;
    if (n) {
      const choice = await app.ask({ icon: 'trash', title: t('userlib.deleteCategory'), message: t('userlib.deleteCategoryAsk', { name: c?.ko ?? '', n }), buttons: [{ id: 'cancel', label: t('confirm.cancel') }, { id: 'delete', label: t('userlib.deleteItemsToo'), icon: 'trash', danger: true }, { id: 'move', label: t('userlib.moveToMine'), icon: 'libMine', primary: true }] });
      if (!choice || choice === 'cancel') return;
      deleteItems = choice === 'delete';
    }
    const gone = await removeUserCategory(id, { deleteItems });
    for (const g of gone) unregisterUserItem(`lib:${g}`);
    if (app.state.libraryCategory === id) app.state.libraryCategory = 'mine';
    await refreshCategories();
    app.notify('info', t('userlib.categoryDeleted', { name: c?.ko ?? '' }));
  }

  /* ─────────────── items */

  async function renameItem(itemId) {
    const item = catalogItem(itemId);
    const name = await app.prompt({ title: t('userlib.renameItem'), label: t('userlib.itemName'), value: item?.ko ?? '' });
    if (!name?.trim() || !item?.libId) return;
    const updated = await updateUserItem(item.libId, { name: name.trim() });
    if (updated) register(updated);
    app.renderLeft();
  }

  async function moveItem(itemId, category) {
    const item = catalogItem(itemId);
    if (!item?.libId) return;
    const updated = await updateUserItem(item.libId, { category });
    if (updated) register(updated);
    app.renderLeft();
  }

  async function deleteItem(itemId) {
    const item = catalogItem(itemId);
    if (!item?.libId) return;
    await removeUserItem(item.libId);
    unregisterUserItem(itemId);
    modelCache.delete(item.libId);
    app.renderLeft();
    app.notify('info', t('userlib.itemDeleted', { name: item.ko }));
  }

  /* ─────────────── adding models */

  /** Where new models go: a menu of the categories (the current one first). → category id or null. */
  function chooseCategory({ title, extra = [] } = {}) {
    return new Promise((resolve) => {
      const handlers = {};
      const current = app.state.libraryCategory;
      const ordered = [...CATEGORIES].sort((a, b) => (b.id === current) - (a.id === current) || (b.user ? 1 : 0) - (a.user ? 1 : 0));
      const items = [
        ...extra.map((x) => { handlers[`custom:target:${x.id}`] = () => resolve(x.id); return { id: `custom:target:${x.id}`, label: x.label, icon: x.icon }; }),
        { id: 'custom:target:new', label: t('userlib.newCategory'), icon: 'plus' },
        { separator: true },
        ...ordered.map((c) => { handlers[`custom:target:${c.id}`] = () => resolve(c.id); return { id: `custom:target:${c.id}`, label: c[app.lang()] ?? c.en, icon: c.icon }; }),
      ];
      handlers['custom:target:new'] = async () => { const c = await newCategory({ icon: false }); resolve(c?.id ?? null); };
      app.showMenu(items, null, 'context', { handlers, header: { icon: 'library', title: title ?? t('userlib.chooseCategory') } }).then((r) => { if (!r) setTimeout(() => resolve(null), 50); });
    });
  }

  async function addFiles(category = null) {
    try {
      let entries;
      if (app.desktop) {
        const paths = await app.native.chooseModelFiles(app.settings().lastDirectory);
        if (!paths.length) return;
        const files = paths.map((p) => ({ name: baseName(p), path: p }));
        entries = groupFolderFiles(files, app.isModelName).map((e) => ({ ...e, related: files.filter((f) => f !== e.file && !app.isModelName(f.name)), folder: '' }));
      } else {
        const picked = await app.native.pickWithInput(app.modelAccept(), true);
        if (!picked.length) return;
        const files = await Promise.all(picked.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
        entries = files.filter((f) => app.isModelName(f.name)).map((file) => ({ file, related: files.filter((f) => !app.isModelName(f.name)), folder: '' }));
      }
      if (!entries.length) { app.notify('error', t('notice.noModelFile')); return; }
      const target = category ?? await chooseCategory();
      if (!target) return;
      await importEntries(entries, () => target);
    } catch (error) { app.showError('error.import', error); }
  }

  async function addFolder() {
    try {
      let files; let root = ''; let folderName = '';
      if (app.desktop) {
        root = await app.native.chooseFolder(app.settings().lastDirectory);
        if (!root) return;
        folderName = baseName(root);
        const paths = await app.native.listFiles(root, [...app.modelExtensions(), ...app.relatedExtensions()]);
        files = paths.map((p) => ({ name: baseName(p), path: p }));
      } else {
        const picked = await app.native.pickFolderWeb();
        if (!picked.length) return;
        folderName = (picked[0].webkitRelativePath || '').split('/')[0] || 'folder';
        files = picked.map((f) => ({ name: f.name, relativePath: f.webkitRelativePath || f.name, blob: f }));
      }
      const entries = groupFolderFiles(files, app.isModelName, root);
      if (!entries.length) { app.notify('error', t('userlib.folderEmpty', { name: folderName })); return; }
      const subfolders = [...new Set(entries.map((e) => e.folder).filter(Boolean))];
      const extra = [{ id: '@folder', label: t('userlib.folderAsCategory', { name: folderName, n: entries.length }), icon: 'folderOpen' }];
      if (subfolders.length > 1) extra.push({ id: '@sub', label: t('userlib.subfoldersAsCategories', { n: subfolders.length }), icon: 'library' });
      const target = await chooseCategory({ title: t('userlib.folderTitle', { name: folderName, n: entries.length }), extra });
      if (!target) return;
      let pick = () => target;
      if (target === '@folder') { const c = await addUserCategory(folderName); pick = () => c.id; }
      else if (target === '@sub') {
        const byFolder = new Map();
        const main = await addUserCategory(folderName);
        for (const f of subfolders) byFolder.set(f, (await addUserCategory(f)).id);
        pick = (e) => byFolder.get(e.folder) ?? main.id;
      }
      await refreshCategories();
      await importEntries(entries, pick);
    } catch (error) { app.showError('error.import', error); }
  }

  const bytesOf = async (f, op) => f.bytes ?? (f.blob ? new Uint8Array(await f.blob.arrayBuffer()) : await app.readBytes(f.path, op));

  /** Converts the models (one options window for all) and stores them in the library. */
  async function importEntries(entries, categoryOf, given = null) {
    const names = entries.map((e) => e.file.name);
    const options = given ?? await app.popups.open('importmodel', { names: names.length > 12 ? [...names.slice(0, 12), `… +${names.length - 12}`] : names, units: 'auto', upAxis: 'auto', optimize: true });
    if (!options?.ok) return;
    const { io, ex } = await app.loadIo();
    if (!io || !ex) { app.notify('error', t('notice.ioMissing')); return; }
    let added = 0; let failed = 0; let lastCategory = null;
    await app.withProgress('userlib.importing', t('userlib.count', { n: entries.length }), async (op, report, signal) => {
      for (const [i, entry] of entries.entries()) {
        if (signal.cancelled) break;
        report({ fraction: i / entries.length, text: `${i + 1} / ${entries.length} · ${entry.file.name}` });
        try {
          const bytes = await bytesOf(entry.file, op);
          const related = new Map();
          for (const r of entry.related) related.set(r.name, await bytesOf(r, op));
          const imported = await io.importModel({ name: entry.file.name, bytes, related }, { units: options.units, upAxis: options.upAxis, center: true, optimize: options.optimize });
          const glb = await ex.exportModel(imported.object, 'glb');
          const category = categoryOf(entry);
          const size = imported.stats?.sizeMeters ?? [1, 1, 1];
          const item = await addUserItem({ name: stem(entry.file.name), category, glb: glb.bytes, size, triangles: imported.stats?.triangles ?? 0, source: entry.file.name, folder: entry.folder, placement: app.guessPlacement?.({ category, tags: [], size }) ?? 'floor' });
          register(item);
          added += 1; lastCategory = category;
        } catch (error) { failed += 1; console.warn('user library import', entry.file.name, error); }
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }, { delay: 0, cancellable: true });
    if (lastCategory) app.showLibrary(lastCategory); else app.renderLeft();
    app.notify(failed ? 'info' : 'success', t(failed ? 'userlib.addedSome' : 'userlib.added', { n: added, failed }));
  }

  /* ─────────────── menus */

  /** The Library panel's + menu (and the category chips' context menu for user categories). */
  function menu(anchor, categoryId = app.state.libraryCategory) {
    const c = CATEGORIES.find((x) => x.id === categoryId);
    const handlers = {
      'custom:ul-new': () => newCategory(),
      'custom:ul-files': () => addFiles(c && c.id !== 'all' ? c.id : null),
      'custom:ul-folder': () => addFolder(),
      'custom:ul-rename': () => renameCategory(categoryId),
      'custom:ul-icon': () => changeIcon(categoryId),
      'custom:ul-delete': () => deleteCategory(categoryId),
    };
    const items = [
      { id: 'custom:ul-new', label: t('userlib.newCategory'), icon: 'plus' },
      { id: 'custom:ul-files', label: c && categoryId !== 'all' ? t('userlib.addFilesTo', { name: c[app.lang()] ?? c.en }) : t('userlib.addFiles'), icon: 'importModel' },
      { id: 'custom:ul-folder', label: t('userlib.addFolder'), icon: 'folderOpen' },
    ];
    if (c?.user) items.push({ separator: true }, { id: 'custom:ul-rename', label: t('userlib.renameCategory'), icon: 'edit' }, { id: 'custom:ul-icon', label: t('userlib.categoryIcon'), icon: c.icon }, { id: 'custom:ul-delete', label: t('userlib.deleteCategory'), icon: 'trash' });
    return app.showMenu(items, anchor, 'context', { handlers, header: { icon: 'library', title: t('userlib.title') } });
  }

  /** Extra entries for a library card's context menu (library items only). */
  function cardItems(itemId, handlers) {
    const item = catalogItem(itemId);
    if (!item?.libId) return [];
    handlers['custom:ul-item-rename'] = () => renameItem(itemId);
    handlers['custom:ul-item-delete'] = () => deleteItem(itemId);
    const children = CATEGORIES.filter((c) => c.id !== item.category).map((c) => { handlers[`custom:ul-move:${c.id}`] = () => moveItem(itemId, c.id); return { id: `custom:ul-move:${c.id}`, label: c[app.lang()] ?? c.en, icon: c.icon }; });
    return [
      { separator: true },
      { id: 'custom:ul-item-rename', label: t('userlib.renameItem'), icon: 'edit' },
      { id: 'submenu:ul-move', label: t('userlib.moveTo'), icon: 'library', submenu: true, children },
      { id: 'custom:ul-item-delete', label: t('userlib.deleteItem'), icon: 'trash' },
    ];
  }

  /** Scripts and tests: files [{ name, bytes, relativePath? }] into a category, without dialogs. */
  const addFromFiles = (files, category, options = { ok: true, units: 'auto', upAxis: 'auto', optimize: true }) =>
    importEntries(groupFolderFiles(files, app.isModelName), () => category, options);

  /** Scripts and tests: a category without the name prompt. */
  const createCategory = async (name, icon = 'libMine') => { const c = await addUserCategory(name, icon); await refreshCategories(); return c; };

  return { addFromFiles, createCategory, deleteItem, init, adopt, settled, menu, cardItems, addFiles, addFolder, newCategory, deleteCategory, renameCategory, loadModel };
}
