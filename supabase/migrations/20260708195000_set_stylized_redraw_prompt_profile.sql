update public.app_settings
set
  value =
    value
    || jsonb_build_object(
      'promptProfile', 'stylized_redraw',
      'note', 'Default LiteLLM GPT Image 1.5 stylized redraw dengan OpenRouter fallback otomatis.'
    ),
  updated_at = timezone('utc', now())
where key = 'ai_redraw_model'
  and coalesce(value->>'promptProfile', '') <> 'stylized_redraw';
