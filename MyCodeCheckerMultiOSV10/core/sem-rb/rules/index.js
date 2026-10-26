'use strict';

// Loads every rule file; each registers its rules in ./core.

require('./smells');
require('./bugs');
require('./security');
require('./rails');

module.exports = require('./core');
