#!/usr/bin/env python3
"""Generate a small test image with Korean + English text."""
from PIL import Image, ImageDraw, ImageFont
import os

out = os.path.join(os.path.dirname(__file__), "test_sample.png")
img = Image.new("RGB", (480, 120), "white")
draw = ImageDraw.Draw(img)
try:
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 28)
except OSError:
    font = ImageFont.load_default()
draw.text((20, 40), "Hello OCR 123", fill="black", font=font)
draw.text((20, 80), "한글 테스트", fill="black", font=font)
img.save(out)
print(out)
