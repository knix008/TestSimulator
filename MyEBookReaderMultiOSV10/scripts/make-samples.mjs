// Builds the sample books in samples/.
//
// They are real files in every format the reader opens, written from scratch so
// the repository carries no third-party content: the tests open them, and they
// double as something to look at on a fresh install. Deliberately written with
// Node's own zlib — the reader's ZIP and DEFLATE code is ours, so the samples
// must not be produced by it or a bug would cancel itself out.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import zlib from 'node:zlib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const out = path.join(root, 'samples');

// ── A tiny ZIP writer (stored + deflate) ──────────────────
function crc32(bytes) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[i] = c;
    }
  }
  let crc = -1;
  for (const byte of bytes) crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff];
  return (crc ^ -1) >>> 0;
}

function zip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, 'utf8');
    const raw = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, 'utf8');
    const deflate = entry.store !== true;
    const body = deflate ? zlib.deflateRawSync(raw, { level: 9 }) : raw;
    const method = deflate ? 8 : 0;
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);          // UTF-8 names
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    chunks.push(local, nameBytes, body);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0x800, 8);
    dir.writeUInt16LE(method, 10);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(body.length, 20);
    dir.writeUInt32LE(raw.length, 24);
    dir.writeUInt16LE(nameBytes.length, 28);
    dir.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([dir, nameBytes]));

    offset += local.length + nameBytes.length + body.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...chunks, centralBuf, end]);
}

// ── A tiny PNG writer, for the pictures inside the samples ──
function png(width, height, paint) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let at = 0;
  for (let y = 0; y < height; y++) {
    raw[at++] = 0;                     // filter: none
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint(x, y);
      raw[at++] = r; raw[at++] = g; raw[at++] = b;
    }
  }

  const chunk = (type, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 0);
    return Buffer.concat([head, data, crc]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 2;    // colour type: truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const CHAPTERS = [
  {
    title: '첫 장 — 열기 (Opening)',
    body: [
      'MyEBookReader 는 EPUB·PDF·MOBI·FB2·CBZ·Markdown·HTML·텍스트를 한 프로그램에서 읽습니다.',
      'This sample book exists so the reader can be exercised end to end: a table of contents, several chapters, an image, an internal link and text long enough to paginate.',
      '왼쪽 패널에서 목차를, 오른쪽 패널에서 책 정보와 읽기 설정을 볼 수 있습니다.',
    ],
  },
  {
    title: '둘째 장 — 표시 (Marks)',
    body: [
      '글을 선택하고 형광펜 버튼을 누르면 그 부분이 칠해지고, 오른쪽 패널의 목록에 남습니다.',
      'Bookmarks, highlights and notes are kept in a reading file (.ebkr) next to the book, so the book itself is never rewritten.',
      '<a href="ch3.xhtml">셋째 장으로 이동</a> — 책 안의 링크도 따라갑니다.',
    ],
  },
  {
    title: '셋째 장 — 그림과 인쇄 (Pictures and printing)',
    body: [
      '<img src="../images/plate.png" alt="a generated plate"/>',
      '그림은 책 안에 들어 있는 자원을 그대로 보여 줍니다.',
      'Printing offers everything, this chapter, or a range you type, with a preview that uses the paper size and margins you chose.',
      ...Array.from({ length: 12 }, (_, i) => `단락 ${i + 1}. 페이지 넘김 방식을 "한 쪽씩 보기"로 바꾸면 이 장이 여러 쪽으로 나뉩니다. Paragraph ${i + 1} of filler text so that pagination has something to do.`),
    ],
  },
];

