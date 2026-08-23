"""ZipMaster 앱 아이콘 생성기 (v2).
- 둥근 사각형 배경(파란 그라디언트) — 바깥(테두리)은 투명
- 아이소메트릭 3D 지퍼 박스(면마다 그라디언트 음영)
- 좌측 상단 광택 반사(빛 반사) 효과
- 하단에 'ZipMaster' 텍스트
supersampling 으로 안티에일리어싱 후 PNG / ICO / ICNS 저장.
"""
from PIL import Image, ImageDraw, ImageFilter, ImageFont

SS = 4
S = 1024
W = S * SS


def lerp(c1, c2, t):
    return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(4))


def vgrad(size, top, bottom):
    w, h = size
    col = Image.new("RGBA", (1, h))
    for y in range(h):
        col.putpixel((0, y), lerp(top, bottom, y / max(1, h - 1)))
    return col.resize((w, h))


def fill_poly_gradient(base, pts, c1, c2):
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    x0, y0, x1, y1 = min(xs), min(ys), max(xs), max(ys)
    w, h = int(x1 - x0) + 1, int(y1 - y0) + 1
    grad = vgrad((w, h), c1, c2)
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).polygon([(p[0] - x0, p[1] - y0) for p in pts], fill=255)
    base.paste(grad, (int(x0), int(y0)), mask)


img = Image.new("RGBA", (W, W), (0, 0, 0, 0))

# ---------- 1) 둥근 사각형 배경 ----------
margin = int(W * 0.06)
radius = int(W * 0.20)
bg_rect = [margin, margin, W - margin, W - margin]
bw, bh = bg_rect[2] - bg_rect[0], bg_rect[3] - bg_rect[1]

bg_grad = vgrad((bw, bh), (86, 156, 255, 255), (26, 60, 150, 255))
bg_mask = Image.new("L", (bw, bh), 0)
ImageDraw.Draw(bg_mask).rounded_rectangle([0, 0, bw, bh], radius=radius, fill=255)
img.paste(bg_grad, (bg_rect[0], bg_rect[1]), bg_mask)

# ---------- 2) 좌측 상단 광택 반사 ----------
gloss = Image.new("RGBA", (W, W), (0, 0, 0, 0))
gd = ImageDraw.Draw(gloss)
gd.ellipse([margin - W * 0.10, margin - W * 0.22, W * 0.62, W * 0.42],
           fill=(255, 255, 255, 90))
gloss = gloss.filter(ImageFilter.GaussianBlur(W * 0.03))
# 배경 영역으로만 반사 제한
full_mask = Image.new("L", (W, W), 0)
ImageDraw.Draw(full_mask).rounded_rectangle(bg_rect, radius=radius, fill=255)
img = Image.composite(Image.alpha_composite(img, gloss), img, full_mask)

d = ImageDraw.Draw(img)

# ---------- 3) 3D 지퍼 박스 ----------
cx = W / 2
a = W * 0.215
b = a * 0.52
y0 = W * 0.185
height = W * 0.30

top = (cx, y0)
right = (cx + a, y0 + b)
front = (cx, y0 + 2 * b)
left = (cx - a, y0 + b)
def down(p): return (p[0], p[1] + height)
left_b, front_b, right_b = down(left), down(front), down(right)

EDGE = (18, 52, 110, 255)
# 면 그라디언트 (위=가장 밝게, 왼쪽=중간, 오른쪽=어둡게)
fill_poly_gradient(img, [top, right, front, left], (203, 226, 255, 255), (150, 194, 255, 255))
fill_poly_gradient(img, [left, front, front_b, left_b], (96, 158, 240, 255), (54, 108, 200, 255))
fill_poly_gradient(img, [front, right, right_b, front_b], (62, 118, 205, 255), (32, 78, 160, 255))
d = ImageDraw.Draw(img)
for poly in ([top, right, front, left], [left, front, front_b, left_b], [front, right, right_b, front_b]):
    d.line(poly + [poly[0]], fill=EDGE, width=SS * 2)

# 박스 상단-좌측 스페큘러 하이라이트
spec = Image.new("RGBA", (W, W), (0, 0, 0, 0))
ImageDraw.Draw(spec).polygon([top, left, ((left[0] + front[0]) / 2, (left[1] + front[1]) / 2),
                              ((top[0] + front[0]) / 2, (top[1] + front[1]) / 2)],
                             fill=(255, 255, 255, 70))
