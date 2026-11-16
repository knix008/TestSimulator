// Node types: what the palette lists, what the inspector shows, which ports a node has (ARCHITECTURE.md §3).
// Pure data (no Node.js APIs): the editor imports this file as well. What a node does is in core/nodes/runtime.js.
//
// Field types: text · textarea · code · json · number · boolean · select · multiselect · model · credential ·
// kb (knowledge bases) · agent (another agent) · list (strings) · kv (rows of key/value) · conditions · fields.
// `expr: true` fields accept {{ expressions }}. `when: { key: value | [values] }` shows a field only then.

import { MORE_NODE_TYPES } from './defs-more.js';

const L = (ko, en) => ({ ko, en });

export const CATEGORIES = [
  { id: 'trigger', icon: 'bolt', color: '#f08c00', label: L('트리거', 'Triggers') },
  { id: 'ai', icon: 'sparkles', color: '#7048e8', label: L('AI', 'AI') },
  { id: 'knowledge', icon: 'book', color: '#0ca678', label: L('지식', 'Knowledge') },
  { id: 'logic', icon: 'branch', color: '#1c7ed6', label: L('흐름 제어', 'Flow') },
  { id: 'transform', icon: 'table', color: '#0b7285', label: L('데이터 변환', 'Transform') },
  { id: 'dev', icon: 'terminal', color: '#5f3dc4', label: L('개발 도구', 'Developer tools') },
  { id: 'data', icon: 'plug', color: '#e64980', label: L('도구·데이터', 'Tools & data') },
  { id: 'human', icon: 'user', color: '#d9480f', label: L('사람 참여', 'Human') },
  { id: 'output', icon: 'send', color: '#2f9e44', label: L('출력', 'Output') },
  { id: 'note', icon: 'notes', color: '#868e96', label: L('메모', 'Notes') },
];

/** Settings every runnable node has (the inspector's "Settings" section). */
export const COMMON_FIELDS = [
  { key: 'retries', type: 'number', min: 0, max: 10, default: 0, label: L('재시도 횟수', 'Retries'), hint: L('실패하면 다시 해 볼 횟수', 'How many times to try again after a failure') },
  { key: 'retryDelay', type: 'number', min: 0, max: 600, default: 2, unit: 's', label: L('재시도 간격', 'Retry delay') },
  { key: 'timeout', type: 'number', min: 0, max: 3600, default: 0, unit: 's', label: L('제한 시간', 'Timeout'), hint: L('0 = 제한 없음', '0 = none') },
  { key: 'onError', type: 'select', default: 'stop', label: L('오류가 나면', 'On error'), options: [
    { value: 'stop', label: L('실행 중지', 'Stop the run') },
    { value: 'continue', label: L('오류를 출력으로 계속', 'Continue with the error as output') },
    { value: 'branch', label: L('오류 포트로 보내기', 'Send to the error port') },
  ] },
];

const MODEL = { key: 'model', type: 'model', default: '', label: L('모델', 'Model'), hint: L('비우면 설정의 기본 모델', 'Empty = the default model in Settings') };
const SYSTEM = (ko, en) => ({ key: 'system', type: 'textarea', expr: true, rows: 4, default: '', label: L('지시문 (시스템)', 'Instructions (system)'), placeholder: L(ko, en) });
const MAX_TOKENS = { key: 'maxTokens', type: 'number', min: 1, max: 128000, default: 16000, label: L('최대 출력 토큰', 'Max output tokens'), advanced: true };
const EFFORT = { key: 'effort', type: 'select', default: '', advanced: true, label: L('추론 강도', 'Effort'), hint: L('지원하는 모델에서만 (Claude 등)', 'Models that support it (Claude …)'), options: [
  { value: '', label: L('모델 기본값', 'Model default') }, { value: 'low', label: L('낮음', 'Low') }, { value: 'medium', label: L('보통', 'Medium') },
  { value: 'high', label: L('높음', 'High') }, { value: 'xhigh', label: L('매우 높음', 'Extra high') }, { value: 'max', label: L('최대', 'Max') },
] };

export const BUILTIN_TOOLS = [
  { id: 'calculator', icon: 'calculator', label: L('계산기', 'Calculator'), desc: L('사칙연산·함수 계산', 'Evaluates arithmetic') },
  { id: 'datetime', icon: 'clock', label: L('현재 날짜·시간', 'Date & time'), desc: L('지금 시각과 요일', 'Current date, time and weekday') },
  { id: 'http_get', icon: 'globe', label: L('HTTP GET', 'HTTP GET'), desc: L('URL의 응답 본문', 'Fetches a URL and returns the body') },
  { id: 'web_page', icon: 'web', label: L('웹 페이지 읽기', 'Read web page'), desc: L('웹 페이지의 본문 텍스트', 'Text of a web page') },
  { id: 'knowledge', icon: 'book', label: L('지식 검색', 'Knowledge search'), desc: L('선택한 지식 베이스 검색', 'Searches the selected knowledge bases') },
  { id: 'javascript', icon: 'code', label: L('JavaScript 실행', 'Run JavaScript'), desc: L('격리된 곳에서 짧은 코드 실행', 'Runs a short snippet in a sandbox') },
];

