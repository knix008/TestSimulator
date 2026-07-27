# User's Guide

FloorPlanTo3D Multi-OS — how to install, convert floor plans, and use the 3D viewer.

한국어 UI와 English UI를 모두 지원합니다. 툴바의 **언어(KO/EN)** 버튼으로 전환하세요.

---

## 1. Requirements

- Node.js 18+ (recommended)
- Modern browser (Chrome / Edge / Firefox / Safari), **or**
- Electron desktop run (Windows / macOS / Linux)
- Optional: [FloorPlanTo3D-API](https://github.com/fadyazizz/FloorPlanTo3D-API) for Mask R-CNN detection

## 2. Install & run

```bash
npm install
npm start
```

`npm start` launches the **desktop app** (Electron + Vite) on Windows / macOS / Linux.

### Browser only

```bash
npm run dev
```

Open the URL shown in the terminal (default `http://localhost:5173/`).

### Electron notes

- `npm start` and `npm run electron:dev` are the same
- `npm run electron:build` builds `dist/` then opens Electron without the Vite server
- Electron’s default File/Edit/View menu is disabled. Use the **icon toolbar** at the top.

### Production build

```bash
npm run build
npm run preview          # browser
```

### Installer packages (Windows / macOS / Linux / Web)

```bash
npm run dist:web      # release/web/*.zip
npm run dist:win      # Windows NSIS Setup + portable exe
npm run dist:mac      # macOS dmg/zip (build on a Mac)
npm run dist:linux    # Linux AppImage + deb
npm run dist:all      # host-capable desktop targets + web zip
```

Artifacts are written to `release/`. See [release/README.md](./release/README.md).

| Platform | Installer type |
|---|---|
| Windows | `.exe` Setup (NSIS; Desktop/Start Menu shortcuts optional), portable `.exe` |
| macOS | `.dmg`, `.zip` (build on macOS) |
| Linux | `.tar.gz` portable; `.AppImage` / `.deb` (build on Linux) |
| Web | `.zip` static site package |

---

## 3. Main screen

```text
┌──────────────────────────────────────────────┐
│ Toolbar (icons)                              │
├──────────────┬───────────────────────────────┤
│ Side panel   │  3D viewport                  │
│ - image      │                               │
│ - analysis   │                               │
│ - customize  │                               │
│ - transform  │                               │
│ - lights     │                               │
│ - explore    │                               │
└──────────────┴───────────────────────────────┘
```

- **Toolbar**: quick actions (open, convert, move/rotate/scale, camera, axes, theme, language…)
- **Side panel**: detailed settings
- **Viewport**: interactive 3D scene

Use the **Panel** toolbar button to collapse/expand the side panel.

---

## 4. Convert a floor plan to 3D

### Step A — Choose an image

1. Click **Open** (toolbar) or **Choose image** (panel), **or**
2. Click one of the built-in **samples** in the panel, **or**
3. Drag and drop an image onto the viewport

### Open a 3D model (view only)

You can also open common 3D formats directly (no convert step):

- Toolbar **Open**, panel **Open 3D model**, or drag-and-drop onto the viewport
- Supported: **GLB/GLTF, OBJ(+MTL), STL, FBX, PLY, DAE, 3DS, 3MF, AMF, PCD, XYZ, VRML, GCode**

The model appears in the viewport; transform / lights / camera tools still apply. Use **Convert** again to return to a floor-plan build.

### Step B — Choose analysis mode

| Mode | When to use |
|---|---|
| **Demo data** | Instant preview without an image/API |
| **Local heuristic (offline)** | High-contrast line drawings, no server |
| **Mask R-CNN API** | Best detection quality with the Python API |

### Step C — Convert

Click **Convert** (toolbar) or **Convert to 3D** (panel).

The 3D model appears in the viewport. Status text under the convert button shows progress/result.

---

## 5. Customize the model

In **Customize**:

| Control | Effect |
|---|---|
| Scale | Overall plan size |
| Wall height | Wall extrusion height (m) |
| Wall thickness | Thin-axis thickness of walls (m) |
| Wall color / Floor color | Materials |

Changes apply immediately to the current detection result.

---

## 6. Axes & transform (X Y Z)

### Visibility

- **Axes helper**: classic RGB world axes (X red, Y green, Z blue)
- **Grid**: ground grid
- Individual **X / Y / Z** overlays (optional)

### Gizmo modes

The model stays centered (no move/translate). Use the camera to look around it.

| Mode | Shortcut | Action |
|---|---|---|
| Rotate | `R` | Rotate with mouse drag, gizmo rings, or 0–360° sliders |
| Scale | `S` | Scale model |

Also available:

- World / Local space
- Rotation (0–360° sliders), scale
- **Reset transform**

**Mouse**

- **Orbit camera**: left-drag to orbit, scroll to zoom, right-drag to pan
- **Rotate tool (`R`)**: left-drag spins the model; right-drag orbits the camera; gizmo rings for axis-locked rotation

---

## 7. Lights

| Control | Effect |
|---|---|
| Main / Fill / Ambient intensity | Brightness |
| Light color | Main directional light color |
| Light position X/Y/Z | Main light location |
| Light helper | Visual helper in the scene |
| Shadows | Enable/disable shadow casting |
| Light gizmo | Drag the main light in the viewport |

---

## 8. Camera / explore

| Mode | How to use |
|---|---|
| **Orbit camera** | Drag to orbit, scroll to zoom |
| **First-person tour** | `W A S D` move, drag to look |

Switch modes from the toolbar (**Orbit** / **Walk**) or the Explore section.

---

## 9. Theme & language

| Toolbar button | Behavior |
|---|---|
| **Theme** | Toggle Light / Dark (saved in `localStorage`) |
| **Lang (KO/EN)** | Toggle Korean / English (saved in `localStorage`) |

Defaults:

- Theme → OS preference if unset
- Language → browser language (`ko*` → Korean, otherwise English)

---

## 10. Samples

Built-in images live in root `samples/` — **2D floor plans only**.

Click a thumbnail to load it. For heuristic/API conversion, switch away from Demo mode (the app may auto-switch to heuristic when a sample is selected).

> Heuristic quality varies; API mode works best on clean 2D plans.

---

## 11. Optional Mask R-CNN API

1. Clone and run [FloorPlanTo3D-API](https://github.com/fadyazizz/FloorPlanTo3D-API)
2. Place model weights in that repo’s `weights/` folder
3. Start the server (`python application.py`, usually `http://127.0.0.1:5000/`)
4. In this app: set mode to **Mask R-CNN API**, confirm API URL, open an image, convert

---

## 12. Errors

- Simple validation (no image selected, empty API URL) appears in the status line.
- Serious errors open a **popup** with:
  - summary
  - detailed report (time, locale, URL, stack, context)
  - **Copy** button for clipboard

Close with **Close**, `Esc`, or by clicking outside the dialog.

---

## 13. Tips

- Prefer high-contrast black-on-white drawings for **heuristic** mode
- Use **Demo** to learn controls without an image
- If the model is too large/small, adjust **Scale** or door-based sizing via API `averageDoor`
- Use **Reset transform** if the model moves out of view
- Collapse the panel for a larger viewport on smaller screens

---

## 14. Related docs

- System design: [Architecture.md](./Architecture.md)
- Project overview: [README.md](./README.md)
