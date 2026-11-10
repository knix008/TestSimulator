"""Pure-PyTorch versions of SF3D's two compiled extensions.

Stable Fast 3D ships `texture_baker` and `uv_unwrapper` as C++ / CUDA
extensions that have to be compiled on the user's machine (a C++ compiler,
and on Windows Visual Studio). That cannot be part of an automatic install,
so the three operators they register are implemented here with tensor
operations instead, on whatever device the tensors live on:

  texture_baker_cpp::rasterize(uv, indices, bake_resolution)
  texture_baker_cpp::interpolate(attr, indices, rast)
  UVUnwrapper::assign_faces_uv_to_atlas_index(vertices, indices, face_uv, face_index)

The results follow the C++ code (csrc/baker.cpp, csrc/unwrapper.cpp): the same
pixel sampling, the same barycentric convention, the same rule for which of
two overlapping UV triangles is moved to the next atlas slice. Overlaps are
found on a sample grid rather than with exact triangle-triangle tests, which
can only miss overlaps smaller than a grid cell.
"""

import torch

# Candidate (triangle, pixel) pairs handled per step. Bounds the memory one
# step needs (a few hundred bytes per candidate) regardless of the mesh.
MAX_CANDIDATES = 1 << 22
# Sample grid for the overlap test, per cube-face group.
OVERLAP_RESOLUTION = 1024
_EPS = 1e-6


def _compute_device(t):
    # MPS lacks some scatter reductions; the CPU is fast enough for these.
    return torch.device("cpu") if t.device.type == "mps" else t.device


def _candidates(tri, res, centered):
    """Yields (triangle index, row, col, u, v, w, inside) for every pixel of
    every triangle's bounding box, a bounded number at a time.

    tri: (N, 3, 2) float UVs. A pixel (row r, col c) samples the point
    (c / res, 1 - r / res) like baker.cpp, or the pixel centre when
    `centered` ((c + .5) / res, (r + .5) / res), as the overlap test wants.
    """
    n = tri.shape[0]
    if n == 0:
        return
    dev = tri.device
    u = tri[..., 0]
    v = tri[..., 1]
    if centered:
        # c + .5 = u * res  →  c = u * res - .5
        c0 = torch.floor(u.amin(1) * res - 0.5)
        c1 = torch.ceil(u.amax(1) * res - 0.5)
        r0 = torch.floor(v.amin(1) * res - 0.5)
        r1 = torch.ceil(v.amax(1) * res - 0.5)
    else:
        c0 = torch.floor(u.amin(1) * res)
        c1 = torch.ceil(u.amax(1) * res)
        # v = 1 - r / res  →  r = (1 - v) * res
        r0 = torch.floor((1 - v.amax(1)) * res)
        r1 = torch.ceil((1 - v.amin(1)) * res)
    finite = torch.isfinite(c0) & torch.isfinite(c1) & torch.isfinite(r0) & torch.isfinite(r1)
    c0 = torch.where(finite, c0, torch.ones_like(c0)).clamp(0, res - 1).long()
    c1 = torch.where(finite, c1, torch.zeros_like(c1)).clamp(-1, res - 1).long()
    r0 = torch.where(finite, r0, torch.ones_like(r0)).clamp(0, res - 1).long()
    r1 = torch.where(finite, r1, torch.zeros_like(r1)).clamp(-1, res - 1).long()
    w = (c1 - c0 + 1).clamp(min=0)
    h = (r1 - r0 + 1).clamp(min=0)
    count = w * h
    ends = torch.cumsum(count, 0)
    total = int(ends[-1].item()) if n else 0
    if total == 0:
        return

    start_tri = 0
    while start_tri < n:
        base = int(ends[start_tri - 1].item()) if start_tri > 0 else 0
        # The last triangle that still fits; always at least one, even a huge one.
        stop_tri = int(torch.searchsorted(ends, torch.tensor(base + MAX_CANDIDATES, device=dev), right=True).item())
        stop_tri = max(stop_tri, start_tri + 1)
        stop_tri = min(stop_tri, n)
        ids = torch.arange(start_tri, stop_tri, device=dev)
        cnt = count[start_tri:stop_tri]
        m = int(cnt.sum().item())
        start_tri = stop_tri
        if m == 0:
            continue
        tid = torch.repeat_interleave(ids, cnt)
        first = (torch.cumsum(cnt, 0) - cnt)
        local = torch.arange(m, device=dev) - torch.repeat_interleave(first, cnt)
        wt = w[tid]
        col = c0[tid] + local % wt
        row = r0[tid] + torch.div(local, wt, rounding_mode="floor")
        if centered:
            px = (col.to(tri.dtype) + 0.5) / res
            py = (row.to(tri.dtype) + 0.5) / res
        else:
            px = col.to(tri.dtype) / res
            py = 1.0 - row.to(tri.dtype) / res
        t = tri[tid]
        v1, v2, v3 = t[:, 0], t[:, 1], t[:, 2]
        # baker.cpp barycentric_coordinates(): v, w against v1 → v2 and v1 → v3.
        e12 = v2 - v1
        e13 = v3 - v1
        ep = torch.stack([px, py], -1) - v1
        d00 = (e12 * e12).sum(-1)
        d01 = (e12 * e13).sum(-1)
        d11 = (e13 * e13).sum(-1)
        d20 = (ep * e12).sum(-1)
        d21 = (ep * e13).sum(-1)
        denom = d00 * d11 - d01 * d01
        safe = torch.where(denom == 0, torch.ones_like(denom), denom)
        bv = (d11 * d20 - d01 * d21) / safe
        bw = (d00 * d21 - d01 * d20) / safe
        bu = 1.0 - bv - bw
        if centered:
            inside = (bv > _EPS) & (bw > _EPS) & (bu > _EPS)
        else:
            inside = (bv >= 0) & (bw >= 0) & (bv + bw <= 1)
        inside &= denom != 0
        yield tid, row, col, bu, bv, bw, inside


