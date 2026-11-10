"""Image → 3D: one loaded model at a time, the device it runs on, and the
steps around it (background removal, export).

The GPU is used when there is one (CUDA, else Apple's MPS), the CPU otherwise.
When a conversion fails on the GPU (out of memory, a driver error) the model
moves to the CPU and the same image is converted again there, so a result
always comes back; the log says what happened.
"""

import gc
import io
import os
import threading
import time
import zipfile

from .models import normalize_options

# Stage → (start, end) of the overall progress bar.
STAGES = {
    "queued": (0.0, 0.0),
    "loading": (0.0, 0.05),
    "background": (0.05, 0.12),
    "model": (0.12, 0.55),
    "mesh": (0.55, 0.65),
    "remesh": (0.65, 0.70),
    "uv": (0.70, 0.78),
    "bake": (0.78, 0.95),
    "export": (0.95, 1.0),
    "done": (1.0, 1.0),
}


class Cancelled(Exception):
    pass


def device_name(device):
    import torch

    if device == "cuda":
        try:
            return torch.cuda.get_device_name(0)
        except Exception:
            return "CUDA GPU"
    if device == "mps":
        return "Apple GPU (MPS)"
    return "CPU"


def pick_device(preference="auto"):
    import torch

    if preference == "cpu":
        return "cpu"
    if torch.cuda.is_available():
        return "cuda"
    mps = getattr(torch.backends, "mps", None)
    if mps is not None and mps.is_available():
        return "mps"
    return "cpu"


def is_device_error(err):
    import torch

    oom = getattr(torch.cuda, "OutOfMemoryError", None)
    if oom is not None and isinstance(err, oom):
        return True
    text = str(err).lower()
    return any(k in text for k in ("cuda", "cudnn", "cublas", "out of memory", "mps", "metal", "device-side"))


def upright_angle(vertices, limit_deg=35.0):
    """The tilt about X (radians) that stands a reconstructed object upright.

    Single-image models assume a level camera; a photo taken from above makes
    the object lean towards the viewer by about the camera's elevation. The
    model faces +Z and stands on Y, so that lean is a rotation about X. Most
    objects stand squarely, so the angle that makes their box in the Y-Z
    plane smallest is taken — only when it clearly beats leaving it alone, so
    an object that is meant to be slanted is not "corrected".

    A tall object is stood by its centre line instead (see _centre_line_turn):
    the models also shear it — a chess pawn's round base, seen from above as
    an ellipse, comes out as a sloping disc — and levelling that base by the
    box tipped the whole pawn back by 10°.
    """
    pts = _hull_points(vertices)
    if pts is None:
        return 0.0
    all_pts = _sample_points(vertices)
    return _lean_turn(pts[:, 1], pts[:, 2], all_pts[:, 1], all_pts[:, 2], limit_deg)


def upright_rotation(vertices, limit_deg=35.0):
    """The rotation (3×3) that stands a reconstructed object upright, and
    the two angles it is made of: (matrix, about X, about Z), in radians.

    Besides the lean towards the viewer (about X, see upright_angle), a
    camera that was not held level leans the object sideways, about Z; the
    same squarest-box rule finds that one in the X-Y plane. The two affect
    each other, so they are taken in turns until neither moves.
    """
    import numpy as np

    pts = _hull_points(vertices)
    turn = np.eye(3)
    total_x = total_z = 0.0
    if pts is None:
        return turn, 0.0, 0.0
    all_pts = _sample_points(vertices)
    for _ in range(4):
        ax = _lean_turn(pts[:, 1], pts[:, 2], all_pts[:, 1], all_pts[:, 2], limit_deg)
        if ax:
            c, s = np.cos(ax), np.sin(ax)
            step = np.array([[1, 0, 0], [0, c, -s], [0, s, c]])
            pts, all_pts, turn, total_x = pts @ step.T, all_pts @ step.T, step @ turn, total_x + ax
        az = _squarest_turn(pts[:, 0], pts[:, 1], limit_deg)
        if az:
            c, s = np.cos(az), np.sin(az)
            step = np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])
            pts, all_pts, turn, total_z = pts @ step.T, all_pts @ step.T, step @ turn, total_z + az
        if not ax and not az:
            break
    return turn, float(total_x), float(total_z)


