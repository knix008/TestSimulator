# MyPaint 10.0 사용 설명서 / User's guide

## 한국어

### 설치

내려받은 설치 파일을 실행합니다. 설치 화면의 언어는 한국어와 영어 중에서 고를 수 있습니다.
이미 MyPaint가 깔려 있으면 먼저 완전히 지운 뒤 다시 깝니다. 지난번에 저장해 둔 설정이나
그림이 남아 있으면 그것까지 지울지 설치 중에 물어봅니다. 설치가 끝나면 `.mpaint` 파일은
MyPaint 문서 아이콘으로 바뀌고, 두 번 누르면 MyPaint가 열립니다.

### 그리기

왼쪽 패널 위쪽에 도구가 있습니다. 연필과 붓은 끌어서 자유롭게 그리고, 직선·사각형·타원은
끌어서 크기를 정합니다. 글자 도구는 누른 자리에 글자를 넣고, 글자 내용은 오른쪽 패널에서
고칩니다. 색 채우기는 도형이나 바탕의 색을 바꾸고, 색 고르기는 누른 자리의 색을 가져옵니다.

색은 왼쪽 패널의 색판에서 고르거나, 선 색·채움 색을 직접 지정합니다. 선 굵기는 그 아래
막대로 정합니다. 선택 도구로 도형을 고르면 오른쪽 패널에서 색, 굵기, 투명도, 위치를
고칠 수 있고, 끌어서 옮길 수 있습니다. Delete 키로 지웁니다.

### 영역 고르기와 잘라내기

사각형 선택, 타원 선택, 자유 선택 도구로 그림의 일부를 고를 수 있습니다. 고른 영역은 점선으로
표시되고, 오른쪽 패널에 영역의 종류와 크기가 나옵니다.

- **선택 영역만 남기기**: 고른 영역만 남기고 나머지를 잘라냅니다. 타원이나 자유 영역으로
  고르면 영역 밖은 투명하게 남습니다.
- **선택 영역 지우기**: 고른 영역을 바탕색으로 지웁니다.
- Ctrl+C로 고른 영역을 복사하고, Ctrl+X로 복사하면서 지웁니다. Ctrl+V로 붙여넣습니다.

### 탭

여러 그림을 탭으로 함께 엽니다. 각 탭의 × 단추로 그 탭만 닫고, 바뀐 내용이 있으면 닫기 전에
저장할지 물어봅니다. 탭이 많아 한 줄에 다 안 들어가면 양쪽 끝의 `<` `>` 단추로 넘깁니다.

### 화면 옮기기와 확대

그림이 화면보다 작으면 가운데에 놓입니다. 그림 바깥을 누르면 손 모양으로 바뀌고 끌어서
그림을 옮깁니다. 확대와 축소는 화면 한가운데를 기준으로 하므로, 보고 있던 자리가 그대로
가운데에 남습니다.

### 되돌리기와 복사

실행 취소는 Ctrl+Z, 다시 실행은 Ctrl+Y입니다. 복사는 Ctrl+C, 붙여넣기는 Ctrl+V,
잘라내기는 Ctrl+X, 모두 선택은 Ctrl+A입니다. 마우스 오른쪽 단추를 누르면 이 명령들이
상황 메뉴로 나옵니다.

### 사진과 그림 파일

바깥에서 파일을 끌어다 놓으면 새 그림으로 열지, 지금 그림 안에 넣을지, 창 바탕 그림으로
쓸지 물어봅니다. 열 수 있는 형식은 다음과 같습니다.

- 일반 그림: PNG, JPEG, GIF, WebP, BMP, ICO, AVIF
- TIFF: 여러 쪽, 8~16비트, LZW·PackBits·Deflate·JPEG 압축
- HEIC/HEIF: 요즘 휴대전화 사진
- JPEG 2000: `.jp2`, `.j2k`
- 카메라 RAW: 캐논 `.cr2` `.cr3`, 니콘 `.nef` `.nrw`, 소니 `.arw` `.sr2`, 후지 `.raf`,
  올림푸스 `.orf`, 파나소닉 `.rw2`, 펜탁스 `.pef`, 삼성 `.srw`, 시그마 `.x3f`,
  핫셀블라드 `.3fr`, 페이즈원 `.iiq`, 어도비 `.dng` 등 서른 가지가 넘습니다.
  RAW 파일 안에 들어 있는 원본 크기 사진을 꺼내서 보여 주고, 카메라와 렌즈 정보도
  오른쪽 패널에 적어 줍니다.
- DICOM 의료 영상: `.dcm`, `.dicom`

여러 쪽짜리 TIFF는 오른쪽 패널의 `<` `>` 단추로 쪽을 넘깁니다.

### 링크에서 받기

파일 메뉴의 "링크에서 이미지 받기"에 주소를 넣으면 내려받아서 엽니다. 받는 동안 진행률
막대가 받은 양과 전체 크기를 보여 주고, 취소 단추로 중간에 멈출 수 있습니다. 받은 그림은
최근 파일에 주소와 함께 남습니다.

