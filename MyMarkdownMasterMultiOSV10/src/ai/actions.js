// AI actions on notes (pure). Each action builds the user message from the note / selection; `apply`
// says what the app does with the answer:
//   replace      — replaces the selection          insertBelow — goes below the selection / at the cursor
//   append       — goes at the end of the note     chat        — stays in the chat panel
//   properties   — a list written to the note's `tags` property (parseTags)

const MAX_NOTE = 60000;
const MAX_LINKED = 8000;
const MAX_EXCERPT = 1200;

/** Text cut to `max` characters with a visible marker (never cut silently). */
export function clip(text, max) {
  const value = String(text ?? '');
  return value.length > max ? `${value.slice(0, max)}\n[… ${value.length - max} more characters not included]` : value;
}

const replyIn = (language) => (language === 'en' ? 'Answer in English.' : language === 'ko' ? 'Answer in Korean (한국어).' : 'Answer in the language of the text.');
const sameLanguage = 'Keep the language of the original text.';
const onlyResult = 'Return only the resulting Markdown, with no preface, explanation or code fence.';
const noteBlock = ({ title, note }) => `Note "${title || 'Untitled'}":\n<note>\n${clip(note, MAX_NOTE)}\n</note>`;
const selBlock = ({ selection }) => `<text>\n${clip(selection, MAX_NOTE)}\n</text>`;
/** The selection when there is one, else the note. */
const target = (ctx) => (String(ctx.selection ?? '').trim() ? selBlock(ctx) : noteBlock(ctx));

export const AI_ACTIONS = [
  { id: 'summarizeNote', icon: 'aiSummary', labelKey: 'ai.action.summarizeNote', apply: 'chat',
    prompt: (c) => `Summarize this note in a few bullet points, then one sentence with the main point. ${replyIn(c.language)}\n\n${noteBlock(c)}` },
  { id: 'summarizeSelection', icon: 'aiSummary', labelKey: 'ai.action.summarizeSelection', needsSelection: true, apply: 'insertBelow',
    prompt: (c) => `Summarize this text in 2–4 sentences. ${sameLanguage} ${onlyResult}\n\n${selBlock(c)}` },
  { id: 'continue', icon: 'aiContinue', labelKey: 'ai.action.continue', apply: 'insertBelow',
    prompt: (c) => `Continue writing from where this text ends, in the same style, tone and language (one or two paragraphs). Do not repeat the existing text. ${onlyResult}\n\n${target(c)}` },
  { id: 'improve', icon: 'aiWand', labelKey: 'ai.action.improve', needsSelection: true, apply: 'replace',
    prompt: (c) => `Improve the writing of this text: clearer, better flow, same meaning. Keep the Markdown formatting and links. ${sameLanguage} ${onlyResult}\n\n${selBlock(c)}` },
  { id: 'fixGrammar', icon: 'aiCheck', labelKey: 'ai.action.fixGrammar', needsSelection: true, apply: 'replace',
    prompt: (c) => `Fix spelling, grammar and punctuation in this text. Change nothing else; keep the Markdown, links and line breaks. ${sameLanguage} ${onlyResult}\n\n${selBlock(c)}` },
  { id: 'shorter', icon: 'aiShorter', labelKey: 'ai.action.shorter', needsSelection: true, apply: 'replace',
    prompt: (c) => `Make this text about half as long, keeping the key points. ${sameLanguage} ${onlyResult}\n\n${selBlock(c)}` },
  { id: 'longer', icon: 'aiLonger', labelKey: 'ai.action.longer', needsSelection: true, apply: 'replace',
    prompt: (c) => `Expand this text with more detail and examples (about twice as long), same tone. ${sameLanguage} ${onlyResult}\n\n${selBlock(c)}` },
  { id: 'toneProfessional', icon: 'aiTone', labelKey: 'ai.action.toneProfessional', needsSelection: true, apply: 'replace',
    prompt: (c) => `Rewrite this text in a professional, polite tone. ${sameLanguage} ${onlyResult}\n\n${selBlock(c)}` },
  { id: 'toneCasual', icon: 'aiTone', labelKey: 'ai.action.toneCasual', needsSelection: true, apply: 'replace',
    prompt: (c) => `Rewrite this text in a friendly, casual tone. ${sameLanguage} ${onlyResult}\n\n${selBlock(c)}` },
  { id: 'translateKo', icon: 'aiTranslate', labelKey: 'ai.action.translateKo', needsSelection: true, apply: 'replace',
    prompt: (c) => `Translate this text into natural Korean (한국어). Keep the Markdown formatting, code and links. ${onlyResult}\n\n${selBlock(c)}` },
  { id: 'translateEn', icon: 'aiTranslate', labelKey: 'ai.action.translateEn', needsSelection: true, apply: 'replace',
    prompt: (c) => `Translate this text into natural English. Keep the Markdown formatting, code and links. ${onlyResult}\n\n${selBlock(c)}` },
  { id: 'explain', icon: 'aiExplain', labelKey: 'ai.action.explain', needsSelection: true, apply: 'chat',
    prompt: (c) => `Explain this text simply: what it means, key terms, and any background needed. ${replyIn(c.language)}\n\n${selBlock(c)}${c.note ? `\n\nIt comes from this note (for context):\n${noteBlock(c)}` : ''}` },
  { id: 'tags', icon: 'aiTag', labelKey: 'ai.action.tags', apply: 'properties',
    prompt: (c) => `Suggest 3 to 7 tags for this note. Tags are short, lowercase, use hyphens instead of spaces, no "#". ${sameLanguage} Return only the tags, one per line.\n\n${noteBlock(c)}` },
  { id: 'title', icon: 'aiTitle', labelKey: 'ai.action.title', apply: 'chat',
    prompt: (c) => `Suggest 5 short, specific titles for this note, as a numbered list. ${sameLanguage}\n\n${noteBlock(c)}` },
  { id: 'outline', icon: 'aiOutline', labelKey: 'ai.action.outline', apply: 'insertBelow',
    prompt: (c) => `Make a Markdown outline (nested bullet list of headings and key points) of this text. ${sameLanguage} ${onlyResult}\n\n${target(c)}` },
  { id: 'table', icon: 'aiTable', labelKey: 'ai.action.table', needsSelection: true, apply: 'replace',
    prompt: (c) => `Turn this text into a Markdown table with sensible columns. ${sameLanguage} ${onlyResult}\n\n${selBlock(c)}` },
  { id: 'brainstorm', icon: 'aiBulb', labelKey: 'ai.action.brainstorm', apply: 'chat',
    prompt: (c) => `Brainstorm 10 varied ideas related to ${String(c.selection ?? '').trim() ? 'this text' : 'this note'}, as a bullet list with one line each. ${replyIn(c.language)}\n\n${target(c)}` },
  { id: 'actionItems', icon: 'aiTasks', labelKey: 'ai.action.actionItems', apply: 'append',
    prompt: (c) => `Extract the action items from this text as a Markdown task list ("- [ ] …"), with the owner and due date when they are mentioned. If there are none, return "- [ ] (no action items found)". ${sameLanguage} ${onlyResult}\n\n${target(c)}` },
  { id: 'reflection', icon: 'aiJournal', labelKey: 'ai.action.reflection', apply: 'append',
    prompt: (c) => `This is my daily note. Write a short reflection section for it: a "## ${c.language === 'en' ? 'Reflection' : '회고'}" heading, then what went well, what to improve, and one focus for tomorrow, as bullets, based only on the note. ${replyIn(c.language)} ${onlyResult}\n\n${noteBlock(c)}` },
  { id: 'askVault', icon: 'aiChat', labelKey: 'ai.action.askVault', apply: 'chat', vault: true,
    prompt: (c) => String(c.question ?? c.selection ?? '').trim() || 'What are the main topics in my notes?' },
];

