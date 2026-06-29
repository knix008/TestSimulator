# Sample Excel Files

Import 테스트용 샘플 Excel 파일입니다. **Requirements(요구사항)** 페이지에서 **Excel 가져오기** 버튼으로 업로드할 수 있습니다.

## 사용 방법

1. 상단에서 **프로젝트를 선택**합니다. (프로젝트가 없으면 먼저 생성)
2. **Requirements** 페이지 → **Excel 가져오기** → `samples/` 폴더의 `.xlsx` 파일 선택
3. 가져오기 결과 메시지에서 요구사항/테스트 케이스 건수를 확인합니다.
4. 샘플 파일의 Owner(담당자)는 가상 이름이므로, 프로젝트 참여자가 아니어도 **그대로 저장**됩니다. (경고 메시지가 표시될 수 있음)

| 파일 | 설명 | 요구사항 | 테스트 케이스 |
|------|------|---------|-------------|
| `sample_auth.xlsx` | 로그인/로그아웃/세션 관리 | 4건 | 5건 |
| `sample_ecommerce.xlsx` | 이커머스 (검색, 장바구니, 주문) - 한국어 | 5건 | 6건 |
| `sample_security.xlsx` | 보안 (HTTPS, SQL Injection, XSS, RBAC) | 5건 | 5건 |
| `sample_performance.xlsx` | 성능 (로드 시간, API 응답, 동시 사용자) | 4건 | 4건 |
| `sample_uiux.xlsx` | UI/UX (반응형, 다크모드, 다국어) | 5건 | 3건 |
| `sample_requirements_only.xlsx` | 요구사항만 (TC 없음) | 3건 | 0건 |

## Excel 시트 구조

- **Requirements**: Req ID, Title, Description, Category, Priority, Status, Owner, Version
- **TestCases**: TC ID, Req ID, Title, Description, Steps, Expected Result, Status, Result, Executed By, Executed At, Notes

## 재생성

프로젝트 루트에서:

```bash
npm run generate:samples
```

또는:

```bash
cd server
node scripts/generate-samples.js
```
