'use strict';

// Conventions: naming, formatting (PSR-1 / PSR-2 basics), PHP tags, obsolete
// and deprecated constructs.

const { rule, php, fn, cls } = require('./core');
const A = require('../ast');
const H = require('./h');

// ── naming
function nameRule(id, ref, what, whatKo, dflt, collect, bad, good) {
  rule({
    id, ref, type: 'S', sev: 'MI', debt: 5, tags: ['convention'], checker: 'NAMING',
    en: [`${what} names should comply with a naming convention`, `Consistent ${what.toLowerCase()} names make the code base easier to read.`, `Rename the ${what.toLowerCase()} to match the pattern ${dflt}.`],
    ko: [`${whatKo} 이름은 명명 규칙을 따라야 합니다`, `${whatKo} 이름이 일관되면 코드를 읽기 쉽습니다.`, `${whatKo} 이름을 ${dflt} 패턴에 맞게 바꿉니다.`],
    msg: [`Rename "{0}" to match the regular expression {1}.`, `"{0}"의 이름을 정규식 {1}에 맞게 바꿉니다.`],
    file(pf, cx) {
      const pat = cx.opt('format', dflt);
      let re;
      try { re = new RegExp(pat); } catch (e) { return; }
      collect(pf, (node, name) => { if (!re.test(name)) cx.report(node, name, pat); });
    },
    bad, good,
  });
}

nameRule('function-naming', 'S100', 'Function', '함수', '^[a-z][a-zA-Z0-9]*$', (pf, cb) => {
  for (const f of pf.byKind.get('FuncDecl') || []) cb({ line: f.nameLine, col: f.nameCol }, f.name);
  for (const m of pf.byKind.get('Method') || []) if (!m.name.startsWith('__')) cb({ line: m.nameLine, col: m.nameCol }, m.name);
}, php('function Do_Something() // Noncompliant\n{\n    return 1;\n}'), php('function doSomething()\n{\n    return 1;\n}\nclass A\n{\n    public function __toString()\n    {\n        return \'\';\n    }\n}'));

nameRule('class-naming', 'S101', 'Class', '클래스', '^[A-Z][a-zA-Z0-9]*$', (pf, cb) => {
  for (const c of pf.byKind.get('ClassDecl') || []) if (c.name && c.kind !== 'interface') cb({ line: c.nameLine, col: c.nameCol }, c.name);
}, php('class my_class // Noncompliant\n{\n}'), php('class MyClass\n{\n}'));

nameRule('interface-naming', 'S114', 'Interface', '인터페이스', '^[A-Z][a-zA-Z0-9]*$', (pf, cb) => {
  for (const c of pf.byKind.get('ClassDecl') || []) if (c.name && c.kind === 'interface') cb({ line: c.nameLine, col: c.nameCol }, c.name);
}, php('interface my_interface // Noncompliant\n{\n}'), php('interface MyInterface\n{\n}'));

nameRule('variable-naming', 'S117', 'Local variable and parameter', '지역 변수와 매개변수', '^[a-z_][a-zA-Z0-9_]*$', (pf, cb) => {
  for (const sc of pf.scopes) {
    if (sc.isTop) continue;
    for (const s of sc.vars.values()) {
      if (s.kind === 'global' || !s.decl || s.name === 'this') continue;
      const at = s.decl.k === 'Param' ? { line: s.decl.nameLine, col: s.decl.nameCol } : s.decl;
      cb(at, s.name);
    }
  }
}, php('function f($Input) // Noncompliant\n{\n    $My_Var = $Input; // Noncompliant\n    return $My_Var;\n}'), php('function f($input)\n{\n    $my_var = $input;\n    $myVar = $my_var;\n    return $myVar;\n}'));

nameRule('constant-naming', 'S115', 'Constant', '상수', '^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$', (pf, cb) => {
  for (const c of pf.byKind.get('ConstItem') || []) cb(c, c.name);
  for (const c of pf.byKind.get('Call') || []) {
    if (!H.isCall(c, 'define')) continue;
    const a = H.arg(c, 0);
    const v = A.strVal(a);
    if (v != null && !v.includes('\\')) cb(a, v);
  }
}, php('const max_size = 10; // Noncompliant\ndefine(\'defaultName\', \'x\'); // Noncompliant\nclass A\n{\n    const limit = 1; // Noncompliant\n}'), php('const MAX_SIZE = 10;\ndefine(\'DEFAULT_NAME\', \'x\');\nclass A\n{\n    const LIMIT = 1;\n}'));

nameRule('field-naming', 'S116', 'Field', '필드', '^[a-z][a-zA-Z0-9]*$', (pf, cb) => {
  for (const p of pf.byKind.get('PropItem') || []) cb(p, p.name);
  for (const m of pf.byKind.get('Method') || []) for (const prm of m.params) if (prm.mods && prm.mods.size) cb({ line: prm.nameLine, col: prm.nameCol }, prm.name);
}, cls('    private $My_Field; // Noncompliant\n    public $ok;'), cls('    private $myField;\n    public $ok;'));

rule({
  id: 'file-naming', ref: 'S1578', type: 'S', sev: 'MI', debt: 10, tags: ['convention'], checker: 'NAMING',
  en: ['File names should comply with a naming convention', 'Odd characters in file names cause trouble with autoloaders and other operating systems.', 'Rename the file using letters, digits, "_" and "-" only.'],
  ko: ['파일 이름은 명명 규칙을 따라야 합니다', '파일 이름의 특수 문자는 오토로더와 다른 운영체제에서 문제를 일으킵니다.', '문자, 숫자, "_", "-"만 써서 파일 이름을 바꿉니다.'],
  msg: ['Rename this file "{0}" to match the regular expression {1}.', '이 파일 "{0}"의 이름을 정규식 {1}에 맞게 바꿉니다.'],
  file(pf, cx) {
    const base = String(pf.path).split('/').pop();
    if (!/\.php$/i.test(base)) return;
    const pat = cx.opt('format', '^[A-Za-z][-_A-Za-z0-9]*\\.php$');
    let re;
    try { re = new RegExp(pat); } catch (e) { return; }
    if (!re.test(base)) cx.report({ line: 1, col: 1 }, base, pat);
  },
  bad: php('echo 1;'), badLines: [1], path: 'src/1 bad name!.php', goodPath: 'src/GoodName.php',
  good: php('echo 1;'),
});

