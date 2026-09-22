# Samples

`reference.md` 를 원본으로 프로그램의 writer 가 만든 출력과, 입력 전용 형식의 손으로 쓴 샘플입니다.
The outputs are produced by the app's own writers from `reference.md`; input-only formats are hand-written.

다시 만들기 / rebuild: `npm run samples`

PDF 는 데스크톱 앱의 인쇄 엔진이 필요하므로 여기에 없습니다. PDF is not included: it needs the desktop app's print engine.

변환 결과 / conversion results: `npm run samples:convert` 가 모든 샘플을 모든 출력 형식으로 변환해 [output/](output/REPORT.md) 에 저장합니다 (REPORT.md 에 샘플 × 형식 표). The same run is part of `npm test`.

## Markdown / Markdown

| 파일 / File | 형식 / Format | 읽기 | 쓰기 | 출처 |
|---|---|:-:|:-:|---|
| [markdown/markdown.md](markdown/markdown.md) | undefined — undefined (`markdown`) | O | O | writer |
| [markdown/markdown_strict.md](markdown/markdown_strict.md) | undefined — undefined (`markdown_strict`) | O | O | writer |
| [markdown/markdown_phpextra.md](markdown/markdown_phpextra.md) | undefined — undefined (`markdown_phpextra`) | O | O | writer |
| [markdown/markdown_mmd.md](markdown/markdown_mmd.md) | undefined — undefined (`markdown_mmd`) | O | O | writer |
| [markdown/gfm.md](markdown/gfm.md) | undefined — undefined (`gfm`) | O | O | writer |
| [markdown/commonmark.md](markdown/commonmark.md) | undefined — undefined (`commonmark`) | O | O | writer |
| [markdown/commonmark_x.md](markdown/commonmark_x.md) | undefined — undefined (`commonmark_x`) | O | O | writer |
| [markdown/markua.markua](markdown/markua.markua) | undefined — undefined (`markua`) | - | O | writer |
| [markdown/djot.dj](markdown/djot.dj) | undefined — undefined (`djot`) | O | O | writer |

## 마크업 / Markup

| 파일 / File | 형식 / Format | 읽기 | 쓰기 | 출처 |
|---|---|:-:|:-:|---|
| [markup/html.html](markup/html.html) | undefined — undefined (`html`) | O | O | writer |
| [markup/html5.html](markup/html5.html) | undefined — undefined (`html5`) | - | O | writer |
| [markup/html4.html](markup/html4.html) | undefined — undefined (`html4`) | - | O | writer |
| [markup/chunkedhtml.zip](markup/chunkedhtml.zip) | undefined — undefined (`chunkedhtml`) | - | O | writer |
| [markup/plain.txt](markup/plain.txt) | undefined — undefined (`plain`) | O | O | writer |
| [markup/ansi.txt](markup/ansi.txt) | undefined — undefined (`ansi`) | - | O | writer |
| [markup/rst.rst](markup/rst.rst) | undefined — undefined (`rst`) | O | O | writer |
| [markup/latex.tex](markup/latex.tex) | undefined — undefined (`latex`) | O | O | writer |
| [markup/context.tex](markup/context.tex) | undefined — undefined (`context`) | - | O | writer |
| [markup/texinfo.texi](markup/texinfo.texi) | undefined — undefined (`texinfo`) | - | O | writer |
| [markup/org.org](markup/org.org) | undefined — undefined (`org`) | O | O | writer |
| [markup/textile.textile](markup/textile.textile) | undefined — undefined (`textile`) | O | O | writer |
| [markup/asciidoc.adoc](markup/asciidoc.adoc) | undefined — undefined (`asciidoc`) | O | O | writer |
| [markup/asciidoc_legacy.adoc](markup/asciidoc_legacy.adoc) | undefined — undefined (`asciidoc_legacy`) | - | O | writer |
| [markup/asciidoctor.adoc](markup/asciidoctor.adoc) | undefined — undefined (`asciidoctor`) | - | O | writer |
| [markup/typst.typ](markup/typst.typ) | undefined — undefined (`typst`) | O | O | writer |
| [markup/haddock.haddock](markup/haddock.haddock) | undefined — undefined (`haddock`) | O | O | writer |
| [markup/t2t.t2t](markup/t2t.t2t) | undefined — undefined (`t2t`) | O | - | hand-written |
| [markup/pod.pod](markup/pod.pod) | undefined — undefined (`pod`) | O | - | hand-written |
| [markup/muse.muse](markup/muse.muse) | undefined — undefined (`muse`) | O | O | writer |

