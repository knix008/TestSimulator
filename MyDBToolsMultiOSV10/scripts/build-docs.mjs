// Copy the user guide and tutorial (doc/*.md and doc/images) next to the viewer
// in public/doc, where Vite serves them in development and copies them into
// dist/ for the app. doc/ stays the one place the documents are edited.
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'doc');
const target = path.join(root, 'public', 'doc');
mkdirSync(target, { recursive: true });

const docs = readdirSync(source).filter((name) => name.endsWith('.md'));
for (const name of docs) cpSync(path.join(source, name), path.join(target, name));
if (existsSync(path.join(source, 'images'))) {
  cpSync(path.join(source, 'images'), path.join(target, 'images'), { recursive: true });
}
console.log(`[docs] ${docs.length} documents copied to public/doc`);