// ── PHP tags and file layout
rule({
  id: 'short-open-tag', ref: 'S1757', type: 'S', sev: 'CR', debt: 5, tags: ['convention', 'psr1'], checker: 'S1757',
  en: ['"<?php" and "<?=" tags should be used', 'Short open tags "<?" depend on the short_open_tag setting and break on many servers.', 'Use "<?php" or "<?=".'],
  ko: ['"<?php"와 "<?=" 태그를 써야 합니다', '짧은 여는 태그 "<?"는 short_open_tag 설정에 따라 많은 서버에서 동작하지 않습니다.', '"<?php"나 "<?="를 씁니다.'],
  msg: ['Change this "<?" open tag to "<?php" or "<?=" instead.', '이 "<?" 여는 태그를 "<?php"나 "<?="로 바꿉니다.'],
  file(pf, cx) { for (const t of pf.lex.info.shortTags) cx.report(t); },
  bad: '<p>\n<? echo 1; ?> <!-- // Noncompliant -->\n</p>\n',
  good: '<p>\n<?php echo 1; ?>\n<?= 2 ?>\n</p>\n',
});

rule({
  id: 'closing-tag', ref: 'S1780', type: 'S', sev: 'MI', debt: 1, tags: ['convention', 'psr2'], checker: 'S1780',
  en: ['Closing tag "?>" should be omitted on files containing only PHP', 'A trailing "?>" lets stray whitespace after it be sent as output, which breaks headers.', 'Remove the final closing tag.'],
  ko: ['PHP만 있는 파일에서는 닫는 태그 "?>"를 생략해야 합니다', '마지막 "?>" 뒤의 공백이 출력으로 나가 헤더 전송을 망가뜨릴 수 있습니다.', '마지막 닫는 태그를 지웁니다.'],
  msg: ['Remove this closing tag "?>".', '이 닫는 태그 "?>"를 지웁니다.'],
  file(pf, cx) {
    const info = pf.lex.info;
    if (!info.trailingClose || info.closeTags.length !== 1) return;
    if (pf.lex.tokens.some((t) => t.t === 'html' && /\S/.test(t.v))) return;
    cx.report(info.trailingClose);
  },
  bad: '<?php\necho 1;\n?>\n', badLines: [3],
  good: '<?php\necho 1;\n',
});

rule({
  id: 'characters-before-open-tag', ref: 'S2000', type: 'S', sev: 'CR', debt: 2, tags: ['pitfall'], checker: 'S2000',
  en: ['Files should not contain characters before "<?php"', 'A byte order mark or whitespace before "<?php" is sent as output and prevents headers and sessions.', 'Remove everything before the open tag and save without BOM.'],
  ko: ['"<?php" 앞에 문자가 있으면 안 됩니다', '"<?php" 앞의 BOM이나 공백은 출력으로 나가 헤더와 세션을 막습니다.', '여는 태그 앞의 모든 것을 지우고 BOM 없이 저장합니다.'],
  msg: ['Remove the extra characters before the open tag.', '여는 태그 앞의 여분 문자를 지웁니다.'],
  file(pf, cx) {
    const info = pf.lex.info;
    if (info.firstOpen < 0) return;
    const lead = info.leading.replace(/^﻿/, '');
    if ((info.bom || lead.length) && !/\S/.test(lead)) cx.report({ line: 1, col: 1 });
  },
  bad: '﻿<?php // Noncompliant\necho 1;\n',
  good: '<?php\necho 1;\n',
});

rule({
  id: 'trailing-whitespace', ref: 'S1131', type: 'S', sev: 'MI', debt: 1, tags: ['convention'], checker: 'S1131',
  en: ['Lines should not end with trailing whitespaces', 'Trailing spaces create noise in diffs.', 'Remove the trailing whitespace.'],
  ko: ['줄 끝에 공백이 있으면 안 됩니다', '줄 끝 공백은 비교 결과에 잡음을 만듭니다.', '줄 끝 공백을 지웁니다.'],
  msg: ['Remove the useless trailing whitespaces at the end of this line.', '이 줄 끝의 쓸모없는 공백을 지웁니다.'],
  file(pf, cx) {
    pf.lines.forEach((l, i) => {
      const s = l.replace(/\r$/, '');
      const m = /[ \t]+$/.exec(s);
      if (m) cx.report({ line: i + 1, col: m.index + 1 });
    });
  },
  bad: php('$a = 1; // Noncompliant   \n$b = 2;'),
  good: php('$a = 1;\n$b = 2;'),
});

rule({
  id: 'tab-characters', ref: 'S105', type: 'S', sev: 'MI', debt: 2, tags: ['convention', 'psr2'], checker: 'S105',
  en: ['Tabulation characters should not be used', 'PSR-2 requires spaces; tabs render differently in every editor.', 'Indent with four spaces.'],
  ko: ['탭 문자를 쓰면 안 됩니다', 'PSR-2는 공백을 요구하며 탭은 편집기마다 다르게 보입니다.', '공백 네 칸으로 들여씁니다.'],
  msg: ['Replace all tab characters in this file by sequences of white-spaces.', '이 파일의 모든 탭 문자를 공백으로 바꿉니다.'],
  file(pf, cx) {
    const i = pf.lines.findIndex((l) => l.includes('\t'));
    if (i >= 0) cx.report({ line: i + 1, col: pf.lines[i].indexOf('\t') + 1 });
  },
  bad: php('if (true) {\n\techo 1; // Noncompliant\n}'),
  good: php('if (true) {\n    echo 1;\n}'),
});

