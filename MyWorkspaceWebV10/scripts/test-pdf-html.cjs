const { marked } = require('marked');
const { buildExportHtml } = require('../src/main/export/htmlBuilder');

const md = '# Test\n\n<img src="data:image/png;base64,abc" width="320" style="width:320px;height:auto;max-width:100%;display:block;">';
console.log('Marked output:\n', marked.parse(md));

const sizedMd = '![x](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg== "editor-width:320 editor-height:180")';
const html = buildExportHtml('T', sizedMd, null, null);
const img = html.match(/<img[^>]+>/);
console.log('\nExport img tag:\n', img ? img[0] : 'none');
console.log('\nCSS section:\n', html.match(/<style>([\s\S]*?)<\/style>/)?.[1]?.trim());
