"""Stand-in for xformers, the attention library TRELLIS's sparse transformers
call (xformers.ops.memory_efficient_attention with a BlockDiagonalMask).

xformers is CUDA-only and tied to one PyTorch build; this does the same
attention with PyTorch's own scaled_dot_product_attention, which picks a
memory-efficient kernel on CUDA and works on the CPU and on Apple GPUs too.
Only the calls TRELLIS makes are provided (see ops).
"""

__version__ = "0.0.0+my3dobjects"
