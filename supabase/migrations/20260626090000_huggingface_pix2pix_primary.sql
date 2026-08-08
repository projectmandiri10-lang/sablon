update public.app_settings
set
  value = jsonb_build_object(
    'mode', 'quality',
    'preset', 'quality',
    'label', 'Kualitas',
    'provider', 'huggingface_pix2pix',
    'primaryProvider', 'huggingface_pix2pix',
    'fallbackProvider', 'openrouter_image',
    'hfModel', 'nunchaku-tech/nunchaku-flux.1-schnell-pix2pix-turbo',
    'hfEndpointUrl', '',
    'hfTimeoutMs', 90000,
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
    'note', 'Default Hugging Face pix2pix 1K untuk trace/sketch redraw dengan OpenRouter fallback otomatis.'
  ),
  description = 'Pipeline Hugging Face pix2pix primary + OpenRouter fallback untuk AI redraw',
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
    'provider', 'huggingface_pix2pix',
    'primaryProvider', 'huggingface_pix2pix',
    'fallbackProvider', 'openrouter_image',
    'hfModel', 'nunchaku-tech/nunchaku-flux.1-schnell-pix2pix-turbo',
    'hfEndpointUrl', '',
    'hfTimeoutMs', 90000,
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
    'note', 'Default Hugging Face pix2pix 1K untuk trace/sketch redraw dengan OpenRouter fallback otomatis.'
  ),
  false,
  'Pipeline Hugging Face pix2pix primary + OpenRouter fallback untuk AI redraw'
where not exists (
  select 1 from public.app_settings where key = 'ai_redraw_model'
);
