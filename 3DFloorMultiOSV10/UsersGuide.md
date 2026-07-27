# User's Guide

FloorPlanTo3D Multi-OS — install, convert floor plans, view/edit 3D, and export.

UI: **한국어 / English** (toolbar **Lang**). Theme: **Light / Dark**.

**Author:** SHKWON \<knix008@naver.com\> · **Version:** 1.0.0

---

## 1. Requirements

- Node.js 18+
- Electron desktop (Windows / macOS / Linux), **or** a modern browser
- Optional: [FloorPlanTo3D-API](https://github.com/fadyazizz/FloorPlanTo3D-API) for Mask R-CNN

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

### B — Choose analysis mode

| Mode | When to use |
|---|---|
| **Local heuristic (offline)** | High-contrast drawings, no server (**default**) |
| **DreamSpaceAI (offline)** | With image → detect from that image; without → sample apartment |
| **Mask R-CNN API** | Best quality with the Python API running |
| **Demo data** | Instant layout without an image (if an image is selected, heuristic is used instead) |

> When an image is selected, convert **always** builds from that image (not a fixed default box layout).

### C — Convert

Click **변환**. Walls / doors / windows extrude in the viewport. Status text shows the result.

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
| Wall height / thickness | Extrusion (m) |
| Wall / floor color | Materials |

Changes apply immediately to the current detection.

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

## 10. Optional Mask R-CNN API

1. Run [FloorPlanTo3D-API](https://github.com/fadyazizz/FloorPlanTo3D-API)
2. Put weights in `weights/`
3. `python application.py` → usually `http://127.0.0.1:5000/`
4. Mode **Mask R-CNN API** → set URL → open image → convert

---

## 11. Errors

- Soft validation (no image, etc.) → status line  
- Serious errors → dialog with summary, report, and **Copy**  
- Close with **Close**, `Esc`, or outside click  

---

## 12. Tips

- Prefer high-contrast black-on-white plans for **heuristic**
- Use **Demo** only to learn controls without an image
- Adjust **Scale** if the plan feels too large/small
- Turn **광원 표시** off for a clean view; use **저장** for exports
- Collapse the side panel for a larger viewport

---

## 13. Related docs

- Design: [Architecture.md](./Architecture.md)
- Overview: [README.md](./README.md)
- Installers: [release/README.md](./release/README.md)
