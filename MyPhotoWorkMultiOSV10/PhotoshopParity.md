# Photoshop 기능 대비 검증 보고서

- 대상: My Photo Work V1.0 (commit 8b8086ec), 2026-09-19 기준
- 기준: Adobe Photoshop (2024/2025) 의 툴바 도구 전체 + File/Edit/Image/Layer/Type/Select/Filter/3D/View/Window 메뉴 명령
- 방법: (1) `npm test`, `npm run verify:images` 실행 (2) `src/commands.ts`, `src/catalog.ts`, `src/App.tsx`, `src/lib/*.ts` 를 읽어 각 항목의 실제 동작을 판정

## 판정 기호

| 기호 | 뜻 |
|---|---|
| ✅ | Photoshop 과 같은 목적으로 동작하는 구현이 있음 (품질 차이는 있을 수 있음) |
| 🟡 | 있지만 크게 단순화됨 — 핵심 옵션이 빠졌거나 알고리즘이 대체됨 |
| 🔴 | **스텁** — 메뉴/도구는 있지만 실제로는 다른 기능이 실행되거나 이름만 있음 |
| ⬜ | 없음 |

## 1. 요약

| 영역 | 항목 수 (PS 기준) | ✅ | 🟡 | 🔴 | ⬜ |
|---|---|---|---|---|---|
| 툴바 도구 | 71 | 40 | 13 | 9 | 9 |
| File 메뉴 | 42 | 8 | 3 | 0 | 31 |
| Edit 메뉴 | 45 | 17 | 6 | 0 | 22 |
| Image 메뉴 | 48 | 22 | 7 | 0 | 19 |
| Layer 메뉴 | 58 | 21 | 4 | 0 | 33 |
| Type 메뉴 | 14 | 3 | 1 | 0 | 10 |
| Select 메뉴 | 22 | 15 | 2 | 0 | 5 |
| Filter 메뉴 | 92 | 28 | 4 | 2 | 58 |
| 3D 메뉴 | 30+ | 1 | 1 | 1 | 27+ |
| View 메뉴 | 30 | 8 | 0 | 0 | 22 |
| Window (패널) | 36 | 6 | 4 | 0 | 26 |

**결론: "Photoshop 의 모든 기능을 제대로 제공한다"는 상태는 아닙니다.** 명령 수 기준으로 약 35% 가 존재하고, 그 중 다시 일부는 이름만 같은 스텁입니다. 다만 README 가 열거한 기능은 대부분 실제 코드가 있고 자동 테스트도 통과합니다. 갭은 크게 세 종류입니다.

1. **스텁 (사용자가 속게 되는 항목, 가장 먼저 고칠 것)** — 9개 도구 + 3개 메뉴가 이름과 다른 일을 합니다. §3 참고.
2. **Photoshop 편집 흐름의 기반 기능 부재** — 선택 영역 합치기/빼기(Shift/Alt), 마스크 위에 칠하기, 히스토리 상태 목록, 가이드, 레이어 썸네일/드래그, 대화상자 실시간 미리보기, PSD 입출력, 스마트 오브젝트 원본 편집.
3. **단순 미구현** — Blur Gallery, Vanishing Point, Lens Correction, Select and Mask, Layer Style 대화상자(9종 중 3종만), Character/Paragraph 패널, Swatches, Navigator, Properties 등.

## 2. 자동 검증 실행 결과

| 명령 | 결과 |
|---|---|
| `npm install` | 성공 (node_modules 가 없어서 최초 `npm test` 는 `@resvg/resvg-js` 를 못 찾아 실패했음) |
| `npm test` | **608 중 607 통과, 1 실패** — `test/windows.test.mjs:324` "popup windows draw a single hairline frame": 팝업 창 CSS 테두리 검사. 편집 기능과 무관 |
| `npm run verify:images` | **전부 통과**, `out/` 에 75개 파일 생성 (열기 → 합성 → 내보내기 → 인쇄, HEIC/DICOM/16-bit TIFF/GIF/3D/warp/carve 포함) |

