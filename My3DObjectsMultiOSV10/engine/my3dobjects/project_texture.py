"""A texture for an untextured shape, projected from the picture it was made from.

For models that give a shape only (Hunyuan3D's shape model): the input
picture is the front view of the object, so its colours can be laid onto the
surface along the view direction. No network, no extra weights, any device.

  1. UVs from xatlas.
  2. The shape seen from the front (+Z, looking at −Z), orthographically and
     fitted to the picture's silhouette: the box of the shape's x / y onto the
     box of the picture's opaque pixels. Depth maps from the front and from the
     back tell what each view sees.
  3. Each texel's surface point: seen from the front → the picture's colour
     there; seen from the back → the colour at the same place in the picture
     (the back of most objects is coloured like the front); hidden in both
     (under an arm, inside a fold) → filled from its neighbours over the
     surface, so no colour of what hides it leaks in.
  4. The colour is grown a few texels past each UV island so seams do not
     show the background.

Returns a trimesh with TextureVisuals (base colour only).
"""

import numpy as np

from .raster_image import interpolate, rasterize_image

# How far apart (in units of the shape's depth range) a point and the depth
# map may be and still count as seen.
SEEN_TOLERANCE = 0.012
SEAM_PADDING = 8


def _picture(image):
    """The picture's RGB (0..1) and alpha cropped to its opaque part."""
    rgba = np.asarray(image.convert("RGBA"), dtype=np.float32) / 255.0
    alpha = rgba[..., 3]
    ys, xs = np.nonzero(alpha > 0.5)
    if len(xs) == 0:
        raise ValueError("The picture has no opaque pixels to take colours from.")
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    return rgba[y0:y1, x0:x1, :3], alpha[y0:y1, x0:x1]


def _sample_at_depth(img, depth_map, u, v, z):
    """Bilinear samples of img (H, W, C) at pixel coordinates (u right, v
    down), but only from the pixels whose depth is the point's own:
    next to an occluder's outline a plain bilinear sample mixes in the
    occluder's colour (and the filling-in would spread it)."""
    h, w = img.shape[:2]
    u = np.clip(u - 0.5, 0, w - 1)
    v = np.clip(v - 0.5, 0, h - 1)
    u0 = np.floor(u).astype(np.int64)
    v0 = np.floor(v).astype(np.int64)
    fu = u - u0
    fv = v - v0
    acc = np.zeros((len(u), img.shape[2]))
    wsum = np.zeros(len(u))
    for du, dv, wt in ((0, 0, (1 - fu) * (1 - fv)), (1, 0, fu * (1 - fv)), (0, 1, (1 - fu) * fv), (1, 1, fu * fv)):
        uu = np.minimum(u0 + du, w - 1)
        vv = np.minimum(v0 + dv, h - 1)
        d = depth_map[vv, uu]
        ok = np.isfinite(d) & (np.abs(d - z) <= SEEN_TOLERANCE * 2)
        wt = wt * ok
        acc += img[vv, uu] * wt[:, None]
        wsum += wt
    near = img[np.clip(np.rint(v).astype(np.int64), 0, h - 1), np.clip(np.rint(u).astype(np.int64), 0, w - 1)]
    return np.where(wsum[:, None] > 1e-6, acc / np.maximum(wsum, 1e-6)[:, None], near)


def _depth_maps(torch, pos, faces, uu, vv, zn, width, height, device):
    """Front and back depth (normalised 0 = nearest the viewer) per pixel of the
    cropped picture, NaN where the shape is not."""
    out = []
    for depth in (zn, 1.0 - zn):
        clip = torch.stack([
            torch.from_numpy(((uu - 0.5) / max(width - 1, 1)) * 2 - 1),
            torch.from_numpy(((vv - 0.5) / max(height - 1, 1)) * 2 - 1),
            torch.from_numpy(depth * 1.8 - 0.9),
            torch.ones(len(uu), dtype=torch.float64),
        ], 1).float().to(device)
        tri = torch.from_numpy(faces).to(device)
        fi, bary = rasterize_image(clip, tri, None, width, height)
        d = interpolate(torch.from_numpy(depth).float().to(device)[None, :, None], fi, bary, tri)[0, ..., 0]
        d = torch.where(fi > 0, d, torch.full_like(d, float("nan")))
        out.append(d.cpu().numpy())
    return out


def _spread(colour, known, faces, rounds=200):
    """Fills unknown vertices from known neighbours, ring by ring."""
    n = len(colour)
    edges = np.concatenate([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]])
    edges = np.concatenate([edges, edges[:, ::-1]])
    colour = colour.copy()
    known = known.copy()
    for _ in range(rounds):
        if known.all():
            break
        src_known = known[edges[:, 1]]
        e = edges[src_known & ~known[edges[:, 0]]]
        if len(e) == 0:
            break
        acc = np.zeros((n, colour.shape[1]))
        cnt = np.zeros(n)
        np.add.at(acc, e[:, 0], colour[e[:, 1]])
        np.add.at(cnt, e[:, 0], 1)
        new = cnt > 0
        colour[new] = acc[new] / cnt[new, None]
        known |= new
    colour[~known] = colour[known].mean(0) if known.any() else 0.75
    return colour


