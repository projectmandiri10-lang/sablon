update public.app_settings
set
  value =
    value
    || jsonb_build_object('liteLlmImageModel', 'openai/gpt-image-1')
    || case
      when coalesce(value->>'geminiGenerationModel', '') <> '' then jsonb_build_object('geminiGenerationModel', '')
      else '{}'::jsonb
    end
    || case
      when coalesce(value->>'geminiModel', '') <> '' then jsonb_build_object('geminiModel', '')
      else '{}'::jsonb
    end,
  updated_at = timezone('utc', now())
where key = 'ai_redraw_model'
  and coalesce(value->>'liteLlmImageModel', '') <> 'openai/gpt-image-1';
