const fs = require('fs');
const path = require('path');
const {
  Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel, AlignmentType,
} = require('docx');
const PDFDocument = require('pdfkit');

const LABELS = {
  ko: {
    reportTitle: '프로젝트 요약 리포트',
    generatedAt: '생성일시',
    projectStart: '프로젝트 시작일',
    overview: '개요',
    totalCards: '전체 카드',
    completedCards: '완료',
    overdueCards: '기한 초과',
    completionRate: '완료율',
    columnDist: '컬럼별 카드 분포',
    burndownChart: '번다운 차트',
    column: '컬럼',
    count: '개수',
    cards: '카드',
  },
  en: {
    reportTitle: 'Project Summary Report',
    generatedAt: 'Generated at',
    projectStart: 'Project start',
    overview: 'Overview',
    totalCards: 'Total cards',
    completedCards: 'Completed',
    overdueCards: 'Overdue',
    completionRate: 'Completion rate',
    columnDist: 'Cards by column',
    burndownChart: 'Burndown chart',
    column: 'Column',
    count: 'Count',
    cards: 'cards',
  },
};

function t(lang) {
  return LABELS[lang] || LABELS.en;
}

function decodeImage(dataUrlOrBase64) {
  if (!dataUrlOrBase64) return null;
  const b64 = String(dataUrlOrBase64).includes(',')
    ? String(dataUrlOrBase64).split(',')[1]
    : String(dataUrlOrBase64);
  try {
    return Buffer.from(b64, 'base64');
  } catch {
    return null;
  }
}

function completionRate(data) {
  return data.totalCards > 0 ? Math.round((data.completedCards / data.totalCards) * 100) : 0;
}

function formatDateTime(lang) {
  const loc = lang === 'ko' ? 'ko-KR' : 'en-US';
  return new Date().toLocaleString(loc, { dateStyle: 'medium', timeStyle: 'short' });
}

function formatProjectStart(dateKey, lang) {
  if (!dateKey) return '-';
  const loc = lang === 'ko' ? 'ko-KR' : 'en-US';
  return new Date(dateKey + 'T12:00:00').toLocaleDateString(loc, { year: 'numeric', month: 'short', day: 'numeric' });
}

function safeFilename(title) {
  return (title || 'project').replace(/[<>:"/\\|?*]/g, '_').trim() || 'project';
}

function getReportFilename(title, format) {
  const base = safeFilename(title);
  const ext = { md: 'md', docx: 'docx', pdf: 'pdf' }[format] || 'bin';
  const stamp = new Date().toISOString().slice(0, 10);
  return `${base}-report-${stamp}.${ext}`;
}

function buildMarkdown(data, images, lang) {
  const labels = t(lang);
  const rate = completionRate(data);
  const lines = [
    `# ${data.boardTitle || 'MyKanban'}`,
    `## ${labels.reportTitle}`,
    '',
    `- **${labels.generatedAt}**: ${formatDateTime(lang)}`,
    `- **${labels.projectStart}**: ${formatProjectStart(data.projectStartDate, lang)}`,
    '',
    `## ${labels.overview}`,
    '',
    `| ${labels.totalCards} | ${labels.completedCards} | ${labels.overdueCards} | ${labels.completionRate} |`,
    '| ---: | ---: | ---: | ---: |',
    `| ${data.totalCards} | ${data.completedCards} | ${data.overdueCards} | ${rate}% |`,
    '',
    `## ${labels.columnDist}`,
    '',
    `| ${labels.column} | ${labels.count} |`,
    '| --- | ---: |',
  ];

  (data.columns || []).forEach(col => {
    lines.push(`| ${col.title} | ${col.count} |`);
  });

  if (images?.columnDist) {
    lines.push('', `![${labels.columnDist}](${images.columnDist.startsWith('data:') ? images.columnDist : `data:image/png;base64,${images.columnDist}`})`, '');
  }

  lines.push(`## ${labels.burndownChart}`, '');
  if (images?.burndown) {
    lines.push(`![${labels.burndownChart}](${images.burndown.startsWith('data:') ? images.burndown : `data:image/png;base64,${images.burndown}`})`, '');
  } else {
    lines.push(`_${labels.burndownChart}_`, '');
  }

  lines.push('---', '', '*MyKanban*', '');
  return lines.join('\n');
}

function imageParagraph(buffer, width = 520, height = 300) {
  if (!buffer) return null;
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new ImageRun({
      data: buffer,
      type: 'png',
      transformation: { width, height },
    })],
    spacing: { after: 240 },
  });
}

