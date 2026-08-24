# ZipMaster 사용자 가이드 · User's Guide

> 한국어 안내가 먼저 나오고, English follows below.

---

## 한국어

### 1. ZipMaster 란?
ZipMaster 는 ZIP, 7z, TAR, GZ, BZ2, RAR 등 다양한 압축 파일을 만들고 푸는 프로그램입니다.
**웹 브라우저**와 **Windows · macOS · Linux 데스크톱 앱**에서 사용할 수 있으며,
데스크톱 앱에는 **파일 탐색기**가 포함되어 압축/해제뿐 아니라 파일 복사·이동·삭제까지 할 수 있습니다.

### 2. 실행 방법
- **웹**: 배포된 주소를 브라우저로 열면 설치 없이 바로 사용합니다.
- **데스크톱**: 설치 관리자로 설치한 뒤 실행합니다.
  - Windows 설치 중 **바탕화면 / 시작 메뉴 바로 가기**를 만들지 선택할 수 있습니다.

### 3. 화면 구성
- **타이틀바**: 왼쪽에 앱 이름, 오른쪽에 창 버튼(최소화 / 최대화 / 닫기).
- **툴바**: 파일 압축 · 폴더 압축 · 압축 해제 · **설정(⚙)** · 정보(ℹ) · 테마 · 언어 버튼. 버튼에 마우스를 올리면 툴팁이 나옵니다.
- **옵션 바**: 저장할 포맷과 분할 여부를 설정합니다.
- **왼쪽 패널(파일 탐색기)**: 위쪽 경로 드롭다운 + 아래쪽 폴더 트리. (데스크톱 전용)
- **오른쪽 패널**: 선택한 아카이브의 **내용**, 또는 일반 파일의 **정보**를 표시합니다.
- **상태바**: 항상 표시되며 현재 경로·항목 수·선택한 아카이브·진행 상태를 보여줍니다.

### 4. 파일 탐색기 사용하기 (데스크톱)
- **상단 드롭다운**: 현재 경로가 표시되며, 열면 드라이브 루트부터 현재까지의 상위 폴더로 바로 이동할 수 있습니다.
- **하단 트리**: 폴더 앞의 ▶/▼ 를 눌러 하위 내용을 펼치거나 접습니다. 현재 경로까지의 계보는 자동으로 펼쳐집니다.
- **압축 파일(🗜️)** 을 클릭하면 오른쪽에 내부 목록이 표시됩니다.
- **일반 파일**을 클릭하면 오른쪽에 이름·종류·크기·수정한 날짜·경로가 표시됩니다.

#### 우클릭 메뉴
탐색기에서 항목을 마우스 오른쪽 버튼으로 누르면 메뉴가 나옵니다.
- 폴더: **열기 · 압축하기 · 기본 폴더로 설정 · 복사 · 잘라내기 · 붙여넣기 · 삭제**
- 압축 파일: **내용 보기 · 압축 해제 · 압축하기 · 복사 · 잘라내기 · 삭제**
- 일반 파일: **압축하기 · 복사 · 잘라내기 · 삭제**
- 공통: 상위 폴더로 · 새로 고침

#### 파일 조작 · 단축키
- **복사 / 잘라내기 / 붙여넣기 / 삭제**를 우클릭 메뉴로 실행할 수 있습니다.
- 키보드도 지원합니다(트리를 한 번 클릭해 포커스를 준 뒤):
  - **Ctrl+C** 복사 · **Ctrl+X** 잘라내기 · **Ctrl+V** 붙여넣기 · **Delete** 삭제
- 삭제는 **휴지통으로 이동**되므로 실수해도 복구할 수 있습니다.

#### 드래그 & 드롭
- **탐색기 안에서 이동**: 파일/폴더를 다른 폴더 위로 끌어다 놓으면 그 폴더로 이동합니다.
- **외부에서 가져오기**: Windows 탐색기/바탕화면에서 파일을 끌어와 폴더나 현재 위치에 놓으면 복사됩니다.
- **외부로 내보내기**: 항목을 **Alt 키를 누른 채로** 끌어 바탕화면 등으로 내보냅니다.

### 5. 압축하기
1. **옵션 바**에서 **포맷**을 고릅니다. (예: ZIP, 7z, TAR.GZ …)
2. 큰 파일을 나누려면 **용량 분할**을 켜고 **분할당 크기(MB)**를 입력합니다. (결과: `archive.zip.001`, `.002` …)
3. 압축 방법은 두 가지입니다.
   - 툴바의 **[파일 압축] / [폴더 압축]** 버튼 → 대상을 다이얼로그로 선택
   - 탐색기에서 파일/폴더 **우클릭 → 압축하기**
4. 저장할 위치/이름을 지정하면 압축이 진행되고 완료 시 알림이 뜹니다.
   - 웹에서는 결과 파일이 **다운로드**됩니다. (분할 시 조각마다 다운로드)

> 웹 브라우저에서는 **7z · BZ2 생성은 지원되지 않습니다.** (해제는 가능) — 데스크톱 앱을 사용하세요.

### 6. 압축 풀기
1. 아카이브를 선택하는 방법:
   - 탐색기에서 압축 파일을 클릭해 오른쪽에 내용을 띄운 뒤 **[압축 해제]**
   - 또는 압축 파일 **우클릭 → 압축 해제**
   - 툴바 **[압축 해제]** 버튼(다이얼로그로 선택)도 가능합니다.
   - 분할 압축이라면 **첫 조각(.001)** 을 선택하면 나머지가 **자동 병합**되어 풀립니다. (웹은 모든 조각을 함께 선택)
