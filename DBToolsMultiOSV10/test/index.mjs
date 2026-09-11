// Discovers every *.test.mjs under test/ and runs them.
// Usage: node test/index.mjs [name-filter]
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runAll } from './helpers/runner.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

function collect(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === 'helpers') continue;
      collect(full, out);
    } else if (name.endsWith('.test.mjs')) {
      out.push(full);
    }
  }
  return out;
}

const files = collect(here);
const filter = process.argv[2];

console.log(`Running ${files.length} test file${files.length === 1 ? '' : 's'}${filter ? ` (filter: ${filter})` : ''}\n`);

for (const file of files) {
  await import(pathToFileURL(file).href);
}

const { passed, failed, failures } = await runAll({ filter });

console.log(`\n${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  ${f.suite} › ${f.test}\n    ${f.detail}`);
}
process.exit(failed > 0 ? 1 : 0);
