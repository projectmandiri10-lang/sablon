import {
  DEFAULT_INTERACTIVE_QRIS_CLOSED_HOURS,
  getInteractiveQrisClosedState,
  normalizeInteractiveQrisClosedHours
} from '../../../shared/interactiveQrisClosedHours.js';

export const DEFAULT_SHOPEE_URL = 'https://shopee.co.id/';
export const DEFAULT_SHOPEE_NOTE =
  'Checkout nominal credit di Shopee, lalu kirim email akun EasyRedesign Pro melalui chat Shopee. Admin top up manual 5-15 menit pada jam kerja.';
export const DEFAULT_MIDTRANS_MINIMUM_AMOUNT_IDR = 2000;
export const DEFAULT_INTERACTIVE_QRIS_MINIMUM_AMOUNT_IDR = 2000;
export const DEFAULT_INTERACTIVE_QRIS_UNIQUE_DIGITS = 2;
export const DEFAULT_INTERACTIVE_QRIS_INSTRUCTIONS = 'Scan QRIS merchant lalu bayar sesuai nominal unik yang muncul di billing.';

export function billingProviderLabel(provider) {
  if (provider === 'openai_image') return 'OpenAI';
  if (provider === 'openrouter_image') return 'OpenRouter';
  return provider || '';
}

export function automaticPaymentProviderLabel(provider) {
  if (provider === 'interactive_qris') return 'QRIS otomatis';
  if (provider === 'midtrans') return 'Pembayaran online';
  return provider || 'Pembayaran otomatis';
}

export function automaticPaymentChannelLabel(payment = {}) {
  if (payment.provider === 'interactive_qris') return 'QRIS statis';
  return payment.payment_type || '-';
}

export function isAutomaticPaymentRefreshable(payment = {}) {
  return payment.provider === 'midtrans' && ['pending', 'capture'].includes(String(payment.status || '').toLowerCase());
}

export function isActiveInteractiveQrisPayment(payment = {}, now = Date.now()) {
  if (payment.provider !== 'interactive_qris') return false;
  if (String(payment.status || '').toLowerCase() !== 'pending') return false;
  if (payment.credited_ledger_id) return false;
  const expiryMs = new Date(payment.expired_at || '').getTime();
  return Number.isFinite(expiryMs) && expiryMs > now;
}

export function buildInteractiveQrisPaymentInstruction(payment = {}, interactiveQris = {}, now = Date.now()) {
  if (!isActiveInteractiveQrisPayment(payment, now)) return null;
  const uniqueDigits = Number(interactiveQris.uniqueDigits) || DEFAULT_INTERACTIVE_QRIS_UNIQUE_DIGITS;
  return {
    displayAmountIdr: Number(payment.amount_idr) || 0,
    baseAmountIdr: Number(payment.base_amount_idr) || Number(payment.amount_idr) || 0,
    uniqueCode: String(Math.max(0, Number.parseInt(payment.unique_code, 10) || 0)).padStart(Math.max(1, uniqueDigits), '0'),
    expiresAt: payment.expired_at || null,
    qrImageUrl: interactiveQris.qrImageUrl || '',
    merchantName: interactiveQris.merchantName || '',
    instructions: interactiveQris.instructions || DEFAULT_INTERACTIVE_QRIS_INSTRUCTIONS,
    contact: interactiveQris.contact || '',
    closedHours: normalizeInteractiveQrisClosedHours(interactiveQris.closedHours || DEFAULT_INTERACTIVE_QRIS_CLOSED_HOURS)
  };
}

export function resolveInteractiveQrisClosedState(interactiveQris = {}, now = Date.now()) {
  return getInteractiveQrisClosedState(interactiveQris.closedHours || DEFAULT_INTERACTIVE_QRIS_CLOSED_HOURS, new Date(now));
}

export function buildBillingPanelState(appConfig = {}, session = null) {
  const settings = appConfig?.settings || {};
  const features = appConfig?.features || {};
  const shopee = settings.shopee_payment || {};
  const interactiveQris = settings.interactive_qris_payment || {};

  return {
    sessionEmail: session?.user?.email || '-',
    shopee: {
      title: 'Pembayaran manual Shopee',
      url: shopee.url || DEFAULT_SHOPEE_URL,
      note: shopee.note || DEFAULT_SHOPEE_NOTE,
      contact: shopee.contact || ''
    },
    midtrans: {
      available: features.midtransAvailable === true,
      isProduction: features.midtransIsProduction === true,
      minimumAmountIdr: Number(features.midtransMinimumAmountIdr) || DEFAULT_MIDTRANS_MINIMUM_AMOUNT_IDR
    },
    interactiveQris: {
      available: features.interactiveQrisAvailable === true,
      minimumAmountIdr: Number(features.interactiveQrisMinimumAmountIdr) || DEFAULT_INTERACTIVE_QRIS_MINIMUM_AMOUNT_IDR,
      uniqueDigits: Number(features.interactiveQrisUniqueDigits) || DEFAULT_INTERACTIVE_QRIS_UNIQUE_DIGITS,
      merchantName: interactiveQris.merchantName || '',
      qrImageUrl: interactiveQris.qrImageUrl || '',
      instructions: interactiveQris.instructions || DEFAULT_INTERACTIVE_QRIS_INSTRUCTIONS,
      contact: interactiveQris.contact || '',
      closedHours: normalizeInteractiveQrisClosedHours(interactiveQris.closedHours || DEFAULT_INTERACTIVE_QRIS_CLOSED_HOURS)
    },
    aiRedraw: {
      available: Boolean(features.aiRedrawAvailable),
      primaryProvider: features.aiRedrawPrimaryProvider || '',
      fallbackProvider: features.aiRedrawFallbackProvider || ''
    }
  };
}

export function parseMidtransReturnParams(search = '') {
  const params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  const orderId = params.get('midtrans_order_id') || params.get('order_id') || '';
  const rawStatus = params.get('transaction_status') || params.get('result') || '';
  const view = params.get('view') || '';
  const normalized = String(rawStatus || '').trim().toLowerCase();
  let status = '';
  if (normalized === 'success' || normalized === 'settlement' || normalized === 'capture') status = 'success';
  else if (normalized === 'pending') status = 'pending';
  else if (normalized === 'failure' || normalized === 'error' || normalized === 'deny' || normalized === 'cancel' || normalized === 'expire') status = 'error';

  return {
    isReturn: params.has('midtrans_return') || Boolean(orderId) || Boolean(rawStatus),
    orderId,
    rawStatus,
    status,
    view
  };
}

export function stripMidtransReturnParams(search = '') {
  const params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  ['midtrans_return', 'midtrans_order_id', 'order_id', 'transaction_status', 'result'].forEach((key) => params.delete(key));
  const next = params.toString();
  return next ? `?${next}` : '';
}

export function buildMidtransReturnMessage(status = '', payment = null) {
  if (payment?.credited_ledger_id) {
    return 'Pembayaran sudah terverifikasi dan credit masuk ke saldo Anda.';
  }
  if (payment?.status === 'pending' || status === 'pending') {
    return 'Pembayaran masih pending. Gunakan tombol refresh status setelah pembayaran selesai.';
  }
  if (payment?.status === 'settlement' || payment?.status === 'capture' || status === 'success') {
    return 'Pembayaran berhasil. Saldo akan diperbarui otomatis setelah status terkonfirmasi.';
  }
  if (status === 'error') {
    return 'Pembayaran belum berhasil atau dibatalkan. Anda bisa membuat checkout baru kapan saja.';
  }
  return 'Status pembayaran sedang diperiksa.';
}
