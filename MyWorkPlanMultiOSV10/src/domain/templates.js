// Ready-made plans: the templates offered by File › New and the demo plan used
// by the tutorial and the screenshots. Each template is written once as a
// compact spec with Korean and English text side by side and built with the
// ordinary edit functions, so it is exactly what a user could have typed.
//
// Spec rows: [outlineLevel, key, { ko, en } name, duration, options]
//   duration: '5d' / '2w' / '4h' / '7ed', 0 for a milestone, null for a summary
//   options:  p  predecessors 'a, b:SS+2d, c:FF, d:FS-1d, e:SS+50%'
//             r  resources 'pm, dev:0.5, concrete:180'   cost  { resourceKey: [krw, usd] }
//             note, pr (priority), snet (calendar days after the start), deadline (true)
import { parseDuration, parseLag } from './duration.js';
import { addException, addResource, assignResource, createProject, insertTask, linkTasks, setTaskDuration, updateTask } from './project.js';
import { schedule } from './schedule.js';
import { dayOf, dayStart, fromMin, isoDay, nowMin, parts, toMin, weekdayOfDay } from './time.js';

const T = (ko, en) => ({ ko, en });

export const TEMPLATES = [
  { id: 'blank', icon: 'blank', name: T('빈 프로젝트', 'Blank project'), description: T('작업 없이 빈 계획에서 시작합니다.', 'Start from an empty plan.') },
  { id: 'software', icon: 'tplSoftware', name: T('소프트웨어 개발', 'Software development'), description: T('요구사항부터 설계·개발·테스트·배포까지 이어지는 개발 프로젝트입니다.', 'Requirements, design, build, testing and release of a software product.') },
  { id: 'construction', icon: 'tplBuild', name: T('건축 공사', 'Building construction'), description: T('허가와 착공 준비, 기초·골조·설비·마감 공사, 준공까지의 공정표입니다.', 'Permits, foundation, structure, services, finishes and handover of a small building.') },
  { id: 'event', icon: 'tplEvent', name: T('행사 기획', 'Event planning'), description: T('장소 섭외와 홍보, 운영 준비, 당일 진행과 사후 정리까지 담은 행사 계획입니다.', 'Venue, speakers, promotion, logistics, the event day and the wrap-up.') },
  { id: 'marketing', icon: 'tplMarketing', name: T('마케팅 캠페인', 'Marketing campaign'), description: T('시장 조사와 크리에이티브 제작, 채널 준비, 캠페인 집행과 성과 분석을 다룹니다.', 'Research, creative work, channel setup, the campaign itself and the results.') },
  { id: 'launch', icon: 'tplLaunch', name: T('제품 출시', 'Product launch'), description: T('제품 마무리와 영업·지원 준비를 거쳐 출시와 초기 대응까지 진행합니다.', 'Final QA, go-to-market, support readiness, launch day and early feedback.') },
  { id: 'research', icon: 'tplResearch', name: T('연구 프로젝트', 'Research study'), description: T('연구 설계와 윤리 심의, 데이터 수집과 분석, 보고서 작성까지의 연구 일정입니다.', 'Study design, ethics review, data collection, analysis and the final report.') },
  { id: 'move', icon: 'tplMove', name: T('사무실 이전', 'Office move'), description: T('새 사무실 계약과 공사, 짐 꾸리기, 이사 당일과 기존 사무실 반납까지 챙깁니다.', 'Lease, fit-out, packing, the move itself and handing back the old office.') },
];

const CALENDAR_NAMES = {
  ko: { standard: '표준', allDay: '24시간', night: '야간 교대' },
  en: { standard: 'Standard', allDay: '24 Hours', night: 'Night Shift' },
};

// ───────────────────────── template specs

