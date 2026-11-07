# My3DBlender User's Guide

My3DBlender is a 3D creation program for web browsers, Windows, macOS and Linux. It covers modeling, sculpting, materials and nodes, animation, physics, rendering and scripting in one window. It is an independent program inspired by Blender and has no connection with the Blender Foundation.

It does not yet do everything Blender does. **Help › Feature Coverage** shows, item by item, what is done, partial or planned.

## The start screen

The program opens with the start screen and a window asking whether to run the tutorial. **Run the Tutorial** starts a step-by-step course inside the window. It shows where to look, ticks itself off as you work, and **Do It for Me** moves on for you. **Help › Tutorial** starts it again at any time. Turning off **Show this at startup** in that window stops it coming back, and **Preferences › Start and Tutorial** turns it on again. The **Start** button right of the name in the top bar opens and closes it at any time. Translucent cards sit on a moving background, and the screen scrolls when they do not fit.

![The start screen](images/en/start.png)

- **Tools at the top**: show at startup, Start Screen Settings, Auto Arrange
- **Intro card**: the program's name, New Project, Open, Samples, Tutorial, User's Guide
- **Menu card**: New Project, Empty Scene, Open, Import, Samples, Theme, language, Preferences, About, Exit (desktop)
- **Recent projects card**: files opened lately. The bin button takes one off the list (desktop)
- **Sample Projects card**: a section of its own under the recent projects. Choose by level, each with a small picture
- **Theme card**: dark and light themes
- **Background card**: 20 moving backgrounds, Auto change, Speed, Card opacity
- **Bottom line**: version and author

A card moves by the dots left of its title and resizes by its bottom right corner. While dragging, a see-through copy follows the pointer, a dashed outline shows where the card will land, and the others make way so that nothing overlaps. Double-clicking the corner fits the card to its content again, and **Auto Arrange** puts the whole board back. The background and card settings are also in **Preferences**.

## Sample projects

The `sample` folder holds samples by level. Choose one in the **Sample Projects** section of the start screen, or open the window with larger pictures from **File › Samples**. Choose a level and click to open. The status bar then says what to try. Saving asks for a new name, so the original stays as it is. Samples with a simulation bake it when they open.

| Level | What is in it |
|---|---|
| Beginner | Adding shapes, moving, materials, lights, keyframes, one modifier |
| Intermediate | Several modifiers, shader and world nodes, rigs, cloth, rigid bodies, particles, instances, compositing |
| Advanced | Geometry nodes, smoke, fire, liquid, ocean, Python, add-ons, node groups, OSL, sequencer, motion tracking, NURBS, multiresolution |

## The screen

The bar at the top has the File, Edit, Render, Window and Help menus, the workspace tabs, and the language, theme, preferences and about buttons. Below it are the editor areas, and at the bottom the status bar.

The button at the top left of an area changes its editor type. Right-click an area's header for split, join and maximize. Drag the border between two areas to resize them.

| Workspace | For |
|---|---|
| Layout | Arranging the scene, with a timeline |
| Modeling | Editing meshes |
| Sculpting | Shaping with brushes |
| UV | Unwrapping and adjusting UVs |
| Paint | Painting on textures |
| Shading | Materials and shader nodes |
| Animation | Dope sheet and keyframes |
| Rendering | Render results and settings |
| Compositing | Compositor nodes |
| Geo Nodes | Building shapes with nodes |
| Video | The Video Sequencer |
| Tracking | Movie clips and camera solving |
| Assets | The Asset Browser |
| Scripting | Scripts and the console |

## Moving around in the 3D view

| Action | Input |
|---|---|
| Turn the view | Drag with the right button, the middle button, Alt + left button, or drag the axis widget at the top right |
| Pan | Shift + drag with the right or middle button, or drag the hand button |
| Zoom | Wheel, Ctrl + drag with the right or middle button, or drag the magnifier button |
| Front, right, top view | Numpad 1, 3, 7 (with Ctrl: the opposite side) |
| Camera view | Numpad 0 |
| Perspective / orthographic | Numpad 5 |
| Frame all, frame selected | Home, Numpad . |
| Toolbar, sidebar | T, N |
| Operator search | F3 |

