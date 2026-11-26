"""Builds icon-master.png: a stack of metallic discs and a file badge, drawn here, on a
coloured, bevelled 3D tile. Run it, then `python assets/build-icons.py` and `npm run icons`.

    python assets/make-3d-icon.py
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter

root = Path(__file__).resolve().parent
SIZE = 1024
RADIUS = 210


def rounded_mask(size: int, inset: int, radius: int) -> Image.Image:
    m = Image.new('L', (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle((inset, inset, size - inset - 1, size - inset - 1), radius, fill=255)
    return m


def vertical_gradient(size: int, stops: list[tuple[float, tuple[int, int, int]]]) -> Image.Image:
    ys = np.linspace(0, 1, size)
    pos = [p for p, _ in stops]
    rows = np.stack([np.interp(ys, pos, [c[i] for _, c in stops]) for i in range(3)], axis=1)
    out = np.repeat(rows[:, None, :], size, axis=1)
    return Image.fromarray(out.astype(np.uint8), 'RGB')


def tile() -> Image.Image:
    S = SIZE
    inset = 44
    canvas = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    body = rounded_mask(S, inset, RADIUS)

    # Drop shadow under the tile
    shadow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    sm = rounded_mask(S, inset + 6, RADIUS).filter(ImageFilter.GaussianBlur(22))
    shadow.putalpha(sm.point(lambda v: int(v * 0.55)))
    canvas.alpha_composite(shadow, (0, 22))

    # Face: deep indigo at the top to teal at the bottom, with a diagonal light
    grad = vertical_gradient(S, [(0.0, (58, 72, 190)), (0.55, (24, 110, 170)), (1.0, (10, 150, 140))]).convert('RGBA')
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32) / S
    glow = np.clip(1.0 - np.hypot(xx - 0.28, yy - 0.18) / 0.75, 0, 1) ** 2
    g = np.array(grad).astype(np.float32)
    g[:, :, :3] = np.clip(g[:, :, :3] + glow[..., None] * np.array([70, 70, 90]), 0, 255)
    face = Image.fromarray(g.astype(np.uint8))
    face.putalpha(body)
    canvas.alpha_composite(face)

    # Bevel: light rim on the top-left, dark rim on the bottom-right
    edge = ImageChops.subtract(body, rounded_mask(S, inset + 14, RADIUS - 14)).filter(ImageFilter.GaussianBlur(3))
    e = np.array(edge).astype(np.float32) / 255
    light = np.clip((1 - (xx + yy)) * 1.6, 0, 1)
    dark = np.clip(((xx + yy) - 1) * 1.6, 0, 1)
    rim = np.zeros((S, S, 4), dtype=np.float32)
    rim[:, :, :3] = 255
    rim[:, :, 3] = e * light * 170
    canvas.alpha_composite(Image.fromarray(rim.astype(np.uint8)))
    rim2 = np.zeros((S, S, 4), dtype=np.float32)
    rim2[:, :, 3] = e * dark * 150
    canvas.alpha_composite(Image.fromarray(rim2.astype(np.uint8)))

    # Gloss: a soft sheen over the top half
    gloss = Image.new('L', (S, S), 0)
    ImageDraw.Draw(gloss).ellipse((-S * 0.25, -S * 0.62, S * 1.25, S * 0.46), fill=255)
    gloss = ImageChops.multiply(gloss, rounded_mask(S, inset + 6, RADIUS - 6)).filter(ImageFilter.GaussianBlur(6))
    ga = np.array(gloss).astype(np.float32) / 255
    sheen = np.zeros((S, S, 4), dtype=np.float32)
    sheen[:, :, :3] = 255
    sheen[:, :, 3] = ga * (0.30 - 0.22 * yy) * 255
    canvas.alpha_composite(Image.fromarray(np.clip(sheen, 0, 255).astype(np.uint8)))
    return canvas


def _ellipse_mask(S: int, box: tuple[float, float, float, float]) -> np.ndarray:
    m = Image.new('L', (S, S), 0)
    ImageDraw.Draw(m).ellipse(box, fill=255)
    return np.array(m).astype(np.float32) / 255


def _paint(canvas: np.ndarray, rgb: np.ndarray, alpha: np.ndarray) -> None:
    """Over-composite rgb (H,W,3 float) with alpha (H,W 0..1) onto canvas (H,W,4 float)."""
    a = alpha[..., None]
    canvas[:, :, :3] = canvas[:, :, :3] * (1 - a) + rgb * a
    canvas[:, :, 3] = canvas[:, :, 3] + alpha * (1 - canvas[:, :, 3])


def draw_art() -> Image.Image:
    """A stack of metallic blue discs with a file badge, drawn at 2x and returned at SIZE."""
    S = SIZE * 2
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    cv = np.zeros((S, S, 4), dtype=np.float32)
    cx, rx, ry = S * 0.44, S * 0.33, S * 0.145
    top = S * 0.36
    thick, gap, count = S * 0.022, S * 0.040, 6
    for i in range(count - 1, -1, -1):
        cy = top + i * gap
        # Rim: a band from the face down by `thick`, dark blue with a bright upper lip
        rim = np.clip(_ellipse_mask(S, (cx - rx, cy, cx + rx, cy + 2 * ry + thick)) - 0, 0, 1)
        t = np.clip((yy - (cy + ry)) / (ry + thick), 0, 1)
        shade = 0.55 + 0.45 * np.cos(np.clip((xx - cx) / rx, -1, 1) * 1.4)
        rim_rgb = np.stack([18 + 70 * shade, 45 + 110 * shade, 120 + 120 * shade], -1) * (1 - 0.35 * t[..., None])
        _paint(cv, rim_rgb, rim)
        # Face
        face = _ellipse_mask(S, (cx - rx, cy, cx + rx, cy + 2 * ry))
        u = (xx - cx) / rx
        v = (yy - (cy + ry)) / ry
        r = np.hypot(u, v)
        ang = np.arctan2(v, u)
        metal = 0.5 + 0.5 * np.cos(2 * ang + 0.9)
        m2 = metal ** 1.6
        base = np.stack([40 + 190 * m2, 95 + 148 * m2, 190 + 64 * m2], -1)
        # Rainbow sheen on the data area
        hue = (ang / (2 * np.pi) + 0.5) * 6
        rain = np.stack([np.clip(np.abs(hue - 3) - 1, 0, 1), np.clip(2 - np.abs(hue - 2), 0, 1), np.clip(2 - np.abs(hue - 4), 0, 1)], -1) * 255
        band = np.clip((r - 0.42) / 0.1, 0, 1) * np.clip((0.95 - r) / 0.1, 0, 1) * (0.5 + 0.5 * np.cos(4 * ang - 0.6)) * 0.22
        base = base * (1 - band[..., None]) + rain * band[..., None]
        # Hub: lighter ring, then the hole
        hub = (r < 0.30).astype(np.float32)
        base = base * (1 - hub[..., None]) + np.stack([200 + 40 * metal, 215 + 30 * metal, 240 + 15 * metal], -1) * hub[..., None]
        ring = (np.abs(r - 0.30) < 0.012).astype(np.float32)
        base = base * (1 - ring[..., None] * 0.6) + np.array([60, 90, 150]) * ring[..., None] * 0.6
        hole = (r < 0.11).astype(np.float32)
        base = base * (1 - hole[..., None]) + np.array([30, 50, 95]) * hole[..., None]
        _paint(cv, np.clip(base, 0, 255), face)
        # Bright outline of the face
        edge = np.clip(face - _ellipse_mask(S, (cx - rx + 6, cy + 4, cx + rx - 6, cy + 2 * ry - 4)), 0, 1)
        _paint(cv, np.full((S, S, 3), 245.0), edge * 0.75)

    # File badge with a folded corner and a small disc
    bx0, by0, bx1, by1 = S * 0.60, S * 0.47, S * 0.86, S * 0.80
    fold = S * 0.065
    badge = Image.new('L', (S, S), 0)
    ImageDraw.Draw(badge).rounded_rectangle((bx0, by0, bx1, by1), radius=S * 0.025, fill=255)
    ImageDraw.Draw(badge).polygon([(bx1 - fold, by0 - 2), (bx1 + 2, by0 - 2), (bx1 + 2, by0 + fold)], fill=0)
    bm = np.array(badge).astype(np.float32) / 255
    sh = np.array(badge.filter(ImageFilter.GaussianBlur(S * 0.012))).astype(np.float32) / 255
    sh = np.roll(np.roll(sh, int(S * 0.012), 0), int(S * 0.008), 1)
    _paint(cv, np.zeros((S, S, 3)), sh * 0.45)
    g = np.clip((xx - bx0) / (bx1 - bx0) * 0.6 + (yy - by0) / (by1 - by0) * 0.4, 0, 1)
    badge_rgb = np.stack([235 - 70 * g, 238 - 62 * g, 245 - 50 * g], -1)
    _paint(cv, badge_rgb, bm)
    corner = Image.new('L', (S, S), 0)
    ImageDraw.Draw(corner).polygon([(bx1 - fold, by0), (bx1 - fold, by0 + fold), (bx1, by0 + fold)], fill=255)
    _paint(cv, np.full((S, S, 3), [150.0, 160.0, 178.0]), np.array(corner).astype(np.float32) / 255)
    # badge outline
    outline = Image.new('L', (S, S), 0)
    ImageDraw.Draw(outline).rounded_rectangle((bx0, by0, bx1, by1), radius=S * 0.025, outline=255, width=int(S * 0.004))
    _paint(cv, np.full((S, S, 3), [120.0, 130.0, 150.0]), (np.array(outline).astype(np.float32) / 255) * bm)
    # small disc on the badge
    dcx, dcy, dr = (bx0 + bx1) / 2 - fold * 0.15, by0 + (by1 - by0) * 0.58, (bx1 - bx0) * 0.30
    dm = _ellipse_mask(S, (dcx - dr, dcy - dr, dcx + dr, dcy + dr))
    u, v = (xx - dcx) / dr, (yy - dcy) / dr
    ang = np.arctan2(v, u)
    met = 0.5 + 0.5 * np.cos(2 * ang + 0.9)
    rr = np.hypot(u, v)
    drgb = np.stack([120 + 110 * met, 160 + 85 * met, 220 + 35 * met], -1)
    drgb = np.where((rr < 0.18)[..., None], np.array([40, 60, 110.0]), drgb)
    _paint(cv, drgb, dm)
    _paint(cv, np.full((S, S, 3), 250.0), np.clip(dm - _ellipse_mask(S, (dcx - dr + 5, dcy - dr + 5, dcx + dr - 5, dcy + dr - 5)), 0, 1) * 0.7)

    img = Image.fromarray(np.clip(np.dstack([cv[:, :, :3], cv[:, :, 3] * 255]), 0, 255).astype(np.uint8), 'RGBA')
    img = img.resize((SIZE, SIZE), Image.LANCZOS)
    return img.crop(img.getbbox())


def main() -> None:
    art = draw_art()
    out = tile()
    # The artwork, 74% of the tile, with its own shadow so it stands on the face
    target = int(SIZE * 0.74)
    scale = target / max(art.size)
    art = art.resize((int(art.width * scale), int(art.height * scale)), Image.LANCZOS)
    x = (SIZE - art.width) // 2
    y = (SIZE - art.height) // 2 - 6
    sh = Image.new('RGBA', art.size, (0, 0, 0, 0))
    sh.putalpha(art.getchannel('A').point(lambda v: int(v * 0.5)).filter(ImageFilter.GaussianBlur(14)))
    out.alpha_composite(sh, (x + 10, y + 24))
    out.alpha_composite(art, (x, y))
    out.save(root / 'icon-master.png')
    print('icon-master.png written', out.size)


if __name__ == '__main__':
    main()
