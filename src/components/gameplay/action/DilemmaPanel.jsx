export default function DilemmaPanel({ dilemma, disabled, onChoose }) {
  return (
    <div className="p-3 bg-gradient-to-b from-amber-950/30 to-surface-container-low/40 border border-amber-500/25 rounded-sm space-y-2 animate-fade-in">
      <div className="flex items-center gap-2 mb-1">
        <span className="material-symbols-outlined text-amber-400 text-sm">balance</span>
        <span className="text-xs font-title text-amber-300">{dilemma.title}</span>
      </div>
      {dilemma.stakes && (
        <p className="text-[11px] text-on-surface-variant/70 italic mb-2">{dilemma.stakes}</p>
      )}
      <div className="grid grid-cols-1 gap-1.5">
        {(dilemma.options || []).map((opt, i) => (
          <button
            key={i}
            onClick={() => onChoose(opt.action)}
            disabled={disabled}
            className="w-full text-left px-3 py-2.5 bg-amber-500/5 hover:bg-amber-500/15 border border-amber-500/20 hover:border-amber-500/40 rounded-sm transition-all group disabled:opacity-50"
          >
            <div className="text-xs font-medium text-amber-200 group-hover:text-amber-100">
              {opt.label}
            </div>
            {opt.consequence && (
              <div className="text-[10px] text-on-surface-variant/50 mt-0.5 italic">
                {opt.consequence}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
