update public.app_settings
set
  value =
    value
    || jsonb_build_object('liteLlmImageModel', 'gemini/gemini-3.1-flash-image-preview')
    || case
      when coalesce(value->>'geminiGenerationModel', '') <> '' then jsonb_build_object('geminiGenerationModel', 'gemini/gemini-3.1-flash-image-preview')
      else '{}'::jsonb
    end
    || case
      when coalesce(value->>'geminiModel', '') <> '' then jsonb_build_object('geminiModel', 'gemini/gemini-3.1-flash-image-preview')
      else '{}'::jsonb
    end,
  updated_at = timezone('utc', now())
where key = 'ai_redraw_model'
  and (
    coalesce(value->>'liteLlmImageModel', '') in (
      'gemini-3.1-flash-image',
      'gemini-3.1-flash-image-preview',
      'gemini/gemini-3.1-flash-image'
    )
    or coalesce(value->>'geminiGenerationModel', '') in (
      'gemini-3.1-flash-image',
      'gemini-3.1-flash-image-preview',
      'gemini/gemini-3.1-flash-image'
    )
    or coalesce(value->>'geminiModel', '') in (
      'gemini-3.1-flash-image',
      'gemini-3.1-flash-image-preview',
      'gemini/gemini-3.1-flash-image'
    )
  );
