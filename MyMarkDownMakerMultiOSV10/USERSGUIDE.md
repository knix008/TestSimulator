# MyMarkDownMaker User's Guide

<!-- lang:ko -->
## 한국어

### 무엇을 하는 프로그램인가요

MyMarkDownMaker 는 여러 Markdown(.md) 파일을 하나의 문서로 병합합니다. 병합한 문서의 구조(헤딩 트리)와 그림을 한눈에 보여 주고, 헤딩에 1, 1.1, 1.1.1 … 계층 번호를 매기며, 표지·목차·그림 목차를 붙여 Markdown, HTML, PDF, Word 로 내보냅니다. Windows, macOS, Linux 와 웹 브라우저에서 같은 화면으로 동작합니다.

### 설치

- Windows 설치 파일 `MyMarkDownMaker-Setup-<버전>.exe` 를 실행합니다.
- 처음에 **설치 언어**(한국어 / English)를 고릅니다. 프로그램은 처음 실행될 때 그 언어로 열립니다. 나중에는 툴바의 국기 버튼이나 설정 › 일반에서 바꿉니다.
- 이전에 설치한 MyMarkDownMaker 가 있으면 **완전히 지우고 다시 설치할지** 묻습니다. 예를 누르면 이전 프로그램과 바로가기를 지우고 새로 설치하며, 다음 질문에서 사용자 데이터(설정, 최근 목록, 창 위치)를 지울지 정합니다. 아니오를 누르면 아무것도 바꾸지 않고 설치를 그만둡니다.
- 바로가기 페이지에서 바탕 화면과 시작 메뉴 바로가기를 고릅니다. 시작 메뉴에는 사용 설명서 바로가기도 함께 생깁니다.

### 화면 구성

| 부분 | 하는 일 |
| --- | --- |
| 메뉴 막대 | 시작 버튼, 파일 · 편집 · 서식 · 문서 · 보기 · 도움말 메뉴, 문서 이름, 창 단추 |
| 툴바 | 자주 쓰는 명령. 창이 좁으면 뒤쪽 묶음이 » 메뉴로 들어갑니다 |
| 왼쪽 패널 | 파일 · 구조 · 그림 탭 |
| 가운데 | 편집 · 미리보기 · 나란히 보기 |
| 오른쪽 패널 | 문서 속성: 표지, 페이지, 내보내기 글꼴, 병합 |
| 아래 패널 | 문제 · 메시지 · 정보 |
| 상태 표시줄 | 파일·헤딩·그림 수, 분량, 저장 여부, 글꼴, 확대 비율, 테마, 언어, 시계 |

### 시작 화면

프로그램을 시작하면 움직이는 문서 배경(타자 치는 페이지, 하나로 모이는 파일, 번호 매겨지는 구조 등 16가지) 위에 카드가 보입니다. 카드는 손잡이로 끌어 옮기고 오른쪽 아래 모서리로 크기를 바꿉니다. 자동 정렬로 처음 배치로 돌아갑니다.

- **시작하기**: 폴더 추가, 파일 추가, 새 문서, 문서 열기, 이어서 하기, 튜토리얼, 설정, 프로그램 정보, 끝내기
- **최근**: 최근에 쓴 파일과 폴더 (데스크톱)
- **샘플 문서**: 사용 설명서, 분기 보고서, API 문서. 프로그램 언어로 열리며 아무 파일도 바꾸지 않습니다
- **움직이는 배경**: 장면, 속도, 카드 불투명도, 자동 변경

### 파일 모으기

- **폴더 추가**(Ctrl+Shift+O): 폴더의 Markdown 파일을 모두 추가합니다. **하위 폴더 포함**이 켜져 있으면 하위 폴더까지 훑습니다. 이름이 점(.)으로 시작하는 파일과 폴더는 건너뜁니다.
- **파일 추가**(Ctrl+Shift+A): .md / .markdown 파일을 골라 추가합니다.
- 파일과 폴더를 창에 **끌어다 놓아도** 추가됩니다.
- Markdown 이 가리키는 로컬 그림(png, jpg, gif, webp, svg, bmp, tif, ico, avif)은 자동으로 문서에 넣어집니다. 편집기에는 `mmm-img:1` 같은 짧은 참조로 보이고, 미리보기와 모든 내보내기에는 실제 그림이 들어갑니다.

