// The user's guide (doc/UsersGuide*.md), bundled so the app shows it offline in its guide tab.
import guideKo from '../doc/UsersGuide.md?raw';
import guideEn from '../doc/UsersGuide.en.md?raw';

const TEXTS = { guide: { ko: guideKo, en: guideEn } };

export const helpText = (kind, language) => TEXTS[kind]?.[language === 'en' ? 'en' : 'ko'] ?? '';
