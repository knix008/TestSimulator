'use strict';

// Loads every rule module; each registers its rules through define.rule().

const { RULES, BY_ID, meta } = require('./define');

const MODULES = ['./flow-rules', './bugs', './smells', './security', './react', './a11y', './ts', './regex', './tests', './node'];
for (const m of MODULES) {
  try {
    require(m);
  } catch (err) {
    if (!(err && err.code === 'MODULE_NOT_FOUND' && String(err.message).includes(m.slice(2)))) throw err;
  }
}

module.exports = { RULES, BY_ID, meta };
