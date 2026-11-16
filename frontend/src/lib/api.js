import { buildAdminFinanceExportFilename, buildAdminFinanceQuery } from './adminFinance.js';

export const API_BASE_URL = (import.meta.env?.VITE_API_BASE_URL || '').replace(/\/+$/, '');

function isNetworkLikeError(message = '') {
  const normalized = String(message).toLowerCase();
  return normalized.includes('failed to fetch') || normalized.includes('networkerror') || normalized.includes('load failed');
}

function isMissingSchemaError(message = '') {
  const normalized = String(message).toLowerCase();
  return normalized.includes('schema cache') || normalized.includes('public.profiles') || normalized.includes('relation') && normalized.includes('does not exist');
}

export function toUserApiError(error, fallbackMessage) {
  const message = error instanceof Error ? error.message : String(error || '');
  if (message.includes('VITE_API_BASE_URL')) {
    return new Error('Koneksi ke layanan belum tersambung. Periksa URL API aplikasi.');
  }
  if (isMissingSchemaError(message)) {
    return new Error('Struktur database aplikasi belum lengkap. Jalankan migration D1 (cloudflare-worker/d1) agar tabel profiles dan relasinya terbentuk.');
  }
  if (isNetworkLikeError(message)) {
    return new Error(fallbackMessage || 'Koneksi ke layanan belum tersambung. Coba lagi beberapa saat.');
  }
  return error instanceof Error ? error : new Error(fallbackMessage || 'Terjadi kendala saat menghubungi layanan.');
}

export function absoluteUrl(path) {
  if (!path) return '';
  if (path.startsWith('http') || path.startsWith('blob:') || path.startsWith('data:')) return path;
  if (!API_BASE_URL) return path;
  return `${API_BASE_URL}${path}`;
}

function decodeBase64UrlJson(value) {
  if (!value) return null;
  try {
    const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(window.atob(padded));
  } catch {
    return null;
  }
}

