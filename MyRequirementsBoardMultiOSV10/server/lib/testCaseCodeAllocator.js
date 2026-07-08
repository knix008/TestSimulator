const TC_CODE_PATTERN = /^TC-(\d+)$/i;

export function formatTcCode(sequence) {
  return `TC-${String(sequence).padStart(4, '0')}`;
}

export function registerTcCode(code, usedCodes, nextSequenceRef) {
  if (!code) return;
  const normalized = String(code).trim();
  if (!normalized) return;
  usedCodes.add(normalized);
  const match = TC_CODE_PATTERN.exec(normalized);
  if (match) {
    const number = Number(match[1]);
    if (!Number.isNaN(number)) {
      nextSequenceRef.current = Math.max(nextSequenceRef.current, number + 1);
    }
  }
}

export function allocateNextTcCode(usedCodes, nextSequenceRef) {
  while (true) {
    const code = formatTcCode(nextSequenceRef.current);
    nextSequenceRef.current += 1;
    if (!usedCodes.has(code)) {
      usedCodes.add(code);
      return code;
    }
  }
}

export function tryRegisterTcCode(code, usedCodes, nextSequenceRef) {
  const normalized = String(code || '').trim();
  if (!normalized || usedCodes.has(normalized)) return null;
  usedCodes.add(normalized);
  const match = TC_CODE_PATTERN.exec(normalized);
  if (match) {
    const number = Number(match[1]);
    if (!Number.isNaN(number)) {
      nextSequenceRef.current = Math.max(nextSequenceRef.current, number + 1);
    }
  }
  return normalized;
}
