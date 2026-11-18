// Ready-made pages to start from: forty templates in eight kinds of work, in Korean and English.
// A line is either one string (the same in both languages) or [Korean, English].

export const TEMPLATE_GROUPS = [
  { id: 'meeting', icon: 'comment', ko: '회의', en: 'Meetings' },
  { id: 'product', icon: 'spark', ko: '기획·제품', en: 'Product' },
  { id: 'engineering', icon: 'code', ko: '개발', en: 'Engineering' },
  { id: 'operations', icon: 'wrench', ko: '운영·IT', en: 'Operations & IT' },
  { id: 'project', icon: 'roadmap', ko: '프로젝트 관리', en: 'Project management' },
  { id: 'people', icon: 'people', ko: '인사·조직', en: 'People & HR' },
  { id: 'business', icon: 'chart', ko: '영업·마케팅·고객', en: 'Sales, marketing & customers' },
  { id: 'general', icon: 'book', ko: '일반 업무', en: 'General work' },
];

const T = (id, group, icon, name, about, lines) => ({ id, group, icon, ko: name[0], en: name[1], about, lines });
const H2 = (ko, en) => [`## ${ko}`, `## ${en}`];
const H3 = (ko, en) => [`### ${ko}`, `### ${en}`];
const LI = (ko, en) => [`- ${ko}`, `- ${en}`];
const TODO = (ko, en) => [`- ☐ ${ko}`, `- ☐ ${en}`];
const P = (ko, en) => [ko, en];
const ROW = (cells) => [`| ${cells.map((cell) => cell[0]).join(' | ')} |`, `| ${cells.map((cell) => cell[1]).join(' | ')} |`];
const SEP = (n) => `|${' --- |'.repeat(n)}`;
const INFO = (pairs) => [ROW([['항목', 'Item'], ['내용', 'Details']]), SEP(2), ...pairs.map((pair) => ROW([pair, ['', '']]))];
const B = '';

