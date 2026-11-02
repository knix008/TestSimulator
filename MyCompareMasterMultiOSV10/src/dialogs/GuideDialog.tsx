/**
 * The user's guide (Help › User's Guide, F1).
 *
 * A window of its own, like every other dialog, but the one that may be resized. The
 * text is UsersGuide.md / UsersGuide.en.md — the same files GitHub shows — parsed by
 * src/guideDoc.ts and drawn here, in the app's language and theme.
 *
 * Left: the contents, a tree of the `##` sections with their `###` subsections; click to
 * jump, and the highlight follows the reading position (scroll spy). Top: a search box
 * that keeps only the sections containing the words and marks them in the text (Enter:
 * next match, Esc: clear), a −/+ stepper for the text size, and a flag button that
 * switches the guide alone between 한국어 and English. Both are remembered per viewer;
 * the language starts as the app's until the button is used. Both files share their
 * section ids, so switching keeps the reader on the same section.
 */
import { createContext, Fragment, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import koGuide from "../../UsersGuide.md?raw";
import enGuide from "../../UsersGuide.en.md?raw";
import { parseGuide, parseInline, sectionText, type GuideBlock, type GuideDocument, type GuideSection } from "../guideDoc.js";
import type { DialogProps } from "../DialogHost.js";
import * as host from "../host.js";
import { Flag, Icon } from "../icons.js";
import { LANGUAGES, translator, type Language } from "../../core/i18n.js";
import { Stepper } from "./parts.js";
import "../guide.css";

const FONT_KEY = "mcm.guide.fontSize";
const LANGUAGE_KEY = "mcm.guide.language";
const MIN_FONT = 11;
const MAX_FONT = 22;
const DEFAULT_FONT = 14;

const documents: Partial<Record<"ko" | "en", GuideDocument>> = {};
function guideFor(language: "ko" | "en"): GuideDocument {
  return (documents[language] ??= parseGuide(language === "en" ? enGuide : koGuide));
}

function loadFontSize(): number {
  try {
    const value = Number(localStorage.getItem(FONT_KEY));
    if (Number.isFinite(value) && value >= MIN_FONT && value <= MAX_FONT) return value;
  } catch {
    /* storage blocked */
  }
  return DEFAULT_FONT;
}

/** The guide's own language, if the viewer ever picked one; otherwise null. */
function loadLanguage(): Language | null {
  try {
    const value = localStorage.getItem(LANGUAGE_KEY);
    return value === "ko" || value === "en" ? value : null;
  } catch {
    return null;
  }
}

export function GuideDialog({ payload, settings }: DialogProps) {
  const [language, setLanguage] = useState<Language>(() => loadLanguage() ?? (settings.language === "en" ? "en" : "ko"));
  // The guide's own labels follow the guide's language, not the app's.
  const t = useMemo(() => translator(language), [language]);
  const keepRef = useRef<string | null>(null);
  const switchLanguage = () => {
    const next: Language = language === "en" ? "ko" : "en";
    keepRef.current = activeRef.current;
    setLanguage(next);
    try {
      localStorage.setItem(LANGUAGE_KEY, next);
    } catch {
      /* storage blocked: the choice lasts until the window closes */
    }
  };
  const doc = guideFor(language);
  const requested = (payload as { section?: string } | null)?.section;
  const [query, setQuery] = useState("");
  const [fontSize, setFontSize] = useState(loadFontSize);
  const [active, setActive] = useState<string>(requested ?? doc.sections[0]?.id ?? "");
  const activeRef = useRef(active);
  activeRef.current = active;
  const scrollRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const matchIndex = useRef(-1);

  const needle = query.trim().toLowerCase();
  const visibleIds = useMemo(() => {
    if (!needle) return null;
    const hits = new Set<string>();
    for (const section of doc.sections) {
      if (sectionText(section).toLowerCase().includes(needle)) {
        hits.add(section.id);
        hits.add(section.parent);
      }
    }
    return hits;
  }, [doc, needle]);
  const sections = visibleIds ? doc.sections.filter((section) => visibleIds.has(section.id)) : doc.sections;
  const hitCount = visibleIds ? doc.sections.filter((s) => visibleIds.has(s.id) && sectionText(s).toLowerCase().includes(needle)).length : 0;

  const jump = useCallback((id: string, smooth = true) => {
    const scroller = scrollRef.current;
    const target = scroller?.querySelector<HTMLElement>(`[data-section="${CSS.escape(id)}"]`);
    if (!scroller || !target) return;
    scroller.scrollTo({ top: target.offsetTop - 8, behavior: smooth ? "smooth" : "auto" });
    setActive(id);
  }, []);

  // Opened on a particular section, or the language changed: keep the place. The
  // section is taken when the button is pressed (keepRef), before the new text can
  // move the scroll position, and restored before the browser paints.
  useLayoutEffect(() => {
    const id = keepRef.current ?? active;
    keepRef.current = null;
    jump(id, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  // Scroll spy: the last section whose heading has passed the top of the view.
  const onScroll = useCallback(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const top = scroller.scrollTop + 40;
    const all = scroller.querySelectorAll<HTMLElement>("[data-section]");
    // Above the first heading (the introduction) counts as the first section.
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
    const item = navRef.current?.querySelector<HTMLElement>(`[data-nav="${CSS.escape(active)}"]`);
    item?.scrollIntoView({ block: "nearest" });
  }, [active]);

  useEffect(() => {
    matchIndex.current = -1;
    scrollRef.current?.scrollTo({ top: 0 });
    requestAnimationFrame(onScroll);
  }, [needle, onScroll]);

  const changeFont = (size: number) => {
    setFontSize(size);
    try {
      localStorage.setItem(FONT_KEY, String(size));
    } catch {
      /* storage blocked */
    }
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
    else if (/^https?:/.test(href)) host.openExternal(href);
  };

  return (
    <ZoomContext.Provider value={setZoomed}>
    <div className="guide" data-testid="guide" style={{ ["--guide-font" as string]: `${fontSize}px` }}>
      {zoomed ? <ZoomOverlay image={zoomed} onClose={closeZoom} /> : null}
      <div className="guide-bar">
        <label className="guide-search" title={t("guide.searchHint")}>
          <Icon name="find" size={15} />
          <input
            type="search"
            value={query}
            placeholder={t("guide.search")}
            aria-label={t("guide.search")}
            data-field="guideSearch"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                nextMatch();
              } else if (event.key === "Escape" && query) {
                // Clears the search; a second Esc closes the window.
                event.preventDefault();
                event.stopPropagation();
                setQuery("");
              }
            }}
          />
          {query ? (
            <button type="button" className="guide-clear" title={t("guide.clear")} aria-label={t("guide.clear")}
              onClick={() => setQuery("")}>
              <Icon name="close" size={12} />
            </button>
          ) : null}
        </label>
        {needle ? (
          <span className="guide-count" data-testid="guide-count">
            {hitCount > 0 ? t("guide.matches", hitCount) : t("guide.noMatch")}
          </span>
        ) : null}
        <span className="guide-spacer" />
        <button
          type="button"
          className="guide-lang"
          data-command="guide.language"
          data-language={language}
          title={t("guide.switchLanguage")}
          aria-label={t("guide.switchLanguage")}
          onClick={switchLanguage}
        >
          <Flag language={language} size={20} />
          <span>{LANGUAGES.find((item) => item.id === language)?.label}</span>
        </button>
        <span className="guide-font" title={t("guide.fontSize")}>
          <Icon name="font" size={15} />
          <Stepper name="guideFontSize" label={t("guide.fontSize")} min={MIN_FONT} max={MAX_FONT}
            value={fontSize} onChange={changeFont} />
        </span>
      </div>

      <div className="guide-main">
        <nav className="guide-nav" ref={navRef} aria-label={t("guide.contents")}>
          <div className="guide-nav-head">
            <Icon name="book" size={14} />
            <span>{t("guide.contents")}</span>
          </div>
          <ul>
            {sections.map((section) => (
              <li key={section.id} className={`level-${section.level}`}>
                <button
                  type="button"
                  data-nav={section.id}
                  className={active === section.id ? "active" : sectionParent(doc, active) === section.id ? "within" : undefined}
                  aria-current={active === section.id ? "location" : undefined}
                  onClick={() => jump(section.id)}
                >
                  {plainText(section.title)}
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
            {sections.length === 0 ? <p className="guide-empty">{t("guide.noMatch")}</p> : null}
            {sections.map((section) => (
              <Section key={section.id} section={section} query={needle} onLink={link} />
            ))}
            {needle ? null : (
              <button type="button" className="guide-top" onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })}>
                <Icon name="up" size={13} />
                <span>{t("guide.top")}</span>
              </button>
            )}
          </article>
        </div>
      </div>
    </div>
    </ZoomContext.Provider>
  );
}

