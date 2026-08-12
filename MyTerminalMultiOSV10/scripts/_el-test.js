const { app, BrowserWindow } = require('electron');
if (!app) { console.log('NO_APP'); process.exit(2); }
app.whenReady().then(async () => {
  console.log('READY chromeOK v=' + process.versions.electron);
  app.quit();
}).catch(e => { console.log('ERR ' + e.message); app.quit(); });
setTimeout(()=>{console.log('TIMEOUT');process.exit(1);}, 15000);
