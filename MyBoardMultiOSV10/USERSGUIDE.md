# MyBoard 사용 설명서 / User's Guide

<!-- lang:ko -->

## 한국어

MyBoard 는 칸반 보드와 이슈 관리 프로그램입니다. 프로젝트마다 보드·백로그·보고서·프로젝트 설정이 있고, 카드를 열 사이로 옮겨 일의 상태를 바꿉니다. 데이터는 데이터베이스(기본: 이 컴퓨터의 SQLite)에 바로바로 저장됩니다. 프로젝트를 `.myboard` 파일로 따로 저장할 수도 있습니다.

### 시작 화면

프로그램을 열면 움직이는 배경 위에 반투명 카드들이 나옵니다.

- **시작** 카드: 새 프로젝트, 열기, 데이터베이스 연결, 가져오기, 따라하기, 마지막 보드 이어서, 설정, 시작 화면 설정, 프로그램 정보, 끝내기.
- **데이터베이스** 카드: 지금 쓰는 데이터베이스의 종류·이름·연결 상태. "바꾸기…" 로 다른 데이터베이스에 연결합니다.
- **최근 보드와 프로젝트**, **새 프로젝트 — 템플릿** (칸반, 소프트웨어 팀, 버그 추적, 간단한 개인용), **샘플 프로젝트**, **배경** (종류, 속도, 카드 불투명도).

카드는 왼쪽 위 손잡이로 옮기고 오른쪽 아래 모서리로 크기를 바꿉니다. 나란히 놓인 카드는 같은 높이로 맞춰집니다. "자동 정렬" 은 기본 배치로 되돌립니다.

### 작업 화면

- **툴바**: 새 프로젝트, 열기, 저장, 인쇄, 나가기, 가져오기, 내보내기, 실행 취소·다시 실행, 이슈 만들기, 열 추가, 찾기, 새로 고침, 보기 전환(보드·백로그·보고서·프로젝트 설정), 패널 단추. 오른쪽의 따라하기·테마·언어·설정·정보는 창이 좁아도 늘 보입니다.
- **왼쪽 패널 위**: 프로젝트 목록. 프로젝트마다 보드, 백로그, 보고서, 프로젝트 설정.
- **왼쪽 패널 아래**: 지금 보기의 고르는 항목 — 보드는 빠른 필터·스윔레인·열 목록, 백로그는 저장된 필터·에픽·버전, 보고서는 보고서와 대시보드 목록, 프로젝트 설정은 섹션 목록. 경계를 끌어 높이를 바꿉니다.
- **가운데**: 보드, 백로그, 보고서 또는 프로젝트 설정.
- **오른쪽 패널**: 이슈 상세.
- **하단 패널**: 활동, 메시지, 정보 (Ctrl+J). **상태 표시줄**: 데이터베이스, 사용자, 실시간 연결, 이슈 수, 테마, 언어.

우클릭하면 어디서나 아이콘이 붙은 메뉴가 나옵니다.

### 보드

- **카드**: 누르면 오른쪽에 이슈 상세, 두 번 누르면 편집 창(요약·설명·담당자·우선순위·레이블·포인트·기한·아이콘)이 열립니다. 바꾼 칸만 저장되고 실행 취소할 수 있습니다.
- **옮기기**: 카드를 다른 열로 끌면 상태가 바뀌고, 같은 열 안에서 끌면 순서가 바뀝니다. 워크플로가 막는 열은 끄는 동안 흐리게 보입니다. 키보드: 화살표로 이동, Enter 로 상세, Ctrl+→ 로 다음 열.
- **열 추가** (툴바 또는 "오래된 완료 보기" 옆 단추): 이름, 아이콘(열 이름에 맞는 아이콘이 먼저 정해지고, 100가지가 넘는 열 아이콘 중에서 고를 수 있음), 위치(기본: 맨 앞), 열의 상태(새 상태 이름·분류, 기존 상태, 또는 상태 없이). 놓는 위치에 맞춰 워크플로가 이어집니다 — 예를 들어 Backlog 다음에 두면 Backlog ⇄ 새 상태 ⇄ 다음 열.
- **열**: 머리글 메뉴나 Ctrl+Shift+←/→ 로 좌우 순서를 바꾸고, 아이콘을 눌러 아이콘을 바꿉니다. 접기·펴기 단추는 머리글 오른쪽 끝에 있습니다.
- **빠른 필터·스윔레인**: 카드 위 도구 줄 또는 왼쪽 패널 아래에서 켜고 끕니다. WIP 한도를 넘은 열은 빨갛게 보입니다.

### 이슈 상세

필드는 사람·계획·시간·날짜·모양·사용자 정의 필드로 묶여 있고, 빈 필드는 숨겨집니다("빈 필드 보기"). 위쪽 칩으로 설명·체크리스트·하위 작업·연결·첨부·활동으로 바로 갑니다. 상태 단추로 전환하고, 설명은 Markdown 과 `:icon[…]`·@멘션을 씁니다. 다른 사람이 같은 이슈를 고치면 충돌을 알려 주고 고르게 합니다.

