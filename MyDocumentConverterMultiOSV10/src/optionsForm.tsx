import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Check, Field, NumberField, Select } from './controls'
import { t } from './i18n'
import type { Language } from './lib/settings'
import type { HtmlStyle, MarkdownFlavor, PageSize, WrapMode, WriterOptions } from './lib/doc/options'
import { getFormat, type FormatId } from './lib/doc/formats'

/**
 * The writer options as a form. The Properties panel shows it for the active
 * document and the Settings window for the defaults, so both edit exactly
 * the same set of controls.
 */
export function Group({ title, children, open = true, onToggle }: { title: string; children: ReactNode; open?: boolean; onToggle?: () => void }) {
  const [localOpen, setLocalOpen] = useState(open)
  const isOpen = onToggle ? open : localOpen
  return (
    <section className={isOpen ? 'group open' : 'group'}>
      <button type="button" className="group-title" onClick={() => (onToggle ? onToggle() : setLocalOpen((value) => !value))} aria-expanded={isOpen}>
        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span>{title}</span>
      </button>
      {isOpen && <div className="group-body">{children}</div>}
    </section>
  )
}

export function relevantGroups(to: FormatId) {
  const group = getFormat(to).group
  const markdown = group === 'markdown' || to === 'ipynb'
  const html = to === 'html' || to === 'html4' || to === 'html5' || to === 'chunkedhtml' || group === 'ebook' || to === 'pdf' || (group === 'slides' && to !== 'beamer' && to !== 'pptx')
  const page = to === 'pdf' || to === 'postscript' || to === 'docx' || to === 'odt' || to === 'opendocument' || to === 'rtf' || to === 'latex' || to === 'beamer' || to === 'context' || to === 'ms' || to === 'pptx'
  const fonts = to === 'docx' || to === 'odt' || to === 'opendocument' || to === 'rtf' || to === 'pptx'
  const latex = to === 'latex' || to === 'beamer'
  const postscript = to === 'postscript'
  const binary = group === 'office' || group === 'ebook' || to === 'pptx' || to === 'chunkedhtml' || to === 'json' || to === 'native' || group === 'biblio'
  return { markdown, html, page, fonts, latex, postscript, wrap: !binary && !html }
}

export type OptionSection = 'general' | 'metadata' | 'markdown' | 'html' | 'page' | 'fonts' | 'latex' | 'postscript'

export const optionSections: { id: OptionSection; label: string }[] = [
  { id: 'general', label: 'optGeneral' },
  { id: 'metadata', label: 'optMetadata' },
  { id: 'markdown', label: 'optMarkdown' },
  { id: 'html', label: 'optHtml' },
  { id: 'page', label: 'optPage' },
  { id: 'fonts', label: 'optFonts' },
  { id: 'latex', label: 'optLatex' },
  { id: 'postscript', label: 'optPostScript' },
]

/** One block of options: a collapsible group in the panel, or the bare controls when only that section is wanted. */
function Section({ id, only, title, open, children }: { id: OptionSection; only?: OptionSection; title: string; open?: boolean; children: ReactNode }) {
  if (only) return only === id ? <div className="options-section">{children}</div> : null
  return <Group title={title} open={open}>{children}</Group>
}