def _pad(texture, filled, steps):
    """Grows the filled texels outward `steps` texels (seam padding)."""
    tex = texture.copy()
    mask = filled.copy()
    h, w = mask.shape
    for _ in range(steps):
        acc = np.zeros_like(tex)
        cnt = np.zeros((h, w))
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            src = np.roll(np.roll(mask, dy, 0), dx, 1)
            acc += np.roll(np.roll(tex, dy, 0), dx, 1) * src[..., None]
            cnt += src
        grow = (cnt > 0) & ~mask
        if not grow.any():
            break
        tex[grow] = acc[grow] / cnt[grow, None]
        mask |= grow
    return tex


def project_texture(mesh, image, size=1024, device="cpu", log=None):
    import torch
    import trimesh
    import xatlas
    from PIL import Image

    rgb, alpha = _picture(image)
    height, width = alpha.shape
    verts = np.asarray(mesh.vertices, dtype=np.float64)
    faces0 = np.asarray(mesh.faces, dtype=np.int64)

    # 1. UVs. xatlas splits vertices along seams; vmapping points back.
    vmap, faces, uv = xatlas.parametrize(verts.astype(np.float32), faces0.astype(np.uint32))
    faces = faces.astype(np.int64)
    pos = verts[vmap]

    # 2. The front view fitted to the silhouette.
    lo, hi = pos.min(0), pos.max(0)
    span = np.maximum(hi - lo, 1e-9)
    uu = (pos[:, 0] - lo[0]) / span[0] * width
    vv = (hi[1] - pos[:, 1]) / span[1] * height
    zn = (hi[2] - pos[:, 2]) / span[2]                      # 0 = nearest the front
    front, back = _depth_maps(torch, pos, faces, uu, vv, zn, width, height, device)

    # 3. Per vertex first (for the hidden ones), then per texel.
    def seen(u, v, z):
        iu = np.clip(u.astype(np.int64), 0, width - 1)
        iv = np.clip(v.astype(np.int64), 0, height - 1)
        f = front[iv, iu]
        b = back[iv, iu]
        opaque = alpha[iv, iu] > 0.5
        by_front = opaque & np.isfinite(f) & (z <= f + SEEN_TOLERANCE)
        by_back = opaque & np.isfinite(b) & ((1.0 - z) <= b + SEEN_TOLERANCE) & ~by_front
        return by_front, by_back

    def colour(u, v, z, by_front, by_back, out):
        out[by_front] = _sample_at_depth(rgb, front, u[by_front], v[by_front], z[by_front])
        out[by_back] = _sample_at_depth(rgb, back, u[by_back], v[by_back], 1.0 - z[by_back])
        return by_front | by_back

    vcol = np.zeros((len(pos), 3))
    vseen = colour(uu, vv, zn, *seen(uu, vv, zn), vcol)
    vcol = _spread(vcol, vseen, faces)

    # Texels: rasterise the UV layout (rows run down from v = 1, as trimesh
    # writes UVs to glTF).
    tri = torch.from_numpy(faces).to(device)
    clip = torch.stack([torch.from_numpy(uv[:, 0] * 2 - 1), torch.from_numpy((1 - uv[:, 1]) * 2 - 1),
                        torch.zeros(len(uv), dtype=torch.float64), torch.ones(len(uv), dtype=torch.float64)], 1).float().to(device)
    fi, bary = rasterize_image(clip, tri, None, size, size)
    covered = (fi > 0).cpu().numpy()

    def at_texels(attr):
        a = torch.from_numpy(np.ascontiguousarray(attr)).float().to(device)[None]
        return interpolate(a, fi, bary, tri)[0].cpu().numpy()[covered]

    tu, tv, tz = (at_texels(np.stack([uu, vv, zn], 1)).T)
    tcol = at_texels(vcol)                                   # the filled-in fallback
    tseen = colour(tu, tv, tz, *seen(tu, tv, tz), tcol)

    texture = np.zeros((size, size, 3))
    texture[covered] = tcol
    texture = _pad(texture, covered, SEAM_PADDING)
    if log:
        log.info(f"Texture projected from the picture: {tseen.mean() * 100:.0f} % of the surface seen, the rest filled in.")

    img = Image.fromarray((np.clip(texture, 0, 1) * 255 + 0.5).astype(np.uint8), "RGB")
    material = trimesh.visual.material.PBRMaterial(baseColorTexture=img, metallicFactor=0.0, roughnessFactor=0.9)
    visual = trimesh.visual.TextureVisuals(uv=uv, material=material)
    return trimesh.Trimesh(vertices=pos, faces=faces, visual=visual, process=False)
