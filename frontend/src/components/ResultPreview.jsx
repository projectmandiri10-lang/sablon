import { Archive, Columns2, Download, FileImage, FileText, Layers, Palette, RotateCcw, Scissors, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { absoluteUrl } from '../lib/api.js';
import { INPUT_MODE_READY } from '../lib/modes.js';

function DownloadButton({ href, filename, children, icon: Icon, variant = 'secondary' }) {
  if (!href) return null;
  const variantClass =
    variant === 'primary'
      ? 'studio-btn-primary !min-h-10 !rounded-xl !px-4 !py-2 !text-xs sm:!text-sm'
      : 'studio-btn-secondary !min-h-9 !rounded-xl !px-3 !py-1.5 !text-xs';
  return (
    <a href={absoluteUrl(href)} download={filename || true} className={variantClass}>
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </a>
  );
}

export default function ResultPreview({
  locale = 'id',
  job,
  sourcePreviewUrl = '',
  sourcePreviewLabel = 'Preview gambar awal',
  heading = 'Download hasil',
  subheading = '',
  onDelete,
  onRetrace,
  isRetracing = false,
  isDeleting = false,
  showDelete = true,
  historyView = false
}) {
  const isId = locale === 'id';
  const files = job?.files || {};
  const settings = job?.settings || {};
  const isVectorReadyMode = settings.inputMode === INPUT_MODE_READY;
  const showFullColorDownloads = !(historyView && isVectorReadyMode);
  const showStickerCutlinePreview = historyView && isVectorReadyMode && settings.productionType === 'sticker';
  const showSeparationPreviewTitle = historyView && isVectorReadyMode && settings.productionType === 'sablon';
  const prepressQuality = job?.prepressQuality || job?.manifest?.prepressQuality || null;
  const tracedPng = files.tracedPng || files.fullPng;
  const canRetrace = Boolean((files.aiRawPng || sourcePreviewUrl) && typeof onRetrace === 'function');
  const isAiRetrace = Boolean(files.aiRawPng);
  const isFailedJob = job?.status === 'failed' || job?.status === 'pending_trace';
  const hasAnyDownload = Boolean(files.zip || files.separationZip || files.aiRawPng || tracedPng || files.fullSvg || files.fullPdf || files.stickerCutlineSvg || files.stickerCutlinePdf);

  const printNotice =
    settings.removeBackground && settings.includeBackgroundInFilmSize !== true
      ? isId
        ? `Ukuran cetak: objek utama ${settings.actualWidthCm} cm, background dihilangkan. Kertas ${settings.paperSize} ${settings.paperOrientation === 'landscape' ? 'Landscape' : 'Portrait'}.`
        : `Print size: main object ${settings.actualWidthCm} cm, background removed. Paper ${settings.paperSize} ${settings.paperOrientation === 'landscape' ? 'Landscape' : 'Portrait'}.`
      : settings.separateColors || settings.stickerCutlineEnabled
        ? isId
          ? `Ukuran cetak: lebar ${settings.separateColors && settings.includeBackgroundInFilmSize ? 'termasuk background' : 'area artwork'} ${settings.actualWidthCm} cm, tinggi mengikuti rasio. Kertas ${settings.paperSize} ${settings.paperOrientation === 'landscape' ? 'Landscape' : 'Portrait'}.`
          : `Print size: width ${settings.actualWidthCm} cm for the ${settings.separateColors && settings.includeBackgroundInFilmSize ? 'full background area' : 'artwork area'}, with height following the source ratio. Paper ${settings.paperSize} ${settings.paperOrientation === 'landscape' ? 'Landscape' : 'Portrait'}.`
        : '';

  const previewTabs = [];
  if (!isVectorReadyMode) {
    if (tracedPng) {
      previewTabs.push({
        key: 'traced',
        label: isId ? 'Hasil Trace' : 'Traced PNG',
        src: tracedPng,
        notice: printNotice
      });
    }
    if (files.fullSvg) {
      previewTabs.push({
        key: 'svg',
        label: isId ? 'SVG Full Color' : 'Full-color SVG',
        src: files.fullSvg,
        notice: printNotice
      });
    }
    if (files.aiRawPng) {
      previewTabs.push({
        key: 'ai',
        label: isId ? 'AI Mentah' : 'Raw AI PNG',
        src: files.aiRawPng,
        notice: ''
      });
    }
    if (sourcePreviewUrl) {
      previewTabs.push({
        key: 'source',
        label: isId ? 'Gambar Awal' : 'Source',
        src: sourcePreviewUrl,
        notice: ''
      });
    }
  } else {
    if (showStickerCutlinePreview && files.stickerCutlineSvg) {
      previewTabs.push({
        key: 'cutline',
        label: isId ? 'Cutting Sticker' : 'Sticker Cutline',
        src: files.stickerCutlineSvg,
        notice: isId
          ? `Ukuran cetak: area sticker ${settings.actualWidthCm} cm. Kertas ${settings.paperSize} ${settings.paperOrientation === 'landscape' ? 'Landscape' : 'Portrait'}.`
          : `Print size: sticker area ${settings.actualWidthCm} cm. Paper ${settings.paperSize} ${settings.paperOrientation === 'landscape' ? 'Landscape' : 'Portrait'}.`
      });
    }
    if (!showStickerCutlinePreview && tracedPng) {
      previewTabs.push({
        key: 'traced',
        label: isId ? 'Hasil Trace' : 'Traced Output',
        src: tracedPng,
        notice: printNotice
      });
    }
    if (!showStickerCutlinePreview && files.fullSvg) {
      previewTabs.push({
        key: 'svg',
        label: isId ? 'SVG Vector' : 'Vector SVG',
        src: files.fullSvg,
        notice: printNotice
      });
    }
  }

  const compareLeft = sourcePreviewUrl || files.aiRawPng || '';
  const compareRight = tracedPng || files.fullSvg || '';
  const canCompare = Boolean(compareLeft && compareRight && compareLeft !== compareRight);

  const [activeTab, setActiveTab] = useState(previewTabs[0]?.key || 'traced');

  useEffect(() => {
    if (!previewTabs.some((t) => t.key === activeTab) && activeTab !== 'compare') {
      setActiveTab(previewTabs[0]?.key || 'traced');
    }
  }, [job?.jobId, previewTabs.length]);

  if (!job || job.status !== 'done') return null;

  const currentTab = previewTabs.find((t) => t.key === activeTab) || previewTabs[0] || null;

  return (
    <section className="studio-card p-5 sm:p-6">
      {/* Header & Prepress Badge */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Download className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-ink">{heading}</h2>
            {(subheading || settings.projectName) && (
              <p className="text-xs font-medium text-slate-500">{subheading || settings.projectName}</p>
            )}
          </div>
        </div>

        {prepressQuality && (
          <div
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold ${
              prepressQuality.status === 'ready'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-amber-200 bg-amber-50 text-amber-800'
            }`}
          >
            <span>
              Prepress: {prepressQuality.status === 'ready' ? (isId ? 'Siap cetak' : 'Ready') : isId ? 'Perlu cek' : 'Review'}
            </span>
            <span className="font-mono opacity-80">
              {prepressQuality.dpiEstimate || 0} DPI · {prepressQuality.colorCount || 0} {isId ? 'warna' : 'colors'}
            </span>
          </div>
        )}
      </div>

      {isFailedJob && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-950">
          <p className="text-sm font-bold text-amber-900">
            {isId ? 'Proses lokal sebelumnya belum selesai / gagal' : 'Previous local processing did not complete'}
          </p>
          {job?.errorMessage && <p className="mt-1 leading-5 text-red-700">{job.errorMessage}</p>}
          <p className="mt-1 leading-5 text-amber-800">
            {isAiRetrace
              ? isId
                ? 'Hasil AI sudah tersimpan aman di riwayat perangkat. Klik tombol di bawah untuk memproses ulang tanpa memanggil API AI lagi.'
                : 'Your AI output is safely saved in local history. Click below to retry local processing without calling the AI API again.'
              : isId
                ? 'Gambar sumber tersimpan aman di perangkat. Klik tombol di bawah untuk memproses ulang tanpa biaya AI.'
                : 'Your source image is saved on this device. Click below to reprocess locally.'}
          </p>
          {canRetrace && (
            <button
              type="button"
              onClick={() => onRetrace()}
              disabled={isRetracing}
              className="studio-btn-primary mt-3 !min-h-9 !rounded-xl !px-4 !py-2 !text-xs"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>
                {isRetracing
                  ? isId
                    ? 'Memproses ulang…'
                    : 'Retrying…'
                  : isId
                    ? 'Coba Lagi Proses Lokal (Tanpa Panggil AI)'
                    : 'Retry Local Processing (No AI Call)'}
              </span>
            </button>
          )}
        </div>
      )}

      {prepressQuality?.warnings?.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs text-amber-900">
          <ul className="list-disc space-y-1 pl-4 leading-5">
            {prepressQuality.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Tabbed Preview Stage */}
      {previewTabs.length > 0 && (
        <div className="mt-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-line bg-slate-100/80 p-1">
              {previewTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                    activeTab === tab.key
                      ? 'bg-white text-primary shadow-sm'
                      : 'text-slate-600 hover:text-ink'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
              {canCompare && (
                <button
                  type="button"
                  onClick={() => setActiveTab('compare')}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                    activeTab === 'compare'
                      ? 'bg-white text-primary shadow-sm'
                      : 'text-slate-600 hover:text-ink'
                  }`}
                >
                  <Columns2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{isId ? 'Bandingkan' : 'Compare'}</span>
                </button>
              )}
            </div>
          </div>

          {activeTab === 'compare' && canCompare ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="overflow-hidden rounded-2xl border border-line bg-white">
                <div className="border-b border-line bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-600">
                  {sourcePreviewUrl ? sourcePreviewLabel : isId ? 'AI Mentah' : 'Raw AI'}
                </div>
                <div className="checkerboard flex min-h-64 items-center justify-center p-4">
                  <img className="max-h-72 max-w-full object-contain" src={absoluteUrl(compareLeft)} alt={sourcePreviewLabel} />
                </div>
              </div>
              <div className="overflow-hidden rounded-2xl border border-line bg-white">
                <div className="border-b border-line bg-slate-50 px-3.5 py-2 text-xs font-bold text-primary">
                  {isId ? 'Hasil Akhir Trace' : 'Final Traced Output'}
                </div>
                <div className="checkerboard flex min-h-64 items-center justify-center p-4">
                  <img className="max-h-72 max-w-full object-contain" src={absoluteUrl(compareRight)} alt="Final Traced Output" />
                </div>
              </div>
            </div>
          ) : currentTab ? (
            <div className="overflow-hidden rounded-2xl border border-line bg-white">
              <div className="checkerboard flex min-h-72 items-center justify-center p-4 sm:min-h-80">
                <img
                  className="max-h-96 max-w-full object-contain"
                  src={absoluteUrl(currentTab.src)}
                  alt={currentTab.label}
                />
              </div>
              {currentTab.notice && (
                <p className="border-t border-line bg-slate-50 px-4 py-2.5 text-xs font-medium text-slate-600">
                  {currentTab.notice}
                </p>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* Download Hierarchy */}
      <div className="mt-5 space-y-3 rounded-2xl border border-line bg-slate-50/70 p-4">
        {(files.zip || files.separationZip) && (
          <div className="flex flex-wrap gap-2.5">
            <DownloadButton href={files.zip} icon={Archive} variant="primary">
              {isId ? 'Download ZIP semua file' : 'Download ZIP bundle'}
            </DownloadButton>
            <DownloadButton href={files.separationZip} icon={Layers} variant="primary">
              {isId ? 'Download ZIP Film Sablon' : 'Download screen-print films ZIP'}
            </DownloadButton>
          </div>
        )}

        {hasAnyDownload && (
          <div className="flex flex-wrap gap-2">
            {!isVectorReadyMode && (
              <DownloadButton href={files.aiRawPng} filename="hasil-ai-mentah.png" icon={FileImage}>
                {isId ? 'PNG Mentah AI' : 'Raw AI PNG'}
              </DownloadButton>
            )}
            {showFullColorDownloads && (
              <DownloadButton href={tracedPng} filename="hasil-trace.png" icon={FileImage}>
                {isId ? 'PNG Hasil Trace' : 'Traced PNG'}
              </DownloadButton>
            )}
            {showFullColorDownloads && (
              <DownloadButton href={files.fullSvg} icon={FileText}>
                {isId ? 'SVG full color' : 'Full-color SVG'}
              </DownloadButton>
            )}
            {showFullColorDownloads && (
              <DownloadButton href={files.fullPdf} icon={FileText}>
                {isId ? 'PDF full color' : 'Full-color PDF'}
              </DownloadButton>
            )}
            <DownloadButton href={files.stickerCutlineSvg} icon={Scissors}>
              {isId ? 'SVG sticker cutline' : 'Sticker cutline SVG'}
            </DownloadButton>
            <DownloadButton href={files.stickerCutlinePdf} icon={Scissors}>
              {isId ? 'PDF sticker cutline' : 'Sticker cutline PDF'}
            </DownloadButton>
          </div>
        )}

        {/* Retrace & Delete Toolbar */}
        {(canRetrace || (showDelete && onDelete)) && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
            {canRetrace ? (
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => onRetrace()}
                  disabled={isRetracing}
                  className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-primary/30 bg-white px-3.5 py-1.5 text-xs font-bold text-primary transition hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60"
                  title={isId ? 'Trace ulang satu tahap dari sumber mentah dan ganti semua hasil trace lama' : 'Run one retrace pass from the raw source and replace every previous trace artifact'}
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{isRetracing ? (isId ? 'Memproses trace ulang…' : 'Retracing…') : isAiRetrace ? (isId ? 'Trace Ulang 3,15×' : 'Retrace 3.15×') : isId ? 'Trace Ulang' : 'Retrace'}</span>
                </button>
                <p className="text-[11px] leading-4 text-slate-500">
                  {isId
                    ? `${isAiRetrace ? 'Trace ulang selalu memakai PNG mentah AI' : 'Trace ulang memakai gambar sumber lokal'}. PNG trace, SVG, PDF, ZIP, film separasi, dan cutline lama akan diganti seluruhnya tanpa memanggil AI lagi.`
                    : `${isAiRetrace ? 'Retrace always starts from the raw AI PNG' : 'Retrace uses the local source image'}. It replaces the traced PNG, SVG, PDF, ZIP, separation films, and cutline without calling AI again.`}
                </p>
              </div>
            ) : (
              <div />
            )}

            {showDelete && onDelete && (
              <button
                type="button"
                onClick={onDelete}
                disabled={isDeleting}
                className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-white px-3.5 py-1.5 text-xs font-bold text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{isDeleting ? (isId ? 'Menghapus' : 'Deleting') : isId ? 'Hapus hasil' : 'Delete result'}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Screen-Print Separations List */}
      {files.separations?.length > 0 && (
        <div className="mt-6">
          <div className="mb-3 flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" aria-hidden="true" />
            <h3 className="text-sm font-bold text-ink">
              {showSeparationPreviewTitle
                ? isId ? 'Preview separasi warna' : 'Color separation preview'
                : isId ? 'Daftar film sablon' : 'Screen-print film list'}
            </h3>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
              {files.separations.length}
            </span>
          </div>
          <div className="grid gap-3.5 lg:grid-cols-2">
            {files.separations.map((film) => (
              <div key={film.index} className="studio-subcard p-4">
                <div className="flex items-center gap-3">
                  <span
                    className="h-8 w-8 shrink-0 rounded-xl border border-line shadow-sm"
                    style={{ backgroundColor: film.hex }}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-ink">{film.label}</p>
                    <p className="text-[11px] text-slate-500">
                      {film.kind === 'underbase'
                        ? isId
                          ? `Film dasar hitam 100%${film.chokePx ? `, choke ${film.chokePx}px` : ''}`
                          : `100% black underbase film${film.chokePx ? `, choke ${film.chokePx}px` : ''}`
                        : isId
                          ? `Film hitam 100% dengan registration mark${film.spotName ? ` · ${film.spotName}` : ''}`
                          : `100% black film with registration marks${film.spotName ? ` · ${film.spotName}` : ''}`}
                    </p>
                  </div>
                </div>
                {(film.preview || film.previewPng || film.svg) && (
                  <div className="checkerboard mt-3 flex min-h-48 items-center justify-center rounded-xl border border-line bg-white p-3">
                    <img
                      className="max-h-56 max-w-full object-contain"
                      src={absoluteUrl(film.preview || film.previewPng || film.svg)}
                      alt={`Preview ${film.label}`}
                    />
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <DownloadButton href={film.svg} icon={FileText}>
                    {isId ? 'SVG film' : 'Film SVG'}
                  </DownloadButton>
                  <DownloadButton href={film.pdf} icon={FileText}>
                    {isId ? 'PDF film' : 'Film PDF'}
                  </DownloadButton>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
