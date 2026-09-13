# -*- coding: utf-8 -*-
"""
천지인 한글 입력기 아이콘 생성기.

천지인의 세 요소를 그대로 마크로 쓴다.
    ·  하늘(점)   ㅡ  땅(가로)   ㅣ  사람(세로)

4배 크기로 그린 뒤 축소해서 가장자리를 부드럽게 만든다.

    python scripts/make_icon.py
"""
import os
from PIL import Image, ImageDraw

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets")
SIZES = [16, 20, 24, 32, 48, 64, 128, 256]

BG_TOP = (79, 110, 247)      # 인디고
BG_BOTTOM = (58, 84, 214)
MARK = (255, 255, 255)
SS = 4                        # 슈퍼샘플링 배율


def rounded_mask(size, radius):
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1],
                                           radius=radius, fill=255)
    return mask


def render(px):
    n = px * SS
    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))

    # 세로 그라데이션 배경
    grad = Image.new("RGBA", (1, n))
    gd = grad.load()
    for y in range(n):
        t = y / max(n - 1, 1)
        gd[0, y] = (
            round(BG_TOP[0] + (BG_BOTTOM[0] - BG_TOP[0]) * t),
            round(BG_TOP[1] + (BG_BOTTOM[1] - BG_TOP[1]) * t),
            round(BG_TOP[2] + (BG_BOTTOM[2] - BG_TOP[2]) * t),
            255,
        )
    grad = grad.resize((n, n))
    img.paste(grad, (0, 0), rounded_mask((n, n), int(n * 0.22)))

    d = ImageDraw.Draw(img)

    # ㅣ 사람 - 왼쪽 세로 막대
    bar_w = n * 0.115
    x0 = n * 0.235
    d.rounded_rectangle([x0, n * 0.20, x0 + bar_w, n * 0.80],
                        radius=bar_w / 2, fill=MARK)

    # · 하늘 - 오른쪽 위 점
    r = n * 0.082
    cx, cy = n * 0.635, n * 0.335
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=MARK)

    # ㅡ 땅 - 오른쪽 아래 가로 막대
    bar_h = n * 0.115
    y0 = n * 0.615
    d.rounded_rectangle([n * 0.475, y0, n * 0.795, y0 + bar_h],
                        radius=bar_h / 2, fill=MARK)

    return img.resize((px, px), Image.LANCZOS)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    frames = [render(s) for s in SIZES]
    ico = os.path.join(OUT_DIR, "chunjiin.ico")
    frames[-1].save(ico, format="ICO",
                    sizes=[(s, s) for s in SIZES])
    frames[-1].save(os.path.join(OUT_DIR, "chunjiin.png"), format="PNG")
    print("wrote", ico)
    print("Windows 실행 파일에 넣으려면:  .\\scripts\\embed-win-icon.ps1")


if __name__ == "__main__":
    main()
