"""Stand-in for SF3D's compiled `texture_baker` package (see mysf3d/raster.py).

Same class and methods as texture_baker/baker.py upstream; the operators it
calls are registered in pure PyTorch, so nothing has to be compiled.
"""

import torch
import torch.nn as nn

from mysf3d.raster import register_ops

register_ops()


class TextureBaker(nn.Module):
    def rasterize(self, uv, face_indices, bake_resolution):
        return torch.ops.texture_baker_cpp.rasterize(uv, face_indices.to(torch.int32), bake_resolution)

    def get_mask(self, rast):
        return rast[..., -1] >= 0

    def interpolate(self, attr, rast, face_indices):
        return torch.ops.texture_baker_cpp.interpolate(attr, face_indices.to(torch.int32), rast)

    def forward(self, attr, uv, face_indices, bake_resolution):
        rast = self.rasterize(uv, face_indices, bake_resolution)
        return self.interpolate(attr, rast, face_indices)


__all__ = ["TextureBaker"]
