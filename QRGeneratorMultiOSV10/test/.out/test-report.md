# 테스트 결과

- 실행: 2026. 10. 20. PM 4:20:18 · 소요 36.3 s
- 환경: Windows_NT 10.0.26300 · Node v24.15.0 · rustc 1.97.1 (8bab26f4f 2026-07-14)
- 결과: **모두 통과** (통과 82, 실패 0, 건너뜀 0)

## 요약

| 단계 | 분류 | 결과 | 통과 | 실패 | 건너뜀 | 시간 |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| 빌드 | WebAssembly | ✅ | 2 | 0 | 0 | 421 ms |
| Rust | qrcore | ✅ | 10 | 0 | 0 | 676 ms |
| Rust | qrimage | ✅ | 7 | 0 | 0 | 877 ms |
| Rust | 데스크톱 셸 | ✅ | 7 | 0 | 0 | 2.9 s |
| JavaScript | 인코더 | ✅ | 8 | 0 | 0 | 877 ms |
| JavaScript | 내용 형식 | ✅ | 5 | 0 | 0 | 2 ms |
| JavaScript | 렌더러 | ✅ | 6 | 0 | 0 | 124 ms |
| JavaScript | 내보내기 | ✅ | 4 | 0 | 0 | 864 ms |
| JavaScript | 실행 취소 | ✅ | 3 | 0 | 0 | 1 ms |
| JavaScript | 카드 배치 | ✅ | 2 | 0 | 0 | 1 ms |
| JavaScript | 브라우저 판 | ✅ | 13 | 0 | 0 | 11.8 s |
| JavaScript | 데스크톱 앱 | ✅ | 15 | 0 | 0 | 16.9 s |
| **합계** | | ✅ | **82** | **0** | 0 | 36.3 s |

## 상세

### 빌드 · WebAssembly

- ✅ qrcore.wasm (37 KB)
- ✅ qrimage.wasm (355 KB)

### Rust · qrcore

- ✅ boosting raises the level only when it fits
- ✅ empty text still makes a symbol
- ✅ every ecc level has consistent block tables
- ✅ finder patterns sit in three corners
- ✅ format information matches the published table
- ✅ json round trips the fields
- ✅ known capacities match the standard
- ✅ modes are chosen by content
- ✅ too long reports the sizes
- ✅ version and mask can be forced

### Rust · qrimage

- ✅ alpha survives where the format has it
- ✅ gif keeps the two colours
- ✅ ico holds every size up to 256
- ✅ jpeg fills transparency with the background and stays close
- ✅ lossless formats round trip exactly
- ✅ names and ids map to formats
- ✅ wrong buffer sizes are rejected

### Rust · 데스크톱 셸

- ✅ a placement on a monitor that is gone is dropped
- ✅ a placement on screen comes back unchanged
- ✅ file names stay in the chosen folder
- ✅ files round trip
- ✅ sizes stay between the minimum and the monitor
- ✅ the command returns the encoder json
- ✅ the default is centred and fits small screens

### JavaScript · 인코더

Rust qrcore(WebAssembly) 출력 → 독립 디코더 jsQR로 판독

- ✅ the WebAssembly module needs nothing from its host _(1 ms)_
- ✅ numeric, alphanumeric and byte data read back at every error correction level _(41 ms)_
- ✅ all eight masks read back _(8 ms)_
- ✅ every version 1–40 reads back _(820 ms)_
- ✅ data that does not fit reports how much was needed _(5 ms)_
- ✅ automatic boost raises error correction without growing the symbol _(0 ms)_
- ✅ UTF-8 ECI is accepted by readers _(1 ms)_
- ✅ argument mapping matches the Rust ABI _(0 ms)_

### JavaScript · 내용 형식

Wi-Fi · vCard · mailto · SMS · tel · geo 문자열과 이스케이프

- ✅ URLs get a scheme only when they have none _(1 ms)_
- ✅ Wi-Fi payload escapes its delimiters _(0 ms)_
- ✅ vCard holds only the filled fields, escaped _(0 ms)_
- ✅ email, SMS, phone and location use the common URI forms _(0 ms)_
- ✅ every content type and field has Korean and English labels _(0 ms)_

