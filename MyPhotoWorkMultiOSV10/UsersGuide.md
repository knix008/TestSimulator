# Users Guide — My Photo Work V1.0

## Starting

- Desktop: `npm start`
- Browser: `npm run dev`, then open http://127.0.0.1:5173

You begin on a 1280×720 transparent canvas. **파일 → 새로 만들기 / File → New** picks
another size or background.

You can also drag images or `.mpw` projects onto the window from the desktop. A
drop onto an untouched document opens it; a drop onto one you have edited places
the images as new layers.

## The window

Four rows sit above the canvas:

| Row | What it holds |
| --- | --- |
| Title bar | The app icon, the document name and size, and the window buttons |
| Menu bar | Every command, grouped: File, Edit, Image, Layer, Type, Select, Filter, 3D, View, Window — then the theme button (click to step, arrow to pick), the language switch, Settings and About |
| Toolbar | The commands you reach for constantly, as icons — with the zoom percentage between the zoom-out and zoom-in buttons — followed by Select subject / Remove background / Generative fill / Harmonize and the foreground–swap–background colours |
| Options bar | The current tool and its own settings, with a one-line reminder of what the tool does |

The tool strip runs down the left edge. Clicking a group that is already active
cycles through its tools, the way a flyout group does.

Menus and every dialog open as **separate windows**. They can be dragged
anywhere, a long menu can overhang the app, and they all close with it. Pressing
a button that opens a dialog raises the one that is already open rather than
making a second.

A menu shows its main commands in one list; a row ending in **▸** stands for a
group — Filter's Blur, Artistic and Sketch, Layer's masks, Image's adjustments
— and opens that group as a small **submenu** beside the row when you hover or
click it, the way Photoshop's menus do. Nothing is dealt into columns any more.

The window cannot be made narrower than **1280 px**, which is what the toolbar
needs to stay on one line with every button showing. The resize handle is the
ribbed corner at the bottom right.

The zoom percentage sits in the toolbar between **축소 / Zoom out** and
**확대 / Zoom in**, where it reads as the number those two buttons are changing.
Clicking it goes back to 100%.

## Tools

### Selecting

| Key | Tool | What it does |
| --- | --- | --- |
| M / Shift+M | Marquee, ellipse | Drag a rectangular or elliptical selection |
| M | Row, column | Click to select a one-pixel row or column |
| L | Lasso | Drag a freehand outline |
| Shift+L | Polygonal lasso | Click corner to corner; Enter or a double-click closes it |
| L | Magnetic lasso | Trace an edge and the outline snaps to it; Edge width sets how far it looks |
| W | Magic wand, quick select | Click to take a similar-coloured area; Tolerance sets how similar |
| W | Object select | One click takes the subject |

Ctrl/Cmd+A selects everything and Ctrl/Cmd+D deselects. **Ctrl/Cmd+Shift+D**
brings the last selection back, which is what to reach for after deselecting by
mistake.

#### Changing a selection you already have

Every entry below is on the **선택 / Select** menu and works on whatever is
selected, whether it was drawn with the marquee, traced with a lasso or taken
with the wand.

| Command | What it does |
| --- | --- |
| **선택 영역 넓히기 / Expand** | Pushes the edge out by the number of pixels you give |
| **선택 영역 좁히기 / Contract** | Pulls it in by the same amount, including where it meets the canvas edge |
| **선택 테두리 / Border** | Replaces the selection with a band straddling its edge — select the outline of a shape rather than the shape |
| **선택 매끄럽게 / Smooth** | Rounds the corners off, fills pinholes and removes single-pixel spurs; the cure for a ragged wand selection |
| **잔물결 / Feather** | Softens the edge so what you do next fades out instead of stopping dead |
| **인접 영역 확장 / Grow** | Spreads into the touching pixels that look like the ones already selected |
| **유사 영역 선택 / Similar** | Takes every pixel of that colour anywhere in the image, connected or not |
| **색상 범위 / Colour range** | Selects by colour alone: everything close to the current foreground colour |

Grow and Similar use the same **Tolerance** as the magic wand, set in Settings.
Colour range has its own tolerance slider, so you can widen or narrow the catch
without leaving the window. All of them can be undone with Ctrl/Cmd+Z.

**선택 / Select** also inverts the selection, finds distractions, and removes the
background in one step.

### Copying, pasting, filling and stroking

These live on the **편집 / Edit** menu.

