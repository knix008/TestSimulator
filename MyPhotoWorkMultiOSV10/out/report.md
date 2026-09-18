# Image verification run

- Run: 2026-09-18T09:14:19.299Z (47.2s)
- Source images: 5, from `images/`
- Files produced: 75
- Result: **every assertion passed**

Each source image is opened through the real decoder, composited, exported to
every format both with and without a transparent background, then put through
the 3D, warp, content-aware scale, animation, 16-bit and pattern paths and
finally the print preview and the printable page. The files below are what
came out; `index.html` shows the pictures side by side.

## test01.jpg

| File | What it shows | Size |
| --- | --- | --- |
| `test01-composite.png` | the document as the editor composites it | 626 kB |
| `test01.png` | exported as PNG | 626 kB |
| `test01.jpg` | exported as JPG | 93 kB |
| `test01.webp` | exported as WEBP | 102 kB |
| `test01.tiff` | exported as TIFF | 2117 kB |
| `test01-transparent.png` | exported with the transparent-background box ticked | 611 kB |
| `test01-opaque.png` | exported with that box cleared — the hole filled in | 611 kB |
| `test01-3d.png` | extruded through the 3D renderer | 518 kB |
| `test01-warp.png` | bent with the arch warp | 698 kB |
| `test01-carved.png` | content-aware scaled to 80% width | 552 kB |
| `test01.gif` | a two-frame animation, colour and greyscale | 546 kB |
| `test01-16bit.tif` | exported at 16 bits a channel | 4232 kB |
| `test01-pattern.png` | a tile cut from the middle and laid back out | 25 kB |
| `test01-print.html` | the page handed to the printer | 836 kB |
| `test01-preview.jpg` | the preview sheet the print window shows | 82 kB |

## test02.jpg

| File | What it shows | Size |
| --- | --- | --- |
| `test02-composite.png` | the document as the editor composites it | 1064 kB |
| `test02.png` | exported as PNG | 1064 kB |
| `test02.jpg` | exported as JPG | 131 kB |
| `test02.webp` | exported as WEBP | 117 kB |
| `test02.tiff` | exported as TIFF | 5692 kB |
| `test02-transparent.png` | exported with the transparent-background box ticked | 1046 kB |
| `test02-opaque.png` | exported with that box cleared — the hole filled in | 1046 kB |
| `test02-3d.png` | extruded through the 3D renderer | 944 kB |
| `test02-warp.png` | bent with the arch warp | 1305 kB |
| `test02-carved.png` | content-aware scaled to 80% width | 988 kB |
| `test02.gif` | a two-frame animation, colour and greyscale | 957 kB |
| `test02-16bit.tif` | exported at 16 bits a channel | 11382 kB |
| `test02-pattern.png` | a tile cut from the middle and laid back out | 60 kB |
| `test02-print.html` | the page handed to the printer | 1419 kB |
| `test02-preview.jpg` | the preview sheet the print window shows | 69 kB |

## test03.jpg

| File | What it shows | Size |
| --- | --- | --- |
| `test03-composite.png` | the document as the editor composites it | 380 kB |
| `test03.png` | exported as PNG | 380 kB |
| `test03.jpg` | exported as JPG | 54 kB |
| `test03.webp` | exported as WEBP | 63 kB |
| `test03.tiff` | exported as TIFF | 781 kB |
| `test03-transparent.png` | exported with the transparent-background box ticked | 362 kB |
| `test03-opaque.png` | exported with that box cleared — the hole filled in | 361 kB |
| `test03-3d.png` | extruded through the 3D renderer | 285 kB |
| `test03-warp.png` | bent with the arch warp | 368 kB |
| `test03-carved.png` | content-aware scaled to 80% width | 312 kB |
| `test03.gif` | a two-frame animation, colour and greyscale | 318 kB |
| `test03-16bit.tif` | exported at 16 bits a channel | 1560 kB |
| `test03-pattern.png` | a tile cut from the middle and laid back out | 93 kB |
| `test03-print.html` | the page handed to the printer | 507 kB |
| `test03-preview.jpg` | the preview sheet the print window shows | 47 kB |

## test04.heic

| File | What it shows | Size |
| --- | --- | --- |
| `test04-composite.png` | the document as the editor composites it | 1138 kB |
| `test04.png` | exported as PNG | 1138 kB |
| `test04.jpg` | exported as JPG | 217 kB |
| `test04.webp` | exported as WEBP | 178 kB |
| `test04.tiff` | exported as TIFF | 3601 kB |
| `test04-transparent.png` | exported with the transparent-background box ticked | 1098 kB |
| `test04-opaque.png` | exported with that box cleared — the hole filled in | 1098 kB |
| `test04-3d.png` | extruded through the 3D renderer | 856 kB |
| `test04-warp.png` | bent with the arch warp | 1003 kB |
| `test04-carved.png` | content-aware scaled to 80% width | 1016 kB |
| `test04.gif` | a two-frame animation, colour and greyscale | 1177 kB |
| `test04-16bit.tif` | exported at 16 bits a channel | 7200 kB |
| `test04-pattern.png` | a tile cut from the middle and laid back out | 94 kB |
| `test04-print.html` | the page handed to the printer | 1517 kB |
| `test04-preview.jpg` | the preview sheet the print window shows | 85 kB |

## test05.dcm

| File | What it shows | Size |
| --- | --- | --- |
| `test05-composite.png` | the document as the editor composites it | 119 kB |
| `test05.png` | exported as PNG | 119 kB |
| `test05.jpg` | exported as JPG | 34 kB |
| `test05.webp` | exported as WEBP | 15 kB |
| `test05.tiff` | exported as TIFF | 1025 kB |
| `test05-transparent.png` | exported with the transparent-background box ticked | 117 kB |
| `test05-opaque.png` | exported with that box cleared — the hole filled in | 117 kB |
| `test05-3d.png` | extruded through the 3D renderer | 92 kB |
| `test05-warp.png` | bent with the arch warp | 160 kB |
| `test05-carved.png` | content-aware scaled to 80% width | 106 kB |
| `test05.gif` | a two-frame animation, colour and greyscale | 200 kB |
| `test05-16bit.tif` | exported at 16 bits a channel | 2048 kB |
| `test05-pattern.png` | a tile cut from the middle and laid back out | 2 kB |
| `test05-print.html` | the page handed to the printer | 159 kB |
| `test05-preview.jpg` | the preview sheet the print window shows | 24 kB |
