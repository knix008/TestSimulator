// The offline test model ("mock"): no network, no key, the same answers every time. It lets templates run
// out of the box, tests check whole runs, and the canvas show a run in motion. It is not clever: it calls a
// tool when the request plainly asks for one, classifies by the words it finds, and otherwise echoes.
import { AppError } from '../errors.js';

const sleep = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) { reject(new AppError('CANCELLED', 'Cancelled', 499)); return; }
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener?.('abort', () => { clearTimeout(timer); reject(new AppError('CANCELLED', 'Cancelled', 499)); }, { once: true });
});

const words = (s) => String(s ?? '').toLowerCase();
const ARITH = /(-?\d+(?:\.\d+)?\s*[-+*/×÷^%]\s*)+-?\d+(?:\.\d+)?/;
const URL_RE = /https?:\/\/[^\s"'<>)]+/i;
const SYNONYMS = {
  question: ['?', '궁금', '문의', '질문', 'how', 'what', 'why', '어떻게', '무엇'],
  complaint: ['불만', '환불', '고장', '화가', '최악', 'broken', 'refund', 'angry', 'bad', '느려', '안 돼', '안돼'],
  order: ['주문', '구매', '배송', 'order', 'buy', 'purchase', 'ship'],
  positive: ['좋', '감사', '최고', 'great', 'thanks', 'love', 'good'],
  negative: ['나쁘', '싫', '최악', 'bad', 'hate', 'awful'],
  urgent: ['급', '즉시', '긴급', 'urgent', 'asap', 'now'],
  bug: ['오류', '버그', '에러', 'error', 'bug', 'crash', 'exception'],
  feature: ['기능', '추가', '요청', 'feature', 'request', 'add'],
  critical: ['장애', '중단', 'down', 'outage', '5xx', 'error rate', '오류율'],
  warning: ['지연', '느림', 'slow', 'latency', '경고'],
  meal: ['점심', '저녁', '식대', '커피', 'lunch', 'dinner', 'coffee', 'meal'],
  travel: ['ktx', '택시', '항공', '출장', 'train', 'taxi', 'flight'],
  supplies: ['비품', '토너', '프린터', '용지', 'toner', 'printer', 'paper'],
  delivery: ['배송', '택배', 'delivery', 'shipping', 'parcel'],
  quality: ['고장', '불량', '파손', 'broken', 'defect'],
  refund: ['환불', 'refund'],
  annual: ['연차', '휴가', 'vacation', 'annual'],
  sick: ['병원', '아파', '진료', 'sick', 'doctor'],
  family: ['결혼', '장례', '돌잔치', 'wedding', 'funeral'],
  contract: ['계약', '갑', '을', 'contract', 'agreement'],
  invoice: ['invoice', '청구', 'amount due', '결제'],
  resume: ['이력서', '경력', 'resume', 'experience'],
  product: ['기능', '앱', '느려', 'app', 'feature', 'slow'],
  service: ['상담', '직원', '응대', 'support', 'staff'],
  pricing: ['가격', '요금', '비싸', 'price', 'expensive'],
  small: ['오타', '문구', 'typo', 'text'],
  large: ['구조 변경', '여러', '3종', 'architecture', 'migration'],
};

function lastUserIndex(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) if (messages[i].role === 'user') return i;
  return -1;
}

function pickTool(text, tools) {
  const t = words(text);
  const has = (name) => tools.find((x) => x.name === name);
  // a graph tool named in the request
  for (const tool of tools) {
    if (['calculator', 'datetime', 'http_get', 'web_page', 'knowledge_search', 'javascript'].includes(tool.name)) continue;
    const plain = tool.name.replace(/_/g, ' ').toLowerCase();
    if (t.includes(tool.name.toLowerCase()) || t.includes(plain)) return { name: tool.name, args: { input: text } };
  }
  const arith = ARITH.exec(text);
  if (arith && has('calculator')) return { name: 'calculator', args: { expression: arith[0].replace(/×/g, '*').replace(/÷/g, '/') } };
  const url = URL_RE.exec(text);
  if (url && has('web_page')) return { name: 'web_page', args: { url: url[0] } };
  if (url && has('http_get')) return { name: 'http_get', args: { url: url[0] } };
  if (/(지금|오늘|날짜|시간|몇 시|요일|time|date|today|now)/i.test(t) && has('datetime')) return { name: 'datetime', args: {} };
  if (has('knowledge_search') && t.trim()) return { name: 'knowledge_search', args: { query: text } };
  return null;
}

function summarize(text, max = 2) {
  const sentences = String(text).replace(/\s+/g, ' ').split(/(?<=[.!?。])\s+|(?<=다\.)\s*/).filter(Boolean);
  return sentences.slice(0, max).join(' ').slice(0, 400);
}

function classify(text, categories) {
  const t = words(text);
  let best = null;
  let score = 0;
  for (const c of categories) {
    const keys = [c.toLowerCase(), ...(SYNONYMS[c.toLowerCase()] ?? [])];
    const s = keys.reduce((n, k) => n + (k && t.includes(k) ? 1 : 0), 0);
    if (s > score) { score = s; best = c; }
  }
  return best ?? 'other';
}

