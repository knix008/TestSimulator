// More node types (ARCHITECTURE.md §3): input and output sources in many formats (text, Markdown, HTML, CSV,
// JSON, PDF, Word, Excel, pictures), and more nodes for every palette group. Pure data, like defs.js.
const L = (ko, en) => ({ ko, en });
const MODEL = { key: 'model', type: 'model', default: '', label: L('모델', 'Model'), hint: L('비우면 설정의 기본 모델', 'Empty = the default model in Settings') };

/** Formats a Read node understands and a Save node writes. */
export const FORMAT_OPTIONS = [
  { value: 'auto', label: L('자동 (파일 이름·내용으로)', 'Auto (by name / content)') },
  { value: 'text', label: L('텍스트 (.txt)', 'Text (.txt)') },
  { value: 'markdown', label: L('Markdown (.md)', 'Markdown (.md)') },
  { value: 'html', label: L('HTML (.html)', 'HTML (.html)') },
  { value: 'csv', label: L('CSV (.csv)', 'CSV (.csv)') },
  { value: 'json', label: L('JSON (.json)', 'JSON (.json)') },
  { value: 'pdf', label: L('PDF (.pdf)', 'PDF (.pdf)') },
  { value: 'docx', label: L('Word 문서 (.docx)', 'Word document (.docx)') },
  { value: 'xlsx', label: L('Excel 표 (.xlsx)', 'Excel sheet (.xlsx)') },
  { value: 'image', label: L('그림 (png·jpg·gif·webp·svg)', 'Picture (png, jpg, gif, webp, svg)') },
];
const WRITE_FORMATS = FORMAT_OPTIONS.filter((o) => o.value !== 'auto');
const TEXT_ONLY = FORMAT_OPTIONS.filter((o) => ['text', 'markdown', 'html', 'csv', 'json'].includes(o.value));

