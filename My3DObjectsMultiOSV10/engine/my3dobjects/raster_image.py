"""Triangle rasterization in plain PyTorch (CPU, CUDA or MPS).

The same results as Hunyuan3D-2's compiled `custom_rasterizer_kernel`
(`rasterize_image`), so its texture pipeline runs without compiling CUDA code,
and the engine's own texture projection uses it too.

  pos   (N, 4) clip coordinates; screen x = (x/w · 0.5 + 0.5)(W − 1) + 0.5,
        y the same with H (no flip), depth z/w · 0.49999 + 0.5
  tri   (M, 3) vertex indices
  → findices (H, W) int32: 1 + the nearest face at each pixel centre, 0 for none
    barycentric (H, W, 3) float32, perspective-corrected, 0 where no face

A pixel (px + 0.5, py + 0.5) is covered when its three barycentric
coordinates all lie in [0, 1]. The nearest face has the smallest depth,
quantized to 2¹⁸ steps; equal depths go to the lower face index. With a
depth prior, faces nearer than `prior · 0.49999 + 0.5 + truncation` at that
pixel are skipped (Hunyuan peels layers this way).

Where the kernel runs one thread per face, this expands every face's bounding
box into (face, pixel) candidates, in chunks of at most CHUNK candidates, and
keeps the nearest per pixel with scatter_reduce.
"""

import torch

CHUNK = 1 << 24
DEPTH_STEPS = 1 << 18            # the kernel's (2 << 17)
FACE_SLOTS = 1 << 31             # depth · FACE_SLOTS + face + 1 fits in int64


def _screen(pos, width, height):
    w = pos[:, 3]
    x = (pos[:, 0] / w * 0.5 + 0.5) * (width - 1) + 0.5
    y = (0.5 + 0.5 * pos[:, 1] / w) * (height - 1) + 0.5
    z = pos[:, 2] / w * 0.49999 + 0.5
    return x, y, z, w


def _signed_area2(ax, ay, bx, by, cx, cy):
    return (cx - ax) * (by - ay) - (bx - ax) * (cy - ay)


def _barycentric(ax, ay, bx, by, cx, cy, px, py):
    """The kernel's calculateBarycentricCoordinate; -1s for a degenerate face."""
    area = _signed_area2(ax, ay, bx, by, cx, cy)
    safe = torch.where(area == 0, torch.ones_like(area), area)
    beta = _signed_area2(ax, ay, px, py, cx, cy) / safe
    gamma = _signed_area2(ax, ay, bx, by, px, py) / safe
    alpha = 1.0 - beta - gamma
    bad = area == 0
    neg = torch.full_like(alpha, -1.0)
    return torch.where(bad, neg, alpha), torch.where(bad, neg, beta), torch.where(bad, neg, gamma)


def rasterize_image(pos, tri, depth_prior, width, height, occlusion_truncation=1e-6, use_depth_prior=0):
    device = pos.device
    pos = pos.float()
    tri = tri.long()
    width, height = int(width), int(height)
    x, y, z, _w = _screen(pos, width, height)
    fx, fy, fz = x[tri], y[tri], z[tri]                        # (M, 3)

    # The kernel's pixel range: int(min) … < max + 1 (C casts toward zero).
    x0 = torch.clamp(torch.trunc(fx.min(1).values), min=0).long()
    y0 = torch.clamp(torch.trunc(fy.min(1).values), min=0).long()
    x1 = torch.clamp(torch.ceil(fx.max(1).values + 1).long() - 1, max=width - 1)
    y1 = torch.clamp(torch.ceil(fy.max(1).values + 1).long() - 1, max=height - 1)
    nx = (x1 - x0 + 1).clamp(min=0)
    ny = (y1 - y0 + 1).clamp(min=0)
    counts = nx * ny

    sentinel = torch.iinfo(torch.int64).max
    zbuf = torch.full((height * width,), sentinel, dtype=torch.int64, device=device)
    prior = None
    if use_depth_prior and depth_prior is not None and depth_prior.numel():
        prior = depth_prior.reshape(-1).float().to(device) * 0.49999 + 0.5 + occlusion_truncation

    faces = torch.nonzero(counts > 0).flatten()
    start = 0
    total = counts[faces]
    cum = torch.cumsum(total, 0)
    while start < len(faces):
        # As many faces as fit in one chunk (at least one, however large).
        base = cum[start - 1] if start else torch.zeros((), dtype=cum.dtype, device=device)
        end = int(torch.searchsorted(cum, base + CHUNK, right=True))
        end = max(end, start + 1)
        f = faces[start:end]
        n = counts[f]
        fid = torch.repeat_interleave(f, n)
        offset = torch.arange(int(n.sum()), device=device) - torch.repeat_interleave(torch.cumsum(n, 0) - n, n)
        px = x0[fid] + offset % nx[fid]
        py = y0[fid] + torch.div(offset, nx[fid], rounding_mode="floor")
        cx, cy = px.float() + 0.5, py.float() + 0.5
        a, b, c = _barycentric(fx[fid, 0], fy[fid, 0], fx[fid, 1], fy[fid, 1], fx[fid, 2], fy[fid, 2], cx, cy)
        inside = (a >= 0) & (a <= 1) & (b >= 0) & (b <= 1) & (c >= 0) & (c <= 1)
        depth = a * fz[fid, 0] + b * fz[fid, 1] + c * fz[fid, 2]
        pix = py * width + px
        if prior is not None:
            inside &= depth >= prior[pix]
        token = torch.trunc(depth * DEPTH_STEPS).long() * FACE_SLOTS + (fid + 1)
        zbuf.scatter_reduce_(0, pix[inside], token[inside], reduce="amin")
        start = end

    hit = zbuf != sentinel
    face = torch.where(hit, torch.remainder(zbuf, FACE_SLOTS), torch.zeros_like(zbuf))
    findices = face.view(height, width).to(torch.int32)

    bary = torch.zeros((height * width, 3), dtype=torch.float32, device=device)
    idx = torch.nonzero(hit).flatten()
    if len(idx):
        f = face[idx] - 1
        cx = (idx % width).float() + 0.5
        cy = torch.div(idx, width, rounding_mode="floor").float() + 0.5
        a, b, c = _barycentric(fx[f, 0], fy[f, 0], fx[f, 1], fy[f, 1], fx[f, 2], fy[f, 2], cx, cy)
        wv = pos[:, 3][tri[f]]                                   # (K, 3)
        abc = torch.stack([a, b, c], 1) / wv
        abc = abc / abc.sum(1, keepdim=True)
        bary[idx] = abc
    return findices, bary.view(height, width, 3)


def interpolate(col, findices, barycentric, tri):
    """Per-vertex attributes `col` (1, N, C) at each pixel → (1, H, W, C)."""
    f = findices - 1 + (findices == 0)
    vcol = col[0, tri.long()[f.long()]]
    result = torch.sum(barycentric.view(*barycentric.shape, 1) * vcol, dim=-2)
    return result.view(1, *result.shape)