function xhtml(title, body) {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="ko">
<head><title>${title}</title><link rel="stylesheet" href="../style.css"/></head>
<body>
  <h1>${title}</h1>
${body.map((line) => (line.startsWith('<') ? `  ${line}` : `  <p>${line}</p>`)).join('\n')}
</body>
</html>`;
}

function buildEpub() {
  const plate = png(240, 160, (x, y) => [
    40 + ((x * 200) / 240) | 0,
    90 + ((y * 120) / 160) | 0,
    180 - ((x * 100) / 240) | 0,
  ]);
  const cover = png(200, 300, (x, y) => [
    20 + ((y * 60) / 300) | 0,
    60 + ((x * 80) / 200) | 0,
    120 + ((y * 100) / 300) | 0,
  ]);

  const manifest = CHAPTERS.map((_, i) => `    <item id="ch${i + 1}" href="text/ch${i + 1}.xhtml" media-type="application/xhtml+xml"/>`).join('\n');
  const spine = CHAPTERS.map((_, i) => `    <itemref idref="ch${i + 1}"/>`).join('\n');
  const navList = CHAPTERS.map((c, i) => `        <li><a href="text/ch${i + 1}.xhtml">${c.title}</a></li>`).join('\n');

  return zip([
    // The mimetype entry must be first and stored uncompressed.
    { name: 'mimetype', data: 'application/epub+zip', store: true },
    {
      name: 'META-INF/container.xml',
      data: `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`,
    },
    {
      name: 'OEBPS/content.opf',
      data: `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>MyEBookReader 샘플 책</dc:title>
    <dc:creator>SHKWON</dc:creator>
    <dc:language>ko</dc:language>
    <dc:identifier id="bookid">urn:uuid:myebookreader-sample-0001</dc:identifier>
    <dc:publisher>TestSimulator</dc:publisher>
    <dc:date>2026-01-01</dc:date>
    <dc:description>모든 기능을 시험하기 위한 샘플 EPUB 입니다.</dc:description>
    <dc:subject>Sample</dc:subject>
    <meta name="cover" content="cover-image"/>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="cover-image" href="images/cover.png" media-type="image/png" properties="cover-image"/>
    <item id="plate" href="images/plate.png" media-type="image/png"/>
    <item id="css" href="style.css" media-type="text/css"/>
${manifest}
  </manifest>
  <spine toc="ncx">
${spine}
  </spine>
</package>`,
    },
    {
      name: 'OEBPS/nav.xhtml',
      data: `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>목차</title></head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>목차</h1>
    <ol>
${navList}
    </ol>
  </nav>
</body>
</html>`,
    },
    {
      name: 'OEBPS/toc.ncx',
      data: `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="urn:uuid:myebookreader-sample-0001"/></head>
  <docTitle><text>MyEBookReader 샘플 책</text></docTitle>
  <navMap>
${CHAPTERS.map((c, i) => `    <navPoint id="np${i + 1}" playOrder="${i + 1}">
      <navLabel><text>${c.title}</text></navLabel>
      <content src="text/ch${i + 1}.xhtml"/>
    </navPoint>`).join('\n')}
  </navMap>
</ncx>`,
    },
    { name: 'OEBPS/style.css', data: 'body { font-family: serif; } h1 { color: #246; }' },
    { name: 'OEBPS/images/cover.png', data: cover },
    { name: 'OEBPS/images/plate.png', data: plate },
    ...CHAPTERS.map((chapter, i) => ({
      name: `OEBPS/text/ch${i + 1}.xhtml`,
      data: xhtml(chapter.title, chapter.body),
    })),
  ]);
}

function buildCbz() {
  const pages = [];
  for (let p = 1; p <= 6; p++) {
    pages.push({
      name: `page${p}.png`,
      data: png(180, 260, (x, y) => [
        (30 * p + x) % 255,
        (90 + y) % 255,
        (200 - 20 * p) % 255,
      ]),
      store: true,     // images are already compressed
    });
  }
  return zip(pages);
}

function buildFb2() {
  const body = CHAPTERS.map((chapter) => `    <section>
      <title><p>${chapter.title}</p></title>
${chapter.body.filter((line) => !line.startsWith('<')).map((line) => `      <p>${line}</p>`).join('\n')}
    </section>`).join('\n');

  return Buffer.from(`<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">
  <description>
    <title-info>
      <genre>sf</genre>
      <author><first-name>Suho</first-name><last-name>Kwon</last-name></author>
      <book-title>MyEBookReader FB2 샘플</book-title>
      <annotation><p>FictionBook 형식을 시험하기 위한 샘플입니다.</p></annotation>
      <lang>ko</lang>
      <date>2026</date>
    </title-info>
    <publish-info><publisher>TestSimulator</publisher><year>2026</year></publish-info>
  </description>
  <body>
${body}
  </body>
</FictionBook>
`, 'utf8');
}

function buildText() {
  const lines = ['MyEBookReader 텍스트 샘플', ''];
  for (let c = 1; c <= 4; c++) {
    lines.push(`제${c}장 텍스트 장 제목`, '');
    for (let p = 1; p <= 8; p++) {
      lines.push(`${c}-${p}. 평문 텍스트도 장 단위로 나뉘어 목차가 생깁니다. Plain text is split into chapters so it gets a contents list too.`, '');
    }
  }
  return Buffer.from(lines.join('\n'), 'utf8');
}

function buildMarkdown() {
  return Buffer.from(`# MyEBookReader Markdown 샘플

마크다운은 **굵게**, *기울임*, \`코드\`, [링크](https://example.com) 를 그대로 보여 줍니다.

## 첫째 절

- 목록 항목 하나
- 목록 항목 둘
- 목록 항목 셋

> 인용문도 지원합니다.

\`\`\`js
console.log('fenced code blocks too');
\`\`\`

## 둘째 절

| 형식 | 확장자 |
| --- | --- |
| EPUB | .epub |
| 만화 | .cbz |

두 번째 절의 본문입니다. The second section exists so the contents list has more than one entry.
`, 'utf8');
}

function buildHtml() {
  return Buffer.from(`<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>MyEBookReader HTML 샘플</title></head>
<body>
  <h1>첫째 부분</h1>
  <p>단독 HTML 파일도 제목을 기준으로 나뉘어 읽힙니다.</p>
  <h1>둘째 부분</h1>
  <p>A standalone HTML book is split at its top-level headings.</p>
</body></html>
`, 'utf8');
}

// ── MOBI (PalmDOC compression) ────────────────────────────
function palmDocCompress(input) {
  // Literal bytes and the "space + letter" pairing only: a correct PalmDOC
  // stream that the reader has to decompress, without needing a matcher.
  const out = [];
  for (let i = 0; i < input.length; i++) {
    const byte = input[i];
    if (byte === 0x20 && i + 1 < input.length && input[i + 1] >= 0x40 && input[i + 1] < 0x80) {
      out.push(input[i + 1] ^ 0x80);
      i++;
    } else if (byte >= 0x09 && byte < 0x80) {
      out.push(byte);
    } else {
      out.push(1, byte);      // one literal byte follows
    }
  }
  return Buffer.from(out);
}

