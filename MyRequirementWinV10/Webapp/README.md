# ReqTrace Web

ReqTrace 데스크톱 앱과는 **별도 프로세스**로 실행하는 웹 애플리케이션입니다. 서버가 MySQL, MariaDB, PostgreSQL, SQLite3, MS SQL Server 중 하나에 연결되어 있으면, 브라우저에서 로그인하여 요구사항/테스트 케이스를 조회·편집하고 대시보드(파이 차트)로 현황을 확인할 수 있습니다.

**사용 방법**: 화면별 사용법은 [UsersGuide.md](UsersGuide.md)를 참고하세요.

## 서버 관리 기능 (요약)

| 기능 | 위치 | 기본값 |
|------|------|--------|
| **DB 연결 설정** | `http://localhost:4000/admin` → DB 설정 | — |
| **사용자 관리** | 관리 콘솔 → 사용자 설정 | — |
| **서버 관리자 계정 변경** | 관리 콘솔 → 관리자 설정 | 최초 `admin` / `admin` |

- DB가 **아직 연결되지 않았을 때**: 부트스트랩 로그인 `admin` / `admin`으로 DB 설정만 가능
- DB **최초 연결 시**: `users` 테이블과 함께 DB 관리자 계정 `admin` / `admin` 자동 생성
- 부트스트랩으로 DB 연결 후 **같은 계정으로 자동 로그인**되어 DB 설정·사용자 설정·관리자 설정 탭을 바로 사용할 수 있습니다

## 구조

- `server/` — Node.js + Express + TypeScript REST API. Knex로 5개 DB 종류를 모두 지원합니다. JWT 기반 사용자 인증 포함.
  - `server/public/admin/` — **서버 관리 콘솔**(정적 HTML/JS, 빌드 불필요). DB 연결 설정과 사용자 관리를 담당.
  - `server/src/schema.ts` — 데스크톱 ReqTrace DB(PascalCase)와 웹 단독 DB(camelCase) 스키마 자동 감지
  - `server/data/` — `connection-config.json`, `secrets.json` (로컬 생성, gitignore)
- `client/` — React + Vite + TypeScript. 요구사항/테스트 케이스 작업과 대시보드를 위한 일반 사용자용 앱. DB 접속 정보는 전혀 다루지 않습니다.

## 데스크톱 앱과 DB 공유

데스크톱 ReqTrace가 **데이터베이스에 저장**한 요구사항·테스트 케이스를 웹 클라이언트에서 그대로 조회·편집할 수 있습니다.

| 구분 | 데스크톱 ReqTrace | ReqTrace Web |
|------|-------------------|--------------|
| 요구사항/테스트 테이블 | `Requirements`, `TestCases`, … (MySQL/MariaDB에서는 `requirements`, `testcases` 등) | 연결 시 **자동 감지**해 동일 테이블 사용 |
| 컬럼명 | PascalCase (`Id`, `RequirementId`, …) | API는 camelCase, DB 컬럼은 감지 결과에 맞춤 |
| 사용자 인증 | 없음 (데스크톱 단독) | `users` 테이블 (웹 전용) |

웹 서버만 처음 DB에 연결해 테이블을 만들면 camelCase 스키마(`requirements.id` 등)가 생성됩니다. 데스크톱이 먼저 만든 DB를 연결하면 PascalCase 스키마를 그대로 사용합니다.

## 서버 관리 콘솔 (`/admin`)

DB 연결 설정과 사용자 관리는 React 클라이언트가 아니라, **서버가 직접 제공하는 별도의 관리 콘솔**(`http://localhost:4000/admin`)에서 처리합니다. 빌드나 별도 프로세스 없이 서버만 떠 있으면 바로 접속할 수 있습니다.

로그인 후 콘솔 안에서 세 개의 탭을 사용합니다.

| 탭 | 내용 |
|----|------|
| **DB 설정** | 데이터베이스 연결 구성 + 연결 후 DB 내용(요구사항/테스트케이스/사용자 수 등) 확인 |
| **사용자 설정** | 사용자 추가, 비밀번호 변경, 삭제, ID·권한 변경 |
| **관리자 설정** | 현재 로그인한 관리자 계정 자신의 ID/비밀번호 변경 |

한 번 로그인하면 탭 전환 시 **다시 로그인할 필요 없습니다**. 로그아웃 버튼으로만 세션이 종료됩니다.

### 최초 로그인 (부트스트랩)

서버를 처음 실행하면 아직 어떤 DB에도 연결되어 있지 않으므로 `users` 테이블이 없습니다. `/admin`에 접속하면 **부트스트랩 로그인**(기본값 `admin` / `admin`, 환경 변수 `ADMIN_CONSOLE_USERNAME` / `ADMIN_CONSOLE_PASSWORD`로 변경 가능)으로 DB 설정 페이지에 들어갑니다.

**저장 및 연결** 후:

- 대상 DB·테이블이 없으면 자동 생성
- `users` 테이블이 새로 만들어지면 기본 관리자 `admin` / `admin` 시드
- 부트스트랩 세션을 DB 세션으로 **자동 전환** — 같은 `admin` / `admin`으로 재입력 없이 세 탭 모두 사용

