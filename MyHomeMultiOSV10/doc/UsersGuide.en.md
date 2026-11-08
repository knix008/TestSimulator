# MyHomeMaker User's Guide

MyHomeMaker is a graphical website builder: you **build a homepage by dragging blocks onto pages**. No code is needed — arrange the pages, change the whole design at once, check how it looks on a phone, then publish HTML and CSS files for any web server.

- 34 kinds of blocks (heroes, features, service cards, galleries, pricing, testimonials, team, timelines, FAQs, contact forms, maps, videos …) plus one header and one footer per site
- 36 site designs (24 light, 12 dark): colours, heading and body fonts, corners, content width, text size
- 12 templates and 16 finished sample sites (Korean and English)
- Edit text right on the canvas; desktop, tablet and phone widths; preview mode; preview in the browser
- Publishing: a folder (desktop), a ZIP file, or this page as one HTML file
- Desktop app for Windows, macOS and Linux, and a web version

New to it? Follow the [tutorial](Tutorial.en.md). In the app, **Help › Tutorial** (F11) shows every feature on the real screen.

## Installing and starting

| For | File | Install |
|---|---|---|
| Windows | `MyHomeMaker-Setup-<version>.exe` | Run it, pick the language and install. An earlier installation is removed completely first, and you are asked whether to delete the earlier user data. |
| macOS | `MyHomeMaker-<version>-<arch>.dmg` | Open it and drag the app into Applications. |
| Linux | `.deb` · `.rpm` · `.AppImage` | Install with the package manager, or run the AppImage. |
| Web | `MyHomeMaker-Web-<version>.zip` | Unpack it on a web server and open `index.html` there. |

After installing, `.myhome` site files and `.mhomt` templates open in MyHomeMaker (double-click them or drop them on the window).

The installers are built from the sources with (Tauri builds for its own operating system only):

```
npm install
npm run build:win      # Windows installer (NSIS)
npm run build:mac      # macOS (.app, .dmg)
npm run build:linux    # Linux (.deb, .rpm, .AppImage)
npm run build:webapp   # the web version as a ZIP
npm run build:all      # the web version + this OS's installers
```

The results are copied to `release/` and to the project folder. While developing, `npm start` runs the app.

## The window

![The editor](images/en/03-editor.png)

1. **Menu bar row** — the app icon, name and version, the open site (● for unsaved changes), the Start (home) button, the menus (File, Edit, Insert, Page, View, Design, Tools, Help) and, at the right, minimize, maximize and close. This row is the title bar: drag its empty parts to move the window, double-click to maximize.
2. **Toolbar** — New, Open, Save, Publish (▾ choices), Preview in browser / Undo, Redo / Cut, Copy, Paste, Delete / Add block, Add page / Move up, Move down, Duplicate, Hide / device width (desktop, tablet, phone), zoom, Fit width / Preview, Change design, Check the site / panels. At the right: Tutorial, Theme (random, ▾ list), Language (flag), Settings, About. The window never gets narrower than the toolbar, so no button is ever hidden.
3. **Blocks panel** (left) — the blocks in five groups with a search box, and at the bottom the header and footer.
4. **Page tabs and canvas** (centre) — one tab per page; the first tab is the home page (index.html). The canvas draws the real site.
5. **Site panel** (right) — top: the header, each page with its blocks, the footer. Bottom: the editors (**Content · Style · Page · Site**). Drag the divider between them to change their heights.
6. **Status bar** — notices, the page and its file name, pages and blocks, saved state, the selected block, device width, design, theme, language, a zoom slider and a clock.

Panels fold into a narrow strip (Ctrl+Shift+1, Ctrl+Shift+2); drag the dividers between panels to change their width.

## The start page

![Start page](images/en/01-start.png)

At start (you can turn it off) a board of cards lies over a moving background:

- **Quick actions** — New site, Open, Tutorial, Theme settings, Language, Settings, Start page settings, About, Exit
- **Recent** — recent files and recent folders (× removes an entry)
- **New site** — the 12 templates
- **Sample sites** — 16 samples in four groups
- **Theme** — the program themes (dark and light)
- **Moving background** — 20 animations, random, speed, card opacity, change interval, a background picture

Drag a card by its handle (top left) and resize it from its bottom right corner; **Arrange** puts them back. The **Start** button of the menu bar switches between the start page and the editor (Ctrl+Shift+H).

## Sites and files

### A new site

![New site](images/en/02-new-site.png)

**File › New site…** (Ctrl+N): pick *Templates* or a sample group on the left, then a card, give the site a name and (for a blank site) a design, and press **Create**. Double-click a card to create at once.

