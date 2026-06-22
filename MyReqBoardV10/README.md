# MyReqBoard

요구사항과 그에 연결된 테스트케이스를 관리하는 사내용 웹 도구입니다. Next.js(JavaScript) + MySQL/MariaDB + Prisma로 구성되어 있습니다.

## 주요 기능
- 요구사항 CRUD, Category별 자동 코드 부여(예: UI-01) — 삭제/카테고리 변경 시 코드가 빈틈없이 재정렬됩니다.
- 요구사항에 연결된 테스트케이스 CRUD
- 사용자 관리 및 역할 기반 권한 (ADMIN/EDITOR/VIEWER)
- 로그인 화면에서 계정 등록 요청 → 관리자가 사용자 관리 화면에서 승인/거절
- 각 사용자는 내 계정 화면에서 아이디/비밀번호/연락처 정보를 직접 변경, 관리자는 사용자 비밀번호를 초기화할 수 있음
- 요구사항 Excel 가져오기(업서트) / 내보내기(요구사항 + 연결된 테스트케이스, 2개 시트)
- DB 접속 정보는 `.env`에 저장하지 않고, 서버 실행 중에만 메모리에 보관 (재시작 시 다시 입력)

## 기술 스택
- Next.js 14 (App Router, JavaScript)
- Prisma ORM (MySQL/MariaDB 호환 — `provider = "mysql"`이 MariaDB 접속도 지원합니다)
- NextAuth.js (Credentials, JWT 세션)
- exceljs (Excel 읽기/쓰기)

## 설치 및 실행

```bash
npm install
cp .env.example .env   # NEXTAUTH_SECRET을 임의의 랜덤 문자열로 바꿔주세요
npx prisma generate
npm run dev
```

`DATABASE_URL`은 `.env`에 두지만 실제 접속에는 사용되지 않는 더미 값입니다(`prisma generate`가 스키마를 읽기 위한 placeholder). 실제 DB 접속은 앱에서 직접 합니다.

## 최초 실행 흐름
1. 브라우저에서 `http://localhost:3000` 접속 → DB에 연결되어 있지 않으므로 자동으로 `/connect-db` 화면으로 이동합니다.
2. MySQL/MariaDB 호스트/포트/데이터베이스명/사용자/비밀번호를 입력하고 "DB 접속"을 누릅니다.
3. 테이블이 없으면 "테이블 생성/동기화" 버튼으로 스키마를 생성합니다. 이때 사용자 테이블이 비어 있으면 기본 계정 `admin` / `admin`이 자동으로 만들어집니다.
4. 로그인 후 내 계정 화면에서 반드시 비밀번호를 변경하세요.

이 접속 정보는 서버 프로세스가 실행 중인 동안에만 메모리에 유지됩니다. 서버를 재시작하면 다시 `/connect-db`에서 입력해야 합니다(이미 만든 DB/테이블은 그대로 남아 있으므로 같은 정보로 다시 접속만 하면 됩니다). 접속 이후에는 관리자가 설정 화면(`/settings`)에서 다른 DB로 재접속할 수 있습니다.

## 권한
- **ADMIN**: 사용자 관리(생성/역할변경/비활성화/비밀번호 초기화), 가입 요청 승인/거절, DB 설정, EDITOR의 모든 권한
- **EDITOR**: 요구사항/테스트케이스 CRUD, Excel 가져오기/내보내기
- **VIEWER**: 조회 및 내보내기만 가능

## Excel 가져오기 형식
헤더 행에 다음 컬럼을 포함해야 합니다: `code, title, description, category, priority, status`
(`code`가 이미 있으면 해당 요구사항을 업데이트, 없으면 새로 생성합니다. `priority`: LOW/MEDIUM/HIGH, `status`: DRAFT/APPROVED/IN_PROGRESS/DONE)

샘플 업로드 파일: [`sample/sample_requirements.xlsx`](sample/sample_requirements.xlsx) — `/import` 화면에서 바로 업로드해 동작을 확인할 수 있습니다.

## Excel 내보내기 형식
- 시트1 `Requirements`: 요구사항 전체 필드
- 시트2 `TestCases`: 테스트케이스 전체 필드 + `requirementCode` 컬럼(연결된 요구사항 코드)

요구사항 목록 화면에서 체크박스로 선택 후 "선택 내보내기"를 누르면 선택된 항목만 내보낼 수 있습니다.
