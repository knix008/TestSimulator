// Minimal TypeScript loader so the verification scripts can import src/*.ts
// directly without a build step. Strips types with esbuild (already a Vite dep)
// and mirrors Vite's resolution for extensionless and directory imports.
import { readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { transform } from 'esbuild';

const ASSET_URL_SCHEME = 'vite-asset-url:';

export async function load(url, context, nextLoad) {
  if (url.startsWith(ASSET_URL_SCHEME)) {
    // Vite's `import x from './f.wasm?url'` yields a URL string at build time.
    return {
      format: 'module',
      shortCircuit: true,
      source: `export default ${JSON.stringify(url.slice(ASSET_URL_SCHEME.length))};`,
    };
  }
  if (url.endsWith('.json')) {
    const source = await readFile(fileURLToPath(url), 'utf8');
    return {
      format: 'module',
      shortCircuit: true,
      source: `export default ${source};`,
    };
  }
  if (!url.endsWith('.ts') && !url.endsWith('.tsx')) return nextLoad(url, context);
  const source = await readFile(fileURLToPath(url), 'utf8');
  const { code } = await transform(source, {
    loader: url.endsWith('.tsx') ? 'tsx' : 'ts',
    format: 'esm',
    target: 'node20',
    sourcefile: url,
  });
  return { format: 'module', shortCircuit: true, source: code };
}

export function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith('?url')) {
    const bare = specifier.slice(0, -'?url'.length);
    const resolved = specifier.startsWith('.')
      ? path.resolve(path.dirname(fileURLToPath(context.parentURL)), bare)
      : path.resolve('node_modules', bare);
    return { url: ASSET_URL_SCHEME + pathToFileURL(resolved).href, shortCircuit: true };
  }
  if (specifier.startsWith('.') && context.parentURL) {
    const base = path.dirname(fileURLToPath(context.parentURL));
    const target = path.resolve(base, specifier);
    // Vite resolves "./x" to x.ts, then x/index.ts; Node does neither.
    const candidates = [
      target,
      `${target}.ts`,
      `${target}.tsx`,
      path.join(target, 'index.ts'),
      path.join(target, 'index.tsx'),
    ];
    for (const candidate of candidates) {
      if (existsSync(candidate) && statSync(candidate).isFile()) {
        return { url: pathToFileURL(candidate).href, shortCircuit: true };
      }
    }
  }
  return nextResolve(specifier, context);
}
