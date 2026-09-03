# MyMind 사용자 가이드 / User Guide

**MyMind v1.0**  
개발자 / Developer: **SHKWON** (`knix008@naver.com`)  
Copyright © 2026 SHKWON

---

## 한국어

### 1. 소개

MyMind는 마인드맵과 피쉬본(원인-결과, Ishikawa) 다이어그램을 작성하는 편집기입니다.  
Windows / macOS / Linux 설치형 앱과 웹 브라우저에서 동일한 UI로 사용할 수 있습니다.  
마인드맵과 피쉬본은 **같은 데이터**를 공유하므로, 토글로 보기만 전환됩니다.

### 2. 설치 (Windows)

1. `MyMind Setup … .exe` 설치 프로그램을 실행합니다.
2. 이전 버전이 있으면 **자동 제거된 뒤** 새 버전이 설치됩니다.
3. 설치 경로와 **시작 메뉴 / 바탕 화면** 바로가기 여부를 선택합니다.
4. 설치 시 `.mmap` 확장자가 MyMind에 연결되고, **예제 다이어그램**이 문서 폴더의 **`MyMind Examples`**에 설치되어 바로 열고 편집할 수 있습니다.

> 데스크톱 앱은 기본 타이틀 바 없이 실행됩니다. 최소화/최대화/닫기 버튼은 툴바 오른쪽 끝(정보 버튼 옆)에 있습니다.

### 3. 화면 구성

| 영역 | 설명 |
|------|------|
| **툴바** | **파일▾**(새로 만들기·열기·저장·내보내기), **실행 취소/다시 실행**, **마인드맵⇄피쉬본 토글**, **레이아웃▾**, 보기(중심 이동·자동 정렬·그리드), **테마▾**·언어, 정보 |
| **좌측 패널** | 노드 목록을 **트리뷰**(부모/자식 연결선)로 표시 |
| **우측 패널(속성)** | 텍스트·메모, 도형·색, **폰트·폰트 크기**·글자색·스타일, 선 모양·패턴·시작/끝 모양·색, **연결 위치** |
| **캔버스** | 다이어그램 편집 영역 (그리드, 팬, 줌) |
| **상태 바** | 모드, 레이아웃, 노드 수, 줌, 그리드, 저장 상태 |
| **컨텍스트 메뉴** | 우클릭: 실행취소/다시실행, 추가·편집, 복제/복사/붙여넣기, 파일·보기 동작, 삭제 |

### 4. 기본 작업

#### 4.1 파일 (파일▾ 메뉴)

- **새로 만들기**: 새 마인드맵 문서 (변경사항이 있으면 확인)
- **열기**: `.mmap` 열기(기존 `.mymind`도 열림). 데스크톱에서는 **샘플 템플릿 폴더**에서 시작. 열면 전체가 보이도록 자동 맞춤됩니다.
- **저장**: `.mmap`으로 저장 (웹은 다운로드)
- **내보내기**: 이미지로 저장 — **PNG / JPEG / WebP / SVG** 형식 선택, **배경 투명** 여부 선택(JPEG 제외), **모든 도형을 포함하는 최소 크기**로 저장

#### 4.2 모드 전환

툴바의 **마인드맵/피쉬본 토글**(하나의 버튼)을 누르면 현재 문서를 반대 모드로 다시 그립니다. 내용은 그대로 유지됩니다.

#### 4.3 노드 편집

| 동작 | 방법 |
|------|------|
| 선택 | 노드 클릭 (좌측 트리에서 클릭해도 캔버스에서 강조) |
| 여러 개 선택 | 빈 공간 **드래그(사각형 선택)** 또는 **Shift+클릭** |
| 이동 | 노드 드래그 (여러 개 선택 시 함께 이동) |
| 텍스트 편집 | 더블클릭 또는 우클릭 → 편집 |
| 메모 | 노드 선택 후 우측 **메모**란 입력 (✎ 배지·툴팁) |
| 하위/형제 추가 | 우클릭 메뉴 |
| 복제 / 복사 / 붙여넣기 | 우클릭 메뉴 (노드와 하위 트리 전체) |
| 삭제 | **Delete/Backspace** 또는 우클릭 (루트/결과는 삭제 불가) |
| **실행 취소 / 다시 실행** | 툴바 버튼, 우클릭, 또는 **Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z** |

#### 4.4 레이아웃 · 도형 · 선

