# 구조 (Architecture)

MyQRGenerator는 세 개의 Rust 크레이트와 번들러 없는 JavaScript 페이지로 이루어집니다.
같은 페이지(`src/`)가 데스크톱(Tauri)과 웹에서 그대로 쓰이고, 차이는 `platform.js`·`encoder.js`·`iconselect.js`의 분기뿐입니다.

```
┌──────────────────────────── src/ (페이지, 번들러 없음) ────────────────────────────┐
│ app.js ── payload.js ──▶ encoder.js ──▶ render.js ──▶ 미리보기(canvas)            │
│   │                        │              ├─▶ toSvg()                              │
│   │                        │              └─▶ vector.js (PDF · EPS)                │
│   ├─ history.js (Undo/Redo)│                                                       │
│   ├─ layout.js (카드 배치)  │        exporters.js / platform.js (래스터 저장)        │
│   └─ iconselect.js (드롭다운)                                                       │
└────────────────────────────┼──────────────────────────────┼────────────────────────┘
             데스크톱: invoke │                     웹: WebAssembly
                             ▼                              ▼
   src-tauri (Tauri 2) ── qrcore (네이티브)        qrcore.wasm / qrimage.wasm
                      └── qrimage (네이티브)
```

## Rust

### `qrcore/` — QR 인코더 (의존성 없음)

ISO/IEC 18004 Model 2를 직접 구현합니다.

- 세그먼트: 숫자(3자리→10비트), 영숫자(2자→11비트), 바이트, ECI. `Segment::auto`가 가장 짧은 모드를 고릅니다.
- 용량표: `ECC_CODEWORDS_PER_BLOCK`, `NUM_ERROR_CORRECTION_BLOCKS` (버전 1–40 × L/M/Q/H).
- Reed–Solomon(GF(2⁸), 0x11D) → 블록 분할·인터리브 → 지그재그 배치 → 마스크 8종 패널티(N1–N4) 최소값 선택.
- `encode_json()`이 페이지와의 유일한 계약입니다:
  `{"version","size","ecc","mask","mode","dataBits","capacityBits","modules":"0101…"}` 또는 `{"error":"tooLong","dataBits","maxBits"}`.
- `wasm.rs`: wasm-bindgen 없이 C ABI(`qr_alloc` / `qr_encode` / `qr_output_ptr` / `qr_free`)만 내보냅니다. 호스트 import가 0개입니다(테스트로 확인).

### `qrimage/` — 래스터 내보내기

`image` 크레이트로 RGBA 픽셀을 PNG·JPEG·WebP(무손실)·GIF·BMP·TIFF·ICO로 인코딩합니다.
불투명하면 RGB로 저장해 파일을 줄이고, JPEG는 투명 부분을 배경색으로 채우며, GIF는 반투명을 켜짐/꺼짐으로, ICO는 16–256 px 크기를 한 파일에 묶습니다.
`wasm.rs`는 `qri_*` C ABI입니다(길이가 음수면 오류 메시지).

### `src-tauri/` — 데스크톱 셸

| 파일 | 역할 |
| --- | --- |
| `lib.rs` | 창 생성(테두리 없음·그림자), 명령: `qr_encode`, `export_image`(본문 = 원시 RGBA, 헤더 = 형식·크기·품질), `save_export`(SVG/PDF/EPS), `copy_image`/`copy_text`(arboard), `load_settings`/`save_settings`, `app_ready`(첫 렌더 후 창 표시) |
| `menu.rs` | 드롭다운 목록용 팝업 창. `menu_open` → 팝업 페이지가 그리고 `menu_ready`로 크기 보고 → 버튼 아래(공간이 없으면 위)에 배치·표시 → `menu_pick`/`menu_close`/포커스 잃음 → 주 창에 `menu-picked`/`menu-closed` |
| `placement.rs` | 창 위치·크기 복원 규칙(모니터에 120 px 이상 보이고 상단이 화면 안일 때만 재사용, 최소~모니터 크기로 제한, 아니면 기본 크기를 가운데에), `window.json` 읽기/쓰기 |

