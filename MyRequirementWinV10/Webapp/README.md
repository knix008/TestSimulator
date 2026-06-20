# ReqTrace Web

ReqTrace 데스크톱 앱과는 완전히 독립적인 웹 애플리케이션입니다. 서버가 MySQL, MariaDB, PostgreSQL, SQLite3, MS SQL Server 중 하나에 연결되어 있으면, 브라우저에서 로그인하여 요구사항/테스트 케이스를 조회·편집하고 대시보드(파이 차트)로 현황을 확인할 수 있습니다.

**사용 방법**: 화면별 사용법은 [UsersGuide.md](UsersGuide.md)를 참고하세요.

## 구조

- `server/` — Node.js + Express + TypeScript REST API. Knex로 5개 DB 종류를 모두 지원합니다. JWT 기반 사용자 인증 포함.
  - `server/public/admin/` — **서버 관리 콘솔**(정적 HTML/JS, 빌드 불필요). DB 연결 설정과 사용자 관리를 담당.
- `client/` — React + Vite + TypeScript. 요구사항/테스트 케이스 작업과 대시보드를 위한 일반 사용자용 앱. DB 접속 정보는 전혀 다루지 않습니다.

## 서버 관리 콘솔 (`/admin`)

DB 연결 설정과 사용자 관리는 React 클라이언트가 아니라, **서버가 직접 제공하는 별도의 관리 콘솔**(`http://localhost:4000/admin`)에서 처리합니다. 빌드나 별도 프로세스 없이 서버만 떠 있으면 바로 접속할 수 있습니다. 서버를 시작하면 콘솔 URL이 로그에 출력됩니다.

로그인이 되면 콘솔 안에서 세 개의 페이지를 탭으로 골라 들어갈 수 있습니다.

| 페이지 | 내용 |
|--------|------|
| **DB 설정** | 데이터베이스 연결 구성 + 연결 후에는 DB 내용(요구사항/테스트케이스/사용자 수 등) 확인 |
| **사용자 설정** | 사용자 추가, 비밀번호 변경, 삭제, ID·권한 변경 |
| **관리자 설정** | 현재 로그인한 관리자 계정 자신의 ID/비밀번호 변경 |

### 최초 로그인 (부트스트랩)

서버를 처음 실행하면 아직 어떤 DB에도 연결되어 있지 않으므로 로그인할 `users` 테이블 자체가 없습니다. 이 상태에서 `/admin`에 접속하면 **고정된 부트스트랩 로그인**(기본값 `admin` / `admin`, 필요하면 `ADMIN_CONSOLE_USERNAME`/`ADMIN_CONSOLE_PASSWORD` 환경 변수로 변경 가능)으로만 "DB 설정" 페이지에 들어가 연결을 구성할 수 있습니다.

DB가 연결되고 나면:

- 대상 데이터베이스와 테이블이 없으면 자동으로 생성됩니다.
- `users` 테이블이 없으면 **DB 안에** 기본 관리자 계정(`admin` / `admin`)이 자동으로 생성됩니다 — 이때부터는 이 DB에 저장된 계정이 진짜 관리자 계정입니다.
- 부트스트랩 로그인은 더 이상 쓸 수 없게 되고, 화면에 일반 로그인 폼이 나타납니다. 이제부터는 DB에 저장된 관리자 계정(`admin` / `admin`)으로 로그인해 콘솔의 세 페이지를 모두 사용합니다.
- 로그인 후 **"관리자 설정"** 페이지에서 ID와 비밀번호를 바로 변경하세요.

이미 `users` 테이블이 있는 DB(예: 전에 한 번 연결했던 DB)를 다시 연결하면, 그 안에 있던 계정과 비밀번호를 그대로 사용합니다 — 다시 시드하지 않습니다.

### 환경 변수로 최초 연결을 미리 구성하기 (선택)

`/admin`에서 매번 입력하는 대신, `server/` 디렉터리에 `.env`를 만들고 아래처럼 설정한 뒤 서버를 시작하면 첫 기동 시 자동으로 연결됩니다. 이미 `server/data/connection-config.json`이 있으면 그 값이 우선합니다.

```bash
DB_PROVIDER=mysql            # mysql | mariadb | postgresql | mssql | sqlite
DB_SERVER=localhost
DB_PORT=3306
DB_DATABASE=reqtrace
DB_USERNAME=root
DB_PASSWORD=changeme

# SQLite3 인 경우는 이것만 설정
# DB_PROVIDER=sqlite
# DB_SQLITE_PATH=./reqtrace.db
```

`npm run dev`(tsx)는 `.env`를 자동으로 읽지 않으므로 Node 20.6+ 의 기본 제공 옵션을 사용하세요:

```bash
node --env-file=.env -r tsx/cjs src/index.ts
# 또는 운영 빌드 후
node --env-file=.env dist/index.js
```

## 사용자 계정 / 권한

세 가지 역할이 있습니다.

