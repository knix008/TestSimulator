const fs = require('fs');
const path = require('path');
const HTMLtoDOCX = require('html-to-docx');

async function exportHtmlToDocx(html, outputPath) {
  const buffer = await HTMLtoDOCX(html, null, {
    table: { row: { cantSplit: true } },
    footer: false,
    header: false,
    pageNumber: false
  });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buffer);
}

module.exports = {
  exportHtmlToDocx
};
