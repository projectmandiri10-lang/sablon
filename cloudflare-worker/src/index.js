import { AI_REDRAW_PRICE_IDR, SUPERUSER_EMAIL } from './pricing.js';
import {
  decorateAdminJobs,
  EXAMPLE_JOBS_BUCKET,
  getExampleArtifactsFromManifest,
  hasCompleteExampleArtifacts,
  isSuperuserProfile,
  normalizeExampleJobsSetting,
  updateExampleJobsSetting
} from './example-jobs.js';
import {
  buildFinanceCsv,
  buildFinanceSummary,
  BUSINESS_FINANCE_CASH_DIRECTIONS,
  BUSINESS_FINANCE_ENTRY_TYPES,
  BUSINESS_FINANCE_TAX_TREATMENTS,
  DEFAULT_TAX_CODE,
  filterFinanceTransactions,
  isSuccessfulGatewayPayment,
  nextDateOnly,
  normalizeBusinessLedgerTransaction,
  normalizeFinanceRange,
  normalizeGatewayPaymentTransaction,
  normalizeJobUsageTransaction,
  normalizeLedgerTransaction,
  normalizeManualPaymentTransaction
} from './admin-finance.js';
import {
  countGrantedSignupBonusClaims,
  createBusinessFinanceEntry,
  createJob,
  createManualPayment,
  createPaymentTransaction,
  createProfile,
  creditBalance,
  deleteUserCascade,
  expireStaleInteractiveQrisPayments,
  findJobByAiLedgerId,
  findLedgerByReference,
  getAppSetting,
  getAuthProfileByEmail,
  getJobById,
  getLedgerById,
  getManualPaymentById,
  getPaymentTransactionById,
  getPaymentTransactionByOrderId,
  getPricing,
  getProfile,
  getProfileRaw,
  insertInteractiveQrisWebhookLog,
  insertLedger,
  insertSignupBonusClaim,
  isDuplicateConstraintError,
  listActivePendingInteractiveQrisPayments,
  listAdminJobs,
  listAdminManualPayments,
  listAdminMidtransPaymentsRows,
  listAdminOverviewJobs,
  listAdminOverviewLedger,
  listAdminOverviewManualPayments,
  listAdminOverviewProfiles,
  listAdminPaymentTransactionsRows,
  listAppSettings,
  listBusinessFinanceEntriesRows,
  listExampleJobs,
  listFinanceGatewayPaymentsRows,
  listFinanceJobsRows,
  listFinanceLedgerRows,
  listFinanceManualPaymentsRows,
  listInteractiveQrisWebhookLogs,
  listJobsByIds,
  listPricingRules,
  listProfileEmails,
  listProfileRoles,
  listProfilesWithBalance,
  listPublicAppSettings,
  listTaxRulesRows,
  listUserAutomaticPayments,
  listUserMidtransPayments,
  unpublishOtherExampleJobs,
  updateJob,
  updateManualPayment,
  updatePaymentTransactionById,
  updateProfile,
  upsertAppSetting,
  upsertPricingRule,
  upsertTaxRule
} from './db.js';
import { deleteObjects, getObject, putObject } from './storage.js';
import {
  buildGoogleAuthStart,
  createAuthSession,
  exchangeGoogleCode,
  generateSaltHex,
  hashPasswordHex,
  MIN_PASSWORD_LENGTH,
  revokeRefreshSession,
  rotateRefreshSession,
  verifyAccessToken,
  verifyGoogleState,
  verifyPasswordHash,
  workerBaseUrl
} from './auth.js';
import {
  AIVENE_IMAGE_REDRAW_PROVIDER,
  HYBRID_REDRAW_PRESETS,
  OPENAI_IMAGE_REDRAW_PROVIDER,
  normalizeHybridRedrawConfig
} from '../../shared/hybridRedrawConfig.js';
import {
  DEFAULT_INTERACTIVE_QRIS_CLOSED_HOURS,
  getInteractiveQrisClosedState,
  normalizeInteractiveQrisClosedHours
} from '../../shared/interactiveQrisClosedHours.js';
import { buildDynamicQrisPayload, isValidQrisPayload, QRIS_MAX_PAYLOAD_LENGTH } from '../../shared/qrisPayload.js';

const DEFAULT_PRICING = {
  ready_trace: 2000,
  ai_redraw: AI_REDRAW_PRICE_IDR,
  separation_film: 0
};

const MIDTRANS_PROVIDER = 'midtrans';
const MIDTRANS_MIN_AMOUNT_IDR = 2000;
const MIDTRANS_PAYMENT_REASON = 'midtrans_payment';
const MIDTRANS_FINAL_STATUSES = new Set(['settlement', 'deny', 'cancel', 'expire', 'failure', 'refund', 'chargeback', 'partial_refund', 'partial_chargeback']);
const INTERACTIVE_QRIS_PROVIDER = 'interactive_qris';
const INTERACTIVE_QRIS_MIN_AMOUNT_IDR = 2000;
const INTERACTIVE_QRIS_DEFAULT_UNIQUE_DIGITS = 2;
const INTERACTIVE_QRIS_EXPIRY_MINUTES = 30;
const INTERACTIVE_QRIS_PAYMENT_REASON = 'interactive_qris_payment';
const INTERACTIVE_QRIS_PAYMENT_TYPE = 'qris_static_unique';
const DEFAULT_INTERACTIVE_QRIS_INSTRUCTIONS = 'Scan QRIS merchant lalu bayar sesuai nominal unik yang muncul di billing.';
const INTERACTIVE_QRIS_ASSET_PREFIX = 'app-assets/qris';
const INTERACTIVE_QRIS_ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const INTERACTIVE_QRIS_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const SIGNUP_BONUS_REASON = 'signup_free_credit';
const SIGNUP_BONUS_AMOUNT_IDR = 5000;
const SIGNUP_BONUS_MAX_MATCHED_CLAIMS = 2;
const OPENAI_COMPATIBLE_FALLBACK_REASONS = ['quota_exhausted', 'billing_required', 'model_unavailable', 'upstream_unavailable'];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization,Content-Type,X-Processor-API-Key,X-Interactive-QRIS-Secret',
  'Access-Control-Expose-Headers': 'X-AI-Ledger-Id,X-AI-Redraw-Metadata'
};

function requireEnvValue(env, key) {
  const value = env[key];
  if (!value) {
    throw new Error(`Worker belum dikonfigurasi: ${key} kosong.`);
  }
  return value;
}

function hasEnvValue(env, key) {
  return Boolean(env[key]);
}

function isAiveneConfigured(env) {
  return hasEnvValue(env, 'AIVENE_API_KEY');
}

function isOpenAiConfigured(env) {
  return hasEnvValue(env, 'OPENAI_API_KEY');
}

function aiveneBaseUrl(env) {
  return String(env.AIVENE_BASE_URL || 'https://api.aivene.com/v1').replace(/\/+$/, '');
}

