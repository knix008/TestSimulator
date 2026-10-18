# MyUMLMaker User's Guide

MyUMLMaker draws UML and software diagrams model first, the way StarUML does. It draws the 15 UML 2 diagrams (class, sequence, state machine, activity and the rest) plus ER, flowchart, data flow, SysML, BPMN, C4, mind map, wireframe and cloud (AWS, Azure, GCP) diagrams. It validates the model, generates Java, C#, C++, Python, TypeScript, Kotlin and PHP code and SQL DDL, and reads source code back into a model. It runs with the same screens as a desktop app on Windows, macOS and Linux and in a web browser.

This guide is organised by task. Menu and command names are written exactly as the program shows them (for example **File › Export › HTML documentation (.html)…** is the "HTML documentation (.html)…" command in the "Export" submenu of the "File" menu). The pictures are captured from the tutorial. Shortcuts are given for Windows and Linux; on macOS use `Cmd` instead of `Ctrl`.

> 한국어 설명서: [UsersGuide.md](UsersGuide.md)

## Getting started

### First start

On the first start the **Welcome to MyUMLMaker** window opens. It explains that the tutorial uses a sample project to show every feature in turn, from the Model Explorer and diagrams to quick edit, relationships, formatting, layout, code generation, exports and settings, and says where to find the tutorial, the sample project and the user's guide.

![The welcome window and the start page](docs/tutorial/images/01-welcome.jpg)

| Button | What it does |
|---|---|
| **Start the tutorial** | Starts the tutorial, which shows every feature one by one on a sample project |
| **Open the sample** | Opens the "Online Shop" sample project |
| **Later** | Closes the window. The tutorial is always at **Help › Tutorial** (`F11`) |

