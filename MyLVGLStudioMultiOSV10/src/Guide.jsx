// The documents in doc/, readable inside the app: what is installed has no other copy of them.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Dialog, WindowButtons } from "./dialogs.jsx";
import { Stepper } from "./controls.jsx";
import { Flag, Icon } from "./icons.jsx";
import { translator } from "./i18n.js";
import { inlinePieces, parseMarkdown } from "./markdown.js";

const DOCUMENTS = {
  guide: { ko: () => import("../doc/UsersGuide.md?raw"), en: () => import("../doc/UsersGuide.en.md?raw") },
  tutorial: { ko: () => import("../doc/Tutorial.md?raw"), en: () => import("../doc/Tutorial.en.md?raw") },
};
const FONT_KEY = "mls.guide.fontSize";
const LANGUAGE_KEY = "mls.guide.language";
const MIN_FONT = 11;
const MAX_FONT = 22;
const DEFAULT_FONT = 14;
const HEADINGS = "h1, h2, h3, h4";

/** Remembered per viewer. Blocked storage only means the choice lasts until the window closes. */
function remembered(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function remember(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* storage blocked */
  }
}
function savedFont() {
  const value = Number(remembered(FONT_KEY));
  return Number.isInteger(value) && value >= MIN_FONT && value <= MAX_FONT ? value : DEFAULT_FONT;
}
const IMAGES = import.meta.glob("../doc/images/*.png", { eager: true, query: "?url", import: "default" });

function Inline({ text }) {
  return inlinePieces(text).map((piece, index) => {
    if (piece.code !== undefined) return <code key={index}>{piece.code}</code>;
    if (piece.bold !== undefined) return <strong key={index}>{piece.bold}</strong>;
    if (piece.src !== undefined) {
      const url = IMAGES[`../doc/${piece.src}`];
      return url ? <img key={index} src={url} alt={piece.image} /> : null;
    }
    if (piece.link !== undefined) return <span key={index} title={piece.href}>{piece.link}</span>;
    return <span key={index}>{piece.text}</span>;
  });
}

function Block({ block, id }) {
  switch (block.type) {
    case "heading": {
      const Tag = `h${Math.min(block.level, 4)}`;
      return <Tag id={id}><Inline text={block.text} /></Tag>;
    }
    case "code":
      return <pre>{block.text}</pre>;
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return <Tag>{block.items.map((item, index) => <li key={index}><Inline text={item} /></li>)}</Tag>;
    }
    case "table":
      return (
        <table>
          <thead><tr>{block.head.map((cell, index) => <th key={index}><Inline text={cell} /></th>)}</tr></thead>
          <tbody>{block.rows.map((row, r) => <tr key={r}>{row.map((cell, index) => <td key={index}><Inline text={cell} /></td>)}</tr>)}</tbody>
        </table>
      );
    default:
      return <p><Inline text={block.text} /></p>;
  }
}

export function GuideDialog({ language: appLanguage, initial = "guide", onClose }) {
  const [document_, setDocument] = useState(initial);
  // Until a language is chosen here, the guide follows the app's.
  const [chosen, setChosen] = useState(() => {
    const value = remembered(LANGUAGE_KEY);
    return value === "ko" || value === "en" ? value : null;
  });
  const language = chosen ?? (appLanguage === "en" ? "en" : "ko");
  const other = language === "en" ? "ko" : "en";
  // The guide's own labels follow the guide's language, not the app's.
  const t = useMemo(() => translator(language), [language]);
  const [fontSize, setFontSize] = useState(savedFont);
  const [source, setSource] = useState("");
  const body = useRef(null);
  const keep = useRef(null);

  // Both languages have the same headings in the same order, so the reader stays on the same one.
  const currentHeading = () => {
    const element = body.current;
    if (!element) return 0;
    const top = element.getBoundingClientRect().top + 8;
    const headings = [...element.querySelectorAll(HEADINGS)];
    let current = 0;
    headings.forEach((heading, index) => {
      if (heading.getBoundingClientRect().top <= top) current = index;
    });
    return current;
  };
  const switchLanguage = () => {
    keep.current = currentHeading();
    setChosen(other);
    remember(LANGUAGE_KEY, other);
  };
  const changeFont = (size) => {
    setFontSize(size);
    remember(FONT_KEY, size);
  };

  useEffect(() => {
    let alive = true;
    DOCUMENTS[document_][language]().then((module) => {
      if (alive) setSource(module.default);
    });
    return () => {
      alive = false;
    };
  }, [document_, language]);
  const blocks = useMemo(() => parseMarkdown(source), [source]);
  useLayoutEffect(() => {
    const element = body.current;
    if (!element || !source) return;
    if (keep.current === null) element.scrollTop = 0;
    else element.querySelectorAll(HEADINGS)[keep.current]?.scrollIntoView({ block: "start" });
    keep.current = null;
  }, [source]);
  const headings = blocks.map((block, index) => ({ block, index })).filter(({ block }) => block.type === "heading" && block.level === 2);
  return (
    <Dialog title={t("guide.title")} icon="guide" onClose={onClose} id="guide" width={980} height={700} bare standsFree footer={<button type="button" className="primary" data-command="guide-close" onClick={onClose}><Icon name="close" size={14} /> {t("dialog.close")}</button>}>
      <div className="guide-window" style={{ "--guide-font": `${fontSize}px` }}>
        <div className="guide-bar" data-window-drag="">
          <span className="guide-bar-title" data-dialog-title=""><Icon name={document_ === "guide" ? "guide" : "tutorial"} /><span>{t(`guide.${document_}`)}</span></span>
          <span className="guide-bar-gap" />
          <button type="button" className="guide-language" data-command="guide-language" data-language={language} title={t("guide.switchLanguage")} aria-label={t("guide.switchLanguage")} onClick={switchLanguage}>
            <Flag country={other === "en" ? "gb" : "kr"} />
            <span>{other === "en" ? "English" : "한국어"}</span>
          </button>
          <span className="guide-font" title={t("guide.fontSize")}>
            <Icon name="fontFile" />
            <span>{t("guide.fontSize")}</span>
            <Stepper id="guideFontSize" unit="px" value={fontSize} min={MIN_FONT} max={MAX_FONT} onChange={changeFont} />
          </span>
          <WindowButtons t={t} onClose={onClose} />
        </div>
        <div className="guide-main">
          <nav className="conf-sections" data-guide-nav="">
            {Object.keys(DOCUMENTS).map((key) => (
              <button type="button" key={key} data-guide-document={key} className={key === document_ ? "active" : undefined} onClick={() => setDocument(key)}>
                <span><Icon name={key === "guide" ? "guide" : "tutorial"} size={14} /> {t(`guide.${key}`)}</span>
              </button>
            ))}
            <hr />
            {headings.map(({ block, index }) => (
              <button type="button" key={index} data-guide-heading={index} title={block.text} onClick={() => body.current?.querySelector(`[id="guide-${index}"]`)?.scrollIntoView({ block: "start" })}>
                <span><Icon name="caretRight" size={12} /> {block.text}</span>
              </button>
            ))}
          </nav>
          <article className="guide-body" ref={body} lang={language} data-guide-body="">
            {blocks.map((block, index) => <Block key={index} block={block} id={`guide-${index}`} />)}
          </article>
        </div>
      </div>
    </Dialog>
  );
}
