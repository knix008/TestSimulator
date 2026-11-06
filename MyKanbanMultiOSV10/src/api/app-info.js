const express = require('express');
const path = require('path');

const router = express.Router();
const pkg = require(path.join(__dirname, '../../package.json'));

function getAppInfo() {
  const year = new Date().getFullYear();
  return {
    name: pkg.productName || 'MyKanban',
    description: pkg.description,
    version: pkg.version,
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
