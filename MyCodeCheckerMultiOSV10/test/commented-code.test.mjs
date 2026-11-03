// Commented-out code (core/commented-code.js and common:commented-code in
// core/metrics.js): explanations, documentation and Korean comments are not
// code; statements, declarations, directives and calls are. The prose lines
// come from comments that were reported by mistake in a real C project.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { lineKind, blockIsCode } = require('../core/commented-code.js');
const { structuralIssues } = require('../core/metrics.js');

const PROSE_C = [
  'return   : 0 = success',
  'return   :',
  'return : 0 = success, -1 = error',
  'return   : log count, -1 = error',
  'Returns number of characters written (excluding NUL), or -1 if buf too small.',
  'Returns bytes written (>0), 0 if idx out of range, -1 on error.',
  'Use label font for better multi-language support (Korean/Japanese characters)',
  'Resume playback if it was playing (will create completely new pipeline and open new file)',
  'Other biometric types (FP, NIR, Iris, etc.) are not supported — return 0.',
  'If we have data to write, sleep less; if buffer is full, sleep more',
  'Format (if templates existed):',
  'type: 9=Visible Light Face  no: biometric number (0 for face)  index: photo index (starts from 0)',
  'write_hangul function (lines 151-254 in Java, the hangul mode branch)',
  'Build key=value body.  Provide simulated values for known param names;',
  'Check if there is already content (need a leading comma)',
  '@param parent Parent container (usually lv_scr_act() or NULL for screen)',
  '@return 0 성공, -1 치명적 실패(계속 진행 가능한 경우도 0 반환)',
  '\\brief Opens the device (returns -1 on failure)',
  '전방 선언 — init_lvgl 가 본 정의보다 위에서 호출하므로 워닝 방지 (-Wimplicit-function-declaration).',
  '시작 시점 카메라 호출 제외 — face_recognition 소켓/스트림 미준비 환경에서',
  'TODO: call reset() here once the driver is fixed;',
  'see https://example.com/spec (section 4)',
  'Shows a red rectangle border (convenience function).',
];

const CODE_C = [
  'return -1;',
  'camera_auth_prepare();',
  'SQL_PRINT("sql: %s\\n", SQL_INSERT_TRIGGER);',
  'tick_new = GetTickCountZ();',
  'memcpy(pcText, pInput, nInputLength);',
  'for(i = 0; i < SeedBlockSize; i++)',
  'if (g_system_state.log_new_count > DB_WARNING_LOG_COUNT)',
  'unsigned int tick_old, tick_new;',
  'unsigned char tempOutput[SeedBufferSize];',
  'int tempTime[6], nStatus;',
  'lv_obj_t *usr_reg_con14 = NULL;',
  'usr_reg_con13 = lv_obj_create(usr_reg_screen);',
  'lv_label_set_text(usr_reg_lab03, "얼굴이 등록되었습니다");',
  '#include <stdio.h>',
  '#define DEF_SEED_CBC_DEBUG',
  '#endif',
  '} else if (app_state_get_font_20()) {',
  '}',
  'x = compute(a, b);  // 이유: 아직 쓰지 않음',
  'fprintf(stderr, "[TOUCH] X=%d, Y=%d\\n",',
  '        touch_x, touch_y, raw_x, raw_y, touch_pressed);',
  'static int helper(int a) {',
  'p->next = NULL;',
];

const PROSE_HASH = [
  'Import the data before calling this.',
  'if the cache is empty we load it again',
  'Args:',
  ':param path: the folder to read',
  'Returns: the number of rows (or None)',
  'for each user (by id) the last login',
  '설정 파일을 다시 읽습니다',
];
const CODE_HASH = [
  'import os',
  'from collections import OrderedDict',
  'def load(path):',
  'class Reader(Base):',
  'if x > 0:',
  'for item in items:',
  'result = compute(a, b)',
  'self.cache[key] = value',
  'print(result)',
  'return value',
];

test('prose in C comments is not code: descriptions, doc tags, sentences, Korean text', () => {
  for (const line of PROSE_C) assert.notEqual(lineKind(line, 'slash'), true, `prose taken for code: ${line}`);
});

test('code in C comments is code: statements, declarations, directives, braces, multi-line calls', () => {
  for (const line of CODE_C) assert.equal(lineKind(line, 'slash'), true, `code not recognized: ${line}`);
});

test('hash-comment languages: prose is not code, Python statements are', () => {
  for (const line of PROSE_HASH) assert.notEqual(lineKind(line, 'hash'), true, `prose taken for code: ${line}`);
  for (const line of CODE_HASH) assert.equal(lineKind(line, 'hash'), true, `code not recognized: ${line}`);
});

test('SQL comments: a statement is code, a sentence is not', () => {
  assert.equal(lineKind('DELETE FROM users WHERE id = 1;', 'dash'), true);
  assert.notEqual(lineKind('Delete the users that never logged in.', 'dash'), true);
});