| Command | Keys | What it does |
| --- | --- | --- |
| **잘라내기 / Cut** | Ctrl/Cmd+X | Takes the selected pixels out of the active layer |
| **복사 / Copy** | Ctrl/Cmd+C | Copies them from the active layer |
| **병합하여 복사 / Copy merged** | Ctrl/Cmd+Shift+C | Copies what the selection shows of the *whole* image, every layer flattened together |
| **붙여넣기 / Paste** | Ctrl/Cmd+V | Drops what was copied in as a new layer |
| **선택 영역 안에 붙여넣기 / Paste into** | — | The same, masked by the current selection, so it only shows inside it |
| **칠 / Fill** | — | Floods the selection with the foreground, background, white or black, at the opacity you choose |
| **선 / Stroke** | — | Draws a line along the edge of the selection, inside it, outside it or centred on it |

A copy also goes to the system clipboard where the browser allows it, so it can
be pasted into another program. With nothing selected, Copy takes the whole
layer. Paste puts the pixels where the selection is, or in the middle of the
document when there is none.

### Painting and retouching

| Key | Tool | What it does |
| --- | --- | --- |
| B | Brush, pencil | Paint. `[` and `]` change the size; Hardness sets the edge |
| B | Colour replace | Repaints the clicked colour with the foreground |
| E | Eraser, background eraser, magic eraser | Erase by stroke, by colour, or a whole area at a click |
| S | Clone stamp | **Alt-click to set the source**, then drag to copy from it |
| J | Spot heal, heal, patch | Blend a blemish away; the patch tool drags a selection onto clean pixels |
| J | Content-aware move | Drag a selection somewhere else and the hole is filled in |
| O | Dodge, burn, sponge | Lighten, darken, or change saturation under the brush |
| — | Blur, sharpen, smudge | Soften, sharpen, or smear where you drag |
| G | Bucket, gradient | Flood-fill, or drag one of five gradient kinds |

### Shapes, paths and type

| Key | Tool | What it does |
| --- | --- | --- |
| P | Pen | Click for corners, drag for curves, Enter to close |
| Shift+P | Curvature pen | Click only; the curve is smoothed for you |
| P | Freeform pen | Draw a path freehand |
| A / Shift+A | Path select, direct select | Move a whole path, or drag its anchors and handles |
| U | Rectangle, rounded rectangle, ellipse, polygon, line, custom | Drag to draw; Shift keeps it regular. Each becomes an editable shape layer |
| T / Shift+T | Type, vertical type | Click, type, then OK |

With a path selected, the options bar can stroke it, fill it, turn it into a
selection, or delete it.

### Crop, measure and view

| Key | Tool | What it does |
| --- | --- | --- |
| C | Crop | Drag a box, Enter to apply, Esc to cancel |
| Shift+C | Perspective crop | Click four corners, Enter to straighten them |
| C | Slice | Drag a region you can export on its own |
| K | Frame | Drag a frame; the layer shows only inside it |
| I | Eyedropper, sampler | Sample a colour, or drop a marker |
| I | Ruler | Drag to measure; the distance and angle appear in the Info panel |
| I | Note, count | Leave a note or a numbered marker |
| H / Space | Hand | Pan |
| R | Rotate view | Drag to turn the view; double-click to straighten it |
| Z | Zoom | Click to zoom in, Alt-click to zoom out |
| X | Swap | Exchange the foreground and background colours |

Ctrl/Cmd+wheel zooms, the wheel or a Space-drag pans.

**보기 / View** turns on the grid and the rulers. The rulers read in document
pixels: a full-height rule at every number, a half-height mark between two of
them, and short marks every tenth.

## Transforming

Ctrl/Cmd+T starts a free transform on the active layer. Drag the corners to
scale, the grip above the box to rotate, or the box itself to move it.

- **Shift** on a corner keeps the aspect ratio; on the rotate grip it snaps to 15°
- **Alt** resizes around the centre
- Dragging a grip past the opposite edge mirrors the layer
- The options bar takes exact width, height and angle, and has its own flip buttons
- **Enter** applies, **Esc** cancels

**이미지 / Image** rotates or flips the whole document; **레이어 / Layer** flips a
single layer.

## Layers

The right-hand panel lists layers top to bottom.

