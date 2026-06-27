export const LITELLM_IMAGE_REDRAW_PROVIDER = 'litellm_image';
export const OPENROUTER_IMAGE_REDRAW_PROVIDER = 'openrouter_image';
export const OPENROUTER_GEMINI_REDRAW_PROVIDER = 'openrouter_gemini_image';
export const OPENROUTER_RIVERFLOW_REDRAW_PROVIDER = 'openrouter_riverflow_image';
export const LEGACY_GEMINI_DIRECT_IMAGE_REDRAW_PROVIDER = 'gemini_direct_image';
export const HYBRID_REDRAW_PROVIDER = LITELLM_IMAGE_REDRAW_PROVIDER;

export const DEFAULT_LITELLM_IMAGE_MODEL = 'gemini-3.1-flash-image-preview';
export const DEFAULT_OPENROUTER_IMAGE_MODEL = 'black-forest-labs/flux.2-klein-4b';
export const DEFAULT_OPENROUTER_IMAGE_MODEL_FALLBACK = 'sourceful/riverflow-v2-fast';
export const DEFAULT_OPENROUTER_SAFETY_MODEL = 'nvidia/nemotron-3.5-content-safety:free';
export const DEFAULT_OPENROUTER_PROMPT_PROFILE = 'generic_trace_clone';

export const HYBRID_REDRAW_PRESETS = {
  budget: {
    mode: 'budget',
    preset: 'budget',
    label: 'Hemat',
    provider: LITELLM_IMAGE_REDRAW_PROVIDER,
    primaryProvider: LITELLM_IMAGE_REDRAW_PROVIDER,
    fallbackProvider: OPENROUTER_IMAGE_REDRAW_PROVIDER,
    liteLlmImageModel: DEFAULT_LITELLM_IMAGE_MODEL,
    analysisModel: '',
    generationModel: DEFAULT_OPENROUTER_IMAGE_MODEL,
    fallbackModel: DEFAULT_OPENROUTER_IMAGE_MODEL_FALLBACK,
    safetyModel: DEFAULT_OPENROUTER_SAFETY_MODEL,
    promptProfile: DEFAULT_OPENROUTER_PROMPT_PROFILE,
    generationQuality: 'standard',
    imageSize: '1K',
    reasoningEffort: 'low',
    backgroundMode: 'transparent',
    safetyEnabled: true,
    aspectPolicy: 'match_source',
    resolutionPolicy: 'standard',
    preprocess: 'node_heuristic',
    persistPrompt: true,
    retryOnLowConfidence: false,
    estimatedUsdPerImage: 0.03,
    note: 'LiteLLM jadi jalur hemat default untuk redraw sketch/trace dengan OpenRouter sebagai fallback otomatis.'
  },
  standard: {
    mode: 'standard',
    preset: 'standard',
    label: 'Standar',
    provider: LITELLM_IMAGE_REDRAW_PROVIDER,
    primaryProvider: LITELLM_IMAGE_REDRAW_PROVIDER,
    fallbackProvider: OPENROUTER_IMAGE_REDRAW_PROVIDER,
    liteLlmImageModel: DEFAULT_LITELLM_IMAGE_MODEL,
    analysisModel: '',
    generationModel: DEFAULT_OPENROUTER_IMAGE_MODEL,
    fallbackModel: DEFAULT_OPENROUTER_IMAGE_MODEL_FALLBACK,
    safetyModel: DEFAULT_OPENROUTER_SAFETY_MODEL,
    promptProfile: DEFAULT_OPENROUTER_PROMPT_PROFILE,
    generationQuality: 'high',
    imageSize: '1K',
    reasoningEffort: 'low',
    backgroundMode: 'transparent',
    safetyEnabled: true,
    aspectPolicy: 'match_source',
    resolutionPolicy: 'standard',
    preprocess: 'node_heuristic',
    persistPrompt: true,
    retryOnLowConfidence: false,
    estimatedUsdPerImage: 0.04,
    note: 'LiteLLM sebagai jalur utama default, OpenRouter tetap siap sebagai cadangan saat diperlukan.'
  },
  quality: {
    mode: 'quality',
    preset: 'quality',
    label: 'Kualitas',
    provider: LITELLM_IMAGE_REDRAW_PROVIDER,
    primaryProvider: LITELLM_IMAGE_REDRAW_PROVIDER,
    fallbackProvider: OPENROUTER_IMAGE_REDRAW_PROVIDER,
    liteLlmImageModel: DEFAULT_LITELLM_IMAGE_MODEL,
    analysisModel: '',
    generationModel: DEFAULT_OPENROUTER_IMAGE_MODEL,
    fallbackModel: DEFAULT_OPENROUTER_IMAGE_MODEL_FALLBACK,
    safetyModel: DEFAULT_OPENROUTER_SAFETY_MODEL,
    promptProfile: DEFAULT_OPENROUTER_PROMPT_PROFILE,
    generationQuality: 'high',
    imageSize: '1K',
    reasoningEffort: 'medium',
    backgroundMode: 'transparent',
    safetyEnabled: true,
    aspectPolicy: 'match_source',
    resolutionPolicy: 'high',
    preprocess: 'node_heuristic',
    persistPrompt: true,
    retryOnLowConfidence: false,
    estimatedUsdPerImage: 0.05,
    note: 'Default LiteLLM Gemini image preview 1K trace-clone dengan OpenRouter fallback untuk upstream error yang layak dialihkan.'
  },
  premium: {
    mode: 'premium',
    preset: 'premium',
    label: 'Premium',
    provider: LITELLM_IMAGE_REDRAW_PROVIDER,
    primaryProvider: LITELLM_IMAGE_REDRAW_PROVIDER,
    fallbackProvider: OPENROUTER_IMAGE_REDRAW_PROVIDER,
    liteLlmImageModel: DEFAULT_LITELLM_IMAGE_MODEL,
    analysisModel: '',
    generationModel: DEFAULT_OPENROUTER_IMAGE_MODEL,
    fallbackModel: DEFAULT_OPENROUTER_IMAGE_MODEL_FALLBACK,
    safetyModel: DEFAULT_OPENROUTER_SAFETY_MODEL,
    promptProfile: DEFAULT_OPENROUTER_PROMPT_PROFILE,
    generationQuality: 'high',
    imageSize: '2K',
    reasoningEffort: 'high',
    backgroundMode: 'transparent',
    safetyEnabled: true,
    aspectPolicy: 'match_source',
    resolutionPolicy: 'high',
    preprocess: 'node_heuristic',
    persistPrompt: true,
    retryOnLowConfidence: true,
    estimatedUsdPerImage: 0.08,
    note: 'LiteLLM kualitas tinggi dengan OpenRouter sebagai fallback untuk menjaga kontinuitas redraw.'
  }
};

