# MyISOMaker

Windows / macOS / Linux에서 디스크 이미지를 **열기·편집·저장·생성·부팅 이미지 제작·마운트**하는 데스크톱 앱(Tauri 2)과, 브라우저에서 ISO를 **조회·편집**하는 웹 뷰어입니다.

- **버전:** 1.0.2
- **저작권:** Copyright © SHKWON (knix008@naver.com). All rights reserved.
- **문서:** [사용 설명서](doc/UsersGuide.md) · [User's guide](doc/UsersGuide.en.md) · [튜토리얼](doc/Tutorial.md) · [Tutorial](doc/Tutorial.en.md) · [Architecture.md](Architecture.md)

| | Desktop (Tauri) | Web |
|---|---|---|
| ISO/IMG · AppImage · Docker tar 열기 · 트리 편집 · 저장 | ✅ | ISO만 |
| 탐색기 · 정보 · 로그 패널(접고 펼치기), 끌어서 넣기/꺼내기 | ✅ | — |
| 폴더 → ISO 생성 / 부팅 ISO | ✅ (xorriso) | ❌ |
| 폴더 → AppImage 생성, AppImage 열기 · 편집 (squashfs-tools 불필요) | ✅ | ❌ |
| 마운트 / 언마운트 | ✅ | ❌ |
| 필요한 패키지 자동 설치 (진행률 팝업) | ✅ | — |
| 테마 다크 20 · 라이트 20 · 사용자 테마 | ✅ | — |
| 시작 화면 (카드 보드, 움직이는 배경 24개) | ✅ | — |

---

## 요구 사항

- **Node.js** 22.15 이상 (개발 · 빌드. 설치본에는 Node가 함께 들어갑니다)
- **Rust** (stable) — Tauri 빌드
- **xorriso** — ISO 생성 · 부팅 ISO · 전체 추출. **없으면 프로그램이 처음 시작할 때 자동으로 설치합니다.**
  - Windows: repo.msys2.org 의 MSYS2 패키지(xorriso와 런타임 라이브러리)를 내려받아 `%LOCALAPPDATA%\MyISOMaker\tools` 에 풉니다. MSYS2 설치나 관리자 권한이 필요 없습니다. 이미 `C:\msys64` 등에 있으면 그것을 씁니다.
  - macOS: Homebrew (`brew install xorriso`)
  - Linux: 시스템 패키지 관리자(apt/dnf/pacman/zypper)를 pkexec 로 실행
- **squashfs-tools** (선택) — xz · lz4 등으로 압축된 AppImage 열기, 더 작은 AppImage 저장. gzip · zstd AppImage는 내장 SquashFS 리더/라이터로 처리하므로 없어도 됩니다.

ISO **열기/트리 편집/드래그 추출**은 순수 JS(ISO9660)이며 xorriso 없이도 동작합니다.

---

## 빠른 시작

```bash
npm install
npm start            # 데스크톱 개발 실행 (tauri dev: Vite 5183 + Node 호스트)
npm run start:web    # 웹 (포트 5174, /web.html)
```

Windows에서 더블클릭: `start.cmd` (데스크톱), `start-web.cmd` (웹)

```bash
npm test             # 테스트 35개: 실제 xorriso로 ISO 생성 → 열기 → 파일 교체/추가/이름변경/삭제 → 저장 → 다시 열어 바이트 비교 →
                     #   xorriso 추출 → 드라이브로 마운트, 부팅 ISO(BIOS+UEFI), IMG · Docker tar, 탐색기 · 패키지 · 웹 세션,
                     #   SquashFS(실제 mksquashfs 이미지 읽기) · AppImage 생성/열기/저장, 시작 보드 · 테마 · 설명서 · 언어 키
                     #   (영문 · 정렬 · 컬러 출력, 테스트별 시간, 요약)
npm run test:rust    # Rust
npm run typecheck
npm run build:debug  # 시험용 exe (src-tauri/target/debug/MyISOMaker.exe, 설치 파일 없음)
npm run build:win    # Windows 설치 파일 (NSIS) → 프로젝트 루트로 복사
npm run build:mac    # macOS .app + .dmg (macOS에서)
npm run build:linux  # AppImage + .deb (Linux에서)
npm run build:all    # 이 OS에서 만들 수 있는 것 전부
npm run icons        # assets/icon-master.png → src-tauri/icons
npm run doc:images   # 설명서 그림 (doc/images/ko, en) — build:debug 후
bash scripts/setup-linux.sh   # Ubuntu/Debian · WSL 빌드 준비 (WebKitGTK · xorriso · Node · Rust)
```

아이콘은 `python assets/make-3d-icon.py` (3D 타일 + 디스크 그림) → `python assets/build-icons.py` → `npm run icons` 순서로 다시 만듭니다.

---

## macOS · Linux 빌드

Tauri는 그 OS에서만 설치 파일을 만듭니다. 저장소 루트의 GitHub Actions 워크플로 `.github/workflows/myisomaker.yml`이 Windows · macOS · Ubuntu에서 타입 검사 · 테스트 · 설치 파일 빌드(NSIS / .app·.dmg / AppImage·.deb)를 하고 결과를 아티팩트로 올립니다. Linux 작업은 앱이 만든 AppImage를 공식 런타임으로 실제로 실행해 확인합니다.

## 화면

- **맨 윗줄 = 제목 표시줄 + 도구 모음**: 프로그램 아이콘 · 이름 · 버전, 아이콘 도구 버튼(한 줄), 테마 버튼(▾ 드롭다운), 국기(언어), 설정 · 도움말 · 정보, 최소화 · 최대화 · 닫기
- **왼쪽 탐색기 / 오른쪽 정보 / 아래 로그** — 각각 접고 펼치기, 크기 조절, 상태 저장
- **가운데** — 이미지 트리(연결선, 컬러 아이콘) 또는 탭별 입력. 이미지가 없으면 아이콘 · 설명 · 작업 버튼
- **시작 화면** — 도구 모음의 시작 버튼으로 토글. 창 전체를 쓰는 별도 화면이며, 프로그램 이름 카드는 고정(이동 · 크기 변경 불가)
- **설정 · 도움말 · 정보** — 각각 독립된 창 (제목 줄 · 창 버튼). 설정은 모든 탭이 보이는 크기로 열리고 초기화 · 확인 버튼이 있습니다
- **테마 메뉴** — 별도 창(다크 | 라이트 두 열), 화면 밖으로 나가지 않음
- **인쇄** — 하나의 인쇄 창(프린터 · 용지 · 여백 · 배율 · 미리 보기 · 바로 인쇄 · PDF)

UI 기본 언어는 **한국어**, 기본 테마는 **다크**입니다.

---

## 데이터 위치 (Windows)

| 위치 | 내용 |
|---|---|
| `%APPDATA%\MyISOMaker` | 마지막으로 쓴 폴더 |
| `%LOCALAPPDATA%\com.shkwon.myisomaker` | 화면 설정(테마, 언어, 패널, 최근 이미지, 시작 화면) |
| `%LOCALAPPDATA%\MyISOMaker\tools` | 프로그램이 설치한 패키지 (제거할 때 함께 삭제) |

---

## 프로젝트 구조

```
src/                React 화면 (App.tsx, start/ 시작 화면, layout/ 패널·제목 줄, theme/ 테마,
                    settings/ 설정, packages/ 패키지 UI, help/ 도움말, platform/tauri-bridge.ts)
src/iso9660/        ISO9660 리더/라이터/세션 (웹과 공유)
host/               Node 호스트: 편집 세션, xorriso, 마운트, 패키지 설치(packages.ts), 탐색기(fsx.ts)
src-tauri/          Tauri 2 (창, 대화상자, OS 드래그, 닫기 확인, Node 호스트 실행), windows/hooks.nsh
doc/                사용 설명서 · 튜토리얼 (한/영)
assets/             아이콘 원본과 생성 스크립트
scripts/            build-host.mjs (호스트 번들 + Node 런타임), build.mjs (설치 파일)
test/               단위 테스트
```

## 라이선스 / 문의

Copyright © SHKWON (knix008@naver.com). All rights reserved.
