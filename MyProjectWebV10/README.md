# MyProject Web

웹 기반 과제 일정 관리 프로그램 (MS Project 유사 UI)

Windows 버전 [`MyProjectWinV10`](../MyProjectWinV10)과 동일한 `mp_*` 테이블 구조·일정 계산(CPM, 근무일)을 사용합니다.

**사용 방법은 [UsersGuide.md](./UsersGuide.md)를 참고하세요.**

## 주요 기능

| 기능 | 설명 |
|------|------|
| Gantt 차트 | Frappe Gantt 기반, 드래그·진행률·의존성 연결선 |
| 작업 그리드 | 목록 편집, 계층(들여쓰기/내어쓰기), 요약(Summary) 작업 |
| 주요 경로 | CPM 기반 Critical Path 표시 |
| 프로젝트 일정 | 프로젝트명·시작일·주간 근무일 (DB 저장, 일정 재계산) |
| Gantt 표시 설정 | 사용자·프로젝트별 연결선 스타일 (`mp_user_project_view_settings`) |
| 권한 | 읽기 / 수정 / 관리자, `mp_users` |

## 기술 스택

| 구분 | 기술 |
|------|------|
| Frontend | React, TypeScript, Vite, Frappe Gantt |
| Backend | Node.js, Express, Prisma |
| Database | MariaDB (기본), MySQL, SQLite, PostgreSQL, SQL Server |

기본 데이터베이스 이름: **`myproject`**

## 사전 요구사항

- Node.js 20+
- MariaDB 10.6+ (기본)

## 빠른 시작

```bash
npm install
cp .env.example .env
```

`.env`에서 MariaDB 연결 정보를 설정합니다.

```env
DB_PROVIDER=mariadb
DB_NAME=myproject
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DATABASE_URL="mysql://root:your_password@localhost:3306/myproject"
```

스키마 적용:

```bash
npm run db:generate
npm run db:push
```

실행:

```bash
npm run dev
```

- API: http://localhost:3001
- Web UI: http://localhost:5173

최초 로그인: **admin / admin**

## 데이터 저장 구조

| 저장 위치 | 내용 |
|-----------|------|
| MariaDB `myproject` | 프로젝트·일정(`mp_*`), 사용자(`mp_users`), 사용자별 Gantt 표시 설정 |
| `server/data/app-settings.json` | DB 연결 설정만 (Git 제외) |

### 기존 DB 사용 (권장)

**이미 `myproject` DB가 있으면** 새로 만들지 않고 그 DB에 연결합니다.

1. `.env`에 기존 MariaDB 접속 정보 설정
2. `admin`으로 로그인 → **DB 설정** → DB 이름 `myproject` 입력
3. **연결 테스트** 후 **저장 및 적용**

- 기존 일정·프로젝트 데이터는 **유지**됩니다.
- 테이블이 일부 없으면 `mp_*` 스키마만 **추가**됩니다 (`prisma db push`).
- `mp_users`가 비어 있을 때만 기본 관리자(`admin`)가 생성됩니다.

DB가 **없을 때만** 저장 시 `myproject`를 새로 생성합니다.

## npm 스크립트

| 명령 | 설명 |
|------|------|
| `npm run dev` | API + 웹 UI 동시 실행 |
| `npm run build` | 서버·클라이언트 빌드 |
| `npm run db:generate` | Prisma Client 생성 |
| `npm run db:push` | 스키마를 DB에 반영 |
| `npm run db:migrate` | Prisma 마이그레이션 (개발) |
| `npm run db:seed` | 시드 데이터 (있는 경우) |

### `db:push`가 필요한 경우

Prisma 스키마(`server/prisma/schema.prisma`)와 실제 DB 테이블을 맞출 때 사용합니다.

- 최초 설치 후
- 스키마 변경 후 (새 테이블·컬럼 추가 등)
- DB 설정 UI의 **저장 및 적용**이 성공하면 앱이 내부에서 자동 적용하기도 합니다.

## MariaDB 인증 오류

`auth_gssapi_client` 오류가 나면 MariaDB에서:

```sql
ALTER USER 'root'@'localhost' IDENTIFIED VIA mysql_native_password USING PASSWORD('your_password');
FLUSH PRIVILEGES;
```

`.env`의 `DATABASE_URL` 비밀번호도 동일하게 맞춥니다.

## 다른 DB 사용

`.env`의 `DB_PROVIDER`를 변경하고 `server/prisma/schema.prisma`의 `provider`를 맞춘 뒤 `npm run db:generate`를 실행합니다.

| Provider | Prisma provider |
|----------|-----------------|
| mariadb | mysql |
| mysql | mysql |
| sqlite | sqlite |
| postgresql | postgresql |
| sqlserver | sqlserver |

## 프로젝트 구조

```
MyProjectWebV10/
├── client/                      # React 프론트엔드
│   └── src/
│       ├── components/          # UI (GanttChart, TaskGrid, ProjectView …)
│       ├── config/              # Gantt 레이아웃·표시 설정
│       └── utils/               # CPM, 근무일, 일정·계층 모델
├── server/
│   ├── prisma/                  # DB 스키마·시드
│   ├── src/
│   │   ├── routes/              # API 라우트
│   │   └── services/            # 비즈니스 로직
│   └── data/                    # 로컬 DB 설정 (gitignore)
├── .env.example
├── README.md                    # 개발·설치 안내 (이 문서)
├── UsersGuide.md                # 사용자 가이드
└── package.json
```

## Win 버전과의 관계

- 동일 DB(`myproject`)를 사용하면 Windows 앱과 웹 앱이 **같은 프로젝트·일정**을 공유합니다.
- 웹에서 **새로고침**으로 Win 쪽 변경을 불러올 수 있습니다.
- 새 프로젝트 생성은 Win 프로그램 사용을 권장합니다(툴바 안내).

## 문서

- [UsersGuide.md](./UsersGuide.md) — 로그인, Gantt 편집, 계층·의존성, 프로젝트/표시 설정, 관리자 기능
