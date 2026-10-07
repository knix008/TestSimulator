#!/usr/bin/env python3
"""assets/make_icons.py — 프로그램 아이콘을 만든다.

입체감(3D)은 사진이나 3D 엔진 없이, 2차원 그리기에 조명 계산을 얹어서 낸다.
  - 둥근 사각 배지: 수직 그라데이션 + 위쪽 테두리 하이라이트 + 바닥 그림자
  - 마이크 몸통: 구면 법선을 가정한 램버트 + 스펙큘러 음영 (금속 느낌)
  - 소리 물결: 바깥으로 갈수록 옅어지는 호 + 아래로 드리운 그림자

만드는 것:
  assets/icon.png                 1024×1024 원본
  assets/icon-<크기>.png          16 … 512
  assets/icon.ico                 Windows 실행 파일·작업 표시줄용 (다중 크기)
  assets/icon.icns                macOS 번들용
  assets/icons/hicolor/<크기>x<크기>/apps/korean-stt.png   Linux/GTK 아이콘 테마

실행:  python assets/make_icons.py
"""

from __future__ import annotations

import math
import pathlib
import struct

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = pathlib.Path(__file__).resolve().parent

# 1024px 결과를 위해 4배로 그린 뒤 줄인다 (가장자리를 매끄럽게).
SCALE = 4
SIZE = 1024
CANVAS = SIZE * SCALE

ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]
PNG_SIZES = [16, 24, 32, 48, 64, 128, 256, 512]
ICNS_TYPES = [(b"icp4", 16), (b"icp5", 32), (b"icp6", 64),
              (b"ic07", 128), (b"ic08", 256), (b"ic09", 512), (b"ic10", 1024)]


# --------------------------------------------------------------------------- 색

def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(len(a)))


BG_TOP = (84, 128, 255)      # 밝은 파랑
BG_BOTTOM = (28, 42, 128)    # 짙은 남색
MIC_LIGHT = (248, 250, 255)  # 금속 하이라이트
MIC_MID = (176, 190, 214)
MIC_DARK = (74, 88, 116)
WAVE = (255, 196, 92)        # 따뜻한 강조색


# --------------------------------------------------------------- 둥근 사각 배지

def rounded_rect_mask(size: int, margin: int, radius: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [margin, margin, size - margin, size - margin], radius=radius, fill=255)
    return mask


def vertical_gradient(size: int, top, bottom) -> Image.Image:
    ramp = np.linspace(0.0, 1.0, size, dtype=np.float32)[:, None]
    top_arr = np.array(top, dtype=np.float32)
    bottom_arr = np.array(bottom, dtype=np.float32)
    rows = top_arr[None, :] * (1.0 - ramp) + bottom_arr[None, :] * ramp
    img = np.repeat(rows[:, None, :], size, axis=1)
    return Image.fromarray(img.astype(np.uint8), "RGB")


def radial_light(size: int, cx: float, cy: float, radius: float, strength: float):
    """왼쪽 위에서 비치는 빛. 배지에 볼록한 느낌을 준다."""
    y, x = np.mgrid[0:size, 0:size].astype(np.float32)
    d = np.sqrt((x - cx) ** 2 + (y - cy) ** 2) / radius
    glow = np.clip(1.0 - d, 0.0, 1.0) ** 2 * strength
    return Image.fromarray((glow * 255).astype(np.uint8), "L")


def make_badge(size: int) -> Image.Image:
    margin = int(size * 0.055)
    radius = int(size * 0.235)

    badge = vertical_gradient(size, BG_TOP, BG_BOTTOM).convert("RGBA")

    # 왼쪽 위 빛 → 볼록하게
    light = radial_light(size, size * 0.30, size * 0.24, size * 0.85, 0.55)
    white = Image.new("RGBA", (size, size), (255, 255, 255, 255))
    badge = Image.composite(Image.blend(badge, white, 0.45), badge,
                            light.point(lambda v: v))

    # 아래쪽은 더 어둡게 (바닥에서 멀어질수록 빛이 약하다)
    shade = radial_light(size, size * 0.72, size * 1.08, size * 0.95, 0.5)
    black = Image.new("RGBA", (size, size), (0, 0, 0, 255))
    badge = Image.composite(Image.blend(badge, black, 0.35), badge, shade)

    mask = rounded_rect_mask(size, margin, radius)
    badge.putalpha(mask)

    # 테두리 베벨: 위쪽은 밝게, 아래쪽은 어둡게 — 두께감의 핵심
    bevel = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(bevel)
    line = max(2, int(size * 0.008))
    draw.rounded_rectangle([margin, margin, size - margin, size - margin],
                           radius=radius, outline=(255, 255, 255, 150), width=line)
    inner = margin + line
    draw.rounded_rectangle([inner, inner + line * 2, size - inner, size - margin],
                           radius=radius, outline=(0, 0, 0, 70), width=line)
    bevel.putalpha(Image.composite(bevel.getchannel("A"),
                                   Image.new("L", (size, size), 0), mask))
    badge = Image.alpha_composite(badge, bevel)
    return badge


