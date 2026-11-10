# 예제 파일 / Samples

프로그램의 시작 화면 **예제** 목록과 파일 메뉴에서 바로 열 수 있습니다.
The start screen's **Examples** list and the File menu open them directly.

`index.json` 은 프로그램이 읽는 목록입니다. `npm run samples` 는 직접 만든 그림 · 3D 파일을 다시 만들고(dev 서버 · Edge 필요),
`npm run samples:index` 는 브라우저 없이 목록만 갱신합니다(공개 예제 그림 등록, 빠진 `mug.obj` 다시 쓰기).

## images/ — 변환해 볼 이미지 / pictures to convert

이미지를 열고 [3D로 변환]을 누르세요. Open one and press Convert to 3D.

### 공개 예제 그림 (MIT) / example pictures from the model repositories

이미지→3D 모델의 공식 예제로 쓰이는 그림을 512 × 512 로 줄인 것입니다. 투명 배경이 대부분이고,
`teapot` · `fox` 는 회색 배경이라 **배경 자동 제거**를 확인해 보기 좋습니다.

| 파일 | 내용 | 출처 (라이선스) |
| --- | --- | --- |
| `dragon.png` | 아기 용 / baby dragon | TRELLIS `assets/example_image` (MIT, Microsoft) |
| `cottage.png` | 알록달록 오두막 / colourful cottage | TRELLIS (MIT) |
| `mushroom-house.png` | 버섯 집 / mushroom house | TRELLIS (MIT) |
| `mech.png` | 로봇 메카 / mech | TRELLIS (MIT) |
| `lantern.png` | 랜턴 / lantern | TRELLIS (MIT) |
| `mailbox.png` | 우체통 / mailbox | TRELLIS (MIT) |
| `biplane.png` | 복엽기 / biplane | TRELLIS (MIT) |
| `locomotive.png` | 증기 기관차 / steam locomotive | TRELLIS (MIT) |
| `chair.png` | 의자 / chair | TripoSR `examples` (MIT, Tripo AI & Stability AI) |
| `hamburger.png` | 햄버거 / hamburger | TripoSR (MIT) |
| `teapot.png` | 찻주전자, 회색 배경 / teapot, grey background | TripoSR (MIT) |
| `fox.png` | 폴리곤 여우, 회색 배경 / low-poly fox, grey background | TripoSR (MIT) |

3D 프린트로 뽑아 보기 좋은 것: `chair` · `teapot` · `mushroom-house` · `lantern` (바닥이 넓고 얇은 부분이 적음).
Good first 3D prints: `chair`, `teapot`, `mushroom-house`, `lantern` (broad base, few thin parts).

### 직접 만든 그림 (MIT) / made here from three.js primitives

투명 배경 PNG(768 × 768). `scripts/sample-scenes.js` 로 만듭니다.

| 파일 | 내용 |
| --- | --- |
| `robot.png` | 로봇 / robot |
| `mug.png` | 머그컵 / mug |
| `pawn.png` | 체스 폰 / chess pawn |
| `tree.png` | 나무 / tree |
| `toy-car.png` | 장난감 자동차 / toy car |

## models/ — 3D 파일 (형식마다 하나) / one 3D file per format

| 파일 | 형식 | 비고 |
| --- | --- | --- |
| `robot.glb` | glTF Binary | 재질 색 포함 |
| `shapes.gltf` | glTF (JSON, 데이터 내장) | 도형 다섯 개 |
| `mug.obj` + `mug.mtl` | Wavefront OBJ + MTL | 데스크톱은 같은 폴더의 MTL 을 자동으로, 웹은 두 파일을 함께 선택 |
| `pawn.stl` | STL (바이너리) | 색 없음 — 3D 프린팅용 |
| `tree.ply` | PLY (바이너리) | |
| `toy-car.usdz` | USDZ | Apple AR Quick Look |

저장소 최상위 `.gitignore` 가 `*.obj`(컴파일러 산출물)를 무시하므로 이 폴더의 `.gitignore` 예외(`!/samples/models/*.obj`)로 `mug.obj` 를 추적합니다.

## results/ — 변환 결과 / conversion results

엔진으로 위 이미지를 변환한 결과입니다 (모델의 결과물).

| 파일 | 원본 | 모델 |
| --- | --- | --- |
| `mug-sf3d.glb` | `images/mug.png` | Stable Fast 3D (UV + PBR 텍스처) |
| `robot-triposr.glb` | `images/robot.png` | TripoSR (정점 색) |