테스트가 검증하는 것은 "구현된 기능이 깨지지 않았는가" 이지 "Photoshop 과 같은가" 가 아닙니다. 아래 갭은 테스트가 잡지 못합니다.

## 3. 스텁 — 이름과 다르게 동작하는 항목

| 항목 | 실제 동작 | 근거 |
|---|---|---|
| Filter › Neural Filters | **Oil Paint 필터를 적용** | `src/App.tsx:3423` `applyNamedFilter('oil')` |
| Filter › Liquify | 대화상자 없이 **Smudge 도구로 전환** | `src/App.tsx:2972-2975` |
| 3D › Effects | bevel + dropShadow 플래그만 켬 | `src/App.tsx:3435-3443` |
| Artboard 도구 | Move 도구와 동일 | `src/App.tsx:1867` |
| Mixer Brush | 일반 브러시를 불투명도 60% 로 칠함 (혼색 없음) | `src/App.tsx:1636` |
| History Brush / Art History Brush | 일반 브러시 (히스토리 소스 없음) | `src/App.tsx:1883` → `paintDab` default 분기 |
| Pattern Stamp | Clone Stamp 와 동일 (패턴을 쓰지 않음) | `src/App.tsx:1615-1623` `cloneStamp` |
| Healing Brush | Alt-클릭으로 소스를 잡지만 칠할 때는 소스 무시, Spot Heal 과 동일 | `src/App.tsx:1611-1613` |
| Type Mask (textMask) | 선택 영역이 아니라 **일반 텍스트 레이어**를 만듦 | `src/App.tsx:3668-3710` 에 textMask 분기 없음 |
| Quick Selection | 드래그 브러시가 아니라 Magic Wand 한 번 클릭 | `src/App.tsx:1825` |
| Object Selection | 영역 드래그 없이 전체 이미지 휴리스틱 | `src/App.tsx:1825`, `src/lib/ai.ts:117` |
| Note 도구 | "Note" 라는 고정 문자열만 찍고 편집 불가 | `src/App.tsx:1710` |
| Frame 도구 | 사각형 오버레이만 기록, 레이어를 클리핑하지 않음 | `src/App.tsx:2087`, 합성 코드에 frames 미참조 |

### "AI/생성형" 이라 이름 붙은 기능의 실체 (`src/lib/ai.ts`)

| 명령 | 실제 알고리즘 |
|---|---|
| Content-Aware Fill / Generative Fill | 선택 영역을 주변 평균색으로 채움 (`ai.ts:11`) — 패치 합성 아님 |
| Generative Upscale | 캔버스 리사이즈 + sharpen (`ai.ts:79`) |
| Select Subject | 밝기 128 에서 18 이상 벗어나거나 중앙 타원 안쪽 픽셀 (`ai.ts:117`) |
| Find Distractions | 5×5 평균과 140 이상 차이나는 픽셀 |
| Remove Background | 위 Select Subject 의 반전을 지움 |
| Harmonize | 선택 영역 평균색을 바깥 평균색에 맞춤 |
| Neural skin smooth | 일반 스무딩 필터 |

README 는 "on-device 생성 작업" 이라 표현하지만 모델은 없습니다. 이름을 바꾸거나(예: "Average Fill") 알고리즘을 교체해야 합니다.

## 4. 툴바 도구 (71개)

