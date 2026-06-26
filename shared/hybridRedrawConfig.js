export const GEMINI_DIRECT_IMAGE_REDRAW_PROVIDER = 'gemini_direct_image';
export const OPENROUTER_IMAGE_REDRAW_PROVIDER = 'openrouter_image';
export const HUGGINGFACE_PIX2PIX_PROVIDER = 'huggingface_pix2pix';
export const OPENROUTER_GEMINI_REDRAW_PROVIDER = 'openrouter_gemini_image';
export const OPENROUTER_RIVERFLOW_REDRAW_PROVIDER = 'openrouter_riverflow_image';
export const HYBRID_REDRAW_PROVIDER = HUGGINGFACE_PIX2PIX_PROVIDER;

export const GEMINI_FALLBACK_POLICY_QUOTA_OR_MODEL_UNAVAILABLE = 'quota_or_model_unavailable';
export const GEMINI_FALLBACK_POLICY_ALL = 'all';
export const GEMINI_FALLBACK_POLICY_QUOTA_ONLY = 'quota_only';

export const DEFAULT_GEMINI_IMAGE_MODEL = 'gemini-3.1-flash-image';
export const DEFAULT_GEMINI_REASONING_MODEL = 'gemini-2.5-pro';
export const DEFAULT_GEMINI_FALLBACK_POLICY = GEMINI_FALLBACK_POLICY_QUOTA_OR_MODEL_UNAVAILABLE;

export const DEFAULT_OPENROUTER_IMAGE_MODEL = 'black-forest-labs/flux.2-klein-4b';
export const DEFAULT_OPENROUTER_IMAGE_MODEL_FALLBACK = 'sourceful/riverflow-v2-fast';
export const DEFAULT_OPENROUTER_SAFETY_MODEL = 'nvidia/nemotron-3.5-content-safety:free';
export const DEFAULT_OPENROUTER_PROMPT_PROFILE = 'generic_trace_clone';
export const DEFAULT_HF_PIX2PIX_MODEL = 'nunchaku-tech/nunchaku-flux.1-schnell-pix2pix-turbo';
export const DEFAULT_HF_PIX2PIX_TIMEOUT_MS = 90000;

export const HYBRID_REDRAW_PRESETS = {
  budget: {
    mode: 'budget',
    preset: 'budget',
    label: 'Hemat',
    provider: HUGGINGFACE_PIX2PIX_PROVIDER,
    primaryProvider: HUGGINGFACE_PIX2PIX_PROVIDER,
    fallbackProvider: '',
    hfModel: DEFAULT_HF_PIX2PIX_MODEL,
    hfEndpointUrl: '',
    hfTimeoutMs: DEFAULT_HF_PIX2PIX_TIMEOUT_MS,
    geminiGenerationModel: DEFAULT_GEMINI_IMAGE_MODEL,
    geminiReasoningModel: DEFAULT_GEMINI_REASONING_MODEL,
    geminiFallbackPolicy: DEFAULT_GEMINI_FALLBACK_POLICY,
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
    note: 'Hugging Face pix2pix hemat untuk redraw sketch/trace tanpa provider cadangan, cocok untuk mode gratis CPU.'
  },
  standard: {
    mode: 'standard',
    preset: 'standard',
    label: 'Standar',
    provider: HUGGINGFACE_PIX2PIX_PROVIDER,
    primaryProvider: HUGGINGFACE_PIX2PIX_PROVIDER,
    fallbackProvider: '',
    hfModel: DEFAULT_HF_PIX2PIX_MODEL,
    hfEndpointUrl: '',
    hfTimeoutMs: DEFAULT_HF_PIX2PIX_TIMEOUT_MS,
    geminiGenerationModel: DEFAULT_GEMINI_IMAGE_MODEL,
    geminiReasoningModel: DEFAULT_GEMINI_REASONING_MODEL,
    geminiFallbackPolicy: DEFAULT_GEMINI_FALLBACK_POLICY,
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
    note: 'Hugging Face pix2pix jadi jalur utama default untuk sketch/trace redraw tanpa fallback berbayar.'
  },
  quality: {
    mode: 'quality',
    preset: 'quality',
    label: 'Kualitas',
    provider: HUGGINGFACE_PIX2PIX_PROVIDER,
    primaryProvider: HUGGINGFACE_PIX2PIX_PROVIDER,
    fallbackProvider: '',
    hfModel: DEFAULT_HF_PIX2PIX_MODEL,
    hfEndpointUrl: '',
    hfTimeoutMs: DEFAULT_HF_PIX2PIX_TIMEOUT_MS,
    geminiGenerationModel: DEFAULT_GEMINI_IMAGE_MODEL,
    geminiReasoningModel: DEFAULT_GEMINI_REASONING_MODEL,
    geminiFallbackPolicy: DEFAULT_GEMINI_FALLBACK_POLICY,
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
    note: 'Default Hugging Face pix2pix 1K untuk trace/sketch redraw tanpa fallback berbayar.'
  },
  premium: {
    mode: 'premium',
    preset: 'premium',
    label: 'Premium',
    provider: HUGGINGFACE_PIX2PIX_PROVIDER,
    primaryProvider: HUGGINGFACE_PIX2PIX_PROVIDER,
    fallbackProvider: '',
    hfModel: DEFAULT_HF_PIX2PIX_MODEL,
    hfEndpointUrl: '',
    hfTimeoutMs: DEFAULT_HF_PIX2PIX_TIMEOUT_MS,
    geminiGenerationModel: DEFAULT_GEMINI_IMAGE_MODEL,
    geminiReasoningModel: DEFAULT_GEMINI_REASONING_MODEL,
    geminiFallbackPolicy: DEFAULT_GEMINI_FALLBACK_POLICY,
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
    note: 'Hugging Face pix2pix kualitas tinggi dengan ukuran lebih besar tanpa fallback berbayar.'
  }
};

