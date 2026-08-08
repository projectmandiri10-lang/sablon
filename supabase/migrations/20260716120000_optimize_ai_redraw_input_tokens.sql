update public.app_settings
set value = jsonb_build_object(
    'mode', 'standard',
    'preset', 'standard',
    'label', 'Standar Hemat',
    'provider', 'aivene_image',
    'primaryProvider', 'aivene_image',
    'fallbackProvider', 'openai_image',
    'aiveneImageModel', 'gpt-image-1.5',
    'openAiImageModel', 'gpt-image-1.5',
    'promptProfile', 'logo_photo_cleanup_short',
    'generationQuality', 'medium',
    'imageSize', '1K',
    'inputFidelity', 'low',
    'inputMaxEdge', 1080,
    'backgroundMode', 'transparent',
    'safetyEnabled', true,
    'aspectPolicy', 'match_source',
    'resolutionPolicy', 'standard',
    'preprocess', 'browser_1080_then_provider',
    'persistPrompt', true,
    'retryOnLowConfidence', false,
    'estimatedUsdPerImage', 0.04,
    'note', 'Default hemat AIVene GPT Image 1.5 dengan input maksimal 1080px, fidelity low, dan OpenAI fallback otomatis.'
  ),
  description = 'Pipeline hemat AIVene primary + OpenAI fallback untuk AI redraw',
  updated_at = now()
where key = 'ai_redraw_model';