- The eye and the padlock control visibility and editing
- Opacity, fill opacity and the blend mode apply while compositing
- **레이어 / Layer** adds, duplicates, deletes, merges, flattens, groups and ungroups
- **보이는 레이어 병합 / Merge visible** flattens the layers that are switched on and leaves the hidden ones alone; **이미지 병합 / Flatten** takes everything
- **레이어 래스터화 / Rasterize** bakes a text, shape or fill layer down to pixels, after which it paints like any other layer
- **맨 앞으로 / 앞으로 / 뒤로 / 맨 뒤로** move the layer up and down the stack
- Layer styles: drop shadow, stroke, colour overlay, inner and outer glow, bevel
- A layer mask hides part of a layer without deleting it
- **클리핑 마스크 / Clipping mask** makes the layer show only where the layer below it has pixels — the way to confine a texture, a colour wash or an adjustment to the shape underneath it

Beyond ordinary raster layers there are **adjustment**, **fill**, **live text**,
**shape** and **group** layers. An adjustment layer changes everything painted
beneath it and can be switched off at any time.

Dragging a layer out of frame and back does not clip it: the move always
replays from the layer's untouched pixels.

## Smart objects and smart filters

A layer can be made **스마트 오브젝트 / smart object** from 레이어 ▸ 스마트
오브젝트로 변환. What the layer draws at that moment is frozen as an untouched
original, and the document draws from that original every time. Scale it down to
a thumbnail and back up and it comes back sharp, because nothing was ever
resampled twice.

Apply a filter to a smart layer and it does not touch the pixels: it goes onto
the layer's **스마트 필터 / smart filter** stack, listed in the Layers panel.
Each entry has a switch and a strength, and a bin. Turn one off and the image
underneath is exactly what it was. **레이어 래스터화 / Rasterize** bakes the
placement and the whole stack down to plain pixels when you want it permanent.

## Channels

The **채널 / Channels** tab of the right-hand panel shows the picture split into
red, green and blue, and keeps the selections you save.

- **선택 ▸ 선택 영역 저장** keeps the current selection as a named alpha channel.
- **선택 ▸ 선택 영역 불러오기** brings one back, either on its own or combined
  with what is selected: **바꾸기 / 더하기 / 빼기 / 교차**.
- The panel lists what has been saved; clicking a name loads it, and the bin
  next to it throws it away.

Saved selections travel in the `.mpw` file, so a mask you spent time on is still
there tomorrow.

## Transforming further

편집 ▸ 자유 변형 handles scale and rotation. The rest of the Edit menu covers
what it cannot:

| Command | What it does |
| --- | --- |
| **기울이기 / Skew** | Slides the top and bottom, or the sides, past each other |
| **왜곡 / Distort** | Moves each of the four corners on its own, x and y |
| **원근 / Perspective** | Narrows one edge, so the image leans away |
| **뒤틀기 / Warp** | Bends it into one of eleven shapes — arch, bulge, flag, wave, fish and the rest — with a bend slider and two distortion sliders |
| **퍼펫 뒤틀기 / Puppet warp** | Pin the parts that should stay put, drag a pin to move that part. Enter applies, Esc cancels |
| **내용 인식 비율 / Content-aware scale** | Changes the size by carving away the least interesting columns first, so the subject keeps its shape. **피부톤 보호 / Protect skin tones** is on by default and keeps the seams off faces and arms; turn it off for a picture with nobody in it. Every layer is carved with the same seams, so they stay lined up |

### Content-aware scale, and protecting people

Ordinary scaling squashes everything equally. This one looks for the emptiest
column of pixels running top to bottom — a stretch of sky, a flat wall, still
water — takes that out, and repeats until the picture is the width you asked
for. The subject keeps its proportions and the empty parts give way.

Left to itself that goes wrong on a photograph of a person, because it measures
how busy a part of the picture is and skin is smooth: a cheek has less going on
in it than the leaves behind it, so the carving eats the face and leaves the
hedge alone. **피부톤 보호 / Protect skin tones** is the answer and it is on by
default. It recognises skin by its colour rather than by its texture, covers it
out to its outline, and makes the seams go round.

Turn it off for a picture with nobody in it — a landscape, a still life, a
diagram — where there is nothing to protect and the protection can only get in
the way. It already switches itself off in effect for anything greyscale, such
as a black-and-white scan or a DICOM slice, because there is no colour there to
mistake for skin.

Every layer is carved with the same seams, chosen from the flattened picture, so
a stack of layers stays lined up instead of tearing apart.