export const NODE_TYPES = [
  // ── triggers
  { type: 'trigger.manual', category: 'trigger', icon: 'play', label: L('수동 실행', 'Manual trigger'), desc: L('실행 버튼이나 API로 시작', 'Starts from the Run button or the API'),
    inputs: 0, outputs: ['out'], trigger: 'manual', fields: [
      { key: 'sample', type: 'json', rows: 6, default: '{\n  "text": "Hello"\n}', label: L('시험 입력 (JSON)', 'Test input (JSON)'), hint: L('실행 버튼이 이 값을 trigger 로 넘깁니다', 'The Run button passes this as trigger') },
    ] },
  { type: 'trigger.chat', category: 'trigger', icon: 'chat', label: L('채팅 메시지', 'Chat message'), desc: L('채팅 창의 메시지로 시작 (trigger.message)', 'Starts on a chat message (trigger.message)'),
    inputs: 0, outputs: ['out'], trigger: 'chat', fields: [
      { key: 'greeting', type: 'textarea', rows: 2, default: '', label: L('첫 인사말', 'Greeting'), placeholder: L('무엇을 도와드릴까요?', 'How can I help?') },
    ] },
  { type: 'trigger.webhook', category: 'trigger', icon: 'webhook', label: L('웹훅', 'Webhook'), desc: L('HTTP 요청으로 시작 (trigger.body, trigger.query)', 'Starts on an HTTP request (trigger.body, trigger.query)'),
    inputs: 0, outputs: ['out'], trigger: 'webhook', fields: [
      { key: 'method', type: 'select', default: 'POST', label: L('메서드', 'Method'), options: ['POST', 'GET', 'ANY'].map((m) => ({ value: m, label: L(m, m) })) },
      { key: 'respond', type: 'select', default: 'wait', label: L('응답', 'Response'), options: [
        { value: 'wait', label: L('끝날 때까지 기다려 결과를 응답', 'Wait and answer with the result') },
        { value: 'accepted', label: L('바로 202 응답 (실행 ID)', 'Answer 202 at once (run id)') },
      ] },
    ] },
  { type: 'trigger.schedule', category: 'trigger', icon: 'calendarClock', label: L('일정', 'Schedule'), desc: L('정해진 시각마다 시작 (배포된 에이전트)', 'Starts on a schedule (deployed agents)'),
    inputs: 0, outputs: ['out'], trigger: 'schedule', fields: [
      { key: 'mode', type: 'select', default: 'interval', label: L('방식', 'Mode'), options: [
        { value: 'interval', label: L('몇 분마다', 'Every N minutes') }, { value: 'daily', label: L('매일 정해진 시각', 'Daily at') },
        { value: 'weekly', label: L('매주 정해진 요일·시각', 'Weekly at') }, { value: 'cron', label: L('cron 식', 'Cron expression') },
      ] },
      { key: 'minutes', type: 'number', min: 1, max: 100000, default: 60, unit: 'min', label: L('간격', 'Interval'), when: { mode: 'interval' } },
      { key: 'time', type: 'text', default: '09:00', label: L('시각 (HH:MM)', 'Time (HH:MM)'), when: { mode: ['daily', 'weekly'] } },
      { key: 'weekday', type: 'select', default: '1', label: L('요일', 'Weekday'), when: { mode: 'weekly' }, options: [['0', '일', 'Sunday'], ['1', '월', 'Monday'], ['2', '화', 'Tuesday'], ['3', '수', 'Wednesday'], ['4', '목', 'Thursday'], ['5', '금', 'Friday'], ['6', '토', 'Saturday']].map(([value, ko, en]) => ({ value, label: L(ko, en) })) },
      { key: 'cron', type: 'text', default: '0 9 * * 1-5', label: L('cron (분 시 일 월 요일)', 'Cron (min hour day month weekday)'), when: { mode: 'cron' } },
    ] },

  // ── AI
  { type: 'ai.agent', category: 'ai', icon: 'robot', label: L('AI 에이전트', 'AI agent'), desc: L('도구를 쓰며 스스로 여러 단계를 진행', 'Reasons in steps and calls tools'),
    inputs: 1, outputs: ['out'], toolPort: true, fields: [
      MODEL,
      SYSTEM('당신은 친절한 비서입니다. 필요하면 도구를 사용하세요.', 'You are a helpful assistant. Use the tools when they help.'),
      { key: 'prompt', type: 'textarea', expr: true, rows: 3, default: '{{ trigger.message || input.text || input }}', label: L('요청', 'Request') },
      { key: 'tools', type: 'multiselect', default: ['calculator', 'datetime'], label: L('내장 도구', 'Built-in tools'), options: BUILTIN_TOOLS.map((t) => ({ value: t.id, label: t.label, icon: t.icon })) },
      { key: 'kbs', type: 'kb', default: [], label: L('지식 베이스', 'Knowledge bases'), when: { tools: 'knowledge' } },
      { key: 'memory', type: 'boolean', default: true, label: L('대화 기억', 'Conversation memory'), hint: L('같은 세션의 이전 대화를 함께 보냄', 'Sends the earlier messages of the same session') },
      { key: 'memoryWindow', type: 'number', min: 1, max: 200, default: 20, label: L('기억할 메시지 수', 'Messages to remember'), when: { memory: true } },
      { key: 'maxSteps', type: 'number', min: 1, max: 50, default: 8, label: L('최대 단계', 'Max steps'), hint: L('도구 호출을 포함한 모델 호출 횟수', 'Model calls including tool rounds') },
      EFFORT, MAX_TOKENS,
    ] },
  { type: 'ai.llm', category: 'ai', icon: 'sparkles', label: L('LLM 호출', 'LLM prompt'), desc: L('프롬프트 한 번 → 답 한 번', 'One prompt, one answer'),
    inputs: 1, outputs: ['out'], fields: [
      MODEL,
      SYSTEM('예: 당신은 꼼꼼한 편집자입니다.', 'e.g. You are a careful editor.'),
      { key: 'prompt', type: 'textarea', expr: true, rows: 5, default: '{{ input.text || input }}', label: L('프롬프트', 'Prompt') },
      { key: 'json', type: 'boolean', default: false, label: L('JSON 으로 답하기', 'Answer as JSON'), hint: L('출력의 data 에 해석된 객체', 'The parsed object goes to output.data') },
      { key: 'schema', type: 'json', rows: 4, default: '', label: L('JSON 모양 (예시)', 'JSON shape (example)'), when: { json: true } },
      EFFORT, MAX_TOKENS,
    ] },
  { type: 'ai.classify', category: 'ai', icon: 'tag', label: L('분류', 'Classifier'), desc: L('입력을 범주 하나로 분류해 그 포트로', 'Routes the input to one category port'),
    inputs: 1, outputs: (c) => [...(Array.isArray(c.categories) ? c.categories : []).filter(Boolean), 'other'], fields: [
      MODEL,
      { key: 'input', type: 'textarea', expr: true, rows: 3, default: '{{ trigger.message || input.text || input }}', label: L('분류할 내용', 'Text to classify') },
      { key: 'categories', type: 'list', default: ['question', 'complaint', 'order'], label: L('범주 (포트)', 'Categories (ports)') },
      { key: 'instructions', type: 'textarea', rows: 2, default: '', label: L('기준 설명', 'Guidance'), placeholder: L('범주를 고르는 기준', 'How to choose') },
    ] },
  { type: 'ai.extract', category: 'ai', icon: 'extract', label: L('정보 추출', 'Extractor'), desc: L('글에서 정해진 항목을 JSON 으로', 'Pulls named fields out of text as JSON'),
    inputs: 1, outputs: ['out'], fields: [
      MODEL,
      { key: 'input', type: 'textarea', expr: true, rows: 3, default: '{{ input.text || input }}', label: L('원문', 'Text') },
      { key: 'fields', type: 'kv', default: [{ key: 'name', value: '사람 이름 / person name' }, { key: 'email', value: '이메일 / email' }], label: L('항목 (이름 · 설명)', 'Fields (name · description)'), keyLabel: L('이름', 'Name'), valueLabel: L('설명', 'Description') },
    ] },

  // ── knowledge
  { type: 'kb.search', category: 'knowledge', icon: 'search', label: L('지식 검색 (RAG)', 'Knowledge search (RAG)'), desc: L('지식 베이스에서 관련 조각 찾기', 'Finds relevant passages in knowledge bases'),
    inputs: 1, outputs: ['out'], fields: [
      { key: 'kbs', type: 'kb', default: [], label: L('지식 베이스', 'Knowledge bases') },
      { key: 'query', type: 'textarea', expr: true, rows: 2, default: '{{ trigger.message || input.text || input }}', label: L('검색어', 'Query') },
      { key: 'topK', type: 'number', min: 1, max: 50, default: 5, label: L('결과 수', 'Results') },
    ] },
  { type: 'kb.add', category: 'knowledge', icon: 'bookPlus', label: L('지식 추가', 'Add to knowledge'), desc: L('글을 지식 베이스에 저장', 'Stores text in a knowledge base'),
    inputs: 1, outputs: ['out'], fields: [
      { key: 'kb', type: 'kb', single: true, default: '', label: L('지식 베이스', 'Knowledge base') },
      { key: 'title', type: 'text', expr: true, default: '{{ run.id }}', label: L('문서 이름', 'Document name') },
      { key: 'text', type: 'textarea', expr: true, rows: 3, default: '{{ input.text || input }}', label: L('내용', 'Content') },
    ] },

  // ── flow
  { type: 'logic.if', category: 'logic', icon: 'branch', label: L('조건 분기', 'If'), desc: L('조건이 맞으면 true, 아니면 false 포트', 'true / false ports'),
    inputs: 1, outputs: ['true', 'false'], fields: [
      { key: 'conditions', type: 'conditions', default: [{ left: '{{ input.text }}', op: 'isNotEmpty', right: '' }], label: L('조건', 'Conditions') },
      { key: 'combine', type: 'select', default: 'and', label: L('결합', 'Combine'), options: [{ value: 'and', label: L('모두 맞을 때 (AND)', 'All (AND)') }, { value: 'or', label: L('하나라도 맞을 때 (OR)', 'Any (OR)') }] },
    ] },
  { type: 'logic.switch', category: 'logic', icon: 'switch', label: L('값으로 분기', 'Switch'), desc: L('값과 같은 이름의 포트로', 'Routes to the port named like the value'),
    inputs: 1, outputs: (c) => [...(Array.isArray(c.cases) ? c.cases : []).filter(Boolean), 'default'], fields: [
      { key: 'value', type: 'text', expr: true, default: '{{ input.category }}', label: L('값', 'Value') },
      { key: 'cases', type: 'list', default: ['a', 'b'], label: L('경우 (포트)', 'Cases (ports)') },
    ] },
  { type: 'logic.loop', category: 'logic', icon: 'loop', label: L('반복 (각 항목)', 'Loop over items'), desc: L('목록의 항목마다 item 포트를 실행, 끝나면 done', 'Runs the item port per item, then done'),
    inputs: 1, outputs: ['item', 'done'], fields: [
      { key: 'items', type: 'text', expr: true, default: '{{ input.items }}', label: L('목록', 'Items') },
      { key: 'max', type: 'number', min: 1, max: 10000, default: 100, label: L('최대 항목 수', 'Max items') },
    ] },
  { type: 'logic.merge', category: 'logic', icon: 'merge', label: L('합치기', 'Merge'), desc: L('들어오는 갈래를 모두 기다렸다가 하나로', 'Waits for every incoming branch'),
    inputs: 1, multiInput: true, outputs: ['out'], fields: [
      { key: 'mode', type: 'select', default: 'object', label: L('모양', 'Shape'), options: [{ value: 'object', label: L('노드 이름별 객체', 'Object by node name') }, { value: 'array', label: L('배열', 'Array') }, { value: 'text', label: L('글로 이어 붙이기', 'Joined text') }] },
    ] },
  { type: 'logic.set', category: 'logic', icon: 'variable', label: L('변수 설정', 'Set variables'), desc: L('vars 에 값 저장', 'Stores values in vars'),
    inputs: 1, outputs: ['out'], fields: [
      { key: 'values', type: 'kv', expr: true, default: [{ key: 'topic', value: '{{ input.text }}' }], label: L('변수', 'Variables'), keyLabel: L('이름', 'Name'), valueLabel: L('값', 'Value') },
    ] },
  { type: 'logic.template', category: 'logic', icon: 'text', label: L('텍스트 템플릿', 'Text template'), desc: L('표현식으로 글 만들기', 'Builds text from expressions'),
    inputs: 1, outputs: ['out'], fields: [
      { key: 'template', type: 'textarea', expr: true, rows: 5, default: 'Hello {{ input.name }}', label: L('템플릿', 'Template') },
    ] },
  { type: 'logic.code', category: 'logic', icon: 'code', label: L('코드 (JavaScript)', 'Code (JavaScript)'), desc: L('input · vars · nodes 를 받아 값을 return', 'Gets input, vars, nodes; returns a value'),
    inputs: 1, outputs: ['out'], fields: [
      { key: 'code', type: 'code', rows: 10, default: '// input, trigger, vars, nodes, item are available\nconst text = String(input?.text ?? input ?? "");\nreturn { text, words: text.split(/\\s+/).filter(Boolean).length };', label: L('코드', 'Code') },
    ] },
  { type: 'logic.wait', category: 'logic', icon: 'hourglass', label: L('기다리기', 'Wait'), desc: L('정해진 시간만큼 멈춤', 'Pauses for a while'),
    inputs: 1, outputs: ['out'], fields: [
      { key: 'seconds', type: 'number', min: 0, max: 86400, default: 1, unit: 's', label: L('시간', 'Duration') },
    ] },
  { type: 'logic.stop', category: 'logic', icon: 'stop', label: L('중지', 'Stop'), desc: L('실행을 끝내거나 오류로 멈춤', 'Ends the run, or fails it'),
    inputs: 1, outputs: [], fields: [
      { key: 'mode', type: 'select', default: 'success', label: L('결과', 'Result'), options: [{ value: 'success', label: L('성공으로 끝내기', 'End successfully') }, { value: 'error', label: L('오류로 멈추기', 'Fail with an error') }] },
      { key: 'message', type: 'text', expr: true, default: '', label: L('메시지', 'Message') },
    ] },

  // ── tools & data
  { type: 'tool.http', category: 'data', icon: 'globe', label: L('HTTP 요청', 'HTTP request'), desc: L('REST API 호출', 'Calls a REST API'),
    inputs: 1, outputs: ['out'], tool: true, fields: [
      { key: 'method', type: 'select', default: 'GET', label: L('메서드', 'Method'), options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => ({ value: m, label: L(m, m) })) },
      { key: 'url', type: 'text', expr: true, default: 'https://httpbin.org/get', label: L('URL', 'URL') },
      { key: 'query', type: 'kv', expr: true, default: [], label: L('쿼리 매개변수', 'Query parameters') },
      { key: 'headers', type: 'kv', expr: true, default: [], label: L('헤더', 'Headers') },
      { key: 'auth', type: 'credential', default: '', label: L('인증 (Bearer 키)', 'Auth (Bearer key)'), providers: ['http'] },
      { key: 'body', type: 'json', expr: true, rows: 5, default: '', label: L('본문', 'Body'), when: { method: ['POST', 'PUT', 'PATCH', 'DELETE'] } },
    ] },
  { type: 'tool.web', category: 'data', icon: 'web', label: L('웹 페이지 읽기', 'Read web page'), desc: L('HTML 에서 본문 텍스트와 링크', 'Text and links of a page'),
    inputs: 1, outputs: ['out'], tool: true, fields: [
      { key: 'url', type: 'text', expr: true, default: '{{ input.url || trigger.url }}', label: L('URL', 'URL') },
      { key: 'maxChars', type: 'number', min: 100, max: 200000, default: 20000, label: L('최대 글자 수', 'Max characters') },
    ] },
  { type: 'tool.subagent', category: 'data', icon: 'robot', label: L('다른 에이전트 호출', 'Call another agent'), desc: L('저장된 에이전트를 하위 작업으로 실행', 'Runs a saved agent as a sub-task'),
    inputs: 1, outputs: ['out'], tool: true, fields: [
      { key: 'agent', type: 'agent', default: '', label: L('에이전트', 'Agent') },
      { key: 'input', type: 'textarea', expr: true, rows: 3, default: '{{ input }}', label: L('넘길 입력', 'Input') },
    ] },
  { type: 'tool.file', category: 'data', icon: 'file', label: L('파일 읽기·쓰기', 'File read/write'), desc: L('작업 폴더의 파일 (데스크톱)', 'Files in the work folder (desktop)'),
    inputs: 1, outputs: ['out'], tool: true, fields: [
      { key: 'op', type: 'select', default: 'read', label: L('동작', 'Action'), options: [{ value: 'read', label: L('읽기', 'Read') }, { value: 'write', label: L('쓰기', 'Write') }, { value: 'append', label: L('뒤에 붙이기', 'Append') }, { value: 'list', label: L('폴더 목록', 'List folder') }] },
      { key: 'path', type: 'text', expr: true, default: 'notes/output.txt', label: L('경로 (작업 폴더 기준)', 'Path (in the work folder)') },
      { key: 'content', type: 'textarea', expr: true, rows: 3, default: '{{ input.text || input }}', label: L('내용', 'Content'), when: { op: ['write', 'append'] } },
    ] },
  { type: 'tool.shell', category: 'data', icon: 'terminal', label: L('명령 실행', 'Run command'), desc: L('셸 명령 (데스크톱, 설정에서 허용 시)', 'A shell command (desktop, when allowed)'),
    inputs: 1, outputs: ['out'], tool: true, fields: [
      { key: 'command', type: 'text', expr: true, default: 'git status --short', label: L('명령', 'Command') },
      { key: 'cwd', type: 'text', expr: true, default: '', label: L('작업 폴더', 'Working folder'), placeholder: L('비우면 작업 폴더', 'Empty = the work folder') },
    ] },
  { type: 'tool.json', category: 'data', icon: 'braces', label: L('JSON 변환', 'JSON'), desc: L('글 ↔ 객체, 경로로 값 꺼내기', 'Parse, stringify, pick a path'),
    inputs: 1, outputs: ['out'], fields: [
      { key: 'op', type: 'select', default: 'parse', label: L('동작', 'Action'), options: [{ value: 'parse', label: L('글 → 객체', 'Parse text') }, { value: 'stringify', label: L('객체 → 글', 'Stringify') }, { value: 'pick', label: L('경로의 값', 'Pick a path') }] },
      { key: 'value', type: 'text', expr: true, default: '{{ input }}', label: L('값', 'Value') },
      { key: 'path', type: 'text', default: 'data.items', label: L('경로', 'Path'), when: { op: 'pick' } },
    ] },
  { type: 'tool.datetime', category: 'data', icon: 'clock', label: L('날짜·시간', 'Date & time'), desc: L('지금 시각과 계산', 'Now, and offsets'),
    inputs: 1, outputs: ['out'], fields: [
      { key: 'offsetDays', type: 'number', min: -36500, max: 36500, default: 0, label: L('더할 날 수', 'Add days') },
      { key: 'timeZone', type: 'text', default: '', label: L('시간대', 'Time zone'), placeholder: 'Asia/Seoul' },
    ] },

  // ── more AI
  { type: 'ai.summarize', category: 'ai', icon: 'notes', label: L('요약', 'Summarize'), desc: L('긴 글을 짧게 (글머리표·문단)', 'Shortens text (bullets or paragraph)'),
    inputs: 1, outputs: ['out'], fields: [{ key: 'model', type: 'model', default: '', label: L('모델', 'Model'), hint: L('비우면 설정의 기본 모델', 'Empty = the default model in Settings') }, { key: 'input', type: 'textarea', expr: true, rows: 3, default: '{{ input.text || input }}', label: L('입력', 'Input') },
      { key: 'length', type: 'select', default: 'short', label: L('길이', 'Length'), options: [{ value: 'short', label: L('3줄', '3 lines') }, { value: 'medium', label: L('한 문단', 'A paragraph') }, { value: 'long', label: L('자세히', 'Detailed') }] },
      { key: 'style', type: 'select', default: 'bullets', label: L('형식', 'Style'), options: [{ value: 'bullets', label: L('글머리표', 'Bullets') }, { value: 'paragraph', label: L('문단', 'Paragraph') }] }] },
  { type: 'ai.translate', category: 'ai', icon: 'globe', label: L('번역', 'Translate'), desc: L('지정한 언어로 번역', 'Translates into a language'),
    inputs: 1, outputs: ['out'], fields: [{ key: 'model', type: 'model', default: '', label: L('모델', 'Model'), hint: L('비우면 설정의 기본 모델', 'Empty = the default model in Settings') }, { key: 'input', type: 'textarea', expr: true, rows: 3, default: '{{ input.text || input }}', label: L('입력', 'Input') }, { key: 'to', type: 'text', default: 'English', label: L('대상 언어', 'Into') }] },
  { type: 'ai.sentiment', category: 'ai', icon: 'activity', label: L('감정 분류', 'Sentiment'), desc: L('긍정·부정·중립 포트로', 'positive / negative / neutral ports'),
    inputs: 1, outputs: ['positive', 'negative', 'neutral'], fields: [{ key: 'model', type: 'model', default: '', label: L('모델', 'Model'), hint: L('비우면 설정의 기본 모델', 'Empty = the default model in Settings') }, { key: 'input', type: 'textarea', expr: true, rows: 3, default: '{{ input.text || input }}', label: L('입력', 'Input') }] },

  // ── transform
  { type: 'data.csv', category: 'transform', icon: 'table', label: L('CSV 변환', 'CSV'), desc: L('CSV 글 ↔ 행 목록', 'CSV text ↔ rows'),
    inputs: 1, outputs: ['out'], fields: [
      { key: 'op', type: 'select', default: 'parse', label: L('동작', 'Action'), options: [{ value: 'parse', label: L('글 → 행', 'Parse') }, { value: 'stringify', label: L('행 → 글', 'Stringify') }] },
      { key: 'value', type: 'textarea', expr: true, rows: 3, default: '{{ input.csv || input }}', label: L('값', 'Value') },
      { key: 'delimiter', type: 'text', default: ',', label: L('구분자', 'Delimiter') }] },
  { type: 'data.filter', category: 'transform', icon: 'filter', label: L('목록 거르기', 'Filter list'), desc: L('조건에 맞는 항목만', 'Keeps items that match'),
    inputs: 1, outputs: ['out'], fields: [{ key: 'items', type: 'text', expr: true, default: '{{ input.items || input }}', label: L('목록', 'List') }, { key: 'field', type: 'text', default: 'status', label: L('항목 경로', 'Field path'), hint: L('항목 안의 경로 (비우면 항목 자체)', 'A path inside each item (empty = the item)') },
      { key: 'op', type: 'select', default: 'equals', label: L('조건', 'Condition'), options: ['equals', 'notEquals', 'contains', 'gt', 'gte', 'lt', 'lte', 'isEmpty', 'isNotEmpty', 'matches'].map((o) => ({ value: o, label: L(o, o) })) },
      { key: 'value', type: 'text', expr: true, default: 'open', label: L('비교 값', 'Value') }] },
  { type: 'data.sort', category: 'transform', icon: 'sort', label: L('정렬', 'Sort'), desc: L('항목을 순서대로', 'Orders items'),
    inputs: 1, outputs: ['out'], fields: [{ key: 'items', type: 'text', expr: true, default: '{{ input.items || input }}', label: L('목록', 'List') }, { key: 'field', type: 'text', default: 'amount', label: L('항목 경로', 'Field path'), hint: L('항목 안의 경로 (비우면 항목 자체)', 'A path inside each item (empty = the item)') },
      { key: 'order', type: 'select', default: 'desc', label: L('순서', 'Order'), options: [{ value: 'asc', label: L('오름차순', 'Ascending') }, { value: 'desc', label: L('내림차순', 'Descending') }] },
      { key: 'limit', type: 'number', min: 0, max: 100000, default: 0, label: L('앞에서 몇 개', 'Take first'), hint: L('0 = 모두', '0 = all') }] },
  { type: 'data.aggregate', category: 'transform', icon: 'calculator', label: L('집계', 'Aggregate'), desc: L('합계·평균·개수 (묶어서)', 'Sum, average, count (grouped)'),
    inputs: 1, outputs: ['out'], fields: [{ key: 'items', type: 'text', expr: true, default: '{{ input.items || input }}', label: L('목록', 'List') },
      { key: 'groupBy', type: 'text', default: 'region', label: L('묶을 항목', 'Group by'), hint: L('비우면 전체', 'Empty = all') },
      { key: 'valueField', type: 'text', default: 'amount', label: L('값 항목', 'Value field') },
      { key: 'fn', type: 'select', default: 'sum', label: L('계산', 'Function'), options: ['sum', 'avg', 'count', 'min', 'max'].map((o) => ({ value: o, label: L(o, o) })) }] },
  { type: 'data.split', category: 'transform', icon: 'list', label: L('글 나누기', 'Split text'), desc: L('줄·문장·구분자·정규식으로 나눔', 'By lines, sentences, a delimiter or a regex'),
    inputs: 1, outputs: ['out'], fields: [{ key: 'value', type: 'textarea', expr: true, rows: 2, default: '{{ input.text || input }}', label: L('글', 'Text') },
      { key: 'mode', type: 'select', default: 'lines', label: L('방식', 'Mode'), options: [{ value: 'lines', label: L('줄', 'Lines') }, { value: 'paragraphs', label: L('문단', 'Paragraphs') }, { value: 'sentences', label: L('문장', 'Sentences') }, { value: 'delimiter', label: L('구분자', 'Delimiter') }, { value: 'regex', label: L('정규식', 'Regex') }] },
      { key: 'delimiter', type: 'text', default: ',', label: L('구분자·정규식', 'Delimiter / regex'), when: { mode: ['delimiter', 'regex'] } }] },
  { type: 'data.regex', category: 'transform', icon: 'search', label: L('정규식', 'Regex'), desc: L('찾기·모두 뽑기·바꾸기·검사', 'Match, extract all, replace, test'),
    inputs: 1, outputs: ['out'], fields: [{ key: 'value', type: 'textarea', expr: true, rows: 2, default: '{{ input.text || input }}', label: L('글', 'Text') },
      { key: 'pattern', type: 'text', default: '[\\w.+-]+@[\\w-]+\\.[\\w.-]+', label: L('패턴', 'Pattern') },
      { key: 'flags', type: 'text', default: 'g', label: L('플래그', 'Flags') },
      { key: 'op', type: 'select', default: 'extract', label: L('동작', 'Action'), options: [{ value: 'extract', label: L('모두 뽑기', 'Extract all') }, { value: 'match', label: L('첫 일치', 'First match') }, { value: 'replace', label: L('바꾸기', 'Replace') }, { value: 'test', label: L('검사', 'Test') }] },
      { key: 'replacement', type: 'text', default: '', label: L('바꿀 글', 'Replacement'), when: { op: 'replace' } }] },
  { type: 'data.dedupe', category: 'transform', icon: 'merge', label: L('중복 제거', 'Remove duplicates'), desc: L('같은 항목을 하나만', 'Keeps one of each'),
    inputs: 1, outputs: ['out'], fields: [{ key: 'items', type: 'text', expr: true, default: '{{ input.items || input }}', label: L('목록', 'List') }, { key: 'field', type: 'text', default: '', label: L('항목 경로', 'Field path'), hint: L('항목 안의 경로 (비우면 항목 자체)', 'A path inside each item (empty = the item)') }] },
  { type: 'logic.counter', category: 'logic', icon: 'percent', label: L('카운터', 'Counter'), desc: L('반복·재시도 횟수 세기 (vars 에 저장)', 'Counts loops and retries (kept in vars)'),
    inputs: 1, outputs: ['out'], fields: [{ key: 'name', type: 'text', default: 'attempt', label: L('이름', 'Name') },
      { key: 'op', type: 'select', default: 'increment', label: L('동작', 'Action'), options: [{ value: 'increment', label: L('1 더하기', 'Add 1') }, { value: 'reset', label: L('0으로', 'Reset') }, { value: 'get', label: L('읽기', 'Read') }] }] },

  // ── developer tools
  { type: 'tool.test', category: 'dev', icon: 'flask', label: L('테스트 실행', 'Run tests'), desc: L('테스트 명령을 실행하고 통과·실패 수를 집계', 'Runs a test command and counts passes and failures'),
    inputs: 1, outputs: ['passed', 'failed'], tool: true, fields: [
      { key: 'command', type: 'text', expr: true, default: '"{{ env.node }}" --test', label: L('테스트 명령', 'Test command'), hint: L('node --test, npm test, pytest, jest … 결과 요약을 읽습니다', 'Reads the summary of node --test, npm test, pytest, jest …') },
      { key: 'cwd', type: 'text', expr: true, default: '{{ vars.dir }}', label: L('작업 폴더', 'Working folder') },
      { key: 'kind', type: 'select', default: 'unit', label: L('종류', 'Kind'), options: [{ value: 'unit', label: L('단위', 'Unit') }, { value: 'integration', label: L('통합', 'Integration') }, { value: 'gui', label: L('GUI', 'GUI') }, { value: 'e2e', label: L('E2E', 'E2E') }] }] },
  { type: 'tool.project', category: 'dev', icon: 'folderOpen', label: L('프로젝트 읽기', 'Read project'), desc: L('폴더의 소스 파일과 내용을 가져옴', 'Loads a folder\'s source files and contents'),
    inputs: 1, outputs: ['out'], tool: true, fields: [
      { key: 'path', type: 'text', expr: true, default: '{{ vars.dir }}', label: L('폴더 (작업 폴더 기준 또는 절대 경로)', 'Folder (in the work folder, or absolute)') },
      { key: 'include', type: 'text', default: 'js,mjs,cjs,ts,tsx,jsx,json,html,css,md,py', label: L('확장자', 'Extensions') },
      { key: 'maxFiles', type: 'number', min: 1, max: 2000, default: 200, label: L('최대 파일 수', 'Max files') }] },
  { type: 'tool.git', category: 'dev', icon: 'branch', label: L('git', 'git'), desc: L('상태·차이·기록·커밋·복제', 'status, diff, log, commit, clone'),
    inputs: 1, outputs: ['out'], tool: true, fields: [
      { key: 'op', type: 'select', default: 'status', label: L('동작', 'Action'), options: ['status', 'diff', 'log', 'commit', 'clone', 'init'].map((o) => ({ value: o, label: L(o, o) })) },
      { key: 'cwd', type: 'text', expr: true, default: '{{ vars.dir }}', label: L('저장소 폴더', 'Repository folder') },
      { key: 'message', type: 'text', expr: true, default: 'chore: update', label: L('커밋 메시지', 'Commit message'), when: { op: 'commit' } },
      { key: 'url', type: 'text', expr: true, default: '', label: L('복제할 주소', 'Clone URL'), when: { op: 'clone' } }] },
  { type: 'tool.sqlite', category: 'dev', icon: 'database', label: L('SQLite 쿼리', 'SQLite query'), desc: L('작업 폴더의 SQLite 파일에 SQL 실행', 'Runs SQL on a SQLite file in the work folder'),
    inputs: 1, outputs: ['out'], tool: true, fields: [
      { key: 'database', type: 'text', expr: true, default: 'data/app.db', label: L('데이터베이스 파일', 'Database file') },
      { key: 'sql', type: 'code', expr: true, rows: 5, default: "CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY, text TEXT);\nINSERT INTO notes (text) VALUES ('{{ input.text || \"hello\" }}');\nSELECT * FROM notes ORDER BY id DESC LIMIT 5;", label: L('SQL', 'SQL') }] },
  { type: 'tool.chatops', category: 'data', icon: 'bell', label: L('팀 메신저 알림', 'Team chat message'), desc: L('Slack·Teams·Discord 수신 웹훅으로 보내기', 'Posts to a Slack, Teams or Discord incoming webhook'),
    inputs: 1, outputs: ['out'], tool: true, fields: [
      { key: 'service', type: 'select', default: 'slack', label: L('서비스', 'Service'), options: [{ value: 'slack', label: L('Slack', 'Slack') }, { value: 'teams', label: L('Teams', 'Teams') }, { value: 'discord', label: L('Discord', 'Discord') }] },
      { key: 'url', type: 'text', expr: true, default: '', label: L('웹훅 주소', 'Webhook URL') },
      { key: 'text', type: 'textarea', expr: true, rows: 3, default: '{{ input.text || input }}', label: L('메시지', 'Message') }] },

  // ── human in the loop
  { type: 'human.approval', category: 'human', icon: 'approve', label: L('승인 요청', 'Approval'), desc: L('사람이 승인/거절할 때까지 기다림', 'Waits for a person to approve or reject'),
    inputs: 1, outputs: ['approved', 'rejected'], fields: [
      { key: 'message', type: 'textarea', expr: true, rows: 3, default: '이 내용을 보낼까요?\n\n{{ input.text || input }}', label: L('질문', 'Question') },
      { key: 'timeoutMinutes', type: 'number', min: 0, max: 100000, default: 0, unit: 'min', label: L('기다릴 시간', 'Wait up to'), hint: L('0 = 끝없이. 지나면 거절', '0 = forever. Rejected after that') },
    ] },
  { type: 'human.input', category: 'human', icon: 'form', label: L('사람에게 묻기', 'Ask a person'), desc: L('양식을 채울 때까지 기다림', 'Waits for a form to be filled in'),
    inputs: 1, outputs: ['out'], fields: [
      { key: 'message', type: 'textarea', expr: true, rows: 2, default: '추가 정보가 필요합니다.', label: L('안내', 'Message') },
      { key: 'fields', type: 'list', default: ['answer'], label: L('입력 항목', 'Fields') },
    ] },
  { type: 'human.notify', category: 'human', icon: 'bell', label: L('알림', 'Notify'), desc: L('실행 기록과 앱 알림으로 메시지', 'A message in the run log and the app'),
    inputs: 1, outputs: ['out'], fields: [
      { key: 'message', type: 'textarea', expr: true, rows: 2, default: '{{ input.text || input }}', label: L('메시지', 'Message') },
      { key: 'level', type: 'select', default: 'info', label: L('수준', 'Level'), options: [{ value: 'info', label: L('정보', 'Info') }, { value: 'success', label: L('성공', 'Success') }, { value: 'warning', label: L('경고', 'Warning') }] },
    ] },

  // ── output
  { type: 'out.respond', category: 'output', icon: 'send', label: L('응답', 'Respond'), desc: L('실행 결과 · 채팅 답 · 웹훅 응답', 'Run result, chat reply, webhook response'),
    inputs: 1, outputs: [], fields: [
      { key: 'value', type: 'textarea', expr: true, rows: 3, default: '{{ input.text || input }}', label: L('응답 내용', 'Response') },
      { key: 'status', type: 'number', min: 100, max: 599, default: 200, label: L('HTTP 상태 (웹훅)', 'HTTP status (webhook)'), advanced: true },
    ] },

  // ── note
  { type: 'note', category: 'note', icon: 'notes', label: L('메모', 'Sticky note'), desc: L('캔버스 위의 설명 (실행되지 않음)', 'Text on the canvas (never runs)'),
    inputs: 0, outputs: [], note: true, fields: [
      { key: 'text', type: 'textarea', rows: 6, default: '메모 / Note', label: L('내용', 'Text') },
      { key: 'color', type: 'select', default: 'yellow', label: L('색', 'Colour'), options: ['yellow', 'blue', 'green', 'pink', 'gray'].map((c) => ({ value: c, label: L(c, c) })) },
    ] },
];

