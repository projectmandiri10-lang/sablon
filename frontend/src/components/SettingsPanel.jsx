import { ChevronDown, Shirt, SlidersHorizontal, Sticker } from 'lucide-react';
import { PAPER_SIZE_OPTIONS } from '../lib/localPrint.js';
import { INPUT_MODE_READY } from '../lib/modes.js';

const WIDTH_PRESETS_CM = [8, 10, 20, 28];

function getCopy(locale) {
  const isId = locale !== 'en';
  return {
    stepLabel: isId ? '2. Pengaturan Output' : '2. Output Settings',
    heading: isId ? 'Target & ukuran cetak' : 'Target & print size',
    targetLabel: isId ? 'Jenis produksi' : 'Production target',
    targets: [
      {
        value: 'sablon',
        label: 'Sablon',
        hint: isId ? 'Vector + film pisah warna' : 'Vector + separation films',
        icon: Shirt
      },
      {
        value: 'sticker',
        label: 'Sticker',
        hint: isId ? 'Vector + garis cutline' : 'Vector + contour cutline',
        icon: Sticker
      }
    ],
    widthLabel: isId ? 'Lebar desain aktual (cm)' : 'Actual artwork width (cm)',
    widthHint: isId ? 'Tinggi mengikuti proporsi desain.' : 'Height scales proportionally.',
    removeBgLabel: isId ? 'Hilangkan background' : 'Remove background',
    removeBgHint: isId ? 'Hasil transparan tanpa warna latar.' : 'Outputs transparent background.',
    advancedTitle: isId ? 'Pengaturan Lanjutan' : 'Advanced Settings',
    advancedSubtitle: isId ? 'Vector, film warna, cutline, dan ukuran kertas PDF' : 'Vector, color films, cutline, and PDF paper size',
    makeVectorLabel: isId ? 'Jadikan Vector (SVG/PDF)' : 'Convert to Vector (SVG/PDF)',
    separateColorsLabel: isId ? 'Pecah warna sablon (film per warna)' : 'Color separation (film per color)',
    underbaseLabel: isId ? 'Tambah film white underbase' : 'Include white underbase film',
    includeBgLabel: isId ? 'Ikutkan background di ukuran film' : 'Include background in film size',
    cutlineLabel: isId ? 'Buat garis cutline sticker' : 'Generate sticker cutline',
    cutlineOffsetLabel: isId ? 'Offset cutline (mm)' : 'Cutline offset (mm)',
    paperSizeLabel: isId ? 'Ukuran kertas PDF' : 'PDF paper size',
    paperOrientationLabel: isId ? 'Orientasi kertas' : 'Orientation',
    portraitLabel: 'Portrait',
    landscapeLabel: 'Landscape'
  };
}

