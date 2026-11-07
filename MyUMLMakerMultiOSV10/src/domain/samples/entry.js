// One sample of the start page: what its tile shows and how to build the project.
import { kit } from './kit.js';

/** id, group, tile icon, 'ko|en' title and description, and the diagrams written with the kit. */
export function sample(id, group, icon, title, description, write) {
  const [titleKo, titleEn] = title.split('|');
  const [descKo, descEn] = description.split('|');
  return {
    id, group, icon,
    ko: [titleKo, descKo],
    en: [titleEn, descEn],
    build(language = 'ko') {
      const k = kit(language, title, description);
      write(k);
      return k.project;
    },
  };
}