| Template | Comes with |
|---|---|
| Blank site | one hero |
| Business | home, about, services, contact |
| Landing page | one long page for an app or product |
| Portfolio | work, about, contact |
| Restaurant | menu, booking, directions |
| Café | one page with menu and photos |
| Small shop | products, story, contact |
| Blog | posts and an author page |
| Event | programme, line-up, registration |
| Résumé | career and contact on one page |
| Academy | courses, teachers, fees |
| Clinic | treatments, doctors, hours |

**File › New from template** and **File › Open sample site** show the same lists as menus. The samples come in four groups of four: business & services, food & shops, personal & portfolio, community, events & learning.

### Saving and opening

- **Save** (Ctrl+S) — a site is one `.myhome` file with every page, block, picture and the design. A site made from a template or a sample asks for a file name the first time.
- **Save as…** (Ctrl+Shift+S), **Save as template…** (`.mhomt`: opening it starts a new site)
- **Open…** (Ctrl+O), **Recent files…** (Ctrl+R), **Recent folders**, **Clear all recent files and folders**
- **Close site** (Ctrl+W) asks to save unsaved changes.
- Drop a site file (.myhome) on the window to open it; drop a picture to put it into the selected block.
- One window holds one site. Start the program again to work on two sites side by side.
- The web version uses the browser's open and save windows (where supported) or downloads.

## Pages

![Adding a page](images/en/10-pages.png)

- **Add page…** (Ctrl+Shift+N, the + of the tab row) asks for a name and what to start with (blank, about, services, gallery, contact, pricing, news).
- Click a tab to go to that page; double-click to rename it (F2). Its right-click menu duplicates, deletes and moves it.
- **Previous / Next page** (Ctrl+PageUp/PageDown, Ctrl+Tab)
- The first tab is always the home page `index.html`; **Move page left / right** changes the order.

![Page tab](images/en/11-page-tab.png)

The editors' **Page** tab:

| Field | Meaning |
|---|---|
| Page name | shown on the tab and in the menu |
| File name | the published file (`about` → `about.html`) |
| Browser title | empty: "Page name | Site title" |
| Description (search) | one or two sentences for search results |
| Show in the menu | off: left out of the header menu and the footer links (the tab name looks italic) |

## Blocks

### Adding blocks

![Blocks panel](images/en/04-blocks-panel.png)

- **Click** a block in the Blocks panel: it goes right below the selected block (at the end when nothing is selected).
- **Drag** a block onto the canvas: a blue line shows where it lands; release it there.
- Or use **Add block** on the toolbar (Ctrl+Shift+A), the group submenus of the **Insert** menu, the **+** under the selected block, or the hint on an empty page.

![Add block menu](images/en/09-add-block-menu.png)

| Group | Blocks |
|---|---|
| Heroes & banners | Hero banner, Split hero, Call to action, Newsletter, Notice bar |
| Basic elements | Heading, Text, Picture, Button, Divider, Spacer, Text columns, Quote, Check list, Video (YouTube, Vimeo, mp4), Map, HTML code |
| Content | Features, Service cards, Picture & text, Steps, Timeline, Numbers, FAQ |
| Showcase | Gallery, Testimonials, Team, Logos, Pricing, Menu, Events, Posts |
| Contact & social | Contact (with a form and a map), Social links |

### Selecting and moving

![A selected block](images/en/05-select-block.png)

Click a block on the canvas: an outline, its **name tab** and tool buttons (up, down, duplicate, style, hide, delete) appear. Hovering shows a dashed outline and the block's name.

- **Drag the name tab** to another place, or move one step with the ↑ ↓ buttons or **Ctrl+↑/↓**.
- **Alt+↑/↓** (or ↑/↓) picks the neighbouring block; **Esc** clears the selection.
- **Duplicate** (Ctrl+D), **Cut, Copy, Paste** (Ctrl+X/C/V; pasting works into another MyHomeMaker window, and plain text becomes a Text block), **Delete** (Delete)
- **Hide** (Ctrl+H): hidden blocks look faded and are not published.
- Clicking a row in the Site panel list opens its page and selects the block.
- Every change can be undone (**Undo**, Ctrl+Z) and redone (**Redo**, Ctrl+Y).

## Editing content

### Right on the canvas

![Editing in place](images/en/06-inline-edit.png)

Click the text of the selected block **once more** (or double-click any text) to edit it in place. **Enter** finishes, **Esc** cancels; **Shift+Enter** starts a new line in longer fields. The status bar shows which field you are editing.

