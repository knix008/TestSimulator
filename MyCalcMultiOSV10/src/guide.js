// The user guide window: USERSGUIDE.md (Korean) or USERSGUIDE.en.md, turned
// into HTML here. The header holds the guide's own tools: its language (it
// starts in the program's language and switches for the guide alone), the text
// size (− / +, Ctrl+- / Ctrl+=, remembered), and Print (Ctrl+P), which hands
// the whole guide to the print window in the shown language and size.
// The window takes the calculator's theme colours like every other window.

const GUIDE_FILES = { ko: "USERSGUIDE.md", en: "USERSGUIDE.en.md" };
const GUIDE_FONT = { min: 11, max: 22, normal: 14 };
const GUIDE_FONT_KEY = "mycalc-guide-font";

// ----- Markdown -----

function guideInline(text) {
  const codes = [];
  let out = String(text).replace(/`([^`]+)`/g, (whole, code) => {
    codes.push(code);
    return `\u0000${codes.length - 1}\u0000`;
  });
  out = escapeHtml(out)
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (whole, alt, src) => `<img alt="${alt}" src="${src.replace(/"/g, "&quot;")}" />`)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, label, href) => {
      // Only web links open; a link to another file in the project is just its name.
      if (!/^https?:\/\//i.test(href)) return label;
      return `<a href="${href.replace(/"/g, "&quot;")}" target="_blank" rel="noopener">${label}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  return out.replace(/\u0000(\d+)\u0000/g, (whole, index) => `<code>${escapeHtml(codes[Number(index)])}</code>`);
}

function guideSlug(text, used) {
  const base = String(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "") || "section";
  let slug = base;
  let n = 2;
  while (used.has(slug)) slug = `${base}-${n++}`;
  used.add(slug);
  return slug;
}

// Headings, paragraphs, lists, tables, fenced code and quotes: what the guide uses.
function renderGuideMarkdown(source) {
  const lines = String(source).replace(/\r\n?/g, "\n").split("\n");
  const html = [];
  const headings = [];
  const used = new Set();
  let paragraph = [];
  const flush = () => {
    if (paragraph.length) html.push(`<p>${guideInline(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line)) {
      flush();
      const code = [];
      for (i += 1; i < lines.length && !/^```/.test(lines[i]); i++) code.push(lines[i]);
      html.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flush();
      const level = heading[1].length;
      const text = heading[2].trim();
      const id = guideSlug(text, used);
      headings.push({ level, text, id });
      html.push(`<h${level} id="${id}">${guideInline(text)}</h${level}>`);
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) {
      flush();
      const cells = (row) => row.trim().replace(/^\||\|$/g, "").split("|").map((cell) => guideInline(cell.trim()));
      const head = cells(line);
      const rows = [];
      for (i += 2; i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i]); i++) rows.push(cells(lines[i]));
      i -= 1;
      html.push(
        `<table><thead><tr>${head.map((cell) => `<th>${cell}</th>`).join("")}</tr></thead><tbody>${rows
          .map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`)
          .join("")}</tbody></table>`,
      );
      continue;
    }
    const bullet = line.match(/^\s*([-*]|\d+\.)\s+(.*)$/);
    if (bullet) {
      flush();
      const ordered = /\d/.test(bullet[1]);
      const items = [];
      for (; i < lines.length; i++) {
        const item = lines[i].match(/^\s*([-*]|\d+\.)\s+(.*)$/);
        if (item && /\d/.test(item[1]) === ordered) items.push(item[2]);
        else if (items.length && /^\s{2,}\S/.test(lines[i])) items[items.length - 1] += ` ${lines[i].trim()}`;
        else break;
      }
      i -= 1;
      const tag = ordered ? "ol" : "ul";
      html.push(`<${tag}>${items.map((item) => `<li>${guideInline(item)}</li>`).join("")}</${tag}>`);
      continue;
    }
    if (/^>\s?/.test(line)) {
      flush();
      const quote = [];
      for (; i < lines.length && /^>\s?/.test(lines[i]); i++) quote.push(lines[i].replace(/^>\s?/, ""));
      i -= 1;
      html.push(`<blockquote><p>${guideInline(quote.join(" "))}</p></blockquote>`);
      continue;
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      flush();
      html.push("<hr />");
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    paragraph.push(line.trim());
  }
  flush();
  return { html: html.join("\n"), headings };
}

// ----- The window -----

const guideTexts = {};
let guideLang = uiLang === "en" ? "en" : "ko";
let guideShown = "";

function clampGuideFont(value) {
  const size = Math.round(Number(value));
  if (!Number.isFinite(size)) return GUIDE_FONT.normal;
  return Math.min(GUIDE_FONT.max, Math.max(GUIDE_FONT.min, size));
}

function readGuideFont() {
  try {
    const stored = localStorage.getItem(GUIDE_FONT_KEY);
    return stored === null ? GUIDE_FONT.normal : clampGuideFont(stored);
  } catch {
    return GUIDE_FONT.normal;
  }
}

let guideFont = readGuideFont();

async function loadGuideText(lang) {
  if (guideTexts[lang]) return guideTexts[lang];
  const response = await fetch(GUIDE_FILES[lang], { cache: "no-cache" });
  if (!response.ok) throw new Error(String(response.status));
  guideTexts[lang] = await response.text();
  return guideTexts[lang];
}

function setGuideFont(size) {
  guideFont = clampGuideFont(size);
  try {
    localStorage.setItem(GUIDE_FONT_KEY, String(guideFont));
  } catch {
    /* The size still holds until the window closes. */
  }
  const doc = document.getElementById("guideDoc");
  if (doc) doc.style.fontSize = `${guideFont}px`;
  const out = document.getElementById("guideFontOut");
  if (out) out.textContent = String(guideFont);
  const down = document.getElementById("guideFontDown");
  const up = document.getElementById("guideFontUp");
  if (down) down.disabled = guideFont <= GUIDE_FONT.min;
  if (up) up.disabled = guideFont >= GUIDE_FONT.max;
}

async function showGuide(lang) {
  guideLang = lang === "en" ? "en" : "ko";
  for (const button of document.querySelectorAll(".guide-lang button")) {
    button.setAttribute("aria-pressed", String(button.dataset.lang === guideLang));
  }
  const doc = document.getElementById("guideDoc");
  const toc = document.getElementById("guideToc");
  if (!doc || !toc || guideShown === guideLang) return;
  let source;
  try {
    source = await loadGuideText(guideLang);
  } catch {
    doc.replaceChildren(Object.assign(document.createElement("p"), { className: "guide-wait", textContent: t("guideMissing") }));
    return;
  }
  // A quicker second press may have asked for the other language meanwhile.
  if (lang !== guideLang) return;
  const { html, headings } = renderGuideMarkdown(source);
  guideShown = guideLang;
  doc.innerHTML = html;
  doc.lang = guideLang;
  doc.scrollTop = 0;
  toc.replaceChildren(
    ...headings
      .filter((heading) => heading.level === 2)
      .map((heading) => {
        const link = document.createElement("a");
        link.href = `#${heading.id}`;
        link.textContent = heading.text;
        link.addEventListener("click", (ev) => {
          ev.preventDefault();
          document.getElementById(heading.id)?.scrollIntoView({ block: "start" });
          markGuideSection(heading.id);
        });
        link.dataset.target = heading.id;
        return link;
      }),
  );
  markGuideSection();
}

// The contents entry of the section at the top of the page is lit.
function markGuideSection(force) {
  const doc = document.getElementById("guideDoc");
  const toc = document.getElementById("guideToc");
  if (!doc || !toc) return;
  let current = force || "";
  if (!current) {
    const top = doc.getBoundingClientRect().top + 8;
    for (const heading of doc.querySelectorAll("h2[id]")) {
      if (heading.getBoundingClientRect().top <= top) current = heading.id;
    }
    if (!current) current = doc.querySelector("h2[id]")?.id || "";
  }
  for (const link of toc.querySelectorAll("a")) link.classList.toggle("is-current", link.dataset.target === current);
}

async function printGuide() {
  try {
    const source = await loadGuideText(guideLang);
    requestPrint({ kind: "document", html: renderGuideMarkdown(source).html, fontScale: guideFont / GUIDE_FONT.normal });
  } catch {
    reportInput(t("guideMissing"));
  }
}

function bindGuideWindow() {
  document.documentElement.classList.add("guide-pop");
  document.getElementById("guideSheet").hidden = false;
  const desktop = !!(window.mycalcDesktop && window.mycalcDesktop.windowControl);
  bindWindowButtons(desktop ? "guideMin" : null, desktop ? "guideMax" : null, null);
  document.getElementById("guideClose").addEventListener("click", () => closeThisWindow());
  if (desktop && window.mycalcDesktop.setBounds && typeof bindMemoResize === "function") {
    bindMemoResize(document.getElementById("guideMax"));
  }
  for (const button of document.querySelectorAll(".guide-lang button")) {
    button.addEventListener("click", () => showGuide(button.dataset.lang));
  }
  document.getElementById("guideFontDown").addEventListener("click", () => setGuideFont(guideFont - 1));
  document.getElementById("guideFontUp").addEventListener("click", () => setGuideFont(guideFont + 1));
  document.getElementById("guidePrint").addEventListener("click", printGuide);
  document.getElementById("guideDoc").addEventListener("scroll", () => markGuideSection(), { passive: true });
  document.addEventListener("keydown", (ev) => {
    if (!(ev.ctrlKey || ev.metaKey)) return;
    if (ev.key === "=" || ev.key === "+") {
      ev.preventDefault();
      setGuideFont(guideFont + 1);
    } else if (ev.key === "-") {
      ev.preventDefault();
      setGuideFont(guideFont - 1);
    } else if (ev.key === "0") {
      ev.preventDefault();
      setGuideFont(GUIDE_FONT.normal);
    } else if (ev.key.toLowerCase() === "p") {
      ev.preventDefault();
      printGuide();
    }
  });
  setGuideFont(guideFont);
  showGuide(guideLang);
}

if (pageKind === "guide") bindGuideWindow();

// The calculator's own buttons for the guide and for printing what is shown.
if (!pageKind) {
  document.getElementById("guideBtn")?.addEventListener("click", () => openChildWindow("guide"));
  document.getElementById("printBtn")?.addEventListener("click", printMainWindow);
}
