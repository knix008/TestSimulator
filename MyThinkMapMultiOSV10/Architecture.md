# My ThinkMap — 아키텍처

구조는 [My Editor (MyEditorMultiOSV20)](../MyEditorMultiOSV20/Architecture.md) 와 같습니다: 렌더러(React) → 전송(데스크톱은 Tauri 가 띄운 Node 서비스의 HTTP `/api`, 웹은 같은 HTTP) → 호스트(`src-tauri/` + `host/` · `server/`) → core(Node, 두 호스트가 공유). 렌더러의 모든 백엔드 호출은 `src/lib/backend.js` 의 `call(name, args)` 하나를 거쳐 `core/api.js` 의 같은 메서드 테이블에 닿습니다.

```
MyThinkMapMultiOSV10/
├ core/                 Node 전용, 두 호스트가 공유 (Node 기본 모듈만 사용)
│  ├ api.js             메서드 테이블: app.info · session.* · recent.* · file.* · zip.* · fs.* · os.* · clipboard.*
│  ├ files.js           텍스트(BOM 판별)·바이너리 읽기/쓰기(임시 파일 + rename), 그림 → data URL, 폴더 목록, 드라이브
│  ├ zip.js             ZIP 읽기/쓰기 (stored · deflate, CRC32) — XMind · MindManager · Word
│  └ session.js         session.json: 설정, 열린 맵과 초안, 최근 파일, 창 위치
├ host/
│  ├ desktop.js         Tauri 사이드카: 127.0.0.1 임의 포트 + 토큰, POST /api/<name>, 인쇄 작업
│  └ print.js           Edge/Chrome 으로 조용히 인쇄 (Windows kiosk-printing, macOS/Linux PDF → lp)
├ server/server.js      웹 호스트: dist/ + POST /api/<name> (--port --host --token)
├ src-tauri/            Tauri 2 셸 (Rust): 프레임 없는 창, Node 서비스 기동·종료, 명령줄 파일 열기, 파일 연결
├ src/
│  ├ App.jsx            탭(문서)·세션·파일 입출력·명령 실행(runAction)·단축키·메뉴·클립보드·끌어 놓기·자동 저장
│  ├ PopupWindow.jsx    별도 창: 설정 · 정보 · 단축키 · 도움말 (settings:patch 로 창 사이 동기화)
│  ├ lib/model.js       맵 모델과 모든 편집 — 경로 복사 불변 갱신, id 색인, 찾기/필터, 번호, 정규화
│  ├ lib/docs.js        탭 문서: 실행 취소 기록(맵 객체 목록), 연속 변경 묶기, dirty = map !== saved
│  ├ lib/commands.js    토픽 추가/삭제/옮기기, 화살표 키 이동(구조 우선, 그다음 화면 위치)
│  ├ lib/layout.js      레이아웃 엔진: 토픽 크기 측정(그림·아이콘·줄바꿈·배지·태그·작업 줄), 가지 블록 배치, 연결선·경계·축
│  ├ lib/render.js      레이아웃 → SVG 마크업 (캔버스와 SVG/PNG/PDF/인쇄가 같은 함수)
│  ├ lib/mapstyles.js   맵 스타일 16종 → 토픽별 색·모양 계산 ('auto' 는 앱 테마 토큰에서)
│  ├ lib/markers.js     아이콘 정의와 SVG (우선순위·진행률·깃발·표정·화살표·기호)
│  ├ lib/templates.js   템플릿 14종 (ko/en) — samples 도 여기서
│  ├ lib/formats/       형식: index(열기·저장·내보내기 등록), outline(OPML·Markdown·텍스트·HTML·CSV), freemind, xmind, mmap, docx, pdf, xml(작은 파서)
│  ├ lib/exportimg.js   SVG → canvas (PNG/JPEG), 캔버스 크기 제한
│  ├ lib/print.js       인쇄 HTML: 한 쪽 맞추기 / 타일 나누기, 머리글·바닥글
│  ├ lib/backend.js · tauri-host.js   전송 스위치, 창·대화상자·메뉴·팝업 (MyEditor 와 같은 구조)
│  ├ components/        MenuBar · Toolbar · TabBar · MapCanvas · Overview · Sidebar · TaskPane · OutlineView · GanttView · Presentation · StartPage · HelpWindow · ColorPicker · ContextMenu · Icons
│  ├ dialogs/           Dialogs(확인·오류·정보·프롬프트·빠른 입력·템플릿·내보내기·단축키) · SettingsDialog · PrintPreviewDialog · FileDialog(웹)
│  ├ help/              도움말 ko/en (NN-장.md) + images/<lang>
│  └ themes.js · lib/startbg.js · lib/start3d/   테마 40종, 시작 화면 배경 (MyEditor 와 공유하는 코드)
├ scripts/              build:win/mac/linux, 아이콘, 사이드카 준비, smoke(CDP GUI 테스트), help:media, samples
└ test/                 단위 테스트 (npm test)
```

## 1. 맵 모델

- `.tmap` 은 맵 객체 그대로의 JSON 입니다: `{ format, version, title, root, floating, relationships, layout, style, lineStyle, branchColors, spacing, numbering, background, meta }`. 토픽은 `{ id, text, children, callouts?, collapsed?, notes?, style?, icons?, tags?, task?, link?, attachments?, image?, boundary?, layout?, side? }`.
- 편집은 객체를 바꾸지 않습니다. 바뀐 토픽부터 뿌리까지의 경로만 복사하고 나머지는 공유합니다. 그래서 실행 취소 기록은 맵 객체의 목록이고(그림 data URL 도 공유), "저장 안 함" 판정은 `map !== saved` 입니다.
- `indexOf(map)` 은 id → { topic, parent, kind, index, depth, path } 색인을 맵 객체마다 WeakMap 에 한 번 만듭니다.
- 파일을 열 때 `normalizeMap` 이 빠진 배열, 중복 id, 없는 토픽을 가리키는 관계선을 고칩니다.

