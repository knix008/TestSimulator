# MyMind User Guide

## 1. Introduction

MyMind is an editor for **mind maps** and **fishbone (Ishikawa)** diagrams, running as a desktop app (Windows / macOS / Linux) and in a web browser with the same screens. Both modes share the same data: switching only changes how it is drawn.

## 2. Installation (Windows)

1. Run `MyMind_2.0.0_x64-setup.exe`.
2. Pick the installer's language (Korean / English). The program's first start uses it too.
3. Follow the steps. `.mmap` files are associated with MyMind.

> The window has no system title bar. The top row takes its place: drag it to move the window, double-click it to maximize. Drag the dots at the bottom right to resize. The window's position and size are remembered.

## 3. Screen layout

| Area | Description |
|------|-------------|
| **Start screen** | Cards over a moving background: shortcuts, recent files, samples, themes, backgrounds. The **Start** button in the top row opens it at any time |
| **Top row** | Name and version, **Start**, **File▾ Edit▾ View▾ Help▾**, document name, window buttons |
| **Toolbar** | New·Open·Save·Export, Undo/Redo, Mind map/Fishbone, Layout▾, Center·Auto Align·Grid, Theme▾·language·Settings·About. In a narrow window only the icons remain |
| **Left panel** | Node list as a **tree view** with parent/child connector lines |
| **Right panel** | Text·memo, shape·color, font·font size·text color·style, line shape/pattern/caps/color, connection point |
| **Canvas** | Diagram editing (grid, pan, zoom) |
| **Status bar** | Mode, layout, node count, zoom, grid, save status, resize dots |
| **Context menu** | Undo/redo, add/edit, duplicate/copy/paste, file and view actions, delete |

Dialogs and the settings window are windows of their own, which can be moved outside the program. The guide window can stay open while you work.

## 4. Basic tasks

### 4.1 File (File▾ menu)

- **New Mind Map / New Fishbone** (Ctrl+N uses the default mode from the settings): asks first about unsaved work
- **Open** (Ctrl+O): open `.mmap` (legacy `.mymind` too); the view fits the whole diagram
- **Save** (Ctrl+S), **Save As** (Ctrl+Shift+S): save as `.mmap` (the web version downloads)
- **Export**: save an image as **PNG / JPEG / WebP / SVG**, optionally with a **transparent background** (not JPEG), cropped to the **smallest size holding every shape**
- **Samples**: open from the Samples card on the start screen. They open as new unnamed documents, so the originals never change

### 4.2 Mode

The **Mind map / Fishbone** buttons in the toolbar redraw the current document in the other mode.

### 4.3 Nodes

| Action | How |
|--------|-----|
| Select | Click a node (or a row in the left tree — it highlights on canvas) |
| Select many | **Marquee drag** or **Shift-click** |
| Move | Drag (moves the whole selection) |
| Edit text | Double-click or context menu |
| Memo | Type in the **Memo** field of the right panel (✎ badge + tooltip) |
| Add child / sibling | Context menu |
| Duplicate / Copy / Paste | Context menu (node + subtree) |
| Delete | **Delete/Backspace** or context menu (root/effect can't be deleted) |
| **Undo / Redo** | Toolbar, context menu, or **Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z** |

### 4.4 Layout, shape, line

- **Layout** (toolbar) — Mindmap: Radial · Top→Bottom · Bottom→Top · Left→Right · Right→Left; Fishbone: Left→Right · Right→Left
- **Shapes (12)**: rounded, rectangle, ellipse, diamond, parallelogram, stadium, hexagon, octagon, cylinder, trapezoid, chevron, note — with previews
- **Line**: curve · straight · elbow · tree-root; **patterns**: solid · dashed · dotted · dash-dot; **start/end caps**: none · arrow · dot · diamond
- **Fonts**: presets + **all installed system fonts**, **font size**, color, bold/italic/underline/strike

Lines attach at the **midpoint of each node face**.

### 4.5 Selecting a line · manual connection point

- **Click a line** to select just that edge and edit its type/pattern/color/caps.
- In **Connection Point**, set the **start/end side** to Auto/Top/Bottom/Left/Right to place the connection manually.

### 4.6 View tools

| Button | Action |
|--------|--------|
| **Center View** | Zoom/position so the whole diagram fits |
| **Auto Align** | Re-layout with the current rule, then fit |
| **Grid** | Toggle the grid. **When the grid is on, left-drag on empty canvas pans the background** |

### 4.7 Canvas

- **Pan**: middle-button drag (or left-drag when the grid is on)
- **Zoom**: mouse wheel (10%–400%, centered)
- **Deselect**: click empty space

### 4.8 Theme, language, settings

- **Themes**: 20 light and 20 dark. Pick one from **Theme▾** in the toolbar, the Theme card on the start screen, or the settings window
- **My themes**: in Settings → Theme, copy the current theme and change its colours one by one
- **Language**: Korean ↔ English, applied at once
- **Settings window**:
  - **General**: language, showing the start screen, reopening the last file, a new diagram's mode, layout, shape and line, the grid, clearing recent files
  - **Theme**: the 40 themes and the editor for your own
  - **Start**: the background (24 kinds), its speed, card opacity, putting the cards back
- Move a start screen card by the handle at its top left; resize it by the dots at its bottom right
- All settings are saved and last to the next start

### 4.9 Unsaved work

With unsaved work, closing the window or opening another document asks **Save / Don't Save / Cancel**.

## 5. Fishbone tips

1. Toggle to **Fishbone**.
2. Right-click the Effect node → Add Child for categories.
3. Add causes under categories; children and deeper causes fan evenly above/below their parent.
4. Drag or **Auto Align** to tidy up.

## 6. File format

- Extension: `.mmap` (legacy `.mymind` too), JSON (UTF-8)
- Stores node positions/sizes/shapes/colors/memo/fonts, edges with line type/pattern/color/caps/**connection side**, and mode/layout — restored exactly on open
- Portable across MyMind installations

## 7. Troubleshooting

| Issue | Try |
|-------|-----|
| Content off-screen | **Center View** |
| Messy layout | **Auto Align** |
| Toolbar labels disappear | the window is narrow, so only the icons show; widen it to bring them back |
| A recent file left the list | a file that cannot be found is reported and removed from the list |
| Path not remembered (web) | web uses downloads; use the desktop app |

## 8. Support

Contact: **SHKWON** — knix008@naver.com
