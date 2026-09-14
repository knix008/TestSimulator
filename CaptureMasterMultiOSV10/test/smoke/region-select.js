// Runs inside the region overlay: drag a rectangle and confirm with Enter.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const el = document.querySelector('.region');
  if (!el) return 'not the region overlay';
  const pe = (type, x, y) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
  pe('pointerdown', 200, 150); pe('pointermove', 500, 400); pe('pointermove', 900, 650); pe('pointerup', 900, 650);
  await sleep(200);
  const label = document.querySelector('.region .label');
  const text = label ? label.textContent : 'no label';
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  return 'selected ' + text;
})();