| PS 도구 | 상태 | 비고 |
|---|---|---|
| Move | ✅ | 자동 선택/정렬 옵션 없음 |
| Artboard | 🔴 | = Move |
| Rectangular / Elliptical Marquee | 🟡 | Shift 정사각/정원 제약, 중심에서 그리기, Feather 옵션 없음. **Shift/Alt 로 합치기·빼기·교차 없음** (`App.tsx:2038`) |
| Single Row / Column Marquee | ✅ | |
| Lasso / Polygonal / Magnetic Lasso | ✅ | 합치기·빼기 없음 |
| Object Selection | 🔴 | 위 참조 |
| Quick Selection | 🔴 | = Wand |
| Magic Wand | 🟡 | Tolerance 만. Contiguous / Sample All Layers 옵션 없음 |
| Crop | 🟡 | 비율 프리셋, Straighten, Content-Aware, 오버레이 없음 |
| Perspective Crop | ✅ | |
| Slice / Slice Select | ✅ | 슬라이스별 내보내기 있음 |
| Frame | 🔴 | 클리핑 안 함 |
| Eyedropper | ✅ | Sample Size 옵션 없음 |
| 3D Material Eyedropper | ⬜ | |
| Color Sampler | 🟡 | 좌표만 표시, 색 값 읽기 없음 (`App.tsx:4392`) |
| Ruler | ✅ | |
| Note | 🔴 | |
| Count | ✅ | |
| Spot Healing Brush | 🟡 | `healStamp` 주변 블렌딩 |
| Remove Tool | 🟡 | = Content-Aware(평균) Fill |
| Healing Brush | 🔴 | 소스 무시 |
| Patch | ✅ | |
| Content-Aware Move | ✅ | |
| Red Eye | ✅ | |
| Brush | ✅ | 크기/경도/불투명도/간격/각도/원형도/산포 |
| Pencil | ✅ | |
| Color Replacement | ✅ | |
| Mixer Brush | 🔴 | |
| Clone Stamp | ✅ | Aligned 옵션 없음 |
| Pattern Stamp | 🔴 | |
| History Brush / Art History | 🔴 | |
| Eraser / Background Eraser / Magic Eraser | ✅ | |
| Gradient | 🟡 | 5종(선형/방사/각도/반사/다이아) 있으나 **그라디언트 편집기 없음** — 전경→배경 2색만 |
| Paint Bucket | ✅ | |
| 3D Material Drop | ⬜ | |
| Blur / Sharpen / Smudge | ✅ | |
| Dodge / Burn / Sponge | ✅ | Range(Shadows/Midtones/Highlights) 없음 |
| Pen / Freeform Pen / Curvature Pen | ✅ | |
| Add / Delete Anchor Point, Convert Point | ⬜ | Direct Select 로 핸들은 옮길 수 있음 |
| Horizontal / Vertical Type | 🟡 | 캔버스 위 직접 입력이 아니라 **대화상자 입력**. 편집 가능(live), 경로 따라 배치·워프 지원 |
| Horizontal / Vertical Type Mask | 🔴 | |
| Path Selection / Direct Selection | ✅ | |
| Rectangle / Rounded Rect / Ellipse / Polygon / Line | ✅ | 셰이프 레이어 생성, 채움·선·모서리·변 수 옵션 |
| Triangle | ⬜ | |
| Custom Shape | 🟡 | 별 하나만 (`types.ts:624`), heart/arrow 는 타입만 있고 도구 없음 |
| Hand / Rotate View / Zoom | ✅ | |
| Quick Mask 모드 | ✅ | |
| Screen Mode | ⬜ | |

## 5. 메뉴별

### File

| 있음 ✅/🟡 | 없음 ⬜ |
|---|---|
| New, Open, Place (Embedded 에 해당), Save, Save As, Export (PNG/JPG/WebP/AVIF/GIF/TIFF), Import Video Frames, Export GIF/Video, Print, Close | Open As, Open as Smart Object, **Open Recent**, Close All, **Revert**, Save a Copy, Place Linked, Export As / Quick Export / Save for Web, Layers to Files, Artboards to Files, Package, Automate (Batch 는 Actions 패널에 있음, Contact Sheet, Crop and Straighten, Fit Image, Merge to HDR, **Photomerge**), Scripts (Image Processor, Load Files into Stack, Statistics), File Info(읽기만 — Image Info 창), Print One Copy, Generate |
| | **PSD / PSB 열기·저장 없음** (`grep -ri psd src` = 0). Photoshop 호환의 가장 큰 구멍 |

### Edit

