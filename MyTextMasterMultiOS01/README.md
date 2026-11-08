# MyTextMaster

Markdown · HTML · 텍스트 편집기 — Windows, macOS, Linux (Tauri 2) 와 웹 브라우저에서 같은 화면으로 실행됩니다.
스타일과 시작 화면(움직이는 배경 위의 카드 보드)은 MyUMLMaker 와 같고, 편집 기능은 Notepad++ · TextMate, 파일 보기는 CommandCenter 를 참고했습니다.

## 기능

- **편집**: 탭, 구문 강조(100여 개 언어, 메뉴로 선택), 줄 번호·접기·괄호 짝·여러 커서·사각 선택, 단어 자동 완성과 스니펫(Markdown·HTML), 찾기·바꾸기(정규식), **파일에서 찾기**, 줄로 이동, **책갈피**, **매크로** 녹화·실행, 읽기 전용
- **Markdown / HTML**: 실시간 미리 보기와 문단 단위 스크롤 맞추기, **WYSIWYG**(보이는 대로 편집 → Markdown 으로 저장), 서식 명령이 문서 종류에 맞춰 기호/태그를 넣음, 표·링크·그림·코드 블록·각주
- **그림을 글자처럼**: 편집기 줄 안에 그림 표시, 끌어다 놓기·붙여넣기로 삽입(저장된 문서는 `images/` 로 복사)
- **뷰어**(메인 창 탭): 그림(맞춤·확대·회전·복사·PNG/JPEG/WebP/BMP 저장), 동영상, 오디오, PDF, **헥사 편집기**(덮어쓰기/삽입, 실행 취소, 오프셋 이동, 바이트 찾기, 값 표시)
- **맞춤법**: 영어·한국어 Hunspell 사전, 추천 단어, **사용자 사전**(추가·가져오기·내보내기)
- **패널**: 왼쪽(탐색기 — 드라이브 아이콘·폴더 트리 / 개요 / 열린 문서), 오른쪽(정보 — **줄 카운터**·통계·파일 정보·해시 / 책갈피 / 파일에서 찾기), 아래(문제 / 로그). 제목 줄에 접기 단추, 도구 모음에 켜기/끄기
- **도구**: 대소문자, 줄 정렬·중복 제거·공백 정리·합치기·번호, 탭↔공백, Base64·URL·HTML 인코드, 해시, HTML 정리, 문서 통계, Markdown·HTML·JSON 문제 검사
- **파일**: UTF-8 / BOM / UTF-16 / EUC-KR, LF / CRLF, 안전한 저장, 바깥 변경 감지, 자동 저장, 지난 문서 다시 열기
- **화면**: 제목 표시줄 없는 창(메뉴 줄이 제목 줄), 테마 40개(밝은 20·어두운 20) + 사용자 정의, 한국어/영어, 설정 즉시 적용·기본값 복원, 오른쪽 아래 점 모양 크기 조절 마커
- **시작 화면**: 서식 10개, 예제 30개(종류마다 10개), 최근 파일·폴더, 테마, 움직이는 배경 20개, 옮기고 크기 바꾸는 카드
- **사용 설명서**(`doc/`, 한·영): 앱 안 탭에서 차례·글자 크기·언어 전환

## 개발

```bash
npm install
npm start          # 데스크톱 (tauri dev)
npm run dev        # 웹 (http://localhost:1472)
npm test           # 단위 + Rust + GUI(헤드리스 Edge/Chrome) 검사
npm run samples    # src/domain/samples*.js → samples/
npm run build:icons
```

## 설치 파일

```bash
npm run build:win      # MyTextMaster-Setup-<버전>.exe
npm run build:mac      # .dmg
npm run build:linux    # .deb / .rpm / .AppImage
npm run build:webapp   # MyTextMaster-Web-<버전>.zip
npm run build:all      # 이 OS 의 설치 파일 + 웹 앱
```

만든 파일은 `release/` 와 프로젝트 루트에 복사됩니다. Tauri 는 교차 빌드를 하지 않으므로 각 OS 의 설치 파일은 그 OS 에서 만듭니다.

## 구조

| 경로 | 내용 |
| --- | --- |
| `src/app.js` | 창(메뉴 막대·도구 모음·탭·상태 표시줄), 명령, 문서 관리, 패널 연결 |
| `src/editor/` | CodeMirror 편집기, 맞춤법(Web Worker), 책갈피, 스니펫, 줄 안의 그림 |
| `src/ui/` | 미리 보기, WYSIWYG, 헥사 편집기, 뷰어, 사용 설명서, 패널, 메뉴, 대화 상자, 시작 화면 |
| `src/domain/` | 문서 종류·인코딩, 텍스트 도구, 개요, 렌더링, HTML→Markdown, 문제 검사, 사용자 사전, 설정, 서식, 예제 |
| `src/platform/native.js` | 데스크톱(Tauri 명령) / 웹(File System Access API) |
| `src-tauri/` | Rust: 파일 읽기·쓰기(인코딩), 탐색기·파일에서 찾기·해시, 창 위치 기억, 창 끌기 |
| `doc/` | 사용 설명서 (한국어·영어) |
| `test/` | 단위 테스트, GUI 검사 |

© SHKWON (<knix008@naver.com>)
