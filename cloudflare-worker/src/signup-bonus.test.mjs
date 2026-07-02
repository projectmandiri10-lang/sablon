import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getViewerCountryCode, getViewerDefaultLocale, hashSignupBonusIdentifier, shouldGrantSignupBonus } from './index.js';

test('signup bonus hashing is deterministic and salt-based', async () => {
  const env = { SIGNUP_BONUS_HASH_SALT: 'salt-123' };
  const first = await hashSignupBonusIdentifier(env, 'device-1');
  const second = await hashSignupBonusIdentifier(env, 'device-1');
  const third = await hashSignupBonusIdentifier(env, 'device-2');

  assert.equal(first, second);
  assert.notEqual(first, third);
  assert.match(first, /^[a-f0-9]{64}$/);
});

test('signup bonus limit allows first two matching claims and blocks the third', () => {
  assert.equal(shouldGrantSignupBonus({ deviceGrantedClaims: 0, ipGrantedClaims: 0 }), true);
  assert.equal(shouldGrantSignupBonus({ deviceGrantedClaims: 1, ipGrantedClaims: 1 }), true);
  assert.equal(shouldGrantSignupBonus({ deviceGrantedClaims: 2, ipGrantedClaims: 1 }), false);
  assert.equal(shouldGrantSignupBonus({ deviceGrantedClaims: 1, ipGrantedClaims: 2 }), false);
});

test('viewer locale hint defaults to Indonesian for Indonesian traffic', () => {
  const request = new Request('https://example.com/api/app-config', {
    headers: {
      'cf-ipcountry': 'ID'
    }
  });

  assert.equal(getViewerCountryCode(request), 'ID');
  assert.equal(getViewerDefaultLocale(request), 'id');
});
