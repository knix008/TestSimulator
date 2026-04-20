#!/usr/bin/env python3
"""Print ONNX model input/output names and shapes (static or symbolic).

Useful after export to confirm the graph matches what BrainYolo26Session expects
(e.g. input named "images", multiple outputs for seg vs det).
"""
from __future__ import annotations

import argparse
import sys


def main() -> int:
    ap = argparse.ArgumentParser(description="Inspect ONNX I/O shapes and types.")
    ap.add_argument("onnx", help="Path to .onnx file")
    args = ap.parse_args()

    try:
        import onnxruntime as ort
    except ImportError:
        print("Missing onnxruntime. Install: pip install onnxruntime", file=sys.stderr)
        return 1

    sess = ort.InferenceSession(args.onnx, providers=["CPUExecutionProvider"])
    print("Execution providers (session):", sess.get_providers())
    print("\nInputs:")
    for i in sess.get_inputs():
        print(f"  {i.name}: shape={i.shape} type={i.type}")
    print("\nOutputs:")
    for o in sess.get_outputs():
        print(f"  {o.name}: shape={o.shape} type={o.type}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
