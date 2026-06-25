import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shouldFallbackFromGeminiError } from './index.js';

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
