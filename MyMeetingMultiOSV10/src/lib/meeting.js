// Meeting-minutes data model + serialization.
//
// The editor keeps a single structured `meeting` object. Everything else
// (preview, and the Markdown / HTML / PDF / Word exporters) works off a Markdown
// rendering of that object, so the whole export engine (markdown.js / export.js)
// is reused unchanged. A plain-text (.txt) rendering is provided separately.

// A fresh, empty meeting record.
export function createEmptyMeeting() {
  return {
    title: '',
    date: '',        // free text, e.g. 2026-09-04
    startTime: '',   // free text, e.g. 14:00
    endTime: '',     // free text, e.g. 15:30
    location: '',
    organizer: '',   // chair / host
    recorder: '',    // note-taker
    attendees: '',   // one attendee per line
    agenda: '',      // one agenda item per line
    body: '',        // free Markdown notes / discussion
    decisions: '',   // one decision per line
    actionItems: '', // one action item per line ("owner — task (due)")
  };
}

// A short worked example used by "New from sample".
export function createSampleMeeting(lang = 'en') {
  if (lang === 'ko') {
    return {
      title: '2026년 3분기 제품 기획 회의',
      date: '2026-09-04',
      startTime: '14:00',
      endTime: '15:30',
      location: '본사 3층 회의실 A',
      organizer: '김수호',
      recorder: '이영희',
      attendees: '김수호 (기획)\n이영희 (개발)\n박민준 (디자인)\n최지우 (QA)',
      agenda: '3분기 로드맵 검토\n신규 기능 우선순위 결정\n출시 일정 확정',
      body: '## 3분기 로드맵 검토\n\n- 지난 분기 실적을 공유하고 목표 대비 달성률을 확인함.\n- 사용자 피드백 상위 5건을 정리하여 반영 방안을 논의함.\n\n## 신규 기능 우선순위\n\n1. 다국어 지원 강화\n2. 다크 테마 개선\n3. 오프라인 모드',
      decisions: '다국어 지원을 최우선 과제로 확정함.\n출시일은 11월 15일로 결정함.',
      actionItems: '이영희 — 다국어 리소스 구조 설계 (9/11까지)\n박민준 — 다크 테마 시안 3종 준비 (9/9까지)\n최지우 — 회귀 테스트 계획 수립 (9/12까지)',
    };
  }
  return {
    title: 'Q3 2026 Product Planning Meeting',
    date: '2026-09-04',
    startTime: '14:00',
    endTime: '15:30',
    location: 'HQ 3F — Meeting Room A',
    organizer: 'Suho Kim',
    recorder: 'Younghee Lee',
    attendees: 'Suho Kim (Planning)\nYounghee Lee (Dev)\nMinjun Park (Design)\nJiwoo Choi (QA)',
    agenda: 'Review Q3 roadmap\nDecide new feature priorities\nConfirm release schedule',
    body: '## Roadmap Review\n\n- Shared last quarter results and checked progress against goals.\n- Went through the top 5 user feedback items and how to address them.\n\n## New Feature Priorities\n\n1. Stronger multi-language support\n2. Dark theme improvements\n3. Offline mode',
    decisions: 'Multi-language support confirmed as the top priority.\nRelease date set to November 15.',
    actionItems: 'Younghee Lee — Design the i18n resource structure (by 9/11)\nMinjun Park — Prepare 3 dark-theme mockups (by 9/9)\nJiwoo Choi — Draft the regression test plan (by 9/12)',
  };
}

// Split a multiline field into trimmed, non-empty lines.
export function lines(text) {
  return String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

// True when the meeting has no content worth exporting.
export function isMeetingEmpty(m) {
  if (!m) return true;
  return !['title', 'date', 'startTime', 'endTime', 'location', 'organizer',
    'recorder', 'attendees', 'agenda', 'body', 'decisions', 'actionItems']
    .some((k) => String(m[k] || '').trim().length > 0);
}

// Escapes a value for use inside a Markdown table cell (pipes + newlines).
function tableCell(text) {
  return String(text || '').replace(/\|/g, '\\|').replace(/\n+/g, ' / ');
}

// Strip a leading numbering token ("1 ", "1.2 ", "1) ", "(1) " …) from text.
function stripNumberPrefix(text) {
  let t = String(text || '').replace(/^\s+/, '');
  let prev;
  do {
    prev = t.length;
    t = t.replace(/^(?:\(\s*\d+(?:\.\d+)*\s*\)|\d+(?:\.\d+)*[.)\],;:]+|\d+(?:\.\d+)*\.?)\s+/, '').replace(/^\s+/, '');
  } while (t.length < prev && t.length > 0);
  return t;
}

