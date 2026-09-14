# My FTP Client (MultiOS)

FTP · FTPS · SFTP 클라이언트 — **Windows / macOS / Linux 데스크톱 앱**과 **웹 버전**을 하나의 코드로 제공합니다.
`FTPClientWinV10`(WinForms, FluentFTP + SSH.NET) 을 Electron + React 로 다시 만든 것입니다.

![My FTP Client](assets/icon.svg)

## 주요 기능

- **FTP / FTPS(명시적 TLS) / SFTP** 연결 — 프로토콜 선택, 호스트·포트·사용자·비밀번호, 30초 연결 타임아웃
- **서버 패널**: 현재 폴더의 평면 목록(`[..]` 로 상위 이동), 더블클릭으로 폴더 진입 / 파일 다운로드
- **로컬 패널**: 드라이브(볼륨 이름 포함) → 폴더 → 파일 계층 트리, 지연 로딩, 더블클릭으로 파일 업로드
- **전송 버튼**(← 업로드 / → 다운로드) 이 있는 가운데 분할 바 — 드래그하면 패널 너비 조절
- 파일·폴더(하위 트리 포함) 업로드/다운로드, **진행률·속도 표시**, **취소**, 다중 선택, 파일마다 로그 한 줄(크기·소요 시간·속도)
- 대상에 같은 이름이 있으면 **충돌 질문**(덮어쓰기 / 건너뛰기 / 취소, "이후 항목에도 적용")
- 서버·로컬 양쪽 **새 폴더 / 이름 바꾸기 / 삭제**, 탐색기(파인더)에서 열기, 경로 복사
- **접속 프로파일**(툴바) 저장 / 선택 / 다중 삭제, 마지막 프로파일·로컬 폴더 복원; Host 칸에 `ftp://user:pw@host:port/…` URL 을 붙여 넣어도 자동 분해
- **접속 히스토리**(🕘): 프로파일로 저장하지 않아도 연결에 성공한 서버는 최근 20개까지 기록(비밀번호 제외)
- 타이틀바 없는 창: 툴바가 드래그 영역이며 최소화/최대화/닫기 버튼과 우측 하단 크기 조절 마커를 제공
- 시각·색상 로그(시간 표시), 상태 표시줄, 성공/오류 알림음
- 오류는 팝업 + 자세한 내용(코드·경로·스택) + **자세한 내용 복사** 버튼
- 16가지 테마, 한국어/영어(국기 버튼으로 전환), 설정·정보 대화상자

## 실행

```bash
npm install
npm start            # 개발 모드: Vite(5187) + Electron
npm run web          # 웹 버전: 빌드 후 http://127.0.0.1:5188 (브라우저 자동 열림)
```

웹 버전은 서버가 실행되는 컴퓨터의 파일 시스템이 "로컬" 쪽이 되고, FTP/SFTP 연결도 그 컴퓨터에서 이루어집니다.
다른 컴퓨터에서 접속하려면 `node server/server.js --host 0.0.0.0 --port 8080 --token <비밀값>` 처럼 토큰과 함께 실행하세요.

## 설치 파일 만들기

```bash
npm run build:win     # Windows  → MyFTPClient Setup 1.0.0.exe (NSIS)
npm run build:mac     # macOS    → My FTP Client-1.0.0.dmg (x64 + arm64)  ※ macOS 에서 실행
npm run build:linux   # Linux    → .AppImage + .deb                        ※ Linux 에서 실행
```

아이콘(`build/icons/`)은 `assets/icon.svg` 에서 자동 생성되며, 결과물은 `release/` 와 프로젝트 루트에 복사됩니다.
`npm run clean` 으로 빌드 산출물을, `npm run clean:all` 로 `node_modules` 까지 지웁니다.

## 테스트

```bash
npm test                          # 코어: 프로파일·세션·히스토리·로컬 FS + FTP·FTPS·SFTP 왕복 (내장 테스트 서버, 23개)
npm run build && npm run smoke    # 데스크톱 + 웹 스모크: 실제 창에서 접속·전송 후 .smoke/*.png 스크린샷
npm run smoke -- --scenario all   # 모든 시나리오(충돌·오류·컨텍스트 메뉴·설정·테마…)
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

비밀번호는 `profiles.json` 에 base64 로만 감춰져 저장됩니다(암호화 아님 — 원본 WinForms 판과 같은 수준).

## 사용 라이브러리

- [basic-ftp](https://github.com/patrickjuchli/basic-ftp) — FTP / FTPS
- [ssh2](https://github.com/mscdex/ssh2) — SFTP
- Electron 31, React 18, Vite 5, electron-builder

자세한 내용은 [UsersGuide.md](UsersGuide.md) 와 [Architecture.md](Architecture.md) 를 보세요.

## License

MIT — Copyright © 2026 SHKWON (knix008@naver.com)
