// Electron entry for scripts/render-art.mjs: renders scripts/art/index.html in
// a hidden window and prints the artwork (JSON with PNG data URLs) to stdout.
const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')

app.disableHardwareAcceleration && false // keep the GPU: three.js needs WebGL
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1200, height: 1200, webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false } })
  await win.loadFile(path.join(__dirname, 'index.html'))
  const out = process.env.MYCIRCUIT_ART_OUT
  for (let i = 0; i < 600; i++) {
    const art = await win.webContents.executeJavaScript('window.__art || null')
    if (art) {
      fs.writeFileSync(out, JSON.stringify(art))
      app.exit(art.ok ? 0 : 2)
      return
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  app.exit(3)
})