rule({
  id: 'line-too-long', ref: 'S103', type: 'S', sev: 'MA', debt: 1, tags: ['convention'], checker: 'S103',
  en: ['Lines should not be too long', 'Long lines are hard to read and to review side by side.', 'Split the line.'],
  ko: ['줄이 너무 길면 안 됩니다', '긴 줄은 읽기 어렵고 나란히 검토하기 힘듭니다.', '줄을 나눕니다.'],
  msg: ['Split this {0} characters long line (which is greater than {1} authorized).', '{0}자인 이 줄을 나눕니다(허용치 {1}자).'],
  file(pf, cx) {
    const max = cx.opt('max', 120);
    pf.lines.forEach((l, i) => { const n = l.replace(/\r$/, '').length; if (n > max) cx.report({ line: i + 1, col: 1 }, n, max); });
  },
  bad: php(`$message = '${'x'.repeat(110)}'; // Noncompliant`),
  good: php('$message = \'short\';'),
});

rule({
  id: 'newline-at-end', ref: 'S113', type: 'S', sev: 'MI', debt: 1, tags: ['convention', 'psr2'], checker: 'S113',
  en: ['Files should end with a newline', 'Some tools fail on, or show noise for, a last line without newline.', 'Add a newline at the end of the file.'],
  ko: ['파일은 줄바꿈으로 끝나야 합니다', '마지막 줄에 줄바꿈이 없으면 일부 도구가 실패하거나 잡음을 보입니다.', '파일 끝에 줄바꿈을 추가합니다.'],
  msg: ['Add a new line at the end of this file.', '이 파일 끝에 줄바꿈을 추가합니다.'],
  file(pf, cx) {
    if (pf.src.length && !pf.src.endsWith('\n')) cx.report({ line: pf.lines.length, col: 1 });
  },
  bad: '<?php\necho 1; // Noncompliant',
  good: '<?php\necho 1;\n',
});

rule({
  id: 'crlf-line-endings', ref: 'S1779', type: 'S', sev: 'MI', debt: 1, tags: ['convention', 'psr2'], checker: 'S1779',
  en: ['Only LF character (Unix-like) should be used to end lines', 'PSR-2 requires Unix line endings; mixed endings produce noisy diffs.', 'Convert the file to LF line endings.'],
  ko: ['줄 끝에는 LF 문자(유닉스 방식)만 써야 합니다', 'PSR-2는 유닉스 줄 끝을 요구하며 섞인 줄 끝은 비교에 잡음을 만듭니다.', '파일을 LF 줄 끝으로 바꿉니다.'],
  msg: ['Replace all non line feed end of line characters in this file by line feeds.', '이 파일의 줄 끝 문자를 모두 LF로 바꿉니다.'],
  file(pf, cx) {
    const i = pf.lines.findIndex((l) => l.endsWith('\r'));
    if (i >= 0) cx.report({ line: i + 1, col: 1 });
  },
  bad: '<?php // Noncompliant\r\necho 1;\r\n',
  good: '<?php\necho 1;\n',
});

// ── PSR-2 formatting
const CTL = new Set(['if', 'elseif', 'for', 'foreach', 'while', 'switch', 'catch']);
rule({
  id: 'psr2-formatting', ref: 'S1808', type: 'S', sev: 'MI', debt: 1, tags: ['convention', 'psr2'], checker: 'S1808',
  en: ['Source code should comply with formatting standards', 'Consistent PSR-2 layout makes code from different authors look the same.', 'Put a space after control keywords, class and function braces on their own line, and "else" on the line of the closing brace.'],
  ko: ['소스 코드는 서식 표준을 따라야 합니다', 'PSR-2 배치가 일관되면 여러 작성자의 코드가 같아 보입니다.', '제어 키워드 뒤에 공백, 클래스와 함수 중괄호는 별도 줄, else는 닫는 중괄호와 같은 줄에 둡니다.'],
  msg: ['{0}', '{0}'],
  file(pf, cx) {
    const toks = pf.lex.tokens;
    for (let i = 0; i < toks.length - 1; i++) {
      const t = toks[i];
      if (t.t === 'id' && CTL.has(t.v.toLowerCase()) && toks[i + 1].t === 'op' && toks[i + 1].v === '(' && !toks[i + 1].sp) {
        cx.report(t, { en: `Put exactly one space after the "${t.v}" keyword.`, ko: `"${t.v}" 키워드 뒤에 공백을 한 칸 둡니다.` });
      }
    }
    for (const c of pf.byKind.get('ClassDecl') || []) {
      if (!c.anon && c.braceLine === c.nameLine) cx.report({ line: c.braceLine, col: c.col }, { en: 'Move this open curly brace to the beginning of the next line.', ko: '이 여는 중괄호를 다음 줄의 시작으로 옮깁니다.' });
    }
    for (const f of [...(pf.byKind.get('FuncDecl') || []), ...(pf.byKind.get('Method') || [])]) {
      if (f.body && f.body.line === f.nameLine && f.body.endLine > f.body.line) cx.report({ line: f.body.line, col: f.body.col }, { en: 'Move this open curly brace to the beginning of the next line.', ko: '이 여는 중괄호를 다음 줄의 시작으로 옮깁니다.' });
    }
    for (const n of pf.byKind.get('If') || []) {
      if (n.else && n.then && n.then.k === 'Block' && !n.then.alt && n.elseLine && n.elseLine !== n.then.endLine) {
        cx.report({ line: n.elseLine, col: n.elseCol }, { en: 'Move this "else" to the same line as the previous closing curly brace.', ko: '이 else를 앞의 닫는 중괄호와 같은 줄로 옮깁니다.' });
      }
    }
  },
  bad: php('class Foo { // Noncompliant\n    public function bar()\n    {\n        if($x) { // Noncompliant\n            echo 1;\n        }\n        else { // Noncompliant\n            echo 2;\n        }\n    }\n}'),
  good: php('class Foo\n{\n    public function bar()\n    {\n        if ($x) {\n            echo 1;\n        } else {\n            echo 2;\n        }\n    }\n}'),
});

