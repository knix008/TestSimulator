# 예제 파일 / Samples

모두 이 프로젝트에서 three.js 기본 도형으로 만든 것이라 자유롭게 쓸 수 있습니다 (MIT).
`npm run samples` 로 다시 만듭니다 (`scripts/make-samples.mjs`, `scripts/sample-scenes.js`).
프로그램의 시작 화면 **예제** 목록과 파일 메뉴에서 바로 열 수 있습니다.

All of these were made here from three.js primitives and are free to use (MIT).
Rebuild them with `npm run samples`. The start screen's **Examples** list and the File menu open them directly.

## images/ — 변환해 볼 이미지 / pictures to convert

투명 배경 PNG(768 × 768). 이미지를 열고 [3D로 변환]을 누르세요.

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

## results/ — 변환 결과 / conversion results

엔진으로 위 이미지를 변환한 결과입니다 (모델의 결과물).

| 파일 | 원본 | 모델 |
| --- | --- | --- |
| `mug-sf3d.glb` | `images/mug.png` | Stable Fast 3D (UV + PBR 텍스처) |
| `robot-triposr.glb` | `images/robot.png` | TripoSR (정점 색) |

`index.json` 은 프로그램이 읽는 목록입니다.
