'use strict';

// AUTOSAR C++14 (R19-03 / R22-11) rule pack on the shared C/C++ front end.
// Rule modules live in ./rules (see core/cfront.js).
const path = require('path');
const { createEngine } = require('../cfront');

module.exports = createEngine([path.join(__dirname, 'rules')]);
