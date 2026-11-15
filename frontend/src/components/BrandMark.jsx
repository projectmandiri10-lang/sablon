export default function BrandMark({ compact = false, className = '', textClassName = '', iconClassName = '', dark = false }) {
  const wrapperClass = compact ? 'gap-2.5' : 'gap-3';
  const iconSizeClass = compact ? 'h-9 w-9 rounded-xl' : 'h-11 w-11 rounded-2xl';
  const glyphClass = compact ? 'text-sm' : 'text-base';
  const titleClass = compact ? 'text-base sm:text-lg' : 'text-xl';
  const subtitleClass = compact ? 'text-[10px]' : 'text-[11px]';

  return (
    <div className={`flex items-center ${wrapperClass} ${className}`.trim()}>
      <div
        className={`flex ${iconSizeClass} shrink-0 items-center justify-center bg-gradient-to-br from-violet-600 via-primary to-orange-500 shadow-md shadow-primary/20 ring-1 ring-black/5 ${iconClassName}`.trim()}
        aria-hidden="true"
      >
        <span className={`font-extrabold uppercase tracking-tight text-white ${glyphClass}`.trim()}>ER</span>
      </div>
      <div className={`min-w-0 ${textClassName}`.trim()}>
        <div className={`truncate font-extrabold tracking-tight ${dark ? 'text-white' : 'text-slate-900'} ${titleClass}`.trim()}>
          EasyRedesign <span className="gradient-text">Pro</span>
        </div>
        <div
          className={`truncate font-semibold uppercase tracking-[0.16em] ${dark ? 'text-slate-400' : 'text-slate-500'} ${subtitleClass}`.trim()}
        >
          AI Logo &amp; Vector
        </div>
      </div>
    </div>
  );
}
