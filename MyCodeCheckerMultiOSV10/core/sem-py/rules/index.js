'use strict';

// All sem-py rules, in catalog order.

const groups = [
  require('./flow'),
  require('./bugs'),
  require('./bugs2'),
  require('./scoperules'),
  require('./smells'),
];

const RULES = [];
for (const g of groups) RULES.push(...g.RULES);

module.exports = { RULES };