const SPECS = {
  software: {
    title: T('소프트웨어 개발 프로젝트', 'Software Development Project'),
    resources: [
      { k: 'pm', name: T('프로젝트 관리자', 'Project Manager'), initials: T('PM', 'PM'), group: T('관리', 'Management'), rate: [95000, 85] },
      { k: 'lead', name: T('기술 리더', 'Tech Lead'), initials: T('TL', 'TL'), group: T('개발', 'Engineering'), rate: [105000, 100] },
      { k: 'ba', name: T('업무 분석가', 'Business Analyst'), initials: T('BA', 'BA'), group: T('기획', 'Planning'), rate: [70000, 65] },
      { k: 'be', name: T('백엔드 개발자', 'Backend Developer'), initials: T('BE', 'BE'), group: T('개발', 'Engineering'), rate: [80000, 75] },
      { k: 'fe', name: T('프런트엔드 개발자', 'Frontend Developer'), initials: T('FE', 'FE'), group: T('개발', 'Engineering'), rate: [75000, 70] },
      { k: 'ux', name: T('UX 디자이너', 'UX Designer'), initials: T('UX', 'UX'), group: T('디자인', 'Design'), rate: [65000, 60] },
      { k: 'qa', name: T('QA 엔지니어', 'QA Engineer'), initials: T('QA', 'QA'), group: T('품질', 'Quality'), rate: [60000, 55] },
      { k: 'cloud', type: 'cost', name: T('클라우드 사용료', 'Cloud hosting'), initials: T('CL', 'CL'), group: T('비용', 'Costs') },
    ],
    tasks: [
      [1, 'plan', T('착수 및 요구사항', 'Initiation and requirements'), null],
      [2, 'kickoff', T('킥오프 회의', 'Kickoff meeting'), '4h', { r: 'pm, ba', note: T('목표와 범위, 역할 분담, 보고 주기를 함께 정합니다.', 'Agree on goals, scope, roles and how often we report progress.') }],
      [2, 'req', T('요구사항 수집', 'Gather requirements'), '5d', { p: 'kickoff', r: 'ba:0.5, pm:0.5' }],
      [2, 'spec', T('요구사항 명세서 작성', 'Write the requirements specification'), '4d', { p: 'req:SS+3d', r: 'ba:0.5' }],
      [2, 'reqOk', T('요구사항 승인', 'Requirements signed off'), 0, { p: 'spec' }],
      [1, 'design', T('설계', 'Design'), null],
      [2, 'arch', T('시스템 아키텍처 설계', 'Design the system architecture'), '1w', { p: 'reqOk', r: 'lead, pm:0.25' }],
      [2, 'uxd', T('화면 설계', 'User experience'), null],
      [3, 'wire', T('와이어프레임', 'Wireframes'), '4d', { p: 'reqOk', r: 'ux' }],
      [3, 'proto', T('프로토타입 및 사용성 검토', 'Prototype and usability review'), '3d', { p: 'wire', r: 'ux, ba:0.5' }],
      [2, 'db', T('데이터베이스 설계', 'Design the database'), '3d', { p: 'arch:SS+2d', r: 'be:0.5' }],
      [2, 'designOk', T('설계 검토 완료', 'Design review passed'), 0, { p: 'arch, proto, db' }],
      [1, 'build', T('개발', 'Development'), null],
      [2, 'env', T('개발 환경 구축', 'Set up the development environment'), '2d', { p: 'arch', r: 'be:0.5', cost: { cloud: [800000, 600] } }],
      [2, 'backend', T('백엔드', 'Back end'), null],
      [3, 'api', T('API 개발', 'Build the APIs'), '3w', { p: 'designOk, env', r: 'be', pr: 800, note: T('외부 결제 API 연동 일정은 협력사 회신에 따라 달라질 수 있습니다.', 'The payment API depends on the partner\'s sandbox being ready.') }],
      [3, 'auth', T('인증·권한 기능', 'Authentication and permissions'), '6d', { p: 'api:SS+5d', r: 'lead:0.5' }],
      [2, 'frontend', T('프런트엔드', 'Front end'), null],
      [3, 'ui', T('화면 구현', 'Build the screens'), '2w', { p: 'designOk', r: 'fe' }],
      [3, 'integ', T('API 연동', 'Connect the screens to the APIs'), '1w', { p: 'api:FS-3d, ui', r: 'fe' }],
      [2, 'review', T('코드 리뷰', 'Code reviews'), '5d', { p: 'integ:FF', r: 'lead:0.5' }],
      [2, 'featureDone', T('기능 개발 완료', 'Feature complete'), 0, { p: 'review, auth' }],
      [1, 'test', T('테스트', 'Testing'), null],
      [2, 'testPlan', T('테스트 계획 수립', 'Write the test plan'), '3d', { p: 'api:SS+50%', r: 'qa' }],
      [2, 'sysTest', T('통합 테스트', 'Integration testing'), '2w', { p: 'featureDone, testPlan', r: 'qa, be:0.5' }],
      [2, 'bugfix', T('결함 수정', 'Fix defects'), '1w', { p: 'sysTest:SS+3d', r: 'fe:0.5, be:0.25' }],
      [2, 'perf', T('성능 테스트', 'Performance testing'), '3d', { p: 'sysTest', r: 'qa:0.5, be:0.5', cost: { cloud: [500000, 400] } }],
      [2, 'uat', T('사용자 인수 테스트', 'User acceptance testing'), '1w', { p: 'bugfix, perf', r: 'ba, qa:0.5', snet: 63 }],
      [1, 'release', T('배포', 'Release'), null],
      [2, 'deployPrep', T('배포 준비', 'Prepare the deployment'), '2d', { p: 'uat', r: 'be' }],
      [2, 'golive', T('운영 배포', 'Deploy to production'), '4h', { p: 'deployPrep', r: 'be, pm', pr: 900 }],
      [2, 'handover', T('운영 인수인계', 'Hand over to operations'), '3d', { p: 'golive', r: 'pm:0.5, be:0.5' }],
      [2, 'done', T('프로젝트 종료', 'Project closed'), 0, { p: 'handover', deadline: true }],
    ],
  },

  construction: {
    title: T('상가 건물 신축 공사', 'Small Commercial Building'),
    resources: [
      { k: 'site', name: T('현장 소장', 'Site Manager'), initials: T('소장', 'SM'), group: T('관리', 'Management'), rate: [85000, 80] },
      { k: 'eng', name: T('공무 담당', 'Project Engineer'), initials: T('공무', 'PE'), group: T('관리', 'Management'), rate: [60000, 55] },
      { k: 'crew', name: T('골조팀', 'Framing Crew'), initials: T('골조', 'FC'), group: T('시공', 'Construction'), rate: [45000, 45], max: 3 },
      { k: 'elec', name: T('전기 기사', 'Electrician'), initials: T('전기', 'EL'), group: T('설비', 'Trades'), rate: [55000, 60] },
      { k: 'plumb', name: T('설비 기사', 'Plumber'), initials: T('설비', 'PL'), group: T('설비', 'Trades'), rate: [52000, 58] },
      { k: 'fin', name: T('마감팀', 'Finishing Crew'), initials: T('마감', 'FN'), group: T('시공', 'Construction'), rate: [40000, 40], max: 4 },
      { k: 'concrete', type: 'material', name: T('레미콘', 'Ready-mix concrete'), initials: T('레미', 'RC'), group: T('자재', 'Materials'), rate: [95000, 140], label: T('㎥', 'm³') },
      { k: 'rebar', type: 'material', name: T('철근', 'Rebar'), initials: T('철근', 'RB'), group: T('자재', 'Materials'), rate: [900000, 850], label: T('톤', 't') },
    ],
    tasks: [
      [1, 'pre', T('착공 준비', 'Pre-construction'), null],
      [2, 'permit', T('건축 허가 취득', 'Obtain the building permit'), '3w', { r: 'eng:0.5', pr: 900, note: T('구청 심사 기간에 따라 1~2주 늦어질 수 있습니다.', 'The city review can take one or two weeks longer than planned.') }],
      [2, 'survey', T('측량 및 지반 조사', 'Survey and soil test'), '1w', { p: 'permit:SS+5d', r: 'eng:0.5' }],
      [2, 'mobilize', T('현장 가설 및 착공 준비', 'Site setup and mobilization'), '4d', { p: 'permit, survey', r: 'site, crew' }],
      [2, 'ntp', T('착공', 'Groundbreaking'), 0, { p: 'mobilize' }],
      [1, 'foundation', T('토공 및 기초', 'Sitework and foundation'), null],
      [2, 'excav', T('터파기', 'Excavation'), '6d', { p: 'ntp', r: 'crew:2, site:0.5' }],
      [2, 'footing', T('기초 철근 배근', 'Footing rebar'), '4d', { p: 'excav', r: 'crew:2, rebar:12' }],
      [2, 'pour', T('기초 콘크리트 타설', 'Pour the foundation'), '2d', { p: 'footing', r: 'crew:2, concrete:180' }],
      [2, 'cure', T('콘크리트 양생', 'Concrete curing'), '7ed', { p: 'pour', note: T('양생은 주말에도 진행되므로 경과 일수로 잡았습니다.', 'Curing goes on over weekends, so it is planned in elapsed days.') }],
      [1, 'frame', T('골조 공사', 'Structure'), null],
      [2, 'f1', T('1층 골조', 'Ground floor frame'), '2w', { p: 'cure', r: 'crew:2, concrete:120, rebar:8' }],
      [2, 'f2', T('2층 골조', 'Second floor frame'), '2w', { p: 'f1', r: 'crew:2, concrete:110, rebar:7' }],
      [2, 'roof', T('지붕 공사', 'Roofing'), '1w', { p: 'f2', r: 'crew' }],
      [2, 'topOut', T('골조 완료', 'Structure topped out'), 0, { p: 'roof' }],
      [1, 'mep', T('설비 및 외장 공사', 'Building services and envelope'), null],
      [2, 'elecR', T('전기 배관·배선', 'Electrical rough-in'), '8d', { p: 'f2:SS+3d', r: 'elec' }],
      [2, 'plumbR', T('급배수 배관', 'Plumbing rough-in'), '7d', { p: 'f2:SS+3d', r: 'plumb' }],
      [2, 'windows', T('창호 설치', 'Install windows and doors'), '5d', { p: 'topOut', r: 'fin' }],
      [2, 'insp', T('중간 검사', 'Rough-in inspection'), '1d', { p: 'elecR, plumbR', r: 'site, eng', snet: 91 }],
      [1, 'finishes', T('마감 공사', 'Finishes'), null],
      [2, 'drywall', T('내벽 및 천장', 'Drywall and ceilings'), '2w', { p: 'insp, windows', r: 'fin:2' }],
      [2, 'paint', T('도장', 'Painting'), '6d', { p: 'drywall:SS+5d', r: 'fin' }],
      [2, 'floor', T('바닥 마감', 'Flooring'), '5d', { p: 'paint:FF+2d', r: 'fin:0.5' }],
      [2, 'fixtures', T('조명·위생기구 설치', 'Lights and plumbing fixtures'), '4d', { p: 'paint', r: 'elec:0.5, plumb:0.5' }],
      [2, 'clean', T('준공 청소', 'Final cleaning'), '2d', { p: 'floor, fixtures', r: 'fin' }],
      [1, 'close', T('준공', 'Completion'), null],
      [2, 'final', T('사용 승인 검사', 'Final inspection'), '2d', { p: 'clean', r: 'site, eng', pr: 800 }],
      [2, 'punch', T('하자 보수', 'Punch list'), '4d', { p: 'final:FS-1d', r: 'fin' }],
      [2, 'handover', T('준공 및 인도', 'Handover to the owner'), 0, { p: 'punch', deadline: true }],
    ],
  },

  event: {
    title: T('연례 컨퍼런스 개최', 'Annual Conference'),
    resources: [
      { k: 'lead', name: T('행사 총괄', 'Event Lead'), initials: T('총괄', 'EL'), group: T('운영', 'Operations'), rate: [80000, 75] },
      { k: 'coord', name: T('운영 담당', 'Event Coordinator'), initials: T('운영', 'EC'), group: T('운영', 'Operations'), rate: [50000, 45] },
      { k: 'mkt', name: T('홍보 담당', 'Marketing Specialist'), initials: T('홍보', 'MS'), group: T('마케팅', 'Marketing'), rate: [55000, 50] },
      { k: 'design', name: T('그래픽 디자이너', 'Graphic Designer'), initials: T('디자', 'GD'), group: T('디자인', 'Design'), rate: [50000, 48] },
      { k: 'print', type: 'material', name: T('인쇄물', 'Printed materials'), initials: T('인쇄', 'PR'), group: T('자재', 'Materials'), rate: [1500, 1.2], label: T('부', 'copies') },
      { k: 'venue', type: 'cost', name: T('대관료', 'Venue rental'), initials: T('대관', 'VR'), group: T('비용', 'Costs') },
      { k: 'catering', type: 'cost', name: T('케이터링', 'Catering'), initials: T('식음', 'CT'), group: T('비용', 'Costs') },
    ],
    tasks: [
      [1, 'plan', T('기획', 'Planning'), null],
      [2, 'goals', T('행사 목표와 예산 수립', 'Set goals and budget'), '3d', { r: 'lead', note: T('참가 목표 300명, 예산은 지난해 대비 10% 이내로 잡습니다.', 'Aim for 300 attendees and keep the budget within 10% of last year.') }],
      [2, 'venueSearch', T('장소 물색', 'Shortlist venues'), '1w', { p: 'goals:SS+1d', r: 'coord' }],
      [2, 'venueBook', T('장소 계약', 'Book the venue'), '2d', { p: 'venueSearch', r: 'lead:0.5', pr: 800, cost: { venue: [6500000, 5200] } }],
      [2, 'speakers', T('연사 섭외', 'Invite speakers'), '3w', { p: 'goals', r: 'lead:0.5' }],
      [2, 'planOk', T('기획 확정', 'Plan approved'), 0, { p: 'venueBook' }],
      [1, 'promo', T('홍보', 'Promotion'), null],
      [2, 'brand', T('행사 브랜딩', 'Event branding'), '4d', { p: 'planOk', r: 'design' }],
      [2, 'page', T('행사 페이지 제작', 'Build the event page'), '5d', { p: 'brand', r: 'design:0.5, mkt:0.5' }],
      [2, 'reg', T('참가 등록 시작', 'Registration opens'), 0, { p: 'page' }],
      [2, 'campaign', T('홍보 캠페인', 'Promotion campaign'), '4w', { p: 'reg', r: 'mkt:0.5' }],
      [2, 'press', T('보도자료 배포', 'Send the press release'), '1d', { p: 'campaign:FS-5d', r: 'mkt:0.5' }],
      [1, 'logistics', T('운영 준비', 'Logistics'), null],
      [2, 'agenda', T('세부 프로그램 확정', 'Finalize the agenda'), '3d', { p: 'speakers', r: 'lead, coord:0.5' }],
      [2, 'cater', T('케이터링 계약', 'Arrange catering'), '2d', { p: 'planOk', r: 'coord:0.5', cost: { catering: [9000000, 7500] } }],
      [2, 'av', T('음향·영상 장비 예약', 'Book AV equipment'), '1d', { p: 'venueBook', r: 'coord:0.5' }],
      [2, 'printing', T('인쇄물 제작', 'Print materials'), '3d', { p: 'agenda', r: 'design:0.5, print:500' }],
      [2, 'staff', T('진행 요원 교육', 'Brief the event staff'), '4h', { p: 'agenda', r: 'coord', snet: 49 }],
      [2, 'rehearsal', T('리허설', 'Rehearsal'), '4h', { p: 'printing, staff, av', r: 'lead, coord', pr: 900 }],
      [1, 'event', T('행사', 'Event'), null],
      [2, 'day', T('행사 당일 운영', 'Run the event'), '1d', { p: 'rehearsal, campaign', r: 'lead, coord, mkt' }],
      [2, 'eventDone', T('행사 종료', 'Event completed'), 0, { p: 'day', deadline: true }],
      [1, 'wrap', T('사후 정리', 'Wrap-up'), null],
      [2, 'feedback', T('만족도 조사', 'Attendee survey'), '3d', { p: 'eventDone', r: 'mkt:0.5' }],
      [2, 'settle', T('비용 정산', 'Settle the invoices'), '2d', { p: 'eventDone', r: 'coord' }],
      [2, 'report', T('결과 보고서 작성', 'Write the final report'), '3d', { p: 'feedback:FF, settle', r: 'lead' }],
      [2, 'closed', T('프로젝트 종료', 'Project closed'), 0, { p: 'report' }],
    ],
  },

  marketing: {
    title: T('신제품 마케팅 캠페인', 'Product Marketing Campaign'),
    resources: [
      { k: 'mgr', name: T('마케팅 매니저', 'Marketing Manager'), initials: T('MM', 'MM'), group: T('마케팅', 'Marketing'), rate: [90000, 80] },
      { k: 'copy', name: T('카피라이터', 'Copywriter'), initials: T('CW', 'CW'), group: T('크리에이티브', 'Creative'), rate: [50000, 45] },
      { k: 'design', name: T('디자이너', 'Designer'), initials: T('DS', 'DS'), group: T('크리에이티브', 'Creative'), rate: [55000, 50] },
      { k: 'analyst', name: T('데이터 분석가', 'Data Analyst'), initials: T('DA', 'DA'), group: T('분석', 'Analytics'), rate: [65000, 60] },
      { k: 'ads', type: 'cost', name: T('광고 집행비', 'Ad spend'), initials: T('AD', 'AD'), group: T('비용', 'Costs') },
      { k: 'video', type: 'cost', name: T('영상 제작사', 'Video production'), initials: T('VP', 'VP'), group: T('비용', 'Costs') },
    ],
    tasks: [
      [1, 'research', T('시장 조사', 'Research'), null],
      [2, 'market', T('시장·경쟁사 분석', 'Market and competitor analysis'), '1w', { r: 'analyst' }],
      [2, 'persona', T('고객 페르소나 정의', 'Define customer personas'), '3d', { p: 'market:SS+2d', r: 'mgr' }],
      [2, 'brief', T('캠페인 브리프 작성', 'Write the campaign brief'), '2d', { p: 'persona', r: 'mgr' }],
      [2, 'briefOk', T('브리프 승인', 'Brief approved'), 0, { p: 'brief' }],
      [1, 'creative', T('크리에이티브 제작', 'Creative'), null],
      [2, 'concept', T('콘셉트 개발', 'Develop concepts'), '4d', { p: 'briefOk', r: 'copy, design' }],
      [2, 'copyW', T('카피 작성', 'Write the copy'), '5d', { p: 'concept', r: 'copy' }],
      [2, 'visuals', T('비주얼 제작', 'Design the visuals'), '6d', { p: 'concept', r: 'design' }],
      [2, 'videoT', T('홍보 영상 제작', 'Produce the promo video'), '3w', { p: 'concept', r: 'mgr:0.25', cost: { video: [15000000, 12000] }, note: T('촬영은 외부 제작사에 맡기고, 편집 시안은 두 번까지 검토합니다.', 'Filming is done by an agency; we review up to two rounds of edits.') }],
      [2, 'legal', T('법무 검토', 'Legal review'), '2d', { p: 'copyW, visuals', r: 'mgr:0.5', pr: 800 }],
      [1, 'channels', T('채널 준비', 'Channel setup'), null],
      [2, 'landing', T('랜딩 페이지 제작', 'Build the landing page'), '1w', { p: 'legal', r: 'design:0.5, copy:0.5' }],
      [2, 'adsSetup', T('광고 계정 설정', 'Set up ad accounts'), '2d', { p: 'briefOk', r: 'analyst' }],
      [2, 'email', T('이메일 시퀀스 작성', 'Write the email sequence'), '3d', { p: 'legal', r: 'copy:0.5' }],
      [2, 'tracking', T('성과 측정 설정', 'Set up tracking'), '2d', { p: 'landing:FF', r: 'analyst' }],
      [1, 'run', T('캠페인 집행', 'Campaign'), null],
      [2, 'golive', T('캠페인 시작', 'Campaign launch'), 0, { p: 'landing, email, adsSetup, tracking, videoT', snet: 42 }],
      [2, 'paid', T('유료 광고 집행', 'Run paid ads'), '4w', { p: 'golive', r: 'analyst:0.25', cost: { ads: [30000000, 25000] } }],
      [2, 'social', T('소셜 미디어 운영', 'Social media posts'), '4w', { p: 'golive', r: 'copy:0.5' }],
      [2, 'midReview', T('중간 성과 점검', 'Mid-campaign review'), '4h', { p: 'paid:SS+2w', r: 'mgr, analyst', pr: 700 }],
      [2, 'optimize', T('광고 최적화', 'Optimize the ads'), '1w', { p: 'midReview', r: 'analyst:0.5' }],
      [1, 'results', T('성과 분석', 'Results'), null],
      [2, 'analysis', T('결과 분석', 'Analyze the results'), '4d', { p: 'paid, social', r: 'analyst' }],
      [2, 'present', T('성과 보고', 'Present the results'), '1d', { p: 'analysis', r: 'mgr' }],
      [2, 'done', T('캠페인 종료', 'Campaign closed'), 0, { p: 'present', deadline: true }],
    ],
  },

  launch: {
    title: T('신제품 출시', 'New Product Launch'),
    resources: [
      { k: 'pm', name: T('제품 관리자', 'Product Manager'), initials: T('PM', 'PM'), group: T('제품', 'Product'), rate: [95000, 90] },
      { k: 'eng', name: T('엔지니어', 'Engineer'), initials: T('EN', 'EN'), group: T('개발', 'Engineering'), rate: [80000, 80] },
      { k: 'qa', name: T('품질 엔지니어', 'QA Engineer'), initials: T('QA', 'QA'), group: T('개발', 'Engineering'), rate: [60000, 55] },
      { k: 'sales', name: T('영업 담당', 'Sales Lead'), initials: T('SL', 'SL'), group: T('영업', 'Sales'), rate: [60000, 55] },
      { k: 'support', name: T('고객지원 담당', 'Support Specialist'), initials: T('CS', 'CS'), group: T('고객지원', 'Support'), rate: [45000, 40] },
      { k: 'trainer', name: T('교육 담당', 'Trainer'), initials: T('TR', 'TR'), group: T('고객지원', 'Support'), rate: [50000, 45] },
      { k: 'units', type: 'material', name: T('시연용 시제품', 'Demo units'), initials: T('DU', 'DU'), group: T('자재', 'Materials'), rate: [250000, 200], label: T('대', 'units') },
    ],
    tasks: [
      [1, 'readiness', T('출시 계획', 'Launch planning'), null],
      [2, 'strategy', T('출시 전략 수립', 'Define the launch strategy'), '1w', { r: 'pm' }],
      [2, 'pricing', T('가격 정책 결정', 'Set pricing'), '3d', { p: 'strategy:SS+3d', r: 'sales' }],
      [2, 'planOk', T('출시 계획 승인', 'Launch plan approved'), 0, { p: 'strategy, pricing' }],
      [1, 'product', T('제품 마무리', 'Product finalization'), null],
      [2, 'finalQa', T('최종 품질 검증', 'Final QA'), '2w', { p: 'planOk', r: 'qa', pr: 800 }],
      [2, 'cert', T('인증 취득', 'Certification'), '3w', { p: 'finalQa:SS+1w', r: 'eng:0.25', note: T('전파 인증 시험 기관 일정을 미리 예약해 두어야 합니다.', 'Book the test lab early; their queue is usually two weeks.') }],
      [2, 'demo', T('시연용 시제품 준비', 'Prepare demo units'), '4d', { p: 'finalQa:SS+5d', r: 'eng:0.5, units:20' }],
      [2, 'docs', T('사용 설명서 작성', 'Write the user guide'), '1w', { p: 'finalQa:SS+3d', r: 'trainer' }],
      [1, 'gtm', T('영업·마케팅', 'Go-to-market'), null],
      [2, 'salesKit', T('영업 자료 제작', 'Build the sales kit'), '1w', { p: 'planOk', r: 'sales, pm:0.25' }],
      [2, 'salesTrain', T('영업팀 교육', 'Train the sales team'), '2d', { p: 'salesKit, demo', r: 'trainer:0.5, sales' }],
      [2, 'partners', T('협력사 안내', 'Brief the partners'), '3d', { p: 'salesKit', r: 'sales:0.5' }],
      [2, 'pressKit', T('보도자료 준비', 'Prepare the press kit'), '4d', { p: 'planOk', r: 'pm:0.5' }],
      [1, 'support', T('고객 지원 준비', 'Support readiness'), null],
      [2, 'kb', T('도움말 문서 작성', 'Write the knowledge base'), '1w', { p: 'docs:SS+2d', r: 'support' }],
      [2, 'supportTrain', T('지원팀 교육', 'Train the support team'), '2d', { p: 'docs, kb', r: 'trainer:0.5, support' }],
      [2, 'channels', T('지원 채널 개설', 'Open support channels'), '1d', { p: 'supportTrain', r: 'support' }],
      [1, 'golive', T('출시', 'Launch'), null],
      [2, 'launchDay', T('제품 출시', 'Launch day'), 0, { p: 'cert, salesTrain, partners, pressKit, channels', snet: 49 }],
      [2, 'launchEvent', T('출시 행사', 'Launch event'), '1d', { p: 'launchDay', r: 'pm, sales', pr: 900 }],
      [2, 'monitor', T('초기 반응 모니터링', 'Monitor early feedback'), '2w', { p: 'launchDay', r: 'support' }],
      [2, 'retro', T('출시 회고', 'Launch retrospective'), '4h', { p: 'monitor', r: 'pm, sales' }],
      [2, 'closed', T('프로젝트 종료', 'Project closed'), 0, { p: 'retro', deadline: true }],
    ],
  },

  research: {
    title: T('고객 경험 연구', 'Customer Experience Study'),
    resources: [
      { k: 'pi', name: T('책임 연구원', 'Principal Investigator'), initials: T('책임', 'PI'), group: T('연구', 'Research'), rate: [110000, 110] },
      { k: 'res', name: T('연구원', 'Researcher'), initials: T('연구', 'RS'), group: T('연구', 'Research'), rate: [60000, 55] },
      { k: 'ra', name: T('연구 보조원', 'Research Assistant'), initials: T('보조', 'RA'), group: T('연구', 'Research'), rate: [35000, 30], max: 2 },
      { k: 'stat', name: T('통계 분석가', 'Statistician'), initials: T('통계', 'ST'), group: T('분석', 'Analytics'), rate: [75000, 70] },
      { k: 'incent', type: 'material', name: T('참가자 사례비', 'Participant incentives'), initials: T('사례', 'IN'), group: T('비용', 'Costs'), rate: [50000, 40], label: T('명', 'people') },
      { k: 'license', type: 'cost', name: T('분석 소프트웨어 라이선스', 'Analysis software license'), initials: T('SW', 'SW'), group: T('비용', 'Costs') },
    ],
    tasks: [
      [1, 'design', T('연구 설계', 'Study design'), null],
      [2, 'lit', T('선행 연구 조사', 'Literature review'), '2w', { r: 'res:0.5, ra' }],
      [2, 'questions', T('연구 질문 정의', 'Define the research questions'), '3d', { p: 'lit:SS+1w', r: 'pi, res:0.5' }],
      [2, 'method', T('연구 방법 설계', 'Design the method'), '1w', { p: 'questions', r: 'pi:0.5, res:0.5, stat:0.25' }],
      [2, 'irb', T('연구 윤리 심의', 'Ethics review'), '3w', { p: 'method', r: 'res:0.1', pr: 900, note: T('심의위원회는 격주로 열리므로 서류는 회의 1주 전까지 내야 합니다.', 'The board meets every other week; papers are due a week before.') }],
      [2, 'designOk', T('연구 계획 확정', 'Study plan approved'), 0, { p: 'irb' }],
      [1, 'collect', T('데이터 수집', 'Data collection'), null],
      [2, 'recruit', T('참가자 모집', 'Recruit participants'), '2w', { p: 'designOk', r: 'ra' }],
      [2, 'pilot', T('예비 조사', 'Pilot study'), '3d', { p: 'designOk', r: 'res, ra' }],
      [2, 'survey', T('설문 조사', 'Run the survey'), '3w', { p: 'pilot, recruit:SS+1w', r: 'ra, incent:200' }],
      [2, 'interviews', T('심층 인터뷰', 'In-depth interviews'), '2w', { p: 'pilot', r: 'res, pi:0.25, incent:20', snet: 56 }],
      [2, 'collected', T('데이터 수집 완료', 'Data collection complete'), 0, { p: 'survey, interviews' }],
      [1, 'analysis', T('분석', 'Analysis'), null],
      [2, 'cleaning', T('데이터 정제', 'Clean the data'), '4d', { p: 'survey:FF+3d', r: 'ra, stat:0.5' }],
      [2, 'quant', T('통계 분석', 'Statistical analysis'), '2w', { p: 'cleaning', r: 'stat', cost: { license: [1200000, 950] } }],
      [2, 'qual', T('인터뷰 분석', 'Code the interviews'), '8d', { p: 'interviews', r: 'res' }],
      [2, 'synth', T('결과 종합', 'Synthesize the findings'), '1w', { p: 'quant, qual', r: 'pi, res' }],
      [1, 'reporting', T('보고', 'Reporting'), null],
      [2, 'draft', T('보고서 초안 작성', 'Draft the report'), '2w', { p: 'synth', r: 'res, pi:0.5' }],
      [2, 'peer', T('내부 검토', 'Internal review'), '1w', { p: 'draft:FS-2d', r: 'pi:0.5', pr: 700 }],
      [2, 'final', T('최종 보고서', 'Final report'), '4d', { p: 'peer', r: 'res' }],
      [2, 'present', T('결과 발표', 'Present the results'), '4h', { p: 'final', r: 'pi, res' }],
      [2, 'done', T('연구 종료', 'Study completed'), 0, { p: 'present', deadline: true }],
    ],
  },

  move: {
    title: T('사무실 이전', 'Office Relocation'),
    resources: [
      { k: 'lead', name: T('이전 TF 리더', 'Move Coordinator'), initials: T('TF', 'MC'), group: T('관리', 'Management'), rate: [75000, 65] },
      { k: 'fm', name: T('총무 담당', 'Facilities Manager'), initials: T('총무', 'FM'), group: T('총무', 'Facilities'), rate: [55000, 50] },
      { k: 'it', name: T('IT 담당', 'IT Specialist'), initials: T('IT', 'IT'), group: T('IT', 'IT'), rate: [65000, 60] },
      { k: 'movers', type: 'cost', name: T('이사 업체', 'Moving company'), initials: T('이사', 'MV'), group: T('비용', 'Costs') },
      { k: 'cleaners', type: 'cost', name: T('청소 업체', 'Cleaning service'), initials: T('청소', 'CS'), group: T('비용', 'Costs') },
      { k: 'boxes', type: 'material', name: T('이사용 박스', 'Moving boxes'), initials: T('박스', 'BX'), group: T('자재', 'Materials'), rate: [3000, 3], label: T('개', 'boxes') },
    ],
    tasks: [
      [1, 'plan', T('계획', 'Planning'), null],
      [2, 'needs', T('공간 요구사항 정리', 'Define the space needs'), '1w', { r: 'lead, fm:0.5' }],
      [2, 'search', T('새 사무실 물색', 'Find the new office'), '3w', { p: 'needs:SS+3d', r: 'fm:0.5' }],
      [2, 'lease', T('임대 계약', 'Sign the lease'), '1w', { p: 'search', r: 'lead', pr: 900, note: T('기존 사무실 계약 만료일과 겹치지 않도록 입주일을 조정합니다.', 'Line the move-in date up with the end of the current lease.') }],
      [2, 'leaseOk', T('계약 완료', 'Lease signed'), 0, { p: 'lease' }],
      [1, 'space', T('새 공간 준비', 'New space'), null],
      [2, 'layout', T('배치도 설계', 'Plan the floor layout'), '1w', { p: 'leaseOk', r: 'fm:0.5' }],
      [2, 'interior', T('인테리어 공사', 'Interior fit-out'), '4w', { p: 'layout', r: 'fm:0.25', note: T('공사 중 주 1회 현장 점검을 합니다.', 'Walk the site once a week during the fit-out.') }],
      [2, 'network', T('네트워크·전화 설치', 'Install network and phones'), '1w', { p: 'interior:FF', r: 'it' }],
      [2, 'furniture', T('가구 발주 및 설치', 'Order and install furniture'), '2w', { p: 'layout:FS+1w', r: 'fm:0.25' }],
      [1, 'pack', T('이사 준비', 'Packing'), null],
      [2, 'notify', T('직원 공지', 'Tell the staff'), '2h', { p: 'leaseOk', r: 'lead' }],
      [2, 'book', T('이사 업체 계약', 'Book the movers'), '2d', { p: 'leaseOk', r: 'fm:0.5', cost: { movers: [4500000, 3800] } }],
      [2, 'inventory', T('자산 목록 작성', 'Take an asset inventory'), '3d', { p: 'book', r: 'it:0.5, fm:0.5' }],
      [2, 'packing', T('짐 꾸리기', 'Pack up'), '3d', { p: 'inventory, notify', r: 'fm:0.5, boxes:300', snet: 49 }],
      [2, 'backup', T('IT 장비 백업', 'Back up the IT systems'), '1d', { p: 'packing:FF', r: 'it' }],
      [1, 'moving', T('이전', 'Move'), null],
      [2, 'moveDay', T('이삿짐 운반', 'Move day'), '1d', { p: 'packing, interior, network, furniture, backup', r: 'lead, fm, it', pr: 1000 }],
      [2, 'setupIt', T('IT 장비 설치', 'Set up the IT equipment'), '2d', { p: 'moveDay', r: 'it' }],
      [2, 'unpack', T('짐 정리', 'Unpack'), '2d', { p: 'moveDay', r: 'fm' }],
      [2, 'open', T('새 사무실 업무 시작', 'Open for business'), 0, { p: 'setupIt, unpack', deadline: true }],
      [1, 'wrap', T('마무리', 'Wrap-up'), null],
      [2, 'restore', T('기존 사무실 원상 복구', 'Restore the old office'), '1w', { p: 'moveDay', r: 'lead:0.5', cost: { cleaners: [1800000, 1500] } }],
      [2, 'returned', T('기존 사무실 반납', 'Old office handed back'), 0, { p: 'restore' }],
    ],
  },
};

