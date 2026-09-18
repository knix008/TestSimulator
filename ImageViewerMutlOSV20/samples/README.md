# Sample media files

| File | Notes |
|------|--------|
| `sample.jpg` / `sample.png` / … | Common image formats |
| `sample.tiff` | Real photo TIFF (800×600, LZW) — from `sample.jpg` |
| `sample.heic` | Real HEIC photo (1440×960, HEVC) — for decoder tests |
| `sample.heif` | Real HEIF photo (1280×854, HEVC) — for decoder tests |
| `sample.dcm` | DICOM (CT, 256×256, 12-bit, no window in the file → auto window) |
| `CT_small.dcm` | DICOM CT 128×128, signed 16-bit, Rescale → HU, pixel spacing + orientation (pydicom test file) |
| `MR_small.dcm` / `MR000000.dcm` | DICOM MR 64×64 / 512×512 with file windows, sagittal orientation (`MR000000`) |
| `JPEG2000.dcm` | DICOM NM 256×1024, JPEG 2000 transfer syntax, lossy-compression tags |
| `SC_rgb_small_odd.dcm` | DICOM RGB secondary capture, 3×3 |
| `sample.mp4` / `sample.webm` / `sample.wav` / `sample.mp3` | A/V |
| `City.webp` | City / aerial sample (useful for miniature / diorama preset) |

> Older `sample.heic` / `sample.heif` were tiny AVIF files mislabeled as HEIC (not real photos). They were replaced with genuine HEVC HEIC/HEIF images.  
> Older `sample.tiff` was a 512×512 synthetic test image; replaced with a real photographic TIFF.

Generated local previews such as `samples/_*.png` are gitignored.

Large sets are gitignored and live only locally: `image-*.dcm` (single big X-ray files) and `ct-lung-screening-nlst-series/`
(a 150-slice chest CT series from the NLST collection, CC BY 4.0 — see its `CITATION.txt`; open the folder to step through
the slices with ← / → and use the DICOM window presets, measurements and annotations on it). `images/` holds the older
test photos that used to be in the project's `images/` folder.