### JavaScript · 렌더러

모듈·눈 모양 경로, SVG, 로고 판독성, 스캔 경고

- ✅ paths cover every style and keep the quiet zone _(21 ms)_
- ✅ square modules merge into one run per row segment _(1 ms)_
- ✅ SVG is a self-contained document _(1 ms)_
- ✅ a 22% logo with cleared modules still scans at H and Q _(17 ms)_
- ✅ warnings catch low contrast, inverted colours, thin margins and oversized logos _(0 ms)_
- ✅ alignment centres match the patterns the Rust encoder draws _(83 ms)_

### JavaScript · 내보내기

PDF·EPS → Ghostscript 렌더링 후 판독, 래스터 형식 서명

- ✅ arcs become cubics that stay on the circle _(1 ms)_
- ✅ PDF and EPS render in Ghostscript and scan, for every style _(829 ms)_
- ✅ PDF page size follows the print size _(3 ms)_
- ✅ raster formats come out of qrimage.wasm with the right signature _(31 ms)_

### JavaScript · 실행 취소

Undo/Redo 기록과 합치기

- ✅ undo and redo walk through the recorded states _(1 ms)_
- ✅ quick changes from one source merge; other sources and pauses do not _(0 ms)_
- ✅ unchanged states are not recorded and the limit holds _(0 ms)_

### JavaScript · 카드 배치

저장된 배치 검증

- ✅ the default puts the groups on the left and the QR code on the right _(1 ms)_
- ✅ saved arrangements are kept only when every card is there exactly once _(0 ms)_

### JavaScript · 브라우저 판

헤드리스 Edge에서 실제 페이지 조작 (WebAssembly 인코더)

- **browser build (headless Edge, WebAssembly)**
  - ✅ starts with the WebAssembly encoder _(174 ms)_
  - ✅ 8 content types scan from the preview _(468 ms)_
  - ✅ 16 style combinations scan _(384 ms)_
  - ✅ gradient, eye colour and logo scan _(63 ms)_
  - ✅ too much data shows an error _(73 ms)_
  - ✅ settings kept in localStorage _(472 ms)_
  - ✅ 10 export formats (WebAssembly raster, JS vector) decode and scan _(504 ms)_
  - ✅ toolbar toggles and icon dropdowns _(72 ms)_
  - ✅ toolbar fits from 1320 px to the minimum width (ko, en) _(2.7 s)_
  - ✅ steppers, default size, undo and redo _(4.4 s)_
  - ✅ cards move by dragging; layout resets _(23 ms)_
  - ✅ English and dark theme _(86 ms)_
  - ✅ phone width: one column, no horizontal scroll _(446 ms)_

### JavaScript · 데스크톱 앱

실제 exe를 DevTools로 조작 (네이티브 Rust)

- **desktop app (real exe, native Rust)**
  - ✅ builds the latest code (cargo, debug, own target folder) _(8.4 s)_
  - ✅ starts with the native Rust encoder _(176 ms)_
  - ✅ reopens at the saved window position and size _(1 ms)_
  - ✅ frameless window: own window buttons and resize grip _(2 ms)_
  - ✅ 8 content types scan from the preview _(287 ms)_
  - ✅ 16 style combinations scan _(371 ms)_
  - ✅ gradient, eye colour and logo scan _(61 ms)_
  - ✅ too much data shows an error _(48 ms)_
  - ✅ 10 export formats saved (native Rust raster) decode and scan _(1.1 s)_
  - ✅ toolbar toggles; dropdowns open as popup windows _(849 ms)_
  - ✅ steppers, default size, undo and redo _(4.4 s)_
  - ✅ cards move by dragging; layout resets _(14 ms)_
  - ✅ settings file saved (no Wi-Fi password) _(1 ms)_
  - ✅ screenshot of the finished window _(108 ms)_
  - ✅ close button saves the window placement and exits _(164 ms)_

## 스크린샷

- [desktop.png](desktop.png)
- [web-dark-en.png](web-dark-en.png)
- [web-phone.png](web-phone.png)
