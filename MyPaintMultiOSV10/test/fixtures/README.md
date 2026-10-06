# test/fixtures

Pictures the test run opens.

| File | Where it comes from |
|------|---------------------|
| `gradient.tif`, `gray16.tif`, `gradient.bmp`, `gradient.gif` | written by `scripts/make-fixtures.js` |
| `ct-sphere.dcm`, `ct-multiframe.dcm` | written by `scripts/make-fixtures.js` — a synthetic 16-bit CT with Hounsfield rescale, a window, pixel spacing, and eight frames in the second file |
| `ct-no-preamble.dcm`, `ct-no-meta.dcm` | the same CT saved without the Part 10 preamble, once with its file meta group and once without it at all |
| `rgb-odd.dcm`, `rgb-odd-be.dcm` | a 3x3 RGB picture — an odd number of bytes, written as `OW` — in both byte orders; big endian stores it as words, so the samples arrive swapped in pairs |
| `ybr-full.dcm`, `ybr-422.dcm` | the same YBR picture with full chroma and with 4:2:2 subsampling, which halves the samples on disk |
| `float-map.dcm` | Float Pixel Data (7FE0,0008) holding 0..1 with the window width of 1 such files carry, where the integer window formula collapses |
| `frames-plain.dcm`, `frames-deflated.dcm` | two frames stored plainly and with each frame deflated on its own |
| `CT_small.dcm`, `SC_rgb_small_odd.dcm`, `JPEG2000.dcm` | [pydicom](https://github.com/pydicom/pydicom) test files (MIT), anonymised: an explicit VR CT, an RGB secondary capture with odd dimensions, and a JPEG 2000 compressed image |

`npm test` rewrites the generated files, and they are kept in the repository so a checkout
can be looked at without running the generator. The three pydicom files are the originals:
`scripts/make-fixtures.js` does not produce them.
