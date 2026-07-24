# 기술 아키텍처 — 3D Architecture Viewer

## 목차

1. [전체 아키텍처 개요](#1-전체-아키텍처-개요)
2. [프론트엔드 컴포넌트 구조](#2-프론트엔드-컴포넌트-구조)
3. [핵심 모듈](#3-핵심-모듈)
4. [데이터 흐름](#4-데이터-흐름)
5. [이미지 벽 감지 파이프라인](#5-이미지-벽-감지-파이프라인)
6. [좌표계 변환](#6-좌표계-변환)
7. [AI 추론 파이프라인](#7-ai-추론-파이프라인)
8. [Electron IPC 구조](#8-electron-ipc-구조)
9. [상태 관리](#9-상태-관리)
10. [빌드 및 배포](#10-빌드-및-배포)

---

## 1. 전체 아키텍처 개요

```
┌─────────────────────────────────────────────────────┐
│              Electron (데스크톱)                      │
│  ┌──────────────┐        ┌─────────────────────────┐ │
│  │  Main 프로세스 │  IPC   │   Renderer 프로세스      │ │
│  │ electron/    │◄──────►│  React + Three.js       │ │
│  │ main.js      │        │  Vite Dev Server        │ │
│  └──────┬───────┘        └─────────────────────────┘ │
│         │ spawn                                       │
│  ┌──────▼───────┐                                     │
│  │ Python 서버   │  HTTP REST (port 5001)              │
│  │ ai_server.py  │◄──────────────────── Renderer      │
│  └──────────────┘                                     │
└─────────────────────────────────────────────────────┘

브라우저 모드: Renderer만 동작 (웹 서버 없음, Electron 불필요)
```

- **Renderer 프로세스**(React)가 전체 UI와 3D 씬을 담당합니다.
- **Main 프로세스**는 파일 다이얼로그, 스크린샷 저장, Python 서버 관리만 수행합니다.
- Python AI 서버는 선택적(optional) 컴포넌트입니다.

---

## 2. 프론트엔드 컴포넌트 구조

```
App.jsx                          ← 루트: 전역 상태 보유
├── Toolbar.jsx                  ← 상단 툴바 (버튼 이벤트 → App 콜백)
├── FileDropZone.jsx             ← 드래그&드롭 오버레이
├── SidePanel.jsx                ← 좌측 슬라이더 설정
├── Viewer3D.jsx                 ← Three.js 씬 컨테이너
│   ├── <canvas>                 ← WebGLRenderer 마운트 대상
│   └── <div.light-control-panel> ← 조명 제어 패널 (절대 위치)
├── RightPanel.jsx               ← 우측 속성/통계
├── ModelManagerModal.jsx        ← AI 모델 관리 모달
└── SettingsModal.jsx            ← 슬라이더 범위 설정 모달
```

### 데이터 흐름 원칙

- **단방향 데이터 흐름**: `App.jsx`가 상태(state)를 보유하고 props로 하위 컴포넌트에 전달합니다.
- 하위 컴포넌트는 콜백 함수를 호출해 상태 변경을 요청합니다.
- Three.js 씬은 React 외부(imperative) 방식으로 관리됩니다 — `useRef`로 씬 객체 보유, `useEffect`로 동기화합니다.

---

## 3. 핵심 모듈

### `src/core/dxfParser.js`

- **입력**: DXF 파일 텍스트 (UTF-8 / CP949)
- **출력**: `{ lines: [{x1,y1,x2,y2}], layers: string[] }`
- LWPOLYLINE, LINE, POLYLINE 엔티티 파싱
- 레이어(LAYER) 메타데이터 추출

### `src/core/ifcParser.js`

- **입력**: IFC 파일 텍스트
- **출력**: `{ elements: [{type, vertices, layerName}] }`
- `IfcWall`, `IfcWallStandardCase` 요소 추출
- `IFCLOCALPLACEMENT` 기준으로 절대 좌표 계산

### `src/core/imageParser.js`

- **입력**: `HTMLImageElement` 또는 이미지 URL, 분석 파라미터
- **출력**: `{ lines, edgeDataUrl, cleanEdgeDataUrl }`
- 벽 감지 파이프라인 실행 (상세는 [5장](#5-이미지-벽-감지-파이프라인) 참조)

### `src/core/buildGeometry.js`

- **입력**: 파싱된 선분 배열, 벽 높이, 벽 두께, 바닥/천장 플래그
- **출력**: Three.js `Group` 객체 (씬에 추가할 준비 완료)
- 각 선분 → `BoxGeometry` (벽 메시)
- 바닥 → `PlaneGeometry` (`rotation.x = -π/2`, `flipY = false`)
- 벽 메시 위치: `(cx, h/2, -cy)` — Y를 올리고 Z를 반전해 이미지 좌표에서 3D 월드로 변환

### `src/core/onnxRunner.js`

- **입력**: `HTMLImageElement`, 모델 설정(`input_size`, `mean`, `std`, `input_name`, `output_name`)
- **출력**: 정규화된 깊이 맵 `Float32Array`
- `onnxruntime-web` v1.27 사용, WebAssembly 백엔드
- NCHW `[1, 3, H, W]` float32 텐서 생성
- 결과 텐서 shape 정규화 후 min-max 스케일

### `src/core/modelStore.js`

- IndexedDB 기반 ONNX 모델 파일 캐시
- 다운로드된 ArrayBuffer를 `model-files` objectStore에 저장
- `saveModel(id, buffer)` / `loadModel(id) → ArrayBuffer` / `deleteModel(id)`

### `src/core/modelCatalog.js`

- AI 모델 메타데이터 정의 (URL, input/output 이름, 입력 크기, 정규화 파라미터)
- `runtime: 'onnx-web'` — 브라우저 직접 실행
- `runtime: 'python-api'` — Python Flask 서버 경유

### `src/core/aiClient.js`

- Python AI 서버 (`http://127.0.0.1:5001`) REST 클라이언트
- 엔드포인트: `/api/status`, `/api/models`, `/api/models/download`, `/api/models/load`, `/api/infer`

### `src/i18n.js`

- 한국어 / 영어 문자열 테이블
- `t(key, lang)` 헬퍼 함수로 컴포넌트에서 사용

---

## 4. 데이터 흐름

### 파일 로드 흐름

```
사용자 파일 선택
        │
        ▼
 App.jsx handleFile()
        │
        ├─ .dxf  → dxfParser.parse()  → lines[]  ─┐
        ├─ .ifc  → ifcParser.parse()  → lines[]  ─┤
        ├─ .obj  → Three.js OBJLoader           ─┤ → buildGeometry() → Three.js Scene
        ├─ .gltf → Three.js GLTFLoader          ─┤
        └─ image → imageParser.detect() → lines[] ─┘
```

### AI 추론 흐름 (ONNX-web)

```
이미지 → onnxRunner.run()
  ├─ modelStore.loadModel(id)  (IndexedDB 캐시)
  │   └─ 없으면 fetch(url) → 다운로드 → 저장
  ├─ InferenceSession.create(arrayBuffer)
  ├─ 텐서 전처리 (리사이즈, 정규화, NCHW)
  ├─ session.run({ [input_name]: tensor })
  └─ 결과 정규화 → depthMap Float32Array
```

### AI 추론 흐름 (Python-API)

```
이미지 → aiClient.infer(imageBlob)
  │    POST /api/infer (multipart/form-data)
  ▼
Python ai_server.py
  ├─ ONNX Runtime (onnxruntime-gpu or cpu)
  └─ 결과 JSON { depthMap: float[] } → Renderer
```

---

## 5. 이미지 벽 감지 파이프라인

```
원본 이미지
    │
    ▼ 1. 그레이스케일 변환
    │   R*0.299 + G*0.587 + B*0.114
    │
    ▼ 2. 가우시안 블러 (3×3 커널)
    │   노이즈 제거
    │
    ▼ 3. Sobel 에지 감지
    │   Gx (수평) + Gy (수직) → 그래디언트 크기·방향
    │
    ▼ 4. Non-Maximum Suppression (NMS)
    │   에지를 1픽셀 너비로 세선화
    │
    ▼ 5. 이진 임계화 (Binary Threshold)
    │   임계값 이하 픽셀 제거
    │
    ▼ 6. 노이즈 제거 (Denoise)
    │   고립된 작은 에지 클러스터 제거
    │
    ▼ 7. 확률적 Hough 변환 (Progressive Probabilistic)
    │   에지 픽셀 집합 → 선분 파라미터 (r, θ, x1,y1, x2,y2)
    │   최소 선분 길이 · 병합 간격 파라미터 적용
    │
    ▼ 8. 밀도 체크
    │   선분 주변 픽셀 밀도가 낮으면 허위 선분으로 제거
    │
    ▼ 결과: lines[] (이미지 픽셀 좌표)
        + edgeDataUrl (NMS 에지 미리보기)
        + cleanEdgeDataUrl (감지된 벽 선분 오버레이)
```

---

## 6. 좌표계 변환

### 이미지 좌표 → Three.js 월드 좌표

이미지는 `(0,0)` = 좌상단, Y축이 아래로 증가합니다.  
Three.js 월드는 `(0,0,0)` = 씬 중심, Y축이 위로 증가합니다.

```
이미지 (픽셀)     →   Three.js 월드 (미터)
  x              →   x   (그대로, 스케일 적용)
  y              →   -z  (Y 반전: 이미지 아래 = 3D 앞)
  (없음)          →   y   (벽 높이 방향)
```

**스케일**: 이미지 픽셀 크기를 미터 단위로 환산하는 `scale` 파라미터 사용.

**바닥 텍스처**: `flipY = false` 로 Three.js의 Y 반전을 비활성화하여 이미지 원본 방향을 유지합니다.

**벽 메시 배치**:
```js
mesh.position.set(cx * scale, wallHeight / 2, -cy * scale);
// cx, cy = 선분 중점 (이미지 픽셀)
// y = 절반 높이 (바닥에서 위로)
// z = -cy (이미지 Y 반전)
```

---

## 7. AI 추론 파이프라인

### ONNX 텐서 전처리

```
HTMLImageElement (W×H)
    │
    ▼ 캔버스 리사이즈 → [input_size[0] × input_size[1]]
    │
    ▼ getImageData() → Uint8ClampedArray (RGBA)
    │
    ▼ 정규화: (pixel/255 - mean) / std  (채널별)
    │
    ▼ NCHW 재배열: [1, 3, H, W] Float32Array
    │
    ▼ new ort.Tensor('float32', data, [1, 3, H, W])
    │
    ▼ session.run({ pixel_values: tensor })
    │
    ▼ output[predicted_depth] → Float32Array
    │
    ▼ min-max 정규화 → [0, 1] 범위
```

### 모델 세션 캐싱

`onnxRunner.js`는 `InferenceSession` 인스턴스를 모듈 레벨 `Map`에 캐시합니다.  
동일 모델을 재실행할 때 재초기화 비용(수 초)을 생략합니다.

---

## 8. Electron IPC 구조

```
Renderer (React)          preload.js            Main (Node.js)
      │                       │                       │
      │  window.electronAPI   │                       │
      │──.openFile()─────────►│──ipcRenderer.invoke──►│ dialog.showOpenDialog()
      │◄─────────────────────│◄─ipcMain.handle───────│ → filePath
      │                       │                       │
      │──.saveScreenshot()───►│──ipcRenderer.invoke──►│ dialog.showSaveDialog()
      │◄─────────────────────│◄──────────────────────│ → fs.writeFile()
      │                       │                       │
      │──.startAIServer()────►│──ipcRenderer.invoke──►│ spawn('python', [...])
      │──.stopAIServer()─────►│                       │ process.kill()
```

`preload.js`의 `contextBridge`가 `window.electronAPI` 객체를 노출해  
Renderer와 Main 프로세스 간 보안 통신을 중개합니다.

브라우저 모드에서는 `window.electronAPI`가 `undefined`이므로  
관련 기능(파일 저장 다이얼로그, Python 서버 기동)은 비활성화됩니다.

---

## 9. 상태 관리

`App.jsx`가 보유하는 주요 상태:

| 상태 | 타입 | 설명 |
|------|------|------|
| `fileData` | object \| null | 파싱된 도면 데이터 |
| `lang` | `'ko'` \| `'en'` | UI 언어 |
| `theme` | `'dark'` \| `'light'` | 테마 |
| `wallHeight` | number | 벽 높이 (m) |
| `wallThickness` | number | 벽 두께 (m) |
| `showFloor` | boolean | 바닥 표시 여부 |
| `showCeiling` | boolean | 천장 표시 여부 |
| `wireframe` | boolean | 와이어프레임 모드 |
| `showAxes` | boolean | 좌표축 표시 |
| `showGrid` | boolean | 그리드 표시 |
| `showLightControl` | boolean | 조명 패널 표시 |
| `sliderRanges` | object | 슬라이더 최솟값·최댓값 |
| `visibleLayers` | Set\<string\> | 표시할 레이어 이름 집합 |

`Viewer3D.jsx`가 보유하는 Three.js 관련 상태:

| 상태 | 설명 |
|------|------|
| `lightSettings` | 조명 세기·색상 (`ambientIntensity`, `sunIntensity`, `fillIntensity`, `sunColor`, `ambientColor`) |
| `showGizmo` | 태양 위치 기즈모 On/Off |
| `panelPos` | 조명 패널 드래그 위치 (`{x, y}` \| null) |

---

## 10. 빌드 및 배포

### 개발 모드

```
npm run dev    → Vite 개발 서버 (HMR, http://localhost:5173)
npm start      → Electron + Vite 동시 실행
```

### 프로덕션 빌드

```
npm run build          → Vite 번들 빌드 (dist/)
npm run electron:build → electron-builder로 플랫폼별 설치 파일 생성
```

### 플랫폼별 출력물

| 플랫폼 | 형식 | 명령 |
|--------|------|------|
| Windows | `.exe` (NSIS 설치 파일) | `npm run build:win` |
| macOS | `.dmg` | `npm run build:mac` |
| Linux | `.AppImage` | `npm run build:linux` |

### Python 서버 패키징

Electron 빌드 시 `python/` 폴더가 앱에 번들됩니다.  
사용자 최초 실행 시 `setup_python.bat` (Windows) 또는 `setup_python.sh` (Unix)로  
가상환경(venv)을 생성하고 `requirements.txt` 패키지를 설치합니다.

이후 앱이 Python 서버를 자동으로 기동·종료합니다.
