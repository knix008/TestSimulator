"""Pixel checks for the application and document icons."""

from __future__ import annotations

import hashlib
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"


def _mean_luma(img: Image.Image, cx: int, cy: int, radius: int) -> float:
    px = img.load()
    total = 0.0
    count = 0
    r2 = radius * radius
    w, h = img.size
    for y in range(max(0, cy - radius), min(h, cy + radius + 1)):
        for x in range(max(0, cx - radius), min(w, cx + radius + 1)):
            if (x - cx) ** 2 + (y - cy) ** 2 > r2:
                continue
            r, g, b, a = px[x, y]
            if a < 200:
                continue
            total += 0.2126 * r + 0.7152 * g + 0.0722 * b
            count += 1
    if count < 10:
        raise SystemExit(f"not enough opaque pixels around {cx},{cy}")
    return total / count


def _check_beveled(path: Path, label: str, light_at: tuple[float, float], shade_at: tuple[float, float]) -> None:
    img = Image.open(path).convert("RGBA")
    w, h = img.size
    px = img.load()
    corners = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 1), (1, h // 2)]
    for x, y in corners:
        if px[x, y][3] != 0:
            raise SystemExit(f"{label} border pixel {(x, y)} is not transparent: {px[x, y]}")
    flare = px[int(w * 0.08), int(h * 0.08)]
    if flare[3] != 0:
        raise SystemExit(f"{label} upper-left protrusion is still drawn: {flare}")
    light = _mean_luma(img, int(w * light_at[0]), int(h * light_at[1]), int(w * 0.04))
    shade = _mean_luma(img, int(w * shade_at[0]), int(h * shade_at[1]), int(w * 0.04))
    if light <= shade + 12:
        raise SystemExit(f"{label} background is not lit in 3D ({light:.1f} vs {shade:.1f})")
    print(f"OK transparent_border {label}")
    print(f"OK beveled_background {label} {light:.1f}>{shade:.1f}")


def _check(path: Path, label: str, left_at: tuple[float, float], right_at: tuple[float, float]) -> None:
    img = Image.open(path).convert("RGBA")
    w, h = img.size
    px = img.load()
    corners = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 1), (1, h // 2)]
    for x, y in corners:
        if px[x, y][3] != 0:
            raise SystemExit(f"{label} border pixel {(x, y)} is not transparent: {px[x, y]}")
    # Upper-left of the glyph versus lower-right. App samples sit on the tile, off the weather art.
    left = _mean_luma(img, int(w * left_at[0]), int(h * left_at[1]), int(w * 0.05))
    right = _mean_luma(img, int(w * right_at[0]), int(h * right_at[1]), int(w * 0.05))
    if left <= right + 8:
        raise SystemExit(f"{label} top-left glow too weak ({left:.1f} vs {right:.1f})")
    print(f"OK transparent_border {label}")
    print(f"OK top_left_glow {label} {left:.1f}>{right:.1f}")


def main() -> None:
    app = ASSETS / "icon.png"
    doc = ASSETS / "file.png"
    _check_beveled(app, "app", (0.18, 0.18), (0.84, 0.84))
    _check(doc, "file", (0.36, 0.30), (0.62, 0.58))
    ha = hashlib.sha256(app.read_bytes()).hexdigest()
    hb = hashlib.sha256(doc.read_bytes()).hexdigest()
    if ha == hb:
        raise SystemExit("file icon matches app icon")
    for name in ("icon.ico", "icon.icns", "file.ico", "file.icns"):
        file = ASSETS / name
        if not file.exists() or file.stat().st_size < 100:
            raise SystemExit(f"missing {name}")
    print("OK icons_differ")
    print("OK packaged_formats")


if __name__ == "__main__":
    main()
