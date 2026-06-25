import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getAiRedrawModelPresets, normalizeAiRedrawModelConfig } from './index.js';

test('AI redraw model presets expose OpenRouter FLUX trace-clone options', () => {
  const presets = getAiRedrawModelPresets();

  assert.equal(presets.budget.provider, 'gemini_direct_image');
  assert.equal(presets.budget.primaryProvider, 'gemini_direct_image');
  assert.equal(presets.budget.fallbackProvider, 'openrouter_image');
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

test('legacy ai_redraw_model values normalize into Gemini primary config while preserving OpenRouter fallback models', () => {
  const normalized = normalizeAiRedrawModelConfig({
    mode: 'quality',
    provider: 'openrouter_riverflow_image',
    model: 'old-image-model',
    imageSize: '2K',
    estimatedUsdPerImage: 0.101
  });

  assert.equal(normalized.provider, 'gemini_direct_image');
  assert.equal(normalized.primaryProvider, 'gemini_direct_image');
  assert.equal(normalized.fallbackProvider, 'openrouter_image');
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
