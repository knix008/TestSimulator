# NOTICE

My3DObjects — Copyright © 2026 SHKWON (knix008@naver.com), MIT License.

## Stability AI (Stable Fast 3D, SPAR3D)

**Powered by Stability AI.**

This Stability AI Model is licensed under the Stability AI Community License,
Copyright © Stability AI Ltd. All Rights Reserved.

My3DObjects does not include the Stable Fast 3D or SPAR3D models or their
source code. On first use, its engine downloads them on the user's computer:

- the source code of Stable Fast 3D (https://github.com/Stability-AI/stable-fast-3d,
  commit ff21fc491b4dc5314bf6734c7c0dabd86b5f5bb2) and of SPAR3D
  (https://github.com/Stability-AI/stable-point-aware-3d, commit
  fdc311b16809e6a8adc2f5a3407ebb3db1a95bd1), and
- the weights from https://huggingface.co/stabilityai/stable-fast-3d and
  https://huggingface.co/stabilityai/stable-point-aware-3d, after the user has
  accepted the license there with their own Hugging Face account.

Changes made when running them (`engine/`):

- The two compiled extensions they share (`texture_baker`, `uv_unwrapper`)
  are replaced by equivalent PyTorch code (`engine/my3dobjects/raster.py`,
  `engine/shims/`) so that no C++ compiler is needed. The UV-overlap test samples
  a 1024 × 1024 grid per cube face instead of exact triangle intersection.
- The image encoders (DINOv2, CLIP) are built from their configuration instead
  of downloading their pretrained weights, which `model.safetensors` replaces
  (for SPAR3D only when the checkpoint is found to hold them).
- SPAR3D: its own background remover (`transparent_background`) is not
  installed — a stand-in (`engine/shims/spar3d`) satisfies the import; the app
  removes backgrounds with rembg. AlphaCLIP (https://github.com/SunzeY/AlphaCLIP,
  commit ef9262bc539728bf8ef2dfe9c402ae12bbfcd9ff, Apache-2.0) is downloaded as
  source, and the CLIP ViT-L/14@336px weights (OpenAI, MIT) it starts from.

See LICENSE-MODELS.md.

## TripoSR

TripoSR — Copyright (c) 2024 Tripo AI & Stability AI, MIT License.
Downloaded on first use from https://github.com/VAST-AI-Research/TripoSR and
https://huggingface.co/stabilityai/TripoSR. Its compiled marching-cubes
extension (`torchmcubes`) is replaced by scikit-image (`engine/shims/torchmcubes`).

## TRELLIS

TRELLIS — Copyright (c) Microsoft Corporation, MIT License.
Downloaded on first use from https://github.com/microsoft/TRELLIS (commit
193e0502b5cb3eb5997ec457d5340e95d09b158e) and
https://huggingface.co/microsoft/TRELLIS-image-large (only the parts the mesh
needs: the sparse-structure flow and decoder, the structured-latent flow and
the mesh decoder). With it: FlexiCubes (https://github.com/MaxtirError/FlexiCubes,
commit 815e075a2a400d06c48d94c347674344ed6ae5c5, Apache-2.0; a git submodule of
TRELLIS) and DINOv2 (https://github.com/facebookresearch/dinov2, Apache-2.0,
through torch.hub).

Changes made when running it: the compiled libraries it imports are replaced
by PyTorch code in `engine/shims/trellis` — xformers (block-diagonal attention →
`torch.nn.functional.scaled_dot_product_attention`), spconv (submanifold sparse
convolution → gather and matrix products), kaolin (`check_tensor`), and open3d /
utils3d / plyfile (imported but unused on this path). Only the mesh is decoded; the
Gaussian / radiance-field decoders and texture baking (CUDA renderers) are not
used, so results carry vertex colours.

## Hunyuan3D

Tencent Hunyuan 3D 2.0 / 2.1 — Copyright (C) Tencent, under the Tencent Hunyuan
3D Community Licenses (not available in the EU, the UK and South Korea).
Downloaded on first use, after the user accepts the license in the app, from
https://github.com/Tencent-Hunyuan/Hunyuan3D-2 (commit f8db63096c8282cb27354314d896feba5ba6ff8a),
https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1 (commit 82920d643c0dc2f7bfd7255f45f62d386edfe60c)
and https://huggingface.co/tencent. Only the shape generation runs (no texture
"paint" model); surfaces use the plain marching-cubes extractor.

## Example pictures (`samples/images`)

- `dragon`, `cottage`, `mushroom-house`, `mech`, `lantern`, `mailbox`,
  `biplane`, `locomotive` — from TRELLIS's `assets/example_image`
  (https://github.com/microsoft/TRELLIS), Copyright (c) Microsoft Corporation,
  MIT License. Reduced to 512 × 512.
- `chair`, `hamburger`, `teapot`, `fox` — from TripoSR's `examples`
  (https://github.com/VAST-AI-Research/TripoSR), Copyright (c) 2024 Tripo AI &
  Stability AI, MIT License. Reduced to 512 × 512.
- `robot`, `mug`, `pawn`, `tree`, `toy-car` — made for this program (MIT).

## Other components

three.js (MIT), React (MIT), i18next (MIT), Tauri (MIT / Apache-2.0),
PyTorch (BSD-3-Clause), rembg (MIT), trimesh (MIT), uv (MIT / Apache-2.0),
easydict (LGPL-3.0, a TRELLIS dependency the engine installs), loralib (MIT),
ftfy (Apache-2.0).
