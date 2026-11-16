import { AlertTriangle, Archive, ArrowLeft, Eye, RotateCcw, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { INPUT_MODE_READY, INPUT_MODE_RETOUCH } from '../lib/modes.js';
import ResultPreview from './ResultPreview.jsx';

const productionLabels = {
  sablon: 'Sablon',
  sticker: 'Sticker'
};

const inputModeLabels = {
  [INPUT_MODE_READY]: 'Pecah warna & pola cutting sticker',
  [INPUT_MODE_RETOUCH]: 'Gambar ulang'
};

function ExamplePreview({ label, src }) {
  if (!src) return null;
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <div className="checkerboard flex h-24 items-center justify-center overflow-hidden rounded-xl border border-line bg-white p-2">
        <img className="h-full w-full object-contain" src={src} alt={label} loading="lazy" />
      </div>
    </div>
  );
}

function toSeparationFiles(separations = []) {
  return separations.map((separation) => ({
    index: separation.index,
    kind: separation.kind || 'color',
    hex: separation.hex || '#000000',
    label: separation.label || '',
    svg: separation.svg || '',
    pdf: separation.pdf || '',
    preview: separation.preview || separation.previewPng || separation.svg || ''
  }));
}

function sortTimestamp(value) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function normalizeHistoryItem(item, currentUserId) {
  const job = item.job || {};
  const settings = job.settings || {};
  return {
    id: `history-${item.id}`,
    selectionKey: job.jobId || item.id,
    localRecordId: item.id,
    jobId: job.jobId || item.id,
    projectName: item.projectName || settings.projectName || 'Project Vector',
    productionType: item.productionType || settings.productionType || 'sticker',
    inputMode: item.inputMode || settings.inputMode || INPUT_MODE_READY,
    status: job.status || item.status || 'done',
    errorMessage: job.errorMessage || item.errorMessage || '',
    retouchLedgerId: job.retouchLedgerId || item.retouchLedgerId || '',
    committedJobId: job.committedJobId || item.committedJobId || '',
    createdAt: item.createdAt || job.createdAt || '',
    updatedAt: item.updatedAt || job.updatedAt || item.createdAt || '',
    sourcePreviewUrl: item.sourcePreviewUrl || '',
    sourceRasterUrl: item.sourceRasterUrl || '',
    resultPreviewUrl: job.files?.fullPng || job.files?.aiRawPng || '',
    sourceFileName: item.sourceFileName || '',
    ownerId: currentUserId || '',
    isExample: false,
    isExamplePublic: false,
    canDelete: true,
    job: {
      ...job,
      settings,
      files: {
        ...(job.files || {}),
        separations: toSeparationFiles(job.files?.separations || [])
      }
    }
  };
}

function normalizeExampleItem(item, currentUserId) {
  if (!item || typeof item !== 'object') return null;
  const settings = item.settings || {};
  const projectName = item.projectName || settings.projectName || 'Contoh pekerjaan';
  const productionType = item.productionType || settings.productionType || 'sticker';
  const inputMode = item.inputMode || settings.inputMode || INPUT_MODE_READY;

  return {
    id: `example-${item.jobId}`,
    selectionKey: item.jobId || `example-${productionType}`,
    localRecordId: '',
    jobId: item.jobId || `example-${productionType}`,
    projectName,
    productionType,
    inputMode,
    createdAt: item.createdAt || item.updatedAt || '',
    updatedAt: item.updatedAt || item.createdAt || '',
    sourcePreviewUrl: item.sourcePreviewUrl || '',
    sourceRasterUrl: '',
    resultPreviewUrl: item.resultPreviewUrl || item.files?.fullPng || '',
    sourceFileName: '',
    ownerId: item.ownerId || '',
    isExample: true,
    isExamplePublic: item.isExamplePublic !== false,
    canDelete: Boolean(item.ownerId && currentUserId && item.ownerId === currentUserId),
    job: {
      jobId: item.jobId || `example-${productionType}`,
      status: 'done',
      createdAt: item.createdAt || item.updatedAt || '',
      updatedAt: item.updatedAt || item.createdAt || '',
      settings,
      files: {
        fullPng: item.files?.fullPng || item.resultPreviewUrl || '',
        fullSvg: item.files?.fullSvg || '',
        fullPdf: item.files?.fullPdf || '',
        stickerCutlineSvg: item.files?.stickerCutlineSvg || '',
        stickerCutlinePdf: item.files?.stickerCutlinePdf || '',
        zip: item.files?.zip || '',
        separationZip: item.files?.separationZip || '',
        separations: toSeparationFiles(item.separations || [])
      }
    }
  };
}

