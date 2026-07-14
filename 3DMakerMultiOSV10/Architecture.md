# Architecture

3D Space Maker의 모듈 구조, 데이터 흐름, 주요 설계 결정을 정리합니다.

## 1. 목표와 범위

**목표**: 단일 2D 이미지를 monocular depth로 복원해, 사용자가 1인칭으로 탐험할 수 있는 공간을 제공한다.

**현재 범위 (MVP)**

- Electron 데스크톱 UI
- 로컬 깊이 추정 (WASM)
- 깊이 → 삼각형 메시 + 원본 텍스처
- PointerLock 기반 WASD 탐색과 단순 충돌

**의도적으로 아직 넣지 않은 것**

- 다중 시점 / 파노라마 융합
- NeRF / Gaussian Splatting
- 가려진 영역의 generative inpainting
- 클라우드 렌더링 API

## 2. 프로세스 구조

```
┌─────────────────────────────────────────────┐
│ Electron Main (src/main)                    │
│  - BrowserWindow 생성                       │
│  - preload 연결                             │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│ Preload (src/preload)                       │
│  - contextBridge로 최소 메타정보 expose       │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│ Renderer (src/renderer)                     │
│  UI + Three.js + Transformers.js (ORT WASM)  │
└─────────────────────────────────────────────┘
```

보안 기본값:

- `contextIsolation: true`
- `nodeIntegration: false`
- 렌더러에서는 Node ONNX(`onnxruntime-node`)를 stub으로 차단하고 **WASM**만 사용

## 3. 디렉터리 구조

```
3DMakerMultiOSV10/
├── assets/
│   ├── app-icon.png           # 모던 광택 앱 아이콘 원본
│   └── icon.png               # Electron 창/독 아이콘
├── electron.vite.config.mjs   # main / preload / renderer Vite 설정
├── package.json
├── scripts/
│   └── copy-ort.mjs           # onnxruntime-web WASM → public/ort 복사
├── src/
│   ├── main/
│   │   ├── index.js           # Electron 메인 프로세스
│   │   └── modelCache.js      # 모델 디스크 캐시 IPC (userData/hf-model-cache)
│   ├── preload/index.js       # contextBridge + modelCache API
│   └── renderer/
│       ├── index.html
│       ├── main.js            # UI 이벤트 연결
│       ├── styles.css
│       ├── image/loadImage.js # 포맷 검증·디코드·리사이즈
│       ├── depth/estimate.js  # Depth Anything V2 파이프라인
│       ├── scene/
│       │   ├── buildSpace.js  # depth → 메시/스폰/바닥
│       │   └── explorer.js    # 렌더러·1인칭·충돌
│       ├── ort/               # (생성물) ORT .wasm/.mjs — Vite ?url 로 로드
│       └── stubs/empty.js     # onnxruntime-node stub
├── README.md
├── UsersGuide.md
└── Architecture.md
```

## 4. 런타임 파이프라인

```
File (JPEG/PNG/GIF/AVIF/WebP)
        │
        ▼
 loadSupportedImage()
  - MIME/확장자 검증
  - createImageBitmap (EXIF orientation)
  - texture canvas ≤ 4096
  - depth canvas ≤ 1280
        │
        ├──────────────────────────────┐
        ▼                              ▼
 estimateDepth(depthCanvas)     buildSpaceFromDepth(texture, depth)
  - transformers pipeline             - 격자 샘플링
  - Depth Anything V2 Small           - 정규화 → 카메라 언프로젝션
  - device: wasm                      - UV + MeshStandardMaterial
        │                              - floorY / spawn / bounds
        └──────────────┬───────────────┘
                       ▼
              SpaceExplorer.setSpace()
                - PointerLockControls
                - WASD + raycast 충돌
                - render loop
```

### 4.1 이미지 로더 (`image/loadImage.js`)

- 지원 MIME: `image/jpeg`, `image/png`, `image/gif`, `image/avif`, `image/webp`
- 확장자 폴백으로 MIME가 비어 있는 파일도 허용
- GIF는 ImageBitmap의 첫 프레임을 사용
- 깊이용·표시용 해상도를 분리해 **품질과 추론 비용**을 동시에 관리

### 4.2 깊이 추정 (`depth/estimate.js`)

