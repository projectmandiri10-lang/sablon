update public.app_settings
set value = jsonb_build_object(
    'mode', 'quality',
    'preset', 'quality',
    'label', 'Kualitas',
    'provider', 'aivene_image',
    'primaryProvider', 'aivene_image',
    'fallbackProvider', 'openai_image',
    'aiveneImageModel', 'gpt-image-1.5',
    'openAiImageModel', 'gpt-image-1.5',
    'promptProfile', 'logo_photo_cleanup_short',
    'generationQuality', 'medium',
    'imageSize', '1K',
    'backgroundMode', 'transparent',
    'safetyEnabled', to_jsonb(true),
    'aspectPolicy', 'match_source',
    'resolutionPolicy', 'high',
    'preprocess', 'node_heuristic',
    'persistPrompt', to_jsonb(true),
    'retryOnLowConfidence', to_jsonb(false),
    'estimatedUsdPerImage', to_jsonb(0.05),
    'note', 'Default AIVene GPT Image 1.5 short logo cleanup dengan OpenAI fallback otomatis, quality medium untuk testing.'
  ),
  description = 'Pipeline AIVene primary + OpenAI fallback untuk AI redraw',
  updated_at = now()
where key = 'ai_redraw_model';
