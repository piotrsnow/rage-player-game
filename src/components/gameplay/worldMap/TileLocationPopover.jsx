export default function TileLocationPopover({ location, position, onTravel, onViewSublocations, onClose, t }) {
  if (!location) return null;

  const name = location.displayName || location.canonicalName;
  const { x, y } = position;

  return (
    <div
      className="absolute z-50 min-w-[180px] rounded-sm border border-outline-variant/25 bg-surface-container-highest/95 backdrop-blur-md shadow-xl animate-fade-in"
      style={{ left: x, top: y }}
      role="dialog"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-2 border-b border-outline-variant/15">
        <div className="text-[11px] font-bold text-on-surface">{name}</div>
        <div className="text-[9px] font-label uppercase tracking-widest text-on-surface-variant">
          {location.locationType}
          {location.dangerLevel && location.dangerLevel !== 'safe' && (
            <> · <span className={dangerClass(location.dangerLevel)}>{location.dangerLevel}</span></>
          )}
        </div>
      </div>
      {location.description && (
        <div className="px-3 py-2 text-[10px] text-on-surface-variant border-b border-outline-variant/10">
          {location.description}
        </div>
      )}
      <div className="flex flex-col">
        <button
          onClick={() => onTravel(location)}
          className="text-left px-3 py-2 text-[11px] text-on-surface hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-sm">directions_walk</span>
          {t?.('worldState.travelHere') || 'Travel here'}
        </button>
        {onViewSublocations && (
          <button
            onClick={() => onViewSublocations(location)}
            className="text-left px-3 py-2 text-[11px] text-on-surface hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-2 border-t border-outline-variant/10"
          >
            <span className="material-symbols-outlined text-sm">location_city</span>
            {t?.('worldState.viewSublocations') || 'View sublocations'}
          </button>
        )}
        <button
          onClick={onClose}
          className="text-left px-3 py-2 text-[10px] text-outline hover:text-on-surface-variant transition-colors border-t border-outline-variant/10"
        >
          {t?.('common.cancel') || 'Cancel'}
        </button>
      </div>
    </div>
  );
}

function dangerClass(level) {
  if (level === 'moderate') return 'text-yellow-400';
  if (level === 'dangerous') return 'text-orange-400';
  if (level === 'deadly') return 'text-red-400';
  return 'text-on-surface-variant';
}
