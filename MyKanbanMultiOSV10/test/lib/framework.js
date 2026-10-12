/* Minimal describe/it framework used by test/run.js */

const DEFAULT_TIMEOUT_MS = 15000;

const suites = [];
let currentSuite = null;
let currentFile = '';

function setCurrentFile(file) {
  currentFile = file;
}

function getSuites() {
  return suites;
}

function describe(name, fn) {
  if (currentSuite) throw new Error(`Nested describe() is not supported: "${name}"`);
  const suite = {
    name,
    file: currentFile,
    tests: [],
    hooks: { before: [], after: [], beforeEach: [], afterEach: [] },
  };
  currentSuite = suite;
  try {
    fn();
  } finally {
    currentSuite = null;
  }
  suites.push(suite);
}

function requireSuite(api) {
  if (!currentSuite) throw new Error(`${api}() must be called inside describe()`);
  return currentSuite;
}

function it(name, fn, { timeout = DEFAULT_TIMEOUT_MS } = {}) {
  requireSuite('it').tests.push({ name, fn, timeout, skip: false });
}

it.skip = (name, fn) => {
  requireSuite('it.skip').tests.push({ name, fn, timeout: 0, skip: true });
};

function before(fn) { requireSuite('before').hooks.before.push(fn); }
function after(fn) { requireSuite('after').hooks.after.push(fn); }
function beforeEach(fn) { requireSuite('beforeEach').hooks.beforeEach.push(fn); }
function afterEach(fn) { requireSuite('afterEach').hooks.afterEach.push(fn); }

function withTimeout(promise, ms, label) {
  if (!ms) return promise;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

module.exports = {
  describe,
  it,
  before,
  after,
  beforeEach,
  afterEach,
  getSuites,
  setCurrentFile,
  withTimeout,
  DEFAULT_TIMEOUT_MS,
};
