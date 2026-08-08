import { BarChart3, BriefcaseBusiness, Check, CreditCard, RefreshCw, Save, Shield, SlidersHorizontal, Star, Trash2, UserPlus, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  addAdminCredit,
  approveManualPayment,
  createAdminUser,
  deleteAdminUser,
  getAdminOverview,
  listAdminJobs,
  listAdminManualPayments,
  listAdminPaymentTransactions,
  listAdminPricingRules,
  listAdminSettings,
  listAdminUsers,
  rejectManualPayment,
  setAdminJobExample,
  unsetAdminJobExample,
  toUserApiError,
  updateAdminPricingRule,
  updateAdminSetting,
  updateAdminUser,
  uploadInteractiveQrisImage
} from '../lib/api.js';
import AdminFinancePanel from './AdminFinancePanel.jsx';
import {
  AIVENE_IMAGE_MODELS,
  AIVENE_IMAGE_REDRAW_PROVIDER,
  OPENAI_IMAGE_REDRAW_PROVIDER,
  listHybridRedrawPresets
} from '../../../shared/hybridRedrawConfig.js';
import { normalizeAiModelDraft, selectAiveneImageModel } from '../lib/aiModelConfig.js';
import { INPUT_MODE_READY, INPUT_MODE_RETOUCH } from '../lib/modes.js';
import { formatRupiah } from '../lib/pricing.js';
import { DEFAULT_INTERACTIVE_QRIS_CLOSED_HOURS, normalizeInteractiveQrisClosedHours } from '../../../shared/interactiveQrisClosedHours.js';

const pricingLabels = {
  [INPUT_MODE_READY]: 'Gambar siap proses',
  [INPUT_MODE_RETOUCH]: 'Gambar ulang',
  separation_film: 'Film separasi'
};

const inputModeLabels = {
  [INPUT_MODE_READY]: 'Siap proses',
  [INPUT_MODE_RETOUCH]: 'Gambar ulang'
};

const aiRedrawModelPresets = listHybridRedrawPresets();

function estimatedIdr(usd) {
  return Math.round((Number(usd) || 0) * 17700);
}

function providerLabel(provider) {
  if (provider === AIVENE_IMAGE_REDRAW_PROVIDER) return 'AIVene';
  if (provider === OPENAI_IMAGE_REDRAW_PROVIDER) return 'OpenAI';
  return provider || '-';
}

function providerModelLabel(provider, config = {}) {
  if (provider === AIVENE_IMAGE_REDRAW_PROVIDER) return config.aiveneImageModel || '-';
  if (provider === OPENAI_IMAGE_REDRAW_PROVIDER) return config.openAiImageModel || '-';
  return '-';
}

function paymentProviderLabel(provider) {
  if (provider === 'interactive_qris') return 'QRIS otomatis';
  if (provider === 'midtrans') return 'Gateway redirect';
  return provider || '-';
}

function paymentChannelLabel(payment = {}) {
  if (payment.provider === 'interactive_qris') return 'QRIS statis';
  return payment.payment_type || '-';
}

function buildDefaultInteractiveQrisDraft() {
  return {
    enabled: false,
    merchantName: '',
    qrImageUrl: '',
    instructions: 'Scan QRIS merchant lalu bayar sesuai nominal unik yang muncul di billing.',
    contact: '',
    closedHours: normalizeInteractiveQrisClosedHours(DEFAULT_INTERACTIVE_QRIS_CLOSED_HOURS)
  };
}

function examplePublishHint(job, isPublished) {
  if (isPublished) return 'Job ini sedang tampil di feed contoh user.';
  if (job.can_set_as_example) return 'Siap dipublish sebagai contoh.';
  if (job.status !== 'done') return 'Hanya job selesai yang bisa dipublish.';
  if (!['superuser', 'superadmin'].includes(job.owner_role)) return 'Hanya job milik superadmin yang bisa dipublish.';
  if (!job.has_example_artifacts) return 'Belum ada bundle contoh lengkap. Generate ulang job superadmin dan jangan hapus riwayatnya sebelum dipublish.';
  return 'Bundle contoh belum lengkap atau belum selesai diunggah.';
}

function StatusBadge({ status }) {
  const styles = {
    pending: 'border-amber-300 bg-amber-50 text-amber-800',
    approved: 'border-spruce bg-primary/5 text-spruce',
    rejected: 'border-tomato bg-orange-50 text-tomato',
    done: 'border-spruce bg-primary/5 text-spruce',
    failed: 'border-tomato bg-orange-50 text-tomato'
  };
  return <span className={`inline-flex border px-2 py-1 text-xs font-semibold ${styles[status] || 'border-line bg-panel text-gray-700'}`}>{status}</span>;
}

