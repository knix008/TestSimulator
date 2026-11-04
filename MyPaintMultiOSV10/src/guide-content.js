/* The text of the user's guide window (guide.html), in Korean and English.
 *
 * Each section has an id (used by ?section=<id> and the remembered last section), an icon
 * name from icons.js, and per language a title and a list of blocks:
 *   "plain text"                      a paragraph
 *   { h: "..." }                      a sub-heading
 *   { list: ["...", ...] }            bullets            { steps: [...] }  numbered steps
 *   { keys: [["Ctrl+S", "..."], ...] } a shortcut table (first column drawn as keys)
 *   { table: { head: [...], rows: [[...], ...] } }
 *   { img: "name", alt: "...", caption: "..." }   doc/images/<name>.png
 *   { tip: "..." } / { note: "..." }  a call-out
 * Inside text: **bold**, `code`, and [[Ctrl+S]] for keys.
 * The pictures are made by scripts/make-guide-images.js; an English variant
 * doc/images/<name>-en.png is used when it exists.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof root !== "undefined") root.MyPaintGuideContent = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const UI = {
    ko: {
      title: "MyPaint 10.0 — 사용 설명서",
      contents: "목차",
      search: "설명서에서 찾기",
      clearSearch: "검색어 지우기",
      fontSmaller: "글자 작게",
      fontLarger: "글자 크게",
      fontReset: "기본 글자 크기",
      fontSize: "글자 크기",
      language: "언어",
      korean: "한국어",
      english: "English",
      minimize: "최소화",
      maximize: "최대화",
      restore: "이전 크기로",
      close: "닫기",
      prev: "이전",
      next: "다음",
      found: "{n}개 항목에서 찾았습니다",
      notFound: "찾는 내용이 없습니다",
      keyHead: "키",
      actionHead: "하는 일",
      noImage: "그림이 아직 없습니다",
      enlarge: "눌러서 크게 보기",
      closeImage: "닫기 (Esc)",
      toc: "목차 보이기/숨기기",
    },
    en: {
      title: "MyPaint 10.0 — User's Guide",
      contents: "Contents",
      search: "Search the guide",
      clearSearch: "Clear the search",
      fontSmaller: "Smaller text",
      fontLarger: "Larger text",
      fontReset: "Default text size",
      fontSize: "Text size",
      language: "Language",
      korean: "한국어",
      english: "English",
      minimize: "Minimize",
      maximize: "Maximize",
      restore: "Restore",
      close: "Close",
      prev: "Previous",
      next: "Next",
      found: "Found in {n} sections",
      notFound: "Nothing matches",
      keyHead: "Keys",
      actionHead: "What it does",
      noImage: "Picture not made yet",
      enlarge: "Click to enlarge",
      closeImage: "Close (Esc)",
      toc: "Show or hide the contents",
    },
  };

  const SECTIONS = [
    {
      id: "overview",
      icon: "help",
      ko: {
        title: "처음 보는 화면",
        blocks: [
          "MyPaint 10.0은 그림을 그리고, 사진과 의료 영상(DICOM)을 열어 보고, 여러 형식으로 내보내는 그림 편집기입니다. 창은 위에서부터 **메뉴**, **도구 모음**, 가운데의 **캔버스**와 양옆의 **패널**, 맨 아래 **상태 표시줄**로 이루어져 있습니다.",
          { img: "main-window", alt: "MyPaint 주 창 전체", caption: "주 창 — 위쪽 도구 모음, 왼쪽 도구 패널, 가운데 캔버스, 오른쪽 속성 패널" },
          { list: [
            "**왼쪽 도구 패널**: 그리기 도구 31가지, 색판 40색, 선 굵기, 도형 목록이 있습니다.",
            "**캔버스**: 그림이 놓이는 곳입니다. 여러 그림은 위쪽 탭으로 함께 엽니다.",
            "**오른쪽 속성 패널**: 고른 도형이나 영역, 열어 둔 사진·SVG·의료 영상의 속성을 보여 주고 고칩니다. 그 아래에 **효과**가 있습니다. 패널 옆의 구분선을 끌면 폭이 바뀝니다.",
            "**상태 표시줄**: 마우스 위치, 그림 크기, 배율, 진행 상황을 알려 줍니다. 오른쪽 아래 모서리를 끌어 창 크기를 바꿉니다.",
          ] },
          { h: "설치" },
          "내려받은 설치 파일을 실행합니다. 설치 화면의 언어는 한국어와 영어 중에서 고릅니다. 이미 MyPaint가 깔려 있으면 먼저 완전히 지운 뒤 다시 깔고, 지난번 설정이나 그림이 남아 있으면 그것까지 지울지 물어봅니다. 설치가 끝나면 `.mypaint` 파일이 MyPaint 문서 아이콘으로 바뀌고, 두 번 누르면 MyPaint가 열립니다.",
          { tip: "이 설명서 창은 따로 떠 있는 창입니다. 위쪽 국기 단추로 언어를, − / + 단추로 글자 크기를 바꾸고, 검색 칸에 낱말을 넣으면 그 낱말이 들어 있는 항목만 남습니다. 그림을 누르면 크게 볼 수 있습니다." },
        ],
      },
      en: {
        title: "A first look",
        blocks: [
          "MyPaint 10.0 draws pictures, opens photographs and medical images (DICOM), and exports them in many formats. From the top, the window holds the **menu**, the **toolbar**, the **canvas** in the middle with a **panel** on each side, and the **status bar** at the bottom.",
          { img: "main-window", alt: "The whole MyPaint main window", caption: "The main window — toolbar on top, tool panel on the left, canvas in the middle, properties on the right" },
          { list: [
            "**Tool panel (left)**: 31 drawing tools, 40 colour swatches, line widths and the shape list.",
            "**Canvas**: where the picture is. Several drawings stay open as tabs above it.",
            "**Properties panel (right)**: shows and edits the selected shape or area, and the details of an open photograph, SVG or medical image. **Effects** sit below them. Drag the separator beside a panel to change its width.",
            "**Status bar**: pointer position, picture size, zoom and progress. Drag the bottom-right corner to resize the window.",
          ] },
          { h: "Installing" },
          "Run the setup file you downloaded. The installer speaks Korean and English; pick one on the first screen. An older MyPaint is removed completely first, and if saved settings or drawings are found the installer asks whether to delete them too. Afterwards `.mypaint` files carry the MyPaint document icon and open in MyPaint.",
          { tip: "This guide is a window of its own. The flag buttons at the top switch the language, − and + change the text size, and a word typed in the search box leaves only the sections that contain it. Click a picture to see it larger." },
        ],
      },
    },
    {
      id: "start",
      icon: "folder",
      ko: {
        title: "시작 화면",
        blocks: [
          "MyPaint를 열면 시작 화면이 나옵니다. 움직이는 3D 배경 위에 카드가 놓여 있어 **시작하기**(새 그림 만들기, 파일 열기), **최근 파일**, 지금 **열린 그림**, 테마와 배경을 한곳에서 고를 수 있습니다. 메뉴 막대 맨 왼쪽의 **시작** 단추를 누르면 열리고, 다시 누르면 닫힙니다. 보기 메뉴에도 같은 명령이 있습니다.",
          { img: "start-screen", alt: "카드가 놓인 시작 화면", caption: "시작 화면 — 3D 배경 위의 카드" },
          { list: [
            "최근 파일을 누르면 그 파일을 엽니다. 오른쪽의 휴지통 단추는 그 항목만 목록에서 지우며, 파일 자체는 지워지지 않습니다.",
            "**테마** 카드에서 밝은 테마 20가지, 어두운 테마 20가지, 사용자 정의 테마를 바로 고릅니다.",
            "**시작화면 배경** 카드에서 배경 20가지와 **섞기**(20초마다 바뀜), 움직임 속도(0–300%), 카드 불투명도(20–100%)를 정합니다. 속도와 불투명도는 막대 하나로 나오고, 현재 값은 막대 가운데에 보입니다.",
            "카드 왼쪽 위의 점 손잡이를 끌면 카드가 옮겨지고, 오른쪽 아래 모서리를 끌면 크기가 바뀝니다. 모서리를 두 번 누르면 내용에 맞춰지고, **자동 정렬**은 기본 배치로 돌려놓습니다. Alt+방향키, Alt+Shift+방향키로도 할 수 있습니다.",
            "같은 설정이 **설정 → 시작 화면** 탭에도 있으며, 프로그램을 열 때 시작 화면을 보일지도 여기서 정합니다.",
          ] },
          { img: "settings-start", alt: "설정 창의 시작 화면 탭", caption: "설정 → 시작 화면 — 3D 배경, 속도, 카드 불투명도, 배치" },
        ],
      },
      en: {
        title: "The start screen",
        blocks: [
          "MyPaint opens on the start screen: cards over a moving 3D background, where you create a new drawing or open a file (**Get Started**), pick from the **recent files** or the **open drawings**, and choose the theme and the background. The **Start** button at the far left of the menu bar opens it, and a second press closes it. The View menu has the same command.",
          { img: "start-screen", alt: "The start screen with its cards", caption: "The start screen — cards over a 3D background" },
          { list: [
            "Click a recent file to open it. The trash button beside it removes just that entry from the list; the file itself is not touched.",
            "The **Theme** card offers twenty light themes, twenty dark themes and your custom one.",
            "The **Start Screen Background** card offers twenty backgrounds, **Shuffle** (a new one every 20 seconds), the animation speed (0–300%) and the card opacity (20–100%). Speed and opacity are one bar each, with the current value in the middle of the bar.",
            "Drag a card by the dots at its top left to move it, and by its bottom right corner to resize it. Double-click the corner to fit the content; **Auto Arrange** restores the default layout. Alt+arrow keys and Alt+Shift+arrow keys do the same.",
            "The same settings are in **Settings → Start screen**, along with whether the start screen appears when MyPaint opens.",
          ] },
          { img: "settings-start", alt: "The Start screen tab of the Settings window", caption: "Settings → Start screen — 3D background, speed, card opacity, layout" },
        ],
      },
    },
    {
      id: "toolbar",
      icon: "wrench",
      ko: {
        title: "도구 모음",
        blocks: [
          "도구 모음의 단추는 하는 일끼리 묶여 있고, 묶음 사이에는 세로 구분선이 있습니다. 단추에 마우스를 올리면 그 자리에서 바로 이름이 나옵니다. 지금 쓸 수 없어 흐리게 보이는 단추도 마찬가지입니다.",
          { img: "toolbar", alt: "구분선으로 묶인 도구 모음 단추", caption: "도구 모음 — 파일, 편집 기록, 클립보드, 보기, 테마와 언어" },
          { table: { head: ["묶음", "단추"], rows: [
            ["파일", "새 그림, 열기, 저장, 내보내기, 인쇄 — 인쇄는 내보내기 오른쪽에 있습니다"],
            ["편집 기록", "실행 취소, 다시 실행"],
            ["클립보드", "잘라내기, 복사, 붙여넣기, 삭제, 자르기, 모두 선택"],
            ["순서", "앞으로, 뒤로"],
            ["보기", "축소, 배율(누르면 100%), 확대, 격자, 눈금자, 도형 목록, 왼쪽·오른쪽 패널 접기"],
            ["글자", "글꼴, 크기 − / 값 / +, 굵게·기울임·밑줄·취소선"],
            ["오른쪽 끝", "테마(색상환 아이콘), 언어(국기), 설정, 정보"],
          ] } },
          "창을 최소 크기까지 줄여도 단추는 잘리거나 서로 겹치지 않습니다. 남는 자리는 그리기 명령과 오른쪽 끝 묶음 사이에 생깁니다.",
        ],
      },
      en: {
        title: "The toolbar",
        blocks: [
          "Toolbar buttons are grouped by what they do, with a thin vertical separator between groups. Point at a button and its name appears at once, also on a button that is greyed out for now.",
          { img: "toolbar", alt: "Toolbar buttons grouped with separators", caption: "The toolbar — file, history, clipboard, view, theme and language" },
          { table: { head: ["Group", "Buttons"], rows: [
            ["File", "New, Open, Save, Export, Print — Print sits to the right of Export"],
            ["History", "Undo, Redo"],
            ["Clipboard", "Cut, Copy, Paste, Delete, Crop, Select all"],
            ["Order", "Bring forward, Send backward"],
            ["View", "Zoom out, zoom level (click for 100%), Zoom in, Grid, Rulers, shape list, fold the left and right panels"],
            ["Text", "Font, size − / value / +, bold, italic, underline, strikethrough"],
            ["Right end", "Theme (colour wheel icon), language (flags), Settings, About"],
          ] } },
          "Shrinking the window to its minimum never cuts off or overlaps the buttons; the spare space sits between the drawing commands and the group at the right end.",
        ],
      },
    },
    {
      id: "files",
      icon: "open",
      ko: {
        title: "파일 열기와 저장",
        blocks: [
          { h: "그림 파일 (.mypaint)" },
          "저장([[Ctrl+S]])은 그림을 `.mypaint` 파일로 남깁니다. 도형 하나하나가 그대로 남아서 다시 열면 계속 고칠 수 있습니다. 예전 판의 `.mpaint` 파일도 그대로 열립니다. 다른 이름으로 저장은 파일 메뉴에 있습니다.",
          { h: "열기" },
          "**파일 → 열기**([[Ctrl+O]]) 하나로 MyPaint가 읽는 모든 파일을 엽니다. 파일 종류는 확장자와 파일 앞부분을 보고 알아서 가리므로, 의료 영상(DICOM)을 위한 메뉴가 따로 없습니다.",
          { list: [
            "그림 파일: `.mypaint`, `.mpaint`",
            "일반 그림: PNG, JPEG, GIF, WebP, BMP, ICO, AVIF",
            "SVG: 오른쪽 패널에서 원본을 고칠 수 있습니다 (SVG 편집 참고)",
            "TIFF: 여러 쪽, 8~16비트, LZW·PackBits·Deflate·JPEG 압축",
            "HEIC/HEIF: 휴대전화 사진. 그림이 여러 장이면 대표 그림이 먼저 열리고 나머지는 `<` `>` 로 넘깁니다",
            "JPEG 2000: `.jp2`, `.j2k`",
            "카메라 RAW: `.cr2` `.cr3` `.nef` `.arw` `.raf` `.orf` `.rw2` `.dng` 등 서른 가지가 넘습니다. 파일 안의 원본 크기 사진을 보여 주고 카메라·렌즈 정보를 오른쪽 패널에 적습니다",
            "DICOM 의료 영상: `.dcm`, `.dicom`, 확장자가 없는 DICOM 파일",
          ] },
          "파일 메뉴의 **링크에서 이미지 받기**는 주소의 그림을 내려받아 엽니다. 받는 동안 진행률이 나오고 취소할 수 있습니다. 읽고 쓸 수 있는 형식 전체는 **도움말 → 지원 형식**에서 봅니다.",
          { h: "끌어다 놓기" },
          "탐색기에서 그림 파일을 창 위로 끌어다 놓으면 항상 어떻게 쓸지 먼저 묻습니다.",
          { list: [
            "**새 그림으로 열기**: 새 탭으로 엽니다.",
            "**현재 편집 중인 그림에 넣기**: 지금 그림 안에 그림 도형으로 들어갑니다. 캔버스 위에 놓았다면 이 항목이 미리 골라져 있고, 놓은 자리에 들어갑니다. 캔버스보다 크면 캔버스에 맞게 줄어듭니다.",
            "**창 바탕 그림으로 쓰기**: 작업 공간의 바탕으로 씁니다.",
          ] },
          "넣은 그림은 선택된 상태가 되어 바로 옮기거나 크기를 바꿀 수 있습니다. 여러 파일을 한꺼번에 놓으면 한 번만 묻고 모두 같은 방식으로 처리하며, 넣을 때는 조금씩 어긋나게 놓습니다.",
          { h: "최근 파일" },
          "최근에 연 파일은 10개까지 남습니다. 파일 메뉴와 시작 화면에서 바로 열고, 항목마다 있는 × 단추로 하나씩, **모두 지우기**로 한꺼번에 목록에서 지웁니다. 연 폴더와 저장한 폴더는 다음 실행 때 다시 씁니다.",
          { tip: "저장하지 않은 그림이 있는 탭이나 창을 닫으면 저장할지 먼저 묻습니다." },
        ],
      },
      en: {
        title: "Opening and saving files",
        blocks: [
          { h: "Drawing files (.mypaint)" },
          "Save ([[Ctrl+S]]) writes the drawing as a `.mypaint` file. Every shape is kept as a shape, so the drawing can be edited further after opening it again. Older `.mpaint` files still open. Save As is in the File menu.",
          { h: "Opening" },
          "**File → Open** ([[Ctrl+O]]) opens everything MyPaint can read. The kind of file is told from its extension and its first bytes, so there is no separate menu item for medical images (DICOM).",
          { list: [
            "Drawings: `.mypaint`, `.mpaint`",
            "Common images: PNG, JPEG, GIF, WebP, BMP, ICO, AVIF",
            "SVG: the source can be edited in the right panel (see Editing SVG)",
            "TIFF: every page, 8–16 bit, LZW / PackBits / Deflate / JPEG",
            "HEIC/HEIF from phones. A file holding several pictures opens at its primary image; `<` and `>` reach the rest",
            "JPEG 2000: `.jp2`, `.j2k`",
            "Camera RAW: `.cr2` `.cr3` `.nef` `.arw` `.raf` `.orf` `.rw2` `.dng` and more than thirty others. The full-size picture stored in the file is shown, with the camera and lens in the right panel",
            "DICOM medical images: `.dcm`, `.dicom`, and DICOM files without an extension",
          ] },
          "**Download a picture from a link** in the File menu fetches an address and opens it, with a progress bar and a cancel button. **Help → Supported formats** lists everything MyPaint reads and writes.",
          { h: "Dropping files" },
          "Drop a picture from outside the program onto the window and MyPaint always asks first how to use it.",
          { list: [
            "**Open it as a new drawing**: opens it in a new tab.",
            "**Put it into the picture being edited**: it goes into the current picture as an image shape. Dropped on the canvas, this choice is already marked and the picture lands where you dropped it. One larger than the canvas is shrunk to fit.",
            "**Use it as the window background**: makes it the background of the workspace.",
          ] },
          "A picture put in stays selected, ready to move or resize. Dropping several files at once asks once and treats them all alike; put into the picture, each lands slightly offset from the one before.",
          { h: "Recent files" },
          "The ten most recent files are kept. Open them from the File menu or the start screen; remove one with the × beside it or all of them with **Clear all**. The folders you opened from and saved into come back on the next run.",
          { tip: "Closing a tab or the window with unsaved work asks first whether to save it." },
        ],
      },
    },
    {
      id: "export",
      icon: "download",
      ko: {
        title: "내보내기 (다른 형식으로 저장)",
        blocks: [
          "도구 모음의 **내보내기** 단추(또는 파일 메뉴)는 지금 보고 있는 그림을 다른 형식의 파일로 만듭니다. 그림이든 사진이든 의료 영상이든 화면에 보이는 그대로 변환됩니다.",
          { img: "export-dialog", alt: "형식과 품질, 테두리와 그림자를 정하는 내보내기 창", caption: "내보내기 창 — 형식과 품질, 상하좌우 테두리, 그림자" },
          "**테두리**는 위·아래·왼쪽·오른쪽 두께와 색을 따로 정합니다. **그림자**는 켜고 끌 수 있고 가로·세로 위치, 번짐, 진하기, 색, 바탕색을 정합니다. 바탕을 투명하게 하면 투명을 지원하는 형식(PNG 등)에서 그림자 바깥이 비치고, 지원하지 않는 형식(JPEG 등)에는 바탕색이 칠해집니다. 저장한 그림은 테두리와 그림자만큼 커집니다.",
          "여기의 테두리와 그림자는 **그림 전체**의 값으로, 아무것도 고르지 않았을 때 오른쪽 패널 **효과**에 보이는 값과 같습니다. 그림 형식과 SVG, 인쇄에 모두 들어갑니다. 도형이나 일부 영역에 주는 효과는 **효과** 항목을 보십시오.",
          { table: { head: ["형식", "확장자", "품질"], rows: [
            ["PNG", ".png", "무손실"],
            ["JPEG", ".jpg", "1–100%"],
            ["WebP", ".webp", "1–100%"],
            ["AVIF", ".avif", "1–100% (브라우저가 지원할 때)"],
            ["BMP", ".bmp", "무손실"],
            ["TIFF", ".tif", "무손실"],
            ["GIF", ".gif", "256색"],
            ["ICO", ".ico", "아이콘 크기 여러 개"],
            ["JPEG 2000", ".jp2 / .j2k", "1–100%"],
            ["DICOM", ".dcm", "무손실"],
            ["TGA", ".tga", "무손실"],
            ["PPM / PAM", ".ppm / .pam", "무손실"],
            ["QOI", ".qoi", "무손실"],
            ["PCX", ".pcx", "무손실"],
            ["SVG", ".svg", "도형은 벡터로, 사진은 그림으로 들어갑니다"],
          ] } },
          "품질 칸은 JPEG, WebP, AVIF, JPEG 2000처럼 손실 압축을 쓰는 형식을 골랐을 때만 나오고 %로 표시됩니다. 값이 클수록 원본에 가깝고 파일이 커집니다. 파일 메뉴의 **PNG로 바로 내보내기**는 묻지 않고 PNG를 만듭니다.",
          { note: "HEIC/HEIF로는 내보낼 수 없습니다. HEVC 코덱에 특허가 걸려 있어 쓸 수 있는 인코더가 없습니다. 읽기는 됩니다." },
        ],
      },
      en: {
        title: "Exporting to other formats",
        blocks: [
          "The **Export** button on the toolbar (also in the File menu) writes whatever is on screen — a drawing, a photograph or a medical image — to a file in another format.",
          { img: "export-dialog", alt: "The export window with format, quality, border and shadow", caption: "The export window — format and quality, a border per side, a shadow" },
          "The **border** takes its own width at the top, bottom, left and right, and a colour. The **shadow** turns on and off and takes a position across and down, softness, strength, colour and backdrop. With a clear backdrop, formats that can (PNG and others) show through outside the shadow; formats that cannot (JPEG and others) get the backdrop colour. The saved picture grows by the border and the shadow.",
          "The border and shadow here belong to the **whole picture**: they are the values **Effects** in the right panel shows when nothing is selected. They go into picture formats, SVG and printing alike. For effects on one shape or on part of the picture, see **Effects**.",
          { table: { head: ["Format", "Extension", "Quality"], rows: [
            ["PNG", ".png", "lossless"],
            ["JPEG", ".jpg", "1–100%"],
            ["WebP", ".webp", "1–100%"],
            ["AVIF", ".avif", "1–100% (where the browser engine can write it)"],
            ["BMP", ".bmp", "lossless"],
            ["TIFF", ".tif", "lossless"],
            ["GIF", ".gif", "256 colours"],
            ["ICO", ".ico", "several icon sizes"],
            ["JPEG 2000", ".jp2 / .j2k", "1–100%"],
            ["DICOM", ".dcm", "lossless"],
            ["TGA", ".tga", "lossless"],
            ["PPM / PAM", ".ppm / .pam", "lossless"],
            ["QOI", ".qoi", "lossless"],
            ["PCX", ".pcx", "lossless"],
            ["SVG", ".svg", "shapes stay vectors, photographs go in as images"],
          ] } },
          "The quality field appears only for lossy formats — JPEG, WebP, AVIF and JPEG 2000 — and is shown in per cent. Higher keeps more detail and makes a larger file. **Export straight to PNG** in the File menu writes a PNG without asking.",
          { note: "There is no HEIC/HEIF export: HEVC is patent-encumbered and no encoder is available. Reading HEIC works." },
        ],
      },
    },
    {
      id: "drawing",
      icon: "pencil",
      ko: {
        title: "그리기 도구",
        blocks: [
          "도구는 왼쪽 패널 위쪽에 여섯 칸씩 놓여 있습니다. 도구를 고른 뒤 캔버스에서 끌면 그려집니다.",
          { img: "tool-panel", alt: "도구, 색판, 선 굵기가 있는 왼쪽 패널", caption: "왼쪽 도구 패널 — 도구, 색, 선 굵기, 도형 목록" },
          { table: { head: ["도구", "쓰는 법"], rows: [
            ["연필 · 붓 · 마커 · 스프레이", "끄는 대로 자유롭게 그립니다"],
            ["자유 곡선", "끄는 대로 그린 선을 매끄러운 곡선으로 다듬어 남깁니다. 끝난 뒤에도 하나의 도형으로 옮기고 고칠 수 있습니다"],
            ["지우개", "끄는 자리를 지웁니다. 크기는 선 굵기 단추로 정합니다"],
            ["직선 · 화살표 · 곡선", "시작점에서 끝점까지 끌어서 그립니다"],
            ["사각형 · 둥근 사각형 · 타원 · 삼각형", "끈 크기대로 도형이 생깁니다"],
            ["마름모 · 직각삼각형 · 오각형 · 육각형 · 별 · 하트 · 굵은 화살표 · 십자 · 말풍선 · 구름", "끈 크기대로 도형이 생깁니다. 이 열 가지는 왼쪽 패널에만 있고 그리기 메뉴에는 없습니다"],
            ["글자", "누른 자리에 글자를 입력합니다 (글자 항목 참고)"],
            ["색 채우기", "누른 도형이나 닫힌 영역, 바탕을 채움 색으로 칠합니다"],
            ["색 고르기", "누른 자리의 색을 선 색으로 가져옵니다"],
            ["선택 · 사각형/타원/자유 선택 · 픽셀 선택", "도형이나 그림의 일부를 고릅니다 (고르기와 영역 참고)"],
          ] } },
          { h: "색과 굵기" },
          "색판에는 기본 색 20가지와 파스텔 색 20가지가 있습니다. 색을 누르면 선 색이 됩니다. 선 색·채움 색 칸을 누르면 색 고르기 창이 열리고, 창 바깥을 누르면 고른 색이 남은 채로 닫힙니다. 선 굵기는 그림 단추로 고르거나 −, 값, + 로 한 단계씩 바꾸고, px 숫자를 직접 넣어도 됩니다.",
          "그리기 도구를 들고 있을 때 고른 색과 굵기는 **다음에 그릴 도형**에 쓰입니다. 이미 그린 도형을 바꾸려면 선택 도구로 고른 뒤 바꿉니다.",
          { img: "drawing-shapes", alt: "여러 도형을 그린 캔버스", caption: "도형, 화살표, 자유 곡선, 글자를 그린 예" },
        ],
      },
      en: {
        title: "Drawing tools",
        blocks: [
          "The tools are at the top of the left panel, six to a row. Pick one and drag on the canvas.",
          { img: "tool-panel", alt: "The left panel with tools, swatches and line widths", caption: "The tool panel — tools, colours, line widths and the shape list" },
          { table: { head: ["Tool", "How it works"], rows: [
            ["Pencil · Brush · Marker · Spray", "draw freely while you drag"],
            ["Free curve", "smooths what you drag into a flowing curve, kept as one shape you can move and edit later"],
            ["Eraser", "erases where you drag; its size comes from the line width controls"],
            ["Line · Arrow · Curve", "drag from the start point to the end point"],
            ["Rectangle · Rounded rectangle · Ellipse · Triangle", "take their size from the drag"],
            ["Diamond · Right triangle · Pentagon · Hexagon · Star · Heart · Block arrow · Cross · Speech bubble · Cloud", "take their size from the drag; these ten are in the left panel only, not in the Draw menu"],
            ["Text", "type where you click (see Text)"],
            ["Fill", "paints the clicked shape, closed area or the canvas with the fill colour"],
            ["Pick colour", "takes the colour under the pointer as the line colour"],
            ["Select · Rectangle, ellipse and free select · Pixel select", "pick shapes or part of the picture (see Selecting shapes and areas)"],
          ] } },
          { h: "Colour and width" },
          "The swatches hold twenty basic colours and twenty pastels. Click one to make it the line colour. Clicking the line or fill colour opens a colour picker; clicking anywhere outside it closes it and keeps the colour. Choose a line width from the pictures, step it with −, the value and +, or type a number of pixels.",
          "With a drawing tool in hand, the colour and width you choose are for **the next shape you draw**. To change a shape already drawn, select it with the Select tool first.",
          { img: "drawing-shapes", alt: "A canvas with several shapes drawn on it", caption: "Shapes, an arrow, a free curve and text" },
        ],
      },
    },
    {
      id: "text",
      icon: "text",
      ko: {
        title: "글자",
        blocks: [
          "글자 도구로 캔버스를 누르면 그 자리에 입력 칸이 생깁니다. 입력을 마치려면 칸 바깥을 누르거나 Esc를 누릅니다. 다 쓴 글자는 오른쪽 패널에서도 고칩니다.",
          { list: [
            "글꼴과 크기는 도구 모음에서 고르거나 −, 값, + 로 바꿉니다. **B · I · U · S** 는 굵게, 기울임, 밑줄, 취소선입니다.",
            "입력하는 도중에 글꼴, 크기, 굵게, 기울임, 밑줄, 취소선을 바꾸면 **커서 자리부터 그 뒤로 입력하는 글자**에 적용됩니다. 앞에 쓴 글자는 그대로입니다.",
            "글자 몇 개를 끌어서 고른 뒤 바꾸면 **고른 글자에만** 적용됩니다.",
            "선택 도구로 **글자 도형 전체**를 고른 뒤 B·I·U·S를 누르면 그 스타일 하나만 글자 전체에 켜지거나 꺼지고, 다른 스타일은 그대로입니다. 단추는 글자 전체에 그 스타일이 있을 때만 켜져 보입니다. 글꼴, 크기, 색도 글자 전체에 적용됩니다.",
            "글자에 준 스타일은 그 글자에만 적용되며, 다음에 쓸 글자의 기본값을 바꾸지 않습니다. 기본값은 **설정 → 글꼴**에서 정합니다.",
            "선택 도구로 끌어서 옮기고, 손잡이를 끌면 글꼴 크기가 함께 바뀝니다.",
            "글자를 오른쪽 클릭한 메뉴에서도 글꼴과 크기를 바꿉니다.",
          ] },
          "글꼴 목록에는 컴퓨터에 깔린 글꼴이 모두 나옵니다.",
        ],
      },
      en: {
        title: "Text",
        blocks: [
          "Click the canvas with the text tool and a text box opens there. Click outside it or press Esc to finish. Finished text can also be edited in the right panel.",
          { list: [
            "Pick the font and size on the toolbar or step the size with −, the value and +. **B · I · U · S** are bold, italic, underline and strikethrough.",
            "Changing the font, size, bold, italic, underline or strikethrough while typing applies **from the caret onward** — to what you type next. Text already written keeps its look.",
            "Drag over some characters first and the change applies **to the selected characters only**.",
            "Select the **whole text shape** with the Select tool and B, I, U or S turns that one style on or off for all of it, leaving the others as they are. A button shows lit only when all of the text has that style. The font, size and colour apply to all of it too.",
            "A style given to text stays with that text and does not change the default for the next one. Set the default in **Settings → Font**.",
            "Drag text with the Select tool to move it; dragging a handle changes the font size with it.",
            "Right-click the text for a menu with the font and size as well.",
          ] },
          "The font list shows every font installed on the computer.",
        ],
      },
    },
    {
      id: "select",
      icon: "marquee",
      ko: {
        title: "고르기와 영역",
        blocks: [
          "**선택** 도구로 도형을 누르면 그 도형이 골라지고, 오른쪽 패널에 색, 굵기, 투명도, 위치, 크기가 나옵니다. Delete 키로 지웁니다. [[Ctrl+A]]는 모두 고릅니다. 앞으로/뒤로 단추로 도형의 쌓인 순서를 바꿉니다. 도구의 **선택** 단추를 다시 누르면 고른 도형과 영역이 모두 풀립니다.",
          { h: "옮기기와 크기 바꾸기" },
          "도형이나 글자를 하나 고르면 네 모서리와 네 변에 손잡이가 나타납니다. 손잡이를 끌면 크기가 바뀌고, 안쪽을 끌면 옮겨집니다. 글자는 크기를 바꾸면 글꼴 크기가 함께 바뀝니다. 오른쪽 패널의 **너비**와 **높이**에 숫자를 넣어도 됩니다.",
          { img: "selection-handles", alt: "손잡이가 나타난 고른 도형", caption: "고른 도형 — 모서리와 변의 손잡이로 크기를 바꿉니다" },
          { h: "여러 개 고르기" },
          { list: [
            "빈 곳에서 끌어 상자를 그리면 상자 안에 **완전히 들어온** 도형만 골라집니다. 걸치기만 한 도형은 빠집니다.",
            "[[Shift]] 또는 [[Ctrl]]을 누른 채 누르면 하나씩 더하거나 뺍니다. 도형 목록에서도 같습니다.",
            "묶음 상자 안을 끌면 모두 함께 옮겨집니다. 끌지 않고 그냥 누르면 그 하나만 남고, 빈 곳을 누르면 선택이 풀립니다.",
          ] },
          { h: "고른 도형의 색과 굵기" },
          "선택 도구로 고른 도형과 글자는 색판, 선 색·채움 색 칸, 채움 없음, 오른쪽 패널의 색을 바꾸면 바로 그 색으로 바뀝니다. 왼쪽의 선 굵기도 고른 도형의 굵기를 보여 주고 바꿉니다. 글자를 입력하는 중이면 색은 커서 자리나 고른 글자에 적용됩니다. **색과 선 굵기** 창은 다음에 그릴 도형의 값만 정합니다.",
          { img: "properties-panel", alt: "고른 도형의 속성을 보여 주는 오른쪽 패널", caption: "오른쪽 속성 패널 — 고른 도형의 색, 굵기, 투명도, 위치" },
          { h: "영역 고르기" },
          "사각형 선택, 타원 선택, 자유 선택, 픽셀 선택 도구는 그림의 일부를 고릅니다. 고른 영역은 점선으로 표시되고 오른쪽 패널에 종류와 크기가 나옵니다.",
          { list: [
            "**선택 영역만 남기기**: 고른 부분만 남기고 잘라냅니다. 타원이나 자유 영역이면 바깥은 투명해집니다.",
            "**선택 영역 지우기**: 고른 부분을 바탕색으로 칠합니다.",
            "[[Ctrl+C]] 복사, [[Ctrl+X]] 잘라내기, [[Ctrl+V]] 붙여넣기.",
          ] },
          { h: "픽셀 바꾸기" },
          "**픽셀 선택** 도구는 누르면 정확히 한 픽셀을, 끌면 닿은 픽셀 전부를 고릅니다. 도형을 고르지 않은 채 색판에서 색을 누르거나 오른쪽 패널의 **픽셀 색**을 고르면 그 픽셀만 그 색으로 바뀝니다. 사각형·타원·자유 선택으로 고른 영역도 같습니다. 바뀐 픽셀은 도형 위의 별도 층에 있어 아래 도형은 그대로이며, 실행 취소할 수 있고 저장한 그림에 들어갑니다.",
          { h: "도형 목록" },
          "왼쪽 패널의 도형 목록에서도 도형을 고르고 지울 수 있습니다. 목록에서 고르면 선택 도구로 바뀝니다. 도구 모음의 도형 목록 단추로 목록을 숨겨도 캔버스의 도형은 그대로입니다.",
        ],
      },
      en: {
        title: "Selecting shapes and areas",
        blocks: [
          "With the **Select** tool, click a shape to select it; the right panel shows its colour, width, opacity, position and size. Press Delete to remove it. [[Ctrl+A]] selects everything; the forward and backward buttons change the stacking order. Pressing the **Select** tool button again clears both the selected shapes and any picked area.",
          { h: "Moving and resizing" },
          "Select one shape or text and handles appear at its four corners and four sides. Drag a handle to resize it, and drag inside it to move it. Resizing text changes its font size with it. The **Width** and **Height** fields in the right panel take numbers too.",
          { img: "selection-handles", alt: "A selected shape with its handles", caption: "A selected shape — the handles at the corners and sides resize it" },
          { h: "Selecting several" },
          { list: [
            "Drag a box from an empty spot: only the shapes **wholly inside** it are selected. One the box merely crosses stays out.",
            "Hold [[Shift]] or [[Ctrl]] and click to add or remove one at a time. The shape list works the same way.",
            "Drag inside the group's box to move them all. A click without dragging keeps only the one under the pointer, and a click on an empty spot clears the selection.",
          ] },
          { h: "Colour and width of the selection" },
          "Selected shapes and text take a new colour at once from the swatches, the line and fill colours, no fill, and the colours in the right panel. The line width controls on the left show and change the width of the selection too. While typing, a colour applies at the caret or to the selected characters. The **Color and line width** window only sets the values for the next shape.",
          { img: "properties-panel", alt: "The right panel showing a selected shape", caption: "The properties panel — colour, width, opacity and position of the selected shape" },
          { h: "Picking an area" },
          "The rectangle, ellipse, free and pixel select tools pick part of the picture. The area is outlined with a dashed line, and the right panel names its shape and size.",
          { list: [
            "**Keep only the picked area** cuts everything else away; outside an ellipse or free outline becomes transparent.",
            "**Erase the picked area** paints it with the canvas colour.",
            "[[Ctrl+C]] copies, [[Ctrl+X]] cuts, [[Ctrl+V]] pastes.",
          ] },
          { h: "Changing pixels" },
          "**Pixel select** picks exactly one pixel with a click, and every pixel it touches with a drag. With no shape selected, click a swatch or set **Pixel color** in the right panel and only those pixels take that colour. An area picked with the rectangle, ellipse or free select tool behaves the same way. The changed pixels live on a layer of their own above the shapes, so the shapes underneath are untouched; the change can be undone and is kept when you save.",
          { h: "The shape list" },
          "Shapes can also be selected and removed from the shape list in the left panel; picking one there switches to the Select tool. Hiding the list with its toolbar button leaves the shapes on the canvas.",
        ],
      },
    },
    {
      id: "lines",
      icon: "line",
      ko: {
        title: "선 모양과 화살표",
        blocks: [
          "선이나 도형을 선택 도구로 고르면 오른쪽 패널 **속성**에 고를 수 있는 모양이 단추로 나옵니다. 고르면 바로 바뀌고, 저장한 파일과 SVG에도 그대로 들어갑니다.",
          { img: "line-looks", alt: "화살표의 모양 단추가 있는 오른쪽 패널", caption: "화살표를 고른 오른쪽 패널 — 시작 모양, 끝 표시, 머리 크기, 선 종류" },
          { table: { head: ["항목", "대상", "고를 수 있는 것"], rows: [
            ["모서리", "직선, 곡선, 자유 곡선, 연필, 붓", "둥글게, 각지게, 각지게(끝을 늘림) — 선의 끝과 꺾이는 곳이 함께 바뀝니다"],
            ["모서리", "닫힌 도형 (타원 제외)", "둥글게, 뾰족하게, 깎기"],
            ["선 종류", "선과 닫힌 도형", "실선, 파선, 점선, 일점쇄선"],
            ["시작 모양 · 끝 표시", "화살표", "없음, 삼각형, 열린 화살표, 마름모, 원, 막대"],
            ["머리 크기", "화살표", "50–300%"],
          ] } },
        ],
      },
      en: {
        title: "Line looks and arrows",
        blocks: [
          "Select a line or a shape with the Select tool and **Properties** in the right panel offers its looks as buttons. A choice applies at once and is kept in the saved file and in SVG.",
          { img: "line-looks", alt: "The right panel with the look buttons of an arrow", caption: "The right panel with an arrow selected — start, end, head size and line style" },
          { table: { head: ["Item", "For", "Choices"], rows: [
            ["Corners", "line, curve, free curve, pencil, brush", "Round, Angular, Angular with ends extended — the ends and the bends of the line change together"],
            ["Corners", "closed shapes except the ellipse", "Round, Sharp, Bevel"],
            ["Line style", "lines and closed shapes", "Solid, Dashed, Dotted, Dash-dot"],
            ["Start · End", "arrow", "None, Triangle, Open arrow, Diamond, Circle, Bar"],
            ["Head size", "arrow", "50–300%"],
          ] } },
        ],
      },
    },
    {
      id: "effects",
      icon: "effects",
      ko: {
        title: "효과",
        blocks: [
          "오른쪽 패널의 **속성** 아래에 **효과**가 있습니다. 어디에 적용되는지는 고른 것에 따라 정해지고, 칸 맨 위에 표시됩니다.",
          { table: { head: ["고른 것", "적용되는 곳"], rows: [
            ["도형이나 글자", "고른 도형과 글자에만"],
            ["영역 (사각형·타원·자유·픽셀 선택)", "그 영역의 픽셀에만 — 그 부분을 떼어 낸 조각에 적용합니다"],
            ["아무것도 고르지 않음", "그림 전체"],
          ] } },
          { img: "effects-panel", alt: "효과 칸이 보이는 오른쪽 패널", caption: "효과 — 적용 범위, 초기화, 효과 8가지, 밝기·대비·채도·흐림, 색 선택 원" },
          { list: [
            "**효과 8가지**: 원본, 흑백, 세피아, 반전, 따뜻함, 차갑게, 선명함, 빛바랜",
            "**조정**: 밝기, 대비, 채도, 흐림",
            "**테두리**: 위·아래·왼쪽·오른쪽 두께와 색",
            "**그림자**: 그림자 넣기, 가로, 세로, 번짐, 진하기, 색, 바탕색, 바탕 투명",
            "**색 선택**: 둥근 색 선택 원에서 테두리·그림자·바탕색 중 하나를 골라 끌어서 정하고, 옆의 명도로 밝기를 맞춥니다.",
          ] },
          { h: "효과 초기화" },
          "**효과 초기화** 단추는 고른 부분의 효과만 지웁니다. 도형을 골랐다면 그 도형만, 영역을 골랐다면 그 영역에 닿는 도형과 효과로 떼어 낸 조각만, 아무것도 고르지 않았다면 그림 전체의 효과만 지웁니다.",
          { h: "저장" },
          "효과는 화면에 바로 보이고, 실행 취소할 수 있으며, `.mypaint` 파일에 함께 저장됩니다. 내보낸 그림과 SVG, 인쇄에도 화면과 같이 들어갑니다.",
          { list: [
            "**그림 형식**: 효과가 픽셀에 들어갑니다.",
            "**SVG**: 효과가 SVG 필터로 들어가 도형은 벡터로 남습니다. 필터를 그리지 못하는 프로그램에서는 효과 없이 보일 수 있습니다.",
            "**인쇄**: 미리보기와 인쇄에 모두 나옵니다. 그림 전체의 테두리와 그림자가 있으면 그만큼 커진 그림을 용지에 맞추거나 나눕니다. **바탕색도 인쇄**를 끄면 그림 바탕과 그림자 바탕은 빠지고, 테두리와 그림자는 남습니다.",
          ] },
          { tip: "내보내기 창에서도 그림 전체의 테두리와 그림자를 정할 수 있습니다." },
        ],
      },
      en: {
        title: "Effects",
        blocks: [
          "**Effects** sit below **Properties** in the right panel. What you have selected decides where they apply, and the top of the section says which it is.",
          { table: { head: ["Selected", "Applies to"], rows: [
            ["Shapes or text", "only the selected shapes and text"],
            ["An area (rectangle, ellipse, free or pixel select)", "only the pixels of that area, lifted into a piece of their own"],
            ["Nothing", "the whole picture"],
          ] } },
          { img: "effects-panel", alt: "The right panel showing the Effects section", caption: "Effects — where they apply, reset, eight looks, brightness, contrast, saturation, blur and the colour wheel" },
          { list: [
            "**Eight looks**: None, Gray, Sepia, Invert, Warm, Cool, Vivid, Faded",
            "**Adjustments**: brightness, contrast, saturation, blur",
            "**Border**: a width for the top, bottom, left and right, and a colour",
            "**Shadow**: on or off, across, down, softness, strength, colour, backdrop, clear backdrop",
            "**Pick a color**: choose the border, shadow or backdrop, drag on the round wheel, and set the value beside it.",
          ] },
          { h: "Reset effects" },
          "**Reset effects** clears only what is selected: the selected shapes; for an area, the shapes it touches and the pieces lifted out for effects; with nothing selected, only the effects of the whole picture.",
          { h: "Saving" },
          "Effects show at once, can be undone and are kept in the `.mypaint` file. Exported pictures, SVG and printing all have them as the screen shows them.",
          { list: [
            "**Picture formats**: the effects go into the pixels.",
            "**SVG**: the effects go in as SVG filters, so shapes stay vectors. A program that cannot draw filters may show the file without them.",
            "**Printing**: both the preview and the print have them. A border and shadow of the whole picture make it larger, and that larger picture is what is fitted to the paper or split. With **Print the canvas colour** off, the picture's background and the shadow's backdrop are left out while the border and shadow stay.",
          ] },
          { tip: "The export window also sets the border and shadow of the whole picture." },
        ],
      },
    },
    {
      id: "clipboard",
      icon: "paste",
      ko: {
        title: "복사·붙여넣기와 되돌리기",
        blocks: [
          "복사([[Ctrl+C]]), 잘라내기([[Ctrl+X]]), 붙여넣기([[Ctrl+V]])는 **시스템 클립보드**를 거칩니다.",
          { list: [
            "MyPaint에서 복사한 도형이나 영역은 그림(PNG)으로도 클립보드에 올라가므로 그림판, 워드, 메신저 같은 다른 프로그램에 바로 붙여넣을 수 있습니다.",
            "다른 프로그램에서 복사한 그림이나 스크린샷은 MyPaint에 붙여넣으면 그림 도형으로 들어옵니다.",
            "MyPaint 안에서 복사해 붙이면 도형 그대로 붙어서 계속 고칠 수 있습니다.",
            "타원이나 자유 영역으로 고른 부분을 복사하면 영역 바깥은 투명합니다.",
          ] },
          { h: "되돌리기" },
          "실행 취소는 [[Ctrl+Z]], 다시 실행은 [[Ctrl+Y]] (또는 [[Ctrl+Shift+Z]])입니다. 도구 모음의 편집 기록 묶음에도 같은 단추가 있습니다.",
          { tip: "한글 입력 상태에서도 같은 단축키가 동작합니다. 마우스 오른쪽 단추를 누르면 같은 명령이 상황 메뉴로 나옵니다." },
        ],
      },
      en: {
        title: "Clipboard and undo",
        blocks: [
          "Copy ([[Ctrl+C]]), Cut ([[Ctrl+X]]) and Paste ([[Ctrl+V]]) go through the **system clipboard**.",
          { list: [
            "A shape or area copied in MyPaint also goes onto the clipboard as a picture (PNG), so it pastes straight into Paint, Word, a chat window and so on.",
            "A picture or screenshot copied in another program pastes into MyPaint as an image shape.",
            "Copying and pasting inside MyPaint brings the shapes back as shapes, still editable.",
            "Copying an ellipse or free-outline area leaves the outside transparent.",
          ] },
          { h: "Undo" },
          "Undo is [[Ctrl+Z]], Redo is [[Ctrl+Y]] (or [[Ctrl+Shift+Z]]). The history group on the toolbar has the same buttons.",
          { tip: "The same keys work while a Korean input method is on. The right mouse button offers the same commands in a context menu." },
        ],
      },
    },
    {
      id: "svg",
      icon: "image",
      ko: {
        title: "SVG 편집",
        blocks: [
          "`.svg` 파일을 열면 캔버스에 그림이 그려지고, 오른쪽 패널 **속성** 아래의 **SVG 원본** 칸에 파일 내용이 글로 나옵니다. 그 위에는 크기, viewBox, 요소 수가 있습니다.",
          { img: "svg-edit", alt: "오른쪽 패널에 SVG 원본이 보이는 화면", caption: "SVG 편집 — 원본을 고치면 캔버스가 바로 다시 그려집니다" },
          { steps: [
            "파일 → 열기로 `.svg` 파일을 엽니다.",
            "원본 칸에서 색, 좌표, 글자 등을 고칩니다. 입력을 잠시 멈추면 캔버스가 다시 그려지고, `width`와 `height`를 바꾸면 캔버스 크기도 바뀝니다.",
            "원본에 오류가 있으면 칸 위에 오류 위치를 알려 주고, 마지막으로 제대로 그려진 그림과 원본을 유지합니다. 이때 저장하면 제대로 그려진 원본이 저장됩니다.",
            "저장([[Ctrl+S]])하면 고친 내용이 다시 `.svg` 파일로 저장됩니다. 다른 형식이 필요하면 내보내기를 씁니다.",
          ] },
          { h: "알아 둘 점" },
          { list: [
            "원본 칸 안에서 [[Ctrl+Z]]는 입력한 글자를 되돌립니다. 도구 모음의 실행 취소는 원본 칸을 떠났다 돌아오기 전까지의 고침을 한 번에 되돌리고, 그림도 함께 돌아옵니다.",
            "SVG 그림 자체는 선택 도구로 고르거나 옮길 수 없습니다. 원본으로 고칩니다.",
            "그 위에 그린 도형은 MyPaint 도형으로 남아 평소처럼 고칩니다. SVG로 저장하면 `mypaint-shapes` 묶음으로 원본 끝에 덧붙고, 그 파일을 다시 열면 원본의 일부가 됩니다.",
            "오른쪽 패널에서 캔버스 너비나 높이를 바꾸면 원본의 크기도 함께 바뀌고 그림은 viewBox에 맞춰 커지거나 줄어듭니다.",
            "**선택 영역만 남기기**, **선택 영역 지우기**, **그림 모두 지우기**를 하면 그림이 픽셀이 되어 원본 칸이 사라집니다. 실행 취소하면 돌아옵니다.",
            "`.mypaint`로 저장해도 원본이 함께 남아, 다시 열어 계속 고칠 수 있습니다.",
            "내보내기의 SVG는 원본이 없는 그림도 도형은 벡터로, 사진은 그 안에 든 그림으로 저장합니다. 선 모양과 화살표 모양, 효과도 들어갑니다.",
            "그림 전체에 효과를 주고 SVG로 저장하면 원본이 바깥 `<svg>` 안에 묶여 저장됩니다. 편집 중인 원본 칸의 내용은 바뀌지 않지만, 그 파일을 다시 열면 묶인 내용이 원본으로 나오고 효과는 원본 안에 들어 있습니다.",
          ] },
        ],
      },
      en: {
        title: "Editing SVG",
        blocks: [
          "Opening an `.svg` file draws it on the canvas, and the **SVG source** box below **Properties** in the right panel shows the file as text, with its size, viewBox and element count above it.",
          { img: "svg-edit", alt: "The SVG source shown in the right panel", caption: "SVG editing — the canvas redraws as you edit the source" },
          { steps: [
            "Open the `.svg` file with File → Open.",
            "Edit colours, coordinates, text and so on in the source box. The canvas redraws when you pause typing, and changing `width` and `height` changes the canvas size too.",
            "If the source has an error, the panel says where above the box, and the last picture and source that drew are kept. Saving at that moment writes the source that drew.",
            "Save ([[Ctrl+S]]) writes the edited source back as an `.svg` file. Use Export for any other format.",
          ] },
          { h: "Good to know" },
          { list: [
            "Inside the source box, [[Ctrl+Z]] undoes your typing. Undo on the toolbar takes back all the edits of one stay in the box at once, and the picture comes back with them.",
            "The SVG picture itself cannot be selected or moved with the Select tool. Change it in the source.",
            "Shapes drawn on top stay MyPaint shapes and edit as usual. Saving as SVG adds them at the end of the source as a `mypaint-shapes` group, and they become part of the source when that file is opened again.",
            "Changing the canvas width or height in the right panel changes the size in the source too, and the picture scales through its viewBox.",
            "**Keep only the picked area**, **Erase the picked area** and **Clear the drawing** turn the picture into pixels, and the source box goes away. Undo brings it back.",
            "Saving as `.mypaint` keeps the source too, so you can open it again and keep editing.",
            "SVG in the export window also works for a picture with no source: shapes stay vectors and photographs go in as images. Line and arrow looks and effects are kept.",
            "Saving as SVG with effects on the whole picture wraps the source in an outer `<svg>`. The source box you are editing does not change, but when that file is opened again the wrapped text is the source, with the effects inside it.",
          ] },
        ],
      },
    },
    {
      id: "view",
      icon: "zoomIn",
      ko: {
        title: "화면: 확대, 격자, 눈금자, 패널",
        blocks: [
          { h: "확대와 축소" },
          "배율은 25%에서 400%까지입니다. 도구 모음의 −, + 단추나 [[Ctrl++]], [[Ctrl+-]], Ctrl+마우스 휠로 바꾸고, 배율 숫자를 누르거나 [[Ctrl+0]]을 누르면 100%로 돌아갑니다. 확대·축소는 화면 가운데를 기준으로 해서 보던 자리가 그대로 남습니다. 그림 바깥을 끌면 그림을 옮길 수 있습니다.",
          { h: "격자와 눈금자" },
          "격자 단추는 연한 격자를 켜고 끕니다. 격자는 **맨 아래**에 그려지므로 도형과 그림을 가리지 않고, 불투명한 사진이나 큰 그림 뒤로 숨습니다. 그림과 함께 확대·축소되어 늘 그림의 같은 자리를 가리키고, 한 칸이 화면에서 30픽셀에 이르면 다시 5×5로 나뉘며 6픽셀보다 작아지면 5칸이 한 칸으로 묶입니다. 눈금자 단추는 캔버스 위쪽과 왼쪽에 px 눈금자를 보여 주고, 마우스 위치를 붉은 선으로 표시합니다. 둘 다 그림에는 들어가지 않으며, 켠 상태는 다음 실행 때도 남습니다.",
          { img: "grid-rulers", alt: "격자와 눈금자가 켜진 캔버스", caption: "격자와 px 눈금자를 켠 화면" },
          { h: "패널 폭과 접기" },
          "왼쪽과 오른쪽 패널 옆의 **구분선**을 끌면 폭이 바뀌고, 바꾼 폭은 다음 실행 때도 남습니다. 구분선을 두 번 누르면 최소 폭으로 돌아가고, 구분선에 초점을 둔 채 방향키로도 바꿉니다. 왼쪽은 200픽셀, 오른쪽은 240픽셀까지 줄고, 둘 다 480픽셀까지 늘어납니다.",
          "도구 모음의 패널 단추나 각 패널 제목 옆 단추로 왼쪽·오른쪽 패널을 접고 펼칩니다. 접으면 캔버스가 그만큼 넓어집니다.",
          { h: "탭" },
          "여러 그림을 탭으로 함께 엽니다. 탭의 × 로 그 탭만 닫고, 탭이 많으면 오른쪽 `<` `>` 단추로 넘깁니다. 새 그림([[Ctrl+N]])은 너비와 높이를 묻고, 칸에는 설정의 기본 크기가 채워져 있습니다.",
        ],
      },
      en: {
        title: "View: zoom, grid, rulers, panels",
        blocks: [
          { h: "Zoom" },
          "The zoom runs from 25% to 400%. Use − and + on the toolbar, [[Ctrl++]] and [[Ctrl+-]], or Ctrl with the mouse wheel; click the percentage or press [[Ctrl+0]] for 100%. Zooming works from the middle of the view, so what you were looking at stays put. Drag beside the picture to move it.",
          { h: "Grid and rulers" },
          "The grid button turns a faint grid on and off. It is drawn **at the very bottom**, so it never covers shapes or pictures, and an opaque photograph or large image hides it. It scales with the zoom, so its lines always mark the same places on the picture; when a cell reaches 30 pixels on screen it splits into another 5×5, and when it gets smaller than 6 pixels five cells join into one. The rulers button shows pixel rulers along the top and left of the canvas, with the pointer position marked by a red line. Neither ends up in the picture, and both are remembered for the next run.",
          { img: "grid-rulers", alt: "The canvas with the grid and rulers on", caption: "The grid and the pixel rulers turned on" },
          { h: "Panel width and folding" },
          "Drag the **separator** beside the left or right panel to change its width; the width is remembered for the next run. Double-click a separator to return to the minimum, or focus it and use the arrow keys. The left panel goes down to 200 pixels and the right to 240, and both up to 480.",
          "The panel buttons on the toolbar, or the button beside each panel title, fold and open the left and right panels. A folded panel gives its width to the canvas.",
          { h: "Tabs" },
          "Several drawings stay open as tabs. The × on a tab closes that one; when there are too many, the `<` and `>` buttons scroll through them. New drawing ([[Ctrl+N]]) asks for the width and height, starting from the default size in Settings.",
        ],
      },
    },
    {
      id: "theme",
      icon: "palette",
      ko: {
        title: "테마와 언어",
        blocks: [
          "도구 모음 오른쪽의 **색상환 아이콘** 단추를 누르면 테마 목록이 열립니다. 밝은 테마 20가지, 어두운 테마 20가지에 직접 색을 정하는 사용자 정의 테마가 있고, 각 테마 옆의 색 견본으로 미리 볼 수 있습니다. 고르면 바로 바뀌고, 이 설명서 창도 함께 바뀝니다.",
          { img: "theme-menu", alt: "테마 목록이 열린 화면", caption: "테마 목록 — 밝은 테마, 어두운 테마, 사용자 정의" },
          "언어는 도구 모음의 **국기 단추**로 바꿉니다. 태극기는 한국어, 영국 국기는 영어입니다. 메뉴, 창, 이 설명서까지 모두 바로 바뀝니다. 이 설명서 창에서만 다른 언어로 보고 싶으면 설명서 위쪽의 국기 단추를 누릅니다.",
        ],
      },
      en: {
        title: "Themes and language",
        blocks: [
          "The **colour wheel icon** at the right of the toolbar opens the theme list: twenty light themes, twenty dark ones and a custom theme whose colours you set yourself. The swatches beside each name preview it. A theme applies at once — to this guide window too.",
          { img: "theme-menu", alt: "The theme list opened from the toolbar", caption: "The theme list — light, dark and custom" },
          "The **flag buttons** on the toolbar switch the language: the Korean flag for Korean, the UK flag for English. Menus, windows and this guide follow at once. To read only this guide in the other language, use the flag buttons at the top of the guide.",
        ],
      },
    },
    {
      id: "print",
      icon: "print",
      ko: {
        title: "인쇄",
        blocks: [
          "인쇄([[Ctrl+P]])를 누르면 왼쪽에 설정, 오른쪽에 미리보기가 있는 창이 열립니다. 미리보기는 실제로 나올 종이 한 장을 그대로 보여 주고, 점선이 여백 안쪽의 인쇄 영역입니다. 여러 장이면 `<` `>` 로 넘겨 봅니다.",
          { img: "print-dialog", alt: "설정과 미리보기가 있는 인쇄 창", caption: "인쇄 창 — 왼쪽 설정, 오른쪽 미리보기" },
          { list: [
            "**범위**: 전체, 현재 그림, 사용자 지정",
            "**용지**: A3, A4, A5, B4, B5, Letter, Legal, Tabloid, 방향",
            "**여백**: 위·아래·왼쪽·오른쪽 (mm)",
            "**크기 조정**: 용지에 맞춤, 실제 크기, 비율 지정",
            "**세로 위치**, **매수**, **바탕색 인쇄** 여부",
          ] },
          "설정에 따른 인쇄 영역 크기가 mm로 나오고, 한 장에 안 들어가는 그림은 여러 장으로 나뉩니다. 효과도 화면과 같이 인쇄됩니다. **효과** 항목을 보십시오.",
        ],
      },
      en: {
        title: "Printing",
        blocks: [
          "Print ([[Ctrl+P]]) opens a window with the settings on the left and a preview on the right. The preview is the sheet that will come out, with a dashed line marking the printable area inside the margins. Several sheets are paged with `<` and `>`.",
          { img: "print-dialog", alt: "The print window with settings and preview", caption: "The print window — settings on the left, preview on the right" },
          { list: [
            "**Scope**: all drawings, the current one, or a page range",
            "**Paper**: A3, A4, A5, B4, B5, Letter, Legal, Tabloid, and the orientation",
            "**Margins**: top, bottom, left, right (mm)",
            "**Scaling**: fit to the paper, actual size, or a percentage",
            "**Vertical place**, **copies**, and whether the canvas colour is printed",
          ] },
          "The resulting printable area is shown in millimetres, and a picture too large for one sheet is split over several. Effects print as the screen shows them; see **Effects**.",
        ],
      },
    },
    {
      id: "settings",
      icon: "settings",
      ko: {
        title: "설정",
        blocks: [
          "도구 모음의 설정 단추(톱니바퀴)로 설정 창을 엽니다. 바꾼 내용은 바로 적용되고 다음 실행 때도 남습니다.",
          { img: "settings-dialog", alt: "탭으로 나뉜 설정 창", caption: "설정 창 — 일반, 글꼴, 모양, 작업 공간, 시작 화면" },
          { table: { head: ["탭", "정하는 것"], rows: [
            ["일반", "언어, 테마, 새 그림의 기본 크기, 다음 실행 때 그림 복원"],
            ["글꼴", "글자 도구의 기본 글꼴, 크기, 스타일"],
            ["모양", "창 바탕 그림과 그 투명도"],
            ["작업 공간", "왼쪽·오른쪽 패널 표시, 열어 본 폴더, 마지막으로 열고 저장한 폴더"],
            ["시작 화면", "3D 배경, 움직임 속도, 카드 불투명도, 섞기, 시작할 때 보이기, 카드 배치"],
          ] } },
        ],
      },
      en: {
        title: "Settings",
        blocks: [
          "The settings button (the gear) on the toolbar opens the Settings window. Changes apply at once and are kept for the next run.",
          { img: "settings-dialog", alt: "The Settings window with its tabs", caption: "Settings — General, Font, Appearance, Workspace, Start screen" },
          { table: { head: ["Tab", "What it sets"], rows: [
            ["General", "language, theme, default size of new drawings, restoring the drawings on the next run"],
            ["Font", "default family, size and style of the text tool"],
            ["Appearance", "the workspace background picture and its opacity"],
            ["Workspace", "which side panels are shown, the opened folders, the last open and save folders"],
            ["Start screen", "3D background, motion speed, card opacity, shuffle, show at start, card layout"],
          ] } },
        ],
      },
    },
    {
      id: "dicom",
      icon: "scan",
      ko: {
        title: "의료 영상 (DICOM)",
        blocks: [
          "DICOM 파일은 파일 → 열기로 다른 그림과 똑같이 엽니다. 열면 오른쪽에 의료 영상 패널이 나옵니다.",
          { img: "dicom", alt: "CT 영상과 의료 영상 패널", caption: "DICOM 영상 — 오른쪽 패널에서 창 설정, 미리 설정, 프레임" },
          { list: [
            "**창 중심(WC) / 창 너비(WW)**: 밝기와 대비를 숫자로 정합니다.",
            "**미리 설정**: CT는 뇌, 경막하, 뇌졸중, 연부 조직, 간, 종격동, 폐, 뼈. \"파일 값\"은 파일에 적힌 설정으로, \"자동\"은 영상의 밝기 범위에 맞춥니다.",
            "**프레임과 재생(cine)**: 여러 장이 든 파일은 `<` `>` 로 넘기고 ▶ 로 이어서 재생합니다.",
            "**색상표**, **흑백 반전**, **오버레이**, **VOI LUT**, **창 함수**(LINEAR, LINEAR_EXACT, SIGMOID).",
            "**DICOM 정보**: 환자·검사·영상 요약과 파일의 모든 태그. 많으면 `<` `>` 로 넘깁니다.",
          ] },
          { h: "측정" },
          "그리기 도구가 그대로 측정 도구가 됩니다. 직선을 그으면 길이가 mm로, 사각형이나 타원을 그리면 그 안의 평균, 표준 편차, 최소, 최대, 넓이가 나옵니다. 영상 위에 마우스를 올리면 그 자리의 값이 Hounsfield 단위(HU)로 나옵니다.",
          { note: "MyPaint는 진단용 프로그램이 아닙니다. 영상을 보고 설명하는 용도로 쓰십시오." },
        ],
      },
      en: {
        title: "Medical images (DICOM)",
        blocks: [
          "A DICOM file opens with File → Open like any other picture, and a medical image panel appears on the right.",
          { img: "dicom", alt: "A CT image with the medical image panel", caption: "A DICOM image — window, presets and frames in the right panel" },
          { list: [
            "**Window centre (WC) / width (WW)**: brightness and contrast as numbers.",
            "**Presets**: for CT, brain, subdural, stroke, soft tissue, liver, mediastinum, lung and bone. \"From the file\" uses the window stored in the file; \"Automatic\" fits the image's range.",
            "**Frames and cine**: step through multi-frame files with `<` and `>`, and play them with ▶.",
            "**Colour map**, **invert**, **overlays**, **VOI LUT**, **window function** (LINEAR, LINEAR_EXACT, SIGMOID).",
            "**DICOM details**: patient, study and image summary, and every tag in the file, paged with `<` and `>`.",
          ] },
          { h: "Measuring" },
          "The drawing tools double as measuring tools. A line gives its length in millimetres; a rectangle or ellipse gives the mean, standard deviation, minimum, maximum and area inside it. Hover the image to read the value under the pointer in Hounsfield units (HU).",
          { note: "MyPaint is not a diagnostic program. Use it to view and explain images." },
        ],
      },
    },
    {
      id: "shortcuts",
      icon: "properties",
      ko: {
        title: "단축키",
        blocks: [
          "한글 입력 상태에서도 같은 키로 동작합니다. macOS에서는 Ctrl 대신 ⌘를 씁니다.",
          { keys: [
            ["Ctrl+N", "새 그림"],
            ["Ctrl+O", "열기 (그림, 사진, DICOM 모두)"],
            ["Ctrl+S", "저장 (.mypaint)"],
            ["Ctrl+P", "인쇄"],
            ["Ctrl+Z", "실행 취소"],
            ["Ctrl+Y / Ctrl+Shift+Z", "다시 실행"],
            ["Ctrl+X", "잘라내기 (시스템 클립보드)"],
            ["Ctrl+C", "복사 (시스템 클립보드)"],
            ["Ctrl+V", "붙여넣기 (다른 프로그램의 그림도)"],
            ["Ctrl+A", "모두 고르기"],
            ["Delete", "고른 도형 지우기"],
            ["Shift+클릭 / Ctrl+클릭", "고른 것에 도형 더하기·빼기"],
            ["← / → (패널 구분선에서)", "패널 폭 바꾸기"],
            ["Esc", "고르기 풀기, 메뉴 닫기, 글자 입력 마치기"],
            ["Ctrl++ / Ctrl+-", "확대 / 축소"],
            ["Ctrl+0", "100%로"],
            ["Ctrl+휠", "확대·축소"],
          ] },
          { h: "이 설명서 창" },
          { keys: [
            ["Ctrl+F", "검색 칸으로"],
            ["Ctrl++ / Ctrl+-", "글자 크게 / 작게"],
            ["Ctrl+0", "기본 글자 크기"],
            ["Alt+← / Alt+→", "이전 / 다음 항목"],
            ["Esc", "검색어 지우기, 크게 보기 닫기"],
          ] },
        ],
      },
      en: {
        title: "Keyboard shortcuts",
        blocks: [
          "The same keys work with a Korean input method on. On macOS use ⌘ instead of Ctrl.",
          { keys: [
            ["Ctrl+N", "New drawing"],
            ["Ctrl+O", "Open (drawings, pictures and DICOM alike)"],
            ["Ctrl+S", "Save (.mypaint)"],
            ["Ctrl+P", "Print"],
            ["Ctrl+Z", "Undo"],
            ["Ctrl+Y / Ctrl+Shift+Z", "Redo"],
            ["Ctrl+X", "Cut (system clipboard)"],
            ["Ctrl+C", "Copy (system clipboard)"],
            ["Ctrl+V", "Paste (pictures from other programs too)"],
            ["Ctrl+A", "Select all"],
            ["Delete", "Delete the selected shapes"],
            ["Shift+Click / Ctrl+Click", "Add a shape to the selection or remove it"],
            ["← / → (on a panel separator)", "Change the panel width"],
            ["Esc", "Deselect, close a menu, finish typing"],
            ["Ctrl++ / Ctrl+-", "Zoom in / out"],
            ["Ctrl+0", "Zoom to 100%"],
            ["Ctrl+Wheel", "Zoom"],
          ] },
          { h: "This guide window" },
          { keys: [
            ["Ctrl+F", "Go to the search box"],
            ["Ctrl++ / Ctrl+-", "Larger / smaller text"],
            ["Ctrl+0", "Default text size"],
            ["Alt+← / Alt+→", "Previous / next section"],
            ["Esc", "Clear the search, close an enlarged picture"],
          ] },
        ],
      },
    },
  ];

  function section(id) {
    return SECTIONS.find((item) => item.id === id) || null;
  }

  function images() {
    const names = [];
    SECTIONS.forEach((item) => {
      ["ko", "en"].forEach((lang) => {
        item[lang].blocks.forEach((block) => {
          if (block && block.img && names.indexOf(block.img) < 0) names.push(block.img);
        });
      });
    });
    return names;
  }

  return { UI: UI, SECTIONS: SECTIONS, section: section, images: images };
});
