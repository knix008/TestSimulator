/**
 * The catalogue of formats: what each one is called, which file extensions
 * it goes by, whether it can be read, written, or both, and the name Pandoc
 * knows it under. The set is Pandoc 3's own input and output lists.
 */

export type FormatId =
  // Markdown family
  | 'markdown' | 'markdown_strict' | 'markdown_phpextra' | 'markdown_mmd' | 'gfm' | 'commonmark' | 'commonmark_x' | 'markua' | 'djot'
  // Markup
  | 'html' | 'html4' | 'html5' | 'chunkedhtml' | 'plain' | 'ansi' | 'rst' | 'latex' | 'beamer' | 'context' | 'texinfo' | 'org' | 'textile'
  | 'asciidoc' | 'asciidoc_legacy' | 'asciidoctor' | 'typst' | 'haddock' | 't2t' | 'pod' | 'muse'
  // Wikis
  | 'mediawiki' | 'dokuwiki' | 'tikiwiki' | 'twiki' | 'xwiki' | 'zimwiki' | 'vimwiki' | 'creole' | 'jira'
  // Manual pages
  | 'man' | 'mdoc' | 'ms'
  // Office and e-books
  | 'docx' | 'odt' | 'opendocument' | 'rtf' | 'pdf' | 'postscript' | 'epub' | 'epub2' | 'epub3' | 'fb2' | 'pptx' | 'icml'
  // Slides
  | 'revealjs' | 'slidy' | 'slideous' | 's5' | 'dzslides'
  // XML
  | 'docbook' | 'docbook4' | 'docbook5' | 'jats' | 'jats_archiving' | 'jats_articleauthoring' | 'jats_publishing' | 'bits' | 'tei' | 'opml'
  // Bibliography
  | 'bibtex' | 'biblatex' | 'csljson' | 'ris' | 'endnotexml'
  // Data and the AST itself
  | 'json' | 'native' | 'csv' | 'tsv' | 'ipynb'

export type FormatGroup = 'markdown' | 'markup' | 'wiki' | 'man' | 'office' | 'ebook' | 'slides' | 'xml' | 'biblio' | 'data'

export type FormatDef = {
  id: FormatId
  names: { ko: string; en: string }
  extensions: string[]
  mime: string
  group: FormatGroup
  /** How the reader takes its input, or absent when the format cannot be read. */
  read?: 'text' | 'binary'
  /** How the writer produces its output, or absent when the format cannot be written. */
  write?: 'text' | 'binary'
  pandoc: string
  /** Shown in the preview pane as rendered HTML rather than as source. */
  rendered?: boolean
}

const f = (id: FormatId, ko: string, en: string, extensions: string[], mime: string, group: FormatGroup, read: FormatDef['read'], write: FormatDef['write'], extra: Partial<FormatDef> = {}): FormatDef => ({ id, names: { ko, en }, extensions, mime, group, read, write, pandoc: id, ...extra })

