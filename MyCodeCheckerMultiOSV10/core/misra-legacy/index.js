'use strict';

// Legacy MISRA rule packs: MISRA C:2004 (rules/c2004) and MISRA C++:2008
// (rules/cpp2008). Engine driver: core/cfront.js.
const path = require('path');
const { createEngine } = require('../cfront');

module.exports = createEngine([
  path.join(__dirname, 'rules', 'c2004'),
  path.join(__dirname, 'rules', 'cpp2008'),
]);
