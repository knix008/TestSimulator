# MyKanban

멀티 플랫폼 칸반 보드 애플리케이션입니다. Electron(Windows/Linux/macOS)과 웹 브라우저에서 동시에 동작하며, 복수의 프로젝트와 팀원 관리를 지원합니다.

## 주요 기능

- **멀티 플랫폼**: Electron 데스크톱 앱 + 웹 브라우저 모두 지원
- **프로젝트 관리**: 복수의 칸반 프로젝트 생성 및 관리
- **권한 시스템**: 시스템관리자 > 소유자 > 프로젝트관리자 > 편집자 > 뷰어
- **다국어 지원**: 한국어 / 영어 (토글 전환)
- **라이트/다크 테마**
- **다중 DB 지원**: SQLite3(기본) / MariaDB / MySQL / PostgreSQL / MS SQL Server
- **카드 기능**: 제목, 설명, 담당자, 마감일, 파일 첨부, 배경색 설정
- **번다운 차트**: 프로젝트 진행 현황 Summary + Chart.js 번다운 차트
- **드래그 앤 드롭**: 카드 이동

## 빠른 시작

### 웹 서버로 실행
```bash
npm install
npm run start:web
# → http://localhost:3000
```

### Electron 앱으로 실행
```bash
npm install
npm start
```

### 초기 로그인
- **아이디**: `admin`
- **비밀번호**: `admin`

> 첫 로그인 후 설정 > 내 프로필에서 비밀번호를 변경하세요.

## 기술 스택

| 영역 | 기술 |
|------|------|
| 데스크톱 | Electron |
| 백엔드 | Node.js + Express.js |
| ORM | Knex.js |
| 기본 DB | SQLite3 (N-API) |
| 인증 | express-session + bcryptjs |
| 파일 업로드 | Multer |
| 프론트엔드 | Vanilla JS + CSS (SPA) |
| 차트 | Chart.js (CDN) |

## 디렉토리 구조

```
MyKanban/
├── main.js              # Electron 진입점
├── preload.js           # Electron preload
├── server.js            # Express 서버
├── src/
│   ├── api/             # REST API 라우트
│   │   ├── auth.js
│   │   ├── users.js
│   │   ├── boards.js
│   │   └── settings.js
│   ├── db/
│   │   ├── connection.js  # Knex 연결 관리
│   │   └── migrate.js     # DB 스키마 마이그레이션
│   └── renderer/
│       ├── index.html
│       ├── css/style.css
│       └── js/
│           ├── lang.js    # 다국어 (i18n)
│           ├── api.js     # fetch 래퍼
│           ├── board.js   # 보드/프로젝트 뷰
│           ├── admin.js   # 사용자/설정 관리
│           └── app.js     # 앱 컨트롤러
├── data/                # SQLite DB 파일 저장 (자동 생성)
└── uploads/             # 첨부파일 저장 (자동 생성)
```

## 지원 데이터베이스

- **SQLite3** (기본값 — 설정 불필요)
- **MariaDB** (원격 기본)
- **MySQL**
- **PostgreSQL**
- **MS SQL Server**

DB 설정은 앱 내 **설정 > 데이터베이스 설정**에서 변경할 수 있습니다.
