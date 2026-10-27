<!-- tour: filters -->
# Image filters · image fusion

## Image filters

Pick a single filter straight from **Tools › Image filters**, or chain several filters in order and adjust their values in the **Filter chain…** window.

![Image filters](images/help-filters.jpg)

| Filter | Description |
| --- | --- |
| Smooth (Gaussian) | Reduces noise — Sigma |
| Sharpen (unsharp mask) | Crisper edges — Amount · Radius |
| Denoise (bilateral) | Removes noise but keeps edges |
| Median | Removes speckle noise — 3×3 · 5×5 |
| Edges (Sobel) · Laplacian | Emphasise edges |
| Emboss | Relief effect |
| Histogram equalisation | Spreads the contrast evenly |
| Invert values · Threshold | Flip values; split into black and white |

- On greyscale images, filters are applied **to the pixel values (HU and so on) before windowing**, so changing W/L does not recompute them. On colour images they are applied to the picture.
- Filters are included in exports, prints and copies. The file itself is never changed. Choose *No filter* to go back.

<!-- tour: fusion -->
## Image fusion (PET/CT)

![Image fusion](images/help-fusion.jpg)

Overlays a second open DICOM image (PET, SPECT, RT dose, MR …) on the current image in a colour map. Open it with **Tools › Image fusion**.

1. Open both the base image (such as CT) and the image to overlay (such as PET).
2. In the base image's tab, open *Image fusion* and choose the **Overlay** image.
3. Adjust the **Colour map · Opacity · Threshold** (values darker than this are transparent).

- When both images have position information, the overlay is **resampled through patient coordinates**; for multi-frame images the frame closest to the current slice is used.
- When position information is missing, or the images are different scans that do not overlap, the overlay is stretched to fit and this is shown.