rule({
  id: 'elseif-keyword', ref: 'S1793', type: 'S', sev: 'MI', debt: 1, tags: ['convention', 'psr2'], checker: 'S1793',
  en: ['"elseif" keyword should be used in place of "else if" keywords', 'PSR-2 uses the single keyword elseif so all branches look the same.', 'Replace "else if" with "elseif".'],
  ko: ['"else if" 대신 "elseif" 키워드를 써야 합니다', 'PSR-2는 모든 분기가 같아 보이도록 한 단어 elseif를 씁니다.', '"else if"를 "elseif"로 바꿉니다.'],
  msg: ['Replace "else if" with "elseif".', '"else if"를 "elseif"로 바꿉니다.'],
  on: { If(n, cx) { if (n.viaElse) cx.report(n.parent.elseLine ? { line: n.parent.elseLine, col: n.parent.elseCol } : n); } },
  bad: fn('    if ($a) {\n        echo 1;\n    } else if ($b) { // Noncompliant\n        echo 2;\n    }'),
  good: fn('    if ($a) {\n        echo 1;\n    } elseif ($b) {\n        echo 2;\n    }'),
});

rule({
  id: 'perl-style-comments', ref: 'S2046', type: 'S', sev: 'MI', debt: 1, tags: ['convention'], checker: 'S2046',
  en: ['Perl-style comments should not be used', 'Mixing "#" and "//" comments is inconsistent; "//" is the common PHP style.', 'Use "//" for single-line comments.'],
  ko: ['펄 스타일 주석을 쓰면 안 됩니다', '"#"와 "//" 주석을 섞으면 일관성이 없으며 "//"가 일반적인 PHP 스타일입니다.', '한 줄 주석에는 "//"를 씁니다.'],
  msg: ['Use "//" instead of "#" to start this comment.', '이 주석은 "#" 대신 "//"로 시작합니다.'],
  file(pf, cx) { for (const c of pf.comments) if (c.kind === 'hash') cx.report(c); },
  bad: php('# old style comment // Noncompliant\n$a = 1;'),
  good: php('// modern comment\n#[Attribute]\nclass Marker\n{\n}'),
});

// ── class members
rule({
  id: 'var-keyword', ref: 'S1765', type: 'S', sev: 'MI', debt: 2, tags: ['convention', 'psr2', 'obsolete'], checker: 'S1765',
  en: ['"var" should not be used to declare properties', '"var" is the PHP 4 syntax and hides the intended visibility.', 'Declare the property with public, protected or private.'],
  ko: ['속성을 선언할 때 var를 쓰면 안 됩니다', 'var는 PHP 4 문법이며 의도한 가시성을 감춥니다.', 'public, protected, private로 속성을 선언합니다.'],
  msg: ['Replace the "var" keyword with the modifier "public".', 'var 키워드를 public 한정자로 바꿉니다.'],
  on: { PropDecl(n, cx) { if (n.mods.has('var')) cx.report(n); } },
  bad: cls('    var $name; // Noncompliant'),
  good: cls('    public $name;'),
});

rule({
  id: 'multiple-properties', ref: 'S1766', type: 'S', sev: 'MI', debt: 2, tags: ['convention', 'psr2'], checker: 'S1766',
  en: ['More than one property should not be declared per statement', 'One property per line is easier to read and to document.', 'Declare each property in its own statement.'],
  ko: ['한 문장에 속성을 둘 이상 선언하면 안 됩니다', '한 줄에 속성 하나가 읽고 문서화하기 쉽습니다.', '속성마다 별도 문장으로 선언합니다.'],
  msg: ['{0} properties are declared in this statement; declare one per statement.', '이 문장에 속성 {0}개가 선언되어 있습니다. 문장마다 하나씩 선언합니다.'],
  on: { PropDecl(n, cx) { if (n.props.length > 1) cx.report(n, n.props.length); } },
  bad: cls('    private $a, $b; // Noncompliant'),
  good: cls('    private $a;\n    private $b;'),
});

rule({
  id: 'explicit-visibility', ref: 'S1784', type: 'S', sev: 'MI', debt: 2, tags: ['convention', 'psr2'], checker: 'S1784',
  en: ['Method and property visibility should be explicitly declared', 'Implicit public visibility is easy to overlook and is not PSR-2 compliant.', 'Add public, protected or private.'],
  ko: ['메서드와 속성의 가시성은 명시해야 합니다', '암묵적인 public 가시성은 놓치기 쉽고 PSR-2에 맞지 않습니다.', 'public, protected, private를 붙입니다.'],
  msg: ['Explicitly mention the visibility of this {0}.', '이 {0}의 가시성을 명시합니다.'],
  on: {
    Method(n, cx) { if (vis(n)) cx.reportName(n, { en: `Explicitly mention the visibility of this method "${n.name}".`, ko: `이 메서드 "${n.name}"의 가시성을 명시합니다.` }); },
    PropDecl(n, cx) { if (vis(n) && !n.mods.has('var')) cx.report(n, { en: 'Explicitly mention the visibility of this property.', ko: '이 속성의 가시성을 명시합니다.' }); },
  },
  bad: cls('    static $count; // Noncompliant\n    function run() // Noncompliant\n    {\n        return 1;\n    }'),
  good: cls('    public static $count;\n    public function run()\n    {\n        return 1;\n    }') + 'interface I\n{\n    function x();\n}\n',
});
function vis(n) {
  const c = n.parent;
  if (!c || c.k !== 'ClassDecl' || c.kind === 'interface') return false;
  return !n.mods.has('public') && !n.mods.has('protected') && !n.mods.has('private');
}

const RANK = { final: 0, abstract: 0, public: 1, protected: 1, private: 1, static: 2, readonly: 2 };
rule({
  id: 'modifier-order', ref: 'S1124', type: 'S', sev: 'MI', debt: 2, tags: ['convention', 'psr2'], checker: 'S1124',
  en: ['Modifiers should be declared in the correct order', 'PSR-2 puts abstract/final first, then visibility, then static.', 'Reorder the modifiers.'],
  ko: ['한정자는 올바른 순서로 선언해야 합니다', 'PSR-2는 abstract/final, 가시성, static 순서로 둡니다.', '한정자 순서를 바꿉니다.'],
  msg: ['Reorder the modifiers to comply with the PSR-2 standard.', 'PSR-2 표준에 맞게 한정자 순서를 바꿉니다.'],
  on: {
    Method: modOrder, PropDecl: modOrder, ClassConst: modOrder,
  },
  bad: cls('    static public $x; // Noncompliant\n    public final function f() // Noncompliant\n    {\n        return 1;\n    }'),
  good: cls('    public static $x;\n    final public function f()\n    {\n        return 1;\n    }'),
});
function modOrder(n, cx) {
  const toks = n.modToks || [];
  let last = -1;
  for (const t of toks) {
    const r = RANK[t.v.toLowerCase()];
    if (r === undefined) continue;
    if (r < last) { cx.report(toks[0]); return; }
    last = r;
  }
}

