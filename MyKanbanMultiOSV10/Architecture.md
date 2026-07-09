# MyKanban 아키텍처 문서

## 시스템 개요

MyKanban은 Electron 데스크톱 앱과 웹 브라우저 양쪽을 지원하는 단일 코드베이스입니다. 동일한 Express.js 서버가 두 환경에서 공유됩니다.

```
┌─────────────────────────────────────────┐
│           사용자 인터페이스               │
│  ┌──────────────┐  ┌──────────────────┐ │
│  │  Electron    │  │   웹 브라우저     │ │
│  │  BrowserWindow│  │  (localhost:3000)│ │
│  └──────┬───────┘  └────────┬─────────┘ │
└─────────┼────────────────────┼───────────┘
          │                    │
┌─────────▼────────────────────▼───────────┐
│              Express.js 서버              │
│  ┌─────────┐ ┌────────┐ ┌─────────────┐ │
│  │ /api/   │ │ static │ │  /uploads/  │ │
│  │ routes  │ │ files  │ │  (multer)   │ │
│  └────┬────┘ └────────┘ └─────────────┘ │
└───────┼──────────────────────────────────┘
        │
┌───────▼──────────────────────────────────┐
│              Knex.js ORM                 │
│  SQLite3 | MariaDB | MySQL | PG | MSSQL  │
└──────────────────────────────────────────┘
```

## 디렉토리 구조

```
MyKanban/
├── main.js                 # Electron 메인 프로세스
├── preload.js              # Electron preload (window.IS_ELECTRON)
├── server.js               # Express 앱 진입점
├── package.json
├── src/
│   ├── api/                # REST API 라우트 (Express Router)
│   │   ├── auth.js         # 인증, 세션, 프로필
│   │   ├── users.js        # 사용자 CRUD (관리자)
│   │   ├── boards.js       # 프로젝트, 컬럼, 카드, 멤버, 요약
│   │   └── settings.js     # DB 설정 변경
│   ├── db/
│   │   ├── connection.js   # Knex 인스턴스 관리 (hot-reload 지원)
│   │   └── migrate.js      # 스키마 마이그레이션 (hasTable/hasColumn 기반)
│   └── renderer/           # 프론트엔드 (SPA)
│       ├── index.html
│       ├── css/style.css   # CSS Custom Properties (라이트/다크)
│       └── js/
│           ├── lang.js     # i18n 모듈 (ko/en)
│           ├── api.js      # fetch 래퍼, Modal, Toast, 유틸
│           ├── board.js    # BoardView (프로젝트 목록 + 칸반 보드)
│           ├── admin.js    # AdminView (사용자) + SettingsView
│           └── app.js      # App 컨트롤러, 테마/언어 토글, 라우팅
├── data/                   # SQLite DB 파일 (자동 생성)
└── uploads/                # 첨부파일 (자동 생성)
```

## Electron vs 웹 모드 분기

`main.js`에서 Electron 시작 시 userData 경로를 환경변수로 전달합니다.

```js
// main.js
process.env.KANBAN_DATA_PATH = app.getPath('userData');
require('./server.js');
```

```js
// src/db/connection.js
function getDataPath() {
  return process.env.KANBAN_DATA_PATH || './data/';
}
```

| 환경 | 데이터 저장 경로 |
|------|----------------|
| Electron | `%APPDATA%/MyKanban/kanban.db` (Windows) |
| 웹 서버 | `./data/kanban.db` |

## 데이터베이스 레이어

### 지원 클라이언트 (Knex)
| DB | Knex client | npm 패키지 |
|----|-------------|------------|
| SQLite3 | `sqlite3` | `sqlite3@^5.1.7` (N-API, ABI-stable) |
| MariaDB/MySQL | `mysql2` | `mysql2@^3.9.1` |
| PostgreSQL | `pg` | `pg@^8.11.3` |
| MS SQL Server | `mssql` | `mssql@^11.0.0` |

> `sqlite3`은 N-API(Node-API)를 사용하므로 Node.js v24에서 별도 컴파일 없이 동작합니다.

### DB 스키마 (migrate.js)

```
users
  id, username, password, email, display_name,
  role (admin|user), status (active|pending|inactive),
  created_at, updated_at

boards
  id, title, description, owner_id → users.id,
  created_at, updated_at

board_members
  board_id → boards.id, user_id → users.id,
  role (admin|editor|viewer)   ← PK(board_id, user_id)

columns
  id, board_id → boards.id, title, position, created_at

cards
  id, column_id → columns.id, title, description,
  assignee_id → users.id, due_date, color,
  position, created_at, updated_at

attachments
  id, card_id → cards.id, filename (uuid), original_name,
  size, mimetype, created_at
```

### DB Hot-reload
`POST /api/settings/db` 호출 시 `connection.js`의 `updateDbConfig()`가 기존 Knex 인스턴스를 `destroy()` 후 새 설정으로 재생성하고 `runMigrations()`를 실행합니다. 서버 재시작 없이 DB를 전환할 수 있습니다.

## 권한 시스템

### 권한 계층

```
system-admin (시스템 관리자, role='admin 인 users 계정)
    └── owner (프로젝트 생성자, boards.owner_id)
            └── admin (프로젝트 관리자, board_members.role='admin')
                    └── editor (편집자, board_members.role='editor')
                            └── viewer (뷰어, board_members.role='viewer')
```

### 권한 체크 함수 (boards.js)

```js
function canView(role)          { return role !== null; }
function canEdit(role)          { return ['system-admin','owner','admin','editor'].includes(role); }
function canManageMembers(role) { return ['system-admin','owner','admin'].includes(role); }
function canDeleteProject(role) { return ['system-admin','owner'].includes(role); }
```

