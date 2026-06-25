# Hybrid Redraw Policy

Design Mudah uses a Gemini-first redraw architecture with OpenRouter fallback:

- `Gemini 3.1 Flash Image = primary direct image redraw`
- `Gemini 2.5 Pro = optional reasoning/prompt-planning slot`
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
4. For AI redraw, Gemini direct generates the cleaned redraw first using the configured Gemini image model.
5. If Gemini fails with quota, billing, rate-limit, or model-unavailable conditions, the Worker falls back to OpenRouter automatically.
6. Inside the OpenRouter path, the backend retries once with `OPENROUTER_IMAGE_MODEL_FALLBACK` when the primary OpenRouter model is unavailable or returns no image.
7. The resulting PNG is postprocessed, then returned to the existing trace and separation flow.

## Invariants

- Ready trace mode must stay local/backend trace only and must not call Gemini or OpenRouter.
- Gemini and OpenRouter model IDs plus fallback policy must stay env-editable.
- Persist redraw metadata to the job manifest:
  - configured primary provider
  - actual provider used
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
Saved settings normalize into the Gemini-primary/OpenRouter-fallback config shape, while older OpenRouter-only rows are upgraded without losing the fallback model values.