// ── braces and layout
function bodiesOf(n) {
  if (n.k === 'If') return [n.then, n.else && n.else.k !== 'If' ? n.else : null].filter(Boolean);
  return [n.body].filter(Boolean);
}
rule({
  id: 'braces-required', ref: 'S121', type: 'S', sev: 'CR', debt: 2, tags: ['pitfall'], checker: 'S121',
  en: ['Control structures should use curly braces', 'Without braces it is easy to add a statement that looks conditional but is not.', 'Wrap the body in curly braces.'],
  ko: ['제어 구조에는 중괄호를 써야 합니다', '중괄호가 없으면 조건부로 보이지만 그렇지 않은 문장을 추가하기 쉽습니다.', '본문을 중괄호로 감쌉니다.'],
  msg: ['Add curly braces around the nested statement(s).', '중첩된 문장을 중괄호로 감쌉니다.'],
  on: {
    If: braces, While: braces, DoWhile: braces, For: braces, Foreach: braces,
  },
  bad: fn('    if ($a) // Noncompliant\n        echo 1;\n    foreach ($b as $x) echo $x; // Noncompliant'),
  good: fn('    if ($a) {\n        echo 1;\n    } elseif ($b) {\n        echo 2;\n    }\n    foreach ($b as $x) :\n        echo $x;\n    endforeach;'),
});
function braces(n, cx) {
  for (const b of bodiesOf(n)) if (b.k !== 'Block') { cx.report(n); return; }
}

rule({
  id: 'multiline-without-braces', ref: 'S2681', type: 'B', sev: 'MA', debt: 5, tags: ['cwe-483'], checker: 'NESTING_INDENT_MISMATCH',
  en: ['Multiline blocks should be enclosed in curly braces', 'A statement indented like the body of an if or loop without braces is executed unconditionally.', 'Add curly braces or fix the indentation.'],
  ko: ['여러 줄 블록은 중괄호로 감싸야 합니다', '중괄호 없는 if나 루프 본문처럼 들여쓴 문장은 조건 없이 실행됩니다.', '중괄호를 추가하거나 들여쓰기를 고칩니다.'],
  msg: ['This line will not be executed conditionally; only the first line of this {0}-line block will be.', '이 줄은 조건부로 실행되지 않습니다. 이 {0}줄 블록의 첫 줄만 조건부입니다.'],
  on: {
    Block: siblingCheck, Program: siblingCheck, Case(n, cx) { siblingCheck({ stmts: n.body }, cx); },
  },
  bad: fn('    if ($a)\n        foo();\n        bar(); // Noncompliant'),
  good: fn('    if ($a) {\n        foo();\n        bar();\n    }'),
});
function siblingCheck(n, cx) {
  const list = n.stmts || [];
  for (let i = 0; i < list.length - 1; i++) {
    const s = list[i];
    if (!['If', 'While', 'For', 'Foreach'].includes(s.k)) continue;
    const b = s.k === 'If' ? (s.else ? (s.else.k === 'If' ? null : s.else) : s.then) : s.body;
    if (!b || b.k === 'Block' || b.line === s.line) continue;
    const next = list[i + 1];
    if (next.line > b.endLine && next.col === b.col) {
      let count = 2;
      for (let j = i + 2; j < list.length && list[j].col === b.col; j++) count++;
      cx.report(next, count);
    }
  }
}

rule({
  id: 'misleading-indentation', ref: 'S3973', type: 'S', sev: 'CR', debt: 2, tags: ['confusing'], checker: 'NESTING_INDENT_MISMATCH',
  en: ['A conditionally executed single line should be denoted by indentation', 'A body without braces that is not indented looks like it always runs.', 'Indent the conditional statement or add curly braces.'],
  ko: ['조건부로 실행되는 한 줄은 들여쓰기로 나타내야 합니다', '중괄호 없는 본문을 들여쓰지 않으면 항상 실행되는 것처럼 보입니다.', '조건부 문장을 들여쓰거나 중괄호를 추가합니다.'],
  msg: ['Use indentation to denote the code conditionally executed by this "{0}".', '이 "{0}"가 조건부로 실행하는 코드를 들여쓰기로 나타냅니다.'],
  on: {
    If: indentCheck, While: indentCheck, For: indentCheck, Foreach: indentCheck,
  },
  bad: fn('    if ($a) // Noncompliant\n    foo();\n    bar();'),
  good: fn('    if ($a)\n        foo();\n    bar();'),
});
function indentCheck(n, cx) {
  for (const b of bodiesOf(n)) {
    if (b.k === 'Block' || b.line === n.line) continue;
    const kwCol = n.col;
    if (b.col <= kwCol) { cx.report(n, n.k === 'If' ? 'if' : n.k.toLowerCase()); return; }
  }
}

rule({
  id: 'same-line-if', ref: 'S3972', type: 'S', sev: 'CR', debt: 2, tags: ['suspicious'], checker: 'S3972',
  en: ['Conditionals should start on new lines', 'An "if" right after the closing brace of another one looks like a forgotten "else".', 'Start the if on a new line, or add the missing else.'],
  ko: ['조건문은 새 줄에서 시작해야 합니다', '다른 if의 닫는 중괄호 바로 뒤의 if는 else를 빠뜨린 것처럼 보입니다.', 'if를 새 줄에서 시작하거나 빠진 else를 추가합니다.'],
  msg: ['Move this "if" to a new line or add the missing "else".', '이 if를 새 줄로 옮기거나 빠진 else를 추가합니다.'],
  on: {
    Block: sameLine, Program: sameLine,
  },
  bad: fn('    if ($a) {\n        echo 1;\n    } if ($b) { // Noncompliant\n        echo 2;\n    }'),
  good: fn('    if ($a) {\n        echo 1;\n    }\n    if ($b) {\n        echo 2;\n    }'),
});
function sameLine(n, cx) {
  const list = n.stmts || [];
  for (let i = 1; i < list.length; i++) {
    if (list[i].k === 'If' && list[i - 1].k === 'If' && list[i - 1].endLine === list[i].line) cx.report(list[i]);
  }
}

