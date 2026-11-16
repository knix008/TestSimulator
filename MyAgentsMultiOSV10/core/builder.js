// "Describe your agent" → a first draft of the workflow (ARCHITECTURE.md §9). With a real model the model
// writes the graph from the node catalogue; with the offline model (or when the answer is not usable) a
// keyword planner builds a straight flow. The user refines the draft on the canvas.
import { NODE_TYPES, nodeDef, defaultConfig } from './nodes/defs.js';
import { autoLayout, SCREEN_ASPECT } from './layout.js';
import { normalizeAgent } from './services.js';
import { parseJsonAnswer, parseModelRef } from './providers/index.js';

const has = (text, ...words) => words.some((w) => text.includes(w));

/** Keyword planner: trigger → (fetch / search / extract / classify) → AI → (approval) → output. */
export function planFromKeywords(description, lang = 'ko') {
  const t = String(description).toLowerCase();
  const T = (ko, en) => (lang === 'ko' ? ko : en);
  const nodes = [];
  const edges = [];
  const add = (type, name, config = {}) => { const id = `n${nodes.length + 1}`; nodes.push({ id, type, name, x: 0, y: 0, config: { ...defaultConfig(type), ...config } }); return id; };
  const link = (a, b, port = 'out') => edges.push({ id: `e${edges.length + 1}`, from: a, fromPort: port, to: b, toPort: 'in' });

  let trigger;
  if (has(t, 'webhook', '웹훅', 'api 로 받', 'http 요청', 'github')) trigger = add('trigger.webhook', T('웹훅', 'Webhook'));
  else if (has(t, '매일', '매주', '매시간', '마다', 'every', 'daily', 'weekly', 'schedule', '일정', '정기')) {
    const weekly = has(t, '매주', 'weekly');
    const hourly = has(t, '매시간', 'hourly', '분마다', 'minutes');
    trigger = add('trigger.schedule', T('일정', 'Schedule'), hourly ? { mode: 'interval', minutes: 60 } : weekly ? { mode: 'weekly', time: '09:00' } : { mode: 'daily', time: '09:00' });
  } else if (has(t, 'chat', '채팅', '챗봇', 'bot', '봇', '상담', '대화', '질문에 답', 'assistant', '비서')) trigger = add('trigger.chat', T('채팅 메시지', 'Chat message'));
  else trigger = add('trigger.manual', T('수동 실행', 'Manual trigger'));
  let last = trigger;
  const step = (type, name, config) => { const id = add(type, name, config); link(last, id); last = id; return id; };

  if (has(t, 'url', '웹 페이지', '웹페이지', 'website', 'web page', 'article', '기사', '사이트')) step('tool.web', T('웹 페이지 읽기', 'Read web page'));
  if (has(t, 'api', 'http', 'rest', '호출')) step('tool.http', T('HTTP 요청', 'HTTP request'));
  if (has(t, 'git', 'commit', '커밋', 'shell', '명령', 'command', 'script', '스크립트')) step('tool.shell', T('명령 실행', 'Run command'));
  if (has(t, '문서', 'document', 'docs', 'knowledge', '지식', 'rag', '매뉴얼', 'manual', 'faq', '정책', 'policy')) step('kb.search', T('지식 검색', 'Knowledge search'));
  if (has(t, '추출', 'extract', '청구서', 'invoice', '영수증', 'receipt', '항목')) step('ai.extract', T('정보 추출', 'Extract'));

  let branch = null;
  if (has(t, '분류', 'classif', 'triage', 'categor', '나누', 'route')) {
    branch = step('ai.classify', T('분류', 'Classify'));
  }
  const tools = [];
  if (has(t, '계산', 'calculat', 'math')) tools.push('calculator');
  if (has(t, '날짜', '시간', 'date', 'time')) tools.push('datetime');
  const wantsAgent = has(t, 'agent', '에이전트', '도구', 'tool', '스스로', '알아서', 'research', '조사') || tools.length > 0 || has(t, 'bot', '봇', '챗봇', '상담', 'assistant', '비서');
  const purpose = has(t, '요약', 'summar') ? T('요약하세요.', 'Summarise.') : has(t, '번역', 'translat') ? T('번역하세요. 번역문만 답하세요.', 'Translate. Reply with the translation only.') : has(t, '리뷰', 'review') ? T('리뷰하세요.', 'Review it.') : has(t, '답장', 'reply', 'email', '메일') ? T('정중한 답장을 쓰세요.', 'Write a polite reply.') : '';
  const system = `${T('사용자의 목적', 'The user wants')}: ${description}\n${purpose}`.trim();
  const ai = wantsAgent
    ? add('ai.agent', T('AI 에이전트', 'AI agent'), { system, tools: tools.length ? tools : ['datetime'], memory: nodeDef(nodes[0].type).trigger === 'chat' })
    : add('ai.llm', T('AI 처리', 'AI step'), { system, prompt: '{{ trigger.message || trigger.text || trigger.body || input.text || input }}' });
  if (branch) for (const p of ['question', 'complaint', 'order', 'other']) link(branch, ai, p); else link(last, ai);
  last = ai;
  if (has(t, '승인', 'approv', '검토', 'review before', '확인 후')) {
    const ap = add('human.approval', T('승인', 'Approval'), { message: '{{ input.text }}' });
    link(last, ap);
    const out = add('out.respond', T('응답', 'Respond'), { value: '{{ input.input.text }}' });
    link(ap, out, 'approved');
    const no = add('out.respond', T('반려', 'Rejected'), { value: 'rejected' });
    link(ap, no, 'rejected');
  } else {
    if (has(t, '파일', 'file', '저장', 'save')) step('tool.file', T('파일 저장', 'Save file'), { op: 'append', path: 'notes/output.md', content: '{{ input.text }}' });
    if (has(t, '알림', 'notify', 'alert', '알려')) step('human.notify', T('알림', 'Notify'), { message: '{{ input.text }}' });
    const out = add('out.respond', T('응답', 'Respond'), { value: '{{ input.text || input }}' });
    link(last, out);
  }
  const name = String(description).split(/[.\n!?]/)[0].slice(0, 40) || T('새 에이전트', 'New agent');
  return { name, description, nodes: autoLayout(nodes, edges, { aspect: SCREEN_ASPECT }), edges };
}

