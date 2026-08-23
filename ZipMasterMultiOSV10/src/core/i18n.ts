// 다국어(한국어/영어) UI 문자열. 참고 앱 ZipMasterWin01 의 라벨/문구를 반영.
export type Lang = 'ko' | 'en'

export interface Dict {
  appTitle: string
  appSubtitle: string

  // 툴바
  tbCompressFiles: string
  tbCompressFolder: string
  tbExtract: string
  tbPreview: string
  tbTheme: string
  tbLang: string
  tbInfo: string
  tipCompressFiles: string
  tipCompressFolder: string
  tipExtract: string
  tipPreview: string
  tipTheme: string
  tipLang: string
  tipInfo: string

  // 파일 탐색(왼쪽) / 아카이브 보기(오른쪽)
  browserTitle: string
  browserUp: string
  browserEmpty: string
  browserWebUnsupported: string
  viewerTitle: string
  viewerHint: string
  splitCustom: string

  // 압축 섹션
  sectionCompress: string
  format: string
  modeSingle: string
  modeSplit: string
  splitSizeLabel: string
  splitHint: string
  pickFiles: string
  pickFolder: string
  startCompress: string
  selected: (n: number, size: string) => string
  andMore: (n: number) => string

  // 해제 섹션
  sectionExtract: string
  extractHint: string
  pickArchive: string
  selectArchive: string
  listEntries: string
  overwrite: string
  selectedArchive: (name: string) => string
  contents: (n: number) => string

  // 상태
  ready: string
  compressing: string
  extracting: string
  merging: string
  splitting: string
  doneCompress: string
  doneCompressSplit: (n: number) => string
  doneExtract: string
  error: string
  noFiles: string
  cancelled: string

  // 알림
  createNotSupported: (fmt: string) => string
  webCreateNote: string
  accessWarning: (name: string) => string
}

const ko: Dict = {
  appTitle: 'ZipMaster',
  appSubtitle: '다양한 압축 파일을 압축하거나 풀어보세요. (Web · Windows · macOS · Linux)',

  tbCompressFiles: '파일 압축',
  tbCompressFolder: '폴더 압축',
  tbExtract: '압축 해제',
  tbPreview: '내용 미리보기',
  tbTheme: '테마',
  tbLang: 'EN',
  tbInfo: '정보',
  tipCompressFiles: '파일을 선택해 압축합니다',
  tipCompressFolder: '폴더를 선택해 압축합니다',
  tipExtract: '아카이브를 선택해 압축을 풉니다',
  tipPreview: '선택한 아카이브의 내용을 미리 봅니다',
  tipTheme: '밝은/어두운 테마 전환',
  tipLang: '언어 전환 (한국어 ↔ English)',
  tipInfo: '프로그램 정보',

  browserTitle: '파일 탐색',
  browserUp: '상위 폴더',
  browserEmpty: '항목이 없습니다.',
  browserWebUnsupported: '브라우저에서는 파일 탐색을 지원하지 않습니다. 툴바에서 파일을 선택하세요.',
  viewerTitle: '아카이브 내용',
  viewerHint: '왼쪽에서 압축 파일을 선택하면 내부 내용이 여기에 표시됩니다.',
  splitCustom: '사용자 지정',

  sectionCompress: '압축',
  format: '포맷',
  modeSingle: '단일 파일',
  modeSplit: '용량 분할 (여러 조각)',
  splitSizeLabel: '분할당 크기 (MB):',
  splitHint: '→ archive.zip.001, .002, … 형식',
  pickFiles: '파일 선택…',
  pickFolder: '폴더 선택…',
  startCompress: '압축 시작',
  selected: (n, size) => `선택됨: ${n}개${size ? ` (${size})` : ''}`,
  andMore: (n) => `… 외 ${n}개`,

  sectionExtract: '압축 해제',
  extractHint:
    '일반 아카이브(.zip/.7z/.rar/.tar.gz 등) 또는 분할 압축의 첫 조각(.001)을 선택할 수 있습니다.',
  pickArchive: '압축 해제',
  selectArchive: '아카이브 선택…',
  listEntries: '내용 미리보기',
  overwrite: '기존 파일 덮어쓰기',
  selectedArchive: (name) => `선택된 아카이브: ${name}`,
  contents: (n) => `내용: ${n}개 항목`,

  ready: '준비',
  compressing: '압축 중…',
  extracting: '압축 해제 중…',
  merging: '분할 조각 병합 중…',
  splitting: '분할 압축 중…',
  doneCompress: '압축 완료',
  doneCompressSplit: (n) => `분할 압축 완료 (${n}개 조각)`,
  doneExtract: '압축 해제 완료',
  error: '오류',
  noFiles: '압축할 파일이 없습니다.',
  cancelled: '취소되었습니다.',

  createNotSupported: (fmt) => `현재 플랫폼에서는 ${fmt} 생성을 지원하지 않습니다.`,
  webCreateNote: '웹에서는 7z·bz2 생성이 지원되지 않습니다. 데스크톱 앱을 사용하세요.',
  accessWarning: (name) => `파일에 접근할 수 없습니다: ${name}`
}