## Type

문자 ▸ 문자 입력 (or the type tool) opens one window for the whole type layer:

- The text itself, over as many lines as you like.
- **글자 크기 / 행간 / 자간 / 들여쓰기 / 단락 간격** — a blank line starts a new
  paragraph, and the indent applies to the first line of each.
- **정렬**, bold and italic.
- **패스 위의 문자 / Type on a path** — pick a path and the text follows it,
  each character turned to face along the curve.
- **모양 / Shape** and **구부리기 / Bend** warp the finished type into the same
  eleven shapes the layer Warp command uses.

Opening the window with a type layer selected edits that layer rather than
adding another.

## Colour modes, depth and profiles

이미지 ▸ 모드 switches the document between **RGB**, **회색조**, **CMYK** and
**Lab**. The layers themselves stay RGBA; the mode is applied when the document
is composited, so switching back costs nothing and loses nothing.

이미지 ▸ **8비트/채널** and **16비트/채널** set the working depth. At 16 bits,
adjustments are computed at full precision and TIFF is written with sixteen bits
per channel, which is what to use when a photo will be corrected hard or handed
to something else.

이미지 ▸ **색상 프로파일** picks the working space from the four the editor
knows, by the names the ICC standard gives them, and does one of two things:

- **프로파일 지정 / Assign** leaves the numbers alone and changes how they are
  read. Use it when a file arrived untagged and you know what it is.
- **프로파일 변환 / Convert** rewrites the numbers so the colours keep looking
  the same in the new space.

A JPEG that carries an ICC profile is read and its name shown here and in the
image information window, so a photo that looks flat can be explained rather
than guessed at.

## Actions, batches and layer comps

The **액션 / Actions** tab records what you do and plays it back.

1. **기록 시작 / Start recording**, then work as usual: every menu command and
   every window answer is noted.
2. Give it a name and save it. The action is kept with your settings, so it is
   still there next time.
3. **▶** replays it on the open document. Windows do not open during a replay —
   the answers they were given the first time are used again.
4. The layers button next to it runs the action over a folder of files, saving
   each one in the current export format. That needs the desktop app.

**레이어 컴프 / Layer comps** in the same tab remember which layers are showing,
at what opacity and blend mode. Capture as many arrangements as you like and
click one to put it back — the way to keep three versions of a design in one
document.

## Animation and video

The **타임라인 / Timeline** tab builds a frame-by-frame animation.

- Set the layers to what the frame should show, then **프레임 추가**.
- Each frame has its own delay in milliseconds.
- **▶** plays it in the document itself; the square stops it.
- **GIF로 내보내기** writes an animated GIF — encoded by the app, with a palette
  chosen per frame, so no colour is borrowed from the first frame.
- **동영상으로 내보내기** records the frames as a WebM video.

파일 ▸ **동영상 가져오기** samples a video file into twelve evenly spaced frames,
each becoming a layer and a timeline frame, ready to edit or re-export.

## Patterns and brushes

편집 ▸ **패턴 정의** takes the selection — or the whole layer when nothing is
selected — and keeps it as a tile. Defined patterns appear in the 편집 ▸ 칠
window, where choosing one tiles it across the selection instead of flooding it
with a colour. A pattern fill layer repeats it as well.

The Settings window's **브러시 / Brushes** section shapes the tip: **간격**
between dabs, **각도**, **원형률** (below 100 the tip is flattened) and
**분산**, which throws the dabs off the line and turns a stroke into a spray.
Save the current tip under a name and it is one click away afterwards.

## 3D

3D ▸ **돌출(3D)** turns the active layer into a lit solid: the flat artwork
becomes the face, and the depth is built behind it.

- **두께 / Depth** is how far back it goes.
- **X축 / Y축 / Z축 회전** turn it in space.
- **원근 강도** is how strongly the far side shrinks; at 0 the view is flat.
- **조명 X / Y** move the light, which brightens the face turned towards it and
  darkens the sides.

The layer stays editable — paint on it, and the solid is rebuilt from the new
artwork. 3D ▸ **3D 해제** puts it back flat, and 레이어 ▸ 래스터화 bakes the
render into pixels.

## Adjustments and filters

**이미지 / Image** holds brightness/contrast, hue/saturation, Camera Raw,
**Curves**, **Levels**, auto levels, invert and greyscale, and the colour work
below.

