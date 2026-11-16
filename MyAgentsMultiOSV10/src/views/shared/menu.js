// Action menus of the views (a gadget's ⋯, the saved-filter menu …) open as the app's own menu popup (the same
// look, icons and keyboard as every other menu), not as an in-page list. Items: { value, label, glyph, danger?,
// disabled?, checked? } or { separator: true }; onPick(value) runs for the chosen one.
export function showViewMenu(ctx, anchorEl, items, onPick, header = null) {
  const app = ctx?.app;
  if (!app?.showMenu) return undefined;
  const handlers = {};
  const menu = items.map((item) => {
    if (item.separator) return { separator: true };
    const id = `custom:view-menu:${item.value}`;
    handlers[id] = () => onPick(item.value);
    return { id, label: item.label, icon: item.glyph ?? 'dot', danger: Boolean(item.danger), disabled: Boolean(item.disabled), checked: Boolean(item.checked) };
  });
  const anchor = app.anchorBelow?.(anchorEl) ?? null;
  return app.showMenu(menu, anchor, 'context', { handlers, ...(header ? { header } : {}) });
}
