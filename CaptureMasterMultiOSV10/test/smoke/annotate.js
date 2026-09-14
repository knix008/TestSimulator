// Runs inside the main window: capture the screen, draw annotations, report.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const key = (k, o = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o }));
  key('n', { ctrlKey: true });                     // Ctrl+N: capture screen
  for (let i = 0; i < 40 && !document.querySelector('.editor-canvas'); i++) await sleep(250);
  await sleep(300);
  const canvas = document.querySelector('.editor-canvas');
  if (!canvas) return 'no canvas after capture';
  const r = canvas.getBoundingClientRect();
  const pe = (type, x, y, extra = {}) => canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: r.left + x, clientY: r.top + y, button: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true, ...extra }));
  const drawDrag = async (tool, x1, y1, x2, y2) => {
    key(tool);
    await sleep(50);
    pe('pointerdown', x1, y1); pe('pointermove', (x1 + x2) / 2, (y1 + y2) / 2); pe('pointermove', x2, y2); pe('pointerup', x2, y2);
    await sleep(120);
  };
  await drawDrag('r', 60, 60, 260, 180);           // rectangle
  await drawDrag('a', 300, 250, 480, 120);         // arrow
  await drawDrag('o', 520, 80, 700, 200);          // ellipse
  await drawDrag('h', 80, 300, 400, 340);          // highlight
  await drawDrag('m', 450, 300, 650, 420);         // pixelate
  key('n'); await sleep(50); pe('pointerdown', 720, 300); pe('pointerup', 720, 300); await sleep(100);   // number badge
  key('n'); await sleep(50); pe('pointerdown', 760, 340); pe('pointerup', 760, 340); await sleep(100);
  key('t'); await sleep(50); pe('pointerdown', 100, 400); await sleep(100);
  const ta = document.querySelector('.text-editor');
  if (ta) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, 'CaptureMaster 주석 텍스트');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(50);
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }));
    await sleep(150);
  }
  key('z', { ctrlKey: true }); await sleep(80);     // undo once
  key('y', { ctrlKey: true }); await sleep(80);     // redo
  key('v'); await sleep(50);
  const state = document.querySelector('.statusbar').innerText.replace(/\n/g, ' | ');
  return `text editor: ${!!ta}; status: ${state}`;
})();