def rasterize(uv, indices, bake_resolution):
    """(res, res, 4): barycentric u, v, w and the triangle index, -1 where no
    triangle covers the pixel. Same layout as texture_baker's rasterize()."""
    res = int(bake_resolution)
    out_dev = uv.device
    dev = _compute_device(uv)
    uv = uv.detach().to(dev, torch.float32)
    idx = indices.detach().to(dev).long()
    out = torch.zeros(res * res, 4, device=dev, dtype=torch.float32)
    out[:, 3] = -1.0
    tri = uv[idx]
    for tid, row, col, bu, bv, bw, inside in _candidates(tri, res, centered=False):
        if not bool(inside.any()):
            continue
        pix = (row * res + col)[inside]
        tid = tid[inside]
        vals = torch.stack([bu[inside], bv[inside], bw[inside], tid.to(torch.float32)], -1)
        # One winner per pixel, so a pixel never mixes two triangles' values.
        order = torch.arange(pix.shape[0], device=dev)
        best = torch.full((res * res,), -1, device=dev, dtype=torch.long)
        best.scatter_reduce_(0, pix, order, reduce="amax", include_self=True)
        keep = best[pix] == order
        out[pix[keep]] = vals[keep]
    return out.view(res, res, 4).to(out_dev)


def interpolate(attr, indices, rast):
    """Per-pixel interpolation of a per-vertex attribute over the rasterized
    map; zero where no triangle covers the pixel."""
    out_dev = attr.device
    dev = _compute_device(attr)
    attr = attr.detach().to(dev, torch.float32)
    rast = rast.detach().to(dev, torch.float32)
    idx = indices.detach().to(dev).long()
    h, w = rast.shape[0], rast.shape[1]
    out = torch.zeros(h, w, attr.shape[-1], device=dev, dtype=torch.float32)
    tri_id = rast[..., 3].long()
    mask = tri_id >= 0
    if bool(mask.any()):
        f = idx[tri_id[mask]]
        b = rast[mask][:, :3]
        out[mask] = attr[f[:, 0]] * b[:, 0:1] + attr[f[:, 1]] * b[:, 1:2] + attr[f[:, 2]] * b[:, 2:3]
    return out.to(out_dev)


