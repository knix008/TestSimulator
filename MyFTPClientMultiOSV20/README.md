# My FTP Client (MultiOS)

FTP · FTPS · SFTP 클라이언트 — **Windows / macOS / Linux 데스크톱 앱**과 **웹 버전**을 하나의 코드로 제공합니다.
`FTPClientWinV10`(WinForms, FluentFTP + SSH.NET) 을 React UI + Node 코어로 다시 만들었고, 데스크톱 셸은 **Tauri 2** 입니다.

![My FTP Client](doc/img/main.png)

## 주요 기능

- **FTP / FTPS(명시적 TLS) / SFTP** 연결 — 프로토콜 선택, 호스트·포트·사용자·비밀번호, 30초 연결 타임아웃
- **서버 패널**: 현재 폴더의 평면 목록(`[..]` 로 상위 이동), 더블클릭으로 폴더 진입 / 파일 다운로드
- **로컬 패널**: 드라이브(볼륨 이름 포함) → 폴더 → 파일 계층 트리, 지연 로딩, 더블클릭으로 파일 업로드. 마지막에 연 폴더를 다음 실행 때 복원
- **전송 버튼**(← 업로드 / → 다운로드) 이 있는 가운데 분할 바 — 드래그하면 패널 너비 조절
- 파일·폴더(하위 트리 포함) 업로드/다운로드, **동시 전송(1–4)**, **크기·날짜가 같으면 건너뛰기**, **진행률·속도·취소**, 다중 선택, 파일마다 로그 한 줄
- 대상에 같은 이름이 있으면 **충돌 질문**(덮어쓰기 / 건너뛰기 / 취소, "이후 항목에도 적용")
- 서버·로컬 양쪽 **새 폴더 / 이름 바꾸기 / 삭제**, 탐색기(파인더)에서 열기, 경로 복사
- **접속 프로파일**(툴바) 저장 / 선택 / 다중 삭제, 마지막 프로파일·로컬 폴더 복원; Host 칸에 `ftp://user:pw@host:port/…` URL 을 붙여 넣어도 자동 분해
- **접속 히스토리**(🕘): 프로파일로 저장하지 않아도 연결에 성공한 서버는 최근 20개까지 기록(비밀번호 제외)
- **로컬 터미널**(하단 독): 시스템에 설치된 셸(cmd, PowerShell, Git Bash, WSL 등)을 탭으로 여러 개 열기, 한글 입출력, 셸별 프롬프트·색상, **Tab 자동완성**, 실행 중 미리 입력(Enter 포함)
- 타이틀바 없는 창: 툴바가 드래그 영역이며 최소화/최대화/닫기 버튼과 우측 하단 크기 조절 마커를 제공. 창 위치·크기 기억
- **사용 설명서**(툴바 📖): 그림이 들어간 설명서를 **별도 창**으로 엽니다. 메인 창 밖으로 옮길 수 있고, 메인 테마·언어를 따르며, 상단에서 언어와 글자 크기(− / Npx / +)를 바꿉니다. 왼쪽 목차, 오른쪽 내용
- 오류는 팝업 + 자세한 내용(코드·경로·스택) + **자세한 내용 복사** 버튼
- 팝업은 메인 창과 따로 열려 다른 모니터로 옮길 수 있고, **크기는 고정**(내용에 맞게 연 뒤 잠금), 스크롤바 없음
- 16가지 테마(목록에 아이콘), 한국어/영어(국기 버튼으로 전환), **탭으로 나뉜 설정**·정보 대화상자

## 실행

```bash
npm install
npm start            # 데스크톱 개발 모드: tauri dev (Vite 를 빈 포트에서, 수정이 바로 반영)
npm run dev          # 웹 개발 모드: API 서버 + Vite (둘 다 빈 포트)
npm run web          # 웹 버전: 빌드 후 http://127.0.0.1:5188 (브라우저 자동 열림)
```