### 파일 목록

- 체크를 끄면 그 파일이 병합에서 빠집니다. 모두 선택 / 모두 해제 / 선택한 파일 제거 버튼이 있습니다.
- 손잡이를 끌거나 ▲▼ 로 순서를 바꿉니다. 이때 정렬은 "직접 지정"이 됩니다.
- 정렬: 이름 오름차순 / 내림차순, 최신 / 오래된 날짜순, 직접 지정.
- 목록이나 병합 옵션이 바뀌면 바로 다시 병합합니다. 단, 문서를 **직접 고친 뒤**에는 고친 내용을 지키기 위해 자동 병합을 멈추고 "다시 병합 필요" 표시를 띄웁니다. **다시 병합**(F5)을 눌러야 원본에서 새로 만듭니다.

### 병합 옵션

| 옵션 | 뜻 |
| --- | --- |
| 하위 폴더 포함 | 폴더를 추가할 때 하위 폴더의 파일까지 모읍니다 |
| 파일명 헤더 넣기 | 각 파일 앞에 `## 상대 경로` 헤딩을 넣습니다 |
| 병합할 때 번호 매기기 | 모든 헤딩에 1, 1.1, 1.1.1 … 번호를 매깁니다 |
| 번호 다시 매기기 (F7) | 편집 중에 번호를 새로 매기고 목차를 맞춥니다 |

### 편집과 미리보기

- **편집**(Alt+1): 병합된 문서를 직접 고칩니다. Markdown 기호가 색으로 구분됩니다. 서식 막대에 제목 1–5, 굵게, 기울임, 취소선, 인라인 코드, 목록, 번호 목록, 할 일 목록, 인용, 링크, 그림 넣기, 코드 블록, 표, 구분선이 있습니다.
- **미리보기**(Alt+2): 표지, 목차, 그림 목차와 본문을 내보내기와 같은 글꼴과 크기로 보여 줍니다. 목차의 항목을 누르면 그 위치로 갑니다.
- **나란히**(Alt+3): 왼쪽에서 고치고 오른쪽에서 결과를 봅니다. 가운데 경계선을 끌어 폭을 나누고, 두 번 누르면 반반이 됩니다.
- 확대 / 축소: Ctrl+= / Ctrl+-, Ctrl+휠, Ctrl+0 은 100%. 확대는 화면에만 쓰이고 내보내기에는 영향이 없습니다.
- 찾기 / 바꾸기: Ctrl+F.
- 목차와 그림 목차는 헤딩과 그림을 따라 저절로 바뀝니다.

### 구조와 그림

- **구조** 탭은 표지·목차·그림 목차와 본문의 헤딩 트리를 보여 줍니다. 누르면 편집기에서 그 줄을 고르거나 미리보기를 그 위치로 옮깁니다.
- **그림** 탭은 문서의 모든 그림을 보여 줍니다. − / + 로 크기를 문서 폭의 10–100% 로 바꾸면 Markdown 에 `"w=60%"` 로 적히고 미리보기와 내보내기에 반영됩니다.

### 문서 속성 (오른쪽 패널)

- **문서**: 내보낼 파일 이름, 저장한 파일, 분량.
- **표지**: 표지 사용, 표지 제목(비우면 문서 첫 제목), 버전, 작성자, 작성 날짜(비우면 오늘), 제목 정렬.
- **페이지**: 목차, 그림 목차, 페이지 번호와 위치, 머리글, 바닥글.
- **내보내기 글꼴**: 이 컴퓨터의 글꼴, 본문 크기, 줄 간격. 미리보기와 모든 내보내기에 쓰입니다.
- **병합**: 번호 매기기, 하위 폴더, 파일명 헤더.

### 저장과 내보내기

