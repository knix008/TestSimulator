'use strict';

// Engine entry; rule modules live in ./rules (see core/cfront.js).
const path = require('path');
const { createEngine } = require('../cfront');

module.exports = createEngine([path.join(__dirname, 'rules')]);
