# MyBoard 사용 설명서 / User's Guide

<!-- lang:ko -->

## 한국어

MyBoard 는 칸반 보드와 이슈 관리 프로그램입니다. 프로젝트마다 보드·백로그·보고서·설정이 있고, 카드를 열 사이로 옮겨 일의 상태를 바꿉니다. 데이터는 데이터베이스(기본: 이 컴퓨터의 SQLite)에 저장되므로 따로 "저장" 할 것이 없습니다.

### 시작 화면

프로그램을 열면 움직이는 배경 위에 반투명 카드들이 나옵니다.

- **시작** 카드: 새 프로젝트, 열기, 데이터베이스 연결, 가져오기, 따라하기, 마지막 보드 이어서, 설정, 시작 화면 설정, 프로그램 정보, 끝내기.
- **데이터베이스** 카드: 지금 쓰는 데이터베이스의 종류·이름·연결 상태. "바꾸기…" 로 다른 데이터베이스에 연결합니다. 코어에 연결되지 않으면 빨간 알림과 "다시 연결" 단추가 나옵니다.
- **최근 보드와 프로젝트**: 최근에 연 보드. × 로 목록에서 뺍니다.
- **새 프로젝트 — 템플릿**: 칸반, 소프트웨어 팀, 버그 추적, 간단한 개인용.
- **샘플 프로젝트**: 이슈가 들어 있는 프로젝트 3가지 (지금 데이터베이스에 새로 만들어집니다).
- **배경**: 움직이는 배경의 종류, 속도, 카드 불투명도, 자동 바꾸기.

카드는 왼쪽 위 손잡이로 옮기고 오른쪽 아래 모서리로 크기를 바꿉니다. 모서리를 두 번 누르면 내용에 맞는 높이로 돌아갑니다. "자동 정렬" 은 기본 배치로 되돌립니다.

### 작업 화면

프로젝트나 보드를 열면 작업 화면이 됩니다.

- **툴바** (창의 제목 표시줄 역할): 새 프로젝트, 열기, 나가기, 가져오기, 내보내기, 실행 취소/다시 실행, 이슈 만들기, 찾기, 새로 고침, 보기 전환, 데이터베이스, 패널 단추. 오른쪽의 따라하기·테마·언어·설정·정보는 창이 좁아도 늘 보이고, 왼쪽 단추들은 » 안으로 접힙니다.
- **프로젝트 패널** (왼쪽): 프로젝트마다 보드, 백로그, 보고서, 프로젝트 설정. 오른쪽 클릭으로 아이콘 바꾸기, 키 복사.
- **보드** (가운데): 열과 카드. 
- **이슈 상세** (오른쪽): 고른 이슈의 설명, 댓글, 첨부, 기록. 위의 단추로 접습니다.
- **하단 패널**: 활동(누가 무엇을 바꿨는지), 메시지(알림과 오류), 정보(데이터베이스, 사용자, 이슈 수). Ctrl+J.
- **상태 표시줄**: 알림, 데이터베이스 종류, 사용자, 실시간 연결, 이슈 수, 테마, 언어, 시계. 오른쪽 아래 손잡이로 창 크기를 바꿉니다.

패널 사이의 경계를 끌어 너비와 높이를 바꾸며, 창의 위치와 크기와 함께 기억됩니다.

### 아이콘

프로젝트, 보드, 이슈 유형, 우선순위, 사용자 등 아이콘이 들어가는 곳은 모두 같은 **아이콘 고르기** 창을 씁니다.

- **기본 아이콘**: 400가지가 넘는 그림 (이슈 유형, 상태, 우선순위, 사물, 사람, 화살표, 차트, 기술, 자연 …). 한국어·영어로 찾습니다.
- **이모지**: 1000개가 넘는 이모지를 분류별로, 한국어·영어로 찾습니다.
- **올린 그림**: PNG·JPEG·GIF·WebP·BMP·ICO·SVG·AVIF 를 올립니다 (단추, 끌어 놓기, Ctrl+V 붙여넣기). 그림은 256px 이하로 줄여 데이터베이스에 저장하고, 움직이는 GIF·WebP 는 512KB 까지 그대로 둡니다.
- **글자**: 1–2 글자를 색 위에.
- **색**: 기본 아이콘과 글자의 색.

### 데이터베이스

설정 › 데이터베이스 (또는 시작 화면의 "바꾸기…") 에서 SQLite, MySQL, MariaDB, PostgreSQL, SQL Server 중 하나에 연결합니다. "연결 시험" 으로 확인하고 "이 데이터베이스로 바꾸기" 를 누르면 표를 만들거나 새 판으로 고친 뒤 연결합니다. "모든 데이터 복사" 는 지금 데이터를 대상 데이터베이스로 옮깁니다. 비밀번호는 이 컴퓨터에 암호화되어 저장됩니다.