- **저장**(Ctrl+S): 문서를 Markdown(.md)으로 저장합니다. 처음에만 위치를 묻고, 다음부터는 같은 파일에 씁니다. **다른 이름으로 저장**은 Ctrl+Shift+S.
- **문서 열기**(Ctrl+O): 저장해 둔 .md 문서를 병합하지 않고 그대로 열어 계속 고칩니다.
- **내보내기**(Ctrl+E): Markdown, HTML, PDF, Word(.doc). PDF 와 인쇄는 A4 페이지로 나누어 목차와 그림 목차에 실제 페이지 번호를 넣고, 머리글·바닥글·페이지 번호를 찍습니다. HTML 과 Word 에도 계산한 페이지 번호가 들어갑니다. 내보낸 뒤 파일이나 폴더를 바로 열 수 있습니다.
- **인쇄**(Ctrl+P): 인쇄 창을 엽니다 (아래 "인쇄 창").
- 웹 브라우저에서는 저장과 내보내기가 내려받기로 되고, PDF 는 인쇄 대화상자의 "PDF로 저장"으로 만듭니다.


### 그림 다루기

- 편집기에서 그림은 **그림 그대로** 보이고 한 글자처럼 움직입니다 (커서가 건너뛰고, Backspace 로 통째로 지워집니다). 서식 막대의 그림 버튼이나 보기 › 표시 › "편집기에서 그림 보이기"로 Markdown 글자로 바꿔 볼 수 있습니다.
- 그림 오른쪽 아래 모서리의 손잡이를 끌면 크기가 바뀝니다 (문서 폭의 10–100%, 5% 단위). 크기는 `"w=60%"` 로 적혀 미리보기와 모든 내보내기에 쓰입니다.
- 탐색기에서 그림 파일을 편집기로 **끌어다 놓으면** 놓은 자리에 들어갑니다. 창의 다른 곳에 놓으면 커서 자리에 들어갑니다.
- 그림을 마우스 오른쪽 단추로 누르면(편집기, 미리보기) 크기 25/50/75/100%, 원래 크기, 설명 고치기, 다른 그림으로 바꾸기, 그림 파일로 저장, Markdown 복사, 그림 지우기가 있습니다.

### 장마다 새 페이지, 제목 크기

- 툴바의 **장마다 새 페이지** 를 켜면 최상위 제목(장)마다 새 페이지에서 시작합니다 (PDF, 인쇄, Word). 미리보기에는 페이지가 나뉘는 곳에 점선이 보입니다.
- 오른쪽 패널 › 내보내기 글꼴의 **크기를 바꿀 항목**에서 본문, 장(제목 1), 절(제목 2), 항(제목 3), 제목 4, 제목 5 를 고르고 크기를 바꿉니다. 미리보기나 구조 탭에서 제목을 누르면 그 수준이 바로 골라집니다. ↻ 는 자동 크기(본문 크기에 맞춤)로 돌려 놓습니다.

### 로고

- 오른쪽 패널의 **로고** 또는 설정 › 로고에서 PNG, GIF, JPG, WEBP, AVIF 같은 그림을 고릅니다 (1.5 MB 까지).
- 머리글·바닥글에 넣으면 모든 페이지에 들어가고 왼쪽·가운데·오른쪽 위치와 높이(mm)를 정합니다. 같은 자리의 머리글 문구와 나란히 놓입니다.
- 표지에 넣으면 위 · 가운데(제목 바로 위) · 아래 중 한 곳에 놓이고 높이를 따로 정합니다.

### 목차

목차와 그림 목차의 항목과 페이지 번호 사이는 줄 가운데 높이의 점(·····)으로 이어집니다 (설정 › 표지·목차 › 점선 이음표). 페이지 번호는 문서를 A4 페이지로 나눠 계산하며, 미리보기에도 잠시 뒤 나타납니다.

### 인쇄 창

인쇄(Ctrl+P)는 프로그램의 인쇄 창을 엽니다. 왼쪽에서 프린터, 매수, 컬러·흑백, 용지(A4, A3, A5, B5, Letter, Legal), 방향, 여백, 인쇄할 페이지(전체 / 범위, 예: 1-3, 5)와 문서 구성(표지, 목차, 그림 목차, 페이지 번호, 머리글, 바닥글)을 고르면 오른쪽 미리 보기가 바로 다시 나눠집니다. **인쇄**를 누르면 대화상자 없이 고른 프린터로 바로 나갑니다. "Microsoft Print to PDF" 처럼 파일을 만드는 프린터는 PDF 저장 위치를 묻습니다. **PDF로 저장**과 **시스템 대화상자…** 도 있습니다.

### Markdown 내보내기의 그림

