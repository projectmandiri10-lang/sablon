update public.app_settings
set
  value =
    value
    || jsonb_build_object(
      'promptProfile', 'photo_logo_cleanup',
      'note', 'Default LiteLLM GPT Image 1.5 photo logo cleanup dengan OpenRouter fallback otomatis.'
    ),
  updated_at = timezone('utc', now())
where key = 'ai_redraw_model'
  and coalesce(value->>'promptProfile', '') <> 'photo_logo_cleanup';
