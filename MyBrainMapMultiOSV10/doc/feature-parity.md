# 기능 비교 — MindManager · EdrawMind · SmartDraw · Lucidchart

My BrainMap 이 다른 마인드맵·다이어그램 프로그램의 기능 가운데 **마인드맵에 해당하는 것**을 얼마나 갖추었는지 정리한 표입니다.
표의 모든 ✓ 항목은 `test/parity.test.mjs` 의 테스트 케이스 하나와 짝을 이루며, `npm test` 를 돌리면 실제 코드(모델 · 명령 · 레이아웃 · 렌더러 · 가져오기/내보내기 · 실행 취소)로 검증됩니다.
화면에서 직접 누르는 동작은 `npm run smoke` (실제 브라우저에서 마우스·키보드 입력으로 54단계)가 검증합니다.

> SmartDraw 와 Lucidchart 는 마인드맵 전용이 아니라 범용 다이어그램 도구입니다. 이 표는 그중 마인드맵·구조도에 쓰이는 기능만 비교합니다. 범용 도형 라이브러리, 평면도, 실시간 공동 편집 같은 기능은 아래 "없는 기능"에 따로 적었습니다.

## 있는 기능 (테스트로 검증)

| 기능 | MindManager | EdrawMind | SmartDraw | Lucidchart | 테스트 이름 |
| --- | :-: | :-: | :-: | :-: | --- |
| 중심 · 주 · 하위 토픽 | ✓ | ✓ | ✓ | ✓ | central, main topics and subtopics |
| 형제 토픽 앞/뒤, 상위 토픽 끼워 넣기 | ✓ | ✓ | | | sibling before / after and a parent inserted above |
| 설명선 | ✓ | ✓ | | | callouts |
| 플로팅(자유) 토픽 | ✓ | ✓ | | ✓ | floating topics |
| 끌어서 옮기기 — 다른 가지로, 순서 바꾸기, **빈 곳에 놓아도 연결 유지**, Alt+놓기로 떼기 | ✓ | ✓ | ✓ | ✓ | drag & drop: re-parent, reorder, and moving keeps the connection |
| 자동 정리, 위→아래 · 왼→오 · 오→왼 · 양쪽으로 다시 그리기 | ✓ | ✓ | ✓ | | auto arrange and redraw in a direction |
| 삭제 (하위 토픽과 함께 / 하위 토픽은 남기고) | ✓ | ✓ | ✓ | ✓ | delete (with or without the subtopics) |
| 형제 사이 순서 바꾸기, 정렬 | ✓ | ✓ | | | move up / down among siblings, sort |
| 접기 · 펼치기, 수준까지 보기 | ✓ | ✓ | | | collapse / expand, show levels |
| 가지만 보기 (포커스) | ✓ | ✓ | | | focus on a branch |
| 키보드로 토픽 사이 이동 | ✓ | ✓ | ✓ | ✓ | keyboard navigation between topics |
| 구조째 복사 · 붙여넣기, 글 개요를 토픽으로 | ✓ | ✓ | ✓ | ✓ | copy / paste with structure, paste text as topics |
| 모든 편집의 실행 취소 · 다시 실행, 저장 안 됨 표시 | ✓ | ✓ | ✓ | ✓ | undo / redo of every edit, and the unsaved mark |
| 레이아웃: 맵 · 오른쪽 · 왼쪽 · 조직도(아래/위) · 트리 · 타임라인 · 피쉬본 | ✓ | ✓ | ✓ | ✓ | layouts: map, right, left, org chart down / up, tree, timeline, fishbone |
| 가지마다 다른 레이아웃 | ✓ | ✓ | | | a different layout per branch |
| 맵 스타일 · 테마, 토픽 모양, 선 모양 | ✓ | ✓ | ✓ | ✓ | map styles / themes, shapes and line styles |
| 무지개 가지 색, 번호 매기기 | | ✓ | | | rainbow branch colours and numbering |
| 양쪽 균형 맞추기 | ✓ | ✓ | | | balance the two sides of a map |
| 관계선 (이름 · 화살표 · 색 · 곡선 손잡이) | ✓ | ✓ | ✓ | ✓ | relationships with labels, arrows and colours |
| 경계 (컨테이너, 이름 · 구름 모양) | ✓ | ✓ | | ✓ | boundaries (containers) with labels |
| 요약 괄호 | ✓ | ✓ | | | summary braces beside subtopics |
| 메모(Markdown) · 하이퍼링크 · 첨부 · 그림 | ✓ | ✓ | ✓ | ✓ | notes (Markdown), hyperlinks, attachments and pictures |
| 토픽 댓글 (작성자 · 날짜 · 표시) | ✓ | ✓ | | ✓ | comments on topics (author, date) with a badge |
| 사용자 속성 (데이터 필드) | ✓ | | ✓ | ✓ | custom properties (data fields) on topics |
| 아이콘 · 표식, 태그 | ✓ | ✓ | | | icons / markers, tags |
| 작업 정보: 우선순위 · 진행률 · 시작/마감 · 작업량 · 담당 · 마일스톤 | ✓ | ✓ | ✓ | ✓ | task info: priority, progress, start / due, effort, resources, milestones |
| 칸반 보드 | ✓ | ✓ | | | Kanban board: columns are main topics, cards move between them |
| 개요 보기, 간트 차트 | ✓ | ✓ | | | outline and Gantt data from the same map |
| 격자와 눈금자 | ✓ | ✓ | ✓ | ✓ | grid and rulers on the canvas |
| 찾기 · 바꾸기 (대소문자 · 단어 · 정규식 · 메모) | ✓ | ✓ | ✓ | ✓ | find and replace (case, whole word, regex, notes) |
| 필터 (우선순위 · 아이콘 · 태그 · 진행) | ✓ | ✓ | | | filter by priority, icons, tags, progress |
| 템플릿과 예제 맵 | ✓ | ✓ | ✓ | ✓ | templates and sample maps |
| 내보내기: PNG · JPEG · SVG · PDF · Word · HTML · Markdown · OPML · 텍스트 · FreeMind · XMind · CSV | ✓ | ✓ | ✓ | ✓ | export: PNG, JPEG, SVG, PDF, … |
| 가져오기: FreeMind · XMind · OPML · Markdown · 텍스트 개요 · MindManager(.mmap) | ✓ | ✓ | | ✓ | import: FreeMind, XMind, OPML, Markdown, … |
| 맵 파일에 모든 것 저장 (손으로 옮긴 자리 · 댓글 · 속성 · 요약) | ✓ | ✓ | ✓ | ✓ | the map file keeps everything |
| 다른 가지로 옮긴 토픽은 손으로 옮긴 자리를 버림 | ✓ | ✓ | | | a moved topic dropped into another branch loses its manual offset |

