'use strict';

/**
 * Run electron-builder --win with unsigned-build log noise suppressed.
 */
process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
delete process.env.npm_config_devdir;
delete process.env.NPM_CONFIG_DEVDIR;

const { log } = require('builder-util');

function shouldSilence(fields, message) {
  const msg = typeof message === 'string' ? message : typeof fields === 'string' ? fields : '';
  return /signing with signtool\.exe/i.test(msg) ||
    /no signing info identified/i.test(msg) ||
    /signing is skipped/i.test(msg);
}

const origInfo = log.info.bind(log);
const origWarn = log.warn.bind(log);

log.info = (fields, message) => {
  if (shouldSilence(fields, message)) return;
  return origInfo(fields, message);
};

log.warn = (fields, message) => {
  if (shouldSilence(fields, message)) return;
  return origWarn(fields, message);
};

process.argv.push('--win');
require('electron-builder/cli');
