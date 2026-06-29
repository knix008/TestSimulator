import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const samplesDir = path.join(__dirname, '..', '..', 'samples');
if (!fs.existsSync(samplesDir)) fs.mkdirSync(samplesDir, { recursive: true });

function createWorkbook(requirements, testCases) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(requirements), 'Requirements');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(testCases), 'TestCases');
  return wb;
}

function save(wb, filename) {
  XLSX.writeFile(wb, path.join(samplesDir, filename));
  console.log(`Created: samples/${filename}`);
}

// 1. Basic login & user management
save(createWorkbook(
  [
    { 'Req ID': 'REQ-001', 'Title': 'User Login', 'Description': 'Users must be able to log in with username and password.', 'Category': 'Functional', 'Priority': 'Critical', 'Status': 'Approved', 'Owner': 'Kim', 'Version': '1.0' },
    { 'Req ID': 'REQ-002', 'Title': 'User Logout', 'Description': 'Logged-in users must be able to log out securely.', 'Category': 'Functional', 'Priority': 'High', 'Status': 'Approved', 'Owner': 'Kim', 'Version': '1.0' },
    { 'Req ID': 'REQ-003', 'Title': 'Password Reset', 'Description': 'Users can reset password via email verification.', 'Category': 'Functional', 'Priority': 'Medium', 'Status': 'Active', 'Owner': 'Lee', 'Version': '1.1' },
    { 'Req ID': 'REQ-004', 'Title': 'Session Timeout', 'Description': 'Session expires after 30 minutes of inactivity.', 'Category': 'Security', 'Priority': 'High', 'Status': 'Draft', 'Owner': 'Park', 'Version': '1.0' },
  ],
  [
    { 'TC ID': 'TC-001', 'Req ID': 'REQ-001', 'Title': 'Valid login', 'Description': 'Login with correct credentials', 'Steps': '1. Enter valid username\n2. Enter valid password\n3. Click Login', 'Expected Result': 'User is redirected to dashboard', 'Status': 'Passed', 'Result': 'OK', 'Executed By': 'Tester A', 'Executed At': '2026-06-01T10:00:00', 'Notes': '' },
    { 'TC ID': 'TC-002', 'Req ID': 'REQ-001', 'Title': 'Invalid password', 'Description': 'Login with wrong password', 'Steps': '1. Enter valid username\n2. Enter wrong password\n3. Click Login', 'Expected Result': 'Error message displayed', 'Status': 'Passed', 'Result': 'OK', 'Executed By': 'Tester A', 'Executed At': '2026-06-01T10:15:00', 'Notes': '' },
    { 'TC ID': 'TC-003', 'Req ID': 'REQ-002', 'Title': 'Logout success', 'Description': 'User logs out', 'Steps': '1. Click Logout button', 'Expected Result': 'Session cleared, login page shown', 'Status': 'Passed', 'Result': 'OK', 'Executed By': 'Tester B', 'Executed At': '2026-06-02T09:00:00', 'Notes': '' },
    { 'TC ID': 'TC-004', 'Req ID': 'REQ-003', 'Title': 'Password reset email', 'Description': 'Request password reset', 'Steps': '1. Click Forgot Password\n2. Enter email\n3. Submit', 'Expected Result': 'Reset email sent', 'Status': 'Not Run', 'Result': '', 'Executed By': '', 'Executed At': '', 'Notes': 'Pending email server setup' },
    { 'TC ID': 'TC-005', 'Req ID': 'REQ-004', 'Title': 'Session timeout', 'Description': 'Verify auto logout', 'Steps': '1. Login\n2. Wait 30 minutes idle', 'Expected Result': 'User logged out automatically', 'Status': 'Not Run', 'Result': '', 'Executed By': '', 'Executed At': '', 'Notes': '' },
  ]
), 'sample_auth.xlsx');

