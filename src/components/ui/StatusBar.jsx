export default function StatusBar({ label, current, max, color = 'primary' }) {
  const pct = max > 0 ? Math.round((current / max) * 100) : 0;

  const barColors = {
    primary: 'from-primary-dim to-primary shadow-[0_0_8px_rgba(197,154,255,0.5)]',
    error: 'from-error-container to-error-dim',
    tertiary: 'from-on-tertiary-container to-tertiary-dim',
  };

  const textColors = {
    primary: 'text-primary',
    error: 'text-error',
    tertiary: 'text-tertiary-dim',
  };

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">
        <span>{label}</span>
        <span className={textColors[color]}>
          {current}/{max}
        </span>
      </div>
      <div className="h-1 w-full bg-surface-container-highest overflow-hidden rounded-full">
        <div
          className={`h-full bg-gradient-to-r ${barColors[color]} transition-all duration-500 ease-out`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