function openAiBaseUrl(env) {
  return String(env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
}

function aiveneMaxImageInputBytes(env) {
  const fallback = 20 * 1024 * 1024;
  const parsed = Number.parseInt(env.AIVENE_MAX_IMAGE_INPUT_BYTES, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function openAiMaxImageInputBytes() {
  return 20 * 1024 * 1024;
}

function providerDisplayName(provider) {
  switch (provider) {
    case AIVENE_IMAGE_REDRAW_PROVIDER:
      return 'AIVene';
    case OPENAI_IMAGE_REDRAW_PROVIDER:
      return 'OpenAI';
    default:
      return provider || 'provider AI';
  }
}

function createProviderError(provider, message, extra = {}) {
  const error = new Error(message);
  error.provider = provider;
  error.providerCode = extra.providerCode || '';
  error.statusCode = Number.isInteger(extra.statusCode) ? extra.statusCode : 500;
  error.responseData = extra.responseData || null;
  error.fallbackReason = extra.fallbackReason || '';
  return error;
}

function normalizeProviderMessage(message, fallback) {
  return typeof message === 'string' && message.trim() ? message.trim() : fallback;
}

function buildOpenAiHeaders(env) {
  return {
    Authorization: `Bearer ${requireEnvValue(env, 'OPENAI_API_KEY')}`
  };
}

function buildAiveneHeaders(env) {
  return {
    Authorization: `Bearer ${requireEnvValue(env, 'AIVENE_API_KEY')}`
  };
}

function mapCompatibleImageError(provider, providerName, response, data) {
  const rawStatus = String(data?.error?.code || data?.error?.type || data?.status || '').trim();
  const message = normalizeProviderMessage(
    data?.error?.message || data?.message || data?.raw,
    `${providerName} image request failed: ${response.status}`
  );
  const lowered = message.toLowerCase();
  const bodyAlreadyConsumed =
    provider === AIVENE_IMAGE_REDRAW_PROVIDER &&
    response.status === 400 &&
    /body already used|body (?:stream )?already (?:read|consumed)/.test(lowered);
  let fallbackReason = '';

  if (response.status === 429 || /quota|rate limit|resource exhausted|exhausted|too many requests/.test(lowered)) {
    fallbackReason = 'quota_exhausted';
  } else if (response.status === 402 || /billing|payment|insufficient|credit|budget/.test(lowered)) {
    fallbackReason = 'billing_required';
  } else if (response.status === 404 || /model.*unavailable|model.*not available|unknown model/.test(lowered)) {
    fallbackReason = 'model_unavailable';
  } else if (
    bodyAlreadyConsumed ||
    response.status >= 500 ||
    /timeout|timed out|connection|connect|overloaded|service unavailable|gateway|upstream/.test(lowered)
  ) {
    fallbackReason = 'upstream_unavailable';
  }

  const publicMessage = bodyAlreadyConsumed
    ? 'AIVene gagal memproses format image edit pada request ini.'
    : message;

  return createProviderError(provider, publicMessage, {
    statusCode: response.status,
    providerCode: rawStatus,
    responseData: data,
    fallbackReason
  });
}

function mapAiveneError(response, data) {
  return mapCompatibleImageError(AIVENE_IMAGE_REDRAW_PROVIDER, 'AIVene', response, data);
}

function mapOpenAiError(response, data) {
  return mapCompatibleImageError(OPENAI_IMAGE_REDRAW_PROVIDER, 'OpenAI', response, data);
}

export function shouldFallbackFromAiveneError(error) {
  if (!error || error.provider !== AIVENE_IMAGE_REDRAW_PROVIDER) return false;
  return OPENAI_COMPATIBLE_FALLBACK_REASONS.includes(error.fallbackReason);
}

function shouldFallbackFromCompatibleProviderError(error) {
  if (!error || ![AIVENE_IMAGE_REDRAW_PROVIDER, OPENAI_IMAGE_REDRAW_PROVIDER].includes(error.provider)) return false;
  return OPENAI_COMPATIBLE_FALLBACK_REASONS.includes(error.fallbackReason);
}

function shouldFallbackToSecondaryProvider(error) {
  if (!error) return false;
  return shouldFallbackFromCompatibleProviderError(error);
}

function isProviderConfigured(provider, env) {
  if (provider === AIVENE_IMAGE_REDRAW_PROVIDER) return isAiveneConfigured(env);
  if (provider === OPENAI_IMAGE_REDRAW_PROVIDER) return isOpenAiConfigured(env);
  return false;
}

function buildAiRedrawAvailability(config, env) {
  return {
    aiveneConfigured: isAiveneConfigured(env),
    openAiConfigured: isOpenAiConfigured(env),
    aiRedrawAvailable:
      isProviderConfigured(config.primaryProvider, env) ||
      (config.fallbackProvider ? isProviderConfigured(config.fallbackProvider, env) : false)
  };
}

function aiRedrawMaxImageInputBytes(config, env) {
  if (config?.primaryProvider === AIVENE_IMAGE_REDRAW_PROVIDER) return aiveneMaxImageInputBytes(env);
  if (config?.primaryProvider === OPENAI_IMAGE_REDRAW_PROVIDER) return openAiMaxImageInputBytes();
  return Math.max(aiveneMaxImageInputBytes(env), openAiMaxImageInputBytes());
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(String(base64 || '').replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function encodeBase64UrlJson(value) {
  const jsonValue = JSON.stringify(value ?? {});
  const base64 = bytesToBase64(new TextEncoder().encode(jsonValue));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function parseDataUrl(value) {
  const match = /^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,(.+)$/s.exec(String(value || ''));
  if (!match) return null;
  return {
    mimeType: match[1] || 'application/octet-stream',
    bytes: base64ToBytes(match[2])
  };
}

export function buildAiRedrawPrompt() {
  return 'bersihkan gambar';
}

function artifact(filename, mimeType, bytes) {
  return {
    filename,
    mimeType,
    base64: bytesToBase64(bytes)
  };
}

export function buildAiRawPngArtifactResponse(aiRawPng, metadata = {}, retouchLedgerId = '') {
  return {
    artifacts: {
      aiRawPng: artifact('hasil-ai-mentah.png', 'image/png', aiRawPng)
    },
    retouchLedgerId,
    aiRedrawMetadata: metadata,
    manifest: {
      source: 'ai_raw_png',
      processor: 'browser_local_trace_pending',
      aiRedraw: metadata
    }
  };
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_error) {
    return { raw: text };
  }
}

function dataUrlFromBase64(data, mimeType = 'image/png') {
  return `data:${mimeType};base64,${String(data || '').trim()}`;
}

function extractCompatibleImageUrl(data) {
  const imageData = data?.data?.[0]?.b64_json;
  if (imageData) {
    return dataUrlFromBase64(imageData, data?.data?.[0]?.mime_type || 'image/png');
  }

  return data?.data?.[0]?.url || '';
}

async function downloadGeneratedImage(imageUrl) {
  const parsedDataUrl = parseDataUrl(imageUrl);
  if (parsedDataUrl) {
    return new Response(parsedDataUrl.bytes, {
      headers: {
        'Content-Type': parsedDataUrl.mimeType
      }
    });
  }

  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Gagal mengunduh hasil gambar dari provider: ${response.status}`);
  }
  return response;
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders, ...headers }
  });
}

function error(message, status = 400) {
  return json({ error: message }, status);
}

async function readJson(request) {
  return request.json().catch(() => ({}));
}

function cleanInteractiveQrisWebhookField(value = '') {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .trim();
}

function isUnexpandedMacroDroidToken(value = '') {
  return /^\{[a-z0-9_=]+\}$/i.test(String(value || '').trim());
}

function extractJsonFieldLoose(text, keys = []) {
  for (const key of keys) {
    const pattern = new RegExp(`"${key}"\\s*:\\s*"([\\s\\S]*?)"\\s*(?:,\\s*"[a-zA-Z0-9_]+"\\s*:|\\}\\s*$)`, 'i');
    const match = pattern.exec(text);
    if (match?.[1] !== undefined) return cleanInteractiveQrisWebhookField(match[1]);
  }
  return '';
}

function extractInteractiveQrisMalformedJsonPayload(rawText = '') {
  const text = String(rawText || '');
  if (!text.trim()) return {};

  const packageName = extractJsonFieldLoose(text, ['packageName', 'package_name', 'package', 'appPackage', 'app_package']);
  const appName = extractJsonFieldLoose(text, ['appName', 'app_name']);
  const title = extractJsonFieldLoose(text, ['title']);
  const bodyText = extractJsonFieldLoose(text, ['text', 'message', 'body', 'notification', 'notification_text', 'content']);
  const subText = extractJsonFieldLoose(text, ['subText', 'sub_text']);
  const ticker = extractJsonFieldLoose(text, ['ticker']);
  const lines = extractJsonFieldLoose(text, ['lines', 'textLines', 'text_lines']);
  const bigText = extractJsonFieldLoose(text, ['bigText', 'big_text', 'not_text_big']);
  const infoText = extractJsonFieldLoose(text, ['infoText', 'info_text']);
  const raw = extractJsonFieldLoose(text, ['raw']);

  if (!packageName && !appName && !title && !bodyText && !subText && !ticker && !lines && !bigText && !infoText && !raw) {
    return { raw: cleanInteractiveQrisWebhookField(text) };
  }

  return {
    packageName,
    appName,
    title: title || appName,
    text: bodyText,
    subText,
    ticker,
    lines,
    bigText,
    infoText,
    raw
  };
}

async function readInteractiveQrisWebhookPayload(request) {
  const contentType = String(request.headers.get('content-type') || '').toLowerCase();
  const rawText = await request.text().catch(() => '');
  const queryParams = Object.fromEntries(new URL(request.url).searchParams.entries());
  if (!rawText.trim()) {
    return {
      body: queryParams,
      rawText: Object.keys(queryParams).length ? JSON.stringify(queryParams) : ''
    };
  }

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const params = Object.fromEntries(new URLSearchParams(rawText).entries());
    return { body: { ...queryParams, ...params }, rawText };
  }

  try {
    const parsed = JSON.parse(rawText);
    if (parsed && typeof parsed === 'object') return { body: { ...queryParams, ...parsed }, rawText };
  } catch {
    // lanjut ke parser longgar di bawah
  }

  return {
    body: { ...queryParams, ...extractInteractiveQrisMalformedJsonPayload(rawText) },
    rawText
  };
}

function normalizeLocale(locale) {
  return String(locale || '').trim().toLowerCase().startsWith('id') ? 'id' : 'en';
}

export function getViewerCountryCode(request) {
  const cfCountry = String(request?.cf?.country || request?.headers?.get('cf-ipcountry') || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(cfCountry) ? cfCountry : '';
}

export function getViewerDefaultLocale(request) {
  return getViewerCountryCode(request) === 'ID' ? 'id' : 'en';
}

function extractRequestIp(request) {
  const candidates = [
    request?.headers?.get('cf-connecting-ip'),
    request?.headers?.get('x-forwarded-for'),
    request?.headers?.get('x-real-ip')
  ];

  for (const candidate of candidates) {
    const value = String(candidate || '')
      .split(',')[0]
      .trim();
    if (value) return value;
  }

  return '';
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value || ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function hashSignupBonusIdentifier(env, value) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  const salt = requireEnvValue(env, 'SIGNUP_BONUS_HASH_SALT');
  return sha256Hex(`${salt}:${normalized}`);
}

export function shouldGrantSignupBonus({ deviceGrantedClaims = 0, ipGrantedClaims = 0 } = {}) {
  return deviceGrantedClaims < SIGNUP_BONUS_MAX_MATCHED_CLAIMS && ipGrantedClaims < SIGNUP_BONUS_MAX_MATCHED_CLAIMS;
}

function bearerToken(request) {
  const header = request.headers.get('Authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

function encodeStoragePath(path) {
  return String(path || '')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function formatDate(date) {
  return date.toISOString();
}

function normalizeBooleanString(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function isMidtransConfigured(env) {
  return hasEnvValue(env, 'MIDTRANS_SERVER_KEY') && hasEnvValue(env, 'APP_BASE_URL');
}

function interactiveQrisMinAmountIdr(env) {
  const parsed = Number.parseInt(env.INTERACTIVE_QRIS_MIN_AMOUNT_IDR, 10);
  return Number.isInteger(parsed) && parsed >= INTERACTIVE_QRIS_MIN_AMOUNT_IDR ? parsed : INTERACTIVE_QRIS_MIN_AMOUNT_IDR;
}

function interactiveQrisUniqueDigits(env) {
  const parsed = Number.parseInt(env.INTERACTIVE_QRIS_UNIQUE_DIGITS, 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 6 ? parsed : INTERACTIVE_QRIS_DEFAULT_UNIQUE_DIGITS;
}

function interactiveQrisExpiryMs() {
  return INTERACTIVE_QRIS_EXPIRY_MINUTES * 60 * 1000;
}

function isInteractiveQrisConfigured(env) {
  return hasEnvValue(env, 'INTERACTIVE_QRIS_WEBHOOK_SECRET') && hasEnvValue(env, 'INTERACTIVE_QRIS_SOURCE_PACKAGE');
}

function isMidtransProduction(env) {
  return normalizeBooleanString(env.MIDTRANS_IS_PRODUCTION);
}

function midtransApiBaseUrl(env) {
  return isMidtransProduction(env) ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com';
}

function midtransSnapBaseUrl(env) {
  return isMidtransProduction(env) ? 'https://app.midtrans.com' : 'https://app.sandbox.midtrans.com';
}

function appBaseUrl(env) {
  return String(requireEnvValue(env, 'APP_BASE_URL')).replace(/\/+$/, '');
}

export function buildMidtransAuthHeader(env) {
  return `Basic ${btoa(`${requireEnvValue(env, 'MIDTRANS_SERVER_KEY')}:`)}`;
}

function buildMidtransOrderId() {
  return `mt-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

function buildInteractiveQrisOrderId() {
  return `iq-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

function buildMidtransFinishUrl(env, orderId) {
  const url = new URL(`${appBaseUrl(env)}/`);
  url.searchParams.set('view', 'billing');
  url.searchParams.set('midtrans_return', '1');
  url.searchParams.set('midtrans_order_id', orderId);
  return url.toString();
}

function midtransDisplayName() {
  return 'Top up credit EasyRedesign Pro';
}

function normalizeInteractiveQrisSetting(value = {}) {
  return {
    enabled: value?.enabled === true,
    merchantName: String(value?.merchantName || '').trim(),
    qrImageUrl: String(value?.qrImageUrl || '').trim(),
    qrPayload: String(value?.qrPayload || '').trim(),
    instructions: String(value?.instructions || DEFAULT_INTERACTIVE_QRIS_INSTRUCTIONS).trim() || DEFAULT_INTERACTIVE_QRIS_INSTRUCTIONS,
    contact: String(value?.contact || '').trim(),
    closedHours: normalizeInteractiveQrisClosedHours(value?.closedHours || DEFAULT_INTERACTIVE_QRIS_CLOSED_HOURS)
  };
}

function normalizeIsoDateOrNow(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function padInteractiveQrisUniqueCode(uniqueCode, digits) {
  return String(Math.max(0, Number.parseInt(uniqueCode, 10) || 0)).padStart(Math.max(1, digits), '0');
}

function buildInteractiveQrisDynamicPayload(qrisPayload, amountIdr) {
  if (!qrisPayload) return '';
  try {
    return buildDynamicQrisPayload(qrisPayload, amountIdr);
  } catch {
    return '';
  }
}

function buildInteractiveQrisInstruction(payment = {}, settingValue = {}, env = {}) {
  const settings = normalizeInteractiveQrisSetting(settingValue);
  return {
    displayAmountIdr: Number(payment.amount_idr) || 0,
    baseAmountIdr: Number(payment.base_amount_idr) || Number(payment.amount_idr) || 0,
    uniqueCode: padInteractiveQrisUniqueCode(payment.unique_code, interactiveQrisUniqueDigits(env)),
    expiresAt: payment.expired_at || null,
    qrImageUrl: settings.qrImageUrl,
    qrisPayload: buildInteractiveQrisDynamicPayload(settings.qrPayload, Number(payment.amount_idr) || 0),
    merchantName: settings.merchantName,
    instructions: settings.instructions,
    contact: settings.contact,
    closedHours: settings.closedHours
  };
}

function interactiveQrisAssetPublicUrl(env, path) {
  return `${workerBaseUrl(env)}/api/assets/${EXAMPLE_JOBS_BUCKET}/${encodeStoragePath(path)}`;
}

function normalizeInteractiveQrisImageExtension(file) {
  const contentType = String(file?.type || '').toLowerCase();
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/jpeg') return 'jpg';
  if (contentType === 'image/webp') return 'webp';
  const name = String(file?.name || '').toLowerCase();
  if (name.endsWith('.png')) return 'png';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'jpg';
  if (name.endsWith('.webp')) return 'webp';
  return 'png';
}

function buildInteractiveQrisAssetPath(file) {
  return `${INTERACTIVE_QRIS_ASSET_PREFIX}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${normalizeInteractiveQrisImageExtension(file)}`;
}

function requireInteractiveQrisOpen(settingValue, now = new Date(Date.now())) {
  const closedState = getInteractiveQrisClosedState(normalizeInteractiveQrisSetting(settingValue).closedHours, now);
  if (closedState.isClosed) {
    throw new Error(closedState.message);
  }
}

export function allocateInteractiveQrisPaymentAmount(baseAmountIdr, activePayments = [], digits = INTERACTIVE_QRIS_DEFAULT_UNIQUE_DIGITS) {
  const width = Number.isInteger(digits) && digits >= 1 && digits <= 6 ? digits : INTERACTIVE_QRIS_DEFAULT_UNIQUE_DIGITS;
  const maxCode = 10 ** width - 1;
  const usedAmounts = new Set((activePayments || []).map((payment) => Number(payment.amount_idr) || 0));

  for (let uniqueCode = 1; uniqueCode <= maxCode; uniqueCode += 1) {
    const displayAmountIdr = baseAmountIdr + uniqueCode;
    if (!usedAmounts.has(displayAmountIdr)) {
      return { displayAmountIdr, uniqueCode };
    }
  }

  throw new Error('Semua nominal unik QRIS untuk nominal dasar ini sedang terpakai. Coba lagi beberapa menit lagi.');
}

function extractCurrencyInt(fragment, minimumAmountIdr) {
  const cleaned = String(fragment || '')
    .trim()
    .replace(/[.,](?:00|0)$/, '');
  const digits = cleaned.replace(/[^\d]/g, '');
  const value = Number.parseInt(digits, 10);
  if (!Number.isInteger(value) || value < minimumAmountIdr) return null;
  return value;
}

export function extractInteractiveQrisAmountCandidates(payload = {}, minimumAmountIdr = INTERACTIVE_QRIS_MIN_AMOUNT_IDR) {
  const texts = [];
  for (const key of [
    'title',
    'text',
    'message',
    'body',
    'notification',
    'notification_text',
    'content',
    'bigText',
    'big_text',
    'subText',
    'sub_text',
    'ticker',
    'lines',
    'textLines',
    'text_lines',
    'infoText',
    'info_text'
  ]) {
    if (typeof payload[key] === 'string' && payload[key] && !isUnexpandedMacroDroidToken(payload[key])) {
      texts.push(payload[key]);
    } else if (Array.isArray(payload[key])) {
      texts.push(payload[key].join(' '));
    }
  }
  if (typeof payload.amount === 'string' || typeof payload.amount === 'number') {
    texts.push(String(payload.amount));
  }
  if (typeof payload.raw === 'string' && payload.raw && !isUnexpandedMacroDroidToken(payload.raw)) texts.push(payload.raw);
  else if (payload.raw && typeof payload.raw === 'object') texts.push(JSON.stringify(payload.raw));

  const candidates = new Set();
  const patterns = [
    /(?:rp\.?|idr)\s*([0-9]+(?:[.,][0-9]{3})*(?:[.,][0-9]{1,2})?)/gi,
    /\b\d{1,3}(?:[.,]\d{3})+\b/g,
    /\b\d{4,}\b/g
  ];

  for (const text of texts) {
    for (const pattern of patterns) {
      for (const match of String(text).matchAll(pattern)) {
        const value = extractCurrencyInt(match[1] || match[0], minimumAmountIdr);
        if (value) candidates.add(value);
      }
    }
  }

  return [...candidates].sort((left, right) => left - right);
}

export function buildMidtransSnapPayload({ orderId, amountIdr, user, profile, finishUrl }) {
  return {
    transaction_details: {
      order_id: orderId,
      gross_amount: amountIdr
    },
    item_details: [
      {
        id: 'credit_topup',
        price: amountIdr,
        quantity: 1,
        name: midtransDisplayName()
      }
    ],
    customer_details: {
      first_name: profile?.full_name || user?.user_metadata?.full_name || user?.email || 'User',
      email: user?.email || ''
    },
    callbacks: {
      finish: finishUrl
    },
    custom_field1: profile?.id || user?.id || '',
    custom_field2: user?.email || ''
  };
}

async function sha512Hex(value) {
  const bytes = new TextEncoder().encode(String(value || ''));
  const digest = await crypto.subtle.digest('SHA-512', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function verifyMidtransSignature(notification, env) {
  const signature = String(notification?.signature_key || '').trim().toLowerCase();
  if (!signature) return false;
  const payload = `${notification?.order_id || ''}${notification?.status_code || ''}${notification?.gross_amount || ''}${requireEnvValue(env, 'MIDTRANS_SERVER_KEY')}`;
  const computed = await sha512Hex(payload);
  return computed === signature;
}

export function mapMidtransTransactionState(data = {}) {
  const transactionStatus = String(data.transaction_status || '').trim().toLowerCase() || 'pending';
  const fraudStatus = String(data.fraud_status || '').trim().toLowerCase();
  const statusCode = String(data.status_code || '').trim();
  const grossAmount = Number.parseInt(String(data.gross_amount || '0').split('.')[0], 10) || 0;
  const creditEligible = transactionStatus === 'settlement' || (transactionStatus === 'capture' && fraudStatus === 'accept');
  const isFinal =
    creditEligible ||
    MIDTRANS_FINAL_STATUSES.has(transactionStatus) ||
    (transactionStatus === 'capture' && fraudStatus === 'deny');

  return {
    provider: MIDTRANS_PROVIDER,
    status: transactionStatus,
    statusCode,
    fraudStatus,
    grossAmount,
    paymentType: String(data.payment_type || '').trim(),
    externalTransactionId: String(data.transaction_id || '').trim(),
    creditEligible,
    isFinal,
    paidAt: creditEligible ? String(data.settlement_time || data.transaction_time || new Date().toISOString()) : null,
    expiredAt: transactionStatus === 'expire' ? String(data.transaction_time || new Date().toISOString()) : null
  };
}

function calculateDynamicJobPrice({ inputMode = 'ready_trace', separationFilmCount = 0, aiAlreadyCharged = false } = {}, pricing = DEFAULT_PRICING) {
  const basePrice =
    inputMode === 'ai_redraw'
      ? aiAlreadyCharged
        ? 0
        : pricing.ai_redraw
      : pricing.ready_trace;
  return basePrice + Math.max(0, Number(separationFilmCount) || 0) * pricing.separation_film;
}

export function normalizeAiRedrawModelConfig(value = {}, env = {}) {
  return normalizeHybridRedrawConfig(value, env);
}

function examplePublicUrl(env, path) {
  return `${workerBaseUrl(env)}/api/assets/${EXAMPLE_JOBS_BUCKET}/${encodeStoragePath(path)}`;
}

function exampleJobPath(jobId, filename) {
  return `jobs/${jobId}/${filename}`;
}

function exampleJobPrefix(jobId) {
  return `jobs/${jobId}`;
}

function jobIsDeleted(job = {}) {
  return Boolean(job?.deleted_at);
}

function buildFallbackProfile(authUser = {}) {
  const email = normalizeEmail(authUser.email);
  const isSuperuser = email === normalizeEmail(SUPERUSER_EMAIL);
  return {
    id: authUser.id,
    email,
    full_name: authUser.user_metadata?.full_name || authUser.user_metadata?.name || '',
    role: isSuperuser ? 'superuser' : 'user',
    is_unlimited: isSuperuser,
    is_active: true,
    deleted_at: null,
    created_at: authUser.created_at || new Date().toISOString(),
    updated_at: authUser.updated_at || authUser.created_at || new Date().toISOString()
  };
}

function buildLegacyExampleSettingEntry(env, job, artifacts) {
  const resultPreviewUrl = artifacts?.files?.fullPng || (artifacts?.resultPreviewPath ? examplePublicUrl(env, artifacts.resultPreviewPath) : '');
  const sourcePreviewUrl = artifacts?.sourcePreviewPath ? examplePublicUrl(env, artifacts.sourcePreviewPath) : '';
  return {
    jobId: job.id,
    projectName: artifacts?.projectName || job.project_name,
    productionType: job.production_type,
    inputMode: artifacts?.inputMode || job.input_mode,
    imageUrl: resultPreviewUrl,
    sourcePreviewUrl,
    resultPreviewUrl,
    files: artifacts?.files || {},
    separations: artifacts?.separations || [],
    settings: artifacts?.settings || job.settings || {},
    updatedAt: formatDate(new Date())
  };
}

async function syncLegacyExampleSetting(env, job, artifacts) {
  const exampleSetting = await getAppSetting(env, 'example_jobs');
  const currentExamples = normalizeExampleJobsSetting(exampleSetting?.value);
  const nextExamples = updateExampleJobsSetting(currentExamples, job.production_type, buildLegacyExampleSettingEntry(env, job, artifacts));
  await upsertAppSetting(env, {
    key: 'example_jobs',
    value: nextExamples,
    isPublic: true,
    description: 'Contoh gambar aktif untuk sticker dan sablon'
  });
  return nextExamples;
}

async function clearLegacyExampleSettingIfMatches(env, job) {
  const exampleSetting = await getAppSetting(env, 'example_jobs');
  const currentExamples = normalizeExampleJobsSetting(exampleSetting?.value);
  if (currentExamples[job.production_type]?.jobId !== job.id) {
    return currentExamples;
  }
  const nextExamples = updateExampleJobsSetting(currentExamples, job.production_type, null);
  await upsertAppSetting(env, {
    key: 'example_jobs',
    value: nextExamples,
    isPublic: true,
    description: 'Contoh gambar aktif untuk sticker dan sablon'
  });
  return nextExamples;
}

async function listLegacyPublishedExampleJobs(env) {
  const exampleSetting = await getAppSetting(env, 'example_jobs');
  const currentExamples = normalizeExampleJobsSetting(exampleSetting?.value);
  const entries = Object.values(currentExamples).filter((entry) => entry?.jobId);
  if (entries.length === 0) return [];

  const jobIds = [...new Set(entries.map((entry) => entry.jobId).filter(Boolean))];
  const jobRows = jobIds.length > 0 ? await listJobsByIds(env, jobIds) : [];
  const jobsById = new Map((jobRows || []).map((job) => [job.id, job]));

  return entries
    .map((entry) => {
      const job = jobsById.get(entry.jobId);
      if (!job) return null;
      if (!hasCompleteExampleArtifacts(job.manifest, job.production_type)) return null;

      const artifacts = getExampleArtifactsFromManifest(job.manifest);
      return {
        jobId: job.id,
        projectName: entry.projectName || artifacts?.projectName || job.project_name,
        productionType: entry.productionType || job.production_type,
        inputMode: entry.inputMode || artifacts?.inputMode || job.input_mode,
        sourcePreviewUrl: entry.sourcePreviewUrl || (artifacts?.sourcePreviewPath ? examplePublicUrl(env, artifacts.sourcePreviewPath) : ''),
        resultPreviewUrl: entry.resultPreviewUrl || entry.imageUrl || artifacts?.files?.fullPng || '',
        files: Object.keys(entry.files || {}).length > 0 ? entry.files : artifacts?.files || {},
        separations: Array.isArray(entry.separations) && entry.separations.length > 0 ? entry.separations : artifacts?.separations || [],
        settings: entry.settings || artifacts?.settings || job.settings || {},
        createdAt: job.created_at,
        updatedAt: entry.updatedAt || artifacts?.updatedAt || job.created_at,
        ownerId: job.user_id,
        isExamplePublic: true
      };
    })
    .filter(Boolean)
    .sort((left, right) => new Date(right.updatedAt || right.createdAt || 0) - new Date(left.updatedAt || left.createdAt || 0));
}

function toExampleFeedJob(env, job) {
  if (!job || job.status !== 'done' || job.is_example_public !== true || jobIsDeleted(job)) return null;
  if (!hasCompleteExampleArtifacts(job.manifest, job.production_type)) return null;

  const artifacts = getExampleArtifactsFromManifest(job.manifest);
  if (!artifacts) return null;

  return {
    jobId: job.id,
    projectName: artifacts.projectName || job.project_name,
    productionType: job.production_type,
    inputMode: artifacts.inputMode || job.input_mode,
    sourcePreviewUrl: artifacts.sourcePreviewPath ? examplePublicUrl(env, artifacts.sourcePreviewPath) : '',
    resultPreviewUrl: artifacts.files?.fullPng || (artifacts.resultPreviewPath ? examplePublicUrl(env, artifacts.resultPreviewPath) : ''),
    files: artifacts.files || {},
    separations: artifacts.separations || [],
    settings: artifacts.settings || job.settings || {},
    createdAt: job.created_at,
    updatedAt: job.example_published_at || artifacts.updatedAt || job.created_at,
    ownerId: job.user_id,
    isExamplePublic: true
  };
}

async function fileToUint8Array(file) {
  return new Uint8Array(await file.arrayBuffer());
}

function requireFormFile(formData, key, message) {
  const file = formData.get(key);
  if (!(file instanceof File)) throw new Error(message);
  return file;
}

function optionalFormFile(formData, key) {
  const file = formData.get(key);
  return file instanceof File ? file : null;
}

function normalizeArtifactManifestInput(value, fallback = {}) {
  const input = value && typeof value === 'object' ? value : {};
  return {
    projectName: typeof input.projectName === 'string' ? input.projectName : fallback.projectName || 'Project Vector',
    productionType: typeof input.productionType === 'string' ? input.productionType : fallback.productionType || 'sticker',
    inputMode: typeof input.inputMode === 'string' ? input.inputMode : fallback.inputMode || 'ready_trace',
    settings: input.settings && typeof input.settings === 'object' ? input.settings : fallback.settings || {},
    aiRedraw: input.aiRedraw && typeof input.aiRedraw === 'object' ? input.aiRedraw : fallback.aiRedraw || null,
    sourceFileName: typeof input.sourceFileName === 'string' ? input.sourceFileName : '',
    createdAt: typeof input.createdAt === 'string' ? input.createdAt : '',
    updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : '',
    separations: Array.isArray(input.separations)
      ? input.separations.map((separation) => ({
          index: separation.index,
          kind: typeof separation.kind === 'string' ? separation.kind : 'color',
          hex: typeof separation.hex === 'string' ? separation.hex : '#000000',
          label: typeof separation.label === 'string' ? separation.label : ''
        }))
      : []
  };
}

function handleHealth(env) {
  const defaultAiRedrawModel = normalizeAiRedrawModelConfig({}, env);
  const redrawAvailability = buildAiRedrawAvailability(defaultAiRedrawModel, env);
  return json({
    ok: true,
    service: 'sablon',
    message: 'Worker API aktif. Gunakan endpoint /api/... dari aplikasi frontend.',
    config: {
      d1Configured: Boolean(env.DB),
      r2Configured: Boolean(env.ASSETS),
      authConfigured: hasEnvValue(env, 'AUTH_JWT_SECRET'),
      aiveneConfigured: redrawAvailability.aiveneConfigured,
      openAiConfigured: redrawAvailability.openAiConfigured,
      midtransConfigured: isMidtransConfigured(env),
      midtransIsProduction: isMidtransProduction(env),
      interactiveQrisConfigured: isInteractiveQrisConfigured(env),
      aiRedrawAvailable: redrawAvailability.aiRedrawAvailable,
      defaultAiRedrawModel,
      redrawPipeline: 'worker_auth_credit_to_aivene_primary_with_openai_fallback'
    },
    endpoints: [
      'GET /api/app-config',
      'POST /api/auth/signup',
      'POST /api/auth/login',
      'POST /api/auth/refresh',
      'POST /api/auth/logout',
      'GET /api/auth/google',
      'GET /api/auth/google/callback',
      'POST /api/auth/signup-bonus',
      'GET /api/assets/example-jobs/*',
      'GET /api/payments/automatic',
      'POST /api/payments/interactive-qris/checkout',
      'POST /api/payments/interactive-qris/webhook',
      'POST /api/payments/midtrans/checkout',
      'GET /api/payments/midtrans',
      'POST /api/payments/midtrans/:orderId/refresh',
      'POST /api/payments/midtrans/webhook',
      'GET /api/me/balance',
      'POST /api/jobs/quote',
      'POST /api/jobs/commit',
      'DELETE /api/jobs/:jobId',
      'POST /api/jobs/:jobId/artifacts',
      'GET /api/example-jobs',
      'GET /api/admin/finance/summary',
      'GET /api/admin/finance/transactions',
      'GET /api/admin/finance/usage',
      'GET /api/admin/finance/export.csv',
      'GET/POST /api/admin/finance/business-entries',
      'GET/POST /api/admin/finance/tax-rules',
      'GET /api/admin/payment-transactions',
      'GET /api/admin/midtrans-payments',
      'POST /api/admin/jobs/:jobId/set-example',
      'POST /api/admin/jobs/:jobId/unset-example',
      'POST /api/image-retouch',
      'POST /api/ai-redraw'
    ]
  });
}

async function getAiRedrawModelConfig(env) {
  try {
    const setting = await getAppSetting(env, 'ai_redraw_model');
    return normalizeAiRedrawModelConfig(setting?.value, env);
  } catch (_error) {
    return normalizeAiRedrawModelConfig({}, env);
  }
}

function withUserEmails(rows, users) {
  const emailById = new Map(users.map((user) => [user.id, user.email]));
  return rows.map((row) => ({
    ...row,
    user_email: emailById.get(row.user_id) || ''
  }));
}

function withCreatedByEmails(rows, users) {
  const emailById = new Map(users.map((user) => [user.id, user.email]));
  return rows.map((row) => ({
    ...row,
    created_by_email: row.created_by ? emailById.get(row.created_by) || '' : ''
  }));
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isProtectedSuperuser(profile) {
  return normalizeEmail(profile?.email) === SUPERUSER_EMAIL;
}

function sanitizeUserPatch(patch = {}, existingProfile) {
  const allowed = {};
  for (const key of ['full_name', 'role', 'is_unlimited', 'is_active', 'deleted_at']) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) allowed[key] = patch[key];
  }
  if (isProtectedSuperuser(existingProfile)) {
    delete allowed.role;
    delete allowed.is_unlimited;
    delete allowed.is_active;
    delete allowed.deleted_at;
  }
  return allowed;
}

function parsePositiveInteger(value, label) {
  const amount = Number.parseInt(String(value || ''), 10);
  if (!Number.isInteger(amount) || amount <= 0) throw new Error(`${label} wajib berupa angka positif.`);
  return amount;
}

function normalizeBusinessFinancePayload(body = {}, createdBy) {
  const entryDate = String(body.entryDate || body.entry_date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) throw new Error('Tanggal entry bisnis wajib diisi dengan format YYYY-MM-DD.');

  const entryType = String(body.entryType || body.entry_type || '').trim();
  if (!BUSINESS_FINANCE_ENTRY_TYPES.includes(entryType)) throw new Error('Jenis entry bisnis tidak valid.');

  const cashDirection = String(body.cashDirection || body.cash_direction || '').trim();
  if (!BUSINESS_FINANCE_CASH_DIRECTIONS.includes(cashDirection)) throw new Error('Arah kas bisnis tidak valid.');

  const taxTreatment = String(body.taxTreatment || body.tax_treatment || 'other').trim();
  if (!BUSINESS_FINANCE_TAX_TREATMENTS.includes(taxTreatment)) throw new Error('Perlakuan pajak bisnis tidak valid.');

  return {
    entry_date: entryDate,
    entry_type: entryType,
    cash_direction: cashDirection,
    amount_idr: parsePositiveInteger(body.amountIdr || body.amount_idr, 'Nominal entry bisnis'),
    counterparty: String(body.counterparty || '').trim() || null,
    document_ref: String(body.documentRef || body.document_ref || '').trim() || null,
    note: String(body.note || '').trim() || null,
    tax_treatment: taxTreatment,
    created_by: createdBy || null
  };
}

function normalizeTaxRulePayload(body = {}) {
  const effectiveFrom = String(body.effectiveFrom || body.effective_from || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) throw new Error('Tanggal mulai aturan pajak wajib diisi dengan format YYYY-MM-DD.');

  const effectiveTo = String(body.effectiveTo || body.effective_to || '').trim();
  if (effectiveTo && !/^\d{4}-\d{2}-\d{2}$/.test(effectiveTo)) throw new Error('Tanggal akhir aturan pajak harus berformat YYYY-MM-DD.');
  if (effectiveTo && effectiveTo < effectiveFrom) throw new Error('Tanggal akhir aturan pajak tidak boleh lebih kecil dari tanggal mulai.');

  const ratePercent = Number.parseFloat(String(body.ratePercent ?? body.rate_percent ?? '0'));
  if (!Number.isFinite(ratePercent) || ratePercent < 0) throw new Error('Tarif pajak wajib berupa angka nol atau lebih.');

  const payload = {
    tax_code: String(body.taxCode || body.tax_code || DEFAULT_TAX_CODE).trim() || DEFAULT_TAX_CODE,
    rate_percent: ratePercent,
    effective_from: effectiveFrom,
    effective_to: effectiveTo || null,
    note: String(body.note || '').trim() || null
  };

  if (body.id) payload.id = String(body.id);
  return payload;
}

async function loadAdminFinanceData(env, range) {
  const normalizedRange = normalizeFinanceRange(range);
  const timestampRange = {
    from: `${normalizedRange.from}T00:00:00.000Z`,
    toExclusive: `${nextDateOnly(normalizedRange.to)}T00:00:00.000Z`
  };
  const [users, manualPayments, gatewayPayments, ledgerEntries, businessEntries, jobs, taxRules] = await Promise.all([
    listProfileEmails(env),
    listFinanceManualPaymentsRows(env, timestampRange),
    listFinanceGatewayPaymentsRows(env, timestampRange),
    listFinanceLedgerRows(env, timestampRange),
    listBusinessFinanceEntriesRows(env, normalizedRange),
    listFinanceJobsRows(env, timestampRange),
    listTaxRulesRows(env)
  ]);

  const paymentsWithEmail = withUserEmails(manualPayments, users);
  const gatewayWithEmail = withUserEmails(gatewayPayments, users);
  const ledgerWithEmail = withCreatedByEmails(withUserEmails(ledgerEntries, users), users);
  const businessWithEmail = withCreatedByEmails(businessEntries, users);
  const jobsWithEmail = withUserEmails(jobs, users);

  return {
    range: normalizedRange,
    users,
    manualPayments: paymentsWithEmail,
    gatewayPayments: gatewayWithEmail,
    ledgerEntries: ledgerWithEmail,
    businessEntries: businessWithEmail,
    jobs: jobsWithEmail,
    taxRules
  };
}

function buildAdminFinanceTransactionsPayload(dataset, filters = {}) {
  const transactions = [
    ...dataset.manualPayments.map((entry) => normalizeManualPaymentTransaction(entry)),
    ...dataset.gatewayPayments.filter((entry) => isSuccessfulGatewayPayment(entry)).map((entry) => normalizeGatewayPaymentTransaction(entry)),
    ...dataset.ledgerEntries.map((entry) => normalizeLedgerTransaction(entry, entry.user_email, entry.created_by_email)),
    ...dataset.businessEntries.map((entry) => normalizeBusinessLedgerTransaction(entry, entry.created_by_email))
  ].sort((left, right) => new Date(right.occurredAt || 0) - new Date(left.occurredAt || 0));

  const filtered = filterFinanceTransactions(transactions, filters);
  const sourceFilter = String(filters.source || '').trim().toLowerCase();
  const categoryFilter = String(filters.category || '').trim().toLowerCase();
  if (sourceFilter === 'jobs' || categoryFilter === 'usage_value') {
    return filterFinanceTransactions(
      dataset.jobs.map((entry) => normalizeJobUsageTransaction(entry)),
      filters
    ).sort((left, right) => new Date(right.occurredAt || 0) - new Date(left.occurredAt || 0));
  }
  return filtered;
}

async function getUser(env, request) {
  const token = bearerToken(request);
  if (!token) throw new Error('Login dibutuhkan.');
  const payload = await verifyAccessToken(env, token);
  if (!payload?.sub) throw new Error('Session tidak valid.');
  return { token, user: { id: payload.sub, email: payload.email, user_metadata: {} } };
}

async function requireUser(env, request) {
  const auth = await getUser(env, request);
  const profile = (await getProfile(env, auth.user.id)) || buildFallbackProfile(auth.user);
  return { ...auth, profile };
}

async function requireAdmin(env, request) {
  const auth = await requireUser(env, request);
  if (!isSuperuserProfile(auth.profile, auth.user.email)) {
    throw new Error('Akses admin ditolak.');
  }
  return auth;
}

async function ensureSignupBonusLedger(env, claim) {
  if (!claim?.id || claim?.bonus_granted !== true) return null;
  const existing = await findLedgerByReference(env, claim.id, SIGNUP_BONUS_REASON);
  if (existing?.id) return existing;
  return insertLedger(env, {
    userId: claim.user_id,
    amountIdr: SIGNUP_BONUS_AMOUNT_IDR,
    kind: 'credit',
    reason: SIGNUP_BONUS_REASON,
    referenceId: claim.id,
    createdBy: claim.user_id,
    metadata: {
      source: 'signup_bonus_device_or_ip_guard',
      freeCredits: 1,
      unitPriceIdr: SIGNUP_BONUS_AMOUNT_IDR,
      deviceIdHash: claim.device_id_hash || '',
      ipHash: claim.ip_hash || ''
    }
  });
}

async function fetchMidtrans(env, path, { method = 'GET', body } = {}) {
  const response = await fetch(`${path.startsWith('/snap/') ? midtransSnapBaseUrl(env) : midtransApiBaseUrl(env)}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      Authorization: buildMidtransAuthHeader(env),
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await parseJsonResponse(response);
  if (!response.ok) {
    const messages = Array.isArray(data?.error_messages) ? data.error_messages.join(' ') : data?.status_message || data?.message || 'Midtrans request gagal.';
    throw new Error(messages);
  }
  return data || {};
}

async function createMidtransSnapTransaction(env, payload) {
  return fetchMidtrans(env, '/snap/v1/transactions', {
    method: 'POST',
    body: payload
  });
}

async function getMidtransTransactionStatus(env, orderId) {
  return fetchMidtrans(env, `/v2/${encodeURIComponent(orderId)}/status`);
}

async function ensureMidtransCreditLedger(env, payment, snapshot, createdBy) {
  if (payment.credited_ledger_id) return payment.credited_ledger_id;

  const existingLedger = await findLedgerByReference(env, payment.id, MIDTRANS_PAYMENT_REASON);
  if (existingLedger?.id) return existingLedger.id;

  try {
    const ledger = await insertLedger(env, {
      userId: payment.user_id,
      amountIdr: Number(payment.amount_idr) || snapshot.grossAmount,
      kind: 'credit',
      reason: MIDTRANS_PAYMENT_REASON,
      referenceId: payment.id,
      createdBy: createdBy || payment.user_id,
      metadata: {
        provider: MIDTRANS_PROVIDER,
        orderId: payment.order_id,
        externalTransactionId: snapshot.externalTransactionId,
        paymentType: snapshot.paymentType,
        transactionStatus: snapshot.status,
        fraudStatus: snapshot.fraudStatus,
        amountIdr: Number(payment.amount_idr) || snapshot.grossAmount
      }
    });
    return ledger?.id || null;
  } catch (error) {
    if (!isDuplicateConstraintError(error)) throw error;
    const duplicateLedger = await findLedgerByReference(env, payment.id, MIDTRANS_PAYMENT_REASON);
    if (duplicateLedger?.id) return duplicateLedger.id;
    throw error;
  }
}

export async function syncMidtransPaymentTransaction(env, payment, sourceData, { createdBy } = {}) {
  const snapshot = mapMidtransTransactionState(sourceData);
  const patch = {
    external_transaction_id: snapshot.externalTransactionId || payment.external_transaction_id || null,
    status: snapshot.status,
    payment_type: snapshot.paymentType || payment.payment_type || null,
    raw_notification: sourceData || {},
    paid_at: snapshot.paidAt || payment.paid_at || null,
    expired_at: snapshot.expiredAt || payment.expired_at || null
  };

  if (snapshot.creditEligible && !payment.credited_ledger_id) {
    const ledgerId = await ensureMidtransCreditLedger(env, payment, snapshot, createdBy);
    if (ledgerId) patch.credited_ledger_id = ledgerId;
  }

  return updatePaymentTransactionById(env, payment.id, patch);
}

async function ensureInteractiveQrisCreditLedger(env, payment, sourceData, createdBy) {
  if (payment.credited_ledger_id) return payment.credited_ledger_id;

  const existingLedger = await findLedgerByReference(env, payment.id, INTERACTIVE_QRIS_PAYMENT_REASON);
  if (existingLedger?.id) return existingLedger.id;

  try {
    const ledger = await insertLedger(env, {
      userId: payment.user_id,
      amountIdr: Number(payment.amount_idr) || Number(payment.base_amount_idr) || 0,
      kind: 'credit',
      reason: INTERACTIVE_QRIS_PAYMENT_REASON,
      referenceId: payment.id,
      createdBy: createdBy || payment.user_id,
      metadata: {
        provider: INTERACTIVE_QRIS_PROVIDER,
        orderId: payment.order_id,
        paymentType: payment.payment_type || INTERACTIVE_QRIS_PAYMENT_TYPE,
        amountIdr: Number(payment.amount_idr) || 0,
        baseAmountIdr: Number(payment.base_amount_idr) || Number(payment.amount_idr) || 0,
        uniqueCode: payment.unique_code || null,
        packageName: String(sourceData?.packageName || ''),
        title: String(sourceData?.title || ''),
        text: String(sourceData?.text || ''),
        postedAt: sourceData?.postedAt || null
      }
    });
    return ledger?.id || null;
  } catch (error) {
    if (!isDuplicateConstraintError(error)) throw error;
    const duplicateLedger = await findLedgerByReference(env, payment.id, INTERACTIVE_QRIS_PAYMENT_REASON);
    if (duplicateLedger?.id) return duplicateLedger.id;
    throw error;
  }
}

export async function syncInteractiveQrisPaymentTransaction(env, payment, sourceData, { createdBy, paidAt } = {}) {
  const patch = {
    status: 'settlement',
    payment_type: payment.payment_type || INTERACTIVE_QRIS_PAYMENT_TYPE,
    raw_notification: sourceData || {},
    paid_at: normalizeIsoDateOrNow(paidAt || sourceData?.postedAt || payment.paid_at)
  };

  if (!payment.credited_ledger_id) {
    const ledgerId = await ensureInteractiveQrisCreditLedger(env, payment, sourceData, createdBy);
    if (ledgerId) patch.credited_ledger_id = ledgerId;
  }

  return updatePaymentTransactionById(env, payment.id, patch);
}

async function validateAiLedgerForCommit(env, { userId, ledgerId, expectedAmountIdr }) {
  if (!ledgerId) throw new Error('AI Redraw belum terdebit. Silakan proses ulang dari tombol upload.');
  const ledger = await getLedgerById(env, ledgerId);
  if (
    !ledger ||
    ledger.user_id !== userId ||
    ledger.kind !== 'debit' ||
    ledger.reason !== 'ai_redraw' ||
    Number(ledger.amount_idr) !== -Math.abs(Number(expectedAmountIdr) || 0)
  ) {
    throw new Error('AI Redraw belum terdebit. Silakan proses ulang dari tombol upload.');
  }

  const refund = await findLedgerByReference(env, ledgerId, 'ai_redraw_refund');
  if (refund?.id) throw new Error('AI Redraw sudah direfund. Silakan proses ulang dari tombol upload.');

  const usedJob = await findJobByAiLedgerId(env, ledgerId);
  if (usedJob?.id) throw new Error('AI Redraw sudah pernah dicatat. Silakan proses ulang dari tombol upload.');

  return ledger;
}

async function ensureCredit(env, profile, priceIdr) {
  if (profile.is_unlimited) return { isUnlimited: true, balance: null };
  const balance = await creditBalance(env, profile.id);
  if (balance < priceIdr) throw new Error(`Saldo kurang. Dibutuhkan Rp${priceIdr}, saldo Rp${balance}.`);
  return { isUnlimited: false, balance };
}

async function handleBalance(env, request) {
  const { user, profile } = await requireUser(env, request);
  const balance = profile.is_unlimited ? null : await creditBalance(env, profile.id);
  return json({ profile, balance, isUnlimited: profile.is_unlimited, userId: user.id, profileFallback: profile.role === 'user' && !profile.full_name && profile.created_at ? true : false });
}

async function handleQuote(env, request) {
  const { profile } = await requireUser(env, request);
  const body = await readJson(request);
  const pricing = await getPricing(env, DEFAULT_PRICING);
  const priceIdr = calculateDynamicJobPrice(body, pricing);
  const balance = profile.is_unlimited ? null : await creditBalance(env, profile.id);
  return json({ priceIdr, balance, isUnlimited: profile.is_unlimited, canRun: profile.is_unlimited || balance >= priceIdr });
}

async function handleCommitJob(env, request) {
  const { user, profile } = await requireUser(env, request);
  const body = await readJson(request);
  const pricing = await getPricing(env, DEFAULT_PRICING);
  const priceIdr = calculateDynamicJobPrice({
    inputMode: body.inputMode,
    separationFilmCount: body.separationFilmCount,
    aiAlreadyCharged: body.inputMode === 'ai_redraw'
  }, pricing);
  await ensureCredit(env, profile, priceIdr);
  if (body.inputMode === 'ai_redraw' && !profile.is_unlimited) {
    await validateAiLedgerForCommit(env, {
      userId: user.id,
      ledgerId: body.aiLedgerId,
      expectedAmountIdr: pricing.ai_redraw
    });
  }

  const job = await createJob(env, {
    user_id: user.id,
    project_name: body.projectName || 'Project Vector',
    input_mode: body.inputMode,
    production_type: body.productionType,
    status: 'done',
    price_idr: (body.inputMode === 'ai_redraw' ? pricing.ai_redraw : 0) + priceIdr,
    separation_film_count: Number(body.separationFilmCount) || 0,
    settings: body.settings || {},
    manifest: body.manifest || {},
    ai_ledger_id: body.aiLedgerId || null
  });

  if (!profile.is_unlimited && priceIdr > 0) {
    await insertLedger(env, {
      userId: user.id,
      amountIdr: -priceIdr,
      kind: 'debit',
      reason: 'job_commit',
      referenceId: job.id,
      metadata: { inputMode: body.inputMode, separationFilmCount: body.separationFilmCount }
    });
  }

  return json({ job, chargedIdr: priceIdr, isUnlimited: profile.is_unlimited });
}

async function handleAiRedraw(env, request) {
  const { user, profile } = await requireUser(env, request);
  const aiModelConfig = await getAiRedrawModelConfig(env);
  const availability = buildAiRedrawAvailability(aiModelConfig, env);
  if (!availability.aiRedrawAvailable) {
    throw new Error('AI redraw belum diaktifkan di deploy ini. Isi secret AIVENE_API_KEY atau OPENAI_API_KEY di Worker.');
  }
  const pricing = await getPricing(env, DEFAULT_PRICING);
  await ensureCredit(env, profile, pricing.ai_redraw);
  const form = await request.formData();
  const image = form.get('image');
  let settings = {};
  try {
    settings = JSON.parse(String(form.get('settings') || '{}'));
  } catch (_error) {
    throw new Error('Settings AI redraw tidak valid.');
  }
  if (!(image instanceof File)) throw new Error('File gambar wajib diisi.');
  const maxImageBytes = aiRedrawMaxImageInputBytes(aiModelConfig, env);
  if (image.size > maxImageBytes) {
    throw new Error(`Ukuran gambar terlalu besar untuk AI redraw. Maksimal ${maxImageBytes} byte.`);
  }

  let ledger = null;
  if (!profile.is_unlimited) {
    ledger = await insertLedger(env, {
      userId: user.id,
      amountIdr: -pricing.ai_redraw,
      kind: 'debit',
      reason: 'ai_redraw',
      metadata: { inputMode: settings.inputMode, productionType: settings.productionType }
    });
  }

  try {
    const upstream = await requestAiRetouchedImage(env, image, settings, aiModelConfig);
    const aiRawPng = new Uint8Array(await new Response(upstream.body).arrayBuffer());
    const responseHeaders = {
      'X-AI-Ledger-Id': ledger?.id || '',
      'X-AI-Redraw-Metadata': encodeBase64UrlJson(upstream.metadata || {})
    };
    return json(buildAiRawPngArtifactResponse(aiRawPng, upstream.metadata || {}, ledger?.id || ''), 200, responseHeaders);
  } catch (error) {
    if (ledger?.id) {
      await insertLedger(env, {
        userId: user.id,
        amountIdr: pricing.ai_redraw,
        kind: 'credit',
        reason: 'ai_redraw_refund',
        referenceId: ledger.id,
        metadata: {
          inputMode: settings.inputMode,
          productionType: settings.productionType,
          refundedLedgerId: ledger.id
        }
      });
    }
    throw error;
  }
}

function buildAiRedrawMetadata(aiModelConfig, image, extra = {}) {
  return {
    provider: extra.providerUsed || '',
    providerUsed: extra.providerUsed || '',
    primaryProvider: aiModelConfig.primaryProvider,
    fallbackProvider: aiModelConfig.fallbackProvider || '',
    fallbackAttempted: extra.fallbackAttempted === true,
    fallbackReason: extra.fallbackReason || '',
    model: extra.model || '',
    aiveneImageModel: aiModelConfig.aiveneImageModel || '',
    openAiImageModel: aiModelConfig.openAiImageModel || '',
    promptProfile: aiModelConfig.promptProfile,
    imageSize: aiModelConfig.imageSize,
    generationQuality: aiModelConfig.generationQuality,
    inputMaxEdge: aiModelConfig.inputMaxEdge || 1080,
    reasoningEffort: aiModelConfig.reasoningEffort || '',
    backgroundMode: aiModelConfig.backgroundMode || '',
    preset: aiModelConfig.preset || aiModelConfig.mode || '',
    preprocess: aiModelConfig.preprocess || '',
    persistPrompt: aiModelConfig.persistPrompt !== false,
    safetyEnabled: aiModelConfig.safetyEnabled !== false,
    sourceContentType: image.type || 'application/octet-stream',
    sourceFileName: image.name || 'upload.png',
    ...extra,
    finalTechnicalPrompt: aiModelConfig.persistPrompt === false ? '' : extra.finalTechnicalPrompt || ''
  };
}

export async function requestAiRetouchedImage(env, image, settings, aiModelConfig) {
  const primaryProvider = aiModelConfig.primaryProvider;
  const fallbackProvider = aiModelConfig.fallbackProvider || '';
  const primaryConfigured = isProviderConfigured(primaryProvider, env);
  const fallbackConfigured = fallbackProvider && isProviderConfigured(fallbackProvider, env);

  if (primaryConfigured) {
    try {
      return await requestProviderRetouchedImage(env, image, settings, aiModelConfig, {
        provider: primaryProvider,
        fallbackAttempted: false,
        fallbackReason: ''
      });
    } catch (error) {
      if (fallbackConfigured && fallbackProvider !== primaryProvider && shouldFallbackToSecondaryProvider(error)) {
        try {
          return await requestProviderRetouchedImage(env, image, settings, aiModelConfig, {
            provider: fallbackProvider,
            fallbackAttempted: true,
            fallbackReason: error.fallbackReason || 'primary_failed'
          });
        } catch (fallbackError) {
          const primaryName = providerDisplayName(primaryProvider);
          const fallbackName = providerDisplayName(fallbackProvider);
          throw createProviderError(
            fallbackError?.provider || fallbackProvider,
            `${primaryName} gagal memproses image edit. ${fallbackName} fallback juga gagal: ${normalizeProviderMessage(
              fallbackError?.message,
              'provider tidak tersedia.'
            )}`,
            {
              statusCode: fallbackError?.statusCode || 502,
              providerCode: fallbackError?.providerCode || '',
              fallbackReason: fallbackError?.fallbackReason || '',
              responseData: {
                primary: {
                  provider: error?.provider || primaryProvider,
                  statusCode: error?.statusCode || 502,
                  providerCode: error?.providerCode || '',
                  fallbackReason: error?.fallbackReason || 'primary_failed'
                },
                fallback: fallbackError?.responseData || null
              }
            }
          );
        }
      }
      throw error;
    }
  }

  if (fallbackConfigured) {
    return requestProviderRetouchedImage(env, image, settings, aiModelConfig, {
      provider: fallbackProvider,
      fallbackAttempted: true,
      fallbackReason: 'primary_not_configured'
    });
  }

  throw new Error('AI redraw belum memiliki provider yang aktif di deploy ini.');
}

async function requestProviderRetouchedImage(env, image, settings, aiModelConfig, routing) {
  if (routing.provider === AIVENE_IMAGE_REDRAW_PROVIDER) {
    return requestAiveneRetouchedImage(env, image, settings, aiModelConfig, routing);
  }
  if (routing.provider === OPENAI_IMAGE_REDRAW_PROVIDER) {
    return requestOpenAiRetouchedImage(env, image, settings, aiModelConfig, routing);
  }
  throw new Error(`Provider AI redraw tidak didukung: ${routing.provider}`);
}

function resolveCompatibleImageModel(provider, aiModelConfig = {}) {
  if (provider === AIVENE_IMAGE_REDRAW_PROVIDER) {
    return aiModelConfig.aiveneImageModel || aiModelConfig.openAiImageModel || 'gpt-image-2';
  }
  return aiModelConfig.openAiImageModel || aiModelConfig.aiveneImageModel || 'gpt-image-2';
}

function buildCompatibleImageForm({ model, image, prompt, imageQuality, imageSize }) {
  const form = new FormData();
  form.append('model', model);
  form.append('image[]', image, image.name || 'source-image.png');
  form.append('prompt', prompt);
  form.append('quality', imageQuality);
  form.append('size', imageSize);
  form.append('output_format', 'png');
  return form;
}

async function requestCompatibleRetouchedImage(env, image, settings, aiModelConfig, routing, options) {
  const { provider, providerName, baseUrl, headers, mapError, model } = options;
  const prompt = buildAiRedrawPrompt(settings, aiModelConfig);
  const imageQuality = resolveOpenAiImageQuality(aiModelConfig);
  const imageSize = resolveOpenAiImageSize(aiModelConfig, settings);
  let response;
  try {
    const form = buildCompatibleImageForm({ model, image, prompt, imageQuality, imageSize });
    response = await fetch(`${baseUrl}/images/edits`, {
      method: 'POST',
      headers,
      body: form
    });
  } catch (error) {
    throw createProviderError(provider, `${providerName} tidak dapat dihubungi.`, {
      statusCode: 502,
      responseData: { cause: error instanceof Error ? error.message : String(error || '') },
      fallbackReason: 'upstream_unavailable'
    });
  }

  const data = await parseJsonResponse(response);

  if (!response.ok) {
    throw mapError(response, data);
  }

  const imageUrl = extractCompatibleImageUrl(data);
  if (!imageUrl) {
    throw createProviderError(provider, `${providerName} tidak mengembalikan gambar.`, {
      statusCode: 502,
      responseData: data
    });
  }

  const imageResponse = await downloadGeneratedImage(imageUrl);

  return {
    body: imageResponse.body,
    status: imageResponse.status,
    statusText: imageResponse.statusText,
    headers: imageResponse.headers,
    metadata: buildAiRedrawMetadata(aiModelConfig, image, {
      providerUsed: provider,
      model,
      generationQuality: imageQuality,
      imageSize,
      outputFormat: 'png',
      sourceDimensions: settings?.aiInput?.sourceDimensions || null,
      sourceBytes: Number(settings?.aiInput?.sourceBytes) || image.size,
      preparedDimensions: settings?.aiInput?.preparedDimensions || null,
      preparedBytes: image.size,
      preparedFormat: image.type || 'application/octet-stream',
      revisedPrompt: data?.data?.[0]?.revised_prompt || '',
      fallbackAttempted: routing.fallbackAttempted,
      fallbackReason: routing.fallbackReason,
      finalTechnicalPrompt: prompt
    })
  };
}

async function requestAiveneRetouchedImage(env, image, settings, aiModelConfig, routing) {
  return requestCompatibleRetouchedImage(env, image, settings, aiModelConfig, routing, {
    provider: AIVENE_IMAGE_REDRAW_PROVIDER,
    providerName: 'AIVene',
    baseUrl: aiveneBaseUrl(env),
    headers: buildAiveneHeaders(env),
    mapError: mapAiveneError,
    model: resolveCompatibleImageModel(AIVENE_IMAGE_REDRAW_PROVIDER, aiModelConfig)
  });
}

async function requestOpenAiRetouchedImage(env, image, settings, aiModelConfig, routing) {
  return requestCompatibleRetouchedImage(env, image, settings, aiModelConfig, routing, {
    provider: OPENAI_IMAGE_REDRAW_PROVIDER,
    providerName: 'OpenAI',
    baseUrl: openAiBaseUrl(env),
    headers: buildOpenAiHeaders(env),
    mapError: mapOpenAiError,
    model: resolveCompatibleImageModel(OPENAI_IMAGE_REDRAW_PROVIDER, aiModelConfig)
  });
}

export function resolveOpenAiImageSize(aiModelConfig = {}, settings = {}) {
  if (String(aiModelConfig.imageSize || '1K').toUpperCase() !== '1K') return 'auto';
  const width = Number(settings?.aiInput?.preparedDimensions?.width);
  const height = Number(settings?.aiInput?.preparedDimensions?.height);
  if (!(width > 0 && height > 0)) return '1024x1024';
  const ratio = width / height;
  if (ratio > 1.15) return '1536x1024';
  if (ratio < 1 / 1.15) return '1024x1536';
  return '1024x1024';
}

function resolveOpenAiImageQuality(aiModelConfig = {}) {
  const requestedQuality = String(aiModelConfig.generationQuality || '').trim().toLowerCase();
  if (requestedQuality === 'standard') return 'medium';
  if (requestedQuality === 'low' || requestedQuality === 'medium' || requestedQuality === 'high') return requestedQuality;
  return 'medium';
}

export function getAiRedrawModelPresets() {
  return Object.fromEntries(Object.entries(HYBRID_REDRAW_PRESETS).map(([key, preset]) => [key, { ...preset }]));
}

async function handleJobArtifactsUpload(env, request, jobId) {
  const { user, profile } = await requireUser(env, request);
  if (!isSuperuserProfile(profile, user.email)) {
    throw new Error('Hanya superadmin yang boleh mengunggah artefak contoh.');
  }

  const job = await getJobById(env, jobId);
  if (!job) throw new Error('Job tidak ditemukan.');
  if (jobIsDeleted(job)) throw new Error('Job ini sudah dihapus.');
  if (job.user_id !== user.id) throw new Error('Hanya job milik Anda sendiri yang boleh dijadikan contoh.');
  if (job.status !== 'done') throw new Error('Artefak contoh hanya boleh diunggah untuk job yang sudah selesai.');

  const form = await request.formData();
  const manifestInput = normalizeArtifactManifestInput(JSON.parse(String(form.get('manifest') || '{}')), {
    projectName: job.project_name,
    productionType: job.production_type,
    inputMode: job.input_mode,
    settings: job.settings || {}
  });
  const manifest = {
    ...manifestInput,
    projectName: manifestInput.projectName || job.project_name,
    productionType: job.production_type,
    inputMode: job.input_mode,
    settings: manifestInput.settings || job.settings || {},
    aiRedraw: manifestInput.aiRedraw || job.manifest?.aiRedraw || null
  };

  const sourcePreview = requireFormFile(form, 'sourcePreview', 'Preview gambar awal wajib diunggah.');
  const fullPng = requireFormFile(form, 'fullPng', 'Preview hasil PNG wajib diunggah.');
  const fullSvg = requireFormFile(form, 'fullSvg', 'File SVG full color wajib diunggah.');
  const fullPdf = requireFormFile(form, 'fullPdf', 'File PDF full color wajib diunggah.');
  const zip = requireFormFile(form, 'zip', 'ZIP hasil lengkap wajib diunggah.');
  const separationZip = optionalFormFile(form, 'separationZip');
  const stickerCutlineSvg = optionalFormFile(form, 'stickerCutlineSvg');
  const stickerCutlinePdf = optionalFormFile(form, 'stickerCutlinePdf');

  const separationSvgs = form.getAll('separationSvg').filter((file) => file instanceof File);
  const separationPdfs = form.getAll('separationPdf').filter((file) => file instanceof File);
  const separationPreviews = form.getAll('separationPreview').filter((file) => file instanceof File);

  if (manifest.productionType === 'sablon') {
    if (!(separationZip instanceof File)) throw new Error('ZIP film sablon wajib diunggah untuk contoh sablon.');
    if (manifest.separations.length === 0) throw new Error('Contoh sablon wajib memiliki daftar film.');
  }

  if (manifest.separations.length > 0) {
    if (separationSvgs.length !== manifest.separations.length || separationPdfs.length !== manifest.separations.length || separationPreviews.length !== manifest.separations.length) {
      throw new Error('Jumlah file film contoh tidak cocok dengan manifest.');
    }
  }

  const sourcePreviewPath = exampleJobPath(job.id, 'source-preview.png');
  const resultPreviewPath = exampleJobPath(job.id, 'preview-full-color.png');
  const fullSvgPath = exampleJobPath(job.id, 'full-vector.svg');
  const fullPdfPath = exampleJobPath(job.id, 'full-vector.pdf');
  const stickerCutlineSvgPath = stickerCutlineSvg ? exampleJobPath(job.id, 'sticker-cutline.svg') : '';
  const stickerCutlinePdfPath = stickerCutlinePdf ? exampleJobPath(job.id, 'sticker-cutline.pdf') : '';
  const zipPath = exampleJobPath(job.id, 'result.zip');
  const separationZipPath = separationZip ? exampleJobPath(job.id, 'separation-films.zip') : '';
  const manifestPath = exampleJobPath(job.id, 'manifest.json');

  await putObject(env, EXAMPLE_JOBS_BUCKET, sourcePreviewPath, await fileToUint8Array(sourcePreview), sourcePreview.type || 'image/png');
  await putObject(env, EXAMPLE_JOBS_BUCKET, resultPreviewPath, await fileToUint8Array(fullPng), fullPng.type || 'image/png');
  await putObject(env, EXAMPLE_JOBS_BUCKET, fullSvgPath, await fileToUint8Array(fullSvg), fullSvg.type || 'image/svg+xml');
  await putObject(env, EXAMPLE_JOBS_BUCKET, fullPdfPath, await fileToUint8Array(fullPdf), fullPdf.type || 'application/pdf');
  await putObject(env, EXAMPLE_JOBS_BUCKET, zipPath, await fileToUint8Array(zip), zip.type || 'application/zip');

  if (stickerCutlineSvgPath) {
    await putObject(env, EXAMPLE_JOBS_BUCKET, stickerCutlineSvgPath, await fileToUint8Array(stickerCutlineSvg), stickerCutlineSvg.type || 'image/svg+xml');
  }
  if (stickerCutlinePdfPath) {
    await putObject(env, EXAMPLE_JOBS_BUCKET, stickerCutlinePdfPath, await fileToUint8Array(stickerCutlinePdf), stickerCutlinePdf.type || 'application/pdf');
  }
  if (separationZipPath) {
    await putObject(env, EXAMPLE_JOBS_BUCKET, separationZipPath, await fileToUint8Array(separationZip), separationZip.type || 'application/zip');
  }

  const uploadedSeparations = [];
  for (let index = 0; index < manifest.separations.length; index += 1) {
    const separation = manifest.separations[index];
    const slug = separation.kind === 'underbase' ? 'underbase' : `color-${String(separation.index).padStart(2, '0')}`;
    const svgPath = exampleJobPath(job.id, `separations/film-${slug}.svg`);
    const pdfPath = exampleJobPath(job.id, `separations/film-${slug}.pdf`);
    const previewPath = exampleJobPath(job.id, `separations/film-${slug}-preview.png`);

    await putObject(env, EXAMPLE_JOBS_BUCKET, svgPath, await fileToUint8Array(separationSvgs[index]), separationSvgs[index].type || 'image/svg+xml');
    await putObject(env, EXAMPLE_JOBS_BUCKET, pdfPath, await fileToUint8Array(separationPdfs[index]), separationPdfs[index].type || 'application/pdf');
    await putObject(env, EXAMPLE_JOBS_BUCKET, previewPath, await fileToUint8Array(separationPreviews[index]), separationPreviews[index].type || 'image/png');

    uploadedSeparations.push({
      index: separation.index,
      kind: separation.kind || 'color',
      hex: separation.hex || '#000000',
      label: separation.label || '',
      svg: examplePublicUrl(env, svgPath),
      pdf: examplePublicUrl(env, pdfPath),
      preview: examplePublicUrl(env, previewPath),
      previewPng: examplePublicUrl(env, previewPath)
    });
  }

  const exampleArtifacts = {
    version: 1,
    projectName: manifest.projectName,
    productionType: manifest.productionType,
    inputMode: manifest.inputMode,
    settings: manifest.settings || {},
    aiRedraw: manifest.aiRedraw || null,
    sourcePreviewPath,
    resultPreviewPath,
    manifestPath,
    files: {
      fullPng: examplePublicUrl(env, resultPreviewPath),
      fullSvg: examplePublicUrl(env, fullSvgPath),
      fullPdf: examplePublicUrl(env, fullPdfPath),
      stickerCutlineSvg: stickerCutlineSvgPath ? examplePublicUrl(env, stickerCutlineSvgPath) : '',
      stickerCutlinePdf: stickerCutlinePdfPath ? examplePublicUrl(env, stickerCutlinePdfPath) : '',
      zip: examplePublicUrl(env, zipPath),
      separationZip: separationZipPath ? examplePublicUrl(env, separationZipPath) : ''
    },
    separations: uploadedSeparations,
    updatedAt: new Date().toISOString()
  };

  await putObject(
    env,
    EXAMPLE_JOBS_BUCKET,
    manifestPath,
    new TextEncoder().encode(
      JSON.stringify(
        {
          ...manifest,
          sourcePreviewUrl: examplePublicUrl(env, sourcePreviewPath),
          resultPreviewUrl: examplePublicUrl(env, resultPreviewPath),
          files: exampleArtifacts.files,
          separations: uploadedSeparations
        },
        null,
        2
      )
    ),
    'application/json'
  );

  const nextManifest = {
    ...(job.manifest || {}),
    exampleArtifacts
  };
  const updatedJob = await updateJob(env, job.id, { manifest: nextManifest });

  return json({
    jobId: job.id,
    exampleArtifacts,
    job: updatedJob || { ...job, manifest: nextManifest }
  });
}

async function handleAdminUsers(env, request) {
  const admin = await requireAdmin(env, request);
  if (request.method === 'GET') {
    return json({ users: await listProfilesWithBalance(env) });
  }

  const body = await readJson(request);
  if (body.action === 'create') {
    const email = normalizeEmail(body.email);
    const password = String(body.password || '');
    const fullName = String(body.fullName || '').trim();
    const initialCreditIdr = Math.max(0, Number.parseInt(body.initialCreditIdr, 10) || 0);

    if (!email || !email.includes('@')) throw new Error('Email user baru tidak valid.');
    if (password.length < MIN_PASSWORD_LENGTH) throw new Error('Password minimal 6 karakter.');

    const existing = await getAuthProfileByEmail(env, email);
    if (existing) throw new Error('Email sudah terdaftar.');

    const salt = generateSaltHex();
    const passwordHash = await hashPasswordHex(password, salt);
    const isSuperuser = email === SUPERUSER_EMAIL;
    let profile;
    try {
      profile = await createProfile(env, {
        id: crypto.randomUUID(),
        email,
        fullName: fullName || email.split('@')[0],
        role: isSuperuser ? 'superuser' : 'user',
        isUnlimited: isSuperuser,
        passwordHash,
        salt,
        authProvider: 'password'
      });
    } catch (createError) {
      if (isDuplicateConstraintError(createError)) throw new Error('Email sudah terdaftar.');
      throw createError;
    }

    const patch = sanitizeUserPatch(
      {
        full_name: fullName || profile.full_name,
        role: body.role || 'user',
        is_unlimited: body.isUnlimited === true,
        is_active: body.isActive !== false,
        deleted_at: body.isActive === false ? new Date().toISOString() : null
      },
      profile
    );

    let updatedProfile = profile;
    if (Object.keys(patch).length > 0) {
      updatedProfile = (await updateProfile(env, profile.id, patch)) || profile;
    }

    if (initialCreditIdr > 0 && !updatedProfile.is_unlimited) {
      await insertLedger(env, {
        userId: updatedProfile.id,
        amountIdr: initialCreditIdr,
        kind: 'credit',
        reason: 'admin_user_creation_credit',
        createdBy: admin.user.id,
        metadata: { source: 'admin_create_user' }
      });
    }

    return json({
      user: {
        ...updatedProfile,
        balance: updatedProfile.is_unlimited ? null : await creditBalance(env, updatedProfile.id)
      }
    });
  }

  if (!body.userId) throw new Error('User ID wajib diisi.');
  const existingProfile = await getProfileRaw(env, body.userId);
  if (!existingProfile) throw new Error('User tidak ditemukan.');

  if (body.action === 'delete') {
    if (body.userId === admin.user.id) throw new Error('Akun yang sedang dipakai tidak bisa dihapus.');
    if (isProtectedSuperuser(existingProfile)) throw new Error('Akun whitelist utama tidak bisa dihapus.');
    await deleteUserCascade(env, body.userId);
    return json({ deleted: true, userId: body.userId });
  }

  const allowed = sanitizeUserPatch(body.patch || {}, existingProfile);
  if (!Object.keys(allowed).length) {
    return json({
      user: {
        ...existingProfile,
        balance: existingProfile.is_unlimited ? null : await creditBalance(env, existingProfile.id)
      }
    });
  }

  const user = await updateProfile(env, body.userId, allowed);
  return json({
    user: {
      ...user,
      balance: user?.is_unlimited ? null : await creditBalance(env, user.id)
    }
  });
}

async function handleCreateManualPayment(env, request) {
  const { user } = await requireUser(env, request);
  const body = await readJson(request);
  const amountIdr = Number.parseInt(body.amountIdr, 10);
  if (!Number.isInteger(amountIdr) || amountIdr <= 0) throw new Error('Nominal pembayaran tidak valid.');
  const payment = await createManualPayment(env, {
    user_id: user.id,
    marketplace: 'shopee',
    order_ref: body.orderRef || '',
    amount_idr: amountIdr,
    notes: body.notes || '',
    status: 'pending'
  });
  return json({ payment });
}

async function handleCreateMidtransCheckout(env, request) {
  if (!isMidtransConfigured(env)) {
    throw new Error('Midtrans belum diaktifkan di deploy ini.');
  }

  const { user, profile } = await requireUser(env, request);
  const body = await readJson(request);
  const amountIdr = Number.parseInt(body.amountIdr, 10);
  if (!Number.isInteger(amountIdr) || amountIdr < MIDTRANS_MIN_AMOUNT_IDR) {
    throw new Error(`Nominal Midtrans minimal Rp${MIDTRANS_MIN_AMOUNT_IDR}.`);
  }

  const orderId = buildMidtransOrderId();
  const snapPayload = buildMidtransSnapPayload({
    orderId,
    amountIdr,
    user,
    profile,
    finishUrl: buildMidtransFinishUrl(env, orderId)
  });
  const created = await createMidtransSnapTransaction(env, snapPayload);
  const payment = await createPaymentTransaction(env, {
    user_id: user.id,
    provider: MIDTRANS_PROVIDER,
    order_id: orderId,
    amount_idr: amountIdr,
    currency: 'IDR',
    status: 'pending',
    payment_type: null,
    snap_token: created.token || '',
    redirect_url: created.redirect_url || '',
    raw_create_response: created,
    raw_notification: {},
    credited_ledger_id: null,
    paid_at: null,
    expired_at: null
  });

  return json({
    payment,
    redirectUrl: payment?.redirect_url || created.redirect_url || '',
    token: payment?.snap_token || created.token || ''
  });
}

async function handleCreateInteractiveQrisCheckout(env, request) {
  if (!isInteractiveQrisConfigured(env)) {
    throw new Error('QRIS otomatis belum diaktifkan di deploy ini.');
  }

  const qrisSetting = normalizeInteractiveQrisSetting((await getAppSetting(env, 'interactive_qris_payment'))?.value);
  if (!qrisSetting.enabled) {
    throw new Error('QRIS otomatis sedang dimatikan dari setting aplikasi.');
  }
  if (!qrisSetting.qrImageUrl && !qrisSetting.qrPayload) {
    throw new Error('QR image atau payload QRIS untuk QRIS otomatis belum diisi.');
  }
  requireInteractiveQrisOpen(qrisSetting);

  const { user } = await requireUser(env, request);
  const body = await readJson(request);
  const amountIdr = Number.parseInt(body.amountIdr, 10);
  const minimumAmountIdr = interactiveQrisMinAmountIdr(env);
  if (!Number.isInteger(amountIdr) || amountIdr < minimumAmountIdr) {
    throw new Error(`Nominal QRIS minimal Rp${minimumAmountIdr}.`);
  }

  await expireStaleInteractiveQrisPayments(env);
  const activePayments = await listActivePendingInteractiveQrisPayments(env);
  const { displayAmountIdr, uniqueCode } = allocateInteractiveQrisPaymentAmount(amountIdr, activePayments, interactiveQrisUniqueDigits(env));
  const dynamicQrisPayload = buildInteractiveQrisDynamicPayload(qrisSetting.qrPayload, displayAmountIdr);
  const payment = await createPaymentTransaction(env, {
    user_id: user.id,
    provider: INTERACTIVE_QRIS_PROVIDER,
    order_id: buildInteractiveQrisOrderId(),
    amount_idr: displayAmountIdr,
    base_amount_idr: amountIdr,
    unique_code: uniqueCode,
    currency: 'IDR',
    status: 'pending',
    payment_type: INTERACTIVE_QRIS_PAYMENT_TYPE,
    snap_token: null,
    redirect_url: null,
    raw_create_response: {
      displayAmountIdr,
      baseAmountIdr: amountIdr,
      uniqueCode,
      dynamicQris: Boolean(dynamicQrisPayload),
      provider: INTERACTIVE_QRIS_PROVIDER
    },
    raw_notification: {},
    credited_ledger_id: null,
    paid_at: null,
    expired_at: new Date(Date.now() + interactiveQrisExpiryMs()).toISOString()
  });

  return json({
    payment,
    instruction: buildInteractiveQrisInstruction(payment, qrisSetting, env)
  });
}

async function handleAdminInteractiveQrisImageUpload(env, request) {
  await requireAdmin(env, request);
  const form = await request.formData();
  const file = requireFormFile(form, 'image', 'Gambar QRIS wajib diunggah.');
  const contentType = String(file.type || '').toLowerCase();
  if (!INTERACTIVE_QRIS_ALLOWED_IMAGE_TYPES.has(contentType)) {
    throw new Error('Format gambar QRIS harus PNG, JPG, JPEG, atau WEBP.');
  }

  const bytes = await fileToUint8Array(file);
  if (bytes.byteLength <= 0) {
    throw new Error('File gambar QRIS kosong.');
  }
  if (bytes.byteLength > INTERACTIVE_QRIS_MAX_IMAGE_BYTES) {
    throw new Error('Ukuran gambar QRIS maksimal 5 MB.');
  }

  const assetPath = buildInteractiveQrisAssetPath(file);
  await putObject(env, EXAMPLE_JOBS_BUCKET, assetPath, bytes, contentType);
  return json({
    url: interactiveQrisAssetPublicUrl(env, assetPath),
    path: assetPath
  });
}

async function handleListMidtransPayments(env, request) {
  const { user } = await requireUser(env, request);
  const payments = await listUserMidtransPayments(env, user.id);
  return json({ payments });
}

async function handleListAutomaticPayments(env, request) {
  const { user } = await requireUser(env, request);
  const payments = await listUserAutomaticPayments(env, user.id);
  return json({ payments });
}

async function handleRefreshMidtransPayment(env, request, orderId) {
  const { user } = await requireUser(env, request);
  const payment = await getPaymentTransactionByOrderId(env, orderId);
  if (!payment) throw new Error('Transaksi Midtrans tidak ditemukan.');
  if (payment.user_id !== user.id) throw new Error('Akses pembayaran ditolak.');

  const statusData = await getMidtransTransactionStatus(env, payment.order_id);
  const updated = await syncMidtransPaymentTransaction(env, payment, statusData, { createdBy: user.id });
  return json({ payment: updated, status: mapMidtransTransactionState(statusData) });
}

async function handleMidtransWebhook(env, request) {
  if (!isMidtransConfigured(env)) {
    throw new Error('Midtrans belum diaktifkan di deploy ini.');
  }

  const body = await readJson(request);
  const isValidSignature = await verifyMidtransSignature(body, env);
  if (!isValidSignature) {
    return error('Signature Midtrans tidak valid.', 401);
  }

  const orderId = String(body.order_id || '').trim();
  if (!orderId) throw new Error('order_id Midtrans tidak ditemukan.');

  const payment = await getPaymentTransactionByOrderId(env, orderId);
  if (!payment) {
    return json({ received: true, ignored: true, reason: 'payment_not_found', orderId });
  }

  const updated = await syncMidtransPaymentTransaction(env, payment, body, { createdBy: payment.user_id });
  return json({ received: true, payment: updated });
}

function resolveInteractiveQrisExpectedPackages(env) {
  return String(requireEnvValue(env, 'INTERACTIVE_QRIS_SOURCE_PACKAGE'))
    .split(',')
    .map((pkg) => pkg.trim().toLowerCase())
    .filter(Boolean);
}

function resolveInteractiveQrisPackageName(body = {}) {
  return String(
    body.packageName || body.package_name || body.package || body.appPackage || body.app_package || ''
  )
    .trim()
    .toLowerCase();
}

function hasInteractiveQrisNotificationHint(body = {}) {
  const fields = [
    body.appName,
    body.app_name,
    body.title,
    body.text,
    body.message,
    body.body,
    body.notification,
    body.notification_text,
    body.subText,
    body.sub_text,
    body.bigText,
    body.big_text,
    body.ticker,
    body.lines,
    typeof body.raw === 'string' ? body.raw : ''
  ].filter((value) => typeof value === 'string' && value && !isUnexpandedMacroDroidToken(value));
  const combined = fields.join(' ');
  return /interactive\s*qris/i.test(combined);
}

function isInteractiveQrisSyncNoiseNotification(body = {}) {
  const combined = [body.title, body.text, body.message, body.body, body.notification, typeof body.raw === 'string' ? body.raw : '']
    .filter((value) => typeof value === 'string' && value && !isUnexpandedMacroDroidToken(value))
    .join(' ');
  if (!combined) return false;
  if (/rp\.?|idr|\bpembayaran\b|\btransaksi\b|\bditerima\b/i.test(combined)) return false;
  return /sedang menyiapkan konten terbaik/i.test(combined) || /\b\d{1,3}%\s*$/.test(String(body.text || '').trim());
}

async function handleInteractiveQrisWebhook(env, request) {
  if (!isInteractiveQrisConfigured(env)) {
    throw new Error('QRIS otomatis belum diaktifkan di deploy ini.');
  }

  const receivedSecret = String(
    request.headers.get('x-interactive-qris-secret') || request.headers.get('x-webhook-secret') || ''
  ).trim();
  const expectedSecret = String(requireEnvValue(env, 'INTERACTIVE_QRIS_WEBHOOK_SECRET')).trim();
  const { body, rawText } = await readInteractiveQrisWebhookPayload(request);
  const rawPackageName = resolveInteractiveQrisPackageName(body);
  const previewText = rawText || JSON.stringify(body || {});

  if (!receivedSecret || receivedSecret !== expectedSecret) {
    await insertInteractiveQrisWebhookLog(env, {
      status_code: 401,
      outcome: 'rejected',
      reason: 'invalid_secret',
      secret_valid: false,
      package_name: rawPackageName,
      payload_preview: previewText
    });
    return error('Secret QRIS tidak valid.', 401);
  }

  const expectedPackages = resolveInteractiveQrisExpectedPackages(env);
  const packageMatched =
    (rawPackageName && expectedPackages.includes(rawPackageName)) ||
    (rawPackageName && /^(com\.interactive\.|id\.co\.interactive)/.test(rawPackageName)) ||
    ((!rawPackageName || isUnexpandedMacroDroidToken(rawPackageName)) && hasInteractiveQrisNotificationHint(body));
  if (!packageMatched) {
    await insertInteractiveQrisWebhookLog(env, {
      status_code: 200,
      outcome: 'ignored',
      reason: 'unexpected_package',
      secret_valid: true,
      package_name: rawPackageName || '(kosong)',
      payload_preview: previewText
    });
    return json({ received: true, ignored: true, reason: 'unexpected_package', packageName: rawPackageName || '' });
  }

  await expireStaleInteractiveQrisPayments(env);
  const amountCandidates = extractInteractiveQrisAmountCandidates(body, interactiveQrisMinAmountIdr(env));
  if (amountCandidates.length === 0) {
    if (isInteractiveQrisSyncNoiseNotification(body)) {
      return json({ received: true, ignored: true, reason: 'ignored_progress_noise' });
    }
    await insertInteractiveQrisWebhookLog(env, {
      status_code: 200,
      outcome: 'ignored',
      reason: 'amount_not_found',
      secret_valid: true,
      package_name: rawPackageName || 'hint:InterActiveQRIS',
      amount_candidates: [],
      payload_preview: previewText
    });
    return json({ received: true, ignored: true, reason: 'amount_not_found' });
  }

  const activePayments = await listActivePendingInteractiveQrisPayments(env);
  const matches = activePayments.filter((payment) => amountCandidates.includes(Number(payment.amount_idr) || 0));
  if (matches.length === 0) {
    await insertInteractiveQrisWebhookLog(env, {
      status_code: 200,
      outcome: 'ignored',
      reason: 'payment_not_found',
      secret_valid: true,
      package_name: rawPackageName || 'hint:InterActiveQRIS',
      amount_candidates: amountCandidates,
      payload_preview: previewText
    });
    return json({ received: true, ignored: true, reason: 'payment_not_found', amountCandidates });
  }
  if (matches.length > 1) {
    await insertInteractiveQrisWebhookLog(env, {
      status_code: 200,
      outcome: 'ignored',
      reason: 'ambiguous_amount_match',
      secret_valid: true,
      package_name: rawPackageName || 'hint:InterActiveQRIS',
      amount_candidates: amountCandidates,
      payload_preview: previewText
    });
    return json({ received: true, ignored: true, reason: 'ambiguous_amount_match', amountCandidates });
  }

  const payment = matches[0];
  const updated = await syncInteractiveQrisPaymentTransaction(
    env,
    payment,
    {
      ...body,
      matchedAmountIdr: Number(payment.amount_idr) || 0
    },
    {
      createdBy: payment.user_id,
      paidAt: body.postedAt
    }
  );
  await insertInteractiveQrisWebhookLog(env, {
    status_code: 200,
    outcome: 'settled',
    reason: 'matched_and_credited',
    secret_valid: true,
    package_name: rawPackageName || 'hint:InterActiveQRIS',
    amount_candidates: amountCandidates,
    matched_order_id: updated?.order_id || payment.order_id,
    payload_preview: previewText
  });
  return json({ received: true, payment: updated });
}

async function grantSignupBonusForNewProfile(env, request, profile, { deviceId = '' } = {}) {
  try {
    const deviceIdHash = await hashSignupBonusIdentifier(env, deviceId);
    const ipHash = await hashSignupBonusIdentifier(env, extractRequestIp(request));
    const counts = await countGrantedSignupBonusClaims(env, { deviceIdHash, ipHash });
    const granted = shouldGrantSignupBonus({ deviceGrantedClaims: counts.device, ipGrantedClaims: counts.ip });
    const claim = await insertSignupBonusClaim(env, {
      user_id: profile.id,
      email: profile.email,
      device_id_hash: deviceIdHash || null,
      ip_hash: ipHash || null,
      country_code: getViewerCountryCode(request) || null,
      bonus_granted: granted,
      reason: granted ? SIGNUP_BONUS_REASON : 'limit_reached',
      metadata: { source: 'signup', deviceGrantedClaims: counts.device, ipGrantedClaims: counts.ip }
    });
    await ensureSignupBonusLedger(env, claim);
  } catch (bonusError) {
    // Bonus tidak boleh menggagalkan signup; guard device/IP tetap dicatat bila memungkinkan.
    console.error('Bonus signup gagal diproses:', bonusError?.message || bonusError);
  }
}

async function handleAuthSignup(env, request) {
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const password = String(body.password || '');
  const fullName = String(body.fullName || '').trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Email tidak valid.');
  if (password.length < MIN_PASSWORD_LENGTH) throw new Error('Password minimal 6 karakter.');

  const existing = await getAuthProfileByEmail(env, email);
  if (existing) throw new Error('Email sudah terdaftar. Silakan login.');

  const salt = generateSaltHex();
  const passwordHash = await hashPasswordHex(password, salt);
  const isSuperuser = email === SUPERUSER_EMAIL;
  let profile;
  try {
    profile = await createProfile(env, {
      id: crypto.randomUUID(),
      email,
      fullName: fullName || email.split('@')[0],
      role: isSuperuser ? 'superuser' : 'user',
      isUnlimited: isSuperuser,
      passwordHash,
      salt,
      authProvider: 'password'
    });
  } catch (createError) {
    if (isDuplicateConstraintError(createError)) throw new Error('Email sudah terdaftar. Silakan login.');
    throw createError;
  }

  await grantSignupBonusForNewProfile(env, request, profile, { deviceId: String(body.deviceId || '') });
  return json(await createAuthSession(env, profile));
}

async function handleAuthLogin(env, request) {
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const password = String(body.password || '');
  if (!email || !password) throw new Error('Email dan password wajib diisi.');

  const profile = await getAuthProfileByEmail(env, email);
  if (!profile) throw new Error('Email atau password salah.');
  if (!profile.password_hash) throw new Error('Akun ini terdaftar melalui Google. Silakan login dengan Google.');
  if (profile.is_active === false) throw new Error('Akun tidak aktif.');

  const valid = await verifyPasswordHash(password, profile.salt, profile.password_hash);
  if (!valid) throw new Error('Email atau password salah.');
  return json(await createAuthSession(env, profile));
}

async function handleAuthRefresh(env, request) {
  const body = await readJson(request);
  return json(await rotateRefreshSession(env, body.refresh_token));
}

async function handleAuthLogout(env, request) {
  const body = await readJson(request);
  await revokeRefreshSession(env, body.refresh_token);
  return json({ success: true });
}

async function handleGoogleAuthStart(env) {
  const { url } = await buildGoogleAuthStart(env);
  return Response.redirect(url, 302);
}

async function handleGoogleAuthCallback(env, request) {
  const frontendBase = appBaseUrl(env);
  const redirectWithError = (message) => Response.redirect(`${frontendBase}/#auth_error=${encodeURIComponent(message)}`, 302);
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (url.searchParams.get('error') || !code || !state) return redirectWithError('Login Google dibatalkan.');

    const statePayload = await verifyGoogleState(env, state);
    if (!statePayload) return redirectWithError('State OAuth Google tidak valid. Silakan coba lagi.');

    const googleUser = await exchangeGoogleCode(env, code);
    const email = normalizeEmail(googleUser.email);
    let profile = await getAuthProfileByEmail(env, email);
    if (!profile) {
      const isSuperuser = email === SUPERUSER_EMAIL;
      profile = await createProfile(env, {
        id: crypto.randomUUID(),
        email,
        fullName: String(googleUser.name || '').trim() || email.split('@')[0],
        role: isSuperuser ? 'superuser' : 'user',
        isUnlimited: isSuperuser,
        authProvider: 'google'
      });
      await grantSignupBonusForNewProfile(env, request, profile);
    }
    if (profile.is_active === false) return redirectWithError('Akun tidak aktif.');

    const session = await createAuthSession(env, profile);
    // Format hash implicit-flow Supabase agar parsing callback frontend tetap dipakai.
    const hash = [
      `access_token=${encodeURIComponent(session.access_token)}`,
      `refresh_token=${encodeURIComponent(session.refresh_token)}`,
      `expires_at=${session.expires_at}`,
      'token_type=bearer'
    ].join('&');
    return Response.redirect(`${frontendBase}/#${hash}`, 302);
  } catch (callbackError) {
    return redirectWithError(callbackError?.message || 'Login Google gagal.');
  }
}

async function handlePublicAsset(env, assetPath) {
  const cleanPath = String(assetPath || '').replace(/^\/+/, '');
  if (!cleanPath || cleanPath.split('/').includes('..')) return error('Aset tidak ditemukan.', 404);
  const object = await getObject(env, EXAMPLE_JOBS_BUCKET, cleanPath);
  if (!object) return error('Aset tidak ditemukan.', 404);
  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
      'Cache-Control': object.httpMetadata?.cacheControl || 'public, max-age=3600',
      ...corsHeaders
    }
  });
}

async function handleSignupBonusClaim(env, request) {
  await requireUser(env, request);
  return json({
    active: false,
    granted: false,
    alreadyProcessed: true,
    amountIdr: 0,
    reason: 'disabled',
    remainingEligibleByDeviceOrIp: 0
  });
}

async function handleAdminFinanceSummary(env, request) {
  await requireAdmin(env, request);
  const url = new URL(request.url);
  const dataset = await loadAdminFinanceData(env, {
    from: url.searchParams.get('from'),
    to: url.searchParams.get('to')
  });
  return json({
    range: dataset.range,
    summary: buildFinanceSummary(dataset),
    taxRules: dataset.taxRules
  });
}

async function handleAdminFinanceTransactions(env, request) {
  await requireAdmin(env, request);
  const url = new URL(request.url);
  const dataset = await loadAdminFinanceData(env, {
    from: url.searchParams.get('from'),
    to: url.searchParams.get('to')
  });
  const filters = {
    source: url.searchParams.get('source'),
    category: url.searchParams.get('category'),
    userEmail: url.searchParams.get('userEmail')
  };
  return json({
    range: dataset.range,
    filters,
    transactions: buildAdminFinanceTransactionsPayload(dataset, filters)
  });
}

async function handleAdminFinanceUsage(env, request) {
  await requireAdmin(env, request);
  const url = new URL(request.url);
  const dataset = await loadAdminFinanceData(env, {
    from: url.searchParams.get('from'),
    to: url.searchParams.get('to')
  });
  const summary = buildFinanceSummary(dataset);
  return json({
    range: dataset.range,
    usage: {
      summary: {
        jobValueIdr: summary.jobValueIdr,
        aiRedrawCount: summary.aiRedrawCount,
        readyTraceCount: summary.readyTraceCount
      },
      jobs: dataset.jobs
    }
  });
}

async function handleAdminBusinessFinanceEntries(env, request) {
  const admin = await requireAdmin(env, request);
  if (request.method === 'GET') {
    const url = new URL(request.url);
    const range = normalizeFinanceRange({
      from: url.searchParams.get('from'),
      to: url.searchParams.get('to')
    });
    const [users, entries] = await Promise.all([listProfileEmails(env), listBusinessFinanceEntriesRows(env, range)]);
    return json({
      range,
      entries: withCreatedByEmails(entries, users)
    });
  }

  const body = await readJson(request);
  const created = await createBusinessFinanceEntry(env, normalizeBusinessFinancePayload(body, admin.user.id));
  return json({ entry: created });
}

async function handleAdminTaxRules(env, request) {
  await requireAdmin(env, request);
  if (request.method === 'GET') {
    return json({ rules: await listTaxRulesRows(env) });
  }

  const body = await readJson(request);
  const rule = await upsertTaxRule(env, normalizeTaxRulePayload(body));
  return json({ rule });
}

async function handleAdminFinanceExport(env, request) {
  await requireAdmin(env, request);
  const url = new URL(request.url);
  const section = String(url.searchParams.get('section') || 'summary').trim().toLowerCase();
  const dataset = await loadAdminFinanceData(env, {
    from: url.searchParams.get('from'),
    to: url.searchParams.get('to')
  });

  let csv = '';
  if (section === 'summary') {
    csv = buildFinanceCsv('summary', { summary: buildFinanceSummary(dataset) });
  } else if (section === 'usage') {
    csv = buildFinanceCsv('usage', { jobs: dataset.jobs });
  } else if (section === 'business-ledger') {
    csv = buildFinanceCsv('business-ledger', { entries: dataset.businessEntries });
  } else if (section === 'transactions') {
    csv = buildFinanceCsv('transactions', {
      transactions: buildAdminFinanceTransactionsPayload(dataset, {
        source: url.searchParams.get('source'),
        category: url.searchParams.get('category'),
        userEmail: url.searchParams.get('userEmail')
      })
    });
  } else {
    throw new Error('Section export finance tidak valid.');
  }

  const filename = `finance-${section}-${dataset.range.from}-${dataset.range.to}.csv`;
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      ...corsHeaders
    }
  });
}