function base64ToBlob(base64, mimeType = 'application/octet-stream') {
  const binary = window.atob(base64 || '');
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

function artifactToBlob(artifact) {
  if (!artifact?.base64) return null;
  return base64ToBlob(artifact.base64, artifact.mimeType);
}

function blobUrl(blob) {
  return blob instanceof Blob ? URL.createObjectURL(blob) : '';
}

export function hydrateBackendRetouchResult(data, settings) {
  const artifacts = data.artifacts || {};
  const aiRawPngBlob = artifactToBlob(artifacts.aiRawPng);
  const tracedPngBlob = artifactToBlob(artifacts.tracedPng);
  const fullPngBlob = artifactToBlob(artifacts.fullPng);
  const fullSvgBlob = artifactToBlob(artifacts.fullSvg);
  const fullPdfBlob = artifactToBlob(artifacts.fullPdf);
  const stickerCutlineSvgBlob = artifactToBlob(artifacts.stickerCutlineSvg);
  const stickerCutlinePdfBlob = artifactToBlob(artifacts.stickerCutlinePdf);
  const zipBlob = artifactToBlob(artifacts.zip);
  const separationZipBlob = artifactToBlob(artifacts.separationZip);
  const separations = (artifacts.separations || []).map((film) => {
    const svgBlob = artifactToBlob(film.svg);
    const pdfBlob = artifactToBlob(film.pdf);
    const previewBlob = artifactToBlob(film.preview);
    return {
      index: film.index,
      kind: film.kind || 'color',
      hex: film.hex || '#000000',
      label: film.label || '',
      spotName: film.spotName || '',
      chokePx: film.chokePx || 0,
      svg: blobUrl(svgBlob),
      pdf: blobUrl(pdfBlob),
      preview: blobUrl(previewBlob),
      svgBlob,
      pdfBlob,
      previewBlob
    };
  });

  const artifactBlobs = {
    aiRawPng: aiRawPngBlob,
    tracedPng: tracedPngBlob,
    fullPng: fullPngBlob,
    fullSvg: fullSvgBlob,
    fullPdf: fullPdfBlob,
    stickerCutlineSvg: stickerCutlineSvgBlob,
    stickerCutlinePdf: stickerCutlinePdfBlob,
    zip: zipBlob,
    separationZip: separationZipBlob,
    separations
  };

  const localResult = {
    jobId: `backend-logo-${Date.now()}`,
    status: 'done',
    progress: 100,
    message: data.message || 'Selesai diproses backend.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    localOnly: true,
    backendVectorized: true,
    separationFilmCount: data.separationFilmCount || 0,
    prepressQuality: data.prepressQuality || data.manifest?.prepressQuality || null,
    palette: data.palette || [],
    settings: data.settings || settings,
    files: {
      aiRawPng: blobUrl(aiRawPngBlob),
      tracedPng: blobUrl(tracedPngBlob || fullPngBlob),
      fullPng: blobUrl(fullPngBlob || tracedPngBlob),
      fullSvg: blobUrl(fullSvgBlob),
      fullPdf: blobUrl(fullPdfBlob),
      stickerCutlineSvg: blobUrl(stickerCutlineSvgBlob),
      stickerCutlinePdf: blobUrl(stickerCutlinePdfBlob),
      zip: blobUrl(zipBlob),
      separationZip: blobUrl(separationZipBlob),
      separations
    },
    artifactBlobs,
    manifest: data.manifest || {}
  };

  const outputPngBlob = tracedPngBlob || fullPngBlob;
  const hasBackendTraceArtifacts = Boolean(outputPngBlob || fullSvgBlob || fullPdfBlob || zipBlob || separationZipBlob || separations.length);
  if (!hasBackendTraceArtifacts && aiRawPngBlob) {
    return {
      localResult: null,
      aiRawPngBlob,
      pngFile: new File([aiRawPngBlob], artifacts.aiRawPng?.filename || 'hasil-ai-mentah.png', {
        type: aiRawPngBlob.type || 'image/png'
      })
    };
  }
  const pngFile = outputPngBlob
    ? new File([outputPngBlob], artifacts.tracedPng?.filename || artifacts.fullPng?.filename || 'hasil-trace.png', { type: outputPngBlob.type || 'image/png' })
    : null;

  return { localResult, aiRawPngBlob, pngFile };
}

let authTokenProvider = null;

export function registerAuthTokenProvider(provider) {
  authTokenProvider = provider && typeof provider === 'object' ? provider : null;
}

function isAuthTokenErrorMessage(message = '') {
  const normalized = String(message || '').toLowerCase();
  return normalized.includes('session') || normalized.includes('login dibutuhkan');
}

async function resolveAccessToken(accessToken) {
  if (!accessToken) return '';
  if (typeof authTokenProvider?.getValidAccessToken === 'function') {
    const fresh = await authTokenProvider.getValidAccessToken(accessToken);
    if (fresh) return fresh;
  }
  return accessToken;
}

function buildRequestBodyAndHeaders({ body, accessToken, headers = {}, defaultJsonContentType = true }) {
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  const isBinaryBody = typeof Blob !== 'undefined' && body instanceof Blob;
  const shouldSetJson = defaultJsonContentType && !isFormData && !isBinaryBody;
  return {
    requestHeaders: {
      ...(shouldSetJson ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers
    },
    requestBody: isFormData || isBinaryBody || typeof body === 'string' ? body : body ? JSON.stringify(body) : undefined
  };
}

async function authorizedFetch(
  path,
  { accessToken = '', method = 'GET', body, headers = {}, networkFallbackMessage = 'Koneksi ke layanan belum tersambung. Periksa URL API aplikasi.', defaultJsonContentType = true } = {}
) {
  const token = await resolveAccessToken(accessToken);

  async function sendWithToken(activeToken) {
    const { requestHeaders, requestBody } = buildRequestBodyAndHeaders({
      body,
      accessToken: activeToken,
      headers,
      defaultJsonContentType
    });
    try {
      return await fetch(`${API_BASE_URL}${path}`, {
        method,
        headers: requestHeaders,
        body: requestBody
      });
    } catch (error) {
      throw toUserApiError(error, networkFallbackMessage);
    }
  }

  let response = await sendWithToken(token);
  if (!response.ok && token && typeof authTokenProvider?.refreshAccessToken === 'function' && [400, 401, 403].includes(response.status)) {
    const contentType = response.headers.get('content-type') || '';
    const errPayload = contentType.includes('application/json') ? await response.clone().json().catch(() => null) : null;
    if (response.status === 401 || isAuthTokenErrorMessage(errPayload?.error)) {
      const refreshedToken = await authTokenProvider.refreshAccessToken().catch(() => '');
      if (refreshedToken && refreshedToken !== token) {
        response = await sendWithToken(refreshedToken);
      }
    }
  }
  return response;
}

async function apiFetch(path, { accessToken, method = 'GET', body, headers = {} } = {}) {
  const response = await authorizedFetch(path, { accessToken, method, body, headers });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json().catch(() => ({})) : await response.blob();
  if (!response.ok) {
    throw new Error(data?.error || 'Request API gagal.');
  }
  return data;
}

async function apiFetchBlob(path, { accessToken, method = 'GET', headers = {} } = {}) {
  const response = await authorizedFetch(path, { accessToken, method, headers, defaultJsonContentType: false });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data?.error || 'Request API gagal.');
  }

  return response.blob();
}

