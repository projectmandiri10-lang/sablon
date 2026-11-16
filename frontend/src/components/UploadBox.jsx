import { CheckCircle2, ChevronDown, Eye, FileImage, Sparkles, UploadCloud, X } from 'lucide-react';
import { useState } from 'react';
import { absoluteUrl } from '../lib/api.js';
import { INPUT_MODE_READY, INPUT_MODE_RETOUCH } from '../lib/modes.js';

const MAX_MB = 15;
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
const DEFAULT_GUIDE_EXAMPLES = [
  {
    id: 'guide-tee-sample',
    title: 'Foto sablon di kaos',
    caption: 'Desain terlihat utuh di kain tanpa banyak silau atau objek menghalangi gambar.',
    src: '/examples/guide-sablon-tee.svg'
  },
  {
    id: 'guide-paper-sample',
    title: 'Foto desain di kertas/meja',
    caption: 'Pencahayaan merata dan gambar tidak terpotong sehingga redraw dan vector lebih presisi.',
    src: '/examples/guide-artwork-paper.svg'
  }
];

function getCopy(locale) {
  const isId = locale !== 'en';
  return {
    stepLabel: isId ? '1. Jenis Input & File' : '1. Input Mode & File',
    heading: isId ? 'Upload gambar langsung pada mode yang sesuai' : 'Upload directly in the matching processing mode',
    subheading: isId
      ? 'Klik atau seret gambar langsung ke kotak AI Redraw atau Pecah Warna & Pola Cutting Sticker.'
      : 'Click or drag your image directly into the AI Redraw or Color Separation & Cutline box.',
    modes: [
      {
        value: INPUT_MODE_RETOUCH,
        title: isId ? 'Foto baju / desain buram' : 'Shirt photo / blurry design',
        badge: isId ? 'AI Redraw · Rp5.000' : 'AI Redraw · Rp5,000',
        description: isId
          ? 'Digambar ulang AI menjadi bersih, rata, dan siap trace.'
          : 'Redrawn cleanly with AI into crisp, flat artwork ready for tracing.',
        costNote: isId
          ? 'Rp5.000 per gambar, sudah termasuk pecah warna'
          : 'Rp5,000 per image, color separation included',
        icon: Sparkles
      },
      {
        value: INPUT_MODE_READY,
        title: isId ? 'Pecah warna dan buat pola cutting sticker' : 'Color separation & sticker cutline pattern',
        badge: isId ? 'Langsung Proses · Rp2.000' : 'Direct Process · Rp2,000',
        description: isId
          ? 'Untuk gambar bersih: langsung pecah warna sablon, buat pola cutting sticker, SVG, dan PDF cetak.'
          : 'For clean artwork: directly separate screen-print colors, generate sticker cutline patterns, SVG, and print PDF.',
        costNote: isId
          ? 'Rp2.000 flat per gambar'
          : 'Rp2,000 flat per image',
        icon: FileImage
      }
    ],
    tipsHeading: isId ? 'Tips foto untuk AI Redraw' : 'Photo tips for AI Redraw',
    tipsSubtitle: isId ? 'Lihat syarat & contoh foto sumber yang baik' : 'See tips & good source photo examples',
    tips: isId
      ? [
        'Foto desain selurus mungkin dari depan, tidak miring berlebihan.',
        'Usahakan cahaya merata tanpa bayangan pekat atau pantulan lampu.',
        'Pastikan seluruh grafik masuk frame dan tidak terpotong.',
        'Hindari kaos terlalu berkerut atau objek menutupi gambar.'
      ]
      : [
        'Take the photo straight-on without extreme perspective tilt.',
        'Use even lighting with no harsh shadows or glossy glare.',
        'Keep the entire graphic inside the frame.',
        'Avoid heavy fabric wrinkles or hands covering the artwork.'
      ],
    goodExamplesTitle: isId ? 'Contoh foto sumber yang baik' : 'Good source photo examples',
    examplesCountLabel: (count) => (isId ? `${count} contoh` : `${count} examples`),
    clickPreview: isId ? 'Perbesar' : 'Zoom',
    dropTitle: isId ? 'Klik atau seret gambar ke sini' : 'Click or drag image here',
    dropSubtitle: isId
      ? 'PNG, JPG, JPEG, atau WebP · Maks. 15 MB'
      : 'PNG, JPG, JPEG, or WebP · Max 15 MB',
    useCurrentFile: isId ? 'Gunakan file terpilih di mode ini' : 'Use selected file in this mode',
    changeFile: isId ? 'Ganti file' : 'Replace file',
    invalidType: isId
      ? 'Format harus PNG, JPG, JPEG, atau WebP.'
      : 'File must be PNG, JPG, JPEG, or WebP.',
    tooLarge: isId
      ? 'Ukuran file terlalu besar. Maksimal 15 MB.'
      : 'File is too large. Maximum size is 15 MB.',
    closePreview: isId ? 'Tutup' : 'Close',
    goodExampleModalLabel: isId ? 'Contoh foto sumber' : 'Good source photo example'
  };
}

