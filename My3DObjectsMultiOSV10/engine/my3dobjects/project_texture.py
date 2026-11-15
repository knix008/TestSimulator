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


def _depth_maps(torch, pos, faces, uu, vv, zn, width, height, device, back=True):
    """Front and back depth (normalised 0 = nearest the viewer) per pixel of the
    cropped picture, NaN where the shape is not (the front only with back=False)."""
    out = []
    for depth in ((zn, 1.0 - zn) if back else (zn,)):
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


# ---------------------------------------------------------------------------
# The picture onto a model's own vertex colours (TRELLIS).
#
# TRELLIS's mesh decoder colours every vertex itself, but those colours are
# blurred: the official demo bakes its texture from the Gaussian decoder,
# which needs compiled CUDA renderers. The picture is the front view, so on
# what the front sees its pixels replace the model's colour. Elsewhere:
#   - the model's colours are first brought to the picture's tone (they are
#     duller and darker), by an affine colour map fitted on the front;
#   - the back takes the picture's colour at the same place where the
#     model's own guess for the back agrees with it in the large (the back
#     of a shirt is the shirt; the back of a head is hair, not a face);
#   - what neither view sees keeps the toned model colour.
# The model's colour takes over gradually where the surface turns away from
# the viewer (the picture would be smeared there). The mesh is dense (FlexiCubes at 256³),
# so per-vertex colours carry about as much detail as the 518-pixel picture
# the model saw.
#
# The model's facing is also checked: of the four quarter turns about the
# vertical, the one whose front view agrees best with the picture (colours
# where seen, outline) is used.

# Blending by facing: |normal · view| below FACING_LOW keeps the model's
# colour, above FACING_HIGH takes the picture's.
FACING_LOW, FACING_HIGH = 0.2, 0.6
# A quarter turn is taken only when it agrees this much better than none.
TURN_MARGIN = 0.85


def _quarter_turn(k):
    """Rotation about +Y by k · 90° (right-handed), as a 3 × 3 matrix."""
    c, s = ((1, 0), (0, 1), (-1, 0), (0, -1))[k % 4]
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]], dtype=np.float64)


def _front_projection(pos, width, height):
    lo, hi = pos.min(0), pos.max(0)
    span = np.maximum(hi - lo, 1e-9)
    uu = (pos[:, 0] - lo[0]) / span[0] * width
    vv = (hi[1] - pos[:, 1]) / span[1] * height
    zn = (hi[2] - pos[:, 2]) / span[2]
    return uu, vv, zn


def _front_look(torch, pos, normals, faces, rgb, alpha, device):
    """What the front view of `pos` takes from the picture: per vertex the
    picture's colour, its weight (0 = keep the model's), and the outline's
    agreement with the picture's (intersection over union)."""
    height, width = alpha.shape
    uu, vv, zn = _front_projection(pos, width, height)
    front = _depth_maps(torch, pos, faces, uu, vv, zn, width, height, device, back=False)[0]
    iu = np.clip(uu.astype(np.int64), 0, width - 1)
    iv = np.clip(vv.astype(np.int64), 0, height - 1)
    f = front[iv, iu]
    a = alpha[iv, iu]
    seen = (a > 0.5) & np.isfinite(f) & (zn <= f + SEEN_TOLERANCE)
    colour = np.zeros((len(pos), 3))
    colour[seen] = _sample_at_depth(rgb, front, uu[seen], vv[seen], zn[seen])
    facing = np.clip((np.abs(normals[:, 2]) - FACING_LOW) / (FACING_HIGH - FACING_LOW), 0.0, 1.0)
    weight = np.where(seen, facing * a, 0.0)
    shape = np.isfinite(front)
    solid = alpha > 0.5
    iou = (shape & solid).sum() / max(1, (shape | solid).sum())
    return colour, weight, float(iou)


def picture_on_vertex_colours(vertices, faces, normals, model_rgb, image, device="cpu", turns=True, log=None):
    """The model's vertex colours (V, 3, 0..1) with the picture laid over
    what the front (+Z) sees. Returns (colours, k, share): k quarter turns
    about +Y to apply to the mesh first (0 when it already faces the
    picture), share the part of the vertices that took the picture."""
    import torch

    rgb, alpha = _picture(image)
    verts = np.asarray(vertices, dtype=np.float64)
    faces = np.asarray(faces, dtype=np.int64)
    normals = np.asarray(normals, dtype=np.float64)
    model_rgb = np.asarray(model_rgb, dtype=np.float64)

    best = None
    for k in (range(4) if turns else (0,)):
        r = _quarter_turn(k)
        colour, weight, iou = _front_look(torch, verts @ r.T, normals @ r.T, faces, rgb, alpha, device)
        wsum = weight.sum()
        err = (weight * np.abs(colour - model_rgb).mean(1)).sum() / wsum if wsum > 0 else 1.0
        score = err + 0.25 * (1.0 - iou)
        if k == 0:
            first = score
        if best is None or score < best[0]:
            best = (score, k, colour, weight)
    score, k, colour, weight = best
    if k and score > first * TURN_MARGIN:
        k = 0
    r = _quarter_turn(k)
    pos, nrm = verts @ r.T, normals @ r.T

    front_col, front_w, back_col, back_w, blurred = _both_views(torch, pos, nrm, faces, rgb, alpha, device)
    # 1. The model's colours in the picture's tone: TRELLIS's are duller and
    #    darker; an affine map fitted where the front sees both corrects every
    #    vertex, the unseen ones too.
    base = _match_tone(model_rgb, front_col, front_w)
    # 2. The back: the colour at the same place in the picture (the back of
    #    most objects is coloured like the front), but only where the model's
    #    own guess for the back agrees with it in the large — the back of a
    #    head is hair, not a face.
    diff = np.abs(blurred - base).max(1)
    agree = np.clip(1.0 - (diff - AGREE_FULL) / (AGREE_NONE - AGREE_FULL), 0.0, 1.0)
    # Softened only inward (min), so no weight reaches a vertex the view
    # does not see (its colour there is not the picture's).
    back_w = back_w * agree
    back_w = np.minimum(back_w, _smooth_vertex(back_w, faces, rounds=3))
    front_w = np.minimum(front_w, _smooth_vertex(front_w, faces, rounds=1))
    out = base + back_w[:, None] * (back_col - base)
    out = out + front_w[:, None] * (front_col - out)
    share = float((front_w > 0.5).mean())
    back_share = float((back_w > 0.5).mean())
    if log:
        turned = f", turned {k * 90}° to face the picture" if k else ""
        log.info(f"Picture laid onto the model's colours: {share * 100:.0f} % of the surface from the front, "
                 f"{back_share * 100:.0f} % from the back, the rest the model's colours in the picture's tone{turned}.")
    return np.clip(out, 0.0, 1.0), k, share