export const formats: FormatDef[] = [
  // Markdown family
  f('markdown', 'Markdown (Pandoc)', 'Markdown (Pandoc)', ['md', 'markdown', 'mdown', 'mkd', 'mkdn'], 'text/markdown', 'markdown', 'text', 'text'),
  f('markdown_strict', 'Markdown (원본 Markdown.pl)', 'Markdown (strict)', ['md'], 'text/markdown', 'markdown', 'text', 'text'),
  f('markdown_phpextra', 'Markdown (PHP Markdown Extra)', 'Markdown (PHP Extra)', ['md'], 'text/markdown', 'markdown', 'text', 'text'),
  f('markdown_mmd', 'Markdown (MultiMarkdown)', 'Markdown (MultiMarkdown)', ['md'], 'text/markdown', 'markdown', 'text', 'text'),
  f('gfm', 'Markdown (GitHub)', 'Markdown (GitHub)', ['md'], 'text/markdown', 'markdown', 'text', 'text'),
  f('commonmark', 'CommonMark', 'CommonMark', ['md'], 'text/markdown', 'markdown', 'text', 'text'),
  f('commonmark_x', 'CommonMark (확장)', 'CommonMark (extensions)', ['md'], 'text/markdown', 'markdown', 'text', 'text'),
  f('markua', 'Markua', 'Markua', ['markua', 'md'], 'text/markdown', 'markdown', undefined, 'text'),
  f('djot', 'Djot', 'Djot', ['dj'], 'text/x-djot', 'markdown', 'text', 'text'),
  // Markup
  f('html', 'HTML', 'HTML', ['html', 'htm', 'xhtml'], 'text/html', 'markup', 'text', 'text', { rendered: true }),
  f('html5', 'HTML5', 'HTML5', ['html'], 'text/html', 'markup', undefined, 'text', { rendered: true }),
  f('html4', 'HTML4 (XHTML 1.0)', 'HTML4 (XHTML 1.0)', ['html'], 'text/html', 'markup', undefined, 'text', { rendered: true }),
  f('chunkedhtml', '분할 HTML (ZIP)', 'Chunked HTML (ZIP)', ['zip'], 'application/zip', 'markup', undefined, 'binary', { rendered: true }),
  f('plain', '일반 텍스트', 'Plain text', ['txt', 'text'], 'text/plain', 'markup', 'text', 'text'),
  f('ansi', 'ANSI 터미널 텍스트', 'ANSI terminal text', ['txt'], 'text/plain', 'markup', undefined, 'text'),
  f('rst', 'reStructuredText', 'reStructuredText', ['rst', 'rest'], 'text/x-rst', 'markup', 'text', 'text'),
  f('latex', 'LaTeX', 'LaTeX', ['tex', 'latex', 'ltx'], 'application/x-latex', 'markup', 'text', 'text'),
  f('beamer', 'LaTeX Beamer 슬라이드', 'LaTeX Beamer slides', ['tex'], 'application/x-latex', 'slides', undefined, 'text'),
  f('context', 'ConTeXt', 'ConTeXt', ['tex', 'ctx'], 'application/x-tex', 'markup', undefined, 'text'),
  f('texinfo', 'GNU Texinfo', 'GNU Texinfo', ['texi', 'texinfo'], 'application/x-texinfo', 'markup', undefined, 'text'),
  f('org', 'Org-mode', 'Org mode', ['org'], 'text/x-org', 'markup', 'text', 'text'),
  f('textile', 'Textile', 'Textile', ['textile'], 'text/x-textile', 'markup', 'text', 'text'),
  f('asciidoc', 'AsciiDoc', 'AsciiDoc', ['adoc', 'asciidoc', 'asc'], 'text/x-asciidoc', 'markup', 'text', 'text'),
  f('asciidoc_legacy', 'AsciiDoc (구 문법)', 'AsciiDoc (legacy)', ['adoc'], 'text/x-asciidoc', 'markup', undefined, 'text'),
  f('asciidoctor', 'Asciidoctor', 'Asciidoctor', ['adoc'], 'text/x-asciidoc', 'markup', undefined, 'text'),
  f('typst', 'Typst', 'Typst', ['typ'], 'text/x-typst', 'markup', 'text', 'text'),
  f('haddock', 'Haddock 마크업', 'Haddock markup', ['haddock', 'txt'], 'text/plain', 'markup', 'text', 'text'),
  f('t2t', 'txt2tags', 'txt2tags', ['t2t'], 'text/plain', 'markup', 'text', undefined),
  f('pod', 'Perl POD', 'Perl POD', ['pod'], 'text/plain', 'markup', 'text', undefined),
  f('muse', 'Emacs Muse', 'Emacs Muse', ['muse'], 'text/plain', 'markup', 'text', 'text'),
  // Wikis
  f('mediawiki', 'MediaWiki', 'MediaWiki', ['wiki', 'mediawiki'], 'text/x-wiki', 'wiki', 'text', 'text'),
  f('dokuwiki', 'DokuWiki', 'DokuWiki', ['dokuwiki', 'txt'], 'text/x-wiki', 'wiki', 'text', 'text'),
  f('tikiwiki', 'TikiWiki', 'TikiWiki', ['tiki', 'txt'], 'text/x-wiki', 'wiki', 'text', undefined),
  f('twiki', 'TWiki', 'TWiki', ['twiki', 'txt'], 'text/x-wiki', 'wiki', 'text', undefined),
  f('xwiki', 'XWiki', 'XWiki', ['xwiki', 'txt'], 'text/x-wiki', 'wiki', undefined, 'text'),
  f('zimwiki', 'ZimWiki', 'ZimWiki', ['zim', 'txt'], 'text/x-wiki', 'wiki', undefined, 'text'),
  f('vimwiki', 'Vimwiki', 'Vimwiki', ['wiki', 'vimwiki'], 'text/x-wiki', 'wiki', 'text', undefined),
  f('creole', 'Creole 1.0', 'Creole 1.0', ['creole', 'txt'], 'text/x-wiki', 'wiki', 'text', undefined),
  f('jira', 'Jira 위키 마크업', 'Jira wiki markup', ['jira', 'txt'], 'text/x-wiki', 'wiki', 'text', 'text'),
  // Manual pages
  f('man', 'roff man 페이지', 'roff man page', ['1', 'man', 'roff'], 'text/troff', 'man', 'text', 'text'),
  f('mdoc', 'mdoc man 페이지', 'mdoc manual page', ['mdoc', '1'], 'text/troff', 'man', 'text', undefined),
  f('ms', 'roff ms', 'roff ms', ['ms', 'roff'], 'text/troff', 'man', undefined, 'text'),
  // Office and e-books
  f('docx', 'Word 문서 (DOCX)', 'Word document (DOCX)', ['docx'], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'office', 'binary', 'binary'),
  f('odt', 'OpenDocument (ODT)', 'OpenDocument text (ODT)', ['odt'], 'application/vnd.oasis.opendocument.text', 'office', 'binary', 'binary'),
  f('opendocument', 'OpenDocument XML (단일 파일)', 'OpenDocument XML (flat)', ['fodt', 'xml'], 'application/vnd.oasis.opendocument.text-flat-xml', 'office', undefined, 'text'),
  f('rtf', 'Rich Text (RTF)', 'Rich Text Format (RTF)', ['rtf'], 'application/rtf', 'office', 'text', 'text'),
  f('pdf', 'PDF', 'PDF', ['pdf'], 'application/pdf', 'office', undefined, 'binary', { rendered: true }),
  f('postscript', 'PostScript', 'PostScript', ['ps', 'eps'], 'application/postscript', 'office', 'text', 'binary', { rendered: true, pandoc: '' }),
  f('pptx', 'PowerPoint (PPTX)', 'PowerPoint (PPTX)', ['pptx'], 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'slides', undefined, 'binary'),
  f('icml', 'InDesign ICML', 'InDesign ICML', ['icml'], 'application/xml', 'office', undefined, 'text'),
  f('epub', 'EPUB 전자책', 'EPUB e-book', ['epub'], 'application/epub+zip', 'ebook', 'binary', 'binary'),
  f('epub3', 'EPUB 3', 'EPUB 3', ['epub'], 'application/epub+zip', 'ebook', undefined, 'binary'),
  f('epub2', 'EPUB 2', 'EPUB 2', ['epub'], 'application/epub+zip', 'ebook', undefined, 'binary'),
  f('fb2', 'FictionBook 2', 'FictionBook 2', ['fb2'], 'application/x-fictionbook+xml', 'ebook', 'text', 'text'),
  // Slides (HTML)
  f('revealjs', 'reveal.js 슬라이드', 'reveal.js slides', ['html'], 'text/html', 'slides', undefined, 'text', { rendered: true }),
  f('slidy', 'Slidy 슬라이드', 'Slidy slides', ['html'], 'text/html', 'slides', undefined, 'text', { rendered: true }),
  f('slideous', 'Slideous 슬라이드', 'Slideous slides', ['html'], 'text/html', 'slides', undefined, 'text', { rendered: true }),
  f('s5', 'S5 슬라이드', 'S5 slides', ['html'], 'text/html', 'slides', undefined, 'text', { rendered: true }),
  f('dzslides', 'DZSlides', 'DZSlides', ['html'], 'text/html', 'slides', undefined, 'text', { rendered: true }),
  // XML
  f('docbook', 'DocBook 5', 'DocBook 5', ['xml', 'dbk', 'docbook'], 'application/docbook+xml', 'xml', 'text', 'text'),
  f('docbook5', 'DocBook 5', 'DocBook 5', ['xml', 'dbk'], 'application/docbook+xml', 'xml', undefined, 'text'),
  f('docbook4', 'DocBook 4', 'DocBook 4', ['xml', 'dbk'], 'application/docbook+xml', 'xml', undefined, 'text'),
  f('jats', 'JATS XML', 'JATS XML', ['xml', 'jats'], 'application/xml', 'xml', 'text', 'text'),
  f('jats_archiving', 'JATS (Archiving)', 'JATS (Archiving and Interchange)', ['xml'], 'application/xml', 'xml', undefined, 'text'),
  f('jats_articleauthoring', 'JATS (Article Authoring)', 'JATS (Article Authoring)', ['xml'], 'application/xml', 'xml', undefined, 'text'),
  f('jats_publishing', 'JATS (Publishing)', 'JATS (Journal Publishing)', ['xml'], 'application/xml', 'xml', undefined, 'text'),
  f('bits', 'BITS XML (도서)', 'BITS XML (books)', ['xml'], 'application/xml', 'xml', 'text', undefined),
  f('tei', 'TEI Simple', 'TEI Simple', ['xml', 'tei'], 'application/tei+xml', 'xml', undefined, 'text'),
  f('opml', 'OPML 개요', 'OPML outline', ['opml'], 'text/x-opml', 'xml', 'text', 'text'),
  // Bibliography
  f('bibtex', 'BibTeX', 'BibTeX', ['bib'], 'application/x-bibtex', 'biblio', 'text', 'text'),
  f('biblatex', 'BibLaTeX', 'BibLaTeX', ['bib'], 'application/x-bibtex', 'biblio', 'text', 'text'),
  f('csljson', 'CSL JSON', 'CSL JSON', ['json'], 'application/json', 'biblio', 'text', 'text'),
  f('ris', 'RIS', 'RIS', ['ris'], 'application/x-research-info-systems', 'biblio', 'text', undefined),
  f('endnotexml', 'EndNote XML', 'EndNote XML', ['xml'], 'application/xml', 'biblio', 'text', undefined),
  // Data and the AST
  f('json', 'JSON (Pandoc AST)', 'JSON (Pandoc AST)', ['json'], 'application/json', 'data', 'text', 'text'),
  f('native', 'Pandoc native (Haskell)', 'Pandoc native (Haskell)', ['native', 'hs'], 'text/plain', 'data', 'text', 'text'),
  f('csv', 'CSV 표', 'CSV table', ['csv'], 'text/csv', 'data', 'text', 'text'),
  f('tsv', 'TSV 표', 'TSV table', ['tsv'], 'text/tab-separated-values', 'data', 'text', 'text'),
  f('ipynb', 'Jupyter 노트북', 'Jupyter notebook', ['ipynb'], 'application/x-ipynb+json', 'data', 'text', 'text'),
]

