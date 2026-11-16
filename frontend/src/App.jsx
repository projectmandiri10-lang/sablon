import { Archive, Coins, CreditCard, LogOut, RefreshCw, ShoppingBag, Sparkles, Wand2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import AdminPanel from './components/AdminPanel.jsx';
import AuthPanel from './components/AuthPanel.jsx';
import BillingPanel from './components/BillingPanel.jsx';
import BrandMark from './components/BrandMark.jsx';
import JobLibraryPanel from './components/JobLibraryPanel.jsx';
import JobStatus from './components/JobStatus.jsx';
import LandingPage, { AboutPage, ContactPage, PrivacyPage, TermsPage } from './components/LandingPage.jsx';
import ResultPreview from './components/ResultPreview.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import UploadBox from './components/UploadBox.jsx';
import { commitJob, deleteCloudJob, getAppConfig, getBalance, listExampleJobs, quoteJob, requestImageRetouch, setAdminJobExample, toUserApiError, uploadExampleArtifacts } from './lib/api.js';
import { createNormalizedImagePreviewBlob, prepareAiRedrawInput } from './lib/imagePreview.js';
import { deleteHistoryJob, loadHistoryJobs, releaseHistoryJobs, saveHistoryJob } from './lib/localHistoryStore.js';
import { parseMidtransReturnParams, stripMidtransReturnParams } from './lib/billingPanelState.js';
import { clearPendingAiRecovery, isStaleChunkError, loadPendingAiRecovery, savePendingAiRecovery } from './lib/pendingAiRecovery.js';
import { loadStoredLocale, localeTag, resolveInitialLocale, saveStoredLocale } from './lib/locale.js';
import { analyzeRasterForUpscale, normalizeLocalTraceSettings, processImageLocallyWithFallback } from './lib/localProcessor.js';
import { INPUT_MODE_READY, INPUT_MODE_RETOUCH } from './lib/modes.js';
import { IMAGE_RETOUCH_PRICE_IDR, READY_PROCESS_PRICE_IDR, calculateJobPrice, formatRupiah } from './lib/pricing.js';
import { isAuthConfigured, getSession, onAuthStateChange, setSessionFromCallback, signOut as authSignOut } from './lib/auth.js';

const SUPERUSER_ACCOUNT = ['jho.j80@gm', 'a', 'il.com'].join('');
const LEGAL_PATHS = new Set(['/privacy', '/terms', '/contact', '/about']);
const DASHBOARD_VIEWS = new Set(['app', 'billing', 'admin']);
const APP_SECTIONS = new Set(['process', 'history']);
const ADMIN_TABS = new Set(['overview', 'users', 'payments', 'finance', 'pricing', 'settings', 'jobs']);

function normalizePathname(pathname) {
  const trimmed = pathname.replace(/\/+$/, '') || '/';
  return trimmed === '' ? '/' : trimmed;
}

function getPublicRouteFromPathname(pathname) {
  const normalized = normalizePathname(pathname);
  if (normalized === '/privacy') return 'privacy';
  if (normalized === '/terms') return 'terms';
  if (normalized === '/contact') return 'contact';
  if (normalized === '/about') return 'about';
  return 'landing';
}

function parseDashboardSearch(search = '') {
  const params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
  const view = DASHBOARD_VIEWS.has(params.get('view')) ? params.get('view') : 'app';
  const appSection = APP_SECTIONS.has(params.get('section')) ? params.get('section') : 'process';
  const adminTab = ADMIN_TABS.has(params.get('admin_tab')) ? params.get('admin_tab') : 'overview';
  return { view, appSection, adminTab };
}

function getDocumentTitle(route, hasSession, locale = 'id') {
  const isId = locale === 'id';
  if (route === 'privacy') return isId ? 'Kebijakan Privasi - EasyRedesign Pro' : 'Privacy Policy - EasyRedesign Pro';
  if (route === 'terms') return isId ? 'Syarat dan Ketentuan - EasyRedesign Pro' : 'Terms and Conditions - EasyRedesign Pro';
  if (route === 'contact') return isId ? 'Hubungi Kami - EasyRedesign Pro' : 'Contact Us - EasyRedesign Pro';
  if (route === 'about') return isId ? 'Tentang Kami - EasyRedesign Pro' : 'About Us - EasyRedesign Pro';
  if (hasSession) return isId ? 'EasyRedesign Pro - Dashboard Sablon & Sticker' : 'EasyRedesign Pro - Screen Print and Sticker Dashboard';
  return isId ? 'EasyRedesign Pro - Redesign AI Logo, Pecah Warna & Pola Cutting Sticker' : 'EasyRedesign Pro - AI Logo Redesign, Color Separation & Sticker Cutline';
}

function getDocumentDescription(route, hasSession, locale = 'id') {
  const isId = locale === 'id';
  if (route === 'privacy') {
    return isId
      ? 'Pelajari bagaimana EasyRedesign Pro mengumpulkan, menggunakan, dan melindungi informasi pribadi Anda.'
      : 'Learn how EasyRedesign Pro collects, uses, and protects your personal information.';
  }
  if (route === 'terms') {
    return isId
      ? 'Baca syarat dan ketentuan penggunaan layanan EasyRedesign Pro.'
      : 'Read the terms and conditions for using EasyRedesign Pro.';
  }
  if (route === 'contact') {
    return isId
      ? 'Hubungi tim EasyRedesign Pro untuk bantuan teknis, billing, atau pertanyaan umum.'
      : 'Contact the EasyRedesign Pro team for technical, billing, or general support.';
  }
  if (route === 'about') {
    return isId
      ? 'Mengenal lebih dekat EasyRedesign Pro, platform redesign logo berbasis AI.'
      : 'Get to know EasyRedesign Pro, an AI-powered logo redesign platform.';
  }
  if (hasSession) {
    return isId
      ? 'Dashboard EasyRedesign Pro untuk upload, billing, dan hasil proses logo.'
      : 'EasyRedesign Pro dashboard for uploads, billing, and processed logo results.';
  }
  return isId
    ? 'EasyRedesign Pro membantu mengubah foto logo menjadi hasil redesign AI, pecah warna sablon, dan pola cutting sticker.'
    : 'EasyRedesign Pro turns logo photos into cleaner AI redraws, color separations, and sticker cutline patterns.';
}

function updateDocumentMeta({ route, hasSession, locale }) {
  const title = getDocumentTitle(route, hasSession, locale);
  const description = getDocumentDescription(route, hasSession, locale);
  document.title = title;
  document.documentElement.lang = locale === 'id' ? 'id' : 'en';
  const localeMeta = document.querySelector('meta[property="og:locale"]');
  if (localeMeta) localeMeta.setAttribute('content', locale === 'id' ? 'id_ID' : 'en_US');
  for (const selector of ['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]']) {
    const node = document.querySelector(selector);
    if (node) node.setAttribute('content', description);
  }
  for (const selector of ['meta[property="og:title"]', 'meta[name="twitter:title"]']) {
    const node = document.querySelector(selector);
    if (node) node.setAttribute('content', title);
  }
}

const initialSettings = {
  projectName: '',
  productionType: 'sablon',
  inputMode: INPUT_MODE_RETOUCH,
  makeVector: true,
  separateColors: true,
  whiteAsBackground: false,
  removeBackground: true,
  aiQuality: 'standard',
  actualWidthCm: 10,
  includeBackgroundInFilmSize: false,
  stickerCutlineEnabled: true,
  stickerCutlineOffsetMm: 2,
  createUnderbaseFilm: true,
  edgeRefinement: true,
  curveCleanup: true,
  paperSize: 'A4',
  paperOrientation: 'portrait'
};

function getAppCopy(locale = 'id') {
  const isId = locale === 'id';
  return {
    labels: {
      roleSuperadmin: isId ? 'Superadmin' : 'Admin',
      roleUser: isId ? 'User' : 'User',
      viewApp: 'App',
      viewBilling: isId ? 'Billing' : 'Billing',
      viewAdmin: 'Admin',
      topUp: isId ? 'Isi saldo' : 'Top up balance',
      logout: isId ? 'Logout' : 'Sign out',
      refreshBalance: isId ? 'Refresh saldo' : 'Refresh balance',
      processSection: isId ? 'Proses Baru' : 'New Process',
      historySection: isId ? 'Riwayat Job' : 'Job History',
      examplesSection: isId ? 'Contoh hasil' : 'Example results',
      processingButtonIdle: isId ? 'Proses dan debit credit' : 'Process and deduct credit',
      processingButtonBusy: isId ? 'Sedang memproses' : 'Processing',
      activeHistoryTitle: isId ? 'Riwayat aktif' : 'Active history',
      activeHistoryBody: isId
        ? 'Riwayat perangkat Anda tetap ada di sini, digabung dengan contoh hasil yang dipublish superadmin.'
        : 'Your device history stays here, merged with published superadmin examples.',
      backToProcess: isId ? 'Kembali ke Proses Baru' : 'Back to New Process',
      sourcePreview: isId ? 'Preview gambar awal' : 'Original image preview'
    },
    messages: {
      historySaved: isId
        ? 'Job selesai diproses dan dipindahkan ke riwayat agar halaman proses tetap bersih.'
        : 'The job finished successfully and moved to history to keep the process page clean.',
      historyReadError: isId ? 'Riwayat lokal tidak bisa dibaca di browser ini.' : 'Local history cannot be read in this browser.',
      exampleLoadError: isId ? 'Contoh pekerjaan belum bisa dimuat saat ini.' : 'Example jobs cannot be loaded right now.',
      loginRequired: isId ? 'Login dulu untuk memakai credit.' : 'Please sign in before using credits.',
      uploadRequired: isId ? 'Upload gambar wajib diisi.' : 'Please upload an image first.',
      insufficientBalance: (price, balance) =>
        isId
          ? `Saldo kurang. Perkiraan biaya ${price}, saldo ${balance}.`
          : `Not enough balance. Estimated cost ${price}, current balance ${balance}.`,
      preparingLocal: isId ? 'Menyiapkan file lokal.' : 'Preparing your local file.',
      processingRetouch: isId ? 'AI sedang menghasilkan PNG mentah.' : 'AI is generating the raw PNG.',
      processingReadyTrace: isId ? 'Menjalankan pecah warna dan pola cutting sticker langsung di browser.' : 'Running color separation and sticker cutline directly in the browser.',
      usingBackendVector: isId ? 'Memakai artefak vector historis dari backend.' : 'Using legacy backend vector artifacts.',
      usingBrowserVector: isId ? 'Membuat vector, cutline, film, PDF, dan ZIP di browser.' : 'Creating vectors, cutlines, films, PDFs, and ZIP files in the browser.',
      commitJob: isId ? 'Mencatat metadata job dan mendebit credit.' : 'Saving job metadata and deducting credits.',
      processFailed: isId ? 'Gagal memproses gambar.' : 'Failed to process the image.',
      processFailedShort: isId ? 'Gagal memproses gambar.' : 'Image processing failed.',
      deleteExampleConfirm: isId
        ? 'Hapus job contoh ini? Publikasi contoh akan dicabut dan artefak bucket akan dibersihkan.'
        : 'Delete this example job? The public example will be unpublished and its bucket artifacts removed.',
      deleteHistoryConfirm: isId
        ? 'Hapus job ini dari riwayat perangkat dan metadata server? Jika ingin menjadikannya contoh, publish dulu sebelum menghapus.'
        : 'Delete this job from device history and server metadata? Publish it first if you want to keep it as an example.',
      localWarning: isId
        ? 'Riwayat lokal dihapus, tetapi metadata server belum berhasil dibersihkan.'
        : 'Local history was removed, but server metadata could not be fully cleaned up.',
      deleteExampleError: isId ? 'Gagal menghapus job contoh.' : 'Failed to delete the example job.',
      deleteHistoryError: isId ? 'Gagal menghapus riwayat job.' : 'Failed to delete the job history.',
      oauthCallbackError: isId ? 'Login Google gagal diproses.' : 'Google sign-in could not be completed.',
      sessionReadError: isId ? 'Session login tidak bisa dibaca.' : 'The login session could not be read.',
      serviceConnectionError: isId
        ? 'Koneksi ke layanan belum tersambung. Periksa URL API aplikasi.'
        : 'The service connection is not ready yet. Please check the app API URL.'
    }
  };
}

function statusJob(status, message, progress = 0) {
  return {
    jobId: 'local-progress',
    status,
    progress,
    message
  };
}

function appendFileIfPresent(formData, key, blob, filename) {
  if (blob instanceof Blob) {
    formData.append(key, blob, filename);
  }
}

async function blobFromObjectUrl(url, fallbackMessage) {
  if (!url) throw new Error(fallbackMessage);
  const response = await fetch(url);
  if (!response.ok) throw new Error(fallbackMessage);
  return response.blob();
}

function buildExampleArtifactsFormData({ sourcePreviewBlob, sourceFileName, job }) {
  const artifacts = job.artifactBlobs || {};
  const formData = new FormData();

  const effectiveSourcePreview = sourcePreviewBlob instanceof Blob ? sourcePreviewBlob : artifacts.fullPng;
  appendFileIfPresent(formData, 'sourcePreview', effectiveSourcePreview, 'source-preview.png');
  appendFileIfPresent(formData, 'fullPng', artifacts.fullPng, 'preview-full-color.png');
  appendFileIfPresent(formData, 'fullSvg', artifacts.fullSvg, 'full-vector.svg');
  appendFileIfPresent(formData, 'fullPdf', artifacts.fullPdf, 'full-vector.pdf');
  appendFileIfPresent(formData, 'stickerCutlineSvg', artifacts.stickerCutlineSvg, 'sticker-cutline.svg');
  appendFileIfPresent(formData, 'stickerCutlinePdf', artifacts.stickerCutlinePdf, 'sticker-cutline.pdf');
  appendFileIfPresent(formData, 'zip', artifacts.zip, 'result.zip');
  appendFileIfPresent(formData, 'separationZip', artifacts.separationZip, 'separation-films.zip');

  (artifacts.separations || []).forEach((separation) => {
    const slug = separation.kind === 'underbase' ? 'underbase' : `color-${String(separation.index).padStart(2, '0')}`;
    appendFileIfPresent(formData, 'separationSvg', separation.svgBlob, `film-${slug}.svg`);
    appendFileIfPresent(formData, 'separationPdf', separation.pdfBlob, `film-${slug}.pdf`);
    appendFileIfPresent(formData, 'separationPreview', separation.previewBlob || artifacts.fullPng, `film-${slug}-preview.png`);
  });

  formData.append(
    'manifest',
    JSON.stringify({
      projectName: job.settings?.projectName || 'Project Vector',
      productionType: job.settings?.productionType || 'sticker',
      inputMode: job.settings?.inputMode || 'ready_trace',
      settings: job.settings || {},
      aiRedraw: job.manifest?.aiRedraw || null,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      sourceFileName: sourceFileName || '',
      separations: (artifacts.separations || []).map((separation) => ({
        index: separation.index,
        kind: separation.kind || 'color',
        hex: separation.hex || '#000000',
        label: separation.label || '',
        spotName: separation.spotName || '',
        chokePx: separation.chokePx || 0
      }))
    })
  );

  return formData;
}

async function optionalBlobFromUrl(url) {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.blob();
  } catch {
    return null;
  }
}

