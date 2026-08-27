# ICOMaker — Architecture

ICOMaker는 **React + Vite** 렌더러와 **Electron** 메인 프로세스로 구성된 크로스 플랫폼
데스크톱/웹 앱입니다. 아이콘 디자인은 512×512 논리 좌표의 **SVG 캔버스**에서 이루어지며,
내보낼 때 각 크기로 래스터화하여 `.ico` 컨테이너로 인코딩합니다.

---

## 1. 디렉터리 구조

```
ICOMakerMultiOSV10/
├─ electron/
│  ├─ main.js            # Electron 메인: 창 생성, IPC, 단일 인스턴스, 창 제어
│  └─ preload.js         # contextBridge (window.electronAPI)
├─ scripts/
│  ├─ start-electron.mjs      # ELECTRON_RUN_AS_NODE 제거 후 Electron 실행
│  ├─ generate-icons.mjs      # assets/icon.svg → build/icons/*(ico/icns/png)
│  ├─ generate-build-info.mjs # src/build-info.json 생성
│  └─ copy-installer.js       # release/* → 프로젝트 루트 복사
├─ build/
│  ├─ installer.nsh      # NSIS: 바로가기 선택 페이지(한/영)
│  └─ icons/             # (생성물) 앱 아이콘
├─ assets/
│  └─ icon.svg           # 앱 아이콘 소스(3D 광택, 좌상단 하이라이트, 투명 테두리)
├─ src/
│  ├─ main.jsx           # React 진입점
│  ├─ App.jsx            # 최상위 상태·레이아웃·핸들러
│  ├─ App.css            # 전체 스타일(테마 변수 포함)
│  ├─ i18n.js            # i18next (ko/en) 리소스
│  ├─ build-info.json    # (생성물) 버전·커밋·빌드시각
│  ├─ components/        # UI 컴포넌트
│  └─ lib/               # 순수 로직(캔버스 모델·인코더·디코더)
├─ index.html
├─ vite.config.js
└─ package.json          # 스크립트 + electron-builder 설정
```

---

## 2. 프로세스 구성

```
┌─────────────────────────────┐        IPC (contextBridge)        ┌────────────────────┐
│  Renderer (React / Vite)    │  ───────────────────────────────▶ │  Main (Electron)   │
│  App.jsx                    │   window.electronAPI.*            │  electron/main.js  │
│   ├─ Toolbar / DrawTools    │                                   │   ├─ 파일 열기      │
│   ├─ IconCanvas (SVG)       │ ◀───────────────────────────────  │   ├─ 이진 저장      │
│   ├─ RightPanel (효과·내보내기)│    파일 경로 / 저장 결과            │   ├─ 창 제어        │
│   └─ CanvasInfo / StatusBar │                                   │   └─ 단일 인스턴스   │
└─────────────────────────────┘                                   └────────────────────┘
```

- **웹 모드**에서는 `window.electronAPI` 가 없으므로, 파일 열기는 `<input type=file>`,
  저장은 브라우저 다운로드(Blob)로 대체됩니다. 렌더러 코드는 `api` 존재 여부로 분기합니다.

---

## 3. 핵심 모듈

### `src/lib/iconCanvas.js` — 캔버스 모델 & 렌더/인코딩
- **객체 모델**: `{ id, type, x/y/w/h | x1..y2 | points, fill, stroke, opacity, rotate, fx, … }`
  - `type`: `rect | ellipse | line | pen | text | image | shape`
  - `shape` 는 `shape` 필드로 세부 도형(triangle, star, cube, sphere …)을 구분
- `createObject`, `bbox`, `normalizeBox` — 생성·경계·정규화
- `filterDef(o)` — 효과를 SVG `<filter>` 로 변환 (흐림·3D 베벨(feSpecularLighting)·그림자)
- `objToSvg(o)` — 객체 1개를 SVG 문자열로 (회전은 `<g transform=rotate>` 로 래핑)
  - `shapeToSvg` (2D 파라메트릭 도형), `solidToSvg` (면별 음영 3D)
- `serializeSvg(objects, size, background, opacity, bgPad)` — 전체 캔버스 SVG 문자열
- `svgToPngBytes(svg, size)` — SVG → Canvas 래스터화 → PNG 바이트
- `buildIco(...)` / `buildIcoEach(...)` — 멀티해상도 단일 ICO / 크기별 개별 ICO

### `src/lib/ico.js` — 컨테이너 인코더
- `encodeIco(entries)` — PNG 기반 `.ico`(ICONDIR + 엔트리) 생성
- `encodeIcns(entries)` — PNG 기반 macOS `.icns` 생성 (앱 아이콘 빌드에 사용)

