// npm run build:docs — writes the user's guide, public/docs/UsersGuide.html (Korean) and
// UsersGuide.en.html (English), from the chapters below. The lists of tools, shapes, templates
// and shortcuts come from the program itself, so the guide never falls behind it.
// Pictures: public/docs/images/<lang>-*.png, taken from the real app by `npm run docs:shots`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ko from '../src/i18n/ko.js';
import en from '../src/i18n/en.js';
import { SHAPE_CATEGORIES, shapesIn } from '../src/lib/shapes.js';
import { TEMPLATES } from '../src/lib/templates.js';
import { THEMES } from '../src/lib/themes.js';
import { EMOJI, EMOJI_CATEGORIES, emojiChar, emojiIn } from '../src/lib/emoji.js';
import { EXAMPLES } from '../src/lib/examples.js';
import { MODEL_EXTS } from '../src/lib/model3d.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const TOOLS = ['select', 'hand', 'rect', 'roundRect', 'ellipse', 'line', 'arrowLine', 'poly', 'pen', 'brush', 'text', 'eyedropper', 'bucket', 'eraser'];
const KEYS = { select: 'V', hand: 'H', rect: 'R', roundRect: 'U', ellipse: 'O', line: 'L', arrowLine: 'A', poly: 'G', pen: 'P', brush: 'B', text: 'T', eyedropper: 'I', bucket: 'K', eraser: 'E' };

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fig = (lang, name, caption) => `<figure><img src="images/${lang}-${name}.png" alt="${esc(caption)}" loading="lazy"><figcaption>${esc(caption)}</figcaption></figure>`;

