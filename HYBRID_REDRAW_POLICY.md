# Hybrid Redraw Policy

Design Mudah uses a LiteLLM-first redraw architecture with OpenRouter fallback:

- `LiteLLM image redraw = primary sketch/trace redraw`
- `openai/gpt-image-1.5 = default LiteLLM model`
- `OpenRouter = secondary provider and automatic fallback`
- `Riverflow V2 Fast = optional fallback image model inside the OpenRouter path when its primary model is unavailable`
- deterministic browser trace, vector, cutline, film, PDF, and ZIP stay outside AI

## Pipeline

1. Cloudflare Worker verifies login and credit through the embedded SaaS logic.
2. For AI redraw, the Worker sends the upload to the configured LiteLLM image model first.
3. If LiteLLM fails because of quota, billing, model-unavailable, timeout, network, or 5xx conditions, the Worker falls back automatically to OpenRouter.
4. Inside the OpenRouter path, the Worker retries once with `OPENROUTER_IMAGE_MODEL_FALLBACK` when the primary OpenRouter model is unavailable or returns no image.
5. The resulting PNG returns to the browser trace and separation flow.
6. Ready Trace mode skips remote generation and runs the same deterministic browser processor directly.
7. The browser processor exports SVG/PDF/ZIP artifacts, registration marks, spot-color metadata, prepress quality warnings, and a 1 px choked underbase film when enabled.

## Invariants

- Ready trace mode must stay local browser trace only and must not call any remote image generation provider.
- LiteLLM model IDs and OpenRouter model IDs must stay env-editable.
- Default deploy should use LiteLLM as primary provider.
- Persist redraw metadata to the job manifest:
  - configured primary provider
  - actual provider used
  - LiteLLM image model
  - OpenRouter generation model
  - OpenRouter fallback model and fallback-used flag
  - fallback reason
  - safety model
  - prompt profile
  - image size
  - reasoning effort
  - background mode
  - preset
  - preprocess mode
  - final technical prompt
  - prepress quality warnings from the browser processor
- Keep user-facing redraw pricing flat unless pricing policy is explicitly changed.

## Admin Setting

The active pipeline config lives in `app_settings.ai_redraw_model`.
Saved settings normalize into the `litellm_image | openrouter_image` config shape, while older `gemini_direct_image` rows upgrade into LiteLLM-primary and older legacy OpenRouter rows keep their OpenRouter semantics without losing fallback model values.
