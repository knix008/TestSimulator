# Photoshop 기능 대비 상태

- 대상: My Photo Work V1.0, 2026-09-21 기준 (2차 실사진 검증 후)
- 기준: Adobe Photoshop (2024/2025) 툴바 도구 전체 + File/Edit/Image/Layer/Type/Select/Filter/3D/View/Window 메뉴 명령
- 검증: `npm test` 670개 통과, `npm run lint`·`tsc -b` 오류 없음, `npm run verify:images` 통과, Electron 앱을 CDP로 구동해 **모든 메뉴 명령(230여 개)과 36개 대화상자 응답을 실행 — 렌더러 오류·오류 창 0건**
- 실사진 검증: `npm run verify:features` — `images/` 의 사진 5장(JPEG 3, HEIC, DICOM)에 **기능 항목 288개 × 5장 = 1,440회** 실행, 전부 통과. 카탈로그의 도구 66개·메뉴 명령 410개 중 **429개를 픽셀 결과로 확인**, 47개는 창/보기 전용(§8), 미확인 0. 결과 그림은 `out/features/`, 갤러리 `out/features.html`, 항목별 커버리지 표 `out/features.md`.

## 판정 기호

| 기호 | 뜻 |
|---|---|
| ✅ | Photoshop 과 같은 목적으로 동작하는 구현 |
| 🟡 | 있지만 단순화됨 (알고리즘 근사 또는 옵션 일부) |
| ⬜ | 없음 (아래 "구현하지 않은 것" 참조) |

## 1. 요약

| 영역 | 항목 수 | ✅ | 🟡 | ⬜ |
|---|---|---|---|---|
| 툴바 도구 | 71 | 62 | 6 | 3 |
| File | 42 | 36 | 2 | 4 |
| Edit | 45 | 41 | 3 | 1 |
| Image | 48 | 44 | 3 | 1 |
| Layer | 58 | 54 | 2 | 2 |
| Type | 14 | 12 | 1 | 1 |
| Select | 22 | 22 | 0 | 0 |
| Filter | 92 | 84 | 8 | 0 |
| 3D | 30+ | 3 | 1 | 26+ |
| View | 30 | 30 | 0 | 0 |
| Window (패널) | 36 | 30 | 2 | 4 |

이전 보고서의 **스텁 12건은 모두 제거**되었고(§2), 기반 기능 부재 항목(선택 합치기/빼기, 마스크 칠하기, 히스토리 목록, 가이드, 썸네일, 실시간 미리보기, PSD, 스마트 오브젝트 편집)은 모두 구현되었습니다(§3).

## 2. 이전 스텁의 현재 상태

| 항목 | 이전 | 현재 |
|---|---|---|
| Filter › Neural Filters | Oil Paint 실행 | 전용 창: 피부 매끄럽게·색상화·슈퍼 줌·복원·깊이 흐림 — 창에 "이 기기의 알고리즘"이라고 명시 |
| Filter › Liquify | Smudge 전환 | 리퀴파이 브러시 도구: 앞으로 뒤틀기/소용돌이 2방향/오므리기/부풀리기/재구성/고정/해제, 원본 보존, Enter 적용·Esc 취소 |
| 3D › Effects | 플래그만 | 유지 (bevel+shadow 적용) + 3D Postcard, Render 3D Layer 추가 |
| Artboard 도구 | = Move | 드래그로 아트보드 영역 생성·이름 지정, File › Artboards to Files 로 각각 내보내기 |
| Mixer Brush | 60% 브러시 | 캔버스 색을 집어 저장조에 섞고 칠함: 젖음·혼합·플로우 옵션 |
| History / Art History Brush | 일반 브러시 | 히스토리 패널에서 고른 상태(또는 열기 상태)의 픽셀을 칠함; 아트 히스토리는 점/짧은 획/느슨한 곡선 스타일 |
| Pattern Stamp | = Clone | 정의된 패턴 타일을 칠함(인상파 옵션) |
| Healing Brush | 소스 무시 | Alt 소스의 질감 + 대상의 색/밝기 (저주파 교체) |
| Type Mask | 텍스트 레이어 생성 | 글자 모양의 선택 영역 생성 |
| Quick Selection | Wand 클릭 | 드래그 브러시: 비슷한 픽셀로 자람, Alt 빼기 |
| Object Selection | 전체 휴리스틱 | 사각형을 드래그하면 GrabCut(그래프 컷)이 안쪽 개체를 분리; OpenCV 미로드 시 k-means + 형태학으로 대체 |
| Note 도구 | 고정 문자열 | 클릭 → 입력 창, 메모 패널에서 편집/삭제, 캔버스에 표시 |
| Frame 도구 | (실제로는 클리핑이 됐음 — 이전 보고서 오류) | 유지 |

## 3. 기반 기능