// the note stays last in its group; the rest join their groups (defs-more.js)
NODE_TYPES.splice(NODE_TYPES.findIndex((d) => d.type === 'note'), 0, ...MORE_NODE_TYPES);

const BY_TYPE = new Map(NODE_TYPES.map((d) => [d.type, d]));
export const nodeDef = (type) => BY_TYPE.get(type) ?? null;
export const categoryOf = (id) => CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[0];

/** The output ports of a node now (some follow its settings: classifier categories, switch cases, error port). */
export function outputPorts(node) {
  const def = nodeDef(node?.type);
  if (!def) return [];
  const base = typeof def.outputs === 'function' ? def.outputs(node.config ?? {}) : [...def.outputs];
  const unique = [...new Set(base.map(String))];
  if (!def.note && !def.trigger && (node.config?.onError === 'branch')) unique.push('error');
  return unique;
}

/** The default settings of a new node. */
export function defaultConfig(type) {
  const def = nodeDef(type);
  const out = {};
  for (const f of [...(def?.fields ?? []), ...(def?.note || def?.trigger ? [] : COMMON_FIELDS)]) out[f.key] = structuredClone(f.default ?? '');
  return out;
}

export const isTrigger = (node) => Boolean(nodeDef(node?.type)?.trigger);
export const label = (text, lang) => (text && typeof text === 'object' ? text[lang] ?? text.en ?? text.ko : text ?? '');