이미 `users` 테이블이 있는 DB를 연결하면 기존 계정·비밀번호를 그대로 사용합니다.

### 환경 변수로 최초 연결을 미리 구성하기 (선택)

`server/` 디렉터리에 `.env`를 만들고 설정한 뒤 서버를 시작하면 첫 기동 시 자동으로 연결됩니다. 이미 `server/data/connection-config.json`이 있으면 그 값이 우선합니다.

```bash
DB_PROVIDER=mariadb           # mysql | mariadb | postgresql | mssql | sqlite
DB_SERVER=localhost
DB_PORT=3306
DB_DATABASE=reqtrace
DB_USERNAME=root
DB_PASSWORD=changeme

# SQLite3 인 경우
# DB_PROVIDER=sqlite
# DB_SQLITE_PATH=./reqtrace.db
```

`npm run dev`(tsx)는 `.env`를 자동으로 읽지 않으므로:

```bash
node --env-file=.env -r tsx/cjs src/index.ts
# 또는 운영 빌드 후
node --env-file=.env dist/index.js
```

## 사용자 계정 / 권한

| 역할 | 권한 |
|------|------|
| **관리자 (admin)** | `/admin` 관리 콘솔, DB 연결 설정, 사용자 관리, 요구사항·테스트 케이스 조회/변경 |
| **편집자 (editor)** | 요구사항·테스트 케이스 조회 및 **변경**(추가/편집/삭제/자동 생성/실행 기록). DB 설정·사용자 관리 불가 |
| **조회자 (viewer)** | 요구사항·테스트 케이스·대시보드 **조회만**. 변경 시도는 서버에서 거부(403) |

- 편집 API는 JWT뿐 아니라 DB의 **현재 역할**을 확인합니다. 관리자가 조회자→편집자로 바꾸면 클라이언트 새로고침 후 바로 편집 가능합니다.
- React 클라이언트(`http://localhost:5173`) 상단 배지와 요구사항 페이지 배너로 현재 권한을 표시합니다.
- 사용자 등록·권한 변경은 `/admin` → **사용자 설정**에서 관리자만 할 수 있습니다.

## 실행 방법

```bash
# 1) 서버
cd server
npm install
npm run dev      # http://localhost:4000  (관리 콘솔: http://localhost:4000/admin)

# 2) 클라이언트 (다른 터미널)
cd client
npm install
npm run dev      # http://localhost:5173 (API는 :4000 으로 프록시)
```

1. `http://localhost:4000/admin` — 부트스트랩 `admin`/`admin`으로 DB 연결 구성(최초 1회)
2. `http://localhost:5173` — 관리 콘솔에서 만든 계정으로 로그인 (Enter 키로 로그인 가능)

### 포트 4000이 이미 사용 중일 때

`Error: listen EADDRINUSE :::4000` — 이전 서버 프로세스가 남아 있습니다.

```powershell
netstat -ano | findstr ":4000"
taskkill /PID <PID> /F
```

`npm run dev`는 **한 터미널에서 한 번만** 실행하세요.

## 운영 빌드

```bash
cd server && npm run build && node --env-file=.env dist/index.js
cd client && npm run build   # dist/ 를 정적 호스팅
```

## 기능 요약

- **서버 관리 콘솔** (`/admin`): DB 설정 / 사용자 설정 / 관리자 설정. 부트스트랩→DB 연결→자동 세션 전환.
- **인증/권한**: JWT 로그인, 관리자/편집자/조회자 3단계 역할, DB 기준 실시간 권한 검사.
- **요구사항/테스트 케이스**: 추가·편집·삭제(편집자·관리자), 단계(Step) 편집, 실행 기록(Pass/Fail/Blocked/NotRun).
- **테스트 케이스 자동 생성**: 요구사항 제목/설명/우선순위 기반 (데스크톱과 동일한 생성 로직).
- **대시보드**: 우선순위·상태·테스트 실행 결과 파이 차트 (모든 역할 조회 가능).

## 참고

- JWT/부트스트랩 서명 키는 `server/data/secrets.json`에 자동 생성·저장됩니다. `JWT_SECRET` 환경 변수가 있으면 우선 사용합니다.
- DB 접속 비밀번호는 `server/data/connection-config.json` 또는 환경 변수에만 저장되며 API 응답에 노출되지 않습니다.
- `server/data/` 전체는 gitignore 대상입니다. 저장소를 clone한 뒤 서버를 한 번 실행하면 로컬에 생성됩니다.
- 기본 관리자 `admin`/`admin`은 **`users` 테이블이 비어 있을 때만** 시드됩니다. 기존 DB를 다시 연결하면 그 안의 계정을 사용합니다.

## 데스크톱 앱 문서

- [../README.md](../README.md) — 데스크톱 빌드·MSI·기능 개요
- [../UsersGuide.md](../UsersGuide.md) — 데스크톱 사용 가이드
