// Lets `node --test test/unit/` work on Node 22 / Windows, where a directory argument is resolved as a
// module path (this index) instead of being expanded: load every *.test.mjs / *.test.js file here.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = import.meta.dirname;
for (const name of fs.readdirSync(dir).sort()) {
  if (/\.test\.m?js$/.test(name)) await import(pathToFileURL(path.join(dir, name)).href);
}