// ── files
function topLevel(ast) {
  const out = [];
  const visit = (list) => {
    for (const s of list) {
      if (s.k === 'Namespace' && s.stmts) visit(s.stmts);
      else if (s.k === 'Declare' && s.body && s.body.k === 'Block') visit(s.body.stmts);
      else out.push(s);
    }
  };
  visit(ast.stmts);
  return out;
}
rule({
  id: 'one-class-per-file', ref: 'S1996', type: 'S', sev: 'MA', debt: 10, tags: ['psr1', 'design'], checker: 'S1996',
  en: ['Files should contain only one top-level class or interface each', 'PSR-4 autoloading expects one class per file named after it.', 'Move each class into its own file.'],
  ko: ['파일마다 최상위 클래스나 인터페이스는 하나만 있어야 합니다', 'PSR-4 오토로딩은 파일마다 같은 이름의 클래스 하나를 기대합니다.', '클래스마다 별도 파일로 옮깁니다.'],
  msg: ['There are {0} independent classes in this file; move this one to its own file.', '이 파일에 독립 클래스가 {0}개 있습니다. 이 클래스를 별도 파일로 옮깁니다.'],
  file(pf, cx) {
    const cs = topLevel(pf.ast).filter((s) => s.k === 'ClassDecl');
    if (cs.length > 1) for (const c of cs.slice(1)) cx.reportName(c, cs.length);
  },
  bad: php('class A\n{\n}\nclass B // Noncompliant\n{\n}'),
  good: php('class A\n{\n}'),
});

rule({
  id: 'side-effects-with-symbols', ref: 'S2036', type: 'S', sev: 'MA', debt: 10, tags: ['psr1', 'design'], checker: 'S2036',
  en: ['Files that define symbols should not cause side-effects', 'PSR-1: a file should either declare classes and functions or execute logic, not both, so including it is predictable.', 'Move the executable statements to another file.'],
  ko: ['기호를 정의하는 파일은 부작용을 일으키면 안 됩니다', 'PSR-1: 파일은 클래스와 함수를 선언하거나 로직을 실행해야 하며 둘 다 하면 안 됩니다.', '실행 문장을 다른 파일로 옮깁니다.'],
  msg: ['Refactor this file to either declare symbols or cause side effects, but not both.', '이 파일이 기호를 선언하거나 부작용을 일으키되 둘 다 하지 않도록 고칩니다.'],
  file(pf, cx) {
    const top = topLevel(pf.ast);
    if (!top.some((s) => s.k === 'ClassDecl' || s.k === 'FuncDecl')) return;
    const allowed = (s) => {
      if (['ClassDecl', 'FuncDecl', 'Use', 'Const', 'Nop', 'Namespace', 'Declare', 'HaltCompiler'].includes(s.k)) return true;
      if (s.k === 'InlineHTML') return !/\S/.test(s.text);
      if (s.k === 'ExprStmt' && H.isCall(A.unparen(s.e), ['define'])) return true;
      if (s.k === 'If' && A.contains(s.cond, (x) => H.isCall(x, ['function_exists', 'class_exists', 'interface_exists', 'defined']))) return true;
      return false;
    };
    const bad = top.find((s) => !allowed(s));
    if (bad) cx.report(bad);
  },
  bad: php('class Config\n{\n}\necho \'loaded\'; // Noncompliant'),
  good: php('class Config\n{\n}\ndefine(\'APP_ENV\', \'prod\');'),
});

rule({
  id: 'literal-concatenation', ref: 'S2005', type: 'S', sev: 'MI', debt: 1, tags: ['clumsy'], checker: 'S2005',
  en: ['String literals should not be concatenated', 'Concatenating two literals on the same line is just one longer literal.', 'Merge the two literals.'],
  ko: ['문자열 리터럴끼리 이으면 안 됩니다', '같은 줄에서 두 리터럴을 이으면 그냥 더 긴 리터럴 하나입니다.', '두 리터럴을 합칩니다.'],
  msg: ['Combine these strings instead of concatenating them.', '이 문자열들을 잇지 말고 하나로 합칩니다.'],
  on: {
    Bin(n, cx) {
      if (n.op !== '.') return;
      const l = A.unparen(n.l);
      const r = A.unparen(n.r);
      const lastLit = l.k === 'Bin' && l.op === '.' ? A.unparen(l.r) : l;
      if (lastLit.k === 'Lit' && lastLit.kind === 'str' && r.k === 'Lit' && r.kind === 'str' && lastLit.endLine === r.line) cx.report(n);
    },
  },
  bad: php('$msg = \'Hello \' . \'world\'; // Noncompliant'),
  good: php('$msg = \'Hello world\';\n$long = \'first part \'\n    . \'second part\';'),
});

// ── obsolete and deprecated
const ALIASES = { sizeof: 'count', join: 'implode', chop: 'rtrim', doubleval: 'floatval', fputs: 'fwrite', ini_alter: 'ini_set', is_double: 'is_float', is_integer: 'is_int', is_long: 'is_int', is_writeable: 'is_writable', key_exists: 'array_key_exists', pos: 'current', show_source: 'highlight_file', strchr: 'strstr', diskfreespace: 'disk_free_space', set_file_buffer: 'stream_set_write_buffer', socket_getopt: 'socket_get_option', socket_setopt: 'socket_set_option', gzputs: 'gzwrite', mysqli_escape_string: 'mysqli_real_escape_string', checkdnsrr: 'dns_check_record', getmxrr: 'dns_get_mx' };
rule({
  id: 'alias-functions', ref: 'S2050', type: 'S', sev: 'MI', debt: 2, tags: ['convention'], checker: 'S2050',
  en: ['Alias functions should not be used', 'Aliases such as sizeof() or join() are less known than the original functions and some are deprecated.', 'Call the original function.'],
  ko: ['별칭 함수를 쓰면 안 됩니다', 'sizeof()나 join() 같은 별칭은 원래 함수보다 덜 알려져 있고 일부는 폐기 예정입니다.', '원래 함수를 호출합니다.'],
  msg: ['Replace "{0}()" with "{1}()".', '"{0}()"를 "{1}()"로 바꿉니다.'],
  on: { Call(n, cx) { const nm = A.callName(n); if (nm && Object.prototype.hasOwnProperty.call(ALIASES, nm)) cx.report(n, nm, ALIASES[nm]); } },
  bad: fn('    return join(\',\', $a) . sizeof($b); // Noncompliant'),
  good: fn('    return implode(\',\', $a) . count($b);'),
});