필요한 도구: Node.js 20+ 와 [Rust](https://rustup.rs)(데스크톱 빌드). 설치된 앱에는 Node 런타임이 들어 있어 사용자 PC 에는 Node.js 가 필요 없습니다.

웹 버전은 서버가 실행되는 컴퓨터의 파일 시스템이 "로컬" 쪽이 되고, FTP/SFTP 연결도 그 컴퓨터에서 이루어집니다.
다른 컴퓨터에서 접속하려면 `node server/server.js --host 0.0.0.0 --port 8080 --token <비밀값>` 처럼 토큰과 함께 실행하세요.

## 설치 파일 만들기

```bash
npm run build:win     # Windows  → My FTP Client_1.0.0_x64-setup.exe (NSIS)
npm run build:mac     # macOS    → .dmg            ※ macOS 에서 실행
npm run build:linux   # Linux    → .AppImage + .deb ※ Linux 에서 실행
```

빌드는 `src-tauri/runtime/` 에 Node 실행 파일과 esbuild 로 묶은 코어(`server.js` 한 파일)를 준비한 뒤 Tauri 번들에 넣습니다. 결과물은 `src-tauri/target/release/bundle/` 에 생기고 프로젝트 루트로 복사됩니다.
아이콘(`src-tauri/icons/`)은 `npm run generate:icons` 가 `assets/icon.svg` 에서 만듭니다.
Windows 설치 파일은 언어(한국어/English)를 고른 뒤, 이미 설치된 프로그램(이전 Electron 판 포함)이 있으면 삭제 후 설치할지와 이전 데이터를 지울지 묻고, 바로가기를 고르게 합니다.
`npm run clean` 으로 빌드 산출물을, `npm run clean:all` 로 `node_modules`·`src-tauri/target` 까지 지웁니다.

## 테스트

```bash
npm test                          # 코어·UI·터미널·셸·데스크톱 호스트·설명서 + cargo test (파일별 summary)
npm run smoke                     # 실제 Tauri 창(디버그 빌드)을 CDP 로 조작: 접속·전송, 설정 창, 설명서 창, 웹(헤드리스 Edge)
npm run smoke -- --scenario all   # 모든 시나리오(충돌·오류·컨텍스트 메뉴·터미널·설정·테마…) 스크린샷 .smoke/*.png
npm run smoke -- --docs           # 설명서 그림(doc/img/*.png)을 다시 찍고 설명서 창을 검증
```

`test/ftp-server.mjs`(FTP, `--tls` 로 FTPS) 와 `test/sftp-server.mjs` 는 테스트용 소형 서버입니다. 직접 띄워 보려면:

```bash
node test/ftp-server.mjs <폴더> 2121         # ftp://test:secret@127.0.0.1:2121/
node test/ftp-server.mjs <폴더> 2121 --tls   # ftps:// (자체 서명 인증서 test/certs/)
```

## 데이터 위치

| 항목 | Windows | macOS | Linux |
|------|---------|-------|-------|
| 세션·설정 `session.json` | `%APPDATA%\My FTP Client\` | `~/Library/Application Support/My FTP Client/` | `~/.config/My FTP Client/` |
| 프로파일 `profiles.json` | 같은 폴더 | 같은 폴더 | 같은 폴더 |
| 접속 히스토리 `history.json` | 같은 폴더 | 같은 폴더 | 같은 폴더 |

이전 Electron 판과 같은 폴더이므로 업데이트해도 설정이 이어집니다. `MFC_CONFIG_DIR` 환경 변수로 다른 폴더를 쓸 수 있습니다(테스트용).
비밀번호는 `profiles.json` 에 base64 로만 감춰져 저장됩니다(암호화 아님 — 원본 WinForms 판과 같은 수준).

## 사용 라이브러리

- [basic-ftp](https://github.com/patrickjuchli/basic-ftp) — FTP / FTPS
- [ssh2](https://github.com/mscdex/ssh2) — SFTP · 원격 터미널(PTY)
- [xterm.js](https://xtermjs.org/) — 하단 독의 터미널 화면
- Tauri 2 (dialog · clipboard-manager · single-instance 플러그인), React 18, Vite 5, esbuild

## 문서

- [doc/index.html](doc/index.html) — 그림이 들어간 사용 설명서 (앱의 📖 설명서 단추로 별도 창에서 열림)
- [UsersGuide.md](UsersGuide.md) — 사용자 가이드 (텍스트)
- [Architecture.md](Architecture.md) — 구조와 동작

## License

MIT — Copyright © 2026 SHKWON (knix008@naver.com)
