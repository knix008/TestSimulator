// Lets `node --test` import the TypeScript sources directly.
//
// Node strips types on its own; what it will not do is follow the ESM convention the
// sources use, where `./errors.js` names the file `errors.ts` (so that the same source
// compiles for the browser and for Node). This hook rewrites a relative `.js`
// specifier to the `.ts` beside it when that file exists, and adds an extension to a
// relative import that has none. Nothing else.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export async function resolve(specifier, context, next) {
  if (!context.parentURL || !(specifier.startsWith("./") || specifier.startsWith("../"))) {
    return next(specifier, context);
  }

  if (specifier.endsWith(".js")) {
    const candidate = new URL(specifier.replace(/\.js$/, ".ts"), context.parentURL);
    if (existsSync(fileURLToPath(candidate))) return next(candidate.href, context);
    return next(specifier, context);
  }

  if (!/\.[a-z]+$/i.test(specifier)) {
    const base = new URL(specifier, context.parentURL);
    for (const candidate of [`${base.href}.ts`, `${base.href}.tsx`, `${base.href}/index.ts`]) {
      if (existsSync(fileURLToPath(candidate))) return next(candidate, context);
    }
  }

  return next(specifier, context);
}
