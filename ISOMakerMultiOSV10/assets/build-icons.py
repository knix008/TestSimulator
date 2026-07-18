"""Resize icon-master.png into app/installer sizes. Ensures outside of the rounded frame is transparent."""

from __future__ import annotations

import shutil
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

root = Path(__file__).resolve().parent


def make_outside_transparent(img: Image.Image) -> Image.Image:
    """Keep a rounded-rect content frame; set exterior pixels to alpha 0."""
    arr = np.array(img.convert('RGBA'))
    h, w = arr.shape[:2]
    alpha = arr[:, :, 3]
    already = (alpha < 10).mean() > 0.12

    visited = np.zeros((h, w), dtype=bool)
    if already:
        visited = alpha < 10
    else:
        rgb = arr[:, :, :3].astype(np.float32)
        corners = [
            rgb[0, 0],
            rgb[0, w - 1],
            rgb[h - 1, 0],
            rgb[h - 1, w - 1],
            rgb[5, 5],
            rgb[5, w - 6],
            rgb[h - 6, 5],
            rgb[h - 6, w - 6],
        ]
        bg = np.median(np.stack(corners), axis=0)
        similar = np.linalg.norm(rgb - bg, axis=2) <= 45.0
        q: deque[tuple[int, int]] = deque()
        for x in range(w):
            for y in (0, 1, 2, h - 1, h - 2, h - 3):
                if similar[y, x]:
                    visited[y, x] = True
                    q.append((x, y))
        for y in range(h):
            for x in (0, 1, 2, w - 1, w - 2, w - 3):
                if similar[y, x] and not visited[y, x]:
                    visited[y, x] = True
                    q.append((x, y))
        while q:
            x, y = q.popleft()
            for nx, ny in (
                (x - 1, y),
                (x + 1, y),
                (x, y - 1),
                (x, y + 1),
                (x - 1, y - 1),
                (x + 1, y - 1),
                (x - 1, y + 1),
                (x + 1, y + 1),
            ):
                if 0 <= nx < w and 0 <= ny < h and not visited[ny, nx] and similar[ny, nx]:
                    visited[ny, nx] = True
                    q.append((nx, ny))

    ys, xs = np.where(~visited if not already else alpha > 128)
    if len(xs) == 0:
        ys, xs = np.where(alpha > 128)
    if len(xs) == 0:
        return Image.fromarray(arr)

    pad = 2 if already else 4
    x0 = max(0, int(xs.min()) - pad)
    y0 = max(0, int(ys.min()) - pad)
    x1 = min(w - 1, int(xs.max()) + pad)
    y1 = min(h - 1, int(ys.max()) + pad)
    radius = int(min(x1 - x0, y1 - y0) * 0.18)

    mask = Image.new('L', (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(radius=1.2))
    mask_arr = np.array(mask)

    out = arr.copy()
    if already:
        # Preserve existing soft alpha; only force exterior to 0
        out[:, :, 3] = np.minimum(alpha, mask_arr)
        out[visited, 3] = 0
    else:
        out[:, :, 3] = mask_arr
        out[visited, 3] = 0
    return Image.fromarray(out)


def fit(img: Image.Image, size: int) -> Image.Image:
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    im = img.copy()
    im.thumbnail((size, size), Image.Resampling.LANCZOS)
    x = (size - im.width) // 2
    y = (size - im.height) // 2
    canvas.paste(im, (x, y), im)
    return canvas


master = make_outside_transparent(Image.open(root / 'icon-master.png'))
master.save(root / 'icon-master.png', optimize=True)
print('updated icon-master.png with transparent exterior')

for s in [16, 24, 32, 48, 64, 128, 256, 512, 1024]:
    fit(master, s).save(root / f'icon-{s}.png', optimize=True)
    print('wrote', f'icon-{s}.png')

fit(master, 512).save(root / 'icon.png', optimize=True)
fit(master, 256).save(root / 'app.png', optimize=True)
fit(master, 256).save(root / 'installer.png', optimize=True)

ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
fit(master, 256).save(root / 'icon.ico', format='ICO', sizes=ico_sizes)
print('wrote icon.ico')

public = root.parent / 'public'
public.mkdir(exist_ok=True)
shutil.copy2(root / 'icon.ico', public / 'favicon.ico')
shutil.copy2(root / 'icon-32.png', public / 'icon-32.png')
shutil.copy2(root / 'icon-256.png', public / 'icon-256.png')
print('mirrored favicons to public/')
