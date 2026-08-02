# User's Guide / 사용자 가이드

**3D Drawing Tool** v1.0.0  
Author / 저작자: **SHKWON** (`knix008@naver.com`)

This guide explains how to install, run, and use the application.  
이 문서는 설치·실행·사용 방법을 설명합니다.

---

## 1. Installation / 설치

### Windows application (developer)

```bash
npm install
npm start
```

`npm start` opens the desktop **Windows application** via Electron.

### Web (browser only)

```bash
npm run dev
```

Browser: `http://localhost:5173`

### Build installers (developers)

```bash
npm run build:win      # Windows → root *.exe
npm run build:mac      # macOS → root *.dmg
npm run build:linux    # Linux → root *.AppImage / *.deb
```

Installer files are written to `release/` and copied to the **project root**.

### Desktop installer (Windows)

1. Run `3D Drawing Tool-Setup-1.0.0.exe` (from project root or `release/`)
2. Choose install folder
3. Optionally enable **Desktop shortcut** and **Start Menu shortcut**
4. Finish and launch the app

---

## 2. Main Layout / 화면 구성

| Area | Description |
|------|-------------|
| **Toolbar** (top) | New / Open / Save / Import, Grid, Axes, Theme, Language, About, window buttons (Electron) |
| **Left panel** | Tools, import, primitives, actions |
| **Center viewport** | 3D scene — orbit, select, transform |
| **Right panel** | Properties of selection, lighting, viewport options |
| **Status bar** (bottom) | Object count, selection, ready status |

타이틀 바는 없고, 상단 **툴바**로 창을 조작합니다(데스크톱).

---

## 3. Toolbar / 툴바

| Control | Action |
|---------|--------|
| New / 새 파일 | Create empty project (confirms if needed) |
| Open / 열기 | Open `.3ddraw` / `.json` project |
| Save / 저장 | Save project as `.3ddraw` |
| Import icon | Import 3D models or images |
| Grid / 그리드 | Toggle ground grid |
| Axes / 축 | Toggle XYZ axes **and labels** (X / Y / Z) |
| Theme / 테마 | Dark ↔ Light |
| Language / 언어 | Korean ↔ English (`KO` / `EN`) |
| Info / 정보 | About dialog (author, email, version) |
| − □ × | Minimize / Maximize / Close (Electron only) |

---

## 4. Tools (Left Panel) / 도구

### Transform

| Tool | Usage |
|------|--------|
| **Select / 선택** | Click objects to select |
| **Move / 이동** | Drag gizmo axes to move |
| **Rotate / 회전** | Rotate with gizmo |
| **Scale / 크기** | Scale with gizmo |

Tips:

- Click empty space to deselect
- `Delete` / `Backspace` deletes the selection (when not typing in an input)
- Mouse drag on background: **orbit** the camera (scroll to zoom)

### Import / 가져오기

**3D Model / Image** button, toolbar import, or **drag & drop** onto the viewport.

Supported formats:

- 3D: **GLB, GLTF, OBJ, STL, FBX, PLY**
- Images: **PNG, JPG, WEBP** (placed as planes)

After import:

1. Asset is added to the scene (normalized size)
2. **Move** tool is selected automatically
3. Use move gizmo or right-panel **Position** to place it

### Primitives / 기본 도형

Box, Sphere, Cylinder, Cone, Torus, Plane — click to add.

### Actions / 동작

| Action | Description |
|--------|-------------|
| Duplicate / 복제 | Clone selection (offset slightly) |
| Delete / 삭제 | Remove selection |

---

## 5. Properties (Right Panel) / 속성

When an object is selected:

| Property | Description |
|----------|-------------|
| Name / 이름 | Display name |
| Type / 유형 | Primitive or `model`/`image` (+ format) |
| Source file / 원본 파일 | Original filename (imports) |
| Position / 위치 | X, Y, Z |
| Rotation / 회전 | Degrees; also 0°–360° axis sliders and +90° buttons |
| Scale / 크기 | Non-uniform scale |
| Color, Opacity, Metalness, Roughness | Material appearance |
| Visible / 표시 | Show / hide |

### Lighting / 조명

Adjust anytime (selection not required):

- Ambient / 환경광 — intensity & color  
- Directional / 방향광 — intensity, color, position  
- Point / 포인트 라이트 — intensity, color, position  

### Viewport / 뷰포트

- Show Grid / 그리드 표시  
- Show Axes / 축 표시  

---

## 6. Viewport Interaction / 뷰포트 조작

| Input | Action |
|-------|--------|
| Left-drag (empty) | Orbit camera |
| Scroll | Zoom |
| Click object | Select |
| Move / Rotate / Scale tool | Transform with colored gizmo |
| Drop files | Import models/images |
| Bottom-right gizmo | Orientation helper |

Axes colors: **X** red, **Y** green, **Z** blue — labels appear at axis tips when axes are on.

---

## 7. Projects / 프로젝트

### Save

- Toolbar **Save** → choose path (Electron) or download `.3ddraw` (Web)
- File includes objects, materials, lights, viewport, and embedded import data

### Open

- Toolbar **Open** → select `.3ddraw` or `.json`

### New

- Toolbar **New** → clears the scene after confirmation

> Large imported models make `.3ddraw` files larger because assets are embedded as data URLs.

---

## 8. Themes & Language / 테마·언어

| Setting | How |
|---------|-----|
| Dark / Light | Toolbar sun/moon button — stored in browser/local storage |
| KO / EN | Toolbar language button — UI strings switch immediately |

---

## 9. About / 정보

Toolbar **Info** shows:

- Application name and version `1.0.0`
- Author: **SHKWON**
- Email: **knix008@naver.com** (clickable mailto)

---

## 10. Troubleshooting / 문제 해결

| Issue | Suggestion |
|-------|------------|
| `npm start` fails | Run `npm install` first; use Node 18+ |
| Model does not appear | Check format; prefer **GLB**; multi-file GLTF/OBJ+MTL may need packing into GLB |
| Transform gizmo missing | Select object, then choose **Move / Rotate / Scale** |
| Installer build EPERM on Windows | Close running app; delete `release/` and rebuild, or output to another folder |
| Black / empty viewport | GPU/driver issue — try another browser or update graphics drivers |

---

## 11. Keyboard Shortcuts / 단축키

| Key | Action |
|-----|--------|
| `Delete` / `Backspace` | Delete selected object |

---

## 12. Contact / 문의

- Author: SHKWON  
- Email: knix008@naver.com  

For architecture and module details, see [Architecture.md](./Architecture.md).  
개발 구조는 [Architecture.md](./Architecture.md)를 참고하세요.