/**
 * The text records of a MOBI 6 book, and everything its record 0 needs to
 * describe them.
 *
 * Split out from `buildMobi` so that the same half can be put in front of a KF8
 * book, which is how a file that carries both is made.
 */
function buildMobiRecords() {
  const html = `<html><head><guide></guide></head><body>${
    CHAPTERS.map((chapter, i) => `${i ? '<mbp:pagebreak/>' : ''}<h1>${chapter.title}</h1>${
      chapter.body.filter((line) => !line.startsWith('<')).map((line) => `<p>${line}</p>`).join('')
    }`).join('')
  }</body></html>`;

  const text = Buffer.from(html, 'utf8');
  const RECORD = 4096;
  const textRecords = [];
  for (let at = 0; at < text.length; at += RECORD) {
    textRecords.push(palmDocCompress(text.subarray(at, Math.min(at + RECORD, text.length))));
  }
  return { text, textRecords, recordSize: RECORD };
}

/**
 * Record 0 of a MOBI 6 book.
 *
 * `boundary`, when given, is written as EXTH 121 — the record where a KF8 book
 * in the same file begins.
 */
function buildMobiRecord0({ text, textRecords, recordSize, boundary }) {
  const title = Buffer.from('MyEBookReader MOBI 샘플', 'utf8');
  const author = Buffer.from('SHKWON', 'utf8');

  // EXTH: author (100), publisher (101), and where the KF8 half starts (121).
  const exthEntries = [[100, author], [101, Buffer.from('TestSimulator', 'utf8')]];
  if (boundary != null) {
    const value = Buffer.alloc(4);
    value.writeUInt32BE(boundary, 0);
    exthEntries.push([121, value]);
  }
  const exthBody = Buffer.concat(exthEntries.map(([type, value]) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(type, 0);
    head.writeUInt32BE(8 + value.length, 4);
    return Buffer.concat([head, value]);
  }));
  const exthHead = Buffer.alloc(12);
  exthHead.write('EXTH', 0, 'ascii');
  exthHead.writeUInt32BE(12 + exthBody.length, 4);
  exthHead.writeUInt32BE(exthEntries.length, 8);
  const exthPad = Buffer.alloc((4 - ((12 + exthBody.length) % 4)) % 4);
  const exth = Buffer.concat([exthHead, exthBody, exthPad]);

  // Record 0: PalmDOC header (16) + MOBI header (232) + EXTH + the title.
  const MOBI_HEADER_LENGTH = 232;
  const record0 = Buffer.alloc(16 + MOBI_HEADER_LENGTH);
  record0.writeUInt16BE(2, 0);                  // compression: PalmDOC
  record0.writeUInt32BE(text.length, 4);        // uncompressed text length
  record0.writeUInt16BE(textRecords.length, 8); // text record count
  record0.writeUInt16BE(recordSize, 10);        // record size
  record0.writeUInt16BE(0, 12);                 // no encryption
  record0.write('MOBI', 16, 'ascii');
  record0.writeUInt32BE(MOBI_HEADER_LENGTH, 20);
  record0.writeUInt32BE(2, 24);                 // mobi type: book
  record0.writeUInt32BE(65001, 28);             // UTF-8
  record0.writeUInt32BE(6, 32);                 // unique id
  record0.writeUInt32BE(6, 36);                 // file version
  record0.writeUInt32BE(16 + MOBI_HEADER_LENGTH + exth.length, 84);   // full name offset
  record0.writeUInt32BE(title.length, 88);      // full name length
  record0.writeUInt32BE(9, 92);                 // locale: ko
  record0.writeUInt32BE(0xffffffff, 108);       // first image record: none
  record0.writeUInt32BE(0x40, 128);             // EXTH present

  return Buffer.concat([record0, exth, title, Buffer.alloc(2)]);
}

function buildMobi() {
  const built = buildMobiRecords();
  return buildPalmDb([buildMobiRecord0(built), ...built.textRecords]);
}

// ── A minimal, valid PDF ──────────────────────────────────
//
// Four pages, not one: turning a page, reading a run of them, printing a range
// and the page-turn effect all need a document with pages to move between, and a
// one- or two-page sample cannot tell a reader who turns twice from one who
// turns once.
const PDF_PAGES = 4;

