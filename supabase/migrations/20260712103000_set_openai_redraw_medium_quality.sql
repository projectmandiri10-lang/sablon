update public.app_settings
set value =
  coalesce(value, '{}'::jsonb)
  || jsonb_build_object(
    'generationQuality', 'medium',
    'note', 'Default OpenAI GPT Image 1.5 short logo cleanup dengan OpenRouter fallback otomatis, quality medium untuk testing.'
  ),
  description = 'Pipeline OpenAI primary + OpenRouter fallback untuk AI redraw',
  updated_at = now()
where key = 'ai_redraw_model'
  and coalesce(value->>'generationQuality', '') <> 'medium';