function chapters(lang) {
  const T = lang === 'ko' ? ko : en;
  const K = lang === 'ko';
  const toolRows = TOOLS.map((id) => `<tr><td><b>${esc(T[`tool.${id}`])}</b></td><td><kbd>${KEYS[id]}</kbd></td><td>${esc(T[`tip.${id}`])}</td></tr>`).join('');
  const shapeLists = SHAPE_CATEGORIES.map((c) => `<h3>${esc(T[`shapeCat.${c.id}`])} (${shapesIn(c.id).length})</h3><ul class="cols">${shapesIn(c.id).map((id) => `<li>${esc(T[`shape.${id}`])}</li>`).join('')}</ul>`).join('');
  const templateRows = TEMPLATES.map((tpl) => `<tr><td><b>${esc(T[`template.${tpl.id}`])}</b></td><td>${esc(T[`template.${tpl.id}.desc`])}</td></tr>`).join('');
  const total = SHAPE_CATEGORIES.reduce((n, c) => n + shapesIn(c.id).length, 0);
  const emojiRows = EMOJI_CATEGORIES.map((c) => `<tr><td><b>${esc(c[lang])}</b></td><td>${emojiIn(c.id).length}</td><td>${emojiIn(c.id).slice(0, 12).map((e) => emojiChar(e.id)).join(' ')} …</td></tr>`).join('');
  const exampleList = `<ul class="cols">${EXAMPLES.map((ex) => `<li>${esc(ex[lang])}</li>`).join('')}</ul>`;
  const modelFormats = MODEL_EXTS.map((e) => e.toUpperCase()).join(', ');
  const themes = THEMES.map((th) => th.name[lang]).join(', ');
  const shortcuts = [
    ['Ctrl+N', T['action.new']], ['Ctrl+O', T['action.open']], ['Ctrl+S', T['action.save']], ['Ctrl+Shift+S', T['action.saveAs']],
    ['Ctrl+Z', T['edit.undo']], ['Ctrl+Y / Ctrl+Shift+Z', T['edit.redo']], ['Ctrl+C', T['edit.copy']], ['Ctrl+V', T['edit.paste']], ['Ctrl+D', T['edit.duplicate']],
    ['Delete', T['edit.delete']], ['Esc', T['edit.deselect']], ['← ↑ → ↓ (Shift)', K ? '선택한 개체를 1px (10px) 옮기기' : 'Nudge the selection by 1 px (10 px)'],
    ['Ctrl++ / Ctrl+−', `${T['view.zoomIn']} / ${T['view.zoomOut']}`], ['Ctrl+0', T['view.fit']], [K ? '마우스 휠' : 'Mouse wheel', K ? '확대·축소' : 'Zoom'],
    [K ? 'Alt+끌기, 가운데 버튼' : 'Alt+drag, middle button', T['tool.hand']], ['Ctrl+E', T['export.ico']], ['Ctrl+P', T['action.print']], ['F1', T['action.guide']],
    ...TOOLS.map((id) => [KEYS[id], T[`tool.${id}`]]),
  ].map(([k, v]) => `<tr><td><kbd>${esc(k)}</kbd></td><td>${esc(v)}</td></tr>`).join('');

  return K ? [
    ['start', '시작하기', `<p>MyICOMaker 는 도형·도구·효과로 아이콘을 직접 그리고, 여러 크기를 담은 Windows <b>.ico</b>, macOS <b>.icns</b>, <b>PNG</b> 세트, <b>SVG</b> 로 내보내는 아이콘 디자이너입니다. Windows·macOS·Linux 데스크톱 앱(Tauri)과 웹 브라우저에서 같은 화면으로 동작합니다.</p>
      <ol><li>시작 화면에서 <b>새 아이콘</b> 또는 템플릿을 고릅니다.</li><li>왼쪽의 도구와 도형으로 캔버스(512×512)에 그립니다.</li><li>오른쪽에서 색·그러데이션·테두리·효과를 정합니다.</li><li><b>ICO 내보내기</b>로 아이콘 파일을 만듭니다.</li></ol>
      <p class="tip">작업 중인 디자인은 자동으로 보관되어, 다음에 시작 화면의 <b>이어서 작업</b>으로 바로 돌아갈 수 있습니다. 파일로 남기려면 <kbd>Ctrl+S</kbd> 로 <b>.myico</b> 디자인 파일에 저장하세요.</p>`],
    ['startscreen', '시작 화면', `${fig(lang, 'start', '시작 화면')}<p>프로그램을 켜면 움직이는 배경 위에 반투명 카드들이 놓인 시작 화면이 나옵니다. 카드는 왼쪽 위 손잡이(⋮⋮)로 끌어 옮기고, 오른쪽 아래 모서리로 크기를 바꿉니다(모서리 더블클릭: 내용에 맞춤). <b>카드 배치 초기화</b>로 처음 배치로 돌아갑니다.</p>
      <ul><li><b>바로 가기</b>: 새 아이콘, 열기, 그림으로 시작, 이어서 작업, 사용 설명서, 언어 바꾸기, 정보, 끝내기</li><li><b>최근 디자인</b>(데스크톱): 미리 보기 그림과 경로. ✕ 로 목록에서 빼기</li><li><b>템플릿으로 시작</b>: ${TEMPLATES.length}가지 시작 디자인</li><li><b>테마</b>: 어두운 테마 6개와 밝은 테마 6개</li><li><b>움직이는 배경</b>: 20가지 배경, 무작위, 속도, 카드 불투명도</li></ul>
      <table><tr><th>템플릿</th><th>내용</th></tr>${templateRows}</table>
      <p><b>시작할 때 시작 화면 보이기</b>를 끄면 다음부터 마지막 작업으로 바로 편집기가 열립니다. 편집기에서는 제목 표시줄의 <b>시작 화면</b> 단추로 언제든 돌아옵니다.</p>`],
    ['examples', '예제', `${fig(lang, 'examples', '예제')}<p>시작 화면의 <b>예제</b> 카드에는 도형·이모티콘·효과로 만든 완성된 아이콘 ${EXAMPLES.length}개가 미리 보기 그림과 함께 있습니다. 누르면 새 디자인으로 열려서 마음대로 고쳐 쓸 수 있습니다(원본 예제는 바뀌지 않습니다).</p>${exampleList}<h3>내 예제</h3><p>편집기 도구 모음의 <b>예제로 저장</b>을 누르면 지금 디자인이 <b>내 예제</b>로 저장되어 예제 카드 끝에 점선 테두리로 나옵니다. 마우스를 올리면 나오는 ✕ 로 지웁니다(확인을 묻습니다). 내 예제는 이 컴퓨터의 프로그램 저장소에 남습니다.</p>`],
    ['screen', '편집기 화면', `${fig(lang, 'editor', '편집기')}<table><tr><th>영역</th><th>설명</th></tr>
      <tr><td>제목 표시줄</td><td>프로그램 이름·버전, 파일 이름(● 저장 안 됨), 시작 화면, 사용 설명서, 테마·언어 드롭다운, 정보, 최소화·최대화·닫기. 빈 곳을 끌면 창이 움직이고, 더블클릭하면 최대화됩니다.</td></tr>
      <tr><td>도구 모음</td><td>파일, 편집(실행 취소·다시 실행·복사·붙여넣기·복제·삭제), 보기(확대·축소·맞춤·100%·격자·맞추기·안내선·미리 보기), ICO 내보내기, 인쇄. 창이 좁으면 글자가 숨고 아이콘만 남습니다.</td></tr>
      <tr><td>왼쪽 패널</td><td>도구, 도형(분류·찾기), 레이어</td></tr>
      <tr><td>캔버스</td><td>512×512 디자인 영역. 체크 무늬는 투명한 부분이고 캔버스 바탕·체크 무늬·격자·눈금자 색은 테마를 따릅니다. 위쪽과 왼쪽 <b>눈금자</b>에 마우스 위치가 <b style="color:#ef4444">붉은 표시</b>로 나옵니다. <b>격자</b>는 확대·축소에 맞춰 큰 칸을 다시 고르고, 큰 칸마다 5×5 작은 칸으로 다시 그립니다(맞추기는 작은 칸에 붙습니다). 아래쪽 미리 보기 줄에 16~128 픽셀과 어두운/밝은 배경 위의 모습이 바로 나옵니다.</td></tr>
      <tr><td>오른쪽 패널</td><td>속성, 효과, 정렬·배치, 배경, 내보내기</td></tr>
      <tr><td>상태 표시줄</td><td>현재 도구, 개체 수, 선택한 개체, 포인터 위치, 배율, 알림. 오른쪽 끝 손잡이로 창 크기를 바꿉니다.</td></tr></table>`],
    ['tools', '도구', `<p>도구는 ${TOOLS.length}가지이고, 영문 단축키로도 고를 수 있습니다. 그린 뒤에는 자동으로 선택 도구로 돌아갑니다.</p><table><tr><th>도구</th><th>키</th><th>쓰는 법</th></tr>${toolRows}<tr><td><b>${esc(T['tool.image'])}</b></td><td></td><td>${esc(T['tip.image'])}. 캔버스로 파일을 끌어 놓거나 클립보드의 그림을 <kbd>Ctrl+V</kbd> 로 붙여 넣어도 됩니다.</td></tr></table>
      <p>선택한 개체는 8개의 손잡이로 크기를 바꾸고(모서리 + <kbd>Shift</kbd>: 비율 유지), 위쪽 둥근 손잡이로 회전합니다(<kbd>Shift</kbd>: 15° 단위). <b>맞추기</b>를 켜면 격자 눈금에 붙습니다.</p>`],
    ['shapes', '도형', `${fig(lang, 'shapes', '도형 팔레트')}<p>도형은 모두 ${total}가지로, 여섯 분류로 나뉩니다. 단추는 그 도형의 모양을 색으로 보여 줍니다. <b>도형 찾기</b> 칸에 이름을 넣으면 모든 분류에서 찾습니다. 도형을 고르고 캔버스에서 끌어 그립니다(<kbd>Shift</kbd>: 같은 비율, 그냥 클릭: 160×160).</p>${shapeLists}
      <p>입체 도형은 고른 채우기 색으로 밝은 면·어두운 면을 자동으로 만듭니다.</p>`],
    ['emoji', '이모티콘', `${fig(lang, 'emoji', '이모티콘 팔레트')}<p>왼쪽 패널의 <b>이모티콘</b> 카드에 ${EMOJI.length}개의 컬러 이모티콘이 ${EMOJI_CATEGORIES.length}개 분류로 들어 있습니다. 누르면 캔버스 가운데에 놓이고 선택됩니다. 이모티콘은 벡터 그림이라 어떤 크기로 내보내도 선명하고, 도형처럼 옮기기·크기·회전·뒤집기·그림자·빛번짐 같은 효과를 쓸 수 있습니다. 찾기 칸에 이름(한국어·영어)이나 이모티콘 문자(😀)를 넣어 찾습니다.</p><table><tr><th>분류</th><th>개수</th><th>예</th></tr>${emojiRows}</table><h3>내 이모티콘 — 필요한 것을 직접 추가</h3>${fig(lang, 'myemoji', '내 이모티콘')}<p><b>내 이모티콘</b> 탭에서 <b>그림에서 추가</b>로 PNG·SVG 같은 그림 파일을 여러 개 한꺼번에 넣거나, <b>선택한 개체 추가</b>로 캔버스에서 고른 개체를 벡터 그대로 저장합니다. 저장한 것은 다른 이모티콘처럼 눌러서 넣고, 마우스를 올리면 나오는 ✕ 로 지웁니다. 큰 그림은 256 픽셀로 줄여 저장합니다.</p><p class="tip">이모티콘 그림: Twemoji (© Twitter, Inc. 및 기여자, CC-BY 4.0)</p>`],
    ['model3d', '3D 모델', `${fig(lang, 'model3d', '3D 모델 가져오기')}<p>도구 카드의 <b>3D 모델</b> 단추나 파일 끌어다 놓기로 3D 모델 파일을 엽니다. 읽을 수 있는 형식: <b>${modelFormats}</b>. 가져오기 창 왼쪽에 모델이 나오고, 끌어서 돌리고 휠로 확대·축소합니다. 오른쪽에서 보는 방향(비스듬히·앞·옆·위·뒤), 좌우 회전·위아래 기울기·돌리기, 확대, 밝기, <b>한 가지 색으로</b>(색 고르기), 와이어프레임, 바닥 그림자를 정합니다. <b>캔버스에 넣기</b>를 누르면 지금 모습이 1024 픽셀, 투명 배경 그림으로 캔버스에 들어갑니다.</p><p class="tip">glTF(.gltf)는 그림과 버퍼가 파일 안에 들어 있는 것만 읽습니다. 여러 파일로 된 모델은 .glb 로 바꿔서 여세요.</p>`],
    ['drop', '끌어다 놓기', `${fig(lang, 'drop', '파일 끌어다 놓기')}<p>탐색기 등에서 파일을 프로그램 창 아무 곳에나 끌어다 놓을 수 있습니다. 끄는 동안 창에 <b>여기에 놓으세요</b> 표시가 나옵니다.</p><ul><li><b>디자인(.myico)</b>: 엽니다(저장하지 않은 변경이 있으면 먼저 묻습니다).</li><li><b>그림</b>(PNG·JPG·SVG·ICO·TIFF·HEIC·DICOM 등): 캔버스에 놓입니다. 여러 개를 한꺼번에 놓을 수 있습니다.</li><li><b>3D 모델</b>(${modelFormats}): 3D 모델 가져오기 창이 열립니다.</li><li>그 밖의 파일은 열 수 없다고 상태 표시줄에 알려 줍니다.</li></ul><p>클립보드의 그림은 <kbd>Ctrl+V</kbd> 로 붙여 넣습니다.</p>`],
    ['layers', '레이어', `<p>레이어 목록은 맨 앞 개체가 위에 옵니다. 눈 단추로 숨기기·보이기, 자물쇠로 잠그기(잠긴 개체는 캔버스에서 골라지지 않습니다), 화살표로 앞·뒤, 휴지통으로 삭제합니다. 숨긴 개체는 내보내기에도 빠집니다.</p>`],
    ['props', '속성과 효과', `${fig(lang, 'props', '속성과 효과')}<p>개체를 고르지 않았을 때 오른쪽 패널은 <b>새 도형의 색</b>(채우기·두 번째 색·테두리·두께)을 정합니다. 개체를 고르면 그 개체의 속성이 나옵니다.</p>
      <ul><li><b>채우기</b>: 단색, 선형 그러데이션(각도), 원형 그러데이션. 색은 색상 상자, HEX 값, 35개의 견본으로 고릅니다.</li><li><b>테두리</b>: 색, 두께, 실선·파선·점선</li><li><b>사각형</b>: 모서리 반지름 / <b>선</b>: 시작·끝 화살촉 / <b>다각형</b>: 닫힘 / <b>글자</b>: 내용, 글꼴, 크기, 굵게, 기울임</li><li><b>불투명도, 회전</b>, 그리고 X·Y·너비·높이(− / + 단추나 직접 입력)</li></ul>
      <h3>효과</h3><ul><li><b>3D 입체(베벨)</b>: 깊이와 빛의 위치</li><li><b>광택</b>: 위쪽 절반에 유리 같은 반사</li><li><b>그림자</b>: 가로·세로 거리, 흐림, 진하기, 색</li><li><b>빛번짐</b>: 크기와 색</li><li><b>흐림</b></li></ul>`],
    ['arrange', '정렬과 배치', `<p>캔버스 기준 왼쪽·가로 가운데·오른쪽·위·세로 가운데·아래 정렬, 좌우·상하 뒤집기, 90° 회전, 맨 앞·맨 뒤·앞으로·뒤로, 가운데로, 캔버스 채우기, 복제, 삭제를 할 수 있습니다. 개체를 오른쪽 클릭해도 같은 메뉴가 나옵니다.</p>`],
    ['background', '배경', `<p>기본은 투명 배경입니다. 끄면 배경색(또는 두 색 그러데이션), 모양(사각형·원), 여백, 모서리 둥글기를 정할 수 있습니다. <b>전체 불투명도</b>는 그림 전체에 적용됩니다.</p>`],
    ['export', '내보내기', `${fig(lang, 'export', '내보내기')}<table><tr><th>형식</th><th>설명</th></tr>
      <tr><td>ICO</td><td>고른 크기(16, 20, 24, 32, 40, 48, 64, 96, 128, 256)를 한 .ico 파일에 담습니다. <b>크기마다 따로</b>를 켜면 크기별 .ico 를 만듭니다(데스크톱: 폴더, 웹: ZIP).</td></tr>
      <tr><td>PNG 세트</td><td>고른 크기마다 PNG 를 만듭니다.</td></tr>
      <tr><td>macOS ICNS</td><td>16~1024 픽셀을 모두 담은 .icns</td></tr>
      <tr><td>SVG</td><td>크기와 상관없는 벡터 그림</td></tr></table><p><b>기본값</b> 단추는 크기 선택을 16·24·32·48·64·128·256 으로 되돌립니다.</p>`],
    ['print', '인쇄', `${fig(lang, 'print', '인쇄 미리 보기')}<p>도구 모음·내보내기 카드의 <b>인쇄</b> 단추나 <kbd>Ctrl+P</kbd> 로 인쇄 창이 따로 열립니다. 왼쪽에서 정하고 오른쪽 <b>미리 보기</b>로 확인합니다(맞춤, 확대·축소, 점선은 여백).</p><ul><li><b>프린터</b>: 설치된 프린터 목록(기본 프린터 표시, 새로 고침)과 매수</li><li><b>용지</b>: A3, A4, A5, B4, B5, Letter, Legal, Tabloid, 사용자 지정 크기(너비·높이 mm), 세로·가로</li><li><b>여백</b>: 없음·좁게·보통·넓게, 위·아래·왼쪽·오른쪽 따로(mm)</li><li><b>배치</b>: 크기별 견본(실제 크기와 확대 배율), 크게 한 장(크기 %), 스티커 시트(스티커 크기, 간격, 자르는 선)</li><li><b>표시</b>: 크기 이름, 체크 무늬, 머리글(이름), 바닥글(날짜·쪽)</li></ul><p><b>인쇄</b>는 고른 프린터로 바로 보냅니다. <b>시스템 인쇄 창…</b>은 운영 체제의 인쇄 창을, <b>PDF 로 저장</b>은 같은 페이지를 PDF 파일로 만듭니다. 편집기에서 다시 인쇄를 누르면 미리 보기가 새 디자인으로 바뀝니다.</p><h3>사용 설명서 인쇄</h3>${fig(lang, 'print-guide', '사용 설명서 인쇄')}<p>사용 설명서는 도구 모음·제목 표시줄·시작 화면의 <b>사용 설명서</b> 단추나 <kbd>F1</kbd> 로 따로 열리는 창입니다. 그 창의 <b>인쇄</b> 단추(<kbd>Ctrl+P</kbd>)를 누르면 같은 인쇄 창이 설명서를 인쇄하는 모습으로 열립니다. 설명서는 고른 용지와 여백에 맞춰 쪽으로 나뉘고(제목이 쪽 끝에 홀로 남지 않고, 긴 표는 다음 쪽에서 머리글 줄을 다시 보여 줍니다), 미리 보기에 모든 쪽이 나옵니다. 아이콘에만 쓰는 배치·크기 이름·체크 무늬 대신 <b>글자 크기</b>(pt)를 정합니다. 프린터·매수·용지·여백·머리글·바닥글(날짜·쪽 번호)과 바로 인쇄·시스템 인쇄 창·PDF 저장은 그대로입니다.</p>`],
    ['files', '파일', `<p>디자인은 <b>.myico</b> 파일(JSON)로 저장합니다. 가져온 그림도 파일 안에 함께 들어가므로 원본 그림을 옮겨도 괜찮습니다. 설치하면 .myico 파일을 두 번 클릭해 바로 열 수 있습니다. 저장하지 않은 변경이 있으면 새로 만들기·열기·끝내기 전에 물어봅니다.</p>
      <p>가져올 수 있는 그림: PNG, JPG, GIF, WebP, BMP, ICO, CUR, SVG, AVIF, APNG, TIFF, HEIC/HEIF, DICOM(.dcm).</p>`],
    ['settings', '설정과 테마', `${fig(lang, 'settings', '설정 창 — 테마')}<p>제목 표시줄의 <b>설정</b> 단추는 설정 창을 따로 엽니다(일반 · 테마 · 캔버스). <b>테마 설정</b> 단추는 바로 테마 탭을 엽니다. 테마는 어두운 테마 20개와 밝은 테마 20개(${esc(themes)}), 그리고 <b>사용자 정의 테마</b>가 있습니다. 사용자 정의 테마는 시작 테마를 고른 뒤 배경·패널·글자·강조색·캔버스 바탕·체크 무늬·격자·눈금자 등의 색을 하나씩 바꿔 만듭니다. 바꾸는 즉시 메인 창, 설정 창, 인쇄 창, 사용 설명서 창이 모두 같은 테마로 바뀝니다. 언어(한국어·English)는 제목 표시줄 드롭다운이나 설정 창에서 바꿉니다. 설정과 창의 위치·크기는 다음 실행 때도 유지됩니다.</p>`],
    ['shortcuts', '단축키', `<table><tr><th>키</th><th>동작</th></tr>${shortcuts}</table>`],
    ['install', '설치와 제거', `<p>Windows 설치 파일 <b>MyICOMaker-Setup-${pkg.version}.exe</b> 를 실행하면 먼저 <b>설치 언어(한국어 / English)</b>를 고릅니다. 고른 언어로 설치가 진행되고, 프로그램도 처음에 그 언어로 시작합니다. 이전 설치가 있으면 지우고 다시 설치할지, 사용자 데이터를 지울지 묻습니다. 바로가기(바탕 화면, 시작 메뉴 — 사용 설명서 포함)를 고를 수 있습니다.</p>`],
    ['faq', '문제 해결', `<ul><li><b>내보낸 아이콘이 흐립니다</b>: 작은 크기(16, 24)에서는 가는 선이 뭉개집니다. 테두리를 두껍게 하고 단순한 모양을 쓰세요. 미리 보기 줄에서 실제 크기를 확인할 수 있습니다.</li><li><b>그림이 열리지 않습니다</b>: 지원하는 형식인지 확인하세요. 압축된 DICOM 은 읽지 못합니다.</li><li><b>창이 화면 밖에 있습니다</b>: 모니터가 바뀌면 다음 실행 때 가운데에 다시 놓입니다.</li></ul>`],
  ] : [
    ['start', 'Getting started', `<p>MyICOMaker is an icon designer: draw icons with shapes, tools and effects, then export a multi-size Windows <b>.ico</b>, a macOS <b>.icns</b>, a <b>PNG</b> set or an <b>SVG</b>. The desktop app (Tauri, Windows · macOS · Linux) and the web version share the same screens.</p>
      <ol><li>On the start screen choose <b>New icon</b> or a template.</li><li>Draw on the 512×512 canvas with the tools and shapes on the left.</li><li>Set colours, gradients, outlines and effects on the right.</li><li><b>Export ICO</b> makes the icon file.</li></ol>
      <p class="tip">The design you work on is kept automatically; <b>Continue</b> on the start screen brings it back. To keep it as a file, save it as a <b>.myico</b> design with <kbd>Ctrl+S</kbd>.</p>`],
    ['startscreen', 'Start screen', `${fig(lang, 'start', 'Start screen')}<p>The program opens with translucent cards over a moving background. Drag a card by its handle (⋮⋮) to move it and by its bottom-right corner to resize it (double-click the corner to fit the content). <b>Reset card layout</b> puts them back.</p>
      <ul><li><b>Quick start</b>: new icon, open, from a picture, continue, user's guide, language, about, exit</li><li><b>Recent designs</b> (desktop): thumbnails and paths; ✕ removes one</li><li><b>Start from a template</b>: ${TEMPLATES.length} designs to begin with</li><li><b>Theme</b>: six dark and six light themes</li><li><b>Moving background</b>: 20 backgrounds, random, speed and card opacity</li></ul>
      <table><tr><th>Template</th><th>What it is</th></tr>${templateRows}</table>
      <p>Turn off <b>Show the start screen at startup</b> to go straight to the editor with your last design. The <b>Start screen</b> button in the title bar always brings it back.</p>`],
    ['examples', 'Examples', `${fig(lang, 'examples', 'Examples')}<p>The <b>Examples</b> card on the start screen holds ${EXAMPLES.length} finished icons made of shapes, emoji and effects, each with a preview. A click opens one as a new design to change as you like (the example itself stays as it is).</p>${exampleList}<h3>My examples</h3><p><b>Save as example</b> in the editor toolbar keeps the current design as one of <b>My examples</b>; they appear at the end of the card with a dashed border. The ✕ that shows on hover removes one (after asking). My examples are kept in the program's storage on this computer.</p>`],
    ['screen', 'The editor', `${fig(lang, 'editor', 'The editor')}<table><tr><th>Area</th><th>What it does</th></tr>
      <tr><td>Title bar</td><td>Name and version, the file name (● unsaved), start screen, user's guide, theme and language drop-downs, about, minimize, maximize and close. Drag an empty part to move the window; double-click to maximize.</td></tr>
      <tr><td>Toolbar</td><td>File, edit (undo, redo, copy, paste, duplicate, delete), view (zoom, fit, 100%, grid, snap, guides, preview), export ICO and print. When the window is narrow the labels hide and the icons stay.</td></tr>
      <tr><td>Left panel</td><td>Tools, shapes (categories and search), layers</td></tr>
      <tr><td>Canvas</td><td>The 512×512 design. The checkerboard is transparency; the backdrop, checkerboard, grid and rulers follow the theme. The <b>rulers</b> on top and left show the pointer as a <b style="color:#ef4444">red mark</b>. The <b>grid</b> picks a new major step as you zoom and divides every major cell 5 × 5 again (snap sticks to the small cells). The preview strip below shows the icon at 16–128 pixels and on dark and light backgrounds as you draw.</td></tr>
      <tr><td>Right panel</td><td>Properties, effects, arrange, background, export</td></tr>
      <tr><td>Status bar</td><td>Tool, object count, selection, pointer position, zoom and messages; the grip at the right resizes the window.</td></tr></table>`],
    ['tools', 'Tools', `<p>There are ${TOOLS.length} tools, each with a letter key. After drawing, the Select tool comes back.</p><table><tr><th>Tool</th><th>Key</th><th>How</th></tr>${toolRows}<tr><td><b>${esc(T['tool.image'])}</b></td><td></td><td>${esc(T['tip.image'])}. You can also drop files on the canvas or paste a picture with <kbd>Ctrl+V</kbd>.</td></tr></table>
      <p>The selected object has eight handles to resize it (corner + <kbd>Shift</kbd> keeps proportions) and a round handle on top to rotate it (<kbd>Shift</kbd>: 15° steps). With <b>Snap</b> on, objects stick to the grid.</p>`],
    ['shapes', 'Shapes', `${fig(lang, 'shapes', 'The shape palette')}<p>There are ${total} shapes in six categories; every button shows its shape in colour. Type in <b>Find a shape</b> to search all categories. Pick a shape and drag on the canvas (<kbd>Shift</kbd>: keep proportions; a plain click makes 160×160).</p>${shapeLists}
      <p>3D solids shade their light and dark faces from the fill colour.</p>`],
    ['emoji', 'Emoji', `${fig(lang, 'emoji', 'The emoji palette')}<p>The <b>Emoji</b> card in the left panel has ${EMOJI.length} colour emoji in ${EMOJI_CATEGORIES.length} categories. A click puts one in the middle of the canvas, selected. Emoji are vector art, sharp at every export size, and move, resize, rotate, flip and take effects (shadow, glow …) like shapes. Search by name (English or Korean) or by the emoji itself (😀).</p><table><tr><th>Category</th><th>Count</th><th>For example</th></tr>${emojiRows}</table><h3>My emoji — add what you need</h3>${fig(lang, 'myemoji', 'My emoji')}<p>On the <b>My emoji</b> tab, <b>Add pictures</b> adds picture files (PNG, SVG …, several at once) and <b>Add selection</b> keeps the object selected on the canvas, as vectors. Use them like the other emoji; the ✕ that shows on hover removes one. Big pictures are kept at 256 pixels.</p><p class="tip">Emoji graphics: Twemoji (© Twitter, Inc. and other contributors, CC-BY 4.0)</p>`],
    ['model3d', '3D models', `${fig(lang, 'model3d', 'Importing a 3D model')}<p>The <b>3D model</b> button in the tools card, or dropping a file, opens a 3D model. Formats: <b>${modelFormats}</b>. The import window shows the model on the left: drag to turn it, use the wheel to zoom. On the right choose the view (angled, front, side, top, back), turn, tilt and roll, zoom, light, <b>one colour</b> (with a colour), wireframe and the ground shadow. <b>Place on canvas</b> puts the view on the canvas as a 1024-pixel picture with a transparent background.</p><p class="tip">glTF (.gltf) files are read when their pictures and buffers are inside the file. Save a model made of several files as .glb.</p>`],
    ['drop', 'Drag and drop', `${fig(lang, 'drop', 'Dropping files')}<p>Drag files from the file manager onto any part of the window; while you drag, the window says <b>Drop here</b>.</p><ul><li><b>Designs (.myico)</b> open (after asking about unsaved changes).</li><li><b>Pictures</b> (PNG, JPG, SVG, ICO, TIFF, HEIC, DICOM …) go on the canvas, several at once.</li><li><b>3D models</b> (${modelFormats}) open the 3D import window.</li><li>Any other file is named in the status bar as one that cannot be opened.</li></ul><p>Pictures on the clipboard paste with <kbd>Ctrl+V</kbd>.</p>`],
    ['layers', 'Layers', `<p>The front-most object is at the top of the list. The eye hides and shows, the lock locks (locked objects cannot be picked on the canvas), the arrows move forward and backward, the bin deletes. Hidden objects are left out of exports.</p>`],
    ['props', 'Properties and effects', `${fig(lang, 'props', 'Properties and effects')}<p>With nothing selected, the right panel sets the <b>colours for new shapes</b> (fill, second colour, outline, width). With an object selected it shows that object's properties.</p>
      <ul><li><b>Fill</b>: solid, linear gradient (angle) or radial gradient; colours from the picker, a hex value or 35 swatches</li><li><b>Outline</b>: colour, width, solid / dashed / dotted</li><li><b>Rectangle</b>: corner radius · <b>Line</b>: start and end arrowheads · <b>Polygon</b>: closed · <b>Text</b>: text, font, size, bold, italic</li><li><b>Opacity, rotation</b>, and X, Y, width and height (− / + or type a value)</li></ul>
      <h3>Effects</h3><ul><li><b>3D bevel</b>: depth and light position</li><li><b>Gloss</b>: a glassy reflection on the upper half</li><li><b>Shadow</b>: offset, blur, strength and colour</li><li><b>Glow</b>: size and colour</li><li><b>Blur</b></li></ul>`],
    ['arrange', 'Arrange', `<p>Align to the canvas (left, centre, right, top, middle, bottom), flip across or down, rotate by 90°, bring to front, send to back, forward, backward, centre, fill the canvas, duplicate and delete. Right-clicking an object shows the same commands.</p>`],
    ['background', 'Background', `<p>The background is transparent by default. Turn that off to choose a colour (or a two-colour gradient), a shape (square or circle), a margin and the corner rounding. <b>Overall opacity</b> applies to the whole picture.</p>`],
    ['export', 'Export', `${fig(lang, 'export', 'Export')}<table><tr><th>Format</th><th>What you get</th></tr>
      <tr><td>ICO</td><td>All chosen sizes (16, 20, 24, 32, 40, 48, 64, 96, 128, 256) in one .ico file. With <b>One .ico file per size</b> you get one file per size (desktop: a folder, web: a ZIP).</td></tr>
      <tr><td>PNG set</td><td>A PNG for each chosen size</td></tr>
      <tr><td>macOS ICNS</td><td>An .icns with every size from 16 to 1024 pixels</td></tr>
      <tr><td>SVG</td><td>A vector picture of any size</td></tr></table><p><b>Default</b> sets the sizes back to 16, 24, 32, 48, 64, 128 and 256.</p>`],
    ['print', 'Printing', `${fig(lang, 'print', 'Print preview')}<p>The <b>Print</b> button (toolbar, export card) or <kbd>Ctrl+P</kbd> opens the print window. Set things up on the left and check the <b>preview</b> on the right (fit, zoom; the dashed line shows the margins).</p><ul><li><b>Printer</b>: the installed printers (default marked, refresh) and copies</li><li><b>Paper</b>: A3, A4, A5, B4, B5, Letter, Legal, Tabloid or a custom size (width, height in mm), portrait or landscape</li><li><b>Margins</b>: none, narrow, normal, wide, or each side in mm</li><li><b>Layout</b>: size samples (real size and magnified), one large icon (size in %), sticker sheet (size, spacing, cut lines)</li><li><b>Show</b>: size names, checkerboard, header (name), footer (date, page)</li></ul><p><b>Print</b> sends the page straight to the chosen printer; <b>System print dialog…</b> opens the operating system's dialog; <b>Save as PDF</b> writes the same page to a PDF file. Printing again from the editor updates the preview.</p><h3>Printing the user's guide</h3>${fig(lang, 'print-guide', "Printing the user's guide")}<p>The user's guide is a window of its own, opened by the <b>User's guide</b> button (toolbar, title bar, start screen) or <kbd>F1</kbd>. Its <b>Print</b> button (<kbd>Ctrl+P</kbd>) opens the same print window for the guide: the guide is cut into pages of the chosen paper and margins (a heading never ends a page; a long table repeats its header row on the next page) and the preview shows every page. Instead of the icon-only options (layout, size names, checkerboard) you set the <b>text size</b> (pt). Printer, copies, paper, margins, header and footer (date, page number), direct printing, the system dialog and Save as PDF work as for icons.</p>`],
    ['files', 'Files', `<p>Designs are saved as <b>.myico</b> files (JSON). Imported pictures are stored inside, so the originals can move. After installing, double-click a .myico file to open it. With unsaved changes, New, Open and Exit ask first.</p>
      <p>Pictures you can import: PNG, JPG, GIF, WebP, BMP, ICO, CUR, SVG, AVIF, APNG, TIFF, HEIC/HEIF and DICOM (.dcm).</p>`],
    ['settings', 'Settings and themes', `${fig(lang, 'settings', 'The settings window — themes')}<p>The <b>Settings</b> button in the title bar opens the settings window (General · Theme · Canvas); <b>Theme settings</b> opens its theme tab directly. There are 20 dark and 20 light themes (${esc(themes)}) and a <b>custom theme</b>: pick a theme to start from and change its colours one by one — background, panels, text, accent, canvas backdrop, checkerboard, grid, rulers and more. Every change shows at once in the main window, the settings window, the print window and the user's guide. The language (한국어 · English) is in the title bar and the settings window. Settings, window places and sizes are kept for the next start.</p>`],
    ['shortcuts', 'Shortcuts', `<table><tr><th>Key</th><th>Action</th></tr>${shortcuts}</table>`],
    ['install', 'Installing and removing', `<p>Run <b>MyICOMaker-Setup-${pkg.version}.exe</b>. First choose the <b>installer language (한국어 / English)</b>: the installation runs in it and the program starts in it. If an earlier copy is installed you are asked whether to remove it and install again, and whether to delete the user data. You can choose the shortcuts (desktop, Start menu — with the user's guide).</p>`],
    ['faq', 'Troubleshooting', `<ul><li><b>The exported icon looks blurry</b>: thin lines smear at 16 and 24 pixels. Use thicker outlines and simple shapes; the preview strip shows the real sizes.</li><li><b>A picture does not open</b>: check that the format is supported; compressed DICOM cannot be read.</li><li><b>The window is off screen</b>: after a monitor change it opens centred at the next start.</li></ul>`],
  ];
}

