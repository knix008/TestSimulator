import argparse
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path
from urllib.request import urlretrieve


ROOT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_MODELS_DIR = ROOT_DIR / "models"
EXPORT_AURASR_SCRIPT = ROOT_DIR / "scripts" / "export_aurasr_to_onnx.py"


SWINIR_URLS = [
    # Primary candidate used in this project previously.
    "https://github.com/axinc-ai/ailia-models/releases/download/onnx_models/swinir_x4_gan.onnx",
    # Fallback mirror.
    "https://huggingface.co/cyberdelia/swinir-onnx/resolve/main/swinir_x4_gan.onnx",
]

ESRGAN_SINGLE_ONNX_URL = (
    "https://huggingface.co/qualcomm/ESRGAN/resolve/"
    "77059f2407d67ddd813aa5055f61424039ab6154/ESRGAN.onnx"
)

ESRGAN_EXTERNAL_ZIP_URL = (
    "https://qaihub-public-assets.s3.us-west-2.amazonaws.com/"
    "qai-hub-models/models/esrgan/releases/v0.46.0/esrgan-onnx-float.zip"
)


def info(msg: str) -> None:
    print(f"[prepare_sr_models] {msg}")


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def download_file(url: str, destination: Path) -> None:
    ensure_dir(destination.parent)
    info(f"Downloading: {url}")
    urlretrieve(url, destination)
    info(f"Saved: {destination}")


def download_with_fallback(urls: list[str], destination: Path) -> None:
    last_error: Exception | None = None
    for url in urls:
        try:
            download_file(url, destination)
            return
        except Exception as ex:  # pragma: no cover - network dependent
            last_error = ex
            info(f"Failed from {url}: {ex}")
    raise RuntimeError(f"All download URLs failed for: {destination.name}") from last_error


def prepare_swinir(models_dir: Path) -> Path:
    output = models_dir / "swinir_x4_gan.onnx"
    download_with_fallback(SWINIR_URLS, output)
    return output


def prepare_esrgan_single(models_dir: Path) -> Path:
    output = models_dir / "esrgan.onnx"
    download_file(ESRGAN_SINGLE_ONNX_URL, output)
    data_sidecar = models_dir / "esrgan.data"
    if data_sidecar.exists():
        info("Removing stale esrgan.data (single-file ONNX does not need it).")
        data_sidecar.unlink()
    return output


def prepare_esrgan_external(models_dir: Path) -> tuple[Path, Path]:
    with tempfile.TemporaryDirectory(prefix="sr_esrgan_") as tmp:
        tmp_dir = Path(tmp)
        zip_path = tmp_dir / "esrgan-onnx-float.zip"
        download_file(ESRGAN_EXTERNAL_ZIP_URL, zip_path)
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(tmp_dir)

        onnx_src = tmp_dir / "esrgan-onnx-float" / "esrgan.onnx"
        data_src = tmp_dir / "esrgan-onnx-float" / "esrgan.data"
        if not onnx_src.exists() or not data_src.exists():
            raise FileNotFoundError("esrgan.onnx or esrgan.data not found in downloaded package.")

        onnx_dst = models_dir / "esrgan.onnx"
        data_dst = models_dir / "esrgan.data"
        shutil.copy2(onnx_src, onnx_dst)
        shutil.copy2(data_src, data_dst)
        info(f"Saved external-data ESRGAN: {onnx_dst}, {data_dst}")
        return onnx_dst, data_dst


def prepare_aurasr(models_dir: Path, model_dir: Path) -> Path:
    if not EXPORT_AURASR_SCRIPT.exists():
        raise FileNotFoundError(f"AuraSR export script not found: {EXPORT_AURASR_SCRIPT}")

    output = models_dir / "aurasr_v2.onnx"
    cmd = [
        sys.executable,
        str(EXPORT_AURASR_SCRIPT),
        "--output",
        str(output),
        "--model-dir",
        str(model_dir),
    ]
    info(f"Exporting AuraSR ONNX via: {' '.join(cmd)}")
    subprocess.run(cmd, check=True)
    return output


def check_onnx_runtime_load(paths: list[Path]) -> None:
    import onnxruntime as ort

    for path in paths:
        if not path.exists():
            raise FileNotFoundError(f"Model does not exist: {path}")
        info(f"Validating ORT load: {path.name}")
        session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
        inputs = [(i.name, i.shape) for i in session.get_inputs()]
        info(f"  OK, inputs={inputs}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Download/prepare SR model files (SwinIR, ESRGAN, AuraSR) for this project."
    )
    parser.add_argument(
        "--models-dir",
        default=str(DEFAULT_MODELS_DIR),
        help="Target directory for model files (default: models/)",
    )
    parser.add_argument(
        "--aurasr-model-dir",
        default=str(DEFAULT_MODELS_DIR / "aurasr-v2"),
        help="Local directory used by AuraSR exporter for downloaded source weights.",
    )
    parser.add_argument(
        "--esrgan-mode",
        choices=["single", "external"],
        default="single",
        help="ESRGAN format: single(.onnx only) or external(.onnx + .data).",
    )
    parser.add_argument(
        "--skip-swinir",
        action="store_true",
        help="Skip SwinIR download.",
    )
    parser.add_argument(
        "--skip-esrgan",
        action="store_true",
        help="Skip ESRGAN preparation.",
    )
    parser.add_argument(
        "--skip-aurasr",
        action="store_true",
        help="Skip AuraSR ONNX export.",
    )
    parser.add_argument(
        "--no-verify",
        action="store_true",
        help="Skip ONNX Runtime load verification.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    models_dir = Path(args.models_dir).resolve()
    aurasr_model_dir = Path(args.aurasr_model_dir).resolve()
    ensure_dir(models_dir)

    prepared: list[Path] = []

    if not args.skip_swinir:
        prepared.append(prepare_swinir(models_dir))

    if not args.skip_esrgan:
        if args.esrgan_mode == "single":
            prepared.append(prepare_esrgan_single(models_dir))
        else:
            onnx_path, _ = prepare_esrgan_external(models_dir)
            prepared.append(onnx_path)

    if not args.skip_aurasr:
        prepared.append(prepare_aurasr(models_dir, aurasr_model_dir))

    if not args.no_verify:
        check_onnx_runtime_load(prepared)

    info("Done.")
    info("If AuraSR export uses external data, keep generated sidecar files in models/ together with aurasr_v2.onnx.")


if __name__ == "__main__":
    main()
