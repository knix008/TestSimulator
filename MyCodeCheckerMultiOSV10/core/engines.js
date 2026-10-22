'use strict';

// Analyzer modules that follow core/ENGINE_CONTRACT.md. Each one is optional
// while the tree is being built; a module that is not present is skipped.

const ENGINE_MODULES = [
  { id: 'taint', path: './taint' },
  { id: 'sca', path: './sca' },
  { id: 'misra-c', path: './misra-c' },
  { id: 'misra-cpp', path: './misra-cpp' },
  { id: 'cert', path: './cert' },
  { id: 'absint', path: './absint' },
  { id: 'autosar', path: './autosar' },
  { id: 'misra-legacy', path: './misra-legacy' },
  { id: 'sem-js', path: './sem-js' },
  { id: 'sem-java', path: './sem-java' },
  { id: 'sem-cs', path: './sem-cs' },
  { id: 'sem-py', path: './sem-py' },
  { id: 'sem-go', path: './sem-go' },
  { id: 'sem-php', path: './sem-php' },
  { id: 'sem-rb', path: './sem-rb' },
];

let cache = null;

function engines() {
  if (cache) return cache;
  cache = [];
  for (const spec of ENGINE_MODULES) {
    let mod;
    try {
      mod = require(spec.path);
    } catch (err) {
      if (err && err.code === 'MODULE_NOT_FOUND' && String(err.message).includes(spec.path.slice(2))) continue;
      throw err;
    }
    if (mod && typeof mod.analyze === 'function' && typeof mod.catalog === 'function') {
      cache.push({ id: spec.id, analyze: mod.analyze, catalog: mod.catalog });
    }
  }
  return cache;
}

function engineCatalog() {
  const out = [];
  for (const engine of engines()) {
    for (const meta of engine.catalog()) out.push({ engine: engine.id, ...meta });
  }
  return out;
}

function extraLineRules() {
  try {
    return require('./rules-extra').RULES || [];
  } catch (err) {
    if (err && err.code === 'MODULE_NOT_FOUND' && String(err.message).includes('rules-extra')) return [];
    throw err;
  }
}

module.exports = { engines, engineCatalog, extraLineRules };