// 2. E-commerce / order management
save(createWorkbook(
  [
    { 'Req ID': 'REQ-101', 'Title': 'Product Search', 'Description': '사용자는 키워드로 상품을 검색할 수 있어야 한다.', 'Category': 'Functional', 'Priority': 'High', 'Status': 'Approved', 'Owner': '최민수', 'Version': '2.0' },
    { 'Req ID': 'REQ-102', 'Title': 'Shopping Cart', 'Description': '사용자는 상품을 장바구니에 추가/삭제할 수 있어야 한다.', 'Category': 'Functional', 'Priority': 'Critical', 'Status': 'Approved', 'Owner': '최민수', 'Version': '2.0' },
    { 'Req ID': 'REQ-103', 'Title': 'Order Checkout', 'Description': '장바구니 상품을 결제하고 주문을 완료할 수 있어야 한다.', 'Category': 'Functional', 'Priority': 'Critical', 'Status': 'Active', 'Owner': '정수연', 'Version': '2.1' },
    { 'Req ID': 'REQ-104', 'Title': 'Order History', 'Description': '사용자는 과거 주문 내역을 조회할 수 있어야 한다.', 'Category': 'Functional', 'Priority': 'Medium', 'Status': 'Active', 'Owner': '정수연', 'Version': '2.0' },
    { 'Req ID': 'REQ-105', 'Title': 'Payment Gateway Integration', 'Description': 'PG사 연동을 통해 신용카드/계좌이체 결제를 지원한다.', 'Category': 'Integration', 'Priority': 'Critical', 'Status': 'Draft', 'Owner': '한지훈', 'Version': '1.0' },
  ],
  [
    { 'TC ID': 'TC-101', 'Req ID': 'REQ-101', 'Title': '키워드 검색', 'Description': '상품명으로 검색', 'Steps': '1. 검색창에 "노트북" 입력\n2. 검색 버튼 클릭', 'Expected Result': '노트북 관련 상품 목록 표시', 'Status': 'Passed', 'Result': '5건 검색됨', 'Executed By': 'QA팀', 'Executed At': '2026-05-20T14:00:00', 'Notes': '' },
    { 'TC ID': 'TC-102', 'Req ID': 'REQ-101', 'Title': '빈 검색어', 'Description': '검색어 없이 검색', 'Steps': '1. 검색창 비우기\n2. 검색 버튼 클릭', 'Expected Result': '전체 상품 목록 또는 안내 메시지', 'Status': 'Passed', 'Result': 'OK', 'Executed By': 'QA팀', 'Executed At': '2026-05-20T14:30:00', 'Notes': '' },
    { 'TC ID': 'TC-103', 'Req ID': 'REQ-102', 'Title': '장바구니 추가', 'Description': '상품을 장바구니에 추가', 'Steps': '1. 상품 상세 페이지 진입\n2. "장바구니 담기" 클릭', 'Expected Result': '장바구니에 상품 추가, 수량 1', 'Status': 'Passed', 'Result': 'OK', 'Executed By': 'QA팀', 'Executed At': '2026-05-21T10:00:00', 'Notes': '' },
    { 'TC ID': 'TC-104', 'Req ID': 'REQ-102', 'Title': '장바구니 삭제', 'Description': '장바구니에서 상품 제거', 'Steps': '1. 장바구니 페이지 진입\n2. 삭제 버튼 클릭', 'Expected Result': '해당 상품이 장바구니에서 제거됨', 'Status': 'Failed', 'Result': 'UI 갱신 안됨', 'Executed By': 'QA팀', 'Executed At': '2026-05-21T11:00:00', 'Notes': 'BUG-234 등록' },
    { 'TC ID': 'TC-105', 'Req ID': 'REQ-103', 'Title': '주문 완료', 'Description': '정상 결제 후 주문', 'Steps': '1. 장바구니에서 주문하기\n2. 배송지 입력\n3. 결제 진행', 'Expected Result': '주문 완료 페이지 표시, 주문번호 생성', 'Status': 'In Progress', 'Result': '', 'Executed By': 'QA팀', 'Executed At': '', 'Notes': 'PG 테스트 환경 필요' },
    { 'TC ID': 'TC-106', 'Req ID': 'REQ-104', 'Title': '주문 내역 조회', 'Description': '마이페이지에서 주문 목록 확인', 'Steps': '1. 마이페이지 > 주문내역 클릭', 'Expected Result': '최근 주문 목록 표시', 'Status': 'Not Run', 'Result': '', 'Executed By': '', 'Executed At': '', 'Notes': '' },
  ]
), 'sample_ecommerce.xlsx');

