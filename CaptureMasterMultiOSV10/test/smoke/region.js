(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const key = (k, o = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o }));
  window.__capturemaster.updateSettings({ language: 'ko', theme: 'midnight', toolbar: { showLabels: false } });
  await sleep(300);
  key('r', { ctrlKey: true, shiftKey: true });
  await sleep(3500);
  return 'region overlay requested';
})();
