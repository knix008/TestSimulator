"""The pure-PyTorch stand-ins for SF3D's compiled operators (mysf3d/raster.py)
against straightforward per-pixel reference code written from baker.cpp and
unwrapper.cpp.

Run: python -m unittest discover -s engine/tests   (needs torch)
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

try:
    import torch
except ImportError:  # pragma: no cover - the engine's own venv always has it
    torch = None

if torch is not None:
    from mysf3d import raster


def ref_barycentric(p, a, b, c):
    e12 = (b[0] - a[0], b[1] - a[1])
    e13 = (c[0] - a[0], c[1] - a[1])
    ep = (p[0] - a[0], p[1] - a[1])
    d00 = e12[0] * e12[0] + e12[1] * e12[1]
    d01 = e12[0] * e13[0] + e12[1] * e13[1]
    d11 = e13[0] * e13[0] + e13[1] * e13[1]
    d20 = ep[0] * e12[0] + ep[1] * e12[1]
    d21 = ep[0] * e13[0] + ep[1] * e13[1]
    den = d00 * d11 - d01 * d01
    if den == 0:
        return None
    v = (d11 * d20 - d01 * d21) / den
    w = (d00 * d21 - d01 * d20) / den
    return 1 - v - w, v, w


def ref_rasterize(uv, faces, res):
    out = [[None] * res for _ in range(res)]
    for r in range(res):
        for c in range(res):
            p = (c / res, 1 - r / res)
            for i, f in enumerate(faces):
                bc = ref_barycentric(p, uv[f[0]], uv[f[1]], uv[f[2]])
                if bc and bc[1] >= 0 and bc[2] >= 0 and bc[1] + bc[2] <= 1:
                    out[r][c] = (i, bc)
                    break
    return out


@unittest.skipIf(torch is None, "torch is not installed")
class RasterizeTest(unittest.TestCase):
    def setUp(self):
        g = torch.Generator().manual_seed(7)
        # A few small, non-overlapping triangles in a grid of cells.
        uv, faces = [], []
        for gy in range(4):
            for gx in range(4):
                x0, y0 = gx / 4 + 0.02, gy / 4 + 0.02
                jitter = torch.rand(3, 2, generator=g) * 0.2
                base = len(uv)
                uv += [(x0 + jitter[0, 0].item(), y0 + jitter[0, 1].item()),
                       (x0 + 0.2, y0 + jitter[1, 1].item()),
                       (x0 + jitter[2, 0].item(), y0 + 0.2)]
                faces.append((base, base + 1, base + 2))
        self.uv = uv
        self.faces = faces

    def test_matches_reference(self):
        res = 48
        got = raster.rasterize(torch.tensor(self.uv), torch.tensor(self.faces, dtype=torch.int32), res)
        ref = ref_rasterize(self.uv, self.faces, res)
        self.assertEqual(tuple(got.shape), (res, res, 4))
        covered = 0
        for r in range(res):
            for c in range(res):
                cell = got[r, c]
                if ref[r][c] is None:
                    self.assertEqual(cell[3].item(), -1.0, (r, c))
                else:
                    covered += 1
                    i, (u, v, w) = ref[r][c]
                    self.assertEqual(int(cell[3].item()), i, (r, c))
                    self.assertAlmostEqual(cell[0].item(), u, delta=5e-4)
                    self.assertAlmostEqual(cell[1].item(), v, delta=5e-4)
                    self.assertAlmostEqual(cell[2].item(), w, delta=5e-4)
        self.assertGreater(covered, 50)

    def test_small_chunks_give_the_same_map(self):
        uv = torch.tensor(self.uv)
        faces = torch.tensor(self.faces, dtype=torch.int32)
        whole = raster.rasterize(uv, faces, 64)
        keep = raster.MAX_CANDIDATES
        try:
            raster.MAX_CANDIDATES = 37
            chunked = raster.rasterize(uv, faces, 64)
        finally:
            raster.MAX_CANDIDATES = keep
        self.assertTrue(torch.equal(whole, chunked))

    def test_interpolate_weights_vertex_attributes(self):
        uv = torch.tensor([(0.0, 0.0), (1.0, 0.0), (0.0, 1.0)])
        faces = torch.tensor([(0, 1, 2)], dtype=torch.int32)
        rast = raster.rasterize(uv, faces, 16)
        attr = torch.tensor([(1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0)])
        out = raster.interpolate(attr, faces, rast)
        mask = rast[..., 3] >= 0
        self.assertTrue(bool(mask.any()))
        # Barycentric weights sum to one, so do the interpolated one-hot colours.
        sums = out[mask].sum(-1)
        self.assertTrue(torch.allclose(sums, torch.ones_like(sums), atol=1e-5))
        self.assertTrue(torch.equal(out[~mask], torch.zeros_like(out[~mask])))

    def test_degenerate_and_empty_input(self):
        uv = torch.tensor([(0.5, 0.5), (0.5, 0.5), (0.5, 0.5)])
        faces = torch.tensor([(0, 1, 2)], dtype=torch.int32)
        rast = raster.rasterize(uv, faces, 8)
        self.assertTrue(bool((rast[..., 3] == -1).all()))
        empty = raster.rasterize(torch.zeros(0, 2), torch.zeros(0, 3, dtype=torch.int32), 8)
        self.assertTrue(bool((empty[..., 3] == -1).all()))


@unittest.skipIf(torch is None, "torch is not installed")
class AtlasIndexTest(unittest.TestCase):
    def test_overlapping_faces_move_to_the_next_slice(self):
        # Two triangles stacked in UV on the +X group (0); the one with the
        # smaller x centroid is in front and stays.
        verts = torch.tensor([
            [0.0, 0, 0], [0.0, 1, 0], [0.0, 0, 1],
            [1.0, 0, 0], [1.0, 1, 0], [1.0, 0, 1],
            # A third, far away in UV, overlapping nothing.
            [0.0, 5, 5], [0.0, 6, 5], [0.0, 5, 6],
        ])
        idx = torch.tensor([[0, 1, 2], [3, 4, 5], [6, 7, 8]])
        tri = [(0.1, 0.1), (0.5, 0.1), (0.1, 0.5)]
        far = [(0.7, 0.7), (0.9, 0.7), (0.7, 0.9)]
        face_uv = torch.tensor(tri + tri + far).view(-1, 2)
        face_index = torch.tensor([0, 0, 0])
        got = raster.assign_faces_uv_to_atlas_index(verts, idx, face_uv, face_index, resolution=128)
        self.assertEqual(got.tolist(), [0, 6, 0])

    def test_odd_groups_keep_the_largest_coordinate(self):
        verts = torch.tensor([
            [0.0, 0, 0], [0.0, 1, 0], [0.0, 0, 1],
            [1.0, 0, 0], [1.0, 1, 0], [1.0, 0, 1],
        ])
        idx = torch.tensor([[0, 1, 2], [3, 4, 5]])
        tri = [(0.1, 0.1), (0.5, 0.1), (0.1, 0.5)]
        face_uv = torch.tensor(tri + tri).view(-1, 2)
        got = raster.assign_faces_uv_to_atlas_index(verts, idx, face_uv, torch.tensor([1, 1]), resolution=128)
        self.assertEqual(got.tolist(), [7, 1])

    def test_triangles_sharing_an_edge_do_not_overlap(self):
        verts = torch.tensor([[0.0, 0, 0], [0.0, 1, 0], [0.0, 0, 1], [0.0, 1, 1]])
        idx = torch.tensor([[0, 1, 2], [1, 3, 2]])
        face_uv = torch.tensor([(0.1, 0.1), (0.6, 0.1), (0.1, 0.6), (0.6, 0.1), (0.6, 0.6), (0.1, 0.6)])
        got = raster.assign_faces_uv_to_atlas_index(verts, idx, face_uv, torch.tensor([2, 2]), resolution=256)
        self.assertEqual(got.tolist(), [2, 2])

    def test_third_layer_goes_to_slice_twelve(self):
        verts = torch.tensor([[float(i), 0, 0] for i in range(3) for _ in range(3)])
        verts[:, 1] = torch.tensor([0, 1, 0] * 3, dtype=torch.float32)
        verts[:, 2] = torch.tensor([0, 0, 1] * 3, dtype=torch.float32)
        idx = torch.tensor([[0, 1, 2], [3, 4, 5], [6, 7, 8]])
        tri = [(0.1, 0.1), (0.5, 0.1), (0.1, 0.5)]
        face_uv = torch.tensor(tri * 3).view(-1, 2)
        got = raster.assign_faces_uv_to_atlas_index(verts, idx, face_uv, torch.tensor([0, 0, 0]), resolution=128)
        self.assertEqual(got.tolist(), [0, 6, 12])

    def test_ops_register_under_upstream_names(self):
        self.assertTrue(raster.register_ops())
        uv = torch.tensor([(0.0, 0.0), (1.0, 0.0), (0.0, 1.0)])
        faces = torch.tensor([(0, 1, 2)], dtype=torch.int32)
        rast = torch.ops.texture_baker_cpp.rasterize(uv, faces, 8)
        self.assertEqual(tuple(rast.shape), (8, 8, 4))
        out = torch.ops.UVUnwrapper.assign_faces_uv_to_atlas_index(
            torch.zeros(3, 3), faces.long(), uv, torch.tensor([3])
        )
        self.assertEqual(out.tolist(), [3])


if __name__ == "__main__":
    unittest.main()
