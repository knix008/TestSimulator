# Architecture

FloorPlanTo3D Multi-OS client architecture.

Inspired by [FloorPlanTo3D-unityClient](https://github.com/fadyazizz/FloorPlanTo3D-unityClient), this project replaces the Unity client with a **Vite + Three.js** app and an optional **Electron** shell.

**Author:** SHKWON \<knix008@naver.com\> · **Version:** 1.0.0

## Goals

- Convert **selected** 2D floor-plan images into editable 3D scenes
- Run on Windows / macOS / Linux (browser or Electron)
- Offline heuristic / DreamSpace detection, plus Unity Mask R-CNN API
- API runtime choice: **local Python venv (TF2)** or **Docker (TF 1.15)**
- Light helpers, free-axis viewing, multi-format load/export, i18n, theming

## High-level flow

```text
[Image / 3D model file]
        │
        ├─ model file ──▶ modelLoader ──▶ SceneApp.externalRoot
        │
        ▼ (convert)
 ┌────────────────────────┐     ┌──────────────────┐
 │ Detection              │────▶│ Detection JSON   │
 │ heuristic /            │     │ points[],        │
 │ dreamspace /           │     │ classes[],       │
 │ unity API (venv|docker)│     │ Width, Height…   │
 └────────────────────────┘     └────────┬─────────┘
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
| DreamSpaceAI | Offline scanline detector (+ UI params) | File dialog → then detect |
| FloorPlanTo3D (Unity/API) | Ensure API → POST image (+ params) | File dialog → then API |

### Rebuild / camera policy

| Trigger | `fresh` | Camera |
|---|---|---|
| New convert | `true` | Reframe (`_frameCamera`) |
| Scale / wall height / thickness / floor pattern / Unity merge options | `false` | **Keep** current orbit/camera |
| Wall / floor color only | n/a (`applyColors`) | Unchanged |

Model transform is restored across non-fresh rebuilds via `getModelTransform` / `setModelTransform`.

## Runtime options

| Runtime | Entry | Notes |
|---|---|---|
| Browser (dev) | `npm run dev` | Vite HMR (~5173); SSE install middleware |
| Browser (prod) | `npm run build` → `dist/` | Static, `base: './'` |
| Web package | `npm run dist:web` | Zip → **project root** + `release/web/` |
| Electron (dev) | `npm start` | Vite URL, no default app menu |
| Desktop installers | `npm run dist:win/mac/linux` | electron-builder → **project root** + `release/` |

Packaging stages under a temp dir, then copies installers to the root (and `release/`) to avoid IDE file locks. See `scripts/dist-desktop.mjs`, `scripts/package-web.mjs`.

Electron: `electron/main.cjs` + `electron/preload.cjs`  
- `Menu.setApplicationMenu(null)`  
- IPC: open/save, DreamSpace ensure, FloorPlan API ensure/status/cancel (+ progress events)

## FloorPlanTo3D-API integration

Shared installer/runner: `scripts/lib/floorplanApiInstall.mjs`  
Used by Electron IPC and Vite middleware (`/__fp3d/floorplan-api/*`).

| Path | Role |
|---|---|
| `src/unityApi/ensure.js` | Renderer bridge (desktop IPC or Vite SSE) |
| `src/unityApi/params.js` | Detection params + `localStorage` |
| `src/api/client.js` | `POST` multipart image + `params` JSON |
| `scripts/lib/floorplanApiTf2/` | Modern Flask + TF2 Mask R-CNN bundle |
| `docker/floorplan-api/Dockerfile` | TF 1.15 CPU image (weights mounted at run) |
| `docker-compose.floorplan-api.yml` | Compose helper for CLI |

### API runtimes

| Runtime | Stack | How it starts |
|---|---|---|
| `venv` (default) | Python 3.10–3.12, TF 2.16, patched `application.py` | Create `.venv`, pip, spawn `application.py` |
| `docker` | TF 1.15 image `floorplan-api:1.15` | `docker start` / `docker run -p 5000:5000 -v weights:/app/weights` |

UI select `#apiRuntime` → persisted as `fp3d.apiRuntime` → passed into `ensureFloorplanApiReady({ runtime })`.

Health check: HTTP GET `http://127.0.0.1:5000/` (any response = up).  
Weights: `maskrcnn_15_epochs.h5` under project or sibling `../FloorPlanTo3D-API/weights`.

Docker build context preference: `FP3D_API_DOCKER_CONTEXT` → sibling `../FloorPlanTo3D-API` → local `FloorPlanTo3D-API/`.

## Directory map

```text
3DFloorMultiOSV10/
├── electron/                  # Main + preload
├── index.html
├── vite.config.js
├── electron-builder.yml
├── docker/
│   └── floorplan-api/Dockerfile
├── docker-compose.floorplan-api.yml
├── samples/
├── scripts/
│   ├── lib/floorplanApiInstall.mjs
│   ├── lib/floorplanApiTf2/
│   ├── dist-desktop.mjs
│   └── …
├── src/
│   ├── main.js
│   ├── api/client.js
│   ├── detect/
│   │   ├── heuristic.js
│   │   ├── dreamspace.js
│   │   ├── dreamspaceDetect.js
│   │   └── dreamspaceParams.js
│   ├── unityApi/
│   │   ├── ensure.js
│   │   └── params.js
│   ├── builder/FloorPlanBuilder.js
│   ├── scene/SceneApp.js
│   ├── loaders/modelLoader.js
│   ├── exporters/modelExport.js
│   ├── desktop/bridge.js
│   ├── data/floorPatterns.js
│   ├── i18n/
│   └── ui/                    # toolbar, theme, progress, dialogs, save
├── assets/
├── Architecture.md
├── UsersGuide.md
└── README.md
```

`FloorPlanTo3D-API/` (auto-cloned under the project) is gitignored.

## Module responsibilities

### `main.js`

- Toolbar / panel wiring
- Convert pipeline (mode-aware; image required)
- Rebuild on scale / wall / floor pattern; colors via `applyAppearance`
- Unity/DreamSpace param UI; API runtime preference
- Light HUD sync, save dialog, open image/model
- Theme / locale / error reporting

### Detection

| Mode | Module | Behavior |
|---|---|---|
| Heuristic | `detect/heuristic.js` | Ink mask + H/V runs → wall/door/window boxes |
| DreamSpace | `detect/dreamspaceDetect.js` + `dreamspaceParams.js` | H/V scanlines, openings, tunable sensitivity |
| Unity/API | `api/client.js` + `unityApi/*` | Mask R-CNN boxes; client-side filters + builder carve/merge |

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
- Pixel → meter via `averageDoor` / Unity `doorWidthM` (~0.9 m)
- Optional parallel-wall merge + opening carve (doors/windows)
- Windows: glass mid-wall + wall **sill** + **lintel**; doors: leaf + lintel
- Options: `scale`, `wallHeight` (0–5 m), `wallThickness`, colors, floor image/pattern, `unityParams`

### `SceneApp`

- `TrackballControls` (full tumble; no polar lock)
- `TransformControls` (model rotate/scale; light translate)
- Content modes: `plan2d` / `floorplan` / `model` / `empty`
- `rebuild({ fresh })`: restore transform when not fresh; frame camera only when fresh
- Lights: directional main + fill + hemisphere; shadow map refresh on move
- Light helpers: marker, dashed ray from `(0,0,0)`, gizmo (**광원 표시**)
- Axes / grid; theme-aware clear color
- Transparent PNG capture (helpers hidden)

### Load / export

| Module | Role |
|---|---|
| `loaders/modelLoader.js` | Multi-format import; promote unlit materials for lighting |
| `exporters/modelExport.js` | GLB/GLTF/OBJ/STL/PLY/USDZ (+ PNG via SceneApp) |
| `ui/saveDialog.js` | Format picker |
| `desktop/bridge.js` | Electron save/open IPC |

### UI

| Module | Role |
|---|---|
| `ui/toolbar.js` | Image, model, convert, save, transform, helpers, light, reset, theme, lang, info |
| `ui/theme.js` | Light/Dark (`fp3d-theme`) |
| `ui/progressDialog.js` | Install / API call progress (%, cancel) |
| `ui/infoDialog.js` / `errorDialog.js` | About / serious errors |
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
| `WallMesh.cs` | Box segment meshing (+ sill/lintel) |
| Flask Mask R-CNN API | venv TF2 auto-install **or** Docker TF 1.15 |
| Native Unity UI | HTML panel + icon toolbar |

## Extension points

- New detectors emitting the same JSON shape
- Richer builder (furniture, room labels, materials)
- TF2 Docker image aligned with `floorplanApiTf2`
- Additional loaders / exporters
- Signed installers / auto-update via electron-builder
- Persist scene + wall settings as project files

## Related docs

- [UsersGuide.md](./UsersGuide.md)
- [README.md](./README.md)
- [release/README.md](./release/README.md)
