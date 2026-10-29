'use strict';

// HTML (also .htm and .vue templates).

const { maker } = require('./util');

const R = maker('html', ['html']);

R('http-subresource', 'V', 'MA', 10, ['cwe-319', 'owasp-a02'],
  /<(?:script|link|iframe|img|audio|video|source|embed|object)\b[^>]*\b(?:src|href|data)\s*=\s*['"]http:\/\/(?!localhost|127\.0\.0\.1)/i,
  ['Resource loaded over plain HTTP', 'Scripts and frames over HTTP can be replaced on the network (mixed content).', 'Load the resource over https.'],
  ['평문 HTTP로 리소스를 불러옵니다', 'HTTP의 스크립트와 프레임은 네트워크에서 바꿔치기될 수 있습니다(혼합 콘텐츠).', 'https로 리소스를 불러오세요.'],
  '<script src="http://cdn.example.com/lib.js"></script>', '<script src="https://cdn.example.com/lib.js"></script>');
R('script-without-integrity', 'H', 'MA', 10, ['cwe-353', 'owasp-a08', 'supply-chain'],
  /<script\b(?=[^>]*\bsrc\s*=\s*['"](?:https?:)?\/\/)(?![^>]*\bintegrity\s*=)[^>]*>/i,
  ['Third-party script without integrity', 'If the CDN is compromised, the changed script runs on your page.', 'Add integrity="sha384-..." and crossorigin="anonymous".'],
  ['integrity 없는 외부 스크립트입니다', 'CDN이 뚫리면 바뀐 스크립트가 페이지에서 실행됩니다.', 'integrity="sha384-..."와 crossorigin="anonymous"를 추가하세요.'],
  '<script src="https://cdn.example.com/lib.js"></script>', ['<script src="https://cdn.example.com/lib.js" integrity="sha384-abc" crossorigin="anonymous"></script>', '<script src="/js/app.js"></script>']);
R('inline-event-handler', 'S', 'MI', 5, ['csp'],
  /<[a-z][\w-]*\b[^>]*\son(?:click|load|error|mouseover|mouseout|submit|change|focus|blur|keydown|keyup|keypress|input|dblclick)\s*=/i,
  ['Inline event handler', 'onclick attributes block a strict Content-Security-Policy and mix logic into markup.', 'Attach listeners from script with addEventListener.'],
  ['인라인 이벤트 핸들러입니다', 'onclick 속성은 엄격한 CSP를 막고 마크업에 로직을 섞습니다.', '스크립트에서 addEventListener로 붙이세요.'],
  '<button onclick="save()">Save</button>', '<button id="save">Save</button>');
R('javascript-href', 'V', 'MA', 10, ['cwe-79', 'xss'],
  /\bhref\s*=\s*['"]\s*javascript:/i,
  ['javascript: link', 'A javascript: URL runs script and blocks a strict CSP.', 'Use a button with an event listener.'],
  ['javascript: 링크입니다', 'javascript: URL은 스크립트를 실행하고 엄격한 CSP를 막습니다.', '이벤트 리스너가 있는 버튼을 쓰세요.'],
  '<a href="javascript:void(0)" id="menu">Menu</a>', '<button type="button" id="menu">Menu</button>');
R('html-lang-missing', 'S', 'MI', 2, ['accessibility'],
  /<html\b(?![^>]*\blang\s*=)[^>]*>/i,
  ['<html> without lang', 'Screen readers and translators need the page language.', 'Add lang, for example <html lang="en">.'],
  ['lang 없는 <html>입니다', '화면 낭독기와 번역기는 페이지 언어가 필요합니다.', '<html lang="ko">처럼 lang을 추가하세요.'],
  '<html>', '<html lang="ko">');
R('iframe-without-sandbox', 'H', 'MI', 5, ['cwe-1021'],
  /<iframe\b(?![^>]*\bsandbox\b)[^>]*>/i,
  ['iframe without sandbox', 'Framed content can run script, open pop-ups and navigate the top page.', 'Add sandbox with only the permissions it needs.'],
  ['sandbox 없는 iframe입니다', '프레임 콘텐츠가 스크립트를 실행하고 팝업을 열고 상위 페이지를 이동할 수 있습니다.', '필요한 권한만 담은 sandbox를 추가하세요.'],
  '<iframe src="https://widgets.example.com/chat"></iframe>', '<iframe src="https://widgets.example.com/chat" sandbox="allow-scripts" title="Chat"></iframe>');
R('iframe-without-title', 'S', 'MI', 2, ['accessibility'],
  /<iframe\b(?![^>]*\btitle\s*=)[^>]*>/i,
  ['iframe without title', 'Screen readers announce untitled frames as "frame".', 'Add a short title.'],
  ['title 없는 iframe입니다', '화면 낭독기는 제목 없는 프레임을 그냥 "frame"으로 읽습니다.', '짧은 title을 추가하세요.'],
  '<iframe src="map.html" sandbox></iframe>', '<iframe src="map.html" sandbox title="Store map"></iframe>');
R('form-http-action', 'V', 'CR', 15, ['cwe-319', 'owasp-a02'],
  /<form\b[^>]*\baction\s*=\s*['"]http:\/\/(?!localhost|127\.0\.0\.1)/i,
  ['Form posts over plain HTTP', 'Submitted data, often credentials, travels unencrypted.', 'Post to an https URL.'],
  ['평문 HTTP로 폼을 보냅니다', '제출한 데이터(종종 자격 증명)가 암호화되지 않고 전송됩니다.', 'https URL로 보내세요.'],
  '<form action="http://example.com/login" method="post">', '<form action="https://example.com/login" method="post">');
R('meta-refresh', 'S', 'MI', 5, ['accessibility'],
  /<meta\b[^>]*http-equiv\s*=\s*['"]refresh['"]/i,
  ['meta refresh', 'Automatic refreshes and redirects disorient users and assistive tools.', 'Redirect on the server, or let the user choose.'],
  ['meta refresh입니다', '자동 새로 고침과 리다이렉트는 사용자와 보조 도구를 혼란스럽게 합니다.', '서버에서 리다이렉트하거나 사용자가 고르게 하세요.'],
  '<meta http-equiv="refresh" content="5; url=/home">', '<link rel="canonical" href="/home">');
R('viewport-zoom-disabled', 'S', 'MA', 2, ['accessibility'],
  /<meta\b[^>]*name\s*=\s*['"]viewport['"][^>]*(?:user-scalable\s*=\s*(?:no|0)\b|maximum-scale\s*=\s*1(?:\.0)?\b)/i,
  ['Zoom disabled in the viewport', 'Users with low vision cannot enlarge the page.', 'Remove user-scalable=no and maximum-scale=1.'],
  ['뷰포트에서 확대를 막습니다', '저시력 사용자가 페이지를 확대할 수 없습니다.', 'user-scalable=no와 maximum-scale=1을 지우세요.'],
  '<meta name="viewport" content="width=device-width, user-scalable=no">', '<meta name="viewport" content="width=device-width, initial-scale=1">');
R('deprecated-element', 'S', 'MI', 5, ['deprecated'],
  /<(?:font|center|marquee|blink|big|strike|tt|frameset|frame|acronym|applet|basefont|dir|isindex)\b/i,
  ['Obsolete HTML element', 'These elements are removed from HTML and behave inconsistently.', 'Use CSS or modern elements.'],
  ['사라진 HTML 요소입니다', '이 요소들은 HTML에서 제거됐고 동작이 일관되지 않습니다.', 'CSS나 최신 요소를 쓰세요.'],
  '<center>Welcome</center>', '<div class="center">Welcome</div>');
R('anchor-without-href', 'S', 'MI', 2, ['accessibility'],
  /<a(?![\w:-])(?![^>]*\b(?:href|name|id|routerLink|xlink:href)\]?\s*=)[^>]*>/i,
  ['<a> without href', 'Links without href cannot be reached with the keyboard.', 'Add href, or use a <button>.'],
  ['href 없는 <a>입니다', 'href 없는 링크는 키보드로 닿을 수 없습니다.', 'href를 넣거나 <button>을 쓰세요.'],
  '<a class="btn">Open</a>', '<a class="btn" href="/open">Open</a>');
R('empty-heading', 'S', 'MI', 2, ['accessibility'],
  /<h[1-6]\b[^>]*>\s*<\/h[1-6]>/i,
  ['Empty heading', 'An empty heading breaks the document outline for screen readers.', 'Add text or remove the heading.'],
  ['빈 제목입니다', '빈 제목은 화면 낭독기의 문서 개요를 깨뜨립니다.', '텍스트를 넣거나 제목을 지우세요.'],
  '<h2></h2>', '<h2>Orders</h2>');
R('empty-link', 'S', 'MA', 2, ['accessibility'],
  /<a\b(?![^>]*\baria-label(?:ledby)?\s*=)(?![^>]*\btitle\s*=)[^>]*>\s*<\/a>/i,
  ['Link without text', 'Screen readers have nothing to announce for this link.', 'Add text or an aria-label.'],
  ['텍스트 없는 링크입니다', '화면 낭독기가 이 링크에서 읽을 것이 없습니다.', '텍스트나 aria-label을 추가하세요.'],
  '<a href="/cart"></a>', '<a href="/cart" aria-label="Cart"></a>');
R('object-embed', 'H', 'MI', 5, ['cwe-829'],
  /<(?:object|embed)\b/i,
  ['<object> or <embed>', 'Plug-in content runs outside the page\'s normal security model.', 'Use native HTML media elements.'],
  ['<object> 또는 <embed>입니다', '플러그인 콘텐츠는 페이지의 일반 보안 모델 밖에서 실행됩니다.', '기본 HTML 미디어 요소를 쓰세요.'],
  '<embed src="movie.swf">', '<video src="movie.mp4" controls></video>');
R('csp-unsafe', 'H', 'MA', 10, ['cwe-693', 'owasp-a05'],
  /Content-Security-Policy[^>]*'unsafe-(?:inline|eval)'/i,
  ['CSP allows unsafe-inline or unsafe-eval', 'The policy no longer stops injected scripts.', 'Use nonces or hashes instead.'],
  ['CSP가 unsafe-inline이나 unsafe-eval을 허용합니다', '정책이 더 이상 주입된 스크립트를 막지 못합니다.', '대신 nonce나 해시를 쓰세요.'],
  '<meta http-equiv="Content-Security-Policy" content="script-src \'self\' \'unsafe-inline\'">', '<meta http-equiv="Content-Security-Policy" content="script-src \'self\'">');
R('positive-tabindex', 'S', 'MI', 2, ['accessibility'],
  /\btabindex\s*=\s*['"]?[1-9]/i,
  ['Positive tabindex', 'Positive values reorder keyboard focus and confuse users.', 'Use 0 or -1 and fix the source order.'],
  ['양수 tabindex입니다', '양수 값은 키보드 초점 순서를 바꿔 사용자를 혼란스럽게 합니다.', '0이나 -1을 쓰고 원본 순서를 고치세요.'],
  '<input tabindex="3">', '<input tabindex="0">');
R('vue-v-html', 'H', 'MA', 10, ['cwe-79', 'owasp-a03', 'xss'],
  /\bv-html\s*=/,
  ['v-html directive', 'v-html renders raw HTML, so data in it can run script.', 'Use text interpolation, or sanitize first.'],
  ['v-html 지시어입니다', 'v-html은 HTML을 그대로 그려 데이터가 스크립트를 실행할 수 있습니다.', '텍스트 보간을 쓰거나 먼저 정화하세요.'],
  '<div v-html="comment.body"></div>', '<div>{{ comment.body }}</div>');
R('angular-innerhtml', 'H', 'MA', 10, ['cwe-79', 'owasp-a03', 'xss'],
  /\[innerHTML\]\s*=|\bbypassSecurityTrust(?:Html|Script|Url|ResourceUrl|Style)\b/,
  ['innerHTML binding', 'Binding HTML from data relies on sanitizing that bypass calls disable.', 'Bind text instead.'],
  ['innerHTML 바인딩입니다', '데이터로 HTML을 묶으면 우회 호출이 끄는 정화에 의존하게 됩니다.', '대신 텍스트를 바인딩하세요.'],
  '<div [innerHTML]="post.body"></div>', '<div>{{ post.body }}</div>');
R('autocomplete-sensitive', 'H', 'MI', 5, ['cwe-522'],
  /<input\b(?=[^>]*\bname\s*=\s*['"][^'"]*(?:card|cc-?num|cvv|cvc|(?<![a-z])(?:ssn|otp))[^'"]*['"])(?![^>]*\bautocomplete\s*=)[^>]*>/i,
  ['Sensitive field without autocomplete hint', 'Browsers may store card numbers or one-time codes in form history.', 'Set autocomplete="cc-number", "one-time-code" or "off" as fits.'],
  ['autocomplete 힌트 없는 민감 필드입니다', '브라우저가 카드 번호나 일회용 코드를 폼 기록에 저장할 수 있습니다.', '알맞게 autocomplete="cc-number", "one-time-code", "off"를 지정하세요.'],
  '<input name="card_number" type="text">', '<input name="card_number" type="text" autocomplete="cc-number">');

module.exports = { RULES: R.rules };