export async function getBalance(accessToken) {
  return apiFetch('/api/me/balance', { accessToken });
}

export async function quoteJob(payload, accessToken) {
  return apiFetch('/api/jobs/quote', {
    method: 'POST',
    accessToken,
    body: payload
  });
}

export async function commitJob(payload, accessToken) {
  return apiFetch('/api/jobs/commit', {
    method: 'POST',
    accessToken,
    body: payload
  });
}

function collectExampleArtifactUploads(formData) {
  let manifest = {};
  try {
    manifest = JSON.parse(String(formData.get('manifest') || '{}'));
  } catch {
    manifest = {};
  }

  const uploads = [];
  const staticPairs = [
    ['sourcePreview', 'source-preview.png'],
    ['fullPng', 'preview-full-color.png'],
    ['fullSvg', 'full-vector.svg'],
    ['fullPdf', 'full-vector.pdf'],
    ['stickerCutlineSvg', 'sticker-cutline.svg'],
    ['stickerCutlinePdf', 'sticker-cutline.pdf'],
    ['zip', 'result.zip'],
    ['separationZip', 'separation-films.zip']
  ];

  for (const [fieldKey, relativePath] of staticPairs) {
    const file = formData.get(fieldKey);
    if (file instanceof Blob) {
      uploads.push({ path: relativePath, file });
    }
  }

  const separationSvgs = formData.getAll('separationSvg').filter((item) => item instanceof Blob);
  const separationPdfs = formData.getAll('separationPdf').filter((item) => item instanceof Blob);
  const separationPreviews = formData.getAll('separationPreview').filter((item) => item instanceof Blob);
  const separations = Array.isArray(manifest?.separations) ? manifest.separations : [];

  separations.forEach((separation, index) => {
    const slug = separation.kind === 'underbase' ? 'underbase' : `color-${String(separation.index).padStart(2, '0')}`;
    if (separationSvgs[index]) uploads.push({ path: `separations/film-${slug}.svg`, file: separationSvgs[index] });
    if (separationPdfs[index]) uploads.push({ path: `separations/film-${slug}.pdf`, file: separationPdfs[index] });
    if (separationPreviews[index]) uploads.push({ path: `separations/film-${slug}-preview.png`, file: separationPreviews[index] });
  });

  return { manifest, uploads };
}

export async function uploadExampleArtifacts(jobId, formData, accessToken) {
  const { manifest, uploads } = collectExampleArtifactUploads(formData);
  for (const item of uploads) {
    const response = await authorizedFetch(`/api/jobs/${jobId}/artifact-file?path=${encodeURIComponent(item.path)}`, {
      method: 'POST',
      accessToken,
      body: item.file,
      headers: {
        'Content-Type': item.file.type || 'application/octet-stream'
      },
      defaultJsonContentType: false
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData?.error || `Gagal mengunggah file contoh (${item.path}).`);
    }
  }
  return apiFetch(`/api/jobs/${jobId}/artifacts-finalize`, {
    method: 'POST',
    accessToken,
    body: { manifest }
  });
}

export async function listExampleJobs(accessToken) {
  return apiFetch('/api/example-jobs', { accessToken });
}

export async function deleteCloudJob(jobId, accessToken) {
  return apiFetch(`/api/jobs/${jobId}`, {
    method: 'DELETE',
    accessToken
  });
}

