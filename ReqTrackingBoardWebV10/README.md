# Req Tracking Board

JavaScript 기반 **요구사항 및 테스트 케이스 관리 시스템**입니다. Client-Server 아키텍처로 구성되며, **MariaDB**를 기본 DB로 사용합니다. (MySQL, PostgreSQL, SQLite3도 Setup Wizard에서 선택 가능)

> 사용자 기능 안내는 [UsersGuide.md](./UsersGuide.md)를 참고하세요.

## 주요 기능

| 기능 | 설명 |
|------|------|
| 사용자 관리 | 관리자가 사용자 추가/삭제/수정, 역할 및 권한 부여 |
| 요구사항 관리 | CRUD, Popup 모달 편집, 검색 및 필터 |
| 테스트 케이스 | 요구사항별 TC 관리, 상태·실행 결과 추적 |
| 대시보드 | Pie/Bar 차트로 전체 현황 시각화 |
| Summary Report | 요구사항·테스트 케이스 요약 리포트 |
| Excel Import/Export | `.xlsx` 가져오기 및 내보내기 |
| 개인 테마 | 사용자별 UI 테마 DB 저장 (5종) |
| 다국어 | 한국어 / English |

## 기술 스택

| 구분 | 기술 |
|------|------|
| Frontend | React 18, Vite, Recharts, i18next, React Router |
| Backend | Node.js, Express, JWT |
| Database | **MariaDB** (기본), MySQL, PostgreSQL, SQLite3 |
| 기타 | bcryptjs, xlsx, multer, dotenv |

## 사전 요구사항

- Node.js 18+
- npm
- **MariaDB 10+** (기본, 로컬 설치 권장)
- 또는 MySQL / PostgreSQL / SQLite3

## 빠른 시작

### 1. 앱 실행

```bash
npm run install:all
npm run dev
```

| 서비스 | URL |
|--------|-----|
| 클라이언트 (개발) | http://localhost:5173 |
| API 서버 | http://localhost:3001 |

### 2. 최초 DB 설정 (Setup Wizard)

1. 브라우저에서 http://localhost:5173 접속
2. **admin / admin** 으로 로그인
3. **DB 서버 설정** 화면 — **MariaDB(기본)** 선택, 로컬 접속 정보 입력
4. **연결 테스트** → **저장 후 계속**

| DB 종류 | 기본값 | 필요 입력 |
|---------|--------|----------|
| **MariaDB** | ✅ 기본 | Host, Port (3306), User, Password, Database |
| MySQL | | Host, Port (3306), User, Password, Database |
| PostgreSQL | | Host, Port (5432), User, Password, Database |
| SQLite3 | | 파일 경로 (예: `./data/reqtracking.db`) |

설정은 `server/config/database.json`에 저장됩니다. 테이블과 admin 계정은 자동 생성됩니다.

### 3. 환경 설정 (선택)

```bash
cp server/.env.example server/.env
```

`JWT_SECRET`, `PORT` 등 서버 설정만 `.env`에서 관리합니다. **DB 접속 정보는 Setup Wizard에서 설정**합니다.

### 기본 관리자 계정

| Username | Password | Role |
|----------|----------|------|
| admin | admin | Admin (최초 로그인 시 DB 설정) |

DB 설정 완료 후에도 admin / admin 으로 로그인합니다. 운영 환경에서는 비밀번호를 변경하세요.

## npm 스크립트

| 명령 | 설명 |
|------|------|
| `npm run install:all` | 루트·server·client 의존성 설치 |
| `npm run dev` | 서버 + 클라이언트 동시 실행 (개발) |
| `npm run dev:server` | API 서버만 실행 |
| `npm run dev:client` | Vite 클라이언트만 실행 |
| `npm run seed` | 샘플 사용자·요구사항·TC DB 저장 |
| `npm run build` | 클라이언트 프로덕션 빌드 |
| `npm start` | 프로덕션 서버 실행 (빌드된 client/dist 제공) |

## 환경 변수 (`server/.env`)

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `JWT_SECRET` | (예시값) | JWT 서명 키 (운영 환경에서 반드시 변경) |
| `PORT` | 3001 | API 서버 포트 |

DB 접속 정보는 `server/config/database.json`에 저장됩니다 (Setup Wizard).

## 권한 체계

| role | permission | 가능한 작업 |
|------|------------|------------|
| admin | edit | 모든 기능 + 사용자 관리 |
| user | view | 요구사항·테스트 케이스 **조회만** |
| user | edit | 요구사항·테스트 케이스 **추가·수정·삭제**, Excel Import |

## DB 저장 구조 (MariaDB 기준)

| 테이블 | 저장 내용 |
|--------|----------|
| `users` | 사용자명, 비밀번호(해시), 표시 이름, role, permission, **theme**, is_active |
| `requirements` | req_id, 제목, 설명, 카테고리, 우선순위, 상태, 담당자, 버전, 작성/수정자 |
| `test_cases` | tc_id, requirement_id(FK), 제목, 절차, 기대 결과, 상태, 실행 결과, 실행자, 실행 일시 |

