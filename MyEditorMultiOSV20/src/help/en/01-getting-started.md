# Getting started

My Editor is a text and code editor that opens several documents as tabs. The Windows, macOS and Linux desktop apps and the web version that runs in a browser all share the same screen. This chapter covers the **Start page** you see when the program first opens, the **Tutorial** that walks through the features one at a time, the **Help window** you are reading now, and a suggested order for your first session.

## When the start page opens

The start page is a guide screen shown in place of the editing area. It opens in these cases:

- The program starts and **no document was restored** — the first run, the last session ended with every tab closed, or session restore is turned off in Settings.
- With **Always show the start page on launch** turned on, the start page appears first on every launch, even when documents from the previous session were restored (off by default).
- At any time, the **Start** button (house icon) at the left of the menu bar or **View › Start page** opens it, and pressing it again closes it. The View menu item shows a check mark while the page is open.

Buttons that move on to editing — creating a new document, opening a file, opening a recent file — close the start page automatically and return to the editor. Documents that were open stay where they were, behind it.

![Start page](images/start-page.png)
*Figure: The start page — from the left, Begin · What you can do · Recent files · Background*

At the top are the program name (My Editor V1.1) and the line "Create or open a document, then continue with preview, structure and the terminal." Below them, four groups sit side by side.

## The Begin column

The leftmost **Begin** column gathers the first things to do as cards.

| Card | Description | Same as |
|---|---|---|
| Tutorial | A step-by-step tour of the editor | Help › Tutorial |
| New | Creates an empty document (the highlighted card) | Ctrl+N |
| Open… | Choose a file to open | Ctrl+O |
| Open folder… | Opens a folder tree | Ctrl+Shift+O |
| Settings | Theme, font and how files are saved | Ctrl+, |
| Keyboard shortcuts | The keys used while editing | Help › Keyboard shortcuts |

Below the cards is the **Always show the start page on launch** check box. It is linked to the same option under Settings › Start page; changing one changes the other.

## What you can do

The **What you can do** group in the middle lays out 12 frequently used features as a grid. Pressing a card closes the start page and runs that feature on the current document. Features that do not fit the kind of document (for example, Run on a code file) are turned off in the editor, so pressing them does nothing.

| Card | What it does | Details |
|---|---|---|
| Find… | Find in the current document | [Find and replace](06-find-and-replace.md) |
| Replace… | Replace what was found | [Find and replace](06-find-and-replace.md) |
| Preview | Markdown, HTML and SVG preview | [Markdown](09-markdown.md), [HTML · SVG](10-html-svg-images-binary.md) |
| Markdown WYSIWYG editing | Edit Markdown with the marks rendered | [Markdown](09-markdown.md) |
| Run | Open HTML in the browser | [HTML · SVG](10-html-svg-images-binary.md) |
| Structure | A heading tree, or the minimap | [Markdown](09-markdown.md), [View and themes](16-view-and-themes.md) |
| Terminal | The terminal tab of the bottom panel | [Terminal and log](14-terminal-and-log.md) |
| Log | The log tab of the same panel | [Terminal and log](14-terminal-and-log.md) |
| Format document | Tidy the document with its formatter | [Format and lint](12-format-and-lint.md) |
| Print… | Preview, then print | [Print](15-print.md) |
| Split left / right | Split the editor | [Split panes](11-split-panes.md) |
| Next theme | Switch to the next colour theme | [View and themes](16-view-and-themes.md) |

The **How to use** button right below the grid opens this Help window ("Every feature explained in detail, with screenshots, in its own window").

![What you can do and How to use](images/start-tasks.png)
*Figure: The What you can do grid and the How to use button below it*

## Recent files and the tip of the day

The **Recent files** group lists up to 8 recently opened files by name. Hovering shows the full path, and clicking opens the file and returns to the editor. If no file has been opened yet, it says "No file has been opened yet." The longer history (up to 10) and removing entries from the list are in the File menu (see [Files](03-files.md)).

Below it, the star-shaped **Tip.** card shows a short hint that changes every day (7 in all). **More** expands the explanation and **Less** shrinks it again. The tips are:

- Ctrl+N creates a new document.
- Ctrl+O opens a file.
- Ctrl+S saves.
- A Markdown tab enables Preview, WYSIWYG and Structure.
- An HTML tab enables Preview and Run.
- Terminal, Log and Problems are tabs of one bottom panel.
- The Start button or View › Start page shows and hides this page.

## Background

A moving 3D picture lies behind the start page. The rightmost **Background** group chooses that picture and adjusts its motion. The picture's colours follow the current theme.

![Background controls](images/start-background.png)
*Figure: Scene buttons and the transparency and speed sliders*

