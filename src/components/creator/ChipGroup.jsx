export default function ChipGroup({ options, value, onChange, showIcons = false, icons = {}, labels = {}, descriptions = {}, disabled = false, name = '' }) {
  return (
    <div className="flex flex-wrap gap-3">
      {options.map((id) => {
        const isActive = value === id;
        return (
          <button
            key={id}
            data-testid={name ? `chip-${name}-${id}` : undefined}
            onClick={() => !disabled && onChange(id)}
            disabled={disabled}
            className={`px-4 py-3 rounded-sm font-label text-sm transition-all duration-300 border ${
              disabled
                ? isActive
                  ? 'bg-surface-tint/60 text-on-primary/70 border-primary/40 cursor-default'
                  : 'bg-surface-container-high/20 text-on-surface-variant/40 border-outline-variant/10 cursor-default'
                : isActive
                  ? 'bg-surface-tint text-on-primary border-primary shadow-[0_0_20px_rgba(197,154,255,0.3)]'
                  : 'bg-surface-container-high/40 text-on-surface-variant border-outline-variant/15 hover:bg-surface-container-high hover:text-tertiary hover:border-primary/20'
            }`}
          >
            <div className="flex items-center gap-2">
              {showIcons && icons[id] && (
                <span className="material-symbols-outlined text-lg">{icons[id]}</span>
              )}
              <div className="text-left">
                <div className="font-bold">{labels[id] || id}</div>
                {descriptions[id] && <div className="text-[10px] opacity-70 mt-0.5">{descriptions[id]}</div>}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