The right button opens the menu when it is pressed without dragging. Every fifth grid line is a heavier one, and zooming redraws the grid with its spacing changed five times over. The grid is always drawn behind the shapes, and looking along an axis it stands across the view. The right column and the side panels fold and unfold with the arrow in their heading. Z opens a round menu of shading modes. The search box at the top of the Properties editor finds settings on the current tab. In Edit Mode, K is the knife: click along the cut and press Enter, and C cuts through to the far side. Shift+Tab turns snapping on and off, and the menu beside it chooses vertex, edge, face or object centre. To make a left button drag turn the view, use **Preferences › Navigation**. On a touchpad, drag the axis widget at the top right, or the hand and magnifier buttons. Clicking an axis looks along it. The buttons on the right of the header choose wireframe, solid, material preview or rendered shading.

## Objects

Click with the left button to select; hold Shift to add to the selection. Drag from an empty spot for box select. Shift + right button places the 3D cursor, and new objects appear there.

| Action | Input |
|---|---|
| Move, rotate, scale | G, R, S |
| Limit to an axis | Then X, Y, Z |
| Type a value | Then a number, Enter to confirm |
| Cancel | Esc or right button |
| Add menu | Shift + A |
| Duplicate, delete | Shift + D, X |
| Hide, show | H, Alt + H |
| Join, set parent | Ctrl + J, Ctrl + P |
| Insert keyframe | I |

To turn the object itself, select it and press R, move the mouse and click, or pick the Rotate tool in the toolbar on the left and drag the ring that appears. The Move and Scale tools work the same way.

### Instances

The same thing drawn many times without making copies. Change the original and they all change.

- **Collection instance**: make a collection, put objects in it, then choose it under **Add › Collection Instance**. The original collection can stay turned off.
- **On vertices or faces**: parent a child to an object and choose vertices or faces under **Object › Instancing**.
- **Object › Instancing › Make Instances Real** turns each one into an ordinary object.

### Several scenes

The scene button at the right of the top bar makes a new scene, copies this one, deletes one and switches between them. Scenes share materials and images.

### NURBS surfaces

**Add › Surface** has patch, cylinder, sphere and torus. In Edit Mode (Tab) the control points show: click to select, G, R and S to move. Curves work the same. Resolution and order are in the Object Data tab.

## Editing meshes

Tab enters Edit Mode. 1, 2 and 3 choose vertex, edge or face selection.

| Tool | Input |
|---|---|
| Extrude | E |
| Inset faces | I |
| Bevel | Ctrl + B |
| Loop cut | Ctrl + R (at the edge nearest the mouse) |
| Make edge/face | F |
| Merge | M |
| Delete | X |
| Select linked | L, Ctrl + L |
| Separate selection | P |
| Rip | V |
| Proportional editing on or off | O (the wheel sets its reach during a transform) |
| Edge crease | Shift + E |
| Unwrap | U |

After a tool with values, such as Inset or Bevel, the **Adjust Last Operation** panel appears at the bottom left of the 3D view. Changing a value recalculates the result on the spot.

The Edge entry of the Mesh menu marks seams, sharp edges and creases. In Edit Mode marked edges show red (seam), cyan (sharp) and pink (crease). A sharp edge breaks smooth shading there; a crease keeps subdivision from rounding that edge. The Normals entry sets custom split normals.

### Unwrapping UVs

Select edges and use Mesh › Edge › Mark Seam to say where to cut, then press U. The mesh splits into islands along the seams, each is flattened keeping its angles as far as it can (LSCM), and they are packed into the square. A closed mesh with no seams is cut by face direction automatically.

## Modifiers

Add them in the Modifiers tab of the Properties editor. They run in order without changing the original mesh, and Apply bakes one into it. They include Subdivision Surface, Mirror, Array, Solidify, Bevel, Decimate, Boolean, Screw, Weld, Wireframe, Displace, Wave, Smooth, Simple Deform, Cast, Shrinkwrap, Lattice, Armature, Geometry Nodes, Remesh, Multiresolution, Skin and Ocean. Skin grows a surface around edges, and Ocean makes a sea surface that moves with the frame. Multiresolution gains levels from the Subdivide button on its panel; sculpting then stores the result on the top level and leaves the original mesh as it is.

## Sculpt and paint

Choose Sculpt, Vertex Paint, Weight Paint or Texture Paint from the mode list in the header. Drag in the 3D view to apply a brush; hold Ctrl for the opposite effect. The bracket keys or Ctrl + wheel change the brush size. Brush settings are in the N sidebar.

In Sculpt, turning on **Dynamic Topology** in the sidebar divides the mesh around the brush to the detail size. **Voxel Remesh** rebuilds the whole mesh with even faces.