function ToggleRow({ label, hint, checked, onChange, disabled }) {
  return (
    <label
      className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-line bg-slate-50/70 px-3.5 py-2.5 transition hover:border-slate-300 ${
        disabled ? 'cursor-not-allowed opacity-60' : ''
      }`}
    >
      <div className="min-w-0">
        <p className="text-xs font-semibold text-ink">{label}</p>
        {hint && <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{hint}</p>}
      </div>
      <span className="relative inline-flex shrink-0 items-center">
        <input
          type="checkbox"
          checked={Boolean(checked)}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          className="peer sr-only"
        />
        <span className="h-5 w-9 rounded-full bg-slate-300 transition peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary/30" />
        <span className="pointer-events-none absolute left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4" />
      </span>
    </label>
  );
}

export default function SettingsPanel({ locale = 'id', settings, inputMode, onChange, disabled }) {
  const copy = getCopy(locale);
  const effectiveReady = inputMode === INPUT_MODE_READY;

  function patchSettings(partial) {
    onChange({
      ...settings,
      ...partial
    });
  }

  function setProductionType(type) {
    patchSettings({
      productionType: type,
      separateColors: type === 'sablon',
      makeVector: type === 'sablon' ? true : settings.makeVector,
      stickerCutlineEnabled: type === 'sticker' ? true : settings.stickerCutlineEnabled
    });
  }

  function setRemoveBackground(value) {
    patchSettings({
      removeBackground: value,
      includeBackgroundInFilmSize: value ? false : settings.includeBackgroundInFilmSize
    });
  }

  function setSeparateColors(value) {
    patchSettings({
      separateColors: value,
      makeVector: value ? true : settings.makeVector
    });
  }

  return (
    <section className="studio-card p-5">
      <div className="mb-4">
        <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-primary">
          {copy.stepLabel}
        </span>
        <h2 className="mt-2 text-base font-bold tracking-tight text-ink">{copy.heading}</h2>
      </div>

      <div className="space-y-4">
        {/* Production Type Segmented Selector */}
        <div>
          <label className="mb-2 block text-xs font-bold text-slate-700">{copy.targetLabel}</label>
          <div className="grid grid-cols-2 gap-2.5">
            {copy.targets.map((target) => {
              const Icon = target.icon;
              const active = settings.productionType === target.value;
              return (
                <button
                  key={target.value}
                  type="button"
                  disabled={disabled}
                  onClick={() => setProductionType(target.value)}
                  className={`flex flex-col items-start rounded-xl border p-3 text-left transition ${
                    active
                      ? 'border-primary bg-primary/[0.05] ring-2 ring-primary/20'
                      : 'border-line bg-white hover:border-slate-300'
                  }`}
                >
                  <div
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${
                      active ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <span className="mt-2 text-xs font-bold text-ink">{target.label}</span>
                  <span className="mt-0.5 text-[11px] leading-4 text-slate-500">{target.hint}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Width cm + Quick Presets */}
        <div>
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="actualWidthCmInput" className="text-xs font-bold text-slate-700">
              {copy.widthLabel}
            </label>
            <span className="text-[11px] text-slate-500">{copy.widthHint}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <input
              id="actualWidthCmInput"
              type="number"
              min="1"
              max="100"
              step="0.5"
              disabled={disabled}
              value={settings.actualWidthCm ?? 10}
              onChange={(event) => patchSettings({ actualWidthCm: event.target.value })}
              className="studio-input w-24 text-center font-mono text-sm font-bold"
            />
            <div className="flex flex-1 flex-wrap gap-1.5">
              {WIDTH_PRESETS_CM.map((cm) => {
                const isSelected = Number(settings.actualWidthCm) === cm;
                return (
                  <button
                    key={cm}
                    type="button"
                    disabled={disabled}
                    onClick={() => patchSettings({ actualWidthCm: cm })}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                      isSelected
                        ? 'border-primary bg-primary text-white'
                        : 'border-line bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-white'
                    }`}
                  >
                    {cm} cm
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Essential Toggle: Remove Background */}
        <ToggleRow
          label={copy.removeBgLabel}
          hint={copy.removeBgHint}
          checked={settings.removeBackground}
          onChange={setRemoveBackground}
          disabled={disabled}
        />

        {/* Advanced Settings Accordion */}
        <details className="group rounded-2xl border border-line bg-white">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-3 text-xs font-bold text-ink">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              <div>
                <span>{copy.advancedTitle}</span>
                <p className="text-[11px] font-normal text-slate-500">{copy.advancedSubtitle}</p>
              </div>
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>

          <div className="space-y-2.5 border-t border-line p-3.5">
            <ToggleRow
              label={copy.makeVectorLabel}
              checked={effectiveReady || settings.makeVector}
              onChange={(value) => patchSettings({ makeVector: value })}
              disabled={disabled || effectiveReady}
            />
            <ToggleRow
              label={copy.separateColorsLabel}
              checked={settings.separateColors}
              onChange={setSeparateColors}
              disabled={disabled}
            />
            {settings.separateColors && (
              <ToggleRow
                label={copy.underbaseLabel}
                checked={settings.createUnderbaseFilm}
                onChange={(value) => patchSettings({ createUnderbaseFilm: value })}
                disabled={disabled}
              />
            )}
            {!settings.removeBackground && (
              <ToggleRow
                label={copy.includeBgLabel}
                checked={settings.includeBackgroundInFilmSize}
                onChange={(value) => patchSettings({ includeBackgroundInFilmSize: value })}
                disabled={disabled}
              />
            )}

            <ToggleRow
              label={copy.cutlineLabel}
              checked={settings.stickerCutlineEnabled}
              onChange={(value) => patchSettings({ stickerCutlineEnabled: value })}
              disabled={disabled}
            />
            {settings.stickerCutlineEnabled && (
              <div className="rounded-xl border border-line bg-slate-50/70 px-3.5 py-2.5">
                <label htmlFor="cutlineOffsetInput" className="block text-xs font-semibold text-ink">
                  {copy.cutlineOffsetLabel}
                </label>
                <input
                  id="cutlineOffsetInput"
                  type="number"
                  min="0"
                  max="20"
                  step="0.5"
                  disabled={disabled}
                  value={settings.stickerCutlineOffsetMm ?? 2}
                  onChange={(event) => patchSettings({ stickerCutlineOffsetMm: event.target.value })}
                  className="studio-input mt-1.5 font-mono text-xs font-semibold"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <div>
                <label htmlFor="paperSizeSelect" className="mb-1 block text-[11px] font-bold text-slate-600">
                  {copy.paperSizeLabel}
                </label>
                <select
                  id="paperSizeSelect"
                  disabled={disabled}
                  value={settings.paperSize || 'A4'}
                  onChange={(event) => patchSettings({ paperSize: event.target.value })}
                  className="studio-input !py-2 text-xs font-semibold"
                >
                  {PAPER_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="paperOrientationSelect" className="mb-1 block text-[11px] font-bold text-slate-600">
                  {copy.paperOrientationLabel}
                </label>
                <select
                  id="paperOrientationSelect"
                  disabled={disabled}
                  value={settings.paperOrientation || 'portrait'}
                  onChange={(event) => patchSettings({ paperOrientation: event.target.value })}
                  className="studio-input !py-2 text-xs font-semibold"
                >
                  <option value="portrait">{copy.portraitLabel}</option>
                  <option value="landscape">{copy.landscapeLabel}</option>
                </select>
              </div>
            </div>
          </div>
        </details>
      </div>
    </section>
  );
}
