"""kaolin.utils.testing.check_tensor, as Kaolin defines it."""


def check_tensor(tensor, shape=None, dtype=None, device=None, throw=True):
    """True when `tensor` has `shape` (None entries match any size), `dtype`
    and `device`; otherwise False, or a ValueError / TypeError if `throw`."""
    if shape is not None:
        ok = len(shape) == tensor.ndim and all(s is None or s == t for s, t in zip(shape, tensor.shape))
        if not ok:
            if throw:
                raise ValueError(f"tensor shape is {tuple(tensor.shape)}, should be {tuple(shape)}")
            return False
    if dtype is not None and tensor.dtype != dtype:
        if throw:
            raise TypeError(f"tensor dtype is {tensor.dtype}, should be {dtype}")
        return False
    if device is not None and str(tensor.device) != str(device):
        if throw:
            raise TypeError(f"tensor device is {tensor.device}, should be {device}")
        return False
    return True