# The back takes the picture where its blurred colour is within AGREE_FULL
# of the model's (0..1, largest channel), not at all beyond AGREE_NONE.
AGREE_FULL, AGREE_NONE = 0.12, 0.3
BLUR_PX = 0.02                     # of the picture's larger side


def _blurred_picture(rgb, alpha):
    """The picture's large-scale colour (alpha-weighted, so the background
    does not bleed in at the outline)."""
    import torch

    h, w = alpha.shape
    sigma = max(1.0, BLUR_PX * max(h, w))
    radius = int(3 * sigma)
    x = torch.arange(-radius, radius + 1, dtype=torch.float32)
    k = torch.exp(-(x / sigma) ** 2 / 2)
    k = k / k.sum()
    a = torch.from_numpy(alpha.astype(np.float32))[None, None]
    c = torch.from_numpy((rgb * alpha[..., None]).astype(np.float32)).permute(2, 0, 1)[None]
    stack = torch.cat([c, a], 1)
    for kern in (k.view(1, 1, 1, -1), k.view(1, 1, -1, 1)):
        pad = (radius, radius, 0, 0) if kern.shape[-1] > 1 else (0, 0, radius, radius)
        stack = torch.nn.functional.conv2d(torch.nn.functional.pad(stack, pad, mode="replicate"),
                                           kern.expand(4, 1, *kern.shape[-2:]).contiguous(), groups=4)
    out = stack[0, :3] / stack[0, 3:].clamp(min=1e-4)
    return out.permute(1, 2, 0).numpy().astype(np.float64)


def _both_views(torch, pos, normals, faces, rgb, alpha, device):
    """Per vertex: the picture's colour and weight as seen from the front and
    from the back, and the blurred picture's colour at the vertex's place."""
    height, width = alpha.shape
    uu, vv, zn = _front_projection(pos, width, height)
    front, back = _depth_maps(torch, pos, faces, uu, vv, zn, width, height, device)
    iu = np.clip(uu.astype(np.int64), 0, width - 1)
    iv = np.clip(vv.astype(np.int64), 0, height - 1)
    a = alpha[iv, iu]
    f, b = front[iv, iu], back[iv, iu]
    by_front = (a > 0.5) & np.isfinite(f) & (zn <= f + SEEN_TOLERANCE)
    by_back = (a > 0.5) & np.isfinite(b) & ((1.0 - zn) <= b + SEEN_TOLERANCE) & ~by_front
    facing = np.clip((np.abs(normals[:, 2]) - FACING_LOW) / (FACING_HIGH - FACING_LOW), 0.0, 1.0)
    fc = np.zeros((len(pos), 3))
    bc = np.zeros((len(pos), 3))
    fc[by_front] = _sample_at_depth(rgb, front, uu[by_front], vv[by_front], zn[by_front])
    bc[by_back] = _sample_at_depth(rgb, back, uu[by_back], vv[by_back], 1.0 - zn[by_back])
    blur = _blurred_picture(rgb, alpha)
    blurred = blur[np.clip(np.rint(vv - 0.5).astype(np.int64), 0, height - 1),
                   np.clip(np.rint(uu - 0.5).astype(np.int64), 0, width - 1)]
    return fc, np.where(by_front, facing * a, 0.0), bc, np.where(by_back, facing * a, 0.0), blurred


def _match_tone(model, picture, weight, ridge=0.05):
    """An affine colour map model → picture fitted (weighted least squares,
    pulled toward no change) where the front sees both."""
    sel = weight > 0.5
    if sel.sum() < 30:
        return model
    x = np.concatenate([model[sel], np.ones((sel.sum(), 1))], 1)
    y = picture[sel]
    ident = np.vstack([np.eye(3), np.zeros((1, 3))])
    lam = ridge * len(x)
    a = np.linalg.solve(x.T @ x + lam * np.eye(4), x.T @ y + lam * ident)
    out = np.concatenate([model, np.ones((len(model), 1))], 1) @ a
    return np.clip(out, 0.0, 1.0)


def _smooth_vertex(values, faces, rounds=2):
    """Averages a per-vertex value with its neighbours (edges of `faces`)."""
    n = len(values)
    edges = np.concatenate([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]])
    edges = np.concatenate([edges, edges[:, ::-1]])
    cnt = np.bincount(edges[:, 0], minlength=n).astype(np.float64)
    out = values.astype(np.float64)
    for _ in range(rounds):
        acc = np.bincount(edges[:, 0], weights=out[edges[:, 1]], minlength=n)
        out = (out + acc) / (1.0 + cnt)
    return out
