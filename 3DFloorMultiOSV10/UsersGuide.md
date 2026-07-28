# User's Guide

FloorPlanTo3D Multi-OS — install, convert floor plans, view/edit 3D, and export.

UI: **한국어 / English** (toolbar **Lang**). Theme: **Light / Dark**.

**Author:** SHKWON \<knix008@naver.com\> · **Version:** 1.0.0

---

## 1. Requirements

- Node.js 18+
- Electron desktop (Windows / macOS / Linux), **or** a modern browser
- For **Unity/API → Local Python**: Python **3.10–3.12** on PATH (`py -3.12` / `python3.12`)
- For **Unity/API → Docker**: [Docker Desktop](https://www.docker.com/products/docker-desktop/) with `docker` CLI working
- Mask R-CNN weights: `maskrcnn_15_epochs.h5` (auto-download may fail; place manually under `…/weights/`)

## 2. Install & run

```bash
npm install
npm start
```

`npm start` launches the **desktop app** (Electron + Vite).

### Browser only

```bash
npm run dev
```

Open the URL shown in the terminal (default `http://localhost:5173/`).

### Electron notes

- `npm start` ≡ `npm run electron:dev`
- `npm run electron:build` — build `dist/` then open Electron without Vite
- Default File/Edit/View menu is disabled; use the **icon toolbar**
- After changing `electron/main.cjs` or `preload.cjs`, **restart** the app (HMR does not reload the main process)

### Production build

```bash
npm run build
npm run preview          # browser
```

### Installer packages

```bash
npm run dist:web      # FloorPlanTo3D-*-web.zip
npm run dist:win      # Setup + portable .exe
npm run dist:mac      # dmg/zip (build on macOS)
npm run dist:linux    # AppImage / deb / tar.gz
npm run dist:all      # host-capable desktop + web
```

Artifacts are copied to the **project root** and kept under `release/`.  
See [release/README.md](./release/README.md).

| Platform | Files (project root) |
|---|---|
| Windows | `FloorPlanTo3D-*-Setup-win-x64.exe`, `*-portable-win-x64.exe` |
| macOS | `*.dmg`, `*.zip` |
| Linux | `*.tar.gz`; `*.AppImage` / `*.deb` (on Linux) |
| Web | `FloorPlanTo3D-*-web.zip` |

---

## 3. Main screen

```text
┌──────────────────────────────────────────────┐
│ Toolbar (icons)                              │
├──────────────┬───────────────────────────────┤
│ Side panel   │  3D viewport                  │
│ - analysis   │                               │
│ - customize  │                               │
│ - lights HUD │                               │
└──────────────┴───────────────────────────────┘
```

### Toolbar (main actions)

| Button | Action |
|---|---|
| **이미지** | Open floor-plan image |
| **모델** | Open 3D model file |
| **변환** | Convert selected image → 3D |
| **저장** | Export PNG (transparent) or 3D formats |
| **회전 / 스케일** | Model transform tools (`R` / `S`) |
| **축 / 그리드** | Toggle helpers |
| **광원 표시** | Show/hide light marker, origin→light line, gizmo |
| **초기화** | Reset model transform, light pose, and camera view |
| **테마 / 언어 / 정보** | Theme, locale, about |

---

## 4. Convert a floor plan to 3D

### A — Choose an image

1. Toolbar **이미지**, or drag-and-drop an image onto the viewport  
2. The plan appears as a **2D preview** until you convert  
3. The side panel shows the **selected image** card

### B — Choose analysis mode

| Mode | When to use |
|---|---|
| **Local heuristic (offline)** | High-contrast drawings (**default**) |
| **DreamSpaceAI (offline)** | Scanline walls + door/window gaps; tune params in the panel |
| **FloorPlanTo3D (Unity/API)** | Mask R-CNN API (same family as unityClient) |

> Convert requires a selected floor-plan image (a file dialog opens if none is selected).  
> Starting a new convert clears the previous 3D result first.

### DreamSpaceAI parameters

When DreamSpace mode is selected, expand the parameter panel to adjust:

- Max image side, ink threshold, H/V min-run ratios  
- Vertical dilate / merge sensitivity  
- Door / window reference widths (meters)  
- Morph-open to drop thin dimension ticks  

Values persist in `localStorage`. Use **기본값으로** to reset.

### FloorPlanTo3D API (Unity mode)

1. Choose **FloorPlanTo3D (Unity/API)**
2. Set **API 실행 방식** (persisted):

| Runtime | What happens |
|---|---|
| **로컬 Python (venv)** | Download/patch API → Python 3.10–3.12 venv → TF2 deps → start `application.py` |
| **Docker (TF 1.15)** | Use/build image `floorplan-api:1.15` → run container `floorplan-api` on port **5000** |

3. Progress popup shows install/start % (cancelable)  
4. Open a floor-plan image → **Convert** (upload/analyze progress popup)

**Docker CLI (optional):**

```bash
npm run fp3d-api:docker:build
npm run fp3d-api:docker:up
npm run fp3d-api:docker:logs
npm run fp3d-api:docker:down
npm run fp3d-api:status
```

Compose file: `docker-compose.floorplan-api.yml` (default context: sibling `../FloorPlanTo3D-API`).

**Weights:** place `maskrcnn_15_epochs.h5` in:

- `3DFloorMultiOSV10/FloorPlanTo3D-API/weights/`, or  
- `../FloorPlanTo3D-API/weights/`

**Port:** only one listener on `127.0.0.1:5000`. Stop conda/venv/Docker leftovers before switching runtimes.

**Unity detection settings** (panel): min confidence, max detections, min box size, door scale, carve/merge toggles, include wall/window/door.  
Params are sent to the API when supported; the client also filters and the 3D builder applies carve/merge.

### C — Convert

Click **변환**. Walls / doors / windows extrude in the viewport. Status text shows the result.

Windows include a wall **sill** below and **lintel** above the glass (not floating). Doors include a lintel above the leaf.

### Open a 3D model (view / edit)

Toolbar **모델** or drop a model file:

- Supported: **GLB/GLTF, OBJ(+MTL), STL, FBX, PLY, DAE, 3DS, 3MF, USDZ/USD, VOX, VTK, KMZ**, and more  
- Transform, lights, camera, and **저장** still apply  
- Run **변환** again after selecting a floor-plan image to return to a plan build

---

## 5. Customize

| Control | Effect |
|---|---|
| Scale | Overall plan size |
| Wall height | Extrusion height **0–5 m** (0 hides walls) |
| Wall thickness | Wall depth (m) |
| Wall / floor color | Materials |
| Floor pattern | Procedural floor (wood, tile, …) when pattern mode is on |

Toolbar floor toggles switch **plan-image floor** vs **pattern floor**.

Changing scale / height / thickness / pattern **rebuilds meshes but keeps the current camera view**.  
Colors update materials in place. Use **초기화** if you want the default framing again.

---

## 6. Transform & camera

- The model stays centered (no translate). Orbit/trackball the **camera** around it.
- **Rotate (`R`)**: mouse drag (world X/Y; Shift → Z), gizmo rings, or HUD angles — full 360° on all axes  
- **Scale (`S`)**: gizmo / mouse  
- **Trackball** camera: tumble freely (no orbit pole lock); scroll zoom; right-drag pan  
- While rotate tool is on: `X` / `Y` / `Z` locks drag to that world axis  
- **초기화**: model pose + light default + camera framing

---

## 7. Lights

| Control | Effect |
|---|---|
| Main / Fill / Ambient | Intensities |
| Color | Main light (+ marker / line tint) |
| Position X/Y/Z | Sliders + numbers (sync with gizmo) |
| Shadows | Cast shadows on/off |
| **광원 표시** | Marker, dashed line from `(0,0,0)` to the light, drag gizmo |

Moving the light updates shading/shadows on the floor plan and loaded models.

---

## 8. Save / export

Toolbar **저장** opens a format dialog:

| Format | Notes |
|---|---|
| **PNG** | Transparent background (helpers/gizmos hidden) |
| **GLB / GLTF / OBJ / STL / PLY / USDZ** | Current 3D content |

Desktop builds use a native save dialog; the browser downloads the file.

---

## 9. Theme & language

| Control | Behavior |
|---|---|
| **Theme** | Label shows the *target* theme (Dark mode → “Light”) |
| **Lang** | Toggle KO / EN |

Defaults: OS theme preference; browser language (`ko*` → Korean).

---

## 10. Errors

- Soft validation (no image, etc.) → status line  
- Serious errors → dialog with summary, report, and **Copy**  
- API / DreamSpace install failures show paths, weight hints, and open-folder actions when available  
- Close with **Close**, `Esc`, or outside click  

---

## 11. Tips

- Prefer high-contrast black-on-white plans for **heuristic**
- For DreamSpace vertical walls, raise vertical dilate / lower V min-run if walls are missed
- Adjust **Scale** if the plan feels too large/small
- Keep the camera angle while tuning height/thickness — the view no longer resets
- Turn **광원 표시** off for a clean view; use **저장** for exports
- Collapse the side panel for a larger viewport
- If Docker API fails to bind port 5000, stop the other local API first

---

## 12. Related docs

- Design: [Architecture.md](./Architecture.md)
- Overview: [README.md](./README.md)
- Installers: [release/README.md](./release/README.md)
