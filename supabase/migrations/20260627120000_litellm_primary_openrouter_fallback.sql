update public.app_settings
set value = jsonb_build_object(
    'mode', 'quality',
    'preset', 'quality',
    'label', 'Kualitas',
    'provider', 'litellm_image',
    'primaryProvider', 'litellm_image',
    'fallbackProvider', 'openrouter_image',
    'liteLlmImageModel', 'gemini-3.1-flash-image-preview',
    'analysisModel', '',
    'generationModel', 'black-forest-labs/flux.2-klein-4b',
    'fallbackModel', 'sourceful/riverflow-v2-fast',
    'safetyModel', 'nvidia/nemotron-3.5-content-safety:free',
    'promptProfile', 'generic_trace_clone',
    'generationQuality', 'high',
    'imageSize', '1K',
    'reasoningEffort', 'medium',
    'backgroundMode', 'transparent',
    'safetyEnabled', true,
    'aspectPolicy', 'match_source',
    'resolutionPolicy', 'high',
    'preprocess', 'node_heuristic',
    'persistPrompt', true,
    'retryOnLowConfidence', false,
    'estimatedUsdPerImage', 0.05,
    'note', 'Default LiteLLM Gemini image preview 1K trace-clone dengan OpenRouter fallback otomatis.'
  ),
  description = 'Pipeline LiteLLM primary + OpenRouter fallback untuk AI redraw',
  updated_at = timezone('utc', now())
where key = 'ai_redraw_model';

insert into public.app_settings (key, value, is_public, description)
select
  'ai_redraw_model',
  jsonb_build_object(
    'mode', 'quality',
    'preset', 'quality',
    'label', 'Kualitas',
    'provider', 'litellm_image',
    'primaryProvider', 'litellm_image',
    'fallbackProvider', 'openrouter_image',
    'liteLlmImageModel', 'gemini-3.1-flash-image-preview',
    'analysisModel', '',
    'generationModel', 'black-forest-labs/flux.2-klein-4b',
    'fallbackModel', 'sourceful/riverflow-v2-fast',
    'safetyModel', 'nvidia/nemotron-3.5-content-safety:free',
    'promptProfile', 'generic_trace_clone',
    'generationQuality', 'high',
    'imageSize', '1K',
    'reasoningEffort', 'medium',
    'backgroundMode', 'transparent',
    'safetyEnabled', true,
    'aspectPolicy', 'match_source',
    'resolutionPolicy', 'high',
    'preprocess', 'node_heuristic',
    'persistPrompt', true,
    'retryOnLowConfidence', false,
    'estimatedUsdPerImage', 0.05,
    'note', 'Default LiteLLM Gemini image preview 1K trace-clone dengan OpenRouter fallback otomatis.'
  ),
  false,
  'Pipeline LiteLLM primary + OpenRouter fallback untuk AI redraw'
where not exists (
  select 1 from public.app_settings where key = 'ai_redraw_model'
);
