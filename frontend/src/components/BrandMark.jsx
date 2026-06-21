export default function BrandMark({ compact = false, className = '', textClassName = '', iconClassName = '' }) {
  const wrapperClass = compact ? 'gap-2' : 'gap-3';
  const iconSizeClass = compact ? 'h-9 w-9 rounded-xl' : 'h-11 w-11 rounded-2xl';
  const glyphClass = compact ? 'text-base' : 'text-lg';
  const titleClass = compact ? 'text-lg' : 'text-xl';
  const subtitleClass = compact ? 'text-[11px]' : 'text-xs';

  return (
    <div className={`flex items-center ${wrapperClass} ${className}`.trim()}>
      <div
        className={`flex ${iconSizeClass} items-center justify-center bg-gradient-to-br from-orange-400 via-orange-500 to-orange-700 shadow-lg shadow-orange-500/20 ${iconClassName}`.trim()}
        aria-hidden="true"
      >
        <span className={`font-black uppercase tracking-tight text-orange-50 ${glyphClass}`.trim()}>ER</span>
      </div>
      <div className={`min-w-0 ${textClassName}`.trim()}>
        <div className={`gradient-text truncate font-bold tracking-tight ${titleClass}`.trim()}>EasyRedesign Pro</div>
        <div className={`truncate font-medium uppercase tracking-[0.18em] text-mutedForeground/80 ${subtitleClass}`.trim()}>
          Redesign AI Logo
        </div>
      </div>
    </div>
  );
}
