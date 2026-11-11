<!-- tour: tageditor -->
# DICOM tools

## Edit DICOM tags

**Tools › Edit DICOM tags…** — leaves the original untouched and saves your changes to a **new file**.

![Edit DICOM tags](images/help-tageditor.jpg)

1. Pick an element in the table (elements inside sequences are shown indented). Use the box above to search.
2. Change the value, or use **Add / set**, **Remove this element** or **Restore**.
3. **Save as new file…** — turn on *Open after saving* to open it right away.

<!-- tour: anonymize -->
## Save anonymised copy

![Anonymise](images/help-anonymize.jpg)

**Tools › Save anonymised copy…** — replaces the checked identifying elements (patient name · ID · birth date · institution · physicians · dates and so on) with replacement text, or empties them.

- Elements inside sequences are handled too.
- **Remove all private (odd-group) elements**
- **New study / series / image UIDs** — the same UID within a file is replaced by the same new UID, so the links between them are kept.
- Records Patient Identity Removed = YES and the de-identification method, and saves as `<filename>_anon.dcm`. Pixels are not changed.

## Save as uncompressed DICOM (transcode)

Converts files compressed with JPEG · JPEG 2000 · JPEG-LS · RLE · Deflate to uncompressed Explicit VR Little Endian. YBR colour becomes RGB, and if the compression was lossy, Lossy Image Compression = 01 is recorded. Use it to hand files to other programs that cannot read compressed data.

## Save image as DICOM (Secondary Capture)

Saves the picture as it is shown (including window, colour map, filters and annotations) as a Secondary Capture DICOM. Ordinary image files can be turned into DICOM too.

## Export series as DICOMDIR

**File › Export Image › Export series as DICOMDIR (CD / USB)…** — writes a sorted series (or the open files) as a `DICOMDIR` plus `DICOM/S0001/I0000001 …` folders for CD or USB. On the web it downloads as a ZIP.
