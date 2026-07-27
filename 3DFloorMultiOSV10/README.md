# FloorPlanTo3D — Multi OS (JavaScript)

[FloorPlanTo3D-unityClient](https://github.com/fadyazizz/FloorPlanTo3D-unityClient)를 참고해, Unity 대신 **브라우저(JavaScript + Three.js)** 로 2D 도면을 3D 모델로 변환하는 클라이언트입니다.

Windows / macOS / Linux / 모바일 브라우저에서 동일하게 동작합니다.

## 기능

- 2D 도면 이미지 업로드
- 3가지 분석 모드
  - **데모 데이터**: API/이미지 없이 즉시 3D 미리보기
  - **로컬 휴리스틱**: 오프라인으로 고대비 도면의 벽 선분 검출
  - **Mask R-CNN API**: 원본 [FloorPlanTo3D-API](https://github.com/fadyazizz/FloorPlanTo3D-API) 연동
- 스케일 / 벽 높이 / 벽·바닥 색상 조절
- 궤도 카메라 + 1인칭(WASD) 가상 투어

## 빠른 시작

```bash
npm install
npm start
```

Windows / macOS / Linux에서 **데스크톱 창(Electron)** 으로 실행됩니다.  
브라우저만 쓰려면 `npm run dev` 후 표시된 로컬 주소를 엽니다.

### 테마

상단 툴바의 **테마** 버튼으로 Light / Dark를 전환합니다. 선택값은 `localStorage`에 저장되며, 저장값이 없으면 OS 선호 테마를 따릅니다.

### 언어 (i18n)

상단 툴바의 **언어(KO/EN)** 버튼으로 한국어와 영어를 전환합니다. 저장값이 없으면 브라우저 언어(`navigator.language`)를 따릅니다.

### Electron (기본 메뉴 없음 + 커스텀 툴바)

Electron 기본 File/Edit/View 메뉴는 비활성화되어 있으며, 상단 아이콘 툴바로 주요 기능을 사용합니다.

```bash
npm start              # 권장: Vite + Electron 데스크톱 실행
npm run electron:dev   # start와 동일
npm run electron:build # dist 빌드 후 Electron으로 실행
```

### 설치 파일 (Windows / macOS / Linux / Web)

산출물은 `release/` 폴더에 생성됩니다.

```bash
npm run dist:web      # Web zip
npm run dist:win      # Windows Setup + Portable
npm run dist:mac      # macOS dmg/zip (macOS에서 빌드)
npm run dist:linux    # Linux AppImage + deb
npm run dist:all      # 현재 OS에서 가능한 대상 + Web
```

자세한 설치 방법은 [release/README.md](./release/README.md), [UsersGuide.md](./UsersGuide.md)를 참고하세요.

## Mask R-CNN API 연동 (선택)

원본과 동일한 딥러닝 검출을 쓰려면 API 서버를 먼저 실행합니다.

1. [FloorPlanTo3D-API](https://github.com/fadyazizz/FloorPlanTo3D-API) 클론 및 의존성 설치
2. 모델 가중치를 `weights/`에 배치
3. `python application.py` 로 서버 기동 (기본 `http://127.0.0.1:5000/`)
4. 이 앱에서 모드를 **Mask R-CNN API** 로 선택 후 도면 변환

API 응답 형식:

```json
{
  "points": [{ "x1": 0, "y1": 0, "x2": 10, "y2": 2 }],
  "classes": [{ "name": "wall" }],
  "Width": 800,
  "Height": 600,
  "averageDoor": 40
}
```

`classes.name`은 `wall` | `window` | `door` 입니다.

## 아키텍처

| 원본 (Unity) | 이 프로젝트 |
|---|---|
| Unity Client | Vite + Three.js Web App |
| `Builder.cs` | `src/builder/FloorPlanBuilder.js` |
| `WallMesh.cs` | BoxGeometry 기반 세그먼트 메시 |
| Flask Mask R-CNN API | 동일 API 호환 + 로컬/데모 폴백 |

```
도면 이미지
    → (데모 / 휴리스틱 / API) 검출 JSON
    → FloorPlanBuilder (벽·문·창·바닥)
    → Three.js 씬 (궤도 / 1인칭)
```

## 샘플 이미지

예제 **2D 평면도**는 루트 `samples/` 에 포함되어 있습니다 (`npm run samples`로 생성).

- 출처: [FloorPlanTo3D-unityClient/images](https://github.com/fadyazizz/FloorPlanTo3D-unityClient/tree/master/images)
- 앱 좌측 패널에서 썸네일을 클릭해 바로 불러올 수 있습니다.

## 프로젝트 구조

```
samples/                  # 예제 2D 평면도 (프로젝트 루트)
src/
  main.js                 # UI 연결
  api/client.js           # FloorPlanTo3D-API 클라이언트
  detect/heuristic.js     # 오프라인 휴리스틱 검출
  data/demoFloorPlan.js   # 데모 검출 데이터
  builder/FloorPlanBuilder.js
  scene/SceneApp.js
```

## 참고

- Unity 클라이언트: https://github.com/fadyazizz/FloorPlanTo3D-unityClient
- 검출 API: https://github.com/fadyazizz/FloorPlanTo3D-API