### 다른 형식으로 저장하기

파일 메뉴의 "다른 형식으로 변환"을 고르면 PNG, JPEG, WebP, BMP, TIFF, GIF, ICO,
JPEG 2000(.jp2/.j2k), DICOM(.dcm) 중에서 고르고 품질을 정해 저장합니다. 지금 보고 있는
그림이 사진이든 의료 영상이든 그대로 변환됩니다.

HEIC/HEIF로는 내보낼 수 없습니다. HEVC 코덱은 특허가 걸려 있어 어떤 브라우저도, 쓸 수 있는
어떤 WebAssembly 패키지도 HEIC를 만들지 못합니다. 읽기는 됩니다.

### 의료 영상 (DICOM)

DICOM 파일을 열면 오른쪽에 의료 영상 패널이 나옵니다.

- **프레임**: 여러 장이 들어 있는 파일은 `<` `>`로 넘기고, ▶ 단추로 이어서 재생합니다.
- **미리 설정**: CT는 뇌, 경막하, 뇌졸중, 연부 조직, 간, 종격동, 폐, 뼈 설정을 바로 고릅니다.
  "파일 값"은 파일에 적힌 설정으로, "자동"은 영상의 밝기 범위에 맞춰 돌아갑니다.
- **창 중심(WC) / 창 너비(WW)**: 직접 숫자로 넣습니다.
- **색상표**: gray, hotiron, pet, hotmetalblue, pet20, jet, rainbow, bone.
- **흑백 반전**, **오버레이 표시**, **VOI LUT**, **창 함수**(LINEAR, LINEAR_EXACT, SIGMOID).
- **DICOM 정보**: 환자·검사·영상 요약과 파일 안의 모든 태그를 보여 줍니다. 태그가 많으면
  `<` `>`로 넘깁니다.

측정은 그리기 도구를 그대로 씁니다. 직선을 그으면 오른쪽 패널에 길이가 밀리미터로 나오고,
사각형이나 타원을 그리면 그 안의 평균, 표준 편차, 최소, 최대, 넓이가 나옵니다. 영상 위에
마우스를 올리면 그 자리의 값이 Hounsfield 단위로 나옵니다.

### 저장과 인쇄

저장은 `.mpaint` 그림 파일로 남깁니다. 내보내기 단추를 누르면 형식과 품질을 고르는 창이
열리고, 파일 메뉴의 "PNG로 바로 내보내기"는 묻지 않고 PNG를 만듭니다.
최근 파일은 10개까지 남고, 하나씩 또는 모두 지울 수 있습니다. 연 폴더와 저장한 폴더는
다음 실행 때 다시 씁니다.

인쇄 창은 왼쪽에 설정, 오른쪽에 미리보기가 놓입니다. 미리보기는 실제로 인쇄될 종이 한 장을
그대로 보여 주고, 점선이 여백 안쪽의 인쇄 영역입니다.

설정은 범위(전체·현재·사용자 지정), 용지(A3·A4·A5·B4·B5·Letter·Legal·Tabloid), 방향,
위·아래·왼쪽·오른쪽 여백, 크기 조정(용지에 맞춤·실제 크기·비율 지정), 세로 위치, 매수,
바탕색 인쇄 여부입니다. 설정에 따른 인쇄 영역 크기가 아래에 mm로 나옵니다. 그림이 한 장에
안 들어가면 여러 장으로 나누어 줍니다.

### 화면 설정

설정 단추에서 언어, 테마, 글꼴, 새 그림 크기, 바탕 그림, 패널 표시를 바꿉니다. 테마는
밝은 것 20가지, 어두운 것 20가지에 사용자 정의 하나입니다. 확대와 축소는 Ctrl과 마우스
휠로도 됩니다. 바꾼 내용이 있을 때 창을 닫으면 저장할지 물어봅니다.

---

## English

### Installing

Run the setup file you downloaded. The installer speaks Korean and English; pick one on the
first screen. An older MyPaint is removed completely before the new one is copied, and if
saved settings or drawings are found the installer asks whether to delete them too. When it
finishes, `.mpaint` files carry the MyPaint document icon and open in MyPaint.

### Drawing

The tools are at the top of the left panel. Pencil and brush draw while you drag; line,
rectangle and ellipse take their size from the drag. The text tool places text where you
click, and the text itself is edited in the right panel. Fill changes the colour of a shape
or of the canvas, and the picker takes the colour under the pointer.

Pick colours from the swatches, or set the line and fill colours directly. The slider below
them sets the line width. With the select tool, clicking a shape shows its colour, width,
opacity and position in the right panel, dragging moves it, and Delete removes it.

### Picking an area and cutting it out

The rectangle, ellipse and free select tools pick part of the picture. The picked area is
outlined with a dashed line and the right panel names its shape and size.