| 항목 | 상태 |
|---|---|
| 선택 합치기/빼기/교차 | ✅ Shift/Alt/Shift+Alt + 옵션 바 모드, 모든 선택 도구 공통; 페더·앤티 앨리어싱 옵션 |
| 마스크 편집 | ✅ 레이어 패널의 마스크 썸네일 클릭 → 브러시/그라디언트/채우기가 마스크에 씀; 사용/해제·반전·적용·삭제; 선택에서 만들기(나타내기/숨기기)·투명도에서·벡터 마스크(패스) |
| History 패널 | ✅ 상태 목록(명령/도구 이름), 클릭 이동, 이름 있는 스냅숏, 히스토리 브러시 소스, 상태 수 환경 설정 |
| 실시간 미리보기 | ✅ 조정·필터·레이어 스타일·Select and Mask 등 30개 창 |
| Layers 패널 | ✅ 썸네일, 마스크 썸네일, 드래그 순서 변경, fx 배지, 그룹 들여쓰기, 연결 표시, 채우기 불투명도, 투명/위치 잠금 |
| 가이드/스냅 | ✅ 자에서 드래그 생성/이동/제거, 새 안내선, 안내선 레이아웃, 잠금, 지우기, 안내선·격자 스냅, 픽셀 격자, Extras 토글 |
| PSD | ✅ 읽기(8/16-bit RGB·Gray·CMYK·Indexed·Lab, 레이어·그룹·마스크·블렌드·불투명도·숨김·RLE), 쓰기(8-bit RGB 레이어·그룹·마스크·합성본) |
| 다중 문서 | ✅ 탭, Ctrl+Tab, 모두 닫기, 이미지 복제, 스마트 오브젝트 내용 편집(별도 탭 → 저장 시 반영) |
| 컬러 모드 | 🟡 CMYK/Lab 은 표시 시뮬레이션 유지; Proof Colors·Gamut Warning 은 인쇄 가능 영역 근사(채도·색상 기준) |

## 4. 고전 컴퓨터 비전으로 실제 구현된 것 (OpenCV WASM + 순수 TypeScript)

| 기능 | 방법 | 모듈 |
|---|---|---|
| Photomerge / Auto-Align Layers | ORB 특징점 + BFMatcher + RANSAC 호모그래피 → 회전·원근 포함 warpPerspective | `lib/cv.ts` |
| Auto-Blend Layers | 거리 변환 기반 가중 혼합(각 레이어가 자기 가장자리에서 사라짐) | `lib/cv.ts` |
| Merge to HDR | Mertens 노출 융합(라플라시안 피라미드) | `lib/cv.ts` |
| Content-Aware Fill / Generative Fill / Remove 도구 | Telea 인페인팅으로 초기화한 PatchMatch 텍스처 합성(coarse-to-fine) | `lib/inpaint.ts` |
| Harmonize | Poisson 심리스 클로닝(멀티그리드 워밍 Gauss-Seidel) | `lib/inpaint.ts` |
| Object Selection / Select Subject / Remove Background / Select and Mask 초기값 | GrabCut | `lib/cv.ts` |
| Crop & Straighten Photos | 스캐너 바탕색 추정 → 윤곽 → minAreaRect → 회전 잘라내기, 사진마다 새 문서 | `lib/cv.ts` |
| Vanishing Point | 평면 호모그래피를 따르는 복제 도장(원근 복제) + 클립보드 평면 붙여넣기 | `lib/brushes.ts` |

OpenCV(`@techstark/opencv-js`, 13 MB)는 별도 청크로 첫 사용 시 로드되며, 로드 실패 시 이전의 통계 기반 구현으로 대체됩니다. 어떤 명령이 어떤 대체 구현으로 내려가는지는 `test/robustness.test.mjs` 가 검사합니다 — Auto-Align·Auto-Blend 는 2026-09-21 까지 대체 없이 오류 창만 띄웠습니다(§7a).

### 4a. 로컬 신경망 (ONNX Runtime, `lib/neural.ts` · `lib/models.ts` · `lib/ort.ts`)

편집 ▸ 뉴럴 모델… 창에서 내려받으면 해당 명령이 모델을 쓰고, 없으면 위 고전 구현으로 대체됩니다. 가중치는 공개 저장소에서 한 번 받아 이 컴퓨터에 저장되며 실행도 이 컴퓨터에서(CPU 전 코어, WebGPU는 선택) 이루어집니다.

| 명령 | 모델 | 크기 | 라이선스 |
|---|---|---|---|
| Select Subject / Remove Background / Object Selection / Select and Mask 초기값 | U²-Net small · Silueta · ISNet (rembg 배포) | 5 / 44 / 179 MB | Apache-2.0 |
| Select Sky / Sky Replacement | SegFormer-B0 ADE20K (양자화) | 4 MB | NVIDIA (비상업) |
| Depth Blur | Depth Anything V2 small (양자화 27 MB · 전정밀도 99 MB, WebGPU용) | 27 / 99 MB | Apache-2.0 |
| Generative Fill / Remove 도구 | LaMa | 208 MB | Apache-2.0 |
| Super Zoom / Generative Upscale | Swin2SR ×2 (8비트 21 MB · 전정밀도 54 MB, WebGPU용) | 21 / 54 MB | Apache-2.0 — 트랜스포머라 느림(1 MP당 CPU 수 분, WebGPU 약 4분) |

