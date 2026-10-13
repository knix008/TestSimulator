const express = require('express');
const path = require('path');

const router = express.Router();
const pkg = require(path.join(__dirname, '../../package.json'));

function getAppInfo() {
  const year = new Date().getFullYear();
  return {
    name: pkg.build?.productName || 'MyKanban',
    description: pkg.description || 'Multi-platform Kanban Board (Electron + Web)',
    version: pkg.version || '1.0.0',
    buildNumber: String(pkg.buildNumber || '1'),
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