function buildPdf() {
  const pageText = (n) => {
    const lines = n === 1
      ? [
        'BT /F1 22 Tf 60 740 Td (MyEBookReader PDF sample) Tj ET',
        'BT /F1 13 Tf 60 700 Td (Fixed-layout formats are drawn page by page.) Tj ET',
        'BT /F1 13 Tf 60 676 Td (Zoom, rotation and printing all work on pages.) Tj ET',
      ]
      : [
        `BT /F1 22 Tf 60 740 Td (Page ${n} of the PDF sample) Tj ET`,
        `BT /F1 13 Tf 60 700 Td (Every page carries text, so selecting words can be tried on any of them.) Tj ET`,
      ];
    return `${lines.join('\n')}\n`;
  };

  // 1 catalogue · 2 page tree · 3 font, then a page and its contents in pairs.
  const pageObj = (n) => 4 + (n - 1) * 2;
  const kids = [];
  for (let n = 1; n <= PDF_PAGES; n += 1) kids.push(`${pageObj(n)} 0 R`);

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${PDF_PAGES} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  for (let n = 1; n <= PDF_PAGES; n += 1) {
    const content = pageText(n);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageObj(n) + 1} 0 R >>`,
      `<< /Length ${content.length} >>\nstream\n${content}endstream`,
    );
  }

  let pdf = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const startxref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const at of offsets) pdf += `${String(at).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

// ── Pictures: one the browser decodes, and two it cannot ──
function buildPng() {
  return png(480, 320, (x, y) => [
    40 + ((x * 180) / 480) | 0,
    120 + ((y * 100) / 320) | 0,
    200 - ((x * 120) / 480) | 0,
  ]);
}

/** A baseline, uncompressed RGB TIFF — decoded by the app's own reader. */
function buildTiff() {
  const width = 240;
  const height = 160;
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 3;
      pixels[at] = (x * 255 / width) | 0;
      pixels[at + 1] = (y * 255 / height) | 0;
      pixels[at + 2] = 160;
    }
  }

  const entries = [
    [256, 3, 1, width], [257, 3, 1, height], [258, 3, 1, 8], [259, 3, 1, 1],
    [262, 3, 1, 2], [273, 4, 1, 0], [277, 3, 1, 3], [278, 3, 1, height],
    [279, 4, 1, pixels.length], [284, 3, 1, 1],
  ];
  const ifdSize = 2 + entries.length * 12 + 4;
  const dataOffset = 8 + ifdSize;
  entries[5][3] = dataOffset;

  const out = Buffer.alloc(dataOffset + pixels.length);
  out.write('II', 0, 'ascii');
  out.writeUInt16LE(42, 2);
  out.writeUInt32LE(8, 4);
  out.writeUInt16LE(entries.length, 8);
  entries.forEach(([tag, type, count, value], i) => {
    const at = 10 + i * 12;
    out.writeUInt16LE(tag, at);
    out.writeUInt16LE(type, at + 2);
    out.writeUInt32LE(count, at + 4);
    if (type === 3) out.writeUInt16LE(value, at + 8);
    else out.writeUInt32LE(value, at + 8);
  });
  pixels.copy(out, dataOffset);
  return out;
}

/** A small 16-bit DICOM image, explicit VR little endian. */
function buildDicom() {
  const width = 128;
  const height = 128;
  const pixels = Buffer.alloc(width * height * 2);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - width / 2;
      const dy = y - height / 2;
      const value = Math.max(0, 3200 - Math.round(Math.hypot(dx, dy) * 40));
      pixels.writeUInt16LE(value, (y * width + x) * 2);
    }
  }

  const parts = [];
  const element = (group, elem, vr, payload) => {
    const body = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), 'latin1');
    const padded = body.length % 2 ? Buffer.concat([body, Buffer.from([0x20])]) : body;
    if (vr === 'OW') {
      const head = Buffer.alloc(12);
      head.writeUInt16LE(group, 0);
      head.writeUInt16LE(elem, 2);
      head.write(vr, 4, 'ascii');
      head.writeUInt32LE(padded.length, 8);
      parts.push(head, padded);
      return;
    }
    const head = Buffer.alloc(8);
    head.writeUInt16LE(group, 0);
    head.writeUInt16LE(elem, 2);
    head.write(vr, 4, 'ascii');
    head.writeUInt16LE(padded.length, 6);
    parts.push(head, padded);
  };
  const us = (value) => {
    const b = Buffer.alloc(2);
    b.writeUInt16LE(value, 0);
    return b;
  };

  const metaBody = (() => {
    const syntax = Buffer.from('1.2.840.10008.1.2.1\u0000', 'latin1');
    const head = Buffer.alloc(8);
    head.writeUInt16LE(0x0002, 0);
    head.writeUInt16LE(0x0010, 2);
    head.write('UI', 4, 'ascii');
    head.writeUInt16LE(syntax.length, 6);
    return Buffer.concat([head, syntax]);
  })();
  const groupLength = Buffer.alloc(12);
  groupLength.writeUInt16LE(0x0002, 0);
  groupLength.writeUInt16LE(0x0000, 2);
  groupLength.write('UL', 4, 'ascii');
  groupLength.writeUInt16LE(4, 6);
  groupLength.writeUInt32LE(metaBody.length, 8);

  element(0x0008, 0x0060, 'CS', 'OT');
  element(0x0008, 0x1030, 'LO', 'MyEBookReader sample study');
  element(0x0010, 0x0010, 'PN', 'SAMPLE^PATIENT');
  element(0x0028, 0x0002, 'US', us(1));
  element(0x0028, 0x0004, 'CS', 'MONOCHROME2');
  element(0x0028, 0x0010, 'US', us(height));
  element(0x0028, 0x0011, 'US', us(width));
  element(0x0028, 0x0100, 'US', us(16));
  element(0x0028, 0x0101, 'US', us(16));
  element(0x0028, 0x0103, 'US', us(0));
  element(0x7fe0, 0x0010, 'OW', pixels);

  return Buffer.concat([
    Buffer.alloc(128), Buffer.from('DICM', 'ascii'), groupLength, metaBody, ...parts,
  ]);
}