function mergeLibraryItems(localItem, exampleItem) {
  const localFiles = localItem.job?.files || {};
  const exampleFiles = exampleItem.job?.files || {};
  const sourcePreviewUrl = localItem.sourcePreviewUrl || exampleItem.sourcePreviewUrl;
  const resultPreviewUrl = exampleItem.resultPreviewUrl || localItem.resultPreviewUrl;

  return {
    ...localItem,
    ...exampleItem,
    id: `merged-${exampleItem.jobId}`,
    selectionKey: exampleItem.jobId || localItem.selectionKey,
    localRecordId: localItem.localRecordId,
    sourcePreviewUrl,
    sourceRasterUrl: localItem.sourceRasterUrl || '',
    resultPreviewUrl,
    sourceFileName: localItem.sourceFileName || '',
    isExample: true,
    isExamplePublic: true,
    canDelete: Boolean(localItem.canDelete || exampleItem.canDelete),
    job: {
      ...localItem.job,
      ...exampleItem.job,
      settings: {
        ...(localItem.job?.settings || {}),
        ...(exampleItem.job?.settings || {})
      },
      files: {
        ...localFiles,
        ...exampleFiles,
        separations: exampleFiles.separations?.length ? exampleFiles.separations : localFiles.separations || []
      }
    }
  };
}