async function handleAppConfig(env, request) {
  const rows = await listPublicAppSettings(env);
  const aiRedrawModel = await getAiRedrawModelConfig(env);
  const redrawAvailability = buildAiRedrawAvailability(aiRedrawModel, env);
  const settings = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  const interactiveQrisSetting = normalizeInteractiveQrisSetting(settings.interactive_qris_payment);
  return json({
    settings: {
      ...settings,
      interactive_qris_payment: interactiveQrisSetting
    },
    features: {
      aiRedrawAvailable: redrawAvailability.aiRedrawAvailable,
      aiRedrawPrimaryProvider: aiRedrawModel.primaryProvider,
      aiRedrawFallbackProvider: aiRedrawModel.fallbackProvider || '',
      aiveneConfigured: redrawAvailability.aiveneConfigured,
      openAiConfigured: redrawAvailability.openAiConfigured,
      midtransAvailable: isMidtransConfigured(env),
      midtransIsProduction: isMidtransProduction(env),
      midtransMinimumAmountIdr: MIDTRANS_MIN_AMOUNT_IDR,
      interactiveQrisAvailable: interactiveQrisSetting.enabled === true && isInteractiveQrisConfigured(env),
      interactiveQrisMinimumAmountIdr: interactiveQrisMinAmountIdr(env),
      interactiveQrisUniqueDigits: interactiveQrisUniqueDigits(env)
    },
    viewer: {
      countryCode: getViewerCountryCode(request),
      defaultLocale: getViewerDefaultLocale(request)
    }
  });
}