| Command | What it is for |
| --- | --- |
| **자동 색상 / Auto colour** | Stretches each of red, green and blue on its own, which pulls a colour cast out of a photo. Auto Levels moves all three together and so keeps the cast |
| **평준화 / Equalize** | Spreads the tones so every brightness is equally common; opens up a flat, hazy image |
| **채널 혼합 / Channel mixer** | Builds each output channel from the three input ones, with a constant. The route to a proper black and white conversion, or to swapping channels outright |
| **선택 색상 / Selective colour** | Shifts the cyan, magenta, yellow and black in one family of colours — the reds, the blues, the neutrals — and leaves the rest alone |
| **그레이디언트 맵 / Gradient map** | Repaints the image from its own brightness, reading a two-colour gradient. Duotones and split-tones come from here |
| **색상 바꾸기 / Replace colour** | Swaps everything close to the foreground colour for another colour, fading out at the edge of the tolerance so no hard rim is left |

**180도 회전 / Rotate 180** and **여백 잘라내기 / Trim** are on the same menu:
Trim crops away the fully transparent border around everything visible, which is
what to run after erasing a background.

- **Curves** edits each channel on a 256×256 grid. Click to add a point, drag to
  move it, double-click to remove it.
- **Levels** sets the input black point, gamma and white point plus the output
  range, with an Auto button that reads them off the layer.

Either can be applied to the layer or added as an adjustment layer.

**필터 / Filter** holds the gallery. The **필터 갤러리 / Filter Gallery** window
has one **tab per group**; the group's filters are a grid of buttons, the two
sliders sit beside them, and the window is a fixed size that never scrolls, so
취소 / Cancel and 적용 / Apply are always where they were. The groups, as the
menu lists them:

- **흐림 / Blur** — Gaussian, motion, box, and radial blur as a spin or a zoom
- **선명 / Sharpen** — sharpen, **unsharp mask** (a threshold, so an edge is
  sharpened and the flat areas are not), high pass
- **노이즈 / Noise** — add noise, **median** (kills speckle), **dust and
  scratches** (a median that only fires where a pixel is far from its
  neighbours, so real detail survives)
- **픽셀화 / Pixelate** — mosaic, crystallize
- **왜곡 / Distort** — liquify, twirl, ripple, wave, spherize, pinch
- **스타일화 / Stylize** — find edges, emboss, solarize
- **렌더 / Render** — clouds, vignette, lens flare
- **기타 / Other** — offset, minimum (spreads the dark), maximum (spreads the light)
- **예술 효과 / Artistic** — oil paint; **뉴럴 / Neural** — skin smoothing

The gallery takes its radius and amount from the last Blur and Sharpen windows
you used, so set those first if the default is too strong.

The generative jobs — content-aware fill, generative expand, generative upscale,
Harmonize, Select Subject, Remove Background, Find Distractions — run on your own
machine. They do not use a cloud model.

**An active selection limits every one of these to the selected pixels of the
active layer.**

## Files

- **열기 / Open** replaces the document with an image or a `.mpw` project
- **이미지 가져오기 / Place** adds a file as a new layer
- **저장 / 다른 이름으로 저장** writes a layered `.mpw` project
- **내보내기 / Export** flattens to PNG, JPG, WebP, AVIF, GIF or TIFF
- **인쇄 / Print** previews the page, then sends it to your printer
- **이미지 정보 / Image information** lists everything known about what is open
- With the slice-select tool, a single slice can be exported on its own

Unsaved changes are confirmed before New, Open, Close, or quitting.

### Opening a photo

파일 ▸ 열기 (Ctrl/Cmd+O), the folder button on the toolbar, and dragging a file
onto the window all do the same thing. You can also drop several files at once:
onto an untouched document they open one after another, and onto a document you
have already edited they arrive as new layers.

The editor reads PNG, JPG, GIF, BMP, WebP, AVIF, TIFF, **HEIC / HEIF** and
**DICOM**, plus its own `.mpw` projects.

### HEIC and HEIF photos

Phones and mirrorless cameras save their full-quality stills as HEIF — `.heic`
on an iPhone, `.heif` elsewhere, `.hif` on Fujifilm bodies. No browser can show
those files, so the editor decodes them itself:

1. 파일 ▸ 열기, pick the `.heic` file, or drag it onto the window.
2. The first HEIC of a session takes a moment longer while the decoder loads —
   about two megabytes, fetched once and then kept for every file after it.