spec = spec.filter(ImageFilter.GaussianBlur(W * 0.012))
img = Image.alpha_composite(img, spec)
d = ImageDraw.Draw(img)

# ---------- 4) 지퍼 (앞 세로 모서리) ----------
zx = front[0]
z_top = front[1] + height * 0.05
z_bot = front_b[1] - height * 0.05
tooth_h = (z_bot - z_top) / 14
tw = a * 0.11
SILVER = (238, 243, 250, 255)
SILVER_D = (140, 152, 170, 255)
d.line([(zx, z_top), (zx, z_bot)], fill=EDGE, width=int(SS * 3))
y = z_top
i = 0
while y < z_bot:
    if i % 2 == 0:
        d.polygon([(zx - tw, y), (zx, y + tooth_h * 0.3), (zx, y + tooth_h), (zx - tw, y + tooth_h * 0.7)],
                  fill=SILVER, outline=SILVER_D, width=SS)
    else:
        d.polygon([(zx + tw, y), (zx, y + tooth_h * 0.3), (zx, y + tooth_h), (zx + tw, y + tooth_h * 0.7)],
                  fill=SILVER, outline=SILVER_D, width=SS)
    y += tooth_h
    i += 1
sly = z_top + (z_bot - z_top) * 0.44
d.rounded_rectangle([zx - tw * 1.5, sly, zx + tw * 1.5, sly + tooth_h * 2.2],
                    radius=tw * 0.6, fill=SILVER, outline=SILVER_D, width=int(SS * 2))
d.line([(zx, sly + tooth_h * 2.2), (zx, sly + tooth_h * 3.6)], fill=SILVER_D, width=int(SS * 3))

# ---------- 4b) 압축 화살표(양 옆에서 지퍼 쪽으로 눌러 압축) ----------
def p2(a_, b_, t):
    return (a_[0] + (b_[0] - a_[0]) * t, a_[1] + (b_[1] - a_[1]) * t)

def face_pt(quad, fx, fy):
    tl, tr, br, bl = quad
    return p2(p2(tl, tr, fx), p2(bl, br, fx), fy)

left_quad = [left, front, front_b, left_b]
right_quad = [front, right, right_b, front_b]
ARROW = (255, 255, 255, 235)
al = a * 0.14

# 왼쪽 면: 오른쪽(지퍼)을 향하는 화살표 ▶
lc = face_pt(left_quad, 0.46, 0.30)
d.line([(lc[0] - al, lc[1] - al * 0.9), (lc[0] + al * 0.4, lc[1]),
        (lc[0] - al, lc[1] + al * 0.9)], fill=ARROW, width=int(SS * 5), joint="curve")
# 오른쪽 면: 왼쪽(지퍼)을 향하는 화살표 ◀
rc = face_pt(right_quad, 0.54, 0.30)
d.line([(rc[0] + al, rc[1] - al * 0.9), (rc[0] - al * 0.4, rc[1]),
        (rc[0] + al, rc[1] + al * 0.9)], fill=ARROW, width=int(SS * 5), joint="curve")

# ---------- 5) 텍스트 'ZipMaster' ----------
def load_font(size):
    for name in ["segoeuib.ttf", "arialbd.ttf", "Arialbd.ttf", "seguisb.ttf", "arial.ttf"]:
        try:
            return ImageFont.truetype(name, size)
        except Exception:
            continue
    return ImageFont.load_default()

font = load_font(int(W * 0.115))
text = "ZipMaster"
tb = d.textbbox((0, 0), text, font=font)
tw2, th2 = tb[2] - tb[0], tb[3] - tb[1]
tx = (W - tw2) / 2 - tb[0]
ty = W * 0.78 - tb[1]
# 그림자 + 흰 글자
d.text((tx + SS * 2, ty + SS * 2), text, font=font, fill=(10, 30, 70, 160))
d.text((tx, ty), text, font=font, fill=(255, 255, 255, 255))

# ---------- 저장 ----------
final = img.resize((S, S), Image.LANCZOS)
final.save("build/icon.png")
final.save("src/web/public/icon.png")
final.save("src/desktop/public/icon.png")
final.save("build/icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
try:
    final.resize((512, 512), Image.LANCZOS).save("build/icon.icns")
    print("icns: ok")
except Exception as e:
    print("icns: skipped -", e)
print("icon generated:", final.size)
