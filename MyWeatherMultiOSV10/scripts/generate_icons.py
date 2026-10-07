"""Generate the MyWeather application icon and document icon.

The application icon is one rounded sky tile, lit from the upper left so the
background itself has depth. The sun uses the same short radial rays as the
weather picture, and the cloud is wide and low. The canvas edge stays
transparent. The document icon is a separate glossy page.
"""

from __future__ import annotations

import math
import struct
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets"
SIZE = 512


def _light_dir() -> tuple[float, float, float]:
    lx, ly, lz = -0.55, -0.62, 0.56
    length = math.sqrt(lx * lx + ly * ly + lz * lz)
    return lx / length, ly / length, lz / length


def _shade(nx: float, ny: float, nz: float, base: tuple[int, int, int], light: tuple[float, float, float]) -> tuple[int, int, int, int]:
    lx, ly, lz = light
    diff = max(0.0, nx * lx + ny * ly + nz * lz)
    # Ambient is low so the top-left key light reads clearly.
    ambient = 0.18
    intensity = ambient + diff * 0.95
    spec = max(0.0, nx * lx + ny * ly + nz * lz) ** 28
    r = min(255, int(base[0] * intensity + 255 * spec))
    g = min(255, int(base[1] * intensity + 245 * spec))
    b = min(255, int(base[2] * intensity + 220 * spec))
    return r, g, b, 255


def draw_sphere(img: Image.Image, cx: int, cy: int, radius: int, base: tuple[int, int, int]) -> None:
    px = img.load()
    light = _light_dir()
    r2 = radius * radius
    for y in range(cy - radius, cy + radius + 1):
        dy = y - cy
        for x in range(cx - radius, cx + radius + 1):
            dx = x - cx
            if dx * dx + dy * dy > r2:
                continue
            nx = dx / radius
            ny = dy / radius
            nz = math.sqrt(max(0.0, 1.0 - nx * nx - ny * ny))
            px[x, y] = _shade(nx, ny, nz, base, light)


def add_glow(img: Image.Image, cx: int, cy: int, radius: int) -> None:
    """Soft upper-left shine, kept inside the canvas and off the outer edge."""
    glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow)
    gx = cx - int(radius * 0.38)
    gy = cy - int(radius * 0.42)
    gr = int(radius * 0.42)
    draw.ellipse((gx - gr, gy - gr, gx + gr, gy + gr), fill=(255, 252, 235, 210))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=max(2, radius // 10)))
    img.alpha_composite(glow)


def _clear_margin(img: Image.Image, pad: int) -> None:
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            if x < pad or y < pad or x >= w - pad or y >= h - pad:
                px[x, y] = (0, 0, 0, 0)


def _tile_mask(margin: int, radius: int) -> Image.Image:
    mask = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (margin, margin, SIZE - margin - 1, SIZE - margin - 1),
        radius=radius,
        fill=255,
    )
    return mask


def _mix(a: tuple[int, int, int], b: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return tuple(int(a[i] * (1 - t) + b[i] * t) for i in range(3))


def draw_sky_tile(img: Image.Image, margin: int = 56, radius: int = 104) -> Image.Image:
    """One rounded sky. Upper left is lit, lower right falls away. No frame."""
    mask = _tile_mask(margin, radius)
    tile = Image.new("RGBA", img.size, (0, 0, 0, 0))
    px = tile.load()
    mp = mask.load()
    x0, y0 = margin, margin
    x1, y1 = SIZE - margin - 1, SIZE - margin - 1
    span = max(x1 - x0, 1)
    light = (186, 224, 255)
    mid = (78, 170, 236)
    deep = (32, 118, 206)
    rim = 28
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if mp[x, y] == 0:
                continue
            t = min(1.0, max(0.0, ((x - x0) / span) * 0.42 + ((y - y0) / span) * 0.72))
            color = _mix(light, mid, t * 2) if t < 0.5 else _mix(mid, deep, (t - 0.5) * 2)
            edge = min(x - x0, y - y0, x1 - x, y1 - y)
            if edge < rim:
                toward_light = -(((x - x0) / span) - 0.5 + ((y - y0) / span) - 0.5)
                lift = toward_light * (1 - edge / rim) * 36
                color = tuple(min(255, max(0, int(channel + lift))) for channel in color)
            px[x, y] = (*color, 255)
    sheen = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(sheen).ellipse((margin + 8, margin - 10, margin + 250, margin + 210), fill=(255, 255, 255, 78))
    sheen = sheen.filter(ImageFilter.GaussianBlur(radius=22))
    sheen.putalpha(ImageChops.multiply(sheen.getchannel("A"), mask))
    tile.alpha_composite(sheen)
    img.alpha_composite(tile)
    return mask


def _round_line(draw: ImageDraw.ImageDraw, x0: float, y0: float, x1: float, y1: float, width: int, color: tuple[int, int, int, int]) -> None:
    draw.line((x0, y0, x1, y1), fill=color, width=width)
    radius = width / 2
    draw.ellipse((x0 - radius, y0 - radius, x0 + radius, y0 + radius), fill=color)
    draw.ellipse((x1 - radius, y1 - radius, x1 + radius, y1 + radius), fill=color)


def draw_weather(img: Image.Image) -> None:
    """Centered sun with the app's radial rays, and a wide, low cloud in front."""
    art = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(art)
    sx, sy, disk = 256, 176, 50
    ray = (255, 183, 3, 255)
    for index in range(8):
        angle = index * math.pi / 4
        inner, outer = 74, 112
        _round_line(
            d,
            sx + math.cos(angle) * inner,
            sy + math.sin(angle) * inner,
            sx + math.cos(angle) * outer,
            sy + math.sin(angle) * outer,
            11,
            ray,
        )
    d.ellipse((sx - disk, sy - disk, sx + disk, sy + disk), fill=(255, 209, 92, 255))
    img.alpha_composite(art)
    shine = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(shine).ellipse((sx - 22, sy - 30, sx + 2, sy - 8), fill=(255, 244, 204, 200))
    img.alpha_composite(shine.filter(ImageFilter.GaussianBlur(radius=3)))
    cloud = Image.new("RGBA", img.size, (0, 0, 0, 0))
    cd = ImageDraw.Draw(cloud)
    shadow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).ellipse((120, 346, 400, 390), fill=(16, 72, 140, 64))
    img.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(radius=8)))
    cd.ellipse((128, 328, 392, 372), fill=(214, 230, 242, 255))
    for box in (
        (104, 286, 248, 358),
        (164, 238, 360, 352),
        (266, 282, 414, 356),
        (96, 314, 418, 370),
    ):
        cd.ellipse(box, fill=(255, 255, 255, 255))
    img.alpha_composite(cloud)


