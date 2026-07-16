"""
Generate icon.png and icon.ico with proper RGBA transparency using Pillow.
Designs a TTS app icon: teal gradient bg, upper-left gloss, TTS text, wave.
Run: python assets/gen_icon.py
"""
from PIL import Image, ImageDraw, ImageFont
import math, os, struct, io

SIZE = 512
MARGIN = 28
RADIUS = 112
OUT = os.path.join(os.path.dirname(__file__), 'icon.png')

# ── 1. Diagonal gradient background ─────────────────────────────────────────
grad = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
gd = ImageDraw.Draw(grad)
# Row-by-row gradient from #2ac8b4 (top) to #0b5048 (bottom), with slight
# left-brightness: each row color blended by vertical position
for y in range(SIZE):
    t = y / (SIZE - 1)
    r = int(42  * (1 - t) + 11  * t)
    g = int(200 * (1 - t) + 80  * t)
    b = int(180 * (1 - t) + 72  * t)
    gd.line([(0, y), (SIZE - 1, y)], fill=(r, g, b, 255))

# ── 2. Rounded-rect mask ─────────────────────────────────────────────────────
mask = Image.new('L', (SIZE, SIZE), 0)
ImageDraw.Draw(mask).rounded_rectangle(
    [MARGIN, MARGIN, SIZE - MARGIN, SIZE - MARGIN],
    radius=RADIUS, fill=255
)

# Apply mask: clip gradient to rounded rect on transparent canvas
bg = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
bg.paste(grad, mask=mask)

# ── 3. Upper-left gloss overlay ───────────────────────────────────────────────
# A soft white ellipse biased to upper-left, clipped to the same rounded rect
gloss = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
gd2 = ImageDraw.Draw(gloss)
# Ellipse center roughly at upper-left (10%, 12%) of icon area
cx = MARGIN + int((SIZE - 2 * MARGIN) * 0.10)
cy = MARGIN + int((SIZE - 2 * MARGIN) * 0.08)
ew = int((SIZE - 2 * MARGIN) * 0.75)   # wide
eh = int((SIZE - 2 * MARGIN) * 0.55)   # tall enough
# Outer large ellipse: soft glow
gd2.ellipse([cx - ew, cy - eh, cx + ew, cy + eh], fill=(255, 255, 255, 58))
# Inner tighter ellipse: brighter core
ew2 = int(ew * 0.55)
eh2 = int(eh * 0.55)
gd2.ellipse([cx - ew2, cy - eh2, cx + ew2, cy + eh2], fill=(255, 255, 255, 55))

gloss_m = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
gloss_m.paste(gloss, mask=mask)
bg = Image.alpha_composite(bg, gloss_m)

# ── 4. Inner glass border ──────────────────────────────────────────────────────
border_img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
ImageDraw.Draw(border_img).rounded_rectangle(
    [MARGIN + 3, MARGIN + 3, SIZE - MARGIN - 3, SIZE - MARGIN - 3],
    radius=RADIUS - 3,
    outline=(255, 255, 255, 55),
    width=3
)
bg = Image.alpha_composite(bg, border_img)

# ── 5. TTS text ───────────────────────────────────────────────────────────────
draw = ImageDraw.Draw(bg)
FONT_SIZE = 200
font = None
candidates = [
    'C:/Windows/Fonts/ariblk.ttf',   # Arial Black
    'C:/Windows/Fonts/arialbd.ttf',  # Arial Bold
    'C:/Windows/Fonts/arial.ttf',
]
for path in candidates:
    try:
        font = ImageFont.truetype(path, FONT_SIZE)
        print(f'Font: {path}')
        break
    except Exception:
        pass
if not font:
    font = ImageFont.load_default()
    print('Font: default (fallback)')

TEXT = 'TTS'
bbox = draw.textbbox((0, 0), TEXT, font=font)
tw = bbox[2] - bbox[0]
th = bbox[3] - bbox[1]
tx = (SIZE - tw) // 2 - bbox[0]
ty = SIZE // 2 - th // 2 - bbox[1] - 28   # slightly above center

# Soft shadow
draw.text((tx + 4, ty + 5), TEXT, font=font, fill=(0, 50, 45, 70))
# Main text
draw.text((tx, ty), TEXT, font=font, fill=(255, 255, 255, 240))

# ── 6. Sound wave ──────────────────────────────────────────────────────────────
WY = int(SIZE * 0.80)
WX1 = MARGIN + int((SIZE - 2 * MARGIN) * 0.12)
WX2 = SIZE - MARGIN - int((SIZE - 2 * MARGIN) * 0.12)
AMP = int((SIZE - 2 * MARGIN) * 0.05)
STEPS = 100
pts = []
for i in range(STEPS + 1):
    t = i / STEPS
    x = WX1 + t * (WX2 - WX1)
    y = WY + AMP * math.sin(t * math.pi * 2)
    pts.append((x, y))
for i in range(len(pts) - 1):
    draw.line([pts[i], pts[i + 1]], fill=(255, 255, 255, 148), width=8)

# ── 7. Save PNG (256×256) ──────────────────────────────────────────────────────
final = bg.resize((256, 256), Image.LANCZOS)
final.save(OUT, format='PNG')
print(f'PNG: {OUT}  ({os.path.getsize(OUT)//1024} KB)')
px = final.load()
print(f'Corner RGBA={px[0,0]}  transparent={px[0,0][3]==0}')

# ── 8. Save ICO (16/32/48/64/128/256, PNG-in-ICO for proper alpha) ───────────
ICO = OUT.replace('.png', '.ico')
ico_sizes = [16, 32, 48, 64, 128, 256]
chunks = []
for s in ico_sizes:
    img_s = bg.resize((s, s), Image.LANCZOS)
    buf = io.BytesIO()
    img_s.save(buf, format='PNG')
    chunks.append(buf.getvalue())

with open(ICO, 'wb') as f:
    f.write(struct.pack('<HHH', 0, 1, len(ico_sizes)))
    offset = 6 + 16 * len(ico_sizes)
    for s, data in zip(ico_sizes, chunks):
        w = 0 if s == 256 else s
        h = 0 if s == 256 else s
        f.write(struct.pack('<BBBBHHII', w, h, 0, 0, 1, 32, len(data), offset))
        offset += len(data)
    for data in chunks:
        f.write(data)

print(f'ICO: {ICO}  ({os.path.getsize(ICO)//1024} KB)  sizes={ico_sizes}')

# Also delete cached ICO in dist so electron-builder picks up the new one
cached = os.path.join(os.path.dirname(__file__), '..', 'dist', '.icon-ico', 'icon.ico')
cached = os.path.normpath(cached)
if os.path.exists(cached):
    os.remove(cached)
    print(f'Deleted cache: {cached}')
