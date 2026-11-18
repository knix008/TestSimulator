import { sampleWorkspace } from './sample.js';
import { addArticle, addCalendar, ensureServices } from './services.js';
import { makeIssue, newProject } from './store.js';
import { shiftIso } from './util.js';

const PEOPLE = [
  ['u1', '김서연', 'seoyeon@example.com'],
  ['u2', '박민준', 'minjun@example.com'],
  ['u3', '이하은', 'haeun@example.com'],
  ['u4', '최도윤', 'doyun@example.com'],
  ['u5', '정하늘', 'haneul@example.com'],
];

function line(type, ko, en, status, priority) {
  return { type, ko, en, status, priority };
}

/** Example workspaces shown on the start screen. `shop` is the long sample used by the tests. */
export const EXAMPLES = [
  { id: 'shop', key: 'SHOP', type: 'software', ko: '온라인 쇼핑몰', en: 'Online shop', about: ['결제, 배송, 고객 지원이 한 작업 공간에 있습니다.', 'Payments, delivery and customer support in one workspace.'], article: ['결제 안내', 'Payment notes'] },
  { id: 'clinic', key: 'CLIN', type: 'service', ko: '동네 의원', en: 'Neighborhood clinic', about: ['접수, 검사, 예약 요청을 기한과 함께 다룹니다.', 'Reception, tests and appointment requests with time limits.'], article: ['접수 안내', 'Reception notes'], issues: [
    line('incident', '오전 접수 지연', 'Morning check-in is slow', 'progress', 'highest'),
    line('request', '독감 예방접종 예약', 'Flu shot appointment', 'todo', 'high'),
    line('incident', '처방전 출력 오류', 'Prescription will not print', 'todo', 'high'),
    line('request', '진료 기록 사본', 'Copy of the chart', 'review', 'medium'),
    line('task', '대기 안내문 교체', 'Replace the waiting-room notice', 'done', 'low'),
  ] },
  { id: 'school', key: 'SCHL', type: 'business', ko: '학교 행사', en: 'School fair', about: ['학예회 준비와 부스, 안내 방송을 칸반으로 나눕니다.', 'A school fair planned on a kanban board.'], article: ['행사 당일 순서', 'Fair day order'], issues: [
    line('story', '무대 순서 확정', 'Lock the stage order', 'progress', 'high'),
    line('task', '부스 자리 배치', 'Lay out the booths', 'todo', 'medium'),
    line('task', '안내 방송 원고', 'Write the announcements', 'review', 'medium'),
    line('bug', '티켓 번호 중복', 'Duplicate ticket numbers', 'todo', 'highest'),
    line('story', '학부모 안내장', 'Letter to families', 'done', 'low'),
  ] },
  { id: 'site', key: 'SITE', type: 'business', ko: '건설 현장', en: 'Construction site', about: ['안전 점검과 자재, 공정 확인을 현장 단위로 적습니다.', 'Safety checks, materials and progress on a job site.'], article: ['안전 수칙', 'Safety rules'], issues: [
    line('task', '오전 안전 점검', 'Morning safety round', 'progress', 'highest'),
    line('task', '철근 입고 확인', 'Confirm the rebar delivery', 'todo', 'high'),
    line('bug', '비계 발판 흔들림', 'Scaffold plank is loose', 'todo', 'highest'),
    line('story', '3층 콘크리트 타설', 'Pour the third-floor slab', 'review', 'high'),
    line('task', '일일 사진 정리', 'File the daily photos', 'done', 'low'),
  ] },
  { id: 'kitchen', key: 'KICH', type: 'service', ko: '식당 주방', en: 'Restaurant kitchen', about: ['주문 누락과 재료 요청을 서비스 대기열로 받습니다.', 'Missing orders and supply requests in a service queue.'], article: ['오늘의 메뉴', "Today's menu"], issues: [
    line('incident', '홀 주문 누락', 'A dining-room order was missed', 'progress', 'highest'),
    line('request', '채소 추가 발주', 'Reorder vegetables', 'todo', 'high'),
    line('incident', '오븐 온도 불안정', 'Oven temperature drifts', 'todo', 'high'),
    line('request', '알레르기 표기 수정', 'Fix the allergy labels', 'review', 'medium'),
    line('task', '마감 청소 점검', 'Closing clean-down', 'done', 'low'),
  ] },
  { id: 'game', key: 'GAME', type: 'software', ko: '모바일 게임', en: 'Mobile game', about: ['시즌 콘텐츠와 결함을 스프린트로 나눕니다.', 'Season content and defects planned in sprints.'], article: ['시즌 목표', 'Season goal'], issues: [
    line('epic', '겨울 시즌', 'Winter season', 'backlog', 'high'),
    line('story', '일일 보상', 'Daily reward', 'progress', 'high'),
    line('bug', '보상 상자 중복 지급', 'Reward chest pays twice', 'todo', 'highest'),
    line('story', '눈사람 코스튬', 'Snowman costume', 'review', 'medium'),
    line('task', '상점 가격표', 'Shop price list', 'done', 'low'),
  ] },
  { id: 'library', key: 'LIBR', type: 'service', ko: '시립 도서관', en: 'City library', about: ['대출, 반납, 희망 도서를 요청으로 받습니다.', 'Loans, returns and purchase requests.'], article: ['대출 규정', 'Lending rules'], issues: [
    line('request', '희망 도서 신청', 'Request a title', 'todo', 'medium'),
    line('incident', '무인 반납기 정지', 'Return kiosk is down', 'progress', 'highest'),
    line('request', '열람실 자리 연장', 'Extend a reading-room seat', 'todo', 'low'),
    line('incident', '회원증 인식 실패', 'Card reader misses cards', 'review', 'high'),
    line('task', '신간 서가 이동', 'Shift the new-books shelf', 'done', 'medium'),
  ] },
  { id: 'legal', key: 'LAWY', type: 'business', ko: '법률 사무소', en: 'Law office', about: ['사건 준비와 기일, 서류 검토를 칸반으로 추적합니다.', 'Case prep, hearings and document review on a board.'], article: ['기일 전 점검', 'Before a hearing'], issues: [
    line('story', '답변서 초안', 'Draft the answer', 'progress', 'high'),
    line('task', '증거 목록 정리', 'Index the exhibits', 'todo', 'medium'),
    line('bug', '제출 기한 날짜 오류', 'Filing date is wrong', 'todo', 'highest'),
    line('task', '의뢰인 면담 기록', 'Write up the client meeting', 'review', 'medium'),
    line('story', '합의안 비교', 'Compare settlement options', 'done', 'high'),
  ] },
  { id: 'plant', key: 'PLNT', type: 'business', ko: '공장 품질', en: 'Plant quality', about: ['불량, 검사, 시정 조치를 한 보드에서 봅니다.', 'Defects, inspections and corrective actions.'], article: ['검사 기준', 'Inspection standard'], issues: [
    line('bug', '도장 두께 미달', 'Paint thickness is low', 'progress', 'highest'),
    line('task', '오전 샘플 채취', 'Morning sample pull', 'todo', 'high'),
    line('story', '시정 조치 보고', 'Corrective-action report', 'review', 'high'),
    line('task', '게이지 교정', 'Calibrate the gauge', 'todo', 'medium'),
    line('task', '지난주 불량 집계', 'Last week’s defect tally', 'done', 'low'),
  ] },
  { id: 'travel', key: 'TRVL', type: 'service', ko: '여행사', en: 'Travel desk', about: ['항공 변경과 비자, 고객 요청을 기한 안에 처리합니다.', 'Flight changes, visas and customer requests against a time limit.'], article: ['변경 수수료', 'Change fees'], issues: [
    line('request', '귀국편 날짜 변경', 'Change the return flight', 'progress', 'high'),
    line('incident', '발권 시스템 지연', 'Ticketing system is slow', 'todo', 'highest'),
    line('request', '비자 서류 확인', 'Check the visa papers', 'todo', 'high'),
    line('request', '호텔 금연 객실', 'Non-smoking hotel room', 'review', 'medium'),
    line('task', '여행자 보험 안내', 'Send the insurance note', 'done', 'low'),
  ] },
  { id: 'estate', key: 'ESTA', type: 'business', ko: '부동산', en: 'Real estate', about: ['매물 점검, 계약, 사진 촬영을 거래별로 나눕니다.', 'Listings, contracts and photo shoots per deal.'], article: ['매물 점검표', 'Listing checklist'], issues: [
    line('story', '강변 아파트 매물', 'Riverside apartment listing', 'progress', 'high'),
    line('task', '현장 사진 촬영', 'Shoot the listing photos', 'todo', 'medium'),
    line('bug', '면적 표기 오류', 'Floor area is wrong', 'todo', 'highest'),
    line('task', '계약서 특약 검토', 'Review the special terms', 'review', 'high'),
    line('story', '오픈하우스 안내', 'Open-house notice', 'done', 'low'),
  ] },
  { id: 'lab', key: 'LABO', type: 'service', ko: '검사실', en: 'Testing lab', about: ['검사 지연과 재검 요청을 접수합니다.', 'Delayed tests and retest requests.'], article: ['검체 접수', 'How samples are received'], issues: [
    line('incident', '혈액 검사 지연', 'Blood test is late', 'progress', 'highest'),
    line('request', '재검 신청', 'Ask for a retest', 'todo', 'high'),
    line('incident', '라벨 바코드 실패', 'Barcode label will not scan', 'todo', 'high'),
    line('request', '결과지 영문 발급', 'English result sheet', 'review', 'medium'),
    line('task', '냉장고 온도 기록', 'Log the fridge temperature', 'done', 'low'),
  ] },
  { id: 'campus', key: 'ADMN', type: 'business', ko: '대학 입학', en: 'Admissions', about: ['지원 서류와 면접, 합격 통보를 단계로 나눕니다.', 'Applications, interviews and offers as stages.'], article: ['서류 마감', 'Document deadline'], issues: [
    line('story', '1차 서류 심사', 'First document review', 'progress', 'high'),
    line('task', '면접 일정 발송', 'Send interview times', 'todo', 'high'),
    line('bug', '수험 번호 누락', 'An applicant number is missing', 'todo', 'highest'),
    line('task', '장학금 기준 정리', 'Write the scholarship rules', 'review', 'medium'),
    line('story', '합격 통보문', 'Offer letter', 'done', 'medium'),
  ] },
  { id: 'fleet', key: 'FLET', type: 'service', ko: '차량 정비', en: 'Fleet workshop', about: ['고장 접수와 정기 점검을 차량 번호로 추적합니다.', 'Breakdowns and scheduled service tracked per vehicle.'], article: ['정기 점검 주기', 'Service intervals'], issues: [
    line('incident', '12호 차 시동 불량', 'Van 12 will not start', 'progress', 'highest'),
    line('request', '3호 차 엔진오일', 'Oil change for van 3', 'todo', 'medium'),
    line('incident', '브레이크 경고등', 'Brake warning lamp', 'todo', 'high'),
    line('request', '타이어 위치 교환', 'Rotate the tires', 'review', 'low'),
    line('task', '정비 일지 이관', 'Move the service log', 'done', 'low'),
  ] },
  { id: 'campaign', key: 'ADSV', type: 'business', ko: '마케팅 캠페인', en: 'Marketing campaign', about: ['카피, 촬영, 게재를 캠페인 보드에서 맞춥니다.', 'Copy, shoots and publishing on one board.'], article: ['캠페인 메시지', 'Campaign message'], issues: [
    line('story', '봄 세일 카피', 'Spring sale copy', 'progress', 'high'),
    line('task', '제품 사진 촬영', 'Product photo shoot', 'todo', 'medium'),
    line('bug', '랜딩 가격 불일치', 'Landing page price is wrong', 'todo', 'highest'),
    line('task', '뉴스레터 검수', 'Proof the newsletter', 'review', 'medium'),
    line('story', '지난 캠페인 회고', 'Last campaign retro', 'done', 'low'),
  ] },
  { id: 'release', key: 'OSRC', type: 'software', ko: '오픈 소스 출시', en: 'Open-source release', about: ['릴리스 노트, 설치, 회귀 결함을 스프린트로 닫습니다.', 'Release notes, installers and regressions in a sprint.'], article: ['릴리스 절차', 'Release steps'], issues: [
    line('epic', '1.2 출시', 'Release 1.2', 'backlog', 'high'),
    line('story', '릴리스 노트', 'Release notes', 'progress', 'medium'),
    line('bug', '윈도 설치 실패', 'Windows installer fails', 'todo', 'highest'),
    line('task', '라이선스 고지', 'License notice', 'review', 'low'),
    line('story', '마이그레이션 안내', 'Migration guide', 'done', 'medium'),
  ] },
  { id: 'hotel', key: 'HOTL', type: 'service', ko: '호텔 프론트', en: 'Hotel front desk', about: ['객실 문제와 투숙 요청을 당일 기한으로 받습니다.', 'Room issues and guest requests due the same day.'], article: ['체크인 순서', 'Check-in order'], issues: [
    line('incident', '1204호 온수 없음', 'Room 1204 has no hot water', 'progress', 'highest'),
    line('request', '레이트 체크아웃', 'Late checkout', 'todo', 'medium'),
    line('incident', '카드키 작동 안 함', 'Key card does not work', 'todo', 'high'),
    line('request', '베개 추가', 'Extra pillows', 'review', 'low'),
    line('task', '야간 인수인계', 'Night handover', 'done', 'medium'),
  ] },
  { id: 'warehouse', key: 'WHSE', type: 'business', ko: '물류 창고', en: 'Warehouse', about: ['입고, 피킹, 재고 차이를 교대 근무로 나눕니다.', 'Inbound, picking and stock gaps across shifts.'], article: ['피킹 동선', 'Pick path'], issues: [
    line('task', '오전 입고 검수', 'Morning inbound check', 'progress', 'high'),
    line('bug', 'A-12 재고 불일치', 'Aisle A-12 count is off', 'todo', 'highest'),
    line('story', '피킹 동선 단축', 'Shorten the pick path', 'todo', 'medium'),
    line('task', '파손 박스 격리', 'Quarantine damaged boxes', 'review', 'high'),
    line('task', '야간 재고 실사', 'Night cycle count', 'done', 'medium'),
  ] },
  { id: 'studio', key: 'DESN', type: 'software', ko: '디자인 스튜디오', en: 'Design studio', about: ['화면 시안과 디자인 결함을 스프린트에 올립니다.', 'Screen comps and design defects in a sprint.'], article: ['화면 원칙', 'Screen principles'], issues: [
    line('epic', '설정 화면', 'Settings screens', 'backlog', 'medium'),
    line('story', '빈 상태 일러스트', 'Empty-state illustration', 'progress', 'medium'),
    line('bug', '버튼 대비 부족', 'Button contrast is too low', 'todo', 'high'),
    line('story', '다크 모드 색', 'Dark theme colors', 'review', 'medium'),
    line('task', '아이콘 격자 정리', 'Align the icon grid', 'done', 'low'),
  ] },
  { id: 'transit', key: 'TRNS', type: 'service', ko: '대중교통 장애', en: 'Transit incidents', about: ['지연, 차량 고장, 안내 방송을 장애로 올립니다.', 'Delays, vehicle faults and passenger notices as incidents.'], article: ['지연 안내 문구', 'Delay notice wording'], issues: [
    line('incident', '2호선 신호 장애', 'Line 2 signal fault', 'progress', 'highest'),
    line('incident', '정류장 안내판 꺼짐', 'Stop display is dark', 'todo', 'high'),
    line('request', '막차 시간 문의', 'Last-train question', 'todo', 'medium'),
    line('incident', '버스 냉방 고장', 'Bus air-conditioning failed', 'review', 'high'),
    line('task', '우회 노선 게시', 'Post the detour', 'done', 'medium'),
  ] },
  { id: 'bakery', key: 'BAKE', type: 'service', ko: '빵집 주문', en: 'Bakery orders', about: ['예약 빵과 픽업 누락을 주문 단위로 받습니다.', 'Preorders and missed pickups, one request at a time.'], article: ['예약 마감 시각', 'Preorder cutoff'], issues: [
    line('request', '주말 케이크 예약', 'Weekend cake preorder', 'progress', 'high'),
    line('incident', '크루아상 반죽 실패', 'Croissant dough failed', 'todo', 'highest'),
    line('request', '글루텐 프리 식빵', 'Gluten-free loaf', 'todo', 'medium'),
    line('request', '픽업 시간 변경', 'Change the pickup time', 'review', 'low'),
    line('task', '진열 사진 교체', 'Refresh the display photos', 'done', 'low'),
  ] },
  { id: 'research', key: 'RLAB', type: 'software', ko: '연구소', en: 'Research lab', about: ['실험 도구와 데이터 파이프라인을 소프트웨어 과제로 다룹니다.', 'Lab tools and the data pipeline as a software project.'], article: ['실험 기록 형식', 'How to log a run'], issues: [
    line('epic', '샘플 추적', 'Sample tracking', 'backlog', 'high'),
    line('story', '측정값 가져오기', 'Import measurements', 'progress', 'high'),
    line('bug', '시간대 밀림', 'Timestamps shift by a day', 'todo', 'highest'),
    line('task', '그래프 축 눈금', 'Axis ticks on the chart', 'review', 'medium'),
    line('story', '실험 노트 내보내기', 'Export the lab notebook', 'done', 'medium'),
  ] },
  { id: 'claim', key: 'CLAM', type: 'service', ko: '보험 청구', en: 'Insurance claims', about: ['청구 접수와 서류 누락을 기한 안에 처리합니다.', 'Claims and missing documents against a time limit.'], article: ['청구 서류', 'Claim documents'], issues: [
    line('request', '자동차 보험 청구', 'Auto claim', 'progress', 'high'),
    line('incident', '사진 업로드 실패', 'Photo upload failed', 'todo', 'highest'),
    line('request', '병원 영수증 추가', 'Add the hospital receipt', 'todo', 'medium'),
    line('request', '지급 계좌 변경', 'Change the payout account', 'review', 'high'),
    line('task', '약관 조항 안내', 'Point to the policy clause', 'done', 'low'),
  ] },
  { id: 'stage', key: 'PLAY', type: 'business', ko: '공연 제작', en: 'Stage production', about: ['대본, 리허설, 소품을 공연 일정에 맞춰 놓습니다.', 'Script, rehearsals and props against the show date.'], article: ['리허설 규칙', 'Rehearsal rules'], issues: [
    line('story', '2막 대본 수정', 'Revise act two', 'progress', 'high'),
    line('task', '조명 큐 표시', 'Mark the lighting cues', 'todo', 'medium'),
    line('bug', '소품 목록 누락', 'A prop is missing from the list', 'todo', 'high'),
    line('task', '의상 피팅', 'Costume fitting', 'review', 'medium'),
    line('story', '공연 당일 동선', 'Show-day traffic plan', 'done', 'high'),
  ] },
  { id: 'bank', key: 'BANK', type: 'software', ko: '모바일 뱅킹 앱', en: 'Mobile banking app', about: ['이체, 인증, 보안 결함을 스프린트로 나눕니다.', 'Transfers, sign-in and security fixes in sprints.'], article: ['보안 점검 목록', 'Security checklist'], issues: [
    line('epic', '간편 이체', 'Quick transfers', 'backlog', 'high'),
    line('story', '생체 인증 로그인', 'Biometric sign-in', 'progress', 'highest'),
    line('bug', '이체 한도 표시 오류', 'Transfer limit shows wrong', 'todo', 'highest'),
    line('story', '거래 내역 검색', 'Search the transaction history', 'review', 'medium'),
    line('task', '앱 스토어 설명 갱신', 'Update the store listing', 'done', 'low'),
  ] },
  { id: 'saas', key: 'SAAS', type: 'software', ko: 'B2B SaaS 플랫폼', en: 'B2B SaaS platform', about: ['요금제, 관리자 화면, 고객 결함을 로드맵에 놓습니다.', 'Plans, the admin console and customer bugs on a roadmap.'], article: ['온보딩 절차', 'Onboarding steps'], issues: [
    line('epic', '팀 요금제', 'Team plan', 'backlog', 'high'),
    line('story', 'SSO 로그인', 'Single sign-on', 'progress', 'high'),
    line('bug', '청구서 통화 표기 오류', 'Invoice shows the wrong currency', 'todo', 'highest'),
    line('story', '사용량 대시보드', 'Usage dashboard', 'review', 'medium'),
    line('task', '데이터 보존 정책 문서', 'Data retention policy page', 'done', 'low'),
  ] },
  { id: 'iot', key: 'IOTH', type: 'software', ko: '스마트홈 IoT', en: 'Smart home IoT', about: ['펌웨어, 앱 연동, 기기 결함을 릴리스로 묶습니다.', 'Firmware, app pairing and device defects grouped by release.'], article: ['펌웨어 배포 순서', 'Firmware rollout order'], issues: [
    line('epic', '음성 비서 연동', 'Voice assistant support', 'backlog', 'high'),
    line('story', '기기 자동 등록', 'Automatic device pairing', 'progress', 'high'),
    line('bug', '조명 예약이 꺼지지 않음', 'Light schedule never turns off', 'todo', 'highest'),
    line('task', '펌웨어 2.1 서명', 'Sign firmware 2.1', 'review', 'high'),
    line('task', '배터리 소모 측정', 'Measure battery drain', 'done', 'medium'),
  ] },
  { id: 'ai', key: 'AIML', type: 'software', ko: 'AI 추천 서비스', en: 'AI recommendations', about: ['모델 학습, 평가, 서빙 결함을 실험 단위로 추적합니다.', 'Model training, evaluation and serving issues per experiment.'], article: ['모델 평가 기준', 'Model evaluation bar'], issues: [
    line('epic', '개인화 추천 v2', 'Personalised recommendations v2', 'backlog', 'high'),
    line('story', '학습 데이터 정제', 'Clean the training data', 'progress', 'high'),
    line('bug', '추천 응답 지연', 'Recommendation latency spikes', 'todo', 'highest'),
    line('task', 'A/B 실험 설계', 'Design the A/B test', 'review', 'medium'),
    line('task', '모델 카드 작성', 'Write the model card', 'done', 'low'),
  ] },
  { id: 'web', key: 'WEBR', type: 'software', ko: '회사 웹사이트 개편', en: 'Website redesign', about: ['화면 개편, 콘텐츠 이전, 접근성 결함을 스프린트로 닫습니다.', 'New pages, content migration and accessibility fixes in sprints.'], article: ['콘텐츠 작성 원칙', 'Content style guide'], issues: [
    line('epic', '새 메인 화면', 'New home page', 'backlog', 'high'),
    line('story', '블로그 이전', 'Move the blog', 'progress', 'medium'),
    line('bug', '모바일 메뉴가 닫히지 않음', 'Mobile menu will not close', 'todo', 'highest'),
    line('task', '접근성 점검', 'Accessibility audit', 'review', 'high'),
    line('task', '검색 엔진 설정', 'Search engine settings', 'done', 'low'),
  ] },
  { id: 'hr', key: 'HRON', type: 'business', ko: '인사 채용', en: 'Hiring and onboarding', about: ['채용 공고, 면접, 입사 준비를 단계별 보드에서 봅니다.', 'Job posts, interviews and onboarding on a board of stages.'], article: ['면접 진행 안내', 'Interview guide'], issues: [
    line('story', '백엔드 개발자 공고', 'Backend developer posting', 'progress', 'high'),
    line('task', '면접 일정 조율', 'Schedule the interviews', 'todo', 'high'),
    line('task', '입사자 장비 준비', 'Get equipment ready for new hires', 'todo', 'medium'),
    line('bug', '지원서 첨부 누락', 'Application attachments went missing', 'review', 'highest'),
    line('story', '온보딩 첫 주 일정', 'First-week onboarding plan', 'done', 'medium'),
  ] },
];