그림이 있는 문서를 Markdown 으로 내보내면 그림을 **파일 안에 넣을지**(Base64), **그림 파일로 따로 저장할지** 묻습니다. 따로 저장하면 .md 옆의 `<파일 이름>_images` 폴더에 그림이 들어가고 .md 는 그 파일을 가리킵니다. 고른 방식은 다음에 기본값이 됩니다.

### 실행 취소

Ctrl+Z / Ctrl+Y 는 입력뿐 아니라 파일 추가·제거·순서·체크, 번호 다시 매기기, 다시 병합, 그림 크기까지 되돌립니다. 빠르게 이어 친 글자는 한 단계로 묶입니다.

### 문제 · 메시지 · 정보

아래 패널의 **문제** 탭은 건너뛴 헤딩 수준, 내용 없는 헤딩, 같은 헤딩, 찾지 못한 그림, 주소 없는 링크, 닫히지 않은 코드 블록, 빈 파일, 헤딩 없는 파일을 알려 줍니다. 항목을 누르면 그 줄로 갑니다. **메시지**는 지금까지의 알림과 오류, **정보**는 문서의 요약입니다.

### 모양

- 테마: 다크 20개, 라이트 20개, 시스템을 따르는 테마, 직접 만드는 테마. 툴바의 팔레트 버튼은 무작위, ▾ 는 전체 목록입니다.
- 모든 아이콘은 뜻에 따라 색이 다릅니다.
- 설정 › 글꼴에서 프로그램 글꼴, 크기, 굵기, 편집기 글자 크기를 바꿉니다.
- 창 위치와 크기, 패널 폭은 다음 실행 때 그대로입니다.

### 단축키

| 키 | 기능 |
| --- | --- |
| Ctrl+N / Ctrl+O | 새 문서 / 문서 열기 |
| Ctrl+Shift+O / Ctrl+Shift+A | 폴더 추가 / 파일 추가 |
| Ctrl+S / Ctrl+Shift+S | 저장 / 다른 이름으로 저장 |
| Ctrl+E / Ctrl+P | 내보내기 / 인쇄 |
| Ctrl+Z / Ctrl+Y | 실행 취소 / 다시 실행 |
| Ctrl+F | 찾기 / 바꾸기 |
| Ctrl+B / Ctrl+I / Ctrl+K | 굵게 / 기울임 / 링크 |
| Ctrl+1 … Ctrl+5 | 제목 1–5 (편집 중) |
| Alt+1 / Alt+2 / Alt+3 | 편집 / 미리보기 / 나란히 |
| F5 / F7 | 다시 병합 / 번호 다시 매기기 |
| Ctrl+Shift+1 / 2, Ctrl+J | 왼쪽 / 오른쪽 / 아래 패널 |
| Ctrl+Shift+L | 언어 바꾸기 |
| Ctrl+Shift+H | 시작 화면 |
| Ctrl+, / F1 / F11 | 설정 / 정보 / 튜토리얼 |

<!-- lang:en -->
## English

### What it does

MyMarkDownMaker merges many Markdown (.md) files into one document. It shows the document's structure (the heading tree) and its pictures, numbers the headings 1, 1.1, 1.1.1 …, and exports it with a cover, contents and a list of figures to Markdown, HTML, PDF and Word. It works the same on Windows, macOS, Linux and in a web browser.

### Installing

- Run the Windows installer `MyMarkDownMaker-Setup-<version>.exe`.
- First choose the **installer language** (한국어 / English). The program opens in that language the first time it starts; later, change it with the flag button on the toolbar or in Settings › General.
- When an earlier MyMarkDownMaker is installed, the installer asks whether to **remove it completely and install again**. Yes removes the earlier program and its shortcuts and installs; the next question decides whether to delete the user data (settings, recent lists, window place). No stops the installation without changing anything.
- The Shortcuts page creates a desktop and a Start menu shortcut; the Start menu also gets the user's guide.

### The window

| Part | What it does |
| --- | --- |
| Menu bar | The Start button, the File · Edit · Format · Document · View · Help menus, the document name, the window buttons |
| Toolbar | The commands used most. In a narrow window the last groups move into the » menu |
| Left panel | Files · Structure · Figures |
| Centre | Edit · Preview · Side by side |
| Right panel | Document properties: cover, pages, export font, merging |
| Bottom panel | Problems · Messages · Information |
| Status bar | Files, headings and pictures, length, saved or not, font, zoom, theme, language, clock |

