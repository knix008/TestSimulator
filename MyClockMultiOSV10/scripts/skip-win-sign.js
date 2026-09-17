'use strict';

/** No-op Windows sign hook — project ships unsigned builds. */
exports.default = async function skipWinSign() {
  return;
};
