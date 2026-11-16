// API errors as text for the user, translated by code (ARCHITECTURE.md §5: codes are stable UPPER_SNAKE).
// Lookup order: 'error.code.<code lower>' › families (CONDITION_* / VALIDATOR_*) › the core's message.

/** The user-facing text of an ApiError (or any error). */
export function errorMessage(error, t) {
  const code = String(error?.code ?? '');
  if (code) {
    const key = `error.code.${code.toLowerCase()}`;
    const text = t(key);
    if (text !== key) return text;
    if (/^CONDITION_/.test(code)) return withDetail(t('shared.err.condition'), error);
    if (/^VALIDATOR_/.test(code)) return withDetail(t('shared.err.validator'), error);
  }
  return String(error?.message ?? error ?? '');
}

const withDetail = (text, error) => (error?.message ? `${text}: ${error.message}` : text);

/** True for an optimistic-lock conflict (HTTP 409, code CONFLICT). */
export const isConflict = (error) => error?.status === 409 || String(error?.code ?? '').toUpperCase() === 'CONFLICT';