- 모델: `onnx-community/depth-anything-v2-small`
- 런타임: `onnxruntime-web` (WASM)
- Electron CSP가 CDN dynamic import를 막기 때문에  
  ORT 파일을 `src/renderer/ort/`에 두고 `?url`로 `wasmPaths`에 연결  
  (`/public` 동적 import는 Vite 개발 서버에서 오류가 남)
- `numThreads = 1`로 두어 COOP/COEP 없는 환경에서도 안정적으로 동작
- 파이프라인은 모듈 싱글톤으로 한 번만 로드

### 4.3 공간 메시 (`scene/buildSpace.js`)

1. 깊이맵을 `meshRes × rows` 격자로 샘플링
2. min–max 정규화 후 gamma(`0.85`)로 중간 대비 확보
3. pinhole 가정으로 `(u,v,depth) → (x,y,z)` 언프로젝션
4. 이미지 텍스처를 UV에 매핑
5. 하단 밴드의 `floorY`, 카메라 근처 `spawn` 추정

결과물은 “닫힌 watertight 룸”이 아니라 **시점을 따라 펼쳐진 depth surface**에 가깝습니다.  
전방 탐색에는 적합하고, 뒤로 돌아가거나 측면으로 크게 돌면 구멍이 보일 수 있습니다.

### 4.4 탐색기 (`scene/explorer.js`)

- Three.js `WebGLRenderer` + `PerspectiveCamera`
- `PointerLockControls`로 FPS 시야
- 월드 XYZ 축·라벨·바닥 그리드 (`scene/axes.js`)를 공간과 함께 표시
- 이동: 카메라 전방/우측 기준 XZ + Space/Ctrl 수직
- 충돌: AABB clamp + 단거리 raycast push-back + 하향 ray로 눈높이 보정

### 4.5 모델 캐시

1. **메모리**: `depthPipeline` 싱글톤 — 같은 실행 중 재로드 없음  
2. **디스크**: `app.getPath('userData')/hf-model-cache` — preload `modelCache` IPC + `env.customCache`  
3. 상태 문구: 캐시가 있으면 “캐시에서 로드”, 없을 때만 “다운로드”

## 5. 빌드와 에셋

### electron-vite

- Main / Preload: SSR 번들 → `out/main`, `out/preload`
- Renderer: Vite dev server 또는 `out/renderer`
- Renderer에서 `onnxruntime-node`는 stub으로 해석

### ORT 복사 (`scripts/copy-ort.mjs`)

`postinstall`과 `dev`/`build` 전에 실행되어 다음 파일을 복사합니다.

- `ort-wasm-simd-threaded.jsep.mjs` / `.wasm`
- `ort-wasm-simd-threaded.mjs` / `.wasm`

이 디렉터리는 `.gitignore`에 포함됩니다 (node_modules에서 재생성).

## 6. 보안·CSP

렌더러 CSP 요지:

- `script-src 'self' 'wasm-unsafe-eval' blob:`
- `connect-src`에 `https:` 허용 → 모델 가중치 다운로드
- CDN에서 ORT JS를 실행하지 않음 (로컬 `/ort`)

메인 프로세스는 외부 URL을 창으로 열지 않고 `shell.openExternal`만 허용합니다.

## 7. 성능 메모

| 구간 | 병목 | 완화 |
|------|------|------|
| 모델 첫 로드 | 네트워크·디스크 | 캐시, small 모델 |
| 깊이 추론 | WASM CPU | depth canvas 1280 cap |
| 메시 | 정점 수 | meshRes 160/256/384 |
| 텍스처 | VRAM | 4096 cap, anisotropy 제한 |

## 8. 확장 포인트

향후 “진짜 방 탐색” 품질을 올리려면 다음을 단계적으로 붙일 수 있습니다.

1. **바닥/벽 평면 피팅** — 스폰·충돌 안정화  
2. **occlusion inpainting** — 측면 구멍 메우기  
3. **다중 이미지 / 파노라마** — 시야 확장  
4. **메인 프로세스 또는 UtilityProcess 추론** — UI 스레드 부하 분리, Node ORT/GPU  
5. **내보내기** — GLB/OBJ, 스크린샷  

현재 아키텍처는 위 확장을 `depth/` · `scene/` · `image/` 경계 안에서 교체하기 쉽게 나뉘어 있습니다.

## 9. 관련 문서

- 사용자 조작·문제 해결: [UsersGuide.md](./UsersGuide.md)
- 저장소 개요: [README.md](./README.md)
