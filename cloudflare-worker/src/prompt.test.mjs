import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildAiRedrawPrompt, getAiRedrawModelPresets, normalizeAiRedrawModelConfig } from './index.js';

test('AI redraw model presets expose OpenAI primary with OpenRouter fallback', () => {
  const presets = getAiRedrawModelPresets();

  assert.equal(presets.budget.provider, 'openai_image');
  assert.equal(presets.budget.primaryProvider, 'openai_image');
  assert.equal(presets.budget.fallbackProvider, 'openrouter_image');
  assert.equal(presets.budget.openAiImageModel, 'gpt-image-1.5');
  assert.equal(presets.budget.generationModel, 'black-forest-labs/flux.2-klein-4b');
  assert.equal(presets.budget.fallbackModel, 'sourceful/riverflow-v2-fast');
  assert.equal(presets.budget.promptProfile, 'logo_photo_cleanup_short');
  assert.equal(presets.budget.generationQuality, 'low');
  assert.equal(presets.quality.openAiImageModel, 'gpt-image-1.5');
  assert.equal(presets.standard.generationQuality, 'medium');
  assert.equal(presets.quality.generationQuality, 'medium');
  assert.equal(presets.quality.imageSize, '1K');
  assert.equal(presets.quality.safetyModel, 'nvidia/nemotron-3.5-content-safety:free');
  assert.equal(presets.premium.retryOnLowConfidence, true);
  assert.equal(Object.keys(presets).length, 4);
});

test('legacy standard quality values normalize into medium', () => {
  const normalized = normalizeAiRedrawModelConfig({
    mode: 'quality',
    generationQuality: 'standard'
  });

  assert.equal(normalized.generationQuality, 'medium');
});

test('legacy Gemini direct values normalize into OpenAI primary config', () => {
  const normalized = normalizeAiRedrawModelConfig({
    mode: 'quality',
    provider: 'gemini_direct_image',
    geminiGenerationModel: 'legacy-gemini-model',
    imageSize: '2K',
    estimatedUsdPerImage: 0.101
  });

  assert.equal(normalized.provider, 'openai_image');
  assert.equal(normalized.primaryProvider, 'openai_image');
  assert.equal(normalized.fallbackProvider, 'openrouter_image');
  assert.equal(normalized.openAiImageModel, 'gpt-image-1.5');
  assert.equal(normalized.analysisModel, '');
  assert.equal(normalized.generationModel, 'black-forest-labs/flux.2-klein-4b');
  assert.equal(normalized.fallbackModel, 'sourceful/riverflow-v2-fast');
  assert.equal(normalized.promptProfile, 'logo_photo_cleanup_short');
  assert.equal(normalized.imageSize, '2K');
  assert.equal(normalized.safetyModel, 'nvidia/nemotron-3.5-content-safety:free');
  assert.equal(normalized.resolutionPolicy, 'high');
  assert.equal(normalized.persistPrompt, true);
});

test('legacy LiteLLM rows normalize into OpenAI direct shape', () => {
  const normalized = normalizeAiRedrawModelConfig({
    mode: 'quality',
    provider: 'litellm_image',
    primaryProvider: 'litellm_image',
    fallbackProvider: 'openrouter_image',
    liteLlmImageModel: 'openai/gpt-image-1.5'
  });

  assert.equal(normalized.provider, 'openai_image');
  assert.equal(normalized.primaryProvider, 'openai_image');
  assert.equal(normalized.fallbackProvider, 'openrouter_image');
  assert.equal(normalized.openAiImageModel, 'gpt-image-1.5');
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
  assert.equal(normalized.openAiImageModel, 'gpt-image-1.5');
  assert.equal(normalized.generationModel, 'old-image-model');
  assert.equal(normalized.fallbackModel, 'sourceful/riverflow-v2-fast');
});

test('env defaults can activate OpenAI primary config', () => {
  const normalized = normalizeAiRedrawModelConfig(
    {
      primaryProvider: 'openai_image',
      fallbackProvider: 'openrouter_image'
    },
    {
      OPENAI_IMAGE_MODEL: 'gpt-image-1.5',
      OPENROUTER_IMAGE_MODEL: 'owner/custom-openrouter-model',
      AI_REDRAW_PRIMARY_PROVIDER: 'openai_image',
      AI_REDRAW_FALLBACK_PROVIDER: 'openrouter_image'
    }
  );

  assert.equal(normalized.primaryProvider, 'openai_image');
  assert.equal(normalized.fallbackProvider, 'openrouter_image');
  assert.equal(normalized.openAiImageModel, 'gpt-image-1.5');
  assert.equal(normalized.generationModel, 'owner/custom-openrouter-model');
});

