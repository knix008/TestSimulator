# ZipMaster 사용자 가이드 · User's Guide

> 한국어 안내가 먼저 나오고, English follows below.

---

## 한국어

### 1. ZipMaster 란?
ZipMaster 는 ZIP, 7z, TAR, GZ, BZ2, RAR 등 다양한 압축 파일을 만들고 푸는 프로그램입니다.
**웹 브라우저**와 **Windows · macOS · Linux 데스크톱 앱**에서 동일하게 사용할 수 있습니다.

### 2. 실행 방법
- **웹**: 배포된 주소를 브라우저로 열면 설치 없이 바로 사용합니다.
- **데스크톱**: 설치 관리자로 설치한 뒤 실행합니다.
  - Windows 설치 중 **바탕화면 / 시작 메뉴 바로 가기**를 만들지 선택할 수 있습니다.

### 3. 화면 구성
- **맨 위 타이틀바**: 왼쪽에 앱 이름, 오른쪽에 정보(ℹ) 버튼과 창 버튼(최소화 — / 최대화 ▢ / 닫기 ✕).
  정보 버튼은 항상 창 버튼의 왼쪽에 있습니다.
- **툴바**: 파일 압축 · 폴더 압축 · 압축 해제 · 내용 미리보기 · 테마 · 언어 버튼. 각 버튼에 마우스를 올리면 설명(툴팁)이 나옵니다.
- **왼쪽 패널(압축)**: 저장할 포맷과 분할 여부를 설정합니다.
- **오른쪽 패널(압축 해제)**: 덮어쓰기 옵션과 미리보기 결과를 봅니다.
- **맨 아래 상태바**: 진행률과 현재 상태를 표시합니다.

### 4. 압축하기
1. 왼쪽 **압축** 패널에서 **포맷**을 고릅니다. (예: ZIP, 7z, TAR.GZ …)
2. 큰 파일을 여러 조각으로 나누려면 **용량 분할**을 선택하고 **분할당 크기(MB)**를 입력합니다.
   - 결과는 `archive.zip.001`, `.002` … 형식으로 만들어집니다.
3. 툴바의 **[파일 압축]** 또는 **[폴더 압축]** 버튼을 누릅니다.
4. 대상 파일/폴더를 선택하면 압축이 진행되고, 완료되면 알림이 표시됩니다.
   - 웹에서는 결과 파일이 **다운로드**됩니다. (분할 시 조각마다 다운로드)

> 웹 브라우저에서는 **7z · BZ2 생성은 지원되지 않습니다.** (해제는 가능) — 데스크톱 앱을 사용하세요.

### 5. 압축 풀기
1. 툴바의 **[압축 해제]** 버튼을 누릅니다.
2. 풀 아카이브를 선택합니다.
   - 분할 압축이라면 **첫 조각(.001)** 을 선택하면 나머지 조각이 **자동으로 합쳐져** 풀립니다.
   - (웹) 분할 조각은 파일 선택 창에서 **모든 조각을 함께 선택**하세요.
3. (데스크톱) 풀 폴더를 지정하면 해제가 진행됩니다.
   (웹) 폴더 선택을 지원하는 브라우저면 저장 폴더를 고르고, 아니면 파일이 개별 다운로드됩니다.
4. **[내용 미리보기]** 버튼으로 풀기 전에 아카이브 안의 목록을 먼저 확인할 수 있습니다.

### 6. 테마 · 언어
- 툴바의 **테마** 버튼으로 어두운/밝은 화면을 전환합니다.
- 툴바의 **언어** 버튼으로 한국어 ↔ English 를 전환합니다.
- 선택한 테마와 언어는 다음 실행 때도 유지됩니다.

### 7. 오류가 났을 때
심각한 오류가 발생하면 상세 내용이 팝업으로 표시됩니다.
**[내용 복사]** 버튼으로 오류 내용을 복사해 문의 시 첨부할 수 있습니다.

---

## English

### 1. What is ZipMaster?
ZipMaster creates and extracts many archive formats — ZIP, 7z, TAR, GZ, BZ2, RAR — with the same interface in a **web browser** and as a **desktop app on Windows · macOS · Linux**.

### 2. Running it
- **Web**: open the deployed URL in a browser. No installation needed.
- **Desktop**: install with the installer, then launch.
  - On Windows you can choose whether to create **Desktop / Start Menu shortcuts** during installation.

### 3. Layout
- **Title bar**: app name on the left; Info (ℹ) button and window controls (Minimize — / Maximize ▢ / Close ✕) on the right. The Info button is always to the **left** of the window controls.
- **Toolbar**: Compress Files · Compress Folder · Extract · Preview · Theme · Language. Hover any button to see a tooltip.
- **Left panel (Compress)**: choose output format and split options.
- **Right panel (Extract)**: overwrite option and preview results.
- **Status bar**: progress and current status.

### 4. Compressing
1. Pick a **format** in the left panel (ZIP, 7z, TAR.GZ, …).
2. To split a large file into parts, choose **Split into parts** and set **Size per part (MB)**.
   - Output is named `archive.zip.001`, `.002`, …
3. Click **[Compress Files]** or **[Compress Folder]** in the toolbar.
4. Select the target; compression runs and notifies you when done.
   - On the web the result is **downloaded** (one download per part when splitting).

> On the web, **creating 7z / BZ2 is not supported** (extraction is). Use the desktop app.

### 5. Extracting
1. Click **[Extract]** in the toolbar.
2. Select the archive.
   - For split archives, pick the **first part (.001)**; the rest are **merged automatically**.
   - (Web) select **all parts together** in the file dialog.
3. (Desktop) choose the output folder. (Web) choose a folder if your browser supports it, otherwise files download individually.
4. Use **[Preview]** to inspect the archive contents before extracting.

### 6. Theme & Language
- Use the **Theme** button to toggle dark/light.
- Use the **Language** button to switch 한국어 ↔ English.
- Your theme and language are remembered on next launch.

### 7. When an error occurs
Serious errors appear in a popup with full details. Use **[Copy details]** to copy the message for support.