화면에서만 확인할 수 있는 기능 — 프레젠테이션, 인쇄 미리 보기, 전체 보기 창, 패널 접기/펴기, 컨텍스트 메뉴, 단축키, 저장 여부 묻기 — 은 `scripts/smoke.mjs` 의 GUI 단계가 검증합니다.

## 없는 기능

다음은 비교한 프로그램에는 있지만 My BrainMap 에는 아직 없는 기능입니다.

| 기능 | 가진 프로그램 | 비고 |
| --- | --- | --- |
| 실시간 공동 편집, 클라우드 공유 링크 | MindManager, EdrawMind, Lucidchart, SmartDraw | 서버와 계정이 필요합니다. 지금은 파일로 주고받습니다. |
| 버전 기록 (서버의 과거 판) | Lucidchart, SmartDraw | 실행 취소 기록은 열려 있는 동안만 남습니다. |
| 수식(LaTeX) 토픽 | EdrawMind | |
| 클립아트 라이브러리, 손그림 스타일 | EdrawMind | 아이콘 표식 세트는 있습니다. |
| 범용 도형 라이브러리 (순서도 기호, 네트워크, ERD, UML, 평면도 …) | SmartDraw, Lucidchart | 토픽 모양 9가지(둥근 사각형, 타원, 마름모, 육각형 등)만 있습니다. |
| 스윔레인, 레이어 | SmartDraw, Lucidchart | 경계로 가지를 묶을 수는 있습니다. |
| 데이터 연결 (스프레드시트에서 도형 만들기, 실시간 데이터) | Lucidchart, SmartDraw | CSV 로 내보낼 수는 있습니다. |
| 수식 계산 필드, 스마트 규칙 | MindManager | 사용자 속성은 값만 저장합니다. |
| 벤 다이어그램, 원형(버블) · 섹터 맵, 괄호 맵 레이아웃 | MindManager, EdrawMind | 요약 괄호는 있습니다. |
| 브레인스토밍 전용 모드 (타이머, 아이디어 카드) | MindManager, EdrawMind | 빠른 입력(Ctrl+Shift+Q)과 브레인스토밍 템플릿이 있습니다. |
| 워터마크, 맵 암호 | EdrawMind | |

새 기능을 넣을 때는 이 표의 줄을 "있는 기능"으로 옮기고, `test/parity.test.mjs` 에 같은 이름의 테스트를 더합니다.
