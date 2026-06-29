let bumpFn = () => {};
let setVersionFn = () => {};

export function registerDataSyncHandlers({ bump, setVersion }) {
  bumpFn = bump;
  setVersionFn = setVersion;
}

export function notifyDataChanged() {
  bumpFn();
}

export function updateKnownVersion(version) {
  setVersionFn(version);
}

const MUTATION_METHODS = new Set(['post', 'put', 'delete']);
const MUTATION_PATHS = [
  /^requirements(\/|$)/,
  /^test-cases(\/|$)/,
  /^users(\/|$)/,
  /^excel\/import$/,
];

export function isDataMutation(method, url = '') {
  if (!MUTATION_METHODS.has(String(method).toLowerCase())) return false;
  const path = String(url).replace(/^\//, '').split('?')[0];
  return MUTATION_PATHS.some(re => re.test(path));
}
