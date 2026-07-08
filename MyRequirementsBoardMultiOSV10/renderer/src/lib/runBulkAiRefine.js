export function scrollRefineRowIntoView(rowId) {
  requestAnimationFrame(() => {
    document.querySelector(`tr[data-refine-row-id="${rowId}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}

export function getRefineProgressMessage(t, progress) {
  if (!progress) return '';
  const { phase, current, total, code } = progress;
  switch (phase) {
    case 'generating':
      return t('common.aiRefineGenerating', { current, total, code });
    case 'saving':
      return t('common.aiRefineSaving', { current, total, code });
    case 'done':
      return t('common.aiRefineRowDone', { current, total, code });
    case 'skipped':
      return t('common.aiRefineRowSkipped', { current, total, code });
    case 'failed':
      return t('common.aiRefineRowFailed', { current, total, code });
    case 'stopping':
      return t('common.aiRefineStopping', { current, total, code });
    default:
      return '';
  }
}

export class AiRefineCancelledError extends Error {
  constructor() {
    super('AI refine cancelled');
    this.name = 'AiRefineCancelledError';
  }
}

function isCancelled(shouldCancel) {
  return typeof shouldCancel === 'function' && shouldCancel();
}

/**
 * Process items strictly one at a time. Calls onRowCommitted after each successful save.
 */
export async function runBulkAiRefine({
  items,
  refineOne,
  mergeRefined,
  payloadFn,
  hasChanged,
  saveOne,
  onProgress,
  onRowPreview,
  onRowCommitted,
  onRowSkipped,
  onRowError,
  onRowGenerating,
  onRowRefined,
  shouldCancel,
}) {
  let updated = 0;
  let skipped = 0;
  const failures = [];
  let cancelled = false;

  for (let index = 0; index < items.length; index += 1) {
    if (isCancelled(shouldCancel)) {
      cancelled = true;
      break;
    }

    const item = items[index];
    const current = index + 1;
    const total = items.length;

    onProgress?.({
      phase: isCancelled(shouldCancel) ? 'stopping' : 'generating',
      current,
      total,
      id: item.id,
      code: item.code,
      item,
    });
    onRowGenerating?.(item);
    scrollRefineRowIntoView(item.id);

    try {
      const refined = await refineOne(item);

      if (isCancelled(shouldCancel)) {
        cancelled = true;
        break;
      }

      const before = payloadFn(item);
      const after = mergeRefined(item, refined);
      const changed = hasChanged(before, after);

      onRowRefined?.(item, { before, after, refined, changed });

      if (!changed) {
        skipped += 1;
        onProgress?.({
          phase: 'skipped',
          current,
          total,
          id: item.id,
          code: item.code,
          item,
        });
        onRowSkipped?.(item, { before, after, refined });
        continue;
      }

      onRowPreview?.(item, after);

      if (isCancelled(shouldCancel)) {
        onRowError?.(item, new AiRefineCancelledError());
        cancelled = true;
        break;
      }

      onProgress?.({
        phase: 'saving',
        current,
        total,
        id: item.id,
        code: item.code,
        item,
      });

      await saveOne(item, after, before);
      updated += 1;
      onProgress?.({
        phase: 'done',
        current,
        total,
        id: item.id,
        code: item.code,
        item,
      });
      onRowCommitted?.(item, after, before);
    } catch (err) {
      if (err?.name === 'AbortError' || err instanceof AiRefineCancelledError) {
        cancelled = true;
        break;
      }
      failures.push({ code: item.code, message: err.message });
      onProgress?.({
        phase: 'failed',
        current,
        total,
        id: item.id,
        code: item.code,
        item,
        error: err.message,
      });
      onRowError?.(item, err);
    }
  }

  return {
    total: items.length,
    updated,
    skipped,
    failed: failures.length,
    failures,
    cancelled,
    processed: updated + skipped + failures.length,
  };
}
