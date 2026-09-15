# My Editor (MultiOS)

탭 방식 텍스트 · 코드 편집기 — **Windows / macOS / Linux 데스크톱 앱**과 **웹 버전**을 하나의 코드로 제공합니다.
편집 엔진은 CodeMirror 6, 앱 셸은 Electron + React + Vite 입니다.

![My Editor](assets/icon.svg)

## 주요 기능

- **여러 문서를 탭**으로 편집 — 드래그로 순서 변경, 가운데 클릭으로 닫기, 탭이 화면 폭을 넘으면 우측 `<` `>` 버튼으로 이동(스크롤바 없음)
- **구문 강조 150+ 언어**(확장자로 자동 판별, 언어 메뉴·상태 표시줄에서 변경) — 문법은 처음 쓸 때 지연 로드
- **찾기 / 바꾸기**(Ctrl+F / Ctrl+H): 대/소문자, 단어 단위, 정규식, 일치 개수와 위치, 모두 선택 / 모두 바꾸기
- **인코딩** 자동 감지(BOM · UTF-8 · UTF-16 · 한국어 CP949 등 11종) 와 변환 저장, 다른 인코딩으로 다시 열기, 손실 경고
- **줄 끝**(CRLF / LF / CR) 감지·변환, 저장 시 줄 끝 공백 제거 · 마지막 줄 바꿈 옵션
- **폴더 트리**(Ctrl+B): 폴더를 열면 하위 폴더까지 펼쳐 모든 파일을 트리로 표시, 필터, 새 파일/폴더 · 이름 바꾸기 · 삭제 · 탐색기에서 보기
- **Markdown WYSIWYG 편집**: 제목(H1~H6)·굵게·기울임·취소선·코드·인용·목록·체크리스트·링크·이미지·표·구분선 도구 모음(단축키 포함); 기호는 커서가 있는 줄에서만 보이고 나머지는 렌더링된 모습으로 편집 + 옆에 **미리보기** 창(Ctrl+Shift+M)
- 편집 도구: 줄 복제/삭제/이동, 주석 토글, 대·소문자, 줄 정렬, 빈 줄·중복 줄 제거, 줄 끝 공백 제거, 다중 커서(Alt+클릭), 사각형 선택(Alt+드래그), 코드 접기, 괄호 짝 강조·자동 닫기
- 줄로 이동(Ctrl+G), 자동 줄 바꿈, 공백 문자 표시, 확대/축소(Ctrl+휠), 전체 화면
- **세션 복원**: 열려 있던 탭·커서 위치·저장하지 않은 새 문서 초안·최근 파일·폴더·창 위치
- 외부에서 바뀐 파일 자동 다시 읽기(수정하지 않은 경우) 또는 확인, 읽기 전용 표시, 파일 삭제 감지
- 파일 드래그 앤 드롭으로 열기, 탐색기 더블클릭·명령줄 인수로 열기(단일 인스턴스)
- 타이틀바 없는 창: 메뉴 바가 드래그 영역이며 최소화/최대화/닫기 버튼과 우측 하단 크기 조절 마커를 제공
- 오류는 팝업 + 자세한 내용(코드·경로·스택) + **자세히 복사** 버튼
- 16가지 테마(에디터 구문 색까지 테마별), 한국어/영어(국기 버튼으로 전환), 설정·정보·단축키 대화상자

## 실행

```bash
npm install
npm start            # 개발 모드: Vite(5189) + Electron
npm run web          # 웹 버전: 빌드 후 http://127.0.0.1:5190 (브라우저 자동 열림)
```

웹 버전은 서버가 실행되는 컴퓨터의 파일을 편집합니다(열기/저장 대화상자는 앱 안에서 그립니다).
다른 컴퓨터에서 접속하려면 `node server/server.js --host 0.0.0.0 --port 8080 --token <비밀값>` 처럼 토큰과 함께 실행하세요.

## 설치 파일 만들기

```bash
npm run build:win     # Windows  → My Editor Setup 1.0.0.exe (NSIS)
npm run build:mac     # macOS    → My Editor-1.0.0.dmg (x64 + arm64)  ※ macOS 에서 실행
npm run build:linux   # Linux    → .AppImage + .deb                    ※ Linux 에서 실행
```

아이콘(`build/icons/`)은 `assets/icon.svg` 에서 자동 생성되며, 결과물은 `release/` 와 프로젝트 루트에 복사됩니다.
`npm run clean` 으로 빌드 산출물을, `npm run clean:all` 로 `node_modules` 까지 지웁니다.

## 테스트

```bash
npm test                          # 코어: 인코딩·줄 끝·파일 읽기/쓰기·세션·API (7개)
npm run build && npm run smoke    # 데스크톱 + 웹 스모크: 실제 창에서 편집·저장·찾기 후 .smoke/*.png 스크린샷
npm run smoke -- --scenario all   # 모든 시나리오(메뉴·대화상자·테마·탭 오버플로·Markdown…)
```

## 데이터 위치

| 항목 | Windows | macOS | Linux |
|---|---|---|---|
| 데스크톱 앱 세션·설정 `session.json` | `%APPDATA%\My Editor\` | `~/Library/Application Support/My Editor/` | `~/.config/My Editor/` |
| 웹 버전 (`--config` 로 변경) | `%APPDATA%\My Editor\` | `~/Library/Application Support/My Editor/` | `~/.config/my-editor/` |

## 사용 라이브러리

- [CodeMirror 6](https://codemirror.net/) — 편집 엔진, [@codemirror/language-data](https://github.com/codemirror/language-data) 의 150+ 언어 문법
- [iconv-lite](https://github.com/ashtuchkin/iconv-lite) — 인코딩 변환
- [marked](https://marked.js.org/) + [DOMPurify](https://github.com/cure53/DOMPurify) — Markdown 미리보기
- React 18, Vite 5, Electron 31, electron-builder 24

## License

MIT — SHKWON (knix008@naver.com)