async function buildDocx(data, images, lang) {
  const labels = t(lang);
  const rate = completionRate(data);
  const columnDistBuf = decodeImage(images?.columnDist);
  const burndownBuf = decodeImage(images?.burndown);

  const children = [
    new Paragraph({ text: data.boardTitle || 'MyKanban', heading: HeadingLevel.TITLE }),
    new Paragraph({ text: labels.reportTitle, heading: HeadingLevel.HEADING_1 }),
    new Paragraph({
      children: [
        new TextRun({ text: `${labels.generatedAt}: `, bold: true }),
        new TextRun(formatDateTime(lang)),
      ],
      spacing: { after: 120 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: `${labels.projectStart}: `, bold: true }),
        new TextRun(formatProjectStart(data.projectStartDate, lang)),
      ],
      spacing: { after: 240 },
    }),
    new Paragraph({ text: labels.overview, heading: HeadingLevel.HEADING_2 }),
    new Paragraph({ text: `${labels.totalCards}: ${data.totalCards}` }),
    new Paragraph({ text: `${labels.completedCards}: ${data.completedCards}` }),
    new Paragraph({ text: `${labels.overdueCards}: ${data.overdueCards}` }),
    new Paragraph({ text: `${labels.completionRate}: ${rate}%`, spacing: { after: 240 } }),
    new Paragraph({ text: labels.columnDist, heading: HeadingLevel.HEADING_2 }),
  ];

  (data.columns || []).forEach(col => {
    children.push(new Paragraph({ text: `• ${col.title}: ${col.count} ${labels.cards}` }));
  });

  const colImg = imageParagraph(columnDistBuf, 520, 220);
  if (colImg) children.push(colImg);

  children.push(new Paragraph({ text: labels.burndownChart, heading: HeadingLevel.HEADING_2 }));
  const burnImg = imageParagraph(burndownBuf, 520, 300);
  if (burnImg) children.push(burnImg);

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

function resolvePdfFont() {
  const candidates = [
    process.platform === 'win32' ? 'C:/Windows/Fonts/malgun.ttf' : null,
    process.platform === 'win32' ? 'C:/Windows/Fonts/malgunbd.ttf' : null,
    process.platform === 'darwin' ? '/System/Library/Fonts/Supplemental/AppleGothic.ttf' : null,
    '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function buildPdf(data, images, lang) {
  const labels = t(lang);
  const rate = completionRate(data);
  const columnDistBuf = decodeImage(images?.columnDist);
  const burndownBuf = decodeImage(images?.burndown);
  const fontPath = resolvePdfFont();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    if (fontPath) doc.font(fontPath);
    else doc.font('Helvetica');

    doc.fontSize(20).text(data.boardTitle || 'MyKanban', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(14).text(labels.reportTitle, { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).text(`${labels.generatedAt}: ${formatDateTime(lang)}`);
    doc.text(`${labels.projectStart}: ${formatProjectStart(data.projectStartDate, lang)}`);
    doc.moveDown();

    doc.fontSize(13).text(labels.overview, { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(11);
    doc.text(`${labels.totalCards}: ${data.totalCards}`);
    doc.text(`${labels.completedCards}: ${data.completedCards}`);
    doc.text(`${labels.overdueCards}: ${data.overdueCards}`);
    doc.text(`${labels.completionRate}: ${rate}%`);
    doc.moveDown();

    doc.fontSize(13).text(labels.columnDist, { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(11);
    (data.columns || []).forEach(col => {
      doc.text(`• ${col.title}: ${col.count} ${labels.cards}`);
    });
    doc.moveDown(0.5);

    if (columnDistBuf) {
      try {
        doc.image(columnDistBuf, { fit: [500, 200], align: 'center' });
        doc.moveDown();
      } catch {}
    }

    doc.fontSize(13).text(labels.burndownChart, { underline: true });
    doc.moveDown(0.5);
    if (burndownBuf) {
      try {
        doc.image(burndownBuf, { fit: [500, 280], align: 'center' });
      } catch {}
    }

    doc.end();
  });
}

async function buildReport(format, data, images, lang) {
  if (format === 'md') {
    const content = buildMarkdown(data, images, lang);
    return { buffer: Buffer.from(content, 'utf8'), mime: 'text/markdown;charset=utf-8' };
  }
  if (format === 'docx') {
    const buffer = await buildDocx(data, images, lang);
    return {
      buffer,
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
  }
  if (format === 'pdf') {
    const buffer = await buildPdf(data, images, lang);
    return { buffer, mime: 'application/pdf' };
  }
  throw new Error(`Unsupported format: ${format}`);
}

module.exports = {
  buildReport,
  buildMarkdown,
  getReportFilename,
};