// 3. Security requirements
save(createWorkbook(
  [
    { 'Req ID': 'REQ-SEC-01', 'Title': 'HTTPS Enforcement', 'Description': 'All communications must use HTTPS/TLS 1.2 or higher.', 'Category': 'Security', 'Priority': 'Critical', 'Status': 'Approved', 'Owner': 'Security Team', 'Version': '1.0' },
    { 'Req ID': 'REQ-SEC-02', 'Title': 'SQL Injection Prevention', 'Description': 'All database queries must use parameterized statements.', 'Category': 'Security', 'Priority': 'Critical', 'Status': 'Approved', 'Owner': 'Security Team', 'Version': '1.0' },
    { 'Req ID': 'REQ-SEC-03', 'Title': 'XSS Protection', 'Description': 'User input must be sanitized before rendering in HTML.', 'Category': 'Security', 'Priority': 'High', 'Status': 'Active', 'Owner': 'Dev Team', 'Version': '1.0' },
    { 'Req ID': 'REQ-SEC-04', 'Title': 'Role-Based Access Control', 'Description': 'API endpoints must enforce role-based permissions.', 'Category': 'Security', 'Priority': 'Critical', 'Status': 'Approved', 'Owner': 'Security Team', 'Version': '1.2' },
    { 'Req ID': 'REQ-SEC-05', 'Title': 'Audit Logging', 'Description': 'All admin actions must be logged with timestamp and user ID.', 'Category': 'Security', 'Priority': 'High', 'Status': 'Draft', 'Owner': 'Security Team', 'Version': '1.0' },
  ],
  [
    { 'TC ID': 'TC-SEC-01', 'Req ID': 'REQ-SEC-01', 'Title': 'HTTP redirect to HTTPS', 'Description': 'Verify HTTP requests redirect', 'Steps': '1. Access http://site.com\n2. Check redirect', 'Expected Result': '301 redirect to https://', 'Status': 'Passed', 'Result': 'OK', 'Executed By': 'SecTester', 'Executed At': '2026-06-10T09:00:00', 'Notes': '' },
    { 'TC ID': 'TC-SEC-02', 'Req ID': 'REQ-SEC-02', 'Title': 'SQL injection in login', 'Description': 'Attempt SQL injection', 'Steps': '1. Enter username: admin\' OR 1=1--\n2. Submit login', 'Expected Result': 'Login rejected, no DB error exposed', 'Status': 'Passed', 'Result': 'OK', 'Executed By': 'SecTester', 'Executed At': '2026-06-10T10:00:00', 'Notes': '' },
    { 'TC ID': 'TC-SEC-03', 'Req ID': 'REQ-SEC-03', 'Title': 'XSS in comment field', 'Description': 'Inject script tag', 'Steps': '1. Enter <script>alert(1)</script> in comment\n2. Submit and view', 'Expected Result': 'Script escaped, not executed', 'Status': 'Failed', 'Result': 'Script executed in IE11', 'Executed By': 'SecTester', 'Executed At': '2026-06-11T11:00:00', 'Notes': 'BUG-SEC-12' },
    { 'TC ID': 'TC-SEC-04', 'Req ID': 'REQ-SEC-04', 'Title': 'Viewer cannot edit', 'Description': 'View-only user tries to edit', 'Steps': '1. Login as viewer\n2. POST /api/requirements', 'Expected Result': '403 Forbidden', 'Status': 'Passed', 'Result': 'OK', 'Executed By': 'SecTester', 'Executed At': '2026-06-11T14:00:00', 'Notes': '' },
    { 'TC ID': 'TC-SEC-05', 'Req ID': 'REQ-SEC-05', 'Title': 'Admin action logged', 'Description': 'Verify audit log entry', 'Steps': '1. Admin deletes user\n2. Check audit log', 'Expected Result': 'Log entry with user ID and timestamp', 'Status': 'Blocked', 'Result': 'Audit module not deployed', 'Executed By': 'SecTester', 'Executed At': '2026-06-12T09:00:00', 'Notes': 'Waiting for v2.0 release' },
  ]
), 'sample_security.xlsx');

