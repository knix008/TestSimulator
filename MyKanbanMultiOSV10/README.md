# MyKanban

멀티 플랫폼 칸반 보드 애플리케이션입니다. Electron(Windows/Linux/macOS)과 웹 브라우저에서 동시에 동작하며, 복수의 프로젝트와 팀원 관리를 지원합니다.

## 주요 기능

- **멀티 플랫폼**: Electron 데스크톱 앱 + 웹 브라우저 모두 지원
- **프로젝트 관리**: 복수의 칸반 프로젝트 생성 및 관리
- **권한 시스템**: 시스템관리자 > 소유자 > 프로젝트관리자 > 편집자 > 뷰어
- **다국어 지원**: 한국어 / 영어 (토글 전환)
- **라이트/다크 테마**
- **다중 DB 지원**: SQLite3(기본) / MariaDB / MySQL / PostgreSQL / MS SQL Server
- **칸반 보드**: 컬럼 및 카드 관리, 20가지 배경색(프리셋) + 사용자 정의 색상
- **드래그 앤 드롭**: 전체 컬럼 영역 드롭 타겟, 정확한 삽입 위치 인디케이터
- **카드 기능**: 제목, 설명, 담당자, 마감일, 파일 첨부(더블클릭으로 시스템 앱 열기), 배경색
- **번다운 차트**: 프로젝트 진행 현황 Summary + Chart.js 번다운 차트
- **Undo/Redo**: 카드/컬럼 생성·수정·삭제·이동·색상 변경 모두 취소/재실행
- **컨텍스트 메뉴**: 보드·컬럼·카드 우클릭 메뉴
- **커스텀 메뉴바**: Electron 전용 상단 메뉴 (파일/편집/보기)
- **상태바**: 현재 작업 상태 표시
- **샘플 프로젝트**: `sample/sample.kprj` 포함 (파일 → 샘플 열기)

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
| 데스크톱 | Electron 28 |
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
├── main.js              # Electron 진입점 + IPC 핸들러
├── preload.js           # Electron preload (contextBridge)
├── server.js            # Express 서버
├── sample/
│   └── sample.kprj      # 샘플 프로젝트 파일
├── src/
│   ├── api/             # REST API 라우트
│   │   ├── auth.js
│   │   ├── users.js
│   │   ├── boards.js    # 보드·컬럼·카드·첨부·내보내기
│   │   └── settings.js
│   ├── db/
│   │   ├── connection.js  # Knex 연결 관리 (hot-reload)
│   │   └── migrate.js     # DB 스키마 자동 마이그레이션
│   └── renderer/
│       ├── index.html
│       ├── css/style.css
│       └── js/
│           ├── lang.js    # 다국어 (i18n)
│           ├── api.js     # fetch 래퍼, Modal, Toast
│           ├── board.js   # 보드/프로젝트 뷰 + 드래그앤드롭
│           ├── history.js # Undo/Redo 모듈
│           ├── admin.js   # 사용자/설정 관리
│           ├── report.js  # 보고서 내보내기
│           └── app.js     # 앱 컨트롤러
├── data/                # SQLite DB 파일 저장 (자동 생성)
└── uploads/             # 첨부파일 저장 (자동 생성)
```

## 지원 데이터베이스

- **SQLite3** (기본값 — 설정 불필요)
- **MariaDB**
- **MySQL**
- **PostgreSQL**
- **MS SQL Server**

DB 설정은 앱 내 **설정 > 데이터베이스 설정**에서 변경할 수 있습니다.

## 프로젝트 파일 (.kprj)

`.kprj` 파일로 프로젝트를 내보내고 가져올 수 있습니다.
- **내보내기**: 보드 화면 우측 상단 내보내기 버튼 또는 파일 메뉴
- **가져오기**: 파일 메뉴 → 프로젝트 열기, 또는 `.kprj` 파일을 앱에 끌어다 놓기
