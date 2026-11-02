// Pure helpers for the figure's menus, context menus, tool bars and tables
// (uimenu, uicontextmenu, uitoolbar, uipushtool, uitoggletool, uitable).
// Node children arrive newest first (like the engine's Children).

const shown = (n) => n && n.props && n.props.Visible !== false;

/** uimenu children of a node in Position order. */
export function menuChildren(node) {
  const list = (node && node.children ? node.children : []).filter((c) => c.type === 'uimenu' && shown(c)).slice().reverse();
  return list.map((c, i) => ({ c, i })).sort((a, b) => (Number(a.c.props.Position) || 0) - (Number(b.c.props.Position) || 0) || a.i - b.i).map((x) => x.c);
}

/** Menu label: Text (or Label) without the '&' mnemonic markers ('&&' is a literal '&'). */
export function menuLabel(m) {
  const s = String(m.props.Text || m.props.Label || '');
  return s.replace(/&&/g, '\u0000').replace(/&/g, '').replace(/\u0000/g, '&');
}

/** Accelerator key text shown next to an item (Ctrl+K). */
export function acceleratorText(m) {
  const a = String(m.props.Accelerator || '').trim();
  return a ? `Ctrl+${a.toUpperCase()}` : '';
}

/** Items for openMenu (lib/menu) from a menu node's children. Submenus get the chevron icon. */
export function menuItems(node) {
  const out = [];
  for (const m of menuChildren(node)) {
    if (m.props.Separator && out.length) out.push({ sep: true });
    const sub = menuChildren(m).length > 0;
    out.push({
      id: String(m.id), label: menuLabel(m) + (sub ? ' …' : ''), keys: acceleratorText(m),
      icon: sub ? 'chevronRight' : m.props.Checked ? 'check' : 'circleDot',
      disabled: m.props.Enable === false, on: !!m.props.Checked,
    });
  }
  return out;
}

/** The node with the given id below root (or null). */
export function findIn(root, id) {
  if (!root) return null;
  if (root.id === id) return root;
  for (const c of root.children || []) { const r = findIn(c, id); if (r) return r; }
  return null;
}

/** The uimenu of the figure menu bar whose Accelerator is key (enabled leaves only). */
export function findAccelerator(fig, key) {
  const k = String(key || '').toLowerCase();
  if (!k) return null;
  const walk = (node) => {
    for (const m of menuChildren(node)) {
      if (m.props.Enable === false) continue;
      const kids = menuChildren(m);
      if (kids.length) { const r = walk(m); if (r) return r; continue; }
      if (String(m.props.Accelerator || '').toLowerCase() === k) return m;
    }
    return null;
  };
  return walk(fig);
}

/** The uicontextmenu node a node points at (props.ContextMenu = id), or null. */
export function contextMenuOf(fig, node) {
  const id = node && node.props ? node.props.ContextMenu : null;
  if (id == null) return null;
  return (fig.children || []).find((c) => c.id === id && c.type === 'uicontextmenu') || null;
}

/** Visible tool bars of a figure (creation order) with their tools. */
export function toolbarsOf(fig) {
  return (fig.children || []).filter((c) => c.type === 'uitoolbar' && shown(c)).slice().reverse()
    .map((tb) => ({ node: tb, tools: (tb.children || []).filter((t) => (t.type === 'uipushtool' || t.type === 'uitoggletool') && shown(t)).slice().reverse() }));
}

/** Label of a tool button: its tooltip, else its Tag, else a fallback. */
export function toolLabel(t, fallback = 'Tool') {
  return String(t.props.TooltipString || t.props.Tooltip || t.props.Tag || fallback);
}

/** RGBA pixels (Uint8ClampedArray, row-major) of a tool CData Mat (m×n×3, 0..1 or 0..255; NaN = transparent). */
export function cdataPixels(M) {
  if (!M || !M.dims || M.dims.length < 3 || M.dims[2] < 3) return null;
  const [m, n] = M.dims;
  const d = M.data;
  let max = 0;
  for (let i = 0; i < d.length; i++) if (d[i] > max) max = d[i];
  const scale = max > 1 ? 1 : 255;
  const px = new Uint8ClampedArray(m * n * 4);
  for (let y = 0; y < m; y++) for (let x = 0; x < n; x++) {
    const k = y + x * m, o = (y * n + x) * 4;
    const r = d[k], g = d[k + m * n], b = d[k + 2 * m * n];
    if (r !== r || g !== g || b !== b) { px[o + 3] = 0; continue; }
    px[o] = r * scale; px[o + 1] = g * scale; px[o + 2] = b * scale; px[o + 3] = 255;
  }
  return { width: n, height: m, data: px };
}

/** Cell text of a uitable cell ({t, v, s}). */
export function cellText(cell) {
  if (!cell) return '';
  if (cell.t === 'n') return cell.s != null ? cell.s : String(cell.v);
  if (cell.t === 'b') return cell.v ? 'true' : 'false';
  return String(cell.v ?? '');
}