const SUPPORTED_PROVIDERS = [LITELLM_IMAGE_REDRAW_PROVIDER, OPENROUTER_IMAGE_REDRAW_PROVIDER];
const SUPPORTED_PROMPT_PROFILES = ['generic_trace_clone', 'sourceful_trace_clone', 'gemini_trace_clone'];

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function clampEstimatedUsd(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function normalizeText(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeOptionalText(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeGenerationQuality(value, fallback) {
  const normalized = normalizeText(value, fallback).toLowerCase();
  return normalized === 'low' || normalized === 'standard' || normalized === 'high' ? normalized : fallback;
}

function normalizeImageSize(value, fallback) {
  const normalized = normalizeText(value, fallback).toUpperCase();
  return normalized === '1K' || normalized === '2K' || normalized === '4K' ? normalized : fallback;
}

function normalizeReasoningEffort(value, fallback) {
  const normalized = normalizeText(value, fallback).toLowerCase();
  return ['low', 'medium', 'high', 'xhigh'].includes(normalized) ? normalized : fallback;
}

function normalizePromptProfile(value, fallback) {
  const normalized = normalizeText(value, fallback).toLowerCase();
  return SUPPORTED_PROMPT_PROFILES.includes(normalized) ? normalized : fallback;
}

function normalizeBackgroundMode(value, fallback) {
  const normalized = normalizeText(value, fallback).toLowerCase();
  return ['transparent', 'original', 'solid'].includes(normalized) ? normalized : fallback;
}

function normalizeBoolean(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  }
  return fallback;
}

function inferPreset(input, env) {
  if (input.mode === 'custom' || input.preset === 'custom') return 'custom';
  if (typeof input.mode === 'string' && HYBRID_REDRAW_PRESETS[input.mode]) return input.mode;
  if (typeof input.preset === 'string' && HYBRID_REDRAW_PRESETS[input.preset]) return input.preset;
  if (typeof env.AI_REDRAW_PRESET === 'string' && HYBRID_REDRAW_PRESETS[env.AI_REDRAW_PRESET]) return env.AI_REDRAW_PRESET;
  return 'quality';
}

function normalizeProvider(value, fallback) {
  if (value === LEGACY_GEMINI_DIRECT_IMAGE_REDRAW_PROVIDER) return LITELLM_IMAGE_REDRAW_PROVIDER;
  if (value === OPENROUTER_GEMINI_REDRAW_PROVIDER || value === OPENROUTER_RIVERFLOW_REDRAW_PROVIDER) return OPENROUTER_IMAGE_REDRAW_PROVIDER;
  return SUPPORTED_PROVIDERS.includes(value) ? value : fallback;
}

function normalizeFallbackProvider(value, fallback, primaryProvider) {
  if (value === 'none' || value === '') return '';
  const normalized = normalizeProvider(value, fallback);
  return normalized === primaryProvider ? '' : normalized;
}

export function listHybridRedrawPresets() {
  return Object.values(HYBRID_REDRAW_PRESETS);
}

export function normalizeHybridRedrawConfig(value = {}, env = {}) {
  const input = isObject(value) ? value : {};
  const requestedPresetKey = inferPreset(input, env);
  const presetKey = requestedPresetKey === 'custom' ? 'quality' : requestedPresetKey;
  const preset = HYBRID_REDRAW_PRESETS[presetKey] || HYBRID_REDRAW_PRESETS.quality;
  const legacyOpenRouterConfig =
    input.provider === OPENROUTER_IMAGE_REDRAW_PROVIDER ||
    input.provider === OPENROUTER_GEMINI_REDRAW_PROVIDER ||
    input.provider === OPENROUTER_RIVERFLOW_REDRAW_PROVIDER;
  const primaryProvider = normalizeProvider(input.primaryProvider || input.provider, normalizeProvider(env.AI_REDRAW_PRIMARY_PROVIDER, preset.primaryProvider));
  const fallbackProvider = normalizeFallbackProvider(
    input.fallbackProvider,
    normalizeFallbackProvider(env.AI_REDRAW_FALLBACK_PROVIDER, preset.fallbackProvider, primaryProvider),
    primaryProvider
  );

  return {
    mode: requestedPresetKey === 'custom' ? 'custom' : preset.mode,
    preset: requestedPresetKey === 'custom' ? 'custom' : preset.mode,
    label: normalizeText(input.label, requestedPresetKey === 'custom' ? 'Custom' : preset.label),
    provider: primaryProvider,
    primaryProvider,
    fallbackProvider,
    liteLlmImageModel: normalizeText(
      input.liteLlmImageModel || input.geminiGenerationModel || input.geminiModel,
      normalizeText(env.LITELLM_IMAGE_MODEL, preset.liteLlmImageModel)
    ),
    analysisModel: normalizeOptionalText(
      input.analysisModel,
      normalizeOptionalText(env.OPENROUTER_ANALYSIS_MODEL, preset.analysisModel)
    ),
    generationModel: normalizeText(
      input.generationModel || input.model,
      normalizeText(env.OPENROUTER_IMAGE_MODEL, legacyOpenRouterConfig ? input.generationModel || input.model || preset.generationModel : preset.generationModel)
    ),
    fallbackModel: normalizeText(
      input.fallbackModel,
      normalizeText(env.OPENROUTER_IMAGE_MODEL_FALLBACK, legacyOpenRouterConfig ? input.fallbackModel || preset.fallbackModel : preset.fallbackModel)
    ),
    safetyModel: normalizeText(
      input.safetyModel,
      normalizeText(env.OPENROUTER_SAFETY_MODEL, legacyOpenRouterConfig ? input.safetyModel || preset.safetyModel : preset.safetyModel)
    ),
    promptProfile: normalizePromptProfile(input.promptProfile || env.OPENROUTER_PROMPT_PROFILE, preset.promptProfile),
    generationQuality: normalizeGenerationQuality(input.generationQuality || env.OPENROUTER_IMAGE_QUALITY, preset.generationQuality),
    imageSize: normalizeImageSize(input.imageSize || env.OPENROUTER_IMAGE_SIZE, preset.imageSize),
    reasoningEffort: normalizeReasoningEffort(input.reasoningEffort || env.OPENROUTER_REASONING_EFFORT, preset.reasoningEffort),
    backgroundMode: normalizeBackgroundMode(input.backgroundMode || env.OPENROUTER_BACKGROUND_MODE, preset.backgroundMode),
    safetyEnabled: normalizeBoolean(input.safetyEnabled ?? env.OPENROUTER_SAFETY_ENABLED, preset.safetyEnabled),
    aspectPolicy: normalizeText(input.aspectPolicy, preset.aspectPolicy),
    resolutionPolicy: normalizeText(input.resolutionPolicy, preset.resolutionPolicy),
    preprocess: normalizeText(input.preprocess, preset.preprocess),
    persistPrompt: input.persistPrompt !== false,
    retryOnLowConfidence: input.retryOnLowConfidence === true || preset.retryOnLowConfidence === true,
    estimatedUsdPerImage: clampEstimatedUsd(input.estimatedUsdPerImage, preset.estimatedUsdPerImage),
    note: normalizeText(input.note, preset.note)
  };
}