## 5. 남은 🟡 (근사 구현)

- **Focus Area**: 라플라시안 에너지 기반.
- **Generative Expand, Neural Filters의 피부·색상화·복원**: 리사이즈+샤픈·통계 매칭 등 알고리즘. 창과 사용 설명서에 명시.
- **Shake Reduction / Adaptive Wide Angle / Lens Blur**: 방향성 언샤프·렌즈 왜곡 보정+스큐·디스크 블러 근사.
- **Filter Gallery 46종**: 각각 Photoshop 알고리즘의 근사(중앙값·포스터화·에지·노이즈 조합).
- **Match Font**: 글꼴 인식 엔진 없음 → 문자 패널을 열어 직접 지정.
- **Camera Raw**: 13개 슬라이더 (노출·대비·하이라이트·섀도우·화이트·블랙·색온도·색조·생동감·채도·명료도·디헤이즈·그레인).
- **16-bit**: 내부 8-bit, TIFF 내보내기와 PSD 읽기에서만 16-bit 처리.

## 6. 구현하지 않은 것 (⬜)

- 3D 엔진 대부분(메시 프리셋·재질·카메라·3D 인쇄) — Photoshop 자체도 폐기 중.
- Libraries, Adobe Stock, Bridge, Share, Generate(이미지 에셋), Zoomify, Adobe Fonts — 클라우드/서비스 연동.
- Video: 비디오 레이어 타임라인(프레임 애니메이션·프레임 가져오기/내보내기는 있음).
- 3D Material Eyedropper / Material Drop 도구, Triangle 도구(사용자 정의 모양의 삼각형으로 대체).
- 텍스트 프롬프트로 새 내용을 만드는 생성형 모델(Stable Diffusion 급) — Generative Fill/Expand는 인페인팅(LaMa)까지.

## 7. 실사진 검증에서 찾아 고친 결함 (2026-09-20)

단위 테스트는 합성 캔버스로 통과했지만, 실제 사진에 돌려 결과를 보니 드러난 것들입니다.

| 기능 | 증상 | 원인 → 수정 |
|---|---|---|
| Clone Stamp | Alt 로 찍은 지점이 아니라 **거울상 지점**(2×클릭점 − 원본점)에서 복제, 첫 dab 는 화면 밖을 가리켜 아무것도 안 그려짐; 드래그 중 원본 오프셋이 이동량만큼 한 번 더 밀림 | `cloneStamp` 가 원본 오프셋을 반대 부호로, 여기에 획 이동량까지 더해 그림 → 오프셋 부호를 바로잡고 이동량 항 제거. 두 이벤트 사이 구간을 둥근 끝 선으로 덮어 빠른 드래그에도 점선이 아닌 선이 남음 |
| Healing Brush | 같은 거울상 지점에서 질감을 가져옴 (색·밝기는 대상에서 가져오므로 겉보기엔 "뭔가 되는" 것처럼 보였음) | `healingBrushDab` 의 같은 부호 오류 수정 |
| Filter › Other › High Pass | 선택 영역이 있으면 **바깥 전체가 회색(128)** 으로 바뀜 | 흐림은 선택 안에서만 했지만 뺄셈은 전체에 수행 → 선택 마스크 안에서만 씀 |
| Neural Filters › 피부 매끄럽게 | 선택 영역 무시 | `skinSmooth` 에 선택 인자 추가, 갤러리·뉴럴 창 모두 전달 |
| 조정 레이어 마스크 | 부드러운(페더·브러시) 마스크가 **딱딱하게** 적용됨 | 마스크는 흰색+알파로 저장되는데 합성기가 R 채널을 읽음 → 알파×밝기로 읽어 편집기 마스크와 파일에서 온 회색 마스크 모두 처리 |
| Select › Modify › Feather | 가장자리가 부드러워지지 않고 **바깥으로 넓어지기만** 함 (하늘 대체의 "페이드", 페더 후 붙여넣기·채우기·마스크가 전부 딱딱했음) | 흐린 마스크를 원본 위에 덧그려 안쪽이 항상 255 였고, 결과를 다시 0/255 로 이진화 → 새 캔버스에 흐리고 값을 유지; `clipCanvasToSelection` 이 부분 선택 픽셀의 알파를 비례해 줄임 |

이 밖에 실사진에서 확인된 한계(결함 아님): Grow 는 이웃 픽셀끼리 비교하며 번져 그라디언트를 타고 멀리 가고, Similar 는 32³ 색 버킷이라 두 결과가 서로를 포함하지 않음; 철자 검사는 반복 글자·모음 없음·과도한 길이만 잡는 휴리스틱; Object Selection 의 OpenCV 없는 대체(k-means)는 상자 테두리와 안쪽이 비슷하면(CT 슬라이스) 아무것도 고르지 못함.

