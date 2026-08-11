/**
 * Keyboard input-target helpers.
 */

const NON_TEXT_INPUT_TYPES = new Set([
  'checkbox',
  'radio',
  'button',
  'submit',
  'reset',
  'file',
  'range',
  'color',
  'hidden',
  'image'
]);

export function isEditableTarget(target) {
  if (!target || !(target instanceof Element)) return false;
  if (target.isContentEditable) return true;
  const el = target.closest?.('input, textarea, select, [contenteditable="true"]');
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'textarea' || tag === 'select') return true;
  if (tag === 'input') {
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    // Range / checkbox / etc. must not block Space play-pause.
    if (NON_TEXT_INPUT_TYPES.has(type)) return false;
    return true;
  }
  return Boolean(el.isContentEditable);
}

export function isModalOpen() {
  return Boolean(document.querySelector('dialog.modal[open]'));
}

export function isSpaceKey(e) {
  return e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar';
}
