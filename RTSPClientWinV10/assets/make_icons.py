"""Regenerate app icons: dark glossy tile + artwork + transparent outer corners."""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ASSETS = Path(__file__).resolve().parent
RAW_CANDIDATES = (
    ASSETS / "icon-source-raw.png",
    Path(r"C:\Users\shkwon\.cursor\projects\d-Home-Projects-TestSimulator-RTSPClientWinV10\assets\icon-source-raw.png"),
    ASSETS / "icon-source.png",
)

# Deep teal-navy tile (reads clearly on light and dark taskbars)
TILE_TOP = (18, 42, 62, 255)
TILE_BOTTOM = (6, 14, 24, 255)
TILE_EDGE = (4, 10, 16, 255)


def load_source() -> Image.Image:
    for p in RAW_CANDIDATES:
        if p.exists():
            return Image.open(p).convert("RGBA")
    raise FileNotFoundError("No icon source PNG found")


def remove_pastel_background(img: Image.Image) -> Image.Image:
    """Key out light pastel fill and soft edge shadows; keep artwork only."""
    arr = np.asarray(img).copy()
    r = arr[:, :, 0].astype(np.int16)
    g = arr[:, :, 1].astype(np.int16)
    b = arr[:, :, 2].astype(np.int16)
    a = arr[:, :, 3].astype(np.int16)

    chroma = np.maximum(np.maximum(r, g), b) - np.minimum(np.minimum(r, g), b)
    lum = (r + g + b) / 3.0

    pastel = (lum >= 200) & (chroma <= 45)
    soft_shadow = (lum < 90) & (chroma < 35) & (a > 0)
    fringe = (lum >= 170) & (chroma <= 50) & (a < 255)

    remove = pastel | soft_shadow | fringe
    arr[remove, 3] = 0
    arr[arr[:, :, 3] == 0, 0:3] = 0

    faint = arr[:, :, 3] < 16
    arr[faint, 3] = 0
    arr[faint, 0:3] = 0

    out = Image.fromarray(arr, mode="RGBA")
    alpha = out.getchannel("A").filter(ImageFilter.MedianFilter(size=3))
    out.putalpha(alpha)
    arr = np.asarray(out).copy()
    arr[arr[:, :, 3] == 0, 0:3] = 0
    return Image.fromarray(arr, mode="RGBA")


def trim_artwork(img: Image.Image) -> Image.Image:
    arr = np.asarray(img)
    alpha = arr[:, :, 3]
    ys, xs = np.where(alpha > 16)
    if len(xs) == 0:
        return img
    return img.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))