## 위키 / Wiki

| 파일 / File | 형식 / Format | 읽기 | 쓰기 | 출처 |
|---|---|:-:|:-:|---|
| [wiki/mediawiki.wiki](wiki/mediawiki.wiki) | undefined — undefined (`mediawiki`) | O | O | writer |
| [wiki/dokuwiki.dokuwiki](wiki/dokuwiki.dokuwiki) | undefined — undefined (`dokuwiki`) | O | O | writer |
| [wiki/tikiwiki.tiki](wiki/tikiwiki.tiki) | undefined — undefined (`tikiwiki`) | O | - | hand-written |
| [wiki/twiki.twiki](wiki/twiki.twiki) | undefined — undefined (`twiki`) | O | - | hand-written |
| [wiki/xwiki.xwiki](wiki/xwiki.xwiki) | undefined — undefined (`xwiki`) | - | O | writer |
| [wiki/zimwiki.zim](wiki/zimwiki.zim) | undefined — undefined (`zimwiki`) | - | O | writer |
| [wiki/vimwiki.wiki](wiki/vimwiki.wiki) | undefined — undefined (`vimwiki`) | O | - | hand-written |
| [wiki/creole.creole](wiki/creole.creole) | undefined — undefined (`creole`) | O | - | hand-written |
| [wiki/jira.jira](wiki/jira.jira) | undefined — undefined (`jira`) | O | O | writer |

## 매뉴얼 페이지 / Manual pages

| 파일 / File | 형식 / Format | 읽기 | 쓰기 | 출처 |
|---|---|:-:|:-:|---|
| [man/man.1](man/man.1) | undefined — undefined (`man`) | O | O | writer |
| [man/mdoc.mdoc](man/mdoc.mdoc) | undefined — undefined (`mdoc`) | O | - | hand-written |
| [man/ms.ms](man/ms.ms) | undefined — undefined (`ms`) | - | O | writer |

## 오피스 / Office

| 파일 / File | 형식 / Format | 읽기 | 쓰기 | 출처 |
|---|---|:-:|:-:|---|
| [office/docx.docx](office/docx.docx) | undefined — undefined (`docx`) | O | O | writer |
| [office/odt.odt](office/odt.odt) | undefined — undefined (`odt`) | O | O | writer |
| [office/opendocument.fodt](office/opendocument.fodt) | undefined — undefined (`opendocument`) | - | O | writer |
| [office/rtf.rtf](office/rtf.rtf) | undefined — undefined (`rtf`) | O | O | writer |
| [office/postscript.ps](office/postscript.ps) | undefined — undefined (`postscript`) | O | O | writer |
| [office/icml.icml](office/icml.icml) | undefined — undefined (`icml`) | - | O | writer |

## 전자책 / E-book

| 파일 / File | 형식 / Format | 읽기 | 쓰기 | 출처 |
|---|---|:-:|:-:|---|
| [ebook/epub.epub](ebook/epub.epub) | undefined — undefined (`epub`) | O | O | writer |
| [ebook/epub3.epub](ebook/epub3.epub) | undefined — undefined (`epub3`) | - | O | writer |
| [ebook/epub2.epub](ebook/epub2.epub) | undefined — undefined (`epub2`) | - | O | writer |
| [ebook/fb2.fb2](ebook/fb2.fb2) | undefined — undefined (`fb2`) | O | O | writer |

