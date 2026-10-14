// Catalog pane: browse the catalog by rating, color label, tag, category,
// keyword, automatic categories (camera, lens, year, ISO …) and saved searches.
// Click an entry to list its photos; Ctrl+click combines entries. The boxes in
// front of categories and keywords assign them to the selected photos.
import { AUTO_CATEGORIES, autoCategoryCounts, LABEL_COLORS, LABELS } from '../catalog/catalog.js';
import { t } from '../i18n.js';
import { app, openSource, selectedFiles, targetPaths } from '../store.js';
import { confirmDialog, promptDialog } from './dialog.js';
import { clear, debounce, h } from './dom.js';
import { icon } from './icons.js';
import { contextMenu } from './menu.js';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function createCatalogPane() {
  const el = h('div.pane-body.catalog-pane');
  const collapsed = new Set(['auto:lens', 'auto:aperture', 'auto:flash', 'auto:country', 'auto:focal', 'auto:iso', 'auto:orientation', 'auto:gps']);
  let active = [];
  const keywordOpen = new Set(); // expanded keyword-tree nodes

  function activeTitle() {
    return active.map((f) => filterLabel(f)).join(app.settings.catalogMatch === 'any' ? ' | ' : ' + ');
  }

  function filterLabel(f) {
    switch (f.type) {
      case 'rating': return f.value ? `${'★'.repeat(f.value)}` : t('catalog.unrated');
      case 'label': return t(`label.${f.value}`);
      case 'tagged': return t('catalog.tagged');
      case 'all': return t('catalog.allMedia');
      case 'uncategorized': return t('catalog.uncategorized');
      case 'category': return f.value;
      case 'keyword': return `#${f.value}`;
      case 'auto': return `${t(`auto.${f.key}`)}: ${autoValueLabel(f.key, f.value)}`;
      case 'text': return f.value;
      default: return '';
    }
  }

  function choose(filter, event) {
    const additive = event.ctrlKey || event.metaKey;
    if (filter.type === 'basket') { active = []; openSource({ type: 'basket' }); render(); return; }
    const index = active.findIndex((f) => same(f, filter));
    if (additive) { if (index >= 0) active.splice(index, 1); else active.push(filter); } else active = [filter];
    if (!active.length) { render(); return; }
    openSource({ type: 'filter', filters: [...active], title: activeTitle() });
    render();
  }

  const isActive = (filter) => active.some((f) => same(f, filter));

  function entry(filter, label, count, { swatch, iconName, assign, menu, indent = 0 } = {}) {
    const row = h(`div.cat-row${isActive(filter) ? '.active' : ''}`, { style: { paddingLeft: `${8 + indent * 14}px` }, role: 'button', tabIndex: 0 });
    if (assign) {
      const box = h(`button.cat-assign.${assign.state}`, { type: 'button', title: assign.title, html: icon(assign.state === 'all' ? 'checkSquare' : assign.state === 'some' ? 'minus' : 'square') });
      box.addEventListener('click', (event) => { event.stopPropagation(); assign.toggle(); });
      row.append(box);
    }
    if (swatch) row.append(h('span.swatch', { style: { background: swatch } }));
    if (iconName) row.append(h('span.cat-icon', { html: icon(iconName) }));
    row.append(h('span.cat-label', label), h('span.cat-count', count ? String(count) : ''));
    row.addEventListener('click', (event) => choose(filter, event));
    row.addEventListener('keydown', (event) => { if (event.key === 'Enter') choose(filter, event); });
    if (menu) row.addEventListener('contextmenu', (event) => contextMenu(event, menu()));
    return row;
  }

  /** "A|B|C" keywords → [{ name, path, children }] sorted by name (parents made up when missing). */
  function keywordTree(words) {
    const root = { children: new Map() };
    for (const word of words) {
      let node = root;
      let path = '';
      for (const part of word.split('|').map((p) => p.trim()).filter(Boolean)) {
        path = path ? `${path}|${part}` : part;
        if (!node.children.has(part.toLowerCase())) node.children.set(part.toLowerCase(), { name: part, path, children: new Map() });
        node = node.children.get(part.toLowerCase());
      }
    }
    const list = (node) => [...node.children.values()].sort((a, b) => a.name.localeCompare(b.name)).map((child) => ({ name: child.name, path: child.path, children: list(child) }));
    return list(root);
  }

  function section(id, title, body, { actions = [] } = {}) {
    const open = !collapsed.has(id);
    const head = h('div.cat-section-head', h('span.cat-arrow', { html: icon(open ? 'chevronDown' : 'chevronRight') }), h('span', title), ...actions);
    head.addEventListener('click', (event) => {
      if (event.target.closest('button')) return;
      if (collapsed.has(id)) collapsed.delete(id); else collapsed.add(id);
      render();
    });
    return h('div.cat-section', head, open ? body() : null);
  }

  function assignState(paths, has) {
    if (!paths.length) return 'none';
    const n = paths.filter((p) => has(app.catalog.get(p))).length;
    return n === 0 ? 'none' : n === paths.length ? 'all' : 'some';
  }

  function autoValueLabel(key, value) {
    if (key === 'flash' || key === 'gps') return t(`auto.${key}.${value}`);
    if (key === 'orientation') return t(`orientation.${value}`);
    return value;
  }

  function render() {
    const { catalog } = app;
    const counts = catalog.counts();
    const files = selectedFiles().map((item) => item.path);
    const records = [...catalog.files.values()].filter((r) => r.indexed);
    const auto = autoCategoryCounts(records);
    clear(el);

    if (active.length > 1) {
      el.append(h('div.cat-match', t('catalog.match'),
        h(`button.chip${app.settings.catalogMatch === 'all' ? '.on' : ''}`, { type: 'button', onclick: () => setMatch('all') }, t('catalog.matchAll')),
        h(`button.chip${app.settings.catalogMatch === 'any' ? '.on' : ''}`, { type: 'button', onclick: () => setMatch('any') }, t('catalog.matchAny'))));
    }

    el.append(section('special', t('catalog.special'), () => h('div',
      entry({ type: 'all' }, t('catalog.allMedia'), counts.indexed, { iconName: 'images' }),
      entry({ type: 'basket' }, t('catalog.basket'), catalog.basket.length, { iconName: 'basket' }),
      entry({ type: 'tagged' }, t('catalog.tagged'), counts.tagged, { iconName: 'checkSquare' }),
      entry({ type: 'uncategorized' }, t('catalog.uncategorized'), counts.uncategorized, { iconName: 'bookmark' }))));

    el.append(section('ratings', t('catalog.ratings'), () => h('div',
      [5, 4, 3, 2, 1].map((n) => entry({ type: 'rating', value: n }, '★'.repeat(n), counts.ratings[n], { iconName: null })),
      entry({ type: 'rating', value: 0 }, t('catalog.unrated'), counts.ratings[0]))));

    el.append(section('labels', t('catalog.labels'), () => h('div',
      LABELS.map((label) => entry({ type: 'label', value: label }, t(`label.${label}`), counts.labels[label], { swatch: LABEL_COLORS[label] })))));

    // Categories (tree).
    el.append(section('categories', t('catalog.categories'), () => {
      const box = h('div');
      for (const path of catalog.categories) {
        const depth = path.split('/').length - 1;
        const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : null;
        if (parent && [...collapsed].includes(`cat:${parent}`)) continue;
        const hasChildren = catalog.categories.some((c) => c.startsWith(`${path}/`));
        const row = entry({ type: 'category', value: path }, path.split('/').pop(), counts.categories[path], {
          iconName: 'bookmark',
          indent: depth,
          assign: { state: assignState(files, (r) => r?.categories?.includes(path)), title: t('catalog.assignCategory'), toggle: () => assignCategory(path, files) },
          menu: () => [
            { label: t('catalog.newSubcategory'), icon: 'plus', action: () => newCategory(path) },
            { label: t('catalog.renameCategory'), icon: 'rename', action: () => renameCategory(path) },
            { label: t('catalog.deleteCategory'), icon: 'trash', danger: true, action: () => deleteCategory(path) },
          ],
        });
        if (hasChildren) {
          const toggle = h('span.cat-fold', { html: icon(collapsed.has(`cat:${path}`) ? 'chevronRight' : 'chevronDown') });
          toggle.addEventListener('click', (event) => { event.stopPropagation(); const key = `cat:${path}`; if (collapsed.has(key)) collapsed.delete(key); else collapsed.add(key); render(); });
          row.prepend(toggle);
        }
        box.append(row);
      }
      return box;
    }, { actions: [h('button.tool.small', { type: 'button', title: t('catalog.newCategory'), html: icon('plus'), onclick: () => newCategory(null) })] }));

    // Keywords as a tree: "Places|Korea|Busan" sits under Places › Korea. A
    // node's count includes the photos of the keywords below it, and choosing
    // it shows them all.
    el.append(section('keywords', t('catalog.keywords'), () => {
      const box = h('div.keyword-tree');
      const words = [...new Set([...catalog.keywordList, ...Object.keys(counts.keywords)])];
      if (!words.length) box.append(h('div.cat-empty', t('catalog.noKeywords')));
      const tree = keywordTree(words);
      const photosUnder = (path) => {
        let n = 0;
        const lower = path.toLowerCase();
        for (const record of catalog.files.values()) if (record.keywords?.some((k) => k.toLowerCase() === lower || k.toLowerCase().startsWith(`${lower}|`))) n += 1;
        return n;
      };
      const draw = (nodes, depth) => {
        for (const node of nodes) {
          const open = keywordOpen.has(node.path);
          const row = entry({ type: 'keyword', value: node.path }, node.name, photosUnder(node.path), {
            iconName: node.children.length ? null : 'hash', indent: depth,
            assign: { state: assignState(files, (r) => r?.keywords?.some((k) => k.toLowerCase() === node.path.toLowerCase())), title: t('catalog.assignKeyword'), toggle: () => assignKeyword(node.path, files) },
            menu: () => [
              { label: t('catalog.newSubKeyword'), icon: 'plus', action: () => newKeyword(node.path) },
              { label: t('catalog.deleteKeyword'), icon: 'trash', danger: true, action: () => deleteKeyword(node.path) },
            ],
          });
          row.dataset.keyword = node.path;
          if (node.children.length) {
            const toggle = h('span.tree-toggle', { role: 'button', title: open ? t('catalog.collapse') : t('catalog.expand'), dataset: { keywordToggle: node.path } }, open ? '▾' : '▸');
            toggle.addEventListener('click', (event) => { event.stopPropagation(); if (open) keywordOpen.delete(node.path); else keywordOpen.add(node.path); render(); });
            row.prepend(toggle);
          } else row.prepend(h('span.tree-toggle'));
          box.append(row);
          if (open) draw(node.children, depth + 1);
        }
      };
      draw(tree, 0);
      return box;
    }, { actions: [h('button.tool.small', { type: 'button', title: t('catalog.newKeyword'), html: icon('plus'), onclick: () => newKeyword() })] }));

    // Automatic categories.
    for (const key of Object.keys(AUTO_CATEGORIES)) {
      const values = Object.entries(auto[key]);
      if (!values.length) continue;
      values.sort((a, b) => (key === 'year' ? b[0].localeCompare(a[0]) : b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), undefined, { numeric: true })));
      el.append(section(`auto:${key}`, t(`auto.${key}`), () => h('div', values.slice(0, 60).map(([value, count]) => entry({ type: 'auto', key, value }, autoValueLabel(key, value), count, { iconName: key === 'camera' ? 'camera' : key === 'year' ? 'calendar' : null })))));
    }

    // Saved searches.
    if (catalog.savedSearches.length) {
      el.append(section('saved', t('catalog.savedSearches'), () => h('div', catalog.savedSearches.map((s) => {
        const row = h('div.cat-row', { role: 'button', tabIndex: 0 }, h('span.cat-icon', { html: icon('search') }), h('span.cat-label', s.name));
        row.addEventListener('click', () => { active = []; openSource({ type: 'search', text: s.query, title: s.name }); render(); });
        row.addEventListener('contextmenu', (event) => contextMenu(event, [{ label: t('common.delete'), icon: 'trash', danger: true, action: () => catalog.deleteSearch(s.name) }]));
        return row;
      }))));
    }
    el.append(h('div.cat-footer', t('catalog.indexedCount', { n: counts.indexed })));
  }

  function setMatch(mode) {
    app.settings.catalogMatch = mode;
    app.saveSettings();
    if (active.length) openSource({ type: 'filter', filters: [...active], mode, title: activeTitle() }, { history: false });
    render();
  }

  function assignCategory(path, files) {
    if (!files.length) return;
    const all = files.every((p) => app.catalog.get(p)?.categories?.includes(path));
    app.catalog.assignCategory(files, path, !all);
  }

  function assignKeyword(word, files) {
    if (!files.length) return;
    const all = files.every((p) => app.catalog.get(p)?.keywords?.some((k) => k.toLowerCase() === word.toLowerCase()));
    if (all) app.catalog.removeKeywords(files, [word]); else app.catalog.addKeywords(files, [word]);
  }

  async function newCategory(parent) {
    const name = await promptDialog(t('catalog.categoryName'), '', { title: parent ? t('catalog.newSubcategory') : t('catalog.newCategory'), validate: (v) => (!v.trim() || v.includes('/') ? t('catalog.categoryInvalid') : null) });
    if (!name) return;
    app.catalog.addCategory(parent ? `${parent}/${name.trim()}` : name.trim());
  }

  async function renameCategory(path) {
    const name = await promptDialog(t('catalog.categoryName'), path.split('/').pop(), { title: t('catalog.renameCategory'), validate: (v) => (!v.trim() || v.includes('/') ? t('catalog.categoryInvalid') : null) });
    if (!name) return;
    const target = app.catalog.renameCategory(path, name);
    active = active.map((f) => (f.type === 'category' && f.value === path ? { ...f, value: target } : f));
  }

  async function deleteCategory(path) {
    if (!(await confirmDialog(t('catalog.deleteCategoryConfirm', { name: path }), { danger: true, ok: t('common.delete') }))) return;
    app.catalog.removeCategory(path);
    active = active.filter((f) => !(f.type === 'category' && (f.value === path || f.value.startsWith(`${path}/`))));
  }

  async function newKeyword(parent = null) {
    const name = await promptDialog(t('catalog.keywordName'), '', { title: parent ? t('catalog.newSubKeyword') : t('catalog.newKeyword'), validate: (v) => (!v.trim() ? t('file.nameEmpty') : null) });
    if (!name) return;
    const word = parent ? `${parent}|${name.trim()}` : name;
    if (parent) keywordOpen.add(parent);
    const files = targetPaths({ filesOnly: true });
    if (files.length) app.catalog.addKeywords(files, [word.trim()]);
    else { app.catalog.keywordList = [...new Set([...app.catalog.keywordList, word.trim()])]; app.catalog.changed([], 'keywords'); }
  }

  /** Deletes a keyword and the keywords below it. */
  async function deleteKeyword(word) {
    if (!(await confirmDialog(t('catalog.deleteKeywordConfirm', { name: word }), { danger: true, ok: t('common.delete') }))) return;
    const gone = (k) => k === word || k.startsWith(`${word}|`);
    const removed = new Set();
    const paths = [...app.catalog.files].filter(([, r]) => r.keywords?.some((k) => { if (gone(k)) removed.add(k); return gone(k); })).map(([p]) => p);
    app.catalog.keywordList = app.catalog.keywordList.filter((k) => !gone(k));
    if (paths.length) app.catalog.removeKeywords(paths, [...removed]); else app.catalog.changed([], 'keywords');
  }

  const later = debounce(() => { if (el.isConnected) render(); }, 250);
  app.on('catalog', later);
  app.on('selection', later);
  app.on('source', (source) => { if (source.type !== 'filter' && active.length) { active = []; later(); } });

  return { el, render, clear: () => { active = []; render(); } };
}
