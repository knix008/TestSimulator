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
| `cine_us_echo_color_120f.dcm` | **Real moving DICOM**: colour-Doppler echocardiogram, 120 frames 640×480, JPEG baseline (YBR_FULL_422), 33.3 ms per frame — pydicom-data `color3d_jpeg_baseline.dcm` |
| `cine_us_echo_30f.dcm` | **Real moving DICOM**: ultrasound echo, 30 frames 320×240, JPEG baseline, 33.3 ms per frame — pydicom test file `examples_ybr_color.dcm` |
| `cine_mr_10f.dcm` | **Real multi-frame DICOM**: MR, 10 frames 64×64, 16-bit, explicit VR — pydicom-data `emri_small.dcm` |
| `cine_heart.dcm` / `cine_phantom.dcm` | Generated cine samples (`scripts/make-samples.mjs`): a beating heart and a moving phantom |
| `sample.mp4` / `sample.webm` / `sample.wav` / `sample.mp3` | A/V |
| `City.webp` | City / aerial sample (useful for miniature / diorama preset) |

The real cine files come from the pydicom project's test data (<https://github.com/pydicom/pydicom> and
<https://github.com/pydicom/pydicom-data>), which is published for testing DICOM readers; they carry no patient data.

> Older `sample.heic` / `sample.heif` were tiny AVIF files mislabeled as HEIC (not real photos). They were replaced with genuine HEVC HEIC/HEIF images.  
> Older `sample.tiff` was a 512×512 synthetic test image; replaced with a real photographic TIFF.

Generated local previews such as `samples/_*.png` are gitignored.

Large sets are gitignored and live only locally: `image-*.dcm` (single big X-ray files) and `ct-lung-screening-nlst-series/`
(a 150-slice chest CT series from the NLST collection, CC BY 4.0 — see its `CITATION.txt`; open the folder to step through
the slices with ← / → and use the DICOM window presets, measurements and annotations on it). `images/` holds the older
test photos that used to be in the project's `images/` folder.