const DEPRECATED = new Set(['call_user_method', 'call_user_method_array', 'define_syslog_variables', 'dl', 'ereg', 'ereg_replace', 'eregi', 'eregi_replace', 'set_magic_quotes_runtime', 'magic_quotes_runtime', 'session_register', 'session_unregister', 'session_is_registered', 'set_socket_blocking', 'split', 'spliti', 'sql_regcase', 'each', 'create_function', 'money_format', 'utf8_encode', 'utf8_decode', 'strftime', 'gmstrftime', 'get_magic_quotes_gpc', 'get_magic_quotes_runtime', 'ezmlm_hash', 'restore_include_path', 'read_exif_data', 'image2wbmp', 'png2wbmp', 'jpeg2wbmp', 'gmp_random', 'convert_cyr_string', 'hebrevc', 'fgetss', 'is_real', 'mhash', 'odbc_result_all', 'date_sunrise', 'date_sunset', 'libxml_disable_entity_loader', 'mysql_connect', 'mysql_query', 'mysql_select_db', 'mysql_fetch_array', 'mysql_fetch_assoc', 'mysql_fetch_row', 'mysql_num_rows', 'mysql_close', 'mysql_error', 'mysql_escape_string', 'mysql_real_escape_string', 'mysql_db_query', 'mysql_insert_id', 'mysql_result']);
rule({
  id: 'deprecated-functions', ref: 'S2001', type: 'S', sev: 'MA', debt: 15, tags: ['obsolete'], checker: 'DEPRECATED',
  en: ['Deprecated and removed functions should not be used', 'These functions were deprecated or removed in recent PHP versions and break on upgrade.', 'Use the documented replacement (preg_*, mysqli/PDO, closures, mb_* ...).'],
  ko: ['폐기되었거나 제거된 함수를 쓰면 안 됩니다', '이 함수들은 최근 PHP 버전에서 폐기되거나 제거되어 업그레이드하면 깨집니다.', '문서에 나온 대체 함수(preg_*, mysqli/PDO, 클로저, mb_* 등)를 씁니다.'],
  msg: ['Remove this use of the deprecated "{0}()" function.', '폐기된 "{0}()" 함수 사용을 지웁니다.'],
  on: { Call(n, cx) { const nm = A.callName(n); if (DEPRECATED.has(nm)) cx.report(n, nm); } },
  bad: fn('    $parts = split(\',\', $a); // Noncompliant\n    return mysql_query($b); // Noncompliant'),
  good: fn('    $parts = explode(\',\', $a);\n    return $b->query($c);'),
});

const DEPRECATED_VARS = new Set(['HTTP_GET_VARS', 'HTTP_POST_VARS', 'HTTP_COOKIE_VARS', 'HTTP_SERVER_VARS', 'HTTP_ENV_VARS', 'HTTP_SESSION_VARS', 'HTTP_POST_FILES', 'HTTP_RAW_POST_DATA', 'php_errormsg']);
rule({
  id: 'deprecated-variables', ref: 'S1600', type: 'S', sev: 'MA', debt: 5, tags: ['obsolete'], checker: 'DEPRECATED',
  en: ['Deprecated predefined variables should not be used', 'Long superglobal names such as $HTTP_GET_VARS no longer exist.', 'Use $_GET, $_POST, $_SERVER, error_get_last() or php://input.'],
  ko: ['폐기된 미리 정의된 변수를 쓰면 안 됩니다', '$HTTP_GET_VARS 같은 긴 슈퍼글로벌 이름은 더 이상 없습니다.', '$_GET, $_POST, $_SERVER, error_get_last(), php://input을 씁니다.'],
  msg: ['Replace "${0}" with its modern equivalent.', '"${0}"를 최신 대응 항목으로 바꿉니다.'],
  on: { Var(n, cx) { if (DEPRECATED_VARS.has(n.name)) cx.report(n, n.name); } },
  bad: fn('    return $HTTP_GET_VARS[\'id\']; // Noncompliant'),
  good: fn('    return $_GET[\'id\'];'),
});

rule({
  id: 'require-once', ref: 'S2003', type: 'S', sev: 'CR', debt: 5, tags: ['pitfall'], checker: 'S2003',
  en: ['"require_once" and "include_once" should be used instead of "require" and "include"', 'Including the same file twice redeclares its functions and classes, which is a fatal error.', 'Use require_once / include_once.'],
  ko: ['require와 include 대신 require_once와 include_once를 써야 합니다', '같은 파일을 두 번 포함하면 함수와 클래스가 다시 선언되어 치명적 오류가 납니다.', 'require_once / include_once를 씁니다.'],
  msg: ['Replace "{0}" with "{0}_once".', '"{0}"를 "{0}_once"로 바꿉니다.'],
  on: { Include(n, cx) { if (n.kind === 'require' || n.kind === 'include') cx.report(n, n.kind); } },
  bad: php('require \'lib.php\'; // Noncompliant\ninclude \'view.php\'; // Noncompliant'),
  good: php('require_once \'lib.php\';\ninclude_once \'view.php\';'),
});

