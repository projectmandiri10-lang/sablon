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
  buildDateRangeQuery,
  buildFinanceCsv,
  buildFinanceSummary,
  buildTimestampRangeQuery,
  BUSINESS_FINANCE_CASH_DIRECTIONS,
  BUSINESS_FINANCE_ENTRY_TYPES,
  BUSINESS_FINANCE_TAX_TREATMENTS,
  DEFAULT_TAX_CODE,
  filterFinanceTransactions,
  isSuccessfulGatewayPayment,
  normalizeBusinessLedgerTransaction,
  normalizeFinanceRange,
  normalizeGatewayPaymentTransaction,
  normalizeJobUsageTransaction,
  normalizeLedgerTransaction,
  normalizeManualPaymentTransaction
} from './admin-finance.js';
import {
  HYBRID_REDRAW_PRESETS,
  LITELLM_IMAGE_REDRAW_PROVIDER,
  OPENROUTER_IMAGE_REDRAW_PROVIDER,
  normalizeHybridRedrawConfig
} from '../../shared/hybridRedrawConfig.js';

const DEFAULT_PRICING = {
  ready_trace: 2000,
  ai_redraw: AI_REDRAW_PRICE_IDR,
  separation_film: 0
};

const MIDTRANS_PROVIDER = 'midtrans';
const MIDTRANS_MIN_AMOUNT_IDR = 2000;
const MIDTRANS_PAYMENT_REASON = 'midtrans_payment';
const MIDTRANS_FINAL_STATUSES = new Set(['settlement', 'deny', 'cancel', 'expire', 'failure', 'refund', 'chargeback', 'partial_refund', 'partial_chargeback']);
const SIGNUP_BONUS_REASON = 'signup_free_credit';
const SIGNUP_BONUS_AMOUNT_IDR = 5000;
const SIGNUP_BONUS_MAX_MATCHED_CLAIMS = 2;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization,Content-Type,X-Processor-API-Key',
  'Access-Control-Expose-Headers': 'X-AI-Ledger-Id,X-AI-Redraw-Metadata'
};

function requireEnvValue(env, key) {
  const value = env[key];
  if (!value) {
    throw new Error(`Worker belum dikonfigurasi: ${key} kosong.`);
  }
  return value;
}

function supabaseBaseUrl(env) {
  return requireEnvValue(env, 'SUPABASE_URL').replace(/\/+$/, '');
}

function hasEnvValue(env, key) {
  return Boolean(env[key]);
}

function isOpenRouterConfigured(env) {
  return hasEnvValue(env, 'OPENROUTER_API_KEY');
}

function isLiteLlmConfigured(env) {
  return hasEnvValue(env, 'LITELLM_SECRET_KEY') || hasEnvValue(env, 'LITELLM_API_KEY');
}

function liteLlmBaseUrl(env) {
  return String(env.LITELLM_BASE_URL || 'https://litellm.example.com/v1').replace(/\/+$/, '');
}

