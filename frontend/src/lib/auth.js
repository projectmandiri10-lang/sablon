import { API_BASE_URL } from './api.js';
import { ensureBrowserDeviceId } from './locale.js';

export const isAuthConfigured = Boolean(API_BASE_URL);

const SESSION_STORAGE_KEY = 'easyredesignpro.authSession';
const LEGACY_SESSION_STORAGE_KEYS = ['easyredesignpro.supabaseFallbackSession', 'designmudahfree.supabaseFallbackSession'];
const REFRESH_MARGIN_SECONDS = 60;

let currentSession = null;
let sessionLoaded = false;
let refreshTimer = null;
let refreshPromise = null;
const listeners = new Set();

function decodeJwtPayload(token) {
  if (!token) return null;
  try {
    const normalized = String(token).split('.')[1].replaceAll('-', '+').replaceAll('_', '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const decoded = window.atob(padded);
    const bytes = Uint8Array.from(decoded, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

function normalizeSession(raw) {
  if (!raw?.access_token) return null;
  const claims = decodeJwtPayload(raw.access_token) || {};
  const userId = raw.user?.id || claims.sub;
  if (!userId) return null;
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = Number(raw.expires_at || claims.exp || now + Number(raw.expires_in || 900));
  return {
    access_token: raw.access_token,
    refresh_token: raw.refresh_token || '',
    token_type: raw.token_type || 'bearer',
    expires_at: expiresAt,
    expires_in: Math.max(0, expiresAt - now),
    user: {
      id: userId,
      email: raw.user?.email || claims.email || '',
      user_metadata: raw.user?.user_metadata || {}
    }
  };
}

function persistSession(session) {
  try {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    for (const key of LEGACY_SESSION_STORAGE_KEYS) window.localStorage.removeItem(key);
  } catch {
    // Browser storage can be unavailable in hardened/private profiles.
  }
}

function readStoredSession() {
  try {
    const raw =
      window.localStorage.getItem(SESSION_STORAGE_KEY) ||
      LEGACY_SESSION_STORAGE_KEYS.map((key) => window.localStorage.getItem(key)).find(Boolean);
    const session = normalizeSession(raw ? JSON.parse(raw) : null);
    if (!session) {
      clearStoredSession();
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

function clearStoredSession() {
  try {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    for (const key of LEGACY_SESSION_STORAGE_KEYS) window.localStorage.removeItem(key);
  } catch {
    // Browser storage can be unavailable in hardened/private profiles.
  }
}

function emitAuthEvent(event, session) {
  for (const listener of listeners) {
    try {
      listener(event, session);
    } catch {
      // Listener errors must not break the auth flow.
    }
  }
}

function clearRefreshTimer() {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

function scheduleRefresh(session) {
  clearRefreshTimer();
  if (!session?.refresh_token || !session.expires_at) return;
  const delayMs = Math.max(5, session.expires_at - Math.floor(Date.now() / 1000) - REFRESH_MARGIN_SECONDS) * 1000;
  refreshTimer = setTimeout(() => {
    refreshSession().catch(() => {});
  }, delayMs);
}

function adoptSession(rawSession, event = 'SIGNED_IN') {
  const session = normalizeSession(rawSession);
  if (!session) return null;
  currentSession = session;
  sessionLoaded = true;
  persistSession(session);
  scheduleRefresh(session);
  emitAuthEvent(event, session);
  return session;
}

function dropSession(event = 'SIGNED_OUT') {
  currentSession = null;
  sessionLoaded = true;
  clearRefreshTimer();
  clearStoredSession();
  emitAuthEvent(event, null);
}

async function authRequest(path, body) {
  if (!API_BASE_URL) throw new Error('Koneksi ke layanan belum tersambung. Periksa URL API aplikasi.');
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
  } catch {
    throw new Error('Koneksi ke layanan belum tersambung. Coba lagi beberapa saat.');
  }
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) throw new Error(data?.error || 'Auth gagal. Coba lagi beberapa saat.');
  return data;
}

export async function signUp({ email, password, fullName } = {}) {
  const session = await authRequest('/api/auth/signup', {
    email,
    password,
    fullName,
    deviceId: ensureBrowserDeviceId()
  });
  return { data: { session: adoptSession(session) }, error: null };
}

export async function signIn({ email, password } = {}) {
  const session = await authRequest('/api/auth/login', { email, password });
  return { data: { session: adoptSession(session) }, error: null };
}

export function signInWithGoogle() {
  if (!API_BASE_URL) throw new Error('Koneksi ke layanan belum tersambung. Periksa URL API aplikasi.');
  window.location.assign(`${API_BASE_URL}/api/auth/google`);
}

export async function signOut() {
  const refreshToken = currentSession?.refresh_token || readStoredSession()?.refresh_token;
  if (refreshToken) {
    try {
      await authRequest('/api/auth/logout', { refresh_token: refreshToken });
    } catch {
      // Logout must always clear the local session even if the API is unreachable.
    }
  }
  dropSession();
  return { error: null };
}

export async function refreshSession() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const stored = currentSession || readStoredSession();
    if (!stored?.refresh_token) {
      if (stored || sessionLoaded) dropSession();
      return null;
    }
    try {
      const nextSession = await authRequest('/api/auth/refresh', { refresh_token: stored.refresh_token });
      return adoptSession(nextSession, currentSession ? 'TOKEN_REFRESHED' : 'SIGNED_IN');
    } catch {
      dropSession();
      return null;
    }
  })();
  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

export async function getSession() {
  if (!sessionLoaded) {
    currentSession = readStoredSession();
    sessionLoaded = true;
  }
  if (!currentSession) return { data: { session: null }, error: null };
  const now = Math.floor(Date.now() / 1000);
  if (!currentSession.refresh_token || currentSession.expires_at <= now + REFRESH_MARGIN_SECONDS) {
    const refreshed = await refreshSession();
    return { data: { session: refreshed }, error: null };
  }
  scheduleRefresh(currentSession);
  return { data: { session: currentSession }, error: null };
}

export function setSessionFromCallback(hashParams) {
  const accessToken = hashParams.get('access_token');
  const refreshToken = hashParams.get('refresh_token');
  if (!accessToken || !refreshToken) return null;
  const claims = decodeJwtPayload(accessToken);
  if (!claims?.sub) return null;
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = Number(hashParams.get('expires_at') || claims.exp || now + Number(hashParams.get('expires_in') || 900));
  if (expiresAt <= now) return null;
  return adoptSession({
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: hashParams.get('token_type') || 'bearer',
    expires_at: expiresAt,
    user: { id: claims.sub, email: claims.email || '' }
  });
}

export function onAuthStateChange(callback) {
  listeners.add(callback);
  return {
    data: {
      subscription: {
        unsubscribe: () => listeners.delete(callback)
      }
    }
  };
}