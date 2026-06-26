---
title: Sablon Pix2pix API
emoji: 🎨
colorFrom: blue
colorTo: pink
sdk: docker
app_port: 7860
pinned: false
license: apache-2.0
---

# Sablon Pix2pix API

FastAPI endpoint for the Cloudflare Worker used by the `sablon` project.

## What this Space does

- Exposes `POST /run` for image-to-image redraw requests.
- Tries to use the configured Hugging Face pix2pix model when GPU is available.
- Falls back to a deterministic CPU-safe cleanup flow when running on free CPU-only hardware.

## Important note for free tier

On a personal free Hugging Face account, your own Space usually runs on CPU Basic unless you have access to ZeroGPU or paid hardware. The default model:

- `nunchaku-tech/nunchaku-flux.1-schnell-pix2pix-turbo`

is not realistic to run well on CPU Basic. This template therefore includes a CPU fallback so the endpoint still responds with a cleaned PNG instead of crashing.

## Environment variables

- `HF_PIX2PIX_MODEL`
  - default: `nunchaku-tech/nunchaku-flux.1-schnell-pix2pix-turbo`
- `HF_PIX2PIX_GUIDANCE_SCALE`
  - default: `1.0`
- `HF_PIX2PIX_STEPS`
  - default: `4`
- `HF_PIX2PIX_MAX_EDGE`
  - default: `1024`
- `HF_PIX2PIX_CPU_FALLBACK`
  - default: `1`

## API

### `GET /`

Returns runtime information.

### `GET /health`

Returns health and capability status.

### `POST /run`

Multipart form fields accepted:

- `image` file
- `prompt` string
- `model` string optional
- `image_size` optional
- `background_mode` optional
- `generation_quality` optional
- `prompt_profile` optional
- `production_type` optional
- `response_format` optional

Returns:

- `image/png` bytes on success
- JSON error on failure

## Recommended env in the main project

```env
HF_TOKEN=
HF_PIX2PIX_ENDPOINT_URL=https://zozodoank-sablon-pix2pix-api.hf.space/run
HF_PIX2PIX_MODEL=nunchaku-tech/nunchaku-flux.1-schnell-pix2pix-turbo
HF_PIX2PIX_TIMEOUT_MS=90000
AI_REDRAW_PRIMARY_PROVIDER=huggingface_pix2pix
AI_REDRAW_FALLBACK_PROVIDER=
```
