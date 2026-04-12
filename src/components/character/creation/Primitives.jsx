export function SectionHeader({ icon, label, onRandomize }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-primary text-lg">{icon}</span>
        <h3 className="text-xs text-on-surface-variant font-label uppercase tracking-widest">{label}</h3>
      </div>
      {onRandomize && (
        <button
          type="button"
          onClick={onRandomize}
          className="flex items-center gap-1 px-2 py-1 text-xs font-label text-tertiary hover:text-primary transition-colors rounded-sm hover:bg-surface-tint/10"
          title={label}
        >
          <span className="material-symbols-outlined text-sm">casino</span>
        </button>
      )}
    </div>
  );
}

export function PointBuyRow({ label, shortLabel, baseValue, added, speciesMod, finalValue, pointCost, onIncrement, onDecrement, canIncrement, canDecrement }) {
  return (
    <div className="flex items-center gap-2 p-2 bg-surface-container-high/40 border border-outline-variant/10 rounded-sm">
      <div className="flex flex-col min-w-[70px]">
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-on-surface-variant uppercase tracking-wider font-label">{shortLabel}</span>
          {pointCost > 1 && (
            <span className="text-[9px] px-1 py-0.5 bg-amber-500/15 text-amber-400 rounded-sm font-label">×{pointCost}</span>
          )}
        </div>
        <span className="text-[10px] text-outline truncate">{label}</span>
      </div>
      <div className="flex items-center gap-1 ml-auto">
        <button
          type="button"
          onClick={onDecrement}
          disabled={!canDecrement}
          className="w-6 h-6 flex items-center justify-center rounded-sm border border-outline-variant/20 text-on-surface-variant hover:text-primary hover:border-primary/30 disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-sm font-bold"
        >
          −
        </button>
        <div className="flex items-center gap-0.5 min-w-[80px] justify-center">
          <span className="text-xs text-on-surface-variant tabular-nums">{baseValue + added}</span>
          {speciesMod !== 0 && (
            <span className={`text-[10px] tabular-nums ${speciesMod > 0 ? 'text-green-400' : 'text-red-400'}`}>
              {speciesMod > 0 ? '+' : ''}{speciesMod}
            </span>
          )}
          <span className="text-xs text-outline mx-0.5">=</span>
          <span className="text-lg font-headline text-tertiary tabular-nums">{finalValue}</span>
        </div>
        <button
          type="button"
          onClick={onIncrement}
          disabled={!canIncrement}
          className="w-6 h-6 flex items-center justify-center rounded-sm border border-outline-variant/20 text-on-surface-variant hover:text-primary hover:border-primary/30 disabled:opacity-20 disabled:cursor-not-allowed transition-colors text-sm font-bold"
        >
          +
        </button>
      </div>
    </div>
  );
}
