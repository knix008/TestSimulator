"""BlockDiagonalMask: several sequences packed into one batch row, each
attending only to itself (xformers.ops.fmha.BlockDiagonalMask).

The sequences are unpacked into a padded batch [S, Lmax, H, C], attended with
a key-padding mask (none when every sequence has the same length) and packed
back, which is what the mask means.
"""

import torch


class BlockDiagonalMask:
    def __init__(self, q_seqlen, kv_seqlen):
        self.q_seqlen = [int(n) for n in q_seqlen]
        self.kv_seqlen = [int(n) for n in kv_seqlen]
        if len(self.q_seqlen) != len(self.kv_seqlen):
            raise ValueError("q_seqlen and kv_seqlen must have the same number of sequences")

    @classmethod
    def from_seqlens(cls, q_seqlen, kv_seqlen=None):
        return cls(q_seqlen, q_seqlen if kv_seqlen is None else kv_seqlen)

    @staticmethod
    def _unpack(x, lens):
        """x [T, H, C] → padded [S, Lmax, H, C] and where each row went."""
        device = x.device
        lens_t = torch.tensor(lens, device=device, dtype=torch.long)
        seg = torch.repeat_interleave(torch.arange(len(lens), device=device), lens_t)
        starts = torch.cumsum(lens_t, 0) - lens_t
        pos = torch.arange(x.shape[0], device=device) - starts[seg]
        out = x.new_zeros((len(lens), max(lens)) + tuple(x.shape[1:]))
        out[seg, pos] = x
        return out, seg, pos

    def attend(self, query, key, value, scale, sdpa):
        if query.shape[0] != 1:
            raise ValueError("BlockDiagonalMask expects the sequences packed into a batch of 1")
        q, k, v = query[0], key[0], value[0]
        if sum(self.q_seqlen) != q.shape[0] or sum(self.kv_seqlen) != k.shape[0]:
            raise ValueError("the sequence lengths do not add up to the tensors' lengths")
        if len(self.q_seqlen) == 1:
            return sdpa(query, key, value, scale=scale)
        qp, seg, pos = self._unpack(q, self.q_seqlen)
        kp, _, _ = self._unpack(k, self.kv_seqlen)
        vp, _, _ = self._unpack(v, self.kv_seqlen)
        mask = None
        if len(set(self.kv_seqlen)) > 1:
            kv_len = torch.tensor(self.kv_seqlen, device=q.device)
            valid = torch.arange(max(self.kv_seqlen), device=q.device)[None, :] < kv_len[:, None]
            mask = valid[:, None, None, :]                       # [S, 1, 1, Lk]
        out = sdpa(qp, kp, vp, mask=mask, scale=scale)         # [S, Lq, H, Cv]
        return out[seg, pos].unsqueeze(0)


__all__ = ["BlockDiagonalMask"]