3. The photo opens as a normal raster layer at its full resolution. From there
   every tool, adjustment and filter works exactly as it does on a JPG.

A HEIC holding several frames — a burst, or the stills of a Live Photo — opens
at its **primary** frame, the one the camera shows in its gallery; the image
information window says how many frames the file held.

Saving back to HEIC is not offered: the format's encoder is patent-encumbered
and is not part of the app. Use 내보내기 to write the edited photo as PNG (no
quality loss), TIFF (no quality loss, larger) or JPG.

`images/test04.heic` in the project folder is a sample you can open to try this.
It comes from Nokia's public HEIF conformance set; replace it with a photo from
your own phone whenever you like.

### Exporting, and the transparent background

파일 ▸ 내보내기 (or the download button on the toolbar) opens a small window
with two controls:

- **형식 / Format** — PNG, JPG, WebP, AVIF, GIF or TIFF.
- **투명 배경 유지 / Keep transparent background** — whether the see-through
  parts of the picture stay see-through in the file.

Tick the box and erased areas, a document created on a transparent background
and any layer you have faded are written with their transparency intact. Clear
it and the same picture is laid on a white sheet first, which is what you want
for a photo that will be printed, emailed or put on a white page.

The box only applies to the formats that can actually store transparency: PNG,
WebP, AVIF, GIF and TIFF. Choose **JPG** and the box greys out with a line
explaining why — JPEG has no alpha channel at all, so a JPG is always written on
white, whatever the box says. Nothing about your document changes either way;
only the exported file differs.

Both choices are remembered and are also on the Settings window, where they
decide the format a single slice is exported with.

### Printing

파일 ▸ 인쇄, the printer button on the toolbar, or **Ctrl/Cmd+P**.

One window opens, and it is both the preview and the print dialog — the page as
it will come out, with the settings beside it:

- The **sheet** is drawn to paper proportions with the same 10 mm margin the
  printed page uses, and the picture sits inside it, flattened onto white —
  transparency means nothing on paper.
- **프린터 / Printer** lists the printers this computer has, with the one your
  system calls the default already chosen.
- **용지 방향 / Orientation** starts on the way round that suits the picture:
  landscape for a wide photo, portrait for a tall one. Change it and the sheet
  in the preview turns with it, as the paper will.
- **매수 / Copies** is how many to print.
- **인쇄 / Print** sends the job straight to that printer. **취소 / Cancel**
  closes the window and prints nothing.

The window is a fixed size and never scrolls: the sheet, all three settings and
both buttons are on screen together, and turning the page to landscape shortens
the sheet rather than pushing anything out of reach.

The image is scaled to fill the page inside the margin, keeping its proportions,
so nothing is cropped and nothing is stretched. Only the picture is printed: no
toolbar, no panels, no background.

In a browser there is no way to print except through the browser's own print
dialog, so that one opens instead — it carries its own preview, and the printer
and paper are chosen there. Choosing **Save as PDF** (or **Microsoft Print to
PDF**) in it is the quickest way to get a PDF of the document.

### DICOM (.dcm) medical images

A CT, MR, ultrasound or X-ray study is stored as DICOM, one file per slice. Open
`.dcm` (or `.dicom`) the same way as any other image; files written without an
extension at all are recognised by their contents.

A DICOM file holds measurements rather than screen colours, so the editor does
what a viewer does before it can show anything:

- **Rescale** — the slope and intercept in the file turn stored values into real
  units, such as Hounsfield numbers on a CT.
- **Window** — the centre and width in the file pick the slice of that range the
  screen shows. Files that name no window are windowed from their own data, so
  the whole range is visible; from there, 이미지 ▸ 밝기/대비 or Levels adjusts it
  the way a radiologist's window control would.
- **MONOCHROME1** files, where zero means white, are inverted to match.

Uncompressed studies — implicit and explicit VR, little and big endian — and
baseline JPEG are read. A study compressed with JPEG 2000, JPEG-LS or RLE is
named in the error rather than opened as a blank image. Colour (RGB) images,
such as an ultrasound capture, keep their colour; multi-frame files open at
their first frame.

Everything the file says about the patient, the study and the equipment is in
the image information window, described below. `images/test05.dcm` is a sample
CT slice you can open to try this — one of the DICOM standard's own
"CompressedSamples" study files, as redistributed for conformance testing.