export async function requestImageRetouch(file, settings, accessToken) {
  const formData = new FormData();
  formData.append('image', file);
  formData.append('settings', JSON.stringify(settings));
  const response = await authorizedFetch('/api/image-retouch', {
    method: 'POST',
    accessToken,
    body: formData,
    networkFallbackMessage: 'Koneksi ke layanan gambar belum tersambung. Periksa URL API aplikasi.'
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || 'Gambar ulang gagal.');
  }
  const retouchLedgerId = response.headers.get('x-ai-ledger-id') || '';
  const aiRedrawMetadata = decodeBase64UrlJson(response.headers.get('x-ai-redraw-metadata') || '');
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await response.json();
    const hydrated = hydrateBackendRetouchResult(data, settings);
    return {
      file: hydrated.pngFile || file,
      retouchLedgerId: data.retouchLedgerId || retouchLedgerId,
      aiRedrawMetadata: data.aiRedrawMetadata || aiRedrawMetadata,
      localResult: hydrated.localResult,
      aiRawPngBlob: hydrated.aiRawPngBlob || null
    };
  }

  const blob = await response.blob();
  return {
    file: new File([blob], 'gambar-ulang.png', { type: blob.type || 'image/png' }),
    retouchLedgerId,
    aiRedrawMetadata,
    aiRawPngBlob: blob
  };
}

