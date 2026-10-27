<!-- tour: export -->
# Export · print · batch convert

Export from the **File › Export Image** menu, the **Export ▾** button on the toolbar, or the right-click menu on the image. The desktop app opens a save dialog; the web version saves as a download.

![Export menu](images/help-export.jpg)

| Item | What you get |
| --- | --- |
| PNG · JPEG · WebP · BMP · TIFF · GIF | Exactly what is on screen (window · colour map · rotation · filters, and annotations if set) |
| Export as | 45 formats — see below |
| 16-bit TIFF | The raw pixel values, unchanged |
| All frames as PNG (ZIP) | Every frame of a multi-frame file |
| Animated GIF | All frames, looping at the fps |
| Cine video (MP4 · WebM) | Frames or a series as a video |
| PDF report | Add a title, subtitle, author, keywords and notes, choose which of patient, study, image details and measurements to include, and get one page with the image (the same window as Print below; also written to the PDF document properties) |
| DICOM (uncompressed) · Secondary Capture | See DICOM tools |
| Measurements (CSV) · DICOM tags (TXT · JSON · CSV) | As tables |
| Export series as DICOMDIR | A file set for CD or USB |
| Copy Image (`Ctrl+C`) | To the clipboard |

<!-- tour: exportas -->
## Export as (all formats)

![Export as](images/help-exportas.jpg)

Pick a format from a group and set its own options (quality, bit depth, compression, lossless, transparency …).

| Group | Formats |
| --- | --- |
| Common | PNG (8/16-bit), APNG, JPEG (progressive), WebP, AVIF (8/10/12-bit), HEIC, JPEG XL, GIF, animated GIF, BMP, TIFF (LZW · Deflate · PackBits, 16-bit · float, multi-page) |
| Professional | JPEG 2000 (.jp2 · .j2k), JPEG-LS, PSD, TGA, DDS, QOI |
| HDR / float | OpenEXR, Radiance HDR, PFM |
| Medical / research volumes | NIfTI (.nii · .nii.gz), Analyze 7.5, MetaImage (.mha · .mhd), NRRD |
| Scientific · documents · icons · classic | FITS · SVG, EPS, PDF · ICO, CUR, ICNS · PCX, PBM · PGM · PPM · PAM, SGI, Sun Raster, XBM, XPM, WBMP, Farbfeld |

- 16-bit, float and medical formats hold the **raw pixel values (HU etc.)**, not the screen picture.
- Multi-page and volume formats hold **all frames or the sorted series** (you can also pick just the current frame). Pixel spacing and slice thickness are recorded too.
- Every format has been checked by reopening it in other programs (Pillow, OpenCV, ffmpeg, pydicom and others).

## Progress window

![Progress](images/help-progress.jpg)

A **progress window** appears while saving, exporting or copying. Jobs with a known count, such as frames, show a bar and a percentage; encoding a single image or writing a file shows a moving bar. It hides while the save dialog is open and comes back as *"Saving …"* while the file is written.

<!-- tour: print -->
## Print

![Print preview](images/help-print.jpg)

**File › Print** (`Ctrl+P`) — the left side previews the page exactly as it will print, and it updates at once as you change the choices on the right.

| Group | Settings |
| --- | --- |
| Document | Title (the file name at first) · Subtitle · Author · Notes (several lines). Keywords too, in the PDF report |
| Include | Patient · Study · Image · Measurements (the number of items in brackets), Date and time created, footer |
| Page | Orientation (Portrait · Landscape), Paper (A4 · Letter · A3 · A5 · B5 · Legal), Margins (Narrow · Normal · Wide), Details layout (1 column · 2 columns) |
| Image | Image size (Fit to page · 90 · 75 · 50%), Image position (Right below the details · Centred in the space left), Border around the image, Black and white |
| Output | Resolution (150 · 200 · 300 dpi), Printer, Copies, Two-sided (Printer setting · One-sided · flip on long edge · flip on short edge) |

**Print** sends the page straight to the chosen printer with the paper, two-sided and black-and-white settings. **System print dialog…** opens the same page in the operating system's print dialog (the browser's print dialog on the web). The page settings and author you pick are kept for the next print and PDF report.

<!-- tour: batch -->
## Batch convert folder

![Batch convert](images/help-batch.jpg)

**File › Batch Convert Folder** — converts the DICOM files in a folder (sub-folders optional) to the chosen format and saves them in a `converted_<format>` folder. You can choose all frames and using the current window / colour map; when it finishes it shows how many succeeded and failed, with a list of the failures.
