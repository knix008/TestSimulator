// Loaded with `node --import` for the tests: the renderer's modules import each other without an
// extension (`import { t } from './i18n'`), which Vite resolves and plain Node does not. A relative
// specifier that is not found as written is tried again with `.js`, then `.jsx`. JSX is compiled
// here so a test can render a screen (the start page) without a Vite build.
import fs from 'node:fs';
import path from 'node:path';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

function jsxFile(parentURL, specifier) {
  if (!parentURL) return null;
  const abs = path.resolve(path.dirname(fileURLToPath(parentURL)), specifier);
  const file = abs.endsWith('.jsx') ? abs : `${abs}.jsx`;
  return fs.existsSync(file) ? pathToFileURL(file).href : null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    const relative = /^\.{1,2}\//.test(specifier);
    if (relative && specifier.endsWith('.jsx')) {
      const url = jsxFile(context.parentURL, specifier);
      if (url) return { url, shortCircuit: true, format: 'module' };
    }
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (err && err.code === 'ERR_MODULE_NOT_FOUND' && relative && !/\.[cm]?js$/.test(specifier)) {
        try {
          return nextResolve(`${specifier}.js`, context);
        } catch (again) {
          const url = jsxFile(context.parentURL, specifier);
          if (url) return { url, shortCircuit: true, format: 'module' };
          throw again;
        }
      }
      throw err;
    }
  },
  load(url, context, nextLoad) {
    const file = url.split('?')[0];
    // Vite allows `import data from './file.json'`. Node requires an import attribute, so the
    // test loader turns the JSON into a default export itself.
    if (file.endsWith('.json') && !fileURLToPath(file).includes(`${path.sep}node_modules${path.sep}`)) {
      const json = JSON.parse(fs.readFileSync(fileURLToPath(file), 'utf8'));
      return { format: 'module', source: `export default ${JSON.stringify(json)}`, shortCircuit: true };
    }
    if (!file.endsWith('.jsx')) return nextLoad(url, context);
    const source = fs.readFileSync(fileURLToPath(url), 'utf8');
    const result = esbuild.transformSync(source, {
      loader: 'jsx',
      jsx: 'automatic',
      format: 'esm',
      sourcefile: fileURLToPath(url),
    });
    return { format: 'module', source: result.code, shortCircuit: true };
  },
});