// 4. Performance requirements
save(createWorkbook(
  [
    { 'Req ID': 'REQ-PERF-01', 'Title': 'Page Load Time', 'Description': 'Main dashboard must load within 2 seconds on 4G network.', 'Category': 'Performance', 'Priority': 'High', 'Status': 'Active', 'Owner': 'Performance Team', 'Version': '1.0' },
    { 'Req ID': 'REQ-PERF-02', 'Title': 'API Response Time', 'Description': 'REST API endpoints must respond within 500ms at P95.', 'Category': 'Performance', 'Priority': 'High', 'Status': 'Active', 'Owner': 'Performance Team', 'Version': '1.0' },
    { 'Req ID': 'REQ-PERF-03', 'Title': 'Concurrent Users', 'Description': 'System must support 500 concurrent users without degradation.', 'Category': 'Performance', 'Priority': 'Critical', 'Status': 'Draft', 'Owner': 'Performance Team', 'Version': '1.0' },
    { 'Req ID': 'REQ-PERF-04', 'Title': 'Database Query Optimization', 'Description': 'No single query should exceed 100ms execution time.', 'Category': 'Performance', 'Priority': 'Medium', 'Status': 'Approved', 'Owner': 'DBA Team', 'Version': '1.0' },
  ],
  [
    { 'TC ID': 'TC-PERF-01', 'Req ID': 'REQ-PERF-01', 'Title': 'Dashboard load time', 'Description': 'Measure dashboard first paint', 'Steps': '1. Clear cache\n2. Navigate to dashboard\n3. Measure load time', 'Expected Result': 'Load time < 2 seconds', 'Status': 'Passed', 'Result': '1.4s avg', 'Executed By': 'PerfTester', 'Executed At': '2026-06-15T10:00:00', 'Notes': 'Chrome DevTools' },
    { 'TC ID': 'TC-PERF-02', 'Req ID': 'REQ-PERF-02', 'Title': 'Requirements API latency', 'Description': 'Load test GET /api/requirements', 'Steps': '1. Run JMeter with 100 threads\n2. Measure P95', 'Expected Result': 'P95 < 500ms', 'Status': 'Failed', 'Result': 'P95 = 820ms', 'Executed By': 'PerfTester', 'Executed At': '2026-06-15T14:00:00', 'Notes': 'Need query optimization' },
    { 'TC ID': 'TC-PERF-03', 'Req ID': 'REQ-PERF-03', 'Title': '500 concurrent users', 'Description': 'Stress test with 500 VUs', 'Steps': '1. Configure k6 with 500 VUs\n2. Run for 10 minutes', 'Expected Result': 'Error rate < 1%, response time stable', 'Status': 'Not Run', 'Result': '', 'Executed By': '', 'Executed At': '', 'Notes': 'Scheduled for next sprint' },
    { 'TC ID': 'TC-PERF-04', 'Req ID': 'REQ-PERF-04', 'Title': 'Slow query detection', 'Description': 'Analyze slow query log', 'Steps': '1. Enable slow query log\n2. Run typical workload\n3. Review queries > 100ms', 'Expected Result': 'No queries exceed 100ms', 'Status': 'In Progress', 'Result': '', 'Executed By': 'DBA', 'Executed At': '', 'Notes': '3 queries identified for optimization' },
  ]
), 'sample_performance.xlsx');

