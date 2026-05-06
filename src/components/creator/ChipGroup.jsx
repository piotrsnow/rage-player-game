export default function ChipGroup({ options, value, onChange, showIcons = false, icons = {}, labels = {}, descriptions = {}, disabled = false, disabledOptions = [], name = '', iconOnly = false }) {
  return (
    <div className="flex gap-3 w-full">
      {options.map((id) => {
        const isActive = value === id;
        const isLocked = disabled || disabledOptions.includes(id);
        const hideLabel = iconOnly && showIcons && icons[id] && !isActive;
        return (
          <button
            key={id}
            data-testid={name ? `chip-${name}-${id}` : undefined}
            onClick={() => !isLocked && onChange(id)}
            disabled={isLocked}
            title={hideLabel ? (labels[id] || id) : undefined}
            style={{
              flex: iconOnly && isActive ? '2 1 0%' : '1 1 0%',
              transition: 'flex 300ms ease, background-color 300ms, color 300ms, border-color 300ms, box-shadow 300ms, opacity 300ms',
            }}
            className={`min-w-0 overflow-hidden px-4 py-3 rounded-sm font-label text-sm border ${
              isLocked
                ? isActive
                  ? 'bg-surface-tint/60 text-on-primary/70 border-primary/40 cursor-default'
                  : 'bg-surface-container-high/20 text-on-surface-variant/50 border-outline-variant/20 cursor-default opacity-60'
                : isActive
                  ? 'bg-surface-tint text-on-primary border-primary shadow-[0_0_20px_rgba(197,154,255,0.3)]'
                  : 'bg-surface-container-high/40 text-on-surface-variant border-outline-variant/25 hover:bg-surface-container-high hover:text-tertiary hover:border-primary/20'
            }`}
          >
            <div className="flex items-center justify-center gap-2 whitespace-nowrap">
              {showIcons && icons[id] && (
                <span className="material-symbols-outlined text-lg shrink-0">{icons[id]}</span>
              )}
              {!hideLabel && (
                <div className="text-left overflow-hidden">
                  <div className="font-bold truncate">{labels[id] || id}</div>
                  {descriptions[id] && <div className="text-[10px] opacity-70 mt-0.5 truncate">{descriptions[id]}</div>}
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