def make_app_icon() -> Image.Image:
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    mask = draw_sky_tile(img)
    draw_weather(img)
    clipped = Image.new("RGBA", img.size, (0, 0, 0, 0))
    clipped.paste(img, mask=mask)
    _clear_margin(clipped, 8)
    return clipped


def make_file_icon() -> Image.Image:
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    page = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    mask = Image.new("L", (SIZE, SIZE), 0)
    md = ImageDraw.Draw(mask)
    # Document body with a folded corner. Margins keep the canvas edge clear.
    md.rounded_rectangle((120, 70, 400, 450), radius=28, fill=255)
    md.polygon([(330, 70), (400, 70), (400, 150)], fill=0)
    md.polygon([(330, 70), (330, 150), (400, 150)], fill=255)
    shade = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    sp = shade.load()
    light = _light_dir()
    for y in range(70, 451):
        for x in range(120, 401):
            if mask.getpixel((x, y)) == 0:
                continue
            # Fake a lit page: brighter toward the upper left.
            nx = (x - 260) / 180
            ny = (y - 240) / 220
            nz = 0.85
            length = math.sqrt(nx * nx + ny * ny + nz * nz)
            sp[x, y] = _shade(nx / length, ny / length, nz / length, (46, 168, 156), light)
    page.alpha_composite(shade)
    # Fold shade
    fold = ImageDraw.Draw(page)
    fold.polygon([(330, 70), (330, 150), (400, 150)], fill=(220, 255, 248, 255))
    img.alpha_composite(page)
    add_glow(img, 168, 130, 90)
    # Second, tighter highlight so the upper-left of the page reads as lit.
    hot = Image.new("RGBA", img.size, (0, 0, 0, 0))
    hd = ImageDraw.Draw(hot)
    hd.ellipse((150, 100, 230, 180), fill=(255, 255, 250, 230))
    hot = hot.filter(ImageFilter.GaussianBlur(radius=6))
    img.alpha_composite(hot)
    badge = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    bd = ImageDraw.Draw(badge)
    bd.ellipse((250, 300, 340, 390), fill=(255, 186, 60, 255))
    bd.ellipse((286, 330, 360, 400), fill=(255, 255, 255, 230))
    img.alpha_composite(badge)
    return img


def write_icns(path: Path, master: Image.Image) -> None:
    """ICNS container storing PNG images (Apple icon types ic07–ic10)."""
    types = {128: b"ic07", 256: b"ic08", 512: b"ic09", 1024: b"ic10"}
    chunks: list[bytes] = []
    for size, tag in types.items():
        im = master.resize((size, size), Image.Resampling.LANCZOS)
        import io

        buf = io.BytesIO()
        im.save(buf, format="PNG")
        data = buf.getvalue()
        chunks.append(tag + struct.pack(">I", len(data) + 8) + data)
    body = b"".join(chunks)
    path.write_bytes(b"icns" + struct.pack(">I", len(body) + 8) + body)


def save_ico(path: Path, master: Image.Image) -> None:
    sizes = [16, 24, 32, 48, 64, 128, 256]
    images = [master.resize((s, s), Image.Resampling.LANCZOS) for s in sizes]
    images[-1].save(path, format="ICO", sizes=[(s, s) for s in sizes], append_images=images[:-1])


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    app = make_app_icon()
    doc = make_file_icon()
    app.save(OUT / "icon.png")
    doc.save(OUT / "file.png")
    save_ico(OUT / "icon.ico", app)
    save_ico(OUT / "file.ico", doc)
    write_icns(OUT / "icon.icns", app)
    write_icns(OUT / "file.icns", doc)
    print(f"wrote icons in {OUT}")


if __name__ == "__main__":
    main()
