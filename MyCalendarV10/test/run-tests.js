#!/usr/bin/env node
/**
 * Automated test runner. Discovers and runs every *.test.js under test/
 * using Node's built-in test runner (no external dependencies).
 *
 *   node test/run-tests.js          # run all suites
 *   node test/run-tests.js events   # run only files matching "events"
 *
 * Equivalent to `npm test`.
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const dir = __dirname;
const filter = process.argv[2];
let files = fs.readdirSync(dir).filter(f => f.endsWith('.test.js'));
if (filter) files = files.filter(f => f.includes(filter));

if (!files.length) {
  console.error(filter ? `No test files match "${filter}".` : 'No test files found.');
  process.exit(1);
}

console.log(`Running ${files.length} test file(s):\n  ${files.join('\n  ')}\n`);

const args = ['--test', '--test-reporter=spec', ...files.map(f => path.join(dir, f))];
const res = spawnSync(process.execPath, args, { stdio: 'inherit', cwd: path.join(dir, '..') });

process.exit(res.status == null ? 1 : res.status);