`requireProjectAccess` 미들웨어가 모든 프로젝트 엔드포인트에 적용되어 `req.projectRole`을 설정합니다.

## REST API 엔드포인트

### 인증 (`/api/auth`)
| Method | Path | 설명 |
|--------|------|------|
| POST | `/login` | 로그인 (세션 발급) |
| POST | `/logout` | 로그아웃 |
| GET | `/me` | 현재 세션 사용자 |
| POST | `/register-request` | 등록 요청 (pending 상태로 생성) |
| POST | `/change-password` | 비밀번호 변경 |
| PUT | `/profile` | 프로필 수정 |

### 사용자 (`/api/users`)
| Method | Path | 설명 | 필요 권한 |
|--------|------|------|----------|
| GET | `/` | 전체 사용자 | system-admin |
| GET | `/active` | 활성 사용자 목록 (담당자 선택용) | 인증 |
| POST | `/` | 사용자 생성 | system-admin |
| PUT | `/:id` | 사용자 수정 | system-admin |
| DELETE | `/:id` | 사용자 삭제 | system-admin |
| PATCH | `/:id/approve` | 등록 승인 | system-admin |
| PATCH | `/:id/reject` | 등록 거부 | system-admin |

### 프로젝트/보드 (`/api/boards`)
| Method | Path | 설명 | 필요 권한 |
|--------|------|------|----------|
| GET | `/` | 내 프로젝트 목록 | 인증 |
| POST | `/` | 프로젝트 생성 | 인증 |
| PUT | `/:id` | 프로젝트 수정 | editor 이상 |
| DELETE | `/:id` | 프로젝트 삭제 | owner/system-admin |
| GET | `/:id/members` | 멤버 목록 | viewer 이상 |
| POST | `/:id/members` | 멤버 추가 | admin 이상 |
| PUT | `/:id/members/:uid` | 멤버 권한 변경 | admin 이상 |
| DELETE | `/:id/members/:uid` | 멤버 제거 | admin 이상 |
| GET | `/:id/columns` | 컬럼+카드 조회 | viewer 이상 |
| POST | `/:id/columns` | 컬럼 추가 | editor 이상 |
| PUT | `/:id/columns/:cid` | 컬럼 수정 | editor 이상 |
| DELETE | `/:id/columns/:cid` | 컬럼 삭제 | editor 이상 |
| POST | `/:id/cards` | 카드 생성 | editor 이상 |
| GET | `/:id/cards/:cid` | 카드 상세 | viewer 이상 |
| PUT | `/:id/cards/:cid` | 카드 수정 | editor 이상 |
| DELETE | `/:id/cards/:cid` | 카드 삭제 | editor 이상 |
| POST | `/:id/cards/:cid/move` | 카드 이동 | editor 이상 |
| GET | `/:id/summary` | Summary/번다운 데이터 | viewer 이상 |
| POST | `/:id/cards/:cid/attachments` | 파일 첨부 | editor 이상 |
| DELETE | `/:id/cards/:cid/attachments/:aid` | 첨부 삭제 | editor 이상 |

### 설정 (`/api/settings`)
| Method | Path | 설명 |
|--------|------|------|
| GET | `/db` | 현재 DB 설정 조회 |
| POST | `/db/test` | DB 연결 테스트 |
| POST | `/db` | DB 설정 적용 |
| POST | `/db/reset` | SQLite3 초기화 |

## 프론트엔드 아키텍처

### 모듈 구조 (전역 객체)

```
window.I18n          lang.js    — 다국어 (LANGS.ko / LANGS.en, localStorage)
window.API           api.js     — fetch 래퍼 (get/post/put/patch/delete/upload)
window.Modal         api.js     — 모달 열기/닫기
window.showToast()   api.js     — 토스트 알림
window.BoardView     board.js   — 프로젝트 목록 + 칸반 보드 + 멤버 + Summary
window.AdminView     admin.js   — 사용자 관리
window.SettingsView  admin.js   — DB 설정, 프로필, 비밀번호
window.App           app.js     — 라우팅, 테마, 언어 토글, 부트스트랩
```

### SPA 라우팅
URL을 변경하지 않고 `#main-content` DOM 교체 방식으로 뷰를 전환합니다.

```
App.showLogin()    → 로그인 화면
App.showBoards()   → BoardView.renderBoardList()
App.showAdmin()    → AdminView.render()
App.showSettings() → SettingsView.render()
BoardView.openBoard(id) → 칸반 보드 뷰
BoardView.showSummary() → 프로젝트 요약 뷰
```

### 테마 시스템
CSS Custom Properties 기반. `document.documentElement.dataset.theme = 'dark'` 설정 시 `[data-theme="dark"]` 셀렉터의 변수가 override됩니다. `localStorage['kanban-theme']`에 저장됩니다.

### i18n
`I18n.t('key')` 함수로 현재 언어의 문자열을 반환합니다. `localStorage['kanban-lang']`에 저장됩니다. 언어 전환 시 현재 뷰를 즉시 리렌더링합니다.

## 세션 인증

`express-session` + MemoryStore 사용. 세션에 `userId`, `username`, `role` 저장.

> 프로덕션 환경에서는 `SECRET` 환경변수 설정 및 Redis 등 외부 세션 스토어 사용을 권장합니다.

## 번다운 차트 알고리즘

`GET /api/boards/:id/summary`는 최근 30일의 날짜별 `{ created, completed }` 카운트를 반환합니다. 프론트엔드에서 누적합을 계산하여 "남은 카드 = 누적 생성 - 누적 완료"로 번다운 선을 그립니다.

마지막 컬럼(position 최대값)을 "완료" 컬럼으로 간주합니다.
