// The user guide window: UserGuide.md (Korean) or UserGuide.en.md, rendered with the pictures in
// doc/images/. Both Markdown files and the pictures are bundled at build time, so the guide also
// works offline in the installed app.
import guideKo from '../UserGuide.md?raw';
import guideEn from '../UserGuide.en.md?raw';
import { renderMarkdown } from './markdown.js';
import { getLanguage } from './i18n.js';
import { showDialog } from './popups.js';

const pictures = import.meta.glob('../doc/images/*.{png,jpg,svg}', { eager: true, query: '?url', import: 'default' });

function resolveImage(src) {
  const key = `../${src.replace(/^\.?\//, '')}`;
  return pictures[key] ?? src;
}

export function createGuide(dialog) {
  const toc = dialog.querySelector('#guide-toc');
  const content = dialog.querySelector('#guide-content');
  let shownLanguage = '';

  function fill() {
    const language = getLanguage();
    if (language === shownLanguage) return;
    shownLanguage = language;
    const { html, headings } = renderMarkdown(language === 'en' ? guideEn : guideKo, { resolveImage });
    content.innerHTML = html;
    // The document's own contents list is a section too; the side panel already is one.
    const sections = headings.filter((heading) => !/^(목차|contents)$/i.test(heading.text));
    toc.replaceChildren(...sections.map((heading) => {
      const link = document.createElement('a');
      link.href = `#${heading.id}`;
      link.dataset.target = heading.id;
      link.className = `toc-l${heading.level}`;
      link.textContent = heading.text;
      return link;
    }));
    content.scrollTop = 0;
  }

  function jump(id) {
    const target = content.querySelector(`[id="${CSS.escape(id)}"]`);
    if (!target) return;
    content.scrollTo({ top: target.offsetTop - content.offsetTop - 8 });
    markCurrent();
  }

  function markCurrent() {
    const top = content.scrollTop + 24;
    let current = null;
    for (const heading of content.querySelectorAll('h2[id], h3[id]')) {
      if (heading.offsetTop - content.offsetTop <= top) current = heading.id;
    }
    for (const link of toc.querySelectorAll('a')) link.classList.toggle('active', link.dataset.target === current);
  }

  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) {
      dialog.close();
      return;
    }
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;
    event.preventDefault();
    jump(decodeURIComponent(link.getAttribute('href').slice(1)));
  });
  content.addEventListener('scroll', markCurrent, { passive: true });

  return {
    open(section) {
      fill();
      showDialog(dialog);
      if (section) jump(section);
      else markCurrent();
    },
    refreshLanguage() {
      if (dialog.open) fill();
    },
  };
}
