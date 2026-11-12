"""The pure PyTorch stand-ins for compiled libraries TRELLIS and SPAR3D import
(engine/shims/trellis, engine/shims/spar3d), checked against plain reference
computations: dense 3D convolution for spconv's submanifold convolution and
per-sequence softmax attention for xformers' block-diagonal attention.

Run: python -m unittest discover -s engine/tests   (the numeric ones need torch)
"""

import importlib
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SHIMS = os.path.join(HERE, "..", "shims")
sys.path.insert(0, os.path.join(HERE, ".."))

try:
    import torch
    import torch.nn.functional as F
except Exception:  # noqa: BLE001
    torch = None


def _shim(dotted, folder):
    """Imports shims/<folder>/<dotted> without leaving it on sys.path (a real
    package of that name elsewhere must not be shadowed for other tests)."""
    name = dotted.split(".")[0]
    path = os.path.join(SHIMS, folder)
    saved = {k: v for k, v in sys.modules.items() if k == name or k.startswith(name + ".")}
    for k in saved:
        del sys.modules[k]
    sys.path.insert(0, path)
    try:
        return importlib.import_module(dotted)
    finally:
        sys.path.remove(path)
        for k in [k for k in sys.modules if k == name or k.startswith(name + ".")]:
            sys.modules[f"_shimtest_{k}"] = sys.modules.pop(k)
        sys.modules.update(saved)


def _reference_attention(q, k, v):
    """q [Lq, H, C], k [Lk, H, C], v [Lk, H, Cv] → [Lq, H, Cv]."""
    w = torch.einsum("qhc,khc->hqk", q, k) / (q.shape[-1] ** 0.5)
    return torch.einsum("hqk,khc->qhc", w.softmax(-1), v)


@unittest.skipIf(torch is None, "torch is not installed")
class XformersShimTest(unittest.TestCase):
    def setUp(self):
        torch.manual_seed(0)
        self.ops = _shim("xformers.ops", "trellis")

    def test_plain_attention_matches_softmax(self):
        q, k, v = torch.randn(2, 7, 3, 8), torch.randn(2, 5, 3, 8), torch.randn(2, 5, 3, 4)
        out = self.ops.memory_efficient_attention(q, k, v)
        self.assertEqual(tuple(out.shape), (2, 7, 3, 4))
        for b in range(2):
            torch.testing.assert_close(out[b], _reference_attention(q[b], k[b], v[b]), atol=1e-5, rtol=1e-4)

    def _check_blocks(self, q_lens, kv_lens):
        H, C = 2, 8
        q = torch.randn(1, sum(q_lens), H, C)
        k = torch.randn(1, sum(kv_lens), H, C)
        v = torch.randn(1, sum(kv_lens), H, C)
        mask = self.ops.fmha.BlockDiagonalMask.from_seqlens(q_lens, None if q_lens is kv_lens else kv_lens)
        out = self.ops.memory_efficient_attention(q, k, v, mask)[0]
        qs = ks = 0
        for lq, lk in zip(q_lens, kv_lens):
            ref = _reference_attention(q[0, qs:qs + lq], k[0, ks:ks + lk], v[0, ks:ks + lk])
            torch.testing.assert_close(out[qs:qs + lq], ref, atol=1e-5, rtol=1e-4)
            qs += lq
            ks += lk

    def test_block_diagonal_self_attention_with_unequal_lengths(self):
        lens = [5, 1, 9, 3]
        self._check_blocks(lens, lens)

    def test_block_diagonal_with_equal_lengths(self):
        lens = [4, 4, 4]
        self._check_blocks(lens, lens)

    def test_block_diagonal_cross_attention(self):
        self._check_blocks([3, 6], [7, 2])

    def test_one_block_is_plain_attention(self):
        self._check_blocks([6], [6])

    def test_lengths_must_add_up(self):
        mask = self.ops.fmha.BlockDiagonalMask.from_seqlens([2, 2])
        with self.assertRaises(ValueError):
            self.ops.memory_efficient_attention(torch.randn(1, 5, 1, 4), torch.randn(1, 5, 1, 4), torch.randn(1, 5, 1, 4), mask)