// Demote every heading in a Markdown body so its shallowest heading sits at
// `minLevel` (default 3), keeping relative depth. Lets user-written body
// headings nest UNDER the generated H2 sections. Fenced code blocks are skipped.
function demoteHeadings(md, minLevel = 3) {
  const rows = String(md || '').split('\n');
  let shallowest = 7;
  let fence = '';
  for (const line of rows) {
    const f = line.match(/^\s*(```+|~~~+)/);
    if (f) { const c = f[1][0]; fence = fence === c ? '' : (fence || c); continue; }
    if (fence) continue;
    const m = line.match(/^(#{1,6})\s+\S/);
    if (m) shallowest = Math.min(shallowest, m[1].length);
  }
  if (shallowest === 7) return md; // no headings
  const shift = Math.max(0, minLevel - shallowest);
  if (!shift) return md;
  fence = '';
  return rows.map((line) => {
    const f = line.match(/^\s*(```+|~~~+)/);
    if (f) { const c = f[1][0]; fence = fence === c ? '' : (fence || c); return line; }
    if (fence) return line;
    return line.replace(/^(#{1,6})(\s+)/, (whole, hashes, sp) =>
      '#'.repeat(Math.min(6, hashes.length + shift)) + sp);
  }).join('\n');
}

// Apply hierarchical section numbers (1, 1.1, 2 …) to every heading EXCEPT the
// H1 title (and any level-1 heading), which stays unnumbered. Level 2 becomes
// the top numbering level. Fenced code blocks are skipped.
export function numberSections(md) {
  const rows = String(md || '').split('\n');
  const counters = [0, 0, 0, 0, 0]; // levels 2..6
  let fence = '';
  return rows.map((line) => {
    const f = line.match(/^\s*(```+|~~~+)/);
    if (f) { const c = f[1][0]; fence = fence === c ? '' : (fence || c); return line; }
    if (fence) return line;
    const m = line.match(/^(#{1,6})\s+(.*?)\s*$/);
    if (!m) return line;
    const level = m[1].length;
    const title = stripNumberPrefix(m[2].replace(/\r$/, ''));
    if (level === 1) return title ? `${m[1]} ${title}` : m[1];
    const idx = level - 2;
    counters[idx]++;
    for (let i = idx + 1; i < counters.length; i++) counters[i] = 0;
    let start = 0;
    while (start < idx && counters[start] === 0) start++;
    const prefix = counters.slice(start, idx + 1).join('.');
    return title ? `${m[1]} ${prefix} ${title}` : `${m[1]} ${prefix}`;
  }).join('\n');
}

function timeRange(m) {
  const a = (m.startTime || '').trim();
  const b = (m.endTime || '').trim();
  if (a && b) return `${a} – ${b}`;
  return a || b || '';
}

// Default export base name derived from the title (or a fallback label).
export function meetingBaseName(m, fallback = 'meeting') {
  const t = String(m?.title || '').trim();
  return t || fallback;
}

// ── Markdown rendering ────────────────────────────────────
// `labels` supplies localized section/field titles so the same serializer works
// for both languages. See i18n key `doc.*`.
export function meetingToMarkdown(m, labels = {}, options = {}) {
  const { number = true } = options;
  const L = {
    date: 'Date', time: 'Time', location: 'Location', organizer: 'Organizer',
    recorder: 'Recorder', attendees: 'Attendees', agenda: 'Agenda',
    notes: 'Discussion', decisions: 'Decisions', actions: 'Action Items',
    field: 'Field', value: 'Value', untitled: 'Untitled Meeting', ...labels,
  };
  const out = [];
  out.push(`# ${(m.title || '').trim() || L.untitled}`);

  // Meeting info table (only rows that have a value).
  const rows = [];
  const addRow = (label, value) => {
    const v = tableCell(value);
    if (v) rows.push(`| ${tableCell(label)} | ${v} |`);
  };
  addRow(L.date, m.date);
  addRow(L.time, timeRange(m));
  addRow(L.location, m.location);
  addRow(L.organizer, m.organizer);
  addRow(L.recorder, m.recorder);
  addRow(L.attendees, lines(m.attendees).join(', '));
  if (rows.length) {
    out.push('', `| ${L.field} | ${L.value} |`, '| --- | --- |', ...rows);
  }

  const agenda = lines(m.agenda);
  if (agenda.length) {
    out.push('', `## ${L.agenda}`, '', ...agenda.map((a, i) => `${i + 1}. ${a}`));
  }

  const body = String(m.body || '').trim();
  if (body) {
    // Demote body headings so they nest under the numbered "Discussion" section
    // (e.g. section 2 → 2.1, 2.2 …) instead of competing as top-level sections.
    out.push('', `## ${L.notes}`, '', demoteHeadings(body, 3));
  }

  const decisions = lines(m.decisions);
  if (decisions.length) {
    out.push('', `## ${L.decisions}`, '', ...decisions.map((d) => `- ${d}`));
  }

  const actions = lines(m.actionItems);
  if (actions.length) {
    out.push('', `## ${L.actions}`, '', ...actions.map((a) => `- [ ] ${a}`));
  }

  // Number every section heading (H2+) unless disabled; the title (H1) and info
  // table always stay unnumbered.
  const doc = out.join('\n');
  return (number ? numberSections(doc) : doc) + '\n';
}

// ── Structure view ────────────────────────────────────────
// The Structure tab shows the WHOLE document, not just the notes headings: the
// meeting-info fields and the one-per-line lists typed in the details panel are
// part of the exported document too, so they belong in the tree.
//
// `outline` is getOutline(meetingToMarkdown(...)) — heading nodes keep their
// `index`, so selecting one still resolves to the right place in the editor.
// Everything else is a leaf that points back at the field that produced it.
export function buildStructure(m, labels = {}, outline = []) {
  const L = {
    info: 'Meeting info', date: 'Date', time: 'Time', location: 'Location',
    organizer: 'Organizer', recorder: 'Recorder', attendees: 'Attendees',
    agenda: 'Agenda', decisions: 'Decisions', actions: 'Action Items', ...labels,
  };
  const strip = (v) => String(v || '').replace(/^\s*\d+(?:\.\d+)*\s+/, '').trim();
  const out = [];

  // One leaf per line of a "one entry per line" field.
  const listLeaves = (field, level) => lines(m[field]).map((text, i) => ({
    key: `${field}-${i}`, level, text, kind: 'item', field, lineIndex: i,
  }));

  outline.forEach((h) => {
    out.push({ key: `h-${h.index}`, level: h.level, text: h.text, kind: 'heading', index: h.index, line: h.line });
    const label = strip(h.text);

    // The info table has no heading of its own in the document, so hang the
    // fields off the title.
    if (h.level === 1) {
      const rows = [];
      const add = (name, value, field) => {
        const v = String(value || '').trim();
        if (v) rows.push({ key: `f-${field}`, level: h.level + 2, text: `${name} — ${v}`, kind: 'field', field });
      };
      add(L.date, m.date, 'date');
      const range = timeRange(m);
      if (range) rows.push({ key: 'f-time', level: h.level + 2, text: `${L.time} — ${range}`, kind: 'field', field: 'startTime' });
      add(L.location, m.location, 'location');
      add(L.organizer, m.organizer, 'organizer');
      add(L.recorder, m.recorder, 'recorder');
      const attendees = lines(m.attendees);
      if (rows.length || attendees.length) {
        out.push({ key: 'info', level: h.level + 1, text: L.info, kind: 'group', field: 'date' });
        rows.forEach((r) => out.push(r));
        if (attendees.length) {
          out.push({
            key: 'attendees', level: h.level + 2, kind: 'group', field: 'attendees',
            text: `${L.attendees} (${attendees.length})`,
          });
          attendees.forEach((text, i) => out.push({
            key: `attendees-${i}`, level: h.level + 3, text, kind: 'item', field: 'attendees', lineIndex: i,
          }));
        }
      }
    }

    if (label === strip(L.agenda)) listLeaves('agenda', h.level + 1).forEach((n) => out.push(n));
    else if (label === strip(L.decisions)) listLeaves('decisions', h.level + 1).forEach((n) => out.push(n));
    else if (label === strip(L.actions)) listLeaves('actionItems', h.level + 1).forEach((n) => out.push(n));
  });

  return out;
}

// ── Plain-text (.txt) rendering ───────────────────────────
export function meetingToPlainText(m, labels = {}, options = {}) {
  const { number = true } = options;
  const L = {
    date: 'Date', time: 'Time', location: 'Location', organizer: 'Organizer',
    recorder: 'Recorder', attendees: 'Attendees', agenda: 'Agenda',
    notes: 'Discussion', decisions: 'Decisions', actions: 'Action Items',
    untitled: 'Untitled Meeting', ...labels,
  };
  const out = [];
  const title = (m.title || '').trim() || L.untitled;
  out.push(title);
  out.push('='.repeat(Math.max(title.length, 8)));
  out.push('');

  const info = [
    [L.date, m.date], [L.time, timeRange(m)], [L.location, m.location],
    [L.organizer, m.organizer], [L.recorder, m.recorder],
    [L.attendees, lines(m.attendees).join(', ')],
  ].filter(([, v]) => String(v || '').trim());
  for (const [k, v] of info) out.push(`${k}: ${v}`);

  const section = (heading, body) => {
    if (!body || !body.length) return;
    out.push('', `## ${heading}`, '');
    out.push(...(Array.isArray(body) ? body : [body]));
  };

  const agenda = lines(m.agenda);
  section(L.agenda, agenda.map((a, i) => `${i + 1}. ${a}`));

  // Strip Markdown markers from the body for a cleaner plain-text look.
  const body = String(m.body || '').trim();
  if (body) {
    const plainBody = body
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/(^|\s)[*_](.+?)[*_](\s|$)/g, '$1$2$3');
    section(L.notes, plainBody);
  }

  section(L.decisions, lines(m.decisions).map((d) => `- ${d}`));
  section(L.actions, lines(m.actionItems).map((a) => `[ ] ${a}`));

  // Number the section headings (## …) to match the other export formats.
  const doc = out.join('\n');
  return (number ? numberSections(doc) : doc) + '\n';
}
