import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeAiRedrawModelConfig, requestAiRetouchedImage, shouldFallbackFromAiveneError } from './index.js';

test('AIVene fallback policy accepts quota, model unavailable, and upstream unavailable errors', () => {
  assert.equal(
    shouldFallbackFromAiveneError({
      provider: 'aivene_image',
      fallbackReason: 'quota_exhausted'
    }),
    true
  );
  assert.equal(
    shouldFallbackFromAiveneError({
      provider: 'aivene_image',
      fallbackReason: 'model_unavailable'
    }),
    true
  );
  assert.equal(
    shouldFallbackFromAiveneError({
      provider: 'aivene_image',
      fallbackReason: 'upstream_unavailable'
    }),
    true
  );
  assert.equal(
    shouldFallbackFromAiveneError({
      provider: 'aivene_image',
      fallbackReason: ''
    }),
    false
  );
});

test('AIVene primary returns image bytes and metadata', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url === 'https://api.aivene.com/v1/images/edits') {
      const form = init.body;
      assert.equal(form.get('model'), 'gpt-image-1.5');
      assert.ok(form.get('image[]') instanceof File);
      assert.equal(form.get('size'), '1536x1024');
      assert.equal(form.get('quality'), 'medium');
      assert.equal(form.get('input_fidelity'), 'low');
      assert.equal(form.get('output_format'), 'png');
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
      AIVENE_API_KEY: 'aivene_test'
    };
    const config = normalizeAiRedrawModelConfig(
      {
        primaryProvider: 'aivene_image',
        fallbackProvider: 'openai_image'
      },
      env
    );

    const result = await requestAiRetouchedImage(
      env,
      image,
      {
        productionType: 'sablon',
        aiInput: {
          sourceDimensions: { width: 4000, height: 2000 },
          sourceBytes: 12000000,
          preparedDimensions: { width: 1080, height: 540 }
        }
      },
      config
    );
    assert.equal(result.headers.get('Content-Type'), 'image/png');
    assert.equal(result.metadata.providerUsed, 'aivene_image');
    assert.equal(result.metadata.model, 'gpt-image-1.5');
    assert.equal(result.metadata.aiveneImageModel, 'gpt-image-1.5');
    assert.equal(result.metadata.openAiImageModel, 'gpt-image-1.5');
    assert.equal(result.metadata.inputFidelity, 'low');
    assert.equal(result.metadata.imageSize, '1536x1024');
    assert.deepEqual(result.metadata.sourceDimensions, { width: 4000, height: 2000 });
    assert.deepEqual(result.metadata.preparedDimensions, { width: 1080, height: 540 });
    assert.equal(result.metadata.sourceBytes, 12000000);
    assert.equal(result.metadata.preparedBytes, 3);
    assert.equal(result.metadata.outputFormat, 'png');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('AIVene falls back to OpenAI when primary model is unavailable', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url === 'https://api.aivene.com/v1/images/edits') {
      return new Response(JSON.stringify({ error: { message: 'unknown model' } }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (url === 'https://api.openai.com/v1/images/edits') {
      return new Response(
        JSON.stringify({
          data: [{ b64_json: 'AQID', revised_prompt: 'openai fallback prompt' }]
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
    const image = new File([new Uint8Array([7, 8, 9])], 'trace.png', { type: 'image/png' });
    const env = {
      AIVENE_API_KEY: 'aivene_test',
      OPENAI_API_KEY: 'openai_test'
    };
    const config = normalizeAiRedrawModelConfig(
      {
        primaryProvider: 'aivene_image',
        fallbackProvider: 'openai_image'
      },
      env
    );

    const result = await requestAiRetouchedImage(env, image, { productionType: 'sablon' }, config);
    assert.equal(result.metadata.providerUsed, 'openai_image');
    assert.equal(result.metadata.fallbackAttempted, true);
    assert.equal(result.metadata.fallbackReason, 'model_unavailable');
    assert.deepEqual(calls, ['https://api.aivene.com/v1/images/edits', 'https://api.openai.com/v1/images/edits']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('AIVene fallback reuses the same prepared 1080px image', async () => {
  const originalFetch = globalThis.fetch;
  const uploadedImages = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const uploaded = init.body.get('image[]');
    uploadedImages.push({ name: uploaded.name, size: uploaded.size, type: uploaded.type });
    if (url.includes('api.aivene.com')) {
      return new Response(JSON.stringify({ error: { message: 'unknown model' } }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({ data: [{ b64_json: 'AQID' }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  try {
    const image = new File([new Uint8Array([1, 2, 3, 4])], 'ai-redraw-input.webp', { type: 'image/webp' });
    const env = { AIVENE_API_KEY: 'aivene_test', OPENAI_API_KEY: 'openai_test' };
    const config = normalizeAiRedrawModelConfig({ primaryProvider: 'aivene_image', fallbackProvider: 'openai_image' }, env);
    await requestAiRetouchedImage(env, image, {
      aiInput: { preparedDimensions: { width: 1080, height: 720 } }
    }, config);
    assert.deepEqual(uploadedImages, [
      { name: 'ai-redraw-input.webp', size: 4, type: 'image/webp' },
      { name: 'ai-redraw-input.webp', size: 4, type: 'image/webp' }
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('AIVene falls back to OpenAI on upstream network failure', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url === 'https://api.aivene.com/v1/images/edits') {
      throw new Error('connect timeout');
    }
    if (url === 'https://api.openai.com/v1/images/edits') {
      return new Response(
        JSON.stringify({
          data: [{ b64_json: 'AQID' }]
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
      AIVENE_API_KEY: 'aivene_test',
      OPENAI_API_KEY: 'openai_test'
    };
    const config = normalizeAiRedrawModelConfig(
      {
        primaryProvider: 'aivene_image',
        fallbackProvider: 'openai_image'
      },
      env
    );

    const result = await requestAiRetouchedImage(env, image, { productionType: 'sablon' }, config);
    assert.equal(result.metadata.providerUsed, 'openai_image');
    assert.equal(result.metadata.fallbackAttempted, true);
    assert.equal(result.metadata.fallbackReason, 'upstream_unavailable');
    assert.deepEqual(calls, ['https://api.aivene.com/v1/images/edits', 'https://api.openai.com/v1/images/edits']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('AIVene Body already used error falls back once without leaking the gateway message', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url === 'https://api.aivene.com/v1/images/edits') {
      return new Response(JSON.stringify({ error: { message: 'Body already used' } }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (url === 'https://api.openai.com/v1/images/edits') {
      return new Response(JSON.stringify({ data: [{ b64_json: 'AQID' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    throw new Error(`Unexpected fetch ${url}`);
  };

  try {
    const image = new File([new Uint8Array([1, 2, 3])], 'trace.png', { type: 'image/png' });
    const env = { AIVENE_API_KEY: 'aivene_test', OPENAI_API_KEY: 'openai_test' };
    const config = normalizeAiRedrawModelConfig(
      { primaryProvider: 'aivene_image', fallbackProvider: 'openai_image' },
      env
    );

    const result = await requestAiRetouchedImage(env, image, { productionType: 'sablon' }, config);
    assert.equal(result.metadata.providerUsed, 'openai_image');
    assert.equal(result.metadata.fallbackAttempted, true);
    assert.equal(result.metadata.fallbackReason, 'upstream_unavailable');
    assert.deepEqual(calls, ['https://api.aivene.com/v1/images/edits', 'https://api.openai.com/v1/images/edits']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('AIVene Body already used plus failed OpenAI fallback returns a clear combined error', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url === 'https://api.aivene.com/v1/images/edits') {
      return new Response(JSON.stringify({ error: { message: 'Body already used' } }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (url === 'https://api.openai.com/v1/images/edits') {
      return new Response(JSON.stringify({ error: { message: 'Billing hard limit reached' } }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    throw new Error(`Unexpected fetch ${url}`);
  };

  try {
    const image = new File([new Uint8Array([1, 2, 3])], 'trace.png', { type: 'image/png' });
    const env = { AIVENE_API_KEY: 'aivene_test', OPENAI_API_KEY: 'openai_test' };
    const config = normalizeAiRedrawModelConfig(
      { primaryProvider: 'aivene_image', fallbackProvider: 'openai_image' },
      env
    );

    await assert.rejects(
      () => requestAiRetouchedImage(env, image, { productionType: 'sablon' }, config),
      (error) => {
        assert.match(error.message, /AIVene gagal memproses image edit/);
        assert.match(error.message, /OpenAI fallback juga gagal/);
        assert.match(error.message, /Billing hard limit reached/);
        assert.doesNotMatch(error.message, /Body already used/i);
        return true;
      }
    );
    assert.deepEqual(calls, ['https://api.aivene.com/v1/images/edits', 'https://api.openai.com/v1/images/edits']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('AIVene validation errors do not fall back to OpenAI', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url === 'https://api.aivene.com/v1/images/edits') {
      return new Response(JSON.stringify({ error: { message: 'Invalid image input.' } }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (url === 'https://api.openai.com/v1/images/edits') {
      throw new Error('Fallback should not be called');
    }
    throw new Error(`Unexpected fetch ${url}`);
  };

  try {
    const image = new File([new Uint8Array([1, 1, 1])], 'trace.png', { type: 'image/png' });
    const env = {
      AIVENE_API_KEY: 'aivene_test',
      OPENAI_API_KEY: 'openai_test'
    };
    const config = normalizeAiRedrawModelConfig(
      {
        primaryProvider: 'aivene_image',
        fallbackProvider: 'openai_image'
      },
      env
    );

    await assert.rejects(
      () => requestAiRetouchedImage(env, image, { productionType: 'sablon' }, config),
      (error) => {
        assert.equal(error.provider, 'aivene_image');
        assert.equal(error.fallbackReason, '');
        return true;
      }
    );
    assert.deepEqual(calls, ['https://api.aivene.com/v1/images/edits']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('OpenAI fallback is used immediately when AIVene is not configured', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url === 'https://api.openai.com/v1/images/edits') {
      return new Response(
        JSON.stringify({
          data: [{ b64_json: 'AgIC' }]
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
      OPENAI_API_KEY: 'openai_test'
    };
    const config = normalizeAiRedrawModelConfig(
      {
        primaryProvider: 'aivene_image',
        fallbackProvider: 'openai_image'
      },
      env
    );

    const result = await requestAiRetouchedImage(env, image, { productionType: 'sablon' }, config);
    assert.equal(result.metadata.providerUsed, 'openai_image');
    assert.equal(result.metadata.fallbackAttempted, true);
    assert.equal(result.metadata.fallbackReason, 'primary_not_configured');
    assert.deepEqual(calls, ['https://api.openai.com/v1/images/edits']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
