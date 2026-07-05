const fs = require('fs');
const path = require('path');

const WIN_TEMPLATE_ROOT = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'MyWorkspaceWinV10',
  'src',
  'MyWorkspace.Win',
  'Templates',
  'Pages'
);
const BUNDLED_TEMPLATE_ROOT = path.join(__dirname, '..', '..', 'renderer', 'templates', 'pages');

function getTemplateRoot() {
  if (fs.existsSync(WIN_TEMPLATE_ROOT)) {
    return WIN_TEMPLATE_ROOT;
  }
  return BUNDLED_TEMPLATE_ROOT;
}

function parseTemplateFile(filePath, language) {
  const text = fs.readFileSync(filePath, 'utf8');
  const metadata = {};
  let content = text;

  if (text.startsWith('---')) {
    const end = text.indexOf('\n---', 3);
    if (end > 0) {
      const frontMatter = text.slice(4, end);
      content = text.slice(end + 4).replace(/^\r?\n/, '');
      for (const line of frontMatter.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
          continue;
        }
        const colon = trimmed.indexOf(':');
        if (colon <= 0) {
          continue;
        }
        metadata[trimmed.slice(0, colon).trim()] = trimmed.slice(colon + 1).trim();
      }
    }
  }

  const stem = path.basename(filePath).replace(/\.mdtemplate$/i, '');
  return {
    id: metadata.id || stem,
    name: metadata.name || stem,
    description: metadata.description || '',
    order: Number.parseInt(metadata.order, 10) || 100,
    language: metadata.language || language,
    contentPattern: content.trim() || '# {title}\n\n내용을 입력하세요.'
  };
}

function listTemplates(language = 'ko') {
  const root = getTemplateRoot();
  const languageDir = path.join(root, language);
  const searchDir = fs.existsSync(languageDir) ? languageDir : root;
  if (!fs.existsSync(searchDir)) {
    return [
      {
        id: 'blank',
        name: '빈 Page',
        description: '제목만 있는 기본 Page',
        order: 10,
        language: 'ko',
        contentPattern: '# {title}\n\n내용을 입력하세요.'
      }
    ];
  }

  return fs
    .readdirSync(searchDir)
    .filter((file) => file.endsWith('.mdtemplate'))
    .map((file) => parseTemplateFile(path.join(searchDir, file), language))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'ko'));
}

function buildContent(templateId, title, language = 'ko') {
  const templates = listTemplates(language);
  const template = templates.find((item) => item.id === templateId) || templates[0];
  if (!template) {
    throw new Error('사용 가능한 Page 양식이 없습니다.');
  }

  let trimmedTitle = (title || '').trim();
  if (!trimmedTitle) {
    trimmedTitle = '제목없음';
  }

  return template.contentPattern.replaceAll('{title}', trimmedTitle);
}

module.exports = {
  listTemplates,
  buildContent
};
