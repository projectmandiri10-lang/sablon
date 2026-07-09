import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker, { getViewerCountryCode, getViewerDefaultLocale, hashSignupBonusIdentifier, shouldGrantSignupBonus } from './index.js';

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

test('signup bonus endpoint stays disabled without granting any credit', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes('/auth/v1/user')) {
      return new Response(
        JSON.stringify({
          id: 'user-1',
          email: 'buyer@example.com',
          user_metadata: {}
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    if (url.includes('/rest/v1/profiles')) {
      return new Response(
        JSON.stringify([
          {
            id: 'user-1',
            email: 'buyer@example.com',
            role: 'user',
            is_unlimited: false,
            is_active: true,
            deleted_at: null,
            created_at: '2026-07-09T00:00:00.000Z'
          }
        ]),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      );
    }

    throw new Error(`Unexpected fetch url in test: ${url}`);
  };

  try {
    const response = await worker.fetch(
      new Request('https://example.com/api/auth/signup-bonus', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-1',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ deviceId: 'device-1' })
      }),
      {
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'service-role-key'
      }
    );

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.deepEqual(payload, {
      active: false,
      granted: false,
      alreadyProcessed: true,
      amountIdr: 0,
      reason: 'disabled',
      remainingEligibleByDeviceOrIp: 0
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
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