| 역할 | 권한 |
|------|------|
| **관리자 (admin)** | DB 연결 설정, 사용자 추가/삭제/권한 변경, 요구사항·테스트 케이스 조회/변경 모두 가능 |
| **편집자 (editor)** | 요구사항·테스트 케이스 조회 및 **변경**(추가/편집/삭제/자동 생성/실행 기록) 가능. 사용자 관리·DB 설정은 불가 |
| **조회자 (viewer)** | 요구사항·테스트 케이스·대시보드 **조회만** 가능. 변경 시도는 서버에서 거부됨(403) |

- 서버가 처음 DB에 연결되어 `users` 테이블이 없으면, 기본 관리자 계정(`admin` / `admin`)을 자동으로 생성합니다. **로그인 후 즉시 ID와 비밀번호를 변경**하세요(둘 다 관리 콘솔에서 변경 가능).
- 일반 사용자는 React 클라이언트(`http://localhost:5173`)에서 사용자 ID/비밀번호로 로그인해 요구사항·테스트 케이스·대시보드를 사용합니다.
- 사용자 등록·삭제·ID 변경·권한 변경은 `/admin` 관리 콘솔에서 관리자만 할 수 있습니다. 비밀번호는 관리자가 다른 사용자의 것도 재설정할 수 있고, 본인 비밀번호는 누구나 직접 바꿀 수 있습니다.

## 실행 방법

```bash
# 1) 서버
cd server
npm install
npm run dev      # http://localhost:4000  (관리 콘솔: http://localhost:4000/admin)

# 2) 클라이언트 (다른 터미널)
cd client
npm install
npm run dev       # http://localhost:5173 (API는 자동으로 :4000 으로 프록시됨)
```

1. `http://localhost:4000/admin`에 접속합니다 — 처음에는 부트스트랩 로그인(기본값 `admin`/`admin`)으로 "DB 설정" 페이지에 들어가 연결을 구성합니다(최초 1회). 연결되면 DB에 진짜 관리자 계정(`admin`/`admin`)이 생성되니 같은 화면에서 다시 그 계정으로 로그인해 "사용자 설정"·"관리자 설정"도 사용하세요.
2. `http://localhost:5173`에 접속해 (관리 콘솔에서 만든 계정으로) 로그인합니다.

## 운영 빌드

```bash
cd server && npm run build && node --env-file=.env dist/index.js
cd client && npm run build   # dist/ 를 정적 호스팅하거나 server에 별도로 서빙
```

## 기능 요약

- **서버 관리 콘솔** (`/admin`): DB 설정 / 사용자 설정 / 관리자 설정 세 페이지. DB 연결(처음엔 고정 부트스트랩 로그인, 연결 후엔 DB 관리자 로그인), 사용자 추가/삭제/ID 변경/권한 변경/비밀번호 초기화, 관리자 자신의 ID·비밀번호 변경, DB 내용(요구사항/테스트케이스/사용자 수 등) 조회.
- **인증/권한**: JWT 로그인, 관리자/편집자/조회자 3단계 역할.
- **요구사항/테스트 케이스**: 추가·편집·삭제(편집자 이상), 테스트 케이스 단계(Step) 편집, 실행 기록(Pass/Fail/Blocked/NotRun).
- **테스트 케이스 자동 생성**: 요구사항의 제목/설명/우선순위를 바탕으로 정상·예외·경계 테스트 케이스를 자동 생성 (데스크톱 앱의 생성 로직과 동일한 방식).
- **대시보드**: 우선순위별/상태별 요구사항, 최신 테스트 실행 결과를 파이 차트로 표시 (모든 역할이 조회 가능).

## 참고

- JWT/부트스트랩 서명 키는 `server/data/secrets.json`에 자동으로 생성·저장되어, 서버를 재시작해도 기존 로그인 세션이 무효화되지 않습니다(`npm run dev`의 tsx watch가 파일 저장마다 재시작하는 경우에도 마찬가지). `JWT_SECRET` 환경 변수를 설정하면 그 값이 우선 사용됩니다.
- DB 접속 비밀번호는 `server/data/connection-config.json` 또는 환경 변수에만 존재하며, React 클라이언트나 어떤 API 응답에도 노출되지 않습니다.
- 이 웹앱은 자체 테이블 스키마(`requirements`, `test_cases`, `test_steps`, `test_runs`, `users`)를 사용하며, 데스크톱 ReqTrace 앱의 스키마와는 별개입니다. 연결한 DB에 이미 이 스키마(특히 `users` 테이블)가 있으면 그대로 사용하고, 없으면 새로 생성합니다.
- **기본 관리자 계정(`admin`/`admin`)은 `users` 테이블이 처음 생성될 때 단 한 번만 만들어집니다.** 이전에 한 번이라도 연결했던 DB(또는 `server/data/connection-config.json`이 가리키는 SQLite 파일)를 다시 연결하면 그 DB에 이미 있던 `users` 테이블과 비밀번호가 그대로 사용됩니다 — 기본 비밀번호가 바뀌어도 기존 계정에는 반영되지 않습니다. `admin`/`admin`으로 로그인이 안 되면 (a) 예전 비밀번호(예: `admin123`)로 시도하거나, (b) 완전히 새로운 빈 DB/파일로 연결해 다시 시드하세요.
