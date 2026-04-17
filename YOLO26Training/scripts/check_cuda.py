import sys

import torch


def main() -> int:
    print(f"torch_version: {torch.__version__}")
    print(f"cuda_available: {torch.cuda.is_available()}")
    print(f"cuda_device_count: {torch.cuda.device_count()}")

    if not torch.cuda.is_available():
        print("error: CUDA is not available. Install CUDA-enabled PyTorch and NVIDIA driver.")
        return 1

    for idx in range(torch.cuda.device_count()):
        print(f"gpu_{idx}: {torch.cuda.get_device_name(idx)}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