## 슬라이드 / Slides

| 파일 / File | 형식 / Format | 읽기 | 쓰기 | 출처 |
|---|---|:-:|:-:|---|
| [slides/beamer.tex](slides/beamer.tex) | undefined — undefined (`beamer`) | - | O | writer |
| [slides/pptx.pptx](slides/pptx.pptx) | undefined — undefined (`pptx`) | - | O | writer |
| [slides/revealjs.html](slides/revealjs.html) | undefined — undefined (`revealjs`) | - | O | writer |
| [slides/slidy.html](slides/slidy.html) | undefined — undefined (`slidy`) | - | O | writer |
| [slides/slideous.html](slides/slideous.html) | undefined — undefined (`slideous`) | - | O | writer |
| [slides/s5.html](slides/s5.html) | undefined — undefined (`s5`) | - | O | writer |
| [slides/dzslides.html](slides/dzslides.html) | undefined — undefined (`dzslides`) | - | O | writer |

## XML 문서 / XML documents

| 파일 / File | 형식 / Format | 읽기 | 쓰기 | 출처 |
|---|---|:-:|:-:|---|
| [xml/docbook.xml](xml/docbook.xml) | undefined — undefined (`docbook`) | O | O | writer |
| [xml/docbook5.xml](xml/docbook5.xml) | undefined — undefined (`docbook5`) | - | O | writer |
| [xml/docbook4.xml](xml/docbook4.xml) | undefined — undefined (`docbook4`) | - | O | writer |
| [xml/jats.xml](xml/jats.xml) | undefined — undefined (`jats`) | O | O | writer |
| [xml/jats_archiving.xml](xml/jats_archiving.xml) | undefined — undefined (`jats_archiving`) | - | O | writer |
| [xml/jats_articleauthoring.xml](xml/jats_articleauthoring.xml) | undefined — undefined (`jats_articleauthoring`) | - | O | writer |
| [xml/jats_publishing.xml](xml/jats_publishing.xml) | undefined — undefined (`jats_publishing`) | - | O | writer |
| [xml/bits.xml](xml/bits.xml) | undefined — undefined (`bits`) | O | - | hand-written |
| [xml/tei.xml](xml/tei.xml) | undefined — undefined (`tei`) | - | O | writer |
| [xml/opml.opml](xml/opml.opml) | undefined — undefined (`opml`) | O | O | writer |

## 참고문헌 / Bibliography

| 파일 / File | 형식 / Format | 읽기 | 쓰기 | 출처 |
|---|---|:-:|:-:|---|
| [biblio/bibtex.bib](biblio/bibtex.bib) | undefined — undefined (`bibtex`) | O | O | hand-written |
| [biblio/biblatex.bib](biblio/biblatex.bib) | undefined — undefined (`biblatex`) | O | O | hand-written |
| [biblio/csljson.json](biblio/csljson.json) | undefined — undefined (`csljson`) | O | O | hand-written |
| [biblio/ris.ris](biblio/ris.ris) | undefined — undefined (`ris`) | O | - | hand-written |
| [biblio/endnotexml.xml](biblio/endnotexml.xml) | undefined — undefined (`endnotexml`) | O | - | hand-written |

## 데이터 / AST / Data / AST

| 파일 / File | 형식 / Format | 읽기 | 쓰기 | 출처 |
|---|---|:-:|:-:|---|
| [data/json.json](data/json.json) | undefined — undefined (`json`) | O | O | writer |
| [data/native.native](data/native.native) | undefined — undefined (`native`) | O | O | writer |
| [data/csv.csv](data/csv.csv) | undefined — undefined (`csv`) | O | O | writer |
| [data/tsv.tsv](data/tsv.tsv) | undefined — undefined (`tsv`) | O | O | writer |
| [data/ipynb.ipynb](data/ipynb.ipynb) | undefined — undefined (`ipynb`) | O | O | writer |
