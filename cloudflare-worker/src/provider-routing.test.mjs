import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeAiRedrawModelConfig, requestAiRetouchedImage, shouldFallbackFromLiteLlmError } from './index.js';

test('LiteLLM fallback policy accepts quota, model unavailable, and upstream unavailable errors', () => {
  assert.equal(
    shouldFallbackFromLiteLlmError({
      provider: 'litellm_image',
      fallbackReason: 'quota_exhausted'
    }),
    true
  );
  assert.equal(
    shouldFallbackFromLiteLlmError({
      provider: 'litellm_image',
      fallbackReason: 'model_unavailable'
    }),
    true
  );
  assert.equal(
    shouldFallbackFromLiteLlmError({
      provider: 'litellm_image',
      fallbackReason: 'upstream_unavailable'
    }),
    true
  );
});

test('LiteLLM primary returns image bytes and metadata', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === 'https://litellm.example.com/v1/chat/completions') {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: [
                  {
                    type: 'image_url',
                    image_url: {
                      url: 'https://cdn.example/litellm-output.png'
                    }
                  }
                ]
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
    if (url === 'https://cdn.example/litellm-output.png') {
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'Content-Type': 'image/png' }
      });
    }
    throw new Error(`Unexpected fetch ${url}`);
  };

  try {
    const image = new File([new Uint8Array([9, 9, 9])], 'trace.png', { type: 'image/png' });
    const env = {
      LITELLM_API_KEY: 'litellm_test',
      LITELLM_BASE_URL: 'https://litellm.example.com/v1'
    };
    const config = normalizeAiRedrawModelConfig(
      {
        primaryProvider: 'litellm_image',
        fallbackProvider: 'openrouter_image'
      },
      env
    );

    const result = await requestAiRetouchedImage(env, image, { productionType: 'sablon' }, config);
    assert.equal(result.headers.get('Content-Type'), 'image/png');
    assert.equal(result.metadata.providerUsed, 'litellm_image');
    assert.equal(result.metadata.model, 'gemini-3.1-flash-image-preview');
    assert.match(result.metadata.finalTechnicalPrompt, /screen-print friendly shapes/);
    assert.equal(result.metadata.safetyEnabled, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('LiteLLM falls back to OpenRouter when primary model is unavailable', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url === 'https://litellm.example.com/v1/chat/completions') {
      return new Response(JSON.stringify({ error: { message: 'unsupported model' } }), {
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
      LITELLM_API_KEY: 'litellm_test',
      LITELLM_BASE_URL: 'https://litellm.example.com/v1',
      OPENROUTER_API_KEY: 'or_test',
      OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1'
    };
    const config = normalizeAiRedrawModelConfig(
      {
        primaryProvider: 'litellm_image',
        fallbackProvider: 'openrouter_image'
      },
      env
    );

    const result = await requestAiRetouchedImage(env, image, { productionType: 'sablon' }, config);
    assert.equal(result.metadata.providerUsed, 'openrouter_image');
    assert.equal(result.metadata.fallbackAttempted, true);
    assert.equal(result.metadata.fallbackReason, 'model_unavailable');
    assert.equal(calls[0], 'https://litellm.example.com/v1/chat/completions');
    assert.equal(calls[1], 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal(calls[2], 'https://cdn.example/openrouter-output.png');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('LiteLLM falls back to OpenRouter on upstream network failure', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url === 'https://litellm.example.com/v1/chat/completions') {
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
      LITELLM_API_KEY: 'litellm_test',
      LITELLM_BASE_URL: 'https://litellm.example.com/v1',
      OPENROUTER_API_KEY: 'or_test',
      OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1'
    };
    const config = normalizeAiRedrawModelConfig(
      {
        primaryProvider: 'litellm_image',
        fallbackProvider: 'openrouter_image'
      },
      env
    );

    const result = await requestAiRetouchedImage(env, image, { productionType: 'sablon' }, config);
    assert.equal(result.metadata.providerUsed, 'openrouter_image');
    assert.equal(result.metadata.fallbackAttempted, true);
    assert.equal(result.metadata.fallbackReason, 'upstream_unavailable');
    assert.deepEqual(calls, ['https://litellm.example.com/v1/chat/completions', 'https://openrouter.ai/api/v1/chat/completions']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('OpenRouter fallback is used immediately when LiteLLM is not configured', async () => {
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
        primaryProvider: 'litellm_image',
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
