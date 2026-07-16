import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildAiRedrawPrompt, getAiRedrawModelPresets, normalizeAiRedrawModelConfig } from './index.js';

test('AI redraw model presets expose AIVene primary with OpenAI fallback', () => {
  const presets = getAiRedrawModelPresets();

  assert.equal(presets.budget.provider, 'aivene_image');
  assert.equal(presets.budget.primaryProvider, 'aivene_image');
  assert.equal(presets.budget.fallbackProvider, 'openai_image');
  assert.equal(presets.budget.aiveneImageModel, 'gpt-image-1.5');
  assert.equal(presets.budget.openAiImageModel, 'gpt-image-1.5');
  assert.equal(presets.budget.promptProfile, 'logo_photo_cleanup_short');
  assert.equal(presets.budget.generationQuality, 'low');
  assert.equal(presets.budget.inputFidelity, 'low');
  assert.equal(presets.standard.inputFidelity, 'low');
  assert.equal(presets.standard.inputMaxEdge, 1080);
  assert.equal(presets.quality.aiveneImageModel, 'gpt-image-1.5');
  assert.equal(presets.quality.inputFidelity, 'high');
  assert.equal(presets.standard.generationQuality, 'medium');
  assert.equal(presets.quality.generationQuality, 'medium');
  assert.equal(presets.quality.imageSize, '1K');
  assert.equal(presets.premium.retryOnLowConfidence, false);
  assert.equal(Object.keys(presets).length, 4);
});

test('unspecified redraw config defaults to the standard low-fidelity preset', () => {
  const normalized = normalizeAiRedrawModelConfig();
  assert.equal(normalized.mode, 'standard');
  assert.equal(normalized.generationQuality, 'medium');
  assert.equal(normalized.imageSize, '1K');
  assert.equal(normalized.inputFidelity, 'low');
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
  assert.equal(normalized.aiveneImageModel, 'gpt-image-1.5');
  assert.equal(normalized.openAiImageModel, 'gpt-image-1.5');
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
  assert.equal(normalized.aiveneImageModel, 'gpt-image-1.5');
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
  assert.equal(normalized.aiveneImageModel, 'gpt-image-1.5');
  assert.equal(normalized.openAiImageModel, 'gpt-image-1.5');
});

test('OpenAI GPT Image 1.5 stays canonical for both AIVene and OpenAI routes', () => {
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

  assert.equal(normalized.aiveneImageModel, 'gpt-image-1.5');
  assert.equal(normalized.openAiImageModel, 'gpt-image-1.5');
});

test('explicit OpenAI GPT Image 1 legacy value stays pinned when requested', () => {
  const normalized = normalizeAiRedrawModelConfig(
    {
      primaryProvider: 'aivene_image',
      fallbackProvider: 'openai_image',
      aiveneImageModel: 'gpt-image-1',
      openAiImageModel: 'gpt-image-1'
    },
    {}
  );

  assert.equal(normalized.aiveneImageModel, 'gpt-image-1');
  assert.equal(normalized.openAiImageModel, 'gpt-image-1');
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

test('sablon logo prompt requires an exact visual trace without OCR or font replacement', () => {
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

  assert.match(prompt, /Jiplak gambar referensi ini sepresisi mungkin dengan mempertahankan bentuk asli/);
  assert.match(prompt, /Pertahankan persis layout, posisi, jarak, sudut, proporsi, warna, ruang negatif, simbol, lengkungan, dan bentuk visual setiap huruf/);
  assert.match(prompt, /jangan gunakan OCR/);
  assert.match(prompt, /jangan mengenali atau mengganti font/);
  assert.match(prompt, /jangan mengetik ulang, dan jangan membuat ulang teks/);
  assert.match(prompt, /Jangan menyederhanakan, menata ulang, menafsirkan, menambah, atau menghapus elemen apa pun/);
  assert.match(prompt, /Perbaiki hanya blur, noise foto, gigi pixel, bagian patah, isian kotor, tepi bergerigi/);
  assert.match(prompt, /kontur luar yang penyok atau tidak rata akibat cacat/);
  assert.match(prompt, /tanpa mengubah asimetri yang disengaja pada swoosh, simbol, atau bentuk huruf/);
  assert.match(prompt, /Buat hasil seperti master logo digital baru yang bersih, tajam, rata, dan siap trace sablon/);
  assert.match(prompt, /Keep the background solid black/);
  assert.match(prompt, /Keep colors flat and solid/);
  assert.match(prompt, /The final image will be used for screen printing and vector tracing/);
  assert.match(prompt, /Avoid anti-aliasing whenever possible/);
  assert.doesNotMatch(prompt, /gambar ulang sangat mirip/);
  assert.doesNotMatch(prompt, /professional logo restoration and vector preparation artist/);
});

test('strict exact-trace instructions stay scoped to sablon logos', () => {
  const prompt = buildAiRedrawPrompt(
    {
      projectName: 'Logo Merchandise',
      productionType: 'merchandise'
    },
    { promptProfile: 'logo_photo_cleanup_short' }
  );

  assert.match(prompt, /Bersihkan logo ini dan gambar ulang sangat mirip dengan aslinya/);
  assert.doesNotMatch(prompt, /Jiplak gambar referensi ini sepresisi mungkin/);
  assert.doesNotMatch(prompt, /jangan gunakan OCR/);
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
