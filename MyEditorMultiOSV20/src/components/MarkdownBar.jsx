// Markdown formatting toolbar, shown above the editor while a Markdown
// document is active: H1–H6, bold / italic / strikethrough / code, code
// block, quote, lists, link / image / table / rule.
// WYSIWYG and the structure panel sit at the right end of this row.
// Each formatting button applies the Markdown syntax to the selection (or
// toggles it off again) — see src/lib/markdown.js.
import React from 'react';
import { t, useLanguage } from '../lib/i18n';
import { Icon } from './Icons';

const HEADINGS = [1, 2, 3, 4, 5, 6];

const GROUPS = [
  [
    { id: 'md:bold', label: <b>B</b>, tip: 'md_bold', shortcut: 'Ctrl+B' },
    { id: 'md:italic', label: <i>I</i>, tip: 'md_italic', shortcut: 'Ctrl+I' },
    { id: 'md:strike', label: <s>S</s>, tip: 'md_strike', shortcut: 'Ctrl+Shift+X' },
    { id: 'md:inlineCode', label: <code>{'<>'}</code>, tip: 'md_code', shortcut: 'Ctrl+`' },
  ],
  [
    { id: 'md:quote', icon: 'quote', tip: 'md_quote', shortcut: 'Ctrl+Shift+Q' },
    { id: 'md:bulletList', icon: 'list', tip: 'md_ul', shortcut: 'Ctrl+Shift+8' },
    { id: 'md:orderedList', icon: 'listOrdered', tip: 'md_ol', shortcut: 'Ctrl+Shift+7' },
    { id: 'md:taskList', icon: 'checkSquare', tip: 'md_task', shortcut: 'Ctrl+Shift+9' },
    { id: 'md:codeBlock', icon: 'code', tip: 'md_code_block', shortcut: 'Ctrl+Shift+C' },
  ],
  [
    { id: 'md:link', icon: 'link', tip: 'md_link', shortcut: 'Ctrl+K' },
    { id: 'md:image', icon: 'fileImage', tip: 'md_image', shortcut: 'Ctrl+Shift+I' },
    { id: 'md:table', icon: 'table', tip: 'md_table' },
    { id: 'md:hr', icon: 'minus', tip: 'md_hr' },
  ],
];

export function MarkdownBar({ onAction, wysiwygOn, outlineOn }) {
  useLanguage();
  const tip = (b) => `${t(b.tip)}${b.shortcut ? ` (${b.shortcut})` : ''}`;
  return (
    <div className="mdbar">
      <span className="mdbar-headings">
        {HEADINGS.map((n) => (
          <button key={n} className="md-btn md-h" title={`${t('md_heading', { n })} (Ctrl+${n})`} onMouseDown={(e) => e.preventDefault()} onClick={() => onAction(`md:heading:${n}`)}>
            H<sub>{n}</sub>
          </button>
        ))}
      </span>
      {GROUPS.map((g, gi) => (
        <React.Fragment key={gi}>
          <span className="tb-sep" />
          {g.map((b) => (
            <button key={b.id} className="md-btn" title={tip(b)} aria-label={t(b.tip)} onMouseDown={(e) => e.preventDefault()} onClick={() => onAction(b.id)}>
              {b.icon ? <Icon name={b.icon} size={16} /> : b.label}
            </button>
          ))}
        </React.Fragment>
      ))}
      <span className="mdbar-end">
        <button type="button" className={`md-btn md-toggle${outlineOn ? ' on' : ''}`} data-cmd="toggleStructure" title={t('md_outline_tip')} aria-label={t('md_outline')} aria-pressed={outlineOn ? 'true' : 'false'} onMouseDown={(e) => e.preventDefault()} onClick={() => onAction('toggleStructure')}>
          <Icon name="listTree" size={16} />
        </button>
        <button type="button" className={`md-btn md-toggle${wysiwygOn ? ' on' : ''}`} data-cmd="toggle:mdWysiwyg" title={`${t('md_wysiwyg')} (Ctrl+Shift+W)`} aria-label={t('md_wysiwyg_menu')} aria-pressed={wysiwygOn ? 'true' : 'false'} onMouseDown={(e) => e.preventDefault()} onClick={() => onAction('toggle:mdWysiwyg')}>
          <Icon name="wysiwyg" size={16} />
        </button>
      </span>
    </div>
  );
}

export default MarkdownBar;