### `src/lib/decode.js` — 범용 이미지 디코더
- 네이티브(PNG/JPG/GIF/ICO/BMP/WebP/AVIF/SVG)는 그대로 사용
- **TIFF → utif**, **HEIC/HEIF → heic2any**, **DICOM(.dcm) → dicom-parser** 로 PNG 변환
- 무거운 디코더는 **lazy import** 되어 해당 포맷을 열 때만 로드

---

## 4. 컴포넌트 (`src/components/`)

| 컴포넌트 | 역할 |
|---|---|
| `Toolbar.jsx` | 상단 툴바(가져오기·확대·내보내기·언어·테마·정보) + 프레임리스 창 제어(최소/최대/닫기) |
| `DrawTools.jsx` | 좌측 패널: 도구(섹션별 2열) + 개체 목록(레이어, z-order 버튼) |
| `IconCanvas.jsx` | 중앙 SVG 캔버스: 생성/선택/이동/리사이즈, 휠 줌, 우클릭 컨텍스트 메뉴 |
| `RightPanel.jsx` | 우측 패널: 속성 + 효과(3D 포함) + ICO 내보내기(크기·배경·여백·투명도) |
| `ContextMenu.jsx` | 아이콘+라벨 컨텍스트 메뉴(맨앞/앞/뒤/맨뒤·복제·삭제) |
| `CanvasInfo.jsx` | 캔버스 상단 정보 바(형식·크기·개체 수·크기·배경·불투명도) |
| `StatusBar.jsx` | 하단 상태 바(상태·도구·선택·확대율) |
| `AboutDialog.jsx` | 정보 창(버전·빌드정보·제작자, 내용 복사) |
| `ErrorDialog.jsx` | 오류 팝업(상세 내용 복사) |
| `Icons.jsx` | 인라인 SVG 아이콘 모음 |

---

## 5. 데이터 흐름 (내보내기)

```
objects[] (App state)
   │  serializeSvg(objects, size, bg, opacity, bgPad)   // 각 선택 크기별
   ▼
SVG 문자열 ──▶ svgToPngBytes() ──▶ PNG(Uint8Array)
   │
   ├─ 단일:   encodeIco([{16},{32},…])  → 하나의 .ico
   └─ 크기별: encodeIco([{size}])×N     → 크기별 .ico (Electron=폴더 / Web=zip)
   ▼
저장:  Electron → IPC(saveBinary/saveFiles)   ·   Web → Blob 다운로드
```

---

## 6. 빌드 & 패키징

- **개발**: `npm start` → `scripts/start-electron.mjs` 가 `ELECTRON_RUN_AS_NODE` 를
  제거하고 Electron 실행(웹은 Vite dev 서버).
- **웹 번들**: `vite build` → `dist/` (Electron 프로덕션에서 `dist/index.html` 로드,
  `base: './'` 로 상대 경로 사용).
- **패키징**: `electron-builder` (설정은 `package.json` 의 `build`).
  - Windows: NSIS(`build/installer.nsh` 로 바로가기 선택 페이지), 앱 아이콘 `build/icons/icon.ico`
  - `prebuild:*` 훅이 `generate:icons` + `generate:build-info` 실행, `postbuild:*` 훅이 설치 파일을 루트로 복사
- **앱 아이콘**: `assets/icon.svg` → `scripts/generate-icons.mjs`(sharp 래스터화 +
  `ico.js` 인코더) → `build/icons/`(ico/icns/png).

---

## 7. 주의사항 / 관례

- **`ELECTRON_RUN_AS_NODE`**: 전역 설정 시 Electron이 Node로 실행되어 `app` 이 undefined가
  됩니다. 반드시 변수를 **삭제**(빈 문자열로는 부족)해야 하며, `start-electron.mjs` 가 처리합니다.
- **좌표계**: 캔버스는 항상 512×512 논리 단위. 화면 표시는 `zoom` CSS 스케일, 포인터 좌표는
  `getBoundingClientRect` 로 역산.
- **SVG 주입**: 라이브 캔버스는 객체별 `objToSvg()` 문자열을 `dangerouslySetInnerHTML` 로
  렌더링하여 래스터 경로와 동일한 출력을 보장.
- **단일 진실 공급원**: 미리보기(캔버스)와 내보내기(ICO)는 모두 `iconCanvas.js` 의 동일한
  `serializeSvg` 를 사용하므로 화면과 결과물이 일치.
