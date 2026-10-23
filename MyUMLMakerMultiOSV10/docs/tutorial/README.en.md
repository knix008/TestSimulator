# MyUMLMaker tutorial

This document follows the in-app **Tutorial** step by step, with a screenshot of each step taken from the real app (`npm run tutorial:docs` makes them again).

## Running the tutorial

- **Start page › Start tutorial**, the **Tutorial** toolbar button, **Help › Tutorial** or **F11**.
- In the card: **Next / Previous** one step at a time, **Auto play** to the end, the chapter list to jump to a chapter, **✕** or **Esc** to stop at any time.
- The tutorial works only in its own sample tab. Your open drawings are not changed, and the theme, language and view settings it changes are put back when it ends.
- A recording of the whole tour: **Start page › Tutorial video** or **Help › Tutorial video** plays it in its own window (chapter marks, speed, full screen). The file is `docs/video/MyUMLMaker-Tutorial.mp4`, made with `npm run tutorial:video`.

## Contents

1. [Start](#1-start)
2. [The model](#2-the-model)
3. [Drawing](#3-drawing)
4. [Kinds of diagrams](#4-kinds-of-diagrams)
5. [Format & arrange](#5-format--arrange)
6. [Model tools](#6-model-tools)
7. [Files & export](#7-files--export)
8. [Customizing](#8-customizing)
9. [Help](#9-help)

## 1. Start

### 1. Welcome to MyUMLMaker

This tutorial shows every feature of MyUMLMaker with a sample project. Press Next (or auto play). Your files are not touched, and settings it changes are put back at the end.

![Welcome to MyUMLMaker](images/01-welcome.jpg)

### 2. The Home button

The Home button at the start of the menu bar (or Ctrl+Shift+H) brings you back here at any time. Open projects stay in their tabs.

![The Home button](images/02-home.jpg)

### 3. Creating a project

Start blank or from a class, use case, sequence, state, activity, component, deployment, ER, flowchart, data flow, SysML, BPMN, C4, mind map, wireframe or AWS template. You can also open StarUML projects (.mdj) or reverse engineer source code.

![Creating a project](images/03-templates.jpg)

### 4. Recent files and folders

The last 10 files and 10 folders are remembered. ✕ removes one entry, "Clear all" removes them all. The File menu manages them too.

![Recent files and folders](images/04-recent.jpg)

### 5. Moving background

The start page background keeps moving. Pick one of many, shuffle, or change the speed. You can also use a picture.

![Moving background](images/05-background.jpg)

## 2. The model

### 6. The sample project

This is the Online Shop sample. Left: the Toolbox. Centre: the diagram with the working-diagram tabs. Top right: the Model Explorer. Bottom right: the editors (properties, style, documentation, tags).

![The sample project](images/06-sample.jpg)

### 7. The Model Explorer

Every element of the project is in this tree: models, packages, classes with their attributes and operations, relationships, diagrams. Drag to move into another package, F2 to rename, right-click to add elements or diagrams.

![The Model Explorer](images/07-explorer.jpg)

### 8. Model and views

A box on a diagram is a "view" of a model element. The same element can be shown on many diagrams, and renaming it changes it everywhere. Delete removes it from the diagram only; Ctrl+Delete removes it from the model.

![Model and views](images/08-modelView.jpg)

### 9. Diagram tabs

Every diagram of the project has a tab at the top. Click a tab or use Ctrl+Tab, Ctrl+PageUp/PageDown; when there are many, ‹ › scroll them. Double-click a tab to rename it. One project is open at a time.

![Diagram tabs](images/09-workingDiagrams.jpg)

### 10. Adding diagrams

The + at the end of the tab bar opens the New Diagram popup. Pick the diagram you want and just that one diagram is added to the project, with its own tab. Sequence diagrams go into an interaction, statecharts into a state machine automatically.

![Adding diagrams](images/10-addDiagram.jpg)

### 11. Choosing a diagram

Pick a group on the left (UML Structure, UML Behavior, ER, SysML, BPMN …) and its diagrams show on the right with a short description. The search box finds diagrams by name or description, and a name can be typed below. Double-click or press Enter to create it. The number is how many the project already has.

![Choosing a diagram](images/11-diagramTypes.jpg)

### 12. The editors

Edit the selected element’s properties (visibility, types, multiplicities, relationship ends …), the view style, documentation, and tags & constraints. Every change is one undo step.

![The editors](images/12-editors.jpg)

## 3. Drawing

### 13. The Toolbox

It shows the tools of the current kind of diagram. Pick a tool, then click or drag on the diagram; drag relationship tools from one element to another. Hold Shift to keep the tool.

![The Toolbox](images/13-toolbox.jpg)

### 14. Creating elements

A new class is ready for its name. You can also drag a tool onto the diagram, or double-click an empty spot for a menu of elements to add there.

![Creating elements](images/14-createClass.jpg)

### 15. Quick edit

Double-click a class to edit its name, attributes and operations as text. Write UML notation such as "+name: String = 1" or "+getName(): String {query}" and visibility, types, defaults and parameters are filled in.

![Quick edit](images/15-quickEdit.jpg)

### 16. Quick buttons

Buttons under the selected element add attributes, operations, literals or columns, and create related elements (subclass, associated class, interface …) together with the relationship.

![Quick buttons](images/16-quickButtons.jpg)

### 17. Relationships

Association, directed, aggregation, composition, dependency, generalization, interface realization …. Select a line to move its ends to other elements, drag its middle to bend it, double-click a bend point to remove it.

![Relationships](images/17-relationships.jpg)

### 18. Adding related elements

Create a superclass, subclass, associated or composite class, realized interface, included use case, next state, next action and more in one step.

![Adding related elements](images/18-addRelated.jpg)

### 19. Moving and resizing

Drag to move, use the handles to resize. Positions snap to the grid (Alt turns it off), and containers such as packages carry what is inside. Dropping an element into a package moves it there in the model too.

![Moving and resizing](images/19-moveResize.jpg)

### 20. Drag from the explorer

Drag an element from the Model Explorer onto a diagram to show it there, with its relationships to elements already shown. On a sequence diagram a class becomes a lifeline.

![Drag from the explorer](images/20-dragFromExplorer.jpg)

### 21. Deleting

Delete removes the view only; the element stays in the model. Ctrl+Delete (Delete from model) removes the element, all its views and the relationships that need it.

![Deleting](images/21-deleteModel.jpg)

### 22. Undo and redo

Every edit can be undone (Ctrl+Z) and redone (Ctrl+Y).

![Undo and redo](images/22-undo.jpg)

## 4. Kinds of diagrams

### 23. Use case diagram

Actors, use cases, subject, with association, «include», «extend» and generalization.

![Use case diagram](images/23-useCase.jpg)

### 24. Sequence diagram

Draw synchronous, asynchronous, reply, create and delete messages between lifelines; numbers and activation bars appear automatically. Drag a message up or down to change the order.

![Sequence diagram](images/24-sequence.jpg)

### 25. Combined fragments

Twelve combined fragments (alt, opt, loop, par, break, critical …), interaction uses (ref), state invariants, continuations, endpoints and gates.

![Combined fragments](images/25-fragments.jpg)

### 26. Statechart diagram

States with entry/do/exit activities, composite states, initial, final, choice, junction, fork, join and history pseudostates, and "trigger [guard] / effect" transitions.

![Statechart diagram](images/26-stateMachine.jpg)

### 27. Activity diagram

Actions, signals, time events, decision, merge, fork and join, object nodes and pins, swimlanes (partitions), structured, expansion and interruptible regions.

![Activity diagram](images/27-activity.jpg)

### 28. Component diagram

Components, interfaces (lollipop icon), ports and artifacts with provided / required interfaces and assembly / delegation connectors.

![Component diagram](images/28-component.jpg)

### 29. Deployment diagram

Deploy artifacts on nodes, devices and execution environments, linked by communication paths.

![Deployment diagram](images/29-deployment.jpg)

### 30. ER diagram

Entities with columns (PK, FK, type, length) and crow’s-foot relationships. Tools › Generate SQL DDL writes MySQL, PostgreSQL, SQLite, SQL Server or Oracle scripts.

![ER diagram](images/30-erd.jpg)

### 31. More diagrams

Flowcharts, data flow, SysML, BPMN, C4, mind maps, wireframes and AWS / Azure / GCP cloud diagrams work the same way.

![More diagrams](images/31-others.jpg)

### 32. Gantt, WBS, ArchiMate, network, data

Project plans (Gantt chart, WBS, timeline), ArchiMate 3 enterprise architecture, networks, JSON and YAML data, EBNF and regex railroad diagrams. All of them import from and export to PlantUML.

![Gantt, WBS, ArchiMate, network, data](images/32-moreDiagrams.jpg)

### 33. Mind map: Tab and Enter

Select a topic and press Tab (or Insert) for a subtopic, Enter for the next topic at the same level, and type its name right away. The map lays itself out again, and − collapses a branch. Shape, marker, priority, progress and due date are properties.

![Mind map: Tab and Enter](images/33-mindmapKeys.jpg)

### 34. Mind map outline

The Outline tab of the right panel lists the topics. A row goes to its topic; copy the outline as text or Markdown, or paste indented text to add many subtopics under the selected topic at once.

![Mind map outline](images/34-mindmapOutline.jpg)

### 35. User story map

User activities and steps across the top, user story cards below, grouped into release bands. Cards show their priority (MoSCoW), story points and status, and arrows join stories that depend on each other.

![User story map](images/35-storyMap.jpg)

### 36. Customer journey map

A persona, the stages of the journey (columns) and rows for actions, touchpoints, emotions, pain points and opportunities. Emotion points joined by the emotion curve show the ups and downs of the experience.

![Customer journey map](images/36-journeyMap.jpg)

## 5. Format & arrange

### 37. Style

Set fill, line and font colour, font, line width and style, stereotype display, suppressed compartments, visibility and signatures, shadows and auto size for each view.

![Style](images/37-style.jpg)

### 38. Colours

The fill and line colour buttons colour the selected views; their left half applies the last colour again.

![Colours](images/38-colors.jpg)

### 39. Diagram background

Format › Diagram background… sets a background per diagram: a colour, a picture (fill, fit, tile, centre, stretch) or one of 10 patterns with its colour and scale, each with its own opacity. Pick with the live preview; OK is one undo step. With nothing selected, the Background section of the editor panel changes it too.

![Diagram background](images/39-diagramBackground.jpg)

### 40. Line styles

Choose rectilinear, oblique, rounded or curved. The default for new lines is in the View menu or Settings.

![Line styles](images/40-lineStyle.jpg)

### 41. Align and distribute

Align several views left, centre, right, top, middle or bottom, distribute them evenly, or give them the same size.

![Align and distribute](images/41-align.jpg)

### 42. Auto layout

A layered layout rearranges elements top-down, left-right and so on; parents go above their subclasses. On a sequence diagram it evens out lifelines and messages.

![Auto layout](images/42-layout.jpg)

### 43. Zoom and pan

Ctrl+wheel zooms, the middle button or Space+drag pans. The rulers at the top and left show where you are, and the grid has a darker line every 5 cells (5 × 5). The minimap at the bottom right helps with large diagrams.

![Zoom and pan](images/43-zoom.jpg)

## 6. Model tools

### 44. Model validation

Checks the model against about 20 rules: missing or duplicate names, inheritance cycles, bad multiplicities, regions without an initial state, entities without a primary key …. Click a result to go there.

![Model validation](images/44-validate.jpg)

### 45. BPMN process simulation

Tools › Simulate BPMN process shows tokens moving along the sequence flows. Play, step or change the speed, and analyse 100 runs to find deadlocks, loops that never end and elements that are never reached.

![BPMN process simulation](images/45-bpmnSimulation.jpg)

### 46. Problems panel

The Problems panel under the canvas validates the UML and ERD model in the background after every edit and lists errors and warnings (here the customer table got a second column of the same name). Click a row to open the element's diagram with its view selected; the canvas marks it with a ! badge. Toggle the panel with Ctrl+J, the toolbar button or ×.

![Problems panel](images/46-problemsPanel.jpg)

### 47. Find

Find elements anywhere in the model by name, documentation or kind, and jump to them.

![Find](images/47-find.jpg)

### 48. Code generation

Preview and generate Java, C#, C++, Python, TypeScript, Kotlin, PHP and SQL DDL into a folder or a ZIP. Packages become folders and namespaces; inheritance, interfaces, associations and doc comments are included.

![Code generation](images/48-codegen.jpg)

### 49. Requirements list

Each requirement has an ID, kind, status, priority, risk and verification method. Sort, filter and change their status in the list, see how many satisfy, verify and derive links each has, and export it as CSV.

![Requirements list](images/49-requirements.jpg)

### 50. Traceability matrix

Pick element types and packages for rows and columns and a relationship type, and the relationships show as a grid. Click a cell to create or delete a relationship (undoable); rows without relationships are highlighted.

![Traceability matrix](images/50-traceMatrix.jpg)

### 51. Baselines and comparison

Keep snapshots (baselines) of the model inside the project and compare them with the current model later: added, removed and changed elements, with restore from the baseline. Compare with another file too.

![Baselines and comparison](images/51-baselines.jpg)

### 52. Reverse engineering

Reads Java, C#, Python or TypeScript sources, or SQL CREATE TABLE, into classes, attributes, operations and relationships (or entities) and draws a diagram. Works with whole folders or dropped files.

![Reverse engineering](images/52-reverse.jpg)

### 53. Mermaid & PlantUML import

Turns Mermaid (class, sequence, flowchart, ER, state) and PlantUML (every UML diagram, ER and mind maps) text into model elements and a diagram. Diagrams can be exported to Mermaid and PlantUML too.

![Mermaid & PlantUML import](images/53-textImport.jpg)

## 7. Files & export

### 54. Saving

A project is saved as one .myuml file (templates: .mumlt), and can also be stored in the database chosen in Settings › Database (SQLite, MariaDB, MySQL, PostgreSQL, SQL Server).

![Saving](images/54-save.jpg)

### 55. The File menu

Open, save, templates, recent files and folders, import (StarUML, fragments, Mermaid/PlantUML, reverse engineering) and export, printing, the database.

![The File menu](images/55-fileMenu.jpg)

### 56. Exporting pictures

Export the current diagram or the selection as PNG, JPEG, WebP, BMP, TIFF or SVG, with scale and transparent background.

![Exporting pictures](images/56-exportImage.jpg)

### 57. Docs and other formats

Export all diagrams to PDF, a ZIP of pictures, searchable HTML documentation, Markdown, StarUML .mdj, model fragments, Mermaid and PlantUML.

![Docs and other formats](images/57-exportDocs.jpg)

### 58. Generate documents

Templates (full model, requirements specification, design, use case specification, data dictionary) make Word (.docx), PDF or HTML documents with a cover, contents, diagram pictures and element details.

![Generate documents](images/58-generateDocument.jpg)

### 59. XMI and PlantUML

File › Import and Export exchange XMI 2.x (with diagram positions) with Enterprise Architect and other tools, and PlantUML for every UML diagram.

![XMI and PlantUML](images/59-xmi.jpg)

### 60. StarUML compatibility

StarUML projects (.mdj) open directly with their model and diagrams, and can be exported back to .mdj. Model fragments (.mfj) work both ways.

![StarUML compatibility](images/60-starUml.jpg)

### 61. Printing and preview

Choose all diagrams, the current one or a range; fit to page, actual size (tiled) or a scale; paper, orientation, margins, header and footer — with a preview.

![Printing and preview](images/61-print.jpg)

## 8. Customizing

### 62. Themes

The theme button picks a different theme at random on every press. The ▾ next to it lists 20 dark and 20 light themes in two columns; the custom theme is edited color by color in Settings › Theme.

![Themes](images/62-theme.jpg)

### 63. Diagram colours

Choose classic, pastel, blueprint or dark colours for diagrams. Exports and printing use the same colours.

![Diagram colours](images/63-diagramTheme.jpg)

### 64. Language

The flag button switches between Korean and English: the UK flag shows while the UI is Korean, the Korean flag while it is English.

![Language](images/64-language.jpg)

### 65. Collapsing panels

Collapsed, the tool and properties panels leave a narrow rail with icons and a title; the expand button is at the top. Drag the separators to change their width.

![Collapsing panels](images/65-panels.jpg)

### 66. Settings

Tabs: general, start page, theme, font, background, diagram (colours, line style, grid, snapping, shadows, quick buttons, auto save), database, recent files, shortcuts.

![Settings](images/66-settings.jpg)

## 9. Help

### 67. Presentation mode

F5 shows the diagrams full screen one by one. Arrow keys or a click go on, Esc ends.

![Presentation mode](images/67-presentation.jpg)

### 68. Keyboard shortcuts

Settings › Shortcuts lists them all; the menus show them next to each command.

![Keyboard shortcuts](images/68-shortcuts.jpg)

### 69. About

The ⓘ toolbar button shows the version, build information and the author (SHKWON, knix008@naver.com). Errors open a popup with every detail, ready to copy.

![About](images/69-about.jpg)

### 70. Reading the tutorial document

A document with every step of this tutorial and its screen opens in its own window: use the Tutorial document button on the start page or the Help menu. The bar on top jumps to a chapter, switches 한국어/English, finds text in the document (Ctrl+F), prints it or opens it in a browser. The user's guide and the tutorial video open in their own windows from the start page too.

![Reading the tutorial document](images/70-tutorialDoc.jpg)

### 71. That's the tour

Watch it again any time with Help › Tutorial or the graduation-cap toolbar button (F11). See Help › User's guide for the details.

![That's the tour](images/71-finish.jpg)

