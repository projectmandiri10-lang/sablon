import { Check, Copy, ExternalLink, QrCode, RefreshCw, ShoppingBag, Wallet } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
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
  buildBillingPanelState,
  buildInteractiveQrisPaymentInstruction,
  buildMidtransReturnMessage,
  findNewlyCreditedAutomaticPayment,
  hasPendingAutomaticPayments,
  isAutomaticPaymentRefreshable,
  resolveInteractiveQrisClosedState
} from '../lib/billingPanelState.js';
import { formatRupiah } from '../lib/pricing.js';

const AUTOMATIC_PAYMENTS_POLL_MS = 10000;

function formatPaymentTime(value, locale = 'id') {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(locale === 'id' ? 'id-ID' : 'en-US');
}

function mergePaymentRows(currentRows, nextPayment) {
  const filtered = (currentRows || []).filter((row) => row.id !== nextPayment.id);
  return [nextPayment, ...filtered].sort((left, right) => new Date(right.created_at || 0) - new Date(left.created_at || 0));
}

export default function BillingPanel({ locale = 'id', session, returnState = null, onRefreshBalance, onReturnHandled, onAutomaticPaymentSuccess }) {
  const [appConfig, setAppConfig] = useState({ settings: {}, features: {} });
  const [payments, setPayments] = useState([]);
  const [amountInput, setAmountInput] = useState('2000');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('interactive_qris');
  const [notice, setNotice] = useState('');
  const [configError, setConfigError] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [isCreatingQris, setIsCreatingQris] = useState(false);
  const [refreshingOrderId, setRefreshingOrderId] = useState('');
  const [copiedNominal, setCopiedNominal] = useState(false);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const handledReturnRef = useRef('');
  const paymentsRef = useRef([]);
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
    paymentMethodLabel: isId ? 'Metode pembayaran' : 'Payment method',
    paymentMethodHelp: isId ? 'QRIS menjadi pilihan utama. Metode online lain tersedia melalui halaman pembayaran.' : 'QRIS is the default option. Other online methods are available through the payment page.',
    qrisMethod: isId ? 'QRIS' : 'QRIS',
    onlineMethod: isId ? 'E-wallet, VA, kartu, dan metode lain' : 'E-wallet, VA, cards, and other methods',
    onlineMethodPending: isId
      ? 'E-wallet, VA, kartu, dan metode lain (segera hadir)'
      : 'E-wallet, VA, cards, and other methods (coming soon)',
    minimumCreditInfo: (amount) =>
      isId ? `Minimum ${amount}. Credit akan bertambah 1:1 sesuai nominal pembayaran yang terverifikasi.` : `Minimum ${amount}. Credits increase 1:1 based on the verified payment amount.`,
    openCheckout: isId ? 'Membuka checkout...' : 'Opening checkout...',
    continuePayment: isId ? 'Lanjutkan Pembayaran' : 'Continue to Payment',
    createQris: isId ? 'Buat Instruksi QRIS' : 'Create QRIS instruction',
    creatingQris: isId ? 'Membuat instruksi...' : 'Creating instruction...',
    onlinePaymentTitle: isId ? 'Pembayaran online' : 'Online payment',
    onlinePaymentInfo: isId
      ? 'Gunakan metode online untuk membayar melalui e-wallet, virtual account, kartu, atau kanal lain yang tersedia.'
      : 'Use online payment to pay with e-wallets, virtual accounts, cards, or any available channel.',
    qrisTitle: isId ? 'QRIS otomatis' : 'Automatic QRIS',
    qrisInfo: isId
      ? 'Sistem akan membuat nominal unik yang harus dibayar ke QRIS merchant statis. Setelah notifikasi pembayaran masuk, saldo akan dikreditkan otomatis.'
      : 'The system will create a unique payable amount for the static merchant QRIS. Once the payment notification arrives, credits are added automatically.',
    qrisDynamicInfo: isId
      ? 'Sistem akan membuat QR pembayaran dinamis sesuai nominal unik (termasuk 2 digit akhir). Cukup scan QR tanpa mengetik nominal; setelah notifikasi pembayaran masuk, saldo dikreditkan otomatis.'
      : 'The system will create a dynamic payment QR matching the unique amount (including the last 2 digits). Just scan the QR without typing the amount; once the payment notification arrives, credits are added automatically.',
    qrisDynamicHint: isId
      ? 'Scan QR ini dengan aplikasi pembayaran — nominal sudah termasuk kode unik, tidak perlu mengetik manual.'
      : 'Scan this QR with your payment app — the amount already includes the unique code, no manual typing needed.',
    onlinePaymentMissing: isId ? 'Metode pembayaran online belum tersedia saat ini. Silakan pilih QRIS atau hubungi admin.' : 'Online payment is not available right now. Please choose QRIS or contact admin.',
    qrisMissing: isId ? 'QRIS otomatis belum aktif saat ini. Silakan pilih metode lain atau hubungi admin.' : 'Automatic QRIS is not available right now. Please choose another method or contact admin.',
    qrisClosed: isId ? 'QRIS sedang tutup pada jam ini.' : 'QRIS is currently closed at this time.',
    qrisCreated: isId ? 'Instruksi QRIS otomatis berhasil dibuat. Bayar sesuai nominal unik di bawah ini.' : 'The automatic QRIS instruction has been created. Pay the exact unique amount below.',
    autoPaymentSuccess: isId
      ? 'Pembayaran berhasil diverifikasi. Saldo Anda sudah diperbarui otomatis.'
      : 'Payment verified successfully. Your balance has been refreshed automatically.',
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
      ? ['Waktu', 'Metode', 'Order', 'Nominal', 'Status', 'Kanal', 'Saldo', 'Aksi']
      : ['Time', 'Method', 'Order', 'Amount', 'Status', 'Channel', 'Credit', 'Action']
  };

  const state = buildBillingPanelState(appConfig, session);

  async function loadBillingData() {
    try {
      setConfigError('');
      const [configData, paymentsData] = await Promise.all([getAppConfig(), listAutomaticPayments(session?.access_token)]);
      setAppConfig(configData || { settings: {}, features: {} });
      const nextPayments = Array.isArray(paymentsData?.payments) ? paymentsData.payments : [];
      setPayments(nextPayments);
      paymentsRef.current = nextPayments;
    } catch (error) {
      const userError = toUserApiError(error, copy.billingLoadError);
      setConfigError(userError.message);
      setAppConfig({ settings: {}, features: {} });
      setPayments([]);
      paymentsRef.current = [];
    }
  }

  useEffect(() => {
    loadBillingData();
  }, [session?.access_token]);

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    paymentsRef.current = payments;
  }, [payments]);

  useEffect(() => {
    if (selectedPaymentMethod === 'midtrans' && !state.midtrans.available) {
      setSelectedPaymentMethod('interactive_qris');
    }
  }, [selectedPaymentMethod, state.midtrans.available]);

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

  async function submitMidtransCheckout(amountIdr) {
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
        throw new Error('Metode pembayaran belum mengembalikan link checkout.');
      }
      window.location.assign(data.redirectUrl);
    } catch (error) {
      setPaymentError(toUserApiError(error, copy.checkoutError).message);
      setIsCheckingOut(false);
    }
  }

  async function submitInteractiveQrisCheckout(amountIdr) {
    if (qrisClosedState.isClosed) {
      setPaymentError(qrisClosedState.message || copy.qrisClosed);
      return;
    }
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

  const qrisClosedState = resolveInteractiveQrisClosedState(state.interactiveQris, clockNow);
  const shouldPollAutomaticPayments = hasPendingAutomaticPayments(payments, clockNow);
  const selectedMinimumAmountIdr =
    selectedPaymentMethod === 'midtrans' ? state.midtrans.minimumAmountIdr : state.interactiveQris.minimumAmountIdr;
  const selectedMethodAvailable = selectedPaymentMethod === 'midtrans' ? state.midtrans.available : state.interactiveQris.available;
  const selectedMethodBusy = selectedPaymentMethod === 'midtrans' ? isCheckingOut : isCreatingQris;
  const selectedMethodClosed = selectedPaymentMethod === 'interactive_qris' && qrisClosedState.isClosed;
  const automaticCheckoutDisabled = !selectedMethodAvailable || selectedMethodClosed || selectedMethodBusy;
  const selectedMethodInfo =
    selectedPaymentMethod === 'midtrans'
      ? copy.onlinePaymentInfo
      : state.interactiveQris.qrPayload
        ? copy.qrisDynamicInfo
        : copy.qrisInfo;
  const selectedMethodButtonLabel =
    selectedPaymentMethod === 'midtrans'
      ? isCheckingOut ? copy.openCheckout : copy.continuePayment
      : isCreatingQris ? copy.creatingQris : copy.createQris;
  const selectedMethodIcon =
    selectedPaymentMethod === 'midtrans' ? <ExternalLink className="h-4 w-4" aria-hidden="true" /> : <QrCode className="h-4 w-4" aria-hidden="true" />;

  async function handleAutomaticPaymentSubmit(event) {
    event.preventDefault();
    const amountIdr = Number.parseInt(amountInput, 10);
    if (selectedPaymentMethod === 'midtrans') {
      await submitMidtransCheckout(amountIdr);
      return;
    }
    await submitInteractiveQrisCheckout(amountIdr);
  }

  const activeQrisInstruction = useMemo(() => {
    for (const payment of payments) {
      const instruction = buildInteractiveQrisPaymentInstruction(payment, state.interactiveQris, clockNow);
      if (instruction) return instruction;
    }
    return null;
  }, [payments, state.interactiveQris, clockNow]);

  useEffect(() => {
    if (!session?.access_token || !shouldPollAutomaticPayments) return undefined;

    let cancelled = false;

    const pollAutomaticPayments = async () => {
      try {
        const paymentsData = await listAutomaticPayments(session.access_token);
        if (cancelled) return;
        const nextPayments = Array.isArray(paymentsData?.payments) ? paymentsData.payments : [];
        const creditedPayment = findNewlyCreditedAutomaticPayment(paymentsRef.current, nextPayments);
        setPayments(nextPayments);
        paymentsRef.current = nextPayments;

        if (creditedPayment) {
          setNotice(copy.autoPaymentSuccess);
          setPaymentError('');
          await onRefreshBalance?.();
          if (creditedPayment.provider === 'interactive_qris') {
            onAutomaticPaymentSuccess?.(creditedPayment);
          }
        }
      } catch {
        if (!cancelled) {
          // Keep the current UI state; manual refresh stays available if polling fails.
        }
      }
    };

    const timer = window.setInterval(() => {
      pollAutomaticPayments();
    }, AUTOMATIC_PAYMENTS_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [copy.autoPaymentSuccess, onAutomaticPaymentSuccess, onRefreshBalance, session?.access_token, shouldPollAutomaticPayments]);

  const quickTopupAmounts = [10000, 20000, 50000, 100000];

  function copyExactNominal(value) {
    if (!value) return;
    navigator.clipboard?.writeText(String(value)).then(() => {
      setCopiedNominal(true);
      window.setTimeout(() => setCopiedNominal(false), 2000);
    }).catch(() => {});
  }

  return (
    <div id="billing" className="space-y-6">
      {/* Main Automatic Top-up Card */}
      <section className="studio-card p-5 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
          <div className="flex items-center gap-3">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Wallet className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-ink">{copy.autoTopup}</h2>
              <p className="text-xs text-slate-500">{copy.autoTopupInfo}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="hidden rounded-xl border border-line bg-slate-50 px-3 py-1.5 text-xs text-slate-600 sm:block">
              {copy.topupEmailLabel} <strong className="text-ink">{state.sessionEmail}</strong>
            </div>
            <button
              type="button"
              onClick={loadBillingData}
              className="studio-btn-secondary !min-h-9 !rounded-xl !px-3 !py-1.5 !text-xs"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{copy.refreshBilling}</span>
            </button>
          </div>
        </div>

        <div className="space-y-5">
          {/* Method Selector Cards */}
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">{copy.paymentMethodLabel}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedPaymentMethod('interactive_qris');
                  setPaymentError('');
                  setNotice('');
                }}
                className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition ${
                  selectedPaymentMethod === 'interactive_qris'
                    ? 'border-primary bg-primary/[0.04] ring-2 ring-primary/20'
                    : 'border-line bg-white hover:border-slate-300'
                }`}
              >
                <div
                  className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    selectedPaymentMethod === 'interactive_qris' ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  <QrCode className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-ink">{copy.qrisMethod}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {state.interactiveQris.merchantName || copy.merchantName}
                  </p>
                </div>
              </button>

              <button
                type="button"
                disabled={!state.midtrans.available}
                onClick={() => {
                  setSelectedPaymentMethod('midtrans');
                  setPaymentError('');
                  setNotice('');
                }}
                className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition ${
                  selectedPaymentMethod === 'midtrans'
                    ? 'border-primary bg-primary/[0.04] ring-2 ring-primary/20'
                    : 'border-line bg-white hover:border-slate-300'
                } ${!state.midtrans.available ? 'cursor-not-allowed opacity-60' : ''}`}
              >
                <div
                  className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    selectedPaymentMethod === 'midtrans' ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  <ExternalLink className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-ink">
                    {state.midtrans.available ? copy.onlineMethod : copy.onlineMethodPending}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">{copy.paymentMethodHelp}</p>
                </div>
              </button>
            </div>
          </div>

          <p className="rounded-xl border border-line bg-slate-50/80 px-4 py-2.5 text-xs leading-5 text-slate-600">
            {selectedMethodInfo}
          </p>

          {/* Top-up Form + Quick Preset Chips */}
          <form className="space-y-3" onSubmit={handleAutomaticPaymentSubmit}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <label htmlFor="billingAmountInput" className="text-xs font-bold text-slate-700">
                    {copy.amountLabel}
                  </label>
                  <span className="text-[11px] font-medium text-slate-500">
                    {copy.minimumCreditInfo(formatRupiah(selectedMinimumAmountIdr))}
                  </span>
                </div>
                <input
                  id="billingAmountInput"
                  type="number"
                  min={selectedMinimumAmountIdr}
                  step="1000"
                  value={amountInput}
                  onChange={(event) => setAmountInput(event.target.value)}
                  className="studio-input font-mono text-base font-bold"
                  placeholder={String(selectedMinimumAmountIdr)}
                  disabled={automaticCheckoutDisabled}
                />
              </div>

              <button
                type="submit"
                disabled={automaticCheckoutDisabled}
                className="studio-btn-primary min-h-11 shrink-0 px-5"
              >
                {selectedMethodIcon}
                <span>{selectedMethodButtonLabel}</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold text-slate-500">
                {isId ? 'Pilih cepat:' : 'Quick amount:'}
              </span>
              {quickTopupAmounts
                .filter((preset) => preset >= selectedMinimumAmountIdr)
                .map((preset) => {
                  const active = Number(amountInput) === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      disabled={automaticCheckoutDisabled}
                      onClick={() => setAmountInput(String(preset))}
                      className={`rounded-lg border px-3 py-1 text-xs font-bold transition ${
                        active
                          ? 'border-primary bg-primary text-white'
                          : 'border-line bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-white'
                      }`}
                    >
                      {formatRupiah(preset)}
                    </button>
                  );
                })}
            </div>
          </form>

          {selectedPaymentMethod === 'midtrans' && !state.midtrans.available && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm leading-6 text-amber-800">
              {copy.onlinePaymentMissing}
            </div>
          )}
          {selectedPaymentMethod === 'interactive_qris' && qrisClosedState.isClosed && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm leading-6 text-amber-800">
              {qrisClosedState.message || copy.qrisClosed}
            </div>
          )}
          {selectedPaymentMethod === 'interactive_qris' && !state.interactiveQris.available && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm leading-6 text-amber-800">
              {copy.qrisMissing}
            </div>
          )}

          {/* Active QRIS Instruction Card */}
          {activeQrisInstruction ? (
            <div className="grid gap-5 rounded-2xl border border-primary/25 bg-gradient-to-br from-indigo-50/60 via-white to-violet-50/40 p-4 sm:p-5 lg:grid-cols-[260px_minmax(0,1fr)]">
              <div className="flex flex-col items-center justify-center">
                {activeQrisInstruction.qrisPayload ? (
                  <div className="w-full max-w-[260px] rounded-2xl border border-line bg-white p-3.5 shadow-sm">
                    <QRCodeCanvas
                      value={activeQrisInstruction.qrisPayload}
                      size={240}
                      level="M"
                      marginSize={3}
                      className="h-auto w-full"
                    />
                    <p className="mt-2 text-center text-[11px] leading-4 text-slate-500">{copy.qrisDynamicHint}</p>
                  </div>
                ) : activeQrisInstruction.qrImageUrl ? (
                  <img
                    src={activeQrisInstruction.qrImageUrl}
                    alt={state.interactiveQris.merchantName || copy.qrisTitle}
                    className="h-auto w-full max-w-[260px] rounded-2xl border border-line bg-white p-3 shadow-sm"
                  />
                ) : (
                  <div className="flex h-64 w-full max-w-[260px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white text-sm text-slate-500">
                    QR belum diisi
                  </div>
                )}
              </div>

              <div className="flex flex-col justify-between gap-4">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/20 bg-white px-4 py-3 shadow-sm">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        {copy.exactPayableAmount}
                      </p>
                      <p className="font-mono text-2xl font-extrabold text-primary">
                        {formatRupiah(activeQrisInstruction.displayAmountIdr)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyExactNominal(activeQrisInstruction.displayAmountIdr)}
                      className="studio-btn-secondary !min-h-9 !rounded-xl !px-3 !py-1.5 !text-xs"
                    >
                      {copiedNominal ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                          <span className="text-emerald-700">{isId ? 'Tersalin' : 'Copied'}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{isId ? 'Salin nominal' : 'Copy amount'}</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="grid gap-2 text-xs text-slate-700 sm:grid-cols-2">
                    <div className="rounded-xl border border-line bg-white/80 px-3 py-2">
                      <span className="text-slate-500">{copy.baseAmount}:</span>{' '}
                      <strong className="text-ink">{formatRupiah(activeQrisInstruction.baseAmountIdr)}</strong>
                    </div>
                    <div className="rounded-xl border border-line bg-white/80 px-3 py-2">
                      <span className="text-slate-500">{copy.uniqueCode}:</span>{' '}
                      <strong className="font-mono text-ink">{activeQrisInstruction.uniqueCode}</strong>
                    </div>
                    <div className="rounded-xl border border-line bg-white/80 px-3 py-2">
                      <span className="text-slate-500">{copy.merchantName}:</span>{' '}
                      <strong className="text-ink">{activeQrisInstruction.merchantName || '-'}</strong>
                    </div>
                    <div className="rounded-xl border border-line bg-white/80 px-3 py-2">
                      <span className="text-slate-500">{copy.expiresAt}:</span>{' '}
                      <strong className="text-ink">{formatPaymentTime(activeQrisInstruction.expiresAt, locale)}</strong>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-line bg-white/90 px-4 py-3 text-xs leading-5 text-slate-600">
                  <p>
                    <strong className="text-ink">{copy.qrisInstructions}:</strong> {activeQrisInstruction.instructions}
                  </p>
                  {activeQrisInstruction.contact && (
                    <p className="mt-1">
                      <strong className="text-ink">{copy.adminContact}:</strong> {activeQrisInstruction.contact}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : selectedPaymentMethod === 'interactive_qris' ? (
            <div className="rounded-xl border border-line bg-slate-50/70 px-4 py-3 text-xs leading-5 text-slate-600">
              {copy.waitingPayment}
            </div>
          ) : null}
        </div>

        {notice && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800">{notice}</div>}
        {paymentError && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">{paymentError}</div>}
        {configError && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">{configError}</div>}

        {/* Transaction History Table */}
        <div className="mt-6 overflow-hidden rounded-2xl border border-line">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left text-xs sm:text-sm">
              <thead className="bg-slate-50">
                <tr className="border-b border-line text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  {copy.table.map((heading) => (
                    <th key={heading} className="px-3.5 py-3">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line bg-white">
                {payments.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="px-4 py-6 text-center text-sm text-slate-500">{copy.noTransactions}</td>
                  </tr>
                ) : (
                  payments.map((payment) => (
                    <tr key={payment.id} className="transition hover:bg-slate-50/70">
                      <td className="px-3.5 py-3 text-slate-600">{formatPaymentTime(payment.created_at, locale)}</td>
                      <td className="px-3.5 py-3 font-medium text-ink">{automaticPaymentProviderLabel(payment.provider)}</td>
                      <td className="px-3.5 py-3 font-mono text-xs font-semibold text-ink">{payment.order_id}</td>
                      <td className="px-3.5 py-3">
                        <div className="font-bold text-ink">{formatRupiah(payment.amount_idr || 0)}</div>
                        {payment.provider === 'interactive_qris' && payment.base_amount_idr ? (
                          <div className="text-[11px] text-slate-500">{copy.baseAmountNote(formatRupiah(payment.base_amount_idr || 0))}</div>
                        ) : null}
                      </td>
                      <td className="px-3.5 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                            payment.credited_ledger_id
                              ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                              : 'bg-slate-100 text-slate-700 ring-1 ring-slate-200'
                          }`}
                        >
                          {payment.status}
                        </span>
                      </td>
                      <td className="px-3.5 py-3 text-slate-600">{automaticPaymentChannelLabel(payment)}</td>
                      <td className="px-3.5 py-3 text-slate-600">{payment.credited_ledger_id ? copy.credited : copy.notYet}</td>
                      <td className="px-3.5 py-3">
                        {isAutomaticPaymentRefreshable(payment) ? (
                          <button
                            type="button"
                            onClick={() => handleRefreshPayment(payment.order_id)}
                            disabled={refreshingOrderId === payment.order_id}
                            className="inline-flex min-h-8 items-center justify-center gap-1 rounded-lg border border-primary/30 bg-white px-2.5 py-1 text-xs font-semibold text-primary transition hover:bg-primary/5 disabled:opacity-60"
                          >
                            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                            {refreshingOrderId === payment.order_id ? copy.refreshingStatus : copy.refreshStatus}
                          </button>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Secondary Manual Shopee Top-up Card */}
      <section className="studio-card p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-200">
              <ShoppingBag className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-base font-bold text-ink">{copy.manualShopeeTitle}</h2>
              <p className="text-xs text-slate-500">{state.shopee.note}</p>
            </div>
          </div>
          <a
            href={state.shopee.url}
            target="_blank"
            rel="noreferrer"
            className="studio-btn-secondary !min-h-9 !rounded-xl !px-4 !py-1.5 !text-xs"
          >
            {copy.openShopee}
          </a>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="studio-subcard p-3.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{copy.accountEmail}</p>
            <p className="mt-1 break-all text-xs font-bold text-ink">{state.sessionEmail}</p>
          </div>
          <div className="studio-subcard p-3.5 text-xs leading-5 text-slate-600">
            <p>{copy.shopeeStepOne}</p>
            <p className="mt-1">{copy.shopeeStepTwo}</p>
            {state.shopee.contact && <p className="mt-1 font-semibold text-ink">{copy.adminContact}: {state.shopee.contact}</p>}
          </div>
          <div
            className={`rounded-xl border p-3.5 text-xs font-semibold leading-5 ${
              state.aiRedraw.available
                ? 'border-emerald-200 bg-emerald-50/70 text-emerald-800'
                : 'border-amber-200 bg-amber-50/70 text-amber-800'
            }`}
          >
            {state.aiRedraw.available
              ? 'Fitur redraw AI aktif untuk akun ini.'
              : 'Fitur redraw AI belum aktif. Fitur dasar tetap bisa digunakan.'}
          </div>
        </div>
      </section>
    </div>
  );
}
