'use strict';
/**
 * Error → what the error dialog shows. Platform-independent (main, renderer,
 * tests): `{ message, details }` where `message` is the one-line summary and
 * `details` the copyable text (message, code, stack, extra context).
 */

function summarize(err) {
  if (err == null) return '';
  if (typeof err === 'string') return err;
  if (err instanceof Error || (typeof err === 'object' && typeof err.message === 'string')) {
    return String(err.message || err.name || 'Error');
  }
  try {
    return typeof err === 'object' ? JSON.stringify(err) : String(err);
  } catch (_) {
    return String(err);
  }
}

/**
 * @param {unknown} err  an Error, a string, a `{ message, stack, code }` object …
 * @param {{ context?: string, title?: string }} [extra]  where it happened (shown on top)
 * @returns {{ message: string, details: string }}
 */
function describeError(err, extra = {}) {
  const message = summarize(err) || 'Unknown error';
  const lines = [];
  if (extra.context) lines.push(`[${extra.context}]`);
  lines.push(message);
  if (err && typeof err === 'object') {
    const meta = [];
    if (err.name && err.name !== 'Error' && !message.startsWith(err.name)) meta.push(`name: ${err.name}`);
    if (err.code !== undefined) meta.push(`code: ${err.code}`);
    if (err.errno !== undefined) meta.push(`errno: ${err.errno}`);
    if (err.syscall) meta.push(`syscall: ${err.syscall}`);
    if (err.path) meta.push(`path: ${err.path}`);
    if (err.level) meta.push(`level: ${err.level}`); // ssh2
    if (meta.length) lines.push(meta.join(' · '));
    if (typeof err.stack === 'string' && err.stack.trim() && err.stack.trim() !== message) {
      lines.push('', err.stack.trim());
    }
    if (err.cause) {
      const cause = describeError(err.cause);
      lines.push('', `caused by: ${cause.details}`);
    }
  }
  if (extra.when) lines.push('', `at ${extra.when}`);
  return { message, details: lines.join('\n') };
}

module.exports = { describeError, summarize };
