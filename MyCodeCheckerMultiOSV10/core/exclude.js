'use strict';

// The project's analysis scope: exclusion patterns (globs) and excluded
// folders (root-relative, e.g. "apis" or "src/gen": the folder and
// everything below it, only at that place in the tree).

function normDirs(dirs) {
  return (dirs || []).map((d) => String(d || '').replace(/\\/g, '/').replace(/^\.?\/+|\/+$/g, '').toLowerCase()).filter(Boolean);
}

function inDirs(rel, dirs) {
  if (!dirs.length) return false;
  const n = String(rel || '').replace(/\\/g, '/').toLowerCase();
  return dirs.some((d) => n === d || n.startsWith(`${d}/`));
}

function excluded(rel, patterns) {
  const n = String(rel || '').replace(/\\/g, '/');
  return (patterns || []).some((p) => require('./platform/util').glob(n, p));
}

// (rel) => true when a root-relative path is out of scope; null when nothing is excluded.
function exclusionTest(options = {}) {
  const patterns = options.exclusions || [];
  const dirs = normDirs(options.excludeDirs);
  if (!patterns.length && !dirs.length) return null;
  return (rel) => inDirs(rel, dirs) || excluded(rel, patterns);
}

module.exports = { normDirs, inDirs, excluded, exclusionTest };