### 백로그와 검색

이슈 목록을 열·상태·에픽·담당자로 묶어 보고, 끌어서 순위를 바꾸며, 여러 개를 골라 한꺼번에 바꿉니다. 기본 검색(드롭다운)과 JQL 검색(입력 중 오류 표시, 자동 완성)이 있고, 검색을 필터로 저장합니다. CSV 로 내보냅니다.

### 보고서와 대시보드

- **보고서**: 누적 흐름도, 관리도, 처리량, **번다운**(남은 이슈와 0까지 내려가는 이상선), 생성 대 해결, 작업량, 버전 번업, 분포. 기간을 고르고 PNG·SVG·CSV 로 내보냅니다.
- **기준 열**: 보고서는 이 열에 들어간 이슈를 "완료" 로 셉니다. 기본은 보드의 가장 오른쪽 열이고, 보고서 위의 "기준 열" 칩을 눌러 바꿉니다(보드 설정에 저장되어 모두에게 적용).
- **대시보드**: 가젯을 추가하고, 제목 줄을 끌어 옮기고, 오른쪽 아래 모서리를 끌어 크기를 바꿉니다.

### 프로젝트 설정

정보(이름·키·아이콘), 구성원·역할, 사용자 계정(관리자), 이슈 유형·상태·우선순위·해결 방법·구성 요소·버전·레이블·사용자 정의 필드, 워크플로, 보드 구성(열·WIP·스윔레인·빠른 필터·카드 색·카드 모양), 자동화, 가져오기·내보내기.

- **구성원 추가**: 구성원·역할 아래 줄에서 사용자와 역할을 골라 추가합니다. 목록에 없는 사람은 먼저 "사용자 계정" 에서 만듭니다.
- **워크플로**: 이름·시작 상태·상자 배치·전환 표를 고치면 "저장되지 않은 변경" 막대가 나옵니다. **저장**(또는 Ctrl+S)으로 반영하고 **되돌리기**로 버립니다. 전환 추가·편집 양식은 자체 저장 단추가 있습니다.

### 저장과 파일

- **저장** (Ctrl+S): 데이터베이스에 저장합니다. 데이터는 고칠 때마다 저장되며, 아직 저장하지 않은 변경(워크플로 편집 등)이 있으면 그것도 함께 저장합니다.
- **파일로 저장** (Ctrl+Shift+S): 프로젝트를 `.myboard` 파일로 저장합니다. 처음에만 위치를 묻고 다음부터 같은 파일에 저장합니다. **다른 이름으로 파일 저장** 은 다른 위치에 저장합니다.
- **가져오기** (Ctrl+I): `.myboard`, CSV, 다른 보드 앱의 JSON.

### 인쇄

툴바의 인쇄 단추(저장 오른쪽) 또는 Ctrl+P 로 인쇄 창을 엽니다. 왼쪽에서 프린터·매수·용지·방향·여백·색·머리글/바닥글과 인쇄할 내용(프로젝트 정보, 보드, 보고서, 이슈 목록)을 고르고, 오른쪽에서 쪽마다 미리 봅니다. **인쇄** 를 누르면 고른 프린터로 바로 인쇄됩니다(웹에서는 브라우저의 인쇄 창). **PDF로 저장** 도 있습니다.

### 아이콘

아이콘이 들어가는 곳은 모두 같은 **아이콘 고르기** 창을 씁니다: 기본 아이콘(460가지 넘게, 한국어·영어로 찾기), 이모지, 올린 그림(PNG·JPEG·GIF·WebP·BMP·ICO·SVG·AVIF), 글자, 색.

### 데이터베이스

설정 › 데이터베이스 에서 SQLite, MySQL, MariaDB, PostgreSQL, SQL Server 중 하나에 연결합니다. "연결 시험" 으로 확인하고 "이 데이터베이스로 바꾸기" 로 연결합니다. "모든 데이터 복사" 는 지금 데이터를 대상 데이터베이스로 옮깁니다.

### 웹에서 쓰기

`npm run web` 으로 웹 서버를 실행하면 브라우저에서 같은 화면을 씁니다. 여러 사람이 같은 보드를 열면 바뀐 내용이 실시간으로 보입니다.

### 단축키

| 키 | 하는 일 |
|---|---|
| Ctrl+N / Ctrl+O | 새 프로젝트 / 열기 |
| Ctrl+S / Ctrl+Shift+S | 저장 / 파일로 저장 |
| Ctrl+P | 인쇄 |
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

MyBoard is a Kanban board and issue tracker. Every project has a board, a backlog, reports and project settings; moving cards between columns changes the state of the work. Data goes to the database (by default SQLite on this computer) as you work. A project can also be saved to a `.myboard` file.

### Start page

The program opens on translucent cards over a moving background.

- **Start**: new project, open, database, import, tutorial, continue the last board, settings, start page settings, about, exit.
- **Database**: the type, name and state of the database in use; "Change…" connects to another one.
- **Recent boards and projects**, **New project — templates** (Kanban, software team, bug tracking, simple personal), **Sample projects**, **Background** (kind, speed, card opacity).

