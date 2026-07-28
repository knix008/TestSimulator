# FloorPlanTo3D — Multi OS (JavaScript)

[FloorPlanTo3D-unityClient](https://github.com/fadyazizz/FloorPlanTo3D-unityClient)를 참고해, Unity 대신 **브라우저 / Electron (JavaScript + Three.js)** 로 2D 도면을 3D 모델로 변환하는 클라이언트입니다.

**Author:** SHKWON \<knix008@naver.com\> · **Version:** 1.0.0

Windows / macOS / Linux에서 동일하게 동작합니다.

## 기능

- 2D 도면 이미지 선택 → **선택한 이미지** 기준으로 3D 변환
- 분석 모드
  - **로컬 휴리스틱**: 오프라인 벽/개구 검출 (기본)
  - **DreamSpaceAI**: 전용 오프라인 검출기 (센터라인·이중선 병합)
  - **FloorPlanTo3D (Unity/API)**: [unityClient](https://github.com/fadyazizz/FloorPlanTo3D-unityClient)와 동일 — 모드 선택 시 [FloorPlanTo3D-API](https://github.com/fadyazizz/FloorPlanTo3D-API)를 GitHub에서 받아 자동 설치·실행(진행률 팝업)
- 외부 3D 모델 열기 (GLB/GLTF, OBJ, STL, FBX, PLY, USDZ 등)
- 스케일 / 벽 높이·두께 / 벽·바닥 색상
- 광원 HUD + **광원 표시** (마커·원점 연결선·기즈모)
- Trackball 카메라 (전축 360° 회전) / 모델 회전·스케일
- 투명 PNG 캡처 및 다중 형식 3D 저장 (GLB, GLTF, OBJ, STL, PLY, USDZ…)
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

### 설치 파일 (Windows / macOS / Linux / Web)

`npm run dist:*` 실행 후 설치 파일은 **프로젝트 루트**에 복사되고, `release/`에도 보관됩니다.

```bash
npm run dist:web      # FloorPlanTo3D-*-web.zip
npm run dist:win      # Setup + Portable (.exe)
npm run dist:mac      # dmg/zip (macOS에서 빌드)
npm run dist:linux    # AppImage / deb / tar.gz
npm run dist:all      # 현재 OS에서 가능한 대상 + Web
```

예: `FloorPlanTo3D-1.0.0-Setup-win-x64.exe`, `FloorPlanTo3D-1.0.0-portable-win-x64.exe`

자세한 내용은 [release/README.md](./release/README.md), [UsersGuide.md](./UsersGuide.md)를 참고하세요.

## 도면 → 3D 변환

1. 툴바 **이미지**로 도면 선택 (뷰포트에 2D 미리보기)
2. 사이드 패널에서 **분석 방식** 선택
3. **변환** 클릭 → 선택 이미지(또는 선택한 모드)로 벽/문/창 검출 후 3D 생성

선택 이미지를 기준으로 휴리스틱 또는 DreamSpace 검출기로 3D를 생성합니다.

## 아키텍처 요약

| 원본 (Unity) | 이 프로젝트 |
|---|---|
| Unity Client | Vite + Three.js (+ Electron) |
| `Builder.cs` | `src/builder/FloorPlanBuilder.js` |
| `WallMesh.cs` | BoxGeometry 세그먼트 메시 |
| Flask Mask R-CNN API | 로컬 휴리스틱 / DreamSpace 오프라인 검출 |

```
도면 이미지
    → (휴리스틱 / DreamSpace) 검출 JSON
    → FloorPlanBuilder (벽·문·창·바닥)
    → SceneApp (Trackball / 광원 / 기즈모 / 저장)
```

자세한 설계: [Architecture.md](./Architecture.md)

## 프로젝트 구조

```
samples/                     # 예제 도면·모델
src/
  main.js                    # UI · 변환 파이프라인
  detect/heuristic.js        # 오프라인 휴리스틱 검출
  detect/dreamspace.js       # DreamSpaceAI 오프라인 검출
  detect/dreamspaceDetect.js
  builder/FloorPlanBuilder.js
  scene/SceneApp.js
  loaders/modelLoader.js     # 다중 3D 포맷 로드
  exporters/modelExport.js   # PNG / 3D 저장
  i18n/                      # KO / EN
  ui/                        # 툴바, 테마, 다이얼로그
electron/                    # Electron 메인·preload
scripts/                     # 아이콘·패키징
```

## 참고

- Unity 클라이언트: https://github.com/fadyazizz/FloorPlanTo3D-unityClient
- 사용 설명서: [UsersGuide.md](./UsersGuide.md)
