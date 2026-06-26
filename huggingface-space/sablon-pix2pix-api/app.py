import io
import os
from functools import lru_cache

import numpy as np
import torch
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse, Response
from PIL import Image, ImageFilter, ImageOps

try:
    from diffusers import DiffusionPipeline
except Exception:
    DiffusionPipeline = None


DEFAULT_MODEL = "nunchaku-tech/nunchaku-flux.1-schnell-pix2pix-turbo"
DEFAULT_MAX_EDGE = 1024
DEFAULT_GUIDANCE_SCALE = 1.0
DEFAULT_STEPS = 4


app = FastAPI(title="Sablon Pix2pix API", version="0.1.0")


def env_flag(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def get_device() -> str:
    return "cuda" if torch.cuda.is_available() else "cpu"


def get_model_id(model_override: str | None = None) -> str:
    return (model_override or os.getenv("HF_PIX2PIX_MODEL") or DEFAULT_MODEL).strip()


def normalize_image(image: Image.Image, max_edge: int) -> Image.Image:
    image = ImageOps.exif_transpose(image).convert("RGBA")
    width, height = image.size
    longest = max(width, height)
    if longest <= max_edge:
        return image
    ratio = max_edge / float(longest)
    resized = image.resize((max(1, int(width * ratio)), max(1, int(height * ratio))), Image.Resampling.LANCZOS)
    return resized


def cpu_free_fallback(source: Image.Image) -> Image.Image:
    # Deterministic cleanup path for CPU-only free Spaces.
    image = source.convert("RGBA")
    alpha = image.getchannel("A")
    rgb = image.convert("RGB")
    rgb = ImageOps.autocontrast(rgb)
    rgb = rgb.filter(ImageFilter.SHARPEN)
    rgb = rgb.filter(ImageFilter.DETAIL)

    array = np.array(rgb)
    bright = array.mean(axis=2)
    white_mask = bright > 247
    if white_mask.any():
        alpha_array = np.array(alpha)
        alpha_array[white_mask] = 0
        alpha = Image.fromarray(alpha_array, mode="L")

    out = rgb.convert("RGBA")
    out.putalpha(alpha)
    return out


@lru_cache(maxsize=1)
def get_pipeline():
    if DiffusionPipeline is None:
        return None, "diffusers_unavailable"

    if get_device() != "cuda":
        return None, "cuda_unavailable"

    model_id = get_model_id()
    try:
        pipeline = DiffusionPipeline.from_pretrained(
            model_id,
            torch_dtype=torch.float16,
        )
        pipeline.to("cuda")
        return pipeline, "ready"
    except Exception as error:
        return None, f"load_failed:{error}"


@app.get("/")
def root():
    _, pipeline_status = get_pipeline()
    return {
        "ok": True,
        "service": "sablon-pix2pix-api",
        "device": get_device(),
        "pipeline_status": pipeline_status,
        "default_model": get_model_id(),
        "cpu_fallback_enabled": env_flag("HF_PIX2PIX_CPU_FALLBACK", True),
        "routes": ["/health", "/run"],
    }


@app.get("/health")
def health():
    _, pipeline_status = get_pipeline()
    return {
        "ok": True,
        "device": get_device(),
        "pipeline_status": pipeline_status,
        "cpu_fallback_enabled": env_flag("HF_PIX2PIX_CPU_FALLBACK", True),
    }


@app.post("/run")
async def run(
    image: UploadFile = File(...),
    prompt: str = Form(""),
    model: str = Form(""),
    image_size: str = Form(""),
    background_mode: str = Form(""),
    generation_quality: str = Form(""),
    prompt_profile: str = Form(""),
    production_type: str = Form(""),
    response_format: str = Form("image"),
):
    source = Image.open(io.BytesIO(await image.read()))
    max_edge = int(os.getenv("HF_PIX2PIX_MAX_EDGE", str(DEFAULT_MAX_EDGE)))
    normalized = normalize_image(source, max_edge=max_edge)

    pipeline, pipeline_status = get_pipeline()
    if pipeline is None:
        if env_flag("HF_PIX2PIX_CPU_FALLBACK", True):
            out = cpu_free_fallback(normalized)
            output = io.BytesIO()
            out.save(output, format="PNG")
            return Response(
                content=output.getvalue(),
                media_type="image/png",
                headers={
                    "X-Sablon-Mode": "cpu-fallback",
                    "X-Sablon-Pipeline-Status": pipeline_status,
                },
            )

        return JSONResponse(
            status_code=503,
            content={
                "error": {
                    "message": "Pix2pix pipeline belum siap di Space ini. GPU tidak tersedia atau model gagal dimuat.",
                    "pipeline_status": pipeline_status,
                    "device": get_device(),
                }
            },
        )

    run_prompt = (prompt or "").strip()
    if not run_prompt:
        run_prompt = "Clean the uploaded artwork into a crisp redraw with a transparent background."

    model_id = get_model_id(model or None)
    guidance_scale = float(os.getenv("HF_PIX2PIX_GUIDANCE_SCALE", str(DEFAULT_GUIDANCE_SCALE)))
    steps = int(os.getenv("HF_PIX2PIX_STEPS", str(DEFAULT_STEPS)))

    if model_id != get_model_id():
        return JSONResponse(
            status_code=400,
            content={
                "error": {
                    "message": "Space ini hanya memuat satu model saat startup. Ganti HF_PIX2PIX_MODEL di Space settings jika ingin model lain."
                }
            },
        )

    try:
        result = pipeline(
            image=normalized.convert("RGB"),
            prompt=run_prompt,
            num_inference_steps=steps,
            guidance_scale=guidance_scale,
        )
        out = result.images[0].convert("RGBA")
        output = io.BytesIO()
        out.save(output, format="PNG")
        return Response(
            content=output.getvalue(),
            media_type="image/png",
            headers={
                "X-Sablon-Mode": "gpu-pix2pix",
                "X-Sablon-Pipeline-Status": pipeline_status,
            },
        )
    except Exception as error:
        if env_flag("HF_PIX2PIX_CPU_FALLBACK", True):
            out = cpu_free_fallback(normalized)
            output = io.BytesIO()
            out.save(output, format="PNG")
            return Response(
                content=output.getvalue(),
                media_type="image/png",
                headers={
                    "X-Sablon-Mode": "cpu-fallback-after-error",
                    "X-Sablon-Error": str(error)[:200],
                },
            )

        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "message": "Gagal menjalankan pipeline pix2pix.",
                    "detail": str(error),
                }
            },
        )