- **레이아웃**(툴바 드롭다운) — 마인드맵: 방사형 · 상→하 · 하→상 · 좌→우 · 우→좌 / 피쉬본: 좌→우 · 우→좌
- **도형**(12종): 둥근 사각형, 사각형, 타원, 마름모, 평행사변형, 타원형 막대, 육각형, 팔각형, 원통, 사다리꼴, 화살표, 노트 — 드롭다운에 미리보기 표시
- **선 모양**: 곡선 · 직선 · 꺾은 선 · 나무 뿌리형 / **패턴**: 실선 · 파선 · 점선 · 일점쇄선 / **시작·끝 모양**: 없음 · 화살표 · 원 · 마름모
- **폰트**: 프리셋 + **설치된 모든 시스템 폰트**, **폰트 크기**, 글자색, 굵게/기울임/밑줄/취소선

선은 **노드 각 면의 중앙**(도형 표면)에 연결됩니다.

#### 4.5 선 개별 선택 · 연결 위치 수동 변경

- 선을 **클릭하면 그 선만 선택**되어 종류·패턴·색·양 끝 모양을 편집할 수 있습니다.
- 우측 **연결 위치**에서 **시작 면 / 끝 면**을 자동·위·아래·왼쪽·오른쪽으로 지정해 연결 지점을 수동 조정할 수 있습니다.

#### 4.6 보기 도구

| 버튼 | 기능 |
|------|------|
| **중심 이동** | 전체가 화면에 들어오도록 확대율·위치 조정 |
| **자동 정렬** | 현재 레이아웃 규칙으로 다시 배치 후 화면 맞춤 |
| **그리드** | 캔버스 격자 on/off. **그리드가 켜진 상태에서는 빈 곳을 왼쪽 드래그하면 배경(화면)이 이동**합니다 |

#### 4.7 캔버스 조작

- **팬**: 마우스 가운데(휠) 버튼 드래그 (또는 그리드 켜짐 시 왼쪽 드래그)
- **줌**: 마우스 휠 (10%~400%, 화면 중심 기준)
- **선택 해제**: 빈 공간 클릭

#### 4.8 테마 · 언어 · 정보

- **테마(6종)**: 라이트 · 다크 · 미드나잇 · 포레스트 · 선셋 · 오션
- **언어**: 한국어 ↔ English
- **정보**: 이름, 버전, 개발자, **빌드 날짜**, 런타임 버전
- 설정(언어·테마·그리드)은 저장되어 다음 실행에도 유지됩니다.

#### 4.9 종료 시 저장 확인

변경사항이 있을 때 창을 닫으면 **저장 / 저장 안 함 / 취소**를 선택하는 대화상자가 표시됩니다.

### 5. 피쉬본 팁

1. 토글로 **피쉬본**으로 전환합니다.
2. 결과(Effect) 노드에 우클릭 → 하위 추가로 원인 분류를 늘립니다.
3. 분류에 하위 추가로 개별 원인을 더합니다. 자식/손자는 부모 기준 위·아래로 고르게 배치됩니다.
4. 필요하면 노드를 드래그하거나 **자동 정렬**로 정리합니다.

### 6. 파일 형식

- 확장자: `.mmap` (기존 `.mymind`도 열림), JSON(UTF-8)
- 저장 내용: 노드 좌표·크기·도형·색·메모·글꼴/크기, 선의 연결·종류·패턴·색·양 끝 모양·**연결 면**, 모드/레이아웃 — 열면 그대로 복원됩니다.
- 다른 PC의 MyMind에서도 동일하게 열립니다.

### 7. 문제 해결

| 증상 | 조치 |
|------|------|
| 노드가 화면 밖으로 나감 | **중심 이동** |
| 배치가 어수선함 | **자동 정렬** |
| 창을 좁혀도 버튼이 다 보임 | 최소 폭이 자동 계산됩니다 |
| 저장 경로가 유지되지 않음(웹) | 웹은 다운로드 방식입니다. 데스크톱 앱을 사용하세요 |

### 8. 지원

문의: **SHKWON** — knix008@naver.com

---

## English

### 1. Introduction

MyMind is an editor for **mind maps** and **fishbone (Ishikawa)** diagrams, running as a desktop app (Windows / macOS / Linux) and a web app with the same UI. Mindmap and Fishbone share the same data — the toggle only changes how it's drawn.

### 2. Installation (Windows)

1. Run `MyMind Setup … .exe`.
2. Any previous install is **removed automatically** first.
3. Choose the folder and **Start Menu / Desktop** shortcuts.
4. The installer associates `.mmap` files with MyMind and copies the **sample diagrams** to **`Documents\MyMind Examples`** so you can open and edit them.

> The window is frameless; minimize / maximize / close are at the far right of the toolbar (next to About).

### 3. Screen layout