function extract(text, fields) {
  const out = {};
  for (const f of fields) {
    const name = String(f.key ?? f).trim();
    const lower = name.toLowerCase();
    let value = '';
    const labelled = new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[:=]\\s*([^\\n,;]+)`, 'i').exec(text);
    if (labelled) value = labelled[1].trim();
    else if (/mail/.test(lower)) value = /[\w.+-]+@[\w-]+\.[\w.-]+/.exec(text)?.[0] ?? '';
    else if (/phone|tel|전화/.test(lower)) value = /\+?\d[\d -]{7,}\d/.exec(text)?.[0] ?? '';
    else if (/url|link|site/.test(lower)) value = URL_RE.exec(text)?.[0] ?? '';
    else if (/date|날짜/.test(lower)) value = /\d{4}-\d{2}-\d{2}/.exec(text)?.[0] ?? '';
    else if (/name|이름/.test(lower)) value = /(?:I am|I'm|my name is|저는|제 이름은)\s+([\p{L}]+(?:\s[\p{Lu}][\p{L}]+)?)/iu.exec(text)?.[1] ?? '';
    out[name] = value;
  }
  return out;
}

export async function mockChat(req) {
  await sleep(req.mockDelay ?? 300, req.signal);
  const messages = req.messages ?? [];
  const at = lastUserIndex(messages);
  const userText = at >= 0 ? String(messages[at].content ?? '') : '';
  const after = messages.slice(at + 1);
  const usage = { input: Math.ceil((String(req.system ?? '').length + messages.reduce((n, m) => n + String(m.content ?? '').length, 0)) / 4), output: 0 };
  const done = (text, extra = {}) => ({ text, toolCalls: [], usage: { ...usage, output: Math.ceil(text.length / 4) }, stop: 'end_turn', model: 'mock-1', ...extra });

  const images = at >= 0 ? messages[at].images ?? [] : [];
  if (images.length || req.purpose === 'vision') {
    const desc = images.map((img) => `${img.mime}${img.width ? ` ${img.width}×${img.height}` : ''}`).join(', ');
    return done(`[offline model] ${images.length} picture(s) received (${desc || 'none'}). Request: ${userText.slice(0, 120)}`);
  }
  if (req.purpose === 'rewrite') {
    return done(userText.replace(/\s+/g, ' ').trim());
  }
  if (req.purpose === 'keywords') {
    const stop = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'are', 'was', 'from', 'have', 'has', '그리고', '있는', '있습니다', '합니다', '하는', '대한', '에서', '으로']);
    const counts = new Map();
    for (const w of userText.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}-]{1,}/gu) ?? []) if (!stop.has(w)) counts.set(w, (counts.get(w) ?? 0) + 1);
    const keywords = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).slice(0, req.count ?? 5).map(([w]) => w);
    return done(JSON.stringify({ keywords }));
  }
  if (req.purpose === 'qa' || req.purpose === 'rag') {
    const source = String(req.purpose === 'qa' ? req.document ?? '' : req.context ?? '');
    const q = new Set((userText.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []));
    const sentences = source.split(/(?<=[.!?。다])\s+|\n+/).map((x) => x.trim()).filter(Boolean);
    const score = (x) => (x.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []).filter((w) => q.has(w)).length;
    const best = sentences.sort((a, b) => score(b) - score(a))[0] ?? '';
    return done(best && score(best) ? `[offline model] "${best}"` : '[offline model] The document does not say.');
  }
  if (req.purpose === 'classify') return done(JSON.stringify({ category: classify(userText, req.categories ?? []) }));
  if (req.purpose === 'extract') return done(JSON.stringify(extract(userText, req.fields ?? [])));

  const tools = req.tools ?? [];
  const results = after.filter((m) => m.role === 'tool');
  if (tools.length && !results.length) {
    const call = pickTool(userText, tools);
    if (call) return { text: '', toolCalls: [{ id: `mock_${Date.now().toString(36)}`, ...call }], usage, stop: 'tool_use', model: 'mock-1' };
  }
  if (results.length) {
    const lines = results.map((r) => `• ${r.name ?? 'tool'}: ${String(r.content ?? '').replace(/\s+/g, ' ').slice(0, 300)}`);
    return done(`[offline model] ${lines.join('\n')}`);
  }
  if (req.json) {
    let shape = null;
    try { shape = req.schema ? JSON.parse(req.schema) : null; } catch { shape = null; }
    if (shape && typeof shape === 'object' && !Array.isArray(shape)) {
      const data = extract(userText, Object.keys(shape).map((key) => ({ key })));
      for (const key of Object.keys(shape)) {
        if (Array.isArray(shape[key])) data[key] = [];
        if (/summary|요약|text|content/i.test(key) && !data[key]) data[key] = summarize(userText);
      }
      return done(JSON.stringify(data));
    }
    return done(JSON.stringify({ text: summarize(userText) }));
  }
  const sys = words(req.system);
  if (/(요약|summar)/.test(sys) || /(요약|summar)/i.test(userText.slice(0, 80))) return done(`[offline model] ${summarize(userText) || '(empty)'}`);
  if (/(번역|translat)/.test(sys)) return done(`[offline model · translation] ${userText.slice(0, 600)}`);
  return done(`[offline model] ${userText.replace(/\s+/g, ' ').slice(0, 600) || '…'}`);
}
