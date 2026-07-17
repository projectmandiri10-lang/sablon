update public.app_settings
set
  value = jsonb_set(coalesce(value, '{}'::jsonb), '{inputFidelity}', '"high"'::jsonb, true),
  description = 'AI redraw AIVene/OpenAI dengan input fidelity high dan output langsung ke Worker trace',
  updated_at = now()
where key = 'ai_redraw_model';