### Texture paint

Go to the Paint workspace and press **Add Paint Texture** in the sidebar: it makes an image and connects it to the material. If the UVs are missing or faces overlap, it unwraps first. Drag on the model to paint; the picture shows in the Image Editor on the left too. The brush button in the Image Editor's header lets you paint on the picture directly.

## Materials and nodes

Make a material in the Material tab of the Properties editor; Use Nodes lets you edit it in the Node Editor. Drag from socket to socket to link, and drag a link off an input to remove it. Add nodes with Shift + A or the right button, and delete them with X.

The Node Editor's header chooses the shader, world, geometry or compositor tree.

![The Shading workspace](images/en/shading.png)

### Node groups

Shift-click to pick several nodes and press Ctrl + G to make a group. Links crossing its edge become its sockets. Select the group and press Tab to go in, and Tab again to come out; other nodes using the same group change too. Alt + G ungroups. Groups you made are under **Add › Node Groups**.

### OSL scripts

In a shader tree, **Add › Texture › Script (OSL)** is a node you write code in. Parameters become sockets. It has numbers and triples, control flow and about 40 functions.

```
shader Rings(float Scale = 7, color A = color(1, 0.8, 0.2), output color Color = 0)
{
    Color = A * fract(length(P) * Scale);
}
```

## Animation

In the Dope Sheet and Graph Editor, dragging in empty space selects keys with a box, and selected keys move together. A selects all, Alt+A none, X deletes the selection, Shift+D duplicates. Channels are grouped by property, and clicking a group's name folds it. In the Graph Editor a selected key shows handles to drag, and V changes their type (Auto, Vector, Aligned, Free). Clicking a channel on the left brings its extrapolation and F-curve modifiers (Cycles, Noise, Generator, Built-In Function, Stepped, Limits) to the panel on the right. The **Drivers** button in the Graph Editor's header switches to editing drivers. A driver's expression may use only numbers, variables and maths functions. In the NLA, clicking a strip sets its start, scale, repeat, reversal, blend in and out and hold, and it can be split or get a transition to the next strip. On an armature, **Add IK** on a bone gives it live inverse kinematics with a target and a pole, and **Calculate Bone Path** shows where the tip of the bone goes.

Set a frame and press I to key location, rotation and scale. Space plays; the left and right arrows step one frame. Dragging the timeline's ruler changes the frame. The Dope Sheet moves keys in time and the Graph Editor changes their values. The right-button menu chooses the interpolation.

**Object › Animation › Calculate Motion Path** draws the way an object goes. **Onion Skin** shows it faintly before and after the current frame.

## Physics

Turn on Rigid Body, Cloth, Soft Body or Collision in the Physics tab of the Properties editor, then press **Bake All Dynamics** to store the results per frame. Particles are added in the Particles tab.

![A smoke simulation](images/en/smoke.png)

| Simulation | How to make one |
|---|---|
| Smoke and fire | **Smoke Domain** on a big box, **Smoke Flow** on a small object in it. The flow's type is smoke, fire or both |
| Liquid | **Liquid Domain** on a big box, **Liquid Flow** where the water starts. An INFLOW keeps pouring. A mesh with **Collision** is an obstacle |
| Dynamic Paint | **Paint Canvas** on a floor, **Paint Brush** on what moves. Set fade, spread and dent |

Bakes are not saved in the file: after opening one, press **Bake All Simulations** again. Domains and flows show as lines in the view and not in the render.

## Rendering

F12 renders. There are two engines.

| Engine | What it does |
|---|---|
| Path Tracing (CPU) | Global illumination, glass, metal, depth of field. More samples are cleaner and slower |
| Path Tracing (GPU) | The same idea, faster, on the graphics card. Node materials count as one value, and it does not draw volumes |
| Real-time (GPU) | A fast raster render, with shadows and lights only |

The result appears in the Image Editor; the Render menu saves it as a PNG. The Output tab sets the resolution and frame range.

**Volumes** come from **Add › Volume**: fog, clouds and light shafts, drawn by Path Tracing (CPU). **Freestyle** in the Render tab draws lines on silhouettes, creases and borders.

## Scripting

In the Scripting workspace's Text Editor, Ctrl + Enter runs the script. A name ending in `.py` runs as Python, `.js` as JavaScript. The console chooses its language in its header.

