# MyMind 사용자 가이드 / User Guide

**MyMind 1.0.0**  
개발자 / Developer: **SHKWON** (`knix008@naver.com`)  
Copyright © 2026 SHKWON

---

## 한국어

### 1. 소개

MyMind는 마인드맵과 피쉬본(원인-결과) 다이어그램을 작성하는 편집기입니다.  
Windows / macOS / Linux 설치형 앱과 웹 브라우저에서 동일한 UI로 사용할 수 있습니다.

### 2. 설치 (Windows)

1. `MyMind Setup … .exe` 설치 프로그램을 실행합니다.
2. 이전에 설치된 MyMind가 있으면 **자동으로 제거된 뒤** 새 버전이 설치됩니다.
3. 설치 경로를 선택할 수 있습니다.
4. **시작 메뉴** / **바탕 화면** 바로가기 생성 여부를 선택합니다.
5. 설치가 끝나면 MyMind를 실행합니다.

> 데스크톱 앱은 기본 타이틀 바 없이 실행됩니다. 창 제어(최소화/최대화/닫기)는 툴바 오른쪽에 있습니다.

### 3. 화면 구성

| 영역 | 설명 |
|------|------|
| **툴바** | 파일(새로 만들기·열기·저장·**내보내기**), 모드, 보기(중심 이동·자동 정렬·그리드), 언어·테마, 정보 |
| **좌측 패널** | 문서 정보와 **레이아웃 드롭다운**, 노드 목록 |
| **우측 패널(속성)** | 텍스트, **메모**, 도형/색, 텍스트 스타일, 선 모양·패턴·**시작/끝 모양**·색 |
| **캔버스** | 다이어그램 편집 영역 (그리드, 팬, 줌) |
| **상태 바** | 모드, 레이아웃, 노드 수, 줌, 그리드 ON/OFF, 저장 상태 |
| **컨텍스트 메뉴** | 우클릭으로 하위/형제 추가, 편집, 삭제 (다중 선택 시 함께 삭제) |

### 4. 기본 작업

#### 4.1 새 문서 / 열기 / 저장

- **새로 만들기**: 마인드맵 문서를 새로 엽니다. 저장하지 않은 변경이 있으면 확인합니다.
- **열기**: `.mmap` 파일을 엽니다(기존 `.mymind`도 열립니다). 데스크톱 앱에서는 대화상자가 **샘플 템플릿 폴더**에서 시작합니다.
- **저장**: 현재 다이어그램을 `.mmap`으로 저장합니다. (웹에서는 파일 다운로드)
- **내보내기**: 현재 다이어그램을 **PNG 이미지**로 저장합니다.

#### 4.2 모드 전환

- **마인드맵**: 중심 주제에서 가지가 뻗는 구조
- **피쉬본**: 오른쪽 결과(Effect)와 원인 분류/원인을 표현하는 구조

모드를 바꾸면 새 템플릿으로 전환됩니다. 저장하지 않은 내용이 있으면 확인합니다.

#### 4.3 노드 편집

| 동작 | 방법 |
|------|------|
| 선택 | 노드 클릭 |
| 여러 개 선택 | 빈 공간에서 **드래그(사각형 선택)** 또는 **Shift+클릭**으로 토글 |
| 이동 | 노드 드래그 (여러 개 선택 시 함께 이동) |
| 텍스트 편집 | 노드 더블클릭 또는 우클릭 → 텍스트 편집 |
| 메모 추가 | 노드 선택 후 우측 속성 패널의 **메모**란에 입력 (✎ 배지·툴팁 표시) |
| 하위 노드 추가 | 툴바 **하위 추가** 또는 우클릭 |
| 형제 노드 추가 | 툴바 **형제 추가** 또는 우클릭 |
| 삭제 | **Delete/Backspace**, 툴바 **삭제**, 또는 우클릭 (루트/결과는 삭제되지 않음; 다중 선택 시 함께 삭제) |

#### 4.4 레이아웃 · 도형 · 선

레이아웃은 **좌측 패널**의 드롭다운에서, 도형·선은 **우측 속성 패널**에서 선택합니다.