const en: Dict = {
  appTitle: 'ZipMaster',
  appSubtitle: 'Compress and extract many archive formats. (Web · Windows · macOS · Linux)',

  tbCompressFiles: 'Compress Files',
  tbCompressFolder: 'Compress Folder',
  tbExtract: 'Extract',
  tbPreview: 'Preview',
  tbTheme: 'Theme',
  tbLang: '한글',
  tbInfo: 'About',
  tipCompressFiles: 'Select files to compress',
  tipCompressFolder: 'Select a folder to compress',
  tipExtract: 'Select an archive to extract',
  tipPreview: 'Preview the contents of the selected archive',
  tipTheme: 'Toggle light/dark theme',
  tipLang: 'Switch language (한국어 ↔ English)',
  tipInfo: 'About this program',

  browserTitle: 'Files',
  browserUp: 'Up',
  browserEmpty: 'No items.',
  browserWebUnsupported: 'File browsing is not available in the browser. Pick files from the toolbar.',
  viewerTitle: 'Archive contents',
  viewerHint: 'Select an archive on the left to view its contents here.',
  splitCustom: 'Custom',

  sectionCompress: 'Compress',
  format: 'Format',
  modeSingle: 'Single file',
  modeSplit: 'Split into parts',
  splitSizeLabel: 'Size per part (MB):',
  splitHint: '→ archive.zip.001, .002, …',
  pickFiles: 'Select files…',
  pickFolder: 'Select folder…',
  startCompress: 'Start compression',
  selected: (n, size) => `Selected: ${n}${size ? ` (${size})` : ''}`,
  andMore: (n) => `… and ${n} more`,

  sectionExtract: 'Extract',
  extractHint:
    'Pick a regular archive (.zip/.7z/.rar/.tar.gz …) or the first part of a split archive (.001).',
  pickArchive: 'Extract',
  selectArchive: 'Select archive…',
  listEntries: 'Preview contents',
  overwrite: 'Overwrite existing files',
  selectedArchive: (name) => `Selected archive: ${name}`,
  contents: (n) => `Contents: ${n} items`,

  ready: 'Ready',
  compressing: 'Compressing…',
  extracting: 'Extracting…',
  merging: 'Merging split parts…',
  splitting: 'Splitting…',
  doneCompress: 'Compression complete',
  doneCompressSplit: (n) => `Split compression complete (${n} parts)`,
  doneExtract: 'Extraction complete',
  error: 'Error',
  noFiles: 'No files to compress.',
  cancelled: 'Cancelled.',

  createNotSupported: (fmt) => `Creating ${fmt} is not supported on this platform.`,
  webCreateNote: 'Creating 7z/bz2 is not supported on the web. Use the desktop app.',
  accessWarning: (name) => `Cannot access file: ${name}`
}

export const translations: Record<Lang, Dict> = { ko, en }

export function getDict(lang: Lang): Dict {
  return translations[lang]
}

/** 브라우저/OS 언어에서 초기 언어 추정. */
export function detectInitialLang(): Lang {
  const nav = typeof navigator !== 'undefined' ? navigator.language : 'ko'
  return nav.toLowerCase().startsWith('ko') ? 'ko' : 'en'
}