## 7a. 두 번째 실사진 검증에서 고친 것 (2026-09-21)

단위 테스트가 합성 도형만 보느라 놓친 것들입니다. 회귀 시험은 `test/robustness.test.mjs`.

| 항목 | 증상 | 원인 → 수정 |
|---|---|---|
| 의존성 누락 | `@techstark/opencv-js`·`onnxruntime-web` 이 `package.json` 에 선언돼 있는데 `node_modules` 에 없어, OpenCV 기반 11개 기능이 사진 5장 전부에서 실패(55회). 단위 테스트는 이 패키지들을 부르지 않아 657개 전부 통과 | `npm install` 로 복구. 선언된 런타임 의존성이 실제로 resolve 되는지, OpenCV 빌드에 `cv.ts` 가 쓰는 22개 심볼이 다 있는지 검사하는 시험 추가 |
| Auto-Align / Auto-Blend Layers | OpenCV 가 없으면 대체 구현으로 내려가지 않고 **오류 창**만 띄움 (§4 의 설명과 어긋남) | `documentOps.ts` 의 `autoAlignLayers`·`autoBlendLayers` 를 `.catch()` 로 연결. OpenCV 기반 7개 명령이 모두 대체 경로를 갖는지 시험이 확인 |
| Content-Aware Fill / Remove 도구 | 채운 자리가 **뿌연 얼룩**으로 남음 | PatchMatch 의 투표 단계가 겹치는 패치를 전부 평균 내어 가장 고운 층에서 흐림으로 작동 → 가장 고운 층에서는 평균의 저주파에 **가장 잘 맞은 패치의 고주파**를 얹음(`crisp`). 패치를 통째로 쓰면 이음매가 보이고, 평균만 쓰면 흐려지므로 둘을 나눠 씀. 라운드마다 결과가 선명해져 다음 검색이 실제 질감을 찾게 되므로 가장 고운 층만 4라운드(5 이상은 띠가 생김). 주변 대비 디테일 보존율 test01 0.14→**0.30**, test02 →**0.66**, test03 0.18→**0.45** |
| Select Sky | 수평선을 넘어 **바다·수영장·흰 벽까지** 선택 (test01 에서 화면의 65.6%, 아래 1/4 의 34.2%) | `looksLikeSky` 의 "푸르스름함"이 시안색 수영장까지 통과시켜 컬럼 전체가 후보가 됨 → 파랑이 초록보다 확실히 강할 때만 통과, 옅은 색 채도 기준도 40→24. 여기에 컬럼별 하늘 길이의 75 백분위수로 수평선 상한을 두고, 이웃 간 색 단차·상단 색에서의 이탈을 함께 차단. test01 65.6%→44.1%, 아래 1/4 34.2%→**0%** |
| Select Subject / Object Selection | GrabCut 이 배경 부스러기를 화면 곳곳에 흩뿌림 | 결과를 `tidySubjectMask` 로 정리(열림 → 구멍 메움 → 가장 큰 덩어리와 그에 준하는 것만 유지). GrabCut 에 대략 추정치를 씨앗으로 주는 방법도 시도했으나 test02 에서 오히려 배경을 더 먹어 **채택하지 않음** |

### 도구 쪽에서 찾아 고친 것

| 항목 | 증상 | 원인 → 수정 |
|---|---|---|
| ESLint 범위 | `.mjs` 파일(검증 스크립트 2개 + 테스트 40개)이 **린트 밖**에 있었음 | `**/*.mjs` 블록 추가, `no-shadow`·`no-unused-vars` 켬 → 실제 문제 26건(섀도잉 5, 미사용 import 7, 불필요한 이스케이프 1 등)을 찾아 전부 수정. 그중 하나는 색 출력 도우미 `grey` 가 300줄 아래 흑백 캔버스 변수에 가려져 `grey is not a function` 으로 검증 실행 전체를 죽이던 것이었습니다 |
| OpenCV 빌드 경고 | Emscripten 글루가 Node 분기에서 부르는 `fs`·`crypto` 가 브라우저 빌드에서 외부화되며 경고, 그 경로에 닿으면 예외 | `vite.config.ts` 에 `opencvNodeBuiltins` 플러그인 — opencv-js 에서 들어오는 import 에 한해 빈 모듈로 해석. 경고 사라짐. 빌드 산출물 비교: 플러그인 유무로 청크 크기 15,563,475 ↔ 15,563,506 바이트, `grabCut`·`MergeMertens` 그대로. 플러그인이 다른 패키지·다른 모듈을 건드리지 않는지 시험이 확인 |

### 필터 갤러리 (2026-09-21)

