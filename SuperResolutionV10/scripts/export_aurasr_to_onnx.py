import argparse
from pathlib import Path

import torch
from huggingface_hub import hf_hub_download


def export_aurasr_to_onnx(
    output_onnx: Path,
    model_dir: Path,
    repo_id: str = "fal/AuraSR-v2",
    opset: int = 17,
) -> Path:
    model_dir.mkdir(parents=True, exist_ok=True)

    config_path = Path(
        hf_hub_download(repo_id=repo_id, filename="config.json", local_dir=str(model_dir))
    )
    safetensors_path = Path(
        hf_hub_download(repo_id=repo_id, filename="model.safetensors", local_dir=str(model_dir))
    )

    from aura_sr import AuraSR  # import after dependency installation

    device = "cuda" if torch.cuda.is_available() else "cpu"
    aura = AuraSR.from_pretrained(str(safetensors_path), use_safetensors=True)
    upsampler = aura.upsampler.to(device).eval()

    input_size = int(aura.input_image_size)
    lowres = torch.randn(1, 3, input_size, input_size, device=device, dtype=torch.float32)
    noise = torch.randn(1, 128, device=device, dtype=torch.float32)

    output_onnx.parent.mkdir(parents=True, exist_ok=True)
    class _ExportWrapper(torch.nn.Module):
        def __init__(self, core: torch.nn.Module) -> None:
            super().__init__()
            self.core = core

        def forward(self, lowres_image: torch.Tensor, noise: torch.Tensor) -> torch.Tensor:
            return self.core(lowres_image=lowres_image, noise=noise)

    wrapper = _ExportWrapper(upsampler).eval()

    torch.onnx.export(
        wrapper,
        (lowres, noise),
        str(output_onnx),
        input_names=["lowres_image", "noise"],
        output_names=["output"],
        opset_version=opset,
        do_constant_folding=True,
        dynamo=False,
    )
    return output_onnx


def main() -> None:
    parser = argparse.ArgumentParser(description="Download AuraSR-v2 safetensors and export ONNX.")
    parser.add_argument(
        "--repo-id",
        default="fal/AuraSR-v2",
        help="HuggingFace model repository id (default: fal/AuraSR-v2)",
    )
    parser.add_argument(
        "--model-dir",
        default="models/aurasr-v2",
        help="Directory to download config/model.safetensors",
    )
    parser.add_argument(
        "--output",
        default="models/aurasr_v2.onnx",
        help="Output ONNX file path",
    )
    parser.add_argument("--opset", type=int, default=17, help="ONNX opset version")
    args = parser.parse_args()

    output = export_aurasr_to_onnx(
        output_onnx=Path(args.output),
        model_dir=Path(args.model_dir),
        repo_id=args.repo_id,
        opset=args.opset,
    )
    print(f"ONNX exported: {output}")
    print("NOTE: This exported graph is the AuraSR upsampler core and expects two inputs:")
    print("  - lowres_image: [B,3,H,W]")
    print("  - noise: [B,128]")


if __name__ == "__main__":
    main()
