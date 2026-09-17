// Lets `node --test` load the app's TypeScript sources directly.
//
// Node 24 strips types from .ts files on its own, but it never guesses file
// extensions, while the app source imports siblings as `./color`. This resolve
// hook re-adds the extension the bundler would have found.
import { registerHooks } from 'node:module'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const extensions = ['.ts', '.tsx', '.mts', '.js']

registerHooks({
  resolve(specifier, context, next) {
    // The shim's own require('utif') must reach the real package, not itself.
    if (specifier === 'utif' && !context.parentURL?.endsWith('utif-shim.mjs')) {
      return next(new URL('./utif-shim.mjs', import.meta.url).href, context)
    }
    if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.[a-z]+$/i.test(specifier)) {
      const parent = context.parentURL
      if (parent) {
        for (const ext of extensions) {
          const candidate = new URL(specifier + ext, parent)
          if (candidate.protocol === 'file:' && existsSync(fileURLToPath(candidate))) {
            return next(specifier + ext, context)
          }
        }
      }
    }
    return next(specifier, context)
  },
})
