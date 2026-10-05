# test/fixtures

Pictures the test run opens.

| File | Where it comes from |
|------|---------------------|
| `gradient.tif`, `gray16.tif`, `gradient.bmp`, `gradient.gif` | written by `scripts/make-fixtures.js` |
| `ct-sphere.dcm`, `ct-multiframe.dcm` | written by `scripts/make-fixtures.js` — a synthetic 16-bit CT with Hounsfield rescale, a window, pixel spacing, and eight frames in the second file |
| `CT_small.dcm`, `SC_rgb_small_odd.dcm`, `JPEG2000.dcm` | [pydicom](https://github.com/pydicom/pydicom) test files (MIT), anonymised: an explicit VR CT, an RGB secondary capture with odd dimensions, and a JPEG 2000 compressed image |

The generated files are rewritten by `npm test`, so only the three pydicom files are kept
in the repository as they are.
