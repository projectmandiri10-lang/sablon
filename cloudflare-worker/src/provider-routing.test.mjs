import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inferHuggingFaceEndpointInfo, normalizeAiRedrawModelConfig, requestAiRetouchedImage, shouldFallbackFromGeminiError } from './index.js';

test('Gemini fallback policy allows quota and model unavailable by default', () => {
  assert.equal(
    shouldFallbackFromGeminiError({
      provider: 'gemini_direct_image',
      fallbackReason: 'quota_exhausted'
    }),
    true
  );
  assert.equal(
    shouldFallbackFromGeminiError({
      provider: 'gemini_direct_image',
      fallbackReason: 'model_unavailable'
    }),
    true
  );
});

test('Gemini fallback policy quota_only rejects generic model unavailable errors', () => {
  assert.equal(
    shouldFallbackFromGeminiError(
      {
        provider: 'gemini_direct_image',
        fallbackReason: 'model_unavailable'
      },
      'quota_only'
    ),
    false
  );
  assert.equal(
    shouldFallbackFromGeminiError(
      {
        provider: 'gemini_direct_image',
        fallbackReason: 'billing_required'
      },
      'quota_only'
    ),
    true
  );
});

test('Gemini fallback policy all accepts any Gemini upstream error', () => {
  assert.equal(
    shouldFallbackFromGeminiError(
      {
        provider: 'gemini_direct_image',
        fallbackReason: ''
      },
      'all'
    ),
    true
  );
});

test('Hugging Face endpoint metadata recognizes hf.space endpoints', () => {
  assert.deepEqual(inferHuggingFaceEndpointInfo('https://demo-space.hf.space/run/predict'), {
    hfEndpointType: 'space_proxy',
    hfSpaceId: 'demo-space',
    hfEndpointLogicalName: 'demo-space'
  });
});

test('Hugging Face pix2pix primary returns image bytes and metadata', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    assert.equal(String(input), 'https://demo-space.hf.space/run');
    return new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'Content-Type': 'image/png' }
    });
  };

  try {
    const image = new File([new Uint8Array([9, 9, 9])], 'trace.png', { type: 'image/png' });
    const env = {
      HF_PIX2PIX_ENDPOINT_URL: 'https://demo-space.hf.space/run',
      HF_TOKEN: 'hf_test'
    };
    const config = normalizeAiRedrawModelConfig(
      {
        primaryProvider: 'huggingface_pix2pix',
        fallbackProvider: 'openrouter_image'
      },
      env
    );

    const result = await requestAiRetouchedImage(env, image, { productionType: 'sablon' }, config);
    assert.equal(result.headers.get('Content-Type'), 'image/png');
    assert.equal(result.metadata.providerUsed, 'huggingface_pix2pix');
    assert.equal(result.metadata.hfEndpointType, 'space_proxy');
    assert.equal(result.metadata.hfSpaceId, 'demo-space');
    assert.equal(result.metadata.model, 'nunchaku-tech/nunchaku-flux.1-schnell-pix2pix-turbo');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Hugging Face pix2pix falls back to OpenRouter when primary times out', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url === 'https://demo-space.hf.space/run') {
      return new Response(JSON.stringify({ error: { message: 'upstream timeout' } }), {
        status: 504,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (url === 'https://openrouter.ai/api/v1/chat/completions') {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                images: [{ image_url: { url: 'https://cdn.example/output.png' } }]
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
    if (url === 'https://cdn.example/output.png') {
      return new Response(new Uint8Array([4, 5, 6]), {
        status: 200,
        headers: { 'Content-Type': 'image/png' }
      });
    }
    throw new Error(`Unexpected fetch ${url}`);
  };

  try {
    const image = new File([new Uint8Array([7, 8, 9])], 'trace.png', { type: 'image/png' });
    const env = {
      HF_PIX2PIX_ENDPOINT_URL: 'https://demo-space.hf.space/run',
      HF_TOKEN: 'hf_test',
      OPENROUTER_API_KEY: 'or_test',
      OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1'
    };
    const config = normalizeAiRedrawModelConfig(
      {
        primaryProvider: 'huggingface_pix2pix',
        fallbackProvider: 'openrouter_image'
      },
      env
    );

    const result = await requestAiRetouchedImage(env, image, { productionType: 'sablon' }, config);
    assert.equal(result.metadata.providerUsed, 'openrouter_image');
    assert.equal(result.metadata.fallbackAttempted, true);
    assert.equal(result.metadata.fallbackReason, 'timeout');
    assert.equal(calls[0], 'https://demo-space.hf.space/run');
    assert.equal(calls[1], 'https://openrouter.ai/api/v1/chat/completions');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('OpenRouter fallback is used immediately when HF endpoint is not configured', async () => {
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
                images: [{ image_url: { url: 'https://cdn.example/direct-fallback.png' } }]
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
    if (url === 'https://cdn.example/direct-fallback.png') {
      return new Response(new Uint8Array([2, 2, 2]), {
        status: 200,
        headers: { 'Content-Type': 'image/png' }
      });
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
        primaryProvider: 'huggingface_pix2pix',
        fallbackProvider: 'openrouter_image'
      },
      env
    );

    const result = await requestAiRetouchedImage(env, image, { productionType: 'sablon' }, config);
    assert.equal(result.metadata.providerUsed, 'openrouter_image');
    assert.equal(result.metadata.fallbackAttempted, true);
    assert.equal(result.metadata.fallbackReason, 'primary_not_configured');
    assert.deepEqual(calls, ['https://openrouter.ai/api/v1/chat/completions', 'https://cdn.example/direct-fallback.png']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