# ------------------------------------------------------------------- 마이크 본체

def sphere_shade(w: int, h: int, light=(-0.45, -0.6, 0.66)) -> np.ndarray:
    """가로 w, 세로 h 영역을 원기둥(좌우로 둥근)으로 보고 음영을 만든다."""
    x = np.linspace(-1.0, 1.0, w, dtype=np.float32)[None, :]
    y = np.linspace(-1.0, 1.0, h, dtype=np.float32)[:, None]

    # 좌우로만 둥근 법선 (원기둥). 위아래 끝은 살짝 말아 준다.
    nx = np.repeat(x, h, axis=0)
    cap = np.clip((np.abs(y) - 0.78) / 0.22, 0.0, 1.0)
    ny = np.repeat(y, w, axis=1) * cap
    nz = np.sqrt(np.clip(1.0 - nx ** 2 - ny ** 2, 0.0, 1.0))

    lx, ly, lz = light
    norm = math.sqrt(lx * lx + ly * ly + lz * lz)
    lx, ly, lz = lx / norm, ly / norm, lz / norm

    diffuse = np.clip(nx * lx + ny * ly + nz * lz, 0.0, 1.0)

    # 반사광(스펙큘러): 금속처럼 좁고 밝게
    half = np.array([lx, ly, lz + 1.0], dtype=np.float32)
    half /= np.linalg.norm(half)
    spec = np.clip(nx * half[0] + ny * half[1] + nz * half[2], 0.0, 1.0) ** 48

    # 반대쪽에서 살짝 들어오는 되비침 — 윤곽이 배경에 묻히지 않게
    rim = np.clip(-nx * 0.9 + 0.25, 0.0, 1.0) ** 3 * 0.35
    return np.clip(diffuse * 0.82 + spec * 0.9 + rim + 0.16, 0.0, 1.2)


def shaded_capsule(w: int, h: int) -> Image.Image:
    shade = sphere_shade(w, h)
    dark = np.array(MIC_DARK, dtype=np.float32)
    mid = np.array(MIC_MID, dtype=np.float32)
    light = np.array(MIC_LIGHT, dtype=np.float32)

    t = np.clip(shade[..., None], 0.0, 1.2)
    low = dark[None, None, :] + (mid - dark)[None, None, :] * np.clip(t / 0.6, 0, 1)
    high = mid[None, None, :] + (light - mid)[None, None, :] * np.clip((t - 0.6) / 0.6, 0, 1)
    rgb = np.where(t < 0.6, low, high)

    body = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), "RGB").convert("RGBA")

    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, w - 1, h - 1], radius=w // 2, fill=255)
    body.putalpha(mask)
    return body


