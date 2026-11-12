"""my3dobjects.raster_image against a line-for-line Python port of Hunyuan3D-2's
compiled rasterizer (custom_rasterizer_kernel, rasterizer.cpp CPU path):
random meshes with faces partly off screen, degenerate faces, perspective
(w ≠ 1) and the depth prior."""

import os
import sys
import unittest

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

try:
    import torch
except ImportError:  # pragma: no cover
    torch = None


def _area2(a, b, c):
    return (c[0] - a[0]) * (b[1] - a[1]) - (b[0] - a[0]) * (c[1] - a[1])


def _bary(a, b, c, p):
    area = _area2(a, b, c)
    if area == 0:
        return [-1.0, -1.0, -1.0]
    beta = _area2(a, p, c) / area
    gamma = _area2(a, b, p) / area
    return [1.0 - beta - gamma, beta, gamma]


def reference(V, F, D, width, height, trunc, use_prior):
    """rasterize_image_cpu, in float32 like the C++."""
    f32 = np.float32
    V = V.astype(f32)
    big = 1 << 62
    zbuf = np.full(width * height, big, dtype=np.int64)
    face = np.zeros(width * height, dtype=np.int64)

    def screen(v, z=True):
        out = [f32((v[0] / v[3] * f32(0.5) + f32(0.5)) * (width - 1) + f32(0.5)),
               f32((f32(0.5) + f32(0.5) * v[1] / v[3]) * (height - 1) + f32(0.5))]
        if z:
            out.append(f32(v[2] / v[3] * f32(0.49999) + f32(0.5)))
        return out

    for i, (i0, i1, i2) in enumerate(F):
        t = [screen(V[i0]), screen(V[i1]), screen(V[i2])]
        xs, ys = [p[0] for p in t], [p[1] for p in t]
        for px in range(int(min(xs)), int(np.ceil(max(xs) + 1))):
            if px < 0 or px >= width or not px < max(xs) + 1:
                continue
            for py in range(int(min(ys)), int(np.ceil(max(ys) + 1))):
                if py < 0 or py >= height or not py < max(ys) + 1:
                    continue
                bc = _bary(t[0], t[1], t[2], [f32(px + 0.5), f32(py + 0.5)])
                if not all(0.0 <= v <= 1.0 for v in bc):
                    continue
                depth = f32(bc[0] * t[0][2] + bc[1] * t[1][2] + bc[2] * t[2][2])
                pix = py * width + px
                if use_prior and depth < D[pix] * f32(0.49999) + f32(0.5) + f32(trunc):
                    continue
                token = int(np.trunc(depth * (1 << 18))) * (1 << 31) + i + 1
                if token < zbuf[pix]:
                    zbuf[pix] = token
                    face[pix] = i + 1
    return face.reshape(height, width)


@unittest.skipIf(torch is None, "PyTorch is not installed")
class RasterTest(unittest.TestCase):
    def setUp(self):
        from my3dobjects import raster_image as raster

        self.raster = raster

    def _mesh(self, seed, n_faces=40, perspective=False):
        rng = np.random.default_rng(seed)
        V = np.concatenate([rng.uniform(-1.3, 1.3, (n_faces * 3, 2)), rng.uniform(-0.9, 0.9, (n_faces * 3, 1)),
                            rng.uniform(0.6, 1.8, (n_faces * 3, 1)) if perspective else np.ones((n_faces * 3, 1))], 1)
        F = np.arange(n_faces * 3).reshape(n_faces, 3)
        F[0] = [0, 0, 1]                      # degenerate: never drawn
        return V.astype(np.float32), F.astype(np.int32)

    def _compare(self, V, F, W, H, D=None, trunc=1e-6, use_prior=0):
        ref = reference(V, F, D if D is not None else np.zeros(W * H, np.float32), W, H, trunc, use_prior)
        findices, bary = self.raster.rasterize_image(
            torch.from_numpy(V), torch.from_numpy(F),
            torch.from_numpy(D).view(H, W) if D is not None else torch.zeros(0), W, H, trunc, use_prior)
        got = findices.numpy()
        # Float rounding can flip a pixel exactly on an edge: allow a handful.
        self.assertLessEqual(int((got != ref).sum()), max(2, W * H // 500), f"{(got != ref).sum()} pixels differ")
        self.assertGreater(int((ref > 0).sum()), W * H // 10)
        return findices, bary

    def test_matches_the_kernel_orthographic(self):
        for seed in range(3):
            V, F = self._mesh(seed)
            findices, bary = self._compare(V, F, 61, 47)
            covered = findices.numpy() > 0
            b = bary.numpy()
            np.testing.assert_allclose(b[covered].sum(-1), 1.0, atol=1e-5)
            self.assertTrue((b[~covered] == 0).all())
            self.assertTrue((b[covered] >= -1e-6).all())

    def test_matches_the_kernel_with_perspective(self):
        V, F = self._mesh(7, perspective=True)
        self._compare(V, F, 53, 64)

    def test_depth_prior_peels_the_front_layer(self):
        V, F = self._mesh(11)
        W, H = 40, 40
        front, _ = self._compare(V, F, W, H)
        # The depth of the front layer as the prior: what lies behind it remains.
        _, _, z, _ = self.raster._screen(torch.from_numpy(V), W, H)
        pz = np.full(W * H, -1.0, np.float32)
        fr = front.numpy().reshape(-1)
        hit = fr > 0
        pz[hit] = ((z[torch.from_numpy(F).long()].mean(1).numpy()[fr[hit] - 1] - 0.5) / 0.49999)
        self._compare(V, F, W, H, D=pz, trunc=1e-3, use_prior=1)

    def test_interpolate_recovers_vertex_attributes(self):
        # A screen-filling quad with per-vertex x: interpolation gives each
        # pixel centre's own x.
        V = np.array([[-1, -1, 0, 1], [1, -1, 0, 1], [1, 1, 0, 1], [-1, 1, 0, 1]], np.float32)
        F = np.array([[0, 1, 2], [0, 2, 3]], np.int32)
        W = H = 32
        fi, ba = self.raster.rasterize_image(torch.from_numpy(V), torch.from_numpy(F), torch.zeros(0), W, H)
        col = torch.from_numpy(V[None, :, :1])
        out = self.raster.interpolate(col, fi, ba, torch.from_numpy(F))[0, ..., 0].numpy()
        sx = ((V[:, 0] * 0.5 + 0.5) * (W - 1) + 0.5)
        expect = (np.arange(W) + 0.5 - sx.min()) / (sx.max() - sx.min()) * 2 - 1
        covered = fi.numpy() > 0
        np.testing.assert_allclose(out[covered], np.broadcast_to(expect, (H, W))[covered], atol=1e-4)

    def test_large_faces_are_split_into_chunks(self):
        saved = self.raster.CHUNK
        self.raster.CHUNK = 500                # far below one face's box
        try:
            V, F = self._mesh(3, n_faces=12)
            self._compare(V, F, 64, 64)
        finally:
            self.raster.CHUNK = saved


if __name__ == "__main__":
    unittest.main()
