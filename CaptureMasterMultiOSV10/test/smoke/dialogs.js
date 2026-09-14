(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const key = (k, o = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o }));
  key('n', { ctrlKey: true });
  for (let i = 0; i < 40 && !document.querySelector('.editor-canvas'); i++) await sleep(250);
  await sleep(300);
  const cm = window.__capturemaster;
  const doc = cm.active;
  // Save to a known path through the same IPC the Save button uses.
  const api = window.electronAPI;
  const path = '__SMOKE_DIR__/test.cmcap';
  const text = JSON.stringify({ format: 'capturemaster-capture', version: 1, name: 'Round trip', createdAt: Date.now(), image: doc.history.present.image, annotations: [{ id: 'a1', type: 'rect', x: 40, y: 40, w: 300, h: 200, color: '#00ff88', strokeWidth: 6 }] });
  await api.fs.writeText({ filePath: path, content: text });
  await cm.openPaths([path]);
  await sleep(800);
  const opened = cm.active;
  const ok = opened && opened.path === path && opened.history.present.annotations.length === 1;
  // Draw one more rectangle and save in place (no dialog since the path is known).
  const canvas = document.querySelector('.editor-canvas');
  const r = canvas.getBoundingClientRect();
  const pe = (type, x, y) => canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: r.left + x, clientY: r.top + y, button: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
  key('r'); await sleep(30); pe('pointerdown', 50, 50); pe('pointermove', 200, 150); pe('pointerup', 200, 150); await sleep(100);
  const saved = await cm.saveDoc(cm.active, false);
  await sleep(300);
  const back = JSON.parse(await api.fs.readText({ filePath: path }));
  const saveOk = [saved, back.annotations.length, cm.active.history.present === cm.active.savedPresent, cm.active.name].join(',');
  key(',', { ctrlKey: true });   // settings
  await sleep(1500);
  key('F1');                      // about
  await sleep(1200);
  key('p', { ctrlKey: true });    // print dialog
  await sleep(1200);
  cm.openPaths(['C:/nonexistent/missing.cmcap']);   // error dialog
  await sleep(1500);
  return `roundtrip ok: ${ok}; save ok: ${saveOk}; docs: ${cm.docs.length}; recent: ${cm.settings.current.recent.map((r) => r.name).join(',')}`;
})();
