# Photoshop 기능 대비 상태

- 대상: My Photo Work V1.0, 2026-09-19 기준 (구현 작업 후)
- 기준: Adobe Photoshop (2024/2025) 툴바 도구 전체 + File/Edit/Image/Layer/Type/Select/Filter/3D/View/Window 메뉴 명령
- 검증: `npm test` 649개 통과, `npm run lint`·`tsc -b` 오류 없음, `npm run verify:images` 통과, Electron 앱을 CDP로 구동해 **모든 메뉴 명령(230여 개)과 36개 대화상자 응답을 실행 — 렌더러 오류·오류 창 0건**

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

OpenCV(`@techstark/opencv-js`, 13 MB)는 별도 청크로 첫 사용 시 로드되며, 로드 실패 시 이전의 통계 기반 구현으로 대체됩니다.

## 5. 남은 🟡 (근사 구현)

- **Sky / Focus Area**: 색 클러스터·라플라시안 에너지 기반.
- **Generative Expand/Upscale, Neural Filters**: 리사이즈+샤픈·통계 매칭 등 알고리즘. 창과 사용 설명서에 명시.
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
- 실제 신경망 모델 (§5).

## 7. 참고

- 새 모듈: `src/lib/brushes.ts`, `segment.ts`, `moreFilters.ts`, `adjustExtra.ts`, `gradients.ts`, `documentOps.ts`, `psd.ts`, `cv.ts`, `inpaint.ts`, `src/dialogsExtra.tsx`, `src/panels.tsx`, `src/MenuTree.tsx`, `src/usePreview.ts`, `src/adjustmentFields.ts`, `src/i18nExtra.ts`.
- 새 테스트: `test/parity.test.mjs`, `test/psd.test.mjs`, `test/documentOps.test.mjs`, `test/cv.test.mjs`.
