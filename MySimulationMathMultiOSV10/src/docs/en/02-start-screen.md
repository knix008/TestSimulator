# Start Page

The Start Page is the first screen shown when you open the program. It covers the whole window, with cards laid over an animated background. It closes automatically when you open or create a document, and you can reopen it at any time with the **Home › Start Page** button on the ribbon.

![Start Page: top card, New, Recent files, Background, Help, Samples](images/en/start.png)

## Top Card

It shows the program icon, name, version and a one-line description, with frequently used buttons grouped on the right.

| Button | Action |
| --- | --- |
| **Run tutorial** | Starts the interactive tutorial from the beginning; it drives the real interface to show the features |
| **User manual** | Opens this manual in a separate window ({{F1}}) |
| **Tutorial document** | Opens a document that summarizes the tutorial steps with pictures in the manual window |
| **Open** | File open dialog ({{Ctrl+O}}) |
| **New Model** | Empty block diagram model |
| **New Script** | Empty script ({{Ctrl+N}}) |

## New

Tiles that group starting points by task. Hover over a tile to see its description.

- **Code**: Script, live script (a template containing `%%` sections), function (a `function` template), class (a `classdef` template)
- **Simulation**: New model, open model, block library
- **Data**: Import data, plot gallery (the Plots tab on the ribbon), figure area, find files

## Recent Files

Up to 12 recently opened scripts and models are listed. Click an item to reopen it; the ✕ on the right removes it from the list only (the file stays). If a file no longer exists, a notice appears and it is dropped from the list. **Clear all** empties the list after asking for confirmation.

## Help Card

| Item | Action |
| --- | --- |
| User manual | This manual |
| Run tutorial | Interactive tutorial |
| Tutorial document | Document of the tutorial steps |
| Command help (help) | Runs `help` in the Command Window |
| Find functions (lookfor) | Asks for a word and runs `lookfor word` |
| Shortcuts | List of the main keyboard shortcuts |
| Preferences | Settings window ({{Ctrl+,}}) |
| About | Version and license |

## Background

Use the **Background** card to choose the animation that plays behind the Start Page.

- Change the background with the type buttons; turn on **Shuffle** to switch to a different background every set number of seconds.
- Adjust **Speed** and **Transparency** with the sliders or the − / + buttons.
- Turn on **Random background on start** to pick one at random on every launch.
- The same settings are also under **Settings › Start Page**.

## Samples

Example cards by area (Basics, 2D plots, 3D plots, Numerics, Linear algebra, Signal · image, Statistics · data, Optimization · fitting, Control, Text · data types, Programming). Filter them with the category buttons at the top. Clicking a card opens the example code as a new script, and the card's ▶ button runs it right away without going through the editor.

## Moving and Resizing Cards

- Drag the **⠿** handle to the left of a card title to move it to another slot. The drop position is shown as a dashed outline, and the other cards move out of the way.
- Drag a card's bottom-right corner to resize it; double-click the corner to return to the height that fits its contents.
- Keyboard: with focus on the handle, move with {{Alt+←}} {{Alt+→}} {{Alt+↑}} {{Alt+↓}} and resize with {{Alt+Shift+Arrow}}.
- **Auto Arrange** at the top right rearranges the cards with no gaps.

> Tip: Turn off **Show the start page on launch** at the bottom to go straight to the desktop from the next launch on.
