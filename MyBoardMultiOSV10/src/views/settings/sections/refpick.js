// IconRef dropdowns inside the settings sections (users with their avatars, options with their icons, issue
// types): the shared ref dropdown (views/shared/refdropdown.js) instead of a <select>, which can only draw the
// app's own glyphs.
import { refButtonHtml, openRefList } from '../../shared/refdropdown.js';
import { letterAvatar } from '../../shared/cards.js';
import { icon, esc } from '../util.js';

const NONE_AVATAR = '<span class="mb-avatar-none" style="width:16px;height:16px"></span>';

/** Dropdown items for people ({ id, displayName, username, avatar }), led by "nobody" when `none` is given. */
export const userItems = (people, { none = null } = {}) => [
  ...(none ? [{ value: '', label: none, html: NONE_AVATAR }] : []),
  ...people.map((u) => ({ value: u.id, label: u.displayName ?? u.username ?? '?', iconRef: u.avatar || letterAvatar(u), hint: u.username ?? '' })),
];

/**
 * The closed dropdown: `key` names it (data-refpick), `value` a value or (multi) an array. The button keeps the
 * list's items as JSON so the click handler can open them without rebuilding.
 */
export function refPick(key, items, value, { title = '', placeholder = '', disabled = false, attrs = '', cls = '' } = {}) {
  // an empty single value shows the list's "none" entry (its icon and text) instead of a bare placeholder
  const none = !Array.isArray(value) && (value == null || value === '') ? items.find((x) => x.value === '') : null;
  const button = none
    ? `<button type="button" class="mb-refbutton ps-refbutton" data-ref-dd="${esc(key)}" aria-haspopup="listbox" aria-expanded="false" title="${esc(title || none.label)}" ${disabled ? 'disabled' : ''}>${none.html ?? icon(none.glyph ?? 'close')}<span class="mb-refbutton-text muted">${esc(none.label)}</span><span class="mb-refbutton-caret">${icon('chevronDown')}</span></button>`
    : refButtonHtml({ id: key, items, value, placeholder, title, icon, extraClass: 'ps-refbutton', disabled });
  return `<span class="ps-ref ${cls}" data-refpick="${esc(key)}" ${attrs}>${button}</span>`;
}

/**
 * Opens the list of a refPick when its button is pressed. `lists[key](holder) → { items, value | values, multi,
 * onPick(value, values), search? }` (null = nothing to open).
 */
export function bindRefPicks(el, lists) {
  el.addEventListener('click', (event) => {
    const button = event.target.closest('.ps-ref [data-ref-dd]');
    if (!button || button.disabled) return;
    const holder = button.closest('[data-refpick]');
    const spec = lists[holder?.dataset.refpick]?.(holder);
    if (!spec) return;
    event.preventDefault();
    openRefList(button, { icon, search: 'auto', ...spec });
  });
}