def _hull_points(vertices):
    """The points of the convex hull (all that a bounding box depends on),
    or None when there are too few to tell anything."""
    import numpy as np

    pts = np.asarray(vertices, dtype=np.float64)
    if len(pts) < 8:
        return None
    try:
        import trimesh

        return np.asarray(trimesh.convex.convex_hull(pts).vertices)
    except Exception:  # noqa: BLE001 — a hull is only a speed-up
        if len(pts) > 20000:
            pts = pts[np.linspace(0, len(pts) - 1, 20000).astype(int)]
        return pts


def _sample_points(vertices, limit=200000):
    """The vertices, thinned out evenly to at most `limit`."""
    import numpy as np

    pts = np.asarray(vertices, dtype=np.float64)
    if len(pts) > limit:
        pts = pts[np.linspace(0, len(pts) - 1, limit).astype(int)]
    return pts


def _lean_turn(hull_y, hull_z, y, z, limit_deg):
    """The turn about X: by the centre line for a tall object that has one,
    else by the squarest box."""
    by_box = _squarest_turn(hull_y, hull_z, limit_deg)
    by_line = _centre_line_turn(y, z, limit_deg, start=by_box)
    return by_line if by_line is not None else by_box


def _centre_line_turn(y, z, limit_deg, start=0.0, tall=1.3, bins=20):
    """The turn about X (radians) that makes the line through the middles of
    the object's horizontal slices vertical, or None when that line says
    nothing: the object is not clearly taller than deep, or the middles do
    not lie along a line (a chair, a person leaning on purpose).

    Tallness is judged stood up by `start` (the box's turn): leaning, a tall
    object looks deeper and shorter than it is. The slices run from 10% to
    95% of the height: the base is where the models distort most. The turn
    is refined a few times, since the slices themselves change as the
    object turns.
    """
    import numpy as np

    c, s = np.cos(start), np.sin(start)
    if np.ptp(y * c - z * s) < tall * np.ptp(y * s + z * c):
        return None
    angle = float(start)
    for _ in range(4):
        c, s = np.cos(angle), np.sin(angle)
        yy, zz = y * c - z * s, y * s + z * c
        lo, hi = yy.min(), yy.max()
        edges = lo + (hi - lo) * np.linspace(0.10, 0.95, bins + 1)
        which = np.digitize(yy, edges) - 1
        mids, heights = [], []
        for i in range(bins):
            sel = zz[which == i]
            if len(sel) >= 10:
                mids.append((sel.min() + sel.max()) / 2)
                heights.append((edges[i] + edges[i + 1]) / 2)
        if len(mids) < bins * 0.75:
            return None
        slope, offset = np.polyfit(heights, mids, 1)
        spread = np.std(np.asarray(mids) - (slope * np.asarray(heights) + offset))
        if spread > 0.06 * np.ptp(zz):
            return None
        step = np.arctan(slope)
        angle -= step
        if abs(step) < np.radians(0.1):
            break
    if abs(np.degrees(angle)) < 1.0:
        return 0.0
    if abs(np.degrees(angle)) > limit_deg:
        return None
    return float(angle)


def _squarest_turn(a, b, limit_deg):
    """The turn in the a-b plane (radians, a towards b negative) that makes
    the box of the points there smallest, or 0.0 when that does not clearly
    beat leaving them alone."""
    import numpy as np

    def area(rad):
        c, s = np.cos(rad), np.sin(rad)
        return np.ptp(a * c - b * s) * np.ptp(a * s + b * c)

    coarse = np.radians(np.arange(-limit_deg, limit_deg + 0.5, 1.0))
    best = coarse[int(np.argmin([area(r) for r in coarse]))]
    fine = best + np.radians(np.arange(-1.0, 1.01, 0.1))
    best = fine[int(np.argmin([area(r) for r in fine]))]
    if abs(np.degrees(best)) < 1.0 or area(best) > area(0.0) * 0.97:
        return 0.0
    return float(best)


def joined_surface(mesh):
    """The surface with the copies of each point joined, and for every vertex
    of `mesh` its joined vertex.

    Textured meshes split their vertices along UV seams. Anything that looks
    at neighbours (smoothing, normals, which faces touch) has to see through
    the seams, or it opens cracks and draws lines along them.
    """
    import numpy as np
    import trimesh

    # Copies are exact (indexing, or the same midpoint of a seam edge). A
    # tolerance would also join distinct points of the tiny edges marching
    # cubes leaves, tearing the surface there. (+ 0.0 makes -0.0 equal 0.0.)
    v = np.asarray(mesh.vertices, dtype=np.float64) + 0.0
    _, first, inverse = np.unique(v, axis=0, return_index=True, return_inverse=True)
    inverse = inverse.reshape(-1)
    return trimesh.Trimesh(v[first], inverse[np.asarray(mesh.faces)], process=False), inverse