### The start page

At start a moving document background (a page being typed, files merging into one, an outline being numbered and 13 more) shows behind a board of cards. Drag a card by its handle, resize it from its bottom-right corner; Arrange puts them back.

- **Get started**: add folder, add files, new document, open document, continue, tutorial, settings, about, quit
- **Recent**: files and folders used lately (desktop)
- **Sample documents**: a user's manual, a quarterly report, an API reference — in the program language; no file is changed
- **Moving background**: the scene, speed, card opacity, automatic change

### Collecting files

- **Add folder** (Ctrl+Shift+O): adds every Markdown file of a folder; with **Include sub-folders** on, its sub-folders too. Files and folders whose names start with a dot are skipped.
- **Add files** (Ctrl+Shift+A): pick .md / .markdown files.
- **Dropping** files and folders on the window adds them too.
- Local pictures the Markdown links to (png, jpg, gif, webp, svg, bmp, tif, ico, avif) are embedded. The editor shows a short reference such as `mmm-img:1`; the preview and every export carry the real picture.

### The file list

- Untick a file to leave it out of the merge. Tick all / untick all / remove the ticked files are buttons.
- Drag the grip or use ▲▼ to change the order; the order then becomes "Custom".
- Order: name A → Z / Z → A, newest / oldest first, custom.
- When the list or the merge options change, the document is merged again at once — until you **edit it yourself**: then your edits are kept, the automatic merge stops and "Merge again needed" shows. **Merge again** (F5) builds it from the sources.

### Merge options

| Option | Meaning |
| --- | --- |
| Include sub-folders | Adding a folder also collects the files of its sub-folders |
| Insert file name headings | A `## relative path` heading before each file |
| Number headings when merging | Every heading gets 1, 1.1, 1.1.1 … |
| Renumber headings (F7) | Fresh numbers while editing; the contents follow |

### Editing and preview

- **Edit** (Alt+1): edit the merged document itself; Markdown marks are coloured. The formatting bar has headings 1–5, bold, italic, strikethrough, inline code, lists, numbered lists, task lists, quote, link, insert picture, code block, table and rule.
- **Preview** (Alt+2): the cover, contents, list of figures and body in the export's font and size. Click a contents entry to go there.
- **Side by side** (Alt+3): edit on the left, see the result on the right. Drag the divider to share the width; double-click it for half and half.
- Zoom: Ctrl+= / Ctrl+-, Ctrl+wheel, Ctrl+0 for 100%. Zoom is for the screen only; exports are not affected.
- Find / replace: Ctrl+F.
- The contents and the list of figures follow the headings and pictures on their own.

### Structure and figures

- The **Structure** tab shows the cover, contents, list of figures and the body's heading tree. Click an entry to select its line in the editor or to scroll the preview there.
- The **Figures** tab shows every picture. − / + sets its size to 10–100% of the page width; it is written into the Markdown as `"w=60%"` and reaches the preview and the exports.

### Document properties (right panel)