async function handleAdminOverview(env, request) {
  await requireAdmin(env, request);
  const [users, jobs, payments, gatewayPayments, ledger] = await Promise.all([
    listAdminOverviewProfiles(env),
    listAdminOverviewJobs(env),
    listAdminOverviewManualPayments(env),
    listAdminPaymentTransactionsRows(env),
    listAdminOverviewLedger(env)
  ]);
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const recentJobs = jobs.filter((job) => new Date(job.created_at).getTime() >= sevenDaysAgo);
  const successfulGatewayPayments = gatewayPayments.filter((payment) => isSuccessfulGatewayPayment(payment));
  return json({
    overview: {
      totalUsers: users.length,
      activeUsers: users.filter((user) => user.is_active && !user.deleted_at).length,
      unlimitedUsers: users.filter((user) => user.is_unlimited).length,
      totalJobs: jobs.length,
      jobsLast7Days: recentJobs.length,
      totalJobValueIdr: jobs.reduce((sum, job) => sum + (Number(job.price_idr) || 0), 0),
      pendingPayments: payments.filter((payment) => payment.status === 'pending').length + gatewayPayments.filter((payment) => payment.status === 'pending').length,
      approvedPayments: payments.filter((payment) => payment.status === 'approved').length + successfulGatewayPayments.length,
      approvedPaymentIdr:
        payments.filter((payment) => payment.status === 'approved').reduce((sum, payment) => sum + (Number(payment.amount_idr) || 0), 0) +
        successfulGatewayPayments.reduce((sum, payment) => sum + (Number(payment.amount_idr) || 0), 0),
      creditAddedIdr: ledger.filter((entry) => entry.amount_idr > 0).reduce((sum, entry) => sum + Number(entry.amount_idr), 0),
      creditUsedIdr: Math.abs(ledger.filter((entry) => entry.amount_idr < 0).reduce((sum, entry) => sum + Number(entry.amount_idr), 0))
    }
  });
}