async function buildZipFromBlobs(entries = []) {
  const { default: JSZip } = await import('jszip');
  const archive = new JSZip();
  for (const [name, blob] of entries) {
    if (blob instanceof Blob) {
      archive.file(name, blob);
    }
  }
  return archive.generateAsync({ type: 'blob' });
}

async function hydrateHistoryItemForExampleUpload(item) {
  const files = item?.job?.files || {};
  const isSablon = (item?.productionType || item?.job?.settings?.productionType || 'sticker') === 'sablon';
  const [rawSourcePreview, rawSourceRaster, rawFullPng, rawFullSvg, rawFullPdf, rawCutlineSvg, rawCutlinePdf, rawZip, rawSepZip] =
    await Promise.all([
      optionalBlobFromUrl(item.sourcePreviewUrl),
      optionalBlobFromUrl(item.sourceRasterUrl),
      optionalBlobFromUrl(files.fullPng || files.tracedPng),
      optionalBlobFromUrl(files.fullSvg),
      optionalBlobFromUrl(files.fullPdf),
      optionalBlobFromUrl(files.stickerCutlineSvg),
      optionalBlobFromUrl(files.stickerCutlinePdf),
      optionalBlobFromUrl(files.zip),
      optionalBlobFromUrl(files.separationZip)
    ]);

  let sourcePreviewBlob = rawSourcePreview;
  let sourceRasterBlob = rawSourceRaster;
  let fullPng = rawFullPng;
  let fullSvg = rawFullSvg;
  let fullPdf = rawFullPdf;
  let stickerCutlineSvg = rawCutlineSvg;
  let stickerCutlinePdf = rawCutlinePdf;
  let zip = rawZip;
  let separationZip = rawSepZip;
  let separations = await Promise.all(
    (files.separations || []).map(async (separation) => ({
      ...separation,
      svgBlob: await optionalBlobFromUrl(separation.svg),
      pdfBlob: await optionalBlobFromUrl(separation.pdf),
      previewBlob: (await optionalBlobFromUrl(separation.preview)) || fullPng
    }))
  );

  const missingEssentialRender =
    !fullPng ||
    !fullSvg ||
    !fullPdf ||
    separations.some((separation) => !(separation.svgBlob instanceof Blob) || !(separation.pdfBlob instanceof Blob)) ||
    (isSablon && separations.length === 0);

  if (missingEssentialRender) {
    const rawAiBlob = await optionalBlobFromUrl(files.aiRawPng);
    const rebuildBlob = rawAiBlob || sourceRasterBlob || sourcePreviewBlob;
    if (rebuildBlob instanceof Blob) {
      const rebuildSettings = normalizeLocalTraceSettings({
        ...(item?.job?.settings || {}),
        productionType: item?.productionType || item?.job?.settings?.productionType || 'sticker',
        inputMode: rawAiBlob ? INPUT_MODE_RETOUCH : item?.inputMode || item?.job?.settings?.inputMode || INPUT_MODE_READY
      });
      const rebuildFile = new File([rebuildBlob], item?.sourceFileName || 'gambar-awal.png', {
        type: rebuildBlob.type || 'image/png'
      });
      const rebuilt = await processImageLocallyWithFallback(rebuildFile, rebuildSettings);
      const blobs = rebuilt.artifactBlobs || {};
      fullPng = blobs.fullPng || fullPng;
      fullSvg = blobs.fullSvg || fullSvg;
      fullPdf = blobs.fullPdf || fullPdf;
      stickerCutlineSvg = blobs.stickerCutlineSvg || stickerCutlineSvg;
      stickerCutlinePdf = blobs.stickerCutlinePdf || stickerCutlinePdf;
      zip = blobs.zip || zip;
      separationZip = blobs.separationZip || separationZip;
      separations = (blobs.separations || []).map((separation) => ({
        ...separation,
        previewBlob: separation.previewBlob || fullPng
      }));
    }
  }

  if (isSablon && separations.length > 0 && !(separationZip instanceof Blob)) {
    const sepEntries = [];
    for (const separation of separations) {
      const slug = separation.kind === 'underbase' ? 'underbase' : `color-${String(separation.index).padStart(2, '0')}`;
      if (separation.svgBlob) sepEntries.push([`film-${slug}.svg`, separation.svgBlob]);
      if (separation.pdfBlob) sepEntries.push([`film-${slug}.pdf`, separation.pdfBlob]);
      if (separation.previewBlob) sepEntries.push([`film-${slug}-preview.png`, separation.previewBlob]);
    }
    separationZip = await buildZipFromBlobs(sepEntries);
  }

  if (!(zip instanceof Blob) && fullPng && fullSvg && fullPdf) {
    const zipEntries = [
      ['preview-full-color.png', fullPng],
      ['full-vector.svg', fullSvg],
      ['full-vector.pdf', fullPdf]
    ];
    if (stickerCutlineSvg) zipEntries.push(['sticker-cutline.svg', stickerCutlineSvg]);
    if (stickerCutlinePdf) zipEntries.push(['sticker-cutline.pdf', stickerCutlinePdf]);
    for (const separation of separations) {
      const slug = separation.kind === 'underbase' ? 'underbase' : `color-${String(separation.index).padStart(2, '0')}`;
      if (separation.svgBlob) zipEntries.push([`separations/film-${slug}.svg`, separation.svgBlob]);
      if (separation.pdfBlob) zipEntries.push([`separations/film-${slug}.pdf`, separation.pdfBlob]);
      if (separation.previewBlob) zipEntries.push([`separations/film-${slug}-preview.png`, separation.previewBlob]);
    }
    zip = await buildZipFromBlobs(zipEntries);
  }

  if (!(fullPng instanceof Blob) || !(fullSvg instanceof Blob) || !(fullPdf instanceof Blob) || !(zip instanceof Blob)) {
    throw new Error('File hasil lengkap (PNG, SVG, PDF, ZIP) di riwayat browser belum lengkap. Klik "Trace Ulang" atau proses ulang gambar terlebih dahulu.');
  }
  if (isSablon && (separations.length === 0 || !(separationZip instanceof Blob))) {
    throw new Error('Film separasi sablon & ZIP film wajib tersedia untuk contoh sablon.');
  }

  return {
    sourcePreviewBlob: sourcePreviewBlob || fullPng,
    sourceRasterBlob,
    artifactBlobs: {
      fullPng,
      fullSvg,
      fullPdf,
      stickerCutlineSvg,
      stickerCutlinePdf,
      zip,
      separationZip,
      separations
    }
  };
}

