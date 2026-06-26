# Hybrid Redraw Policy

Design Mudah uses a Hugging Face pix2pix-first redraw architecture with provider fallback:

- `HF pix2pix endpoint = primary sketch/trace redraw`
- `nunchaku-tech/nunchaku-flux.1-schnell-pix2pix-turbo = default HF pix2pix model`
- `Gemini 3.1 Flash Image = optional secondary provider when selected manually`
- `FLUX.2 Klein 1K = OpenRouter fallback image redraw`
- `Riverflow V2 Fast = fallback image model inside the OpenRouter path when its primary model is unavailable`
- deterministic Logo Restore, trace, vector, cutline, film, PDF, and ZIP stay outside AI

## Pipeline

1. Cloudflare Worker verifies login and credit through the embedded SaaS logic.
2. The backend preprocesses the upload with a Node heuristic:
   - rotate and normalize
   - crop and resize
   - remove border-connected background
   - preserve enclosed artwork
3. Logo Restore runs first for flat logo/text artwork and can return vector artifacts without generative redraw.
4. For AI redraw, the Worker sends the upload to the configured Hugging Face pix2pix endpoint first using the configured HF model.
5. If the HF endpoint fails with timeout, billing, rate-limit, auth, or model-unavailable conditions, the Worker falls back to the configured secondary provider automatically.
6. Inside the OpenRouter path, the backend retries once with `OPENROUTER_IMAGE_MODEL_FALLBACK` when the primary OpenRouter model is unavailable or returns no image.
7. The resulting PNG is postprocessed, then returned to the existing trace and separation flow.

## Invariants

- Ready trace mode must stay local/backend trace only and must not call any remote image generation provider.
- HF endpoint URL, HF model, Gemini model IDs, OpenRouter model IDs, and fallback policy must stay env-editable.
- Persist redraw metadata to the job manifest:
  - configured primary provider
  - actual provider used
  - HF model
  - HF endpoint type
  - HF endpoint logical name or Space id
  - Gemini generation model
  - Gemini reasoning model
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
  - safety summary
  - final technical prompt
- Keep user-facing redraw pricing flat unless pricing policy is explicitly changed.

## Admin Setting

The active pipeline config lives in `app_settings.ai_redraw_model`.
Saved settings normalize into the `huggingface_pix2pix | gemini_direct_image | openrouter_image` config shape, while older OpenRouter-only rows are upgraded without losing the fallback model values.
