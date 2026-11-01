# NOTICE

MyStableFast3D — Copyright © 2026 SHKWON (knix008@naver.com), MIT License.

## Stability AI

**Powered by Stability AI.**

This Stability AI Model is licensed under the Stability AI Community License,
Copyright © Stability AI Ltd. All Rights Reserved.

MyStableFast3D does not include the Stable Fast 3D model or its source code.
On first use, its engine downloads them on the user's computer:

- the source code of Stable Fast 3D (https://github.com/Stability-AI/stable-fast-3d,
  commit ff21fc491b4dc5314bf6734c7c0dabd86b5f5bb2), and
- the weights from https://huggingface.co/stabilityai/stable-fast-3d, after the
  user has accepted the license there with their own Hugging Face account.

Changes made when running it (`engine/`):

- The two compiled extensions of Stable Fast 3D (`texture_baker`, `uv_unwrapper`)
  are replaced by equivalent PyTorch code (`engine/mysf3d/raster.py`,
  `engine/shims/`) so that no C++ compiler is needed. The UV-overlap test samples
  a 1024 × 1024 grid per cube face instead of exact triangle intersection.
- The image encoders (DINOv2, CLIP) are built from their configuration instead
  of downloading their pretrained weights, which `model.safetensors` replaces.

See LICENSE-MODELS.md.

## TripoSR

TripoSR — Copyright (c) 2024 Tripo AI & Stability AI, MIT License.
Downloaded on first use from https://github.com/VAST-AI-Research/TripoSR and
https://huggingface.co/stabilityai/TripoSR. Its compiled marching-cubes
extension (`torchmcubes`) is replaced by scikit-image (`engine/shims/torchmcubes`).

## Hunyuan3D

Tencent Hunyuan 3D 2.0 / 2.1 — Copyright (C) Tencent, under the Tencent Hunyuan
3D Community Licenses (not available in the EU, the UK and South Korea).
Downloaded on first use, after the user accepts the license in the app, from
https://github.com/Tencent-Hunyuan/Hunyuan3D-2 (commit f8db63096c8282cb27354314d896feba5ba6ff8a),
https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1 (commit 82920d643c0dc2f7bfd7255f45f62d386edfe60c)
and https://huggingface.co/tencent. Only the shape generation runs (no texture
"paint" model); surfaces use the plain marching-cubes extractor.

## Other components

three.js (MIT), React (MIT), i18next (MIT), Tauri (MIT / Apache-2.0),
PyTorch (BSD-3-Clause), rembg (MIT), trimesh (MIT), uv (MIT / Apache-2.0).