// ── A Palm database, given its records ────────────────────
function buildPalmDb(records, { name = 'MyEBookReaderSample', type = 'BOOKMOBI' } = {}) {
  const head = Buffer.alloc(78);
  Buffer.from(name, 'latin1').copy(head, 0, 0, Math.min(31, name.length));
  head.writeUInt16BE(0, 32);                    // attributes
  head.writeUInt16BE(1, 34);                    // version
  head.write(type, 60, 'ascii');
  head.writeUInt16BE(records.length, 76);

  const tableSize = records.length * 8;
  // Two padding bytes sit between the record table and the first record.
  let at = head.length + tableSize + 2;
  const table = Buffer.alloc(tableSize);
  records.forEach((record, i) => {
    table.writeUInt32BE(at, i * 8);
    table.writeUInt32BE(i, i * 8 + 4);
    at += record.length;
  });
  return Buffer.concat([head, table, Buffer.alloc(2), ...records]);
}

// ── The pieces an INDX table is made of ───────────────────
//
// See src/lib/indx.js for what these mean. Writing them here rather than
// checking in a binary is the only way to test the reader against something
// whose every field is known.

/** A big-endian variable-width integer, the high bit marking the last byte. */
function varint(value) {
  const bytes = [];
  let left = value >>> 0;
  do {
    bytes.unshift(left & 0x7f);
    left >>>= 7;
  } while (left);
  bytes[bytes.length - 1] |= 0x80;
  return Buffer.from(bytes);
}

const INDX_HEADER = 192;

/** The header record of an index: how many entry records and CNCX records follow. */
function indxHeader({ entryRecords, cncxRecords, tagx, entries }) {
  const head = Buffer.alloc(INDX_HEADER);
  head.write('INDX', 0, 'ascii');
  head.writeUInt32BE(INDX_HEADER, 0x04);
  head.writeUInt32BE(0, 0x08);                  // type
  head.writeUInt32BE(1, 0x0c);                  // generation
  head.writeUInt32BE(INDX_HEADER, 0x10);        // IDXT start (none of its own)
  head.writeUInt32BE(entryRecords, 0x14);       // index records following
  head.writeUInt32BE(65001, 0x18);              // encoding
  head.writeUInt32BE(0xffffffff, 0x1c);         // language
  head.writeUInt32BE(entries, 0x20);            // entries in all of them
  head.writeUInt32BE(cncxRecords, 0x30);        // CNCX records following
  return Buffer.concat([head, tagx]);
}

/** The TAGX block: what an entry's fields are. */
function tagxBlock(controlBytes, tags) {
  const body = Buffer.alloc(tags.length * 4);
  tags.forEach(([tag, values, mask, end], i) => {
    body[i * 4] = tag;
    body[i * 4 + 1] = values;
    body[i * 4 + 2] = mask;
    body[i * 4 + 3] = end;
  });
  const head = Buffer.alloc(12);
  head.write('TAGX', 0, 'ascii');
  head.writeUInt32BE(12 + body.length, 4);
  head.writeUInt32BE(controlBytes, 8);
  return Buffer.concat([head, body]);
}

/** One record of index entries, with the IDXT offset list at its end. */
function indxEntries(entries) {
  const head = Buffer.alloc(INDX_HEADER);
  head.write('INDX', 0, 'ascii');
  head.writeUInt32BE(INDX_HEADER, 0x04);
  head.writeUInt32BE(entries.length, 0x14);

  const blobs = [];
  const offsets = [];
  let at = INDX_HEADER;
  for (const { name, control, values } of entries) {
    const label = Buffer.from(name, 'latin1');
    const blob = Buffer.concat([
      Buffer.from([label.length]),
      label,
      Buffer.from([control]),
      ...values.map(varint),
    ]);
    offsets.push(at);
    at += blob.length;
    blobs.push(blob);
  }

  head.writeUInt32BE(at, 0x10);                 // where the IDXT list starts
  const idxt = Buffer.alloc(4 + entries.length * 2);
  idxt.write('IDXT', 0, 'ascii');
  offsets.forEach((offset, i) => idxt.writeUInt16BE(offset, 4 + i * 2));
  return Buffer.concat([head, ...blobs, idxt]);
}

/** A CNCX record: length-prefixed strings the entries point into. */
function cncxRecord(strings) {
  return Buffer.concat(strings.map((text) => {
    const bytes = Buffer.from(text, 'utf8');
    return Buffer.concat([varint(bytes.length), bytes]);
  }));
}