| 있음 | 없음 |
|---|---|
| Undo, Redo, Cut, Copy, Copy Merged, Paste, Paste Into, Clear(Delete Pixels), Fill, Stroke, Free Transform(크기·회전·미러·수치입력), Skew, Distort, Perspective, Warp(11 프리셋), Puppet Warp, Content-Aware Scale, Define Pattern, Content-Aware Fill 🟡, Generative Fill/Expand/Upscale 🟡, Harmonize 🟡 | **Step Forward/Backward** (다단계 히스토리 이동), Fade, Paste in Place / Paste Outside, Check Spelling, Find and Replace Text, Content-Aware Fill 워크스페이스, Auto-Align / Auto-Blend Layers, Sky Replacement, Perspective Warp, Define Brush Preset(브러시 팁 저장은 있음), Define Custom Shape, Purge, Presets Manager, Remote Connections, Color Settings 🟡(작업공간 4종만), Keyboard Shortcuts, Menus, Toolbar 편집, **Preferences** (설정 창은 언어/테마 수준) |
| Free Transform | 회전 스냅·미러·수치 입력 있음. **참조점 이동, Alt 대칭 스케일**은 부분 |

### Image

| 있음 | 없음 |
|---|---|
| Mode: RGB/Gray/CMYK/Lab 🟡, 8/16-bit 🟡, Color Profile(assign/convert 4종) | Mode: Bitmap, Duotone, Indexed Color, Multichannel, 32-bit, Color Table |
| Adjustments: Brightness/Contrast, Levels, Curves, Exposure, Vibrance, Hue/Sat, Color Balance, B&W, Photo Filter, Channel Mixer, Invert, Posterize, Threshold, Gradient Map, Selective Color, Shadows/Highlights, Replace Color, Equalize, Auto Levels, Auto Color, Camera Raw 🟡(brightness/contrast/saturation/curves 만) | Adjustments: **Color Lookup (LUT)**, HDR Toning, Desaturate(Grayscale 명령이 대신), **Match Color**, Auto Tone(Auto Levels 로 대체), Auto Contrast |
| Image Size, Canvas Size, Rotate 90/180, Flip H/V, Trim | Arbitrary Rotation(각도 입력), Crop(선택 영역으로), Reveal All, **Duplicate**, **Apply Image**, **Calculations**, Variables, Trap, Analysis |
| Image Info(EXIF/IHDR/DICOM 태그) | |

**컬러 모드의 실체**: `image.modeCmyk` 등은 문서에 플래그만 세우고(`App.tsx:3341-3346`) 합성 마지막 단계에서 `applyColorMode` 로 표시만 바꿉니다(`canvas.ts:324`). 레이어 픽셀은 항상 8-bit RGBA 캔버스이며, 16-bit 는 TIFF 내보내기 때만 확장됩니다(`imageIO.ts:311`). Photoshop 처럼 채널별 편집·CMYK 값 입력은 불가능합니다.

### Layer

| 있음 | 없음 |
|---|---|
| New, Duplicate, Delete, Merge Down, Merge Visible, Flatten, Group/Ungroup, Arrange 4종, Flip, Fill Layer(solid/gradient/pattern), Layer Mask(reveal all / from selection), Clipping Mask, Convert to Smart Object, Rasterize, Adjustment Layer 20종, Smart Filters(켜기/끄기/순서/파라미터), Layer Comps, opacity/fill/blend 18종/lock | New Layer via Copy/Cut, Layer Style 대화상자 — **Drop Shadow·Stroke·Color Overlay 는 체크박스만** (`App.tsx:4478-4480`), 색·거리·크기 조절 UI 없음; Inner Shadow, Satin, Gradient/Pattern Overlay 없음; Inner/Outer Glow·Bevel 은 타입에 있으나 3D Effects 로만 켜짐. Blend If / Knockout 없음 |
| | Smart Object: **Edit Contents, Replace Contents, Export Contents, Link** 없음 (원본 보존 리사이즈만) |
| | **마스크 편집**: 마스크를 만든 뒤 브러시로 칠하거나 반전·비활성·삭제·적용할 방법이 없음 (`App.tsx:2478` 이후 `:mask` 캔버스에 쓰는 코드 없음). Vector Mask 없음 |
| | Align / Distribute, Link Layers, Lock 종류(투명/픽셀/위치 구분 없음, 단일 lock), Matting, Video Layers, Layer Filtering |
| Layers 패널 | **썸네일 없음, 드래그로 순서 변경 없음, 마스크 썸네일 없음, fx 목록 없음** (`App.tsx:4437-4450`) |

