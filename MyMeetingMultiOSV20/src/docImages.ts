// The screenshots of the user guide and the tutorials (doc/images, made by npm run screenshots).
// Only their URLs are bundled: a picture loads when it is shown.
import type { Locale } from './settings'

const IMAGES = import.meta.glob<string>('../doc/images/*.{png,webp}', { eager: true, query: '?url', import: 'default' })

/** "images/ko-main.webp" as written in the guide. */
export const docImage = (src: string): string | undefined => IMAGES[`../doc/${src.replace(/^\.\//, '')}`]

const named = (language: Locale, name: string) => docImage(`images/${language}-${name}.webp`) ?? docImage(`images/${language}-${name}.png`)

/** A tutorial step's picture in the given language, or in the other one when it is missing. */
export const stepImage = (name: string, language: Locale): string | undefined => named(language, name) ?? named(language === 'ko' ? 'en' : 'ko', name)