export const PAGE_TEMPLATES = [
  // ── Meetings ──
  T('meeting-notes', 'meeting', 'comment', ['회의록', 'Meeting notes'], ['날짜, 참석자, 안건, 결정, 할 일', 'Date, attendees, agenda, decisions, actions'], [
    ...INFO([['날짜', 'Date'], ['장소', 'Place'], ['참석자', 'Attendees'], ['작성자', 'Note taker']]), B,
    H2('안건', 'Agenda'), LI('안건 1', 'Item 1'), LI('안건 2', 'Item 2'), B,
    H2('논의 내용', 'Discussion'), P('논의한 내용을 안건별로 적습니다.', 'Write what was discussed for each item.'), B,
    H2('결정 사항', 'Decisions'), LI('결정한 것', 'What was decided'), B,
    H2('할 일', 'Action items'), ROW([['할 일', 'Action'], ['담당', 'Owner'], ['기한', 'Due']]), SEP(3), ROW([['', ''], ['', ''], ['', '']]),
  ]),
  T('weekly-sync', 'meeting', 'calendar', ['주간 팀 회의', 'Weekly team sync'], ['지난주 성과, 이번 주 계획, 막힌 일', 'Last week, this week, blockers'], [
    ...INFO([['주차', 'Week'], ['진행', 'Facilitator']]), B,
    H2('지난주에 한 일', 'Done last week'), ROW([['사람', 'Person'], ['한 일', 'Done']]), SEP(2), ROW([['', ''], ['', '']]), B,
    H2('이번 주 계획', 'Plan for this week'), ROW([['사람', 'Person'], ['할 일', 'Plan']]), SEP(2), ROW([['', ''], ['', '']]), B,
    H2('막힌 일과 도움 요청', 'Blockers and help needed'), LI('', ''), B,
    H2('공지', 'Announcements'), LI('', ''),
  ]),
  T('one-on-one', 'meeting', 'user', ['1:1 미팅', 'One-on-one'], ['근황, 피드백, 성장, 다음 약속', 'Check-in, feedback, growth, next steps'], [
    ...INFO([['날짜', 'Date'], ['참석', 'Attendees']]), B,
    H2('근황', 'Check-in'), P('요즘 일과 컨디션은 어떤가요?', 'How are work and life going?'), B,
    H2('팀원이 꺼낸 이야기', 'Topics from the team member'), LI('', ''), B,
    H2('관리자가 꺼낸 이야기', 'Topics from the manager'), LI('', ''), B,
    H2('피드백', 'Feedback'), LI('잘하고 있는 것', 'Going well'), LI('더 좋아질 수 있는 것', 'Could be better'), B,
    H2('성장과 목표', 'Growth and goals'), P('', ''), B,
    H2('다음까지 할 일', 'Before next time'), TODO('', ''),
  ]),
  T('retrospective', 'meeting', 'restore', ['회고', 'Retrospective'], ['좋았던 점, 아쉬운 점, 개선 행동', 'Went well, to improve, actions'], [
    ...INFO([['기간 / 스프린트', 'Period / sprint'], ['참석자', 'Attendees']]), B,
    H2('좋았던 점', 'What went well'), LI('', ''), B,
    H2('아쉬웠던 점', 'What did not go well'), LI('', ''), B,
    H2('배운 점', 'What we learned'), LI('', ''), B,
    H2('개선 행동', 'Actions'), ROW([['행동', 'Action'], ['담당', 'Owner'], ['확인 시점', 'Check by']]), SEP(3), ROW([['', ''], ['', ''], ['', '']]),
  ]),
  T('workshop', 'meeting', 'people', ['워크숍 기획', 'Workshop plan'], ['목표, 대상, 진행표, 준비물', 'Goals, audience, schedule, materials'], [
    ...INFO([['일시', 'Date and time'], ['장소', 'Place'], ['진행자', 'Facilitator'], ['대상', 'Audience']]), B,
    H2('목표', 'Goals'), LI('워크숍이 끝나면 무엇을 얻나요?', 'What should people leave with?'), B,
    H2('진행표', 'Schedule'), ROW([['시간', 'Time'], ['순서', 'Session'], ['진행', 'Lead']]), SEP(3), ROW([['09:00', '09:00'], ['시작과 소개', 'Opening'], ['', '']]), ROW([['', ''], ['', ''], ['', '']]), B,
    H2('준비물', 'Materials'), TODO('장소 예약', 'Book the room'), TODO('자료 준비', 'Prepare the slides'), B,
    H2('결과 정리', 'Outcomes'), P('', ''),
  ]),

  // ── Product ──
  T('prd', 'product', 'spark', ['제품 요구사항(PRD)', 'Product requirements (PRD)'], ['문제, 목표, 요구사항, 범위 밖', 'Problem, goals, requirements, out of scope'], [
    ...INFO([['제품 / 기능', 'Product / feature'], ['담당', 'Owner'], ['상태', 'Status'], ['목표 출시', 'Target release']]), B,
    H2('배경과 문제', 'Background and problem'), P('누가 어떤 문제를 겪고 있나요?', 'Who has what problem?'), B,
    H2('목표와 성공 지표', 'Goals and success metrics'), ROW([['목표', 'Goal'], ['지표', 'Metric'], ['목표값', 'Target']]), SEP(3), ROW([['', ''], ['', ''], ['', '']]), B,
    H2('사용자 이야기', 'User stories'), LI('사용자로서 …을 하고 싶다. 왜냐하면 …', 'As a user, I want … so that …'), B,
    H2('요구사항', 'Requirements'), ROW([['#', '#'], ['요구사항', 'Requirement'], ['중요도', 'Priority'], ['비고', 'Notes']]), SEP(4), ROW([['1', '1'], ['', ''], ['필수', 'Must'], ['', '']]), B,
    H2('범위 밖', 'Out of scope'), LI('', ''), B,
    H2('열린 질문', 'Open questions'), LI('', ''),
  ]),
  T('feature-spec', 'product', 'list', ['기능 명세', 'Feature specification'], ['흐름, 화면, 규칙, 예외', 'Flows, screens, rules, edge cases'], [
    ...INFO([['기능', 'Feature'], ['관련 이슈', 'Related issues'], ['작성자', 'Author']]), B,
    H2('개요', 'Overview'), P('이 기능이 하는 일을 한두 문장으로 씁니다.', 'Describe the feature in one or two sentences.'), B,
    H2('사용 흐름', 'User flow'), ['1. 사용자가 …', '1. The user …'], ['2. 시스템이 …', '2. The system …'], B,
    H2('화면', 'Screens'), P('화면 그림을 넣거나 화면별 요소를 적습니다.', 'Add mock-ups or list each screen\'s parts.'), B,
    H2('규칙', 'Business rules'), LI('', ''), B,
    H2('예외와 오류', 'Edge cases and errors'), ROW([['상황', 'Case'], ['동작', 'Behaviour']]), SEP(2), ROW([['', ''], ['', '']]),
  ]),
  T('story-map', 'product', 'layers', ['사용자 스토리 맵', 'User story map'], ['활동, 단계, 릴리스별 스토리', 'Activities, steps and stories by release'], [
    H2('사용자', 'User'), P('누구의 여정인가요?', 'Whose journey is this?'), B,
    H2('여정', 'Journey'), ROW([['활동', 'Activity'], ['단계', 'Step'], ['릴리스 1', 'Release 1'], ['릴리스 2', 'Release 2']]), SEP(4),
    ROW([['찾기', 'Discover'], ['', ''], ['', ''], ['', '']]), ROW([['사용하기', 'Use'], ['', ''], ['', ''], ['', '']]), ROW([['공유하기', 'Share'], ['', ''], ['', ''], ['', '']]), B,
    H2('릴리스 목표', 'Release goals'), LI('릴리스 1: ', 'Release 1: '), LI('릴리스 2: ', 'Release 2: '),
  ]),
  T('product-roadmap', 'product', 'roadmap', ['제품 로드맵', 'Product roadmap'], ['분기별 주제와 목표', 'Themes and goals by quarter'], [
    H2('비전', 'Vision'), P('', ''), B,
    H2('로드맵', 'Roadmap'), ROW([['시기', 'When'], ['주제', 'Theme'], ['주요 기능', 'Key features'], ['상태', 'Status']]), SEP(4),
    ROW([['1분기', 'Q1'], ['', ''], ['', ''], ['계획', 'Planned']]), ROW([['2분기', 'Q2'], ['', ''], ['', ''], ['', '']]), ROW([['3분기', 'Q3'], ['', ''], ['', ''], ['', '']]), ROW([['4분기', 'Q4'], ['', ''], ['', ''], ['', '']]), B,
    H2('하지 않을 것', 'Not doing'), LI('', ''), B,
    H2('가정과 위험', 'Assumptions and risks'), LI('', ''),
  ]),
  T('competitor-analysis', 'product', 'chart', ['경쟁사 분석', 'Competitor analysis'], ['비교표, 강점과 약점, 시사점', 'Comparison, strengths and weaknesses, takeaways'], [
    H2('비교 대상', 'Compared products'), LI('', ''), B,
    H2('기능 비교', 'Feature comparison'), ROW([['항목', 'Item'], ['우리', 'Us'], ['경쟁사 A', 'Competitor A'], ['경쟁사 B', 'Competitor B']]), SEP(4),
    ROW([['가격', 'Price'], ['', ''], ['', ''], ['', '']]), ROW([['주요 기능', 'Key features'], ['', ''], ['', ''], ['', '']]), ROW([['대상 고객', 'Target customers'], ['', ''], ['', ''], ['', '']]), B,
    H2('강점과 약점', 'Strengths and weaknesses'), H3('경쟁사 A', 'Competitor A'), LI('강점: ', 'Strengths: '), LI('약점: ', 'Weaknesses: '), B,
    H2('시사점', 'Takeaways'), LI('', ''),
  ]),

  // ── Engineering ──
  T('tech-design', 'engineering', 'code', ['기술 설계 문서', 'Technical design'], ['배경, 설계, 대안, 위험', 'Context, design, alternatives, risks'], [
    ...INFO([['작성자', 'Author'], ['검토자', 'Reviewers'], ['상태', 'Status'], ['관련 이슈', 'Related issues']]), B,
    H2('배경', 'Context'), P('무엇을 왜 만드나요?', 'What are we building and why?'), B,
    H2('목표와 비목표', 'Goals and non-goals'), LI('목표: ', 'Goal: '), LI('비목표: ', 'Non-goal: '), B,
    H2('설계', 'Design'), H3('구성 요소', 'Components'), P('', ''), H3('데이터 모델', 'Data model'), '```', '```', H3('흐름', 'Flow'), P('', ''), B,
    H2('고려한 대안', 'Alternatives considered'), ROW([['대안', 'Option'], ['장점', 'Pros'], ['단점', 'Cons']]), SEP(3), ROW([['', ''], ['', ''], ['', '']]), B,
    H2('보안·성능·운영', 'Security, performance, operations'), LI('', ''), B,
    H2('위험과 열린 질문', 'Risks and open questions'), LI('', ''),
  ]),
  T('api-doc', 'engineering', 'link', ['API 문서', 'API documentation'], ['엔드포인트, 요청, 응답, 오류', 'Endpoints, requests, responses, errors'], [
    H2('개요', 'Overview'), ...INFO([['기본 주소', 'Base URL'], ['인증', 'Authentication'], ['버전', 'Version']]), B,
    H2('엔드포인트', 'Endpoints'), ROW([['메서드', 'Method'], ['경로', 'Path'], ['설명', 'Description']]), SEP(3), ROW([['GET', 'GET'], ['/items', '/items'], ['목록', 'List']]), ROW([['POST', 'POST'], ['/items', '/items'], ['만들기', 'Create']]), B,
    H2('요청 예', 'Request example'), '```', '{ "name": "example" }', '```', B,
    H2('응답 예', 'Response example'), '```', '{ "id": 1, "name": "example" }', '```', B,
    H2('오류', 'Errors'), ROW([['코드', 'Code'], ['뜻', 'Meaning']]), SEP(2), ROW([['400', '400'], ['요청이 잘못됨', 'Bad request']]), ROW([['401', '401'], ['인증 필요', 'Unauthorized']]),
  ]),
  T('adr', 'engineering', 'flag', ['아키텍처 결정 기록(ADR)', 'Architecture decision record'], ['상황, 결정, 결과', 'Context, decision, consequences'], [
    ...INFO([['번호', 'Number'], ['날짜', 'Date'], ['상태', 'Status'], ['결정한 사람', 'Deciders']]), B,
    H2('상황', 'Context'), P('어떤 문제나 제약 때문에 결정이 필요했나요?', 'What problem or constraint calls for a decision?'), B,
    H2('검토한 선택지', 'Options considered'), LI('선택지 1', 'Option 1'), LI('선택지 2', 'Option 2'), B,
    H2('결정', 'Decision'), P('', ''), B,
    H2('결과', 'Consequences'), LI('좋아지는 것: ', 'Better: '), LI('감수하는 것: ', 'Trade-offs: '),
  ]),
  T('code-review-checklist', 'engineering', 'check', ['코드 리뷰 체크리스트', 'Code review checklist'], ['정확성, 테스트, 보안, 가독성', 'Correctness, tests, security, readability'], [
    H2('변경 정보', 'Change'), ...INFO([['풀 리퀘스트', 'Pull request'], ['작성자', 'Author'], ['리뷰어', 'Reviewer']]), B,
    H2('정확성', 'Correctness'), TODO('요구사항대로 동작한다', 'Does what the requirement asks'), TODO('경계 값과 오류를 다룬다', 'Handles edge cases and errors'), B,
    H2('테스트', 'Tests'), TODO('새 동작에 테스트가 있다', 'New behaviour is tested'), TODO('모든 테스트가 통과한다', 'All tests pass'), B,
    H2('보안', 'Security'), TODO('입력을 검증한다', 'Input is validated'), TODO('비밀 정보가 코드에 없다', 'No secrets in code'), B,
    H2('가독성과 유지보수', 'Readability and maintenance'), TODO('이름이 뜻을 드러낸다', 'Names say what things are'), TODO('중복이 없다', 'No duplication'), B,
    H2('의견', 'Comments'), P('', ''),
  ]),
  T('release-notes', 'engineering', 'release', ['릴리스 노트', 'Release notes'], ['새 기능, 개선, 버그 수정, 알려진 문제', 'New, improved, fixed, known issues'], [
    ...INFO([['버전', 'Version'], ['출시일', 'Release date']]), B,
    H2('새 기능', 'New'), LI('', ''), B,
    H2('개선', 'Improved'), LI('', ''), B,
    H2('버그 수정', 'Fixed'), LI('', ''), B,
    H2('알려진 문제', 'Known issues'), LI('', ''), B,
    H2('업그레이드 안내', 'Upgrade notes'), P('', ''),
  ]),

  // ── Operations & IT ──
  T('incident-postmortem', 'operations', 'alert', ['장애 보고서(사후 검토)', 'Incident postmortem'], ['영향, 타임라인, 원인, 재발 방지', 'Impact, timeline, root cause, prevention'], [
    ...INFO([['장애 등급', 'Severity'], ['발생', 'Started'], ['복구', 'Resolved'], ['담당', 'Incident lead']]), B,
    H2('요약', 'Summary'), P('무슨 일이 있었는지 세 문장 안으로 씁니다.', 'What happened, in three sentences or fewer.'), B,
    H2('영향', 'Impact'), LI('영향받은 고객·서비스: ', 'Customers and services affected: '), B,
    H2('타임라인', 'Timeline'), ROW([['시각', 'Time'], ['일', 'Event']]), SEP(2), ROW([['', ''], ['감지', 'Detected']]), ROW([['', ''], ['복구', 'Resolved']]), B,
    H2('근본 원인', 'Root cause'), P('', ''), B,
    H2('잘된 점과 아쉬운 점', 'What went well and what did not'), LI('', ''), B,
    H2('재발 방지', 'Prevention'), ROW([['조치', 'Action'], ['담당', 'Owner'], ['기한', 'Due'], ['이슈', 'Issue']]), SEP(4), ROW([['', ''], ['', ''], ['', ''], ['', '']]),
  ]),
  T('runbook', 'operations', 'wrench', ['런북(운영 절차)', 'Runbook'], ['점검, 절차, 확인, 되돌리기', 'Checks, steps, verification, rollback'], [
    ...INFO([['서비스', 'Service'], ['담당 팀', 'Owning team'], ['연락처', 'Contact']]), B,
    H2('언제 쓰나요', 'When to use'), P('', ''), B,
    H2('사전 점검', 'Pre-checks'), TODO('', ''), B,
    H2('절차', 'Steps'), ['1. ', '1. '], ['2. ', '2. '], ['3. ', '3. '], B,
    H2('정상 확인', 'Verify'), LI('', ''), B,
    H2('되돌리기', 'Rollback'), ['1. ', '1. '], B,
    H2('문의할 곳', 'Escalation'), LI('', ''),
  ]),
  T('deploy-checklist', 'operations', 'play', ['배포 체크리스트', 'Deployment checklist'], ['배포 전, 배포, 배포 후', 'Before, during and after'], [
    ...INFO([['버전', 'Version'], ['배포 일시', 'Deploy time'], ['담당', 'Owner']]), B,
    H2('배포 전', 'Before'), TODO('테스트 통과', 'Tests pass'), TODO('릴리스 노트 작성', 'Release notes written'), TODO('백업 확인', 'Backup confirmed'), TODO('관련자 공지', 'Stakeholders told'), B,
    H2('배포', 'During'), TODO('배포 시작 공지', 'Announce the start'), TODO('배포 실행', 'Run the deployment'), B,
    H2('배포 후', 'After'), TODO('상태 확인', 'Health checks'), TODO('모니터링 확인', 'Watch the dashboards'), TODO('완료 공지', 'Announce completion'), B,
    H2('되돌리기 계획', 'Rollback plan'), P('', ''),
  ]),
  T('change-request', 'operations', 'workflow', ['변경 요청', 'Change request'], ['변경 내용, 위험, 승인', 'What changes, risk, approval'], [
    ...INFO([['요청자', 'Requester'], ['변경 유형', 'Change type'], ['예정 일시', 'Planned time'], ['승인자', 'Approver']]), B,
    H2('변경 내용', 'Change'), P('', ''), B,
    H2('이유', 'Reason'), P('', ''), B,
    H2('영향과 위험', 'Impact and risk'), ROW([['위험', 'Risk'], ['가능성', 'Likelihood'], ['대응', 'Mitigation']]), SEP(3), ROW([['', ''], ['', ''], ['', '']]), B,
    H2('실행 계획과 되돌리기', 'Plan and rollback'), LI('', ''), B,
    H2('승인', 'Approval'), ROW([['이름', 'Name'], ['결정', 'Decision'], ['날짜', 'Date']]), SEP(3), ROW([['', ''], ['', ''], ['', '']]),
  ]),
  T('service-status', 'operations', 'dashboard', ['서비스 운영 보고', 'Service status report'], ['가용성, 장애, 요청 처리, 개선', 'Availability, incidents, requests, improvements'], [
    ...INFO([['기간', 'Period'], ['작성자', 'Author']]), B,
    H2('핵심 지표', 'Key metrics'), ROW([['지표', 'Metric'], ['목표', 'Target'], ['실적', 'Actual']]), SEP(3), ROW([['가용성', 'Availability'], ['99.9%', '99.9%'], ['', '']]), ROW([['평균 처리 시간', 'Mean time to resolve'], ['', ''], ['', '']]), B,
    H2('장애', 'Incidents'), LI('', ''), B,
    H2('요청 처리', 'Requests'), P('', ''), B,
    H2('다음 기간 개선', 'Next improvements'), LI('', ''),
  ]),

  // ── Project management ──
  T('project-plan', 'project', 'roadmap', ['프로젝트 계획서', 'Project plan'], ['목표, 범위, 일정, 역할, 위험', 'Goals, scope, schedule, roles, risks'], [
    ...INFO([['프로젝트', 'Project'], ['책임자', 'Lead'], ['기간', 'Duration'], ['예산', 'Budget']]), B,
    H2('목표', 'Objectives'), LI('', ''), B,
    H2('범위', 'Scope'), LI('포함: ', 'In: '), LI('제외: ', 'Out: '), B,
    H2('일정', 'Milestones'), ROW([['단계', 'Milestone'], ['완료일', 'Date'], ['결과물', 'Deliverable']]), SEP(3), ROW([['착수', 'Kick-off'], ['', ''], ['', '']]), ROW([['완료', 'Completion'], ['', ''], ['', '']]), B,
    H2('역할', 'Roles'), ROW([['역할', 'Role'], ['이름', 'Name']]), SEP(2), ROW([['책임자', 'Lead'], ['', '']]), B,
    H2('위험', 'Risks'), LI('', ''), B,
    H2('소통 계획', 'Communication'), P('', ''),
  ]),
  T('status-report', 'project', 'chart', ['프로젝트 현황 보고', 'Project status report'], ['전체 상태, 진척, 이슈, 다음 단계', 'Overall health, progress, issues, next'], [
    ...INFO([['보고 기간', 'Period'], ['전체 상태', 'Overall status'], ['작성자', 'Author']]), B,
    H2('요약', 'Summary'), P('', ''), B,
    H2('진척', 'Progress'), ROW([['항목', 'Workstream'], ['상태', 'Status'], ['진척률', 'Progress'], ['비고', 'Notes']]), SEP(4), ROW([['', ''], ['정상', 'On track'], ['', ''], ['', '']]), B,
    H2('이번 기간 성과', 'Done this period'), LI('', ''), B,
    H2('이슈와 위험', 'Issues and risks'), LI('', ''), B,
    H2('다음 기간 계획', 'Next period'), LI('', ''), B,
    H2('도움이 필요한 일', 'Help needed'), LI('', ''),
  ]),
  T('risk-register', 'project', 'shield', ['위험 관리 대장', 'Risk register'], ['위험, 가능성, 영향, 대응, 담당', 'Risk, likelihood, impact, response, owner'], [
    H2('위험 목록', 'Risks'), ROW([['#', '#'], ['위험', 'Risk'], ['가능성', 'Likelihood'], ['영향', 'Impact'], ['대응', 'Response'], ['담당', 'Owner'], ['상태', 'Status']]), SEP(7),
    ROW([['1', '1'], ['', ''], ['중', 'Medium'], ['높음', 'High'], ['', ''], ['', ''], ['열림', 'Open']]), ROW([['2', '2'], ['', ''], ['', ''], ['', ''], ['', ''], ['', ''], ['', '']]), B,
    H2('등급 기준', 'Rating guide'), LI('가능성: 낮음 / 중 / 높음', 'Likelihood: low / medium / high'), LI('영향: 낮음 / 중 / 높음', 'Impact: low / medium / high'), B,
    H2('검토 기록', 'Review log'), LI('', ''),
  ]),
  T('decision-log', 'project', 'flag', ['의사 결정 기록', 'Decision log'], ['결정, 이유, 결정한 사람, 날짜', 'Decision, rationale, who, when'], [
    H2('결정 목록', 'Decisions'), ROW([['날짜', 'Date'], ['결정', 'Decision'], ['이유', 'Rationale'], ['결정한 사람', 'Decided by'], ['관련 문서', 'Links']]), SEP(5), ROW([['', ''], ['', ''], ['', ''], ['', ''], ['', '']]), B,
    H2('결정 대기', 'Pending decisions'), ROW([['안건', 'Question'], ['선택지', 'Options'], ['기한', 'Due'], ['담당', 'Owner']]), SEP(4), ROW([['', ''], ['', ''], ['', ''], ['', '']]),
  ]),
  T('project-closure', 'project', 'check', ['프로젝트 종료 보고', 'Project closure report'], ['결과, 목표 대비, 교훈, 인계', 'Results, goals met, lessons, handover'], [
    ...INFO([['프로젝트', 'Project'], ['기간', 'Duration'], ['책임자', 'Lead']]), B,
    H2('결과 요약', 'Results'), P('', ''), B,
    H2('목표 대비 결과', 'Goals versus results'), ROW([['목표', 'Goal'], ['결과', 'Result'], ['달성', 'Met']]), SEP(3), ROW([['', ''], ['', ''], ['', '']]), B,
    H2('일정과 비용', 'Schedule and cost'), P('', ''), B,
    H2('교훈', 'Lessons learned'), LI('계속할 것: ', 'Keep: '), LI('바꿀 것: ', 'Change: '), B,
    H2('인계 사항', 'Handover'), TODO('', ''),
  ]),

  // ── People & HR ──
  T('onboarding', 'people', 'user', ['신규 입사자 온보딩', 'New hire onboarding'], ['첫날, 첫 주, 첫 달 할 일', 'First day, week and month'], [
    ...INFO([['이름', 'Name'], ['입사일', 'Start date'], ['팀', 'Team'], ['도우미(버디)', 'Buddy']]), B,
    H2('첫날', 'Day one'), TODO('계정과 장비 받기', 'Get accounts and equipment'), TODO('팀 소개', 'Meet the team'), TODO('사무실 둘러보기', 'Office tour'), B,
    H2('첫 주', 'First week'), TODO('업무 도구 익히기', 'Learn the tools'), TODO('주요 문서 읽기', 'Read the key documents'), TODO('첫 작은 일 끝내기', 'Finish a first small task'), B,
    H2('첫 달', 'First month'), TODO('목표 정하기', 'Agree on goals'), TODO('관리자와 1:1', 'One-on-one with the manager'), B,
    H2('읽을거리', 'Reading list'), LI('', ''),
  ]),
  T('job-description', 'people', 'idCard', ['직무 기술서', 'Job description'], ['역할, 하는 일, 자격, 우대', 'Role, duties, requirements, nice to have'], [
    ...INFO([['직무', 'Position'], ['팀', 'Team'], ['근무 형태', 'Employment type'], ['근무지', 'Location']]), B,
    H2('역할 소개', 'About the role'), P('', ''), B,
    H2('하는 일', 'Responsibilities'), LI('', ''), B,
    H2('자격 요건', 'Requirements'), LI('', ''), B,
    H2('우대 사항', 'Nice to have'), LI('', ''), B,
    H2('채용 절차', 'Hiring process'), ['1. 서류', '1. Application'], ['2. 면접', '2. Interviews'], ['3. 합격 안내', '3. Offer'],
  ]),
  T('interview-scorecard', 'people', 'check', ['면접 평가표', 'Interview scorecard'], ['역량별 점수와 의견', 'Scores and notes for each skill'], [
    ...INFO([['지원자', 'Candidate'], ['직무', 'Position'], ['면접관', 'Interviewer'], ['날짜', 'Date']]), B,
    H2('평가', 'Assessment'), ROW([['역량', 'Skill'], ['점수 (1-5)', 'Score (1-5)'], ['근거', 'Evidence']]), SEP(3),
    ROW([['직무 지식', 'Job knowledge'], ['', ''], ['', '']]), ROW([['문제 해결', 'Problem solving'], ['', ''], ['', '']]), ROW([['소통', 'Communication'], ['', ''], ['', '']]), ROW([['협업', 'Collaboration'], ['', ''], ['', '']]), B,
    H2('강점', 'Strengths'), LI('', ''), B,
    H2('우려', 'Concerns'), LI('', ''), B,
    H2('추천', 'Recommendation'), P('강력 추천 / 추천 / 보류 / 비추천', 'Strong yes / Yes / Hold / No'),
  ]),
  T('team-home', 'people', 'team', ['팀 소개', 'Team home'], ['하는 일, 구성원, 일하는 방식, 연락', 'Mission, members, ways of working, contact'], [
    H2('우리 팀이 하는 일', 'What we do'), P('', ''), B,
    H2('구성원', 'Members'), ROW([['이름', 'Name'], ['역할', 'Role'], ['맡은 일', 'Focus']]), SEP(3), ROW([['', ''], ['', ''], ['', '']]), B,
    H2('일하는 방식', 'How we work'), LI('회의: ', 'Meetings: '), LI('업무 요청: ', 'Requests: '), LI('주요 도구: ', 'Tools: '), B,
    H2('주요 문서', 'Key pages'), '[[children]]', B,
    H2('연락처', 'Contact'), P('', ''),
  ]),
  T('okr', 'people', 'flag', ['목표와 핵심 결과(OKR)', 'Objectives and key results'], ['분기 목표, 핵심 결과, 진척', 'Quarterly objectives, key results, progress'], [
    ...INFO([['기간', 'Period'], ['팀 / 사람', 'Team / person']]), B,
    H2('목표 1', 'Objective 1'), ROW([['핵심 결과', 'Key result'], ['시작', 'Start'], ['목표', 'Target'], ['현재', 'Current']]), SEP(4), ROW([['', ''], ['', ''], ['', ''], ['', '']]), ROW([['', ''], ['', ''], ['', ''], ['', '']]), B,
    H2('목표 2', 'Objective 2'), ROW([['핵심 결과', 'Key result'], ['시작', 'Start'], ['목표', 'Target'], ['현재', 'Current']]), SEP(4), ROW([['', ''], ['', ''], ['', ''], ['', '']]), B,
    H2('회고', 'Reflection'), P('', ''),
  ]),

  // ── Sales, marketing & customers ──
  T('campaign-plan', 'business', 'bolt', ['마케팅 캠페인 계획', 'Marketing campaign plan'], ['목표, 대상, 메시지, 채널, 예산', 'Goal, audience, message, channels, budget'], [
    ...INFO([['캠페인', 'Campaign'], ['기간', 'Dates'], ['담당', 'Owner'], ['예산', 'Budget']]), B,
    H2('목표', 'Goal'), ROW([['지표', 'Metric'], ['목표값', 'Target']]), SEP(2), ROW([['', ''], ['', '']]), B,
    H2('대상 고객', 'Audience'), P('', ''), B,
    H2('핵심 메시지', 'Key message'), P('', ''), B,
    H2('채널과 일정', 'Channels and schedule'), ROW([['채널', 'Channel'], ['내용', 'Content'], ['날짜', 'Date'], ['담당', 'Owner']]), SEP(4), ROW([['', ''], ['', ''], ['', ''], ['', '']]), B,
    H2('결과', 'Results'), P('', ''),
  ]),
  T('content-calendar', 'business', 'calendar', ['콘텐츠 캘린더', 'Content calendar'], ['날짜별 주제, 채널, 담당, 상태', 'Topic, channel, owner and status by date'], [
    H2('이번 달 주제', 'Theme of the month'), P('', ''), B,
    H2('일정', 'Schedule'), ROW([['날짜', 'Date'], ['주제', 'Topic'], ['형식', 'Format'], ['채널', 'Channel'], ['담당', 'Owner'], ['상태', 'Status']]), SEP(6),
    ROW([['', ''], ['', ''], ['글', 'Article'], ['블로그', 'Blog'], ['', ''], ['기획', 'Idea']]), ROW([['', ''], ['', ''], ['영상', 'Video'], ['', ''], ['', ''], ['', '']]), B,
    H2('아이디어 모음', 'Idea backlog'), LI('', ''),
  ]),
  T('customer-interview', 'business', 'comment', ['고객 인터뷰 기록', 'Customer interview notes'], ['고객, 질문, 답, 인사이트', 'Customer, questions, answers, insights'], [
    ...INFO([['고객 / 회사', 'Customer / company'], ['날짜', 'Date'], ['진행', 'Interviewer']]), B,
    H2('목적', 'Purpose'), P('', ''), B,
    H2('질문과 답', 'Questions and answers'), H3('지금 이 일을 어떻게 하고 있나요?', 'How do you do this today?'), P('', ''), H3('가장 불편한 점은?', 'What is the hardest part?'), P('', ''), B,
    H2('인상적인 말', 'Notable quotes'), ['> ', '> '], B,
    H2('인사이트', 'Insights'), LI('', ''), B,
    H2('다음 단계', 'Next steps'), TODO('', ''),
  ]),
  T('sales-proposal', 'business', 'file', ['영업 제안서', 'Sales proposal'], ['고객 과제, 제안, 가격, 일정', 'Customer needs, solution, pricing, timeline'], [
    ...INFO([['고객', 'Customer'], ['제안일', 'Date'], ['담당 영업', 'Account owner']]), B,
    H2('고객의 과제', 'Customer needs'), P('', ''), B,
    H2('제안 내용', 'Proposed solution'), P('', ''), B,
    H2('기대 효과', 'Expected benefits'), LI('', ''), B,
    H2('가격', 'Pricing'), ROW([['항목', 'Item'], ['수량', 'Qty'], ['단가', 'Unit price'], ['금액', 'Amount']]), SEP(4), ROW([['', ''], ['', ''], ['', ''], ['', '']]), B,
    H2('일정', 'Timeline'), LI('', ''), B,
    H2('다음 단계', 'Next steps'), P('', ''),
  ]),
  T('support-faq', 'business', 'help', ['고객 지원 FAQ', 'Support FAQ'], ['자주 묻는 질문과 답', 'Frequently asked questions'], [
    H2('시작하기', 'Getting started'), H3('질문', 'Question'), P('답', 'Answer'), B,
    H2('계정과 결제', 'Account and billing'), H3('질문', 'Question'), P('답', 'Answer'), B,
    H2('문제 해결', 'Troubleshooting'), H3('질문', 'Question'), P('답', 'Answer'), B,
    H2('더 도움이 필요하면', 'Still need help?'), P('연락처: ', 'Contact: '),
  ]),

  // ── General work ──
  T('how-to', 'general', 'book', ['업무 매뉴얼(How-to)', 'How-to guide'], ['준비, 단계별 방법, 문제 해결', 'Before you start, steps, troubleshooting'], [
    P('이 문서는 …하는 방법을 설명합니다.', 'This guide explains how to …'), B,
    H2('시작하기 전에', 'Before you start'), LI('', ''), B,
    H2('방법', 'Steps'), ['1. ', '1. '], ['2. ', '2. '], ['3. ', '3. '], B,
    H2('확인', 'Check the result'), P('', ''), B,
    H2('문제 해결', 'Troubleshooting'), ROW([['증상', 'Problem'], ['해결', 'Fix']]), SEP(2), ROW([['', ''], ['', '']]), B,
    H2('관련 문서', 'Related pages'), LI('', ''),
  ]),
  T('policy', 'general', 'shield', ['정책·규정', 'Policy'], ['목적, 적용 범위, 내용, 책임, 개정 이력', 'Purpose, scope, policy, owners, history'], [
    ...INFO([['정책 번호', 'Policy number'], ['시행일', 'Effective date'], ['관리 부서', 'Owner']]), B,
    H2('목적', 'Purpose'), P('', ''), B,
    H2('적용 범위', 'Scope'), P('', ''), B,
    H2('정책 내용', 'Policy'), ['1. ', '1. '], ['2. ', '2. '], B,
    H2('책임', 'Responsibilities'), LI('', ''), B,
    H2('위반 시', 'Non-compliance'), P('', ''), B,
    H2('개정 이력', 'Revision history'), ROW([['날짜', 'Date'], ['변경', 'Change'], ['승인', 'Approved by']]), SEP(3), ROW([['', ''], ['제정', 'Created'], ['', '']]),
  ]),
  T('training', 'general', 'play', ['교육 자료', 'Training material'], ['학습 목표, 내용, 실습, 확인 문제', 'Objectives, content, exercises, quiz'], [
    ...INFO([['과정', 'Course'], ['대상', 'Audience'], ['시간', 'Duration'], ['강사', 'Trainer']]), B,
    H2('학습 목표', 'Learning objectives'), LI('', ''), B,
    H2('내용', 'Content'), H3('1. ', '1. '), P('', ''), H3('2. ', '2. '), P('', ''), B,
    H2('실습', 'Exercises'), ['1. ', '1. '], B,
    H2('확인 문제', 'Quiz'), ['1. ', '1. '], B,
    H2('참고 자료', 'References'), LI('', ''),
  ]),
  T('trip-report', 'general', 'globe', ['출장 보고서', 'Business trip report'], ['목적, 일정, 결과, 비용, 후속 조치', 'Purpose, itinerary, results, costs, follow-up'], [
    ...INFO([['출장자', 'Traveler'], ['기간', 'Dates'], ['장소', 'Destination'], ['목적', 'Purpose']]), B,
    H2('일정', 'Itinerary'), ROW([['날짜', 'Date'], ['장소', 'Place'], ['내용', 'Activity']]), SEP(3), ROW([['', ''], ['', ''], ['', '']]), B,
    H2('결과', 'Results'), LI('', ''), B,
    H2('비용', 'Expenses'), ROW([['항목', 'Item'], ['금액', 'Amount']]), SEP(2), ROW([['교통', 'Travel'], ['', '']]), ROW([['숙박', 'Lodging'], ['', '']]), B,
    H2('후속 조치', 'Follow-up'), TODO('', ''),
  ]),
  T('weekly-report', 'general', 'clock', ['주간 업무 보고', 'Weekly report'], ['이번 주 성과, 다음 주 계획, 이슈', 'Done this week, next week, issues'], [
    ...INFO([['이름 / 팀', 'Name / team'], ['주차', 'Week']]), B,
    H2('이번 주에 한 일', 'Done this week'), LI('', ''), B,
    H2('다음 주 계획', 'Next week'), LI('', ''), B,
    H2('이슈와 요청', 'Issues and requests'), LI('', ''), B,
    H2('참고', 'Notes'), P('', ''),
  ]),
];

/** The template's Markdown in one language ('ko' or 'en'). */
export function templateBody(template, language = 'ko') {
  const at = language === 'en' ? 1 : 0;
  // An empty list item or quote would vanish when the page is saved, so it holds a "…" to write over.
  return (template?.lines || []).map((line) => (Array.isArray(line) ? line[at] : line))
    .map((line) => line.trimEnd()).map((line) => (/^(- ☐|-|\d+\.|>)$/.test(line) ? `${line} …` : line)).join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+|\n+$/g, '');
}

export function templateById(id) {
  return PAGE_TEMPLATES.find((item) => item.id === id) || null;
}