def smooth_surface(mesh, iterations):
    """Taubin smoothing (keeps the volume) of the surface in place, with the
    seam copies joined and the result handed back to every copy (UVs stay as
    they are)."""
    import numpy as np
    import trimesh

    joined, inverse = joined_surface(mesh)
    trimesh.smoothing.filter_taubin(joined, lamb=0.5, nu=-0.53, iterations=int(iterations))
    mesh.vertices = np.asarray(joined.vertices)[inverse]


def face_outward(mesh):
    """Turns the faces round when they look into the object (the surface
    encloses a negative volume). True when it did."""
    joined, _ = joined_surface(mesh)
    if len(joined.faces) and joined.is_winding_consistent and joined.volume < 0:
        mesh.invert()
        return True
    return False


def drop_fragments(mesh, percent):
    """Removes the loose pieces with fewer faces than `percent` % of the
    largest piece (specks the model left floating around the object).
    Returns how many pieces were removed."""
    import numpy as np
    import trimesh

    if percent <= 0 or len(mesh.faces) == 0:
        return 0
    joined, _ = joined_surface(mesh)
    labels = trimesh.graph.connected_component_labels(joined.face_adjacency, node_count=len(joined.faces))
    counts = np.bincount(labels)
    small = counts < counts.max() * percent / 100.0
    if not small.any():
        return 0
    mesh.update_faces(~small[labels])
    mesh.remove_unreferenced_vertices()
    return int(small.sum())


def subdivide_surface(mesh, levels, carry=None):
    """Splits every triangle in four, `levels` times, carrying the UVs or
    vertex colours along (and the per-vertex arrays in `carry`, updated in
    place). Smoothing afterwards then has the vertices to round off what were
    flat facets. Returns the new mesh."""
    import numpy as np
    import trimesh

    carry = carry if carry is not None else {}
    for _ in range(int(levels)):
        vis = mesh.visual
        attrs = {f"carry:{k}": v for k, v in carry.items()}
        if vis.kind == "texture" and getattr(vis, "uv", None) is not None:
            attrs["uv"] = np.asarray(vis.uv, dtype=np.float64)
        elif vis.kind == "vertex":
            attrs["color"] = np.asarray(vis.vertex_colors, dtype=np.float64)
        v, f = trimesh.remesh.subdivide(mesh.vertices, mesh.faces)
        # The new vertices are the midpoints of the unique edges, in the order
        # subdivide() makes them; the attributes are worked out the same way.
        # (trimesh's own vertex_attributes pairs them with the wrong edges
        # — 4.4: scrambled UVs, the texture turns to noise.)
        edges = np.sort(trimesh.geometry.faces_to_edges(np.asarray(mesh.faces)), axis=1)
        unique, _ = trimesh.grouping.unique_rows(edges)
        ends = edges[unique]
        a = {k: np.vstack((val, val[ends].mean(axis=1))) for k, val in attrs.items()}
        for k in carry:
            carry[k] = a[f"carry:{k}"]
        if "uv" in attrs:
            visual = trimesh.visual.TextureVisuals(uv=a["uv"], material=vis.material)
        elif "color" in attrs:
            visual = trimesh.visual.ColorVisuals(vertex_colors=np.clip(np.round(a["color"]), 0, 255).astype(np.uint8))
        else:
            visual = None
        mesh = trimesh.Trimesh(v, f, visual=visual, process=False)
    return mesh


def seamless_normals(mesh):
    """Vertex normals taken over the joined surface, so both copies of a seam
    point get the same normal and no line shows along the seams."""
    joined, inverse = joined_surface(mesh)
    mesh.vertex_normals = joined.vertex_normals[inverse]
    return mesh.vertex_normals


