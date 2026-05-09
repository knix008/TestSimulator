(() => {
  'use strict';

  // ===== DOM 요소 =====
  const editor = document.getElementById('editor');
  const preview = document.getElementById('preview');
  const outline = document.getElementById('outline');
  const wordCount = document.getElementById('word-count');
  const filenameEl = document.getElementById('filename');
  const fileInput = document.getElementById('file-input');
  const workspace = document.querySelector('.workspace');
  const docsList = document.getElementById('docs-list');

  const STORAGE_KEY = 'easymd:doc';
  const THEME_KEY = 'easymd:theme';
  const API_BASE = '/api/documents';

  let currentFilename = 'untitled.md';
  let outlineHeadings = [];
  let activeServerDoc = null;

  // ===== 초기 샘플 문서 =====
  const SAMPLE = `# EasyMD에 오신 것을 환영합니다 👋

EasyMD는 **웹 기반 Markdown 편집기**입니다. 왼쪽에서 편집하면 오른쪽에 _실시간_ 으로 결과가 표시됩니다.

## 주요 기능

- 실시간 미리보기
- 문서 열기 / 다운로드
- 사이드바에 문서 구조(목차) 표시
- 마우스 클릭으로 사용 가능한 Markdown 도구

### 빠른 시작

1. 위쪽 툴바에서 원하는 버튼을 누르거나
2. 직접 Markdown을 입력하세요.
3. 작업이 끝나면 **저장** 버튼으로 \`.md\` 파일을 받을 수 있습니다.

> 💡 *팁:* 텍스트를 선택한 뒤 툴바 버튼을 누르면 선택 영역에 서식이 적용됩니다.

#### 코드 예시

\`\`\`javascript
function greet(name) {
  return \`Hello, \${name}!\`;
}
console.log(greet('EasyMD'));
\`\`\`

#### 표

| 기능 | 단축키 | 설명 |
|------|--------|------|
| 새 문서 | Ctrl+N | 편집기를 비웁니다 |
| 열기 | Ctrl+O | \`.md\` 파일 업로드 |
| 저장 | Ctrl+S | 현재 문서 다운로드 |

#### 체크리스트

- [x] 라이트/다크 테마
- [x] 사이드바 목차
- [ ] 추가 기능 직접 만들어보기

---

즐거운 글쓰기 되세요!
`;

  // ===== Marked 설정 =====
  marked.setOptions({
    breaks: true,
    gfm: true,
    headerIds: true,
    mangle: false,
    highlight: (code, lang) => {
      if (window.hljs) {
        try {
          if (lang && hljs.getLanguage(lang)) {
            return hljs.highlight(code, { language: lang }).value;
          }
          return hljs.highlightAuto(code).value;
        } catch (_) {}
      }
      return code;
    },
  });

  // 헤딩 ID(슬러그) 생성기 - 한글/영문 지원
  const slugCounts = {};
  function slugify(text) {
    let s = String(text)
      .toLowerCase()
      .trim()
      .replace(/[\s]+/g, '-')
      .replace(/[^\p{L}\p{N}\-_]/gu, '');
    if (!s) s = 'section';
    if (slugCounts[s] != null) {
      slugCounts[s] += 1;
      return `${s}-${slugCounts[s]}`;
    }
    slugCounts[s] = 0;
    return s;
  }

  // ===== 렌더링 =====
  function render() {
    const md = editor.value;

    for (const k in slugCounts) delete slugCounts[k];

    const renderer = new marked.Renderer();
    outlineHeadings = [];

    renderer.heading = (text, level, raw) => {
      const id = slugify(raw);
      outlineHeadings.push({ id, level, text: raw });
      return `<h${level} id="${id}">${text}</h${level}>`;
    };

    const rawHtml = marked.parse(md, { renderer });
    const safe = window.DOMPurify
      ? DOMPurify.sanitize(rawHtml, { ADD_ATTR: ['id', 'class'] })
      : rawHtml;

    preview.innerHTML = safe;

    if (window.hljs) {
      preview.querySelectorAll('pre code').forEach((el) => {
        try { hljs.highlightElement(el); } catch (_) {}
      });
    }

    updateOutline();
    updateWordCount(md);
    saveDraft(md);
  }

  function updateWordCount(md) {
    const words = (md.trim().match(/[^\s]+/g) || []).length;
    const chars = md.length;
    wordCount.textContent = `${words.toLocaleString()} 단어 · ${chars.toLocaleString()} 자`;
  }

  // ===== 사이드바: 문서 구조 =====
  function updateOutline() {
    if (!outlineHeadings.length) {
      outline.innerHTML =
        '<p class="outline-empty">문서에 제목(<code>#</code>)을 추가하면<br />여기에 목차가 나타납니다.</p>';
      return;
    }
    
    // 각 헤딩의 에디터 내 위치(문자 인덱스) 찾기
    const editorText = editor.value;
    const headingsWithPosition = outlineHeadings.map((h) => {
      // 헤딩 텍스트에 맞는 정규식 패턴 생성 (# 개수 + 공백 + 텍스트)
      const escapedText = h.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(`^#{${h.level}}\\s+${escapedText}`, 'm');
      const match = editorText.match(pattern);
      const position = match ? editorText.indexOf(match[0]) : -1;
      return { ...h, position };
    });
    
    const html = headingsWithPosition
      .map(
        (h) => `
      <div class="outline-item lvl-${h.level}" data-id="${h.id}" data-position="${h.position}" title="${escapeAttr(h.text)}">
        <span class="level-icon">H${h.level}</span>
        <span class="text">${escapeHtml(h.text)}</span>
      </div>`
      )
      .join('');
    outline.innerHTML = html;

    outline.querySelectorAll('.outline-item').forEach((item) => {
      item.addEventListener('click', () => {
        const id = item.getAttribute('data-id');
        const position = parseInt(item.getAttribute('data-position'), 10);
        
        // 미리보기 스크롤
        const target = preview.querySelector(`#${CSS.escape(id)}`);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        
        // 에디터 커서 이동
        if (position >= 0) {
          editor.focus();
          editor.setSelectionRange(position, position);
          // 에디터 스크롤 (커서가 보이도록)
          scrollEditorToPosition(position);
        }
        
        // 활성 상태 표시
        outline.querySelectorAll('.outline-item').forEach((i) => i.classList.remove('active'));
        item.classList.add('active');
      });
    });
  }
  
  // 에디터의 특정 위치가 보이도록 스크롤
  function scrollEditorToPosition(position) {
    const text = editor.value;
    const beforeCursor = text.substring(0, position);
    const lineNumber = beforeCursor.split('\n').length;
    
    // textarea의 전체 줄 수 계산
    const totalLines = text.split('\n').length;
    const lineHeight = parseInt(getComputedStyle(editor).lineHeight, 10) || 20;
    const editorHeight = editor.clientHeight;
    
    // 대략적인 스크롤 위치 계산 (줄 번호 기반)
    const scrollPosition = Math.max(0, (lineNumber - 3) * lineHeight);
    editor.scrollTop = scrollPosition;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, '&quot;');
  }

  // ===== 에디터 텍스트 조작 헬퍼 =====
  function getSelection() {
    return {
      start: editor.selectionStart,
      end: editor.selectionEnd,
      value: editor.value,
    };
  }

  function applyReplacement(newText, selStart, selEnd) {
    editor.focus();
    editor.setRangeText(newText, selStart, selEnd, 'end');
    render();
  }

  function wrapSelection(prefix, suffix = prefix, placeholder = '') {
    const { start, end, value } = getSelection();
    const selected = value.slice(start, end) || placeholder;
    const replacement = `${prefix}${selected}${suffix}`;
    editor.focus();
    editor.setRangeText(replacement, start, end, 'select');
    if (!value.slice(start, end)) {
      const cursor = start + prefix.length;
      editor.setSelectionRange(cursor, cursor + placeholder.length);
    }
    render();
  }

  function prefixLines(prefixFn, placeholder = '') {
    const { start, end, value } = getSelection();
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    let lineEnd = value.indexOf('\n', end);
    if (lineEnd === -1) lineEnd = value.length;

    const block = value.slice(lineStart, lineEnd) || placeholder;
    const lines = block.split('\n');
    const newBlock = lines
      .map((line, i) => prefixFn(line, i))
      .join('\n');

    editor.focus();
    editor.setRangeText(newBlock, lineStart, lineEnd, 'select');
    render();
  }

  function insertAtCursor(text) {
    const { start, end } = getSelection();
    editor.focus();
    editor.setRangeText(text, start, end, 'end');
    render();
  }

  // ===== 툴바 액션 =====
  const actions = {
    h1: () => prefixLines((l) => `# ${l.replace(/^#+\s*/, '')}`, '제목'),
    h2: () => prefixLines((l) => `## ${l.replace(/^#+\s*/, '')}`, '제목'),
    h3: () => prefixLines((l) => `### ${l.replace(/^#+\s*/, '')}`, '제목'),
    bold: () => wrapSelection('**', '**', '굵은 글씨'),
    italic: () => wrapSelection('*', '*', '기울임 글씨'),
    strike: () => wrapSelection('~~', '~~', '취소선'),
    link: () => {
      const { start, end, value } = getSelection();
      const selected = value.slice(start, end) || '링크 텍스트';
      const url = window.prompt('링크 URL을 입력하세요', 'https://');
      if (url == null) return;
      applyReplacement(`[${selected}](${url})`, start, end);
    },
    image: () => {
      const { start, end, value } = getSelection();
      const alt = value.slice(start, end) || '이미지 설명';
      const url = window.prompt('이미지 URL을 입력하세요', 'https://');
      if (url == null) return;
      applyReplacement(`![${alt}](${url})`, start, end);
    },
    code: () => wrapSelection('`', '`', 'code'),
    codeblock: () => {
      const { start, end, value } = getSelection();
      const selected = value.slice(start, end) || '코드를 입력하세요';
      const block = `\n\`\`\`\n${selected}\n\`\`\`\n`;
      applyReplacement(block, start, end);
    },
    quote: () => prefixLines((l) => `> ${l.replace(/^>\s*/, '')}`, '인용문'),
    ul: () => prefixLines((l) => `- ${l.replace(/^[-*+]\s*/, '')}`, '항목'),
    ol: () => prefixLines((l, i) => `${i + 1}. ${l.replace(/^\d+\.\s*/, '')}`, '항목'),
    task: () => prefixLines((l) => `- [ ] ${l.replace(/^[-*+]\s*(\[[ xX]\])?\s*/, '')}`, '할 일'),
    hr: () => insertAtCursor('\n\n---\n\n'),
    table: () => {
      const tbl = `\n| 열1 | 열2 | 열3 |\n| --- | --- | --- |\n| A | B | C |\n| D | E | F |\n`;
      insertAtCursor(tbl);
    },
  };

  document.querySelectorAll('.tool-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (actions[action]) actions[action]();
    });
  });

  // ===== 메뉴 액션 =====
  document.getElementById('btn-new').addEventListener('click', () => {
    if (editor.value.trim() && !confirm('현재 문서를 비우시겠습니까? 저장되지 않은 내용은 사라집니다.')) {
      return;
    }
    editor.value = '';
    currentFilename = 'untitled.md';
    activeServerDoc = null;
    filenameEl.textContent = currentFilename;
    render();
    refreshDocsList();
    editor.focus();
  });

  document.getElementById('btn-open').addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      editor.value = String(reader.result || '');
      currentFilename = file.name;
      activeServerDoc = null;
      filenameEl.textContent = currentFilename;
      render();
    };
    reader.readAsText(file, 'utf-8');
    fileInput.value = '';
  });

  document.getElementById('btn-save').addEventListener('click', () => {
    const text = editor.value;
    let name = currentFilename || 'untitled.md';
    name = window.prompt('저장할 파일 이름을 입력하세요', name);
    if (!name) return;
    if (!/\.(md|markdown|txt)$/i.test(name)) name += '.md';
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    currentFilename = name;
    filenameEl.textContent = currentFilename;
  });

  document.getElementById('btn-toggle-sidebar').addEventListener('click', () => {
    workspace.classList.toggle('no-sidebar');
  });
  document.getElementById('btn-toggle-preview').addEventListener('click', () => {
    workspace.classList.toggle('no-preview');
  });

  // ===== 사이드바 섹션 접기/펼치기 =====
  const SECTION_KEY = 'easymd:collapsed-sections';
  const collapsedSections = new Set();
  try {
    const raw = localStorage.getItem(SECTION_KEY);
    if (raw) JSON.parse(raw).forEach((id) => collapsedSections.add(id));
  } catch (_) {}

  document.querySelectorAll('.sidebar-section').forEach((section) => {
    const id = section.dataset.section;
    const header = section.querySelector('.sidebar-header');
    if (!id || !header) return;

    if (collapsedSections.has(id)) {
      section.classList.add('collapsed');
      header.setAttribute('aria-expanded', 'false');
    }

    header.addEventListener('click', (e) => {
      // 헤더 안의 다른 버튼(예: 새로고침) 클릭은 토글에서 제외
      if (e.target.closest('.icon-btn')) return;
      const collapsed = section.classList.toggle('collapsed');
      header.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      if (collapsed) collapsedSections.add(id);
      else collapsedSections.delete(id);
      try {
        localStorage.setItem(SECTION_KEY, JSON.stringify([...collapsedSections]));
      } catch (_) {}
    });
  });

  // ===== 서버 API 연동 =====
  async function apiListDocs() {
    const res = await fetch(API_BASE, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(await readError(res));
    const data = await res.json();
    return data.documents || [];
  }

  async function apiReadDoc(name) {
    const res = await fetch(`${API_BASE}/${encodeURIComponent(name)}`);
    if (!res.ok) throw new Error(await readError(res));
    return res.json();
  }

  async function apiSaveDoc(name, content) {
    const res = await fetch(`${API_BASE}/${encodeURIComponent(name)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
      body: content,
    });
    if (!res.ok) throw new Error(await readError(res));
    return res.json();
  }

  async function apiDeleteDoc(name) {
    const res = await fetch(`${API_BASE}/${encodeURIComponent(name)}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await readError(res));
    return res.json();
  }

  async function readError(res) {
    try {
      const data = await res.json();
      return data.error || `요청 실패 (${res.status})`;
    } catch (_) {
      return `요청 실패 (${res.status})`;
    }
  }

  function isServerAvailable() {
    return location.protocol === 'http:' || location.protocol === 'https:';
  }

  function formatBytes(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  }

  function formatDate(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day} ${h}:${min}`;
  }

  async function refreshDocsList() {
    if (!docsList) return;

    if (!isServerAvailable()) {
      docsList.innerHTML =
        '<p class="outline-empty">정적 파일로 열려 있어<br />서버 기능을 사용할 수 없습니다.<br />' +
        '<code>npm start</code> 후 접속하세요.</p>';
      return;
    }

    docsList.innerHTML = '<p class="outline-empty">불러오는 중...</p>';
    try {
      const docs = await apiListDocs();
      if (!docs.length) {
        docsList.innerHTML =
          '<p class="outline-empty">아직 저장된 문서가 없습니다.<br />위쪽 <b>서버 저장</b> 버튼을 눌러보세요.</p>';
        return;
      }
      docsList.innerHTML = docs
        .map(
          (d) => `
        <div class="doc-item${d.name === activeServerDoc ? ' active' : ''}" data-name="${escapeAttr(d.name)}" title="${escapeAttr(d.name)}">
          <svg class="doc-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="9" y1="13" x2="15" y2="13" />
            <line x1="9" y1="17" x2="15" y2="17" />
          </svg>
          <div class="doc-meta">
            <div class="doc-name">${escapeHtml(d.name)}</div>
            <div class="doc-sub">${formatDate(d.modifiedAt)} · ${formatBytes(d.size)}</div>
          </div>
          <button class="doc-del" title="삭제" data-name="${escapeAttr(d.name)}" aria-label="삭제">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>`
        )
        .join('');

      docsList.querySelectorAll('.doc-item').forEach((item) => {
        item.addEventListener('click', async (e) => {
          if (e.target.closest('.doc-del')) return;
          const name = item.dataset.name;
          await openServerDoc(name);
        });
      });
      docsList.querySelectorAll('.doc-del').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const name = btn.dataset.name;
          if (!confirm(`"${name}" 파일을 서버에서 삭제할까요?`)) return;
          try {
            await apiDeleteDoc(name);
            if (activeServerDoc === name) activeServerDoc = null;
            await refreshDocsList();
          } catch (err) {
            alert(`삭제 실패: ${err.message}`);
          }
        });
      });
    } catch (err) {
      docsList.innerHTML = `<p class="outline-empty">목록을 불러오지 못했습니다.<br /><small>${escapeHtml(err.message)}</small></p>`;
    }
  }

  async function openServerDoc(name) {
    if (
      editor.value.trim() &&
      activeServerDoc !== name &&
      !confirm(`"${name}" 파일을 불러오시겠습니까? 현재 내용은 사라집니다.`)
    ) {
      return;
    }
    try {
      const data = await apiReadDoc(name);
      editor.value = data.content;
      currentFilename = data.name;
      activeServerDoc = data.name;
      filenameEl.textContent = `${currentFilename}  (서버)`;
      render();
      refreshDocsList();
    } catch (err) {
      alert(`불러오기 실패: ${err.message}`);
    }
  }

  async function saveToServer() {
    if (!isServerAvailable()) {
      alert('서버 기능은 npm start 로 실행한 뒤 사용할 수 있습니다.');
      return;
    }
    let name = window.prompt(
      '서버에 저장할 파일 이름 (.md / .markdown / .txt)',
      currentFilename || 'untitled.md'
    );
    if (!name) return;
    name = name.trim();
    if (!/\.(md|markdown|txt)$/i.test(name)) name += '.md';
    try {
      const result = await apiSaveDoc(name, editor.value);
      currentFilename = result.name;
      activeServerDoc = result.name;
      filenameEl.textContent = `${currentFilename}  (서버)`;
      await refreshDocsList();
    } catch (err) {
      alert(`저장 실패: ${err.message}`);
    }
  }

  document.getElementById('btn-save-server').addEventListener('click', saveToServer);

  const refreshDocsBtn = document.getElementById('btn-refresh-docs');
  refreshDocsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    refreshDocsList();
  });
  refreshDocsBtn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      refreshDocsList();
    }
  });

  // ===== 테마 =====
  const themeBtn = document.getElementById('btn-theme');
  const themeLabel = document.getElementById('label-theme');
  const themeIcon = document.getElementById('icon-theme');
  const hljsLight = document.getElementById('hljs-theme-light');
  const hljsDark = document.getElementById('hljs-theme-dark');

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'dark') {
      hljsLight.disabled = true;
      hljsDark.disabled = false;
      themeLabel.textContent = '라이트 모드';
      themeIcon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />';
    } else {
      hljsLight.disabled = false;
      hljsDark.disabled = true;
      themeLabel.textContent = '다크 모드';
      themeIcon.innerHTML =
        '<circle cx="12" cy="12" r="4" />' +
        '<path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />';
    }
    try { localStorage.setItem(THEME_KEY, theme); } catch (_) {}
  }

  themeBtn.addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(cur === 'light' ? 'dark' : 'light');
  });

  // ===== 단축키 =====
  document.addEventListener('keydown', (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (!ctrl) return;
    const key = e.key.toLowerCase();
    if (key === 's' && e.shiftKey) { e.preventDefault(); saveToServer(); }
    else if (key === 's') { e.preventDefault(); document.getElementById('btn-save').click(); }
    else if (key === 'o') { e.preventDefault(); document.getElementById('btn-open').click(); }
    else if (key === 'n') { e.preventDefault(); document.getElementById('btn-new').click(); }
    else if (key === 'b') { e.preventDefault(); actions.bold(); }
    else if (key === 'i' && !e.shiftKey) { e.preventDefault(); actions.italic(); }
  });

  // 탭 키로 들여쓰기
  editor.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const { start, end } = getSelection();
      editor.setRangeText('  ', start, end, 'end');
      render();
    }
  });

  // ===== 자동 저장 (localStorage) =====
  let saveTimer = null;
  function saveDraft(md) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, md); } catch (_) {}
    }, 400);
  }

  function loadDraft() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (_) {
      return null;
    }
  }

  // ===== 입력 이벤트 =====
  editor.addEventListener('input', render);

  // ===== 리사이저: 편집기/미리보기 폭 조절 =====
  const resizer = document.getElementById('resizer');
  const editorPane = document.querySelector('.editor-pane');
  const previewPane = document.querySelector('.preview-pane');
  const sidebarResizer = document.getElementById('sidebar-resizer');
  const sidebar = document.querySelector('.sidebar');
  
  let isResizing = false;
  let isResizingSidebar = false;
  
  // 편집기/미리보기 리사이저
  resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });
  
  // 사이드바 리사이저
  sidebarResizer.addEventListener('mousedown', (e) => {
    isResizingSidebar = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });
  
  document.addEventListener('mousemove', (e) => {
    if (isResizing) {
      const workspaceRect = workspace.getBoundingClientRect();
      const sidebarWidth = workspace.classList.contains('no-sidebar') ? 0 : 
        sidebar.getBoundingClientRect().width + sidebarResizer.offsetWidth;
      
      // 마우스 위치에서 사이드바 너비를 빼서 에디터+미리보기 영역 내 상대 위치 계산
      const relativeX = e.clientX - workspaceRect.left - sidebarWidth;
      const totalWidth = workspaceRect.width - sidebarWidth - resizer.offsetWidth;
      
      // 최소/최대 너비 제한 (20% ~ 80%)
      const minWidth = totalWidth * 0.2;
      const maxWidth = totalWidth * 0.8;
      const editorWidth = Math.max(minWidth, Math.min(maxWidth, relativeX));
      
      // flex-basis를 픽셀 값으로 설정
      editorPane.style.flexBasis = `${editorWidth}px`;
      previewPane.style.flexBasis = `${totalWidth - editorWidth}px`;
    }
    
    if (isResizingSidebar) {
      const workspaceRect = workspace.getBoundingClientRect();
      const newWidth = e.clientX - workspaceRect.left;
      
      // 사이드바 최소/최대 너비 제한 (150px ~ 600px)
      const minWidth = 150;
      const maxWidth = Math.min(600, workspaceRect.width * 0.4); // 최대 40%
      const sidebarWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
      
      sidebar.style.width = `${sidebarWidth}px`;
    }
  });
  
  document.addEventListener('mouseup', () => {
    if (isResizing || isResizingSidebar) {
      isResizing = false;
      isResizingSidebar = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });

  // ===== 초기화 =====
  (function init() {
    const savedTheme = (() => {
      try { return localStorage.getItem(THEME_KEY); } catch (_) { return null; }
    })();
    const prefersDark = window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(savedTheme || (prefersDark ? 'dark' : 'light'));

    const draft = loadDraft();
    editor.value = draft && draft.trim() ? draft : SAMPLE;
    render();
    refreshDocsList();
  })();
})();