async function handleAdminJobs(env, request) {
  await requireAdmin(env, request);
  const [users, jobs, exampleSetting] = await Promise.all([
    listProfileRoles(env),
    listAdminJobs(env),
    getAppSetting(env, 'example_jobs')
  ]);
  const decorated = decorateAdminJobs(jobs, users, exampleSetting?.value);
  return json({
    jobs: decorated.map(({ manifest, ...job }) => job)
  });
}

async function handleExampleJobs(env) {
  const [profiles, jobs] = await Promise.all([listProfileRoles(env), listExampleJobs(env)]);

  const superuserIds = new Set(profiles.filter((profile) => isSuperuserProfile(profile, profile.email)).map((profile) => profile.id));
  const exampleJobs = jobs
    .filter((job) => superuserIds.has(job.user_id))
    .map((job) => toExampleFeedJob(env, job))
    .filter(Boolean);
  const legacyExampleJobs = await listLegacyPublishedExampleJobs(env);
  const mergedExampleJobs = new Map(exampleJobs.map((job) => [job.jobId, job]));
  legacyExampleJobs.forEach((job) => {
    if (!mergedExampleJobs.has(job.jobId)) {
      mergedExampleJobs.set(job.jobId, job);
    }
  });

  return json({
    exampleJobs: [...mergedExampleJobs.values()].sort((left, right) => new Date(right.updatedAt || right.createdAt || 0) - new Date(left.updatedAt || left.createdAt || 0))
  });
}

