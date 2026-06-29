export const VALID_LANGUAGES = ['ko', 'en'];

export function normalizeLanguage(language) {
  return VALID_LANGUAGES.includes(language) ? language : 'ko';
}
