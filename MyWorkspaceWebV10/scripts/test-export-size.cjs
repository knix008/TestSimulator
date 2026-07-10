const { buildExportHtml } = require('../src/main/export/htmlBuilder');
const { collapseEditorImageArtifacts, applyEditorImageSizesToMarkdown } = require('../src/main/export/markdownMaterializer');

const mdUnsized = '![photo](<page-asset:1/sample.png>)';
const mdSized = '![photo](<page-asset:1/sample.png> "editor-width:320 editor-height:180")';
const mdDataUnsized = '![photo](<data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==>)';

const editorHtml = [
  '<span class="editor-image-wrap is-sized" contenteditable="false" data-editor-width="320" data-loaded-size="1" style="width: 320px;">',
  '<img src="page-asset://1/sample.png" data-permanent-src="page-asset://1/sample.png" data-editor-width="320" width="320" alt="photo">',
  '<span class="editor-image-resize-handle" contenteditable="false"></span>',
  '</span>'
].join('');

const merged = applyEditorImageSizesToMarkdown(editorHtml, mdUnsized);
console.log('Merged from editor HTML:', merged);

const mergedData = applyEditorImageSizesToMarkdown(editorHtml, mdDataUnsized);
console.log('Merged data URI from editor HTML:', mergedData);

const mdDataSized = '![photo](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg== "editor-width:320 editor-height:180")';

for (const md of [mdUnsized, mdSized, mdDataSized, merged, mergedData]) {
  const html = buildExportHtml('Test', md, null, null);
  const m = html.match(/<img[^>]+>/);
  const em = html.match(/\[Image:/);
  console.log('MD:', md);
  console.log('IMG:', m ? m[0].slice(0, 220) : 'none');
  console.log('EM:', em ? 'placeholder' : 'none');
  const body = html.match(/<body>([\s\S]*)<\/body>/);
  console.log('BODY:', body ? body[1].trim().slice(0, 300) : 'none');
  console.log('---');
}

const collapsed = collapseEditorImageArtifacts(editorHtml + '\n\n' + mdUnsized);
console.log('Collapsed markdown:', collapsed);