async function handleAdminPayments(env, request) {
  await requireAdmin(env, request);
  const users = await listProfileEmails(env);
  const payments = await listAdminManualPayments(env);
  return json({ payments: withUserEmails(payments, users) });
}

async function handleAdminMidtransPayments(env, request) {
  await requireAdmin(env, request);
  const users = await listProfileEmails(env);
  const payments = await listAdminMidtransPaymentsRows(env);
  return json({ payments: withUserEmails(payments, users) });
}

async function handleAdminPaymentTransactions(env, request) {
  await requireAdmin(env, request);
  const users = await listProfileEmails(env);
  const payments = await listAdminPaymentTransactionsRows(env);
  return json({ payments: withUserEmails(payments, users) });
}

async function handleAdminQrisWebhookLogs(env, request) {
  await requireAdmin(env, request);
  const logs = await listInteractiveQrisWebhookLogs(env);
  return json({ logs });
}

async function handleAdminSettleQrisPayment(env, request, paymentId) {
  const admin = await requireAdmin(env, request);
  const payment = await getPaymentTransactionById(env, paymentId);
  if (!payment) throw new Error('Transaksi QRIS tidak ditemukan.');
  if (payment.provider !== INTERACTIVE_QRIS_PROVIDER) throw new Error('Hanya transaksi QRIS otomatis yang bisa diselesaikan di endpoint ini.');
  const updated = await syncInteractiveQrisPaymentTransaction(
    env,
    payment,
    { manualAdminVerification: true, settledBy: admin.user.email },
    { createdBy: admin.user.id, paidAt: new Date().toISOString() }
  );
  return json({ payment: updated });
}

