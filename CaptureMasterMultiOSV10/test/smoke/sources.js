(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const key = (k, o = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o }));
  const cm = window.__capturemaster;
  cm.updateSettings({ language: 'en', theme: 'daylight', toolbar: { showLabels: true }, font: { family: 'Segoe UI', size: 13, bold: false, italic: false } });
  await sleep(800);
  key('w', { ctrlKey: true, shiftKey: true });   // window picker
  await sleep(2500);
  return 'lang=' + document.documentElement.lang + ' min=' + document.querySelector('.toolbar').scrollWidth;
})();