@unittest.skipIf(torch is None, "torch is not installed")
class SpconvShimTest(unittest.TestCase):
    def setUp(self):
        torch.manual_seed(1)
        self.sp = _shim("spconv.pytorch", "trellis")

    def _voxels(self, batch=2, res=8, count=60):
        idx = []
        for b in range(batch):
            flat = torch.randperm(res ** 3)[:count]
            z, y, x = flat // (res * res), (flat // res) % res, flat % res
            idx.append(torch.stack([torch.full_like(z, b), z, y, x], 1))
        return torch.cat(idx).int(), res

    def _dense_reference(self, conv, feats, idx, batch, res):
        """Dense conv3d on a volume that is zero off the active voxels, read
        back at the active voxels: exactly what submanifold convolution is."""
        k = conv.kernel_size[0]
        d = conv.dilation[0]
        vol = torch.zeros(batch, conv.in_channels, res, res, res)
        i = idx.long()
        vol[i[:, 0], :, i[:, 1], i[:, 2], i[:, 3]] = feats
        weight = conv.weight.permute(0, 4, 1, 2, 3)  # (out, in, k, k, k)
        out = F.conv3d(vol, weight, conv.bias, padding=(k // 2) * d, dilation=d)
        return out[i[:, 0], :, i[:, 1], i[:, 2], i[:, 3]]

    def _check(self, kernel, dilation=1, cin=5, cout=7):
        idx, res = self._voxels()
        feats = torch.randn(idx.shape[0], cin)
        conv = self.sp.SubMConv3d(cin, cout, kernel, dilation=dilation, bias=True, indice_key="k")
        x = self.sp.SparseConvTensor(feats, idx, [res] * 3, 2)
        with torch.no_grad():
            got = conv(x).features
            want = self._dense_reference(conv, feats, idx, 2, res)
        torch.testing.assert_close(got, want, atol=1e-5, rtol=1e-4)

    def test_kernel_3_matches_dense_convolution(self):
        self._check(3)

    def test_kernel_1(self):
        self._check(1)

    def test_dilation(self):
        self._check(3, dilation=2)

    def test_weight_layout_is_spconv2(self):
        conv = self.sp.SubMConv3d(4, 6, 3)
        self.assertEqual(tuple(conv.weight.shape), (6, 3, 3, 3, 4))
        self.assertEqual(tuple(conv.bias.shape), (6,))
        self.assertEqual(sorted(conv.state_dict()), ["bias", "weight"])

    def test_batches_do_not_mix(self):
        # The same voxel position in two batches: neighbours stay in their batch.
        idx = torch.tensor([[0, 1, 1, 1], [1, 1, 1, 2]], dtype=torch.int32)
        nbr = self.sp.neighbour_map(idx, 3)
        centre = 13
        self.assertEqual(nbr[0, centre].item(), 0)
        self.assertEqual(nbr[1, centre].item(), 1)
        self.assertTrue((nbr[0] >= 0).sum().item() == 1)  # batch 1's voxel is not batch 0's neighbour

    def test_neighbour_cache_follows_indice_key(self):
        idx, res = self._voxels(batch=1, count=20)
        x = self.sp.SparseConvTensor(torch.randn(idx.shape[0], 3), idx, [res] * 3, 1)
        conv = self.sp.SubMConv3d(3, 3, 3, indice_key="res_8")
        conv(x)
        self.assertEqual(len(x.indice_dict), 1)
        conv(x)
        self.assertEqual(len(x.indice_dict), 1)

    def test_dense_and_replace_feature(self):
        idx = torch.tensor([[0, 0, 1, 2], [1, 3, 0, 0]], dtype=torch.int32)
        feats = torch.tensor([[1.0, 2.0], [3.0, 4.0]])
        x = self.sp.SparseConvTensor(feats, idx, [torch.tensor(4), 2, 3], 2)
        self.assertEqual(x.spatial_shape, [4, 2, 3])
        d = x.dense()
        self.assertEqual(tuple(d.shape), (2, 2, 4, 2, 3))
        self.assertEqual(d[0, :, 0, 1, 2].tolist(), [1.0, 2.0])
        self.assertEqual(d[1, :, 3, 0, 0].tolist(), [3.0, 4.0])
        y = x.replace_feature(feats * 2)
        self.assertIs(y.indices, x.indices)
        self.assertIs(y.indice_dict, x.indice_dict)
        self.assertEqual(y.features[1].tolist(), [6.0, 8.0])

    def test_empty_input(self):
        conv = self.sp.SubMConv3d(2, 3, 3)
        x = self.sp.SparseConvTensor(torch.zeros(0, 2), torch.zeros(0, 4, dtype=torch.int32), [1, 1, 1], 1)
        self.assertEqual(tuple(conv(x).features.shape), (0, 3))

    def test_strided_convolution_is_refused(self):
        with self.assertRaises(NotImplementedError):
            self.sp.SubMConv3d(2, 2, 3, stride=2)
        with self.assertRaises(NotImplementedError):
            self.sp.SparseConv3d(2, 2, 3, stride=2)


class SmallShimsTest(unittest.TestCase):
    @unittest.skipIf(torch is None, "torch is not installed")
    def test_kaolin_check_tensor(self):
        mod = _load_file(os.path.join(SHIMS, "trellis", "kaolin", "utils", "testing.py"))
        t = torch.zeros(4, 3)
        self.assertTrue(mod.check_tensor(t, (None, 3), throw=False))
        self.assertFalse(mod.check_tensor(t, (4,), throw=False))
        self.assertFalse(mod.check_tensor(t, (5, 3), throw=False))
        self.assertFalse(mod.check_tensor(t, dtype=torch.long, throw=False))
        with self.assertRaises(ValueError):
            mod.check_tensor(t, (None, 2))

    def test_unused_libraries_raise_only_when_used(self):
        mod = _load_file(os.path.join(SHIMS, "trellis", "utils3d", "__init__.py"), name="_stub_utils3d")
        with self.assertRaises(RuntimeError):
            getattr(mod, "TriangleMesh")
        # open3d's names are read at import (annotations): only a call raises.
        mod = _load_file(os.path.join(SHIMS, "trellis", "open3d", "__init__.py"), name="_stub_open3d")
        with self.assertRaises(RuntimeError):
            mod.geometry.TriangleMesh()

    def test_plyfile_stand_in(self):
        mod = _load_file(os.path.join(SHIMS, "trellis", "plyfile", "__init__.py"), name="_stub_plyfile")
        with self.assertRaises(RuntimeError):
            mod.PlyData.read("x.ply")
        with self.assertRaises(RuntimeError):
            mod.PlyElement()

    def test_transparent_background_is_never_constructed(self):
        mod = _load_file(os.path.join(SHIMS, "spar3d", "transparent_background", "__init__.py"), name="_stub_tb")
        self.assertTrue(hasattr(mod, "Remover"))
        with self.assertRaises(RuntimeError):
            mod.Remover()


def _load_file(path, name=None):
    spec = importlib.util.spec_from_file_location(name or f"_shimfile_{abs(hash(path))}", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


if __name__ == "__main__":
    unittest.main()
