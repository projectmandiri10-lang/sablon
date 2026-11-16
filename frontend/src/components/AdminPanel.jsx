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
  listAdminQrisWebhookLogs,
  listAdminSettings,
  listAdminUsers,
  rejectManualPayment,
  setAdminJobExample,
  settleAdminQrisPayment,
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
import { isValidQrisPayload } from '../../../shared/qrisPayload.js';

const pricingLabels = {
  [INPUT_MODE_READY]: 'Pecah warna dan buat pola cutting sticker',
  [INPUT_MODE_RETOUCH]: 'Gambar ulang',
  separation_film: 'Film separasi'
};

const inputModeLabels = {
  [INPUT_MODE_READY]: 'Pecah warna & pola cutting sticker',
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
    qrPayload: '',
    instructions: 'Scan QRIS merchant lalu bayar sesuai nominal unik yang muncul di billing.',
    contact: '',
    closedHours: normalizeInteractiveQrisClosedHours(DEFAULT_INTERACTIVE_QRIS_CLOSED_HOURS)
  };
}

async function decodeQrisPayloadFromImageFile(file) {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Gambar QR tidak bisa dibaca.'));
      element.src = objectUrl;
    });
    const maxEdge = 1600;
    const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round((image.naturalWidth || 1) * scale));
    canvas.height = Math.max(1, Math.round((image.naturalHeight || 1) * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const { default: jsQR } = await import('jsqr');
    const decoded = jsQR(imageData.data, imageData.width, imageData.height);
    return String(decoded?.data || '').trim();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function examplePublishHint(job, isPublished) {
  if (isPublished) return 'Job ini sedang tampil di feed contoh user.';
  if (job.can_set_as_example) return 'Siap dipublish sebagai contoh.';
  if (job.status !== 'done') return 'Hanya job selesai yang bisa dipublish.';
  if (!['superuser', 'superadmin'].includes(job.owner_role)) return 'Hanya job milik superadmin yang bisa dipublish.';
  if (!job.has_example_artifacts) {
    return 'Belum ada file contoh di server. Generate atau trace ulang 1 job baru superadmin (otomatis terpublish), atau upload dari browser yang menyimpan riwayat job ini.';
  }
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

export default function AdminPanel({
  session,
  enabled,
  activeTab = 'overview',
  onActiveTabChange,
  historyJobs = [],
  onPublishHistoryJobAsExample,
  onExampleJobsChanged
}) {
  const [localActiveTab, setLocalActiveTab] = useState(activeTab || 'overview');
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [automaticPayments, setAutomaticPayments] = useState([]);
  const [qrisWebhookLogs, setQrisWebhookLogs] = useState([]);
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
        qrPayload: interactiveQris.qrPayload || '',
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
      const [overviewData, usersData, paymentsData, automaticPaymentsData, qrisWebhookLogsData, pricingData, settingsData, jobsData] = await Promise.all([
        getAdminOverview(accessToken),
        listAdminUsers(accessToken),
        listAdminManualPayments(accessToken),
        listAdminPaymentTransactions(accessToken),
        listAdminQrisWebhookLogs(accessToken).catch(() => ({ logs: [] })),
        listAdminPricingRules(accessToken),
        listAdminSettings(accessToken),
        listAdminJobs(accessToken)
      ]);
      setOverview(overviewData.overview || null);
      setUsers(usersData.users || []);
      setPayments(paymentsData.payments || []);
      setAutomaticPayments(automaticPaymentsData.payments || []);
      setQrisWebhookLogs(qrisWebhookLogsData.logs || []);
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
        qrPayload: interactiveQris.qrPayload || '',
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

  async function settleQrisPayment(payment) {
    if (!payment?.id) return;
    setIsBusy(true);
    setMessage('');
    try {
      await settleAdminQrisPayment(payment.id, accessToken);
      await loadAdminData();
      setMessage(`Pembayaran QRIS ${payment.order_id} (${formatRupiah(payment.amount_idr)}) diselesaikan dan saldo ditambahkan.`);
    } catch (error) {
      setMessage(toUserApiError(error, 'Gagal menyelesaikan transaksi QRIS.').message);
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
      let successMessage = 'Gambar QRIS berhasil diupload dan setting QRIS diperbarui.';
      try {
        const decodedPayload = await decodeQrisPayloadFromImageFile(interactiveQrisImageFile);
        if (decodedPayload && isValidQrisPayload(decodedPayload)) {
          nextDraft.qrPayload = decodedPayload;
          successMessage = 'Gambar QRIS berhasil diupload dan payload QRIS dinamis terbaca otomatis.';
        } else {
          successMessage = 'Gambar terupload, tetapi payload QR tidak terbaca otomatis. Paste payload manual bila ingin QR dinamis.';
        }
      } catch {
        successMessage = 'Gambar terupload, tetapi payload QR tidak terbaca otomatis. Paste payload manual bila ingin QR dinamis.';
      }
      setInteractiveQrisDraft(nextDraft);
      await persistInteractiveQrisSetting(nextDraft, successMessage);
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
      } else if (!job.can_set_as_example && job.localItem && typeof onPublishHistoryJobAsExample === 'function') {
        const uploadedJobId = await onPublishHistoryJobAsExample(job.localItem, job.isLocalOnly ? '' : job.id);
        await setAdminJobExample(uploadedJobId, accessToken);
      } else {
        await setAdminJobExample(job.id, accessToken);
      }
      await loadAdminData();
      await onExampleJobsChanged?.();
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

  const sessionEmail = String(session?.user?.email || '').trim().toLowerCase();
  const superadminJobCandidates = useMemo(() => {
    const localById = new Map();
    const completedLocal = (historyJobs || []).filter((item) => (item?.job?.status || item?.status || 'done') === 'done');
    completedLocal.forEach((item) => {
      const id = String(item?.job?.jobId || item?.id || '');
      if (id) localById.set(id, item);
      if (item?.committedJobId) localById.set(String(item.committedJobId), item);
    });

    const merged = [];
    const seenIds = new Set();

    (jobs || []).forEach((job) => {
      const isSuperadminOwner =
        ['superuser', 'superadmin'].includes(job.owner_role) ||
        (sessionEmail && String(job.user_email || '').trim().toLowerCase() === sessionEmail);
      if (!isSuperadminOwner) return;
      seenIds.add(String(job.id));
      const matchedLocal = localById.get(String(job.id)) || null;
      merged.push({
        ...job,
        isLocalOnly: false,
        localItem: matchedLocal,
        sourcePreviewUrl: matchedLocal?.sourcePreviewUrl || '',
        resultPreviewUrl: job.example_result_url || matchedLocal?.job?.files?.fullPng || ''
      });
    });

    completedLocal.forEach((localItem) => {
      const candidateId = String(localItem.committedJobId || localItem.job?.jobId || localItem.id || '');
      if (!candidateId || seenIds.has(candidateId)) return;
      seenIds.add(candidateId);
      merged.push({
        id: candidateId,
        project_name: localItem.projectName || localItem.job?.settings?.projectName || 'Project Vector',
        created_at: localItem.updatedAt || localItem.createdAt || new Date().toISOString(),
        user_email: session?.user?.email || 'Superadmin (Lokal)',
        owner_role: 'superuser',
        production_type: localItem.productionType || localItem.job?.settings?.productionType || 'sticker',
        input_mode: localItem.inputMode || localItem.job?.settings?.inputMode || INPUT_MODE_READY,
        separation_film_count: localItem.job?.separationFilmCount || 0,
        price_idr: localItem.job?.priceIdr || 0,
        status: localItem.job?.status || 'done',
        is_example_public: false,
        is_active_example: false,
        can_set_as_example: false,
        has_example_artifacts: false,
        isLocalOnly: true,
        localItem,
        sourcePreviewUrl: localItem.sourcePreviewUrl || '',
        resultPreviewUrl: localItem.job?.files?.fullPng || ''
      });
    });

    return merged.sort((left, right) => new Date(right.created_at || 0) - new Date(left.created_at || 0));
  }, [historyJobs, jobs, session?.user?.email, sessionEmail]);

  if (!enabled) return null;

  return (
    <section className="studio-card p-5 sm:p-6">
      <div className="mb-5 flex flex-col gap-3 border-b border-line pb-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Shield className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-ink">Halaman superadmin</h2>
            <p className="text-xs text-slate-500">Kelola pengguna, pembayaran, keuangan, harga, dan contoh hasil.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={loadAdminData}
          disabled={isBusy}
          className="studio-btn-secondary !min-h-9 !rounded-xl !px-3.5 !py-1.5 !text-xs"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Refresh
        </button>
      </div>

      <div className="mb-5 flex flex-wrap gap-1.5 rounded-2xl border border-line bg-slate-100/80 p-1.5">
        {tabs.map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => handleActiveTabChange(id)}
            className={`inline-flex min-h-9 items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-bold transition sm:text-sm ${
              resolvedActiveTab === id
                ? 'bg-white text-primary shadow-sm'
                : 'text-slate-600 hover:text-ink'
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {message && (
        <p className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50/70 px-4 py-2.5 text-sm font-medium text-indigo-900">
          {message}
        </p>
      )}

      {resolvedActiveTab === 'overview' && (
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {statCards.map(([label, value]) => (
            <div key={label} className="studio-subcard p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p>
              <p className="mt-1.5 text-2xl font-extrabold tracking-tight text-ink">{value}</p>
            </div>
          ))}
        </div>
      )}

      {resolvedActiveTab === 'users' && (
        <div className="space-y-5">
          <form className="studio-subcard grid gap-3.5 p-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_200px_150px_auto_auto]" onSubmit={createUser}>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-slate-700">Nama user</span>
              <input
                value={newUser.fullName}
                onChange={(event) => setNewUser((current) => ({ ...current, fullName: event.target.value }))}
                className="studio-input"
                placeholder="Nama lengkap"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-slate-700">Email</span>
              <input
                type="email"
                value={newUser.email}
                onChange={(event) => setNewUser((current) => ({ ...current, email: event.target.value }))}
                className="studio-input"
                placeholder="user@email.com"
                required
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-slate-700">Password awal</span>
              <input
                type="text"
                value={newUser.password}
                onChange={(event) => setNewUser((current) => ({ ...current, password: event.target.value }))}
                className="studio-input"
                placeholder="Minimal 6 karakter"
                minLength={6}
                required
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-slate-700">Role</span>
              <select
                value={newUser.role}
                onChange={(event) => setNewUser((current) => ({ ...current, role: event.target.value }))}
                className="studio-input"
              >
                <option value="user">User</option>
                <option value="superuser">Superadmin</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-slate-700">Credit awal</span>
              <input
                type="number"
                min="0"
                step="1000"
                value={newUser.initialCreditIdr}
                onChange={(event) => setNewUser((current) => ({ ...current, initialCreditIdr: event.target.value }))}
                className="studio-input"
                placeholder="0"
              />
            </label>
            <div className="flex flex-col justify-center gap-2 pt-2">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-ink">
                <input
                  type="checkbox"
                  checked={newUser.isUnlimited}
                  onChange={(event) => setNewUser((current) => ({ ...current, isUnlimited: event.target.checked }))}
                  className="h-4 w-4 accent-primary"
                />
                Credit unlimited
              </label>
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-ink">
                <input
                  type="checkbox"
                  checked={newUser.isActive}
                  onChange={(event) => setNewUser((current) => ({ ...current, isActive: event.target.checked }))}
                  className="h-4 w-4 accent-primary"
                />
                Langsung aktif
              </label>
            </div>
            <div className="md:col-span-2 xl:col-span-6">
              <button type="submit" disabled={isBusy} className="studio-btn-primary">
                <UserPlus className="h-4 w-4" aria-hidden="true" />
                Buat user baru
              </button>
            </div>
          </form>

          <div className="overflow-hidden rounded-2xl border border-line">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1040px] border-collapse text-left text-xs sm:text-sm">
                <thead className="bg-slate-50">
                  <tr className="border-b border-line text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="px-3.5 py-3">User</th>
                    <th className="px-3.5 py-3">Role</th>
                    <th className="px-3.5 py-3">Credit</th>
                    <th className="px-3.5 py-3">Top up</th>
                    <th className="px-3.5 py-3">Status</th>
                    <th className="px-3.5 py-3">Unlimited</th>
                    <th className="px-3.5 py-3">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line bg-white">
                  {users.map((user) => (
                    <tr key={user.id} className="transition hover:bg-slate-50/70">
                      <td className="px-3.5 py-3">
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
                            className="w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-semibold text-ink outline-none focus:border-primary"
                            placeholder="Nama user"
                          />
                          <p className="mt-1 truncate text-xs text-slate-500">{user.email}</p>
                        </div>
                      </td>
                      <td className="px-3.5 py-3">
                        <select
                          value={user.role}
                          onChange={(event) => setUserPatch(user.id, { role: event.target.value })}
                          className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-semibold text-ink"
                        >
                          <option value="user">user</option>
                          <option value="superuser">superadmin</option>
                        </select>
                      </td>
                      <td className="px-3.5 py-3 font-bold text-ink">{user.is_unlimited ? 'Unlimited' : formatRupiah(user.balance || 0)}</td>
                      <td className="px-3.5 py-3">
                        <div className="flex gap-1.5">
                          <input
                            type="number"
                            value={amountByUser[user.id] || ''}
                            onChange={(event) => setAmountByUser((current) => ({ ...current, [user.id]: event.target.value }))}
                            className="w-24 rounded-lg border border-line px-2.5 py-1.5 font-mono text-xs"
                            placeholder="10000"
                          />
                          <button
                            type="button"
                            onClick={() => addCredit(user.id)}
                            className="rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-xs font-bold text-primary transition hover:bg-primary hover:text-white"
                          >
                            Tambah
                          </button>
                        </div>
                      </td>
                      <td className="px-3.5 py-3">
                        <label className="inline-flex items-center gap-2 text-xs font-medium">
                          <input
                            type="checkbox"
                            checked={user.is_active}
                            onChange={(event) => setUserPatch(user.id, { is_active: event.target.checked, deleted_at: event.target.checked ? null : new Date().toISOString() })}
                            className="h-4 w-4 accent-primary"
                          />
                          Aktif
                        </label>
                      </td>
                      <td className="px-3.5 py-3">
                        <label className="inline-flex items-center gap-2 text-xs font-medium">
                          <input
                            type="checkbox"
                            checked={user.is_unlimited}
                            onChange={(event) => setUserPatch(user.id, { is_unlimited: event.target.checked })}
                            className="h-4 w-4 accent-primary"
                          />
                          Unlimited
                        </label>
                      </td>
                      <td className="px-3.5 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => setUserPatch(user.id, { is_active: false, deleted_at: new Date().toISOString() })}
                            className="rounded-lg border border-line bg-white px-2.5 py-1 text-xs font-semibold text-ink hover:bg-slate-50"
                          >
                            Nonaktifkan
                          </button>
                          <button
                            type="button"
                            onClick={() => removeUser(user)}
                            className="inline-flex items-center justify-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
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
        </div>
      )}

      {resolvedActiveTab === 'payments' && (
        <div className="space-y-6">

          <div>
            <h3 className="mb-3 text-sm font-bold text-ink">Transaksi pembayaran otomatis</h3>
            <div className="overflow-hidden rounded-2xl border border-line">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1080px] border-collapse text-left text-xs sm:text-sm">
                  <thead className="bg-slate-50">
                    <tr className="border-b border-line text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <th className="px-3.5 py-3">User</th>
                      <th className="px-3.5 py-3">Provider</th>
                      <th className="px-3.5 py-3">Order</th>
                      <th className="px-3.5 py-3">Nominal bayar</th>
                      <th className="px-3.5 py-3">Nominal dasar</th>
                      <th className="px-3.5 py-3">Status</th>
                      <th className="px-3.5 py-3">Channel</th>
                      <th className="px-3.5 py-3">Credit</th>
                      <th className="px-3.5 py-3">Waktu bayar</th>
                      <th className="px-3.5 py-3">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line bg-white">
                    {automaticPayments.length === 0 ? (
                      <tr>
                        <td colSpan="10" className="px-4 py-6 text-center text-sm text-slate-500">Belum ada transaksi pembayaran otomatis.</td>
                      </tr>
                    ) : (
                      automaticPayments.map((payment) => (
                        <tr key={payment.id} className="transition hover:bg-slate-50/70">
                          <td className="px-3.5 py-3 font-medium text-ink">{payment.user_email}</td>
                          <td className="px-3.5 py-3">{paymentProviderLabel(payment.provider)}</td>
                          <td className="px-3.5 py-3 font-mono text-xs">{payment.order_id}</td>
                          <td className="px-3.5 py-3 font-bold text-ink">{formatRupiah(payment.amount_idr)}</td>
                          <td className="px-3.5 py-3 text-slate-600">{payment.base_amount_idr ? formatRupiah(payment.base_amount_idr) : '-'}</td>
                          <td className="px-3.5 py-3"><StatusBadge status={payment.status} /></td>
                          <td className="px-3.5 py-3">{paymentChannelLabel(payment)}</td>
                          <td className="px-3.5 py-3">{payment.credited_ledger_id ? 'Masuk' : 'Belum'}</td>
                          <td className="px-3.5 py-3 text-slate-500">{payment.paid_at ? new Date(payment.paid_at).toLocaleString('id-ID') : '-'}</td>
                          <td className="px-3.5 py-3">
                            {payment.provider === 'interactive_qris' && !payment.credited_ledger_id ? (
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => settleQrisPayment(payment)}
                                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                              >
                                <Check className="h-3.5 w-3.5" />
                                Selesaikan
                              </button>
                            ) : (
                              <span className="text-xs text-slate-400">-</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-ink">Log Webhook QRIS (MacroDroid)</h3>
                <p className="text-xs text-slate-500">
                  Menampilkan 30 webhook terakhir yang masuk ke Worker (tanpa menyimpan secret) untuk melacak alasan saldo masuk atau ditolak.
                </p>
              </div>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => loadAdminData({ preserveMessage: true })}
                className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-white px-3 py-1.5 text-xs font-bold text-ink transition hover:bg-slate-50 disabled:opacity-50"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh log
              </button>
            </div>
            <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-950">
              <p className="font-bold">Checklist MacroDroid untuk InterActive QRIS v1.7.0:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                <li>Trigger <strong>Notification Received</strong>: pilih ulang aplikasi <strong>InterActive QRIS</strong> (<code className="font-mono">com.interactive.qrisid</code>), aktifkan <strong>Ignore ongoing notifications</strong> (agar progress sinkronisasi tidak mengirim spam), dan matikan <strong>Prevent multiple triggers</strong>.</li>
                <li>Jika masih belum tertangkap, impor sementara <code className="font-mono">macrodroid/interactive-qris-diagnostic-any-app.macro</code> untuk menangkap seluruh notifikasi lalu cek tabel log ini.</li>
                <li>Izin Android: aktifkan <strong>Akses Notifikasi (Notification Access)</strong> (bukan hanya Aksesibilitas) dan set baterai ke <strong>Tidak dibatasi (Unrestricted)</strong>.</li>
                <li>Action <strong>HTTP Request</strong>: aktifkan <strong>Block next actions until complete</strong> agar log & Toast menampilkan hasil asli.</li>
              </ul>
            </div>
            <div className="overflow-hidden rounded-2xl border border-line">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1040px] border-collapse text-left text-xs sm:text-sm">
                  <thead className="bg-slate-50">
                    <tr className="border-b border-line text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <th className="px-3.5 py-3">Waktu</th>
                      <th className="px-3.5 py-3">HTTP</th>
                      <th className="px-3.5 py-3">Hasil</th>
                      <th className="px-3.5 py-3">Alasan</th>
                      <th className="px-3.5 py-3">Package</th>
                      <th className="px-3.5 py-3">Nominal terdeteksi</th>
                      <th className="px-3.5 py-3">Order cocok</th>
                      <th className="px-3.5 py-3">Preview payload</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line bg-white">
                    {qrisWebhookLogs.length === 0 ? (
                      <tr>
                        <td colSpan="8" className="px-4 py-6 text-center text-sm text-slate-500">
                          Belum ada webhook MacroDroid QRIS yang tercatat. Jika Anda baru mengirim webhook, cek URL endpoint Worker (`.../api/payments/interactive-qris/webhook`).
                        </td>
                      </tr>
                    ) : (
                      qrisWebhookLogs.map((entry) => {
                        const candidates = Array.isArray(entry.amount_candidates) ? entry.amount_candidates : [];
                        const isMacroTestDummy =
                          entry.package_name === 'test app package' || entry.package_name === '{not_app_package}';
                        const reasonHintMap = {
                          invalid_secret: 'Secret header salah/kosong',
                          unexpected_package: isMacroTestDummy
                            ? 'Ini hasil tombol Test Macro / Test Actions di MacroDroid (bukan notifikasi pembayaran asli)'
                            : 'Package bukan InterActive QRIS',
                          amount_not_found: 'Nominal Rp tidak ditemukan pada teks notifikasi',
                          payment_not_found: 'Tidak ada tagihan QRIS pending dengan nominal cocok',
                          ambiguous_amount_match: 'Lebih dari 1 tagihan pending bernominal sama',
                          matched_and_credited: 'Cocok & saldo masuk'
                        };
                        const outcomeClass =
                          entry.outcome === 'settled'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : entry.outcome === 'rejected'
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : 'bg-amber-50 text-amber-800 border-amber-200';
                        return (
                          <tr key={entry.id} className="align-top transition hover:bg-slate-50/70">
                            <td className="whitespace-nowrap px-3.5 py-3 text-slate-500">
                              {entry.created_at ? new Date(entry.created_at).toLocaleString('id-ID') : '-'}
                            </td>
                            <td className="px-3.5 py-3 font-mono text-xs">{entry.status_code}</td>
                            <td className="px-3.5 py-3">
                              <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold ${outcomeClass}`}>
                                {entry.outcome}
                              </span>
                            </td>
                            <td className="px-3.5 py-3 text-xs text-slate-700">
                              <div className="font-mono">{entry.reason || '-'}</div>
                              {entry.reason && reasonHintMap[entry.reason] && (
                                <div className="mt-0.5 text-[11px] text-slate-500">{reasonHintMap[entry.reason]}</div>
                              )}
                            </td>
                            <td className="px-3.5 py-3 font-mono text-xs text-slate-600">{entry.package_name || '-'}</td>
                            <td className="px-3.5 py-3 font-mono text-xs text-ink">
                              {candidates.length > 0 ? candidates.map((amount) => formatRupiah(amount)).join(', ') : '-'}
                            </td>
                            <td className="px-3.5 py-3 font-mono text-xs text-ink">{entry.matched_order_id || '-'}</td>
                            <td className="max-w-[320px] break-all px-3.5 py-3 font-mono text-[11px] text-slate-600">
                              {entry.payload_preview || '-'}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {resolvedActiveTab === 'finance' && <AdminFinancePanel accessToken={accessToken} />}

      {resolvedActiveTab === 'pricing' && (
        <div className="grid gap-3.5">
          {pricingRules.map((rule) => {
            const draft = pricingDraft[rule.key] || {};
            return (
              <div key={rule.key} className="studio-subcard grid gap-3.5 p-4 md:grid-cols-[1fr_160px_1.4fr_auto_auto] md:items-end">
                <div>
                  <p className="text-sm font-bold text-ink">{pricingLabels[rule.key] || rule.key}</p>
                  <p className="text-xs text-slate-500">Aturan harga aplikasi</p>
                </div>
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500">Harga</span>
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={draft.amountIdr ?? rule.amount_idr}
                    onChange={(event) => setPricingDraft((current) => ({ ...current, [rule.key]: { ...draft, amountIdr: event.target.value } }))}
                    className="studio-input font-mono font-bold"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-500">Deskripsi</span>
                  <input
                    value={draft.description ?? rule.description ?? ''}
                    onChange={(event) => setPricingDraft((current) => ({ ...current, [rule.key]: { ...draft, description: event.target.value } }))}
                    className="studio-input"
                  />
                </label>
                <label className="inline-flex items-center gap-2 pb-2.5 text-xs font-bold text-ink">
                  <input
                    type="checkbox"
                    checked={draft.active ?? rule.active}
                    onChange={(event) => setPricingDraft((current) => ({ ...current, [rule.key]: { ...draft, active: event.target.checked } }))}
                    className="h-4 w-4 accent-primary"
                  />
                  Aktif
                </label>
                <button type="button" onClick={() => savePricing(rule)} className="studio-btn-primary !min-h-10">
                  <Save className="h-4 w-4" aria-hidden="true" />
                  Simpan
                </button>
              </div>
            );
          })}
        </div>
      )}

      {resolvedActiveTab === 'settings' && (
        <div className="grid gap-5">
          <div className="studio-subcard p-5">
            <h3 className="mb-4 text-sm font-bold text-ink">Model gambar ulang</h3>
            <div className="grid gap-4">
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-slate-700">Preset model</span>
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
                  className="studio-input"
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
                  <span className="mb-1.5 block text-xs font-bold text-slate-700">Provider utama</span>
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
                    className="studio-input bg-slate-100 text-slate-600"
                  >
                    <option value={AIVENE_IMAGE_REDRAW_PROVIDER}>AIVene</option>
                    <option value={OPENAI_IMAGE_REDRAW_PROVIDER}>OpenAI</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-slate-700">Provider fallback</span>
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
                    className="studio-input bg-slate-100 text-slate-600"
                  >
                    <option value="">Tanpa fallback</option>
                    <option value={OPENAI_IMAGE_REDRAW_PROVIDER}>OpenAI</option>
                    <option value={AIVENE_IMAGE_REDRAW_PROVIDER}>AIVene</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-slate-700">Strategi fallback</span>
                  <input
                    value="Otomatis untuk quota, billing, model unavailable, timeout, network, atau 5xx"
                    readOnly
                    className="studio-input bg-slate-100 text-slate-600"
                  />
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-slate-700">Model gambar AIVene</span>
                  <select
                    value={aiModelDraft.aiveneImageModel || 'gpt-image-2'}
                    disabled={AIVENE_IMAGE_MODELS.length <= 1}
                    onChange={(event) =>
                      setAiModelDraft((current) => selectAiveneImageModel(current, event.target.value))
                    }
                    className="studio-input disabled:bg-slate-100 disabled:text-slate-600"
                  >
                    {AIVENE_IMAGE_MODELS.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-slate-700">Model gambar OpenAI</span>
                  <input
                    value="gpt-image-2"
                    readOnly
                    className="studio-input bg-slate-100 text-slate-600"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-slate-700">Kontrak edit image</span>
                  <input value="OpenAI-compatible /images/edits" readOnly className="studio-input bg-slate-100 text-slate-600" />
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-slate-700">Quality gambar</span>
                  <select
                    value={aiModelDraft.generationQuality || ''}
                    onChange={(event) => setAiModelDraft((current) => ({ ...current, mode: 'custom', preset: 'custom', label: 'Custom', generationQuality: event.target.value }))}
                    className="studio-input"
                  >
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-slate-700">Ukuran gambar</span>
                  <select
                    value={aiModelDraft.imageSize || '1K'}
                    onChange={(event) => setAiModelDraft((current) => ({ ...current, mode: 'custom', preset: 'custom', label: 'Custom', imageSize: event.target.value }))}
                    className="studio-input"
                  >
                    <option value="1K">1K</option>
                    <option value="2K">2K</option>
                    <option value="4K">4K</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-slate-700">Fidelity input</span>
                  <input
                    value="Nonaktif (tidak dikirim)"
                    readOnly
                    className="studio-input bg-slate-100 text-slate-600"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-slate-700">Prompt profile</span>
                  <select
                    value={aiModelDraft.promptProfile || 'logo_photo_cleanup_short'}
                    onChange={(event) => setAiModelDraft((current) => ({ ...current, mode: 'custom', preset: 'custom', label: 'Custom', promptProfile: event.target.value }))}
                    className="studio-input"
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
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-slate-700">Estimasi USD/gambar</span>
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={aiModelDraft.estimatedUsdPerImage}
                    onChange={(event) => setAiModelDraft((current) => ({ ...current, mode: 'custom', preset: 'custom', label: 'Custom', estimatedUsdPerImage: event.target.value }))}
                    className="studio-input font-mono"
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-slate-700">Resolusi policy</span>
                  <select
                    value={aiModelDraft.resolutionPolicy}
                    onChange={(event) => setAiModelDraft((current) => ({ ...current, mode: 'custom', preset: 'custom', label: 'Custom', resolutionPolicy: event.target.value }))}
                    className="studio-input"
                  >
                    <option value="economy">Economy</option>
                    <option value="standard">Standard</option>
                    <option value="high">High</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-slate-700">Aspect policy</span>
                  <input value={aiModelDraft.aspectPolicy} readOnly className="studio-input bg-slate-100 text-slate-600" />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-slate-700">Preprocess</span>
                  <input value={aiModelDraft.preprocess} readOnly className="studio-input bg-slate-100 text-slate-600" />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-bold text-slate-700">Batas input AI</span>
                  <input value={`${aiModelDraft.inputMaxEdge || 1080}px sisi terpanjang`} readOnly className="studio-input bg-slate-100 text-slate-600" />
                </label>
              </div>
              <div className="rounded-xl border border-line bg-white p-3.5 text-xs leading-6 text-slate-600">
                <p>
                  Aktif: <strong className="text-ink">{aiModelDraft.label}</strong> | primary {providerLabel(aiModelDraft.primaryProvider)}
                  {aiModelDraft.generationQuality ? ` (${aiModelDraft.generationQuality.toUpperCase()})` : ''} · Estimasi {formatRupiah(estimatedIdr(aiModelDraft.estimatedUsdPerImage))}/redraw hybrid.
                </p>
                <p>
                  Pipeline: <strong className="text-ink">{providerModelLabel(aiModelDraft.primaryProvider, aiModelDraft)}</strong>
                  {aiModelDraft.fallbackProvider ? ` · fallback ${providerModelLabel(aiModelDraft.fallbackProvider, aiModelDraft)}` : ''}
                  {' · '}image {aiModelDraft.imageSize || '1K'} · prompt {aiModelDraft.promptProfile || 'logo_photo_cleanup_short'} · input_fidelity nonaktif · retry low-confidence {aiModelDraft.retryOnLowConfidence ? 'aktif' : 'mati'}.
                </p>
              </div>
              <button type="button" onClick={saveAiModelSetting} className="studio-btn-primary w-fit">
                <Save className="h-4 w-4" aria-hidden="true" />
                Simpan pipeline redraw
              </button>
            </div>
          </div>

          <div className="studio-subcard p-5">
            <h3 className="mb-4 text-sm font-bold text-ink">QRIS otomatis</h3>
            <div className="grid gap-4">
              <label className="inline-flex items-center gap-2 text-sm font-bold text-ink">
                <input
                  type="checkbox"
                  checked={interactiveQrisDraft.enabled}
                  onChange={(event) => setInteractiveQrisDraft((current) => ({ ...current, enabled: event.target.checked }))}
                  className="h-4 w-4 accent-primary"
                />
                Aktifkan QRIS otomatis
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-slate-700">Nama merchant</span>
                <input
                  value={interactiveQrisDraft.merchantName}
                  onChange={(event) => setInteractiveQrisDraft((current) => ({ ...current, merchantName: event.target.value }))}
                  className="studio-input"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-slate-700">Upload gambar QR</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => setInteractiveQrisImageFile(event.target.files?.[0] || null)}
                  className="studio-input"
                />
                <p className="mt-1 text-xs text-slate-500">Format: PNG, JPG/JPEG, atau WEBP. Maksimal 5 MB.</p>
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleInteractiveQrisImageUpload}
                  disabled={isBusy || isUploadingInteractiveQrisImage || !interactiveQrisImageFile}
                  className="studio-btn-secondary"
                >
                  <Save className="h-4 w-4" aria-hidden="true" />
                  {isUploadingInteractiveQrisImage ? 'Mengupload gambar...' : 'Upload gambar QRIS'}
                </button>
                {interactiveQrisImageFile && <p className="text-xs text-slate-600">{interactiveQrisImageFile.name}</p>}
              </div>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-slate-700">URL gambar QR aktif</span>
                <input
                  value={interactiveQrisDraft.qrImageUrl}
                  readOnly
                  className="studio-input bg-slate-100 text-slate-600"
                  placeholder="Belum ada gambar QR aktif"
                />
              </label>
              {interactiveQrisDraft.qrImageUrl && (
                <div className="rounded-xl border border-line bg-white p-3.5">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Preview QR aktif</p>
                  <img
                    src={interactiveQrisDraft.qrImageUrl}
                    alt={interactiveQrisDraft.merchantName || 'QRIS aktif'}
                    className="h-auto w-full max-w-[200px] rounded-xl border border-line bg-white p-2"
                  />
                </div>
              )}
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-slate-700">Payload QRIS statis (teks EMVCo)</span>
                <textarea
                  value={interactiveQrisDraft.qrPayload}
                  onChange={(event) => setInteractiveQrisDraft((current) => ({ ...current, qrPayload: event.target.value }))}
                  className="studio-input min-h-24 font-mono text-xs"
                  placeholder="00020101021126..."
                />
                <p className="mt-1 text-xs text-slate-500">
                  Opsional. Bila diisi, billing menampilkan QR dinamis sesuai nominal unik. Bisa paste manual atau terisi otomatis dari gambar QR yang diupload.
                </p>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-slate-700">Instruksi billing</span>
                <textarea
                  value={interactiveQrisDraft.instructions}
                  onChange={(event) => setInteractiveQrisDraft((current) => ({ ...current, instructions: event.target.value }))}
                  className="studio-input min-h-24"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-slate-700">Kontak admin</span>
                <input
                  value={interactiveQrisDraft.contact}
                  onChange={(event) => setInteractiveQrisDraft((current) => ({ ...current, contact: event.target.value }))}
                  className="studio-input"
                />
              </label>
              <div className="rounded-xl border border-line bg-white p-4">
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
                      className="h-4 w-4 accent-primary"
                    />
                    Aktifkan penutupan QRIS otomatis
                  </label>
                  <div className="grid gap-3 md:grid-cols-3">
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-bold text-slate-700">Jam mulai tutup</span>
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
                        className="studio-input"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-bold text-slate-700">Jam buka kembali</span>
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
                        className="studio-input"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-bold text-slate-700">Timezone</span>
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
                        className="studio-input"
                      />
                    </label>
                  </div>
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-bold text-slate-700">Pesan saat tutup</span>
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
                      className="studio-input min-h-24"
                    />
                  </label>
                </div>
              </div>
              <button
                type="button"
                onClick={saveInteractiveQrisSetting}
                disabled={isBusy || savingSettingKey === 'interactive_qris_payment'}
                className="studio-btn-primary w-fit"
              >
                <Save className="h-4 w-4" aria-hidden="true" />
                {savingSettingKey === 'interactive_qris_payment' ? 'Menyimpan setting QRIS...' : 'Simpan setting QRIS'}
              </button>
            </div>
          </div>
          <div className="rounded-xl border border-line bg-slate-50 px-4 py-3 text-xs text-slate-600">
            Setting tersimpan dibaca oleh halaman billing user tanpa menyimpan file output di server.
          </div>
        </div>
      )}

      {resolvedActiveTab === 'jobs' && (
        <div className="space-y-6">
          {/* History Job Superadmin untuk dipilih sebagai Contoh User */}
          <div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-ink">History job superadmin (pilih sebagai contoh user)</h3>
                <p className="text-xs text-slate-500">
                  Pilih salah satu hasil yang sudah digenerate oleh superadmin (dari server atau riwayat browser) untuk ditampilkan di tab Contoh Hasil user lain.
                </p>
              </div>
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary">
                {superadminJobCandidates.length} job superadmin
              </span>
            </div>

            {superadminJobCandidates.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-8 text-center text-xs text-slate-600">
                Belum ada history job selesai dari superadmin. Generate gambar di tab <strong>Proses</strong> (Sablon atau Sticker), lalu kembali ke sini untuk mempublish sebagai contoh bagi user lain.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {superadminJobCandidates.map((job) => {
                  const isPublished = job.is_example_public || job.is_active_example;
                  const canSyncLocal = !isPublished && !job.can_set_as_example && Boolean(job.localItem && onPublishHistoryJobAsExample);
                  const canAction = isPublished || job.can_set_as_example || canSyncLocal;
                  return (
                    <article
                      key={`super-${job.id}`}
                      className={`studio-subcard flex flex-col justify-between p-4 ${
                        isPublished ? 'border-primary bg-primary/[0.03] ring-1 ring-primary/20' : ''
                      }`}
                    >
                      <div>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-ink">{job.project_name || 'Project Vector'}</p>
                            <p className="mt-0.5 text-[11px] text-slate-500">
                              {new Date(job.created_at).toLocaleString('id-ID')}
                            </p>
                          </div>
                          {isPublished ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold text-indigo-700 ring-1 ring-indigo-200">
                              <Star className="h-3 w-3" aria-hidden="true" />
                              Contoh aktif ({job.production_type === 'sablon' ? 'Sablon' : 'Sticker'})
                            </span>
                          ) : job.isLocalOnly ? (
                            <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200">
                              Riwayat browser
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                          <span className="rounded-md bg-white px-2 py-0.5 font-semibold text-slate-700 ring-1 ring-line">
                            {job.production_type === 'sablon' ? 'Sablon' : 'Sticker'}
                          </span>
                          <span className="rounded-md bg-white px-2 py-0.5 font-medium text-slate-600 ring-1 ring-line">
                            {inputModeLabels[job.input_mode] || job.input_mode}
                          </span>
                          <span className="rounded-md bg-white px-2 py-0.5 font-mono text-slate-600 ring-1 ring-line">
                            {job.separation_film_count || 0} film
                          </span>
                        </div>

                        {(job.sourcePreviewUrl || job.resultPreviewUrl) && (
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            {job.sourcePreviewUrl && (
                              <div className="checkerboard flex h-20 items-center justify-center overflow-hidden rounded-xl border border-line bg-white p-1.5">
                                <img src={job.sourcePreviewUrl} alt="Sebelum" className="h-full w-full object-contain" />
                              </div>
                            )}
                            {job.resultPreviewUrl && (
                              <div className="checkerboard flex h-20 items-center justify-center overflow-hidden rounded-xl border border-line bg-white p-1.5">
                                <img src={job.resultPreviewUrl} alt="Sesudah" className="h-full w-full object-contain" />
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="mt-3.5 border-t border-line pt-3">
                        <button
                          type="button"
                          disabled={isBusy || !canAction}
                          onClick={() => toggleJobExample(job)}
                          className={`w-full justify-center !min-h-9 !rounded-xl !px-3 !py-1.5 !text-xs ${
                            isPublished ? 'studio-btn-secondary' : 'studio-btn-primary'
                          }`}
                        >
                          <Star className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>
                            {isPublished
                              ? 'Cabut contoh'
                              : canSyncLocal
                                ? 'Upload & Publish Contoh'
                                : 'Jadikan Contoh User'}
                          </span>
                        </button>
                        {!canAction && (
                          <p className="mt-1.5 text-[11px] leading-4 text-slate-500">{examplePublishHint(job, isPublished)}</p>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>

          {/* Tabel Semua Riwayat Job Platform */}
          <div>
            <h3 className="mb-3 text-sm font-bold text-ink">Semua riwayat job di server</h3>
            <div className="overflow-hidden rounded-2xl border border-line">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] border-collapse text-left text-xs sm:text-sm">
                  <thead className="bg-slate-50">
                    <tr className="border-b border-line text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <th className="px-3.5 py-3">Waktu</th>
                      <th className="px-3.5 py-3">Project</th>
                      <th className="px-3.5 py-3">User</th>
                      <th className="px-3.5 py-3">Produksi</th>
                      <th className="px-3.5 py-3">Input</th>
                      <th className="px-3.5 py-3">Film</th>
                      <th className="px-3.5 py-3">Nilai</th>
                      <th className="px-3.5 py-3">Status</th>
                      <th className="px-3.5 py-3">Contoh</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line bg-white">
                    {jobs.length === 0 ? (
                      <tr>
                        <td colSpan="9" className="px-4 py-8 text-center text-xs text-slate-500">
                          Belum ada riwayat job yang tercatat di server.
                        </td>
                      </tr>
                    ) : (
                      jobs.map((job) => (
                        <tr key={job.id} className="transition hover:bg-slate-50/70">
                          <td className="px-3.5 py-3 text-slate-600">{new Date(job.created_at).toLocaleString('id-ID')}</td>
                          <td className="px-3.5 py-3 font-semibold text-ink">{job.project_name || 'Project Vector'}</td>
                          <td className="px-3.5 py-3 font-medium text-ink">{job.user_email}</td>
                          <td className="px-3.5 py-3">{job.production_type === 'sablon' ? 'Sablon' : 'Sticker'}</td>
                          <td className="px-3.5 py-3">{inputModeLabels[job.input_mode] || job.input_mode}</td>
                          <td className="px-3.5 py-3 font-mono">{job.separation_film_count}</td>
                          <td className="px-3.5 py-3 font-bold text-ink">{formatRupiah(job.price_idr || 0)}</td>
                          <td className="px-3.5 py-3"><StatusBadge status={job.status} /></td>
                          <td className="px-3.5 py-3">
                            {(() => {
                              const isPublished = job.is_example_public || job.is_active_example;
                              const matchingCandidate = superadminJobCandidates.find((c) => c.id === job.id);
                              const canSyncLocal = !isPublished && !job.can_set_as_example && Boolean(matchingCandidate?.localItem && onPublishHistoryJobAsExample);
                              const actionJob = matchingCandidate || job;
                              return (
                                <div className="flex max-w-72 flex-wrap items-center gap-2">
                                  {isPublished && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-bold text-indigo-700 ring-1 ring-indigo-200">
                                      <Star className="h-3 w-3" aria-hidden="true" />
                                      Contoh dipublish
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    disabled={isBusy || (!isPublished && !job.can_set_as_example && !canSyncLocal)}
                                    onClick={() => toggleJobExample(actionJob)}
                                    className="inline-flex min-h-8 items-center justify-center gap-1 rounded-lg border border-primary/30 bg-white px-2.5 py-1 text-xs font-semibold text-primary transition hover:bg-primary/5 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                                    title={
                                      isPublished
                                        ? 'Cabut job ini dari feed contoh user.'
                                        : job.can_set_as_example || canSyncLocal
                                          ? 'Publish job ini ke feed contoh user.'
                                          : 'Hanya job superadmin dengan bundle contoh lengkap yang bisa dipublish.'
                                    }
                                  >
                                    <Star className="h-3.5 w-3.5" aria-hidden="true" />
                                    {isPublished ? 'Cabut contoh' : canSyncLocal ? 'Upload & Publish' : 'Publish contoh'}
                                  </button>
                                  {!isPublished && !job.can_set_as_example && !canSyncLocal && (
                                    <p className="basis-full text-[11px] leading-4 text-slate-500">{examplePublishHint(job, isPublished)}</p>
                                  )}
                                </div>
                              );
                            })()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