- **Keep only the picked area** cuts everything else away. With an ellipse or a free outline,
  what falls outside stays transparent.
- **Erase the picked area** paints it with the canvas colour.
- Ctrl+C copies the picked area, Ctrl+X copies and clears it, Ctrl+V pastes it back.

### Tabs

Several drawings stay open as tabs. The × on a tab closes that one, and a tab with unsaved
work asks first. When there are more tabs than fit, the `<` and `>` buttons at both ends move
through them.

### Moving and zooming the picture

A picture smaller than the window sits in the middle. Dragging beside the picture shows a hand
and moves it. Zooming works from the middle of the view, so whatever you were looking at stays
where it was.

### Undo and the clipboard

Ctrl+Z undoes, Ctrl+Y redoes. Ctrl+C, Ctrl+V and Ctrl+X copy, paste and cut; Ctrl+A selects
everything. The right mouse button offers the same commands.

### Photographs and image files

Drop a file on the window and MyPaint asks whether to open it as a new drawing, place it in
the current one, or use it as the workspace background. It reads:

- Common images: PNG, JPEG, GIF, WebP, BMP, ICO, AVIF
- TIFF: every page, 8–16 bit, LZW / PackBits / Deflate / JPEG
- HEIC/HEIF from recent phones
- JPEG 2000: `.jp2`, `.j2k`
- Camera RAW: Canon `.cr2` `.cr3`, Nikon `.nef` `.nrw`, Sony `.arw` `.sr2`, Fujifilm `.raf`,
  Olympus `.orf`, Panasonic `.rw2`, Pentax `.pef`, Samsung `.srw`, Sigma `.x3f`,
  Hasselblad `.3fr`, Phase One `.iiq`, Adobe `.dng` and more than thirty others. MyPaint
  shows the full-size picture the camera stored inside the file and lists the camera and
  lens in the right panel.
- DICOM medical images: `.dcm`, `.dicom`

A TIFF with several pages steps through them with the `<` and `>` buttons in the right panel.

### Downloading from a link

"Download a picture from a link" in the File menu takes an address and opens what comes back.
While it downloads, the bar shows how much has arrived out of the total, and the cancel button
stops it part way. What was downloaded joins the recent list with its address.

### Saving in another format

"Convert to another format" in the File menu writes PNG, JPEG, WebP, BMP, TIFF, GIF, ICO,
JPEG 2000 (.jp2 / .j2k) or DICOM (.dcm), with a quality setting. Whatever is on screen — a
drawing, a photograph or a medical image — is what gets converted.

There is no HEIC or HEIF export. HEVC is patent-encumbered, and no browser and no WebAssembly
package available here can encode it. Reading HEIC works.

### Medical images (DICOM)

Opening a DICOM file adds a medical image panel on the right.

- **Frame**: files with several frames step with `<` and `>`, and the ▶ button plays them.
- **Preset**: CT files offer brain, subdural, stroke, soft tissue, liver, mediastinum, lung
  and bone. "From the file" uses the window written in the file and "Automatic" fits the
  window to the image.
- **Centre (WC) / Width (WW)**: typed in directly.
- **Colour map**: gray, hotiron, pet, hotmetalblue, pet20, jet, rainbow, bone.
- **Invert grey**, **Show overlays**, **VOI LUT**, **Window function** (LINEAR, LINEAR_EXACT,
  SIGMOID).
- **DICOM details**: the patient, study and image summary, and every tag in the file, paged
  with `<` and `>`.

Measuring uses the ordinary drawing tools. Draw a line and the right panel gives its length in
millimetres; draw a rectangle or an ellipse and it gives the mean, standard deviation,
minimum, maximum and area inside it. Moving the pointer over the image reads the value under
it in Hounsfield units.

### Saving and printing

Save writes a `.mpaint` drawing. The export button asks for a format and a quality; "Export
straight to PNG" in the File menu writes a PNG without asking. Up to ten recent files
are kept and can be removed one at a time or all at once. The folders you opened and saved
into come back on the next run.

The print window puts the settings on the left and the preview on the right. The preview is
the sheet that will come out of the printer, with a dashed line marking the printable area
inside the margins.

The settings are the scope (all drawings, the current one, or a page range), the paper (A3,
A4, A5, B4, B5, Letter, Legal, Tabloid), the orientation, the top, bottom, left and right
margins, the scaling (fit to the paper, actual size, or a percentage), the vertical place on
the sheet, the number of copies, and whether the canvas colour is printed. The resulting
printable area is shown in millimetres. A drawing too large for one sheet is split over
several.

### Appearance

The settings button changes the language, theme, font, the size of new drawings, the workspace
background image and which panels are shown. There are twenty light themes, twenty dark ones
and one you define yourself. Ctrl and the mouse wheel zoom. Closing the window with unsaved
changes asks what to do with them.
