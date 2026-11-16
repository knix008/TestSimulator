// Starter agents (the start page and File › New from template). Programmers first, then office work.
// Each builds a document in the chosen language; '' models use the default model of Settings, so every
// template runs at once with the offline test model and properly once a real model is chosen.
import { builder, L } from './template-builder.js';
import { PIPELINE_TEMPLATES } from './templates-pipelines.js';
import { MORE_TEMPLATES } from './templates-more.js';
import { AUTODEV_TEMPLATE } from './templates-autodev.js';

/** The sample knowledge base the core creates on the first start (core/app.js). */
export const SAMPLE_KB = 'sample-kb';

const BASE_TEMPLATES = [
  // ───────── developers
  { id: 'code-review', group: 'dev', icon: 'code', title: L('코드 리뷰어', 'Code reviewer'), desc: L('코드를 넣으면 버그·보안·가독성 리뷰', 'Paste code, get a review: bugs, security, readability'),
    build(lang) {
      const b = builder(lang);
      const t = b.node('trigger.manual', L('코드 입력', 'Code input'), { sample: '{\n  "language": "javascript",\n  "code": "function sum(a, b) { return a - b }"\n}' });
      const r = b.node('ai.llm', L('리뷰', 'Review'), { system: L('당신은 시니어 개발자입니다. 버그, 보안 문제, 가독성, 테스트 관점에서 짧고 구체적으로 리뷰하세요. 고친 코드를 마지막에 보여 주세요.', 'You are a senior engineer. Review for bugs, security, readability and tests — short and concrete. End with the corrected code.'), prompt: 'Language: {{ input.language }}\n\n```\n{{ input.code }}\n```' });
      const o = b.node('out.respond', L('결과', 'Result'), { value: '{{ input.text }}' });
      b.chain(t, r, o);
      return b.done({ name: L('코드 리뷰어', 'Code reviewer'), description: L('코드 리뷰를 자동으로', 'Automatic code review'), icon: 'code' });
    } },
  { id: 'commit-message', group: 'dev', icon: 'terminal', title: L('커밋 메시지 작성', 'Commit message writer'), desc: L('git diff 를 읽어 Conventional Commit 메시지', 'Reads git diff and writes a Conventional Commit'),
    build(lang) {
      const b = builder(lang);
      const t = b.node('trigger.manual', L('시작', 'Start'), { sample: '{\n  "repo": ""\n}' });
      const s = b.node('tool.shell', L('git diff', 'git diff'), { command: 'git diff --cached --stat && git diff --cached', cwd: '{{ input.repo }}', onError: 'continue' });
      const w = b.node('ai.llm', L('메시지 작성', 'Write message'), { system: L('Conventional Commits 형식(feat:, fix:, docs: …)으로 영어 커밋 메시지를 쓰세요. 제목 72자 이하, 빈 줄, 본문 글머리표.', 'Write an English Conventional Commits message (feat:, fix:, docs: …). Subject ≤ 72 chars, blank line, bullet body.'), prompt: '{{ input.stdout || input.error.message }}' });
      const o = b.node('out.respond', L('메시지', 'Message'), { value: '{{ input.text }}' });
      b.chain(t, s, w, o);
      return b.done({ name: L('커밋 메시지 작성', 'Commit message writer'), description: L('스테이징된 변경으로 커밋 메시지', 'Commit message from staged changes'), icon: 'terminal' });
    } },
  { id: 'api-monitor', group: 'dev', icon: 'activity', title: L('API 상태 감시', 'API health monitor'), desc: L('15분마다 API 호출, 실패하면 알림', 'Calls an API every 15 minutes, alerts on failure'),
    build(lang) {
      const b = builder(lang);
      const t = b.node('trigger.schedule', L('15분마다', 'Every 15 min'), { mode: 'interval', minutes: 15 });
      const h = b.node('tool.http', L('상태 확인', 'Health check'), { method: 'GET', url: 'https://httpbin.org/status/200', onError: 'continue' });
      const c = b.node('logic.if', L('정상?', 'Healthy?'), { conditions: [{ left: '{{ input.ok }}', op: 'isTrue', right: '' }] });
      const ok = b.node('human.notify', L('정상', 'OK'), { message: 'API OK ({{ input.status }})', level: 'success' });
      const bad = b.node('human.notify', L('장애 알림', 'Alert'), { message: 'API failed: {{ input.error.message || input.status }}', level: 'warning' });
      b.chain(t, h, c); b.link(c, ok, 'true'); b.link(c, bad, 'false');
      return b.done({ name: L('API 상태 감시', 'API health monitor'), description: L('배포하면 일정대로 실행', 'Runs on schedule when deployed'), icon: 'activity' });
    } },
  { id: 'log-analyzer', group: 'dev', icon: 'list', title: L('로그 분석', 'Log analyzer'), desc: L('코드로 오류 줄을 세고 AI 가 원인 요약', 'Code counts errors, AI summarises causes'),
    build(lang) {
      const b = builder(lang);
      const t = b.node('trigger.manual', L('로그 입력', 'Log input'), { sample: '{\n  "log": "2026-11-16 10:01 INFO start\\n2026-11-16 10:02 ERROR db timeout\\n2026-11-16 10:03 WARN retry\\n2026-11-16 10:04 ERROR db timeout"\n}' });
      const c = b.node('logic.code', L('통계', 'Stats'), { code: 'const lines = String(input.log ?? "").split(/\\r?\\n/).filter(Boolean);\nconst errors = lines.filter((l) => /ERROR|FATAL|Exception/i.test(l));\nconst warnings = lines.filter((l) => /WARN/i.test(l));\nreturn { total: lines.length, errors: errors.length, warnings: warnings.length, sample: errors.slice(0, 20).join("\\n") };' });
      const s = b.node('ai.llm', L('원인 요약', 'Root causes'), { system: L('운영 엔지니어로서 오류 로그의 원인 후보와 조치를 글머리표로 정리하세요.', 'As an SRE, list likely causes and fixes for these errors as bullets.'), prompt: 'Lines: {{ input.total }}, errors: {{ input.errors }}, warnings: {{ input.warnings }}\n\n{{ input.sample }}' });
      const o = b.node('out.respond', L('보고', 'Report'), { value: '{{ input.text }}' });
      b.chain(t, c, s, o);
      return b.done({ name: L('로그 분석', 'Log analyzer'), description: '', icon: 'list' });
    } },
  { id: 'issue-triage', group: 'dev', icon: 'webhook', title: L('이슈 분류 (웹훅)', 'Issue triage (webhook)'), desc: L('웹훅으로 받은 이슈를 bug/feature/question 으로 나눠 답변', 'Webhook issue → bug / feature / question replies'),
    build(lang) {
      const b = builder(lang);
      const t = b.node('trigger.webhook', L('이슈 웹훅', 'Issue webhook'));
      const c = b.node('ai.classify', L('분류', 'Classify'), { input: '{{ trigger.body.title }}\n{{ trigger.body.body }}', categories: ['bug', 'feature', 'question'] });
      const bug = b.node('logic.template', L('버그 답변', 'Bug reply'), { template: L('버그 신고 고맙습니다. 재현 절차와 버전을 알려 주세요. (label: bug)', 'Thanks for the bug report. Please add steps to reproduce and the version. (label: bug)') });
      const feat = b.node('logic.template', L('기능 답변', 'Feature reply'), { template: L('제안 고맙습니다. 로드맵에서 검토하겠습니다. (label: enhancement)', 'Thanks for the idea — we will review it for the roadmap. (label: enhancement)') });
      const q = b.node('ai.llm', L('질문 답변', 'Answer question'), { prompt: '{{ trigger.body.body }}', system: L('오픈소스 프로젝트 관리자로서 친절하게 답하세요.', 'Answer kindly as an open-source maintainer.') });
      const other = b.node('logic.template', L('기타', 'Other'), { template: 'needs-triage' });
      const m = b.node('logic.merge', L('합치기', 'Merge'), { mode: 'text' });
      const o = b.node('out.respond', L('응답', 'Response'), { value: '{ "category": "{{ nodes.Classify.output.category || nodes.분류.output.category }}", "reply": {{ input.text | json }} }' });
      b.link(t, c); b.link(c, bug, 'bug'); b.link(c, feat, 'feature'); b.link(c, q, 'question'); b.link(c, other, 'other');
      for (const x of [bug, feat, q, other]) b.link(x, m);
      b.link(m, o);
      return b.done({ name: L('이슈 분류', 'Issue triage'), description: L('POST {title, body} 로 시험', 'Test with POST {title, body}'), icon: 'webhook' });
    } },
  { id: 'docs-qa', group: 'dev', icon: 'book', title: L('문서 Q&A (RAG)', 'Docs Q&A (RAG)'), desc: L('지식 베이스에서 찾아 근거와 함께 답변', 'Answers from your knowledge base, with sources'),
    build(lang) {
      const b = builder(lang);
      const t = b.node('trigger.chat', L('질문', 'Question'), { greeting: L('문서에 대해 물어보세요.', 'Ask about the documents.') });
      const s = b.node('kb.search', L('문서 검색', 'Search docs'), { topK: 4, kbs: [SAMPLE_KB] });
      const a = b.node('ai.llm', L('답변', 'Answer'), { system: L('아래 자료만 근거로 답하고 [번호]로 출처를 표시하세요. 자료에 없으면 모른다고 하세요.', 'Answer only from the passages below and cite them as [n]. If they do not say, say you do not know.'), prompt: 'Passages:\n{{ input.context }}\n\nQuestion: {{ trigger.message }}' });
      const o = b.node('out.respond', L('답', 'Reply'), { value: '{{ input.text }}' });
      b.chain(t, s, a, o);
      return b.done({ name: L('문서 Q&A', 'Docs Q&A'), description: L('검색 노드에서 지식 베이스를 고르세요', 'Pick a knowledge base in the search node'), icon: 'book' });
    } },
  { id: 'json-pipeline', group: 'dev', icon: 'braces', title: L('JSON 변환 파이프라인', 'JSON pipeline'), desc: L('웹훅 JSON → 코드 변환 → 항목마다 처리', 'Webhook JSON → transform → per item'),
    build(lang) {
      const b = builder(lang);
      const t = b.node('trigger.manual', L('입력', 'Input'), { sample: '{\n  "users": [{ "name": "Kim", "age": 31 }, { "name": "Lee", "age": 27 }]\n}' });
      const c = b.node('logic.code', L('정규화', 'Normalize'), { code: 'return { items: input.users.map((u) => ({ ...u, name: u.name.toUpperCase(), adult: u.age >= 20 })) };' });
      const l = b.node('logic.loop', L('각 사용자', 'Each user'), { items: '{{ input.items }}' });
      const f = b.node('logic.template', L('인사말', 'Greeting'), { template: 'Hello {{ item.name }} ({{ item.age }})' });
      const o = b.node('out.respond', L('결과', 'Result'), { value: '{{ input.items | pluck:"text" }}' });
      b.link(t, c); b.link(c, l); b.link(l, f, 'item'); b.link(l, o, 'done');
      return b.done({ name: L('JSON 변환', 'JSON pipeline'), description: '', icon: 'braces' });
    } },
  { id: 'multi-agent', group: 'dev', icon: 'robot', title: L('다중 에이전트 조정', 'Multi-agent team'), desc: L('조정자 에이전트가 조사·작성 에이전트를 도구로 호출', 'A coordinator calls researcher and writer agents as tools'),
    build(lang) {
      const b = builder(lang);
      const t = b.node('trigger.chat', L('요청', 'Request'));
      const lead = b.node('ai.agent', L('조정자', 'Coordinator'), { system: L('당신은 팀장입니다. 조사가 필요하면 researcher, 글이 필요하면 writer 도구를 부르고 결과를 합쳐 답하세요.', 'You lead a team. Call the researcher tool for facts and the writer tool for prose, then combine.'), tools: ['datetime'], maxSteps: 6 });
      const r = b.node('ai.agent', 'researcher', { system: L('사실을 조사해 핵심만 글머리표로 돌려주세요.', 'Research and return key facts as bullets.'), prompt: '{{ input.text }}', tools: ['web_page', 'calculator'], memory: false });
      const w = b.node('ai.agent', 'writer', { system: L('주어진 내용으로 읽기 쉬운 글을 쓰세요.', 'Write clear prose from the given notes.'), prompt: '{{ input.text }}', tools: [], memory: false });
      const o = b.node('out.respond', L('답', 'Reply'), { value: '{{ input.text }}' });
      b.chain(t, lead, o); b.link(lead, r, 'tools'); b.link(lead, w, 'tools');
      return b.done({ name: L('다중 에이전트 팀', 'Multi-agent team'), description: '', icon: 'robot' });
    } },

  // ───────── office work
  { id: 'support-bot', group: 'office', icon: 'chat', title: L('고객 상담 챗봇', 'Customer support bot'), desc: L('대화를 기억하고 지식 베이스로 답하는 상담원', 'Remembers the chat and answers from your knowledge base'),
    build(lang) {
      const b = builder(lang);
      const t = b.node('trigger.chat', L('고객 메시지', 'Customer message'), { greeting: L('안녕하세요! 무엇을 도와드릴까요?', 'Hi! How can I help you today?') });
      const a = b.node('ai.agent', L('상담원', 'Support agent'), { system: L('당신은 친절한 고객 상담원입니다. 지식 검색 도구로 정책을 확인하고 짧고 정확하게 답하세요. 모르면 담당자 연결을 제안하세요.', 'You are a friendly support agent. Check policies with knowledge search, answer briefly and accurately, and offer a hand-off when unsure.'), tools: ['knowledge', 'datetime'], kbs: [SAMPLE_KB], memory: true });
      const o = b.node('out.respond', L('답장', 'Reply'), { value: '{{ input.text }}' });
      b.chain(t, a, o);
      return b.done({ name: L('고객 상담 챗봇', 'Customer support bot'), description: L('에이전트 노드에서 지식 베이스를 고르세요', 'Pick knowledge bases in the agent node'), icon: 'chat' });
    } },
  { id: 'email-triage', group: 'office', icon: 'mail', title: L('메일 분류·답장 초안', 'Email triage & drafts'), desc: L('메일을 분류하고 답장 초안을 사람이 승인', 'Classifies mail, drafts replies, a person approves'),
    build(lang) {
      const b = builder(lang);
      const t = b.node('trigger.manual', L('받은 메일', 'Incoming mail'), { sample: L('{\n  "from": "kim@example.com",\n  "subject": "환불 문의",\n  "body": "지난주 주문한 제품이 고장 나서 환불을 원합니다."\n}', '{\n  "from": "kim@example.com",\n  "subject": "Refund",\n  "body": "The product I ordered last week is broken. I want a refund."\n}') });
      const c = b.node('ai.classify', L('분류', 'Classify'), { input: '{{ input.subject }}\n{{ input.body }}', categories: ['complaint', 'question', 'order'] });
      const d = b.node('ai.llm', L('답장 초안', 'Draft reply'), { system: L('정중한 회사 담당자로서 답장 초안을 쓰세요.', 'Draft a polite reply as a company representative.'), prompt: 'Category: {{ input.category }}\nFrom: {{ trigger.from }}\nSubject: {{ trigger.subject }}\n\n{{ trigger.body }}' });
      const ap = b.node('human.approval', L('보내기 승인', 'Approve sending'), { message: L('이 답장을 보낼까요?\n\n{{ input.text }}', 'Send this reply?\n\n{{ input.text }}') });
      const yes = b.node('out.respond', L('보냄', 'Sent'), { value: L('보냄: {{ input.input.text }}', 'Sent: {{ input.input.text }}') });
      const no = b.node('out.respond', L('보류', 'Held'), { value: L('보류됨 ({{ input.comment }})', 'Held back ({{ input.comment }})') });
      b.link(t, c);
      for (const p of ['complaint', 'question', 'order', 'other']) b.link(c, d, p);
      b.link(d, ap); b.link(ap, yes, 'approved'); b.link(ap, no, 'rejected');
      return b.done({ name: L('메일 분류·답장', 'Email triage'), description: '', icon: 'mail' });
    } },
  { id: 'meeting-notes', group: 'office', icon: 'notes', title: L('회의록 정리', 'Meeting notes'), desc: L('회의 내용을 요약·결정·할 일로 정리', 'Summary, decisions and action items from a transcript'),
    build(lang) {
      const b = builder(lang);
      const t = b.node('trigger.manual', L('회의 내용', 'Transcript'), { sample: L('{\n  "text": "김: 다음 주 출시합니다. 이: 문서는 금요일까지 제가 쓰겠습니다. 박: 테스트는 목요일에 끝내겠습니다."\n}', '{\n  "text": "Kim: we ship next week. Lee: I will write the docs by Friday. Park: testing done on Thursday."\n}') });
      const s = b.node('ai.llm', L('정리', 'Summarise'), { system: L('회의록 담당자입니다.', 'You take meeting minutes.'), prompt: '{{ input.text }}', json: true, schema: '{\n  "summary": "...",\n  "decisions": ["..."],\n  "actions": [{ "owner": "...", "task": "...", "due": "..." }]\n}' });
      const f = b.node('logic.template', L('문서로', 'As document'), { template: '# Summary\n{{ input.data.summary }}\n\n## Decisions\n{{ input.data.decisions | join:"\\n- " }}\n\n## Actions\n{{ input.data.actions | pretty }}' });
      const w = b.node('tool.file', L('파일 저장', 'Save file'), { op: 'write', path: 'meetings/{{ run.id }}.md', content: '{{ input.text }}' });
      const o = b.node('out.respond', L('완료', 'Done'), { value: '{{ nodes.As document.output.text || nodes.문서로.output.text }}' });
      b.chain(t, s, f, w, o);
      return b.done({ name: L('회의록 정리', 'Meeting notes'), description: '', icon: 'notes' });
    } },
  { id: 'translator', group: 'office', icon: 'globe', title: L('번역가', 'Translator'), desc: L('채팅으로 받은 글을 한↔영 번역', 'Korean ↔ English translation in chat'),
    build(lang) {
      const b = builder(lang);
      const t = b.node('trigger.chat', L('원문', 'Source'), { greeting: L('번역할 글을 보내 주세요.', 'Send text to translate.') });
      const tr = b.node('ai.llm', L('번역', 'Translate'), { system: L('번역가입니다. 한국어는 영어로, 다른 언어는 한국어로 자연스럽게 번역하고 번역문만 답하세요.', 'You are a translator. Korean → English, anything else → Korean. Reply with the translation only.'), prompt: '{{ trigger.message }}' });
      const o = b.node('out.respond', L('번역문', 'Translation'), { value: '{{ input.text }}' });
      b.chain(t, tr, o);
      return b.done({ name: L('번역가', 'Translator'), description: '', icon: 'globe' });
    } },
  { id: 'web-research', group: 'office', icon: 'web', title: L('웹 페이지 요약', 'Web page summary'), desc: L('URL 을 읽고 요약해 파일로 저장', 'Reads a URL, summarises, saves a note'),
    build(lang) {
      const b = builder(lang);
      const t = b.node('trigger.manual', L('URL', 'URL'), { sample: '{\n  "url": "https://example.com"\n}' });
      const r = b.node('tool.web', L('페이지 읽기', 'Read page'));
      const s = b.node('ai.llm', L('요약', 'Summarise'), { system: L('웹 페이지를 다섯 줄로 요약하세요.', 'Summarise the page in five lines.'), prompt: '{{ input.title }}\n\n{{ input.text | truncate:8000 }}' });
      const w = b.node('tool.file', L('메모 추가', 'Append note'), { op: 'append', path: 'research/notes.md', content: '## {{ trigger.url }}\n{{ input.text }}\n' });
      const o = b.node('out.respond', L('결과', 'Result'), { value: '{{ nodes.Summarise.output.text || nodes.요약.output.text }}' });
      b.chain(t, r, s, w, o);
      return b.done({ name: L('웹 페이지 요약', 'Web page summary'), description: '', icon: 'web' });
    } },
  { id: 'invoice-approval', group: 'office', icon: 'receipt', title: L('청구서 추출·승인', 'Invoice extraction & approval'), desc: L('청구서에서 항목을 뽑고 큰 금액은 승인', 'Extracts invoice fields; large amounts need approval'),
    build(lang) {
      const b = builder(lang);
      const t = b.node('trigger.manual', L('청구서', 'Invoice'), { sample: '{\n  "text": "Invoice no: INV-2041\\nVendor: ACME Corp\\nDate: 2026-11-10\\nAmount: 1250000"\n}' });
      const e = b.node('ai.extract', L('항목 추출', 'Extract fields'), { input: '{{ input.text }}', fields: [{ key: 'invoice no', value: 'invoice number' }, { key: 'vendor', value: 'company' }, { key: 'date', value: 'YYYY-MM-DD' }, { key: 'amount', value: 'number' }] });
      const c = b.node('logic.if', L('100만 원 초과?', 'Over 1,000,000?'), { conditions: [{ left: '{{ input.amount }}', op: 'gt', right: '1000000' }] });
      const ap = b.node('human.approval', L('결재', 'Approval'), { message: '{{ input.vendor }} — {{ input.amount }}' });
      const ok = b.node('out.respond', L('승인', 'Approved'), { value: '{{ nodes.Extract fields.output || nodes.항목 추출.output | json }}' });
      const no = b.node('out.respond', L('반려', 'Rejected'), { value: 'rejected: {{ input.comment }}' });
      const auto = b.node('out.respond', L('자동 승인', 'Auto approved'), { value: '{{ input | json }}' });
      b.chain(t, e, c); b.link(c, ap, 'true'); b.link(c, auto, 'false'); b.link(ap, ok, 'approved'); b.link(ap, no, 'rejected');
      return b.done({ name: L('청구서 처리', 'Invoice processing'), description: '', icon: 'receipt' });
    } },
  { id: 'daily-briefing', group: 'office', icon: 'calendarClock', title: L('아침 브리핑', 'Morning briefing'), desc: L('평일 9시에 자료를 모아 브리핑 작성', 'Weekdays 9:00: gathers data and writes a briefing'),
    build(lang) {
      const b = builder(lang);
      const t = b.node('trigger.schedule', L('평일 9시', 'Weekdays 9:00'), { mode: 'cron', cron: '0 9 * * 1-5' });
      const d = b.node('tool.datetime', L('오늘', 'Today'), { timeZone: '' });
      const h = b.node('tool.http', L('자료 가져오기', 'Fetch data'), { method: 'GET', url: 'https://httpbin.org/json', onError: 'continue' });
      const w = b.node('ai.llm', L('브리핑 작성', 'Write briefing'), { system: L('비서로서 오늘의 브리핑을 짧게 쓰세요.', 'As an assistant, write a short briefing for today.'), prompt: 'Date: {{ nodes.Today.output.date || nodes.오늘.output.date }} {{ nodes.Today.output.weekday || nodes.오늘.output.weekday }}\nData: {{ input.data | json | truncate:3000 }}' });
      const n = b.node('human.notify', L('알림', 'Notify'), { message: '{{ input.text }}', level: 'info' });
      b.chain(t, d, h, w, n);
      return b.done({ name: L('아침 브리핑', 'Morning briefing'), description: L('배포하면 평일 9시에 실행', 'Runs weekdays at 9 when deployed'), icon: 'calendarClock' });
    } },
  { id: 'assistant', group: 'office', icon: 'robot', title: L('개인 비서 (도구 사용)', 'Assistant with tools'), desc: L('계산·날짜·웹 페이지 도구를 쓰는 기본 에이전트', 'A basic agent with calculator, date and web tools'),
    build(lang) {
      const b = builder(lang);
      const t = b.node('trigger.chat', L('메시지', 'Message'), { greeting: L('무엇이든 물어보세요. 예: 1234*56 은?', 'Ask anything. e.g. what is 1234*56?') });
      const a = b.node('ai.agent', L('비서', 'Assistant'), { tools: ['calculator', 'datetime', 'web_page'] });
      const o = b.node('out.respond', L('답', 'Reply'), { value: '{{ input.text }}' });
      b.chain(t, a, o);
      return b.done({ name: L('개인 비서', 'Assistant'), description: '', icon: 'robot' });
    } },
];

export const TEMPLATES = [AUTODEV_TEMPLATE, ...PIPELINE_TEMPLATES, ...BASE_TEMPLATES, ...MORE_TEMPLATES];

export const templateList = () => TEMPLATES.map(({ build, ...t }) => t);
export function buildTemplate(id, lang = 'en') {
  const t = TEMPLATES.find((x) => x.id === id);
  if (!t) return null;
  return { ...t.build(lang === 'ko' ? 'ko' : 'en'), template: id };
}