The welcome window shows only once. Only one MyUMLMaker desktop app runs per user. Starting it again while it is running shows an error window and the new copy closes (see [Help and troubleshooting](#help-and-troubleshooting)).

### Start page

The start page shows when no project is open (and from the **Home** button at the start of the menu bar, `Ctrl+Shift+H`). Its background keeps moving. The **Home** button does not close the open project: press **Home** (`Ctrl+Shift+H`) again to go back to it.

| Area | Contents |
|---|---|
| Top | Program name and version, the line "Model UML and software diagrams, generate code and publish documentation.", and **Start the tutorial**. Until the tutorial has been finished, a "New here?" banner with a **Start** button shows too |
| **New** | 17 template tiles, **Open…**, **Open StarUML project (.mdj)…**, **Reverse engineer (code → model)**, **Import Mermaid / PlantUML…** |
| **Recent files** · **Recent folders** | The files and folders opened lately. ✕ removes one entry, **Clear all** · **Clear all folders** remove them all. Clicking a folder opens the Open window in that folder |
| **Help** | **Tutorial document**, **User's guide**, **Keyboard shortcuts…** |
| **Sample projects** | The installed sample files (only those in the current language). If the install folder has no samples, a single **Online Shop (sample)** shows |
| **Moving background** | Pick one of 20 animations, **Change moving background** (random), **Background image…**, **Motion speed** (0–300%), **Random at start**, **Auto change** (Off, every 15 s, 30 s, 1 min, 2 min or 5 min) |
| Bottom | **Show the start page at start-up** check box |

Which parts show, and how many recent files, is set in **Settings › Start page**. Right-clicking the start page offers New project · Open · Recent files · Change moving background · Tutorial · About.

### New project from a template

![Creating a project](docs/tutorial/images/03-templates.jpg)

Pick a template tile on the start page or **File › New from template**. Each template holds a matching diagram and a small example drawing.

| Template | Holds |
|---|---|
| **Blank project** | One model and an empty class diagram |
| **Class model** | Classes, inheritance and associations |
| **Use cases** | Actors, use cases and the subject (system boundary) |
| **Sequence** | Lifelines and messages |
| **State machine** | States and transitions |
| **Activity** | Actions, decisions and flows |
| **Components** | Components and interfaces |
| **Deployment** | Nodes, devices and artifacts |
| **ER diagram** | Tables, columns and relationships (DDL generation) |
| **Flowchart** | Processes, decisions and flows |
| **Data flow** | External entities, processes and stores |
| **SysML requirements** | Requirements, blocks and tracing |
| **BPMN** | Pools, tasks, gateways and events |
| **C4** | People, systems and containers |
| **Mind map** | A central topic and branches |
| **Wireframe** | Screen sketches |
| **AWS architecture** | A VPC, services and connections |

**New project** on the toolbar (`Ctrl+N`) makes a blank project. Only one project is open at a time, so a new project, a template or the sample replaces the current project. When the current project has unsaved changes, you are asked first: **Save** · **Don't save** · **Cancel** (see [Unsaved changes](#unsaved-changes)). A project made from a template has no file yet, so the first save asks for a file name.

### The sample project

The "Online Shop" sample draws the requirements, structure, behaviour and data of an online shop in several notations: a finished example of every one of the 29 kinds of diagram the program draws.

![The sample project](docs/tutorial/images/06-sample.jpg)

| Diagram | Kind | Contents |
|---|---|---|
| Domain Classes | Class | Customer · Order · OrderLine · Product (abstract) · Book · Food · OrderStatus (enumeration) · Payable (interface) with association, composition, directed association, generalization, realization and dependency, and a note |
| Package Structure | Package | Web, service, domain and repository layer packages with their classes, «import» dependencies |
| Objects of Order 1001 | Object | Order, customer and order line instances with slots (attribute = value) and links |
| Order Processor Structure | Composite structure | Parts, ports, connectors, provided and required interfaces |
| Components | Component | Components inside a subsystem, a port, delegation and assembly connectors, interfaces, «manifest» |
| Deployment | Deployment | Device, nodes, execution environments and artifacts, «deploy» and «manifest», communication paths |
| Shop Profile | Profile | Stereotypes, metaclasses and extensions (applied to classes) |
| Use Cases | Use case | Actors with a generalization, the system boundary, include and extend (with an extension point) |
| Order Fulfilment | Activity | Three swimlanes, an object node, fork and join, send and accept signal |
| Order States | State machine | A composite SHIPPED state, triggers, guards and effects, cancel paths |
| Place Order Sequence | Sequence | Lifelines, a ref to Log In, a create message, an alt/else fragment |
| Place Order Communication | Communication | The roles of the sequence with six numbered messages |
| Payment Timing | Timing | Two state lifelines, time ticks, duration and time constraints, a message |
| Shopping Interaction Overview | Interaction overview | ref nodes to real interactions, decision and merge, a retry loop |
| Information Flows | Information flow | Information items conveyed «flow» |
| Shop Database | ER | Six tables, 1:N, 1:0..1 and a non-identifying relationship |
| Payment Flow | Flowchart | Many symbols and a retry loop |
| Order Processing DFD (Level 1) | Data flow | External entities, processes, data stores and data flows |
| Shop Requirements | SysML requirement | Containment, derive, verify, refine, satisfy and trace |
| Shop Block Definition | SysML block definition | Blocks, an interface block, value types, a constraint block and relationships |
| Shop Internal Blocks | SysML internal block | Part properties, ports, connectors and an item flow |
| Order Price Calculation | SysML parametric | Constraint properties, constraint parameters and bindings |
| Order Handling (BPMN) | BPMN | Two pools and two lanes, message flows, gateways, a boundary error event, a timer, a data object and store, an annotation |
| System Context | C4 | Customer, Online Shop, Payment Provider and E-mail Service in an enterprise boundary |
| Shop Launch Plan | Mind map | A central topic with two levels of branches |
| Checkout Screen | Wireframe | Web and mobile screens |
| AWS Deployment | AWS | Region, VPC, subnets, Auto Scaling and connected services |
| Azure Deployment | Azure | Resource group, virtual network and connected services |
| GCP Deployment | GCP | Project, region, VPC and connected services |

The `samples` folder of the installation holds the same sample as `.myuml` and as StarUML `.mdj`, a class model template (`.mumlt`) and a model fragment (`.mfj`), in Korean and English.

### Tutorial

Start it with **Help › Tutorial** (`F11`), the graduation-cap button at the right of the toolbar, or **Start the tutorial** on the start page. The tutorial drives the real program and shows the features one by one in 58 steps.

- Move through it with the **Next** and **Previous step** buttons in the guide box at the bottom right, or with **Auto play** (▶). While auto play runs, **Pause auto play** stops it. On the last step press **Done**.
- The **Choose a chapter** list jumps to a chapter: Start · The model · Drawing · Kinds of diagrams · Format & arrange · Model tools · Files & export · Customizing · Help.
- The part of the screen each step explains is outlined. The guide box can be dragged out of the way. `Esc` or ✕ (**End the tutorial (Esc)**) ends it.
- The tutorial opens its own sample project separately, and at the end closes it and goes back to the project you had open. Your project is not changed, and the settings the tutorial changes (theme, language, background and so on) are put back when it ends.

**Tutorial document** — a document of every tutorial step with its picture can be read inside the program. Open it from **Help › Tutorial document** on the start page or from the **Help › Tutorial document** menu; the document shows in the middle, and the bar at the top offers **Go to chapter**, a 한국어/English switch, **Start tutorial** and **Open in browser**. The **Home** button goes back.

![The tutorial document](docs/tutorial/images/56-tutorialDoc.jpg)

## The screen

From the top there are the menu bar and the **Toolbar** (one row). Below them, the **Toolbox** is on the left, and the **Model Explorer** (top) and the editors (bottom) are on the right. In the middle, from the top, are the row with the project name and the **diagram tabs**, the two rows of **diagram type tabs**, and the diagram with rulers along its top and left edges. At the very bottom is the **Status bar**. Dragging the splitters between the panels changes their width, and dragging the horizontal splitter between the Model Explorer and the editors changes how the height is shared. Dragging the bottom right corner of the window resizes the window. The window cannot be made narrower than the width that keeps every toolbar button and menu visible.

### Menu bar

The **Home** button at the start of the menu bar (`Ctrl+Shift+H`) goes back to the start page at any time. Items marked ▸ open a submenu to the side. Each menu command shows its shortcut, and commands that cannot be used right now are dimmed.

| Menu | Commands |
|---|---|
| **File** | New project · New from template · Open… · Start page · Recent files… · Recent folders · Clear all recent files and folders · Save · Save as… · Save as template… · Open from database… · Save to database (desktop app) · Import ▸ · Export ▸ · Print… · Project properties · Close project · Exit |
| **Edit** | Undo · Redo · Cut · Copy · Paste · Duplicate · Delete from diagram · Delete from model · Select all · Clear selection · Select in Model Explorer · Select in diagram · Edit name · Find… |
| **Model** | Add diagram · Add element · Move up in model · Move down in model · Show all relationships · Elements not on any diagram · Validate model · Model statistics |
| **View** | Zoom ▸ · Show ▸ · Diagram colours ▸ · Default line style ▸ · Diagrams ▸ · Presentation mode · Theme, language and background ▸ |
| **Format** | Font ▸ · Fill color · Line color · Line style ▸ · Stereotype display ▸ · Display ▸ · Auto resize · Fit to content |
| **Arrange** | Order ▸ · Align & distribute ▸ · Auto layout · Auto layout ▸ |
| **Tools** | Generate code… · Generate SQL DDL… · Reverse engineer (code → model) · Validate model · Settings… |
| **Help** | Tutorial · Tutorial document · User's guide · Keyboard shortcuts… · Settings… · About… |

The submenus hold:

| Submenu | Commands |
|---|---|
| **File › Import** | Open StarUML project (.mdj)… · Import model fragment (.mfj)… · Import Mermaid / PlantUML… · Reverse engineer (code → model) |
| **File › Export** | Export as picture… · Export SVG (current diagram)… · Export PDF (all diagrams)… · All diagrams as pictures (.zip)… · HTML documentation (.html)… · Markdown documentation (.zip)… · StarUML project (.mdj)… · Export model fragment (.mfj)… · Mermaid (.mmd)… · PlantUML (.puml)… |
| **View › Zoom** | Zoom in · Zoom out · Zoom 100% · Fit diagram · Zoom to selection |
| **View › Show** | Grid · Rulers · Snap to grid · Pan & zoom window · Quick edit buttons · Show shadows · Toolbox · Model Explorer & editors · Status bar |
| **View › Diagram colours** | Classic (white) · Pastel · Blueprint · Dark |
| **View › Default line style** | Rectilinear · Oblique · Rounded rectilinear · Curve |
| **View › Diagrams** | Add diagram · Previous diagram · Next diagram |
| **View › Theme, language and background** | Random theme · Choose theme · Switch language · Change moving background · Background image… · Turn background off |
| **Format › Font** | Bold · Italic · Increase font size · Decrease font size · Font colour |
| **Format › Line style** | Rectilinear · Oblique · Rounded rectilinear · Curve · Clear bend points |
| **Format › Stereotype display** | Label («…») · Decoration · Icon (interface lollipop) · None |
| **Format › Display** | Suppress attributes · Suppress operations · Show visibility · Show namespace · Show operation signature · Shadow |
| **Arrange › Order** | Bring to front · Send to back · Bring forward · Send backward |
| **Arrange › Align & distribute** | Align left · Align center · Align right · Align top · Align middle · Align bottom · Distribute horizontally · Distribute vertically · Same width · Same height · Same size |
| **Arrange › Auto layout** | Top to bottom · Bottom to top · Left to right · Right to left |

### Toolbar

From the left the toolbar buttons fall into these groups. Pointing at a button shows its name and shortcut.

| Group | Buttons |
|---|---|
| File | **New project** · **Open…** · **Save** · **Export as picture…** (the ▾ next to it is the **Choose an export format** menu) |
| Undo | **Undo** · **Redo** (pointing at them shows what they would undo or redo) |
| Clipboard | **Cut** · **Copy** · **Paste** · **Delete from model** |
| Tools | **Pointer** · **Add diagram** |
| Colour and line | **Fill color** · **Line color** (the left half paints the last colour at once, the ▾ opens the colour picker) · **Line style** |
| Arrange | **Align** · **Auto layout** |
| Zoom | − · the zoom box · + · **Fit diagram** |
| Model tools | **Generate code…** · **Reverse engineer (code → model)** · **Validate model** |
| Panels | **Toolbox** · **Model Explorer & editors** (show or hide) |
| Right end | **Tutorial** (graduation cap) · the theme button (a random theme on every click, ▾ for **Choose theme**) · the flag button (**Switch language**) · **Settings…** · **About…** (ⓘ) |

Type a number in the zoom box, or step it with the Up and Down arrow keys.

### The diagram tab row

Only one project is open at a time. The row above the diagram starts with the project name; a ● after it means there are unsaved changes (pointing at it shows the file path). After it come **one tab for every diagram of the project**, in model order, and a **+** at the end that opens the **Add diagram** menu. Only when the tabs do not fit, ‹ › (**Scroll tabs left** · **Scroll tabs right**) appear at the right end to scroll the row. See [Diagram tabs](#diagram-tabs) for how to use them.

The two rows under it are the **diagram type tabs**: pick a group in the upper row and a diagram type in the lower row (see [Diagram type tabs](#diagram-type-tabs)).

**File › Close project** (`Ctrl+W`) closes the project and goes back to the start page.

### Toolbox (left)

The tools for the kind of diagram that is open show in groups. See [Drawing](#drawing) for how to use them. When no diagram is open, only the hint "Open a diagram to see its tools here." shows.

### Model Explorer and editors (right)

The **Model Explorer** at the top right shows every element of the project as a tree, and the editors below have the **Properties** · **Style** · **Documentation** · **Tags & constraints** tabs for the selected element. See [Models and diagrams](#models-and-diagrams).

### Collapsing the panels

![The panels](docs/tutorial/images/12-toolbox.jpg)

The toolbox and the right panel collapse with the arrow buttons in their headers (**Collapse tool panel** · **Collapse properties panel**), with the panel buttons on the toolbar, or with `Ctrl+Shift+1` · `Ctrl+Shift+2`. A collapsed panel becomes a narrow strip with only an icon and a title ("Tools" · "Model"), and the **Expand** button at its top opens it again. The collapsed toolbox strip still holds the pointer and a few common tools, ready to use.

### Status bar

| Item | Contents |
|---|---|
| Notice | The result of the last action ("Saved {name}.", "Undo: …" and so on). Normally **Ready** |
| Current diagram | The name of the current diagram |
| Save state | **Saved** or **Modified**. Pointing at it shows the file path ("Project not saved yet") |
| Selection | With one view selected, its kind, position and size (for example "Class · 380, 40 · 160 × 120"); with several, "N selected"; with nothing, "N views" |
| Pointer position | Diagram coordinates |
| Drawing tool | Shows only while a tool is chosen. Clicking it goes back to the pointer |
| Model validation | "N errors · N warnings" after a validation. Clicking it opens the validation results |
| Theme · language | The current theme name and language |
| Zoom | A zoom slider and %, and the **Fit diagram** button |
| Clock | The current time (**Settings › General › Clock on the status bar**) |

Right-clicking the status bar offers hide the bar · zoom · theme · language.

### Right-click menus

| Where | Menu |
|---|---|
| An element (view) | Edit (`F2`) · Add related element ▸ · add members such as attributes and operations · Cut · Copy · Paste · Duplicate · Delete from diagram · Delete from model · Select in Model Explorer · Stereotype display ▸ · Display ▸ · Auto resize · Fit to content · Font ▸ · Fill color · Line color · Order ▸ |
| A line (relationship) | Edit · Cut · Copy · Paste · Duplicate · Delete from diagram · Delete from model · Select in Model Explorer · Line style ▸ · Font ▸ · Fill color · Line color · Order ▸ |
| Several selected | Cut · Copy · Duplicate · Delete from diagram · Delete from model · Align & distribute ▸ · Order ▸ · Auto layout ▸ · Font ▸ · Fill color · Line color · Line style ▸ |
| An empty part of the diagram | Paste (where you clicked) · Select all · Add here · Show all relationships · Auto layout ▸ · Zoom in · Zoom out · Fit diagram · Show ▸ · Export as picture… · Export SVG (current diagram)… |
| Model Explorer | Open diagram · Add element · Add diagram · Rename · Select in diagram · Copy · Cut · Paste · Move up in model · Move down in model · Delete from model · Generate code… · Export model fragment (.mfj)… |
| A diagram tab | Rename · Select in Model Explorer · Previous diagram · Next diagram · Export as picture… · Export SVG (current diagram)… · Mermaid (.mmd)… · PlantUML (.puml)… |
| A text box | Undo typing · Cut · Copy · Paste · Select all |

### Pop-up windows

Menus, the colour picker, settings, find, code generation, print preview and similar windows open as separate small windows in the desktop app. `Esc` closes a menu, and the arrow keys move between its items. Long tasks (opening, saving, building a PDF, generating code and so on) show a progress window.

## Models and diagrams

### Model and views

The most important idea in MyUMLMaker is the difference between the *model* and its *views*. A box on a diagram is a "view" of a model element. The same element can show on several diagrams, and renaming it in one place renames it on every diagram.

| Action | Result |
|---|---|
| `Delete` (**Delete from diagram**) | Removes only the view on this diagram. The element stays in the model and still shows in the Model Explorer |
| `Ctrl+Delete` (**Delete from model**) | Removes the element from the model. Its views on every diagram and the relationships that need it go too |

Before **Delete from model** a confirmation lists the elements to be deleted (it can be turned off with **Settings › General › Ask before deleting elements from the model**). Notes, texts, rectangles and other annotations are views only, not model elements, so both ways of deleting do the same.

**Model › Elements not on any diagram** lists the elements that show on no diagram; clicking one goes to it. **Model › Model statistics** shows the number of elements, views and diagrams and the counts per kind.

### Model Explorer

![The Model Explorer](docs/tutorial/images/07-explorer.jpg)

Every element of the project shows as a tree: models, packages, classes with their attributes and operations, relationships and diagrams. A relationship without a name shows its kind and both ends, like "(Association) Customer → Order".

| Action | What it does |
|---|---|
| Click | Selects the element, and also its view on the current diagram. The editors show the element's properties |
| `Ctrl`+click | Selects several elements |
| Double-click | Opens a diagram; renames any other element |
| `F2` | Rename (`Enter` applies, `Esc` cancels) |
| Up / Down arrow | Move the selection. Right expands, Left collapses |
| `Enter` | Opens the diagram |
| `Delete` | Delete from model |
| Drag onto another row | Moves the element into that one (for example a class into another package). Where it cannot go: "It cannot be moved there." |
| Drag onto a diagram | Makes a view of the element on that diagram (see [Dragging from the Model Explorer](#dragging-from-the-model-explorer)) |
| `Ctrl+Up` · `Ctrl+Down` | Change the order within the same parent (**Move up in model** · **Move down in model**) |

Above the tree are these tools:

- The **Filter model** box narrows the tree by name or kind. Only the matching elements and their parents stay, all expanded.
- **Sort by name** groups diagrams, members, elements and relationships, then sorts each group by name.
- **Expand all** · **Collapse all**

The **Add diagram** · **Add element** buttons in the panel header put a new diagram or element under the selected element. The add-element menu shows only the kinds the selected element can own; when there are many, they are grouped into submenus such as Classifiers · Behaviours · Instances · Packages & models. A new element is ready to be renamed straight away.

![Model and views](docs/tutorial/images/08-modelView.jpg)

### Adding diagrams

Choose one from **Model › Add diagram**, **Add diagram** on the toolbar, or **+** in the Model Explorer header or at the end of the diagram tab row. The menu is grouped into UML · ERD · Flowchart · Data flow · SysML · BPMN · C4 · Mind map · Wireframe · Cloud (29 kinds, see [Kinds of diagrams](#kinds-of-diagrams)).

A new diagram is made under the package or model selected in the Model Explorer (else in the package of the current diagram) and opens at once. Owners that some kinds need are made automatically: sequence, communication and timing diagrams go inside an interaction, state machine diagrams inside a state machine, activity and interaction overview diagrams inside an activity, and ER diagrams inside a data model.

The **+** (**Add another {type}**) at the end of the [diagram type tabs](#diagram-type-tabs) makes one more diagram of the current diagram's type.

### Diagram tabs

![Diagram tabs](docs/tutorial/images/09-workingDiagrams.jpg)

The row above the diagram has one tab for every diagram of the project, in the same order as the Model Explorer. The tab of the current diagram is highlighted, and pointing at a tab shows its name and type.

- Clicking a tab opens that diagram. Double-clicking a diagram in the Model Explorer does the same.
- `Ctrl+Tab` · `Ctrl+Shift+Tab` or `Ctrl+PageDown` · `Ctrl+PageUp` (**Next diagram** · **Previous diagram**) go to the next or previous tab.
- Double-clicking a tab renames it in place.
- Right-clicking a tab offers **Rename** · **Select in Model Explorer** · **Previous diagram** · **Next diagram** and the exports (picture · SVG · Mermaid · PlantUML).
- **+** at the end opens the **Add diagram** menu.
- When the tabs do not fit, ‹ › (**Scroll tabs left** · **Scroll tabs right**) appear at the right end. Opening another diagram scrolls the row so that its tab shows.
- To remove a diagram, use **Delete from model** in the Model Explorer; the tabs have no close button.

### Diagram type tabs

Under the diagram tab row are the two rows of **diagram type tabs**.

| Row | Contents |
|---|---|
| Upper row (**Diagram groups**) | UML Structure · UML Behavior · ER · Flowchart · Data Flow · SysML · BPMN · C4 · Mind Map · Wireframe · Cloud |
| Lower row (**Diagram types**) | The diagram types of the chosen group. For example UML Structure has Class · Package · Object · Composite Structure · Component · Deployment · Profile, UML Behavior has Use Case · Activity · Statechart · Sequence · Communication · Timing · Interaction Overview · Information Flow, SysML has Requirement · Block Definition · Internal Block · Parametric, and Cloud has AWS · Azure · GCP |

- Clicking a group switches the lower row to its types. Opening a diagram picks its group by itself.
- The number next to a type is how many diagrams of that type the project has.
- Clicking a type opens the diagram of that type you used last (else the first one), or makes a new one when the project has none yet (the tooltip says **Open the {type}** or **Create a {type} (none yet)**).
- The **Toolbox** then shows just the tools of that diagram type.
- **+** at the end of the lower row (**Add another {type}**) adds one more diagram of the current type.

![Diagram type tabs](docs/tutorial/images/11-diagramTypes.jpg)

### Editors

![The editors](docs/tutorial/images/11-editors.jpg)

The editors under the Model Explorer edit the selected element: the element of the view selected on the diagram, the element picked in the Model Explorer, or, with nothing selected, the current diagram (the project when there is no diagram). Every change is one undo step. Text fields apply on `Enter` or when you move elsewhere.

| Tab | Contents |
|---|---|
| **Properties** | All fields of the element: name, stereotype, visibility, flags such as abstract, leaf and final, type, multiplicity, default value, references to other elements and so on. The **Qualified name** (package path) shows at the top |
| **Style** | Colours, font, line style and display options of the selected view (see [Format and arrange](#format-and-arrange)) |
| **Documentation** | A description of the element. It goes into the HTML and Markdown documentation and into comments of the generated code |
| **Tags & constraints** | Tagged values and constraints |

The **Properties** tab has these parts:

- **General** — the fields for the kind of element. Type fields suggest the class names of the project and basic types (int · long · String · boolean · Date …); the type field of an ER column suggests SQL types (INTEGER · VARCHAR · TIMESTAMP …). The stereotype field suggests standard names such as entity · control · boundary · service. Reference fields (for example the element a lifeline represents, or the signature of a message) only accept elements of the right kind, and the **Go to this element** button next to them goes to that element. Multiplicity must look like `1`, `0..1`, `0..*`, `1..*` or `2..5`.
- **End 1 (tail)** · **End 2 (head)** — the two ends of relationships such as associations: name, visibility, navigability, aggregation (shared or composite), multiplicity, qualifiers, derived, read-only and so on.
- **Members** — lists of attributes · operations · parameters · literals · columns · operands · ports · parts · slots · regions · time segments and so on. **+** in the header adds one, and each row has **Move up** · **Move down** · **Delete** buttons. Clicking a member's name selects it to edit its properties (pick an operation to edit its parameters in turn).
- **Shown on diagrams** — the diagrams that show this element. Clicking one opens that diagram and selects the element.
- **Diagram options** — when a diagram is selected. Sequence and communication diagrams have **Show sequence numbers** and **Message signature** (none · names only · types only · name and type), and sequence diagrams have **Show activations**. The number of **Views** shows too.

**File › Project properties** shows the project itself (name · author · company · copyright · version) in the editors.

On the **Tags & constraints** tab, **Add tag** adds a name, a kind (String · Boolean · Number · Reference · Hidden) and a value, and **Add constraint** adds a name and a specification (for example `age >= 0`). Tags that are not hidden show on the diagram as `{name=value}`.

## Drawing

### Toolbox

![The toolbox](docs/tutorial/images/12-toolbox.jpg)

The toolbox shows the tools for the kind of the current diagram. Changing the type on the [diagram type tabs](#diagram-type-tabs) changes the toolbox to that type's tools. The diagram kind is at the top, with the **Find a tool** box and the **Pointer** tool under it. Clicking a tool group header (for example Classes · Relationships · Annotations) collapses or expands it; the number next to the header is the number of tools. The **Icons only** button in the header hides the names and packs the icons closely.

| Kind of tool | How to use it |
|---|---|
| Element tools | Click the tool, then click the diagram for the default size, or drag for a size of your own. You can also drag the tool onto the diagram |
| Relationship tools | Drag from one element to another |

- After creating, the pointer comes back. Hold `Shift` while creating, or double-click the tool, to keep the tool and make several of the same.
- `Esc` or `Ctrl+1` goes back to the **Pointer**. Clicking the tool name on the status bar does too.
- Every diagram has the **Annotations** group: Note · Note Link · Text · Constraint · Frame · Rectangle · Rounded Rectangle · Ellipse · Hyperlink · Image · Free Line.

### Creating elements

![Creating a class](docs/tutorial/images/13-createClass.jpg)

A new class is ready for its name straight away. `Enter` applies and `Esc` cancels. Double-clicking an empty spot (or right-click › **Add here**) shows a menu of elements to add at that spot.

Members such as attributes and operations must be put inside an element that can own them. Dropped on an empty spot, they give the notice "Drop the Attribute inside an element that can own it (for example a class)." An element put inside a container such as a package, subject, node or partition also becomes part of it in the model.

### Quick edit

![Quick edit](docs/tutorial/images/14-quickEdit.jpg)

Double-clicking a class (including interfaces, data types, signals, enumerations and entities), or pressing `F2` or `Enter`, edits its name, attributes and operations as text in one go (StarUML's quick edit). The first line is the name, then after a `--` line the attributes, then after another `--` the operations, one per line. `Ctrl+Enter` applies and `Esc` cancels.

```
«entity» Order
--
-id: long {id}
-orderedAt: DateTime
-status: OrderStatus = NEW
+lines: OrderLine [1..*] {ordered}
--
+total(): Money {query}
+cancel()
+addLine(in product: Product, quantity: int = 1): OrderLine
```

| Write | Meaning |
|---|---|
| `+` · `-` · `#` · `~` | public · private · protected · package visibility |
| `/name` | A derived attribute |
| `name: Type` | The type. If the project has exactly one class of that name, it becomes a reference to that class |
| `[0..*]` | Multiplicity |
| `= 1` | Default value |
| `{readOnly}` · `{ordered}` · `{unique}` · `{id}` | Read-only · ordered · unique · identifier |
| `op(a: int, out b: String): bool` | An operation with parameters (`in` · `out` · `inout`) and a return type |
| `{query}` · `{abstract}` | Query (does not change state) · abstract operation |
| `«stereotype» Name` or `<<stereotype>> Name` | Stereotype |

Members are matched line by line, so renaming an existing attribute keeps its other settings and links.

For other elements:

- **Enumeration** — write the literals under `--`, one per line.
- **Entity** (ER) — write the columns under `--` like `PK id: INTEGER`, `FK customer_id: INTEGER`, `name: VARCHAR(100)`.
- **Combined Fragment** — write the guards of the operands, one per line. More lines add operands.
- **Message** — writing `getItems(id)` splits it into the name and the arguments.
- **Constraint** · **State Invariant** · BPMN **Text Annotation** — write the specification or text.
- **Note** · **Text** · shapes — write text over several lines (`Ctrl+Enter` applies).
- Other elements and lines — write the name. `«stereotype» name` works too.

### Quick buttons

![Quick buttons](docs/tutorial/images/15-quickButtons.jpg)

When one element is selected, small buttons show under it. A class has **Add attribute** · **Add operation** · **Add related**; an enumeration has **Add literal**, an entity **Add column**, an object **Add slot**, a combined fragment **Add operand**, and a timing lifeline **Add time segment**. Adding a member opens quick edit at once. Turn the buttons off with **View › Show › Quick edit buttons** or in **Settings › Diagram**.

### Adding related elements

![Adding related elements](docs/tutorial/images/17-addRelated.jpg)

**Add related** (▾) among the quick buttons, or right-click › **Add related element**, makes a new element next to the selected one and links them with a relationship. The new element is ready for its name straight away.

| Selected element | Related elements you can add |
|---|---|
| Class | Subclass · Superclass · Associated class · Directed associated class · Aggregated (part) class · Composite (part) class · Dependent class · Realized interface |
| Interface | Realizing class · Superclass · Subclass · Dependent class |
| Use case | Included use case · Extending use case · Associated actor |
| Actor | Associated use case · Subclass · Superclass |
| State | Next state |
| Action | Next action |
| Mind map node | Child node |
| Entity | Referencing entity (1:N) |
| Flowchart process, decision, terminator and data | Next step |

### Drawing relationships

![Relationships](docs/tutorial/images/16-relationships.jpg)

Choose a relationship tool (association · directed association · aggregation · composition · dependency · generalization · interface realization …) and drag from one element to another. While you drag, the element under the pointer is outlined, and an element that this relationship cannot connect to is marked red. Starting on an empty spot gives "Start a relationship on an element and drag to another.", and releasing on an empty spot gives "Release over the element to connect to."

- **Note Link** and **Association Class Link** can also attach to a line (relationship).
- On a sequence diagram a message is placed at the height where the drag started; released on the same lifeline it becomes a self message.
- On a communication diagram, the **Message (on a connector)** tool adds a message in that direction when you click a connector.

### Working with lines

A selected line shows square handles at both ends, filled handles at its bend points and a white circle in the middle of each segment.

| Action | Result |
|---|---|
| Drag an end handle onto another element | Reconnects that end to the other element. The end of the relationship in the model changes too |
| Drag the circle in the middle of a segment | Makes a bend point there |
| Drag a bend point | Moves the bend point |
| Double-click a bend point | Removes that bend point |
| **Format › Line style › Clear bend points** | Removes all bend points added by hand |
| Double-click the line | Edits the line's name (label) |

### Moving and resizing

![Moving and resizing](docs/tutorial/images/18-moveResize.jpg)

- **Selection** — click to select; with `Shift` or `Ctrl` held, a click adds to or removes from the selection. Dragging on an empty spot picks the views that lie entirely inside the rectangle (with `Shift` or `Ctrl` it adds to the selection). `Ctrl+A` selects all and `Esc` clears the selection.
- **Move** — drag to move. Positions snap to the grid (hold `Alt` not to snap), and `Shift` keeps the move horizontal or vertical. The arrow keys move by the grid, `Shift`+arrow by 1 pixel. Dragging to the edge of the window scrolls the view.
- **Container** — moving a container such as a package, subject, node, partition or frame moves the elements inside it too. Putting an element inside a package also moves it into that package in the model (**Settings › Diagram › Dropping into a package moves the element in the model**).
- **Size** — drag one of the eight handles of the selected view. Resizing by hand turns **Auto resize** off.
- **Locked (cannot move)** — a view with this style option on cannot be moved, resized or renamed.

### Dragging from the Model Explorer

![Dragging from the Model Explorer](docs/tutorial/images/19-dragFromExplorer.jpg)

Dragging an element from the Model Explorer onto a diagram makes a view of it, and its relationships with the elements already on the diagram show too. Several elements can be picked and dropped together. An element that is already on the diagram is not made again, only selected. A class dropped on a sequence diagram becomes a lifeline that represents the class. Dropping a diagram opens that diagram.

**Model › Show all relationships** draws every relationship between the elements on the diagram that does not show yet.

### Cut, copy and paste

- Copying on a diagram copies the selected views and their elements, together with the lines between the copied elements. Paste makes new elements (numbered when the name is taken) and views, slightly offset. Right-click › **Paste** pastes where you clicked.
- **Cut** on a diagram copies and then removes the views from the diagram.
- Copying in the Model Explorer copies only the elements, and paste puts them inside the element selected in the explorer. Cut in the explorer deletes from the model.
- **Duplicate** (`Ctrl+D`) copies and pastes in one step.
- The names of the copied elements also go to the system clipboard as text, so they can be pasted into other programs.

### Undo and redo

![Undo](docs/tutorial/images/21-undo.jpg)

Every edit can be taken back with **Undo** (`Ctrl+Z`) and **Redo** (`Ctrl+Y` or `Ctrl+Shift+Z`). Dragging, a quick edit, a property change, an auto layout and so on are one step each. Pointing at the toolbar buttons shows what they would undo, like "Undo: Move", and the status bar says what was undone. The undo history belongs to the open project and starts afresh when another project is opened.

## Kinds of diagrams

MyUMLMaker draws 29 kinds of diagrams. They all work the same way (toolbox, quick edit, dragging relationships, editors), and the toolbox shows the tools that fit each kind.

### The 15 UML diagrams

| Diagram | Toolbox |
|---|---|
| **Class Diagram** | Package · Class · Interface · Signal · Data Type · Primitive Type · Enumeration / Association · Directed Association · Aggregation · Composition · Dependency · Generalization · Interface Realization · Realization · Template Binding · Containment · Association Class Link |
| **Package Diagram** | Package · Model · Subsystem · Profile / Dependency · Import · Merge · Containment · Generalization |
| **Object Diagram** | Object · Class · Package / Link · Dependency |
| **Composite Structure Diagram** | Class · Part · Port · Collaboration · Collaboration Use · Interface / Connector · Dependency · Realization · Usage |
| **Component Diagram** | Component · Interface · Interface (Icon) · Port · Artifact · Class · Package / Dependency · Required Interface (Usage) · Provided Interface · Component Realization · Assembly Connector · Delegation Connector · Generalization · Manifestation |
| **Deployment Diagram** | Node · Device · Execution Environment · Node Instance · Artifact · Artifact Instance · Component · Component Instance / Communication Path · Deployment · Manifestation · Dependency · Generalization |
| **Profile Diagram** | Profile · Stereotype · Metaclass · Enumeration · Data Type / Extension · Generalization · Dependency |
| **Use Case Diagram** | Actor · Use Case · Subject · Package / Association · Directed Association · Generalization · Include · Extend · Dependency |
| **Sequence Diagram** | Lifeline · Actor Lifeline / Synch, Asynch, Reply, Create and Delete Message · Signal · Lost/Found Endpoint · Gate / 12 combined fragments · Interaction Use · State Invariant · Continuation · Duration Constraint · Time Constraint |
| **Communication Diagram** | Lifeline · Actor Lifeline / Connector · Message (on a connector) |
| **Timing Diagram** | Timing Lifeline · Time Tick · Duration Constraint · Time Constraint / Message |
| **Interaction Overview Diagram** | Initial Node · Activity Final · Decision · Merge · Fork · Join · Interaction Use · Interaction Frame / Control Flow |
| **Information Flow Diagram** | Class · Information Item · Actor · Component / Information Flow · Dependency · Association |
| **Statechart Diagram** | State · Composite State · Submachine State · Final State · Initial State · Choice · Junction · Fork · Join · Shallow History · Deep History · Entry Point · Exit Point · Terminate / Transition |
| **Activity Diagram** | Action · Call Behavior · Call Operation · Send Signal · Accept Event · Time Event · Object Node · Central Buffer · Data Store · Input Pin · Output Pin / Initial Node · Activity Final · Flow Final · Fork · Join · Decision · Merge / Vertical Partition · Horizontal Partition · Structured Node · Expansion Region · Interruptible Region / Control Flow · Object Flow · Exception Handler |

### Use case diagram

![Use case diagram](docs/tutorial/images/22-useCase.jpg)

Place actors, use cases and the subject (system boundary), and link them with association, include («include»), extend («extend») and generalization. A use case's **Extension points** are added in the member list of the Properties tab. Use cases inside a subject move with it.

### Sequence diagram

![Sequence diagram](docs/tutorial/images/23-sequence.jpg)

Draw synchronous, asynchronous, reply, create and delete messages between lifelines; numbers and activation bars are added automatically. A lifeline that receives a create message starts at that height, and one that receives a delete message ends there with an ×.

- Select a message and drag its round middle handle (or the message itself) up or down to change the order.
- In a message's properties set **Message sort**, **Signature (operation)** (an operation of the receiving class), **Arguments**, **Assignment target** and **Guard**. With a signature set, the operation shows instead of the message name.
- **Show sequence numbers** · **Message signature** · **Show activations** in the diagram options change how it looks.
- Setting what a lifeline **Represents** (a role, that is an attribute) shows "name: Type" in its head.

### Combined fragments

![Combined fragments](docs/tutorial/images/24-fragments.jpg)

There are 12 combined fragments (alt · opt · loop · par · break · critical · neg · strict · seq · ignore · consider · assert), interaction uses (ref), state invariants, continuations, endpoints and gates. Double-clicking a fragment edits the guards of its operands, one per line, and **Add operand** among the quick buttons adds operands. **Refers to** of an interaction use points at another interaction.

### State machine diagram

![State machine diagram](docs/tutorial/images/25-stateMachine.jpg)

There are states (with **Entry activity** · **Do activity** · **Exit activity**), composite states, submachine states, and the initial, final, choice, junction, fork, join, shallow history, deep history, entry point, exit point and terminate pseudostates. A transition with **Triggers**, **Guard** and **Effect** shows as "trigger [guard] / effect". The transition **Kind** is external · internal · local. A state put inside a composite state goes into that state's region.

### Activity diagram

![Activity diagram](docs/tutorial/images/26-activity.jpg)

There are actions and call behavior, call operation, send signal, accept event and time event actions, decision, merge, fork and join, object nodes with input and output pins, swimlanes (partitions), and structured, expansion and interruptible regions. A **Guard** on a control flow or object flow shows as `[guard]`. Partitions come vertical and horizontal, and actions inside them move with them.

### Component and deployment diagrams

![Component diagram](docs/tutorial/images/27-component.jpg)

A component diagram has components, interfaces (lollipop icon), ports and artifacts with provided / required interfaces and assembly and delegation connectors. The **Interface (Icon)** tool draws an interface as a circle (lollipop), and any interface can be switched to that with **Format › Stereotype display › Icon (interface lollipop)**.

![Deployment diagram](docs/tutorial/images/28-deployment.jpg)

A deployment diagram deploys artifacts on nodes, devices and execution environments, linked by communication paths. Elements inside a container such as a node move with it.

### Other UML diagrams

- **Object Diagram** — set an object's **Classifier** and add "attribute = value" with **Add slot**. Objects are linked with links.
- **Composite Structure Diagram** — place parts and ports inside a larger class and link them with connectors.
- **Package Diagram** and **Profile Diagram** — draw imports and merges between packages, and stereotypes extending metaclasses.
- **Communication Diagram** — link lifelines with connectors and put messages on the connectors. The numbering is automatic.
- **Timing Diagram** — set the **States (comma separated)** of a timing lifeline and chain states and durations with **Add time segment**.
- **Interaction Overview Diagram** — link interaction uses and interaction frames with control flows.
- **Information Flow Diagram** — draw information items flowing as **Conveyed** items.

### ER diagram

![ER diagram](docs/tutorial/images/29-erd.jpg)

Draw entities with columns (PK, FK, type, length) and relationships in crow's-foot notation. The relationship tools are One to Many · One to One · One to Zero or One · Many to Many · Non-identifying One to Many. Columns have **Primary key (PK)**, **Foreign key (FK)**, **References column**, **Nullable**, **Unique** and **Default value**, and entities have the **Weak entity** flag. **Tools › Generate SQL DDL…** writes MySQL, PostgreSQL, SQLite, SQL Server and Oracle scripts (see [Code generation](#code-generation)).

### Flowchart and data flow

- **Flowchart Diagram** — the Process · Terminator · Decision · Delay · Predefined Process · Alternate Process · Data · Document · Multi-Document · Preparation · Display · Manual Input · Manual Operation · Card · Punched Tape · Connector · Off-Page Connector · Or · Summing Junction · Collate · Sort · Merge · Extract · Stored Data · Database · Direct Access Storage · Internal Storage symbols and flows. The name of a flow ("Yes" · "No") shows on the line.
- **Data Flow Diagram** — External Entity · Process · Data Store and Data Flow.

### The 4 SysML diagrams

| Diagram | Toolbox |
|---|---|
| **SysML Requirement Diagram** | Requirement · Block · Use Case · Package / Derive · Satisfy · Verify · Refine · Trace · Copy · Containment |
| **SysML Block Definition Diagram** | Block · Interface Block · Value Type · Constraint Block · Enumeration · Actor · Package / Association · Directed Association · Aggregation · Composition · Generalization · Dependency · Interface Realization |
| **SysML Internal Block Diagram** | Block · Part Property · Port · Actor / Connector · Item Flow · Dependency |
| **SysML Parametric Diagram** | Constraint Block · Constraint Property · Constraint Parameter · Part Property / Connector |

Requirements have fields such as ID, text, risk and verification method.

### BPMN, C4, mind map, wireframe and cloud

![Other diagrams](docs/tutorial/images/30-others.jpg)

- **BPMN Diagram** — Pool · Lane (swimlanes); Task and User, Service, Script, Manual, Send, Receive and Business Rule tasks; Sub-Process · Call Activity; start, intermediate, boundary and end events (message, timer, signal, error, terminate and so on); exclusive, parallel, inclusive, event-based and complex gateways; Data Object · Data Store · Text Annotation · Group; Sequence Flow · Message Flow · Association · Data Association.
- **C4 Diagram** — Person · External Person · Software System · External System · Container · Container (Database) · Component, Boundary · Deployment Node, and Relationship. Elements take a **Description** and a **Technology**, and relationships take a **Technology** (for example HTTPS).
- **Mind Map Diagram** — mind map nodes and branches. **Add related › Child node** among the quick buttons grows branches quickly. A node's **Direction** (auto · left · right) can be set.
- **Wireframe Diagram** — Desktop Frame · Web Frame · Mobile Frame · Panel frames and the Button · Text · Link · Input · Text Area · Checkbox · Radio · Switch · Dropdown · Slider · Tabs · Image · Avatar · List · Table · Divider · Progress · Icon widgets. Widgets have **Checked** · **Disabled** · **Items (comma separated)** fields.
- **AWS Diagram** · **Azure Diagram** · **GCP Diagram** — groups such as cloud, region, VPC and subnet, service tiles (coloured by category: compute · storage · database · network · security · analytics · integration · ML · management · developer tools · users) and connections. AWS, for example, has EC2 · Lambda · S3 · RDS · DynamoDB · CloudFront · API Gateway · IAM · SQS and more. The tiles are pictures drawn by MyUMLMaker; no company logos are used.

## Format and arrange

### Style

![Style](docs/tutorial/images/31-style.jpg)

The **Style** tab of the editors sets how the selected views look (its header reads "View style (N)"). With several views selected, a change applies to all of them.

| Item | Contents |
|---|---|
| **Fill colour** · **Line colour** · **Font colour** | Open the colour picker. ✕ (**Reset**) goes back to the colour of the diagram colours |
| **Font** · **Font size** | A font and size (9–32px) for this view alone. Left empty, the font of **Settings › Diagram** is used |
| **Font style** | Bold · Italic |
| **Line width** | 1 · 1.5 · 2 · 3 · 4px |
| **Line style** | For lines: Default (settings) · Rectilinear · Oblique · Rounded rectilinear · Curve |
| **Stereotype display** | Label («…») · Decoration · Icon (interface lollipop) · None |
| **Shadow** · **Auto resize** · **Wrap the name** · **Locked (cannot move)** | Display of element views |
| Classifier display | **Suppress attributes** · **Suppress operations** · **Suppress receptions** · **Suppress literals** · **Show visibility (+ - # ~)** · **Show namespace** · **Show operation signature** · **Show property strings {…}** · **Show types** · **Show multiplicity** |
| Line display | **Show visibility** · **Show multiplicity** · **Show × on non-navigable ends** · **Locked (cannot move)** |
| **Clear all style** | Removes every style given to this view |
| **Fit to content** | Shrinks or grows the view to fit its text |

The same commands are in the **Format** menu and the right-click menu: **Format › Font** (Bold `Ctrl+B` · Italic `Ctrl+I` · Increase font size `Ctrl+Shift+>` · Decrease font size `Ctrl+Shift+<` · Font colour), **Format › Display**, **Format › Stereotype display**, **Auto resize** (the size follows when the text changes) and **Fit to content** (fits once).

### Colours

![Colours](docs/tutorial/images/32-colors.jpg)

The **Fill color** · **Line color** buttons on the toolbar change the colours of the selected views. The left half of a button paints the last colour, shown in the bar under it, at once; the ▾ opens the colour picker. The colour picker has 12 **Soft colours** and 18 **Standard colors**, **None** (back to the diagram colours) and **More colors…** (the system colour picker).

### Line styles

![Line styles](docs/tutorial/images/33-lineStyle.jpg)

Lines are **Rectilinear** · **Oblique** · **Rounded rectilinear** · **Curve**. Select a line and change it with **Line style** on the toolbar, **Format › Line style** or the Style tab. Changing the style removes the bend points added by hand. The style of new lines is set in **View › Default line style** or **Settings › Diagram › Default line style**, and lines whose style is **Default (settings)** follow that setting.

### Order

The front-to-back order of overlapping views is changed in **Arrange › Order**: **Bring to front** (`Ctrl+Shift+F`) · **Send to back** (`Ctrl+Shift+K`) · **Bring forward** · **Send backward**.

### Align and distribute

![Align](docs/tutorial/images/34-align.jpg)

Select two or more views and use **Align** on the toolbar or **Arrange › Align & distribute**.

| Command | What it does |
|---|---|
| **Align left** · **Align center** · **Align right** | Lines up the horizontal positions |
| **Align top** · **Align middle** · **Align bottom** | Lines up the vertical positions |
| **Distribute horizontally** · **Distribute vertically** | Evens out the gaps between three or more |
| **Same width** · **Same height** · **Same size** | Matches the sizes |

With only one view selected you get "Select two or more views.", and when distributing with only two, "Select three or more views."

### Auto layout

![Auto layout](docs/tutorial/images/35-layout.jpg)

Pick a direction from **Auto layout** on the toolbar or **Arrange › Auto layout**: **Top to bottom** · **Bottom to top** · **Left to right** · **Right to left**. A layered layout rearranges the elements, with parents of an inheritance on top (the first row). With two or more views selected, only the selected views are rearranged. On a sequence diagram the lifelines and the message spacing are evened out. Afterwards the whole diagram is fitted into view and "Rearranged N views." shows. If you do not like it, `Ctrl+Z` takes it back.

### Zoom and pan

![Zoom and pan](docs/tutorial/images/36-zoom.jpg)

| How | What it does |
|---|---|
| `Ctrl`+wheel | Zoom in or out around the pointer (10%–800%) |
| `Ctrl+=` · `Ctrl+-` · `Ctrl+0` | Zoom in · Zoom out · Zoom 100% |
| `Ctrl+Shift+W` | Fit diagram |
| **View › Zoom › Zoom to selection** | Zooms so the selected views fill the screen |
| −, + and the zoom box on the toolbar, the slider on the status bar | Step by step or to any value |
| Drag with the middle button, `Space`+drag | Pan |
| Wheel · `Shift`+wheel | Scroll up and down · left and right |

The diagram is an endless canvas that grows by itself when you draw near its edge. The **Pan & zoom window** (minimap) at the bottom right shows the whole diagram and the visible part; clicking or dragging in it moves there. Turn it off with **View › Show › Pan & zoom window**. The grid is turned on and off with **View › Show › Grid**, and snapping with **Snap to grid**.

**Grid** — the grid is drawn as lines: a thin line every grid step and a darker, thicker line every 5 steps, so each large square is 5×5 cells. The colours follow the [diagram colours](#diagram-colours). The grid spacing (**Settings › Diagram › Grid size**, 5–40px) is in **screen pixels**, so the grid keeps the same spacing on the screen at every zoom level: zooming does not magnify the grid, it is redrawn finer (zoom in) or coarser (zoom out) on the page. Snapping to the grid and nudging with the arrow keys follow the visible grid lines (whole page units): with a 10px grid, positions snap every 5 page units at 200% and every 20 at 50%.

**Rulers** — rulers run along the top and left edges of the diagram. They show page coordinates, with numbers on the major grid lines, and mark where the pointer is. The spacing of the numbers adapts to the zoom (for example every 100 at 50% and every 25 at 200%). Turn them on and off with **View › Show › Rulers** or **Settings › Diagram › Rulers**.

Turning `Ctrl`+wheel outside the diagram (over a panel or menu) changes the size of the whole program screen (**Settings › Font › Zoom**, 50–200%).

## Model tools

### Model validation

![Model validation](docs/tutorial/images/37-validate.jpg)

**Model › Validate model** (`Ctrl+Shift+V`, **Validate model** on the toolbar) checks the model against about 20 rules. With no problems it says "The model has no problems."; otherwise the validation results window shows the numbers of errors and warnings and the list. Clicking an entry shows that element in the Model Explorer and on its diagram. The result also stays on the status bar as "N errors · N warnings". With **Settings › Diagram › Validate the model after each edit** on, the counts on the status bar are refreshed after every edit.

| Rule | Severity |
|---|---|
| Name is missing | Error |
| Duplicate name in the same namespace | Error |
| Generalization cycle | Error |
| Generalization between incompatible types | Error |
| Interface attribute should be static or read-only | Warning |
| Abstract operation in a non-abstract class | Error |
| Realization target is not an interface | Error |
| Association end has no reference | Error |
| Relationship end refers to a missing element | Error |
| Invalid multiplicity (n, n..m, *, n..*) | Error |
| Enumeration has no literals | Warning |
| Lifeline does not represent anything | Warning |
| Create message to the same lifeline | Error |
| Region has no initial pseudostate | Warning |
| Region has more than one initial pseudostate | Error |
| Final state has an outgoing transition | Error |
| Decision node has fewer than 2 outgoing flows | Warning |
| Entity has no primary key | Warning |
| Foreign key column has no referenced column | Warning |
| Diagram is empty | Warning |
| Reference to a missing element | Error |

### Find

![Find](docs/tutorial/images/38-find.jpg)

**Edit › Find…** (`Ctrl+F`) opens the **Find in model** window. Type in **Find what** and press **Find** to search the whole model by name, documentation, kind and type. The **Options** are **Match case** · **Whole words** · **Include documentation**. The results show the name, kind and qualified name (package path); clicking one expands and selects it in the Model Explorer and opens a diagram that shows it.

The **Filter model** box above the Model Explorer is a lighter way that narrows the tree at once.

### Code generation

![Code generation](docs/tutorial/images/39-codegen.jpg)

**Tools › Generate code…** (`Ctrl+Shift+G`) opens the **Generate code** window. As you choose the settings on the left, the files to be made and their contents show at once on the right ("N files").

| Item | Contents |
|---|---|
| **Language** | Java · C# · C++ · Python · TypeScript · Kotlin · PHP · SQL (DDL) |
| **Scope** | **Whole project**, or the element (package, class and so on) selected in the Model Explorer or on the diagram |
| **Output** | Desktop app: **Files in a folder** or **One ZIP file**. The web version makes a ZIP |
| Language options | **Indent spaces** · **Indent with tabs** · **Header comment** · **Header text** · **Documentation as comments** · **Getters and setters** (Java, C#, PHP) · **Collection type** (List · std::vector · list · array) · **TODO comments** · **Type hints** (Python, PHP) · **#pragma once** (C++) |
| SQL options | **SQL dialect** (MySQL / MariaDB · PostgreSQL · SQLite · SQL Server · Oracle) · **DROP TABLE first** · **Quote identifiers** · **Foreign key constraints** |

Pressing **Generate** asks for a folder (files in a folder) or a ZIP file name.

- Each class, interface, enumeration, data type and signal becomes one file (two for C++: `.h` and `.cpp`).
- Packages become folders, with the package or namespace declaration of the language.
- Inheritance, interface implementation, associations (navigable ends become fields, collections when the multiplicity is many), operations with parameters and return types go in, and the element's documentation becomes a doc comment.
- Type names are translated for the language (for example `String` becomes `string` in C#, `std::string` in C++ and `str` in Python).
- SQL makes tables, columns, primary keys and foreign keys from the ER data models in the scope. **Tools › Generate SQL DDL…** opens the same window with SQL chosen as the language.
- Right-click › **Generate code…** in the Model Explorer generates just that element.
- When there is nothing to generate from, it says "There are no classifiers to generate code from."

### Reverse engineering (code → model)

![Reverse engineering](docs/tutorial/images/40-reverse.jpg)

**Tools › Reverse engineer (code → model)** (`Ctrl+Shift+R`, the toolbar button, the start page) opens a menu of languages.

| Menu item | What it reads |
|---|---|
| Java (.java) | Packages, classes, interfaces, enumerations, fields, methods, constructors, extends and implements |
| C# (.cs) | Namespaces, classes, interfaces, enumerations, structs, fields, properties, methods |
| C++ (.h, .hpp, .hh, .hxx, .cpp, .cc, .cxx) | Namespaces → packages; classes, structs, unions and enumerations (`enum class` too); the `public:` · `protected:` · `private:` sections; fields (static, const → read-only), methods (pure virtual `= 0` → abstract) and constructors; base lists → generalization and realization. A class with only pure virtual methods becomes an interface. Collections such as `std::vector` and `std::array` get multiplicity `*`, pointers `0..1`, and smart pointers (`std::unique_ptr` and so on) become their target type |
| Python (.py, .pyi) | Module folders, classes, attributes, methods, type hints |
| TypeScript (.ts, .tsx, .mts, .cts) | Folders, classes, interfaces, enumerations, properties, methods |
| SQL (DDL) (.sql, .ddl) | `CREATE TABLE` → entities, columns, primary keys and foreign key relationships of an ER data model |
| **A whole folder (language detected)…** | Desktop app: finds all sources in a folder and reads the most common language |

Several files can be picked. The result goes into the model or package selected in the Model Explorer (else the first model). Packages, namespaces and folders become packages, inheritance and implementation become generalizations and interface realizations, and fields typed with a class that was read become navigable associations. Reading code makes a "Reverse Engineered" class diagram, and reading SQL an ER diagram, laid out automatically. Unresolved types and the like are listed in the **Reverse engineering warnings** window. Dropping source files on the window reverse engineers them too.

### Mermaid and PlantUML import

![Mermaid and PlantUML import](docs/tutorial/images/41-textImport.jpg)

**File › Import › Import Mermaid / PlantUML…** turns text into model elements and a diagram. Choose the **Format** (Mermaid · PlantUML), paste the text and press **Import**. The **Examples** buttons (Class · Sequence · Flowchart · ER · State) show what the format looks like.

| Format | Diagrams it can import |
|---|---|
| Mermaid | `classDiagram` · `sequenceDiagram` · `flowchart`/`graph` · `erDiagram` · `stateDiagram`/`stateDiagram-v2` |
| PlantUML | Class and sequence diagrams in `@startuml … @enduml` |

The imported elements and diagram go into the selected package (else the first model) and the diagram opens. Opening or dropping a `.mmd` · `.mermaid` · `.puml` · `.plantuml` · `.pu` file opens this window with its contents. Other kinds of Mermaid diagram give "This kind of Mermaid diagram cannot be imported (class, sequence, flowchart, ER and state only)."

The other way round, **File › Export › Mermaid (.mmd)…** · **PlantUML (.puml)…** write the current diagram as text. Mermaid exports class · sequence · flowchart · ER · state machine · use case · activity diagrams (use case and activity as flowcharts), and PlantUML exports class · use case · sequence · activity · state · component · deployment · ER diagrams.

## Files and export

### Saving

![Saving](docs/tutorial/images/42-save.jpg)

A project is saved as one `.myuml` file holding the model and all diagrams (in JSON). Files in the old `.muml` format still open; saving one asks for a `.myuml` file name.

| Command | What it does |
|---|---|
| **Save** (`Ctrl+S`) | Saves to the current file. New projects, templates and imported files ask for a file name |
| **Save as…** (`Ctrl+Shift+S`) | Saves under a new file name |
| **Save as template…** | Saves as a `.mumlt` template |

`Ctrl+Alt+S` (**Save all**) still works; with one project open it saves the project when it is modified.

With **Settings › Diagram › Auto save (saved files)** set to 1, 5, 10 or 30 minutes, files that have been saved once are saved again at that interval (desktop app). With **Settings › General › Reopen last files when starting** on, the files that were open are opened again on the next start. When a database is set up, saving also writes to the database (see [Database storage](#database-storage)).

### The File menu

![The File menu](docs/tutorial/images/43-fileMenu.jpg)

### Opening

**Open…** (`Ctrl+O`) opens `.myuml` (project, the old `.muml` too), `.mumlt` (template) and `.mdj` (StarUML project) files. Only one project is open at a time, so the opened file replaces the current project. When the current project has unsaved changes, the **Unsaved changes** window asks first: **Save** · **Don't save** · **Cancel**. When several files are picked, only the first one opens. Opening the file that is open now says "{name} is already open." Recent files, drag and drop and opening from the database replace the current project in the same way. Opening a template makes a new project with its contents (the template itself stays as it is), and opening a StarUML file makes an imported project that asks for a `.myuml` name when saved.

The installed desktop app is associated with `.myuml` and `.mumlt` files, so double-clicking them in Explorer or the Finder opens them at once. After installation `.myuml` files show their own MyUMLMaker project document icon labelled "MYUML".

### Templates

**File › Save as template…** saves the current project as `.mumlt`. Opening a template always makes a new, unnamed project, so it is a good starting point for new work holding the package structure, stereotypes and example diagrams you use often. A project made from a template shows a template icon next to its name at the start of the diagram tab row.

### Exchanging with StarUML

![StarUML compatibility](docs/tutorial/images/46-starUml.jpg)

- **File › Import › Open StarUML project (.mdj)…** (or **Open…**) opens the model and diagrams of a StarUML project as they are. MyUMLMaker's model uses the same element kinds and field names as StarUML, so the model carries over unchanged, and the diagram views are converted.
- **File › Export › StarUML project (.mdj)…** writes the current project as an `.mdj` that StarUML can open.

### Model fragments

A model fragment (`.mfj`) is a file holding one element (for example one package and everything in it); it can also be exchanged with StarUML.

- **File › Export › Export model fragment (.mfj)…** or right-click › **Export model fragment (.mfj)…** in the Model Explorer — saves the selected element as a fragment.
- **File › Import › Import model fragment (.mfj)…** — puts a fragment inside the element selected in the Model Explorer (the first model if it cannot go there). Opening or dropping an `.mfj` file works too.

### Exporting pictures

![Exporting pictures](docs/tutorial/images/44-exportImage.jpg)

**File › Export › Export as picture…** (the export button on the toolbar) opens the **Export as image** window. The last settings are remembered.

| Item | Choices |
|---|---|
| **File format** | PNG · JPEG · WebP · BMP · TIFF · SVG |
| **Background** | Transparent · White (JPEG has no transparency, so it gets white) |
| **Area** | Whole diagram · Selected views |
| **Scale** | 1× · 2× · 3× (SVG is a vector format and stays sharp at any scale) |
| **Quality** | The compression quality of JPEG and WebP (40–100%) |
| **Image size** | The pixel size of the picture to be made |

A transparent background lets you lay the picture straight over documents and slides. Also:

- **Export SVG (current diagram)…** — saves the current diagram (only the selected views, if any are selected) as SVG at once.
- **All diagrams as pictures (.zip)…** — makes every diagram of the project a 2× PNG and saves them numbered in one ZIP.
- **Export PDF (all diagrams)…** — saves a PDF with every diagram laid out by the print settings (paper, orientation, margins, header and footer).

Exports and printing use the **Diagram colours** and the default line style as they are.

### Exporting documentation

![Documentation and other formats](docs/tutorial/images/45-exportDocs.jpg)

- **HTML documentation (.html)…** — makes a single searchable HTML page. On the left is a tree of the model; on the right each element has its kind, qualified name, documentation, properties, members, relationships and the diagrams it shows on, and every diagram is embedded as SVG. A search box filters elements and diagrams, and light or dark colours follow the system setting. Being one file, it can be mailed or put on the web as it is.
- **Markdown documentation (.zip)…** — saves one Markdown document and the diagram SVG pictures (the `images/` folder) in one ZIP.

The titles and headings of the documents are made in the current language (Korean or English). The descriptions written on the **Documentation** tab of the editors go into the documents.

### Recent files and folders

The last 10 files and 10 folders are remembered.

- **File › Recent files…** (`Ctrl+R`) — the **Recent files and folders** window. The file and folder lists have **Open** (**Open from this folder**), a bin button (**Remove from the list**), and **Clear all** · **Clear all folders**.
- **File › Recent folders** — picking a folder opens the Open window in that folder.
- **File › Clear all recent files and folders** — clears both lists at once.
- Trying to open a file that is gone shows the **File not found** window: choose **Keep** or **Remove from the list**. In **Settings › Recent**, files that are gone are marked **Missing**.

### Drag and drop

Dragging a file onto the window shows the "Drop here to open" hint, and the dropped file is handled by its kind.

| Dropped | What happens |
|---|---|
| `.myuml` · `.muml` · `.mumlt` · `.mdj` | Opens as a project (replacing the current one) |
| `.mfj` | Imports the model fragment |
| `.mmd` · `.mermaid` · `.puml` · `.plantuml` · `.pu` | Opens the Mermaid / PlantUML import window with its contents |
| Java · C# · C++ · Python · TypeScript · SQL sources | Reverse engineers them |
| A picture file (PNG · JPEG · GIF · WebP · BMP · SVG and others) | Becomes the program background image |

In the web version, dropping Mermaid or PlantUML text also opens the import window.

### Printing and print preview

![Printing and print preview](docs/tutorial/images/47-print.jpg)

**File › Print…** (`Ctrl+P`) opens the **Print preview** window. Changing a setting on the left updates the preview on the right at once, and ‹ › at the bottom turn the pages. The settings are remembered for the next print and for PDF export.

| Tab | Items |
|---|---|
| **What to print** | **All pages** (all diagrams) · **Current page** (the current diagram) · **Page range** (the **First diagram**–**Last diagram** numbers), **To print** (N diagrams · N sheets) |
| **Paper** | **Paper** (A3 · A4 · A5 · B4 · B5 · Letter · Legal · Tabloid) · **Orientation** (Portrait · Landscape) · **Margins** (None · Narrow · Normal · Wide) · **Size** (Fit to sheet · Actual size · Percent) · **Scale** (10–400%) · **Center on the sheet** · **Print the diagram background** |
| **Header and footer** | **Header** and **Header text** (the project name when empty) · **Footer** and **Footer text** |

Printed at **Actual size** or a large scale, a big diagram is split over several sheets. **Print** opens the system print dialog.

## Database storage

The desktop app can save projects to a database as well as to files. A web browser cannot connect to a database server or an SQLite file directly, so the web version does not have this.

### Connection settings

Choose the **Database type** on the **Settings › Database** tab: **None** · SQLite · MariaDB · MySQL · PostgreSQL.

| Database type | What to enter |
|---|---|
| SQLite | The **SQLite file** (for example `C:\Data\myumlmaker.db`). Pick it with **Browse…** or give a new file name |
| MariaDB · MySQL · PostgreSQL | **Server (host)**, **Port** (3306 for MariaDB and MySQL, 5432 for PostgreSQL by default), **Database name** (letters, digits, `_`, `$` and `-` only), **User**, **Password** |

- With **Save the password in the settings** off, the password is not stored but only remembered until the program closes.
- **Test connection** tries to connect and shows "Connected — (server version)" or the error.
- The table that holds the projects is made automatically on the first save.

### Saving and opening

- With a database set up, **Save** (`Ctrl+S`) writes to the file and the database together and says "Saved {name} — to the file and to the database". The tip of the toolbar's save button also shows where it saves.
- **File › Save to database** saves to the database only. New projects without a file can be saved this way too.
- **File › Open from database…** lists the stored projects (name · time saved · size). **Open** opens one (it replaces the current project, asking first when that has unsaved changes), the bin button (**Delete from database**) deletes one (this cannot be undone), and **Refresh** reads the list again.
- When the connection is not set up yet, the settings window opens with the hint "Set up the connection in Settings › Database first".

## Customizing and settings

### Themes

![Themes](docs/tutorial/images/48-theme.jpg)

The theme button at the right of the toolbar picks a different random theme on every click. The ▾ next to it (**Choose theme**) shows 20 dark and 20 light themes in two rows, with **System setting** (follow the light or dark mode of the operating system) and **Custom** at the top. **Edit custom theme…** at the bottom opens the Theme tab of the settings.

In **Settings › Theme** you pick from the dark · light · custom groups. A custom theme lets you change the background · surface · panel · text · dim text · border · accent · text on accent · striped rows · chart background · toolbar · status bar colours one by one, and the **Dark theme** switch says whether it is a dark one. **Copy the current theme's colors** starts from the current theme, and when the contrast is so low that text is hard to read it warns "Text may be hard to read". **Use the custom theme** applies it. The window title bar follows the brightness of the theme too.

### Diagram colours

![Diagram colours](docs/tutorial/images/49-diagramTheme.jpg)

In **View › Diagram colours** or **Settings › Diagram › Diagram colours** pick the colours of the whole diagram: **Classic (white)** · **Pastel** · **Blueprint** · **Dark**. They are set apart from the program theme, and the same colours are used for picture, SVG and PDF export, printing and presentations. Colours given to a view (its style) win over the diagram colours.

### Language

![Language](docs/tutorial/images/50-language.jpg)

The flag button on the toolbar (`Ctrl+Shift+L`) switches between Korean and English. In Korean it shows the British flag, in English the Korean flag. **Settings › General › Language** changes it too. Menus, windows, error messages, the default names of new elements and the headings of exported documents follow the language. The names of elements already made do not change.

### Fonts

In **Settings › Font** set the **Font** (from the fonts installed on the system), **Size** (9–28px), **Weight**, **Style** (Normal · Italic), **Row height** and **Zoom** (50–200%) of the program screen (tables, lists, menus). The font inside diagrams is set separately with **Diagram font** and **Diagram font size** (9–24px) in **Settings › Diagram**.

### Start page and moving background

**Settings › Start page**:

- **Show the start page at start-up**
- **Show recent files** · **Recent files shown** (1–10) · **Show recent folders** · **Show sample projects** · **Show the moving background picker** · **Show the tutorial banner**
- **Start page › Open now** opens the start page at once.

**Settings › Background**:

| Item | Contents |
|---|---|
| **Background** | Moving · Image · None |
| **Moving background** | Aurora · Waves · Particles · Constellation · Bubbles · Flowing grid · Flowchart · Star field · Rain · Snow · Fireflies · Ripples · Code rain · Hexagons · Orbits · Lava lamp · Spiral galaxy · Confetti · Node network · Ribbons, and **Change moving background** |
| **Motion speed** | 0–300% |
| **Random background at start** · **Start page background changes** | A different background on every start, and changing it on the start page at the chosen interval |
| **Moving background on the start page only** | When on, no moving background is drawn behind the work area |
| **Background image** | **Choose…** · **Remove**. Images of any size can be used, and dropping a picture file on the window also makes it the background |
| **Background opacity (behind views)** | How strong the background behind the work area is (0–100%) |
| **Fit** | Fill · Fit · Tile · Center · Stretch |

`Ctrl+Shift+B` (**Change moving background**) switches to another background at any time. **View › Theme, language and background › Turn background off** turns the background off.

### Panels

![Collapsing the panels](docs/tutorial/images/51-panels.jpg)

**View › Show** shows or hides the **Toolbox** (`Ctrl+Shift+1`) · **Model Explorer & editors** (`Ctrl+Shift+2`) · **Status bar**. The panel widths, the height shared by the Model Explorer and the editors, **Icons only** in the toolbox and **Sort by name** in the Model Explorer are remembered for the next start. Right-clicking a panel, the toolbar or the menu bar also shows the panel menu.

### The Settings window

![Settings](docs/tutorial/images/52-settings.jpg)

**Settings…** (`Ctrl+,`, the gear on the toolbar) has these tabs. Changes apply and are saved at once. **Defaults** puts every setting back to the start, and **Done** closes the window.

| Tab | Contents |
|---|---|
| **General** | Language · Reopen last files when starting · Ask before deleting elements from the model · Clock on the status bar · Status bar · Last folder used · Start tutorial |
| **Start page** | See [Start page and moving background](#start-page-and-moving-background) above |
| **Theme** | Dark · light · custom themes, System setting |
| **Font** | Program font, size, weight, style, row height and zoom, with a preview |
| **Background** | The moving background and the background image |
| **Diagram** | The table below |
| **Database** | See [Database storage](#database-storage) |
| **Recent** | The recent files and recent folders lists, removing one or all |
| **Shortcuts** | The list of all shortcuts |

The **Settings › Diagram** tab:

| Item | Contents |
|---|---|
| **Diagram colours** | Classic (white) · Pastel · Blueprint · Dark |
| **Default line style** | Rectilinear · Oblique · Rounded rectilinear · Curve |
| **Diagram font** · **Diagram font size** | The default font of diagrams (the default when empty) and its size |
| **Grid** · **Grid size** | Show the grid, spacing 5 · 10 · 15 · 20 · 25 · 40px. The spacing is in screen pixels, so the grid looks the same on the screen at every zoom level; every 5th line is darker (see [Zoom and pan](#zoom-and-pan)) |
| **Rulers** | Show the rulers along the top and left edges of the diagram |
| **Snap to grid** | Snap to the grid when moving and creating |
| **Pan & zoom window** | Show the minimap |
| **Show shadows** | Shadows of element views |
| **Quick edit buttons** | The quick buttons under the selected element |
| **Dropping into a package moves the element in the model** | A drop into a container changes the owner in the model |
| **Validate the model after each edit** | Keeps the validation counts on the status bar up to date |
| **Auto save (saved files)** | Off · 1 min · 5 min · 10 min · 30 min |

## Keyboard shortcuts

![Keyboard shortcuts](docs/tutorial/images/54-shortcuts.jpg)

The **Settings › Shortcuts** tab (or **Help › Keyboard shortcuts…**) has the same list, and the menus show the shortcuts next to their commands. On macOS use `Cmd` instead of `Ctrl`.

| Shortcut | Command | Notes |
|---|---|---|
| `Ctrl+N` | New project | |
| `Ctrl+O` | Open | .myuml · .mumlt · .mdj. Replaces the current project |
| `Ctrl+S` | Save | Also saves to the database when one is set up |
| `Ctrl+Shift+S` | Save as | |
| `Ctrl+Alt+S` | Save all | Not in the menus |
| `Ctrl+W` | Close project | Back to the start page |
| `Ctrl+P` | Print | The Print preview window |
| `Ctrl+R` | Recent files | The Recent files and folders window |
| `Ctrl+Z` | Undo | |
| `Ctrl+Y` | Redo | `Ctrl+Shift+Z` works too |
| `Ctrl+X` | Cut | |
| `Ctrl+C` | Copy | |
| `Ctrl+V` | Paste | |
| `Ctrl+D` | Duplicate | |
| `Delete` | Delete from diagram | `Backspace` works too. The element stays in the model |
| `Ctrl+Delete` | Delete from model | Removes its views on every diagram too |
| `Ctrl+A` | Select all | |
| `Esc` | Clear selection | Back to the pointer while a tool is chosen |
| `Ctrl+F` | Find | The Find in model window |
| `Ctrl+E` | Select in Model Explorer | |
| `F2 / Enter` | Edit name | Quick edit for classes |
| `Double-click` | Quick edit (name, attributes, operations) | On an empty spot: Add here |
| `Ctrl+Enter` | Apply quick edit | `Esc` cancels |
| `Ctrl+1` | Pointer | |
| `Shift+create` | Keep the tool | Double-clicking the tool works too |
| `Ctrl+B / I` | Bold / Italic | |
| `Ctrl+Shift+> / <` | Increase font size / Decrease font size | |
| `Ctrl+Shift+F / K` | Bring to front / Send to back | |
| `Ctrl+Up / Down` | Move up in model / Move down in model | Order within the same parent |
| `Arrow keys` | Nudge by the grid (Shift: 1 pixel) | One visible grid cell (with a 10px grid: 5 at 200%, 20 at 50%) |
| `Shift+drag` | Move straight, resize keeping proportions, rotate in 15° steps | On a diagram, dragging moves only horizontally or vertically |
| `Alt+drag` | Drag without snapping | Does not snap to the grid |
| `Ctrl+= / Ctrl+-` | Zoom in / Zoom out | |
| `Ctrl+0` | Zoom 100% | |
| `Ctrl+Shift+W` | Fit diagram | |
| `Ctrl+wheel` | Zoom in / Zoom out | Around the pointer. Outside the diagram, the whole screen |
| `Space+drag / middle button` | Pan | |
| `Ctrl+PageUp / PageDown` | Previous diagram / Next diagram | Between the diagram tabs |
| `Ctrl+Shift+G` | Generate code | |
| `Ctrl+Shift+R` | Reverse engineer (code → model) | |
| `Ctrl+Shift+V` | Validate model | |
| `F5` | Presentation mode | |
| `Ctrl+Tab` | Next diagram tab | `Ctrl+Shift+Tab` goes to the previous diagram tab |
| `Ctrl+Shift+1 / 2` | Toolbox / Model Explorer & editors | Show or hide the panels |
| `Ctrl+Shift+L` | Switch language | |
| `Ctrl+Shift+B` | Change moving background | |
| `Ctrl+Shift+H` | Start page | |
| `Ctrl+,` | Settings | |
| `F11` | Tutorial | |
| `F1` | About | |

Also, `Alt+F4` (`Cmd+Q` on macOS; `Ctrl+Q` works too) is **Exit**. In the Model Explorer the arrow keys, `F2`, `Enter` and `Delete` act on the tree (see [Model Explorer](#model-explorer)).

In presentation mode these keys work:

| Key | Action |
|---|---|
| `→` · `↓` · `PageDown` · `Space` · `Enter`, clicking the screen | Next diagram (ends the show on the last one) |
| `←` · `↑` · `PageUp` · `Backspace` | Previous diagram |
| `Home` · `End` | First · last diagram |
| `Esc` | Exit |

## Help and troubleshooting

### Presentation mode

![Presentation mode](docs/tutorial/images/53-presentation.jpg)

**View › Presentation mode** (`F5`) shows the diagrams that have views one after another in full screen. It starts at the current diagram, and the bar at the bottom shows the diagram name, its place such as "3 / 11", and the **Previous diagram** · **Next diagram** · **Exit (Esc)** buttons. When it ends, the last diagram shown is opened. The diagram colours are used as they are.

### The Help menu

| Command | What it does |
|---|---|
| **Tutorial** (`F11`) | Starts the 58 steps tutorial (see [Tutorial](#tutorial)) |
| **Tutorial document** | Opens, inside the program, a document of every tutorial step with its picture |
| **User's guide** | Opens this guide (HTML) in the default web browser |
| **Keyboard shortcuts…** | Opens the Shortcuts tab of the settings window |
| **About…** (`F1`) | Version and build information |

### About

![About](docs/tutorial/images/55-about.jpg)

The **About** window (ⓘ on the toolbar) shows the program name and version, a description of the features, and the **Build** information (version · build date · commit · target · profile · runtime · platform · author). **Copy** copies it all, to paste when reporting a problem. The author is SHKWON (knix008@naver.com).

### The error window

When something goes wrong, the **Error** window opens. It has the message, the **Time**, **Where** (what was being done) and the **Details**, and the **Copy details** button copies it all to report or keep.

| Error title | Common causes |
|---|---|
| The file could not be opened | Not a MyUMLMaker file ("This is not a MyUMLMaker file (not JSON)."), a file made by a newer version of MyUMLMaker, not a StarUML project (.mdj) |
| Could not save · Could not export | A folder without write permission, another program holding the file, a picture format the system does not support (WebP and the like) |
| Could not import | Not a model fragment (.mfj), a kind of Mermaid or PlantUML diagram that cannot be imported, nothing to import |
| Could not generate code · Could not reverse engineer | No element to generate from, source that cannot be read (syntax errors and the like) |
| Could not save to the database · The database operation failed | Wrong server address, port, user or password, the database does not exist, the SQLite file cannot be written |
| Could not print | A problem with the printer or the print dialog |
| Background image error | A picture file that cannot be read |
| The user's guide could not be opened | The `docs` folder of the installation was deleted |

### Serious errors and crash.log

When a serious error happens inside the program (the backend), the **Serious error (backend)** window shows the location, thread, backtrace and the **Log file** path. The same goes into `crash.log`.

| OS | Where crash.log is |
|---|---|
| Windows | `%APPDATA%\com.shkwon.myumlmaker\crash.log` |
| macOS | `~/Library/Application Support/com.shkwon.myumlmaker/crash.log` |
| Linux | `~/.local/share/com.shkwon.myumlmaker/crash.log` |

### "Already running" error

Only one MyUMLMaker desktop app runs per user. Starting it again while it runs shows "MyUMLMaker is already running." in the **MyUMLMaker — Start error** window, and the new copy closes. Find the open window on the taskbar (Dock) and use it. In the open window, **File › Open…** opens another project (it replaces the current one). Even after the program ends abnormally, the operating system releases the lock, so the next start is not blocked.

### Unsaved changes

Only one project is open at a time, so you are asked before another project replaces the current one. With a modified project open, a new project · template · sample · **Open…** · recent file · drag and drop · open from database shows the **Unsaved changes** window: "(project name) has unsaved changes. Save them before opening another project?" with **Save** · **Don't save** · **Cancel**. **Cancel** keeps the current project. **Close project** (`Ctrl+W`) asks "(project name) has unsaved changes. Save them?" with the same three buttons, and closing the program with unsaved changes asks too. In the web version the browser warns when you try to close the page.

### Other problems

| Symptom | Fix |
|---|---|
| A deleted element is still in the Model Explorer | `Delete` deletes only from the diagram. To delete from the model use `Ctrl+Delete` (**Delete from model**) |
| Renaming changed another diagram too | They are views of the same element. To use it separately, make a new element with **Duplicate** |
| An element does not move or cannot be renamed | Check **Locked (cannot move)** on the Style tab |
| A drag does not stop where you want | Hold `Alt` while dragging, or turn **Snap to grid** off |
| Dropping on a package changed the place in the model | Turn off **Settings › Diagram › Dropping into a package moves the element in the model** |
| An attribute cannot be put outside a class | Attributes and operations must go inside an element that can own them. The quick buttons or quick edit are easier |
| It says the relationship cannot connect | That relationship is not allowed between those two kinds of element (for example an interface realization must go to an interface) |
| A line bends oddly | Remove the hand-made bend points with **Clear bend points**, or change the **Line style** |
| The diagram is not visible or too small | `Ctrl+Shift+W` (Fit diagram) or `Ctrl+0` (Zoom 100%) |
| The program screen is too big or too small | `Ctrl`+wheel outside the diagram, or **Settings › Font › Zoom** |
| The quick buttons do not show | Turn on **View › Show › Quick edit buttons** |
| A recent file does not open in the web version | Because of browser security, you may have to pick the file again with **Open** |
| The web version has no database or folder reverse engineering | These are available in the desktop app only |
| Back to the original settings | **Settings › Defaults** |

### The web version

The web version has the same screens and features, with a few differences. Files go in and out through the browser's open and save windows (saving back to the same file where the browser allows it), and the recent files are the files opened in the browser. Database storage, reverse engineering a whole folder, writing code straight to a folder (the web makes a ZIP) and auto save are desktop-only. Presentations use the browser's full screen.