const SUPPORTED_PROVIDERS = [HUGGINGFACE_PIX2PIX_PROVIDER, GEMINI_DIRECT_IMAGE_REDRAW_PROVIDER, OPENROUTER_IMAGE_REDRAW_PROVIDER];
const SUPPORTED_PROMPT_PROFILES = ['generic_trace_clone', 'sourceful_trace_clone', 'gemini_trace_clone'];
const SUPPORTED_GEMINI_FALLBACK_POLICIES = [
  GEMINI_FALLBACK_POLICY_QUOTA_OR_MODEL_UNAVAILABLE,
  GEMINI_FALLBACK_POLICY_ALL,
  GEMINI_FALLBACK_POLICY_QUOTA_ONLY
];

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

function normalizeTimeoutMs(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function inferPreset(input, env) {
  if (input.mode === 'custom' || input.preset === 'custom') return 'custom';
  if (typeof input.mode === 'string' && HYBRID_REDRAW_PRESETS[input.mode]) return input.mode;
  if (typeof input.preset === 'string' && HYBRID_REDRAW_PRESETS[input.preset]) return input.preset;
  if (typeof env.AI_REDRAW_PRESET === 'string' && HYBRID_REDRAW_PRESETS[env.AI_REDRAW_PRESET]) return env.AI_REDRAW_PRESET;
  return 'quality';
}

function normalizeProvider(value, fallback) {
  return SUPPORTED_PROVIDERS.includes(value) ? value : fallback;
}

function normalizeFallbackProvider(value, fallback, primaryProvider) {
  if (value === 'none' || value === '') return '';
  const normalized = normalizeProvider(value, fallback);
  return normalized === primaryProvider ? '' : normalized;
}

function normalizeGeminiFallbackPolicy(value, fallback) {
  const normalized = normalizeText(value, fallback).toLowerCase();
  return SUPPORTED_GEMINI_FALLBACK_POLICIES.includes(normalized) ? normalized : fallback;
}

export function listHybridRedrawPresets() {
  return Object.values(HYBRID_REDRAW_PRESETS);
}

export function normalizeHybridRedrawConfig(value = {}, env = {}) {
  const input = isObject(value) ? value : {};
  const requestedPresetKey = inferPreset(input, env);
  const presetKey = requestedPresetKey === 'custom' ? 'quality' : requestedPresetKey;
  const preset = HYBRID_REDRAW_PRESETS[presetKey] || HYBRID_REDRAW_PRESETS.quality;
  const legacyOpenRouterConfig = input.provider === OPENROUTER_IMAGE_REDRAW_PROVIDER || input.provider === OPENROUTER_GEMINI_REDRAW_PROVIDER || input.provider === OPENROUTER_RIVERFLOW_REDRAW_PROVIDER;
  const primaryProvider = normalizeProvider(input.primaryProvider, normalizeProvider(env.AI_REDRAW_PRIMARY_PROVIDER, preset.primaryProvider));
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
    hfModel: normalizeText(
      input.hfModel,
      normalizeText(env.HF_PIX2PIX_MODEL, preset.hfModel)
    ),
    hfEndpointUrl: normalizeOptionalText(
      input.hfEndpointUrl,
      normalizeOptionalText(env.HF_PIX2PIX_ENDPOINT_URL, preset.hfEndpointUrl)
    ),
    hfTimeoutMs: normalizeTimeoutMs(
      input.hfTimeoutMs,
      normalizeTimeoutMs(env.HF_PIX2PIX_TIMEOUT_MS, preset.hfTimeoutMs)
    ),
    geminiGenerationModel: normalizeText(
      input.geminiGenerationModel || input.geminiModel,
      normalizeText(env.GEMINI_IMAGE_MODEL, preset.geminiGenerationModel)
    ),
    geminiReasoningModel: normalizeOptionalText(
      input.geminiReasoningModel,
      normalizeOptionalText(env.GEMINI_REASONING_MODEL, preset.geminiReasoningModel)
    ),
    geminiFallbackPolicy: normalizeGeminiFallbackPolicy(
      input.geminiFallbackPolicy,
      normalizeGeminiFallbackPolicy(env.GEMINI_FALLBACK_POLICY, preset.geminiFallbackPolicy)
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
