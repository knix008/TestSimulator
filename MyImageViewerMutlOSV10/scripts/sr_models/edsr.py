# EDSR (Enhanced Deep Residual Networks for Single Image Super-Resolution, Lim et al., CVPR 2017W),
# the network of the official PyTorch release (https://github.com/sanghyun-son/EDSR-PyTorch,
# MIT licence), written out so that its released weights (edsr_x2/x3/x4-*.pt) load as they are:
# 32 residual blocks of 256 features, residual scaling 0.1, pixel-shuffle upsampler, RGB 0..255.
import math

import torch
import torch.nn as nn


def _conv(cin, cout, k, bias=True):
    return nn.Conv2d(cin, cout, k, padding=k // 2, bias=bias)


class MeanShift(nn.Conv2d):
    """Subtracts (sign -1) or adds (sign +1) the DIV2K mean; fixed weights."""

    def __init__(self, rgb_range=255, rgb_mean=(0.4488, 0.4371, 0.4040), rgb_std=(1.0, 1.0, 1.0), sign=-1):
        super().__init__(3, 3, kernel_size=1)
        std = torch.Tensor(rgb_std)
        self.weight.data = torch.eye(3).view(3, 3, 1, 1) / std.view(3, 1, 1, 1)
        self.bias.data = sign * rgb_range * torch.Tensor(rgb_mean) / std
        for p in self.parameters():
            p.requires_grad = False


class ResBlock(nn.Module):
    def __init__(self, n_feats, res_scale):
        super().__init__()
        self.body = nn.Sequential(_conv(n_feats, n_feats, 3), nn.ReLU(True), _conv(n_feats, n_feats, 3))
        self.res_scale = res_scale

    def forward(self, x):
        return x + self.body(x).mul(self.res_scale)


class Upsampler(nn.Sequential):
    def __init__(self, scale, n_feats):
        m = []
        if scale & (scale - 1) == 0:
            for _ in range(int(math.log2(scale))):
                m += [_conv(n_feats, 4 * n_feats, 3), nn.PixelShuffle(2)]
        elif scale == 3:
            m += [_conv(n_feats, 9 * n_feats, 3), nn.PixelShuffle(3)]
        else:
            raise ValueError(f"EDSR has no x{scale} upsampler")
        super().__init__(*m)


class EDSR(nn.Module):
    def __init__(self, scale, n_resblocks=32, n_feats=256, res_scale=0.1, rgb_range=255):
        super().__init__()
        self.sub_mean = MeanShift(rgb_range, sign=-1)
        self.head = nn.Sequential(_conv(3, n_feats, 3))
        self.body = nn.Sequential(*[ResBlock(n_feats, res_scale) for _ in range(n_resblocks)], _conv(n_feats, n_feats, 3))
        self.tail = nn.Sequential(Upsampler(scale, n_feats), _conv(n_feats, 3, 3))
        self.add_mean = MeanShift(rgb_range, sign=1)

    def forward(self, x):
        x = self.head(self.sub_mean(x))
        x = self.tail(self.body(x) + x)
        return self.add_mean(x)