def rounded_mask(size: int, pad: int, radius: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((pad, pad, size - pad - 1, size - pad - 1), radius=radius, fill=255)
    return mask.filter(ImageFilter.GaussianBlur(radius=max(1, size // 280)))


def make_dark_tile(size: int, pad: int, radius: int) -> Image.Image:
    """Vertical gradient tile with subtle rim, clipped to rounded rect."""
    yy = np.linspace(0.0, 1.0, size, dtype=np.float32)[:, None, None]

    top = np.array(TILE_TOP[:3], dtype=np.float32).reshape(1, 1, 3)
    bottom = np.array(TILE_BOTTOM[:3], dtype=np.float32).reshape(1, 1, 3)
    rgb = top * (1.0 - yy) + bottom * yy

    # Soft vignette toward edges for depth
    cx = cy = (size - 1) / 2.0
    x = np.arange(size, dtype=np.float32)[None, :]
    y = np.arange(size, dtype=np.float32)[:, None]
    dist = np.sqrt(((x - cx) / cx) ** 2 + ((y - cy) / cy) ** 2)
    vignette = np.clip(1.0 - 0.22 * np.clip(dist - 0.35, 0, None), 0.75, 1.0)
    rgb = rgb * vignette[:, :, None]

    arr = np.zeros((size, size, 4), dtype=np.uint8)
    arr[:, :, 0:3] = np.clip(rgb, 0, 255).astype(np.uint8)
    arr[:, :, 3] = 255
    tile = Image.fromarray(arr, mode="RGBA")

    # Dark rim stroke inside the rounded shape
    rim = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(rim)
    draw.rounded_rectangle(
        (pad + 1, pad + 1, size - pad - 2, size - pad - 2),
        radius=max(1, radius - 1),
        outline=TILE_EDGE,
        width=max(2, size // 180),
    )
    tile = Image.alpha_composite(tile, rim)

    mask = rounded_mask(size, pad, radius)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(tile, (0, 0), mask)
    return out


def add_top_left_gloss(size: int, pad: int, radius: int) -> Image.Image:
    """Specular sheen in the upper-left, like light hitting a glossy tile."""
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    # Origin of the light reflection (inside the rounded tile)
    ox = pad + size * 0.18
    oy = pad + size * 0.16
    # Elliptical falloff stretched toward bottom-right
    dx = (xx - ox) / (size * 0.42)
    dy = (yy - oy) / (size * 0.34)
    dist = np.sqrt(dx * dx + dy * dy)

    # Soft ambient reflection
    ambient = np.clip(1.0 - dist * 0.95, 0.0, 1.0) ** 1.6
    # Tighter specular core
    specular = np.clip(1.0 - dist * 1.55, 0.0, 1.0) ** 3.2
    # Diagonal glass cap (upper half of tile)
    diag = np.clip(0.62 - ((xx / size) * 0.35 + (yy / size) * 0.85), 0.0, 1.0)

    alpha = np.clip(ambient * 110 * diag + specular * 160, 0, 220).astype(np.uint8)
    rgb = np.zeros((size, size, 4), dtype=np.uint8)
    rgb[:, :, 0] = 235
    rgb[:, :, 1] = 245
    rgb[:, :, 2] = 255
    rgb[:, :, 3] = alpha
    gloss = Image.fromarray(rgb, mode="RGBA")
    gloss = gloss.filter(ImageFilter.GaussianBlur(radius=max(3, size // 90)))

    mask = rounded_mask(size, pad, radius)
    clipped = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    clipped.paste(gloss, (0, 0), mask)
    return clipped


def compose_icon(artwork: Image.Image, size: int = 1024) -> Image.Image:
    pad = int(size * 0.07)
    radius = int(size * 0.22)

    base = make_dark_tile(size, pad, radius)
    gloss = add_top_left_gloss(size, pad, radius)
    base = Image.alpha_composite(base, gloss)

    art = trim_artwork(artwork)
    # Brighten artwork slightly so it pops on the dark tile
    art2 = np.asarray(art).copy()
    opaque = art2[:, :, 3] > 16
    art2[opaque, 0:3] = np.clip(art2[opaque, 0:3].astype(np.int16) + 22, 0, 255).astype(np.uint8)
    art2[opaque, 1] = np.clip(art2[opaque, 1].astype(np.int16) + 8, 0, 255).astype(np.uint8)
    art2[opaque, 2] = np.clip(art2[opaque, 2].astype(np.int16) + 10, 0, 255).astype(np.uint8)
    art = Image.fromarray(art2, mode="RGBA")

    max_side = int(size * 0.72)
    scale = min(max_side / art.width, max_side / art.height)
    new_w = max(1, int(art.width * scale))
    new_h = max(1, int(art.height * scale))
    art = art.resize((new_w, new_h), Image.Resampling.LANCZOS)

    x = (size - new_w) // 2
    y = (size - new_h) // 2 + int(size * 0.01)
    base.alpha_composite(art, (x, y))

    # Ensure exterior is fully transparent (zero RGB where alpha=0)
    out = np.asarray(base).copy()
    out[out[:, :, 3] == 0, 0:3] = 0
    return Image.fromarray(out, mode="RGBA")


def main() -> None:
    raw_dst = ASSETS / "icon-source-raw.png"
    src = load_source()
    if raw_dst.exists():
        src = Image.open(raw_dst).convert("RGBA")
    else:
        src.save(raw_dst, format="PNG")

    artwork = remove_pastel_background(src)
    icon = compose_icon(artwork, size=1024)

    png_out = ASSETS / "app.png"
    icon.resize((512, 512), Image.Resampling.LANCZOS).save(png_out, format="PNG")

    sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    ico_path = ASSETS / "app.ico"
    icon.save(ico_path, format="ICO", sizes=sizes)

    (ASSETS / "device-sim.ico").write_bytes(ico_path.read_bytes())
    (ASSETS / "device-sim.png").write_bytes(png_out.read_bytes())
    icon.save(ASSETS / "icon-source.png", format="PNG")

    preview = icon.resize((512, 512), Image.Resampling.LANCZOS)
    pw, ph = preview.size
    cell = 16
    yy, xx = np.mgrid[0:ph, 0:pw]
    chk = ((xx // cell) + (yy // cell)) % 2
    bg = np.zeros((ph, pw, 4), dtype=np.uint8)
    bg[chk == 0] = (200, 200, 200, 255)
    bg[chk == 1] = (240, 240, 240, 255)
    board = Image.fromarray(bg, "RGBA")
    board.alpha_composite(preview)
    board.save(ASSETS / "app-preview-checker.png", format="PNG")

    a = np.asarray(icon)[:, :, 3]
    print(f"Wrote {ico_path} ({ico_path.stat().st_size} bytes)")
    print(f"Wrote {png_out} ({png_out.stat().st_size} bytes)")
    print(f"corner={icon.getpixel((0, 0))} center={icon.getpixel((icon.width // 2, icon.height // 2))}")
    print(f"transparent_px={int((a == 0).sum())} / {a.size}")


if __name__ == "__main__":
    main()