| 증상 | 수정 |
|---|---|
| 필터 117개가 **이름만 적힌 버튼**이라 무엇을 하는 건지 알 수 없음 | `src/filterInfo.ts` 에 필터마다 아이콘과 **한 문장 설명(한/영)** 을 붙임. 그룹 탭에도 아이콘 |
| 필터를 고르면 오른쪽 패널의 설명 자리가 **빈 채로 남음** | 고른 필터의 설명이 그 자리에 들어가고, 고르기 전에는 안내가 자리를 지킴. 버튼에 마우스를 올려도 같은 설명이 뜸. 제목에 아이콘을 함께 보여 그리드에서 고른 것과 패널이 같은 것을 가리키는지 확인 가능 |
| 아이콘을 넣자 `Underpainting` 같은 긴 이름이 잘림 | 이름을 두 줄로 흘리고 버튼 높이를 맞춤 |
| 고른 것이 없어도 **적용 버튼이 눌리는 것처럼 보임** | 선택 전에는 비활성 |
| `dialogs.tsx` 에 **도달할 수 없는 두 번째 갤러리**가 남아 있었음 (117개를 "그룹 · 이름" 한 줄 목록으로) | `ExtraDialogBody` 가 먼저 처리하므로 실행되지 않는 죽은 코드 — 제거 |

회귀 시험은 `test/filterInfo.test.mjs`: 카탈로그의 모든 필터에 아이콘과 두 언어 설명이 있는지, 카탈로그에 없는 것을 설명하고 있지는 않은지, 설명이 서로 겹치지 않고 패널에 맞는 길이인지, 창이 실제로 그것들을 그리는지. 결과는 Electron 을 CDP 로 띄워 눈으로 확인했습니다.

### 파일 열기와 최근 파일 (2026-09-21)

| 항목 | 이전 | 현재 |
|---|---|---|
| 열기 시작 폴더 | 매번 OS 기본 위치 | 마지막으로 연 파일의 폴더를 `settings.lastDirectory` 에 기억해 다시 실행해도 그 자리에서 시작 (저장 창도 동일) |
| 최근 파일 | 별도 창에 목록, **전체 삭제만** 가능 | 파일 메뉴 ▸ 최근 항목 하위 메뉴에 최대 20개. 각 행이 그 파일을 열고, 옆의 ✕ 가 **그 파일만** 목록에서 빼며, 맨 아래 행이 전체를 비움 |

메뉴 팝업은 별도 창이라 `MenuHost` 가 자기 행을 직접 만듭니다 — 최근 파일이 그 창까지 전달되도록 payload 에 실어 보냅니다. 회귀 시험은 `test/commands.test.mjs`.

### 아이콘 중복 제거 (2026-09-21)

같은 메뉴 안에서 두 행이 같은 아이콘을 쓰면 아이콘이 할 일을 못 합니다. 조사해 보니 **53개 아이콘이 147개 행에 겹쳐** 있었습니다(메뉴를 넘나드는 재사용은 정상 — 휴지통은 어디서나 삭제입니다).

- 명령 304개: 같은 메뉴 내 중복 **0**
- 필터 117개: 전부 고유 아이콘 (필터 메뉴는 97행이 한 목록이라 재사용이 곧 충돌)
- 조정 레이어 21개는 생성되는 행이라 모두 같은 아이콘이었음 → 종류별 아이콘 부여
- `Trash2`·`MagnetIcon` 은 lucide 의 **별칭**이라 소스상 달라 보여도 같은 컴포넌트였음 — 테스트가 잡아냄
- 자동 배정이 준 의미 없는 아이콘(Asterisk·Bean·Cherry 등) 15개는 손으로 다시 고름

회귀 시험은 `test/icons-unique.test.mjs` 와 `test/filterInfo.test.mjs`.

### 메뉴 전체에서 아이콘 유일화 (2026-09-21)

위의 "메뉴를 넘나드는 재사용은 정상" 이라는 판단이 틀렸습니다. 실제로 겹쳐 있던 것은
휴지통 같은 경우가 아니었습니다.

```
전  410개 명령, 233개 아이콘 — 88개 아이콘이 265개 명령에 겹침, 177개가 새 아이콘 필요
후  410개 명령, 410개 아이콘 — 겹침 0
```

가장 심한 것은 `Sparkles` 하나가 **여덟 개 명령**을 대신하고 있던 것입니다 — 내용 인식
채우기, 자동 톤, 레이어 스타일, 앤티앨리어스, 유사 영역 선택, 뉴럴 필터, 3D 효과, 스타일
패널. 여덟 가지를 뜻하는 아이콘은 아무것도 뜻하지 않습니다. `Grid3x3` 도 여덟, `Layers` 와
`LayoutGrid` 와 `Spline` 이 각각 여섯이었습니다.

