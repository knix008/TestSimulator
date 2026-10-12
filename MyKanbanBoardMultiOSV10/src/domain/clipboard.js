// Cards on the system clipboard. Copied cards are written as JSON with a
// marker (so they paste back with every field) followed by nothing else; any
// other text pastes as one card per line.

export const CLIP_FORMAT = 'mykanbanboard/cards';

export function cardsToClipboard(cards) {
  return JSON.stringify({ format: CLIP_FORMAT, cards: cards.map(({ id, ...card }) => card) }, null, 1);
}

/** Human-readable form of the cards (kept for reference in tests and exports). */
export const cardsToText = (cards) => cards.map((card) => `- ${card.title}${card.description ? `\n  ${card.description.replace(/\n/g, '\n  ')}` : ''}`).join('\n');

/** Card data from clipboard text: our own JSON, or one card per non-empty line. */
export function cardsFromClipboard(text) {
  const source = String(text ?? '').trim();
  if (!source) return [];
  if (source.startsWith('{')) {
    try {
      const data = JSON.parse(source);
      if (data?.format === CLIP_FORMAT && Array.isArray(data.cards)) return data.cards.filter((card) => card && typeof card === 'object');
    } catch { /* not ours: treat as text */ }
  }
  return source
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)]|\[[ xX]\])\s+/, '').trim())
    .filter(Boolean)
    .slice(0, 500)
    .map((title) => ({ title: title.slice(0, 500) }));
}
