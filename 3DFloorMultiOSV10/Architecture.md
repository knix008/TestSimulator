# Architecture

FloorPlanTo3D Multi-OS client architecture.

Inspired by [FloorPlanTo3D-unityClient](https://github.com/fadyazizz/FloorPlanTo3D-unityClient), this project replaces the Unity client with a **Vite + Three.js** web app and an optional **Electron** shell for desktop.

## Goals

- Convert 2D floor-plan images into editable 3D scenes
- Run on Windows / macOS / Linux via browser or Electron
- Support offline demo/heuristic modes and optional Mask R-CNN API
- Provide transform, lighting, theme, locale, and error-reporting UX

## High-level flow

```text
[Image / Sample / Demo]
        │
        ▼
 ┌────────────────┐      ┌──────────────────┐
 │ Detection      │─────▶│ Detection JSON   │
 │ demo /         │      │ points[],        │
 │ heuristic /    │      │ classes[],       │
 │ API            │      │ Width, Height…   │
 └────────────────┘      └────────┬─────────┘
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
                       │ orbit / walk /       │
                       │ gizmo / lights / axes│
                       └──────────────────────┘
```

## Runtime options

| Runtime | Entry | Notes |
|---|---|---|
| Browser (dev) | `npm run dev` | Vite HMR on port `5173` |
| Browser (prod) | `npm run build` → `dist/` | Static assets, `base: './'` |
| Web package | `npm run dist:web` | Zips `dist/` into `release/web/` |
| Electron (dev) | `npm run electron:dev` | Loads Vite URL, no default app menu |
| Desktop installers | `npm run dist:win/mac/linux` | electron-builder → `release/` |

Electron main process: `electron/main.cjs`  
- `Menu.setApplicationMenu(null)` disables File/Edit/View menus  
- UI actions are exposed through the in-app toolbar instead

## Directory map

```text
3DFloorMultiOSV10/
├── electron/main.cjs          # Electron shell (no default menu)
├── index.html                 # App shell + side panel markup
├── vite.config.js
├── samples/                   # Example 2D floor plans (project root)
├── src/
│   ├── main.js                # UI wiring, convert pipeline, status
│   ├── style.css              # Theme tokens + layout
│   ├── api/client.js          # FloorPlanTo3D-API client
│   ├── detect/heuristic.js    # Offline wall-line heuristic
│   ├── data/demoFloorPlan.js  # Built-in detection payload
│   ├── loaders/modelLoader.js # Multi-format 3D file open (glTF, OBJ, STL, …)
│   ├── builder/FloorPlanBuilder.js
│   ├── scene/SceneApp.js      # Three.js scene / controls / helpers
│   ├── i18n/                  # ko / en messages + locale helpers
│   └── ui/                    # toolbar, theme, icons, error dialog
├── assets/icon.png            # master app / installer icon (light 3D)
├── Architecture.md
├── UsersGuide.md
└── README.md
```

## Module responsibilities

### `main.js`

Application controller:

- Mounts toolbar and binds panel controls
- Runs convert pipeline (`demo` / `heuristic` / `api`)
- Rebuilds the 3D scene when scale, wall height/thickness, or colors change
- Routes serious errors to the modal dialog
- Syncs theme / locale / toolbar active states

### Detection layer

| Mode | Module | Behavior |
|---|---|---|
| Demo | `data/demoFloorPlan.js` | Fixed sample geometry, no image required |
| Heuristic | `detect/heuristic.js` | Canvas threshold + horizontal/vertical run extraction |
| API | `api/client.js` | `POST multipart/form-data` field `image` to Mask R-CNN server |

Common detection payload (compatible with upstream API):

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

Ports Unity `Builder.cs` / `WallMesh.cs` ideas to Three.js:

- Converts axis-aligned boxes into `BoxGeometry` segments
- Centers the plan using image `Width` / `Height`
- Maps pixels to meters using `averageDoor` (default door ≈ 0.9 m)
- Applies user options:
  - `scale`
  - `wallHeight`
  - `wallThickness`
  - wall / floor colors

### `SceneApp`

Three.js runtime:

- Perspective camera + `OrbitControls`
- First-person walk mode (WASD + drag look)
- `TransformControls` gizmo (translate / rotate / scale)
- Axes helper + X/Y/Z sprite labels
- Grid helper
- Main / fill / hemisphere lights + light helper/gizmo
- Theme-aware background, fog, and grid colors

### UI layer

| Module | Role |
|---|---|
| `ui/toolbar.js` | Icon toolbar (open, convert, transform, camera, toggles, theme, language, panel) |
| `ui/theme.js` | Light / Dark theme (`localStorage`: `fp3d-theme`) |
| `ui/errorDialog.js` | Serious-error modal with copyable report |
| `i18n/*` | Korean / English (`localStorage`: `fp3d-locale`) |

## Cross-cutting concerns

### Theming

CSS custom properties switch under `html[data-theme="light|dark"]`.  
`SceneApp.setTheme()` updates 3D background/fog/grid to match.

### Internationalization

- Message tables: `src/i18n/messages.js`
- DOM nodes use `data-i18n` / `data-i18n-title` / `data-i18n-aria`
- Runtime status/errors use `t(key)` / `i18nError(key, vars)`

### Error handling

- Soft validation (missing image/API URL) → status line only
- Serious failures (API/heuristic/sample/unexpected) → modal with:
  - summary
  - timestamp, locale, theme, URL, user agent
  - context + stack
  - clipboard copy
- Global handlers cover `window.error` and `unhandledrejection`

## Mapping from Unity reference

| Unity / API original | This project |
|---|---|
| Unity Client | Vite web app (+ Electron) |
| `Builder.cs` | `FloorPlanBuilder.js` |
| `WallMesh.cs` | Box segment meshing in builder |
| Flask Mask R-CNN API | Same JSON contract via `api/client.js` |
| Native Unity UI | HTML panel + icon toolbar |

## Extension points

- Add new detection backends that emit the same JSON shape
- Extend builder classes (furniture, room labels, materials)
- Add loaders in `loaders/modelLoader.js` for additional 3D formats
- Package Electron with an installer (`electron-builder` / similar)
- Persist scene transforms / wall settings per project file

## Related docs

- User-facing guide: [UsersGuide.md](./UsersGuide.md)
- Quick start / API notes: [README.md](./README.md)