// The tutorial plan: links of all four types, one overallocated person (QA).
const SAMPLE = {
  title: T('웹사이트 리뉴얼', 'Website Redesign'),
  resources: [
    { k: 'pm', name: T('김지현', 'Emma Clark'), initials: T('지현', 'EC'), group: T('기획', 'Management'), rate: [90000, 85] },
    { k: 'ux', name: T('박서준', 'Daniel Lee'), initials: T('서준', 'DL'), group: T('기획', 'Design'), rate: [70000, 65] },
    { k: 'des', name: T('이하은', 'Sophie Turner'), initials: T('하은', 'ST'), group: T('디자인', 'Design'), rate: [65000, 60] },
    { k: 'fe', name: T('최민호', 'Ryan Patel'), initials: T('민호', 'RP'), group: T('개발', 'Engineering'), rate: [75000, 70] },
    { k: 'be', name: T('정우진', 'Marcus Hill'), initials: T('우진', 'MH'), group: T('개발', 'Engineering'), rate: [80000, 75] },
    { k: 'qa', name: T('한유나', 'Olivia Brooks'), initials: T('유나', 'OB'), group: T('품질', 'Quality'), rate: [55000, 50] },
    { k: 'stock', type: 'material', name: T('스톡 이미지', 'Stock images'), initials: T('IMG', 'IMG'), group: T('자재', 'Materials'), rate: [15000, 12], label: T('장', 'images') },
    { k: 'hosting', type: 'cost', name: T('호스팅', 'Hosting'), initials: T('HS', 'HS'), group: T('비용', 'Costs') },
  ],
  tasks: [
    [1, 'init', T('착수', 'Initiation'), null],
    [2, 'kickoff', T('킥오프 회의', 'Kickoff meeting'), '4h', { r: 'pm, ux, des', note: T('목표: 모바일 방문자 이탈률 30% 줄이기, 오픈은 분기 말까지.', 'Goal: cut the mobile bounce rate by 30% and go live by the end of the quarter.') }],
    [2, 'interviews', T('이해관계자 인터뷰', 'Stakeholder interviews'), '3d', { p: 'kickoff', r: 'pm, ux:0.5' }],
    [2, 'audit', T('현행 사이트 분석', 'Audit the current site'), '4d', { p: 'interviews:SS+1d', r: 'ux:0.5' }],
    [2, 'scopeOk', T('범위 확정', 'Scope signed off'), 0, { p: 'interviews, audit' }],
    [1, 'planning', T('기획', 'Planning and UX'), null],
    [2, 'ia', T('정보 구조 설계', 'Information architecture'), '4d', { p: 'scopeOk', r: 'ux' }],
    [2, 'wire', T('와이어프레임', 'Wireframes'), '1w', { p: 'ia', r: 'ux' }],
    [2, 'content', T('콘텐츠 계획', 'Content plan'), '1w', { p: 'ia:SS+2d', r: 'pm:0.5' }],
    [2, 'planOk', T('기획 승인', 'UX approved'), 0, { p: 'wire, content' }],
    [1, 'design', T('디자인', 'Visual design'), null],
    [2, 'system', T('디자인 시스템', 'Design system'), '1w', { p: 'wire:FS-2d', r: 'des' }],
    [2, 'home', T('메인 페이지 시안', 'Home page mockups'), '4d', { p: 'system, planOk', r: 'des' }],
    [2, 'inner', T('서브 페이지 디자인', 'Inner page designs'), '6d', { p: 'home', r: 'des' }],
    [2, 'images', T('이미지 구매', 'Buy stock images'), '1d', { p: 'home', r: 'pm:0.25, stock:40' }],
    [2, 'designReview', T('디자인 검토', 'Design review'), '2d', { p: 'inner:FF', r: 'pm:0.5, ux:0.5' }],
    [2, 'designOk', T('디자인 확정', 'Design signed off'), 0, { p: 'designReview, images' }],
    [1, 'dev', T('개발', 'Development'), null],
    [2, 'env', T('개발 환경 구축', 'Set up the environments'), '2d', { p: 'planOk', r: 'be', cost: { hosting: [1200000, 900] } }],
    [2, 'frontend', T('프런트엔드', 'Front end'), null],
    [3, 'components', T('공통 컴포넌트', 'UI components'), '6d', { p: 'system, env', r: 'fe' }],
    [3, 'pages', T('페이지 퍼블리싱', 'Build the pages'), '2w', { p: 'components, designOk', r: 'fe', pr: 800 }],
    [2, 'backend', T('백엔드', 'Back end'), null],
    [3, 'cms', T('CMS 연동', 'CMS integration'), '8d', { p: 'env', r: 'be' }],
    [3, 'forms', T('검색·문의 기능', 'Search and contact forms'), '5d', { p: 'cms', r: 'be' }],
    [2, 'migrate', T('콘텐츠 이전', 'Migrate the content'), '1w', { p: 'cms:SS+3d', r: 'pm:0.5, ux:0.5' }],
    [1, 'launch', T('테스트 및 오픈', 'Testing and launch'), null],
    [2, 'qaTest', T('통합 테스트', 'Integration testing'), '1w', { p: 'pages, forms, migrate', r: 'qa' }],
    [2, 'a11y', T('접근성·성능 점검', 'Accessibility and performance checks'), '3d', { p: 'qaTest:SS+2d', r: 'qa, fe:0.5' }],
    [2, 'uat', T('사용자 수용 테스트', 'User acceptance testing'), '4d', { p: 'qaTest', r: 'pm, qa:0.5' }],
    [2, 'golive', T('사이트 오픈', 'Go live'), 0, { p: 'uat, a11y', deadline: true }],
    [2, 'freeze', T('기존 사이트 동결 및 백업', 'Freeze and back up the old site'), '2d', { p: 'golive:SF', r: 'be' }],
    [2, 'hypercare', T('오픈 후 안정화', 'Post-launch support'), '1w', { p: 'golive', r: 'be:0.5, fe:0.5' }],
    [2, 'closed', T('프로젝트 종료', 'Project closed'), 0, { p: 'hypercare' }],
  ],
};