| Area | Description |
|------|-------------|
| **Toolbar** | **File▾** (New·Open·Save·Export), **Undo/Redo**, **Mindmap⇄Fishbone toggle**, **Layout▾**, view (Center·Auto Align·Grid), **Theme▾**·language, About |
| **Left panel** | Node list as a **tree view** with parent/child connector lines |
| **Right panel** | Text·memo, shape·color, **font·font size**·text color·style, line shape/pattern/caps/color, **connection point** |
| **Canvas** | Diagram editing (grid, pan, zoom) |
| **Status bar** | Mode, layout, node count, zoom, grid, save status |
| **Context menu** | Undo/redo, add/edit, duplicate/copy/paste, file & view actions, delete |

### 4. Basic tasks

#### 4.1 File (File▾ menu)

- **New** — new mindmap (confirms unsaved changes)
- **Open** — open `.mmap` (legacy `.mymind` too); desktop dialog starts in the **templates** folder; the view fits to the whole diagram on open
- **Save** — save as `.mmap` (web downloads)
- **Export** — save an image: **PNG / JPEG / WebP / SVG**, optional **transparent background** (not for JPEG), cropped to the diagram's **minimum size**

#### 4.2 Mode

The single **Mindmap/Fishbone toggle** re-renders the current document in the other mode; content is preserved.

#### 4.3 Nodes

| Action | How |
|--------|-----|
| Select | Click a node (or a row in the left tree — it highlights on canvas) |
| Select many | **Marquee drag** or **Shift-click** |
| Move | Drag (moves the whole selection) |
| Edit text | Double-click or context menu |
| Memo | Type in the **Memo** field of the right panel (✎ badge + tooltip) |
| Add child / sibling | Context menu |
| Duplicate / Copy / Paste | Context menu (node + subtree) |
| Delete | **Delete/Backspace** or context menu (root/effect can't be deleted) |
| **Undo / Redo** | Toolbar, context menu, or **Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z** |

#### 4.4 Layout, shape, line

- **Layout** (toolbar) — Mindmap: Radial · Top→Bottom · Bottom→Top · Left→Right · Right→Left; Fishbone: Left→Right · Right→Left
- **Shapes (12)**: rounded, rectangle, ellipse, diamond, parallelogram, stadium, hexagon, octagon, cylinder, trapezoid, chevron, note — with previews
- **Line**: curve · straight · elbow · tree-root; **patterns**: solid · dashed · dotted · dash-dot; **start/end caps**: none · arrow · dot · diamond
- **Fonts**: presets + **all installed system fonts**, **font size**, color, bold/italic/underline/strike

Lines attach at the **midpoint of each node face**.

#### 4.5 Selecting a line · manual connection point

- **Click a line** to select just that edge and edit its type/pattern/color/caps.
- In **Connection Point**, set the **start/end side** to Auto/Top/Bottom/Left/Right to place the connection manually.

#### 4.6 View tools

| Button | Action |
|--------|--------|
| **Center View** | Zoom/position so the whole diagram fits |
| **Auto Align** | Re-layout with the current rule, then fit |
| **Grid** | Toggle the grid. **When the grid is on, left-drag on empty canvas pans the background** |

#### 4.7 Canvas

- **Pan**: middle-button drag (or left-drag when the grid is on)
- **Zoom**: mouse wheel (10%–400%, centered)
- **Deselect**: click empty space

#### 4.8 Theme, language, about

- **Themes (6)**: Light · Dark · Midnight · Forest · Sunset · Ocean
- **Language**: Korean ↔ English
- **About**: name, version, developer, **build date**, runtime versions
- Preferences (language, theme, grid) persist in local storage.

#### 4.9 Close confirmation

Closing with unsaved changes shows a **Save / Don't Save / Cancel** prompt.

### 5. Fishbone tips

1. Toggle to **Fishbone**.
2. Right-click the Effect node → Add Child for categories.
3. Add causes under categories; children and deeper causes fan evenly above/below their parent.
4. Drag or **Auto Align** to tidy up.

### 6. File format

- Extension: `.mmap` (legacy `.mymind` too), JSON (UTF-8)
- Stores node positions/sizes/shapes/colors/memo/fonts, edges with line type/pattern/color/caps/**connection side**, and mode/layout — restored exactly on open
- Portable across MyMind installations

### 7. Troubleshooting

| Issue | Try |
|-------|-----|
| Content off-screen | **Center View** |
| Messy layout | **Auto Align** |
| Buttons stay visible when narrowing the window | the minimum width is computed automatically |
| Path not remembered (web) | web uses downloads; use the desktop app |

### 8. Support

Contact: **SHKWON** — knix008@naver.com