**레이아웃**

- 마인드맵: 방사형 · 좌 → 우 · 우 → 좌 · 위 → 아래
- 피쉬본: 좌 → 우 · 우 → 좌 (결과/머리 방향)

**도형**: 둥근 사각형, 사각형, 타원, 마름모, 평행사변형  

**선 모양**: 곡선, 직선, 꺾은 선, **나무 뿌리형(끝으로 갈수록 가늘어지는 형태)**  
**선 패턴**: 실선, 파선, 점선, 일점쇄선  
**시작/끝 모양**: 없음, 화살표, 원, 마름모  

각 선 드롭다운에는 실제 모양 **미리보기**가 함께 표시됩니다. 선택한 노드(및 관련 연결선)에 적용됩니다.

#### 4.5 보기 도구

| 버튼 | 기능 |
|------|------|
| **중심 이동** | 확대율을 100%로 맞추고, 전체 노드가 화면 중앙에 오도록 이동합니다 |
| **자동 정렬** | 현재 레이아웃 규칙으로 노드 위치를 다시 계산한 뒤 중앙으로 맞춥니다 |
| **그리드** | 캔버스 격자 표시 on/off (상태 바에서도 토글 가능) |

#### 4.6 캔버스 조작

- **여러 노드 선택**: 빈 공간을 드래그하면 사각형 선택 영역이 나타납니다
- **팬(이동)**: **마우스 가운데(휠) 버튼**으로 드래그
- **줌**: 마우스 휠 (10%~400%, 화면 중심 기준). `Ctrl`은 필요 없습니다
- **선택 해제**: 빈 공간 클릭

#### 4.7 언어 · 테마 · 정보

- **언어**: 한국어 ↔ English
- **테마**: 라이트 ↔ 다크
- **정보**: 프로그램 이름, 버전, 개발자(SHKWON), 이메일, Copyright, 플랫폼

설정(언어·테마·그리드)은 브라우저/앱에 저장되어 다음 실행에도 유지됩니다.

### 5. 피쉬본 팁

1. **피쉬본** 모드로 전환합니다.
2. 결과(Effect) 노드를 선택한 뒤 **하위 추가**로 원인 분류를 늘립니다.
3. 분류를 선택한 뒤 **하위 추가**로 개별 원인을 추가합니다.
4. 필요하면 노드를 드래그해 위치를 조정하거나 **자동 정렬**로 정리합니다.

### 6. 파일 형식

- 확장자: `.mmap` (기존 `.mymind` 파일도 열 수 있음)
- 내용: JSON (노드 좌표·도형·메모, 연결선·선 모양/패턴/시작·끝 모양, 모드/레이아웃 포함)
- 다른 PC의 MyMind에서도 동일하게 열 수 있습니다.
- Windows 설치 시 `.mmap` 확장자가 MyMind에 연결됩니다.

### 7. 문제 해결

| 증상 | 조치 |
|------|------|
| 노드가 화면 밖으로 나감 | **중심 이동** 클릭 |
| 배치가 어수선함 | **자동 정렬** 클릭 |
| 그리드가 안 보임 | 툴바 또는 상태 바에서 그리드 켜기 |
| 저장 위치가 기억되지 않음 (웹) | 웹은 다운로드 방식이라 경로가 유지되지 않습니다. 데스크톱 앱을 사용하세요 |

### 8. 지원

문의: **SHKWON** — knix008@naver.com

---

## English

### 1. Introduction

MyMind is an editor for **mind maps** and **fishbone (Ishikawa)** diagrams.  
It runs as a desktop app (Windows / macOS / Linux) and as a web app with the same UI.

### 2. Installation (Windows)

1. Run the `MyMind Setup … .exe` installer.
2. Any previous MyMind install is **removed automatically** before the new version is installed.
3. Choose the install folder.
4. Optionally create **Start Menu** and **Desktop** shortcuts.
5. Launch MyMind when finished.

> The desktop window is frameless. Minimize / maximize / close controls are on the right side of the toolbar.

### 3. Screen layout

