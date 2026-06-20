# ReqTrace Web

ReqTrace 데스크톱 앱과는 완전히 독립적인 웹 애플리케이션입니다. MySQL, MariaDB, PostgreSQL, SQLite3, MS SQL Server에 직접 연결하여 요구사항과 테스트 케이스를 조회/편집하고, 대시보드로 현황을 확인할 수 있습니다.

## 구조

- `server/` — Node.js + Express + TypeScript REST API. Knex로 5개 DB 종류를 모두 지원합니다.
- `client/` — React + Vite + TypeScript 프론트엔드.

## 실행 방법

```bash
# 1) 서버
cd server
npm install
npm run dev      # http://localhost:4000

# 2) 클라이언트 (다른 터미널)
cd client
npm install
npm run dev       # http://localhost:5173 (API는 자동으로 :4000 으로 프록시됨)
```

브라우저에서 `http://localhost:5173` 접속 후 "DB 연결" 메뉴에서 데이터베이스 정보를 입력하고 연결하세요. 데이터베이스와 테이블이 없으면 처음 연결 시 자동으로 생성됩니다.

## 운영 빌드

```bash
cd server && npm run build && npm start
cd client && npm run build   # dist/ 를 정적 호스팅하거나 server에 별도로 서빙
```

## 참고

- 연결 정보(비밀번호 포함)는 서버 프로세스 메모리에만 보관되며 디스크에 저장되지 않습니다. 서버를 재시작하면 다시 연결해야 합니다.
- 이 웹앱은 자체 테이블 스키마(`requirements`, `test_cases`, `test_steps`, `test_runs`)를 사용하며, 데스크톱 ReqTrace 앱의 스키마와는 별개입니다.
