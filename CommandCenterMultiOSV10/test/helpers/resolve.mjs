// Loaded with `node --import` for the tests: the renderer's modules import each other without an
// extension (`import { t } from './i18n'`), which Vite resolves and plain Node does not. A relative
// specifier that is not found as written is tried again with `.js`.
import { registerHooks } from 'node:module';

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (err && err.code === 'ERR_MODULE_NOT_FOUND' && /^\.{1,2}\//.test(specifier) && !/\.[cm]?js$/.test(specifier)) {
        return nextResolve(`${specifier}.js`, context);
      }
      throw err;
    }
  },
});
