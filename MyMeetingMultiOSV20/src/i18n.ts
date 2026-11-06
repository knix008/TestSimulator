import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { EN_LABELS, type DocLabels } from './document'
import en from './locales/en.json'
import ko from './locales/ko.json'

/** Started with the saved language, which is known only once the settings have been read. */
export function startI18n(language: string) {
  void i18n.use(initReactI18next).init({
    resources: { ko: { translation: ko }, en: { translation: en } },
    lng: language,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  })
}

/** The words of the finished document, in the document's language. */
export function docLabels(language: string): DocLabels {
  const t = i18n.getFixedT(language)
  return Object.fromEntries(Object.keys(EN_LABELS).map((key) => [key, t(`doc.${key}`)])) as DocLabels
}

export default i18n