def _tangent_frames(pos, faces, uv_file, face_id, bary, normals):
    """The tangent frame a viewer builds for a tangent-space normal map without
    tangents (three.js getTangentFrame: a cotangent frame from the position
    and UV derivatives, normalised by the longer axis), at sample points given
    as (face, barycentric). Returns T·scale, B·scale and N, each (n, 3)."""
    import numpy as np

    f = faces[face_id]
    p0, p1, p2 = pos[f[:, 0]], pos[f[:, 1]], pos[f[:, 2]]
    t0, t1, t2 = uv_file[f[:, 0]], uv_file[f[:, 1]], uv_file[f[:, 2]]
    n = normals[f[:, 0]] * bary[:, 0:1] + normals[f[:, 1]] * bary[:, 1:2] + normals[f[:, 2]] * bary[:, 2:3]
    n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)
    # Edges stand in for the screen derivatives: the frame is the same for
    # any basis of the triangle's plane that turns the same way round N.
    q0, q1 = p1 - p0, p2 - p0
    st0, st1 = t1 - t0, t2 - t0
    q1perp = np.cross(q1, n)
    q0perp = np.cross(n, q0)
    t = q1perp * st0[:, 0:1] + q0perp * st1[:, 0:1]
    b = q1perp * st0[:, 1:2] + q0perp * st1[:, 1:2]
    det = np.maximum((t * t).sum(1), (b * b).sum(1))
    scale = np.where(det > 0, 1.0 / np.sqrt(np.where(det > 0, det, 1.0)), 0.0)[:, None]
    return t * scale, b * scale, n


def rebake_normal_map(mesh, old_pos, old_normals, chunk=1 << 20):
    """Keeps a tangent-space normal map true after the surface moved.

    Stable Fast 3D bakes the fine detail of the surface into a normal map,
    relative to the frame of its own bumpy mesh. Smoothed or subdivided, the
    mesh has other frames, and the old map read in them turns into noise
    that buries the texture. So every texel is read as the viewer read it on
    the old surface (old positions and normals, carried along per vertex) and
    written again in the frame of the new one: the light falls on the same
    detail as before, on the cleaner shape. glTF without tangents is read by
    three.js with the green channel flipped; that is kept.
    Returns True when the mesh had a normal map to rework.
    """
    import numpy as np
    import torch
    from PIL import Image

    from .raster import rasterize

    vis = mesh.visual
    mat = getattr(vis, "material", None)
    img = getattr(mat, "normalTexture", None)
    if vis.kind != "texture" or img is None or getattr(vis, "uv", None) is None:
        return False
    w, h = img.size
    if w != h:
        return False
    uv = np.asarray(vis.uv, dtype=np.float64)
    faces = np.asarray(mesh.faces, dtype=np.int64)
    # Rows run down the image from v = 1 (the convention SF3D bakes with).
    rast = rasterize(torch.from_numpy(uv.astype(np.float32)), torch.from_numpy(faces), w).numpy().reshape(-1, 4)
    texels = np.nonzero(rast[:, 3] >= 0)[0]
    if texels.size == 0:
        return False
    data = np.asarray(img.convert("RGB"), dtype=np.float32).reshape(-1, 3) / 255.0
    # A material of its own: the job's raw mesh (refined again later) may
    # share this one, and its map must stay the model's.
    mat = mat.copy()
    vis.material = mat
    uv_file = np.stack([uv[:, 0], 1.0 - uv[:, 1]], 1)   # as written to glTF
    new_pos = np.asarray(mesh.vertices, dtype=np.float64)
    new_normals = np.asarray(joined_normals(mesh), dtype=np.float64)
    flip = np.array([1.0, -1.0, 1.0])                     # normalScale (1, -1)
    for start in range(0, texels.size, chunk):
        idx = texels[start:start + chunk]
        fid = rast[idx, 3].astype(np.int64)
        bary = rast[idx, :3].astype(np.float64)
        m = (data[idx].astype(np.float64) * 2.0 - 1.0) * flip
        t, b, n = _tangent_frames(old_pos, faces, uv_file, fid, bary, old_normals)
        world = t * m[:, 0:1] + b * m[:, 1:2] + n * m[:, 2:3]
        t, b, n = _tangent_frames(new_pos, faces, uv_file, fid, bary, new_normals)
        frame = np.stack([t, b, n], axis=2)                # columns T, B, N
        ok = np.abs(np.linalg.det(frame)) > 1e-12
        out = np.linalg.solve(np.where(ok[:, None, None], frame, np.eye(3)), world[..., None])[..., 0] * flip
        # The viewer normalises after mixing, so only the direction counts;
        # the texel's own length is kept so an unmoved surface keeps its map.
        out *= np.linalg.norm(m, axis=1, keepdims=True) / np.maximum(np.linalg.norm(out, axis=1, keepdims=True), 1e-12)
        keep = ok & np.isfinite(out).all(1)
        data[idx[keep]] = (out[keep] * 0.5 + 0.5).clip(0, 1).astype(np.float32)
    mat.normalTexture = Image.fromarray((data.reshape(h, w, 3) * 255.0 + 0.5).astype(np.uint8), "RGB")
    return True