| Area | Description |
|------|-------------|
| **Toolbar** | File (New · Open · Save · **Export**), mode, view (Center · Auto Align · Grid), language/theme, about |
| **Left panel** | Document info with the **Layout dropdown**, and the node list |
| **Right panel (properties)** | Text, **memo**, shape/color, text style, line shape/pattern/**start & end caps**/color |
| **Canvas** | Diagram editing (grid, pan, zoom) |
| **Status bar** | Mode, layout, node count, zoom, grid, save status |
| **Context menu** | Right-click to add child/sibling, edit, delete (multi-selection deletes together) |

### 4. Basic tasks

#### 4.1 New / Open / Save

- **New**: Creates a mindmap document (confirms if there are unsaved changes).
- **Open**: Opens a `.mmap` file (legacy `.mymind` files also open). On desktop the dialog starts in the bundled **templates** folder.
- **Save**: Saves as `.mmap` (web: downloads a file).
- **Export**: Saves the current diagram as a **PNG image**.

#### 4.2 Modes

- **Mindmap**: Branches from a central topic
- **Fishbone**: Effect on the right with categories and causes

Switching modes loads a new template (unsaved changes prompt).

#### 4.3 Nodes

| Action | How |
|--------|-----|
| Select | Click a node |
| Select many | **Drag a marquee** on empty space, or **Shift-click** to toggle |
| Move | Drag a node (moves the whole selection when multiple are selected) |
| Edit text | Double-click or context menu → Edit |
| Add memo | Select a node and type in the **Memo** field of the right panel (shows a ✎ badge + tooltip) |
| Add child | Toolbar **Add Child** or context menu |
| Add sibling | Toolbar **Add Sibling** or context menu |
| Delete | **Delete/Backspace**, toolbar **Delete**, or context menu (root/effect cannot be deleted; multi-selection deletes together) |

#### 4.4 Layout, shape, line

Choose the **layout** from the **left panel** dropdown; shapes and lines from the **right (properties) panel**.

**Layout** — Mindmap: Radial · Left → Right · Right → Left · Top → Bottom; Fishbone: Left → Right · Right → Left (head direction)  

**Shape**: Rounded, Rectangle, Ellipse, Diamond, Parallelogram  

**Line shape**: Curve, Straight, Elbow, **Root-like (tapered)**  
**Line pattern**: Solid, Dashed, Dotted, Dash-dot  
**Start / End cap**: None, Arrow, Dot, Diamond  

Every line dropdown shows a **live preview** of the style. Applied to the selected node (and related edges).

#### 4.5 View tools

| Button | Action |
|--------|--------|
| **Center View** | Reset zoom to 100% and center all nodes in the viewport |
| **Auto Align** | Recompute positions with the current layout, then center |
| **Grid** | Toggle canvas grid (also available on the status bar) |

#### 4.6 Canvas

- **Select many**: Drag on empty space to draw a selection rectangle
- **Pan**: Drag with the **middle (wheel) mouse button**
- **Zoom**: Mouse wheel (10%–400%, centered on the viewport). No `Ctrl` needed
- **Deselect**: Click empty space

#### 4.7 Language, theme, about

- **Language**: Korean ↔ English
- **Theme**: Light ↔ Dark
- **About**: Name, version, developer (SHKWON), email, copyright, platform

Preferences (language, theme, grid) persist in local storage.

### 5. Fishbone tips

1. Switch to **Fishbone**.
2. Select the Effect node → **Add Child** for categories.
3. Select a category → **Add Child** for causes.
4. Drag to fine-tune, or use **Auto Align**.

### 6. File format

- Extension: `.mmap` (legacy `.mymind` files also open)
- Format: JSON (node positions/shapes/memo, edges with line shape/pattern/caps, mode/layout)
- Portable across MyMind installations
- The Windows installer associates `.mmap` files with MyMind

### 7. Troubleshooting

| Issue | Try |
|-------|-----|
| Content off-screen | **Center View** |
| Messy layout | **Auto Align** |
| No grid | Enable Grid on toolbar or status bar |
| Path not remembered (web) | Web uses downloads; use the desktop app for path persistence |

### 8. Support

Contact: **SHKWON** — knix008@naver.com
