update public.app_settings
set
  value =
    value
    || jsonb_build_object(
      'liteLlmImageModel', 'openai/gpt-image-1.5',
      'note', 'Default LiteLLM GPT Image 1.5 trace-clone dengan OpenRouter fallback otomatis.'
    ),
  updated_at = timezone('utc', now())
where key = 'ai_redraw_model'
  and coalesce(value->>'liteLlmImageModel', '') <> 'openai/gpt-image-1.5';