// ── A KF8 book ────────────────────────────────────────────
//
// One stream holding every part's frame followed by that part's pieces, plus the
// two tables that say how to thread them back together. Written the way the
// format writes them — the frames and the pieces interleaved, the insert
// positions measured in the part as it grows — so that a reader that gets any of
// it wrong produces visibly wrong text rather than nearly-right text.
function buildKf8Records({ compressed = false } = {}) {
  const parts = CHAPTERS.map((chapter, i) => {
    const frame = [
      '<html><head><title>',
      chapter.title,
      '</title></head><body>',
    ].join('');
    const pieces = [
      `<h1 aid="A${i}0">${chapter.title}</h1>`,
      ...chapter.body
        .filter((line) => !line.startsWith('<'))
        .map((line, n) => `<p aid="A${i}${n + 1}">${line}</p>`),
    ];
    // A link from the first chapter into the last, the way KF8 writes one.
    if (i === 0) pieces.push(`<p><a href="kindle:pos:fid:0002:off:0000000000">${chapter.title}</a></p>`);
    if (i === 1) pieces.push('<p><img src="kindle:embed:0001?mime=image/png" alt="그림"/></p>');
    return { frame, tail: '</body></html>', pieces };
  });

  // Flow 0: for each part, its frame then its pieces.
  const flow0 = [];
  const skeletons = [];
  const fragments = [];
  let at = 0;
  parts.forEach((part, index) => {
    const skeleton = Buffer.from(part.frame + part.tail, 'utf8');
    const start = at;
    flow0.push(skeleton);
    at += skeleton.length;

    // Each piece goes in just after <body>, after the pieces already threaded
    // in — which is how the positions are counted: in the part as it grows.
    let inside = Buffer.byteLength(part.frame, 'utf8');
    part.pieces.forEach((piece, n) => {
      const bytes = Buffer.from(piece, 'utf8');
      flow0.push(bytes);
      fragments.push({
        insertAt: start + inside,
        file: index,
        sequence: fragments.length,
        start: at,
        length: bytes.length,
        aid: `<span id="aid-A${index}${n}"/>`,
      });
      inside += bytes.length;
      at += bytes.length;
    });

    skeletons.push({
      name: `SKEL${String(index).padStart(10, '0')}`,
      fragments: part.pieces.length,
      start,
      length: skeleton.length,
    });
  });

  const flow0Bytes = Buffer.concat(flow0);
  // Flow 1: the stylesheet, which the reader skips — its being there is the
  // point, because flow 0 has to be found by the FDST table rather than assumed
  // to be the whole stream.
  const flow1Bytes = Buffer.from('body { margin: 1em; font-family: serif; }\n', 'utf8');
  const raw = Buffer.concat([flow0Bytes, flow1Bytes]);

  // ── The records ──
  const RECORD = 4096;
  const textRecords = [];
  for (let p = 0; p < raw.length; p += RECORD) {
    const chunk = raw.subarray(p, Math.min(p + RECORD, raw.length));
    textRecords.push(compressed ? palmDocCompress(chunk) : Buffer.from(chunk));
  }

  const fdst = Buffer.alloc(12 + 2 * 8);
  fdst.write('FDST', 0, 'ascii');
  fdst.writeUInt32BE(12, 0x04);
  fdst.writeUInt32BE(2, 0x08);
  fdst.writeUInt32BE(0, 12);
  fdst.writeUInt32BE(flow0Bytes.length, 16);
  fdst.writeUInt32BE(flow0Bytes.length, 20);
  fdst.writeUInt32BE(raw.length, 24);

  // Skeleton table: one value for the chunk count (tag 1) and two for where the
  // frame lives (tag 6).
  const skelTagx = tagxBlock(1, [[1, 1, 0x03, 0], [6, 2, 0x0c, 0], [0, 0, 0, 1]]);
  const skelEntries = indxEntries(skeletons.map((s) => ({
    name: s.name,
    control: 0x05,
    values: [s.fragments, s.start, s.length],
  })));
  const skelHead = indxHeader({
    entryRecords: 1, cncxRecords: 0, tagx: skelTagx, entries: skeletons.length,
  });

  // Fragment table: the CNCX offset of its id (2), which part it belongs to (3),
  // its sequence (4) and where the piece lives (6).
  const fragTagx = tagxBlock(1, [
    [2, 1, 0x01, 0], [3, 1, 0x02, 0], [4, 1, 0x04, 0], [6, 2, 0x08, 0], [0, 0, 0, 1],
  ]);
  const aids = [];
  let cncxAt = 0;
  const fragEntries = indxEntries(fragments.map((f) => {
    const offset = cncxAt;
    const bytes = Buffer.from(f.aid, 'utf8');
    cncxAt += varint(bytes.length).length + bytes.length;
    aids.push(f.aid);
    return {
      name: String(f.insertAt),
      control: 0x0f,
      values: [offset, f.file, f.sequence, f.start, f.length],
    };
  }));
  const fragHead = indxHeader({
    entryRecords: 1, cncxRecords: 1, tagx: fragTagx, entries: fragments.length,
  });
  const fragCncx = cncxRecord(aids);

  // A 1×1 PNG, which `kindle:embed:0001` points at.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
    'base64',
  );

  const after = 1 + textRecords.length;
  const layout = {
    fdst: after,
    skel: after + 1,
    frag: after + 3,
    resource: after + 6,
  };
  const tail = [fdst, skelHead, skelEntries, fragHead, fragEntries, fragCncx, png];

  return {
    raw,
    textRecords,
    tail,
    layout,
    parts: parts.length,
    fragments: fragments.length,
    compression: compressed ? 2 : 1,
  };
}