| 문제 | 어떻게 했는가 |
|---|---|
| 어떤 아이콘으로 바꿀지 | 명령의 **영어 레이블에서 단어를 뽑아** 아직 안 쓰는 lucide 이름 중 그 단어를 품은 것을 후보로 내고, 그중에서 골랐습니다. 기억에 의존해 고르면 의미가 어긋납니다 — `ImageUpscale`(생성형 확대), `LensConvex`(렌즈 흐림), `PocketKnife`(팔레트 나이프)는 이렇게 나왔습니다 |
| 아이콘이 세 군데에 흩어져 있음 | `commands.ts` 의 배열, 조정 **레이어** 행이 읽는 `adjustmentIcons` 맵, 그리고 필터 메뉴 97행이 읽는 `filterInfo.ts`. 조정 레이어가 이미지 메뉴와 같은 맵을 읽고 있어서 21쌍이 자동으로 겹쳤습니다 |
| lucide 별칭 | `Sliders`=`SlidersVertical`, `FlipHorizontal`=`SquareCenterlineDashedHorizontal`, `Trash`=`Trash2`, `Magnet`=`MagnetIcon`, `Wand2`=`WandSparkles`. 이름이 다르니 다른 줄 알았는데 **같은 컴포넌트**였습니다. 이름이 아니라 컴포넌트를 비교해야 잡힙니다 |
| 한 번에 안 끝남 | 새로 준 아이콘이 다른 곳과 또 겹쳐서 **일곱 번** 돌았습니다(177 → 82 → 24 → 11 → 6 → 4 → 2 → 1 → 0). 감사 스크립트가 빠르니 손으로 추적하는 대신 돌리고 고치기를 되풀이했습니다 |
| 같은 명령이 두 메뉴에 있는 경우 | Camera Raw(이미지·필터), 문자·글리프·단락 패널(문자·창), 레이어 뒤집기(이미지·레이어), 조정 21종(이미지·레이어) — 같은 일이지만 **다른 행**이므로 각각 다른 아이콘을 주되 뜻이 이어지는 것으로 골랐습니다(레벨은 슬라이더, 조정 레이어 레벨은 히스토그램 막대) |

시험도 바꿨습니다. `icons-unique.test.mjs` 는 이제 **메뉴를 넘나드는 중복까지** 실패로 봅니다
(`no two commands anywhere in the menus share an icon`), 그리고 이름이 아니라 컴포넌트를
비교하는 시험을 따로 두어 별칭이 다시 새어 들어오지 못하게 했습니다.

검증: `npm test` 730/730, 실행 중인 창에서 툴바 34개 단추가 **34가지 서로 다른 그림**,
도구 막대 21개가 21가지. `verify:images` 85개 파일, `verify:features` 1440/1440 통과.

### 슬라이더 반응성 (2026-09-21)

| 증상 | 원인 → 수정 |
|---|---|
| 슬라이더·조정 버튼의 마우스 반응이 느림 | `<input type="range">` 는 드래그 1픽셀마다 change 를 보내고, 그때마다 `useLivePreview` 가 **사진 전체를 필터로 다시 그림** → 드래그가 필터 속도로 움직이고, 그 작업은 다음 이벤트가 곧바로 버림. 값은 그대로 실시간(손잡이와 옆 숫자는 마우스를 따라감)으로 두고, **미리보기만 드래그가 끝날 때 한 번** 실행하도록 분리. `src/adjusting.ts` 가 드래그 진행 여부를 보관하고, `Slider` 가 시작·끝을 알리며, `useLivePreview` 가 끝을 기다림 |
| 숫자를 입력할 때마다 다시 그림 | "120" 을 치면 1 → 12 → 120 으로 세 번 그림 → `NumberField` 와 `NumberStepper` 는 Enter 또는 포커스를 잃을 때 확정. 증감 버튼은 한 단계씩이라 즉시 반영 |

범위 입력 70개와 숫자 입력 13개를 `src/controls.tsx` 의 `Slider`·`NumberField` 로 교체했고, 남은 원시 입력이 없는지 `test/controls.test.mjs` 가 확인합니다. 뷰포트 자체는 손대지 않았습니다 — 선택 영역의 점선 때문에 어차피 초당 12회 다시 그리고 있어, 패널 슬라이더의 추가 비용이 유휴 상태와 같은 수준입니다.

### 멈춘 것처럼 보이는 창 (2026-09-21)

"버튼을 눌렀을 때 오래 걸리면 GUI 가 멈춘 듯이 보인다"는 지적을 실제로 재어
보았습니다. 2000×1500 레이어에 **콘텐츠 인식 채우기**를 걸고, 페이지 안에서
30ms 마다 진행 창의 유무를 배열에 기록해 두었다가 끝난 뒤 읽었습니다.

```
고치기 전  31ms(창 없음) → <<29,210ms 동안 표본이 전혀 없음>> → 창 없음
고친 뒤    428ms(창 있음) → <<35,382ms 동안 표본이 전혀 없음>> → …
```

표본이 끊긴 구간이 화면이 얼어 있던 구간입니다. 29초 동안 아무것도 그려지지
않았고, **진행 창도 뜨지 않았습니다.**

