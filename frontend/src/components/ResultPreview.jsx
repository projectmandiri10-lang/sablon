import { Archive, Download, FileImage, FileText, Layers, Palette, Scissors, Trash2 } from 'lucide-react';
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

function PreviewCard({ title, icon: Icon, src, alt, notice }) {
  if (!src) return null;

  return (
    <div className="border border-line bg-white">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <Icon className="h-4 w-4 text-spruce" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
      </div>
      {notice && <p className="border-b border-line bg-panel px-3 py-2 text-xs text-gray-700">{notice}</p>}
      <div className="checkerboard flex min-h-72 items-center justify-center p-3">
        <img className="max-h-80 max-w-full object-contain" src={absoluteUrl(src)} alt={alt} />
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
  isDeleting = false,
  showDelete = true,
  historyView = false
}) {
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
          <PreviewCard title={sourcePreviewLabel} icon={FileImage} src={sourcePreviewUrl} alt={sourcePreviewLabel} />
          <PreviewCard
            title={isId ? 'Preview PNG mentah AI' : 'Raw AI PNG preview'}
            icon={FileImage}
            src={files.aiRawPng}
            alt={isId ? 'PNG mentah hasil AI redraw' : 'Raw AI redraw PNG'}
          />
          <PreviewCard
            title={isId ? 'Preview PNG hasil trace' : 'Traced PNG preview'}
            icon={FileImage}
            src={tracedPng}
            alt={isId ? 'PNG hasil trace Worker' : 'Worker traced PNG'}
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
          <PreviewCard title={isId ? 'Preview SVG full color' : 'Full-color SVG preview'} icon={FileText} src={files.fullSvg} alt={isId ? 'Preview SVG full color' : 'Full-color SVG preview'} />
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
                    <img
                      className="max-h-64 max-w-full object-contain"
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
