import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export async function resolve(specifier, context, next) {
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.[a-z]+$/i.test(specifier) && context.parentURL) {
    const base = new URL(specifier, context.parentURL)
    for (const candidate of [`${base.href}.ts`, `${base.href}.tsx`, `${base.href}/index.ts`]) {
      if (existsSync(fileURLToPath(candidate))) return next(candidate, context)
    }
  }
  return next(specifier, context)
}
