# MyPhotoCut 구조

## 1. 한눈에

```
index.html → src/main.js ─┬─ app.js        메인 창 (메뉴·툴바·패널·갤러리·명령)
                          ├─ popup.js      팝업 (설정·정보·확인·오류·진행·메뉴·테마·환영·내보내기·이름·스타일·카메라)
                          └─ viewer.js     사용 설명서 창
```

- 데스크톱: Tauri 2. 웹 페이지 하나가 메인 창과 모든 팝업 창(OS 창 `popup-<kind>`)을 그립니다. Rust(src-tauri)는 파일 읽기/쓰기, 팝업 창 배치, 창 위치 기억, 글꼴 목록, 클립보드(그림 포함), 인쇄 대화상자를 맡습니다.
- 웹: 같은 코드. 팝업은 페이지 안 iframe, 파일은 File System Access API 또는 다운로드.

## 2. 처리 흐름

```
사진 ─▶ ui/photo.js (해독: 브라우저 / export/codecs.js) ─▶ 프로젝트 사진(최대 2048px JPEG)
     ─▶ ui/facefinder.js : MediaPipe 얼굴 모델(478점) + 인물 분리 ─▶ engine/face.js fromLandmarks
                          (실패 시 engine/face.js detectFace: 피부색) 
     ─▶ engine/face.js faceCrop (얼굴이 작으면 머리·어깨 구도)
     ─▶ app.js buildWork : 작업 그림(화면용 크기) + 마스크 ─▶ ui/renderer.js RenderPool (워커 N개)
     ─▶ engine/worker.js ─▶ engine/pipeline.js
             warp.js 과장 변형 → styles.js 스타일 → effects.js 픽셀 효과
     ─▶ ui/overlay.js (액자·문구·말풍선·스티커) ─▶ 갤러리 카드 / 크게 보기
저장: 같은 파이프라인을 저장 크기로 다시 실행 → ui/photo.js encodeCanvas (13가지 형식)
```

## 3. 폴더

| 경로 | 내용 |
|---|---|
| `src/engine/raster.js` | RGBA 래스터와 기본 연산(크기 조절, 가우시안/박스 블러, Sobel, XDoG, 양방향 필터, Kuwahara, k-means, 종이 질감) |
| `src/engine/face.js` | 특징점 모델, 랜드마크→특징점, 피부색 검출, 점 옮기기, 머리·어깨 자르기 |
| `src/engine/warp.js` | 과장 변형: 타원 영역마다 (sx, sy) 확대, 고원형 감쇠, 역방향 매핑 |
| `src/engine/styles.js`, `styles-more.js` | 40가지 스타일 (공용 헬퍼는 styles.js, 24가지는 styles-more.js) |
| `src/engine/effects.js` | 효과 20종 정의와 픽셀 효과 |
| `src/engine/pipeline.js`, `worker.js` | 변형→스타일→효과, 워커 캐시(스타일 결과를 캐리커처별로 보관) |
| `src/export/codecs.js` | TIFF·TGA·PNM·QOI·PSD 해독, GIF·TGA·PPM·QOI 인코딩, ICO·SVG 포장 |
| `src/export/image-encode.js`, `files.js` | BMP·TIFF 인코딩, ZIP, PDF |
| `src/domain/` | 프로젝트 파일(.mypcut), Undo 기록, 설정, 최근 파일, 예제 사진 |
| `src/ui/` | 패널 HTML, 오버레이, 사진 입출력, 얼굴 찾기, 워커 풀, 시작 화면, 움직이는 배경 |
| `src/i18n/` | ko/en 사전 (scripts/make-i18n.mjs 생성: 셸 공용 문구 + scripts/i18n-photo.mjs) |
| `public/mediapipe/` | 얼굴 모델과 WASM (npm install 시 준비, git 제외) |
| `public/samples/` | 예제 사진 10장 (퍼블릭 도메인) |

## 4. 설계 원칙

- **엔진은 순수 JS**: DOM 없음. 워커와 Node 테스트가 같은 코드를 씁니다. 결과는 시드로 결정됩니다(같은 시드 = 같은 그림).
- **좌표**: 특징점은 원본 사진 픽셀 좌표로 저장. 작업 그림/저장 그림에서는 자르기 영역만큼 옮기고 배율을 곱해 씁니다(`regionFeatures`).
- **과장 변형**: 각 영역은 가운데(고원)가 균일하게 확대되고 가장자리로 갈수록 원래대로. 출력 픽셀마다 역변환(마지막 연산부터)해 구멍이 없고, 축소는 접힘이 생기지 않게 제한.
- **크기 단위 u**: 600px 기준 1. 필터 반경·선 굵기·효과 크기가 u에 비례해 화면용과 저장용 그림이 같아 보입니다.
- **Undo**: 특징점·캐리커처 목록·선택·자르기의 스냅숏. 같은 컨트롤의 연속 변경(스테퍼 누르고 있기)은 한 단계로 합칩니다.
- **워커**: 캐리커처 id로 같은 워커에 보내 스타일 결과를 재사용 → 효과만 바꾸면 빠르게 다시 그림. 최신 요청만 반영.

## 5. 프로젝트 파일 (.mypcut)

```json
{ "format": "myphotocut", "version": 1, "name": "...", "photo": { "name", "type", "width", "height", "data": "data:image/jpeg;base64,..." },
  "features": { "face": {...}, "eyes": [...], "nose": {...}, "mouth": {...}, "chin": {...}, "forehead": {...}, "method": "landmarks" },
  "items": [{ "id", "name", "styleId", "seed", "warp": {...}, "options": {...}, "effects": [...] }],
  "selected": "...", "autoCrop": true, "crop": { "x", "y", "w", "h" } }
```

## 6. 테스트

- `test/unit/*.test.js` (node:test): 래스터·얼굴·변형·40개 스타일 렌더(값 범위·결정성·대비)·효과·코덱 왕복·프로젝트·Undo·설정·번역 키·아이콘.
- `scripts/smoke-web.mjs`: Vite + 헤드리스 Edge(CDP)로 웹 앱을 조작하고 화면을 찍음. `test/e2e/gui.steps.json`이 `npm test`의 GUI 단계.
- `scripts/smoke-desktop.mjs`: 원격 디버깅 포트로 띄운 데스크톱 앱을 같은 방식으로 조작.
