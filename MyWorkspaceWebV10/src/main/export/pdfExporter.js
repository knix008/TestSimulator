const fs = require('fs');
const os = require('os');
const path = require('path');
const { BrowserWindow } = require('electron');

async function exportHtmlToPdf(html, outputPath) {
  const tempFile = path.join(os.tmpdir(), `myworkspace-export-${process.pid}-${Date.now()}.html`);
  fs.writeFileSync(tempFile, html, 'utf8');

  const win = new BrowserWindow({
    width: 1024,
    height: 1400,
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true
    }
  });

  try {
    await win.loadFile(tempFile);
    await waitForPdfDocumentReady(win.webContents);
    await normalizeExportImagesForPdf(win.webContents);
    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      marginsType: 1,
      pageSize: 'A4'
    });
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, pdf);
  } finally {
    if (!win.isDestroyed()) {
      win.destroy();
    }
    try {
      fs.unlinkSync(tempFile);
    } catch {
      // ignore cleanup errors
    }
  }
}

async function normalizeExportImagesForPdf(webContents) {
  await webContents.executeJavaScript(`
    (() => {
      for (const img of document.images) {
        const width = Number.parseInt(img.getAttribute('width') || img.dataset.editorWidth || '0', 10);
        const height = Number.parseInt(img.getAttribute('height') || img.dataset.editorHeight || '0', 10);
        if (!Number.isFinite(width) || width <= 0) {
          continue;
        }

        img.classList.add('export-sized-image');
        img.style.width = width + 'px';
        img.style.maxWidth = 'none';

        if (Number.isFinite(height) && height > 0) {
          img.style.height = height + 'px';
          img.style.objectFit = 'contain';
        } else if (img.naturalWidth > 0 && img.naturalHeight > 0) {
          img.style.height = Math.round(img.naturalHeight * (width / img.naturalWidth)) + 'px';
        } else {
          img.style.height = 'auto';
        }
      }
    })()
  `);
  await delay(100);
}

async function waitForPdfDocumentReady(webContents, timeoutMs = 15000) {
  await webContents.executeJavaScript(`
    new Promise((resolve) => {
      if (document.readyState === 'complete') {
        resolve();
        return;
      }
      window.addEventListener('load', () => resolve(), { once: true });
    })
  `);

  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const imagesReady = await webContents.executeJavaScript(`
      (() => {
        const images = Array.from(document.images);
        if (images.length === 0) {
          return true;
        }
        return images.every((img) => img.complete);
      })()
    `);
    if (imagesReady) {
      await delay(150);
      return;
    }
    await delay(100);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  exportHtmlToPdf
};