## 2. 레이아웃

1. 토픽마다 스타일(`topicStyle`)을 정하고 내용을 측정합니다. 글자 폭은 캔버스 `measureText` (테스트에서는 가짜 측정기), 결과는 캐시합니다.
2. 가지를 아래에서 위로 배치합니다. 각 토픽은 자기 왼쪽 위를 원점으로 한 **블록 상자**(하위 토픽·설명선·접기 단추·경계 여백 포함)를 돌려주고, 부모는 자식 블록을 방향대로 쌓습니다: right/left(세로로), down/up(가로로), treeRight/treeLeft(들여쓴 목록), timeline(축 위에 가로로), fishbone(위아래 뼈를 머리에서 왼쪽으로).
3. 위에서 아래로 상대 위치를 더해 절대 좌표를 만들고(중심 토픽 중심 = 0,0), 연결선(곡선·직선·꺾은선·둥근 꺾은선, 중심에서는 두께가 줄어드는 채운 곡선), 경계, 타임라인 축·피시본 등뼈를 계산합니다.
4. 맵 레이아웃의 좌우는 `side` 가 없으면 보이는 잎 수로 균형을 맞춥니다(새 주 토픽은 만들 때 `side` 를 받아 자리가 고정됩니다).

`npm test` 는 9가지 레이아웃 모두에서 토픽이 겹치지 않는지, 접힌 · 빈 가지에서도 좌표가 유한한지 확인합니다.

## 3. 그리기와 상호작용

- `render.js` 가 SVG 문자열을 만들고 MapCanvas 가 `<g>` 의 innerHTML 로 넣습니다. 맵이 바뀔 때만 다시 만들고, 선택 · 놓을 자리 · 사각형 선택 · 관계선 손잡이는 React 가 그리는 오버레이입니다.
- 클릭 대상은 `data-id`(토픽) · `data-fold` · `data-badge` · `data-rel` · `data-handle` 로 찾습니다. 두 번 누르기는 직접 감지합니다(포인터 캡처와 다시 그리기로 `dblclick` 이 오지 않는 경우가 있어서).
- 키 입력은 선택한 토픽 위의 투명한 textarea 하나가 받습니다. 편집 중이 아니면 키를 명령으로 바꾸고, 글자가 들어오거나 IME 조합이 시작되면 그 자리에서 편집기로 바뀝니다 — 첫 글자나 한글 조합이 끊기지 않습니다. 편집 중의 글자는 맵에 기록하지 않은 채 레이아웃에만 반영되고(상자가 바로 커짐), 확정할 때 한 번 기록됩니다.
- 복사/잘라내기는 keydown 에서, 붙여넣기는 paste 이벤트에서 처리합니다(권한 없이 클립보드 그림·텍스트를 읽음). 앱 안에서 복사한 토픽은 서식과 관계선까지 그대로 붙습니다.

## 4. 파일 형식

- 텍스트 형식(OPML · FreeMind · Markdown · 텍스트 · HTML · CSV)과 ZIP 형식의 내용(XMind content.json / content.xml, MindManager Document.xml, Word)은 렌더러의 `lib/formats/` 에서 변환합니다. XML 은 브라우저와 Node 테스트 양쪽에서 도는 작은 파서(`xml.js`)로 읽습니다.
- ZIP 압축·해제와 파일 쓰기는 core 가 합니다(`zip.read`, `zip.write`, `file.writeBase64`).
- PDF 는 맵 그림(JPEG)을 용지에 맞춰 넣는 최소 PDF 작성기, Word 는 맵 그림 + 제목 스타일 개요의 OOXML 입니다.

## 5. 세션과 창

- 탭 목록 · 카메라 · 선택 · 저장 안 한 맵의 초안(JSON)은 변경 후 0.9초에 session.json 으로 저장됩니다. 8 MB 를 넘는 초안은 버립니다.
- 데스크톱의 메인 창을 닫으면 저장 안 한 맵을 묻고, 창 위치를 저장한 뒤 Node 서비스를 끝냅니다. 설정 창은 닫아도 숨기기만 해서 다시 열 때 바로 나타납니다.

## 6. 테스트

- `npm test` — 모델, 레이아웃, 형식 왕복(OPML · Markdown · 텍스트 · FreeMind · XMind 실제 ZIP · XMind 8 · MindManager), 내보내기 형식 검사, core(세션 · 파일 · ZIP · API), 다국어 키, 도움말 그림·링크, JSX import 확인.
- `npm run smoke` — 웹 빌드를 헤드리스 Edge/Chrome 에서 CDP 로 조작합니다(실제 마우스 끌기, 키보드, `Input.imeSetComposition` 으로 한글 조합). 페이지 오류가 하나라도 나면 실패입니다.
- `npm run help:media` — 같은 방법으로 도움말 스크린샷을 ko/en 으로 찍습니다.

## 7. 빌드

`npm run build:win` · `build:mac` · `build:linux` 가 아이콘을 맞추고(`assets/icon.svg` → `build/icons` → `src-tauri/icons`), 사이드카(`core/` · `host/` · Node 실행 파일)를 `src-tauri/sidecar` 에 준비한 뒤 `vite build` 와 `tauri build` 를 실행하고 설치 파일을 프로젝트 루트로 복사합니다.
