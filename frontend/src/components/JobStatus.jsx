import { AlertTriangle, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { INPUT_MODE_RETOUCH } from '../lib/modes.js';

function getCopy(locale) {
  const isId = locale !== 'en';
  return {
    errorTitle: isId ? 'Proses gagal dijalankan' : 'Processing could not be completed',
    suggestedCta: isId
      ? 'Ulangi dengan mode AI Redraw (Rp5.000)'
      : 'Retry with AI Redraw mode (Rp5,000)',
    suggestedHint: isId
      ? 'Gambar tampak memiliki gradien/foto kompleks. Mode AI Redraw membantu merapikan sebelum vector.'
      : 'This image looks like a complex photo/gradient. AI Redraw cleans it up before tracing.',
    progressTitle: isId ? 'Status Proses' : 'Processing Status',
    steps: isId
      ? ['Menyiapkan', 'AI / Vector', 'Ekspor & Film']
      : ['Prepare', 'AI / Vector', 'Export & Films'],
    labels: {
      uploaded: isId ? 'File diterima' : 'File uploaded',
      preprocessing: isId ? 'Menyiapkan gambar...' : 'Preparing image...',
      processing_ai: isId ? 'Menggambar ulang dengan AI...' : 'Redrawing with AI...',
      processing_image: isId ? 'Memproses gambar di browser...' : 'Processing image locally...',
      vectorizing: isId ? 'Mengonversi ke SVG vector...' : 'Tracing vector paths...',
      separating_colors: isId ? 'Memisahkan film warna...' : 'Separating color films...',
      exporting: isId ? 'Menyiapkan file download & ZIP...' : 'Building downloadable files & ZIP...',
      done: isId ? 'Selesai — file siap diunduh' : 'Done — files ready to download',
      failed: isId ? 'Proses gagal' : 'Process failed'
    }
  };
}

function resolveActiveStep(status) {
  if (status === 'done') return 3;
  if (status === 'separating_colors' || status === 'exporting') return 2;
  if (status === 'processing_ai' || status === 'processing_image' || status === 'vectorizing') return 1;
  return 0;
}

export default function JobStatus({
  locale = 'id',
  job,
  error,
  suggestedInputMode,
  onUseSuggestedMode
}) {
  if (!job && !error) return null;

  const copy = getCopy(locale);
  const status = job?.status || (error ? 'failed' : 'preprocessing');
  const isDone = status === 'done';
  const isFailed = Boolean(error) || status === 'failed';
  const progress = Math.min(100, Math.max(0, Number(job?.progress ?? (isDone ? 100 : 12))));
  const activeStep = resolveActiveStep(status);
  const statusText = job?.message || copy.labels[status] || copy.progressTitle;

  return (
    <section
      className={`studio-card p-5 ${
        isFailed ? 'border-red-200 bg-red-50/40' : isDone ? 'border-emerald-200 bg-emerald-50/30' : ''
      }`}
    >
      {error ? (
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-red-900">{copy.errorTitle}</h3>
              <p className="mt-1 text-sm leading-6 text-red-700">{error}</p>
            </div>
          </div>

          {suggestedInputMode === INPUT_MODE_RETOUCH && onUseSuggestedMode && (
            <div className="rounded-xl border border-indigo-200 bg-white p-3.5 shadow-sm">
              <p className="text-xs leading-5 text-slate-600">{copy.suggestedHint}</p>
              <button
                type="button"
                onClick={onUseSuggestedMode}
                className="studio-btn-primary mt-2.5 !min-h-9 !rounded-xl !px-3.5 !py-2 !text-xs"
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{copy.suggestedCta}</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div
                className={`inline-flex h-8 w-8 items-center justify-center rounded-xl ${
                  isDone ? 'bg-emerald-100 text-emerald-700' : 'bg-primary/10 text-primary'
                }`}
              >
                {isDone ? (
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                )}
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{copy.progressTitle}</p>
                <p className="text-sm font-bold text-ink">{statusText}</p>
              </div>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-mono text-xs font-bold text-ink">
              {Math.round(progress)}%
            </span>
          </div>

          {/* Step pills */}
          <div className="grid grid-cols-3 gap-2">
            {copy.steps.map((stepLabel, idx) => {
              const completed = isDone || activeStep > idx;
              const current = !isDone && activeStep === idx;
              return (
                <div
                  key={stepLabel}
                  className={`rounded-xl border px-3 py-2 text-center text-[11px] font-bold transition ${
                    completed
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : current
                        ? 'border-primary/30 bg-primary/10 text-primary'
                        : 'border-line bg-slate-50 text-slate-400'
                  }`}
                >
                  {idx + 1}. {stepLabel}
                </div>
              );
            })}
          </div>

          {/* Progress Bar */}
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                isDone ? 'bg-emerald-500' : 'bg-gradient-to-r from-primary to-indigo-500'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </section>
  );
}
