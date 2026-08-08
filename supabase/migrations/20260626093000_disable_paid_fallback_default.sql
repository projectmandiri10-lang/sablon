update public.app_settings
set
  value = jsonb_set(
    jsonb_set(
      jsonb_set(
        coalesce(value, '{}'::jsonb),
        '{fallbackProvider}',
        '""'::jsonb,
        true
      ),
      '{note}',
      '"Default Hugging Face pix2pix 1K untuk trace/sketch redraw tanpa fallback berbayar."'::jsonb,
      true
    ),
    '{primaryProvider}',
    '"huggingface_pix2pix"'::jsonb,
    true
  ),
  description = 'Pipeline Hugging Face pix2pix primary untuk AI redraw gratis CPU',
  updated_at = now()
where key = 'ai_redraw_model';
