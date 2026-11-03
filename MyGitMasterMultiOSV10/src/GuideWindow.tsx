/**
 * The user's guide (Help › User's Guide, F1): a window of its own (`#guide`).
 *
 * The text is doc/UsersGuide.md / doc/UsersGuide.en.md — the same files GitHub shows —
 * parsed by src/guideDoc.ts and drawn here in the app's theme.
 *
 * Left: the contents, the `##` sections with their `###` subsections; click to jump, and
 * the highlight follows the reading position. Top: a search box that keeps only the
 * sections containing the words and marks them (Enter: next match, Esc: clear), a −/+
 * stepper for the text size, and a flag button that switches the guide alone between
 * 한국어 and English. Both are remembered; the language starts as the app's until the
 * button is used. Both files share their section ids, so switching keeps the place.
 */
import { createContext, Fragment, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import koGuide from "../doc/UsersGuide.md?raw";
import enGuide from "../doc/UsersGuide.en.md?raw";
import { parseGuide, parseInline, sectionText, type GuideBlock, type GuideDocument, type GuideSection } from "./guideDoc";
import { translate, type Lang } from "./i18n";
import { Flag, Icon } from "./icons";
import { usePopupSettings } from "./popupWindow";
import "./guide.css";

const FONT_KEY = "mgm.guide.fontSize";
const LANGUAGE_KEY = "mgm.guide.language";
const MIN_FONT = 11;
const MAX_FONT = 22;
const DEFAULT_FONT = 14;

const documents: Partial<Record<Lang, GuideDocument>> = {};
export function guideFor(language: Lang): GuideDocument {
  return (documents[language] ??= parseGuide(language === "en" ? enGuide : koGuide));
}

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage blocked: lasts until the window closes */
  }
}

function loadFontSize(): number {
  const value = Number(stored(FONT_KEY));
  return Number.isFinite(value) && value >= MIN_FONT && value <= MAX_FONT ? value : DEFAULT_FONT;
}

function loadLanguage(): Lang | null {
  const value = stored(LANGUAGE_KEY);
  return value === "ko" || value === "en" ? value : null;
}

const Svg = ({ d }: { d: string }) => (
  <svg className="guide-svg" viewBox="0 0 16 16" aria-hidden="true"><path d={d} /></svg>
);
const SEARCH = "M7 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM10 10l3.4 3.4";
const UP = "M4.2 9.6 8 5.4l3.8 4.2";