- Double-click a picture to choose a picture file.
- Formatted text (Text, Text columns) and HTML code open their field in the Content tab on a double click.
- **Ctrl+click** a menu link of the header to open that page.

### The Content tab

![Content tab](images/en/07-content-tab.png)

Every field of the selected block. Text is applied when you leave the field or press Enter; longer fields follow as you pause typing.

- **Formatted text** — `**bold**`, `*italic*`, `[link](address)`, a blank line for a new paragraph, `- ` for a list, `1. ` for a numbered list, `## ` for a small heading
- **Links** — another page file (pick it from the list), a block's anchor (`#contact`), a web address, `mailto:`, `tel:`
- **Pictures** — **File…** (large photos are scaled to 1920 px on their longest side), **Built-in picture** (16 kinds — landscape, city, food, portrait … — drawn in the site's colours), **Remove**, or a picture address (https://…)
- **Item lists** — features, cards, photos, plans, reviews, people, questions … are lists: **Add · Duplicate · Up/Down · Delete**, ▸ to fold one
- Numbers have − + buttons and can be typed; on/off settings are switches

### Header and footer

There is one of each per site and they appear on every page. Click them on the canvas, or use **Insert › Edit header (menu) / Edit footer**.

- **Header** — site name, logo, a button on the right (label and link), layout (logo left or centred), stick to the top. The menu lists the pages with "Show in the menu" on; on phones it folds into ☰.
- **Footer** — about text, address, phone, e-mail, a list of links, copyright. The page links are added by themselves.

### The Style tab

![Style tab](images/en/08-style-tab.png)

| Field | Meaning |
|---|---|
| Background | Default · Light surface · Main colour · Accent colour · Dark · Footer colour · Custom colour |
| Text colour | automatic (fits the background) or your own |
| Background picture | a picture behind the block, and Darken picture (%) |
| Space above · Space below | 0–320 px (at most 64 px on phones) |
| Alignment | left · centre · right |
| Content width | narrow · normal · wide · full |
| Anchor | links to `#name` come to this block |
| Rounded box · Hide on phones · Hidden | |

**Reset style** puts the block's own defaults back.

## Design

![Site design](images/en/12-design-picker.png)

**Design › Change design…** (Ctrl+Shift+D) shows 24 light and 12 dark designs as small page pictures. A design sets the main colour, accent, backgrounds, text, header and footer colours, heading and body fonts, corners, content width and text size of the whole site at once. Double-click a card to use it. Turn on *Keep the colours and fonts I changed* to keep your own changes.

- **Random design** tries another one.
- **Clear design changes** puts the values changed in the Site tab back to the design's.

![Site tab](images/en/13-site-tab.png)

The editors' **Site** tab:

- **Site information** — site title (header name and browser title), site description and keywords (search engines and link previews), author, site language (`<html lang>`), site icon (favicon)
- **Design** — the current design with **Change design…**, then main colour, accent, background, surface, text, header and footer backgrounds, heading and body fonts (sans, serif, rounded, monospace, elegant, modern, handwriting), corners, content width and text size. The × next to a changed value gives back the design's.

The program **theme** (the palette at the right of the toolbar) colours the MyHomeMaker window; it is separate from the design of the site you make.

## Device widths and preview

![Phone width](images/en/14-mobile.png)

- The **Desktop (1280 px) · Tablet (820 px) · Phone (390 px)** buttons change the canvas width. The site adapts: columns stack (two at 900 px or less, one at 600 px or less) and the menu folds into ☰.
- **Zoom** — − +, the percentage box, Ctrl+wheel, the status bar slider; **Fit width** (Ctrl+Shift+W). Settings decide whether a site fits the width when it opens.

![Preview mode](images/en/15-preview.png)

- **Preview mode** (Ctrl+E) hides the editing marks and shows what visitors see. Menu links switch pages, `#anchor` links scroll to their block; Esc ends it.
- **Preview in browser** (F5) — desktop: writes the whole site to a temporary folder and opens it in the system browser. Web: opens the current page in a new tab.

## Publishing

![Publish site](images/en/16-publish.png)

**File › Publish & export › Publish site…** (Ctrl+Shift+P, **Publish** on the toolbar):

| Choice | Result |
|---|---|
| Folder (desktop) | a folder named after the site inside the folder you choose, with `index.html`, an `.html` per page, `style.css` and `assets/`. Afterwards you can open the folder or the browser. |
| ZIP file | the same files in one ZIP — handy for uploading |
| This page only | one HTML file with its style and pictures inside (e-mail, sharing) |

- **Pictures as files** writes the pictures of the site as `assets/img-….png/jpg/svg` files (each picture once), so the pages stay light.
- The window lists **things to check** (no site title or description, empty pages, pictures without alt text, contact forms with nowhere to send, two pages with the same file name). **Tools › Check the site** shows them before publishing.
- **Copy this page as HTML** puts the current page, as one HTML file, on the clipboard.

The published files are clean HTML and CSS without hidden blocks or editing marks, and work without JavaScript (the phone menu and the FAQ included).

### Putting it online

Upload the published folder or the ZIP's contents to GitHub Pages, Netlify, Cloudflare Pages or the web root of any host, and everyone can see the site.

### Contact forms and newsletters

A static site cannot send e-mail by itself. Put the address of a form service such as Formspree or Getform into the *Form endpoint* of the **Contact** block: the service forwards the messages by e-mail. Left empty, the form opens the visitor's e-mail program (`mailto:`). The **Newsletter** block works the same.

## Settings

![Settings](images/en/17-settings.png)

**Tools › Settings…** (Ctrl+,):

- **General** — language, reopen last files when starting, ask before deleting a page, status bar clock and display, auto-save (1, 5, 10, 30 min), start the tutorial
- **Start page** — show it at start, the welcome window, which cards and how many recent entries
- **Theme** — dark themes, light themes, a custom theme (your own colours, with a contrast warning)
- **Font** — the program font, size, weight, italics, row height, zoom
- **Background** — moving, picture or none; kind, speed, random, interval; the picture's opacity and fit
- **Editor** — the design of a new blank site, the device width at start, fit the width when a site opens, Blocks panel icons only, pictures as files when publishing
- **Recent**, **Shortcuts**

**Defaults** puts every setting back (recent files and the background picture stay).

## Keyboard shortcuts

| Keys | Action |
|---|---|
| Ctrl+N / Ctrl+O / Ctrl+S / Ctrl+Shift+S | New site / Open / Save / Save as |
| Ctrl+W / Ctrl+R | Close site / Recent files |
| Ctrl+Z / Ctrl+Y | Undo / Redo |
| Ctrl+X / Ctrl+C / Ctrl+V / Ctrl+D / Delete | Cut / Copy / Paste / Duplicate / Delete block |
| Ctrl+↑ / Ctrl+↓ | Move block up / down |
| Alt+↑ / Alt+↓ | Select previous / next block |
| Enter / Esc | Edit content / Clear selection |
| Ctrl+H | Hide / show block |
| Ctrl+Shift+A / Ctrl+Shift+N / F2 | Add block / Add page / Rename page |
| Ctrl+PageUp / Ctrl+PageDown, Ctrl+Tab | Previous / next page |
| Ctrl+= / Ctrl+- / Ctrl+0 / Ctrl+Shift+W | Zoom in / out / 100 % / Fit width |
| Ctrl+E / F5 | Preview mode / Preview in browser |
| Ctrl+Shift+P / Ctrl+Shift+D | Publish / Change design |
| Ctrl+Shift+1 / Ctrl+Shift+2 | Blocks panel / Site panel |
| Ctrl+Shift+L / Ctrl+Shift+B / Ctrl+Shift+H | Language / Shuffle background / Start page |
| Ctrl+, / F11 / F1 | Settings / Tutorial / About |

## Help

- **Help › Welcome window** — tutorial, a sample, or later
- **Tutorial** (F11) — 43 steps in 8 chapters on the real screen. Step back and forth on the card, auto play, pick a chapter, ✕ to end; afterwards your settings and your open site come back as they were.
- **Tutorial document**, **User's guide** — open in a window of their own with contents and search (Korean and English).
- **About** (F1) — version, build information, author

When something goes wrong, an error window shows the details; **Copy** copies them as they are.

## File format

`.myhome` is UTF-8 JSON: `format: "myhomemaker"`, `meta` (title, description, language …), `design` (the design id and your changes), `layout` (the header and footer blocks), `pages` (name, file name, blocks). A block has a `type`, `props` (its content) and `style`. Pictures are kept in the file as data URLs, so the one file is all you need to move.

## Troubleshooting

| Problem | Solution |
|---|---|
| A published site opened from the disk shows broken pictures or links | Keep the folder together and open its `index.html`: the other pages and `assets/` must be next to it. |
| A map or video is empty on the canvas | They need an internet connection. On the canvas they do not react to clicks (in preview mode neither). |
| The contact form sends no e-mail | Put a form service address into the Contact block's *Form endpoint*. |
| The web version is blank when index.html is opened from the disk | Open it through a web server (for example `npx vite preview`, or your host). |
