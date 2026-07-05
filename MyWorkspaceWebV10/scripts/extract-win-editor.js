const fs = require('fs');
const path = require('path');

const winRoot = path.resolve(__dirname, '..', '..', 'MyWorkspaceWinV10');
const sourcePath = path.join(
  winRoot,
  'src',
  'MyWorkspace.Win',
  'EditorHtmlBuilder.cs'
);
const outputPath = path.join(__dirname, '..', 'src', 'renderer', 'editor', 'win-editor-template.html');

const source = fs.readFileSync(sourcePath, 'utf8');
const startMarker = 'return $$"""';
const endMarker = '\n        """;';

const startIndex = source.indexOf(startMarker);
const endIndex = source.indexOf(endMarker, startIndex);
if (startIndex < 0 || endIndex < 0) {
  throw new Error('Could not locate editor HTML template in EditorHtmlBuilder.cs');
}

let template = source.slice(startIndex + startMarker.length, endIndex)
  .replaceAll('{{', '{')
  .replaceAll('}}', '}');

const TOKEN_VALUES = {
  lang: 'ko',
  colorScheme: 'light',
  bodyFontSize: '15',
  bg: '#F6F8FA',
  text: '#000000',
  caret: '#0969DA',
  placeholder: '#8C959F',
  focus: '#0969DA33',
  codeBg: '#E7EBF1',
  border: '#9AA3B0',
  borderLight: '#BAC1CB',
  surface: '#FFFFFF',
  accent: '#0969DA',
  muted: '#57606A',
  selection: '#0969DA33',
  PlaceholderToken: '내용을 입력하세요...',
  DefaultCodeToken: 'code',
  BodyPlaceholder: '/*EDITOR_BODY*/'
};

for (const [key, value] of Object.entries(TOKEN_VALUES)) {
  template = template.replaceAll(`{${key}}`, value);
}
const shim = `<script>
window.chrome = window.chrome || {};
window.chrome.webview = window.chrome.webview || {
  postMessage: function(payload) {
    if (typeof payload === 'string') {
      try {
        const parsed = JSON.parse(payload);
        window.parent.postMessage(Object.assign({ channel: 'editor-webview' }, parsed), '*');
      } catch {
        window.parent.postMessage({ channel: 'editor-webview', raw: payload }, '*');
      }
      return;
    }
    window.parent.postMessage(Object.assign({ channel: 'editor-webview' }, payload || {}), '*');
  },
  postMessageWithAdditionalObjects: function(payload, _objects) {
    window.chrome.webview.postMessage(payload);
  }
};
</script>`;

template = template.replace('<body>', `<body>\n${shim}`);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, template.trimStart(), 'utf8');
console.log(`Wrote ${outputPath} (${template.length} chars)`);
