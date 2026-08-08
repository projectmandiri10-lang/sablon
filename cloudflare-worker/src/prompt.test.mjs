import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildAiRedrawPrompt, getAiRedrawModelPresets, normalizeAiRedrawModelConfig } from './index.js';

test('AI redraw model presets expose AIVene primary with OpenAI fallback', () => {
  const presets = getAiRedrawModelPresets();

  assert.equal(presets.budget.provider, 'aivene_image');
  assert.equal(presets.budget.primaryProvider, 'aivene_image');
  assert.equal(presets.budget.fallbackProvider, 'openai_image');
  assert.equal(presets.budget.aiveneImageModel, 'gpt-image-2');
  assert.equal(presets.budget.openAiImageModel, 'gpt-image-2');
  assert.equal(presets.budget.promptProfile, 'logo_photo_cleanup_short');
  assert.equal(presets.budget.generationQuality, 'low');
  assert.equal(presets.budget.inputFidelity, 'low');
  assert.equal(presets.standard.inputFidelity, 'low');
  assert.equal(presets.standard.inputMaxEdge, 1080);
  assert.equal(presets.quality.aiveneImageModel, 'gpt-image-2');
  assert.equal(presets.quality.inputFidelity, 'low');
  assert.equal(presets.standard.generationQuality, 'medium');
  assert.equal(presets.quality.generationQuality, 'medium');
  assert.equal(presets.quality.imageSize, '1K');
  assert.equal(presets.premium.retryOnLowConfidence, false);
  assert.equal(Object.keys(presets).length, 4);
});

test('unspecified redraw config defaults to GPT Image 2 low-fidelity input', () => {
  const normalized = normalizeAiRedrawModelConfig();
  assert.equal(normalized.mode, 'standard');
  assert.equal(normalized.generationQuality, 'medium');
  assert.equal(normalized.imageSize, '1K');
  assert.equal(normalized.inputFidelity, 'low');
  assert.equal(normalized.aiveneImageModel, 'gpt-image-2');
  assert.equal(normalized.openAiImageModel, 'gpt-image-2');
  assert.equal(normalized.inputMaxEdge, 1080);
});

test('legacy standard quality values normalize into medium', () => {
  const normalized = normalizeAiRedrawModelConfig({
    mode: 'quality',
    generationQuality: 'standard'
  });

  assert.equal(normalized.generationQuality, 'medium');
});

test('legacy Gemini direct values normalize into AIVene primary config', () => {
  const normalized = normalizeAiRedrawModelConfig({
    mode: 'quality',
    provider: 'gemini_direct_image',
    geminiGenerationModel: 'legacy-gemini-model',
    imageSize: '2K',
    estimatedUsdPerImage: 0.101
  });

  assert.equal(normalized.provider, 'aivene_image');
  assert.equal(normalized.primaryProvider, 'aivene_image');
  assert.equal(normalized.fallbackProvider, 'openai_image');
  assert.equal(normalized.aiveneImageModel, 'gpt-image-2');
  assert.equal(normalized.openAiImageModel, 'gpt-image-2');
  assert.equal(normalized.promptProfile, 'logo_photo_cleanup_short');
  assert.equal(normalized.imageSize, '2K');
  assert.equal(normalized.resolutionPolicy, 'high');
  assert.equal(normalized.persistPrompt, true);
});

test('legacy LiteLLM rows normalize into AIVene direct shape', () => {
  const normalized = normalizeAiRedrawModelConfig({
    mode: 'quality',
    provider: 'litellm_image',
    primaryProvider: 'litellm_image',
    fallbackProvider: 'openai_image',
    liteLlmImageModel: 'openai/gpt-image-1.5'
  });

  assert.equal(normalized.provider, 'aivene_image');
  assert.equal(normalized.primaryProvider, 'aivene_image');
  assert.equal(normalized.fallbackProvider, 'openai_image');
  assert.equal(normalized.aiveneImageModel, 'gpt-image-2');
});