- 스키마 SQL: `server/sql/schema.sql`
- 샘플 Excel: `samples/` (상세: `samples/README.md`)

### seed 데이터 (선택)

```bash
npm run seed
```

| Username | Password | Permission |
|----------|----------|------------|
| admin | admin | Admin |
| viewer1 | viewer1 | View Only |
| editor1 | editor1 | Can Edit |

요구사항 5건, 테스트 케이스 7건이 함께 저장됩니다.

## API 엔드포인트

| Method | Path | 설명 | 권한 |
|--------|------|------|------|
| GET | `/api/setup/status` | DB 설정 상태 | 공개 |
| POST | `/api/setup/test` | DB 연결 테스트 | 공개 (설정 전) |
| POST | `/api/setup/complete` | DB 설정 저장·초기화 | Admin (bootstrap) |
| POST | `/api/auth/login` | 로그인 | 공개 |
| GET | `/api/auth/me` | 현재 사용자 정보 | 인증 |
| GET/POST/PUT/DELETE | `/api/users` | 사용자 CRUD | Admin |
| GET/POST/PUT/DELETE | `/api/requirements` | 요구사항 CRUD | GET: 인증 / CUD: edit |
| GET/POST/PUT/DELETE | `/api/test-cases` | 테스트 케이스 CRUD | GET: 인증 / CUD: edit |
| GET | `/api/dashboard` | 대시보드 통계 | 인증 |
| GET | `/api/reports/summary` | 요약 리포트 | 인증 |
| GET | `/api/settings` | 사용자 설정 조회 | 인증 |
| PUT | `/api/settings/theme` | 개인 테마 저장 | 인증 |
| PUT | `/api/settings/account` | 내 계정(ID·비밀번호) 변경 | 인증 |
| GET | `/api/excel/export` | Excel 내보내기 | 인증 |
| POST | `/api/excel/import` | Excel 가져오기 | edit |
| GET | `/api/health` | 헬스 체크 | 공개 |

## Excel 형식

파일은 **Requirements**, **TestCases** 두 시트를 포함합니다.

**Requirements**

| Req ID | Title | Description | Category | Priority | Status | Owner | Version |
|--------|-------|-------------|----------|----------|--------|-------|---------|

**TestCases**

| TC ID | Req ID | Title | Description | Steps | Expected Result | Status | Result | Executed By | Executed At | Notes |
|-------|--------|-------|-------------|-------|-----------------|--------|--------|-------------|-------------|-------|

- Import 시 동일 ID가 있으면 **업데이트**, 없으면 **신규 생성**
- TestCases의 Req ID는 Requirements에 존재해야 함

## 프로덕션 배포

```bash
npm run build
npm start
```

빌드된 React 앱(`client/dist`)은 Express 서버에서 정적 파일로 제공됩니다.

## 프로젝트 구조

```
ReqTrackingBoardWebV10/
├── client/                 # React 프론트엔드
│   └── src/
│       ├── pages/          # Dashboard, Requirements, TestCases, Users, Reports, Settings
│       ├── components/     # Layout, Modal, Badge
│       ├── context/        # AuthContext, ThemeContext
│       ├── i18n/           # 한국어/English 리소스
│       └── themes/         # UI 테마 정의
├── server/                 # Express API
│   ├── database/           # DB 어댑터 (mysql, postgres, sqlite)
│   ├── config/             # database.json (Setup Wizard 결과)
│   ├── routes/             # auth, setup, users, requirements, ...
│   ├── sql/                # schema.sql (참고용)
│   ├── scripts/            # seed-db.js, generate-samples.js
│   └── .env                # JWT, PORT (git 제외)
├── samples/                # Excel Import 샘플 파일
├── README.md               # 개발/운영 문서 (본 문서)
└── UsersGuide.md           # 사용자 가이드
```

## 유틸리티 스크립트

```bash
# DB 샘플 데이터 저장
npm run seed

# Excel 샘플 파일 재생성
cd server && node scripts/generate-samples.js
```

## 문제 해결

| 증상 | 확인 사항 |
|------|----------|
| `Failed to start server` (DB 연결 실패) | `server/config/database.json` 설정 확인, DB 서버 실행 여부 |
| Setup 화면이 안 나옴 | `server/config/database.json` 삭제 후 재시작, admin/admin 로그인 |
| `ECONNREFUSED` | DB Host/Port 확인, DB 서버 실행 여부 |
| 로그인 실패 | admin/admin 확인, DB에 users 테이블·admin 계정 존재 여부 |
| Excel Import 오류 | 시트 이름(Requirements/TestCases), Req ID 존재 여부 |

## 문서

- [UsersGuide.md](./UsersGuide.md) — 최종 사용자 기능 가이드
- [samples/README.md](./samples/README.md) — 샘플 Excel 파일 설명
