'use strict';

const express = require('express');
const path = require('node:path');
const fs = require('node:fs/promises');

const app = express();
const PORT = process.env.PORT || 3000;
const DOCS_DIR = path.resolve(__dirname, 'documents');
const PUBLIC_DIR = path.resolve(__dirname, 'public');

const ALLOWED_EXT = new Set(['.md', '.markdown', '.txt']);
const MAX_BODY = '5mb';

app.use(express.json({ limit: MAX_BODY }));
app.use(express.text({ limit: MAX_BODY, type: ['text/plain', 'text/markdown'] }));
app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

// 안전한 파일명만 허용 (경로 탈출 방지)
function safeFilename(name) {
  if (typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('..')) return null;
  if (trimmed.length > 200) return null;
  if (!/^[\w\-. ()가-힣ㄱ-ㅎㅏ-ㅣ\u4E00-\u9FFF]+$/.test(trimmed)) return null;
  const ext = path.extname(trimmed).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) return null;
  return trimmed;
}

async function ensureDocsDir() {
  await fs.mkdir(DOCS_DIR, { recursive: true });
}

// 목록
app.get('/api/documents', async (_req, res) => {
  try {
    await ensureDocsDir();
    const entries = await fs.readdir(DOCS_DIR, { withFileTypes: true });
    const items = await Promise.all(
      entries
        .filter((e) => e.isFile() && ALLOWED_EXT.has(path.extname(e.name).toLowerCase()))
        .map(async (e) => {
          const stat = await fs.stat(path.join(DOCS_DIR, e.name));
          return {
            name: e.name,
            size: stat.size,
            modifiedAt: stat.mtime.toISOString(),
          };
        }),
    );
    items.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
    res.json({ documents: items });
  } catch (err) {
    console.error('list error:', err);
    res.status(500).json({ error: '문서 목록을 불러오지 못했습니다.' });
  }
});

// 읽기
app.get('/api/documents/:name', async (req, res) => {
  const safe = safeFilename(req.params.name);
  if (!safe) return res.status(400).json({ error: '잘못된 파일명입니다.' });
  try {
    const filePath = path.join(DOCS_DIR, safe);
    const content = await fs.readFile(filePath, 'utf8');
    res.json({ name: safe, content });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    }
    console.error('read error:', err);
    res.status(500).json({ error: '파일을 읽지 못했습니다.' });
  }
});

// 저장 (생성/덮어쓰기)
app.put('/api/documents/:name', async (req, res) => {
  const safe = safeFilename(req.params.name);
  if (!safe) return res.status(400).json({ error: '잘못된 파일명입니다.' });

  let content;
  if (typeof req.body === 'string') {
    content = req.body;
  } else if (req.body && typeof req.body.content === 'string') {
    content = req.body.content;
  } else {
    return res.status(400).json({ error: '요청 본문이 비어 있습니다.' });
  }

  try {
    await ensureDocsDir();
    const filePath = path.join(DOCS_DIR, safe);
    await fs.writeFile(filePath, content, 'utf8');
    const stat = await fs.stat(filePath);
    res.json({
      name: safe,
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
    });
  } catch (err) {
    console.error('save error:', err);
    res.status(500).json({ error: '파일을 저장하지 못했습니다.' });
  }
});

// 삭제
app.delete('/api/documents/:name', async (req, res) => {
  const safe = safeFilename(req.params.name);
  if (!safe) return res.status(400).json({ error: '잘못된 파일명입니다.' });
  try {
    await fs.unlink(path.join(DOCS_DIR, safe));
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    }
    console.error('delete error:', err);
    res.status(500).json({ error: '파일을 삭제하지 못했습니다.' });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, name: 'EasyMD', node: process.version });
});

// SPA-style fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

ensureDocsDir().then(() => {
  app.listen(PORT, () => {
    console.log(`\n  EasyMD 서버 실행 중`);
    console.log(`  → http://localhost:${PORT}`);
    console.log(`  → 저장 폴더: ${DOCS_DIR}\n`);
  });
});
