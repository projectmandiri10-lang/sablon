import { Archive, Download, FileImage, FileText, Layers, Maximize2, Palette, RotateCcw, Scissors, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { absoluteUrl } from '../lib/api.js';
import { INPUT_MODE_READY } from '../lib/modes.js';

function DownloadButton({ href, filename, children, icon: Icon }) {
  if (!href) return null;
  return (
    <a
      href={absoluteUrl(href)}
      download={filename || true}
      className="inline-flex min-h-10 items-center justify-center gap-2 border border-spruce bg-spruce px-3 py-2 text-sm font-semibold text-white transition hover:bg-primary/90"
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      <span>{children}</span>
    </a>
  );
}

function PreviewImageButton({ src, alt, onOpen, className = 'max-h-80 max-w-full object-contain' }) {
  const resolvedSrc = absoluteUrl(src);
  return (
    <button
      type="button"
      onClick={() => onOpen({ src: resolvedSrc, alt })}
      className="group relative flex h-full w-full items-center justify-center cursor-zoom-in"
      aria-label={`Perbesar ${alt}`}
      title="Klik untuk memperbesar"
    >
      <img className={className} src={resolvedSrc} alt={alt} />
      <span className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center border border-line bg-white/90 text-spruce opacity-0 shadow-sm transition group-hover:opacity-100 group-focus-visible:opacity-100">
        <Maximize2 className="h-4 w-4" aria-hidden="true" />
      </span>
    </button>
  );
}

function PreviewCard({ title, icon: Icon, src, alt, notice, onOpen }) {
  if (!src) return null;

  return (
    <div className="border border-line bg-white">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <Icon className="h-4 w-4 text-spruce" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
      </div>
      {notice && <p className="border-b border-line bg-panel px-3 py-2 text-xs text-gray-700">{notice}</p>}
      <div className="checkerboard flex min-h-72 items-center justify-center p-3">
        <PreviewImageButton src={src} alt={alt} onOpen={onOpen} />
      </div>
    </div>
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
  const [expandedPreview, setExpandedPreview] = useState(null);
  if (!job || job.status !== 'done') return null;
  const isId = locale === 'id';
  const files = job.files || {};
  const settings = job.settings || {};
  const isVectorReadyMode = settings.inputMode === INPUT_MODE_READY;
  const showFullColorDownloads = !(historyView && isVectorReadyMode);
  const showStickerCutlinePreview = historyView && isVectorReadyMode && settings.productionType === 'sticker';
  const showSeparationPreviewTitle = historyView && isVectorReadyMode && settings.productionType === 'sablon';
  const prepressQuality = job.prepressQuality || job.manifest?.prepressQuality || null;
  const tracedPng = files.tracedPng || files.fullPng;
  const canRetrace = Boolean((files.aiRawPng || sourcePreviewUrl) && typeof onRetrace === 'function');
  const isAiRetrace = Boolean(files.aiRawPng);

  return (
    <section className="border border-line bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-center gap-2">
        <Download className="h-5 w-5 text-spruce" aria-hidden="true" />
        <div>
          <h2 className="text-base font-semibold text-ink">{heading}</h2>
          {(subheading || settings.projectName) && <p className="text-xs text-gray-600">{subheading || settings.projectName}</p>}
        </div>
      </div>

      {prepressQuality && (
        <div className="mb-4 border border-line bg-panel px-3 py-2 text-sm text-gray-700">
          <p className="font-semibold text-ink">
            Prepress: {prepressQuality.status === 'ready' ? (isId ? 'siap dicek' : 'ready to review') : isId ? 'perlu review' : 'needs review'} - {prepressQuality.dpiEstimate || 0} DPI, {prepressQuality.colorCount || 0} {isId ? 'warna' : 'colors'}
          </p>
          {prepressQuality.warnings?.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-5">
              {prepressQuality.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!isVectorReadyMode && (
        <div className="grid gap-4 xl:grid-cols-3">
          <PreviewCard title={sourcePreviewLabel} icon={FileImage} src={sourcePreviewUrl} alt={sourcePreviewLabel} onOpen={setExpandedPreview} />
          <PreviewCard
            title={isId ? 'Preview PNG mentah AI' : 'Raw AI PNG preview'}
            icon={FileImage}
            src={files.aiRawPng}
            alt={isId ? 'PNG mentah hasil AI redraw' : 'Raw AI redraw PNG'}
            onOpen={setExpandedPreview}
          />
          <PreviewCard
            title={isId ? 'Preview PNG hasil trace' : 'Traced PNG preview'}
            icon={FileImage}
            src={tracedPng}
            alt={isId ? 'PNG hasil trace browser' : 'Browser traced PNG'}
            onOpen={setExpandedPreview}
            notice={
              settings.removeBackground && settings.includeBackgroundInFilmSize !== true
                ? isId
                  ? `Ukuran cetak: objek utama ${settings.actualWidthCm} cm, background dihilangkan. Kertas ${settings.paperSize} ${settings.paperOrientation === 'landscape' ? 'Landscape' : 'Portrait'}.`
                  : `Print size: main object ${settings.actualWidthCm} cm, background removed. Paper ${settings.paperSize} ${settings.paperOrientation === 'landscape' ? 'Landscape' : 'Portrait'}.`
                : settings.separateColors || settings.stickerCutlineEnabled
                  ? isId
                    ? `Ukuran cetak: lebar ${settings.separateColors && settings.includeBackgroundInFilmSize ? 'termasuk background' : 'area artwork'} ${settings.actualWidthCm} cm, tinggi mengikuti rasio. Kertas ${settings.paperSize} ${settings.paperOrientation === 'landscape' ? 'Landscape' : 'Portrait'}.`
                    : `Print size: width ${settings.actualWidthCm} cm for the ${settings.separateColors && settings.includeBackgroundInFilmSize ? 'full background area' : 'artwork area'}, with height following the source ratio. Paper ${settings.paperSize} ${settings.paperOrientation === 'landscape' ? 'Landscape' : 'Portrait'}.`
                  : ''
            }
          />
          <PreviewCard title={isId ? 'Preview SVG full color' : 'Full-color SVG preview'} icon={FileText} src={files.fullSvg} alt={isId ? 'Preview SVG full color' : 'Full-color SVG preview'} onOpen={setExpandedPreview} />
        </div>
      )}

      {isVectorReadyMode && (
        <>
          <div className="border border-line bg-panel px-3 py-2 text-sm text-gray-700">
            {isId ? 'Mode Vector Siap Proses menampilkan hasil produksi utama agar halaman tetap ringkas.' : 'Production-Ready Vector mode shows the main production output to keep this page compact.'}
          </div>
          {showStickerCutlinePreview && (
            <div className="mt-4 grid gap-4">
              <PreviewCard
                title={isId ? 'Preview cutting sticker' : 'Sticker cutline preview'}
                icon={Scissors}
                src={files.stickerCutlineSvg}
                alt={isId ? 'Preview cutting sticker' : 'Sticker cutline preview'}
                onOpen={setExpandedPreview}
                notice={
                  isId
                    ? `Ukuran cetak: area sticker ${settings.actualWidthCm} cm. Kertas ${settings.paperSize} ${settings.paperOrientation === 'landscape' ? 'Landscape' : 'Portrait'}.`
                    : `Print size: sticker area ${settings.actualWidthCm} cm. Paper ${settings.paperSize} ${settings.paperOrientation === 'landscape' ? 'Landscape' : 'Portrait'}.`
                }
              />
            </div>
          )}
        </>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {canRetrace && (
          <button
            type="button"
            onClick={() => onRetrace()}
            disabled={isRetracing}
            className="inline-flex min-h-10 items-center justify-center gap-2 border border-spruce bg-spruce px-3 py-2 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            title={isId ? 'Trace ulang satu tahap dari sumber mentah dan ganti semua hasil trace lama' : 'Run one retrace pass from the raw source and replace every previous trace artifact'}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            <span>{isRetracing ? (isId ? 'Memproses trace ulang…' : 'Retracing…') : isAiRetrace ? isId ? 'Trace Ulang 3,15×' : 'Retrace 3.15×' : isId ? 'Trace Ulang' : 'Retrace'}</span>
          </button>
        )}
        {!isVectorReadyMode && (
          <DownloadButton href={files.aiRawPng} filename="hasil-ai-mentah.png" icon={FileImage}>
            {isId ? 'Download PNG Mentah AI' : 'Download Raw AI PNG'}
          </DownloadButton>
        )}
        {showFullColorDownloads && (
          <DownloadButton href={tracedPng} filename="hasil-trace.png" icon={FileImage}>
            {isId ? 'Download PNG Hasil Trace' : 'Download Traced PNG'}
          </DownloadButton>
        )}
        {showFullColorDownloads && (
          <DownloadButton href={files.fullSvg} icon={FileText}>
            {isId ? 'Download SVG full color' : 'Download full-color SVG'}
          </DownloadButton>
        )}
        {showFullColorDownloads && (
          <DownloadButton href={files.fullPdf} icon={FileText}>
            {isId ? 'Download PDF full color' : 'Download full-color PDF'}
          </DownloadButton>
        )}
        <DownloadButton href={files.stickerCutlineSvg} icon={Scissors}>
          {isId ? 'Download SVG sticker cutline' : 'Download sticker cutline SVG'}
        </DownloadButton>
        <DownloadButton href={files.stickerCutlinePdf} icon={Scissors}>
          {isId ? 'Download PDF sticker cutline' : 'Download sticker cutline PDF'}
        </DownloadButton>
        <DownloadButton href={files.zip} icon={Archive}>
          {isId ? 'Download ZIP semua file' : 'Download ZIP bundle'}
        </DownloadButton>
        <DownloadButton href={files.separationZip} icon={Layers}>
          {isId ? 'Download ZIP Film Sablon' : 'Download screen-print films ZIP'}
        </DownloadButton>
        {showDelete && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={isDeleting}
            className="inline-flex min-h-10 items-center justify-center gap-2 border border-tomato bg-white px-3 py-2 text-sm font-semibold text-tomato transition hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            <span>{isDeleting ? (isId ? 'Menghapus' : 'Deleting') : isId ? 'Hapus hasil' : 'Delete result'}</span>
          </button>
        )}
      </div>

      {canRetrace && (
        <p className="mt-2 text-xs leading-5 text-gray-600">
          {isId
            ? `${isAiRetrace ? 'Trace ulang selalu memakai PNG mentah AI' : 'Trace ulang memakai gambar sumber lokal'}. PNG trace, SVG, PDF, ZIP, film separasi, dan cutline lama akan diganti seluruhnya tanpa memanggil AI lagi.`
            : `${isAiRetrace ? 'Retrace always starts from the raw AI PNG' : 'Retrace uses the local source image'}. It replaces the traced PNG, SVG, PDF, ZIP, separation films, and cutline without calling AI again.`}
        </p>
      )}

      {files.separations?.length > 0 && (
        <div className="mt-6">
          <div className="mb-3 flex items-center gap-2">
            <Palette className="h-5 w-5 text-spruce" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-ink">{showSeparationPreviewTitle ? (isId ? 'Preview separasi warna' : 'Color separation preview') : isId ? 'Daftar film sablon' : 'Screen-print film list'}</h3>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {files.separations.map((film) => (
              <div key={film.index} className="border border-line bg-panel p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="h-7 w-7 border border-line" style={{ backgroundColor: film.hex }} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{film.label}</p>
                      <p className="text-xs text-gray-600">
                        {film.kind === 'underbase'
                          ? isId
                            ? `Film dasar hitam 100%${film.chokePx ? `, choke ${film.chokePx}px` : ''}`
                            : `100% black underbase film${film.chokePx ? `, choke ${film.chokePx}px` : ''}`
                          : isId
                            ? `Film hitam 100% dengan registration mark${film.spotName ? ` - ${film.spotName}` : ''}`
                            : `100% black film with registration marks${film.spotName ? ` - ${film.spotName}` : ''}`}
                      </p>
                    </div>
                  </div>
                </div>
                {(film.preview || film.previewPng || film.svg) && (
                  <div className="checkerboard mt-3 flex min-h-52 items-center justify-center border border-line bg-white p-3">
                    <PreviewImageButton
                      className="max-h-64 max-w-full object-contain"
                      src={film.preview || film.previewPng || film.svg}
                      alt={`Preview ${film.label}`}
                      onOpen={setExpandedPreview}
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

      {expandedPreview && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-4" role="presentation" onClick={() => setExpandedPreview(null)}>
          <div
            className="relative flex max-h-[94vh] w-full max-w-6xl items-center justify-center border border-white/30 bg-white p-4 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label={expandedPreview.alt}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setExpandedPreview(null)}
              className="absolute right-3 top-3 z-10 inline-flex h-10 w-10 items-center justify-center border border-line bg-white text-ink shadow-sm hover:bg-panel"
              aria-label={isId ? 'Tutup preview besar' : 'Close enlarged preview'}
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
            <div className="checkerboard flex max-h-[88vh] w-full items-center justify-center overflow-auto p-3">
              <img className="max-h-[84vh] max-w-full object-contain" src={expandedPreview.src} alt={expandedPreview.alt} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