test('OpenAI GPT Image 1.5 is the canonical direct default model', () => {
  const normalized = normalizeAiRedrawModelConfig(
    {
      primaryProvider: 'openai_image',
      fallbackProvider: 'openrouter_image'
    },
    {
      OPENAI_IMAGE_MODEL: 'openai/gpt-image-1.5'
    }
  );

  assert.equal(normalized.openAiImageModel, 'gpt-image-1.5');
});

test('explicit OpenAI GPT Image 1 legacy value stays pinned when requested', () => {
  const normalized = normalizeAiRedrawModelConfig(
    {
      primaryProvider: 'openai_image',
      fallbackProvider: 'openrouter_image',
      openAiImageModel: 'gpt-image-1'
    },
    {}
  );

  assert.equal(normalized.openAiImageModel, 'gpt-image-1');
});

test('explicit fallback provider still works when project defaults are OpenAI-first', () => {
  const normalized = normalizeAiRedrawModelConfig(
    {
      primaryProvider: 'openai_image',
      fallbackProvider: 'openrouter_image'
    },
    {}
  );

  assert.equal(normalized.primaryProvider, 'openai_image');
  assert.equal(normalized.fallbackProvider, 'openrouter_image');
});

test('sablon redraw prompt preserves original colors automatically and improves trace quality', () => {
  const prompt = buildAiRedrawPrompt(
    {
      projectName: 'Logo Sobat',
      productionType: 'sablon',
      separateColors: true,
      colorLimitMode: 'auto',
      maxColors: 4,
      createUnderbaseFilm: true
    },
    { promptProfile: 'logo_photo_cleanup_short' }
  );

  assert.match(prompt, /Bersihkan logo ini dan gambar ulang sangat mirip dengan aslinya/);
  assert.match(prompt, /Pertahankan komposisi, teks, warna, dan bentuk asli/);
  assert.match(prompt, /Perbaiki blur, cacat, gigi pixel, bagian patah, noise foto, dan tepi bergerigi/);
  assert.match(prompt, /Buat hasil seperti master logo digital baru yang bersih, tajam, rata, dan siap trace sablon/);
  assert.match(prompt, /Keep the background solid black/);
  assert.match(prompt, /Keep colors flat and solid/);
  assert.match(prompt, /The final image will be used for screen printing and vector tracing/);
  assert.match(prompt, /Avoid anti-aliasing whenever possible/);
  assert.doesNotMatch(prompt, /professional logo restoration and vector preparation artist/);
});

test('sticker redraw prompt asks for a clean sticker-ready palette even without color separation mode', () => {
  const prompt = buildAiRedrawPrompt(
    {
      projectName: 'Stiker Brand',
      productionType: 'sticker',
      removeBackground: true,
      separateColors: false
    },
    { promptProfile: 'logo_photo_cleanup_short' }
  );

  assert.match(prompt, /sticker-ready solid colors, clear outlines/);
  assert.match(prompt, /dominant colors from the source artwork/);
  assert.match(prompt, /smooth clean curves/);
  assert.match(prompt, /dirty tints, tiny noisy shades/);
  assert.match(prompt, /realistic photo textures/);
});

test('text redraw prompt focuses on letter sharpness and spacing accuracy', () => {
  const prompt = buildAiRedrawPrompt(
    {
      projectName: 'Tulisan Neon',
      productionType: 'sticker',
      removeBackground: true,
      separateColors: false
    },
    { promptProfile: 'logo_photo_cleanup_short' }
  );

  assert.match(prompt, /letter sharpness, spacing accuracy/);
  assert.match(prompt, /smooth readable typographic edges/);
});

test('manual sablon redraw prompt can constrain spot colors', () => {
  const prompt = buildAiRedrawPrompt(
    {
      projectName: 'Logo Telur',
      productionType: 'sablon',
      separateColors: true,
      colorLimitMode: 'manual',
      maxColors: 4
    },
    { promptProfile: 'logo_photo_cleanup_short' }
  );

  assert.doesNotMatch(prompt, /no more than 4 solid spot colors/);
  assert.match(prompt, /Jangan ubah tulisan/);
});
