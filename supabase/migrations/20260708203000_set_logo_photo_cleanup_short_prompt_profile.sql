update public.app_settings
set
  value =
    value
    || jsonb_build_object(
      'promptProfile', 'logo_photo_cleanup_short',
      'note', 'Default LiteLLM GPT Image 1.5 short logo cleanup dengan OpenRouter fallback otomatis.'
    ),
  updated_at = timezone('utc', now())
where key = 'ai_redraw_model'
  and coalesce(value->>'promptProfile', '') <> 'logo_photo_cleanup_short';
