// Builds the samples/ folder: one document per supported format.
//
// Every writable format is produced from samples/reference.md by the app's
// own writers, so the samples are exactly what the program emits. The ten
// input-only formats (txt2tags, POD, TikiWiki, TWiki, Vimwiki, Creole, mdoc,
// BITS, RIS, EndNote XML) have hand-written samples, kept in this script.
// PDF needs the desktop app's print engine and is left out. PostScript embeds
// the bundled Nanum fonts (public/fonts), so it renders Korean anywhere.
//
//   npm run samples        (= node --import ./test/helpers/setup.mjs scripts/make-samples.mjs)
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { formats, groupNames, groupOrder } from '../src/lib/doc/formats.ts'
import { readDocument, writeDocument } from '../src/lib/doc/convert.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const samplesDir = path.join(root, 'samples')
// The PostScript writer embeds the bundled fonts, exactly as the app does.
const loadFont = async (file) => new Uint8Array(await fs.readFile(path.join(root, 'public', 'fonts', file)))

/**
 * Hand-written samples: the input-only formats, and the bibliography formats
 * (the reference document cites nothing, so their writers would emit empty
 * files).
 */
const handWritten = {
  bibtex: `@article{kwon2026,
  author = {Kwon, Suho and Doe, Jane},
  title = {Converting documents without an external engine},
  journal = {Journal of Document Engineering},
  year = {2026},
  volume = {12},
  number = {3},
  pages = {101--118},
  doi = {10.1000/jde.2026.12.3.101},
  url = {https://example.com/jde/2026/12/3}
}

@book{macfarlane2024,
  author = {MacFarlane, John},
  title = {Pandoc User's Guide},
  publisher = {pandoc.org},
  address = {Berkeley},
  year = {2024},
  url = {https://pandoc.org/MANUAL.html}
}

@inproceedings{lee2025,
  author = {Lee, Minsoo},
  title = {천지인 입력기의 다중 플랫폼 이식},
  booktitle = {한국 소프트웨어 학회 학술대회},
  year = {2025},
  pages = {45--52}
}
`,
  biblatex: `@article{kwon2026,
  author = {Kwon, Suho and Doe, Jane},
  title = {Converting documents without an external engine},
  journaltitle = {Journal of Document Engineering},
  date = {2026-09},
  volume = {12},
  number = {3},
  pages = {101--118},
  doi = {10.1000/jde.2026.12.3.101},
  url = {https://example.com/jde/2026/12/3}
}

@book{macfarlane2024,
  author = {MacFarlane, John},
  title = {Pandoc User's Guide},
  publisher = {pandoc.org},
  location = {Berkeley},
  date = {2024},
  url = {https://pandoc.org/MANUAL.html}
}

@online{mdcv2026,
  author = {Kwon, Suho},
  title = {My Document Converter},
  date = {2026-09-22},
  url = {https://example.com/mdcv}
}
`,
  csljson: `[
  {
    "id": "kwon2026",
    "type": "article-journal",
    "title": "Converting documents without an external engine",
    "author": [{ "family": "Kwon", "given": "Suho" }, { "family": "Doe", "given": "Jane" }],
    "container-title": "Journal of Document Engineering",
    "issued": { "date-parts": [[2026, 9]] },
    "volume": "12",
    "issue": "3",
    "page": "101-118",
    "DOI": "10.1000/jde.2026.12.3.101",
    "URL": "https://example.com/jde/2026/12/3"
  },
  {
    "id": "macfarlane2024",
    "type": "book",
    "title": "Pandoc User's Guide",
    "author": [{ "family": "MacFarlane", "given": "John" }],
    "publisher": "pandoc.org",
    "publisher-place": "Berkeley",
    "issued": { "date-parts": [[2024]] },
    "URL": "https://pandoc.org/MANUAL.html"
  },
  {
    "id": "lee2025",
    "type": "paper-conference",
    "title": "천지인 입력기의 다중 플랫폼 이식",
    "author": [{ "family": "Lee", "given": "Minsoo" }],
    "container-title": "한국 소프트웨어 학회 학술대회",
    "issued": { "date-parts": [[2025]] },
    "page": "45-52"
  }
]
`,
  t2t: `My Document Converter 샘플
SHKWON
2026-09-22

= 소개 (Introduction) =

txt2tags 는 **굵게**, //기울임//, __밑줄__, \`\`코드\`\` 와 [링크 https://example.com] 를 지원합니다.
This line is in English.

== 목록 (Lists) ==

- 첫 번째 항목
- 두 번째 항목
- 세 번째 항목

+ 순서가 있는 항목
+ 두 번째
+ 세 번째

== 코드 (Code) ==

\`\`\`
function greet(name) {
  console.log('Hello, ' + name)
}
\`\`\`

== 표 (Table) ==

|| 형식 | 확장자 |
| Markdown | .md |
| HTML | .html |
`,
  pod: `=pod

=encoding utf8

=head1 NAME

converter - My Document Converter 의 POD 샘플

=head1 DESCRIPTION

POD 는 Perl 문서 형식입니다. B<굵게>, I<기울임>, C<코드>, L<링크|https://example.com> 를 씁니다.
This paragraph is in English.

=head2 목록 (Lists)

=over 4

=item * 첫 번째 항목

=item * 두 번째 항목

=item * 세 번째 항목

=back

=over 4

=item 1. 순서가 있는 항목

=item 2. 두 번째

=back

=head2 코드 (Code)

    function greet(name) {
      console.log('Hello, ' + name)
    }

=head2 정의 (Definitions)

=over 4

=item 용어

용어에 대한 정의입니다.

=item Pandoc

범용 문서 변환기.

=back

=cut
`,
  tikiwiki: `!소개 (Introduction)

TikiWiki 는 __굵게__, ''기울임'', -+코드+- 와 [https://example.com|링크] 를 지원합니다.
This line is in English.

!!목록 (Lists)

* 첫 번째 항목
* 두 번째 항목
** 중첩된 항목
* 세 번째 항목
# 순서가 있는 항목
# 두 번째
# 세 번째

!!코드 (Code)

{CODE(colors=js)}function greet(name) {
  console.log('Hello, ' + name)
}{CODE}

!!표 (Table)

||형식|확장자
Markdown|.md
HTML|.html
DOCX|.docx||
`,
  twiki: `---+ 소개 (Introduction)

TWiki 는 *굵게*, _기울임_, =코드= 와 [[https://example.com][링크]] 를 지원합니다.
This line is in English.

---++ 목록 (Lists)

   * 첫 번째 항목
   * 두 번째 항목
      * 중첩된 항목
   * 세 번째 항목
   1 순서가 있는 항목
   1 두 번째
   1 세 번째

---++ 코드 (Code)

<verbatim>
function greet(name) {
  console.log('Hello, ' + name)
}
</verbatim>

---++ 표 (Table)

| *형식* | *확장자* |
| Markdown | .md |
| HTML | .html |
| DOCX | .docx |
`,
  vimwiki: `%title My Document Converter 샘플

= 소개 (Introduction) =

Vimwiki 는 *굵게*, _기울임_, \`코드\` 와 [[https://example.com|링크]] 를 지원합니다.
This line is in English.

== 목록 (Lists) ==

- 첫 번째 항목
- 두 번째 항목
    - 중첩된 항목
- 세 번째 항목

1. 순서가 있는 항목
2. 두 번째
3. 세 번째

- [X] 끝난 일
- [ ] 남은 일

== 코드 (Code) ==

{{{js
function greet(name) {
  console.log('Hello, ' + name)
}
}}}

== 표 (Table) ==

| 형식 | 확장자 |
|------|--------|
| Markdown | .md |
| HTML | .html |
| DOCX | .docx |
`,
  creole: `= 소개 (Introduction) =

Creole 은 **굵게**, //기울임//, {{{코드}}} 와 [[https://example.com|링크]] 를 지원합니다.
This line is in English.

== 목록 (Lists) ==

* 첫 번째 항목
* 두 번째 항목
** 중첩된 항목
* 세 번째 항목

# 순서가 있는 항목
# 두 번째
# 세 번째

== 코드 (Code) ==

{{{
function greet(name) {
  console.log('Hello, ' + name)
}
}}}

== 표 (Table) ==

|=형식|=확장자|
|Markdown|.md|
|HTML|.html|
|DOCX|.docx|

----

마지막 문단입니다.
`,
  mdoc: `.Dd September 22, 2026
.Dt MDCV 1
.Os
.Sh NAME
.Nm mdcv
.Nd My Document Converter 의 mdoc 샘플
.Sh SYNOPSIS
.Nm
.Op Fl f Ar format
.Op Fl t Ar format
.Ar file
.Sh DESCRIPTION
mdoc 은 BSD 매뉴얼 페이지 형식입니다.
.Em 기울임
과
.Sy 굵게
와
.Ql 코드
를 씁니다. This sentence is in English.
.Pp
옵션은 다음과 같습니다.
.Bl -tag -width Ds
.It Fl f Ar format
입력 형식을 지정합니다.
.It Fl t Ar format
출력 형식을 지정합니다.
.El
.Sh EXAMPLES
.Bl -bullet
.It
첫 번째 항목
.It
두 번째 항목
.It
세 번째 항목
.El
.Bd -literal
mdcv -f markdown -t html sample.md
.Ed
.Sh SEE ALSO
.Xr pandoc 1
`,
  bits: `<?xml version="1.0" encoding="UTF-8"?>
<book xmlns:xlink="http://www.w3.org/1999/xlink">
  <book-meta>
    <book-title-group>
      <book-title>My Document Converter 샘플</book-title>
    </book-title-group>
    <contrib-group>
      <contrib contrib-type="author"><string-name>SHKWON</string-name></contrib>
    </contrib-group>
    <pub-date><year>2026</year></pub-date>
  </book-meta>
  <book-body>
    <book-part book-part-type="chapter">
      <book-part-meta>
        <title-group><title>소개 (Introduction)</title></title-group>
      </book-part-meta>
      <body>
        <p>BITS 는 JATS 를 책에 맞게 확장한 XML 형식입니다. <bold>굵게</bold>, <italic>기울임</italic>, <monospace>코드</monospace> 와 <ext-link ext-link-type="uri" xlink:href="https://example.com">링크</ext-link> 를 씁니다.</p>
        <p>This paragraph is in English.</p>
        <sec>
          <title>목록 (Lists)</title>
          <list list-type="bullet">
            <list-item><p>첫 번째 항목</p></list-item>
            <list-item><p>두 번째 항목</p></list-item>
            <list-item><p>세 번째 항목</p></list-item>
          </list>
          <list list-type="order">
            <list-item><p>순서가 있는 항목</p></list-item>
            <list-item><p>두 번째</p></list-item>
          </list>
        </sec>
        <sec>
          <title>코드 (Code)</title>
          <preformat>function greet(name) {
  console.log('Hello, ' + name)
}</preformat>
        </sec>
        <sec>
          <title>표 (Table)</title>
          <table-wrap>
            <table>
              <thead><tr><th>형식</th><th>확장자</th></tr></thead>
              <tbody>
                <tr><td>Markdown</td><td>.md</td></tr>
                <tr><td>HTML</td><td>.html</td></tr>
              </tbody>
            </table>
          </table-wrap>
        </sec>
      </body>
    </book-part>
  </book-body>
</book>
`,
  ris: `TY  - JOUR
AU  - Kwon, Suho
AU  - Doe, Jane
TI  - Converting documents without an external engine
JO  - Journal of Document Engineering
PY  - 2026
VL  - 12
IS  - 3
SP  - 101
EP  - 118
DO  - 10.1000/jde.2026.12.3.101
UR  - https://example.com/jde/2026/12/3
KW  - document conversion
KW  - Pandoc
ER  -

TY  - BOOK
AU  - MacFarlane, John
TI  - Pandoc User's Guide
PB  - pandoc.org
PY  - 2024
CY  - Berkeley
UR  - https://pandoc.org/MANUAL.html
ER  -

TY  - CONF
AU  - Lee, Minsoo
TI  - 천지인 입력기의 다중 플랫폼 이식
T2  - 한국 소프트웨어 학회 학술대회
PY  - 2025
SP  - 45
EP  - 52
ER  -
`,
  endnotexml: `<?xml version="1.0" encoding="UTF-8"?>
<xml>
  <records>
    <record>
      <rec-number>1</rec-number>
      <ref-type name="Journal Article">17</ref-type>
      <contributors>
        <authors>
          <author>Kwon, Suho</author>
          <author>Doe, Jane</author>
        </authors>
      </contributors>
      <titles>
        <title>Converting documents without an external engine</title>
        <secondary-title>Journal of Document Engineering</secondary-title>
      </titles>
      <periodical><full-title>Journal of Document Engineering</full-title></periodical>
      <pages>101-118</pages>
      <volume>12</volume>
      <number>3</number>
      <dates><year>2026</year></dates>
      <urls><related-urls><url>https://example.com/jde/2026/12/3</url></related-urls></urls>
      <electronic-resource-num>10.1000/jde.2026.12.3.101</electronic-resource-num>
    </record>
    <record>
      <rec-number>2</rec-number>
      <ref-type name="Book">6</ref-type>
      <contributors>
        <authors>
          <author>MacFarlane, John</author>
        </authors>
      </contributors>
      <titles>
        <title>Pandoc User's Guide</title>
      </titles>
      <publisher>pandoc.org</publisher>
      <pub-location>Berkeley</pub-location>
      <dates><year>2024</year></dates>
    </record>
  </records>
</xml>
`,
}

