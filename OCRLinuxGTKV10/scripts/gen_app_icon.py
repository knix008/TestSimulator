#!/usr/bin/env python3
"""Generate assets/myocr.png — application icon for dock / window."""
import os

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "myocr.png")
SIZE = 256


def load_font(size: float) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ]
    for path in candidates:
        if os.path.isfile(path):
            try:
                return ImageFont.truetype(path, int(size))
            except OSError:
                continue
    return ImageFont.load_default()


def rounded_rect(draw: ImageDraw.ImageDraw, box, radius, fill):
    x0, y0, x1, y1 = box
    r = radius
    draw.rounded_rectangle(box, radius=r, fill=fill)


def render_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    margin = max(2, int(size * 0.06))
    radius = max(4, int(size * 0.18))
    rounded_rect(
        draw,
        (margin, margin, size - margin - 1, size - margin - 1),
        radius,
        (25, 95, 180, 255),
    )

    accent = max(2, int(size * 0.04))
    rounded_rect(
        draw,
        (margin + accent, margin + accent, size - margin - accent, size - margin - accent),
        max(2, radius - accent),
        (36, 118, 210, 255),
    )

    font = load_font(size * 0.52)
    text = "\uac00"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    draw.text(
        ((size - tw) / 2 - bbox[0], (size - th) / 2 - bbox[1] - size * 0.02),
        text,
        fill=(255, 255, 255, 255),
        font=font,
    )

    # 작은 OCR 라벨 (하단)
    label_font = load_font(max(10, size * 0.11))
    label = "OCR"
    lb = draw.textbbox((0, 0), label, font=label_font)
    lw = lb[2] - lb[0]
    draw.text(
        ((size - lw) / 2 - lb[0], size * 0.78 - lb[1]),
        label,
        fill=(220, 235, 255, 230),
        font=label_font,
    )

    return img


def main():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    render_icon(SIZE).save(OUT, format="PNG")
    print(OUT)


if __name__ == "__main__":
    main()