### 웹에서 쓰기

`npm run web` 으로 웹 서버를 실행하면 브라우저에서 같은 화면을 씁니다. 여러 사람이 같은 보드를 열면 바뀐 내용이 실시간으로 보이고, 상태 표시줄에 보고 있는 사람 수가 나옵니다.

### 단축키

| 키 | 하는 일 |
|---|---|
| Ctrl+N | 새 프로젝트 |
| Ctrl+O | 열기 |
| Ctrl+I / Ctrl+E | 가져오기 / 내보내기 |
| Ctrl+Z / Ctrl+Y | 실행 취소 / 다시 실행 |
| C | 이슈 만들기 |
| Ctrl+F | 찾기 |
| F5 | 새로 고침 |
| Ctrl+J | 하단 패널 |
| Ctrl+Shift+1 / 2 | 왼쪽 / 오른쪽 패널 |
| Ctrl+Shift+L | 언어 |
| Ctrl+Shift+H | 시작 화면 |
| Ctrl+, | 설정 |
| F11 | 따라하기 |
| F1 | 프로그램 정보 |

<!-- lang:en -->

## English

MyBoard is a Kanban board and issue tracker. Each project has boards, a backlog, reports and settings; you change the state of work by moving cards across the columns. Data is stored in a database (by default SQLite on this computer), so there is nothing to "save".

### Start page

When the program opens, translucent cards sit over a moving background.

- **Start** card: new project, open, connect a database, import, tutorial, continue the last board, settings, start page settings, about, quit.
- **Database** card: the kind, name and connection of the database in use. "Change…" connects to another database. When the core cannot be reached, a red notice and a "Reconnect" button appear.
- **Recent boards and projects**: the boards opened lately; × removes one from the list.
- **New project — templates**: Kanban, Software team, Bug tracking, Simple personal.
- **Sample projects**: three projects with issues in them (created in the current database).
- **Background**: the kind of moving background, its speed, the card opacity and the automatic change.

Move a card by the handle at its top left, resize it by its bottom-right corner; a double click on the corner fits its height again. "Auto arrange" restores the default layout.

### Workspace

Opening a project or board shows the workspace.

- **Toolbar** (it is also the title bar): new project, open, leave, import, export, undo/redo, create issue, find, refresh, view switch, database, panel buttons. Tutorial, theme, language, settings and about on the right always stay; the left buttons fold into » in a narrow window.
- **Projects panel** (left): each project's boards, backlog, reports and settings. Right-click to change its icon or copy its key.
- **Board** (centre): the columns and cards.
- **Issue detail** (right): the chosen issue's description, comments, attachments and history. Its button folds it.
- **Bottom panel**: activity (who changed what), messages (notices and errors) and information (database, user, issue counts). Ctrl+J.
- **Status bar**: notices, the database kind, the user, the realtime connection, issue counts, theme, language, clock. The grip at the bottom right resizes the window.

Drag the borders between the panels to resize them; sizes are remembered with the window's place and size.

### Icons

Every place that takes an icon — projects, boards, issue types, priorities, users — uses the same **icon picker**:

- **Built-in**: over 400 pictures (issue types, status, priority, objects, people, arrows, charts, technology, nature …), searchable in English and Korean.
- **Emoji**: over 1000 emoji by category, searchable in English and Korean.
- **Uploaded**: upload PNG, JPEG, GIF, WebP, BMP, ICO, SVG or AVIF (button, drag and drop, or paste with Ctrl+V). Pictures are scaled to at most 256 px and stored in the database; animated GIF and WebP stay as they are up to 512 KB.
- **Letters**: one or two letters on a colour.
- **Colour**: tints built-in icons and colours letters.

### Database

Settings › Database (or "Change…" on the start page) connects to SQLite, MySQL, MariaDB, PostgreSQL or SQL Server. "Test connection" checks it; "Switch to this database" creates or upgrades the tables and connects. "Copy all data" moves the current data into the target database. The password is stored encrypted on this computer.

### On the web

`npm run web` starts the web server, and a browser shows the same window. When several people open one board, changes appear in real time and the status bar shows how many are viewing it.

### Shortcuts

| Key | Does |
|---|---|
| Ctrl+N | New project |
| Ctrl+O | Open |
| Ctrl+I / Ctrl+E | Import / export |
| Ctrl+Z / Ctrl+Y | Undo / redo |
| C | Create issue |
| Ctrl+F | Find |
| F5 | Refresh |
| Ctrl+J | Bottom panel |
| Ctrl+Shift+1 / 2 | Left / right panel |
| Ctrl+Shift+L | Language |
| Ctrl+Shift+H | Start page |
| Ctrl+, | Settings |
| F11 | Tutorial |
| F1 | About |
