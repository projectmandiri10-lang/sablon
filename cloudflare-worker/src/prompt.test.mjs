import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getAiRedrawModelPresets, normalizeAiRedrawModelConfig } from './index.js';

test('AI redraw model presets expose OpenRouter FLUX trace-clone options', () => {
  const presets = getAiRedrawModelPresets();

  assert.equal(presets.budget.provider, 'huggingface_pix2pix');
  assert.equal(presets.budget.primaryProvider, 'huggingface_pix2pix');
  assert.equal(presets.budget.fallbackProvider, '');
  assert.equal(presets.budget.hfModel, 'nunchaku-tech/nunchaku-flux.1-schnell-pix2pix-turbo');
  assert.equal(presets.budget.hfTimeoutMs, 90000);
  assert.equal(presets.budget.geminiGenerationModel, 'gemini-3.1-flash-image');
  assert.equal(presets.budget.geminiReasoningModel, 'gemini-2.5-pro');
  assert.equal(presets.budget.geminiFallbackPolicy, 'quota_or_model_unavailable');
  assert.equal(presets.budget.generationModel, 'black-forest-labs/flux.2-klein-4b');
  assert.equal(presets.budget.fallbackModel, 'sourceful/riverflow-v2-fast');
  assert.equal(presets.budget.promptProfile, 'generic_trace_clone');
  assert.equal(presets.quality.geminiGenerationModel, 'gemini-3.1-flash-image');
  assert.equal(presets.quality.imageSize, '1K');
  assert.equal(presets.quality.safetyModel, 'nvidia/nemotron-3.5-content-safety:free');
  assert.equal(presets.premium.retryOnLowConfidence, true);
  assert.equal(Object.keys(presets).length, 4);
});

test('legacy ai_redraw_model values normalize into Hugging Face primary config while preserving OpenRouter fallback models', () => {
  const normalized = normalizeAiRedrawModelConfig({
    mode: 'quality',
    provider: 'openrouter_riverflow_image',
    model: 'old-image-model',
    imageSize: '2K',
    estimatedUsdPerImage: 0.101
  });

  assert.equal(normalized.provider, 'huggingface_pix2pix');
  assert.equal(normalized.primaryProvider, 'huggingface_pix2pix');
  assert.equal(normalized.fallbackProvider, '');
  assert.equal(normalized.hfModel, 'nunchaku-tech/nunchaku-flux.1-schnell-pix2pix-turbo');
  assert.equal(normalized.hfTimeoutMs, 90000);
  assert.equal(normalized.geminiGenerationModel, 'gemini-3.1-flash-image');
  assert.equal(normalized.geminiReasoningModel, 'gemini-2.5-pro');
  assert.equal(normalized.analysisModel, '');
  assert.equal(normalized.generationModel, 'old-image-model');
  assert.equal(normalized.fallbackModel, 'sourceful/riverflow-v2-fast');
  assert.equal(normalized.promptProfile, 'generic_trace_clone');
  assert.equal(normalized.imageSize, '2K');
  assert.equal(normalized.safetyModel, 'nvidia/nemotron-3.5-content-safety:free');
  assert.equal(normalized.resolutionPolicy, 'high');
  assert.equal(normalized.persistPrompt, true);
});

test('env defaults can activate Hugging Face pix2pix primary config', () => {
  const normalized = normalizeAiRedrawModelConfig(
    {
      primaryProvider: 'huggingface_pix2pix',
      fallbackProvider: 'openrouter_image'
    },
    {
      HF_PIX2PIX_ENDPOINT_URL: 'https://demo-space.hf.space/run',
      HF_PIX2PIX_MODEL: 'owner/custom-pix2pix',
      HF_PIX2PIX_TIMEOUT_MS: '120000',
      AI_REDRAW_PRIMARY_PROVIDER: 'huggingface_pix2pix',
      AI_REDRAW_FALLBACK_PROVIDER: 'openrouter_image'
    }
  );

  assert.equal(normalized.primaryProvider, 'huggingface_pix2pix');
  assert.equal(normalized.fallbackProvider, 'openrouter_image');
  assert.equal(normalized.hfEndpointUrl, 'https://demo-space.hf.space/run');
  assert.equal(normalized.hfModel, 'owner/custom-pix2pix');
  assert.equal(normalized.hfTimeoutMs, 120000);
});

test('explicit fallback provider still works when project defaults are free-only', () => {
  const normalized = normalizeAiRedrawModelConfig(
    {
      primaryProvider: 'huggingface_pix2pix',
      fallbackProvider: 'openrouter_image'
    },
    {}
  );

  assert.equal(normalized.primaryProvider, 'huggingface_pix2pix');
  assert.equal(normalized.fallbackProvider, 'openrouter_image');
});
