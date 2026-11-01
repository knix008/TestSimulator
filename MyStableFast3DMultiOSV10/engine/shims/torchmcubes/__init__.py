"""Stand-in for torchmcubes (a compiled extension TripoSR uses), with
scikit-image's marching cubes.

marching_cubes(volume, threshold) → (vertices (V, 3) float, faces (F, 3) long),
vertices in index units with x along the volume's last axis, as torchmcubes
returns them (TripoSR swaps the axes back right after).
"""

import numpy as np
import torch


def marching_cubes(volume, threshold=0.0):
    vol = volume.detach().float().cpu().numpy()
    if not (vol.min() < threshold < vol.max()):
        return torch.zeros(0, 3), torch.zeros(0, 3, dtype=torch.long)
    from skimage import measure

    verts, faces, _normals, _values = measure.marching_cubes(vol, level=threshold)
    verts = np.ascontiguousarray(verts[:, ::-1])
    return torch.from_numpy(verts.astype(np.float32)), torch.from_numpy(faces.astype(np.int64))


__all__ = ["marching_cubes"]
