export const AIVENE_IMAGE_REDRAW_PROVIDER = 'aivene_image';
export const OPENAI_IMAGE_REDRAW_PROVIDER = 'openai_image';
export const LEGACY_GEMINI_DIRECT_IMAGE_REDRAW_PROVIDER = 'gemini_direct_image';
export const HYBRID_REDRAW_PROVIDER = AIVENE_IMAGE_REDRAW_PROVIDER;

export const DEFAULT_AIVENE_IMAGE_MODEL = 'gpt-image-2';
export const DEFAULT_OPENAI_IMAGE_MODEL = 'gpt-image-2';
export const DEFAULT_PROMPT_PROFILE = 'logo_photo_cleanup_short';

export const HYBRID_REDRAW_PRESETS = {
  budget: {
    mode: 'budget',
    preset: 'budget',
    label: 'Hemat',
    provider: AIVENE_IMAGE_REDRAW_PROVIDER,
    primaryProvider: AIVENE_IMAGE_REDRAW_PROVIDER,
    fallbackProvider: OPENAI_IMAGE_REDRAW_PROVIDER,
    aiveneImageModel: DEFAULT_AIVENE_IMAGE_MODEL,
    openAiImageModel: DEFAULT_OPENAI_IMAGE_MODEL,
    promptProfile: DEFAULT_PROMPT_PROFILE,
    generationQuality: 'low',
    imageSize: '1K',
    inputFidelity: 'low',
    inputMaxEdge: 1080,
    aspectPolicy: 'match_source',
    resolutionPolicy: 'standard',
    preprocess: 'browser_1080_then_provider',
    persistPrompt: true,
    retryOnLowConfidence: false,
    estimatedUsdPerImage: 0.03,
    note: 'AIVene menjadi jalur hemat default untuk redraw dengan OpenAI sebagai fallback otomatis.'
  },
  standard: {
    mode: 'standard',
    preset: 'standard',
    label: 'Standar',
    provider: AIVENE_IMAGE_REDRAW_PROVIDER,
    primaryProvider: AIVENE_IMAGE_REDRAW_PROVIDER,
    fallbackProvider: OPENAI_IMAGE_REDRAW_PROVIDER,
    aiveneImageModel: DEFAULT_AIVENE_IMAGE_MODEL,
    openAiImageModel: DEFAULT_OPENAI_IMAGE_MODEL,
    promptProfile: DEFAULT_PROMPT_PROFILE,
    generationQuality: 'medium',
    imageSize: '1K',
    inputFidelity: 'low',
    inputMaxEdge: 1080,
    aspectPolicy: 'match_source',
    resolutionPolicy: 'standard',
    preprocess: 'browser_1080_then_provider',
    persistPrompt: true,
    retryOnLowConfidence: false,
    estimatedUsdPerImage: 0.04,
    note: 'AIVene menjadi jalur utama default, OpenAI tetap siap sebagai cadangan saat diperlukan.'
  },
  quality: {
    mode: 'quality',
    preset: 'quality',
    label: 'Kualitas',
    provider: AIVENE_IMAGE_REDRAW_PROVIDER,
    primaryProvider: AIVENE_IMAGE_REDRAW_PROVIDER,
    fallbackProvider: OPENAI_IMAGE_REDRAW_PROVIDER,
    aiveneImageModel: DEFAULT_AIVENE_IMAGE_MODEL,
    openAiImageModel: DEFAULT_OPENAI_IMAGE_MODEL,
    promptProfile: DEFAULT_PROMPT_PROFILE,
    generationQuality: 'medium',
    imageSize: '1K',
    inputFidelity: 'low',
    inputMaxEdge: 1080,
    aspectPolicy: 'match_source',
    resolutionPolicy: 'high',
    preprocess: 'browser_1080_then_provider',
    persistPrompt: true,
    retryOnLowConfidence: false,
    estimatedUsdPerImage: 0.05,
    note: 'Default AIVene GPT Image 1.5 short logo cleanup dengan fallback OpenAI otomatis, quality medium untuk testing.'
  },
  premium: {
    mode: 'premium',
    preset: 'premium',
    label: 'Premium',
    provider: AIVENE_IMAGE_REDRAW_PROVIDER,
    primaryProvider: AIVENE_IMAGE_REDRAW_PROVIDER,
    fallbackProvider: OPENAI_IMAGE_REDRAW_PROVIDER,
    aiveneImageModel: DEFAULT_AIVENE_IMAGE_MODEL,
    openAiImageModel: DEFAULT_OPENAI_IMAGE_MODEL,
    promptProfile: DEFAULT_PROMPT_PROFILE,
    generationQuality: 'high',
    imageSize: '2K',
    inputFidelity: 'low',
    inputMaxEdge: 1080,
    aspectPolicy: 'match_source',
    resolutionPolicy: 'high',
    preprocess: 'browser_1080_then_provider',
    persistPrompt: true,
    retryOnLowConfidence: false,
    estimatedUsdPerImage: 0.08,
    note: 'AIVene kualitas tinggi dengan OpenAI sebagai fallback untuk menjaga kontinuitas redraw.'
  }
};

