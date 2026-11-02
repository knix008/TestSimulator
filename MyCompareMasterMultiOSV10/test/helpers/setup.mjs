// Lets `node --test` import the TypeScript sources directly.
//
// Node strips types on its own; what it will not do is guess an extension,
// and the sources import each other without one (`'../ast'`) the way Vite
// resolves them. This hook adds `.ts` to a relative import that has no
// extension, and nothing else.
import { register } from 'node:module'

register(new URL('./resolve-ts.mjs', import.meta.url))