2. 풀 폴더를 지정하면 해제가 진행됩니다.
3. **선택 해제**: 오른쪽 내용 목록에서 **Ctrl+클릭 / Shift+클릭**으로 원하는 파일만 고른 뒤 **[선택 해제]** 버튼을 누르면 그 파일들만 풀립니다.
4. 시간이 오래 걸리는 작업은 **진행률 팝업**으로 상태가 표시됩니다.

### 7. 설정
툴바의 **설정(⚙)** 버튼을 누르면:
- **테마**(어두운/밝은)와 **언어**(한국어/English)를 바꿀 수 있습니다.
- **기본 폴더**를 지정하면 시작할 때 그 폴더가 열립니다. (찾아보기 / 현재 폴더 사용 / 지우기)
- **마지막으로 열었던 폴더 기억**을 켜면, 다음 실행 때 마지막 위치가 자동으로 열립니다.
- 선택한 테마·언어·폴더 설정은 다음 실행에도 유지됩니다.

### 8. 오류가 났을 때
심각한 오류가 발생하면 상세 내용이 팝업으로 표시됩니다.
**[내용 복사]** 버튼으로 오류 내용을 복사해 문의 시 첨부할 수 있습니다.

---

## English

### 1. What is ZipMaster?
ZipMaster creates and extracts many archive formats — ZIP, 7z, TAR, GZ, BZ2, RAR — in a **web browser** and as a **desktop app on Windows · macOS · Linux**. The desktop app also includes a **file explorer** so you can copy, move, and delete files in addition to compressing/extracting.

### 2. Running it
- **Web**: open the deployed URL in a browser. No installation needed.
- **Desktop**: install with the installer, then launch.
  - On Windows you can choose whether to create **Desktop / Start Menu shortcuts** during installation.

### 3. Layout
- **Title bar**: app name on the left; window controls (Minimize / Maximize / Close) on the right.
- **Toolbar**: Compress Files · Compress Folder · Extract · **Settings (⚙)** · About (ℹ) · Theme · Language. Hover a button to see a tooltip.
- **Options bar**: choose output format and split options.
- **Left panel (File explorer)**: a path dropdown on top and a folder tree below. (Desktop only)
- **Right panel**: the **contents** of a selected archive, or the **info** of a selected regular file.
- **Status bar**: always visible; shows the current path, item count, selected archive, and progress.

### 4. Using the file explorer (Desktop)
- **Top dropdown**: shows the current path; open it to jump to any parent folder up to the drive root.
- **Tree**: click ▶/▼ next to a folder to expand/collapse it. The path down to the current folder is expanded automatically.
- Click an **archive (🗜️)** to list its contents on the right.
- Click a **regular file** to see its name, type, size, modified date, and path on the right.

#### Right-click menu
- Folder: **Open · Compress · Set as default folder · Copy · Cut · Paste · Delete**
- Archive: **View contents · Extract · Compress · Copy · Cut · Delete**
- File: **Compress · Copy · Cut · Delete**
- Common: Go to parent folder · Refresh

#### File operations & shortcuts
- Run **Copy / Cut / Paste / Delete** from the right-click menu.
- Keyboard works too (click the tree once to focus it):
  - **Ctrl+C** copy · **Ctrl+X** cut · **Ctrl+V** paste · **Delete** delete
- Delete moves items to the **Recycle Bin**, so mistakes are recoverable.

#### Drag & drop
- **Move inside the explorer**: drag a file/folder onto another folder to move it there.
- **Import from outside**: drag files from Windows Explorer/Desktop onto a folder or the current location to copy them in.
- **Export to outside**: hold **Alt** while dragging an item out to the Desktop, etc.

### 5. Compressing
1. Pick a **format** in the options bar (ZIP, 7z, TAR.GZ, …).
2. To split a large file, enable **Split into parts** and set **Size per part (MB)** (output: `archive.zip.001`, `.002`, …).
3. Two ways to compress:
   - Toolbar **[Compress Files] / [Compress Folder]** → choose the target in a dialog
   - In the explorer, **right-click a file/folder → Compress**
4. Choose where to save; compression runs and notifies you when done.
   - On the web the result is **downloaded** (one download per part when splitting).

> On the web, **creating 7z / BZ2 is not supported** (extraction is). Use the desktop app.

### 6. Extracting
1. Choose an archive:
   - Click an archive in the explorer to show its contents, then **[Extract]**
   - Or **right-click the archive → Extract**
   - Or the toolbar **[Extract]** button (pick via dialog)
   - For split archives, pick the **first part (.001)**; the rest are **merged automatically** (on the web, select all parts together).
2. Choose the output folder; extraction runs.
3. **Selective extraction**: in the contents list, **Ctrl+Click / Shift+Click** to select specific files, then click **[Extract selected]** to extract only those.
4. Long operations show a **progress popup**.

### 7. Settings
Click the toolbar **Settings (⚙)** button to:
- Switch **theme** (dark/light) and **language** (한국어/English).
- Set a **default folder** to open on startup (Browse / Use current folder / Clear).
- Toggle **Remember the last opened folder** so the app reopens your last location.
- Theme, language, and folder settings are remembered on next launch.

### 8. When an error occurs
Serious errors appear in a popup with full details. Use **[Copy details]** to copy the message for support.
