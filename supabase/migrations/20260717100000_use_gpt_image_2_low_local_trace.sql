update public.app_settings
set
  value = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(coalesce(value, '{}'::jsonb), '{aiveneImageModel}', '"gpt-image-2"'::jsonb, true),
        '{openAiImageModel}',
        '"gpt-image-2"'::jsonb,
        true
      ),
      '{inputFidelity}',
      '"low"'::jsonb,
      true
    ),
    '{primaryProvider}',
    '"aivene_image"'::jsonb,
    true
  ) || jsonb_build_object('fallbackProvider', 'openai_image'),
  description = 'AIVene GPT Image 2 + OpenAI fallback; input fidelity low; trace dan artefak berjalan lokal di browser',
  updated_at = now()
where key = 'ai_redraw_model';