창 이벤트: 이동·크기 변경 때 "보통 상태" 경계를 기억하고, 닫을 때 최대화 여부와 함께 `window.json`에 씁니다.
기본 크기 1320×800, 최소 960×640 (`placement.rs`의 `DEFAULT_SIZE` / `MIN_SIZE`; 웹 테스트가 이 값을 읽어 툴바를 검사).

리소스: WebView2 인수 `--process-per-site --renderer-process-limit=1 --disable-gpu`.

## JavaScript (`src/js/`)

| 모듈 | 역할 |
| --- | --- |
| `app.js` | 상태(`type`, `values`, `design`, `encoding`, `export`, `lang`, `theme`, `layout`), 화면 연결, 설정 저장, 테스트 훅 `window.__qrgen` |
| `payload.js` | 내용 종류별 양식 정의와 페이로드(WIFI:, vCard, mailto:, SMSTO:, tel:, geo:) — 구분 문자 이스케이프 |
| `encoder.js` | 데스크톱이면 `invoke("qr_encode")`, 아니면 `qrcore.wasm` |
| `render.js` | 모듈 → SVG 경로 문자열. 사각은 가로 연속 구간으로 병합, 둥근은 이웃이 없는 모서리만 둥글게, 점·막대에서는 정렬 패턴을 꽉 찬 사각으로 유지(판독성). 캔버스는 같은 문자열을 `Path2D`로 그림 → 미리보기·PNG·SVG가 동일. 대비·반전·여백·로고 크기 경고 |
| `vector.js` | 같은 경로를 이동/직선/3차 베지어로 변환(원호는 90° 이하 조각으로) → PDF 1.4(FlateDecode, 그라데이션 = Shading, 로고 = 이미지 + SMask) / EPS(레벨 3 shfill, 로고는 배경에 합성) |
| `exporters.js` | 형식 목록, `qrimage.wasm` 로더 |
| `platform.js` | 저장(데스크톱 = 저장 대화상자, 웹 = 다운로드), 클립보드, 설정(데스크톱 = 파일, 웹 = localStorage) |
| `history.js` | 상태 스냅숏 Undo/Redo. 같은 컨트롤에서 0.7초 안의 연속 변경은 한 단계 |
| `layout.js` | 카드 배치(열 3개 × 카드 id), 제목의 손잡이로 끌어 옮기기, 저장된 배치 검증 |
| `iconselect.js` | 아이콘 드롭다운. 데스크톱에서는 `useNativeMenus`로 목록을 팝업 창에 띄움 |
| `menu.js` | 팝업 창 페이지(`menu.html`): 받은 항목·테마 색·아이콘 스프라이트로 목록을 그림, 키보드 지원 |
| `i18n.js` | 한국어/영어 문자열 |

### 화면 배치

- 툴바 2줄: 주 툴바(창 끌기 영역 · 취소/다시 · 저장/복사 · 언어/테마 · 창 버튼), 옵션 툴바(입력 없는 켜기/끄기와 디자인 동작, 글자 너비만큼). 저장을 누르면 형식 창이 열립니다.
  폭이 모자라면 `fitToolbars()`가 레이블만 숨기고 아이콘은 남깁니다. 언어·테마·창 버튼은 줄어들지 않습니다.
- 본문은 열 3개(기본: 내용·로고·디자인 | 인코딩·내보내기 | QR 코드). 1180 px 미만이면 앞의 두 열이 쌓이고, 760 px 미만(휴대폰)은 한 열.
- 모든 행은 `라벨 열(84 px) + 컨트롤`의 같은 격자를 써서 카드 사이에서도 세로로 정렬됩니다.

## 저장되는 것

| 파일 | 위치 | 내용 |
| --- | --- | --- |
| `settings.json` | 앱 설정 폴더 (Windows: `%APPDATA%\com.shkwon.qrgenerator`) | 내용·디자인·인코딩·내보내기·언어·테마·카드 배치 (Wi-Fi 비밀번호 제외) |
| `window.json` | 같은 폴더 | 창 위치·크기·최대화 |

환경 변수(테스트용): `QRGEN_CONFIG_DIR`, `QRGEN_SAVE_DIR`(대화상자 없이 저장), `QRGEN_DEBUG_PORT`(DevTools), `QRGEN_WEBVIEW_DIR`(별도 WebView2 프로필).
