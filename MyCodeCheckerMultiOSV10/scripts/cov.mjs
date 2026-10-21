#!/usr/bin/env node
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { analyzePath, walk } = require('../core/analyze');
const { createApi } = require('../core/api');
const { DEFAULT_POLICY } = require('../core/coverity');

// cov-build / cov-analyze / cov-commit-defects for this workbench.
//   node scripts/cov.mjs build  --path <folder> [--emit .mcc]
//   node scripts/cov.mjs analyze --path <folder>
//   node scripts/cov.mjs commit --path <folder> [--stream main] [--config <dir>]
const cmd = process.argv[2];
const folder = path.resolve(arg('path') || '.');
if (!cmd || !['build', 'analyze', 'commit'].includes(cmd)) {
  console.error('Usage: node scripts/cov.mjs build|analyze|commit --path <folder>');
  process.exit(2);
}
if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
  console.error(`Folder not found: ${folder}`);
  process.exit(2);
}

if (cmd === 'build') {
  const emit = path.resolve(arg('emit', path.join(folder, '.mcc')));
  const files = walk(folder, {});
  fs.mkdirSync(emit, { recursive: true });
  const capture = { capturedAt: new Date().toISOString(), root: folder, files: files.map((file) => path.relative(folder, file).replace(/\\/g, '/')) };
  fs.writeFileSync(path.join(emit, 'capture.json'), JSON.stringify(capture, null, 2));
  console.log(`[cov-build] ${capture.files.length} files → ${path.join(emit, 'capture.json')}`);
  process.exit(0);
}

if (cmd === 'analyze') {
  const analysis = analyzePath(folder, { policy: DEFAULT_POLICY });
  const c = analysis.coverity;
  console.log(`[cov-analyze] outstanding=${c.outstanding} high=${c.outstandingHigh} new=${c.newlyDetected} checkers=${Object.keys(c.byChecker).length}`);
  for (const issue of analysis.issues.filter((i) => i.checker).slice(0, 40)) {
    console.log(`  CID ${issue.cid} ${issue.impact} ${issue.checker} ${issue.file}:${issue.line}`);
  }
  process.exit(0);
}

const api = createApi({ configDir: arg('config', '') || undefined });
const result = await api.call('project.scan', { path: folder, branch: arg('stream', 'main'), commit: true });
const c = result.analysis.coverity;
console.log(`[cov-commit] snapshot=${c.snapshot} stream=${c.stream} policy=${c.policy.status} outstanding=${c.outstanding} new=${c.newlyDetected} fixed=${c.fixed}`);
process.exit(c.policy.status === 'OK' ? 0 : 1);

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  return fallback;
}
