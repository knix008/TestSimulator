"""Generate the MyMoney application icon and document icon.

The application icon is one rounded market tile, lit from the upper left so the
background itself has depth. A rising column chart and an arrow sit in the
middle, the same shapes the app draws for a gaining symbol. The canvas edge
stays transparent. The document icon is a separate glossy page with a coin.
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


def draw_market_tile(img: Image.Image, margin: int = 56, radius: int = 104) -> Image.Image:
    """One rounded trading board. Upper left is lit, lower right falls away."""
    mask = _tile_mask(margin, radius)
    tile = Image.new("RGBA", img.size, (0, 0, 0, 0))
    px = tile.load()
    mp = mask.load()
    x0, y0 = margin, margin
    x1, y1 = SIZE - margin - 1, SIZE - margin - 1
    span = max(x1 - x0, 1)
    light = (176, 232, 206)
    mid = (46, 162, 126)
    deep = (14, 92, 86)
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


def draw_market(img: Image.Image) -> None:
    """A rising column chart with a gold arrow, inside 120..392 x 150..392."""
    shadow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((132, 372, 384, 392), radius=10, fill=(8, 48, 44, 90))
    img.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(radius=7)))

    art = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(art)
    columns = (
        (142, 304, (226, 238, 234, 255)),
        (206, 268, (238, 248, 244, 255)),
        (270, 226, (248, 252, 250, 255)),
    )
    for x, top, color in columns:
        d.rounded_rectangle((x, top, x + 50, 374), radius=12, fill=color)
    # Base line of the board.
    d.rounded_rectangle((132, 374, 384, 382), radius=4, fill=(246, 252, 250, 255))
    img.alpha_composite(art)

    arrow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ad = ImageDraw.Draw(arrow)
    gold = (255, 196, 48, 255)
    _round_line(ad, 158, 300, 226, 252, 18, gold)
    _round_line(ad, 226, 252, 288, 274, 18, gold)
    _round_line(ad, 288, 274, 352, 186, 18, gold)
    ad.polygon([(368, 164), (368, 236), (296, 176)], fill=gold)
    img.alpha_composite(arrow)

    shine = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(shine).ellipse((150, 258, 212, 300), fill=(255, 252, 230, 150))
    img.alpha_composite(shine.filter(ImageFilter.GaussianBlur(radius=10)))


def make_app_icon() -> Image.Image:
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    mask = draw_market_tile(img)
    draw_market(img)
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
            sp[x, y] = _shade(nx / length, ny / length, nz / length, (54, 150, 180), light)
    page.alpha_composite(shade)
    fold = ImageDraw.Draw(page)
    fold.polygon([(330, 70), (330, 150), (400, 150)], fill=(224, 248, 255, 255))
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
    # A coin, so a document never looks like the program tile.
    bd.ellipse((248, 298, 346, 396), fill=(214, 148, 24, 255))
    bd.ellipse((256, 304, 338, 386), fill=(255, 196, 48, 255))
    bd.rectangle((292, 320, 302, 370), fill=(150, 98, 10, 255))
    bd.rectangle((276, 332, 318, 342), fill=(150, 98, 10, 255))
    bd.rectangle((276, 350, 318, 360), fill=(150, 98, 10, 255))
    img.alpha_composite(badge)
    return img


def write_icns(path: Path, master: Image.Image) -> None:
    """ICNS container storing PNG images (Apple icon types ic07-ic10)."""
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


def _menu() -> tuple[Image.Image, ImageDraw.ImageDraw]:
    img = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def write_menu_icons() -> None:
    """Filled tray-menu glyphs. Each command uses its own bright colours."""
    folder = OUT / "menu"
    folder.mkdir(parents=True, exist_ok=True)
    icons: dict[str, Image.Image] = {}
    sky = (48, 148, 255, 255)
    paper = (255, 252, 245, 255)
    red = (226, 64, 74, 255)
    green = (32, 176, 96, 255)
    orange = (255, 140, 36, 255)
    blue = (36, 112, 230, 255)
    gold = (244, 176, 40, 255)
    teal = (16, 168, 176, 255)
    white = (255, 255, 255, 255)

    img, draw = _menu()
    draw.rounded_rectangle((4, 5, 28, 27), radius=4, fill=sky)
    draw.rectangle((4, 5, 28, 13), fill=(20, 110, 220, 255))
    draw.rounded_rectangle((8, 16, 20, 23), radius=2, fill=white)
    icons["show"] = img

    # Market: the program tile in miniature, a board with a rising line.
    img, draw = _menu()
    draw.rounded_rectangle((3, 4, 29, 28), radius=5, fill=(30, 150, 118, 255))
    draw.line((7, 23, 13, 17), fill=gold, width=3)
    draw.line((13, 17, 19, 20), fill=gold, width=3)
    draw.line((19, 20, 26, 10), fill=gold, width=3)
    draw.polygon([(21, 8), (28, 8), (28, 15)], fill=gold)
    icons["market"] = img

    img, draw = _menu()
    draw.arc((5, 5, 27, 27), start=40, end=310, fill=sky, width=4)
    draw.polygon([(20, 4), (29, 5), (23, 13)], fill=orange)
    icons["refresh"] = img

    # Stocks: candlesticks.
    img, draw = _menu()
    draw.line((9, 4, 9, 28), fill=(20, 110, 220, 255), width=2)
    draw.rounded_rectangle((6, 9, 12, 22), radius=1, fill=green)
    draw.line((22, 5, 22, 29), fill=(20, 110, 220, 255), width=2)
    draw.rounded_rectangle((19, 14, 25, 26), radius=1, fill=red)
    icons["stocks"] = img

    # Rates: two arrows swapping currencies.
    img, draw = _menu()
    draw.ellipse((2, 4, 18, 20), fill=gold)
    draw.ellipse((14, 12, 30, 28), fill=teal)
    draw.rectangle((9, 8, 11, 16), fill=white)
    draw.rectangle((6, 10, 14, 12), fill=white)
    draw.rectangle((21, 16, 23, 24), fill=white)
    draw.rectangle((18, 18, 26, 20), fill=white)
    icons["rates"] = img

    # News: a newspaper.
    img, draw = _menu()
    draw.rounded_rectangle((3, 6, 29, 27), radius=3, fill=paper, outline=blue, width=2)
    draw.rectangle((6, 9, 17, 16), fill=sky)
    draw.rectangle((19, 9, 26, 11), fill=red)
    draw.rectangle((19, 13, 26, 15), fill=(120, 136, 152, 255))
    draw.rectangle((6, 19, 26, 21), fill=(120, 136, 152, 255))
    draw.rectangle((6, 23, 20, 25), fill=(120, 136, 152, 255))
    icons["news"] = img

    img, draw = _menu()
    draw.polygon([(3, 12), (12, 12), (15, 7), (29, 7), (29, 26), (3, 26)], fill=gold)
    draw.polygon([(3, 13), (29, 13), (29, 26), (3, 26)], fill=(255, 204, 72, 255))
    icons["open"] = img

    img, draw = _menu()
    draw.rounded_rectangle((4, 4, 28, 28), radius=7, fill=green)
    draw.rectangle((14, 8, 18, 24), fill=white)
    draw.rectangle((8, 14, 24, 18), fill=white)
    icons["new"] = img

    img, draw = _menu()
    draw.rounded_rectangle((6, 4, 26, 28), radius=3, fill=blue)
    draw.rectangle((10, 4, 22, 12), fill=(20, 78, 180, 255))
    draw.rectangle((9, 16, 23, 26), fill=white)
    draw.rectangle((12, 19, 20, 22), fill=sky)
    icons["save"] = img

    img, draw = _menu()
    draw.rounded_rectangle((3, 6, 20, 22), radius=2, fill=paper, outline=blue, width=2)
    draw.ellipse((16, 14, 30, 28), fill=green)
    draw.rectangle((21, 17, 25, 25), fill=white)
    draw.rectangle((19, 20, 27, 23), fill=white)
    icons["saveAs"] = img

    img, draw = _menu()
    draw.rectangle((9, 3, 23, 12), fill=paper, outline=sky, width=2)
    draw.rounded_rectangle((4, 10, 28, 20), radius=3, fill=blue)
    draw.rectangle((13, 16, 19, 20), fill=white)
    draw.rectangle((10, 18, 22, 28), fill=paper, outline=sky, width=2)
    icons["print"] = img

    img, draw = _menu()
    draw.rounded_rectangle((10, 8, 28, 28), radius=3, fill=teal)
    draw.rounded_rectangle((4, 4, 22, 24), radius=3, fill=paper, outline=sky, width=2)
    icons["copy"] = img

    img, draw = _menu()
    draw.arc((7, 7, 26, 26), start=200, end=30, fill=orange, width=4)
    draw.polygon([(5, 8), (5, 18), (13, 13)], fill=orange)
    icons["undo"] = img

    img, draw = _menu()
    draw.arc((6, 7, 25, 26), start=150, end=340, fill=orange, width=4)
    draw.polygon([(27, 8), (27, 18), (19, 13)], fill=orange)
    icons["redo"] = img

    img, draw = _menu()
    draw.rounded_rectangle((7, 8, 25, 28), radius=3, fill=paper, outline=blue, width=2)
    draw.rounded_rectangle((11, 3, 21, 11), radius=2, fill=gold)
    draw.rectangle((10, 15, 22, 18), fill=sky)
    draw.rectangle((10, 21, 18, 24), fill=green)
    icons["paste"] = img

    img, draw = _menu()
    nut = []
    for index in range(6):
        angle = math.radians(-90 + index * 60)
        nut.append((16 + 13 * math.cos(angle), 16 + 13 * math.sin(angle)))
    draw.polygon(nut, fill=(255, 186, 48, 255), outline=(214, 130, 20, 255))
    pixels = img.load()
    for y in range(32):
        for x in range(32):
            if (x - 16) ** 2 + (y - 16) ** 2 <= 20:
                pixels[x, y] = (0, 0, 0, 0)
    icons["settings"] = img

    img, draw = _menu()
    draw.ellipse((4, 4, 28, 28), fill=sky)
    draw.ellipse((14, 8, 18, 12), fill=white)
    draw.rounded_rectangle((14, 14, 18, 24), radius=1, fill=white)
    icons["about"] = img

    img, draw = _menu()
    draw.rounded_rectangle((5, 5, 18, 27), radius=2, fill=blue)
    draw.polygon([(14, 12), (28, 16), (14, 20)], fill=red)
    draw.rectangle((8, 15, 18, 18), fill=red)
    icons["exit"] = img

    for name, picture in icons.items():
        picture.save(folder / f"{name}.png")


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
    write_menu_icons()
    print(f"wrote icons in {OUT}")


if __name__ == "__main__":
    main()
