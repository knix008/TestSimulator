const express = require('express');
const path = require('path');
const { execFileSync } = require('child_process');

const router = express.Router();
const pkg = require(path.join(__dirname, '../../package.json'));
const APP_ROOT = path.join(__dirname, '../..');

function gitOutput(args) {
  return execFileSync('git', args, {
    cwd: APP_ROOT,
    encoding: 'utf8',
    timeout: 4000,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

let gitCache = undefined;
let gitCacheAt = 0;

function getGitInfo() {
  const now = Date.now();
  if (gitCache !== undefined && now - gitCacheAt < 15000) return gitCache;
  try {
    const status = gitOutput(['status', '-b', '--porcelain']);
    const lines = status.split(/\r?\n/).filter((line, index) => index === 0 || line.trim());
    const head = lines[0] || '';
    const branch = (head.match(/^##\s+([^\s.]+)/) || [])[1] || 'HEAD';
    const dirty = lines.slice(1).length > 0;
    const log = gitOutput(['log', '-1', '--format=%h%n%cs%n%s']);
    const [commit, date, ...subjectLines] = log.split(/\r?\n/);
    if (!commit) {
      gitCache = null;
    } else {
      gitCache = { branch, commit, date: date || '', subject: subjectLines.join(' ').slice(0, 120), dirty };
    }
  } catch {
    gitCache = null;
  }
  gitCacheAt = now;
  return gitCache;
}

function getAppInfo() {
  const year = new Date().getFullYear();
  return {
    name: pkg.build?.productName || 'MyKanban',
    description: pkg.description || 'Multi-platform Kanban Board (Electron + Web)',
    version: pkg.version || '1.0.0',
    buildNumber: String(pkg.buildNumber || '1'),
    git: getGitInfo(),
    copyright: `Copyright © ${year}`,
    author: 'SHKWON(knix008@naver.com)',
    iconUrl: '/assets/icon.ico',
  };
}

router.get('/', (req, res) => {
  res.json(getAppInfo());
});

module.exports = router;
module.exports.getAppInfo = getAppInfo;