/*
 * The guide's pictures. Vite turns every PNG under assets/guide into a URL at build
 * time; the Markdown names them relative to the repository root (so GitHub shows them
 * too), which is the key here.
 */
const IMAGE_URLS: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>("../../assets/guide/**/*.png", { eager: true, query: "?url", import: "default" }),
  ).map(([file, url]) => [file.replace(/^(\.\.\/)+/, ""), url]),
);

function imageUrl(src: string): string | null {
  return IMAGE_URLS[src.replace(/^\.?\//, "")] ?? null;
}

type Zoomed = { url: string; alt: string };
const ZoomContext = createContext<(image: Zoomed) => void>(() => {});

/** A picture at full size over the guide; a click or Esc closes it. */
function ZoomOverlay({ image, onClose }: { image: Zoomed; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Ahead of the dialog's own Esc, which would close the whole guide.
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

/** A heading without its markup, for the contents. */
function plainText(text: string): string {
  return parseInline(text).map((part) => part.text).join("");
}

function sectionParent(doc: GuideDocument, id: string): string {
  return doc.sections.find((section) => section.id === id)?.parent ?? "";
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
              {item.children.length > 0 ? (
                <ul>{item.children.map((child, position) => <li key={position}>{inline(child)}</li>)}</ul>
              ) : null}
            </li>
          ))}
        </List>
      );
    }
    case "table":
      return (
        <div className="guide-table">
          <table>
            {block.head.length > 0 ? (
              <thead>
                <tr>{block.head.map((cell, index) => <th key={index}>{inline(cell)}</th>)}</tr>
              </thead>
            ) : null}
            <tbody>
              {block.rows.map((row, index) => (
                <tr key={index}>{row.map((cell, position) => <td key={position}>{inline(cell)}</td>)}</tr>
              ))}
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
            // Bold may hold code ("`‹ ›` buttons" in bold), so its text is read again.
            return <strong key={index}><Inline text={part.text} query={query} onLink={onLink} /></strong>;
          case "em":
            return <em key={index}>{highlight(part.text, query)}</em>;
          case "code":
            return /^(Ctrl|Alt|Shift|F\d)/.test(part.text) && part.text.length <= 24
              ? <kbd key={index}>{highlight(part.text, query)}</kbd>
              : <code key={index}>{highlight(part.text, query)}</code>;
          case "link":
            // Links to the other Markdown file make sense on GitHub, not here.
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

/** Wraps each occurrence of `query` (already lower-cased) in a <mark>. */
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
