import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveInitialLocale } from './locale.js';

test('locale resolver prefers explicit stored locale over all other hints', () => {
  const locale = resolveInitialLocale({
    storedLocale: 'en',
    viewerDefaultLocale: 'id',
    browserLanguage: 'id-ID'
  });

  assert.equal(locale, 'en');
});

test('locale resolver uses viewer locale before browser locale', () => {
  const locale = resolveInitialLocale({
    storedLocale: '',
    viewerDefaultLocale: 'id',
    browserLanguage: 'en-US'
  });

  assert.equal(locale, 'id');
});

test('locale resolver falls back to English when nothing else is available', () => {
  assert.equal(resolveInitialLocale({ storedLocale: '', viewerDefaultLocale: '', browserLanguage: '' }), 'en');
});
