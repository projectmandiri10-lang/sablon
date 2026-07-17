import { CreditCard, LogOut, RefreshCw, ShoppingBag, Wand2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import AdminPanel from './components/AdminPanel.jsx';
import AuthPanel from './components/AuthPanel.jsx';
import BillingPanel from './components/BillingPanel.jsx';
import JobLibraryPanel from './components/JobLibraryPanel.jsx';
import JobStatus from './components/JobStatus.jsx';
import LandingPage, { AboutPage, ContactPage, PrivacyPage, TermsPage } from './components/LandingPage.jsx';
import ResultPreview from './components/ResultPreview.jsx';
import SettingsPanel from './components/SettingsPanel.jsx';
import UploadBox from './components/UploadBox.jsx';
import { commitJob, deleteCloudJob, getAppConfig, getBalance, listExampleJobs, quoteJob, requestImageRetouch, toUserApiError, uploadExampleArtifacts } from './lib/api.js';
import { createNormalizedImagePreviewBlob, prepareAiRedrawInput } from './lib/imagePreview.js';
import { deleteHistoryJob, loadHistoryJobs, releaseHistoryJobs, saveHistoryJob } from './lib/localHistoryStore.js';
import { parseMidtransReturnParams, stripMidtransReturnParams } from './lib/billingPanelState.js';
import { loadStoredLocale, localeTag, resolveInitialLocale, saveStoredLocale } from './lib/locale.js';
import { processImageLocally } from './lib/localProcessor.js';
import { INPUT_MODE_READY, INPUT_MODE_RETOUCH } from './lib/modes.js';
import { IMAGE_RETOUCH_PRICE_IDR, calculateJobPrice, formatRupiah } from './lib/pricing.js';
import { isSupabaseConfigured, supabase } from './lib/supabase.js';

const SUPERUSER_ACCOUNT = ['jho.j80@gm', 'a', 'il.com'].join('');
const FALLBACK_SESSION_STORAGE_KEY = 'easyredesignpro.supabaseFallbackSession';
const LEGACY_FALLBACK_SESSION_STORAGE_KEY = 'designmudahfree.supabaseFallbackSession';
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
  return isId ? 'EasyRedesign Pro - Redesign AI Logo & Vector Siap Proses' : 'EasyRedesign Pro - AI Logo Redesign and Production-Ready Vector';
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
    ? 'EasyRedesign Pro membantu mengubah foto logo menjadi hasil redesign AI dan vector siap proses untuk sablon atau sticker.'
    : 'EasyRedesign Pro turns logo photos into cleaner AI redraws and production-ready vectors for screen printing or stickers.';
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
  colorLimitMode: 'auto',
  maxColors: 4,
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
      processingReadyTrace: isId ? 'Menjalankan Vector Siap Proses langsung di browser.' : 'Running Production-Ready Vector directly in the browser.',
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

function buildExampleArtifactsFormData({ sourcePreviewBlob, sourceFileName, job }) {
  const artifacts = job.artifactBlobs || {};
  const formData = new FormData();

  appendFileIfPresent(formData, 'sourcePreview', sourcePreviewBlob, 'source-preview.png');
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
    appendFileIfPresent(formData, 'separationPreview', separation.previewBlob, `film-${slug}-preview.png`);
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

function decodeBase64UrlJson(value) {
  if (!value) return null;
  try {
    const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const decoded = window.atob(padded);
    const bytes = Uint8Array.from(decoded, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

function buildFallbackSession(accessToken, refreshToken, params) {
  const claims = decodeBase64UrlJson(accessToken.split('.')[1]);
  if (!claims?.sub) return null;

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = Number(params.get('expires_at') || claims.exp || now + Number(params.get('expires_in') || 3600));
  if (expiresAt <= now) return null;

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: params.get('token_type') || 'bearer',
    expires_at: expiresAt,
    expires_in: Math.max(0, expiresAt - now),
    user: {
      id: claims.sub,
      aud: claims.aud || 'authenticated',
      role: claims.role || 'authenticated',
      email: claims.email || '',
      phone: claims.phone || '',
      app_metadata: claims.app_metadata || {},
      user_metadata: claims.user_metadata || {},
      created_at: claims.iat ? new Date(claims.iat * 1000).toISOString() : '',
      updated_at: ''
    }
  };
}

function saveFallbackSession(session) {
  try {
    window.localStorage.setItem(FALLBACK_SESSION_STORAGE_KEY, JSON.stringify(session));
    window.localStorage.removeItem(LEGACY_FALLBACK_SESSION_STORAGE_KEY);
  } catch {
    // Browser storage can be unavailable in hardened/private profiles.
  }
}

function loadFallbackSession() {
  try {
    const raw = window.localStorage.getItem(FALLBACK_SESSION_STORAGE_KEY) || window.localStorage.getItem(LEGACY_FALLBACK_SESSION_STORAGE_KEY);
    const session = raw ? JSON.parse(raw) : null;
    if (!session?.access_token || !session?.user?.id) return null;
    if (session.expires_at && session.expires_at <= Math.floor(Date.now() / 1000)) {
      window.localStorage.removeItem(FALLBACK_SESSION_STORAGE_KEY);
      window.localStorage.removeItem(LEGACY_FALLBACK_SESSION_STORAGE_KEY);
      return null;
    }
    if (!window.localStorage.getItem(FALLBACK_SESSION_STORAGE_KEY)) {
      window.localStorage.setItem(FALLBACK_SESSION_STORAGE_KEY, JSON.stringify(session));
      window.localStorage.removeItem(LEGACY_FALLBACK_SESSION_STORAGE_KEY);
    }
    return session;
  } catch {
    return null;
  }
}

function clearFallbackSession() {
  try {
    window.localStorage.removeItem(FALLBACK_SESSION_STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_FALLBACK_SESSION_STORAGE_KEY);
  } catch {
    // Browser storage can be unavailable in hardened/private profiles.
  }
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
  const [previewUrl, setPreviewUrl] = useState('');
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
    if (!isSupabaseConfigured) return undefined;
    let isMounted = true;

    async function bootstrapAuth() {
      try {
        const { hashParams, queryParams } = getAuthCallbackParams();
        const callbackError =
          hashParams.get('error_description') ||
          queryParams.get('error_description') ||
          hashParams.get('error') ||
          queryParams.get('error');
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');

        if (callbackError) {
          if (isMounted) setAuthCallbackError(callbackError);
          cleanAuthCallbackUrl();
          return;
        }

        if (accessToken && refreshToken) {
          const fallbackSession = buildFallbackSession(accessToken, refreshToken, hashParams);
          let result;
          try {
            result = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken
            });
          } catch (error) {
            cleanAuthCallbackUrl();
            if (!isMounted) return;
            if (fallbackSession) {
              saveFallbackSession(fallbackSession);
              setAuthCallbackError('');
              setSession(fallbackSession);
              restoreDashboardStateFromUrl();
              return;
            }
            throw error;
          }
          const { data, error } = result;
          cleanAuthCallbackUrl();
          if (!isMounted) return;
          if (error) {
            if (fallbackSession) {
              saveFallbackSession(fallbackSession);
              setAuthCallbackError('');
              setSession(fallbackSession);
              restoreDashboardStateFromUrl();
              return;
            }
            setAuthCallbackError(error.message || copy.messages.oauthCallbackError);
            return;
          }
          setAuthCallbackError('');
          clearFallbackSession();
          setSession(data.session || null);
          if (data.session) restoreDashboardStateFromUrl();
          return;
        }

        const { data, error } = await supabase.auth.getSession();
        if (!isMounted) return;
        const fallbackSession = loadFallbackSession();
        if (error) {
          if (!fallbackSession) setAuthCallbackError(error.message || 'Session login tidak bisa dibaca.');
        } else {
          setAuthCallbackError('');
        }
        const nextSession = data.session || fallbackSession;
        setSession(nextSession || null);
        if (nextSession) restoreDashboardStateFromUrl();
      } catch (error) {
        cleanAuthCallbackUrl();
        if (isMounted) {
          const fallbackSession = loadFallbackSession();
          if (fallbackSession) {
            setAuthCallbackError('');
            setSession(fallbackSession);
            restoreDashboardStateFromUrl();
          } else {
            setAuthCallbackError(error instanceof Error ? error.message : copy.messages.oauthCallbackError);
          }
        }
      }
    }

    bootstrapAuth();
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (nextSession) {
        clearFallbackSession();
        setSession(nextSession);
        setAuthCallbackError('');
        restoreDashboardStateFromUrl();
      } else if (event === 'SIGNED_OUT') {
        clearFallbackSession();
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
    if (!activeSession?.access_token) {
      setExampleJobs([]);
      setExampleError('');
      return;
    }

    try {
      setExampleError('');
      const data = await listExampleJobs(activeSession.access_token);
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
    if (view !== 'app') return;
    refreshExampleJobs(session);
  }, [session?.access_token, session?.user?.id, view]);

  useEffect(() => {
    return () => {
      releaseHistoryJobs(historyJobsRef.current);
      historyJobsRef.current = [];
    };
  }, []);

  async function signOut() {
    if (supabase) await supabase.auth.signOut();
    clearFallbackSession();
    window.history.replaceState({}, document.title, window.location.pathname || '/');
    setSession(null);
    setBalance(null);
    setJob(null);
    setAppSection('process');
    setAdminTab('overview');
    setHistorySelectedKey('');
    setHistoryNotice('');
    setView('app');
    replaceHistoryJobs([]);
    setHistoryError('');
    setExampleJobs([]);
    setExampleError('');
    setDeletingLibraryJobId('');
  }

  function openExampleResults() {
    setAppSection('history');
    setHistoryNotice('');
    const firstExampleJobId = exampleJobs.find((item) => item?.jobId)?.jobId || '';
    if (firstExampleJobId) setHistorySelectedKey(firstExampleJobId);
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
      if (settings.inputMode === INPUT_MODE_RETOUCH) {
        preparedAiInput = await prepareAiRedrawInput(file);
      }
      await ensureCanRun(settings.separateColors ? 1 : 0);
      let processingFile = file;
      let retouchLedgerId = '';
      let aiRedrawMetadata = null;
      let readyTraceMetadata = null;
      let aiRawPngBlob = null;

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
      } else {
        setJob(statusJob('processing_image', copy.messages.processingReadyTrace, 30));
        readyTraceMetadata = {
          processor: 'browser_local_trace',
          vectorEngine: 'canvas_boundary_trace',
          noRemoteGeneration: true
        };
      }

      setJob(
        statusJob(
          'vectorizing',
          copy.messages.usingBrowserVector,
          60
        )
      );
      const tracedResult = await processImageLocally(processingFile, settings);
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
        readyTrace: readyTraceMetadata || localResult.manifest?.readyTrace || null
      };
      const finalPrice = calculateJobPrice({
        inputMode: settings.inputMode,
        separationFilmCount: localResult.separationFilmCount,
        retouchAlreadyCharged: settings.inputMode === INPUT_MODE_RETOUCH
      });

      setJob(statusJob('exporting', copy.messages.commitJob, 88));
      const committed = await commitJob(
        {
          inputMode: settings.inputMode,
          productionType: settings.productionType,
          projectName: settings.projectName || 'Project Vector',
          separationFilmCount: localResult.separationFilmCount,
          settings,
          manifest,
          aiLedgerId: retouchLedgerId,
          priceIdr: finalPrice
        },
        session.access_token
      );

      const completedJob = {
        ...localResult,
        manifest,
        jobId: committed.job?.id || localResult.jobId,
        priceIdr: (settings.inputMode === INPUT_MODE_RETOUCH ? IMAGE_RETOUCH_PRICE_IDR : 0) + finalPrice,
        remoteJob: committed.job
      };

      setJob(completedJob);

      try {
        await saveHistoryJob({
          ownerId: session.user.id,
          ownerEmail: session.user.email || '',
          sourcePreviewBlob,
          sourceFileName: file.name,
          job: completedJob
        });
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
        try {
          const artifactFormData = buildExampleArtifactsFormData({
            sourcePreviewBlob,
            sourceFileName: file.name,
            job: completedJob
          });
          await uploadExampleArtifacts(committed.job.id, artifactFormData, session.access_token);
        } catch (artifactError) {
          console.error('Failed to upload example artifacts', artifactError);
        }
      }

      await refreshBalance();
    } catch (submitError) {
      const userError = toUserApiError(submitError, copy.messages.processFailed);
      setJobError(userError.message);
      setSuggestedInputMode(submitError?.suggestedInputMode || '');
      setJob(statusJob('failed', copy.messages.processFailedShort, 100));
    } finally {
      setIsSubmitting(false);
    }
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
      } else if (item.jobId && session?.access_token) {
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

  const currentPathname = normalizePathname(window.location.pathname || '/');
  if (LEGAL_PATHS.has(currentPathname)) {
    if (publicRoute === 'privacy') return <PrivacyPage locale={locale} onNavigate={navigatePublicPath} />;
    if (publicRoute === 'terms') return <TermsPage locale={locale} onNavigate={navigatePublicPath} />;
    if (publicRoute === 'contact') return <ContactPage locale={locale} onNavigate={navigatePublicPath} />;
    if (publicRoute === 'about') return <AboutPage locale={locale} onNavigate={navigatePublicPath} />;
  }

  return (
    <main className="min-h-screen gradient-bg-subtle">
      {session && (
        <div className="glass-nav">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{session?.user?.email}</p>
                <p className="text-xs text-gray-600">{roleLabel}</p>
              </div>
              <div className="inline-flex items-center gap-2 border border-line bg-white px-3 py-2 text-sm font-semibold text-ink">
                <CreditCard className="h-4 w-4 text-spruce" aria-hidden="true" />
                <span>{balanceLabel}</span>
              </div>
              <button
                type="button"
                onClick={refreshBalance}
                className="inline-flex h-9 w-9 items-center justify-center border border-line bg-white text-gray-700 hover:border-spruce hover:text-spruce"
                title={copy.labels.refreshBalance}
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <nav className="flex flex-wrap gap-2">
                {['app', 'billing', 'admin'].map((item) =>
                  item === 'admin' && !isSuperuser ? null : (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setView(item)}
                      className={`border px-3 py-2 text-sm font-semibold ${view === item ? 'border-spruce bg-spruce text-white' : 'border-line bg-white text-ink'}`}
                    >
                      {item === 'app' ? copy.labels.viewApp : item === 'billing' ? copy.labels.viewBilling : copy.labels.viewAdmin}
                    </button>
                  )
                )}
              </nav>
              <div className="inline-flex items-center overflow-hidden rounded-md border border-line bg-white">
                {['id', 'en'].map((nextLocale) => (
                  <button
                    key={nextLocale}
                    type="button"
                    onClick={() => handleLocaleChange(nextLocale)}
                    className={`px-3 py-2 text-xs font-semibold uppercase ${locale === nextLocale ? 'bg-spruce text-white' : 'text-ink hover:bg-panel'}`}
                  >
                    {nextLocale}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setView('billing')}
                className="inline-flex min-h-10 items-center gap-2 border border-spruce bg-spruce px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90"
              >
                <ShoppingBag className="h-4 w-4" aria-hidden="true" />
                {copy.labels.topUp}
              </button>
              <button
                type="button"
                onClick={signOut}
                className="inline-flex h-10 w-10 items-center justify-center border border-line bg-white text-gray-700 hover:border-tomato hover:text-tomato"
                title={copy.labels.logout}
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
          {balanceError && (
            <div className="mx-auto max-w-6xl px-4 pb-4 sm:px-6">
              <p className="border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">{balanceError}</p>
            </div>
          )}
        </div>
      )}

      {!session && (
        <>
          <LandingPage
            locale={locale}
            onLocaleChange={handleLocaleChange}
            onStart={() => document.getElementById('auth')?.scrollIntoView({ behavior: 'smooth' })}
            authPanel={<AuthPanel locale={locale} onSignedIn={setSession} />}
            onNavigate={navigatePublicPath}
          />
          {authCallbackError && (
            <div className="mx-auto max-w-6xl px-4 pb-4 sm:px-6">
              <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                {authCallbackError}
              </p>
            </div>
          )}
        </>
      )}

      {session && view === 'billing' && (
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
          <BillingPanel locale={locale} session={session} returnState={midtransReturnState} onRefreshBalance={refreshBalance} onReturnHandled={handleMidtransReturnHandled} />
        </div>
      )}

      {session && view === 'admin' && (
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
          <AdminPanel session={session} enabled={isSuperuser} activeTab={adminTab} onActiveTabChange={setAdminTab} />
        </div>
      )}

      {session && view === 'app' && (
        <form className="mx-auto grid max-w-6xl gap-4 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px]" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <section className="border border-line bg-white p-4 shadow-sm sm:p-5">
              <div className="flex flex-wrap gap-2">
                {[ 
                  { key: 'process' },
                  { key: 'history' }
                ].map((section) => (
                  <button
                    key={section.key}
                    type="button"
                    onClick={() => {
                      setAppSection(section.key);
                      if (section.key === 'process') {
                        setHistoryNotice('');
                      }
                    }}
                    className={`inline-flex min-h-10 items-center justify-center border px-3 py-2 text-sm font-semibold transition ${
                      appSection === section.key ? 'border-spruce bg-spruce text-white' : 'border-line bg-white text-ink hover:border-spruce'
                    }`}
                  >
                    {section.key === 'process' ? copy.labels.processSection : copy.labels.historySection}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={openExampleResults}
                  className="inline-flex min-h-10 items-center justify-center border border-chart-3 bg-chart-3 px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90"
                >
                  {copy.labels.examplesSection}
                </button>
              </div>
              <p className="mt-3 text-xs text-gray-600">
                {isId
                  ? 'Tombol Contoh hasil membuka galeri yang menggabungkan riwayat Anda dengan contoh job superadmin yang dipublish.'
                  : 'The Example results button opens the gallery that merges your history with published superadmin example jobs.'}
              </p>
            </section>

            {appSection === 'process' ? (
              <>
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
                />
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
                  <section className="border border-spruce bg-primary/5 px-4 py-3 text-sm text-ink shadow-sm">
                    {historyNotice}
                  </section>
                )}
                <JobLibraryPanel
                  locale={locale}
                  historyJobs={historyJobs}
                  exampleJobs={exampleJobs}
                  historyError={historyError}
                  exampleError={exampleError}
                  onDeleteJob={handleDeleteLibraryJob}
                  deletingJobId={deletingLibraryJobId}
                  currentUserId={session.user.id}
                  selectedKey={historySelectedKey}
                  onSelectedKeyChange={setHistorySelectedKey}
                />
              </>
            )}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-5 lg:self-start">
            {appSection === 'process' ? (
              <>
                <SettingsPanel locale={locale} settings={settings} inputMode={settings.inputMode} onChange={setSettings} disabled={isBusy} />
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="inline-flex min-h-12 w-full items-center justify-center gap-2 border border-spruce bg-spruce px-4 py-3 text-sm font-bold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:border-gray-300 disabled:bg-gray-300 disabled:text-gray-600"
                >
                  <Wand2 className="h-5 w-5" aria-hidden="true" />
                  <span>{isBusy ? copy.labels.processingButtonBusy : copy.labels.processingButtonIdle}</span>
                </button>
              </>
            ) : (
              <section className="border border-line bg-white p-4 shadow-sm sm:p-5">
                <h2 className="text-base font-semibold text-ink">{copy.labels.activeHistoryTitle}</h2>
                <p className="mt-2 text-sm leading-6 text-gray-600">
                  {copy.labels.activeHistoryBody}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setAppSection('process');
                    setHistoryNotice('');
                  }}
                  className="mt-4 inline-flex min-h-10 w-full items-center justify-center border border-spruce bg-white px-3 py-2 text-sm font-semibold text-spruce transition hover:bg-primary/5"
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
