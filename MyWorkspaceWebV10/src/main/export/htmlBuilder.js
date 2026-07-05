const { marked } = require('marked');
const { tryGetAssetBytes, guessContentType } = require('../services/pageAssetService');

marked.setOptions({ breaks: true, gfm: true });

function materializePageAssets(markdown, db, user, defaultPageId) {
  return String(markdown || '').replace(
    /page-asset:(\d+)\/([^\s)"']+)/gi,
    (match, pageIdText, fileNameRaw) => {
      const pageId = Number.parseInt(pageIdText, 10);
      const fileName = decodeURIComponent(fileNameRaw);
      const bytes = tryGetAssetBytes(db, user, pageId, fileName);
      if (!bytes) {
        return match;
      }
      const mime = guessContentType(fileName);
      return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
    }
  );
}

function ensureTitleHeading(title, markdown) {
  const trimmedTitle = (title || '').trim() || '제목없음';
  const body = String(markdown || '').trim();
  if (/^#\s/m.test(body)) {
    return body.replace(/^#\s+.*$/m, `# ${trimmedTitle}`);
  }
  return `# ${trimmedTitle}\n\n${body}`;
}

function markdownToHtml(markdown) {
  return marked.parse(markdown || '');
}

function buildExportHtml(title, markdown, db, user, pageId) {
  const prepared = materializePageAssets(ensureTitleHeading(title, markdown), db, user, pageId);
  const body = markdownToHtml(prepared);
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(title || 'MyWorkspace')}</title>
  <style>
    body {
      font-family: "Segoe UI", "Malgun Gothic", sans-serif;
      line-height: 1.6;
      color: #1f2328;
      padding: 24px;
      max-width: 900px;
      margin: 0 auto;
    }
    h1, h2, h3, h4, h5, h6 { margin-top: 1.2em; margin-bottom: 0.5em; }
    pre, code { font-family: Consolas, monospace; }
    pre { background: #f6f8fa; padding: 12px; overflow: auto; border-radius: 6px; }
    blockquote { border-left: 4px solid #d0d7de; margin: 0; padding-left: 12px; color: #57606a; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #d0d7de; padding: 6px 8px; }
    img { max-width: 100%; height: auto; }
    hr { border: 0; border-top: 1px solid #d0d7de; margin: 24px 0; }
  </style>
</head>
<body>${body}</body>
</html>`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = {
  materializePageAssets,
  ensureTitleHeading,
  markdownToHtml,
  buildExportHtml
};