export const MORE_NODE_TYPES = [
  // ── triggers
  { type: 'trigger.form', category: 'trigger', icon: 'form', label: L('입력 양식', 'Form'), desc: L('실행할 때 양식을 채워서 시작 (trigger.값)', 'Starts with a filled-in form (trigger.<field>)'),
    inputs: 0, outputs: ['out'], trigger: 'form', fields: [
      { key: 'title', type: 'text', default: '요청서', label: L('양식 제목', 'Form title') },
      { key: 'fields', type: 'list', default: ['name', 'email', 'request'], label: L('입력 칸', 'Fields'), hint: L('칸마다 trigger.<이름> 으로 쓸 수 있습니다', 'Each field is trigger.<name>') },
    ] },
  { type: 'trigger.file', category: 'trigger', icon: 'folderWatch', label: L('폴더 감시', 'Folder watch'), desc: L('작업 폴더에 새 파일이 생기면 시작 (배포된 에이전트)', 'Starts when a new file appears (deployed agents)'),
    inputs: 0, outputs: ['out'], trigger: 'file', fields: [
      { key: 'folder', type: 'text', default: 'inbox', label: L('폴더 (작업 폴더 안)', 'Folder (in the work folder)') },
      { key: 'pattern', type: 'text', default: '*.*', label: L('파일 이름 패턴', 'File name pattern'), hint: L('예: *.pdf, report-*.csv', 'e.g. *.pdf, report-*.csv') },
      { key: 'read', type: 'boolean', default: true, label: L('내용도 읽기 (형식 자동)', 'Read the content (format auto)') },
    ] },
  { type: 'trigger.agent', category: 'trigger', icon: 'chainLink', label: L('다른 에이전트가 끝나면', 'After another agent'), desc: L('고른 에이전트의 실행이 끝나면 시작 (배포된 에이전트)', 'Starts when a chosen agent finishes (deployed agents)'),
    inputs: 0, outputs: ['out'], trigger: 'agent', fields: [
      { key: 'agent', type: 'agent', default: '', label: L('에이전트', 'Agent') },
      { key: 'status', type: 'select', default: 'succeeded', label: L('언제', 'When'), options: [{ value: 'succeeded', label: L('성공했을 때', 'It succeeded') }, { value: 'failed', label: L('실패했을 때', 'It failed') }, { value: 'any', label: L('끝나기만 하면', 'It ended at all') }] },
    ] },

  // ── AI
  { type: 'ai.vision', category: 'ai', icon: 'image', label: L('그림 분석', 'Image analysis'), desc: L('그림을 보고 설명·글자 읽기·질문에 답', 'Describes a picture, reads its text, answers about it'),
    inputs: 1, outputs: ['out'], fields: [MODEL,
      { key: 'image', type: 'text', expr: true, default: '{{ input }}', label: L('그림', 'Picture'), hint: L('읽기 노드의 그림, data: URL, base64', 'A Read node\'s picture, a data: URL or base64') },
      { key: 'prompt', type: 'textarea', expr: true, rows: 3, default: '이 그림을 자세히 설명하고, 보이는 글자가 있으면 그대로 옮겨 주세요.', label: L('요청', 'Ask') },
    ] },
  { type: 'ai.rewrite', category: 'ai', icon: 'wand', label: L('다시 쓰기', 'Rewrite'), desc: L('어조·길이를 바꿔 다시 쓰기', 'Rewrites in another tone or length'),
    inputs: 1, outputs: ['out'], fields: [MODEL,
      { key: 'input', type: 'textarea', expr: true, rows: 3, default: '{{ input.text || input }}', label: L('입력', 'Input') },
      { key: 'tone', type: 'select', default: 'formal', label: L('어조', 'Tone'), options: [{ value: 'formal', label: L('공손하게 (업무)', 'Formal') }, { value: 'friendly', label: L('친근하게', 'Friendly') }, { value: 'concise', label: L('짧고 명확하게', 'Concise') }, { value: 'persuasive', label: L('설득력 있게', 'Persuasive') }, { value: 'plain', label: L('쉬운 말로', 'Plain language') }] },
    ] },
  { type: 'ai.keywords', category: 'ai', icon: 'tag', label: L('핵심어 뽑기', 'Keywords'), desc: L('글의 핵심어·태그 목록', 'Key terms and tags of a text'),
    inputs: 1, outputs: ['out'], fields: [MODEL,
      { key: 'input', type: 'textarea', expr: true, rows: 3, default: '{{ input.text || input }}', label: L('입력', 'Input') },
      { key: 'count', type: 'number', min: 1, max: 30, default: 5, label: L('개수', 'How many') },
    ] },
  { type: 'ai.qa', category: 'ai', icon: 'question', label: L('문서에 묻기', 'Ask a document'), desc: L('주어진 문서만 근거로 질문에 답', 'Answers a question from a given document only'),
    inputs: 1, outputs: ['out'], fields: [MODEL,
      { key: 'document', type: 'textarea', expr: true, rows: 3, default: '{{ input.text || input }}', label: L('문서', 'Document') },
      { key: 'question', type: 'textarea', expr: true, rows: 2, default: '{{ trigger.question }}', label: L('질문', 'Question') },
    ] },

  // ── knowledge
  { type: 'kb.chunk', category: 'knowledge', icon: 'scissors', label: L('글 조각내기', 'Chunk text'), desc: L('긴 글을 겹치는 조각으로 (RAG 준비)', 'Splits long text into overlapping chunks (for RAG)'),
    inputs: 1, outputs: ['out'], fields: [
      { key: 'text', type: 'textarea', expr: true, rows: 2, default: '{{ input.text || input }}', label: L('글', 'Text') },
      { key: 'size', type: 'number', min: 100, max: 8000, default: 800, label: L('조각 크기 (글자)', 'Chunk size (characters)') },
      { key: 'overlap', type: 'number', min: 0, max: 2000, default: 100, label: L('겹침 (글자)', 'Overlap (characters)') },
    ] },
  { type: 'kb.answer', category: 'knowledge', icon: 'quoteMark', label: L('지식으로 답하기 (RAG)', 'Answer from knowledge (RAG)'), desc: L('검색 + 근거를 단 답을 한 번에', 'Search + an answer with sources, in one step'),
    inputs: 1, outputs: ['out'], fields: [MODEL,
      { key: 'kbs', type: 'kb', default: [], label: L('지식 베이스', 'Knowledge bases') },
      { key: 'question', type: 'textarea', expr: true, rows: 2, default: '{{ trigger.message || input.text || input }}', label: L('질문', 'Question') },
      { key: 'topK', type: 'number', min: 1, max: 20, default: 4, label: L('근거 수', 'Passages') },
    ] },

  // ── flow
  { type: 'logic.random', category: 'logic', icon: 'shuffle', label: L('A/B 나누기', 'A/B split'), desc: L('정한 비율로 a 또는 b 로', 'Sends to a or b at a chosen rate'),
    inputs: 1, outputs: ['a', 'b'], fields: [{ key: 'percentA', type: 'number', min: 0, max: 100, default: 50, label: L('a 로 갈 비율 (%)', 'Share to a (%)') }] },
  { type: 'logic.assert', category: 'logic', icon: 'shield', label: L('품질 검사', 'Quality gate'), desc: L('조건이 틀리면 실행을 실패로 멈춤', 'Fails the run when a check does not hold'),
    inputs: 1, outputs: ['out'], fields: [
      { key: 'left', type: 'text', expr: true, default: '{{ input.failed }}', label: L('값', 'Value') },
      { key: 'op', type: 'select', default: 'equals', label: L('조건', 'Condition'), options: ['equals', 'notEquals', 'contains', 'gt', 'gte', 'lt', 'lte', 'isEmpty', 'isNotEmpty', 'matches'].map((o) => ({ value: o, label: L(o, o) })) },
      { key: 'right', type: 'text', expr: true, default: '0', label: L('비교 값', 'Compare with') },
      { key: 'message', type: 'text', expr: true, default: '품질 검사를 통과하지 못했습니다', label: L('실패 메시지', 'Failure message') },
    ] },
  { type: 'logic.batch', category: 'logic', icon: 'batch', label: L('묶음 나누기', 'Batches'), desc: L('목록을 N 개씩 묶음으로', 'Groups a list into batches of N'),
    inputs: 1, outputs: ['out'], fields: [
      { key: 'items', type: 'text', expr: true, default: '{{ input.items || input }}', label: L('목록', 'List') },
      { key: 'size', type: 'number', min: 1, max: 1000, default: 10, label: L('묶음 크기', 'Batch size') },
    ] },

  // ── transform
  { type: 'data.convert', category: 'transform', icon: 'convert', label: L('형식 바꾸기', 'Convert format'), desc: L('Markdown ↔ HTML ↔ 텍스트, CSV ↔ JSON', 'Markdown ↔ HTML ↔ text, CSV ↔ JSON'),
    inputs: 1, outputs: ['out'], fields: [
      { key: 'value', type: 'textarea', expr: true, rows: 3, default: '{{ input }}', label: L('값', 'Value') },
      { key: 'from', type: 'select', default: 'auto', label: L('원래 형식', 'From'), options: [FORMAT_OPTIONS[0], ...TEXT_ONLY] },
      { key: 'to', type: 'select', default: 'html', label: L('바꿀 형식', 'To'), options: TEXT_ONLY },
    ] },
  { type: 'data.table', category: 'transform', icon: 'table', label: L('표 만들기', 'Make a table'), desc: L('행 목록 → Markdown·HTML·텍스트 표', 'Rows → a Markdown, HTML or text table'),
    inputs: 1, outputs: ['out'], fields: [
      { key: 'items', type: 'text', expr: true, default: '{{ input.items || input }}', label: L('행 목록', 'Rows') },
      { key: 'format', type: 'select', default: 'markdown', label: L('형식', 'Format'), options: [{ value: 'markdown', label: L('Markdown', 'Markdown') }, { value: 'html', label: L('HTML', 'HTML') }, { value: 'text', label: L('텍스트 (탭 구분)', 'Text (tab separated)') }] },
    ] },
  { type: 'data.math', category: 'transform', icon: 'calculator', label: L('열 계산', 'Calculated column'), desc: L('행마다 수식으로 새 열 (예: price * qty)', 'A new column from a formula per row (e.g. price * qty)'),
    inputs: 1, outputs: ['out'], fields: [
      { key: 'items', type: 'text', expr: true, default: '{{ input.items || input }}', label: L('행 목록', 'Rows') },
      { key: 'field', type: 'text', default: 'total', label: L('새 열 이름', 'New column') },
      { key: 'formula', type: 'text', default: 'price * qty', label: L('수식', 'Formula'), hint: L('열 이름, + - * / ( ), round·min·max 등', 'Column names, + - * / ( ), round, min, max …') },
    ] },
  { type: 'data.pick', category: 'transform', icon: 'pick', label: L('열 고르기', 'Pick columns'), desc: L('필요한 열만 남기고 이름 바꾸기', 'Keeps some columns, renames them'),
    inputs: 1, outputs: ['out'], fields: [
      { key: 'items', type: 'text', expr: true, default: '{{ input.items || input }}', label: L('행 목록 (또는 한 항목)', 'Rows (or one item)') },
      { key: 'fields', type: 'text', default: 'name, email as 메일', label: L('열', 'Columns'), hint: L('쉼표로; "원래 as 새이름"', 'Comma separated; "old as new"') },
    ] },
  { type: 'data.flatten', category: 'transform', icon: 'layersFlat', label: L('평평하게', 'Flatten'), desc: L('안쪽 객체를 a.b 열로 펼치기', 'Nested objects → a.b columns'),
    inputs: 1, outputs: ['out'], fields: [{ key: 'items', type: 'text', expr: true, default: '{{ input.items || input }}', label: L('행 목록 (또는 한 항목)', 'Rows (or one item)') }] },

  // ── developer tools
  { type: 'dev.diff', category: 'dev', icon: 'diff', label: L('차이 비교', 'Diff'), desc: L('두 글의 줄 단위 차이 (unified diff)', 'Line differences of two texts (unified diff)'),
    inputs: 1, outputs: ['same', 'changed'], fields: [
      { key: 'before', type: 'textarea', expr: true, rows: 2, default: '{{ input.before }}', label: L('이전', 'Before') },
      { key: 'after', type: 'textarea', expr: true, rows: 2, default: '{{ input.after }}', label: L('이후', 'After') },
      { key: 'name', type: 'text', default: 'file', label: L('파일 이름 (머리말)', 'File name (header)') },
    ] },
  { type: 'dev.lint', category: 'dev', icon: 'bug', label: L('코드 검사 (lint)', 'Lint'), desc: L('검사 명령을 돌려 문제 수를 세기', 'Runs a linter and counts the problems'),
    inputs: 1, outputs: ['clean', 'problems'], fields: [
      { key: 'command', type: 'text', expr: true, default: 'npx eslint .', label: L('명령', 'Command') },
      { key: 'cwd', type: 'text', expr: true, default: '', label: L('폴더 (작업 폴더 기준)', 'Folder (in the work folder)') },
    ] },
  { type: 'dev.build', category: 'dev', icon: 'hammer', label: L('빌드', 'Build'), desc: L('빌드 명령을 돌리고 결과물 목록', 'Runs a build and lists what it made'),
    inputs: 1, outputs: ['ok', 'failed'], fields: [
      { key: 'command', type: 'text', expr: true, default: 'npm run build', label: L('명령', 'Command') },
      { key: 'cwd', type: 'text', expr: true, default: '', label: L('폴더 (작업 폴더 기준)', 'Folder (in the work folder)') },
      { key: 'artifacts', type: 'text', expr: true, default: 'dist', label: L('결과물 폴더', 'Output folder') },
    ] },

  // ── tools & data: input and output sources
  { type: 'io.read', category: 'data', icon: 'fileIn', label: L('읽기 (입력 소스)', 'Read (input source)'), desc: L('파일·URL·글에서 읽어 형식대로 풀기 (PDF·Word·Excel·그림…)', 'Reads a file, URL or text and parses it (PDF, Word, Excel, pictures …)'),
    inputs: 1, outputs: ['out'], tool: true, fields: [
      { key: 'source', type: 'select', default: 'file', label: L('소스', 'Source'), options: [{ value: 'file', label: L('파일 (작업 폴더)', 'File (work folder)') }, { value: 'url', label: L('URL (웹)', 'URL (web)') }, { value: 'text', label: L('직접 입력한 글', 'Text typed here') }, { value: 'input', label: L('앞 단계의 값', 'The previous step\'s value') }] },
      { key: 'path', type: 'text', expr: true, default: 'inbox/report.pdf', label: L('파일 경로', 'File path'), when: { source: 'file' } },
      { key: 'url', type: 'text', expr: true, default: 'https://example.com', label: L('URL', 'URL'), when: { source: 'url' } },
      { key: 'text', type: 'textarea', expr: true, rows: 4, default: '', label: L('글', 'Text'), when: { source: 'text' } },
      { key: 'value', type: 'text', expr: true, default: '{{ input }}', label: L('값', 'Value'), when: { source: 'input' } },
      { key: 'format', type: 'select', default: 'auto', label: L('형식', 'Format'), options: FORMAT_OPTIONS },
      { key: 'maxChars', type: 'number', min: 1000, max: 2000000, default: 200000, label: L('최대 글자 수', 'Max characters') },
    ] },
  { type: 'io.write', category: 'data', icon: 'fileOut', label: L('저장 (출력 대상)', 'Save (output target)'), desc: L('값을 형식대로 파일에 쓰기 (PDF·Word·Excel·HTML·그림…)', 'Writes a value as a file (PDF, Word, Excel, HTML, pictures …)'),
    inputs: 1, outputs: ['out'], tool: true, fields: [
      { key: 'value', type: 'textarea', expr: true, rows: 3, default: '{{ input }}', label: L('내용', 'Content'), hint: L('글·Markdown·행 목록·그림 모두', 'Text, Markdown, rows or a picture') },
      { key: 'format', type: 'select', default: 'pdf', label: L('형식', 'Format'), options: WRITE_FORMATS },
      { key: 'target', type: 'select', default: 'file', label: L('대상', 'Target'), options: [{ value: 'file', label: L('파일 (작업 폴더)', 'File (work folder)') }, { value: 'output', label: L('다음 단계로만 (data: URL)', 'Next step only (data: URL)') }] },
      { key: 'path', type: 'text', expr: true, default: 'output/report', label: L('파일 경로 (확장자 자동)', 'File path (extension added)'), when: { target: 'file' } },
      { key: 'title', type: 'text', expr: true, default: '', label: L('문서 제목', 'Document title') },
    ] },
  { type: 'tool.rss', category: 'data', icon: 'rss', label: L('RSS·뉴스 피드', 'RSS / news feed'), desc: L('피드의 새 글 목록', 'The latest items of a feed'),
    inputs: 1, outputs: ['out'], tool: true, fields: [
      { key: 'url', type: 'text', expr: true, default: 'https://news.ycombinator.com/rss', label: L('피드 URL', 'Feed URL') },
      { key: 'limit', type: 'number', min: 1, max: 100, default: 10, label: L('개수', 'How many') },
    ] },
];