const SUPPORTED_PROVIDERS = [AIVENE_IMAGE_REDRAW_PROVIDER, OPENAI_IMAGE_REDRAW_PROVIDER];
const SUPPORTED_PROMPT_PROFILES = ['logo_photo_cleanup_short', 'photo_logo_cleanup', 'stylized_redraw', 'generic_trace_clone', 'sourceful_trace_clone', 'gemini_trace_clone'];

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

function normalizeCompatibleImageModel(value, fallback) {
  const normalized = normalizeText(value, fallback);
  const lowered = normalized.toLowerCase();

  if (!lowered) return fallback;
  if (lowered.startsWith('openai/')) return normalized.slice('openai/'.length);
  if (lowered === 'chatgpt-image-latest') return 'chatgpt-image-latest';
  if (/^gpt-image-/i.test(normalized)) return normalized;
  return fallback;
}

function normalizeGenerationQuality(value, fallback) {
  const normalized = normalizeText(value, fallback).toLowerCase();
  if (normalized === 'standard') return 'medium';
  return normalized === 'low' || normalized === 'medium' || normalized === 'high' ? normalized : fallback;
}

function normalizeImageSize(value, fallback) {
  const normalized = normalizeText(value, fallback).toUpperCase();
  return normalized === '1K' || normalized === '2K' || normalized === '4K' ? normalized : fallback;
}

function normalizeInputFidelity(value, fallback) {
  const normalized = normalizeText(value, fallback).toLowerCase();
  return normalized === 'low' || normalized === 'high' ? normalized : fallback;
}

function normalizeInputMaxEdge(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 256 && parsed <= 1080 ? parsed : fallback;
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
  return 'standard';
}

function normalizeProvider(value, fallback) {
  if (value === LEGACY_GEMINI_DIRECT_IMAGE_REDRAW_PROVIDER || value === 'litellm_image') return AIVENE_IMAGE_REDRAW_PROVIDER;
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
    provider: AIVENE_IMAGE_REDRAW_PROVIDER,
    primaryProvider: AIVENE_IMAGE_REDRAW_PROVIDER,
    fallbackProvider: OPENAI_IMAGE_REDRAW_PROVIDER,
    aiveneImageModel: DEFAULT_AIVENE_IMAGE_MODEL,
    openAiImageModel: DEFAULT_OPENAI_IMAGE_MODEL,
    promptProfile: normalizePromptProfile(input.promptProfile || env.AI_REDRAW_PROMPT_PROFILE, preset.promptProfile),
    generationQuality: normalizeGenerationQuality(input.generationQuality || env.AI_REDRAW_IMAGE_QUALITY, preset.generationQuality),
    imageSize: normalizeImageSize(input.imageSize || env.AI_REDRAW_IMAGE_SIZE, preset.imageSize),
    inputFidelity: 'low',
    inputMaxEdge: normalizeInputMaxEdge(input.inputMaxEdge || env.AI_REDRAW_INPUT_MAX_EDGE, preset.inputMaxEdge),
    reasoningEffort: '',
    backgroundMode: normalizeBackgroundMode(input.backgroundMode, 'transparent'),
    safetyEnabled: normalizeBoolean(input.safetyEnabled, true),
    aspectPolicy: normalizeText(input.aspectPolicy, preset.aspectPolicy),
    resolutionPolicy: normalizeText(input.resolutionPolicy, preset.resolutionPolicy),
    preprocess: normalizeText(input.preprocess, preset.preprocess),
    persistPrompt: input.persistPrompt !== false,
    retryOnLowConfidence: input.retryOnLowConfidence === true || preset.retryOnLowConfidence === true,
    estimatedUsdPerImage: clampEstimatedUsd(input.estimatedUsdPerImage, preset.estimatedUsdPerImage),
    note: normalizeText(input.note, preset.note)
  };
}