Saving back to DICOM is not offered — the editor is a photo editor, and a slice
you have painted on is no longer a record of anything. Export to PNG or TIFF
instead.

### Image information

이미지 ▸ 이미지 정보, or the ⓘ button on the toolbar, opens a window with four
blocks of facts about what is open:

- **파일 / File** — the name it was opened from, where it lives on disk, the
  format and the size of the file.
- **이미지 / Image** — the pixel size, the megapixel count, the aspect ratio,
  the colour mode, how many layers there are and what the background is.
- **픽셀 / Pixels** — measured from the flattened document as it stands now, not
  from the file: the mean R, G and B, the mean brightness, the range from the
  darkest pixel to the lightest, and how much of the picture is fully or partly
  see-through. Watching the range while you work is the quickest way to see
  whether an adjustment has crushed the blacks or blown the highlights.
- **상세 정보 / Details** — whatever the file's own header carried. A photo from
  a camera shows its EXIF: the camera and lens, the date it was taken, the
  exposure, aperture, ISO and focal length, the metering and white balance. A
  PNG shows its bit depth and colour type. A DICOM shows its tags — modality,
  study and series, the patient, the equipment, the slice thickness and pixel
  spacing, the transfer syntax and the window that was applied. A file that
  carries nothing says so rather than showing invented values.

**내용 복사 / Copy details** puts the whole window on the clipboard as plain
text, which is what to paste into a note or a bug report.

The window reads the document as it is at the moment it opens, so close and
reopen it after an edit to see the new numbers.

## Settings, the guide and About

The right-hand panel has twenty-five tabs — 레이어, 속성, 조정, 작업 내역, 채널,
패스, 탐색기, 정보, 색상, 색상 견본, 그레이디언트, 패턴, 스타일, 모양, 브러시, 복제
원본, 도구 사전 설정, 문자, 단락, 글리프, 액션, 레이어 컴프, 타임라인, 측정 로그
and 메모 — laid out three to a row at the top of the panel, all of them
visible; the panel scrolls as one. The 창 / Window menu switches between them,
and so does clicking a tab.

The theme control at the right-hand end of the menu bar is two buttons in one:
clicking the wide half **steps to the next theme** — its tooltip names the one
coming up — and the arrow beside it opens the full list of twenty to pick from.

The right-hand end of the menu bar holds the theme control, the language switch
(Korean / English) and the Settings and About windows. The guide you are reading
is on the 창 / Window menu, at the bottom.

Settings is a preferences window on five tabs, each split into titled
sections, tall enough that no tab scrolls:

- **일반 / General** — language and the number of history states; the theme,
  four swatches to a row; shortcuts to the Keyboard Shortcuts and Neural Models
  windows, a button that clears the recent files list, and the WebGPU switch
  for the neural models.
- **보기 / View** — what is shown (rulers, grid, guides, pixel grid, smart
  guides, slices, notes, paths, extras, pattern preview), the snap settings
  (snap, to guides, to grid, lock guides), the ruler units, the panel width,
  proof colours and the gamut warning.
- **도구 / Tools** — the selection defaults (mode, feather, anti-alias,
  contiguous, sample all layers) and the sampling and fill settings (tolerance,
  eyedropper sample size, aligned clone, impressionist pattern stamp).
- **브러시 / Brush** — the tip defaults (size, hardness, opacity, spacing,
  angle, roundness, scatter) and the saved brushes.
- **내보내기 / Export** — the format and the transparent-background setting.

Each number has a decrease and an increase button. **기본 설정으로 되돌리기 /
Reset to defaults** (bottom left) puts every setting in the window back to its
default; what you have made — brushes, gradients, swatches, shapes, tool
presets, styles, workspaces, actions — and the recent files list are kept, and
so is the language.

About lists the version, build time, commit, author, licence, the Electron and
Chromium versions and the platform — and copies all of it in one click, which is
the quickest way to describe your setup in a bug report.

## When something goes wrong

Any failure opens a window naming what was being done and showing the full
detail: the error, its stack, the document, the tool and the environment. The
text is selectable, and **내용 복사 / Copy details** puts all of it on the
clipboard.

## Photoshop's way of working

Everything in the Photoshop menus has a row here of the same name, so the guide
only lists what behaves differently from the older release.

- **Selections combine.** Shift adds, Alt subtracts and Shift+Alt intersects with
  every selection tool, or pick the mode in the option bar; feather and
  anti-alias are there too. The Quick Selection brush grows into similar pixels as
  you drag; the Object Selection tool takes a box and keeps what stands out from
  its rim; Select ▸ Sky, Focus Area and Select and Mask do what their names say.