function text(lang, ko, en) {
  return lang === 'en' ? en : ko;
}

function build(spec, now, lang) {
  const ws = {
    format: 'myworkforce', version: 1, kind: 'workspace', savedAt: null,
    currentUserId: 'u1', activeProjectId: null,
    users: PEOPLE.map(([id, name, email]) => ({ id, name, email, active: true })),
    groups: [],
    projects: [],
  };
  const project = newProject(ws, {
    name: text(lang, spec.ko, spec.en),
    key: spec.key,
    type: spec.type,
    description: text(lang, spec.about[0], spec.about[1]),
    leadId: 'u1',
  });
  project.id = `p-${spec.id}`;
  project.members = PEOPLE.map(([id], index) => ({ userId: id, role: index === 0 ? 'administrator' : index < 3 ? 'developer' : index === 3 ? 'tester' : 'customer' }));
  const sprint = spec.type === 'software' ? project.sprints[0] : null;
  if (sprint) {
    sprint.state = 'active';
    sprint.name = text(lang, '이번 스프린트', 'Current sprint');
  }
  spec.issues.forEach((issue, index) => {
    const inSprint = Boolean(sprint) && issue.type !== 'epic' && issue.status !== 'backlog';
    makeIssue(project, {
      id: `${spec.id}-${index + 1}`,
      key: `${spec.key}-${index + 1}`,
      typeId: issue.type,
      summary: text(lang, issue.ko, issue.en),
      description: text(lang, spec.about[0], spec.about[1]),
      statusId: issue.status,
      priorityId: issue.priority,
      assigneeId: PEOPLE[index % PEOPLE.length][0],
      reporterId: 'u1',
      sprintId: inSprint ? sprint.id : '',
      storyPoints: issue.type === 'story' || issue.type === 'bug' ? [5, 3, 8, 2, 1][index % 5] : null,
      resolutionId: issue.status === 'done' ? 'fixed' : '',
      rank: (index + 1) * 10,
      created: shiftIso(now, -18 + index),
      updated: shiftIso(now, -6 + index),
    }, 'u1');
  });
  ensureServices(ws);
  addArticle(ws, { projectId: project.id, title: text(lang, spec.article[0], spec.article[1]), body: text(lang, spec.about[0], spec.about[1]) }, 'u1');
  const calendar = addCalendar(ws, { name: text(lang, '기본 근무', 'Working hours'), timezone: 'Asia/Seoul' });
  ws.calendarId = calendar.id;
  ws.activeProjectId = project.id;
  return ws;
}

export function exampleWorkspace(id, now = Date.now(), lang = 'ko') {
  if (id === 'shop') return sampleWorkspace(now);
  const spec = EXAMPLES.find((item) => item.id === id);
  if (!spec) throw new Error('not-found');
  return build(spec, now, lang);
}
