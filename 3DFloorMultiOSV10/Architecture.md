# Architecture

FloorPlanTo3D Multi-OS client architecture.

Inspired by [FloorPlanTo3D-unityClient](https://github.com/fadyazizz/FloorPlanTo3D-unityClient), this project replaces the Unity client with a **Vite + Three.js** app and an optional **Electron** shell.

**Author:** SHKWON \<knix008@naver.com\> · **Version:** 1.0.0

## Goals

- Convert **selected** 2D floor-plan images into editable 3D scenes
- Run on Windows / macOS / Linux (browser or Electron)
- Offline heuristic / DreamSpace detection modes
- Light helpers, free-axis viewing, multi-format load/export, i18n, theming

## High-level flow

```text
[Image / 3D model file]
        │
        ├─ model file ──▶ modelLoader ──▶ SceneApp.externalRoot
        │
        ▼ (convert)
 ┌────────────────────┐      ┌──────────────────┐
 │ Detection          │─────▶│ Detection JSON   │
 │ heuristic /        │      │ points[],        │
 │ dreamspace         │      │ classes[],       │
 │                    │      │ Width, Height…   │
 └────────────────────┘      └────────┬─────────┘
                                      │
                                      ▼
                           ┌──────────────────────┐
                           │ FloorPlanBuilder     │
                           │ walls / doors /      │
                           │ windows / floor      │
                           └──────────┬───────────┘
                                      │
                                      ▼
                           ┌──────────────────────┐
                           │ SceneApp (Three.js)  │
                           │ Trackball / gizmo /  │
                           │ lights / ray / save  │
                           └──────────────────────┘
```

### Convert policy

| Mode | Selected image present | No image |
|---|---|---|
| Heuristic | Detect from image | File dialog → then detect |
| DreamSpaceAI | Dedicated offline detector | File dialog → then detect |

## Runtime options

| Runtime | Entry | Notes |
|---|---|---|
| Browser (dev) | `npm run dev` | Vite HMR (~5173) |
| Browser (prod) | `npm run build` → `dist/` | Static, `base: './'` |
| Web package | `npm run dist:web` | Zip → **project root** + `release/web/` |
| Electron (dev) | `npm start` | Vite URL, no default app menu |
| Desktop installers | `npm run dist:win/mac/linux` | electron-builder → **project root** + `release/` |

Packaging stages under a temp dir, then copies installers to the root (and `release/`) to avoid IDE file locks. See `scripts/dist-desktop.mjs`, `scripts/package-web.mjs`.

Electron: `electron/main.cjs` + `electron/preload.cjs`  
- `Menu.setApplicationMenu(null)`  
- IPC for open/save dialogs

## Directory map

```text
3DFloorMultiOSV10/
├── electron/                  # Main + preload
├── index.html
├── vite.config.js
├── electron-builder.yml
├── samples/                   # Example plans / models
├── scripts/                   # icons, dist-desktop, package-web/all
├── src/
│   ├── main.js                # UI, convert, save, status
│   ├── detect/
│   │   ├── heuristic.js
│   │   ├── dreamspace.js
│   │   └── dreamspaceDetect.js
│   ├── builder/FloorPlanBuilder.js
│   ├── scene/SceneApp.js
│   ├── loaders/modelLoader.js
│   ├── exporters/modelExport.js
│   ├── desktop/bridge.js
│   ├── i18n/
│   └── ui/                    # toolbar, theme, dialogs, save
├── assets/                    # icon-src.png (master), generated icons ignored
├── Architecture.md
├── UsersGuide.md
└── README.md
```

## Module responsibilities

### `main.js`

- Toolbar / panel wiring
- Convert pipeline (mode-aware; image preferred over mock data)
- Rebuild on scale / wall / color changes
- Light HUD sync, save dialog, open image/model
- Theme / locale / error reporting

### Detection

| Mode | Module | Behavior |
|---|---|---|
| Heuristic | `detect/heuristic.js` | Ink mask + H/V runs → wall/door/window boxes |
| DreamSpace | `detect/dreamspaceDetect.js` | Centerline walls + double-line merge |

Payload shape (detection JSON):

```json
{
  "points": [{ "x1": 0, "y1": 0, "x2": 10, "y2": 2 }],
  "classes": [{ "name": "wall" }],
  "Width": 800,
  "Height": 600,
  "averageDoor": 40
}
```

`classes.name` ∈ `{ wall, window, door }`

### `FloorPlanBuilder`

Unity `Builder` / `WallMesh` ideas in Three.js:

- Axis-aligned boxes → `BoxGeometry` segments
- Pixel → meter via `averageDoor` (~0.9 m)
- Options: `scale`, `wallHeight`, `wallThickness`, colors, optional floor texture (plan image)

### `SceneApp`

- `TrackballControls` (full tumble; no polar lock)
- `TransformControls` (model rotate/scale in world space; light translate)
- Content modes: `plan2d` / `floorplan` / `model`
- Lights: directional main + fill + hemisphere; shadow map refresh on move
- Light helpers: marker, dashed ray from world origin `(0,0,0)` to light (toggled with **광원 표시**)
- Axes / grid; theme-aware clear color
- Transparent PNG capture (helpers hidden)

### Load / export

| Module | Role |
|---|---|
| `loaders/modelLoader.js` | Multi-format import; promote unlit materials so lights affect shading |
| `exporters/modelExport.js` | GLB/GLTF/OBJ/STL/PLY/USDZ (+ PNG via SceneApp) |
| `ui/saveDialog.js` | Format picker |
| `desktop/bridge.js` | Electron save/open IPC |

### UI

| Module | Role |
|---|---|
| `ui/toolbar.js` | Image, model, convert, save, transform, helpers, light, reset, theme, lang, info |
| `ui/theme.js` | Light/Dark (`fp3d-theme`) |
| `ui/infoDialog.js` / `errorDialog.js` | About / serious errors (i18n + theme) |
| `i18n/*` | KO/EN (`fp3d-locale`) |

## Cross-cutting

### Theming

CSS variables under `html[data-theme="light|dark"]`. Scene background/fog/grid follow theme.

### i18n

- Tables: `src/i18n/messages.js`
- DOM: `data-i18n` / `data-i18n-title` / `data-i18n-aria`
- Runtime: `t(key)` / `i18nError(key, vars)`

### Errors

- Soft validation → status bar  
- Serious → modal with report + copy  
- `window.error` / `unhandledrejection` covered  

## Mapping from Unity reference

| Unity / API | This project |
|---|---|
| Unity Client | Vite + Three.js (+ Electron) |
| `Builder.cs` | `FloorPlanBuilder.js` |
| `WallMesh.cs` | Box segment meshing |
| Flask Mask R-CNN API | Offline heuristic / DreamSpace detectors |
| Native Unity UI | HTML panel + icon toolbar |

## Extension points

- New detectors emitting the same JSON shape
- Richer builder (furniture, room labels, materials)
- Additional loaders / exporters
- Signed installers / auto-update via electron-builder
- Persist scene + wall settings as project files

## Related docs

- [UsersGuide.md](./UsersGuide.md)
- [README.md](./README.md)
- [release/README.md](./release/README.md)