test('env defaults can activate AIVene primary config', () => {
  const normalized = normalizeAiRedrawModelConfig(
    {
      primaryProvider: 'aivene_image',
      fallbackProvider: 'openai_image'
    },
    {
      AIVENE_IMAGE_MODEL: 'gpt-image-1.5',
      OPENAI_IMAGE_MODEL: 'gpt-image-1.5',
      AI_REDRAW_PRIMARY_PROVIDER: 'aivene_image',
      AI_REDRAW_FALLBACK_PROVIDER: 'openai_image'
    }
  );

  assert.equal(normalized.primaryProvider, 'aivene_image');
  assert.equal(normalized.fallbackProvider, 'openai_image');
  assert.equal(normalized.aiveneImageModel, 'gpt-image-2');
  assert.equal(normalized.openAiImageModel, 'gpt-image-2');
});

test('legacy model values are pinned to GPT Image 2 for both routes', () => {
  const normalized = normalizeAiRedrawModelConfig(
    {
      primaryProvider: 'aivene_image',
      fallbackProvider: 'openai_image'
    },
    {
      AIVENE_IMAGE_MODEL: 'openai/gpt-image-1.5',
      OPENAI_IMAGE_MODEL: 'openai/gpt-image-1.5'
    }
  );

  assert.equal(normalized.aiveneImageModel, 'gpt-image-2');
  assert.equal(normalized.openAiImageModel, 'gpt-image-2');
});

test('explicit legacy GPT Image values cannot lower the active model', () => {
  const normalized = normalizeAiRedrawModelConfig(
    {
      primaryProvider: 'aivene_image',
      fallbackProvider: 'openai_image',
      aiveneImageModel: 'gpt-image-1',
      openAiImageModel: 'gpt-image-1'
    },
    {}
  );

  assert.equal(normalized.aiveneImageModel, 'gpt-image-2');
  assert.equal(normalized.openAiImageModel, 'gpt-image-2');
});

test('explicit fallback provider still works when project defaults are AIVene-first', () => {
  const normalized = normalizeAiRedrawModelConfig(
    {
      primaryProvider: 'aivene_image',
      fallbackProvider: 'openai_image'
    },
    {}
  );

  assert.equal(normalized.primaryProvider, 'aivene_image');
  assert.equal(normalized.fallbackProvider, 'openai_image');
});

test('AI redraw always sends only the simple cleanup prompt', () => {
  const variants = [
    [{}, {}],
    [{ projectName: 'Logo Sobat', productionType: 'sablon', separateColors: true }, { promptProfile: 'logo_photo_cleanup_short' }],
    [{ projectName: 'Stiker Brand', productionType: 'sticker', removeBackground: true }, { promptProfile: 'stylized_redraw' }],
    [{ projectName: 'Tulisan Neon', productionType: 'merchandise' }, { promptProfile: 'photo_logo_cleanup' }]
  ];

  for (const [settings, config] of variants) {
    assert.equal(buildAiRedrawPrompt(settings, config), 'bersihkan gambar');
  }
});

test('explicit Admin selection can use AIVene GPT Image 1.5 only', () => {
  const normalized = normalizeAiRedrawModelConfig({
    mode: 'custom',
    aiveneImageModel: 'gpt-image-1.5',
    openAiImageModel: 'gpt-image-1.5'
  });

  assert.equal(normalized.aiveneImageModel, 'gpt-image-1.5');
  assert.equal(normalized.openAiImageModel, 'gpt-image-2');
});

test('unknown AIVene model selections return to GPT Image 2', () => {
  for (const model of ['gpt-image-1', 'gpt-image-3', 'openai/gpt-image-1.5', 'typo']) {
    const normalized = normalizeAiRedrawModelConfig({ mode: 'custom', aiveneImageModel: model });
    assert.equal(normalized.aiveneImageModel, 'gpt-image-2');
    assert.equal(normalized.openAiImageModel, 'gpt-image-2');
  }
});