// ───────────────────────── holidays

const FIXED_HOLIDAYS = {
  ko: [[1, 1, '신정'], [3, 1, '삼일절'], [5, 5, '어린이날'], [6, 6, '현충일'], [8, 15, '광복절'], [10, 3, '개천절'], [10, 9, '한글날'], [12, 25, '성탄절']],
  en: [[1, 1, 'New Year\'s Day'], [12, 24, 'Christmas Eve'], [12, 25, 'Christmas Day'], [12, 31, 'New Year\'s Eve']],
};
// Lunar holidays (설날·추석 three days each, 부처님 오신 날).
const LUNAR_HOLIDAYS = [
  ['2025-01-28', '2025-01-30', '설날 연휴'], ['2025-05-05', '2025-05-05', '부처님 오신 날'], ['2025-10-05', '2025-10-07', '추석 연휴'],
  ['2026-02-16', '2026-02-18', '설날 연휴'], ['2026-05-24', '2026-05-24', '부처님 오신 날'], ['2026-09-24', '2026-09-26', '추석 연휴'],
  ['2027-02-06', '2027-02-08', '설날 연휴'], ['2027-05-13', '2027-05-13', '부처님 오신 날'], ['2027-09-14', '2027-09-16', '추석 연휴'],
  ['2028-01-25', '2028-01-27', '설날 연휴'], ['2028-05-02', '2028-05-02', '부처님 오신 날'], ['2028-10-02', '2028-10-04', '추석 연휴'],
];
const FALLBACK_HOLIDAY = { ko: '창립 기념일', en: 'Company holiday' };

