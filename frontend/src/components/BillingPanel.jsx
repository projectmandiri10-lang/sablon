import { ExternalLink, RefreshCw, ShoppingBag, Wallet } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createMidtransCheckout, getAppConfig, listMidtransPayments, refreshMidtransPayment, toUserApiError } from '../lib/api.js';
import { billingProviderLabel, buildBillingPanelState, buildMidtransReturnMessage } from '../lib/billingPanelState.js';
import { formatRupiah } from '../lib/pricing.js';

function formatPaymentTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('id-ID');
}

function isRefreshableStatus(payment) {
  return ['pending', 'capture'].includes(String(payment?.status || '').toLowerCase());
}

function mergePaymentRows(currentRows, nextPayment) {
  const filtered = (currentRows || []).filter((row) => row.order_id !== nextPayment.order_id);
  return [nextPayment, ...filtered].sort((left, right) => new Date(right.created_at || 0) - new Date(left.created_at || 0));
}

export default function BillingPanel({ session, returnState = null, onRefreshBalance, onReturnHandled }) {
  const [appConfig, setAppConfig] = useState({ settings: {}, features: {} });
  const [payments, setPayments] = useState([]);
  const [amountInput, setAmountInput] = useState('2000');
  const [notice, setNotice] = useState('');
  const [configError, setConfigError] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [refreshingOrderId, setRefreshingOrderId] = useState('');
  const handledReturnRef = useRef('');

  const state = buildBillingPanelState(appConfig, session);

  async function loadBillingData() {
    try {
      setConfigError('');
      const [configData, paymentsData] = await Promise.all([
        getAppConfig(),
        listMidtransPayments(session?.access_token)
      ]);
      setAppConfig(configData || { settings: {}, features: {} });
      setPayments(Array.isArray(paymentsData?.payments) ? paymentsData.payments : []);
    } catch (error) {
      const userError = toUserApiError(error, 'Billing belum bisa dimuat saat ini.');
      setConfigError(userError.message);
      setAppConfig({ settings: {}, features: {} });
      setPayments([]);
    }
  }

  useEffect(() => {
    loadBillingData();
  }, [session?.access_token]);

  async function handleRefreshPayment(orderId, options = {}) {
    if (!orderId) return;
    setRefreshingOrderId(orderId);
    setPaymentError('');
    if (!options.keepNotice) {
      setNotice('Memeriksa status pembayaran Midtrans...');
    }
    try {
      const data = await refreshMidtransPayment(orderId, session?.access_token);
      if (data?.payment) {
        setPayments((current) => mergePaymentRows(current, data.payment));
        setNotice(buildMidtransReturnMessage(options.returnStatus || '', data.payment));
      }
      if (onRefreshBalance) {
        await onRefreshBalance();
      }
    } catch (error) {
      setPaymentError(toUserApiError(error, 'Status Midtrans belum bisa diperbarui.').message);
    } finally {
      setRefreshingOrderId('');
      if (!options.skipReload) {
        loadBillingData();
      }
    }
  }

  useEffect(() => {
    const key = `${returnState?.orderId || ''}:${returnState?.status || ''}:${returnState?.isReturn ? '1' : '0'}`;
    if (!returnState?.isReturn || !session?.access_token || handledReturnRef.current === key) return;
    handledReturnRef.current = key;

    if (returnState.orderId) {
      handleRefreshPayment(returnState.orderId, {
        returnStatus: returnState.status,
        keepNotice: false
      }).finally(() => onReturnHandled?.());
      return;
    }

    setNotice(buildMidtransReturnMessage(returnState.status));
    onRefreshBalance?.();
    onReturnHandled?.();
  }, [returnState?.isReturn, returnState?.orderId, returnState?.status, session?.access_token]);

  async function handleCheckout(event) {
    event.preventDefault();
    const amountIdr = Number.parseInt(amountInput, 10);
    if (!Number.isInteger(amountIdr) || amountIdr < state.midtrans.minimumAmountIdr) {
      setPaymentError(`Nominal minimal ${formatRupiah(state.midtrans.minimumAmountIdr)}.`);
      return;
    }

    setIsCheckingOut(true);
    setPaymentError('');
    setNotice('');
    try {
      const data = await createMidtransCheckout({ amountIdr }, session?.access_token);
      if (!data?.redirectUrl) {
        throw new Error('Midtrans tidak mengembalikan redirect URL.');
      }
      window.location.assign(data.redirectUrl);
    } catch (error) {
      setPaymentError(toUserApiError(error, 'Checkout Midtrans gagal dibuat.').message);
      setIsCheckingOut(false);
    }
  }

  const aiRedrawProviderText = state.aiRedraw.available
    ? `AI Redraw aktif di deploy ini. Jalur utama: ${billingProviderLabel(state.aiRedraw.primaryProvider) || 'LiteLLM'}${state.aiRedraw.fallbackProvider ? `, fallback: ${billingProviderLabel(state.aiRedraw.fallbackProvider)}.` : '.'}`
    : 'AI Redraw belum aktif di deploy ini. Mode Ready Trace tetap tersedia sampai secret LiteLLM atau OpenRouter diisi di Worker.';

  return (
    <div id="billing" className="space-y-5">
      <section className="border border-line bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-spruce" aria-hidden="true" />
            <div>
              <h2 className="text-base font-semibold text-ink">Top up otomatis Midtrans</h2>
              <p className="text-xs text-gray-600">Snap Redirect {state.midtrans.isProduction ? 'Production' : 'Sandbox'}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={loadBillingData}
            className="inline-flex min-h-10 items-center justify-center gap-2 border border-line bg-white px-3 py-2 text-sm font-semibold text-ink hover:border-spruce"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Refresh billing
          </button>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-3">
            <div className="border border-line bg-panel p-3 text-sm leading-6 text-gray-700">
              <p>Midtrans akan membuat checkout otomatis dan credit ditambahkan ke saldo setelah webhook atau refresh status menyatakan pembayaran sukses.</p>
              <p>Email akun Anda yang dipakai untuk top up: <strong>{state.sessionEmail}</strong></p>
            </div>

            <form className="grid gap-3 border border-line bg-white p-3 sm:grid-cols-[minmax(0,1fr)_auto]" onSubmit={handleCheckout}>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">Nominal top up Midtrans</span>
                <input
                  type="number"
                  min={state.midtrans.minimumAmountIdr}
                  step="1000"
                  value={amountInput}
                  onChange={(event) => setAmountInput(event.target.value)}
                  className="w-full border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-spruce"
                  placeholder={String(state.midtrans.minimumAmountIdr)}
                  disabled={!state.midtrans.available || isCheckingOut}
                />
                <p className="mt-1 text-xs text-gray-600">Minimum {formatRupiah(state.midtrans.minimumAmountIdr)}. Credit akan bertambah 1:1 sesuai nominal settled.</p>
              </label>
              <button
                type="submit"
                disabled={!state.midtrans.available || isCheckingOut}
                className="inline-flex min-h-11 items-center justify-center gap-2 border border-spruce bg-spruce px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:border-gray-300 disabled:bg-gray-300 disabled:text-gray-600"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                {isCheckingOut ? 'Membuka checkout...' : 'Checkout Midtrans'}
              </button>
            </form>

            {!state.midtrans.available && (
              <div className="border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-800">
                Midtrans belum aktif di deploy ini. Isi `MIDTRANS_SERVER_KEY`, `MIDTRANS_IS_PRODUCTION`, dan `APP_BASE_URL` di Worker lebih dulu.
              </div>
            )}

            {notice && <div className="border border-emerald-200 bg-emerald-50 p-3 text-sm leading-6 text-emerald-800">{notice}</div>}
            {paymentError && <div className="border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-700">{paymentError}</div>}
            {configError && <div className="border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-800">{configError}</div>}
          </div>

          <div className="space-y-3">
            <div className="border border-line bg-panel p-3">
              <p className="text-xs font-semibold uppercase text-gray-600">Email akun EasyRedesign Pro</p>
              <p className="mt-1 break-all text-sm font-semibold text-ink">{state.sessionEmail}</p>
            </div>
            <div
              className={`border p-3 text-sm leading-6 ${
                state.aiRedraw.available ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'
              }`}
            >
              {aiRedrawProviderText}
            </div>
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase text-gray-600">
                <th className="py-2 pr-3">Waktu</th>
                <th className="py-2 pr-3">Order</th>
                <th className="py-2 pr-3">Nominal</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Channel</th>
                <th className="py-2 pr-3">Credit</th>
                <th className="py-2 pr-3">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-4 text-sm text-gray-600">Belum ada transaksi Midtrans.</td>
                </tr>
              ) : (
                payments.map((payment) => (
                  <tr key={payment.id} className="border-b border-line">
                    <td className="py-2 pr-3">{formatPaymentTime(payment.created_at)}</td>
                    <td className="py-2 pr-3 font-medium text-ink">{payment.order_id}</td>
                    <td className="py-2 pr-3">{formatRupiah(payment.amount_idr || 0)}</td>
                    <td className="py-2 pr-3">
                      <span className={`inline-flex border px-2 py-1 text-xs font-semibold ${payment.credited_ledger_id ? 'border-spruce bg-primary/5 text-spruce' : 'border-line bg-panel text-gray-700'}`}>
                        {payment.status}
                      </span>
                    </td>
                    <td className="py-2 pr-3">{payment.payment_type || '-'}</td>
                    <td className="py-2 pr-3">{payment.credited_ledger_id ? 'Masuk' : 'Belum'}</td>
                    <td className="py-2 pr-3">
                      {isRefreshableStatus(payment) ? (
                        <button
                          type="button"
                          onClick={() => handleRefreshPayment(payment.order_id)}
                          disabled={refreshingOrderId === payment.order_id}
                          className="inline-flex min-h-8 items-center justify-center gap-1 border border-spruce bg-white px-2 py-1 text-xs font-semibold text-spruce disabled:opacity-60"
                        >
                          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                          {refreshingOrderId === payment.order_id ? 'Memeriksa...' : 'Refresh status'}
                        </button>
                      ) : (
                        '-'
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="border border-line bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <ShoppingBag className="h-5 w-5 text-spruce" aria-hidden="true" />
          <h2 className="text-base font-semibold text-ink">{state.shopee.title}</h2>
        </div>
        <div className="grid gap-3 text-sm leading-6 text-gray-700">
          <p>{state.shopee.note}</p>
          <a
            href={state.shopee.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-10 w-fit items-center justify-center border border-spruce bg-spruce px-3 py-2 text-sm font-bold text-white hover:bg-primary/90"
          >
            Buka Shopee Marketplace
          </a>
          {state.shopee.contact && <p>Kontak admin: {state.shopee.contact}</p>}
        </div>
        <div className="mt-5 grid gap-3">
          <div className="border border-line bg-panel p-3">
            <p className="text-xs font-semibold uppercase text-gray-600">Email akun EasyRedesign Pro</p>
            <p className="mt-1 break-all text-sm font-semibold text-ink">{state.sessionEmail}</p>
          </div>
          <div className="border border-line bg-panel p-3 text-sm leading-6 text-gray-700">
            <p>Setelah checkout di Shopee, kirim email akun di atas melalui chat Shopee.</p>
            <p>Admin akan top up credit manual ke akun tersebut dalam 5-15 menit pada jam kerja.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
