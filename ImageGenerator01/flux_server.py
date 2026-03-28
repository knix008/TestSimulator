"""
FLUX.1 dev 로컬 추론 서버
- HuggingFace 캐시(또는 로컬 디렉터리)에 저장된 모델 사용
- T5-XXL 텍스트 인코더만 사용 (CLIP 비활성화) — 긴 프롬프트에 유리
- FastAPI HTTP API 제공 (기본 포트 8000)

사전 설치:
    pip install fastapi uvicorn diffusers transformers accelerate torch sentencepiece protobuf psutil
"""

import gc
import io
import base64
import argparse

import torch
from diffusers import FluxPipeline
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn


# ---------------------------------------------------------------------------
# 인자 파싱
# ---------------------------------------------------------------------------
parser = argparse.ArgumentParser(description="FLUX.1 dev 로컬 서버")
parser.add_argument(
    "--model_path",
    type=str,
    default="black-forest-labs/FLUX.1-dev",
    help="HuggingFace repo id 또는 로컬 모델 디렉터리 경로",
)
parser.add_argument("--port", type=int, default=8000)
parser.add_argument("--host", type=str, default="127.0.0.1")
args, _ = parser.parse_known_args()


# ---------------------------------------------------------------------------
# 디바이스 결정
# ---------------------------------------------------------------------------
def _get_device_and_dtype():
    if torch.cuda.is_available():
        return "cuda", torch.bfloat16
    if torch.backends.mps.is_available():
        return "mps", torch.bfloat16
    return "cpu", torch.float32


DEVICE, DTYPE = _get_device_and_dtype()
print(f"[INFO] Device: {DEVICE}, dtype: {DTYPE}")


# ---------------------------------------------------------------------------
# 모델 로드 (서버 시작 시 1회)
# ---------------------------------------------------------------------------
print(f"[INFO] 모델 로드 중: {args.model_path}")
print("[INFO] T5-XXL 인코더만 사용 (CLIP 비활성화)")

pipe = FluxPipeline.from_pretrained(
    args.model_path,
    text_encoder=None,   # CLIP 비활성화
    tokenizer=None,
    torch_dtype=DTYPE,
)

if DEVICE == "cuda":
    pipe.enable_sequential_cpu_offload()
    pipe.enable_attention_slicing()
    print("[INFO] VRAM 최적화: sequential_cpu_offload + attention_slicing")
elif DEVICE == "mps":
    pipe.enable_attention_slicing()
    if hasattr(pipe, "transformer"):
        pipe.transformer.to(memory_format=torch.channels_last)
    print("[INFO] MPS 최적화: attention_slicing + channels_last")
else:
    pipe.enable_sequential_cpu_offload()
    pipe.enable_attention_slicing()
    print("[INFO] CPU 최적화: sequential_cpu_offload + attention_slicing")

print("[INFO] 모델 로드 완료. 서버 시작 중...")


# ---------------------------------------------------------------------------
# FastAPI 앱
# ---------------------------------------------------------------------------
app = FastAPI(title="FLUX.1 dev Server")


class GenerateRequest(BaseModel):
    prompt: str
    positive_prompt: str = ""          # 프롬프트 뒤에 덧붙일 추가 긍정 프롬프트
    negative_prompt: str = ""          # true_cfg_scale > 1.0 일 때 사용
    width: int = 1024
    height: int = 1024
    num_inference_steps: int = 28
    guidance_scale: float = 3.5        # FLUX guidance scale
    true_cfg_scale: float = 1.0        # > 1.0 이면 negative prompt 적용
    max_sequence_length: int = 512     # T5 최대 토큰 수
    seed: int = -1                     # -1 = 랜덤


class GenerateResponse(BaseModel):
    image_base64: str
    width: int
    height: int
    seed: int
    token_count: int                   # 실제 T5 토큰 수
    token_clipped: int                 # 잘린 토큰 수 (0이면 정상)


@app.get("/health")
def health():
    return {"status": "ok", "device": DEVICE, "model": args.model_path}


@app.post("/generate", response_model=GenerateResponse)
def generate(req: GenerateRequest):
    if not req.prompt.strip():
        raise HTTPException(status_code=400, detail="prompt가 비어 있습니다.")

    # 시드
    actual_seed = req.seed if req.seed >= 0 else int(torch.randint(0, 2**32, (1,)).item())
    generator_device = "cpu" if DEVICE == "mps" else DEVICE
    generator = torch.Generator(device=generator_device).manual_seed(actual_seed)

    # 최종 프롬프트 조합
    full_prompt = req.prompt.rstrip()
    if req.positive_prompt.strip():
        full_prompt += " " + req.positive_prompt.strip()

    max_len = req.max_sequence_length

    try:
        # ── T5 프롬프트 인코딩 ──────────────────────────────────────────
        text_inputs = pipe.tokenizer_2(
            full_prompt,
            padding="max_length",
            max_length=max_len,
            truncation=True,
            return_tensors="pt",
        )

        raw_ids = pipe.tokenizer_2(full_prompt, truncation=False, return_tensors="pt")["input_ids"][0]
        raw_count = len(raw_ids)
        clipped = max(0, raw_count - max_len)
        print(f"[INFO] T5 토큰: {raw_count} / {max_len} (잘림: {clipped})")

        with torch.inference_mode():
            prompt_embeds = pipe.text_encoder_2(
                text_inputs["input_ids"].to(DEVICE),
                output_hidden_states=False,
            )[0]
        prompt_embeds = prompt_embeds.to(dtype=DTYPE)

        # CLIP 비활성화이므로 pooled embedding 은 0벡터
        pooled_prompt_embeds = torch.zeros(1, 768, dtype=DTYPE, device=prompt_embeds.device)

        # ── Negative prompt 인코딩 (true_cfg_scale > 1.0) ──────────────
        negative_prompt_embeds = None
        negative_pooled_prompt_embeds = None

        if req.true_cfg_scale > 1.0 and req.negative_prompt.strip():
            neg_inputs = pipe.tokenizer_2(
                req.negative_prompt,
                padding="max_length",
                max_length=max_len,
                truncation=True,
                return_tensors="pt",
            )
            with torch.inference_mode():
                negative_prompt_embeds = pipe.text_encoder_2(
                    neg_inputs["input_ids"].to(DEVICE),
                    output_hidden_states=False,
                )[0].to(dtype=DTYPE)
            negative_pooled_prompt_embeds = torch.zeros(
                1, 768, dtype=DTYPE, device=negative_prompt_embeds.device
            )

        # ── 이미지 생성 ────────────────────────────────────────────────
        with torch.inference_mode():
            result = pipe(
                prompt_embeds=prompt_embeds,
                pooled_prompt_embeds=pooled_prompt_embeds,
                negative_prompt_embeds=negative_prompt_embeds,
                negative_pooled_prompt_embeds=negative_pooled_prompt_embeds,
                width=req.width,
                height=req.height,
                num_inference_steps=req.num_inference_steps,
                guidance_scale=req.guidance_scale,
                true_cfg_scale=req.true_cfg_scale,
                generator=generator,
            )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

    image = result.images[0]
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    img_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

    return GenerateResponse(
        image_base64=img_b64,
        width=image.width,
        height=image.height,
        seed=actual_seed,
        token_count=raw_count,
        token_clipped=clipped,
    )


# ---------------------------------------------------------------------------
# 진입점
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    uvicorn.run(app, host=args.host, port=args.port)