The Python here is an interpreter written for this program. It has classes, comprehensions, exceptions, f-strings, `math`, `random` and `mathutils`. It has no C extensions, pip or generators, and `bpy` covers operators and scene data.

```
import bpy
bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 1))
bpy.context.active_object.scale[2] = 3
print(len(bpy.data.objects))
```

Every operator in the menus can be called through `bpy.ops`.

![The Scripting workspace](images/en/scripting.png)

### Add-ons

**Edit › Add-ons › Manage Add-ons** turns them on and off. Gears, Scatter Copies and Mesh Statistics come with the program, and you can install a `.py` or `.js` file. What an add-on adds appears under **Edit › Add-ons** and in F3. An add-on is a program: install only what you trust.

## Asset Browser

In the Assets workspace, materials and shapes are chosen by their pictures. A double-click puts a material on the selection and a shape at the 3D cursor. The header's buttons mark the active object as an asset of this file, or save it to My Library, which stays across files.

![The Asset Browser](images/en/assets.png)

## Video Sequencer

In the Video workspace, strips on a timeline make a film.

![The Video Sequencer](images/en/sequencer.png)

| Action | Input |
|---|---|
| Add a strip | Add in the header, the right button, or Shift + A |
| Move | Drag a strip (it goes up a channel rather than overlap) |
| Cut | K at the playhead |
| Delete | X |
| Transition | Select an overlapping strip, then Cross or Wipe |
| Change frame | Drag on the ruler |
| Zoom | Wheel |

Strips are colour, text, image, scene, movie clip or sound. **Export Video** records a WebM file in real time. Sound plays but does not go into the exported file.

## Motion tracking

In the Tracking workspace, **Open** opens a video. The sample `camera-solve` has a run of pictures.

![The Movie Clip Editor](images/en/clip.png)

1. Click a clear point in the picture to place a marker.
2. **Track ▶** follows it through later frames. It stops where it loses the point.
3. **Stabilize** moves the picture so that the tracks stay still.
4. With four or more tracks, **Solve Camera** makes 3D points and an animated camera. It assumes a far (orthographic) camera, so strong perspective raises the error, shown under the track list.

## Files

Projects are saved as `.my3d` files. Import and export are in the File menu. You can also drop a file on the window to import it.

| Format | Import | Export | Notes |
|---|---|---|---|
| OBJ | Yes | Yes | Faces, UVs, lines |
| STL | Yes | Yes | Vertices are welded on import |
| PLY | Yes | Yes | ASCII only, with vertex colours |
| glTF (.glb) | Yes | Yes | Meshes and base materials only |
| Blender (.blend) | Yes | No | Meshes, transforms, UVs, viewport colours; Blender 2.48 to 5.x. Append works too |
| FBX | Yes | Yes | Reads binary and ASCII, writes binary 7.4; no skins or animation |
| USD (.usda) | Yes | Yes | Text only; no binary .usdc or .usdz |
| Collada (.dae) | Yes | Yes | Meshes, node transforms, UVs, diffuse colours |
| SVG | Yes | No | Paths become curves |

File › Append copies objects with their materials from another `.my3d` or `.blend` file. A `.blend` compressed with Zstandard cannot be read yet: save it from Blender with compression off. Alembic is not supported yet.

## Settings and shortcuts

Preferences are six pages chosen from the list on the left, and **Restore Defaults** at the bottom left puts them back as they were. **Interface**: language, theme, interface scale (desktop), status bar, number of recent projects. **3D View**: grid, axis widget, tool names, gizmo size. **Navigation**: orbit, pan and zoom speed, wheel direction, right and left button drags. **Start and Tutorial**: start screen, tutorial question, background. **Packages**: the state of the outside package the program needs (the WebView2 Runtime), downloading and installing it, progress, stop. A failure asks whether to try again. **System**: undo steps, render threads, keys, add-ons. The installer also downloads and installs WebView2 by itself when it is missing, and asks whether to try again when that fails. The theme can also be changed from the top bar. In **Edit Keymap**, find an operator, click its key and press the new one. Backspace removes the key, Esc cancels, and a clash with another operator is marked.

| Action | Input |
|---|---|
| Undo, redo | Ctrl + Z, Ctrl + Shift + Z |
| Save, save as | Ctrl + S, Ctrl + Shift + S |
| Open, new | Ctrl + O, Ctrl + N |
| Maximize area | Ctrl + Space |
| Full screen | F11 |
