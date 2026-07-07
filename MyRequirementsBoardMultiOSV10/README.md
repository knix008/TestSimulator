# MyRequirementsBoard Multi-OS

`MyReqBoardV10`을 참고하여 구축한 **요구사항 관리 및 추적 시스템**입니다.  
JavaScript + Electron + Express + React 기반이며, **Windows / macOS / Linux 데스크톱**과 **웹 브라우저**에서 실행할 수 있습니다.

> 화면 사용 방법은 [UsersGuide.md](UsersGuide.md)를 참고하세요.

## 주요 기능

- **요구사항 관리** — CRUD, 카테고리별 자동 코드 (예: `UI-01`), 상태/우선순위 필터·검색
- **테스트 케이스** — 요구사항별 연결 (조회)
- **다중 프로젝트** — 프로젝트별 요구사항 격리, 상단 프로젝트 선택
- **사용자 관리** — ADMIN / EDITOR / VIEWER 역할, 등록 승인 흐름
- **Ollama 연동** — 로컬 LLM으로 요구사항 정제 (`http://127.0.0.1:11434`)
- **Excel 가져오기/보내기** — 요구사항·테스트 케이스 Excel 연동, 가져오기 시 테스트 케이스 자동 생성
- **유연한 DB** — 외부 DB 설정 시 해당 DB 사용, 미설정 시 SQLite 자동 사용

## 기술 스택

| 구분 | 기술 |
|------|------|
| Desktop | Electron 36 |
| UI | React 18 + Vite 6 |
| API | Express 4 |
| DB (기본) | sql.js — SQLite 로컬 파일 |
| DB (외부) | Knex 3 + mysql2 / pg / mssql |
| Auth | express-session + bcryptjs |
| AI | Ollama HTTP API |

## 데이터베이스

### 동작 방식

| 조건 | 사용 DB |
|------|---------|
| `data/db-config.json`에 외부 DB 설정이 저장되어 있음 | MariaDB / MySQL / PostgreSQL / MS SQL Server |
| 외부 DB 설정 없음 | **SQLite** (`data/requirements-board.db`) |
| DB 설정 UI 기본값 | **MariaDB**, `localhost:3306` |

- 외부 DB 연결 정보는 `data/db-config.json`에 저장됩니다 (비밀번호 포함 — `.gitignore` 대상).
- 관리자는 **설정** 화면에서 DB를 연결·해제할 수 있습니다.
- 외부 DB 연결에 실패하면 SQLite로 폴백합니다.

### 지원 DB 및 기본 포트

| DB | 기본 포트 |
|----|-----------|
| **MariaDB** (기본) | 3306 |
| MySQL | 3306 |
| PostgreSQL | 5432 |
| MS SQL Server | 1433 |
| SQLite | (로컬 파일) |

### MariaDB 계정 예시

```sql
CREATE USER 'reqboard'@'%' IDENTIFIED BY '비밀번호';
GRANT ALL PRIVILEGES ON reqboard.* TO 'reqboard'@'%';
FLUSH PRIVILEGES;
```

GSSAPI(Windows 인증) 방식 계정은 Node.js 드라이버에서 지원하지 않을 수 있습니다. `mysql_native_password` 또는 `caching_sha2_password` 방식을 사용하세요.

## 사전 요구사항

- **Node.js 20+**
- (선택) **Ollama** — AI 요구사항 정제 기능 사용 시

```bash
ollama pull llama3
ollama serve
```

## 설치

```bash
cd MyRequirementsBoardMultiOSV10
npm install
```

## 실행

### 웹 모드 (브라우저, 개발)

```bash
npm run dev:web
```

- UI: http://127.0.0.1:5175
- API: http://127.0.0.1:3847

### Electron 데스크톱 (개발)

```bash
npm run dev
```

### 프로덕션 — 웹 서버

```bash
npm run build
npm start
```

http://127.0.0.1:3847 에서 UI + API를 함께 제공합니다.

### 프로덕션 — Electron

```bash
npm run build
npm run start:electron
```

## 기본 계정

| ID | 비밀번호 | 역할 |
|----|----------|------|
| admin | admin | ADMIN |

최초 실행 시 기본 프로젝트 **기본 프로젝트**가 자동 생성됩니다.  
로그인 후 **반드시 비밀번호를 변경**하세요.

