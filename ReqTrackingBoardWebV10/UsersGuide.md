# Req Tracking Board — 사용자 가이드 (Users Guide)

요구사항 추적 보드 사용 방법을 안내합니다.

---

## 목차

1. [시작하기](#1-시작하기)
2. [최초 DB 설정](#2-최초-db-설정)
3. [화면 구성](#3-화면-구성)
4. [대시보드](#4-대시보드)
5. [요구사항 관리](#5-요구사항-관리)
6. [테스트 케이스 관리](#6-테스트-케이스-관리)
7. [리포트 및 Excel](#7-리포트-및-excel)
8. [설정 (테마·언어)](#8-설정-테마언어)
9. [사용자 관리 (관리자)](#9-사용자-관리-관리자)
10. [권한 안내](#10-권한-안내)
11. [자주 묻는 질문](#11-자주-묻는-질문)

---

## 1. 시작하기

### 접속

1. 웹 브라우저에서 애플리케이션 주소로 접속합니다.
   - 개발 환경: http://localhost:5173
2. **로그인** 화면에서 **admin / admin** 으로 로그인합니다.

### 기본 관리자 계정

| 사용자명 | 비밀번호 | 설명 |
|----------|----------|------|
| admin | admin | 최초 설치 시 DB 설정 후 시스템 관리자로 사용 |

> 운영 환경에서는 반드시 비밀번호를 변경하세요.

---

## 2. 최초 DB 설정

**처음 실행 시** admin으로 로그인하면 **DB 서버 설정** 화면이 표시됩니다.

### 지원 DB

| DB | 설명 |
|----|------|
| **MariaDB** | **기본 DB** — 로컬 MariaDB 서버 (포트 3306) |
| MySQL | MySQL 서버 (포트 3306) |
| PostgreSQL | PostgreSQL 서버 (포트 5432) |
| SQLite3 | 파일 기반 DB (별도 서버 불필요) |

Setup 화면은 **MariaDB**가 기본 선택되어 있습니다.

### 설정 절차

1. **DB 종류** 선택 (기본: **MariaDB**)
2. 접속 정보 입력
   - MariaDB/MySQL/PostgreSQL: Host, Port, User, Password, Database Name
   - SQLite3: DB 파일 경로 (예: `./data/reqtracking.db`)
3. **연결 테스트** — DB 연결 확인
4. **저장 후 계속** — 테이블 자동 생성, 대시보드로 이동

> DB와 테이블은 자동 생성됩니다. Database Name(예: `reqtracking`)은 새로 만들어도 됩니다.

### 샘플 계정 (seed 실행 후)

| 사용자명 | 비밀번호 | 권한 |
|----------|----------|------|
| viewer1 | viewer1 | 보기 전용 |
| editor1 | editor1 | 편집 가능 |

---

## 3. 화면 구성

로그인 후 **왼쪽 사이드바**에서 메뉴를 선택합니다.

| 메뉴 | 설명 | 필요 권한 |
|------|------|----------|
| 📊 대시보드 | 전체 현황 차트 | 모든 사용자 |
| 📋 요구사항 | 요구사항 목록·편집 | 조회: 모든 / 편집: edit 이상 |
| 🧪 테스트 케이스 | TC 목록·편집 | 조회: 모든 / 편집: edit 이상 |
| 👥 사용자 | 사용자 관리 | **관리자만** |
| 📄 리포트 | 요약 리포트, Excel | Import: edit 이상 |
| ⚙️ 설정 | 테마, 언어 | 모든 사용자 |

하단에서 **로그아웃**할 수 있습니다.

---

## 4. 대시보드

프로젝트 전체 상태를 한눈에 확인합니다.

### 표시 정보

- **전체 요구사항 수** — 등록된 요구사항 총 개수
- **전체 테스트 케이스 수** — 등록된 TC 총 개수
- **통과율** — Passed 상태 TC 비율
- **테스트 커버리지** — 테스트가 연결된 요구사항 비율

### 차트

| 차트 | 내용 |
|------|------|
| 상태별 요구사항 | Draft / Active / Approved / Deprecated |
| 상태별 테스트 케이스 | Not Run / In Progress / Passed / Failed / Blocked |
| 우선순위별 요구사항 | Low / Medium / High / Critical |
| 카테고리별 요구사항 | Functional, Security, Performance 등 |

### 최근 활동

최근 수정된 요구사항 5건이 표시됩니다.

---

## 5. 요구사항 관리

### 목록 보기

- **검색**: Req ID, 제목, 설명으로 검색
- **필터**: 상태(Draft, Active, Approved, Deprecated)별 필터
- 각 행에 연결된 **테스트 케이스 수**, **통과/실패** 건수 표시

### 요구사항 추가 (편집 권한 필요)

1. **+ 요구사항 추가** 버튼 클릭
2. **Popup 모달**에서 정보 입력

| 항목 | 설명 | 필수 |
|------|------|------|
| Req ID | 요구사항 고유 ID (예: REQ-001) | ✅ |
| 제목 | 요구사항 제목 | ✅ |
| 설명 | 상세 설명 | |
| 카테고리 | General, Functional, Performance, Security, UI/UX, Integration | |
| 우선순위 | Low, Medium, High, Critical | |
| 상태 | Draft, Active, Approved, Deprecated | |
| 담당자 | Owner 이름 | |
| 버전 | 버전 번호 (예: 1.0) | |

3. **저장** 클릭

### 요구사항 편집

1. 목록에서 **편집** 버튼 클릭
2. Popup 모달에서 내용 수정 후 **저장**

### 요구사항 삭제

1. **삭제** 버튼 클릭
2. 확인 메시지에서 **확인**
3. 해당 요구사항에 연결된 **테스트 케이스도 함께 삭제**됩니다

---

## 6. 테스트 케이스 관리

요구사항별로 테스트 케이스(TC)를 등록하고 실행 결과를 관리합니다.

### 목록 보기

- **요구사항 필터**: 특정 요구사항의 TC만 표시
- **상태 필터**: Not Run, In Progress, Passed, Failed, Blocked

### 테스트 케이스 추가 (편집 권한 필요)

1. **+ 테스트 케이스 추가** 클릭 (요구사항이 1건 이상 있어야 함)
2. Popup 모달에서 입력

| 항목 | 설명 | 필수 |
|------|------|------|
| TC ID | 테스트 케이스 고유 ID | ✅ |
| 요구사항 | 연결할 요구사항 선택 | ✅ |
| 제목 | TC 제목 | ✅ |
| 설명 | TC 설명 | |
| 테스트 절차 | 실행 Steps | |
| 기대 결과 | Expected Result | |
| 상태 | Not Run / In Progress / Passed / Failed / Blocked | |
| 실행 결과 | Result 텍스트 | |
| 비고 | Notes | |

3. **저장** 클릭

> 상태를 Passed, Failed, Blocked로 변경하면 **실행 일시**가 자동 기록됩니다.

### TC 상태 의미

| 상태 | 의미 |
|------|------|
| Not Run | 아직 실행하지 않음 |
| In Progress | 실행 중 |
| Passed | 테스트 통과 |
| Failed | 테스트 실패 |
| Blocked | 실행 차단 (환경·의존성 문제 등) |

---

## 7. 리포트 및 Excel

### Summary Report 생성

1. **리포트** 메뉴 이동
2. **리포트 생성** 버튼 클릭
3. 요구사항·테스트 케이스 요약 테이블 확인

리포트에는 다음이 포함됩니다.

- 생성 일시
- 요구사항/TC 총 개수
- 상태별 통계
- 요구사항별 TC 통과/실패 현황
- 전체 TC 목록 및 실행 결과

### Excel 내보내기

1. **Excel 내보내기** 버튼 클릭
2. `requirements_export.xlsx` 파일 다운로드

### Excel 가져오기 (편집 권한 필요)

1. **Excel 가져오기** 버튼 클릭
2. `.xlsx` 파일 선택
3. Import 결과 메시지 확인 (저장된 요구사항·TC 건수)

#### Excel 파일 형식

**Requirements** 시트

| Req ID | Title | Description | Category | Priority | Status | Owner | Version |
|--------|-------|-------------|----------|----------|--------|-------|---------|

**TestCases** 시트

| TC ID | Req ID | Title | Description | Steps | Expected Result | Status | Result | Executed By | Executed At | Notes |
|-------|--------|-------|-------------|-------|-----------------|--------|--------|-------------|-------------|-------|

- 동일 Req ID / TC ID가 있으면 **업데이트**, 없으면 **신규 생성**
- 샘플 파일: 프로젝트 `samples/` 폴더 (`sample_auth.xlsx`, `sample_ecommerce.xlsx` 등)

---

## 8. 설정 (테마·언어·계정)

**설정** 메뉴에서 개인 환경을 변경합니다.

### 내 계정

모든 사용자(관리자 포함)가 **설정 → 내 계정**에서 다음을 변경할 수 있습니다.

| 항목 | 설명 |
|------|------|
| 사용자명 | 로그인 ID |
| 표시 이름 | 화면에 표시되는 이름 |
| 현재 비밀번호 | 변경 시 반드시 입력 |
| 새 비밀번호 | 변경할 경우 입력 (미입력 시 유지) |

변경 내용은 **DB에 저장**됩니다. 관리자가 ID 또는 비밀번호를 변경하면 **기본 admin / admin 으로는 더 이상 로그인할 수 없습니다.**

> 최초 설치 후 보안을 위해 admin / admin 을 반드시 변경하는 것을 권장합니다.

### 테마

5가지 UI 테마 중 선택합니다. **사용자 계정에 저장**되므로 다른 PC에서 로그인해도 동일한 테마가 적용됩니다.

| 테마 | 설명 |
|------|------|
| Default Blue | 기본 블루 |
| Dark Mode | 다크 모드 |
| Emerald Green | 에메랄드 그린 |
| Sunset Orange | 선셋 오렌지 |
| Royal Purple | 로얄 퍼플 |

테마 카드를 클릭하면 즉시 적용되고 DB에 저장됩니다.

### 언어

- 🇰🇷 **한국어**
- 🇺🇸 **English**

언어는 브라우저에 저장됩니다 (현재 세션·기기 기준).

---

## 9. 사용자 관리 (관리자)

**관리자(admin)**만 **사용자** 메뉴에 접근할 수 있습니다.

### 사용자 추가

1. **+ 사용자 추가** 클릭
2. 정보 입력 후 **저장**

| 항목 | 설명 |
|------|------|
| 사용자명 | 로그인 ID (중복 불가) |
| 표시 이름 | 화면에 표시되는 이름 |
| 비밀번호 | 초기 비밀번호 |
| 역할 | Admin / User |
| 권한 | View Only (보기) / Can Edit (편집) |

### 사용자 편집

- 표시 이름, 역할, 권한, 활성 여부 변경
- 비밀번호 변경 (비워두면 기존 유지)

### 사용자 삭제

- **admin** 계정과 **본인 계정**은 삭제할 수 없습니다.

---

## 10. 권한 안내

### 역할 (Role)

| Role | 설명 |
|------|------|
| **admin** | 모든 메뉴 접근, 사용자 관리, 데이터 편집 |
| **user** | 사용자 관리 제외, permission에 따라 조회/편집 |

### 권한 (Permission)

| Permission | 요구사항 | 테스트 케이스 | Excel Import |
|------------|---------|-------------|--------------|
| **view** | 조회만 | 조회만 | ❌ |
| **edit** | 추가·수정·삭제 | 추가·수정·삭제 | ✅ |

보기 전용 사용자에게는 **추가·편집·삭제** 버튼이 표시되지 않습니다.

---

## 11. 자주 묻는 질문

### Q. DB 설정 화면을 다시 보려면?

`server/config/database.json` 파일을 삭제하고 서버를 재시작한 뒤 admin/admin으로 로그인합니다. (기존 DB 데이터는 유지되지만 앱 연결 설정만 초기화됩니다.)

### Q. 로그인이 되지 않습니다.

- 사용자명·비밀번호를 확인하세요.
- 계정이 **비활성(is_active=0)** 상태인지 관리자에게 문의하세요.

### Q. 요구사항을 추가할 수 없습니다.

- **edit** 권한 또는 **admin** 계정인지 확인하세요.
- view 권한은 조회만 가능합니다.

### Q. Excel Import 시 TC가 저장되지 않습니다.

- TestCases 시트의 **Req ID**가 Requirements에 존재하는지 확인하세요.
- TC ID, Req ID, Title이 비어 있지 않은지 확인하세요.

### Q. admin / admin 으로 로그인이 안 됩니다.

관리자가 **설정 → 내 계정**에서 ID 또는 비밀번호를 변경한 경우, 기본 `admin / admin`은 더 이상 사용할 수 없습니다. 변경한 계정 정보로 로그인하세요.

### Q. 테마가 다른 PC에서 유지되지 않습니다.

- 테마는 **사용자 계정(DB)**에 저장됩니다. 동일 계정으로 로그인했는지 확인하세요.
- 언어 설정은 브라우저 localStorage에 저장됩니다.

### Q. 요구사항을 삭제하면 테스트 케이스는 어떻게 되나요?

- 연결된 테스트 케이스가 **함께 삭제**됩니다. 삭제 전 백업(Excel Export)을 권장합니다.

---

## English Summary

**Req Tracking Board** is a web application for managing requirements and test cases.

- **Login** with username/password (default: admin/admin)
- **Dashboard** — charts and KPIs
- **Requirements** — add/edit/delete via popup modal (edit permission required)
- **Test Cases** — linked to requirements, track status and results
- **Reports** — summary report, Excel import/export
- **Settings** — personal theme (saved per user in DB), language (KO/EN)
- **Users** — admin only: manage accounts and permissions (view/edit)

For installation and technical details, see [README.md](./README.md).
