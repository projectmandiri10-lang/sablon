update public.app_settings
set
  value = jsonb_set(
    coalesce(value, '{}'::jsonb),
    '{note}',
    '"Default AIVene GPT Image 2 dengan input maksimal 1080px, fidelity low, dan OpenAI fallback otomatis; trace berjalan lokal di browser."'::jsonb,
    true
  ),
  updated_at = now()
where key = 'ai_redraw_model';
