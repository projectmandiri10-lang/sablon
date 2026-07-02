import { ExternalLink, RefreshCw, ShoppingBag, Wallet } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createMidtransCheckout, getAppConfig, listMidtransPayments, refreshMidtransPayment, toUserApiError } from '../lib/api.js';
import { billingProviderLabel, buildBillingPanelState, buildMidtransReturnMessage } from '../lib/billingPanelState.js';
import { formatRupiah } from '../lib/pricing.js';

function formatPaymentTime(value, locale = 'id') {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(locale === 'id' ? 'id-ID' : 'en-US');
}

function isRefreshableStatus(payment) {
  return ['pending', 'capture'].includes(String(payment?.status || '').toLowerCase());
}

function mergePaymentRows(currentRows, nextPayment) {
  const filtered = (currentRows || []).filter((row) => row.order_id !== nextPayment.order_id);
  return [nextPayment, ...filtered].sort((left, right) => new Date(right.created_at || 0) - new Date(left.created_at || 0));
}

export default function BillingPanel({ locale = 'id', session, returnState = null, onRefreshBalance, onReturnHandled }) {
  const [appConfig, setAppConfig] = useState({ settings: {}, features: {} });
  const [payments, setPayments] = useState([]);
  const [amountInput, setAmountInput] = useState('2000');
  const [notice, setNotice] = useState('');
  const [configError, setConfigError] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [refreshingOrderId, setRefreshingOrderId] = useState('');
  const handledReturnRef = useRef('');
  const isId = locale === 'id';
  const copy = {
    billingLoadError: isId ? 'Billing belum bisa dimuat saat ini.' : 'Billing cannot be loaded right now.',
    paymentRefreshError: isId ? 'Status pembayaran belum bisa diperbarui.' : 'Payment status cannot be refreshed yet.',
    checkingPayment: isId ? 'Memeriksa status pembayaran...' : 'Checking payment status...',
    minimumAmount: (amount) => (isId ? `Nominal minimal ${amount}.` : `Minimum amount is ${amount}.`),
    checkoutError: isId ? 'Checkout pembayaran gagal dibuat.' : 'Failed to create the payment checkout.',
    autoTopup: isId ? 'Top up otomatis' : 'Automatic top-up',
    gateway: isId ? 'Gateway pembayaran' : 'Payment gateway',
    refreshBilling: isId ? 'Refresh billing' : 'Refresh billing',
    autoTopupInfo: isId
      ? 'Checkout otomatis akan dibuat dan credit ditambahkan ke saldo setelah webhook atau refresh status menyatakan pembayaran sukses.'
      : 'An automatic checkout will be created and credits will be added after the webhook or status refresh confirms a successful payment.',
    topupEmailLabel: isId ? 'Email akun Anda yang dipakai untuk top up:' : 'Your account email used for top-up:',
    amountLabel: isId ? 'Nominal top up' : 'Top-up amount',
    minimumCreditInfo: (amount) =>
      isId ? `Minimum ${amount}. Credit akan bertambah 1:1 sesuai nominal settled.` : `Minimum ${amount}. Credits increase 1:1 based on the settled amount.`,
    openCheckout: isId ? 'Membuka checkout...' : 'Opening checkout...',
    continuePayment: isId ? 'Lanjutkan Pembayaran' : 'Continue to Payment',
    gatewayMissing: isId ? 'Gateway pembayaran belum aktif di deploy ini. Isi konfigurasi Worker lebih dulu.' : 'The payment gateway is not enabled on this deployment yet. Configure the Worker first.',
    accountEmail: isId ? 'Email akun EasyRedesign Pro' : 'EasyRedesign Pro account email',
    manualShopeeTitle: isId ? 'Pembayaran manual Shopee' : 'Manual Shopee payment',
    noTransactions: isId ? 'Belum ada transaksi pembayaran otomatis.' : 'There are no automatic payment transactions yet.',
    credited: isId ? 'Masuk' : 'Credited',
    notYet: isId ? 'Belum' : 'Not yet',
    refreshStatus: isId ? 'Refresh status' : 'Refresh status',
    refreshingStatus: isId ? 'Memeriksa...' : 'Checking...',
    openShopee: isId ? 'Buka Shopee Marketplace' : 'Open Shopee Marketplace',
    adminContact: isId ? 'Kontak admin' : 'Admin contact',
    shopeeStepOne: isId ? 'Setelah checkout di Shopee, kirim email akun di atas melalui chat Shopee.' : 'After checking out on Shopee, send the account email above through Shopee chat.',
    shopeeStepTwo: isId ? 'Admin akan top up credit manual ke akun tersebut dalam 5-15 menit pada jam kerja.' : 'Admin will manually top up that account within 5-15 minutes during business hours.',
    table: isId
      ? ['Waktu', 'Order', 'Nominal', 'Status', 'Channel', 'Credit', 'Aksi']
      : ['Time', 'Order', 'Amount', 'Status', 'Channel', 'Credit', 'Action']
  };

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
      const userError = toUserApiError(error, copy.billingLoadError);
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
      setNotice(copy.checkingPayment);
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
      setPaymentError(toUserApiError(error, copy.paymentRefreshError).message);
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
      setPaymentError(copy.minimumAmount(formatRupiah(state.midtrans.minimumAmountIdr)));
      return;
    }

    setIsCheckingOut(true);
    setPaymentError('');
    setNotice('');
    try {
      const data = await createMidtransCheckout({ amountIdr }, session?.access_token);
      if (!data?.redirectUrl) {
        throw new Error('Gateway pembayaran tidak mengembalikan redirect URL.');
      }
      window.location.assign(data.redirectUrl);
    } catch (error) {
      setPaymentError(toUserApiError(error, copy.checkoutError).message);
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
              <h2 className="text-base font-semibold text-ink">{copy.autoTopup}</h2>
              <p className="text-xs text-gray-600">{copy.gateway} {state.midtrans.isProduction ? 'Production' : 'Sandbox'}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={loadBillingData}
            className="inline-flex min-h-10 items-center justify-center gap-2 border border-line bg-white px-3 py-2 text-sm font-semibold text-ink hover:border-spruce"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {copy.refreshBilling}
          </button>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-3">
            <div className="border border-line bg-panel p-3 text-sm leading-6 text-gray-700">
              <p>{copy.autoTopupInfo}</p>
              <p>{copy.topupEmailLabel} <strong>{state.sessionEmail}</strong></p>
            </div>

            <form className="grid gap-3 border border-line bg-white p-3 sm:grid-cols-[minmax(0,1fr)_auto]" onSubmit={handleCheckout}>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">{copy.amountLabel}</span>
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
                <p className="mt-1 text-xs text-gray-600">{copy.minimumCreditInfo(formatRupiah(state.midtrans.minimumAmountIdr))}</p>
              </label>
              <button
                type="submit"
                disabled={!state.midtrans.available || isCheckingOut}
                className="inline-flex min-h-11 items-center justify-center gap-2 border border-spruce bg-spruce px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:border-gray-300 disabled:bg-gray-300 disabled:text-gray-600"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                {isCheckingOut ? copy.openCheckout : copy.continuePayment}
              </button>
            </form>

            {!state.midtrans.available && (
              <div className="border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-800">
                {copy.gatewayMissing}
              </div>
            )}

            {notice && <div className="border border-emerald-200 bg-emerald-50 p-3 text-sm leading-6 text-emerald-800">{notice}</div>}
            {paymentError && <div className="border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-700">{paymentError}</div>}
            {configError && <div className="border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-800">{configError}</div>}
          </div>

          <div className="space-y-3">
            <div className="border border-line bg-panel p-3">
              <p className="text-xs font-semibold uppercase text-gray-600">{copy.accountEmail}</p>
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
                {copy.table.map((heading) => (
                  <th key={heading} className="py-2 pr-3">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-4 text-sm text-gray-600">{copy.noTransactions}</td>
                </tr>
              ) : (
                payments.map((payment) => (
                  <tr key={payment.id} className="border-b border-line">
                    <td className="py-2 pr-3">{formatPaymentTime(payment.created_at, locale)}</td>
                    <td className="py-2 pr-3 font-medium text-ink">{payment.order_id}</td>
                    <td className="py-2 pr-3">{formatRupiah(payment.amount_idr || 0)}</td>
                    <td className="py-2 pr-3">
                      <span className={`inline-flex border px-2 py-1 text-xs font-semibold ${payment.credited_ledger_id ? 'border-spruce bg-primary/5 text-spruce' : 'border-line bg-panel text-gray-700'}`}>
                        {payment.status}
                      </span>
                    </td>
                    <td className="py-2 pr-3">{payment.payment_type || '-'}</td>
                    <td className="py-2 pr-3">{payment.credited_ledger_id ? copy.credited : copy.notYet}</td>
                    <td className="py-2 pr-3">
                      {isRefreshableStatus(payment) ? (
                        <button
                          type="button"
                          onClick={() => handleRefreshPayment(payment.order_id)}
                          disabled={refreshingOrderId === payment.order_id}
                          className="inline-flex min-h-8 items-center justify-center gap-1 border border-spruce bg-white px-2 py-1 text-xs font-semibold text-spruce disabled:opacity-60"
                        >
                          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                          {refreshingOrderId === payment.order_id ? copy.refreshingStatus : copy.refreshStatus}
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
          <h2 className="text-base font-semibold text-ink">{copy.manualShopeeTitle}</h2>
        </div>
        <div className="grid gap-3 text-sm leading-6 text-gray-700">
          <p>{state.shopee.note}</p>
          <a
            href={state.shopee.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-10 w-fit items-center justify-center border border-spruce bg-spruce px-3 py-2 text-sm font-bold text-white hover:bg-primary/90"
          >
            {copy.openShopee}
          </a>
          {state.shopee.contact && <p>{copy.adminContact}: {state.shopee.contact}</p>}
        </div>
        <div className="mt-5 grid gap-3">
          <div className="border border-line bg-panel p-3">
            <p className="text-xs font-semibold uppercase text-gray-600">{copy.accountEmail}</p>
            <p className="mt-1 break-all text-sm font-semibold text-ink">{state.sessionEmail}</p>
          </div>
          <div className="border border-line bg-panel p-3 text-sm leading-6 text-gray-700">
            <p>{copy.shopeeStepOne}</p>
            <p>{copy.shopeeStepTwo}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
