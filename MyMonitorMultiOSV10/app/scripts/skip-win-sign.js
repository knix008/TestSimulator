"use strict";

/** Unsigned Windows builds — no code-signing certificate in this project. */
exports.default = async function skipWinSign() {
  return;
};
