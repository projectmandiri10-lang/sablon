import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from './index.js';
import {
  buildGoogleAuthStart,
  generateSaltHex,
  hashPasswordHex,
  signAccessToken,
  verifyAccessToken,
  verifyGoogleState,
  verifyPasswordHash
} from './auth.js';
import { creditBalance, getAuthProfileByEmail, getSessionByTokenHash } from './db.js';
import { authHeaderFor, createTestEnv, createTestUser } from './test-helpers.mjs';

function authRequest(path, body) {
  return new Request(`https://worker.example${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
}

test('password hashing is salted and verification rejects wrong passwords', async () => {
  const salt = generateSaltHex();
  const hash = await hashPasswordHex('rahasia123', salt);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.equal(await verifyPasswordHash('rahasia123', salt, hash), true);
  assert.equal(await verifyPasswordHash('salah', salt, hash), false);
  assert.notEqual(await hashPasswordHex('rahasia123', generateSaltHex()), hash);
});

test('access JWT roundtrip verifies signature and expiry', async () => {
  const env = createTestEnv();
  const token = await signAccessToken(env, { id: 'user-1', email: 'user@example.com' });
  const payload = await verifyAccessToken(env, token);
  assert.equal(payload.sub, 'user-1');
  assert.equal(payload.email, 'user@example.com');

  assert.equal(await verifyAccessToken(env, `${token}x`), null);
  assert.equal(await verifyAccessToken({ ...env, AUTH_JWT_SECRET: 'other-secret' }, token), null);

  const originalDateNow = Date.now;
  Date.now = () => originalDateNow() + 16 * 60 * 1000;
  try {
    assert.equal(await verifyAccessToken(env, token), null);
  } finally {
    Date.now = originalDateNow;
  }
});

test('signup creates profile, grants Rp5000 bonus, and returns a full session', async () => {
  const env = createTestEnv();
  const response = await worker.fetch(
    authRequest('/api/auth/signup', { email: 'New.User@Example.com', password: 'rahasia123', fullName: 'New User', deviceId: 'device-1' }),
    env
  );
  const data = await response.json();

  assert.equal(response.status, 200);
  assert.ok(data.access_token);
  assert.ok(data.refresh_token);
  assert.equal(data.token_type, 'bearer');
  assert.equal(data.expires_in, 900);
  assert.ok(data.expires_at > Math.floor(Date.now() / 1000));
  assert.equal(data.user.email, 'new.user@example.com');

  const profile = await getAuthProfileByEmail(env, 'new.user@example.com');
  assert.equal(profile.id, data.user.id);
  assert.equal(profile.auth_provider, 'password');
  assert.ok(profile.password_hash);
  assert.equal(await creditBalance(env, profile.id), 5000);

  const claims = await verifyAccessToken(env, data.access_token);
  assert.equal(claims.sub, profile.id);
});

test('signup rejects duplicate email and short password', async () => {
  const env = createTestEnv();
  await createTestUser(env, { id: 'user-1', email: 'taken@example.com' });

  const duplicate = await worker.fetch(authRequest('/api/auth/signup', { email: 'taken@example.com', password: 'rahasia123' }), env);
  assert.equal(duplicate.status, 400);
  assert.equal((await duplicate.json()).error, 'Email sudah terdaftar. Silakan login.');

  const shortPassword = await worker.fetch(authRequest('/api/auth/signup', { email: 'baru@example.com', password: '123' }), env);
  assert.equal(shortPassword.status, 400);
  assert.equal((await shortPassword.json()).error, 'Password minimal 6 karakter.');
});

test('signup seeds superuser role for the protected admin email', async () => {
  const env = createTestEnv();
  const response = await worker.fetch(authRequest('/api/auth/signup', { email: 'jho.j80@gmail.com', password: 'rahasia123' }), env);
  const data = await response.json();

  assert.equal(response.status, 200);
  const profile = await getAuthProfileByEmail(env, 'jho.j80@gmail.com');
  assert.equal(profile.role, 'superuser');
  assert.equal(profile.is_unlimited, true);
  assert.equal(data.user.id, profile.id);
});

test('login verifies password and rejects wrong credentials or google-only accounts', async () => {
  const env = createTestEnv();
  await worker.fetch(authRequest('/api/auth/signup', { email: 'buyer@example.com', password: 'rahasia123' }), env);

  const ok = await worker.fetch(authRequest('/api/auth/login', { email: 'buyer@example.com', password: 'rahasia123' }), env);
  const okData = await ok.json();
  assert.equal(ok.status, 200);
  assert.ok(okData.access_token);
  assert.ok(okData.refresh_token);

  const wrong = await worker.fetch(authRequest('/api/auth/login', { email: 'buyer@example.com', password: 'salah-total' }), env);
  assert.equal(wrong.status, 400);
  assert.equal((await wrong.json()).error, 'Email atau password salah.');

  const unknown = await worker.fetch(authRequest('/api/auth/login', { email: 'ghost@example.com', password: 'rahasia123' }), env);
  assert.equal(unknown.status, 400);
  assert.equal((await unknown.json()).error, 'Email atau password salah.');

  await createTestUser(env, { id: 'google-1', email: 'google@example.com', authProvider: 'google' });
  const googleOnly = await worker.fetch(authRequest('/api/auth/login', { email: 'google@example.com', password: 'rahasia123' }), env);
  assert.equal(googleOnly.status, 400);
  assert.equal((await googleOnly.json()).error, 'Akun ini terdaftar melalui Google. Silakan login dengan Google.');
});

test('refresh rotates the session and logout revokes it', async () => {
  const env = createTestEnv();
  const signup = await worker.fetch(authRequest('/api/auth/signup', { email: 'rotate@example.com', password: 'rahasia123' }), env);
  const session = await signup.json();

  const refreshed = await worker.fetch(authRequest('/api/auth/refresh', { refresh_token: session.refresh_token }), env);
  const nextSession = await refreshed.json();
  assert.equal(refreshed.status, 200);
  assert.ok(nextSession.access_token);
  assert.notEqual(nextSession.refresh_token, session.refresh_token);
  assert.equal(nextSession.user.id, session.user.id);

  const reuseOld = await worker.fetch(authRequest('/api/auth/refresh', { refresh_token: session.refresh_token }), env);
  assert.equal(reuseOld.status, 400);
  assert.equal((await reuseOld.json()).error, 'Session tidak valid. Silakan login ulang.');

  const logout = await worker.fetch(authRequest('/api/auth/logout', { refresh_token: nextSession.refresh_token }), env);
  assert.equal(logout.status, 200);
  assert.deepEqual(await logout.json(), { success: true });

  const afterLogout = await worker.fetch(authRequest('/api/auth/refresh', { refresh_token: nextSession.refresh_token }), env);
  assert.equal(afterLogout.status, 400);
});

test('refresh token is stored hashed, never in plain text', async () => {
  const env = createTestEnv();
  const signup = await worker.fetch(authRequest('/api/auth/signup', { email: 'hash@example.com', password: 'rahasia123' }), env);
  const session = await signup.json();

  const rows = env.DB.sqlite.prepare('SELECT token_hash FROM sessions').all();
  assert.equal(rows.length, 1);
  assert.notEqual(rows[0].token_hash, session.refresh_token);
  assert.match(rows[0].token_hash, /^[a-f0-9]{64}$/);
  assert.ok(await getSessionByTokenHash(env, rows[0].token_hash));
});

test('protected endpoint accepts worker JWT and rejects tampered tokens', async () => {
  const env = createTestEnv();
  const profile = await createTestUser(env, { id: 'user-1', email: 'user@example.com' });

  const ok = await worker.fetch(new Request('https://worker.example/api/me/balance', { headers: await authHeaderFor(env, profile) }), env);
  assert.equal(ok.status, 200);
  const okData = await ok.json();
  assert.equal(okData.balance, 0);

  const tampered = await worker.fetch(
    new Request('https://worker.example/api/me/balance', { headers: { Authorization: 'Bearer token-palsu' } }),
    env
  );
  assert.equal(tampered.status, 400);
});

test('google auth start redirects to Google consent with signed state', async () => {
  const env = createTestEnv({ GOOGLE_OAUTH_CLIENT_ID: 'client-id-test' });
  const response = await worker.fetch(new Request('https://worker.example/api/auth/google'), env);

  assert.equal(response.status, 302);
  const location = new URL(response.headers.get('location'));
  assert.equal(location.origin, 'https://accounts.google.com');
  assert.equal(location.searchParams.get('client_id'), 'client-id-test');
  assert.equal(location.searchParams.get('redirect_uri'), 'https://worker.example/api/auth/google/callback');
  assert.equal(location.searchParams.get('scope'), 'openid email profile');
  const statePayload = await verifyGoogleState(env, location.searchParams.get('state'));
  assert.equal(statePayload.purpose, 'google_oauth');

  const { state } = await buildGoogleAuthStart(env);
  assert.equal((await verifyGoogleState(env, state)).purpose, 'google_oauth');
  assert.equal(await verifyGoogleState(env, 'state-palsu'), null);
});

test('google callback creates profile and redirects with implicit-flow session hash', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ access_token: 'google-access', token_type: 'Bearer' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (url === 'https://openidconnect.googleapis.com/v1/userinfo') {
      return new Response(JSON.stringify({ sub: 'google-sub-1', email: 'google.user@example.com', name: 'Google User' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    throw new Error(`Unexpected fetch ${url}`);
  };

  try {
    const env = createTestEnv({ GOOGLE_OAUTH_CLIENT_ID: 'client-id-test', GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret-test' });
    const start = await worker.fetch(new Request('https://worker.example/api/auth/google'), env);
    const state = new URL(start.headers.get('location')).searchParams.get('state');

    const callback = await worker.fetch(new Request(`https://worker.example/api/auth/google/callback?code=code-1&state=${encodeURIComponent(state)}`), env);
    assert.equal(callback.status, 302);
    const location = callback.headers.get('location');
    assert.ok(location.startsWith('https://frontend.example/#access_token='));
    const hashParams = new URLSearchParams(location.split('#')[1]);
    assert.ok(hashParams.get('access_token'));
    assert.ok(hashParams.get('refresh_token'));
    assert.equal(hashParams.get('token_type'), 'bearer');

    const profile = await getAuthProfileByEmail(env, 'google.user@example.com');
    assert.equal(profile.auth_provider, 'google');
    assert.equal(profile.password_hash, null);
    assert.equal(await creditBalance(env, profile.id), 5000);

    const claims = await verifyAccessToken(env, hashParams.get('access_token'));
    assert.equal(claims.sub, profile.id);

    // Login Google kedua harus upsert, bukan membuat profil duplikat.
    const startAgain = await worker.fetch(new Request('https://worker.example/api/auth/google'), env);
    const stateAgain = new URL(startAgain.headers.get('location')).searchParams.get('state');
    const callbackAgain = await worker.fetch(new Request(`https://worker.example/api/auth/google/callback?code=code-2&state=${encodeURIComponent(stateAgain)}`), env);
    assert.equal(callbackAgain.status, 302);
    const profiles = env.DB.sqlite.prepare('SELECT COUNT(*) AS total FROM profiles WHERE email = ?').get('google.user@example.com');
    assert.equal(Number(profiles.total), 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('google callback with invalid state redirects with auth_error hash', async () => {
  const env = createTestEnv({ GOOGLE_OAUTH_CLIENT_ID: 'client-id-test', GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret-test' });
  const response = await worker.fetch(new Request('https://worker.example/api/auth/google/callback?code=code-1&state=palsu'), env);

  assert.equal(response.status, 302);
  const location = response.headers.get('location');
  assert.ok(location.startsWith('https://frontend.example/#auth_error='));
});