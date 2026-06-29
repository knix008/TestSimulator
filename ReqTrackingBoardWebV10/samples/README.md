# Sample Excel Files

Import 테스트용 샘플 Excel 파일입니다. **Reports** 페이지에서 **Excel 가져오기** 버튼으로 업로드할 수 있습니다.

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

```bash
cd server
node scripts/generate-samples.js
```