/** Record 0 of a KF8 part: PalmDOC header, MOBI 8 header, EXTH. */
function buildKf8Record0({ raw, textRecords, layout, compression, boundary }) {
  const title = Buffer.from('MyEBookReader AZW3 샘플', 'utf8');
  const exthEntries = [
    [100, Buffer.from('SHKWON', 'utf8')],
    [101, Buffer.from('TestSimulator', 'utf8')],
    [503, title],
  ];
  if (boundary != null) {
    const value = Buffer.alloc(4);
    value.writeUInt32BE(boundary, 0);
    exthEntries.push([121, value]);
  }
  const exthBody = Buffer.concat(exthEntries.map(([type, value]) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(type, 0);
    head.writeUInt32BE(8 + value.length, 4);
    return Buffer.concat([head, value]);
  }));
  const exth = Buffer.alloc(12);
  exth.write('EXTH', 0, 'ascii');
  exth.writeUInt32BE(12 + exthBody.length, 4);
  exth.writeUInt32BE(exthEntries.length, 8);

  // 264 bytes: long enough to carry the KF8 tables, which a MOBI 6 header is
  // not. That length is itself how a reader tells the two apart.
  const MOBI_HEADER = 264;
  const head = Buffer.alloc(16 + MOBI_HEADER);
  head.writeUInt16BE(compression, 0);
  head.writeUInt32BE(raw.length, 4);
  head.writeUInt16BE(textRecords.length, 8);
  head.writeUInt16BE(4096, 10);
  head.writeUInt16BE(0, 12);                    // no DRM
  head.write('MOBI', 16, 'ascii');
  head.writeUInt32BE(MOBI_HEADER, 20);
  head.writeUInt32BE(2, 24);                    // mobi type: book
  head.writeUInt32BE(65001, 28);                // UTF-8
  head.writeUInt32BE(8, 32);                    // unique id
  head.writeUInt32BE(8, 36);                    // file version: KF8
  head.writeUInt32BE(layout.resource, 108);     // first resource record
  head.writeUInt32BE(0, 112);                   // no HUFF record
  head.writeUInt32BE(0, 116);
  head.writeUInt32BE(0x40, 128);                // EXTH present
  head.writeUInt32BE(layout.fdst, 192);         // FDST record
  head.writeUInt32BE(2, 196);                   // flows
  head.writeUInt32BE(0, 240);                   // no extra record data
  head.writeUInt32BE(layout.frag, 248);         // fragment index
  head.writeUInt32BE(layout.skel, 252);         // skeleton index
  head.writeUInt32BE(16 + MOBI_HEADER + exth.length + exthBody.length, 84);
  head.writeUInt32BE(title.length, 88);
  head.writeUInt32BE(9, 92);                    // locale: ko

  return Buffer.concat([head, exth, exthBody, title, Buffer.alloc(2)]);
}

/** A KF8-only .azw3 — what Calibre writes, and newer Kindle files. */
function buildAzw3() {
  const built = buildKf8Records({ compressed: true });
  const record0 = buildKf8Record0(built);
  return buildPalmDb([record0, ...built.textRecords, ...built.tail]);
}

// ── A MOBI compressed the other way: HUFF/CDIC ────────────
//
// Dictionaries and a good many AZW files use compression 17480 — a Huffman code
// over a phrase dictionary — and a reader that cannot decode it can only refuse
// the book. Writing a real one here is what lets that decoder be tested.
//
// The tables below are the simplest ones the format allows that are still
// genuinely a Huffman code: 256 symbols, every code eight bits long and whole
// ("terminal"), and a dictionary of 256 one-byte phrases. Canonical Huffman then
// puts the largest code of length 8 at 255, and the decoder works out a phrase
// index of `255 - byte` — so phrase i is the byte `255 - i`, and the encoded
// stream comes out byte-for-byte the same as the plain text. That is the point:
// the bytes on disk are known, so a decoder that mishandles the bit window, the
// code lengths or the dictionary produces something visibly different.
function buildHuffTables() {
  const HEADER = 24;
  const dict1 = Buffer.alloc(256 * 4);
  for (let b = 0; b < 256; b += 1) {
    // codelen 8, terminal, and the largest code of that length — which is 255.
    dict1.writeUInt32BE((255 << 8) | 0x80 | 8, b * 4);
  }
  // mincode/maxcode per code length. Never consulted: every code above is whole
  // on its leading byte.
  const dict2 = Buffer.alloc(64 * 4);

  const huffHead = Buffer.alloc(HEADER);
  huffHead.write('HUFF', 0, 'ascii');
  huffHead.writeUInt32BE(HEADER, 4);
  huffHead.writeUInt32BE(HEADER, 8);                    // where dict1 starts
  huffHead.writeUInt32BE(HEADER + dict1.length, 12);    // where dict2 starts
  const huff = Buffer.concat([huffHead, dict1, dict2]);

  // The phrases. Phrase i is the single byte 255 - i, and each carries the flag
  // that says it is already plain rather than compressed in its turn.
  const count = 256;
  const offsets = Buffer.alloc(count * 2);
  const entries = [];
  let at = offsets.length;
  for (let i = 0; i < count; i += 1) {
    offsets.writeUInt16BE(at, i * 2);
    const entry = Buffer.alloc(3);
    entry.writeUInt16BE(0x8000 | 1, 0);                 // one byte, already plain
    entry[2] = 255 - i;
    entries.push(entry);
    at += entry.length;
  }
  const cdicHead = Buffer.alloc(16);
  cdicHead.write('CDIC', 0, 'ascii');
  cdicHead.writeUInt32BE(16, 4);
  cdicHead.writeUInt32BE(count, 8);
  cdicHead.writeUInt32BE(8, 12);                        // 1 << 8 phrases a record
  const cdic = Buffer.concat([cdicHead, offsets, ...entries]);

  return { huff, cdic };
}