def joined_normals(mesh):
    """Seam-free vertex normals of `mesh` (as seamless_normals sets them)."""
    joined, inverse = joined_surface(mesh)
    return joined.vertex_normals[inverse]


# The options finish_mesh reads: they can be changed on a finished result
# without running the model again (Engine.refine).
SURFACE_OPTIONS = ("minPartSize", "subdivide", "smoothing", "straighten")


def finish_mesh(mesh, options, log=None):
    """The clean-up after a model, on a copy of its raw mesh: faces outward,
    loose specks removed, subdivided, smoothed, stood upright, seamless
    normals. Returns (mesh, tilt in degrees)."""
    import numpy as np

    mesh = mesh.copy()
    if face_outward(mesh) and log:
        log.info("The faces looked inward; turned them round.")
    dropped = drop_fragments(mesh, float(options.get("minPartSize") or 0))
    if dropped and log:
        log.info(f"Removed {dropped} loose piece(s).")
    levels = int(options.get("subdivide") or 0)
    smoothing = int(options.get("smoothing") or 0)
    # The surface before it moves, per vertex, for the normal map's sake.
    carry = {}
    if levels > 0 or smoothing > 0:
        carry = {"pos": np.asarray(mesh.vertices, dtype=np.float64).copy(), "nrm": np.asarray(joined_normals(mesh), dtype=np.float64)}
    if levels > 0:
        mesh = subdivide_surface(mesh, levels, carry)
    if smoothing > 0:
        smooth_surface(mesh, smoothing)
    if carry and rebake_normal_map(mesh, carry["pos"], carry["nrm"]) and log:
        log.info("Re-baked the normal map for the cleaned-up surface.")
    tilt = 0.0
    if options.get("straighten"):
        turn, ax, az = upright_rotation(mesh.vertices)
        if ax or az:
            m = np.eye(4)
            m[:3, :3] = turn
            mesh.apply_transform(m)
            if log:
                log.info(f"Stood the model upright: tilted {np.degrees(ax):+.1f}° about X, {np.degrees(az):+.1f}° about Z.")
        # How far the up direction moved, whichever way.
        tilt = float(np.degrees(np.arccos(np.clip(turn[1, 1], -1.0, 1.0))))
    seamless_normals(mesh)
    return mesh, tilt


def linear_vertex_colors(glb):
    """GLB bytes with their vertex colours (COLOR_0) made linear, as glTF
    requires.

    The models give vertex colours in sRGB — the picture's own values — and
    trimesh writes them as they are. Every glTF reader (the app's viewer,
    Blender) takes COLOR_0 as linear and brightens it once more, so the
    colours came out pale and washed out (the robot's blue at saturation
    0.31 instead of the picture's 0.79). They are converted and stored as
    normalised 16-bit values: 8 bits of linear light would band in the
    darks. A vertex-coloured primitive with no material is also given a
    plain one: glTF's default is fully metallic, which takes no diffuse
    light, so the lights barely showed on it. Meshes without vertex colours
    come back untouched.
    """
    import json
    import struct

    import numpy as np

    if len(glb) < 20 or glb[:4] != b"glTF":
        return glb
    json_len, json_type = struct.unpack_from("<II", glb, 12)
    if json_type != 0x4E4F534A:
        return glb
    doc = json.loads(glb[20:20 + json_len])
    rest = 20 + json_len
    binary = b""
    if rest + 8 <= len(glb):
        bin_len, bin_type = struct.unpack_from("<II", glb, rest)
        if bin_type == 0x004E4942:
            binary = glb[rest + 8:rest + 8 + bin_len]
    accessors = doc.get("accessors", [])
    views = doc.get("bufferViews", [])
    wanted = sorted({
        p["attributes"]["COLOR_0"]
        for m in doc.get("meshes", []) for p in m.get("primitives", [])
        if "COLOR_0" in p.get("attributes", {})
    })
    out = bytearray(binary)
    changed = False
    for index in wanted:
        acc = accessors[index]
        if acc.get("componentType") not in (5121, 5126) or "bufferView" not in acc:
            continue
        comps = {"VEC3": 3, "VEC4": 4}.get(acc.get("type"))
        if not comps:
            continue
        view = views[acc["bufferView"]]
        size = 1 if acc["componentType"] == 5121 else 4
        stride = view.get("byteStride") or comps * size
        start = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
        count = acc["count"]
        dtype = np.uint8 if size == 1 else np.float32
        rows = np.frombuffer(bytes(binary[start:start + stride * count]).ljust(stride * count, b"\0"), np.uint8).reshape(count, stride)
        values = rows[:, :comps * size].copy().view(dtype).reshape(count, comps).astype(np.float64)
        if size == 1:
            values /= 255.0
        rgb = values[:, :3]
        values[:, :3] = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
        packed = np.round(np.clip(values, 0, 1) * 65535.0).astype("<u2").tobytes()
        while len(out) % 4:
            out.append(0)
        views.append({"buffer": 0, "byteOffset": len(out), "byteLength": len(packed), "target": 34962})
        out += packed
        acc.update({"bufferView": len(views) - 1, "byteOffset": 0, "componentType": 5123, "normalized": True})
        acc.pop("min", None)
        acc.pop("max", None)
        changed = True
    bare = [
        p for m in doc.get("meshes", []) for p in m.get("primitives", [])
        if "COLOR_0" in p.get("attributes", {}) and "material" not in p
    ]
    if bare:
        materials = doc.setdefault("materials", [])
        materials.append({"pbrMetallicRoughness": {"metallicFactor": 0.0, "roughnessFactor": 0.7}})
        for p in bare:
            p["material"] = len(materials) - 1
        changed = True
    if not changed:
        return glb
    while len(out) % 4:
        out.append(0)
    doc["buffers"][0]["byteLength"] = len(out)
    text = json.dumps(doc, separators=(",", ":")).encode("utf-8")
    text += b" " * (-len(text) % 4)
    total = 12 + 8 + len(text) + 8 + len(out)
    return (struct.pack("<III", 0x46546C67, 2, total)
            + struct.pack("<II", len(text), 0x4E4F534A) + text
            + struct.pack("<II", len(out), 0x004E4942) + bytes(out))


