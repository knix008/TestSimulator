/* global marked, TurndownService */

const editor = document.getElementById('editor');
const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced'
});

turndown.addRule('keepLineBreaks', {
  filter: 'br',
  replacement: () => '  \n'
});

function normalizeHtml(html) {
  if (!html || html.trim() === '') {
    return '<p><br></p>';
  }
  return html;
}

function injectHeadingIds(html) {
  let index = 0;
  return html.replace(/<h([1-6])([^>]*)>/gi, (_match, level, attrs) => {
    index += 1;
    const cleaned = attrs.replace(/\sid\s*=\s*(".*?"|'.*?'|[^\s>]+)/gi, '');
    return `<h${level}${cleaned} id="outline-heading-${index}">`;
  });
}

function setMarkdown(markdown) {
  const html = marked.parse(markdown || '', { breaks: true });
  editor.innerHTML = injectHeadingIds(normalizeHtml(html));
  notifyHeadingsChanged();
}

function getMarkdown() {
  return turndown.turndown(editor.innerHTML).trim();
}

function getTitleFromContent(fallback = '제목없음') {
  const heading = editor.querySelector('h1, h2, h3, h4, h5, h6');
  const text = heading?.textContent?.trim();
  return text || fallback;
}

function execCommand(command, value = null) {
  document.execCommand(command, false, value);
  editor.focus();
  notifyChanged();
  notifyHeadingsChanged();
}

function applyHeading(level) {
  execCommand('formatBlock', `h${level}`);
}

function wrapInlineCode() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return;
  }
  const range = selection.getRangeAt(0);
  const code = document.createElement('code');
  code.appendChild(range.extractContents());
  range.insertNode(code);
  notifyChanged();
}

function applyBlockquote() {
  execCommand('formatBlock', 'blockquote');
}

function insertHtml(html) {
  execCommand('insertHTML', html);
}

function insertTable(rows, cols) {
  let html = '<table><tbody>';
  for (let r = 0; r < rows; r += 1) {
    html += '<tr>';
    for (let c = 0; c < cols; c += 1) {
      html += r === 0 ? '<th>&nbsp;</th>' : '<td>&nbsp;</td>';
    }
    html += '</tr>';
  }
  html += '</tbody></table><p><br></p>';
  insertHtml(html);
}

function collectHeadings() {
  return [...editor.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((node) => ({
    id: node.id,
    level: Number(node.tagName.slice(1)),
    text: node.textContent?.trim() || ''
  }));
}

function notifyChanged() {
  window.parent.postMessage({ type: 'editor:changed' }, '*');
}

function notifyHeadingsChanged() {
  window.parent.postMessage({ type: 'editor:headings-changed', headings: collectHeadings() }, '*');
}

function scrollToHeading(id) {
  const target = editor.querySelector(`#${CSS.escape(id)}`);
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const range = document.createRange();
    range.selectNodeContents(target);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }
}

editor.addEventListener('input', () => {
  notifyChanged();
  notifyHeadingsChanged();
});

editor.addEventListener('keydown', (event) => {
  if (event.ctrlKey && event.key.toLowerCase() === 's') {
    event.preventDefault();
    window.parent.postMessage({ type: 'editor:save-requested' }, '*');
  }
  if (event.ctrlKey && event.key.toLowerCase() === 'b') {
    event.preventDefault();
    execCommand('bold');
  }
  if (event.ctrlKey && event.key.toLowerCase() === 'i') {
    event.preventDefault();
    execCommand('italic');
  }
});

window.addEventListener('message', (event) => {
  const message = event.data;
  if (!message || typeof message !== 'object') {
    return;
  }

  switch (message.type) {
    case 'editor:setMarkdown':
      setMarkdown(message.markdown || '');
      break;
    case 'editor:getMarkdown':
      window.parent.postMessage(
        {
          type: 'editor:markdown',
          requestId: message.requestId,
          markdown: getMarkdown(),
          title: getTitleFromContent(message.fallbackTitle)
        },
        '*'
      );
      break;
    case 'editor:getHeadings':
      window.parent.postMessage({
        type: 'editor:headings',
        requestId: message.requestId,
        headings: collectHeadings()
      });
      break;
    case 'editor:scrollToHeading':
      scrollToHeading(message.id);
      break;
    case 'editor:command':
      handleCommand(message);
      break;
    default:
      break;
  }
});

function handleCommand(message) {
  switch (message.command) {
    case 'heading':
      applyHeading(message.level || 1);
      break;
    case 'inlineCode':
      wrapInlineCode();
      break;
    case 'blockquote':
      applyBlockquote();
      break;
    case 'insertHtml':
      insertHtml(message.html || '');
      break;
    case 'horizontalRule':
      insertHtml('<hr/><p><br></p>');
      break;
    case 'codeBlock':
      insertHtml('<pre><code>code</code></pre><p><br></p>');
      break;
    case 'table':
      insertTable(message.rows || 3, message.cols || 3);
      break;
    default:
      execCommand(message.command);
      break;
  }
}

window.parent.postMessage({ type: 'editor:ready' }, '*');
