// An archive's flat list of entries as a folder tree. Many archives never list their folders, only
// the files in them, so folders are made up from the paths.

function newNode(name, path) {
  return { name, path, isDir: true, implied: true, children: new Map(), size: 0, packed: 0, mtime: null, entry: null, files: 0 };
}

export function buildTree(entries) {
  const root = newNode('', '');
  for (const e of entries) {
    const parts = String(e.path).split('/').filter(Boolean);
    if (!parts.length) continue;
    let at = root;
    let prefix = '';
    for (let i = 0; i < parts.length - 1; i += 1) {
      prefix = prefix ? `${prefix}/${parts[i]}` : parts[i];
      if (!at.children.has(parts[i])) at.children.set(parts[i], newNode(parts[i], prefix));
      at = at.children.get(parts[i]);
    }
    const name = parts[parts.length - 1];
    const path = parts.join('/');
    const existing = at.children.get(name);
    if (e.isDir) {
      const node = existing ?? newNode(name, path);
      node.implied = false;
      node.entry = e;
      node.mtime = e.mtime ?? node.mtime;
      at.children.set(name, node);
    } else {
      at.children.set(name, {
        name,
        path,
        isDir: false,
        children: null,
        size: e.size,
        packed: e.packed,
        mtime: e.mtime,
        entry: e,
        files: 1,
      });
    }
  }
  sumUp(root);
  return root;
}

function sumUp(node) {
  let size = 0;
  let packed = 0;
  let files = 0;
  for (const c of node.children.values()) {
    if (c.isDir) sumUp(c);
    size += c.size ?? 0;
    packed += c.packed ?? 0;
    files += c.files;
  }
  node.size = size;
  node.packed = packed;
  node.files = files;
}

export function findNode(root, path) {
  if (!path) return root;
  let at = root;
  for (const part of path.split('/')) {
    at = at?.children?.get(part);
    if (!at) return null;
  }
  return at;
}

export function parentPath(path) {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i);
}

const COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

// Folders first, then by the chosen column.
export function sortItems(items, key, descending) {
  const value = (x) => {
    switch (key) {
      case 'size': return x.size ?? -1;
      case 'packed': return x.packed ?? -1;
      case 'ratio': return x.size ? (x.packed ?? 0) / x.size : -1;
      case 'mtime': return x.mtime ?? -1;
      case 'method': return x.entry?.method ?? '';
      case 'crc': return x.entry?.crc ?? -1;
      case 'type': return extensionOf(x.name);
      default: return x.name;
    }
  };
  const out = [...items];
  out.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    const va = value(a);
    const vb = value(b);
    const c = typeof va === 'string' ? COLLATOR.compare(va, vb) : va - vb;
    if (c !== 0) return descending ? -c : c;
    return COLLATOR.compare(a.name, b.name);
  });
  return out;
}

function extensionOf(name) {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toLowerCase() : '';
}

// "*" and "?" work as they do in a file search; anything else matches anywhere in the name.
export function filterItems(items, text) {
  const q = String(text ?? '').trim().toLowerCase();
  if (!q) return items;
  if (/[*?]/.test(q)) {
    const re = new RegExp(`^${q.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`);
    return items.filter((x) => re.test(x.name.toLowerCase()));
  }
  return items.filter((x) => x.name.toLowerCase().includes(q));
}

// Every entry matching the filter, anywhere in the archive: "search this archive".
export function searchAll(root, text) {
  const q = String(text ?? '').trim();
  if (!q) return [];
  const all = [];
  const walk = (n) => {
    for (const c of n.children.values()) {
      all.push(c);
      if (c.isDir) walk(c);
    }
  };
  walk(root);
  return filterItems(all, q);
}

// Range selection, as a file manager does it: shift extends from the anchor, ctrl toggles.
export function nextSelection(current, orderedKeys, key, { shift, ctrl, anchor }) {
  if (shift && anchor != null) {
    const a = orderedKeys.indexOf(anchor);
    const b = orderedKeys.indexOf(key);
    if (a >= 0 && b >= 0) {
      const [lo, hi] = a < b ? [a, b] : [b, a];
      const out = new Set(ctrl ? current : []);
      for (let i = lo; i <= hi; i += 1) out.add(orderedKeys[i]);
      return { selected: out, anchor };
    }
  }
  if (ctrl) {
    const out = new Set(current);
    if (out.has(key)) out.delete(key);
    else out.add(key);
    return { selected: out, anchor: key };
  }
  return { selected: new Set([key]), anchor: key };
}
