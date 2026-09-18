/* Folder tree (left panel): the working folder with a ".." entry, lazily expanded sub-folders and the
 * openable files. Single click opens a file, double click (or Enter) enters a folder.
 *
 *   const tree = FileTree.create(element, { isOpenable(entry), onOpen(path), onRoot(dir), onContext(e, paths) });
 *   tree.setRoot(dir) · tree.refresh() · tree.select(path) · tree.selected() · tree.root() · tree.files() · tree.step(±1)
 */
window.FileTree = (function () {
  const P = () => window.Platform;
  const t = (k, p) => window.I18n.t(k, p);

  const ICONS = {
    folder: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
    up: '<svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
    dicom: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><ellipse cx="12" cy="12" rx="6" ry="5"/><path d="M12 4v3M12 17v3M4 12h3M17 12h3"/></svg>',
    image: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 16l-5-5-8 8"/></svg>',
    drive: '<svg viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="10" rx="2"/><circle cx="17" cy="12" r="1"/></svg>',
  };

  function create(el, opts) {
    let rootDir = null;
    let entries = [];          // top-level entries of rootDir (after filter)
    const expanded = new Map(); // dir path → entries
    let selected = new Set();
    let anchor = null;
    let loading = false;

    const isDicomName = (name) => /\.(dcm|dicm|dicom|dic)$/i.test(name) || !/\./.test(name) || /^dicomdir$/i.test(name);

    function iconFor(entry) {
      if (entry.isDir) return ICONS.folder;
      return isDicomName(entry.name) ? ICONS.dicom : ICONS.image;
    }

    async function load(dir) {
      const list = await P().readDir(dir);
      return list.filter((e) => e.isDir || opts.isOpenable(e));
    }

    function row(entry, depth, extraClass) {
      const div = document.createElement('div');
      div.className = `tree-row${extraClass ? ' ' + extraClass : ''}${selected.has(entry.path) ? ' selected' : ''}`;
      div.dataset.path = entry.path;
      div.dataset.dir = entry.isDir ? '1' : '0';
      if (entry.drive || entry.parent) div.dataset.nav = '1';   // drives and ".." open with a single click
      div.style.paddingLeft = `${8 + depth * 16}px`;
      div.title = entry.path;
      const tw = document.createElement('span');
      tw.className = 'tree-twisty';
      if (entry.isDir && !entry.parent) { tw.textContent = expanded.has(entry.path) ? '▾' : '▸'; tw.classList.add('active'); }
      const ic = document.createElement('span');
      ic.className = 'tree-icon';
      ic.innerHTML = entry.parent ? ICONS.up : entry.drive ? ICONS.drive : iconFor(entry);
      const name = document.createElement('span');
      name.className = 'tree-name';
      name.textContent = entry.label || entry.name;
      div.append(tw, ic, name);
      if (!entry.isDir && entry.size) { const sz = document.createElement('span'); sz.className = 'tree-size'; sz.textContent = fmtSize(entry.size); div.append(sz); }
      return div;
    }

    function fmtSize(n) {
      if (n < 1024) return `${n} B`;
      if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
      if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
      return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
    }

    function render() {
      el.innerHTML = '';
      const frag = document.createDocumentFragment();
      if (rootDir) {
        const parent = P().dirname(rootDir);
        const isTop = !parent || parent === rootDir || (!P().isElectron && parent === '/');
        if (!isTop) frag.append(row({ name: '..', label: t('tree.parent'), path: parent, isDir: true, parent: true }, 0));
        else frag.append(row({ name: '..', label: t('tree.drives'), path: '', isDir: true, parent: true, drives: true }, 0));
      }
      const walk = (list, depth) => {
        for (const e of list) {
          frag.append(row(e, depth));
          if (e.isDir && expanded.has(e.path)) {
            const kids = expanded.get(e.path);
            if (!kids.length) { const empty = document.createElement('div'); empty.className = 'tree-row empty'; empty.style.paddingLeft = `${8 + (depth + 1) * 16 + 18}px`; empty.textContent = t('tree.empty'); frag.append(empty); }
            walk(kids, depth + 1);
          }
        }
      };
      walk(entries, 0);
      if (!entries.length && rootDir) { const empty = document.createElement('div'); empty.className = 'tree-row empty'; empty.textContent = t('tree.empty'); frag.append(empty); }
      if (!rootDir) { const empty = document.createElement('div'); empty.className = 'tree-empty'; empty.textContent = t('sidebar.noRoots'); frag.append(empty); }
      el.append(frag);
    }

    async function setRoot(dir) {
      if (!dir) { rootDir = null; entries = []; expanded.clear(); selected.clear(); render(); opts.onRoot && opts.onRoot(null); return; }
      loading = true;
      el.classList.add('loading');
      try {
        const list = await load(dir);
        rootDir = dir;
        entries = list;
        expanded.clear();
        selected.clear();
        render();
        opts.onRoot && opts.onRoot(dir);
      } catch (err) {
        opts.onError && opts.onError(err, dir);
      } finally { loading = false; el.classList.remove('loading'); }
    }

    async function showRoots() {
      const roots = await P().roots();
      rootDir = null;
      entries = roots.map((r) => ({ ...r, drive: true }));
      expanded.clear();
      selected.clear();
      el.innerHTML = '';
      const frag = document.createDocumentFragment();
      for (const e of entries) frag.append(row(e, 0));
      if (!entries.length) { const empty = document.createElement('div'); empty.className = 'tree-empty'; empty.textContent = t('sidebar.noRoots'); frag.append(empty); }
      el.append(frag);
      opts.onRoot && opts.onRoot(null);
    }

    async function refresh() {
      if (!rootDir) { await showRoots(); return; }
      const keep = new Set(expanded.keys());
      const list = await load(rootDir).catch(() => null);
      if (!list) return;
      entries = list;
      for (const d of keep) { try { expanded.set(d, await load(d)); } catch { expanded.delete(d); } }
      render();
    }

    async function toggle(path) {
      if (expanded.has(path)) expanded.delete(path);
      else { try { expanded.set(path, await load(path)); } catch (err) { opts.onError && opts.onError(err, path); return; } }
      render();
    }

    /* All visible files in display order (for prev / next navigation). */
    function files() {
      return Array.from(el.querySelectorAll('.tree-row[data-dir="0"]')).map((r) => r.dataset.path);
    }

    function select(path, { add = false, range = false } = {}) {
      if (range && anchor) {
        const all = Array.from(el.querySelectorAll('.tree-row[data-path]')).map((r) => r.dataset.path);
        const a = all.indexOf(anchor), b = all.indexOf(path);
        if (a >= 0 && b >= 0) { selected = new Set(all.slice(Math.min(a, b), Math.max(a, b) + 1)); }
      } else if (add) {
        if (selected.has(path)) selected.delete(path); else selected.add(path);
        anchor = path;
      } else { selected = new Set([path]); anchor = path; }
      el.querySelectorAll('.tree-row').forEach((r) => r.classList.toggle('selected', selected.has(r.dataset.path)));
      const rowEl = el.querySelector(`.tree-row[data-path="${cssEscape(path)}"]`);
      if (rowEl) rowEl.scrollIntoView({ block: 'nearest' });
    }
    const cssEscape = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : s.replace(/["\\]/g, '\\$&'));

    function step(delta) {
      const list = files();
      if (!list.length) return null;
      const current = [...selected].find((p) => list.includes(p));
      let i = current ? list.indexOf(current) + delta : (delta > 0 ? 0 : list.length - 1);
      if (i < 0 || i >= list.length) return null;
      select(list[i]);
      opts.onOpen && opts.onOpen(list[i]);
      return list[i];
    }

    function activate(rowEl) {
      const path = rowEl.dataset.path;
      const isDir = rowEl.dataset.dir === '1';
      if (isDir) {
        if (path === '' ) { showRoots(); return; }
        setRoot(path);
      } else {
        opts.onOpen && opts.onOpen(path);
      }
    }

    el.addEventListener('click', (e) => {
      const tw = e.target.closest('.tree-twisty.active');
      const rowEl = e.target.closest('.tree-row[data-path]');
      if (!rowEl) return;
      if (tw) { toggle(rowEl.dataset.path); return; }
      if (rowEl.dataset.nav === '1' && !e.ctrlKey && !e.metaKey && !e.shiftKey) { activate(rowEl); return; }
      select(rowEl.dataset.path, { add: e.ctrlKey || e.metaKey, range: e.shiftKey });
      if (rowEl.dataset.dir === '0' && !e.ctrlKey && !e.metaKey && !e.shiftKey) opts.onOpen && opts.onOpen(rowEl.dataset.path);
      el.focus();
    });
    el.addEventListener('dblclick', (e) => {
      const rowEl = e.target.closest('.tree-row[data-path]');
      if (!rowEl || rowEl.dataset.dir !== '1') return;
      activate(rowEl);
    });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const rowEl = e.target.closest('.tree-row[data-path]');
      if (rowEl && !selected.has(rowEl.dataset.path)) select(rowEl.dataset.path);
      opts.onContext && opts.onContext(e, [...selected], rowEl ? { path: rowEl.dataset.path, isDir: rowEl.dataset.dir === '1' } : null);
    });
    el.addEventListener('keydown', (e) => {
      const rows = Array.from(el.querySelectorAll('.tree-row[data-path]'));
      if (!rows.length) return;
      const current = rows.findIndex((r) => selected.has(r.dataset.path));
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const i = Math.max(0, Math.min(rows.length - 1, current + (e.key === 'ArrowDown' ? 1 : -1)));
        select(rows[i].dataset.path, { range: e.shiftKey });
        if (rows[i].dataset.dir === '0') opts.onOpen && opts.onOpen(rows[i].dataset.path);
      } else if (e.key === 'Enter' && current >= 0) {
        e.preventDefault();
        activate(rows[current]);
      } else if (e.key === 'ArrowRight' && current >= 0 && rows[current].dataset.dir === '1' && !expanded.has(rows[current].dataset.path)) {
        e.preventDefault(); toggle(rows[current].dataset.path);
      } else if (e.key === 'ArrowLeft' && current >= 0 && rows[current].dataset.dir === '1' && expanded.has(rows[current].dataset.path)) {
        e.preventDefault(); toggle(rows[current].dataset.path);
      } else if (e.key === 'Backspace') {
        e.preventDefault(); up();
      }
    });

    function up() {
      if (!rootDir) return;
      const parent = P().dirname(rootDir);
      const isTop = !parent || parent === rootDir || (!P().isElectron && parent === '/');
      if (!isTop) setRoot(parent); else showRoots();
    }

    return {
      setRoot, refresh, select, step, files, up, showRoots,
      root: () => rootDir,
      selected: () => [...selected],
      isLoading: () => loading,
      rerender: render,
    };
  }

  return { create };
})();
