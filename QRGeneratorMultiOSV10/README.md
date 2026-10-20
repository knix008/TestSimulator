# QR Generator (QRGeneratorMultiOSV10)

QR 코드 생성기. QR 인코더와 이미지 인코더는 **Rust**, 화면과 디자인·벡터 출력은 **JavaScript**입니다.

- **데스크톱** (Windows · macOS · Linux): Tauri 2. Rust 코드를 네이티브로 호출합니다.
- **웹 브라우저**: 같은 Rust 크레이트를 WebAssembly로 컴파일해 사용합니다 (`qrcore.wasm` 37 KB, `qrimage.wasm` 360 KB — 내보낼 때만 로드).

사용법은 [USERSGUIDE.md](USERSGUIDE.md), 구조는 [ARCHITECTURE.md](ARCHITECTURE.md)에 있습니다.

## 기능

| 구분 | 내용 |
| --- | --- |
| 내용 | 텍스트, URL, Wi-Fi, 연락처(vCard 3.0), 이메일, SMS, 전화, 위치 |
| 인코딩 | 숫자/영숫자/바이트 모드 자동, 오류 정정 L·M·Q·H, 버전 1–40, 마스크 0–7, 오류 정정 자동 상향, UTF-8 ECI |
| 디자인 | 모듈(사각·둥근·점·막대), 눈 테두리/중심(사각·둥근·원·잎), 전경·배경·눈·끝 색상, 그라데이션, 투명 배경, 여백 |
| 로고 | 가운데 로고(선택 또는 끌어다 놓기), 크기, 로고 뒤 모듈 비우기 |
| 내보내기 | PNG · JPEG · WebP · GIF · BMP · TIFF · ICO(래스터, Rust) / SVG · PDF · EPS(벡터) |
| 화면 | 아이콘+레이블 툴바, 끌어서 옮기는 카드 배치, 실행 취소/다시 실행, 상태 표시줄, 한국어/English, 시스템·라이트·다크 |
| 데스크톱 | 테두리 없는 창(자체 최소·최대·닫기), 창 위치·크기 기억, 창 밖까지 펼쳐지는 드롭다운, 크기 조절 손잡이 |

## 실행

```bash
npm install
npm start          # 데스크톱 앱 (tauri dev — 빈 포트를 골라 최신 코드로 실행)
npm run start:web  # 브라우저 판: http://127.0.0.1:<빈 포트>/
```

필요한 도구: Node.js 18+, Rust stable, `rustup target add wasm32-unknown-unknown`.
WebAssembly 파일은 실행·빌드 때마다 `scripts/build-wasm.js`가 다시 만듭니다.

## 빌드

```bash
npm run build:win    # Windows 설치 파일(NSIS) → 루트에 QRGenerator_1.0.0_x64-setup.exe
npm run build:mac    # macOS .dmg
npm run build:linux  # .deb, .AppImage
npm run icons        # 앱 아이콘 다시 그리기 (아이콘 속 QR도 이 앱의 인코더로 생성)
npm run tutorial     # 튜토리얼 영상 → 루트에 QRGenerator-Tutorial.mp4 (ffmpeg: PATH 또는 FFMPEG=경로)
```

## 테스트

```bash
npm test
```

단계별로 진행됩니다. 각 단계는 무엇을 검사하는지와 테스트별 ✔/✘·시간을 보여 주고, 끝에 **전체 결과 표**(단계·분류별 통과/실패/건너뜀/시간)를 출력합니다.
브라우저·데스크톱 테스트는 하나의 세션을 단계(시작 → 내용 판독 → 모양 → 로고 → 내보내기 → 툴바 → 편집 → 카드 배치 → …)로 나눠 보여 줍니다.
실패가 있어도 모든 단계를 끝까지 실행하고, 실패 내용은 마지막에 모아 보여 줍니다.
같은 내용이 `test/.out/test-report.md`(환경·요약 표·상세 목록·스크린샷 링크)에 저장됩니다.

| 단계 | 내용 |
| --- | --- |
| Rust `qrcore` | 표준 용량표(v40-L 2953바이트 등), 형식 정보 BCH, 버전·마스크 고정 |
| Rust `qrimage` | PNG/WebP/BMP/TIFF 무손실 왕복, 투명도, JPEG 배경, GIF 색, ICO 크기 묶음 |
| Rust 데스크톱 | 파일 이름 정리, 창 위치 복원(모니터 밖·크기 제한·기본 위치) |
| JS 단위 | 인코더 출력을 **독립 디코더 jsQR**로 판독(버전 1–40 · 오류 정정 4단계 · 마스크 8개), 페이로드 형식, 렌더러, 로고 판독성, Undo 기록, 카드 배치 |
| 벡터 | PDF·EPS를 **Ghostscript(WASM)** 로 렌더링해 판독 |
| 브라우저 | 헤드리스 Edge/Chrome: 실제 캔버스 픽셀 판독, 모든 형식 내보내기→브라우저 디코더로 판독, 툴바 폭 검사(1320→960 px, 두 언어), 스테퍼·Undo/Redo·카드 끌기 |
| 데스크톱 | 실제 exe를 DevTools 프로토콜로 조작: 네이티브 인코더, 팝업 드롭다운, 모든 형식 저장, 설정·창 위치 저장/복원 |

데스크톱 테스트는 별도 빌드 폴더(`src-tauri/target/e2e`)·WebView2 프로필·설정 폴더를 써서, 실행 중인 앱과 사용자의 설정을 건드리지 않습니다.
스크린샷은 `test/.out/`에 남습니다.