export async function requestReadyTrace(file, settings, accessToken) {
  const formData = new FormData();
  formData.append('image', file);
  formData.append('settings', JSON.stringify(settings));
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/api/ready-trace`, {
      method: 'POST',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      body: formData
    });
  } catch (error) {
    throw toUserApiError(error, 'Koneksi ke layanan trace belum tersambung. Periksa URL API aplikasi.');
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const error = new Error(data.error || 'Ready Trace backend gagal.');
    error.qualityAssessment = data.qualityAssessment || null;
    error.suggestedInputMode = data.suggestedInputMode || '';
    throw error;
  }

  const data = await response.json();
  const hydrated = hydrateBackendRetouchResult(data, settings);
  return {
    file: hydrated.pngFile || file,
    localResult: hydrated.localResult,
    readyTraceMetadata: data.readyTraceMetadata || null
  };
}

export async function listAdminUsers(accessToken) {
  return apiFetch('/api/admin/users', { accessToken });
}

export async function updateAdminUser(payload, accessToken) {
  return apiFetch('/api/admin/users', {
    method: 'POST',
    accessToken,
    body: payload
  });
}

export async function createAdminUser(payload, accessToken) {
  return apiFetch('/api/admin/users', {
    method: 'POST',
    accessToken,
    body: {
      action: 'create',
      ...payload
    }
  });
}

export async function deleteAdminUser(userId, accessToken) {
  return apiFetch('/api/admin/users', {
    method: 'POST',
    accessToken,
    body: {
      action: 'delete',
      userId
    }
  });
}

export async function addAdminCredit(payload, accessToken) {
  return apiFetch('/api/admin/credits', {
    method: 'POST',
    accessToken,
    body: payload
  });
}

export async function getAppConfig() {
  return apiFetch('/api/app-config');
}

export async function createMidtransCheckout(payload, accessToken) {
  return apiFetch('/api/payments/midtrans/checkout', {
    method: 'POST',
    accessToken,
    body: payload
  });
}

export async function createInteractiveQrisCheckout(payload, accessToken) {
  return apiFetch('/api/payments/interactive-qris/checkout', {
    method: 'POST',
    accessToken,
    body: payload
  });
}

export async function listMidtransPayments(accessToken) {
  return apiFetch('/api/payments/midtrans', { accessToken });
}

export async function listAutomaticPayments(accessToken) {
  return apiFetch('/api/payments/automatic', { accessToken });
}

export async function refreshMidtransPayment(orderId, accessToken) {
  return apiFetch(`/api/payments/midtrans/${orderId}/refresh`, {
    method: 'POST',
    accessToken
  });
}

export async function submitContactMessage(payload) {
  return apiFetch('/api/contact', {
    method: 'POST',
    body: payload
  });
}

export async function createManualPayment(payload, accessToken) {
  return apiFetch('/api/manual-payments', {
    method: 'POST',
    accessToken,
    body: payload
  });
}

export async function getAdminOverview(accessToken) {
  return apiFetch('/api/admin/overview', { accessToken });
}

export async function listAdminJobs(accessToken) {
  return apiFetch('/api/admin/jobs', { accessToken });
}

export async function setAdminJobExample(jobId, accessToken) {
  return apiFetch(`/api/admin/jobs/${jobId}/set-example`, {
    method: 'POST',
    accessToken
  });
}

export async function unsetAdminJobExample(jobId, accessToken) {
  return apiFetch(`/api/admin/jobs/${jobId}/unset-example`, {
    method: 'POST',
    accessToken
  });
}

export async function listAdminManualPayments(accessToken) {
  return apiFetch('/api/admin/manual-payments', { accessToken });
}

export async function listAdminMidtransPayments(accessToken) {
  return apiFetch('/api/admin/midtrans-payments', { accessToken });
}

export async function listAdminPaymentTransactions(accessToken) {
  return apiFetch('/api/admin/payment-transactions', { accessToken });
}

export async function listAdminQrisWebhookLogs(accessToken) {
  return apiFetch('/api/admin/qris-webhook-logs', { accessToken });
}

export async function settleAdminQrisPayment(paymentId, accessToken) {
  return apiFetch(`/api/admin/payment-transactions/${paymentId}/settle-qris`, {
    method: 'POST',
    accessToken
  });
}

export async function approveManualPayment(paymentId, accessToken) {
  return apiFetch(`/api/admin/manual-payments/${paymentId}/approve`, {
    method: 'POST',
    accessToken
  });
}

export async function rejectManualPayment(paymentId, payload, accessToken) {
  return apiFetch(`/api/admin/manual-payments/${paymentId}/reject`, {
    method: 'POST',
    accessToken,
    body: payload
  });
}

export async function listAdminPricingRules(accessToken) {
  return apiFetch('/api/admin/pricing-rules', { accessToken });
}

export async function updateAdminPricingRule(payload, accessToken) {
  return apiFetch('/api/admin/pricing-rules', {
    method: 'POST',
    accessToken,
    body: payload
  });
}

export async function listAdminSettings(accessToken) {
  return apiFetch('/api/admin/settings', { accessToken });
}

export async function updateAdminSetting(payload, accessToken) {
  return apiFetch('/api/admin/settings', {
    method: 'POST',
    accessToken,
    body: payload
  });
}

export async function uploadInteractiveQrisImage(file, accessToken) {
  const formData = new FormData();
  formData.append('image', file);
  return apiFetch('/api/admin/settings/interactive-qris-image', {
    method: 'POST',
    accessToken,
    body: formData
  });
}

export async function getAdminFinanceSummary(params, accessToken) {
  return apiFetch(`/api/admin/finance/summary${buildAdminFinanceQuery(params)}`, { accessToken });
}

export async function listAdminFinanceTransactions(params, accessToken) {
  return apiFetch(`/api/admin/finance/transactions${buildAdminFinanceQuery(params)}`, { accessToken });
}

export async function getAdminFinanceUsage(params, accessToken) {
  return apiFetch(`/api/admin/finance/usage${buildAdminFinanceQuery(params)}`, { accessToken });
}

export async function listAdminBusinessFinanceEntries(params, accessToken) {
  return apiFetch(`/api/admin/finance/business-entries${buildAdminFinanceQuery(params)}`, { accessToken });
}

export async function createAdminBusinessFinanceEntry(payload, accessToken) {
  return apiFetch('/api/admin/finance/business-entries', {
    method: 'POST',
    accessToken,
    body: payload
  });
}

export async function listAdminTaxRules(accessToken) {
  return apiFetch('/api/admin/finance/tax-rules', { accessToken });
}

export async function saveAdminTaxRule(payload, accessToken) {
  return apiFetch('/api/admin/finance/tax-rules', {
    method: 'POST',
    accessToken,
    body: payload
  });
}

export async function downloadAdminFinanceExport(params, accessToken) {
  const query = buildAdminFinanceQuery(params);
  const blob = await apiFetchBlob(`/api/admin/finance/export.csv${query}`, { accessToken });
  return {
    blob,
    filename: buildAdminFinanceExportFilename(params?.section, params)
  };
}

export async function createJob(file, settings) {
  const formData = new FormData();
  formData.append('image', file);
  Object.entries(settings).forEach(([key, value]) => {
    formData.append(key, String(value));
  });

  const response = await fetch(`${API_BASE_URL}/api/jobs`, {
    method: 'POST',
    body: formData
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Gagal mengirim gambar.');
  }
  return data;
}

export async function getJob(jobId) {
  const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Gagal membaca status job.');
  }
  return data;
}

export async function listJobs() {
  const response = await fetch(`${API_BASE_URL}/api/jobs`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Gagal membaca arsip job.');
  }
  return data.jobs || [];
}

export async function deleteJob(jobId) {
  const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}`, {
    method: 'DELETE'
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Gagal menghapus hasil.');
  }
  return data;
}