const CATALOG = () => NODE_TYPES.filter((d) => !d.note).map((d) => {
  const ports = typeof d.outputs === 'function' ? '(ports = its categories/cases + other/default)' : `ports: ${d.outputs.join(', ') || 'none'}`;
  const fields = d.fields.map((f) => `${f.key}:${f.type}`).join(', ');
  return `- ${d.type}: ${d.desc.en}. ${ports}${d.toolPort ? '; also "tools" port: connected nodes become tools' : ''}. Settings: ${fields}`;
}).join('\n');

/** Builds a draft agent from a description. `chat` = the engine's model call (null = keywords only). */
export async function buildFromDescription(description, { lang = 'ko', chat = null, model = '' } = {}) {
  const fallback = () => normalizeAgent(planFromKeywords(description, lang));
  const ref = parseModelRef(model);
  if (!chat || !ref || ref.provider === 'mock') return { agent: fallback(), via: 'keywords' };
  const system = `You design workflows for a visual AI agent builder. Answer with one JSON object only:
{"name": "...", "description": "...", "nodes": [{"id": "n1", "type": "<type>", "name": "<short ${lang === 'ko' ? 'Korean' : 'English'} label>", "config": {...}}], "edges": [{"from": "n1", "fromPort": "out", "to": "n2"}]}
Rules: start with exactly one trigger node; every node reachable; use {{ }} expressions: trigger.<field>, input (previous output; LLM/agent output is {text}), nodes.<node name>.output, vars.<name>, item (in loops). Keep it small (3–9 nodes). End branches with out.respond where a reply is needed. Leave "model" empty.
Node types:
${CATALOG()}`;
  try {
    const res = await chat({ model, system, messages: [{ role: 'user', content: description }], json: true, maxTokens: 8000, purpose: 'build' });
    const data = parseJsonAnswer(res.text);
    if (!data || !Array.isArray(data.nodes) || !data.nodes.length) return { agent: fallback(), via: 'keywords', note: 'The model did not answer with a workflow' };
    data.nodes = data.nodes.filter((n) => nodeDef(n.type));
    data.edges = (data.edges ?? []).map((e, i) => ({ id: `e${i + 1}`, from: e.from, fromPort: e.fromPort ?? 'out', to: e.to, toPort: 'in' }));
    const doc = normalizeAgent({ ...data, nodes: data.nodes.map((n) => ({ ...n, config: { ...defaultConfig(n.type), ...(n.config ?? {}), model: '' } })) });
    doc.nodes = autoLayout(doc.nodes, doc.edges, { aspect: SCREEN_ASPECT });
    if (!doc.nodes.some((n) => nodeDef(n.type)?.trigger)) return { agent: fallback(), via: 'keywords', note: 'The draft had no trigger' };
    return { agent: doc, via: 'model', usage: res.usage };
  } catch (err) {
    return { agent: fallback(), via: 'keywords', note: err.message };
  }
}
