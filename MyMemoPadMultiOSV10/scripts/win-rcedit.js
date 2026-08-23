'use strict';

/**
 * Apply Windows version strings + icon via rcedit using a copy/replace
 * pattern (avoids in-place "Unable to commit changes" locks).
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const VERSION = '2.6.0';
const RCEDIT = path.join(
  process.env.LOCALAPPDATA || '',
  'electron-builder',
  'Cache',
  'winCodeSign',
  `winCodeSign-${VERSION}`,
  'rcedit-x64.exe'
);

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function runRcedit(targetExe, { icon, productName, description, copyright, company, version }) {
  if (!fs.existsSync(RCEDIT)) {
    throw new Error(`rcedit not found: ${RCEDIT}`);
  }
  if (!fs.existsSync(targetExe)) {
    throw new Error(`exe not found: ${targetExe}`);
  }

  const tmp = `${targetExe}.rcedit-tmp`;
  fs.copyFileSync(targetExe, tmp);

  const args = [
    tmp,
    '--set-version-string', 'FileDescription', description || productName,
    '--set-version-string', 'ProductName', productName,
    '--set-version-string', 'LegalCopyright', copyright || '',
    '--set-version-string', 'InternalName', productName,
    '--set-version-string', 'OriginalFilename', `${productName}.exe`,
    '--set-version-string', 'CompanyName', company || productName,
    '--set-file-version', version,
    '--set-product-version', /^\d+\.\d+\.\d+$/.test(version) ? `${version}.0` : version
  ];
  if (icon && fs.existsSync(icon)) {
    args.push('--set-icon', icon);
  }

  let lastErr = '';
  for (let attempt = 1; attempt <= 4; attempt++) {
    const result = spawnSync(RCEDIT, args, { encoding: 'utf8', windowsHide: true });
    if (result.status === 0) {
      try {
        fs.unlinkSync(targetExe);
      } catch {
        sleep(200);
        try {
          fs.unlinkSync(targetExe);
        } catch (err) {
          fs.unlinkSync(tmp);
          throw new Error(`Could not replace exe (locked?): ${err.message}`);
        }
      }
      fs.renameSync(tmp, targetExe);
      return;
    }
    lastErr = (result.stderr || result.stdout || `exit ${result.status}`).trim();
    sleep(300 * attempt);
  }

  try {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  } catch {
    /* ignore */
  }
  throw new Error(`rcedit failed: ${lastErr}`);
}

module.exports = { runRcedit, RCEDIT };