### Type

| 있음 | 없음 |
|---|---|
| Horizontal/Vertical, 텍스트 입력, 폰트/크기/굵게/기울임/정렬/행간/자간/들여쓰기/단락 간격, Warp Text 11종, Type on Path | Character / Paragraph / Glyphs 패널, OpenType 기능, Anti-aliasing 모드, Convert to Shape, Create Work Path, Rasterize Type, Match Font, Font 미리보기, 캔버스 위 직접 편집(WYSIWYG) |

### Select

| 있음 | 없음 |
|---|---|
| All, Deselect, Reselect, Inverse, Grow, Similar, Expand, Contract, Border, Smooth, Feather, Color Range, Save/Load Selection(alpha channels, 4 combine mode), Select Subject 🟡, Find Distractions 🟡, Remove Background 🟡 | **Select and Mask (Refine Edge)**, Transform Selection, Focus Area, Sky, Isolate Layers, Edit in Quick Mask(토글은 View 에 있음), All Layers / Deselect Layers |
| | **도구에서 Shift/Alt/Shift+Alt 합치기·빼기·교차 없음** — Photoshop 선택 작업의 기본 흐름이 빠짐 |

### Filter

| 그룹 | 있음 | 없음 |
|---|---|---|
| 상단 | Filter Gallery 🟡(카탈로그 목록, **미리보기 없음**), Camera Raw 🟡 | Last Filter(Ctrl+Alt+F), Adaptive Wide Angle, **Lens Correction**, **Vanishing Point**, Liquify 🔴 |
| Blur | Gaussian, Motion, Box, Radial(Spin/Zoom) | Average, Blur, Blur More, Lens Blur, Shape Blur, Smart Blur, Surface Blur |
| Blur Gallery | — | Field, Iris, Tilt-Shift, Path, Spin (5종 전부 없음) |
| Distort | Pinch, Ripple, Spherize, Twirl, Wave | Displace, Polar Coordinates, Shear, ZigZag |
| Noise | Add Noise, Dust & Scratches, Median | Despeckle, Reduce Noise |
| Pixelate | Crystallize, Mosaic | Color Halftone, Facet, Fragment, Mezzotint, Pointillize |
| Render | Clouds, Lens Flare, Vignette(PS 는 Lens Correction 안에) | Difference Clouds, Fibers, Lighting Effects, Flame, Picture Frame, Tree |
| Sharpen | Sharpen, Unsharp Mask, High Pass(PS 는 Other) | Sharpen Edges, Sharpen More, **Smart Sharpen**, Shake Reduction |
| Stylize | Emboss, Find Edges, Oil Paint, Solarize | Diffuse, Extrude, Tiles, Trace Contour, Wind |
| Video | — | De-Interlace, NTSC Colors |
| Other | Offset, Minimum, Maximum, High Pass | Custom, HSB/HSA |
| Neural | skinSmooth 🟡 | Neural Filters 메뉴 자체가 🔴 (Oil Paint 실행) |
| Filter Gallery 안 (Artistic/Brush Strokes/Sketch/Texture 약 47종) | Oil Paint 1종 | 46종 |

또한 **모든 조정/필터 대화상자에 실시간 미리보기가 없습니다** (`src/dialogs.tsx` 에서 preview 는 인쇄 대화상자에만). Photoshop 에서는 모든 필터/조정이 적용 전 미리보기를 보여줍니다.

### 3D

Extrude(깊이/회전/원근/조명) 1종만 있고 3D 메뉴·패널의 나머지(메시 프리셋, 재질, 카메라, 렌더, 3D 프린트 등)는 없습니다. Photoshop 도 3D 를 폐기 중이므로 우선순위는 낮습니다.

### View

