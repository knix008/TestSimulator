# FloorPlanTo3D — Multi OS (JavaScript)

[FloorPlanTo3D-unityClient](https://github.com/fadyazizz/FloorPlanTo3D-unityClient)를 참고해, Unity 대신 **브라우저 / Electron (JavaScript + Three.js)** 로 2D 도면을 3D 모델로 변환하는 클라이언트입니다.

**Author:** SHKWON \<knix008@naver.com\> · **Version:** 1.0.0

Windows / macOS / Linux에서 동일하게 동작합니다.

## 기능

- 2D 도면 이미지 선택 → **선택한 이미지** 기준으로 3D 변환
- 분석 모드
  - **로컬 휴리스틱**: 오프라인 벽/개구 검출 (기본)
  - **DreamSpaceAI**: 스캔라인 검출 + 이중선 병합 + 문/창 개구 (파라미터 패널)
  - **FloorPlanTo3D (Unity/API)**: [Mask R-CNN API](https://github.com/fadyazizz/FloorPlanTo3D-API)
    - **로컬 Python (venv)**: TF2 런타임 자동 설치·실행
    - **Docker (TF 1.15)**: `floorplan-api:1.15` 이미지/컨테이너로 실행
- Unity/API 검출 파라미터(신뢰도·클래스·병합 등) UI
- 외부 3D 모델 열기 (GLB/GLTF, OBJ, STL, FBX, PLY, USDZ 등)
- 스케일 / 벽 높이(0–5 m)·두께 / 벽·바닥 색상 / 바닥 패턴
- 커스터마이즈 변경 시 **현재 카메라 뷰 유지**
- 창: 유리 + 실(sill) + 인방(lintel) / 문: 문짝 + 인방
- 광원 HUD + **광원 표시** (마커·원점 연결선·기즈모)
- Trackball 카메라 / 모델 회전·스케일
- 투명 PNG 캡처 및 다중 형식 3D 저장
- Light / Dark 테마, 한국어 / English UI

## 빠른 시작

```bash
npm install
npm start
```

Windows / macOS / Linux에서 **데스크톱 창(Electron)** 으로 실행됩니다.  
브라우저만 쓰려면 `npm run dev` 후 표시된 로컬 주소를 엽니다.

### 테마 · 언어

- 툴바 **테마**: Light ↔ Dark (`localStorage`, 없으면 OS 선호)
- 툴바 **언어(KO/EN)**: 한국어 ↔ English (없으면 브라우저 언어)

### Electron

기본 File/Edit/View 메뉴는 비활성화되어 있으며, 상단 아이콘 툴바를 사용합니다.

```bash
npm start              # Vite + Electron 데스크톱 (권장)
npm run electron:dev   # start와 동일
npm run electron:build # dist 빌드 후 Electron 실행
```

### FloorPlanTo3D-API (Unity/API 모드)

| 실행 방식 | 설명 |
|---|---|
| **로컬 Python** | Python 3.10–3.12 + venv + TF2 패치 (`scripts/lib/floorplanApiTf2/`) |
| **Docker** | 이미지 `floorplan-api:1.15`, 포트 `5000`, weights 마운트 |

```bash
npm run fp3d-api:status         # 설치/실행/Docker 상태
npm run fp3d-api:docker:build   # docker compose build
npm run fp3d-api:docker:up      # 컨테이너 기동
npm run fp3d-api:docker:down
npm run fp3d-api:docker:logs
```

- Compose: [`docker-compose.floorplan-api.yml`](./docker-compose.floorplan-api.yml)
- Dockerfile: [`docker/floorplan-api/Dockerfile`](./docker/floorplan-api/Dockerfile)
- 기본 빌드 컨텍스트: sibling `../FloorPlanTo3D-API` (가중치 포함)
- 앱 UI에서도 Unity/API 모드 → **API 실행 방식**으로 선택 가능

가중치 파일 `maskrcnn_15_epochs.h5`가 없으면 Google Drive에서 수동으로 `FloorPlanTo3D-API/weights/`에 넣어야 합니다.

### 설치 파일 (Windows / macOS / Linux / Web)

`npm run dist:*` 실행 후 설치 파일은 **프로젝트 루트**에 복사되고, `release/`에도 보관됩니다.

```bash
npm run dist:web      # FloorPlanTo3D-*-web.zip
npm run dist:win      # Setup + Portable (.exe)
npm run dist:mac      # dmg/zip (macOS에서 빌드)
npm run dist:linux    # AppImage / deb / tar.gz
npm run dist:all      # 현재 OS에서 가능한 대상 + Web
```

자세한 내용: [release/README.md](./release/README.md), [UsersGuide.md](./UsersGuide.md)

## 도면 → 3D 변환

1. 툴바 **이미지**로 도면 선택 (뷰포트에 2D 미리보기)
2. 사이드 패널에서 **분석 방식** 선택 (Unity/API면 실행 방식·파라미터 확인)
3. **변환** 클릭 → 벽/문/창 검출 후 3D 생성

스케일·벽 높이/두께·색상 변경은 현재 뷰를 유지한 채 메시만 다시 만듭니다. 새 변환(`fresh`)일 때만 카메라가 맞춰집니다.

## 아키텍처 요약

| 원본 (Unity) | 이 프로젝트 |
|---|---|
| Unity Client | Vite + Three.js (+ Electron) |
| `Builder.cs` | `src/builder/FloorPlanBuilder.js` |
| `WallMesh.cs` | BoxGeometry 세그먼트 (+ 창/문 인방) |
| Flask Mask R-CNN API | venv(TF2) 또는 Docker(TF1.15) + 휴리스틱/DreamSpace |

```
도면 이미지
    → (휴리스틱 / DreamSpace / Unity API) 검출 JSON
    → FloorPlanBuilder (벽·문·창·바닥)
    → SceneApp (Trackball / 광원 / 기즈모 / 저장)
```

자세한 설계: [Architecture.md](./Architecture.md)

## 프로젝트 구조

```
docker/                      # FloorPlanTo3D-API Dockerfile
docker-compose.floorplan-api.yml
samples/                     # 예제 도면·모델
src/
  main.js                    # UI · 변환 파이프라인
  api/client.js              # Unity/API HTTP 클라이언트
  detect/heuristic.js
  detect/dreamspace*.js      # DreamSpace 검출 + 파라미터
  unityApi/                  # ensure / params
  builder/FloorPlanBuilder.js
  scene/SceneApp.js
  loaders/modelLoader.js
  exporters/modelExport.js
  i18n/                      # KO / EN
  ui/                        # 툴바, 테마, 진행률/다이얼로그
electron/                    # Electron 메인·preload
scripts/
  lib/floorplanApiInstall.mjs
  lib/floorplanApiTf2/       # TF2 런타임 번들
```

## 참고

- Unity 클라이언트: https://github.com/fadyazizz/FloorPlanTo3D-unityClient
- FloorPlanTo3D-API: https://github.com/fadyazizz/FloorPlanTo3D-API
- 사용 설명서: [UsersGuide.md](./UsersGuide.md)
- 아키텍처: [Architecture.md](./Architecture.md)