function LibraryCard({
  locale = 'id',
  item,
  isSelected,
  onOpen,
  onDelete,
  onRetry,
  onPublishExample,
  isSuperuser = false,
  isRetrying,
  isDeleting,
  isPublishing
}) {
  const isId = locale === 'id';
  const productionLabel = productionLabels[item.productionType] || item.productionType;
  const inputLabel = inputModeLabels[item.inputMode] || item.inputMode;
  const isFailed = item.status === 'failed' || item.status === 'pending_trace';

  return (
    <article
      className={`studio-subcard flex flex-col justify-between p-4 transition hover:shadow-md ${isSelected ? 'border-primary ring-2 ring-primary/20' : isFailed ? 'border-amber-300 bg-amber-50/40' : ''
        }`}
    >
      <div>
        <div className="flex items-start justify-between gap-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-ink">{item.projectName}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="rounded-md bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-line">
                {productionLabel}
              </span>
              <span className="rounded-md bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500 ring-1 ring-line">
                {inputLabel}
              </span>
              {isFailed && (
                <span className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700 ring-1 ring-red-200">
                  <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                  {isId ? 'Gagal proses lokal' : 'Local render failed'}
                </span>
              )}
              {item.isExample && (
                <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700 ring-1 ring-indigo-200">
                  <Sparkles className="h-3 w-3" aria-hidden="true" />
                  {isId ? 'Contoh' : 'Example'}
                </span>
              )}
            </div>
            {item.updatedAt && (
              <p className="mt-1.5 text-[11px] text-slate-400">
                {new Date(item.updatedAt).toLocaleString(isId ? 'id-ID' : 'en-US')}
              </p>
            )}
          </div>

          {item.canDelete && (
            <button
              type="button"
              onClick={() => onDelete(item)}
              disabled={isDeleting}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              title={
                item.isExample
                  ? isId
                    ? 'Hapus job dan cabut publikasi contoh'
                    : 'Delete and unpublish this example job'
                  : isId
                    ? 'Hapus job'
                    : 'Delete job'
              }
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>

        {isFailed && item.errorMessage && (
          <p className="mt-2 line-clamp-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-[11px] leading-4 text-red-700">
            {item.errorMessage}
          </p>
        )}

        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <ExamplePreview label={isId ? 'Sebelum' : 'Before'} src={item.sourcePreviewUrl} />
          <ExamplePreview
            label={isFailed && item.job?.files?.aiRawPng ? (isId ? 'Hasil AI' : 'AI Result') : isId ? 'Sesudah' : 'After'}
            src={item.resultPreviewUrl || item.job?.files?.fullPng || item.job?.files?.aiRawPng}
          />
        </div>
      </div>

      <div className="mt-3.5 flex flex-col gap-2">
        {isFailed && onRetry && (item.job?.files?.aiRawPng || item.sourceRasterUrl || item.sourcePreviewUrl) && (
          <button
            type="button"
            disabled={isRetrying}
            onClick={() => onRetry(item)}
            className="studio-btn-primary w-full justify-center !min-h-9 !rounded-xl !px-3 !py-1.5 !text-xs"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              {isRetrying
                ? isId
                  ? 'Memproses ulang…'
                  : 'Retrying…'
                : isId
                  ? 'Retry tanpa panggil AI'
                  : 'Retry without AI call'}
            </span>
          </button>
        )}
        {!isFailed && !item.isExample && isSuperuser && typeof onPublishExample === 'function' && (
          <button
            type="button"
            disabled={isPublishing}
            onClick={() => onPublishExample(item)}
            className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              {isPublishing
                ? isId
                  ? 'Mempublikasikan…'
                  : 'Publishing…'
                : isId
                  ? 'Jadikan Contoh User'
                  : 'Publish as User Example'}
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={() => onOpen(item)}
          className={`w-full justify-center !min-h-9 !rounded-xl !px-3 !py-1.5 !text-xs ${
            isSelected ? 'studio-btn-primary' : 'studio-btn-secondary'
          }`}
        >
          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{isSelected ? (isId ? 'Sedang dibuka' : 'Selected') : isId ? 'Lihat detail & download' : 'View & download'}</span>
        </button>
      </div>
    </article>
  );
}

export default function JobLibraryPanel({
  locale = 'id',
  historyJobs,
  exampleJobs,
  historyError = '',
  exampleError = '',
  onDeleteJob,
  onRetraceJob,
  onPublishExample,
  retracingJobId = '',
  deletingJobId = '',
  publishingJobId = '',
  currentUserId = '',
  isSuperuser = false,
  filterTab: controlledFilterTab,
  onFilterTabChange,
  selectedKey: controlledSelectedKey,
  onSelectedKeyChange
}) {
  const isId = locale === 'id';
  const [internalSelectedKey, setInternalSelectedKey] = useState('');
  const [internalFilterTab, setInternalFilterTab] = useState('all');
  const selectedKey = controlledSelectedKey ?? internalSelectedKey;
  const filterTab = controlledFilterTab ?? internalFilterTab;

  function setFilterTab(nextTab) {
    if (typeof onFilterTabChange === 'function') {
      onFilterTabChange(nextTab);
      return;
    }
    setInternalFilterTab(nextTab);
  }

  function setSelectedKey(nextKey) {
    if (typeof onSelectedKeyChange === 'function') {
      onSelectedKeyChange(nextKey);
      return;
    }
    setInternalSelectedKey(nextKey);
  }

  const items = useMemo(() => {
    const localItems = (historyJobs || []).map((item) => normalizeHistoryItem(item, currentUserId));
    const remoteItems = (exampleJobs || []).map((item) => normalizeExampleItem(item, currentUserId)).filter(Boolean);
    const merged = new Map();

    localItems.forEach((item) => {
      merged.set(item.selectionKey, item);
    });

    remoteItems.forEach((item) => {
      const existing = merged.get(item.selectionKey);
      merged.set(item.selectionKey, existing ? mergeLibraryItems(existing, item) : item);
    });

    return [...merged.values()].sort(
      (left, right) => sortTimestamp(right.updatedAt || right.createdAt) - sortTimestamp(left.updatedAt || left.createdAt)
    );
  }, [currentUserId, exampleJobs, historyJobs]);

  const filteredItems = useMemo(() => {
    if (filterTab === 'history') return items.filter((item) => Boolean(item.localRecordId));
    if (filterTab === 'examples') return items.filter((item) => item.isExample);
    return items;
  }, [items, filterTab]);

  const historyCount = useMemo(() => items.filter((item) => Boolean(item.localRecordId)).length, [items]);
  const exampleCount = useMemo(() => items.filter((item) => item.isExample).length, [items]);

  const selectedItem = useMemo(() => items.find((item) => item.selectionKey === selectedKey) || null, [items, selectedKey]);

  useEffect(() => {
    if (selectedKey && !items.some((item) => item.selectionKey === selectedKey)) {
      setSelectedKey('');
    }
  }, [items, selectedKey]);

  return (
    <div className="space-y-5">
      {/* Selected Result Detail pinned at TOP so users don't scroll past cards */}
      {selectedItem && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setSelectedKey('')}
            className="studio-btn-secondary !min-h-9 !rounded-xl !px-3.5 !py-1.5 !text-xs"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{isId ? 'Tutup detail & kembali ke galeri' : 'Close details'}</span>
          </button>
          <ResultPreview
            locale={locale}
            job={selectedItem.job}
            sourcePreviewUrl={selectedItem.sourcePreviewUrl}
            sourcePreviewLabel={
              selectedItem.sourceFileName
                ? `${isId ? 'Preview awal' : 'Original preview'}: ${selectedItem.sourceFileName}`
                : isId
                  ? 'Preview gambar awal'
                  : 'Original image preview'
            }
            heading={
              selectedItem.isExample
                ? isId
                  ? 'Detail contoh pekerjaan'
                  : 'Example job details'
                : isId
                  ? 'Detail riwayat job'
                  : 'Job history details'
            }
            historyView={true}
            subheading={`${productionLabels[selectedItem.productionType] || selectedItem.productionType} · ${inputModeLabels[selectedItem.inputMode] || selectedItem.inputMode}`}
            showDelete={selectedItem.canDelete}
            onDelete={selectedItem.canDelete ? () => onDeleteJob(selectedItem) : undefined}
            onRetrace={selectedItem.localRecordId && onRetraceJob ? (factor) => onRetraceJob(selectedItem, factor) : undefined}
            isRetracing={retracingJobId === selectedItem.id || retracingJobId === selectedItem.jobId}
            isDeleting={deletingJobId === selectedItem.id || deletingJobId === selectedItem.jobId}
          />
        </div>
      )}

      {/* Library Gallery */}
      <section className="studio-card p-5 sm:p-6">
        <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Archive className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-ink">
                {isId ? 'Riwayat job & contoh hasil' : 'Job history & examples'}
              </h2>
              <p className="text-xs text-slate-500">
                {isId
                  ? 'Klik kartu mana saja untuk melihat preview lengkap dan download file.'
                  : 'Select any card to inspect previews and download outputs.'}
              </p>
            </div>
          </div>

          <div className="inline-flex items-center gap-1 rounded-xl border border-line bg-slate-100/80 p-1">
            {[
              { key: 'all', label: isId ? 'Semua' : 'All', count: items.length },
              { key: 'history', label: isId ? 'Riwayat Saya' : 'My History', count: historyCount },
              { key: 'examples', label: isId ? 'Contoh Hasil' : 'Examples', count: exampleCount }
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilterTab(tab.key)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                  filterTab === tab.key ? 'bg-white text-primary shadow-sm' : 'text-slate-600 hover:text-ink'
                }`}
              >
                <span>{tab.label}</span>
                <span className="rounded-full bg-slate-200/70 px-1.5 py-0.2 text-[10px] font-bold text-slate-700">
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {historyError && (
          <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-medium text-amber-800">
            {historyError}
          </p>
        )}
        {exampleError && (
          <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-medium text-amber-800">
            {exampleError}
          </p>
        )}

        {filteredItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-8 text-center text-sm text-slate-500">
            {isId
              ? 'Belum ada riwayat job atau contoh pada tab ini.'
              : 'There are no jobs or examples in this view yet.'}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {filteredItems.map((item) => (
              <LibraryCard
                key={item.id}
                locale={locale}
                item={item}
                isSelected={selectedKey === item.selectionKey}
                onOpen={(nextItem) => setSelectedKey(nextItem.selectionKey)}
                onDelete={onDeleteJob}
                onRetry={onRetraceJob}
                onPublishExample={onPublishExample}
                isSuperuser={isSuperuser}
                isRetrying={retracingJobId === item.id || retracingJobId === item.jobId}
                isDeleting={deletingJobId === item.id || deletingJobId === item.jobId}
                isPublishing={publishingJobId === (item.localRecordId || item.jobId) || publishingJobId === item.jobId}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