function page(lang) {
  const T = lang === 'ko' ? ko : en;
  const list = chapters(lang);
  const title = lang === 'ko' ? 'MyICOMaker 사용 설명서' : "MyICOMaker User's Guide";
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="stylesheet" href="guide.css">
</head>
<body>
<main>
<header class="cover"><img src="../icon.png" alt=""><div><h1>MyICOMaker <small>v${pkg.version}</small></h1><p>${esc(T['app.tagline'])}</p></div></header>
<nav class="toc">${list.map(([id, heading], i) => `<a href="#${id}">${i + 1}. ${esc(heading)}</a>`).join('')}</nav>
${list.map(([id, heading, body], i) => `<h2 id="${id}">${i + 1}. ${esc(heading)}</h2>\n${body}`).join('\n')}
<footer>MyICOMaker v${pkg.version} · © 2026 SHKWON (knix008@naver.com)</footer>
</main>
</body>
</html>
`;
}

const out = path.join(root, 'public', 'docs');
fs.mkdirSync(path.join(out, 'images'), { recursive: true });
fs.writeFileSync(path.join(out, 'UsersGuide.html'), page('ko'));
fs.writeFileSync(path.join(out, 'UsersGuide.en.html'), page('en'));
console.log('[docs] public/docs/UsersGuide.html and UsersGuide.en.html written.');
