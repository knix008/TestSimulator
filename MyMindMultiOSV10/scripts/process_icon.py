"""Build app icon: opaque plate + shadows; transparent only outside border."""

from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

SRC = Path(
    r"C:\Users\shkwon\.cursor\projects\c-Home-Projects-TestSimulator-MyMindMultiOSV10\assets\icon-plate.png"
)
ROOT = Path(r"c:\Home\Projects\TestSimulator\MyMindMultiOSV10")


def flood_outside_mask(is_bg: np.ndarray) -> np.ndarray:
    """True for background pixels reachable from image corners."""
    h, w = is_bg.shape
    outside = np.zeros((h, w), dtype=bool)
    q: deque[tuple[int, int]] = deque()

    for y, x in ((0, 0), (0, w - 1), (h - 1, 0), (h - 1, w - 1)):
        if is_bg[y, x]:
            outside[y, x] = True
            q.append((y, x))

    while q:
        y, x = q.popleft()
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < h and 0 <= nx < w and is_bg[ny, nx] and not outside[ny, nx]:
                outside[ny, nx] = True
                q.append((ny, nx))
    return outside


def main() -> None:
    src = Image.open(SRC).convert("RGB")
    w, h = src.size
    assert w == h

    rgb = np.asarray(src).astype(np.float32)
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    luma = 0.2126 * r + 0.7152 * g + 0.0722 * b

    # Outer black canvas only (corner-connected). Never punch holes in plate shadows.
    is_canvas_black = (luma <= 8) & (r <= 8) & (g <= 8) & (b <= 8)
    outside = flood_outside_mask(is_canvas_black)

    alpha = np.where(outside, 0.0, 255.0).astype(np.float32)

    # Soften the outer silhouette edge slightly (does not affect opaque interior).
    edge = Image.fromarray(alpha.astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(radius=0.8))
    soft = np.asarray(edge).astype(np.float32)
    # Keep fully opaque interior: only blend near the transparency boundary
    alpha = np.where(outside, soft, 255.0)

    out_arr = np.dstack([rgb, alpha]).astype(np.uint8)
    out = Image.fromarray(out_arr, "RGBA")

    targets = {
        ROOT / "build" / "icon.png": None,
        ROOT / "public" / "icon.png": None,
        ROOT / "build" / "icons" / "512x512.png": 512,
        ROOT / "build" / "icons" / "256x256.png": 256,
    }

    for path, size in targets.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        img = out if size is None else out.resize((size, size), Image.Resampling.LANCZOS)
        img.save(path, "PNG")

    out.save(SRC.with_name("icon-final.png"), "PNG")
    out.save(
        Path(
            r"C:\Users\shkwon\.cursor\projects\c-Home-Projects-TestSimulator-MyMindMultiOSV10\assets\icon-source.png"
        ),
        "PNG",
    )

    v = np.asarray(Image.open(ROOT / "build" / "icon.png"))
    print("corner alpha", int(v[2, 2, 3]))
    print("center rgba", tuple(int(x) for x in v[h // 2, w // 2]))
    yy, xx = np.mgrid[0:h, 0:w]
    content = (yy - h / 2) ** 2 + (xx - w / 2) ** 2 < (w * 0.38) ** 2
    print("inner transparent holes", int((content & (v[:, :, 3] < 10)).sum()))
    print("outer transparent px", int((v[:, :, 3] < 10).sum()))


if __name__ == "__main__":
    main()