/** A MOBI 6 book whose text is HUFF/CDIC compressed. */
function buildHuffMobi() {
  const html = `<html><head><guide></guide></head><body>${
    CHAPTERS.map((chapter, i) => `${i ? '<mbp:pagebreak/>' : ''}<h1>${chapter.title}</h1>${
      chapter.body.filter((line) => !line.startsWith('<')).map((line) => `<p>${line}</p>`).join('')
    }`).join('')
  }</body></html>`;

  const text = Buffer.from(html, 'utf8');
  const RECORD = 4096;
  const textRecords = [];
  for (let at = 0; at < text.length; at += RECORD) {
    // With the tables above, the coded bytes are the plain bytes.
    textRecords.push(Buffer.from(text.subarray(at, Math.min(at + RECORD, text.length))));
  }

  const { huff, cdic } = buildHuffTables();
  const huffAt = 1 + textRecords.length;

  const title = Buffer.from('MyEBookReader HUFF 샘플', 'utf8');
  const exthEntries = [
    [100, Buffer.from('SHKWON', 'utf8')],
    [503, title],
  ];
  const exthBody = Buffer.concat(exthEntries.map(([type, value]) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(type, 0);
    head.writeUInt32BE(8 + value.length, 4);
    return Buffer.concat([head, value]);
  }));
  const exth = Buffer.alloc(12);
  exth.write('EXTH', 0, 'ascii');
  exth.writeUInt32BE(12 + exthBody.length, 4);
  exth.writeUInt32BE(exthEntries.length, 8);

  const MOBI_HEADER = 232;
  const head = Buffer.alloc(16 + MOBI_HEADER);
  head.writeUInt16BE(17480, 0);                 // HUFF/CDIC
  head.writeUInt32BE(text.length, 4);
  head.writeUInt16BE(textRecords.length, 8);
  head.writeUInt16BE(4096, 10);
  head.writeUInt16BE(0, 12);                    // no DRM
  head.write('MOBI', 16, 'ascii');
  head.writeUInt32BE(MOBI_HEADER, 20);
  head.writeUInt32BE(2, 24);                    // mobi type: book
  head.writeUInt32BE(65001, 28);                // UTF-8
  head.writeUInt32BE(6, 32);
  head.writeUInt32BE(6, 36);                    // file version: MOBI 6
  head.writeUInt32BE(0, 108);                   // no images
  head.writeUInt32BE(huffAt, 112);              // the HUFF record
  head.writeUInt32BE(2, 116);                   // it and one CDIC
  head.writeUInt32BE(0x40, 128);                // EXTH present
  head.writeUInt32BE(16 + MOBI_HEADER + exth.length + exthBody.length, 84);
  head.writeUInt32BE(title.length, 88);
  head.writeUInt32BE(9, 92);                    // locale: ko

  const record0 = Buffer.concat([head, exth, exthBody, title, Buffer.alloc(2)]);
  return buildPalmDb([record0, ...textRecords, huff, cdic]);
}

/**
 * A file carrying both books at once — an old MOBI 6 one and a KF8 one — which
 * is the shape of most .azw3 files Amazon sells. EXTH 121 in the first record 0
 * says where the second book starts.
 */
function buildDualAzw3() {
  const mobi6 = buildMobiRecords();
  const kf8 = buildKf8Records({ compressed: true });

  // The KF8 half's own record numbers are counted from its own record 0, so its
  // record 0 can be built before knowing where in the file it will sit.
  const kf8Record0 = buildKf8Record0(kf8);
  const kf8Records = [kf8Record0, ...kf8.textRecords, ...kf8.tail];

  const boundary = 1 + mobi6.textRecords.length;
  const mobi6Record0 = buildMobiRecord0({ ...mobi6, boundary });
  return buildPalmDb([mobi6Record0, ...mobi6.textRecords, ...kf8Records]);
}

const FILES = [
  ['sample.epub', buildEpub],
  ['sample.azw3', buildAzw3],
  ['sample-dual.azw3', buildDualAzw3],
  ['sample-huff.mobi', buildHuffMobi],
  ['sample.png', buildPng],
  ['sample.tif', buildTiff],
  ['sample.dcm', buildDicom],
  ['sample.cbz', buildCbz],
  ['sample.fb2', buildFb2],
  ['sample.txt', buildText],
  ['sample.md', buildMarkdown],
  ['sample.html', buildHtml],
  ['sample.mobi', buildMobi],
  ['sample.pdf', buildPdf],
];

fs.mkdirSync(out, { recursive: true });
for (const [name, build] of FILES) {
  const data = build();
  fs.writeFileSync(path.join(out, name), data);
  console.log(`[samples] ${name} — ${data.length.toLocaleString()} bytes`);
}
console.log(`[samples] Wrote ${FILES.length} sample books to samples/`);