async function handleRejectPayment(env, request, paymentId) {
  const admin = await requireAdmin(env, request);
  const body = await readJson(request);
  const updated = await updateManualPayment(env, paymentId, {
    status: 'rejected',
    rejected_reason: body.reason || '',
    approved_by: admin.user.id,
    approved_at: null
  });
  return json({ payment: updated });
}

async function handleAdminPricingRules(env, request) {
  await requireAdmin(env, request);
  if (request.method === 'GET') {
    const rules = await listPricingRules(env);
    return json({ rules });
  }

  const body = await readJson(request);
  const amountIdr = Number.parseInt(body.amountIdr, 10);
  if (!body.key || !Number.isInteger(amountIdr) || amountIdr < 0) throw new Error('Aturan harga tidak valid.');
  const rule = await upsertPricingRule(env, {
    key: body.key,
    amountIdr,
    active: body.active !== false,
    description: body.description || ''
  });
  return json({ rule });
}

async function handleAdminSettings(env, request) {
  await requireAdmin(env, request);
  if (request.method === 'GET') {
    const rows = await listAppSettings(env);
    return json({ settings: rows });
  }

  const body = await readJson(request);
  if (!body.key) throw new Error('Key setting wajib diisi.');
  const normalizedValue =
    body.key === 'ai_redraw_model'
      ? normalizeAiRedrawModelConfig(body.value, env)
      : body.key === 'interactive_qris_payment'
        ? normalizeInteractiveQrisSetting(body.value || {})
        : body.value || {};
  if (body.key === 'interactive_qris_payment' && normalizedValue.qrPayload) {
    if (normalizedValue.qrPayload.length > QRIS_MAX_PAYLOAD_LENGTH || !isValidQrisPayload(normalizedValue.qrPayload)) {
      throw new Error('Payload QRIS statis tidak valid. Pastikan teks EMVCo lengkap dan CRC benar.');
    }
  }
  const setting = await upsertAppSetting(env, {
    key: body.key,
    value: normalizedValue,
    isPublic: body.isPublic !== false,
    description: body.description || ''
  });
  return json({ setting });
}