- **Document**: the export file name, the saved file, the length.
- **Cover**: cover on/off, cover title (empty: the document's first heading), version, author, date (empty: today), title alignment.
- **Pages**: contents, list of figures, page numbers and their position, header, footer.
- **Export font**: a font of this computer, body size, line spacing — used by the preview and every export.
- **Merging**: numbering, sub-folders, file name headings.

### Saving and exporting

- **Save** (Ctrl+S): saves the document as Markdown (.md). Only the first save asks where; later saves write the same file. **Save as** is Ctrl+Shift+S.
- **Open document** (Ctrl+O): opens a saved .md document as it is (no merging) to keep editing it.
- **Export** (Ctrl+E): Markdown, HTML, PDF, Word (.doc). PDF and printing lay the document out in A4 pages, put the real page numbers into the contents and the list of figures, and print the header, footer and page numbers. HTML and Word get the computed page numbers too. After exporting, open the file or its folder at once.
- **Print** (Ctrl+P): opens the print window (see "The print window" below).
- In a web browser saving and exporting are downloads; make a PDF with "Save as PDF" in the print dialog.


### Pictures

- In the editor pictures show **as pictures** and move like one character (the caret steps over them, Backspace deletes them whole). The picture button of the formatting bar or View › Show › "Show pictures in the editor" shows their Markdown text instead.
- Drag the handle at a picture's bottom-right corner to resize it (10–100% of the page width, 5% steps). The size is written as `"w=60%"` and used by the preview and every export.
- **Drop** picture files from the file manager onto the editor: they go where they were dropped. Dropped elsewhere on the window, they go to the caret.
- Right-click a picture (editor or preview) for sizes 25/50/75/100%, original size, edit caption, replace with another picture, save picture as file, copy Markdown and delete.

### Each chapter on a new page, heading sizes

- With **Each chapter on a new page** on (toolbar), every top-level heading starts a new page (PDF, print, Word). The preview marks the page breaks with a dashed line.
- In the right panel › Export font, **Size of** picks the body, chapter (heading 1), section (heading 2), subsection (heading 3), heading 4 or heading 5, and the stepper sets its size. Clicking a heading in the preview or the structure tab picks its level. ↻ goes back to the automatic size (follows the body size).

### Logo

- Choose a picture such as PNG, GIF, JPG, WEBP or AVIF in the right panel's **Logo** section or in Settings › Logo (1.5 MB at most).
- In the header or footer it goes on every page, left, centre or right, at the height you set (mm), beside the header text of the same place.
- On the cover it goes at the top, the centre (just above the title) or the bottom, with a height of its own.

### Contents

Contents and list-of-figures entries are joined to their page numbers by dots centred on the line (·····) (Settings › Cover & contents › Dotted leaders). Page numbers come from laying the document out in A4 pages; the preview shows them a moment later too.

### The print window

Print (Ctrl+P) opens the program's print window. Choose the printer, copies, colour or black & white, paper (A4, A3, A5, B5, Letter, Legal), orientation, margins, the pages to print (all / a range such as 1-3, 5) and the document parts (cover, contents, list of figures, page numbers, header, footer) on the left; the preview on the right is laid out again at once. **Print** sends it straight to the chosen printer, with no dialog. Printers that make a file, such as "Microsoft Print to PDF", ask where to save the PDF. **Save as PDF** and **System dialog…** are there too.

### Pictures in a Markdown export

Exporting a document with pictures to Markdown asks whether to put the pictures **inside the file** (Base64) or **save them as separate files**. Separate files go into a `<file name>_images` folder beside the .md, which links to them. The choice becomes the default next time.

### Undo

Ctrl+Z / Ctrl+Y undo and redo typing and also adding, removing, reordering and ticking files, renumbering, merging again and picture sizes. Quick typing is one step.

### Problems · messages · information

The **Problems** tab of the bottom panel lists skipped heading levels, empty headings, repeated headings, pictures not found, links without an address, unclosed code blocks, empty files and files without a heading. Click one to go to its line. **Messages** keeps the notices and errors so far, **Information** sums the document up.

### Appearance

- Themes: 20 dark, 20 light, one that follows the system and one of your own. The palette button picks one at random; ▾ lists them all.
- Every icon has a colour of its own by meaning.
- Settings › Font sets the program font, size and weight and the editor text size.
- The window's place and size and the panel widths are kept for the next start.

### Shortcuts

| Keys | Action |
| --- | --- |
| Ctrl+N / Ctrl+O | New document / open document |
| Ctrl+Shift+O / Ctrl+Shift+A | Add folder / add files |
| Ctrl+S / Ctrl+Shift+S | Save / save as |
| Ctrl+E / Ctrl+P | Export / print |
| Ctrl+Z / Ctrl+Y | Undo / redo |
| Ctrl+F | Find / replace |
| Ctrl+B / Ctrl+I / Ctrl+K | Bold / italic / link |
| Ctrl+1 … Ctrl+5 | Headings 1–5 (while editing) |
| Alt+1 / Alt+2 / Alt+3 | Edit / preview / side by side |
| F5 / F7 | Merge again / renumber headings |
| Ctrl+Shift+1 / 2, Ctrl+J | Left / right / bottom panel |
| Ctrl+Shift+L | Switch language |
| Ctrl+Shift+H | Start page |
| Ctrl+, / F1 / F11 | Settings / about / tutorial |
