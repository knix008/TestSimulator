export const VALID_MENU_LAYOUTS = ['vertical', 'horizontal'];

export function normalizeMenuLayout(layout) {
  return VALID_MENU_LAYOUTS.includes(layout) ? layout : 'vertical';
}