def _move_occluded(assign, tri_uv, centroids, offset, res):
    """unwrapper.cpp perform_intersection_check(): among triangles in the six
    groups [offset, offset + 6) whose UVs overlap another triangle of the same
    group, every one that is not the front-most at that spot moves six groups
    on (at most to 12). "Front" is along the group's axis: the smallest
    centroid coordinate for the even (+) groups, the largest for the odd (-)
    ones; ties go to the lower triangle index."""
    dev = assign.device
    sel = torch.nonzero((assign >= offset) & (assign < offset + 6)).flatten()
    if sel.numel() < 2:
        return assign
    group = assign[sel] - offset
    axis = torch.tensor([0, 0, 1, 1, 2, 2], device=dev)[group % 6]
    pos = centroids[sel].gather(1, axis[:, None]).squeeze(1)
    use_max = (assign[sel] % 2) == 1
    score = torch.where(use_max, pos, -pos)
    cells = 6 * res * res
    count = torch.zeros(cells, device=dev, dtype=torch.long)
    best = torch.full((cells,), float("-inf"), device=dev, dtype=score.dtype)
    tri = tri_uv[sel]

    hits = []
    for tid, row, col, _bu, _bv, _bw, inside in _candidates(tri, res, centered=True):
        if not bool(inside.any()):
            continue
        tid = tid[inside]
        pix = group[tid] * (res * res) + row[inside] * res + col[inside]
        count.scatter_add_(0, pix, torch.ones_like(pix))
        best.scatter_reduce_(0, pix, score[tid], reduce="amax", include_self=True)
        hits.append((tid, pix))
    if not hits:
        return assign

    # Lowest index among the front-most at each cell.
    big = sel.numel()
    winner = torch.full((cells,), big, device=dev, dtype=torch.long)
    for tid, pix in hits:
        front = score[tid] >= best[pix]
        winner.scatter_reduce_(0, pix[front], tid[front], reduce="amin", include_self=True)

    occluded = torch.zeros(sel.numel(), device=dev, dtype=torch.bool)
    for tid, pix in hits:
        shared = count[pix] >= 2
        behind = shared & (winner[pix] != tid)
        if bool(behind.any()):
            occluded[tid[behind]] = True

    moved = sel[occluded]
    out = assign.clone()
    out[moved] = (out[moved] + 6).clamp(max=12)
    return out


def assign_faces_uv_to_atlas_index(vertices, indices, face_uv, face_index, resolution=OVERLAP_RESOLUTION):
    """The atlas slice (0–12) of every face: its cube face (0–5), moved to
    6–11 when another face of that cube face covers it in UV space, and to 12
    when that happens again."""
    dev = torch.device("cpu")
    verts = vertices.detach().to(dev, torch.float32)
    idx = indices.detach().to(dev).long()
    tri_uv = face_uv.detach().to(dev, torch.float32).reshape(-1, 3, 2)
    assign = face_index.detach().to(dev).long().clone()
    if assign.numel() == 0:
        return assign
    centroids = verts[idx].mean(1)
    assign = _move_occluded(assign, tri_uv, centroids, 0, resolution)
    assign = _move_occluded(assign, tri_uv, centroids, 6, resolution)
    return assign


_registered = False


def register_ops():
    """Registers the operators under the names the upstream Python wrappers
    call (torch.ops.texture_baker_cpp.*, torch.ops.UVUnwrapper.*). Safe to call
    more than once; returns False when a real compiled extension already
    defined them."""
    global _registered
    if _registered:
        return True
    from torch.library import Library

    try:
        baker = Library("texture_baker_cpp", "DEF")
        baker.define("rasterize(Tensor uv, Tensor indices, int bake_resolution) -> Tensor")
        baker.define("interpolate(Tensor attr, Tensor indices, Tensor rast) -> Tensor")
        baker.impl("rasterize", lambda uv, ind, res: rasterize(uv, ind, res), "CompositeExplicitAutograd")
        baker.impl("interpolate", lambda a, ind, r: interpolate(a, ind, r), "CompositeExplicitAutograd")
        unwrap = Library("UVUnwrapper", "DEF")
        unwrap.define(
            "assign_faces_uv_to_atlas_index(Tensor vertices, Tensor indices, Tensor face_uv, Tensor face_index) -> Tensor"
        )
        unwrap.impl(
            "assign_faces_uv_to_atlas_index",
            lambda v, i, uv, fi: assign_faces_uv_to_atlas_index(v, i, uv, fi),
            "CompositeExplicitAutograd",
        )
    except RuntimeError:
        return False
    # Keep the libraries alive: dropping them unregisters the operators.
    register_ops._libs = (baker, unwrap)
    _registered = True
    return True