export function GuideWindow({ section: requested }: { section?: string }) {
  const context = usePopupSettings();
  const [chosen, setChosen] = useState<Lang | null>(loadLanguage);
  const language: Lang = chosen ?? context?.lang ?? "ko";
  const t = useCallback((key: string) => translate(language, key), [language]);
  const doc = guideFor(language);
  const [query, setQuery] = useState("");
  const [fontSize, setFontSize] = useState(loadFontSize);
  const [active, setActive] = useState<string>(requested || doc.sections[0]?.id || "");
  const activeRef = useRef(active);
  activeRef.current = active;
  const keepRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const matchIndex = useRef(-1);
  const [maximized, setMaximized] = useState(false);

  // Shown once it is painted in the theme (the desktop window opens hidden).
  useEffect(() => {
    if (!context) return;
    document.title = t("guideTitle");
    requestAnimationFrame(() => requestAnimationFrame(() => window.mgm?.window?.themeReady?.()));
  }, [context, t]);

  useEffect(() => {
    const controls = window.mgm?.window;
    if (!controls) return;
    void controls.isMaximized().then(setMaximized);
    return controls.onMaximized(setMaximized);
  }, []);

  const needle = query.trim().toLowerCase();
  const visibleIds = useMemo(() => {
    if (!needle) return null;
    const hits = new Set<string>();
    for (const item of doc.sections) {
      if (sectionText(item).toLowerCase().includes(needle)) {
        hits.add(item.id);
        hits.add(item.parent);
      }
    }
    return hits;
  }, [doc, needle]);
  const sections = visibleIds ? doc.sections.filter((item) => visibleIds.has(item.id)) : doc.sections;
  const hitCount = visibleIds ? doc.sections.filter((item) => visibleIds.has(item.id) && sectionText(item).toLowerCase().includes(needle)).length : 0;

  const jump = useCallback((id: string, smooth = true) => {
    const scroller = scrollRef.current;
    const target = scroller?.querySelector<HTMLElement>(`[data-section="${CSS.escape(id)}"]`);
    if (!scroller || !target) return;
    scroller.scrollTo({ top: target.offsetTop - 8, behavior: smooth ? "smooth" : "auto" });
    setActive(id);
  }, []);

  // Opened again on a particular section (the desktop shell sends it).
  useEffect(() => window.mgm?.onGuideSection?.((id) => {
    setQuery("");
    requestAnimationFrame(() => jump(id));
  }), [jump]);

  // Opened on a section, or the language changed: keep the place.
  useLayoutEffect(() => {
    if (!context) return;
    const id = keepRef.current ?? activeRef.current;
    keepRef.current = null;
    jump(id, false);
  }, [language, context, jump]);

  const switchLanguage = () => {
    const next: Lang = language === "en" ? "ko" : "en";
    keepRef.current = activeRef.current;
    setChosen(next);
    store(LANGUAGE_KEY, next);
  };

  const onScroll = useCallback(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const top = scroller.scrollTop + 40;
    const all = scroller.querySelectorAll<HTMLElement>("[data-section]");
    let current = all[0]?.dataset.section ?? "";
    for (const element of all) {
      if (element.offsetTop <= top) current = element.dataset.section ?? current;
      else break;
    }
    if (scroller.scrollTop > 0 && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) {
      current = all[all.length - 1]?.dataset.section ?? current;
    }
    if (current) setActive((previous) => (previous === current ? previous : current));
  }, []);

  useEffect(() => {
    navRef.current?.querySelector<HTMLElement>(`[data-nav="${CSS.escape(active)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  useEffect(() => {
    matchIndex.current = -1;
    scrollRef.current?.scrollTo({ top: 0 });
    requestAnimationFrame(onScroll);
  }, [needle, onScroll]);

  const changeFont = (size: number) => {
    const next = Math.max(MIN_FONT, Math.min(MAX_FONT, size));
    setFontSize(next);
    store(FONT_KEY, String(next));
  };

  const nextMatch = () => {
    const marks = scrollRef.current?.querySelectorAll<HTMLElement>("mark.guide-hit");
    if (!marks || marks.length === 0) return;
    marks.forEach((mark) => mark.classList.remove("current"));
    matchIndex.current = (matchIndex.current + 1) % marks.length;
    const mark = marks[matchIndex.current];
    mark.classList.add("current");
    mark.scrollIntoView({ block: "center" });
  };

  const [zoomed, setZoomed] = useState<Zoomed | null>(null);
  const closeZoom = useCallback(() => setZoomed(null), []);

  const link = (href: string) => {
    if (href.startsWith("#")) jump(href.slice(1));
    else if (/^https?:/.test(href)) window.open(href, "_blank", "noopener");
  };

  const closeWindow = () => {
    if (window.mgm?.window) void window.mgm.window.close();
    else window.close();
  };

  if (!context) return <div className="guide-window" />;

  return (
    <ZoomContext.Provider value={setZoomed}>
      <div className="guide-window">
        <div className="popup-frame" data-popup="guide">
          <header className="popup-title">
            <span className="popup-title-icon"><Icon name="book" /></span>
            <span className="popup-title-text">{t("guideTitle")}</span>
            {window.mgm?.window ? (
              <span className="window-buttons">
                <button type="button" className="popup-window-button" title={t("minimize")} aria-label={t("minimize")} onClick={() => void window.mgm?.window?.minimize()}>
                  <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path d="M1 5.5h8" /></svg>
                </button>
                <button type="button" className="popup-window-button" title={maximized ? t("restore") : t("maximize")} aria-label={maximized ? t("restore") : t("maximize")} onClick={() => void window.mgm?.window?.toggleMaximize().then(setMaximized)}>
                  {maximized
                    ? <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path d="M3 2.5h4.5V7M2.5 4H7v4.5H2.5z" /></svg>
                    : <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><rect x="1.5" y="1.5" width="7" height="7" /></svg>}
                </button>
                <button type="button" className="popup-close" title={t("close")} aria-label={t("close")} onClick={closeWindow}>
                  <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path d="M2 2l6 6M8 2L2 8" /></svg>
                </button>
              </span>
            ) : null}
          </header>
          <div className="popup-content">
            <div className="guide" data-testid="guide" style={{ ["--guide-font" as string]: `${fontSize}px` }}>
              {zoomed ? <ZoomOverlay image={zoomed} onClose={closeZoom} /> : null}
              <div className="guide-bar">
                <label className="guide-search" title={t("guideSearchHint")}>
                  <Svg d={SEARCH} />
                  <input
                    type="search"
                    value={query}
                    placeholder={t("guideSearch")}
                    aria-label={t("guideSearch")}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        nextMatch();
                      } else if (event.key === "Escape" && query) {
                        event.preventDefault();
                        setQuery("");
                      }
                    }}
                  />
                  {query ? (
                    <button type="button" className="guide-clear" title={t("guideClear")} aria-label={t("guideClear")} onClick={() => setQuery("")}>
                      <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path d="M2 2l6 6M8 2L2 8" stroke="currentColor" /></svg>
                    </button>
                  ) : null}
                </label>
                {needle ? (
                  <span className="guide-count" data-testid="guide-count">
                    {hitCount > 0 ? t("guideMatches").replace("{n}", String(hitCount)) : t("guideNoMatch")}
                  </span>
                ) : null}
                <span className="guide-spacer" />
                <button type="button" className="guide-lang" data-language={language} title={t("guideSwitchLanguage")} aria-label={t("guideSwitchLanguage")} onClick={switchLanguage}>
                  {/* The button names the language it switches to, not the one shown. */}
                  <Flag country={language === "ko" ? "gb" : "kr"} />
                  <span>{language === "ko" ? "영어" : "한국어"}</span>
                </button>
                <span className="guide-font" title={t("guideFontSize")}>
                  <span className="guide-font-label">A</span>
                  <span className="guide-stepper">
                    <button type="button" aria-label="−" disabled={fontSize <= MIN_FONT} onClick={() => changeFont(fontSize - 1)}>−</button>
                    <output>{fontSize}</output>
                    <button type="button" aria-label="+" disabled={fontSize >= MAX_FONT} onClick={() => changeFont(fontSize + 1)}>+</button>
                  </span>
                </span>
              </div>

              <div className="guide-main">
                <nav className="guide-nav" ref={navRef} aria-label={t("guideContents")}>
                  <div className="guide-nav-head">
                    <Icon name="book" />
                    <span>{t("guideContents")}</span>
                  </div>
                  <ul>
                    {sections.map((item) => (
                      <li key={item.id} className={`level-${item.level}`}>
                        <button
                          type="button"
                          data-nav={item.id}
                          className={active === item.id ? "active" : sectionParent(doc, active) === item.id ? "within" : undefined}
                          aria-current={active === item.id ? "location" : undefined}
                          onClick={() => jump(item.id)}
                        >
                          {plainText(item.title)}
                        </button>
                      </li>
                    ))}
                  </ul>
                </nav>

                <div className="guide-scroll" ref={scrollRef} onScroll={onScroll}>
                  <article className="guide-article">
                    {needle ? null : (
                      <header className="guide-head">
                        <h1>{doc.title}</h1>
                        {doc.intro.map((block, index) => <Block key={index} block={block} query="" onLink={link} />)}
                      </header>
                    )}
                    {sections.length === 0 ? <p className="guide-empty">{t("guideNoMatch")}</p> : null}
                    {sections.map((item) => <Section key={item.id} section={item} query={needle} onLink={link} />)}
                    {needle ? null : (
                      <button type="button" className="guide-top" onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })}>
                        <Svg d={UP} />
                        <span>{t("guideTop")}</span>
                      </button>
                    )}
                  </article>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ZoomContext.Provider>
  );
}

/*
 * The guide's pictures, if any: every PNG under assets/guide becomes a URL at build
 * time; the Markdown names them relative to the repository root (so GitHub shows them
 * too), which is the key here.
 */
const IMAGE_URLS: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>("../assets/guide/**/*.png", { eager: true, query: "?url", import: "default" }),
  ).map(([file, url]) => [file.replace(/^(\.\.\/)+/, ""), url]),
);

function imageUrl(src: string): string | null {
  return IMAGE_URLS[src.replace(/^(\.\.\/|\.\/|\/)+/, "")] ?? null;
}

type Zoomed = { url: string; alt: string };
const ZoomContext = createContext<(image: Zoomed) => void>(() => {});

function ZoomOverlay({ image, onClose }: { image: Zoomed; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  return (
    <div className="guide-zoom" role="dialog" aria-label={image.alt} data-testid="guide-zoom" onClick={onClose}>
      <figure>
        <img src={image.url} alt={image.alt} />
        {image.alt ? <figcaption>{plainText(image.alt)}</figcaption> : null}
      </figure>
    </div>
  );
}

function plainText(text: string): string {
  return parseInline(text).map((part) => part.text).join("");
}

function sectionParent(doc: GuideDocument, id: string): string {
  return doc.sections.find((item) => item.id === id)?.parent ?? "";
}

function Section({ section, query, onLink }: { section: GuideSection; query: string; onLink: (href: string) => void }) {
  const Heading = section.level === 1 ? "h2" : "h3";
  return (
    <section className={`guide-section level-${section.level}`} data-section={section.id} id={`guide-${section.id}`}>
      <Heading><Inline text={section.title} query={query} onLink={onLink} /></Heading>
      {section.blocks.map((block, index) => <Block key={index} block={block} query={query} onLink={onLink} />)}
    </section>
  );
}

function Block({ block, query, onLink }: { block: GuideBlock; query: string; onLink: (href: string) => void }) {
  const inline = (text: string) => <Inline text={text} query={query} onLink={onLink} />;
  const zoom = useContext(ZoomContext);
  switch (block.kind) {
    case "image": {
      const url = imageUrl(block.src);
      return (
        <figure className="guide-figure">
          {url ? (
            <button type="button" className="guide-figure-open" title={block.alt} onClick={() => zoom({ url, alt: block.alt })}>
              <img src={url} alt={block.alt} decoding="async" />
            </button>
          ) : (
            <div className="guide-figure-missing"><code>{block.src}</code></div>
          )}
          {block.alt ? <figcaption>{inline(block.alt)}</figcaption> : null}
        </figure>
      );
    }
    case "p":
      return <p>{inline(block.text)}</p>;
    case "h4":
      return <h4>{inline(block.text)}</h4>;
    case "quote":
      return <blockquote>{inline(block.text)}</blockquote>;
    case "code":
      return <pre className="guide-code"><code>{highlight(block.text, query)}</code></pre>;
    case "list": {
      const List = block.ordered ? "ol" : "ul";
      return (
        <List>
          {block.items.map((item, index) => (
            <li key={index}>
              {inline(item.text)}
              {item.children.length > 0 ? <ul>{item.children.map((child, position) => <li key={position}>{inline(child)}</li>)}</ul> : null}
            </li>
          ))}
        </List>
      );
    }
    case "table":
      return (
        <div className="guide-table">
          <table>
            {block.head.length > 0 ? <thead><tr>{block.head.map((cell, index) => <th key={index}>{inline(cell)}</th>)}</tr></thead> : null}
            <tbody>
              {block.rows.map((row, index) => <tr key={index}>{row.map((cell, position) => <td key={position}>{inline(cell)}</td>)}</tr>)}
            </tbody>
          </table>
        </div>
      );
  }
}

function Inline({ text, query, onLink }: { text: string; query: string; onLink: (href: string) => void }) {
  return (
    <>
      {parseInline(text).map((part, index) => {
        switch (part.kind) {
          case "bold":
            return <strong key={index}><Inline text={part.text} query={query} onLink={onLink} /></strong>;
          case "em":
            return <em key={index}>{highlight(part.text, query)}</em>;
          case "code":
            return /^(Ctrl|Alt|Shift|F\d)/.test(part.text) && part.text.length <= 24
              ? <kbd key={index}>{highlight(part.text, query)}</kbd>
              : <code key={index}>{highlight(part.text, query)}</code>;
          case "link":
            // Links to the other Markdown files make sense on GitHub, not here.
            return part.href.startsWith("#") || /^https?:/.test(part.href) ? (
              <a key={index} href={part.href} onClick={(event) => { event.preventDefault(); onLink(part.href); }}>
                {highlight(part.text, query)}
              </a>
            ) : <Fragment key={index}>{highlight(part.text, query)}</Fragment>;
          default:
            return <Fragment key={index}>{highlight(part.text, query)}</Fragment>;
        }
      })}
    </>
  );
}

function highlight(text: string, query: string): ReactNode {
  if (!query) return text;
  const lower = text.toLowerCase();
  const out: ReactNode[] = [];
  let from = 0;
  let at = lower.indexOf(query);
  while (at >= 0) {
    if (at > from) out.push(text.slice(from, at));
    out.push(<mark key={at} className="guide-hit">{text.slice(at, at + query.length)}</mark>);
    from = at + query.length;
    at = lower.indexOf(query, from);
  }
  if (out.length === 0) return text;
  if (from < text.length) out.push(text.slice(from));
  return out;
}