Move a card by its top-left grip and resize it from its bottom-right corner; cards side by side take the same height. "Auto-arrange" restores the default layout.

### Workspace

- **Toolbar**: new project, open, save, print, leave, import, export, undo/redo, create issue, add column, find, refresh, the views (board, backlog, reports, project settings) and the panel buttons. Tutorial, theme, language, settings and about on the right always stay visible.
- **Left panel, top**: the projects, each with its board, backlog, reports and project settings.
- **Left panel, bottom**: what the current view lets you choose — the board's quick filters, swimlanes and columns; the backlog's saved filters, epics and versions; the reports and dashboards; the project settings' sections. Drag the divider to resize it.
- **Centre**: the board, backlog, reports or project settings. **Right panel**: the issue detail.
- **Bottom panel**: activity, messages, information (Ctrl+J). **Status bar**: database, user, realtime, issue count, theme, language.

A right-click anywhere opens a menu with an icon on every item.

### Board

- **Cards**: click for the issue detail on the right, double-click for the edit form (summary, description, assignee, priority, labels, points, due date, icon). Only what changed is saved, and it can be undone.
- **Moving**: drag a card to another column to change its status, within a column to change its rank. Columns the workflow forbids dim while dragging. Keyboard: arrows move, Enter opens the detail, Ctrl+→ moves to the next column.
- **Add column** (toolbar, or the button next to "Show older done"): name, icon (one matching the name is chosen first; over 100 column icons to pick from), position (default: first) and the column's status (a new one with your name and category, an existing one, or none). The workflow follows the position — placed after Backlog, it links Backlog ⇄ new status ⇄ the next column.
- **Columns**: reorder from the header menu or with Ctrl+Shift+←/→; click the icon to change it. The collapse button sits at the right end of the header.
- **Quick filters and swimlanes**: in the tool row above the cards or in the left panel's lower part. A column over its WIP limit turns red.

### Issue detail

Fields are grouped (people, planning, time, dates, appearance, custom fields); empty fields are hidden ("Show empty fields"). The chips at the top jump to description, checklist, subtasks, links, attachments and activity. Use the status button for transitions; descriptions take Markdown, `:icon[…]` and @mentions. When someone else edits the same issue, the conflict is shown and you choose.

### Backlog and search

Group the issues by column, status, epic or assignee, drag to rank, select several to change them together. Basic search (drop-downs) and JQL search (errors while typing, autocompletion); save a search as a filter; export CSV.

### Reports and dashboards

- **Reports**: cumulative flow, control chart, throughput, **burndown** (issues left against an ideal line to zero), created vs resolved, workload, version burn-up, breakdown. Choose the period and export PNG, SVG or CSV.
- **Reference column**: reports count an issue as done once it is in this column. By default the board's rightmost column; click the "Reference column" chip above a report to change it (saved in the board settings, for everyone).
- **Dashboards**: add gadgets, drag a title bar to move one, drag its bottom-right corner to resize it.

### Project settings

Details (name, key, icon), members and roles, user accounts (administrators), issue types, statuses, priorities, resolutions, components, versions, labels, custom fields, workflows, board configuration (columns, WIP, swimlanes, quick filters, card colours, card layout), automation, import and export.

- **Adding members**: pick a user and a role on the line under Members and roles. Someone not in the list is first created under "User accounts".
- **Workflows**: editing the name, initial status, box positions or the transition table shows an "unsaved changes" bar; **Save** (or Ctrl+S) writes them and **Discard** drops them. The transition form has its own Save.

### Saving and files

- **Save** (Ctrl+S): the database. Data is saved as you edit; changes still kept as unsaved (workflow edits) are written too.
- **Save to file** (Ctrl+Shift+S): the project as a `.myboard` file. It asks where only the first time and then writes the same file; **Save to another file** asks again.
- **Import** (Ctrl+I): `.myboard`, CSV, other board apps' JSON.

### Printing

The Print button (right of Save) or Ctrl+P opens the print window: printer, copies, paper, orientation, margins, colour, header/footer and what to print (project information, board, reports, issue list) on the left, a page-by-page preview on the right. **Print** prints straight to the chosen printer (on the web, the browser's print dialog). **Save as PDF** is there too.

### Icons

Every icon is chosen in the same **icon picker**: built-in icons (over 460, searched in Korean or English), emoji, uploaded pictures (PNG, JPEG, GIF, WebP, BMP, ICO, SVG, AVIF), letters, colour.

### Database

Settings › Database connects to SQLite, MySQL, MariaDB, PostgreSQL or SQL Server. "Test connection" checks it, "Switch to this database" connects. "Copy all data" moves the current data to the target database.

### On the web

`npm run web` runs the web server; the same screens work in a browser, and several people on the same board see each other's changes live.

### Shortcuts

| Key | Does |
|---|---|
| Ctrl+N / Ctrl+O | New project / open |
| Ctrl+S / Ctrl+Shift+S | Save / save to file |
| Ctrl+P | Print |
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
