'use strict';

/**
 * A colourful reporter for `node --test`.
 *
 * Groups results under the suite they belong to, so related checks read
 * together, and closes with a summary. Colour is dropped automatically when the
 * output is not a terminal, or when NO_COLOR / FORCE_COLOR=0 say so.
 */

const useColour = (() => {
  if (process.env.NO_COLOR || process.env.FORCE_COLOR === '0') return false;
  if (process.env.FORCE_COLOR) return true;
  return process.stdout.isTTY === true;
})();

const paint = (code) => (text) => (useColour ? `[${code}m${text}[0m` : String(text));

const c = {
  bold: paint('1'),
  dim: paint('2'),
  red: paint('31'),
  green: paint('32'),
  yellow: paint('33'),
  blue: paint('34'),
  magenta: paint('35'),
  cyan: paint('36'),
  grey: paint('90'),
  redBold: paint('1;31'),
  greenBold: paint('1;32'),
  cyanBold: paint('1;36'),
};

const MARK = {
  pass: c.green('✔'),
  fail: c.red('✘'),
  skip: c.yellow('○'),
  todo: c.magenta('◑'),
};

const RULE = '─'.repeat(62);

function duration(ms) {
  if (!Number.isFinite(ms)) return '';
  if (ms >= 1000) return c.grey(`${(ms / 1000).toFixed(2)}s`);
  return c.grey(`${ms.toFixed(ms < 10 ? 1 : 0)}ms`);
}

/** Pad to `width` ignoring the invisible bytes in colour codes. */
function padVisible(text, width) {
  const visible = text.replace(/\[[0-9;]*m/g, '').length;
  return text + ' '.repeat(Math.max(1, width - visible));
}

function formatError(error, indent) {
  if (!error) return '';
  const cause = error.cause || error;
  const message = String(cause.message || cause).split('\n');
  const lines = [];

  lines.push(`${indent}${c.red(message[0])}`);
  for (const extra of message.slice(1, 12)) lines.push(`${indent}${c.grey(extra)}`);

  const stack = String(cause.stack || '')
    .split('\n')
    .filter((line) => /^\s+at /.test(line) && !line.includes('node:internal'))
    .slice(0, 3);
  for (const frame of stack) lines.push(`${indent}${c.grey(frame.trim())}`);

  return lines.join('\n');
}

module.exports = async function* reporter(source) {
  const counts = { pass: 0, fail: 0, skip: 0, todo: 0 };
  const failures = [];
  let currentSuite = null;
  let suiteCount = 0;
  let started = 0;
  let wroteHeader = false;

  for await (const event of source) {
    const data = event.data || {};
    const nesting = data.nesting || 0;

    if (event.type === 'test:start') {
      if (!started) started = Date.now();
      if (!wroteHeader) {
        wroteHeader = true;
        yield `\n  ${c.cyanBold('MyDockBar')} ${c.dim('- test suite')}\n`;
      }
      // A describe() block opens at nesting 0 and becomes the heading its
      // it() blocks are listed under.
      if (nesting === 0) {
        currentSuite = data.name;
      }
      continue;
    }

    if (event.type === 'test:stderr' || event.type === 'test:stdout') {
      const text = String(data.message || '').trimEnd();
      if (text) yield `${c.grey('      | ')}${c.grey(text)}\n`;
      continue;
    }

    if (event.type !== 'test:pass' && event.type !== 'test:fail') continue;

    const isSuite = data.details && data.details.type === 'suite';
    const skipped = data.skip !== undefined && data.skip !== false;
    const todo = data.todo !== undefined && data.todo !== false;

    if (isSuite) {
      // The container closing: its children have already been printed.
      if (nesting === 0) currentSuite = null;
      continue;
    }

    // Print the heading lazily, so a suite whose tests were all filtered out
    // does not leave an empty section behind.
    if (nesting > 0 && currentSuite) {
      suiteCount += 1;
      yield `\n  ${c.bold(currentSuite)}\n`;
      currentSuite = null;
    }

    if (skipped) counts.skip += 1;
    else if (todo) counts.todo += 1;
    else if (event.type === 'test:pass') counts.pass += 1;
    else counts.fail += 1;

    const mark = skipped ? MARK.skip
      : todo ? MARK.todo
        : event.type === 'test:pass' ? MARK.pass : MARK.fail;

    const indent = nesting > 0 ? '    ' : '  ';
    const name = skipped ? c.grey(data.name) : data.name;
    let line = `${indent}${mark} ${padVisible(name, 60 - indent.length)}`;
    line += duration(data.details && data.details.duration_ms);
    if (skipped && typeof data.skip === 'string') line += ` ${c.grey(`(${data.skip})`)}`;

    yield `${line}\n`;

    if (event.type === 'test:fail' && !skipped && !todo) {
      failures.push({ name: data.name, error: data.details && data.details.error });
      yield `${formatError(data.details && data.details.error, `${indent}    `)}\n`;
    }
  }

  const elapsed = started ? Date.now() - started : 0;
  const total = counts.pass + counts.fail + counts.skip + counts.todo;

  const cell = (label, value, colour) => `${colour(label)} ${c.bold(value)}`;
  const parts = [
    cell('groups', suiteCount, c.grey),
    cell('tests', total, c.grey),
    cell('passed', counts.pass, c.green),
    cell('failed', counts.fail, counts.fail ? c.red : c.grey),
  ];
  if (counts.skip) parts.push(cell('skipped', counts.skip, c.yellow));
  if (counts.todo) parts.push(cell('todo', counts.todo, c.magenta));

  yield `\n  ${c.grey(RULE)}\n`;
  yield `  ${parts.join(c.grey('  |  '))}\n`;
  yield `  ${c.grey(`finished in ${(elapsed / 1000).toFixed(2)}s`)}\n`;

  if (failures.length) {
    yield `\n  ${c.redBold('Failures')}\n`;
    for (const failure of failures) {
      yield `    ${c.red('x')} ${failure.name}\n`;
    }
    yield `\n  ${c.redBold(`${failures.length} test${failures.length === 1 ? '' : 's'} failed`)}\n\n`;
  } else {
    yield `\n  ${c.greenBold('All tests passed')}\n\n`;
  }
};