export const aiActionById = (id) => AI_ACTIONS.find((a) => a.id === id) ?? null;

/** The answer without a fence the model put around the whole of it (```markdown … ```). */
export function stripFence(text) {
  const value = String(text ?? '').trim();
  const match = value.match(/^```[\w-]*\n([\s\S]*?)\n```$/);
  return match ? match[1] : value;
}

/** Tags from an answer: one per line, or comma separated; "#", bullets and numbering removed. */
export function parseTags(text) {
  const tags = stripFence(text)
    .split(/[\n,]+/)
    .map((line) => line.replace(/^\s*(?:[-*+]|\d+[.)])\s*/, '').replace(/^#/, '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[`"'[\]]/g, ''))
    .filter((tag) => tag && tag.length <= 60 && !/^tags?:?$/.test(tag));
  return [...new Set(tags)].slice(0, 12);
}

/**
 * What the app should do with an answer:
 *   { kind: 'replace' | 'insertBelow' | 'append' | 'chat', text } or { kind: 'properties', tags, text }.
 * `ctx.existingTags` (array) are kept for 'properties'.
 */
export function applyResult(action, result, ctx = {}) {
  const kind = action?.apply ?? 'chat';
  if (kind === 'properties') {
    const tags = [...new Set([...(ctx.existingTags ?? []), ...parseTags(result)])];
    return { kind, tags, text: tags.map((tag) => `#${tag}`).join(' ') };
  }
  if (kind === 'chat') return { kind, text: String(result ?? '') };
  let text = stripFence(result);
  if (kind === 'append' || kind === 'insertBelow') text = `\n\n${text}\n`;
  return { kind, text };
}

/** The context block put in front of a question (only the parts that are on and present). */
export function buildContextBlock({ note = null, selection = '', linked = [], search = [] } = {}) {
  const parts = [];
  if (note?.text != null) parts.push(`Current note "${note.title || note.path || 'Untitled'}"${note.path ? ` (${note.path})` : ''}:\n<note>\n${clip(note.text, MAX_NOTE)}\n</note>`);
  if (String(selection ?? '').trim()) parts.push(`Selected text:\n<selection>\n${clip(selection, MAX_NOTE)}\n</selection>`);
  for (const item of linked ?? []) parts.push(`Linked note "${item.title || item.path}" (${item.path}):\n<note>\n${clip(item.text, MAX_LINKED)}\n</note>`);
  if (search?.length) {
    parts.push(`Notes from the vault that match the question:\n${search.map((item) => `<note path="${item.path}" title="${item.title || ''}">\n${clip(item.excerpt, MAX_EXCERPT)}\n</note>`).join('\n')}`);
  }
  return parts.length ? `Context from my notes (use it when relevant; refer to notes as [[title]]):\n\n${parts.join('\n\n')}` : '';
}
