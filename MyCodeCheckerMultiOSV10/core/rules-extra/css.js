'use strict';

// CSS (also SCSS and Less).

const { maker } = require('./util');

const R = maker('css', ['css']);

R('import', 'S', 'MI', 5, ['performance'],
  /^\s*@import\b(?!\s+['"][^'"]*\.(?:scss|sass|less)['"])/i,
  ['@import in CSS', 'CSS @import loads files one after another and delays rendering.', 'Bundle the files or use <link> tags; in Sass prefer @use.'],
  ['CSS에서 @import를 씁니다', 'CSS @import는 파일을 차례로 불러와 렌더링을 늦춥니다.', '파일을 묶거나 <link>를 쓰고 Sass에서는 @use를 쓰세요.'],
  "@import url('theme.css');", "@use 'theme';");
R('http-url', 'V', 'MA', 10, ['cwe-319', 'owasp-a02'],
  /url\s*\(\s*['"]?http:\/\/(?!localhost|127\.0\.0\.1)|@import\s+['"]http:\/\//i,
  ['Resource loaded over plain HTTP', 'Fonts, images and styles over HTTP can be replaced on the network.', 'Use https.'],
  ['평문 HTTP로 리소스를 불러옵니다', 'HTTP의 글꼴, 이미지, 스타일은 네트워크에서 바뀔 수 있습니다.', 'https를 쓰세요.'],
  "background: url('http://cdn.example.com/bg.png');", "background: url('https://cdn.example.com/bg.png');");
R('javascript-url', 'V', 'MA', 10, ['cwe-79', 'xss'],
  /url\s*\(\s*['"]?\s*javascript:/i,
  ['javascript: URL in CSS', 'Old engines run script from CSS URLs.', 'Remove the javascript: URL.'],
  ['CSS 안의 javascript: URL입니다', '예전 엔진은 CSS URL의 스크립트를 실행합니다.', 'javascript: URL을 지우세요.'],
  'background: url("javascript:alert(1)");', 'background: url("/img/bg.png");');
R('behavior-binding', 'V', 'MA', 10, ['cwe-94'],
  /\b(?:behavior|-moz-binding)\s*:\s*url/i,
  ['behavior / -moz-binding', 'These legacy properties load script components from CSS.', 'Remove them.'],
  ['behavior / -moz-binding을 씁니다', '이 예전 속성은 CSS에서 스크립트 구성 요소를 불러옵니다.', '지우세요.'],
  'behavior: url(hover.htc);', 'transition: color 0.2s;');
R('zero-with-unit', 'S', 'IN', 1, ['clumsy'],
  /(?<![\w.#-])0(?:px|em|rem|pt|cm|mm|in|pc|ex|ch|vh|vw|vmin|vmax)\b/,
  ['Unit on a zero length', '0px is the same as 0.', 'Write 0.'],
  ['0 길이에 단위를 붙입니다', '0px는 0과 같습니다.', '0으로 쓰세요.'],
  'margin: 0px;', ['margin: 0;', 'width: 10px;', 'flex: 1 1 0%;']);
R('duplicate-property', 'B', 'MA', 5, ['pitfall'],
  /(?:^|[{;])\s*([a-z-]+)\s*:[^;{}]*;\s*(?:[a-z-]+\s*:[^;{}]*;\s*)*\1\s*:/i,
  ['Property repeated in one rule', 'The later value silently wins, which is usually a mistake.', 'Keep one declaration (fallbacks belong on separate lines with a comment).'],
  ['한 규칙에서 속성을 반복합니다', '뒤의 값이 조용히 이기며 보통 실수입니다.', '선언을 하나만 두세요(대체 값은 주석과 함께 따로 쓰세요).'],
  '.a { color: red; margin: 0; color: blue; }', '.a { color: red; margin: 0; }');
R('empty-rule', 'S', 'MI', 2, ['unused'],
  /[^\s{][^{}]*\{\s*\}/,
  ['Empty rule', 'An empty rule adds bytes and noise.', 'Delete it.'],
  ['빈 규칙입니다', '빈 규칙은 바이트와 잡음만 늘립니다.', '지우세요.'],
  '.card {}', '.card { padding: 8px; }');
R('invalid-hex-color', 'B', 'MA', 2, ['pitfall'],
  /(?:^|[{;])\s*[a-z-]+\s*:\s*[^;{}]*#(?:[0-9a-fA-F]{1,2}|[0-9a-fA-F]{5}|[0-9a-fA-F]{7})(?![\w-])/,
  ['Invalid hex color', 'Hex colors have 3, 4, 6 or 8 digits; other lengths are ignored.', 'Fix the color value.'],
  ['잘못된 16진 색상입니다', '16진 색상은 3, 4, 6, 8자리이며 다른 길이는 무시됩니다.', '색상 값을 고치세요.'],
  'color: #ff00f;', ['color: #ff00ff;', 'a:hover #ab {'],
  { skip: (raw) => /[{,]\s*$/.test(raw) && !/;/.test(raw) });
R('obsolete-vendor-prefix', 'S', 'IN', 1, ['deprecated'],
  /(?:^|[\s;{])-(?:webkit|moz|ms|o)-(?:border-radius|box-shadow|transition|transform|animation|box-sizing|opacity|background-size|border-image|text-shadow)\s*:/,
  ['Vendor prefix no longer needed', 'All current browsers support the standard property.', 'Drop the prefixed line or let Autoprefixer manage it.'],
  ['더 이상 필요 없는 공급자 접두사입니다', '현재 브라우저는 모두 표준 속성을 지원합니다.', '접두사 줄을 지우거나 Autoprefixer에 맡기세요.'],
  '-webkit-border-radius: 4px;', 'border-radius: 4px;');
R('font-family-no-generic', 'S', 'MI', 2, ['robustness'],
  /\bfont-family\s*:(?![^;}]*\b(?:serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-sans-serif|ui-serif|ui-monospace|emoji|math|inherit|initial|unset|revert)\b)(?![^;}]*(?:var\(|\$|@|#\{))[^;}]+[;}]/i,
  ['font-family without a generic fallback', 'If the named fonts are missing, the browser picks an arbitrary default.', 'End the list with a generic family such as sans-serif.'],
  ['일반 대체 글꼴 없는 font-family입니다', '지정한 글꼴이 없으면 브라우저가 아무 기본값이나 고릅니다.', 'sans-serif 같은 일반 계열로 목록을 끝내세요.'],
  'font-family: "Helvetica Neue", Arial;', 'font-family: "Helvetica Neue", Arial, sans-serif;');
R('huge-z-index', 'S', 'MI', 2, ['maintainability'],
  /\bz-index\s*:\s*\d{5,}/i,
  ['Very large z-index', 'z-index arms races make stacking hard to reason about.', 'Use a small, documented scale of layers.'],
  ['아주 큰 z-index입니다', 'z-index 경쟁은 쌓임 순서를 이해하기 어렵게 합니다.', '작고 문서화된 계층 척도를 쓰세요.'],
  'z-index: 99999;', 'z-index: 30;');
R('outline-none', 'S', 'MA', 2, ['accessibility'],
  /\boutline\s*:\s*(?:none|0)\s*(?:!important\s*)?[;}]/i,
  ['Focus outline removed', 'Keyboard users can no longer see which element has focus.', 'Provide a visible :focus-visible style instead.'],
  ['초점 윤곽선을 지웁니다', '키보드 사용자가 어느 요소에 초점이 있는지 볼 수 없습니다.', '대신 보이는 :focus-visible 스타일을 주세요.'],
  'button:focus { outline: none; }', 'button:focus-visible { outline: 2px solid #4a90e2; }',
  { skip: (raw) => /:focus-visible/.test(raw) });
R('ie-filter', 'S', 'MI', 2, ['deprecated'],
  /\bfilter\s*:\s*progid:|-ms-filter\s*:/i,
  ['Internet Explorer filter', 'progid filters only ever worked in old Internet Explorer.', 'Remove them.'],
  ['Internet Explorer 필터입니다', 'progid 필터는 예전 Internet Explorer에서만 동작했습니다.', '지우세요.'],
  'filter: progid:DXImageTransform.Microsoft.gradient(startColorstr="#000", endColorstr="#fff");', 'background: linear-gradient(#000, #fff);');
R('browser-hack', 'S', 'MI', 2, ['deprecated'],
  /(?:^|[;{\s])[*_][a-z-]+\s*:/,
  ['Star or underscore property hack', '*zoom and _height target old Internet Explorer and are invalid CSS.', 'Remove the hack.'],
  ['별표나 밑줄 속성 핵입니다', '*zoom과 _height는 예전 Internet Explorer용이며 올바른 CSS가 아닙니다.', '핵을 지우세요.'],
  '.box { *zoom: 1; }', '.box { display: flow-root; }');
R('calc-operator-spacing', 'B', 'MA', 2, ['pitfall'],
  /calc\s*\([^)]*(?:[\w%)]\+[\w(.]|\d[a-z%]*-\d)/i,
  ['calc() operator without spaces', '+ and - inside calc() must be surrounded by spaces or the whole value is invalid.', 'Write calc(100% - 10px).'],
  ['공백 없는 calc() 연산자입니다', 'calc() 안의 +와 -는 공백으로 둘러싸야 하며 아니면 값 전체가 무효입니다.', 'calc(100% - 10px)처럼 쓰세요.'],
  'width: calc(100%-10px);', ['width: calc(100% - 10px);', 'width: calc(var(--a-b) * 2);']);
R('transition-all', 'S', 'IN', 1, ['performance'],
  /\btransition\s*:\s*all\b/i,
  ['transition: all', 'Animating every property can trigger expensive layout work.', 'List the properties that change.'],
  ['transition: all을 씁니다', '모든 속성을 애니메이션하면 비싼 레이아웃 작업이 생길 수 있습니다.', '바뀌는 속성을 나열하세요.'],
  'transition: all 0.3s ease;', 'transition: opacity 0.3s ease;');
R('deep-selector', 'S', 'MI', 5, ['maintainability'],
  /^\s*(?:[^\s{},]+\s+(?:[>+~]\s+)?){5,}[^\s{},]+\s*\{/,
  ['Selector nested too deeply', 'Long descendant chains are fragile and slow to match.', 'Give the element a class.'],
  ['선택자가 너무 깊게 중첩됩니다', '긴 자손 체인은 깨지기 쉽고 일치가 느립니다.', '요소에 클래스를 주세요.'],
  'body main .content .list ul li a {', '.list-link {');
R('universal-attribute-selector', 'S', 'MI', 2, ['performance'],
  /(?:^|[\s,>+~])\*\s*\[[^\]]+\]/,
  ['Universal selector with an attribute', '*[attr] tests every element on the page.', 'Scope the selector to an element or class.'],
  ['속성이 붙은 전체 선택자입니다', '*[attr]은 페이지의 모든 요소를 검사합니다.', '선택자를 요소나 클래스로 좁히세요.'],
  '*[data-tooltip] { position: relative; }', '.has-tooltip { position: relative; }');
R('important-in-keyframes', 'B', 'MI', 2, ['pitfall'],
  /^\s*(?:from|to|\d+%)\s*\{[^}]*!important/i,
  ['!important inside @keyframes', 'Declarations with !important in keyframes are ignored.', 'Remove !important from the keyframe.'],
  ['@keyframes 안의 !important입니다', '키프레임에서 !important가 붙은 선언은 무시됩니다.', '키프레임에서 !important를 지우세요.'],
  'from { opacity: 0 !important; }', 'from { opacity: 0; }');
R('unit-on-line-height', 'S', 'IN', 1, ['robustness'],
  /\bline-height\s*:\s*\d+(?:\.\d+)?px\b/i,
  ['line-height in px', 'A fixed px line height does not scale with the font size.', 'Use a unitless value such as 1.5.'],
  ['px 단위 line-height입니다', '고정 px 줄 높이는 글꼴 크기에 맞춰 늘지 않습니다.', '1.5 같은 단위 없는 값을 쓰세요.'],
  'line-height: 18px;', 'line-height: 1.5;');

module.exports = { RULES: R.rules };
