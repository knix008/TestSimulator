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
            "**왼쪽 도구 패널**: 그리기 도구, 색판, 선 굵기, 도형 목록이 있습니다.",
            "**캔버스**: 그림이 놓이는 곳입니다. 여러 그림은 위쪽 탭으로 함께 엽니다.",
            "**오른쪽 속성 패널**: 고른 도형이나 영역, 열어 둔 사진·SVG·의료 영상의 속성을 보여 주고 고칩니다.",
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
            "**Tool panel (left)**: the drawing tools, colour swatches, line widths and the shape list.",
            "**Canvas**: where the picture is. Several drawings stay open as tabs above it.",
            "**Properties panel (right)**: shows and edits the selected shape or area, and the details of an open photograph, SVG or medical image.",
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
          "MyPaint를 열면 시작 화면이 나옵니다. 새 그림 만들기, 파일 열기와 함께 **최근 파일** 목록이 있어 하던 작업으로 바로 돌아갈 수 있습니다. 메뉴 막대의 '파일' 왼쪽에 있는 홈 단추를 누르면 시작 화면이 열리고, 다시 누르면 닫힙니다.",
          { img: "start-screen", alt: "최근 파일 목록이 있는 시작 화면", caption: "시작 화면 — 새로 만들기, 열기, 최근 파일" },
          { list: [
            "최근 파일을 누르면 그 파일을 엽니다.",
            "항목 오른쪽의 **×** 단추로 그 항목 하나만 목록에서 지웁니다. 파일 자체는 지워지지 않습니다.",
            "**모두 지우기**는 최근 파일 목록을 비웁니다.",
            "제목과 글자의 크기, 정렬, 최근 파일 목록을 보일지, 프로그램을 열 때 시작 화면을 보일지는 **설정 → 시작 화면** 탭에서 정합니다.",
          ] },
          { img: "settings-start", alt: "설정 창의 시작 화면 탭", caption: "설정 → 시작 화면 — 글자 크기, 정렬, 표시 여부" },
        ],
      },
      en: {
        title: "The start screen",
        blocks: [
          "MyPaint opens on the start screen: create a new drawing, open a file, or pick up where you left off from the **recent files** list. The home button left of File in the menu bar opens it, and a second press closes it.",
          { img: "start-screen", alt: "The start screen with its recent files list", caption: "The start screen — new, open and recent files" },
          { list: [
            "Click a recent file to open it.",
            "The **×** at the right of an entry removes just that entry from the list. The file itself is not touched.",
            "**Clear all** empties the recent files list.",
            "The title and text sizes, the alignment, whether the recent list is shown and whether the start screen appears when MyPaint opens are set in **Settings → Start screen**.",
          ] },
          { img: "settings-start", alt: "The Start screen tab of the Settings window", caption: "Settings → Start screen — sizes, alignment and what is shown" },
        ],
      },
    },
    {
      id: "toolbar",
      icon: "wrench",
      ko: {
        title: "도구 모음",
        blocks: [
          "도구 모음의 단추는 하는 일끼리 묶여 있고, 묶음 사이에는 세로 구분선이 있습니다. 단추에 마우스를 올리면 이름과 단축키가 나옵니다.",
          { img: "toolbar", alt: "구분선으로 묶인 도구 모음 단추", caption: "도구 모음 — 파일, 편집 기록, 클립보드, 보기, 테마와 언어" },
          { table: { head: ["묶음", "단추"], rows: [
            ["파일", "새 그림, 열기, 저장, 내보내기, 인쇄 — 인쇄는 내보내기 오른쪽에 있습니다"],
            ["편집 기록", "실행 취소, 다시 실행"],
            ["클립보드", "잘라내기, 복사, 붙여넣기"],
            ["보기", "축소, 배율(누르면 100%), 확대, 격자, 눈금자, 왼쪽·오른쪽 패널 접기"],
            ["글자", "글꼴, 크기 − / 값 / +, 굵게·기울임·밑줄·취소선"],
            ["오른쪽 끝", "테마(팔레트 아이콘), 언어(국기), 설정"],
          ] } },
          "창을 최소 크기까지 줄여도 단추는 잘리거나 서로 겹치지 않습니다. 남는 자리는 그리기 명령과 오른쪽 끝 묶음 사이에 생깁니다.",
        ],
      },
      en: {
        title: "The toolbar",
        blocks: [
          "Toolbar buttons are grouped by what they do, with a thin vertical separator between groups. Hover a button to see its name and shortcut.",
          { img: "toolbar", alt: "Toolbar buttons grouped with separators", caption: "The toolbar — file, history, clipboard, view, theme and language" },
          { table: { head: ["Group", "Buttons"], rows: [
            ["File", "New, Open, Save, Export, Print — Print sits to the right of Export"],
            ["History", "Undo, Redo"],
            ["Clipboard", "Cut, Copy, Paste"],
            ["View", "Zoom out, zoom level (click for 100%), Zoom in, Grid, Rulers, fold the left and right panels"],
            ["Text", "Font, size − / value / +, bold, italic, underline, strikethrough"],
            ["Right end", "Theme (palette icon), language (flags), Settings"],
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
          "탐색기에서 파일을 창 위로 끌어다 놓아도 됩니다. 그림 파일이면 새 그림으로 열지, 지금 그림에 넣을지, 창 바탕 그림으로 쓸지 묻습니다. 파일 메뉴의 **링크에서 이미지 받기**는 주소의 그림을 내려받아 엽니다. 받는 동안 진행률이 나오고 취소할 수 있습니다.",
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
            "SVG: the source can be edited in the right panel (see SVG editing)",
            "TIFF: every page, 8–16 bit, LZW / PackBits / Deflate / JPEG",
            "HEIC/HEIF from phones. A file holding several pictures opens at its primary image; `<` and `>` reach the rest",
            "JPEG 2000: `.jp2`, `.j2k`",
            "Camera RAW: `.cr2` `.cr3` `.nef` `.arw` `.raf` `.orf` `.rw2` `.dng` and more than thirty others. The full-size picture stored in the file is shown, with the camera and lens in the right panel",
            "DICOM medical images: `.dcm`, `.dicom`, and DICOM files without an extension",
          ] },
          "Files can also be dropped onto the window. For a picture MyPaint asks whether to open it as a new drawing, place it in the current one, or use it as the workspace background. **Download a picture from a link** in the File menu fetches an address and opens it, with a progress bar and a cancel button.",
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
          { img: "export-dialog", alt: "형식과 품질을 고르는 내보내기 창", caption: "내보내기 창 — 형식을 고르고, 손실 압축 형식이면 품질을 %로 정합니다" },
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
          { img: "export-dialog", alt: "The export window with format and quality", caption: "The export window — pick a format; lossy formats take a quality in %" },
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
          "도구는 왼쪽 패널 위쪽에 있습니다. 도구를 고른 뒤 캔버스에서 끌면 그려집니다.",
          { img: "tool-panel", alt: "도구, 색판, 선 굵기가 있는 왼쪽 패널", caption: "왼쪽 도구 패널 — 도구, 색, 선 굵기, 도형 목록" },
          { table: { head: ["도구", "쓰는 법"], rows: [
            ["연필 · 붓 · 마커 · 스프레이", "끄는 대로 자유롭게 그립니다"],
            ["자유 곡선", "끄는 대로 그린 선을 매끄러운 곡선으로 다듬어 남깁니다. 끝난 뒤에도 하나의 도형으로 옮기고 고칠 수 있습니다"],
            ["지우개", "끄는 자리를 지웁니다. 크기는 선 굵기 단추로 정합니다"],
            ["직선 · 화살표 · 곡선", "시작점에서 끝점까지 끌어서 그립니다"],
            ["사각형 · 둥근 사각형 · 타원 · 삼각형", "끈 크기대로 도형이 생깁니다"],
            ["글자", "누른 자리에 글자를 입력합니다 (글자 항목 참고)"],
            ["색 채우기", "누른 도형이나 닫힌 영역, 바탕을 채움 색으로 칠합니다"],
            ["색 고르기", "누른 자리의 색을 선 색으로 가져옵니다"],
          ] } },
          { h: "색과 굵기" },
          "색판에서 색을 누르면 선 색이 됩니다. 선 색·채움 색 칸을 누르면 색 고르기 창이 열리고, 창 바깥을 누르면 고른 색이 남은 채로 닫힙니다. 선 굵기는 그림 단추로 고르거나 −, 값, + 로 한 단계씩 바꾸고, px 숫자를 직접 넣어도 됩니다.",
          { img: "drawing-shapes", alt: "여러 도형을 그린 캔버스", caption: "도형, 화살표, 자유 곡선, 글자를 그린 예" },
        ],
      },
      en: {
        title: "Drawing tools",
        blocks: [
          "The tools are at the top of the left panel. Pick one and drag on the canvas.",
          { img: "tool-panel", alt: "The left panel with tools, swatches and line widths", caption: "The tool panel — tools, colours, line widths and the shape list" },
          { table: { head: ["Tool", "How it works"], rows: [
            ["Pencil · Brush · Marker · Spray", "draw freely while you drag"],
            ["Free curve", "smooths what you drag into a flowing curve, kept as one shape you can move and edit later"],
            ["Eraser", "erases where you drag; its size comes from the line width controls"],
            ["Line · Arrow · Curve", "drag from the start point to the end point"],
            ["Rectangle · Rounded rectangle · Ellipse · Triangle", "take their size from the drag"],
            ["Text", "type where you click (see Text)"],
            ["Fill", "paints the clicked shape, closed area or the canvas with the fill colour"],
            ["Pick colour", "takes the colour under the pointer as the line colour"],
          ] } },
          { h: "Colour and width" },
          "Click a swatch to make it the line colour. Clicking the line or fill colour opens a colour picker; clicking anywhere outside it closes it and keeps the colour. Choose a line width from the pictures, step it with −, the value and +, or type a number of pixels.",
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
          "**선택** 도구로 도형을 누르면 그 도형이 골라지고, 오른쪽 패널에 색, 굵기, 투명도, 위치, 크기가 나옵니다. 끌어서 옮기고, Delete 키로 지웁니다. [[Ctrl+A]]는 모두 고릅니다. 앞으로/뒤로 단추로 도형의 쌓인 순서를 바꿉니다.",
          { img: "properties-panel", alt: "고른 도형의 속성을 보여 주는 오른쪽 패널", caption: "오른쪽 속성 패널 — 고른 도형의 색, 굵기, 투명도, 위치" },
          { h: "영역 고르기" },
          "사각형 선택, 타원 선택, 자유 선택 도구는 그림의 일부를 고릅니다. 고른 영역은 점선으로 표시되고 오른쪽 패널에 종류와 크기가 나옵니다.",
          { list: [
            "**선택 영역만 남기기**: 고른 부분만 남기고 잘라냅니다. 타원이나 자유 영역이면 바깥은 투명해집니다.",
            "**선택 영역 지우기**: 고른 부분을 바탕색으로 칠합니다.",
            "[[Ctrl+C]] 복사, [[Ctrl+X]] 잘라내기, [[Ctrl+V]] 붙여넣기.",
          ] },
          "왼쪽 패널의 도형 목록에서도 도형을 고르고 지울 수 있습니다. 도구 모음의 도형 목록 단추로 목록을 숨겨도 캔버스의 도형은 그대로입니다.",
        ],
      },
      en: {
        title: "Selecting shapes and areas",
        blocks: [
          "With the **Select** tool, click a shape to select it; the right panel shows its colour, width, opacity, position and size. Drag to move it and press Delete to remove it. [[Ctrl+A]] selects everything; the forward and backward buttons change the stacking order.",
          { img: "properties-panel", alt: "The right panel showing a selected shape", caption: "The properties panel — colour, width, opacity and position of the selected shape" },
          { h: "Picking an area" },
          "The rectangle, ellipse and free select tools pick part of the picture. The area is outlined with a dashed line, and the right panel names its shape and size.",
          { list: [
            "**Keep only the picked area** cuts everything else away; outside an ellipse or free outline becomes transparent.",
            "**Erase the picked area** paints it with the canvas colour.",
            "[[Ctrl+C]] copies, [[Ctrl+X]] cuts, [[Ctrl+V]] pastes.",
          ] },
          "Shapes can also be selected and removed from the shape list in the left panel. Hiding the list with its toolbar button leaves the shapes on the canvas.",
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
          "`.svg` 파일을 열면 캔버스에 그림이 그려지고, 오른쪽 패널에 **SVG 원본**이 고칠 수 있는 글 상자로 나옵니다. 그 위에는 너비, 높이, viewBox 같은 속성이 있습니다.",
          { img: "svg-edit", alt: "오른쪽 패널에 SVG 원본이 보이는 화면", caption: "SVG 편집 — 원본을 고치면 캔버스가 바로 다시 그려집니다" },
          { steps: [
            "파일 → 열기로 `.svg` 파일을 엽니다.",
            "오른쪽 패널의 원본에서 색, 좌표, 글자 등을 고칩니다. 고칠 때마다 캔버스가 바로 다시 그려집니다.",
            "원본에 오류가 있으면 패널에 알려 주고, 마지막으로 제대로 그려진 그림을 유지합니다.",
            "저장하면 고친 내용이 다시 `.svg` 파일로 저장됩니다. 다른 형식이 필요하면 내보내기를 씁니다.",
          ] },
        ],
      },
      en: {
        title: "Editing SVG",
        blocks: [
          "Opening an `.svg` file draws it on the canvas, and the right panel shows the **SVG source** in an editable text box, with properties such as width, height and viewBox above it.",
          { img: "svg-edit", alt: "The SVG source shown in the right panel", caption: "SVG editing — the canvas redraws as you edit the source" },
          { steps: [
            "Open the `.svg` file with File → Open.",
            "Edit colours, coordinates, text and so on in the source in the right panel. The canvas redraws with every change.",
            "If the source has an error the panel says so and the last good picture stays on the canvas.",
            "Save writes the edited source back as an `.svg` file. Use Export for any other format.",
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
          "격자 단추는 그림 위에 5×5 칸 격자를 켜고 끕니다. 격자는 그림과 함께 확대·축소되어 늘 그림의 같은 자리를 가리킵니다. 눈금자 단추는 캔버스 위쪽과 왼쪽에 px 눈금자를 보여 주고, 마우스 위치를 눈금자에 표시합니다. 둘 다 그림에는 들어가지 않으며, 켠 상태는 다음 실행 때도 남습니다.",
          { img: "grid-rulers", alt: "격자와 눈금자가 켜진 캔버스", caption: "격자와 px 눈금자를 켠 화면" },
          { h: "패널 접기" },
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
          "The grid button draws a 5×5 grid over the picture. It scales with the zoom, so its lines always mark the same places on the picture. The rulers button shows pixel rulers along the top and left of the canvas, with the pointer position marked on them. Neither ends up in the picture, and both are remembered for the next run.",
          { img: "grid-rulers", alt: "The canvas with the grid and rulers on", caption: "The grid and the pixel rulers turned on" },
          { h: "Folding the panels" },
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
          "도구 모음 오른쪽의 **팔레트 아이콘** 단추를 누르면 테마 목록이 열립니다. 밝은 테마 20가지, 어두운 테마 20가지에 직접 색을 정하는 사용자 정의 테마가 있고, 각 테마 옆의 색 견본으로 미리 볼 수 있습니다. 고르면 바로 바뀌고, 이 설명서 창도 함께 바뀝니다.",
          { img: "theme-menu", alt: "테마 목록이 열린 화면", caption: "테마 목록 — 밝은 테마, 어두운 테마, 사용자 정의" },
          "언어는 도구 모음의 **국기 단추**로 바꿉니다. 태극기는 한국어, 영국 국기는 영어입니다. 메뉴, 창, 이 설명서까지 모두 바로 바뀝니다. 이 설명서 창에서만 다른 언어로 보고 싶으면 설명서 위쪽의 국기 단추를 누릅니다.",
        ],
      },
      en: {
        title: "Themes and language",
        blocks: [
          "The **palette icon** at the right of the toolbar opens the theme list: twenty light themes, twenty dark ones and a custom theme whose colours you set yourself. The swatches beside each name preview it. A theme applies at once — to this guide window too.",
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
          "설정에 따른 인쇄 영역 크기가 mm로 나오고, 한 장에 안 들어가는 그림은 여러 장으로 나뉩니다.",
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
          "The resulting printable area is shown in millimetres, and a picture too large for one sheet is split over several.",
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
            ["시작 화면", "시작할 때 보이기, 제목·글자 크기, 정렬, 최근 파일 표시"],
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
            ["Start screen", "show at start, title and text sizes, alignment, the recent list"],
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