| 증상 | 원인 → 수정 |
|---|---|
| 오래 걸리는 동안 진행 창이 끝내 뜨지 않음 | `BusyOverlay` 가 현재 시각을 **state 에 담아** 두고 "충분히 오래 걸렸는가"를 그 값으로 판단했는데, state 는 타이머로만 갱신되고 **작업이 스레드를 쥐면 타이머가 멈춥니다**. 그래서 지금 시작한 작업은 창이 보기엔 아직 시작도 안 한 것이 되고, 그 판단을 고쳐 줄 타이머는 영영 돌지 않습니다 — 창이 필요한 바로 그 경우에만 창이 안 뜨는 구조. 판단을 작업 쪽으로 옮겼습니다(`BusyJob.visible`): 양보하며 도는 작업은 타이머가 0.4초 뒤 켜 주고, 스레드를 쥐는 작업은 **처음부터 켠 채** `nextPaint()` 로 화면에 그려진 것을 확인하고 나서 일을 시작합니다 |
| 무거운 명령의 절반이 진행 창을 아예 거치지 않음 | `runBusy` 가 `computeOnLayer` 한 곳에만 걸려 있었음. 파노라마·HDR·자동 정렬/혼합·통계·사진 자르고 똑바르게·피사체 선택·하늘 선택·생성형 확대·일괄 처리·동영상 가져오기/내보내기 12 곳을 추가. `setStatus('working')` 이 있는 자리마다 `runBusy` 가 있는지 `test/busy.test.mjs` 가 강제 |
| 필터마다 무거움을 일일이 적어야 함 | 적지 않고 **크기로 판단**: 레이어가 200만 화소를 넘으면 픽셀 루프는 어차피 느리므로 창을 먼저 띄웁니다(`HEAVY_PIXELS`). 크기와 무관하게 느린 것(패치 탐색·푸아송·뉴럴)만 `{ heavy: true }` 로 따로 말합니다 |
| 작업 안에서 작업이 시작되면 바깥 창이 사라짐 | 배경 제거가 도중에 모델을 받으러 갈 때. `runBusy` 가 바깥 작업을 기억했다가 돌려줍니다 |
| 멈춘 시계를 경과 시간으로 보여 줌 | 스레드가 멈추면 시계도 멈추므로, 시간은 **믿을 수 있을 때만** 표시합니다 |

진행 창이 떠 있는 동안 회전 막대는 멈춰 있습니다. 작업이 스레드를 쥐고 있으니
당연한 일이고, **창이 떠 있다는 것 자체**가 목적입니다. 확인은 렌더러가 멈춘
동안 OS 화면 캡처로 했습니다 — `Page.captureScreenshot` 도 같이 멈추기 때문입니다.

### Undo/Redo 비활성화

되돌릴 것이 없으면 눌러도 아무 일이 없어 고장처럼 보였습니다. `isCommandDisabled`
가 `historyMeta` 를 보고 판단하고, 툴바·인페이지 메뉴·**메뉴 팝업 창** 세 곳 모두에
전달됩니다. 메뉴 팝업은 문서를 모르는 별도의 OS 창이라 목록을 payload 로 실어
보내야 했고(`disabled?: string[]`, 없으면 전부 활성 — 풀에 남은 옛 payload 대비),
`.menu-tree button:disabled` 가 흐리게 그립니다. 실제 창에서 확인: 시작 직후
Undo `disabled=true`·불투명도 0.45, 편집 후 활성, 되돌리면 다시 꺼지고 Redo 가 켜짐.

### 비활성화된 단추가 비활성화로 보이지 않음 (2026-09-21)

"필요한 모델 다운로드가 끝나면 **지금 내려받기**가 비활성화되어야 한다" 는 지적을 받고
보니, 그 단추는 이미 `disabled={busy || missing.length === 0}` 로 **정말 비활성화되어
있었습니다.** 눌러도 아무 일이 없었습니다. 보이는 모습만 그대로였습니다.

원인은 CSS 였습니다. 비활성화 스타일이 `.menu-bar`, `.tool-bar`, `.options-bar`, `.panel`
**네 군데를 이름으로 나열**하고 있었고, 팝업 창의 단추는 그 목록에 없었습니다. 목록은
남겨지는 법입니다 — 드롭다운도 빠져 있었고(앞 항목에서 추가), 모든 대화상자가 빠져
있었습니다. 이제 `button:disabled` 로 프로그램 전체에 겁니다. 누를 수 없는 단추가
누를 수 있어 보이기를 바라는 자리는 여기에 없으므로 이름을 댈 이유도 없습니다.

덤으로, 모델 창 두 곳이 다운로드가 끝나면 메인 프로세스에 목록을 **다시 물어보고** 있었는데
그 왕복이 끝나기 전까지는 방금 받은 모델이 아직 "없는" 것으로 남아 있었습니다. 이제 완료
신호를 받는 즉시 있는 것으로 세고, 다시 물어본 결과로 확인합니다(실패한 다운로드는 세지
않습니다). 회귀 시험은 `test/busy.test.mjs`.

### 확대·축소 버튼 순서

