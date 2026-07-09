import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeAiRedrawModelConfig, requestAiRetouchedImage, shouldFallbackFromOpenAiError } from './index.js';

test('OpenAI fallback policy accepts quota, model unavailable, and upstream unavailable errors', () => {
  assert.equal(
    shouldFallbackFromOpenAiError({
      provider: 'openai_image',
      fallbackReason: 'quota_exhausted'
    }),
    true
  );
  assert.equal(
    shouldFallbackFromOpenAiError({
      provider: 'openai_image',
      fallbackReason: 'model_unavailable'
    }),
    true
  );
  assert.equal(
    shouldFallbackFromOpenAiError({
      provider: 'openai_image',
      fallbackReason: 'upstream_unavailable'
    }),
    true
  );
  assert.equal(
    shouldFallbackFromOpenAiError({
      provider: 'openai_image',
      fallbackReason: ''
    }),
    false
  );
});

test('OpenAI primary returns image bytes and metadata', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url === 'https://api.openai.com/v1/images/edits') {
      const form = init.body;
      assert.equal(form.get('model'), 'gpt-image-1.5');
      assert.ok(form.get('image[]') instanceof File);
      assert.equal(form.get('size'), 'auto');
      assert.equal(form.get('quality'), 'high');
      assert.equal(form.get('input_fidelity'), 'high');
      assert.equal(form.get('output_format'), 'png');
      assert.match(String(form.get('prompt')), /Bersihkan logo ini dan gambar ulang sangat mirip dengan aslinya/);
      return new Response(
        JSON.stringify({
          data: [{ b64_json: 'AQID', revised_prompt: 'cleaned prompt' }]
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    throw new Error(`Unexpected fetch ${url}`);
  };

  try {
    const image = new File([new Uint8Array([9, 9, 9])], 'trace.png', { type: 'image/png' });
    const env = {
      OPENAI_API_KEY: 'openai_test'
    };
    const config = normalizeAiRedrawModelConfig(
      {
        primaryProvider: 'openai_image',
        fallbackProvider: 'openrouter_image'
      },
      env
    );

    const result = await requestAiRetouchedImage(env, image, { productionType: 'sablon' }, config);
    assert.equal(result.headers.get('Content-Type'), 'image/png');
    assert.equal(result.metadata.providerUsed, 'openai_image');
    assert.equal(result.metadata.model, 'gpt-image-1.5');
    assert.equal(result.metadata.openAiImageModel, 'gpt-image-1.5');
    assert.equal(result.metadata.inputFidelity, 'high');
    assert.equal(result.metadata.outputFormat, 'png');
    assert.equal('liteLlmImageModel' in result.metadata, false);
    assert.match(result.metadata.finalTechnicalPrompt, /Bersihkan logo ini dan gambar ulang sangat mirip dengan aslinya/);
    assert.equal(result.metadata.safetyEnabled, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('OpenAI falls back to OpenRouter when primary model is unavailable', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url === 'https://api.openai.com/v1/images/edits') {
      return new Response(JSON.stringify({ error: { message: 'unknown model' } }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (url === 'https://openrouter.ai/api/v1/chat/completions') {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                images: [{ image_url: { url: 'https://cdn.example/openrouter-output.png' } }]
              }
            }
          ]
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    if (url === 'https://cdn.example/openrouter-output.png') {
      return new Response(new Uint8Array([7, 8, 9]), {
        status: 200,
        headers: { 'Content-Type': 'image/png' }
      });
    }
    throw new Error(`Unexpected fetch ${url}`);
  };

  try {
    const image = new File([new Uint8Array([7, 8, 9])], 'trace.png', { type: 'image/png' });
    const env = {
      OPENAI_API_KEY: 'openai_test',
      OPENROUTER_API_KEY: 'or_test',
      OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1'
    };
    const config = normalizeAiRedrawModelConfig(
      {
        primaryProvider: 'openai_image',
        fallbackProvider: 'openrouter_image'
      },
      env
    );

    const result = await requestAiRetouchedImage(env, image, { productionType: 'sablon' }, config);
    assert.equal(result.metadata.providerUsed, 'openrouter_image');
    assert.equal(result.metadata.fallbackAttempted, true);
    assert.equal(result.metadata.fallbackReason, 'model_unavailable');
    assert.equal(calls[0], 'https://api.openai.com/v1/images/edits');
    assert.equal(calls[1], 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal(calls[2], 'https://cdn.example/openrouter-output.png');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('OpenAI falls back to OpenRouter on upstream network failure', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url === 'https://api.openai.com/v1/images/edits') {
      throw new Error('connect timeout');
    }
    if (url === 'https://openrouter.ai/api/v1/chat/completions') {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                images: [{ image_url: { url: 'data:image/png;base64,AQID' } }]
              }
            }
          ]
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    throw new Error(`Unexpected fetch ${url}`);
  };

  try {
    const image = new File([new Uint8Array([1, 1, 1])], 'trace.png', { type: 'image/png' });
    const env = {
      OPENAI_API_KEY: 'openai_test',
      OPENROUTER_API_KEY: 'or_test',
      OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1'
    };
    const config = normalizeAiRedrawModelConfig(
      {
        primaryProvider: 'openai_image',
        fallbackProvider: 'openrouter_image'
      },
      env
    );

    const result = await requestAiRetouchedImage(env, image, { productionType: 'sablon' }, config);
    assert.equal(result.metadata.providerUsed, 'openrouter_image');
    assert.equal(result.metadata.fallbackAttempted, true);
    assert.equal(result.metadata.fallbackReason, 'upstream_unavailable');
    assert.deepEqual(calls, ['https://api.openai.com/v1/images/edits', 'https://openrouter.ai/api/v1/chat/completions']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('OpenAI validation errors do not fall back to OpenRouter', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url === 'https://api.openai.com/v1/images/edits') {
      return new Response(JSON.stringify({ error: { message: 'Invalid image input.' } }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (url === 'https://openrouter.ai/api/v1/chat/completions') {
      throw new Error('Fallback should not be called');
    }
    throw new Error(`Unexpected fetch ${url}`);
  };

  try {
    const image = new File([new Uint8Array([1, 1, 1])], 'trace.png', { type: 'image/png' });
    const env = {
      OPENAI_API_KEY: 'openai_test',
      OPENROUTER_API_KEY: 'or_test',
      OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1'
    };
    const config = normalizeAiRedrawModelConfig(
      {
        primaryProvider: 'openai_image',
        fallbackProvider: 'openrouter_image'
      },
      env
    );

    await assert.rejects(
      () => requestAiRetouchedImage(env, image, { productionType: 'sablon' }, config),
      (error) => {
        assert.equal(error.provider, 'openai_image');
        assert.equal(error.fallbackReason, '');
        return true;
      }
    );
    assert.deepEqual(calls, ['https://api.openai.com/v1/images/edits']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('OpenRouter fallback is used immediately when OpenAI is not configured', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url === 'https://openrouter.ai/api/v1/chat/completions') {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                images: [{ image_url: { url: 'data:image/png;base64,AgIC' } }]
              }
            }
          ]
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    throw new Error(`Unexpected fetch ${url}`);
  };

  try {
    const image = new File([new Uint8Array([1, 1, 1])], 'trace.png', { type: 'image/png' });
    const env = {
      OPENROUTER_API_KEY: 'or_test',
      OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1'
    };
    const config = normalizeAiRedrawModelConfig(
      {
        primaryProvider: 'openai_image',
        fallbackProvider: 'openrouter_image'
      },
      env
    );

    const result = await requestAiRetouchedImage(env, image, { productionType: 'sablon' }, config);
    assert.equal(result.metadata.providerUsed, 'openrouter_image');
    assert.equal(result.metadata.fallbackAttempted, true);
    assert.equal(result.metadata.fallbackReason, 'primary_not_configured');
    assert.deepEqual(calls, ['https://openrouter.ai/api/v1/chat/completions']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