function validateFile(file, copy) {
  if (!file) return '';
  const type = (file.type || '').toLowerCase();
  const validExt = /\.(png|jpe?g|webp)$/i.test(file.name);
  if (!ALLOWED_TYPES.has(type) && !validExt) {
    return copy.invalidType;
  }
  if (file.size > MAX_MB * 1024 * 1024) {
    return copy.tooLarge;
  }
  return '';
}

function formatFileSizeMb(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function UploadBox({
  locale = 'id',
  file,
  previewUrl,
  inputMode,
  onInputModeChange,
  onFileChange,
  disabled,
  exampleJobs = []
}) {
  const [error, setError] = useState('');
  const [dragOverMode, setDragOverMode] = useState(null);
  const [selectedGuideExample, setSelectedGuideExample] = useState(null);
  const copy = getCopy(locale);

  const publishedGuideExamples = exampleJobs
    .filter((item) => item?.files?.sourcePreview || item?.files?.tracedPng || item?.files?.fullPng)
    .slice(0, 4)
    .map((item) => ({
      id: item.jobId,
      title: item.projectName || (locale === 'en' ? 'Admin example photo' : 'Contoh foto dari admin'),
      caption:
        locale === 'en'
          ? 'Published example source photo ready for processing.'
          : 'Contoh foto sumber yang dipublish dan siap diproses.',
      src: absoluteUrl(item.files.sourcePreview || item.files.tracedPng || item.files.fullPng)
    }));

  const guideExamples = publishedGuideExamples.length ? publishedGuideExamples : DEFAULT_GUIDE_EXAMPLES;

  function handleFiles(fileList, modeValue) {
    if (modeValue && modeValue !== inputMode) {
      onInputModeChange?.(modeValue);
    }
    const picked = fileList?.[0];
    if (!picked) return;
    const message = validateFile(picked, copy);
    setError(message);
    if (!message) {
      onFileChange(picked);
    }
  }

  return (
    <>
      <section className="studio-card p-5 sm:p-6">
        <div className="mb-4">
          <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-primary">
            {copy.stepLabel}
          </span>
          <h2 className="mt-2 text-lg font-bold tracking-tight text-ink">{copy.heading}</h2>
          <p className="mt-0.5 text-sm text-slate-600">{copy.subheading}</p>
        </div>

        {/* Mode Cards with Embedded Upload */}
        <div className="grid gap-4 sm:grid-cols-2">
          {copy.modes.map((option) => {
            const Icon = option.icon;
            const active = inputMode === option.value;
            const isDraggingOver = dragOverMode === option.value;
            const showFilePreview = active && Boolean(file);
            return (
              <div
                key={option.value}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (!disabled && dragOverMode !== option.value) {
                    setDragOverMode(option.value);
                  }
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) {
                    setDragOverMode((current) => (current === option.value ? null : current));
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragOverMode(null);
                  if (!disabled) {
                    handleFiles(event.dataTransfer.files, option.value);
                  }
                }}
                className={`group relative flex flex-col justify-between rounded-2xl border p-4 transition-all ${isDraggingOver
                  ? 'border-primary bg-primary/[0.06] ring-2 ring-primary/30'
                  : active
                    ? 'border-primary bg-primary/[0.04] ring-2 ring-primary/20'
                    : 'border-line bg-white hover:border-slate-300 hover:bg-slate-50/40'
                  } ${disabled ? 'opacity-75' : ''}`}
              >
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onInputModeChange?.(option.value)}
                  className="w-full text-left focus:outline-none disabled:cursor-not-allowed"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div
                      className={`inline-flex h-9 w-9 items-center justify-center rounded-xl transition ${active ? 'bg-primary text-white shadow-sm' : 'bg-slate-100 text-slate-600 group-hover:bg-slate-200/70'
                        }`}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${active ? 'bg-primary/15 text-primary' : 'bg-slate-100 text-slate-600'
                        }`}
                    >
                      {option.badge}
                    </span>
                  </div>
                  <p className="mt-3 text-sm font-bold text-ink">{option.title}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">{option.description}</p>
                  <p className="mt-2.5 text-[11px] font-semibold text-primary">{option.costNote}</p>
                </button>

                {/* Embedded Upload / Active File Preview */}
                <div className="mt-3 border-t border-line/70 pt-3">
                  <label
                    className={`flex cursor-pointer flex-col justify-center rounded-xl border-2 border-dashed p-3 transition ${showFilePreview
                      ? 'border-primary/40 bg-white hover:border-primary/60'
                      : isDraggingOver
                        ? 'border-primary bg-primary/[0.05]'
                        : active
                          ? 'border-primary/40 bg-white/80 hover:border-primary/60 hover:bg-white'
                          : 'border-slate-300 bg-slate-50/70 hover:border-primary/50 hover:bg-primary/[0.03]'
                      } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
                  >
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                      disabled={disabled}
                      className="sr-only"
                      onClick={() => onInputModeChange?.(option.value)}
                      onChange={(event) => {
                        handleFiles(event.target.files, option.value);
                        event.target.value = '';
                      }}
                    />

                    {showFilePreview ? (
                      <div className="flex items-center gap-3">
                        <div className="checkerboard h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-line p-1">
                          {previewUrl ? (
                            <img src={previewUrl} alt={file.name} className="h-full w-full object-contain" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-slate-400">
                              <FileImage className="h-6 w-6" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                            <span>{option.value === INPUT_MODE_READY ? (locale === 'en' ? 'Color Separation & Cutline' : 'Pecah Warna & Pola Cutting') : 'AI Redraw'}</span>
                          </div>
                          <p className="mt-1 truncate text-xs font-bold text-ink">{file.name}</p>
                          <p className="text-[11px] text-slate-500">{formatFileSizeMb(file.size)}</p>
                        </div>
                        <span className="studio-btn-secondary !min-h-8 shrink-0 !rounded-lg !px-2.5 !py-1 !text-[11px]">
                          {copy.changeFile}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 py-1">
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${active ? 'bg-primary/10 text-primary ring-primary/20' : 'bg-white text-slate-600 ring-line'}`}>
                          <UploadCloud className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <div className="min-w-0 flex-1 text-left">
                          <p className="text-xs font-bold text-ink">{copy.dropTitle}</p>
                          <p className="mt-0.5 text-[11px] text-slate-500">{copy.dropSubtitle}</p>
                        </div>
                      </div>
                    )}
                  </label>

                  {!active && file && (
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onInputModeChange?.(option.value)}
                      className="mt-2 inline-flex w-full items-center justify-center rounded-lg border border-primary/25 bg-primary/[0.04] px-2.5 py-1.5 text-[11px] font-semibold text-primary transition hover:bg-primary/10 disabled:opacity-60"
                    >
                      {copy.useCurrentFile}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Collapsible Tips & Published Examples */}
        {(inputMode === INPUT_MODE_RETOUCH || publishedGuideExamples.length > 0) && (
          <details className="group mt-4 rounded-2xl border border-indigo-100 bg-indigo-50/50">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-indigo-950">
              <div className="flex items-center gap-2.5">
                <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
                <div>
                  <span>{copy.tipsHeading}</span>
                  <span className="ml-2 hidden text-xs font-normal text-indigo-700/80 sm:inline">
                    — {copy.tipsSubtitle}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700 shadow-sm">
                  {copy.examplesCountLabel(guideExamples.length)}
                </span>
                <ChevronDown className="h-4 w-4 text-indigo-600 transition-transform group-open:rotate-180" aria-hidden="true" />
              </div>
            </summary>

            <div className="space-y-4 border-t border-indigo-100 px-4 py-4">
              <ul className="grid gap-1.5 text-xs leading-5 text-slate-700 sm:grid-cols-2">
                {copy.tips.map((tip) => (
                  <li key={tip} className="flex items-start gap-1.5">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>

              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-indigo-900">
                  {copy.goodExamplesTitle}
                </p>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {guideExamples.map((example) => (
                    <button
                      key={example.id}
                      type="button"
                      onClick={() => setSelectedGuideExample(example)}
                      className="flex items-center gap-3 rounded-xl border border-indigo-100 bg-white p-2.5 text-left transition hover:border-primary/40 hover:shadow-sm"
                    >
                      <div className="h-14 w-16 shrink-0 overflow-hidden rounded-lg border border-line bg-slate-50">
                        <img src={example.src} alt={example.title} className="h-full w-full object-cover" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-xs font-bold text-ink">{example.title}</p>
                          <Eye className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-slate-500">{example.caption}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </details>
        )}

        {error && (
          <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-semibold text-red-700">
            {error}
          </p>
        )}
      </section>

      {/* Lightbox Modal for Guide Examples */}
      {selectedGuideExample && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          onClick={() => setSelectedGuideExample(null)}
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-3xl border border-line bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-primary">{copy.goodExampleModalLabel}</p>
                <h3 className="text-base font-bold text-ink">{selectedGuideExample.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedGuideExample(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-line text-slate-600 transition hover:bg-slate-100 hover:text-ink"
                aria-label={copy.closePreview}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="p-5">
              <div className="checkerboard flex max-h-[60vh] items-center justify-center overflow-hidden rounded-2xl border border-line p-4">
                <img
                  src={selectedGuideExample.src}
                  alt={selectedGuideExample.title}
                  className="max-h-[54vh] w-auto object-contain"
                />
              </div>
              <p className="mt-3 text-sm text-slate-600">{selectedGuideExample.caption}</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
