# 예제 파일 / Samples

프로그램의 시작 화면 **예제** 목록과 파일 메뉴에서 바로 열 수 있습니다.
The start screen's **Examples** list and the File menu open them directly.

`index.json` 은 프로그램이 읽는 목록입니다. `npm run samples` 는 직접 만든 그림 · 3D 파일을 다시 만들고(dev 서버 · Edge 필요),
`npm run samples:photos` 는 공개 예제 그림을 원본 저장소(고정 커밋)에서 **원본 그대로**(크기 조정 · 재압축 없음) 받고,
`npm run samples:index` 는 브라우저 없이 목록만 갱신합니다(공개 예제 그림 등록, 빠진 `mug.obj` 다시 쓰기).

변환할 그림은 모두 **원본 해상도가 1024 × 1024 이상**입니다(늘려서 맞춘 그림 없음).
Every picture to convert is natively at least 1024 × 1024 (none is scaled up).

## images/ — 변환해 볼 이미지 / pictures to convert

이미지를 열고 [3D로 변환]을 누르세요. Open one and press Convert to 3D.

### 공개 예제 그림 (MIT) / example pictures from the model repositories

TRELLIS.2 의 공식 예제 그림 가운데 원본이 1024 px 이상인 것(1024–2162 px, 투명 배경)과 TripoSR 의 여우(1136 px)입니다.
`fox` 는 회색 배경이라 **배경 자동 제거**를 확인해 보기 좋습니다.
TRELLIS.2 example pictures whose originals are 1024 px or more (transparent), and TripoSR's fox (1136 px, grey background).

| 파일 | 내용 | 출처 (라이선스) |
| --- | --- | --- |
| `scifi-tank.webp` | SF 탱크 / sci-fi tank | TRELLIS.2 `assets/example_image` (MIT, Microsoft) |
| `palm-tree.webp` | 야자수 / palm tree | TRELLIS.2 `assets/example_image` (MIT, Microsoft) |
| `knight-helmet.webp` | 기사 투구 / knight helmet | TRELLIS.2 `assets/example_image` (MIT, Microsoft) |
| `scrap-robot.webp` | 고철 로봇 / scrap robot | TRELLIS.2 `assets/example_image` (MIT, Microsoft) |
| `steampunk-boy.webp` | 스팀펑크 소년 / steampunk boy | TRELLIS.2 `assets/example_image` (MIT, Microsoft) |
| `hill-town.webp` | 언덕 마을 / hill town | TRELLIS.2 `assets/example_image` (MIT, Microsoft) |
| `angel-statue.webp` | 천사 석상 / angel statue | TRELLIS.2 `assets/example_image` (MIT, Microsoft) |
| `pineapple.webp` | 파인애플 / pineapple | TRELLIS.2 `assets/example_image` (MIT, Microsoft) |
| `backpack.webp` | 등산 배낭 / hiking backpack | TRELLIS.2 `assets/example_image` (MIT, Microsoft) |
| `alchemy-room.webp` | 연금술사의 방 / alchemist's room | TRELLIS.2 `assets/example_image` (MIT, Microsoft) |
| `wanderer.webp` | 두건 쓴 방랑자 / hooded wanderer | TRELLIS.2 `assets/example_image` (MIT, Microsoft) |
| `goblin-bust.webp` | 고블린 흉상 / goblin bust | TRELLIS.2 `assets/example_image` (MIT, Microsoft) |
| `garden-trellis.webp` | 덩굴 시렁 / garden trellis | TRELLIS.2 `assets/example_image` (MIT, Microsoft) |
| `mermaid.webp` | 인어 / mermaid | TRELLIS.2 `assets/example_image` (MIT, Microsoft) |
| `rusty-robot.webp` | 녹슨 로봇 / rusty robot | TRELLIS.2 `assets/example_image` (MIT, Microsoft) |
| `walking-tank.webp` | 보행 전차 / walking tank | TRELLIS.2 `assets/example_image` (MIT, Microsoft) |
| `heavy-mech.webp` | 중장갑 메카 / heavy mech | TRELLIS.2 `assets/example_image` (MIT, Microsoft) |
| `fairy-island.webp` | 동화 마을 섬 / fairy-tale island | TRELLIS.2 `assets/example_image` (MIT, Microsoft) |
| `hourglass.webp` | 모래시계 / hourglass | TRELLIS.2 `assets/example_image` (MIT, Microsoft) |
| `princess-doll.webp` | 공주 인형 / princess doll | TRELLIS.2 `assets/example_image` (MIT, Microsoft) |
| `windmill.webp` | 풍차 / windmill | TRELLIS.2 `assets/example_image` (MIT, Microsoft) |
| `dragon-armour.webp` | 용 갑옷 / dragon armour | TRELLIS.2 `assets/example_image` (MIT, Microsoft) |
| `orc-warrior.webp` | 오크 전사 / orc warrior | TRELLIS.2 `assets/example_image` (MIT, Microsoft) |
| `rainbow-wings.webp` | 무지개 날개 / rainbow wings | TRELLIS.2 `assets/example_image` (MIT, Microsoft) |
| `covered-wagon.webp` | 포장마차 / covered wagon | TRELLIS.2 `assets/example_image` (MIT, Microsoft) |
| `shield.webp` | 방패 / shield | TRELLIS.2 `assets/example_image` (MIT, Microsoft) |
| `courier-bike.webp` | 배달 오토바이 / courier motorbike | TRELLIS.2 `assets/example_image` (MIT, Microsoft) |
| `gargoyle.webp` | 가고일 / gargoyle | TRELLIS.2 `assets/example_image` (MIT, Microsoft) |
| `moss-golem.webp` | 이끼 골렘 / mossy golem | TRELLIS.2 `assets/example_image` (MIT, Microsoft) |
| `throne-statue.webp` | 왕좌 석상 / throne statue | TRELLIS.2 `assets/example_image` (MIT, Microsoft) |
| `factory-town.webp` | 공장 마을 / factory town | TRELLIS.2 `assets/example_image` (MIT, Microsoft) |
| `black-robot.webp` | 검은 로봇 / black robot | TRELLIS.2 `assets/example_image` (MIT, Microsoft) |
| `steam-machine.png` | 스팀펑크 기계 / steampunk machine | TRELLIS.2 `assets/example_image` (MIT, Microsoft) |
| `fox.png` | 폴리곤 여우 (회색 배경) / low-poly fox (grey background) | TripoSR `examples` (MIT, Tripo AI & Stability AI) |

3D 프린트로 뽑아 보기 좋은 것: `hourglass` · `windmill` · `throne-statue` · `goblin-bust` (바닥이 넓고 얇은 부분이 적음).
Good first 3D prints: `hourglass`, `windmill`, `throne-statue`, `goblin-bust` (broad base, few thin parts).

### 직접 만든 그림 (MIT) / made here from three.js primitives

투명 배경 PNG(1024 × 1024). `scripts/sample-scenes.js` 로 만듭니다.

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
