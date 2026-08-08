update public.app_settings
set
  value = jsonb_build_object(
    'mode', 'quality',
    'preset', 'quality',
    'label', 'Kualitas',
    'provider', 'gemini_direct_image',
    'primaryProvider', 'gemini_direct_image',
    'fallbackProvider', 'openrouter_image',
    'geminiGenerationModel', 'gemini-3.1-flash-image',
    'geminiReasoningModel', 'gemini-2.5-pro',
    'geminiFallbackPolicy', 'quota_or_model_unavailable',
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
    'note', 'Default Gemini direct 1K trace-clone dengan OpenRouter fallback otomatis saat quota, billing, atau model unavailable.'
  ),
  description = 'Pipeline Gemini direct redraw primary + OpenRouter fallback untuk AI redraw',
  is_public = false,
  updated_at = now()
where key = 'ai_redraw_model';

insert into public.app_settings (key, value, is_public, description)
select
  'ai_redraw_model',
  jsonb_build_object(
    'mode', 'quality',
    'preset', 'quality',
    'label', 'Kualitas',
    'provider', 'gemini_direct_image',
    'primaryProvider', 'gemini_direct_image',
    'fallbackProvider', 'openrouter_image',
    'geminiGenerationModel', 'gemini-3.1-flash-image',
    'geminiReasoningModel', 'gemini-2.5-pro',
    'geminiFallbackPolicy', 'quota_or_model_unavailable',
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
    'note', 'Default Gemini direct 1K trace-clone dengan OpenRouter fallback otomatis saat quota, billing, atau model unavailable.'
  ),
  false,
  'Pipeline Gemini direct redraw primary + OpenRouter fallback untuk AI redraw'
where not exists (
  select 1 from public.app_settings where key = 'ai_redraw_model'
);
