// Which formatter 문서 정렬 will run for a language — the same resolution as
// core/format.js run(): the chosen tool, or with 'auto' the first installed
// one, and the editor's own re-indent when nothing is. Used by the toolbar
// label next to the format button and by the settings › 정렬 tab.
import { t } from './i18n.js';

// Display name of a tool from format.tools (the bundled ones are translated).
export const toolLabel = (x) => ({ 'prettier-builtin': t('fmt_prettier_builtin'), prettier: t('fmt_prettier_ext'), 'builtin-json': t('fmt_builtin_json'), 'builtin-xml': t('fmt_builtin_xml') })[x.id] || x.label;

// { label, auto?, off?, missing? } — tools is the format.tools result (null while loading).
export function resolveFormatter({ lang, settings, tools }) {
  if (!lang) return { label: t('fmt_indent') };
  const choice = (settings.formatters || {})[lang] || 'auto';
  if (choice === 'none') return { label: t('fmt_none_opt'), off: true };
  if (choice === 'indent') return { label: t('fmt_indent') };
  if (!tools) return { label: '…' };
  const list = tools[lang] || [];
  if (choice === 'auto') {
    const x = list.find((y) => y.available);
    return { label: x ? toolLabel(x) : t('fmt_indent'), auto: true };
  }
  const x = list.find((y) => y.id === choice);
  if (!x) return { label: choice, missing: true };
  return { label: toolLabel(x), missing: !x.available };
}