// 5. UI/UX requirements only (no test cases - requirements only import)
save(createWorkbook(
  [
    { 'Req ID': 'REQ-UI-01', 'Title': 'Responsive Layout', 'Description': 'UI must adapt to screen sizes from 320px to 2560px.', 'Category': 'UI/UX', 'Priority': 'High', 'Status': 'Approved', 'Owner': 'Design Team', 'Version': '1.0' },
    { 'Req ID': 'REQ-UI-02', 'Title': 'Dark Mode Support', 'Description': 'Users can switch between light and dark themes.', 'Category': 'UI/UX', 'Priority': 'Medium', 'Status': 'Active', 'Owner': 'Design Team', 'Version': '1.0' },
    { 'Req ID': 'REQ-UI-03', 'Title': 'Accessibility (WCAG 2.1 AA)', 'Description': 'All pages must meet WCAG 2.1 Level AA standards.', 'Category': 'UI/UX', 'Priority': 'High', 'Status': 'Draft', 'Owner': 'Design Team', 'Version': '1.0' },
    { 'Req ID': 'REQ-UI-04', 'Title': 'Multi-language Support', 'Description': 'Support Korean and English UI languages.', 'Category': 'UI/UX', 'Priority': 'Medium', 'Status': 'Approved', 'Owner': 'Design Team', 'Version': '1.0' },
    { 'Req ID': 'REQ-UI-05', 'Title': 'Modal Dialog for Editing', 'Description': 'Requirement editing must use popup modal dialog.', 'Category': 'UI/UX', 'Priority': 'Medium', 'Status': 'Approved', 'Owner': 'Design Team', 'Version': '1.0' },
  ],
  [
    { 'TC ID': 'TC-UI-01', 'Req ID': 'REQ-UI-01', 'Title': 'Mobile viewport test', 'Description': 'Test on 375px width', 'Steps': '1. Set viewport to 375x812\n2. Navigate all pages', 'Expected Result': 'No horizontal scroll, readable text', 'Status': 'Passed', 'Result': 'OK', 'Executed By': 'UX Tester', 'Executed At': '2026-06-18T10:00:00', 'Notes': '' },
    { 'TC ID': 'TC-UI-02', 'Req ID': 'REQ-UI-02', 'Title': 'Theme switch', 'Description': 'Toggle dark mode', 'Steps': '1. Go to Settings\n2. Select Dark theme', 'Expected Result': 'All UI elements switch to dark palette', 'Status': 'Passed', 'Result': 'OK', 'Executed By': 'UX Tester', 'Executed At': '2026-06-18T11:00:00', 'Notes': '' },
    { 'TC ID': 'TC-UI-03', 'Req ID': 'REQ-UI-04', 'Title': 'Language switch to Korean', 'Description': 'Change UI language', 'Steps': '1. Go to Settings\n2. Select Korean', 'Expected Result': 'All labels displayed in Korean', 'Status': 'Passed', 'Result': 'OK', 'Executed By': 'UX Tester', 'Executed At': '2026-06-18T12:00:00', 'Notes': '' },
  ]
), 'sample_uiux.xlsx');

// 6. Requirements only (minimal - for testing requirements-only import)
save(createWorkbook(
  [
    { 'Req ID': 'REQ-MIN-01', 'Title': 'Data Backup', 'Description': 'Daily automated database backup.', 'Category': 'General', 'Priority': 'High', 'Status': 'Draft', 'Owner': 'Ops', 'Version': '1.0' },
    { 'Req ID': 'REQ-MIN-02', 'Title': 'Error Notification', 'Description': 'System errors must trigger email alerts to admins.', 'Category': 'General', 'Priority': 'Medium', 'Status': 'Draft', 'Owner': 'Ops', 'Version': '1.0' },
    { 'Req ID': 'REQ-MIN-03', 'Title': 'API Documentation', 'Description': 'Provide Swagger/OpenAPI documentation for all endpoints.', 'Category': 'General', 'Priority': 'Low', 'Status': 'Draft', 'Owner': 'Dev', 'Version': '1.0' },
  ],
  []
), 'sample_requirements_only.xlsx');

console.log('\nDone! 6 sample Excel files created in samples/');
