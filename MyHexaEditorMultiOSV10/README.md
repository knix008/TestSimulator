# MyHexaMaster 1.0.0

헥사 편집기 · 바이너리 분석 도구 — Windows · macOS · Linux 데스크톱 앱(Tauri 2)과 웹 앱.
화면 구성은 MyMarkdownMaster와 같고(메뉴 막대·툴바·접히는 패널·카드 보드 시작 화면·독립 창 팝업), 바이트를 다루는 모든 일은 Rust 코어가 합니다.

A hex editor and binary analysis tool for Windows, macOS, Linux (Tauri 2) and the web, in MyMarkdownMaster's window layout, with a Rust core.

UltraEdit · HxD · 010 Editor · ImHex · WinHex · Hex Fiend · Okteta · Free Hex Editor Neo · MiTeC Hexadecimal Editor · Hackman Suite의 기능을 한 프로그램에 모았습니다.

## 기능 / Features

- **어떤 크기의 파일도**: 보이는 부분만 읽는 조각 표(piece table) — 수 GB 파일도 바로 열고, 끼워 넣기·삭제·무제한 실행 취소, 위치가 그대로면 제자리 저장.
- **디스크·메모리**(데스크톱): 드라이브·볼륨·물리 디스크(읽기 전용으로 열고, 풀면 섹터 단위로 씀), 프로세스 메모리(Windows·Linux·macOS, 읽을 수 없는 곳은 `??`, 저장 시 프로세스에 씀), 이미지로 저장.
- **포렌식**: 파티션(MBR·GPT)과 FAT·exFAT·NTFS·ext2/3/4 파일·지운 파일 탐색, YARA 규칙 검사, 해시 데이터베이스(알려진·주의 파일, NSRL 목록).
- **헥사 보기**: 한 줄 바이트·묶음·16/10/8/2진수·오프셋 진법·시작 주소, 바이트 색, 바뀐 바이트 강조, 커서 줄·열 강조, 문자 집합 10가지(ASCII·Latin-1·Windows-1252·CP437·EBCDIC·UTF-8·UTF-16·EUC-KR·Shift_JIS), 텍스트 편집기(열 선택·줄 바꿈·찾기).
- **찾기·바꾸기**: 16진수 `??`·니블 와일드카드, 14가지 인코딩의 텍스트, 정규식, 정수·실수, 모두 찾기·모두 바꾸기, 여러 파일·폴더에서 찾기.
- **속성 패널**: 데이터 검사기(정수·실수·날짜·GUID·IP·색 … 값 고쳐 쓰기), 구조(템플릿), 파일 정보와 형식, 체크섬·해시 36가지, 통계·엔트로피 그래프, 책갈피.
- **템플릿**: 010 Editor / ImHex 식 언어와 내장 템플릿 18가지(PNG·BMP·GIF·JPEG·ZIP·GZIP·WAV·ELF·PE·MBR/GPT·ICO·TAR·class·SQLite·Mach-O·MP3·WASM).
- **도구(툴바)**: 이동, 문자열 추출, 디스어셈블러(x86 16/32/64 · ARM · Thumb · ARM64), 계산기·진법 변환, 파일 복구(카빙 26형식), 파일 시스템, YARA, 디스크·메모리, 비교(바이트 / 끼워 넣기 찾기), 템플릿 편집기, 데이터 처리기(노드 그래프), 편집 기록, 파일 나누기·합치기·완전 삭제.
- **데이터**: XOR·산술·시프트·회전·바이트 순서, AES·DES·3DES·Blowfish·Twofish·CAST5·Camellia·TEA·XTEA·RC4·ChaCha20·Salsa20, zlib·Deflate·gzip, Base64·16진수·URL.
- **내보내기·가져오기**: 헥스 덤프, 13가지 소스 코드 배열, Base64·Base32·Ascii85·UUencode, Intel HEX, S-record, HTML·RTF·Markdown·JSON; 인쇄(미리보기·프린터 선택).

## 구조 / Architecture

자세한 내용: [ARCHITECTURE.md](ARCHITECTURE.md) · 사용법: [doc/UsersGuide.md](doc/UsersGuide.md) ([English](doc/UsersGuide.en.md))

## 설치·개발 / Setup and development

```bash
npm run setup           # 또는 npm install — npm 패키지, Rust wasm32 대상, WebAssembly 코어, 설명서를 준비 (git 에는 들어가지 않음)
npm start               # 데스크톱 개발 실행 (Vite + tauri dev)
npm run dev             # 웹 개발 서버
npm test                # unit · i18n · rust · web · tutorial  (--desktop 으로 데스크톱 E2E 추가)
npm run build:web       # dist/ (Rust 코어를 WebAssembly로 포함)
npm run build:win       # Windows 설치 프로그램 (build:mac, build:linux, build:all)
npm run build:docs      # 사용 설명서·튜토리얼 HTML
npm run clean           # git 이 보관하지 않는 것을 모두 삭제
```

필요: Node 22+, Rust(rustup). Linux는 WebKitGTK 개발 패키지(`npm run setup`이 명령을 알려 줌). git 에는 소스만 올라가고, 설치되거나 만들어지는 것(node_modules, target, public/hexcore.wasm, public/doc, dist, 설치 파일)은 `.gitignore`에 있습니다.

© SHKWON (`knix008@naver.com`)
