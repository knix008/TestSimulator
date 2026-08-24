# ZipMaster Multi-OS

다양한 압축 파일을 관리하는 **크로스플랫폼 압축 관리자**입니다. `../ZipMasterWin01`(Windows 전용 WinForms ZIP 도구)의 기능을 참고하여 **Web · Windows · macOS · Linux** 4개 플랫폼에서 동작하도록 재구성했습니다.

React/TypeScript UI 한 벌을 브라우저(웹앱)와 Electron(데스크톱)이 공유합니다.

## 주요 기능

### 압축 · 해제
- 파일/폴더 → 아카이브 **압축** (포맷·분할 옵션은 상단 옵션 바에서 지정)
- 용량 **분할 압축** (`archive.zip.001`, `.002` …)
- 아카이브 **해제** — 첫 조각(`.001`) 선택 시 나머지 조각 **자동 병합** 후 해제
- **선택 해제**: 아카이브 내용에서 **Ctrl+클릭 / Shift+클릭**으로 여러 파일을 고른 뒤 선택한 항목만 해제
- 시간이 걸리는 작업(압축·해제·아카이브 열기)은 **진행률 팝업**으로 표시

### 파일 탐색기(데스크톱)
- 상단 **경로 드롭다운**: 드라이브 루트~현재 폴더의 계보를 선택해 바로 이동
- 하단 **확장 가능한 트리**: 드라이브부터 시작해 폴더를 ▶/▼ 로 펼쳐 하위 내용까지 탐색
- 압축 파일(🗜️) 클릭 → 오른쪽 패널에 **내용 표시**, 일반 파일 클릭 → **파일 정보**(이름·종류·크기·수정한 날짜·경로) 표시
- **우클릭 컨텍스트 메뉴**: 열기 · 압축하기 · 압축 해제 · 복사 · 잘라내기 · 붙여넣기 · 삭제 · 기본 폴더로 설정 · 새로 고침
- **파일 조작**: 삭제(휴지통 이동) · 복사 · 이동. 키보드 **Ctrl+C / Ctrl+X / Ctrl+V / Delete** 지원
- **드래그 & 드롭**: 트리 항목을 폴더로 끌어 **이동**, OS에서 파일을 끌어와 **복사(추가)**, **Alt+드래그**로 항목을 OS로 **내보내기**

### 설정 · 편의
- **설정 창**(툴바 ⚙): 테마 · 언어 · **기본 폴더** 지정 · **마지막 폴더 기억** 토글
- 마지막으로 열었던 폴더(또는 기본 폴더)를 다음 실행 시 자동으로 열어 표시
- **다크 / 라이트 테마** · **한국어 / 영어** 전환 (설정 기억)
- 항상 표시되는 **상태바**: 현재 경로·항목 수·선택한 아카이브·진행 상태
- 네이티브 메뉴 제거 + **커스텀 툴바/타이틀바**
- **심각한 오류 팝업**: 상세 내용 표시 + **클립보드 복사** 지원
- 한글 파일명이 포함된 아카이브의 내용 목록을 **UTF-8** 로 올바르게 표시(`-sccUTF-8`)

## 포맷 지원

| 포맷 | 데스크톱(Electron) | 웹(브라우저) |
|------|:---:|:---:|
| ZIP (분할 포함) | 생성·해제 | 생성·해제 |
| TAR | 생성·해제 | 생성·해제 |
| TAR.GZ | 생성·해제 | 생성·해제 |
| TAR.BZ2 | 생성·해제 | 해제만 |
| 7z | 생성·해제 | 해제만 |
| RAR | 해제만 | 해제만 |
| 디스크 이미지·컨테이너 (`.dmg` `.img` `.iso` `.appimage` `.xz` `.lzma` `.cab` `.wim` `.z`) | 열기·해제만 | — |

- **데스크톱 엔진**: [`7zip-bin`](https://www.npmjs.com/package/7zip-bin) + [`node-7z`](https://www.npmjs.com/package/node-7z) (zip/7z/tar/gz/bz2 생성·해제, RAR·디스크 이미지 해제). 디스크 이미지류는 7za 가 내용 기반으로 열어 목록·해제만 지원합니다.
- **웹 엔진**: 해제는 [`libarchive.js`](https://github.com/nika-begiashvili/libarchivejs)(WASM, 모든 포맷 읽기), 생성은 [`fflate`](https://github.com/101arrowz/fflate) + [`tar-stream`](https://github.com/mafintosh/tar-stream).

## 빠른 시작

```bash
npm install

# 데스크톱 앱 바로 실행 (개발)
npm start

# 웹 (브라우저)
npm run dev:web          # http://localhost:5273
npm run build:web        # 정적 산출물 → dist-web/

# 타입 검사
npm run typecheck
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
             - 탐색기(FileBrowser) · 뷰어/파일정보(ArchiveViewer) · 상태바(StatusBar)
             - 설정(SettingsModal) · 진행률 팝업(ProgressModal) · 컨텍스트 메뉴(ContextMenu)
  web/       WebArchiveService(fflate+libarchive.js) + 브라우저 진입점
  desktop/   Electron main/preload/backend(node-7z) + ElectronArchiveService
build/       아이콘, NSIS 커스텀 스크립트, afterBuild 훅
```

## 라이선스

MIT © SHKWON (knix008@naver.com)