## 패키징 (멀티 OS)

```bash
npm run dist:win     # Windows NSIS 설치 프로그램
npm run dist:mac     # macOS DMG / ZIP
npm run dist:linux   # Linux AppImage / deb
npm run dist:all     # Windows + macOS + Linux
```

- 빌드 전 `assets/` 아이콘·샘플 프로젝트가 자동 생성됩니다 (`npm run generate:icons`).
- 설치 프로그램은 `release/`에 생성된 뒤 **프로젝트 루트**로도 복사됩니다.
- Windows NSIS 설치 시 **바탕 화면**·**시작 메뉴** 바로 가기를 각각 선택할 수 있습니다.
- `.reqtproj` 프로젝트 파일 확장자가 등록되며, 전용 아이콘(`assets/reqtproj.ico`)이 사용됩니다.
- 실행 중 창·작업 표시줄·Dock에도 `assets/icon` 아이콘이 표시됩니다.

### assets 디렉터리

| 파일 | 용도 |
|------|------|
| `icon.ico` / `icon.png` | 앱·설치 프로그램·바로 가기 아이콘 |
| `reqtproj.ico` / `reqtproj.png` | `.reqtproj` 파일 연결 아이콘 |
| `Sample.reqtproj` | 샘플 프로젝트 파일 |

결과물: `release/` 및 프로젝트 루트 (`MyRequirementsBoard-{version}-...`)

## 프로젝트 구조

```
MyRequirementsBoardMultiOSV10/
├── electron/              # Electron 메인/프리로드
├── server/                # Express API
│   ├── db/                # SQLite / Knex 런타임, 설정 저장
│   ├── auth/              # 인증, RBAC
│   ├── routes/            # REST API
│   └── lib/               # reqCode, ollama, dbErrorMessage
├── renderer/              # React UI (Vite)
│   └── src/
│       ├── pages/
│       ├── components/
│       └── api/
├── assets/                # 앱·프로젝트 아이콘, 샘플 .reqtproj
├── scripts/               # generate-icons, copy-installers
├── data/                  # SQLite DB, db-config.json (런타임 생성)
├── package.json
├── README.md
└── UsersGuide.md
```

## API 엔드포인트 (요약)

| 경로 | 설명 |
|------|------|
| `GET /api/health` | 서버·DB 상태 |
| `GET /api/settings/db` | DB 설정 상태 |
| `POST /api/settings/db/connect` | 외부 DB 연결 |
| `POST /api/auth/login` | 로그인 |
| `GET /api/projects` | 프로젝트 목록 |
| `GET /api/projects/:id/requirements` | 요구사항 목록 |
| `POST /api/ollama/refine` | Ollama 요구사항 정제 |
| `GET /api/users` | 사용자 목록 (ADMIN) |

## 참고 프로젝트

| 프로젝트 | 참고 내용 |
|----------|-----------|
| `MyReqBoardV10` | 요구사항 도메인, RBAC, Excel |
| `MyProjectMultiOSV10` | Electron 멀티 OS 빌드 |
| `MyRequirementWinV10` | Ollama 프롬프트/정제, 다중 DB |

## Excel 가져오기 / 보내기

- **파일 → Excel 가져오기** 또는 툴바 **Excel 가져오기** (EDITOR 이상)
- **Requirements** 시트: `code`, `title`, `description`, `category`, `priority`, `status` (`title` 필수)
- **TestCases** 시트(선택): `requirementCode`, `code`, `title`, `steps`, `expectedResult`, `status`
- TestCases 시트가 없으면 요구사항 설명을 기반으로 테스트 케이스를 **자동 생성** (정상/오류/경계)
- **Excel 보내기**: 프로젝트 전체 또는 목록에서 선택한 요구사항만 보내기
- 가져온 요구사항·테스트 케이스는 각각 편집 화면에서 수정 가능

API:

| 경로 | 설명 |
|------|------|
| `POST /api/projects/:id/excel/import` | Excel 업로드 (multipart `file`) |
| `GET /api/projects/:id/excel/export?ids=1,2` | Excel 다운로드 |
| `GET /api/projects/:id/excel/sample` | 샘플 Excel 다운로드 |

## 향후 확장

- 한/영 UI 전환