There are 21 **scene** buttons. The scene you press becomes the background immediately, and its button is highlighted (Terminal by default).

Terminal · Code rain · Circuit · Racks · Branches · Tokens · Binary · Keyboard · Chip · Network · Call stack · Syntax tree · Debugger · Containers · Fiber · Hex · Pipeline · Repository · API · Glyphs · Memory

Below them are five sliders. Dragging or clicking a slider changes its value, and the − / + buttons on either side change it one step at a time (5% for transparency and overall speed, 10% for the others). When a slider has focus, ← → ↑ ↓ move one step, and Home / End jump to the minimum / maximum.

| Slider | Range | Default | Meaning |
|---|---|---|---|
| Background transparency (%) | 0 – 100 | 80 | How much the picture shows through |
| Overall speed (%) | 0 – 100 | 20 | The speed of all motion |
| Camera (%) | 0 – 300 | 100 | How fast the viewpoint moves |
| Objects (%) | 0 – 300 | 100 | How fast the objects in the scene move |
| Sky and light (%) | 0 – 300 | 100 | How fast the sky and light change |

**Reset speeds** returns the overall, camera, objects and sky values to their initial values (the scene and transparency are kept). The same sliders are also on the Settings › Start page tab (see [Settings](17-settings.md)).

> Tip: If the moving background distracts you, lower the overall speed to 0. The picture stays, frozen in place.

## The tutorial tour

**Help › Tutorial** or the **Tutorial** card on the start page starts a tour that points at the features one at a time on the real screen. A guide card appears at the bottom right, and the part being explained (a toolbar button, a group on the start page, and so on) is highlighted with an outline. Depending on the step, the tour moves between the start page and the editor by itself. The tour only points at the screen; it **does not change your files**.

![Tutorial card](images/tour.png)
*Figure: The tutorial card — chapter selector, step number, progress bar, Previous · Auto play · Next*

The card contains:

- **Chapter selector**: choosing one of the five chapters — Start page · Files · Editing · View · Tools — jumps to that chapter's first step.
- The **step number** (for example 3 / 19), a progress bar below it, and a "Step n of m in this chapter" line.
- The step title and description.
- **Previous** / **Next** buttons move one step at a time. On the last step, **Finish** replaces Next.
- **Auto play** moves to the next step about every 4.5 seconds until the end. While it plays, the button becomes **Pause**.
- The × at the top right (End the tutorial) closes the tour at any time.

The tutorial covers these 19 steps:

| Chapter | Steps |
|---|---|
| Start page | Welcome, Begin, What you can do, Background |
| Files | New document, Open a file, Folder, Recent files |
| Editing | Find, Replace, Format document |
| View | Preview, WYSIWYG, Run, Structure |
| Tools | Terminal, Log, Settings, That is the tour |

## The Help window (How to use)

**Help › Help** (F1) or **How to use** on the start page opens the help you are reading now in a **separate window**. You can keep it beside the editor and follow along.

![Help window](images/help-window.png)
*Figure: The Help window — chapter list and search on the left, text on the right*

- **Chapter list**: every chapter is listed on the left in numbered order. Clicking a chapter name opens it, and the sections (subheadings) of the current chapter unfold below it. Clicking a section scrolls the text to that spot.
- **Search help**: typing words in the search box at the top keeps only the chapters that contain all of them ("Found in n chapters"), and shows next to each chapter how many times the first word appears. In the text, every occurrence of the first word is highlighted in yellow and the view scrolls to the first one. Clearing the box brings back the full list.
- **Previous / next buttons**: at the bottom of the text are buttons labelled with the previous and next chapter names, and an "n / total" page number.
- **Alt+← / Alt+→**: move to the previous / next chapter with the keyboard.
- A link to another chapter in the text opens that chapter; a web address opens in the system browser.

## Suggested first steps

If you are new, this order is recommended:

1. Take the **Tutorial** from the start page once to see how the screen is laid out (about a minute and a half with Auto play on).
2. In **Settings**, pick a theme, font and font size you like. The theme button and flag button at the right of the toolbar change them directly too ([View and themes](16-view-and-themes.md)).
3. If you have a project to work on, **Open folder…** (Ctrl+Shift+O) shows its folder tree on the left ([Folder tree](08-folder-tree.md)).
4. Click a file in the tree, or use **Open…** (Ctrl+O). You can also drag a file onto the window ([Files](03-files.md)).
5. After editing, save with **Ctrl+S**. When you close and reopen the program, the open tabs and cursor positions come back as they were.
6. To learn the keys, keep the **Help › Keyboard shortcuts** window open or read the [Keyboard shortcuts](18-shortcuts.md) chapter.

> Tip: To see the start page again, press the **Start** button at the left of the menu bar. The same button closes it.
