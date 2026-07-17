# Hybrid Redraw Policy

Design Mudah now uses an AIVene-first redraw architecture with OpenAI fallback:

- `AIVene image redraw = primary sketch/trace redraw`
- `gpt-image-2 = fixed image model for both AIVene primary and OpenAI fallback`
- `OpenAI = secondary provider and automatic fallback`
- deterministic browser trace, vector, cutline, film, PDF, and ZIP stay outside AI

## Pipeline

1. The browser creates a dedicated AI input with a maximum 1080 px longest edge while preserving the source aspect ratio and never upscaling smaller images.
2. Opaque inputs are encoded as WebP at 85% quality; images with transparency remain PNG. Preprocessing must finish before the credit check and debit flow.
3. Cloudflare Worker verifies login and credit through the embedded SaaS logic.
4. For AI redraw, the Worker sends the prepared upload to AIVene `POST /images/edits` first.
5. If AIVene fails because of quota, billing, model-unavailable, timeout, network, or 5xx conditions, the Worker sends the same prepared file once to OpenAI.
6. The Worker returns the raw AI PNG; the browser traces those exact bytes with `processImageLocally` and renders traced PNG/SVG/PDF/ZIP artifacts. Ready Trace skips remote generation entirely.
7. The frontend downloads both raw AI PNG and traced PNG, while browser-generated SVG/PDF/ZIP artifacts remain available for production.

## Invariants

- Ready trace mode must stay local browser trace only and must not call any remote image generation provider. AI redraw also uses the same local browser trace engine after the raw PNG returns.
- AIVene and OpenAI model IDs are fixed to `gpt-image-2` for this pipeline.
- Default deploy should use AIVene as primary provider.
- Default deploy uses preset `standard`, `input_fidelity=low`, `inputMaxEdge=1080`, output quality `medium`, and output size `1K` matched to source orientation.
- Worker forces `input_fidelity=high` for every preset and ignores stale low-fidelity values from legacy settings.
- Low-confidence retries stay disabled. Provider fallback remains limited to quota, billing, model-unavailable, timeout, network, and 5xx failures.
- Persist redraw metadata to the job manifest:
  - configured primary provider
  - actual provider used
  - AIVene image model
  - OpenAI image model
  - fallback reason
  - prompt profile
  - image size
  - input fidelity and maximum input edge
  - source and prepared dimensions
  - source and prepared byte size
  - prepared file format
  - preset
  - preprocess mode
  - final technical prompt
  - browser trace engine and traced artifact metadata
- Keep user-facing redraw pricing flat unless pricing policy is explicitly changed.

## Admin Setting

The active pipeline config lives in `app_settings.ai_redraw_model`.
Saved settings normalize into the `aivene_image | openai_image` config shape, while older direct or proxy-based rows upgrade into the new AIVene-primary default.
