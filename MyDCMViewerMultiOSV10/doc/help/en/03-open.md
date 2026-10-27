<!-- tour: samples -->
# Opening files

## Ways to open

| Method | Description |
| --- | --- |
| File › Open File (`Ctrl+O`) | Opens a single file |
| File › Open Folder (`Ctrl+Shift+O`) | Opens a folder in the tree; click a file once to open it |
| File › Open DICOMDIR | Opens the `DICOMDIR` on a CD, DVD or USB stick |
| Drag and drop | Drop a file or folder onto the window |
| Double-click in Explorer | If you registered MyDCMViewer as the *default program for DICOM files* during installation, `.dcm` files open in MyDCMViewer. If it is already running, they open in that window |
| Recent Files · Recent Folders | In the File menu and on the start page |

## Supported formats

| Category | Formats |
| --- | --- |
| DICOM | `.dcm` `.dicm` `.dicom`, files without an extension, datasets without file meta information — recognised by their content |
| Transfer syntax | Uncompressed (Little / Big Endian), Deflated, RLE, JPEG Baseline · Extended · Lossless · Process 6/10, JPEG-LS, JPEG 2000, HTJ2K, Deflated Image Frame, **MPEG-4 AVC (H.264) · HEVC · MPEG-2 video** |
| Image types | MONOCHROME1/2, RGB, YBR (including 422), PALETTE COLOR, 8 to 32 bits · floating point, multi-frame, Enhanced (Functional Groups), Modality · VOI · Presentation LUT, overlays |
| Documents | Structured reports (SR), waveforms (ECG), encapsulated PDF · CDA, RT structure · plan · dose, DICOMDIR |
| Pictures | JPEG, PNG, GIF, WebP, AVIF, BMP, ICO, SVG, TIFF (multi-page · 16-bit), HEIF/HEIC, JPEG 2000 |
| Archives | ZIP — browsed like a read-only folder |

## DICOMDIR

![DICOMDIR](images/help-dicomdir.jpg)

The list is shown as patient › study › series. Click **Load as series** to open that series so you can step through it with the series bar.

## Sorting a folder into series

After opening a folder, click **Cine › Sort folder as DICOM series** (or the button in the Series panel). It reads every DICOM header, groups the files by Series Instance UID and sorts them by Instance Number and slice position. Sorted series are used for MPR, 3D and synchronised scrolling.
