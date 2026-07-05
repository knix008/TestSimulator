const fs = require('fs');
const { BrowserWindow } = require('electron');

async function exportHtmlToPdf(html, outputPath) {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true
    }
  });

  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await delay(400);
    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      marginsType: 0
    });
    fs.mkdirSync(require('path').dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, pdf);
  } finally {
    if (!win.isDestroyed()) {
      win.destroy();
    }
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  exportHtmlToPdf
};
