"""xformers.ops.memory_efficient_attention on torch SDPA.

Tensors are xformers-shaped: query [B, Lq, H, C], key [B, Lk, H, C],
value [B, Lk, H, Cv]; the result is [B, Lq, H, Cv].
"""

import torch.nn.functional as F

from . import fmha
from .fmha import BlockDiagonalMask


def _sdpa(query, key, value, mask=None, scale=None):
    q, k, v = (t.transpose(1, 2) for t in (query, key, value))  # [B, H, L, C]
    kwargs = {} if scale is None else {"scale": scale}
    out = F.scaled_dot_product_attention(q, k, v, attn_mask=mask, **kwargs)
    return out.transpose(1, 2)


def memory_efficient_attention(query, key, value, attn_bias=None, p=0.0, scale=None, **_kwargs):
    if p:
        raise NotImplementedError("dropout is not supported by this stand-in")
    if attn_bias is None:
        return _sdpa(query, key, value, scale=scale)
    if isinstance(attn_bias, BlockDiagonalMask):
        return attn_bias.attend(query, key, value, scale, _sdpa)
    raise NotImplementedError(f"attn_bias {type(attn_bias).__name__} is not supported by this stand-in")


__all__ = ["memory_efficient_attention", "fmha", "BlockDiagonalMask"]