def add_grille(body: Image.Image) -> Image.Image:
    """마이크 망 — 가로줄 몇 개로 표면이 평평하지 않음을 보여 준다."""
    w, h = body.size
    grille = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(grille)
    step = h // 9
    thickness = max(2, step // 7)
    for i in range(1, 9):
        y = i * step
        draw.line([(int(w * 0.17), y), (int(w * 0.83), y)], fill=(20, 28, 48, 90),
                  width=thickness)
        draw.line([(int(w * 0.17), y + thickness), (int(w * 0.83), y + thickness)],
                  fill=(255, 255, 255, 55), width=max(1, thickness // 2))
    grille.putalpha(Image.composite(grille.getchannel("A"),
                                    Image.new("L", (w, h), 0), body.getchannel("A")))
    return Image.alpha_composite(body, grille)


def make_microphone(size: int) -> Image.Image:
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    body_w = int(size * 0.26)
    body_h = int(size * 0.40)
    body_x = (size - body_w) // 2
    body_y = int(size * 0.17)

    # 바닥에 드리운 그림자 먼저
    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).ellipse(
        [size * 0.27, size * 0.80, size * 0.73, size * 0.90], fill=(6, 10, 32, 150))
    shadow = shadow.filter(ImageFilter.GaussianBlur(size * 0.022))
    layer = Image.alpha_composite(layer, shadow)

    # 마이크 뒤로 떨어지는 그림자 (떠 있는 느낌)
    cast = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(cast).rounded_rectangle(
        [body_x + size * 0.03, body_y + size * 0.04,
         body_x + body_w + size * 0.05, body_y + body_h + size * 0.06],
        radius=body_w // 2, fill=(5, 12, 40, 120))
    cast = cast.filter(ImageFilter.GaussianBlur(size * 0.018))
    layer = Image.alpha_composite(layer, cast)

    # 받침대: 호 + 기둥 + 바닥
    stand = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(stand)
    arc_w = max(3, int(size * 0.035))
    draw.arc([size * 0.285, size * 0.33, size * 0.715, size * 0.73],
             start=15, end=165, fill=MIC_MID + (255,), width=arc_w)
    draw.arc([size * 0.285, size * 0.33 + arc_w * 0.5, size * 0.715,
              size * 0.73 + arc_w * 0.5],
             start=25, end=155, fill=(255, 255, 255, 110), width=max(2, arc_w // 3))
    draw.rounded_rectangle(
        [size * 0.478, size * 0.70, size * 0.522, size * 0.805],
        radius=size * 0.02, fill=MIC_MID + (255,))
    draw.ellipse([size * 0.355, size * 0.785, size * 0.645, size * 0.845],
                 fill=MIC_MID + (255,))
    draw.ellipse([size * 0.372, size * 0.790, size * 0.628, size * 0.820],
                 fill=MIC_LIGHT + (190,))
    layer = Image.alpha_composite(layer, stand)

    body = add_grille(shaded_capsule(body_w, body_h))
    layer.alpha_composite(body, (body_x, body_y))
    return layer


# -------------------------------------------------------------------- 소리 물결

def make_waves(size: int) -> Image.Image:
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    shade = ImageDraw.Draw(shadow)

    cx, cy = size * 0.5, size * 0.37
    for index, (radius, alpha) in enumerate([(0.255, 235), (0.325, 150)]):
        r = size * radius
        width = max(3, int(size * (0.030 - index * 0.006)))
        box = [cx - r, cy - r, cx + r, cy + r]
        offset = [v + size * 0.012 for v in box]
        for start, end in ((158, 202), (-22, 22)):
            shade.arc(offset, start=start, end=end, fill=(4, 10, 34, 110), width=width)
            draw.arc(box, start=start, end=end, fill=WAVE + (alpha,), width=width)
            # 위쪽 테두리를 밝게 — 물결에도 두께를 준다
            draw.arc([v - size * 0.004 for v in box], start=start, end=end,
                     fill=(255, 236, 190, alpha // 2), width=max(2, width // 3))

    shadow = shadow.filter(ImageFilter.GaussianBlur(size * 0.008))
    return Image.alpha_composite(shadow, layer)


# ------------------------------------------------------------------------ 조립

def render() -> Image.Image:
    badge = make_badge(CANVAS)
    art = Image.alpha_composite(badge, make_waves(CANVAS))
    art = Image.alpha_composite(art, make_microphone(CANVAS))

    # 유리 같은 반사: 위쪽 절반에 옅은 흰색 띠
    gloss = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    ImageDraw.Draw(gloss).ellipse(
        [-CANVAS * 0.25, -CANVAS * 0.62, CANVAS * 1.25, CANVAS * 0.46],
        fill=(255, 255, 255, 34))
    gloss.putalpha(Image.composite(gloss.getchannel("A"),
                                   Image.new("L", (CANVAS, CANVAS), 0),
                                   badge.getchannel("A")))
    art = Image.alpha_composite(art, gloss)

    return art.resize((SIZE, SIZE), Image.LANCZOS)


def write_icns(path: pathlib.Path, master: Image.Image) -> None:
    """Pillow 의 ICNS 쓰기는 플랫폼을 타므로 직접 만든다 (PNG 를 담는 형식)."""
    chunks = []
    for type_code, size in ICNS_TYPES:
        from io import BytesIO
        buffer = BytesIO()
        master.resize((size, size), Image.LANCZOS).save(buffer, format="PNG")
        payload = buffer.getvalue()
        chunks.append(type_code + struct.pack(">I", len(payload) + 8) + payload)
    body = b"".join(chunks)
    path.write_bytes(b"icns" + struct.pack(">I", len(body) + 8) + body)


def main() -> None:
    master = render()

    HERE.mkdir(parents=True, exist_ok=True)
    master.save(HERE / "icon.png")
    print("  icon.png            1024×1024")

    for size in PNG_SIZES:
        master.resize((size, size), Image.LANCZOS).save(HERE / f"icon-{size}.png")
    print(f"  icon-<크기>.png     {', '.join(str(s) for s in PNG_SIZES)}")

    master.save(HERE / "icon.ico", format="ICO",
                sizes=[(s, s) for s in ICO_SIZES])
    print(f"  icon.ico            {', '.join(str(s) for s in ICO_SIZES)}")

    write_icns(HERE / "icon.icns", master)
    print(f"  icon.icns           {', '.join(str(s) for _, s in ICNS_TYPES)}")

    # Linux: GTK 가 아이콘 테마로 찾아갈 수 있게
    for size in [16, 24, 32, 48, 64, 128, 256, 512]:
        folder = HERE / "icons" / "hicolor" / f"{size}x{size}" / "apps"
        folder.mkdir(parents=True, exist_ok=True)
        master.resize((size, size), Image.LANCZOS).save(folder / "korean-stt.png")
    print("  icons/hicolor/...   korean-stt.png (GTK 아이콘 테마)")


if __name__ == "__main__":
    main()
