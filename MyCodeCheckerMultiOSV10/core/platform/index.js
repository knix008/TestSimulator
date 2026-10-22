'use strict';

// One require for all platform modules: require('./platform').compliance ...

module.exports = {
  compliance: require('./compliance'),
  reports: require('./reports'),
  scm: require('./scm'),
  pullrequest: require('./pullrequest'),
  webhooks: require('./webhooks'),
  users: require('./users'),
  external: require('./external'),
  history: require('./history'),
  measures: require('./measures'),
  util: require('./util'),
};
