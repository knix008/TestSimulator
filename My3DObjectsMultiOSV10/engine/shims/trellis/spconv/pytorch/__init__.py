"""spconv.pytorch in plain PyTorch, for TRELLIS's inference models.

TRELLIS only runs *submanifold* convolutions (stride 1, the output has the
same voxels as the input) — kernel 3 in the structured-latent flow model and
the mesh decoder, kernel 1 for skips. That is, for each active voxel p:

    out[p] = bias + Σ_o  W[o] · in[p + o]      (o over the k³ offsets,
                                                 only active neighbours count)

The neighbours are found by sorting the voxels' linear keys once and looking
the shifted keys up with searchsorted; each offset is then one gather and one
matrix product. Works on CUDA, the CPU and Apple GPUs alike.

Weights keep spconv 2's layout, (out, k, k, k, in) ("KRSC"), with the kernel
axes in the order of the index columns 1..3, so TRELLIS's checkpoints load
as they are. Strided / inverse convolutions are not used by the inference
models and raise.
"""

import enum
import math

import torch
import torch.nn as nn


class ConvAlgo(enum.Enum):
    Native = 0
    MaskImplicitGemm = 1
    MaskSplitImplicitGemm = 2


class SparseConvTensor:
    """Features [N, C] at integer voxel indices [N, 4] = (batch, z, y, x)."""

    def __init__(self, features, indices, spatial_shape, batch_size, grid=None, voxel_num=None,
                 indice_dict=None, benchmark=False, permanent_thrust_allocator=False,
                 enable_timer=False, force_algo=None):
        self._features = features
        self.indices = indices
        self.spatial_shape = [int(s) for s in spatial_shape]
        self.batch_size = int(batch_size)
        self.grid = grid
        self.voxel_num = voxel_num
        self.indice_dict = {} if indice_dict is None else indice_dict
        self.benchmark = benchmark
        self.benchmark_record = {}
        self.thrust_allocator = None
        self._timer = None
        self.force_algo = force_algo
        self.int8_scale = None

    @property
    def features(self):
        return self._features

    @features.setter
    def features(self, value):
        self._features = value

    def replace_feature(self, feature):
        new = SparseConvTensor(feature, self.indices, self.spatial_shape, self.batch_size,
                               self.grid, self.voxel_num, self.indice_dict)
        for name in ("benchmark", "benchmark_record", "thrust_allocator", "_timer", "force_algo", "int8_scale"):
            setattr(new, name, getattr(self, name))
        return new

    def dense(self, channels_first=True):
        feats = self._features.reshape(self._features.shape[0], -1)
        shape = [self.batch_size, *self.spatial_shape, feats.shape[1]]
        out = feats.new_zeros(shape)
        idx = self.indices.long()
        out[idx[:, 0], idx[:, 1], idx[:, 2], idx[:, 3]] = feats
        return out.permute(0, 4, 1, 2, 3).contiguous() if channels_first else out

    @property
    def spatial_size(self):
        return math.prod(self.spatial_shape)


def _triple(v):
    return tuple(v) if isinstance(v, (list, tuple)) else (v, v, v)


