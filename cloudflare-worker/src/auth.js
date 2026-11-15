// Auth custom pengganti Supabase GoTrue: password PBKDF2, access JWT HS256,
// refresh token tersimpan hash-nya di D1, dan Google OAuth via Worker.
// Tanpa dependensi eksternal; seluruh kripto memakai Web Crypto (crypto.subtle).

import {
  createSession,
  deleteSessionByTokenHash,
  getAuthProfileById,
  getSessionByTokenHash
} from './db.js';

export const MIN_PASSWORD_LENGTH = 6;
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_DAYS = 30;
const PBKDF2_ITERATIONS = 100000;
const GOOGLE_STATE_TTL_SECONDS = 10 * 60;

function requireAuthSecret(env) {
  const secret = String(env?.AUTH_JWT_SECRET || '').trim();
  if (!secret) throw new Error('Worker belum dikonfigurasi: AUTH_JWT_SECRET kosong.');
  return secret;
}

function bytesToHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  const clean = String(hex || '');
  const bytes = new Uint8Array(Math.floor(clean.length / 2));
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(clean.slice(index * 2, index * 2 + 2), 16) || 0;
  }
  return bytes;
}

function bytesToBase64Url(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value) {
  const base64 = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function encodeBase64UrlJson(value) {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value ?? {})));
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || '')));
  return bytesToHex(new Uint8Array(digest));
}

function randomTokenHex(byteLength) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

function timingSafeEqual(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Password (PBKDF2-SHA256)
// ---------------------------------------------------------------------------

export function generateSaltHex() {
  return randomTokenHex(16);
}

export async function hashPasswordHex(password, saltHex) {
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(password || '')), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(saltHex), iterations: PBKDF2_ITERATIONS },
    keyMaterial,
    256
  );
  return bytesToHex(new Uint8Array(bits));
}

export async function verifyPasswordHash(password, saltHex, expectedHash) {
  if (!saltHex || !expectedHash) return false;
  const computed = await hashPasswordHex(password, saltHex);
  return timingSafeEqual(computed, expectedHash);
}

// ---------------------------------------------------------------------------
// JWT HS256 (access token + state OAuth)
// ---------------------------------------------------------------------------

async function hmacKey(env, usage) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(requireAuthSecret(env)), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}

export async function signJwt(env, payload, ttlSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const header = encodeBase64UrlJson({ alg: 'HS256', typ: 'JWT' });
  const body = encodeBase64UrlJson({ ...payload, iat: now, exp: now + ttlSeconds });
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(env, 'sign'), new TextEncoder().encode(`${header}.${body}`));
  return `${header}.${body}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export async function verifyJwt(env, token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  try {
    const valid = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(env, 'verify'),
      base64UrlToBytes(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
    );
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[1])));
    if (typeof payload?.exp === 'number' && payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function signAccessToken(env, user) {
  return signJwt(env, { sub: user.id, email: user.email }, ACCESS_TOKEN_TTL_SECONDS);
}

export async function verifyAccessToken(env, token) {
  const payload = await verifyJwt(env, token);
  if (!payload?.sub || !payload?.email) return null;
  return payload;
}

// ---------------------------------------------------------------------------
// Sesi (access token + refresh token di D1)
// ---------------------------------------------------------------------------

export async function createAuthSession(env, profile) {
  const accessToken = await signAccessToken(env, { id: profile.id, email: profile.email });
  const refreshToken = randomTokenHex(32);
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await createSession(env, {
    id: crypto.randomUUID(),
    userId: profile.id,
    tokenHash: await sha256Hex(refreshToken),
    expiresAt: refreshExpiresAt
  });
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: 'bearer',
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    expires_at: now + ACCESS_TOKEN_TTL_SECONDS,
    user: { id: profile.id, email: profile.email }
  };
}

export async function rotateRefreshSession(env, refreshToken) {
  const token = String(refreshToken || '').trim();
  if (!token) throw new Error('Refresh token wajib diisi.');
  const tokenHash = await sha256Hex(token);
  const session = await getSessionByTokenHash(env, tokenHash);
  if (!session || new Date(session.expires_at).getTime() <= Date.now()) {
    if (session) await deleteSessionByTokenHash(env, tokenHash);
    throw new Error('Session tidak valid. Silakan login ulang.');
  }
  const profile = await getAuthProfileById(env, session.user_id);
  if (!profile || profile.is_active === false) throw new Error('Akun tidak aktif.');
  await deleteSessionByTokenHash(env, tokenHash);
  return createAuthSession(env, profile);
}

export async function revokeRefreshSession(env, refreshToken) {
  const token = String(refreshToken || '').trim();
  if (!token) return;
  await deleteSessionByTokenHash(env, await sha256Hex(token));
}

// ---------------------------------------------------------------------------
// Google OAuth (stateless state JWT + callback Worker)
// ---------------------------------------------------------------------------

export function workerBaseUrl(env) {
  const value = String(env?.WORKER_BASE_URL || '').trim().replace(/\/+$/, '');
  if (!value) throw new Error('Worker belum dikonfigurasi: WORKER_BASE_URL kosong.');
  return value;
}

export function googleRedirectUri(env) {
  return `${workerBaseUrl(env)}/api/auth/google/callback`;
}

function requireGoogleClientId(env) {
  const clientId = String(env?.GOOGLE_OAUTH_CLIENT_ID || '').trim();
  if (!clientId) throw new Error('Worker belum dikonfigurasi: GOOGLE_OAUTH_CLIENT_ID kosong.');
  return clientId;
}

export async function buildGoogleAuthStart(env) {
  const state = await signJwt(env, { purpose: 'google_oauth', nonce: crypto.randomUUID() }, GOOGLE_STATE_TTL_SECONDS);
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', requireGoogleClientId(env));
  url.searchParams.set('redirect_uri', googleRedirectUri(env));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('prompt', 'select_account');
  return { url: url.toString(), state };
}

export async function verifyGoogleState(env, state) {
  const payload = await verifyJwt(env, state);
  if (!payload || payload.purpose !== 'google_oauth') return null;
  return payload;
}

export async function exchangeGoogleCode(env, code) {
  const clientSecret = String(env?.GOOGLE_OAUTH_CLIENT_SECRET || '').trim();
  if (!clientSecret) throw new Error('Worker belum dikonfigurasi: GOOGLE_OAUTH_CLIENT_SECRET kosong.');
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: String(code || ''),
      client_id: requireGoogleClientId(env),
      client_secret: clientSecret,
      redirect_uri: googleRedirectUri(env),
      grant_type: 'authorization_code'
    })
  });
  const tokenData = await tokenResponse.json().catch(() => null);
  if (!tokenResponse.ok || !tokenData?.access_token) {
    throw new Error(tokenData?.error_description || 'Gagal menukar kode OAuth Google.');
  }
  const userinfoResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` }
  });
  const userinfo = await userinfoResponse.json().catch(() => null);
  if (!userinfoResponse.ok || !userinfo?.email) throw new Error('Gagal mengambil profil Google.');
  return userinfo;
}