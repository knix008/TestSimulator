(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const key = (k, o = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o }));
  const cm = window.__capturemaster;
  cm.updateSettings({ video: { ...cm.settings.current.video, minimizeWhileRecording: false, askPath: false }, paths: { ...cm.settings.current.paths, videoDir: '__SMOKE_DIR__' } });
  await sleep(400);
  key('v', { ctrlKey: true, shiftKey: true });   // start
  await sleep(4000);
  const during = document.querySelector('.statusbar').innerText.replace(/\n/g, ' | ');
  key('v', { ctrlKey: true, shiftKey: true });   // stop
  await sleep(3000);
  const d = cm.active;
  return `during: ${during} || after: kind=${d && d.kind} path=${d && d.path} ${d && d.width}x${d && d.height}`;
})();