export function OptionsForm({ language, value, onChange, to, fonts, compact, section }: {
  language: Language
  value: WriterOptions
  onChange: (patch: Partial<WriterOptions>) => void
  /** The output format, which decides which groups matter; absent shows everything. */
  to?: FormatId
  fonts?: string[]
  compact?: boolean
  /** Only this section, flat and without its collapsible heading — the Settings window puts each one on a tab of its own. */
  section?: OptionSection
}) {
  const tr = (key: string) => t(language, key)
  const groups = to ? relevantGroups(to) : { markdown: true, html: true, page: true, fonts: true, latex: true, postscript: true, wrap: true }

  const fontOptions = (fonts ?? []).map((name) => ({ value: name, label: name }))
  const fontSelect = (current: string, key: 'bodyFont' | 'monoFont') => (
    fonts && fonts.length
      ? <Select value={fontOptions.some((option) => option.value === current) ? current : fontOptions[0]?.value ?? current} options={fontOptions.some((option) => option.value === current) ? fontOptions : [{ value: current, label: current }, ...fontOptions]} onChange={(next) => onChange({ [key]: next })} />
      : <input type="text" value={current} onChange={(event) => onChange({ [key]: event.target.value })} />
  )
  return (
    <div className={compact ? 'options-form compact' : 'options-form'}>
      <Section only={section} id="general" title={tr('optGeneral')}>
        <Check label={tr('standalone')} checked={value.standalone} onChange={(standalone) => onChange({ standalone })} />
        <Check label={tr('toc')} checked={value.toc} onChange={(toc) => onChange({ toc })} />
        <Field label={tr('tocDepth')}>
          <NumberField value={value.tocDepth} min={1} max={6} onChange={(tocDepth) => onChange({ tocDepth })} />
        </Field>
        <Check label={tr('numberSections')} checked={value.numberSections} onChange={(numberSections) => onChange({ numberSections })} />
        {groups.wrap && (
          <>
            <Field label={tr('wrap')}>
              <Select<WrapMode> value={value.wrap} options={[{ value: 'auto', label: tr('wrapAuto') }, { value: 'none', label: tr('wrapNone') }, { value: 'preserve', label: tr('wrapPreserve') }]} onChange={(wrap) => onChange({ wrap })} />
            </Field>
            <Field label={tr('columns')}>
              <NumberField value={value.columns} min={20} max={300} onChange={(columns) => onChange({ columns })} />
            </Field>
          </>
        )}
        <Field label={tr('lineEnding')}>
          <Select<'lf' | 'crlf'> value={value.lineEnding} options={[{ value: 'lf', label: 'LF (Unix)' }, { value: 'crlf', label: 'CRLF (Windows)' }]} onChange={(lineEnding) => onChange({ lineEnding })} />
        </Field>
      </Section>
      <Section only={section} id="metadata" title={tr('optMetadata')} open={!compact}>
        <Field label={tr('title')} wide><input type="text" value={value.title} onChange={(event) => onChange({ title: event.target.value })} /></Field>
        <Field label={tr('author')} wide><input type="text" value={value.author} onChange={(event) => onChange({ author: event.target.value })} /></Field>
        <Field label={tr('date')} wide><input type="text" value={value.date} onChange={(event) => onChange({ date: event.target.value })} /></Field>
        <p className="hint">{tr('metaHint')}</p>
      </Section>
      {groups.markdown && (
        <Section only={section} id="markdown" title={tr('optMarkdown')}>
          <Field label={tr('markdownFlavor')}>
            <Select<MarkdownFlavor> value={value.markdownFlavor} options={[{ value: 'pandoc', label: tr('flavorPandoc') }, { value: 'gfm', label: tr('flavorGfm') }, { value: 'commonmark', label: tr('flavorCommonmark') }]} onChange={(markdownFlavor) => onChange({ markdownFlavor })} />
          </Field>
          <Field label={tr('headingStyle')}>
            <Select<'atx' | 'setext'> value={value.headingStyle} options={[{ value: 'atx', label: tr('headingAtx') }, { value: 'setext', label: tr('headingSetext') }]} onChange={(headingStyle) => onChange({ headingStyle })} />
          </Field>
          <Field label={tr('bulletMarker')}>
            <Select<'-' | '*' | '+'> value={value.bulletMarker} options={[{ value: '-', label: '-' }, { value: '*', label: '*' }, { value: '+', label: '+' }]} onChange={(bulletMarker) => onChange({ bulletMarker })} />
          </Field>
          <Field label={tr('emphasisMarker')}>
            <Select<'*' | '_'> value={value.emphasisMarker} options={[{ value: '*', label: '*' }, { value: '_', label: '_' }]} onChange={(emphasisMarker) => onChange({ emphasisMarker })} />
          </Field>
          <Field label={tr('codeFence')}>
            <Select<'```' | '~~~'> value={value.codeFence} options={[{ value: '```', label: '```' }, { value: '~~~', label: '~~~' }]} onChange={(codeFence) => onChange({ codeFence })} />
          </Field>
        </Section>
      )}
      {groups.html && (
        <Section only={section} id="html" title={tr('optHtml')}>
          <Field label={tr('htmlStyle')}>
            <Select<HtmlStyle> value={value.htmlStyle} options={[{ value: 'default', label: tr('styleDefault') }, { value: 'github', label: tr('styleGithub') }, { value: 'minimal', label: tr('styleMinimal') }, { value: 'print', label: tr('stylePrint') }, { value: 'none', label: tr('styleNone') }]} onChange={(htmlStyle) => onChange({ htmlStyle })} />
          </Field>
          <Check label={tr('htmlMath')} checked={value.htmlMath} onChange={(htmlMath) => onChange({ htmlMath })} />
          <Check label={tr('htmlSectionDivs')} checked={value.htmlSectionDivs} onChange={(htmlSectionDivs) => onChange({ htmlSectionDivs })} />
        </Section>
      )}
      {groups.page && (
        <Section only={section} id="page" title={tr('optPage')}>
          <Field label={tr('pageSize')}>
            <Select<PageSize> value={value.pageSize} options={['A4', 'A3', 'A5', 'Letter', 'Legal', 'Tabloid'].map((size) => ({ value: size as PageSize, label: size }))} onChange={(pageSize) => onChange({ pageSize })} />
          </Field>
          <Check label={tr('landscape')} checked={value.landscape} onChange={(landscape) => onChange({ landscape })} />
          <Field label={tr('marginMm')}>
            <NumberField value={value.marginMm} min={0} max={60} onChange={(marginMm) => onChange({ marginMm })} />
          </Field>
        </Section>
      )}
      {groups.fonts && (
        <Section only={section} id="fonts" title={tr('optFonts')}>
          <Field label={tr('bodyFont')} wide>{fontSelect(value.bodyFont, 'bodyFont')}</Field>
          <Field label={tr('bodyFontSize')}>
            <NumberField value={value.bodyFontSize} min={6} max={36} onChange={(bodyFontSize) => onChange({ bodyFontSize })} />
          </Field>
          <Field label={tr('monoFont')} wide>{fontSelect(value.monoFont, 'monoFont')}</Field>
        </Section>
      )}
      {groups.latex && (
        <Section only={section} id="latex" title={tr('optLatex')}>
          <Field label={tr('documentClass')}>
            <Select value={value.documentClass} options={['article', 'report', 'book', 'memoir', 'scrartcl'].map((name) => ({ value: name, label: name }))} onChange={(documentClass) => onChange({ documentClass })} />
          </Field>
          <Field label={tr('latexFontSize')}>
            <Select value={value.fontSize} options={['10pt', '11pt', '12pt'].map((size) => ({ value: size, label: size }))} onChange={(fontSize) => onChange({ fontSize })} />
          </Field>
        </Section>
      )}
      {groups.postscript && (
        <Section only={section} id="postscript" title={tr('optPostScript')}>
          <Check label={tr('psEmbedFonts')} checked={value.psEmbedFonts} onChange={(psEmbedFonts) => onChange({ psEmbedFonts })} />
          <p className="hint">{tr('psEmbedHint')}</p>
          <Field label={tr('psBodyFont')}>
            <Select<'gothic' | 'coding'> value={value.psBodyFont} options={[{ value: 'gothic', label: tr('psFontGothic') }, { value: 'coding', label: tr('psFontCoding') }]} onChange={(psBodyFont) => onChange({ psBodyFont })} />
          </Field>
          <Field label={tr('bodyFontSize')}>
            <NumberField value={value.bodyFontSize} min={6} max={36} onChange={(bodyFontSize) => onChange({ bodyFontSize })} />
          </Field>
          <Check label={tr('psDecorations')} checked={value.psDecorations} onChange={(psDecorations) => onChange({ psDecorations })} />
          <p className="hint">{tr('psPageHint')}</p>
        </Section>
      )}
    </div>
  )
}