rule({
  id: 'logical-keywords', ref: 'S2010', type: 'S', sev: 'MI', debt: 2, tags: ['pitfall'], checker: 'BAD_OPERATOR',
  en: ['"&&" and "||" should be used instead of "and" and "or"', '"and" / "or" bind weaker than "=", so "$x = a and b" assigns only a.', 'Use && and ||.'],
  ko: ['and와 or 대신 &&와 ||를 써야 합니다', 'and / or는 =보다 약하게 결합하므로 "$x = a and b"는 a만 대입합니다.', '&&와 ||를 씁니다.'],
  msg: ['Replace "{0}" with "{1}".', '"{0}"를 "{1}"로 바꿉니다.'],
  on: { Bin(n, cx) { if (n.kwOp && (n.op === 'and' || n.op === 'or')) cx.report({ line: n.opLine, col: n.opCol }, n.op, n.op === 'and' ? '&&' : '||'); } },
  bad: fn('    $ok = $a and $b; // Noncompliant\n    return $ok;'),
  good: fn('    $ok = $a && $b;\n    return $ok;'),
});

rule({
  id: 'echo-parentheses', ref: 'S2041', type: 'S', sev: 'MI', debt: 1, tags: ['clumsy'], checker: 'S2041',
  en: ['Parentheses should not be used for calls to "echo"', 'echo is a language construct, not a function; the parentheses are misleading and break with several arguments.', 'Remove the parentheses.'],
  ko: ['echo 호출에 괄호를 쓰면 안 됩니다', 'echo는 함수가 아닌 언어 구문이므로 괄호는 오해를 부르고 인수가 여럿이면 깨집니다.', '괄호를 지웁니다.'],
  msg: ['Remove the parentheses from this "echo" call.', '이 echo 호출에서 괄호를 지웁니다.'],
  on: { Echo(n, cx) { if (n.args.length === 1 && n.args[0].k === 'Paren' && !n.openEcho && n.args[0].end === n.end - 1) cx.report(n); } },
  bad: php('echo(\'Hello\'); // Noncompliant'),
  good: php('echo \'Hello\';\necho ($a + 1) * 2;'),
});

rule({
  id: 'require-in-namespace', ref: 'S4833', type: 'S', sev: 'CR', debt: 5, tags: ['psr4'], checker: 'S4833',
  en: ['Classes should be loaded with "use" and autoloading instead of "require"', 'In namespaced code, requiring class files by hand bypasses the autoloader and creates load-order bugs.', 'Import the class with "use" and rely on the autoloader.'],
  ko: ['클래스는 require 대신 use와 오토로딩으로 불러와야 합니다', '네임스페이스 코드에서 클래스 파일을 손으로 require하면 오토로더를 건너뛰고 로딩 순서 버그가 생깁니다.', 'use로 클래스를 가져오고 오토로더에 맡깁니다.'],
  msg: ['Replace this "{0}" with a "use" statement.', '이 "{0}"를 use 문으로 바꿉니다.'],
  on: {
    Include(n, cx) {
      if (!cx.pf.namespace) return;
      const p = H.strConst(n.e) || (A.unparen(n.e).k === 'Bin' ? H.strConst(A.unparen(n.e).r) : null);
      if (p && /(^|\/)[A-Z][A-Za-z0-9]*\.php$/.test(p)) cx.report(n, n.kind);
    },
  },
  bad: php('namespace App;\nrequire_once __DIR__ . \'/Model/User.php\'; // Noncompliant\nuse App\\Model\\User;\nfunction f()\n{\n    return new User();\n}'),
  good: php('namespace App;\nrequire_once __DIR__ . \'/helpers.php\';\nuse App\\Model\\User;\nfunction f()\n{\n    return new User();\n}'),
});

rule({
  id: 'error-suppression', ref: '', type: 'S', sev: 'MA', debt: 5, tags: ['error-handling'], checker: 'SUPPRESSED_ERROR',
  en: ['Errors should not be silenced with "@"', 'The @ operator hides warnings that point to real problems and makes debugging harder.', 'Check the condition explicitly or handle the error.'],
  ko: ['@로 오류를 숨기면 안 됩니다', '@ 연산자는 실제 문제를 알려 주는 경고를 숨겨 디버깅을 어렵게 합니다.', '조건을 명시적으로 검사하거나 오류를 처리합니다.'],
  msg: ['Remove the "@" error suppression operator.', '오류 억제 연산자 "@"를 지웁니다.'],
  on: { Unary(n, cx) { if (n.op === '@') cx.report(n); } },
  bad: fn('    return @file_get_contents($a); // Noncompliant'),
  good: fn('    if (!is_readable($a)) {\n        return null;\n    }\n    return file_get_contents($a);'),
});

const CODE_RE = /^\s*(\$[A-Za-z_]\w*\s*(=|->|\[|\+\+|--)|(echo|return|print|require_once|include_once|throw)\b.*;\s*$|(if|for|foreach|while|switch)\s*\(.*\)\s*\{?\s*$|\}\s*(else\b.*)?\{?\s*$|[A-Za-z_]\w*\s*\(.*\)\s*;\s*$)/;
rule({
  id: 'commented-out-code', ref: 'S125', type: 'S', sev: 'MA', debt: 5, tags: ['unused'], checker: 'S125',
  en: ['Sections of code should not be commented out', 'Commented-out code distracts readers and rots quickly; version control keeps the history.', 'Remove the commented-out code.'],
  ko: ['코드 구역을 주석 처리하면 안 됩니다', '주석 처리된 코드는 읽는 사람을 산만하게 하고 금방 낡으며 이력은 버전 관리가 보관합니다.', '주석 처리된 코드를 지웁니다.'],
  msg: ['Remove this commented out code.', '주석 처리된 이 코드를 지웁니다.'],
  file(pf, cx) {
    let prevLine = -10;
    for (const c of pf.comments) {
      if (c.kind === 'doc') continue;
      const body = c.kind === 'block' ? c.text.slice(2, -2) : c.text.replace(/^(\/\/|#)/, '');
      const lines = body.split('\n').map((l) => l.replace(/^\s*\*?/, ''));
      if (!lines.some((l) => CODE_RE.test(l))) continue;
      if (c.line === prevLine + 1) { prevLine = c.line; continue; }
      prevLine = c.line;
      cx.report(c);
    }
  },
  bad: fn('    // $total = $a + $b; // Noncompliant\n    return $a;'),
  good: fn('    // add the two numbers and return the sum\n    return $a + $b;'),
});