async function main() {
  const source = await fs.readFile(path.join(samplesDir, 'reference.md'), 'utf8')
  const doc = await readDocument({ format: 'markdown', text: source })
  const rows = []
  let written = 0

  for (const group of groupOrder) {
    const dir = path.join(samplesDir, group)
    await fs.mkdir(dir, { recursive: true })
    for (const format of formats.filter((entry) => entry.group === group)) {
      const file = `${format.id}.${format.extensions[0]}`
      const target = path.join(dir, file)
      let how
      if (handWritten[format.id]) {
        await fs.writeFile(target, handWritten[format.id], 'utf8')
        const back = await readDocument({ format: format.id, text: handWritten[format.id] })
        if (!back.blocks.length && !(back.references && back.references.length)) throw new Error(`${format.id}: the reader found nothing in the hand-written sample`)
        how = 'hand-written'
      } else if (format.write && format.id !== 'pdf') {
        const output = await writeDocument(doc, format.id, { standalone: true, toc: false }, { loadFont })
        if (output.bytes) await fs.writeFile(target, output.bytes)
        else await fs.writeFile(target, output.text, 'utf8')
        how = 'writer'
      } else {
        continue
      }
      written += 1
      rows.push({ group, id: format.id, file: `${group}/${file}`, name: format.en, ko: format.ko, read: Boolean(format.read), write: Boolean(format.write), how })
    }
  }

  const lines = [
    '# Samples',
    '',
    '`reference.md` 를 원본으로 프로그램의 writer 가 만든 출력과, 입력 전용 형식의 손으로 쓴 샘플입니다.',
    'The outputs are produced by the app\'s own writers from `reference.md`; input-only formats are hand-written.',
    '',
    '다시 만들기 / rebuild: `npm run samples`',
    '',
    'PDF 는 데스크톱 앱의 인쇄 엔진이 필요하므로 여기에 없습니다. PDF is not included: it needs the desktop app\'s print engine.',
    '',
    '변환 결과 / conversion results: `npm run samples:convert` 가 모든 샘플을 모든 출력 형식으로 변환해 [output/](output/REPORT.md) 에 저장합니다 (REPORT.md 에 샘플 × 형식 표). The same run is part of `npm test`.',
    '',
  ]
  for (const group of groupOrder) {
    const inGroup = rows.filter((row) => row.group === group)
    if (!inGroup.length) continue
    lines.push(`## ${groupNames[group].ko} / ${groupNames[group].en}`, '', '| 파일 / File | 형식 / Format | 읽기 | 쓰기 | 출처 |', '|---|---|:-:|:-:|---|')
    for (const row of inGroup) lines.push(`| [${row.file}](${row.file}) | ${row.ko} — ${row.name} (\`${row.id}\`) | ${row.read ? 'O' : '-'} | ${row.write ? 'O' : '-'} | ${row.how} |`)
    lines.push('')
  }
  await fs.writeFile(path.join(samplesDir, 'README.md'), lines.join('\n'), 'utf8')
  console.log(`${written} samples written to ${samplesDir}`)
}

main().catch((error) => { console.error(error); process.exit(1) })
