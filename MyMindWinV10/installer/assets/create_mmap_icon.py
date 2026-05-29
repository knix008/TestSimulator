"""Generate mmap_file.ico — mind map document icon (branching nodes on dark canvas)."""
from PIL import Image, ImageDraw

BG = (26, 31, 46, 255)
ROOT = (102, 126, 234, 255)
BRANCHES = [
    (116, 185, 255, 255),
    (85, 239, 203, 255),
    (255, 127, 181, 255),
    (255, 211, 110, 255),
]


def draw_mmap_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), BG)
    d = ImageDraw.Draw(img)
    pad = max(2, size // 16)
    cx, cy = size // 2, size // 2
    node_r = max(3, size // 7)
    line_w = max(1, size // 24)

    # subtle document frame
    doc_margin = pad
    d.rounded_rectangle(
        [doc_margin, doc_margin, size - doc_margin, size - doc_margin],
        radius=max(2, size // 12),
        outline=(70, 80, 110, 180),
        width=max(1, size // 48),
    )

    # branch lines (mind map)
    tips = [
        (cx - int(size * 0.28), cy - int(size * 0.22)),
        (cx + int(size * 0.30), cy - int(size * 0.18)),
        (cx - int(size * 0.22), cy + int(size * 0.26)),
        (cx + int(size * 0.26), cy + int(size * 0.24)),
    ]
    for i, (tx, ty) in enumerate(tips):
        d.line([(cx, cy), (tx, ty)], fill=BRANCHES[i], width=line_w)
        cr = max(2, node_r - 1)
        d.ellipse([tx - cr, ty - cr, tx + cr, ty + cr], fill=BRANCHES[i])

    # root node
    d.ellipse([cx - node_r, cy - node_r, cx + node_r, cy + node_r], fill=ROOT)
    highlight = (
        int(ROOT[0] * 0.7 + 255 * 0.3),
        int(ROOT[1] * 0.7 + 255 * 0.3),
        int(ROOT[2] * 0.7 + 255 * 0.3),
        200,
    )
    hr = max(1, node_r // 2)
    d.ellipse([cx - hr, cy - hr, cx + hr, cy + hr], fill=highlight)

    return img


def main() -> None:
    sizes = [256, 128, 64, 48, 32, 16]
    images = [draw_mmap_icon(s) for s in sizes]
    out = __file__.replace("create_mmap_icon.py", "mmap_file.ico")
    images[0].save(
        out,
        format="ICO",
        sizes=[(s, s) for s in sizes],
        append_images=images[1:],
    )
    print(f"Created {out} ({len(images)} sizes)")


if __name__ == "__main__":
    main()
