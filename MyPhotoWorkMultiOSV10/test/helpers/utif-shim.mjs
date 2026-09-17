// `utif` is a CommonJS module whose named exports Node's ESM interop cannot see
// statically, so `import * as UTIF from 'utif'` yields only `default`. Rollup
// resolves those names at runtime when building the app, so the harness maps the
// bare specifier here to give the source the same namespace the bundle gets.
import { createRequire } from 'node:module'

const UTIF = createRequire(import.meta.url)('utif')

export const {
  decode, decodeImage, encode, encodeImage, toRGBA8, replaceIMG, tags, ttypes,
} = UTIF
export default UTIF