export default function AdminPanel({ session, enabled, activeTab = 'overview', onActiveTabChange }) {
  const [localActiveTab, setLocalActiveTab] = useState(activeTab || 'overview');
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [automaticPayments, setAutomaticPayments] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [pricingRules, setPricingRules] = useState([]);
  const [settings, setSettings] = useState([]);
  const [amountByUser, setAmountByUser] = useState({});
  const [pricingDraft, setPricingDraft] = useState({});
  const [shopeeDraft, setShopeeDraft] = useState({ url: '', note: '', contact: '' });
  const [interactiveQrisDraft, setInteractiveQrisDraft] = useState(buildDefaultInteractiveQrisDraft);
  const [interactiveQrisImageFile, setInteractiveQrisImageFile] = useState(null);
  const [isUploadingInteractiveQrisImage, setIsUploadingInteractiveQrisImage] = useState(false);
  const [aiModelDraft, setAiModelDraft] = useState(normalizeAiModelDraft());
  const [rejectReasonByPayment, setRejectReasonByPayment] = useState({});
  const [newUser, setNewUser] = useState({
    fullName: '',
    email: '',
    password: '',
    role: 'user',
    isUnlimited: false,
    isActive: true,
    initialCreditIdr: ''
  });
  const [message, setMessage] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [savingSettingKey, setSavingSettingKey] = useState('');

  const accessToken = session?.access_token;

  useEffect(() => {
    setLocalActiveTab(activeTab || 'overview');
  }, [activeTab]);

  const resolvedActiveTab = activeTab || localActiveTab;

  function handleActiveTabChange(nextTab) {
    setLocalActiveTab(nextTab);
    onActiveTabChange?.(nextTab);
  }

  function applyUpdatedSetting(settingRow) {
    if (!settingRow?.key) return;
    setSettings((current) => {
      const filtered = (current || []).filter((item) => item.key !== settingRow.key);
      return [...filtered, settingRow].sort((left, right) => String(left.key || '').localeCompare(String(right.key || '')));
    });

    if (settingRow.key === 'interactive_qris_payment') {
      const interactiveQris = settingRow.value || {};
      setInteractiveQrisDraft({
        enabled: interactiveQris.enabled === true,
        merchantName: interactiveQris.merchantName || '',
        qrImageUrl: interactiveQris.qrImageUrl || '',
        instructions: interactiveQris.instructions || 'Scan QRIS merchant lalu bayar sesuai nominal unik yang muncul di billing.',
        contact: interactiveQris.contact || '',
        closedHours: normalizeInteractiveQrisClosedHours(interactiveQris.closedHours || DEFAULT_INTERACTIVE_QRIS_CLOSED_HOURS)
      });
      return;
    }

    if (settingRow.key === 'shopee_payment') {
      const shopee = settingRow.value || {};
      setShopeeDraft({
        url: shopee.url || 'https://shopee.co.id/',
        note:
          shopee.note ||
          'Checkout nominal credit di Shopee, lalu kirim email akun EasyRedesign Pro melalui chat Shopee. Admin top up manual 5-15 menit pada jam kerja.',
        contact: shopee.contact || ''
      });
      return;
    }

    if (settingRow.key === 'ai_redraw_model') {
      setAiModelDraft(normalizeAiModelDraft(settingRow.value || {}));
    }
  }

  async function loadAdminData(options = {}) {
    if (!enabled || !accessToken) return;
    setIsBusy(true);
    if (!options.preserveMessage) {
      setMessage('');
    }
    try {
      const [overviewData, usersData, paymentsData, automaticPaymentsData, pricingData, settingsData, jobsData] = await Promise.all([
        getAdminOverview(accessToken),
        listAdminUsers(accessToken),
        listAdminManualPayments(accessToken),
        listAdminPaymentTransactions(accessToken),
        listAdminPricingRules(accessToken),
        listAdminSettings(accessToken),
        listAdminJobs(accessToken)
      ]);
      setOverview(overviewData.overview || null);
      setUsers(usersData.users || []);
      setPayments(paymentsData.payments || []);
      setAutomaticPayments(automaticPaymentsData.payments || []);
      setPricingRules(pricingData.rules || []);
      setSettings(settingsData.settings || []);
      setJobs(jobsData.jobs || []);
      setPricingDraft(
        Object.fromEntries((pricingData.rules || []).map((rule) => [rule.key, { amountIdr: rule.amount_idr, description: rule.description || '', active: rule.active !== false }]))
      );
      const shopee = (settingsData.settings || []).find((setting) => setting.key === 'shopee_payment')?.value || {};
      const interactiveQris = (settingsData.settings || []).find((setting) => setting.key === 'interactive_qris_payment')?.value || {};
      const aiModel = (settingsData.settings || []).find((setting) => setting.key === 'ai_redraw_model')?.value || {};
      const defaultShopeeNote =
        'Checkout nominal credit di Shopee, lalu kirim email akun EasyRedesign Pro melalui chat Shopee. Admin top up manual 5-15 menit pada jam kerja.';
      setShopeeDraft({
        url: shopee.url || 'https://shopee.co.id/',
        note: shopee.note || defaultShopeeNote,
        contact: shopee.contact || ''
      });
      setInteractiveQrisDraft({
        enabled: interactiveQris.enabled === true,
        merchantName: interactiveQris.merchantName || '',
        qrImageUrl: interactiveQris.qrImageUrl || '',
        instructions: interactiveQris.instructions || 'Scan QRIS merchant lalu bayar sesuai nominal unik yang muncul di billing.',
        contact: interactiveQris.contact || '',
        closedHours: normalizeInteractiveQrisClosedHours(interactiveQris.closedHours || DEFAULT_INTERACTIVE_QRIS_CLOSED_HOURS)
      });
      setInteractiveQrisImageFile(null);
      setAiModelDraft(normalizeAiModelDraft(aiModel));
    } catch (error) {
      setMessage(toUserApiError(error, 'Gagal membaca data superadmin.').message);
    } finally {
      setIsBusy(false);
    }
  }

  useEffect(() => {
    loadAdminData();
  }, [enabled, accessToken]);

  const tabs = [
    ['overview', 'Ringkasan', BarChart3],
    ['users', 'User & credit', CreditCard],
    ['payments', 'Pembayaran', Check],
    ['finance', 'Keuangan & pajak', BarChart3],
    ['pricing', 'Harga', SlidersHorizontal],
    ['settings', 'Setting aplikasi', Shield],
    ['jobs', 'Job', BriefcaseBusiness]
  ];

  const statCards = useMemo(
    () => [
      ['User aktif', overview?.activeUsers || 0],
      ['Job 7 hari', overview?.jobsLast7Days || 0],
      ['Payment pending', overview?.pendingPayments || 0],
      ['Nilai job', formatRupiah(overview?.totalJobValueIdr || 0)],
      ['Payment approve', formatRupiah(overview?.approvedPaymentIdr || 0)],
      ['Credit terpakai', formatRupiah(overview?.creditUsedIdr || 0)]
    ],
    [overview]
  );

  async function addCredit(userId) {
    const amount = Number.parseInt(amountByUser[userId] || '0', 10);
    if (!amount) return;
    setIsBusy(true);
    setMessage('');
    try {
      await addAdminCredit({ userId, amountIdr: amount, reason: 'manual_topup_shopee' }, accessToken);
      setAmountByUser((current) => ({ ...current, [userId]: '' }));
      await loadAdminData();
      setMessage('Credit berhasil ditambahkan.');
    } catch (error) {
      setMessage(toUserApiError(error, 'Gagal menambahkan credit.').message);
    } finally {
      setIsBusy(false);
    }
  }

  async function setUserPatch(userId, patch) {
    setIsBusy(true);
    setMessage('');
    try {
      await updateAdminUser({ userId, patch }, accessToken);
      await loadAdminData();
    } catch (error) {
      setMessage(toUserApiError(error, 'Gagal memperbarui user.').message);
    } finally {
      setIsBusy(false);
    }
  }

  async function createUser(event) {
    event.preventDefault();
    setIsBusy(true);
    setMessage('');
    try {
      await createAdminUser(
        {
          fullName: newUser.fullName,
          email: newUser.email,
          password: newUser.password,
          role: newUser.role,
          isUnlimited: newUser.isUnlimited,
          isActive: newUser.isActive,
          initialCreditIdr: newUser.initialCreditIdr
        },
        accessToken
      );
      setNewUser({
        fullName: '',
        email: '',
        password: '',
        role: 'user',
        isUnlimited: false,
        isActive: true,
        initialCreditIdr: ''
      });
      await loadAdminData();
      setMessage('User baru berhasil dibuat.');
    } catch (error) {
      setMessage(toUserApiError(error, 'Gagal membuat user baru.').message);
    } finally {
      setIsBusy(false);
    }
  }

  async function removeUser(user) {
    if (!window.confirm(`Hapus permanen user ${user.email}? Semua data terkait user ini ikut terhapus.`)) return;
    setIsBusy(true);
    setMessage('');
    try {
      await deleteAdminUser(user.id, accessToken);
      await loadAdminData();
      setMessage('User berhasil dihapus permanen.');
    } catch (error) {
      setMessage(toUserApiError(error, 'Gagal menghapus user.').message);
    } finally {
      setIsBusy(false);
    }
  }

  async function approvePayment(paymentId) {
    setIsBusy(true);
    setMessage('');
    try {
      await approveManualPayment(paymentId, accessToken);
      await loadAdminData();
      setMessage('Pembayaran disetujui dan credit masuk.');
    } catch (error) {
      setMessage(toUserApiError(error, 'Gagal menyetujui pembayaran.').message);
    } finally {
      setIsBusy(false);
    }
  }

  async function rejectPayment(paymentId) {
    setIsBusy(true);
    setMessage('');
    try {
      await rejectManualPayment(paymentId, { reason: rejectReasonByPayment[paymentId] || '' }, accessToken);
      await loadAdminData();
      setMessage('Pembayaran ditolak.');
    } catch (error) {
      setMessage(toUserApiError(error, 'Gagal menolak pembayaran.').message);
    } finally {
      setIsBusy(false);
    }
  }

  async function savePricing(rule) {
    const draft = pricingDraft[rule.key] || {};
    setIsBusy(true);
    setMessage('');
    try {
      await updateAdminPricingRule(
        {
          key: rule.key,
          amountIdr: draft.amountIdr,
          description: draft.description,
          active: draft.active
        },
        accessToken
      );
      await loadAdminData();
      setMessage('Harga berhasil disimpan.');
    } catch (error) {
      setMessage(toUserApiError(error, 'Gagal menyimpan harga.').message);
    } finally {
      setIsBusy(false);
    }
  }

  async function saveShopeeSetting() {
    setIsBusy(true);
    setMessage('');
    try {
      const data = await updateAdminSetting(
        {
          key: 'shopee_payment',
          value: shopeeDraft,
          isPublic: true,
          description: 'Konfigurasi pembayaran manual Shopee'
        },
        accessToken
      );
      applyUpdatedSetting(data?.setting);
      setMessage('Setting Shopee berhasil disimpan.');
    } catch (error) {
      setMessage(toUserApiError(error, 'Gagal menyimpan setting Shopee.').message);
    } finally {
      setIsBusy(false);
    }
  }

  async function persistInteractiveQrisSetting(nextDraft, successMessage = 'Setting QRIS otomatis berhasil disimpan.') {
    setSavingSettingKey('interactive_qris_payment');
    setMessage('');
    try {
      const data = await updateAdminSetting(
        {
          key: 'interactive_qris_payment',
          value: nextDraft,
          isPublic: true,
          description: 'Konfigurasi QRIS otomatis dengan nominal unik'
        },
        accessToken
      );
      applyUpdatedSetting(data?.setting);
      setMessage(successMessage);
    } catch (error) {
      setMessage(toUserApiError(error, 'Gagal menyimpan setting QRIS otomatis.').message);
    } finally {
      setSavingSettingKey('');
    }
  }

  async function saveInteractiveQrisSetting() {
    await persistInteractiveQrisSetting(interactiveQrisDraft);
  }

  async function handleInteractiveQrisImageUpload() {
    if (!interactiveQrisImageFile) {
      setMessage('Pilih file gambar QRIS terlebih dulu.');
      return;
    }
    setIsUploadingInteractiveQrisImage(true);
    setMessage('');
    try {
      const data = await uploadInteractiveQrisImage(interactiveQrisImageFile, accessToken);
      const nextDraft = {
        ...interactiveQrisDraft,
        qrImageUrl: data?.url || ''
      };
      setInteractiveQrisDraft(nextDraft);
      await persistInteractiveQrisSetting(nextDraft, 'Gambar QRIS berhasil diupload dan setting QRIS diperbarui.');
    } catch (error) {
      setMessage(toUserApiError(error, 'Gagal mengupload gambar QRIS.').message);
    } finally {
      setIsUploadingInteractiveQrisImage(false);
      setInteractiveQrisImageFile(null);
    }
  }

  async function saveAiModelSetting() {
    const nextValue = normalizeAiModelDraft(aiModelDraft);
    setIsBusy(true);
    setMessage('');
    try {
      const data = await updateAdminSetting(
        {
          key: 'ai_redraw_model',
          value: nextValue,
          isPublic: false,
          description: `Pipeline redraw: ${providerLabel(nextValue.primaryProvider)} primary (${providerModelLabel(nextValue.primaryProvider, nextValue)}) + ${providerLabel(nextValue.fallbackProvider)} fallback (${providerModelLabel(nextValue.fallbackProvider, nextValue)})`
        },
        accessToken
      );
      applyUpdatedSetting(data?.setting);
      setMessage(
        `Pipeline redraw disimpan: ${nextValue.label} | primary ${providerLabel(nextValue.primaryProvider)} (${providerModelLabel(nextValue.primaryProvider, nextValue)}) | fallback ${providerLabel(nextValue.fallbackProvider)} (${providerModelLabel(nextValue.fallbackProvider, nextValue)}).`
      );
    } catch (error) {
      setMessage(toUserApiError(error, 'Gagal menyimpan model gambar ulang.').message);
    } finally {
      setIsBusy(false);
    }
  }

  async function toggleJobExample(job) {
    const isPublished = job.is_example_public || job.is_active_example;
    setIsBusy(true);
    setMessage('');
    try {
      if (isPublished) {
        await unsetAdminJobExample(job.id, accessToken);
      } else {
        await setAdminJobExample(job.id, accessToken);
      }
      await loadAdminData();
      setMessage(
        isPublished
          ? `Publikasi contoh untuk job ${job.production_type === 'sablon' ? 'sablon' : 'sticker'} berhasil dicabut.`
          : `Job ${job.production_type === 'sablon' ? 'sablon' : 'sticker'} berhasil dipublish sebagai contoh.`
      );
    } catch (error) {
      setMessage(toUserApiError(error, isPublished ? 'Gagal mencabut contoh job.' : 'Gagal menjadikan job sebagai contoh.').message);
    } finally {
      setIsBusy(false);
    }
  }

  if (!enabled) return null;

  return (
    <section className="border border-line bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-spruce" aria-hidden="true" />
          <h2 className="text-base font-semibold text-ink">Halaman superadmin</h2>
        </div>
        <button
          type="button"
          onClick={loadAdminData}
          disabled={isBusy}
          className="inline-flex min-h-10 items-center justify-center gap-2 border border-line bg-white px-3 py-2 text-sm font-semibold text-ink hover:border-spruce disabled:opacity-60"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Refresh
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => handleActiveTabChange(id)}
            className={`inline-flex min-h-10 items-center gap-2 border px-3 py-2 text-sm font-semibold ${resolvedActiveTab === id ? 'border-spruce bg-spruce text-white' : 'border-line bg-white text-ink hover:border-spruce'}`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {message && <p className="mb-3 border border-line bg-panel px-3 py-2 text-sm text-gray-700">{message}</p>}

      {resolvedActiveTab === 'overview' && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {statCards.map(([label, value]) => (
            <div key={label} className="border border-line bg-panel p-4">
              <p className="text-xs font-semibold uppercase text-gray-600">{label}</p>
              <p className="mt-1 text-2xl font-black text-ink">{value}</p>
            </div>
          ))}
        </div>
      )}

      {resolvedActiveTab === 'users' && (
        <div className="space-y-4">
          <form className="grid gap-3 border border-line bg-panel p-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_220px_160px_auto_auto]" onSubmit={createUser}>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">Nama user</span>
              <input
                value={newUser.fullName}
                onChange={(event) => setNewUser((current) => ({ ...current, fullName: event.target.value }))}
                className="w-full border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-spruce"
                placeholder="Nama lengkap"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">Email</span>
              <input
                type="email"
                value={newUser.email}
                onChange={(event) => setNewUser((current) => ({ ...current, email: event.target.value }))}
                className="w-full border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-spruce"
                placeholder="user@email.com"
                required
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">Password awal</span>
              <input
                type="text"
                value={newUser.password}
                onChange={(event) => setNewUser((current) => ({ ...current, password: event.target.value }))}
                className="w-full border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-spruce"
                placeholder="Minimal 6 karakter"
                minLength={6}
                required
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">Role</span>
              <select
                value={newUser.role}
                onChange={(event) => setNewUser((current) => ({ ...current, role: event.target.value }))}
                className="w-full border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-spruce"
              >
                <option value="user">User</option>
                <option value="superuser">Superadmin</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">Credit awal</span>
              <input
                type="number"
                min="0"
                step="1000"
                value={newUser.initialCreditIdr}
                onChange={(event) => setNewUser((current) => ({ ...current, initialCreditIdr: event.target.value }))}
                className="w-full border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-spruce"
                placeholder="0"
              />
            </label>
            <div className="flex flex-col gap-2">
              <label className="inline-flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={newUser.isUnlimited}
                  onChange={(event) => setNewUser((current) => ({ ...current, isUnlimited: event.target.checked }))}
                />
                Credit unlimited
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={newUser.isActive}
                  onChange={(event) => setNewUser((current) => ({ ...current, isActive: event.target.checked }))}
                />
                Langsung aktif
              </label>
            </div>
            <div className="md:col-span-2 xl:col-span-6">
              <button type="submit" disabled={isBusy} className="inline-flex min-h-10 items-center justify-center gap-2 border border-spruce bg-spruce px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
                <UserPlus className="h-4 w-4" aria-hidden="true" />
                Buat user baru
              </button>
            </div>
          </form>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase text-gray-600">
                  <th className="py-2 pr-3">User</th>
                  <th className="py-2 pr-3">Role</th>
                  <th className="py-2 pr-3">Credit</th>
                  <th className="py-2 pr-3">Top up</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Unlimited</th>
                  <th className="py-2 pr-3">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-line">
                    <td className="py-2 pr-3">
                      <div className="min-w-0">
                        <input
                          defaultValue={user.full_name || ''}
                          onBlur={(event) => {
                            const nextValue = event.target.value.trim();
                            if (nextValue !== (user.full_name || '')) {
                              setUserPatch(user.id, { full_name: nextValue || null });
                            }
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') event.currentTarget.blur();
                          }}
                          className="w-full border border-line bg-white px-2 py-1 font-medium text-ink outline-none focus:border-spruce"
                          placeholder="Nama user"
                        />
                        <p className="truncate text-xs text-gray-600">{user.email}</p>
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      <select value={user.role} onChange={(event) => setUserPatch(user.id, { role: event.target.value })} className="border border-line bg-white px-2 py-1">
                        <option value="user">user</option>
                        <option value="superuser">superadmin</option>
                      </select>
                    </td>
                    <td className="py-2 pr-3">{user.is_unlimited ? 'Unlimited' : formatRupiah(user.balance || 0)}</td>
                    <td className="py-2 pr-3">
                      <div className="flex gap-2">
                        <input
                          type="number"
                          value={amountByUser[user.id] || ''}
                          onChange={(event) => setAmountByUser((current) => ({ ...current, [user.id]: event.target.value }))}
                          className="w-28 border border-line px-2 py-1"
                          placeholder="10000"
                        />
                        <button type="button" onClick={() => addCredit(user.id)} className="border border-spruce px-2 py-1 font-semibold text-spruce">
                          Tambah
                        </button>
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={user.is_active}
                          onChange={(event) => setUserPatch(user.id, { is_active: event.target.checked, deleted_at: event.target.checked ? null : new Date().toISOString() })}
                        />
                        Aktif
                      </label>
                    </td>
                    <td className="py-2 pr-3">
                      <label className="inline-flex items-center gap-2">
                        <input type="checkbox" checked={user.is_unlimited} onChange={(event) => setUserPatch(user.id, { is_unlimited: event.target.checked })} />
                        Unlimited
                      </label>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setUserPatch(user.id, { is_active: false, deleted_at: new Date().toISOString() })}
                          className="border border-line bg-white px-2 py-1 text-xs font-semibold text-ink"
                        >
                          Nonaktifkan
                        </button>
                        <button
                          type="button"
                          onClick={() => removeUser(user)}
                          className="inline-flex items-center justify-center gap-1 border border-tomato px-2 py-1 text-xs font-semibold text-tomato"
                          title="Hapus permanen user"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Hapus
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {resolvedActiveTab === 'payments' && (
        <div className="space-y-5">
          <div>
            <h3 className="mb-3 text-sm font-bold text-ink">Pembayaran manual Shopee</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[940px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs uppercase text-gray-600">
                    <th className="py-2 pr-3">User</th>
                    <th className="py-2 pr-3">Nominal</th>
                    <th className="py-2 pr-3">Order Shopee</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Catatan</th>
                    <th className="py-2 pr-3">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment.id} className="border-b border-line">
                      <td className="py-2 pr-3 font-medium text-ink">{payment.user_email}</td>
                      <td className="py-2 pr-3">{formatRupiah(payment.amount_idr)}</td>
                      <td className="py-2 pr-3">{payment.order_ref || '-'}</td>
                      <td className="py-2 pr-3"><StatusBadge status={payment.status} /></td>
                      <td className="py-2 pr-3">{payment.notes || payment.rejected_reason || '-'}</td>
                      <td className="py-2 pr-3">
                        {payment.status === 'pending' ? (
                          <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => approvePayment(payment.id)} className="inline-flex h-8 w-8 items-center justify-center border border-spruce text-spruce" title="Approve">
                              <Check className="h-4 w-4" aria-hidden="true" />
                            </button>
                            <input
                              value={rejectReasonByPayment[payment.id] || ''}
                              onChange={(event) => setRejectReasonByPayment((current) => ({ ...current, [payment.id]: event.target.value }))}
                              className="w-36 border border-line px-2 py-1"
                              placeholder="Alasan tolak"
                            />
                            <button type="button" onClick={() => rejectPayment(payment.id)} className="inline-flex h-8 w-8 items-center justify-center border border-tomato text-tomato" title="Reject">
                              <X className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </div>
                        ) : (
                          '-'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-bold text-ink">Transaksi pembayaran otomatis</h3>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs uppercase text-gray-600">
                    <th className="py-2 pr-3">User</th>
                    <th className="py-2 pr-3">Provider</th>
                    <th className="py-2 pr-3">Order</th>
                    <th className="py-2 pr-3">Nominal bayar</th>
                    <th className="py-2 pr-3">Nominal dasar</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Channel</th>
                    <th className="py-2 pr-3">Credit</th>
                    <th className="py-2 pr-3">Waktu bayar</th>
                  </tr>
                </thead>
                <tbody>
                  {automaticPayments.length === 0 ? (
                    <tr>
                      <td colSpan="9" className="py-3 text-sm text-gray-600">Belum ada transaksi pembayaran otomatis.</td>
                    </tr>
                  ) : (
                    automaticPayments.map((payment) => (
                      <tr key={payment.id} className="border-b border-line">
                        <td className="py-2 pr-3 font-medium text-ink">{payment.user_email}</td>
                        <td className="py-2 pr-3">{paymentProviderLabel(payment.provider)}</td>
                        <td className="py-2 pr-3">{payment.order_id}</td>
                        <td className="py-2 pr-3">{formatRupiah(payment.amount_idr)}</td>
                        <td className="py-2 pr-3">{payment.base_amount_idr ? formatRupiah(payment.base_amount_idr) : '-'}</td>
                        <td className="py-2 pr-3"><StatusBadge status={payment.status} /></td>
                        <td className="py-2 pr-3">{paymentChannelLabel(payment)}</td>
                        <td className="py-2 pr-3">{payment.credited_ledger_id ? 'Masuk' : 'Belum'}</td>
                        <td className="py-2 pr-3">{payment.paid_at ? new Date(payment.paid_at).toLocaleString('id-ID') : '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {resolvedActiveTab === 'finance' && <AdminFinancePanel accessToken={accessToken} />}

      {resolvedActiveTab === 'pricing' && (
        <div className="grid gap-3">
          {pricingRules.map((rule) => {
            const draft = pricingDraft[rule.key] || {};
            return (
              <div key={rule.key} className="grid gap-3 border border-line bg-panel p-3 md:grid-cols-[1fr_160px_1.4fr_auto_auto] md:items-end">
                <div>
                  <p className="text-sm font-bold text-ink">{pricingLabels[rule.key] || rule.key}</p>
                  <p className="text-xs text-gray-600">Aturan harga aplikasi</p>
                </div>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase text-gray-600">Harga</span>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={draft.amountIdr ?? rule.amount_idr}
                    onChange={(event) => setPricingDraft((current) => ({ ...current, [rule.key]: { ...draft, amountIdr: event.target.value } }))}
                    className="w-full border border-line bg-white px-3 py-2 text-sm outline-none focus:border-spruce"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase text-gray-600">Deskripsi</span>
                  <input
                    value={draft.description ?? rule.description ?? ''}
                    onChange={(event) => setPricingDraft((current) => ({ ...current, [rule.key]: { ...draft, description: event.target.value } }))}
                    className="w-full border border-line bg-white px-3 py-2 text-sm outline-none focus:border-spruce"
                  />
                </label>
                <label className="inline-flex items-center gap-2 pb-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.active ?? rule.active}
                    onChange={(event) => setPricingDraft((current) => ({ ...current, [rule.key]: { ...draft, active: event.target.checked } }))}
                  />
                  Aktif
                </label>
                <button type="button" onClick={() => savePricing(rule)} className="inline-flex min-h-10 items-center justify-center gap-2 border border-spruce bg-spruce px-3 py-2 text-sm font-bold text-white">
                  <Save className="h-4 w-4" aria-hidden="true" />
                  Simpan
                </button>
              </div>
            );
          })}
        </div>
      )}

      {resolvedActiveTab === 'settings' && (
        <div className="grid gap-3">
          <div className="border border-line bg-panel p-3">
            <h3 className="mb-3 text-sm font-bold text-ink">Model gambar ulang</h3>
            <div className="grid gap-3">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">Preset model</span>
                <select
                  value={aiModelDraft.mode}
                  onChange={(event) => {
                    if (event.target.value === 'custom') {
                      setAiModelDraft((current) => ({ ...current, mode: 'custom', preset: 'custom', label: 'Custom' }));
                      return;
                    }
                    const preset = aiRedrawModelPresets.find((item) => item.mode === event.target.value) || aiRedrawModelPresets[2];
                    setAiModelDraft(normalizeAiModelDraft(preset));
                  }}
                  className="w-full border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-spruce"
                >
                  {aiRedrawModelPresets.map((preset) => (
                    <option key={preset.mode} value={preset.mode}>
                      {preset.label} - {providerModelLabel(preset.primaryProvider, preset)}
                    </option>
                  ))}
                  <option value="custom">Custom</option>
                </select>
              </label>
              <div className="grid gap-3 md:grid-cols-3">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink">Provider utama</span>
                  <select
                    value={AIVENE_IMAGE_REDRAW_PROVIDER}
                    disabled
                    onChange={(event) =>
                      setAiModelDraft((current) => ({
                        ...current,
                        mode: 'custom',
                        preset: 'custom',
                        label: 'Custom',
                        primaryProvider: event.target.value
                      }))
                    }
                    className="w-full border border-line bg-panel px-3 py-2.5 text-sm outline-none"
                  >
                    <option value={AIVENE_IMAGE_REDRAW_PROVIDER}>AIVene</option>
                    <option value={OPENAI_IMAGE_REDRAW_PROVIDER}>OpenAI</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink">Provider fallback</span>
                  <select
                    value={OPENAI_IMAGE_REDRAW_PROVIDER}
                    disabled
                    onChange={(event) =>
                      setAiModelDraft((current) => ({
                        ...current,
                        mode: 'custom',
                        preset: 'custom',
                        label: 'Custom',
                        fallbackProvider: event.target.value
                      }))
                    }
                    className="w-full border border-line bg-panel px-3 py-2.5 text-sm outline-none"
                  >
                    <option value="">Tanpa fallback</option>
                    <option value={OPENAI_IMAGE_REDRAW_PROVIDER}>OpenAI</option>
                    <option value={AIVENE_IMAGE_REDRAW_PROVIDER}>AIVene</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink">Strategi fallback</span>
                  <input
                    value="Otomatis untuk quota, billing, model unavailable, timeout, network, atau 5xx"
                    readOnly
                    className="w-full border border-line bg-panel px-3 py-2.5 text-sm text-gray-700"
                  />
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink">Model gambar AIVene</span>
                  <select
                    value={aiModelDraft.aiveneImageModel || 'gpt-image-2'}
                    onChange={(event) =>
                      setAiModelDraft((current) => selectAiveneImageModel(current, event.target.value))
                    }
                    className="w-full border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-spruce"
                  >
                    {AIVENE_IMAGE_MODELS.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink">Model gambar OpenAI</span>
                  <input
                    value="gpt-image-2"
                    readOnly
                    className="w-full border border-line bg-panel px-3 py-2.5 text-sm text-gray-700 outline-none"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink">Kontrak edit image</span>
                  <input value="OpenAI-compatible /images/edits" readOnly className="w-full border border-line bg-panel px-3 py-2.5 text-sm text-gray-700" />
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink">Quality gambar</span>
                  <select
                    value={aiModelDraft.generationQuality || ''}
                    onChange={(event) => setAiModelDraft((current) => ({ ...current, mode: 'custom', preset: 'custom', label: 'Custom', generationQuality: event.target.value }))}
                    className="w-full border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-spruce"
                  >
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink">Ukuran gambar</span>
                  <select
                    value={aiModelDraft.imageSize || '1K'}
                    onChange={(event) => setAiModelDraft((current) => ({ ...current, mode: 'custom', preset: 'custom', label: 'Custom', imageSize: event.target.value }))}
                    className="w-full border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-spruce"
                  >
                    <option value="1K">1K</option>
                    <option value="2K">2K</option>
                    <option value="4K">4K</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink">Fidelity input</span>
                  <select
                    value="low"
                    disabled
                    className="w-full border border-line bg-panel px-3 py-2.5 text-sm outline-none"
                  >
                    <option value="low">Low - biaya input lebih hemat</option>
                  </select>
                  <span className="mt-1 block text-xs text-gray-600">Model AIVene terpilih memakai fidelity low; trace dan artefak berjalan lokal di browser.</span>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink">Prompt profile</span>
                  <select
                    value={aiModelDraft.promptProfile || 'logo_photo_cleanup_short'}
                    onChange={(event) => setAiModelDraft((current) => ({ ...current, mode: 'custom', preset: 'custom', label: 'Custom', promptProfile: event.target.value }))}
                    className="w-full border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-spruce"
                  >
                    <option value="logo_photo_cleanup_short">Logo cleanup short</option>
                    <option value="photo_logo_cleanup">Photo logo cleanup</option>
                    <option value="stylized_redraw">Stylized redraw</option>
                    <option value="generic_trace_clone">Generic trace clone</option>
                    <option value="sourceful_trace_clone">Sourceful trace clone</option>
                    <option value="gemini_trace_clone">Gemini trace clone</option>
                  </select>
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink">Estimasi USD/gambar</span>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={aiModelDraft.estimatedUsdPerImage}
                    onChange={(event) => setAiModelDraft((current) => ({ ...current, mode: 'custom', preset: 'custom', label: 'Custom', estimatedUsdPerImage: event.target.value }))}
                    className="w-full border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-spruce"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink">Resolusi policy</span>
                  <select
                    value={aiModelDraft.resolutionPolicy}
                    onChange={(event) => setAiModelDraft((current) => ({ ...current, mode: 'custom', preset: 'custom', label: 'Custom', resolutionPolicy: event.target.value }))}
                    className="w-full border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-spruce"
                  >
                    <option value="economy">Economy</option>
                    <option value="standard">Standard</option>
                    <option value="high">High</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink">Aspect policy</span>
                  <input value={aiModelDraft.aspectPolicy} readOnly className="w-full border border-line bg-panel px-3 py-2.5 text-sm text-gray-700" />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink">Preprocess</span>
                  <input value={aiModelDraft.preprocess} readOnly className="w-full border border-line bg-panel px-3 py-2.5 text-sm text-gray-700" />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-ink">Batas input AI</span>
                  <input value={`${aiModelDraft.inputMaxEdge || 1080}px sisi terpanjang`} readOnly className="w-full border border-line bg-panel px-3 py-2.5 text-sm text-gray-700" />
                </label>
              </div>
              <div className="border border-line bg-white p-3 text-sm leading-6 text-gray-700">
                <p>
                  Aktif: <strong>{aiModelDraft.label}</strong> | primary {providerLabel(aiModelDraft.primaryProvider)}
                  {aiModelDraft.generationQuality ? ` (${aiModelDraft.generationQuality.toUpperCase()})` : ''}
                </p>
                <p>Estimasi biaya: sekitar {formatRupiah(estimatedIdr(aiModelDraft.estimatedUsdPerImage))} per redraw hybrid, dengan harga user tetap flat.</p>
                <p>
                  Pipeline: {providerLabel(aiModelDraft.primaryProvider)} memakai <strong>{providerModelLabel(aiModelDraft.primaryProvider, aiModelDraft)}</strong> sebagai jalur utama.
                  {` `}
                  {aiModelDraft.fallbackProvider
                    ? `${providerLabel(aiModelDraft.fallbackProvider)} menjadi cadangan melalui ${providerModelLabel(aiModelDraft.fallbackProvider, aiModelDraft)} saat kebijakan fallback mengizinkan.`
                    : 'Tanpa provider fallback tambahan.'}
                </p>
                <p>
                  Provider fallback: {providerLabel(aiModelDraft.fallbackProvider)} | image {aiModelDraft.imageSize || '1K'} | input low / {aiModelDraft.inputMaxEdge || 1080}px | prompt {aiModelDraft.promptProfile || 'logo_photo_cleanup_short'}
                </p>
                <p>
                  AIVene model: {aiModelDraft.aiveneImageModel || '-'} | OpenAI model: {aiModelDraft.openAiImageModel || '-'}
                </p>
                <p>{aiRedrawModelPresets.find((preset) => preset.mode === aiModelDraft.mode)?.note || 'Mode custom untuk eksperimen pipeline hybrid.'}</p>
                <p>
                  Kebijakan tetap: aspect mengikuti sumber, preprocess Node heuristic, prompt disimpan ke manifest,
                  {` `}
                  retry low-confidence {aiModelDraft.retryOnLowConfidence ? 'aktif' : 'mati'}.
                </p>
              </div>
              <button type="button" onClick={saveAiModelSetting} className="inline-flex min-h-10 w-fit items-center justify-center gap-2 border border-spruce bg-spruce px-3 py-2 text-sm font-bold text-white">
                <Save className="h-4 w-4" aria-hidden="true" />
                Simpan pipeline redraw
              </button>
            </div>
          </div>
          <div className="border border-line bg-panel p-3">
            <h3 className="mb-3 text-sm font-bold text-ink">Pembayaran Shopee</h3>
            <div className="grid gap-3">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">Link Shopee</span>
                <input value={shopeeDraft.url} onChange={(event) => setShopeeDraft((current) => ({ ...current, url: event.target.value }))} className="w-full border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-spruce" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">Catatan pembayaran</span>
                <textarea value={shopeeDraft.note} onChange={(event) => setShopeeDraft((current) => ({ ...current, note: event.target.value }))} className="min-h-24 w-full border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-spruce" />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">Kontak admin</span>
                <input value={shopeeDraft.contact} onChange={(event) => setShopeeDraft((current) => ({ ...current, contact: event.target.value }))} className="w-full border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-spruce" />
              </label>
              <button type="button" onClick={saveShopeeSetting} className="inline-flex min-h-10 w-fit items-center justify-center gap-2 border border-spruce bg-spruce px-3 py-2 text-sm font-bold text-white">
                <Save className="h-4 w-4" aria-hidden="true" />
                Simpan setting
              </button>
            </div>
          </div>
          <div className="border border-line bg-panel p-3">
            <h3 className="mb-3 text-sm font-bold text-ink">QRIS otomatis</h3>
            <div className="grid gap-3">
              <label className="inline-flex items-center gap-2 text-sm font-medium text-ink">
                <input
                  type="checkbox"
                  checked={interactiveQrisDraft.enabled}
                  onChange={(event) => setInteractiveQrisDraft((current) => ({ ...current, enabled: event.target.checked }))}
                  className="h-4 w-4 accent-spruce"
                />
                Aktifkan QRIS otomatis
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">Nama merchant</span>
                <input
                  value={interactiveQrisDraft.merchantName}
                  onChange={(event) => setInteractiveQrisDraft((current) => ({ ...current, merchantName: event.target.value }))}
                  className="w-full border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-spruce"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">Upload gambar QR</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => setInteractiveQrisImageFile(event.target.files?.[0] || null)}
                  className="w-full border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-spruce"
                />
                <p className="mt-1 text-xs text-gray-600">Format: PNG, JPG/JPEG, atau WEBP. Maksimal 5 MB.</p>
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleInteractiveQrisImageUpload}
                  disabled={isBusy || isUploadingInteractiveQrisImage || !interactiveQrisImageFile}
                  className="inline-flex min-h-10 items-center justify-center gap-2 border border-spruce bg-white px-3 py-2 text-sm font-bold text-spruce disabled:opacity-60"
                >
                  <Save className="h-4 w-4" aria-hidden="true" />
                  {isUploadingInteractiveQrisImage ? 'Mengupload gambar...' : 'Upload gambar QRIS'}
                </button>
                {interactiveQrisImageFile && <p className="text-xs text-gray-600">{interactiveQrisImageFile.name}</p>}
              </div>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">URL gambar QR aktif</span>
                <input
                  value={interactiveQrisDraft.qrImageUrl}
                  readOnly
                  className="w-full border border-line bg-panel px-3 py-2.5 text-sm text-gray-700 outline-none"
                  placeholder="Belum ada gambar QR aktif"
                />
              </label>
              {interactiveQrisDraft.qrImageUrl && (
                <div className="border border-line bg-white p-3">
                  <p className="mb-2 text-xs font-semibold uppercase text-gray-600">Preview QR aktif</p>
                  <img
                    src={interactiveQrisDraft.qrImageUrl}
                    alt={interactiveQrisDraft.merchantName || 'QRIS aktif'}
                    className="h-auto w-full max-w-[220px] border border-line bg-white p-2"
                  />
                </div>
              )}
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">Instruksi billing</span>
                <textarea
                  value={interactiveQrisDraft.instructions}
                  onChange={(event) => setInteractiveQrisDraft((current) => ({ ...current, instructions: event.target.value }))}
                  className="min-h-24 w-full border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-spruce"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-ink">Kontak admin</span>
                <input
                  value={interactiveQrisDraft.contact}
                  onChange={(event) => setInteractiveQrisDraft((current) => ({ ...current, contact: event.target.value }))}
                  className="w-full border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-spruce"
                />
              </label>
              <div className="border border-line bg-white p-3">
                <h4 className="mb-3 text-sm font-bold text-ink">Jam tutup QRIS</h4>
                <div className="grid gap-3">
                  <label className="inline-flex items-center gap-2 text-sm font-medium text-ink">
                    <input
                      type="checkbox"
                      checked={interactiveQrisDraft.closedHours.enabled !== false}
                      onChange={(event) =>
                        setInteractiveQrisDraft((current) => ({
                          ...current,
                          closedHours: {
                            ...current.closedHours,
                            enabled: event.target.checked
                          }
                        }))
                      }
                      className="h-4 w-4 accent-spruce"
                    />
                    Aktifkan penutupan QRIS otomatis
                  </label>
                  <div className="grid gap-3 md:grid-cols-3">
                    <label className="block">
                      <span className="mb-1.5 block text-sm font-medium text-ink">Jam mulai tutup</span>
                      <input
                        type="time"
                        value={interactiveQrisDraft.closedHours.start}
                        onChange={(event) =>
                          setInteractiveQrisDraft((current) => ({
                            ...current,
                            closedHours: {
                              ...current.closedHours,
                              start: event.target.value
                            }
                          }))
                        }
                        className="w-full border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-spruce"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-sm font-medium text-ink">Jam buka kembali</span>
                      <input
                        type="time"
                        value={interactiveQrisDraft.closedHours.end}
                        onChange={(event) =>
                          setInteractiveQrisDraft((current) => ({
                            ...current,
                            closedHours: {
                              ...current.closedHours,
                              end: event.target.value
                            }
                          }))
                        }
                        className="w-full border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-spruce"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-sm font-medium text-ink">Timezone</span>
                      <input
                        value={interactiveQrisDraft.closedHours.timezone}
                        onChange={(event) =>
                          setInteractiveQrisDraft((current) => ({
                            ...current,
                            closedHours: {
                              ...current.closedHours,
                              timezone: event.target.value
                            }
                          }))
                        }
                        className="w-full border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-spruce"
                      />
                    </label>
                  </div>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-ink">Pesan saat tutup</span>
                    <textarea
                      value={interactiveQrisDraft.closedHours.message}
                      onChange={(event) =>
                        setInteractiveQrisDraft((current) => ({
                          ...current,
                          closedHours: {
                            ...current.closedHours,
                            message: event.target.value
                          }
                        }))
                      }
                      className="min-h-24 w-full border border-line bg-white px-3 py-2.5 text-sm outline-none focus:border-spruce"
                    />
                  </label>
                </div>
              </div>
              <button
                type="button"
                onClick={saveInteractiveQrisSetting}
                disabled={isBusy || savingSettingKey === 'interactive_qris_payment'}
                className="inline-flex min-h-10 w-fit items-center justify-center gap-2 border border-spruce bg-spruce px-3 py-2 text-sm font-bold text-white disabled:opacity-60"
              >
                <Save className="h-4 w-4" aria-hidden="true" />
                {savingSettingKey === 'interactive_qris_payment' ? 'Menyimpan setting QRIS...' : 'Simpan setting QRIS'}
              </button>
            </div>
          </div>
          <div className="border border-line bg-white p-3 text-sm text-gray-700">
            Setting tersimpan dibaca oleh halaman billing user tanpa menyimpan file output di server.
          </div>
        </div>
      )}

      {resolvedActiveTab === 'jobs' && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase text-gray-600">
                <th className="py-2 pr-3">Waktu</th>
                <th className="py-2 pr-3">User</th>
                <th className="py-2 pr-3">Produksi</th>
                <th className="py-2 pr-3">Input</th>
                <th className="py-2 pr-3">Film</th>
                <th className="py-2 pr-3">Nilai</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Contoh</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-b border-line">
                  <td className="py-2 pr-3">{new Date(job.created_at).toLocaleString('id-ID')}</td>
                  <td className="py-2 pr-3 font-medium text-ink">{job.user_email}</td>
                  <td className="py-2 pr-3">{job.production_type === 'sablon' ? 'Sablon' : 'Sticker'}</td>
                  <td className="py-2 pr-3">{inputModeLabels[job.input_mode] || job.input_mode}</td>
                  <td className="py-2 pr-3">{job.separation_film_count}</td>
                  <td className="py-2 pr-3">{formatRupiah(job.price_idr || 0)}</td>
                  <td className="py-2 pr-3"><StatusBadge status={job.status} /></td>
                  <td className="py-2 pr-3">
                    {(() => {
                      const isPublished = job.is_example_public || job.is_active_example;
                      return (
                    <div className="flex max-w-72 flex-wrap items-center gap-2">
                      {isPublished && (
                        <span className="inline-flex items-center gap-1 border border-spruce bg-primary/5 px-2 py-1 text-xs font-semibold text-spruce">
                          <Star className="h-3.5 w-3.5" aria-hidden="true" />
                          Contoh dipublish
                        </span>
                      )}
                      <button
                        type="button"
                        disabled={isBusy || (!isPublished && !job.can_set_as_example)}
                        onClick={() => toggleJobExample(job)}
                        className="inline-flex min-h-8 items-center justify-center gap-1 border border-spruce bg-white px-2 py-1 text-xs font-semibold text-spruce disabled:cursor-not-allowed disabled:border-gray-300 disabled:text-gray-400"
                        title={
                          isPublished
                            ? 'Cabut job ini dari feed contoh user.'
                            : job.can_set_as_example
                              ? 'Publish job ini ke feed contoh user.'
                              : 'Hanya job superadmin dengan bundle contoh lengkap yang bisa dipublish.'
                        }
                      >
                        <Star className="h-3.5 w-3.5" aria-hidden="true" />
                        {isPublished ? 'Cabut contoh' : 'Publish contoh'}
                      </button>
                      {!isPublished && !job.can_set_as_example && (
                        <p className="basis-full text-xs leading-5 text-gray-600">{examplePublishHint(job, isPublished)}</p>
                      )}
                    </div>
                      );
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
