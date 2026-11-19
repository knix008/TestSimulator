// Kept for the old command: runs the web E2E category of npm test (scripts/test.mjs --only web), passing the arguments
// on (for example --no-build). The cases are in test/e2e/web.suite.mjs, the harness in test/e2e/web.harness.mjs.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const r = spawnSync(process.execPath, [path.join(root, 'scripts', 'test.mjs'), '--only', 'web', ...process.argv.slice(2)], { cwd: root, stdio: 'inherit' });
process.exit(r.status ?? 1);
