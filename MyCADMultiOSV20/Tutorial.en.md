# MyCAD 1.0 Tutorial

> 21 lessons, 95 steps — the same order and coordinates as **Help › Interactive tutorial** in the app (the first card of the start page). In the app you can **Watch** (it shows you) or **Practice** (it moves on when you have done the step). A video of the same lessons is `MyCAD-Tutorial.mp4` in the project folder.

## Contents

| Lesson | | Steps | In the app |
|---:|---|---:|---|
| 0 | [Installing and the start page](#lesson-0-installing-and-the-start-page) | | |
| 1 | [Finding your way around](#lesson-1-finding-your-way-around) | 6 | Help › Interactive tutorial › lesson 1 |
| 2 | [Drawing lines and shapes](#lesson-2-drawing-lines-and-shapes) | 10 | Help › Interactive tutorial › lesson 2 |
| 3 | [Precise input, snaps and units](#lesson-3-precise-input-snaps-and-units) | 7 | Help › Interactive tutorial › lesson 3 |
| 4 | [Selecting and modifying](#lesson-4-selecting-and-modifying) | 12 | Help › Interactive tutorial › lesson 4 |
| 5 | [Dimensions and notes](#lesson-5-dimensions-and-notes) | 10 | Help › Interactive tutorial › lesson 5 |
| 6 | [Properties and layers](#lesson-6-properties-and-layers) | 4 | Help › Interactive tutorial › lesson 6 |
| 7 | [The parts library](#lesson-7-the-parts-library) | 3 | Help › Interactive tutorial › lesson 7 |
| 8 | [3D solids](#lesson-8-3d-solids) | 6 | Help › Interactive tutorial › lesson 8 |
| 9 | [2D to 3D: pad, revolve, loft, sweep](#lesson-9-2d-to-3d-pad-revolve-loft-sweep) | 4 | Help › Interactive tutorial › lesson 9 |
| 10 | [Booleans: cut, fuse, common](#lesson-10-booleans-cut-fuse-common) | 3 | Help › Interactive tutorial › lesson 10 |
| 11 | [Drawing views and sections](#lesson-11-drawing-views-and-sections) | 2 | Help › Interactive tutorial › lesson 11 |
| 12 | [The 3D view in depth](#lesson-12-the-3d-view-in-depth) | 3 | Help › Interactive tutorial › lesson 12 |
| 13 | [Files: save, open, import, export](#lesson-13-files-save-open-import-export) | 5 | Help › Interactive tutorial › lesson 13 |
| 14 | [Printing and 3D printing](#lesson-14-printing-and-3d-printing) | 2 | Help › Interactive tutorial › lesson 14 |
| 15 | [Settings and appearance](#lesson-15-settings-and-appearance) | 3 | Help › Interactive tutorial › lesson 15 |
| 16 | [Help](#lesson-16-help) | 3 | Help › Interactive tutorial › lesson 16 |
| 17 | [Assembly and motion](#lesson-17-assembly-and-motion) | 3 | Help › Interactive tutorial › lesson 17 |
| 18 | [Exact solids (OpenCASCADE)](#lesson-18-exact-solids-opencascade) | 3 | Help › Interactive tutorial › lesson 18 |
| 19 | [CAM in 3D and simulation](#lesson-19-cam-in-3d-and-simulation) | 2 | Help › Interactive tutorial › lesson 19 |
| 20 | [FEM: plates and solids](#lesson-20-fem-plates-and-solids) | 2 | Help › Interactive tutorial › lesson 20 |
| 21 | [The Python console and macros](#lesson-21-the-python-console-and-macros) | 2 | Help › Interactive tutorial › lesson 21 |
| | [Appendix A. Keyboard shortcuts](#appendix-a-keyboard-shortcuts) · [B. File formats](#appendix-b-file-formats) · [C. Feature index](#appendix-c-feature-index) | | |

### How to read this document

- **Bold** is a name on the screen (button, menu, tab).
- Code font like `L` or `Ctrl+Z` is a key to press or text to type.
- Coordinates are (x, y) in mm. The tutorial starts with 5 mm grid snap on.
- The picture of a step shows the screen after the step (taken by the app running it).

---

## Lesson 0. Installing and the start page

1. **Windows**: run `MyCAD_1.0.0_x64-setup.exe` (or the `.msi`). **macOS**: `.dmg`; **Linux**: `.deb` or `.AppImage`. The web version is `dist/` on any web server.
2. The **start page** opens at first start. The **house tab** at the left of the tab row brings it back any time (**View › Start page**); Settings › General decides whether it shows at start-up.
3. Each **task** card on the start page has the **lesson** that teaches it and a **sample**. Every **sample** below opens in a new tab with one click (saving asks for a new name).

![Start page: tasks (lessons and samples), quick start, recent files, tip of the day, samples](doc/images/en/start-page.webp)

*Start page: tasks (lessons and samples), quick start, recent files, tip of the day, samples*

### The tutorial panel

- Drag the tutorial panel anywhere. Pick a lesson at the top; **Watch** has play/pause, previous/next and a speed (0.5×–4×), **Practice** has **Show me** and **Skip**.
- Starting in the middle prepares the result of the earlier lessons automatically.

![Tutorial, Watch: the cursor works the real interface while the panel explains the step](doc/images/en/tutorial-watch.webp)

*Tutorial, Watch: the cursor works the real interface while the panel explains the step*

![Tutorial, Practice: what to do and where to click (red circles); it moves on when you have done it](doc/images/en/tutorial-practice.webp)

*Tutorial, Practice: what to do and where to click (red circles); it moves on when you have done it*

---

## Lesson 1. Finding your way around

### Goal

Learn the layout (menus, toolbar, tabs, tool panel, canvas, properties, status bar), open a sample from the start page, zoom, pan and look at it in 3D.

### Steps

1. **The start page** — The start page lists what you can do, the tutorial, samples and recent files. The house button at the left of the menu bar (or the house tab) brings it back any time.

   ![Finding your way around · The start page](doc/images/en/l1-s1.webp)

   *Finding your way around · The start page*

2. **Opening a sample** — Clicking a sample card opens it in a new tab. Open the flange sample.

   ![Finding your way around · Opening a sample](doc/images/en/l1-s2.webp)

   *Finding your way around · Opening a sample*

3. **Zoom to fit and zoom** — Zoom to fit (Home) shows the whole drawing. Ctrl + wheel or the + / − buttons zoom in and out.

   ![Finding your way around · Zoom to fit and zoom](doc/images/en/l1-s3.webp)

   *Finding your way around · Zoom to fit and zoom*

4. **Panning** — Move the view with the pan tool (or the middle button, or Space + drag).

   ![Finding your way around · Panning](doc/images/en/l1-s4.webp)

   *Finding your way around · Panning*

5. **Panels** — The tool panel (left) and properties panel (right) fold with toolbar buttons (Ctrl+1, Ctrl+2). Clicking a group header in the left panel folds just that group.

   ![Finding your way around · Panels](doc/images/en/l1-s5.webp)

   *Finding your way around · Panels*

6. **The 3D view** — The 3D view (Ctrl+Shift+3) shows closed outlines as plates and solids as they are. Click again to go back to 2D.

   ![Finding your way around · The 3D view](doc/images/en/l1-s6.webp)

   *Finding your way around · The 3D view*

### Your turn

- Click the house button at the left of the menu bar.
- Click the "Flange" sample.
- Click the zoom-in (+) and zoom-to-fit buttons on the toolbar.
- Pick the pan tool and drag the canvas.
- Click the 3D view button on the toolbar.

### Tips

- Home zooms to fit; Ctrl + wheel zooms around the cursor.
- Drag with the middle button, or hold Space and drag, to pan with any tool.

### Common mistakes

- Saving a changed sample asks for a new name — the sample itself never changes.

### Check

- [ ] The start page
- [ ] Opening a sample
- [ ] Zoom to fit and zoom
- [ ] Panning
- [ ] Panels
- [ ] The 3D view

---

## Lesson 2. Drawing lines and shapes

### Goal

Use the ten drawing tools (line, rectangle, circle, arc, ellipse, polygon, polyline, spline, point) on the grid.

### Steps

1. **A new drawing** — Make a new drawing (Ctrl+N). Grid snap is on, so clicks land on the 5 mm grid.

   ![Drawing lines and shapes · A new drawing](doc/images/en/l2-s1.webp)

   *Drawing lines and shapes · A new drawing*

2. **Lines (L)** — With the line tool click (0,0) → (60,0) → (60,40). Each click continues the line; Esc finishes.

   ![Drawing lines and shapes · Lines (L)](doc/images/en/l2-s2.webp)

   *Drawing lines and shapes · Lines (L)*

3. **Rectangles (R)** — A rectangle takes two corners: (80,0) and (140,40).

   ![Drawing lines and shapes · Rectangles (R)](doc/images/en/l2-s3.webp)

   *Drawing lines and shapes · Rectangles (R)*

4. **Circles (C)** — A circle: click the centre (20,70), then (35,70) for a radius of 15.

   ![Drawing lines and shapes · Circles (C)](doc/images/en/l2-s4.webp)

   *Drawing lines and shapes · Circles (C)*

5. **Arcs (3 points)** — An arc goes through three points: start (45,60), through (60,75), end (75,60).

   ![Drawing lines and shapes · Arcs (3 points)](doc/images/en/l2-s5.webp)

   *Drawing lines and shapes · Arcs (3 points)*

6. **Ellipses** — An ellipse: centre (100,70), end of the major axis (120,70), minor radius (100,80).

   ![Drawing lines and shapes · Ellipses](doc/images/en/l2-s6.webp)

   *Drawing lines and shapes · Ellipses*

7. **Polygons** — A polygon: centre (145,70) and a corner (155,70). The number of sides is a tool option.

   ![Drawing lines and shapes · Polygons](doc/images/en/l2-s7.webp)

   *Drawing lines and shapes · Polygons*

8. **Polylines** — A polyline joins many points into one object. Click (0,95), (30,100), (50,90), (70,100), then Enter.

   ![Drawing lines and shapes · Polylines](doc/images/en/l2-s8.webp)

   *Drawing lines and shapes · Polylines*

9. **Splines** — A spline is a smooth curve (NURBS) through the points you click: (85,95), (100,105), (115,90), (130,100), then Enter.

   ![Drawing lines and shapes · Splines](doc/images/en/l2-s9.webp)

   *Drawing lines and shapes · Splines*

10. **Points** — The point tool marks a reference point: (150,95).

   ![Drawing lines and shapes · Points](doc/images/en/l2-s10.webp)

   *Drawing lines and shapes · Points*

### Your turn

- Click New on the toolbar.
- With the line tool click the three marks, then Esc.
- With the rectangle tool click the two corners.
- With the circle tool click the centre and a point on the circle.
- With the arc tool click the three points.
- With the ellipse tool click the three points.
- With the polygon tool click the centre and a corner.
- With the polyline tool click four points, then Enter.
- With the spline tool click four points, then Enter.
- With the point tool click the mark.

### Tips

- While drawing, a right click is the same as Enter (finish).
- Clicking the first point again closes a polyline or spline.
- Tool keys: L line, R rectangle, C circle, A arc… — shown in the tooltips.

### Common mistakes

- Esc once cancels what you are drawing; Esc again returns to the select tool.

### Check

- [ ] A new drawing
- [ ] Lines (L)
- [ ] Rectangles (R)
- [ ] Circles (C)
- [ ] Arcs (3 points)
- [ ] Ellipses
- [ ] Polygons
- [ ] Polylines
- [ ] Splines
- [ ] Points

---

## Lesson 3. Precise input, snaps and units

### Goal

Draw to exact sizes with typed, relative and polar coordinates; use object snap, ortho, length units and the scale bar.

### Steps

1. **Typing coordinates** — Numbers typed while drawing go to the command box. With the line tool type 0,0 → @80,0 → @0,50 → @-80,0 for exact lengths.

   ![Precise input, snaps and units · Typing coordinates](doc/images/en/l3-s1.webp)

   *Precise input, snaps and units · Typing coordinates*

2. **Polar: distance<angle** — @40<60 means 40 mm at 60° from the last point. Start at 100,0 and type @40<60.

   ![Precise input, snaps and units · Polar: distance<angle](doc/images/en/l3-s2.webp)

   *Precise input, snaps and units · Polar: distance<angle*

3. **Object snap (F3)** — With object snap on, the cursor jumps to end points, midpoints, centres… Click near the end point (80,50) to put a circle exactly there.

   ![Precise input, snaps and units · Object snap (F3)](doc/images/en/l3-s3.webp)

   *Precise input, snaps and units · Object snap (F3)*

4. **Ortho mode (F8)** — In ortho mode lines are drawn only horizontally or vertically.

   ![Precise input, snaps and units · Ortho mode (F8)](doc/images/en/l3-s4.webp)

   *Precise input, snaps and units · Ortho mode (F8)*

5. **Length units** — Settings › General › Length unit picks mm, cm, m, in or ft. Drawings are stored in mm; only what you see changes. Switch to inches.

   ![Precise input, snaps and units · Length units](doc/images/en/l3-s5.webp)

   *Precise input, snaps and units · Length units*

   ![Length units — window](doc/images/en/l3-s5-dialog.webp)

   *Length units — window*

6. **Typing other units** — A unit after a number is converted automatically. A radius typed as 25.4mm becomes 1 in.

   ![Precise input, snaps and units · Typing other units](doc/images/en/l3-s6.webp)

   *Precise input, snaps and units · Typing other units*

7. **The scale bar** — The scale bar (bottom left) shows how long it is in the drawing and the screen scale. Drag it, drag its end lines to resize it, switch it with its toolbar button.

   ![Precise input, snaps and units · The scale bar](doc/images/en/l3-s7.webp)

   *Precise input, snaps and units · The scale bar*

### Your turn

- Pick the line tool and type 0,0 · @80,0 · @0,50 · @-80,0 into the command box.
- With the line tool type 100,0 then @40<60.
- Switch snap on in the toolbar; with the circle tool click near the end point.
- Switch ortho on and draw a slanted line.
- In Settings (gear) › General set the length unit to inches.
- With the circle tool type 120mm,40mm and @25.4mm<0.

### Tips

- Coordinates take units too: 2in,30mm.
- Snap kinds (end, mid, centre, quadrant, intersection, nearest) are chosen in Settings › Snaps.

### Common mistakes

- Press Enter after typing in the command box to place the point.

### Check

- [ ] Typing coordinates
- [ ] Polar: distance<angle
- [ ] Object snap (F3)
- [ ] Ortho mode (F8)
- [ ] Length units
- [ ] Typing other units
- [ ] The scale bar

---

## Lesson 4. Selecting and modifying

### Goal

Select objects; move, copy, rotate, mirror, scale, offset, array, explode and delete them; undo.

### Steps

1. **Set-up: a rectangle and a circle** — Draw something to modify: a rectangle (0,0)–(40,30) and a circle at (100,20), radius 10.

   ![Selecting and modifying · Set-up: a rectangle and a circle](doc/images/en/l4-s1.webp)

   *Selecting and modifying · Set-up: a rectangle and a circle*

2. **Selecting** — Click an object to select it; its properties show on the right. Dragging left→right selects what is fully inside, right→left what it touches.

   ![Selecting and modifying · Selecting](doc/images/en/l4-s2.webp)

   *Selecting and modifying · Selecting*

3. **Move (M)** — Move the selected rectangle with the move tool from (0,0) to (10,10).

   ![Selecting and modifying · Move (M)](doc/images/en/l4-s3.webp)

   *Selecting and modifying · Move (M)*

4. **Copy** — The copy tool copies from a base point as often as you click. Copy from (10,10) to (60,10), then Esc.

   ![Selecting and modifying · Copy](doc/images/en/l4-s4.webp)

   *Selecting and modifying · Copy*

5. **Rotate** — Rotate the copy by 30° about (60,10): click the base point, then type 30.

   ![Selecting and modifying · Rotate](doc/images/en/l4-s5.webp)

   *Selecting and modifying · Rotate*

6. **Mirror** — Mirror the circle about x = 130: click two points on the axis, (130,0) and (130,40).

   ![Selecting and modifying · Mirror](doc/images/en/l4-s6.webp)

   *Selecting and modifying · Mirror*

7. **Scale** — Scale the first circle 2× about its centre: click (100,20) and type 2.

   ![Selecting and modifying · Scale](doc/images/en/l4-s7.webp)

   *Selecting and modifying · Scale*

8. **Offset** — Offset draws the same shape at a distance. With distance 5, pick the circle and click outside it.

   ![Selecting and modifying · Offset](doc/images/en/l4-s8.webp)

   *Selecting and modifying · Offset*

9. **Arrays** — The array window copies in rows and columns (rectangular) or around a centre (polar). Copy a point into 3 columns × 2 rows.

   ![Selecting and modifying · Arrays](doc/images/en/l4-s9.webp)

   *Selecting and modifying · Arrays*

   ![Arrays — window](doc/images/en/l4-s9-dialog.webp)

   *Arrays — window*

10. **Explode** — Explode turns a rectangle into a polyline, and polylines, polygons and parts into lines and arcs. Exploding a rectangle twice gives four lines.

   ![Selecting and modifying · Explode](doc/images/en/l4-s10.webp)

   *Selecting and modifying · Explode*

11. **Undo and redo** — Ctrl+Z undoes, Ctrl+Y redoes; the arrow buttons on the toolbar do the same.

   ![Selecting and modifying · Undo and redo](doc/images/en/l4-s11.webp)

   *Selecting and modifying · Undo and redo*

12. **Delete** — Delete removes the selection.

   ![Selecting and modifying · Delete](doc/images/en/l4-s12.webp)

   *Selecting and modifying · Delete*

### Your turn

- Draw the rectangle and the circle.
- Click an edge of the rectangle.
- Select the rectangle, then click two points with the move tool.
- Select the rectangle, then click a base point and a new place with the copy tool.
- Select a rectangle, click the base point with the rotate tool, type 30.
- Select the circle and click two axis points with the mirror tool.
- Select the circle, click its centre with the scale tool, type 2.
- With the offset tool click the circle, then outside it.
- Select something and click "Array…" in the modify group.
- Select a rectangle and click Explode.
- Select the points and press Delete.

### Tips

- Shift (or Ctrl) + click adds to or removes from the selection.
- Drag the grips (small squares) of a selected object to reshape it.

### Common mistakes

- Modify tools need a selection first.

### Check

- [ ] Set-up: a rectangle and a circle
- [ ] Selecting
- [ ] Move (M)
- [ ] Copy
- [ ] Rotate
- [ ] Mirror
- [ ] Scale
- [ ] Offset
- [ ] Arrays
- [ ] Explode
- [ ] Undo and redo
- [ ] Delete

---

## Lesson 5. Dimensions and notes

### Goal

Add linear, aligned, diameter, radius and angle dimensions, text, leaders, hatches, centre lines; measure.

### Steps

1. **Set-up: a plate and a hole** — Draw a plate (0,0)–(100,60) and a hole at (50,30), radius 20, to dimension.

   ![Dimensions and notes · Set-up: a plate and a hole](doc/images/en/l5-s1.webp)

   *Dimensions and notes · Set-up: a plate and a hole*

2. **Linear dimensions** — Linear dimension: click (0,0) and (100,0), then where the dimension line goes (50,-12).

   ![Dimensions and notes · Linear dimensions](doc/images/en/l5-s2.webp)

   *Dimensions and notes · Linear dimensions*

3. **Aligned dimensions** — An aligned dimension measures along the two points: (100,0), (100,60), position (112,30).

   ![Dimensions and notes · Aligned dimensions](doc/images/en/l5-s3.webp)

   *Dimensions and notes · Aligned dimensions*

4. **Diameter and radius** — Diameter dimension: click the circle, then the leader direction (80,50).

   ![Dimensions and notes · Diameter and radius](doc/images/en/l5-s4.webp)

   *Dimensions and notes · Diameter and radius*

5. **Angle dimensions** — Angle dimension: the vertex (0,0), the first direction (40,0), the second (0,40).

   ![Dimensions and notes · Angle dimensions](doc/images/en/l5-s5.webp)

   *Dimensions and notes · Angle dimensions*

6. **Text** — Click (0,75) with the text tool and type "Cover plate" into the properties.

   ![Dimensions and notes · Text](doc/images/en/l5-s6.webp)

   *Dimensions and notes · Text*

7. **Leaders** — Leader: arrow tip (62,38), bends (85,80) and (100,80), then Enter. Edit the note in the properties.

   ![Dimensions and notes · Leaders](doc/images/en/l5-s7.webp)

   *Dimensions and notes · Leaders*

8. **Hatching** — Click inside a closed area (10,10) with the hatch tool; the inner circle stays a hole. Pattern, scale and angle are tool options.

   ![Dimensions and notes · Hatching](doc/images/en/l5-s8.webp)

   *Dimensions and notes · Hatching*

9. **Centre lines** — Centre lines are dash-dot lines on the centre-line layer: (30,30) → (70,30).

   ![Dimensions and notes · Centre lines](doc/images/en/l5-s9.webp)

   *Dimensions and notes · Centre lines*

10. **Measuring** — Measure gives the distance, angle, Δx and Δy between two points: (0,0) → (100,60).

   ![Dimensions and notes · Measuring](doc/images/en/l5-s10.webp)

   *Dimensions and notes · Measuring*

### Your turn

- Draw the rectangle and the circle.
- With the linear dimension tool click the three points.
- With the aligned dimension tool click three points.
- With the diameter tool click the circle and a direction.
- With the angle tool click three points.
- Click with the text tool, then change the content in the properties.
- With the leader tool click three points, then Enter.
- With the hatch tool click inside the rectangle (outside the circle).
- With the centre-line tool click two points.
- With the measure tool click two points.

### Tips

- Change dimension text in the properties; <> stands for the measured value: "<> H7".
- Dimension decimals and text height are in Settings › Drawing and Font.

### Common mistakes

- Hatch needs a click inside a closed area — open lines give "No closed outline".

### Check

- [ ] Set-up: a plate and a hole
- [ ] Linear dimensions
- [ ] Aligned dimensions
- [ ] Diameter and radius
- [ ] Angle dimensions
- [ ] Text
- [ ] Leaders
- [ ] Hatching
- [ ] Centre lines
- [ ] Measuring

---

## Lesson 6. Properties and layers

### Goal

Edit sizes, positions and styles precisely in the properties (formulas and units), and organise with layers.

### Steps

1. **Editing in the properties** — Select the circle and type 25 for the radius. The − / + buttons step it.

   ![Properties and layers · Editing in the properties](doc/images/en/l6-s1.webp)

   *Properties and layers · Editing in the properties*

2. **Formulas and units** — Number fields take formulas (10*2+2) and other units (1in). A radius of 1in becomes 25.4 mm.

   ![Properties and layers · Formulas and units](doc/images/en/l6-s2.webp)

   *Properties and layers · Formulas and units*

3. **Line type, width and colour** — Set the line type to dashed and the width to 0.5 mm. "By layer" uses the layer's style.

   ![Properties and layers · Line type, width and colour](doc/images/en/l6-s3.webp)

   *Properties and layers · Line type, width and colour*

4. **Layers** — In the layers group add a layer, hide it with the eye, lock it with the padlock. Click a name to make it the current layer.

   ![Properties and layers · Layers](doc/images/en/l6-s4.webp)

   *Properties and layers · Layers*

### Your turn

- Select the circle and change its radius in the properties.
- Type 1in into the radius field.
- Change the line type in the properties.
- Click "Add layer" in the layers group.

### Tips

- The − / + buttons step by the length unit (1 mm, 0.125 in…).
- Objects on locked layers cannot be selected.

### Common mistakes

- With several objects selected only the shared properties (layer, colour, line) show.

### Check

- [ ] Editing in the properties
- [ ] Formulas and units
- [ ] Line type, width and colour
- [ ] Layers

---

## Lesson 7. The parts library

### Goal

Insert standard parts (gears, bolts…) from the library and change their sizes.

### Steps

1. **Placing a gear** — Pick a gear in the parts group: the part window opens. Set the module and teeth, press Insert, then click to place it.

   ![The parts library · Placing a gear](doc/images/en/l7-s1.webp)

   *The parts library · Placing a gear*

   ![Placing a gear — window](doc/images/en/l7-s1-dialog.webp)

   *Placing a gear — window*

2. **Bolts and nuts** — There are 36 parts — ISO bolts, nuts, washers, bearings… Place an M10 bolt.

   ![The parts library · Bolts and nuts](doc/images/en/l7-s2.webp)

   *The parts library · Bolts and nuts*

3. **Changing a part** — A selected part shows its sizes in the properties. Change the gear to 30 teeth.

   ![The parts library · Changing a part](doc/images/en/l7-s3.webp)

   *The parts library · Changing a part*

### Your turn

- Insert a gear from the parts group.
- Insert a bolt.
- Select the gear and change its number of teeth.

### Tips

- Exploding a part gives ordinary lines and arcs you can edit freely.

### Common mistakes

- After Insert in the part window, click in the drawing to place it.

### Check

- [ ] Placing a gear
- [ ] Bolts and nuts
- [ ] Changing a part

---

## Lesson 8. 3D solids

### Goal

Insert FreeCAD-Part style solids, look at them in 3D and move them.

### Steps

1. **A box** — Click Box in the 3D shapes group; the solid window sets its size and place. Insert a 60 × 40 × 20 box.

   ![3D solids · A box](doc/images/en/l8-s1.webp)

   *3D solids · A box*

2. **A cylinder** — Insert a cylinder (radius 10, height 40) at (30,20). Cones, spheres, tori, tubes, wedges, prisms, ellipsoids and helices work the same way.

   ![3D solids · A cylinder](doc/images/en/l8-s2.webp)

   *3D solids · A cylinder*

   ![A cylinder — window](doc/images/en/l8-s2-dialog.webp)

   *A cylinder — window*

3. **Seeing it in 3D** — Switch to 3D. Drag to orbit, wheel to zoom, right-drag to pan.

   ![3D solids · Seeing it in 3D](doc/images/en/l8-s3.webp)

   *3D solids · Seeing it in 3D*

4. **Views** — The 3D bar picks top, front, right and isometric views.

   ![3D solids · Views](doc/images/en/l8-s4.webp)

   *3D solids · Views*

5. **Position and rotation** — A selected solid shows X, Y, Z and rotations in the properties. Lift the cylinder to z = 20.

   ![3D solids · Position and rotation](doc/images/en/l8-s5.webp)

   *3D solids · Position and rotation*

6. **Back to 2D** — Click the 3D button again to return to 2D; solids show as outlines there.

   ![3D solids · Back to 2D](doc/images/en/l8-s6.webp)

   *3D solids · Back to 2D*

### Your turn

- Insert a box from the 3D shapes group.
- Insert a cylinder.
- Click the 3D view button.
- Select the cylinder and change Z.
- Click the 3D button again.

### Tips

- Click a solid in the 3D view to select it and see its properties.
- The solid window previews a shaded isometric view.

### Common mistakes

- In 2D, solids show only as outlines — check them in 3D.

### Check

- [ ] A box
- [ ] A cylinder
- [ ] Seeing it in 3D
- [ ] Views
- [ ] Position and rotation
- [ ] Back to 2D

---

## Lesson 9. 2D to 3D: pad, revolve, loft, sweep

### Goal

Make solids from 2D outlines: pad, revolve, loft and sweep.

### Steps

1. **Pad (extrude)** — Select closed outlines (a rectangle and a circle inside) and pad them: a plate with a hole, 15 high.

   ![2D to 3D: pad, revolve, loft, sweep · Pad (extrude)](doc/images/en/l9-s1.webp)

   *2D to 3D: pad, revolve, loft, sweep · Pad (extrude)*

2. **Revolve** — Revolve a profile around an axis. Draw the polyline (80,0)–(95,0)–(95,30)–(85,30) closed, and revolve it 360° about Y.

   ![2D to 3D: pad, revolve, loft, sweep · Revolve](doc/images/en/l9-s2.webp)

   *2D to 3D: pad, revolve, loft, sweep · Revolve*

3. **Loft** — A loft joins two outlines smoothly. Select a rectangle and a circle and loft them 30 high.

   ![2D to 3D: pad, revolve, loft, sweep · Loft](doc/images/en/l9-s3.webp)

   *2D to 3D: pad, revolve, loft, sweep · Loft*

4. **Sweep** — Sweep a round section along a path to make a pipe. Draw a polyline path and sweep it with radius 3.

   ![2D to 3D: pad, revolve, loft, sweep · Sweep](doc/images/en/l9-s4.webp)

   *2D to 3D: pad, revolve, loft, sweep · Sweep*

### Your turn

- Draw, select a rectangle and a circle, then click "Pad".
- Select a closed polyline and click "Revolve".
- Select two outlines and click "Loft".
- Select an open polyline and click "Sweep".

### Tips

- Pad turns outlines inside the outer one into holes.
- Loft uses the outlines in the order you selected them: bottom, then top.

### Common mistakes

- A revolve profile must not cross the axis.

### Check

- [ ] Pad (extrude)
- [ ] Revolve
- [ ] Loft
- [ ] Sweep

---

## Lesson 10. Booleans: cut, fuse, common

### Goal

Combine solids with booleans (cut, fuse, common) and take them apart with explode.

### Steps

1. **Cut** — Cut a cylinder out of a plate. Select the plate first, then the cylinder, and click Cut.

   ![Booleans: cut, fuse, common · Cut](doc/images/en/l10-s1.webp)

   *Booleans: cut, fuse, common · Cut*

2. **Fuse** — Fuse two solids into one: the drilled plate and a new box.

   ![Booleans: cut, fuse, common · Fuse](doc/images/en/l10-s2.webp)

   *Booleans: cut, fuse, common · Fuse*

3. **Explode gives the parts back** — Booleans stay a tree, like in FreeCAD. Explode gives the original solids back.

   ![Booleans: cut, fuse, common · Explode gives the parts back](doc/images/en/l10-s3.webp)

   *Booleans: cut, fuse, common · Explode gives the parts back*

### Your turn

- Select two solids and click "Cut".
- Select two solids and click "Fuse".
- Select the boolean solid and click Explode.

### Tips

- Cut removes the others from the first selected solid.
- Boolean results are saved as FreeCAD Part::Cut / MultiFuse.

### Common mistakes

- Booleans need two or more solids selected.

### Check

- [ ] Cut
- [ ] Fuse
- [ ] Explode gives the parts back

---

## Lesson 11. Drawing views and sections

### Goal

Make third-angle projected views (with hidden lines), an isometric view and section outlines from solids.

### Steps

1. **Projected views** — Make front, top and right views (with hidden lines) and an isometric view from the solids.

   ![Drawing views and sections · Projected views](doc/images/en/l11-s1.webp)

   *Drawing views and sections · Projected views*

   ![Projected views — window](doc/images/en/l11-s1-dialog.webp)

   *Projected views — window*

2. **Sections** — Draw the section outline at height z = 5.

   ![Drawing views and sections · Sections](doc/images/en/l11-s2.webp)

   *Drawing views and sections · Sections*

### Your turn

- Select the solids and click "Make drawing views".
- Select the solids and click "Make section".

### Tips

- Hidden lines go to the hidden-line layer — hide it with the layer.

### Check

- [ ] Projected views
- [ ] Sections

---

## Lesson 12. The 3D view in depth

### Goal

Use the 3D view: views, wireframe, axes and the light (sun).

### Steps

1. **Draw styles and axes** — The style button on the 3D bar picks one of ten looks: as is, shaded, hidden line, X-ray, sketch, wireframe and more. The axes (with ticks) switch on and off. The ground grid keeps 5 × 5 cells while zooming.

   ![The 3D view in depth · Draw styles and axes](doc/images/en/l12-s1.webp)

   *The 3D view in depth · Draw styles and axes*

2. **The light (sun)** — Drag the sun to move the light; double-click switches it. Clicking the sun shows azimuth, elevation, strength, colour and shadows in the properties.

   ![The 3D view in depth · The light (sun)](doc/images/en/l12-s2.webp)

   *The 3D view in depth · The light (sun)*

3. **Back to 2D** — Close the 3D view.

   ![The 3D view in depth · Back to 2D](doc/images/en/l12-s3.webp)

   *The 3D view in depth · Back to 2D*

### Your turn

- Click the style button on the 3D bar and pick X-ray or sketch.
- Drag or click the sun and change its azimuth.
- Click the 3D view button.

### Tips

- Ctrl+Shift+G switches the light.
- The 3D ground grid keeps 5 × 5 cells while zooming, like the 2D one.

### Check

- [ ] Draw styles and axes
- [ ] The light (sun)
- [ ] Back to 2D

---

## Lesson 13. Files: save, open, import, export

### Goal

Save and open drawings; import and export other CAD formats (DXF, SVG, IGES, HP-GL, Gerber, Excellon, FreeCAD, STEP).

### Steps

1. **Save and open** — Ctrl+S saves a .mcad file, Ctrl+O opens. Recent files and the last folder are remembered; the last drawings reopen at start-up.

   ![Files: save, open, import, export · Save and open](doc/images/en/l13-s1.webp)

   *Files: save, open, import, export · Save and open*

2. **Opening other CAD drawings** — DXF (text and binary, R12–2018), SVG, IGES, HP-GL, Gerber and Excellon open too. Open an IGES file made by FreeCAD.

   ![Files: save, open, import, export · Opening other CAD drawings](doc/images/en/l13-s2.webp)

   *Files: save, open, import, export · Opening other CAD drawings*

3. **PCB Gerber** — Gerber is the standard for PCB copper and silkscreen layers. Pads, tracks (with their widths) and copper areas open as drawn.

   ![Files: save, open, import, export · PCB Gerber](doc/images/en/l13-s3.webp)

   *Files: save, open, import, export · PCB Gerber*

4. **Exporting** — The export menu: DXF R12 and 2000, SVG, IGES, HP-GL/2, PNG, STL for 3D printing, and 3D formats (FreeCAD, STEP, 3MF…).

   ![Files: save, open, import, export · Exporting](doc/images/en/l13-s4.webp)

   *Files: save, open, import, export · Exporting*

   ![Exporting — window](doc/images/en/l13-s4-dialog.webp)

   *Exporting — window*

5. **Drag and drop** — Drop drawings and 3D models from the file manager to open them; images become the background, text is pasted as text.

   ![Files: save, open, import, export · Drag and drop](doc/images/en/l13-s5.webp)

   *Files: save, open, import, export · Drag and drop*

### Your turn

- Open a DXF, IGES or SVG file with Open (Ctrl+O) or the start page.
- Open the Gerber sample.

### Tips

- Binary DXF and old ANSI (cp949…) DXF files open too.
- All formats are listed in Help › About › File formats.

### Common mistakes

- Imported drawings ask for a .mcad name when saved (the original file stays as it is).

### Check

- [ ] Save and open
- [ ] Opening other CAD drawings
- [ ] PCB Gerber
- [ ] Exporting
- [ ] Drag and drop

---

## Lesson 14. Printing and 3D printing

### Goal

Print or save PDF from the print preview, and make STL files for 3D printing.

### Steps

1. **Print preview** — The print window (Ctrl+P) sets paper, orientation, margins, scale, title block, black-and-white and what to print (drawings, layers, selection). It also saves PDF.

   ![Printing and 3D printing · Print preview](doc/images/en/l14-s1.webp)

   *Printing and 3D printing · Print preview*

   ![Print preview — window](doc/images/en/l14-s1-dialog.webp)

   *Print preview — window*

2. **3D printing (STL)** — The STL window turns closed outlines into a plate of a given thickness (holes included) and shows it; solids are included too.

   ![Printing and 3D printing · 3D printing (STL)](doc/images/en/l14-s2.webp)

   *Printing and 3D printing · 3D printing (STL)*

   ![3D printing (STL) — window](doc/images/en/l14-s2-dialog.webp)

   *3D printing (STL) — window*

### Tips

- Black-and-white printing makes coloured lines black.

### Check

- [ ] Print preview
- [ ] 3D printing (STL)

---

## Lesson 15. Settings and appearance

### Goal

Go through the settings tabs and change the theme, toolbar and panels.

### Steps

1. **The settings window** — Settings (Ctrl+,) has General, Appearance, Font, Background, Drawing, Snaps, Recent files and Shortcuts tabs.

   ![Settings and appearance · The settings window](doc/images/en/l15-s1.webp)

   *Settings and appearance · The settings window*

   ![The settings window — window](doc/images/en/l15-s1-dialog.webp)

   *The settings window — window*

2. **Themes** — The theme button switches to the next theme; ▾ opens the picker with 40 dark and light themes. You can make your own as well.

   ![Settings and appearance · Themes](doc/images/en/l15-s2.webp)

   *Settings and appearance · Themes*

3. **Toolbar and panel groups** — In a narrow window put the toolbar on two rows. Fold groups of the left panel by their headers; the buttons at the top fold or unfold all.

   ![Settings and appearance · Toolbar and panel groups](doc/images/en/l15-s3.webp)

   *Settings and appearance · Toolbar and panel groups*

### Your turn

- Click the theme button.

### Tips

- Make your own theme colour by colour in the Appearance tab.

### Check

- [ ] The settings window
- [ ] Themes
- [ ] Toolbar and panel groups

---

## Lesson 16. Help

### Goal

Help: the feature list, About (file formats), the tutorial and this document.

### Steps

1. **Feature list** — Help › Feature list compares every FreeCAD feature: supported, partly supported, not supported.

   ![Help · Feature list](doc/images/en/l16-s1.webp)

   *Help · Feature list*

   ![Feature list — window](doc/images/en/l16-s1-dialog.webp)

   *Feature list — window*

2. **About and file formats** — About (F1) shows the build and a "File formats" tab.

   ![Help · About and file formats](doc/images/en/l16-s2.webp)

   *Help · About and file formats*

   ![About and file formats — window](doc/images/en/l16-s2-dialog.webp)

   *About and file formats — window*

3. **The tutorial again** — Open the tutorial any time from the Help menu or the start page. doc/Tutorial.md has the same lessons with pictures.

   ![Help · The tutorial again](doc/images/en/l16-s3.webp)

   *Help · The tutorial again*

### Tips

- The tutorial video is MyCAD-Tutorial.mp4 in the project folder.

### Check

- [ ] Feature list
- [ ] About and file formats
- [ ] The tutorial again

---

## Lesson 17. Assembly and motion

### Goal



### Steps

1. **A moving sample** — Open the sample "Single-cylinder engine (moving)": it moves in the 3D view at once. Crank, connecting rod and piston are joined into a closed loop, which MyCAD solves at every moment to place the piston (FreeCAD Assembly).

   ![Assembly and motion · A moving sample](doc/images/en/l17-s1.webp)

   *Assembly and motion · A moving sample*

2. **The play bar** — The play bar under the 3D view: play and pause, back to the start, the time slider (drag to a moment), loop, back and forth or once, and the time for one run. The save button keeps the pose in the drawing.

   ![Assembly and motion · The play bar](doc/images/en/l17-s2.webp)

   *Assembly and motion · The play bar*

3. **Joints and drives** — Pick two solids in turn (the first is the base) and click Revolute joint in the 3D solid menu: a hinge. Give the drive a start and end in the properties and it turns that far when played. Gears, belts, racks and screws are linked by a coupling ratio.

   ![Assembly and motion · Joints and drives](doc/images/en/l17-s3.webp)

   *Assembly and motion · Joints and drives*

### Your turn

- Open the sample "Single-cylinder engine (moving)" from the start page.
- Click the pause button on the play bar.
- Pick two solids in turn and add a revolute joint.

### Check

- [ ] A moving sample
- [ ] The play bar
- [ ] Joints and drives

---

## Lesson 18. Exact solids (OpenCASCADE)

### Goal



### Steps

1. **Booleans on curved faces** — With OpenCASCADE, the kernel FreeCAD uses, booleans, fillets and drafts keep their curved faces and exact volumes. STEP, IGES and FCStd exports keep the cylinders and spheres too.

   ![Exact solids (OpenCASCADE) · Booleans on curved faces](doc/images/en/l18-s1.webp)

   *Exact solids (OpenCASCADE) · Booleans on curved faces*

2. **Fillet and draft** — Select a solid: Fillet rounds its edges, Draft leans its sides — the draft for casting and moulding.

   ![Exact solids (OpenCASCADE) · Fillet and draft](doc/images/en/l18-s2.webp)

   *Exact solids (OpenCASCADE) · Fillet and draft*

3. **Picking edges in 3D** — Select the fillet and click "Pick edges in 3D": the edges show blue. Only the ones you click are rounded (orange). Picked edges are kept by place and direction, so they are found again when the box changes size (topological naming).

   ![Exact solids (OpenCASCADE) · Picking edges in 3D](doc/images/en/l18-s3.webp)

   *Exact solids (OpenCASCADE) · Picking edges in 3D*

### Your turn

- Select two solids and click Cut.
- Select a solid and add a fillet or a draft.
- Select the fillet, click "Pick edges in 3D" and click an edge.

### Check

- [ ] Booleans on curved faces
- [ ] Fillet and draft
- [ ] Picking edges in 3D

---

## Lesson 19. CAM in 3D and simulation

### Goal



### Steps

1. **3D roughing and finishing** — Select a solid and open CAM: the 3D operations are chosen. Roughing clears level by level, leaving stock on; finishing runs a ball end mill over the surface (drop-cutter: the tool never cuts into the model).

   ![CAM in 3D and simulation · 3D roughing and finishing](doc/images/en/l19-s1.webp)

   *CAM in 3D and simulation · 3D roughing and finishing*

   ![3D roughing and finishing — window](doc/images/en/l19-s1-dialog.webp)

   *3D roughing and finishing — window*

2. **Simulation and the machined stock** — In the CAM window's Simulation tab, play to watch the stock being cut and check gouges and the material left. "Machined stock solid" puts the cut stock in the drawing.

   ![CAM in 3D and simulation · Simulation and the machined stock](doc/images/en/l19-s2.webp)

   *CAM in 3D and simulation · Simulation and the machined stock*

### Check

- [ ] 3D roughing and finishing
- [ ] Simulation and the machined stock

---

## Lesson 20. FEM: plates and solids

### Goal



### Steps

1. **Plate stress (plane stress)** — Select a closed outline (holes too) and open FEM plate stress. Supports and loads go on its sides; you get the von Mises colours and the deformed shape — the stress about three times higher round the hole.

   ![FEM: plates and solids · Plate stress (plane stress)](doc/images/en/l20-s1.webp)

   *FEM: plates and solids · Plate stress (plane stress)*

2. **Solids (3D) and CalculiX** — Select a solid and open FEM solid analysis: it is filled with brick elements, clamped, loaded (and its own weight) and solved. Save .inp for CalculiX and FreeCAD FEM, or, with CalculiX installed, solve the same model there and compare (within 1 %).

   ![FEM: plates and solids · Solids (3D) and CalculiX](doc/images/en/l20-s2.webp)

   *FEM: plates and solids · Solids (3D) and CalculiX*

   ![Solids (3D) and CalculiX — window](doc/images/en/l20-s2-dialog.webp)

   *Solids (3D) and CalculiX — window*

### Check

- [ ] Plate stress (plane stress)
- [ ] Solids (3D) and CalculiX

---

## Lesson 21. The Python console and macros

### Goal



### Steps

1. **Making a model in Python** — Choose Python in the script console (Ctrl+Shift+J) and write as in FreeCAD macros: import Part, Part.makeBox(…).cut(…), Part.show(…). The mycad module reaches the whole drawing.

   ![The Python console and macros · Making a model in Python](doc/images/en/l21-s1.webp)

   *The Python console and macros · Making a model in Python*

2. **The addon manager** — The addon manager installs, updates, removes and runs macros (Python, JavaScript) from the catalogue that comes with MyCAD, a web address or a file.

   ![The Python console and macros · The addon manager](doc/images/en/l21-s2.webp)

   *The Python console and macros · The addon manager*

   ![The addon manager — window](doc/images/en/l21-s2-dialog.webp)

   *The addon manager — window*

### Your turn

- Choose Python in the console and run Part.show(Part.makeBox(10, 20, 30)).

### Check

- [ ] Making a model in Python
- [ ] The addon manager

---

## Appendix A. Keyboard shortcuts

| Key | Action |
|---|---|
| `Ctrl+N` | New drawing |
| `Ctrl+O` | Open |
| `Ctrl+S / Ctrl+Shift+S` | Save / Save as |
| `Ctrl+P` | Print |
| `Ctrl+Z / Ctrl+Y` | Undo / Redo |
| `Ctrl+X / C / V` | Cut / Copy / Paste |
| `Ctrl+D` | Duplicate |
| `Delete` | Delete |
| `Ctrl+Shift+E` | Explode |
| `Ctrl+R` | Rulers |
| `Ctrl+Shift+B` | Scale bar |
| `Ctrl+Shift+3` | 3D view |
| `Ctrl+Shift+G` | Light on/off |
| `Ctrl+I` | Import a 3D model |
| `Ctrl+Shift+P` | 3D printing (STL) |
| `Ctrl+,` | Settings |
| `Ctrl+1 / Ctrl+2` | Tool panel / properties panel |
| `Ctrl+Tab` | Next tab |
| `Home` | Zoom to fit |
| `F1` | About |
| `F3 / F7 / F8 / F9` | Object snap / grid / ortho / grid snap |
| `Esc` | Cancel · back to select |
| `Enter` | Finish drawing |
| `L R C A` | Line · rectangle · circle · arc (other keys in the tooltips) |

## Appendix B. File formats

| Format | Extensions | Read | Write |
|---|---|:---:|:---:|
| MyCAD | `.mcad` `.json` | ✓ | ✓ |
| AutoCAD DXF (R12 – 2018, text · binary) | `.dxf` | ✓ | ✓ |
| SVG | `.svg` | ✓ | ✓ |
| IGES 5.3 | `.igs` `.iges` | ✓ | ✓ |
| HP-GL/2 | `.plt` `.hpgl` `.hgl` `.hp2` `.pen` | ✓ | ✓ |
| Gerber RS-274X | `.gbr` `.ger` `.gtl` `.gbl` `.gto` `.gbo` `.gts` `.gbs` `.gtp` `.gbp` `.gko` `.gm1` `.gml` `.art` `.pho` | ✓ |  |
| Excellon drill | `.drl` `.xln` `.exc` `.drd` | ✓ |  |
| PNG | `.png` |  | ✓ |
| FreeCAD | `.FCStd` | ✓ | ✓ |
| IFC 4 (BIM) | `.ifc` | ✓ | ✓ |
| STEP AP214 | `.step` `.stp` | ✓ | ✓ |
| STL | `.stl` | ✓ | ✓ |
| Wavefront OBJ | `.obj` | ✓ | ✓ |
| Stanford PLY | `.ply` | ✓ | ✓ |
| Object File Format | `.off` | ✓ | ✓ |
| Additive Manufacturing (AMF) | `.amf` | ✓ | ✓ |
| VRML 2.0 (VRML97) | `.wrl` `.vrml` | ✓ | ✓ |
| COLLADA | `.dae` | ✓ | ✓ |
| OpenCASCADE BREP | `.brep` `.brp` | ✓ | ✓ |
| OpenSCAD (CSG) | `.scad` `.csg` | ✓ | ✓ |
| Point cloud (XYZ, ASC, PTS, PCD) | `.xyz` `.asc` `.pts` `.pcd` | ✓ | ✓ |
| G-code (CAM) | `.nc` `.gcode` `.ngc` `.tap` |  | ✓ |
| KUKA KRL (Robot) | `.src` |  | ✓ |
| 3D Manufacturing (3MF) | `.3mf` | ✓ | ✓ |
| Images | `.png` `.jpg` `.jpeg` `.gif` `.webp` `.bmp` `.svg` `.avif` `.ico` | ✓ |  |
| Text | `.txt` `.md` `.csv` | ✓ |  |

## Appendix C. Feature index

| Feature | Lesson |
|---|---|
| The start page | [Lesson 1](#lesson-1-finding-your-way-around) |
| Opening a sample | [Lesson 1](#lesson-1-finding-your-way-around) |
| Zoom to fit and zoom | [Lesson 1](#lesson-1-finding-your-way-around) |
| Panning | [Lesson 1](#lesson-1-finding-your-way-around) |
| Panels | [Lesson 1](#lesson-1-finding-your-way-around) |
| The 3D view | [Lesson 1](#lesson-1-finding-your-way-around) |
| A new drawing | [Lesson 2](#lesson-2-drawing-lines-and-shapes) |
| Lines (L) | [Lesson 2](#lesson-2-drawing-lines-and-shapes) |
| Rectangles (R) | [Lesson 2](#lesson-2-drawing-lines-and-shapes) |
| Circles (C) | [Lesson 2](#lesson-2-drawing-lines-and-shapes) |
| Arcs (3 points) | [Lesson 2](#lesson-2-drawing-lines-and-shapes) |
| Ellipses | [Lesson 2](#lesson-2-drawing-lines-and-shapes) |
| Polygons | [Lesson 2](#lesson-2-drawing-lines-and-shapes) |
| Polylines | [Lesson 2](#lesson-2-drawing-lines-and-shapes) |
| Splines | [Lesson 2](#lesson-2-drawing-lines-and-shapes) |
| Points | [Lesson 2](#lesson-2-drawing-lines-and-shapes) |
| Typing coordinates | [Lesson 3](#lesson-3-precise-input-snaps-and-units) |
| Polar: distance<angle | [Lesson 3](#lesson-3-precise-input-snaps-and-units) |
| Object snap (F3) | [Lesson 3](#lesson-3-precise-input-snaps-and-units) |
| Ortho mode (F8) | [Lesson 3](#lesson-3-precise-input-snaps-and-units) |
| Length units | [Lesson 3](#lesson-3-precise-input-snaps-and-units) |
| Typing other units | [Lesson 3](#lesson-3-precise-input-snaps-and-units) |
| The scale bar | [Lesson 3](#lesson-3-precise-input-snaps-and-units) |
| Set-up: a rectangle and a circle | [Lesson 4](#lesson-4-selecting-and-modifying) |
| Selecting | [Lesson 4](#lesson-4-selecting-and-modifying) |
| Move (M) | [Lesson 4](#lesson-4-selecting-and-modifying) |
| Copy | [Lesson 4](#lesson-4-selecting-and-modifying) |
| Rotate | [Lesson 4](#lesson-4-selecting-and-modifying) |
| Mirror | [Lesson 4](#lesson-4-selecting-and-modifying) |
| Scale | [Lesson 4](#lesson-4-selecting-and-modifying) |
| Offset | [Lesson 4](#lesson-4-selecting-and-modifying) |
| Arrays | [Lesson 4](#lesson-4-selecting-and-modifying) |
| Explode | [Lesson 4](#lesson-4-selecting-and-modifying) |
| Undo and redo | [Lesson 4](#lesson-4-selecting-and-modifying) |
| Delete | [Lesson 4](#lesson-4-selecting-and-modifying) |
| Set-up: a plate and a hole | [Lesson 5](#lesson-5-dimensions-and-notes) |
| Linear dimensions | [Lesson 5](#lesson-5-dimensions-and-notes) |
| Aligned dimensions | [Lesson 5](#lesson-5-dimensions-and-notes) |
| Diameter and radius | [Lesson 5](#lesson-5-dimensions-and-notes) |
| Angle dimensions | [Lesson 5](#lesson-5-dimensions-and-notes) |
| Text | [Lesson 5](#lesson-5-dimensions-and-notes) |
| Leaders | [Lesson 5](#lesson-5-dimensions-and-notes) |
| Hatching | [Lesson 5](#lesson-5-dimensions-and-notes) |
| Centre lines | [Lesson 5](#lesson-5-dimensions-and-notes) |
| Measuring | [Lesson 5](#lesson-5-dimensions-and-notes) |
| Editing in the properties | [Lesson 6](#lesson-6-properties-and-layers) |
| Formulas and units | [Lesson 6](#lesson-6-properties-and-layers) |
| Line type, width and colour | [Lesson 6](#lesson-6-properties-and-layers) |
| Layers | [Lesson 6](#lesson-6-properties-and-layers) |
| Placing a gear | [Lesson 7](#lesson-7-the-parts-library) |
| Bolts and nuts | [Lesson 7](#lesson-7-the-parts-library) |
| Changing a part | [Lesson 7](#lesson-7-the-parts-library) |
| A box | [Lesson 8](#lesson-8-3d-solids) |
| A cylinder | [Lesson 8](#lesson-8-3d-solids) |
| Seeing it in 3D | [Lesson 8](#lesson-8-3d-solids) |
| Views | [Lesson 8](#lesson-8-3d-solids) |
| Position and rotation | [Lesson 8](#lesson-8-3d-solids) |
| Back to 2D | [Lesson 8](#lesson-8-3d-solids) |
| Pad (extrude) | [Lesson 9](#lesson-9-2d-to-3d-pad-revolve-loft-sweep) |
| Revolve | [Lesson 9](#lesson-9-2d-to-3d-pad-revolve-loft-sweep) |
| Loft | [Lesson 9](#lesson-9-2d-to-3d-pad-revolve-loft-sweep) |
| Sweep | [Lesson 9](#lesson-9-2d-to-3d-pad-revolve-loft-sweep) |
| Cut | [Lesson 10](#lesson-10-booleans-cut-fuse-common) |
| Fuse | [Lesson 10](#lesson-10-booleans-cut-fuse-common) |
| Explode gives the parts back | [Lesson 10](#lesson-10-booleans-cut-fuse-common) |
| Projected views | [Lesson 11](#lesson-11-drawing-views-and-sections) |
| Sections | [Lesson 11](#lesson-11-drawing-views-and-sections) |
| Draw styles and axes | [Lesson 12](#lesson-12-the-3d-view-in-depth) |
| The light (sun) | [Lesson 12](#lesson-12-the-3d-view-in-depth) |
| Back to 2D | [Lesson 12](#lesson-12-the-3d-view-in-depth) |
| Save and open | [Lesson 13](#lesson-13-files-save-open-import-export) |
| Opening other CAD drawings | [Lesson 13](#lesson-13-files-save-open-import-export) |
| PCB Gerber | [Lesson 13](#lesson-13-files-save-open-import-export) |
| Exporting | [Lesson 13](#lesson-13-files-save-open-import-export) |
| Drag and drop | [Lesson 13](#lesson-13-files-save-open-import-export) |
| Print preview | [Lesson 14](#lesson-14-printing-and-3d-printing) |
| 3D printing (STL) | [Lesson 14](#lesson-14-printing-and-3d-printing) |
| The settings window | [Lesson 15](#lesson-15-settings-and-appearance) |
| Themes | [Lesson 15](#lesson-15-settings-and-appearance) |
| Toolbar and panel groups | [Lesson 15](#lesson-15-settings-and-appearance) |
| Feature list | [Lesson 16](#lesson-16-help) |
| About and file formats | [Lesson 16](#lesson-16-help) |
| The tutorial again | [Lesson 16](#lesson-16-help) |
| A moving sample | [Lesson 17](#lesson-17-assembly-and-motion) |
| The play bar | [Lesson 17](#lesson-17-assembly-and-motion) |
| Joints and drives | [Lesson 17](#lesson-17-assembly-and-motion) |
| Booleans on curved faces | [Lesson 18](#lesson-18-exact-solids-opencascade) |
| Fillet and draft | [Lesson 18](#lesson-18-exact-solids-opencascade) |
| Picking edges in 3D | [Lesson 18](#lesson-18-exact-solids-opencascade) |
| 3D roughing and finishing | [Lesson 19](#lesson-19-cam-in-3d-and-simulation) |
| Simulation and the machined stock | [Lesson 19](#lesson-19-cam-in-3d-and-simulation) |
| Plate stress (plane stress) | [Lesson 20](#lesson-20-fem-plates-and-solids) |
| Solids (3D) and CalculiX | [Lesson 20](#lesson-20-fem-plates-and-solids) |
| Making a model in Python | [Lesson 21](#lesson-21-the-python-console-and-macros) |
| The addon manager | [Lesson 21](#lesson-21-the-python-console-and-macros) |