def open_input_image(data):
    """The picture sent with a job as an upright RGBA image: PNG, JPEG, WebP,
    AVIF, GIF (its first frame), BMP, ICO (its largest size), TIFF — 16-bit
    and floating-point ones scaled down to 8 bits rather than clipped to
    white."""
    import numpy as np
    from PIL import Image, ImageOps

    image = Image.open(io.BytesIO(data))
    if getattr(image, "n_frames", 1) > 1:
        image.seek(0)
    if image.format == "ICO" and getattr(image, "ico", None) is not None:
        image.size = max(image.ico.sizes(), key=lambda s: s[0] * s[1])
    image = ImageOps.exif_transpose(image)
    if image.mode in ("I;16", "I;16B", "I;16L", "I", "F"):
        arr = np.asarray(image, dtype=np.float64)
        top = 65535.0 if image.mode.startswith("I;16") or arr.max() > 255 else 255.0
        image = Image.fromarray(np.clip(arr / top * 255.0 + 0.5, 0, 255).astype(np.uint8), "L")
    return image.convert("RGBA")


def resize_foreground(image, ratio):
    """Crops to the opaque part, pads it square and then so it fills `ratio`
    of the side (the preprocessing both models were trained with)."""
    import numpy as np
    from PIL import Image

    arr = np.asarray(image)
    ys, xs = np.where(arr[..., 3] > 0)
    if ys.size == 0:
        return image
    fg = arr[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    size = max(fg.shape[0], fg.shape[1])
    ph, pw = size - fg.shape[0], size - fg.shape[1]
    sq = np.pad(fg, ((ph // 2, ph - ph // 2), (pw // 2, pw - pw // 2), (0, 0)))
    side = int(sq.shape[0] / ratio)
    p = side - sq.shape[0]
    out = np.pad(sq, ((p // 2, p - p // 2), (p // 2, p - p // 2), (0, 0)))
    return Image.fromarray(out)


class Engine:
    def __init__(self, home, log):
        self.home = home
        self.log = log
        self.spec = None
        self.model = None
        self.device = "cpu"
        self.preference = "auto"
        self.rembg_session = None
        self.lock = threading.RLock()
        self._job = None

    # ── Loading ───────────────────────────────────────────
    def load(self, spec, weights_dir, preference="auto"):
        """Makes `spec` the loaded model (unloading another one first)."""
        import torch

        with self.lock:
            self.preference = preference
            if self.spec is spec and self.model is not None:
                target = pick_device(preference)
                if target != self.device:
                    self.move_to(target)
                return
            self.unload()
            started = time.time()
            self.log.info(f"Loading {spec.name} from {weights_dir} …")
            model = spec.load(self.home, weights_dir, self.log)
            self.spec = spec
            self.model = model
            spec.install_hooks(model, self)
            self.move_to(pick_device(preference))
            self.log.info(
                f"{spec.name} ready on {device_name(self.device)} in {time.time() - started:.1f} s "
                f"(PyTorch {torch.__version__}, {torch.get_num_threads()} CPU threads)."
            )

    def unload(self):
        import torch

        if self.model is None:
            return
        self.log.info(f"Unloading {self.spec.name}.")
        self.model = None
        self.spec = None
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

    def move_to(self, device):
        import torch

        try:
            self.model.to(device)
            self.device = device
        except Exception as e:  # noqa: BLE001 — any GPU failure means: use the CPU
            if device == "cpu":
                raise
            self.log.warn(f"Could not move the model to {device_name(device)} ({e}); using the CPU.")
            self.model.to("cpu")
            self.device = "cpu"
        on_device = getattr(self.spec, "on_device", None)
        if on_device:
            on_device(self.device)
        if self.device != "cuda" and torch.cuda.is_available():
            torch.cuda.empty_cache()

    def set_preference(self, preference):
        with self.lock:
            self.preference = preference
            if self.model is None:
                return
            target = pick_device(preference)
            if target != self.device:
                self.log.info(f"Device: {device_name(self.device)} → {device_name(target)}")
                self.move_to(target)

    def background_session(self):
        if self.rembg_session is None:
            import rembg

            self.rembg_session = rembg.new_session("u2net")
        return self.rembg_session

    # ── Progress, used by the model specs' hooks ──────────
    def stage(self, name):
        if self._job is not None:
            self._job.enter(name)

    def within(self, fraction):
        if self._job is not None:
            self._job.within(fraction)

    def staged(self, name, fn):
        engine = self

        def run(*args, **kwargs):
            engine.stage(name)
            return fn(*args, **kwargs)

        run._my3dobjects = True
        return run

    def hook_blocks(self, blocks):
        """Progress through the model stage from its transformer blocks
        (and a chance to cancel between them)."""
        total = max(1, len(blocks))
        for i, block in enumerate(blocks):
            def tick(_module, _inputs, i=i):
                self.within(i / total)
            block.register_forward_pre_hook(tick)

    # ── Converting ────────────────────────────────────────
    def convert(self, job):
        """Runs one job with the loaded model; fills job.files. Raises Cancelled."""
        with self.lock:
            spec = self.spec
            job.model = spec.id
            job.model_name = spec.name
            job.options = normalize_options(spec, job.raw_options, self.device)
            self._job = job
            try:
                return self._convert_on(self.device, job)
            except Cancelled:
                raise
            except Exception as e:  # noqa: BLE001
                if self.device == "cpu" or not is_device_error(e):
                    raise
                self.log.warn(f"The conversion failed on {device_name(self.device)}: {str(e).splitlines()[0]}")
                self.log.warn("Moving the model to the CPU and converting again (slower).")
                self.move_to("cpu")
                job.fallback = True
                job.options = normalize_options(spec, job.raw_options, "cpu")
                return self._convert_on("cpu", job)
            finally:
                self._job = None

    def _convert_on(self, device, job):
        import torch

        job.device = device
        job.device_name = device_name(device)
        job.enter("background")
        image = open_input_image(job.image_bytes)
        job.input_size = image.size
        has_alpha = image.getextrema()[3][0] < 255
        if job.options["removeBackground"] and not has_alpha:
            import rembg

            image = rembg.remove(image, session=self.background_session())
        job.check()
        image = resize_foreground(image, job.options["foregroundRatio"])
        prepared = io.BytesIO()
        image.save(prepared, format="PNG")
        job.files["input.png"] = prepared.getvalue()

        if device == "cuda":
            torch.cuda.reset_peak_memory_stats()
        mesh = self.spec.run(self.model, image, job.options, device, self)
        if device == "cuda":
            job.peak_memory = int(torch.cuda.max_memory_allocated())
        # SF3D and TripoSR return the object facing -Z (seen from where the
        # photo was taken). glTF's front is +Z — the app's Front view and its
        # first camera look from there — so those are turned round; a model
        # that already faces +Z says so with `faces_front = True`.
        import numpy as np
        import trimesh

        if not getattr(self.spec, "faces_front", False):
            mesh.apply_transform(trimesh.transformations.rotation_matrix(np.pi, [0, 1, 0]))

        job._raw = mesh
        job.enter("remesh")
        mesh, job.tilt = finish_mesh(mesh, job.options, self.log)
        job.enter("export")
        self._export(job, mesh)
        return job.files

    @staticmethod
    def _export(job, mesh):
        job.files["result.glb"] = linear_vertex_colors(mesh.export(file_type="glb", include_normals=True))
        job.stats = {"vertices": int(len(mesh.vertices)), "faces": int(len(mesh.faces))}
        if "textureResolution" in job.options:
            job.stats["textureResolution"] = job.options["textureResolution"]
        job._mesh = mesh

    def refine(self, job, spec, raw_options):
        """Cleans a finished job's raw mesh again with new surface options
        (no model run, so it needs neither the model nor its lock)."""
        if job._raw is None:
            raise ValueError("This result can no longer be refined.")
        merged = {**job.options, **{k: v for k, v in (raw_options or {}).items() if k in SURFACE_OPTIONS}}
        options = normalize_options(spec, merged, job.device or "cpu")
        started = time.time()
        mesh, tilt = finish_mesh(job._raw, options, self.log)
        job.options = {**job.options, **{k: options[k] for k in SURFACE_OPTIONS if k in options}}
        job.tilt = tilt
        self._export(job, mesh)
        self.log.info(
            f"[{job.id}] surface refined in {time.time() - started:.1f} s: "
            f"{job.stats['vertices']:,} vertices, {job.stats['faces']:,} faces"
        )
        return job

    @staticmethod
    def export_obj_zip(mesh, name="model"):
        """OBJ + MTL + texture in one zip (trimesh writes the three files)."""
        from trimesh.exchange.obj import export_obj

        text, files = export_obj(mesh, include_texture=True, return_texture=True, mtl_name=f"{name}.mtl")
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr(f"{name}.obj", text)
            for fname, data in (files or {}).items():
                z.writestr(fname, data)
        return buf.getvalue()


class Job:
    """One conversion: its state for /api/jobs/<id> and its result files."""

    def __init__(self, job_id, image_bytes, options, name="", model=""):
        self.id = job_id
        self.name = name
        self.model = model
        self.model_name = ""
        self.image_bytes = image_bytes
        self.raw_options = options
        self.options = {}
        self.state = "queued"
        self.stage = "queued"
        self.progress = 0.0
        self.error = ""
        self.created = time.time()
        self.started = None
        self.finished = None
        self.stage_started = None
        self.timings = {}
        self.files = {}
        self.stats = {}
        self.device = ""
        self.device_name = ""
        self.fallback = False
        self.tilt = 0.0          # degrees the result was stood upright by
        self.peak_memory = 0
        self.input_size = None
        self.cancel_requested = False
        self._mesh = None
        self._raw = None         # the model's mesh before finish_mesh (for refine)
        self.on_stage = None

    def check(self):
        if self.cancel_requested:
            raise Cancelled()

    def enter(self, stage):
        self.check()
        now = time.time()
        if self.stage_started is not None and self.stage not in ("queued", stage):
            self.timings[self.stage] = round(self.timings.get(self.stage, 0) + now - self.stage_started, 3)
        if stage != self.stage:
            self.stage = stage
            self.stage_started = now
            if self.on_stage:
                self.on_stage(self, stage)
        self.progress = max(self.progress, STAGES.get(stage, (self.progress, self.progress))[0])

    def within(self, fraction):
        """Progress inside the current stage (0–1)."""
        self.check()
        a, b = STAGES.get(self.stage, (self.progress, self.progress))
        self.progress = max(self.progress, a + (b - a) * max(0.0, min(1.0, fraction)))

    def finish(self, state, error=""):
        now = time.time()
        if self.stage_started is not None and self.stage not in ("queued", "done"):
            self.timings[self.stage] = round(self.timings.get(self.stage, 0) + now - self.stage_started, 3)
        self.state = state
        self.error = error
        self.finished = now
        if state == "done":
            self.stage = "done"
            self.progress = 1.0
        self.image_bytes = b""

    def to_json(self):
        now = time.time()
        return {
            "id": self.id,
            "name": self.name,
            "model": self.model,
            "modelName": self.model_name,
            "state": self.state,
            "stage": self.stage,
            "progress": round(self.progress, 4),
            "error": self.error,
            "options": self.options,
            "stats": self.stats,
            "timings": self.timings,
            "device": self.device,
            "deviceName": self.device_name,
            "fallback": self.fallback,
            "tilt": round(self.tilt, 1),
            "peakMemory": self.peak_memory,
            "inputSize": list(self.input_size) if self.input_size else None,
            "elapsed": round((self.finished or now) - (self.started or now), 2) if self.started else 0,
            "files": sorted(self.files.keys()) + (["result-obj.zip"] if self._mesh is not None else []),
        }
