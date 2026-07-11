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

if (!fs.existsSync(sourcePath)) {
  if (fs.existsSync(outputPath)) {
    console.warn('[extract-win-editor] WinV10 source not found; using bundled editor template.');
    process.exit(0);
  }
  throw new Error('WinV10 EditorHtmlBuilder.cs not found and no bundled win-editor-template.html exists.');
}

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
function inferDroppedFileName(file) {
  if (file && file.name) return file.name;
  var type = String(file && file.type || '').toLowerCase();
  var map = {
    'image/jpeg': 'image.jpg',
    'image/png': 'image.png',
    'image/gif': 'image.gif',
    'image/webp': 'image.webp',
    'image/avif': 'image.avif',
    'image/svg+xml': 'image.svg'
  };
  return map[type] || 'file.bin';
}
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
  postMessageWithAdditionalObjects: function(payload, objects) {
    var parsed;
    try {
      parsed = typeof payload === 'string' ? JSON.parse(payload) : (payload || {});
    } catch (e) {
      window.chrome.webview.postMessage(payload);
      return;
    }

    if (parsed.type === 'file-drop' && objects && objects.length) {
      var fileList = Array.prototype.slice.call(objects);
      var pending = fileList.length;
      var results = new Array(fileList.length);
      function isMarkdownDroppedFile(file) {
        var name = inferDroppedFileName(file).toLowerCase();
        return name.endsWith('.md') || name.endsWith('.markdown');
      }
      fileList.forEach(function(file, index) {
        var base = {
          fileName: inferDroppedFileName(file),
          path: file.path || ''
        };
        var reader = new FileReader();
        reader.onload = function() {
          if (isMarkdownDroppedFile(file)) {
            results[index] = Object.assign(base, { text: String(reader.result || '') });
          } else {
            results[index] = Object.assign(base, { dataUri: String(reader.result || '') });
          }
          pending -= 1;
          if (pending === 0) {
            parsed.files = results.filter(Boolean);
            window.chrome.webview.postMessage(JSON.stringify(parsed));
          }
        };
        reader.onerror = function() {
          pending -= 1;
          if (pending === 0) {
            parsed.files = results.filter(Boolean);
            window.chrome.webview.postMessage(JSON.stringify(parsed));
          }
        };
        if (isMarkdownDroppedFile(file)) {
          reader.readAsText(file);
        } else {
          reader.readAsDataURL(file);
        }
      });
      return;
    }

    window.chrome.webview.postMessage(payload);
  }
};
</script>`;

template = template.replace('<body>', `<body>\n${shim}`);

// WinV10 template calls finalizeImageSizes() inside applyThemeChrome, but that helper
// is only exposed on editorApi — not in the script closure scope.
template = template.replace(
  /clearStaleInlineColors\(\);\s*\n\s*finalizeImageSizes\(\);/g,
  'clearStaleInlineColors();\n                reapplyAllImageSizes();'
);

const WEB_ONLY_IMAGE_RESIZE_MARKER = 'beginImageResize';
const existingTemplate = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : '';
if (
  existingTemplate.includes(WEB_ONLY_IMAGE_RESIZE_MARKER)
  && !template.includes(WEB_ONLY_IMAGE_RESIZE_MARKER)
) {
  console.warn(
    '[extract-win-editor] Keeping bundled editor template; WinV10 source lacks web image resize support.'
  );
  process.exit(0);
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, template.trimStart(), 'utf8');
console.log(`Wrote ${outputPath} (${template.length} chars)`);
