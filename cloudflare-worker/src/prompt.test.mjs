import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildAiRedrawPrompt, getAiRedrawModelPresets, normalizeAiRedrawModelConfig } from './index.js';

test('AI redraw model presets expose LiteLLM primary with OpenRouter fallback', () => {
  const presets = getAiRedrawModelPresets();

  assert.equal(presets.budget.provider, 'litellm_image');
  assert.equal(presets.budget.primaryProvider, 'litellm_image');
  assert.equal(presets.budget.fallbackProvider, 'openrouter_image');
  assert.equal(presets.budget.liteLlmImageModel, 'gemini-3.1-flash-image-preview');
  assert.equal(presets.budget.generationModel, 'black-forest-labs/flux.2-klein-4b');
  assert.equal(presets.budget.fallbackModel, 'sourceful/riverflow-v2-fast');
  assert.equal(presets.budget.promptProfile, 'generic_trace_clone');
  assert.equal(presets.quality.liteLlmImageModel, 'gemini-3.1-flash-image-preview');
  assert.equal(presets.quality.imageSize, '1K');
  assert.equal(presets.quality.safetyModel, 'nvidia/nemotron-3.5-content-safety:free');
  assert.equal(presets.premium.retryOnLowConfidence, true);
  assert.equal(Object.keys(presets).length, 4);
});

test('legacy Gemini direct values normalize into LiteLLM primary config', () => {
  const normalized = normalizeAiRedrawModelConfig({
    mode: 'quality',
    provider: 'gemini_direct_image',
    geminiGenerationModel: 'legacy-gemini-model',
    imageSize: '2K',
    estimatedUsdPerImage: 0.101
  });

  assert.equal(normalized.provider, 'litellm_image');
  assert.equal(normalized.primaryProvider, 'litellm_image');
  assert.equal(normalized.fallbackProvider, 'openrouter_image');
  assert.equal(normalized.liteLlmImageModel, 'legacy-gemini-model');
  assert.equal(normalized.analysisModel, '');
  assert.equal(normalized.generationModel, 'black-forest-labs/flux.2-klein-4b');
  assert.equal(normalized.fallbackModel, 'sourceful/riverflow-v2-fast');
  assert.equal(normalized.promptProfile, 'generic_trace_clone');
  assert.equal(normalized.imageSize, '2K');
  assert.equal(normalized.safetyModel, 'nvidia/nemotron-3.5-content-safety:free');
  assert.equal(normalized.resolutionPolicy, 'high');
  assert.equal(normalized.persistPrompt, true);
});

test('legacy openrouter rows preserve openrouter fallback model values', () => {
  const normalized = normalizeAiRedrawModelConfig({
    mode: 'quality',
    provider: 'openrouter_gemini_image',
    model: 'old-image-model',
    imageSize: '2K',
    estimatedUsdPerImage: 0.101
  });

  assert.equal(normalized.provider, 'openrouter_image');
  assert.equal(normalized.primaryProvider, 'openrouter_image');
  assert.equal(normalized.fallbackProvider, '');
  assert.equal(normalized.liteLlmImageModel, 'gemini-3.1-flash-image-preview');
  assert.equal(normalized.generationModel, 'old-image-model');
  assert.equal(normalized.fallbackModel, 'sourceful/riverflow-v2-fast');
});

test('env defaults can activate LiteLLM primary config', () => {
  const normalized = normalizeAiRedrawModelConfig(
    {
      primaryProvider: 'litellm_image',
      fallbackProvider: 'openrouter_image'
    },
    {
      LITELLM_IMAGE_MODEL: 'gemini-custom-image-preview',
      OPENROUTER_IMAGE_MODEL: 'owner/custom-openrouter-model',
      AI_REDRAW_PRIMARY_PROVIDER: 'litellm_image',
      AI_REDRAW_FALLBACK_PROVIDER: 'openrouter_image'
    }
  );

  assert.equal(normalized.primaryProvider, 'litellm_image');
  assert.equal(normalized.fallbackProvider, 'openrouter_image');
  assert.equal(normalized.liteLlmImageModel, 'gemini-custom-image-preview');
  assert.equal(normalized.generationModel, 'owner/custom-openrouter-model');
});

test('explicit fallback provider still works when project defaults are LiteLLM-first', () => {
  const normalized = normalizeAiRedrawModelConfig(
    {
      primaryProvider: 'litellm_image',
      fallbackProvider: 'openrouter_image'
    },
    {}
  );

  assert.equal(normalized.primaryProvider, 'litellm_image');
  assert.equal(normalized.fallbackProvider, 'openrouter_image');
});

test('sablon redraw prompt preserves original colors automatically and improves trace quality', () => {
  const prompt = buildAiRedrawPrompt(
    {
      productionType: 'sablon',
      separateColors: true,
      colorLimitMode: 'auto',
      maxColors: 4,
      createUnderbaseFilm: true
    },
    { promptProfile: 'generic_trace_clone' }
  );

  assert.match(prompt, /trace-friendly/);
  assert.match(prompt, /screen-print friendly shapes/);
  assert.match(prompt, /Preserve original subject/);
  assert.match(prompt, /Repair blur, camera distortion, jagged edges, broken strokes, stains, scratches, compression artifacts/);
  assert.match(prompt, /clean edges/);
  assert.match(prompt, /Detect and preserve the important original colors/);
  assert.match(prompt, /brand or logo colors/);
  assert.doesNotMatch(prompt, /no more than 4 solid spot colors/);
  assert.match(prompt, /semi-transparent pixels/);
  assert.match(prompt, /choked underbase film/);
  assert.match(prompt, /shadows, or gradients/);
});

test('manual sablon redraw prompt can constrain spot colors', () => {
  const prompt = buildAiRedrawPrompt(
    {
      productionType: 'sablon',
      separateColors: true,
      colorLimitMode: 'manual',
      maxColors: 4
    },
    { promptProfile: 'generic_trace_clone' }
  );

  assert.match(prompt, /no more than 4 solid spot colors/);
  assert.match(prompt, /Detect and preserve the important original colors/);
});
