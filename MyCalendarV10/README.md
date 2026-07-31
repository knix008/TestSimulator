# MyCalendar

모던한 일정 관리 캘린더. **Electron 데스크톱 앱 + 웹 앱** 을 하나의 코드베이스로 제공하며,
**Google Calendar 양방향 동기화** 를 지원합니다.

- 월 / 주 / 일 / 목록(agenda) 보기
- 일정 CRUD, 하루 종일 일정, 알림, 장소/설명, 다중 캘린더(색상 그룹)
- Google Calendar 양방향 동기화 (증분 sync token 사용)
- `.ics` 내보내기
- Windows / macOS / Linux 설치 파일 + 웹 실행
- 설치 시 **바탕화면 / 시작 메뉴 바로가기 선택** (Windows NSIS)
- 모던한 3D 스타일 아이콘 (SVG → ico/png/icns 자동 생성)

## 기술 스택

| 영역 | 사용 기술 |
|---|---|
| 데스크톱 | Electron 28 |
| 서버/API | Express (데스크톱·웹 공용) |
| 데이터 | SQLite (knex) |
| Google 연동 | googleapis (OAuth 2.0 + Calendar API v3) |
| 패키징 | electron-builder (NSIS / dmg / AppImage·deb) |
| 아이콘 | sharp + png-to-ico + 내장 ICNS 빌더 |

## 개발 실행

```bash
npm install
npm run create-icons      # 최초 1회 아이콘 생성

# 데스크톱(Electron)
npm start

# 웹 서버만 (http://127.0.0.1:3400)
npm run start:web
```

`npm install` 시 `sqlite3` 네이티브 모듈이 Electron ABI 로 빌드되어야 할 수 있습니다.
문제가 있으면 `npx electron-rebuild -f -w sqlite3` 를 실행하세요.

## 자동 테스트

외부 의존성 없이 Node 내장 테스트 러너(`node:test`)를 사용합니다.

```bash
npm test                    # 전체 테스트 실행
node test/run-tests.js      # 동일 (러너 스크립트 직접 실행)
node test/run-tests.js events   # 이름에 "events"가 포함된 파일만 실행
```

시나리오별 테스트 (`test/`):

| 파일 | 검증 내용 |
|---|---|
| `ics-parser.test.js` | ICS 파싱 — 시각/종일/TZID/줄접힘/이스케이프/DTEND 누락 |
| `events.test.js` | 일정 CRUD, 유효성 검사, 범위 필터, 404 |
| `calendars.test.js` | 캘린더 CRUD, 기본 캘린더 삭제 방지 |
| `settings.test.js` | 테마/언어/투명도 등 설정 저장·부분 갱신 |
| `google.test.js` | Google 상태/인증 URL/연결 해제 (내장 자격증명) |
| `subscriptions.test.js` | ICS 구독 추가·목록·새로고침(멱등)·프루닝·삭제 |

각 테스트는 임시 SQLite DB와 임의 포트로 격리 실행됩니다 (실제 데이터 영향 없음).
현재 **35개 테스트 전부 통과**합니다.

## 설치 파일 빌드

```bash
npm run build:win     # → dist/MyCalendar-Setup-1.0.0.exe (NSIS)
npm run build:mac     # → dist/*.dmg
npm run build:linux   # → dist/*.AppImage, *.deb
npm run build:all     # 세 플랫폼 모두 (해당 OS/도구 필요)
```

생성된 설치 파일은 `dist/installers/` 로도 복사됩니다.

### Windows 바로가기 선택
NSIS 설치 마법사의 "바로가기 설정" 단계에서 **바탕화면 / 시작 메뉴** 바로가기 생성 여부를
체크박스로 선택할 수 있습니다 (`build/installer.nsh`).

## Google Calendar 연동 설정

OAuth 2.0 사용자 동의 방식입니다. **개발자가 Client ID 를 한 번 내장**해 두면
최종 사용자는 **"Google로 로그인" → 동의**만 하면 됩니다.

### 개발자 1회 설정 (Client ID 내장)

1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) 에서 프로젝트 생성
2. **Google Calendar API** 활성화
3. **OAuth 클라이언트 ID** 생성 — 애플리케이션 유형: **데스크톱 앱**
4. 발급된 Client ID / Secret 을 아래 중 한 곳에 넣습니다 (우선순위 순):
   - 환경변수 `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
   - [src/config/google-oauth.js](src/config/google-oauth.js) 의 `clientId` / `clientSecret`
   - 설치 후 `<userData>/google-oauth.json` (`{ "clientId": "...", "clientSecret": "..." }`) — 재빌드 없이 설정 가능

> 데스크톱 앱 OAuth 클라이언트의 secret 은 Google 정책상 기밀로 취급되지 않으므로 앱에 내장해도 됩니다.

### 최종 사용자

- 사이드바 **🔗 Google 연동** → **Google로 로그인** → 브라우저에서 본인 계정 로그인·동의 → 완료
- **⟳ 동기화** 버튼으로 양방향 동기화

> Client ID 가 어디에도 없으면, 앱 안에서 사용자가 직접 Client ID/Secret 을 입력하는
> 화면이 fallback 으로 표시됩니다.

> 로컬에서 만든 일정은 다음 동기화 때 Google 에 업로드되고, Google 의 변경 사항은
> 앱으로 내려받습니다. 삭제도 양쪽으로 전파됩니다.

> **참고**: 동의 화면이 "테스트" 상태면 본인(및 등록한 테스트 사용자)만 로그인할 수 있고
> refresh token 이 약 7일마다 만료됩니다. 다수 사용자에게 배포하려면 Google 앱 게시·검증이 필요합니다.

## 데이터 위치

- 데스크톱: Electron `userData` 폴더 (`calendar.db`)
- 웹: 프로젝트 `data/calendar.db`

Google OAuth 토큰은 `settings` 테이블에 로컬 저장되며 외부로 전송되지 않습니다.

## 프로젝트 구조

```
main.js                 Electron 메인
preload.js              contextBridge API
server.js               Express 서버 (웹·데스크톱 공용)
src/
  db/                   connection, migrate, settings-store
  api/                  events, settings, google, app-info
  services/             google-client, google-sync
  renderer/            index.html, css/, js/ (calendar, app, api)
assets/icon-source.svg  아이콘 원본 (3D 스타일)
build/installer.nsh     NSIS 바로가기 선택 페이지
scripts/                create-icons, copy-installer
```

© 2026 SHKWON · MIT