- **Masks are painted.** Click the mask thumbnail in the Layers panel (or make a
  mask) and the brushes, gradient and fill write into the mask — white reveals,
  black hides — until you click the layer thumbnail again. Layer ▸ Layer Mask
  has disable, invert, apply and delete. Q enters Quick Mask.
- **Windows preview live.** Every adjustment and filter window shows its effect
  on the picture as you move the sliders; Cancel puts it back.
- **History.** The History panel lists every state with the tool or command that
  made it; click one to go back. Camera makes a named snapshot. The circle beside
  a state makes it the History Brush source.
- **Layer styles.** Layer ▸ Layer Style (or double-click a layer) opens all ten
  effects with their settings; save one as a style and re-apply it from the
  Styles panel.
- **Guides.** Drag out of a ruler to make one, drag it back to remove it; View ▸
  New Guide, New Guide Layout, Lock Guides, and Snap to guides and grid.
- **Documents.** Open several; tabs above the picture switch between them
  (Ctrl+Tab). Edit Smart Object Contents opens the original in its own tab and
  Save writes it back.
- **PSD.** Open and Save as PSD keep layers, groups, masks, opacity and blend
  modes; text, styles and smart objects travel as their rendered pixels.
- **Liquify** is a brush: choose forward warp, twirl, pucker, bloat, reconstruct,
  freeze or thaw in the option bar, then Enter applies and Esc cancels.
- **Menus fold.** A menu shows its main commands; a row with a ▸ opens a
  submenu beside it when you hover or click it, the way Photoshop's do.
- **The picture-analysis commands are real, and run on this machine.**
  Photomerge and Auto-Align match features between frames and warp each into
  place (rotation and perspective included); Auto-Blend fades each layer at its
  edge; Merge to HDR fuses the exposures; Content-Aware Fill, Generative Fill
  and the Remove tool rebuild a hole from the texture around it (PatchMatch);
  Harmonize re-solves a pasted layer's colours so its edge meets the background
  (Poisson blending); Object Selection and Select Subject cut the object out with
  GrabCut; Crop & Straighten finds each print on a scanned page and opens it
  upright in its own tab. The first of these you use loads OpenCV (a moment's
  pause); nothing is downloaded and nothing leaves the computer.
- **Vanishing Point clones in perspective.** Define the plane with four
  clicks, press S for the Clone Stamp, Alt-click a source on the plane and
  paint: what you clone shrinks and leans with the plane. Apply still pastes the
  clipboard into the plane.
- **Neural models, if you want them.** Edit ▸ Neural Models… lists the
  networks the app can use — subject cut-out (U²-Net, Silueta, ISNet), sky
  (SegFormer), depth (Depth Anything V2), object removal (LaMa) and
  super-resolution (Swin2SR) — with their sizes and licences. Download one and
  Select Subject, Remove Background, Object Selection, Select Sky, Sky
  Replacement, Depth Blur, Generative Fill, the Remove tool, Super Zoom and
  Generative Upscale use it from then on; without it they use the classical
  method described above. The weights are fetched once from their public
  repositories, kept on this computer and run on it (all CPU cores; WebGPU is a
  checkbox in the same window). Nothing you edit leaves the machine.
- **Neural Filters' skin smoothing, colorize and restore** remain algorithms
  and say so.

## Keyboard

| Keys | Action |
| --- | --- |
| Ctrl/Cmd+N / O / S / Shift+S | New, Open, Save, Save As |
| Ctrl/Cmd+P | Open the print preview |
| Ctrl/Cmd+Z / Shift+Z or Y | Undo, Redo |
| Ctrl/Cmd+A / D | Select all, Deselect |
| Ctrl/Cmd+Shift+D | Reselect what was just deselected |
| Ctrl/Cmd+X / C / V | Cut, Copy, Paste |
| Ctrl/Cmd+Shift+C | Copy merged — every layer, flattened |
| Ctrl/Cmd+T | Free transform |
| Delete / Backspace | Clear the selected pixels |
| Enter | Apply a crop, a transform, or close a path or lasso |
| Esc | Cancel whatever is in progress |
| `[` `]` | Brush size |
| X | Swap the foreground and background colours |
| Space | Pan with any tool held |
