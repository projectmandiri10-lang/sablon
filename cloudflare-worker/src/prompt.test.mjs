import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildAiRedrawPrompt, getAiRedrawModelPresets, normalizeAiRedrawModelConfig } from './index.js';

test('AI redraw model presets expose LiteLLM primary with OpenRouter fallback', () => {
  const presets = getAiRedrawModelPresets();

  assert.equal(presets.budget.provider, 'litellm_image');
  assert.equal(presets.budget.primaryProvider, 'litellm_image');
  assert.equal(presets.budget.fallbackProvider, 'openrouter_image');
  assert.equal(presets.budget.liteLlmImageModel, 'openai/gpt-image-1');
  assert.equal(presets.budget.generationModel, 'black-forest-labs/flux.2-klein-4b');
  assert.equal(presets.budget.fallbackModel, 'sourceful/riverflow-v2-fast');
  assert.equal(presets.budget.promptProfile, 'generic_trace_clone');
  assert.equal(presets.quality.liteLlmImageModel, 'openai/gpt-image-1');
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
  assert.equal(normalized.liteLlmImageModel, 'openai/gpt-image-1');
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
  assert.equal(normalized.liteLlmImageModel, 'gemini/gemini-custom-image-preview');
  assert.equal(normalized.generationModel, 'owner/custom-openrouter-model');
});

test('legacy Gemini image identifiers normalize to the canonical LiteLLM Gemini preview model', () => {
  const normalized = normalizeAiRedrawModelConfig({
    primaryProvider: 'litellm_image',
    fallbackProvider: 'openrouter_image',
    geminiGenerationModel: 'gemini-3.1-flash-image'
  });

  assert.equal(normalized.liteLlmImageModel, 'gemini/gemini-3.1-flash-image-preview');
});

test('OpenAI GPT Image 1 is the canonical LiteLLM default model', () => {
  const normalized = normalizeAiRedrawModelConfig(
    {
      primaryProvider: 'litellm_image',
      fallbackProvider: 'openrouter_image'
    },
    {
      LITELLM_IMAGE_MODEL: 'gpt-image-1'
    }
  );

  assert.equal(normalized.liteLlmImageModel, 'openai/gpt-image-1');
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
      projectName: 'Logo Sobat',
      productionType: 'sablon',
      separateColors: true,
      colorLimitMode: 'auto',
      maxColors: 4,
      createUnderbaseFilm: true
    },
    { promptProfile: 'generic_trace_clone' }
  );

  assert.match(prompt, /professional logo restoration and vector preparation artist/);
  assert.match(prompt, /Preserve the exact layout and composition/);
  assert.match(prompt, /Preserve all text exactly as shown/);
  assert.match(prompt, /Preserve every symbol, swoosh, curve, icon, and decorative element/);
  assert.match(prompt, /Keep the background solid black/);
  assert.match(prompt, /screen-print friendly shapes/);
  assert.match(prompt, /Preserve original subject/);
  assert.match(prompt, /Repair blur, camera distortion, jagged edges, broken strokes, stains, scratches, compression artifacts/);
  assert.match(prompt, /smooth closed edges/);
  assert.match(prompt, /dominant colors from the source artwork/);
  assert.match(prompt, /Detect and preserve the dominant original colors/);
  assert.match(prompt, /brand or logo colors/);
  assert.doesNotMatch(prompt, /no more than 4 solid spot colors/);
  assert.match(prompt, /semi-transparent pixels/);
  assert.match(prompt, /choked underbase film/);
  assert.match(prompt, /shadows, gradients, or realistic photo textures/);
  assert.match(prompt, /Treat this as restoration, not redesign/);
  assert.match(prompt, /The final image will be used for screen printing and vector tracing/);
  assert.match(prompt, /Avoid anti-aliasing whenever possible/);
});

test('sticker redraw prompt asks for a clean sticker-ready palette even without color separation mode', () => {
  const prompt = buildAiRedrawPrompt(
    {
      projectName: 'Stiker Brand',
      productionType: 'sticker',
      removeBackground: true,
      separateColors: false
    },
    { promptProfile: 'generic_trace_clone' }
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
    { promptProfile: 'generic_trace_clone' }
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
    { promptProfile: 'generic_trace_clone' }
  );

  assert.match(prompt, /no more than 4 solid spot colors/);
  assert.match(prompt, /Detect and preserve the dominant original colors/);
});
