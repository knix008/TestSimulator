import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Marked } from 'marked';
import i18n from '../i18n';
import { ALL_THEME_IDS, applyCustomTheme, loadCustomTheme } from '../lib/themes';
import { closeThisWindow } from '../lib/host';
import { IconFlagKR, IconFlagUK, IconHelp, IconX } from './Icons';
import Stepper from './Stepper';
import guideKo from '../../doc/UsersGuide.md?raw';
import guideEn from '../../doc/UsersGuide.en.md?raw';

const GUIDES = { ko: guideKo, en: guideEn };
const FONT_MIN = 11;
const FONT_MAX = 22;

// The guide's pictures: asked for only by the page, so the guide's text can be read without a bundler.
const pictureUrls = () => import.meta.glob('../../doc/images/**/*.png', { eager: true, query: '?url', import: 'default' });

// The guide's text as HTML, with its headings numbered so the contents list can point at them.
export function renderGuide(markdown, pictures = {}) {
  const toc = [];
  const parser = new Marked({
    renderer: {
      heading(text, level) {
        const id = `sec-${toc.length}`;
        toc.push({ id, level, text: text.replace(/<[^>]+>/g, '') });
        return `<h${level} id="${id}">${text}</h${level}>`;
      },
      image(href, title, text) {
        return `<img src="${pictures[`../../doc/${href}`] ?? href}" alt="${text}" />`;
      },
    },
  });
  const html = parser.parse(markdown);
  return { html, toc: toc.filter((h) => h.level >= 2) };
}

// The user's guide: a window of its own. It opens in the main window's language and theme, and
// follows the theme from then on; language and text size here are its own business.
export default function GuidePage() {
  const { t } = useTranslation();
  const [lang, setLang] = useState(() => localStorage.getItem('zm-lang') || i18n.language);
  const [size, setSize] = useState(() => Number(localStorage.getItem('zm-guide-font')) || 14);
  const [current, setCurrent] = useState(null);
  const [theme, setTheme] = useState(() => {
    const s = localStorage.getItem('zm-theme');
    return ALL_THEME_IDS.includes(s) ? s : 'dark';
  });
  const body = useRef(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    if (i18n.language !== lang) i18n.changeLanguage(lang);
  }, [lang]);
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'zm-theme' && ALL_THEME_IDS.includes(e.newValue)) setTheme(e.newValue);
      else if (e.key === 'zm-custom-theme') applyCustomTheme(loadCustomTheme());
      else if (e.key === 'zm-guide-open') {
        // Asked for again from the main window: back to its language.
        setLang(localStorage.getItem('zm-lang') || i18n.language);
        window.focus();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const guide = useMemo(() => renderGuide(GUIDES[lang] ?? guideEn, pictureUrls()), [lang]);

  const changeSize = (delta) => {
    setSize((s) => {
      const next = Math.min(FONT_MAX, Math.max(FONT_MIN, s + delta));
      try { localStorage.setItem('zm-guide-font', String(next)); } catch { /* blocked */ }
      return next;
    });
  };
  const go = (id) => {
    setCurrent(id);
    const el = body.current?.querySelector(`#${id}`);
    if (el) el.scrollIntoView({ block: 'start' });
  };

  return (
    <div className="settings-page" data-testid="guide-page">
      <div className="settings-page-head">
        <div className="modal-title">
          <span className="mh-icon"><IconHelp size={18} /></span>
          <h2>{t('tip.help')}</h2>
        </div>
        <div className="guide-tools">
          <span className="hint">{t('guide.size')}</span>
          <Stepper id="guide-size" value={size} unit="pt" min={FONT_MIN} max={FONT_MAX} onChange={(v) => { if (Number.isFinite(Number(v))) changeSize(Number(v) - size); }} />
          <div className="segmented lang-seg">
            <button data-guide-lang="ko" className={lang === 'ko' ? 'on' : ''} onClick={() => setLang('ko')}><IconFlagKR size={16} />한국어</button>
            <button data-guide-lang="en" className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}><IconFlagUK size={16} />English</button>
          </div>
          <button className="iconbtn" onClick={closeThisWindow} title={t('about.close')}><IconX /></button>
        </div>
      </div>
      <div className="guide-layout">
        <nav className="guide-toc" data-testid="guide-toc">
          <div className="start-section">{t('guide.contents')}</div>
          {guide.toc.map((h) => (
            <button key={h.id} className={`guide-toc-row lvl-${h.level}${current === h.id ? ' on' : ''}`} data-toc={h.id} onClick={() => go(h.id)}>{h.text}</button>
          ))}
        </nav>
        <div ref={body} className="guide-body" data-testid="guide-body" style={{ fontSize: size }} dangerouslySetInnerHTML={{ __html: guide.html }} />
      </div>
    </div>
  );
}
