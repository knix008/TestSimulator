// Loads the meeting-minutes templates from the project-root /templates folder.
// Each JSON file holds a bilingual template ({ id, order, name:{ko,en}, ko:{…},
// en:{…} }). Vite bundles them eagerly so they are available in both the web
// and Electron builds. Add a new .json there and it shows up automatically.
import { createEmptyMeeting } from './meeting';

const modules = import.meta.glob('../../templates/*.json', { eager: true });

export const TEMPLATES = Object.values(modules)
  .map((m) => m.default ?? m)
  .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

// Localized display name for a template.
export function templateName(tpl, lang) {
  return (tpl.name && (tpl.name[lang] || tpl.name.en || tpl.name.ko)) || tpl.id;
}

// Build a full meeting object from a template for the given language.
export function templateMeeting(tpl, lang) {
  const data = tpl[lang] || tpl.en || tpl.ko || {};
  return { ...createEmptyMeeting(), ...data };
}