툴바가 `[확대] [100%] [축소]` 였습니다. 눈금이 왼쪽에서 오른쪽으로 커지도록
`[축소] [100%] [확대]` 로 바꾸고, 숫자는 축소 버튼 뒤에 붙였습니다. 같은 이유로
보기 메뉴의 순서도 함께 바뀝니다.

### 툴바에 같은 명령이 두 번

**피사체 선택**이 카탈로그의 toolbar 항목으로 한 번, 줄 끝 작업 그룹으로 한 번,
열 칸 떨어져 같은 아이콘으로 두 번 있었습니다. 작업 그룹 쪽만 남겼습니다
(`test/chrome.test.mjs` 가 재발을 막습니다).
### 알고리즘 값을 설정으로 뺀 것

아래 세 기능은 사진에 따라 알맞은 값이 달라, 코드 안 상수였던 것을 **환경 설정 ▸ 엔진** 탭으로 옮겨 사용자가 정할 수 있게 했습니다(`AppSettings`, `settings.ts` 가 범위를 강제, 회귀 시험 3건).

| 설정 | 기본값 | 범위 | 쓰는 곳 |
|---|---|---|---|
| 마무리 라운드 `fillRounds` | 4 | 1–8 | `patchFill` — 내용 인식 채우기·제거 도구 |
| 라운드당 검색 `fillIterations` | 4 | 1–10 | `patchFill` |
| GrabCut 반복 `grabCutIterations` | 5 | 1–12 | `grabCutSelection` — 피사체/개체 선택, 배경 제거 |
| 하나의 개체로 정리 `subjectTidy` | 켬 | — | `tidySubjectMask` |
| 남길 비율 `subjectKeepRatio` | 0.2 | 0.02–1 | `tidySubjectMask` |
| 색 단차 한계 `skyStep` | 26 | 4–96 | `selectSky` |
| 이탈 한계 `skyDrift` | 96 | 16–255 | `selectSky` |
| 수평선 배수 `skyHorizon` | 1.3 | 1–4 | `selectSky` |

뉴럴 모델이 받아져 있으면 해당 명령은 모델을 쓰므로 이 값들은 쓰이지 않습니다.

### 더 고치지 못한 것과 그 이유

- **Select Sky 가 흰 건축물을 잡음** (test01 의 기둥·천장): 그 픽셀들이 석양 하늘빛을 반사해 실제로 하늘과 같은 색입니다 — 기둥 (184,185,203), 하늘 (155,182,203). 색으로는 구분할 수 없어 더 조이면 진짜 하늘(test02)을 잃습니다. Select Sky 는 SegFormer 모델이 받아져 있으면 그것을 쓰고 `selectSky()` 는 폴백이므로, 이 한계는 폴백의 한계입니다.
- **Select Subject 가 test01 에서 수영장 데크까지 잡음**: 정리 후 성분을 세어 보면 **연결 성분이 1개**(69,823px)뿐입니다. 데크가 피사체와 이어져 있어 성분 필터로 분리할 수 없고, 침식 32px 까지 넓혀도 끊기지 않습니다(26.6%→24.1%, 그림상 차이 없음). GrabCut 자체의 답이 그렇다는 뜻이며, 여기도 U²-Net/ISNet 모델이 받아져 있으면 그것이 먼저 쓰입니다.

## 8. 픽셀로 판정할 수 없어 CDP 메뉴 실행으로만 확인한 명령 (47)

File › Open Recent·Close·Close All·Print·Print One·Exit, Edit › Purge·Color Settings·Keyboard Shortcuts·Neural Models·Preferences, Type › Enter·Match Font, View › 확대/축소 7종·회전·초기화·격자·눈금자·안내선·스냅 등 15종(안내선은 프로젝트 파일에 저장되는 것까지 확인), Window › Color·Swatches·Comps·Measurement Log·Notes·Guide·작업 영역 저장/초기화, 도구 › Hand·Rotate View·Zoom. 목록과 이유는 `out/features.md` §3.

## 9. 참고

- 새 모듈: `src/lib/brushes.ts`, `segment.ts`, `moreFilters.ts`, `adjustExtra.ts`, `gradients.ts`, `documentOps.ts`, `psd.ts`, `cv.ts`, `inpaint.ts`, `neural.ts`, `models.ts`, `ort.ts`, `src/dialogsExtra.tsx`, `src/panels.tsx`, `src/MenuTree.tsx`, `src/usePreview.ts`, `src/adjustmentFields.ts`, `src/i18nExtra.ts`.
- 새 테스트: `test/parity.test.mjs`, `test/psd.test.mjs`, `test/documentOps.test.mjs`, `test/cv.test.mjs`, `test/neural.test.mjs`.
- 실사진 검증: `scripts/verify-features.mjs` (`npm run verify:features`, `--full` 로 원본 크기), 파이프라인 검증 `scripts/verify-images.mjs` 와 함께 `out/` 에 결과를 남김 (git 제외).
