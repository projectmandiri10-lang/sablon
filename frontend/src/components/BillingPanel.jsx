import { ExternalLink, QrCode, RefreshCw, ShoppingBag, Wallet } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createInteractiveQrisCheckout,
  createMidtransCheckout,
  getAppConfig,
  listAutomaticPayments,
  refreshMidtransPayment,
  toUserApiError
} from '../lib/api.js';
import {
  automaticPaymentChannelLabel,
  automaticPaymentProviderLabel,
  billingProviderLabel,
  buildBillingPanelState,
  buildInteractiveQrisPaymentInstruction,
  buildMidtransReturnMessage,
  isAutomaticPaymentRefreshable,
  resolveInteractiveQrisClosedState
} from '../lib/billingPanelState.js';
import { formatRupiah } from '../lib/pricing.js';

function formatPaymentTime(value, locale = 'id') {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(locale === 'id' ? 'id-ID' : 'en-US');
}

function mergePaymentRows(currentRows, nextPayment) {
  const filtered = (currentRows || []).filter((row) => row.id !== nextPayment.id);
  return [nextPayment, ...filtered].sort((left, right) => new Date(right.created_at || 0) - new Date(left.created_at || 0));
}

export default function BillingPanel({ locale = 'id', session, returnState = null, onRefreshBalance, onReturnHandled }) {
  const [appConfig, setAppConfig] = useState({ settings: {}, features: {} });
  const [payments, setPayments] = useState([]);
  const [midtransAmountInput, setMidtransAmountInput] = useState('2000');
  const [qrisAmountInput, setQrisAmountInput] = useState('2000');
  const [notice, setNotice] = useState('');
  const [configError, setConfigError] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [isCreatingQris, setIsCreatingQris] = useState(false);
  const [refreshingOrderId, setRefreshingOrderId] = useState('');
  const [clockNow, setClockNow] = useState(() => Date.now());
  const handledReturnRef = useRef('');
  const isId = locale === 'id';
  const copy = {
    billingLoadError: isId ? 'Billing belum bisa dimuat saat ini.' : 'Billing cannot be loaded right now.',
    paymentRefreshError: isId ? 'Status pembayaran belum bisa diperbarui.' : 'Payment status cannot be refreshed yet.',
    checkingPayment: isId ? 'Memeriksa status pembayaran...' : 'Checking payment status...',
    minimumAmount: (amount) => (isId ? `Nominal minimal ${amount}.` : `Minimum amount is ${amount}.`),
    checkoutError: isId ? 'Checkout pembayaran gagal dibuat.' : 'Failed to create the payment checkout.',
    qrisCheckoutError: isId ? 'Instruksi QRIS otomatis belum bisa dibuat.' : 'The automatic QRIS instruction could not be created yet.',
    autoTopup: isId ? 'Pembayaran otomatis' : 'Automatic payments',
    refreshBilling: isId ? 'Refresh billing' : 'Refresh billing',
    autoTopupInfo: isId
      ? 'Pilih metode pembayaran otomatis yang tersedia. Saldo akan bertambah otomatis setelah sistem menerima status pembayaran yang valid.'
      : 'Choose any available automatic payment method. Credits will be added automatically after the payment status is verified.',
    topupEmailLabel: isId ? 'Email akun Anda yang dipakai untuk top up:' : 'Your account email used for top-up:',
    amountLabel: isId ? 'Nominal top up' : 'Top-up amount',
    minimumCreditInfo: (amount) =>
      isId ? `Minimum ${amount}. Credit akan bertambah 1:1 sesuai nominal pembayaran yang terverifikasi.` : `Minimum ${amount}. Credits increase 1:1 based on the verified payment amount.`,
    openCheckout: isId ? 'Membuka checkout...' : 'Opening checkout...',
    continuePayment: isId ? 'Lanjutkan Pembayaran' : 'Continue to Payment',
    createQris: isId ? 'Buat Instruksi QRIS' : 'Create QRIS instruction',
    creatingQris: isId ? 'Membuat instruksi...' : 'Creating instruction...',
    gatewayTitle: isId ? 'Gateway redirect' : 'Redirect gateway',
    gatewayLabel: isId ? 'Gateway pembayaran' : 'Payment gateway',
    gatewayInfo: isId
      ? 'Buka checkout redirect untuk menyelesaikan pembayaran otomatis melalui gateway yang aktif.'
      : 'Open the redirect checkout to complete an automatic payment through the enabled gateway.',
    qrisTitle: isId ? 'QRIS otomatis' : 'Automatic QRIS',
    qrisInfo: isId
      ? 'Sistem akan membuat nominal unik yang harus dibayar ke QRIS merchant statis. Setelah notifikasi pembayaran masuk, saldo akan dikreditkan otomatis.'
      : 'The system will create a unique payable amount for the static merchant QRIS. Once the payment notification arrives, credits are added automatically.',
    gatewayMissing: isId ? 'Gateway redirect belum aktif di deploy ini. Isi konfigurasi Worker lebih dulu.' : 'The redirect gateway is not enabled on this deployment yet. Configure the Worker first.',
    qrisMissing: isId ? 'QRIS otomatis belum aktif di deploy ini. Isi secret Worker dan setting QRIS lebih dulu.' : 'Automatic QRIS is not enabled on this deployment yet. Configure the Worker secret and QRIS setting first.',
    qrisClosed: isId ? 'QRIS sedang tutup pada jam ini.' : 'QRIS is currently closed at this time.',
    qrisCreated: isId ? 'Instruksi QRIS otomatis berhasil dibuat. Bayar sesuai nominal unik di bawah ini.' : 'The automatic QRIS instruction has been created. Pay the exact unique amount below.',
    exactPayableAmount: isId ? 'Nominal yang harus dibayar' : 'Exact payable amount',
    baseAmount: isId ? 'Nominal dasar top up' : 'Base top-up amount',
    uniqueCode: isId ? 'Kode unik' : 'Unique code',
    expiresAt: isId ? 'Berlaku sampai' : 'Valid until',
    qrisInstructions: isId ? 'Instruksi pembayaran' : 'Payment instructions',
    merchantName: isId ? 'Merchant QRIS' : 'QRIS merchant',
    adminContact: isId ? 'Kontak admin' : 'Admin contact',
    waitingPayment: isId ? 'Belum ada instruksi QRIS aktif. Buat instruksi baru jika Anda ingin membayar via QRIS merchant ini.' : 'There is no active QRIS instruction yet. Create a new instruction if you want to pay via this merchant QRIS.',
    noTransactions: isId ? 'Belum ada transaksi pembayaran otomatis.' : 'There are no automatic payment transactions yet.',
    credited: isId ? 'Masuk' : 'Credited',
    notYet: isId ? 'Belum' : 'Not yet',
    refreshStatus: isId ? 'Refresh status' : 'Refresh status',
    refreshingStatus: isId ? 'Memeriksa...' : 'Checking...',
    accountEmail: isId ? 'Email akun EasyRedesign Pro' : 'EasyRedesign Pro account email',
    manualShopeeTitle: isId ? 'Pembayaran manual Shopee' : 'Manual Shopee payment',
    openShopee: isId ? 'Buka Shopee Marketplace' : 'Open Shopee Marketplace',
    shopeeStepOne: isId ? 'Setelah checkout di Shopee, kirim email akun di atas melalui chat Shopee.' : 'After checking out on Shopee, send the account email above through Shopee chat.',
    shopeeStepTwo: isId ? 'Admin akan top up credit manual ke akun tersebut dalam 5-15 menit pada jam kerja.' : 'Admin will manually top up that account within 5-15 minutes during business hours.',
    baseAmountNote: (amount) => (isId ? `Dasar ${amount}` : `Base ${amount}`),
    table: isId
      ? ['Waktu', 'Provider', 'Order', 'Nominal', 'Status', 'Channel', 'Credit', 'Aksi']
      : ['Time', 'Provider', 'Order', 'Amount', 'Status', 'Channel', 'Credit', 'Action']
  };

  const state = buildBillingPanelState(appConfig, session);

  async function loadBillingData() {
    try {
      setConfigError('');
      const [configData, paymentsData] = await Promise.all([getAppConfig(), listAutomaticPayments(session?.access_token)]);
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

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

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

  async function handleMidtransCheckout(event) {
    event.preventDefault();
    const amountIdr = Number.parseInt(midtransAmountInput, 10);
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

  async function handleInteractiveQrisCheckout(event) {
    event.preventDefault();
    if (qrisClosedState.isClosed) {
      setPaymentError(qrisClosedState.message || copy.qrisClosed);
      return;
    }
    const amountIdr = Number.parseInt(qrisAmountInput, 10);
    if (!Number.isInteger(amountIdr) || amountIdr < state.interactiveQris.minimumAmountIdr) {
      setPaymentError(copy.minimumAmount(formatRupiah(state.interactiveQris.minimumAmountIdr)));
      return;
    }

    setIsCreatingQris(true);
    setPaymentError('');
    setNotice('');
    try {
      const data = await createInteractiveQrisCheckout({ amountIdr }, session?.access_token);
      if (data?.payment) {
        setPayments((current) => mergePaymentRows(current, data.payment));
      }
      setNotice(copy.qrisCreated);
      if (onRefreshBalance) {
        await onRefreshBalance();
      }
    } catch (error) {
      setPaymentError(toUserApiError(error, copy.qrisCheckoutError).message);
    } finally {
      setIsCreatingQris(false);
      loadBillingData();
    }
  }

  const aiRedrawProviderText = state.aiRedraw.available
    ? `AI Redraw aktif di deploy ini. Jalur utama: ${billingProviderLabel(state.aiRedraw.primaryProvider) || 'OpenAI'}${state.aiRedraw.fallbackProvider ? `, fallback: ${billingProviderLabel(state.aiRedraw.fallbackProvider)}.` : '.'}`
    : 'AI Redraw belum aktif di deploy ini. Mode Ready Trace tetap tersedia sampai secret OpenAI atau OpenRouter diisi di Worker.';

  const qrisClosedState = resolveInteractiveQrisClosedState(state.interactiveQris, clockNow);
  const qrisCheckoutDisabled = !state.interactiveQris.available || qrisClosedState.isClosed || isCreatingQris;

  const activeQrisInstruction = useMemo(() => {
    for (const payment of payments) {
      const instruction = buildInteractiveQrisPaymentInstruction(payment, state.interactiveQris, clockNow);
      if (instruction) return instruction;
    }
    return null;
  }, [payments, state.interactiveQris, clockNow]);

  return (
    <div id="billing" className="space-y-5">
      <section className="border border-line bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-spruce" aria-hidden="true" />
            <div>
              <h2 className="text-base font-semibold text-ink">{copy.autoTopup}</h2>
              <p className="text-xs text-gray-600">{copy.autoTopupInfo}</p>
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

        <div className="mb-4 border border-line bg-panel p-3 text-sm leading-6 text-gray-700">
          <p>{copy.topupEmailLabel} <strong>{state.sessionEmail}</strong></p>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="space-y-3 border border-line bg-white p-4">
            <div className="flex items-center gap-2">
              <ExternalLink className="h-5 w-5 text-spruce" aria-hidden="true" />
              <div>
                <h3 className="text-sm font-bold text-ink">{copy.gatewayTitle}</h3>
                <p className="text-xs text-gray-600">{copy.gatewayLabel} {state.midtrans.isProduction ? 'Production' : 'Sandbox'}</p>
              </div>
            </div>
            <p className="text-sm leading-6 text-gray-700">{copy.gatewayInfo}</p>
            <form className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]" onSubmit={handleMidtransCheckout}>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">{copy.amountLabel}</span>
                <input
                  type="number"
                  min={state.midtrans.minimumAmountIdr}
                  step="1000"
                  value={midtransAmountInput}
                  onChange={(event) => setMidtransAmountInput(event.target.value)}
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
          </div>

          <div className="space-y-3 border border-line bg-white p-4">
            <div className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-spruce" aria-hidden="true" />
              <div>
                <h3 className="text-sm font-bold text-ink">{copy.qrisTitle}</h3>
                <p className="text-xs text-gray-600">{state.interactiveQris.merchantName || copy.merchantName}</p>
              </div>
            </div>
            <p className="text-sm leading-6 text-gray-700">{copy.qrisInfo}</p>
            <form className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]" onSubmit={handleInteractiveQrisCheckout}>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">{copy.amountLabel}</span>
                <input
                  type="number"
                  min={state.interactiveQris.minimumAmountIdr}
                  step="1000"
                  value={qrisAmountInput}
                  onChange={(event) => setQrisAmountInput(event.target.value)}
                  className="w-full border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-spruce"
                  placeholder={String(state.interactiveQris.minimumAmountIdr)}
                  disabled={qrisCheckoutDisabled}
                />
                <p className="mt-1 text-xs text-gray-600">{copy.minimumCreditInfo(formatRupiah(state.interactiveQris.minimumAmountIdr))}</p>
              </label>
              <button
                type="submit"
                disabled={qrisCheckoutDisabled}
                className="inline-flex min-h-11 items-center justify-center gap-2 border border-spruce bg-spruce px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:border-gray-300 disabled:bg-gray-300 disabled:text-gray-600"
              >
                <QrCode className="h-4 w-4" aria-hidden="true" />
                {isCreatingQris ? copy.creatingQris : copy.createQris}
              </button>
            </form>
            {qrisClosedState.isClosed && (
              <div className="border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-800">
                {qrisClosedState.message || copy.qrisClosed}
              </div>
            )}
            {!state.interactiveQris.available && (
              <div className="border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-800">
                {copy.qrisMissing}
              </div>
            )}
            {activeQrisInstruction ? (
              <div className="grid gap-3 border border-line bg-panel p-3 lg:grid-cols-[160px_minmax(0,1fr)]">
                <div className="flex items-start justify-center">
                  {activeQrisInstruction.qrImageUrl ? (
                    <img
                      src={activeQrisInstruction.qrImageUrl}
                      alt={state.interactiveQris.merchantName || copy.qrisTitle}
                      className="h-auto w-full max-w-[160px] border border-line bg-white p-2"
                    />
                  ) : (
                    <div className="flex h-40 w-full max-w-[160px] items-center justify-center border border-dashed border-line bg-white text-xs text-gray-500">
                      QR belum diisi
                    </div>
                  )}
                </div>
                <div className="space-y-2 text-sm leading-6 text-gray-700">
                  <p><strong>{copy.exactPayableAmount}:</strong> {formatRupiah(activeQrisInstruction.displayAmountIdr)}</p>
                  <p><strong>{copy.baseAmount}:</strong> {formatRupiah(activeQrisInstruction.baseAmountIdr)}</p>
                  <p><strong>{copy.uniqueCode}:</strong> {activeQrisInstruction.uniqueCode}</p>
                  <p><strong>{copy.expiresAt}:</strong> {formatPaymentTime(activeQrisInstruction.expiresAt, locale)}</p>
                  <p><strong>{copy.merchantName}:</strong> {activeQrisInstruction.merchantName || '-'}</p>
                  <p><strong>{copy.qrisInstructions}:</strong> {activeQrisInstruction.instructions}</p>
                  {activeQrisInstruction.contact && <p><strong>{copy.adminContact}:</strong> {activeQrisInstruction.contact}</p>}
                </div>
              </div>
            ) : (
              <div className="border border-line bg-panel p-3 text-sm leading-6 text-gray-700">
                {copy.waitingPayment}
              </div>
            )}
          </div>
        </div>

        {notice && <div className="mt-4 border border-emerald-200 bg-emerald-50 p-3 text-sm leading-6 text-emerald-800">{notice}</div>}
        {paymentError && <div className="mt-4 border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-700">{paymentError}</div>}
        {configError && <div className="mt-4 border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-800">{configError}</div>}

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse text-left text-sm">
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
                  <td colSpan="8" className="py-4 text-sm text-gray-600">{copy.noTransactions}</td>
                </tr>
              ) : (
                payments.map((payment) => (
                  <tr key={payment.id} className="border-b border-line">
                    <td className="py-2 pr-3">{formatPaymentTime(payment.created_at, locale)}</td>
                    <td className="py-2 pr-3">{automaticPaymentProviderLabel(payment.provider)}</td>
                    <td className="py-2 pr-3 font-medium text-ink">{payment.order_id}</td>
                    <td className="py-2 pr-3">
                      <div>{formatRupiah(payment.amount_idr || 0)}</div>
                      {payment.provider === 'interactive_qris' && payment.base_amount_idr ? (
                        <div className="text-xs text-gray-500">{copy.baseAmountNote(formatRupiah(payment.base_amount_idr || 0))}</div>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`inline-flex border px-2 py-1 text-xs font-semibold ${payment.credited_ledger_id ? 'border-spruce bg-primary/5 text-spruce' : 'border-line bg-panel text-gray-700'}`}>
                        {payment.status}
                      </span>
                    </td>
                    <td className="py-2 pr-3">{automaticPaymentChannelLabel(payment)}</td>
                    <td className="py-2 pr-3">{payment.credited_ledger_id ? copy.credited : copy.notYet}</td>
                    <td className="py-2 pr-3">
                      {isAutomaticPaymentRefreshable(payment) ? (
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
          <div
            className={`border p-3 text-sm leading-6 ${
              state.aiRedraw.available ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'
            }`}
          >
            {aiRedrawProviderText}
          </div>
        </div>
      </section>
    </div>
  );
}