def neighbour_map(indices, kernel_size, dilation=(1, 1, 1)):
    """[N, k³] long: for each voxel and kernel offset, the row of the
    neighbour at indices + (offset - k // 2) * dilation, or -1."""
    idx = indices.long()
    k = _triple(kernel_size)
    d = _triple(dilation)
    reach = [(k[i] // 2) * d[i] for i in range(3)]
    # Linear keys over a box large enough for every shifted position.
    lo = idx[:, 1:].min(0).values - torch.tensor(reach, device=idx.device)
    span = idx[:, 1:].max(0).values + torch.tensor(reach, device=idx.device) - lo + 1
    sx, sy, sz = (int(s) for s in span)

    def key(b, c):
        c = c - lo
        return ((b * sx + c[:, 0]) * sy + c[:, 1]) * sz + c[:, 2]

    keys = key(idx[:, 0], idx[:, 1:])
    order = torch.argsort(keys)
    sorted_keys = keys[order]
    offsets = torch.stack(torch.meshgrid(
        *[(torch.arange(k[i], device=idx.device) - k[i] // 2) * d[i] for i in range(3)],
        indexing="ij",
    ), dim=-1).reshape(-1, 3)
    out = torch.full((idx.shape[0], offsets.shape[0]), -1, dtype=torch.long, device=idx.device)
    for o in range(offsets.shape[0]):
        q = key(idx[:, 0], idx[:, 1:] + offsets[o])
        at = torch.searchsorted(sorted_keys, q).clamp(max=sorted_keys.numel() - 1)
        hit = sorted_keys[at] == q
        out[hit, o] = order[at[hit]]
    return out


class SubMConv3d(nn.Module):
    def __init__(self, in_channels, out_channels, kernel_size, stride=1, padding=0, dilation=1,
                 groups=1, bias=True, indice_key=None, algo=None, **_kwargs):
        super().__init__()
        if any(s != 1 for s in _triple(stride)) or groups != 1:
            raise NotImplementedError("only stride 1, groups 1 submanifold convolution is provided")
        self.in_channels = in_channels
        self.out_channels = out_channels
        self.kernel_size = _triple(kernel_size)
        self.dilation = _triple(dilation)
        self.indice_key = indice_key
        self.algo = algo
        self.weight = nn.Parameter(torch.empty(out_channels, *self.kernel_size, in_channels))
        self.bias = nn.Parameter(torch.empty(out_channels)) if bias else None
        self.reset_parameters()

    def reset_parameters(self):
        fan_in = self.in_channels * math.prod(self.kernel_size)
        bound = 1 / math.sqrt(fan_in)
        nn.init.uniform_(self.weight, -bound, bound)
        if self.bias is not None:
            nn.init.uniform_(self.bias, -bound, bound)

    def _neighbours(self, x):
        cache_key = (self.indice_key, self.kernel_size, self.dilation, x.indices.data_ptr(), x.indices.shape[0])
        cached = x.indice_dict.get(("my3dobjects-subm",) + cache_key) if self.indice_key else None
        if cached is not None:
            return cached
        nbr = neighbour_map(x.indices, self.kernel_size, self.dilation)
        if self.indice_key:
            x.indice_dict[("my3dobjects-subm",) + cache_key] = nbr
        return nbr

    def forward(self, x):
        feats = x.features
        n = feats.shape[0]
        w = self.weight.permute(1, 2, 3, 4, 0).reshape(-1, self.in_channels, self.out_channels).to(feats.dtype)
        if n == 0:
            out = feats.new_zeros((0, self.out_channels))
        elif w.shape[0] == 1:
            out = feats @ w[0]
        else:
            nbr = self._neighbours(x)
            out = feats.new_zeros((n, self.out_channels))
            for o in range(w.shape[0]):
                col = nbr[:, o]
                hit = col >= 0
                if bool(hit.all()):
                    out += feats[col] @ w[o]
                elif bool(hit.any()):
                    out[hit] += feats[col[hit]] @ w[o]
        if self.bias is not None:
            out = out + self.bias.to(out.dtype)
        return x.replace_feature(out)


class SparseConv3d(nn.Module):
    def __init__(self, *args, **kwargs):
        raise NotImplementedError("strided sparse convolution is not provided (TRELLIS inference does not use it)")


class SparseInverseConv3d(nn.Module):
    def __init__(self, *args, **kwargs):
        raise NotImplementedError("inverse sparse convolution is not provided (TRELLIS inference does not use it)")


__all__ = ["ConvAlgo", "SparseConvTensor", "SubMConv3d", "SparseConv3d", "SparseInverseConv3d", "neighbour_map"]
