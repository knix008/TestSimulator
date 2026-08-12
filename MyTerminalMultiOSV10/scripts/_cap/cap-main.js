const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
async function shot(win, r, out) {
  await win.loadFile(path.join(__dirname, 'cap.html'), { search: '?r=' + r });
  const t0 = Date.now();
  while (Date.now() - t0 < 6000) {
    const ok = await win.webContents.executeJavaScript('window.__ready===true').catch(()=>false);
    if (ok) break;
    await new Promise(r=>setTimeout(r,150));
  }
  await new Promise(r=>setTimeout(r,400));
  const img = await win.webContents.capturePage();
  fs.writeFileSync(out, img.toPNG());
  console.log('wrote', out, fs.statSync(out).size, 'title=', win.getTitle());
}
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 560, height: 420, show: false,
    webPreferences: { offscreen: false } });
  await shot(win, 'webgl', path.join(__dirname, 'out-webgl.png'));
  await shot(win, 'canvas', path.join(__dirname, 'out-canvas.png'));
  app.quit();
}).catch(e=>{console.log('ERR', e.message); app.quit();});
setTimeout(()=>{console.log('TIMEOUT');process.exit(1);}, 30000);
