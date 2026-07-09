update public.app_settings
set
  value = (
    coalesce(value, '{}'::jsonb)
    - 'liteLlmImageModel'
    - 'geminiGenerationModel'
    - 'geminiModel'
  )
  || jsonb_build_object(
    'provider',
    case
      when coalesce(value->>'provider', '') = 'openrouter_image' then 'openrouter_image'
      else 'openai_image'
    end,
    'primaryProvider',
    case
      when coalesce(value->>'primaryProvider', value->>'provider', '') = 'openrouter_image' then 'openrouter_image'
      else 'openai_image'
    end,
    'fallbackProvider',
    case
      when coalesce(value->>'primaryProvider', value->>'provider', '') = 'openrouter_image' then coalesce(value->>'fallbackProvider', '')
      else 'openrouter_image'
    end,
    'openAiImageModel',
    case
      when coalesce(value->>'openAiImageModel', '') in ('gpt-image-1', 'gpt-image-1.5', 'gpt-image-1-mini', 'chatgpt-image-latest') then value->>'openAiImageModel'
      when coalesce(value->>'openAiImageModel', '') like 'openai/%' then replace(value->>'openAiImageModel', 'openai/', '')
      when coalesce(value->>'liteLlmImageModel', '') in ('openai/gpt-image-1', 'gpt-image-1') then 'gpt-image-1'
      else 'gpt-image-1.5'
    end,
    'promptProfile', 'logo_photo_cleanup_short',
    'note', 'Default OpenAI GPT Image 1.5 short logo cleanup dengan OpenRouter fallback otomatis.'
  ),
  description = 'Pipeline OpenAI primary + OpenRouter fallback untuk AI redraw',
  updated_at = timezone('utc', now())
where key = 'ai_redraw_model'
  and (
    coalesce(value->>'provider', '') = 'litellm_image'
    or coalesce(value->>'primaryProvider', '') = 'litellm_image'
    or value ? 'liteLlmImageModel'
    or coalesce(value->>'openAiImageModel', '') = ''
    or coalesce(value->>'promptProfile', '') <> 'logo_photo_cleanup_short'
    or coalesce(description, '') <> 'Pipeline OpenAI primary + OpenRouter fallback untuk AI redraw'
  );
