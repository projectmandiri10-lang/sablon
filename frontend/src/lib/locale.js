export const SUPPORTED_LOCALES = ['id', 'en'];
export const LOCALE_STORAGE_KEY = 'easyredesignpro.locale';
export const DEVICE_ID_STORAGE_KEY = 'easyredesignpro.deviceId';

export function normalizeLocale(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized.startsWith('id')) return 'id';
  if (normalized.startsWith('en')) return 'en';
  return '';
}

export function loadStoredLocale(storage = globalThis?.localStorage) {
  try {
    return normalizeLocale(storage?.getItem?.(LOCALE_STORAGE_KEY) || '');
  } catch {
    return '';
  }
}

export function saveStoredLocale(locale, storage = globalThis?.localStorage) {
  const normalized = normalizeLocale(locale);
  try {
    if (!normalized) {
      storage?.removeItem?.(LOCALE_STORAGE_KEY);
      return '';
    }
    storage?.setItem?.(LOCALE_STORAGE_KEY, normalized);
    return normalized;
  } catch {
    return normalized;
  }
}

export function resolveInitialLocale({ storedLocale = '', viewerDefaultLocale = '', browserLanguage = '' } = {}) {
  const explicitLocale = normalizeLocale(storedLocale);
  if (explicitLocale) return explicitLocale;

  const viewerLocale = normalizeLocale(viewerDefaultLocale);
  if (viewerLocale) return viewerLocale;

  const browserLocale = normalizeLocale(browserLanguage);
  if (browserLocale) return browserLocale;

  return 'en';
}

export function ensureBrowserDeviceId(storage = globalThis?.localStorage) {
  try {
    const existing = String(storage?.getItem?.(DEVICE_ID_STORAGE_KEY) || '').trim();
    if (existing) return existing;
    const nextValue =
      typeof crypto?.randomUUID === 'function'
        ? crypto.randomUUID()
        : `device-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
    storage?.setItem?.(DEVICE_ID_STORAGE_KEY, nextValue);
    return nextValue;
  } catch {
    return typeof crypto?.randomUUID === 'function'
      ? crypto.randomUUID()
      : `device-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  }
}

export function localeTag(locale) {
  return normalizeLocale(locale) === 'id' ? 'id-ID' : 'en-US';
}