| 있음 | 없음 |
|---|---|
| Zoom In/Out/Fit/100%, Grid, Rulers, Quick Mask, Rotate View | Proof Setup / Proof Colors / Gamut Warning, Pixel Aspect Ratio, 200%/Print Size, Screen Mode, Extras 토글, Show › Guides/Smart Guides/Slices/Pixel Grid, **Snap / Snap To**, **New Guide / Lock Guides / Clear Guides** (`Guide` 타입과 저장 필드는 있지만 만드는 UI 가 없음 — `App.tsx:1128, 2729` 에서 항상 `[]`), Lock Slices, Pattern Preview |

### Window (패널)

| 있음 | 없음 |
|---|---|
| Layers, Adjustments, History 🟡, Channels, Actions, Timeline, Info 🟡 | Brush Settings(도구 옵션 바에 있음), Brushes(프리셋 저장은 있음), Character, Paragraph, Glyphs, Clone Source, **Color**(피커는 있음), **Swatches**, Gradients, Patterns 🟡, Shapes, Styles, Layer Comps 🟡(레이어 패널 안), Libraries, Measurement Log, **Navigator**, Notes, **Paths** 패널(경로 목록 없음), **Properties**, Tool Presets, Workspace 저장/전환, Arrange(다중 문서 없음 — 문서 1개만 열림) |
| History 패널 | Undo/Redo 버튼 2개뿐 (`App.tsx:4247-4253`). 상태 목록·클릭 이동·스냅샷 없음 |
| Info 패널 | 좌표만, 커서 아래 RGB/CMYK 값 없음 |

## 6. 발견된 코드 결함 (기능과 별개)

| 위치 | 내용 |
|---|---|
| `src/lib/settings.ts:47` | 저장된 `rightTab` 이 `actions`/`timeline` 이면 복원 시 `layers` 로 떨어짐 (허용 목록에서 빠짐) |
| `test/windows.test.mjs:324` | 팝업 창 테두리 검사 실패 — CSS 가 바뀐 뒤 테스트가 갱신되지 않았거나 회귀 |
| `src/App.tsx:1611-1613` | `heal` 이 `cloneSourceRef` 를 읽지 않음 (Alt-클릭 소스 설정 코드는 있음) |
| `src/App.tsx:1615-1623` | `patternStamp` 가 `patterns` 대신 clone 소스를 씀 |

## 7. 우선순위 제안

1. **스텁 제거 또는 정직한 이름으로 변경** (§3): Neural Filters→Oil Paint 매핑, Liquify→Smudge, Artboard, Mixer/History/Art History/Pattern Stamp/Healing Brush, Type Mask, Frame, Quick/Object Selection. 사용자가 Photoshop 과 같다고 믿고 쓰면 결과가 다릅니다.
2. **선택 영역 합치기/빼기/교차** (Shift/Alt/Shift+Alt) — 모든 선택 도구에 공통 적용되는 한 곳(`App.tsx:2038` 부근의 `setSelection` 경로)만 고치면 됩니다.
3. **마스크 편집** — 마스크 편집 모드(레이어 vs 마스크 타깃)와 브러시/그라디언트/채우기가 마스크 캔버스에 쓰게 하는 것. 지금은 마스크가 "만들기만 가능".
4. **대화상자 실시간 미리보기** — 조정·필터 전반의 사용성.
5. **History 패널 상태 목록**, **Layers 패널 썸네일/드래그**, **Navigator**, **Properties**.
6. **PSD 열기/저장** — 외부 호환의 핵심. 최소 flattened + layer PSD 읽기.
7. Layer Style 대화상자 전체(9종 + 파라미터), Gradient Editor(다중 stop), Guides/Snap.
8. 필터 확장: Smart Sharpen, Reduce Noise, Surface/Lens Blur, Blur Gallery, Lens Correction, Displace, Polar Coordinates.
9. 진짜 AI 가 필요한 항목(Select Subject, Generative Fill, Sky Replacement, Neural Filters)은 온디바이스 모델(ONNX Runtime Web 등)을 붙이지 않으면 Photoshop 수준이 될 수 없으므로, 그 전까지는 이름을 알고리즘에 맞게 바꾸는 것이 낫습니다.