function getAuthCallbackParams() {
  return {
    hashParams: new URLSearchParams(window.location.hash.replace(/^#/, '')),
    queryParams: new URLSearchParams(window.location.search.replace(/^\?/, ''))
  };
}

function cleanAuthCallbackUrl() {
  if (!window.location.hash && !window.location.search) return;
  window.history.replaceState({}, document.title, window.location.pathname || '/');
}

export default function App() {
  const initialDashboardState = parseDashboardSearch(window.location.search || '');
  const browserLanguage = typeof navigator !== 'undefined' ? navigator.language : '';
  const [file, setFile] = useState(null);
  const [settings, setSettings] = useState(initialSettings);
  const [job, setJob] = useState(null);
  const [appSection, setAppSection] = useState(initialDashboardState.appSection);
  const [historySelectedKey, setHistorySelectedKey] = useState('');
  const [historyNotice, setHistoryNotice] = useState('');
  const [processNotice, setProcessNotice] = useState('');
  const [jobError, setJobError] = useState('');
  const [suggestedInputMode, setSuggestedInputMode] = useState('');
  const [authCallbackError, setAuthCallbackError] = useState('');
  const [balanceError, setBalanceError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [session, setSession] = useState(null);
  const [balance, setBalance] = useState(null);
  const [view, setView] = useState(initialDashboardState.view);
  const [adminTab, setAdminTab] = useState(initialDashboardState.adminTab);
  const previewRef = useRef('');
  const historyJobsRef = useRef([]);
  const [historyJobs, setHistoryJobs] = useState([]);
  const [historyError, setHistoryError] = useState('');
  const [exampleJobs, setExampleJobs] = useState([]);
  const [exampleError, setExampleError] = useState('');
  const [deletingLibraryJobId, setDeletingLibraryJobId] = useState('');
  const [retracingLibraryJobId, setRetracingLibraryJobId] = useState('');
  const [publishingLibraryJobId, setPublishingLibraryJobId] = useState('');
  const [libraryFilterTab, setLibraryFilterTab] = useState('all');
  const [previewUrl, setPreviewUrl] = useState('');
  const [hasPendingRecovery, setHasPendingRecovery] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!session?.user?.id) {
      setHasPendingRecovery(false);
      return undefined;
    }
    loadPendingAiRecovery(session.user.id).then((record) => {
      if (!cancelled) setHasPendingRecovery(Boolean(record?.aiRawPngBlob));
    });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);
  const [publicRoute, setPublicRoute] = useState(() => getPublicRouteFromPathname(window.location.pathname || '/'));
  const [midtransReturnState, setMidtransReturnState] = useState(() => parseMidtransReturnParams(window.location.search || ''));
  const [appConfig, setAppConfig] = useState({ settings: {}, features: {}, viewer: {} });
  const [localeOverride, setLocaleOverride] = useState(() => loadStoredLocale());
  const locale = resolveInitialLocale({
    storedLocale: localeOverride,
    viewerDefaultLocale: appConfig?.viewer?.defaultLocale || '',
    browserLanguage
  });
  const copy = getAppCopy(locale);
  const isId = locale === 'id';

  useEffect(() => {
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current);
      previewRef.current = '';
    }

    if (!file) {
      setPreviewUrl('');
      return undefined;
    }

    const url = URL.createObjectURL(file);
    previewRef.current = url;
    setPreviewUrl(url);

    return () => {
      URL.revokeObjectURL(url);
      if (previewRef.current === url) previewRef.current = '';
    };
  }, [file]);

  useEffect(() => {
    const handlePopState = () => {
      setPublicRoute(getPublicRouteFromPathname(window.location.pathname || '/'));
      restoreDashboardStateFromUrl();
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    let cancelled = false;

    getAppConfig()
      .then((data) => {
        if (!cancelled) setAppConfig(data || { settings: {}, features: {}, viewer: {} });
      })
      .catch(() => {
        if (!cancelled) setAppConfig({ settings: {}, features: {}, viewer: {} });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    updateDocumentMeta({ route: publicRoute, hasSession: Boolean(session), locale });
  }, [locale, publicRoute, session]);

  useEffect(() => {
    if (midtransReturnState.isReturn && session?.access_token) {
      setView('billing');
    }
  }, [midtransReturnState.isReturn, session?.access_token]);

  function restoreDashboardStateFromUrl() {
    const nextDashboardState = parseDashboardSearch(window.location.search || '');
    setView(nextDashboardState.view);
    setAppSection(nextDashboardState.appSection);
    setAdminTab(nextDashboardState.adminTab);
  }

  useEffect(() => {
    if (!session || LEGAL_PATHS.has(normalizePathname(window.location.pathname || '/'))) return;
    const params = new URLSearchParams(window.location.search.replace(/^\?/, ''));
    params.set('view', view);
    if (view === 'app') params.set('section', appSection);
    else params.delete('section');
    if (view === 'admin') params.set('admin_tab', adminTab);
    else params.delete('admin_tab');

    const nextSearch = params.toString();
    const currentSearch = (window.location.search || '').replace(/^\?/, '');
    if (nextSearch !== currentSearch) {
      window.history.replaceState({}, document.title, `${window.location.pathname || '/'}${nextSearch ? `?${nextSearch}` : ''}`);
    }
  }, [session, view, appSection, adminTab]);

  function navigatePublicPath(path, { replace = false } = {}) {
    const normalized = normalizePathname(path);
    if (replace) {
      window.history.replaceState({}, '', normalized);
    } else {
      window.history.pushState({}, '', normalized);
    }
    setPublicRoute(getPublicRouteFromPathname(normalized));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleLocaleChange(nextLocale) {
    const normalized = saveStoredLocale(nextLocale);
    setLocaleOverride(normalized);
  }

  useEffect(() => {
    if (!isAuthConfigured) return undefined;
    let isMounted = true;

    async function bootstrapAuth() {
      try {
        const { hashParams, queryParams } = getAuthCallbackParams();
        const callbackError =
          hashParams.get('auth_error') ||
          hashParams.get('error_description') ||
          queryParams.get('error_description') ||
          hashParams.get('error') ||
          queryParams.get('error');

        if (callbackError) {
          cleanAuthCallbackUrl();
          if (isMounted) setAuthCallbackError(callbackError);
          return;
        }

        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        if (accessToken && refreshToken) {
          const callbackSession = setSessionFromCallback(hashParams);
          cleanAuthCallbackUrl();
          if (!isMounted) return;
          if (callbackSession) {
            setAuthCallbackError('');
            setSession(callbackSession);
            restoreDashboardStateFromUrl();
          } else {
            setAuthCallbackError(copy.messages.oauthCallbackError);
          }
          return;
        }

        const { data } = await getSession();
        if (!isMounted) return;
        setAuthCallbackError('');
        setSession(data.session || null);
        if (data.session) restoreDashboardStateFromUrl();
      } catch (error) {
        cleanAuthCallbackUrl();
        if (isMounted) {
          setAuthCallbackError(error instanceof Error ? error.message : copy.messages.oauthCallbackError);
        }
      }
    }

    bootstrapAuth();
    const { data: listener } = onAuthStateChange((event, nextSession) => {
      if (!isMounted) return;
      if (nextSession) {
        setSession(nextSession);
        setAuthCallbackError('');
        restoreDashboardStateFromUrl();
      } else if (event === 'SIGNED_OUT') {
        setSession(null);
      }
    });
    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function refreshBalance(activeSession = session) {
    if (!activeSession?.access_token) return;
    try {
      setBalanceError('');
      setBalance(await getBalance(activeSession.access_token));
    } catch (error) {
      setBalanceError(toUserApiError(error, 'Koneksi ke layanan belum tersambung. Periksa URL API aplikasi.').message);
    }
  }

  function replaceHistoryJobs(nextJobs) {
    releaseHistoryJobs(historyJobsRef.current);
    historyJobsRef.current = nextJobs;
    setHistoryJobs(nextJobs);
  }

  async function refreshHistory(activeSession = session) {
    const ownerId = activeSession?.user?.id;
    if (!ownerId) {
      replaceHistoryJobs([]);
      setHistoryError('');
      return;
    }

    try {
      setHistoryError('');
      replaceHistoryJobs(await loadHistoryJobs(ownerId));
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : copy.messages.historyReadError);
      replaceHistoryJobs([]);
    }
  }

  async function refreshExampleJobs(activeSession = session) {
    try {
      setExampleError('');
      const data = await listExampleJobs(activeSession?.access_token || '');
      setExampleJobs(Array.isArray(data.exampleJobs) ? data.exampleJobs : []);
    } catch (error) {
      setExampleError(toUserApiError(error, 'Contoh pekerjaan belum bisa dimuat saat ini.').message);
      setExampleJobs([]);
    }
  }

  useEffect(() => {
    refreshBalance(session);
  }, [session?.access_token]);

  useEffect(() => {
    refreshHistory(session);
  }, [session?.user?.id]);

  useEffect(() => {
    refreshExampleJobs(session);
  }, [session?.access_token, session?.user?.id, view]);

  useEffect(() => {
    return () => {
      releaseHistoryJobs(historyJobsRef.current);
      historyJobsRef.current = [];
    };
  }, []);

  async function signOut() {
    await authSignOut();
    window.history.replaceState({}, document.title, window.location.pathname || '/');
    setSession(null);
    setBalance(null);
    setJob(null);
    setAppSection('process');
    setAdminTab('overview');
    setHistorySelectedKey('');
    setHistoryNotice('');
    setProcessNotice('');
    setView('app');
    replaceHistoryJobs([]);
    setHistoryError('');
    setExampleError('');
    setDeletingLibraryJobId('');
    setRetracingLibraryJobId('');
  }

  function openExampleResults() {
    setAppSection('history');
    setLibraryFilterTab('examples');
    setProcessNotice('');
    setHistoryNotice('');
    const firstExampleJobId = exampleJobs.find((item) => item?.jobId)?.jobId || '';
    if (firstExampleJobId) setHistorySelectedKey(firstExampleJobId);
  }

  function handleAutomaticPaymentSuccess() {
    setProcessNotice(
      isId
        ? 'Pembayaran QRIS berhasil. Saldo sudah masuk dan Anda bisa generate gambar sekarang.'
        : 'QRIS payment successful. Your balance is ready and you can generate an image now.'
    );
    setHistoryNotice('');
    setJobError('');
    setSuggestedInputMode('');
    setView('app');
    setAppSection('process');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleMidtransReturnHandled() {
    const nextSearch = stripMidtransReturnParams(window.location.search || '');
    window.history.replaceState({}, document.title, `${window.location.pathname || '/'}${nextSearch}`);
    setMidtransReturnState(parseMidtransReturnParams(nextSearch));
  }

  async function ensureCanRun(estimatedFilmCount = 0) {
    if (!session?.access_token) throw new Error(copy.messages.loginRequired);
    const quote = await quoteJob(
      {
        inputMode: settings.inputMode,
        productionType: settings.productionType,
        separationFilmCount: estimatedFilmCount,
        retouchAlreadyCharged: false
      },
      session.access_token
    );
    if (!quote.isUnlimited && quote.balance < quote.priceIdr) {
      throw new Error(copy.messages.insufficientBalance(formatRupiah(quote.priceIdr), formatRupiah(quote.balance)));
    }
    return quote;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!file) {
      setJobError(copy.messages.uploadRequired);
      return;
    }

    setJobError('');
    setSuggestedInputMode('');
    setProcessNotice('');
    setHistoryNotice('');
    setIsSubmitting(true);
    setJob(statusJob('preprocessing', copy.messages.preparingLocal, 10));

    try {
      let sourcePreviewBlob = null;
      try {
        sourcePreviewBlob = await createNormalizedImagePreviewBlob(file);
      } catch (_previewError) {
        sourcePreviewBlob = file;
      }
      let preparedAiInput = null;
      // Pastikan modul render lokal bisa dimuat SEBELUM memanggil (dan membayar) AI.
      try {
        await Promise.all([import('jszip'), import('jspdf'), import('pica')]);
      } catch (_chunkError) {
        throw new Error(
          isId
            ? 'Versi aplikasi sudah diperbarui. Muat ulang halaman (Ctrl+F5) lalu coba lagi. Belum ada biaya AI yang terpakai.'
            : 'The app was updated. Hard-reload the page (Ctrl+F5) and try again. No AI charge was made.'
        );
      }
      if (settings.inputMode === INPUT_MODE_RETOUCH) {
        preparedAiInput = await prepareAiRedrawInput(file);
      }
      await ensureCanRun(settings.separateColors ? 1 : 0);
      let processingFile = file;
      let retouchLedgerId = '';
      let aiRedrawMetadata = null;
      let readyTraceMetadata = null;
      let aiRawPngBlob = null;
      let traceInputSettings = settings;
      let existingJobId = `local-${Date.now()}`;

      if (settings.inputMode === INPUT_MODE_RETOUCH) {
        setJob(statusJob('processing_image', copy.messages.processingRetouch, 25));
        const retouchResult = await requestImageRetouch(
          preparedAiInput.file,
          { ...settings, aiInput: preparedAiInput.metadata },
          session.access_token
        );
        processingFile = retouchResult.file;
        retouchLedgerId = retouchResult.retouchLedgerId;
        aiRedrawMetadata = retouchResult.aiRedrawMetadata || null;
        aiRawPngBlob = retouchResult.aiRawPngBlob || null;
        if (retouchLedgerId) {
          existingJobId = `pending-${retouchLedgerId}`;
        }
        if (aiRawPngBlob) {
          // Simpan segera ke recovery + riwayat: jika render lokal gagal/terputus, bisa di-retry tanpa memanggil AI lagi.
          const aiRawUrl = URL.createObjectURL(aiRawPngBlob);
          try {
            await savePendingAiRecovery({
              ownerId: session.user.id,
              jobId: existingJobId,
              aiRawPngBlob,
              sourcePreviewBlob,
              sourceRasterBlob: file,
              sourceFileName: file.name,
              retouchLedgerId,
              aiRedrawMetadata,
              settings
            });
            setHasPendingRecovery(true);
          } catch (_saveError) {
            // abaikan
          }
          try {
            await saveHistoryJob({
              ownerId: session.user.id,
              ownerEmail: session.user.email || '',
              sourcePreviewBlob,
              sourceRasterBlob: file,
              sourceFileName: file.name,
              job: {
                jobId: existingJobId,
                status: 'pending_trace',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                retouchLedgerId,
                settings,
                manifest: { aiRedraw: aiRedrawMetadata },
                files: { aiRawPng: aiRawUrl },
                artifactBlobs: { aiRawPng: aiRawPngBlob }
              }
            });
            await refreshHistory();
          } catch (_historyDraftError) {
            // abaikan
          } finally {
            URL.revokeObjectURL(aiRawUrl);
          }
        }
      } else {
        setJob(statusJob('processing_image', copy.messages.processingReadyTrace, 30));
        let upscaleAnalysis;
        try {
          upscaleAnalysis = await analyzeRasterForUpscale(file);
        } catch (_analysisError) {
          upscaleAnalysis = {
            shouldUpscale: false,
            requestedFactor: 1,
            reason: 'analysis_failed'
          };
        }
        readyTraceMetadata = {
          processor: 'browser_local_trace',
          vectorEngine: 'canvas_boundary_trace',
          noRemoteGeneration: true,
          upscaleApplied: Boolean(upscaleAnalysis.shouldUpscale),
          upscaleReason: upscaleAnalysis.reason,
          upscaleAnalysis
        };
        traceInputSettings = {
          ...settings,
          traceUpscaleEnabled: Boolean(upscaleAnalysis.shouldUpscale),
          traceUpscaleAnalysis: upscaleAnalysis
        };
      }

      await finalizeLocalJob({
        existingJobId,
        sourceFile: file,
        sourcePreviewBlob,
        processingFile,
        retouchLedgerId,
        aiRedrawMetadata,
        readyTraceMetadata,
        aiRawPngBlob,
        traceInputSettings,
        jobSettings: settings
      });
    } catch (submitError) {
      const userError = toUserApiError(submitError, copy.messages.processFailed);
      setJobError(userError.message);
      setSuggestedInputMode(submitError?.suggestedInputMode || '');
      setJob(statusJob('failed', copy.messages.processFailedShort, 100));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function finalizeLocalJob({
    existingJobId = '',
    alreadyCommittedJobId = '',
    sourceFile,
    sourcePreviewBlob,
    processingFile,
    retouchLedgerId,
    aiRedrawMetadata,
    readyTraceMetadata,
    aiRawPngBlob,
    traceInputSettings,
    jobSettings
  }) {
    const file = sourceFile;
    const settings = jobSettings;
    const draftJobId = existingJobId || (retouchLedgerId ? `pending-${retouchLedgerId}` : `local-${Date.now()}`);
    let committedJobId = alreadyCommittedJobId || '';
    try {
      setJob(
        statusJob(
          'vectorizing',
          copy.messages.usingBrowserVector,
          60
        )
      );
      const traceSettings = normalizeLocalTraceSettings(traceInputSettings);
      const tracedResult = await processImageLocallyWithFallback(processingFile, traceSettings);
      const localResult = aiRawPngBlob
        ? {
            ...tracedResult,
            files: {
              ...(tracedResult.files || {}),
              aiRawPng: URL.createObjectURL(aiRawPngBlob)
            },
            artifactBlobs: {
              ...(tracedResult.artifactBlobs || {}),
              aiRawPng: aiRawPngBlob
            }
          }
        : tracedResult;
      const manifest = {
        ...(localResult.manifest || {}),
        aiRedraw: aiRedrawMetadata,
        ...(aiRawPngBlob
          ? {
              source: 'ai_raw_png',
              processor: 'browser_local_trace',
              traceEngine: 'processImageLocally'
            }
          : {}),
        readyTrace: readyTraceMetadata
          ? {
              ...readyTraceMetadata,
              upscaleApplied: localResult.manifest?.traceUpscaleApplied ?? readyTraceMetadata.upscaleApplied,
              effectiveFactor: localResult.manifest?.traceUpscaleFactor || readyTraceMetadata.upscaleAnalysis?.requestedFactor || 1,
              fallback: Boolean(localResult.manifest?.traceUpscaleFallback)
            }
          : localResult.manifest?.readyTrace || null
      };
      const finalPrice = calculateJobPrice({
        inputMode: settings.inputMode,
        separationFilmCount: localResult.separationFilmCount,
        retouchAlreadyCharged: settings.inputMode === INPUT_MODE_RETOUCH
      });

      setJob(statusJob('exporting', copy.messages.commitJob, 88));
      let committed = committedJobId ? { job: { id: committedJobId } } : null;
      if (!committed) {
        committed = await commitJob(
          {
            inputMode: settings.inputMode,
            productionType: settings.productionType,
            projectName: settings.projectName || 'Project Vector',
            separationFilmCount: localResult.separationFilmCount,
            settings: tracedResult.settings || traceSettings,
            manifest,
            aiLedgerId: retouchLedgerId,
            priceIdr: finalPrice
          },
          session.access_token
        );
        committedJobId = committed.job?.id || '';
      }

      const finalJobId = committed.job?.id || localResult.jobId;
      const completedJob = {
        ...localResult,
        manifest,
        jobId: finalJobId,
        retouchLedgerId,
        committedJobId,
        priceIdr: (settings.inputMode === INPUT_MODE_RETOUCH ? IMAGE_RETOUCH_PRICE_IDR : 0) + finalPrice,
        remoteJob: committed.job
      };

      setJob(completedJob);

      try {
        await saveHistoryJob({
          ownerId: session.user.id,
          ownerEmail: session.user.email || '',
          sourcePreviewBlob,
          sourceRasterBlob: file,
          sourceFileName: file.name,
          job: completedJob
        });
        if (draftJobId && draftJobId !== finalJobId) {
          await deleteHistoryJob(draftJobId).catch(() => {});
        }
        await clearPendingAiRecovery(session.user.id);
        setHasPendingRecovery(false);
        await refreshHistory();
        setHistorySelectedKey(completedJob.jobId);
        setAppSection('history');
        setHistoryNotice(copy.messages.historySaved);
        setFile(null);
        setJob(null);
        setJobError('');
        setSuggestedInputMode('');
      } catch (historySaveError) {
        setHistoryError(historySaveError instanceof Error ? historySaveError.message : copy.messages.historyReadError);
      }

      if (isSuperuser && committed.job?.id) {
        setHistoryNotice(
          isId
            ? 'Hasil disimpan ke riwayat. Sedang mengunggah & mempublikasikan contoh ke semua user…'
            : 'Saved to history. Uploading & publishing public example to all users…'
        );
        try {
          await uploadAndPublishSuperadminExample({
            targetJobId: committed.job.id,
            sourcePreviewBlob,
            sourceFileName: file.name,
            job: completedJob
          });
          setHistoryNotice(
            isId
              ? 'Hasil selesai dan otomatis dipublikasikan sebagai contoh untuk semua user.'
              : 'Job completed and automatically published as a public example for all users.'
          );
          setHistoryError('');
        } catch (artifactError) {
          console.error('Failed to upload and publish example artifacts', artifactError);
          setHistoryError(
            toUserApiError(
              artifactError,
              isId
                ? 'Hasil selesai disimpan, tetapi gagal mempublikasikan contoh ke semua user. Klik "Jadikan Contoh User" pada riwayat untuk mencoba lagi.'
                : 'Result saved, but failed to publish as a public example. Click "Publish as User Example" in history to retry.'
            ).message
          );
        }
      }

      await refreshBalance();
    } catch (submitError) {
      const staleChunk = isStaleChunkError(submitError);
      const userError = toUserApiError(submitError, copy.messages.processFailed);
      const errorText = staleChunk
        ? isId
          ? 'Modul render lokal gagal dimuat karena aplikasi baru saja diperbarui. Muat ulang halaman (Ctrl+F5), lalu klik "Coba lagi proses lokal" — hasil AI sudah tersimpan, tanpa panggilan AI baru.'
          : 'The local render module failed to load because the app was just updated. Hard-reload (Ctrl+F5), then click "Retry local processing" — the AI result is saved, no new AI call.'
        : userError.message;

      // Simpan job gagal ke Riwayat + recovery lokal agar tetap muncul dan bisa di-retry kapan saja tanpa AI.
      const failedAiRawUrl = aiRawPngBlob ? URL.createObjectURL(aiRawPngBlob) : '';
      try {
        if (aiRawPngBlob) {
          await savePendingAiRecovery({
            ownerId: session.user.id,
            jobId: draftJobId,
            committedJobId,
            aiRawPngBlob,
            sourcePreviewBlob,
            sourceRasterBlob: file,
            sourceFileName: file?.name || 'gambar-awal.png',
            retouchLedgerId,
            aiRedrawMetadata,
            settings: traceInputSettings || settings
          });
          setHasPendingRecovery(true);
        }
        await saveHistoryJob({
          ownerId: session.user.id,
          ownerEmail: session.user.email || '',
          sourcePreviewBlob,
          sourceRasterBlob: file,
          sourceFileName: file?.name || 'gambar-awal.png',
          job: {
            jobId: draftJobId,
            status: 'failed',
            errorMessage: errorText,
            retouchLedgerId,
            committedJobId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            settings: traceInputSettings || settings,
            manifest: { aiRedraw: aiRedrawMetadata, readyTrace: readyTraceMetadata },
            files: aiRawPngBlob ? { aiRawPng: failedAiRawUrl } : {},
            artifactBlobs: aiRawPngBlob ? { aiRawPng: aiRawPngBlob } : {}
          }
        });
        await refreshHistory();
      } catch (_saveFailedError) {
        // abaikan jika IndexedDB penuh/ditolak
      } finally {
        if (failedAiRawUrl) URL.revokeObjectURL(failedAiRawUrl);
      }

      setJobError(errorText);
      setSuggestedInputMode(submitError?.suggestedInputMode || '');
      setJob(statusJob('failed', copy.messages.processFailedShort, 100));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRetryLocalProcessing() {
    const ownerId = session?.user?.id;
    if (!ownerId || isSubmitting) return;
    const record = await loadPendingAiRecovery(ownerId);
    if (!record?.aiRawPngBlob) {
      setHasPendingRecovery(false);
      setJobError(isId ? 'Data hasil AI tersimpan tidak ditemukan.' : 'No saved AI result was found.');
      return;
    }
    setJobError('');
    setSuggestedInputMode('');
    setIsSubmitting(true);
    setJob(statusJob('preprocessing', isId ? 'Memuat ulang hasil AI tersimpan (tanpa panggilan AI).' : 'Reloading saved AI result (no AI call).', 10));
    const recoverySettings = record.settings || settings;
    const sourceBlob = record.sourceRasterBlob || record.sourcePreviewBlob || record.aiRawPngBlob;
    await finalizeLocalJob({
      existingJobId: record.jobId || '',
      alreadyCommittedJobId: record.committedJobId || '',
      sourceFile: new File([sourceBlob], record.sourceFileName || 'gambar-awal.png', { type: sourceBlob.type || 'image/png' }),
      sourcePreviewBlob: record.sourcePreviewBlob || sourceBlob,
      processingFile: new File([record.aiRawPngBlob], 'hasil-ai-mentah.png', { type: record.aiRawPngBlob.type || 'image/png' }),
      retouchLedgerId: record.retouchLedgerId || '',
      aiRedrawMetadata: record.aiRedrawMetadata || null,
      readyTraceMetadata: null,
      aiRawPngBlob: record.aiRawPngBlob,
      traceInputSettings: recoverySettings,
      jobSettings: recoverySettings
    });
  }

  const isBusy = isSubmitting || (job && !['done', 'failed'].includes(job.status));
  const canSubmit = file && !isBusy && file.size <= 10 * 1024 * 1024 && session;
  const sessionEmail = session?.user?.email?.toLowerCase() || '';
  const isWhitelistedSuperadmin = sessionEmail === SUPERUSER_ACCOUNT;
  const profile = balance?.profile;
  const isSuperuser = ['superuser', 'superadmin'].includes(profile?.role) || isWhitelistedSuperadmin;
  const isUnlimited = profile?.is_unlimited ?? isWhitelistedSuperadmin;
  const balanceLabel = isUnlimited ? 'Unlimited' : formatRupiah(balance?.balance || 0);
  const roleLabel = isSuperuser ? copy.labels.roleSuperadmin : copy.labels.roleUser;

  useEffect(() => {
    if (view === 'admin' && session && !isSuperuser) {
      setView('app');
    }
  }, [view, session, isSuperuser]);

  async function handleDeleteLibraryJob(item) {
    if (!item?.canDelete) return;
    const deleteMessage = item.isExample
      ? copy.messages.deleteExampleConfirm
      : copy.messages.deleteHistoryConfirm;
    if (!window.confirm(deleteMessage)) return;
    setDeletingLibraryJobId(item.id || item.jobId || '');
    setHistoryError('');
    setExampleError('');
    try {
      let localWarning = '';
      if (item.isExamplePublic) {
        await deleteCloudJob(item.jobId, session?.access_token);
      } else if (item.jobId && !String(item.jobId).startsWith('pending-') && !String(item.jobId).startsWith('local-') && session?.access_token) {
        try {
          await deleteCloudJob(item.jobId, session.access_token);
        } catch (_error) {
          localWarning = copy.messages.localWarning;
        }
      }

      if (item.localRecordId) {
        await deleteHistoryJob(item.localRecordId);
      }

      await refreshHistory();
      if (item.isExamplePublic) {
        await refreshExampleJobs();
      }
      if (localWarning) {
        setHistoryError(localWarning);
      }
    } catch (error) {
      const message = toUserApiError(error, item.isExamplePublic ? copy.messages.deleteExampleError : copy.messages.deleteHistoryError).message;
      if (item.isExamplePublic) {
        setExampleError(message);
      } else {
        setHistoryError(message);
      }
    } finally {
      setDeletingLibraryJobId('');
    }
  }

  async function handleRetraceLibraryJob(item) {
    if (!item?.localRecordId || retracingLibraryJobId) return;
    const isAiJob = Boolean(item.job?.files?.aiRawPng) || item.inputMode === INPUT_MODE_RETOUCH || item.job?.settings?.inputMode === INPUT_MODE_RETOUCH;
    const sourceUrl = isAiJob ? item.job?.files?.aiRawPng : item.sourceRasterUrl || item.sourcePreviewUrl;
    if (!sourceUrl) return;
    const activeId = item.id || item.jobId || item.localRecordId;
    setRetracingLibraryJobId(activeId);
    setHistoryError('');
    setHistoryNotice(isId ? 'Trace ulang sedang diproses lokal di browser…' : 'Local retrace is running in the browser…');

    try {
      const sourceBlob = await blobFromObjectUrl(
        sourceUrl,
        isId ? (isAiJob ? 'PNG mentah AI tidak tersedia untuk trace ulang.' : 'Gambar sumber tidak tersedia untuk trace ulang.') : isAiJob ? 'The raw AI PNG is not available for retracing.' : 'The source image is unavailable for retracing.'
      );
      const sourcePreviewBlob = item.sourcePreviewUrl
        ? await blobFromObjectUrl(item.sourcePreviewUrl, isId ? 'Preview sumber tidak tersedia.' : 'The source preview is unavailable.')
        : sourceBlob;
      let traceSettings = normalizeLocalTraceSettings({
        ...(item.job.settings || {}),
        inputMode: isAiJob ? INPUT_MODE_RETOUCH : INPUT_MODE_READY
      });
      if (!isAiJob) {
        const analysisFile = new File([sourceBlob], item.sourceFileName || 'gambar-awal.png', { type: sourceBlob.type || 'image/png' });
        let upscaleAnalysis;
        try {
          upscaleAnalysis = await analyzeRasterForUpscale(analysisFile);
        } catch (_analysisError) {
          upscaleAnalysis = { shouldUpscale: false, requestedFactor: 1, reason: 'analysis_failed' };
        }
        traceSettings = normalizeLocalTraceSettings({
          ...traceSettings,
          traceUpscaleEnabled: Boolean(upscaleAnalysis.shouldUpscale),
          traceUpscaleAnalysis: upscaleAnalysis
        });
      }
      const traceFile = new File([sourceBlob], isAiJob ? 'hasil-ai-mentah.png' : item.sourceFileName || 'gambar-awal.png', { type: sourceBlob.type || 'image/png' });
      const requestedFactor = traceSettings.traceUpscaleFactor || 1;
      const retraced = await processImageLocallyWithFallback(traceFile, traceSettings);
      const effectiveFactor = retraced.manifest?.traceUpscaleFactor || 1;
      const updatedAt = new Date().toISOString();
      const wasIncomplete = item.status === 'failed' || item.status === 'pending_trace';
      let committedJobId = item.committedJobId || item.job?.committedJobId || '';
      let remoteJob = item.job?.remoteJob || null;
      let finalPrice = 0;

      const needsServerCommit =
        !committedJobId &&
        (wasIncomplete ||
          (isSuperuser && (!item.jobId || String(item.jobId).startsWith('local-') || String(item.jobId).startsWith('pending-'))));

      if (needsServerCommit && session?.access_token) {
        finalPrice = calculateJobPrice({
          inputMode: isAiJob ? INPUT_MODE_RETOUCH : INPUT_MODE_READY,
          separationFilmCount: retraced.separationFilmCount,
          retouchAlreadyCharged: isAiJob
        });
        const committed = await commitJob(
          {
            inputMode: isAiJob ? INPUT_MODE_RETOUCH : INPUT_MODE_READY,
            productionType: traceSettings.productionType || item.productionType,
            projectName: traceSettings.projectName || item.projectName || 'Project Vector',
            separationFilmCount: retraced.separationFilmCount,
            settings: retraced.settings || traceSettings,
            manifest: {
              ...(item.job.manifest || {}),
              ...(retraced.manifest || {})
            },
            aiLedgerId: item.retouchLedgerId || item.job?.retouchLedgerId || '',
            priceIdr: wasIncomplete ? finalPrice : 0
          },
          session.access_token
        );
        committedJobId = committed.job?.id || '';
        remoteJob = committed.job || null;
      }

      const finalJobId = committedJobId || item.jobId || item.job.jobId;
      const updatedJob = {
        ...item.job,
        ...retraced,
        status: 'done',
        errorMessage: '',
        jobId: finalJobId,
        committedJobId,
        remoteJob,
        createdAt: item.job.createdAt || retraced.createdAt,
        updatedAt,
        priceIdr: wasIncomplete ? (isAiJob ? IMAGE_RETOUCH_PRICE_IDR : 0) + finalPrice : item.job.priceIdr || retraced.priceIdr,
        settings: normalizeLocalTraceSettings({
          ...traceSettings,
          traceUpscaleFactor: effectiveFactor,
          traceUpscaleEnabled: effectiveFactor > 1,
          allowTraceUpscaleOverride: effectiveFactor <= 1
        }),
        files: {
          ...(retraced.files || {}),
          ...(isAiJob ? { aiRawPng: item.job.files.aiRawPng } : {})
        },
        artifactBlobs: {
          ...(retraced.artifactBlobs || {}),
          ...(isAiJob ? { aiRawPng: sourceBlob } : {})
        },
        manifest: {
          ...(item.job.manifest || {}),
          ...(retraced.manifest || {}),
          source: isAiJob ? 'ai_raw_png' : 'source_raster',
          processor: 'browser_local_trace',
          traceEngine: 'processImageLocally',
          requestedTraceUpscaleFactor: requestedFactor,
          effectiveTraceUpscaleFactor: effectiveFactor,
          retracedAt: updatedAt
        }
      };

      const sourceRasterForHistory = !isAiJob
        ? sourceBlob
        : item.sourceRasterUrl
          ? await blobFromObjectUrl(item.sourceRasterUrl, '').catch(() => null)
          : null;

      await saveHistoryJob({
        ownerId: session.user.id,
        ownerEmail: session.user.email || '',
        sourcePreviewBlob,
        sourceRasterBlob: sourceRasterForHistory,
        sourceFileName: item.sourceFileName || 'gambar-awal.png',
        job: updatedJob
      });
      if (item.localRecordId && item.localRecordId !== finalJobId) {
        await deleteHistoryJob(item.localRecordId).catch(() => {});
      }
      if (wasIncomplete) {
        await clearPendingAiRecovery(session.user.id);
        setHasPendingRecovery(false);
        await refreshBalance();
      }
      let retraceExampleSynced = false;
      if (isSuperuser && finalJobId && !String(finalJobId).startsWith('local-') && !String(finalJobId).startsWith('pending-') && session?.access_token) {
        try {
          await uploadAndPublishSuperadminExample({
            targetJobId: finalJobId,
            sourcePreviewBlob,
            sourceFileName: item.sourceFileName || 'gambar-awal.png',
            job: updatedJob
          });
          retraceExampleSynced = true;
        } catch (artifactError) {
          console.error('Failed to upload and publish retraced example artifacts', artifactError);
          setHistoryError(
            toUserApiError(
              artifactError,
              isId
                ? 'Trace ulang selesai, tetapi gagal mempublikasikan contoh ke semua user.'
                : 'Retrace finished, but publishing public example failed.'
            ).message
          );
        }
      }
      await refreshHistory();
      setHistorySelectedKey(updatedJob.jobId);
      setHistoryNotice(
        isId
          ? `Trace ulang selesai pada faktor ${effectiveFactor}×. Seluruh PNG trace, SVG, PDF, ZIP, separasi warna, dan cutline lama sudah diganti.${retraceExampleSynced ? ' Contoh publik untuk user juga sudah diperbarui.' : ''}`
          : `Retrace finished at ${effectiveFactor}×. Every previous traced PNG, SVG, PDF, ZIP, color separation, and cutline was replaced.${retraceExampleSynced ? ' Public user example was also updated.' : ''}`
      );
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : isId ? 'Trace ulang gagal diproses.' : 'Retrace failed.');
      setHistoryNotice('');
    } finally {
      setRetracingLibraryJobId('');
    }
  }

  async function uploadAndPublishSuperadminExample({ targetJobId, sourcePreviewBlob, sourceFileName, job: jobPayload }) {
    if (!isSuperuser || !session?.access_token || !targetJobId) return '';
    const artifactFormData = buildExampleArtifactsFormData({
      sourcePreviewBlob,
      sourceFileName: sourceFileName || 'gambar-awal.png',
      job: jobPayload
    });
    await uploadExampleArtifacts(targetJobId, artifactFormData, session.access_token);
    await setAdminJobExample(targetJobId, session.access_token);
    await refreshExampleJobs(session);
    return targetJobId;
  }

  async function handlePublishHistoryJobAsExample(localItem, existingRemoteJobId = '') {
    if (!isSuperuser || !session?.access_token || !localItem) {
      throw new Error('Hanya superadmin yang dapat mempublish contoh.');
    }
    const hydrated = await hydrateHistoryItemForExampleUpload(localItem);
    const jobSettings = localItem.job?.settings || {};
    const jobManifest = localItem.job?.manifest || {};
    const productionType = localItem.productionType || jobSettings.productionType || 'sticker';
    const inputMode = localItem.inputMode || jobSettings.inputMode || INPUT_MODE_READY;

    let targetJobId = existingRemoteJobId || localItem.committedJobId || '';
    const candidateId = String(localItem.jobId || '');
    if (!targetJobId && candidateId && !candidateId.startsWith('local-') && !candidateId.startsWith('pending-')) {
      targetJobId = candidateId;
    }

    if (!targetJobId) {
      const committed = await commitJob(
        {
          inputMode,
          productionType,
          projectName: localItem.projectName || jobSettings.projectName || 'Project Vector',
          separationFilmCount: hydrated.artifactBlobs.separations.length,
          settings: jobSettings,
          manifest: jobManifest,
          aiLedgerId: localItem.retouchLedgerId || localItem.job?.retouchLedgerId || '',
          priceIdr: 0
        },
        session.access_token
      );
      targetJobId = committed.job?.id || '';
      if (!targetJobId) {
        throw new Error('Gagal mencatat job ke server sebelum publish contoh.');
      }

      const aiRawBlob = localItem.job?.files?.aiRawPng ? await optionalBlobFromUrl(localItem.job.files.aiRawPng) : null;
      const syncedJob = {
        ...localItem.job,
        jobId: targetJobId,
        committedJobId: targetJobId,
        artifactBlobs: {
          ...hydrated.artifactBlobs,
          ...(aiRawBlob ? { aiRawPng: aiRawBlob } : {})
        }
      };
      await saveHistoryJob({
        ownerId: session.user.id,
        ownerEmail: session.user.email || '',
        sourcePreviewBlob: hydrated.sourcePreviewBlob,
        sourceRasterBlob: hydrated.sourceRasterBlob,
        sourceFileName: localItem.sourceFileName || 'gambar-awal.png',
        job: syncedJob
      });
      if (localItem.localRecordId && localItem.localRecordId !== targetJobId) {
        await deleteHistoryJob(localItem.localRecordId).catch(() => {});
      }
    }

    await uploadAndPublishSuperadminExample({
      targetJobId,
      sourcePreviewBlob: hydrated.sourcePreviewBlob,
      sourceFileName: localItem.sourceFileName || 'gambar-awal.png',
      job: {
        ...localItem.job,
        artifactBlobs: hydrated.artifactBlobs
      }
    });
    await refreshHistory();
    return targetJobId;
  }

  async function handlePublishFromLibrary(libraryItem) {
    if (!isSuperuser || !session?.access_token || !libraryItem) return;
    const matchLocal =
      historyJobs.find(
        (entry) =>
          entry.id === (libraryItem.localRecordId || libraryItem.jobId) ||
          entry.jobId === (libraryItem.localRecordId || libraryItem.jobId) ||
          entry.job?.jobId === libraryItem.jobId ||
          (libraryItem.committedJobId && entry.committedJobId === libraryItem.committedJobId)
      ) || null;
    const itemKey = libraryItem.localRecordId || libraryItem.jobId || '';
    setPublishingLibraryJobId(itemKey);
    setHistoryError('');
    setHistoryNotice('');
    try {
      if (matchLocal) {
        await handlePublishHistoryJobAsExample(matchLocal);
      } else if (libraryItem.jobId && !String(libraryItem.jobId).startsWith('local-') && !String(libraryItem.jobId).startsWith('pending-')) {
        await setAdminJobExample(libraryItem.jobId, session.access_token);
        await refreshExampleJobs(session);
      } else {
        throw new Error(isId ? 'Data job lokal tidak ditemukan untuk dipublikasikan.' : 'Local job data was not found for publishing.');
      }
      setHistoryNotice(
        isId
          ? 'Contoh berhasil dipublikasikan dan sekarang terlihat oleh semua user.'
          : 'Example published and now visible to all users.'
      );
    } catch (error) {
      setHistoryError(toUserApiError(error, isId ? 'Gagal mempublikasikan contoh.' : 'Failed to publish example.').message);
    } finally {
      setPublishingLibraryJobId('');
    }
  }

  const currentPathname = normalizePathname(window.location.pathname || '/');
  if (LEGAL_PATHS.has(currentPathname)) {
    if (publicRoute === 'privacy') return <PrivacyPage locale={locale} onNavigate={navigatePublicPath} />;
    if (publicRoute === 'terms') return <TermsPage locale={locale} onNavigate={navigatePublicPath} />;
    if (publicRoute === 'contact') return <ContactPage locale={locale} onNavigate={navigatePublicPath} />;
    if (publicRoute === 'about') return <AboutPage locale={locale} onNavigate={navigatePublicPath} />;
  }

  const recoveryCard =
    hasPendingRecovery && !isBusy ? (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900 shadow-sm">
        <p className="font-semibold">
          {isId ? 'Ada gambar gagal diproses — hasil AI tersimpan di perangkat ini.' : 'A failed job has its AI result saved on this device.'}
        </p>
        <p className="text-xs">
          {isId
            ? 'Proses ulang di browser tanpa memanggil API AI lagi (tidak ada biaya tambahan).'
            : 'Reprocess in the browser without calling the AI API again (no extra charge).'}
        </p>
        <button
          type="button"
          onClick={() => {
            setAppSection('process');
            handleRetryLocalProcessing();
          }}
          className="studio-btn-primary mt-2 !min-h-9 !rounded-xl !px-3.5 !py-2 !text-xs"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{isId ? 'Coba lagi proses lokal' : 'Retry local processing'}</span>
        </button>
      </section>
    ) : null;

  const estimatedCostIdr =
    settings.inputMode === INPUT_MODE_RETOUCH ? IMAGE_RETOUCH_PRICE_IDR : READY_PROCESS_PRICE_IDR;

  return (
    <main className="min-h-screen gradient-bg-subtle">
      {session && (
        <header className="glass-nav">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setView('app');
                  setAppSection('process');
                }}
                className="shrink-0 text-left transition hover:opacity-85"
              >
                <BrandMark compact />
              </button>
              <div className="hidden h-5 w-px bg-line sm:block" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{session?.user?.email}</p>
                <p className="text-[11px] font-medium text-slate-500">{roleLabel}</p>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-line bg-slate-50 px-3 py-1.5 text-xs font-bold text-ink">
                <CreditCard className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                <span>{balanceLabel}</span>
              </div>
              <button
                type="button"
                onClick={refreshBalance}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-line bg-white text-slate-600 transition hover:border-primary/40 hover:text-primary"
                title={copy.labels.refreshBalance}
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <nav className="inline-flex items-center rounded-xl border border-line bg-slate-100/80 p-1">
                {['app', 'billing', 'admin'].map((item) =>
                  item === 'admin' && !isSuperuser ? null : (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setView(item)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition sm:text-sm ${
                        view === item
                          ? 'bg-white text-primary shadow-sm'
                          : 'text-slate-600 hover:text-ink'
                      }`}
                    >
                      {item === 'app' ? copy.labels.viewApp : item === 'billing' ? copy.labels.viewBilling : copy.labels.viewAdmin}
                    </button>
                  )
                )}
              </nav>
              <div className="inline-flex items-center overflow-hidden rounded-xl border border-line bg-slate-100/80 p-1">
                {['id', 'en'].map((nextLocale) => (
                  <button
                    key={nextLocale}
                    type="button"
                    onClick={() => handleLocaleChange(nextLocale)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold uppercase transition ${
                      locale === nextLocale ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-ink'
                    }`}
                  >
                    {nextLocale}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setView('billing')}
                className="studio-btn-primary !min-h-9 !rounded-xl !px-3.5 !py-1.5 !text-xs sm:!text-sm"
              >
                <ShoppingBag className="h-3.5 w-3.5" aria-hidden="true" />
                {copy.labels.topUp}
              </button>
              <button
                type="button"
                onClick={signOut}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-white text-slate-600 transition hover:border-red-300 hover:bg-red-50 hover:text-red-600"
                title={copy.labels.logout}
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
          {balanceError && (
            <div className="mx-auto max-w-6xl px-4 pb-3 sm:px-6">
              <p className="rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-medium text-amber-800">{balanceError}</p>
            </div>
          )}
        </header>
      )}

      {!session && (
        <>
          <LandingPage
            locale={locale}
            onLocaleChange={handleLocaleChange}
            onStart={() => document.getElementById('auth')?.scrollIntoView({ behavior: 'smooth' })}
            authPanel={<AuthPanel locale={locale} onSignedIn={setSession} />}
            onNavigate={navigatePublicPath}
            exampleJobs={exampleJobs}
          />
          {authCallbackError && (
            <div className="mx-auto max-w-6xl px-4 pb-4 sm:px-6">
              <p className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700">
                {authCallbackError}
              </p>
            </div>
          )}
        </>
      )}

      {session && view === 'billing' && (
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
          <BillingPanel
            locale={locale}
            session={session}
            returnState={midtransReturnState}
            onRefreshBalance={refreshBalance}
            onReturnHandled={handleMidtransReturnHandled}
            onAutomaticPaymentSuccess={handleAutomaticPaymentSuccess}
          />
        </div>
      )}

      {session && view === 'admin' && (
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
          <AdminPanel
            session={session}
            enabled={isSuperuser}
            activeTab={adminTab}
            onActiveTabChange={setAdminTab}
            historyJobs={historyJobs}
            onPublishHistoryJobAsExample={handlePublishHistoryJobAsExample}
            onDeleteServerJob={async (jobId) => {
              await deleteCloudJob(jobId, session.access_token);
              await refreshExampleJobs(session);
            }}
            onCreateExampleClick={() => {
              setView('app');
              setAppSection('process');
            }}
            onExampleJobsChanged={() => refreshExampleJobs(session)}
          />
        </div>
      )}

      {session && view === 'app' && (
        <form className="mx-auto grid max-w-6xl gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px]" onSubmit={handleSubmit}>
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white/95 p-2 shadow-card">
              <div className="inline-flex flex-wrap items-center gap-1 rounded-xl bg-slate-100/90 p-1">
                {[
                  { key: 'process', icon: Sparkles },
                  { key: 'history', icon: Archive }
                ].map(({ key, icon: Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setAppSection(key);
                      if (key === 'process') {
                        setHistoryNotice('');
                      } else {
                        setProcessNotice('');
                        setLibraryFilterTab('all');
                      }
                    }}
                    className={`inline-flex min-h-9 items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${
                      appSection === key
                        ? 'bg-white text-primary shadow-sm'
                        : 'text-slate-600 hover:text-ink'
                    }`}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    <span>{key === 'process' ? copy.labels.processSection : copy.labels.historySection}</span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={openExampleResults}
                className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-1.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{copy.labels.examplesSection}</span>
              </button>
            </div>

            {appSection === 'process' ? (
              <>
                {processNotice && (
                  <section className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800 shadow-sm">
                    {processNotice}
                  </section>
                )}
                <UploadBox
                  locale={locale}
                  file={file}
                  previewUrl={previewUrl}
                  inputMode={settings.inputMode}
                  onInputModeChange={(inputMode) => {
                    setFile(null);
                    setJobError('');
                    setSuggestedInputMode('');
                    setSettings((current) => ({
                      ...current,
                      inputMode,
                      makeVector: inputMode === INPUT_MODE_READY ? true : current.makeVector,
                      separateColors:
                        inputMode === INPUT_MODE_READY && current.productionType === 'sablon' ? true : current.separateColors,
                      stickerCutlineEnabled:
                        inputMode === INPUT_MODE_READY && current.productionType === 'sticker' ? true : current.stickerCutlineEnabled
                    }));
                  }}
                  onFileChange={setFile}
                  disabled={isBusy}
                  exampleJobs={exampleJobs}
                />
                {recoveryCard}
                <JobStatus
                  locale={locale}
                  job={job}
                  error={jobError}
                  suggestedInputMode={suggestedInputMode}
                  onUseSuggestedMode={() => {
                    setSettings((current) => ({ ...current, inputMode: INPUT_MODE_RETOUCH }));
                    setJobError('');
                    setSuggestedInputMode('');
                  }}
                  canRetryLocal={hasPendingRecovery}
                  onRetryLocal={handleRetryLocalProcessing}
                  isRetryingLocal={isSubmitting}
                />
                <ResultPreview
                  locale={locale}
                  job={job}
                  sourcePreviewUrl={previewUrl}
                  sourcePreviewLabel={file?.name ? `${copy.labels.sourcePreview}: ${file.name}` : copy.labels.sourcePreview}
                  onDelete={() => setJob(null)}
                  isDeleting={false}
                />
              </>
            ) : (
              <>
                {historyNotice && (
                  <section className="rounded-2xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm font-medium text-ink shadow-sm">
                    {historyNotice}
                  </section>
                )}
                {recoveryCard}
                <JobLibraryPanel
                  locale={locale}
                  historyJobs={historyJobs}
                  exampleJobs={exampleJobs}
                  historyError={historyError}
                  exampleError={exampleError}
                  onDeleteJob={handleDeleteLibraryJob}
                  onRetraceJob={handleRetraceLibraryJob}
                  onPublishExample={isSuperuser ? handlePublishFromLibrary : undefined}
                  retracingJobId={retracingLibraryJobId}
                  deletingJobId={deletingLibraryJobId}
                  publishingJobId={publishingLibraryJobId}
                  currentUserId={session.user.id}
                  isSuperuser={isSuperuser}
                  filterTab={libraryFilterTab}
                  onFilterTabChange={setLibraryFilterTab}
                  selectedKey={historySelectedKey}
                  onSelectedKeyChange={setHistorySelectedKey}
                />
              </>
            )}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            {appSection === 'process' ? (
              <>
                <SettingsPanel locale={locale} settings={settings} inputMode={settings.inputMode} onChange={setSettings} disabled={isBusy} />
                <div className="studio-card space-y-3 p-4">
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <Coins className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                      {isId ? 'Estimasi biaya proses' : 'Estimated cost'}
                    </span>
                    <span className="font-bold text-ink">
                      {isUnlimited ? 'Unlimited' : formatRupiah(estimatedCostIdr)}
                    </span>
                  </div>
                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className="studio-btn-primary min-h-12 w-full text-sm font-bold shadow-md shadow-primary/20"
                  >
                    <Wand2 className="h-4 w-4" aria-hidden="true" />
                    <span>{isBusy ? copy.labels.processingButtonBusy : copy.labels.processingButtonIdle}</span>
                  </button>
                  {!file && (
                    <p className="text-center text-[11px] text-slate-500">
                      {isId ? 'Pilih atau drop file desain terlebih dahulu' : 'Upload a design file first to start'}
                    </p>
                  )}
                </div>
              </>
            ) : (
              <section className="studio-card p-5">
                <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Archive className="h-4 w-4" aria-hidden="true" />
                </div>
                <h2 className="mt-3 text-base font-bold text-ink">{copy.labels.activeHistoryTitle}</h2>
                <p className="mt-1.5 text-sm leading-6 text-slate-600">
                  {copy.labels.activeHistoryBody}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setAppSection('process');
                    setHistoryNotice('');
                  }}
                  className="studio-btn-secondary mt-4 w-full"
                >
                  {copy.labels.backToProcess}
                </button>
              </section>
            )}
          </aside>
        </form>
      )}
    </main>
  );
}