const byId = new Map(formats.map((format) => [format.id, format]))

export function getFormat(id: string): FormatDef {
  return byId.get(id as FormatId) ?? formats[0]
}

export function isFormatId(value: unknown): value is FormatId {
  return typeof value === 'string' && byId.has(value as FormatId)
}

export const readableFormats = formats.filter((format) => format.read)
export const writableFormats = formats.filter((format) => format.write)

/** Guesses the format of a file from its name; Markdown when nothing matches. */
export function formatForFile(name: string): FormatId {
  const ext = name.toLowerCase().split('.').pop() ?? ''
  for (const format of formats) {
    if (format.read && format.extensions[0] === ext) return format.id
  }
  for (const format of formats) {
    if (format.read && format.extensions.includes(ext)) return format.id
  }
  return 'markdown'
}

export function formatName(id: string, language: 'ko' | 'en'): string {
  return getFormat(id).names[language]
}

export function defaultExtension(id: string): string {
  return getFormat(id).extensions[0]
}

export function isBinaryFormat(id: string): boolean {
  const format = getFormat(id)
  return format.read === 'binary' || (format.write === 'binary' && !format.read)
}

export const groupOrder: FormatGroup[] = ['markdown', 'markup', 'wiki', 'man', 'office', 'ebook', 'slides', 'xml', 'biblio', 'data']

export const groupNames: Record<FormatGroup, { ko: string; en: string }> = {
  markdown: { ko: 'Markdown', en: 'Markdown' },
  markup: { ko: '마크업', en: 'Markup' },
  wiki: { ko: '위키', en: 'Wiki' },
  man: { ko: '매뉴얼 페이지', en: 'Manual pages' },
  office: { ko: '오피스', en: 'Office' },
  ebook: { ko: '전자책', en: 'E-book' },
  slides: { ko: '슬라이드', en: 'Slides' },
  xml: { ko: 'XML 문서', en: 'XML documents' },
  biblio: { ko: '참고문헌', en: 'Bibliography' },
  data: { ko: '데이터 / AST', en: 'Data / AST' },
}

/** Formats grouped for a <select> with <optgroup>s. */
export function groupedFormats(list: FormatDef[], language: 'ko' | 'en'): { label: string; options: { value: FormatId; label: string }[] }[] {
  return groupOrder
    .map((group) => ({ label: groupNames[group][language], options: list.filter((format) => format.group === group).map((format) => ({ value: format.id, label: format.names[language] })) }))
    .filter((group) => group.options.length > 0)
}