function liteLlmMaxImageInputBytes(env) {
  const fallback = 3200000;
  const parsed = Number.parseInt(env.LITELLM_MAX_IMAGE_INPUT_BYTES, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function liteLlmAppName(env) {
  return String(env.LITELLM_APP_NAME || 'EasyRedesign Pro').trim();
}

function openRouterBaseUrl(env) {
  return String(env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
}

function openRouterMaxImageInputBytes(env) {
  const fallback = 3200000;
  const parsed = Number.parseInt(env.OPENROUTER_MAX_IMAGE_INPUT_BYTES, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function openRouterAppName(env) {
  return String(env.OPENROUTER_APP_NAME || 'EasyRedesign Pro').trim();
}

function openRouterSiteUrl(env) {
  return String(env.OPENROUTER_SITE_URL || '').trim();
}

function providerDisplayName(provider) {
  switch (provider) {
    case LITELLM_IMAGE_REDRAW_PROVIDER:
      return 'LiteLLM';
    case OPENROUTER_IMAGE_REDRAW_PROVIDER:
      return 'OpenRouter';
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

function buildLiteLlmHeaders(env) {
  const secret = env.LITELLM_SECRET_KEY || env.LITELLM_API_KEY;
  const headers = {
    Authorization: `Bearer ${secret || requireEnvValue(env, 'LITELLM_SECRET_KEY')}`,
    'Content-Type': 'application/json'
  };
  const appName = liteLlmAppName(env);
  if (appName) headers['X-Title'] = appName;
  return headers;
}

function mapLiteLlmError(response, data) {
  const rawStatus = String(data?.error?.code || data?.error?.type || data?.status || '').trim();
  const message = normalizeProviderMessage(
    data?.error?.message || data?.message || data?.raw,
    `LiteLLM image request failed: ${response.status}`
  );
  const lowered = message.toLowerCase();
  let fallbackReason = '';

  if (response.status === 429 || /quota|rate limit|resource exhausted|exhausted|too many requests/.test(lowered)) {
    fallbackReason = 'quota_exhausted';
  } else if (response.status === 402 || /billing|payment|insufficient|credit/.test(lowered)) {
    fallbackReason = 'billing_required';
  } else if (response.status === 404 || /not found|model.*unavailable|model.*not available|unsupported model|unknown model|not supported/.test(lowered)) {
    fallbackReason = 'model_unavailable';
  } else if (response.status >= 500 || /timeout|timed out|connection|connect|overloaded|service unavailable|gateway|upstream/.test(lowered)) {
    fallbackReason = 'upstream_unavailable';
  }

  return createProviderError(LITELLM_IMAGE_REDRAW_PROVIDER, message, {
    statusCode: response.status,
    providerCode: rawStatus,
    responseData: data,
    fallbackReason
  });
}

function mapOpenRouterError(response, data) {
  const message = normalizeProviderMessage(
    data?.error?.message || data?.error || data?.message || data?.raw,
    `OpenRouter image request failed: ${response.status}`
  );
  const lowered = message.toLowerCase();
  let fallbackReason = '';
  if (response.status === 429 || /quota|rate limit|too many requests|exhausted/.test(lowered)) {
    fallbackReason = 'quota_exhausted';
  } else if (response.status === 402 || /billing|payment|insufficient|credit/.test(lowered)) {
    fallbackReason = 'billing_required';
  } else if (response.status === 404 || /not found|unavailable|unsupported model|unknown model|not supported/.test(lowered)) {
    fallbackReason = 'model_unavailable';
  } else if (response.status >= 500 || /timeout|timed out|connection|connect|overloaded|service unavailable|gateway|upstream/.test(lowered)) {
    fallbackReason = 'upstream_unavailable';
  }
  return createProviderError(OPENROUTER_IMAGE_REDRAW_PROVIDER, message, {
    statusCode: response.status,
    providerCode: String(data?.error?.code || data?.error?.type || data?.status || ''),
    responseData: data,
    fallbackReason
  });
}

export function shouldFallbackFromLiteLlmError(error) {
  if (!error || error.provider !== LITELLM_IMAGE_REDRAW_PROVIDER) return false;
  return ['quota_exhausted', 'billing_required', 'model_unavailable', 'upstream_unavailable'].includes(error.fallbackReason);
}

function shouldFallbackToSecondaryProvider(error, aiModelConfig) {
  if (!error) return false;
  if (error.provider === LITELLM_IMAGE_REDRAW_PROVIDER) {
    return shouldFallbackFromLiteLlmError(error);
  }
  if (error.provider === OPENROUTER_IMAGE_REDRAW_PROVIDER) {
    return ['quota_exhausted', 'billing_required', 'model_unavailable', 'upstream_unavailable'].includes(error.fallbackReason);
  }
  return false;
}

function isProviderConfigured(provider, env) {
  if (provider === LITELLM_IMAGE_REDRAW_PROVIDER) return isLiteLlmConfigured(env);
  if (provider === OPENROUTER_IMAGE_REDRAW_PROVIDER) return isOpenRouterConfigured(env);
  return false;
}

function buildAiRedrawAvailability(config, env) {
  return {
    liteLlmConfigured: isLiteLlmConfigured(env),
    openRouterConfigured: isOpenRouterConfigured(env),
    aiRedrawAvailable:
      isProviderConfigured(config.primaryProvider, env) ||
      (config.fallbackProvider ? isProviderConfigured(config.fallbackProvider, env) : false)
  };
}

function aiRedrawMaxImageInputBytes(config, env) {
  if (config?.primaryProvider === LITELLM_IMAGE_REDRAW_PROVIDER) return liteLlmMaxImageInputBytes(env);
  if (config?.primaryProvider === OPENROUTER_IMAGE_REDRAW_PROVIDER) return openRouterMaxImageInputBytes(env);
  return Math.max(liteLlmMaxImageInputBytes(env), openRouterMaxImageInputBytes(env));
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

async function fileToDataUrl(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return `data:${file.type || 'application/octet-stream'};base64,${bytesToBase64(bytes)}`;
}

function guessOpenRouterModalities(model = '') {
  return /gemini|image-preview|gpt-5-image|recraft|mai-image|nano-banana/i.test(model) ? ['image', 'text'] : ['image'];
}

export function buildAiRedrawPrompt(settings = {}, aiModelConfig = {}) {
  const profile = String(aiModelConfig.promptProfile || 'generic_trace_clone');
  const parts = [
    'Redraw the uploaded artwork as the best clean trace-friendly raster image for vectorization and screen printing.',
    'Preserve original subject, layout, proportions, typography, readable text, and brand identity.'
  ];

  if (String(settings.productionType || '').toLowerCase() === 'sablon') {
    parts.push('Prioritize flat color separation, bold contours, clean edges, and screen-print friendly shapes.');
  } else {
    parts.push('Prioritize crisp sticker-ready edges, clean curves, and a clear subject silhouette.');
  }

  if (settings.removeBackground !== false) {
    parts.push('Remove the background and isolate the main subject; remove shadows, glare, fabric texture, mockup texture, and photo noise.');
  } else {
    parts.push('Preserve the important background only if it supports the composition.');
  }

  if (settings.separateColors) {
    parts.push('Detect and preserve the important original colors from the source artwork, including distinct brand or logo colors.');
    parts.push('Keep colors flat, solid, and clearly separated for tracing and screen printing.');
    parts.push('Merge only noise, compression artifacts, shadows, and near-duplicate shades; do not invent new colors unless needed to repair damaged areas.');
    if (settings.colorLimitMode === 'manual') {
      const maxColors = Number.parseInt(settings.maxColors || 4, 10);
      if (Number.isInteger(maxColors) && maxColors >= 2) {
        parts.push(`When simplifying for production, target no more than ${Math.min(6, Math.max(2, maxColors))} solid spot colors for the main artwork.`);
      }
    }
    parts.push('Avoid semi-transparent pixels, soft glows, halftones, and antialiased fuzzy edges.');
  }

  if (settings.createUnderbaseFilm) {
    parts.push('Keep the silhouette suitable for a slightly choked underbase film on dark fabric.');
  }

  parts.push('Repair blur, camera distortion, jagged edges, broken strokes, stains, scratches, compression artifacts, and uneven fills.');
  parts.push('Smooth and sharpen edges for tracing while keeping corners, curves, and intentional design details accurate.');
  parts.push('Make intended geometric or symmetric shapes cleaner and balanced without changing the design identity.');

  switch (profile) {
    case 'sourceful_trace_clone':
      parts.push('Stay very close to the source image while cleaning noise, artifacts, rough edges, and damaged areas.');
      break;
    case 'gemini_trace_clone':
      parts.push('Preserve composition and readable text while improving clarity, edge definition, and trace readiness.');
      break;
    default:
      parts.push('Preserve original artwork shape and composition while making the output cleaner and easier to trace.');
      break;
  }

  parts.push('Do not add extra text, watermarks, mockups, decorative effects, shadows, or gradients.');
  return parts.join(' ');
}

function buildOpenRouterHeaders(env) {
  const headers = {
    Authorization: `Bearer ${requireEnvValue(env, 'OPENROUTER_API_KEY')}`,
    'Content-Type': 'application/json'
  };
  const siteUrl = openRouterSiteUrl(env);
  if (siteUrl) headers['HTTP-Referer'] = siteUrl;
  const appName = openRouterAppName(env);
  if (appName) headers['X-Title'] = appName;
  return headers;
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

function extractOpenRouterImageUrl(data) {
  const imageEntry = data?.choices?.[0]?.message?.images?.[0];
  return imageEntry?.image_url?.url || imageEntry?.imageUrl?.url || '';
}

function dataUrlFromBase64(data, mimeType = 'image/png') {
  return `data:${mimeType};base64,${String(data || '').trim()}`;
}

function extractLiteLlmImageUrl(data) {
  const directImageEntry = data?.choices?.[0]?.message?.images?.[0];
  if (directImageEntry?.image_url?.url || directImageEntry?.imageUrl?.url) {
    return directImageEntry.image_url?.url || directImageEntry.imageUrl?.url || '';
  }

  const messageContent = data?.choices?.[0]?.message?.content;
  if (Array.isArray(messageContent)) {
    for (const part of messageContent) {
      if (part?.type === 'image_url') {
        const imageUrl = part.image_url?.url || part.image_url;
        if (imageUrl) return imageUrl;
      }
      if ((part?.type === 'output_image' || part?.type === 'image') && part?.data) {
        return dataUrlFromBase64(part.data, part.mime_type || part.mimeType || 'image/png');
      }
    }
  }

  const imageData = data?.data?.[0]?.b64_json;
  if (imageData) {
    return dataUrlFromBase64(imageData, data?.data?.[0]?.mime_type || 'image/png');
  }

  return '';
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

function storageBaseUrl(env) {
  return `${supabaseBaseUrl(env)}/storage/v1`;
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

function isDuplicateConstraintError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('duplicate key') || message.includes('unique constraint');
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
  return `${storageBaseUrl(env)}/object/public/${EXAMPLE_JOBS_BUCKET}/${encodeStoragePath(path)}`;
}

function exampleJobPath(jobId, filename) {
  return `jobs/${jobId}/${filename}`;
}

function exampleJobPrefix(jobId) {
  return `jobs/${jobId}`;
}

function notDeletedQuery(column = 'deleted_at') {
  return `${column}=is.null`;
}

function jobIsDeleted(job = {}) {
  return Boolean(job?.deleted_at);
}

function isMissingJobsPublishColumnsError(error) {
  const message = error instanceof Error ? error.message : String(error || '');
  return /(is_example_public|example_published_at|deleted_at)/i.test(message) && /(jobs|column|schema cache)/i.test(message);
}

function isMissingProfilesTableError(error) {
  const message = error instanceof Error ? error.message : String(error || '');
  return /public\.profiles/i.test(message) && /(schema cache|does not exist|relation)/i.test(message);
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

function withLegacyJobPublishDefaults(rows = []) {
  return (rows || []).map((row) => ({
    ...row,
    is_example_public: row?.is_example_public === true,
    example_published_at: row?.example_published_at || null,
    deleted_at: row?.deleted_at || null
  }));
}

async function queryJobsWithPublishFallback(env, primaryPath, fallbackPath) {
  try {
    return await supabaseFetch(env, primaryPath, {});
  } catch (error) {
    if (!isMissingJobsPublishColumnsError(error) || !fallbackPath) throw error;
    const legacyRows = await supabaseFetch(env, fallbackPath, {});
    return withLegacyJobPublishDefaults(legacyRows);
  }
}

async function getJobByIdWithPublishFallback(env, jobId, baseSelect, fallbackSelect = baseSelect) {
  const primaryPath = `/rest/v1/jobs?id=eq.${encodeURIComponent(jobId)}&select=${baseSelect}&limit=1`;
  const fallbackPath = `/rest/v1/jobs?id=eq.${encodeURIComponent(jobId)}&select=${fallbackSelect}&limit=1`;
  const rows = await queryJobsWithPublishFallback(env, primaryPath, fallbackPath);
  return rows?.[0] || null;
}

async function patchJobPublishState(env, jobId, patch, fallbackJob) {
  try {
    const rows = await supabaseFetch(env, `/rest/v1/jobs?id=eq.${encodeURIComponent(jobId)}&select=*`, {
      method: 'PATCH',
      prefer: 'return=representation',
      body: patch
    });
    return {
      job: rows?.[0] || { ...fallbackJob, ...patch },
      usedLegacyFallback: false
    };
  } catch (error) {
    if (!isMissingJobsPublishColumnsError(error)) throw error;
    return {
      job: {
        ...fallbackJob,
        ...patch
      },
      usedLegacyFallback: true
    };
  }
}

async function softDeleteJobWithFallback(env, jobId, deletedAt, fallbackJob) {
  try {
    const rows = await supabaseFetch(env, `/rest/v1/jobs?id=eq.${encodeURIComponent(jobId)}&select=*`, {
      method: 'PATCH',
      prefer: 'return=representation',
      body: {
        deleted_at: deletedAt,
        is_example_public: false,
        example_published_at: null
      }
    });
    return {
      job: rows?.[0] || { ...fallbackJob, deleted_at: deletedAt, is_example_public: false, example_published_at: null },
      usedLegacyFallback: false
    };
  } catch (error) {
    if (!isMissingJobsPublishColumnsError(error)) throw error;
    return {
      job: {
        ...fallbackJob,
        deleted_at: deletedAt,
        is_example_public: false,
        example_published_at: null
      },
      usedLegacyFallback: true
    };
  }
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
  const jobRows =
    jobIds.length > 0
      ? await supabaseFetch(
          env,
          `/rest/v1/jobs?select=id,user_id,project_name,input_mode,production_type,status,settings,manifest,created_at&id=in.(${jobIds.join(',')})&status=eq.done&order=created_at.desc&limit=50`,
          {}
        )
      : [];
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
      supabaseUrl: hasEnvValue(env, 'SUPABASE_URL'),
      supabaseServiceRoleKey: hasEnvValue(env, 'SUPABASE_SERVICE_ROLE_KEY'),
      liteLlmConfigured: redrawAvailability.liteLlmConfigured,
      openRouterConfigured: redrawAvailability.openRouterConfigured,
      midtransConfigured: isMidtransConfigured(env),
      midtransIsProduction: isMidtransProduction(env),
      aiRedrawAvailable: redrawAvailability.aiRedrawAvailable,
      defaultAiRedrawModel,
      redrawPipeline: 'worker_auth_credit_to_litellm_primary_with_openrouter_fallback'
    },
    endpoints: [
      'GET /api/app-config',
      'POST /api/auth/signup-bonus',
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
      'GET /api/admin/midtrans-payments',
      'POST /api/admin/jobs/:jobId/set-example',
      'POST /api/admin/jobs/:jobId/unset-example',
      'POST /api/image-retouch',
      'POST /api/ai-redraw'
    ]
  });
}

async function supabaseFetch(env, path, { method = 'GET', token, body, prefer } = {}) {
  const serviceRoleKey = requireEnvValue(env, 'SUPABASE_SERVICE_ROLE_KEY');
  const response = await fetch(`${supabaseBaseUrl(env)}${path}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${token || serviceRoleKey}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(prefer ? { Prefer: prefer } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.message || data?.error || `Supabase request failed: ${response.status}`);
  }
  return data;
}

async function storageFetch(env, path, { method = 'GET', body, headers = {} } = {}) {
  const serviceRoleKey = requireEnvValue(env, 'SUPABASE_SERVICE_ROLE_KEY');
  const response = await fetch(`${storageBaseUrl(env)}${path}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      ...headers
    },
    body
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.message || data?.error || data?.msg || `Supabase storage request failed: ${response.status}`);
  }
  return data;
}

async function uploadStorageObject(env, bucket, path, bytes, contentType) {
  return storageFetch(env, `/object/${encodeURIComponent(bucket)}/${encodeStoragePath(path)}`, {
    method: 'POST',
    body: bytes,
    headers: {
      'Content-Type': contentType,
      'cache-control': '3600',
      'x-upsert': 'true'
    }
  });
}

async function deleteStorageObjects(env, bucket, prefixes) {
  const filtered = [...new Set((prefixes || []).filter(Boolean))];
  if (filtered.length === 0) return null;
  return storageFetch(env, `/object/${encodeURIComponent(bucket)}`, {
    method: 'DELETE',
    body: JSON.stringify({ prefixes: filtered }),
    headers: {
      'Content-Type': 'application/json'
    }
  });
}

async function copyStorageObject(env, bucket, sourceKey, destinationKey) {
  return storageFetch(env, '/object/copy', {
    method: 'POST',
    body: JSON.stringify({
      bucketId: bucket,
      sourceKey,
      destinationKey
    }),
    headers: {
      'Content-Type': 'application/json'
    }
  });
}

async function getPricing(env) {
  try {
    const rows = await supabaseFetch(env, '/rest/v1/pricing_rules?select=key,amount_idr,active,description&order=key.asc', {});
    return rows.reduce(
      (pricing, row) => ({
        ...pricing,
        [row.key]: row.active === false ? pricing[row.key] : Number(row.amount_idr) || pricing[row.key]
      }),
      { ...DEFAULT_PRICING }
    );
  } catch (_err) {
    return { ...DEFAULT_PRICING };
  }
}

async function getAppSetting(env, key) {
  const rows = await supabaseFetch(env, `/rest/v1/app_settings?select=key,value,is_public,description,updated_at&key=eq.${encodeURIComponent(key)}&limit=1`, {});
  return rows?.[0] || null;
}

async function getAiRedrawModelConfig(env) {
  try {
    const setting = await getAppSetting(env, 'ai_redraw_model');
    return normalizeAiRedrawModelConfig(setting?.value, env);
  } catch (_error) {
    return normalizeAiRedrawModelConfig({}, env);
  }
}

async function upsertAppSetting(env, { key, value, isPublic = true, description = '' }) {
  const rows = await supabaseFetch(env, '/rest/v1/app_settings?select=*', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: {
      key,
      value,
      is_public: isPublic,
      description,
      updated_at: formatDate(new Date())
    }
  });
  return rows?.[0] || null;
}

async function listProfilesWithBalance(env) {
  const rows = await supabaseFetch(env, '/rest/v1/profiles?select=id,email,full_name,role,is_unlimited,is_active,deleted_at,created_at&order=created_at.desc', {});
  return Promise.all(
    rows.map(async (profile) => ({
      ...profile,
      balance: profile.is_unlimited ? null : await creditBalance(env, profile.id)
    }))
  );
}

function withUserEmails(rows, users) {
  const emailById = new Map(users.map((user) => [user.id, user.email]));
  return rows.map((row) => ({
    ...row,
    user_email: emailById.get(row.user_id) || ''
  }));
}

async function getPaymentTransactionByOrderId(env, orderId) {
  const rows = await supabaseFetch(
    env,
    `/rest/v1/payment_transactions?select=*&provider=eq.${encodeURIComponent(MIDTRANS_PROVIDER)}&order_id=eq.${encodeURIComponent(orderId)}&limit=1`,
    {}
  );
  return rows?.[0] || null;
}

async function listUserMidtransPayments(env, userId) {
  return supabaseFetch(
    env,
    `/rest/v1/payment_transactions?select=id,user_id,provider,order_id,external_transaction_id,amount_idr,currency,status,payment_type,redirect_url,credited_ledger_id,paid_at,expired_at,created_at,updated_at&provider=eq.${encodeURIComponent(MIDTRANS_PROVIDER)}&user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=20`,
    {}
  );
}

async function listAdminMidtransPaymentsRows(env) {
  return supabaseFetch(
    env,
    `/rest/v1/payment_transactions?select=id,user_id,provider,order_id,external_transaction_id,amount_idr,currency,status,payment_type,credited_ledger_id,paid_at,expired_at,created_at,updated_at&provider=eq.${encodeURIComponent(MIDTRANS_PROVIDER)}&order=created_at.desc&limit=100`,
    {}
  );
}

async function listProfileEmails(env) {
  return supabaseFetch(env, '/rest/v1/profiles?select=id,email', {});
}

function withCreatedByEmails(rows, users) {
  const emailById = new Map(users.map((user) => [user.id, user.email]));
  return rows.map((row) => ({
    ...row,
    created_by_email: row.created_by ? emailById.get(row.created_by) || '' : ''
  }));
}

async function listFinanceManualPaymentsRows(env, range) {
  return supabaseFetch(
    env,
    `/rest/v1/manual_payments?select=id,user_id,marketplace,order_ref,amount_idr,status,notes,approved_by,approved_at,created_at&status=eq.approved&${buildTimestampRangeQuery('approved_at', range)}&order=approved_at.desc&limit=5000`,
    {}
  );
}

async function listFinanceGatewayPaymentsRows(env, range) {
  return supabaseFetch(
    env,
    `/rest/v1/payment_transactions?select=id,user_id,provider,order_id,external_transaction_id,amount_idr,currency,status,payment_type,credited_ledger_id,paid_at,created_at&${buildTimestampRangeQuery('paid_at', range)}&order=paid_at.desc&limit=5000`,
    {}
  );
}

async function listFinanceLedgerRows(env, range) {
  return supabaseFetch(
    env,
    `/rest/v1/credit_ledger?select=id,user_id,amount_idr,kind,reason,reference_id,created_by,metadata,created_at&${buildTimestampRangeQuery('created_at', range)}&order=created_at.desc&limit=5000`,
    {}
  );
}

async function listFinanceJobsRows(env, range) {
  return queryJobsWithPublishFallback(
    env,
    `/rest/v1/jobs?select=id,user_id,project_name,input_mode,production_type,status,price_idr,separation_film_count,created_at&${buildTimestampRangeQuery('created_at', range)}&${notDeletedQuery()}&order=created_at.desc&limit=5000`,
    `/rest/v1/jobs?select=id,user_id,project_name,input_mode,production_type,status,price_idr,separation_film_count,created_at&${buildTimestampRangeQuery('created_at', range)}&order=created_at.desc&limit=5000`
  );
}

async function listBusinessFinanceEntriesRows(env, range) {
  return supabaseFetch(
    env,
    `/rest/v1/business_finance_entries?select=id,entry_date,entry_type,cash_direction,amount_idr,counterparty,document_ref,note,tax_treatment,created_by,created_at&${buildDateRangeQuery('entry_date', range)}&order=entry_date.desc&limit=5000`,
    {}
  );
}

async function listTaxRulesRows(env) {
  return supabaseFetch(
    env,
    '/rest/v1/tax_rules?select=id,tax_code,rate_percent,effective_from,effective_to,note,created_at&order=effective_from.desc&limit=500',
    {}
  );
}

async function createBusinessFinanceEntry(env, payload) {
  const rows = await supabaseFetch(env, '/rest/v1/business_finance_entries?select=*', {
    method: 'POST',
    prefer: 'return=representation',
    body: payload
  });
  return rows?.[0] || null;
}

async function upsertTaxRule(env, payload) {
  if (payload.id) {
    const { id, ...patch } = payload;
    const rows = await supabaseFetch(env, `/rest/v1/tax_rules?id=eq.${encodeURIComponent(payload.id)}&select=*`, {
      method: 'PATCH',
      prefer: 'return=representation',
      body: patch
    });
    return rows?.[0] || null;
  }
  const rows = await supabaseFetch(env, '/rest/v1/tax_rules?select=*', {
    method: 'POST',
    prefer: 'return=representation',
    body: payload
  });
  return rows?.[0] || null;
}

async function createPaymentTransaction(env, payload) {
  const rows = await supabaseFetch(env, '/rest/v1/payment_transactions?select=*', {
    method: 'POST',
    prefer: 'return=representation',
    body: payload
  });
  return rows?.[0] || null;
}

async function updatePaymentTransactionById(env, paymentId, patch) {
  const rows = await supabaseFetch(env, `/rest/v1/payment_transactions?id=eq.${encodeURIComponent(paymentId)}&select=*`, {
    method: 'PATCH',
    prefer: 'return=representation',
    body: patch
  });
  return rows?.[0] || null;
}

async function findLedgerByReference(env, referenceId, reason) {
  const rows = await supabaseFetch(
    env,
    `/rest/v1/credit_ledger?select=id&reference_id=eq.${encodeURIComponent(referenceId)}&reason=eq.${encodeURIComponent(reason)}&limit=1`,
    {}
  );
  return rows?.[0] || null;
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
  const [users, manualPayments, gatewayPayments, ledgerEntries, businessEntries, jobs, taxRules] = await Promise.all([
    listProfileEmails(env),
    listFinanceManualPaymentsRows(env, normalizedRange),
    listFinanceGatewayPaymentsRows(env, normalizedRange),
    listFinanceLedgerRows(env, normalizedRange),
    listBusinessFinanceEntriesRows(env, normalizedRange),
    listFinanceJobsRows(env, normalizedRange),
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

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function supabaseAuthAdminFetch(env, path, { method = 'GET', body } = {}) {
  const serviceRoleKey = requireEnvValue(env, 'SUPABASE_SERVICE_ROLE_KEY');
  const response = await fetch(`${supabaseBaseUrl(env)}/auth/v1${path}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(data?.msg || data?.message || data?.error?.message || `Supabase auth admin request failed: ${response.status}`);
  }
  return data;
}

async function getUser(env, request) {
  const token = bearerToken(request);
  if (!token) throw new Error('Login dibutuhkan.');
  const serviceRoleKey = requireEnvValue(env, 'SUPABASE_SERVICE_ROLE_KEY');
  const response = await fetch(`${supabaseBaseUrl(env)}/auth/v1/user`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${token}`
    }
  });
  const user = await response.json().catch(() => null);
  if (!response.ok || !user?.id) throw new Error('Session tidak valid.');
  return { token, user };
}

async function getProfile(env, userId) {
  try {
    const rows = await supabaseFetch(
      env,
      `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,email,full_name,role,is_unlimited,is_active,deleted_at,created_at`,
      {}
    );
    const profile = rows?.[0];
    if (!profile || profile.is_active === false) throw new Error('Akun tidak aktif.');
    return profile;
  } catch (error) {
    if (!isMissingProfilesTableError(error)) throw error;
    return null;
  }
}

async function getProfileRaw(env, userId) {
  try {
    const rows = await supabaseFetch(
      env,
      `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=id,email,full_name,role,is_unlimited,is_active,deleted_at,created_at`,
      {}
    );
    return rows?.[0] || null;
  } catch (error) {
    if (!isMissingProfilesTableError(error)) throw error;
    return null;
  }
}

async function waitForProfile(env, userId, attempts = 5) {
  for (let index = 0; index < attempts; index += 1) {
    const profile = await getProfileRaw(env, userId);
    if (profile) return profile;
    if (index < attempts - 1) await sleep(200);
  }
  throw new Error('Profile user baru belum muncul di database.');
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

async function creditBalance(env, userId) {
  try {
    const rows = await supabaseFetch(
      env,
      `/rest/v1/credit_ledger?user_id=eq.${encodeURIComponent(userId)}&select=amount_idr`,
      {}
    );
    return rows.reduce((sum, row) => sum + (Number(row.amount_idr) || 0), 0);
  } catch (error) {
    if (!isMissingProfilesTableError(error)) throw error;
    return 0;
  }
}

async function insertLedger(env, { userId, amountIdr, kind, reason, referenceId, createdBy, metadata }) {
  const rows = await supabaseFetch(env, '/rest/v1/credit_ledger?select=id', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      user_id: userId,
      amount_idr: amountIdr,
      kind,
      reason,
      reference_id: referenceId || null,
      created_by: createdBy || userId,
      metadata: metadata || {}
    }
  });
  return rows?.[0];
}

async function getSignupBonusClaimByUserId(env, userId) {
  const rows = await supabaseFetch(
    env,
    `/rest/v1/signup_bonus_claims?select=*&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
    {}
  );
  return rows?.[0] || null;
}

async function countGrantedSignupBonusClaims(env, { deviceIdHash = '', ipHash = '' } = {}) {
  const counts = { device: 0, ip: 0 };

  if (deviceIdHash) {
    const rows = await supabaseFetch(
      env,
      `/rest/v1/signup_bonus_claims?select=id&bonus_granted=eq.true&device_id_hash=eq.${encodeURIComponent(deviceIdHash)}`,
      {}
    );
    counts.device = rows.length;
  }

  if (ipHash) {
    const rows = await supabaseFetch(
      env,
      `/rest/v1/signup_bonus_claims?select=id&bonus_granted=eq.true&ip_hash=eq.${encodeURIComponent(ipHash)}`,
      {}
    );
    counts.ip = rows.length;
  }

  return counts;
}

async function insertSignupBonusClaim(env, payload) {
  const rows = await supabaseFetch(env, '/rest/v1/signup_bonus_claims?select=*', {
    method: 'POST',
    prefer: 'return=representation',
    body: payload
  });
  return rows?.[0] || null;
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

async function validateAiLedgerForCommit(env, { userId, ledgerId, expectedAmountIdr }) {
  if (!ledgerId) throw new Error('AI Redraw belum terdebit. Silakan proses ulang dari tombol upload.');
  const ledgerRows = await supabaseFetch(
    env,
    `/rest/v1/credit_ledger?select=id,user_id,amount_idr,kind,reason,reference_id&id=eq.${encodeURIComponent(ledgerId)}&limit=1`,
    {}
  );
  const ledger = ledgerRows?.[0];
  if (
    !ledger ||
    ledger.user_id !== userId ||
    ledger.kind !== 'debit' ||
    ledger.reason !== 'ai_redraw' ||
    Number(ledger.amount_idr) !== -Math.abs(Number(expectedAmountIdr) || 0)
  ) {
    throw new Error('AI Redraw belum terdebit. Silakan proses ulang dari tombol upload.');
  }

  const refundRows = await supabaseFetch(
    env,
    `/rest/v1/credit_ledger?select=id&reference_id=eq.${encodeURIComponent(ledgerId)}&reason=eq.ai_redraw_refund&limit=1`,
    {}
  );
  if (refundRows?.length) throw new Error('AI Redraw sudah direfund. Silakan proses ulang dari tombol upload.');

  const usedRows = await supabaseFetch(env, `/rest/v1/jobs?select=id&ai_ledger_id=eq.${encodeURIComponent(ledgerId)}&limit=1`, {});
  if (usedRows?.length) throw new Error('AI Redraw sudah pernah dicatat. Silakan proses ulang dari tombol upload.');

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
  const pricing = await getPricing(env);
  const priceIdr = calculateDynamicJobPrice(body, pricing);
  const balance = profile.is_unlimited ? null : await creditBalance(env, profile.id);
  return json({ priceIdr, balance, isUnlimited: profile.is_unlimited, canRun: profile.is_unlimited || balance >= priceIdr });
}

async function handleCommitJob(env, request) {
  const { user, profile } = await requireUser(env, request);
  const body = await readJson(request);
  const pricing = await getPricing(env);
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

  const jobRows = await supabaseFetch(env, '/rest/v1/jobs?select=*', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
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
    }
  });
  let job = jobRows?.[0];

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
    throw new Error('AI redraw belum diaktifkan di deploy ini. Isi secret LiteLLM atau OpenRouter di Worker.');
  }
  const pricing = await getPricing(env);
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
    const responseHeaders = new Headers(upstream.headers);
    Object.entries(corsHeaders).forEach(([key, value]) => responseHeaders.set(key, value));
    responseHeaders.set('X-AI-Ledger-Id', ledger?.id || '');
    responseHeaders.set('X-AI-Redraw-Metadata', encodeBase64UrlJson(upstream.metadata || {}));
    return new Response(upstream.body, {
      status: upstream.status || 200,
      statusText: upstream.statusText || 'OK',
      headers: responseHeaders
    });
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
    liteLlmImageModel: aiModelConfig.liteLlmImageModel || '',
    openRouterGenerationModel: aiModelConfig.generationModel || '',
    openRouterFallbackModel: aiModelConfig.fallbackModel || '',
    promptProfile: aiModelConfig.promptProfile,
    imageSize: aiModelConfig.imageSize,
    generationQuality: aiModelConfig.generationQuality,
    reasoningEffort: aiModelConfig.reasoningEffort || '',
    backgroundMode: aiModelConfig.backgroundMode || '',
    preset: aiModelConfig.preset || aiModelConfig.mode || '',
    preprocess: aiModelConfig.preprocess || '',
    persistPrompt: aiModelConfig.persistPrompt !== false,
    safetyEnabled: aiModelConfig.safetyEnabled !== false,
    safetyModel: aiModelConfig.safetyModel || '',
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
      if (fallbackConfigured && fallbackProvider !== primaryProvider && shouldFallbackToSecondaryProvider(error, aiModelConfig)) {
        return requestProviderRetouchedImage(env, image, settings, aiModelConfig, {
          provider: fallbackProvider,
          fallbackAttempted: true,
          fallbackReason: error.fallbackReason || 'primary_failed'
        });
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
  if (routing.provider === LITELLM_IMAGE_REDRAW_PROVIDER) {
    return requestLiteLlmRetouchedImage(env, image, settings, aiModelConfig, routing);
  }
  if (routing.provider === OPENROUTER_IMAGE_REDRAW_PROVIDER) {
    return requestOpenRouterRetouchedImage(env, image, settings, aiModelConfig, routing);
  }
  throw new Error(`Provider AI redraw tidak didukung: ${routing.provider}`);
}

async function requestLiteLlmRetouchedImage(env, image, settings, aiModelConfig, routing) {
  const imageDataUrl = await fileToDataUrl(image);
  const prompt = buildAiRedrawPrompt(settings, aiModelConfig);
  const payload = {
    model: aiModelConfig.liteLlmImageModel,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: prompt
          },
          {
            type: 'image_url',
            image_url: {
              url: imageDataUrl
            }
          }
        ]
      }
    ],
    modalities: guessOpenRouterModalities(aiModelConfig.liteLlmImageModel),
    stream: false
  };

  if (aiModelConfig.imageSize) {
    payload.image_config = {
      image_size: aiModelConfig.imageSize
    };
  }

  let response;
  try {
    response = await fetch(`${liteLlmBaseUrl(env)}/chat/completions`, {
      method: 'POST',
      headers: buildLiteLlmHeaders(env),
      body: JSON.stringify(payload)
    });
  } catch (error) {
    throw createProviderError(LITELLM_IMAGE_REDRAW_PROVIDER, 'LiteLLM tidak dapat dihubungi.', {
      statusCode: 502,
      responseData: { cause: error instanceof Error ? error.message : String(error || '') },
      fallbackReason: 'upstream_unavailable'
    });
  }

  const data = await parseJsonResponse(response);

  if (!response.ok) {
    throw mapLiteLlmError(response, data);
  }

  const imageUrl = extractLiteLlmImageUrl(data);
  if (!imageUrl) {
    throw createProviderError(LITELLM_IMAGE_REDRAW_PROVIDER, 'LiteLLM tidak mengembalikan gambar.', {
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
      providerUsed: LITELLM_IMAGE_REDRAW_PROVIDER,
      model: aiModelConfig.liteLlmImageModel,
      fallbackAttempted: routing.fallbackAttempted,
      fallbackReason: routing.fallbackReason,
      finalTechnicalPrompt: prompt
    })
  };
}

async function requestOpenRouterRetouchedImage(env, image, settings, aiModelConfig, routing) {
  const imageDataUrl = await fileToDataUrl(image);
  const prompt = buildAiRedrawPrompt(settings, aiModelConfig);
  const availableModels = [aiModelConfig.generationModel, aiModelConfig.fallbackModel].filter((value, index, list) => value && list.indexOf(value) === index);
  const modelSequence = availableModels.length > 0 ? availableModels : [aiModelConfig.generationModel].filter(Boolean);
  let lastError = null;

  for (const [index, model] of modelSequence.entries()) {
    try {
      const payload = {
        model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageDataUrl
                }
              }
            ]
          }
        ],
        modalities: guessOpenRouterModalities(model),
        stream: false
      };

      if (aiModelConfig.imageSize) {
        payload.image_config = {
          image_size: aiModelConfig.imageSize
        };
      }

      let response;
      try {
        response = await fetch(`${openRouterBaseUrl(env)}/chat/completions`, {
          method: 'POST',
          headers: buildOpenRouterHeaders(env),
          body: JSON.stringify(payload)
        });
      } catch (error) {
        throw createProviderError(OPENROUTER_IMAGE_REDRAW_PROVIDER, 'OpenRouter tidak dapat dihubungi.', {
          statusCode: 502,
          responseData: { cause: error instanceof Error ? error.message : String(error || '') },
          fallbackReason: 'upstream_unavailable'
        });
      }
      const data = await parseJsonResponse(response);

      if (!response.ok) {
        throw mapOpenRouterError(response, data);
      }

      const imageUrl = extractOpenRouterImageUrl(data);
      if (!imageUrl) {
        throw createProviderError(OPENROUTER_IMAGE_REDRAW_PROVIDER, 'OpenRouter tidak mengembalikan gambar.', {
          statusCode: 502,
          responseData: data
        });
      }

      const imageResponse = await downloadGeneratedImage(imageUrl);
      const metadata = buildAiRedrawMetadata(aiModelConfig, image, {
        providerUsed: OPENROUTER_IMAGE_REDRAW_PROVIDER,
        model,
        fallbackModelUsed: index > 0,
        generatedImageCount: Array.isArray(data?.choices?.[0]?.message?.images) ? data.choices[0].message.images.length : 1,
        fallbackAttempted: routing.fallbackAttempted,
        fallbackReason: routing.fallbackReason,
        finalTechnicalPrompt: prompt
      });

      return {
        body: imageResponse.body,
        status: imageResponse.status,
        statusText: imageResponse.statusText,
        headers: imageResponse.headers,
        metadata
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || createProviderError(OPENROUTER_IMAGE_REDRAW_PROVIDER, 'Gambar ulang OpenRouter gagal diproses.', { statusCode: 502 });
}

export function getAiRedrawModelPresets() {
  return HYBRID_REDRAW_PRESETS;
}

async function handleJobArtifactsUpload(env, request, jobId) {
  const { user, profile } = await requireUser(env, request);
  if (!isSuperuserProfile(profile, user.email)) {
    throw new Error('Hanya superadmin yang boleh mengunggah artefak contoh.');
  }

  const job = await getJobByIdWithPublishFallback(
    env,
    jobId,
    'id,user_id,project_name,input_mode,production_type,status,settings,manifest,deleted_at',
    'id,user_id,project_name,input_mode,production_type,status,settings,manifest'
  );
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

  await uploadStorageObject(env, EXAMPLE_JOBS_BUCKET, sourcePreviewPath, await fileToUint8Array(sourcePreview), sourcePreview.type || 'image/png');
  await uploadStorageObject(env, EXAMPLE_JOBS_BUCKET, resultPreviewPath, await fileToUint8Array(fullPng), fullPng.type || 'image/png');
  await uploadStorageObject(env, EXAMPLE_JOBS_BUCKET, fullSvgPath, await fileToUint8Array(fullSvg), fullSvg.type || 'image/svg+xml');
  await uploadStorageObject(env, EXAMPLE_JOBS_BUCKET, fullPdfPath, await fileToUint8Array(fullPdf), fullPdf.type || 'application/pdf');
  await uploadStorageObject(env, EXAMPLE_JOBS_BUCKET, zipPath, await fileToUint8Array(zip), zip.type || 'application/zip');

  if (stickerCutlineSvgPath) {
    await uploadStorageObject(env, EXAMPLE_JOBS_BUCKET, stickerCutlineSvgPath, await fileToUint8Array(stickerCutlineSvg), stickerCutlineSvg.type || 'image/svg+xml');
  }
  if (stickerCutlinePdfPath) {
    await uploadStorageObject(env, EXAMPLE_JOBS_BUCKET, stickerCutlinePdfPath, await fileToUint8Array(stickerCutlinePdf), stickerCutlinePdf.type || 'application/pdf');
  }
  if (separationZipPath) {
    await uploadStorageObject(env, EXAMPLE_JOBS_BUCKET, separationZipPath, await fileToUint8Array(separationZip), separationZip.type || 'application/zip');
  }

  const uploadedSeparations = [];
  for (let index = 0; index < manifest.separations.length; index += 1) {
    const separation = manifest.separations[index];
    const slug = separation.kind === 'underbase' ? 'underbase' : `color-${String(separation.index).padStart(2, '0')}`;
    const svgPath = exampleJobPath(job.id, `separations/film-${slug}.svg`);
    const pdfPath = exampleJobPath(job.id, `separations/film-${slug}.pdf`);
    const previewPath = exampleJobPath(job.id, `separations/film-${slug}-preview.png`);

    await uploadStorageObject(env, EXAMPLE_JOBS_BUCKET, svgPath, await fileToUint8Array(separationSvgs[index]), separationSvgs[index].type || 'image/svg+xml');
    await uploadStorageObject(env, EXAMPLE_JOBS_BUCKET, pdfPath, await fileToUint8Array(separationPdfs[index]), separationPdfs[index].type || 'application/pdf');
    await uploadStorageObject(env, EXAMPLE_JOBS_BUCKET, previewPath, await fileToUint8Array(separationPreviews[index]), separationPreviews[index].type || 'image/png');

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

  await uploadStorageObject(
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
  const updatedRows = await supabaseFetch(env, `/rest/v1/jobs?id=eq.${encodeURIComponent(job.id)}&select=*`, {
    method: 'PATCH',
    prefer: 'return=representation',
    body: { manifest: nextManifest }
  });

  return json({
    jobId: job.id,
    exampleArtifacts,
    job: updatedRows?.[0] || { ...job, manifest: nextManifest }
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
    if (password.length < 6) throw new Error('Password minimal 6 karakter.');

    const created = await supabaseAuthAdminFetch(env, '/admin/users', {
      method: 'POST',
      body: {
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName || email.split('@')[0]
        }
      }
    });

    const profile = await waitForProfile(env, created.user?.id);
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
      const rows = await supabaseFetch(env, `/rest/v1/profiles?id=eq.${encodeURIComponent(profile.id)}&select=*`, {
        method: 'PATCH',
        prefer: 'return=representation',
        body: patch
      });
      updatedProfile = rows?.[0] || profile;
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
    await supabaseAuthAdminFetch(env, `/admin/users/${encodeURIComponent(body.userId)}`, {
      method: 'DELETE'
    });
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

  const rows = await supabaseFetch(env, `/rest/v1/profiles?id=eq.${encodeURIComponent(body.userId)}&select=*`, {
    method: 'PATCH',
    prefer: 'return=representation',
    body: allowed
  });
  const user = rows?.[0];
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
  const rows = await supabaseFetch(env, '/rest/v1/manual_payments?select=*', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      user_id: user.id,
      marketplace: 'shopee',
      order_ref: body.orderRef || '',
      amount_idr: amountIdr,
      notes: body.notes || '',
      status: 'pending'
    }
  });
  return json({ payment: rows?.[0] });
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

async function handleListMidtransPayments(env, request) {
  const { user } = await requireUser(env, request);
  const payments = await listUserMidtransPayments(env, user.id);
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

async function handleSignupBonusClaim(env, request) {
  const { user } = await requireUser(env, request);
  const body = await readJson(request);
  const deviceId = String(body.deviceId || '').trim();
  if (!deviceId) throw new Error('Device ID wajib dikirim.');

  const existingClaim = await getSignupBonusClaimByUserId(env, user.id);
  if (existingClaim) {
    await ensureSignupBonusLedger(env, existingClaim);
    return json({
      granted: existingClaim.bonus_granted === true,
      alreadyProcessed: true,
      amountIdr: existingClaim.bonus_granted === true ? SIGNUP_BONUS_AMOUNT_IDR : 0,
      reason: existingClaim.reason || (existingClaim.bonus_granted === true ? 'granted' : 'limit_reached'),
      remainingEligibleByDeviceOrIp: null
    });
  }

  const email = normalizeEmail(user.email || user.user_metadata?.email || '');
  const countryCode = getViewerCountryCode(request);
  const deviceIdHash = await hashSignupBonusIdentifier(env, deviceId);
  const ipHash = await hashSignupBonusIdentifier(env, extractRequestIp(request));
  const grantedCounts = await countGrantedSignupBonusClaims(env, { deviceIdHash, ipHash });
  const isGranted = shouldGrantSignupBonus({
    deviceGrantedClaims: grantedCounts.device,
    ipGrantedClaims: grantedCounts.ip
  });

  let claim;
  try {
    claim = await insertSignupBonusClaim(env, {
      user_id: user.id,
      email,
      device_id_hash: deviceIdHash || null,
      ip_hash: ipHash || null,
      country_code: countryCode || null,
      bonus_granted: isGranted,
      reason: isGranted ? 'granted' : 'limit_reached',
      metadata: {
        matchedGrantedDeviceClaims: grantedCounts.device,
        matchedGrantedIpClaims: grantedCounts.ip,
        maxMatchedClaims: SIGNUP_BONUS_MAX_MATCHED_CLAIMS
      }
    });
  } catch (error) {
    if (!String(error.message || '').includes('signup_bonus_claims_user_id_key')) throw error;
    claim = await getSignupBonusClaimByUserId(env, user.id);
  }

  if (!claim) throw new Error('Claim signup bonus tidak bisa diproses.');
  if (claim.bonus_granted === true) {
    await ensureSignupBonusLedger(env, claim);
  }

  const highestMatchedCount = Math.max(grantedCounts.device, grantedCounts.ip);
  const remainingEligibleByDeviceOrIp = Math.max(0, SIGNUP_BONUS_MAX_MATCHED_CLAIMS - highestMatchedCount - (isGranted ? 1 : 0));
  return json({
    granted: claim.bonus_granted === true,
    alreadyProcessed: false,
    amountIdr: claim.bonus_granted === true ? SIGNUP_BONUS_AMOUNT_IDR : 0,
    reason: claim.reason || (claim.bonus_granted === true ? 'granted' : 'limit_reached'),
    remainingEligibleByDeviceOrIp
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
  const rows = await supabaseFetch(env, '/rest/v1/app_settings?select=key,value,is_public&is_public=eq.true&order=key.asc', {});
  const aiRedrawModel = await getAiRedrawModelConfig(env);
  const redrawAvailability = buildAiRedrawAvailability(aiRedrawModel, env);
  return json({
    settings: Object.fromEntries(rows.map((row) => [row.key, row.value])),
    features: {
      aiRedrawAvailable: redrawAvailability.aiRedrawAvailable,
      aiRedrawPrimaryProvider: aiRedrawModel.primaryProvider,
      aiRedrawFallbackProvider: aiRedrawModel.fallbackProvider || '',
      liteLlmConfigured: redrawAvailability.liteLlmConfigured,
      openRouterConfigured: redrawAvailability.openRouterConfigured,
      midtransAvailable: isMidtransConfigured(env),
      midtransIsProduction: isMidtransProduction(env),
      midtransMinimumAmountIdr: MIDTRANS_MIN_AMOUNT_IDR
    },
    viewer: {
      countryCode: getViewerCountryCode(request),
      defaultLocale: getViewerDefaultLocale(request)
    }
  });
}

async function handleAdminOverview(env, request) {
  await requireAdmin(env, request);
  const [users, jobs, payments, ledger] = await Promise.all([
    supabaseFetch(env, '/rest/v1/profiles?select=id,is_active,is_unlimited,deleted_at', {}),
    queryJobsWithPublishFallback(
      env,
      `/rest/v1/jobs?select=id,price_idr,production_type,input_mode,created_at,deleted_at&${notDeletedQuery()}&order=created_at.desc&limit=500`,
      '/rest/v1/jobs?select=id,price_idr,production_type,input_mode,created_at&order=created_at.desc&limit=500'
    ),
    supabaseFetch(env, '/rest/v1/manual_payments?select=id,status,amount_idr,created_at&order=created_at.desc&limit=500', {}),
    supabaseFetch(env, '/rest/v1/credit_ledger?select=amount_idr,kind,reason,created_at&order=created_at.desc&limit=500', {})
  ]);
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const recentJobs = jobs.filter((job) => new Date(job.created_at).getTime() >= sevenDaysAgo);
  return json({
    overview: {
      totalUsers: users.length,
      activeUsers: users.filter((user) => user.is_active && !user.deleted_at).length,
      unlimitedUsers: users.filter((user) => user.is_unlimited).length,
      totalJobs: jobs.length,
      jobsLast7Days: recentJobs.length,
      totalJobValueIdr: jobs.reduce((sum, job) => sum + (Number(job.price_idr) || 0), 0),
      pendingPayments: payments.filter((payment) => payment.status === 'pending').length,
      approvedPayments: payments.filter((payment) => payment.status === 'approved').length,
      approvedPaymentIdr: payments.filter((payment) => payment.status === 'approved').reduce((sum, payment) => sum + (Number(payment.amount_idr) || 0), 0),
      creditAddedIdr: ledger.filter((entry) => entry.amount_idr > 0).reduce((sum, entry) => sum + Number(entry.amount_idr), 0),
      creditUsedIdr: Math.abs(ledger.filter((entry) => entry.amount_idr < 0).reduce((sum, entry) => sum + Number(entry.amount_idr), 0))
    }
  });
}

async function handleAdminJobs(env, request) {
  await requireAdmin(env, request);
  const [users, jobs, exampleSetting] = await Promise.all([
    supabaseFetch(env, '/rest/v1/profiles?select=id,email,role', {}),
    queryJobsWithPublishFallback(
      env,
      `/rest/v1/jobs?select=id,user_id,project_name,input_mode,production_type,status,price_idr,separation_film_count,created_at,manifest,is_example_public,example_published_at,deleted_at&${notDeletedQuery()}&order=created_at.desc&limit=100`,
      '/rest/v1/jobs?select=id,user_id,project_name,input_mode,production_type,status,price_idr,separation_film_count,created_at,manifest&order=created_at.desc&limit=100'
    ),
    getAppSetting(env, 'example_jobs')
  ]);
  const decorated = decorateAdminJobs(jobs, users, exampleSetting?.value);
  return json({
    jobs: decorated.map(({ manifest, ...job }) => job)
  });
}

async function handleExampleJobs(env, request) {
  await requireUser(env, request);
  let profiles = [];
  let jobs = [];
  try {
    [profiles, jobs] = await Promise.all([
      supabaseFetch(env, '/rest/v1/profiles?select=id,email,role', {}),
      queryJobsWithPublishFallback(
        env,
        `/rest/v1/jobs?select=id,user_id,project_name,input_mode,production_type,status,settings,manifest,created_at,is_example_public,example_published_at,deleted_at&is_example_public=eq.true&status=eq.done&${notDeletedQuery()}&order=created_at.desc&limit=200`,
        null
      )
    ]);
  } catch (error) {
    if (!isMissingJobsPublishColumnsError(error) && !isMissingProfilesTableError(error)) throw error;
    return json({ exampleJobs: await listLegacyPublishedExampleJobs(env) });
  }

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
  const users = await supabaseFetch(env, '/rest/v1/profiles?select=id,email', {});
  const payments = await supabaseFetch(env, '/rest/v1/manual_payments?select=id,user_id,marketplace,order_ref,amount_idr,status,notes,rejected_reason,approved_at,created_at,updated_at&order=created_at.desc&limit=100', {});
  return json({ payments: withUserEmails(payments, users) });
}

async function handleAdminMidtransPayments(env, request) {
  await requireAdmin(env, request);
  const users = await supabaseFetch(env, '/rest/v1/profiles?select=id,email', {});
  const payments = await listAdminMidtransPaymentsRows(env);
  return json({ payments: withUserEmails(payments, users) });
}

async function handleRejectPayment(env, request, paymentId) {
  const admin = await requireAdmin(env, request);
  const body = await readJson(request);
  const updated = await supabaseFetch(env, `/rest/v1/manual_payments?id=eq.${encodeURIComponent(paymentId)}&select=*`, {
    method: 'PATCH',
    prefer: 'return=representation',
    body: {
      status: 'rejected',
      rejected_reason: body.reason || '',
      approved_by: admin.user.id,
      approved_at: null
    }
  });
  return json({ payment: updated?.[0] });
}

async function handleAdminPricingRules(env, request) {
  await requireAdmin(env, request);
  if (request.method === 'GET') {
    const rules = await supabaseFetch(env, '/rest/v1/pricing_rules?select=key,amount_idr,active,description,updated_at&order=key.asc', {});
    return json({ rules });
  }

  const body = await readJson(request);
  const amountIdr = Number.parseInt(body.amountIdr, 10);
  if (!body.key || !Number.isInteger(amountIdr) || amountIdr < 0) throw new Error('Aturan harga tidak valid.');
  const rows = await supabaseFetch(env, '/rest/v1/pricing_rules?select=*', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: {
      key: body.key,
      amount_idr: amountIdr,
      active: body.active !== false,
      description: body.description || '',
      updated_at: formatDate(new Date())
    }
  });
  return json({ rule: rows?.[0] });
}

async function handleAdminSettings(env, request) {
  await requireAdmin(env, request);
  if (request.method === 'GET') {
    const rows = await supabaseFetch(env, '/rest/v1/app_settings?select=key,value,is_public,description,updated_at&order=key.asc', {});
    return json({ settings: rows });
  }

  const body = await readJson(request);
  if (!body.key) throw new Error('Key setting wajib diisi.');
  const normalizedValue = body.key === 'ai_redraw_model' ? normalizeAiRedrawModelConfig(body.value, env) : body.value || {};
  const rows = await supabaseFetch(env, '/rest/v1/app_settings?select=*', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: {
      key: body.key,
      value: normalizedValue,
      is_public: body.isPublic !== false,
      description: body.description || '',
      updated_at: formatDate(new Date())
    }
  });
  return json({ setting: rows?.[0] });
}

async function handleSetExampleJob(env, request, jobId) {
  await requireAdmin(env, request);
  const [job, profiles] = await Promise.all([
    getJobByIdWithPublishFallback(
      env,
      jobId,
      'id,user_id,project_name,input_mode,production_type,status,settings,manifest,is_example_public,example_published_at,deleted_at,created_at',
      'id,user_id,project_name,input_mode,production_type,status,settings,manifest,created_at'
    ),
    supabaseFetch(env, '/rest/v1/profiles?select=id,email,role', {})
  ]);

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
  const publishResult = await patchJobPublishState(
    env,
    job.id,
    {
      is_example_public: true,
      example_published_at: publishedAt
    },
    job
  );
  const updatedJob = publishResult.job;
  const nextExamples = await syncLegacyExampleSetting(env, updatedJob, artifacts);

  return json({
    jobId: updatedJob.id,
    productionType: updatedJob.production_type,
    isExamplePublic: true,
    examplePublishedAt: updatedJob.example_published_at,
    exampleJobs: nextExamples
  });
}

async function handleUnsetExampleJob(env, request, jobId) {
  await requireAdmin(env, request);
  const [job, profiles] = await Promise.all([
    getJobByIdWithPublishFallback(
      env,
      jobId,
      'id,user_id,project_name,input_mode,production_type,status,settings,manifest,is_example_public,example_published_at,deleted_at,created_at',
      'id,user_id,project_name,input_mode,production_type,status,settings,manifest,created_at'
    ),
    supabaseFetch(env, '/rest/v1/profiles?select=id,email,role', {})
  ]);

  if (!job) throw new Error('Job tidak ditemukan.');
  if (jobIsDeleted(job)) throw new Error('Job ini sudah dihapus.');

  const owner = profiles.find((profile) => profile.id === job.user_id);
  if (!owner || !isSuperuserProfile(owner, owner.email)) throw new Error('Hanya job milik superadmin yang bisa dicabut dari contoh.');

  const publishResult = await patchJobPublishState(
    env,
    job.id,
    {
      is_example_public: false,
      example_published_at: null
    },
    job
  );
  await clearLegacyExampleSettingIfMatches(env, job);

  return json({
    jobId: job.id,
    isExamplePublic: false,
    job: publishResult.job
  });
}

async function handleDeleteJob(env, request, jobId) {
  const { user } = await requireUser(env, request);
  const job = await getJobByIdWithPublishFallback(
    env,
    jobId,
    'id,user_id,production_type,status,manifest,is_example_public,example_published_at,deleted_at',
    'id,user_id,production_type,status,manifest'
  );
  if (!job) throw new Error('Job tidak ditemukan.');
  if (job.user_id !== user.id) throw new Error('Hanya pemilik job yang boleh menghapus job ini.');
  const hasExampleArtifacts = Boolean(getExampleArtifactsFromManifest(job.manifest));
  if (!jobIsDeleted(job) && hasExampleArtifacts) {
    await deleteStorageObjects(env, EXAMPLE_JOBS_BUCKET, [exampleJobPrefix(job.id)]);
  }
  await clearLegacyExampleSettingIfMatches(env, job);
  if (jobIsDeleted(job)) {
    return json({ jobId: job.id, deleted: true });
  }

  const deletedAt = formatDate(new Date());
  const deleteResult = await softDeleteJobWithFallback(env, job.id, deletedAt, job);

  return json({
    jobId: job.id,
    deleted: true,
    deletedAt,
    metadataDeleted: deleteResult.usedLegacyFallback === false,
    job: deleteResult.job
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
  const rows = await supabaseFetch(env, `/rest/v1/manual_payments?id=eq.${encodeURIComponent(paymentId)}&select=*`, {});
  const payment = rows?.[0];
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
  const updated = await supabaseFetch(env, `/rest/v1/manual_payments?id=eq.${encodeURIComponent(paymentId)}&select=*`, {
    method: 'PATCH',
    prefer: 'return=representation',
    body: { status: 'approved', approved_by: admin.user.id, approved_at: new Date().toISOString() }
  });
  return json({ payment: updated?.[0] });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
    const url = new URL(request.url);
    try {
      if ((url.pathname === '/' || url.pathname === '/health') && request.method === 'GET') return handleHealth(env);
      if (url.pathname === '/api/app-config' && request.method === 'GET') return await handleAppConfig(env, request);
      if (url.pathname === '/api/auth/signup-bonus' && request.method === 'POST') return await handleSignupBonusClaim(env, request);
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
      if (url.pathname === '/api/admin/midtrans-payments' && request.method === 'GET') return await handleAdminMidtransPayments(env, request);
      if (url.pathname === '/api/admin/finance/summary' && request.method === 'GET') return await handleAdminFinanceSummary(env, request);
      if (url.pathname === '/api/admin/finance/transactions' && request.method === 'GET') return await handleAdminFinanceTransactions(env, request);
      if (url.pathname === '/api/admin/finance/usage' && request.method === 'GET') return await handleAdminFinanceUsage(env, request);
      if (url.pathname === '/api/admin/finance/export.csv' && request.method === 'GET') return await handleAdminFinanceExport(env, request);
      if (url.pathname === '/api/admin/finance/business-entries') return await handleAdminBusinessFinanceEntries(env, request);
      if (url.pathname === '/api/admin/finance/tax-rules') return await handleAdminTaxRules(env, request);
      if (url.pathname === '/api/admin/pricing-rules') return await handleAdminPricingRules(env, request);
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
      return error('Endpoint tidak ditemukan.', 404);
    } catch (err) {
      const message = err.message || 'Server error.';
      const status = message.includes('ditolak') || message.startsWith('Hanya ') ? 403 : 400;
      return error(message, status);
    }
  }
};
