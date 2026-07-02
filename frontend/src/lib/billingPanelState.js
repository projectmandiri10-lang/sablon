export const DEFAULT_SHOPEE_URL = 'https://shopee.co.id/';
export const DEFAULT_SHOPEE_NOTE =
  'Checkout nominal credit di Shopee, lalu kirim email akun EasyRedesign Pro melalui chat Shopee. Admin top up manual 5-15 menit pada jam kerja.';
export const DEFAULT_MIDTRANS_MINIMUM_AMOUNT_IDR = 2000;

export function billingProviderLabel(provider) {
  if (provider === 'litellm_image') return 'LiteLLM';
  if (provider === 'openrouter_image') return 'OpenRouter';
  return provider || '';
}

export function buildBillingPanelState(appConfig = {}, session = null) {
  const settings = appConfig?.settings || {};
  const features = appConfig?.features || {};
  const shopee = settings.shopee_payment || {};

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