test('a comment block: code after an explanation is code; documentation and examples are not', () => {
  const after = blockIsCode(['Not ready yet, the stream is missing:', 'camera_auth_prepare();'], { style: 'slash' });
  assert.equal(after.isCode, true);
  assert.deepEqual(after.codeLines, [1]);
  assert.equal(blockIsCode(['Opens the port.', '@param fd the port', 'open(fd);'], { style: 'slash', doc: true }).isCode, false, 'doc comment with prose');
  assert.equal(blockIsCode(['Usage:', 'reader_open(&r, path);'], { style: 'slash' }).isCode, false, 'an announced example');
  assert.equal(blockIsCode(['@code', 'reader_open(&r, path);', '@endcode'], { style: 'slash' }).isCode, false);
  assert.equal(blockIsCode(['return   : 0 = success', 'param    : fd = device'], { style: 'slash' }).isCode, false);
  // A usage example indented below the explanation, in a file header.
  assert.equal(blockIsCode(['Dropdown lists with more than 6 items show two columns.', '', '  const cols = columnsOf(items);   // 1 or 2 columns', '  cols.jump(active, +1);'], { style: 'slash' }).isCode, false);
  // A list of names with parentheses is not a call over several lines.
  assert.notEqual(lineKind('Go (go.mod, go.sum), Rust (Cargo.toml, Cargo.lock), Ruby (Gemfile,', 'slash'), true);
  assert.notEqual(lineKind('NuGet (*.csproj / *.fsproj / *.vbproj PackageReference, Directory.Packages.props,', 'slash'), true);
});

test('C/C++ engines: a comment naming the #if after #endif, a doc example and a sentence starting with #define are not code', () => {
  const { cComment } = require('../core/commented-code.js');
  const text = [
    '#if defined(CBC) && (CBC == 1)',
    'int x;',
    '#endif // #if defined(CBC) && (CBC == 1)',
    '// #define the macros below to 1/0 to enable/disable the mode of operation.',
    '/**',
    ' * @brief Logger singleton class',
    ' *',
    ' * Usage:',
    ' * ```cpp',
    ' * LOG_DEBUG("Debug message");',
    ' * ```',
    ' */',
    '/*',
    ' * A function that calculates the CRC-32 is given below for documentation purposes.',
    ' *',
    ' *\tuint32_t',
    ' *\tcrc32(const void *buf, size_t size)',
    ' *\t{',
    ' *\t\treturn crc32_tab[0];',
    ' *\t}',
    ' */',
    '// (void)type;',
    '/*',
    'static uint8_t getSBoxValue(uint8_t num)',
    '{',
    '  return sbox[num];',
    '}',
    '*/',
  ].join('\n');
  const unit = { sources: new Map([['a.c', { text }]]) };
  const at = (line, col, value, style) => cComment({ file: 'a.c', line, col, value, style }, unit).isCode;
  assert.equal(at(3, 8, '// #if defined(CBC) && (CBC == 1)', 'line'), false, 'names the #if');
  assert.equal(at(4, 1, '// #define the macros below to 1/0 to enable/disable the mode of operation.', 'line'), false);
  assert.equal(at(5, 1, text.split('\n').slice(4, 12).join('\n'), 'block'), false, 'doc comment with a usage example');
  assert.equal(at(13, 1, text.split('\n').slice(12, 21).join('\n'), 'block'), false, 'example indented under the explanation');
  assert.equal(at(22, 1, '// (void)type;', 'line'), true);
  assert.equal(at(23, 1, text.split('\n').slice(22, 28).join('\n'), 'block'), true, 'a function turned off');
});

const ruleLines = (text, kind) => structuralIssues(text, kind).issues.filter((i) => i.rule === 'common:commented-code').map((i) => i.line);

test('common:commented-code reports the code lines of a C file and none of its prose', () => {
  const text = [
    '/**',
    ' * Opens the device (returns -1 on failure).',
    ' * @param fd file descriptor (0 for stdin)',
    ' * @return 0 = success, -1 = error',
    ' */',
    'int open_dev(int fd) {',
    '    // return   : 0 = success',
    '    // Use label font for better multi-language support (Korean/Japanese characters)',
    '    // 전방 선언 — 워닝 방지 (-Wimplicit-function-declaration).',
    '    int r = 0;',
    '    // 아직 준비되지 않아 호출하지 않습니다.',
    '    // camera_auth_prepare();',
    '    //tick_new = GetTickCountZ();',
    '    return r;',
    '}',
  ].join('\n');
  assert.deepEqual(ruleLines(text, 'slash'), [12, 13]);
});

test('common:commented-code in Python skips docstrings and prose, reports turned-off statements', () => {
  const text = [
    'def load(path):',
    '    """Load the file.',
    '',
    '    Example:',
    '        result = load("a.txt")',
    '    """',
    '    # if the cache is empty we load it again',
    '    # result = compute(a, b)',
    '    return path',
  ].join('\n');
  assert.deepEqual(ruleLines(text, 'hash'), [8]);
});
