# ZipMaster Multi-OS

다양한 압축 파일을 관리하는 **크로스플랫폼 압축 관리자**입니다. `../ZipMasterWin01`(Windows 전용 WinForms ZIP 도구)의 기능을 참고하여 **Web · Windows · macOS · Linux** 4개 플랫폼에서 동작하도록 재구성했습니다.

React/TypeScript UI 한 벌을 브라우저(웹앱)와 Electron(데스크톱)이 공유합니다.

## 주요 기능

- 파일/폴더 → 아카이브 **압축**
- 용량 **분할 압축** (`archive.zip.001`, `.002` …)
- 아카이브 **해제** — 첫 조각(`.001`) 선택 시 나머지 조각 **자동 병합** 후 해제
- 아카이브 **내용 미리보기**
- 진행률(개수/바이트/불확정) 표시
- **다크 / 라이트 테마** 전환 (설정 기억)
- **한국어 / 영어** 전환 (설정 기억)
- 네이티브 메뉴 제거 + **커스텀 툴바**(툴팁 포함, 창 폭 축소 시 접힘 — 버튼이 가려지지 않음)
- **커스텀 타이틀바**: 프로그램 정보 버튼이 항상 최소화/최대화/닫기 버튼의 **좌측**에 위치
- **심각한 오류 팝업**: 상세 내용 표시 + **클립보드 복사** 지원

## 포맷 지원

| 포맷 | 데스크톱(Electron) | 웹(브라우저) |
|------|:---:|:---:|
| ZIP (분할 포함) | 생성·해제 | 생성·해제 |
| TAR | 생성·해제 | 생성·해제 |
| TAR.GZ | 생성·해제 | 생성·해제 |
| TAR.BZ2 | 생성·해제 | 해제만 |
| 7z | 생성·해제 | 해제만 |
| RAR | 해제만 | 해제만 |

- **데스크톱 엔진**: [`7zip-bin`](https://www.npmjs.com/package/7zip-bin) + [`node-7z`](https://www.npmjs.com/package/node-7z) (zip/7z/tar/gz/bz2 생성·해제, RAR 해제).
- **웹 엔진**: 해제는 [`libarchive.js`](https://github.com/nika-begiashvili/libarchivejs)(WASM, 모든 포맷 읽기), 생성은 [`fflate`](https://github.com/101arrowz/fflate) + [`tar-stream`](https://github.com/mafintosh/tar-stream).

## 빠른 시작

```bash
npm install

# 데스크톱 앱 바로 실행 (개발)
npm start

# 웹 (브라우저)
npm run dev:web          # http://localhost:5273
npm run build:web        # 정적 산출물 → dist-web/
```

## 설치 파일 빌드

```bash
npm run build:win        # Windows 설치 관리자 (NSIS .exe)
npm run build:mac        # macOS (dmg) — macOS 에서 실행
npm run build:linux      # Linux (AppImage, deb)
npm run build:desktop    # 현재 OS 패키지
```

- 산출물은 `release/` 에 생성되며, **생성된 설치 파일 하나가 프로젝트 루트로 자동 복사**됩니다([build/afterBuild.cjs](build/afterBuild.cjs)).
- Windows 설치 관리자는 설치 중 **바탕화면 / 시작 메뉴 바로 가기**를 사용자가 체크박스로 선택할 수 있습니다([build/installer.nsh](build/installer.nsh)).

## 문서

- [ARCHITECTURE.md](ARCHITECTURE.md) — 구조 · 설계 · 확장 방법
- [UsersGuide.md](UsersGuide.md) — 사용자 가이드

## 프로젝트 구조

```
src/
  core/      플랫폼 독립 타입·인터페이스·포맷 로직·i18n(ko/en)
  ui/        공용 React UI + 중앙 스토어(store.tsx)
  web/       WebArchiveService(fflate+libarchive.js) + 브라우저 진입점
  desktop/   Electron main/preload/backend(node-7z) + ElectronArchiveService
build/       아이콘, NSIS 커스텀 스크립트, afterBuild 훅
```

## 라이선스

MIT © Suho Kwon