async function handleSetExampleJob(env, request, jobId) {
  await requireAdmin(env, request);
  const [job, profiles] = await Promise.all([getJobById(env, jobId), listProfileRoles(env)]);

  if (!job) throw new Error('Job tidak ditemukan.');
  if (jobIsDeleted(job)) throw new Error('Job ini sudah dihapus.');
  if (job.status !== 'done') throw new Error('Hanya job selesai yang bisa dijadikan contoh.');

  const owner = profiles.find((profile) => profile.id === job.user_id);
  if (!owner || !isSuperuserProfile(owner, owner.email)) throw new Error('Hanya job milik superadmin yang bisa dijadikan contoh.');

  if (!hasCompleteExampleArtifacts(job.manifest, job.production_type)) {
    throw new Error('Job ini belum punya bundle contoh lengkap. Jalankan ulang job superadmin dengan fitur artefak contoh aktif.');
  }

  const artifacts = getExampleArtifactsFromManifest(job.manifest);
  const publishedAt = formatDate(new Date());
  const replacedJobs = await unpublishOtherExampleJobs(env, job);
  const updatedJob =
    (await updateJob(env, job.id, {
      is_example_public: true,
      example_published_at: publishedAt
    })) || { ...job, is_example_public: true, example_published_at: publishedAt };
  const nextExamples = await syncLegacyExampleSetting(env, updatedJob, artifacts);

  return json({
    jobId: updatedJob.id,
    productionType: updatedJob.production_type,
    isExamplePublic: true,
    examplePublishedAt: updatedJob.example_published_at,
    replacedJobIds: (replacedJobs || []).map((replacedJob) => replacedJob.id),
    exampleJobs: nextExamples
  });
}

async function handleUnsetExampleJob(env, request, jobId) {
  await requireAdmin(env, request);
  const [job, profiles] = await Promise.all([getJobById(env, jobId), listProfileRoles(env)]);

  if (!job) throw new Error('Job tidak ditemukan.');
  if (jobIsDeleted(job)) throw new Error('Job ini sudah dihapus.');

  const owner = profiles.find((profile) => profile.id === job.user_id);
  if (!owner || !isSuperuserProfile(owner, owner.email)) throw new Error('Hanya job milik superadmin yang bisa dicabut dari contoh.');

  const updatedJob =
    (await updateJob(env, job.id, {
      is_example_public: false,
      example_published_at: null
    })) || { ...job, is_example_public: false, example_published_at: null };
  await clearLegacyExampleSettingIfMatches(env, job);

  return json({
    jobId: job.id,
    isExamplePublic: false,
    job: updatedJob
  });
}

async function handleDeleteJob(env, request, jobId) {
  const { user } = await requireUser(env, request);
  const job = await getJobById(env, jobId);
  if (!job) throw new Error('Job tidak ditemukan.');
  if (job.user_id !== user.id) throw new Error('Hanya pemilik job yang boleh menghapus job ini.');
  const hasExampleArtifacts = Boolean(getExampleArtifactsFromManifest(job.manifest));
  if (!jobIsDeleted(job) && hasExampleArtifacts) {
    await deleteObjects(env, EXAMPLE_JOBS_BUCKET, [exampleJobPrefix(job.id)]);
  }
  await clearLegacyExampleSettingIfMatches(env, job);
  if (jobIsDeleted(job)) {
    return json({ jobId: job.id, deleted: true });
  }

  const deletedAt = formatDate(new Date());
  const deletedJob =
    (await updateJob(env, job.id, {
      deleted_at: deletedAt,
      is_example_public: false,
      example_published_at: null
    })) || { ...job, deleted_at: deletedAt, is_example_public: false, example_published_at: null };

  return json({
    jobId: job.id,
    deleted: true,
    deletedAt,
    metadataDeleted: true,
    job: deletedJob
  });
}

async function handleAdminCredits(env, request) {
  const admin = await requireAdmin(env, request);
  const body = await readJson(request);
  const amountIdr = Number.parseInt(body.amountIdr, 10);
  if (!body.userId || !Number.isInteger(amountIdr) || amountIdr === 0) throw new Error('Nominal credit tidak valid.');
  const ledger = await insertLedger(env, {
    userId: body.userId,
    amountIdr,
    kind: amountIdr > 0 ? 'credit' : 'debit',
    reason: body.reason || 'admin_adjustment',
    createdBy: admin.user.id,
    metadata: body.metadata || {}
  });
  return json({ ledger });
}

async function handleApprovePayment(env, request, paymentId) {
  const admin = await requireAdmin(env, request);
  const payment = await getManualPaymentById(env, paymentId);
  if (!payment) throw new Error('Pembayaran tidak ditemukan.');
  if (payment.status === 'approved') return json({ payment });
  await insertLedger(env, {
    userId: payment.user_id,
    amountIdr: payment.amount_idr,
    kind: 'credit',
    reason: 'manual_payment_shopee',
    referenceId: payment.id,
    createdBy: admin.user.id
  });
  const updated = await updateManualPayment(env, paymentId, {
    status: 'approved',
    approved_by: admin.user.id,
    approved_at: new Date().toISOString()
  });
  return json({ payment: updated });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
    const url = new URL(request.url);
    try {
      if ((url.pathname === '/' || url.pathname === '/health') && request.method === 'GET') return handleHealth(env);
      if (url.pathname === '/api/app-config' && request.method === 'GET') return await handleAppConfig(env, request);
      if (url.pathname === '/api/auth/signup' && request.method === 'POST') return await handleAuthSignup(env, request);
      if (url.pathname === '/api/auth/login' && request.method === 'POST') return await handleAuthLogin(env, request);
      if (url.pathname === '/api/auth/refresh' && request.method === 'POST') return await handleAuthRefresh(env, request);
      if (url.pathname === '/api/auth/logout' && request.method === 'POST') return await handleAuthLogout(env, request);
      if (url.pathname === '/api/auth/google' && request.method === 'GET') return await handleGoogleAuthStart(env);
      if (url.pathname === '/api/auth/google/callback' && request.method === 'GET') return await handleGoogleAuthCallback(env, request);
      if (url.pathname === '/api/auth/signup-bonus' && request.method === 'POST') return await handleSignupBonusClaim(env, request);
      if (url.pathname.replace(/\/+$/, '') === '/api/payments/interactive-qris/webhook') {
        if (request.method === 'GET') {
          return json({ ok: true, endpoint: 'interactive_qris_webhook', configured: isInteractiveQrisConfigured(env), method: 'POST' });
        }
        if (request.method === 'POST') return await handleInteractiveQrisWebhook(env, request);
      }
      if (url.pathname === '/api/payments/interactive-qris/checkout' && request.method === 'POST') return await handleCreateInteractiveQrisCheckout(env, request);
      if (url.pathname === '/api/payments/automatic' && request.method === 'GET') return await handleListAutomaticPayments(env, request);
      if (url.pathname === '/api/payments/midtrans/webhook' && request.method === 'POST') return await handleMidtransWebhook(env, request);
      if (url.pathname === '/api/payments/midtrans/checkout' && request.method === 'POST') return await handleCreateMidtransCheckout(env, request);
      if (url.pathname === '/api/payments/midtrans' && request.method === 'GET') return await handleListMidtransPayments(env, request);
      if (url.pathname === '/api/manual-payments' && request.method === 'POST') return await handleCreateManualPayment(env, request);
      if (url.pathname === '/api/me/balance' && request.method === 'GET') return await handleBalance(env, request);
      if (url.pathname === '/api/jobs/quote' && request.method === 'POST') return await handleQuote(env, request);
      if (url.pathname === '/api/jobs/commit' && request.method === 'POST') return await handleCommitJob(env, request);
      if (url.pathname === '/api/example-jobs' && request.method === 'GET') return await handleExampleJobs(env, request);
      const artifactsMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)\/artifacts$/);
      if (artifactsMatch && request.method === 'POST') return await handleJobArtifactsUpload(env, request, artifactsMatch[1]);
      const deleteJobMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)$/);
      if (deleteJobMatch && request.method === 'DELETE') return await handleDeleteJob(env, request, deleteJobMatch[1]);
      if ((url.pathname === '/api/image-retouch' || url.pathname === '/api/ai-redraw') && request.method === 'POST') return await handleAiRedraw(env, request);
      if (url.pathname === '/api/admin/users') return await handleAdminUsers(env, request);
      if (url.pathname === '/api/admin/credits' && request.method === 'POST') return await handleAdminCredits(env, request);
      if (url.pathname === '/api/admin/overview' && request.method === 'GET') return await handleAdminOverview(env, request);
      if (url.pathname === '/api/admin/jobs' && request.method === 'GET') return await handleAdminJobs(env, request);
      if (url.pathname === '/api/admin/manual-payments' && request.method === 'GET') return await handleAdminPayments(env, request);
      if (url.pathname === '/api/admin/payment-transactions' && request.method === 'GET') return await handleAdminPaymentTransactions(env, request);
      if (url.pathname === '/api/admin/qris-webhook-logs' && request.method === 'GET') return await handleAdminQrisWebhookLogs(env, request);
      const settleQrisMatch = url.pathname.match(/^\/api\/admin\/payment-transactions\/([^/]+)\/settle-qris$/);
      if (settleQrisMatch && request.method === 'POST') return await handleAdminSettleQrisPayment(env, request, settleQrisMatch[1]);
      if (url.pathname === '/api/admin/midtrans-payments' && request.method === 'GET') return await handleAdminMidtransPayments(env, request);
      if (url.pathname === '/api/admin/finance/summary' && request.method === 'GET') return await handleAdminFinanceSummary(env, request);
      if (url.pathname === '/api/admin/finance/transactions' && request.method === 'GET') return await handleAdminFinanceTransactions(env, request);
      if (url.pathname === '/api/admin/finance/usage' && request.method === 'GET') return await handleAdminFinanceUsage(env, request);
      if (url.pathname === '/api/admin/finance/export.csv' && request.method === 'GET') return await handleAdminFinanceExport(env, request);
      if (url.pathname === '/api/admin/finance/business-entries') return await handleAdminBusinessFinanceEntries(env, request);
      if (url.pathname === '/api/admin/finance/tax-rules') return await handleAdminTaxRules(env, request);
      if (url.pathname === '/api/admin/pricing-rules') return await handleAdminPricingRules(env, request);
      if (url.pathname === '/api/admin/settings/interactive-qris-image' && request.method === 'POST') return await handleAdminInteractiveQrisImageUpload(env, request);
      if (url.pathname === '/api/admin/settings') return await handleAdminSettings(env, request);
      const midtransRefreshMatch = url.pathname.match(/^\/api\/payments\/midtrans\/([^/]+)\/refresh$/);
      if (midtransRefreshMatch && request.method === 'POST') return await handleRefreshMidtransPayment(env, request, midtransRefreshMatch[1]);
      const setExampleMatch = url.pathname.match(/^\/api\/admin\/jobs\/([^/]+)\/set-example$/);
      if (setExampleMatch && request.method === 'POST') return await handleSetExampleJob(env, request, setExampleMatch[1]);
      const unsetExampleMatch = url.pathname.match(/^\/api\/admin\/jobs\/([^/]+)\/unset-example$/);
      if (unsetExampleMatch && request.method === 'POST') return await handleUnsetExampleJob(env, request, unsetExampleMatch[1]);
      const approveMatch = url.pathname.match(/^\/api\/admin\/manual-payments\/([^/]+)\/approve$/);
      if (approveMatch && request.method === 'POST') return await handleApprovePayment(env, request, approveMatch[1]);
      const rejectMatch = url.pathname.match(/^\/api\/admin\/manual-payments\/([^/]+)\/reject$/);
      if (rejectMatch && request.method === 'POST') return await handleRejectPayment(env, request, rejectMatch[1]);
      const assetMatch = url.pathname.match(/^\/api\/assets\/example-jobs\/(.+)$/);
      if (assetMatch && request.method === 'GET') return await handlePublicAsset(env, decodeURIComponent(assetMatch[1]));
      return error('Endpoint tidak ditemukan.', 404);
    } catch (err) {
      const message = err.message || 'Server error.';
      const status = message.includes('ditolak') || message.startsWith('Hanya ') ? 403 : 400;
      return error(message, status);
    }
  }
};
