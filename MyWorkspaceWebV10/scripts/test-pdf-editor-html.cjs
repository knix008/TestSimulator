const { buildExportHtml, buildExportBodyFromEditorHtml } = require('../src/main/export/htmlBuilder');

const editorHtml = [
  '<h1>Test Page</h1>',
  '<p>Hello</p>',
  '<span class="editor-image-wrap is-sized" contenteditable="false" data-editor-width="320" data-loaded-size="1" style="width: 320px;">',
  '<img src="page-asset://1/sample.png" data-permanent-src="page-asset://1/sample.png" data-editor-width="320" style="width: 100%; height: auto; max-width: none; display: block;" width="320" alt="photo">',
  '<span class="editor-image-resize-handle" contenteditable="false"></span>',
  '</span>'
].join('');

const body = buildExportBodyFromEditorHtml(editorHtml, null, null);
console.log('Editor HTML body:\n', body);

const full = buildExportHtml('Test Page', '', null, null, { editorHtml });
const img = full.match(/<img[^>]+>/);
console.log('\nFull export img:\n', img ? img[0] : 'none');
console.log('\nHas max-width:none:', /max-width:\s*none/i.test(full));