const isWeekday = (day) => ![0, 6].includes(weekdayOfDay(day));

/** Adds 1–3 holidays on the standard calendar between two days (public ones, else a company day). */
function addHolidays(project, language, fromDay, toDay, max = 3) {
  const candidates = [];
  const firstYear = parts(dayStart(fromDay)).year;
  const lastYear = parts(dayStart(toDay)).year;
  for (let year = firstYear; year <= lastYear; year++) {
    for (const [month, day, name] of FIXED_HOLIDAYS[language]) {
      const d = dayOf(toMin(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`));
      candidates.push({ from: d, to: d, name });
    }
  }
  if (language === 'ko') for (const [a, b, name] of LUNAR_HOLIDAYS) candidates.push({ from: dayOf(toMin(a)), to: dayOf(toMin(b)), name });
  const used = new Set();
  const chosen = candidates
    .filter((h) => h.from >= fromDay && h.to <= toDay)
    .filter((h) => { for (let d = h.from; d <= h.to; d++) if (isWeekday(d)) return true; return false; })
    .sort((a, b) => a.from - b.from)
    .filter((h) => (used.has(h.from) ? false : used.add(h.from)))
    .slice(0, max);
  if (!chosen.length) {
    let d = fromDay + Math.floor((toDay - fromDay) * 0.45);
    while (!isWeekday(d)) d += 1;
    chosen.push({ from: d, to: d, name: FALLBACK_HOLIDAY[language] });
  }
  for (const h of chosen) addException(project, 'standard', { name: h.name, start: isoDay(h.from), finish: isoDay(h.to), working: false });
  return chosen.length;
}

// ───────────────────────── building

const LINK = /^(\w+)(?::(FS|SS|FF|SF)([+-].+)?)?$/;
const list = (text) => String(text ?? '').split(',').map((part) => part.trim()).filter(Boolean);
const atClock = (day, minutes) => fromMin(dayStart(day) + minutes);
const nextWeekday = (day) => { let d = day; while (!isWeekday(d)) d += 1; return d; };

/** The Monday 08:00 after today. */
export function nextMondayStart(from = nowMin()) {
  let day = dayOf(from) + 1;
  while (weekdayOfDay(day) !== 1) day += 1;
  return atClock(day, 480);
}

function buildSpec(spec, language, start) {
  const L = (text) => (text == null ? '' : typeof text === 'string' ? text : text[language] ?? text.en);
  const project = createProject({ title: L(spec.title), start, language, calendarNames: CALENDAR_NAMES[language] });
  const startDay = dayOf(toMin(project.start));
  const resources = new Map();
  for (const r of spec.resources) {
    const resource = addResource(project, {
      name: L(r.name), type: r.type ?? 'work', initials: L(r.initials) || undefined, group: L(r.group),
      stdRate: r.rate ? r.rate[language === 'en' ? 1 : 0] : 0, maxUnits: r.max ?? 1, materialLabel: L(r.label),
    });
    resources.set(r.k, resource.id);
  }
  const ids = new Map();
  for (const [level, key, name, duration, o = {}] of spec.tasks) {
    const data = { name: L(name), outlineLevel: level, estimated: false };
    if (duration === 0) Object.assign(data, { milestone: true, duration: 0 });
    else if (duration != null) {
      const parsed = parseDuration(duration, project.options);
      Object.assign(data, { duration: parsed.minutes, durationUnit: parsed.unit });
    }
    const task = insertTask(project, project.tasks.length, data);
    ids.set(key, task.id);
    if (o.note) task.notes = L(o.note);
    if (o.pr != null) updateTask(project, task.id, { priority: o.pr });
    if (o.snet != null) task.constraint = { type: 'SNET', date: atClock(nextWeekday(startDay + o.snet), 480) };
  }
  for (const [, key, , , o = {}] of spec.tasks) {
    const id = ids.get(key);
    for (const part of list(o.p)) {
      const match = LINK.exec(part);
      if (!match || !ids.has(match[1])) throw new Error(`template link "${part}" of ${key}`);
      const lag = match[3] ? parseLag(match[3], project.options) : { lag: 0, lagUnit: 'd' };
      if (!linkTasks(project, ids.get(match[1]), id, match[2] ?? 'FS', lag.lag, lag.lagUnit)) throw new Error(`template link "${part}" of ${key} makes a loop`);
    }
    for (const part of list(o.r)) {
      const [rk, units = '1'] = part.split(':');
      if (!resources.has(rk)) throw new Error(`template resource "${rk}" of ${key}`);
      assignResource(project, id, resources.get(rk), Number(units));
    }
    for (const [rk, amounts] of Object.entries(o.cost ?? {})) assignResource(project, id, resources.get(rk), 1, { cost: amounts[language === 'en' ? 1 : 0] });
  }
  // Holidays inside the plan, then deadlines a few days after the planned finish.
  const first = schedule(project);
  addHolidays(project, language, startDay, dayOf(first.finish));
  const s = schedule(project);
  for (const [, key, , , o = {}] of spec.tasks) {
    if (!o.deadline) continue;
    const id = ids.get(key);
    const task = project.tasks.find((item) => item.id === id);
    task.deadline = atClock(nextWeekday(dayOf(s.info(id).finish - 1) + 3), 1020);
  }
  return { project, ids };
}

const lang = (language) => (language === 'en' ? 'en' : 'ko');

/** A new project from template `id` ('blank' gives an empty plan). */
export function buildTemplate(id, { language = 'ko', start } = {}) {
  const l = lang(language);
  const begin = start ?? nextMondayStart();
  const spec = SPECS[id];
  if (!spec) {
    const meta = TEMPLATES.find((item) => item.id === 'blank');
    return createProject({ title: meta.name[l], start: begin, language: l, calendarNames: CALENDAR_NAMES[l] });
  }
  return buildSpec(spec, l, begin).project;
}

/**
 * The demo plan: started three weeks before `today`, baseline saved at the
 * start, the first tasks done, some in progress (one behind), one task longer
 * than planned, and QA booked twice in the same days (for leveling).
 */
export function buildSample(language = 'ko', { today } = {}) {
  const l = lang(language);
  const now = toMin(today) ?? nowMin();
  const todayDay = dayOf(now);
  let startDay = todayDay - 21;
  startDay -= (weekdayOfDay(startDay) + 6) % 7; // back to Monday
  const { project, ids } = buildSpec(SAMPLE, l, atClock(startDay, 480));

  // Baseline 0 as planned at the start.
  const planned = schedule(project);
  for (const task of project.tasks) {
    const info = planned.info(task.id);
    task.baselines = { ...task.baselines, 0: { start: fromMin(info.start), finish: fromMin(info.finish), duration: info.duration ?? 0, work: info.work ?? 0, cost: info.cost ?? 0 } };
  }
  project.baselineDates = { 0: new Date(dayStart(startDay) * 60000 + 480 * 60000).toISOString() };

  // The wireframes took two days longer than planned.
  const wire = project.tasks.find((task) => task.id === ids.get('wire'));
  setTaskDuration(project, wire.id, wire.duration + 2 * 480, 'd');

  // Progress up to the status date (today 17:00).
  const status = dayStart(todayDay) + 1020;
  const s = schedule(project, { today: status });
  let behind = false;
  for (const task of project.tasks) {
    const info = s.info(task.id);
    if (info.summary || info.start == null || info.start >= status) continue;
    if (info.finish <= status && task.id !== ids.get('content')) {
      Object.assign(task, { percentComplete: 100, actualStart: fromMin(info.start), actualFinish: fromMin(info.finish) });
      continue;
    }
    const expected = info.finish <= status ? 100 : (s.projectCal.between(info.start, status) / Math.max(1, info.duration)) * 100;
    // The content plan is overdue and the first task under way runs behind.
    let factor = 1;
    if (task.id === ids.get('content')) factor = 0.75;
    else if (!behind) { factor = 0.5; behind = true; }
    const pct = Math.max(5, Math.min(95, Math.round(expected * factor)));
    Object.assign(task, { percentComplete: pct, actualStart: fromMin(info.start), actualFinish: null });
  }
  project.statusDate = fromMin(status);
  return project;
}
